-- Create table to track which interview was sent to which phone number
CREATE TABLE public.interview_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  interview_id UUID NOT NULL REFERENCES public.interviews(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.interview_invitations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow reading invitations
CREATE POLICY "Anyone can read interview invitations" 
ON public.interview_invitations 
FOR SELECT 
USING (true);

-- Create policy to allow inserting invitations
CREATE POLICY "Anyone can insert interview invitations" 
ON public.interview_invitations 
FOR INSERT 
WITH CHECK (true);

-- Create index for better performance
CREATE INDEX idx_interview_invitations_phone_number ON public.interview_invitations(phone_number);
CREATE INDEX idx_interview_invitations_created_at ON public.interview_invitations(created_at);