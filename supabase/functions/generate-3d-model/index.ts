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
    const { build_id, prompt } = await req.json();

    if (!MESHY_API_KEY) throw new Error("MESHY_API_KEY is not set");
    if (!build_id || !prompt) throw new Error("build_id and prompt required");

    console.log(`[generate-3d-model] Starting for build ${build_id}`);

    const response = await fetch("https://api.meshy.ai/openapi/v2/text-to-3d", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "preview",           // ← This is the correct required value
        prompt: prompt,
        art_style: "realistic",
        should_remesh: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[generate-3d-model] Meshy API Error:", data);
      throw new Error(`Meshy API error ${response.status}: ${JSON.stringify(data)}`);
    }

    const taskId = data?.result;
    if (!taskId) throw new Error("Meshy did not return a task ID");

    console.log(`[generate-3d-model] Task created successfully: ${taskId}`);

    await supabase.from("builds").update({
      model_status: "processing",
      model_task_id: taskId,
      model_provider: "meshy",
    }).eq("id", build_id);

    return new Response(JSON.stringify({ success: true, task_id: taskId }), {
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