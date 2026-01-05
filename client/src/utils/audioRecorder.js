export class WavRecorder {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.audioInput = null;
    this.chunks = [];
    this.recording = false;
    this.onStop = null;
  }

  async start() {
    this.chunks = [];
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Error accessing microphone:", err);
      throw err;
    }

    this.audioInput = this.audioContext.createMediaStreamSource(this.mediaStream);
    
    // Buffer size 4096 provides a good balance between latency and performance
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.recording) return;
      const inputBuffer = event.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);
      // Clone the data to avoid reference issues
      this.chunks.push(new Float32Array(inputData));
    };

    this.audioInput.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
    
    this.recording = true;
  }

  stop() {
    this.recording = false;
    
    // Stop all tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    
    // Disconnect nodes
    if (this.audioInput) this.audioInput.disconnect();
    if (this.scriptProcessor) this.scriptProcessor.disconnect();
    
    // Process data
    if (this.chunks.length > 0 && this.audioContext) {
      const blob = this.exportWAV(this.chunks);
      if (this.onStop) {
        this.onStop(blob);
      }
    }

    // Close context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  exportWAV(chunks) {
    const bufferLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const buffer = new Float32Array(bufferLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    const sampleRate = this.audioContext.sampleRate;
    return this.encodeWAV(buffer, sampleRate);
  }

  encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    /* RIFF identifier */
    this.writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + samples.length * 2, true);
    /* RIFF type */
    this.writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    this.writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, 1, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * 2, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    this.writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, samples.length * 2, true);

    this.floatTo16BitPCM(view, 44, samples);

    return new Blob([view], { type: 'audio/wav' });
  }

  floatTo16BitPCM(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
