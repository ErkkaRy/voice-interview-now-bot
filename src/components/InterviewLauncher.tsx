import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageSquare, Loader2, Edit, Mic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import VoiceChat from "@/components/VoiceChat";

interface InterviewLauncherProps {
  interviews: any[];
  isLoading: boolean;
  onEditInterview: (interview: any) => void;
}

const InterviewLauncher = ({ interviews, isLoading, onEditInterview }: InterviewLauncherProps) => {
  const [selectedInterview, setSelectedInterview] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showVoiceTest, setShowVoiceTest] = useState(false);
  const { toast } = useToast();

  const handleSendInvite = async () => {
    if (!selectedInterview || !phoneNumber) {
      toast({
        title: "Virhe",
        description: "Valitse haastattelu ja syötä puhelinnumero.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('start-interview', {
        body: {
          phoneNumber,
          interviewId: selectedInterview
        }
      });

      if (error) throw error;
      
      toast({
        title: "Kutsutekstiviesti lähetetty!",
        description: `Haastattelu lähetetty numeroon ${phoneNumber}`,
      });

      // Reset form
      setSelectedInterview("");
      setPhoneNumber("");
    } catch (error) {
      console.error('Error starting interview:', error);
      toast({
        title: "Virhe",
        description: "Tekstiviestin lähettäminen epäonnistui",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const getTestInterview = () => {
    if (selectedInterview) {
      const interview = interviews.find(i => i.id === selectedInterview);
      if (interview) {
        console.log('Using selected interview for voice test:', interview.title, interview.questions);
        return {
          title: interview.title,
          questions: interview.questions
        };
      }
    }
    
    console.log('No interview selected, using default questions for voice test');
    // Fallback to default test questions
    return {
      title: "Voice Chat Testi",
      questions: ["Kerro itsestäsi", "Mikä on vahvuutesi?", "Miksi hakeutuisit tähän työhön?"]
    };
  };

  return (
    <>
      {showVoiceTest && (
        <VoiceChat 
          interview={getTestInterview()}
          onClose={() => setShowVoiceTest(false)}
        />
      )}
    <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-blue-600" />
          Käynnistä haastattelu
        </CardTitle>
        <CardDescription>
          Valitse haastattelu ja syötä haastateltavan puhelinnumero
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Interview Selection */}
        <div>
          <Label htmlFor="interview">Valitse haastattelu</Label>
          {isLoading ? (
            <div className="mt-1 p-3 text-center text-gray-500">
              Ladataan haastatteluja...
            </div>
          ) : (
            <Select value={selectedInterview} onValueChange={setSelectedInterview}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Valitse haastattelu..." />
              </SelectTrigger>
              <SelectContent>
                {interviews.length === 0 ? (
                  <div className="p-3 text-center text-gray-500">
                    Ei tallennettuja haastatteluja. Luo ensin haastattelu.
                  </div>
                ) : (
                  interviews.map((interview) => (
                    <div key={interview.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded">
                      <SelectItem value={interview.id} className="flex-1">
                        {interview.title} ({interview.questions.length} kysymystä)
                      </SelectItem>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditInterview(interview);
                        }}
                        size="sm"
                        variant="outline"
                        className="ml-2 h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
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

        {/* Test Voice Chat Button */}
        <Button 
          onClick={() => setShowVoiceTest(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 mb-4"
          variant="outline"
        >
          <Mic className="h-4 w-4 mr-2" />
          Testaa voice chat {selectedInterview ? `(${interviews.find(i => i.id === selectedInterview)?.title || ''})` : '(oletuskysymykset)'}
        </Button>

        {/* Launch Button */}
        <Button 
          onClick={handleSendInvite}
          className="w-full bg-green-600 hover:bg-green-700"
          disabled={!selectedInterview || !phoneNumber || isSending}
        >
          {isSending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Lähetetään...
            </>
          ) : (
            <>
              <MessageSquare className="h-4 w-4 mr-2" />
              Lähetä kutsutekstiviesti
            </>
          )}
        </Button>
      </CardContent>
    </Card>
    </>
  );
};

export default InterviewLauncher;