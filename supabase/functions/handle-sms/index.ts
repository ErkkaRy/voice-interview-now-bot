
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
    const from = formData.get('From');
    const body = formData.get('Body')?.toString().toUpperCase().trim();
    
    console.log('SMS received:', { from, body });

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if response is positive
    if (body === 'KYLLÄ' || body === 'KYLLA' || body === 'YES' || body === 'Y') {
      // Get the most recent interview for this phone number (simplified approach)
      const { data: interview, error: interviewError } = await supabase
        .from('interviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (interviewError || !interview) {
        console.error('Interview not found:', interviewError);
        return new Response('OK', { status: 200 });
      }

      // Make outbound call using Twilio
      const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER') || '+12345678901'; // Replace with your actual number
      
      const callUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
      
      const twilioResponse = await fetch(callUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: from,
          From: twilioPhoneNumber,
          Url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/handle-call`,
          Method: 'POST'
        }),
      });

      if (!twilioResponse.ok) {
        const twilioError = await twilioResponse.text();
        console.error('Twilio call error:', twilioError);
      } else {
        const twilioData = await twilioResponse.json();
        console.log('Call initiated successfully:', twilioData.sid);
      }
    } else if (body === 'EI' || body === 'NO' || body === 'N') {
      // Handle negative response - just log it for now
      console.log('User declined interview call');
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Error handling SMS:', error);
    return new Response('OK', { status: 200 });
  }
});
