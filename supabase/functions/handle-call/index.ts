
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== HANDLE-CALL FUNCTION STARTED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
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
    console.log('Setting up WebSocket stream to OpenAI');
    
    // Use Twilio's Stream functionality to connect to our WebSocket endpoint
    const streamUrl = `wss://jhjbvmyfzmjrfoodphuj.functions.supabase.co/twilio-stream?interviewId=${interview.id}&from=${encodeURIComponent(from)}`;
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">Hei! Aloitetaan ${interview.title} haastattelu. Hetki kun yhdistän sinut tekoälyyn.</Say>
  <Stream url="${streamUrl}" />
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
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/xml; charset=utf-8'
      }
    });
  }
});
