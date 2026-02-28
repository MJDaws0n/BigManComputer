#!/bin/bash
# =============================================================================
# BMC - Build and Start Script
# Usage:
#   ./start.sh              Start on default port 8080
#   ./start.sh --port 9090  Start on custom port
#   ./start.sh --build      Recompile then start
# =============================================================================

set -e

BUILD=false
ARGS=""

for arg in "$@"; do
    if [ "$arg" = "--build" ]; then
        BUILD=true
    else
        ARGS="$ARGS $arg"
    fi
done

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    ARCH_NAME="x86_64"
    BUILD_DIR="build/linux_x86_64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    ARCH_NAME="arm64"
    if [ "$OS" = "darwin" ]; then
        BUILD_DIR="build/darwin_arm64"
    else
        BUILD_DIR="build/linux_arm64"
    fi
else
    BUILD_DIR="build/${OS}_${ARCH}"
fi

BINARY="$BUILD_DIR/BigManComputer"

# Recompile if --build flag or no binary exists
if [ "$BUILD" = true ] || [ ! -f "$BINARY" ]; then
    echo "🔨 Compiling BMC..."
    if ! command -v novus &>/dev/null; then
        echo "ERROR: Novus compiler not found. Install from https://github.com/MJDaws0n/Novus"
        exit 1
    fi
    novus main.nov
    echo "✅ Build complete"
fi

# Ensure data directory exists
mkdir -p data

echo "🚀 Starting BMC..."
exec "$BINARY" $ARGS
