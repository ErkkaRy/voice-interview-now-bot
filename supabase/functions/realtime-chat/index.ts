import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== REALTIME-CHAT EDGE FUNCTION STARTED ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  console.log('Request headers:', Object.fromEntries(req.headers.entries()));
  
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract interview ID from URL parameters
    const url = new URL(req.url);
    const interviewId = url.searchParams.get('interviewId');
    const from = url.searchParams.get('from');
    console.log('URL parameters:', { interviewId, from });

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
  
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log('ERROR: Expected WebSocket connection but got:', upgradeHeader);
    return new Response("Expected WebSocket connection", { 
      status: 400,
      headers: corsHeaders 
    });
  }
  
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

        azureWs.onopen = async () => {
          console.log('=== AZURE WEBSOCKET CONNECTED SUCCESSFULLY ===');
          
          // Get interview questions if interviewId is provided
          if (interviewId) {
            try {
              const supabase = createClient(
                Deno.env.get('SUPABASE_URL')!,
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
              );
              
              const { data: interview, error } = await supabase
                .from('interviews')
                .select('*')
                .eq('id', interviewId)
                .single();
                
              if (interview && !error) {
                console.log('Loaded interview questions:', interview.questions);
                azureWs.interviewQuestions = interview.questions;
                azureWs.interviewTitle = interview.title;
              }
            } catch (error) {
              console.error('Error loading interview:', error);
            }
          }
        };

        azureWs.onmessage = (event) => {
          console.log('Message from Azure OpenAI:', event.data);
          
          const data = JSON.parse(event.data);
          
          // Handle session.created event - send configuration
          if (data.type === 'session.created') {
            console.log('Session created, sending configuration');
            
            const questions = azureWs.interviewQuestions || ['Kerro itsestäsi.'];
            const title = azureWs.interviewTitle || 'haastattelu';
            
            const questionsText = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
            
            const sessionUpdate = {
              type: 'session.update',
              session: {
                modalities: ["text", "audio"],
                instructions: `Olet suomenkielinen haastattelija. 

ALOITA HETI: "Hei! Aloitetaan ${title}. ${questions[0]}"

KÄYTÄ NÄITÄ KYSYMYKSIÄ JÄRJESTYKSESSÄ:
${questionsText}

SÄÄNNÖT:
- KYSY yksi kysymys kerrallaan
- ODOTA vastaus ennen seuraavaa 
- Pidä vastaukset lyhyinä (alle 20 sanaa)
- Kun kaikki kysytty: "Kiitos! Haastattelu valmis."
- ÄLÄ keksi lisäkysymyksiä`,
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
                temperature: 0.7,
                max_response_output_tokens: 100
              }
            };
            azureWs?.send(JSON.stringify(sessionUpdate));
            
            // Auto-start the interview
            setTimeout(() => {
              if (azureWs && azureWs.readyState === WebSocket.OPEN) {
                azureWs.send(JSON.stringify({
                  type: 'response.create'
                }));
              }
            }, 500);
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
  } catch (outerError) {
    console.error('=== OUTER CATCH ERROR ===');
    console.error('Outer error details:', outerError);
    return new Response(JSON.stringify({ error: 'Function failed', details: String(outerError) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});