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

Coque native : **Tauri (WebView2)** pressenti pour sa légèreté sur consoles portables,
Electron en alternative. *Choix final : Proposé.*

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
- Le méta-raccourci est **configurable**. Valeur par défaut proposée : **maintenir
  Select + Start (View + Menu) pendant 1 seconde**, une combinaison quasi jamais
  utilisée en jeu. *Valeur par défaut : Proposé.*
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
