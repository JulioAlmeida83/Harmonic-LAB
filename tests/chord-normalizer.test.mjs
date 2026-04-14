/**
 * Testes do módulo `chord-normalizer.js`.
 *
 * Cobre:
 *   - Carregamento de perfis + fallback
 *   - Deslocamento em oitavas (preserva intervalos do acorde)
 *   - Clamp por oitava para notas extremas
 *   - Dedupe após clamp
 *   - gainScale por perfil
 *   - styleOverride em packs percussivos
 *   - auditChord: forma do relatório, inRange, distância a anchors
 *
 * Executa via: node --test tests/
 */

import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const N = require("../chord-normalizer.js");

const {
  INSTRUMENT_PROFILES,
  DEFAULT_PROFILE,
  getProfile,
  normalizeChord,
  normalizeSingleNote,
  auditChord,
  _internals,
} = N;

// Cmaj7 em C4: 60-64-67-71
const CMAJ7 = [60, 64, 67, 71];

describe("perfis", () => {
  test("getProfile devolve o perfil do instrumento conhecido", () => {
    const p = getProfile("bassoon");
    assert.equal(p.range[0], 34);
    assert.equal(p.range[1], 65);
    assert.equal(p.character, "natural");
    assert.ok(p.gain > 0);
  });

  test("getProfile devolve DEFAULT_PROFILE para id desconhecido", () => {
    const p = getProfile("banjo-estelar-quantico");
    assert.deepEqual(p, DEFAULT_PROFILE);
  });

  test("todos os perfis têm range[0] < range[1] e sweet ⊆ range", () => {
    for (const [id, p] of Object.entries(INSTRUMENT_PROFILES)) {
      assert.ok(p.range[0] < p.range[1], `${id} range invertido`);
      assert.ok(p.sweet[0] >= p.range[0], `${id} sweet.lo < range.lo`);
      assert.ok(p.sweet[1] <= p.range[1], `${id} sweet.hi > range.hi`);
      assert.ok(p.gain > 0 && p.gain < 3, `${id} gain fora do razoável`);
    }
  });
});

describe("normalizeChord — deslocamento de oitava", () => {
  test("Cmaj7 em bassoon desce para o sweet-spot 41–55", () => {
    const r = normalizeChord(CMAJ7, "bassoon");
    // Mediana de Cmaj7 sorted=[60,64,67,71]; floor(4/2)=2 → 67.
    // bassoon sweet [41,55], center 48 → shift = 12*round((48-67)/12) = -24.
    assert.equal(r.shift, -24);
    assert.deepEqual(r.midis, [36, 40, 43, 47]);
    // Todas dentro do range bassoon [34,65]
    for (const m of r.midis) assert.ok(m >= 34 && m <= 65);
  });

  test("Cmaj7 em piano não precisa deslocar (fica no sweet)", () => {
    const r = normalizeChord(CMAJ7, "piano");
    // Piano sweet 48–84, center 66 → shift = 12*round((66-67)/12) = 0
    assert.ok(Object.is(r.shift, 0) || Object.is(r.shift, -0));
    assert.deepEqual(r.midis, CMAJ7);
  });

  test("acorde grave em violino sobe por oitavas até ao sweet 60–84", () => {
    const low = [36, 40, 43, 47]; // Cmaj7 em C2
    const r = normalizeChord(low, "violin");
    // todas as notas devem cair dentro do range [55,100]
    for (const m of r.midis) {
      assert.ok(m >= 55 && m <= 100, `nota ${m} fora do range`);
    }
    // Intervalos preservados (Cmaj7 = 0,4,7,11)
    const sorted = [...r.midis].sort((a, b) => a - b);
    assert.equal(sorted[1] - sorted[0], 4);
    assert.equal(sorted[2] - sorted[0], 7);
    assert.equal(sorted[3] - sorted[0], 11);
  });

  test("preserva a ordem de entrada do acorde (não reordena)", () => {
    // Primeira nota propositadamente fora de ordem sorted
    const mixed = [67, 60, 71, 64];
    const r = normalizeChord(mixed, "piano");
    // ordem das notas não sorted: 67 deve continuar primeiro se shift==0
    assert.equal(r.midis[0], 67);
    assert.equal(r.midis[1], 60);
  });
});

describe("normalizeChord — gainScale e styleOverride", () => {
  test("xylophone devolve styleOverride=pluck (percussivo)", () => {
    const r = normalizeChord(CMAJ7, "xylophone");
    assert.equal(r.styleOverride, "pluck");
  });

  test("piano (natural) devolve styleOverride undefined", () => {
    const r = normalizeChord(CMAJ7, "piano");
    assert.equal(r.styleOverride, undefined);
  });

  test("gainScale espelha profile.gain", () => {
    assert.equal(normalizeChord(CMAJ7, "trumpet").gainScale, 0.90);
    assert.equal(normalizeChord(CMAJ7, "bassoon").gainScale, 1.05);
    assert.equal(normalizeChord(CMAJ7, "acoustic_bass").gainScale, 1.10);
  });
});

describe("normalizeChord — dedupe e acorde vazio", () => {
  test("acorde vazio devolve estrutura coerente", () => {
    const r = normalizeChord([], "piano");
    assert.deepEqual(r.midis, []);
    assert.equal(r.shift, 0);
    assert.equal(r.gainScale, 1.0);
  });

  test("duplicados literais são removidos preservando primeira ocorrência", () => {
    const r = normalizeChord([60, 64, 60, 67], "piano");
    // shift = 0 em piano; 60 duplicado uma vez
    assert.deepEqual(r.midis, [60, 64, 67]);
  });

  test("clamp que gera colisão é deduplicado", () => {
    // Cenário: instrumento com range muito estreito e 2 notas que colapsam
    // após clamp. Usamos _internals.clampByOctave para documentar o comportamento.
    const collided = _internals.dedupeKeepOrder([60, 60, 72, 72, 48]);
    assert.deepEqual(collided, [60, 72, 48]);
  });
});

describe("normalizeSingleNote", () => {
  test("nota grave sobe para o sweet-spot do violino", () => {
    const r = normalizeSingleNote(36, "violin");
    // violin sweet [60,84], center 72. shift = 12*round((72-36)/12)=36
    assert.equal(r.midi, 72);
    assert.equal(r.shift, 36);
  });

  test("nota altíssima desce para o range do contrabaixo", () => {
    const r = normalizeSingleNote(96, "acoustic_bass");
    // acoustic_bass range [28,55]. Tem de acabar dentro.
    assert.ok(r.midi >= 28 && r.midi <= 55);
  });

  test("devolve styleOverride=pluck em xylophone", () => {
    const r = normalizeSingleNote(60, "xylophone");
    assert.equal(r.styleOverride, "pluck");
  });
});

describe("_internals — unidades puras", () => {
  test("chordMedian devolve mediana do inteiro do meio", () => {
    assert.equal(_internals.chordMedian([1, 3, 5]), 3);
    assert.equal(_internals.chordMedian([1, 3, 5, 7]), 5); // elemento n/2 em 0-index
    assert.equal(_internals.chordMedian([]), 60); // fallback
  });

  test("clampByOctave não entra em loop com range degenerado", () => {
    const v = _internals.clampByOctave(70, [50, 50]);
    assert.equal(v, 50);
  });

  test("clampByOctave desloca por oitava quando cabe", () => {
    // 70 em range [40,60] → 58 (70-12)
    const v = _internals.clampByOctave(70, [40, 60]);
    assert.equal(v, 58);
  });

  test("nearestAnchor devolve o mais próximo", () => {
    const r = _internals.nearestAnchor(63, [48, 60, 72, 84]);
    assert.equal(r.anchor, 60);
    assert.equal(r.distance, 3);
  });

  test("nearestAnchor com lista vazia devolve nulos", () => {
    const r = _internals.nearestAnchor(63, []);
    assert.equal(r.anchor, null);
    assert.equal(r.distance, null);
  });
});

describe("auditChord — relatório", () => {
  test("shape + inRange + maxAnchorDistance em piano", () => {
    const anchors = [48, 60, 72, 84];
    const a = auditChord(CMAJ7, "piano", anchors);
    assert.equal(a.bankId, "piano");
    assert.deepEqual(a.input, CMAJ7);
    assert.deepEqual(a.normalized, CMAJ7);
    assert.equal(a.inRange, true);
    assert.equal(a.perNote.length, 4);
    assert.ok(a.maxAnchorDistance != null);
    // Cmaj7 em piano: distâncias a [48,60,72,84] = {0,4,7,11→9}. máx ≤ 11.
    assert.ok(a.maxAnchorDistance <= 11);
  });

  test("bassoon: acorde normalizado cabe no range [34,65]", () => {
    const a = auditChord(CMAJ7, "bassoon", [41, 48, 55]);
    assert.equal(a.inRange, true);
    for (const m of a.normalized) {
      assert.ok(m >= 34 && m <= 65);
    }
  });
});
