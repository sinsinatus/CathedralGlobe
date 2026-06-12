// supabase/functions/asset-ai-agent/index.ts
// FULLY UPDATED — Tool calling for normal chat + Hierarchical meta-tag (12 June 2026)

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
    const { build_id, message, mode } = await req.json();

    if (!GROK_API_KEY) throw new Error("GROK_API_KEY not set");
    if (!build_id || !message) throw new Error("build_id and message required");

    // Fetch full context
    const { data: build } = await supabase.from('builds').select('*').eq('id', build_id).single();
    const { data: existingItems } = await supabase.from('items').select('*').eq('build_id', build_id);
    const { data: media } = await supabase.from('media').select('id, url, type').eq('build_id', build_id);

    const imageUrls = media?.filter(m => {
      const t = (m.type || '').toLowerCase();
      const u = (m.url || '').toLowerCase();
      return t === 'photo' || t === 'image' || 
             u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png') || u.endsWith('.webp');
    }).map(m => m.url) || [];

    console.log(`[asset-ai-agent] Build ${build_id} | Media: ${media?.length || 0} | Images: ${imageUrls.length}`);

    const context = `
Asset: ${build?.name || 'Unknown'}
Existing items: ${existingItems?.map(i => `${i.name} (${i.type})`).join(', ') || 'None'}
    `.trim();

    let systemPrompt = `You are Grok, an expert AI assistant for CathedralGlobe digital twins.\nContext:\n${context}`;
    let userContent: any[] = [{ type: "text", text: message }];

    // ===================== META-TAG MODE (unchanged - still excellent) =====================
    if (mode === 'meta_tag') {
      systemPrompt = `You are an expert digital twin architect.
Analyze all attached photos. First identify distinct ROOMS/SPACES, then every visible item inside them.

Return ONLY valid JSON (no markdown, no extra text):

{
  "rooms": [
    {
      "name": "Kitchen",
      "type": "Room",
      "description": "Modern kitchen with island",
      "items": [
        {
          "name": "Bosch Dishwasher",
          "type": "Appliance",
          "description": "Built-in dishwasher",
          "manufacturer": "Bosch",
          "model": "SMS6ZCW00G",
          "serial_number": "FD123456",
          "metadata": {
            "confidence": 0.92,
            "tags": ["appliance", "kitchen"],
            "detected_from": "photo-2"
          }
        }
      ]
    }
  ]
}`;

      if (imageUrls.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          reply: `⚠️ No photos found attached to this asset (media count: ${media?.length || 0}). Please add photos first.`,
          createdCount: 0
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      userContent = [
        { type: "text", text: "Analyze all photos and create hierarchical rooms + items with rich metadata." },
        ...imageUrls.map(url => ({ type: "image_url", image_url: { url } }))
      ];
    } else {
      // ===================== NORMAL CHAT — NOW WITH TOOL CALLING =====================
      systemPrompt = `You are Grok, an expert AI assistant for CathedralGlobe digital twins.
You can view the current asset and you have tools to modify it.

Current context:
${context}

When the user asks you to add, update, or organize items/rooms, use the available tools.
Always be helpful and confirm what you did after using tools.`;

      userContent = [{ type: "text", text: message }, ...imageUrls.map(url => ({ type: "image_url", image_url: { url } }))];
    }

    // ===================== BUILD THE REQUEST =====================
    const requestBody: any = {
      model: "grok-4.3",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
      temperature: mode === 'meta_tag' ? 0.2 : 0.7,
      max_tokens: mode === 'meta_tag' ? 2500 : 1200,
    };

    if (mode === 'meta_tag') {
      requestBody.response_format = { type: "json_object" };
    } else {
      // Add tools for normal chat
      requestBody.tools = [
        {
          type: "function",
          function: {
            name: "create_items",
            description: "Create one or more new items (rooms or objects) in the asset. Supports hierarchy via parent_id.",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      type: { type: "string", description: "Room, Furniture, Appliance, etc." },
                      description: { type: "string" },
                      parent_id: { type: ["string", "null"], description: "ID of parent room/item (use null for top-level rooms)" },
                      manufacturer: { type: ["string", "null"] },
                      model: { type: ["string", "null"] },
                      serial_number: { type: ["string", "null"] },
                      metadata: { type: "object" }
                    },
                    required: ["name", "type"]
                  }
                }
              },
              required: ["items"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "update_item",
            description: "Update an existing item by its ID.",
            parameters: {
              type: "object",
              properties: {
                item_id: { type: "string" },
                updates: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    description: { type: "string" },
                    parent_id: { type: ["string", "null"] },
                    manufacturer: { type: ["string", "null"] },
                    model: { type: ["string", "null"] },
                    serial_number: { type: ["string", "null"] },
                    metadata: { type: "object" }
                  }
                }
              },
              required: ["item_id", "updates"]
            }
          }
        }
      ];
      requestBody.tool_choice = "auto";
    }

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
    let createdCount = 0;
    let actionsPerformed = false;

    // ===================== HANDLE META-TAG MODE (unchanged) =====================
    if (mode === 'meta_tag') {
      try {
        const parsed = JSON.parse(reply);
        const rooms = parsed.rooms || [];

        for (const room of rooms) {
          const { data: roomRow } = await supabase
            .from('items')
            .insert({
              build_id,
              name: room.name,
              type: 'Room',
              description: room.description || '',
              metadata: { created_by_ai: true, ai_generated_at: new Date().toISOString() }
            })
            .select('id')
            .single();

          if (roomRow && room.items?.length > 0) {
            const childInserts = room.items.map((item: any) => ({
              build_id,
              parent_id: roomRow.id,
              name: item.name,
              type: item.type || 'Other',
              description: item.description || '',
              manufacturer: item.manufacturer || null,
              model: item.model || null,
              serial_number: item.serial_number || null,
              metadata: {
                ...item.metadata,
                created_by_ai: true,
                ai_generated_at: new Date().toISOString(),
              }
            }));
            await supabase.from('items').insert(childInserts);
            createdCount += room.items.length;
          }
        }
        reply = `✅ Created ${createdCount} items across ${rooms.length} rooms!`;
        actionsPerformed = true;
      } catch (e) {
        console.error("Meta-tag parse error:", e);
        reply = "Meta-tagging ran but could not parse the JSON response.";
      }
    } 
    // ===================== HANDLE TOOL CALLS IN NORMAL CHAT =====================
    else if (data.choices?.[0]?.message?.tool_calls?.length > 0) {
      const toolCalls = data.choices[0].message.tool_calls;
      let toolResults: string[] = [];

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        if (functionName === "create_items") {
          const itemsToCreate = args.items || [];
          if (itemsToCreate.length > 0) {
            const inserts = itemsToCreate.map((item: any) => ({
              build_id,
              name: item.name,
              type: item.type || 'Other',
              description: item.description || '',
              parent_id: item.parent_id || null,
              manufacturer: item.manufacturer || null,
              model: item.model || null,
              serial_number: item.serial_number || null,
              metadata: {
                ...(item.metadata || {}),
                created_by_ai: true,
                ai_generated_at: new Date().toISOString(),
              }
            }));
            await supabase.from('items').insert(inserts);
            createdCount += itemsToCreate.length;
            toolResults.push(`Created ${itemsToCreate.length} items`);
          }
        }

        if (functionName === "update_item") {
          const { item_id, updates } = args;
          if (item_id && updates) {
            await supabase.from('items').update(updates).eq('id', item_id);
            toolResults.push(`Updated item ${item_id}`);
          }
        }
      }

      actionsPerformed = true;
      reply = `✅ Done! ${toolResults.join('. ')}. The asset has been updated.`;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      reply, 
      createdCount, 
      actions_performed: actionsPerformed 
    }), {
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