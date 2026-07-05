# RDGW model classifier worker

Runs on the 5090 laptop. This service is the only public endpoint that Vercel should call. Ollama should stay private on `127.0.0.1:11434`.

## Env

```env
DATABASE_URL=postgresql://...
DATABASE_DRIVER=neon
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=hf.co/bartowski/dolphin-2.9.3-mistral-nemo-12b-GGUF:Q5_K_M
OLLAMA_CLASSIFIER_SECRET=replace-with-long-random-secret
PORT=8787
```

## Dev

```bash
pnpm --filter @rdgw/model-classifier-worker dev
```

## Health check

```bash
curl http://127.0.0.1:8787/health
```
