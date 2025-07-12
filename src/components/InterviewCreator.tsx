import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Upload, Plus, Trash2, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const InterviewCreator = () => {
  const [interviewTitle, setInterviewTitle] = useState("");
  const [questions, setQuestions] = useState<string[]>([""]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const { toast } = useToast();

  const addQuestion = () => {
    setQuestions([...questions, ""]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestion = (index: number, value: string) => {
    const newQuestions = [...questions];
    newQuestions[index] = value;
    setQuestions(newQuestions);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      toast({
        title: "Tiedosto ladattu",
        description: `${file.name} on ladattu onnistuneesti.`,
      });
    }
  };

  const handleSaveInterview = async () => {
    if (!interviewTitle.trim()) {
      toast({
        title: "Virhe",
        description: "Anna haastattelulle nimi.",
        variant: "destructive",
      });
      return;
    }

    const validQuestions = questions.filter(q => q.trim() !== "");
    if (validQuestions.length === 0) {
      toast({
        title: "Virhe",
        description: "Lisää vähintään yksi kysymys.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log('Sending data to save-interview:', { title: interviewTitle, questions: validQuestions });
      
      const { data, error } = await supabase.functions.invoke('save-interview', {
        body: {
          title: interviewTitle,
          questions: validQuestions
        }
      });

      console.log('Response from save-interview:', { data, error });

      if (error) {
        throw error;
      }

      if (data && data.interview) {
        toast({
          title: "Haastattelu tallennettu!",
          description: `"${interviewTitle}" on luotu ${validQuestions.length} kysymyksellä.`,
        });

        // Reset form
        setInterviewTitle("");
        setQuestions([""]);
        setUploadedFile(null);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('Error saving interview:', error);
      toast({
        title: "Virhe",
        description: "Haastattelun tallentaminen epäonnistui.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestWithBot = async () => {
    if (!interviewTitle.trim()) {
      toast({
        title: "Virhe",
        description: "Anna haastattelulle nimi ensin.",
        variant: "destructive",
      });
      return;
    }

    const validQuestions = questions.filter(q => q.trim() !== "");
    if (validQuestions.length === 0) {
      toast({
        title: "Virhe",
        description: "Lisää vähintään yksi kysymys testattavaksi.",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);

    try {
      // Simulate testing with the bot
      toast({
        title: "Testi aloitettu!",
        description: `Testataan haastattelua "${interviewTitle}" ${validQuestions.length} kysymyksellä...`,
      });

      // Simulate a delay for testing
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast({
        title: "Testi valmis!",
        description: "Haastattelu testattiin onnistuneesti. Voit nyt tallentaa sen.",
      });

    } catch (error) {
      console.error('Error testing interview:', error);
      toast({
        title: "Virhe",
        description: "Haastattelun testaaminen epäonnistui.",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Luo uusi haastattelu
          </CardTitle>
          <CardDescription>
            Määritä haastattelun nimi ja kysymykset, tai lataa ne tiedostosta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Interview Title */}
          <div>
            <Label htmlFor="title">Haastattelun nimi</Label>
            <Input
              id="title"
              value={interviewTitle}
              onChange={(e) => setInterviewTitle(e.target.value)}
              placeholder="esim. Ohjelmistokehittäjä - Tekninen haastattelu"
              className="mt-1"
            />
          </div>

          {/* File Upload Option */}
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
            <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-slate-600 mb-4">
              Lataa kysymykset tiedostosta (Word, PDF, txt)
            </p>
            <input
              type="file"
              accept=".doc,.docx,.pdf,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <Label htmlFor="file-upload" className="cursor-pointer">
              <Button variant="outline" className="border-slate-300 hover:bg-slate-50">
                Valitse tiedosto
              </Button>
            </Label>
            {uploadedFile && (
              <p className="text-green-600 mt-2 text-sm">
                Ladattu: {uploadedFile.name}
              </p>
            )}
          </div>

          {/* Manual Questions */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <Label className="text-base font-semibold">Haastattelukysymykset</Label>
              <Button onClick={addQuestion} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-1" />
                Lisää kysymys
              </Button>
            </div>
            
            <div className="space-y-4">
              {questions.map((question, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex-1">
                    <Textarea
                      value={question}
                      onChange={(e) => updateQuestion(index, e.target.value)}
                      placeholder={`Kysymys ${index + 1}...`}
                      className="min-h-[80px]"
                    />
                  </div>
                  {questions.length > 1 && (
                    <Button
                      onClick={() => removeQuestion(index)}
                      variant="outline"
                      size="sm"
                      className="mt-auto mb-2 border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <Button 
              onClick={handleSaveInterview} 
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading ? "Tallennetaan..." : "Tallenna haastattelu"}
            </Button>
            <Button 
              variant="outline" 
              className="border-slate-300 hover:bg-slate-50"
              onClick={handleTestWithBot}
              disabled={isTesting}
            >
              <Phone className="h-4 w-4 mr-2" />
              {isTesting ? "Testataan..." : "Testaa botilla"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InterviewCreator;
