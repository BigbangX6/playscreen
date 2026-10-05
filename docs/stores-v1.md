# Stores v1 : Steam, Epic, Game Pass, Battle.net

> Analyse faite en lisant le code des intégrations officielles de Playnite
> (`JosefNemec/PlayniteExtensions`, licence MIT, état d'octobre 2026), complétée par des
> recherches web. Les points marqués **(à vérifier)** n'ont pas été confirmés par le
> code ou une source fiable.

## 1. Comment notre passerelle interagit avec Playnite

C'est le cœur technique. Voici ce que l'API de Playnite permet réellement à une
extension comme la nôtre :

| Besoin Playscreen | Moyen dans Playnite | Remarque |
|---|---|---|
| Lire la bibliothèque | `PlayniteApi.Database.Games` + événements de modification | Direct |
| Lancer / installer / désinstaller | `PlayniteApi.StartGame / InstallGame / UninstallGame(id)` | Délègue aux contrôleurs de chaque extension (voir §2) |
| Savoir qu'un jeu tourne / s'arrête | Événements `OnGameStarted` / `OnGameStopped` | Détection par surveillance des processus du dossier du jeu |
| Savoir qu'une installation est finie | Événement `OnGameInstalled` | Les extensions vérifient toutes les **10 s** ; **aucune progression** |
| Synchroniser une bibliothèque à la demande | Pas de méthode publique « mettre à jour la bibliothèque ». On appelle `LibraryPlugin.GetGames()` puis `Database.ImportGame(game, plugin)` | Possible : nous pilotons la synchro nous-mêmes |
| Accéder aux autres extensions | `PlayniteApi.Addons.Plugins` donne les instances (Steam, Epic…) | Accès à leurs réglages ; certaines méthodes (connexion) seulement par réflexion |
| Préconfigurer les extensions | Fichiers `ExtensionsData/<id>/config.json` écrits par notre installateur | Pour activer d'office « connecter le compte » et « importer les jeux non installés », **désactivés par défaut** (fait dans `build-bundle.ps1`) |
| Savoir si le launcher est installé | `LibraryPlugin.Client.IsInstalled` | ⚠️ L'extension Xbox répond toujours `true` : la passerelle cherche elle-même l'appli Xbox |
| Savoir si le compte est connecté | Propriété `IsUserLoggedIn` du modèle de réglages de chaque extension (hors SDK, lue par réflexion) | Appel réseau : à faire en arrière-plan |
| Fenêtres de connexion | `PlayniteApi.WebViews.CreateView(...)` (navigateur CEF intégré) | **Taille réglable** : on peut ouvrir des fenêtres de connexion en grand, adaptées à la télé |
| Partage de session web | Toutes les extensions partagent le **même cache CEF** (`browsercache`) | Une connexion faite par notre passerelle sur le site Steam ou Battle.net est **vue par l'extension correspondante** |

**À retenir :**
- La synchronisation, la préconfiguration et les fenêtres de connexion sont
  **entièrement pilotables** par notre passerelle.
- Les points faibles sont **l'installation** (déléguée aux launchers, avec plus ou moins
  de friction) et **l'absence de progression** de téléchargement. Ce sont nos deux
  chantiers propres.

## 2. Tableau des stores

### Vue d'ensemble

| | Steam | Epic | Game Pass / Xbox | Battle.net |
|---|---|---|---|---|
| **Installer le launcher** | winget `Valve.Steam` | winget `EpicGames.EpicGamesLauncher` | appli Xbox : winget `Microsoft.GamingApp` + Gaming Services | winget `Blizzard.BattleNet` |
| **Droits admin pour l'installer** | oui (à vérifier) | oui (MSI) | oui (Gaming Services) | oui (à vérifier) |
| **Connexion au launcher, à la manette** | ✅ **QR code** via l'appli mobile Steam, ou identifiants au clavier manette | ⚠️ identifiants (pas de QR connu) | ⚠️ compte Microsoft (souvent déjà connecté à Windows) | ⚠️ identifiants + validation en un bouton sur l'appli mobile |
| **Connexion côté Playnite** | site Steam dans CEF (le QR y est aussi proposé) | page de connexion Epic dans CEF, jetons OAuth enregistrés dans un fichier | connexion Microsoft (OAuth) dans CEF, jetons dans un fichier | site Battle.net dans CEF (cookies) |
| **Jeux non installés** | ✅ liste complète des jeux possédés (jeton web, sans clé API) | ✅ liste complète | ⚠️ **seulement les jeux déjà joués** (historique Xbox) : le catalogue Game Pass n'apparaît pas | ✅ liste des jeux et abonnements |
| **Installer un jeu** | `steam://install/<id>` puis fenêtre de confirmation Steam | ❌ **ouvre seulement la bibliothèque Epic** : le joueur doit trouver le jeu et cliquer | page du Microsoft Store | ouvre la page du jeu dans Battle.net (`--game=<id>`), le joueur clique sur « Installer » |
| **Lancer** | `steam://rungameid/<id>` (silencieux) | lien Epic `?action=launch&silent=true` | exécutable du paquet | `Battle.net.exe --exec="launch <id>"` après démarrage du client |
| **Progression du téléchargement** | fichiers `appmanifest_<id>.acf` (octets téléchargés / à télécharger) | à étudier | à étudier (difficile, paquets MSIX) | à étudier |

### Steam — le meilleur élève

- **Connexion : QR code ET identifiants saisis à la main**, les deux toujours proposés.
  La page de connexion Steam affiche les deux côte à côte : on garde les deux visibles,
  et le clavier manette s'ouvre quand le joueur choisit les identifiants. Le QR code de
  l'appli mobile Steam existe à la fois dans le client et sur la page de connexion web. Avec le cache CEF partagé, **une seule connexion web
  (par QR) sert à toute la bibliothèque**. Le client Steam demande sa propre connexion
  (encore un QR) : 2 scans au total, sans clavier.
- **Installation :** la fenêtre de confirmation Steam s'ouvre. On la met au premier plan
  et on active le mode assisté (curseur + clavier manette).
- **Piste :** Steam permet le **téléchargement à distance** depuis son site et son appli
  mobile, et l'extension Playnite utilise déjà le service `IClientCommService` pour lister
  les jeux. Si ce service permet aussi de **lancer une installation sans fenêtre**, la
  friction disparaît. **(à vérifier)**
- **Progression :** lecture des manifestes `.acf` : faisable et fiable.

### Epic — le plus de friction à l'installation

- **Connexion :** page web Epic dans CEF (identifiants, 2FA éventuelle), puis connexion
  au launcher : **2 connexions** à faire au clavier virtuel. Piste : vérifier si le
  launcher peut réutiliser la session (fichiers de jetons). **(à vérifier)**
- **Installation :** l'extension Playnite a **renoncé** au lien d'installation direct
  (commentaire dans le code : l'ancien lien affiche un vieux dialogue sans progression).
  Elle ouvre juste la bibliothèque Epic.
- **Pistes Playscreen :**
  1. tester à nouveau le lien `?action=install` (il marche peut-être bien aujourd'hui) ;
  2. sinon, mode assisté avec instruction claire (« Sélectionne le jeu et appuie sur
     Installer ») ;
  3. à terme, **Legendary** (client Epic open source, GPL-3) pour installer sans le
     launcher, utilisé comme exécutable séparé.

### Game Pass / Xbox — le cas particulier

- **Connexion :** le compte Microsoft est souvent déjà celui de Windows. La connexion
  côté Playnite reste une fenêtre OAuth Microsoft (identifiants ou code envoyé sur le
  téléphone).
- **Bibliothèque :** l'extension ne voit que les jeux **déjà lancés** (historique de
  titres Xbox). Pour un abonné Game Pass, il faut **notre propre vue du catalogue
  Game Pass**. Microsoft expose des listes de catalogue publiques utilisées par
  xbox.com. **(à vérifier)**
- **Installation :** Playnite ouvre la page du Microsoft Store. Pour le Game Pass, l'appli
  Xbox est plus adaptée (protocole `xbox:` disponible, syntaxe exacte **à vérifier**).
  L'appli Xbox a par ailleurs un mode plein écran pensé pour la manette.
- **Dépendance :** Gaming Services doit être installé et fonctionnel. C'est une source
  connue de pannes, à détecter et à réparer avec l'outil de réparation de Microsoft.

### Battle.net

- **Connexion :** le site Battle.net dans CEF, et le client séparément. Le cache partagé
  permet de faire la connexion web une seule fois. La validation peut se faire en un
  bouton sur l'appli mobile Battle.net (et non par QR). Les passkeys sont aussi prises
  en charge.
- **Installation :** le client s'ouvre sur la page du jeu, puis on bascule en mode assisté
  pour le clic sur « Installer ».
- **Lancement :** Playnite démarre d'abord le client et attend qu'il soit prêt
  (plusieurs secondes), puis lance le jeu. Il faudra un écran d'attente soigné.

## 3. Ce que ça implique pour Playscreen

1. **Préconfigurer** les 4 extensions à l'installation : connexion du compte et import
   des jeux non installés activés.
2. **Piloter la connexion depuis notre passerelle** avec de grandes fenêtres CEF,
   QR code mis en avant, mode assisté actif.
3. **Écrire nos lecteurs de progression**, en commençant par Steam (`.acf`).
4. **Construire la vue du catalogue Game Pass** nous-mêmes.
5. **Recherches à mener en priorité :** installation Steam à distance sans fenêtre,
   lien d'installation Epic direct, protocole d'installation de l'appli Xbox.
