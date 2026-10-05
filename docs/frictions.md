# Catalogue des blocages prévisibles

> Règle d'or : **le joueur ne doit jamais avoir besoin d'un clavier ou d'une souris
> pour se sortir d'une situation prévisible.** Repasser par Windows est acceptable ;
> rester bloqué ne l'est pas.
>
> Chaque blocage connu est listé ici avec sa parade. Ce catalogue sert aussi de
> **plan de test** sur matériel réel.

## Stratégies générales

1. **Regrouper les frictions inévitables au moment de l'installation de Playscreen.**
   C'est le seul moment où l'on peut raisonnablement supposer un clavier et une souris.
   On y fait tout ce qui demande des droits admin : installation des launchers choisis,
   Gaming Services, préconfiguration.
2. **Mode assisté** (fourni par la sentinelle, voir `decisions.md`) : curseur souris au
   stick, avec un **gros curseur**, clic avec A, et ouverture du **clavier manette de
   Windows 11** (disposition « Gamepad » du clavier tactile : X = retour arrière,
   Y = espace, Menu = Entrée). Il marche **par-dessus n'importe quelle fenêtre**
   (launcher, dialogue Windows) et s'active automatiquement dans les parcours connus.
3. **Le méta-raccourci (Select + Start maintenus) ramène toujours à Playscreen**, quoi
   qu'il arrive.
4. **Préférer le téléphone au clavier virtuel** dès que possible : QR codes,
   validation par appli mobile.

## Catalogue

| # | Situation | Quand | Gravité | Parade |
|---|---|---|---|---|
| F1 | **Fenêtre UAC** (contrôle de compte) : bureau sécurisé, **aucune saisie simulée ne l'atteint** | installation d'un launcher, d'un anti-triche, de dépendances | 🔴 bloquant | Installations admin faites pendant l'installation de Playscreen. Ensuite, un **service Playscreen avec privilèges** (installé à ce moment-là) fait les installations à la place de l'utilisateur. À tester : la navigation à la manette dans l'UAC (sans doute impossible) |
| F2 | Installation d'un jeu ou premier lancement : redistribuables (DirectX, VC++), **anti-triche** (EAC, BattlEye) qui demandent l'UAC | premier lancement | 🔴 | **Non couvert par D9** (ce sont de vraies installations système). Piste : le service Playscreen avec privilèges installe ces composants juste après le téléchargement (Steam les déclare dans les fichiers du jeu). Pour le reste : option « valider à la manette » (F24, piste 2). Plus détection et avertissement (« Première installation, cela peut prendre 1 minute ») |
| F3 | **Écran de connexion Windows** (PIN, mot de passe) au démarrage | démarrage du PC | 🔴 | Guider vers la connexion automatique pendant l'installation (option clairement expliquée, compromis de sécurité) |
| F4 | Fenêtres de launcher pensées pour la souris (confirmation d'installation Steam, bibliothèque Epic, page de jeu Battle.net) | installation d'un jeu | 🟠 | Mise au premier plan + mode assisté auto + bandeau d'instruction Playscreen |
| F5 | Connexions aux launchers | premier usage d'un store | 🟠 | QR / appli mobile d'abord, sinon fenêtre agrandie + clavier manette |
| F6 | **Mises à jour des launchers** au démarrage (fenêtre qui vole le focus) | démarrage | 🟠 | Démarrer les launchers en silencieux (`-silent` pour Steam), laisser du temps, puis reprendre le focus |
| F7 | Popups des launchers (actualités, promos, notes de version, EULA) | lancement d'un jeu | 🟠 | Liste des fenêtres connues à fermer ou contourner, mode assisté sinon |
| F8 | Launchers intermédiaires (jeu Steam qui ouvre Ubisoft Connect, EA app, Rockstar, 2K) | lancement d'un jeu | 🟠 | Détection, écran d'attente, mode assisté. Ces launchers doivent être connectés aussi |
| F9 | **Pare-feu Windows** (« Autoriser l'accès ») au premier jeu en ligne | premier lancement | 🟠 | Mode assisté ; à étudier : préautorisation |
| F10 | Conflit de sauvegarde cloud (Steam, Epic) | lancement d'un jeu | 🟡 | Mode assisté |
| F11 | Notifications Windows / Game Bar qui volent le focus | n'importe quand | 🟡 | Mode « Ne pas déranger » / Focus pendant Playscreen (à étudier), méta-raccourci |
| F12 | Redémarrage forcé pour une mise à jour Windows | n'importe quand | 🟡 | Signaler dans Playscreen les mises à jour en attente ; heures d'activité |
| F13 | **Manette Bluetooth à appairer** ou déconnectée | premier usage, batterie | 🟠 | La sentinelle notifie la déconnexion. Appairage guidé à l'installation |
| F14 | Steam Input qui virtualise la manette (doublons, mauvais boutons) | permanent | 🟡 | Détection et déduplication ; doc de réglage |
| F15 | Jeu en plein écran exclusif qui ne rend pas la main | retour à Playscreen | 🟡 | Méta-raccourci + techniques de reprise de focus ; tests par jeu |
| F16 | Jeu qui crashe ou se bloque | en jeu | 🟡 | Option « Forcer la fermeture » dans le menu du méta-raccourci |
| F17 | Résolution ou mise à l'échelle incohérente sur la télé | démarrage | 🟡 | L'interface s'adapte (DPI, 4K / 1080p / 800p) |
| F18 | Achat : paiement, 3-D Secure (validation bancaire) | achat | 🟡 | Vue web lisible à la manette, mode assisté, validation sur téléphone |
| F19 | **Pare-feu Windows pour `Playnite.BrowserProcess`** (navigateur intégré) à la première fenêtre de connexion (constaté le 5 octobre 2026) | première connexion à un store | 🟠 | « Annuler » suffit (les connexions sortantes marchent). À l'installation de Playscreen : créer une règle de pare-feu (admin) pour que la question ne se pose jamais |
| F20 | **Connexion « avec Google » (ou autre fournisseur) dans une fenêtre surgissante** (Epic) | connexion à un store | 🟢 réglé | La passerelle agrandit et met au premier plan les fenêtres surgissantes du navigateur intégré. Ne jamais garder la fenêtre de connexion « toujours au-dessus » : elle cachait la fenêtre Google. Secours : `psc login epic --alternative` (navigateur du système + code à coller, demande clavier et souris). Piste : connexion par code sur le téléphone (« device code ») |
| F21 | **Pas de retour arrière** dans les fenêtres de connexion (ex. : bouton Google cliqué par erreur sur Battle.net) | connexion à un store | 🟠 | Aujourd'hui : fermer la fenêtre et relancer `psc login`. À prévoir dans l'interface : « Recommencer » et « Retour » à la manette |
| F24 | **UAC pendant l'installation d'un jeu Epic** dans `C:\Program Files\Epic Games` (dossier par défaut) : Epic n'a pas le droit d'y créer le dossier du jeu et demande les droits admin (constaté le 5 octobre 2026, Unrailed). **La personne veut garder les dossiers par défaut** (certains jeux y tiennent) **et pouvoir valider à la manette** | installation d'un jeu | 🔴 | Piste 1 (prévenir) : à l'installation de Playscreen, donner à l'utilisateur le droit d'écrire dans les dossiers de jeux par défaut des launchers (une seule UAC, à ce moment-là) : Epic n'en demande plus. Piste 2 (valider à la manette, choix de sécurité à expliquer) : afficher l'UAC sur le bureau normal (stratégie `PromptOnSecureDesktop = 0`) et donner au mode assisté le droit `uiAccess` (exécutable signé, installé dans Program Files) : il peut alors cliquer sur la fenêtre UAC. Sur le bureau sécurisé (réglage par défaut), **aucun logiciel ne peut cliquer** |
| F25 | Demande d'installation perdue quand le launcher **se met à jour** d'abord (Epic, constaté le 5 octobre 2026 : le lien d'installation a été ignoré après la mise à jour, et Epic a enchaîné sur une mise à jour de Fall Guys) | installation d'un jeu | 🟠 | Après une mise à jour du launcher, renvoyer la demande ; écran d'attente « Epic se met à jour » |
| F26 | **« Je clique sur Lancer et rien ne s'affiche »** : le launcher démarre, se met à jour ou vérifie le jeu sans que rien ne soit visible (vécu par la personne avec Playnite en plein écran) | lancement d'un jeu | 🟠 | Écran d'attente qui dit ce qui se passe (« Epic se met à jour… », « Battle.net démarre… »), à partir de l'état des launchers (journaux, processus) ; jamais d'écran figé sans explication |
| F23 | **Contenus additionnels téléchargés d'office** : après l'installation de Garry's Mod, Steam a enchaîné sur les addons Workshop du compte (16 Go à télécharger, 47 Go réservés) alors qu'il restait 18 Go libres (constaté le 5 octobre 2026) | installation d'un jeu | 🟠 | Avant d'installer : annoncer la place nécessaire et la comparer à l'espace libre. Pendant : suivre aussi les téléchargements Workshop. Proposer « Mettre en pause » et « Annuler » à la manette |
| F22 | **Fenêtres transparentes** (Playnite, et sans doute toute appli WPF) avec un écran virtuel (Parsec) et l'accélération graphique | toujours, sur ces PC | 🟢 réglé | Rendu logiciel : `DisableHwAcceleration` + `--forcesoftrender` |
