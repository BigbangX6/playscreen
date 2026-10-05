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
