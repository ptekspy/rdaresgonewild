# RDGW AI model classifier pack

This pack adds an admin-triggered AI classification flow for `rdaresgonewild` without making the Vercel admin app do inference.

## Architecture

```txt
Admin users table
  -> Classify button
  -> Vercel server action queues DB row
  -> Vercel POSTs signed job to ollama.tik-track.com
  -> local 5090 worker reads user/posts from DB
  -> worker calls local Ollama
  -> worker writes result back to DB
```

## 1. Pull the recommended model on the 5090 laptop

Primary command:

```bash
ollama pull hf.co/bartowski/dolphin-2.9.3-mistral-nemo-12b-GGUF:Q5_K_M
```

If that exact Hugging Face GGUF tag is unavailable on your Ollama version, use the helper script in `scripts/pull-classifier-model.ps1`, which falls back to the Ollama library Dolphin model.

For this use case I recommend Dolphin Mistral Nemo 12B Q5_K_M: it is permissive enough for NSFW profile text, small enough for a laptop 5090, and strong enough to produce structured JSON classifications.

## 2. Copy these files into the repo

Copy the folders from this pack into your repo root:

```txt
apps/admin/app/users/ClassifyModelButton.tsx
apps/admin/app/users/classification-actions.ts
apps/admin/app/users/page.tsx
packages/model-classifier-worker/*
packages/database/prisma/schema.classification.prisma.patch
scripts/pull-classifier-model.ps1
scripts/pull-classifier-model.sh
.env.example.classifier
```

`apps/admin/app/users/page.tsx` is a full replacement based on the current repo file.

## 3. Apply the Prisma schema patch

Open `packages/database/prisma/schema.prisma` and apply the change shown in:

```txt
packages/database/prisma/schema.classification.prisma.patch
```

Then run:

```bash
pnpm db:generate
pnpm db:push
```

## 4. Add Vercel admin env vars

```env
OLLAMA_CLASSIFIER_ENDPOINT=https://ollama.tik-track.com
OLLAMA_CLASSIFIER_SECRET=generate-a-long-random-secret
```

## 5. Add worker env vars on the 5090 laptop

```env
DATABASE_URL=your-same-production-db-url
DATABASE_DRIVER=neon
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=hf.co/bartowski/dolphin-2.9.3-mistral-nemo-12b-GGUF:Q5_K_M
OLLAMA_CLASSIFIER_SECRET=same-secret-as-vercel
PORT=8787
```

## 6. Run the worker locally

From the repo root on the 5090 laptop:

```bash
pnpm install
pnpm --filter @rdgw/model-classifier-worker dev
```

Expose the worker at `https://ollama.tik-track.com` via your existing reverse proxy/tunnel. The public route should point to the worker, not raw Ollama.

## 7. Security note

Do not expose Ollama itself directly to the internet. Keep Ollama bound to localhost and expose only the worker endpoint, protected by `OLLAMA_CLASSIFIER_SECRET`.
