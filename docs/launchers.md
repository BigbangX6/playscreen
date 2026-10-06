# Options des launchers : ce que Playscreen peut régler ou déclencher

> Relevé le 6 octobre 2026 sur le PC Windows (Steam client de septembre 2026, Epic 20.3.4,
> Battle.net 2.53). But : que chaque launcher **rende la main à Playscreen** (pas de fenêtre
> qui surgit, pas de launcher qui reste devant après une partie) et que la manette reste
> utilisable partout. Liste pensée pour une future page « Comptes et launchers » de l'interface.
>
> Légende : ✅ réglé ou déclenché par Playscreen et vérifié ; 🔧 clé connue, pas encore
> branchée ; ❓ à vérifier ; ⛔ impossible sans clic dans le launcher.

## Steam

Réglages par utilisateur dans `Steam\userdata\<id du compte>\config\localconfig.vdf`
(format VDF). **Steam réécrit ce fichier en quittant** : on le modifie Steam fermé
(`steam.exe -shutdown`), ou on accepte que le réglage ne tienne qu'après redémarrage.
L'identifiant du compte est `HKCU\Software\Valve\Steam\ActiveProcess\ActiveUser`.

| Option (interface de Steam) | Clé | Valeur pour Playscreen | État |
|---|---|---|---|
| En jeu › Ouvrir l'overlay Big Picture quand un contrôleur est utilisé | `EnableSCTenFootOverlayCheckNew` (localconfig.vdf) | `1` : Guide / Shift+Tab ouvre l'overlay **manette** de Steam en jeu, pas celui du bureau | ✅ `steam.bigPictureOverlay` (activée sur ce PC) |
| Interface › M'informer des ajouts ou modifications de mes jeux… | `NotifyAvailableGames` (localconfig.vdf) | `0` : moins de fenêtres qui surgissent | ✅ `steam.newsPopups` (écriture vérifiée Steam fermé, remise à 1 sur ce PC) |
| Interface › Lancer Steam au démarrage de l'ordinateur | `HKCU\…\CurrentVersion\Run\Steam` | à garder : Steam prêt plus vite (écran d'attente F26) | ❓ |
| Interface › Lancer Steam en mode Big Picture | ❓ | `0` (Playscreen remplace Big Picture) | ❓ |
| Interface › Choisir le compte à chaque lancement | ❓ | `0` (sinon fenêtre de choix à la manette) | ❓ |
| Contrôleur › Le bouton Guide place Steam au premier plan | ❓ | à discuter : Guide est exclu de Playscreen (D6), Steam le garde | ❓ |
| Contrôleur › Steam Input pour les manettes Xbox / génériques / Switch Pro | ❓ | désactivé (laisser XInput aux jeux et à la sentinelle) | ❓ |
| Contrôleur › Configuration du bureau / Raccourci du bouton guide | configurations Steam Input | ⛔ éditeur de Steam | ⛔ |
| Notifications › bulles (succès, manette connectée…) | ❓ | garder les succès, couper « contact se connecte » | ❓ |
| Téléchargements › Autoriser les téléchargements en cours de jeu | ❓ | `0` (jeux fluides) | ❓ |
| Interface (avancé) › Rendu accéléré par GPU pour les affichages web | ❓ | `0` sur les PC à écran virtuel (fenêtres transparentes, F22) | ❓ |

Adresses `steam://` utilisables par Playscreen (ouvrent Steam au bon endroit) :

| Adresse | Effet | État |
|---|---|---|
| `steam://open/settings` | Fenêtre « Paramètres Steam » | ✅ vérifié |
| `steam://open/activateproduct` | Activation d'une clé (relais « Activer une clé ») | ✅ vérifié |
| `steam://install/<appid>`, `steam://uninstall/<appid>` | Installer / désinstaller (déjà utilisés) | ✅ |
| `steam://rungameid/<appid>` | Lancer (utilisé par Playnite) | ✅ |
| `steam://validate/<appid>` | Vérifier les fichiers d'un jeu (dépannage) | 🔧 |
| `steam://open/downloads` | Gestionnaire de téléchargements | 🔧 |
| `steam://open/bigpicture` | Big Picture (secours manette pour un écran Steam) | 🔧 |
| `steam://exit` ou `steam.exe -shutdown` | Quitter Steam | ✅ (`-shutdown` utilisé en test) |

## Epic Games

Réglages dans `%LOCALAPPDATA%\EpicGamesLauncher\Saved\Config\WindowsEditor\GameUserSettings.ini`
(seules les valeurs modifiées y figurent : `;METADATA=(Diff=true)`). **Le fichier contient
aussi le jeton « se souvenir de moi » : ne jamais le copier ni l'afficher.**

| Option | Clé | Valeur pour Playscreen | État |
|---|---|---|---|
| Dossier d'installation par défaut | `[Launcher] DefaultAppInstallLocation` | dossier où Playscreen a les droits (D9) | 🔧 |
| Mises à jour automatiques (par jeu) | `[<compte>_Settings] <appid>_AutoUpdate` | à garder (sinon mise à jour au lancement, F26) | 🔧 |
| Créer un raccourci sur le bureau | `[Portal.Shortcut] AutoCreate` | `False` | 🔧 |
| Lancer au démarrage de l'ordinateur | `AutoEnabledStartOnBootVer` + clé `Run` | à garder (Epic prêt plus vite) | ❓ |
| Réduire dans la zone de notification, notifications de bureau, mode hors ligne | ❓ (pas encore dans le fichier de ce PC) | réduire ; couper les publicités | ❓ |

Adresses `com.epicgames.launcher://` :

| Adresse | Effet | État |
|---|---|---|
| `apps/<AppName>?action=install` | Fenêtre d'installation du jeu | ✅ (passerelle) |
| `apps/<AppName>?action=launch` | Lancer (utilisé par Playnite) | ✅ |
| `apps/<AppName>?action=verify` | Vérifier les fichiers | ❓ |
| `apps/<AppName>?action=uninstall` | — ignoré par le launcher (5 oct.) | ⛔ |
| `settings` | Ouvre Epic, mais **derrière** les autres fenêtres (6 oct.) ; page des réglages à confirmer | ❓ |

## Battle.net

Réglages en JSON clair dans `%APPDATA%\Battle.net\Battle.net.config` (section `Client`).

| Option | Clé | Valeur pour Playscreen | État |
|---|---|---|---|
| Démarrer réduit | `Client.AutoStartMinimized` | `true` (déjà le cas ici) | ✅ `battlenet.startMinimized` |
| Connexion automatique | `Client.AutoLogin` | `true` | 🔧 |
| Dossier d'installation par défaut | `Client.Install.DefaultInstallPath` | dossier avec droits (D9) | 🔧 |
| Au lancement d'un jeu : garder ouverte / réduire / réduire dans la zone de notification / quitter | `Client.GameLaunchWindowBehavior` (`"3"` = zone de notification, vérifié en changeant l'option ; absente = garder ouverte) | `3` : Battle.net ne revient pas devant après la partie | ✅ `battlenet.gameLaunch` (réglé sur ce PC) |
| Position des notifications | `Client.Toasts.ScreenPosition` | — | 🔧 |

Ligne de commande : `Battle.net.exe --game=<uid>` ouvre la page du jeu (utilisé pour
l'installation et son renvoi, F25), `--exec="launch <uid>"` lance un jeu (Playnite).

## Xbox (appli Xbox / Microsoft Store)

Pas encore étudié (phase 5 Xbox à faire). Pistes : `ms-windows-store://pdp/?productid=…`
(page d'un jeu), `msxbox://game/?productId=…` (appli Xbox), réglages de l'appli non
exposés dans un fichier connu.

## API

`GET /launchers/settings` liste les réglages ci-dessus marqués ✅ (valeur actuelle,
valeur recommandée, launcher ouvert ou non) ; `POST /launchers/settings/{id}/apply` écrit la
valeur recommandée, **launcher fermé seulement** (409 `running` sinon). Code :
`bridge/src/Api/LauncherSettings.cs`.

## Ce que Playscreen fait déjà pour reprendre la main

- Fenêtres de confirmation des launchers ramenées au premier plan (F27, `launcher.prompt`).
- Écran d'attente qui dit ce que fait le launcher (F26) et renvoi de la demande d'installation
  une fois le launcher prêt (F25).
- Relais avec souris virtuelle quand une fenêtre de launcher demande un clic (sentinelle).

## Prochaines étapes proposées

1. Préréglages à l'installation de Playscreen (ou au premier démarrage, launcher fermé) :
   overlay Big Picture de Steam, notifications réduites, Battle.net « quitter au lancement
   d'un jeu » après vérification de la clé.
2. Une page « Comptes et launchers » dans l'interface : chaque option avec sa valeur et un
   bouton « Régler pour Playscreen ».
3. Dépannage à la manette : « Vérifier les fichiers » (Steam, Epic).
4. F30 : savoir qu'une installation a été annulée dans le launcher (fenêtre de confirmation
   fermée sans téléchargement) pour ne pas rester sur « Téléchargement ».
