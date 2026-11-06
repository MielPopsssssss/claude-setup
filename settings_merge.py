#!/usr/bin/env python3
"""Merge the claude-setup settings into ~/.claude/settings.json without
removing anything the user already has.

Adds, when missing:
  - the PreToolUse Bash hook that runs ~/.claude/hooks/guard-git.py;
  - env CLAUDE_GUARD_OWNER = the user's GitHub login (the guard's notion of "my PR").

Usage: settings_merge.py <settings.json> <github-login> [--dry-run]
"""
import json
import os
import sys

GUARD_CMD = 'python3 "$HOME/.claude/hooks/guard-git.py"'


def merge(settings, login):
    """Return (new_settings, list of human-readable changes). Pure: no I/O."""
    s = json.loads(json.dumps(settings))  # deep copy
    changes = []

    pre = s.setdefault("hooks", {}).setdefault("PreToolUse", [])
    has_guard = any(
        GUARD_CMD in h.get("command", "") or "guard-git.py" in h.get("command", "")
        for entry in pre
        for h in entry.get("hooks", [])
    )
    if not has_guard:
        pre.append({"matcher": "Bash", "hooks": [{"type": "command", "command": GUARD_CMD}]})
        changes.append("hook PreToolUse Bash → guard-git.py")

    env = s.setdefault("env", {})
    if login and env.get("CLAUDE_GUARD_OWNER") != login:
        env["CLAUDE_GUARD_OWNER"] = login
        changes.append(f"env CLAUDE_GUARD_OWNER={login}")

    return s, changes


def main(argv):
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    path, login, dry = argv[0], argv[1], "--dry-run" in argv
    current = json.load(open(path)) if os.path.exists(path) else {}
    new, changes = merge(current, login)
    if not changes:
        print("  settings.json: already up to date")
        return 0
    for c in changes:
        print(f"  settings.json: + {c}")
    if not dry:
        with open(path, "w") as f:
            json.dump(new, f, indent=2, ensure_ascii=False)
            f.write("\n")
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        base = {"hooks": {"PreToolUse": [{"matcher": "", "hooks": [{"type": "command", "command": "x"}]}]}, "theme": "dark"}
        once, c1 = merge(base, "alice")
        twice, c2 = merge(once, "alice")
        assert len(c1) == 2 and c2 == [], (c1, c2)
        assert once["theme"] == "dark" and len(once["hooks"]["PreToolUse"]) == 2
        assert base["hooks"]["PreToolUse"][0]["hooks"][0]["command"] == "x"  # input untouched
        print("ok")
        sys.exit(0)
    sys.exit(main(sys.argv[1:]))
