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

## Fait côté moteur (5 octobre 2026)

- Menu rapide : `client.stop(id)` / `client.stop(id, { force: true })`, `client.volume()` /
  `client.setVolume(…)` (événement `volume.changed`), `client.session()` (partie en cours
  après un redémarrage de l'interface), `resumeGame(game)` dans `src/shell.ts` (remet le jeu
  au premier plan ; ne fait rien hors de la fenêtre Windows). Au lancement d'un jeu,
  Playscreen lui cède la place ; quand on revient sur Playscreen pendant une partie, il
  s'ouvre sur le menu rapide (D10).

- Fenêtres des launchers (F27) : événement `launcher.prompt` (`gameId`, `storeId`, `title`,
  `handle`) quand une fenêtre du launcher s'ouvre après une installation ou une
  désinstallation ; `App.tsx` la met au premier plan (`focusLauncherWindow` dans
  `src/shell.ts`) et, pour une installation, affiche la consigne.

- État des launchers (F25, F26) : événement `launcher.state` (`storeId`, `state` : `closed`,
  `starting`, `updating`, `ready`) pendant quelques minutes après un lancement, une
  installation ou une désinstallation (Steam, Epic, Battle.net ; pas Xbox). `App.tsx` le garde
  dans `launchers` ; l'écran d'attente du lancement et la consigne d'installation disent
  « Steam démarre… », « Epic se met à jour… » (sinon, message selon le temps d'attente). Une
  installation demandée avant « prêt » est renvoyée au launcher par le moteur. Démo : réglage
  « Launcher au lancement ou à l'installation » dans le panneau F2.

## Pas encore possible (manque côté moteur)

Détail, priorités et où brancher : [`docs/interface-moteur.md`](../docs/interface-moteur.md).
Fait dans la nuit du 5 au 6 octobre (voir `docs/passation.md` § 0 bis) : alimentation,
« Bureau Windows », musique, disques, luminosité, sortie audio, réseau, batterie de la
manette, trophées, dernière partie, clavier manette (page Rechercher), relais avec souris
virtuelle. Le PC passe par `src/engine-system.ts` (lecture de `GET /system` toutes les 3 s).

- Discord (dans le navigateur Playscreen) : appel en cours (salon, nombre de personnes),
  couper le micro, quitter l'appel, messages non lus, amis en ligne.
- Navigateur manette : fenêtres web (Boutique, Social, Musique, Internet) qui restent
  ouvertes, cachées, en arrière-plan (la musique et l'appel continuent pendant une partie) ;
  curseur aimanté, défilement au stick droit, zoom LT / RT.
- Accompagnement : savoir qu'une fenêtre de launcher attend une action (aujourd'hui :
  consigne par store si l'installation ne démarre pas après 1,5 s).
- État du launcher pour Xbox, et « le launcher vérifie les fichiers du jeu ».
