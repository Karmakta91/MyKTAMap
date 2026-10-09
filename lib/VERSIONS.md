# 📚 Librairies embarquées (`lib/`)

> Audit CI/CD du 08/10/2026, Q7. Ces fichiers sont **copiés à la main** (PWA 100 % hors ligne, pas de bundler) :
> **Dependabot ne les suit pas**. Cette table est leur seule veille : la version vient de l'en-tête du fichier,
> relevé le 09/10/2026. **En mettant à jour une librairie, mettre à jour sa ligne dans le même commit**, puis
> vérifier ses avis de sécurité (lien « Avis »).

| Librairie | Fichier(s) | Version | Rôle dans l'app | Source · Avis de sécurité |
|---|---|---|---|---|
| **Leaflet** | `leaflet/leaflet.js`, `leaflet.css`, `leaflet-src.js`, `leaflet-src.esm.js`, `images/` | **1.9.4** | moteur de carte (CRS.Simple), toute l'app | [leafletjs.com](https://leafletjs.com) · [avis](https://github.com/Leaflet/Leaflet/security/advisories) |
| **JSZip** | `jszip.min.js` | **3.10.1** | ouvre et produit les ZIP de plans — ⚠️ lit des **fichiers non fiables** (ZIP importés) | [stuk/jszip](https://github.com/Stuk/jszip) · [avis](https://github.com/advisories?query=jszip) |
| **jsPDF** | `jspdf.umd.min.js` | **2.5.1** | exports PDF (plans, fiches Secours, historique) | [parallax/jsPDF](https://github.com/parallax/jsPDF) · [avis](https://github.com/advisories?query=jspdf) |
| **html2canvas** | `html2canvas.min.js` | **1.4.1** | captures pour les exports image | [niklasvh/html2canvas](https://github.com/niklasvh/html2canvas) · [avis](https://github.com/advisories?query=html2canvas) |
| **Leaflet.ImageOverlay.Rotated** | `leaflet-imageoverlay-rotated.js` | adaptation **maison** (intégrée en v1.38.0 de l'app), d'après l'original | images et tuiles posées par 3 coins (calques calibrés, Vue OSM) | [IvanSanchez/Leaflet.ImageOverlay.Rotated](https://github.com/IvanSanchez/Leaflet.ImageOverlay.Rotated) (BSD 2) — code réécrit, à relire nous-mêmes |
| **Police Kalam 700** | `fonts/kalam-700-splash.woff2`, `fonts/OFL-Kalam.txt` | — | titre du splash | licence OFL (fichier joint) |

## ⚠️ À vérifier (relevé du 09/10/2026)

- [Supposition — à vérifier sur les liens « Avis »] **jsPDF 2.5.1** n'est plus la dernière version majeure, et des
  avis de sécurité ont été publiés sur des versions 2.x et 3.x. C'est le premier candidat à une mise à jour (tester tous
  les exports PDF après coup).
- **JSZip** ouvre des archives fournies par l'utilisateur ou par un serveur : toute faille de lecture de ZIP la
  concerne directement.
