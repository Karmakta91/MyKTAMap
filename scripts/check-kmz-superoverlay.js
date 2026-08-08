#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🗼 check-kmz-superoverlay.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Verrouille la géométrie du superoverlay KMZ (v1.76.4) : les quads des
// tuiles, calculés par planToGps sur les pixels natifs, doivent PAVER le
// plan exactement — jointure des tuiles adjacentes, bords bornés à
// l'emprise, cohérence entre niveaux de la pyramide, Lod/drawOrder.
// Le KML est généré par le VRAI genererKml (VM) sur un jeu synthétique.
// =====================================================================

const fs = require("fs");
const vm = require("vm");

const win = { console: { log() {}, warn() {} }, I18n: { t: (k) => k } };
win.window = win;
const ctx = vm.createContext(win);
vm.runInContext("var window=this;" + fs.readFileSync("js/kmzExport.js", "utf8"), ctx);
const KE = win.KmzExport;

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// Plan synthétique 1024×768, calibration simple plein nord :
// A(0,0)→(48.86, 2.33), B(1024,0)→ à l'est. échelle : 1024 px = 1024 m.
const calib = {
  pointA: { x: 0,    y: 0, lat: 48.86, lng: 2.33 },
  pointB: { x: 1024, y: 0, lat: 48.86, lng: 2.33 + 1024 / (111320 * Math.cos(48.86 * Math.PI / 180)) }
};
const T = KE.buildTransformCalib(calib);

// Pyramide synthétique : z0 = 2×2 tuiles 512 (1024×768 → 2 cols, 2 rows
// dont bord bas rogné à 256), z-1 = 1×1 (512×384).
const B = new Uint8Array(0);
const tilesOverlay = {
  tileSize: 512,
  levels: [
    { z: -1, cols: 1, rows: 1, tiles: [{ kmzPath: "tiles/z-1/x0_y1.jpg", blob: B, col: 0, k: 1 }] },
    { z: 0,  cols: 2, rows: 2, tiles: [
      { kmzPath: "tiles/z0/x0_y1.jpg", blob: B, col: 0, k: 1 },
      { kmzPath: "tiles/z0/x1_y1.jpg", blob: B, col: 1, k: 1 },
      { kmzPath: "tiles/z0/x0_y2.jpg", blob: B, col: 0, k: 2 },
      { kmzPath: "tiles/z0/x1_y2.jpg", blob: B, col: 1, k: 2 }
    ] }
  ]
};

const kml = KE.genererKml({
  planName: "Test", planVersion: "V1", planAuthor: "T",
  imageW: 1024, imageH: 768,
  transform: T,
  include: { image: true, points: false, roads: false, zones: false, structures: false },
  imageBaseUrl: null,
  tilesOverlay: tilesOverlay,
  imageOpacity: 60,
  points: [], roads: [], zones: [], structures: []
});

t("KML généré", typeof kml === "string" && kml.length > 0);
const nOverlays = (kml.match(/<GroundOverlay>/g) || []).length;
t("5 GroundOverlays (4 tuiles z0 + 1 tuile z-1)", nOverlays === 5);
t("un dossier superoverlay", kml.indexOf("superoverlay") >= 0);

// Quads : extraire les coordinates des LatLonQuad
const quads = [];
const reQ = /<gx:LatLonQuad[^>]*><coordinates>([^<]+)<\/coordinates>/g;
let m;
while ((m = reQ.exec(kml)) !== null) {
  quads.push(m[1].trim().split(/\s+/).map(function(c) {
    const p = c.split(",").map(Number);
    return { lng: p[0], lat: p[1] };
  }));
}
t("5 quads extraits", quads.length === 5);

// Le quad z-1 (plan entier) doit coïncider avec les coins du plan natif
const pTL = KE.planToGps(T, 0, 0), pBR = KE.planToGps(T, 1024, 768);
const q1 = quads[0];   // ordre d'émission : z-1 d'abord
// _coord sérialise à 8 décimales (~1 mm) : l'epsilon de comparaison doit être
// au-dessus de cet arrondi. 1e-7 degré ≈ 1 cm — largement assez strict.
const eps = 1e-7;
t("tuile z-1 : couvre exactement le plan entier (TL)",
  Math.abs(q1[3].lat - pTL.lat) < eps && Math.abs(q1[3].lng - pTL.lng) < eps);
t("tuile z-1 : couvre exactement le plan entier (BR)",
  Math.abs(q1[1].lat - pBR.lat) < eps && Math.abs(q1[1].lng - pBR.lng) < eps);

// Jointure z0 : le bord EST de x0_y1 = bord OUEST de x1_y1 (pixel 512)
const q00 = quads[1], q10 = quads[2];
t("jointure horizontale exacte entre tuiles adjacentes",
  Math.abs(q00[1].lng - q10[0].lng) < eps && Math.abs(q00[2].lat - q10[3].lat) < eps);

// Bord bas z0 : borné à l'emprise (pixel 768, PAS 1024 = padding)
const q01 = quads[3];   // x0_y2
const attenduBas = KE.planToGps(T, 0, 768);
t("tuile de bord : bornée à l'emprise réelle (pas de padding)",
  Math.abs(q01[0].lat - attenduBas.lat) < eps);

// Cohérence inter-niveaux : le coin BR de la pyramide z0 = coin BR de z-1
const qBR0 = quads[4];   // x1_y2
t("les niveaux couvrent la même emprise (BR z0 = BR z-1)",
  Math.abs(qBR0[1].lat - q1[1].lat) < eps && Math.abs(qBR0[1].lng - q1[1].lng) < eps);

// Lod / drawOrder
t("niveau grossier visible de loin (minLodPixels 0)", /<minLodPixels>0<\/minLodPixels>/.test(kml));
t("niveau fin sans plafond (maxLodPixels -1)", /<maxLodPixels>-1<\/maxLodPixels>/.test(kml));
t("drawOrder : le fin au-dessus du grossier",
  kml.indexOf("<drawOrder>0</drawOrder>") >= 0 && kml.indexOf("<drawOrder>1</drawOrder>") >= 0);

// Opacité appliquée à chaque tuile
t("opacité 60% sur chaque GroundOverlay", (kml.match(/<color>99ffffff<\/color>/g) || []).length === 5);

// Sans tilesOverlay : comportement historique (image unique) intact
const kml2 = KE.genererKml({
  planName: "Test", planVersion: "V1", planAuthor: "T",
  imageW: 1024, imageH: 768, transform: T,
  include: { image: true, points: false, roads: false, zones: false, structures: false },
  imageBaseUrl: "files/plan.png", imageOpacity: 60,
  points: [], roads: [], zones: [], structures: []
});
t("sans tilesOverlay : GroundOverlay unique historique",
  (kml2.match(/<GroundOverlay>/g) || []).length === 1 && kml2.indexOf("files/plan.png") >= 0);

console.log(ko === 0 ? "\n🎉 superoverlay KMZ : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
