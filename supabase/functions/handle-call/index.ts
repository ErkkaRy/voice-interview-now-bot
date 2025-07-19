
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
    
    console.log('Looking for interview invitation for phone:', to);
    console.log('All parameters:', { callSid, from, to });
    
    // Look for invitation by the Twilio number that received the call (to)
    // because Twilio uses proxy numbers for international calls
    const { data: invitationData, error: invitationError } = await supabase
      .from('interview_invitations')
      .select(`
        interview_id,
        interviews (*)
      `)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    console.log('Invitation query result:', { invitationData, invitationError });

    if (invitationData && invitationData.interviews) {
      interview = invitationData.interviews;
      console.log('Found interview from invitation:', interview.title, 'ID:', interview.id);
    } else {
      console.log('No invitation found, using fallback. Error:', invitationError);
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

    // Use traditional Gather approach instead of Stream for better compatibility
    const gatherUrl = `https://jhjbvmyfzmjrfoodphuj.supabase.co/functions/v1/ai-conversation?interviewId=${interview.id}&from=${encodeURIComponent(from)}`;
    
    console.log('Creating TwiML response with:', {
      interviewId: interview.id,
      from: from,
      gatherUrl: gatherUrl
    });
    
    const firstQuestion = interview.questions?.[0] || 'Kerro minulle jotain.';
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">Hei! Aloitetaan ${interview.title}. ${firstQuestion}</Say>
  <Gather input="speech" action="${gatherUrl}" method="POST" speechTimeout="3" language="fi-FI">
    <Say voice="alice" language="fi-FI">Kerro nyt vastauksesi.</Say>
  </Gather>
  <Say voice="alice" language="fi-FI">En kuullut vastausta. Hyvää päivänjatkoa!</Say>
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
