#!/usr/bin/env bash
# Phase-8 verification harness for LawLens.
# Usage: bash scripts/verify.sh   (run from repo root)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}"
SERVER_PID=""
FAILED=0

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

section() { printf "\n\033[1m== %s ==\033[0m\n" "$1"; }

section "Secret scan (tracked files, excluding env files)"
if git grep -nE "sk-ant|sk-or-v1" -- . ':(exclude).env*' ':(exclude)*.example' ; then
  echo "FAIL: secret pattern found in tracked files"
  FAILED=1
else
  echo "OK: no secret patterns in tracked files"
fi
# Sarvam keys start with sk_ ; ignore known benign skips.
if git grep -nE "\bsk_[A-Za-z0-9]{20,}" -- . ':(exclude).env*' ':(exclude)*.example' ; then
  echo "FAIL: possible Sarvam key found in tracked files"
  FAILED=1
else
  echo "OK: no Sarvam key pattern in tracked files"
fi

section "Typecheck"
if npx tsc --noEmit; then echo "OK: typecheck"; else echo "FAIL: typecheck"; FAILED=1; fi

section "Guardrails tests"
if node --import tsx --test src/utils/guardrails.test.ts; then echo "OK: tests"; else echo "FAIL: tests"; FAILED=1; fi

section "Route smoke tests (server on :${PORT})"
if [[ -z "${OPENROUTER_API_KEY:-}" && -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "WARN: no LLM key in env — audit will use local fallback"
fi

node --import tsx server.ts > /tmp/lawlens-verify-server.log 2>&1 &
SERVER_PID=$!

ready=0
for _ in $(seq 1 30); do
  if curl -sf "${BASE}/api/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "FAIL: server did not become ready"
  tail -20 /tmp/lawlens-verify-server.log || true
  exit 1
fi

check() {
  local name="$1" method="$2" path="$3" body="${4:-}"
  local out status
  if [[ "$method" == "POST" ]]; then
    out=$(curl -s -m 90 -o /tmp/verify-body -w "%{http_code}" -X POST "${BASE}${path}" -H 'Content-Type: application/json' -d "$body" || echo "000")
  else
    out=$(curl -s -m 30 -o /tmp/verify-body -w "%{http_code}" "${BASE}${path}" || echo "000")
  fi
  status="$out"
  echo "• ${name}: HTTP ${status}"
  head -c 220 /tmp/verify-body 2>/dev/null; echo
  if [[ "$status" != "200" ]]; then FAILED=1; fi
}

check "health" GET "/api/health"
check "audit" POST "/api/audit" '{"contract_text":"Clause 4.2 The Tenant shall deposit an interest-free refundable caution deposit of Rs 2,50,000 prior to handover of keys. Clause 8.2 vacating before six months forfeits one month rent.","language":"en","contract_type":"residential_rental","title":"Verify Lease"}'
check "qa" POST "/api/qa" '{"question":"What is the deposit?","contract_text":"Clause 4.2 The Tenant shall deposit an interest-free refundable caution deposit of Rs 2,50,000 prior to handover of keys.","language":"en"}'
check "tts" POST "/api/tts" '{"text":"This is a verification of the text to speech route.","language":"en"}'

section "Result"
if [[ "$FAILED" -ne 0 ]]; then
  echo "VERIFY: FAILED"
  exit 1
fi
echo "VERIFY: PASSED"
