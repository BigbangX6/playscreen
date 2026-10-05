# Interface Playscreen

React + TypeScript servi par Vite, dans une fenêtre Tauri (plein écran sans bordure).
Guide complet pour concevoir et intégrer les écrans : [`docs/interface.md`](../docs/interface.md).

```sh
npm install                  # une fois, dans ui/
npm run dev                  # http://localhost:5173 (moteur démarré : npm run mock à la racine)
npm run tauri dev            # dans la fenêtre Windows de Playscreen
npm run build                # vérification des types + construction dans dist/
```

## Ce qui existe

| Fichier | Rôle |
|---|---|
| `src/App.tsx` | Données partagées (jeux, stores, installations, partie en cours), événements du moteur, écran courant, fenêtres par-dessus |
| `src/screens/Home.tsx` | **Accueil** : scène du jeu sélectionné, frise des jeux récents (Aujourd'hui, Hier, Cette semaine…, Téléchargement), capsule des espaces ; sur une icône, la scène devient l'aperçu de l'espace |
| `src/screens/QuickCenter.tsx` | **Centre rapide** (Start, partout) : jeu en cours, Discord et musique en fond, volume et luminosité (bouton → réglage), sortie audio, manette, réseau, notifications, téléchargement, alimentation |
| `src/screens/Relay.tsx` | **Relais** : passage à la souris virtuelle (Paramètres Windows, activer une clé) et chargement d'une page web |
| `src/screens/Browser.tsx` | **Navigateur manette** : quatre fenêtres (Boutique, Social, Musique, Internet), onglets LB / RB ; page simulée dans la démo |
| `src/screens/Settings.tsx` | **Paramètres** : liste à gauche, contenu à droite (Stockage : disque et jeux par taille, X pour désinstaller) |
| `src/screens/Pages.tsx` | Pages simples : Rechercher, Trophées, Notifications |
| `src/screens/spaces.ts` | Espaces de la capsule, sites du navigateur, sections des paramètres, destinations (`Route`) |
| `src/system.ts` | Ce que l'interface sait du PC hors jeux (son, luminosité, Discord, musique, disques, trophées…) : simulé dans la démo (`src/demo/demo-system.ts`), « indisponible » ailleurs (les écrans le cachent) |
| `src/screens/Library.tsx` | Bibliothèque : filtres LB / RB (Tous, Installés, stores), tri X (récents, nom, temps de jeu), B pour revenir à l'accueil |
| `src/screens/GameDetail.tsx` | Fiche (X Options depuis l'accueil) : Jouer / Installer (progression) / Désinstaller (confirmation) |
| `src/screens/Stores.tsx` | État des stores, Se connecter (Epic : Autre méthode), Synchroniser |
| `src/screens/Overlays.tsx` | Écran d'attente du lancement, accompagnement connexion / installation, confirmation, moteur indisponible |
| `src/components/` | Tuile, jaquette de remplacement, progression, aide des boutons (`Hints`, et `PadHints` pour les écrans console), pictogrammes, notifications, états vides / erreur |
| `src/theme.css` | Tous les jetons de design (couleurs, `--unit`, `--cq` pour les écrans console, marges de sécurité) |

Les écrans « console » (accueil, centre rapide, relais, navigateur, paramètres) sont dessinés
sur un écran 16:9 : leurs tailles sont en `--cq` (1 % de la largeur de ce 16:9, sans déborder
en hauteur), comme les maquettes validées.

Règles de navigation : une fenêtre ouverte rend l'écran derrière `inert` (la manette reste
dedans) ; chaque écran remet le focus sur un élément utile à l'ouverture, et le rend à la
fermeture.

## Essayer

Dans un navigateur (Linux, Mac ou Windows, sans Playnite) :

```sh
npm run mock                 # à la racine : faux moteur (8 jeux, installations simulées)
npm --prefix ui run dev      # puis ouvrir http://localhost:5173 (pas 127.0.0.1 : refusé par l'API)
```

Clavier : flèches, Entrée (A), Échap (B), X, Y, M (Start), Page préc. / suiv. (LB / RB).
Une manette marche aussi (cliquer une fois dans la page). Pour voir les résolutions cibles :
outils de développement du navigateur (Ctrl+Maj+M), tailles 1920×1080, 1280×800,
1280×720, 3840×2160.

En vrai, sur le PC Windows : `dist\Playscreen\start-engine.cmd` à la place de
`npm run mock`, puis `npm --prefix ui run dev` (navigateur) ou `npm --prefix ui run tauri dev`
(fenêtre plein écran de Playscreen), manette en main devant la télé.

## Pas encore possible (manque côté moteur)

- Centre rapide : quitter le jeu, forcer la fermeture, **Reprendre** (ramener le jeu au
  premier plan) ; volume et sortie audio (API audio de Windows) ; **luminosité** (écran
  intégré des portables ; écran externe par DDC/CI, souvent absent : le moteur dit si c'est
  réglable) ; batterie de la manette ; réseau ; veille, éteindre, redémarrer, « Bureau
  Windows » (cacher Playscreen).
- Musique en cours : titre, artiste, lecture / pause, précédent / suivant (commandes
  multimédias de Windows, pour une appli comme pour une page web).
- Discord (dans le navigateur Playscreen) : appel en cours (salon, nombre de personnes),
  couper le micro, quitter l'appel, messages non lus, amis en ligne.
- Navigateur manette : fenêtres web (Boutique, Social, Musique, Internet) qui restent
  ouvertes, cachées, en arrière-plan (la musique et l'appel continuent pendant une partie) ;
  curseur aimanté, défilement au stick droit, zoom LT / RT.
- Relais : ouvrir les Paramètres Windows (et l'activation d'une clé dans le bon launcher)
  avec la souris virtuelle de la sentinelle ; Select + Start pour revenir.
- Espace disque par lecteur (Stockage ; avant une installation, F23).
- Trophées par jeu et dernier obtenu (extension Playnite SuccessStory).
- Durée de la dernière partie (« Joué hier, 1 h 12 ») : aujourd'hui seulement pour les
  parties jouées depuis l'ouverture de Playscreen (`game.stopped`).
- Écran d'attente : savoir que le launcher **se met à jour** (aujourd'hui le message
  évolue avec le temps d'attente, F25 / F26).
- Accompagnement : savoir qu'une fenêtre de launcher attend une action (aujourd'hui :
  consigne par store si l'installation ne démarre pas après 1,5 s).
- Saisie de texte (recherche, navigateur, connexions) : ouvrir le **clavier manette de
  Windows** (clavier tactile, disposition « Gamepad ») quand un champ a le focus, et le
  refermer ensuite. Il garde la disposition et la langue de l'utilisateur.
