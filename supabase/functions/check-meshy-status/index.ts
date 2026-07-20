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
    const { build_id } = await req.json();

    if (!MESHY_API_KEY) throw new Error("MESHY_API_KEY is not set");
    if (!build_id) throw new Error("build_id is required");

    const { data: build, error } = await supabase
      .from("builds")
      .select("*")
      .eq("id", build_id)
      .single();

    if (error || !build) throw new Error("Build not found");

    const updates: any = {};

    // ==================== EXTERIOR ====================
    if (build.exterior_model_task_id && build.exterior_model_status === "processing") {
      const res = await fetch(
        `https://api.meshy.ai/openapi/v2/text-to-3d/${build.exterior_model_task_id}`,
        { headers: { Authorization: `Bearer ${MESHY_API_KEY}` } }
      );
      const task = await res.json();

      if (task.status === "SUCCEEDED" && task.model_urls?.glb) {
        // Download from Meshy and upload to Supabase
        const glbResponse = await fetch(task.model_urls.glb);
        const glbBlob = await glbResponse.blob();

        const fileName = `exterior_${build_id}_${Date.now()}.glb`;
        const { error: uploadError } = await supabase.storage
          .from("models")
          .upload(fileName, glbBlob, { contentType: "model/gltf-binary" });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("models").getPublicUrl(fileName);

        updates.exterior_model_url = urlData.publicUrl;
        updates.exterior_model_status = "completed";
      } else if (task.status === "FAILED") {
        updates.exterior_model_status = "failed";
      }
    }

    // ==================== INTERIOR ====================
    if (build.interior_model_task_id && build.interior_model_status === "processing") {
      const res = await fetch(
        `https://api.meshy.ai/openapi/v2/text-to-3d/${build.interior_model_task_id}`,
        { headers: { Authorization: `Bearer ${MESHY_API_KEY}` } }
      );
      const task = await res.json();

      if (task.status === "SUCCEEDED" && task.model_urls?.glb) {
        const glbResponse = await fetch(task.model_urls.glb);
        const glbBlob = await glbResponse.blob();

        const fileName = `interior_${build_id}_${Date.now()}.glb`;
        const { error: uploadError } = await supabase.storage
          .from("models")
          .upload(fileName, glbBlob, { contentType: "model/gltf-binary" });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("models").getPublicUrl(fileName);

        updates.interior_model_url = urlData.publicUrl;
        updates.interior_model_status = "completed";
      } else if (task.status === "FAILED") {
        updates.interior_model_status = "failed";
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await supabase.from("builds").update(updates).eq("id", build_id);
    }

    // Return latest data
    const { data: updatedBuild } = await supabase
      .from("builds")
      .select("*")
      .eq("id", build_id)
      .single();

    return new Response(JSON.stringify({ success: true, build: updatedBuild }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[check-meshy-status] Error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});