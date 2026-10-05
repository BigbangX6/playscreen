# playscreen
Console interface for PC Games

Une interface de jeu pour PC, pensée pour se jouer entièrement à la manette, avec la simplicité d'une console.

## Documentation

- [Passation à la session Windows](docs/passation.md)
- [Plan d'attaque](docs/plan.md)
- [Décisions techniques](docs/decisions.md)
- [Launchers, comptes et parcours d'achat](docs/launchers-et-comptes.md)
- [Stores v1 : Steam, Epic, Game Pass, Battle.net](docs/stores-v1.md)
- [Catalogue des blocages prévisibles](docs/frictions.md)
- [Contrat de l'API](api/openapi.yaml)

## Organisation

| Dossier | Rôle |
|---|---|
| `api/` | Contrat de l'API locale (OpenAPI), types et client TypeScript |
| `bridge/` | Passerelle : extension Playnite (C#) qui expose l'API |
| `mock-engine/` | Faux moteur : même API, fausse bibliothèque, pour développer et tester |
| `cli/` | `psc` : piloter le moteur en ligne de commande |
| `sentinel/` | Sentinelle : écoute Select + Start et lance Playscreen (Rust) |
| `packaging/` | Assemblage du paquet Playnite portable + passerelle |
| `ui/` | Interface (plus tard) |

## Démarrage rapide

Prérequis : Node 22.18+, et selon la brique : .NET SDK 8 (passerelle), Rust (sentinelle).

```sh
npm install
npm test                 # tests du faux moteur et du client
npm run mock             # démarre le faux moteur
npm run psc -- games     # dans un autre terminal
npm run psc -- start celeste
npm run psc -- events
```

### Sur un PC Windows, avec le vrai Playnite

1. Télécharger l'archive **portable** de Playnite (page des versions du projet Playnite,
   par exemple `10.62.7z`).
2. `powershell -ExecutionPolicy Bypass -File .\packaging\build-bundle.ps1 -PlayniteZip <chemin de l'archive>`
3. `.\dist\Playscreen\start-engine.cmd`
4. `npm run psc -- status`, puis `npm run psc -- games`, puis `npm run psc -- start <nom>`

### Sentinelle

```sh
cd sentinel
cargo test
PLAYSCREEN_EXE=<chemin de Playscreen> cargo run   # Windows : manette Xbox requise
```
