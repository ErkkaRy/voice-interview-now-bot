import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { RealtimeChat } from '@/utils/RealtimeAudio';

interface VoiceChatProps {
  interview: {
    title: string;
    questions: string[];
  };
  onClose: () => void;
}

export const VoiceChat: React.FC<VoiceChatProps> = ({ interview, onClose }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversation, setConversation] = useState<Array<{role: string, content: string, type?: string}>>([]);
  const { toast } = useToast();
  
  const realtimeChatRef = useRef<RealtimeChat | null>(null);

  useEffect(() => {
    return () => {
      realtimeChatRef.current?.disconnect();
    };
  }, []);

  const handleMessage = (event: any) => {
    console.log('Received message:', event);
    
    if (event.type === 'response.audio.delta') {
      setIsSpeaking(true);
    } else if (event.type === 'response.audio.done') {
      setIsSpeaking(false);
    } else if (event.type === 'response.audio_transcript.delta') {
      setConversation(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.type === 'transcript') {
          // Update existing transcript
          return [
            ...prev.slice(0, -1),
            { ...lastMessage, content: lastMessage.content + event.delta }
          ];
        } else {
          // Add new transcript message
          return [...prev, { role: 'assistant', content: event.delta, type: 'transcript' }];
        }
      });
    } else if (event.type === 'input_audio_buffer.speech_started') {
      console.log('Speech started');
    } else if (event.type === 'input_audio_buffer.speech_stopped') {
      console.log('Speech stopped');
    } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
      setConversation(prev => [...prev, { 
        role: 'user', 
        content: event.transcript,
        type: 'transcript'
      }]);
    }
  };

  const startConversation = async () => {
    try {
      setIsConnecting(true);
      realtimeChatRef.current = new RealtimeChat(handleMessage);
      await realtimeChatRef.current.init(interview.questions);
      setIsConnected(true);
      setIsConnecting(false);
      
      toast({
        title: "Yhdistetty",
        description: "Voice chat on valmis käyttöön",
      });
    } catch (error) {
      console.error('Error starting conversation:', error);
      setIsConnecting(false);
      toast({
        title: "Virhe",
        description: error instanceof Error ? error.message : 'Yhteyden muodostaminen epäonnistui',
        variant: "destructive",
      });
    }
  };

  const endConversation = () => {
    realtimeChatRef.current?.disconnect();
    setIsConnected(false);
    setIsSpeaking(false);
    setConversation([]);
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
            {isConnecting && (
              <div className="flex items-center justify-center gap-2 text-blue-600">
                <Volume2 className="h-5 w-5 animate-pulse" />
                <span>Yhdistetään...</span>
              </div>
            )}
            
            {isSpeaking && isConnected && (
              <div className="flex items-center justify-center gap-2 text-blue-600">
                <Volume2 className="h-5 w-5 animate-pulse" />
                <span>AI puhuu...</span>
              </div>
            )}
            
            {isConnected && !isSpeaking && !isConnecting && (
              <div className="text-green-600">
                <Mic className="h-5 w-5 mx-auto mb-2" />
                <span>Voit puhua - AI kuuntelee</span>
              </div>
            )}
            
            {!isConnected && !isConnecting && (
              <div className="text-gray-600">
                Paina "Aloita keskustelu" aloittaaksesi
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4">
            {!isConnected ? (
              <Button
                onClick={startConversation}
                disabled={isConnecting}
                className="bg-blue-500 hover:bg-blue-600"
                size="lg"
              >
                <Mic className="h-5 w-5 mr-2" />
                {isConnecting ? 'Yhdistetään...' : 'Aloita keskustelu'}
              </Button>
            ) : (
              <Button
                onClick={endConversation}
                className="bg-red-500 hover:bg-red-600"
                size="lg"
              >
                <MicOff className="h-5 w-5 mr-2" />
                Lopeta keskustelu
              </Button>
            )}
          </div>

          <div className="text-sm text-gray-500 text-center">
            <p>OpenAI gpt-4o-realtime-preview -malli käytössä</p>
            <p>AI kuuntelee puheesi ja vastaa äänellä reaaliajassa</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};