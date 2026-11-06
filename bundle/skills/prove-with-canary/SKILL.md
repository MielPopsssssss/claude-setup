---
name: prove-with-canary
description: Transformer une piste de vulnérabilité en PREUVE dynamique, en injectant un canari unique et en l'observant dans un effet de bord réel, avec le code réel de la cible. Utiliser quand une piste statique doit être confirmée, quand on doit distinguer « la garde est absente » de « la garde n'est pas invoquée », ou quand on prépare une divulgation. Rend une preuve rejouable ou un échec nommé.
---

# Prouver par canari

Un argument statique, même excellent, n'est pas une preuve. Sur une cible réelle, un SSRF
« certain » a été **réfuté** par le test en direct : la garde vivait dans une dépendance,
invisible depuis le dépôt. Inversement, une SSRF que rien ne signalait a été **prouvée** par
un canari, avec le contenu d'un service interne exfiltré.

## Le principe

> Une valeur **unique par run**, injectée dans le flux, puis **observée dans un effet de bord
> que seule la cible pouvait produire**.

Ce qui fait la preuve n'est pas que le canari existe : c'est qu'il apparaisse **là où il ne
peut arriver que par le chemin qu'on prétend**.

| Classe | Effet observable | Ce qu'on observe |
|---|---|---|
| injection de commande / de code | un shell tire | canari dans une redirection shell |
| injection SQL | la requête s'exécute | canari dans la chaîne SQL **et** divergence de result-set |
| SSRF / webhook | une connexion part | connexion reçue portant le canari, ou contenu interne rendu |
| traversée de chemin | un fichier bouge | canari écrit/lu hors de la racine |
| désérialisation | du code s'exécute | `__reduce__` qui fait tirer un shell |

Deux signaux valent mieux qu'un : la présence textuelle est **nécessaire mais pas
suffisante** (une donnée peut atterrir dans une requête sans être injectée). Le second signal
— une divergence, un effet — est le discriminant.

## La règle de construction

**Utiliser le code RÉEL de la cible, jamais une réimplémentation.** Un harnais qui recopie la
logique prouve le harnais. Importer la vraie fonction, appeler le vrai endpoint, piloter le
vrai conteneur.

Si le langage a une barrière de visibilité (Go `internal/`), place la sonde **dans** l'arbre
de la cible plutôt que de copier le code qu'elle protège.

## Le contre-contrôle, qui fait la moitié de la preuve

Observer l'effet ne dit pas **pourquoi** il s'est produit. Il faut la seconde mesure :

> **La garde refuse-t-elle la cible quand on l'appelle explicitement ?**

Si oui, et que l'effet s'est quand même produit, alors la garde **existe et n'est pas
invoquée** — ce qui est un tout autre finding que « il n'y a pas de garde », et bien plus
solide. C'est exactement ce qui a établi la SSRF :

```
URL finale  http://<service-interne>/…        → contenu interne rendu
garde(<même URL>)  → "blocked by SSRF protection: non-public IP"
```

## Monter la cible

```bash
docker compose -f compose.prod.yaml up -d
```

Quatre pièges, chacun payé :

- **attendre la SANTÉ, pas la création.** Le code de retour de `up -d` dit « conteneurs
  créés ». Scanner une pile qui démarre mesure l'horloge, pas le produit.
- **démonter TOUJOURS**, y compris après un échec — une pile debout, c'est un port pris au
  run suivant, donc une panne attribuée au code.
- **une dépendance absente ressemble à une cible sûre.** Un `ImportError` ou un
  `go.mod not found` produit « aucun effet », qu'on lit « pas exploitable ». **Toujours lire
  stderr avant de conclure.**
- **un échec de compilation aussi.** Vérifier que la cible a réellement tourné (des
  événements, une sortie, un exit code) avant d'interpréter une absence d'effet.

## Interpréter honnêtement

| Observation | Ce qu'on a le droit d'écrire |
|---|---|
| canari dans l'effet de bord | **prouvé** |
| la cible a tourné, aucun effet | non exploitable **par cette forme** — pas « sûr » |
| stderr montre build/import/chargement raté | **non mesuré** — ne rien conclure |
| timeout | **non mesuré** — jamais « atteint sans faire feu » |

Un échec d'environnement et un verdict de sécurité produisent le même silence. Les confondre
est l'erreur la plus fréquente, et la plus coûteuse.

## Rendre la preuve rejouable

Un tiers doit pouvoir la refaire : le script, la commande exacte, la version de la cible
(commit), et un **canari frais** au rejeu — une preuve qui ne tient qu'avec l'ancien canari
n'en est pas une, et un correctif qui blackliste ce canari ne trompe personne.
