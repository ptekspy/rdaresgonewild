import fs from "node:fs";
import path from "node:path";

function parseEnv(contents: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const rawLine of contents.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    entries[key] = value;
  }
  return entries;
}

export function loadEnvFiles() {
  const repoRoot = findRepoRoot(process.cwd());
  const candidates = [
    path.join(repoRoot, "packages/database/.env"),
    path.join(repoRoot, "apps/web/.env.local"),
    path.join(repoRoot, "apps/admin/.env.local"),
    path.join(repoRoot, ".env.local"),
    path.join(repoRoot, ".env"),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const entries = parseEnv(fs.readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(entries)) {
      process.env[key] = value;
    }
  }
}

function findRepoRoot(start: string) {
  let current = start;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(start, "../..");
}

export function getCrawlerRpm() {
  const rpm = Number.parseInt(process.env.CRAWLER_RPM ?? "25", 10);
  return Number.isFinite(rpm) && rpm > 0 ? rpm : 25;
}
