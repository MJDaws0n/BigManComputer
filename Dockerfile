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
# BuildKit already runs this stage on TARGETPLATFORM, so the installed binutils
# match the target architecture (Novus invokes the system assembler/linker).
FROM debian:bookworm-slim AS builder

ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils curl ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

# Download prebuilt Novus compiler matching the target architecture
ARG NOVUS_VERSION=v0.2.9
ARG NOVUS_SHA256_AMD64=10e2d2b0187e8b3ed4f50727df2d65481ed789e48135a631358cf6fa05bceef9
ARG NOVUS_SHA256_ARM64=cec942df8ef529a6165af11b969659e0e0f4b7f9d6d36c7172913440ceda76fd
RUN case "${TARGETARCH}" in \
      amd64) NOVUS_SHA256="${NOVUS_SHA256_AMD64}" ;; \
      arm64) NOVUS_SHA256="${NOVUS_SHA256_ARM64}" ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    curl -fSL -o /usr/local/bin/novus \
      "https://github.com/MJDaws0n/Novus/releases/download/${NOVUS_VERSION}/novus-linux-${TARGETARCH}" && \
    echo "${NOVUS_SHA256}  /usr/local/bin/novus" | sha256sum -c - && \
    chmod +x /usr/local/bin/novus

# Install a checksummed Nox release with reliable Linux package pulls.
ARG NOX_VERSION=v3.4.2
ARG NOX_SHA256_AMD64=b4bcc9666f2be0f765335d15b136dfef753dad898284910cb737ed83e212312a
ARG NOX_SHA256_ARM64=d8fbb0552ce6405bf8ff91c18cd8ef7efd2db0f9f69da370906b08e7a534635b
RUN case "${TARGETARCH}" in \
      amd64) NOX_SHA256="${NOX_SHA256_AMD64}" ;; \
      arm64) NOX_SHA256="${NOX_SHA256_ARM64}" ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    curl -fSL -o /usr/local/bin/nox \
      "https://github.com/MJDaws0n/Nox/releases/download/${NOX_VERSION}/nox-linux-${TARGETARCH}" && \
    echo "${NOX_SHA256}  /usr/local/bin/nox" | sha256sum -c - && \
    chmod +x /usr/local/bin/nox && \
    nox version | grep -q "^nox v3.4.2$"

WORKDIR /app
COPY . .

# Use nox to install/update all library dependencies in the same folder as libraries.conf
RUN set -eu; \
    command -v git >/dev/null; git --version; \
    command -v curl >/dev/null; \
    rm -rf lib; \
    nox version; \
    nox init; \
    test -f lib/std/main.nov

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
      binutils curl ca-certificates git && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -r -s /bin/false bmc && \
    mkdir -p /app/data /app/build && \
    chown -R bmc:bmc /app

WORKDIR /app

# Novus compiler is required at runtime for export compilation
COPY --from=builder /usr/local/bin/novus /usr/local/bin/novus
# Nox is useful for managing libs inside the container
COPY --from=builder /usr/local/bin/nox /usr/local/bin/nox

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

ENTRYPOINT ["/bin/sh", "-c", "set -eu; PORT=\"${BMC_PORT:-${PORT:-8080}}\"; printf 'BMC_PORT=%s\\nAUTOGATE_PUBLIC=%s\\nAUTOGATE_PRIVATE=%s\\n' \"$PORT\" \"${AUTOGATE_PUBLIC:-}\" \"${AUTOGATE_PRIVATE:-}\" > .env; exec ./build/app/BigManComputer --port \"$PORT\"" ]
