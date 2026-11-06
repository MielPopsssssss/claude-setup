---
name: audit-whitebox
description: Auditer un dépôt source pour y trouver des vulnérabilités EXPLOITABLES, par chasse aux asymétries de garde puis réfutation adversariale, avec preuve dynamique quand elle est possible. Utiliser quand on demande d'auditer/pentester un repo, de chercher des vulns dans du code, ou de vérifier qu'une cible est saine. Rend des findings prouvés ou argumentés, jamais du bruit de motif.
---

# Audit whitebox — trouver ce qui est exploitable, pas ce qui ressemble

Cette méthode a produit, sur une cible durcie de 508 kLoC où un scanner rendait 0 candidat :
une SSRF Medium **prouvée dynamiquement**, cinq pistes classées, et deux réfutations qui ont
tué des findings que je croyais solides. Elle encode aussi les erreurs commises — ce sont
elles qui coûtent le plus cher.

## La règle qui gouverne tout

> **Un finding vaut ce que vaut son mécanisme vérifié, pas sa plausibilité.**

Trois erreurs récurrentes, chacune payée au moins une fois :

1. **Une fonction qui existe n'est pas une fonction appelée.** Un finding centré sur du code
   mort a produit un faux HIGH. `grep` les appelants, **compte-les**, distingue test et prod.
2. **Une garde absente du dépôt n'est pas une garde absente.** Un faux SSRF a été évité de
   justesse : la protection vivait dans une **dépendance** (`WithSSRFProtection()`, appliquée
   au dial). Cherche dans `~/go/pkg/mod`, `node_modules`, `site-packages` avant de conclure.
3. **Prouver un effet ne prouve pas le mécanisme qu'on lui prête.** Une écriture en base
   réellement prouvée a servi à affirmer un mécanisme de lecture jamais exécuté — et faux.

## Phase 1 — Reconnaissance : la forme de la cible

Avant de chercher, établis **ce que la cible est** et **ce que tu ne sauras pas voir**.

```bash
# langues et proportions
find . -name '*.go' -not -path '*/node_modules/*' | wc -l
# pilotes de base : c'est ça qui décide où chercher du SQL
grep -rhoE "github.com/(jackc/pgx[^\" ]*|lib/pq)|database/sql|sqlalchemy|prisma" --include="*.go" --include="*.py" . | sort | uniq -c | sort -rn
# frameworks web, points d'entrée
grep -rlE "http.HandleFunc|chi\.|gin\.|echo\.|@app\.route|FastAPI|express\(" --include="*.go" --include="*.py" --include="*.js" . | head
```

**Le livrable le plus utile de cette phase est un rapport d'AVEUGLEMENT** : « cette cible
parle à sa base par pgx, or l'outil ne modélise que `database/sql` ». Cette phrase vaut plus
qu'un finding : elle dit où l'absence de résultat ne prouve rien.

## Phase 2 — Chasser les ASYMÉTRIES, pas les motifs

Le signal le plus fort n'est pas « il manque une garde ». C'est :

> **« La garde existe ICI et pas LÀ, pour le même mécanisme. »**

Un dépôt qui se contredit lui-même **prouve** que la garde est nécessaire. Il ne reste qu'à
montrer le chemin qui l'évite. C'est ce qui a produit la SSRF : `click.go` revalidait l'URL
après redirection avec un commentaire nommant la classe de contournement ; `navigate.go` et
`extract_text.go` ne le faisaient pas.

Cinq détecteurs, mécaniques d'abord (donc gratuits) :

| Détecteur | Ce qu'on cherche |
|---|---|
| **paire durci / non durci** | `X` et `VerifiedX`, `get` et `getChecked` → lister les appelants de la version faible |
| **frère non revalidé** | une revalidation présente dans une fonction sœur et absente dans l'autre |
| **middleware partiel** | un groupe de N routes dont N-1 portent un middleware |
| **setter de durcissement mort** | `SetAllowedDomain`, `EnableStrict…` sans aucun appelant |
| **garde en dépendance contournée** | un client durci existe, et un chemin construit un client nu |

```bash
# paires durci / non durci
grep -rhoE "func [A-Z][A-Za-z]*\(" --include="*.go" . | sort -u | sed 's/func //;s/($//' > /tmp/fns
grep -oE "^(Verified|Checked|Safe|Validated)[A-Za-z]+" /tmp/fns   # puis chercher la version nue
# setter de durcissement jamais appelé
for f in $(grep -rhoE "func \(\w+ \*?\w+\) (Set|Enable)[A-Za-z]+" --include="*.go" . | awk '{print $NF}' | tr -d '(' | sort -u); do
  n=$(grep -rc "\.$f(" --include="*.go" . | awk -F: '{s+=$2} END{print s}'); [ "$n" -le 1 ] && echo "MORT: $f ($n)"; done
```

## Phase 3 — Les greps qui MENTENT

Écrits ici parce qu'ils ont produit de vrais faux négatifs :

**SQL dynamique.** Chercher `Sprintf("...SELECT...")` rate le motif inverse, où la requête
EST le format et où l'on interpole des **fragments** :

```bash
# CE QUI RATE
grep -rE 'fmt\.Sprintf\("[^"]*(SELECT|WHERE)' --include="*.go" .
# CE QU'IL FAUT AUSSI
grep -rnE "(query|sql|q) *=? *fmt\.Sprintf\(" --include="*.go" .          # requête = format
grep -rnE "\.(Query|Exec|Prepare)\([^)]*(\+|Sprintf|Fragment\(\))" --include="*.go" .
grep -rn "SQLFragment()\|OrderBy\|orderBy\|sortBy" --include="*.go" .      # ORDER BY dynamique
```

**Shells.** Chercher `sh -c` rate Windows entièrement :

```bash
grep -rnE '"(sh|bash|zsh)", *"-c"' --include="*.go" .
grep -rnE '"(cmd|powershell|pwsh|wmic|cscript)"' --include="*.go" .   # ← souvent oublié
```

**Binaire non littéral.** Un `exec.Command(name, args...)` dans un helper est sûr **si tous
ses appelants** passent un littéral. Vérifie-les tous, ne suppose pas.

## Phase 4 — Réfuter par DÉFAUT

Chaque piste passe par un examen dont le but est de la **casser**. Elle survit ou elle meurt.
Deux lentilles, dans cet ordre :

1. **Code mort et gardes manquées** — appelants comptés ; garde dans un middleware, une
   couche appelante, ou une dépendance ?
2. **Atteignabilité et impact** — la position d'attaquant supposée est-elle réellement
   atteignable (anonyme ? autre tenant ? rôle faible ?) ; l'impact est-il **mesuré** ou
   extrapolé ? Une piste qui exige d'être déjà administrateur ne vaut presque rien.

Sur la cible réelle, cet étage a fait tomber deux pistes sur six, dont une à `non-issue`.

## Phase 5 — Prouver, quand c'est possible

Un argument statique, même excellent, n'est pas une preuve. La preuve se fait par **canari** :
une valeur unique par test, injectée, puis **observée dans un effet de bord réel**.

Construire le harnais avec le **vrai code de la cible**, jamais une réimplémentation :

```
1. monter la cible (docker compose), attendre sa SANTÉ — le rc de `up -d` ne dit que
   « conteneurs créés » ; mesurer une pile qui démarre, c'est mesurer l'horloge
2. injecter un canari unique
3. observer l'effet : fichier écrit, connexion reçue, contenu interne renvoyé
4. faire le CONTRE-CONTRÔLE : la garde refuse-t-elle bien la cible quand on l'appelle ?
   (c'est ce qui distingue « la garde est absente » de « la garde n'est pas invoquée »)
5. démonter TOUJOURS — une pile debout, c'est un port pris au run suivant
```

## Phase 6 — Écrire

Trois affirmations **distinctes**, jamais fusionnées :

| | |
|---|---|
| **effet** | ce qui a été observé (le canari a fait feu) |
| **mécanisme** | la chaîne causale — l'a-t-on **exécutée**, ou supposée ? |
| **impact** | ce qu'un attaquant obtient — **mesuré**, ou extrapolé ? |

N'écris jamais « preuve » sur un champ supposé. Sur la cible réelle, deux sur-qualifications
successives (HIGH→Medium, Critical→High) venaient toutes deux d'un impact extrapolé au-delà
du mesuré.

Pour chaque finding : chemin de code complet `fichier:ligne → fichier:ligne`, position
d'attaquant, ce qui est **vérifié** contre ce qui est **supposé**, et le correctif.

## Quand la cible est saine

Le dire, et le **démontrer** : quelles surfaces ont été couvertes, par quelle méthode, et
surtout **ce que la méthode ne pouvait pas voir**. « Rien trouvé » sans périmètre est
indistinguable de « pas cherché ».

Une architecture fail-closed par construction (scope porté par l'identifiant, autorisation
relue en base, chaque resolver autorisant par l'ID de son propre objet) tue des classes
entières. Le constater est un résultat.
