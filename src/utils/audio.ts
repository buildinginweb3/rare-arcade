/**
 * Lightweight 8-bit retro WebAudio synthesizer.
 * Zero external sound assets needed.
 * Synthesizes vintage square/noise bleeps with envelope control.
 */

class RetroAudioEngine {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    // Lazy initialize on first interaction
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  /**
   * Tactile button click (subtle high-pitch blip, 15ms).
   */
  public playClick() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.015);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.015);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.015);
  }

  /**
   * RF Token drop into coin slot.
   */
  public playInsertCoin() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5
    osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08); // E6

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  /**
   * 5% RF Burn pixel sizzle (filtered noise / decaying frequency).
   */
  public playBurn() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }

  /**
   * Machine drum shake & hatch opening.
   */
  public playDrumRoll() {
    const ctx = this.getContext();
    if (!ctx) return;

    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const time = ctx.currentTime + i * 0.07;

      osc.type = 'square';
      osc.frequency.setValueAtTime(120 + i * 40, time);

      gain.gain.setValueAtTime(0.08, time);
      gain.gain.linearRampToValueAtTime(0.001, time + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + 0.04);
    }
  }

  /**
   * Shell-specific mechanical hooks (restrained, stepped, pixel-consistent).
   * CLASSIC: drum ticks + hatch click. CAPSULE: plastic tick + drop + pop.
   * TALLBOY: motor ticks + claw close + release. MINI: reel clicks + stops.
   */
  private blip(freq: number, delay: number, dur = 0.05, vol = 0.07, type: OscillatorType = 'square') {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const time = ctx.currentTime + delay;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(vol, time);
      gain.gain.linearRampToValueAtTime(0.001, time + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + dur);
    } catch {
      // best-effort only
    }
  }

  public playClassicShake() {
    this.blip(140, 0, 0.04);
    this.blip(180, 0.09, 0.04);
    this.blip(220, 0.18, 0.04);
    this.blip(520, 0.5, 0.06, 0.08);
  }

  public playCapsuleTick() {
    this.blip(660, 0, 0.03, 0.06);
    this.blip(520, 0.08, 0.03, 0.06);
  }

  public playCapsuleDrop() {
    this.blip(300, 0, 0.08, 0.09, 'triangle');
    this.blip(180, 0.09, 0.08, 0.09, 'triangle');
  }

  public playCapsulePop() {
    this.blip(880, 0, 0.05, 0.08);
    this.blip(1174, 0.06, 0.08, 0.08);
  }

  public playClawMotor() {
    for (let i = 0; i < 5; i++) this.blip(200 + i * 30, i * 0.09, 0.04, 0.06);
  }

  public playClawClose() {
    this.blip(440, 0, 0.05, 0.08);
    this.blip(330, 0.06, 0.05, 0.08);
  }

  public playClawRelease() {
    this.blip(520, 0, 0.05, 0.08);
    this.blip(260, 0.07, 0.09, 0.08, 'triangle');
  }

  public playReelClick() {
    this.blip(700, 0, 0.025, 0.05);
  }

  public playReelStop(stopIndex: number) {
    this.blip(500 + stopIndex * 150, 0, 0.06, 0.09);
  }

  public playHatchClick() {
    this.blip(600, 0, 0.04, 0.08);
  }

  /**
   * RF prize won (cheerful rising arpeggio).
   */
  public playPrizeWin() {
    const ctx = this.getContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const time = ctx.currentTime + idx * 0.08;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.1, time);
      gain.gain.linearRampToValueAtTime(0.001, time + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + 0.12);
    });
  }

  /**
   * Rare Friend Jackpot reveal fanfare!
   */
  public playJackpot() {
    const ctx = this.getContext();
    if (!ctx) return;

    const fanfare = [
      { freq: 440.0, dur: 0.1 },  // A4
      { freq: 554.37, dur: 0.1 }, // C#5
      { freq: 659.25, dur: 0.1 }, // E5
      { freq: 880.0, dur: 0.25 }, // A5
      { freq: 783.99, dur: 0.1 }, // G5
      { freq: 880.0, dur: 0.4 },  // A5
    ];

    let current = ctx.currentTime;
    fanfare.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(n.freq, current);

      gain.gain.setValueAtTime(0.14, current);
      gain.gain.linearRampToValueAtTime(0.001, current + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(current);
      osc.stop(current + n.dur);
      current += n.dur;
    });
  }

  /**
   * Empty / Try Again ticket sound (soft neutral descending boop).
   */
  public playNoPrize() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  }
}

export const soundFx = new RetroAudioEngine();
