import type { Mix, SoundId } from "./types";

const SOUND_IDS: SoundId[] = [
  "waves",
  "rain",
  "wind",
  "thunder",
  "snow",
  "stream",
  "forest",
  "night",
  "fire",
  "catPurr",
  "hairdryer",
  "heater",
  "clock",
  "train",
  "brownNoise",
];

type Channel = {
  gain: GainNode;
  stop: () => void;
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private channels = new Map<SoundId, Channel>();

  private ensureContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async start(mix: Mix) {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();

    for (const id of SOUND_IDS) {
      if (!this.channels.has(id)) this.channels.set(id, this.createChannel(id));
    }
    this.setMix(mix);
  }

  stop() {
    this.channels.forEach((channel) => channel.stop());
    this.channels.clear();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
  }

  setMix(mix: Mix) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const id of SOUND_IDS) {
      const channel = this.channels.get(id);
      if (!channel) continue;
      const val = mix[id] ?? 0;
      // Calibrated power curve for rich, responsive volume scaling
      const target = Math.pow(val / 100, 1.5) * 0.95;
      channel.gain.gain.cancelScheduledValues(ctx.currentTime);
      channel.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    }
  }

  fadeMasterTo(value: number, seconds: number) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(value, now + seconds);
  }

  playWakeChime(durationSeconds = 50) {
    const ctx = this.ensureContext();
    if (!this.master) return;
    const now = ctx.currentTime;
    const wakeGain = ctx.createGain();
    wakeGain.gain.setValueAtTime(0.0001, now);
    wakeGain.gain.exponentialRampToValueAtTime(0.24, now + Math.min(18, durationSeconds * 0.45));
    wakeGain.gain.setValueAtTime(0.24, now + Math.min(18, durationSeconds * 0.45));
    wakeGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
    wakeGain.connect(this.master);

    [261.63, 329.63, 392.0, 523.25].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.value = 0.09 / (index + 1);
      osc.connect(g).connect(wakeGain);
      osc.start(now + index * 0.7);
      osc.stop(now + durationSeconds);
    });
  }

  private createChannel(id: SoundId): Channel {
    const ctx = this.ensureContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master!);

    if (id === "waves") return this.wavesChannel(gain);
    if (id === "rain") return this.rainChannel(gain);
    if (id === "wind") return this.windChannel(gain);
    if (id === "brownNoise") return this.brownNoiseChannel(gain);
    if (id === "fire") return this.fireChannel(gain);
    if (id === "forest") return this.forestChannel(gain);
    if (id === "train") return this.trainChannel(gain);
    if (id === "night") return this.nightChannel(gain);
    if (id === "hairdryer") return this.hairdryerChannel(gain);
    if (id === "heater") return this.heaterChannel(gain);
    if (id === "thunder") return this.thunderChannel(gain);
    if (id === "snow") return this.snowChannel(gain);
    if (id === "stream") return this.streamChannel(gain);
    if (id === "catPurr") return this.catPurrChannel(gain);
    if (id === "clock") return this.clockChannel(gain);

    return { gain, stop: () => {} };
  }

  // --- 1. ONDE DEL MARE (Ocean waves: asymmetric swell, breaking crest surf, and foam wash) ---
  private wavesChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 6;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.38;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Body of the ocean
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = "lowpass";
    lowFilter.frequency.value = 380;

    // Crest surf / breaking foam
    const surfFilter = ctx.createBiquadFilter();
    surfFilter.type = "bandpass";
    surfFilter.frequency.value = 1100;
    surfFilter.Q.value = 1.3;

    // ~10.5 second wave rhythm
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.095;

    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.48;
    const lfoBodyGain = ctx.createGain();
    lfoBodyGain.gain.value = 0.36;
    lfo.connect(lfoBodyGain).connect(bodyGain.gain);

    const surfGain = ctx.createGain();
    surfGain.gain.value = 0.32;
    const lfoSurfGain = ctx.createGain();
    lfoSurfGain.gain.value = 0.28;
    lfo.connect(lfoSurfGain).connect(surfGain.gain);

    const lfoFilterGain = ctx.createGain();
    lfoFilterGain.gain.value = 520;
    lfo.connect(lfoFilterGain).connect(surfFilter.frequency);

    source.connect(lowFilter).connect(bodyGain).connect(gain);
    source.connect(surfFilter).connect(surfGain).connect(gain);

    source.start();
    lfo.start();

    return {
      gain,
      stop: () => {
        try { source.stop(); lfo.stop(); } catch {}
      },
    };
  }

  // --- 2. PIOGGIA (Rainfall: continuous downpour wash + thousands of realistic micro-droplet taps) ---
  private rainChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // 1. Continuous rainfall bed
    let b0 = 0, b1 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99 * b0 + white * 0.05;
      b1 = 0.96 * b1 + white * 0.08;
      data[i] = (b0 + b1) * 0.32;
    }

    // 2. Realistic micro-droplet impacts
    const numDroplets = Math.floor(length * 0.026);
    for (let d = 0; d < numDroplets; d++) {
      const pos = Math.floor(Math.random() * (length - 200));
      const amp = (0.16 + Math.random() * 0.34) * (Math.random() > 0.5 ? 1 : -1);
      const decay = 25 + Math.floor(Math.random() * 45);
      for (let k = 0; k < decay && pos + k < length; k++) {
        data[pos + k] += amp * Math.exp(-k / (decay * 0.28)) * Math.sin(k * 0.85);
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2600;

    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 320;

    source.connect(highpass).connect(lowpass).connect(gain);
    source.start();

    return {
      gain,
      stop: () => {
        try { source.stop(); } catch {}
      },
    };
  }

  // --- 3. VENTO (Wind: dynamic howling gusts with natural resonance) ---
  private windChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.03 * white) / 1.03;
      data[i] = last * 3.0;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 380;
    bandpass.Q.value = 2.2;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 650;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.076;

    const lfoFilterGain = ctx.createGain();
    lfoFilterGain.gain.value = 220;
    lfo.connect(lfoFilterGain).connect(bandpass.frequency);

    const lfoAmp = ctx.createGain();
    lfoAmp.gain.value = 0.28;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.58;
    lfo.connect(lfoAmp).connect(windGain.gain);

    source.connect(bandpass).connect(lowpass).connect(windGain).connect(gain);
    source.start();
    lfo.start();

    return {
      gain,
      stop: () => {
        try { source.stop(); lfo.stop(); } catch {}
      },
    };
  }

  // --- 4. RUMORE BRUNO (Deep Brown Noise) ---
  private brownNoiseChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.4;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 650;

    source.connect(filter).connect(gain);
    source.start();
    return { gain, stop: () => { try { source.stop(); } catch {} } };
  }

  // --- 5. CAMINO (Fireplace: warm flame roar + crisp irregular crackles + wood snaps) ---
  private fireChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();

    // 1. Continuous warm flame draft
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.025 * white) / 1.025;
      data[i] = last * 2.6;
    }
    const flameSource = ctx.createBufferSource();
    flameSource.buffer = buffer;
    flameSource.loop = true;

    const flameFilter = ctx.createBiquadFilter();
    flameFilter.type = "lowpass";
    flameFilter.frequency.value = 420;

    const flameGain = ctx.createGain();
    flameGain.gain.value = 0.42;
    flameSource.connect(flameFilter).connect(flameGain).connect(gain);
    flameSource.start();

    // 2. High-frequency crackles and wood snaps
    let isStopped = false;
    let crackleTimeout: number | null = null;
    let snapTimeout: number | null = null;

    const scheduleCrackles = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      const count = 1 + Math.floor(Math.random() * 3);
      for (let c = 0; c < count; c++) {
        const crackleTime = t + c * (0.008 + Math.random() * 0.018);
        this.playWoodCrackle(ctx, gain, crackleTime);
      }
      crackleTimeout = window.setTimeout(scheduleCrackles, 25 + Math.random() * 70);
    };

    const scheduleSnap = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      this.playWoodSnap(ctx, gain, t);
      snapTimeout = window.setTimeout(scheduleSnap, 1200 + Math.random() * 2400);
    };

    scheduleCrackles();
    snapTimeout = window.setTimeout(scheduleSnap, 500);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (crackleTimeout !== null) window.clearTimeout(crackleTimeout);
        if (snapTimeout !== null) window.clearTimeout(snapTimeout);
        try { flameSource.stop(); } catch {}
      },
    };
  }

  private playWoodCrackle(ctx: AudioContext, dest: GainNode, time: number) {
    if (ctx.state === "closed") return;
    const dur = 0.003 + Math.random() * 0.006;
    const len = Math.max(16, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.3));
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1900 + Math.random() * 1100;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(0.24 + Math.random() * 0.22, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    s.connect(hp).connect(g).connect(dest);
    s.start(time);
    s.stop(time + dur + 0.005);
  }

  private playWoodSnap(ctx: AudioContext, dest: GainNode, time: number) {
    if (ctx.state === "closed") return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const bp = ctx.createBiquadFilter();

    const freq = 850 + Math.random() * 600;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, time + 0.04);

    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 3.5;

    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.2, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

    osc.connect(bp).connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  // --- 6. BOSCO E UCCELLINI (Canopy breeze in leaves + melodic bird phrases) ---
  private forestChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    // 1. Continuous canopy leaf rustle
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.992 * b0 + white * 0.05;
      b1 = 0.96 * b1 + white * 0.08;
      data[i] = (b0 + b1) * 0.28;
    }
    const canopySource = ctx.createBufferSource();
    canopySource.buffer = buffer;
    canopySource.loop = true;

    const canopyFilter = ctx.createBiquadFilter();
    canopyFilter.type = "bandpass";
    canopyFilter.frequency.value = 850;
    canopyFilter.Q.value = 0.8;

    const canopyGain = ctx.createGain();
    canopyGain.gain.value = 0.35;
    canopySource.connect(canopyFilter).connect(canopyGain).connect(gain);
    canopySource.start();

    // 2. Natural bird song motifs
    let isStopped = false;
    let birdTimeout: number | null = null;

    const scheduleBirdPhrase = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      this.playBirdMotif(ctx, gain, t);
      birdTimeout = window.setTimeout(scheduleBirdPhrase, 1800 + Math.random() * 2600);
    };

    birdTimeout = window.setTimeout(scheduleBirdPhrase, 400);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (birdTimeout !== null) window.clearTimeout(birdTimeout);
        try { canopySource.stop(); } catch {}
      },
    };
  }

  private playBirdMotif(ctx: AudioContext, dest: GainNode, startTime: number) {
    if (ctx.state === "closed") return;
    const phraseType = Math.random();
    if (phraseType < 0.45) {
      this.playBirdChirp(ctx, dest, startTime, 2600, 3100, 0.11);
      this.playBirdChirp(ctx, dest, startTime + 0.14, 2900, 3500, 0.13);
    } else if (phraseType < 0.8) {
      this.playBirdChirp(ctx, dest, startTime, 3200, 3400, 0.08);
      this.playBirdChirp(ctx, dest, startTime + 0.11, 3400, 3650, 0.08);
      this.playBirdChirp(ctx, dest, startTime + 0.22, 3100, 2800, 0.12);
    } else {
      this.playBirdChirp(ctx, dest, startTime, 3500, 2700, 0.18);
    }
  }

  private playBirdChirp(ctx: AudioContext, dest: GainNode, time: number, startFreq: number, endFreq: number, dur: number) {
    if (ctx.state === "closed") return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + dur * 0.8);

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.14, time + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // --- 7. TRENO (Train: rolling rumble + rhythmic 4-beat wheel rail clatter) ---
  private trainChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      data[i] = last * 2.8;
    }
    const rumbleSource = ctx.createBufferSource();
    rumbleSource.buffer = buffer;
    rumbleSource.loop = true;

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = "bandpass";
    rumbleFilter.frequency.value = 220;
    rumbleFilter.Q.value = 1.1;

    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.55;
    rumbleSource.connect(rumbleFilter).connect(rumbleGain).connect(gain);
    rumbleSource.start();

    let isStopped = false;
    let clickTimeout: number | null = null;

    const scheduleClick = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      this.playRailClick(ctx, gain, t, 0.45, 460);
      this.playRailClick(ctx, gain, t + 0.13, 0.58, 360);
      this.playRailClick(ctx, gain, t + 0.45, 0.38, 480);
      this.playRailClick(ctx, gain, t + 0.58, 0.48, 380);
      clickTimeout = window.setTimeout(scheduleClick, 1350);
    };

    scheduleClick();

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (clickTimeout !== null) window.clearTimeout(clickTimeout);
        try { rumbleSource.stop(); } catch {}
      },
    };
  }

  private playRailClick(ctx: AudioContext, destination: GainNode, time: number, vol: number, freq: number) {
    if (ctx.state === "closed") return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.06);

    f.type = "bandpass";
    f.frequency.value = freq * 1.4;
    f.Q.value = 2.4;

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol * 0.5, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.065);

    osc.connect(f).connect(g).connect(destination);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  // --- 8. NOTTE ESTIVA (Warm ambient night + authentic polyphonic crickets) ---
  private nightChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.994 * b0 + white * 0.04;
      data[i] = b0 * 0.18;
    }
    const airSource = ctx.createBufferSource();
    airSource.buffer = buffer;
    airSource.loop = true;

    const airFilter = ctx.createBiquadFilter();
    airFilter.type = "lowpass";
    airFilter.frequency.value = 600;

    const airGain = ctx.createGain();
    airGain.gain.value = 0.25;
    airSource.connect(airFilter).connect(airGain).connect(gain);
    airSource.start();

    let isStopped = false;
    let chirpTimeout1: number | null = null;
    let chirpTimeout2: number | null = null;

    const playCricket1 = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      const freq = 4550 + Math.random() * 250;
      for (let p = 0; p < 4; p++) {
        const pt = t + p * 0.048;
        this.playCricketPulse(ctx, gain, pt, freq, 0.22);
      }
      chirpTimeout1 = window.setTimeout(playCricket1, 650 + Math.random() * 850);
    };

    const playCricket2 = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      const freq = 5150 + Math.random() * 300;
      for (let p = 0; p < 3; p++) {
        const pt = t + p * 0.042;
        this.playCricketPulse(ctx, gain, pt, freq, 0.14);
      }
      chirpTimeout2 = window.setTimeout(playCricket2, 950 + Math.random() * 1100);
    };

    playCricket1();
    chirpTimeout2 = window.setTimeout(playCricket2, 380);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (chirpTimeout1 !== null) window.clearTimeout(chirpTimeout1);
        if (chirpTimeout2 !== null) window.clearTimeout(chirpTimeout2);
        try { airSource.stop(); } catch {}
      },
    };
  }

  private playCricketPulse(ctx: AudioContext, dest: GainNode, time: number, freq: number, vol: number) {
    if (ctx.state === "closed") return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = freq;

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

    osc.connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + 0.044);
  }

  // --- 9. PHON / ASCIUGACAPELLI (Hairdryer: warm motor hum + airflow turbulence) ---
  private hairdryerChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.32;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 480;
    bandpass.Q.value = 1.0;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1900;

    source.connect(bandpass).connect(lowpass).connect(gain);

    const motor = ctx.createOscillator();
    motor.type = "triangle";
    motor.frequency.value = 174;

    const motorGain = ctx.createGain();
    motorGain.gain.value = 0.07;
    motor.connect(motorGain).connect(gain);

    source.start();
    motor.start();
    return {
      gain,
      stop: () => {
        try { source.stop(); motor.stop(); } catch {}
      },
    };
  }

  // --- 10. SCALDINO / CALDOBAGNO (Heater: ceramic fan blade hum + mains hum + airflow) ---
  private heaterChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.035 * white) / 1.035;
      data[i] = last * 3.2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    source.connect(filter).connect(gain);

    const fanHum = ctx.createOscillator();
    fanHum.type = "sine";
    fanHum.frequency.value = 98;
    const fanGain = ctx.createGain();
    fanGain.gain.value = 0.07;
    fanHum.connect(fanGain).connect(gain);

    const mainsHum = ctx.createOscillator();
    mainsHum.type = "sine";
    mainsHum.frequency.value = 50;
    const mainsGain = ctx.createGain();
    mainsGain.gain.value = 0.04;
    mainsHum.connect(mainsGain).connect(gain);

    source.start();
    fanHum.start();
    mainsHum.start();
    return {
      gain,
      stop: () => {
        try { source.stop(); fanHum.stop(); mainsHum.stop(); } catch {}
      },
    };
  }

  // --- 11. TUONI LONTANI (Distant thunder: immediate storm atmosphere + multi-stage rolling thunder) ---
  private thunderChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.03 * white) / 1.03;
      data[i] = last * 3.5;
    }
    const ambientSource = ctx.createBufferSource();
    ambientSource.buffer = buffer;
    ambientSource.loop = true;

    const ambientFilter = ctx.createBiquadFilter();
    ambientFilter.type = "lowpass";
    ambientFilter.frequency.value = 180;

    const ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.38;
    ambientSource.connect(ambientFilter).connect(ambientGain).connect(gain);
    ambientSource.start();

    let isStopped = false;
    let strikeTimeout: number | null = null;

    const scheduleThunderStrike = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      this.triggerThunderBoom(gain, t);
      strikeTimeout = window.setTimeout(scheduleThunderStrike, 7500 + Math.random() * 6500);
    };

    strikeTimeout = window.setTimeout(scheduleThunderStrike, 350);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (strikeTimeout !== null) window.clearTimeout(strikeTimeout);
        try { ambientSource.stop(); } catch {}
      },
    };
  }

  private triggerThunderBoom(destination: GainNode, startTime: number) {
    const ctx = this.ensureContext();
    if (ctx.state === "closed") return;
    this.playThunderRumble(ctx, destination, startTime, 3.8, 0.7, 240);
    this.playThunderRumble(ctx, destination, startTime + 0.6, 4.2, 0.55, 190);
    this.playThunderRumble(ctx, destination, startTime + 1.5, 4.0, 0.42, 140);
  }

  private playThunderRumble(ctx: AudioContext, dest: GainNode, time: number, dur: number, vol: number, filterCutoff: number) {
    if (ctx.state === "closed") return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.035 * white) / 1.035;
      d[i] = last * 3.8;
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterCutoff, time);
    filter.frequency.exponentialRampToValueAtTime(70, time + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    s.connect(filter).connect(g).connect(dest);
    s.start(time);
    s.stop(time + dur + 0.05);
  }

  // --- 12. BUFERA DI NEVE (Blizzard: cold howling wind + frosty crystalline whisper) ---
  private snowChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99 * b0 + white * 0.06;
      b1 = 0.95 * b1 + white * 0.12;
      data[i] = (b0 + b1) * 0.45;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const blizzardFilter = ctx.createBiquadFilter();
    blizzardFilter.type = "bandpass";
    blizzardFilter.frequency.value = 520;
    blizzardFilter.Q.value = 3.2;

    const frostFilter = ctx.createBiquadFilter();
    frostFilter.type = "highpass";
    frostFilter.frequency.value = 3800;

    const frostGain = ctx.createGain();
    frostGain.gain.value = 0.12;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.09;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 310;
    lfo.connect(lfoGain).connect(blizzardFilter.frequency);

    source.connect(blizzardFilter).connect(gain);
    source.connect(frostFilter).connect(frostGain).connect(gain);

    lfo.start();
    source.start();

    return {
      gain,
      stop: () => {
        try { source.stop(); lfo.stop(); } catch {}
      },
    };
  }

  // --- 13. RUSCELLO (Babbling brook: flowing water bed + resonant Minnaert bubble chirps) ---
  private streamChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.35;
    }
    const waterSource = ctx.createBufferSource();
    waterSource.buffer = buffer;
    waterSource.loop = true;

    const bp1 = ctx.createBiquadFilter();
    bp1.type = "bandpass";
    bp1.frequency.value = 680;
    bp1.Q.value = 1.6;

    const bp2 = ctx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 1500;
    bp2.Q.value = 1.9;

    const flowGain = ctx.createGain();
    flowGain.gain.value = 0.48;

    waterSource.connect(bp1).connect(flowGain).connect(gain);
    waterSource.connect(bp2).connect(flowGain).connect(gain);
    waterSource.start();

    let isStopped = false;
    let bubbleTimeout: number | null = null;

    const scheduleBubble = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      this.playWaterBubble(ctx, gain, t);
      bubbleTimeout = window.setTimeout(scheduleBubble, 70 + Math.random() * 180);
    };

    scheduleBubble();

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (bubbleTimeout !== null) window.clearTimeout(bubbleTimeout);
        try { waterSource.stop(); } catch {}
      },
    };
  }

  private playWaterBubble(ctx: AudioContext, dest: GainNode, time: number) {
    if (ctx.state === "closed") return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    const baseFreq = 750 + Math.random() * 700;
    const dur = 0.025 + Math.random() * 0.025;

    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq, time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * (1.25 + Math.random() * 0.35), time + dur);

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.08, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.005);
  }

  // --- 14. FUSA DEL GATTO (Cat purr: multi-harmonic chest vibration + laryngeal flutter + breathing) ---
  private catPurrChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.value = 72;

    const osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.value = 144;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    osc2.connect(g2);

    const osc3 = ctx.createOscillator();
    osc3.type = "triangle";
    osc3.frequency.value = 216;
    const g3 = ctx.createGain();
    g3.gain.value = 0.22;
    osc3.connect(g3);

    const mixer = ctx.createGain();
    osc1.connect(mixer);
    g2.connect(mixer);
    g3.connect(mixer);

    const flutterLfo = ctx.createOscillator();
    flutterLfo.type = "triangle";
    flutterLfo.frequency.value = 23.5;

    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.58;

    const flutterMod = ctx.createGain();
    flutterMod.gain.value = 0.52;
    flutterLfo.connect(flutterDepth).connect(flutterMod.gain);

    const breathLfo = ctx.createOscillator();
    breathLfo.type = "sine";
    breathLfo.frequency.value = 0.29;

    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.28;

    const breathMod = ctx.createGain();
    breathMod.gain.value = 0.72;
    breathLfo.connect(breathDepth).connect(breathMod.gain);

    const throatFilter = ctx.createBiquadFilter();
    throatFilter.type = "lowpass";
    throatFilter.frequency.value = 340;

    mixer.connect(flutterMod).connect(breathMod).connect(throatFilter).connect(gain);

    osc1.start();
    osc2.start();
    osc3.start();
    flutterLfo.start();
    breathLfo.start();

    return {
      gain,
      stop: () => {
        try {
          osc1.stop();
          osc2.stop();
          osc3.stop();
          flutterLfo.stop();
          breathLfo.stop();
        } catch {}
      },
    };
  }

  // --- 15. TICCHETTIO OROLOGIO (Mechanical grandfather clock tic-tac) ---
  private clockChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    let isTick = true;
    let isStopped = false;
    let intervalId: number | null = null;

    const runTick = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      const freq = isTick ? 1280 : 1020;
      this.playMechanicalTick(ctx, gain, t, freq);
      isTick = !isTick;
    };

    intervalId = window.setInterval(runTick, 1000);
    runTick();

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (intervalId !== null) window.clearInterval(intervalId);
      },
    };
  }

  private playMechanicalTick(ctx: AudioContext, dest: GainNode, time: number, resonanceFreq: number) {
    if (ctx.state === "closed") return;

    const noiseLen = Math.floor(ctx.sampleRate * 0.004);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.25));
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2600;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.32, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.004);

    noiseSrc.connect(hp).connect(noiseGain).connect(dest);
    noiseSrc.start(time);
    noiseSrc.stop(time + 0.006);

    const osc = ctx.createOscillator();
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(resonanceFreq, time);
    osc.frequency.exponentialRampToValueAtTime(resonanceFreq * 0.8, time + 0.035);

    bp.type = "bandpass";
    bp.frequency.value = resonanceFreq;
    bp.Q.value = 5.5;

    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(0.38, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.038);

    osc.connect(bp).connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + 0.042);

    const reboundOsc = ctx.createOscillator();
    const reboundGain = ctx.createGain();
    reboundOsc.type = "sine";
    reboundOsc.frequency.value = resonanceFreq * 1.4;

    const rTime = time + 0.015;
    reboundGain.gain.setValueAtTime(0.001, rTime);
    reboundGain.gain.linearRampToValueAtTime(0.12, rTime + 0.001);
    reboundGain.gain.exponentialRampToValueAtTime(0.0001, rTime + 0.018);

    reboundOsc.connect(reboundGain).connect(dest);
    reboundOsc.start(rTime);
    reboundOsc.stop(rTime + 0.02);
  }
}
