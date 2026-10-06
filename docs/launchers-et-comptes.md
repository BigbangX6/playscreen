# Launchers, comptes et parcours d'achat

> Principes et parcours. Le détail store par store (vérifié dans le code de Playnite)
> est dans [`stores-v1.md`](stores-v1.md), les blocages et leurs parades dans
> [`frictions.md`](frictions.md).

## Le problème

Playnite a été pensé pour un joueur qui **a déjà tout installé** : ses launchers, ses
comptes, ses jeux. Il veut juste les retrouver au même endroit.

Le joueur Playscreen installe **seulement Playscreen** sur un PC de salon ou une console
portable, et joue à la manette sur une télé. Il faut l'amener jusqu'au jeu **sans jamais
le laisser bloqué**.

## Principes

1. **Voir les launchers, oui ; s'y perdre, non.** Le joueur peut passer brièvement par la
   fenêtre d'un launcher pour se connecter, acheter ou confirmer une installation. Ce
   passage est **minimal, annoncé et accompagné** : Playscreen met la fenêtre au premier
   plan, active le mode assisté (curseur au stick, clavier manette) et affiche une
   instruction claire. Le joueur revient ensuite dans Playscreen, automatiquement si
   possible, sinon avec le méta-raccourci.
2. **Une connexion par store, une seule fois.** Grâce au cache web partagé de Playnite,
   une connexion web faite par Playscreen sert à toutes les extensions. Le reste
   (connexion au client du launcher) est guidé.
3. **Le téléphone avant le clavier virtuel.** QR code Steam, validation sur l'appli
   mobile Battle.net, code envoyé par Microsoft…
4. **Pas de compte Playscreen** au départ : tout est local.

## Parcours cibles

### P0 — Installation de Playscreen (le seul moment « clavier et souris »)

C'est le moment où l'on regroupe tout ce qui demande des droits admin (voir F1 dans
`frictions.md`) :
1. Installation de Playscreen, de la sentinelle, de Playnite embarqué et du service
   d'installation avec privilèges.
2. **« Où sont tes jeux ? »** : choix des stores (Steam, Epic, Game Pass, Battle.net).
   Les launchers manquants sont **installés tout de suite**, sans fenêtre (`winget`).
3. Option : connexion automatique à Windows (pour démarrer directement à la manette),
   avec explication du compromis de sécurité.
4. Vérification de la manette (appairage Bluetooth si besoin).

### P1 — Premier lancement à la manette

1. La sentinelle affiche : « Maintiens Select + Start pour ouvrir Playscreen ».
2. Playscreen détecte les launchers **déjà connectés** et les synchronise sans rien
   demander.
3. Pour chaque store restant, l'écran « Connecter » propose, dans l'ordre :
   1. **QR code** à scanner avec l'appli du store (Steam), avec toujours la possibilité
      de **saisir ses identifiants à la main** au clavier manette ;
   2. **fenêtre de connexion agrandie** (navigateur intégré à Playnite, taille adaptée à
      la télé) avec le clavier manette ouvert d'office ;
   3. la connexion au **client du launcher**, en mode assisté.
4. Synchronisation, puis arrivée sur la bibliothèque complète.

**Installer un launcher plus tard** (store ajouté après coup), par ordre de préférence :
1. `winget` en silencieux via le service avec privilèges : aucune fenêtre ;
2. sinon, téléchargement direct de l'installateur officiel et installation silencieuse ;
3. en dernier recours, **la page de téléchargement officielle** en mode assisté (gros
   curseur, clavier manette).

### P2 — Acheter un jeu

**Stores officiels (Steam, Epic, Game Pass, Battle.net) :** l'achat est lié au compte.
- Le plus confortable est le store **dans son propre client**, en mode assisté.
  Steam Big Picture est déjà pensé pour la manette, l'appli Xbox a un mode plein écran.
- Après l'achat, synchronisation automatique : le jeu apparaît avec le badge
  **Nouveau**.

**Revendeurs de clés (Instant Gaming, etc.) :** vue web du revendeur dans Playscreen.
Affiliation possible, à étudier.
- Après l'achat, le revendeur fournit généralement **un lien d'activation** vers le store
  concerné (par exemple la page d'activation de clé Steam). Playscreen **intercepte ce
  lien** et l'ouvre au bon endroit :
  - dans le navigateur intégré à Playnite, où le joueur est **déjà connecté** grâce au
    cache partagé ;
  - ou dans le client du launcher.
- À défaut de lien, l'écran **« Activer une clé »** permet de saisir la clé au clavier
  manette ou de l'envoyer depuis le téléphone.
- **Confiance :** pendant un paiement, le vrai domaine et le cadenas sont toujours
  visibles.

### P3 — De « acheté » à « en jeu »

1. Le jeu apparaît avec un badge **Nouveau** et le bouton **Installer**.
2. Installation via le launcher (passage minimal et accompagné, détail par store dans
   `stores-v1.md`).
3. **Progression affichée dans Playscreen** (lue par nos soins, par exemple dans les
   manifestes Steam), notification à la fin.
4. **Jouer.** Au premier lancement, un écran prévient que des composants peuvent
   s'installer (redistribuables, anti-triche).

## Questions ouvertes

1. Steam : peut-on déclencher une installation **sans fenêtre** via le service de
   téléchargement à distance ?
2. Epic : le lien d'installation direct fonctionne-t-il à nouveau ?
3. Game Pass : comment afficher le catalogue complet, et quel lien pour installer via
   l'appli Xbox ?
4. Le clavier manette de Windows 11 peut-il être ouvert par programme de façon fiable
   (et sur Windows 10) ?
5. Cadre juridique de l'affiliation avec les revendeurs de clés et de l'usage d'outils
   GPL (Legendary) comme exécutables séparés.
