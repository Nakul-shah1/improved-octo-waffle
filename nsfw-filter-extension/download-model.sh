#!/bin/bash
# ──────────────────────────────────────────────────────────────
# NSFWJS Model Download Script
# Downloads the NSFWJS MobileNetV2 model files
# into the models/nsfwjs/ directory so they are bundled
# with the extension — no runtime download needed.
#
# Uses sparse checkout from the official NSFWJS repo.
# Model: MobileNetV2 (90% accuracy, ~2.6MB)
# ──────────────────────────────────────────────────────────────

set -e

MODEL_DIR="models/nsfwjs"
REPO_URL="https://github.com/infinitered/nsfwjs.git"
TMP_DIR="/tmp/nsfwjs-model-download"

mkdir -p "$MODEL_DIR"

# Check if model already exists
if [ -f "$MODEL_DIR/model.json" ] && [ -f "$MODEL_DIR/group1-shard1of1" ]; then
  echo "✓ Model files already exist in $MODEL_DIR"
  echo "  To re-download, delete the files first."
  ls -lh "$MODEL_DIR/"
  exit 0
fi

echo "Downloading NSFWJS MobileNetV2 model..."

# Clean up any previous temp
rm -rf "$TMP_DIR"

# Sparse clone - only get the mobilenet_v2 model files
git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMP_DIR"
cd "$TMP_DIR"
git sparse-checkout set models/mobilenet_v2

# Copy model files
cp models/mobilenet_v2/* "$OLDPWD/$MODEL_DIR/"

# Clean up
rm -rf "$TMP_DIR"

echo ""
echo "✓ Model files downloaded to $MODEL_DIR:"
ls -lh "$MODEL_DIR/"
echo ""
echo "Done! The model is bundled with the extension."
