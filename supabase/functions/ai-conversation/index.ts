
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
    const url = new URL(req.url);
    const interviewId = url.searchParams.get('interviewId');
    const from = url.searchParams.get('from');
    const formData = await req.formData();
    
    const speechResult = formData.get('SpeechResult');
    const callSid = formData.get('CallSid');
    
    console.log('Speech received:', { interviewId, from, speechResult, callSid });

    if (!interviewId) {
      throw new Error('Interview ID is required');
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get interview details
    const { data: interview, error: interviewError } = await supabase
      .from('interviews')
      .select('*')
      .eq('id', interviewId)
      .single();

    if (interviewError || !interview) {
      console.error('Interview error:', interviewError);
      throw new Error('Interview not found');
    }

    console.log('Found interview:', interview.title, 'with questions:', interview.questions);

    // Get user's speech input
    const userInput = speechResult || '';
    console.log('User input:', userInput);

    // Get or create conversation state from database
    let { data: conversationData } = await supabase
      .from('conversations')
      .select('*')
      .eq('call_sid', callSid)
      .single();

    let currentQuestionIndex = 0;
    let conversation = [];

    if (conversationData) {
      currentQuestionIndex = conversationData.current_question_index || 0;
      conversation = conversationData.messages || [];
    } else {
      // Create new conversation record
      await supabase
        .from('conversations')
        .insert({
          call_sid: callSid,
          interview_id: interviewId,
          current_question_index: 0,
          messages: []
        });
    }

    // Add user's response to conversation
    if (userInput) {
      conversation.push({
        role: 'user',
        content: userInput,
        timestamp: new Date().toISOString()
      });
    }

    const questions = interview.questions || [];
    console.log('Current question index:', currentQuestionIndex, 'Total questions:', questions.length);
    
    let aiResponse = '';
    
    // Determine what to say based on conversation state
    if (!userInput) {
      // First call - start with first question
      aiResponse = `Hei! Aloitetaan haastattelu "${interview.title}". ${questions[0]}`;
    } else if (currentQuestionIndex < questions.length - 1) {
      // Move to next question
      currentQuestionIndex++;
      aiResponse = `Kiitos vastauksesta. ${questions[currentQuestionIndex]}`;
    } else {
      // All questions asked
      aiResponse = 'Kiitos kaikista vastauksista! Haastattelu on nyt valmis.';
    }

    console.log('Generated AI response:', aiResponse);

    // Update conversation in database
    conversation.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    });

    await supabase
      .from('conversations')
      .update({
        current_question_index: currentQuestionIndex,
        messages: conversation
      })
      .eq('call_sid', callSid);

    try {
      console.log('Making Azure OpenAI call...');
      console.log('Azure API key exists:', !!Deno.env.get('AZURE_API_KEY'));
      
      const azureApiKey = Deno.env.get('AZURE_API_KEY');
      if (!azureApiKey) {
        throw new Error('Azure API key not found');
      }
      
      // Use a Chat Completions deployment instead of realtime deployment
      const aiApiResponse = await fetch(
        'https://erkka-ma03prm3-eastus2.cognitiveservices.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-02-15-preview',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': azureApiKey,
          },
          body: JSON.stringify({
            messages,
            max_tokens: 100,
            temperature: 0.8,
          }),
        }
      );
      
      console.log('Azure OpenAI response status:', aiApiResponse.status);

      if (aiApiResponse.ok) {
        const aiData = await aiApiResponse.json();
        aiResponse = aiData.choices[0]?.message?.content || 'Kerro lisää.';
        console.log('AI response received:', aiResponse);
      } else {
        const errorText = await aiApiResponse.text();
        console.error('Azure OpenAI API error:', aiApiResponse.status, errorText);
        aiResponse = 'Kiintoisa. Kerro lisää.';
      }
    } catch (error) {
      console.error('AI API error:', error);
      aiResponse = 'Kiintoisa. Kerro lisää.';
    }

    // Add AI response to conversation
    conversation.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    });

    console.log('Generated AI response:', aiResponse);

    // Create TwiML response with continued conversation
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">${aiResponse}</Say>
  <Gather 
    input="speech"
    timeout="10"
    speechTimeout="3"
    speechModel="phone_call"
    enhanced="true"
    language="fi-FI"
    action="${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-conversation?interviewId=${interviewId}&from=${from}"
    method="POST"
  >
    <Say voice="alice" language="fi-FI">Kuuntelen...</Say>
  </Gather>
  <Say voice="alice" language="fi-FI">Kiitos haastattelusta! Hyvää päivänjatkoa.</Say>
  <Hangup/>
</Response>`;

    console.log('Generated TwiML:', twiml);
    console.log('Returning TwiML response with Content-Type: text/xml');

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
