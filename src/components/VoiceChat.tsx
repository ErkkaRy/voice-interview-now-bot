import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface VoiceChatProps {
  interview: {
    title: string;
    questions: string[];
  };
  onClose: () => void;
}

export const VoiceChat: React.FC<VoiceChatProps> = ({ interview, onClose }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const [conversation, setConversation] = useState<Array<{role: string, content: string}>>([]);
  const { toast } = useToast();
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Initialize with interview introduction
    const intro = `Hei! Aloitetaan haastattelu: ${interview.title}. Ensimmäinen kysymys: ${interview.questions[0] || 'Kerro itsestäsi.'}`;
    setConversation([{ role: 'assistant', content: intro }]);
    
    // Speak the introduction
    speakText(intro);
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [interview]);

  const speakText = async (text: string) => {
    try {
      setIsSpeaking(true);
      
      // Use browser's speech synthesis as a quick test
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'fi-FI';
        utterance.rate = 0.9;
        utterance.onend = () => setIsSpeaking(false);
        speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.error('Error in text-to-speech:', error);
      setIsSpeaking(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      audioChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      
      toast({
        title: "Nauhoitus aloitettu",
        description: "Puhu nyt vastauksesi",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Virhe",
        description: "Mikrofonin käyttö epäonnistui",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      // Convert audio to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        // For now, simulate speech recognition
        // In a real implementation, you would send this to OpenAI Whisper
        const simulatedTranscript = "Tämä on simuloitu vastaus audiosta.";
        
        setConversation(prev => [...prev, { role: 'user', content: simulatedTranscript }]);
        
        // Generate AI response
        const aiResponse = generateNextQuestion();
        setConversation(prev => [...prev, { role: 'assistant', content: aiResponse }]);
        
        // Speak the AI response
        await speakText(aiResponse);
      };
      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error('Error processing audio:', error);
      toast({
        title: "Virhe",
        description: "Äänen käsittely epäonnistui",
        variant: "destructive",
      });
    }
  };

  const generateNextQuestion = () => {
    const currentQuestionIndex = conversation.filter(msg => msg.role === 'assistant').length;
    
    if (currentQuestionIndex < interview.questions.length) {
      return interview.questions[currentQuestionIndex];
    } else {
      return "Kiitos haastattelusta! Onko sinulla vielä jotain lisättävää?";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Voice Chat - {interview.title}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Conversation Display */}
          <div className="h-64 overflow-y-auto border rounded p-4 space-y-2">
            {conversation.map((message, index) => (
              <div 
                key={index} 
                className={`p-2 rounded ${
                  message.role === 'assistant' 
                    ? 'bg-blue-100 text-blue-900' 
                    : 'bg-gray-100 text-gray-900 ml-8'
                }`}
              >
                <strong>{message.role === 'assistant' ? 'AI: ' : 'Sinä: '}</strong>
                {message.content}
              </div>
            ))}
          </div>

          {/* Current Status */}
          <div className="text-center p-4 border rounded">
            {isSpeaking && (
              <div className="flex items-center justify-center gap-2 text-blue-600">
                <Volume2 className="h-5 w-5 animate-pulse" />
                <span>AI puhuu...</span>
              </div>
            )}
            
            {isRecording && (
              <div className="flex items-center justify-center gap-2 text-red-600">
                <Mic className="h-5 w-5 animate-pulse" />
                <span>Kuuntelen vastaustasi...</span>
              </div>
            )}
            
            {!isSpeaking && !isRecording && (
              <div className="text-gray-600">
                Paina mikrofonia aloittaaksesi vastaamisen
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4">
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isSpeaking}
              className={isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}
              size="lg"
            >
              {isRecording ? (
                <>
                  <MicOff className="h-5 w-5 mr-2" />
                  Lopeta nauhoitus
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5 mr-2" />
                  Aloita vastaaminen
                </>
              )}
            </Button>
          </div>

          <div className="text-sm text-gray-500 text-center">
            <p>Tämä on demo-versio voice chatista.</p>
            <p>Oikeassa versiossa käytettäisiin OpenAI:n Whisper-tunnistusta ja real-time -puhesynteesiä.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};