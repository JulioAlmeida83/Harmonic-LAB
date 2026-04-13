# Harmonic Lab

Intervalos, escalas, slots, harmonia e reprodução por **amostras** (Web Audio).

## Local

```bash
npm install
npm run fetch-samples   # opcional se ainda não tens WAV em samples/bank/
npm run serve
```

Abre `http://localhost:3000` (não uses `file://`).

## GitHub + deploy (Pages)

1. Cria um repositório vazio no GitHub (sem README gerado pelo site, ou faz merge depois).
2. Na pasta do projeto:

   ```bash
   git init
   git add .
   git commit -m "Initial commit: Harmonic Lab"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
   git push -u origin main
   ```

3. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (uma vez por repositório).
4. Faz push da branch **`main`**. Em **Actions** corre o workflow **Deploy Pages**; o URL aparece no job e em **Settings → Pages** (ex.: `https://SEU_USUARIO.github.io/SEU_REPO/`).

Se o GitHub pedir aprovação do ambiente **github-pages** no primeiro deploy, confirma em **Settings → Environments**.

### Push grande (~165 MB de WAV)

Se o `git push` falhar por buffer:

```bash
git config http.postBuffer 524288000
```

## Amostras

Créditos em `samples/bank/CREDITS.txt` (tonejs-instruments, CC-BY 3.0).
