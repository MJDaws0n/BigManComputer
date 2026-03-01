# =============================================================================
# BMC (Big Man Computer) Docker Setup — Multi-Architecture
#
# Supports both linux/amd64 and linux/arm64 natively.
# Downloads Novus compiler and Nox package manager, compiles BMC, then runs it.
#
# Runtime notes:
# - BMC requires a .env file; this image generates one from env vars if missing.
# - AutoGate captcha validation uses /usr/bin/curl (installed in runtime stage).
# =============================================================================

# --- Build Stage ---
# Build runs on the TARGETPLATFORM so the installed binutils matches the target
# (Novus invokes the system assembler/linker).
FROM --platform=$TARGETPLATFORM debian:bookworm-slim AS builder

ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils curl ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

# Download prebuilt Novus compiler matching the target architecture
ARG NOVUS_VERSION=V0.1.2
RUN curl -fSL -o /usr/local/bin/novus \
    "https://github.com/MJDaws0n/Novus/releases/download/${NOVUS_VERSION}/novus-linux-${TARGETARCH}" && \
    chmod +x /usr/local/bin/novus

# Build Nox package manager from source
# (The published linux binaries may not handle argv correctly, which breaks `nox init`.)
ARG NOX_REF=main
RUN git clone --depth=1 --branch "${NOX_REF}" https://github.com/MJDaws0n/Nox.git /tmp/nox-src && \
    cd /tmp/nox-src && \
    novus --target=linux/${TARGETARCH} main.nov && \
    find build/ -maxdepth 5 -type f -name nox -print -quit | xargs -I {} cp {} /usr/local/bin/nox && \
    chmod +x /usr/local/bin/nox && \
    rm -rf /tmp/nox-src && \
    nox version >/dev/null

WORKDIR /app
COPY . .

# Use nox to install/update all library dependencies
# Always reinstall in Docker so builds work from fresh clones (lib/ is gitignored).
RUN set -eu; \
    rm -rf lib; \
    nox init; \
    if [ ! -f lib/std/main.nov ]; then \
      echo "ERROR: nox init did not populate /app/lib (expected lib/std/main.nov)"; \
      echo "pwd=$(pwd)"; \
      ls -la; \
      ls -la lib || true; \
      echo "--- libraries.conf"; \
      sed -n '1,120p' libraries.conf || true; \
      exit 1; \
    fi

# Compile BMC for the target architecture
# Output goes to build/linux_x86_64/ (amd64) or build/linux_arm64/ (arm64)
RUN novus --target=linux/${TARGETARCH} main.nov

# Normalize the build output directory name for the run stage
RUN if [ "$TARGETARCH" = "amd64" ]; then \
      mv build/linux_x86_64 build/app; \
    else \
      mv build/linux_arm64 build/app; \
    fi

# --- Run Stage ---
FROM debian:bookworm-slim

# binutils needed for assembler/linker (user program export)
# curl needed for AutoGate captcha validation
RUN apt-get update && apt-get install -y --no-install-recommends \
      binutils curl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -r -s /bin/false bmc && \
    mkdir -p /app/data /app/build && \
    chown -R bmc:bmc /app

WORKDIR /app

# Novus compiler is required at runtime for export compilation
COPY --from=builder /usr/local/bin/novus /usr/local/bin/novus

COPY --from=builder /app/build/app/ ./build/app/
COPY --from=builder /app/www/ ./www/
COPY --from=builder /app/lib/ ./lib/
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/main.nov ./
COPY --from=builder /app/libraries.conf ./

# Ensure runtime write dirs are owned by the non-root user
RUN mkdir -p /app/data /app/build && chown -R bmc:bmc /app

EXPOSE 8080

USER bmc

ENTRYPOINT ["/bin/sh", "-c", "set -eu; PORT=\"${BMC_PORT:-${PORT:-8080}}\"; if [ ! -f .env ]; then printf 'BMC_PORT=%s\\nAUTOGATE_PUBLIC=%s\\nAUTOGATE_PRIVATE=%s\\n' \"$PORT\" \"${AUTOGATE_PUBLIC:-}\" \"${AUTOGATE_PRIVATE:-}\" > .env; fi; exec ./build/app/BigManComputer --port \"$PORT\"" ]
