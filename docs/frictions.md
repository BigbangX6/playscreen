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
| F2 | Installation d'un jeu ou premier lancement : redistribuables (DirectX, VC++), **anti-triche** (EAC, BattlEye) qui demandent l'UAC | premier lancement | 🔴 | F1 + détection et avertissement (« Première installation, cela peut prendre 1 minute ») |
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
