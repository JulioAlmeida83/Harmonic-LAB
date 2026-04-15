# Design — Exportar áudio + Caixa de ritmo

Documento de arquitectura para duas features novas. Escopo definido em
conversa (14/04/2026); ordem de execução: **export primeiro**, ritmos
depois.

---

## 1. Exportar áudio

### Objetivo
Botão "Exportar MP3" que gera um ficheiro com **N repetições da sequência
de acordes actualmente configurada** (tonic, escala, BPM, instrumento,
padrão de execução, padrão de baixo, slots activos, etc.). O resultado
deve ser **bit-para-bit igual** ao que o utilizador ouve ao vivo, com
uma única diferença: o jitter humanizador continua a existir mas fica
deterministicamente semeado pelo nº do compasso, tal como no live.

### Arquitectura

Usamos `OfflineAudioContext` — a única forma de render determinístico em
tempos superiores ao tempo real, sem picos de CPU a fazer garbling.

```
+--------------------+
| UI: Exportar MP3   |
|  • repetições N    |
|  • fade in/out     |
+---------+----------+
          |
          v
+--------------------+       (1) pré-condições
| renderProgression  |       ✔ progressão activa
|  (bpm, N, tonic)   |       ✔ ≥1 step resolvido
+---------+----------+       ✔ sampler carregado
          |
          v
+--------------------------------+
| OfflineAudioContext            |
|  sr=44100, ch=2, len=beats*sr  |
|  • replicar grafo live:        |
|    masterMix → limiter → dry   |
|                          → wet |
|  • OfflineSampler              |
|  • OfflineDroneOscillator      |
+-------------+------------------+
              |
              v
+--------------------------------+
| agendar TODOS os eventos       |
|  do loop (idêntico ao motor    |
|  sample-execution live):       |
|   for bar in 0..totalBars-1:   |
|     for beat in 0..3:          |
|       executeHarmonyPattern(...)|
|       bass.playNoteAt(...)      |
|       slot.playNoteAt(...)      |
|       scaleSeq (se ligada)     |
+-------------+------------------+
              |
              v
+--------------------+
| startRendering()   |  (resolve AudioBuffer)
+---------+----------+
          |
          v
+--------------------+
| encodeMp3 (lamejs) |  (ch L+R → Int16 → MP3 @ 128 kbps)
+---------+----------+
          |
          v
+--------------------+
| Blob → download    |  ("HL_C_96bpm_4bars.mp3")
+--------------------+
```

### Decisões

- **Sample rate**: 44100 Hz (compatível com tudo, tamanho razoável).
- **Canais**: 2 (estéreo). O `masterMix` já está em estéreo via o convolver
  do reverb — preservamos a espacialidade.
- **Duração**: `beatsPerBar * barsPerRep * reps * (60/bpm)` segundos,
  mais um tail de ~0.8s para as últimas amostras decaírem.
- **Fade**: opcional fade-in 0.02s + fade-out 0.3s para evitar cliques
  nas bordas.
- **MP3 bitrate**: 128 kbps (padrão streaming). Podemos expor 192/320
  depois.
- **Lib**: `lamejs` (85 kB minified, puro JS, sem WASM). Importada via
  `<script src="lib/lamejs.min.js">` a partir de CDN (unpkg). Alternativa
  mais robusta: copiar para `lib/` do repo e servir offline.

### Contrato API interno

```js
// Em app.js, novo módulo: export.js (ou bloco dentro de app.js)

/**
 * @param {object} opts
 * @param {number} opts.reps — nº de repetições da progressão (1..16)
 * @param {boolean} opts.fade — aplicar fade-in/out
 * @param {"mp3"|"wav"} opts.format
 * @param {(pct:number)=>void} opts.onProgress
 * @returns {Promise<Blob>}
 */
async function renderProgressionToBlob(opts) { ... }
```

O `renderProgressionToBlob` **não** usa o AudioContext live — usa um
`OfflineAudioContext` próprio. Para isso é preciso:

1. **Abstrair a criação do grafo**: refactorar `audio.ensure()` para que
   a parte "criar nodes" aceite um `ctx` injectado (live ou offline).
2. **Abstrair o sampler**: `HLInstrumentSampler` já recebe `ctx` no
   constructor. Precisamos de uma variante "offline" que pré-carregue
   todos os buffers **antes** de começar a agendar (o sampler live toca
   "o que estiver em cache"; offline tem que garantir 100% hit-rate).
3. **Refactor mínimo do loop**: a função que hoje agenda o acorde de
   cada batida no `setTimeout`-driven sample loop deve ser extraível
   para correr num "virtual clock" offline, dado um `absBeat` e um
   `t0` (em segundos offline).

### Etapas de implementação

1. **Refactor**: extrair `scheduleHarmonyForBar(ctx, bus, sampler, absBeat, t, beat, chord, style, ...)` do loop live — sem mudar comportamento.
2. **OfflineGraph**: função que constrói masterMix+limiter+reverb num `OfflineAudioContext` (código duplicado minimalmente com `audio.ensure()`, protegido por testes).
3. **OfflineSampler**: wrapper que chama `preloadRange(lo, hi)` com os MIDIs efectivamente usados na progressão (calculável antes do render) e só começa a render depois de tudo em cache.
4. **renderProgressionToBlob(opts)** → `AudioBuffer`.
5. **Encoder MP3**: wrapper `bufferToMp3(buf, bitrate)` usando lamejs.
6. **UI**: botão "Exportar MP3" num novo bloco "Exportar" ao lado da sequência. Modal simples com N repetições (default 4), fade on/off, barra de progresso.
7. **Filename**: `HL_<tonic><esc>_<bpm>bpm_<reps>x.mp3` (ex.: `HL_Cm_96bpm_4x.mp3`).
8. **Teste**: render 1 repetição de uma progressão trivial (I-V-I-V em C) com piano; assert length, sample rate, não-silêncio.

### Riscos & mitigações

- **Grafo live ↔ offline divergir**: mitigamos com teste unitário que
  compara `length` do buffer renderado vs esperado para BPM/repetições
  fixos. Se mudarmos o grafo live (e.g. acrescentar compressor), temos
  que atualizar o offline em paralelo. Manter um helper partilhado
  `buildMasterGraph(ctx)` evita duplicação.
- **lamejs e workers**: a codificação bloqueia o main thread. Para
  progressões longas (ex.: 16 repetições em 60 BPM = ~4 min), o encode
  demora 3–10s. Aceitável para v1; se incomodar, mover para Web Worker.
- **iOS Safari**: `OfflineAudioContext` funciona em iOS desde Safari 14
  (já é o nosso mínimo). O pitfall é o `decodeAudioData` exigir buffer
  desanexado (`ab.slice(0)`) — já cumprido no sampler actual.

---

## 2. Caixa de ritmo

### Objetivo
Painel novo do tipo drum-machine: 5–7 pads percussivos (kick, snare,
hh-closed, hh-open, clap, perc1, perc2), grid de 16 steps, padrões
pré-configurados por estilo, sincronizado com o BPM global. Banco de
samples dedicado (WAV em `samples/drums/`).

### Arquitectura

```
+-------------------------------------+
| Caixa de ritmo                      |
|                                     |
|  [kick  ] [•][ ][ ][ ][•][ ][ ][ ][•][ ][ ][ ][•][ ][ ][ ]
|  [snare ] [ ][ ][ ][ ][•][ ][ ][ ][ ][ ][ ][ ][•][ ][ ][ ]
|  [hh-cl ] [•][ ][•][ ][•][ ][•][ ][•][ ][•][ ][•][ ][•][ ]
|  [hh-op ] [ ][ ][ ][•][ ][ ][ ][•][ ][ ][ ][•][ ][ ][ ][•]
|  [clap  ] [ ][ ][ ][ ][•][ ][ ][ ][ ][ ][ ][ ][•][ ][ ][ ]
|                                     |
|  Preset: [rock ▾] Volume: ▁▃▃▃▃▃▃▃  |
|  Swing: 0%  Accent: 1,5,9,13        |
+-------------------------------------+
```

### Decisões

- **Engine**: reutiliza `HLInstrumentSampler` com um `fallbackKind` novo
  `"drums"` mapeado para `samples/drums/<pad>.wav`. Cada pad é um MIDI
  "virtual" (36=kick, 38=snare, 42=hh-cl, 46=hh-op, 39=clap, 40=perc).
  Normalizer fica fora (drum nunca é transposto).
- **Bus dedicado**: `audio.drumBus` com gain próprio e send mínimo de
  reverb (2–5%, muito menos que a harmonia).
- **Grid**: 16 steps = 4 colcheias/beat × 4 beats. Subdivisão alternativa
  (12 steps = tercinas) deixada para v2.
- **Swing**: 0–60%, atrasa os steps ímpares (offbeats) em fracção da
  semicolcheia. Aplicado uniformemente a todas as linhas.
- **Accent**: máscara de steps com velocidade aumentada (+15–20%). Default:
  1, 5, 9, 13 (downbeats). Editável.
- **Presets**: rock_basic, funk_16, bossa_partido, samba, reggae_onedrop,
  hip_hop_boombap, swing_jazz. Cada um define padrão e accent.
- **Persistência**: estado do grid serializa em `localStorage` sob
  `hl.drumMachine` (igual ao `hl.uiMode`).
- **Sincronia**: o drum loop corre dentro do mesmo `sampleStepTimer` do
  sample-execution-loop — partilha `absBeat`, BPM, `syncAudio`. Se a
  harmonia parar, o drum também para (é uma voz do motor, não um motor
  à parte).

### Samples

Incluir no repo uma suite pequena (≤300 kB total):

- `samples/drums/kick.wav` (~15 kB 44.1 kHz 100 ms)
- `samples/drums/snare.wav`
- `samples/drums/hh_closed.wav`
- `samples/drums/hh_open.wav`
- `samples/drums/clap.wav`
- `samples/drums/perc.wav`

Fonte: livraria CC0 (ex.: Freesound.org com licença apropriada) ou
síntese algorítmica (kick = sine com envelope exponencial, snare =
noise+tone, hh = noise filtrado). Preferência por síntese para zero
dependências externas e licenças limpas.

### Etapas de implementação (v1 mínima)

1. Síntese dos 6 pads em JS puro como fallback (mesma estratégia do
   `createPluckBuffer`) — cada um produz um `AudioBuffer` determinístico.
2. Novo painel `#drumPanel` em index.html.
3. Estado `drumState = { grid: [[bool×16]×6], swing, accent, preset,
   volume }`.
4. Função `drumTick(absBeat, beat, t)` chamada de dentro do step-loop
   do sample-execution.
5. Presets em `drum-presets.js` (≤1 kB JSON).
6. Integração com export: `drumTick` aceita `ctx/bus/sampler` injectados
   para correr também no offline render.
7. UI: clicar num step liga/desliga; shift+click seta accent; drag
   selecciona múltiplos.
8. Testes: grid serialize/deserialize; aplicação de swing; accent aplica
   velocidade certa.

### Riscos & mitigações

- **Saturação no grid visual**: 16 steps × 6 linhas em mobile dá
  células pequenas. Solução: scroll horizontal em ≤480px, botões
  maiores. Design mobile-first.
- **Colisão com progressão**: os dois loopeiam no mesmo `absBeat`; se
  o utilizador carregar preset de ritmo "jazz" com progressão "rock" o
  resultado é inconsistente mas não quebra nada. Aceitável.
- **Tamanho do repo**: WAV reais pesam. Começar com síntese. Se não
  agradar, acrescentar WAV curados num commit separado.

---

## Ordem de execução

1. **Agora**: implementar export (este doc + lamejs + refactor mínimo).
2. **Depois**: caixa de ritmo seguindo o design acima; antes do primeiro
   commit, revalidar com o utilizador se o mockup/preset set continua a
   fazer sentido.
