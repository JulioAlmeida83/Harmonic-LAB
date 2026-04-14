/**
 * Harmonic Lab — motor de escalas (hepta-, penta-, hex-, octatônicas), romanos / graus na UI,
 * 8 slots + drone/harmonia, sequenciador de escala com ritmos.
 *
 * Núcleo teórico (constantes de escala, tríades, romanos, MIDI, harmonia,
 * ratings de compatibilidade) vive em `theory.js` e é injetado como globais
 * antes deste ficheiro.
 */

/** `degree`: uma nota por grau. `chord`: raiz na escala + qualidade (7, maj7, m7…). */
function currentSlotInputMode() {
  return document.getElementById("slotInputMode")?.value === "chord" ? "chord" : "degree";
}

/** Intervalos em semitons a partir da fundamental (acordes absolutos, não apenas diatónicos). */
const CHORD_SLOT_INTERVALS = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
};

const CHORD_SLOT_LABELS = {
  maj: "M",
  min: "m",
  dim: "dim",
  aug: "aug",
  "7": "7",
  maj7: "M7",
  m7: "m7",
  m7b5: "m7♭5",
  dim7: "o7",
  sus4: "sus4",
  sus2: "sus2",
};

/** Sufixo do símbolo de acorde; alias para CHORD_SLOT_LABELS. */
const CHORD_SLOT_SUFFIX = CHORD_SLOT_LABELS;

function chordSymbolPreview(chordType, rootDeg, ivals, tonicPc, preferFl) {
  const rp = pitchClassForDegree(rootDeg, ivals, tonicPc);
  const root = pcToName(rp, preferFl);
  const suf = CHORD_SLOT_SUFFIX[chordType] ?? "";
  return `${root}${suf}`;
}

/** Classes de altura do acorde (ordem do modelo), sem oitavas. */
function chordCompositionNoteNames(chordType, rootDeg, ivals, tonicPc, preferFl) {
  const rootPc = pitchClassForDegree(rootDeg, ivals, tonicPc);
  const ivChord = CHORD_SLOT_INTERVALS[chordType] ?? CHORD_SLOT_INTERVALS.maj;
  return ivChord.map((iv) => pcToName((rootPc + iv + 120) % 12, preferFl)).join(" · ");
}

function chordMidisFromSlotState(s, tcp, ivals, baseOct) {
  const rootMidi = midiForScaleDegree(tcp, ivals, s.deg, baseOct + s.oct);
  if (currentSlotInputMode() !== "chord") return [rootMidi];
  const ivs = CHORD_SLOT_INTERVALS[s.chordType] ?? CHORD_SLOT_INTERVALS.maj;
  return ivs.map((iv) => rootMidi + iv);
}

/** Mostra o seletor de qualidade por slot só no modo «Por acorde». */
function applySlotInputModeChrome() {
  const vis = currentSlotInputMode() === "chord";
  document.querySelectorAll(".slot-chord-wrap").forEach((w) => w.classList.toggle("is-visible", vis));
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

function updateSlotChordLabel() {
  const el = document.getElementById("slotChordVoicing");
  if (!el) return;
  const states = readSlotsState();
  const active = states.filter((s) => s.on);
  const tcp = currentTonicPc();
  const ivals = currentIvals();
  const pf = preferFlats();
  const base = slotsPlaybackBaseOct();

  if (!active.length) {
    el.textContent =
      "Combinação dos slots: nenhum ativo. Ligue dois ou mais slots (ou explore uma nota) para ver intervalos e acordes.";
    el.classList.add("slots-chord--empty");
    return;
  }

  const midis = [];
  active.forEach((s) => {
    chordMidisFromSlotState(s, tcp, ivals, base).forEach((m) => midis.push(m));
  });
  const { head, detail } = describeActiveSlotsChord(midis, pf);
  el.classList.remove("slots-chord--empty");
  const nPc = new Set(midis.map((m) => ((m % 12) + 12) % 12)).size;
  const kind = nPc >= 3 ? "Acorde" : nPc === 2 ? "Intervalo" : "Nota";
  const modeHint =
    currentSlotInputMode() === "chord"
      ? " (modo «Por acorde»: grau e qualidade por slot.)"
      : "";
  const line1 = `${kind} formado pela combinação atual: ${head}${modeHint}`;
  el.textContent = detail ? `${line1}\n${detail}` : line1;
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
}

/** Com «harmonia desligada», baixo pode usar tríade em I como referência. */
function effectiveHarmonyIdForBassSamples(harmId) {
  if (harmId !== "off") return harmId;
  if (document.getElementById("bassWithHarmonyOff")?.checked) return "deg1";
  return "off";
}

/** Deslocamento em semitonos (múltiplos de 12 na UI) aplicado às notas de baixo. */
function readHarmonyBassSemitoneOffset() {
  const v = Number(document.getElementById("harmonyBassOctave")?.value ?? -12);
  if (!Number.isFinite(v)) return -12;
  return Math.max(-48, Math.min(24, v));
}

/**
 * Nota da linha de baixo (derivada das alturas da harmonia base), por padrão e batida.
 * O deslocamento de oitava (`harmonyBassOctave`) soma-se à fundamental, terça, quinta e sétima
 * usadas no padrão. No pedal, aplica-se ao grau I na mesma oitava-base da harmonia.
 */
function nextHarmonyBassMidi(tonicPc, ivals, harmonyId, baseOct, mode, step) {
  if (mode === "off") return null;
  if (harmonyId === "off") return null;

  const off = readHarmonyBassSemitoneOffset();
  // Baixo sempre deriva do acorde *de referência* (maior natural), coerente com
  // o acorde emitido em syncAudio / sampleBass — desacoplado do «Tipo de escala».
  const refIvals = harmonyRefIvals();

  if (mode === "pedal_tonic") {
    return midiForScaleDegree(tonicPc, refIvals, 1, baseOct) + off;
  }

  const harm = harmonyMidis(tonicPc, refIvals, harmonyId, baseOct);
  if (!harm.length) return null;

  const root = harm[0];
  const third = harm.length > 1 ? harm[1] : root + 4;
  const fifth = harm.length > 2 ? harm[2] : root + 7;
  // Para acordes diatônicos em tríade (deg1–deg7), deriva a 7ª diatônica
  // on-the-fly usando os mesmos intervalos de referência.
  let seventh = harm.length > 3 ? harm[3] : null;
  if (seventh == null && /^deg[1-7]$/.test(harmonyId)) {
    const g = Number(harmonyId.slice(3));
    seventh = midiForScaleDegree(tonicPc, refIvals, g + 6, baseOct);
  }

  const br = root + off;
  const bt = third + off;
  const bf = fifth + off;
  const b7 = seventh != null ? seventh + off : null;

  if (mode === "fundamental") return br;
  if (mode === "root_fifth") return step % 2 === 0 ? br : bf;
  if (mode === "root_third") return step % 2 === 0 ? br : bt;
  if (mode === "root_seventh") {
    if (b7 != null) return step % 2 === 0 ? br : b7;
    return step % 2 === 0 ? br : bf;
  }
  if (mode === "third_carpet") return bt;
  if (mode === "ostinato_1513") return [br, bf, br, bt][step % 4];
  if (mode === "ostinato_1535") return [br, bf, bt, bf][step % 4];
  if (mode === "ostinato_1351") return [br, bt, bf, br][step % 4];
  if (mode === "bounce_151") return [br, bf, br][step % 3];
  if (mode === "clave5") return [br, bf, br, br, bf][step % 5];
  if (mode === "chromatic_1012") return [br, br - 1, br, br + 2][step % 4];
  if (mode === "arp_low") {
    const seq = b7 != null ? [br, bt, bf, b7] : [br, bt, bf];
    return seq[step % seq.length];
  }
  if (mode === "arp_desc_low") {
    const seq = b7 != null ? [b7, bf, bt, br] : [bf, bt, br];
    return seq[step % seq.length];
  }
  if (mode === "shell_73") {
    if (b7 != null) return step % 2 === 0 ? b7 : bt;
    return step % 2 === 0 ? br : bt;
  }
  if (mode === "octave_ping") return step % 2 === 0 ? br : br - 12;
  if (mode === "quinta_carpet") return bf;
  if (mode === "fifth_oct_ping") return step % 2 === 0 ? bf : bf - 12;
  return br;
}

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

    const dry = this.ctx.createGain();
    dry.gain.value = 0.86;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.09;
    const conv = this.ctx.createConvolver();
    conv.buffer = makeReverbIR(this.ctx, 1.2);
    conv.normalize = true;

    this.masterMix.connect(dry);
    dry.connect(this.ctx.destination);
    this.masterMix.connect(conv);
    conv.connect(wet);
    wet.connect(this.ctx.destination);

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

  /** @param {{ freqs: number[], times: number[], durs: number[], gain: number, mode?: string, midis?: number[], sampler?: object }} opts */
  async playScaleSequence(opts) {
    const { freqs, times, durs, gain, mode, midis, sampler } = opts;
    const isSample = mode === "sample" && sampler && Array.isArray(midis) && midis.length === freqs.length;
    this.stopScale({ muteSampleBus: !isSample });
    if (!this.ctx) return;
    try {
      await this.ctx.resume();
    } catch (_) {
      /* ignore */
    }
    const gLin = Number(gain);
    const g0 = Number.isFinite(gLin) ? gLin : 0.32;
    const t0 = this.ctx.currentTime + 0.06;

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
 */
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

  if (latchToBeat) {
    const cycle = beat * 4;
    const pad = (cycle - (t % cycle)) % cycle;
    for (let i = 0; i < times.length; i += 1) times[i] += pad;
  }

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
let sampleSlotsArpIndex = 0;
let sampleBassPatIndex = 0;
/** Token / timer do loop da escala (cada «Tocar» incrementa o token). */
let scaleLoopToken = 0;
let scaleLoopTimer = null;

/** Timers de highlight visual da escala — limpos no stop para evitar ficar "aceso". */
const scaleHighlightTimers = [];
function clearScaleHighlights() {
  for (const t of scaleHighlightTimers) clearTimeout(t);
  scaleHighlightTimers.length = 0;
  const strip = document.getElementById("degreeStrip");
  if (strip) strip.querySelectorAll(".degree-col.is-playing").forEach((el) => el.classList.remove("is-playing"));
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
  await audio.instrumentSampler.preloadRange(24, 108);
}

function stopSampleExecutionLoop() {
  if (sampleStepTimer) {
    clearTimeout(sampleStepTimer);
    sampleStepTimer = null;
  }
  sampleTonicNextAt = 0;
  sampleHarmonyArpIndex = 0;
  sampleSlotsArpIndex = 0;
  sampleBassPatIndex = 0;
}

function refreshSampleExecutionLoop() {
  stopSampleExecutionLoop();
  if (!audioUserEnabled || !audio.ctx || audio.ctx.state !== "running") return;
  const soundMode = document.getElementById("soundMode")?.value ?? "synth";
  if (soundMode !== "sample" || !audio.instrumentSampler || !audio.scaleSampleBus) return;

  const step = () => {
    if (!audioUserEnabled || !audio.ctx || audio.ctx.state !== "running") return;
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
    const harmIdRaw = document.getElementById("harmonyBase")?.value ?? "off";
    const muteHarmChords = harmonyChordSamplesMuted();
    if (!slotsIsolated && harmIdRaw !== "off" && !muteHarmChords && audio.harmStabBus) {
      const harmMidis = harmonyMidis(tcp, harmonyRefIvals(), harmIdRaw, baseOct);
      const harmVol = Number(document.getElementById("harmVol").value) / 100;
      const peak = Math.max(0.04, Math.min(0.16, harmVol * 0.14));
      const harmonyStyle = document.getElementById("harmonyStyle")?.value || "sustain";
      if (harmonyStyle === "arpeggio" && harmMidis.length) {
        const idx = sampleHarmonyArpIndex % harmMidis.length;
        sampleHarmonyArpIndex += 1;
        audio.instrumentSampler.playNoteAt(audio.harmStabBus, harmMidis[idx], t, peak, 0.34, "arpeggio");
      } else if (harmonyStyle === "arpeggio_full" && harmMidis.length) {
        const gap = Math.max(0.016, Math.min(beat / (harmMidis.length + 1), 0.09));
        const noteDur = Math.min(0.34, gap * 2.8);
        harmMidis.forEach((m, i) => {
          audio.instrumentSampler.playNoteAt(audio.harmStabBus, m, t + i * gap, peak, noteDur, "arpeggio");
        });
      } else {
        const dur = harmonyStyle === "pluck" ? 0.34 : 1.0;
        harmMidis.forEach((m) => {
          audio.instrumentSampler.playNoteAt(audio.harmStabBus, m, t, peak, dur, harmonyStyle);
        });
      }
    }

    // Linha de baixo (pode usar harmonia ou só I se «harmonia desligada»)
    const bassMode = document.getElementById("harmonyBassMode")?.value ?? "off";
    const harmIdForBass = effectiveHarmonyIdForBassSamples(harmIdRaw);
    if (!slotsIsolated && harmIdForBass !== "off" && bassMode !== "off" && audio.instrumentSampler) {
      const bMidiRaw = nextHarmonyBassMidi(tcp, harmonyRefIvals(), harmIdForBass, baseOct, bassMode, sampleBassPatIndex);
      sampleBassPatIndex += 1;
      if (bMidiRaw != null) {
        // Em vez de clamp (que dobra notas para a mesma altura nos extremos),
        // transpõe por oitavas até cair no intervalo audível — preserva a relação harmônica.
        let bMidi = bMidiRaw;
        while (bMidi < 28) bMidi += 12;
        while (bMidi > 108) bMidi -= 12;
        const bassVol = Number(document.getElementById("harmonyBassVol")?.value ?? 44) / 100;
        const bPeak = Math.max(0.04, Math.min(0.2, bassVol * 0.17));
        const hStyleRaw = document.getElementById("harmonyStyle")?.value || "sustain";
        const hStyle = hStyleRaw === "arpeggio_full" ? "sustain" : hStyleRaw;
        // Duração: para walking bass/ostinato fica mais limpo se a nota não invade
        // o próximo tempo. Antes `beat * 0.98` gerava sobreposição constante com o
        // release das samples; agora ~70% do beat deixa respiro entre notas.
        const bDur =
          hStyle === "pluck"
            ? Math.max(0.14, Math.min(0.38, beat * 0.42))
            : Math.max(0.22, Math.min(0.62, beat * 0.7));
        audio.instrumentSampler.playNoteAt(audio.scaleSampleBus, bMidi, t + 0.006, bPeak, bDur, hStyle);
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
  };

  // Agendamento auto-encadeado: lê o BPM corrente em cada iteração (sem drift e sem
  // reinícios quando o utilizador ajusta o andamento).
  let nextAt = (audio.ctx?.currentTime ?? 0) + 60 / currentBpm();
  const scheduleNext = () => {
    if (!audioUserEnabled || !audio.ctx || audio.ctx.state !== "running") return;
    step();
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
  ["bankInstrument"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !sm;
  });
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
}

function currentIvals() {
  const key = document.getElementById("scaleType").value;
  return SCALE_TYPES[key].intervals;
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

function refreshSlotRow(slot) {
  const selects = slot.querySelectorAll("select");
  const degSel = selects[0];
  if (!degSel) return;
  const slotI = Number(slot.dataset.index);
  const slotIdx = Number.isFinite(slotI) ? slotI : 0;
  const iv = currentIvals();
  const tcp = currentTonicPc();
  const pf = preferFlats();
  const mode = currentSlotInputMode();
  const degLabel = slot.querySelector(".slot-deg-label");
  if (degLabel) degLabel.textContent = "Grau";

  for (let di = 0; di < degSel.options.length; di += 1) {
    degSel.options[di].textContent = formatSlotDegreeLabel(di + 1, iv, tcp, pf);
  }

  const d = Number(degSel.value);
  const roman = slot.querySelector(".slot-roman");
  const inter = slot.querySelector(".slot-interval");
  const idx = slot.querySelector(".slot-index");
  const r = romanForExtendedDegree(iv, d);

  if (mode === "degree") {
    if (roman) roman.textContent = r.roman;
    if (inter) inter.textContent = intervalNameFromTonic(degreeToSemitonesFromTonic(iv, d));
    if (idx) idx.textContent = `Slot ${slotIdx + 1}\n${formatSlotDegreeLabel(d, iv, tcp, pf)}`;
  } else {
    const ct = String(selects[2]?.value ?? "maj");
    const sym = chordSymbolPreview(ct, d, iv, tcp, pf);
    const comp = chordCompositionNoteNames(ct, d, iv, tcp, pf);
    const n = iv.length;
    if (roman) roman.textContent = `${sym}\nNotas: ${comp}`;
    if (inter) {
      const model = CHORD_SLOT_LABELS[ct] ?? ct;
      if (n === 7) {
        const innerDeg = ((d - 1) % 7) + 1;
        const diatTri = romanForDegree(iv, innerDeg);
        inter.textContent = `Grau ${d} (${r.roman}) · tríade escala: ${triadQualityPt(diatTri.quality)} · modelo: ${model}`;
      } else {
        inter.textContent = `Grau ${d} (${r.roman}) · escala com ${n} notas/oitava · modelo: ${model}`;
      }
    }
    if (idx) idx.textContent = `Slot ${slotIdx + 1}\n${formatSlotDegreeLabel(d, iv, tcp, pf)}`;
  }
}

function buildSlots() {
  const root = document.getElementById("slots");
  root.innerHTML = "";

  for (let i = 0; i < 8; i += 1) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.index = String(i);

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
    });

    const degSel = document.createElement("select");
    for (let d = 1; d <= MAX_DEGREE_LABEL; d += 1) {
      const o = document.createElement("option");
      o.value = String(d);
      o.textContent = formatSlotDegreeLabel(d, currentIvals(), currentTonicPc(), preferFlats());
      degSel.appendChild(o);
    }
    degSel.value = String((i % currentIvals().length) + 1);

    const octSel = document.createElement("select");
    for (let o = -1; o <= 2; o += 1) {
      const opt = document.createElement("option");
      opt.value = String(o);
      opt.textContent = o >= 0 ? `+${o} 8va` : `${o} 8va`;
      octSel.appendChild(opt);
    }
    octSel.value = "0";

    const wrapOn = document.createElement("label");
    wrapOn.className = "field field-inline";
    wrapOn.appendChild(document.createElement("span")).textContent = "Ativo";
    wrapOn.appendChild(on);

    const degLabel = document.createElement("span");
    degLabel.className = "slot-deg-label";
    degLabel.textContent = "Grau";

    const wrapDeg = document.createElement("label");
    wrapDeg.className = "field field-inline";
    wrapDeg.appendChild(degLabel);
    wrapDeg.appendChild(degSel);

    const wrapOct = document.createElement("label");
    wrapOct.className = "field field-inline";
    wrapOct.appendChild(document.createElement("span")).textContent = "Oitava";
    wrapOct.appendChild(octSel);

    const chordSel = document.createElement("select");
    chordSel.title = "Tipo de acorde deste slot (modo Por acorde)";
    Object.keys(CHORD_SLOT_LABELS).forEach((key) => {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = CHORD_SLOT_LABELS[key];
      chordSel.appendChild(o);
    });
    chordSel.value = "maj";

    const wrapChord = document.createElement("label");
    wrapChord.className = "field field-inline slot-chord-wrap";
    wrapChord.appendChild(document.createElement("span")).textContent = "Qualidade";
    wrapChord.appendChild(chordSel);

    slot.appendChild(idx);
    slot.appendChild(roman);
    slot.appendChild(inter);
    slot.appendChild(wrapOn);
    slot.appendChild(wrapDeg);
    slot.appendChild(wrapOct);
    slot.appendChild(wrapChord);

    refreshSlotRow(slot);

    degSel.addEventListener("change", () => {
      refreshSlotRow(slot);
      scheduleSyncAudio();
      updateSlotsMissingNotes();
    });
    octSel.addEventListener("change", () => {
      refreshSlotRow(slot);
      scheduleSyncAudio();
    });
    chordSel.addEventListener("change", () => {
      refreshSlotRow(slot);
      scheduleSyncAudio();
      updateSlotsMissingNotes();
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
    const selects = slot.querySelectorAll("select");
    const deg = Number(selects[0]?.value ?? 1);
    const oct = Number(selects[1]?.value ?? 0);
    const chordType = String(selects[2]?.value ?? "maj");
    out.push({ on, deg, oct, chordType });
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

  if (currentSlotInputMode() === "chord") {
    if (el) {
      el.textContent =
        "Modo «Por acorde»: cada slot escolhe o grau da fundamental e a qualidade do acorde (podem ser diferentes entre slots). A dica de graus em falta aplica-se ao modo «Por grau».";
    }
    updateSlotChordLabel();
    return;
  }

  if (el) {
    const n = ivals.length;
    const present = new Set();
    active.forEach((s) => {
      const stepIdx = ((s.deg - 1) % n + n) % n;
      present.add(stepIdx);
    });
    const missing = [];
    for (let d = 0; d < n; d += 1) {
      if (!present.has(d)) {
        const notePc = (tcp + ivals[d]) % 12;
        missing.push(pcToName(notePc, pf));
      }
    }
    if (!active.length) {
      const base = ivals.map((st) => pcToName((tcp + st) % 12, pf)).join(", ");
      el.textContent = `Notas faltantes nos slots (nenhum ativo): ${base}`;
    } else {
      el.textContent = missing.length
        ? `Notas faltantes nos slots: ${missing.join(", ")}`
        : "Notas faltantes nos slots: —";
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
  const harmMidis = harmonyMidis(tcp, harmonyRefIvals(), harmId, baseOct);
  const freqsH = harmMidis.map((m) => midiToFreq(m));
  const harmVolApplied = soundMode === "sample" ? 0 : harmId === "off" || muteHarmChords ? 0 : harmVol;
  audio.setHarmony(freqsH, harmVolApplied);

  const states = readSlotsState();
  states.forEach((s, i) => {
    const midi = midiForScaleDegree(tcp, ivals, s.deg, baseOct + s.oct);
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
    const style = document.getElementById("harmonyStyle")?.value || "sustain";
    const hk = `${tcp}|${harmId}|${style}|${muteHarmChords ? 1 : 0}`;
    if (!audio._harmStabPrimed) {
      audio._harmStabPrimed = true;
      audio._harmStabKey = hk;
    } else if (hk !== audio._harmStabKey) {
      audio._harmStabKey = hk;
      const t = audio.ctx.currentTime + 0.04;
      audio.harmStabBus.gain.cancelScheduledValues(t);
      audio.harmStabBus.gain.setValueAtTime(0.58, t);
      const st = style === "arpeggio" ? 0.06 : 0;
      if (style === "arpeggio") {
        // Stab em arpejo real: ciclo curto pelas notas do acorde.
        harmMidis.forEach((m, i) => {
          audio.instrumentSampler.playNoteAt(audio.harmStabBus, m, t + i * st, 0.1, 0.26, "arpeggio");
        });
      } else if (style === "arpeggio_full") {
        const gap = 0.055;
        harmMidis.forEach((m, i) => {
          audio.instrumentSampler.playNoteAt(audio.harmStabBus, m, t + i * gap, 0.1, 0.26, "arpeggio");
        });
      } else {
        harmMidis.forEach((m) => {
          audio.instrumentSampler.playNoteAt(audio.harmStabBus, m, t, 0.095, style === "pluck" ? 0.28 : 0.45, style);
        });
      }
    }
  }
}

function wireGlobalControls() {
  const btnAudio = document.getElementById("btnAudio");

  function setAudioButtonState(state) {
    // state: false | true | "loading"
    btnAudio.classList.toggle("btn-primary", state === true || state === "loading");
    btnAudio.classList.toggle("is-loading", state === "loading");
    if (state === "loading") {
      btnAudio.textContent = "A carregar amostras…";
      btnAudio.setAttribute("aria-pressed", "true");
      btnAudio.setAttribute("aria-busy", "true");
    } else {
      btnAudio.textContent = state ? "Desativar áudio" : "Ativar áudio";
      btnAudio.setAttribute("aria-pressed", state ? "true" : "false");
      btnAudio.setAttribute("aria-busy", "false");
    }
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
      try {
        await audio.ctx.resume();
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

  btnAudio.addEventListener("click", toggleAudio);

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
    "harmonyMuteChords",
    "bassWithHarmonyOff",
    "harmonyBassMode",
    "harmonyBassOctave",
    "droneOn",
    "playStyle",
    "tonicStyle",
    "tonicOctave",
    "slotMixMode",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", onContextChange);
  });

  const slotInputMode = document.getElementById("slotInputMode");
  if (slotInputMode) {
    slotInputMode.addEventListener("change", () => {
      applySlotInputModeChrome();
      refreshAllSlotsUI();
      updateSlotsMissingNotes();
      scheduleSyncAudio();
      refreshSampleExecutionLoop();
    });
  }

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
  ["harmVol", "harmonyBassVol", "droneVol", "slotsVol", "globalBpm"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", onContextChange);
  });

  const masterGainEl = document.getElementById("masterGain");
  if (masterGainEl) {
    masterGainEl.addEventListener("input", () => {
      applyMasterGainFromUI();
      updateSliderValueLabel(masterGainEl);
    });
  }

  // Rótulos de valor ao lado de sliders / inputs numéricos.
  const valueDisplayIds = ["harmVol", "harmonyBassVol", "droneVol", "slotsVol", "masterGain", "globalBpm"];
  const valueSuffix = {
    harmVol: "%",
    harmonyBassVol: "%",
    droneVol: "%",
    slotsVol: "%",
    masterGain: "%",
    globalBpm: " BPM",
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

  document.getElementById("btnMuteAll").addEventListener("click", () => {
    document.querySelectorAll('.slot input[type="checkbox"]').forEach((c) => {
      c.checked = false;
    });
    document.querySelectorAll(".slot").forEach((s) => s.classList.remove("on"));
    updateSlotsMissingNotes();
    scheduleSyncAudio();
    refreshSampleExecutionLoop();
  });

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
    const oct = Number(document.getElementById("seqOctaves").value) || 1;
    const bpm = currentBpm();
    const rhythm = document.getElementById("seqRhythm").value;
    const latch = document.getElementById("seqLatch").checked;
    const loopOn = !!document.getElementById("seqLoop")?.checked;
    const loopGap = Number(document.getElementById("seqLoopGap")?.value ?? 0.5) || 0;
    const degs = buildScaleDegrees(ivals, dir, oct);
    const baseOct = slotsPlaybackBaseOct();
    const midis = degs.map((d) => midiForScaleDegree(tcp, ivals, d, baseOct));
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
    // O engine usa `t0 = ctx.currentTime + 0.06` ao iniciar — replicamos aqui.
    const ctxNow = audio.ctx?.currentTime ?? 0;
    const t0Ui = ctxNow + 0.06;
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

    await audio.playScaleSequence({ freqs, times, durs, gain: 0.32, mode, midis, sampler });

    if (!loopOn || myToken !== scaleLoopToken) return;
    const beat = 60 / bpm;
    const lastIdx = times.length - 1;
    const lastDur = durs[lastIdx] ?? beat;
    const lastStart = times[lastIdx] ?? 0;
    const playDuration = Math.max(total, lastStart + lastDur);
    const waitS = playDuration + Math.max(0, loopGap) * beat + 0.08;
    clearTimeout(scaleLoopTimer);
    const nextIteration = iteration + 1;
    scaleLoopTimer = setTimeout(() => {
      if (myToken !== scaleLoopToken) return;
      void runScaleOnce(myToken, nextIteration);
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

  document.getElementById("btnPlayScale").addEventListener("click", () => {
    stopScaleLoop();
    scaleLoopToken += 1;
    void runScaleOnce(scaleLoopToken);
  });

  document.getElementById("btnStopScale").addEventListener("click", () => {
    stopScaleLoop();
    audio.stopScale();
    stopSampleExecutionLoop();
  });

  // Se o utilizador desliga o loop enquanto já está a correr, cancela o reagendamento.
  const seqLoopEl = document.getElementById("seqLoop");
  if (seqLoopEl) {
    seqLoopEl.addEventListener("change", () => {
      if (!seqLoopEl.checked) {
        if (scaleLoopTimer) {
          clearTimeout(scaleLoopTimer);
          scaleLoopTimer = null;
        }
      }
    });
  }

  setAudioButtonState(false);
  syncTonicSoundButton();
  updateSampleControlsEnabled();
}

// init
populateSelects();
renderScaleMeta();
renderDegreeStrip();
updateScaleStarLabels();
buildSlots();
applySlotInputModeChrome();
wireGlobalControls();
updateSampleControlsEnabled();
updateSlotsMissingNotes();

// Corrige eventos duplicados: preferFlats etc. recriam slots — wire apenas uma vez nos selects globais
// rebuild slots destroy listeners inside slots — re-bind sync on container
document.getElementById("slots").addEventListener("change", () => {
  updateSlotsMissingNotes();
  scheduleSyncAudio();
  refreshSampleExecutionLoop();
});
