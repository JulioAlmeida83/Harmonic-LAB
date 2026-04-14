/**
 * Carrega e reproduz notas com AudioBuffer (WAV/OGG/MP3).
 * Se não existir ficheiro, em modo amostras estrito não gera síntese: fica em silêncio.
 * URL por defeito: samples/{midi}.wav (ex.: samples/60.wav = C4)
 */
(function (global) {
  const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  function midiToNoteOctave(midi) {
    const pc = ((midi % 12) + 12) % 12;
    const oct = Math.floor(midi / 12) - 1;
    return NOTE_NAMES[pc] + oct;
  }

  function expandTemplate(template, midi) {
    return template.split("{midi}").join(String(midi)).split("{note}").join(midiToNoteOctave(midi));
  }

  /** Resolve caminhos relativos contra a página (subpastas, baseURI). */
  function resolveFetchUrl(u) {
    const s = (u || "").trim();
    if (!s) return s;
    if (/^(https?:|blob:|data:)/i.test(s)) return s;
    try {
      const base = typeof document !== "undefined" && document.baseURI ? document.baseURI : "";
      if (base) return new URL(s, base).href;
    } catch (_) {
      /* ignora */
    }
    return s;
  }

  /** Limites suaves para evitar crescimento indefinido dos caches em sessões longas. */
  const MAX_NOTE_BUFFERS = 220;
  const MAX_URL_BUFFERS = 160;

  /** Trim simples por ordem de inserção (Map preserva insertion order). */
  function trimMap(map, limit) {
    if (map.size <= limit) return;
    const excess = map.size - limit;
    const it = map.keys();
    for (let i = 0; i < excess; i += 1) {
      const k = it.next().value;
      map.delete(k);
    }
  }

  class InstrumentSampler {
    constructor(audioContext) {
      this.ctx = audioContext;
      /** @type {Map<number, AudioBuffer>} */
      this.cache = new Map();
      /** @type {Map<number, number>} — playbackRate extra quando o WAV veio de outra nota (remoto). */
      this.midiResampleRate = new Map();
      /** @type {Map<string, AudioBuffer>} */
      this.urlBufferCache = new Map();
      /** @type {Map<number, Promise<AudioBuffer|null>>} */
      this.inFlight = new Map();
      this.urlTemplate = "samples/{midi}.wav";
      /** Um único ficheiro; usa playbackRate para altura (menos natural). */
      this.singleFileUrl = "";
      /** MIDI de referência do ficheiro único (p.ex. 60 = C4). */
      this.referenceMidi = 60;
      /** piano | rhodes | cello — usado com HLSoundBank.fallbackBuffer */
      this.fallbackKind = "piano";
      this.sourceVersion = 1;
      /** pluck | sustain | arpeggio */
      this.playbackStyle = "sustain";
      /**
       * Vozes activas — usado por `stopAllVoices()` para cortar tudo instantaneamente
       * quando o utilizador desmarca um botão (ex.: progressão, slots, mute all).
       * Cada entrada: { src, g, stopAt }. Removida automaticamente no `onended`.
       * @type {Set<{src: AudioBufferSourceNode, g: GainNode, stopAt: number}>}
       */
      this.activeVoices = new Set();
    }

    /**
     * Corta imediatamente (com fade curto anti-click) todas as vozes pendentes.
     * Usar quando um controlo que gera harmonia/melodia é desactivado e o
     * utilizador espera silêncio imediato, e não o tail natural da amostra.
     */
    stopAllVoices(fadeSec = 0.02) {
      if (!this.ctx || !this.activeVoices) return;
      const t = this.ctx.currentTime;
      const fade = Math.max(0.005, fadeSec);
      for (const voice of this.activeVoices) {
        try {
          const g = voice.g.gain;
          g.cancelScheduledValues(t);
          g.setValueAtTime(g.value, t);
          g.linearRampToValueAtTime(0, t + fade);
          try { voice.src.stop(t + fade + 0.01); } catch (_) { /* já parou */ }
        } catch (_) { /* defensivo */ }
      }
      this.activeVoices.clear();
    }

    setFallbackKind(k) {
      const next = (k || "piano").toLowerCase();
      if (next === this.fallbackKind) return;
      this.fallbackKind = next;
      this.bumpSource();
    }

    setUrlTemplate(t) {
      const next = (t || "").trim() || "samples/{midi}.wav";
      if (next === this.urlTemplate) return;
      this.urlTemplate = next;
      this.bumpSource();
    }

    setSingleFileUrl(t) {
      const next = (t || "").trim();
      if (next === this.singleFileUrl) return;
      this.singleFileUrl = next;
      this.bumpSource();
    }

    /** Atualiza fonte de uma vez (evita estados intermédios e mistura entre bancos). */
    applySourceConfig(cfg) {
      const nextFallback = ((cfg && cfg.fallbackKind) || "piano").toLowerCase();
      const nextTemplate = ((cfg && cfg.urlTemplate) || "samples/{midi}.wav").trim() || "samples/{midi}.wav";
      const nextSingle = ((cfg && cfg.singleFileUrl) || "").trim();
      const changed =
        nextFallback !== this.fallbackKind ||
        nextTemplate !== this.urlTemplate ||
        nextSingle !== this.singleFileUrl;
      if (!changed) return;
      this.fallbackKind = nextFallback;
      this.urlTemplate = nextTemplate;
      this.singleFileUrl = nextSingle;
      this.bumpSource();
    }

    bumpSource() {
      this.sourceVersion += 1;
      this.clearCache();
    }

    setPlaybackStyle(style) {
      const s = (style || "sustain").toLowerCase();
      if (s === "pluck") this.playbackStyle = "pluck";
      else if (s === "arpeggio" || s === "arpeggio_full") this.playbackStyle = "arpeggio";
      else this.playbackStyle = "sustain";
    }

    clearCache() {
      this.cache.clear();
      this.inFlight.clear();
      this.midiResampleRate.clear();
      this.urlBufferCache.clear();
    }

    /** Recurso interno legado (mantido apenas para compatibilidade). */
    createPluckBuffer(midi) {
      const kind = this.fallbackKind || "piano";
      if (globalThis.HLSoundBank && typeof globalThis.HLSoundBank.fallbackBuffer === "function") {
        return globalThis.HLSoundBank.fallbackBuffer(this.ctx, midi, kind);
      }
      const f = 440 * 2 ** ((midi - 69) / 12);
      const sr = this.ctx.sampleRate;
      const dur = 0.38;
      const len = Math.max(256, Math.floor(sr * dur));
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      let peak = 0.0001;
      for (let i = 0; i < len; i += 1) {
        const t = i / sr;
        const env = Math.exp(-t * 10.2);
        const w =
          0.62 * Math.sin(2 * Math.PI * f * t) +
          0.26 * Math.sin(2 * Math.PI * f * 2.01 * t) +
          0.11 * Math.sin(2 * Math.PI * f * 3.98 * t + 0.35);
        const v = env * w * 0.42;
        d[i] = v;
        peak = Math.max(peak, Math.abs(v));
      }
      const sc = 0.88 / peak;
      for (let i = 0; i < len; i += 1) d[i] *= sc;
      return buf;
    }

    async loadOne(midi) {
      if (this.cache.has(midi)) return this.cache.get(midi);
      if (this.inFlight.has(midi)) return this.inFlight.get(midi);
      if (this.fallbackKind === "internal") {
        const b = this.createPluckBuffer(midi);
        this.cache.set(midi, b);
        this.midiResampleRate.delete(midi);
        trimMap(this.cache, MAX_NOTE_BUFFERS);
        return b;
      }
      const sourceVersionAtStart = this.sourceVersion;

      const urls = [];
      if (this.singleFileUrl) urls.push(this.singleFileUrl);
      else urls.push(expandTemplate(this.urlTemplate, midi));

      const p = (async () => {
        try {
          try {
            if (this.ctx.state === "suspended" || this.ctx.state === "interrupted") {
              await this.ctx.resume();
            }
          } catch (_) {
            /* ignora */
          }

          for (const url of urls) {
            try {
              const fetchUrl = resolveFetchUrl(url);
              const res = await fetch(fetchUrl, { mode: "cors", cache: "default" });
              if (!res.ok) continue;
              const ab = await res.arrayBuffer();
              const buf = await this.ctx.decodeAudioData(ab.slice(0));
              if (sourceVersionAtStart !== this.sourceVersion) return null;
              this.cache.set(midi, buf);
              this.midiResampleRate.delete(midi);
              trimMap(this.cache, MAX_NOTE_BUFFERS);
              return buf;
            } catch (_) {
              /* tenta próximo URL */
            }
          }

          /* Fallback local por vizinho: usa amostras 48..60 e transpõe via playbackRate. */
          const bank = globalThis.HLSoundBank;
          if (!this.singleFileUrl && bank && typeof bank.nearestAnchorMidi === "function") {
            const nearMidi = bank.nearestAnchorMidi(this.fallbackKind, midi);
            try {
              const nearUrl = resolveFetchUrl(expandTemplate(this.urlTemplate, nearMidi));
              const res = await fetch(nearUrl, { mode: "cors", cache: "default" });
              if (res.ok) {
                const ab = await res.arrayBuffer();
                const buf = await this.ctx.decodeAudioData(ab.slice(0));
                if (sourceVersionAtStart !== this.sourceVersion) return null;
                this.cache.set(midi, buf);
                const stretch = 2 ** ((midi - nearMidi) / 12);
                if (Math.abs(stretch - 1) > 0.0005) this.midiResampleRate.set(midi, stretch);
                else this.midiResampleRate.delete(midi);
                trimMap(this.cache, MAX_NOTE_BUFFERS);
                return buf;
              }
            } catch (_) {
              /* tenta remoto na sequência */
            }
          }

          const plan =
            bank && typeof bank.getRemoteSamplePlan === "function" && bank.remoteSamplesEnabled !== false
              ? bank.getRemoteSamplePlan(this.fallbackKind, midi)
              : null;
          if (plan && plan.url) {
            try {
              let buf = this.urlBufferCache.get(plan.url);
              if (!buf) {
                const res = await fetch(plan.url, { mode: "cors", cache: "default" });
                if (res.ok) {
                  const ab = await res.arrayBuffer();
                  buf = await this.ctx.decodeAudioData(ab.slice(0));
                  if (sourceVersionAtStart !== this.sourceVersion) return null;
                  this.urlBufferCache.set(plan.url, buf);
                }
              }
              if (buf) {
                if (sourceVersionAtStart !== this.sourceVersion) return null;
                this.cache.set(midi, buf);
                const anchor = typeof plan.anchorMidi === "number" ? plan.anchorMidi : midi;
                const stretch = 2 ** ((midi - anchor) / 12);
                if (Math.abs(stretch - 1) > 0.0005) this.midiResampleRate.set(midi, stretch);
                else this.midiResampleRate.delete(midi);
                trimMap(this.cache, MAX_NOTE_BUFFERS);
                trimMap(this.urlBufferCache, MAX_URL_BUFFERS);
                return buf;
              }
            } catch (_) {
              /* cai para fallback interno */
            }
          }

          return null;
        } finally {
          this.inFlight.delete(midi);
        }
      })();

      this.inFlight.set(midi, p);
      return p;
    }

    /**
     * Pré-carrega um intervalo de MIDI; ignora falhas silenciosamente.
     * @param {number} lo
     * @param {number} hi
     */
    async preloadRange(lo, hi) {
      const jobs = [];
      for (let m = lo; m <= hi; m += 1) jobs.push(this.loadOne(m));
      await Promise.allSettled(jobs);
    }

    /**
     * @param {AudioNode} dest — nó de entrada (ex.: Gain ligado ao master)
     * @param {number} midi
     * @param {number} when — AudioContext.currentTime
     * @param {number} peakGain 0..1
     * @param {number} duration — duração alvo da nota (s)
     * @returns {boolean}
     */
    playNoteAt(dest, midi, when, peakGain, duration, styleOverride) {
      let buf = this.cache.get(midi);
      let rate = 1;
      if (!buf && this.cache.has(-1)) {
        buf = this.cache.get(-1);
        rate = 2 ** ((midi - this.referenceMidi) / 12);
      }
      if (!buf) {
        if (this.fallbackKind === "internal") {
          buf = this.createPluckBuffer(midi);
          this.cache.set(midi, buf);
          this.midiResampleRate.delete(midi);
        }
      }
      if (!buf) {
        // Carregamento tardio: não bloqueia a UI; próximas batidas já tocam.
        void this.loadOne(midi);
        return false;
      }

      const resample = this.midiResampleRate.get(midi) ?? 1;
      const effRate = rate * resample;
      const now = this.ctx.currentTime;
      /** Se `when` já passou (ex.: após await longo), os ramps ficam no passado e a nota cala-se. */
      const t0 = Math.max(when, now + 0.002);
      const pk = Math.max(0, Math.min(0.95, Number(peakGain) || 0));

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = effRate;

      const g = this.ctx.createGain();
      const noteDur = Math.max(0.08, Number(duration) || 0.16);
      const style = (styleOverride || this.playbackStyle || "sustain").toLowerCase();
      const isPluckLike = style === "pluck" || style === "arpeggio";
      const atk = isPluckLike ? 0.006 : Math.min(0.02, Math.max(0.006, noteDur * 0.1));
      const tail = buf.duration / effRate + 0.04;
      const tailSafe = Number.isFinite(tail) && tail > 0 ? tail : 0.8;
      const hold =
        isPluckLike
          ? Math.max(0.03, Math.min(noteDur * 0.34, tailSafe * 0.45))
          : Math.max(atk + 0.03, Math.min(noteDur, tailSafe * 0.82));
      const rel =
        isPluckLike
          ? Math.max(0.04, Math.min(0.12, noteDur * 0.35))
          : Math.max(0.06, Math.min(0.28, noteDur * 0.45));
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(pk, t0 + atk);
      g.gain.setValueAtTime(pk * 0.92, t0 + hold);
      g.gain.linearRampToValueAtTime(0, t0 + hold + rel);

      src.connect(g);
      // Cor de timbre por instrumento, para diferenciar mesmo com o mesmo WAV-base.
      if (this.fallbackKind === "rhodes") {
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2500;
        lp.Q.value = 0.75;
        const hs = this.ctx.createBiquadFilter();
        hs.type = "highshelf";
        hs.frequency.value = 1600;
        hs.gain.value = 2.5;
        g.connect(lp);
        lp.connect(hs);
        hs.connect(dest);
      } else if (this.fallbackKind === "cello") {
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1400;
        lp.Q.value = 0.6;
        const pkf = this.ctx.createBiquadFilter();
        pkf.type = "peaking";
        pkf.frequency.value = 320;
        pkf.Q.value = 1.2;
        pkf.gain.value = 4.2;
        g.connect(lp);
        lp.connect(pkf);
        pkf.connect(dest);
      } else if (this.fallbackKind === "acoustic_bass") {
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        lp.Q.value = 0.8;
        const lows = this.ctx.createBiquadFilter();
        lows.type = "lowshelf";
        lows.frequency.value = 180;
        lows.gain.value = 4.5;
        g.connect(lp);
        lp.connect(lows);
        lows.connect(dest);
      } else if (this.fallbackKind === "jazz_bass") {
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2400;
        lp.Q.value = 0.65;
        const pkf = this.ctx.createBiquadFilter();
        pkf.type = "peaking";
        pkf.frequency.value = 420;
        pkf.Q.value = 1.0;
        pkf.gain.value = 3.2;
        const lows = this.ctx.createBiquadFilter();
        lows.type = "lowshelf";
        lows.frequency.value = 120;
        lows.gain.value = 3.8;
        g.connect(lp);
        lp.connect(pkf);
        pkf.connect(lows);
        lows.connect(dest);
      } else if (this.fallbackKind === "fender_guitar") {
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 110;
        const pkf = this.ctx.createBiquadFilter();
        pkf.type = "peaking";
        pkf.frequency.value = 2600;
        pkf.Q.value = 0.9;
        pkf.gain.value = 3.6;
        g.connect(hp);
        hp.connect(pkf);
        pkf.connect(dest);
      } else if (this.fallbackKind === "guitar_distorted") {
        const pre = this.ctx.createGain();
        pre.gain.value = 0.72;
        const ws = this.ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i += 1) {
          const x = (i / 128) - 1;
          curve[i] = Math.tanh(x * 3.1) * 0.82;
        }
        ws.curve = curve;
        ws.oversample = "2x";
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 95;
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 5200;
        lp.Q.value = 0.55;
        const post = this.ctx.createGain();
        post.gain.value = 1.12;
        g.connect(pre);
        pre.connect(ws);
        ws.connect(hp);
        hp.connect(lp);
        lp.connect(post);
        post.connect(dest);
      } else if (this.fallbackKind === "acoustic_guitar") {
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2200;
        lp.Q.value = 0.7;
        const mids = this.ctx.createBiquadFilter();
        mids.type = "peaking";
        mids.frequency.value = 750;
        mids.Q.value = 1.1;
        mids.gain.value = 2.8;
        g.connect(lp);
        lp.connect(mids);
        mids.connect(dest);
      } else if (this.fallbackKind === "clarinet") {
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 180;
        const pkf = this.ctx.createBiquadFilter();
        pkf.type = "peaking";
        pkf.frequency.value = 980;
        pkf.Q.value = 1.15;
        pkf.gain.value = 2.4;
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 6200;
        lp.Q.value = 0.55;
        g.connect(hp);
        hp.connect(pkf);
        pkf.connect(lp);
        lp.connect(dest);
      } else if (this.fallbackKind === "native_flute") {
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3400;
        lp.Q.value = 0.72;
        const pkf = this.ctx.createBiquadFilter();
        pkf.type = "peaking";
        pkf.frequency.value = 620;
        pkf.Q.value = 1.0;
        pkf.gain.value = 2.2;
        const hs = this.ctx.createBiquadFilter();
        hs.type = "highshelf";
        hs.frequency.value = 5200;
        hs.gain.value = -4.5;
        g.connect(lp);
        lp.connect(pkf);
        pkf.connect(hs);
        hs.connect(dest);
      } else if (this.fallbackKind === "harmonium") {
        // Realce harmônico sustentado (reed + corpo de madeira).
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3800;
        lp.Q.value = 0.6;
        const pkf = this.ctx.createBiquadFilter();
        pkf.type = "peaking";
        pkf.frequency.value = 520;
        pkf.Q.value = 1.2;
        pkf.gain.value = 3.0;
        const ls = this.ctx.createBiquadFilter();
        ls.type = "lowshelf";
        ls.frequency.value = 260;
        ls.gain.value = 2.0;
        g.connect(lp);
        lp.connect(pkf);
        pkf.connect(ls);
        ls.connect(dest);
      } else if (this.fallbackKind === "harp") {
        // Cristalino, com corpo nos graves. HP suave e realce em 1.6 kHz.
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 80;
        const pkf = this.ctx.createBiquadFilter();
        pkf.type = "peaking";
        pkf.frequency.value = 1600;
        pkf.Q.value = 0.9;
        pkf.gain.value = 2.6;
        const hs = this.ctx.createBiquadFilter();
        hs.type = "highshelf";
        hs.frequency.value = 5600;
        hs.gain.value = 1.5;
        g.connect(hp);
        hp.connect(pkf);
        pkf.connect(hs);
        hs.connect(dest);
      } else if (this.fallbackKind === "guitar_nylon") {
        // Nylon — mais escuro e quente que a acústica; realce em 800 Hz.
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2600;
        lp.Q.value = 0.7;
        const pkf = this.ctx.createBiquadFilter();
        pkf.type = "peaking";
        pkf.frequency.value = 820;
        pkf.Q.value = 1.0;
        pkf.gain.value = 3.0;
        const hs = this.ctx.createBiquadFilter();
        hs.type = "highshelf";
        hs.frequency.value = 4800;
        hs.gain.value = -2.2;
        g.connect(lp);
        lp.connect(pkf);
        pkf.connect(hs);
        hs.connect(dest);
      } else if (this.fallbackKind === "violin") {
        // Brilho em 2.5 kHz + corpo em 400 Hz; HP para limpar graves.
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 180;
        const pkBody = this.ctx.createBiquadFilter();
        pkBody.type = "peaking";
        pkBody.frequency.value = 400;
        pkBody.Q.value = 1.1;
        pkBody.gain.value = 2.0;
        const pkAir = this.ctx.createBiquadFilter();
        pkAir.type = "peaking";
        pkAir.frequency.value = 2500;
        pkAir.Q.value = 0.9;
        pkAir.gain.value = 3.2;
        g.connect(hp);
        hp.connect(pkBody);
        pkBody.connect(pkAir);
        pkAir.connect(dest);
      } else if (this.fallbackKind === "saxophone") {
        // Corpo médio-forte (500 Hz) e "rasgo" em 2 kHz; LP a 5.5 kHz.
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 5500;
        lp.Q.value = 0.55;
        const pkBody = this.ctx.createBiquadFilter();
        pkBody.type = "peaking";
        pkBody.frequency.value = 500;
        pkBody.Q.value = 1.2;
        pkBody.gain.value = 2.6;
        const pkEdge = this.ctx.createBiquadFilter();
        pkEdge.type = "peaking";
        pkEdge.frequency.value = 2000;
        pkEdge.Q.value = 0.95;
        pkEdge.gain.value = 3.2;
        g.connect(lp);
        lp.connect(pkBody);
        pkBody.connect(pkEdge);
        pkEdge.connect(dest);
      } else if (this.fallbackKind === "trumpet") {
        // Brilhante/penetrante: HP 140 Hz, bump em 1.5 kHz e 3.2 kHz.
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 140;
        const pkMid = this.ctx.createBiquadFilter();
        pkMid.type = "peaking";
        pkMid.frequency.value = 1500;
        pkMid.Q.value = 1.0;
        pkMid.gain.value = 3.0;
        const pkHi = this.ctx.createBiquadFilter();
        pkHi.type = "peaking";
        pkHi.frequency.value = 3200;
        pkHi.Q.value = 0.85;
        pkHi.gain.value = 2.5;
        g.connect(hp);
        hp.connect(pkMid);
        pkMid.connect(pkHi);
        pkHi.connect(dest);
      } else if (this.fallbackKind === "trombone") {
        // Grave encorpado, LP em 4.2 kHz, realce em 350 Hz.
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 4200;
        lp.Q.value = 0.6;
        const pkBody = this.ctx.createBiquadFilter();
        pkBody.type = "peaking";
        pkBody.frequency.value = 350;
        pkBody.Q.value = 1.2;
        pkBody.gain.value = 3.2;
        const ls = this.ctx.createBiquadFilter();
        ls.type = "lowshelf";
        ls.frequency.value = 160;
        ls.gain.value = 2.0;
        g.connect(lp);
        lp.connect(pkBody);
        pkBody.connect(ls);
        ls.connect(dest);
      } else if (this.fallbackKind === "french_horn") {
        // Mellow / warm: LP 3.5 kHz, bump suave em 600 Hz, HS -3 dB.
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3500;
        lp.Q.value = 0.58;
        const pkBody = this.ctx.createBiquadFilter();
        pkBody.type = "peaking";
        pkBody.frequency.value = 600;
        pkBody.Q.value = 1.0;
        pkBody.gain.value = 2.5;
        const hs = this.ctx.createBiquadFilter();
        hs.type = "highshelf";
        hs.frequency.value = 4500;
        hs.gain.value = -3.0;
        g.connect(lp);
        lp.connect(pkBody);
        pkBody.connect(hs);
        hs.connect(dest);
      } else if (this.fallbackKind === "bassoon") {
        // Grave com reed: HP 70 Hz, realce em 280 Hz, LP 3.8 kHz.
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 70;
        const pkBody = this.ctx.createBiquadFilter();
        pkBody.type = "peaking";
        pkBody.frequency.value = 280;
        pkBody.Q.value = 1.1;
        pkBody.gain.value = 3.2;
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3800;
        lp.Q.value = 0.55;
        g.connect(hp);
        hp.connect(pkBody);
        pkBody.connect(lp);
        lp.connect(dest);
      } else if (this.fallbackKind === "xylophone") {
        // Percussivo e brilhante: HP 250 Hz, bump em 3 kHz e 5 kHz.
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 250;
        const pk1 = this.ctx.createBiquadFilter();
        pk1.type = "peaking";
        pk1.frequency.value = 3000;
        pk1.Q.value = 1.0;
        pk1.gain.value = 3.0;
        const pk2 = this.ctx.createBiquadFilter();
        pk2.type = "peaking";
        pk2.frequency.value = 5500;
        pk2.Q.value = 0.9;
        pk2.gain.value = 2.6;
        g.connect(hp);
        hp.connect(pk1);
        pk1.connect(pk2);
        pk2.connect(dest);
      } else {
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 4200;
        lp.Q.value = 0.45;
        g.connect(lp);
        lp.connect(dest);
      }
      const stopAt = Math.min(t0 + buf.duration / effRate + 0.12, t0 + hold + rel + 0.04);
      src.start(t0);
      src.stop(stopAt);
      const voice = { src, g, stopAt };
      this.activeVoices.add(voice);
      src.onended = () => { this.activeVoices.delete(voice); };
      return true;
    }

    /** Várias notas em leque (acorde de referência). */
    playChordAt(dest, midis, when, peakGain, stagger = 0.014) {
      midis.forEach((m, i) => {
        this.playNoteAt(dest, m, when + i * stagger, peakGain, 0.34);
      });
    }

    /** Para modo "um ficheiro só": carrega e guarda em cache especial. */
    async loadSingleReference(midiRef = 60) {
      this.referenceMidi = midiRef;
      if (!this.singleFileUrl) return false;
      try {
        try {
          if (this.ctx.state === "suspended" || this.ctx.state === "interrupted") {
            await this.ctx.resume();
          }
        } catch (_) {
          /* ignora */
        }
        const res = await fetch(resolveFetchUrl(this.singleFileUrl), { mode: "cors", cache: "default" });
        if (!res.ok) throw new Error("HTTP");
        const buf = await this.ctx.decodeAudioData((await res.arrayBuffer()).slice(0));
        this.cache.set(-1, buf);
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  global.HLInstrumentSampler = InstrumentSampler;
})(typeof window !== "undefined" ? window : globalThis);
