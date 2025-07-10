import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageSquare, Clock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Interview {
  id: string;
  title: string;
  questions: string[];
}

const InterviewLauncher = () => {
  const [selectedInterview, setSelectedInterview] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [interviewStatus, setInterviewStatus] = useState<"idle" | "sms-sent" | "waiting" | "active">("idle");
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch interviews on component mount
  useEffect(() => {
    fetchInterviews();
  }, []);

  const fetchInterviews = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-interviews');
      
      if (error) {
        throw error;
      }

      const result = await data;
      setInterviews(result.interviews || []);
    } catch (error) {
      console.error('Error fetching interviews:', error);
      toast({
        title: "Virhe",
        description: "Haastattelujen lataaminen epäonnistui.",
        variant: "destructive",
      });
    }
  };

  const handleSendSMS = async () => {
    if (!selectedInterview || !phoneNumber) {
      toast({
        title: "Virhe",
        description: "Valitse haastattelu ja syötä puhelinnumero.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setInterviewStatus("sms-sent");

    try {
      const { data, error } = await supabase.functions.invoke('start-interview', {
        body: {
          interviewId: selectedInterview,
          phoneNumber: phoneNumber
        }
      });

      if (error) {
        throw error;
      }

      const result = await data;
      
      if (result.success) {
        toast({
          title: "Tekstiviesti lähetetty!",
          description: `Kutsu lähetetty numeroon ${phoneNumber}. Odotetaan vastausta...`,
        });

        // Simulate waiting for response (in real app, you'd use webhooks or polling)
        setTimeout(() => {
          setInterviewStatus("waiting");
          toast({
            title: "Haastateltava vastasi",
            description: "Aloitetaan puhelu...",
          });
          
          setTimeout(() => {
            setInterviewStatus("active");
            toast({
              title: "Puhelu käynnissä",
              description: "AI-botti keskustelee haastateltavan kanssa.",
            });
          }, 2000);
        }, 5000);
      } else {
        throw new Error(result.error || 'Tuntematon virhe');
      }
    } catch (error) {
      console.error('Error starting interview:', error);
      toast({
        title: "Virhe",
        description: "Haastattelun käynnistäminen epäonnistui.",
        variant: "destructive",
      });
      setInterviewStatus("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const resetInterview = () => {
    setInterviewStatus("idle");
    setSelectedInterview("");
    setPhoneNumber("");
  };

  const getStatusIcon = () => {
    switch (interviewStatus) {
      case "idle":
        return <Phone className="h-5 w-5 text-blue-600" />;
      case "sms-sent":
        return <MessageSquare className="h-5 w-5 text-orange-600" />;
      case "waiting":
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case "active":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
  };

  const getStatusText = () => {
    switch (interviewStatus) {
      case "idle":
        return "Valmiina aloittamaan";
      case "sms-sent":
        return "Tekstiviesti lähetetty - odotetaan vastausta";
      case "waiting":
        return "Aloitetaan puhelu...";
      case "active":
        return "Haastattelu käynnissä";
    }
  };

  const getStatusColor = () => {
    switch (interviewStatus) {
      case "idle":
        return "text-blue-600";
      case "sms-sent":
        return "text-orange-600";
      case "waiting":
        return "text-yellow-600";
      case "active":
        return "text-green-600";
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon()}
            Käynnistä haastattelu
          </CardTitle>
          <CardDescription>
            Valitse haastattelu ja syötä haastateltavan puhelinnumero
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Display */}
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <p className={`font-semibold ${getStatusColor()}`}>
              {getStatusText()}
            </p>
            {interviewStatus === "sms-sent" && (
              <p className="text-sm text-slate-600 mt-2">
                Haastateltava saa tekstiviestin: "Hei! Sinulla on haastattelu odottamassa. Vastaa 'KYLLÄ' kun olet valmis aloittamaan puhelun."
              </p>
            )}
          </div>

          {interviewStatus === "idle" && (
            <>
              {/* Interview Selection */}
              <div>
                <Label htmlFor="interview-select">Valitse haastattelu</Label>
                <Select value={selectedInterview} onValueChange={setSelectedInterview}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Valitse haastattelu..." />
                  </SelectTrigger>
                  <SelectContent>
                    {interviews.map((interview) => (
                      <SelectItem key={interview.id} value={interview.id}>
                        {interview.title} ({interview.questions.length} kysymystä)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Phone Number Input */}
              <div>
                <Label htmlFor="phone">Haastateltavan puhelinnumero</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+358 50 123 4567"
                  className="mt-1"
                />
                <p className="text-sm text-slate-600 mt-1">
                  Syötä numero kansainvälisessä muodossa (esim. +358501234567)
                </p>
              </div>

              {/* Launch Button */}
              <Button 
                onClick={handleSendSMS}
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={!selectedInterview || !phoneNumber || isLoading}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {isLoading ? "Lähetetään..." : "Lähetä kutsutekstiviesti"}
              </Button>
            </>
          )}

          {interviewStatus === "active" && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800 mb-2">Haastattelu on käynnissä</h3>
                <p className="text-green-700 text-sm">
                  AI-botti keskustelee haastateltavan kanssa. Voit seurata tilannetta reaaliajassa.
                </p>
              </div>
              
              <div className="border border-slate-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                <h4 className="font-semibold mb-2">Keskustelu (live)</h4>
                <div className="space-y-2 text-sm">
                  <div className="text-blue-600">
                    <strong>AI:</strong> Hei! Aloitetaan haastattelu. Kerro ensiksi hieman itsestäsi.
                  </div>
                  <div className="text-slate-600">
                    <strong>Haastateltava:</strong> Vastaus kuuluu tähän...
                  </div>
                  <div className="text-slate-400 italic">
                    Haastattelu jatkuu...
                  </div>
                </div>
              </div>

              <Button 
                variant="outline" 
                onClick={resetInterview}
                className="w-full border-slate-300 hover:bg-slate-50"
              >
                Lopeta haastattelu
              </Button>
            </div>
          )}

          {(interviewStatus === "sms-sent" || interviewStatus === "waiting") && (
            <Button 
              variant="outline" 
              onClick={resetInterview}
              className="w-full border-slate-300 hover:bg-slate-50"
            >
              Peruuta
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InterviewLauncher;
