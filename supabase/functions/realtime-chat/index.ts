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

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  console.log('OpenAI API key exists:', !!OPENAI_API_KEY);
  
  if (!OPENAI_API_KEY) {
    console.log('ERROR: No OpenAI API key configured');
    return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
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
    let openaiWs: WebSocket | null = null;

    socket.onopen = async () => {
      console.log('=== CLIENT WEBSOCKET OPENED ===');
      
      try {
        // Connect to OpenAI Realtime API
        const openaiUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
        console.log('Attempting to connect to OpenAI...');
        console.log('OpenAI URL:', openaiUrl);
        
        openaiWs = new WebSocket(openaiUrl, [], {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        });
        console.log('OpenAI WebSocket created, waiting for connection...');

        openaiWs.onopen = async () => {
          console.log('=== OPENAI WEBSOCKET CONNECTED SUCCESSFULLY ===');
          
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
                openaiWs.interviewQuestions = interview.questions;
                openaiWs.interviewTitle = interview.title;
              }
            } catch (error) {
              console.error('Error loading interview:', error);
            }
          }
        };

        openaiWs.onmessage = (event) => {
          console.log('Message from OpenAI:', event.data);
          
          const data = JSON.parse(event.data);
          
          // Handle session.created event - send configuration
          if (data.type === 'session.created') {
            console.log('Session created, sending configuration');
            
            const questions = openaiWs.interviewQuestions || ['Kerro itsestäsi.'];
            const title = openaiWs.interviewTitle || 'haastattelu';
            
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
            openaiWs?.send(JSON.stringify(sessionUpdate));
            
            // Auto-start the interview
            setTimeout(() => {
              if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({
                  type: 'response.create'
                }));
              }
            }, 500);
          }
          
          // Forward all messages to client
          socket.send(event.data);
        };

        openaiWs.onerror = (error) => {
          console.error('=== OPENAI WEBSOCKET ERROR ===');
          console.error('OpenAI WebSocket error details:', error);
          console.error('OpenAI WebSocket readyState:', openaiWs?.readyState);
          socket.send(JSON.stringify({ type: 'error', error: 'OpenAI connection failed', details: String(error) }));
        };

        openaiWs.onclose = (event) => {
          console.log('=== OPENAI WEBSOCKET CLOSED ===');
          console.log('Close code:', event.code);
          console.log('Close reason:', event.reason);
          console.log('Was clean:', event.wasClean);
          socket.close();
        };

      } catch (error) {
        console.error('=== ERROR CONNECTING TO OPENAI ===');
        console.error('Error details:', error);
        socket.send(JSON.stringify({ type: 'error', error: 'Failed to connect to OpenAI', details: String(error) }));
      }
    };

    socket.onmessage = (event) => {
      console.log('Message from client:', event.data);
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(event.data);
      }
    };

    socket.onclose = () => {
      console.log('Client WebSocket closed');
      if (openaiWs) {
        openaiWs.close();
      }
    };

    socket.onerror = (error) => {
      console.error('=== CLIENT WEBSOCKET ERROR ===');
      console.error('Client WebSocket error:', error);
      if (openaiWs) {
        openaiWs.close();
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