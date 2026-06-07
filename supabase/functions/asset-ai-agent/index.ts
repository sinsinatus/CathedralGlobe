import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROK_API_KEY = Deno.env.get("GROK_API_KEY");

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { build_id, message } = await req.json();
    if (!GROK_API_KEY) throw new Error("GROK_API_KEY not set");
    if (!build_id || !message) throw new Error("build_id and message required");

    // Fetch full asset context
    const { data: build } = await supabase.from('builds').select('*').eq('id', build_id).single();
    const { data: items } = await supabase.from('items').select('*').eq('build_id', build_id);
    const { data: media } = await supabase.from('media').select('*').eq('build_id', build_id);

    const context = `
Asset: ${build?.name || 'Unknown'} (${build?.asset_type || 'Unknown'})
Initial prompt: ${build?.initial_prompt || 'None'}
Items (${items?.length || 0}): ${items?.map(i => `${i.name} (${i.type})`).join(', ') || 'None'}
Media (${media?.length || 0} files attached)
    `.trim();

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4.3",                    // ← Updated to current flagship model
        messages: [
          {
            role: "system",
            content: `You are Grok, an expert AI assistant for CathedralGlobe digital twins. 
You have full context of the current asset. Be concise, helpful, and proactive.
Context:\n${context}`
          },
          { role: "user", content: message }
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Grok API error: ${data.error?.message || JSON.stringify(data)}`);
    }

    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";

    return new Response(JSON.stringify({ success: true, reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[asset-ai-agent] Error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});