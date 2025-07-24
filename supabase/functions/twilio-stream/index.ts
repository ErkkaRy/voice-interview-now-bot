import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== TWILIO STREAM FUNCTION STARTED ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const interviewId = url.searchParams.get('interviewId');
    const from = url.searchParams.get('from');
    console.log('Parameters:', { interviewId, from });

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('No OpenAI API key configured');
      return new Response('OpenAI API key not configured', { status: 500 });
    }

    const { headers } = req;
    const upgradeHeader = headers.get("upgrade") || "";

    if (upgradeHeader.toLowerCase() !== "websocket") {
      console.error('Expected WebSocket connection but got:', upgradeHeader);
      return new Response("Expected WebSocket connection", { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    console.log('WebSocket upgrade successful');
    
    let openaiWs: WebSocket | null = null;
    let streamSid: string | null = null;

    socket.onopen = async () => {
      console.log('=== TWILIO WEBSOCKET OPENED ===');
      
      try {
        // Connect to OpenAI Realtime API
        const openaiUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
        console.log('Connecting to OpenAI Realtime API...');
        
        openaiWs = new WebSocket(openaiUrl, [], {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        });

        openaiWs.onopen = async () => {
          console.log('=== OPENAI CONNECTED ===');
          
          // Get interview questions if available
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
                console.log('Loaded interview:', interview.title);
                openaiWs.interviewQuestions = interview.questions;
                openaiWs.interviewTitle = interview.title;
              }
            } catch (error) {
              console.error('Error loading interview:', error);
            }
          }
        };

        openaiWs.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log('OpenAI message type:', data.type);
          
          if (data.type === 'session.created') {
            console.log('Session created, configuring...');
            
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
            
            openaiWs.send(JSON.stringify(sessionUpdate));
            
            // Start the conversation
            setTimeout(() => {
              if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({ type: 'response.create' }));
              }
            }, 500);
          }
          
          if (data.type === 'response.audio.delta' && streamSid) {
            // Send audio back to Twilio
            const twilioMessage = {
              event: 'media',
              streamSid: streamSid,
              media: {
                payload: data.delta
              }
            };
            socket.send(JSON.stringify(twilioMessage));
          }
        };

        openaiWs.onerror = (error) => {
          console.error('OpenAI WebSocket error:', error);
        };

        openaiWs.onclose = () => {
          console.log('OpenAI WebSocket closed');
          socket.close();
        };

      } catch (error) {
        console.error('Error connecting to OpenAI:', error);
        socket.close();
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Twilio message:', message.event);
        
        if (message.event === 'start') {
          streamSid = message.start.streamSid;
          console.log('Stream started with SID:', streamSid);
        }
        
        if (message.event === 'media' && openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          // Forward audio to OpenAI
          const openaiMessage = {
            type: 'input_audio_buffer.append',
            audio: message.media.payload
          };
          openaiWs.send(JSON.stringify(openaiMessage));
        }
        
        if (message.event === 'stop') {
          console.log('Stream stopped');
          if (openaiWs) {
            openaiWs.close();
          }
        }
        
      } catch (error) {
        console.error('Error parsing Twilio message:', error);
      }
    };

    socket.onclose = () => {
      console.log('Twilio WebSocket closed');
      if (openaiWs) {
        openaiWs.close();
      }
    };

    socket.onerror = (error) => {
      console.error('Twilio WebSocket error:', error);
      if (openaiWs) {
        openaiWs.close();
      }
    };

    return response;

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});