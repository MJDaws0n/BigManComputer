#!/bin/bash
# BMC Test Suite
# Tests the Big Man Computer server endpoints
# Usage: ./tests/test_all.sh [port]

PORT=${1:-8080}
BASE="http://localhost:$PORT"
PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
    TOTAL=$((TOTAL+1))
    local name="$1"
    local expected="$2"
    local actual="$3"
    if [ "$actual" = "$expected" ]; then
        echo -e "  ${GREEN}✓${NC} $name"
        PASS=$((PASS+1))
    else
        echo -e "  ${RED}✗${NC} $name"
        echo -e "    Expected: $expected"
        echo -e "    Got:      $actual"
        FAIL=$((FAIL+1))
    fi
}

check_contains() {
    TOTAL=$((TOTAL+1))
    local name="$1"
    local expected="$2"
    local actual="$3"
    if echo "$actual" | grep -q "$expected"; then
        echo -e "  ${GREEN}✓${NC} $name"
        PASS=$((PASS+1))
    else
        echo -e "  ${RED}✗${NC} $name"
        echo -e "    Expected to contain: $expected"
        echo -e "    Got: $actual"
        FAIL=$((FAIL+1))
    fi
}

# Wait for server
echo -e "${YELLOW}Waiting for server on port $PORT...${NC}"
for i in $(seq 1 10); do
    if curl -s "$BASE/" > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

echo ""
echo -e "${YELLOW}=== Static Pages ===${NC}"

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "GET / returns 200" "200" "$RESP"
sleep 0.5

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/editor")
check "GET /editor returns 200" "200" "$RESP"
sleep 0.5

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/help")
check "GET /help returns 200" "200" "$RESP"
sleep 0.5

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/credits")
check "GET /credits returns 200" "200" "$RESP"
sleep 0.5

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/privacy")
check "GET /privacy returns 200" "200" "$RESP"
sleep 0.5

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/login")
check "GET /login returns 200" "200" "$RESP"
sleep 0.5

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/signup")
check "GET /signup returns 200" "200" "$RESP"
sleep 0.5

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/css/style.css")
check "GET /css/style.css returns 200" "200" "$RESP"
sleep 0.5

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/js/app.js")
check "GET /js/app.js returns 200" "200" "$RESP"
sleep 0.5

RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/nonexistent")
check "GET /nonexistent returns 404" "404" "$RESP"
sleep 0.5

echo ""
echo -e "${YELLOW}=== Auth API ===${NC}"

# Use a unique test username to avoid conflict with real user data
TEST_USER="testuser_$$"

RESP=$(curl -s "$BASE/api/me")
check_contains "GET /api/me (no auth) returns ok:false" '"ok":false' "$RESP"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" -d '{"username":"ab","password":"short"}')
check_contains "Signup with short username fails" '"ok":false' "$RESP"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" -d "{\"username\":\"$TEST_USER\",\"password\":\"password123\"}")
check_contains "Signup with valid credentials succeeds" '"ok":true' "$RESP"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/signup" -H "Content-Type: application/json" -d "{\"username\":\"$TEST_USER\",\"password\":\"password123\"}")
check_contains "Duplicate signup fails" '"ok":false' "$RESP"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" -d "{\"username\":\"$TEST_USER\",\"password\":\"wrongpass\"}")
check_contains "Login with wrong password fails" '"ok":false' "$RESP"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" -d "{\"username\":\"$TEST_USER\",\"password\":\"password123\"}" -c /tmp/bmc_test_cookies.txt)
check_contains "Login with correct password succeeds" '"ok":true' "$RESP"
sleep 0.5

RESP=$(curl -s "$BASE/api/me" -b /tmp/bmc_test_cookies.txt)
check_contains "GET /api/me (authed) returns username" "\"username\":\"$TEST_USER\"" "$RESP"
sleep 0.5

echo ""
echo -e "${YELLOW}=== Simulator API ===${NC}"

# Test: Add two numbers (42 + 8 = 50)
RESP=$(curl -s -X POST "$BASE/api/load" -H "Content-Type: application/json" -d '{"code":"INP\nSTA 99\nINP\nADD 99\nOUT\nHLT"}')
check_contains "Load program succeeds" '"ok":true' "$RESP"
SID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
check "Session ID not empty" "true" "$([ -n '$SID' ] && echo true || echo false)"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID\"}")
check_contains "Step 1 (INP) waits for input" '"waiting_input":true' "$RESP"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/input" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID\",\"value\":\"42\"}")
check_contains "Input 42 accepted" '"ok":true' "$RESP"
ACC=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['state']['acc'])" 2>/dev/null)
check "ACC is 42 after input" "42" "$ACC"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID\"}")
MEM99=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['state']['memory'][99])" 2>/dev/null)
check "Memory[99] is 42 after STA" "42" "$MEM99"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID\"}")
check_contains "Step 3 (INP) waits for input" '"waiting_input":true' "$RESP"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/input" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID\",\"value\":\"8\"}")
ACC=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['state']['acc'])" 2>/dev/null)
check "ACC is 8 after second input" "8" "$ACC"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID\"}")
ACC=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['state']['acc'])" 2>/dev/null)
check "ACC is 50 after ADD 99" "50" "$ACC"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID\"}")
check_contains "OUT produces output 50" '"output":"50"' "$RESP"
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/step" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID\"}")
check_contains "HLT halts the program" '"halted":true' "$RESP"
sleep 0.5

# Test: Countdown program (3, 2, 1, 0)
RESP=$(curl -s -X POST "$BASE/api/load" -H "Content-Type: application/json" -d '{"code":"LDA count\nloop: OUT\nSUB one\nSTA count\nBRP loop\nHLT\ncount: DAT 3\none: DAT 1"}')
check_contains "Load countdown program" '"ok":true' "$RESP"
SID2=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
sleep 0.5

RESP=$(curl -s -X POST "$BASE/api/run" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID2\"}")
check_contains "Run countdown halts" '"halted":true' "$RESP"
sleep 0.5

# Test: Reset
RESP=$(curl -s -X POST "$BASE/api/reset" -H "Content-Type: application/json" -d "{\"session_id\":\"$SID2\"}")
check_contains "Reset succeeds" '"ok":true' "$RESP"
sleep 0.5

echo ""
echo -e "${YELLOW}=== Programs API ===${NC}"

RESP=$(curl -s -X POST "$BASE/api/programs/save" -H "Content-Type: application/json" -d '{"name":"test_program","code":"INP\nOUT\nHLT"}' -b /tmp/bmc_test_cookies.txt)
check_contains "Save program succeeds" '"ok":true' "$RESP"
sleep 0.5

RESP=$(curl -s "$BASE/api/programs/list" -b /tmp/bmc_test_cookies.txt)
check_contains "List programs contains saved program" '"test_program"' "$RESP"
sleep 0.5

RESP=$(curl -s "$BASE/api/programs/load?name=test_program" -b /tmp/bmc_test_cookies.txt)
check_contains "Load program returns code" '"ok":true' "$RESP"
check_contains "Load program has correct code" 'INP' "$RESP"
sleep 0.5

# Test: GDPR data export
RESP=$(curl -s "$BASE/api/export-data" -b /tmp/bmc_test_cookies.txt)
check_contains "GDPR data export returns username" "\"$TEST_USER\"" "$RESP"
sleep 0.5

# Cleanup: Delete program
RESP=$(curl -s -X POST "$BASE/api/programs/delete" -H "Content-Type: application/json" -d '{"name":"test_program"}' -b /tmp/bmc_test_cookies.txt)
check_contains "Delete program succeeds" '"ok":true' "$RESP"
sleep 0.5

# Logout
# First log back in to clean up test user account
curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" -d "{\"username\":\"$TEST_USER\",\"password\":\"password123\"}" -c /tmp/bmc_test_cookies.txt > /dev/null
sleep 0.3
# Delete test account (GDPR)
curl -s -X DELETE "$BASE/api/account" -b /tmp/bmc_test_cookies.txt > /dev/null
sleep 0.3

RESP=$(curl -s -X POST "$BASE/api/logout" -b /tmp/bmc_test_cookies.txt -c /tmp/bmc_test_cookies.txt)
check_contains "Logout succeeds" '"ok":true' "$RESP"
sleep 0.5

RESP=$(curl -s "$BASE/api/me" -b /tmp/bmc_test_cookies.txt)
check_contains "Not authenticated after logout" '"ok":false' "$RESP"
sleep 0.5

# ==========================================================================
echo ""
echo -e "${YELLOW}=== Instruction Tests ===${NC}"

# Helper to load+run a program and extract output
run_prog() {
    local code="$1"
    local sid
    RESP=$(curl -s -X POST "$BASE/api/load" -H "Content-Type: application/json" -d "{\"code\":\"$code\"}")
    sid=$(echo "$RESP" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)
    RESP=$(curl -s -X POST "$BASE/api/run" -H "Content-Type: application/json" -d "{\"session_id\":\"$sid\"}")
    echo "$RESP"
}

# MUL
RESP=$(run_prog "LDA 4\nMUL 5\nOUT\nHLT\nDAT 3\nDAT 4")
check_contains "MUL 3*4=12" '"output":"12"' "$RESP"
sleep 0.3

# DIV
RESP=$(run_prog "LDA 4\nDIV 5\nOUT\nHLT\nDAT 10\nDAT 3")
check_contains "DIV 10/3=3" '"output":"3"' "$RESP"
sleep 0.3

# MOD
RESP=$(run_prog "LDA 4\nMOD 5\nOUT\nHLT\nDAT 10\nDAT 3")
check_contains "MOD 10%3=1" '"output":"1"' "$RESP"
sleep 0.3

# OTC (character output)
RESP=$(run_prog "LDA 5\nOTC\nLDA 6\nOTC\nHLT\nDAT 72\nDAT 73")
check_contains "OTC outputs HI" '"output":"HI"' "$RESP"
sleep 0.3

# BRA (unconditional branch)
RESP=$(run_prog "LDA 5\nBRA 3\nOUT\nOUT\nHLT\nDAT 42")
check_contains "BRA skips instruction" '"output":"42"' "$RESP"
sleep 0.3

# BRZ (branch if zero)
RESP=$(run_prog "LDA 7\nBRZ 4\nOUT\nHLT\nLDA 8\nOUT\nHLT\nDAT 0\nDAT 99")
check_contains "BRZ branches when zero" '"output":"99"' "$RESP"
sleep 0.3

# AND (bitwise)
RESP=$(run_prog "LDA 4\nAND 5\nOUT\nHLT\nDAT 12\nDAT 10")
check_contains "AND 12&10=8" '"output":"8"' "$RESP"
sleep 0.3

# OR (bitwise)
RESP=$(run_prog "LDA 4\nOR 5\nOUT\nHLT\nDAT 12\nDAT 10")
check_contains "OR 12|10=14" '"output":"14"' "$RESP"
sleep 0.3

# NOT
RESP=$(run_prog "LDA 4\nNOT\nOUT\nHLT\nDAT 100")
check_contains "NOT 100=899" '"output":"899"' "$RESP"
sleep 0.3

echo ""
echo -e "${YELLOW}=== Results ===${NC}"
echo -e "  Total: $TOTAL"
echo -e "  ${GREEN}Passed: $PASS${NC}"
if [ $FAIL -gt 0 ]; then
    echo -e "  ${RED}Failed: $FAIL${NC}"
fi

rm -f /tmp/bmc_test_cookies.txt
exit $FAIL
