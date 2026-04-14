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
  // Harmonia
  HARMONY_REF_IVALS,
  harmonyRefIvals,
  harmonyMidis,
  // Ratings
  rateScaleAgainstChord,
  scaleStarsRender,
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
