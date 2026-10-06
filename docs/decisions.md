# Décisions techniques

Registre des choix structurants de Playscreen. Chaque décision a un statut :
**Acté** (on part là-dessus), **Proposé** (à valider), **Remplacé** (voir la décision qui le remplace).

---

## D1 — Playnite comme moteur, embarqué et invisible — *Acté*

**Contexte.** Playnite (MIT, C# / .NET Framework 4.6.2, WPF) sait déjà détecter les
bibliothèques (Steam, Epic, GOG, Xbox, Ubisoft, Battle.net, Amazon, itch, Humble…),
lancer les jeux, suivre le temps de jeu et gérer les métadonnées.

**Décision.**
- Playscreen embarque une version **portable et figée** de Playnite (pas de
  désinstalleur à côté de l'exécutable ⇒ données dans le dossier du programme).
- Playnite démarre **sans interface** via `--startclosedtotray --hidesplashscreen`.
- Notre extension « passerelle » (C#) est livrée dans le dossier `Extensions` **du
  programme** : elle est active d'office, rien à activer pour l'utilisateur.
- Configuration préréglée : mises à jour automatiques de Playnite désactivées,
  chaque nouvelle version de Playnite est testée avant d'être embarquée.
- L'interface bureau de Playnite reste accessible comme « mode avancé ».

**Conséquences.** Respect de la licence MIT (notice + crédit), pas d'usage de la
marque Playnite. Risque : changements d'API (Playnite 11) — limité car la
passerelle est petite et isolée.

## D2 — Notre propre API locale entre l'interface et le moteur — *Acté*

L'interface ne parle **jamais** directement à Playnite, seulement à l'API Playscreen
(HTTP + WebSocket sur `localhost`, contrat versionné). Deux implémentations :

1. **Passerelle Playnite** (C#), en production.
2. **Faux moteur** (TypeScript) avec des bibliothèques de test, pour le
   développement et les tests automatisés (y compris dans l'environnement de Claude,
   sous Linux).

Cela permet à terme de remplacer Playnite, bibliothèque par bibliothèque, sans toucher
à l'interface.

## D3 — Interface en technologies web — *Acté*

L'interface est écrite en TypeScript et rendue dans une vue web. Raisons : vitesse
d'itération, richesse visuelle, et testabilité automatique (navigateur sans affichage,
captures d'écran, régression visuelle).

Coque native : **Tauri 2 (WebView2)**, pour sa légèreté sur consoles portables.
Intérieur : **React + TypeScript, servi par Vite** (rechargement en direct ; c'est ce que
les maquettes faites dans une conversation Claude produisent naturellement). *Acté
(5 octobre 2026).* Le guide pour concevoir l'interface est dans
[`interface.md`](interface.md).

## D4 — Entrées : API Gamepad dans l'interface + « méta-raccourci » natif — *Acté*

**Constat.** Le bouton Guide / PS / Xbox est disputé : Xbox Game Bar (ou le mode plein
écran Xbox), Steam et les autres launchers, et même un autre OS en cloud gaming
(Shadow PC, etc.). Se battre pour ce bouton est une impasse.

**Décision.**
- **Dans l'interface**, la navigation utilise l'**API Gamepad standard** du navigateur.
  C'est simple, testable, et les commandes s'intègrent naturellement à l'interface.
- **En natif**, un petit service lit la manette **en arrière-plan** (XInput, et
  SDL/HID pour DualSense, Switch Pro, etc.) **uniquement** pour détecter un
  **méta-raccourci propre à Playscreen**. Son seul rôle est de ramener Playscreen au
  premier plan (récupérer le focus de Windows).
- Le méta-raccourci est **configurable**. Valeur par défaut : **maintenir
  Select + Start (View + Menu) pendant 1 seconde**, une combinaison quasi jamais
  utilisée en jeu. *Acté.*
- Ce service natif est la **sentinelle** (voir D6).
- Un raccourci clavier global équivalent existe en secours. *Touche : à définir.*

**Points d'attention.**
- Windows limite `SetForegroundWindow` (verrou de premier plan) : il faudra des
  techniques éprouvées (`AllowSetForegroundWindow`, `AttachThreadInput`, simulation
  d'une touche) et les tester sur matériel réel.
- Steam Input peut virtualiser les manettes : à tester (doublons, mapping).
- L'API Gamepad ne fonctionne que quand la fenêtre a le focus. C'est voulu : hors
  focus, seul le méta-raccourci natif compte.

## D5 — Tester sans matériel d'abord — *Acté*

- L'interface et le faux moteur sont testés automatiquement (Playwright, manette
  simulée, captures d'écran).
- Les parties Windows (passerelle, coque) sont compilées et testées sur GitHub Actions
  (`windows-latest`).
- Le test sur matériel réel (manettes, consoles portables, vrais launchers) est fait
  manuellement. Retours via des issues GitHub avec captures et un **export de logs
  intégré** à l'application.

## D6 — La sentinelle : une mini-appli au démarrage de Windows — *Acté*

**Constat.** Il faut pouvoir lancer Playscreen sans clavier ni souris, y compris juste
après le démarrage du PC.

**Décision.** Une application native **minuscule**, lancée à l'ouverture de session
Windows (tâche planifiée), sans fenêtre :

1. **Écoute la manette en arrière-plan** (SDL2 si `SDL2.dll` est présente : Switch,
   PlayStation, Xbox ; XInput sinon) et reconnaît le méta-raccourci. **Révisé le 6 octobre
   2026 : Select + Y, dès l'appui** (choix de la personne), réglable
   (`PLAYSCREEN_SHORTCUT=select+start` : Select + Start maintenus 0,5 s). Raison :
   maintenir Select + Start ~1,5 s fait changer de mode certaines manettes (GameSir Nova 2
   Lite : Switch → PS4 → Xbox 360), ce qui explique aussi que Steam la voyait sous des noms
   différents.
2. **Au démarrage**, affiche une notification Windows : « Maintiens Select + Start pour
   ouvrir Playscreen », avec les pictogrammes des touches selon la manette détectée.
3. Au raccourci : **lance Playscreen** s'il n'est pas ouvert, sinon **le ramène au
   premier plan**.
4. Fournit le **mode assisté**, utilisable par-dessus n'importe quelle fenêtre (voir
   `frictions.md`) :
   - curseur souris au stick, gros curseur, clic avec A ;
   - ouverture du clavier manette de Windows 11 (clavier tactile, disposition
     « Gamepad ») ou de notre propre clavier.

   Il est activé automatiquement par Playscreen dans les parcours connus (connexion,
   installation dans un launcher), ou manuellement depuis le menu du méta-raccourci.
5. Signale les manettes déconnectées et la batterie faible.

**Contraintes.** Mémoire et CPU quasi nuls (elle tourne tout le temps), démarrage
instantané, aucune dépendance lourde. Langage pressenti : **Rust** (cohérent avec Tauri)
ou C#. *Langage : Proposé.*

**Option à évaluer :** démarrer aussi Playnite en arrière-plan dès l'ouverture de session,
pour une bibliothèque prête instantanément (coût : mémoire).

## D7 — Zéro blocage prévisible — *Acté*

Principe de conception transverse : **aucune situation prévisible ne doit exiger un
clavier ou une souris.** Repasser par une fenêtre Windows ou un launcher est acceptable
si c'est court et accompagné (mode assisté, instruction à l'écran).

- Les frictions inévitables (droits admin, UAC) sont **regroupées pendant l'installation
  de Playscreen**, le seul moment où l'on suppose clavier et souris.
- Chaque blocage connu est recensé dans [`frictions.md`](frictions.md) avec sa parade.
  Ce document sert aussi de plan de test sur matériel réel.

## D8 — Stores de la v1 — *Acté*

**Steam, Epic, Game Pass / Xbox**, et **Battle.net** si possible. Analyse détaillée dans
[`stores-v1.md`](stores-v1.md).

## D9 — Une autorisation administrateur à l'installation de Playscreen — *Acté (5 octobre 2026)*

L'installateur de Playscreen **demande une fois les droits administrateur** et prépare
tout ce qui en aura besoin ensuite, pour que l'utilisateur soit tranquille :
- droit d'écriture de l'utilisateur sur les **dossiers de jeux par défaut** des
  launchers (ex. `C:\Program Files\Epic Games`) : Epic n'y demande plus l'UAC (F24) ;
- **on garde les dossiers par défaut** des launchers (certains jeux y tiennent) ;
- règle de pare-feu pour le navigateur intégré (F19), et les autres actions admin
  recensées dans [`frictions.md`](frictions.md).

Pour les UAC imprévues, l'option « valider à la manette » (UAC sur le bureau normal +
mode assisté `uiAccess`, F24 piste 2) reste à proposer comme un choix de sécurité
expliqué.

## D10 — En jeu, Select + Start bascule vers Playscreen, sans sur-impression — *Acté (5 octobre 2026)*

Beaucoup de jeux tournent en **plein écran exclusif**, où une fenêtre transparente
par-dessus le jeu ne s'affiche pas. Et se greffer dans l'affichage du jeu (comme la
sur-impression de Steam) est complexe et risqué avec les anti-triches.

**Décision.** Pendant un jeu, Select + Start **ramène la fenêtre de Playscreen**
(plein écran **sans bordure**) au premier plan, sur son **menu rapide** : reprendre,
quitter le jeu (ou forcer sa fermeture), volume, batterie, notifications, aller à la
bibliothèque. Le jeu reste lancé derrière. Hors jeu, Select + Start ouvre directement
la bibliothèque. Playscreen ne se ferme jamais : il reste en mémoire, caché, pour que
le retour soit immédiat.

## D11 — Steam : sur-impression Big Picture en jeu, sans Big Picture — *Acté (5 octobre 2026)*

Les jeux Steam sont lancés par Steam en mode normal (pas de Big Picture, qui se
disputerait l'écran et le bouton Guide avec Playscreen, D4). Le réglage Steam
« **Utiliser l'overlay Big Picture lors de l'utilisation d'une manette compatible Steam
Input en mode Bureau** » (Paramètres → En jeu), désactivé par défaut, donne en jeu la
sur-impression Steam pensée pour la manette. L'installateur de Playscreen l'active
(emplacement du réglage dans les fichiers de Steam : *à trouver*).
