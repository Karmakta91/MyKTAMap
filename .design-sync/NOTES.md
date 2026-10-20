# design-sync — notes (MyKTAMap, styles seuls)

- **Forme** : design system SANS composants (vanilla, pas de React) : le convertisseur le traite en « tokens-only »
  (`[ZERO_MATCH]` attendu). On n'écrit jamais de composants React d'imitation pour Claude Design (décision KARMA
  20/10/2026) : l'agent de design construit avec nos classes `kta-` et nos jetons, décrits dans `conventions.md`.
- **Paquet de construction** (`.ds-pkg/`, ignoré par Git), à recréer avant chaque sync :
  `mkdir -p .ds-pkg/dist && echo 'export {};' > .ds-pkg/dist/index.js && echo 'export {};' > .ds-pkg/dist/index.d.ts`,
  `package.json` `{"name":"myktamap-charte","module":"dist/index.js","types":"dist/index.d.ts"}`, puis
  `cat css/style.css css/style-filtres.css > .ds-pkg/charte.css` (le CSS uploadé = ces deux feuilles réelles).
  Construire depuis `.ds-pkg/` : `--entry ./dist/index.js --node-modules ../.ds-sync/node_modules --out ../ds-bundle`.
- **Contrôle de rendu** : lancé avec `--no-render-check` (accord KARMA 20/10/2026) — aucune carte à rendre.
- **Guidelines** : `docs/architecture/ui.md` (charte, état actuel).
- **Dépôt PUBLIC** : rien de réel (lieu, plan, POI) dans `conventions.md` ni les guidelines ; exemples neutres.

## Re-sync risks
- `conventions.md` liste des classes et des jetons : un renommage dans `css/` les rend faux — revalider les noms
  contre `ds-bundle/_ds_bundle.css` à chaque sync (boucle `grep` sur les `kta-*` cités).
- Le CSS uploadé est une concaténation faite à la main : une feuille ajoutée à `index.html` n'y entre pas d'office.
- `style-secours.css`, `style-meminspector.css`, `style-stats-globales.css` ne sont PAS envoyées (écrans spécialisés).
