# 📚 Librairies embarquées (`lib/`)

> Ces fichiers sont **copiés à la main** (PWA 100 % hors ligne, pas de bundler). Leur veille passe par
> **`lib/package.json`**, un manifeste **déclaratif** (rien ne s'installe) que Dependabot lit : avis de sécurité et
> nouvelles versions arrivent en alerte ou en demande de fusion. **Une PR Dependabot ne met PAS la librairie à
> jour** — elle ne touche que le manifeste, et `scripts/check-libs.js` (pré-commit et CI, bloquant) la fait échouer
> tant que le fichier embarqué et cette table ne suivent pas. Mettre à jour une librairie = dans le même commit :
> 1. remplacer le fichier par celui du **paquet npm officiel** (`dist/`, comparé octet par octet au paquet) ;
> 2. sa version dans `lib/package.json` et dans cette table ;
> 3. tester ce qu'elle fait (exports PDF, ouverture de ZIP, carte…) et relire ses avis de sécurité (lien « Avis »).

| Librairie | Fichier(s) | Version | Rôle dans l'app | Source · Avis de sécurité |
|---|---|---|---|---|
| **Leaflet** | `leaflet/leaflet.js`, `leaflet.css`, `leaflet-src.js`, `leaflet-src.esm.js`, `images/` | **1.9.4** | moteur de carte (CRS.Simple), toute l'app | [leafletjs.com](https://leafletjs.com) · [avis](https://github.com/Leaflet/Leaflet/security/advisories) |
| **JSZip** | `jszip.min.js` | **3.10.2** | ouvre et produit les ZIP de plans — ⚠️ lit des **fichiers non fiables** (ZIP importés) | [stuk/jszip](https://github.com/Stuk/jszip) · [avis](https://github.com/advisories?query=jszip) |
| **jsPDF** | `jspdf.umd.min.js` | **4.2.1** | exports PDF (plans, fiches Secours, historique) | [parallax/jsPDF](https://github.com/parallax/jsPDF) · [avis](https://github.com/advisories?query=jspdf) |
| **html2canvas** | `html2canvas.min.js` | **1.4.1** | captures pour les exports image | [niklasvh/html2canvas](https://github.com/niklasvh/html2canvas) · [avis](https://github.com/advisories?query=html2canvas) |
| **three.js** | `three/three.core.js`, `three/three.module.js`, `three/LICENSE` | **0.186.1** | 🧊 Vue 3D (bouton cube de la barre de droite) : modules ES chargés **à la demande** par `js/vue3d.js` (`import()` dynamique), jamais au démarrage ; paquet livré sans fichier minifié (~2,1 Mo, ~420 Ko compressés) | [threejs.org](https://threejs.org) (MIT) · [avis](https://github.com/mrdoob/three.js/security/advisories) |
| **Bodoni Moda** | `bodoni-moda/bodoni-moda-latin-{600,700}-normal.woff2`, `LICENSE`, `package.json` | **5.3.0** | 🧊 Vue 3D : capitales Didone des plaques gravées (`js/vue3d.js > _chargerPolicePlaques`), chargées à l'ouverture de la 3D seulement ; sous-ensemble latin, ~15 Ko par graisse. `package.json` est celui du paquet, copié tel quel : il porte la version (une police n'a pas d'en-tête lisible) | [@fontsource/bodoni-moda](https://fontsource.org/fonts/bodoni-moda) (SIL OFL 1.1, `LICENSE` joint) · [avis](https://github.com/advisories?query=fontsource) |
| **Leaflet.ImageOverlay.Rotated** | `leaflet-imageoverlay-rotated.js` | adaptation **maison** (intégrée en v1.38.0 de l'app), d'après l'original | images et tuiles posées par 3 coins (calques calibrés, Vue OSM) | [IvanSanchez/Leaflet.ImageOverlay.Rotated](https://github.com/IvanSanchez/Leaflet.ImageOverlay.Rotated) (BSD 2) — code réécrit, à relire nous-mêmes |

## ⚠️ À savoir

- **jsPDF** : la version 4.2.1 corrige l'ensemble des avis publiés sur les branches 2.x à 4.2.0 (injection dans les
  formulaires PDF et `addJS`, déni de service sur images PNG/GIF/BMP, injection HTML dans les méthodes de sortie…).
  L'app n'utilise que l'API de base (texte, formes, images JPEG/PNG issues de ses propres canvas, `save`), sans
  formulaire ni JavaScript dans le PDF.
- **three.js** : seules les révisions (« 186 ») figurent dans le fichier ; `check-libs.js` compare la révision au
  manifeste, le correctif (0.186.**1**) se vérifie en comparant les fichiers au paquet npm. Depuis la 0.18x le paquet
  n'a plus de `build/*.min.js` ni de build UMD : on embarque `three.module.js` + `three.core.js` tels quels, chargés
  par `import()` depuis un script classique (aucune *import map*, interdite par la CSP sans script en ligne). Les
  extensions `examples/jsm/*` importent `"three"` par son nom nu : inutilisables sans import map, d'où une fusion
  de géométries faite à la main dans `js/vue3d.js`.
- **Bodoni Moda** : fichiers `files/*-latin-{600,700}-normal.woff2` du paquet npm `@fontsource/bodoni-moda`,
  `LICENSE` et `package.json` du même paquet, comparés octet par octet. Une police ne s'exécute pas : la veille sert
  surtout à suivre les corrections de dessin. Chargée par `FontFace` (CSP `font-src 'self'`), jamais par une feuille.
- **JSZip** ouvre des archives fournies par l'utilisateur ou par un serveur : toute faille de lecture de ZIP la
  concerne directement.

## 🔤 Polices embarquées (`fonts/`, hors `lib/`)

Pas de paquet npm suivi (pas de veille Dependabot) : des fichiers de police figés, sans code exécutable, précachés
par `sw.js`. Montserrat et Permanent Marker servent le seul écran Bienvenue (`css/bienvenue.css`) ; « KTA Emoji »
dessine les emoji de toute l'app (`css/kta-emoji.css`). Celle-ci n'est pas dans `lib/` : c'est un sous-ensemble
produit par `scripts/generer-police-emoji.js`, donc jamais identique octet par octet au fichier publié ; sa source
est épinglée par empreinte dans le script, sa version dans `fonts/kta-emoji.json` (`check-police-emoji.js`).

| Police | Fichiers | Licence (jointe) | Source |
|---|---|---|---|
| **Montserrat** 400 / 600 / 800 | `montserrat-{400,600,800}.woff2` | SIL Open Font License 1.1 (`LICENSE-montserrat.txt`) | [JulietaUla/Montserrat](https://github.com/JulietaUla/Montserrat) |
| **Permanent Marker** 400 | `permanent-marker-400.woff2` | Apache 2.0 (`LICENSE-permanent-marker.txt`) | [Google Fonts](https://fonts.google.com/specimen/Permanent+Marker) |
| **KTA Emoji** (Twemoji Mozilla **0.7.0**, Twemoji 14, COLRv0, réduite) | `kta-emoji.woff2`, `kta-emoji.json` | dessins CC-BY 4.0, police Apache 2.0 (`LICENSE-twemoji.txt`) | [mozilla/twemoji-colr](https://github.com/mozilla/twemoji-colr/releases/tag/v0.7.0) · [twitter/twemoji](https://github.com/twitter/twemoji) |
