
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
    const { title, questions, id } = await req.json();
    
    console.log('Received data:', { title, questions, id });
    
    if (!title || !questions || !Array.isArray(questions)) {
      throw new Error('Title and questions array are required');
    }

    // Filter out empty questions
    const validQuestions = questions.filter(q => q && q.trim() !== '');
    
    if (validQuestions.length === 0) {
      throw new Error('At least one valid question is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let interview, dbError;

    if (id) {
      // Update existing interview
      const result = await supabase
        .from('interviews')
        .update({
          title,
          questions: validQuestions,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      
      interview = result.data;
      dbError = result.error;
    } else {
      // Create new interview
      const result = await supabase
        .from('interviews')
        .insert({
          title,
          questions: validQuestions
        })
        .select()
        .single();
      
      interview = result.data;
      dbError = result.error;
    }

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error('Failed to save interview to database');
    }

    console.log('Saved interview:', interview);

    return new Response(
      JSON.stringify({ interview }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error saving interview:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
