import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MESHY_API_KEY = Deno.env.get("MESHY_API_KEY");
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let build_id: string | undefined;
  let model_type = "exterior";

  try {
    const body = await req.json();
    build_id = body.build_id;
    const { prompt, asset_type } = body;
    model_type = body.model_type || "exterior";

    console.log(`[generate-3d-model] START | Build: ${build_id} | Type: ${model_type}`);

    if (!MESHY_API_KEY) throw new Error("MESHY_API_KEY is not set in Supabase secrets");
    if (!build_id) throw new Error("build_id is required");

    // === 1. Fetch reference images (latest first, max 4) ===
    const { data: media, error: mediaError } = await supabase
      .from('media')
      .select('url, created_at')
      .eq('build_id', build_id)
      .order('created_at', { ascending: false })
      .limit(4);

    if (mediaError) {
      console.warn("[generate-3d-model] Media query warning:", mediaError.message);
    }

    const referenceImages: string[] = media?.map(m => m.url).filter(Boolean) || [];
    console.log(`[generate-3d-model] Found ${referenceImages.length} reference images`);

    // === 2. Set initial status to processing ===
    const initialUpdate: any = {
      [`${model_type}_model_status`]: "processing",
      [`${model_type}_model_provider`]: "meshy",
    };

    await supabase.from("builds").update(initialUpdate).eq("id", build_id);

    // === 3. Call Meshy (prefer Multi-Image when photos exist) ===
    let taskId: string;
    let meshyEndpoint: string;
    let meshyBody: any;

    const basePrompt = prompt || "detailed architectural building";

    if (referenceImages.length > 0) {
      // === BEST PATH: Use photos (Multi-Image to 3D) ===
      meshyEndpoint = "https://api.meshy.ai/openapi/v1/multi-image-to-3d";
      meshyBody = {
        image_urls: referenceImages,
        should_texture: true,
        enable_pbr: true,
        target_formats: ["glb"],
        ai_model: "meshy-6",
      };
      console.log("[generate-3d-model] Using Multi-Image to 3D");
    } else {
      // === Fallback: Text to 3D ===
      meshyEndpoint = "https://api.meshy.ai/openapi/v2/text-to-3d";
      const enhancedPrompt = model_type === "exterior"
        ? `Detailed realistic exterior of ${basePrompt}, architectural visualization, photorealistic facade, PBR materials`
        : `Highly detailed realistic interior of ${basePrompt}, high ceilings, natural lighting, walkable space`;

      meshyBody = {
        mode: "preview",
        prompt: enhancedPrompt,
        ai_model: "meshy-6",
        art_style: "realistic",
        should_remesh: true,
      };
      console.log("[generate-3d-model] Using Text to 3D (no images)");
    }

    const meshyRes = await fetch(meshyEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(meshyBody),
    });

    const meshyData = await meshyRes.json();

    if (!meshyRes.ok || !meshyData.result) {
      throw new Error(`Meshy API error: ${JSON.stringify(meshyData)}`);
    }

    taskId = meshyData.result;
    console.log(`[generate-3d-model] Meshy task created: ${taskId}`);

    // === 4. Update DB with task ID ===
    const finalUpdate = {
      [`${model_type}_model_status`]: "processing",
      [`${model_type}_model_task_id`]: taskId,
      [`${model_type}_model_provider`]: "meshy",
    };

    const { error: updateError } = await supabase
      .from("builds")
      .update(finalUpdate)
      .eq("id", build_id);

    if (updateError) {
      console.error("[generate-3d-model] DB update error:", updateError);
      throw new Error(`Failed to update builds: ${updateError.message}`);
    }

    console.log(`[generate-3d-model] SUCCESS | Task ID saved`);

    return new Response(JSON.stringify({
      success: true,
      task_id: taskId,
      model_type,
      used_images: referenceImages.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[generate-3d-model] ERROR:", error.message);

    // === Always try to mark as failed ===
    if (build_id) {
      try {
        await supabase.from("builds").update({
          [`${model_type}_model_status`]: "failed",
        }).eq("id", build_id);
      } catch (dbErr) {
        console.error("Failed to set failed status:", dbErr);
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});