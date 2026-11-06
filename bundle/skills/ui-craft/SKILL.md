---
name: ui-craft
description: Cadre tout travail d'interface — créer ou modifier un composant, une page, un écran, un formulaire, un tableau de bord, du CSS, du Tailwind, un thème, une maquette, ou « rendre ça plus beau ». Garde la direction artistique déjà en place dans le repo (tokens, composants maison, écrans voisins) et vise un rendu soigné, pas un rendu générique d'IA. Utiliser avant d'écrire la première ligne d'UI, y compris dans /ship.
---

# ui-craft

Deux objectifs, dans cet ordre : **ressembler au produit existant**, puis
**être beau**. Un écran superbe qui ne ressemble pas au reste de l'application
est un défaut, pas une réussite.

## 1. Inventaire avant d'écrire

Avant toute ligne d'UI, trouve et ouvre :

- **Les tokens** : config Tailwind (`tailwind.config.*`, `@theme` dans le CSS
  global), variables CSS (`:root`, `[data-theme]`), fichier de thème
  (`theme.ts`, `tokens.*`). Note les couleurs, l'échelle d'espacement, les
  radius, les ombres, les familles et tailles de police.
- **Les composants maison** : `components/ui/`, `design-system/`, un paquet
  interne, shadcn, une librairie installée (MUI, Mantine, Chakra…). Liste ceux
  qui couvrent le besoin : bouton, champ, carte, modale, tableau, badge, état
  vide.
- **Deux ou trois écrans voisins** du même produit, au plus près du besoin
  (même type de page, même section). Ce sont les modèles à imiter : mise en
  page, densité, ton des textes, icônes, gestion des états.
- **Le dark mode** : existe-t-il, et comment est-il branché.

Résume l'inventaire en quelques lignes avant de coder. S'il manque une pièce
(pas de tokens, pas de composants), dis-le.

## 2. Règles de cohérence

- Réutilise le composant maison plutôt que d'en écrire un nouveau ou d'utiliser
  la balise native. Étends-le par une prop plutôt que de le dupliquer.
- Aucune valeur en dur hors tokens : pas de `#hex`, pas de `px` arbitraire, pas
  de `text-[13px]` si l'échelle existe. Une valeur nouvelle est d'abord ajoutée
  aux tokens, et seulement si elle manque vraiment.
- Même jeu d'icônes que le reste du repo, même taille, même épaisseur.
- Même vocabulaire et même ton que les écrans voisins ; toutes les langues que
  le repo exige.
- Si le repo a un dark mode, le nouvel écran le supporte.

## 3. Rendu soigné, pas générique

Les marques d'une UI « générée » à éviter, sauf si le produit les utilise déjà :

- dégradés violet/bleu, glassmorphism, ombres lourdes partout ;
- emoji en guise d'icônes ;
- grille de cartes identiques avec icône + titre + phrase, pour tout contenu ;
- tout centré, tout en gras, tout en couleur d'accent ;
- textes de remplissage (« Unlock the power of… », « Seamless »), lorem ipsum.

Ce qui fait un écran soigné :

- **Hiérarchie** : un seul élément principal par écran ; trois niveaux de texte
  au plus (titre, corps, secondaire) tirés de l'échelle typographique.
- **Alignement et rythme** : une grille, des espacements tirés de l'échelle,
  des bords qui s'alignent d'un bloc à l'autre.
- **Densité adaptée** : un outil métier montre plus de données, moins de vide ;
  une page d'accueil respire davantage. Calque la densité des écrans voisins.
- **Couleur avec retenue** : l'accent sert l'action principale et l'état, pas
  la décoration. Contraste texte/fond conforme WCAG AA.
- **Tous les états** : chargement, vide (qui dit quoi faire), erreur (qui dit
  comment s'en sortir), succès, désactivé, survol et focus visibles au clavier.
- **Contenu réaliste** : des noms, nombres et longueurs de texte plausibles,
  y compris les cas longs qui débordent.

## 4. Repo sans direction artistique

Pas de tokens ni de composants, ou un projet neuf : propose une direction
courte (palette de 1 accent + neutres, une échelle d'espacement, une ou deux
polices) et fais-la valider avant de construire. Pose-la ensuite en tokens dès
le premier écran pour que les suivants s'y tiennent. Le skill
`frontend-design`, s'il est installé, peut nourrir cette proposition.

## 5. Vérifier

Regarde le résultat, ne le suppose pas : capture via le skill de vérification du repo, `/run` ou le
navigateur Playwright, en clair et en sombre si le repo a les deux, à largeur
mobile et bureau. Compare la capture à un écran voisin côte à côte : si l'œil
voit deux produits différents, corrige avant de livrer.
