# Model classifier deployment

## Recommended local topology

```txt
Internet
  -> Cloudflare / reverse proxy
  -> https://ollama.tik-track.com/v1/rdgw/classify-user
  -> model-classifier-worker on port 8787
  -> Ollama on 127.0.0.1:11434
```

Do not proxy `127.0.0.1:11434` directly.

## Windows PowerShell quick start

```powershell
# 1. Pull model
.\scripts\pull-classifier-model.ps1

# 2. Start Ollama if it is not already running
ollama serve

# 3. In another terminal, start worker
pnpm --filter @rdgw/model-classifier-worker dev
```

## Test worker locally

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

## Test signed queue call locally

```powershell
$body = @{ jobId = "replace-with-real-job-id"; username = "replace-with-username" } | ConvertTo-Json
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/v1/rdgw/classify-user `
  -Headers @{ Authorization = "Bearer $env:OLLAMA_CLASSIFIER_SECRET" } `
  -ContentType "application/json" `
  -Body $body
```
