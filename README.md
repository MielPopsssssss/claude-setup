# claude-setup — un setup Claude Code pour livrer du code proprement

Un script installe dans ton `~/.claude` : le pipeline `/ship` et ses agents
(de l'issue à la PR, dans n'importe quel repo), des skills de travail, une
garde git et quelques plugins. Rien n'est ajouté à tes repos : tout reste dans
ton `~/.claude`.

## Installer (5 minutes)

**Prérequis** : `claude`, `git`, `gh` (connecté : `gh auth login`), `node`,
`python3`.

```bash
gh repo clone MielPopsssssss/claude-setup ~/claude-setup
cd ~/claude-setup
./setup.sh --dry-run   # voir ce qui va changer
./setup.sh             # installer
```

Puis **redémarre Claude Code** et lance un premier `/ship` dans ton repo : il
crée ton profil. Le script est idempotent : pour une mise à jour,
`git pull && ./setup.sh`.

| Option | Effet |
|---|---|
| `--dry-run` | affiche ce qui changerait, ne modifie rien |
| `--no-modes` | n'installe pas les plugins caveman et ponytail |
| `--extras` | ajoute pstack et floorplan |
| `--no-plugins` | fichiers et réglages seulement, sans plugin ni MCP |

**Ce que le script ne touche pas** : il n'enlève rien de ton
`~/.claude/settings.json` (il ajoute seulement), et ne modifie ton
`~/.claude/CLAUDE.md` qu'entre les marqueurs `claude-setup:start` /
`claude-setup:end`. Avant d'écrire, il copie ce qu'il remplace dans
`~/.claude/backups/claude-setup-<date>/`.

## Ce qui est installé

| Quoi | Pourquoi |
|---|---|
| skill `/ship` + 5 agents `ship-*` | livrer une feature de la demande à la PR, dans n'importe quel repo (détail ci-dessous) |
| skill `resolve-stack` | résoudre le conflit d'une PR, même empilée, sans rebase ni force push |
| skills `audit-whitebox`, `prove-with-canary` | audit de sécurité d'un dépôt, preuve dynamique d'une vulnérabilité |
| skill `ui-craft` | se déclenche sur le travail d'UI : garde la DA du repo, évite le rendu générique d'IA |
| commande `/prs` | état des PRs ouvertes, en piles, avec ce qui est mergeable |
| hook `guard-git` | bloque le force push, `reset --hard` et toute action sur la PR d'un autre |
| plugins `superpowers`, `ralph-loop`, `frontend-design` | méthodes de travail, autopilote de `/ship`, design UI |
| plugins `ponytail`, `caveman` | le moins de code possible ; des réponses courtes dans le chat |
| mod `ship-monitor` | panneau de suivi de `/ship` à côté du chat (voir plus bas) |
| MCP `playwright` | navigateur de secours pour Claude |
| bloc dans `~/.claude/CLAUDE.md` | ce que caveman et ponytail n'ont pas le droit de raccourcir |

## Livrer quelque chose : `/ship`

C'est la seule commande à retenir. Elle marche dans **n'importe quel repo**,
prend une issue ou une demande en une phrase et va jusqu'à la PR.

### Il s'adapte à toi et à ton repo

- **Ton profil** — `~/.claude/ship-profile.md`. Au premier `/ship`, Claude le
  crée : il devine ton login et tes repos, puis te pose une salve de questions
  (ton rôle, l'autopilote toujours / à la demande / jamais, la revue produit,
  à qui remonter un arbitrage produit). Tu y ajoutes tes conventions perso
  (« toujours un test e2e pour une page », « pas de nouvelle dépendance sans
  me demander »…). `/ship --profile` pour le revoir. Il n'est jamais partagé.
- **Le profil du repo** — `.ship/repo.md`, à la racine du repo, exclu de git.
  Pour un repo connu (`~/.claude/skills/ship/repos/<repo>.md`), c'est la
  base. Pour un repo inconnu, Claude le déduit de
  son `CLAUDE.md`, `README`, `CONTRIBUTING`, manifeste et CI : commandes de
  test, porte complète avant push, façon d'écrire un test, vérification
  réelle, obligations (doc, relecteurs, conventions de PR), zones protégées.
  Il te le montre la première fois, tu corriges, et il le régénère tout seul
  quand ces fichiers changent. `/ship --repo-profile` pour le forcer.
- **Partager un profil de repo** : une équipe peut versionner ses profils
  dans son propre repo et les copier dans `~/.claude/skills/ship/repos/`
  après `./setup.sh` (qui remplace le dossier `ship` à chaque passage ; la
  version précédente reste dans la sauvegarde).

```
/ship 1234
/ship "exporter les findings en CSV depuis la liste"
/ship --resume
```

Ce qui se passe, et où tu interviens :

1. **Tri** : taille S, M ou L, et risques (auth, migration, contrat d'API…).
   Le tri décide quelles étapes tournent : un correctif d'une ligne ne
   mobilise pas cinq agents.
2. **Inventaire** : `ship-scout` liste ce qui existe déjà, pour étendre
   l'existant au lieu d'en créer un double.
3. **Plan** : écrit puis relu par `ship-plan-critic`, qui n'a pas vu le
   raisonnement derrière. Deux passes au plus.
4. **Toi** : jusqu'à quatre questions en une fois, chacune avec une
   recommandation, puis tu valides le plan. C'est le seul arrêt obligatoire.
5. **Autopilote** (tailles M et L, selon ton profil) : `ralph-loop` relance le pipeline jusqu'à
   la PR. Tests d'acceptation écrits rouges, audités (`ship-test-auditor`),
   puis figés ; code jusqu'à ce qu'ils passent ; vérification au navigateur ;
   revues sécurité (`ship-security`), produit (`ship-pm`) et code en
   parallèle ; une passe de correctifs ; la porte complète du repo ; PR.
6. Il ne revient vers toi qu'en cas de blocage, en expliquant pourquoi.

Deux règles sont tenues par un script (`~/.claude/skills/ship/scripts/ship-gates.mjs`),
pas par la bonne volonté de l'agent : un test figé ne peut pas être modifié
pour passer, et aucun fichier ne peut être créé s'il n'est pas déclaré dans le
plan.

L'état de chaque tâche vit dans `.ship/<slug>/` à la racine du repo, **exclu de git en
local** (`.git/info/exclude`) : il n'arrive jamais dans le repo. Le plan validé
est recopié dans le corps de la PR. `/ship --resume` repart de cet état, même
dans une nouvelle session. Pour arrêter l'autopilote : `/cancel-ralph`.

## Suivre `/ship` en direct : le panneau `ship-monitor`

Un panneau à côté du chat. Il s'ouvre tout seul quand tu tapes `/ship`, quand
Claude charge le skill `ship`, ou quand une nouvelle tâche apparaît dans `.ship/`
(une fois par tâche : le fermer tient). Sinon, `/ship-monitor` l'ouvre. Ouvert
sans que tu le demandes, il n'est dessiné qu'à partir de 144 colonnes de
terminal. Il se rafraîchit toutes les 4 secondes :

- **Les étapes** : un nœud encadré par étape, relié au suivant par une flèche.
  Bordure verte ✔ franchie, épaisse et ambre ◉ en cours, double et rouge ✖
  bloquée, simple et grise ⊘ sautée par le tri, grise ○ à venir. Les agents
  d'une étape sont des nœuds de leur couleur à droite, avec leur verdict. Un
  groupe d'étapes entièrement franchi (CADRER, PROUVER…) se replie en un seul
  nœud. Il lit `.ship/<slug>/state.md` de la tâche la plus récente du repo.
- **L'usage** : coût de la session en dollars, remplissage du contexte, et
  tokens d'entrée et de sortie consommés par les agents.
- **Les échanges avec les agents** : chaque agent lancé (`→ ship-plan-critic`
  et la tâche confiée), puis sa réponse (`← REVISE · 12.4k tok · 41s`).
  « détail » déplie le prompt envoyé et la réponse reçue ; « transcript »
  ouvre la conversation complète de l'agent dans la vue principale.

Le mod vient de ce repo (`mods/ship-monitor`, déclaré comme marketplace
locale) : un `git pull` puis `/reload-plugins` suffit pour le mettre à jour.

`setup.sh` l'installe déjà. Pour l'installer seul, sans cloner le repo, ajoute
ce repo comme marketplace directement depuis GitHub :

```bash
claude plugin marketplace add MielPopsssssss/claude-setup
claude plugin install ship-monitor@claude-setup
```

Le panneau suit
`/ship` : sans le skill `ship`, que seul `setup.sh` installe, il n'a rien à
afficher. Pour une mise à jour : `claude plugin marketplace update
claude-setup`.

## Les autres commandes utiles

| Commande | Quand |
|---|---|
| `/prs` | savoir ce qui est mergeable et ce qui bloque |
| `/resolve-stack 1234` | une PR est en conflit |

## Les modes de réponse

- **caveman** compresse les réponses dans le chat, jamais les commits, PR,
  docs ou textes d'interface. `stop caveman` pour le couper, `/caveman` pour le
  remettre.
- **ponytail** pousse vers la plus petite modification complète.
  `/ponytail lite|full|ultra` change le niveau, `stop ponytail` le coupe. Il ne
  retire jamais un test, une doc, une traduction ou une garde de sécurité que
  le repo exige.

## La garde git

Le hook `guard-git` refuse, à chaque commande Bash de Claude :
`git push --force` (et `-f`, `--force-with-lease`, `+refspec`), `git reset
--hard` sur une branche suivie, et tout push, merge, édition ou commentaire sur
une PR dont tu n'es pas l'auteur. Pour agir sur la PR d'un collègue, dis-le
explicitement à Claude en nommant la PR : il ajoutera `ALLOW_OTHERS_PR=<n>` à la
commande. Test : `python3 ~/.claude/hooks/guard-git.py --self-test`.

## Ce qui n'est pas inclus

- **La mémoire de Claude** : elle est personnelle. Les règles d'équipe vivent
  dans le `CLAUDE.md` et les `docs/` de chaque repo.
- **Les connecteurs claude.ai** (Slack, Sentry, Gmail…) : à connecter toi-même
  depuis claude.ai → Paramètres → Connecteurs.

## Désinstaller ou revenir en arrière

Chaque exécution laisse une copie de ce qu'elle a remplacé dans
`~/.claude/backups/claude-setup-<date>/`. Pour revenir en arrière, recopie ces
fichiers, retire le bloc entre les marqueurs `claude-setup` de
`~/.claude/CLAUDE.md`, supprime `~/.claude/skills/ship` et
`~/.claude/agents/ship-*.md`, et `claude plugin uninstall <nom>` pour les
plugins.

## Pour le mainteneur

`./setup.sh export` recopie le skill `/ship`, ses agents, les skills et les
commandes depuis ton `~/.claude` vers `bundle/`, et refuse s'il y trouve un
chemin absolu personnel. Le hook `guard-git.py` du bundle est une version
générique (le propriétaire vient de `CLAUDE_GUARD_OWNER`) : reporte tes
changements à la main. Relis `git diff`, puis commit et push.
