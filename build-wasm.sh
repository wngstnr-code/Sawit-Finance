#!/bin/bash

set -e

CARGO="${CARGO:-$HOME/.cargo/bin/cargo}"
TOOLCHAIN="nightly-2026-01-01"
TARGET="wasm32-unknown-unknown"

CONTRACTS=(
  "production-vault|production_vault_build_contract|SawitProductionVault"
  "sawit-token|sawit_token_build_contract|SawitToken"
  "token-minter|token_minter_build_contract|SawitMinter"
  "yield-distributor|yield_distributor_build_contract|SawitYieldDistributor"
)

echo "═══════════════════════════════════════════"
echo "  Sawit Finance — Building contract wasm"
echo "═══════════════════════════════════════════"

mkdir -p wasm

for entry in "${CONTRACTS[@]}"; do
  IFS="|" read -r pkg bin name <<< "$entry"
  echo ""
  echo "── $name ──"
  RUSTFLAGS="--cfg odra_module=\"$name\"" \
    "$CARGO" "+$TOOLCHAIN" build --release --target "$TARGET" -p "$pkg" --bin "$bin"

  src="target/$TARGET/release/$bin.wasm"
  dst="wasm/$name.wasm"
  cp "$src" "$dst"

  command -v wasm-strip >/dev/null 2>&1 && wasm-strip "$dst" || true
  command -v wasm-opt   >/dev/null 2>&1 && \
    wasm-opt --enable-bulk-memory --llvm-memory-copy-fill-lowering --signext-lowering -Oz "$dst" -o "$dst" || true

  size=$(ls -la "$dst" | awk '{print $5}')
  echo "  → $dst ($size bytes)"
done

echo ""
echo "═══════════════════════════════════════════"
echo "  Done. wasm files ready in wasm/"
echo "  Deploy: cargo run -p sawit-deploy --bin deploy --features livenet"
echo "═══════════════════════════════════════════"
