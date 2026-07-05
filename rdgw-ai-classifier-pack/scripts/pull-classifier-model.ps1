$ErrorActionPreference = "Stop"

$primary = "hf.co/bartowski/dolphin-2.9.3-mistral-nemo-12b-GGUF:Q5_K_M"
$fallback = "dolphin-mistral:latest"

Write-Host "Pulling primary classifier model: $primary"
try {
  ollama pull $primary
  Write-Host "Primary model pulled successfully."
  exit 0
} catch {
  Write-Warning "Primary Hugging Face model pull failed: $($_.Exception.Message)"
}

Write-Host "Pulling fallback Ollama library model: $fallback"
ollama pull $fallback
Write-Host "Fallback model pulled successfully. Update OLLAMA_MODEL=$fallback if using this fallback."
