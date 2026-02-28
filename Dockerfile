# =============================================================================
# BMC (Big Man Computer) Docker Setup
#
# Build stage: Downloads Novus compiler, compiles BMC for Linux x86_64
# Run stage:   Minimal image that runs the compiled binary
#
# Usage:
#   docker compose build   → Recompiles the BMC application
#   docker compose up      → Starts the server (no recompile)
#   docker compose up -d   → Starts detached
# =============================================================================

# --- Build Stage (force x86_64 for correct assembler) ---
FROM --platform=linux/amd64 debian:bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Download prebuilt Novus compiler from GitHub releases
ARG NOVUS_VERSION=V0.1.2
RUN curl -fSL -o /usr/local/bin/novus \
    "https://github.com/MJDaws0n/Novus/releases/download/${NOVUS_VERSION}/novus-linux-amd64" && \
    chmod +x /usr/local/bin/novus

WORKDIR /app
COPY . .

# Compile BMC targeting Linux x86_64
RUN novus --target=linux/amd64 main.nov

# --- Run Stage ---
FROM --platform=linux/amd64 debian:bookworm-slim

# binutils needed for assembler/linker (user program export)
RUN apt-get update && apt-get install -y --no-install-recommends binutils && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -r -s /bin/false bmc && mkdir -p /app/data && chown -R bmc:bmc /app

WORKDIR /app

# Copy Novus compiler for runtime compilation (exports)
COPY --from=builder /usr/local/bin/novus /usr/local/bin/novus

COPY --from=builder /app/build/linux_x86_64/ ./build/linux_x86_64/
COPY --from=builder /app/www/ ./www/
COPY --from=builder /app/lib/ ./lib/
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/main.nov ./
COPY --from=builder /app/libraries.conf ./

# Ensure data dir exists and is writable
RUN mkdir -p /app/data && chown -R bmc:bmc /app/data

EXPOSE 8080

USER bmc

ENTRYPOINT ["./build/linux_x86_64/BigManComputer"]
CMD ["--port", "8080"]
