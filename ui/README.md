# Interface Playscreen

React + TypeScript servi par Vite, dans une fenêtre Tauri (plein écran sans bordure).
Guide complet pour concevoir et intégrer les écrans : [`docs/interface.md`](../docs/interface.md).

```sh
npm install                  # une fois, dans ui/
npm run dev                  # http://localhost:5173 (moteur démarré : npm run mock à la racine)
npm run tauri dev            # dans la fenêtre Windows de Playscreen
npm run build                # vérification des types + construction dans dist/
```

## Ce qui existe (première version)

| Fichier | Rôle |
|---|---|
| `src/App.tsx` | Données partagées (jeux, stores, installations, partie en cours), événements du moteur, écran courant, fenêtres par-dessus |
| `src/screens/Library.tsx` | Bibliothèque : filtres LB / RB (Tous, Installés, stores), tri X (récents, nom, temps de jeu) |
| `src/screens/GameDetail.tsx` | Fiche : Jouer / Installer (progression) / Désinstaller (confirmation) |
| `src/screens/Stores.tsx` | État des stores, Se connecter (Epic : Autre méthode), Synchroniser |
| `src/screens/Overlays.tsx` | Menu (Start), écran d'attente du lancement, menu rapide en jeu, accompagnement connexion / installation, moteur indisponible |
| `src/components/` | Tuile, jaquette de remplacement, progression, aide des boutons, notifications, états vides / erreur |
| `src/theme.css` | Tous les jetons de design (couleurs, `--unit`, marges de sécurité) |

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

## Pas encore possible (manque côté moteur)

- Écran d'attente : savoir que le launcher **se met à jour** (aujourd'hui le message
  évolue avec le temps d'attente, F25 / F26).
- Accompagnement : savoir qu'une fenêtre de launcher attend une action (aujourd'hui :
  consigne par store si l'installation ne démarre pas après 1,5 s).
