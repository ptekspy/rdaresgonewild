import { prisma } from "@rdgw/database";
import { BrowserRedditClient } from "../browser-reddit.js";
import { scanSubreddit } from "../scanner.js";
import { getCrawlerRpm, loadEnvFiles } from "./env.js";

loadEnvFiles();

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_ERROR_DELAY_MS = 60 * 1000;

let stopping = false;
let stopWait: (() => void) | undefined;

function getDelayMs(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms: number) {
  if (stopping) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      stopWait = undefined;
      resolve();
    }, ms);

    stopWait = () => {
      clearTimeout(timeout);
      stopWait = undefined;
      resolve();
    };
  });
}

function requestStop(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker:browser] received ${signal}; stopping after current wait/run`);
  stopWait?.();
}

process.once("SIGINT", requestStop);
process.once("SIGTERM", requestStop);

async function main() {
  const intervalMs = getDelayMs("CRAWLER_LOOP_INTERVAL_MS", DEFAULT_INTERVAL_MS);
  const errorDelayMs = getDelayMs("CRAWLER_LOOP_ERROR_DELAY_MS", DEFAULT_ERROR_DELAY_MS);
  const client = BrowserRedditClient.fromEnv(getCrawlerRpm());

  console.log(
    `[worker:browser] starting browser-backed scan loop; interval=${intervalMs}ms errorDelay=${errorDelayMs}ms`
  );

  try {
    while (!stopping) {
      try {
        await scanSubreddit(client);
        if (!stopping) {
          console.log(`[worker:browser] waiting ${intervalMs}ms before next scan`);
          await sleep(intervalMs);
        }
      } catch (err) {
        console.error("[worker:browser] scan failed", err);
        if (!stopping) {
          console.log(`[worker:browser] waiting ${errorDelayMs}ms before retry`);
          await sleep(errorDelayMs);
        }
      }
    }
  } finally {
    await client.close();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
