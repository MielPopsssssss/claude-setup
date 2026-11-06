#!/usr/bin/env node
/**
 * Mechanical gates of the /ship pipeline (~/.claude/skills/ship).
 *
 * Two promises the pipeline makes cannot be left to an agent's good faith,
 * because the agent that writes the code is the one that would break them:
 *
 *  - the acceptance tests written BEFORE the code are frozen: the implementer
 *    makes them pass, it never edits them (`freeze` / `check-frozen`). New test
 *    files may be added; a locked one that changes or disappears fails.
 *  - the change lands in the existing codebase: every file the branch ADDS must
 *    have been declared `[nouveau]` in the validated plan (`check-new-files`).
 *    An undeclared component is how a parallel implementation sneaks in.
 *
 * State lives in the task folder (`<worktree>/.ship/<slug>/`, excluded from git): `plan.md` and
 * `tests.lock`. Usage:
 *
 *   node ~/.claude/skills/ship/scripts/ship-gates.mjs freeze <task-dir> <test-file>...
 *   node ~/.claude/skills/ship/scripts/ship-gates.mjs check-frozen <task-dir>
 *   node ~/.claude/skills/ship/scripts/ship-gates.mjs check-new-files <task-dir> [base=origin/main]
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Files the plan never has to declare: tests are governed by the lock, task notes are scaffolding. */
const EXEMPT = [/\.test\.[cm]?[jt]sx?$/, /\.spec\.[cm]?[jt]sx?$/, /^\.ship\//, /__snapshots__\//];

/** Paths the plan declares as new: a line carrying `[nouveau]` (or `[new]`), first backticked path on it. */
export function parsePlannedNewFiles(planMd) {
  const out = new Set();
  for (const line of planMd.split("\n")) {
    if (!/\[(nouveau|new)\]/i.test(line)) continue;
    const m = line.match(/`([^`\s]+)`/);
    if (m) out.add(m[1].replace(/^\.\//, ""));
  }
  return out;
}

/** Added files that are neither exempt nor declared. A declared directory (`foo/`) covers its contents. */
export function undeclaredNewFiles(added, planned) {
  const dirs = [...planned].filter((p) => p.endsWith("/"));
  return added.filter(
    (f) => !EXEMPT.some((re) => re.test(f)) && !planned.has(f) && !dirs.some((d) => f.startsWith(d)),
  );
}

/** Locked files that changed or vanished, given their current hashes (null = missing). */
export function frozenViolations(lock, currentHashes) {
  return Object.keys(lock)
    .filter((f) => currentHashes[f] !== lock[f])
    .map((f) => ({ file: f, reason: currentHashes[f] == null ? "missing" : "modified" }));
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const hashOrNull = (path) => (existsSync(path) ? sha256(path) : null);

function main([cmd, taskDir, ...rest]) {
  if (!cmd || !taskDir) {
    console.error("usage: ship-gates.mjs <freeze|check-frozen|check-new-files> <task-dir> [...]");
    return 2;
  }
  const lockPath = join(taskDir, "tests.lock");

  if (cmd === "freeze") {
    if (rest.length === 0) {
      console.error("freeze: name at least one test file");
      return 2;
    }
    const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : {};
    for (const f of rest) {
      if (!existsSync(f)) {
        console.error(`freeze: ${f} does not exist`);
        return 2;
      }
      lock[f] = sha256(f);
    }
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
    console.log(`frozen ${rest.length} file(s) → ${lockPath} (${Object.keys(lock).length} total)`);
    return 0;
  }

  if (cmd === "check-frozen") {
    if (!existsSync(lockPath)) {
      console.error(`check-frozen: no ${lockPath} — run freeze after writing the acceptance tests`);
      return 1;
    }
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const bad = frozenViolations(lock, Object.fromEntries(Object.keys(lock).map((f) => [f, hashOrNull(f)])));
    if (bad.length === 0) {
      console.log(`frozen tests intact (${Object.keys(lock).length})`);
      return 0;
    }
    for (const b of bad) console.error(`✗ ${b.file} — ${b.reason}`);
    console.error("A frozen acceptance test changed. Revert it, or go back to the plan and re-freeze with Gus's OK.");
    return 1;
  }

  if (cmd === "check-new-files") {
    const base = rest[0] ?? "origin/main";
    const planPath = join(taskDir, "plan.md");
    if (!existsSync(planPath)) {
      console.error(`check-new-files: no ${planPath}`);
      return 1;
    }
    const added = execFileSync("git", ["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const bad = undeclaredNewFiles(added, parsePlannedNewFiles(readFileSync(planPath, "utf8")));
    if (bad.length === 0) {
      console.log(`new files all declared in the plan (${added.length} added)`);
      return 0;
    }
    for (const f of bad) console.error(`✗ ${f} — added but not declared [nouveau] in plan.md`);
    console.error("Reuse what exists, or justify the file in the plan and get it re-validated.");
    return 1;
  }

  console.error(`unknown command: ${cmd}`);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main(process.argv.slice(2)));
}
