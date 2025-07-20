import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { RealtimeChat } from '@/utils/RealtimeAudio';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';

interface VoiceChatProps {
  interview?: {
    title: string;
    questions: string[];
  };
  onClose?: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const VoiceChat: React.FC<VoiceChatProps> = ({ interview, onClose }) => {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const chatRef = useRef<RealtimeChat | null>(null);

  const handleMessage = (event: any) => {
    console.log('Received event:', event.type);
    
    if (event.type === 'response.audio_transcript.delta') {
      // Handle AI speech transcript
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.content += event.delta;
        } else {
          newMessages.push({
            role: 'assistant',
            content: event.delta,
            timestamp: new Date()
          });
        }
        
        return newMessages;
      });
    } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
      // Handle user speech transcript
      setMessages(prev => [...prev, {
        role: 'user',
        content: event.transcript,
        timestamp: new Date()
      }]);
    } else if (event.type === 'response.audio.delta') {
      setIsAISpeaking(true);
    } else if (event.type === 'response.audio.done') {
      setIsAISpeaking(false);
    } else if (event.type === 'session.created') {
      console.log('Session created successfully');
    } else if (event.type === 'session.updated') {
      console.log('Session updated successfully');
    }
  };

  const startConversation = async () => {
    setIsConnecting(true);
    try {
      chatRef.current = new RealtimeChat(
        handleMessage,
        () => {
          setIsConnected(true);
          setIsConnecting(false);
          toast({
            title: "Yhdistetty",
            description: "Äänichatti on valmis käyttöön",
          });
        },
        () => {
          setIsConnected(false);
          setIsConnecting(false);
          setIsAISpeaking(false);
        }
      );
      
      await chatRef.current.connect();
    } catch (error) {
      setIsConnecting(false);
      console.error('Error starting conversation:', error);
      toast({
        title: "Virhe",
        description: error instanceof Error ? error.message : 'Yhteyden muodostaminen epäonnistui',
        variant: "destructive",
      });
    }
  };

  const endConversation = () => {
    chatRef.current?.disconnect();
    setIsConnected(false);
    setIsAISpeaking(false);
    setMessages([]);
    
    toast({
      title: "Yhteys katkaisttu",
      description: "Äänichatti on lopetettu",
    });
    
    // Close modal if onClose is provided
    onClose?.();
  };

  useEffect(() => {
    return () => {
      chatRef.current?.disconnect();
    };
  }, []);

  const isModal = !!onClose;
  const title = interview?.title || "OpenAI Äänichatti";

  const content = (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader className={isModal ? "flex flex-row items-center justify-between" : ""}>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-6 w-6" />
            {title}
          </CardTitle>
          {isModal && onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <PhoneOff className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            {!isConnected ? (
              <Button 
                onClick={startConversation}
                disabled={isConnecting}
                className="bg-primary hover:bg-primary/90 text-white"
                size="lg"
              >
                {isConnecting ? (
                  <>
                    <Phone className="mr-2 h-4 w-4 animate-pulse" />
                    Yhdistetään...
                  </>
                ) : (
                  <>
                    <Phone className="mr-2 h-4 w-4" />
                    Aloita keskustelu
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={endConversation}
                variant="destructive"
                size="lg"
              >
                <PhoneOff className="mr-2 h-4 w-4" />
                Lopeta keskustelu
              </Button>
            )}
          </div>

          {isConnected && (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                {isAISpeaking ? (
                  <>
                    <MicOff className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">AI puhuu...</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600">Voit puhua nyt</span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Mikrofoni on aktiivinen. Puhu suomeksi!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {messages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Keskustelu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary/10 text-primary ml-4'
                      : 'bg-muted mr-4'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm">{message.content}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {message.timestamp.toLocaleTimeString('fi-FI', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Render as modal if onClose is provided
  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="w-full max-w-2xl mx-4 max-h-[80vh] overflow-auto">
          {content}
        </div>
      </div>
    );
  }

  return content;
};

export default VoiceChat;