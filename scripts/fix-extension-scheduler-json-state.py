from pathlib import Path

path = Path('apps/api/lib/extension-scheduler.ts')
if not path.exists():
    raise SystemExit(f'Could not find {path}. Run from the repo root or pass the correct RepoPath to the installer.')

text = path.read_text(encoding='utf-8')

text = text.replace(
    'import { prisma, type BrowserCrawlJob } from "@rdgw/database";',
    'import { Prisma, prisma, type BrowserCrawlJob } from "@rdgw/database";',
)

# Patch every known BrowserCrawlJob.state write to use a Prisma JSON-safe cleaned object.
replacements = {
    'state: nextState': 'state: toJsonState(nextState)',
    'state: resetRunState(completedState)': 'state: toJsonState(resetRunState(completedState))',
    'state: definition.state': 'state: toJsonState(definition.state)',
    'state: mergeStableState(getExtensionState(existing), definition.state)': 'state: toJsonState(mergeStableState(getExtensionState(existing), definition.state))',
    'lastError: null,\n      state,': 'lastError: null,\n      state: toJsonState(state),',
}

for old, new in replacements.items():
    text = text.replace(old, new)

helper = '''
function toJsonState(state: ExtensionJobState): Prisma.InputJsonObject {
  const clean = (value: unknown): Prisma.InputJsonValue | undefined => {
    if (value === undefined) return undefined;

    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => clean(item))
        .filter((item): item is Prisma.InputJsonValue => item !== undefined);
    }

    if (typeof value === "object") {
      const output: Record<string, Prisma.InputJsonValue> = {};

      for (const [key, childValue] of Object.entries(value)) {
        const cleaned = clean(childValue);
        if (cleaned !== undefined) output[key] = cleaned;
      }

      return output as Prisma.InputJsonObject;
    }

    return String(value);
  };

  return clean(state) as Prisma.InputJsonObject;
}

'''

if 'function toJsonState(state: ExtensionJobState)' not in text:
    marker = 'function readListingFromBody(body: unknown): RedditListing {'
    if marker not in text:
        marker = 'function readObject(value: unknown): Record<string, unknown> {'
    if marker not in text:
        raise SystemExit('Could not find a safe insertion point for toJsonState helper')
    text = text.replace(marker, helper + marker)

path.write_text(text, encoding='utf-8')
print('Patched apps/api/lib/extension-scheduler.ts for Prisma JSON state writes')
