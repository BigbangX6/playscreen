# Plan d'attaque

> Ordre de travail : **le moteur d'abord, l'interface quand elle devient nécessaire pour
> tester.** Chaque phase se termine par quelque chose de **testable sur un vrai PC**,
> sans interface graphique, grâce à l'outil en ligne de commande `psc` (voir
> [`cli/`](../cli)).

## Organisation du dépôt

| Dossier | Contenu | Langage | Testé où |
|---|---|---|---|
| `api/` | **Contrat de l'API** Playscreen (OpenAPI), source de vérité | YAML | — |
| `bridge/` | **Passerelle** : extension Playnite qui expose l'API en local | C# (.NET Framework 4.6.2) | compilation ici et en CI ; exécution sur PC Windows |
| `mock-engine/` | **Faux moteur** : implémente l'API avec une fausse bibliothèque | TypeScript (Node 22) | ici et en CI |
| `cli/` | **`psc`** : client en ligne de commande de l'API (marche avec le faux moteur comme avec la passerelle) | TypeScript | ici et en CI |
| `sentinel/` | **Sentinelle** : mini-appli au démarrage, méta-raccourci, mode assisté | Rust | logique testée ici ; Windows en CI et sur PC |
| `packaging/` | Construction du **paquet Playscreen** : Playnite portable + passerelle + préconfiguration | PowerShell | PC Windows / CI Windows |
| `ui/` | Interface (plus tard) | TypeScript | — |

## Phases

### Phase 0 — Fondations ✅ (ce squelette)

- Contrat d'API v0, faux moteur, `psc`, squelette de la passerelle et de la sentinelle,
  script de packaging, CI.
- **Votre test :** aucun, à part vérifier que la CI est verte.

### Phase 1 — La passerelle parle (lecture + lancement) ✅

Objectif : piloter Playnite depuis l'extérieur. Validée sur le PC Windows le
5 octobre 2026 (détails dans [`passation.md`](passation.md), § 3).
- Serveur HTTP local dans la passerelle : `status`, `stores`, `games`, `games/{id}`,
  `start`, événements (SSE). `HttpListener` marche sur `127.0.0.1` sans droits admin.
- Packaging : script qui assemble Playnite portable (`10.62.7z`) + extensions de store
  (Playnite 10 ne les fournit plus) + passerelle, saute l'assistant de premier démarrage
  et démarre Playnite en arrière-plan
  (`--startclosedtotray --hidesplashscreen --forcesoftrender`).
- **Votre test :** sur votre PC, `packaging/build-bundle.ps1`, lancer le paquet, puis
  `psc games` et `psc start <id>` : un jeu se lance sans toucher à Playnite.

### Phase 2 — Préconfiguration et synchronisation ✅

Validée sur le PC Windows le 5 octobre 2026 avec un vrai compte Steam (détails dans
[`passation.md`](passation.md), § 3).

- Écriture des réglages des 4 extensions (compte connecté, import des jeux non installés).
- `POST /stores/{id}/sync` : synchronisation à la demande (appel direct de
  `LibraryPlugin.GetGames` puis `Database.ImportGame`).
- État des stores : launcher installé ? extension connectée ?
- **Votre test :** `psc stores`, `psc sync steam` : les jeux non installés apparaissent.

### Phase 3 — Connexions

- `POST /stores/{id}/login` : la passerelle ouvre la fenêtre de connexion **en grand**.
- **Steam : QR code ET identifiants saisis à la main.** La page de connexion Steam
  propose les deux côte à côte ; on garde les deux visibles.
- Epic, Xbox, Battle.net : fenêtre agrandie (réflexion sur les méthodes de connexion des
  extensions si nécessaire).
- **Votre test :** `psc login steam`, connexion par QR puis par identifiants, puis
  `psc sync steam`.

### Phase 4 — La sentinelle

- Détection du méta-raccourci (Select + Start maintenus 1 s) en arrière-plan, XInput
  puis DualSense.
- Notification au démarrage, lancement / mise au premier plan de Playscreen.
- **Votre test :** démarrer le PC, manette en main, Select + Start lance le paquet.

### Phase 5 — Installation et progression

- `POST /games/{id}/install` + événements `install.progress`.
- Lecteur de progression Steam (`appmanifest_*.acf`), puis Epic, Battle.net, Xbox.
- Recherches : installation Steam sans fenêtre, lien d'installation Epic direct, lien
  d'installation de l'appli Xbox.
- **Votre test :** `psc install <id>` puis `psc events` : la progression défile.

### Phase 6 — Mode assisté

- Curseur au stick, gros curseur, ouverture du clavier manette de Windows 11, déclenché
  par la passerelle pendant les connexions et installations.

### Phase 7 — Interface

À démarrer dès qu'un parcours a besoin d'être testé « en vrai » (probablement pendant les
phases 3 à 5). Elle s'appuie sur le faux moteur pour être développée et testée ici.

## Comment vous testez

1. Vous récupérez la branche et lancez `packaging/build-bundle.ps1` (Windows,
   PowerShell).
2. Vous suivez la section « Votre test » de la phase.
3. En cas de problème : ouvrez une issue avec la sortie de `psc`, et le journal
   `playnite.log` (dans `%LOCALAPPDATA%\Playscreen\Playnite\`).
