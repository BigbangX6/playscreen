# Interface Playscreen — consignes pour une session de design

Tu conçois l'interface de Playscreen avec la personne, par petites itérations. Elle teste
chaque version dans son navigateur (Mac), au clavier ou à la manette. Elle n'est pas
développeuse : explique simplement, en français.

Lis d'abord [`../docs/interface.md`](../docs/interface.md) (contraintes : manette, télé,
données, écrans) et [`README.md`](README.md) (ce qui existe, ce qui manque).

## Boucle de travail

1. Modifie l'interface (voir « Où travailler »).
2. Vérifie et construis la démo : `npm --prefix ui run build:demo` (vérification des
   types, puis un seul fichier HTML avec un faux moteur intégré). Une erreur de type =
   corrige avant de continuer.
3. **Publie la démo** comme page Claude (outil Artifact) : le fichier
   `ui/dist-demo/artifact.html`, **toujours à la même adresse** :
   `url` = `https://claude.ai/artifact/9kk25a1rgyhnDqY7mp3rDx`.
4. Donne le lien en une ligne et dis ce qui a changé. La personne teste et revient.
5. Quand une étape lui plaît : commit sur ta branche, push, et pull request vers
   `claude/busy-carson-3amj4g` (seulement si elle le demande).

Première fois dans la session : `npm install` à la racine et `npm --prefix ui install`.

## Où travailler

- **Oui** : `ui/src/screens/`, `ui/src/components/`, `ui/src/theme.css`, `ui/src/App.tsx`,
  `ui/src/format.ts`, et la démo `ui/src/demo/` (bibliothèque d'exemple, situations du
  panneau F2).
- **Non** (la session Windows s'en occupe) : `api/`, `ui/src/engine.ts`, `ui/src/input/`,
  `ui/src-tauri/`, `bridge/`, `mock-engine/`, `packaging/`, `sentinel/`.
- Besoin d'une donnée ou d'une action que le moteur n'a pas (quitter un jeu, régler le
  volume, savoir qu'un launcher se met à jour…) : **ne l'invente pas dans l'API**. Simule-la
  dans la démo si c'est utile pour le design, et ajoute-la à la section « Pas encore
  possible » de `ui/README.md` : la session Windows l'ajoutera au moteur.

## Règles de code

- React + TypeScript (`.tsx`), styles CSS avec les variables de `theme.css`. Pas d'`enum`
  ni de `namespace` (unions de chaînes).
- Le client du moteur est de type `EngineClient` (`api/client.ts`) : la démo et le vrai
  moteur ont exactement les mêmes méthodes et événements.
- Navigation : tout élément atteignable est un `<button data-focusable>` ; `useNavAction`
  pour intercepter une action ; le focus est toujours visible et jamais perdu.
- Pas de bibliothèque externe sans en parler (la démo doit rester un seul fichier).

## La démo

- `npm --prefix ui run dev:demo` : la même démo avec rechargement en direct
  (http://localhost:5173), si l'environnement permet d'ouvrir un navigateur.
- Panneau **F2** (à la souris) : délai avant téléchargement (le launcher attend une
  action), durée d'installation, durée d'une partie, échec de connexion, bibliothèque
  vide, arrêter la partie, couper le moteur 5 s, tout réinitialiser.
- Clavier : flèches, Entrée (A), Échap (B), X, Y, M (Start), Page préc. / suiv. (LB / RB).
