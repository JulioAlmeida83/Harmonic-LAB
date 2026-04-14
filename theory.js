/**
 * Harmonic Lab — núcleo teórico puro (sem DOM, sem Web Audio).
 *
 * Este ficheiro é carregado como script clássico pelo `index.html` ANTES de
 * `app.js`; todas as constantes e funções ficam disponíveis como globais em
 * `window` (comportamento legado do projeto).
 *
 * Em Node (testes) é carregado via `require("./theory.js")` e expõe os
 * mesmos símbolos através de `module.exports`. Manter este módulo PURO
 * (sem acesso a DOM / AudioContext / localStorage) é o que permite testar
 * a teoria no CI sem browser.
 */

// --- Pitch & nomes -----------------------------------------------------------

const PC_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PC_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const NOTE_MAP = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const TONIC_OPTIONS = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
];

function pcToName(pc, preferFlats) {
  const n = ((pc % 12) + 12) % 12;
  return preferFlats ? PC_NAMES_FLAT[n] : PC_NAMES_SHARP[n];
}

function parseTonic(name) {
  const pc = NOTE_MAP[name];
  if (pc === undefined) throw new Error(`Tônica inválida: ${name}`);
  return pc;
}

// --- Escalas (intervalos em semitons a partir da tônica; graus 1..N por oitava) ---------

const SCALE_TYPES = {
  major: { label: "Jônio (maior)", intervals: [0, 2, 4, 5, 7, 9, 11] },
  dorian: { label: "Dórico", intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { label: "Frígio", intervals: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { label: "Lídio", intervals: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { label: "Mixolídio", intervals: [0, 2, 4, 5, 7, 9, 10] },
  natural_minor: { label: "Eólio (menor natural)", intervals: [0, 2, 3, 5, 7, 8, 10] },
  locrian: { label: "Lócrio", intervals: [0, 1, 3, 5, 6, 8, 10] },
  harmonic_minor: { label: "Menor harmônica", intervals: [0, 2, 3, 5, 7, 8, 11] },
  melodic_minor_asc: { label: "Menor melódica (subindo)", intervals: [0, 2, 3, 5, 7, 9, 11] },
  melodic_minor_desc: { label: "Menor melódica (descendo)", intervals: [0, 2, 3, 5, 7, 8, 10] },
  pent_major: { label: "Pentatônica maior", intervals: [0, 2, 4, 7, 9] },
  pent_minor: { label: "Pentatônica menor", intervals: [0, 3, 5, 7, 10] },
  blues: { label: "Blues menor (hex)", intervals: [0, 3, 5, 6, 7, 10] },
  blues_major: { label: "Blues maior (hex)", intervals: [0, 2, 3, 4, 7, 9] },
  whole_tone: { label: "Tom inteiro (hex)", intervals: [0, 2, 4, 6, 8, 10] },
  diminished_wh: { label: "Diminuta W–H (8 notas)", intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
};

/** Ordem e agrupamento do `<select id="scaleType">`. */
const SCALE_SELECT_GROUPS = [
  {
    label: "Modos gregos e menores características",
    keys: [
      "major",
      "dorian",
      "phrygian",
      "lydian",
      "mixolydian",
      "natural_minor",
      "locrian",
      "harmonic_minor",
      "melodic_minor_asc",
      "melodic_minor_desc",
    ],
  },
  { label: "Pentatônicas e blues", keys: ["pent_major", "pent_minor", "blues", "blues_major"] },
  { label: "Escalas simétricas", keys: ["whole_tone", "diminished_wh"] },
];

const ROMAN_BASE = ["I", "II", "III", "IV", "V", "VI", "VII"];

/** Linha de graus + slots: várias oitavas da escala (N graus por oitava). */
const MAX_DEGREE_LABEL = 22;

const UNICODE_PRIME = "\u2032"; // ′ (oitava diatónica acima)

/** Terça e quinta diatônicas acima de um grau (índice 0–6), com oitava quando necessário. */
function diatonicTriadSemitonesFromRoot(ivals, deg0) {
  const r = ivals[deg0];
  let t = ivals[(deg0 + 2) % 7];
  if (deg0 + 2 >= 7) t += 12;
  else if (t <= r) t += 12;

  let f = ivals[(deg0 + 4) % 7];
  if (deg0 + 4 >= 7) f += 12;
  else if (f <= r) f += 12;
  else if (f <= t) f += 12;

  const third = (t - r + 12) % 12;
  const fifth = (f - r + 12) % 12;
  return { third, fifth, r, t, f };
}

function triadQuality(third, fifth) {
  const t = third;
  const ft = fifth;
  if (t === 3 && ft === 7) return "minor";
  if (t === 4 && ft === 7) return "major";
  if (t === 3 && ft === 6) return "diminished";
  if (t === 4 && ft === 8) return "augmented";
  return "other";
}

/** Romano diatônico para tríade (só escalas com 7 graus por oitava). */
function romanForDegree(ivals, deg1to7) {
  const n = ivals.length;
  const d0 = deg1to7 - 1;
  if (n !== 7 || d0 < 0 || d0 > 6) {
    return { roman: String(deg1to7), quality: "other", third: 0, fifth: 0 };
  }
  const { third, fifth } = diatonicTriadSemitonesFromRoot(ivals, d0);
  const q = triadQuality(third, fifth);
  let g = ROMAN_BASE[d0];
  if (q === "minor") g = g.toLowerCase();
  else if (q === "diminished") g = g.toLowerCase() + "°";
  else if (q === "augmented") g = g.toUpperCase() + "+";
  else if (q === "other") g = g + "?";
  return { roman: g, quality: q, third, fifth };
}

/** Qualidade da tríade estritamente diatónica (M / m na UI). */
function triadQualityPt(q) {
  switch (q) {
    case "major":
      return "M";
    case "minor":
      return "m";
    case "diminished":
      return "dim";
    case "augmented":
      return "aug";
    case "other":
      return "?";
    default:
      return String(q);
  }
}

/**
 * Romano (I–VII) com 7 notas por oitava; com outro N usa grau 1..N e ′ por oitava extra.
 */
function romanForExtendedDegree(ivals, deg) {
  if (!Number.isFinite(deg) || deg < 1 || deg > MAX_DEGREE_LABEL) return { roman: "—", quality: "other" };
  const n = ivals.length;
  if (n < 1) return { roman: "—", quality: "other" };
  const inner = ((deg - 1) % n) + 1;
  const oct = Math.floor((deg - 1) / n);
  if (n === 7) {
    const base = romanForDegree(ivals, inner);
    if (oct === 0) return base;
    const maxPrimes = 4;
    const suffix = oct <= maxPrimes ? UNICODE_PRIME.repeat(oct) : ` (+${oct}×8)`;
    return { roman: `${base.roman}${suffix}`, quality: base.quality, baseRoman: base.roman, octaveUp: oct };
  }
  const baseRoman = String(inner);
  if (oct === 0) return { roman: baseRoman, quality: "other" };
  const maxPrimes = 4;
  const suffix = oct <= maxPrimes ? UNICODE_PRIME.repeat(oct) : ` (+${oct}×8)`;
  return { roman: `${baseRoman}${suffix}`, quality: "other", baseRoman, octaveUp: oct };
}

function intervalNameFromTonic(semitones) {
  const map = new Map([
    [0, "1 P"],
    [1, "2 m"],
    [2, "2 M"],
    [3, "3 m"],
    [4, "3 M"],
    [5, "4 P"],
    [6, "5 dim / T"],
    [7, "5 P"],
    [8, "6 m"],
    [9, "6 M"],
    [10, "7 m"],
    [11, "7 M"],
    [12, "8 P"],
    [13, "9 m"],
    [14, "9 M"],
    [15, "10 m"],
    [16, "10 M"],
    [17, "11 P"],
    [18, "12 dim"],
    [19, "12 P"],
    [20, "13 m"],
    [21, "13 M"],
    [22, "14 m"],
    [23, "14 M"],
    [24, "15 P"],
  ]);
  // simplificar: mostrar composto por oitavas + simples
  const oct = Math.floor(semitones / 12);
  const simple = ((semitones % 12) + 12) % 12;
  const base = map.get(simple) ?? `${simple} st`;
  if (oct === 0) return base;
  return `${base} (+${oct}×8)`;
}

function degreeToSemitonesFromTonic(ivals, degHept) {
  const n = ivals.length;
  if (n < 1) return 0;
  const d0 = ((degHept - 1) % n + n) % n;
  const oct = Math.floor((degHept - 1) / n);
  return ivals[d0] + 12 * oct;
}

/** Classe de altura (0–11) do grau na escala atual em relação à tônica. */
function pitchClassForDegree(degHept, ivals, tonicPc) {
  const semi = degreeToSemitonesFromTonic(ivals, degHept);
  return (tonicPc + semi + 120) % 12;
}

/** Rótulo conjunto grau + romano + nome de nota (mesma lógica em slots e no select). */
function formatSlotDegreeLabel(degHept, ivals, tonicPc, preferFl) {
  const r = romanForExtendedDegree(ivals, degHept).roman;
  const n = pcToName(pitchClassForDegree(degHept, ivals, tonicPc), preferFl);
  return `${degHept}: ${r} — ${n}`;
}

/** C4 = 60 → midi = 12 * (baseOctave + 1) + tonicPc */
function midiTonic(tonicPc, baseOctave) {
  return tonicPc + 12 * (baseOctave + 1);
}

function midiForScaleDegree(tonicPc, ivals, degHept, baseOctave) {
  return midiTonic(tonicPc, baseOctave) + degreeToSemitonesFromTonic(ivals, degHept);
}

/**
 * Clamp duro de uma nota MIDI para o intervalo válido [0, 127].
 * Use quando queremos garantir que o oscilador/sampler recebe um valor seguro,
 * mesmo que isto custe uma mudança audível (acontece só em extremos).
 */
function clampMidi(m) {
  const v = Math.round(Number(m));
  if (!Number.isFinite(v)) return 60;
  if (v < 0) return 0;
  if (v > 127) return 127;
  return v;
}

/**
 * Envolve uma nota MIDI para o intervalo válido transportando por oitavas.
 * Preserva a classe de altura (mesma nota noutra oitava). Preferível ao clamp
 * duro para linhas de baixo e arpejos, onde manter a «cor» harmônica importa
 * mais do que a tessitura exata.
 */
function wrapMidiToRange(m, lo = 12, hi = 120) {
  let v = Math.round(Number(m));
  if (!Number.isFinite(v)) return 60;
  while (v < lo) v += 12;
  while (v > hi) v -= 12;
  // se o alvo for impossível (lo > hi) caímos num clamp de segurança
  if (v < 0) v = 0;
  if (v > 127) v = 127;
  return v;
}

/** Oitava base dos slots (alinhada a `syncAudio` / amostras). */
function slotsPlaybackBaseOct() {
  return 4;
}

// --- Harmonia base (triades / V7 diatônico) ---------------------------------

/**
 * Intervalos de referência usados para construir o acorde da harmonia base
 * (e a linha de baixo que o acompanha). Sempre em Jônica (maior natural),
 * para que o graus I–VII / V7 produzam o acorde convencional mesmo quando
 * a escala *tocada* em cima é outra (ex: Lídia, pentatônica, blues…).
 * Assim mudar o «Tipo de escala» não altera o som da harmonia.
 */
const HARMONY_REF_IVALS = [0, 2, 4, 5, 7, 9, 11];
function harmonyRefIvals() {
  return HARMONY_REF_IVALS;
}

function harmonyMidis(tonicPc, ivals, harmonyId, baseOct) {
  if (harmonyId === "off") return [];
  if (/^deg[1-7]$/.test(harmonyId)) {
    const g = Number(harmonyId.slice(3));
    return [g, g + 2, g + 4].map((d) => midiForScaleDegree(tonicPc, ivals, d, baseOct));
  }
  if (harmonyId === "V7") {
    return [5, 7, 9, 11].map((d) => midiForScaleDegree(tonicPc, ivals, d, baseOct));
  }
  return [];
}

// --- Linha de baixo (derivada da harmonia de referência) -------------------

/**
 * Lista completa dos padrões de baixo disponíveis, na ordem apresentada ao
 * usuário. Expondo isto aqui permite testar parametrizadamente sem importar
 * o DOM ou o motor de áudio.
 */
const BASS_PATTERN_IDS = [
  "off",
  "fundamental",
  "root_fifth",
  "root_third",
  "root_seventh",
  "third_carpet",
  "quinta_carpet",
  "fifth_oct_ping",
  "octave_ping",
  "ostinato_1513",
  "ostinato_1535",
  "ostinato_1351",
  "bounce_151",
  "clave5",
  "chromatic_1012",
  "arp_low",
  "arp_desc_low",
  "shell_73",
  "pedal_tonic",
];

/**
 * Nota MIDI da linha de baixo para um passo `step` (0-based).
 *
 * Argumentos:
 *   - tonicPc   (0..11): tônica global.
 *   - ivals     (intervalos, geralmente `harmonyRefIvals()` = Jônio).
 *   - harmonyId : "off" | "deg1".."deg7" | "V7".
 *   - baseOct   : oitava da fundamental do acorde.
 *   - mode      : chave de `BASS_PATTERN_IDS`.
 *   - step      : índice do passo (contador inteiro de tempo).
 *   - offset    : transposição em semitonos aplicada ao baixo (-48..+24).
 *
 * Regras:
 *   - `off` e `harmonyId === "off"` devolvem `null`.
 *   - Para graus diatónicos em tríade (deg1..deg7), deriva a 7ª diatônica
 *     on-the-fly para permitir que padrões com 7ª (root_seventh, arp_low,
 *     shell_73) soem coerentes.
 *   - O resultado é sempre envolvido por `wrapMidiToRange` — em tessituras
 *     extremas transporta oitavas em vez de gerar MIDI fora de [0,127].
 */
function nextHarmonyBassMidi(tonicPc, ivals, harmonyId, baseOct, mode, step, offset = 0) {
  if (mode === "off" || harmonyId === "off") return null;

  if (mode === "pedal_tonic") {
    return wrapMidiToRange(midiForScaleDegree(tonicPc, ivals, 1, baseOct) + offset);
  }

  const harm = harmonyMidis(tonicPc, ivals, harmonyId, baseOct);
  if (!harm.length) return null;

  const root = harm[0];
  const third = harm.length > 1 ? harm[1] : root + 4;
  const fifth = harm.length > 2 ? harm[2] : root + 7;
  let seventh = harm.length > 3 ? harm[3] : null;
  if (seventh == null && /^deg[1-7]$/.test(harmonyId)) {
    const g = Number(harmonyId.slice(3));
    seventh = midiForScaleDegree(tonicPc, ivals, g + 6, baseOct);
  }

  const br = root + offset;
  const bt = third + offset;
  const bf = fifth + offset;
  const b7 = seventh != null ? seventh + offset : null;

  let out;
  switch (mode) {
    case "fundamental":
      out = br;
      break;
    case "root_fifth":
      out = step % 2 === 0 ? br : bf;
      break;
    case "root_third":
      out = step % 2 === 0 ? br : bt;
      break;
    case "root_seventh":
      // Com 7ª disponível (sempre, em deg1..deg7 e V7) alternamos 1–7.
      // Mantemos fallback para 5ª só em caso extremo (harmonia desconhecida).
      out = b7 != null ? (step % 2 === 0 ? br : b7) : step % 2 === 0 ? br : bf;
      break;
    case "third_carpet":
      out = bt;
      break;
    case "ostinato_1513":
      out = [br, bf, br, bt][step % 4];
      break;
    case "ostinato_1535":
      out = [br, bf, bt, bf][step % 4];
      break;
    case "ostinato_1351":
      out = [br, bt, bf, br][step % 4];
      break;
    case "bounce_151":
      out = [br, bf, br][step % 3];
      break;
    case "clave5":
      out = [br, bf, br, br, bf][step % 5];
      break;
    case "chromatic_1012":
      out = [br, br - 1, br, br + 2][step % 4];
      break;
    case "arp_low": {
      const seq = b7 != null ? [br, bt, bf, b7] : [br, bt, bf];
      out = seq[step % seq.length];
      break;
    }
    case "arp_desc_low": {
      const seq = b7 != null ? [b7, bf, bt, br] : [bf, bt, br];
      out = seq[step % seq.length];
      break;
    }
    case "shell_73":
      // Shell «7–3»: prefere alternar sétima e terça (sonoridade clássica de
      // walking bass). Em tríade (sem 7ª), degrada para «1–3», que é o que
      // sobra harmonicamente — evita silenciar o padrão.
      out = b7 != null ? (step % 2 === 0 ? b7 : bt) : step % 2 === 0 ? br : bt;
      break;
    case "octave_ping":
      out = step % 2 === 0 ? br : br - 12;
      break;
    case "quinta_carpet":
      out = bf;
      break;
    case "fifth_oct_ping":
      out = step % 2 === 0 ? bf : bf - 12;
      break;
    default:
      out = br;
  }
  return wrapMidiToRange(out);
}

// --- Compatibilidade escala × acorde (estrelas no #scaleType) ---------------

/**
 * Rating 0..3 de uma escala candidata sobre o acorde atual.
 *
 * **Convenção dos pitch-classes:**
 *   `chordPCArr` deve vir em pcs **relativos à tônica da escala** (0 = tônica
 *   da escala), NÃO relativos à fundamental do acorde. Assim comparamos
 *   directamente contra `scale.intervals` (também relativos à tônica).
 *   Quem chama deve converter antes. Exemplos:
 *     - `currentChordPCsArray()` em app.js já entrega assim.
 *     - `pickParentScaleForChord()` abaixo converte `chord.rootPc + i - tonicPc`.
 *
 * Regras:
 *   - Fundamental e 3ª são obrigatórias; se faltar qualquer uma → 0★
 *     (choque de qualidade, a escala nega o acorde).
 *   - 5ª e 7ª faltantes são penalidade leve (-1 cada); permite que
 *     pentatônicas e hexatônicas ainda pontuem bem quando cobrem 1–3–5.
 *   - Avoid note (semitom acima de uma nota do acorde, dentro da escala
 *     e fora do acorde): -1 por ocorrência.
 *   - Score final clamped em [0, 3].
 */
function rateScaleAgainstChord(scaleKey, chordPCArr) {
  if (!chordPCArr || !chordPCArr.length) return 0;
  const scale = SCALE_TYPES[scaleKey];
  if (!scale) return 0;
  const scalePCs = new Set(scale.intervals);
  const chordPCs = new Set(chordPCArr);

  const root = chordPCArr[0];
  const third = chordPCArr.length > 1 ? chordPCArr[1] : null;
  const fifth = chordPCArr.length > 2 ? chordPCArr[2] : null;
  const seventh = chordPCArr.length > 3 ? chordPCArr[3] : null;

  if (!scalePCs.has(root)) return 0;
  if (third != null && !scalePCs.has(third)) return 0;

  let score = 3;
  if (fifth != null && !scalePCs.has(fifth)) score -= 1;
  if (seventh != null && !scalePCs.has(seventh)) score -= 1;

  let avoid = 0;
  chordPCs.forEach((pc) => {
    const above = (pc + 1) % 12;
    if (scalePCs.has(above) && !chordPCs.has(above)) avoid += 1;
  });
  score -= avoid;

  return Math.max(0, Math.min(3, score));
}

/** Render compacto: "★★★", "★★☆", "★☆☆", "☆☆☆". */
function scaleStarsRender(n) {
  if (n == null || n < 0) return "";
  const r = Math.max(0, Math.min(3, n));
  return "★".repeat(r) + "☆".repeat(3 - r);
}

// --- Qualidades de acorde e parsers ----------------------------------------

/**
 * Dicionário de qualidades de acorde → intervalos em semitons a partir da
 * fundamental. As chaves cobrem grafias comuns (ASCII e unicode). A ordem das
 * entradas é irrelevante; o parser testa chaves candidatas.
 */
const CHORD_QUALITIES = {
  "": { intervals: [0, 4, 7], label: "" },
  maj: { intervals: [0, 4, 7], label: "" },
  M: { intervals: [0, 4, 7], label: "" },
  m: { intervals: [0, 3, 7], label: "m" },
  min: { intervals: [0, 3, 7], label: "m" },
  "-": { intervals: [0, 3, 7], label: "m" },
  dim: { intervals: [0, 3, 6], label: "dim" },
  "°": { intervals: [0, 3, 6], label: "°" },
  aug: { intervals: [0, 4, 8], label: "aug" },
  "+": { intervals: [0, 4, 8], label: "+" },
  sus2: { intervals: [0, 2, 7], label: "sus2" },
  sus4: { intervals: [0, 5, 7], label: "sus4" },
  sus: { intervals: [0, 5, 7], label: "sus4" },
  5: { intervals: [0, 7], label: "5" },
  6: { intervals: [0, 4, 7, 9], label: "6" },
  m6: { intervals: [0, 3, 7, 9], label: "m6" },
  7: { intervals: [0, 4, 7, 10], label: "7" },
  maj7: { intervals: [0, 4, 7, 11], label: "maj7" },
  M7: { intervals: [0, 4, 7, 11], label: "maj7" },
  Δ: { intervals: [0, 4, 7, 11], label: "maj7" },
  Δ7: { intervals: [0, 4, 7, 11], label: "maj7" },
  m7: { intervals: [0, 3, 7, 10], label: "m7" },
  "-7": { intervals: [0, 3, 7, 10], label: "m7" },
  mMaj7: { intervals: [0, 3, 7, 11], label: "mMaj7" },
  mM7: { intervals: [0, 3, 7, 11], label: "mMaj7" },
  m7b5: { intervals: [0, 3, 6, 10], label: "m7♭5" },
  "m7♭5": { intervals: [0, 3, 6, 10], label: "m7♭5" },
  ø: { intervals: [0, 3, 6, 10], label: "ø" },
  ø7: { intervals: [0, 3, 6, 10], label: "ø" },
  dim7: { intervals: [0, 3, 6, 9], label: "°7" },
  "°7": { intervals: [0, 3, 6, 9], label: "°7" },
  "7sus4": { intervals: [0, 5, 7, 10], label: "7sus4" },
  9: { intervals: [0, 4, 7, 10, 14], label: "9" },
  maj9: { intervals: [0, 4, 7, 11, 14], label: "maj9" },
  m9: { intervals: [0, 3, 7, 10, 14], label: "m9" },
};

/** Normaliza acidentes unicode (♯ ♭) → ASCII (# b). */
function normalizeAccidental(token) {
  if (!token) return "";
  return token.replace(/♯/g, "#").replace(/♭/g, "b");
}

/** Canonicaliza a string de qualidade para uma chave de `CHORD_QUALITIES`. */
function canonicalizeQualityToken(raw) {
  const t = (raw || "").trim();
  if (t in CHORD_QUALITIES) return t;
  const lc = t.toLowerCase();
  if (lc === "maj") return "maj";
  if (lc === "min" || lc === "-") return "m";
  if (lc === "dim") return "dim";
  if (lc === "aug") return "aug";
  if (lc === "sus2") return "sus2";
  if (lc === "sus4" || lc === "sus") return "sus4";
  return null;
}

/**
 * Parse de acorde absoluto: "Cmaj7" → { rootPc, intervals, quality, label }.
 * Suporta grafias: `C`, `Cm`, `C7`, `Cmaj7`, `Cm7`, `C#m7b5`, `Bbdim7`, `D♭Δ7`.
 */
function parseAbsoluteChord(str) {
  if (typeof str !== "string") throw new Error("parseAbsoluteChord: string esperada");
  const s = str.trim();
  const m = s.match(/^([A-G])([#b♭♯]?)(.*)$/);
  if (!m) throw new Error(`Acorde inválido: ${str}`);
  const [, letter, accRaw, tailRaw] = m;
  const acc = normalizeAccidental(accRaw);
  const rootKey = letter + acc;
  const rootPc = NOTE_MAP[rootKey];
  if (rootPc == null) throw new Error(`Nota inválida: ${rootKey}`);
  const qualRaw = tailRaw.trim();
  const qualKey = canonicalizeQualityToken(qualRaw);
  if (qualKey == null) throw new Error(`Qualidade desconhecida: "${qualRaw}" em "${str}"`);
  const q = CHORD_QUALITIES[qualKey];
  return {
    rootPc,
    intervals: q.intervals.slice(),
    quality: q.label,
    label: rootKey + q.label,
  };
}

const ROMAN_NUMERALS_MAP = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };

/**
 * Parse de grau romano para um acorde concreto.
 *   parseRomanChord("ii7", 0, "major") → { degree:2, rootPc:2, intervals:[0,3,7,10], ... }
 *
 * Regras de interpretação:
 *   - Maiúsculas (I, IV, V) → qualidade default **maior**.
 *   - Minúsculas (ii, iii, vi) → qualidade default **menor**.
 *   - Símbolo `°` → dim (ou dim7 se seguido de 7); `ø` → m7♭5.
 *   - Sufixo explícito (7, maj7, m7, sus4, etc.) vence o default.
 *   - Prefixo `b` ou `#` altera a raiz em ±1 semitom (ex.: `bVII`).
 */
function parseRomanChord(str, tonicPc = 0, scaleKey = "major") {
  if (typeof str !== "string") throw new Error("parseRomanChord: string esperada");
  const s = str.trim();
  const m = s.match(/^([b#♭♯]?)([ivIV]+)(°|ø)?(.*)$/);
  if (!m) throw new Error(`Romano inválido: ${str}`);
  const [, accRaw, romanRaw, diminutive, tailRaw] = m;
  const upper = romanRaw.toUpperCase();
  const degree = ROMAN_NUMERALS_MAP[upper];
  if (!degree) throw new Error(`Romano inválido: ${str}`);
  const isMinorRoman = romanRaw[0] === romanRaw[0].toLowerCase();
  const acc = normalizeAccidental(accRaw);
  const scale = SCALE_TYPES[scaleKey] || SCALE_TYPES.major;
  let rootOffset = scale.intervals[degree - 1];
  if (rootOffset == null) throw new Error(`Grau ${degree} fora da escala ${scaleKey}`);
  if (acc === "b") rootOffset = (rootOffset - 1 + 12) % 12;
  else if (acc === "#") rootOffset = (rootOffset + 1) % 12;
  const rootPc = (tonicPc + rootOffset + 12) % 12;

  const tail = (tailRaw || "").trim();
  let qualKey = null;
  if (diminutive === "°") {
    qualKey = tail === "7" ? "dim7" : "dim";
  } else if (diminutive === "ø") {
    qualKey = "m7b5";
  } else if (tail === "") {
    qualKey = isMinorRoman ? "m" : "";
  } else {
    // Sufixo explícito — combina com o case do romano se relevante.
    if (isMinorRoman && tail === "7") qualKey = "m7";
    else if (isMinorRoman && tail === "maj7") qualKey = "mMaj7";
    else qualKey = canonicalizeQualityToken(tail);
  }
  if (qualKey == null || !(qualKey in CHORD_QUALITIES)) {
    throw new Error(`Qualidade desconhecida: "${tailRaw}" em "${str}"`);
  }
  const q = CHORD_QUALITIES[qualKey];
  return {
    degree,
    rootPc,
    intervals: q.intervals.slice(),
    quality: q.label,
    roman: s,
  };
}

/** Pitch classes absolutos de um descritor de acorde. */
function chordPitchClasses(chord) {
  return chord.intervals.map((i) => ((chord.rootPc + i) % 12 + 12) % 12);
}

/** Notas MIDI absolutas do acorde em `baseOct` (C4 = oitava 4). */
function chordMidisAbsolute(chord, baseOct = 4) {
  return chord.intervals.map((ivl) =>
    wrapMidiToRange(12 * (baseOct + 1) + chord.rootPc + ivl)
  );
}

// --- Auto-escala (melhor tipo de escala para um acorde) ---------------------

/**
 * Escolhe o tipo de escala (entre `candidates` — default: todas em
 * SCALE_TYPES) que melhor casa com o acorde, mantendo a tônica fixa em
 * `tonicPc`. O ranking reutiliza `rateScaleAgainstChord`, passando pitch
 * classes do acorde relativos à tônica da escala.
 *
 * Em empate, devolve a primeira chave na ordem em que aparece em `candidates`.
 */
function pickParentScaleForChord(chord, tonicPc = 0, candidates) {
  const relPcs = chord.intervals.map((i) => (chord.rootPc - tonicPc + i + 12) % 12);
  const keys = Array.isArray(candidates) && candidates.length ? candidates : Object.keys(SCALE_TYPES);
  let best = { key: keys[0], rating: -1 };
  for (const k of keys) {
    if (!(k in SCALE_TYPES)) continue;
    const r = rateScaleAgainstChord(k, relPcs);
    if (r > best.rating) best = { key: k, rating: r };
  }
  return best;
}

// --- Progressões pré-definidas ---------------------------------------------

const CHORD_PROGRESSIONS = {
  ii_V_I_major: {
    label: "ii–V–I maior",
    defaultScale: "major",
    steps: [
      { roman: "ii7", bars: 1 },
      { roman: "V7", bars: 1 },
      { roman: "Imaj7", bars: 2 },
    ],
  },
  ii_V_i_minor: {
    label: "ii°–V7–i menor",
    defaultScale: "harmonic_minor",
    steps: [
      { roman: "iiø", bars: 1 },
      { roman: "V7", bars: 1 },
      { roman: "i", bars: 2 },
    ],
  },
  I_vi_ii_V_turnaround: {
    label: "I–vi–ii–V (turnaround jazz)",
    defaultScale: "major",
    steps: [
      { roman: "Imaj7", bars: 1 },
      { roman: "vi7", bars: 1 },
      { roman: "ii7", bars: 1 },
      { roman: "V7", bars: 1 },
    ],
  },
  I_V_vi_IV_pop: {
    label: "I–V–vi–IV (pop)",
    defaultScale: "major",
    steps: [
      { roman: "I", bars: 1 },
      { roman: "V", bars: 1 },
      { roman: "vi", bars: 1 },
      { roman: "IV", bars: 1 },
    ],
  },
  I_vi_IV_V_50s: {
    label: "I–vi–IV–V (anos 50)",
    defaultScale: "major",
    steps: [
      { roman: "I", bars: 1 },
      { roman: "vi", bars: 1 },
      { roman: "IV", bars: 1 },
      { roman: "V", bars: 1 },
    ],
  },
  blues_12_major: {
    label: "Blues 12 compassos (maior)",
    defaultScale: "mixolydian",
    steps: [
      { roman: "I7", bars: 4 },
      { roman: "IV7", bars: 2 },
      { roman: "I7", bars: 2 },
      { roman: "V7", bars: 1 },
      { roman: "IV7", bars: 1 },
      { roman: "I7", bars: 1 },
      { roman: "V7", bars: 1 },
    ],
  },
  andalusian: {
    label: "Cadência andaluza (i–VII–VI–V)",
    defaultScale: "phrygian",
    steps: [
      { roman: "i", bars: 1 },
      { roman: "VII", bars: 1 },
      { roman: "VI", bars: 1 },
      { roman: "V", bars: 1 },
    ],
  },
  canon: {
    label: "Canon (I–V–vi–iii–IV–I–IV–V)",
    defaultScale: "major",
    steps: [
      { roman: "I", bars: 1 },
      { roman: "V", bars: 1 },
      { roman: "vi", bars: 1 },
      { roman: "iii", bars: 1 },
      { roman: "IV", bars: 1 },
      { roman: "I", bars: 1 },
      { roman: "IV", bars: 1 },
      { roman: "V", bars: 1 },
    ],
  },
};

// --- Sequência: resolução e avanço por compasso -----------------------------

/**
 * Resolve um step cru em um step executável.
 *
 * Formato de entrada:
 *   { roman: "ii7", bars: 1 }                // grau — transpõe com a tônica
 *   { chord: "Dm7",  bars: 1 }               // acorde absoluto — fixo
 *   { roman: "V7", scale: "mixolydian" }     // escala explícita para o step
 *
 * `ctx`:
 *   - tonicPc   (0..11)           — tônica global; usada para resolver romanos.
 *   - scaleKey  (chave de SCALE_TYPES) — escala "contexto" default do step.
 *   - autoScale (bool)            — se true e o step não traz `scale`, escolhe
 *                                    automaticamente o melhor tipo em
 *                                    `scaleCandidates`.
 *   - scaleCandidates (string[])  — limite de pesquisa do auto-scale.
 */
function resolveSequenceStep(rawStep, ctx = {}) {
  if (!rawStep) throw new Error("resolveSequenceStep: step ausente");
  const { tonicPc = 0, scaleKey = "major", autoScale = false, scaleCandidates } = ctx;
  let chord;
  if (rawStep.chord) {
    chord = parseAbsoluteChord(rawStep.chord);
  } else if (rawStep.roman) {
    chord = parseRomanChord(rawStep.roman, tonicPc, scaleKey);
  } else {
    throw new Error("step precisa de 'roman' ou 'chord'");
  }
  const bars = Math.max(1, Math.floor(rawStep.bars ?? 1));
  let chosenScale = rawStep.scale || scaleKey;
  if (autoScale && !rawStep.scale) {
    chosenScale = pickParentScaleForChord(chord, tonicPc, scaleCandidates).key;
  }
  return {
    chord,
    bars,
    scale: chosenScale,
    roman: rawStep.roman || null,
    absolute: rawStep.chord || null,
    label: rawStep.roman || rawStep.chord || chord.label,
  };
}

/** Resolve a sequência inteira. */
function resolveSequence(rawSteps, ctx = {}) {
  if (!Array.isArray(rawSteps)) throw new Error("resolveSequence: array esperado");
  return rawSteps.map((s) => resolveSequenceStep(s, ctx));
}

/**
 * Dado uma sequência resolvida e um índice de compasso (0-based, mas pode ser
 * qualquer inteiro — envolve-se em loop), devolve o step ativo, o índice do
 * step, o compasso relativo dentro do step e o total de compassos da volta.
 */
function stepAtBar(resolvedSteps, barIndex) {
  if (!Array.isArray(resolvedSteps) || resolvedSteps.length === 0) return null;
  const totalBars = resolvedSteps.reduce((s, st) => s + st.bars, 0);
  if (totalBars <= 0) return null;
  const bar = ((Math.floor(barIndex) % totalBars) + totalBars) % totalBars;
  let acc = 0;
  for (let i = 0; i < resolvedSteps.length; i++) {
    const st = resolvedSteps[i];
    if (bar < acc + st.bars) {
      return { step: st, index: i, barInStep: bar - acc, totalBars };
    }
    acc += st.bars;
  }
  return null;
}

// --- Export dual-mode (browser globals + CommonJS) --------------------------

(function (root, api) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    // Browser / worker: injeta cada símbolo como global para que app.js (script
    // clássico, carregado a seguir) continue a referenciá-los diretamente.
    for (const k of Object.keys(api)) {
      root[k] = api[k];
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, {
  // Pitch & nomes
  PC_NAMES_SHARP,
  PC_NAMES_FLAT,
  NOTE_MAP,
  TONIC_OPTIONS,
  pcToName,
  parseTonic,
  // Escalas
  SCALE_TYPES,
  SCALE_SELECT_GROUPS,
  ROMAN_BASE,
  MAX_DEGREE_LABEL,
  UNICODE_PRIME,
  // Graus / tríades
  diatonicTriadSemitonesFromRoot,
  triadQuality,
  triadQualityPt,
  romanForDegree,
  romanForExtendedDegree,
  intervalNameFromTonic,
  degreeToSemitonesFromTonic,
  pitchClassForDegree,
  formatSlotDegreeLabel,
  // MIDI
  midiTonic,
  midiForScaleDegree,
  slotsPlaybackBaseOct,
  clampMidi,
  wrapMidiToRange,
  // Harmonia
  HARMONY_REF_IVALS,
  harmonyRefIvals,
  harmonyMidis,
  BASS_PATTERN_IDS,
  nextHarmonyBassMidi,
  // Compatibilidade escala × acorde
  rateScaleAgainstChord,
  scaleStarsRender,
  // Acordes (qualidades, parsers)
  CHORD_QUALITIES,
  parseAbsoluteChord,
  parseRomanChord,
  chordPitchClasses,
  chordMidisAbsolute,
  // Auto-escala
  pickParentScaleForChord,
  // Sequências de acordes
  CHORD_PROGRESSIONS,
  resolveSequenceStep,
  resolveSequence,
  stepAtBar,
});
