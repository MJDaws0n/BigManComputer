# BMC Security

This document describes the security measures implemented in the Big Man Computer (BMC) web application.

## Authentication

### Password Storage
- Passwords are **never stored in plaintext**.
- All passwords are hashed using **SHA-256** with a per-user random salt and a server-side pepper.
- The hash format is `salt:hash`, where `salt` is a 16-character random string and `hash` is the SHA-256 digest of `salt + pepper + password`.
- SHA-256 is implemented in pure Novus following NIST FIPS 180-4.

### Session Management
- Sessions use cryptographically random tokens (64-character hex strings generated from system entropy via `/dev/urandom`).
- Session cookies are set with:
  - `HttpOnly` — prevents JavaScript access (XSS protection)
  - `SameSite=Strict` — prevents CSRF attacks
  - `Path=/` — scoped to the application
- Sessions are stored server-side in a flat-file database.

### Input Validation
- **Usernames**: 3–32 alphanumeric characters only. No special characters, pipes, slashes, or newlines allowed.
- **Passwords**: 6–128 characters. No length-based denial-of-service possible.
- The pipe character `|` is explicitly rejected in usernames as it is the database field delimiter.

## Web Server Security

### Path Traversal Protection
- All static file requests are checked for `..` sequences and backslash characters.
- Requests containing path traversal patterns receive a `404` response.
- Source code files (`main.nov`, `src/`, `lib/`, `data/`) are not accessible via the web server — only the `www/` directory is served.

### Request Handling
- Each HTTP request is handled in a **forked child process**, providing process-level isolation.
- Malformed requests (missing method, missing path, binary garbage) are handled gracefully without crashing the server.
- The parent process uses non-blocking `waitpid` (WNOHANG) to reap child processes without blocking request handling.

### Header Injection
- CRLF injection attempts in URLs are rejected.
- Oversized headers and request bodies are handled without buffer overflows.

### Denial of Service Mitigations
- Very long URLs (10KB+) are handled gracefully.
- Oversized POST bodies (300KB+) are processed without crashing.
- Empty and partial connections do not block the server.
- Rapid sequential requests are handled correctly.

## Database Security

### File-Based Database
- User data is stored in flat files with pipe-delimited fields.
- **File locking** is implemented using atomic `O_CREAT|O_EXCL` lockfiles to prevent concurrent write corruption.
- Lock acquisition has a timeout (200 attempts × 5ms = 1 second) to prevent deadlocks.
- Stale locks are force-released after timeout.

### Data Isolation
- Users can only access their own saved programs.
- All API endpoints that access user data require valid session authentication.
- Programs are stored with their owner's username — no cross-user access is possible.

### Newline & Delimiter Escaping
- Newlines in saved program code are escaped as `%%NL%%` and carriage returns as `%%CR%%` to prevent field injection in the pipe-delimited database.

## GDPR Compliance

### Data Minimisation
- Only the minimum data required is collected: username, hashed password, and saved programs.
- No email addresses, IP addresses, or tracking data is collected.
- No third-party analytics or tracking scripts are used.

### User Rights
- **Right to Access**: Users can export all their data via the `/api/me/export` endpoint.
- **Right to Erasure**: Users can delete individual programs. Account deletion removes all associated data.
- **Transparency**: The privacy policy clearly explains what data is collected and why.

### Cookies
- Only **essential cookies** are used (session authentication).
- No tracking or marketing cookies.
- A cookie consent banner informs users about cookie usage.

## Cross-Site Scripting (XSS) Prevention

- All user-generated content displayed in the UI is escaped using `escapeHtml()` which converts `&`, `<`, `>`, `"`, and `'` to HTML entities.
- The code editor uses a `<textarea>` element which does not render HTML.
- Session cookies have `HttpOnly` flag, preventing JavaScript access to session tokens.

## Cross-Site Request Forgery (CSRF)

- Session cookies use `SameSite=Strict`, preventing the browser from sending cookies with cross-origin requests.
- All state-changing operations require `POST` requests with JSON bodies.

## Shell Injection Prevention

- The export functionality compiles user code through the Novus compiler. File paths are sanitised before use.
- No user input is passed directly to shell commands (`exec` or `system` calls).

## Testing

BMC includes comprehensive security testing:
- **76 security tests** across 18 categories (`tests/test_security.sh`)
- **48 functional tests** (`tests/test_all.sh`)

Test categories include:
1. Path traversal (11 tests)
2. HTTP header injection (3 tests)
3. Request size / DoS resilience (5 tests)
4. Auth bypass / session attacks (7 tests)
5. Input validation / injection (6 tests)
6. Simulator session attacks (5 tests)
7. Export / shell injection (4 tests)
8. CORS / origin checks (1 test)
9. Method enforcement (4 tests)
10. Content-type validation (2 tests)
11. Cookie security attributes (3 tests)
12. Program save injection (4 tests)
13. Special characters in paths (5 tests)
14. Concurrent session safety (1 test)
15. Static file security (5 tests)
16. Malformed HTTP requests (3 tests)
17. Response header security (3 tests)
18. Concurrent write safety (4 tests)

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Fork-per-request | Process isolation prevents one request from affecting others |
| Non-blocking waitpid | Prevents server hangs from zombie processes |
| File-based locking | Ensures database consistency under concurrent access |
| SHA-256 (single round) | Cryptographic security without heap corruption issues in forked processes |
| Chunked file serving | O(n) performance, prevents slow-loris on large static files |
| Client-side VM | Simulation runs in the browser — no server resources consumed per step |
