type SoundName = 'shoot' | 'hit' | 'explode' | 'pickup' | 'hurt' | 'steel' | 'wave' | 'victory' | 'defeat';

const soundPreset: Record<SoundName, { frequency: number; endFrequency: number; duration: number; type: OscillatorType; gain: number }> = {
  shoot: { frequency: 210, endFrequency: 90, duration: 0.08, type: 'square', gain: 0.045 },
  hit: { frequency: 140, endFrequency: 70, duration: 0.06, type: 'sawtooth', gain: 0.035 },
  explode: { frequency: 90, endFrequency: 28, duration: 0.24, type: 'sawtooth', gain: 0.06 },
  pickup: { frequency: 460, endFrequency: 920, duration: 0.15, type: 'square', gain: 0.04 },
  hurt: { frequency: 170, endFrequency: 55, duration: 0.18, type: 'square', gain: 0.05 },
  steel: { frequency: 980, endFrequency: 620, duration: 0.055, type: 'triangle', gain: 0.025 },
  wave: { frequency: 330, endFrequency: 660, duration: 0.28, type: 'square', gain: 0.035 },
  victory: { frequency: 520, endFrequency: 1040, duration: 0.52, type: 'triangle', gain: 0.045 },
  defeat: { frequency: 220, endFrequency: 55, duration: 0.52, type: 'sawtooth', gain: 0.045 },
};

export class AudioManager {
  private context?: AudioContext;
  private muted = localStorage.getItem('tank-defense-muted') === 'true';

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  play(name: SoundName): void {
    if (this.muted) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();

    const preset = soundPreset[name];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, preset.endFrequency), now + preset.duration);
    gain.gain.setValueAtTime(preset.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + preset.duration);
  }
}
