# BMC Development Log

## Project Overview

Big Man Computer (BMC) is an enhanced Little Man Computer (LMC) CPU simulator built as a web application in Novus, using Nox for package management.

## Architecture

### Backend (Novus)
- **Entry point**: `main.nov` — HTTP server with routing, static file serving, CLI args
- **Database**: `src/db.nov` — Pipe-delimited flat file storage (tables in `data/`)
- **Auth**: `src/hash.nov` (DJB2 hashing), `src/api/auth.nov` (signup/login/logout)
- **BMC Engine**: `src/bmc/parser.nov` (assembly parser), `src/bmc/vm.nov` (virtual machine), `src/bmc/compiler.nov` (BMC→Novus compiler)
- **API**: `src/api/simulator.nov`, `src/api/programs.nov`, `src/api/export.nov`

### Frontend (HTML/CSS/JS)
- `www/index.html` — Landing page
- `www/editor.html` — IDE + CPU visualizer
- `www/help.html` — Instruction set reference
- `www/dashboard.html` — User program management
- `www/login.html`, `www/signup.html` — Authentication forms
- `www/privacy.html` — GDPR privacy policy
- `www/credits.html` — Credits and acknowledgements
- `www/css/style.css` — Dark-themed responsive stylesheet
- `www/js/editor.js` — Code editor with line numbers and examples
- `www/js/simulator.js` — CPU visualization (registers, memory, ALU, data bus)
- `www/js/app.js` — Shared utilities (auth, nav, cookie consent)

### VM State Format
The VM state is a pipe-delimited string with 14 fields:
```
acc|pc|mar|mdr|cir|sr|halted|memory|inst_count|opcodes|operands|output|input_buf|error
```

### Simulator Session Storage
VM states are stored as individual files in `data/sim_<session_id>.state`. This avoids Novus global variable limitations in imported modules.

## Build & Run

```bash
# Install dependencies
nox init

# Build
novus main.nov

# Run
./build/darwin_arm64/BigManComputer --port 8080 --debug
```

## Design Decisions

1. **Single-process HTTP**: No fork-per-request, to preserve VM state across API calls
2. **File-based VM state**: Global arrays in imported Novus modules cause segfaults; file storage is reliable
3. **Custom JSON construction**: `json_object_*()` only produces string values; manual JSON needed for booleans
4. **Function name prefixing**: Custom helpers use `api_` prefix to avoid conflicts with http library (e.g., `api_send_json`)
5. **String uppercase**: `str_to_upper` not in std library; implemented as `to_upper()` in parser module

## Known Limitations

- Sequential request handling (no concurrent connections)
- DJB2 hashing is not cryptographically secure (educational project)
- No WebSocket support (step-through uses polling)
- 100 memory locations only
- No floating-point support in BMC
