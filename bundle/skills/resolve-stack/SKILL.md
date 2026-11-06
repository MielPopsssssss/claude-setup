---
name: resolve-stack
description: Résout un conflit de merge sur une PR, empilée ou non, sans casser les PRs qui en dépendent — merge de la base dans la branche (jamais de rebase ni de force push), vérification que chaque PR enfant fusionne encore, tests ciblés, puis push après confirmation. Utiliser quand l'utilisateur dit « il y a un conflit sur la PR N », « resolve la PR N », « fais passer la stack », ou quand /prs montre une PR en CONFLICTING.
---

# resolve-stack

Résoudre le conflit d'une PR **sans réécrire l'historique** et en prouvant que la
pile au-dessus d'elle fusionne toujours.

## 0. Qui possède la PR

```bash
gh pr view <N> --json author,baseRefName,headRefName,mergeStateStatus
```

Si `author.login` n'est pas l'utilisateur, prépare la résolution en local mais
**ne pousse qu'après une confirmation explicite dans le chat**, puis préfixe
le push par `ALLOW_OTHERS_PR=<N>` (le hook `guard-git.py` le refuse sinon).
Dis-le dès le début de la réponse.

## 1. Worktree jetable

Ne touche jamais au worktree courant : une autre session peut l'utiliser.

```bash
ROOT=$(git rev-parse --path-format=absolute --git-common-dir)/..
WT=$ROOT/.claude/worktrees/resolve-<N>
git fetch -q origin <base> <head>
git worktree add -q -B resolve/<N> "$WT" origin/<head>
```

Pour `node_modules`, fais un lien vers un worktree récent du même repo, et
signale que les versions peuvent avoir un peu de retard.

## 2. Merge, pas rebase

```bash
git -C "$WT" merge --no-ff --no-commit origin/<base>
git -C "$WT" diff --name-only --diff-filter=U
```

Un rebase réécrit des commits que les PRs enfants contiennent déjà, et il
exige un force push : interdit.

**Pour chaque conflit, lis les deux côtés et l'intention des deux PRs**
(`git log origin/<head>..origin/<base>` pour savoir ce qui est arrivé sur la
base). Par défaut, garde les deux intentions. Ne choisis un côté que si
l'autre est mort, et dis lequel dans le message de commit.

**Fichiers fusionnés « proprement »** : vérifie `git check-attr merge` sur les
docs et les locales. Avec un driver `union`, recalcule-les avec
`git merge-file -p ours base theirs`. Un `union` concatène les deux côtés
sans signaler de conflit (JSON invalide, paragraphes en double).

## 3. Vérifier

- Pas de marqueurs : `grep -rn '^<<<<<<<\|^>>>>>>>' <fichiers>`.
- JSON valide pour chaque locale touchée.
- Le typecheck et les tests **de la surface touchée** (pas toute la suite),
  plus le lint de copie si le repo en a un.

## 4. Les PRs enfants

Liste les PRs dont la base est la branche résolue, récursivement (`/prs` les
affiche indentées). Pour chacune, fais un merge d'essai sur une tête
détachée, en enchaînant de parent en enfant :

```bash
git switch -q --detach origin/<child>
git merge -q --no-ff --no-edit <parent résolu> && echo clean || { git diff --name-only --diff-filter=U; git merge --abort; }
```

Puis rejoue la vérification `merge-file` sur leurs docs et locales, contre la
branche résolue. Un enfant en conflit : rapporte le fichier et arrête-toi.
Ne le résous pas sans qu'on te le demande.

## 5. Commit, puis confirmation

Message de commit : `chore(<scope>): merge <base> into <head>`. Le corps
indique quel conflit, quelle PR l'a causé, et ce qui a été gardé de chaque
côté.

**Ne pousse pas encore.** Rapporte en quelques lignes :
- la PR qui a causé le conflit, et ce qui a été gardé de chaque côté ;
- les vérifications passées, en chiffres ;
- l'état de chaque enfant ;
- la commande exacte de push, `git push origin HEAD:<head>`, sans force.

Rappelle que le commit de merge impose un **squash** au merge de la PR quand
la base exige un historique linéaire.

Pousse après le « oui ». Ensuite, supprime le worktree :
`git worktree remove "$WT"` et `git branch -D resolve/<N>`.
