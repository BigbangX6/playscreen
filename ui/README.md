# Interface Playscreen

React + TypeScript servi par Vite, dans une fenêtre Tauri (plein écran sans bordure).
Guide complet pour concevoir et intégrer les écrans : [`docs/interface.md`](../docs/interface.md).

```sh
npm install                  # une fois, dans ui/
npm run dev                  # http://localhost:5173 (moteur démarré : npm run mock à la racine)
npm run tauri dev            # dans la fenêtre Windows de Playscreen
npm run build                # vérification des types + construction dans dist/
```

`src/screens/Library.tsx` est une **maquette technique** (elle prouve la chaîne moteur →
images → manette → lancement) : elle sera remplacée par les écrans du design.
