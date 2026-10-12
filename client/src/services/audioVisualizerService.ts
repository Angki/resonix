/**
 * Audio Visualizer Service
 * Singleton bridge between PlayerBar WebAudio graph and HTML5 Canvas Visualizer
 */

class AudioVisualizerService {
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;
  private timeData: Uint8Array | null = null;

  public setAnalyser(analyser: AnalyserNode | null) {
    this.analyser = analyser;
    if (analyser) {
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      this.freqData = new Uint8Array(analyser.frequencyBinCount);
      this.timeData = new Uint8Array(analyser.frequencyBinCount);
    } else {
      this.freqData = null;
      this.timeData = null;
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getFrequencyData(): Uint8Array | null {
    if (!this.analyser || !this.freqData) return null;
    (this.analyser as any).getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  public getTimeDomainData(): Uint8Array | null {
    if (!this.analyser || !this.timeData) return null;
    (this.analyser as any).getByteTimeDomainData(this.timeData);
    return this.timeData;
  }

  /**
   * Returns normalized (0..1) energy levels for bass, mid, treble
   */
  public getEnergyLevels(): { bass: number; mid: number; treble: number; overall: number } {
    if (!this.analyser || !this.freqData) {
      return { bass: 0, mid: 0, treble: 0, overall: 0 };
    }
    (this.analyser as any).getByteFrequencyData(this.freqData);
    const bins = this.freqData.length;


    // Bass: bins 0 - 12 (approx 0 - 250Hz)
    let bassSum = 0;
    const bassCount = Math.min(14, bins);
    for (let i = 0; i < bassCount; i++) bassSum += this.freqData[i];
    const bass = bassSum / (bassCount * 255);

    // Mids: bins 14 - 60 (approx 250Hz - 2.5kHz)
    let midSum = 0;
    const midStart = 14;
    const midEnd = Math.min(60, bins);
    for (let i = midStart; i < midEnd; i++) midSum += this.freqData[i];
    const mid = midSum / ((midEnd - midStart) * 255);

    // Treble: bins 60 - 200 (approx 2.5kHz - 10kHz+)
    let trebSum = 0;
    const trebStart = 60;
    const trebEnd = Math.min(180, bins);
    for (let i = trebStart; i < trebEnd; i++) trebSum += this.freqData[i];
    const treble = trebSum / ((trebEnd - trebStart) * 255);

    const overall = (bass * 0.5 + mid * 0.3 + treble * 0.2);
    return { bass, mid, treble, overall };
  }
}

export const audioVisualizerService = new AudioVisualizerService();
