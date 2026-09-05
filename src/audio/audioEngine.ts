/**
 * Web Audio API を使った軽量な手続き型サウンド。
 * 著作権のある音源は一切使わず、オシレーターとノイズだけで
 * 効果音・簡単なアンビエント/BGM相当のパッドを生成する。
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientNodes: { stop: () => void } | null = null;
  /** 天候(雨)のヒスノイズ音量を滑らかに調整するためのゲイン。 */
  private rainGain: GainNode | null = null;
  /** 風 (雨/雪どちらでも吹く低めのノイズ) の音量。 */
  private windGain: GainNode | null = null;
  /** 地下 (洞窟) にいるときのドローン/反響音の音量。 */
  private caveGain: GainNode | null = null;

  private masterVolume = 0.8;
  private musicVolume = 0.4;
  private sfxVolume = 0.8;

  /** ユーザー操作 (クリック等) の後に呼び出す必要がある (ブラウザの自動再生制限) */
  ensureStarted(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(ctx.destination);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);

    this.startAmbient();
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.masterVolume = master;
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.masterGain) this.masterGain.gain.value = master;
    if (this.musicGain) this.musicGain.gain.value = music;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
  }

  private startAmbient(): void {
    const ctx = this.ctx;
    const musicGain = this.musicGain;
    if (!ctx || !musicGain || this.ambientNodes) return;

    // やわらかい持続音のパッド (2和音のデチューンしたサイン波 + ゆっくりLFO)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.value = 220;
    osc2.frequency.value = 220 * 1.5;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);

    const padGain = ctx.createGain();
    padGain.gain.value = 0.12;
    lfoGain.connect(padGain.gain);

    osc1.connect(padGain);
    osc2.connect(padGain);
    padGain.connect(musicGain);

    osc1.start();
    osc2.start();
    lfo.start();

    // --- 雨のヒスノイズ (バンドパスで高域寄りのノイズにして「サー」という雨音にする) ---
    const rainNoise = this.createLoopingNoiseSource(ctx, 2);
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 3200;
    rainFilter.Q.value = 0.6;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0; // 初期状態は無音 (天候に応じて setWeatherAmbience で調整する)
    rainNoise.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(musicGain);
    rainNoise.start();
    this.rainGain = rainGain;

    // --- 風のノイズ (低域寄り + ゆっくりした音量のうねり) ---
    const windNoise = this.createLoopingNoiseSource(ctx, 3);
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 500;
    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.13;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 0.4;
    windLfo.connect(windLfoGain);
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windLfoGain.connect(windGain.gain);
    windNoise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(musicGain);
    windNoise.start();
    windLfo.start();
    this.windGain = windGain;

    // --- 洞窟のドローン (低い持続音 + こもったノイズで、地下にいる不安な静けさを表現) ---
    const caveDrone = ctx.createOscillator();
    caveDrone.type = "sine";
    caveDrone.frequency.value = 55;
    const caveNoise = this.createLoopingNoiseSource(ctx, 4);
    const caveFilter = ctx.createBiquadFilter();
    caveFilter.type = "lowpass";
    caveFilter.frequency.value = 220;
    const caveGain = ctx.createGain();
    caveGain.gain.value = 0;
    caveDrone.connect(caveGain);
    caveNoise.connect(caveFilter);
    caveFilter.connect(caveGain);
    caveGain.connect(musicGain);
    caveDrone.start();
    caveNoise.start();
    this.caveGain = caveGain;

    this.ambientNodes = {
      stop: () => {
        osc1.stop();
        osc2.stop();
        lfo.stop();
        rainNoise.stop();
        windNoise.stop();
        windLfo.stop();
        caveDrone.stop();
        caveNoise.stop();
      }
    };
  }

  /** ループ再生するホワイトノイズバッファーソースを作る (雨/風/洞窟の元ノイズとして共用)。 */
  private createLoopingNoiseSource(ctx: AudioContext, durationSeconds: number): AudioBufferSourceNode {
    const bufferSize = Math.floor(ctx.sampleRate * durationSeconds);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  /**
   * 天候の種類と強さ (0..1) に応じて雨/風のアンビエント音量を滑らかに調整する。
   * 雨: rain のときのみ鳴る。風: rain/snow どちらでも (雪も風を伴うため) 弱めに鳴る。
   */
  setWeatherAmbience(kind: "clear" | "rain" | "snow", intensity: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const clamped = Math.max(0, Math.min(1, intensity));
    const rainTarget = kind === "rain" ? clamped * 0.3 : 0;
    const windTarget = kind === "clear" ? 0 : clamped * 0.16;
    this.rainGain?.gain.setTargetAtTime(rainTarget, ctx.currentTime, 0.8);
    this.windGain?.gain.setTargetAtTime(windTarget, ctx.currentTime, 0.8);
  }

  /** 地下 (洞窟) の雰囲気音を有効/無効にする。 */
  setCaveAmbience(active: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.caveGain?.gain.setTargetAtTime(active ? 0.13 : 0, ctx.currentTime, 1.5);
  }

  private playTone(freq: number, duration: number, type: OscillatorType, gainValue: number): void {
    const ctx = this.ctx;
    const sfxGain = this.sfxGain;
    if (!ctx || !sfxGain) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  private playNoiseBurst(duration: number, gainValue: number, lowpassFreq: number): void {
    const ctx = this.ctx;
    const sfxGain = this.sfxGain;
    if (!ctx || !sfxGain) return;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpassFreq;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    source.start();
  }

  playPlaceBlock(): void {
    this.playNoiseBurst(0.08, 0.5, 1400);
    this.playTone(220, 0.08, "square", 0.15);
  }

  playBreakBlock(): void {
    this.playNoiseBurst(0.12, 0.6, 900);
    this.playTone(140, 0.1, "sawtooth", 0.12);
  }

  playFootstep(): void {
    this.playNoiseBurst(0.05, 0.2, 600);
  }

  playUiClick(): void {
    this.playTone(660, 0.05, "sine", 0.12);
  }

  playUndo(): void {
    this.playTone(440, 0.08, "triangle", 0.15);
    this.playTone(330, 0.08, "triangle", 0.1);
  }

  playRedo(): void {
    this.playTone(330, 0.08, "triangle", 0.1);
    this.playTone(440, 0.08, "triangle", 0.15);
  }

  playDoor(): void {
    this.playNoiseBurst(0.15, 0.25, 500);
    this.playTone(180, 0.15, "sine", 0.1);
  }

  playSwitch(): void {
    this.playTone(880, 0.05, "square", 0.12);
    this.playTone(1200, 0.04, "square", 0.08);
  }

  playCraft(): void {
    this.playTone(520, 0.06, "triangle", 0.14);
    this.playTone(760, 0.08, "triangle", 0.12);
  }

  playDamage(): void {
    this.playNoiseBurst(0.1, 0.4, 700);
    this.playTone(120, 0.12, "sawtooth", 0.18);
  }

  playCreatureHit(): void {
    this.playNoiseBurst(0.06, 0.3, 1200);
    this.playTone(300, 0.06, "square", 0.14);
  }

  playCreatureDeath(): void {
    this.playTone(220, 0.18, "sawtooth", 0.16);
    this.playTone(140, 0.22, "sawtooth", 0.14);
  }

  playDeath(): void {
    this.playTone(200, 0.3, "sawtooth", 0.2);
    this.playTone(100, 0.5, "sawtooth", 0.18);
  }

  playError(): void {
    this.playTone(160, 0.15, "sawtooth", 0.15);
  }

  dispose(): void {
    this.ambientNodes?.stop();
    this.ambientNodes = null;
    if (this.ctx) {
      void this.ctx.close();
    }
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.rainGain = null;
    this.windGain = null;
    this.caveGain = null;
  }
}
