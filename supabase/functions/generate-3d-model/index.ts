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

  try {
    const { build_id, prompt, asset_type, re_generate = false } = await req.json();

    if (!MESHY_API_KEY) throw new Error("MESHY_API_KEY is not set");
    if (!build_id) throw new Error("build_id required");

    // Fetch ALL media attached to this build (new photos/videos become reference images)
    const { data: media } = await supabase
      .from('media')
      .select('url')
      .eq('build_id', build_id)
      .order('created_at', { ascending: true });

    const referenceImages = media?.map(m => m.url) || [];

    let basePrompt = prompt || "modern residential building";

    const qualityBoosters = `
      ultra realistic, photorealistic digital twin, architectural visualization, 
      PBR materials, physically based rendering, clean topology, game-ready, 
      natural indoor lighting, soft shadows, realistic scale, sharp details, 8k quality, 
      highly detailed interior with visible rooms and furniture
    `.trim();

    let enhancedPrompt = "";

    switch (asset_type?.toLowerCase()) {
      case 'house':
        enhancedPrompt = `Modern residential interior and exterior of ${basePrompt}. Detailed open floor plan, clearly visible multiple rooms, realistic furniture, natural light through windows, photorealistic digital twin`;
        break;
      case 'car':
        enhancedPrompt = `Realistic ${basePrompt} vehicle with detailed interior and exterior`;
        break;
      case 'factory':
      case 'warehouse':
        enhancedPrompt = `Industrial ${basePrompt} with detailed interior machinery and structure`;
        break;
      default:
        enhancedPrompt = basePrompt;
    }

    const finalPrompt = `${enhancedPrompt}, ${qualityBoosters}`.replace(/\s+/g, ' ');

    console.log(`[generate-3d-model] Build ${build_id} | Re-generate: ${re_generate} | Reference images: ${referenceImages.length}`);

    const body: any = {
      mode: "preview",
      prompt: finalPrompt,
      ai_model: "meshy-6",
      art_style: "realistic",
      should_remesh: true,
      model_type: "standard",
    };

    // Use uploaded media as reference images (this is what makes re-generation powerful)
    if (referenceImages.length > 0) {
      body.texture_image_url = referenceImages[0];
      if (referenceImages.length > 1) {
        body.reference_image_urls = referenceImages.slice(1);
      }
    }

    const response = await fetch("https://api.meshy.ai/openapi/v2/text-to-3d", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Meshy API error ${response.status}: ${JSON.stringify(data)}`);
    }

    const taskId = data?.result;
    if (!taskId) throw new Error("Meshy did not return a task ID");

    await supabase.from("builds").update({
      model_status: "processing",
      model_task_id: taskId,
      model_provider: "meshy",
    }).eq("id", build_id);

    return new Response(JSON.stringify({ success: true, task_id: taskId, re_generate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[generate-3d-model] Error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});