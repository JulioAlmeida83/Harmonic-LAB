@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

title Harmonic Lab — servidor local

echo ========================================
echo   Harmonic Lab
echo ========================================
echo.

REM --- 1) Amostras (Node/npm). Opcional se ja tiveres os WAV. ---
where npm >nul 2>&1
if errorlevel 1 (
  echo [AVISO] npm nao encontrado — nao foi possivel correr "npm run fetch-samples".
  echo          Instala Node.js LTS de https://nodejs.org/ para descarregar sons automaticamente.
  echo          Se ja tens samples/bank/piano/*.wav, podes continuar.
  echo.
) else (
  echo [1/2] A descarregar/configurar amostras ^(npm run fetch-samples^)...
  call npm run fetch-samples
  if errorlevel 1 (
    echo [AVISO] fetch-samples falhou — verifica a rede ou o Node. A continuar na mesma.
    echo.
  ) else (
    echo.
  )
)

REM --- 2) Servidor HTTP na porta 8080 ---
set "PORT=8080"
echo [2/2] A iniciar servidor em http://localhost:%PORT%/
echo       Abre index.html por esse endereco. Fecha esta janela para parar.
echo.

where python >nul 2>&1
if not errorlevel 1 (
  start "" "http://localhost:%PORT%/"
  python -m http.server %PORT%
  goto :END
)

where py >nul 2>&1
if not errorlevel 1 (
  start "" "http://localhost:%PORT%/"
  py -m http.server %PORT%
  goto :END
)

where npx >nul 2>&1
if not errorlevel 1 (
  start "" "http://localhost:%PORT%/"
  call npx --yes serve . -l %PORT%
  goto :END
)

echo [ERRO] Nao foi encontrado Python ^(python ou py^) nem npx ^(Node^).
echo        Instala Python de https://www.python.org/downloads/
echo        ou Node de https://nodejs.org/ e volta a correr este ficheiro.
pause
exit /b 1

:END
echo.
echo Servidor terminado.
pause
exit /b 0
