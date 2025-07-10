
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');
    const formData = await req.formData();
    
    const recordingUrl = formData.get('RecordingUrl');
    const recordingSid = formData.get('RecordingSid');
    const callSid = formData.get('CallSid');
    
    console.log('Recording received:', { callId, recordingUrl, recordingSid });

    if (!callId) {
      throw new Error('Call ID is required');
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get call and interview details
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('*, interviews(*)')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      throw new Error('Call not found');
    }

    // Download and transcribe audio using Azure OpenAI Whisper
    let transcription = '';
    if (recordingUrl) {
      try {
        // Download audio file
        const audioResponse = await fetch(recordingUrl + '.wav');
        const audioBuffer = await audioResponse.arrayBuffer();
        
        // Transcribe using Azure OpenAI Whisper
        const whisperFormData = new FormData();
        whisperFormData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
        whisperFormData.append('model', 'whisper-1');
        
        const whisperResponse = await fetch(
          `${Deno.env.get('AZURE_OPENAI_ENDPOINT')}/openai/deployments/whisper-1/audio/transcriptions?api-version=2024-02-15-preview`,
          {
            method: 'POST',
            headers: {
              'api-key': Deno.env.get('AZURE_OPENAI_API_KEY')!,
            },
            body: whisperFormData,
          }
        );
        
        if (whisperResponse.ok) {
          const whisperData = await whisperResponse.json();
          transcription = whisperData.text || '';
          console.log('Transcription:', transcription);
        }
      } catch (error) {
        console.error('Transcription error:', error);
      }
    }

    // Get conversation history
    const conversation = call.conversation || [];
    
    // Add user's response to conversation
    if (transcription) {
      conversation.push({
        role: 'user',
        content: transcription,
        timestamp: new Date().toISOString()
      });
    }

    // Generate AI response using Azure OpenAI
    const questions = call.interviews.questions || [];
    const currentQuestionIndex = conversation.filter(msg => msg.role === 'assistant').length;
    
    let aiResponse = '';
    let nextQuestion = '';
    
    if (currentQuestionIndex < questions.length) {
      nextQuestion = questions[currentQuestionIndex];
      
      // Create context for AI
      const systemPrompt = `Olet ammattimainen haastattelija. Tehtäväsi on esittää haastattelukysymyksiä ja reagoida haastateltavan vastauksiin luonnollisesti. 
      
Seuraava kysymys on: "${nextQuestion}"

Vastaa lyhyesti ja ystävällisesti haastateltavan edelliseen vastaukseen, ja esitä sitten seuraava kysymys. Pidä vastaus alle 100 sanaa.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversation.slice(-4), // Last 4 messages for context
      ];

      try {
        const aiApiResponse = await fetch(
          `${Deno.env.get('AZURE_OPENAI_ENDPOINT')}/openai/deployments/${Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME')}/chat/completions?api-version=2024-02-15-preview`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': Deno.env.get('AZURE_OPENAI_API_KEY')!,
            },
            body: JSON.stringify({
              messages,
              max_tokens: 150,
              temperature: 0.7,
            }),
          }
        );

        if (aiApiResponse.ok) {
          const aiData = await aiApiResponse.json();
          aiResponse = aiData.choices[0]?.message?.content || nextQuestion;
        } else {
          aiResponse = nextQuestion;
        }
      } catch (error) {
        console.error('AI API error:', error);
        aiResponse = nextQuestion;
      }
    } else {
      aiResponse = 'Kiitos haastattelusta! Haastattelu on nyt päättynyt. Hyvää päivänjatkoa!';
    }

    // Add AI response to conversation
    conversation.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    });

    // Update call with conversation
    await supabase
      .from('calls')
      .update({ 
        conversation,
        audio_recording_url: recordingUrl 
      })
      .eq('id', callId);

    // Create TwiML response
    const isLastQuestion = currentQuestionIndex >= questions.length - 1;
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">${aiResponse}</Say>`;

    if (!isLastQuestion) {
      twiml += `
  <Record 
    timeout="3"
    finishOnKey=""
    maxLength="60"
    playBeep="false"
    recordingStatusCallback="${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-conversation?callId=${callId}"
    recordingStatusCallbackMethod="POST"
  />
  <Say voice="alice" language="fi-FI">En kuullut vastausta. Siirryn seuraavaan kysymykseen.</Say>`;
    } else {
      // Mark call as completed
      await supabase
        .from('calls')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', callId);
      
      twiml += `
  <Pause length="1"/>
  <Hangup/>`;
    }

    twiml += `
</Response>`;

    return new Response(twiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
    });

  } catch (error) {
    console.error('Error in AI conversation:', error);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">Tapahtui virhe. Lopetan puhelun.</Say>
  <Hangup/>
</Response>`;
    return new Response(twiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
    });
  }
});
