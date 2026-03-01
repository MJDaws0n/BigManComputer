# =============================================================================
# BMC (Big Man Computer) Docker Setup — Multi-Architecture
#
# Supports both linux/amd64 and linux/arm64 natively.
# Downloads Novus compiler and Nox package manager, then uses nox to pull
# all library dependencies from the registry before compiling.
#
# Usage:
#   docker compose build   → Recompiles the BMC application
#   docker compose up      → Starts the server (no recompile)
#   docker compose up -d   → Starts detached
# =============================================================================

# --- Build Stage ---
FROM debian:bookworm-slim AS builder

# TARGETARCH is set automatically by Docker BuildKit (amd64 or arm64)
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils curl ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

# Download prebuilt Novus compiler matching the target architecture
ARG NOVUS_VERSION=V0.1.2
RUN curl -fSL -o /usr/local/bin/novus \
    "https://github.com/MJDaws0n/Novus/releases/download/${NOVUS_VERSION}/novus-linux-${TARGETARCH}" && \
    chmod +x /usr/local/bin/novus

# Install Nox package manager: try pre-built binary, fall back to compiling from source
ARG NOX_VERSION=V0.0.3
RUN (curl -fSL -o /usr/local/bin/nox \
    "https://github.com/MJDaws0n/Nox/releases/download/${NOX_VERSION}/nox-linux-${TARGETARCH}" && \
    chmod +x /usr/local/bin/nox) || \
    (echo "Pre-built nox not available for ${TARGETARCH}, building from source..." && \
     git clone --depth=1 https://github.com/MJDaws0n/Nox.git /tmp/nox-src && \
     cd /tmp/nox-src && \
     novus --target=linux/${TARGETARCH} main.nov && \
     find build/ -name nox -type f | head -1 | xargs -I {} cp {} /usr/local/bin/nox && \
     chmod +x /usr/local/bin/nox && \
     rm -rf /tmp/nox-src)

WORKDIR /app
COPY . .

# Use nox to install all library dependencies from the registry
RUN nox init

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
RUN apt-get update && apt-get install -y --no-install-recommends binutils && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -r -s /bin/false bmc && mkdir -p /app/data && chown -R bmc:bmc /app

WORKDIR /app

# Copy Novus compiler for runtime compilation (exports)
COPY --from=builder /usr/local/bin/novus /usr/local/bin/novus

COPY --from=builder /app/build/app/ ./build/app/
COPY --from=builder /app/www/ ./www/
COPY --from=builder /app/lib/ ./lib/
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/main.nov ./
COPY --from=builder /app/libraries.conf ./

# Ensure data dir exists and is writable
RUN mkdir -p /app/data && chown -R bmc:bmc /app/data

EXPOSE 8080

USER bmc

ENTRYPOINT ["./build/app/BigManComputer"]
CMD ["--port", "8080"]
