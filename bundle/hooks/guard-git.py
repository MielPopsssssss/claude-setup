#!/usr/bin/env python3
"""PreToolUse guard on Bash: stops the git/gh actions that rewrite history or
touch someone else's pull request.

Why a hook and not a memory: the rules below lived in memory files and held
only when Claude happened to re-read them. A hook holds every time.

- `git push --force` / `-f` / `--force-with-lease` / `+refspec`: always denied.
- `git reset --hard` on a branch with an upstream: denied.
- `git push`, `gh pr merge|edit|close|ready|review|comment` on a branch or PR
  opened by someone other than OWNER: denied, unless the command carries
  `ALLOW_OTHERS_PR=<number>` — Claude adds it only after the user named that
  PR and confirmed in the chat.

Fails open (exit 0) when gh or git cannot answer: a guard that blocks every
push when the network is down would be switched off within a day.
"""
import json
import os
import re
import shlex
import subprocess
import sys

# Set by scripts/claude-setup/setup.sh from `gh api user`. Empty = the
# "someone else's PR" rule is skipped (fail open), the history rules still hold.
OWNER = os.environ.get("CLAUDE_GUARD_OWNER", "")
SEP = re.compile(r"&&|\|\||;|\||\n")


def run(args, cwd):
    try:
        out = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=15)
        return out.stdout.strip() if out.returncode == 0 else None
    except Exception:
        return None


def segments(command):
    """Each simple command with the directory it runs in (follows `cd X &&`)."""
    cwd = None
    for raw in SEP.split(command):
        try:
            words = shlex.split(raw)
        except ValueError:
            words = raw.split()
        # drop leading VAR=value assignments, keep them visible to the caller
        env = {}
        while words and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0]):
            k, _, v = words.pop(0).partition("=")
            env[k] = v
        if not words:
            continue
        if words[0] == "cd" and len(words) > 1:
            cwd = os.path.expanduser(words[1])
            continue
        yield words, env, cwd


def git_args(words):
    """`git [-C dir] [-c k=v] sub ...` → (dir or None, [sub, ...])."""
    i, d = 1, None
    while i < len(words) and words[i].startswith("-"):
        if words[i] in ("-C", "-c") and i + 1 < len(words):
            if words[i] == "-C":
                d = os.path.expanduser(words[i + 1])
            i += 2
        else:
            i += 1
    return d, words[i:]


def is_force_push(sub):
    if not sub or sub[0] != "push":
        return False
    for w in sub[1:]:
        if w in ("-f", "--force") or w.startswith("--force-with-lease") or w.startswith("--force-if-includes"):
            return True
        if re.match(r"^-[a-zA-Z]*f[a-zA-Z]*$", w):
            return True
        if w.startswith("+") and len(w) > 1:
            return True
    return False


def push_branch(sub, cwd):
    """The remote branch a plain `git push` would update."""
    positional = [w for w in sub[1:] if not w.startswith("-")]
    if len(positional) >= 2:
        ref = positional[-1]
        dst = ref.split(":", 1)[1] if ":" in ref else ref
        if dst in ("HEAD", ""):
            return run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd)
        return dst.removeprefix("refs/heads/")
    up = run(["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd)
    if up and "/" in up:
        return up.split("/", 1)[1]
    return run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd)


def foreign_prs_for_branch(branch, cwd):
    out = run(["gh", "pr", "list", "--head", branch, "--state", "open", "--json", "number,author"], cwd)
    if not out:
        return []
    return [(p["number"], p["author"]["login"]) for p in json.loads(out) if OWNER and p["author"]["login"] != OWNER]


def foreign_pr(number, cwd):
    out = run(["gh", "pr", "view", str(number), "--json", "number,author"], cwd)
    if not out:
        return None
    login = json.loads(out)["author"]["login"]
    return None if not OWNER or login == OWNER else (int(number), login)


def check(command, session_cwd):
    """Return a deny reason, or None to let the command run."""
    if "git" not in command and "gh" not in command:
        return None
    allowed = set(re.findall(r"ALLOW_OTHERS_PR=(\d+)", command))
    for words, env, cwd in segments(command):
        cwd = cwd or session_cwd
        if words[0] == "git":
            d, sub = git_args(words)
            here = d or cwd
            if is_force_push(sub):
                return "Force push refusé (CLAUDE.md §0.9) : jamais de réécriture d'une branche partagée. Pousse un nouveau commit, ou fais-le toi-même si c'est vraiment voulu."
            if sub[:1] == ["reset"] and "--hard" in sub:
                if run(["git", "rev-parse", "--abbrev-ref", "@{u}"], here):
                    return "`git reset --hard` refusé sur une branche suivie (CLAUDE.md §0.9). Utilise un commit de revert ou une nouvelle branche."
            if sub[:1] == ["push"]:
                branch = push_branch(sub, here)
                if branch:
                    for n, login in foreign_prs_for_branch(branch, here):
                        if str(n) not in allowed:
                            return f"La branche `{branch}` porte la PR #{n} de `{login}`, pas de toi. Ne pas pousser sans que l'utilisateur nomme #{n} et confirme ; ensuite préfixer la commande par ALLOW_OTHERS_PR={n}."
        elif words[0] == "gh" and len(words) >= 3 and words[1] == "pr" and words[2] in ("merge", "edit", "close", "ready", "review", "comment"):
            nums = [w.lstrip("#") for w in words[3:] if re.fullmatch(r"#?\d+", w)]
            for n in nums:
                hit = foreign_pr(n, cwd)
                if hit and n not in allowed:
                    return f"La PR #{n} est de `{hit[1]}`, pas de toi. Ne rien faire dessus sans que l'utilisateur la nomme et confirme ; ensuite préfixer la commande par ALLOW_OTHERS_PR={n}."
    return None


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    if data.get("tool_name") != "Bash":
        return
    reason = check(data.get("tool_input", {}).get("command", ""), data.get("cwd"))
    if reason:
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }}))


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        assert is_force_push(["push", "-f"]) and is_force_push(["push", "origin", "+main"])
        assert is_force_push(["push", "--force-with-lease", "origin", "x"])
        assert not is_force_push(["push", "-u", "origin", "feature/x"])
        assert git_args(["git", "-C", "/tmp", "push"]) == ("/tmp", ["push"])
        segs = list(segments("cd /a && ALLOW_OTHERS_PR=3 git push origin HEAD:feat/x"))
        assert segs[0][0][:2] == ["git", "push"] and segs[0][2] == "/a" and segs[0][1] == {"ALLOW_OTHERS_PR": "3"}
        assert push_branch(["push", "origin", "HEAD:refs/heads/feat/x"], None) == "feat/x"
        assert check("ls -la", None) is None
        assert check("git push --force origin main", None)
        print("ok")
    else:
        main()
