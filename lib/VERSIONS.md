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
| **Leaflet.ImageOverlay.Rotated** | `leaflet-imageoverlay-rotated.js` | adaptation **maison** (intégrée en v1.38.0 de l'app), d'après l'original | images et tuiles posées par 3 coins (calques calibrés, Vue OSM) | [IvanSanchez/Leaflet.ImageOverlay.Rotated](https://github.com/IvanSanchez/Leaflet.ImageOverlay.Rotated) (BSD 2) — code réécrit, à relire nous-mêmes |

## ⚠️ À savoir

- **jsPDF** : la version 4.2.1 corrige l'ensemble des avis publiés sur les branches 2.x à 4.2.0 (injection dans les
  formulaires PDF et `addJS`, déni de service sur images PNG/GIF/BMP, injection HTML dans les méthodes de sortie…).
  L'app n'utilise que l'API de base (texte, formes, images JPEG/PNG issues de ses propres canvas, `save`), sans
  formulaire ni JavaScript dans le PDF.
- **JSZip** ouvre des archives fournies par l'utilisateur ou par un serveur : toute faille de lecture de ZIP la
  concerne directement.
