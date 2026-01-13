import * as lamejs from 'lamejs';

export class Mp3Recorder {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.audioInput = null;
    this.encoder = null;
    this.dataBuffer = [];
    this.recording = false;
    this.onStop = null;
  }

  async start() {
    this.dataBuffer = [];
    // Force 44.1kHz to ensure lamejs compatibility regardless of hardware native rate
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
    } catch (err) {
      console.error("Error accessing microphone:", err);
      throw err;
    }

    // Initialize encoder: 1 channel, context sample rate (44100), 128kbps
    // We use context.sampleRate because WebAudio automatically resamples input to match context
    this.encoder = new lamejs.Mp3Encoder(1, this.audioContext.sampleRate, 128);

    this.audioInput = this.audioContext.createMediaStreamSource(this.mediaStream);
    
    // Buffer size 4096 (standard for script processor)
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.recording) return;

      const inputData = event.inputBuffer.getChannelData(0);
      
      // Convert Float32 to Int16
      const mp3Input = this.convertBuffer(inputData);
      
      // Encode
      const mp3Data = this.encoder.encodeBuffer(mp3Input);
      if (mp3Data.length > 0) {
        this.dataBuffer.push(mp3Data);
      }
    };

    this.audioInput.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
    
    this.recording = true;
  }

  stop() {
    if (!this.recording) return;
    this.recording = false;
    
    // Cleanup WebAudio nodes
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.audioInput) this.audioInput.disconnect();
    if (this.scriptProcessor) this.scriptProcessor.disconnect();
    
    // Flush encoder
    if (this.encoder) {
      const mp3Data = this.encoder.flush();
      if (mp3Data.length > 0) {
        this.dataBuffer.push(mp3Data);
      }
    }

    // Create final blob
    const blob = new Blob(this.dataBuffer, { type: 'audio/mp3' });
    
    if (this.onStop) {
      this.onStop(blob);
    }

    // Close context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  convertBuffer(arrayBuffer) {
    const data = new Float32Array(arrayBuffer);
    const out = new Int16Array(arrayBuffer.length);
    this.floatTo16BitPCM(data, out);
    return out;
  }

  floatTo16BitPCM(input, output) {
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
  }
}
