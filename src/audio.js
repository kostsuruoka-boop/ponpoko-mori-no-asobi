export class AudioDirector {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.context = null;
    this.activeSources = new Set();
    this.voiceCache = [];
    if ("speechSynthesis" in window) {
      this.voiceCache = window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener?.("voiceschanged", () => {
        this.voiceCache = window.speechSynthesis.getVoices();
      });
    }
  }

  unlock() {
    if (!this.getSettings().effects) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context ||= new AudioContext();
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
  }

  stop() {
    this.activeSources.forEach((source) => {
      try { source.stop(); } catch { /* the source may already have ended */ }
    });
    this.activeSources.clear();
    window.speechSynthesis?.cancel();
  }

  speak(text, lang = "ja-JP", options = {}) {
    if (!this.getSettings().voice || !("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = options.rate || (lang.startsWith("ja") ? 0.78 : 0.72);
    utterance.pitch = options.pitch || 1.06;
    utterance.volume = 0.95;
    const language = lang.toLowerCase().slice(0, 2);
    utterance.voice = this.voiceCache.find((voice) => voice.lang.toLowerCase().startsWith(language) && voice.localService)
      || this.voiceCache.find((voice) => voice.lang.toLowerCase().startsWith(language))
      || null;
    window.speechSynthesis.speak(utterance);
  }

  play(kind, variant = 0) {
    if (!this.getSettings().effects) return;
    this.unlock();
    const sounds = {
      open: () => this.chime([392, 523], 0.08, 0.14),
      touch: () => this.tone(310, 0.065, { type: "sine", volume: 0.024 }),
      leaf: () => this.noise(0.075, { frequency: 1500, volume: 0.018 }),
      lift: () => this.tone(210, 0.12, { endFrequency: 330, type: "triangle", volume: 0.032 }),
      pluck: () => {
        this.noise(0.1, { frequency: 900, volume: 0.02 });
        this.tone(240, 0.22, { endFrequency: 650, type: "sine", volume: 0.047 });
      },
      root: () => {
        this.noise(0.15, { frequency: 420, volume: 0.027 });
        this.tone(170, 0.25, { endFrequency: 560, type: "sine", volume: 0.045 });
      },
      drop: () => this.tone(390 + variant * 28, 0.13, { endFrequency: 290, type: "triangle", volume: 0.042 }),
      animalLift: () => this.tone(280, 0.09, { endFrequency: 360, type: "sine", volume: 0.03 }),
      match: () => this.chime([466, 622], 0.07, 0.17),
      word: () => this.chime([523, 659], 0.08, 0.18),
      return: () => this.tone(230, 0.16, { endFrequency: 190, type: "sine", volume: 0.022 }),
      celebrate: () => this.chime([392, 523, 659, 784], 0.075, 0.22),
      next: () => this.chime([440, 587], 0.06, 0.14),
    };
    sounds[kind]?.();
  }

  chime(frequencies, spacing, duration) {
    frequencies.forEach((frequency, index) => this.tone(frequency, duration, {
      delay: index * spacing,
      type: "triangle",
      volume: 0.037,
    }));
  }

  tone(frequency, duration, options = {}) {
    const context = this.context;
    if (!context) return;
    const start = context.currentTime + (options.delay || 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    if (options.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.volume || 0.035, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    this.trackSource(oscillator);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  noise(duration, options = {}) {
    const context = this.context;
    if (!context) return;
    const frameCount = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      const fade = 1 - index / frameCount;
      channel[index] = (Math.random() * 2 - 1) * fade;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = options.frequency || 1000;
    gain.gain.value = options.volume || 0.02;
    source.connect(filter).connect(gain).connect(context.destination);
    this.trackSource(source);
    source.start();
  }

  trackSource(source) {
    this.activeSources.add(source);
    source.addEventListener("ended", () => this.activeSources.delete(source), { once: true });
  }
}
