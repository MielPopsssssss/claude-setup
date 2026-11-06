---
name: ship
description: Prend une issue GitHub ou une demande en une phrase de bout en bout, dans n'importe quel repo — tri par taille et risque, inventaire de l'existant, plan critiqué par un agent indépendant, questions groupées, validation du plan, tests d'acceptation rouges et figés, autopilote jusqu'au vert, vérification réelle, revues sécurité + produit + code en parallèle, une passe de correctifs, porte complète du repo, PR. S'adapte à la personne (profil perso) et au repo (profil de repo). Utiliser quand on dit « prends l'issue N », « ship cette issue », « implémente X proprement », ou /ship.
---

# /ship — de la demande à la PR, adapté à toi et à ton repo

Un seul appel : la personne lance `/ship` et rien d'autre. C'est toi qui
appelles les agents (`Agent` : `ship-scout`, `ship-plan-critic`,
`ship-test-auditor`, `ship-security`, `ship-pm`), les skills (`Skill`) et les
scripts, au moment où le pipeline le dit. Ne lui demande jamais de lancer une
commande à ta place.

**Arguments** : `/ship 1234` · `/ship <url d'issue>` · `/ship "<demande>"` ·
`/ship --resume [slug]` · `/ship --profile` (revoir son profil perso) ·
`/ship --repo-profile` (régénérer le profil du repo courant).

```
0  profils : la personne (~/.claude/ship-profile.md) et le repo (.ship/repo.md)
1  demande + tri (S/M/L, risques)          → choisit les étapes
2  contexte + ship-scout                   → ce qui existe déjà
3  plan ⇄ ship-plan-critic (≤ 2 passes)    → questions groupées
4  ✋ la personne valide le plan
4b autopilote ralph-loop jusqu'à la PR (selon le profil)
5  branche dans son propre worktree
6  tests d'acceptation rouges ⇄ ship-test-auditor (≤ 2) → figés
7  code : le cœur, puis les bords
8  vérification : tests verts · tests intacts · fichiers créés = plan · vérif réelle
9  revues en parallèle : ship-security ∥ ship-pm ∥ code-review
10 une passe de correctifs + tests de dernière minute
11 obligations du repo + porte complète
12 PR · 13 --resume
```

**Deux sortes de boucles.** Jugement d'un agent (critique, audit des tests,
revues) : deux passes au plus, puis les points restants remontent à la personne
avec ta reco — un critique trouve toujours quelque chose. Oracle objectif (les
tests figés, phases 7-8) : on boucle jusqu'au vert, parce que le juge ne peut
pas être contenté à tort — tests audités, figés, et `check-frozen` interdit de
les réécrire. Plafond d'itérations et détection d'enlisement quand même.

---

## Phase 0 — Les deux profils

### Le profil de la personne — `~/.claude/ship-profile.md`

Lis-le. **S'il n'existe pas** (premier `/ship` de cette personne), ou sur
`/ship --profile` : crée-le à partir de
`~/.claude/skills/ship/profile-template.md`. Remplis toi-même ce qui se
devine (`gh api user --jq .login`, `git config user.name`, les repos où elle
travaille d'après `ls` de son dossier de code), puis pose **une seule salve**
`AskUserQuestion` sur le reste : son rôle, l'autopilote, la revue produit, à
qui remonter un arbitrage produit. Écris le fichier, montre-le en 10 lignes,
et continue la demande en cours.

Ce profil règle ensuite tout le pipeline : à qui tu poses les questions
(« la personne » ci-dessous), la langue des échanges, si l'autopilote démarre
seul, si `ship-pm` tourne, le niveau d'effort par défaut, et ses conventions
perso, qui s'ajoutent aux règles du repo sans jamais les contredire.

### Le profil du repo — `.ship/repo.md`

`.ship/` vit à la racine du checkout principal
(`MAIN="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"`),
exclu de git en local. Assure l'exclusion, qui vaut pour tous les worktrees :

```bash
EX="$(git rev-parse --git-common-dir)/info/exclude"
grep -qx '.ship/' "$EX" || echo '.ship/' >> "$EX"
grep -qx '.claude/ralph-loop.local.md' "$EX" || echo '.claude/ralph-loop.local.md' >> "$EX"
```

Puis lis `$MAIN/.ship/repo.md`. Il manque, ou son empreinte ne correspond plus
(`shasum` des fichiers sources qu'il cite), ou `/ship --repo-profile` :
**régénère-le**.

1. **Repo connu** : si `~/.claude/skills/ship/repos/<nom-du-repo>.md` existe
   (nom = dernier segment de `git remote get-url origin`, sans `.git`),
   c'est la base. Complète-la avec ce que le repo dit de plus récent.
2. **Repo inconnu** : déduis-le. Lis `CLAUDE.md`, `AGENTS.md`, `README*`,
   `CONTRIBUTING*`, le manifeste (`package.json`, `pyproject.toml`,
   `Cargo.toml`, `go.mod`, `Makefile`), `.github/workflows/*`,
   `.github/pull_request_template.md`, et la structure des tests existants.

Le profil de repo répond, en une page, à :
- **Stack et forme** : langages, dossiers principaux, où vivent les tests.
- **Commandes** : test ciblé (un fichier), suite complète, lint, typecheck,
  porte complète avant push (ex. `npm run preflight`, `make check`,
  `pytest && ruff check`).
- **Écrire un test** : le skill du repo s'il en a un (ex. `write-tests`), sinon
  le framework et un fichier de test existant à imiter.
- **Vérifier en vrai** : skill de vérification au navigateur du repo s'il en a un, commande
  pour lancer l'app, ou « tests seulement » pour une librairie.
- **Obligations** : doc à mettre à jour, conventions de commit et de titre de
  PR, base des PR, fichiers générés à régénérer, relecteurs à tagger selon la
  zone.
- **Zones protégées** : ce qu'on ne touche pas sans accord explicite.
- **Risques propres** : les cases de tri qui ont un sens ici (ex. `contrat
  d'API publique`, `migration`).
- **Sources** : les fichiers lus et leur empreinte (`shasum -a 256`).

Montre-le à la personne **la première fois** pour ce repo (10 lignes), et
corrige ce qu'elle rectifie. Ensuite, il sert sans redemander.

**Garde-fous qui valent partout**, quel que soit le profil : jamais de push
direct sur la branche par défaut, jamais de force push, jamais de secret en
dur ni de lecture de `.env*` sans demande, jamais toucher un autre repo que
celui de la tâche (le débordement s'écrit dans le plan et dans la PR). Issue
fermée → demande. Label `blocked` → dis-le et demande.

## L'état de la tâche — `$MAIN/.ship/<slug>/`

| Fichier | Contenu | Écrit en |
|---|---|---|
| `state.md` | taille, risques, étapes choisies, une ligne par étape franchie, signatures d'échec, chemins des captures, `DONE — <url>` ou `BLOCKED — <raison>` | toutes |
| `plan.md` | plan validé : critères `A1…An`, fichiers (`[nouveau]` marqué), modèle de menace, obligations | 3-4 |
| `tests.md` | matrice critère → test → niveau, plus les scénarios de vérification réelle | 6 |
| `tests.lock` | empreintes des tests d'acceptation figés | 6, 10 |

**Format de `state.md`** — le panneau `ship-monitor` le lit pour dessiner
l'avancement ; tiens-le exactement, une ligne par étape, dans l'ordre :

```
# <slug>
taille: M
risques: UI visible, données/permissions
- [x] 0 profils — <date>
- [x] 1 tri — M
- [-] 2 inventaire — sauté (S, aucun fichier créé)
- [x] 3 plan — PASS (2e passe)
- [x] 4 plan validé — <date>
échec: <fichier › test : message>        (phase 7-8, une ligne par itération rouge)
DONE — <url de la PR>                    (ou : BLOCKED — <raison>)
```

Identifiants d'étape : `0 1 2 3 4 4b 5 6 7 8 9 10 11 12`. `[x]` = franchie,
`[-]` = sautée par le tri ; l'étape en cours est la première ni franchie ni
sautée.

Rien de tout ça n'entre dans le repo. Le plan validé est recopié dans le corps
de la PR. Une fois la PR mergée, `.ship/<slug>/` peut être supprimé.

Les deux règles mécaniques sont dans `~/.claude/skills/ship/scripts/ship-gates.mjs`
(`freeze`, `check-frozen`, `check-new-files`), indépendant du langage du repo.

## Phase 1 — La demande, puis le tri

Issue : `gh issue view <N> --json number,title,body,labels,comments,state`.
Texte libre : la phrase est la demande, pas de `Closes #N`.

Extrais sans paraphraser ce qui est demandé (le comportement, pas la solution
proposée), les critères d'acceptation, ce que les commentaires ont tranché.

**Trie**, et écris le tri dans `state.md` :
- **Taille** — `S` : un ou deux fichiers, pas de nouvelle surface. `M` :
  plusieurs fichiers d'une surface. `L` : nouvelle surface, changement de
  schéma, ou plusieurs couches.
- **Risques** : `auth` · `données/permissions` · `schéma` · `paiement` ·
  `secrets` · `UI visible` · `appel sortant` · `contrat externe`, plus les
  risques propres du profil de repo.

| Étape | S sans risque | M | L, ou un risque coché |
|---|---|---|---|
| `ship-scout` | si un fichier est créé | ✅ | ✅ |
| `ship-plan-critic` | — (plan de 5 lignes) | 1 passe | jusqu'à 2 |
| `ship-test-auditor` | — | ✅ | ✅ |
| vérification réelle | si `UI visible` | si UI ou point d'entrée | ✅ |
| `ship-security` | si un risque | si un risque | ✅ |
| `ship-pm` | selon le profil perso | si `UI visible` (selon le profil) | idem |
| code-review | `medium` | `medium` | `high` |

Un changement de doc pure : plan de 3 lignes, relecture factuelle (chaque
chemin, nom, commande vérifié dans le repo), PR.

## Phase 2 — Contexte et inventaire de l'existant

En parallèle :
1. **`ship-scout`** (Agent) avec le besoin en deux phrases **et le chemin de
   `.ship/repo.md`** : il rend ce qui existe déjà et comment l'étendre.
2. Toi : les règles du repo que la demande touche, la doc de la surface, le
   code concerné et ses tests, `git log --oneline -15 -- <chemins>`.
3. Ce qui existe peut-être ailleurs : `gh pr list --state all --search
   "<mots-clés>"` et les branches des autres worktrees.

## Phase 3 — Le plan, critiqué avant d'être montré

Écris `plan.md` :
- **Ce que ça change** — 2-3 phrases de comportement observable.
- **Critères d'acceptation** — `A1…An`, chacun vérifiable par un test qui
  échoue aujourd'hui.
- **Fichiers** — un par ligne, en backticks. Un fichier créé porte
  `[nouveau]` et la raison pour laquelle l'existant listé par `ship-scout` ne
  convient pas (un fichier de schéma ou de migration aussi). Les tests ne se
  listent pas ici.
- **Modèle de menace** (si un risque est coché) — qui a le droit, d'où vient
  l'identité, ce qui est validé à l'entrée, ce qui ne doit jamais sortir.
- **Obligations** — celles du profil de repo qui s'appliquent.
- **Hors périmètre**, **risques**, et **décisions prises par défaut** (avec la
  raison, pour que la personne puisse les contester).

Puis **`ship-plan-critic`** (Agent) avec la demande, `plan.md`, la sortie de
`ship-scout` et le chemin de `.ship/repo.md` — **pas ton raisonnement**.
`REVISE` → corrige et relance, dans la limite du tri.

**Questions** : les tiennes et celles du critique, en **une seule salve**
`AskUserQuestion` (1 à 4), chacune avec ta recommandation en premier. Légitime
seulement si deux réponses mènent à du code différent et que le repo ne
tranche pas. Un arbitrage produit que la personne ne peut pas trancher seule
se note pour la personne désignée dans son profil (« arbitre produit »), dans
la PR.

## Phase 4 — ✋ Validation du plan

Montre le plan dans la conversation, avec le verdict du critique et ce que tu
as écarté de ses remarques. **Attends.** Correction → plan corrigé, pas de
code. Validé → `state.md` : `- [x] 4 plan validé — <date>`.

## Phase 4 bis — L'autopilote

Selon le profil perso (`autopilote: toujours | demander | jamais`) et pour une
taille M ou L, une fois la branche créée (phase 5) pour que le fichier d'état
atterrisse dans le bon worktree :

```
Skill(ralph-loop:ralph-loop,
  args: "/ship --resume <slug> --max-iterations <15 pour M, 25 pour L> --completion-promise 'SHIP STOPPED'")
```

À chaque arrêt, `ralph-loop` relance `/ship --resume <slug>`. Tu n'écris
`<promise>SHIP STOPPED</promise>` que si c'est vrai : `state.md` dit `DONE —
<url>`, ou `BLOCKED — <raison>` (boucle d'agent épuisée, test figé qui
s'avère faux, zone protégée, enlisement). **Enlisement** : même signature
d'échec des tests figés trois itérations d'affilée → `BLOCKED`, avec ce que tu
as essayé. Sans autopilote, enchaîne simplement les phases.

## Phase 5 — La branche, dans son propre worktree

Un worktree partagé peut changer de branche sous tes pieds. Pour M et L :

```bash
git -C "$MAIN" fetch origin
git -C "$MAIN" worktree add -b <type>/<sujet> "$MAIN/.claude/worktrees/<slug>" origin/<branche par défaut>
```

puis installe les dépendances selon le profil de repo. Pour un S dans un
worktree propre, une branche depuis la branche par défaut à jour suffit.
`git branch --show-current` avant chaque commit.

## Phase 6 — Les tests d'acceptation, rouges puis figés

Avec la méthode du profil de repo (son skill de tests s'il en a un) : au moins
un test par critère `A1…An`, et pour chaque garde du modèle de menace un test
**côté refus**. Remplis `tests.md`, y compris les scénarios qui ne se prouvent
qu'en vrai.

**`ship-test-auditor`** (Agent) sur `.ship/<slug>/` et `.ship/repo.md` : il
lance les tests, vérifie qu'ils échouent pour la bonne raison et que rien du
plan n'est découvert. `GAPS` → complète et relance (2 passes au plus).

`COMPLETE` → fige, puis commit des seuls fichiers de test :

```bash
node ~/.claude/skills/ship/scripts/ship-gates.mjs freeze "$MAIN/.ship/<slug>" <fichiers de test…>
```

Ces tests ne bougent plus. Un test figé faux = un plan faux : `BLOCKED`, et
seul l'accord de la personne permet de le corriger et de refiger.

## Phase 7 — Le code : le cœur, puis les bords

1. **Le cœur** : la tranche verticale la plus fine qui fait passer le critère
   principal de bout en bout. Commit.
2. **Les bords** : critères restants, erreurs, états vides, textes visibles.
   Un commit par volet, au format du profil de repo.

Étends ce que `ship-scout` a trouvé ; aucun fichier hors plan. Le code
ressemble au code autour. Pas de refactor hors périmètre, pas d'abstraction
anticipée. Conventions perso du profil : oui, tant qu'elles ne contredisent
pas le repo.

## Phase 8 — Vérifier que c'est vraiment fait

```bash
node ~/.claude/skills/ship/scripts/ship-gates.mjs check-frozen "$MAIN/.ship/<slug>"
node ~/.claude/skills/ship/scripts/ship-gates.mjs check-new-files "$MAIN/.ship/<slug>" origin/<branche par défaut>
<commande de test ciblé du profil de repo> <tests de tests.md>
```

Les trois verts, sinon retour en phase 7 : c'est la boucle de l'autopilote.
Puis la vérification réelle du profil de repo (navigateur avec captures,
lancement de l'app, appel réel, `docker run` d'une image). Note les preuves
dans `state.md`. Un test unitaire vert ne suffit jamais pour un écran ou un
appel externe.

## Phase 9 — Trois revues, en parallèle

Dans **un seul message**, ce que le tri a retenu :
- **`ship-security`** (Agent, mode diff) : branche, `.ship/<slug>/`, `.ship/repo.md`.
- **`ship-pm`** (Agent) : `.ship/<slug>/`, preuves de la vérification réelle,
  diff des textes visibles.
- **code-review** (`Skill(code-review)`, sans `--fix`, à l'effort du tri).

Rassemble leurs points en une liste dédoublonnée : bloquant / à faire / écarté
(avec la raison).

## Phase 10 — Une seule passe de correctifs

Tous les points en une passe. Un comportement nouveau reçoit un **test de
dernière minute** (fichier ou cas nouveau, puis `freeze` dessus). Un test figé
ne se modifie toujours pas. Ne relance que ce que la passe a touché ; une revue
ne repasse que si son bloquant portait sur la sécurité ou un critère.

## Phase 11 — Obligations du repo, puis porte complète

Coche chaque obligation du profil de repo qui s'applique (doc, contrats,
fichiers générés, relecteurs, traductions…) et lance la **porte complète** du
profil. Rouge → répare. Un échec préexistant sur la branche par défaut se
prouve et se dit dans la PR.

## Phase 12 — La PR

Un seul push, après la porte verte. Titre et base selon le profil de repo.
Corps :
- `Closes #N` si c'est une issue.
- **Ce que ça fait** — 2-3 phrases.
- **Plan validé** — les critères `A1…An` et les décisions prises par défaut.
- **Preuves** — étapes franchies, tests d'acceptation, vérification réelle,
  verdicts des trois revues et ce qui a été écarté.
- **À regarder** — 1 à 3 endroits ; arbitrages pour l'arbitre produit.
- **Hors périmètre / suites**, dont ce qui touche un autre repo.
- Relecteurs selon la zone, si le profil de repo en nomme.

`state.md` : `DONE — <url>`. Rends la main avec l'URL et une phrase.

## Phase 13 — Reprise (`--resume`)

1. Relis `.ship/<slug>/state.md` et reprends à la prochaine étape. `DONE` ou
   `BLOCKED` → rappelle l'URL ou le blocage (et, sous autopilote, écris la
   promesse). C'est le point d'entrée que `ralph-loop` rappelle.
2. Après une review de PR : lis tous les commentaires, inline compris ; chacun
   appliqué ou refusé avec la raison, jamais ignoré.
3. Un commentaire qui change un critère repasse par la phase 4, puis refige.
4. Rejoue 8, 10 (périmètre du changement) et 11, puis un seul push.

---

## Anti-patterns

- ❌ Poser des questions dont le repo ou le profil a la réponse, ou une par une.
- ❌ Montrer le plan avant qu'il ait passé le critique, ou donner au critique ton raisonnement.
- ❌ Créer ce que `ship-scout` a trouvé ailleurs.
- ❌ Modifier un test figé pour le faire passer.
- ❌ Dire « ça marche » sur un test unitaire vert pour un écran ou un appel externe.
- ❌ Enchaîner les revues l'une après l'autre, ou une passe de correctifs par revue.
- ❌ Un troisième tour de boucle d'agent sans rien dire.
- ❌ Appliquer à un repo les règles d'un autre : seul le profil du repo courant compte.
- ❌ Annoncer « c'est fait » quand un critère ou une obligation est resté de côté.
