import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== EDGE FUNCTION STARTED ===');
  console.log('Request method:', req.method);
  console.log('Request headers:', Object.fromEntries(req.headers.entries()));
  
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  const AZURE_API_KEY = Deno.env.get('AZURE_API_KEY');
  console.log('Azure API key exists:', !!AZURE_API_KEY);
  
  if (!AZURE_API_KEY) {
    console.log('ERROR: No Azure API key configured');
    return new Response(JSON.stringify({ error: 'Azure OpenAI API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Starting WebSocket upgrade...');
  
  try {
    const { socket, response } = Deno.upgradeWebSocket(req);
    console.log('WebSocket upgrade successful');
    let azureWs: WebSocket | null = null;

  socket.onopen = async () => {
    console.log('=== CLIENT WEBSOCKET OPENED ===');
    
    try {
      // Connect to Azure OpenAI Realtime API with api-key in URL
      const azureUrl = `wss://erkka-ma03prm3-eastus2.cognitiveservices.azure.com/openai/realtime?api-version=2024-10-01-preview&deployment=gpt-4o-realtime-preview&api-key=${AZURE_API_KEY}`;
      console.log('Attempting to connect to Azure OpenAI...');
      console.log('Azure URL (without key):', azureUrl.replace(/api-key=[^&]*/, 'api-key=***'));
      
      azureWs = new WebSocket(azureUrl);
      console.log('Azure WebSocket created, waiting for connection...');

      azureWs.onopen = () => {
        console.log('=== AZURE WEBSOCKET CONNECTED SUCCESSFULLY ===');
      };

      azureWs.onmessage = (event) => {
        console.log('Message from Azure OpenAI:', event.data);
        
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
        console.error('=== AZURE WEBSOCKET ERROR ===');
        console.error('Azure WebSocket error details:', error);
        console.error('Azure WebSocket readyState:', azureWs?.readyState);
        socket.send(JSON.stringify({ type: 'error', error: 'Azure OpenAI connection failed', details: String(error) }));
      };

      azureWs.onclose = (event) => {
        console.log('=== AZURE WEBSOCKET CLOSED ===');
        console.log('Close code:', event.code);
        console.log('Close reason:', event.reason);
        console.log('Was clean:', event.wasClean);
        socket.close();
      };

    } catch (error) {
      console.error('=== ERROR CONNECTING TO AZURE ===');
      console.error('Error details:', error);
      socket.send(JSON.stringify({ type: 'error', error: 'Failed to connect to Azure OpenAI', details: String(error) }));
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
    console.error('=== CLIENT WEBSOCKET ERROR ===');
    console.error('Client WebSocket error:', error);
    if (azureWs) {
      azureWs.close();
    }
  };

  console.log('Returning WebSocket response...');
  return response;
  
  } catch (error) {
    console.error('=== WEBSOCKET UPGRADE FAILED ===');
    console.error('Upgrade error:', error);
    return new Response(JSON.stringify({ error: 'WebSocket upgrade failed', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});