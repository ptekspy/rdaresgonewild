import { prisma } from "@rdgw/database";
import path from "node:path";
import { importHtmlFile, type HtmlImportProgress } from "../html-importer.js";
import { loadEnvFiles } from "./env.js";

loadEnvFiles();

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((arg) => !arg.startsWith("--"));
  if (!filePath) {
    throw new Error(
      "Usage: pnpm --filter @rdgw/crawler scan:html <path-to-html> [--batch-size=100]"
    );
  }

  const batchSize = parseBatchSize(args);
  const resolvedPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), filePath);
  const startedAt = Date.now();
  const result = await importHtmlFile(resolvedPath, {
    batchSize,
    onProgress: (progress) => logProgress(progress, startedAt),
  });

  console.log(
    `[html-import] done: parsed ${result.postsParsed}, processed ${result.postsProcessed}, ` +
      `created ${result.completionsFound} completions ` +
      `(${result.playbookCompletionsFound} playbook, ${result.communityCompletionsFound} community)`
  );
}

function parseBatchSize(args: string[]) {
  const rawValue = args.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1];
  if (!rawValue) return undefined;

  const batchSize = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid --batch-size value: ${rawValue}`);
  }

  return batchSize;
}

function logProgress(progress: HtmlImportProgress, startedAt: number) {
  const elapsed = formatElapsed(Date.now() - startedAt);

  if (progress.phase === "reading") {
    console.log(`[html-import] reading ${progress.filePath}`);
    return;
  }

  if (progress.phase === "parsed") {
    console.log(
      `[html-import] parsed ${progress.postsParsed} posts; ` +
        `writing ${progress.totalBatches} batch(es) of up to ${progress.batchSize}`
    );
    return;
  }

  if (progress.phase === "batch") {
    const percent =
      progress.totalPosts > 0
        ? Math.round((progress.postsProcessed / progress.totalPosts) * 100)
        : 100;

    console.log(
      `[html-import] batch ${progress.batchNumber}/${progress.totalBatches} ` +
        `processed ${progress.batchPosts} posts; ` +
        `${progress.postsProcessed}/${progress.totalPosts} (${percent}%) total; ` +
        `+${progress.batchCompletionsFound} completions this batch, ` +
        `${progress.completionsFound} total ` +
        `(${progress.playbookCompletionsFound} playbook, ` +
        `${progress.communityCompletionsFound} community); ${elapsed}`
    );
    return;
  }

  if (progress.phase === "completed") {
    console.log(`[html-import] completed in ${elapsed}`);
  }
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, milliseconds / 1000);
  return `${seconds.toFixed(1)}s`;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
