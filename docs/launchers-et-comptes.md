# Launchers, comptes et parcours d'achat

> Document d'exploration. Il pose le problème, ce que fait Playnite aujourd'hui (vérifié
> dans le code de `JosefNemec/PlayniteExtensions`, licence MIT), et les parcours que
> Playscreen vise.

## Le problème

Playnite a été pensé pour un joueur qui **a déjà tout installé** : ses launchers, ses
comptes, ses jeux. Il veut juste les retrouver au même endroit.

Le joueur Playscreen est différent : il installe **seulement Playscreen** sur un PC de
salon ou une console portable, à la manette, sur une télé. Il faut l'amener jusqu'au
jeu sans jamais le renvoyer vers le bureau Windows, une souris ou un clavier.

## Ce que fait Playnite aujourd'hui (constaté dans le code)

**Installer un jeu = le déléguer au launcher**, via son lien système :

| Store | Méthode d'installation dans Playnite |
|---|---|
| Steam | `steam://install/<appid>` (ouvre la fenêtre de confirmation de Steam) |
| Epic | `com.epicgames.launcher://apps/<id>?action=install` |
| Ubisoft | `uplay://install/<id>` |
| Amazon | `amazon-games://install/<id>` |
| itch.io | `itch://install?game_id=<id>` |
| Xbox / Game Pass | page du jeu dans le Microsoft Store (`ms-windows-store://pdp/?PFN=…`) |
| GOG | ouvre la page du jeu dans GOG Galaxy |

⇒ Le launcher doit être **installé et connecté**, et **sa fenêtre apparaît**, pensée
pour la souris.

**Lister les jeux possédés mais non installés = une seconde connexion.** Les extensions
Epic, GOG, Xbox, Battle.net, Amazon et Humble ouvrent leur propre fenêtre de connexion
web intégrée, **distincte** de la connexion au launcher. Pour Steam, l'import des jeux
non installés est **désactivé par défaut**. Il demande un profil public ou une clé API
Steam : inacceptable pour notre public.

**Pas de progression de téléchargement.** Playnite ne suit pas les téléchargements des
launchers. Il faudra la lire nous-mêmes (par exemple les manifestes `.acf` de Steam
contiennent l'état et les octets téléchargés).

## Principe directeur

> **Une action utilisateur par store, une seule fois.**
> « Connecter Steam » doit suffire à : installer le launcher si besoin, s'y connecter,
> et voir toute sa bibliothèque, y compris les jeux non installés.

Playscreen fait la plomberie. Le joueur ne voit jamais deux connexions pour le même
store, ni le bureau Windows.

## Parcours cibles

### P1 — Premier lancement : « Où sont tes jeux ? »

1. Bienvenue, manette détectée, langue.
2. Détection automatique des launchers déjà installés **et déjà connectés**
   (ils sont alors cochés et synchronisés sans rien demander).
3. Grille des stores (logos). Le joueur coche ceux où il a un compte.
4. Pour chaque store coché :
   - **Installation silencieuse du launcher** si absent (piste : `winget`, avec des
     identifiants à vérifier store par store) et barre de progression dans Playscreen.
   - **Connexion guidée**, par ordre de préférence :
     1. **QR code / code appareil** affiché en grand sur la télé, validé sur le
        téléphone. Steam le permet via son appli mobile ; à vérifier pour les autres.
     2. **Fenêtre du launcher encadrée par Playscreen** : on la met au premier plan,
        avec un bandeau d'aide aux contrôles, un clavier virtuel et un curseur au stick.
     3. Saisie depuis le téléphone : un QR code ouvre une page locale qui envoie
        identifiants ou texte au PC. À étudier côté sécurité.
   - **Synchronisation de la bibliothèque** : on réutilise la session du launcher si
     possible, sinon une connexion web unique, enchaînée automatiquement.
5. Arrivée sur l'accueil avec la bibliothèque complète.

Un store peut être ajouté plus tard depuis *Paramètres → Comptes*. Chaque store y
affiche un état clair : *non installé / installé / connecté / synchronisé / erreur*.

### P2 — Acheter un jeu

Deux familles, deux parcours :

**a) Stores officiels (Steam, Epic, GOG, Xbox…)** — l'achat est lié au compte, le jeu
apparaît tout seul dans la bibliothèque après la synchronisation.
- Option 1 : ouvrir le store **dans son propre client**. Le store de Steam Big Picture
  est déjà bien conçu pour la manette.
- Option 2 : vue web du store officiel dans Playscreen. Attention, c'est encore une
  connexion web séparée, à éviter si possible.

**b) Revendeurs de clés (Instant Gaming, etc.)** — achat, puis **clé**, puis
**activation** sur le bon store.
- Vue web du revendeur dans Playscreen (piste de revenus via l'affiliation, à étudier).
- Écran **« Activer une clé »** : saisie au clavier virtuel ou envoi depuis le
  téléphone, détection du store concerné, ouverture de son activation (Steam propose
  une page d'activation de clé ; à recenser pour les autres).
- Récupérer automatiquement la clé sur la page du revendeur serait idéal mais fragile
  (structure de page, conditions d'utilisation). C'est un bonus, pas la base.
- **Confiance** : un paiement dans notre vue web doit afficher clairement le vrai
  domaine et le cadenas. Les joueurs saisissent leur carte bancaire chez nous.

### P3 — Après l'achat : de « acheté » à « en jeu »

1. Synchronisation déclenchée à la fermeture du store ou de l'activation.
2. Le jeu apparaît avec un badge **Nouveau** et un bouton **Installer**.
3. Installation :
   - **Phase 1** : lien du launcher, avec la fenêtre de confirmation gérée à la manette
     (encadrement, focus, aide).
   - **Phase 2 (piste)** : téléchargement **sans fenêtre de launcher** grâce aux outils
     open source existants (Legendary pour Epic, gogdl pour GOG, Nile pour Amazon).
     Ils sont sous **GPL-3** : on ne les utiliserait que comme exécutables séparés, à
     valider juridiquement. Pour Steam, on reste sur le client officiel.
4. Progression du téléchargement **dans Playscreen**, notification à la fin, puis
   **Jouer**.

## Compte Playscreen ?

**Pas au départ.** Playscreen fonctionne en local, sans compte : moins de friction et
aucune donnée à héberger. Un compte optionnel pourra venir plus tard, pour synchroniser
préférences et favoris entre appareils.

## Matrice par store (à compléter par la recherche)

| Store | Installer le launcher | Connexion à la manette | Jeux non installés | Installer un jeu | Progression | Sans launcher ? |
|---|---|---|---|---|---|---|
| Steam | winget ? | QR via appli mobile ✅ | ⚠️ clé API / profil public | `steam://install` + fenêtre | `.acf` ✅ | non |
| Epic | winget ? | ? | connexion web Playnite | lien `com.epicgames…` | ? | Legendary (GPL) |
| GOG | winget ? | ? | connexion web Playnite | Galaxy | ? | gogdl (GPL) / installateurs hors ligne |
| Xbox / Game Pass | préinstallé (Windows) | compte Microsoft (code ?) | connexion web Playnite | Microsoft Store / appli Xbox | ? | non |
| Ubisoft | winget ? | ? | jeux installés seulement ? | `uplay://install` | ? | non |
| Battle.net | winget ? | appli Authenticator ? | connexion web Playnite | ? | ? | non |
| Amazon | winget ? | ? | connexion web Playnite | `amazon-games://install` | ? | Nile (GPL) |
| EA | winget ? | ? | pas d'extension dans le dépôt officiel | ? | ? | non |

## Questions ouvertes

1. Quels stores en priorité pour la v1 ? Proposition : **Steam, Epic, Xbox/Game Pass**
   (le Game Pass est très présent sur les consoles portables), puis GOG.
2. Peut-on obtenir la liste des jeux Steam possédés sans clé API, à partir de la
   session du client Steam ?
3. Pour chaque store : existe-t-il une connexion par QR code ou code appareil ?
4. Quel cadre juridique pour l'usage d'outils GPL comme exécutables séparés, et pour
   l'affiliation avec des revendeurs de clés ?
