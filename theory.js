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

// --- Compatibilidade escala × acorde (estrelas no #scaleType) ---------------

/**
 * Rating 0..3 de uma escala candidata sobre o acorde atual.
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
  // Harmonia
  HARMONY_REF_IVALS,
  harmonyRefIvals,
  harmonyMidis,
  // Compatibilidade escala × acorde
  rateScaleAgainstChord,
  scaleStarsRender,
});
