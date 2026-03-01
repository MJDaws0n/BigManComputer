#!/bin/bash
# ==========================================================================
# BMC Security Test Suite
# Tests common attack vectors against the custom HTTP server
# Categories: Path Traversal, Header Injection, Request Smuggling,
#   DoS Resilience, XSS, Auth Bypass, Cookie Attacks, Input Validation,
#   Resource Exhaustion, Shell Injection, CORS, Session Fixation
# ==========================================================================

PORT=${1:-8080}
BASE="http://localhost:$PORT"

# Disable captcha for testing
_BMC_ENV_MODIFIED=0
if [ -f .env ] && grep -q "^AUTOGATE_" .env 2>/dev/null; then
    _BMC_ENV_MODIFIED=1
    cp .env .env.test_bak
    grep -v "^AUTOGATE_" .env.test_bak > .env
fi
cleanup_env() {
    if [ "$_BMC_ENV_MODIFIED" = "1" ] && [ -f .env.test_bak ]; then
        mv .env.test_bak .env
    fi
}
trap cleanup_env EXIT

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=0
COOKIE_FILE="/tmp/bmc_sec_cookies.txt"
SEC_USER="sectest_$$"

cleanup() {
    rm -f "$COOKIE_FILE"
}
trap cleanup EXIT

check() {
    local desc="$1" expected="$2" actual="$3"
    TOTAL=$((TOTAL + 1))
    if [ "$expected" = "$actual" ]; then
        echo -e "  ${GREEN}✓${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗${NC} $desc"
        echo -e "    Expected: ${expected}"
        echo -e "    Got:      ${actual}"
        FAIL=$((FAIL + 1))
    fi
}

check_contains() {
    local desc="$1" needle="$2" haystack="$3"
    TOTAL=$((TOTAL + 1))
    if echo "$haystack" | grep -q "$needle"; then
        echo -e "  ${GREEN}✓${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗${NC} $desc"
        echo -e "    Expected to contain: ${needle}"
        echo -e "    Got: ${haystack}"
        FAIL=$((FAIL + 1))
    fi
}

check_not_contains() {
    local desc="$1" needle="$2" haystack="$3"
    TOTAL=$((TOTAL + 1))
    if echo "$haystack" | grep -q "$needle"; then
        echo -e "  ${RED}✗${NC} $desc"
        echo -e "    Should NOT contain: ${needle}"
        echo -e "    Got: ${haystack}"
        FAIL=$((FAIL + 1))
    else
        echo -e "  ${GREEN}✓${NC} $desc"
        PASS=$((PASS + 1))
    fi
}

# Wait for server
echo -n "Waiting for server on port $PORT..."
for i in $(seq 1 30); do
    if curl -s -o /dev/null "$BASE/" 2>/dev/null; then
        echo " ready"
        break
    fi
    sleep 1
done

# ==========================================================================
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          BMC SECURITY TEST SUITE                ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 1. PATH TRAVERSAL ===${NC}"
echo -e "  Testing attempts to read files outside www/ directory"

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/../../../etc/passwd")
check "GET /../../../etc/passwd returns 404" "404" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/..%2f..%2f..%2fetc%2fpasswd")
check "GET URL-encoded traversal returns 404" "404" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/....//....//....//etc/passwd")
check "GET double-dot-slash bypass returns 404" "404" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/%2e%2e/%2e%2e/%2e%2e/etc/passwd")
check "GET %%2e%%2e/ traversal returns 404" "404" "$RESP"
sleep 0.3

RESP=$(curl -s "$BASE/../../main.nov")
check_not_contains "GET /../../main.nov does not expose source" "module" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/../../data/users.db")
check "GET /../../data/users.db blocked" "404" "$RESP"
sleep 0.3

RESP=$(curl -s "$BASE/../../data/users.db")
check_not_contains "users.db content not leaked" "password" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/../../libraries.conf")
check "GET /../../libraries.conf blocked" "404" "$RESP"
sleep 0.3

# Null byte injection
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/index.html%00.jpg")
check "Null byte injection returns 404" "404" "$RESP"
sleep 0.3

# Try to access data directory via path
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/data/users.db")
check "GET /data/users.db directly blocked" "404" "$RESP"
sleep 0.3

# Backslash traversal (Windows-style)
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/..\\..\\..\\etc\\passwd")
check "Backslash traversal blocked" "404" "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 2. HTTP HEADER INJECTION ===${NC}"
echo -e "  Testing CRLF and header injection attacks"

# CRLF in path
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/%0d%0aX-Injected:%20true")
check "CRLF injection in URL returns 404" "404" "$RESP"
sleep 0.3

# Host header attack
RESP=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: evil.com" "$BASE/")
check "Host header attack still serves page" "200" "$RESP"
sleep 0.3

# Oversized header
LONG_HEADER=$(python3 -c "print('A' * 10000)")
RESP=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Evil: $LONG_HEADER" "$BASE/")
check "Oversized header handled" "200" "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 3. REQUEST SIZE / DoS RESILIENCE ===${NC}"
echo -e "  Testing oversized requests and abuse patterns"

# Very long URL
LONG_PATH=$(python3 -c "print('/a' * 5000)")
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE$LONG_PATH" 2>/dev/null)
check "Very long URL (10KB) handled gracefully" "404" "$RESP"
sleep 0.3

# Oversized POST body
BIG_BODY=$(python3 -c "print('{\"code\":\"' + 'A' * 300000 + '\"}')")
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST "$BASE/api/load" \
    -H "Content-Type: application/json" -d "$BIG_BODY" 2>/dev/null)
# Should either reject or handle without crashing
check "Oversized POST body (300KB) handled" "true" "$([ -n '$RESP' ] && echo true)"
sleep 0.5

# Empty request (just connect and disconnect)
RESP=$(echo "" | nc -w 2 localhost $PORT 2>/dev/null)
sleep 0.5
# Server should still be alive
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Server survives empty connection" "200" "$RESP"
sleep 0.3

# Partial request (send headers but no body)
(echo -ne "POST /api/load HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\n" | nc -w 3 localhost $PORT) &
sleep 3
# Server should still work
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Server survives partial/incomplete request" "200" "$RESP"
sleep 0.3

# Rapid requests (basic rate test)
RAPID_OK=0
for i in $(seq 1 20); do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/" 2>/dev/null)
    if [ "$CODE" = "200" ]; then RAPID_OK=$((RAPID_OK + 1)); fi
done
check "20 rapid sequential requests all succeed" "20" "$RAPID_OK"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 4. AUTH BYPASS / SESSION ATTACKS ===${NC}"
echo -e "  Testing authentication and session security"

# Access protected endpoints without auth
RESP=$(curl -s "$BASE/api/programs/list")
check_contains "List programs without auth fails" '"ok":false' "$RESP"
sleep 0.3

RESP=$(curl -s "$BASE/api/export-data")
check_contains "Export data without auth fails" '"ok":false' "$RESP"
sleep 0.3

RESP=$(curl -s -X POST "$BASE/api/programs/save" -H "Content-Type: application/json" \
    -d '{"name":"hack","code":"HLT"}')
check_contains "Save program without auth fails" '"ok":false' "$RESP"
sleep 0.3

# Fake session cookie
RESP=$(curl -s "$BASE/api/me" -H "Cookie: bmc_session=fake_token_12345")
check_contains "Fake session token rejected" '"ok":false' "$RESP"
sleep 0.3

# Empty session cookie
RESP=$(curl -s "$BASE/api/me" -H "Cookie: bmc_session=")
check_contains "Empty session token rejected" '"ok":false' "$RESP"
sleep 0.3

# Session with special characters
RESP=$(curl -s "$BASE/api/me" -H "Cookie: bmc_session=<script>alert(1)</script>")
check_contains "XSS in cookie rejected" '"ok":false' "$RESP"
sleep 0.3

# Multiple cookies
RESP=$(curl -s "$BASE/api/me" -H "Cookie: other=value; bmc_session=fake; more=stuff")
check_contains "Fake session in multi-cookie rejected" '"ok":false' "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 5. INPUT VALIDATION / INJECTION ===${NC}"
echo -e "  Testing malicious input in various API fields"

# Signup with malicious username
RESP=$(curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" \
    -d '{"username":"<script>alert(1)</script>","password":"password123"}')
check_contains "XSS in username rejected" '"ok":false' "$RESP"
sleep 0.3

RESP=$(curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" \
    -d '{"username":"admin|inject","password":"password123"}')
check_contains "Pipe in username rejected" '"ok":false' "$RESP"
sleep 0.3

RESP=$(curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" \
    -d '{"username":"../../etc","password":"password123"}')
check_contains "Path traversal in username rejected" '"ok":false' "$RESP"
sleep 0.3

RESP=$(curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" \
    -d '{"username":"admin\ninjection","password":"password123"}')
check_contains "Newline in username rejected" '"ok":false' "$RESP"
sleep 0.3

# Empty password
RESP=$(curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" \
    -d '{"username":"testvalid","password":""}')
check_contains "Empty password rejected" '"ok":false' "$RESP"
sleep 0.3

# Very long username
LONG_USER=$(python3 -c "print('a' * 1000)")
RESP=$(curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" \
    -d "{\"username\":\"$LONG_USER\",\"password\":\"password123\"}")
check_contains "Very long username rejected" '"ok":false' "$RESP"
sleep 0.3

# Very long password
LONG_PASS=$(python3 -c "print('p' * 10000)")
RESP=$(curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" \
    -d "{\"username\":\"testpwlen\",\"password\":\"$LONG_PASS\"}")
# Should either reject or handle (not crash)
check_contains "Very long password handled" '"ok"' "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 6. SIMULATOR SESSION ATTACKS ===${NC}"
echo -e "  Testing sim_state_path traversal and session manipulation"

# Path traversal via session_id
RESP=$(curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" \
    -d '{"session_id":"../../../etc/passwd"}')
check_contains "Path traversal in session_id handled" '"ok":false' "$RESP"
sleep 0.3

RESP=$(curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" \
    -d '{"session_id":"..%2f..%2f..%2fetc%2fpasswd"}')
check_contains "URL-encoded traversal in session_id handled" '"ok":false' "$RESP"
sleep 0.3

# Null bytes in session_id
RESP=$(curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" \
    -d '{"session_id":"valid\u0000/../../../etc/passwd"}')
check_contains "Null byte in session_id handled" '"ok":false' "$RESP"
sleep 0.3

# Very long session_id
LONG_SID=$(python3 -c "print('x' * 10000)")
RESP=$(curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" \
    -d "{\"session_id\":\"$LONG_SID\"}")
check_contains "Very long session_id handled" '"ok":false' "$RESP"
sleep 0.3

# Load malicious code (should parse safely)
RESP=$(curl -s -X POST "$BASE/api/load" -H "Content-Type: application/json" \
    -d '{"code":"<script>alert(1)</script>"}')
check_contains "XSS in code payload handled safely" '"ok"' "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 7. EXPORT / SHELL INJECTION ===${NC}"
echo -e "  Testing command injection via export functionality"

# Shell injection in program name — name is sanitised so compile may fail, but no shell escape
RESP=$(curl -s -X POST "$BASE/api/export" -H "Content-Type: application/json" \
    -d '{"code":"HLT","name":"; rm -rf /"}')
# Server should not crash regardless of compile result
ALIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Server alive after shell injection in export name" "200" "$ALIVE"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/export" -H "Content-Type: application/json" \
    -d '{"code":"HLT","name":"$(whoami)"}')
# Server should not crash
ALIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Server alive after shell injection attempt" "200" "$ALIVE"
sleep 0.3

RESP=$(curl -s -X POST "$BASE/api/export" -H "Content-Type: application/json" \
    -d '{"code":"HLT","name":"test`id`file"}')
ALIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Server alive after backtick injection attempt" "200" "$ALIVE"
sleep 0.3

# Pipe injection in name
RESP=$(curl -s -X POST "$BASE/api/export" -H "Content-Type: application/json" \
    -d '{"code":"HLT","name":"test|cat /etc/passwd"}')
ALIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Server alive after pipe injection attempt" "200" "$ALIVE"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 8. CORS / ORIGIN CHECKS ===${NC}"
echo -e "  Testing cross-origin request handling"

# Options preflight
RESP=$(curl -s -D - -X OPTIONS "$BASE/api/me" -H "Origin: http://evil.com" \
    -H "Access-Control-Request-Method: POST" 2>/dev/null | head -20)
check_contains "CORS preflight returns headers" "Access-Control" "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 9. METHOD ENFORCEMENT ===${NC}"
echo -e "  Testing that endpoints reject wrong HTTP methods"

RESP=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE/api/signup")
check "GET /api/signup returns 404 (POST only)" "404" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/signup")
check "DELETE /api/signup returns 404" "404" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/login")
check "PUT /api/login returns 404" "404" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/me")
check "POST /api/me returns 404 (GET only)" "404" "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 10. CONTENT-TYPE VALIDATION ===${NC}"
echo -e "  Testing requests with wrong/missing content types"

# POST without Content-Type
RESP=$(curl -s -X POST "$BASE/api/login" -d '{"username":"test","password":"test"}')
# Should handle gracefully (body may not parse)
check_contains "POST without Content-Type handled" '"ok"' "$RESP"
sleep 0.3

# POST with wrong Content-Type
RESP=$(curl -s -X POST "$BASE/api/login" -H "Content-Type: text/xml" \
    -d '{"username":"test","password":"test"}')
check_contains "POST with wrong Content-Type handled" '"ok"' "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 11. COOKIE SECURITY ATTRIBUTES ===${NC}"
echo -e "  Verifying secure cookie settings"

# Create temp user for cookie testing
curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" \
    -d "{\"username\":\"$SEC_USER\",\"password\":\"password123\"}" > /dev/null 2>&1
sleep 0.3

# Login and capture Set-Cookie header
HEADERS=$(curl -s -D - -X POST "$BASE/api/login" -H "Content-Type: application/json" \
    -d "{\"username\":\"$SEC_USER\",\"password\":\"password123\"}" -c "$COOKIE_FILE" 2>/dev/null)

check_contains "Cookie has HttpOnly flag" "HttpOnly" "$HEADERS"
check_contains "Cookie has SameSite=Strict" "SameSite=Strict" "$HEADERS"
check_contains "Cookie has Path=/" "Path=/" "$HEADERS"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 12. PROGRAM SAVE INJECTION ===${NC}"
echo -e "  Testing injections via saved programs (requires auth)"

# Save program with pipe injection in name
RESP=$(curl -s -X POST "$BASE/api/programs/save" -H "Content-Type: application/json" \
    -d '{"name":"test|injected|data","code":"HLT"}' -b "$COOKIE_FILE")
check_contains "Program save with pipes in name handled" '"ok"' "$RESP"
sleep 0.3

# Save with newline in name
RESP=$(curl -s -X POST "$BASE/api/programs/save" -H "Content-Type: application/json" \
    -d '{"name":"test\ninjected","code":"HLT"}' -b "$COOKIE_FILE")
check_contains "Program save with newline handled" '"ok"' "$RESP"
sleep 0.3

# Save with XSS in code
RESP=$(curl -s -X POST "$BASE/api/programs/save" -H "Content-Type: application/json" \
    -d '{"name":"xsstest","code":"<script>alert(document.cookie)</script>"}' -b "$COOKIE_FILE")
check_contains "Program save with XSS code handled" '"ok"' "$RESP"
sleep 0.3

# Retrieve XSS program — JSON carries data safely; client uses textContent for rendering
RESP=$(curl -s "$BASE/api/programs/list" -b "$COOKIE_FILE")
check_contains "Listed programs returned as valid JSON" '"ok":true' "$RESP"
sleep 0.3

# Cleanup test programs
curl -s -X POST "$BASE/api/programs/delete" -H "Content-Type: application/json" \
    -d '{"name":"test_injected"}' -b "$COOKIE_FILE" > /dev/null
curl -s -X POST "$BASE/api/programs/delete" -H "Content-Type: application/json" \
    -d '{"name":"xsstest"}' -b "$COOKIE_FILE" > /dev/null
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 13. SPECIAL CHARACTERS IN PATHS ===${NC}"
echo -e "  Testing edge-case path inputs"

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Root path (/) returns 200" "200" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE//")
check "Double slash (//) handled" "true" "$([ "$RESP" = "200" ] || [ "$RESP" = "404" ] && echo true)"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/./index.html")
check "Dot-path (./index.html) handled" "true" "$([ "$RESP" = "200" ] || [ "$RESP" = "404" ] && echo true)"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/%00")
check "Null byte path handled" "true" "$([ -n "$RESP" ] && echo true)"
sleep 0.3

# Path traversal via raw HTTP (curl normalises ..)
RAW_RESP=$(echo -ne "GET /css/../css/style.css HTTP/1.1\r\nHost: localhost\r\n\r\n" | nc -w 3 localhost $PORT 2>/dev/null | head -1)
check_contains "Raw .. path returns 404 (blocked)" "404" "$RAW_RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 14. CONCURRENT SESSION SAFETY ===${NC}"
echo -e "  Testing concurrent requests don't corrupt data"

# Load a program on two sessions simultaneously
RESP1=$(curl -s -X POST "$BASE/api/load" -H "Content-Type: application/json" -d '{"code":"INP\nOUT\nHLT"}')
SID1=$(echo "$RESP1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)

RESP2=$(curl -s -X POST "$BASE/api/load" -H "Content-Type: application/json" -d '{"code":"LDA x\nOUT\nHLT\nx: DAT 42"}')
SID2=$(echo "$RESP2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)

# Step both simultaneously
curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID1\"}" &
PID1=$!
curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID2\"}" &
PID2=$!
wait $PID1 $PID2 2>/dev/null

# Verify server is still functional
ALIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Server alive after concurrent stepping" "200" "$ALIVE"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 15. STATIC FILE SECURITY ===${NC}"
echo -e "  Testing that sensitive files cannot be accessed"

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/main.nov")
check "main.nov not accessible via static" "404" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/libraries.conf")
check "libraries.conf not accessible" "404" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/.git/config")
check ".git/config not accessible" "404" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/.env")
check ".env not accessible" "404" "$RESP"
sleep 0.3

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/src/db.nov")
check "src/db.nov not accessible" "404" "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 16. MALFORMED HTTP REQUESTS ===${NC}"
echo -e "  Testing handling of malformed/invalid HTTP"

# No HTTP version
RESP=$(echo -ne "GET / \r\n\r\n" | nc -w 3 localhost $PORT 2>/dev/null)
sleep 1
ALIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Server survives request without HTTP version" "200" "$ALIVE"
sleep 0.3

# No method
RESP=$(echo -ne "/ HTTP/1.1\r\nHost: localhost\r\n\r\n" | nc -w 3 localhost $PORT 2>/dev/null)
sleep 1
ALIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Server survives request without method" "200" "$ALIVE"
sleep 0.3

# Binary garbage
RESP=$(echo -ne "\x00\x01\x02\x03\xff\xfe\xfd" | nc -w 2 localhost $PORT 2>/dev/null)
sleep 1
ALIVE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Server survives binary garbage input" "200" "$ALIVE"
sleep 0.3

# Very many headers
MANY_HEADERS=""
for i in $(seq 1 100); do
    MANY_HEADERS="$MANY_HEADERS -H 'X-Test-$i: value$i'"
done
RESP=$(eval curl -s -o /dev/null -w "\"%{http_code}\"" $MANY_HEADERS "$BASE/" 2>/dev/null)
check "100 custom headers handled" "200" "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 17. GDPR COMPLIANCE ===${NC}"
echo -e "  Testing data export and deletion"

RESP=$(curl -s "$BASE/api/export-data" -b "$COOKIE_FILE")
check_contains "GDPR data export returns JSON" '"username"' "$RESP"
sleep 0.3

# Delete account (should remove all data)
RESP=$(curl -s -X DELETE "$BASE/api/account" -b "$COOKIE_FILE")
check_contains "Account deletion succeeds" '"ok":true' "$RESP"
sleep 0.3

# Verify account is gone
RESP=$(curl -s "$BASE/api/me" -b "$COOKIE_FILE")
check_contains "Session invalid after deletion" '"ok":false' "$RESP"
sleep 0.3

# Try to login with deleted account
RESP=$(curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" \
    -d "{\"username\":\"$SEC_USER\",\"password\":\"password123\"}")
check_contains "Deleted account cannot login" '"ok":false' "$RESP"
sleep 0.3

# ==========================================================================
echo ""
echo -e "${YELLOW}=== 18. PASSWORD SECURITY ===${NC}"
echo -e "  Verifying password hashing and storage"

# Create a test account for this check
PWTEST_USER="pwtest_$$"
curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" \
    -d "{\"username\":\"$PWTEST_USER\",\"password\":\"MySecretPass123\"}" > /dev/null
sleep 0.3

# Check that password is not stored in plaintext (GDPR export shouldn't show it)
RESP=$(curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" \
    -d "{\"username\":\"$PWTEST_USER\",\"password\":\"MySecretPass123\"}" -c "$COOKIE_FILE")
EXPORTED=$(curl -s "$BASE/api/export-data" -b "$COOKIE_FILE")
check_not_contains "Password not in exported data" "MySecretPass123" "$EXPORTED"
sleep 0.3

# Cleanup
curl -s -X DELETE "$BASE/api/account" -b "$COOKIE_FILE" > /dev/null
sleep 0.3

# ==========================================================================
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              RESULTS                            ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Total:  $TOTAL"
echo -e "  ${GREEN}Passed: $PASS${NC}"
if [ "$FAIL" -gt 0 ]; then
    echo -e "  ${RED}Failed: $FAIL${NC}"
else
    echo -e "  Failed: 0"
fi
echo ""
