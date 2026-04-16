/**
 * Harmonic Lab — motor de escalas (hepta-, penta-, hex-, octatônicas), romanos / graus na UI,
 * 8 slots + drone/harmonia, sequenciador de escala com ritmos.
 *
 * Núcleo teórico (constantes de escala, tríades, romanos, MIDI, harmonia,
 * ratings de compatibilidade) vive em `theory.js` e é injetado como globais
 * antes deste ficheiro.
 */

// -----------------------------------------------------------------------------
// Slots manuais — modelo unificado
// -----------------------------------------------------------------------------
// Cada slot representa UMA nota (grau + oitava). O nome do acorde/intervalo
// formado pela combinação dos slots ativos é detectado a partir das notas
// em tempo real (ver `describeActiveSlotsChord` + `findChordSymbolFromPcs`).
// Não há mais "por acorde" / "por grau": visualização única e comportamento
// único. As funções abaixo preservam a API antiga para minimizar ripple no
// resto do ficheiro.

/** Sempre devolve "chromatic" — a barra dos slots é agora cromática (12 notas). */
function currentSlotInputMode() {
  return "chromatic";
}

/**
 * Resolve o MIDI absoluto de um slot. Deliberadamente independente da escala
 * e do tónica: `s.pc` é a classe de altura cromática (0–11) escolhida pelo
 * usuário, e `s.oct` o deslocamento relativo à oitava-base dos slots. Assim
 * mudar a escala/tónica na UI não altera o que os slots tocam — a seleção
 * de nota fica "congelada" no momento em que foi feita.
 *
 * Parâmetros `tcp` / `ivals` mantidos na assinatura por retro-compat com
 * callers antigos (mas não são usados no cálculo).
 */
// eslint-disable-next-line no-unused-vars
function chordMidisFromSlotState(s, tcp, ivals, baseOct) {
  const pc = Number.isFinite(s?.pc) ? ((s.pc % 12) + 12) % 12 : 0;
  const oct = Number.isFinite(s?.oct) ? s.oct : 0;
  const rootMidi = pc + 12 * (baseOct + 1) + 12 * oct;
  return [wrapMidiToRange(rootMidi)];
}

/** Placeholder: sem seletor de modo para aplicar — apenas mantido. */
function applySlotInputModeChrome() {
  /* no-op (visualização unificada) */
}

function midiNoteLabel(midi, preferFl) {
  const o = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  return `${pcToName(pc, preferFl)}${o}`;
}

/** Intervalos simples (menor de 12 semitons) entre duas alturas. */
const DYAD_SIMPLE_NAMES = new Map([
  [0, "uníssono / oitava"],
  [1, "2ª menor"],
  [2, "2ª maior"],
  [3, "3ª menor"],
  [4, "3ª maior"],
  [5, "4ª justa"],
  [6, "trítono / 5ª dim."],
  [7, "5ª justa"],
  [8, "6ª menor"],
  [9, "6ª maior"],
  [10, "7ª menor"],
  [11, "7ª maior"],
]);

/** Modelos de acorde (intervalos a partir da fundamental); listar do mais específico ao mais simples. */
const SLOT_CHORD_TEMPLATES = [
  { ivs: [0, 2, 4, 7, 11], sym: "maj9" },
  { ivs: [0, 2, 4, 7, 10], sym: "9" },
  { ivs: [0, 2, 3, 7, 10], sym: "m9" },
  { ivs: [0, 4, 7, 11], sym: "maj7" },
  { ivs: [0, 4, 7, 10], sym: "7" },
  { ivs: [0, 3, 7, 10], sym: "m7" },
  { ivs: [0, 3, 6, 10], sym: "m7♭5" },
  { ivs: [0, 3, 6, 9], sym: "dim7" },
  { ivs: [0, 3, 7, 11], sym: "mMaj7" },
  { ivs: [0, 4, 7, 9], sym: "6" },
  { ivs: [0, 3, 7, 9], sym: "m6" },
  { ivs: [0, 2, 4, 7], sym: "add9" },
  { ivs: [0, 4, 7], sym: "" },
  { ivs: [0, 3, 7], sym: "m" },
  { ivs: [0, 3, 6], sym: "dim" },
  { ivs: [0, 4, 8], sym: "aug" },
  { ivs: [0, 5, 7], sym: "sus4" },
  { ivs: [0, 2, 7], sym: "sus2" },
];

function ivsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function intervalsFromRoot(rootPc, pcSetSorted) {
  const xs = pcSetSorted.map((p) => (p - rootPc + 12) % 12);
  return [...new Set(xs)].sort((a, b) => a - b);
}

function findChordSymbolFromPcs(pcSetSorted, bassPc, preferFl) {
  if (pcSetSorted.length < 2) return null;
  const hits = [];
  for (const root of pcSetSorted) {
    const ivs = intervalsFromRoot(root, pcSetSorted);
    for (const t of SLOT_CHORD_TEMPLATES) {
      if (ivsEqual(ivs, t.ivs)) {
        hits.push({
          root,
          sym: t.sym,
          tier: t.ivs.length,
          bassOk: root === bassPc ? 1 : 0,
        });
      }
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.tier - a.tier || b.bassOk - a.bassOk || a.root - b.root);
  const best = hits[0];
  let out = `${pcToName(best.root, preferFl)}${best.sym}`;
  if (bassPc !== best.root) out += `/${pcToName(bassPc, preferFl)}`;
  return out;
}

function dyadLabel(mLow, mHigh, preferFl) {
  const diff = mHigh - mLow;
  const simple = ((diff % 12) + 12) % 12;
  const oct = Math.floor(diff / 12);
  const nm = DYAD_SIMPLE_NAMES.get(simple) ?? `${simple} st`;
  const intDesc = oct > 0 ? `${nm} (+${oct}×8)` : nm;
  const n0 = midiNoteLabel(mLow, preferFl);
  const n1 = midiNoteLabel(mHigh, preferFl);
  return `${n0}–${n1} (${intDesc})`;
}

/** Analisa a combinação de MIDI dos slots ativos (mesma base que o áudio). */
function describeActiveSlotsChord(midis, preferFl) {
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  if (!sorted.length) return { head: "—", detail: "" };
  const pcs = [...new Set(sorted.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b);
  const bassPc = ((sorted[0] % 12) + 12) % 12;
  const voicing = sorted.map((m) => midiNoteLabel(m, preferFl)).join(" – ");

  if (pcs.length === 1) {
    return {
      head: `${midiNoteLabel(sorted[0], preferFl)} (nota única)`,
      detail: "Ative mais slots para formar intervalos ou acordes.",
    };
  }
  if (pcs.length === 2) {
    return {
      head: dyadLabel(sorted[0], sorted[sorted.length - 1], preferFl),
      detail: "",
    };
  }

  const sym = findChordSymbolFromPcs(pcs, bassPc, preferFl);
  if (sym) {
    return {
      head: sym,
      detail: `Voicing (baixo → agudo): ${voicing}`,
    };
  }
  const classes = pcs.map((p) => pcToName(p, preferFl)).join(" · ");
  return {
    head: `Sonoridade (${classes})`,
    detail: `Registro real: ${voicing}`,
  };
}

/**
 * Atualiza o "display" dos slots com o nome do acorde/intervalo/nota
 * formado pela combinação atual. O header grande (`#slotsChordHeader`)
 * mostra o símbolo principal (ex.: "Cmaj7"); o subheader descreve o tipo
 * (Acorde/Intervalo/Nota) e lista as notas em classe; a linha inferior
 * (`#slotChordVoicing`) detalha o voicing registrado. Quando nenhum
 * slot está ativo, entra em estado "vazio" (placeholder discreto).
 */
function updateSlotChordLabel() {
  const head = document.getElementById("slotsChordHeader");
  const sub = document.getElementById("slotsChordSubhead");
  const wrap = head ? head.parentElement : null;
  const el = document.getElementById("slotChordVoicing");
  const states = readSlotsState();
  const active = states.filter((s) => s.on);
  const tcp = currentTonicPc();
  const ivals = currentIvals();
  const pf = preferFlats();
  const base = slotsPlaybackBaseOct();

  if (!active.length) {
    if (head) head.textContent = "— sem slots ativos —";
    if (sub) {
      sub.textContent =
        "Ligue um ou mais slots: o nome do acorde formado aparece aqui.";
    }
    if (wrap) wrap.classList.add("is-empty");
    if (el) {
      el.textContent = "";
      el.classList.add("slots-chord--empty");
    }
    return;
  }

  const midis = [];
  active.forEach((s) => {
    chordMidisFromSlotState(s, tcp, ivals, base).forEach((m) => midis.push(m));
  });
  const { head: label, detail } = describeActiveSlotsChord(midis, pf);
  // Classes únicas presentes (pc) para distinguir nota/intervalo/acorde.
  const pcs = [...new Set(midis.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b);
  const kind = pcs.length >= 3 ? "Acorde" : pcs.length === 2 ? "Intervalo" : "Nota";
  const classLine = pcs.map((p) => pcToName(p, pf)).join(" · ");

  if (wrap) wrap.classList.remove("is-empty");
  if (head) head.textContent = label || "—";
  if (sub) {
    sub.textContent = pcs.length === 1
      ? `${kind} única · ${classLine}`
      : `${kind} · ${classLine}`;
  }
  if (el) {
    if (detail) {
      el.textContent = detail;
      el.classList.remove("slots-chord--empty");
    } else {
      el.textContent = "";
      el.classList.add("slots-chord--empty");
    }
  }
}

// --- Harmonia base (DOM adapters) -------------------------------------------

/** Silencia só o acorde no bus de amostras da harmonia (mantém baixo). */
function harmonyChordSamplesMuted() {
  return document.getElementById("harmonyMuteChords")?.checked ?? false;
}

/**
 * Array ordenado de pitch-classes (0..11) do acorde da harmonia base atual,
 * relativo à tônica, na ordem [fundamental, 3ª, 5ª, 7ª?]. Retorna `null` se
 * harmonia está desligada.
 */
function currentChordPCsArray() {
  const harmId = document.getElementById("harmonyBase")?.value || "off";
  if (harmId === "off") return null;
  const tcp = currentTonicPc();
  // Acorde de referência é sempre diatónico da maior — estável independente
  // da escala selecionada (coerente com o som emitido).
  const midis = harmonyMidis(tcp, harmonyRefIvals(), harmId, 4);
  if (!midis.length) return null;
  return midis.map((m) => (((m - tcp) % 12) + 12) % 12);
}

/**
 * Atualiza o texto das <option> do #scaleType com o rating atual.
 * Sem harmonia selecionada, mostra só o nome (sem estrelas).
 */
function updateScaleStarLabels() {
  const select = document.getElementById("scaleType");
  if (!select) return;
  const chordPCs = currentChordPCsArray();
  for (const opt of select.options) {
    const key = opt.value;
    const base = SCALE_TYPES[key]?.label || key;
    if (!chordPCs || !chordPCs.length) {
      opt.textContent = base;
      opt.removeAttribute("data-fit");
    } else {
      const r = rateScaleAgainstChord(key, chordPCs);
      opt.textContent = `${scaleStarsRender(r)}  ${base}`;
      opt.setAttribute("data-fit", String(r));
    }
  }
  syncSoloScaleOptionLabelsFromGlobal();
}

/** Com «harmonia desligada», baixo pode usar tríade em I como referência. */
function effectiveHarmonyIdForBassSamples(harmId) {
  if (harmId !== "off") return harmId;
  if (document.getElementById("bassWithHarmonyOff")?.checked) return "deg1";
  return "off";
}

/** Escala usada nas frases de solo (select próprio ou a global «Escala completa»). */
function effectiveSoloScaleKey() {
  const soloSel = document.getElementById("soloScaleType")?.value;
  if (soloSel) return soloSel;
  return document.getElementById("scaleType")?.value || "major";
}

/**
 * Intervalos para harmonia estática e baixo quando «Base harmónica na escala do solo»
 * está activo — alinha graus I–VII à escala escolhida para o solo.
 */
function effectiveStaticHarmonyIvals() {
  if (!document.getElementById("soloAlignHarmonyWithScale")?.checked) {
    return harmonyRefIvals();
  }
  const iv = SCALE_TYPES[effectiveSoloScaleKey()]?.intervals;
  return iv && iv.length ? iv : harmonyRefIvals();
}

/** Padrão rítmico/arpejo: sequência activa usa `progHarmonyStyle`; caso contrário `harmonyStyle`. */
function effectiveHarmonyExecStyle() {
  if (getActiveProgressionStep()) {
    const p = document.getElementById("progHarmonyStyle")?.value;
    if (p) return p;
  }
  return document.getElementById("harmonyStyle")?.value || "sustain";
}

/** Tríade na tônica coerente com o tipo de escala (para solo sem progressão). */
function buildTonicTriadChordFromScale(tonicPc, scaleKey) {
  const iv = SCALE_TYPES[scaleKey]?.intervals || SCALE_TYPES.major.intervals;
  if (iv.length >= 7) {
    const { third, fifth } = diatonicTriadSemitonesFromRoot(iv, 0);
    return { rootPc: tonicPc, intervals: [0, third, fifth], label: "I" };
  }
  if (scaleKey === "pent_minor" || scaleKey === "blues") {
    return { rootPc: tonicPc, intervals: [0, 3, 7], label: "I" };
  }
  return { rootPc: tonicPc, intervals: [0, 4, 7], label: "I" };
}

/** Teto e chão MIDI para qualquer linha de solo (instrumentos melódicos). */
const SOLO_MELODY_MIDI_ABS_MIN = 36; // C2
const SOLO_MELODY_MIDI_ABS_MAX = 96; // C7

/**
 * Janela de oitavas centrada na fundamental do acorde no registo escolhido na UI.
 * Padrões com saltos grandes são corrigidos com `wrapMidiToRange` (mantém classes de altura).
 */
function soloMelodyMidiWindow(chordRootPc, soloOctUi) {
  const rootPc = ((Number(chordRootPc) % 12) + 12) % 12;
  let o = Number(soloOctUi);
  if (!Number.isFinite(o)) o = 4;
  o = Math.max(2, Math.min(6, Math.round(o)));
  const rootBase = 12 * (o + 1) + rootPc;
  const spanDown = 14;
  const spanUp = 26;
  let lo = rootBase - spanDown;
  let hi = rootBase + spanUp;
  lo = Math.max(SOLO_MELODY_MIDI_ABS_MIN, lo);
  hi = Math.min(SOLO_MELODY_MIDI_ABS_MAX, hi);
  if (hi <= lo) hi = Math.min(SOLO_MELODY_MIDI_ABS_MAX, lo + 24);
  return { lo, hi };
}

/** Aplica limites de tessitura a cada nota de solo (todos os padrões / ritmos). */
function soloMidiToPlayableRange(rawMidi, chordRootPc, soloOctUi) {
  const { lo, hi } = soloMelodyMidiWindow(chordRootPc, soloOctUi);
  if (hi <= lo) return clampMidi(rawMidi);
  return clampMidi(wrapMidiToRange(rawMidi, lo, hi));
}

/**
 * Acorde + escala para o motor de solo: progressão ou tríade I na tonalidade.
 * «Seguir sequência» só tem efeito com «Ativar sequência» e passos resolvidos;
 * caso contrário cai na tonalidade (não é preciso ligar a progressão para ouvir solo).
 */
function resolveSoloChordAndScale(tcp) {
  const mode = document.getElementById("soloContextMode")?.value ?? "static_key";
  const progStep = getActiveProgressionStep();
  const progOk =
    mode === "progression" &&
    progState.enabled &&
    progState.resolved.length > 0 &&
    progStep?.step?.chord;
  if (progOk) {
    const chord = progStep.step.chord;
    const scaleResult = pickParentScaleForChord(chord, tcp);
    const scaleKey = scaleResult?.key || "major";
    const scaleIvals = SCALE_TYPES[scaleKey]?.intervals || SCALE_TYPES.major.intervals;
    return { chord, scaleIvals, scaleKey, fromProgression: true };
  }
  const scaleKey = effectiveSoloScaleKey();
  const scaleIvals = SCALE_TYPES[scaleKey]?.intervals || SCALE_TYPES.major.intervals;
  const chord = buildTonicTriadChordFromScale(tcp, scaleKey);
  return { chord, scaleIvals, scaleKey, fromProgression: false };
}

function populateProgHarmonyStyleSelect() {
  const src = document.getElementById("harmonyStyle");
  const dst = document.getElementById("progHarmonyStyle");
  if (!src || !dst || dst.options.length) return;
  dst.innerHTML = src.innerHTML;
  dst.value = src.value || "sustain";
}

function populateSoloScaleSelect() {
  const scaleType = document.getElementById("scaleType");
  const solo = document.getElementById("soloScaleType");
  if (!scaleType || !solo) return;
  const prev = solo.value;
  solo.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "Igual à escala global («Escala completa»)";
  solo.appendChild(o0);
  for (const child of scaleType.children) {
    solo.appendChild(child.cloneNode(true));
  }
  const valid = prev && [...solo.options].some((o) => o.value === prev);
  solo.value = valid ? prev : "";
}

function syncSoloScaleOptionLabelsFromGlobal() {
  const solo = document.getElementById("soloScaleType");
  const globalSel = document.getElementById("scaleType");
  if (!solo || !globalSel) return;
  for (let i = 0; i < solo.options.length; i += 1) {
    const opt = solo.options[i];
    if (!opt.value) continue;
    const ref = [...globalSel.options].find((o) => o.value === opt.value);
    if (ref) opt.textContent = ref.textContent;
  }
}

/** Cenas pré-definidas: escala solo, harmonia, padrões e opcionalmente progressão. */
function applySoloScenePreset(key) {
  if (!key) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el || val === undefined || val === null) return;
    if (el.type === "checkbox") {
      el.checked = Boolean(val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const presets = {
    static_major_walk: () => {
      setVal("soloContextMode", "static_key");
      const pe0 = document.getElementById("progEnabled");
      if (pe0?.checked) {
        pe0.checked = false;
        pe0.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setVal("soloScaleType", "");
      setVal("scaleType", "major");
      setVal("soloAlignHarmonyWithScale", true);
      setVal("harmonyBase", "deg1");
      setVal("harmonyStyle", "sustain");
      setVal("progHarmonyStyle", "strum_ballad");
      setVal("soloPattern", "scale_up");
      setVal("soloRhythm", "eighths");
    },
    static_dorian_groove: () => {
      setVal("soloContextMode", "static_key");
      const pe0 = document.getElementById("progEnabled");
      if (pe0?.checked) {
        pe0.checked = false;
        pe0.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setVal("soloScaleType", "dorian");
      setVal("soloAlignHarmonyWithScale", true);
      setVal("harmonyBase", "deg1");
      setVal("harmonyStyle", "chord_pulse_8");
      setVal("progHarmonyStyle", "strum_rock_8");
      setVal("soloPattern", "skip_scale");
      setVal("soloRhythm", "eighths");
    },
    static_pent_blues: () => {
      setVal("soloContextMode", "static_key");
      const pe0 = document.getElementById("progEnabled");
      if (pe0?.checked) {
        pe0.checked = false;
        pe0.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setVal("soloScaleType", "pent_minor");
      setVal("soloAlignHarmonyWithScale", true);
      setVal("harmonyBase", "deg1");
      setVal("harmonyStyle", "pluck");
      setVal("progHarmonyStyle", "strum_rock_8");
      setVal("soloPattern", "pent_blue");
      setVal("soloRhythm", "swing");
    },
    static_bossa_line: () => {
      setVal("soloContextMode", "static_key");
      const pe0 = document.getElementById("progEnabled");
      if (pe0?.checked) {
        pe0.checked = false;
        pe0.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setVal("soloScaleType", "mixolydian");
      setVal("soloAlignHarmonyWithScale", true);
      setVal("harmonyBase", "deg1");
      setVal("harmonyStyle", "strum_bossa");
      setVal("progHarmonyStyle", "strum_bossa");
      setVal("soloPattern", "enclosure");
      setVal("soloRhythm", "bossa");
    },
    prog_pop_ivvi: () => {
      setVal("soloContextMode", "progression");
      progLoadPreset("I_V_vi_IV_pop");
      const pe = document.getElementById("progEnabled");
      if (pe && !pe.checked) {
        pe.checked = true;
        pe.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setVal("soloAlignHarmonyWithScale", false);
      setVal("harmonyStyle", "sustain");
      setVal("progHarmonyStyle", "strum_ballad");
      setVal("soloPattern", "digital_1235");
      setVal("soloRhythm", "swing");
      setVal("scaleType", "major");
    },
    prog_blues12: () => {
      setVal("soloContextMode", "progression");
      progLoadPreset("blues_12_major");
      const pe = document.getElementById("progEnabled");
      if (pe && !pe.checked) {
        pe.checked = true;
        pe.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setVal("soloScaleType", "mixolydian");
      setVal("soloAlignHarmonyWithScale", false);
      setVal("progHarmonyStyle", "strum_rock_8");
      setVal("harmonyStyle", "pluck");
      setVal("soloPattern", "pent");
      setVal("soloRhythm", "shuffle");
    },
    prog_iiV_I: () => {
      setVal("soloContextMode", "progression");
      progLoadPreset("ii_V_I_major");
      const pe = document.getElementById("progEnabled");
      if (pe && !pe.checked) {
        pe.checked = true;
        pe.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setVal("soloAlignHarmonyWithScale", false);
      setVal("progHarmonyStyle", "strum_charleston");
      setVal("harmonyStyle", "sustain");
      setVal("soloPattern", "digital_1235");
      setVal("soloRhythm", "swing");
      setVal("scaleType", "major");
    },
  };
  const fn = presets[key];
  if (fn) fn();
  populateSoloScaleSelect();
  syncSoloScaleOptionLabelsFromGlobal();
  refreshSampleExecutionLoop();
}

/** Deslocamento em semitonos (múltiplos de 12 na UI) aplicado às notas de baixo. */
function readHarmonyBassSemitoneOffset() {
  const v = Number(document.getElementById("harmonyBassOctave")?.value ?? -12);
  if (!Number.isFinite(v)) return -12;
  return Math.max(-48, Math.min(24, v));
}

// Nota: a escolha da nota de baixo vive agora em `nextHarmonyBassMidi`
// (theory.js). O single caller abaixo (syncAudio / sampleBass) passa o
// offset em semitonos lido do DOM via `readHarmonyBassSemitoneOffset`.

// --- Áudio -----------------------------------------------------------------

/** Ganho linear do `masterMix` em 100% no controlo «Ganho saída». */
const AUDIO_MASTER_NOMINAL = 0.44;

/** Aplica o slider #masterGain ao nó master (só com contexto criado). */
function applyMasterGainFromUI() {
  if (!audio.ctx) return;
  const raw = Number(document.getElementById("masterGain")?.value ?? 100);
  const pct = Number.isFinite(raw) ? raw : 100;
  const mul = Math.max(0, Math.min(2.5, pct / 100));
  audio.setMaster(AUDIO_MASTER_NOMINAL * mul);
}

/** Impulso simples (ruído em decaimento) para um reverb leve e “sala”. */
function makeReverbIR(ctx, seconds = 1.15) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c += 1) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i += 1) {
      const t = i / len;
      const decay = (1 - t) ** 2.2;
      d[i] = (Math.random() * 2 - 1) * decay * 0.9;
    }
  }
  return buf;
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.masterMix = null;
    this.masterLimiter = null;
    this.drone = { osc: null, lpf: null, gain: null };
    this.harm = { oscs: [], bus: null };
    this.slots = [];
    this.seqTimer = null;
    this.seqGain = null;
    this.seqOsc = null;
    this.seqLpf = null;
    this.scaleSampleBus = null;
    this.harmStabBus = null;
    this.instrumentSampler = null;
    // Sampler dedicado ao baixo. Lazy: só criado quando o user escolhe banco
    // ≠ principal (ver ensureBassSampler/syncBassBankSamplerFromUI). Quando
    // null, o baixo usa o instrumentSampler principal — zero overhead.
    this.bassSampler = null;
    this._harmStabPrimed = false;
    this._harmStabKey = "";
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      throw new Error("Web Audio API não suportada neste navegador.");
    }
    this.ctx = new Ctx();

    this.masterMix = this.ctx.createGain();
    this.masterMix.gain.value = AUDIO_MASTER_NOMINAL;
    this.master = this.masterMix;

    // Compressor / limitador de segurança no barramento master. Absorve picos
    // quando o usuário leva «Volume geral» a 200–250% com vários buses ativos.
    // Ataque rápido + knee suave + threshold moderado: transparente na maioria
    // dos programas, só age nos picos.
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -6; // dB
    this.masterLimiter.knee.value = 12; // dB (suavizado)
    this.masterLimiter.ratio.value = 8; // 8:1 — quase um limitador
    this.masterLimiter.attack.value = 0.004; // 4 ms
    this.masterLimiter.release.value = 0.18; // 180 ms

    const dry = this.ctx.createGain();
    dry.gain.value = 0.86;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.09;
    const conv = this.ctx.createConvolver();
    conv.buffer = makeReverbIR(this.ctx, 1.2);
    conv.normalize = true;

    // master → limiter → (dry + wet via convolver) → destination
    this.masterMix.connect(this.masterLimiter);
    this.masterLimiter.connect(dry);
    dry.connect(this.ctx.destination);
    this.masterLimiter.connect(conv);
    conv.connect(wet);
    wet.connect(this.ctx.destination);

    // Tap de gravação: MediaStreamDestination recebe o mesmo sinal pós-reverb
    // que vai ao destino. Sem efeito audível — MediaStreamDestination só emite
    // quando um MediaRecorder/consumer subscreve o stream.
    this.recDest = this.ctx.createMediaStreamDestination();
    dry.connect(this.recDest);
    wet.connect(this.recDest);

    /* Drone: seno suave + corte grave (menos “electrónico”) */
    this.drone.lpf = this.ctx.createBiquadFilter();
    this.drone.lpf.type = "lowpass";
    this.drone.lpf.frequency.value = 520;
    this.drone.lpf.Q.value = 0.28;
    this.drone.gain = this.ctx.createGain();
    this.drone.gain.gain.value = 0;
    this.drone.osc = this.ctx.createOscillator();
    this.drone.osc.type = "sine";
    this.drone.osc.connect(this.drone.lpf);
    this.drone.lpf.connect(this.drone.gain);
    this.drone.gain.connect(this.masterMix);
    this.drone.osc.start();

    /* Harmonia: triângulo filtrado (tipo pad) */
    this.harm.bus = this.ctx.createGain();
    this.harm.bus.gain.value = 1;
    this.harm.bus.connect(this.masterMix);
    for (let i = 0; i < 4; i += 1) {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1180 + i * 140;
      lp.Q.value = 0.55;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      o.connect(lp);
      lp.connect(g);
      g.connect(this.harm.bus);
      o.start();
      this.harm.oscs.push({ osc: o, lpf: lp, gain: g });
    }

    /* Slots: duas senoides em coro + passa-baixo dinâmico */
    for (let i = 0; i < 8; i += 1) {
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      o1.type = "sine";
      o2.type = "sine";
      const d1 = this.ctx.createGain();
      const d2 = this.ctx.createGain();
      d1.gain.value = 0.42;
      d2.gain.value = 0.42;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      lp.Q.value = 0.5;
      const env = this.ctx.createGain();
      env.gain.value = 0;
      o1.connect(d1);
      o2.connect(d2);
      d1.connect(lp);
      d2.connect(lp);
      lp.connect(env);
      env.connect(this.masterMix);
      o1.start();
      o2.start();
      this.slots.push({ osc: [o1, o2], lpf: lp, gain: env });
    }

    /* Sequência de escala */
    this.seqLpf = this.ctx.createBiquadFilter();
    this.seqLpf.type = "lowpass";
    this.seqLpf.frequency.value = 3800;
    this.seqLpf.Q.value = 0.45;
    this.seqOsc = this.ctx.createOscillator();
    this.seqOsc.type = "triangle";
    this.seqGain = this.ctx.createGain();
    this.seqGain.gain.value = 0;
    this.seqOsc.connect(this.seqLpf);
    this.seqLpf.connect(this.seqGain);
    this.seqGain.connect(this.masterMix);
    this.seqOsc.start();

    this.scaleSampleBus = this.ctx.createGain();
    this.scaleSampleBus.gain.value = 1;
    this.scaleSampleBus.connect(this.masterMix);

    this.harmStabBus = this.ctx.createGain();
    this.harmStabBus.gain.value = 0.58;
    this.harmStabBus.connect(this.masterMix);

    if (typeof globalThis.HLInstrumentSampler === "function") {
      this.instrumentSampler = new globalThis.HLInstrumentSampler(this.ctx);
    }
  }

  /**
   * "Unlock" do AudioContext em iOS Safari + Android Chrome.
   *
   * Em iOS, criar o AudioContext num gesto não basta: o output só passa a
   * mexer depois de tocar pelo menos um buffer através do `destination`. Sem
   * isto o `state` aparece como "running" mas os altifalantes ficam mudos.
   * Tocamos um buffer silencioso de 1 sample como "primer".
   *
   * Adicionalmente: em iOS o switch de silêncio do telemóvel mute-a o
   * WebAudio por defeito (o áudio é tratado como "ringer", não como "media").
   * Anexamos um <audio> com um WAV silencioso em loop e tentamos `play()` —
   * isso obriga o iOS a tratar a app como reprodução de media e bypassa o
   * switch de silêncio. Se falhar (ex.: política do browser), continuamos
   * — pelo menos no modo "ringer ligado" haverá som.
   *
   * Deve ser chamado SEMPRE dentro do mesmo turn de gesto que iniciou o
   * `ensure()` — caso contrário iOS rejeita.
   */
  /**
   * Destranca o pipeline de áudio em iOS Safari.
   *
   * Em iOS 17/18 a "transient activation" do gesto expira no primeiro `await`.
   * Tudo o que depende do gesto (primer via BufferSource.start, HTMLAudioElement.play
   * para bypassar o switch de silêncio) TEM de correr SINCRONAMENTE antes de
   * qualquer `await`. Por isso esta função NÃO é async — faz o trabalho-gesto
   * síncrono e devolve a promise de `ctx.resume()` para o caller esperar.
   */
  unlockOnGesture() {
    if (!this.ctx) return Promise.resolve();
    // --- SÍNCRONO (ainda dentro do gesto) -----------------------------------
    // 1) Primer silencioso: obriga o output de iOS a "arrancar". BufferSource
    //    agendado aqui é aceite mesmo antes de resume(); dispara assim que o
    //    contexto estiver running.
    try {
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
      src.stop(this.ctx.currentTime + 0.001);
    } catch (_) { /* defensivo */ }

    // 2) HTMLAudioElement em loop com WAV silencioso — força iOS a tratar a
    //    página como "media playback" e bypassa o switch de silêncio do
    //    iPhone. TEM de acontecer dentro do gesto. Criado uma única vez.
    if (!this._silenceKeepAlive) {
      try {
        const a = new Audio();
        a.loop = true;
        a.muted = false;
        a.volume = 0.0001; // praticamente inaudível
        a.setAttribute("playsinline", "");
        a.setAttribute("webkit-playsinline", "");
        a.setAttribute("preload", "auto");
        // WAV PCM 8-bit mono 8kHz, 1 sample (0x80 = silêncio unsigned). Mais
        // curto que o anterior mas com data-chunk válido — iOS rejeitava
        // a versão com 0 bytes de data. Ao reproduzir em loop, cobre o ctx.
        a.src =
          "data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA";
        const p = a.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => { /* falhou o bypass; ringer ligado continua a funcionar */ });
        }
        this._silenceKeepAlive = a;
      } catch (_) { /* sem Audio() — não-bloqueante */ }
    }

    // --- ASYNC (podemos esperar depois) -------------------------------------
    // 3) resume(): chamado de forma síncrona (devolve promise imediata), quem
    //    nos chamou decide se aguarda. Aqui o await seria o primeiro break
    //    do gesto — evitamos, para garantir que 1) e 2) já dispararam.
    if (this.ctx.state !== "running") {
      try {
        const p = this.ctx.resume();
        return (p && typeof p.then === "function") ? p.catch(() => {}) : Promise.resolve();
      } catch (_) {
        return Promise.resolve();
      }
    }
    return Promise.resolve();
  }

  /** Silencia imediatamente todas as vozes (útil antes de suspend). */
  hardMute() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const mute = (gp) => {
      gp.cancelScheduledValues(t);
      gp.setValueAtTime(0, t);
    };
    mute(this.drone.gain.gain);
    this.harm.oscs.forEach(({ gain }) => mute(gain.gain));
    this.slots.forEach(({ gain }) => mute(gain.gain));
    mute(this.seqGain.gain);
    if (this.scaleSampleBus) mute(this.scaleSampleBus.gain);
    if (this.harmStabBus) mute(this.harmStabBus.gain);
    if (this.instrumentSampler && typeof this.instrumentSampler.stopAllVoices === "function") {
      this.instrumentSampler.stopAllVoices();
    }
  }

  /**
   * Mute imediato de um bus específico + corte das vozes do sampler
   * que foram lá enviadas. Usado por handlers de toggle (progressão,
   * slots, mute all) para garantir silêncio instantâneo.
   */
  silenceBus(bus, fadeSec = 0.02) {
    if (!this.ctx || !bus) return;
    const t = this.ctx.currentTime;
    const fade = Math.max(0.005, fadeSec);
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + fade);
    bus.gain.setValueAtTime(0, t + fade + 0.005);
  }

  /** Corta todas as vozes activas do sampler (amostras em decaimento). */
  stopSamplerVoices(fadeSec = 0.02) {
    if (this.instrumentSampler && typeof this.instrumentSampler.stopAllVoices === "function") {
      this.instrumentSampler.stopAllVoices(fadeSec);
    }
  }

  setMaster(v) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setDrone(on, freq, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gp = this.drone.gain.gain;
    this.drone.osc.frequency.setValueAtTime(freq, t);
    gp.cancelScheduledValues(t);
    gp.setValueAtTime(gp.value, t);
    const target = on && vol > 0 ? vol : 0;
    gp.linearRampToValueAtTime(target, t + 0.03);
  }

  setHarmony(freqs, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.harm.oscs.length; i += 1) {
      const { osc, lpf, gain } = this.harm.oscs[i];
      const gp = gain.gain;
      gp.cancelScheduledValues(t);
      gp.setValueAtTime(gp.value, t);
      if (i < freqs.length && vol > 0) {
        const fq = freqs[i];
        osc.frequency.setValueAtTime(fq, t);
        const cut = Math.min(3400, Math.max(380, fq * 1.35));
        lpf.frequency.cancelScheduledValues(t);
        lpf.frequency.setValueAtTime(lpf.frequency.value, t);
        lpf.frequency.linearRampToValueAtTime(Math.max(120, cut), t + 0.06);
        gp.linearRampToValueAtTime(vol, t + 0.045);
      } else {
        gp.linearRampToValueAtTime(0, t + 0.03);
      }
    }
  }

  setSlot(i, on, freq, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { osc, lpf, gain } = this.slots[i];
    const cents = 6.5;
    const f1 = freq * 2 ** (-cents / 1200);
    const f2 = freq * 2 ** (cents / 1200);
    osc[0].frequency.setValueAtTime(f1, t);
    osc[1].frequency.setValueAtTime(f2, t);
    const midi = 69 + 12 * Math.log2(freq / 440);
    const cut = Math.min(5600, Math.max(380, 420 + midi * 34));
    lpf.frequency.cancelScheduledValues(t);
    lpf.frequency.setValueAtTime(lpf.frequency.value, t);
    lpf.frequency.linearRampToValueAtTime(Math.max(120, cut), t + 0.06);
    const gp = gain.gain;
    gp.cancelScheduledValues(t);
    gp.setValueAtTime(gp.value, t);
    const target = on && vol > 0 ? vol : 0;
    const ramp = target > 0 ? 0.05 : 0.035;
    gp.linearRampToValueAtTime(target, t + ramp);
  }

  /**
   * @param {{ muteSampleBus?: boolean }} [o]
   * Em modo amostras a escala não deve pôr o bus das amostras a 0 logo antes das notas (ficava mudo).
   */
  stopScale(o = {}) {
    const muteSampleBus = o.muteSampleBus !== false;
    if (this.seqTimer) {
      clearTimeout(this.seqTimer);
      this.seqTimer = null;
    }
    if (this.ctx && this.seqGain) {
      const t = this.ctx.currentTime;
      this.seqGain.gain.cancelScheduledValues(t);
      this.seqGain.gain.setValueAtTime(0, t);
    }
    if (this.ctx && this.scaleSampleBus && muteSampleBus) {
      const t = this.ctx.currentTime;
      this.scaleSampleBus.gain.cancelScheduledValues(t);
      this.scaleSampleBus.gain.setValueAtTime(0, t);
    }
  }

  /** Agenda a escala com oscilador (comportamento original). */
  _scheduleSynthScaleSteps(t0, freqs, times, durs, gain) {
    this.seqGain.gain.cancelScheduledValues(t0);
    this.seqGain.gain.setValueAtTime(0, t0);
    for (let i = 0; i < freqs.length; i += 1) {
      const start = t0 + times[i];
      const dur = durs[i] ?? 0.12;
      const g = gain;
      const fq = freqs[i];
      this.seqOsc.frequency.setValueAtTime(fq, start);
      if (this.seqLpf) {
        const cut = Math.min(5200, Math.max(900, fq * 1.25));
        this.seqLpf.frequency.setValueAtTime(cut, start);
      }
      this.seqGain.gain.setValueAtTime(0, start);
      this.seqGain.gain.linearRampToValueAtTime(g, start + 0.028);
      this.seqGain.gain.linearRampToValueAtTime(0, start + dur);
    }
  }

  /**
   * @param {{
   *   freqs: number[], times: number[], durs: number[], gain: number,
   *   mode?: string, midis?: number[], sampler?: object,
   *   t0?: number,       // tempo absoluto de arranque; se omitido, usa currentTime + 0.06
   *   latch?: boolean,   // se true, alinha o arranque ao próximo beat global (requer bpm)
   *   bpm?: number,      // BPM para cálculo do próximo beat quando latch=true
   * }} opts
   * @returns {Promise<number>} t0 absoluto efectivamente usado para agendar
   */
  async playScaleSequence(opts) {
    const { freqs, times, durs, gain, mode, midis, sampler, latch, bpm } = opts;
    const isSample = mode === "sample" && sampler && Array.isArray(midis) && midis.length === freqs.length;
    this.stopScale({ muteSampleBus: !isSample });
    if (!this.ctx) return 0;
    try {
      await this.ctx.resume();
    } catch (_) {
      /* ignore */
    }
    const gLin = Number(gain);
    const g0 = Number.isFinite(gLin) ? gLin : 0.32;
    // Base: margem de 60 ms para dar tempo ao agendamento. Se o chamador
    // forneceu `t0` já alinhado, usamos esse em vez de recalcular.
    let t0 = Number.isFinite(opts.t0) ? opts.t0 : this.ctx.currentTime + 0.06;
    // "Encaixe no próximo tempo": avança t0 até ao próximo múltiplo de `beat`
    // no relógio global (o relógio do AudioContext). Só se aplica se o chamador
    // não forneceu um `t0` explícito (para não sobrepor decisões do caller).
    if (latch && bpm > 0 && !Number.isFinite(opts.t0)) {
      const beatSec = 60 / bpm;
      // Math.ceil garante "próximo" beat mesmo quando já estamos numa fronteira
      // exacta (evita colisão com a batida actual em curso).
      t0 = Math.ceil(t0 / beatSec) * beatSec;
    }

    if (this.scaleSampleBus) {
      if (isSample) {
        const tn = this.ctx.currentTime;
        this.scaleSampleBus.gain.cancelScheduledValues(tn);
        this.scaleSampleBus.gain.setValueAtTime(1, tn);
        this.scaleSampleBus.gain.setValueAtTime(1, t0);
      } else {
        this.scaleSampleBus.gain.cancelScheduledValues(t0);
        this.scaleSampleBus.gain.setValueAtTime(0.82, t0);
      }
    }

    if (isSample) {
      for (let i = 0; i < freqs.length; i += 1) {
        sampler.playNoteAt(this.scaleSampleBus, midis[i], t0 + times[i], g0 * 1.15, (durs[i] ?? 0.12) * 1.5);
      }
    } else {
      this._scheduleSynthScaleSteps(t0, freqs, times, durs, g0);
    }

    const end = t0 + times[times.length - 1] + (durs[durs.length - 1] ?? 0.12) + 0.08;
    this.seqTimer = setTimeout(() => {
      this.seqTimer = null;
    }, Math.max(0, (end - this.ctx.currentTime) * 1000));
    return t0;
  }
}

function midiToFreq(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

// --- Ritmos ----------------------------------------------------------------

function buildScaleDegrees(ivals, dir, octaves) {
  const n = ivals.length;
  if (n < 1) return [];
  const up = [];
  for (let o = 0; o < octaves; o += 1) {
    for (let d = 1; d <= n; d += 1) {
      up.push(d + n * o);
    }
  }
  const topTonic = 1 + n * octaves;
  const upWithTop = [...up, topTonic];
  const downWithTop = [...upWithTop].reverse();
  // 'alt_up' / 'alt_down' se comportam como sobe ou desce numa única execução; a
  // alternância acontece no reagendamento do loop (ver runScaleOnce).
  if (dir === "up" || dir === "alt_up") return upWithTop;
  if (dir === "down" || dir === "alt_down") return downWithTop;
  if (dir === "downup") {
    const upTail = upWithTop.slice(1);
    return [...downWithTop, ...upTail];
  }
  // updown
  const downTail = upWithTop.slice(0, -1).reverse();
  return [...upWithTop, ...downTail];
}

/**
 * Retorna tempos relativos (s) e duração de cada nota (s) para um padrão rítmico.
 * Padrões "com pattern" (bossa, samba, habanera, claves son/rumba, stab_rest) usam
 * um ciclo cromático fixo com articulações longas/curtas/silêncios — aqui geramos
 * apenas as notas que SOAM (descartando os silêncios) e avançamos `t` pela duração
 * do passo (incluindo silêncios) para manter a distribuição temporal do padrão.
 *
 * NOTA: o alinhamento "encaixe no próximo tempo" (seqLatch) NÃO é tratado aqui —
 * os tempos devolvidos são sempre relativos a `t=0` (início do padrão). Quem
 * agenda a sequência é que decide o `t0` absoluto, e pode alinhá-lo ao próximo
 * beat do relógio global (ver `playScaleSequence` + caller em `runScaleOnce`).
 * O parâmetro `latchToBeat` é mantido por compatibilidade de API, mas ignorado.
 */
// eslint-disable-next-line no-unused-vars
function rhythmPattern(type, bpm, noteCount, latchToBeat) {
  const beat = 60 / bpm;
  const eighth = beat / 2;
  const sixteenth = beat / 4;
  const times = [];
  const durs = [];
  let t = 0;

  const pushSteps = (count, stepDur, noteDur) => {
    for (let i = 0; i < count; i += 1) {
      times.push(t);
      durs.push(noteDur);
      t += stepDur;
    }
  };

  // Aplica um padrão cíclico de semicolcheias: 1 = nota, 0 = silêncio.
  const applyMask = (mask, noteDur) => {
    let produced = 0;
    let step = 0;
    while (produced < noteCount) {
      const bit = mask[step % mask.length];
      if (bit) {
        times.push(t);
        durs.push(noteDur);
        produced += 1;
      }
      t += sixteenth;
      step += 1;
    }
  };

  if (type === "quarters") {
    pushSteps(noteCount, beat, beat * 0.9);
  } else if (type === "straight8") {
    pushSteps(noteCount, eighth, eighth * 0.88);
  } else if (type === "sixteenths") {
    pushSteps(noteCount, sixteenth, sixteenth * 0.85);
  } else if (type === "triplet8") {
    const step = beat / 3;
    pushSteps(noteCount, step, step * 0.9);
  } else if (type === "quarter_triplets") {
    const step = (2 * beat) / 3;
    pushSteps(noteCount, step, step * 0.92);
  } else if (type === "swing8") {
    for (let i = 0; i < noteCount; i += 1) {
      const long = eighth * 1.24;
      const short = eighth * 0.76;
      const step = i % 2 === 0 ? long : short;
      times.push(t);
      durs.push(step * 0.92);
      t += step;
    }
  } else if (type === "swing_heavy") {
    for (let i = 0; i < noteCount; i += 1) {
      const long = eighth * 1.40;
      const short = eighth * 0.60;
      const step = i % 2 === 0 ? long : short;
      times.push(t);
      durs.push(step * 0.9);
      t += step;
    }
  } else if (type === "shuffle") {
    // Triplet-feel: longa (2/3 do tempo) + curta (1/3), por tempo.
    for (let i = 0; i < noteCount; i += 1) {
      const long = beat * (2 / 3);
      const short = beat * (1 / 3);
      const step = i % 2 === 0 ? long : short;
      times.push(t);
      durs.push(step * 0.9);
      t += step;
    }
  } else if (type === "dotted") {
    for (let i = 0; i < noteCount; i += 1) {
      const step = i % 2 === 0 ? beat * 0.75 : beat * 0.25;
      times.push(t);
      durs.push(Math.min(step * 0.92, beat * 0.85));
      t += step;
    }
  } else if (type === "reverse_dotted") {
    for (let i = 0; i < noteCount; i += 1) {
      const step = i % 2 === 0 ? beat * 0.25 : beat * 0.75;
      times.push(t);
      durs.push(Math.min(step * 0.92, beat * 0.85));
      t += step;
    }
  } else if (type === "galloping") {
    // 1 longa + 2 curtas por tempo (semínima pontilhada + 2 semicolcheias ~ um tempo).
    const pattern = [beat * 0.5, beat * 0.25, beat * 0.25];
    for (let i = 0; i < noteCount; i += 1) {
      const step = pattern[i % pattern.length];
      times.push(t);
      durs.push(step * 0.9);
      t += step;
    }
  } else if (type === "stab_rest") {
    // Alterna nota curta + pausa (colcheia tocada, colcheia silêncio).
    for (let i = 0; i < noteCount; i += 1) {
      times.push(t);
      durs.push(eighth * 0.55);
      t += eighth * 2;
    }
  } else if (type === "clave3-2") {
    const step = (2 * beat) / 5;
    pushSteps(noteCount, step, step * 0.9);
  } else if (type === "clave_son") {
    // Son 3-2: posições em semicolcheias de um ciclo de 16 (2 compassos 4/4).
    // Padrão: x . . x . . x . . . x . x . . .
    applyMask([1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0], sixteenth * 0.9);
  } else if (type === "clave_rumba") {
    // Rumba clave 3-2: x . . x . . . x . . x . x . . .
    applyMask([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0], sixteenth * 0.9);
  } else if (type === "bossa") {
    // Bossa pattern (ciclo 16 semicolcheias): x . . x . . x . . . x . . x . .
    applyMask([1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], sixteenth * 0.92);
  } else if (type === "samba") {
    // Groove samba cheio: x . x . x . x x x . x . x x x .
    applyMask([1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0], sixteenth * 0.8);
  } else if (type === "habanera") {
    // Habanera: semínima pontilhada + colcheia + duas colcheias
    const pattern = [beat * 0.75, beat * 0.25, beat * 0.5, beat * 0.5];
    for (let i = 0; i < noteCount; i += 1) {
      const step = pattern[i % pattern.length];
      times.push(t);
      durs.push(step * 0.9);
      t += step;
    }
  } else {
    pushSteps(noteCount, eighth, eighth * 0.88);
  }

  // `latchToBeat` era aplicado aqui, mas alinhava o FINAL do padrão a um múltiplo
  // de `cycle` relativo ao tempo interno (t=0), não ao relógio global — sem efeito
  // prático. O alinhamento agora é feito em `playScaleSequence` através do `t0`.

  return { times, durs, total: t };
}

// --- UI --------------------------------------------------------------------

const audio = new AudioEngine();

/** Saída ligada pelo utilizador (botão Ativar / Desativar). */
let audioUserEnabled = false;
let syncAudioRaf = 0;
/** Timer do loop por amostras. Um só `setTimeout` encadeado evita drift cumulativo. */
let sampleStepTimer = null;
let sampleTonicNextAt = 0;
let sampleHarmonyArpIndex = 0;
let sampleHarmonyBeatIndex = 0; // avança em TODAS as batidas (não só arpejo)
let sampleSlotsArpIndex = 0;
let sampleBassPatIndex = 0;
let soloPatIndex = 0;
let lastSoloChordSig = "";
/** Assinatura do último acorde desenhado na faixa «ouvir harmonia». */
let lastHarmHearStripSig = "";
/** Token / timer do loop da escala (cada «Tocar» incrementa o token). */
let scaleLoopToken = 0;
let scaleLoopTimer = null;

/** Timers de highlight visual da escala — limpos no stop para evitar ficar "aceso". */
const scaleHighlightTimers = [];
/** Highlights da faixa de notas da sequência (sincronizados com o áudio). */
const seqStripHighlightTimers = [];
/** Highlights da faixa de notas da harmonia (por batida do loop de amostras). */
const harmonyHearTimers = [];

function clearHarmonyHearTimers() {
  for (const tm of harmonyHearTimers) clearTimeout(tm);
  harmonyHearTimers.length = 0;
}

function clearHarmonyHearVisuals() {
  clearHarmonyHearTimers();
  const host = document.getElementById("harmHearStrip");
  if (host) host.innerHTML = "";
}

function renderHarmonyHearPillsFromMidis(midis) {
  const host = document.getElementById("harmHearStrip");
  if (!host) return;
  if (!midis.length) {
    host.innerHTML = "";
    return;
  }
  const pf = preferFlats();
  const uniq = [...new Set(midis)].sort((a, b) => a - b);
  host.innerHTML = "";
  for (const m of uniq) {
    const pill = document.createElement("span");
    pill.className = "harm-hear-pill";
    pill.setAttribute("role", "listitem");
    pill.dataset.midi = String(m);
    pill.textContent = midiNoteLabel(m, pf);
    host.appendChild(pill);
  }
}

/**
 * Destaca cada nota da harmonia no instante em que o sampler a toca.
 * `t0Abs` = instante absoluto do AudioContext do início da batida (o mesmo `t`
 * usado em `playNoteAt` no `step()`).
 */
function scheduleHarmonyHearHighlights(t0Abs, events, ctxNow) {
  if (!events.length) return;
  for (const ev of events) {
    const midi = ev.midi;
    if (typeof midi !== "number") continue;
    const startMs = Math.max(0, Math.round((t0Abs + ev.offset - ctxNow) * 1000));
    const endMs = Math.max(startMs + 45, Math.round(startMs + (ev.dur || 0.12) * 1000));
    harmonyHearTimers.push(
      setTimeout(() => {
        document.querySelector(`#harmHearStrip .harm-hear-pill[data-midi="${midi}"]`)?.classList.add("is-current");
      }, startMs),
    );
    harmonyHearTimers.push(
      setTimeout(() => {
        document.querySelector(`#harmHearStrip .harm-hear-pill[data-midi="${midi}"]`)?.classList.remove("is-current");
      }, endMs),
    );
  }
}

function clearScaleSeqStripUi() {
  for (const t of seqStripHighlightTimers) clearTimeout(t);
  seqStripHighlightTimers.length = 0;
  document.querySelectorAll(".scale-seq-pill.is-current").forEach((el) => el.classList.remove("is-current"));
}

function clearScaleHighlights() {
  for (const t of scaleHighlightTimers) clearTimeout(t);
  scaleHighlightTimers.length = 0;
  clearScaleSeqStripUi();
  const strip = document.getElementById("degreeStrip");
  if (strip) strip.querySelectorAll(".degree-col.is-playing").forEach((el) => el.classList.remove("is-playing"));
}

/** Altura de referência (mediana do acorde) para manter a escala na mesma zona registral. */
function getScaleHarmonyReferenceMidi() {
  const baseOct = slotsPlaybackBaseOct();
  const tcp = currentTonicPc();
  const progStep = getActiveProgressionStep();
  if (progStep?.step?.chord) {
    const notes = chordMidisAbsolute(progStep.step.chord, baseOct);
    if (notes.length) {
      const s = [...notes].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    }
  }
  const harmId = document.getElementById("harmonyBase")?.value ?? "off";
  if (harmId !== "off") {
    const notes = harmonyMidis(tcp, harmonyRefIvals(), harmId, baseOct);
    if (notes.length) {
      const s = [...notes].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    }
  }
  return midiTonic(tcp, currentTonicOctave());
}

/**
 * Mantém cada nota da sequência dentro de [ref−12, ref+12] (no máx. 1 oitava
 * abaixo e 1 acima da altura de referência da harmonia).
 */
function constrainScaleMidisAroundHarmony(midis, refMidi) {
  const lo = refMidi - 12;
  const hi = refMidi + 12;
  if (!midis.length) return midis.slice();
  const minM = Math.min(...midis);
  const maxM = Math.max(...midis);
  for (let k = -6; k <= 6; k += 1) {
    const shift = k * 12;
    if (minM + shift >= lo && maxM + shift <= hi) return midis.map((m) => m + shift);
  }
  return midis.map((m) => {
    let x = m;
    for (let guard = 0; guard < 16; guard += 1) {
      if (x >= lo && x <= hi) break;
      if (x < lo) x += 12;
      else x -= 12;
    }
    return clampMidi(x);
  });
}

function renderScaleSeqPreview(degs, midis) {
  const host = document.getElementById("scaleSeqStrip");
  if (!host) return;
  host.innerHTML = "";
  const pf = preferFlats();
  for (let i = 0; i < midis.length; i += 1) {
    const pill = document.createElement("span");
    pill.className = "scale-seq-pill";
    pill.dataset.index = String(i);
    pill.textContent = `${midiNoteLabel(midis[i], pf)} · gr. ${degs[i]}`;
    host.appendChild(pill);
  }
}

function scheduleScaleSeqStripHighlights(t0Abs, times, durs, myToken, ctxNow) {
  const pills = document.querySelectorAll("#scaleSeqStrip .scale-seq-pill");
  if (!pills.length) return;
  for (let i = 0; i < times.length; i += 1) {
    const startMs = Math.max(0, Math.round((t0Abs + times[i] - ctxNow) * 1000));
    const endMs = Math.max(startMs + 50, Math.round(startMs + (durs[i] ?? 0.12) * 1000));
    seqStripHighlightTimers.push(
      setTimeout(() => {
        if (myToken !== scaleLoopToken) return;
        pills[i]?.classList.add("is-current");
      }, startMs),
    );
    seqStripHighlightTimers.push(
      setTimeout(() => {
        if (myToken !== scaleLoopToken) return;
        pills[i]?.classList.remove("is-current");
      }, endMs),
    );
  }
}

function populateScaleStudyCombo() {
  const sel = document.getElementById("scaleStudyCombo");
  const presets = globalThis.SCALE_STUDY_PRESETS;
  if (!sel || !Array.isArray(presets)) return;
  while (sel.children.length > 1) sel.removeChild(sel.lastChild);
  for (const p of presets) {
    if (!p || !p.id || !CHORD_PROGRESSIONS[p.progressionKey]) continue;
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.label || p.id;
    sel.appendChild(o);
  }
}

function applyScaleStudyPreset(presetId) {
  if (!presetId || !Array.isArray(globalThis.SCALE_STUDY_PRESETS)) return;
  const item = globalThis.SCALE_STUDY_PRESETS.find((x) => x.id === presetId);
  if (!item || !CHORD_PROGRESSIONS[item.progressionKey]) return;
  const progEnabled = document.getElementById("progEnabled");
  if (progEnabled && !progEnabled.checked) {
    progEnabled.checked = true;
    progEnabled.dispatchEvent(new Event("change", { bubbles: true }));
  }
  progLoadPreset(item.progressionKey);
  const scaleSel = document.getElementById("scaleType");
  if (scaleSel && item.defaultScale && SCALE_TYPES[item.defaultScale]) {
    scaleSel.value = item.defaultScale;
    scaleSel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const combo = document.getElementById("scaleStudyCombo");
  if (combo) combo.value = "";
}

function scheduleSyncAudio() {
  if (!audioUserEnabled) return;
  if (syncAudioRaf) cancelAnimationFrame(syncAudioRaf);
  syncAudioRaf = requestAnimationFrame(() => {
    syncAudioRaf = 0;
    syncAudio();
  });
}

function syncBankSamplerFromUI() {
  if (!audio.instrumentSampler || !globalThis.HLSoundBank) return;
  const inst = document.getElementById("bankInstrument")?.value || "piano";
  globalThis.HLSoundBank.applyInstrumentToSampler(audio.instrumentSampler, inst, {});
  const style = document.getElementById("playStyle")?.value || "sustain";
  if (typeof audio.instrumentSampler.setPlaybackStyle === "function") {
    audio.instrumentSampler.setPlaybackStyle(style);
  }
}

/** Garante instância dedicada de InstrumentSampler para o baixo (lazy). */
function ensureBassSampler() {
  if (audio.bassSampler) return audio.bassSampler;
  if (!audio.ctx || typeof globalThis.HLInstrumentSampler !== "function") return null;
  audio.bassSampler = new globalThis.HLInstrumentSampler(audio.ctx);
  return audio.bassSampler;
}

/**
 * Sincroniza o sampler do baixo com o `#bassBankInstrument`. Se o valor for
 * "match", o baixo usa o sampler principal — libertamos o dedicado se existia.
 * Caso contrário, aplica o banco escolhido ao bassSampler (independente do
 * principal) e herda o `playStyle` global.
 */
function syncBassBankSamplerFromUI() {
  if (!globalThis.HLSoundBank) return;
  const choice = document.getElementById("bassBankInstrument")?.value || "match";
  if (choice === "match") {
    if (audio.bassSampler) {
      audio.bassSampler.clearCache?.();
      audio.bassSampler = null;
    }
    return;
  }
  const s = ensureBassSampler();
  if (!s) return;
  globalThis.HLSoundBank.applyInstrumentToSampler(s, choice, {});
  const style = document.getElementById("playStyle")?.value || "sustain";
  if (typeof s.setPlaybackStyle === "function") s.setPlaybackStyle(style);
}

// Id do instrumento activo (selecionado no UI). Usado pelo normalizador de
// acordes para escolher perfil (range/sweet/gain/character).
function currentBankId() {
  return document.getElementById("bankInstrument")?.value || "piano";
}

/**
 * ID do banco efectivo para o baixo. Se o user escolheu "Igual ao principal"
 * (value = "match"), devolve `currentBankId()`; caso contrário devolve a
 * escolha dedicada. Crítico para o ChordNormalizer — normalizar a nota do
 * baixo com o id do piano desloca-a para o sweet spot do piano (C4–C5), não
 * do contrabaixo (C1–C3), e aplica o `gainScale` errado (piano costuma ter
 * gainScale < 1 no range grave, o que soa "muito ao fundo" nas amostras de
 * contrabaixo).
 */
function currentBassBankId() {
  const choice = document.getElementById("bassBankInstrument")?.value || "match";
  return choice === "match" ? currentBankId() : choice;
}

// Aplica estilo "pluck" se o perfil do instrumento for percussivo
// (ex.: xilofone) e o padrão pedido for sustain — caso contrário devolve
// o estilo original. Centraliza a lógica para harmonia e baixo.
function resolveStyleOverride(baseStyle, norm) {
  if (!norm || !norm.styleOverride) return baseStyle;
  if (baseStyle === "sustain" || baseStyle === "block_whole" || baseStyle === "block_half") {
    return norm.styleOverride;
  }
  return baseStyle;
}

function currentBpm() {
  const v = Number(document.getElementById("globalBpm")?.value || 96);
  return Math.max(40, Math.min(220, Number.isFinite(v) ? v : 96));
}

function currentTonicOctave() {
  const v = Number(document.getElementById("tonicOctave")?.value ?? 4);
  return Math.max(-1, Math.min(5, Number.isFinite(v) ? v : 4));
}

async function preloadSamplerBank() {
  if (!audio.instrumentSampler) return;
  try {
    await audio.ctx?.resume();
  } catch (_) {
    /* ignore */
  }
  syncBankSamplerFromUI();
  syncBassBankSamplerFromUI();
  // Carrega apenas os anchors declarados no banco (NOT preloadRange(24,108)).
  // Sem isto, qualquer instrumento não-piano dispara dezenas de 404s e bloqueia
  // o await em Promise.allSettled. O sampler faz pitch-shift entre anchors via
  // nearestAnchorMidi(), logo não precisamos das 85 notas em disco.
  const loadAnchors = (sampler, id) => {
    const def = globalThis.HLSoundBank?.getDefinition?.(id);
    const anchors = Array.isArray(def?.anchors) ? def.anchors : null;
    if (anchors && anchors.length) {
      return Promise.allSettled(anchors.map((m) => sampler.loadOne(m)));
    }
    return sampler.preloadRange(24, 108);
  };
  await loadAnchors(audio.instrumentSampler, currentBankId());
  // Se houver bassSampler dedicado, pré-carrega os anchors do seu banco.
  const bassChoice = document.getElementById("bassBankInstrument")?.value || "match";
  if (bassChoice !== "match" && audio.bassSampler) {
    await loadAnchors(audio.bassSampler, bassChoice);
  }
}

function stopSampleExecutionLoop() {
  if (sampleStepTimer) {
    clearTimeout(sampleStepTimer);
    sampleStepTimer = null;
  }
  sampleTonicNextAt = 0;
  sampleHarmonyArpIndex = 0;
  sampleHarmonyBeatIndex = 0;
  sampleSlotsArpIndex = 0;
  sampleBassPatIndex = 0;
  soloPatIndex = 0;
  lastSoloChordSig = "";
  lastHarmHearStripSig = "";
  clearHarmonyHearVisuals();
  const soloLnStop = document.getElementById("soloHearLine");
  if (soloLnStop) soloLnStop.textContent = "";
}

// ---------------------------------------------------------------------------
// Padrões de execução da harmonia (batidas / arpejos)
//
// Cada padrão declara como o acorde deve ser tocado em cada batida. Recebe um
// contexto `ctx = { chord: int[], beat: seconds, absBeat: int, peak: number }`
// e agenda eventos via `play({ midi|midis, offset, dur, style, velMult })`.
//
// `absBeat` é o índice global de batida desde o arranque do loop (cresce
// monotonamente, independente do estilo). `absBeat % 4` dá o beat-in-bar.
// `beat` é a duração de uma batida em segundos (derivada do BPM).
//
// Convenções para selecionar notas do acorde:
//   - "all"            → acorde completo
//   - "root"|"bass"    → índice 0 (fundamental)
//   - int              → índice explícito (clampado ao tamanho do acorde)
//   - "arp_up" / "arp_down" / "arp_updown" → cíclico a partir de absBeat
// ---------------------------------------------------------------------------

/** Devolve o MIDI da nota seleccionada pelo `sel` (string|int). */
function harmonyPickNote(chord, sel, absBeat) {
  if (!chord || chord.length === 0) return null;
  const n = chord.length;
  if (typeof sel === "number") return chord[Math.max(0, Math.min(n - 1, sel))];
  switch (sel) {
    case "bass":
    case "root":
      return chord[0];
    case "third":
      return chord[Math.min(1, n - 1)];
    case "fifth":
      return chord[Math.min(2, n - 1)];
    case "seventh":
      return chord[Math.min(3, n - 1)];
    case "top":
      return chord[n - 1];
    case "arp_up":
      return chord[absBeat % n];
    case "arp_down":
      return chord[(n - 1 - (absBeat % n) + n) % n];
    case "arp_updown": {
      const period = Math.max(2, (n - 1) * 2);
      const i = absBeat % period;
      return chord[i < n ? i : period - i];
    }
    default:
      return null;
  }
}

/** beat-in-bar (4/4): inteiro 0..3. */
function beatInBar4(absBeat) {
  return ((absBeat % 4) + 4) % 4;
}

/**
 * Defaults de humanização por categoria de padrão.
 *   - timingJitterMs: dispersão temporal ±ms (anti-robô)
 *   - velJitterPct:   dispersão de velocidade ±fração (0.08 = ±8%)
 *   - strumSpread:    stagger entre notas do acorde num ataque "all" (em beats)
 *   - legatoMax:      tecto de duração em beats para estilos não-sustain
 *                     (impede arrastes que emporcalham a próxima batida)
 */
const HARMONY_CATEGORY_DEFAULTS = {
  block: { timingJitterMs: 5, velJitterPct: 0.05, strumSpread: 0, legatoMax: 3.9 },
  arp: { timingJitterMs: 7, velJitterPct: 0.06, strumSpread: 0, legatoMax: 1.05 },
  arp_classic: { timingJitterMs: 5, velJitterPct: 0.05, strumSpread: 0, legatoMax: 1.0 },
  strum: { timingJitterMs: 9, velJitterPct: 0.08, strumSpread: 0.022, legatoMax: 0.95 },
  finger: { timingJitterMs: 5, velJitterPct: 0.05, strumSpread: 0, legatoMax: 1.0 },
};

/**
 * PRNG pseudo-aleatório determinístico (Mulberry32) — "humanização" com
 * granularidade reprodutível por batida, evitando que o jitter se sobreponha
 * em fase e produza colapsos rítmicos.
 */
function harmonyRand(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) % 100000) / 100000;
  };
}

/**
 * Dispatcher central. Agenda todos os eventos do padrão `styleKey` para a
 * batida corrente. Aplica humanização (timing/velocidade), strum-spread e
 * clamp de duração por categoria. Devolve o número de eventos agendados.
 */
function executeHarmonyPattern({ styleKey, chord, beat, absBeat, peak, schedule }) {
  const pat = HARMONY_EXEC_PATTERNS[styleKey];
  if (!chord || !chord.length) return 0;
  if (!pat) {
    chord.forEach((m) =>
      schedule({ midi: m, offset: 0, dur: Math.max(beat * 0.95, 0.5), style: "sustain", velMult: 1 }),
    );
    return chord.length;
  }
  const defaults = HARMONY_CATEGORY_DEFAULTS[pat.category] || HARMONY_CATEGORY_DEFAULTS.block;
  const h = { ...defaults, ...(pat.humanize || {}) };
  // Seed combina absBeat + hash curto do styleKey para decorrelacionar padrões.
  let hk = 0;
  for (let i = 0; i < styleKey.length; i++) hk = (hk * 31 + styleKey.charCodeAt(i)) >>> 0;
  const rand = harmonyRand(absBeat * 131 + hk);

  let count = 0;
  const emit = (ev) => {
    // ev: { select|midi|midis, offset(beats), dur(beats), style, velMult,
    //       spread(beats), strumDir: "down"|"up" }
    const style = ev.style || "sustain";
    const offBeats = ev.offset ?? 0;
    let durBeats = ev.dur ?? 1;
    // Clamp legato: em estilos não-sustain evita arraste para a batida seguinte.
    if (style !== "sustain") durBeats = Math.min(durBeats, h.legatoMax);
    const vm = ev.velMult ?? 1;

    // Jitter temporal em segundos (ataque humano).
    const jitSec = h.timingJitterMs ? ((rand() * 2 - 1) * h.timingJitterMs) / 1000 : 0;
    const baseOffsetSec = offBeats * beat + jitSec;
    const durSec = Math.max(0.08, durBeats * beat);

    const scheduleOne = (midi, extraBeats, vMul) => {
      const velJ = h.velJitterPct ? 1 + (rand() * 2 - 1) * h.velJitterPct : 1;
      schedule({
        midi,
        offset: baseOffsetSec + (extraBeats || 0) * beat,
        dur: durSec,
        style,
        velMult: vm * (vMul ?? 1) * velJ,
      });
      count++;
    };

    if (Array.isArray(ev.midis)) {
      for (const m of ev.midis) scheduleOne(m, 0);
    } else if (typeof ev.midi === "number") {
      scheduleOne(ev.midi, 0);
    } else if (ev.select === "all") {
      const spread = ev.spread != null ? ev.spread : h.strumSpread;
      const dir = ev.strumDir || "down";
      // "down"=grave→agudo (ordem natural do acorde); "up"=agudo→grave.
      const notes = dir === "up" ? [...chord].reverse() : chord;
      for (let i = 0; i < notes.length; i++) {
        // Leve atenuação por posição no strum (notas tardias levemente mais fracas).
        const vAttn = Math.max(0.62, 1 - 0.05 * i);
        scheduleOne(notes[i], i * spread, vAttn);
      }
    } else {
      const m = harmonyPickNote(chord, ev.select, absBeat);
      if (m != null) scheduleOne(m, 0);
    }
  };
  pat.exec({ chord, beat, absBeat, peak }, emit);
  return count;
}

// --- Utilitários rítmicos -------------------------------------------------
// Acento-base por batida em compasso 4/4: tempo forte (1), meio-forte (3),
// fracos (2, 4). Define a "respiração" dinâmica que todos os padrões herdam.
const BEAT_ACCENT_4 = [1.0, 0.82, 0.92, 0.8];
function accent4(absBeat) {
  return BEAT_ACCENT_4[beatInBar4(absBeat)];
}
// Micro-swing (atraso das colcheias "and" em beats). Valor leve para não
// soar jazzy em padrões pop/rock — idiomático apenas onde explicitamente usado.
const SWING_8 = 0.06;

const HARMONY_EXEC_PATTERNS = {
  // --- Bloco / sustain / pluck --------------------------------------------
  sustain: {
    label: "Contínuo / Sustain",
    category: "block",
    exec(ctx, emit) {
      // Ligeira ênfase na primeira batida do compasso para marcar o pulso.
      emit({
        select: "all",
        offset: 0,
        dur: 1.05,
        style: "sustain",
        velMult: accent4(ctx.absBeat),
      });
    },
  },
  pluck: {
    label: "Pizzicato / Pluck",
    category: "block",
    exec(ctx, emit) {
      emit({
        select: "all",
        offset: 0,
        dur: 0.55,
        style: "pluck",
        spread: 0.01,
        velMult: accent4(ctx.absBeat),
      });
    },
  },
  block_whole: {
    label: "Bloco — 1 por compasso (semibreve)",
    category: "block",
    exec(ctx, emit) {
      // Toca apenas no tempo 1; deixa respirar antes do próximo compasso.
      if (beatInBar4(ctx.absBeat) === 0)
        emit({ select: "all", offset: 0, dur: 3.7, style: "sustain", spread: 0.018 });
    },
  },
  block_half: {
    label: "Bloco — tempo 1 e 3 (mínimas)",
    category: "block",
    exec(ctx, emit) {
      const b = beatInBar4(ctx.absBeat);
      // Dur 1.85 (< 2 beats) → liberta a voz antes da próxima mínima.
      if (b === 0)
        emit({ select: "all", offset: 0, dur: 1.85, style: "sustain", spread: 0.014 });
      else if (b === 2)
        emit({ select: "all", offset: 0, dur: 1.85, style: "sustain", spread: 0.014, velMult: 0.9 });
    },
  },
  chord_pulse_4: {
    label: "Pulso em semínimas (todas as batidas)",
    category: "block",
    exec(ctx, emit) {
      emit({
        select: "all",
        offset: 0,
        dur: 0.78,
        style: "pluck",
        spread: 0.012,
        velMult: accent4(ctx.absBeat),
      });
    },
  },
  chord_pulse_8: {
    label: "Pulso em colcheias",
    category: "block",
    exec(ctx, emit) {
      const acc = accent4(ctx.absBeat);
      emit({ select: "all", offset: 0, dur: 0.42, style: "pluck", spread: 0.01, velMult: acc });
      // 2.ª colcheia levemente atrasada (swing leve) e mais fraca.
      emit({
        select: "all",
        offset: 0.5 + SWING_8 * 0.5,
        dur: 0.38,
        style: "pluck",
        spread: 0.01,
        velMult: acc * 0.74,
      });
    },
  },

  // --- Arpejos simples ----------------------------------------------------
  arpeggio: {
    label: "Arpejo — 1 nota / batida (cíclico)",
    category: "arp",
    exec(ctx, emit) {
      emit({
        select: "arp_up",
        offset: 0,
        dur: 0.92,
        style: "arpeggio",
        velMult: accent4(ctx.absBeat),
      });
    },
  },
  arp_down: {
    label: "Arpejo descendente — 1 nota / batida",
    category: "arp",
    exec(ctx, emit) {
      emit({
        select: "arp_down",
        offset: 0,
        dur: 0.92,
        style: "arpeggio",
        velMult: accent4(ctx.absBeat),
      });
    },
  },
  arp_updown: {
    label: "Arpejo sobe-desce — 1 nota / batida",
    category: "arp",
    exec(ctx, emit) {
      emit({
        select: "arp_updown",
        offset: 0,
        dur: 0.92,
        style: "arpeggio",
        velMult: accent4(ctx.absBeat),
      });
    },
  },
  arpeggio_full: {
    label: "Arpejo completo — todas as notas num beat",
    category: "arp",
    exec(ctx, emit) {
      const n = ctx.chord.length || 1;
      // Distribui o acorde ao longo de ~0.9 do beat; a última nota sustenta.
      const gap = Math.max(0.06, Math.min(0.22, 0.9 / Math.max(1, n)));
      for (let i = 0; i < n; i++) {
        const isLast = i === n - 1;
        emit({
          midi: ctx.chord[i],
          offset: i * gap,
          dur: isLast ? 0.9 : gap * 2.2,
          style: "arpeggio",
          velMult: (i === 0 ? 1.0 : 0.88) * accent4(ctx.absBeat),
        });
      }
    },
  },
  arp_up_8: {
    label: "Arpejo ascendente em colcheias",
    category: "arp",
    exec(ctx, emit) {
      const n = ctx.chord.length || 1;
      const a = (ctx.absBeat * 2) % n;
      const b = (ctx.absBeat * 2 + 1) % n;
      const acc = accent4(ctx.absBeat);
      emit({ midi: ctx.chord[a], offset: 0, dur: 0.48, style: "arpeggio", velMult: acc });
      emit({
        midi: ctx.chord[b],
        offset: 0.5 + SWING_8 * 0.5,
        dur: 0.45,
        style: "arpeggio",
        velMult: acc * 0.82,
      });
    },
  },
  arp_down_8: {
    label: "Arpejo descendente em colcheias",
    category: "arp",
    exec(ctx, emit) {
      const n = ctx.chord.length || 1;
      const a = (n - 1 - ((ctx.absBeat * 2) % n) + n) % n;
      const b = (n - 1 - ((ctx.absBeat * 2 + 1) % n) + n) % n;
      const acc = accent4(ctx.absBeat);
      emit({ midi: ctx.chord[a], offset: 0, dur: 0.48, style: "arpeggio", velMult: acc });
      emit({
        midi: ctx.chord[b],
        offset: 0.5 + SWING_8 * 0.5,
        dur: 0.45,
        style: "arpeggio",
        velMult: acc * 0.82,
      });
    },
  },

  // --- Arpejos clássicos (tipo Alberti) -----------------------------------
  alberti: {
    label: "Alberti clássico (1–5–3–5)",
    category: "arp_classic",
    exec(ctx, emit) {
      // Ordem idiomática por compasso: raiz, 5ª, 3ª, 5ª (acento em 1).
      const seq = [0, 2, 1, 2];
      const b = beatInBar4(ctx.absBeat);
      emit({
        select: seq[b],
        offset: 0,
        dur: 0.92,
        style: "arpeggio",
        velMult: b === 0 ? 1.0 : 0.84,
      });
    },
  },
  alberti_rev: {
    label: "Alberti invertido (1–3–5–3)",
    category: "arp_classic",
    exec(ctx, emit) {
      const seq = [0, 1, 2, 1];
      const b = beatInBar4(ctx.absBeat);
      emit({
        select: seq[b],
        offset: 0,
        dur: 0.92,
        style: "arpeggio",
        velMult: b === 0 ? 1.0 : 0.84,
      });
    },
  },
  broken_1351: {
    label: "1–3–5–1' (arp ascendente por compasso)",
    category: "arp_classic",
    exec(ctx, emit) {
      const b = beatInBar4(ctx.absBeat);
      // Beat 3: oitava acima da raiz (1') → nota explícita fora do selector.
      if (b === 3) {
        emit({
          midi: ctx.chord[0] + 12,
          offset: 0,
          dur: 0.95,
          style: "arpeggio",
          velMult: 0.88,
        });
      } else {
        emit({
          select: b, // 0→raiz, 1→3ª, 2→5ª
          offset: 0,
          dur: 0.92,
          style: "arpeggio",
          velMult: b === 0 ? 1.0 : 0.86,
        });
      }
    },
  },
  broken_1535: {
    label: "1–5–3–5 com colcheias",
    category: "arp_classic",
    exec(ctx, emit) {
      const bib = beatInBar4(ctx.absBeat);
      // 2 colcheias/batida: raiz–5ª, 3ª–5ª, raiz–5ª, 3ª–5ª.
      const pairs = [
        [0, 2],
        [1, 2],
        [0, 2],
        [1, 2],
      ];
      const [a, c] = pairs[bib];
      const acc = bib === 0 ? 1.0 : bib === 2 ? 0.92 : 0.82;
      emit({ select: a, offset: 0, dur: 0.46, style: "arpeggio", velMult: acc });
      emit({
        select: c,
        offset: 0.5 + SWING_8 * 0.4,
        dur: 0.44,
        style: "arpeggio",
        velMult: acc * 0.82,
      });
    },
  },

  // --- Batidas / strum / fingerpicking ------------------------------------
  strum_ballad: {
    label: "Balada — acorde em 1 e 3",
    category: "strum",
    humanize: { strumSpread: 0.035, timingJitterMs: 7 },
    exec(ctx, emit) {
      const b = beatInBar4(ctx.absBeat);
      // Sustain ligeiramente < 2 beats: corta limpo antes da próxima mínima.
      if (b === 0)
        emit({ select: "all", offset: 0, dur: 1.88, style: "sustain", strumDir: "down", velMult: 1.0 });
      else if (b === 2)
        emit({ select: "all", offset: 0, dur: 1.88, style: "sustain", strumDir: "down", velMult: 0.88 });
    },
  },
  strum_rock_8: {
    label: "Rock — colcheias D–U–D–U",
    category: "strum",
    humanize: { strumSpread: 0.018, timingJitterMs: 8 },
    exec(ctx, emit) {
      const b = beatInBar4(ctx.absBeat);
      // Down fortes nos tempos 1/3; up ligeiramente mais fracos.
      const accDown = b === 0 ? 1.0 : b === 2 ? 0.94 : 0.86;
      emit({ select: "all", offset: 0, dur: 0.38, style: "pluck", strumDir: "down", velMult: accDown });
      emit({
        select: "all",
        offset: 0.5,
        dur: 0.32,
        style: "pluck",
        strumDir: "up",
        velMult: accDown * 0.72,
      });
    },
  },
  strum_bossa: {
    label: "Bossa — clave 2 compassos (violão sincopado)",
    category: "strum",
    humanize: { strumSpread: 0.024, timingJitterMs: 8 },
    exec(ctx, emit) {
      // 2 compassos de 4/4 = 16 semicolcheias. Colcheia a colcheia (0..15):
      // hits idiomáticos de bossa (João Gilberto-esque):
      //   Compasso 1: beat 1 ("dom"), 1-and ("tcha"), 2-and ("dom"), 3 ("tcha")
      //   Compasso 2: 1-and, 2 ("dom"), 3-and ("tcha")
      // Mapeado em 8ths absolutas [0..15]: {0,1,3,4, 9,10,13}.
      const hits = new Set([0, 1, 3, 4, 9, 10, 13]);
      // Upstrokes onde cai no "and" (pulsos ímpares); downstrokes nas batidas.
      const abs8 = (ctx.absBeat * 2) % 16;
      for (let e = 0; e < 2; e++) {
        const pos = (abs8 + e) % 16;
        if (!hits.has(pos)) continue;
        const isAnd = pos % 2 === 1;
        const vel = pos === 0 ? 1.0 : pos === 4 || pos === 9 || pos === 10 ? 0.9 : 0.78;
        emit({
          select: "all",
          offset: e === 0 ? 0 : 0.5,
          dur: isAnd ? 0.35 : 0.5,
          style: "pluck",
          strumDir: isAnd ? "up" : "down",
          velMult: vel,
        });
      }
    },
  },
  strum_samba: {
    label: "Samba — 16ths (partido-alto)",
    category: "strum",
    humanize: { strumSpread: 0.012, timingJitterMs: 6 },
    exec(ctx, emit) {
      // Partido-alto: acentos em 1, 2-a (0.75), 3-e (0.25 do beat 3), 4.
      // Por batida (4 semicolcheias: 0, 0.25, 0.5, 0.75):
      const b = beatInBar4(ctx.absBeat);
      // Padrão de presença/acento por batida em semicolcheias.
      //          0     0.25   0.5    0.75
      const grid = [
        [1.0, 0, 0.8, 0], // beat 1: forte, pausa, médio, pausa
        [0, 0.78, 0.85, 0.95], // beat 2: sincopa em 2e/2&/2a
        [0.92, 0, 0.82, 0.7], // beat 3: forte, pausa, médio, leve
        [0, 0.78, 0.88, 0.9], // beat 4: finaliza a frase com push ao compasso 1
      ];
      const row = grid[b];
      const subdivs = [0, 0.25, 0.5, 0.75];
      for (let i = 0; i < 4; i++) {
        if (row[i] <= 0) continue;
        const isDown = i === 0 || i === 2;
        emit({
          select: "all",
          offset: subdivs[i],
          dur: 0.2,
          style: "pluck",
          strumDir: isDown ? "down" : "up",
          velMult: row[i],
        });
      }
    },
  },
  strum_reggae: {
    label: "Reggae — chop nos contratempos (2 e 4)",
    category: "strum",
    humanize: { strumSpread: 0.008, timingJitterMs: 6 },
    exec(ctx, emit) {
      const b = beatInBar4(ctx.absBeat);
      // Somente tempos 2 e 4 (one-drop). Chop curto, up-stroke, abafado.
      if (b === 1 || b === 3) {
        emit({
          select: "all",
          offset: 0,
          dur: 0.22,
          style: "pluck",
          strumDir: "up",
          velMult: b === 1 ? 1.0 : 0.94,
        });
      }
    },
  },
  strum_charleston: {
    label: "Charleston (jazz) — 1 e 2-and",
    category: "strum",
    humanize: { strumSpread: 0.02, timingJitterMs: 9 },
    exec(ctx, emit) {
      const b = beatInBar4(ctx.absBeat);
      if (b === 0)
        emit({ select: "all", offset: 0, dur: 0.44, style: "pluck", strumDir: "down", velMult: 1.0 });
      // "2 and" = beat 1 (zero-indexado) + 0.5, com swing leve.
      if (b === 1)
        emit({
          select: "all",
          offset: 0.5 + SWING_8 * 0.6,
          dur: 0.6,
          style: "pluck",
          strumDir: "down",
          velMult: 0.85,
        });
    },
  },

  // --- Fingerpicking ------------------------------------------------------
  travis: {
    label: "Travis picking (polegar+dedos)",
    category: "finger",
    exec(ctx, emit) {
      const b = beatInBar4(ctx.absBeat);
      // Baixo alternado: raiz em 1 e 3; 5ª em 2 e 4 (clampa para o topo se
      // o acorde tiver <3 notas — harmonyPickNote resolve índices excedentes).
      const bassIdx = b === 0 || b === 2 ? 0 : 2;
      emit({
        select: bassIdx,
        offset: 0,
        dur: 0.88,
        style: "pluck",
        velMult: b === 0 ? 1.0 : 0.88,
      });
      // Dedos nas colcheias & alternam 3ª e nota mais aguda.
      const upper = b % 2 === 0 ? 1 : 3;
      emit({
        select: upper,
        offset: 0.5 + SWING_8 * 0.3,
        dur: 0.42,
        style: "pluck",
        velMult: 0.74,
      });
    },
  },
  travis_fast: {
    label: "Travis rápido (16ths alternado)",
    category: "finger",
    exec(ctx, emit) {
      const b = beatInBar4(ctx.absBeat);
      const bassIdx = b === 0 || b === 2 ? 0 : 2;
      // 1: baixo; 1-e: 5ª (índice 2); 1-&: 3ª (1); 1-a: topo (3).
      emit({ select: bassIdx, offset: 0, dur: 0.26, style: "pluck", velMult: b === 0 ? 1.0 : 0.92 });
      emit({ select: 2, offset: 0.25, dur: 0.22, style: "pluck", velMult: 0.74 });
      emit({ select: 1, offset: 0.5, dur: 0.22, style: "pluck", velMult: 0.8 });
      emit({ select: 3, offset: 0.75, dur: 0.22, style: "pluck", velMult: 0.72 });
    },
  },
};

function refreshSampleExecutionLoop() {
  stopSampleExecutionLoop();
  if (!audioUserEnabled || !audio.ctx || audio.ctx.state !== "running") return;
  const soundMode = document.getElementById("soundMode")?.value ?? "synth";
  if (soundMode !== "sample" || !audio.instrumentSampler || !audio.scaleSampleBus) return;
  // Nota: o reset do playhead da sequência acontece só no toggleAudio de
  // arranque (start "fresco"). refreshSampleExecutionLoop é disparada também
  // em onContextChange (mudança de escala, tônica, etc.); nesses casos
  // resetar o contador faria a progressão saltar para o compasso 0 sempre
  // que o applyScale dispara onChange do scaleType — bug visível como
  // "a sequência nunca avança".

  // Assinatura do acorde anterior e estilo — usada para cortar vozes
  // sustentadas quando a harmonia muda (evita "mudo" em padrões block/strum_ballad
  // e bigger ringing entre transições de acorde).
  let lastHarmSig = "";
  let lastHarmStyle = "";
  const SUSTAIN_HEAVY = new Set([
    "sustain",
    "block_whole",
    "block_half",
    "strum_ballad",
  ]);

  const step = () => {
    if (!audioUserEnabled || !audio.ctx || audio.ctx.state !== "running") return;
    // Export em modo render: verifica se já atingimos N ciclos e pára a
    // gravação. Não trava o step — o áudio continua a correr normalmente.
    exportCheckRenderStop();
    const tcp = currentTonicPc();
    const ivals = currentIvals();
    const baseOct = slotsPlaybackBaseOct();
    const t = audio.ctx.currentTime + 0.01;
    const bpm = currentBpm();
    const beat = 60 / bpm;
    const style = document.getElementById("playStyle")?.value || "sustain";
    const tonicStyle = document.getElementById("tonicStyle")?.value || "sustain";
    const slotMixMode = document.getElementById("slotMixMode")?.value || "combined";
    const slotStates = readSlotsState();
    const hasActiveSlots = slotStates.some((st) => st.on);
    const slotsIsolated = slotMixMode === "isolated" && hasActiveSlots;

    // Drone/tônica
    if (!slotsIsolated && document.getElementById("droneOn")?.checked) {
      const midi = midiTonic(tcp, currentTonicOctave());
      const droneVol = Number(document.getElementById("droneVol").value) / 100;
      const peak = Math.max(0.04, Math.min(0.22, droneVol * 0.2));
      const dur = tonicStyle === "pluck" ? 0.26 : tonicStyle === "pulse" ? 0.42 : 0.9;
      if (tonicStyle === "sustain") {
        if (sampleTonicNextAt <= t) {
          const longDur = 2.2;
          audio.instrumentSampler.playNoteAt(audio.scaleSampleBus, midi, t, peak, longDur);
          sampleTonicNextAt = t + 1.25;
        }
      } else if (tonicStyle === "sustain_lock") {
        if (sampleTonicNextAt <= t) {
          const lockDur = 8.0;
          audio.instrumentSampler.playNoteAt(audio.scaleSampleBus, midi, t, peak, lockDur);
          // Reataque raro e com sobreposição para manter sensação contínua.
          sampleTonicNextAt = t + 6.8;
        }
      } else {
        audio.instrumentSampler.playNoteAt(audio.scaleSampleBus, midi, t, peak, dur);
      }
    } else {
      sampleTonicNextAt = 0;
    }

    // Harmonia base (acorde em amostras; pode silenciar só o acorde)
    // Se a sequência de acordes estiver ativa, a progressão sobrepõe-se à
    // harmonyBase estática: o acorde vem do step atual; se falhar (sequência
    // vazia ou inválida), cai no comportamento normal.
    const progStep = getActiveProgressionStep();
    const harmIdRaw = progStep
      ? "deg1"
      : document.getElementById("harmonyBase")?.value ?? "off";
    const muteHarmChords = harmonyChordSamplesMuted();
    if (!slotsIsolated && harmIdRaw !== "off" && !muteHarmChords && audio.harmStabBus) {
      const harmMidisRaw = progStep
        ? chordMidisAbsolute(progStep.step.chord, baseOct)
        : harmonyMidis(tcp, effectiveStaticHarmonyIvals(), harmIdRaw, baseOct);
      // --- Normalização por instrumento ---------------------------------
      // Garante que o MESMO acorde soa "igual" em qualquer fonte sonora:
      // registro dentro do sweet-spot do instrumento, ganho calibrado, e
      // override de articulação (pluck) para packs percussivos.
      const normH = globalThis.HLChordNormalizer
        ? HLChordNormalizer.normalizeChord(harmMidisRaw, currentBankId())
        : { midis: harmMidisRaw, gainScale: 1, styleOverride: undefined };
      const harmMidis = normH.midis;
      const harmVol = Number(document.getElementById("harmVol").value) / 100;
      // Ganho extra aplicado só quando a sequência está ativa. Permite
      // destacá-la em relação à harmonia estática sem forçar o utilizador
      // a mexer no `harmVol` geral. Faixa: 0–200% (slider), default 100%.
      const progVolEl = document.getElementById("progVol");
      const progBoost = progStep ? Math.max(0, Number(progVolEl?.value ?? 100)) / 100 : 1;
      // Em progressão, abrimos o teto do peak (até 0.32) para que o slider
      // consiga efetivamente aumentar. Sem isso o clamp em 0.16 mascara o boost.
      const peakHi = progStep ? 0.32 : 0.16;
      // gainScale do perfil aplicado ANTES do clamp: equaliza loudness entre
      // packs (trompete "hot" desce ~0.9, fagote/contrabaixo sobem ~1.05–1.10).
      const peak = Math.max(0.04, Math.min(peakHi, harmVol * 0.14 * progBoost * (normH.gainScale ?? 1)));
      const harmonyStyleRaw = effectiveHarmonyExecStyle();
      const harmonyStyle = resolveStyleOverride(harmonyStyleRaw, normH);
      const absBeat = sampleHarmonyBeatIndex;
      // Teto de segurança por nota (anti-clip): mais alto quando em progressão.
      const perNoteCap = progStep ? 0.42 : 0.22;

      // --- Transição limpa entre acordes ---------------------------------
      // Se o acorde mudou (assinatura de MIDIs) e o padrão é do tipo sustain
      // — sustain/block_whole/block_half/strum_ballad — cortamos as vozes
      // anteriores com um fade curto antes de atacar o novo acorde.  Sem isto,
      // o acorde antigo continua a ressoar por cima do novo; soa "sujo" mesmo
      // com dur ligeiramente aparada. Se o padrão for staccato (pluck, arpejos)
      // o decaimento natural já trata da transição.
      const sig = harmMidis.join(",");
      const chordChanged = lastHarmSig !== "" && sig !== lastHarmSig;
      const styleChanged = lastHarmStyle && lastHarmStyle !== harmonyStyle;
      if (
        (chordChanged || styleChanged) &&
        (SUSTAIN_HEAVY.has(lastHarmStyle) || SUSTAIN_HEAVY.has(harmonyStyle))
      ) {
        // Corta SÓ as vozes no bus de harmonia (harmStabBus) — drone/slots/
        // escala no `scaleSampleBus` continuam intactos. Não tocamos no ganho
        // do bus para não silenciar o próximo ataque.
        audio.instrumentSampler?.stopVoicesOnDest?.(audio.harmStabBus, 0.04);
      }
      lastHarmSig = sig;
      lastHarmStyle = harmonyStyle;

      const ctxNowUi = audio.ctx.currentTime;
      if (sig !== lastHarmHearStripSig) {
        lastHarmHearStripSig = sig;
        renderHarmonyHearPillsFromMidis(harmMidis);
      }
      clearHarmonyHearTimers();
      const harmHearEvents = [];
      executeHarmonyPattern({
        styleKey: harmonyStyle,
        chord: harmMidis,
        beat,
        absBeat,
        peak,
        schedule: ({ midi, offset, dur, style, velMult }) => {
          harmHearEvents.push({ midi, offset, dur });
          const p = Math.max(0.012, Math.min(perNoteCap, peak * (velMult ?? 1)));
          audio.instrumentSampler.playNoteAt(audio.harmStabBus, midi, t + offset, p, dur, style);
        },
      });
      scheduleHarmonyHearHighlights(t, harmHearEvents, ctxNowUi);
      // Mantém compatibilidade com o antigo contador de "arpeggio": alguns
      // pontos do UI ainda podem lê-lo, e é barato atualizar.
      if (harmonyStyle === "arpeggio") sampleHarmonyArpIndex += 1;
    } else {
      lastHarmHearStripSig = "";
      clearHarmonyHearVisuals();
    }

    // Linha de baixo (pode usar harmonia ou só I se «harmonia desligada»)
    const bassMode = document.getElementById("harmonyBassMode")?.value ?? "off";
    const harmIdForBass = effectiveHarmonyIdForBassSamples(harmIdRaw);
    if (!slotsIsolated && harmIdForBass !== "off" && bassMode !== "off" && audio.instrumentSampler) {
      // Em modo sequência, o baixo segue o acorde atual via ivals sintéticos
      // ancorados no chord.rootPc — os padrões (ostinato 1-5-1-3 etc.) continuam
      // a funcionar com os graus 1/3/5/7 do próprio acorde.
      const bassTonicPc = progStep ? progStep.step.chord.rootPc : tcp;
      const bassIvals = progStep ? progSyntheticIvalsForChord(progStep.step.chord) : effectiveStaticHarmonyIvals();
      const bassHarmId = progStep ? "deg1" : harmIdForBass;
      const bassOff = readHarmonyBassSemitoneOffset();
      const bMidiRaw = nextHarmonyBassMidi(
        bassTonicPc,
        bassIvals,
        bassHarmId,
        baseOct,
        bassMode,
        sampleBassPatIndex,
        bassOff
      );
      sampleBassPatIndex += 1;
      if (bMidiRaw != null) {
        // Normalização por instrumento: desloca por oitavas até ao sweet-spot
        // do pack activo (ex.: contrabaixo → MIDI 28–48), aplica gainScale
        // específico e força "pluck" se o perfil for percussivo.
        const normB = globalThis.HLChordNormalizer
          ? HLChordNormalizer.normalizeSingleNote(bMidiRaw, currentBassBankId())
          : { midi: bMidiRaw, gainScale: 1, styleOverride: undefined };
        const bMidi = normB.midi;
        const bassVol = Number(document.getElementById("harmonyBassVol")?.value ?? 44) / 100;
        const bPeak = Math.max(0.04, Math.min(0.2, bassVol * 0.17 * (normB.gainScale ?? 1)));
        const hStyleRaw0 = effectiveHarmonyExecStyle();
        const hStyleRaw = hStyleRaw0 === "arpeggio_full" ? "sustain" : hStyleRaw0;
        const hStyle = resolveStyleOverride(hStyleRaw, normB);
        // Duração: para walking bass/ostinato fica mais limpo se a nota não invade
        // o próximo tempo. Antes `beat * 0.98` gerava sobreposição constante com o
        // release das samples; agora ~70% do beat deixa respiro entre notas.
        const bDur =
          hStyle === "pluck"
            ? Math.max(0.14, Math.min(0.38, beat * 0.42))
            : Math.max(0.22, Math.min(0.62, beat * 0.7));
        // Se o user escolheu banco dedicado para o baixo, usa bassSampler;
        // caso contrário cai no sampler principal (comportamento histórico).
        const bassSampler = audio.bassSampler || audio.instrumentSampler;
        bassSampler.playNoteAt(audio.scaleSampleBus, bMidi, t + 0.006, bPeak, bDur, hStyle);
      }
    }

    // Slots manuais
    const vol = Number(document.getElementById("slotsVol").value) / 100;
    const peak = Math.max(0.06, Math.min(0.22, vol * 0.16));
    const activeSlots = slotStates.filter((st) => st.on);
    if (style === "arpeggio") {
      if (activeSlots.length) {
        const idx = sampleSlotsArpIndex % activeSlots.length;
        sampleSlotsArpIndex += 1;
        const st = activeSlots[idx];
        const notes = chordMidisFromSlotState(st, tcp, ivals, baseOct);
        const slotDur = Math.max(0.1, Math.min(0.34, beat * 0.45));
        const pk = peak / Math.sqrt(notes.length);
        notes.forEach((midi) => {
          audio.instrumentSampler.playNoteAt(audio.scaleSampleBus, midi, t, pk, slotDur, "arpeggio");
        });
      }
    } else if (style === "arpeggio_full") {
      if (activeSlots.length) {
        const idx = sampleSlotsArpIndex % activeSlots.length;
        sampleSlotsArpIndex += 1;
        const st = activeSlots[idx];
        const notes = chordMidisFromSlotState(st, tcp, ivals, baseOct);
        const gap = Math.max(0.014, Math.min(beat / (notes.length + 1), 0.085));
        const noteDur = Math.min(0.32, gap * 2.6);
        const pk = peak / Math.sqrt(notes.length);
        notes.forEach((midi, i) => {
          audio.instrumentSampler.playNoteAt(audio.scaleSampleBus, midi, t + i * gap, pk, noteDur, "arpeggio");
        });
      }
    } else {
      const dur = style === "pluck" ? Math.max(0.08, Math.min(0.26, beat * 0.35)) : Math.max(0.2, Math.min(0.9, beat * 0.9));
      activeSlots.forEach((st) => {
        const notes = chordMidisFromSlotState(st, tcp, ivals, baseOct);
        const pk = peak / Math.sqrt(notes.length);
        notes.forEach((midi) => {
          audio.instrumentSampler.playNoteAt(audio.scaleSampleBus, midi, t, pk, dur, style);
        });
      });
    }

    // ---- Solo / Improvisação ------------------------------------------------
    // Progressão: adapta ao acorde do step. Modo estático: tríade I na escala
    // escolhida para o solo (sem precisar da sequência).
    const soloEnabled = document.getElementById("soloEnabled")?.checked;
    if (soloEnabled && audio.instrumentSampler) {
      const ctxSolo = resolveSoloChordAndScale(tcp);
      const chord = ctxSolo.chord;
      if (chord && chord.intervals && chord.rootPc != null) {
        const scaleIvals = ctxSolo.scaleIvals;
        const soloPattern = document.getElementById("soloPattern")?.value || "arp_up";
        const soloRhythm = document.getElementById("soloRhythm")?.value || "swing";
        const soloVol = Number(document.getElementById("soloVol")?.value ?? 60) / 100;
        const soloOct = Number(document.getElementById("soloOctave")?.value ?? 4);

        const soloChordSig = `${ctxSolo.fromProgression ? "P" : "S"}|${chord.rootPc}|${chord.intervals.join(",")}|${ctxSolo.scaleKey}`;
        if (soloChordSig !== lastSoloChordSig) {
          lastSoloChordSig = soloChordSig;
          soloPatIndex = 0;
        }

        const { offsets, durs } = soloRhythmOffsets(soloRhythm, beat, sampleHarmonyBeatIndex % 4);
        const soloHear = document.getElementById("soloHearLine");
        if (offsets.length > 0) {
          const degrees = generateSoloDegrees(soloPattern, chord.intervals, scaleIvals, soloPatIndex, offsets.length);
          soloPatIndex += offsets.length;
          const peak = Math.max(0.04, Math.min(0.2, soloVol * 0.18));
          const pfSolo = preferFlats();
          const soloBits = [];
          for (let i = 0; i < degrees.length; i += 1) {
            const semitones = degrees[i];
            const rawMidi = 12 * (soloOct + 1) + chord.rootPc + semitones;
            const midi = soloMidiToPlayableRange(rawMidi, chord.rootPc, soloOct);
            soloBits.push(midiNoteLabel(midi, pfSolo));
            audio.instrumentSampler.playNoteAt(audio.scaleSampleBus, midi, t + offsets[i], peak, durs[i]);
          }
          if (soloHear) {
            soloHear.textContent = soloBits.length ? `Solo (esta batida): ${soloBits.join(" · ")}` : "";
          }
        } else if (soloHear) {
          soloHear.textContent = "";
        }
      }
    } else {
      const sl = document.getElementById("soloHearLine");
      if (sl) sl.textContent = "";
    }

    sampleHarmonyBeatIndex += 1;
  };

  // Agendamento auto-encadeado: lê o BPM corrente em cada iteração (sem drift e sem
  // reinícios quando o utilizador ajusta o andamento).
  let nextAt = (audio.ctx?.currentTime ?? 0) + 60 / currentBpm();
  const scheduleNext = () => {
    if (!audioUserEnabled || !audio.ctx || audio.ctx.state !== "running") return;
    step();
    // Avança a sequência de acordes (uma batida por tick). Se a escala do step
    // mudar e `applyScale` estiver ativo, progTickBeat dispara onContextChange
    // via o evento change no select #scaleType.
    progTickBeat();
    nextAt += 60 / currentBpm();
    const now = audio.ctx.currentTime;
    const waitMs = Math.max(20, (nextAt - now) * 1000);
    sampleStepTimer = setTimeout(scheduleNext, waitMs);
  };
  step();
  sampleStepTimer = setTimeout(scheduleNext, Math.max(20, (60 / currentBpm()) * 1000));
}

function updateSampleControlsEnabled() {
  const sm = document.getElementById("soundMode")?.value === "sample";
  ["bankInstrument", "bassBankInstrument"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !sm;
  });
}

// ---------------------------------------------------------------------------
// Export MP3 — gravação sobre o AudioContext ao vivo, encode via lamejs.
//
// Dois modos:
//   • render: user escolhe N ciclos da progressão; o app arranca a progressão,
//     inicia a gravação, e pára ao completar N ciclos.
//   • live: botão Começar inicia, Parar para. User controla a duração.
//
// Em ambos, o pipeline é: MediaStreamDestination (ligado ao dry+wet pós-limiter)
// → MediaRecorder (WebM/Opus) → decodeAudioData → PCM 16-bit → lamejs → MP3.
// Aceita-se o duplo-encode (Opus→MP3) como limitação v1; próxima iteração
// usará AudioWorklet para PCM puro.
// ---------------------------------------------------------------------------

const exportState = {
  mediaRec: null,
  chunks: [],
  active: false,
  mode: "idle", // "idle" | "render" | "live"
  renderTargetBeats: 0,
  renderStartBeatIndex: 0,
  startedAt: 0,
  tickTimer: null,
};

function setExportStatus(msg, kind = "info") {
  const el = document.getElementById("exportStatus");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("is-recording", kind === "recording");
  el.classList.toggle("is-done", kind === "done");
}

function floatToInt16(floats) {
  const out = new Int16Array(floats.length);
  for (let i = 0; i < floats.length; i += 1) {
    const s = Math.max(-1, Math.min(1, floats[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function encodeMp3FromAudioBuffer(buf, bitrate) {
  // lamejs UMD expõe `lamejs.Mp3Encoder`.
  const lame = globalThis.lamejs;
  if (!lame || !lame.Mp3Encoder) {
    throw new Error("lamejs não carregado — verifica a ligação à CDN.");
  }
  const channels = Math.min(2, buf.numberOfChannels);
  const enc = new lame.Mp3Encoder(channels, buf.sampleRate, bitrate);
  const left = floatToInt16(buf.getChannelData(0));
  const right = channels > 1 ? floatToInt16(buf.getChannelData(1)) : left;
  const chunks = [];
  const frameSize = 1152;
  for (let i = 0; i < left.length; i += frameSize) {
    const l = left.subarray(i, i + frameSize);
    const r = right.subarray(i, i + frameSize);
    const out = enc.encodeBuffer(l, r);
    if (out.length) chunks.push(out);
  }
  const tail = enc.flush();
  if (tail.length) chunks.push(tail);
  return new Blob(chunks, { type: "audio/mpeg" });
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function pickMediaRecorderMime() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "",
  ];
  for (const m of candidates) {
    if (!m) return "";
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

async function startExportRecording() {
  if (exportState.active) return;
  if (!audio.ctx || !audio.recDest) {
    setExportStatus("Ativa o áudio antes de exportar.", "info");
    return;
  }
  if (!globalThis.lamejs?.Mp3Encoder) {
    setExportStatus("lamejs não carregou — sem internet? Tenta de novo.", "info");
    return;
  }
  try {
    await audio.ctx.resume();
  } catch (_) { /* ignore */ }
  const mimeType = pickMediaRecorderMime();
  const opts = mimeType ? { mimeType } : undefined;
  let rec;
  try {
    rec = new MediaRecorder(audio.recDest.stream, opts);
  } catch (err) {
    setExportStatus(`MediaRecorder falhou: ${err?.message ?? err}`, "info");
    return;
  }
  exportState.mediaRec = rec;
  exportState.chunks = [];
  exportState.active = true;
  exportState.startedAt = Date.now();
  rec.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) exportState.chunks.push(ev.data);
  };
  rec.onstop = () => {
    void finalizeExport();
  };
  rec.start(250); // chunk a cada 250ms para robustez
  setExportStatus("A gravar…", "recording");
  // Atualiza contador de tempo
  if (exportState.tickTimer) clearInterval(exportState.tickTimer);
  exportState.tickTimer = setInterval(() => {
    if (!exportState.active) return;
    const s = ((Date.now() - exportState.startedAt) / 1000).toFixed(1);
    setExportStatus(
      exportState.mode === "render"
        ? `A gravar (render)… ${s}s`
        : `A gravar (live)… ${s}s`,
      "recording",
    );
  }, 200);
}

function stopExportRecording() {
  if (!exportState.active || !exportState.mediaRec) return;
  exportState.active = false;
  if (exportState.tickTimer) {
    clearInterval(exportState.tickTimer);
    exportState.tickTimer = null;
  }
  try {
    exportState.mediaRec.stop();
  } catch (_) { /* ignore */ }
  setExportStatus("A codificar MP3…", "info");
}

async function finalizeExport() {
  const chunks = exportState.chunks;
  exportState.chunks = [];
  exportState.mediaRec = null;
  if (!chunks.length) {
    setExportStatus("Nada gravado — o áudio estava em silêncio?", "info");
    return;
  }
  const mime = chunks[0].type || "audio/webm";
  const blob = new Blob(chunks, { type: mime });
  try {
    const arrayBuf = await blob.arrayBuffer();
    // Decodifica em ctx offline para não colidir com o ctx ao vivo
    const offline = new OfflineAudioContext(2, 44100, 44100);
    const decoded = await offline.decodeAudioData(arrayBuf);
    const bitrate = Number(document.getElementById("exportBitrate")?.value || 192);
    const mp3Blob = encodeMp3FromAudioBuffer(decoded, bitrate);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    triggerDownload(mp3Blob, `harmonic-lab-${stamp}.mp3`);
    setExportStatus(
      `Exportado (${(mp3Blob.size / 1024).toFixed(0)} KB, ${decoded.duration.toFixed(1)}s).`,
      "done",
    );
  } catch (err) {
    console.error("Harmonic Lab: falha no encode MP3.", err);
    setExportStatus(`Falha ao codificar: ${err?.message ?? err}`, "info");
  }
}

/** Invocado pelo execution loop a cada step em modo render para verificar se
 *  já atingimos o número de beats alvo e parar a gravação. */
function exportCheckRenderStop() {
  if (!exportState.active || exportState.mode !== "render") return;
  const elapsedBeats = sampleHarmonyBeatIndex - exportState.renderStartBeatIndex;
  if (elapsedBeats >= exportState.renderTargetBeats) {
    stopExportRecording();
    exportState.mode = "idle";
  }
}

function populateSelects() {
  const tonic = document.getElementById("tonic");
  TONIC_OPTIONS.forEach((n) => {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    tonic.appendChild(o);
  });
  tonic.value = "C";

  const scaleType = document.getElementById("scaleType");
  scaleType.innerHTML = "";
  SCALE_SELECT_GROUPS.forEach((g) => {
    const og = document.createElement("optgroup");
    og.label = g.label;
    g.keys.forEach((k) => {
      const def = SCALE_TYPES[k];
      if (!def) return;
      const o = document.createElement("option");
      o.value = k;
      o.textContent = def.label;
      og.appendChild(o);
    });
    scaleType.appendChild(og);
  });
  scaleType.value = "major";

  populateSoloScaleSelect();
  populateProgHarmonyStyleSelect();

  // Clona optgroups/options do #bankInstrument para #bassBankInstrument — mantém
  // a lista em sincronia sem duplicar o markup. O primeiro <option value="match">
  // permanece (definido no HTML); acrescentamos o resto por baixo.
  const bank = document.getElementById("bankInstrument");
  const bassBank = document.getElementById("bassBankInstrument");
  if (bank && bassBank) {
    Array.from(bank.children).forEach((child) => {
      // Pula o "Som interno (síntese)" — em baixo faz pouco sentido e complica
      // o contrato "match | instrumento real". Só clona optgroups.
      if (child.tagName === "OPTGROUP") {
        bassBank.appendChild(child.cloneNode(true));
      }
    });
  }
}

function currentIvals() {
  const key = document.getElementById("scaleType").value;
  return SCALE_TYPES[key]?.intervals ?? SCALE_TYPES["major"].intervals;
}

function currentTonicPc() {
  return parseTonic(document.getElementById("tonic").value);
}

function preferFlats() {
  return document.getElementById("preferFlats").checked;
}

/** Rótulo do passo entre dois graus consecutivos, em número de semitons. */
function stepLabel(semitones) {
  if (semitones === 1) return { text: "S", title: "semitom (1)" };
  if (semitones === 2) return { text: "T", title: "tom (2)" };
  if (semitones === 3) return { text: "T+S", title: "1 tom e meio (3 semitons)" };
  if (semitones === 4) return { text: "2T", title: "2 tons (4 semitons)" };
  return { text: `${semitones}`, title: `${semitones} semitons` };
}

/** Devolve os passos (em semitons) entre graus consecutivos da escala, fechando na oitava. */
function scaleSteps(ivals) {
  const n = ivals.length;
  const steps = [];
  for (let i = 0; i < n; i += 1) {
    const next = i + 1 < n ? ivals[i + 1] : ivals[0] + 12;
    steps.push(next - ivals[i]);
  }
  return steps;
}

/**
 * Renderiza o cabeçalho da escala atual: nome + diagrama de passos T/S +
 * faixa cromática (12 segmentos) destacando os pitches que pertencem à escala.
 */
function renderScaleMeta() {
  const host = document.getElementById("scaleMeta");
  if (!host) return;
  host.innerHTML = "";

  const ivals = currentIvals();
  const tcp = currentTonicPc();
  const pf = preferFlats();
  const scaleKey = document.getElementById("scaleType").value;
  const scaleLabel = SCALE_TYPES[scaleKey]?.label ?? scaleKey;
  const tonicName = pcToName(tcp, pf);

  // Título: tônica + nome da escala + nº de notas por oitava
  const title = document.createElement("div");
  title.className = "scale-title";
  const tonicEl = document.createElement("span");
  tonicEl.className = "scale-title-tonic";
  tonicEl.textContent = tonicName;
  const nameEl = document.createElement("span");
  nameEl.className = "scale-title-name";
  nameEl.textContent = scaleLabel;
  const countEl = document.createElement("span");
  countEl.className = "scale-title-count";
  countEl.textContent = `${ivals.length} notas / oitava`;
  title.appendChild(tonicEl);
  title.appendChild(nameEl);
  title.appendChild(countEl);
  host.appendChild(title);

  // Diagrama de passos T/S (largura proporcional ao tamanho do intervalo)
  const stepsRow = document.createElement("div");
  stepsRow.className = "scale-steps";
  const stepsLabel = document.createElement("span");
  stepsLabel.className = "scale-steps-label";
  stepsLabel.textContent = "Passos:";
  stepsRow.appendChild(stepsLabel);
  const stepsTrack = document.createElement("div");
  stepsTrack.className = "scale-steps-track";
  const steps = scaleSteps(ivals);
  for (const s of steps) {
    const cell = document.createElement("div");
    cell.className = `scale-step scale-step-${s}`;
    cell.style.flex = String(s);
    const lbl = stepLabel(s);
    cell.textContent = lbl.text;
    cell.title = lbl.title;
    stepsTrack.appendChild(cell);
  }
  stepsRow.appendChild(stepsTrack);
  host.appendChild(stepsRow);

  // Faixa cromática: 12 segmentos, destaca os pitches que pertencem à escala.
  const chromaRow = document.createElement("div");
  chromaRow.className = "scale-chroma";
  const chromaLabel = document.createElement("span");
  chromaLabel.className = "scale-chroma-label";
  chromaLabel.textContent = "Cromática:";
  chromaRow.appendChild(chromaLabel);
  const chromaTrack = document.createElement("div");
  chromaTrack.className = "scale-chroma-track";
  const inScalePc = new Set(ivals.map((iv) => (tcp + iv) % 12));
  for (let i = 0; i < 12; i += 1) {
    const pc = (tcp + i) % 12;
    const cell = document.createElement("div");
    cell.className = "scale-chroma-cell";
    if (inScalePc.has(pc)) cell.classList.add("is-in");
    if (i === 0) cell.classList.add("is-tonic");
    cell.textContent = pcToName(pc, pf);
    cell.title = inScalePc.has(pc) ? "pertence à escala" : "fora da escala";
    chromaTrack.appendChild(cell);
  }
  chromaRow.appendChild(chromaTrack);
  host.appendChild(chromaRow);
}

function renderDegreeStrip() {
  const strip = document.getElementById("degreeStrip");
  strip.innerHTML = "";
  const ivals = currentIvals();
  const tcp = currentTonicPc();
  const pf = preferFlats();
  const baseOct = slotsPlaybackBaseOct();

  const n = ivals.length;
  for (let deg = 1; deg <= MAX_DEGREE_LABEL; deg += 1) {
    const col = document.createElement("div");
    col.className = "degree-col";
    col.dataset.degree = String(deg);
    const ext = romanForExtendedDegree(ivals, deg);
    const romanEl = document.createElement("div");
    romanEl.className = "roman";
    romanEl.textContent = ext.roman;
    const notePc = (tcp + degreeToSemitonesFromTonic(ivals, deg)) % 12;
    const noteEl = document.createElement("div");
    noteEl.className = "degree-note";
    noteEl.textContent = pcToName(notePc, pf);
    const meta = document.createElement("div");
    meta.className = "degree-meta";
    if (deg > n) {
      const inner = ((deg - 1) % n) + 1;
      const o = Math.floor((deg - 1) / n);
      if (n === 7) {
        const { quality } = romanForDegree(ivals, inner);
        meta.textContent = `Grau ${inner} · +${o} oit. · tríade: ${triadQualityPt(quality)}`;
      } else {
        meta.textContent = `Grau ${inner} · +${o} oit.`;
      }
    } else if (n === 7) {
      const { quality } = romanForDegree(ivals, deg);
      meta.textContent = triadQualityPt(quality);
    } else {
      meta.textContent = `${n} alturas / oitava`;
    }
    col.appendChild(romanEl);
    col.appendChild(noteEl);
    col.appendChild(meta);
    strip.appendChild(col);
  }
}

/**
 * Conjunto de pcs (0–11) diatónicos à escala actual. Usado para marcar os
 * botões cromáticos do slot com indicação visual de pertença à escala.
 */
function diatonicPcSet(tcp, ivals) {
  const out = new Set();
  ivals.forEach((semi) => out.add(((tcp + semi) % 12 + 12) % 12));
  return out;
}

/**
 * Devolve o grau hepta- (1..ivals.length) correspondente ao pc, ou `null`
 * se o pc não for diatónico à escala actual. Usado apenas para rotular o
 * slot com o romano quando a nota escolhida é diatónica.
 */
function scaleDegreeForPc(pc, tcp, ivals) {
  const n = ivals.length;
  for (let d = 0; d < n; d += 1) {
    if (((tcp + ivals[d]) % 12 + 12) % 12 === pc) return d + 1;
  }
  return null;
}

/** Rótulo do slot para a nota escolhida (nome + romano quando diatónica). */
function formatSlotChromaticLabel(pc, tcp, ivals, preferFl) {
  const name = pcToName(pc, preferFl);
  const d = scaleDegreeForPc(pc, tcp, ivals);
  if (d == null) return `${name} — fora da escala`;
  const r = romanForExtendedDegree(ivals, d).roman;
  return `${d}: ${r} — ${name}`;
}

function refreshSlotRow(slot) {
  const slotI = Number(slot.dataset.index);
  const slotIdx = Number.isFinite(slotI) ? slotI : 0;
  const iv = currentIvals();
  const tcp = currentTonicPc();
  const pf = preferFlats();
  const dia = diatonicPcSet(tcp, iv);
  const pc = ((Number(slot.dataset.pc ?? 0) % 12) + 12) % 12;
  const oct = Number(slot.dataset.oct ?? 0);

  // Actualiza os botões da barra cromática (nomes + marcador diatónico + seleção)
  const bar = slot.querySelector(".slot-chroma-bar");
  if (bar) {
    bar.querySelectorAll(".chroma-pc").forEach((btn) => {
      const btnPc = Number(btn.dataset.pc);
      btn.textContent = pcToName(btnPc, pf);
      btn.classList.toggle("diatonic", dia.has(btnPc));
      btn.classList.toggle("selected", btnPc === pc);
      const d = scaleDegreeForPc(btnPc, tcp, iv);
      btn.title = d != null
        ? `Grau ${d} (${romanForExtendedDegree(iv, d).roman}) — ${pcToName(btnPc, pf)}`
        : `Fora da escala — ${pcToName(btnPc, pf)}`;
    });
  }

  // Rótulos agregados (roman, intervalo, index)
  const roman = slot.querySelector(".slot-roman");
  const inter = slot.querySelector(".slot-interval");
  const idx = slot.querySelector(".slot-index");
  const d = scaleDegreeForPc(pc, tcp, iv);
  if (roman) roman.textContent = d != null ? romanForExtendedDegree(iv, d).roman : "—";
  if (inter) {
    const semi = ((pc - tcp) % 12 + 12) % 12;
    inter.textContent = intervalNameFromTonic(semi);
  }
  if (idx) {
    idx.textContent = `Slot ${slotIdx + 1}\n${formatSlotChromaticLabel(pc, tcp, iv, pf)}`;
  }

  // Etiqueta auxiliar do campo "Nota" (caso alguém a mantenha por acessibilidade)
  const noteLabel = slot.querySelector(".slot-deg-label");
  if (noteLabel) noteLabel.textContent = "Nota";

  // Reflecte oct no eventual `<select>` caso exista (robustez a reuso de DOM)
  const octSel = slot.querySelector('select[data-field="oct"]');
  if (octSel) octSel.value = String(oct);
}

function buildSlots() {
  const root = document.getElementById("slots");
  root.innerHTML = "";

  const ivalsInit = currentIvals();
  const tcpInit = currentTonicPc();

  for (let i = 0; i < 8; i += 1) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.index = String(i);

    // --- PC inicial: seed diatónico da escala actual (congela a nota que o
    // usuário ouve na primeira vez). Mudar escala/tónica depois não altera
    // este valor — é isso que permite «experimentalismo» fora da escala.
    const nInit = ivalsInit.length;
    const seedStep = i % nInit;
    const seedOct = Math.max(-1, Math.min(2, Math.floor(i / nInit)));
    const seedPc = ((tcpInit + ivalsInit[seedStep]) % 12 + 12) % 12;
    slot.dataset.pc = String(seedPc);
    slot.dataset.oct = String(seedOct);

    const idx = document.createElement("div");
    idx.className = "slot-index";

    const roman = document.createElement("div");
    roman.className = "slot-roman";

    const inter = document.createElement("div");
    inter.className = "slot-interval";

    const on = document.createElement("input");
    on.type = "checkbox";
    on.checked = false;
    on.addEventListener("change", () => {
      slot.classList.toggle("on", on.checked);
      scheduleSyncAudio();
      updateSlotsMissingNotes();
    });

    // Barra cromática: 12 botões (C, C#, D, ..., B). Cada botão define s.pc.
    const bar = document.createElement("div");
    bar.className = "slot-chroma-bar";
    bar.setAttribute("role", "radiogroup");
    bar.setAttribute("aria-label", "Classe de altura do slot");
    for (let p = 0; p < 12; p += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chroma-pc";
      btn.dataset.pc = String(p);
      btn.setAttribute("role", "radio");
      btn.addEventListener("click", () => {
        slot.dataset.pc = String(p);
        refreshSlotRow(slot);
        scheduleSyncAudio();
        updateSlotsMissingNotes();
      });
      bar.appendChild(btn);
    }

    const octSel = document.createElement("select");
    octSel.dataset.field = "oct";
    for (let o = -1; o <= 2; o += 1) {
      const opt = document.createElement("option");
      opt.value = String(o);
      opt.textContent = o >= 0 ? `+${o} 8va` : `${o} 8va`;
      octSel.appendChild(opt);
    }
    octSel.value = String(seedOct);

    const wrapOn = document.createElement("label");
    wrapOn.className = "field field-inline";
    wrapOn.appendChild(document.createElement("span")).textContent = "Ativo";
    wrapOn.appendChild(on);

    const noteLabel = document.createElement("span");
    noteLabel.className = "slot-deg-label";
    noteLabel.textContent = "Nota";

    const wrapNote = document.createElement("div");
    wrapNote.className = "field field-block";
    wrapNote.appendChild(noteLabel);
    wrapNote.appendChild(bar);

    const wrapOct = document.createElement("label");
    wrapOct.className = "field field-inline";
    wrapOct.appendChild(document.createElement("span")).textContent = "Oitava";
    wrapOct.appendChild(octSel);

    slot.appendChild(idx);
    slot.appendChild(roman);
    slot.appendChild(inter);
    slot.appendChild(wrapOn);
    slot.appendChild(wrapNote);
    slot.appendChild(wrapOct);

    refreshSlotRow(slot);

    octSel.addEventListener("change", () => {
      slot.dataset.oct = String(Number(octSel.value));
      refreshSlotRow(slot);
      scheduleSyncAudio();
    });

    if (on.checked) slot.classList.add("on");

    root.appendChild(slot);
  }
}

/** Atualiza rótulos dos slots sem destruir estado (ativos, graus, oitavas). */
function refreshAllSlotsUI() {
  document.querySelectorAll(".slot").forEach((slot) => refreshSlotRow(slot));
}

function readSlotsState() {
  const slotsEl = document.querySelectorAll(".slot");
  const out = [];
  slotsEl.forEach((slot) => {
    const on = slot.querySelector('input[type="checkbox"]')?.checked ?? false;
    const pcRaw = Number(slot.dataset.pc);
    const octFromDs = Number(slot.dataset.oct);
    const octSelEl = slot.querySelector('select[data-field="oct"]');
    const pc = Number.isFinite(pcRaw) ? ((pcRaw % 12) + 12) % 12 : 0;
    const oct = Number.isFinite(octFromDs)
      ? octFromDs
      : Number(octSelEl?.value ?? 0);
    // `chordType` mantido por retro-compat; a síntese usa sempre 1 nota por slot.
    out.push({ on, pc, oct, chordType: "maj" });
  });
  return out;
}

function updateSlotsMissingNotes() {
  const el = document.getElementById("slotMissingNotes");
  const states = readSlotsState();
  const active = states.filter((s) => s.on);
  const ivals = currentIvals();
  const tcp = currentTonicPc();
  const pf = preferFlats();

  if (el) {
    // Comparação agora puramente cromática: quais pcs da escala actual estão
    // representados pelos slots activos (independentemente do pc escolhido ser
    // diatónico ou não). Notas fora da escala aparecem como «extras».
    const scalePcs = [];
    const scalePcSet = new Set();
    ivals.forEach((st) => {
      const p = ((tcp + st) % 12 + 12) % 12;
      if (!scalePcSet.has(p)) {
        scalePcs.push(p);
        scalePcSet.add(p);
      }
    });
    const presentPcs = new Set(active.map((s) => ((s.pc % 12) + 12) % 12));
    const missing = scalePcs.filter((p) => !presentPcs.has(p)).map((p) => pcToName(p, pf));
    const extras = [...presentPcs]
      .filter((p) => !scalePcSet.has(p))
      .sort((a, b) => a - b)
      .map((p) => pcToName(p, pf));

    if (!active.length) {
      const base = scalePcs.map((p) => pcToName(p, pf)).join(", ");
      el.textContent = `Notas da escala (nenhum slot ativo): ${base}`;
    } else {
      const parts = [];
      parts.push(missing.length ? `Notas faltantes nos slots: ${missing.join(", ")}` : "Notas faltantes nos slots: —");
      if (extras.length) parts.push(`fora da escala: ${extras.join(", ")}`);
      el.textContent = parts.join(" · ");
    }
  }
  updateSlotChordLabel();
}

function syncAudio() {
  if (!audio.ctx || !audioUserEnabled) return;
  if (audio.ctx.state !== "running") return;
  const tcp = currentTonicPc();
  const ivals = currentIvals();
  const baseOct = slotsPlaybackBaseOct();
  const slotVol = Number(document.getElementById("slotsVol").value) / 100 * 0.35;
  const droneVol = Number(document.getElementById("droneVol").value) / 100 * 0.25;
  const harmVol = Number(document.getElementById("harmVol").value) / 100 * 0.12;
  const soundMode = document.getElementById("soundMode")?.value ?? "synth";

  const droneOn = document.getElementById("droneOn").checked;
  const droneMidi = midiTonic(tcp, currentTonicOctave());
  audio.setDrone(soundMode === "sample" ? false : droneOn, midiToFreq(droneMidi), droneVol);

  const harmId = document.getElementById("harmonyBase").value;
  const muteHarmChords = harmonyChordSamplesMuted();
  const harmMidis = harmonyMidis(tcp, effectiveStaticHarmonyIvals(), harmId, baseOct);
  const freqsH = harmMidis.map((m) => midiToFreq(m));
  const harmVolApplied = soundMode === "sample" ? 0 : harmId === "off" || muteHarmChords ? 0 : harmVol;
  audio.setHarmony(freqsH, harmVolApplied);

  const states = readSlotsState();
  states.forEach((s, i) => {
    // MIDI puramente cromático: independente de `ivals`/`tcp`. A escala no
    // topo é só visualização; o áudio do slot segue o pc escolhido na barra.
    const pc = ((s.pc % 12) + 12) % 12;
    const midi = pc + 12 * (baseOct + 1) + 12 * s.oct;
    const slotOn = soundMode === "sample" ? false : s.on;
    audio.setSlot(i, slotOn, midiToFreq(midi), slotVol);
  });
  if (soundMode !== "sample") {
    audio._harmStabPrimed = false;
    audio._harmStabKey = "";
  } else if (harmId === "off" || harmMidis.length === 0 || muteHarmChords) {
    audio._harmStabKey = "";
  } else if (audio.instrumentSampler && audio.harmStabBus) {
    // Sem `scaleKey` no hash: o acorde independe da escala, então mudar o
    // «Tipo de escala» não deve re-disparar um stab da harmonia.
    const style = effectiveHarmonyExecStyle();
    const hk = `${tcp}|${harmId}|${style}|${muteHarmChords ? 1 : 0}`;
    if (!audio._harmStabPrimed) {
      audio._harmStabPrimed = true;
      audio._harmStabKey = hk;
    } else if (hk !== audio._harmStabKey) {
      audio._harmStabKey = hk;
      const t = audio.ctx.currentTime + 0.04;
      audio.harmStabBus.gain.cancelScheduledValues(t);
      audio.harmStabBus.gain.setValueAtTime(0.58, t);
      // Stab one-shot: usa o mesmo dispatcher para coerência visual/auditiva
      // entre "ao carregar" e "no loop". Cai para um acorde curto em estilos
      // de batida/compasso-based que não fazem sentido como stab único.
      const loopish = new Set([
        "block_whole",
        "block_half",
        "chord_pulse_4",
        "chord_pulse_8",
        "strum_ballad",
        "strum_rock_8",
        "strum_bossa",
        "strum_samba",
        "strum_reggae",
        "strum_charleston",
        "travis",
        "travis_fast",
      ]);
      const normStab = globalThis.HLChordNormalizer
        ? HLChordNormalizer.normalizeChord(harmMidis, currentBankId())
        : { midis: harmMidis, gainScale: 1, styleOverride: undefined };
      const stabStyleBase = loopish.has(style) ? "pluck" : style;
      const stabStyle = resolveStyleOverride(stabStyleBase, normStab);
      const stabPeak = 0.1 * (normStab.gainScale ?? 1);
      executeHarmonyPattern({
        styleKey: stabStyle,
        chord: normStab.midis,
        beat: 0.26,
        absBeat: 0,
        peak: stabPeak,
        schedule: ({ midi, offset, dur, style: st, velMult }) => {
          audio.instrumentSampler.playNoteAt(
            audio.harmStabBus,
            midi,
            t + offset,
            stabPeak * (velMult ?? 1),
            Math.min(0.4, dur),
            st
          );
        },
      });
    }
  }
}

// --- Sequência de acordes (modo avançado) ----------------------------------
// Lê/escreve estado interno; expõe `progressionHook` que o loop de amostras
// consulta uma vez por batida para saber se deve substituir a harmonia base
// pela progressão. Nenhum comportamento muda se `progState.enabled === false`
// (short-circuit no topo de `getActiveProgressionStep`).

const progState = {
  enabled: false,
  autoScale: false,
  applyScale: false,
  steps: [],          // raw steps [{roman?, chord?, bars, scale?}]
  resolved: [],       // resolvidos via resolveSequenceStep
  beatCounter: 0,     // beats acumulados desde o start do loop
  lastStepIndex: -1,  // para detectar transições de step
  lastBarIndex: -1,   // para detectar transições de compasso dentro do step
};

/** 4 beats = 1 compasso (apenas 4/4 por agora). */
const PROG_BEATS_PER_BAR = 4;

/** Chaves candidatas para auto-escala (limitadas para evitar escolhas exóticas). */
const PROG_AUTO_SCALE_CANDIDATES = [
  "major",
  "natural_minor",
  "dorian",
  "mixolydian",
  "lydian",
  "phrygian",
  "harmonic_minor",
  "melodic_minor_asc",
];

/**
 * Detecta se `val` parece um grau romano (ex.: "ii7", "bVII", "V7/V") ou um
 * acorde absoluto (ex.: "Cm7", "F#m7b5"). Agora delega a `HLTheory.classifyProgressionToken`
 * — um único ponto de verdade partilhado com `parseAbsoluteChord`/`parseRomanChord`.
 *
 * IMPORTANTE: a versão antiga aceitava `[A-Ga-g]` para acorde absoluto, mas o
 * parser só aceita `[A-G]` maiúsculo — "am7" era classificado como acorde e
 * depois estourava no parse. A classificação agora é simétrica com o parser.
 * Para os casos onde a letra romana ("i") e a letra de acorde ("I" é romano,
 * "A" é acorde) colidem, romano tem precedência — comportamento histórico.
 */
function progDetectMode(val) {
  const helper = globalThis.HLTheory && typeof globalThis.HLTheory.classifyProgressionToken === "function"
    ? globalThis.HLTheory.classifyProgressionToken
    : null;
  if (helper) return helper(val);
  // Fallback defensivo (caso HLTheory ainda não esteja carregado — p.ex. testes).
  const s = (val || "").trim();
  if (!s) return "roman";
  if (/^[b#♭♯]?[ivIV]+(°|ø)?.*$/.test(s)) return "roman";
  if (/^[A-G][#b♭♯]?.*$/.test(s)) return "chord";
  return "roman";
}

function progReadSteps() {
  // Coleta os steps a partir da UI (inputs dentro de #progStepsEditor).
  const editor = document.getElementById("progStepsEditor");
  if (!editor) return [];
  const rows = editor.querySelectorAll(".prog-step");
  const out = [];
  rows.forEach((row) => {
    // `?.value.trim()` é perigoso: se o querySelector devolver null, `?.value`
    // é undefined e `.trim()` lança TypeError. Defende-se com default antes
    // do trim — DOM parcial (ex.: render em curso) passa a não quebrar.
    const val = (row.querySelector('input[data-field="value"]')?.value ?? "").trim();
    const bars = Math.max(1, Math.floor(Number(row.querySelector('input[data-field="bars"]')?.value) || 1));
    const scaleKey = row.querySelector('select[data-field="scale"]')?.value || "";
    if (!val) return;
    const step = { bars };
    if (progDetectMode(val) === "chord") step.chord = val;
    else step.roman = val;
    if (scaleKey) step.scale = scaleKey;
    out.push(step);
  });
  return out;
}

function progResolveFromUI() {
  const steps = progReadSteps();
  progState.steps = steps;
  try {
    const tonicPc = currentTonicPc();
    const scaleKey = document.getElementById("scaleType")?.value || "major";
    progState.resolved = resolveSequence(steps, {
      tonicPc,
      scaleKey,
      autoScale: progState.autoScale,
      scaleCandidates: PROG_AUTO_SCALE_CANDIDATES,
    });
  } catch (err) {
    console.warn("[progression] erro a resolver sequência:", err.message);
    progState.resolved = [];
  }
}

function progRenderRow(rawStep, index) {
  const row = document.createElement("div");
  row.className = "prog-step";
  row.setAttribute("role", "listitem");
  row.dataset.index = String(index);

  const label = document.createElement("div");
  label.className = "prog-step-label";
  label.textContent = `#${index + 1}`;
  row.appendChild(label);

  const valInput = document.createElement("input");
  valInput.type = "text";
  valInput.dataset.field = "value";
  valInput.value = rawStep.chord || rawStep.roman || "";
  valInput.placeholder = "ii7 ou Cmaj7";
  valInput.spellcheck = false;
  valInput.title = "Grau romano (ii7, V7, bVII, V7/V…) ou acorde absoluto (Cmaj7, Am7…).";
  row.appendChild(valInput);

  // Cifra resolvida (read-only): mostra o acorde que será tocado na tónica
  // actual (ex.: "Am7" para vi7 em C maior). Atualizada por progRefreshCifras.
  const cifra = document.createElement("span");
  cifra.className = "prog-step-cifra";
  cifra.dataset.field = "cifra";
  cifra.setAttribute("aria-live", "polite");
  cifra.title = "Cifra resolvida (tónica atual)";
  cifra.textContent = "—";
  row.appendChild(cifra);

  const barsInput = document.createElement("input");
  barsInput.type = "number";
  barsInput.min = "1";
  barsInput.max = "16";
  barsInput.step = "1";
  barsInput.dataset.field = "bars";
  barsInput.value = String(Math.max(1, Math.floor(rawStep.bars || 1)));
  barsInput.title = "Compassos (4/4)";
  row.appendChild(barsInput);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "prog-step-remove";
  removeBtn.textContent = "×";
  removeBtn.title = "Remover este acorde";
  removeBtn.addEventListener("click", () => {
    row.remove();
    progRelabelRows();
    progResolveFromUI();
    progRefreshCifras();
    progRenderStatus();
  });
  row.appendChild(removeBtn);

  // Atalho escondido para scale per-step: select invisível no DOM para preservar estado;
  // renderizamos editor visível só quando o user pedir. Para o MVP, scale per-step
  // vive só em progState (via auto-scale ou preset).
  const scaleSel = document.createElement("select");
  scaleSel.dataset.field = "scale";
  scaleSel.style.display = "none";
  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "(default)";
  scaleSel.appendChild(optNone);
  for (const [key, def] of Object.entries(SCALE_TYPES)) {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = def.label;
    scaleSel.appendChild(o);
  }
  scaleSel.value = rawStep.scale || "";
  row.appendChild(scaleSel);

  const onChange = () => {
    progResolveFromUI();
    progRefreshCifras();
    progRenderStatus();
  };
  valInput.addEventListener("change", onChange);
  valInput.addEventListener("input", onChange);
  barsInput.addEventListener("change", onChange);
  scaleSel.addEventListener("change", onChange);

  return row;
}

function progRelabelRows() {
  const editor = document.getElementById("progStepsEditor");
  if (!editor) return;
  const rows = editor.querySelectorAll(".prog-step");
  rows.forEach((row, i) => {
    const label = row.querySelector(".prog-step-label");
    if (label) label.textContent = `#${i + 1}`;
    row.dataset.index = String(i);
  });
}

function progRenderEditor(rawSteps) {
  const editor = document.getElementById("progStepsEditor");
  if (!editor) return;
  editor.innerHTML = "";
  rawSteps.forEach((s, i) => editor.appendChild(progRenderRow(s, i)));
  // Resolve e preenche cifras, depois restaura highlight (útil se a sequência
  // já estava em execução quando o preset foi carregado).
  progRefreshCifras();
  progRenderStatus();
}

/**
 * Formata a cifra resolvida de um step (ex.: "Am7", "Cmaj7", "F#7").
 * Usa a tónica e a qualidade já resolvidas em `resolved.chord`, honrando a
 * preferência de sustenidos/bemóis do utilizador.
 */
function progFormatCifra(chord) {
  if (!chord || typeof chord.rootPc !== "number") return "";
  const name = pcToName(chord.rootPc, preferFlats());
  return name + (chord.quality || "");
}

/**
 * Atualiza o `<span class="prog-step-cifra">` de cada linha do editor com a
 * cifra resolvida (tónica actual). Se um step não resolve, mostra "—".
 */
function progRefreshCifras() {
  const editor = document.getElementById("progStepsEditor");
  if (!editor) return;
  const rows = editor.querySelectorAll(".prog-step");
  rows.forEach((row, i) => {
    const cifra = row.querySelector('.prog-step-cifra');
    if (!cifra) return;
    const resolved = progState.resolved[i];
    cifra.textContent = resolved ? progFormatCifra(resolved.chord) : "—";
  });
}

/**
 * Atualiza o status textual («Compasso X/Y do step #N…») e destaca visualmente
 * o cartão do step em execução. Chamada:
 *   - a cada mudança de passo/step (em `progTickBeat`);
 *   - a cada mudança de compasso dentro do step (para o contador X/Y);
 *   - ao (re)renderizar o editor (para restaurar o highlight);
 *   - ao ligar o áudio (via `progResetPlayhead`).
 *
 * Não usa `scrollIntoView`: manter o scroll estável evita saltar para o painel
 * da progressão enquanto o utilizador lê graus / harmonia / slots.
 */
function progRenderStatus() {
  const now = document.getElementById("progNowPlaying");
  if (!now) return;
  if (!progState.enabled || !progState.resolved.length) {
    now.textContent = "";
    return;
  }
  const totalBars = progState.resolved.reduce((s, st) => s + st.bars, 0);
  const barIdx = Math.floor(progState.beatCounter / PROG_BEATS_PER_BAR);
  const at = stepAtBar(progState.resolved, barIdx);
  if (!at) {
    now.textContent = "";
    return;
  }
  const chordLabel = at.step.label + (at.step.roman && at.step.absolute ? "" : "");
  const scaleLabel = SCALE_TYPES[at.step.scale]?.label || at.step.scale;
  now.textContent = `Compasso ${at.barInStep + 1}/${at.step.bars} do step #${at.index + 1} · ${chordLabel} · ${scaleLabel} (ciclo de ${totalBars} comp.)`;

  // Destaque visual no step ativo + indicador de compasso interno.
  const editor = document.getElementById("progStepsEditor");
  if (editor) {
    const rows = editor.querySelectorAll(".prog-step");
    let activeRow = null;
    rows.forEach((row, i) => {
      const isActive = i === at.index;
      row.classList.toggle("is-active", isActive);
      row.setAttribute("aria-current", isActive ? "true" : "false");
      if (isActive) {
        activeRow = row;
        // Progresso interno (compasso actual / total dentro do step), útil em
        // progressões onde um acorde dura 2+ compassos (ex: blues 12).
        const pct = Math.min(100, Math.round(((at.barInStep + 1) / at.step.bars) * 100));
        row.style.setProperty("--prog-step-bar", pct + "%");
        row.dataset.barInStep = String(at.barInStep + 1);
        row.dataset.barTotal = String(at.step.bars);
      } else {
        row.style.removeProperty("--prog-step-bar");
        delete row.dataset.barInStep;
        delete row.dataset.barTotal;
      }
    });
  }
}

function progPopulatePresets() {
  const sel = document.getElementById("progPreset");
  if (!sel) return;
  // Mantém a primeira opção "— escolher —" e remove tudo o resto (optgroups
  // eventualmente criados em render anterior + options sem grupo).
  [...sel.children].forEach((c, i) => {
    if (i === 0 && c.tagName === "OPTION" && !c.value) return;
    c.remove();
  });

  // Agrupa presets por categoria preservando a ordem de `PROGRESSION_CATEGORIES`.
  const groups = {};
  const defaultCat = "pragmatic";
  for (const [key, def] of Object.entries(CHORD_PROGRESSIONS)) {
    const cat = def.category || defaultCat;
    (groups[cat] = groups[cat] || []).push([key, def]);
  }

  const catLabels =
    (typeof PROGRESSION_CATEGORIES === "object" && PROGRESSION_CATEGORIES) || {};
  const catOrder = Object.keys(catLabels).concat(
    Object.keys(groups).filter((k) => !(k in catLabels))
  );

  for (const catKey of catOrder) {
    const entries = groups[catKey];
    if (!entries || !entries.length) continue;
    const og = document.createElement("optgroup");
    og.label = catLabels[catKey] || catKey;
    for (const [key, def] of entries) {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = def.label;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
}

function progLoadPreset(key) {
  const preset = CHORD_PROGRESSIONS[key];
  if (!preset) return;
  const scaleSel = document.getElementById("scaleType");
  if (scaleSel && preset.defaultScale && !progState.applyScale) {
    // Se o user não tem "aplicar escala" ligado, alinha o scaleType global
    // pelo preset carregado (assim o rating/estrelas faz sentido).
    scaleSel.value = preset.defaultScale;
    scaleSel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  progRenderEditor(preset.steps);
  progResolveFromUI();
  progRefreshCifras();
  progRenderStatus();
}

/**
 * Chamado pelo loop de amostras em cada batida. Incrementa o contador e,
 * quando a escala do step mudou e `applyScale` está ativo, aplica no select
 * global de escala (dispara o onChange normal do app).
 */
function progTickBeat() {
  if (!progState.enabled || !progState.resolved.length) return;
  progState.beatCounter += 1;
  const barIdx = Math.floor(progState.beatCounter / PROG_BEATS_PER_BAR);
  const at = stepAtBar(progState.resolved, barIdx);
  if (!at) return;
  const stepChanged = at.index !== progState.lastStepIndex;
  const barChanged = barIdx !== progState.lastBarIndex;
  if (stepChanged) {
    progState.lastStepIndex = at.index;
    if (progState.applyScale) {
      const scaleSel = document.getElementById("scaleType");
      if (scaleSel && at.step.scale && scaleSel.value !== at.step.scale && SCALE_TYPES[at.step.scale]) {
        scaleSel.value = at.step.scale;
        scaleSel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }
  if (stepChanged || barChanged) {
    progState.lastBarIndex = barIdx;
    // Atualiza status em cada mudança de compasso para dar feedback visual
    // ao vivo em acordes que duram múltiplos compassos (ex.: blues de 12).
    progRenderStatus();
  }
}

/** Reset do contador ao ligar/desligar áudio — evita avanços "fantasma". */
function progResetPlayhead() {
  progState.beatCounter = 0;
  progState.lastStepIndex = -1;
  progState.lastBarIndex = -1;
  // Força um render imediato para que o highlight apareça já no compasso 0
  // assim que o áudio arranca, e desapareça assim que o user pausa.
  progRenderStatus();
}

/**
 * Se a sequência estiver ativa e houver step atual, devolve `{chord}`; caso
 * contrário `null`. Usado pelo loop para sobrepor a harmonia base.
 */
function getActiveProgressionStep() {
  if (!progState.enabled || !progState.resolved.length) return null;
  const barIdx = Math.floor(progState.beatCounter / PROG_BEATS_PER_BAR);
  return stepAtBar(progState.resolved, barIdx);
}

/**
 * Constroi ivals sintéticos centrados no acorde para reutilizar
 * `nextHarmonyBassMidi` com harmonyId="deg1". Posições diatônicas 1/3/5/7
 * mapeiam para root/third/fifth/seventh do acorde (faltantes caem em defaults).
 */
function progSyntheticIvalsForChord(chord) {
  const ivl = chord.intervals;
  const third = ivl[1] ?? 4;
  const fifth = ivl[2] ?? 7;
  // 7ª default derivada da qualidade da tríade quando o acorde é uma tríade
  // pura (sem 7). Evita que padrões "1-3-5-7" e "shell_73" soem estranhos
  // sobre C ou Dm.
  let seventh = ivl[3];
  if (seventh == null) {
    if (fifth === 6) seventh = 9; // tríade diminuta → dim7
    else if (third === 3) seventh = 10; // tríade menor → m7
    else seventh = 11; // tríade maior → M7
  }
  return [0, third, third, fifth, fifth, seventh, seventh];
}

function wireProgressionControls() {
  const enabled = document.getElementById("progEnabled");
  const preset = document.getElementById("progPreset");
  const auto = document.getElementById("progAutoScale");
  const applyScale = document.getElementById("progApplyScale");
  const addBtns = document.querySelectorAll(".js-prog-add");
  const clearBtns = document.querySelectorAll(".js-prog-clear");
  if (!enabled || !preset || addBtns.length === 0 || clearBtns.length === 0) return;

  progPopulatePresets();

  enabled.addEventListener("change", () => {
    progState.enabled = enabled.checked;
    progResetPlayhead();
    progResolveFromUI();
    progRenderStatus();
    refreshSampleExecutionLoop();
    // Ao desactivar a progressão: corta instantaneamente as vozes já agendadas
    // (amostras em decaimento) e silencia o bus da harmonia para não arrastarem.
    if (!progState.enabled && audio?.ctx) {
      audio.silenceBus?.(audio.harmStabBus, 0.03);
      audio.stopSamplerVoices?.(0.03);
    }
  });

  auto.addEventListener("change", () => {
    progState.autoScale = auto.checked;
    progResolveFromUI();
    progRefreshCifras();
    progRenderStatus();
  });

  applyScale.addEventListener("change", () => {
    progState.applyScale = applyScale.checked;
  });

  preset.addEventListener("change", () => {
    const key = preset.value;
    if (key) {
      progLoadPreset(key);
      preset.value = "";
    }
  });

  const onProgAdd = () => {
    const editor = document.getElementById("progStepsEditor");
    if (!editor) return;
    const rows = editor.querySelectorAll(".prog-step");
    const newRaw = { roman: "I", bars: 1 };
    editor.appendChild(progRenderRow(newRaw, rows.length));
    progResolveFromUI();
    progRefreshCifras();
    progRenderStatus();
  };

  const onProgClear = () => {
    const editor = document.getElementById("progStepsEditor");
    if (editor) editor.innerHTML = "";
    progState.steps = [];
    progState.resolved = [];
    progRenderStatus();
  };

  addBtns.forEach((b) => b.addEventListener("click", onProgAdd));
  clearBtns.forEach((b) => b.addEventListener("click", onProgClear));
}

function wireGlobalControls() {
  const audioToggles = document.querySelectorAll(".js-audio-toggle");

  function setAudioButtonState(state) {
    // state: false | true | "loading"
    audioToggles.forEach((btnAudio) => {
      const isHeader = btnAudio.classList.contains("btn-header-audio");
      btnAudio.classList.toggle("btn-primary", state === true || state === "loading");
      btnAudio.classList.toggle("is-loading", state === "loading");
      if (state === "loading") {
        btnAudio.textContent = isHeader ? "…" : "A carregar amostras…";
        btnAudio.setAttribute("aria-pressed", "true");
        btnAudio.setAttribute("aria-busy", "true");
      } else {
        btnAudio.textContent = isHeader ? "Áudio" : state ? "Desativar áudio" : "Ativar áudio";
        btnAudio.setAttribute("aria-pressed", state ? "true" : "false");
        btnAudio.setAttribute("aria-busy", "false");
      }
    });
  }

  async function toggleAudio() {
    if (!audioUserEnabled) {
      try {
        audio.ensure();
      } catch (err) {
        console.error("Harmonic Lab: falha a iniciar áudio.", err);
        alert("Não foi possível iniciar o áudio: " + (err && err.message ? err.message : err));
        return;
      }
      // Em iOS Safari o resume + um buffer-primer + <audio> silencioso em loop
      // são necessários para destrancar realmente o output e bypassar o switch
      // de silêncio. Tem de correr DENTRO do gesto do utilizador (este click).
      try {
        await audio.unlockOnGesture();
      } catch (_) {
        /* ignore */
      }
      audioUserEnabled = true;
      setAudioButtonState("loading");
      syncBankSamplerFromUI();
      updateSampleControlsEnabled();
      const t = audio.ctx.currentTime;
      if (audio.scaleSampleBus) {
        audio.scaleSampleBus.gain.cancelScheduledValues(t);
        audio.scaleSampleBus.gain.setValueAtTime(1, t);
      }
      if (audio.harmStabBus) {
        audio.harmStabBus.gain.cancelScheduledValues(t);
        audio.harmStabBus.gain.setValueAtTime(0.58, t);
      }
      applyMasterGainFromUI();
      syncAudio();
      // Zera o contador da sequência só aqui, no start "fresco" do áudio.
      // `refreshSampleExecutionLoop` pode ser chamada durante a execução
      // (e.g. ao mudar de escala mid-progressão) e não deve ressetar o playhead.
      progResetPlayhead();
      refreshSampleExecutionLoop();
      try {
        await preloadSamplerBank();
      } catch (err) {
        console.warn("Harmonic Lab: pré-carregamento de amostras incompleto.", err);
      } finally {
        if (audioUserEnabled) setAudioButtonState(true);
      }
      return;
    }
    audio.stopScale();
    audio.hardMute();
    try {
      await audio.ctx.suspend();
    } catch (_) {
      /* ignore */
    }
    audioUserEnabled = false;
    audio._harmStabPrimed = false;
    audio._harmStabKey = "";
    stopSampleExecutionLoop();
    setAudioButtonState(false);
  }

  audioToggles.forEach((btn) => {
    btn.addEventListener("click", () => {
      void toggleAudio();
    });
  });

  // Export MP3 — abre dialog; dentro, o user escolhe modo e inicia.
  const btnExport = document.getElementById("btnExport");
  const exportDialog = document.getElementById("exportDialog");
  const btnExportClose = document.getElementById("btnExportClose");
  const btnExportGo = document.getElementById("btnExportGo");

  function syncExportDialogMode() {
    const mode = exportDialog?.querySelector('input[name="exportMode"]:checked')?.value || "render";
    exportDialog?.setAttribute("data-mode", mode);
    if (btnExportGo) {
      btnExportGo.textContent = exportState.active
        ? "Parar"
        : mode === "render"
          ? "Render"
          : "Rec";
    }
  }

  if (btnExport && exportDialog && typeof exportDialog.showModal === "function") {
    btnExport.addEventListener("click", () => {
      if (!audioUserEnabled) {
        setExportStatus("Ativa o áudio primeiro (botão ao lado).", "info");
      } else {
        setExportStatus("Pronto.", "info");
      }
      syncExportDialogMode();
      exportDialog.showModal();
    });
    btnExportClose?.addEventListener("click", () => {
      if (exportState.active) stopExportRecording();
      exportDialog.close();
    });
    exportDialog.querySelectorAll('input[name="exportMode"]').forEach((r) => {
      r.addEventListener("change", syncExportDialogMode);
    });
    btnExportGo?.addEventListener("click", async () => {
      if (exportState.active) {
        stopExportRecording();
        syncExportDialogMode();
        return;
      }
      const mode = exportDialog.querySelector('input[name="exportMode"]:checked')?.value || "render";
      if (mode === "render") {
        const cycles = Math.max(1, Math.min(16, Number(document.getElementById("exportCycles")?.value || 2)));
        // Cada passo do execution loop avança sampleHarmonyBeatIndex em +1.
        // "Ciclo" aqui = uma passagem pelos steps da progressão resolvida.
        // Se não houver progressão activa, cai para "live" com duração
        // manual — avisa o user.
        const steps = Array.isArray(progState?.resolved) ? progState.resolved.length : 0;
        if (!progState?.enabled || steps === 0) {
          setExportStatus("Progressão desligada — usa modo Live ou activa uma progressão.", "info");
          return;
        }
        exportState.mode = "render";
        exportState.renderTargetBeats = cycles * steps;
        exportState.renderStartBeatIndex = sampleHarmonyBeatIndex;
      } else {
        exportState.mode = "live";
      }
      await startExportRecording();
      syncExportDialogMode();
    });
  }

  // Modo simples/avançado — esconde campos .is-advanced no modo simples.
  const btnMode = document.getElementById("btnMode");
  if (btnMode) {
    const MODE_KEY = "hl.uiMode";
    const applyMode = (mode) => {
      const isSimple = mode !== "advanced";
      document.body.classList.toggle("mode-simple", isSimple);
      btnMode.setAttribute("aria-pressed", isSimple ? "false" : "true");
      btnMode.textContent = isSimple ? "Modo avançado" : "Modo simples";
      btnMode.title = isSimple
        ? "Mostrar todos os controles (volumes, oitavas, execução detalhada…)"
        : "Esconder controles avançados e mostrar só o essencial";
    };
    let savedMode = "simple";
    try {
      savedMode = localStorage.getItem(MODE_KEY) || "simple";
    } catch (_) {
      savedMode = "simple";
    }
    applyMode(savedMode);
    btnMode.addEventListener("click", () => {
      const next = document.body.classList.contains("mode-simple") ? "advanced" : "simple";
      applyMode(next);
      try {
        localStorage.setItem(MODE_KEY, next);
      } catch (_) {
        /* storage opcional */
      }
    });
  }

  // Atalho de teclado: Espaço alterna áudio (fora de campos de formulário).
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.key !== " ") return;
    const tgt = e.target;
    if (!tgt) return;
    const tag = (tgt.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || tgt.isContentEditable) return;
    e.preventDefault();
    void toggleAudio();
  });

  const onContextChange = () => {
    updateSampleControlsEnabled();
    syncBankSamplerFromUI();
    renderScaleMeta();
    renderDegreeStrip();
    refreshAllSlotsUI();
    updateSlotsMissingNotes();
    updateScaleStarLabels();
    // Tônica ou escala mudou → re-resolver romanos da sequência e actualizar
    // cifras (ex.: vi7 que mostrava "Am7" em C, passa a "Dm7" em F).
    progResolveFromUI();
    progRefreshCifras();
    progRenderStatus();
    scheduleSyncAudio();
    refreshSampleExecutionLoop();
  };

  const droneOn = document.getElementById("droneOn");
  const btnTonicSound = document.getElementById("btnTonicSound");

  function syncTonicSoundButton() {
    const on = droneOn.checked;
    btnTonicSound.setAttribute("aria-pressed", on ? "true" : "false");
    btnTonicSound.textContent = on ? "Desativar som da tônica" : "Ativar som da tônica";
    btnTonicSound.classList.toggle("btn-primary", on);
  }

  btnTonicSound.addEventListener("click", () => {
    droneOn.checked = !droneOn.checked;
    syncTonicSoundButton();
    scheduleSyncAudio();
  });

  [
    "tonic",
    "scaleType",
    "preferFlats",
    "harmonyBase",
    "harmonyStyle",
    "progHarmonyStyle",
    "harmonyMuteChords",
    "bassWithHarmonyOff",
    "harmonyBassMode",
    "harmonyBassOctave",
    "droneOn",
    "playStyle",
    "tonicStyle",
    "tonicOctave",
    "slotMixMode",
    "soloEnabled",
    "soloPattern",
    "soloRhythm",
    "soloOctave",
    "soloContextMode",
    "soloScaleType",
    "soloAlignHarmonyWithScale",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", onContextChange);
  });

  // Handler dedicado: quando o utilizador ATIVA "Silenciar acorde da harmonia",
  // queremos que o chord tail já despachado desapareça imediatamente — e não
  // só nas próximas batidas. Idem para quando desliga `droneOn`, para cortar
  // tail da tônica em modo sample.
  const harmonyMuteChordsEl = document.getElementById("harmonyMuteChords");
  if (harmonyMuteChordsEl) {
    harmonyMuteChordsEl.addEventListener("change", () => {
      if (harmonyMuteChordsEl.checked && audio?.ctx) {
        audio.silenceBus?.(audio.harmStabBus, 0.03);
        audio.stopSamplerVoices?.(0.03);
      }
    });
  }

  document.querySelectorAll(".js-harmony-off").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sel = document.getElementById("harmonyBase");
      if (!sel || sel.value === "off") return;
      sel.value = "off";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  const droneOnEl = document.getElementById("droneOn");
  if (droneOnEl) {
    droneOnEl.addEventListener("change", () => {
      if (!droneOnEl.checked && audio?.ctx) {
        // Corte do tail da tônica em modo sample (pode durar alguns segundos).
        audio.stopSamplerVoices?.(0.03);
      }
    });
  }

  // O antigo selector `#slotInputMode` foi removido (visualização única).

  const bankInstrument = document.getElementById("bankInstrument");
  if (bankInstrument) {
    bankInstrument.addEventListener("change", async () => {
      audio.instrumentSampler?.clearCache();
      syncBankSamplerFromUI();
      await preloadSamplerBank();
      scheduleSyncAudio();
      refreshSampleExecutionLoop();
    });
  }

  // Instrumento dedicado do baixo (independente do principal).
  const bassBankInstrument = document.getElementById("bassBankInstrument");
  if (bassBankInstrument) {
    bassBankInstrument.addEventListener("change", async () => {
      // Sem clearCache do principal — o baixo tem o seu próprio cache agora.
      syncBassBankSamplerFromUI();
      await preloadSamplerBank();
      scheduleSyncAudio();
      refreshSampleExecutionLoop();
    });
  }
  ["harmVol", "harmonyBassVol", "droneVol", "slotsVol", "globalBpm", "progVol", "soloVol"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", onContextChange);
  });

  function syncSoloTransportUi() {
    const chk = document.getElementById("soloEnabled");
    if (!chk) return;
    const on = chk.checked;
    document.querySelectorAll(".js-solo-play").forEach((b) => b.setAttribute("aria-pressed", on ? "true" : "false"));
  }

  const onSoloPlay = () => {
    if (!audioUserEnabled) {
      alert("Ligue o motor de áudio primeiro (Ativar áudio).");
      return;
    }
    const soundMode = document.getElementById("soundMode")?.value ?? "synth";
    if (soundMode !== "sample" || !audio.instrumentSampler) {
      alert("O solo improvisado usa o banco de amostras. Confirme o modo Instrumento e que o áudio está activo.");
      return;
    }
    if (document.getElementById("soloAutoEnableHarmony")?.checked) {
      const hb = document.getElementById("harmonyBase");
      if (hb && hb.value === "off") {
        hb.value = "deg1";
        hb.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    const chk = document.getElementById("soloEnabled");
    if (!chk) return;
    if (!chk.checked) {
      chk.checked = true;
      chk.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Sempre reinicia a frase melódica ao premir «Tocar solo / improvisação» (útil se já estava ligado).
    soloPatIndex = 0;
    lastSoloChordSig = "";
    refreshSampleExecutionLoop();
    syncSoloTransportUi();
  };

  const onSoloStop = () => {
    const chk = document.getElementById("soloEnabled");
    if (chk?.checked) {
      chk.checked = false;
      chk.dispatchEvent(new Event("change", { bubbles: true }));
    }
    refreshSampleExecutionLoop();
    syncSoloTransportUi();
  };

  document.querySelectorAll(".js-solo-play").forEach((b) => b.addEventListener("click", onSoloPlay));
  document.querySelectorAll(".js-solo-stop").forEach((b) => b.addEventListener("click", onSoloStop));
  const soloEnabledEl = document.getElementById("soloEnabled");
  if (soloEnabledEl) soloEnabledEl.addEventListener("change", syncSoloTransportUi);

  const soloScenePresetEl = document.getElementById("soloScenePreset");
  if (soloScenePresetEl) {
    soloScenePresetEl.addEventListener("change", () => {
      const k = soloScenePresetEl.value;
      if (k) {
        applySoloScenePreset(k);
        soloScenePresetEl.value = "";
      }
    });
  }

  const masterGainEl = document.getElementById("masterGain");
  if (masterGainEl) {
    masterGainEl.addEventListener("input", () => {
      applyMasterGainFromUI();
      updateSliderValueLabel(masterGainEl);
    });
  }

  // Rótulos de valor ao lado de sliders / inputs numéricos.
  const valueDisplayIds = ["harmVol", "harmonyBassVol", "droneVol", "slotsVol", "masterGain", "globalBpm", "progVol"];
  const valueSuffix = {
    harmVol: "%",
    harmonyBassVol: "%",
    droneVol: "%",
    slotsVol: "%",
    masterGain: "%",
    globalBpm: " BPM",
    progVol: "%",
  };
  function updateSliderValueLabel(el) {
    if (!el || !el.dataset) return;
    const tag = el.dataset.valueLabel;
    if (!tag) return;
    const span = document.getElementById(tag);
    if (span) {
      const suf = valueSuffix[el.id] || "";
      span.textContent = `${el.value}${suf}`;
    }
  }
  valueDisplayIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    // cria um <span> adjacente dentro do <label>
    const host = el.closest("label") || el.parentElement;
    if (!host) return;
    const span = document.createElement("span");
    span.className = "field-value";
    span.id = `val_${id}`;
    el.dataset.valueLabel = span.id;
    host.appendChild(span);
    updateSliderValueLabel(el);
    el.addEventListener("input", () => updateSliderValueLabel(el));
  });

  const onMuteAllSlots = () => {
    document.querySelectorAll('.slot input[type="checkbox"]').forEach((c) => {
      c.checked = false;
    });
    document.querySelectorAll(".slot").forEach((s) => s.classList.remove("on"));
    updateSlotsMissingNotes();
    // Corte imediato: ramp dos oscs dos slots para 0 + corte das amostras
    // já agendadas (caso em modo sample). Assim o clique silencia na hora,
    // sem esperar pelo ciclo de scheduleSyncAudio()/tail natural das amostras.
    if (audio?.ctx) {
      const tNow = audio.ctx.currentTime;
      audio.slots?.forEach(({ gain }) => {
        const gp = gain.gain;
        gp.cancelScheduledValues(tNow);
        gp.setValueAtTime(gp.value, tNow);
        gp.linearRampToValueAtTime(0, tNow + 0.025);
      });
      audio.stopSamplerVoices?.(0.025);
    }
    scheduleSyncAudio();
    refreshSampleExecutionLoop();
  };
  document.querySelectorAll(".js-slots-mute-all").forEach((b) => b.addEventListener("click", onMuteAllSlots));

  /** Dispara a escala uma vez e, se `loop` está ligado, reagenda até ao utilizador parar. */
  async function runScaleOnce(myToken, iteration = 0) {
    if (myToken !== scaleLoopToken) return;
    audio.ensure();
    try {
      await audio.ctx.resume();
    } catch (_) {
      /* ignore */
    }
    if (!audioUserEnabled) {
      audioUserEnabled = true;
      setAudioButtonState(true);
    }
    syncAudio();
    const tcp = currentTonicPc();
    const ivals = currentIvals();
    const dirRaw = document.getElementById("seqDir").value;
    // Direção efetiva: alt_up/alt_down alternam subida/descida a cada iteração do loop.
    let dir = dirRaw;
    if (dirRaw === "alt_up") dir = iteration % 2 === 0 ? "up" : "down";
    else if (dirRaw === "alt_down") dir = iteration % 2 === 0 ? "down" : "up";
    const rawOct = Number(document.getElementById("seqOctaves").value);
    const oct = Math.max(1, Math.min(4, rawOct)) || 1;
    const bpm = currentBpm();
    const rhythm = document.getElementById("seqRhythm").value;
    const latch = document.getElementById("seqLatch").checked;
    const loopOn = !!document.getElementById("seqLoop")?.checked;
    const loopGap = Number(document.getElementById("seqLoopGap")?.value ?? 0.5) || 0;
    const degs = buildScaleDegrees(ivals, dir, oct);
    const baseOct = slotsPlaybackBaseOct();
    let midis = degs.map((d) => midiForScaleDegree(tcp, ivals, d, baseOct));
    const harmRef = getScaleHarmonyReferenceMidi();
    midis = constrainScaleMidisAroundHarmony(midis, harmRef);
    const freqs = midis.map((m) => midiToFreq(m));
    const { times, durs, total } = rhythmPattern(rhythm, bpm, freqs.length, latch);

    const soundMode = document.getElementById("soundMode")?.value ?? "synth";
    let mode = "synth";
    let sampler = null;
    if (soundMode === "sample" && audio.instrumentSampler) {
      syncBankSamplerFromUI();
      const s = audio.instrumentSampler;
      try {
        const lo = Math.max(24, Math.min(...midis));
        const hi = Math.min(108, Math.max(...midis));
        await s.preloadRange(lo, hi);
      } catch (err) {
        console.warn("Harmonic Lab: falha ao carregar amostras.", err);
      }
      mode = "sample";
      sampler = s;
    }

    if (myToken !== scaleLoopToken) return;

    // Agenda highlights visuais alinhados com o início/fim de cada nota da sequência.
    // Calcula `t0Ui` usando a mesma regra que o engine: base = currentTime + 0.06;
    // se `latch` estiver activo, avança até ao próximo beat global (mesma fórmula
    // do `playScaleSequence`) — assim as luzes e o som atacam no mesmo instante.
    const ctxNow = audio.ctx?.currentTime ?? 0;
    let t0Ui = ctxNow + 0.06;
    if (latch && bpm > 0) {
      const beatSec = 60 / bpm;
      t0Ui = Math.ceil(t0Ui / beatSec) * beatSec;
    }
    const strip = document.getElementById("degreeStrip");
    if (strip) {
      for (let i = 0; i < degs.length; i += 1) {
        const d = degs[i];
        const startMs = Math.max(0, Math.round((t0Ui + times[i] - ctxNow) * 1000));
        const endMs = Math.max(startMs + 30, Math.round(startMs + (durs[i] ?? 0.12) * 1000));
        scaleHighlightTimers.push(
          setTimeout(() => {
            if (myToken !== scaleLoopToken) return;
            const col = strip.querySelector(`.degree-col[data-degree="${d}"]`);
            if (col) col.classList.add("is-playing");
          }, startMs),
        );
        scaleHighlightTimers.push(
          setTimeout(() => {
            if (myToken !== scaleLoopToken) return;
            const col = strip.querySelector(`.degree-col[data-degree="${d}"]`);
            if (col) col.classList.remove("is-playing");
          }, endMs),
        );
      }
    }

    renderScaleSeqPreview(degs, midis);
    scheduleScaleSeqStripHighlights(t0Ui, times, durs, myToken, ctxNow);

    // Passamos o t0 já calculado (com latch aplicado): garante que as luzes
    // e as notas arrancam no mesmo instante absoluto.
    await audio.playScaleSequence({ freqs, times, durs, gain: 0.32, mode, midis, sampler, t0: t0Ui });

    if (!loopOn || myToken !== scaleLoopToken) return;
    const beat = 60 / bpm;
    const lastIdx = times.length - 1;
    const lastDur = durs[lastIdx] ?? beat;
    const lastStart = times[lastIdx] ?? 0;
    const playDuration = Math.max(total, lastStart + lastDur);
    const waitS = playDuration + Math.max(0, loopGap) * beat + 0.08;
    clearTimeout(scaleLoopTimer);
    scaleLoopTimer = setTimeout(() => {
      if (myToken !== scaleLoopToken) return;
      void runScaleOnce(myToken, iteration + 1);
    }, Math.max(40, Math.round(waitS * 1000)));
  }

  function stopScaleLoop() {
    scaleLoopToken += 1;
    if (scaleLoopTimer) {
      clearTimeout(scaleLoopTimer);
      scaleLoopTimer = null;
    }
    clearScaleHighlights();
  }

  const onScalePlay = () => {
    stopScaleLoop();
    scaleLoopToken += 1;
    void runScaleOnce(scaleLoopToken);
  };

  const onScaleStop = () => {
    stopScaleLoop();
    // Modo synth: silencia seqGain. Modo sample: NÃO silencia scaleSampleBus
    // porque é partilhado com drone/slots/bass — zerá-lo calaria tudo.
    audio.stopScale({ muteSampleBus: false });
    // Deliberadamente NÃO chamamos:
    //   - stopSampleExecutionLoop(): dirige harmonia/drone/slots/bass e não
    //     tem nada a ver com o scale player; matá-lo deixava a harmonia morta
    //     até o user mexer em instrumento/progressão/slot.
    //   - stopSamplerVoices(): corte global apagaria vozes da harmonia em
    //     harmStabBus. Notas de escala já despachadas decaem naturalmente
    //     (≤0.3s em pluck, até ~1.5s em sustain) — preço aceitável.
  };

  document.querySelectorAll(".js-scale-play").forEach((b) => b.addEventListener("click", onScalePlay));
  document.querySelectorAll(".js-scale-stop").forEach((b) => b.addEventListener("click", onScaleStop));


  // Se o utilizador desliga o loop enquanto já está a correr, cancela o reagendamento
  // e limpa os highlights visuais agendados para a próxima iteração.
  const seqLoopEl = document.getElementById("seqLoop");
  if (seqLoopEl) {
    seqLoopEl.addEventListener("change", () => {
      if (!seqLoopEl.checked) {
        if (scaleLoopTimer) {
          clearTimeout(scaleLoopTimer);
          scaleLoopTimer = null;
        }
        clearScaleHighlights();
      }
    });
  }

  populateScaleStudyCombo();
  const scaleStudyCombo = document.getElementById("scaleStudyCombo");
  if (scaleStudyCombo) {
    scaleStudyCombo.addEventListener("change", () => {
      const v = scaleStudyCombo.value;
      if (v) applyScaleStudyPreset(v);
    });
  }

  setAudioButtonState(false);
  syncTonicSoundButton();
  syncSoloTransportUi();
  updateSampleControlsEnabled();
}

// init
populateSelects();
renderScaleMeta();
renderDegreeStrip();
updateScaleStarLabels();
buildSlots();
wireGlobalControls();
wireProgressionControls();
updateSampleControlsEnabled();
updateSlotsMissingNotes();

// Corrige eventos duplicados: preferFlats etc. recriam slots — wire apenas uma vez nos selects globais
// rebuild slots destroy listeners inside slots — re-bind sync on container
document.getElementById("slots").addEventListener("change", (ev) => {
  const target = ev.target;
  // Se um checkbox dum slot foi DESMARCADO, faz mute imediato desse slot
  // (oscs sintetizados) e corta tails de amostra. Sem isto, o oscilador
  // do slot toca durante ~30–50 ms até o próximo scheduleSyncAudio() correr
  // e, em modo sample, o decaimento da amostra continua audível.
  if (target && target.matches?.('.slot input[type="checkbox"]') && !target.checked) {
    const slotEl = target.closest(".slot");
    const idx = Number(slotEl?.dataset?.index);
    if (audio?.ctx && Number.isInteger(idx) && audio.slots?.[idx]) {
      const tNow = audio.ctx.currentTime;
      const gp = audio.slots[idx].gain.gain;
      gp.cancelScheduledValues(tNow);
      gp.setValueAtTime(gp.value, tNow);
      gp.linearRampToValueAtTime(0, tNow + 0.025);
      // O sampler não é por-slot, mas em modo sample os slots partilham o
      // instrumentSampler; um corte global aqui é agressivo demais quando
      // só um slot foi desmarcado. Por isso apenas o osc é silenciado;
      // o decaimento curto da amostra é aceitável (≤0.3 s).
    }
  }
  updateSlotsMissingNotes();
  scheduleSyncAudio();
  refreshSampleExecutionLoop();
});
