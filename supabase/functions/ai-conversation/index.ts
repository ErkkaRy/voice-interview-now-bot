
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== AI-CONVERSATION FUNCTION START ===');
    const formData = await req.formData();
    const speechResult = formData.get('SpeechResult')?.toString() || '';
    const callSid = formData.get('CallSid')?.toString() || '';
    
    console.log('Speech received:', { speechResult, callSid });

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get the latest interview (fallback for now)
    const { data: interview, error: interviewError } = await supabase
      .from('interviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (interviewError || !interview) {
      console.error('Interview error:', interviewError);
      throw new Error('Interview not found');
    }

    console.log('Using interview:', interview.title);

    // Get or create conversation state
    let { data: conversationData, error: conversationError } = await supabase
      .from('conversations')
      .select('*')
      .eq('call_sid', callSid)
      .maybeSingle();

    let currentQuestionIndex = 0;
    
    if (conversationData) {
      currentQuestionIndex = conversationData.current_question_index || 0;
      console.log('Existing conversation, question index:', currentQuestionIndex);
    } else {
      console.log('Creating new conversation');
      const { error: insertError } = await supabase
        .from('conversations')
        .insert({
          call_sid: callSid,
          interview_id: interview.id,
          current_question_index: 0,
          messages: []
        });
      
      if (insertError) {
        console.error('Error creating conversation:', insertError);
      }
    }

    const questions = interview.questions || [];
    let aiResponse = '';
    
    // Determine response based on current state
    if (currentQuestionIndex < questions.length) {
      // Ask current question
      aiResponse = `Kiitos vastauksesta. ${questions[currentQuestionIndex]}`;
      
      // Move to next question for next time
      const nextIndex = currentQuestionIndex + 1;
      await supabase
        .from('conversations')
        .update({ current_question_index: nextIndex })
        .eq('call_sid', callSid);
        
    } else {
      // All questions done
      aiResponse = 'Kiitos kaikista vastauksista! Haastattelu on valmis.';
    }

    console.log('AI response:', aiResponse);

    // Create TwiML with either next question or end
    let twiml = '';
    if (currentQuestionIndex < questions.length) {
      // Continue with next question
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">${aiResponse}</Say>
  <Gather input="speech" action="https://jhjbvmyfzmjrfoodphuj.supabase.co/functions/v1/ai-conversation" method="POST" speechTimeout="3" language="fi-FI" />
  <Say voice="alice" language="fi-FI">En kuullut vastausta. Lopetan puhelun.</Say>
  <Hangup/>
</Response>`;
    } else {
      // End conversation
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">${aiResponse}</Say>
  <Hangup/>
</Response>`;
    }

    console.log('Returning TwiML:', twiml);

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
