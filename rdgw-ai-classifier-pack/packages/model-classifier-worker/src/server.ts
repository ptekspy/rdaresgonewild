import express from "express";
import { prisma } from "@rdgw/database";
import { buildClassificationPrompt, normalizeClassificationResult } from "./prompt.js";

const app = express();

app.use(express.json({ limit: "2mb" }));

const port = Number(process.env.PORT ?? 8787);
const sharedSecret = requiredEnv("OLLAMA_CLASSIFIER_SECRET");
const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const ollamaModel = process.env.OLLAMA_MODEL ?? "hf.co/bartowski/dolphin-2.9.3-mistral-nemo-12b-GGUF:Q5_K_M";
const maxPosts = Number(process.env.CLASSIFIER_MAX_POSTS ?? 40);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rdgw-model-classifier-worker", model: ollamaModel });
});

app.post("/v1/rdgw/classify-user", async (req, res) => {
  const auth = req.header("authorization");
  if (auth !== `Bearer ${sharedSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = req.body as { jobId?: unknown; username?: unknown };
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  const username = typeof body.username === "string" ? normalizeUsername(body.username) : "";

  if (!jobId || !username) {
    return res.status(400).json({ error: "jobId and username are required" });
  }

  const job = await prisma.dgwUserClassification.findUnique({
    where: { id: jobId },
    select: { id: true, username: true },
  });

  if (!job || job.username !== username) {
    return res.status(404).json({ error: "Classification job not found" });
  }

  res.status(202).json({ ok: true, jobId, username });

  classifyUser(jobId, username).catch((error) => {
    console.error("Unhandled classification error", error);
  });
});

async function classifyUser(jobId: string, username: string) {
  await prisma.dgwUserClassification.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      error: null,
      failedAt: null,
    },
  });

  try {
    const user = await prisma.dgwUser.findUnique({
      where: { username },
      include: {
        posts: {
          orderBy: { createdAtReddit: "desc" },
          take: maxPosts,
          select: {
            title: true,
            selftext: true,
            flair: true,
            score: true,
            commentCount: true,
            createdAtReddit: true,
            imageUrls: true,
            mediaUrls: true,
            outboundUrl: true,
            permalink: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error(`User not found: ${username}`);
    }

    if (user.posts.length === 0) {
      throw new Error(`No posts available for u/${username}; sync the profile first`);
    }

    const prompt = buildClassificationPrompt(username, user.posts);
    const rawResult = await callOllama(prompt);
    const result = normalizeClassificationResult(rawResult);

    await prisma.dgwUserClassification.update({
      where: { id: jobId },
      data: {
        status: "COMPLETE",
        primaryType: result.primaryType,
        categories: result.categories,
        confidence: result.confidence,
        summary: result.summary,
        notes: result.notes,
        ollamaModel,
        rawResult,
        completedAt: new Date(),
        failedAt: null,
        error: null,
      },
    });
  } catch (error) {
    await prisma.dgwUserClassification.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        error: String(error).slice(0, 1000),
      },
    });
  }
}

async function callOllama(prompt: string): Promise<unknown> {
  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      format: "json",
      keep_alive: "30m",
      options: {
        temperature: 0.1,
        top_p: 0.8,
        num_ctx: 8192,
      },
      messages: [
        {
          role: "system",
          content:
            "You are a private internal classifier for Reddit creator/admin records. Return strict JSON only. Do not infer protected or private traits. Do not produce explicit prose; use short administrative labels.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json() as { message?: { content?: string } };
  const content = json.message?.content;
  if (!content) {
    throw new Error("Ollama returned no message content");
  }

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Ollama returned non-JSON content: ${content.slice(0, 500)}`);
    return JSON.parse(match[0]);
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizeUsername(username: string) {
  return username.trim().replace(/^u\//i, "");
}

const server = app.listen(port, () => {
  console.log(`RDGW model classifier worker listening on http://127.0.0.1:${port}`);
  console.log(`Using Ollama model: ${ollamaModel}`);
});

function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
