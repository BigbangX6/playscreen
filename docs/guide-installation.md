# Installer Playscreen (version 0.1)

*[English version](install-guide.md)*

Playscreen transforme un PC Windows en console de salon : tes jeux Steam, Epic Games,
Xbox / Game Pass, Battle.net (et tes jeux sans launcher) dans une seule interface,
**entièrement à la manette**. Le PC reste un PC normal : Playscreen ne s'ouvre que quand tu
le demandes.

## Ce qu'il faut

- Windows 10 (version 1809 ou plus) ou Windows 11, 64 bits. Un PC dans le cloud (Shadow…)
  convient aussi.
- Une manette : Xbox, PlayStation, Switch ou compatible (GameSir…).
- Environ 500 Mo d'espace pour Playscreen (sans les jeux), et Internet pendant
  l'installation (les launchers choisis sont téléchargés).

## Installer

1. Télécharge `Playscreen-Setup-0.1.0.exe` (page « Releases » du projet, rubrique
   « Assets »).
2. Double-clique dessus. **Windows peut afficher « Windows a protégé votre ordinateur »** :
   c'est parce que l'installateur n'est pas signé (un certificat coûte cher). Clique sur
   **« Informations complémentaires »**, puis **« Exécuter quand même »**.
3. Windows demande l'autorisation administrateur : **Oui**. C'est la seule fois : tout ce
   qui demande ces droits est fait maintenant (dossier de jeux d'Epic, pare-feu, outil
   d'installation des launchers), pour que tu n'aies plus besoin d'un clavier ni d'une
   souris ensuite.
4. **Langue** : celle de ton PC est déjà choisie ; Playscreen la reprendra.
5. **« Où sont tes jeux ? »** : coche les launchers à installer. Ceux déjà installés ne
   sont pas proposés.
   - Steam et Epic Games s'installent tout seuls.
   - Xbox et Game Pass : le Microsoft Store peut s'ouvrir ; clique sur « Installer ».
   - Battle.net : son installateur s'ouvre ; clique sur « Continuer ».
   - Options : le rappel au démarrage de Windows (recommandé) et l'icône sur le Bureau.
6. Clique sur **Installer** : une à trois minutes selon les launchers.
7. **« Ta console est prête »** : branche ta manette, laisse cochée « Ouvrir Playscreen
   maintenant » et clique sur **Terminer**.

## Premier démarrage

L'écran **« Prépare ta console »** te guide en trois étapes :

1. **Installe tes launchers** : chaque carte indique si le launcher est installé ; sinon,
   « Installer » le télécharge et l'installe (sans demande d'autorisation).
2. **Connecte tes comptes** : « Se connecter » ouvre la page officielle du store en grand.
   La manette y devient une souris : stick gauche pour déplacer, **A** pour cliquer, **Y**
   pour le clavier à l'écran.
3. **Tes jeux arrivent tout seuls** : la bibliothèque se remplit, avec les jaquettes.

« Plus tard » passe cette étape ; tu la retrouves dans **Paramètres › Comptes et
launchers**.

## Utiliser

| À la manette | Ce que ça fait |
|---|---|
| **Select + Y** | Ouvre Playscreen, ou le ramène devant (même en plein jeu : menu en jeu) |
| **Select + X** | La manette devient une souris (fenêtre de launcher, site…), ou redevient une manette |
| A / B | Valider / revenir |
| LB / RB | Changer d'onglet |
| Start | Centre rapide (volume, Wi-Fi, veille, Quitter Playscreen…) |

Sur une manette PlayStation, Select = « Share » / « Create » ; sur une manette Switch,
Select = « − ».

**Souris manette** : dès que la manette devient une souris, une bulle en bas à droite
rappelle les touches (déplacer, cliquer, clic droit, défiler, clavier, Échap). Une page qui
s'ouvre dans le navigateur pendant que Playscreen est ouvert (par exemple une demande
d'autorisation d'Epic) passe devant, avec la souris manette.

Au démarrage de Windows, une petite notification rappelle **Select + Y**. Tant que tu ne
l'utilises pas, Playscreen ne tourne pas : seule une mini-appli (la « sentinelle »,
quelques Mo de mémoire) écoute la manette.

**Quitter Playscreen** (centre rapide, Paramètres › Alimentation, ou la croix de la
fenêtre) le ferme complètement ; Select + Y le rouvre.

**Langue** : Paramètres › Playscreen › Langue (français ou anglais).

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
- Pour les jeux Steam, le menu manette de Steam en jeu est activé automatiquement.

## Désinstaller

Paramètres Windows → Applications → **Playscreen** → Désinstaller. On te demande si tu
veux aussi supprimer tes données (connexions aux stores, bibliothèque) : réponds « Non » si
tu comptes le réinstaller. Les launchers et les jeux restent installés.

## Si quelque chose ne va pas

- **Select + Y ne fait rien** : la sentinelle ne tourne pas. Menu Démarrer → Playscreen.
- **Un jeu reste derrière Playscreen** : Select + Y, puis « Reprendre ».
- **Une fenêtre de launcher demande un clic** : Select + X (souris à la manette), puis
  Select + Y pour revenir.
- **Un store se dit « Non connecté »** : Paramètres › Comptes et launchers › Se connecter.
  Battle.net redemande son mot de passe après une longue période PC éteint.
- Journaux utiles : `%LOCALAPPDATA%\Playscreen` (`sentinel.log`, et dans `Playnite` :
  `playnite.log`, `extensions.log`).
