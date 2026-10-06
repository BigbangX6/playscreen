# Ce que la nouvelle interface attend du moteur

> Écrit le 5 octobre 2026 par la session de design (cloud), pour la session Windows.
> Les écrans validés par la personne sont codés dans `ui/` : accueil, centre rapide, relais,
> navigateur manette, paramètres. Démo jouable (faux moteur intégré, panneau F2) :
> https://claude.ai/artifact/9kk25a1rgyhnDqY7mp3rDx

## 1. Récupérer le travail et l'essayer

```sh
git pull origin claude/busy-carson-3amj4g
git fetch origin claude/gracious-clarke-cflgky
git merge origin/claude/gracious-clarke-cflgky   # branche de design : déjà fusionnée avec busy-carson
npm --prefix ui install
dist\Playscreen\start-engine.cmd                 # le vrai moteur
npm --prefix ui run tauri dev                     # Playscreen plein écran (Reprendre ne marche que là)
```

À vérifier avec la personne, manette en main :

- l'accueil s'ouvre sur le dernier jeu joué ; A le lance ;
- la capsule en haut à gauche, et l'aperçu de chaque espace ;
- Start ouvre le centre rapide (partout), et Select + Start pendant une partie y ramène ;
- dans le centre rapide : Reprendre, Quitter le jeu, Forcer la fermeture et le Volume
  utilisent **déjà le vrai moteur** (`client.stop`, `client.setVolume`, `resumeGame`) ;
- Paramètres › Stockage : les jeux installés, classés par taille (X : désinstaller).

Ce qui n'existe pas encore côté moteur est **caché** dans la vraie interface (luminosité,
Discord, musique, disque, trophées…). Pour le voir, c'est la démo.

## 2. Où brancher

Tout ce qui n'est pas un jeu passe par `ui/src/system.ts` (interface `SystemBridge`).
Aujourd'hui :

- version démo : `ui/src/demo/demo-system.ts` simule tout ;
- vraie interface : `NO_SYSTEM`, tout est `null` et les écrans le cachent.

Quand une fonction arrive dans l'API, deux possibilités :

1. **Elle concerne un jeu ou le moteur** (comme le volume, déjà fait) : l'ajouter à
   `EngineClient` (`api/client.ts`, `api/types.ts`, `openapi.yaml`, faux moteur), puis la
   passer aux écrans depuis `App.tsx`, et la retirer de `SystemBridge`.
2. **Elle concerne le PC** (luminosité, réseau, musique…) : remplacer `NO_SYSTEM` par une
   implémentation qui appelle l'API (garder les mêmes champs : les écrans n'ont pas à
   changer). Un champ `null` = l'écran cache l'élément.

La liste à jour est aussi dans `ui/README.md`, section « Pas encore possible ».

## 3. Par ordre de priorité (selon l'usage quotidien)

| # | Besoin | Écran | Piste | Champs attendus (`system.ts`) |
|---|---|---|---|---|
| 1 | **Alimentation** : veille, éteindre, redémarrer, « Bureau Windows » (cacher Playscreen, il reste en mémoire) | Centre rapide, Paramètres › Alimentation | `SetSuspendState`, `shutdown /s /t 0`, `shutdown /r /t 0` ; cacher la fenêtre Tauri | `power(action)` |
| 2 | **Musique en cours** : titre, artiste, lecture / pause, précédent / suivant | Centre rapide (« En fond »), aperçu Musique | Commandes multimédias de Windows (`GlobalSystemMediaTransportControlsSessionManager`) : marche pour Spotify comme pour une page web | `music`, `musicToggle`, `musicPrevious`, `musicNext` |
| 3 | **Espace disque** par lecteur, place prise par les jeux | Paramètres › Stockage, aperçu Paramètres ; avant une installation (F23) | `DriveInfo` | `disks` |
| 4 | **Luminosité** si l'écran la permet | Centre rapide (bouton → réglage) | Écran intégré (consoles portables) : WMI `WmiMonitorBrightnessMethods` ; écran externe : DDC/CI, souvent absent. `null` si non réglable | `brightness`, `setBrightness` |
| 5 | **Sortie audio** (télé, casque…) | Centre rapide, Paramètres › Son | Même API audio que le volume | `audioOutput`, `nextAudioOutput` |
| 6 | **Batterie de la manette**, **réseau** (Wi-Fi + nom, ou câble) | Centre rapide, Paramètres | XInput `XInputGetBatteryInformation` (la sentinelle lit déjà la manette) ; `NetworkInterface` | `controllerBattery`, `network` |
| 7 | **Clavier manette de Windows** à l'ouverture d'un champ de texte | Rechercher, navigateur, connexions | Clavier tactile, disposition « Gamepad » | (action à ajouter) |
| 8 | **Relais** : ouvrir les Paramètres Windows (`ms-settings:`) et activer la souris virtuelle de la sentinelle ; Select + Start pour revenir | Paramètres Windows…, Activer une clé | Sentinelle (mode assisté). Activer une clé : `steam://open/activateproduct` | (action à ajouter) |
| 9 | **Navigateur manette** : fenêtres web (Boutique, Social, Musique, Internet) qui restent ouvertes, cachées, en arrière-plan ; curseur aimanté, stick droit pour défiler, LT / RT pour zoomer | Toutes les pages web | Fenêtres WebView2 supplémentaires dans Tauri | (fenêtres à ajouter) |
| 10 | **Discord** : appel en cours (salon, nombre de personnes), couper le micro, quitter, messages non lus, amis en ligne | Centre rapide, aperçu Social | Discord tourne dans notre navigateur (point 9) : lire la page, ou raccourcis de Discord | `discord`, `toggleMicrophone`, `leaveCall` |
| 11 | **Trophées** par jeu, total, dernier obtenu | Accueil (ligne du jeu), Trophées | Données de l'extension Playnite SuccessStory | `trophies(gameId)`, `trophiesUnlocked`, `lastTrophy` |
| 12 | **Durée de la dernière partie** (« Joué hier, 1 h 12 ») | Accueil | Playnite ne la garde pas : la noter à chaque `game.stopped` | `lastSession(gameId)` |

## 4. Ce qu'il ne faut pas changer sans la session de design

- La mise en page et les styles des écrans « console » (`--cq` dans `theme.css`) : ils
  reprennent exactement les maquettes validées par la personne.
- Le centre rapide reste sur **Start, partout**, et remplace l'ancien menu et l'ancien menu
  rapide en jeu.

## 5. Deuxième vague (6 octobre 2026, après le test sur le PC)

Écrans ajoutés côté design. Ce qui manque au moteur est **caché** dans la vraie interface
(ou fait une action de repli) et **simulé** dans la démo. Code des écrans :
`ui/src/screens/GamePages.tsx`, `Launchers.tsx`, `Pages.tsx` (Musique), `QuickCenter.tsx`.

| # | Besoin | Écran | Piste | Où brancher |
|---|---|---|---|---|
| 13 ✅ | **Fermer une fenêtre web** (Discord, musique) pour libérer la mémoire | Centre rapide › En fond › « ✕ Fermer » | Commande Tauri `browser_close { window }` (détruire la WebView) ; aujourd'hui repli sur `browser_hide` | `browserClose()` dans `ui/src/shell.ts` |
| 14 ✅ | **Service de musique choisi** (liste de 11 services + lien personnalisé) | Musique › Changer de service | Rien côté moteur : la fenêtre « musique » ouvre `getSite("music").url` (préférence gardée dans le stockage de la fenêtre) | `ui/src/prefs.ts`, `MUSIC_SERVICES` |
| 15 ✅ | **Détail des trophées** d'un jeu : nom, description, date, rareté, secret | Trophées › un jeu ; page d'un jeu (« Derniers trophées ») | `GET /trophies/{gameId}` depuis SuccessStory (`Items` : Name, Description, DateUnlocked, Percent, IsHidden) | `trophyDetails()` dans `engine-system.ts` (renvoie `null` aujourd'hui) |
| 16 ✅ | **Workshop** (jeux Steam) | Page du jeu, Paramètres du jeu | Relais `steam-workshop:<appid>` → `steam://url/SteamWorkshopPage/<appid>` | `ui/src-tauri/src/relay.rs`, fonction `target()` |
| 17 ✅ | **Propriétés du jeu dans son launcher** | Page du jeu, Paramètres du jeu | Relais `game-properties:<store>:<id>` → Steam : `steam://gameproperties/<appid>` (à vérifier) ; Epic, Battle.net : page du jeu | `relay.rs` |
| 18 ✅ | **Favori, caché, vérifier les fichiers** | Paramètres du jeu | Playnite : `Game.Favorite`, `Game.Hidden` ; vérifier : `steam://validate/<appid>`, Epic `?action=verify` | `gameOptions`, `setGameOption`, `verifyGame` (`engine-system.ts`) ; les lignes s'affichent dès que `gameOptions` n'est plus `null` |
| 19 ⚠️ | **Installer un launcher** depuis Playscreen (premier démarrage, Comptes et launchers) | Relais `install-<launcher>` | Idéal : `winget install --id <LAUNCHERS[].winget> --silent` par le moteur (UAC : voir D9) ; sinon ouvrir `LAUNCHERS[].installUrl` en grand avec la souris | `relay.rs` ; catalogue dans `ui/src/screens/spaces.ts` (`LAUNCHERS`) |
| 20 ✅ | **Paramètres complets d'un launcher** | Comptes et launchers › Réglages › « Tous les paramètres » | Relais `launcher-settings-<store>` → `steam://open/settings`, Epic `com.epicgames.launcher://settings`, Battle.net / Xbox : fenêtre principale | `relay.rs` |
| 21 | Réglages recommandés (déjà faits : `GET/POST /launchers/settings`) | Comptes et launchers › Réglages | ✅ branché sur l'API existante | — |

**Fait le 6 octobre 2026 (session Windows)** :
- 13 : commande `browser_close` (la WebView est détruite ; si elle était affichée, retour à
  Playscreen et manette normale).
- 15 : `GET /trophies/{gameId}` → `[{ id, name, description, unlockedAt, rarity, secret }]`
  (404 sans trophées). `rarity` est null quand SuccessStory n'a pas la rareté.
- 16, 17, 20 : relais testés sur le PC. Steam : `steam://url/SteamWorkshopPage/<appid>`,
  `steam://gameproperties/<appid>` et `steam://open/settings` (les deux derniers sont des
  fenêtres à part, fermées au retour). Epic : `com.epicgames.launcher://settings` ;
  propriétés d'un jeu Epic → sa bibliothèque (pas de lien direct). Xbox, Battle.net :
  fenêtre principale.
- 18 : `POST /games/{id}/options?favorite=&hidden=` (événement `game.updated`, le jeu porte
  `favorite` et `hidden`) ; `POST /games/{id}/verify` (Steam `steam://validate`, Epic
  `?action=verify` : vérification confirmée dans les journaux des deux launchers ; 409 pour
  Xbox et Battle.net). **À faire côté design** : cacher les jeux `hidden` de l'accueil et de
  la bibliothèque (le moteur les renvoie toujours, pour pouvoir les « dé-cacher »).
- 19 : `winget install --silent` en arrière-plan, page officielle si winget échoue. ⚠️ Les
  installateurs demandent l'UAC, sur le **bureau sécurisé** que la manette ne pilote pas
  (F31) : pas testé ; la vraie solution est une tâche planifiée « administrateur » créée par
  l'installateur de Playscreen (D9).

Le premier démarrage (« Prépare ta console ») s'affiche quand la bibliothèque est vide et
que la personne ne l'a pas encore terminé (préférence `welcomed`). Il ne demande rien de
plus au moteur : `stores()` (launcher installé, compte connecté, nombre de jeux), `login`,
`sync`, et le relais `install-<launcher>` du point 19.

## 6. Après le test du 6 octobre au soir (session Windows)

Demandé par la personne, fait dans le moteur ; ce qui touche l'écran est déjà branché
dans `App.tsx` ou à dessiner :

- **Fenêtres surgissantes des sites** (connexion Google, Discord…) : vraies fenêtres,
  centrées, devant le site, fermées au retour sur Playscreen.
- **Souris pendant une installation / désinstallation** : dès que Playscreen perd le
  premier plan après la demande (fenêtre du launcher), la manette devient une souris ;
  elle redevient une manette au retour (`mouseWhileAway` dans `shell.ts`). Le relais
  `install-<launcher>` était déjà en mode souris.
- **Select + X** (sentinelle) : force ou coupe la souris manette, partout. **À dessiner** :
  le mentionner dans l'aide / les raccourcis.
- **Pas de téléchargement = pas « en téléchargement »** : si la personne revient sur
  Playscreen et qu'aucun téléchargement n'a commencé 15 s plus tard, `POST
  /games/{id}/install/cancel` (→ `install.cancelled`). La passerelle le fait aussi quand la
  fenêtre de confirmation du launcher se ferme sans téléchargement (tous les stores
  désormais). Si le launcher télécharge finalement, `install.progress` reprend.
- **Au lancement d'un jeu** : fenêtres web Boutique et Internet fermées (Discord et la
  musique gardés) ; autres launchers **vraiment fermés** (Steam proprement, Epic,
  Battle.net, Xbox arrêtés), sauf celui du jeu et ceux qui téléchargent. EA app, Ubisoft
  Connect ne sont pas touchés (certains jeux en ont besoin).
- **Jeux et applications hors launcher** : voir [`hors-launcher.md`](hors-launcher.md)
  (fenêtre mise devant, « Quitter », ajout depuis le menu Démarrer, retrait). **À dessiner** :
  « Ajouter une application », vignette sans jaquette, « Retirer de la bibliothèque ».
