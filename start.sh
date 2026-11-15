#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ -n "${MSYSTEM:-}" ]]; then
  if ! command -v powershell.exe >/dev/null 2>&1 || ! command -v cygpath >/dev/null 2>&1; then
    echo "Run this script from Git Bash with PowerShell available."
    exit 1
  fi

  export QLTH_PROJECT_ROOT="$(cygpath -w "$ROOT_DIR")"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '
$ErrorActionPreference = "Stop"
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm use 26
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location -LiteralPath $env:QLTH_PROJECT_ROOT
if (-not (Test-Path backend/.env)) { throw "Missing backend/.env." }
if (-not (Test-Path node_modules)) {
  npm.cmd ci
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$pgIsReady = "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe"
if (Test-Path $pgIsReady) {
  & $pgIsReady -h localhost -p 5432
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
npm.cmd run migrate --prefix backend
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run dev
exit $LASTEXITCODE
'
  exit $?
fi

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell bash)"
  fnm use 26
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required. Install Node.js 26 and initialize fnm in Git Bash."
  exit 1
fi

if [[ ! -f backend/.env ]]; then
  echo "Missing backend/.env. Configure it using backend/.env.example."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi

PG_ISREADY="/c/Program Files/PostgreSQL/18/bin/pg_isready.exe"
if [[ -x "$PG_ISREADY" ]]; then
  "$PG_ISREADY" -h localhost -p 5432
fi

npm run migrate --prefix backend
npm run dev
