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

    if (id === "brownNoise" || id === "rain" || id === "wind" || id === "waves") {
      return this.noiseChannel(gain, id);
    }
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

  // --- NOISE CHANNEL (Onde, Pioggia, Vento, Rumore bruno) ---
  private noiseChannel(gain: GainNode, id: "brownNoise" | "rain" | "wind" | "waves"): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (id === "brownNoise") {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.4;
      } else {
        data[i] = white;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    if (id === "brownNoise") {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 750;
      source.connect(filter).connect(gain);
    } else {
      const filter = ctx.createBiquadFilter();
      if (id === "rain") {
        filter.type = "bandpass";
        filter.frequency.value = 1750;
        filter.Q.value = 0.5;
      } else if (id === "wind") {
        filter.type = "lowpass";
        filter.frequency.value = 520;
      } else {
        filter.type = "lowpass";
        filter.frequency.value = 920;
      }

      if (id === "waves") {
        const modGain = ctx.createGain();
        modGain.gain.value = 0.65;
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.095;
        lfoGain.gain.value = 0.32;
        lfo.connect(lfoGain).connect(modGain.gain);
        source.connect(filter).connect(modGain).connect(gain);
        lfo.start();
        source.start();
        return {
          gain,
          stop: () => {
            try { source.stop(); lfo.stop(); } catch {}
          },
        };
      }

      source.connect(filter).connect(gain);
    }

    source.start();
    return { gain, stop: () => { try { source.stop(); } catch {} } };
  }

  // --- TRENO (Train on tracks: rolling rumble + rhythmic ta-tam joints) ---
  private trainChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();

    // 1. Rolling train wheel rumble
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

    // 2. Hypnotic rail joint clack (ta-tam ... ta-tam)
    let isStopped = false;
    let clickTimeout: number | null = null;

    const scheduleClick = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;

      // Click pair 1: front wheel set
      this.playRailClick(ctx, gain, t, 0.45, 460);
      this.playRailClick(ctx, gain, t + 0.13, 0.58, 360);

      // Click pair 2: rear wheel set
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

  // --- NOTTE ESTIVA (Crickets / Grilli estivi autentici in polifonia) ---
  private nightChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    let isStopped = false;
    let chirpTimeout1: number | null = null;
    let chirpTimeout2: number | null = null;

    // Grillo 1: sequenza ritmica di 4 micro-impulsi a ~4500Hz
    const playCricket1 = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      const pulses = 4;
      const freq = 4500 + Math.random() * 350;

      for (let p = 0; p < pulses; p++) {
        const pulseTime = t + p * 0.052;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;

        g.gain.setValueAtTime(0.0001, pulseTime);
        g.gain.linearRampToValueAtTime(0.24, pulseTime + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, pulseTime + 0.044);

        osc.connect(g).connect(gain);
        osc.start(pulseTime);
        osc.stop(pulseTime + 0.048);
      }

      chirpTimeout1 = window.setTimeout(playCricket1, 750 + Math.random() * 950);
    };

    // Grillo 2 (in lontananza): tono leggermente più alto (~5200Hz)
    const playCricket2 = () => {
      if (isStopped || ctx.state === "closed") return;
      const t = ctx.currentTime;
      const pulses = 3;
      const freq = 5100 + Math.random() * 300;

      for (let p = 0; p < pulses; p++) {
        const pulseTime = t + p * 0.046;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;

        g.gain.setValueAtTime(0.0001, pulseTime);
        g.gain.linearRampToValueAtTime(0.16, pulseTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, pulseTime + 0.038);

        osc.connect(g).connect(gain);
        osc.start(pulseTime);
        osc.stop(pulseTime + 0.042);
      }

      chirpTimeout2 = window.setTimeout(playCricket2, 1100 + Math.random() * 1300);
    };

    playCricket1();
    chirpTimeout2 = window.setTimeout(playCricket2, 420);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (chirpTimeout1 !== null) window.clearTimeout(chirpTimeout1);
        if (chirpTimeout2 !== null) window.clearTimeout(chirpTimeout2);
      },
    };
  }

  // --- FUSA DEL GATTO (Resonant purr with breath cycle) ---
  private catPurrChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.value = 68;

    const osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.value = 136;

    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.16;
    osc2.connect(sawGain);

    const oscMix = ctx.createGain();
    osc1.connect(oscMix);
    sawGain.connect(oscMix);

    // Flutter a ~22.5Hz (frequenza tipica delle fusa dei felini)
    const purrLfo = ctx.createOscillator();
    purrLfo.type = "triangle";
    purrLfo.frequency.value = 22.5;

    const purrDepth = ctx.createGain();
    purrDepth.gain.value = 0.55;

    const purrMod = ctx.createGain();
    purrMod.gain.value = 0.5;
    purrLfo.connect(purrDepth).connect(purrMod.gain);

    // Respiro lento dentro/fuori (~3s)
    const breathLfo = ctx.createOscillator();
    breathLfo.type = "sine";
    breathLfo.frequency.value = 0.32;

    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.32;

    const breathMod = ctx.createGain();
    breathMod.gain.value = 0.68;
    breathLfo.connect(breathDepth).connect(breathMod.gain);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 280;

    oscMix.connect(purrMod).connect(breathMod).connect(filter).connect(gain);

    osc1.start();
    osc2.start();
    purrLfo.start();
    breathLfo.start();

    return {
      gain,
      stop: () => {
        try {
          osc1.stop();
          osc2.stop();
          purrLfo.stop();
          breathLfo.stop();
        } catch {}
      },
    };
  }

  // --- PHON (Asciugacapelli) ---
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
      data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.28;
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
    motor.frequency.value = 172;

    const motorGain = ctx.createGain();
    motorGain.gain.value = 0.06;
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

  // --- SCALDINO / CALDOBAGNO ---
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
    fanHum.frequency.value = 96;
    const fanGain = ctx.createGain();
    fanGain.gain.value = 0.065;
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

  // --- TUONI LONTANI ---
  private thunderChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    let timeoutId: number | null = null;
    let isStopped = false;

    const scheduleThunder = () => {
      if (isStopped || ctx.state === "closed") return;
      const nextDelay = 8000 + Math.random() * 11000;
      timeoutId = window.setTimeout(() => {
        if (isStopped || ctx.state === "closed") return;
        this.triggerThunderBoom(gain);
        scheduleThunder();
      }, nextDelay);
    };

    timeoutId = window.setTimeout(() => {
      if (!isStopped) {
        this.triggerThunderBoom(gain);
        scheduleThunder();
      }
    }, 1800);

    return {
      gain,
      stop: () => {
        isStopped = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      },
    };
  }

  private triggerThunderBoom(destination: GainNode) {
    const ctx = this.ensureContext();
    if (ctx.state === "closed") return;
    const duration = 4.8 + Math.random() * 2.2;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.015 * white) / 1.015;
      data[i] = last * 4.2;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(140 + Math.random() * 30, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + duration);

    const boomGain = ctx.createGain();
    const t = ctx.currentTime;
    boomGain.gain.setValueAtTime(0.0001, t);
    boomGain.gain.linearRampToValueAtTime(0.85, t + 0.35);
    boomGain.gain.setValueAtTime(0.5, t + 1.1);
    boomGain.gain.linearRampToValueAtTime(0.7, t + 1.7);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    source.connect(filter).connect(boomGain).connect(destination);
    source.start(t);
    source.stop(t + duration);
  }

  // --- BUFERA DI NEVE ---
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
      data[i] = (b0 + b1) * 0.85;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 520;
    filter.Q.value = 3.6;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.12;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 290;
    lfo.connect(lfoGain).connect(filter.frequency);

    source.connect(filter).connect(gain);
    lfo.start();
    source.start();

    return {
      gain,
      stop: () => {
        try { source.stop(); lfo.stop(); } catch {}
      },
    };
  }

  // --- RUSCELLO ---
  private streamChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.48;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const bp1 = ctx.createBiquadFilter();
    bp1.type = "bandpass";
    bp1.frequency.value = 700;
    bp1.Q.value = 3.2;

    const bp2 = ctx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 1450;
    bp2.Q.value = 3.8;

    const lfo1 = ctx.createOscillator();
    lfo1.frequency.value = 0.38;
    const lfo1Gain = ctx.createGain();
    lfo1Gain.gain.value = 150;
    lfo1.connect(lfo1Gain).connect(bp1.frequency);

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.74;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 240;
    lfo2.connect(lfo2Gain).connect(bp2.frequency);

    source.connect(bp1).connect(gain);
    source.connect(bp2).connect(gain);

    lfo1.start();
    lfo2.start();
    source.start();

    return {
      gain,
      stop: () => {
        try { source.stop(); lfo1.stop(); lfo2.stop(); } catch {}
      },
    };
  }

  // --- TICCHETTIO OROLOGIO ---
  private clockChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    let tick = true;
    const interval = window.setInterval(() => {
      if (ctx.state === "closed") return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      const freq = tick ? 880 : 700;
      filter.frequency.value = freq;
      filter.Q.value = 7;

      osc.type = "triangle";
      osc.frequency.value = freq;

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.038);

      osc.connect(filter).connect(g).connect(gain);
      osc.start(t);
      osc.stop(t + 0.045);
      tick = !tick;
    }, 1000);

    return {
      gain,
      stop: () => window.clearInterval(interval),
    };
  }

  // --- CAMINO ---
  private fireChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const interval = window.setInterval(() => {
      if (ctx.state === "closed") return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 75 + Math.random() * 130;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14 + Math.random() * 0.1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.08);
      osc.connect(g).connect(gain);
      osc.start(t);
      osc.stop(t + 0.2);
    }, 130);
    return { gain, stop: () => window.clearInterval(interval) };
  }

  // --- BOSCO E UCCELLINI ---
  private forestChannel(gain: GainNode): Channel {
    const ctx = this.ensureContext();
    const interval = window.setInterval(() => {
      if (Math.random() > 0.6 || ctx.state === "closed") return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime;
      osc.type = "sine";
      osc.frequency.setValueAtTime(1500 + Math.random() * 1200, t);
      osc.frequency.exponentialRampToValueAtTime(2200 + Math.random() * 1400, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g).connect(gain);
      osc.start(t);
      osc.stop(t + 0.25);
    }, 800);
    return { gain, stop: () => window.clearInterval(interval) };
  }
}
