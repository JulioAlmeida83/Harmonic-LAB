/**
 * Banco instrumental (vários timbres).
 * WAV esperados em samples/bank/{instrumento}/{midi}.wav
 * Sem ficheiro: gera buffers curtos com timbre distinto por instrumento.
 */
(function (global) {
  /**
   * Uma oitava cromática em WAV — domínio público. Ficheiros c1…c2 ≈ MIDI 48–60 (C3–C4).
   * @see https://github.com/parisjava/wav-piano-sound
   */
  const PARIS_REMOTE = {
    base: "https://raw.githubusercontent.com/parisjava/wav-piano-sound/master/wav/",
    anchors: [
      { midi: 48, file: "c1.wav" },
      { midi: 49, file: "c1s.wav" },
      { midi: 50, file: "d1.wav" },
      { midi: 51, file: "d1s.wav" },
      { midi: 52, file: "e1.wav" },
      { midi: 53, file: "f1.wav" },
      { midi: 54, file: "f1s.wav" },
      { midi: 55, file: "g1.wav" },
      { midi: 56, file: "g1s.wav" },
      { midi: 57, file: "a1.wav" },
      { midi: 58, file: "a1s.wav" },
      { midi: 59, file: "b1.wav" },
      { midi: 60, file: "c2.wav" },
    ],
  };

  /** Se não existirem WAV locais, o sampler pode ir buscar estes URL (CORS OK no raw.githubusercontent). */
  let remoteSamplesEnabled = true;

  /**
   * Mapeamento kind -> diretório em https://github.com/nbrosowsky/tonejs-instruments (MIT, samples CC-BY 3.0).
   * É o mesmo pack que `npm run fetch-samples` instala localmente. Quando não há WAVs locais
   * (ex.: deploy no Pages), usamos estas URLs via `getRemoteSamplePlan`. Os ficheiros seguem
   * a convenção `{Nota}{oct}.wav`, com `s` para sustenido (ex.: `Cs4.wav`, `As3.wav`).
   */
  const TONEJS_BASE = "https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples";
  const TONEJS_SOURCE_DIR = {
    piano: "piano",
    piano_bright: "piano",
    rhodes: "organ",
    rhodes_glassy: "organ",
    wurli: "organ",
    clavinet: "organ",
    organ_rock: "organ",
    cello: "cello",
    acoustic_bass: "contrabass",
    jazz_bass: "bass-electric",
    bass_finger_round: "bass-electric",
    bass_pick_bright: "bass-electric",
    fender_guitar: "guitar-electric",
    guitar_distorted: "guitar-electric",
    guitar_jazz_clean: "guitar-electric",
    guitar_crunch: "guitar-electric",
    guitar_lead: "guitar-electric",
    acoustic_guitar: "guitar-acoustic",
    clarinet: "clarinet",
    native_flute: "flute",
    // Novos mapeamentos para o pack remoto (tonejs-instruments)
    harmonium: "harmonium",
    harp: "harp",
    guitar_nylon: "guitar-nylon",
    violin: "violin",
    saxophone: "saxophone",
    trumpet: "trumpet",
    trombone: "trombone",
    french_horn: "french-horn",
    bassoon: "bassoon",
    xylophone: "xylophone",
  };

  const TONEJS_NOTE_NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
  function midiToToneJsFile(midi) {
    const pc = ((midi % 12) + 12) % 12;
    const oct = Math.floor(midi / 12) - 1;
    return `${TONEJS_NOTE_NAMES[pc]}${oct}.wav`;
  }

  const BANK = {
    internal: {
      label: "Som interno",
      pattern: "",
      fallbackKind: "internal",
      anchors: [24, 36, 48, 60, 72, 84, 96, 108],
    },
    piano: {
      label: "Piano de cauda (grand)",
      pattern: "samples/bank/piano/{midi}.wav",
      fallbackKind: "piano",
      anchors: [24, 26, 28, 29, 31, 33, 35, 36, 38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96, 98, 100, 101, 103, 105, 107, 108],
    },
    rhodes: {
      label: "Rhodes / E-piano",
      pattern: "samples/bank/rhodes/{midi}.wav",
      fallbackKind: "rhodes",
      anchors: [24, 33, 36, 45, 48, 57, 60, 69, 72, 81, 84],
    },
    rhodes_glassy: {
      label: "Rhodes brilhante (glassy)",
      pattern: "samples/bank/rhodes_glassy/{midi}.wav",
      fallbackKind: "rhodes_glassy",
      anchors: [24, 33, 36, 45, 48, 57, 60, 69, 72, 81, 84],
    },
    wurli: {
      label: "Wurlitzer (bite)",
      pattern: "samples/bank/wurli/{midi}.wav",
      fallbackKind: "wurli",
      anchors: [24, 33, 36, 45, 48, 57, 60, 69, 72, 81, 84],
    },
    clavinet: {
      label: "Clavinet (ataque)",
      pattern: "samples/bank/clavinet/{midi}.wav",
      fallbackKind: "clavinet",
      anchors: [36, 40, 45, 48, 52, 57, 60, 64, 69, 72, 76, 81, 84],
    },
    organ_rock: {
      label: "Órgão rock (drawbar)",
      pattern: "samples/bank/organ_rock/{midi}.wav",
      fallbackKind: "organ_rock",
      anchors: [24, 36, 48, 60, 72, 84, 96],
    },
    piano_bright: {
      label: "Piano bright (rock/pop)",
      pattern: "samples/bank/piano_bright/{midi}.wav",
      fallbackKind: "piano_bright",
      anchors: [24, 36, 48, 60, 72, 84, 96, 108],
    },
    cello: {
      label: "Violoncelo",
      pattern: "samples/bank/cello/{midi}.wav",
      fallbackKind: "cello",
      anchors: [36, 38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72],
    },
    acoustic_bass: {
      label: "Contrabaixo acústico",
      pattern: "samples/bank/acoustic_bass/{midi}.wav",
      fallbackKind: "acoustic_bass",
      // Anchors = inventário real em samples/bank/acoustic_bass/.
      // `nearestAnchorMidi` só é útil se apontar para ficheiros que existem —
      // caso contrário o fallback cai em 404 e o acorde perde notas.
      anchors: [30, 31, 34, 36, 38, 40, 42, 44, 45, 49, 52, 56, 59],
    },
    jazz_upright_bass: {
      label: "Contrabaixo jazz (pizzicato)",
      pattern: "samples/bank/jazz_upright_bass/{midi}.wav",
      fallbackKind: "jazz_upright_bass",
      // Anchors do pack dsmolken (npm run fetch-iowa-mis).
      anchors: [24, 27, 31, 34, 38, 41, 45, 48, 52, 55, 57],
    },
    jazz_bass: {
      label: "Baixo elétrico (Jazz / precisão)",
      pattern: "samples/bank/jazz_bass/{midi}.wav",
      fallbackKind: "jazz_bass",
      anchors: [25, 28, 31, 34, 37, 40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70, 73],
    },
    bass_finger_round: {
      label: "Baixo finger (round)",
      pattern: "samples/bank/bass_finger_round/{midi}.wav",
      fallbackKind: "bass_finger_round",
      anchors: [28, 31, 34, 37, 40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70, 73],
    },
    bass_pick_bright: {
      label: "Baixo pick (bright)",
      pattern: "samples/bank/bass_pick_bright/{midi}.wav",
      fallbackKind: "bass_pick_bright",
      anchors: [28, 31, 34, 37, 40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70, 73],
    },
    fender_guitar: {
      label: "Guitarra elétrica (limpa)",
      pattern: "samples/bank/fender_guitar/{midi}.wav",
      fallbackKind: "fender_guitar",
      anchors: [40, 45, 48, 57, 60, 69, 72, 81, 84],
    },
    guitar_jazz_clean: {
      label: "Guitarra jazz clean (hollow)",
      pattern: "samples/bank/guitar_jazz_clean/{midi}.wav",
      fallbackKind: "guitar_jazz_clean",
      anchors: [40, 45, 48, 57, 60, 69, 72, 81, 84],
    },
    guitar_crunch: {
      label: "Guitarra crunch (edge)",
      pattern: "samples/bank/guitar_crunch/{midi}.wav",
      fallbackKind: "guitar_crunch",
      anchors: [40, 45, 48, 57, 60, 69, 72, 81, 84],
    },
    guitar_lead: {
      label: "Guitarra lead (clara)",
      pattern: "samples/bank/guitar_lead/{midi}.wav",
      fallbackKind: "guitar_lead",
      anchors: [40, 45, 48, 57, 60, 69, 72, 81, 84],
    },
    guitar_distorted: {
      label: "Guitarra com distorção (drive)",
      pattern: "samples/bank/guitar_distorted/{midi}.wav",
      fallbackKind: "guitar_distorted",
      anchors: [40, 45, 48, 57, 60, 69, 72, 81, 84],
    },
    acoustic_guitar: {
      label: "Guitarra acústica",
      pattern: "samples/bank/acoustic_guitar/{midi}.wav",
      fallbackKind: "acoustic_guitar",
      anchors: [38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74],
    },
    clarinet: {
      label: "Clarinete",
      pattern: "samples/bank/clarinet/{midi}.wav",
      fallbackKind: "clarinet",
      anchors: [50, 53, 58, 62, 65, 70, 74, 77, 82, 86, 90],
    },
    native_flute: {
      label: "Flauta (transversal; EQ suave)",
      pattern: "samples/bank/native_flute/{midi}.wav",
      fallbackKind: "native_flute",
      anchors: [60, 64, 69, 72, 76, 81, 84, 88, 93, 96],
    },
    // --- Novos instrumentos harmónicos ---
    harmonium: {
      label: "Harmônio (pad harmônico sustentado)",
      pattern: "samples/bank/harmonium/{midi}.wav",
      fallbackKind: "harmonium",
      // Cobertura densa 36–74 (todos os semitons exceto 66); anchors limitados
      // ao que existe em disco para garantir fallback por vizinho sem 404.
      anchors: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 67, 68, 69, 70, 71, 72, 73, 74],
    },
    harp: {
      label: "Harpa (arpejos e acordes cristalinos)",
      pattern: "samples/bank/harp/{midi}.wav",
      fallbackKind: "harp",
      anchors: [28, 31, 35, 38, 41, 45, 48, 52, 55, 59, 62, 65, 69, 72, 76, 79, 83, 86, 89, 93, 95, 98, 101],
    },
    guitar_nylon: {
      label: "Violão de nylon (clássico / bossa)",
      pattern: "samples/bank/guitar_nylon/{midi}.wav",
      fallbackKind: "guitar_nylon",
      // Inventário real em disco. Lista anterior declarava 48/60/67/72 que não
      // existem — consequência: ao tocar o I (C-E-G em C4) só E soava, dando
      // impressão de "uma única nota". Agora cada nota resolve para um vizinho
      // real (59/61 para C4, 66/68 para G4) com pitch-shift de 1 semitom.
      anchors: [35, 38, 40, 42, 44, 45, 47, 49, 50, 52, 54, 55, 57, 59, 61, 63, 64, 66, 68, 69, 71, 73, 74, 76, 78, 79, 80, 81, 82],
    },
    violin: {
      label: "Violino (solo)",
      pattern: "samples/bank/violin/{midi}.wav",
      fallbackKind: "violin",
      anchors: [55, 57, 60, 64, 67, 69, 72, 76, 79, 81, 84, 88, 91, 93, 96],
    },
    saxophone: {
      label: "Saxofone (tenor / alto)",
      pattern: "samples/bank/saxophone/{midi}.wav",
      fallbackKind: "saxophone",
      anchors: [49, 50, 51, 52, 53, 54, 55, 56, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81],
    },
    trumpet: {
      label: "Trompete",
      pattern: "samples/bank/trumpet/{midi}.wav",
      fallbackKind: "trumpet",
      anchors: [53, 57, 60, 63, 65, 67, 70, 74, 77, 81, 84],
    },
    trombone: {
      label: "Trombone",
      pattern: "samples/bank/trombone/{midi}.wav",
      fallbackKind: "trombone",
      anchors: [34, 37, 39, 41, 44, 46, 48, 50, 51, 53, 56, 58, 60, 61, 62, 63, 65],
    },
    french_horn: {
      label: "Trompa (french horn — pad de metais)",
      pattern: "samples/bank/french_horn/{midi}.wav",
      fallbackKind: "french_horn",
      anchors: [33, 36, 39, 43, 50, 53, 57, 60, 74, 77],
    },
    bassoon: {
      label: "Fagote (grave / reed)",
      pattern: "samples/bank/bassoon/{midi}.wav",
      fallbackKind: "bassoon",
      anchors: [43, 45, 48, 55, 57, 60, 64, 67, 69, 72],
    },
    xylophone: {
      label: "Xilofone (pontos percussivos)",
      pattern: "samples/bank/xylophone/{midi}.wav",
      fallbackKind: "xylophone",
      anchors: [67, 72, 79, 84, 91, 96, 103, 108],
    },
  };

  function normalizePeakMono(buf) {
    const d = buf.getChannelData(0);
    let peak = 0.0001;
    for (let i = 0; i < d.length; i += 1) peak = Math.max(peak, Math.abs(d[i]));
    const sc = 0.88 / peak;
    for (let i = 0; i < d.length; i += 1) d[i] *= sc;
    return buf;
  }

  /** Som interno até existir WAV real (por MIDI). */
  function fallbackBuffer(ctx, midi, kind) {
    const f = 440 * 2 ** ((midi - 69) / 12);
    const sr = ctx.sampleRate;

    if (kind === "internal") {
      const dur = 1.35;
      const len = Math.max(1200, Math.floor(sr * dur));
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      const atk = 0.08;
      const relStart = 0.92;
      for (let i = 0; i < len; i += 1) {
        const t = i / sr;
        const a = Math.min(1, t / atk);
        const rel = t > relStart ? Math.exp(-(t - relStart) * 6.5) : 1;
        const env = a * rel;
        // Sem vibrato no "Som interno": evita batimentos/desafinação em acordes.
        const fmod = f;
        const w =
          0.62 * Math.sin(2 * Math.PI * fmod * t) +
          0.24 * Math.sin(2 * Math.PI * fmod * 2 * t) +
          0.1 * Math.sin(2 * Math.PI * fmod * 3 * t);
        d[i] = env * w * 0.52;
      }
      return normalizePeakMono(buf);
    }

    if (kind === "rhodes" || kind === "rhodes_glassy" || kind === "wurli" || kind === "clavinet" || kind === "organ_rock") {
      const dur = 0.48;
      const len = Math.max(400, Math.floor(sr * dur));
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        const t = i / sr;
        const envBase = Math.exp(-t * (kind === "organ_rock" ? 2.8 : 5.8)) * (1 - Math.exp(-t * 140));
        const fm = 0.11 * Math.sin(2 * Math.PI * 7.1 * f * t);
        let w =
          0.38 * Math.sin(2 * Math.PI * f * t + fm) +
          0.34 * Math.sin(2 * Math.PI * f * 2.003 * t + fm * 0.6) +
          0.2 * Math.sin(2 * Math.PI * f * 3.99 * t) +
          0.06 * Math.sin(2 * Math.PI * f * 5.02 * t);
        if (kind === "rhodes_glassy") {
          w += 0.12 * Math.sin(2 * Math.PI * f * 6.02 * t);
        } else if (kind === "wurli") {
          w = Math.tanh(w * 1.85) + 0.06 * Math.sin(2 * Math.PI * f * 4.01 * t);
        } else if (kind === "clavinet") {
          w = Math.tanh(w * 2.2);
        } else if (kind === "organ_rock") {
          w =
            0.24 * Math.sin(2 * Math.PI * f * t) +
            0.26 * Math.sin(2 * Math.PI * f * 2 * t) +
            0.22 * Math.sin(2 * Math.PI * f * 3 * t) +
            0.16 * Math.sin(2 * Math.PI * f * 4 * t);
        }
        const env = kind === "clavinet" ? envBase * Math.exp(-t * 4.2) : envBase;
        d[i] = env * w * 0.5;
      }
      return normalizePeakMono(buf);
    }

    if (kind === "cello") {
      const dur = 0.58;
      const len = Math.max(500, Math.floor(sr * dur));
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      const atk = 0.09;
      for (let i = 0; i < len; i += 1) {
        const t = i / sr;
        const bow = Math.min(1, t / atk);
        const vib = 0.022 * Math.sin(2 * Math.PI * 5.2 * t);
        const env = bow * Math.exp(-t * 3.4) * (0.92 + 0.08 * Math.exp(-t * 18));
        const fmod = f * (1 + vib);
        const w =
          0.52 * Math.sin(2 * Math.PI * fmod * t) +
          0.28 * Math.sin(2 * Math.PI * (fmod * 0.5) * t + 0.2) +
          0.14 * Math.sin(2 * Math.PI * fmod * 2 * t) +
          0.04 * Math.sin(2 * Math.PI * fmod * 3 * t);
        const scratch = (Math.random() * 2 - 1) * 0.012 * bow * Math.exp(-t * 40);
        d[i] = env * w * 0.48 + scratch;
      }
      return normalizePeakMono(buf);
    }

    if (kind === "acoustic_bass") {
      const dur = 0.72;
      const len = Math.max(640, Math.floor(sr * dur));
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      const sub = f * 0.5;
      for (let i = 0; i < len; i += 1) {
        const t = i / sr;
        const env = Math.exp(-t * 4.1) * (1 - Math.exp(-t * 45));
        const w =
          0.44 * Math.sin(2 * Math.PI * sub * t) +
          0.34 * Math.sin(2 * Math.PI * f * t) +
          0.14 * Math.sin(2 * Math.PI * f * 2 * t);
        d[i] = env * w * 0.56;
      }
      return normalizePeakMono(buf);
    }

    if (
      kind === "fender_guitar" ||
      kind === "acoustic_guitar" ||
      kind === "guitar_distorted" ||
      kind === "guitar_jazz_clean" ||
      kind === "guitar_crunch" ||
      kind === "guitar_lead"
    ) {
      const dur = 0.62;
      const len = Math.max(540, Math.floor(sr * dur));
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        const t = i / sr;
        const env = Math.exp(-t * 6.2) * (1 - Math.exp(-t * 140));
        const pick = (Math.random() * 2 - 1) * 0.02 * Math.exp(-t * 80);
        const bright =
          kind === "acoustic_guitar" || kind === "guitar_jazz_clean"
            ? 0.78
            : kind === "guitar_lead"
              ? 1.15
              : 1.0;
        let w =
          0.5 * Math.sin(2 * Math.PI * f * t) +
          0.24 * Math.sin(2 * Math.PI * f * 2 * t) * bright +
          0.14 * Math.sin(2 * Math.PI * f * 3 * t) * bright;
        if (kind === "guitar_distorted") w = Math.tanh(w * 2.4);
        else if (kind === "guitar_crunch") w = Math.tanh(w * 1.75);
        else if (kind === "guitar_lead") w = Math.tanh(w * 1.55) + 0.09 * Math.sin(2 * Math.PI * f * 4.02 * t);
        else if (kind === "guitar_jazz_clean") w *= 0.9;
        d[i] = env * w * 0.54 + pick;
      }
      return normalizePeakMono(buf);
    }

    if (kind === "jazz_bass" || kind === "bass_finger_round" || kind === "bass_pick_bright") {
      const dur = 0.68;
      const len = Math.max(640, Math.floor(sr * dur));
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      const sub = f * 0.5;
      for (let i = 0; i < len; i += 1) {
        const t = i / sr;
        const env = Math.exp(-t * (kind === "bass_pick_bright" ? 5.2 : 4.2)) * (1 - Math.exp(-t * 55));
        let w =
          0.38 * Math.sin(2 * Math.PI * sub * t) +
          0.4 * Math.sin(2 * Math.PI * f * t) +
          0.12 * Math.sin(2 * Math.PI * f * 2 * t);
        if (kind === "bass_finger_round") {
          w = 0.5 * Math.sin(2 * Math.PI * sub * t) + 0.34 * Math.sin(2 * Math.PI * f * t);
        } else if (kind === "bass_pick_bright") {
          w += 0.1 * Math.sin(2 * Math.PI * f * 3.01 * t);
        }
        d[i] = env * w * 0.58;
      }
      return normalizePeakMono(buf);
    }

    if (kind === "piano_bright") {
      const dur = 0.43;
      const len = Math.max(340, Math.floor(sr * dur));
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        const t = i / sr;
        const env = Math.exp(-t * 10.8) * (1 - Math.exp(-t * 230));
        const w =
          0.5 * Math.sin(2 * Math.PI * f * t) +
          0.27 * Math.sin(2 * Math.PI * f * 2.01 * t) +
          0.14 * Math.sin(2 * Math.PI * f * 4.02 * t + 0.2) +
          0.08 * Math.sin(2 * Math.PI * f * 6.0 * t);
        d[i] = env * w * 0.5;
      }
      return normalizePeakMono(buf);
    }

    if (kind === "clarinet") {
      const dur = 0.55;
      const len = Math.max(480, Math.floor(sr * dur));
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        const t = i / sr;
        const env = Math.exp(-t * 5.2) * (1 - Math.exp(-t * 120));
        const vib = 0.018 * Math.sin(2 * Math.PI * 5.5 * t);
        const fm = f * (1 + vib);
        const w =
          0.48 * Math.sin(2 * Math.PI * fm * t) +
          0.22 * Math.sin(2 * Math.PI * fm * 3 * t) +
          0.08 * Math.sin(2 * Math.PI * fm * 5 * t);
        d[i] = env * w * 0.5;
      }
      return normalizePeakMono(buf);
    }

    if (kind === "native_flute") {
      const dur = 0.52;
      const len = Math.max(460, Math.floor(sr * dur));
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        const t = i / sr;
        const env = Math.exp(-t * 4.8) * (1 - Math.exp(-t * 90));
        const breath = (Math.random() * 2 - 1) * 0.018 * Math.exp(-t * 35);
        const w =
          0.42 * Math.sin(2 * Math.PI * f * t) +
          0.28 * Math.sin(2 * Math.PI * f * 2 * t) +
          0.12 * Math.sin(2 * Math.PI * f * 3 * t);
        d[i] = env * w * 0.46 + breath;
      }
      return normalizePeakMono(buf);
    }

    /* piano (defeito): ataque rápido, corpo harmónico */
    const dur = 0.4;
    const len = Math.max(320, Math.floor(sr * dur));
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      const t = i / sr;
      const env = Math.exp(-t * 11.5) * (1 - Math.exp(-t * 220));
      const w =
        0.55 * Math.sin(2 * Math.PI * f * t) +
        0.24 * Math.sin(2 * Math.PI * f * 2.01 * t) +
        0.12 * Math.sin(2 * Math.PI * f * 3.98 * t + 0.3) +
        0.06 * Math.sin(2 * Math.PI * f * 5.01 * t) +
        0.03 * Math.sin(2 * Math.PI * f * 6.97 * t);
      d[i] = env * w * 0.46;
    }
    return normalizePeakMono(buf);
  }

  function getDefinition(id) {
    return BANK[id] || BANK.piano;
  }

  function nearestAnchorMidi(kind, midi) {
    const def = getDefinition(kind);
    const anchors = Array.isArray(def.anchors) && def.anchors.length ? def.anchors : PARIS_REMOTE.anchors.map((a) => a.midi);
    let best = anchors[0];
    let bestD = Infinity;
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      const d = Math.abs(midi - a);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  /**
   * Devolve a URL remota da amostra mais próxima para o instrumento pedido.
   * Primeira tentativa: repo tonejs-instruments (cobre 10 instrumentos do banco).
   * Último recurso: piano-de-paris (1 oitava) como fallback genérico.
   *
   * @param {string} kind — piano | rhodes | cello | acoustic_bass | jazz_bass
   *   | fender_guitar | guitar_distorted | acoustic_guitar | clarinet | native_flute
   * @param {number} midi
   * @returns {{ url: string, anchorMidi: number } | null}
   */
  function getRemoteSamplePlan(kind, midi) {
    if (!remoteSamplesEnabled) return null;
    if (typeof midi !== "number" || Number.isNaN(midi)) return null;

    const source = TONEJS_SOURCE_DIR[kind];
    if (source) {
      const def = getDefinition(kind);
      const anchors = Array.isArray(def.anchors) && def.anchors.length ? def.anchors : null;
      let anchorMidi = midi;
      if (anchors) {
        let bestD = Infinity;
        for (let i = 0; i < anchors.length; i += 1) {
          const d = Math.abs(midi - anchors[i]);
          if (d < bestD) {
            bestD = d;
            anchorMidi = anchors[i];
          }
        }
      }
      return { url: `${TONEJS_BASE}/${source}/${midiToToneJsFile(anchorMidi)}`, anchorMidi };
    }

    const anchors = PARIS_REMOTE.anchors;
    let best = anchors[0];
    let bestD = Infinity;
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      const d = Math.abs(midi - a.midi);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return { url: PARIS_REMOTE.base + best.file, anchorMidi: best.midi };
  }

  function applyInstrumentToSampler(sampler, instrumentId, options) {
    if (!sampler) return;
    const def = getDefinition(instrumentId);
    const override = options && options.patternOverride;
    const urlTemplate = (override && override.trim()) || def.pattern;
    if (typeof sampler.setFallbackKind === "function") {
      sampler.setFallbackKind(def.fallbackKind);
    }
    if (typeof sampler.applySourceConfig === "function") {
      sampler.applySourceConfig({
        fallbackKind: def.fallbackKind,
        urlTemplate,
      });
      return;
    }
    sampler.setUrlTemplate(urlTemplate);
    if (typeof sampler.setSingleFileUrl === "function" && options && Object.prototype.hasOwnProperty.call(options, "singleFileUrl")) {
      const s = typeof options.singleFileUrl === "string" ? options.singleFileUrl.trim() : "";
      sampler.setSingleFileUrl(s);
    }
  }

  global.HLSoundBank = {
    BANK,
    PARIS_REMOTE,
    getDefinition,
    nearestAnchorMidi,
    getRemoteSamplePlan,
    applyInstrumentToSampler,
    fallbackBuffer,
    get remoteSamplesEnabled() {
      return remoteSamplesEnabled;
    },
    set remoteSamplesEnabled(v) {
      remoteSamplesEnabled = !!v;
    },
    listInstruments() {
      return Object.entries(BANK).map(([id, v]) => ({ id, label: v.label }));
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
