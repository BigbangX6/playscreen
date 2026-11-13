# Installer Playscreen (version 0.1)

Playscreen transforme un PC Windows en console de salon : tes jeux Steam, Epic Games,
Battle.net (et tes jeux sans launcher) dans une seule interface, **entièrement à la
manette**. Le PC reste un PC normal : Playscreen ne s'ouvre que quand tu le demandes.

## Ce qu'il faut

- Windows 10 (version 1809 ou plus) ou Windows 11, 64 bits.
- Une manette : Xbox, PlayStation, Switch ou compatible (GameSir…).
- Environ 500 Mo d'espace pour Playscreen (sans les jeux).

## Installer

1. Télécharge `Playscreen-Setup-0.1.0.exe` (page « Releases » du projet).
2. Double-clique dessus. **Windows peut afficher « Windows a protégé votre ordinateur »** :
   c'est parce que l'installateur n'est pas signé (un certificat coûte cher). Clique sur
   **« Informations complémentaires »**, puis **« Exécuter quand même »**.
3. Windows demande l'autorisation administrateur : **Oui**. C'est la seule fois : tout ce
   qui demande ces droits est fait maintenant, pour que tu n'aies plus jamais besoin d'un
   clavier et d'une souris ensuite.
4. Choisis les launchers à installer s'ils manquent (Steam, Epic Games, Battle.net) et
   laisse cochée la notification au démarrage de Windows.
5. À la fin, laisse cochée « Ouvrir Playscreen maintenant ».

## Utiliser

| À la manette | Ce que ça fait |
|---|---|
| **Select + Y** | Ouvre Playscreen, ou le ramène devant (même en plein jeu : menu en jeu) |
| **Select + X** | La manette devient une souris (pour une fenêtre de launcher, un site…), ou redevient une manette |
| A / B | Valider / revenir |
| LB / RB | Changer d'onglet |
| Start | Centre rapide (volume, Wi-Fi, mise en veille…) |

Sur une manette PlayStation, Select = « Share » / « Create » ; sur une manette Switch,
Select = « − ».

Au démarrage de Windows, une petite notification rappelle **Select + Y**. Tant que tu ne
l'utilises pas, Playscreen ne tourne pas : seule une mini-appli (la « sentinelle »,
quelques Mo de mémoire) écoute la manette.

### Premier démarrage

Playscreen te propose de connecter tes comptes (Steam, Epic Games, Battle.net) : une
fenêtre officielle du store s'ouvre en grand, tu te connectes, et tes jeux apparaissent.

### Ajouter un jeu sans launcher

Bibliothèque → dernière tuile **« + Ajouter un jeu »** :
- **Suggestions** : les jeux et applications trouvés sur le Bureau et dans le menu
  Démarrer ;
- **Parcourir les dossiers** (RB) : choisis le dossier du jeu puis son `.exe`, à la
  manette.

La jaquette est cherchée toute seule d'après le nom (que tu peux changer avant d'ajouter).

### Pendant une partie

- Les autres launchers sont fermés automatiquement (celui du jeu reste ouvert), pour
  laisser la mémoire au jeu ; Playscreen lui-même rend aussi sa mémoire.
- **Select + Y** : menu en jeu (Reprendre, Quitter le jeu, Forcer la fermeture, volume…).

## Désinstaller

Paramètres Windows → Applications → **Playscreen** → Désinstaller. On te demande si tu
veux aussi supprimer tes données (connexions aux stores, bibliothèque) : réponds « Non » si
tu comptes le réinstaller.

## Si quelque chose ne va pas

- **Select + Y ne fait rien** : la sentinelle ne tourne pas. Menu Démarrer → Playscreen.
- **Un jeu reste derrière Playscreen** : Select + Y, puis « Reprendre ».
- **Une fenêtre de launcher demande un clic** : Select + X (souris à la manette), puis
  Select + X pour revenir.
- Journaux utiles : `%LOCALAPPDATA%\Playscreen` (`sentinel.log`, et dans `Playnite` :
  `playnite.log`, `extensions.log`).
