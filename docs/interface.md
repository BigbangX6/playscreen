# Concevoir l'interface Playscreen

> Ce guide sert à concevoir l'interface dans une **autre conversation Claude**, puis à
> l'intégrer au projet. La section 6 est un brief prêt à coller dans cette conversation.

## 1. Où vit l'interface

| Dossier | Contenu | Qui le modifie |
|---|---|---|
| `ui/src/screens/` | Les écrans (`Library.tsx` aujourd'hui : maquette technique à remplacer) | **Le design** |
| `ui/src/components/` | Composants réutilisables (tuile de jeu, barre de progression…) — à créer | **Le design** |
| `ui/src/theme.css` | Jetons de design : couleurs, rayons, unité de taille, focus | **Le design** |
| `ui/src/App.tsx` | Racine : connexion au moteur, choix de l'écran courant | Le design (navigation entre écrans), avec moi |
| `ui/src/engine.ts` | Connexion au moteur, reconnexion, événements en direct | Moi |
| `ui/src/input/` | Manette et clavier → actions ; déplacement du focus | Moi |
| `api/` | Contrat de l'API, types, client | Moi (toute modification touche aussi le moteur) |
| `ui/src-tauri/` | Coque Windows (fenêtre plein écran sans bordure) | Moi |

**Format attendu** : composants **React + TypeScript** (`.tsx`), styles en **CSS** (fichiers
`.css` importés, ou styles en ligne qui n'utilisent que les variables de `theme.css`).
Pas de bibliothèque d'interface lourde ; si le design en veut une (Tailwind, Framer
Motion…), on l'ajoute ensemble. Contrainte TypeScript : pas d'`enum` ni de `namespace`
(utiliser des unions de chaînes : `type Etat = "a" | "b"`).

## 2. Les données disponibles

Le client est créé par `ui/src/engine.ts` et passé aux écrans (`client`). Types complets
dans `api/types.ts`.

| Besoin | Appel | Réponse |
|---|---|---|
| Liste des jeux | `client.games()` ou `client.games({ installed: true, store: "steam" })` | `Game[]` : `id`, `name`, `store` (`steam`, `epic`, `xbox`, `battlenet`, `other`), `installed`, `installSizeBytes`, `playtimeSeconds`, `lastPlayed`, `added`, `media` |
| Image d'un jeu | `client.mediaUrl(id, "cover" \| "background" \| "icon")` | Adresse pour `<img src>` (si `media.cover` est vrai) |
| Lancer | `client.start(id)` | Événements `game.starting`, `game.started`, `game.stopped` |
| Installer | `client.install(id)` | Événements `install.progress` (`bytesDone`, `bytesTotal`), puis `game.installed` |
| Désinstaller | `client.uninstall(id)` | Événement `game.uninstalled` |
| Stores | `client.stores()` | `Store[]` : `pluginInstalled`, `launcherInstalled`, `connected` (`null` = inconnu), `gameCount` |
| Synchroniser un store | `client.sync("steam")` | `sync.started`, `library.updated`, `store.updated`, `sync.finished` (`ok`, `error` : `"not connected"`…) |
| Connecter un store | `client.login("epic")` ; `client.login("epic", { alternative: true })` | Fenêtre du store ouverte en grand ; `store.updated` à la fin |

Les événements arrivent dans `App.tsx` (`useEngine(onEvent)`). Le moteur redémarre
parfois (Playnite) : `engine.ts` se reconnecte seul ; l'écran doit supporter l'état
« moteur indisponible ».

**Pour essayer sans le vrai moteur** : le faux moteur a une bibliothèque de 8 jeux avec
des cas limites (titre très long, jeu sans image, store non connecté, installation qui
progresse en 10 étapes).

## 3. La manette

L'interface ne voit jamais les boutons, seulement des **actions** (`ui/src/input/gamepad.ts`) :

| Action | Manette Xbox | PlayStation | Clavier (développement) |
|---|---|---|---|
| `up` `down` `left` `right` | Croix ou stick gauche (répétition si maintenu) | idem | Flèches |
| `confirm` | A | Croix | Entrée |
| `back` | B | Rond | Échap |
| `options` | X | Carré | X |
| `search` | Y | Triangle | Y |
| `menu` | Start (☰) | Options | M |
| `previousTab` / `nextTab` | LB / RB | L1 / R1 | Page préc. / suiv. |

- Tout élément atteignable porte l'attribut **`data-focusable`** (et est un `<button>`
  ou a `tabIndex={0}`). Les directions déplacent le focus vers l'élément le plus proche ;
  `confirm` le déclenche (`onClick`).
- Un écran intercepte une action avec `useNavAction((action) => { … return true; })`
  (`ui/src/input/navigation.ts`) : par exemple `back` pour revenir, `options` pour un menu.
- **Select + Start** est réservé à la sentinelle (D4, D10) : ne pas l'utiliser.
- Pas de souris, pas de survol, pas de champ de texte à taper (le clavier manette viendra
  plus tard) : tout se fait par sélection.
- Le focus doit toujours être **visible** et **jamais perdu** (un écran qui s'ouvre met
  le focus sur son premier élément utile).

## 4. L'écran

- **Distance télé** : lisible à 3 m. Toutes les tailles en multiples de `--unit`
  (`theme.css`), qui suit la hauteur de l'écran.
- **Résolutions** : 1920×1080 et 3840×2160 (télé), 1280×800 (consoles portables type
  Steam Deck / ROG Ally), 1280×720.
- **Marges de sécurité** : environ 5 % sur les bords (certaines télés rognent l'image).
- Plein écran, sans bordure, sans barre de titre. Thème sombre par défaut.

## 5. Les écrans à concevoir

Par ordre d'importance. Pour chacun, prévoir les états : chargement, vide, erreur,
moteur indisponible.

1. **Bibliothèque** : tous les jeux, filtres par store et « installés », tri (récents,
   nom, temps de jeu). Jeux sans image (fréquent aujourd'hui) : une tuile lisible avec
   le nom.
2. **Fiche d'un jeu** : image de fond, temps de jeu, dernière partie ; **Jouer** /
   **Installer** (avec barre de progression, taille) / **Désinstaller**.
3. **Écran d'attente** pendant qu'un launcher démarre, se met à jour ou installe : il
   dit **ce qui se passe** (« Epic se met à jour… »), jamais un écran figé (F25, F26).
4. **Menu rapide en jeu** (D10), ouvert par Select + Start pendant une partie :
   reprendre, quitter le jeu, forcer la fermeture, volume, batterie, bibliothèque.
5. **Stores** : état de chaque store (launcher installé, compte connecté), se connecter
   (avec une option « autre méthode » pour Epic), synchroniser ; boutons
   « Recommencer » et « Retour » pendant une connexion (F21).
6. **Accompagnement** quand une fenêtre de launcher demande une action (confirmer une
   installation…) : une consigne claire (« Appuie sur Installer »), le mode assisté
   viendra avec (F4, F27).
7. **Notifications** : installation terminée, manette déconnectée, batterie faible.

## 6. Brief à coller dans la conversation de design

```
Je conçois l'interface de Playscreen : une interface de jeu pour PC Windows (PC de
salon sur une télé, consoles portables), utilisable entièrement à la manette, aussi
simple qu'une console PlayStation. Elle rassemble les jeux Steam, Epic, Xbox et
Battle.net.

Contraintes techniques (le code sera intégré tel quel) :
- Composants React + TypeScript (.tsx), styles CSS utilisant des variables CSS (thème
  dans un seul fichier theme.css). Pas d'enum TypeScript (unions de chaînes).
- Navigation uniquement à la manette : chaque élément atteignable est un <button> avec
  l'attribut data-focusable ; le focus doit toujours être visible. Pas de souris, pas
  de survol, pas de saisie de texte.
- Actions disponibles : up, down, left, right, confirm (A), back (B), options (X),
  search (Y), menu (Start), previousTab (LB), nextTab (RB). Select + Start est réservé.
- Lisible à 3 m d'une télé ; doit marcher en 1920×1080, 3840×2160, 1280×800 et 1280×720 ;
  tailles en multiples d'une unité CSS --unit ; marges de sécurité ~5 %.
- Données d'un jeu : id, name, store (steam | epic | xbox | battlenet | other),
  installed, installSizeBytes, playtimeSeconds, lastPlayed, added, et une image
  (cover, background, icon) souvent absente.
- Événements en direct : installation (octets faits / total), jeu lancé / arrêté,
  bibliothèque modifiée, état d'un store (launcher installé, compte connecté).

Écrans : bibliothèque, fiche d'un jeu, écran d'attente (un launcher démarre ou se met
à jour), menu rapide en jeu, stores (connexion, synchronisation), accompagnement quand
un launcher demande une action, notifications. Chaque écran a ses états : chargement,
vide, erreur, moteur indisponible.
```

## 7. Essayer l'interface

```sh
npm run mock                 # faux moteur (ou le vrai : dist\Playscreen\start-engine.cmd)
npm --prefix ui run dev      # interface sur http://localhost:5173 (flèches, Entrée, Échap)
npm --prefix ui run tauri dev   # même interface dans la fenêtre Windows de Playscreen
```

Une manette branchée fonctionne aussi dans le navigateur (cliquer une fois dans la page
pour qu'il l'active).

Le faux moteur et le vrai utilisent le même port (47800) et le même `engine.json` : un
seul des deux à la fois.
