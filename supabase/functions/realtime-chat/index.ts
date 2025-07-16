import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Starting WebSocket connection to OpenAI Realtime API');
  
  const { socket, response } = Deno.upgradeWebSocket(req);
  let azureWs: WebSocket | null = null;

  socket.onopen = async () => {
    console.log('Client WebSocket opened');
    
    try {
      // Connect to OpenAI Realtime API
      const openaiUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
      console.log('Connecting to OpenAI:', openaiUrl);
      
      azureWs = new WebSocket(openaiUrl, [], {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        }
      });

      azureWs.onopen = () => {
        console.log('Connected to OpenAI Realtime API');
      };

      azureWs.onmessage = (event) => {
        console.log('Message from OpenAI:', event.data);
        
        const data = JSON.parse(event.data);
        
        // Handle session.created event - send configuration
        if (data.type === 'session.created') {
          console.log('Session created, sending configuration');
          const sessionUpdate = {
            type: 'session.update',
            session: {
              modalities: ["text", "audio"],
              instructions: "Olet avulias suomenkielinen haastattelija. Kysele kysymyksiä luonnollisesti ja joustavasti annettujen haastattelukysymysten pohjalta. Sovella kysymyksiä keskusteluun sopivaksi äläkä kysy robotin tavoin.",
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
          azureWs?.send(JSON.stringify(sessionUpdate));
        }
        
        // Forward all messages to client
        socket.send(event.data);
      };

      azureWs.onerror = (error) => {
        console.error('OpenAI WebSocket error:', error);
        socket.send(JSON.stringify({ type: 'error', error: 'OpenAI connection failed' }));
      };

      azureWs.onclose = () => {
        console.log('OpenAI WebSocket closed');
        socket.close();
      };

    } catch (error) {
      console.error('Error connecting to OpenAI:', error);
      socket.send(JSON.stringify({ type: 'error', error: 'Failed to connect to OpenAI' }));
    }
  };

  socket.onmessage = (event) => {
    console.log('Message from client:', event.data);
    if (azureWs && azureWs.readyState === WebSocket.OPEN) {
      azureWs.send(event.data);
    }
  };

  socket.onclose = () => {
    console.log('Client WebSocket closed');
    if (azureWs) {
      azureWs.close();
    }
  };

  socket.onerror = (error) => {
    console.error('Client WebSocket error:', error);
    if (azureWs) {
      azureWs.close();
    }
  };

  return response;
});