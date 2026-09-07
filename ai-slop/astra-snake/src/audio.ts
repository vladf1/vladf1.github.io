export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private voices = new Set<AudioScheduledSourceNode>();
  private explosionNoise?: AudioBuffer;
  enabled = true;
  async unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.2;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Audio support isn't required to play. */ }
  }
  clear() {
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already stopped. */ } }
    this.voices.clear();
  }
  private note(hz: number, at: number, duration: number, type: OscillatorType = 'sine', volume = 0.3, endHz?: number) {
    if (!this.enabled || !this.context || !this.master || this.context.state !== 'running' || this.voices.size > 20) return;
    const osc = this.context.createOscillator(), gain = this.context.createGain();
    const time = this.context.currentTime + at;
    osc.type = type; osc.frequency.setValueAtTime(hz, time);
    if (endHz) osc.frequency.exponentialRampToValueAtTime(endHz, time + duration);
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain); gain.connect(this.master);
    this.voices.add(osc);
    osc.onended = () => { this.voices.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(time); osc.stop(time + duration + 0.01);
  }
  private explosion() {
    if (!this.enabled || !this.context || !this.master || this.context.state !== 'running') return;
    const context = this.context, duration = .28, time = context.currentTime;
    if (!this.explosionNoise) {
      this.explosionNoise = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const data = this.explosionNoise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.explosionNoise;
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(2400, time);
    filter.frequency.exponentialRampToValueAtTime(160, time + duration);
    gain.gain.setValueAtTime(.001, time); gain.gain.linearRampToValueAtTime(.65, time + .005);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(time); source.stop(time + duration);
  }
  play(kind: 'start' | 'food' | 'bonus' | 'spawn' | 'death' | 'best' | 'pause', combo = 1) {
    if (kind === 'food') { const hz = [330, 392, 440, 523, 659][Math.min(4, combo - 1)]; this.note(hz, 0, 0.13, 'sine', .5); this.note(hz * 2, .045, .17, 'triangle', .13); }
    if (kind === 'start') [330, 440, 660].forEach((n, i) => this.note(n, i * .07, .22, 'sine', .25));
    if (kind === 'bonus' || kind === 'best') [523, 659, 784, 1047].forEach((n, i) => this.note(n, i * .055, .3, 'triangle', .2));
    if (kind === 'spawn') { this.note(880, 0, .2, 'sine', .18); this.note(1175, .12, .3, 'sine', .12); }
    if (kind === 'death') { this.explosion(); this.note(150, 0, .35, 'triangle', .65, 35); this.note(70, .04, .4, 'sine', .6, 25); }
    if (kind === 'pause') this.note(400, 0, .12, 'sine', .12, 260);
  }
}
