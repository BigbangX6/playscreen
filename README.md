<p align="center">
  <img src="packaging/images/logo-138.png" width="96" alt="Playscreen">
</p>

<h1 align="center">Playscreen</h1>

<p align="center">
  <b>Ton PC Windows devient une console de salon, entièrement à la manette.</b><br>
  <b>Your Windows PC becomes a living-room console, fully controller-driven.</b>
</p>

<p align="center">
  <a href="#français">Français</a> · <a href="#english">English</a>
</p>

---

## Français

Playscreen réunit tes jeux **Steam, Epic Games, Xbox / Game Pass, Battle.net** (et tes
jeux sans launcher) dans une seule interface pensée pour la télé et la manette. Le PC
reste un PC normal : Playscreen ne s'ouvre que quand tu appuies sur **Select + Y**.

### Ce qu'il faut

- Windows 10 (version 1809 ou plus) ou Windows 11, 64 bits. Fonctionne aussi sur un PC
  dans le cloud (Shadow…).
- Une manette : Xbox, PlayStation, Switch ou compatible.
- Environ 500 Mo d'espace (sans les jeux) et une connexion Internet pendant l'installation.

### Installer

1. Télécharge **`Playscreen-Setup-0.1.0.exe`** dans la page
   [**Releases**](../../releases/latest) (rubrique « Assets »).
2. Double-clique dessus.
   - Si Windows affiche **« Windows a protégé votre ordinateur »** : clique sur
     **« Informations complémentaires »**, puis **« Exécuter quand même »**. Ce message
     apparaît parce que l'installateur n'est pas signé (un certificat de signature est
     payant) ; il ne veut pas dire que le fichier est dangereux.
   - Windows demande l'autorisation administrateur : **Oui**. C'est la seule fois.
3. Choisis la **langue** (celle de ton PC est déjà sélectionnée).
4. **« Où sont tes jeux ? »** : coche les launchers à installer (ceux déjà présents ne
   sont pas proposés), puis **Installer**. Compte une à trois minutes.
5. **« Ta console est prête »** : branche ta manette et laisse cochée « Ouvrir Playscreen
   maintenant ».
6. Au premier démarrage, Playscreen te guide : installe tes launchers, connecte tes
   comptes, et ta bibliothèque se remplit toute seule.

### À la manette

| Touches | Ce que ça fait |
|---|---|
| **Select + Y** | Ouvre Playscreen, ou y revient (en plein jeu : menu Reprendre / Quitter) |
| **Select + X** | La manette devient une souris, ou redevient une manette |
| **A / B** | Valider / revenir |
| **LB / RB** | Changer d'onglet |
| **Start** | Centre rapide : volume, Wi-Fi, veille, Quitter Playscreen |

En mode souris, une bulle rappelle les touches : stick gauche pour déplacer, **A** pour
cliquer, **Y** pour le clavier à l'écran. Sur une manette PlayStation, Select = « Share »
ou « Create » ; sur une manette Switch, Select = « − ».

La langue se change dans **Paramètres › Playscreen › Langue**.

### Désinstaller

Paramètres Windows › Applications › **Playscreen** › Désinstaller. Réponds « Non » à la
question sur tes données si tu comptes le réinstaller.

### En cas de souci

- **Select + Y ne fait rien** : menu Démarrer › Playscreen (la petite appli qui écoute la
  manette se relance).
- **Une fenêtre demande un clic** : Select + X (souris), puis Select + Y pour revenir.
- **Un jeu reste derrière Playscreen** : Select + Y, puis « Reprendre ».
- Guide complet : [docs/guide-installation.md](docs/guide-installation.md).

---

## English

Playscreen brings your **Steam, Epic Games, Xbox / Game Pass and Battle.net** games (and
games without a launcher) together in one interface designed for the TV and a controller.
Your PC stays a normal PC: Playscreen only opens when you press **Select + Y**.

### Requirements

- Windows 10 (version 1809 or later) or Windows 11, 64-bit. Also works on cloud PCs
  (Shadow…).
- A controller: Xbox, PlayStation, Switch or compatible.
- About 500 MB of space (not counting games) and an Internet connection during setup.

### Install

1. Download **`Playscreen-Setup-0.1.0.exe`** from the
   [**Releases**](../../releases/latest) page (under “Assets”).
2. Double-click it.
   - If Windows shows **“Windows protected your PC”**: click **“More info”**, then
     **“Run anyway”**. This appears because the installer isn't signed (code-signing
     certificates cost money); it doesn't mean the file is dangerous.
   - Windows asks for administrator permission: **Yes**. This is the only time.
3. Pick your **language** (your PC's language is already selected).
4. **“Where are your games?”**: check the launchers to install (ones already on your PC
   aren't listed), then **Install**. It takes one to three minutes.
5. **“Your console is ready”**: plug in your controller and leave “Open Playscreen now”
   checked.
6. On first start, Playscreen walks you through it: install your launchers, sign in to
   your accounts, and your library fills up on its own.

### With the controller

| Buttons | What it does |
|---|---|
| **Select + Y** | Opens Playscreen, or brings it back (in a game: Resume / Quit menu) |
| **Select + X** | The controller becomes a mouse, or a controller again |
| **A / B** | Confirm / back |
| **LB / RB** | Switch tabs |
| **Start** | Quick menu: volume, Wi-Fi, sleep, Quit Playscreen |

In mouse mode, a bubble reminds you of the buttons: left stick to move, **A** to click,
**Y** for the on-screen keyboard. On a PlayStation controller, Select = “Share” or
“Create”; on a Switch controller, Select = “−”.

Change the language in **Settings › Playscreen › Language**.

### Uninstall

Windows Settings › Apps › **Playscreen** › Uninstall. Answer “No” to the question about
your data if you plan to reinstall it.

### Troubleshooting

- **Select + Y does nothing**: Start menu › Playscreen (the small app that listens to the
  controller restarts).
- **A window needs a click**: Select + X (mouse), then Select + Y to come back.
- **A game stays behind Playscreen**: Select + Y, then “Resume”.
- Full guide: [docs/install-guide.md](docs/install-guide.md).

---

<sub>Playscreen s'appuie sur [Playnite](https://github.com/JosefNemec/Playnite) (licence
MIT) et ses extensions de bibliothèque. · Playscreen is built on
[Playnite](https://github.com/JosefNemec/Playnite) (MIT license) and its library
extensions. · [Développement / Development](docs/developpement.md)</sub>
