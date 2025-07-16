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

  const AZURE_API_KEY = Deno.env.get('AZURE_API_KEY');
  
  if (!AZURE_API_KEY) {
    return new Response(JSON.stringify({ error: 'Azure OpenAI API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Starting WebSocket connection to Azure OpenAI Realtime API');
  
  const { socket, response } = Deno.upgradeWebSocket(req);
  let azureWs: WebSocket | null = null;

  socket.onopen = async () => {
    console.log('Client WebSocket opened');
    
    try {
      // Connect to Azure OpenAI Realtime API
      const azureUrl = `wss://erkka-ma03prm3-eastus2.cognitiveservices.azure.com/openai/realtime?api-version=2025-04-01-preview&deployment=gpt-4o-realtime-preview`;
      console.log('Connecting to Azure OpenAI:', azureUrl);
      
      azureWs = new WebSocket(azureUrl, [], {
        headers: {
          'api-key': AZURE_API_KEY,
        }
      });

      azureWs.onopen = () => {
        console.log('Connected to Azure OpenAI Realtime API');
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
        console.error('Azure OpenAI WebSocket error:', error);
        socket.send(JSON.stringify({ type: 'error', error: 'Azure OpenAI connection failed' }));
      };

      azureWs.onclose = () => {
        console.log('Azure OpenAI WebSocket closed');
        socket.close();
      };

    } catch (error) {
      console.error('Error connecting to Azure OpenAI:', error);
      socket.send(JSON.stringify({ type: 'error', error: 'Failed to connect to Azure OpenAI' }));
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