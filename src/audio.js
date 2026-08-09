/*
 * Sound director: short synthesised action sounds plus spoken vocabulary.
 *
 * Deliberately written against a Safari 13.4 baseline (no logical assignment,
 * no optional catch omission beyond try/catch) because the whole app ships as
 * one classic script for old iPads.
 */

export class AudioDirector {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.context = null;
    this.master = null;
    this.voices = [];
    this.speakTimer = null;
    const self = this;
    if ("speechSynthesis" in window) {
      this.voices = window.speechSynthesis.getVoices() || [];
      if (window.speechSynthesis.addEventListener) {
        window.speechSynthesis.addEventListener("voiceschanged", function () {
          self.voices = window.speechSynthesis.getVoices() || [];
        });
      }
    }
  }

  /* Must be called from inside a real user gesture on iOS. */
  unlock() {
    try {
      const Constructor = window.AudioContext || window.webkitAudioContext;
      if (!Constructor) return;
      if (!this.context) {
        this.context = new Constructor();
        this.master = this.context.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended" && this.context.resume) {
        this.context.resume().catch(function () {});
      }
    } catch (error) {
      this.context = null;
    }
  }

  stop() {
    if (this.speakTimer !== null) {
      clearTimeout(this.speakTimer);
      this.speakTimer = null;
    }
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (error) {
        /* Safari occasionally throws while the queue drains. */
      }
    }
  }

  /*
   * iOS drops utterances queued too close to a cancel(), so every phrase goes
   * through one small timer. Later calls replace earlier ones, which keeps the
   * newest request — the one the child just triggered — audible.
   */
  speak(text, lang, options) {
    if (!this.getSettings().voice || !text || !("speechSynthesis" in window)) return;
    const settings = options || {};
    const self = this;
    if (this.speakTimer !== null) clearTimeout(this.speakTimer);
    try {
      window.speechSynthesis.cancel();
    } catch (error) {
      /* ignored */
    }
    this.speakTimer = window.setTimeout(function () {
      self.speakTimer = null;
      self.speakNow(text, lang || "ja-JP", settings);
    }, settings.delay || 90);
  }

  speakNow(text, lang, settings) {
    try {
      const utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = lang;
      utterance.rate = settings.rate || (lang.indexOf("ja") === 0 ? 0.8 : 0.72);
      utterance.pitch = settings.pitch || 1.08;
      utterance.volume = 1;
      const prefix = lang.toLowerCase().slice(0, 2);
      let chosen = null;
      for (let index = 0; index < this.voices.length; index += 1) {
        const voice = this.voices[index];
        if (voice.lang.toLowerCase().indexOf(prefix) !== 0) continue;
        if (voice.localService) {
          chosen = voice;
          break;
        }
        if (!chosen) chosen = voice;
      }
      if (chosen) utterance.voice = chosen;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      /* Speech is an enhancement; never let it break play. */
    }
  }

  play(kind, variant) {
    if (!this.getSettings().effects) return;
    this.unlock();
    if (!this.context) return;
    const step = Number(variant) || 0;
    if (kind === "open") this.chime([392, 523, 659], 0.07, 0.2);
    else if (kind === "tap") this.tone(340, 0.06, { type: "sine", volume: 0.03 });
    else if (kind === "pick") {
      this.noise(0.09, { frequency: 1100, volume: 0.02 });
      this.tone(300, 0.2, { endFrequency: 700, type: "sine", volume: 0.05 });
    } else if (kind === "pull") {
      this.noise(0.16, { frequency: 430, volume: 0.03 });
      this.tone(170, 0.26, { endFrequency: 580, type: "sine", volume: 0.05 });
    } else if (kind === "land") {
      this.tone(392 + step * 33, 0.14, { endFrequency: 294 + step * 22, type: "triangle", volume: 0.045 });
    } else if (kind === "correct") this.chime([523, 659, 784], 0.065, 0.2);
    else if (kind === "sparkle") this.chime([1046, 1318], 0.05, 0.13, 0.026);
    else if (kind === "nudge") this.tone(232, 0.18, { endFrequency: 196, type: "sine", volume: 0.028 });
    else if (kind === "celebrate") this.chime([523, 659, 784, 1046], 0.085, 0.26);
    else if (kind === "next") this.chime([440, 587], 0.06, 0.15);
  }

  chime(frequencies, spacing, duration, volume) {
    const self = this;
    frequencies.forEach(function (frequency, index) {
      self.tone(frequency, duration, {
        delay: index * spacing,
        type: "triangle",
        volume: volume || 0.04,
      });
    });
  }

  tone(frequency, duration, options) {
    const context = this.context;
    if (!context) return;
    const settings = options || {};
    try {
      const start = context.currentTime + (settings.delay || 0);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = settings.type || "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      if (settings.endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(settings.endFrequency, start + duration);
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(settings.volume || 0.035, start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(this.master || context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    } catch (error) {
      /* ignored */
    }
  }

  noise(duration, options) {
    const context = this.context;
    if (!context) return;
    const settings = options || {};
    try {
      const frameCount = Math.ceil(context.sampleRate * duration);
      const buffer = context.createBuffer(1, frameCount, context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < frameCount; index += 1) {
        channel[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.value = settings.frequency || 1000;
      gain.gain.value = settings.volume || 0.02;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master || context.destination);
      source.start();
    } catch (error) {
      /* ignored */
    }
  }
}
