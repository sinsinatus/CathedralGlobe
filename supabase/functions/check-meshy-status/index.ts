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
    if (!build_id) throw new Error("build_id required");

    const { data: build } = await supabase
      .from("builds")
      .select("model_task_id, model_status, model_url")
      .eq("id", build_id)
      .single();

    if (!build) throw new Error("Build not found");

    if (build.model_status === "completed" || build.model_status === "failed") {
      return new Response(JSON.stringify({ success: true, status: build.model_status, model_url: build.model_url }), { headers: corsHeaders });
    }

    if (!build.model_task_id) {
      return new Response(JSON.stringify({ success: false, error: "No task_id found" }), { headers: corsHeaders });
    }

    const statusRes = await fetch(`https://api.meshy.ai/openapi/v2/text-to-3d/${build.model_task_id}`, {
      headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
    });

    const task = await statusRes.json();
    const rawStatus = (task.status || "").toUpperCase();

    let newStatus = "processing";
    let modelUrl = build.model_url;

    if (rawStatus === "SUCCEEDED" && task.model_urls?.glb) {
      newStatus = "completed";
      try {
        const glbRes = await fetch(task.model_urls.glb);
        const glbBlob = await glbRes.blob();
        const fileName = `${build_id}.glb`;

        await supabase.storage.from("models").upload(fileName, glbBlob, {
          contentType: "model/gltf-binary",
          upsert: true,
        });

        const { data } = supabase.storage.from("models").getPublicUrl(fileName);
        modelUrl = data.publicUrl;
      } catch (e) {
        modelUrl = task.model_urls.glb;
      }
    } else if (rawStatus === "FAILED" || rawStatus === "CANCELED") {
      newStatus = "failed";
    }

    await supabase.from("builds").update({
      model_status: newStatus,
      model_url: modelUrl,
    }).eq("id", build_id);

    return new Response(JSON.stringify({ success: true, status: newStatus, model_url: modelUrl }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("[check-meshy-status] Error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});