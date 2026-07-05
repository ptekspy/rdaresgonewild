#!/usr/bin/env bash
set -euo pipefail

PRIMARY="hf.co/bartowski/dolphin-2.9.3-mistral-nemo-12b-GGUF:Q5_K_M"
FALLBACK="dolphin-mistral:latest"

echo "Pulling primary classifier model: ${PRIMARY}"
if ollama pull "${PRIMARY}"; then
  echo "Primary model pulled successfully."
  exit 0
fi

echo "Primary Hugging Face model pull failed. Pulling fallback: ${FALLBACK}" >&2
ollama pull "${FALLBACK}"
echo "Fallback model pulled successfully. Update OLLAMA_MODEL=${FALLBACK} if using this fallback."
