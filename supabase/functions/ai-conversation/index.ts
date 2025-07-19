
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
      throw new Error('Interview not found');
    }

    // Get user's speech input
    const userInput = speechResult || '';
    console.log('User input:', userInput);

    // Simulate conversation state (in production, you'd store this in database)
    let conversation = [];
    
    // Add user's response to conversation
    if (userInput) {
      conversation.push({
        role: 'user',
        content: userInput,
        timestamp: new Date().toISOString()
      });
    }

    // Generate AI response using Azure OpenAI
    const questions = interview.questions || [];
    
    let aiResponse = '';
    
    // Track conversation state (in real app, store in database)
    let currentQuestionIndex = 0;
    
    // Create enhanced conversational prompt that uses the interview questions systematically
    const systemPrompt = `Olet avulias ja keskusteleva suomenkielinen haastattelija. Toimi seuraavasti:

1. Jos tämä on ensimmäinen vastaus tai käyttäjä ei ole vielä vastannut, aloita ENSIMMÄISELLÄ kysymyksellä: "${questions[0] || 'Kerro kokemuksestasi'}"
2. Kuuntele vastauksia tarkasti ja kysy tarkentavia jatkokysymyksiä
3. Jos joku vastaa negatiivisesti, kysy aina: "Mitä puuttui?" tai "Voisitko kertoa tarkemmin?"
4. Kun saat riittävän vastauksen, siirry SEURAAVAAN haastattelukysymykseen järjestyksessä
5. Ole kiinnostunut ja empaattinen
6. Pidä keskustelu sujuvana ja luonnollisena
7. Kysy yksi kysymys kerrallaan
8. Pidä vastaukset alle 50 sanaa

HAASTATTELUKYSYMYKSET JÄRJESTYKSESSÄ:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Käyttäjän viimeisin vastaus: "${userInput}"

Jos käyttäjä ei ole vielä vastannut mihinkään, aloita kysymyksellä numero 1.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversation.slice(-2), // Last 2 messages for context
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
            max_tokens: 100,
            temperature: 0.8,
          }),
        }
      );

      if (aiApiResponse.ok) {
        const aiData = await aiApiResponse.json();
        aiResponse = aiData.choices[0]?.message?.content || 'Kerro lisää.';
      } else {
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
