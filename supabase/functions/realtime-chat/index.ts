import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AZURE_API_KEY = Deno.env.get('AZURE_API_KEY');
    const AZURE_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');
    
    if (!AZURE_API_KEY || !AZURE_ENDPOINT || !AZURE_DEPLOYMENT) {
      throw new Error('Azure OpenAI credentials not set');
    }

    const { searchParams } = new URL(req.url);
    const upgrade = req.headers.get("upgrade") || "";
    
    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    let openaiWs: WebSocket | null = null;

    socket.onopen = async () => {
      console.log("Client connected");
      
      // Connect to Azure OpenAI Realtime API
      try {
        const wsUrl = `${AZURE_ENDPOINT.replace('https://', 'wss://').replace('/openai', '')}/openai/realtime?api-version=2024-10-01-preview&deployment=${AZURE_DEPLOYMENT}`;
        console.log("Connecting to Azure OpenAI:", wsUrl);
        
        openaiWs = new WebSocket(wsUrl, {
          headers: {
            "api-key": AZURE_API_KEY
          }
        });

        openaiWs.onopen = () => {
          console.log("Connected to OpenAI");
          
          // Send session configuration after connection
          const sessionConfig = {
            type: "session.update",
            session: {
              modalities: ["text", "audio"],
              instructions: "Olet suomalainen haastattelija. Keskustele käyttäjän kanssa suomeksi. Ole ystävällinen ja kysele kysymyksiä.",
              voice: "alloy",
              input_audio_format: "pcm16",
              output_audio_format: "pcm16",
              input_audio_transcription: {
                model: "whisper-1"
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 1000
              },
              temperature: 0.8,
              max_response_output_tokens: "inf"
            }
          };
          
          openaiWs.send(JSON.stringify(sessionConfig));
        };

        openaiWs.onmessage = (event) => {
          console.log("OpenAI message:", event.data);
          // Forward OpenAI messages to client
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        openaiWs.onerror = (error) => {
          console.error("OpenAI WebSocket error:", error);
          socket.close();
        };

        openaiWs.onclose = () => {
          console.log("OpenAI connection closed");
          socket.close();
        };

      } catch (error) {
        console.error("Error connecting to OpenAI:", error);
        socket.close();
      }
    };

    socket.onmessage = (event) => {
      console.log("Client message:", event.data);
      // Forward client messages to OpenAI
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(event.data);
      }
    };

    socket.onclose = () => {
      console.log("Client disconnected");
      if (openaiWs) {
        openaiWs.close();
      }
    };

    socket.onerror = (error) => {
      console.error("Client WebSocket error:", error);
      if (openaiWs) {
        openaiWs.close();
      }
    };

    return response;

  } catch (error) {
    console.error("Error in realtime-chat function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});