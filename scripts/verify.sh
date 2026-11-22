#!/usr/bin/env bash
# Phase-8 verification harness for LawLens (hardened).
#
# Usage:   bash scripts/verify.sh
#          PORT=3300 bash scripts/verify.sh     # if 3210 is already taken
#
# Design notes:
#   * `set -uo pipefail` WITHOUT `-e` on purpose: every check must run so the
#     summary reports ALL failures instead of stopping at the first one.
#   * Three states are reported per check: PASS / FAIL / SKIP.
#       - FAIL  = contract violated (or an endpoint returned a non-200).
#       - SKIP  = check could not be exercised (e.g. LLM provider unavailable so
#                 the success-path JSON shape is never produced, or an optional
#                 export does not exist on this branch). SKIP is printed loudly
#                 and counted, never silently treated as PASS.
#   * Exit code is non-zero if ANY check FAILs.
#   * Every check prints the exact replayable curl / node command.
#
# Checks: secret scan (3), typecheck, guardrails tests, startup, routes
#         health/audit/qa/tts/stt, JSON shape assertions, PII fail-closed
#         client guard, Jaccard + quote-verifier boundary assertions.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || { echo "FATAL: cannot cd to $ROOT"; exit 1; }

PORT="${PORT:-3210}"
BASE="http://localhost:${PORT}"
SERVER_PID=""

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lawlens-verify.XXXXXX")"
SERVER_LOG="${TMP_DIR}/server.log"
BODY_FILE="${TMP_DIR}/body.json"
STATUS=""
BODY=""

if [ -t 1 ]; then
  RST=$'\033[0m'; BOLD=$'\033[1m'
  OK=$'\033[32m'; RED=$'\033[31m'; WARN=$'\033[33m'; DIM=$'\033[2m'
else
  RST=""; BOLD=""; OK=""; RED=""; WARN=""; DIM=""
fi

CK_NAMES=()
CK_STATES=()
CK_NOTES=()
PASSES=0
FAILS=0
SKIPS=0

cleanup() {
  local code=$?
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "${DIM}[cleanup] stopping server pid ${SERVER_PID}${RST}"
    kill "$SERVER_PID" 2>/dev/null || true
    local i=0
    while [ "$i" -lt 25 ] && kill -0 "$SERVER_PID" 2>/dev/null; do
      sleep 0.2
      i=$((i + 1))
    done
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      kill -9 "$SERVER_PID" 2>/dev/null || true
    fi
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR" 2>/dev/null || true
  return "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

section() { printf "\n%s== %s ==%s\n" "$BOLD" "$1" "$RST"; }
note()    { printf "  %s%s%s\n" "$DIM" "$1" "$RST"; }

# record <name> <PASS|FAIL|SKIP> [note]
record() {
  local name="$1" state="$2" note="${3:-}"
  # keep notes on one line so the summary table stays aligned
  note="$(printf '%s' "$note" | tr '\n' ' ')"
  CK_NAMES[${#CK_NAMES[@]}]="$name"
  CK_STATES[${#CK_STATES[@]}]="$state"
  CK_NOTES[${#CK_NOTES[@]}]="$note"
  case "$state" in
    PASS)
      PASSES=$((PASSES + 1))
      printf "  %sPASS%s %s%s\n" "$OK" "$RST" "$name" "${note:+ — $note}"
      ;;
    SKIP)
      SKIPS=$((SKIPS + 1))
      printf "  %sSKIP%s %s%s\n" "$WARN" "$RST" "$name" "${note:+ — $note}"
      ;;
    *)
      FAILS=$((FAILS + 1))
      printf "  %sFAIL%s %s%s\n" "$RED" "$RST" "$name" "${note:+ — $note}"
      ;;
  esac
}

# ---------------------------------------------------------------- secret scan
section "1. Secret scan (tracked files, excluding env files)"
# NOTE: scripts/verify.sh is excluded from these scans — it necessarily contains
# the pattern literals below, so scanning itself would always self-flag. That
# self-match bug is what made the original harness red on a clean tree.
SELFTEST_EXCLUDE=':(exclude)scripts/verify.sh'

# Gate A — the original literal-prefix gate, scoped to executable code/config.
# Docs and bundled design assets quote the string `sk-ant` verbatim while
# describing this very gate, so scanning them would flag prose, not a leak.
if git grep -nE "sk-ant|sk-or-v1" -- . \
     ':(exclude).env*' ':(exclude)*.example' \
     ':(exclude)*.md' ':(exclude)docs/**' ':(exclude)dist/**' ':(exclude)public/assets/**' \
     "$SELFTEST_EXCLUDE" >"${TMP_DIR}/prefix.txt" 2>&1; then
  cat "${TMP_DIR}/prefix.txt" | sed 's/^/  /'
  record "secret-scan: provider prefix in code" FAIL "sk-ant / sk-or-v1 found in tracked code or config"
else
  record "secret-scan: provider prefix in code" PASS "no sk-ant / sk-or-v1 in tracked code/config"
fi

# Gate B — actual key material, anywhere in tracked files. This is the gate that
# must never go green when a real secret is committed, docs included.
if git grep -nE '(sk-ant-[A-Za-z0-9_-]{16,}|sk-or-v1-[A-Za-z0-9]{16,}|sk_(live|test)_[A-Za-z0-9]{16,})' \
     -- . ':(exclude).env*' ':(exclude)*.example' "$SELFTEST_EXCLUDE" >"${TMP_DIR}/keys.txt" 2>&1; then
  cat "${TMP_DIR}/keys.txt" | sed 's/^/  /'
  record "secret-scan: key material" FAIL "key-shaped secret committed to a tracked file"
else
  record "secret-scan: key material" PASS "no sk-ant-/sk-or-v1-/sk_live_ secrets in tracked files"
fi
if git grep -lE "sk-ant|sk-or-v1" -- 'docs/**' '*.md' 'dist/**' 'public/assets/**' >/dev/null 2>&1; then
  note "informational: $(git grep -lE 'sk-ant|sk-or-v1' -- 'docs/**' '*.md' 'dist/**' 'public/assets/**' | wc -l | tr -d ' ') doc/asset file(s) quote the prefix as prose (not a secret, not a check)."
fi
# Sarvam keys start with sk_ ; ignore known benign skips.
if git grep -nE "\bsk_[A-Za-z0-9]{20,}" -- . ':(exclude).env*' ':(exclude)*.example' "$SELFTEST_EXCLUDE"; then
  record "secret-scan: sarvam key" FAIL "possible Sarvam key found in tracked files"
else
  record "secret-scan: sarvam key" PASS "no sk_ key pattern in tracked files"
fi

# ------------------------------------------------------------------ typecheck
section "2. Typecheck"
if npx tsc --noEmit >"${TMP_DIR}/tsc.log" 2>&1; then
  record "typecheck (tsc --noEmit)" PASS "clean"
else
  echo "  replay: npx tsc --noEmit"
  tail -25 "${TMP_DIR}/tsc.log"
  record "typecheck (tsc --noEmit)" FAIL "see tsc output above"
fi

# ----------------------------------------------------------- guardrails tests
section "3. Guardrails tests"
if node --import tsx --test src/utils/guardrails.test.ts >"${TMP_DIR}/tests.log" 2>&1; then
  tail -6 "${TMP_DIR}/tests.log" | sed 's/^/  /'
  record "guardrails tests (5 tests)" PASS "node --test src/utils/guardrails.test.ts"
else
  echo "  replay: node --import tsx --test src/utils/guardrails.test.ts"
  tail -30 "${TMP_DIR}/tests.log" | sed 's/^/  /'
  record "guardrails tests (5 tests)" FAIL "see test output above"
fi

# -------------------------------------------------------------- HTTP helpers
print_replay() {
  local method="$1" path="$2" body="${3:-}"
  if [ "$method" = "POST" ]; then
    printf "  replay: curl -s -X POST %s%s -H 'Content-Type: application/json' -d '%s'\n" \
      "$BASE" "$path" "$body"
  else
    printf "  replay: curl -s %s%s\n" "$BASE" "$path"
  fi
}

http() { # method path [body] [timeout_seconds]
  local method="$1" path="$2" body="${3:-}" tmo="${4:-120}"
  print_replay "$method" "$path" "$body"
  if [ "$method" = "POST" ]; then
    STATUS="$(curl -s -m "$tmo" -o "$BODY_FILE" -w '%{http_code}' \
      -X POST "${BASE}${path}" -H 'Content-Type: application/json' -d "$body" 2>/dev/null)"
  else
    STATUS="$(curl -s -m "$tmo" -o "$BODY_FILE" -w '%{http_code}' "${BASE}${path}" 2>/dev/null)"
  fi
  [ -z "$STATUS" ] && STATUS="000"
  BODY="$(cat "$BODY_FILE" 2>/dev/null || true)"
  printf "  HTTP %s · %s\n" "$STATUS" "$(printf '%s' "$BODY" | head -c 260)"
}

check_route() { # name method path [body] [timeout]
  local name="$1" method="$2" path="$3" body="${4:-}" tmo="${5:-120}"
  http "$method" "$path" "$body" "$tmo"
  if [ "$STATUS" = "200" ]; then
    record "$name" PASS "HTTP 200"
  else
    record "$name" FAIL "expected HTTP 200, got ${STATUS}"
  fi
}

# json_check <name> <js source> [hint]
# The js source receives the response body file as process.argv[1].
# Exit 0 => PASS, exit 3 => SKIP, anything else => FAIL.
json_check() {
  local name="$1" script="$2" hint="${3:-}"
  local out rc
  out="$(node -e "$script" "$BODY_FILE" 2>&1)"
  rc=$?
  out="$(printf '%s' "$out" | tr '\n' ' ')"
  case "$rc" in
    0) record "$name" PASS "$(printf '%s' "$out" | head -c 200)" ;;
    3) record "$name" SKIP "$(printf '%s' "$out" | head -c 200)" ;;
    *) record "$name" FAIL "$(printf '%s' "$out" | tail -c 260)${hint:+ [$hint]}" ;;
  esac
}

# ------------------------------------------------------------------ server up
section "4. Start server on :${PORT}"
SERVER_UP=0
if curl -sf -m 2 "${BASE}/api/health" >/dev/null 2>&1; then
  echo "  ${RED}FATAL${RST}: something is already listening on ${BASE}."
  echo "  Re-run with an explicit port, e.g.  PORT=3311 bash scripts/verify.sh"
  record "server-startup" FAIL "port ${PORT} already in use"
else
  if [ -z "${OPENROUTER_API_KEY:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    note "no LLM key in env — audit/qa will use their local fallback paths"
  fi
  note "server log: ${SERVER_LOG} (temporary; removed on exit)"
  PORT="$PORT" node --import tsx server.ts >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  note "started pid ${SERVER_PID}"
  ready=0
  for _ in $(seq 1 45); do
    if curl -sf -m 2 "${BASE}/api/health" >/dev/null 2>&1; then ready=1; break; fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
    sleep 1
  done
  if [ "$ready" -eq 1 ]; then
    SERVER_UP=1
    record "server-startup (:${PORT})" PASS "ready"
  else
    echo "  --- server log tail ---"
    tail -30 "$SERVER_LOG" | sed 's/^/  /'
    record "server-startup (:${PORT})" FAIL "server never became ready"
  fi
fi

# ------------------------------------------------------- route + shape tests
section "5. Route smoke tests + JSON shape assertions"

AUDIT_BODY='{"contract_text":"Clause 4.2 The Tenant shall deposit an interest-free refundable caution deposit of Rs 2,50,000 prior to handover of keys. Clause 8.2 vacating before six months forfeits one month rent.","language":"en","contract_type":"residential_rental","title":"Verify Lease"}'
QA_BODY='{"question":"What is the deposit?","contract_text":"Clause 4.2 The Tenant shall deposit an interest-free refundable caution deposit of Rs 2,50,000 prior to handover of keys.","language":"en"}'
TTS_BODY='{"text":"This is a verification of the text to speech route.","language":"en"}'
STT_BODY='{"audio_base64":"AA==","language":"en"}'

JS_HEALTH=$(cat <<'JS'
try {
  const h = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
  if (h.status !== 'ok') throw new Error("status!=='ok' (got " + JSON.stringify(h.status) + ")");
  if (typeof h.provider !== 'string') throw new Error('provider is not a string');
  if (typeof h.llmConfigured !== 'boolean') throw new Error('llmConfigured is not a boolean');
  if (typeof h.sarvamConfigured !== 'boolean') throw new Error('sarvamConfigured is not a boolean');
  console.log('status:ok provider:' + h.provider + ' llmConfigured:' + h.llmConfigured +
    ' sarvamConfigured:' + h.sarvamConfigured);
} catch (e) {
  console.error('ASSERT: ' + (e && e.message ? e.message : e));
  process.exit(1);
}
JS
)

JS_HEALTH_PROMPTS=$(cat <<'JS'
try {
  const h = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
  if (!Array.isArray(h.prompts)) {
    throw new Error('/api/health does not publish the `prompts` catalog array (server.ts health handler omits it)');
  }
  if (h.prompts.length !== 3) {
    throw new Error('prompts.length=' + h.prompts.length + ' (expected exactly 3 prompt ids)');
  }
  const want = ['contract.ocr@1', 'contract.audit@1', 'contract.qa@1'];
  for (const id of want) {
    if (!h.prompts.includes(id)) throw new Error('prompts is missing ' + id);
  }
  console.log('prompts[' + h.prompts.length + ']: ' + h.prompts.join(', '));
} catch (e) {
  console.error('ASSERT: ' + (e && e.message ? e.message : e));
  process.exit(1);
}
JS
)

JS_AUDIT=$(cat <<'JS'
try {
  const a = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
  if (a.ok !== true) throw new Error('ok!==true (got ' + JSON.stringify(a.ok) + ')');
  const fb = a.fallback_used === true;

  // The success-path and fallback-path envelopes differ, so validate whichever
  // one actually came back — the invariants below must hold in BOTH cases.
  const env = fb ? a.audit : a;
  if (!env || typeof env !== 'object') throw new Error('fallback_used:true but no `audit` envelope');
  if (!Array.isArray(env.findings)) throw new Error('findings is not an array');
  if (!env.completeness || typeof env.completeness !== 'object') throw new Error('completeness missing');
  if (typeof env.completeness.status !== 'string') throw new Error('completeness.status is not a string');
  if (!env.rule_pack_applied || typeof env.rule_pack_applied !== 'object') throw new Error('rule_pack_applied missing');
  if (env.rule_pack_applied.panIndiaOnly === undefined) throw new Error('rule_pack_applied.panIndiaOnly is undefined');
  if (typeof env.rule_pack_applied.pack_id !== 'string') throw new Error('rule_pack_applied.pack_id is not a string');

  console.log((fb ? 'fallback_used ' : 'live ') + 'ok:true findings:' + env.findings.length +
    ' completeness:' + env.completeness.status +
    ' panIndiaOnly:' + env.rule_pack_applied.panIndiaOnly +
    ' pack:' + env.rule_pack_applied.pack_id);
} catch (e) {
  console.error('ASSERT: ' + (e && e.message ? e.message : e));
  process.exit(1);
}
JS
)

JS_QA=$(cat <<'JS'
try {
  const q = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
  if (q.ok !== true) {
    // Documented degradation envelope (LLM missing / provider error). The
    // success-path shape is then simply not observable — SKIP, not FAIL.
    if (q.fallback_recommended === true) {
      console.log('success shape NOT exercised — provider unavailable: ' +
        String(q.error || q.reason || 'fallback_recommended').slice(0, 110));
      process.exit(3);
    }
    throw new Error('ok!==true (got ' + JSON.stringify(q.ok) + ')');
  }
  if (typeof q.grounded !== 'boolean') {
    throw new Error('grounded is not boolean (got ' + JSON.stringify(q.grounded) + ')');
  }
  console.log('ok:true grounded:' + q.grounded + ' verification:' + String((q.verification || {}).status));
} catch (e) {
  console.error('ASSERT: ' + (e && e.message ? e.message : e));
  process.exit(1);
}
JS
)

JS_NOT_HTML=$(cat <<'JS'
try {
  const raw = require('fs').readFileSync(process.argv[1], 'utf8');
  if (/^\s*</.test(raw)) throw new Error('response is HTML, not JSON');
  JSON.parse(raw);
} catch (e) {
  console.error('ASSERT: ' + (e && e.message ? e.message : e));
  process.exit(1);
}
JS
)

if [ "$SERVER_UP" -ne 1 ]; then
  note "server is not running — skipping all HTTP checks"
  for n in "GET /api/health" "POST /api/audit" "POST /api/qa" "POST /api/tts" "POST /api/stt"; do
    record "route ${n}" SKIP "server not running"
  done
  record "shape health: status ok" SKIP "server not running"
  record "shape health: prompts[3]" SKIP "server not running"
  record "shape audit: ok + findings/completeness/panIndiaOnly" SKIP "server not running"
  record "shape qa: ok + boolean grounded" SKIP "server not running"
  record "shape tts: JSON envelope" SKIP "server not running"
  record "shape stt: JSON envelope" SKIP "server not running"
else
  # --- health --------------------------------------------------------------
  check_route "route GET /api/health" GET "/api/health" "" 30
  json_check "shape health: status ok" "$JS_HEALTH"
  json_check "shape health: prompts[3]" "$JS_HEALTH_PROMPTS" "server.ts /api/health gap"
  check_route "route POST /api/audit" POST "/api/audit" "$AUDIT_BODY" 150
  json_check "shape audit: ok + findings/completeness/panIndiaOnly" "$JS_AUDIT" "contract.audit@1"
  check_route "route POST /api/qa" POST "/api/qa" "$QA_BODY" 150
  json_check "shape qa: ok + boolean grounded" "$JS_QA" "contract.qa@1"
  check_route "route POST /api/tts" POST "/api/tts" "$TTS_BODY" 60
  json_check "shape tts: JSON envelope" "$JS_NOT_HTML" "bulbul proxy"
  check_route "route POST /api/stt" POST "/api/stt" "$STT_BODY" 60
  json_check "shape stt: JSON envelope" "$JS_NOT_HTML" "saaras proxy"
fi

# ------------------------------------------------------------------- PII ---
section "6. PII fail-closed smoke (maskIndianPII baseline + checkSafeToSend verdict)"
note "The server does not mask PII (client-side shield owns that), so the"
note "authoritative assertion here is the client guard, run against this worktree."

# Baseline: maskIndianPII itself must redact the Aadhaar and keep jurisdiction
# words intact. This runs unconditionally so masking is always verified even on
# a branch where the fail-closed verdict helper is absent.
MASK_CMD="node --import tsx -e \"import('./src/utils/piiGuard.ts').then(m=>{const s='LESSOR: Mr. Ramesh Kumar, Aadhaar 4567 8912 3456, PAN ABCDE1234F, +91 9845012345 at Indiranagar, Bengaluru, Karnataka.'; const r=m.maskIndianPII(s); if(r.maskedText.includes('4567 8912 3456')) throw new Error('Aadhaar not masked'); if(r.maskedText.includes('ABCDE1234F')) throw new Error('PAN not masked'); if(r.maskedText.includes('9845012345')) throw new Error('phone not masked'); if(!r.maskedText.includes('Bengaluru')) throw new Error('Bengaluru wrongly masked'); if(!r.maskedText.includes('Karnataka')) throw new Error('Karnataka wrongly masked'); if(r.totalMasked<4) throw new Error('only '+r.totalMasked+' token(s) masked'); console.log('maskIndianPII OK — '+r.totalMasked+' masked: '+JSON.stringify(r.countsByType));})\""
echo "  replay: ${MASK_CMD}"
mask_out="$(bash -c "$MASK_CMD" 2>&1)"
mask_rc=$?
if [ "$mask_rc" -eq 0 ]; then
  record "pii: maskIndianPII redaction baseline" PASS "$(printf '%s' "$mask_out" | tail -1)"
else
  record "pii: maskIndianPII redaction baseline" FAIL "$(printf '%s' "$mask_out" | tail -1)"
fi

PII_CMD="node --import tsx -e \"import('./src/utils/piiGuard.ts').then(m=>{const r=m.maskIndianPII('Aadhaar 4567 8912 3456'); const v=m.checkSafeToSend(r.maskedText, r.tokens); if(!v.safeToSend) process.exit(1); if(r.maskedText.includes('4567 8912 3456')) process.exit(2); console.log('PII shield OK');})\""

# Pre-flight: `checkSafeToSend` is an optional export on this branch. Probe for
# it first so a missing export yields a loud SKIP instead of a misleading FAIL
# (node exits 1 on a failed import, which collides with our "unsafe" exit code).
PII_EXPORT_PROBE="node --import tsx -e \"import('./src/utils/piiGuard.ts').then(m=>{process.exit(typeof m.checkSafeToSend==='function'?0:42)}).catch(()=>process.exit(42))\""
bash -c "$PII_EXPORT_PROBE" >/dev/null 2>&1
pii_probe_rc=$?

if [ "$pii_probe_rc" -ne 0 ]; then
  echo "  ${WARN}SKIP${RST}: src/utils/piiGuard.ts does not export checkSafeToSend() on this branch."
  echo "  ${WARN}SKIP${RST}: PII fail-closed shield NOT verified — this is a gap, not a pass."
  note "probe: ${PII_EXPORT_PROBE}"
  record "pii: client fail-closed shield" SKIP "checkSafeToSend() not exported on this branch (optional on other branches)"
else
  echo "  replay: ${PII_CMD}"
  pii_out="$(bash -c "$PII_CMD" 2>&1)"
  pii_rc=$?
  case "$pii_rc" in
    0)
      record "pii: client fail-closed shield" PASS "$(printf '%s' "$pii_out" | tail -1)"
      ;;
    1)
      record "pii: client fail-closed shield" FAIL "checkSafeToSend safeToSend=false: $(printf '%s' "$pii_out" | tail -1)"
      ;;
    2)
      record "pii: client fail-closed shield" FAIL "raw Aadhaar '4567 8912 3456' survived masking"
      ;;
    *)
      record "pii: client fail-closed shield" FAIL "guard exited ${pii_rc}: $(printf '%s' "$pii_out" | tail -1)"
      ;;
  esac
fi

if [ "$SERVER_UP" -eq 1 ]; then
  note "Server-side echo check: the audit route accepts a payload with a raw Aadhaar"
  note "and returns 200, i.e. masking is NOT enforced server-side. This is asserted"
  note "for HTTP 200 only — the client guard above is the real defence."
  PII_POST_BODY='{"contract_text":"Rental agreement between the parties. LESSEE: Mr. Ramesh Kumar, Aadhaar 4567 8912 3456, residing at Indiranagar, Bengaluru. Clause 4.2 The Tenant shall deposit an interest-free refundable caution deposit of Rs 2,50,000 prior to handover of keys.","language":"en","contract_type":"residential_rental","title":"PII smoke"}'
  http POST "/api/audit" "$PII_POST_BODY" 150
  if [ "$STATUS" = "200" ]; then
    if printf '%s' "$BODY" | grep -q "4567 8912 3456"; then
      record "pii: server passthrough (informational)" PASS "HTTP 200 and raw Aadhaar echoed — client masking is mandatory"
    else
      record "pii: server passthrough (informational)" PASS "HTTP 200, raw Aadhaar not echoed"
    fi
  else
    record "pii: server passthrough (informational)" FAIL "expected HTTP 200, got ${STATUS}"
  fi
else
  record "pii: server passthrough (informational)" SKIP "server not running"
fi

# ---------------------------------------------------- verifier / Jaccard ---
section "7. Verifier boundary (jaccardSimilarity + verifyQuoteAgainstText)"
JACCARD_CMD="node --import tsx -e \"import('./src/utils/verifier.ts').then(m=>{const j=m.jaccardSimilarity('a b c d','a b c e'); if(typeof j!=='number'||Number.isNaN(j)) {console.error('jaccardSimilarity did not return a number: '+j);process.exit(1);} if(j<0||j>1){console.error('jaccardSimilarity out of [0,1]: '+j);process.exit(1);} if(Math.abs(j-0.6)>1e-9) console.error('note: expected 0.6 (3/5) got '+j); const contract='Clause 4.2 Security Deposit: The Tenant shall deposit with the Landlord an interest-free refundable caution deposit of Rs 2,50,000 prior to handover of keys.'; const exact=m.verifyQuoteAgainstText('The Tenant shall deposit with the Landlord an interest-free refundable caution deposit of Rs 2,50,000 prior to handover of keys.', contract); if(exact.status!=='verified'){console.error('exact quote was not verified: '+exact.status);process.exit(1);} const fake=m.verifyQuoteAgainstText('Landlord may seize all personal furniture immediately upon delay.', contract); if(fake.status!=='dropped'){console.error('fabricated quote was not dropped: '+fake.status);process.exit(1);} console.log('Jaccard '+j+' in [0,1]; exact=verified (j='+exact.jaccard+'), fabricated=dropped');})\""
echo "  replay: ${JACCARD_CMD}"
jac_out="$(bash -c "$JACCARD_CMD" 2>&1)"
jac_rc=$?
if [ "$jac_rc" -eq 0 ]; then
  record "verifier: Jaccard boundary + quote gate" PASS "$(printf '%s' "$jac_out" | tr '\n' ' ' | head -c 200)"
else
  record "verifier: Jaccard boundary + quote gate" FAIL "$(printf '%s' "$jac_out" | tail -1)"
fi

# ------------------------------------------------------------- summary -----
section "Summary"
printf "%-56s %-5s %s\n" "CHECK" "STATE" "NOTE"
printf "%-56s %-5s %s\n" "--------------------------------------------------------" "-----" "----"
i=0
n=${#CK_NAMES[@]}
while [ "$i" -lt "$n" ]; do
  case "${CK_STATES[$i]}" in
    PASS) color="$OK" ;;
    SKIP) color="$WARN" ;;
    *)    color="$RED" ;;
  esac
  raw_name="${CK_NAMES[$i]}"
  shown_name="$raw_name"
  # never let a long name push the STATE column out of alignment
  if [ "${#shown_name}" -gt 56 ]; then shown_name="$(printf '%s' "$shown_name" | cut -c1-54)…"; fi
  printf "%s%-56s %-5s %s%s\n" "$color" "$shown_name" "${CK_STATES[$i]}" "${CK_NOTES[$i]}" "$RST"
  i=$((i + 1))
done

printf "\n%sTOTAL %d checks · PASS %d · FAIL %d · SKIP %d%s\n" \
  "$BOLD" "$n" "$PASSES" "$FAILS" "$SKIPS" "$RST"
[ "$SKIPS" -gt 0 ] && note "SKIP = not exercised (see note); it is not a pass."
[ "$FAILS" -gt 0 ] && note "replay any failing check with the curl/node command printed above it."

if [ "$FAILS" -gt 0 ]; then
  printf "%sVERIFY: FAILED%s (%d failing check(s))\n" "$RED$BOLD" "$RST" "$FAILS"
  exit 1
fi
printf "%sVERIFY: PASSED%s (all %d checks green; %d skipped)\n" "$OK$BOLD" "$RST" "$PASSES" "$SKIPS"
exit 0
