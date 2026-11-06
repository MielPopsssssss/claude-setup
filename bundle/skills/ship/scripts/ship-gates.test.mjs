// Run: node --test ~/.claude/skills/ship/scripts/ship-gates.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlannedNewFiles, undeclaredNewFiles, frozenViolations } from "./ship-gates.mjs";

test("parsePlannedNewFiles reads the first backticked path of every [nouveau] line", () => {
  const plan = [
    "- `src/hooks/useThing.ts` [nouveau] — fetches the thing",
    "- `api/src/routes/v2/things.ts` — adds a route (existing file)",
    "- [new] `db/migrations/20261106120000_things.sql` and `docs/x.md`",
    "- `./src/components/things/` [nouveau] — folder",
  ].join("\n");
  assert.deepEqual(
    [...parsePlannedNewFiles(plan)].sort(),
    ["db/migrations/20261106120000_things.sql", "src/components/things/", "src/hooks/useThing.ts"],
  );
});

test("undeclaredNewFiles exempts tests and task notes, and lets a declared folder cover its files", () => {
  const added = [
    "src/hooks/useThing.ts",
    "src/hooks/useThing.test.ts",
    ".ship/thing/plan.md",
    "src/components/things/Card.tsx",
    "src/components/Shadow.tsx",
  ];
  const planned = new Set(["src/hooks/useThing.ts", "src/components/things/"]);
  assert.deepEqual(undeclaredNewFiles(added, planned), ["src/components/Shadow.tsx"]);
});

test("frozenViolations flags a modified and a missing locked test, not an intact one", () => {
  const lock = { "a.test.ts": "h1", "b.test.ts": "h2", "c.test.ts": "h3" };
  assert.deepEqual(frozenViolations(lock, { "a.test.ts": "h1", "b.test.ts": "changed", "c.test.ts": null }), [
    { file: "b.test.ts", reason: "modified" },
    { file: "c.test.ts", reason: "missing" },
  ]);
});
