---
description: État des PRs ouvertes du repo courant, en piles parent → enfants, avec ce qui est mergeable et ce qui bloque
allowed-tools: Bash(python3:*), Bash(gh pr view:*), Bash(gh pr checks:*)
---

État brut (une ligne par PR, enfants indentés sous leur parent ; ⚠ = PR de quelqu'un d'autre) :

!`python3 "$HOME/.claude/scripts/prs.py"`

À partir de ce tableau, réponds en trois blocs courts :

1. **Mergeable maintenant** : mes PRs (sans ⚠) dont la base est la branche par défaut, `MERGEABLE`, checks ✓ et pas de `CHANGES_REQUESTED`. Pour une pile, seulement la racine, et l'ordre de merge.
2. **Bloqué** : chaque PR en `CONFLICTING`, en checks ✗ ou en changements demandés, avec la cause en une ligne. Pour un échec de checks, lance `gh pr checks <n>` pour nommer le job.
3. **Pas à moi** : les PRs ⚠, en lecture seule. Ne propose aucune action dessus, sauf si l'utilisateur la nomme.

Ne merge, ne pousse et ne commente rien : cette commande ne fait que lire. $ARGUMENTS
