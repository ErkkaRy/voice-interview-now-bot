
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

    // Find pending call for this phone number
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('*, interviews(*)')
      .eq('phone_number', from)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (callError || !call) {
      console.error('Call not found:', callError);
      // Return TwiML for unknown caller
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">Anteeksi, en löydä aktiivista haastattelua tälle numerolle.</Say>
  <Hangup/>
</Response>`;
      return new Response(twiml, {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    // Update call status
    await supabase
      .from('calls')
      .update({ 
        status: 'active',
        call_sid: callSid,
        started_at: new Date().toISOString()
      })
      .eq('id', call.id);

    // Create TwiML response to start the interview
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-conversation`;
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fi-FI">Hei! Aloitetaan haastattelu. Kuuntelen sinua nyt.</Say>
  <Record 
    timeout="3"
    finishOnKey=""
    maxLength="30"
    playBeep="false"
    recordingStatusCallback="${webhookUrl}?callId=${call.id}"
    recordingStatusCallbackMethod="POST"
  />
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
