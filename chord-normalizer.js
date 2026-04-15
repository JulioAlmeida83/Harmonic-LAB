/**
 * Normalização de acordes por instrumento.
 *
 * Objetivo
 *   Garantir que o MESMO acorde (ex.: Cmaj7) soa "igual" — mesma qualidade,
 *   mesmos intervalos, balanço de volume compatível — independentemente da
 *   fonte sonora seleccionada (piano, fagote, xilofone, contrabaixo…).
 *
 * Os problemas que resolve:
 *   1) Registros incompatíveis — tocar Cmaj7 em oitava 4 num fagote obriga o
 *      sampler a pitch-shiftar amostras de C3 para cima (ou nem tocar nada),
 *      resultando em timbre distorcido ou silêncio.
 *   2) Balanço de volume — cada pack tem uma amplitude de gravação diferente
 *      (trompete é gravado "hot", xilofone "frio"). Sem calibração, o mesmo
 *      peakGain produz loudness percebida muito diferente.
 *   3) Estilo de articulação — num xilofone, pedir "sustain" não tem sentido:
 *      a amostra é percussiva por natureza. Força-se "pluck" para evitar que
 *      o envelope abra a nota em fade-in quando ela já decaiu.
 *
 * Pipeline aplicado a cada acorde
 *   (A) octave-shift em bloco: move TODO o acorde por múltiplos de 12 semitons
 *       até que a mediana caia dentro do sweet-spot do instrumento (preserva
 *       intervalos, posição de raiz e quaisquer inversões).
 *   (B) hard-clamp por nota: se alguma nota continuar fora do range absoluto
 *       do instrumento, ajusta-a por múltiplos de oitava (último recurso —
 *       raríssimo depois de (A), mas necessário em intervalos muito abertos
 *       como Cmaj7 extrapolado num contrabaixo).
 *   (C) dedupe: remove colisões criadas pelo clamp, preservando a ordem.
 *   (D) gain-scale + styleOverride: devolvidos para o caller aplicar ao
 *       `peakGain` e ao estilo da nota antes de agendar no AudioContext.
 *
 * Uso típico no loop de harmonia:
 *
 *   const bankId  = document.getElementById("bankInstrument").value;
 *   const n       = HLChordNormalizer.normalizeChord(harmMidis, bankId);
 *   const chord   = n.midis;
 *   const peakEff = peak * n.gainScale;
 *   const style   = (n.styleOverride && want === "sustain") ? n.styleOverride : want;
 *
 * Auditoria (dev tool): `HLChordNormalizer.auditAll([60,64,67,71])` devolve
 * um relatório com, por instrumento, shift aplicado, notas normalizadas,
 * distância ao anchor mais próximo e flag de `inRange`.
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Perfis por instrumento.
  //
  //   range: [lo, hi]   — range absoluto (MIDI) em que o pack consegue produzir
  //                        som razoável (amostras + pitch-shift tolerável).
  //   sweet: [lo, hi]   — "ponto doce" onde o timbre fica autêntico; o chord
  //                        normalizer tenta manter a mediana do acorde aqui.
  //   gain:  number     — multiplicador aplicado ao peakGain final para
  //                        equilibrar loudness entre packs.
  //   character:        — "natural" (default) ou "percussive" (força pluck
  //                        quando o padrão pede sustain).
  //
  // Os valores foram calibrados empiricamente tendo como referência o piano
  // (gain 1.00, sweet C3–C6). Instrumentos mais "hot" baixam gain; mais
  // "frios" sobem ligeiramente. Ranges seguem os limites práticos do pack
  // tonejs-instruments.
  // ---------------------------------------------------------------------------
  const INSTRUMENT_PROFILES = {
    internal:         { range: [24, 96],  sweet: [48, 72], gain: 1.00, character: "natural" },
    piano:            { range: [21, 108], sweet: [48, 84], gain: 1.00, character: "natural" },
    rhodes:           { range: [28, 96],  sweet: [48, 84], gain: 0.98, character: "natural" },
    cello:            { range: [36, 76],  sweet: [40, 64], gain: 1.05, character: "natural" },
    // "percussive": força envelope "pluck" (ataque rápido, cauda curta) sobre
    // a sample — o pack tonejs-instruments/contrabass é gravado com arco, e o
    // envelope pluck corta o sustain para imitar pizz. Não é um pizz real,
    // mas fica muito mais próximo de walking bass jazz do que o arco bruto.
    acoustic_bass:    { range: [28, 55],  sweet: [28, 43], gain: 1.10, character: "percussive" },
    // Pack dsmolken já é pizzicato nativo — sample character "natural" mantém
    // o envelope da gravação (ataque + decay autênticos do contrabaixo jazz).
    jazz_upright_bass:{ range: [24, 60],  sweet: [28, 52], gain: 1.08, character: "natural" },
    jazz_bass:        { range: [28, 60],  sweet: [28, 48], gain: 1.08, character: "natural" },
    fender_guitar:    { range: [40, 84],  sweet: [48, 72], gain: 1.02, character: "natural" },
    guitar_distorted: { range: [40, 84],  sweet: [43, 67], gain: 0.88, character: "natural" },
    acoustic_guitar:  { range: [40, 79],  sweet: [48, 67], gain: 1.02, character: "natural" },
    clarinet:         { range: [50, 86],  sweet: [55, 79], gain: 1.00, character: "natural" },
    native_flute:     { range: [60, 100], sweet: [65, 88], gain: 0.95, character: "natural" },
    harmonium:        { range: [36, 96],  sweet: [48, 76], gain: 0.95, character: "natural" },
    harp:             { range: [24, 96],  sweet: [48, 79], gain: 1.02, character: "natural" },
    guitar_nylon:     { range: [40, 79],  sweet: [48, 70], gain: 1.05, character: "natural" },
    violin:           { range: [55, 100], sweet: [60, 84], gain: 0.98, character: "natural" },
    saxophone:        { range: [48, 84],  sweet: [55, 75], gain: 0.95, character: "natural" },
    trumpet:          { range: [52, 88],  sweet: [60, 79], gain: 0.90, character: "natural" },
    trombone:         { range: [36, 72],  sweet: [41, 60], gain: 0.95, character: "natural" },
    french_horn:      { range: [36, 77],  sweet: [43, 67], gain: 1.00, character: "natural" },
    bassoon:          { range: [34, 65],  sweet: [41, 55], gain: 1.05, character: "natural" },
    xylophone:        { range: [60, 96],  sweet: [67, 84], gain: 0.90, character: "percussive" },
  };

  const DEFAULT_PROFILE = {
    range: [24, 96],
    sweet: [48, 72],
    gain: 1.0,
    character: "natural",
  };

  function getProfile(bankId) {
    return INSTRUMENT_PROFILES[bankId] || DEFAULT_PROFILE;
  }

  // ---------------------------------------------------------------------------
  // Helpers internos
  // ---------------------------------------------------------------------------
  function chordMedian(midis) {
    if (!midis.length) return 60;
    const s = [...midis].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  /**
   * (A) Desloca TODO o acorde por múltiplos de oitava para aproximar a mediana
   * do centro do sweet-spot. Preserva a identidade intervalar do acorde.
   * Devolve shift em semitonos (sempre múltiplo de 12).
   */
  function octaveShiftIntoSweet(midis, sweet) {
    if (!midis.length) return { midis: [], shift: 0 };
    const median = chordMedian(midis);
    const target = (sweet[0] + sweet[1]) / 2;
    // `|| 0` normaliza -0 para 0 quando o arredondamento cai em -0, evitando
    // surpresas em logs/auditoria (ex.: "shift: -0").
    let shift = 12 * Math.round((target - median) / 12) || 0;
    // Caso raro: sweet-spot estreito (<12) e a mediana fica fora — tenta ±12.
    let iterations = 0;
    while (median + shift > sweet[1] && iterations < 12) {
      shift -= 12;
      iterations += 1;
    }
    iterations = 0;
    while (median + shift < sweet[0] && iterations < 12) {
      shift += 12;
      iterations += 1;
    }
    return { midis: midis.map((m) => m + shift), shift };
  }

  /**
   * (B) Clamp por oitavas para uma única nota. Usado como último recurso
   * quando uma nota específica do acorde já deslocado cai fora do range.
   */
  function clampByOctave(midi, range) {
    let v = midi;
    let iterations = 0;
    while (v > range[1] && iterations < 12) {
      v -= 12;
      iterations += 1;
    }
    iterations = 0;
    while (v < range[0] && iterations < 12) {
      v += 12;
      iterations += 1;
    }
    // Se o range for degenerado, devolve o extremo mais próximo em vez de
    // entrar em loop infinito ou devolver um valor impossível.
    if (v > range[1]) v = range[1];
    if (v < range[0]) v = range[0];
    return v;
  }

  /** (C) Remove duplicados preservando a ordem de primeira aparição. */
  function dedupeKeepOrder(midis) {
    const seen = new Set();
    const out = [];
    for (const m of midis) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Normaliza um acorde (conjunto de MIDIs) para um instrumento específico.
   *
   * @param {number[]} midis  — notas MIDI (ordem qualquer; preserva-se ordem na saída)
   * @param {string}   bankId — id do instrumento (chave de INSTRUMENT_PROFILES)
   * @param {object}   [opts]
   * @returns {{midis:number[], shift:number, gainScale:number, styleOverride:(string|undefined), profile:object}}
   */
  function normalizeChord(midis, bankId, opts = {}) {
    const p = getProfile(bankId);
    if (!Array.isArray(midis) || midis.length === 0) {
      return { midis: [], shift: 0, gainScale: p.gain, styleOverride: undefined, profile: p };
    }
    // (A)
    const { midis: shifted, shift } = octaveShiftIntoSweet(midis, p.sweet);
    // (B)
    const clamped = shifted.map((m) => (m < p.range[0] || m > p.range[1] ? clampByOctave(m, p.range) : m));
    // (C)
    const result = dedupeKeepOrder(clamped);
    // (D)
    const styleOverride = p.character === "percussive" ? "pluck" : undefined;
    return { midis: result, shift, gainScale: p.gain, styleOverride, profile: p };
  }

  /**
   * Normaliza uma única nota (linha de baixo, drone, nota-alvo).
   * Desloca por oitavas até ficar no range; centra-se no sweet-spot se
   * houver folga. Devolve também gainScale e styleOverride do instrumento.
   */
  function normalizeSingleNote(midi, bankId) {
    const p = getProfile(bankId);
    // Primeiro tenta centrar a nota no sweet-spot por oitavas.
    let v = midi;
    const targetCenter = (p.sweet[0] + p.sweet[1]) / 2;
    const octShift = 12 * Math.round((targetCenter - v) / 12);
    v += octShift;
    // Se escapou ao sweet, tenta voltar a cair dentro do range com clamp.
    v = clampByOctave(v, p.range);
    return {
      midi: v,
      shift: v - midi,
      gainScale: p.gain,
      styleOverride: p.character === "percussive" ? "pluck" : undefined,
      profile: p,
    };
  }

  // ---------------------------------------------------------------------------
  // Diagnóstico / auditoria
  // ---------------------------------------------------------------------------

  function nearestAnchor(midi, anchors) {
    if (!anchors || !anchors.length) return { anchor: null, distance: null };
    let best = { anchor: anchors[0], distance: Math.abs(midi - anchors[0]) };
    for (const a of anchors) {
      const d = Math.abs(midi - a);
      if (d < best.distance) best = { anchor: a, distance: d };
    }
    return best;
  }

  /**
   * Auditoria por instrumento: devolve relatório com shift aplicado, notas
   * resultantes, distância em semitons ao anchor gravado mais próximo e se
   * cada nota ficou dentro do range.
   *
   * `anchors` é a lista de MIDIs disponíveis em samples/bank/<id>/{midi}.wav.
   * Distâncias grandes (>4) indicam pitch-shift audível — sinal de que o pack
   * precisa de amostras adicionais para esse registo.
   */
  function auditChord(midis, bankId, anchors = []) {
    const p = getProfile(bankId);
    const norm = normalizeChord(midis, bankId);
    const perNote = norm.midis.map((m) => {
      const a = nearestAnchor(m, anchors);
      return {
        midi: m,
        nearestAnchor: a.anchor,
        distance: a.distance,
        inRange: m >= p.range[0] && m <= p.range[1],
      };
    });
    const distances = perNote.map((n) => n.distance).filter((d) => d != null);
    return {
      bankId,
      input: [...midis],
      normalized: [...norm.midis],
      shift: norm.shift,
      gainScale: norm.gainScale,
      styleOverride: norm.styleOverride,
      maxAnchorDistance: distances.length ? Math.max(...distances) : null,
      avgAnchorDistance: distances.length
        ? Number((distances.reduce((a, b) => a + b, 0) / distances.length).toFixed(2))
        : null,
      inRange: perNote.every((n) => n.inRange),
      perNote,
    };
  }

  /** Corre `auditChord` contra todos os instrumentos disponíveis. */
  function auditAll(midis, bankOverride) {
    const B = bankOverride || (global.HLSoundBank && global.HLSoundBank.BANK) || {};
    const out = {};
    for (const id of Object.keys(B)) {
      const anchors = (B[id] && B[id].anchors) || [];
      out[id] = auditChord(midis, id, anchors);
    }
    return out;
  }

  /**
   * Resumo legível para consola (dev). Marca com ⚠ instrumentos cujo
   * acorde sai do range ou cuja distância ao anchor exceda `warnDistance`.
   */
  function auditSummary(midis, warnDistance = 4) {
    const all = auditAll(midis);
    const rows = [];
    for (const id of Object.keys(all)) {
      const a = all[id];
      const warn = !a.inRange || (a.maxAnchorDistance != null && a.maxAnchorDistance > warnDistance);
      rows.push({
        instrument: id,
        shift: a.shift,
        normalized: a.normalized.join(","),
        gain: a.gainScale,
        maxAnchorDist: a.maxAnchorDistance,
        inRange: a.inRange,
        flag: warn ? "⚠" : "ok",
      });
    }
    return rows;
  }

  // ---------------------------------------------------------------------------
  // Export dual-mode (Node CJS para testes + global browser)
  // ---------------------------------------------------------------------------
  const api = {
    INSTRUMENT_PROFILES,
    DEFAULT_PROFILE,
    getProfile,
    normalizeChord,
    normalizeSingleNote,
    auditChord,
    auditAll,
    auditSummary,
    // Expostos para testes unitários.
    _internals: { octaveShiftIntoSweet, clampByOctave, dedupeKeepOrder, chordMedian, nearestAnchor },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.HLChordNormalizer = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
