# BMC Test Results

## Test Environment
- **OS**: macOS (Darwin ARM64)
- **Novus Compiler**: V0.1.1
- **Test Runner**: `tests/test_all.sh`

## How to Run Tests

```bash
# Build first
novus main.nov

# Start server (in background)
./build/darwin_arm64/BigManComputer --port 9001 &

# Run tests
bash tests/test_all.sh 9001

# Stop server
kill %1
```

## Test Results Summary

| Category | Tests | Passed | Failed |
|----------|-------|--------|--------|
| Static Pages | 10 | 10 | 0 |
| Auth API | 7 | 7 | 0 |
| Simulator API | 12 | 12 | 0 |
| Programs API | 8 | 8 | 0 |
| **Total** | **39** | **39** | **0** |

## Detailed Test Results

### Static Pages

| # | Test | Input | Expected | Result |
|---|------|-------|----------|--------|
| 1 | GET / | HTTP GET / | 200 | ✓ Pass |
| 2 | GET /editor | HTTP GET /editor | 200 | ✓ Pass |
| 3 | GET /help | HTTP GET /help | 200 | ✓ Pass |
| 4 | GET /credits | HTTP GET /credits | 200 | ✓ Pass |
| 5 | GET /privacy | HTTP GET /privacy | 200 | ✓ Pass |
| 6 | GET /login | HTTP GET /login | 200 | ✓ Pass |
| 7 | GET /signup | HTTP GET /signup | 200 | ✓ Pass |
| 8 | GET /css/style.css | HTTP GET /css/style.css | 200 | ✓ Pass |
| 9 | GET /js/app.js | HTTP GET /js/app.js | 200 | ✓ Pass |
| 10 | GET /nonexistent | HTTP GET /nonexistent | 404 | ✓ Pass |

### Auth API

| # | Test | Input | Expected | Result |
|---|------|-------|----------|--------|
| 11 | Unauthenticated check | GET /api/me (no cookie) | `{"ok":false}` | ✓ Pass |
| 12 | Short username signup | POST username="ab" | `{"ok":false,...}` | ✓ Pass |
| 13 | Valid signup | POST username="testuser" | `{"ok":true,...}` | ✓ Pass |
| 14 | Duplicate signup | POST username="testuser" (again) | `{"ok":false,...}` | ✓ Pass |
| 15 | Wrong password login | POST password="wrongpass" | `{"ok":false,...}` | ✓ Pass |
| 16 | Correct login | POST password="password123" | `{"ok":true,...}` + Set-Cookie | ✓ Pass |
| 17 | Authenticated check | GET /api/me (with cookie) | `{"ok":true,"username":"testuser"}` | ✓ Pass |

### Simulator API

| # | Test | Input | Expected | Result |
|---|------|-------|----------|--------|
| 18 | Load program | INP, STA 99, INP, ADD 99, OUT, HLT | `{"ok":true,...}` | ✓ Pass |
| 19 | Session ID | (from load response) | Non-empty string | ✓ Pass |
| 20 | Step to INP | POST /api/step | `waiting_input: true` | ✓ Pass |
| 21 | Provide input 42 | POST /api/input value=42 | `ok: true` | ✓ Pass |
| 22 | ACC after input | (from response) | ACC = 42 | ✓ Pass |
| 23 | STA stores to memory | POST /api/step | memory[99] = 42 | ✓ Pass |
| 24 | Second INP waits | POST /api/step | `waiting_input: true` | ✓ Pass |
| 25 | Second input 8 | POST /api/input value=8 | ACC = 8 | ✓ Pass |
| 26 | ADD result | POST /api/step | ACC = 50 | ✓ Pass |
| 27 | OUT output | POST /api/step | output = "50" | ✓ Pass |
| 28 | HLT halts | POST /api/step | `halted: true` | ✓ Pass |

### Programs API & GDPR

| # | Test | Input | Expected | Result |
|---|------|-------|----------|--------|
| 29 | Load countdown | LDA count, loop: OUT, SUB one, STA count, BRP loop, HLT, count: DAT 3, one: DAT 1 | `ok: true` | ✓ Pass |
| 30 | Run countdown | POST /api/run | `halted: true` | ✓ Pass |
| 31 | Reset | POST /api/reset | `ok: true` | ✓ Pass |
| 32 | Save program | POST name="test_program" | `ok: true` | ✓ Pass |
| 33 | List programs | GET /api/programs/list | Contains "test_program" | ✓ Pass |
| 34 | Load program | GET /api/programs/load?name=test_program | `ok: true`, contains code | ✓ Pass |
| 35 | Load program code | (from response) | Contains "INP" | ✓ Pass |
| 36 | GDPR data export | GET /api/export-data | Contains "testuser" | ✓ Pass |
| 37 | Delete program | POST name="test_program" | `ok: true` | ✓ Pass |
| 38 | Logout | POST /api/logout | `ok: true` | ✓ Pass |
| 39 | Post-logout check | GET /api/me | `ok: false` | ✓ Pass |
| 40 | MUL 3×4 | LDA/MUL/OUT/HLT + DAT 3, DAT 4 | output: "12" | ✓ Pass |
| 41 | DIV 10÷3 | LDA/DIV/OUT/HLT + DAT 10, DAT 3 | output: "3" | ✓ Pass |
| 42 | MOD 10%3 | LDA/MOD/OUT/HLT + DAT 10, DAT 3 | output: "1" | ✓ Pass |
| 43 | OTC (char output) | LDA/OTC × 2 + DAT 72, DAT 73 | output: "HI" | ✓ Pass |
| 44 | BRA (unconditional) | LDA/BRA/OUT/OUT/HLT + DAT 42 | output: "42" | ✓ Pass |
| 45 | BRZ (branch zero) | LDA/BRZ/HLT/LDA/OUT/HLT + DAT 0, DAT 99 | output: "99" | ✓ Pass |
| 46 | AND 12&10 | LDA/AND/OUT/HLT + DAT 12, DAT 10 | output: "8" | ✓ Pass |
| 47 | OR 12\|10 | LDA/OR/OUT/HLT + DAT 12, DAT 10 | output: "14" | ✓ Pass |
| 48 | NOT 100 | LDA/NOT/OUT/HLT + DAT 100 | output: "899" | ✓ Pass |

## BMC Instruction Test Coverage

| Instruction | Tested | Method |
|-------------|--------|--------|
| LDA | ✓ | Countdown program, all instruction tests |
| STA | ✓ | Add-two-numbers program |
| ADD | ✓ | Add-two-numbers (42+8=50) |
| SUB | ✓ | Countdown program |
| INP | ✓ | Add-two-numbers (input 42, 8) |
| OUT | ✓ | Add-two-numbers (output 50) |
| HLT | ✓ | All programs |
| BRP | ✓ | Countdown loop |
| DAT | ✓ | Countdown data values |
| MUL | ✓ | Test 40: 3×4=12 |
| DIV | ✓ | Test 41: 10÷3=3 |
| MOD | ✓ | Test 42: 10%3=1 |
| BRA | ✓ | Test 44: unconditional branch |
| BRZ | ✓ | Test 45: branch when zero |
| OTC | ✓ | Test 43: ASCII 72,73 → "HI" |
| AND | ✓ | Test 46: 12&10=8 |
| OR  | ✓ | Test 47: 12\|10=14 |
| NOT | ✓ | Test 48: 999-100=899 |
