# Jeux et applications hors launcher

*Écrit le 6 octobre 2026 (session Windows), pour la session de design : comment ça marche
dans le moteur, et ce que l'interface peut en faire.*

## Ce que c'est

Un jeu ou une application qui ne vient d'aucun store : un `.exe` (jeu sans launcher,
émulateur, Minecraft, Roblox, Shadow PC, OBS…). Dans l'API, c'est un jeu comme les
autres avec **`store: "other"`**, toujours `installed: true`. Playnite le lance (simple
lancement de l'exécutable) et suit la partie (`game.starting` → `game.started` →
`game.stopped`, temps de jeu compris).

## Ce que le moteur fait de plus pour eux

Playnite les gère mal tout seul ; la passerelle compense :

| Problème vu le 6 octobre (Bloc-notes, Audacity) | Ce que fait le moteur |
|---|---|
| La fenêtre s'ouvre **derrière Playscreen** (Windows interdit à un programme lancé en arrière-plan de passer devant) | La passerelle guette la première nouvelle fenêtre après le lancement (60 s, en ignorant Playscreen, Playnite, l'Explorateur et les launchers) et envoie **`game.window { gameId, handle }`** ; `GET /session` donne aussi `windowHandle`. L'interface (au premier plan) cède la place : `focusLauncherWindow(handle)`. **Déjà branché dans `App.tsx`**, ainsi que « Reprendre ». |
| **« Quitter » ne marchait pas** : Playscreen cherchait les processus dans le dossier d'installation, or le vrai programme est parfois ailleurs (le Bloc-notes de Windows 11 relance l'application du Store) | `POST /games/{id}/stop` ferme cette fenêtre (comme la croix) ; `?force=true` arrête son processus. |
| Pas de manière d'en **ajouter** à la manette | `GET /apps/candidates` : les raccourcis du menu Démarrer vers un `.exe` (sans les outils de Windows ni les « Désinstaller »), triés par nom, avec `added` s'ils sont déjà dans la bibliothèque. `POST /apps?name=&path=&arguments=` ajoute (icône de l'exécutable comprise, `media.icon: true`). |
| Pas de manière d'en **retirer** | `DELETE /games/{id}` : seulement pour `store: "other"` (409 pour un jeu de store, ou si l'application tourne). |

Client (`api/client.ts`) : `appCandidates()`, `addApp({ name, path, arguments })`,
`removeApp(gameId)` ; la démo les simule (deux candidats : Minecraft Launcher, RetroArch).

## Ce que l'interface peut ajouter (à dessiner)

- **« Ajouter une application »** (bibliothèque, ou Comptes et launchers) : liste
  `appCandidates()` avec la recherche, `added` grisé ou coché ; A ajoute. Pas de saisie de
  chemin à la manette (les rares cas restants : Paramètres de Playnite plus tard).
- Pas de jaquette : seulement l'icône (`media.icon`). Prévoir une vignette avec l'icône au
  centre sur un fond coloré, et le nom.
- Une rubrique ou un filtre **« Applications »** (store `other`) dans la bibliothèque.
- Dans la page du jeu (store `other`) : **« Retirer de la bibliothèque »** (`removeApp`) à
  la place de « Désinstaller » ; pas de trophées, Workshop, vérification ni propriétés.
- Les applications ne sont pas des jeux : le temps de jeu reste compté, mais l'accueil
  pourrait les mettre à part.

## Limites connues

- Une application qui n'ouvre **aucune fenêtre à cadre** dans les 60 s (jeu plein écran
  exclusif lancé lentement, programme de la zone de notification) n'a pas de `game.window` :
  « Quitter » repasse alors par le dossier d'installation.
- Une application qui ouvre d'abord un **écran de démarrage** puis sa vraie fenêtre :
  `windowHandle` peut viser l'écran de démarrage (fermé ensuite) ; « Quitter » cherche
  alors aussi dans le dossier d'installation.
- Les applications du **Microsoft Store** (Bloc-notes, Minecraft du Store) n'ont pas de
  raccourci `.exe` dans le menu Démarrer : elles n'apparaissent pas dans les candidats.
