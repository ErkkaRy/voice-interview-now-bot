
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
    const formData = await req.formData();
    const callSid = formData.get('CallSid');
    const from = formData.get('From');
    const to = formData.get('To');
    
    console.log('Incoming call:', { callSid, from, to });

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('Received call from:', from, 'to:', to);

    // Find the interview that was sent to this phone number
    let interview = null;
    let interviewError = null;
    
    console.log('Looking for interview invitation for phone:', from);
    console.log('All parameters:', { callSid, from, to });
    
    // First try to find the interview invitation for this phone number (the number that is calling)
    const { data: invitationData, error: invitationError } = await supabase
      .from('interview_invitations')
      .select(`
        interview_id,
        interviews (*)
      `)
      .eq('phone_number', from)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    console.log('Invitation query result:', { invitationData, invitationError });

    if (invitationData && invitationData.interviews) {
      interview = invitationData.interviews;
      console.log('Found interview from invitation:', interview.title);
    } else {
      console.log('No invitation found for phone:', from, 'Error:', invitationError);
      // Fallback to most recent interview
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('interviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      interview = fallbackData;
      interviewError = fallbackError;
      console.log('Using fallback interview:', interview?.title);
    }

    if (interviewError || !interview) {
      console.error('No interview found:', interviewError);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">Anteeksi, en löydä aktiivista haastattelua.</Say>
  <Hangup/>
</Response>`;
      return new Response(twiml, {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    console.log('Starting interview:', interview.title);

    // Create TwiML response with voice chat support
    const gatherUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-conversation`;
    
    console.log('Creating TwiML response with:', {
      interviewId: interview.id,
      from: from,
      gatherUrl: gatherUrl
    });
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">Hei! Aloitetaan haastattelu ${interview.title}. Vastaa kysymyksiin luonnollisesti.</Say>
  <Gather 
    input="speech"
    timeout="10"
    speechTimeout="3"
    speechModel="phone_call"
    enhanced="true"
    language="fi-FI"
    action="${gatherUrl}?interviewId=${interview.id}&amp;from=${encodeURIComponent(from)}"
    method="POST"
  >
    <Say voice="alice" language="fi-FI">Kuuntelen sinua nyt...</Say>
  </Gather>
  <Say voice="alice" language="fi-FI">En kuullut vastausta. Lopetan puhelun.</Say>
  <Hangup/>
</Response>`;

    return new Response(twiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
    });

  } catch (error) {
    console.error('Error handling call:', error);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">Tapahtui virhe. Yritä myöhemmin uudelleen.</Say>
  <Hangup/>
</Response>`;
    return new Response(twiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
    });
  }
});
