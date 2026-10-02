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
  private keepAliveOsc: OscillatorNode | null = null;

  private ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /**
   * Mantiene attivo il thread audio WebKit su iOS anche a schermo spento
   * tramite una frequenza sub-udibile (20Hz) a volume impercettibile (0.00002).
   */
  enableKeepAliveCarrier() {
    const ctx = this.ensureContext();
    if (this.keepAliveOsc) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 20;
      gain.gain.value = 0.00002;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      this.keepAliveOsc = osc;
    } catch {}
  }

  async start(mix: Mix) {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();

    this.enableKeepAliveCarrier();

    for (const id of SOUND_IDS) {
      if (!this.channels.has(id)) this.channels.set(id, this.createChannel(id));
    }
    this.setMix(mix);
  }

  stop() {
    this.channels.forEach((channel) => channel.stop());
    this.channels.clear();
    if (this.keepAliveOsc) {
      try {
        this.keepAliveOsc.stop();
        this.keepAliveOsc.disconnect();
      } catch {}
      this.keepAliveOsc = null;
    }
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

  playWakeChime(durationSeconds = 45) {
    const ctx = this.ensureContext();
    if (!this.master) return;
    const now = ctx.currentTime;
    const wakeGain = ctx.createGain();
    wakeGain.gain.setValueAtTime(0.0001, now);
    wakeGain.gain.exponentialRampToValueAtTime(0.28, now + Math.min(14, durationSeconds * 0.35));
    wakeGain.gain.setValueAtTime(0.28, now + Math.min(22, durationSeconds * 0.55));
    wakeGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
    wakeGain.connect(this.master);

    // Scala armonica dolce e cristallina (Do4, Mi4, Sol4, Do5, Mi5)
    const freqs = [261.63, 329.63, 392.0, 523.25, 659.25];
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const bellGain = ctx.createGain();
      const startTime = now + index * 0.65;

      osc.type = "sine";
      osc.frequency.value = freq;

      bellGain.gain.setValueAtTime(0.0001, startTime);
      bellGain.gain.linearRampToValueAtTime(0.14 / (index + 1), startTime + 0.03);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 4.5);

      osc.connect(bellGain).connect(wakeGain);
      osc.start(startTime);
      osc.stop(startTime + 4.6);
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

  // --- 5. CAMINO A LEGNA (Fireplace: warm convection hearth roar + realistic sap crackles + deep wood log fracture snaps) ---
  private fireChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();

    // 1. Continuous deep warm flame draft with natural convection modulation
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.028 * white) / 1.028;
      data[i] = last * 2.9;
    }
    const flameSource = ctx.createBufferSource();
    flameSource.buffer = buffer;
    flameSource.loop = true;

    const flameFilter = ctx.createBiquadFilter();
    flameFilter.type = "lowpass";
    flameFilter.frequency.value = 360;

    const convectionLfo = ctx.createOscillator();
    convectionLfo.type = "sine";
    convectionLfo.frequency.value = 0.28;
    const convectionGain = ctx.createGain();
    convectionGain.gain.value = 80;
    convectionLfo.connect(convectionGain).connect(flameFilter.frequency);

    const flameGain = ctx.createGain();
    flameGain.gain.value = 0.45;
    flameSource.connect(flameFilter).connect(flameGain).connect(gain);
    flameSource.start();
    convectionLfo.start();

    // 2. High-density organic wood sap crackles and log fracture snaps
    let isStopped = false;
    let crackleTimeout: number | null = null;
    let snapTimeout: number | null = null;

    const scheduleCrackles = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      // Burst cluster of 1 to 4 micro-pops
      const count = 1 + Math.floor(Math.random() * 3);
      for (let c = 0; c < count; c++) {
        const crackleTime = t + c * (0.005 + Math.random() * 0.015);
        this.playWoodCrackle(ctx, gain, crackleTime);
      }
      crackleTimeout = window.setTimeout(scheduleCrackles, 30 + Math.random() * 85);
    };

    const scheduleSnap = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      this.playWoodSnap(ctx, gain, t);
      snapTimeout = window.setTimeout(scheduleSnap, 1400 + Math.random() * 2600);
    };

    scheduleCrackles();
    snapTimeout = window.setTimeout(scheduleSnap, 600);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (crackleTimeout !== null) window.clearTimeout(crackleTimeout);
        if (snapTimeout !== null) window.clearTimeout(snapTimeout);
        try {
          flameSource.stop();
          convectionLfo.stop();
        } catch {}
      },
    };
  }

  private playWoodCrackle(ctx: AudioContext, dest: GainNode, time: number) {
    if (ctx.state === "closed") return;
    const dur = 0.0025 + Math.random() * 0.004;
    const len = Math.max(16, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.22));
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2800 + Math.random() * 2400;
    bp.Q.value = 2.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.26 + Math.random() * 0.22, time + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    s.connect(bp).connect(g).connect(dest);
    s.start(time);
    s.stop(time + dur + 0.005);
  }

  private playWoodSnap(ctx: AudioContext, dest: GainNode, time: number) {
    if (ctx.state === "closed") return;

    // 1. Initial sharp wood fiber fracture pop
    const dur = 0.006;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.2));
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.42, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    noiseSrc.connect(hp).connect(noiseGain).connect(dest);
    noiseSrc.start(time);
    noiseSrc.stop(time + dur + 0.002);

    // 2. Hollow wooden log body cavity thud
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const bp = ctx.createBiquadFilter();

    const freq = 220 + Math.random() * 180;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq * 1.5, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, time + 0.06);

    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 3.2;

    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(0.42 + Math.random() * 0.25, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.075);

    osc.connect(bp).connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + 0.08);
  }

  // --- 6. BOSCO E UCCELLINI (Canopy breeze in leaves + realistic polyphonic FM songbird phrases) ---
  private forestChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    // 1. Continuous canopy leaf rustle with gentle wind drift
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.992 * b0 + white * 0.05;
      b1 = 0.96 * b1 + white * 0.08;
      data[i] = (b0 + b1) * 0.26;
    }
    const canopySource = ctx.createBufferSource();
    canopySource.buffer = buffer;
    canopySource.loop = true;

    const canopyFilter = ctx.createBiquadFilter();
    canopyFilter.type = "bandpass";
    canopyFilter.frequency.value = 920;
    canopyFilter.Q.value = 0.75;

    const canopyLfo = ctx.createOscillator();
    canopyLfo.type = "sine";
    canopyLfo.frequency.value = 0.14;
    const canopyLfoGain = ctx.createGain();
    canopyLfoGain.gain.value = 240;
    canopyLfo.connect(canopyLfoGain).connect(canopyFilter.frequency);

    const canopyGain = ctx.createGain();
    canopyGain.gain.value = 0.38;
    canopySource.connect(canopyFilter).connect(canopyGain).connect(gain);
    canopySource.start();
    canopyLfo.start();

    // 2. Realistic songbird motifs (European robin, blackbird warble, soft trills)
    let isStopped = false;
    let birdTimeout: number | null = null;

    const scheduleBirdPhrase = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      this.playOrganicBirdSong(ctx, gain, t);
      birdTimeout = window.setTimeout(scheduleBirdPhrase, 1700 + Math.random() * 2800);
    };

    birdTimeout = window.setTimeout(scheduleBirdPhrase, 350);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (birdTimeout !== null) window.clearTimeout(birdTimeout);
        try {
          canopySource.stop();
          canopyLfo.stop();
        } catch {}
      },
    };
  }

  private playOrganicBirdSong(ctx: AudioContext, dest: GainNode, startTime: number) {
    if (ctx.state === "closed") return;
    const motif = Math.random();

    if (motif < 0.4) {
      // Motif A: Sweet Robin melodic two-phrase chirp
      this.playFmBirdNote(ctx, dest, startTime, 2750, 3350, 0.11, 24, 60);
      this.playFmBirdNote(ctx, dest, startTime + 0.15, 3100, 3680, 0.13, 26, 75);
    } else if (motif < 0.75) {
      // Motif B: Descending warble trill with vibrant flutter
      this.playFmBirdNote(ctx, dest, startTime, 3450, 3150, 0.09, 28, 90);
      this.playFmBirdNote(ctx, dest, startTime + 0.12, 3200, 2900, 0.09, 28, 80);
      this.playFmBirdNote(ctx, dest, startTime + 0.24, 2950, 2600, 0.14, 22, 50);
    } else {
      // Motif C: Distant morning wood warbler flourish
      this.playFmBirdNote(ctx, dest, startTime, 3600, 3950, 0.08, 30, 95);
      this.playFmBirdNote(ctx, dest, startTime + 0.10, 3850, 4200, 0.08, 32, 100);
      this.playFmBirdNote(ctx, dest, startTime + 0.22, 3300, 2850, 0.16, 20, 60);
    }
  }

  private playFmBirdNote(
    ctx: AudioContext,
    dest: GainNode,
    time: number,
    startFreq: number,
    endFreq: number,
    dur: number,
    vibratoRate = 24,
    vibratoDepth = 70
  ) {
    if (ctx.state === "closed") return;

    // Carrier oscillator (bird vocalization)
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.setValueAtTime(startFreq, time);
    carrier.frequency.exponentialRampToValueAtTime(endFreq, time + dur * 0.85);

    // Natural frequency modulation (FM vibrato / trill)
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = vibratoRate;
    const modGain = ctx.createGain();
    modGain.gain.value = vibratoDepth;
    modulator.connect(modGain).connect(carrier.frequency);

    // Soft organic volume envelope
    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0.0001, time);
    noteGain.gain.linearRampToValueAtTime(0.13, time + dur * 0.22);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    carrier.connect(noteGain).connect(dest);

    modulator.start(time);
    carrier.start(time);
    modulator.stop(time + dur + 0.02);
    carrier.stop(time + dur + 0.02);
  }

  // --- 7. TRENO NOTTURNO (Night train: coach chassis sub-bass suspension + rhythmic dual-bogie rail clatter) ---
  private trainChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();

    // 1. Continuous coach carriage rolling friction & sub-bass chassis drone
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.03 * white) / 1.03;
      data[i] = last * 2.6;
    }
    const trackSource = ctx.createBufferSource();
    trackSource.buffer = buffer;
    trackSource.loop = true;

    const trackFilter = ctx.createBiquadFilter();
    trackFilter.type = "lowpass";
    trackFilter.frequency.value = 180;

    const trackGain = ctx.createGain();
    trackGain.gain.value = 0.58;
    trackSource.connect(trackFilter).connect(trackGain).connect(gain);
    trackSource.start();

    // Carriage suspension sway (gentle 0.28Hz lateral rocking)
    const subDrone = ctx.createOscillator();
    subDrone.type = "sine";
    subDrone.frequency.value = 52;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.18;

    const swayLfo = ctx.createOscillator();
    swayLfo.type = "sine";
    swayLfo.frequency.value = 0.28;
    const swayGain = ctx.createGain();
    swayGain.gain.value = 0.07;
    swayLfo.connect(swayGain).connect(subGain.gain);

    subDrone.connect(subGain).connect(gain);
    subDrone.start();
    swayLfo.start();

    // 2. Realistic 4-beat bogie wheel-pair rail joint cadence ("ta-tack ... ta-tack")
    let isStopped = false;
    let clickTimeout: number | null = null;

    const scheduleBogies = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;

      // Front bogie (Axle 1 & Axle 2)
      this.playSteelRailImpact(ctx, gain, t, 0.46, 340);
      this.playSteelRailImpact(ctx, gain, t + 0.115, 0.58, 310);

      // Rear bogie (Axle 1 & Axle 2)
      this.playSteelRailImpact(ctx, gain, t + 0.44, 0.40, 350);
      this.playSteelRailImpact(ctx, gain, t + 0.555, 0.52, 320);

      clickTimeout = window.setTimeout(scheduleBogies, 1380 + (Math.random() - 0.5) * 60);
    };

    clickTimeout = window.setTimeout(scheduleBogies, 200);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (clickTimeout !== null) window.clearTimeout(clickTimeout);
        try {
          trackSource.stop();
          subDrone.stop();
          swayLfo.stop();
        } catch {}
      },
    };
  }

  private playSteelRailImpact(ctx: AudioContext, destination: GainNode, time: number, vol: number, freq: number) {
    if (ctx.state === "closed") return;

    // 1. Steel wheel flange contact transient
    const transientLen = Math.floor(ctx.sampleRate * 0.005);
    const buf = ctx.createBuffer(1, transientLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < transientLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (transientLen * 0.25));
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2200;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * 0.4, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.005);
    noiseSrc.connect(hp).connect(noiseGain).connect(destination);
    noiseSrc.start(time);
    noiseSrc.stop(time + 0.006);

    // 2. Metallic rail steel ring resonance
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const bp = ctx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.75, time + 0.07);

    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 4.2;

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol * 0.5, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);

    osc.connect(bp).connect(g).connect(destination);
    osc.start(time);
    osc.stop(time + 0.075);

    // 3. Ballast / sleeper low thump
    const subOsc = ctx.createOscillator();
    const subG = ctx.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(68, time);
    subOsc.frequency.exponentialRampToValueAtTime(42, time + 0.08);

    subG.gain.setValueAtTime(0.0001, time);
    subG.gain.linearRampToValueAtTime(vol * 0.6, time + 0.006);
    subG.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

    subOsc.connect(subG).connect(destination);
    subOsc.start(time);
    subOsc.stop(time + 0.085);
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

  // --- 9. PHON / ASCIUGACAPELLI (Hairdryer: broad aerodynamic airflow + heated nozzle resonance + dual-harmonic motor) ---
  private hairdryerChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Warm aerodynamic air turbulence (filtered pink/white noise)
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.998 * b0 + white * 0.055;
      b1 = 0.992 * b1 + white * 0.075;
      b2 = 0.965 * b2 + white * 0.15;
      data[i] = (b0 + b1 + b2 + white * 0.45) * 0.28;
    }
    const airSource = ctx.createBufferSource();
    airSource.buffer = buffer;
    airSource.loop = true;

    // 1. Broad air flow
    const airLowpass = ctx.createBiquadFilter();
    airLowpass.type = "lowpass";
    airLowpass.frequency.value = 2800;

    const airHighpass = ctx.createBiquadFilter();
    airHighpass.type = "highpass";
    airHighpass.frequency.value = 180;

    const airGain = ctx.createGain();
    airGain.gain.value = 0.52;
    airSource.connect(airHighpass).connect(airLowpass).connect(airGain).connect(gain);

    // 2. Heated barrel nozzle resonance (gives that characteristic hollow jet whoosh)
    const nozzleFilter = ctx.createBiquadFilter();
    nozzleFilter.type = "bandpass";
    nozzleFilter.frequency.value = 750;
    nozzleFilter.Q.value = 1.4;

    const nozzleGain = ctx.createGain();
    nozzleGain.gain.value = 0.38;
    airSource.connect(nozzleFilter).connect(nozzleGain).connect(gain);

    // 3. Realistic motor rotation whine (electric universal motor ~12,000 RPM)
    const motorOsc1 = ctx.createOscillator();
    motorOsc1.type = "triangle";
    motorOsc1.frequency.value = 196;

    const motorOsc2 = ctx.createOscillator();
    motorOsc2.type = "sine";
    motorOsc2.frequency.value = 392;

    const motorLfo = ctx.createOscillator();
    motorLfo.type = "sine";
    motorLfo.frequency.value = 0.35;
    const motorLfoGain = ctx.createGain();
    motorLfoGain.gain.value = 1.2;
    motorLfo.connect(motorLfoGain).connect(motorOsc1.frequency);
    motorLfo.connect(motorLfoGain).connect(motorOsc2.frequency);

    const mGain1 = ctx.createGain();
    mGain1.gain.value = 0.055;
    const mGain2 = ctx.createGain();
    mGain2.gain.value = 0.025;

    motorOsc1.connect(mGain1).connect(gain);
    motorOsc2.connect(mGain2).connect(gain);

    // 4. Suction intake hum (rear grill)
    const suctionOsc = ctx.createOscillator();
    suctionOsc.type = "sine";
    suctionOsc.frequency.value = 98;
    const suctionGain = ctx.createGain();
    suctionGain.gain.value = 0.045;
    suctionOsc.connect(suctionGain).connect(gain);

    airSource.start();
    motorOsc1.start();
    motorOsc2.start();
    motorLfo.start();
    suctionOsc.start();

    return {
      gain,
      stop: () => {
        try {
          airSource.stop();
          motorOsc1.stop();
          motorOsc2.stop();
          motorLfo.stop();
          suctionOsc.stop();
        } catch {}
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

  // --- 11. TUONI LONTANI (Distant thunder: horizon storm atmosphere + lightning cloud crackle + rolling shockwave & multi-stage echoes) ---
  private thunderChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    // 1. Continuous distant horizon storm atmosphere
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.025 * white) / 1.025;
      data[i] = last * 3.8;
    }
    const ambientSource = ctx.createBufferSource();
    ambientSource.buffer = buffer;
    ambientSource.loop = true;

    const ambientFilter = ctx.createBiquadFilter();
    ambientFilter.type = "lowpass";
    ambientFilter.frequency.value = 160;

    const ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.42;
    ambientSource.connect(ambientFilter).connect(ambientGain).connect(gain);
    ambientSource.start();

    let isStopped = false;
    let strikeTimeout: number | null = null;

    const scheduleThunderStrike = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      this.triggerEpicThunder(gain, t);
      // Periodic rolling strikes every 6 to 11 seconds
      strikeTimeout = window.setTimeout(scheduleThunderStrike, 6500 + Math.random() * 4500);
    };

    // Immediate first strike (within 200ms) for instant feedback!
    strikeTimeout = window.setTimeout(scheduleThunderStrike, 200);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (strikeTimeout !== null) window.clearTimeout(strikeTimeout);
        try { ambientSource.stop(); } catch {}
      },
    };
  }

  private triggerEpicThunder(destination: GainNode, startTime: number) {
    const ctx = this.ensureContext();
    if (ctx.state === "closed") return;

    // 1. Distant lightning tearing / cloud ionization crackle (0.0s to 0.22s)
    this.playThunderCrackle(ctx, destination, startTime);

    // 2. Main shockwave boom (arrival at t + 0.22s, deep and heavy)
    this.playThunderRumble(ctx, destination, startTime + 0.22, 4.5, 0.85, 260);

    // 3. Rolling rebound wave 1 (t + 1.2s, secondary echo)
    this.playThunderRumble(ctx, destination, startTime + 1.2, 4.2, 0.62, 200);

    // 4. Rolling rebound wave 2 (t + 2.5s, distant echoing boom)
    this.playThunderRumble(ctx, destination, startTime + 2.5, 3.8, 0.48, 160);

    // 5. Receding rumble (t + 4.1s, fades into horizon)
    this.playThunderRumble(ctx, destination, startTime + 4.1, 3.5, 0.32, 120);
  }

  private playThunderCrackle(ctx: AudioContext, dest: GainNode, time: number) {
    if (ctx.state === "closed") return;
    const dur = 0.22;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.4));
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 1.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.28, time + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    s.connect(bp).connect(g).connect(dest);
    s.start(time);
    s.stop(time + dur + 0.02);
  }

  private playThunderRumble(ctx: AudioContext, dest: GainNode, time: number, dur: number, vol: number, filterCutoff: number) {
    if (ctx.state === "closed") return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.032 * white) / 1.032;
      d[i] = last * 4.0;
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterCutoff, time);
    filter.frequency.exponentialRampToValueAtTime(55, time + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.28);
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

  // --- 13. RUSCELLO ALPINO (Mountain stream: multi-tier turbulent liquid flow + authentic cavitation droplet bubbles) ---
  private streamChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      data[i] = last * 2.8;
    }
    const waterSource = ctx.createBufferSource();
    waterSource.buffer = buffer;
    waterSource.loop = true;

    // 1. Deep rolling current through rounded riverbed stones
    const deepFilter = ctx.createBiquadFilter();
    deepFilter.type = "lowpass";
    deepFilter.frequency.value = 460;

    const deepGain = ctx.createGain();
    deepGain.gain.value = 0.52;

    // 2. Churning mid-frequency brook turbulence with slow eddy swirl
    const midFilter = ctx.createBiquadFilter();
    midFilter.type = "bandpass";
    midFilter.frequency.value = 980;
    midFilter.Q.value = 1.3;

    const eddyLfo = ctx.createOscillator();
    eddyLfo.type = "sine";
    eddyLfo.frequency.value = 0.18;
    const eddyGain = ctx.createGain();
    eddyGain.gain.value = 220;
    eddyLfo.connect(eddyGain).connect(midFilter.frequency);

    const midGain = ctx.createGain();
    midGain.gain.value = 0.44;

    // 3. Crystalline surface spray and ripple splash
    const sprayFilter = ctx.createBiquadFilter();
    sprayFilter.type = "bandpass";
    sprayFilter.frequency.value = 2400;
    sprayFilter.Q.value = 1.6;

    const sprayGain = ctx.createGain();
    sprayGain.gain.value = 0.28;

    waterSource.connect(deepFilter).connect(deepGain).connect(gain);
    waterSource.connect(midFilter).connect(midGain).connect(gain);
    waterSource.connect(sprayFilter).connect(sprayGain).connect(gain);

    waterSource.start();
    eddyLfo.start();

    // 4. Randomized natural water droplet cavitation plops (Minnaert bubbles)
    let isStopped = false;
    let bubbleTimeout: number | null = null;

    const scheduleBubble = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      this.playWaterBubble(ctx, gain, t);
      bubbleTimeout = window.setTimeout(scheduleBubble, 55 + Math.random() * 150);
    };

    scheduleBubble();

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (bubbleTimeout !== null) window.clearTimeout(bubbleTimeout);
        try {
          waterSource.stop();
          eddyLfo.stop();
        } catch {}
      },
    };
  }

  private playWaterBubble(ctx: AudioContext, dest: GainNode, time: number) {
    if (ctx.state === "closed") return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    // Natural cavitation bubble pitch: starts at cavity formant and glides exponentially upward as bubble forms
    const startFreq = 480 + Math.random() * 750;
    const endFreq = startFreq * (1.28 + Math.random() * 0.32);
    const dur = 0.024 + Math.random() * 0.028;

    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + dur * 0.85);

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.14 + Math.random() * 0.09, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.006);
  }

  // --- 14. FUSA DEL GATTO (Authentic organic feline purr: dual-phase breathing + deep chest resonance + soft glottal twitches) ---
  private catPurrChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const cycleDuration = 3.8; // 3.8s complete breathing cycle (Inhale + Exhale)
    const length = Math.floor(ctx.sampleRate * cycleDuration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const sr = ctx.sampleRate;

    // Dual-phase timing:
    // Phase 1: Inhalation (0.0s to 1.75s) -> twitch rate ~26.4Hz, thoracic resonance ~112Hz, throat ~220Hz
    // Transition pause: (1.75s to 1.90s)
    // Phase 2: Exhalation (1.90s to 3.65s) -> twitch rate ~23.2Hz, deep chest resonance ~78Hz, throat ~185Hz
    const inhaleEnd = 1.75;
    const exhaleStart = 1.90;
    const exhaleEnd = 3.65;

    // Helper: generate soft raised-cosine glottal twitch impulse
    const addGlottalImpulse = (startSec: number, pulseDur: number, f1: number, f2: number, amp: number) => {
      const pLen = Math.floor(sr * pulseDur);
      const startIdx = Math.floor(startSec * sr);
      for (let i = 0; i < pLen && startIdx + i < length; i++) {
        const pt = i / sr;
        const env = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (pLen - 1))); // Raised cosine window
        const decay = Math.exp(-pt / (pulseDur * 0.42));
        const val = (Math.sin(2 * Math.PI * f1 * pt) * 0.7 +
                     Math.sin(2 * Math.PI * f2 * pt) * 0.3) * env * decay * amp;
        data[startIdx + i] += val;
      }
    };

    // Synthesize Inhalation train
    let t = 0.05;
    const inhalePeriod = 1 / 26.4;
    while (t < inhaleEnd) {
      const progress = t / inhaleEnd;
      const breathCurve = Math.sin(progress * Math.PI) * 0.85 + 0.15;
      addGlottalImpulse(t, 0.024, 112, 220, breathCurve * 0.72);
      t += inhalePeriod + (Math.random() - 0.5) * 0.002;
    }

    // Synthesize Exhalation train (deeper chest rumble)
    t = exhaleStart;
    const exhalePeriod = 1 / 23.2;
    while (t < exhaleEnd) {
      const progress = (t - exhaleStart) / (exhaleEnd - exhaleStart);
      const breathCurve = Math.sin(progress * Math.PI) * 0.92 + 0.18;
      addGlottalImpulse(t, 0.028, 78, 185, breathCurve * 0.88);
      t += exhalePeriod + (Math.random() - 0.5) * 0.002;
    }

    // Soft crossfade edges for seamless loop
    const fadeLen = Math.floor(sr * 0.05);
    for (let i = 0; i < fadeLen; i++) {
      const ramp = i / fadeLen;
      data[i] *= ramp;
      data[length - 1 - i] *= ramp;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Body resonator filter: warm chest resonance
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = "lowpass";
    bodyFilter.frequency.value = 380;

    // Subtle sub-bass body drone (62Hz) to feel the cat purr in the chest
    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = 62;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.12;
    subOsc.connect(subGain).connect(gain);
    subOsc.start();

    const purrGain = ctx.createGain();
    purrGain.gain.value = 0.92;

    source.connect(bodyFilter).connect(purrGain).connect(gain);
    source.start();

    return {
      gain,
      stop: () => {
        try {
          source.stop();
          subOsc.stop();
        } catch {}
      },
    };
  }

  // --- 15. TICCHETTIO OROLOGIO (Antique pendulum clock: distinct brass Tick and wooden Tock with escapement recoil) ---
  private clockChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    let isTick = true;
    let isStopped = false;
    let timerId: number | null = null;

    const runStroke = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      if (isTick) {
        // "TICK": Brass escapement pallet strike + spring micro-recoil
        this.playClockTick(ctx, gain, t);
      } else {
        // "TOCK": Resonant wooden clock case rebound
        this.playClockTock(ctx, gain, t);
      }
      isTick = !isTick;
      timerId = window.setTimeout(runStroke, 1000);
    };

    timerId = window.setTimeout(runStroke, 80);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (timerId !== null) window.clearTimeout(timerId);
      },
    };
  }

  private playClockTick(ctx: AudioContext, dest: GainNode, time: number) {
    if (ctx.state === "closed") return;

    // 1. Sharp impact transient (pallet contacting escapement wheel)
    const noiseLen = Math.floor(ctx.sampleRate * 0.0035);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.22));
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2800;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.38, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.0035);
    noiseSrc.connect(hp).connect(noiseGain).connect(dest);
    noiseSrc.start(time);
    noiseSrc.stop(time + 0.005);

    // 2. Brass tooth chime ring (~1420Hz, narrow Q)
    const osc = ctx.createOscillator();
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1420, time);
    osc.frequency.exponentialRampToValueAtTime(1180, time + 0.038);
    bp.type = "bandpass";
    bp.frequency.value = 1420;
    bp.Q.value = 6.2;
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(0.42, time + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.038);
    osc.connect(bp).connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + 0.042);

    // 3. Escapement spring micro-recoil rattle at +16ms
    const rTime = time + 0.016;
    const reboundOsc = ctx.createOscillator();
    const reboundGain = ctx.createGain();
    reboundOsc.type = "sine";
    reboundOsc.frequency.value = 2480;
    reboundGain.gain.setValueAtTime(0.001, rTime);
    reboundGain.gain.linearRampToValueAtTime(0.12, rTime + 0.001);
    reboundGain.gain.exponentialRampToValueAtTime(0.0001, rTime + 0.016);
    reboundOsc.connect(reboundGain).connect(dest);
    reboundOsc.start(rTime);
    reboundOsc.stop(rTime + 0.018);
  }

  private playClockTock(ctx: AudioContext, dest: GainNode, time: number) {
    if (ctx.state === "closed") return;

    // 1. Softer wooden casing impact transient
    const noiseLen = Math.floor(ctx.sampleRate * 0.004);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.28));
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1600;
    bp.Q.value = 2.0;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.28, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.004);
    noiseSrc.connect(bp).connect(noiseGain).connect(dest);
    noiseSrc.start(time);
    noiseSrc.stop(time + 0.005);

    // 2. Warm wooden clock housing cavity resonance (~820Hz with deeper undertone)
    const osc = ctx.createOscillator();
    const bodyFilter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(820, time);
    osc.frequency.exponentialRampToValueAtTime(640, time + 0.048);
    bodyFilter.type = "bandpass";
    bodyFilter.frequency.value = 820;
    bodyFilter.Q.value = 4.5;
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(0.38, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.048);
    osc.connect(bodyFilter).connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + 0.052);

    // 3. Wooden cabinet lower thump (~240Hz)
    const thumpOsc = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thumpOsc.type = "sine";
    thumpOsc.frequency.value = 240;
    thumpGain.gain.setValueAtTime(0.001, time);
    thumpGain.gain.linearRampToValueAtTime(0.18, time + 0.003);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    thumpOsc.connect(thumpGain).connect(dest);
    thumpOsc.start(time);
    thumpOsc.stop(time + 0.045);
  }
}
