import { supabase } from "@/integrations/supabase/client";

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor(private onAudioData: (audioData: Float32Array) => void) {}

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      this.audioContext = new AudioContext({
        sampleRate: 24000,
      });
      
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.onAudioData(new Float32Array(inputData));
      };
      
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  stop() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const encodeAudioForAPI = (float32Array: Float32Array): string => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
};

const createWavFromPCM = (pcmData: Uint8Array): Uint8Array => {
  const int16Data = new Int16Array(pcmData.length / 2);
  for (let i = 0; i < pcmData.length; i += 2) {
    int16Data[i / 2] = (pcmData[i + 1] << 8) | pcmData[i];
  }
  
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + int16Data.byteLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, int16Data.byteLength, true);

  const wavArray = new Uint8Array(wavHeader.byteLength + int16Data.byteLength);
  wavArray.set(new Uint8Array(wavHeader), 0);
  wavArray.set(new Uint8Array(int16Data.buffer), wavHeader.byteLength);
  
  return wavArray;
};

class AudioQueue {
  private queue: Uint8Array[] = [];
  private isPlaying = false;
  public audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  async addToQueue(audioData: Uint8Array) {
    this.queue.push(audioData);
    if (!this.isPlaying) {
      await this.playNext();
    }
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioData = this.queue.shift()!;

    try {
      console.log('Playing audio chunk, size:', audioData.length);
      const wavData = createWavFromPCM(audioData);
      console.log('Created WAV data, size:', wavData.length);
      
      const audioBuffer = await this.audioContext.decodeAudioData(wavData.buffer);
      console.log('Decoded audio buffer, duration:', audioBuffer.duration);
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      source.onended = () => {
        console.log('Audio chunk ended, playing next');
        this.playNext();
      };
      source.start(0);
    } catch (error) {
      console.error('Error playing audio:', error);
      this.playNext();
    }
  }
}

let audioQueueInstance: AudioQueue | null = null;

export const playAudioData = async (audioContext: AudioContext, audioData: Uint8Array) => {
  if (!audioQueueInstance || audioQueueInstance.audioContext !== audioContext) {
    console.log('Creating new AudioQueue instance');
    audioQueueInstance = new AudioQueue(audioContext);
  }
  await audioQueueInstance.addToQueue(audioData);
};

export const resetAudioQueue = () => {
  console.log('Resetting audio queue');
  audioQueueInstance = null;
};

export class RealtimeChat {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private recorder: AudioRecorder | null = null;
  private onMessageCallback: (message: any) => void;

  constructor(onMessage: (message: any) => void) {
    this.onMessageCallback = onMessage;
  }

  async init(interviewQuestions: string[]) {
    try {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      console.log('Audio context created, state:', this.audioContext.state);
      
      // Resume audio context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('Audio context resumed, new state:', this.audioContext.state);
      }
      
      // Get Azure API key from Supabase
      const { data, error } = await supabase.functions.invoke('get-azure-key');
      
      if (error) {
        console.error('Error invoking get-azure-key function:', error);
        throw new Error(`Failed to get Azure API key: ${error.message}`);
      }
      
      if (!data?.apiKey) {
        console.error('No API key in response:', data);
        throw new Error('Failed to get Azure API key: No key returned');
      }
      
      const apiKey = data.apiKey;

      // Connect directly to Azure OpenAI
      const azureUrl = `wss://erkka-ma03prm3-eastus2.cognitiveservices.azure.com/openai/realtime?api-version=2024-10-01-preview&deployment=gpt-4o-realtime-preview&api-key=${apiKey}`;
      console.log('Connecting directly to Azure OpenAI...');
      
      this.ws = new WebSocket(azureUrl);
      
      this.ws.onopen = () => {
        console.log('Connected directly to Azure OpenAI');
      };

      this.ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('Received message from Azure OpenAI:', data.type, data);
        
        // Handle session.created event - send configuration
        if (data.type === 'session.created') {
          console.log('Session created, sending configuration');
          const sessionUpdate = {
            type: 'session.update',
            session: {
              modalities: ["text", "audio"],
              instructions: `Olet suomenkielinen haastattelija. Tärkeää:

KÄYTÄ NÄITÄ HAASTATTELUKYSYMYKSIÄ:
${interviewQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

OHJEET:
- Aloita tervehtimällä ja kerro että kyseessä on haastattelu
- Kysele yllä olevia kysymyksiä järjestyksessä
- Kuuntele vastauksia ja tee tarkentavia kysymyksiä
- Siirry seuraavaan kysymykseen kun saat riittävän vastauksen
- Ole luonnollinen ja keskusteleva
- Pidä vastaukset lyhyinä (alle 50 sanaa)
- ÄLÄ keksi omia kysymyksiä, käytä vain yllä olevia`,
              voice: "alloy",
              input_audio_format: "pcm16",
              output_audio_format: "pcm16",
              input_audio_transcription: {
                model: "whisper-1"
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 1000
              },
              temperature: 0.8,
              max_response_output_tokens: "inf"
            }
          };
          this.ws?.send(JSON.stringify(sessionUpdate));
          
          // Start audio recording after session is configured
          await this.startAudioRecording();
          this.onMessageCallback({ type: 'ready' });
        } else if (data.type === 'response.audio.delta') {
          console.log('Received audio delta, playing...');
          const binaryString = atob(data.delta);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          await playAudioData(this.audioContext!, bytes);
        } else if (data.type === 'response.audio_transcript.delta') {
          console.log('AI transcript:', data.delta);
          this.onMessageCallback({
            type: 'assistant.message',
            content: data.delta
          });
        } else if (data.type === 'input_audio_buffer.speech_started') {
          console.log('User speech started');
          this.onMessageCallback({ type: 'user.speaking_started' });
        } else if (data.type === 'input_audio_buffer.speech_stopped') {
          console.log('User speech stopped');
          this.onMessageCallback({ type: 'user.speaking_stopped' });
        } else if (data.type === 'error') {
          console.error('OpenAI error:', data.error);
        }
        
        this.onMessageCallback(data);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
      };
      
    } catch (error) {
      console.error('Error initializing chat:', error);
      throw error;
    }
  }

  private async startAudioRecording() {
    try {
      console.log('Starting audio recording...');
      this.recorder = new AudioRecorder((audioData) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: encodeAudioForAPI(audioData)
          }));
        }
      });
      
      await this.recorder.start();
      console.log('Audio recording started successfully');
    } catch (error) {
      console.error('Failed to start audio recording:', error);
      this.onMessageCallback({ 
        type: 'error', 
        message: 'Mikrofonin käyttöoikeus vaaditaan äänikeskusteluun. Anna lupa selaimessa.' 
      });
    }
  }

  async sendMessage(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not ready');
    }

    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(event));
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  disconnect() {
    console.log('Disconnecting RealtimeChat');
    this.recorder?.stop();
    this.ws?.close();
    this.audioContext?.close();
    resetAudioQueue(); // Reset audio queue to prevent issues on reconnect
  }
}