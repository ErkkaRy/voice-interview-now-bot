
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

    let messages = [];
    let isFirstMessage = false;
    
    if (conversationData) {
      messages = conversationData.messages || [];
      console.log('Existing conversation, messages count:', messages.length);
    } else {
      console.log('Creating new conversation');
      isFirstMessage = true;
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

    // Add user's response to conversation history
    if (!isFirstMessage && speechResult) {
      messages.push({
        role: 'user',
        content: speechResult,
        timestamp: new Date().toISOString()
      });
    }

    // Simple fallback response for now to ensure it works
    const questions = interview.questions || [];
    let aiResponse = '';
    
    // Count only user messages to track progress
    const userMessages = messages.filter(msg => msg.role === 'user');
    const currentQuestionIndex = userMessages.length;
    
    console.log('Question tracking:', { 
      totalQuestions: questions.length, 
      userMessagesCount: userMessages.length, 
      currentQuestionIndex,
      isFirstMessage,
      firstQuestion: questions[0],
      allQuestions: questions
    });
    
    if (isFirstMessage || currentQuestionIndex === 0) {
      // First question - make sure to use the actual first question
      if (questions.length > 0) {
        aiResponse = `Hei! Aloitetaan ${interview.title} haastattelu. ${questions[0]}`;
      } else {
        aiResponse = `Hei! Aloitetaan ${interview.title} haastattelu. Kerro itsestäsi.`;
      }
    } else if (currentQuestionIndex < questions.length) {
      // Ask next question
      aiResponse = `Kiitos vastauksesta. ${questions[currentQuestionIndex]}`;
    } else {
      // All questions answered
      aiResponse = 'Kiitos kaikista vastauksista! Haastattelu on valmis.';
    }

    console.log('Simple AI response:', aiResponse);

    // Add AI response to conversation history
    messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    });

    // Update conversation in database
    await supabase
      .from('conversations')
      .update({ 
        messages: messages,
        updated_at: new Date().toISOString()
      })
      .eq('call_sid', callSid);

    // Check if conversation should end
    const shouldEnd = aiResponse.toLowerCase().includes('lopetan') || 
                     aiResponse.toLowerCase().includes('kiitos kaikista') ||
                     aiResponse.toLowerCase().includes('haastattelu on valmis');

    // Create TwiML response
    let twiml = '';
    if (shouldEnd) {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">${aiResponse}</Say>
  <Hangup/>
</Response>`;
    } else {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">${aiResponse}</Say>
  <Gather input="speech" action="https://jhjbvmyfzmjrfoodphuj.supabase.co/functions/v1/ai-conversation" method="POST" speechTimeout="3" language="fi-FI" />
  <Say voice="alice" language="fi-FI">En kuullut vastausta. Lopetan puhelun.</Say>
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
