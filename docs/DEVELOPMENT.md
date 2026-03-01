# BMC Development Log

## Project Overview

Big Man Computer (BMC) is an improved Little Man Computer (LMC) CPU simulator, built as a web application in Novus using Nox for package management.

## Architecture

### Backend (Novus)
- **Entry point**: `main.nov` - HTTP server with routing, static file serving, CLI args
- **Database**: `src/db.nov` - pipe-delimited flat file storage (tables in `data/`)
- **Auth**: `src/hash.nov` (SHA-256 hashing), `src/api/auth.nov` (signup/login/logout)
- **BMC Engine**: `src/bmc/parser.nov` (assembly parser), `src/bmc/vm.nov` (virtual machine), `src/bmc/compiler.nov` (BMC to Novus compiler)
- **API**: `src/api/simulator.nov`, `src/api/programs.nov`, `src/api/export.nov`

### Frontend (HTML/CSS/JS)
- `www/index.html` - landing page
- `www/editor.html` - IDE + CPU visualiser
- `www/help.html` - instruction set reference
- `www/dashboard.html` - user program management
- `www/login.html`, `www/signup.html` - auth forms
- `www/privacy.html` - GDPR privacy policy
- `www/credits.html` - credits and acknowledgements
- `www/examples.html` - example programs
- `www/css/style.css` - dark-themed responsive stylesheet
- `www/js/editor.js` - code editor with line numbers and examples
- `www/js/simulator.js` - CPU visualisation (registers, memory, ALU, data bus)
- `www/js/bmcvm.js` - client-side BMC virtual machine
- `www/js/asmgen.js` - assembly code generator for export
- `www/js/app.js` - shared utilities (auth, nav, cookie consent)

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

1. **Fork-per-request HTTP**: Each request is handled in a forked child process for isolation
2. **File-based VM state**: Global arrays in imported Novus modules cause segfaults; file storage works reliably
3. **Client-side VM**: Simulation now runs entirely in the browser (JS) to avoid network throttling during stepping
4. **Custom JSON construction**: `json_object_*()` only produces string values; manual JSON needed for booleans
5. **Function name prefixing**: Custom helpers use `api_` prefix to avoid conflicts with the http library (e.g., `api_send_json`)
6. **String uppercase**: `str_to_upper` not in std library; rolled our own `to_upper()` in the parser module
7. **SHA-256 in pure Novus**: Cryptographic password hashing without external dependencies
8. **Chunked file serving**: Avoids O(n^2) `copy_bytes()` in the std library by reading/writing in 8KB chunks

## Known Limitations

- 100 memory locations only
- No floating-point support in BMC
- Novus has no GC, so long-running processes will slowly leak memory (fork-per-request mitigates this)
- No WebSocket support (step-through uses the client-side VM now, so this doesn't matter much)
