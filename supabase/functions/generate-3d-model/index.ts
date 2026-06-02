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
    const { build_id, prompt, asset_type } = await req.json();

    if (!MESHY_API_KEY) throw new Error("MESHY_API_KEY is not set");
    if (!build_id || !prompt) throw new Error("build_id and prompt required");

    // Advanced asset-type aware prompt engineering
    let basePrompt = prompt.trim();

    const qualityBoosters = `
      highly detailed, ultra realistic, architectural visualization, 
      PBR materials, clean topology, game-ready, professional 3D asset, 
      natural lighting, realistic scale, sharp details, 8k quality
    `.trim();

    let enhancedPrompt = "";

    switch (asset_type) {
      case 'house':
        enhancedPrompt = `Modern residential ${basePrompt}, large windows clearly showing detailed interior spaces, open floor plan, visible rooms, furniture, realistic interior lighting, full exterior and interior visible, photorealistic digital twin`;
        break;
      case 'car':
        enhancedPrompt = `Realistic ${basePrompt}, highly detailed vehicle, accurate proportions, realistic materials (glass, metal, rubber, paint), interior visible through windows, studio lighting, automotive photography style`;
        break;
      case 'factory':
      case 'warehouse':
        enhancedPrompt = `Industrial ${basePrompt}, large factory/warehouse building, detailed exterior with loading docks and windows, visible interior machinery and structure, industrial realism, cinematic lighting`;
        break;
      default:
        enhancedPrompt = basePrompt;
    }

    const finalPrompt = `${enhancedPrompt}, ${qualityBoosters}`.replace(/\s+/g, ' ');

    console.log(`[generate-3d-model] Final prompt for ${asset_type}: ${finalPrompt}`);

    const response = await fetch("https://api.meshy.ai/openapi/v2/text-to-3d", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "preview",
        prompt: finalPrompt,
        art_style: "realistic",
        should_remesh: true,
      }),
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