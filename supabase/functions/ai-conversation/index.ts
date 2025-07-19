
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

    // Prepare system prompt for ChatGPT
    const systemPrompt = `Olet ammattimainen haastattelija. Sinun tehtäväsi on tehdä haastattelu aiheesta "${interview.title}".

Haastattelun kysymykset ovat:
${interview.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

OHJEITA:
- Puhu suomeksi
- Ole ystävällinen ja ammattimainen
- Kysy kysymyksiä luonnollisessa järjestyksessä, mutta voit kysyä tarkentavia lisäkysymyksiä
- Reagoi vastauksiin luonnollisesti ("kiitos", "mielenkiintoista" jne.)
- Kun kaikki pääkysymykset on käsitelty, lopeta haastattelu kiittämällä
- Pidä vastaukset lyhyinä (max 2-3 lausetta kerrallaan)
- Jos tämä on ensimmäinen viesti, tervehdi ja aloita haastattelu

${isFirstMessage ? 'Tämä on ensimmäinen viesti - tervehdi ja aloita haastattelu.' : 'Jatka haastattelua luonnollisesti edellisten viestien perusteella.'}`;

    // Prepare conversation history for ChatGPT
    const chatMessages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history
    messages.forEach(msg => {
      chatMessages.push({
        role: msg.role,
        content: msg.content
      });
    });

    console.log('Sending to Azure OpenAI:', { messagesCount: chatMessages.length });

    // Call Azure OpenAI
    const azureEndpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const azureApiKey = Deno.env.get('AZURE_OPENAI_API_KEY');
    const deploymentName = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4o';
    
    console.log('Azure config:', { 
      hasEndpoint: !!azureEndpoint, 
      hasApiKey: !!azureApiKey, 
      deploymentName,
      endpoint: azureEndpoint 
    });
    
    if (!azureEndpoint || !azureApiKey) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    // Build proper Azure OpenAI URL
    const baseUrl = azureEndpoint.endsWith('/') ? azureEndpoint.slice(0, -1) : azureEndpoint;
    const apiUrl = `${baseUrl}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;
    
    console.log('Calling Azure OpenAI URL:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureApiKey,
      },
      body: JSON.stringify({
        messages: chatMessages,
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    console.log('Azure OpenAI response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure OpenAI error response:', errorText);
      throw new Error(`Azure OpenAI API error: ${response.status} - ${errorText}`);
    }

    const aiResult = await response.json();
    const aiResponse = aiResult.choices[0].message.content.trim();

    console.log('AI response:', aiResponse);

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
