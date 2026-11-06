#!/usr/bin/env bash
# Installs this Claude Code setup into the current user's ~/.claude.
# Idempotent; backs up everything it would overwrite. Guide: README.md.
#
#   ./setup.sh                 # install
#   ./setup.sh --dry-run       # show what would change
#   ./setup.sh --no-modes      # skip the caveman + ponytail plugins
#   ./setup.sh --extras        # also pstack, floorplan
#   ./setup.sh --no-plugins    # files and settings only (no plugin / MCP install)
#   ./setup.sh export          # (maintainer) refresh bundle/ from your own ~/.claude
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE="$HERE/bundle"
CLAUDE_HOME="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SKILLS="ship resolve-stack audit-whitebox prove-with-canary ui-craft"
AGENTS="ship-scout ship-plan-critic ship-test-auditor ship-security ship-pm"

DRY=0 MODES=1 EXTRAS=0 PLUGINS=1 CMD=install
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --no-modes) MODES=0 ;;
    --extras) EXTRAS=1 ;;
    --no-plugins) PLUGINS=0 ;;
    export) CMD=export ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
run()  { if [ "$DRY" = 1 ]; then printf '  (dry-run) %s\n' "$*"; else "$@"; fi; }

# ── export: maintainer refreshes the bundle from his own ~/.claude ─────────────
if [ "$CMD" = export ]; then
  for s in $SKILLS; do rm -rf "$BUNDLE/skills/$s"; cp -R "$CLAUDE_HOME/skills/$s" "$BUNDLE/skills/"; done
  rm -rf "$BUNDLE/skills/ship/repos"  # repo profiles are private team data, never published from here
  for a in $AGENTS; do cp "$CLAUDE_HOME/agents/$a.md" "$BUNDLE/agents/"; done
  cp "$CLAUDE_HOME/commands/prs.md" "$BUNDLE/commands/"
  cp "$CLAUDE_HOME/scripts/prs.py" "$BUNDLE/scripts/"
  find "$BUNDLE" -name .DS_Store -delete
  warn "guard-git.py not exported: the bundled copy is the generic one (owner from env). Port changes by hand."
  if grep -rn "/Users/\|/home/" "$BUNDLE" >/dev/null; then
    warn "a personal absolute path is in the bundle — fix before committing:"; grep -rn "/Users/\|/home/" "$BUNDLE"; exit 1
  fi
  ok "bundle refreshed — review with git diff, then commit"
  exit 0
fi

# ── 1. prerequisites ───────────────────────────────────────────────────────────
say "1/7 Prérequis"
missing=0
for bin in claude git gh node python3; do
  if command -v "$bin" >/dev/null; then ok "$bin"; else warn "$bin manquant"; missing=1; fi
done
[ "$missing" = 0 ] || { echo "Installe ce qui manque puis relance." >&2; exit 1; }
LOGIN="$(gh api user --jq .login 2>/dev/null || true)"
if [ -n "$LOGIN" ]; then ok "gh connecté en $LOGIN"; else warn "gh non connecté (gh auth login) — la garde « PR d'un autre » restera inactive"; fi

# ── 2. backup ──────────────────────────────────────────────────────────────────
say "2/7 Sauvegarde"
BACKUP="$CLAUDE_HOME/backups/claude-setup-$(date +%Y%m%d-%H%M%S)"
run mkdir -p "$BACKUP/skills" "$BACKUP/agents" "$CLAUDE_HOME/agents" "$CLAUDE_HOME/skills" "$CLAUDE_HOME/commands" "$CLAUDE_HOME/scripts" "$CLAUDE_HOME/hooks"
for f in settings.json CLAUDE.md commands/prs.md scripts/prs.py hooks/guard-git.py; do
  if [ -e "$CLAUDE_HOME/$f" ]; then run mkdir -p "$BACKUP/$(dirname "$f")"; run cp "$CLAUDE_HOME/$f" "$BACKUP/$f"; fi
done
for s in $SKILLS; do [ -e "$CLAUDE_HOME/skills/$s" ] && run cp -R "$CLAUDE_HOME/skills/$s" "$BACKUP/skills/"; done
for a in $AGENTS; do [ -e "$CLAUDE_HOME/agents/$a.md" ] && run cp "$CLAUDE_HOME/agents/$a.md" "$BACKUP/agents/"; done
ok "copie de ce qui sera remplacé → $BACKUP"

# ── 3. skills, commands, scripts, hook ─────────────────────────────────────────
say "3/7 Skills, agents, commandes, hook"
for s in $SKILLS; do
  run rm -rf "$CLAUDE_HOME/skills/$s"; run cp -R "$BUNDLE/skills/$s" "$CLAUDE_HOME/skills/$s"; ok "skill $s"
done
for a in $AGENTS; do run cp "$BUNDLE/agents/$a.md" "$CLAUDE_HOME/agents/$a.md"; done; ok "agents $AGENTS"
run cp "$BUNDLE/commands/prs.md" "$CLAUDE_HOME/commands/prs.md"
run cp "$BUNDLE/scripts/prs.py" "$CLAUDE_HOME/scripts/prs.py"; ok "commande /prs"
run cp "$BUNDLE/hooks/guard-git.py" "$CLAUDE_HOME/hooks/guard-git.py"; ok "hook guard-git"

# ── 4. settings.json ───────────────────────────────────────────────────────────
say "4/7 settings.json"
args=("$CLAUDE_HOME/settings.json" "$LOGIN"); [ "$DRY" = 1 ] && args+=(--dry-run)
python3 "$HERE/settings_merge.py" "${args[@]}"

# ── 5. global CLAUDE.md (managed block) ────────────────────────────────────────
say "5/7 CLAUDE.md global"
START="<!-- claude-setup:start -->"; END="<!-- claude-setup:end -->"
block="$(printf '%s\n' "$START"; cat "$HERE/global-claude.md.tmpl"; printf '%s\n' "$END")"
if [ "$DRY" = 1 ]; then
  echo "  (dry-run) bloc géré écrit entre les marqueurs claude-setup"
else
  touch "$CLAUDE_HOME/CLAUDE.md"
  python3 -I - "$CLAUDE_HOME/CLAUDE.md" "$START" "$END" "$block" <<'EOF'
import re, sys
path, start, end, block = sys.argv[1:5]
s = open(path).read()
pat = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
s = pat.sub(lambda _: block, s) if pat.search(s) else (s.rstrip() + "\n\n" + block + "\n").lstrip()
open(path, "w").write(s)
EOF
  ok "bloc géré à jour (ton contenu hors marqueurs est intact)"
fi

# ── 6. plugins + MCP ───────────────────────────────────────────────────────────
say "6/7 Plugins et MCP"
if [ "$PLUGINS" = 1 ]; then
add_mkt() { claude plugin marketplace list 2>/dev/null | grep -q "$2" || run claude plugin marketplace add "$1" >/dev/null && ok "marketplace $2"; }
install() { if claude plugin list 2>/dev/null | grep -q "$1"; then ok "plugin $1 (déjà là)"; else run claude plugin install "$1" && ok "plugin $1"; fi; }
add_mkt anthropics/claude-plugins-official claude-plugins-official
install superpowers@anthropic-plugin-directory
install ralph-loop@anthropic-plugin-directory
install frontend-design@claude-plugins-official
if [ "$MODES" = 1 ]; then
  add_mkt DietrichGebert/ponytail ponytail; install ponytail@ponytail
  add_mkt JuliusBrussee/caveman caveman;   install caveman@caveman
fi
if [ "$EXTRAS" = 1 ]; then
  add_mkt cursor/plugins cursor-plugins;            install pstack@cursor-plugins
  add_mkt haydenschmitty/floorplan floorplan;       install floorplan@floorplan
fi
claude plugin marketplace list 2>/dev/null | grep -q '❯ claude-setup$' || run claude plugin marketplace add "$HERE" >/dev/null
ok "marketplace claude-setup (ce dossier)"
install ship-monitor@claude-setup
if claude mcp list 2>/dev/null | grep -q '^playwright:'; then ok "MCP playwright (déjà là)"
else run claude mcp add --scope user playwright -- npx -y @playwright/mcp@0.0.83 --isolated && ok "MCP playwright"; fi
else warn "plugins et MCP sautés (--no-plugins)"; fi

# ── 7. repo-level dependencies ─────────────────────────────────────────────────
say "7/7 Vérification"
GUARD="$CLAUDE_HOME/hooks/guard-git.py"; [ "$DRY" = 1 ] && GUARD="$BUNDLE/hooks/guard-git.py"
python3 "$GUARD" --self-test >/dev/null 2>&1 && ok "guard-git --self-test" || warn "guard-git --self-test a échoué"

echo
say "Terminé. Redémarre Claude Code, puis lis README.md (5 min)."
[ "$DRY" = 1 ] && echo "(dry-run : rien n'a été modifié)"
exit 0
