/**
 * Download de contrabaixo pizzicato do projecto sfzinstruments/dsmolken.double-bass
 * (1958 Otto Rubner double bass, CC0).
 *
 * Tentou-se primeiro University of Iowa MIS mas o servidor passou a exigir
 * autenticação NTLM — inacessível publicamente. Dsmolken é equivalente em
 * qualidade, já em WAV (sem conversão AIFF), e CC0 formal.
 *
 * Guardamos apenas a variante "fa" (forte, round robin A) de cada nota, uma
 * amostra por MIDI — o sampler faz pitch-shift entre anchors para preencher
 * as intermediárias. Total ~5 MB.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET_DIR = path.join(ROOT, "samples", "bank", "jazz_upright_bass");

const BASE_URL =
  "https://raw.githubusercontent.com/sfzinstruments/dsmolken.double-bass/master/pizz";

/** Mapeamento nome-ficheiro → MIDI (scientific pitch: C4 = 60). */
const NOTE_TO_MIDI = {
  // octave 1 (mídia-grave, MIDI 24–35)
  c1: 24,
  eb1: 27,
  g1: 31,
  bb1: 34,
  // octave 2
  d2: 38,
  f2: 41,
  a2: 45,
  // octave 3
  c3: 48,
  e3: 52,
  g3: 55,
  a3: 57,
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function withRetries(fn, label, max = 5) {
  let last;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt === max) break;
      const wait = 600 * 2 ** (attempt - 1) + Math.random() * 500;
      console.warn(`\n  [retry ${attempt}/${max}] ${label}: ${e.message || e} — espera ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }
  throw last;
}

async function fetchBuf(url) {
  return withRetries(async () => {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }, `GET ${url.slice(-40)}`);
}

const CREDITS = `Créditos — contrabaixo pizzicato (dsmolken)
============================================

Fonte:
  D. Smolken — 1958 Otto Rubner double bass
  Repositório: https://github.com/sfzinstruments/dsmolken.double-bass
  Licença: royalty-free, uso comercial permitido (ver LICENSE do repo).

Articulação:
  Pizzicato, dynamic "forte" (f), round robin "a" (uma amostra por nota).
  Formato original WAV (sem conversão aqui).

Mapeamento:
  pizz_[note][octave]_fa.wav → {midi}.wav (scientific pitch: C4 = 60).

Gerado por: npm run fetch-iowa-mis
`;

async function main() {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  // Limpa WAVs antigos da pasta (não apaga CREDITS nem outros)
  for (const f of fs.readdirSync(TARGET_DIR)) {
    if (/\.wav$/i.test(f)) fs.unlinkSync(path.join(TARGET_DIR, f));
  }
  const downloaded = [];
  let totalBytes = 0;
  for (const [name, midi] of Object.entries(NOTE_TO_MIDI)) {
    const filename = `pizz_${name}_fa.wav`;
    const url = `${BASE_URL}/${filename}`;
    process.stdout.write(`[${midi}] ${filename} … `);
    try {
      const buf = await fetchBuf(url);
      fs.writeFileSync(path.join(TARGET_DIR, `${midi}.wav`), buf);
      totalBytes += buf.length;
      downloaded.push(midi);
      process.stdout.write(`${(buf.length / 1024).toFixed(0)} KB\n`);
    } catch (e) {
      process.stdout.write(`SKIP (${e.message || e})\n`);
    }
  }
  fs.writeFileSync(path.join(TARGET_DIR, "CREDITS.txt"), CREDITS, "utf8");
  console.log(`\n${downloaded.length} notas baixadas (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Anchors para sound-bank.js: [${downloaded.sort((a, b) => a - b).join(", ")}]`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
