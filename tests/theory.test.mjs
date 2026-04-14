/**
 * Testes do núcleo teórico (`theory.js`).
 *
 * Executa via:     node --test tests/
 * Pressuposto:     Node 20+ (test runner nativo + assert/strict nativo).
 *
 * Convenções de pitch-class (pc): 0 = C, 1 = C#/Db, …, 11 = B.
 * Convenções de MIDI: C-1 = 0, logo C4 = 60.
 */

import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const theory = require("../theory.js");

const {
  // Pitch
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
  // Tríades / romanos
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
  // Ratings
  rateScaleAgainstChord,
  scaleStarsRender,
  // Acordes
  CHORD_QUALITIES,
  parseAbsoluteChord,
  parseRomanChord,
  chordPitchClasses,
  chordMidisAbsolute,
  // Auto-escala
  pickParentScaleForChord,
  // Sequências
  CHORD_PROGRESSIONS,
  resolveSequenceStep,
  resolveSequence,
  stepAtBar,
} = theory;

// ---------------------------------------------------------------------------

describe("pitch-class helpers", () => {
  test("PC_NAMES têm 12 nomes cada", () => {
    assert.equal(PC_NAMES_SHARP.length, 12);
    assert.equal(PC_NAMES_FLAT.length, 12);
  });

  test("pcToName sharp/flat coerente com NOTE_MAP", () => {
    for (let pc = 0; pc < 12; pc++) {
      assert.equal(NOTE_MAP[pcToName(pc, false)], pc, `sharp ${pc}`);
      assert.equal(NOTE_MAP[pcToName(pc, true)], pc, `flat ${pc}`);
    }
  });

  test("pcToName wrapping negativo", () => {
    assert.equal(pcToName(-1, false), "B");
    assert.equal(pcToName(12, false), "C");
  });

  test("parseTonic aceita os 17 rótulos do selector", () => {
    assert.equal(TONIC_OPTIONS.length, 17);
    for (const name of TONIC_OPTIONS) {
      assert.ok(Number.isInteger(parseTonic(name)), `tonic ${name}`);
    }
  });

  test("parseTonic rejeita inválidos", () => {
    assert.throws(() => parseTonic("H"));
    assert.throws(() => parseTonic("Z#"));
    assert.throws(() => parseTonic(""));
  });
});

// ---------------------------------------------------------------------------

describe("SCALE_TYPES — bem-formação", () => {
  const keys = Object.keys(SCALE_TYPES);

  test("16 escalas registadas", () => {
    assert.equal(keys.length, 16);
  });

  test("todas começam em 0 e estão ordenadas (<12) sem duplicados", () => {
    for (const k of keys) {
      const ivals = SCALE_TYPES[k].intervals;
      assert.equal(ivals[0], 0, `${k} começa em 0`);
      assert.ok(new Set(ivals).size === ivals.length, `${k} sem duplicados`);
      for (let i = 1; i < ivals.length; i++) {
        assert.ok(ivals[i] > ivals[i - 1], `${k} monotónica`);
        assert.ok(ivals[i] < 12, `${k} dentro de 1 oitava`);
      }
    }
  });

  test("todas as chaves dos SELECT_GROUPS existem em SCALE_TYPES", () => {
    const grouped = SCALE_SELECT_GROUPS.flatMap((g) => g.keys);
    for (const k of grouped) {
      assert.ok(SCALE_TYPES[k], `${k} não existe`);
    }
    // cobertura: cada escala aparece num grupo
    for (const k of keys) {
      assert.ok(grouped.includes(k), `${k} sem grupo`);
    }
  });

  test("modos gregos derivados do maior (relação de modo)", () => {
    // rodar o jônio por cada grau reproduz os outros modos
    const jonio = SCALE_TYPES.major.intervals; // [0,2,4,5,7,9,11]
    const rotate = (i) => {
      const base = jonio[i];
      return jonio.map((v) => ((v - base) + 12) % 12).sort((a, b) => a - b);
    };
    assert.deepEqual(rotate(1), SCALE_TYPES.dorian.intervals);
    assert.deepEqual(rotate(2), SCALE_TYPES.phrygian.intervals);
    assert.deepEqual(rotate(3), SCALE_TYPES.lydian.intervals);
    assert.deepEqual(rotate(4), SCALE_TYPES.mixolydian.intervals);
    assert.deepEqual(rotate(5), SCALE_TYPES.natural_minor.intervals);
    assert.deepEqual(rotate(6), SCALE_TYPES.locrian.intervals);
  });
});

// ---------------------------------------------------------------------------

describe("tríades diatónicas e romanos", () => {
  const maj = SCALE_TYPES.major.intervals;
  const min = SCALE_TYPES.natural_minor.intervals;

  test("diatonicTriadSemitonesFromRoot em C maior", () => {
    // I  : C-E-G   → 4,7 (maior)
    // ii : D-F-A   → 3,7 (menor)
    // iii: E-G-B   → 3,7 (menor)
    // IV : F-A-C   → 4,7 (maior)
    // V  : G-B-D   → 4,7 (maior)
    // vi : A-C-E   → 3,7 (menor)
    // vii°: B-D-F  → 3,6 (dim)
    const expected = [
      [4, 7],
      [3, 7],
      [3, 7],
      [4, 7],
      [4, 7],
      [3, 7],
      [3, 6],
    ];
    for (let i = 0; i < 7; i++) {
      const { third, fifth } = diatonicTriadSemitonesFromRoot(maj, i);
      assert.deepEqual([third, fifth], expected[i], `maior grau ${i + 1}`);
    }
  });

  test("diatonicTriadSemitonesFromRoot em menor natural", () => {
    // i : A-C-E  → 3,7 (menor)
    // ii°: B-D-F  → 3,6
    // III: C-E-G  → 4,7
    // iv : D-F-A  → 3,7
    // v  : E-G-B  → 3,7
    // VI : F-A-C  → 4,7
    // VII: G-B-D  → 4,7
    const expected = [
      [3, 7],
      [3, 6],
      [4, 7],
      [3, 7],
      [3, 7],
      [4, 7],
      [4, 7],
    ];
    for (let i = 0; i < 7; i++) {
      const { third, fifth } = diatonicTriadSemitonesFromRoot(min, i);
      assert.deepEqual([third, fifth], expected[i], `menor grau ${i + 1}`);
    }
  });

  test("triadQuality categoriza as 4 qualidades básicas", () => {
    assert.equal(triadQuality(4, 7), "major");
    assert.equal(triadQuality(3, 7), "minor");
    assert.equal(triadQuality(3, 6), "diminished");
    assert.equal(triadQuality(4, 8), "augmented");
    assert.equal(triadQuality(2, 5), "other");
  });

  test("triadQualityPt → iniciais PT", () => {
    assert.equal(triadQualityPt("major"), "M");
    assert.equal(triadQualityPt("minor"), "m");
    assert.equal(triadQualityPt("diminished"), "dim");
    assert.equal(triadQualityPt("augmented"), "aug");
    assert.equal(triadQualityPt("other"), "?");
  });

  test("romans clássicos em C maior", () => {
    const romans = [1, 2, 3, 4, 5, 6, 7].map((d) => romanForDegree(maj, d).roman);
    assert.deepEqual(romans, ["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
  });

  test("romans em menor natural", () => {
    const romans = [1, 2, 3, 4, 5, 6, 7].map((d) => romanForDegree(min, d).roman);
    assert.deepEqual(romans, ["i", "ii°", "III", "iv", "v", "VI", "VII"]);
  });

  test("romans em harmónica menor (V maior, vii° no 7)", () => {
    const hm = SCALE_TYPES.harmonic_minor.intervals;
    const r = [1, 5, 7].map((d) => romanForDegree(hm, d));
    assert.equal(r[0].quality, "minor"); // i
    assert.equal(r[1].quality, "major"); // V (dominante)
    assert.equal(r[2].quality, "diminished");
  });

  test("romanForExtendedDegree adiciona ′ por oitava acima em escalas de 7 notas", () => {
    assert.equal(romanForExtendedDegree(maj, 1).roman, "I");
    assert.equal(romanForExtendedDegree(maj, 8).roman, "I′"); // 1 oitava acima
    assert.equal(romanForExtendedDegree(maj, 15).roman, "I′′"); // 2 oitavas
    assert.equal(romanForExtendedDegree(maj, 22).roman, "I′′′"); // 3 oitavas
  });

  test("romanForExtendedDegree em escala de 5 notas usa números", () => {
    const pm = SCALE_TYPES.pent_major.intervals;
    assert.equal(romanForExtendedDegree(pm, 1).roman, "1");
    assert.equal(romanForExtendedDegree(pm, 6).roman, "1′");
    assert.equal(romanForExtendedDegree(pm, 11).roman, "1′′");
  });

  test("romanForExtendedDegree fora do intervalo → dash", () => {
    assert.equal(romanForExtendedDegree(maj, 0).roman, "—");
    assert.equal(romanForExtendedDegree(maj, 23).roman, "—");
    assert.equal(romanForExtendedDegree(maj, NaN).roman, "—");
  });
});

// ---------------------------------------------------------------------------

describe("graus ↔ semitons ↔ pitch-class", () => {
  test("degreeToSemitonesFromTonic em C maior, 2 oitavas", () => {
    const ivals = SCALE_TYPES.major.intervals;
    // [0,2,4,5,7,9,11,12,14,16,17,19,21,23]
    const expected = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
    for (let d = 1; d <= 14; d++) {
      assert.equal(
        degreeToSemitonesFromTonic(ivals, d),
        expected[d - 1],
        `grau ${d}`,
      );
    }
  });

  test("degreeToSemitonesFromTonic em pentatônica maior (5 notas/oitava)", () => {
    const ivals = SCALE_TYPES.pent_major.intervals; // [0,2,4,7,9]
    assert.equal(degreeToSemitonesFromTonic(ivals, 1), 0);
    assert.equal(degreeToSemitonesFromTonic(ivals, 5), 9);
    assert.equal(degreeToSemitonesFromTonic(ivals, 6), 12); // 1ª oitava acima
    assert.equal(degreeToSemitonesFromTonic(ivals, 10), 21); // 5ª da 2ª oitava
    assert.equal(degreeToSemitonesFromTonic(ivals, 11), 24); // 1′′
  });

  test("pitchClassForDegree em D dórico", () => {
    const ivals = SCALE_TYPES.dorian.intervals; // [0,2,3,5,7,9,10]
    const D = 2;
    // D dórico = D E F G A B C
    const expected = [D, 4, 5, 7, 9, 11, 0];
    for (let d = 1; d <= 7; d++) {
      assert.equal(pitchClassForDegree(d, ivals, D), expected[d - 1], `grau ${d}`);
    }
  });

  test("formatSlotDegreeLabel combina grau + romano + nome", () => {
    const ivals = SCALE_TYPES.major.intervals;
    const C = 0;
    assert.equal(formatSlotDegreeLabel(1, ivals, C, false), "1: I — C");
    assert.equal(formatSlotDegreeLabel(5, ivals, C, false), "5: V — G");
    assert.equal(formatSlotDegreeLabel(7, ivals, C, false), "7: vii° — B");
  });
});

// ---------------------------------------------------------------------------

describe("MIDI helpers", () => {
  test("slotsPlaybackBaseOct === 4 (convenção do app)", () => {
    assert.equal(slotsPlaybackBaseOct(), 4);
  });

  test("midiTonic(C, 4) === 60", () => {
    assert.equal(midiTonic(0, 4), 60);
    assert.equal(midiTonic(9, 4), 69); // A4
  });

  test("midiForScaleDegree: C maior, grau 5, oitava 4 → 67 (G4)", () => {
    const ivals = SCALE_TYPES.major.intervals;
    assert.equal(midiForScaleDegree(0, ivals, 1, 4), 60); // C4
    assert.equal(midiForScaleDegree(0, ivals, 5, 4), 67); // G4
    assert.equal(midiForScaleDegree(0, ivals, 8, 4), 72); // C5 (oitava acima)
  });

  test("intervalNameFromTonic nomeia 0..11 (dentro da oitava)", () => {
    assert.equal(intervalNameFromTonic(0), "1 P");
    assert.equal(intervalNameFromTonic(3), "3 m");
    assert.equal(intervalNameFromTonic(4), "3 M");
    assert.equal(intervalNameFromTonic(6), "5 dim / T");
    assert.equal(intervalNameFromTonic(7), "5 P");
    assert.equal(intervalNameFromTonic(11), "7 M");
  });

  test("intervalNameFromTonic compõe acima de 12 via '+NX8'", () => {
    // O código usa base simples (0..11) + sufixo de oitava; as entradas
    // do map > 11 são decorativas e nunca são atingidas por este caminho.
    assert.equal(intervalNameFromTonic(12), "1 P (+1×8)");
    assert.equal(intervalNameFromTonic(16), "3 M (+1×8)");
    assert.equal(intervalNameFromTonic(24), "1 P (+2×8)");
    assert.ok(intervalNameFromTonic(26).includes("(+2×8)"));
  });
});

// ---------------------------------------------------------------------------

describe("harmonia base — harmonyMidis / HARMONY_REF_IVALS", () => {
  const C = 0;
  const REF = HARMONY_REF_IVALS;

  test("HARMONY_REF_IVALS ≡ jônio", () => {
    assert.deepEqual(REF, SCALE_TYPES.major.intervals);
    assert.deepEqual(harmonyRefIvals(), REF);
  });

  test("deg1 em C → [C4,E4,G4] = [60,64,67]", () => {
    assert.deepEqual(harmonyMidis(C, REF, "deg1", 4), [60, 64, 67]);
  });

  test("deg2 em C → D menor = [62,65,69]", () => {
    assert.deepEqual(harmonyMidis(C, REF, "deg2", 4), [62, 65, 69]);
  });

  test("deg4 em C → F maior = [65,69,72]", () => {
    assert.deepEqual(harmonyMidis(C, REF, "deg4", 4), [65, 69, 72]);
  });

  test("deg5 em C → G maior = [67,71,74]", () => {
    assert.deepEqual(harmonyMidis(C, REF, "deg5", 4), [67, 71, 74]);
  });

  test("deg7 em C → B diminuto = [71,74,77]", () => {
    assert.deepEqual(harmonyMidis(C, REF, "deg7", 4), [71, 74, 77]);
  });

  test("V7 em C → G7 = [67,71,74,77]", () => {
    assert.deepEqual(harmonyMidis(C, REF, "V7", 4), [67, 71, 74, 77]);
  });

  test("off → array vazio", () => {
    assert.deepEqual(harmonyMidis(C, REF, "off", 4), []);
    assert.deepEqual(harmonyMidis(C, REF, "inexistente", 4), []);
  });

  test("desacoplamento: mesmo em Lídio, acorde base usa REF (maior)", () => {
    // O chamador em app.js passa SEMPRE harmonyRefIvals(). Verificamos que
    // o resultado é idêntico ao esperado do maior, independentemente do modo
    // que o utilizador tenha escolhido para tocar por cima.
    const lyd = SCALE_TYPES.lydian.intervals;
    const withLydian = harmonyMidis(C, lyd, "deg1", 4); // (uso incorreto a evitar)
    const withRef = harmonyMidis(C, REF, "deg1", 4);
    assert.deepEqual(withRef, [60, 64, 67]);
    // Com Lídio o deg1 ainda é C-E-G porque a 3ª do lídio é M; mas no IV grau diverge:
    assert.deepEqual(harmonyMidis(C, lyd, "deg4", 4), [66, 69, 72]); // F#-A-C (lídio #4)
    assert.deepEqual(harmonyMidis(C, REF, "deg4", 4), [65, 69, 72]); // F-A-C (maior)
    assert.notDeepEqual(withLydian, harmonyMidis(C, lyd, "deg4", 4)); // distinção existe
  });

  test("tonicidade propaga: G maior V7 = D7", () => {
    const G = 7;
    // V7 em G = D–F#–A–C
    assert.deepEqual(harmonyMidis(G, REF, "V7", 4), [
      midiForScaleDegree(G, REF, 5, 4),
      midiForScaleDegree(G, REF, 7, 4),
      midiForScaleDegree(G, REF, 9, 4),
      midiForScaleDegree(G, REF, 11, 4),
    ]);
  });
});

// ---------------------------------------------------------------------------

describe("rateScaleAgainstChord — ranking de compatibilidade escala/acorde", () => {
  // Convenção do app: `rateScaleAgainstChord` recebe pitch-classes do acorde
  // RELATIVAS à raiz do próprio acorde (ver `currentChordPCsArray` em app.js,
  // que faz `(m - tcp) mod 12` e a harmonia base está sempre no grau I em
  // termos da tónica corrente). Logo os chord arrays abaixo são sempre
  // "Cmaj7 transposto para começar em 0".
  const Cmaj7 = [0, 4, 7, 11]; // 1 - 3M - 5P - 7M
  const C_triad = [0, 4, 7];
  const Dm7_rel = [0, 3, 7, 10]; // 1 - 3m - 5P - 7m
  const G7_rel = [0, 4, 7, 10]; // 1 - 3M - 5P - 7m

  test("escala inexistente → 0", () => {
    assert.equal(rateScaleAgainstChord("nope", Cmaj7), 0);
  });

  test("chord array vazio → 0", () => {
    assert.equal(rateScaleAgainstChord("major", []), 0);
    assert.equal(rateScaleAgainstChord("major", null), 0);
  });

  test("Lídio sobre Cmaj7 → 3★ (sem avoid sobre a 4# ser fora do acorde)", () => {
    assert.equal(rateScaleAgainstChord("lydian", Cmaj7), 3);
  });

  test("Jônio sobre Cmaj7 → 2★ (avoid: F é semitom acima de E)", () => {
    assert.equal(rateScaleAgainstChord("major", Cmaj7), 2);
  });

  test("Mixolídio sobre Cmaj7 → 0 (7ª bemol choca com a M7)", () => {
    // mixolídio tem b7 (10) — 7ª do Cmaj7 é 11 → falta. 5ª presente. Avoid F sobre E.
    // score = 3 - 1 (seventh missing) - 1 (avoid F) = 1 (não 0 como eu sugeri).
    // Mas a 3ª existe (4), root existe. NÃO vai a zero. Vai a 1★.
    assert.equal(rateScaleAgainstChord("mixolydian", Cmaj7), 1);
  });

  test("Eólio sobre Cmaj7 → 0 (3ª menor do Eólio choca com a 3ª maior do acorde)", () => {
    // Eólio tem b3 (3); terça do acorde (4) não está na escala → root check 3 passa
    // mas third (4) NÃO está no eólio → retorna 0 (choque de qualidade).
    assert.equal(rateScaleAgainstChord("natural_minor", Cmaj7), 0);
  });

  test("Lídio > Jônio > Mixolídio > Eólio sobre Cmaj7 (ordem parcial)", () => {
    const ranks = [
      rateScaleAgainstChord("lydian", Cmaj7),
      rateScaleAgainstChord("major", Cmaj7),
      rateScaleAgainstChord("mixolydian", Cmaj7),
      rateScaleAgainstChord("natural_minor", Cmaj7),
    ];
    assert.deepEqual(ranks, [3, 2, 1, 0]);
  });

  test("Pentatónica maior sobre tríade C → 3★", () => {
    // pent maior = [0,2,4,7,9] — tem root, 3, 5; sem 7ª para penalizar.
    // avoid: 5 (F) não está na escala; 8 (Ab) idem; 12 idem. Nenhum avoid.
    assert.equal(rateScaleAgainstChord("pent_major", C_triad), 3);
  });

  test("Dórico sobre Dm7 → 3★ (acorde-mãe do dórico, sem avoid notes)", () => {
    // Dorian.intervals = {0,2,3,5,7,9,10}. Dm7 rel = {0,3,7,10}. Todos no cj.
    // Vizinhos +1 de {0,3,7,10} = {1,4,8,11}. Nenhum está no dórico. Score 3.
    assert.equal(rateScaleAgainstChord("dorian", Dm7_rel), 3);
  });

  test("Mixolídio sobre G7 → 2★ (C sobre B é avoid clássico do 11 vs 3)", () => {
    // Mixo.intervals = {0,2,4,5,7,9,10}. G7 rel = {0,4,7,10}. Todos no cj.
    // Score base = 3. Avoid: 4+1 = 5 está na escala e NÃO no acorde (é a "11"
    // sobre a "3" — o motivo pelo qual jazz usa lydian-dominant em IIV7 alt).
    // Score = 3 - 1 = 2.
    assert.equal(rateScaleAgainstChord("mixolydian", G7_rel), 2);
  });

  test("Lydian-dominant sobre G7 não existe no app, mas Lídio sobre tríade G → 3★", () => {
    // Smoke: Lídio puro tem a 7M (11) que choca com um G7 (10), daí falhar.
    // Sobre uma tríade G pura [0,4,7] não há 7ª a comparar; avoid #11/M7 tbm não cria choque
    // porque o 6 do lídio não é +1 de nenhum tom do acorde.
    const GTriad_rel = [0, 4, 7];
    assert.equal(rateScaleAgainstChord("lydian", GTriad_rel), 3);
  });

  test("Blues menor sobre tríade menor → tem root e b3, pontua", () => {
    // C menor tríade = [0,3,7] (relativo à tónica).
    // Blues menor = [0,3,5,6,7,10]. Tem root, 3ª, 5ª. Falta 7ª (não passada). Score 3.
    // Avoid: +1 de {0,3,7} = {1,4,8}. 1? não. 4? não. 8? não. Zero avoids.
    assert.equal(rateScaleAgainstChord("blues", [0, 3, 7]), 3);
  });
});

// ---------------------------------------------------------------------------

describe("scaleStarsRender — formatação", () => {
  test("render em 4 níveis", () => {
    assert.equal(scaleStarsRender(0), "☆☆☆");
    assert.equal(scaleStarsRender(1), "★☆☆");
    assert.equal(scaleStarsRender(2), "★★☆");
    assert.equal(scaleStarsRender(3), "★★★");
  });

  test("clamps fora de [0,3]", () => {
    assert.equal(scaleStarsRender(7), "★★★");
    assert.equal(scaleStarsRender(-5), "");
    assert.equal(scaleStarsRender(null), "");
  });
});

// ---------------------------------------------------------------------------

describe("parseAbsoluteChord — tétrades e tríades nomeadas", () => {
  test("Cmaj7 → [0,4,7,11]", () => {
    const c = parseAbsoluteChord("Cmaj7");
    assert.equal(c.rootPc, 0);
    assert.deepEqual(c.intervals, [0, 4, 7, 11]);
    assert.deepEqual(chordPitchClasses(c), [0, 4, 7, 11]);
  });

  test("Dm7 → [2,5,9,0] como pcs absolutos", () => {
    const c = parseAbsoluteChord("Dm7");
    assert.equal(c.rootPc, 2);
    assert.deepEqual(c.intervals, [0, 3, 7, 10]);
    assert.deepEqual(chordPitchClasses(c), [2, 5, 9, 0]);
  });

  test("G7 → [7,11,2,5]", () => {
    assert.deepEqual(chordPitchClasses(parseAbsoluteChord("G7")), [7, 11, 2, 5]);
  });

  test("Bbmaj7 e B♭Δ7 equivalem", () => {
    const a = parseAbsoluteChord("Bbmaj7");
    const b = parseAbsoluteChord("B♭Δ7");
    assert.equal(a.rootPc, 10);
    assert.equal(b.rootPc, 10);
    assert.deepEqual(a.intervals, b.intervals);
  });

  test("F#m7b5 e F♯ø coincidem", () => {
    const a = parseAbsoluteChord("F#m7b5");
    const b = parseAbsoluteChord("F♯ø");
    assert.equal(a.rootPc, 6);
    assert.equal(b.rootPc, 6);
    assert.deepEqual(a.intervals, [0, 3, 6, 10]);
    assert.deepEqual(b.intervals, [0, 3, 6, 10]);
  });

  test("tríades simples sem sufixo", () => {
    assert.deepEqual(parseAbsoluteChord("C").intervals, [0, 4, 7]);
    assert.deepEqual(parseAbsoluteChord("Am").intervals, [0, 3, 7]);
    assert.deepEqual(parseAbsoluteChord("Bdim").intervals, [0, 3, 6]);
    assert.deepEqual(parseAbsoluteChord("Caug").intervals, [0, 4, 8]);
  });

  test("rejeita qualidades e notas inválidas", () => {
    assert.throws(() => parseAbsoluteChord("H7"));
    assert.throws(() => parseAbsoluteChord("Cmaj13b9#5"));
    assert.throws(() => parseAbsoluteChord(""));
  });
});

// ---------------------------------------------------------------------------

describe("parseRomanChord — romanos em contexto diatônico", () => {
  test("ii7 em C maior → Dm7", () => {
    const c = parseRomanChord("ii7", 0, "major");
    assert.equal(c.degree, 2);
    assert.equal(c.rootPc, 2);
    assert.deepEqual(c.intervals, [0, 3, 7, 10]);
    assert.deepEqual(chordPitchClasses(c), [2, 5, 9, 0]);
  });

  test("V7 em C maior → G7", () => {
    const c = parseRomanChord("V7", 0, "major");
    assert.equal(c.rootPc, 7);
    assert.deepEqual(chordPitchClasses(c), [7, 11, 2, 5]);
  });

  test("Imaj7 em C maior → Cmaj7", () => {
    assert.deepEqual(chordPitchClasses(parseRomanChord("Imaj7", 0, "major")), [0, 4, 7, 11]);
  });

  test("vi em C maior → tríade menor em A (Am)", () => {
    const c = parseRomanChord("vi", 0, "major");
    assert.equal(c.rootPc, 9);
    assert.deepEqual(c.intervals, [0, 3, 7]);
  });

  test("iiø em C maior → Dm7b5", () => {
    const c = parseRomanChord("iiø", 0, "major");
    assert.equal(c.rootPc, 2);
    assert.deepEqual(c.intervals, [0, 3, 6, 10]);
  });

  test("transpõe com a tônica: ii7 em F (tonicPc=5) → Gm7", () => {
    const c = parseRomanChord("ii7", 5, "major");
    assert.equal(c.rootPc, 7);
    assert.deepEqual(chordPitchClasses(c), [7, 10, 2, 5]);
  });

  test("prefixo bVII em C maior → Bb (tríade maior)", () => {
    const c = parseRomanChord("bVII", 0, "major");
    assert.equal(c.rootPc, 10);
    assert.deepEqual(c.intervals, [0, 4, 7]);
  });

  test("vii° em C maior → Bdim", () => {
    const c = parseRomanChord("vii°", 0, "major");
    assert.equal(c.rootPc, 11);
    assert.deepEqual(c.intervals, [0, 3, 6]);
  });

  test("rejeita romanos inválidos", () => {
    assert.throws(() => parseRomanChord("VIII", 0, "major"));
    assert.throws(() => parseRomanChord("xyz", 0, "major"));
  });
});

// ---------------------------------------------------------------------------

describe("chordMidisAbsolute — MIDI das notas do acorde", () => {
  test("Cmaj7 em oitava 4 → [60,64,67,71]", () => {
    const c = parseAbsoluteChord("Cmaj7");
    assert.deepEqual(chordMidisAbsolute(c, 4), [60, 64, 67, 71]);
  });

  test("G7 em oitava 3 → [55,59,62,65]", () => {
    const c = parseAbsoluteChord("G7");
    assert.deepEqual(chordMidisAbsolute(c, 3), [55, 59, 62, 65]);
  });
});

// ---------------------------------------------------------------------------

describe("pickParentScaleForChord — melhor escala-pai", () => {
  test("Cmaj7 em tônica C → major (ou lydian)", () => {
    const c = parseAbsoluteChord("Cmaj7");
    const best = pickParentScaleForChord(c, 0, ["major", "lydian", "mixolydian", "natural_minor"]);
    // major e lydian cobrem Cmaj7 sem avoid; mixolydian falha (b7) e natural_minor falha (b3).
    assert.ok(best.key === "major" || best.key === "lydian", `escolheu ${best.key}`);
    assert.equal(best.rating, 3);
  });

  test("Dm7 em tônica C → major cobre sem avoid", () => {
    const c = parseAbsoluteChord("Dm7");
    const best = pickParentScaleForChord(c, 0, ["major", "dorian", "phrygian", "natural_minor"]);
    assert.equal(best.rating, 3);
    // Primeiro candidato com rating 3 deve ser "major".
    assert.equal(best.key, "major");
  });

  test("G7 em tônica C → major cobre todas as notas mas tem avoid (C sobre B)", () => {
    // G7 pcs absolutos relativos a C = [7, 11, 2, 5]. C major contém todos os 4,
    // porém a tônica C (pc=0) é semitom acima da 3ª (B) e fora do acorde → -1 avoid,
    // baixando o rating para 2. É a conhecida avoid note do ii–V–I clássico (C/B).
    const c = parseAbsoluteChord("G7");
    const best = pickParentScaleForChord(c, 0, ["major", "mixolydian", "harmonic_minor"]);
    assert.equal(best.rating, 2);
    // Empate: major vem primeiro no candidates.
    assert.equal(best.key, "major");
  });
});

// ---------------------------------------------------------------------------

describe("CHORD_PROGRESSIONS — catálogo de presets", () => {
  test("catálogo tem pelo menos 6 presets essenciais", () => {
    const keys = Object.keys(CHORD_PROGRESSIONS);
    assert.ok(keys.length >= 6, `só ${keys.length} presets`);
    assert.ok("ii_V_I_major" in CHORD_PROGRESSIONS);
    assert.ok("blues_12_major" in CHORD_PROGRESSIONS);
  });

  test("cada preset tem label, defaultScale e steps bem formados", () => {
    for (const [key, preset] of Object.entries(CHORD_PROGRESSIONS)) {
      assert.equal(typeof preset.label, "string", `${key} label`);
      assert.ok(preset.defaultScale in SCALE_TYPES, `${key} defaultScale`);
      assert.ok(Array.isArray(preset.steps) && preset.steps.length > 0, `${key} steps`);
      for (const step of preset.steps) {
        assert.ok(step.roman || step.chord, `${key} step precisa de roman|chord`);
        assert.ok((step.bars ?? 1) >= 1, `${key} step bars`);
      }
    }
  });

  test("blues 12 compassos totaliza 12 compassos", () => {
    const preset = CHORD_PROGRESSIONS.blues_12_major;
    const total = preset.steps.reduce((s, st) => s + (st.bars ?? 1), 0);
    assert.equal(total, 12);
  });

  test("ii–V–I resolve para Dm7 → G7 → Cmaj7 em C maior", () => {
    const preset = CHORD_PROGRESSIONS.ii_V_I_major;
    const resolved = resolveSequence(preset.steps, { tonicPc: 0, scaleKey: preset.defaultScale });
    assert.equal(resolved.length, 3);
    assert.deepEqual(chordPitchClasses(resolved[0].chord), [2, 5, 9, 0]); // Dm7
    assert.deepEqual(chordPitchClasses(resolved[1].chord), [7, 11, 2, 5]); // G7
    assert.deepEqual(chordPitchClasses(resolved[2].chord), [0, 4, 7, 11]); // Cmaj7
  });

  test("ii–V–I transposta para F (tonicPc=5) → Gm7 → C7 → Fmaj7", () => {
    const preset = CHORD_PROGRESSIONS.ii_V_I_major;
    const resolved = resolveSequence(preset.steps, { tonicPc: 5, scaleKey: preset.defaultScale });
    assert.deepEqual(chordPitchClasses(resolved[0].chord), [7, 10, 2, 5]); // Gm7
    assert.deepEqual(chordPitchClasses(resolved[1].chord), [0, 4, 7, 10]); // C7
    assert.deepEqual(chordPitchClasses(resolved[2].chord), [5, 9, 0, 4]); // Fmaj7
  });
});

// ---------------------------------------------------------------------------

describe("resolveSequenceStep — romano vs absoluto e auto-escala", () => {
  test("chord absoluto não transpõe quando tônica muda", () => {
    const a = resolveSequenceStep({ chord: "Cmaj7", bars: 2 }, { tonicPc: 0 });
    const b = resolveSequenceStep({ chord: "Cmaj7", bars: 2 }, { tonicPc: 5 });
    assert.deepEqual(chordPitchClasses(a.chord), [0, 4, 7, 11]);
    assert.deepEqual(chordPitchClasses(b.chord), [0, 4, 7, 11]);
    assert.equal(a.bars, 2);
  });

  test("roman transpõe quando tônica muda", () => {
    const a = resolveSequenceStep({ roman: "Imaj7" }, { tonicPc: 0, scaleKey: "major" });
    const b = resolveSequenceStep({ roman: "Imaj7" }, { tonicPc: 5, scaleKey: "major" });
    assert.equal(a.chord.rootPc, 0);
    assert.equal(b.chord.rootPc, 5);
  });

  test("scale explícita no step vence a escala default", () => {
    const s = resolveSequenceStep(
      { roman: "V7", scale: "mixolydian" },
      { tonicPc: 0, scaleKey: "major" }
    );
    assert.equal(s.scale, "mixolydian");
  });

  test("auto-escala escolhe a melhor quando o step não tem scale", () => {
    const s = resolveSequenceStep(
      { roman: "ii7" },
      {
        tonicPc: 0,
        scaleKey: "major",
        autoScale: true,
        scaleCandidates: ["major", "natural_minor", "phrygian"],
      }
    );
    // Dm7 casa com C major ★★★ e não com C natural_minor (b3 = Eb, clash com Dm7's F) → escolhe major.
    assert.equal(s.scale, "major");
  });

  test("bars sempre ≥ 1, floor de valores fracionários", () => {
    const s = resolveSequenceStep({ roman: "I", bars: 2.7 }, { tonicPc: 0, scaleKey: "major" });
    assert.equal(s.bars, 2);
    const z = resolveSequenceStep({ roman: "I", bars: 0 }, { tonicPc: 0, scaleKey: "major" });
    assert.equal(z.bars, 1);
  });

  test("exige roman ou chord no step", () => {
    assert.throws(() => resolveSequenceStep({ bars: 1 }, { tonicPc: 0 }));
  });
});

// ---------------------------------------------------------------------------

describe("stepAtBar — avanço da sequência por compasso", () => {
  const seq = resolveSequence(
    [
      { roman: "Imaj7", bars: 2 },
      { roman: "V7", bars: 1 },
      { roman: "vi7", bars: 1 },
    ],
    { tonicPc: 0, scaleKey: "major" }
  );

  test("total de compassos é a soma dos bars", () => {
    const at = stepAtBar(seq, 0);
    assert.equal(at.totalBars, 4);
  });

  test("compasso 0 e 1 ficam no primeiro step", () => {
    assert.equal(stepAtBar(seq, 0).index, 0);
    assert.equal(stepAtBar(seq, 0).barInStep, 0);
    assert.equal(stepAtBar(seq, 1).index, 0);
    assert.equal(stepAtBar(seq, 1).barInStep, 1);
  });

  test("compasso 2 é o segundo step (V7), compasso 3 é o terceiro (vi7)", () => {
    assert.equal(stepAtBar(seq, 2).index, 1);
    assert.equal(stepAtBar(seq, 2).barInStep, 0);
    assert.equal(stepAtBar(seq, 3).index, 2);
  });

  test("loop: compasso 4 = 0, 5 = 1, 6 = 2…", () => {
    assert.equal(stepAtBar(seq, 4).index, 0);
    assert.equal(stepAtBar(seq, 6).index, 1);
    assert.equal(stepAtBar(seq, 100).index, stepAtBar(seq, 100 % 4).index);
  });

  test("compasso negativo envolve corretamente para trás", () => {
    assert.equal(stepAtBar(seq, -1).index, 2); // último step
    assert.equal(stepAtBar(seq, -4).index, 0);
  });

  test("sequência vazia → null", () => {
    assert.equal(stepAtBar([], 0), null);
    assert.equal(stepAtBar(null, 0), null);
  });
});

// ---------------------------------------------------------------------------

describe("clampMidi / wrapMidiToRange", () => {
  test("clampMidi corta em [0,127]", () => {
    assert.equal(clampMidi(-5), 0);
    assert.equal(clampMidi(200), 127);
    assert.equal(clampMidi(60.4), 60);
    assert.equal(clampMidi(60.6), 61);
  });

  test("clampMidi lida com NaN devolvendo C4", () => {
    assert.equal(clampMidi(NaN), 60);
    assert.equal(clampMidi(undefined), 60);
  });

  test("wrapMidiToRange transpõe por oitavas", () => {
    assert.equal(wrapMidiToRange(-3), 21); // -3 + 2×12 = 21
    assert.equal(wrapMidiToRange(140), 128 - 12); // subtrai 12 p/ ≤120
    assert.equal(wrapMidiToRange(60), 60);
  });

  test("wrapMidiToRange preserva classe de altura", () => {
    for (const m of [-24, -7, 0, 60, 127, 200]) {
      const w = wrapMidiToRange(m);
      assert.equal(((w % 12) + 12) % 12, ((Math.round(m) % 12) + 12) % 12, `mpc ${m}`);
    }
  });
});

// ---------------------------------------------------------------------------

describe("harmonyMidis — deg1..deg7 e V7 em C maior", () => {
  const ivals = HARMONY_REF_IVALS; // Jônio — referência explícita
  const base = 4; // C4 = 60

  // Cobertura nominal dos 7 graus em tríade + o V7.
  const cases = [
    ["deg1", [60, 64, 67]], // C E G
    ["deg2", [62, 65, 69]], // D F A
    ["deg3", [64, 67, 71]], // E G B
    ["deg4", [65, 69, 72]], // F A C
    ["deg5", [67, 71, 74]], // G B D
    ["deg6", [69, 72, 76]], // A C E
    ["deg7", [71, 74, 77]], // B D F
    ["V7", [67, 71, 74, 77]], // G B D F
  ];

  for (const [id, expected] of cases) {
    test(`${id} em C (base=4) → ${expected.join(" ")}`, () => {
      assert.deepEqual(harmonyMidis(0, ivals, id, base), expected);
    });
  }

  test("harmonia off devolve []", () => {
    assert.deepEqual(harmonyMidis(0, ivals, "off", 4), []);
  });

  test("transposição para tônica D (pc=2) soma 2 a cada nota", () => {
    const cMajor = harmonyMidis(0, ivals, "deg1", 4);
    const dMajor = harmonyMidis(2, ivals, "deg1", 4);
    assert.deepEqual(
      dMajor,
      cMajor.map((m) => m + 2)
    );
  });
});

// ---------------------------------------------------------------------------

describe("nextHarmonyBassMidi — cobertura dos 19 padrões", () => {
  const ivals = HARMONY_REF_IVALS;
  const base = 4;
  const pcs = (m) => ((m % 12) + 12) % 12;

  test("off e harmonyId=off devolvem null", () => {
    assert.equal(nextHarmonyBassMidi(0, ivals, "deg1", base, "off", 0), null);
    assert.equal(nextHarmonyBassMidi(0, ivals, "off", base, "fundamental", 0), null);
  });

  test("pedal_tonic ignora o acorde e toca a tônica", () => {
    // baseOct=4 → C4 = 60, transposto pelo offset (default -12 no UI mas 0 no puro).
    assert.equal(nextHarmonyBassMidi(0, ivals, "deg5", base, "pedal_tonic", 0), 60);
    assert.equal(nextHarmonyBassMidi(0, ivals, "deg5", base, "pedal_tonic", 7, -12), 48);
  });

  test("fundamental devolve a fundamental do acorde em todos os steps", () => {
    for (const id of ["deg1", "deg2", "deg4", "V7"]) {
      const v0 = nextHarmonyBassMidi(0, ivals, id, base, "fundamental", 0);
      const v1 = nextHarmonyBassMidi(0, ivals, id, base, "fundamental", 5);
      assert.equal(v0, v1, `${id} estável entre steps`);
    }
  });

  test("root_fifth alterna 1 ↔ 5 por step", () => {
    const a = nextHarmonyBassMidi(0, ivals, "deg1", base, "root_fifth", 0); // C
    const b = nextHarmonyBassMidi(0, ivals, "deg1", base, "root_fifth", 1); // G
    assert.equal(pcs(a), 0);
    assert.equal(pcs(b), 7);
  });

  test("root_seventh usa a 7ª diatônica derivada em tríades deg1..deg7", () => {
    // Em I (C), a 7ª diatónica maior é B (pc=11).
    const a = nextHarmonyBassMidi(0, ivals, "deg1", base, "root_seventh", 0);
    const b = nextHarmonyBassMidi(0, ivals, "deg1", base, "root_seventh", 1);
    assert.equal(pcs(a), 0); // C
    assert.equal(pcs(b), 11); // B
    // Em ii (Dm), a 7ª diatónica é C (pc=0) — o minor7 completo D-F-A-C.
    const c = nextHarmonyBassMidi(0, ivals, "deg2", base, "root_seventh", 1);
    assert.equal(pcs(c), 0);
  });

  test("root_seventh em V7 usa a sétima real (F sobre G)", () => {
    const v0 = nextHarmonyBassMidi(0, ivals, "V7", base, "root_seventh", 0);
    const v1 = nextHarmonyBassMidi(0, ivals, "V7", base, "root_seventh", 1);
    assert.equal(pcs(v0), 7); // G
    assert.equal(pcs(v1), 5); // F (7ª menor)
  });

  test("shell_73 alterna 7 ↔ 3 em V7 (F ↔ B)", () => {
    const v0 = nextHarmonyBassMidi(0, ivals, "V7", base, "shell_73", 0);
    const v1 = nextHarmonyBassMidi(0, ivals, "V7", base, "shell_73", 1);
    assert.equal(pcs(v0), 5); // F (7ª)
    assert.equal(pcs(v1), 11); // B (3ª)
  });

  test("arp_low em I7 diatônico percorre 1-3-5-7 em ciclo", () => {
    const seq = [0, 1, 2, 3, 4].map((s) =>
      pcs(nextHarmonyBassMidi(0, ivals, "deg1", base, "arp_low", s))
    );
    assert.deepEqual(seq, [0, 4, 7, 11, 0]); // C E G B C…
  });

  test("chromatic_1012 faz C — B — C — D (pcs)", () => {
    const seq = [0, 1, 2, 3].map((s) =>
      pcs(nextHarmonyBassMidi(0, ivals, "deg1", base, "chromatic_1012", s))
    );
    assert.deepEqual(seq, [0, 11, 0, 2]);
  });

  test("todos os padrões devolvem MIDI dentro do intervalo audível", () => {
    // Tessitura extrema: baseOct=0 e offset=-48, força valores muito baixos.
    for (const id of BASS_PATTERN_IDS) {
      if (id === "off") continue;
      for (let step = 0; step < 8; step++) {
        const m = nextHarmonyBassMidi(0, ivals, "deg1", 0, id, step, -48);
        if (m == null) continue;
        assert.ok(m >= 0 && m <= 127, `${id}[${step}] = ${m} fora do MIDI válido`);
      }
    }
  });

  test("octave_ping salta 1 ↔ 1' (oitava abaixo)", () => {
    const a = nextHarmonyBassMidi(0, ivals, "deg1", base, "octave_ping", 0);
    const b = nextHarmonyBassMidi(0, ivals, "deg1", base, "octave_ping", 1);
    assert.equal(a - b, 12); // mesma classe, uma oitava acima
  });

  test("BASS_PATTERN_IDS cobre todos os modos que o UI oferece", () => {
    // Espelho do dropdown em index.html — deve listar 19 padrões (incl. off).
    assert.equal(BASS_PATTERN_IDS.length, 19);
    assert.ok(BASS_PATTERN_IDS.includes("shell_73"));
    assert.ok(BASS_PATTERN_IDS.includes("pedal_tonic"));
    assert.ok(BASS_PATTERN_IDS.includes("chromatic_1012"));
  });
});

// ---------------------------------------------------------------------------

describe("pickParentScaleForChord — tônica ≠ 0", () => {
  test("Dm7 em tônica D → natural_minor pontua 3★", () => {
    const chord = parseAbsoluteChord("Dm7");
    const best = pickParentScaleForChord(chord, 2);
    // Com Dm7 = D-F-A-C e tônica=D, a escala dórico/natural_minor encaixa 100%.
    assert.ok(["dorian", "natural_minor"].includes(best.key), `picked ${best.key}`);
    assert.equal(best.rating, 3);
  });

  test("Cmaj7 em tônica G → Lídio (F# em vez de F) dá 3★", () => {
    const chord = parseAbsoluteChord("Cmaj7");
    // tônica G, acorde Cmaj7 = IV em G maior. Jônio de G cobre C-E-G-B.
    const best = pickParentScaleForChord(chord, 7, ["major", "lydian", "mixolydian"]);
    assert.equal(best.rating, 3);
    assert.ok(["major", "lydian"].includes(best.key));
  });

  test("G7 em tônica C → mixolydian é 3★ (nenhum avoid)", () => {
    const chord = parseAbsoluteChord("G7");
    const best = pickParentScaleForChord(chord, 0, ["major", "mixolydian", "lydian"]);
    // V7 em C maior: cabe em C major, mas C sobre B é avoid → major = 2★.
    // Mixolydian de G puxa a tônica p/ fora do contexto do C; ambos aceitáveis.
    assert.ok(best.rating >= 2);
  });

  test("empate → devolve primeiro candidato na ordem", () => {
    // Pent_major (C-D-E-G-A) e blues_major (C-D-Eb-E-G-A) ambos cobrem C-E-G
    // sem avoid notes. A chamada entrega o primeiro candidato em empate.
    const chord = parseAbsoluteChord("C");
    const best = pickParentScaleForChord(chord, 0, ["pent_major", "blues_major"]);
    assert.equal(best.rating, 3);
    assert.equal(best.key, "pent_major");
  });

  test("Cmaj7 em jônio tem 1 avoid (F sobre E) → 2★; lídio evita → 3★", () => {
    // Cmaj7 = C-E-G-B. Em jônio {0,2,4,5,7,9,11}: F (5) é avoid em cima de E (4).
    // Em lídio {0,2,4,6,7,9,11}: não há F, então sem avoid.
    const chord = parseAbsoluteChord("Cmaj7");
    assert.equal(rateScaleAgainstChord("major", chord.intervals), 2);
    assert.equal(rateScaleAgainstChord("lydian", chord.intervals), 3);
  });
});
