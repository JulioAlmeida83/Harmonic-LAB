/**
 * Instala bancos reais de instrumentos (WAV) em samples/bank/<instrumento>/{midi}.wav.
 * Fontes: tonejs-instruments (código MIT; samples CC-BY 3.0).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BANK = path.join(ROOT, "samples", "bank");
const GITHUB_API = "https://api.github.com/repos/nbrosowsky/tonejs-instruments/contents/samples";
const RAW_BASE = "https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Rede instável (ECONNRESET, etc.): várias tentativas com backoff. */
async function withRetries(fn, label, max = 8) {
  let last;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt === max) break;
      const wait = 800 * 2 ** (attempt - 1) + Math.random() * 600;
      console.warn(`\n  [retry ${attempt}/${max}] ${label}: ${e.message || e} — espera ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }
  throw last;
}

const SOURCES = [
  { target: "piano", sourceDir: "piano" },
  // Rhodes-like: usa organ do pacote (teclado elétrico claramente distinto do piano).
  { target: "rhodes", sourceDir: "organ" },
  { target: "cello", sourceDir: "cello" },
  { target: "acoustic_bass", sourceDir: "contrabass" },
  { target: "jazz_bass", sourceDir: "bass-electric" },
  { target: "fender_guitar", sourceDir: "guitar-electric" },
  { target: "guitar_distorted", sourceDir: "guitar-electric" },
  { target: "acoustic_guitar", sourceDir: "guitar-acoustic" },
  { target: "clarinet", sourceDir: "clarinet" },
  { target: "native_flute", sourceDir: "flute" },
  // --- Novos instrumentos harmónicos ---
  { target: "harmonium", sourceDir: "harmonium" },
  { target: "harp", sourceDir: "harp" },
  { target: "guitar_nylon", sourceDir: "guitar-nylon" },
  { target: "violin", sourceDir: "violin" },
  { target: "saxophone", sourceDir: "saxophone" },
  { target: "trumpet", sourceDir: "trumpet" },
  { target: "trombone", sourceDir: "trombone" },
  { target: "french_horn", sourceDir: "french-horn" },
  { target: "bassoon", sourceDir: "bassoon" },
  { target: "xylophone", sourceDir: "xylophone" },
];

const CREDITS = `Créditos — amostras descarregadas automaticamente
==========================================

Fonte principal:
  Repositório: https://github.com/nbrosowsky/tonejs-instruments
  Licença do código: MIT
  Licença das amostras: CC-BY 3.0 (ver README/LICENSE do repositório)

Mapeamento local (tonejs-instruments / samples):
  piano, rhodes (organ), cello, acoustic_bass (contrabass)
  jazz_bass (bass-electric), fender_guitar e guitar_distorted (guitar-electric),
  acoustic_guitar (guitar-acoustic), clarinet, native_flute (flute sinfónica),
  harmonium (harmonium), harp (harp), guitar_nylon (guitar-nylon), violin,
  saxophone, trumpet, trombone, french_horn (french-horn), bassoon, xylophone

Nomes de ficheiro do pack (ex.: As3, Cs4): «s» = sustenido (A# , C# , …).

As notas são gravadas como âncoras {MIDI}.wav reais por instrumento.
As notas intermediárias são resolvidas em runtime por vizinho + pitch-shift.

Gerado por: npm run fetch-samples
`;

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

async function fetchJson(url) {
  return withRetries(async () => {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.json();
  }, `GET ${url}`);
}

async function fetchBuf(url) {
  return withRetries(async () => {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }, `GET ${url.slice(0, 90)}…`);
}

function noteNameToMidi(note) {
  const m = /^([A-Ga-g])([b#s]?)(-?\d+)$/.exec(note.trim());
  if (!m) return null;
  const l = m[1].toUpperCase();
  const acc = m[2];
  const oct = Number(m[3]);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[l];
  const adj = acc === "#" || acc === "s" ? 1 : acc === "b" ? -1 : 0;
  return (oct + 1) * 12 + base + adj;
}

async function installOneSource(target, sourceDir) {
  const targetDir = path.join(BANK, target);
  ensureDir(targetDir);
  // Limpa WAVs antigos para evitar notas "falsas" copiadas.
  for (const f of fs.readdirSync(targetDir)) {
    if (/\.wav$/i.test(f)) fs.unlinkSync(path.join(targetDir, f));
  }
  const items = await fetchJson(`${GITHUB_API}/${sourceDir}`);
  const wavs = items.filter((x) => x.type === "file" && /\.wav$/i.test(x.name));

  for (const f of wavs) {
    const midi = noteNameToMidi(f.name.replace(/\.wav$/i, ""));
    if (midi === null) continue;
    process.stdout.write(`[${target}] ${f.name} -> ${midi}.wav ... `);
    const rawUrl = `${RAW_BASE}/${sourceDir}/${encodeURIComponent(f.name)}`;
    const buf = await fetchBuf(rawUrl);
    fs.writeFileSync(path.join(targetDir, `${midi}.wav`), buf);
    console.log(`${buf.length} bytes`);
  }
}

async function main() {
  for (const s of SOURCES) {
    ensureDir(path.join(BANK, s.target));
    await installOneSource(s.target, s.sourceDir);
  }

  fs.writeFileSync(path.join(BANK, "CREDITS.txt"), CREDITS, "utf8");
  console.log("\nConcluído. Banco instalado com âncoras reais por instrumento.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
