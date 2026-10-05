# Passation : session de développement sur le PC Windows

> Document écrit le 5 octobre 2026 par la session cloud (Linux) qui a démarré le projet,
> pour la session Claude Code qui tourne sur le PC Windows dédié.
> **À partir de maintenant, c'est la session Windows qui développe sur la branche
> `claude/busy-carson-3amj4g`.** La session cloud ne pousse plus rien dessus.
>
> Lis ce document en entier, puis `docs/plan.md`, `docs/decisions.md`,
> `docs/stores-v1.md` et `docs/frictions.md` avant de toucher au code.

---

## 1. Le projet et la personne avec qui tu travailles

### Objectif

**Playscreen** : une interface de jeu pour PC Windows (PC de salon branché à une télé,
consoles portables sous Windows), **entièrement utilisable à la manette**, avec la
simplicité d'une console PlayStation. Elle rassemble les jeux de plusieurs stores. La
promesse est l'expérience utilisateur : jamais bloqué, jamais besoin d'un clavier et
d'une souris.

### La personne

- **Elle n'est pas développeuse.** Explique simplement, en français, sans jargon (ou
  en le définissant). Dis ce que tu as fait, ce qui marche, ce qui ne marche pas, et ce
  que tu attends d'elle, en phrases courtes.
- Elle pilote cette session à distance (`claude remote-control`). **Toi, tu lances les
  commandes, compiles, démarres Playnite, lis les journaux et corriges. Elle, elle fait
  les actions à la souris et saisit les identifiants.**
- Elle tient à des retours honnêtes : si un test échoue, dis-le avec le message
  d'erreur. Si une étape n'a pas été faite, dis-le.

### Ce qu'elle veut

- **Zéro blocage prévisible** : aucune situation prévisible ne doit obliger à prendre un
  clavier et une souris. Repasser par Windows ou un launcher est acceptable si c'est
  **court, annoncé et accompagné**. Ce qui est insupportable, c'est d'être bloqué.
  Il faut anticiper les usages (voir `docs/frictions.md`).
- **Voir les launchers, oui, mais au minimum** : passer brièvement par Steam, Epic, etc.
  pour acheter, se connecter ou confirmer une installation ne la dérange pas.
- **Méta-raccourci : Select + Start maintenus 1 seconde** (acté). Le bouton Guide/PS est
  exclu, car Xbox Game Bar, Steam et le cloud gaming (Shadow PC…) se le disputent.
- **Une « sentinelle »** : mini-appli lancée au démarrage de Windows qui écoute
  Select + Start, affiche une notification au démarrage (avec les touches à presser), et
  lance Playscreen ou le ramène au premier plan.
- **Steam : connexion par QR code ET par identifiants saisis à la main**, les deux
  toujours proposés.
- **Installer un launcher manquant** : sans fenêtre si possible (`winget`), sinon la page
  de téléchargement officielle avec **gros curseur au stick et clavier manette** (celui
  de Windows 11 ou le nôtre).
- **Achat chez un revendeur de clés (Instant Gaming)** : le revendeur donne en général
  **un lien d'activation**. Playscreen doit l'intercepter et l'ouvrir au bon endroit.
- **Stores de la v1 : Steam, Epic, Game Pass / Xbox, et Battle.net si possible.**
- **Technologies web au maximum** pour l'interface (TypeScript).

### Ce qu'elle ne veut pas (ou pas maintenant)

- **Pas d'interface tout de suite.** Le moteur d'abord. L'interface viendra uniquement
  quand elle sera nécessaire pour tester un parcours.
- Pas de dépendance au bouton Guide.
- Pas de compte Playscreen au départ (proposé par la session cloud, non contesté) :
  tout est local.

---

## 2. Décisions et leurs raisons

Les décisions formelles sont dans `docs/decisions.md` (D1 à D8). En résumé, avec les
raisons qui n'y sont pas toutes écrites :

| Décision | Raison |
|---|---|
| **Playnite (MIT) comme moteur**, embarqué en version portable figée, démarré sans interface (`--startclosedtotray --hidesplashscreen`) | Il gère déjà la détection des bibliothèques, le lancement et le suivi des jeux. Licence MIT : redistribution permise (garder la notice, ne pas utiliser la marque). |
| **Pas de fork de Playnite** | Gros code WPF / .NET Framework à maintenir, aucun gain côté web. |
| **Pas d'extensions Playnite chargées hors de Playnite** | Elles dépendent de l'API de Playnite pendant qu'elles tournent (réglages, fenêtres de connexion intégrées). |
| **Notre extension « passerelle » livrée dans `Playnite\Extensions\`** | Playnite charge les extensions de son dossier programme : active d'office, rien à activer pour l'utilisateur. En mode portable, ce dossier est aussi celui des données. |
| **Notre propre API locale** entre l'interface et le moteur | L'interface ne dépend jamais de Playnite. On pourra remplacer Playnite store par store plus tard. |
| **HTTP + Server-Sent Events** (pas WebSocket) | Plus simple à écrire avec `HttpListener`, lisible par `curl`, `psc` et `EventSource` dans un navigateur. |
| **Jeton obligatoire sur l'API**, écoute sur 127.0.0.1 uniquement | Sans jeton, n'importe quelle page web ouverte dans un navigateur pourrait appeler `localhost` et lancer ou désinstaller des jeux. Le jeton est aussi accepté dans l'URL (`?access_token=`), car `EventSource` ne sait pas envoyer d'en-têtes. |
| **Faux moteur + `psc`** | Développer et tester sans Windows ni interface. `psc` permet de tester chaque phase sur le vrai PC sans interface. |
| **Node avec suppression native des types TypeScript**, sans étape de compilation | Zéro outillage : `node fichier.ts` marche. Contrainte : pas de syntaxe TypeScript non effaçable (`erasableSyntaxOnly` : pas d'`enum`, pas de propriétés de paramètres de constructeur, pas de `namespace`). |
| **Passerelle en .NET Framework 4.6.2** avec le paquet NuGet `PlayniteSDK 6.18.0` en `ExcludeAssets="runtime"` | C'est la cible des extensions Playnite 10. Le SDK est fourni par Playnite, il ne doit pas être copié dans la sortie. `Microsoft.NETFramework.ReferenceAssemblies` permet de compiler aussi sous Linux. |
| **Sentinelle en Rust**, XInput en arrière-plan | Toute petite, sans environnement d'exécution, et XInput lit la manette même sans focus. DualSense / Switch Pro : plus tard (HID ou SDL). |
| **Interface pressentie : Tauri (WebView2)** | Léger pour les consoles portables. *Pas encore tranché* (Electron en alternative). |
| **Les actions admin sont faites à l'installation de Playscreen** | La fenêtre UAC s'affiche sur un bureau sécurisé : **ni une manette ni un logiciel ne peuvent cliquer dessus**. On regroupe donc tout ce qui demande des droits admin au moment de l'installation, quand l'utilisateur a clavier et souris. On prévoit aussi un service avec privilèges pour la suite. |

### Ce que l'analyse du code des extensions Playnite a montré (octobre 2026)

Détails dans `docs/stores-v1.md`. L'essentiel :
- **Installer un jeu = le confier au launcher**, avec une friction variable :
  - Steam : `steam://install/<id>` puis une fenêtre de confirmation ;
  - **Epic : ouvre seulement la bibliothèque Epic**, le joueur doit chercher le jeu ;
  - Xbox : page du Microsoft Store ;
  - Battle.net : page du jeu dans le client.
- **Aucune progression de téléchargement** dans Playnite : l'installation est vérifiée
  toutes les 10 s. On devra lire la progression nous-mêmes (Steam : fichiers
  `appmanifest_<id>.acf`).
- « Connecter le compte » et « Importer les jeux non installés » sont **désactivés par
  défaut** dans les extensions : il faudra les préconfigurer (fichiers
  `ExtensionsData/<id du plugin>/config.json`).
- Steam n'a **pas besoin de clé API** : l'extension récupère un jeton web via une
  connexion au site Steam.
- **Xbox n'importe que les jeux déjà lancés** (historique Xbox) : le catalogue Game Pass
  n'apparaît pas. Il faudra notre propre vue du catalogue.
- Toutes les extensions partagent **le même cache du navigateur intégré** (CEF) : une
  connexion web faite par notre passerelle est vue par l'extension du store.
- Il n'existe pas de méthode publique « synchroniser la bibliothèque ». À la place :
  `LibraryPlugin.GetGames()` puis `Database.ImportGame(game, plugin)`.
- Identifiants des extensions Playnite : utiliser `BuiltinExtensions.GetIdFromExtension`
  (déjà fait dans `bridge/src/Api/Dto.cs`).

---

## 3. État exact du code

### Fait et testé (sous Linux, dans la session cloud)

| Brique | Dossier | Vérifié |
|---|---|---|
| Contrat d'API v0 | `api/openapi.yaml`, `api/types.ts` | Les deux sont synchronisés à la main |
| Client TypeScript | `api/client.ts`, `api/engine-info.ts` | Utilisé par les tests et `psc` |
| Faux moteur | `mock-engine/` | **9 tests passent** (`npm test`) ; `npm run typecheck` est propre |
| `psc` | `cli/src/psc.ts` | Essayé à la main contre le faux moteur : `games`, `stores`, `start`, `events` |
| Passerelle Playnite | `bridge/` | **Compile sans avertissement** (sous Linux). Jamais exécutée dans Playnite |
| Sentinelle | `sentinel/` | **5 tests passent**, `clippy` propre, compilation vérifiée pour la cible Windows (`x86_64-pc-windows-gnu`). Jamais exécutée sous Windows |

### Phase 1 validée sur le PC Windows (5 octobre 2026)

PC : Windows 11 Pro, Node 24.21, .NET SDK 10.0.102, pas de Rust. Puce Intel Iris Xe
**et écran virtuel Parsec** (la personne pilote le PC à distance).

- **Archive Playnite : `10.62.7z`** (133 Mo), sur
  `https://github.com/JosefNemec/Playnite/releases/download/10.62/10.62.7z`. C'est un
  **.7z**, pas un .zip : le script la décompresse avec le `tar` de Windows (libarchive).
  `Playnite.DesktopApp.exe` est bien à la racine, pas de `unins000.exe`.
- **Playnite 10 ne fournit plus les extensions de store** : l'archive ne contient aucun
  dossier `Extensions`. C'est l'assistant de premier démarrage qui les téléchargeait.
  Le script les télécharge donc lui-même (versions figées : Steam 2.47, Epic 2.30,
  Xbox 2.17, Battle.net 2.24, liens `playnite.link/download/extensions/bins/*.pext`)
  et les décompresse dans `Extensions\<Id>`, comme Playnite. Le service de Playnite
  qui donne ces liens : `https://api.playnite.link/api/addons/installer?addonId=<Id>`.
- **Assistant de premier démarrage sauté** : le script crée le dossier
  `Playnite\library` (Playnite considère alors la base comme existante).
- **`HttpListener` marche sans droits admin** sur `127.0.0.1:47800`. Pas besoin de
  serveur TCP maison ni de réservation d'URL.
- `psc status`, `stores`, `games` : OK. Les jeux déjà installés (Steam, Epic) sont
  importés tout seuls au premier démarrage.
- Sécurité : 401 sans jeton ou avec un mauvais jeton. Écoute sur 127.0.0.1 seulement.
- **Lancement** : `psc start notepad` ouvre le Bloc-notes, avec Playnite fenêtre
  ouverte comme caché dans la zone de notification. `game.starting`, `game.started`
  puis `game.stopped` (avec la durée) arrivent tout de suite par `psc events`.
- **CI** : active et verte sur la branche.

### Corrections faites pendant la validation

- `build-bundle.ps1` : .7z, extensions de store, dossier `library`, `$PSScriptRoot`
  vide dans les valeurs par défaut des paramètres sous Windows PowerShell 5.1, fichier
  enregistré en UTF-8 **avec BOM** (sinon PowerShell 5.1 abîme les accents).
- **Fenêtres de Playnite transparentes** (visibles dans la barre des tâches mais vides,
  plein écran qui bloque les clics) : causé par l'accélération graphique avec l'écran
  virtuel Parsec. `start-engine.cmd` passe maintenant `--forcesoftrender`.
- `psc events` se reconnecte quand le moteur redémarre (et relit `engine.json`, car le
  jeton change à chaque démarrage). Avant, il plantait (`ECONNRESET`).

### Phase 2 validée sur le PC Windows (5 octobre 2026)

- **Préconfiguration** (`build-bundle.ps1`) : `ExtensionsData\<id>\config.json` des
  4 extensions avec `ConnectAccount` et `ImportUninstalledGames` à `true` (cases bien
  cochées dans Playnite). Seuls les réglages utiles sont écrits, les autres gardent leur
  valeur par défaut ; `Version` évite les migrations de réglages des extensions.
- **`POST /stores/{id}/sync`** (`bridge/src/Api/StoreSync.cs`) : `GetGames` puis
  `ImportGame`, même logique que `GameDatabase.ImportGames` de Playnite (exclusions,
  jeux ajoutés à la main ou à l'état forcé laissés tranquilles). Événements :
  `sync.started`, `library.updated` (vraies listes d'identifiants), `store.updated`,
  `sync.finished`. 409 si une synchronisation tourne déjà. Compte non connecté :
  `ok: false, error: "not connected"` (seuls les jeux installés sont importés).
- **État des stores** : `launcherInstalled` vient de l'extension, sauf pour Xbox (son
  extension répond toujours « installé ») : on cherche le paquet `Microsoft.GamingApp_`
  dans le registre de l'utilisateur. `connected` lit `IsUserLoggedIn` des extensions par
  réflexion, en arrière-plan (appel réseau) : au démarrage et après chaque
  synchronisation. `null` tant que ce n'est pas vérifié ou en cas d'erreur.
- **Test réel** : la personne a connecté Steam dans Playnite (manette colorée →
  **Bibliothèque → Configurer les intégrations** → Steam → Connexion). `psc sync steam` :
  22 jeux non installés ajoutés (avec leur temps de jeu Steam), `connected: true`. Une
  2e synchronisation : 0 ajout, 0 doublon.
- Epic, Xbox et Battle.net : launchers installés sur ce PC, comptes pas encore connectés
  dans Playnite (`connected: false`).

### Programme et données séparés (5 octobre 2026)

- **Programme** : `dist\Playscreen\Playnite` (effacé à chaque reconstruction).
- **Données** : `%LOCALAPPDATA%\Playscreen\Playnite` (réglages, bibliothèque, cache du
  navigateur avec les connexions aux stores, `ExtensionsData`, **journaux
  `playnite.log` et `extensions.log`**). `start-engine.cmd` passe
  `--userdatadir` ; Playnite le transmet aussi quand il redémarre en plein écran.
- **Réglages par défaut** : `dist\Playscreen\defaults` (dossier `library` vide,
  `config.json` avec `DisableHwAcceleration`, réglages des 4 extensions).
  `start-engine.cmd` les copie avec `robocopy /XC /XN /XO` : seulement les fichiers
  absents, jamais par-dessus un réglage existant (la connexion Steam est gardée).
- `DisableHwAcceleration` dans `config.json`, en plus de `--forcesoftrender` : Playnite
  ne transmet pas `--forcesoftrender` quand il passe en plein écran.
- Vérifié : reconstruction complète sans perte (Steam toujours connecté, 29 jeux) et
  premier démarrage avec un dossier de données vide (pas d'assistant, réglages appliqués).
- Les données de ce PC ont été déplacées une fois à la main depuis l'ancien paquet
  (`DatabasePath` remis à `null` dans `config.json`, car il pointait vers
  `{PlayniteDir}\library`).

### Phase 3 : connexions (5 octobre 2026)

- **`POST /stores/{id}/login`** (`bridge/src/Api/StoreLogin.cs`) : déclenche par
  réflexion la commande `LoginCommand` du modèle de réglages de l'extension (le bouton
  « Connexion »), sur le thread d'interface. Un minuteur repère les nouvelles fenêtres :
  fenêtres WPF agrandies (si redimensionnables) et mises au premier plan **une fois**
  (pas « toujours au-dessus »), fenêtres natives du navigateur intégré (surgissantes,
  avec barre de titre) agrandies via Win32 (`NativeWindows.cs`). Quand toutes sont
  fermées : `EndEdit()` (comme « Sauvegarder »), connexion revérifiée, `store.updated`.
  Une connexion à la fois (409). `?method=alternative` → `LoginAlternativeCommand`
  (Epic : navigateur du système + code à coller).
- `psc login <store> [--alternative]` attend la fin et affiche « Connecté » ou non.
- **Testé avec les vrais comptes** : Battle.net (identifiant Blizzard, puis
  `psc sync battlenet` : Overwatch 2), Epic (d'abord en alternative, puis avec le bouton
  Google dans la fenêtre agrandie : tout se ferme tout seul une fois connecté ;
  `psc sync epic` : 5 jeux), Xbox (compte Microsoft, sans Game Pass ; `psc sync xbox` :
  3 jeux déjà lancés, dont Fortnite joué via xCloud). Steam avait été connecté par
  l'interface de Playnite. **Les 4 stores sont connectés sur ce PC.**
- Xbox enregistre ses jetons juste après la fermeture de sa fenêtre : la première
  vérification disait « non connecté ». La passerelle revérifie maintenant jusqu'à
  4 fois, à 3 s d'intervalle (correction déployée, pas encore revue sur une nouvelle
  connexion Xbox).
- Découvertes : F19 (pare-feu pour `Playnite.BrowserProcess`), F20 (fenêtre Google
  cachée par une fenêtre « toujours au-dessus »), F21 (pas de retour arrière), voir
  `frictions.md`.
- Mes captures d'écran PowerShell sont tronquées (affichage à 125 % : la capture n'est
  pas « DPI-aware »). Ce n'est pas un défaut des fenêtres.

### Phase 4 : sentinelle (5 octobre 2026, test manette en attente)

- **Rust installé** (accord de la personne) avec `rustup`, **variante GNU**
  (`stable-x86_64-pc-windows-gnu`, profil minimal + clippy) : pas besoin des outils de
  compilation Microsoft (plusieurs Go, admin). `cargo` est dans
  `%USERPROFILE%\.cargo\bin` (à ajouter au `PATH` d'un terminal déjà ouvert).
- **`windows` 0.62 remplacé par `windows-sys` 0.59** : avec la variante GNU, `windows`
  0.62 exige `dlltool` (absent). `windows-sys` 0.59 fournit ses bibliothèques
  d'import.
- Ajouts : icône dans la zone de notification avec menu « Quitter la sentinelle »,
  notification « Playscreen est prêt » au démarrage (bulle de l'icône), lecture de la
  manette par un minuteur de la boucle de messages, mise au premier plan avec
  `AttachThreadInput` (contournement de la limite de `SetForegroundWindow`), journal
  `%LOCALAPPDATA%\Playscreen\sentinel.log`, titre de fenêtre configurable
  (`PLAYSCREEN_WINDOW`).
- Vérifié : compilation, `clippy` propre, 5 tests, démarrage (journal). **Pas encore
  vérifié** : la notification et l'icône à l'écran, le méta-raccourci avec une vraie
  manette (aucune manette sur le PC le jour du test), la mise au premier plan.
- **Test prévu** : `PLAYSCREEN_EXE=calc.exe`, `PLAYSCREEN_WINDOW=Calculatrice` (le
  Bloc-notes ne convient pas : son titre dépend des onglets restaurés). Select + Start
  ouvre la Calculatrice au premier plan ; la remettre derrière, Select + Start la
  ramène devant.
- Reste : démarrage automatique avec Windows (clé `Run` de l'utilisateur, à faire avec
  l'accord de la personne), DualSense / Switch, icône Playscreen.

### Phase 5 : installation et progression Steam (5 octobre 2026, en cours)

- `POST /games/{id}/install` (Steam) : `api.InstallGame` (Steam ouvre sa fenêtre de
  confirmation, F4), puis `InstallProgress.cs` suit l'installation chaque seconde et
  publie `install.progress`. `game.installed` vient de Playnite (vérification toutes
  les 10 s). `psc install <jeu>` affiche le pourcentage jusqu'à « Installé ».
- **Ce que Steam écrit** : `appmanifest_<id>.acf` contient `BytesToDownload` (taille
  compressée) et `BytesToStage` (taille installée), mais **seulement au début et à la
  fin**, pas pendant le téléchargement. Steam **réserve d'emblée** la place des
  fichiers (« preallocated » dans `logs\content_log.txt`) : la taille du dossier
  `downloading\<id>` est donc inutilisable (essayé : 99 % dès la 1re seconde).
- **Mesure retenue** : octets écrits sur le disque par `steam.exe` depuis la demande
  (`GetProcessIoCounters`, `ProcessWrites.cs`), rapportés à `BytesToStage` (taille
  installée), plafonnés à 99 % jusqu'à `StateFlags` « installé ». **Validé** sur
  MOTiON by RADiCAL (2,2 Go, 40 s) en comparant à la barre « Installation des
  fichiers » de Steam par captures d'écran : 46 % contre 43 %, puis 99 % contre 98 %.
  (Une première formule, « Steam écrit tout deux fois », venait d'une mesure faussée
  par les addons de Garry's Mod.)
- Captures d'écran complètes : le processus doit être « DPI-aware »
  (`SetProcessDPIAware`), sinon l'image est tronquée (affichage à 125 %).
- Testé : Among Us et MOTiON by RADiCAL installés de bout en bout (`game.installed`
  reçu). Garry's Mod installé puis désinstallé par la personne (addons Workshop : F23).
- **Epic** : le lien `com.epicgames.launcher://apps/<AppName>?action=install` marche
  (fenêtre « Choisir l'emplacement de l'installation », un clic sur « Installer ») ;
  la passerelle l'ouvre en plus de `api.InstallGame` (qui n'ouvre que la bibliothèque
  Epic). Suivi : fichier du jeu dans `Manifests\Pending` pendant l'installation, puis
  dans `Manifests` ; direct = octets écrits par `EpicGamesLauncher` (≈ taille
  installée : 7,3 Go écrits pour la mise à jour de Fall Guys, 7,39 Go ; 972 Mo pour
  Unrailed, 0,95 Go). Le fichier `Pending` contient `InstallSize` dès le début.
  **Validé** sur la réinstallation de Fall Guys (7,39 Go, 1 min 45, 96 étapes) :
  40,1 % côté passerelle contre 40,1 % dans la fenêtre de téléchargement d'Epic au
  même instant (Epic affiche la taille téléchargée, 6,56 Go ; nous la taille
  installée).
  Découvertes : UAC à cause du dossier `Program Files` (F24), demande perdue après la
  mise à jour du launcher (F25).
- **Désinstallation** : `psc uninstall <jeu>` attend `game.uninstalled`. Steam :
  `steam://uninstall/<id>` (fenêtre de confirmation). Epic : l'extension ouvre la
  bibliothèque ; **pas de lien direct** (`?action=uninstall` ignoré par le launcher) :
  le joueur clique sur « ⋯ » puis « Désinstaller » (mode assisté à prévoir). Testé :
  Fall Guys désinstallé, événement reçu.
- **Battle.net** : `api.InstallGame` ouvre la page du jeu dans le client (`--game=`),
  le joueur clique sur « Installer » ; désinstallation via le « Blizzard Uninstaller »
  (testé sur Warcraft Rumble, sans UAC, `game.uninstalled` reçu). Suivi :
  l'agent (`Agent.exe`, API locale 127.0.0.1:1120 qui exige une autorisation)
  **note dans son journal** `%PROGRAMDATA%\Battle.net\Agent\Agent.*\Logs\Agent-*.log`
  ses réponses à `GET /install/<uid>`, environ chaque seconde : `progress` (0 à 1),
  `download_total`, `installed`. Ce sont les chiffres de Battle.net (13 %,
  920,43 Mo / 6,75 Go des deux côtés sur Warcraft Rumble). `<uid>` = `InternalId` de
  la table `BattleNetLibrary.BattleNetGames.Games` de l'extension (champs publics, pas
  des propriétés), lue par réflexion : `GRY` → `gryphon`, `Pro` → `prometheus`.
  Lecture du journal et correspondance vérifiées séparément ; **le parcours complet
  `psc install` avec progression n'a pas encore été vu** (la première tentative avait
  la correspondance cassée, corrigée ensuite).
- Hearthstone n'est pas proposé sur ce PC (« non disponible sur cet appareil ») ;
  Warcraft Rumble ne s'ajoute pas à la bibliothèque sans l'installer.
- **Décision D9 testée** : `icacls "C:\Program Files\Epic Games" /grant
  "<utilisateur>:(OI)(CI)M"` (une UAC), puis réinstallation de Fall Guys dans ce
  dossier par défaut sans nouvelle UAC.
- Reste : Battle.net, Xbox (pas de suivi), téléchargements Workshop, annonce de
  l'espace nécessaire.

### Jamais testé sous Windows

- La sentinelle avec une vraie manette (XInput, mise au premier plan).

### Points fragiles connus

1. **Ne pas lancer `Playnite.DesktopApp.exe` directement quand le moteur est arrêté** :
   sans `--userdatadir`, Playnite démarrerait avec un dossier de données vide dans le
   paquet. Toujours passer par `start-engine.cmd`. Quand le moteur tourne, relancer
   l'exécutable ramène simplement sa fenêtre.
2. **Mode plein écran de Playnite** : le menu de l'icône de la zone de notification
   permet de basculer en plein écran, ce qui redémarre Playnite (et notre passerelle).
   La passerelle repart toute seule, mais l'interface devra supporter ce redémarrage.
3. **PowerShell** : la stratégie d'exécution peut bloquer le script. Utiliser
   `powershell -ExecutionPolicy Bypass -File .\packaging\build-bundle.ps1 ...`.
4. **Connexion Xbox asynchrone** : la passerelle attend l'apparition d'une fenêtre
   jusqu'à 20 s, puis revérifie la connexion quelques secondes après sa fermeture.
5. **Événement `library.updated`** : après une synchronisation, il donne les vrais
   identifiants. Quand Playnite met à jour sa bibliothèque lui-même (au démarrage), il
   envoie des listes vides : l'interface devra alors recharger la liste.
6. **Mise à jour automatique de la bibliothèque au démarrage** : Playnite importe déjà
   tous les stores à chaque démarrage. Avec un compte non connecté, l'extension Xbox
   remplit le journal d'erreurs (`xsts.json` introuvable) : sans gravité.
7. **Arrêter Playnite proprement** : `Playnite.DesktopApp.exe --shutdown`.

---

## 4. Instructions pour la session Windows

### Avant de commencer

1. `git pull origin claude/busy-carson-3amj4g`.
2. Dans `Documents\playscreen` : `npm install`, `npm run typecheck`, `npm test`.
3. `dotnet build bridge\Playscreen.Bridge.csproj -c Release`.
4. Si Rust n'est pas installé, ne l'installe pas tout de suite : la sentinelle attendra
   la phase 4. Demande l'accord de la personne avant d'installer un logiciel.

### Étape A — Valider la phase 1 de bout en bout ✅ (5 octobre 2026, voir § 3)

1. **Obtenir l'archive portable de Playnite** (page des versions sur GitHub, projet
   `JosefNemec/Playnite`). Télécharge-la toi-même si tu peux ; sinon demande à la
   personne. Note dans ce document le nom exact du fichier et sa version.
2. **Assembler le paquet** : `build-bundle.ps1 -PlayniteZip <archive>`. Vérifie la
   structure de `dist\Playscreen\` (exécutable à la racine de `Playnite\`, passerelle
   dans `Playnite\Extensions\Playscreen_Bridge\`).
3. **Démarrer le moteur** : `dist\Playscreen\start-engine.cmd`.
   - Si l'assistant de premier démarrage s'ouvre : **arrête-toi et demande à la personne
     de le terminer à la souris** (sans connecter de store pour l'instant). Puis cherche
     comment le sauter automatiquement (point fragile 3) et intègre-le au script.
4. **Lire `playnite.log`** (aujourd'hui dans `%LOCALAPPDATA%\Playscreen\Playnite\`) :
   l'extension est-elle chargée ?
   Le serveur a-t-il démarré (« Playscreen API listening on port 47800 ») ?
   `%LOCALAPPDATA%\Playscreen\engine.json` existe-t-il ?
5. **`npm run psc -- status`** : doit répondre `engine: 'playnite'`, `ready: true`.
   - En cas d'erreur d'accès du serveur HTTP : point fragile 1, option (a).
6. **`npm run psc -- stores`**, puis **`npm run psc -- games`** : 4 stores avec
   `pluginInstalled: true`, et probablement 0 jeu.
7. **Ajouter un jeu de test** : **arrête-toi et demande à la personne** d'ajouter dans
   Playnite (icône de la zone de notification, puis ajout manuel d'un jeu) un faux jeu
   nommé **Notepad** qui pointe vers `C:\Windows\System32\notepad.exe`. Explique-lui simplement où cliquer.
8. **`npm run psc -- events`** dans un terminal, et **`npm run psc -- start notepad`**
   dans un autre. Attendu : le Bloc-notes s'ouvre, et `game.starting`, `game.started`
   s'affichent, puis `game.stopped` à sa fermeture.
9. **Vérifier la sécurité** : une requête sans jeton
   (`curl http://127.0.0.1:47800/api/v0/status`) doit répondre 401.
10. Faire tourner la CI : vérifier qu'elle se lance sur GitHub et qu'elle est verte.
    Corriger si besoin.

Pour chaque échec : lis le journal, corrige, recompile, recommence. Quand la phase 1
marche, **résume à la personne en quelques phrases simples** ce qui marche, ce que tu as
corrigé et ce qui reste fragile, puis mets à jour ce document (§ 3) et
`docs/plan.md`.

### Étape B — Phase 2 : préconfiguration et synchronisation ✅ (5 octobre 2026, voir § 3)

Voir `docs/plan.md`. Dans l'ordre :
1. **Préconfiguration** dans `build-bundle.ps1` : écrire les réglages des 4 extensions
   (Steam, Epic, Xbox, Battle.net) dans `Playnite\ExtensionsData\<id>\config.json`, avec
   le compte connecté et l'import des jeux non installés activés. Lis d'abord les noms
   exacts des réglages dans le code des extensions (`JosefNemec/PlayniteExtensions`,
   fichiers `*SettingsViewModel.cs`).
2. **`POST /stores/{id}/sync`** dans la passerelle : `LibraryPlugin.GetGames()` puis
   `Database.ImportGame(game, plugin)`, sur un fil d'arrière-plan, avec les événements
   `sync.started` / `sync.finished`. Gérer les doublons (jeu déjà en base) et les mises à
   jour d'état (installé / désinstallé).
3. **État des stores** : `launcherInstalled` (détection du launcher) et `connected`
   (au minimum `null` si inconnu, jamais une fausse certitude).
4. **Garder le faux moteur aligné** : chaque changement d'API se fait dans
   `api/openapi.yaml`, `api/types.ts`, le faux moteur et ses tests, puis la passerelle.
5. **Test** : `psc sync steam` sur un compte Steam réel. **Arrête-toi pour que la
   personne installe Steam et s'y connecte** (identifiants ou QR code).

### Quand t'arrêter pour demander une action à la personne

Arrête-toi, explique en une ou deux phrases simples ce qu'il faut faire et pourquoi, puis
attends sa réponse, dans ces cas :
- **une action à la souris** dans une interface (assistant Playnite, ajout d'un jeu,
  fenêtre d'un launcher, confirmation) ;
- **des identifiants**, un QR code à scanner, une validation 2FA. Ne demande jamais
  qu'on te donne un mot de passe : la personne le tape elle-même dans la fenêtre ;
- **une fenêtre UAC** ou toute action qui demande des droits admin ;
- **installer un logiciel** sur le PC (launcher, Rust, outils…) ou modifier un réglage
  Windows ;
- **une action irréversible ou risquée** : supprimer des données en dehors du dossier
  du projet, désinstaller un jeu réel, toucher au registre ;
- **un test physique** : manette, télé, redémarrage du PC ;
- **un choix de produit** qui n'est pas tranché dans `docs/` (par exemple Tauri ou
  Electron) ;
- **avant toute création de pull request** ou tout push sur une autre branche.

---

## 5. Règles à respecter

### Sécurité

- L'API écoute **uniquement sur 127.0.0.1**, jamais sur `0.0.0.0` ni sur le réseau.
- **Chaque requête exige le jeton** (`Authorization: Bearer <jeton>`, ou
  `?access_token=` pour `EventSource`). Le jeton est aléatoire à chaque démarrage et
  écrit dans `%LOCALAPPDATA%\Playscreen\engine.json`. Ne jamais l'écrire dans les
  journaux, ni dans un commit, ni le désactiver « pour tester ».
- **Aucun identifiant, jeton de store ou cookie** dans le dépôt, les journaux ou les
  messages. Les connexions aux stores passent par les fenêtres officielles, et la
  personne tape elle-même ses identifiants.
- Licence de Playnite (MIT) : conserver la notice en cas de redistribution, ne pas
  utiliser la marque Playnite. Outils GPL (Legendary…) : seulement comme exécutables
  séparés, et pas avant validation juridique.

### Code

- Écrire comme le code autour : même densité de commentaires, mêmes noms, mêmes idiomes.
- **Commentaires et documentation en français**, identifiants (variables, fonctions,
  classes) en anglais.
- TypeScript : syntaxe effaçable uniquement (pas d'`enum`, pas de `namespace`, pas de
  propriétés de paramètres de constructeur), imports avec l'extension `.ts`, aucune
  étape de compilation. Tests avec `node:test`.
- C# : .NET Framework 4.6.2, pas de `ValueTuple` (non disponible sans paquet en 4.6.2),
  sérialisation avec `Playnite.SDK.Data.Serialization` et `SerializationPropertyName`
  en camelCase. Les actions de jeu passent par le thread d'interface de Playnite.
- Rust : `cargo clippy --all-targets -- -D warnings` propre, logique pure testée
  séparément du code Windows.
- **L'API est un contrat** : toute modification touche `api/openapi.yaml`,
  `api/types.ts`, le faux moteur et ses tests, puis la passerelle.
- Avant chaque commit : `npm run typecheck`, `npm test`, compilation de la passerelle
  sans avertissement, et les tests de la sentinelle si elle a été modifiée.

### Commits et branches

- Branche unique : **`claude/busy-carson-3amj4g`**. Toujours `git pull` avant de
  travailler, `git push -u origin claude/busy-carson-3amj4g` après.
- Messages de commit **en français**, courts, au format déjà utilisé : préfixe quand
  c'est pertinent (`docs: …`), puis une liste à puces si le commit touche plusieurs
  briques. Ne jamais mettre de nom ou d'identifiant de modèle dans un commit.
- Pas de pull request sans demande explicite de la personne.

### Langue et communication

- Tout en **français** : échanges, documentation, commentaires, messages de commit.
- Avec la personne : phrases simples, pas de jargon non expliqué, résultats honnêtes.
  Une liste courte de ce qui marche, ce qui ne marche pas et ce qui est attendu d'elle.
- Mettre à jour `docs/` quand une décision est prise ou qu'un point fragile est résolu.
