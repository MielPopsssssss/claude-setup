#!/usr/bin/env python3
"""Open PRs of the current repo as stacks: parent → children, author, merge
state, checks. Backs the /prs command so the state is read in one call instead
of being rebuilt by hand with several gh queries."""
import json
import subprocess
import sys

FIELDS = "number,title,author,baseRefName,headRefName,mergeable,mergeStateStatus,isDraft,reviewDecision,statusCheckRollup"


def gh(*args):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=True).stdout


def checks(rollup):
    states = [(c.get("conclusion") or c.get("state") or c.get("status") or "").upper() for c in rollup or []]
    bad = sum(s in ("FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED") for s in states)
    wait = sum(s in ("", "PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED") for s in states)
    if not states:
        return "—"
    return f"✗{bad}" if bad else (f"…{wait}" if wait else "✓")


def main():
    me = gh("api", "user", "--jq", ".login").strip()
    prs = json.loads(gh("pr", "list", "--state", "open", "--limit", "200", "--json", FIELDS))
    by_head = {p["headRefName"]: p for p in prs}
    children = {}
    for p in prs:
        children.setdefault(p["baseRefName"], []).append(p)
    roots = [p for p in prs if p["baseRefName"] not in by_head]

    print(f"me={me} · {len(prs)} open PRs · ✓ checks green, ✗n failing, …n pending · mergeable = vs its own base\n")
    print("| PR | author | base | mergeable | state | checks | review | title |")
    print("|---|---|---|---|---|---|---|---|")

    def row(p, depth):
        who = p["author"]["login"]
        mine = "" if who == me else " ⚠"
        draft = " (draft)" if p["isDraft"] else ""
        indent = "　" * depth + ("└ " if depth else "")
        print(f"| {indent}#{p['number']} | {who}{mine} | `{p['baseRefName']}` | {p['mergeable']} | {p['mergeStateStatus']} | "
              f"{checks(p['statusCheckRollup'])} | {p['reviewDecision'] or '—'} | {p['title'][:70]}{draft} |")
        for c in sorted(children.get(p["headRefName"], []), key=lambda x: x["number"]):
            row(c, depth + 1)

    for p in sorted(roots, key=lambda x: -x["number"]):
        row(p, 0)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        sys.exit(f"gh failed: {e.stderr.strip()}")
