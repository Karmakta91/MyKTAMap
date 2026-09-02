#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🗺️ decouper-atlas.js — extraire UNE carrière d'un atlas KML départemental
// =====================================================================
// OUTIL DE PRÉPARATION DE DONNÉES. Il ne tourne PAS dans le navigateur et ne
// fait partie d'aucun build : on le lance à la main, il lit un gros KML et
// écrit un petit GeoJSON.
//
// LE PROBLÈME QU'IL RÉSOUT : un relevé départemental (ex. Gironde, 171 Mo,
// 4,1 M de lignes, 245 000 Placemarks sur 65 × 72 km) ne peut pas entrer dans
// MyKTAMap, et c'est normal :
//   • `sigImport.js` refuse au-delà de MAX_FEATURES = 20 000 — ici on est 12×
//     au-dessus ;
//   • parser 171 Mo de XML avec DOMParser, c'est plusieurs Go de DOM ;
//   • surtout, un plan MyKTAMap est UNE carrière, pas un département.
// Le refus est le bon comportement. Ce qui manquait, c'est la sortie : de quoi
// découper l'atlas en plans exploitables.
//
// 🎯 POURQUOI IL SORT DU GEOJSON ET PAS UN ZIP DE PLAN : parce que l'app sait
// DÉJÀ faire le reste. Le GeoJSON produit passe par l'écran « Convertir depuis
// SIG », qui génère le fond vierge calé (`GpxImport.genererCanvasVierge`) et
// l'écran de correspondance des types. Refaire ici un générateur de ZIP serait
// une deuxième implémentation du même travail — la dette classique de ce
// projet (cf. les 25 tables de styles). Bonus : ça fait passer l'import SIG
// sur des données RÉELLES, ce qu'il n'a jamais connu.
//
// 🩸 DEUX PIÈGES DU FORMAT, PAYÉS EN LES DÉCOUVRANT :
//   1. Chaque zone est un `<MultiGeometry>` qui contient un `<Point>` de
//      placement PUIS le `<Polygon>` du contour. Prendre le premier
//      `<coordinates>` venu donne le point — soit une emprise d'un seul
//      sommet, et zéro galerie retenue. On cible `<outerBoundaryIs>`.
//   2. Le niveau (-1 à -6) n'est PAS porté par le Placemark : il vient du
//      `<Folder><name>niveauN</name>` qui l'englobe. Il faut suivre ce
//      contexte en streaming, sinon tout retombe sur un seul étage.
//
// LECTURE EN FLUX, ligne à ligne : le fichier ne tient pas confortablement en
// mémoire (171 Mo d'UTF-8 → ~340 Mo de string V8, avant les structures).
//
// Usage :
//   node scripts/decouper-atlas.js --zone "Citon_Graves_RD"
//   node scripts/decouper-atlas.js --zone "X" --src data/doc.kml --out sorties-atlas
//   node scripts/decouper-atlas.js --lister                  (les zones dispo)
// =====================================================================

const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ---------------------------------------------------------------- args ----
const A = process.argv.slice(2);
function opt(nom, def) {
  const i = A.indexOf("--" + nom);
  return (i >= 0 && A[i + 1] && !A[i + 1].startsWith("--")) ? A[i + 1] : def;
}
const SRC     = opt("src", "data/doc.kml");
const OUT_DIR = opt("out", "sorties-atlas");
const ZONE    = opt("zone", null);
const LISTER  = A.includes("--lister");
const MARGE_M = parseFloat(opt("marge", "50"));   // cf. « galeries à cheval »
// Quelles couches verser dans le plan. Le fichier Gironde en porte deux qui
// se recouvrent : le relevé STRUCTURÉ par étages (`niveau1`…`niveau6`) et un
// TOPO HISTORIQUE, bien plus dense — sur Citon_Graves_RD, 16 612 features
// contre 3 890 pour les six niveaux réunis. Les mélanger dépasse la limite
// de l'import ET superpose deux relevés du même endroit.
// Défaut « niveaux » : le relevé structuré, celui qui porte l'information
// d'étage dont le multi-niveau de l'app a besoin.
const COUCHES = opt("couches", "niveaux");   // niveaux | historique | tout

if (!LISTER && !ZONE) {
  console.error("Usage : node scripts/decouper-atlas.js --zone \"<nom>\"  |  --lister");
  process.exit(2);
}
if (!fs.existsSync(SRC)) {
  console.error("❌ Source introuvable : " + SRC);
  process.exit(2);
}

// ------------------------------------------------------------ géométrie ----
// Ray casting. Le contour d'une carrière peut porter 11 000 sommets : on
// rejette d'abord sur la bbox, qui écarte l'immense majorité des galeries
// d'un département en trois comparaisons.
function dansPolygone(x, y, poly) {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) dedans = !dedans;
  }
  return dedans;
}
function bboxDe(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0: x0, x1: x1, y0: y0, y1: y1 };
}
function parseCoords(txt) {
  const out = [];
  const morceaux = txt.trim().split(/\s+/);
  for (const m of morceaux) {
    const a = m.split(",");
    if (a.length >= 2) {
      const x = parseFloat(a[0]), y = parseFloat(a[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
    }
  }
  return out;
}

// --------------------------------------------------- lecture en 2 passes ----
// Passe 1 : le contour de la zone demandée (ou la liste des zones).
// Passe 2 : les galeries et piliers qui tombent dedans.
// Deux passes plutôt qu'une : le contour est écrit à la FIN du fichier (la
// couche des zones est la dernière), on ne peut pas filtrer avant de l'avoir.

function lireLignes(cb, fin) {
  const rl = readline.createInterface({
    input: fs.createReadStream(SRC, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  rl.on("line", cb);
  rl.on("close", fin);
}

// ── PASSE 1 ────────────────────────────────────────────────────────────────
function passe1() {
  return new Promise(function (resolve) {
    let nomCourant = null, dansPm = false, buf = null;
    let dansOuter = false, coordsOuter = "", dansCoords = false;
    const zones = [];
    let cible = null;

    lireLignes(function (l) {
      if (l.includes("<Placemark")) { dansPm = true; buf = { nom: null }; dansOuter = false; coordsOuter = ""; }
      if (!dansPm) return;

      const mn = /<name>([^<]*)<\/name>/.exec(l);
      if (mn && !buf.nom) buf.nom = mn[1];

      // 🩸 Piège n°1 : viser l'anneau extérieur, pas le premier <coordinates>
      // (qui est le <Point> de placement du MultiGeometry).
      if (l.includes("<outerBoundaryIs>")) dansOuter = true;
      if (l.includes("</outerBoundaryIs>")) dansOuter = false;
      if (dansOuter) {
        if (l.includes("<coordinates>")) {
          dansCoords = true;
          const apres = l.split("<coordinates>")[1] || "";
          coordsOuter += apres.split("</coordinates>")[0] + " ";
          if (l.includes("</coordinates>")) dansCoords = false;
        } else if (dansCoords) {
          if (l.includes("</coordinates>")) { coordsOuter += l.split("</coordinates>")[0] + " "; dansCoords = false; }
          else coordsOuter += l + " ";
        }
      }

      if (l.includes("</Placemark>")) {
        if (buf.nom && coordsOuter.trim()) {
          const pts = parseCoords(coordsOuter);
          if (pts.length >= 4) {
            zones.push({ nom: buf.nom, n: pts.length });
            if (ZONE && buf.nom === ZONE) cible = { nom: buf.nom, poly: pts, bbox: bboxDe(pts) };
          }
        }
        dansPm = false; buf = null; coordsOuter = ""; dansOuter = false; dansCoords = false;
      }
      void nomCourant;
    }, function () { resolve({ zones: zones, cible: cible }); });
  });
}

// ── PASSE 2 ────────────────────────────────────────────────────────────────
function passe2(cible) {
  return new Promise(function (resolve) {
    const bb = cible.bbox;
    // Marge : une galerie qui frôle l'emprise appartient au réseau. Sans elle,
    // on couperait net des tronçons au bord — l'utilisateur verrait des
    // galeries qui s'arrêtent dans le vide sans raison.
    const dLat = MARGE_M / 111320;
    const dLng = MARGE_M / (111320 * Math.cos(((bb.y0 + bb.y1) / 2) * Math.PI / 180));
    const BB = { x0: bb.x0 - dLng, x1: bb.x1 + dLng, y0: bb.y0 - dLat, y1: bb.y1 + dLat };

    let niveau = 0, couche = "niveau";
    let dansPm = false, nomPm = null, geom = null, coords = "", dansCoords = false;
    const retenus = [];
    const stats = { lus: 0, bboxOk: 0, retenus: 0, parNiveau: {} };

    lireLignes(function (l) {
      // 🩸 Piège n°2 (corrigé après la 1re extraction réelle) : le niveau
      // vient du Folder englobant, MAIS le fichier ne contient pas que des
      // niveaux. Après `niveau6` viennent un topo historique et la couche des
      // EMPRISES — sans changer de contexte, tout cela retombait en « -6 » :
      // 16 676 features pour une carrière qui en déclare 4 étages, et les
      // contours des carrières voisines importés comme des galeries.
      // On suit donc la COUCHE, pas seulement le niveau.
      const mf = /<name>niveau(\d+)<\/name>/.exec(l);
      if (mf) { niveau = -parseInt(mf[1], 10); couche = "niveau"; return; }
      if (/<name>topo_[^<]*<\/name>/.test(l))            { couche = "historique"; niveau = null; return; }
      if (/<name>0?Zone de carri[^<]*<\/name>/.test(l))   { couche = "emprises";   niveau = null; return; }

      if (l.includes("<Placemark")) {
        dansPm = true; nomPm = null; geom = null; coords = ""; dansCoords = false; stats.lus++;
      }
      if (!dansPm) return;

      const mn = /<name>([^<]*)<\/name>/.exec(l);
      if (mn && !nomPm) nomPm = mn[1];
      if (l.includes("<LineString")) geom = "LineString";
      else if (l.includes("<Polygon") && !geom) geom = "Polygon";

      if (l.includes("<coordinates>")) {
        dansCoords = true;
        const apres = l.split("<coordinates>")[1] || "";
        coords += apres.split("</coordinates>")[0] + " ";
        if (l.includes("</coordinates>")) dansCoords = false;
      } else if (dansCoords) {
        if (l.includes("</coordinates>")) { coords += l.split("</coordinates>")[0] + " "; dansCoords = false; }
        else coords += l + " ";
      }

      if (l.includes("</Placemark>")) {
        if (geom && coords.trim()) {
          const pts = parseCoords(coords);
          if (pts.length >= 2) {
            const b = bboxDe(pts);
            // Rejet bbox d'abord : trois comparaisons écartent 99 % du
            // département avant tout ray-casting.
            if (!(b.x1 < BB.x0 || b.x0 > BB.x1 || b.y1 < BB.y0 || b.y0 > BB.y1)) {
              stats.bboxOk++;
              // Une géométrie est retenue si AU MOINS un de ses sommets est
              // dans le contour : on garde la galerie ENTIÈRE plutôt que de la
              // découper. Couper produirait des tronçons orphelins et fausserait
              // les longueurs ; déborder un peu est sans conséquence.
              let dedans = false;
              for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 40))) {
                if (dansPolygone(pts[i][0], pts[i][1], cible.poly)) { dedans = true; break; }
              }
              // Les EMPRISES ne sont pas du contenu de plan : ce sont les
              // contours administratifs des carrières, y compris des voisines
              // qui débordent dans la bbox. Les importer donnerait de fausses
              // galeries épousant les limites de zone.
              const gardee = (COUCHES === "tout") ? (couche !== "emprises")
                           : (COUCHES === "historique") ? (couche === "historique")
                           : (couche === "niveau");
              if (dedans && gardee) {
                retenus.push({ nom: nomPm, geom: geom, pts: pts, niveau: niveau, couche: couche });
                stats.retenus++;
                const cle = (couche === "niveau") ? ("niveau " + niveau) : couche;
                stats.parNiveau[cle] = (stats.parNiveau[cle] || 0) + 1;
              }
            }
          }
        }
        dansPm = false; geom = null; coords = ""; nomPm = null;
      }
    }, function () { resolve({ retenus: retenus, stats: stats }); });
  });
}

// ------------------------------------------------------------------ main ----
(async function () {
  console.log("🗺️  Découpage d'atlas — source : " + SRC +
              " (" + (fs.statSync(SRC).size / 1048576).toFixed(0) + " Mo)\n");

  process.stdout.write("Passe 1/2 — lecture des emprises… ");
  const p1 = await passe1();
  console.log(p1.zones.length + " zones trouvées");

  if (LISTER) {
    p1.zones.sort(function (a, b) { return b.n - a.n; });
    console.log("\nLes 30 zones au contour le plus détaillé (proxy de taille) :\n");
    p1.zones.slice(0, 30).forEach(function (z) {
      console.log("  " + String(z.n).padStart(6) + " sommets   " + z.nom);
    });
    console.log("\n(" + p1.zones.length + " au total — `--zone \"<nom>\"` pour en extraire une)");
    return;
  }

  if (!p1.cible) {
    console.error("\n❌ Zone « " + ZONE + " » introuvable.");
    const proches = p1.zones.filter(function (z) {
      return z.nom.toLowerCase().includes(ZONE.toLowerCase().slice(0, 5));
    }).slice(0, 8);
    if (proches.length) {
      console.error("   Peut-être : " + proches.map(function (z) { return z.nom; }).join(", "));
    }
    console.error("   `--lister` donne la liste complète.");
    process.exit(1);
  }

  const bb = p1.cible.bbox;
  const lat = (bb.y0 + bb.y1) / 2;
  console.log("Zone      : " + p1.cible.nom + " — contour de " + p1.cible.poly.length + " sommets");
  console.log("Emprise   : " + Math.round((bb.x1 - bb.x0) * 111320 * Math.cos(lat * Math.PI / 180)) +
              " m (E-O) × " + Math.round((bb.y1 - bb.y0) * 111320) + " m (N-S)");
  console.log("Marge     : " + MARGE_M + " m autour du contour");
  console.log("Couches   : " + COUCHES + "   (niveaux | historique | tout)\n");

  process.stdout.write("Passe 2/2 — filtrage des galeries… ");
  const p2 = await passe2(p1.cible);
  console.log("terminé\n");

  const st = p2.stats;
  console.log("Placemarks lus        : " + st.lus.toLocaleString("fr-FR"));
  console.log("Passant la bbox       : " + st.bboxOk.toLocaleString("fr-FR"));
  console.log("RETENUS dans l'emprise: " + st.retenus.toLocaleString("fr-FR"));
  Object.keys(st.parNiveau).sort().forEach(function (n) {
    console.log("   " + n.padEnd(12) + " : " + st.parNiveau[n]);
  });

  // ── sortie GeoJSON ───────────────────────────────────────────────────────
  const feats = p2.retenus.map(function (r) {
    return {
      type: "Feature",
      properties: { nom: r.nom || "", niveau: r.niveau, couche: r.couche,
                    type: r.geom === "Polygon" ? "pilier" : "galerie" },
      geometry: r.geom === "Polygon"
        ? { type: "Polygon", coordinates: [r.pts] }
        : { type: "LineString", coordinates: r.pts }
    };
  });
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const dest = path.join(OUT_DIR, p1.cible.nom.replace(/[^\w.-]+/g, "_") + ".geojson");
  fs.writeFileSync(dest, JSON.stringify({ type: "FeatureCollection", features: feats }));

  const mo = (fs.statSync(dest).size / 1048576).toFixed(2);
  console.log("\n📄 " + dest + "  (" + mo + " Mo, " + feats.length + " features)");

  // Le seuil de l'app, dit ICI plutôt que découvert à l'import.
  const MAX = 20000;
  if (feats.length > MAX) {
    console.log("\n⚠️  " + feats.length + " features > la limite de " + MAX + " de l'import SIG.");
    console.log("   Ce fichier sera REFUSÉ par l'app. Pistes, dans l'ordre :");
    console.log("     • `--couches niveaux` (défaut) : le relevé structuré seul ;");
    console.log("     • `--marge 0` : sans la marge de sécurité autour du contour ;");
    console.log("     • sinon la carrière est trop dense pour un seul plan, il faut");
    console.log("       la découper en secteurs.");
  } else {
    console.log("\n✅ Sous la limite de " + MAX + " features : importable via");
    console.log("   🏗️ Générateur → « Convertir depuis SIG ». L'app génère le fond");
    console.log("   vierge calé et l'écran de correspondance des types.");
  }
  console.log("\n🔒 Rappel : cette sortie porte les mêmes données sensibles que la source");
  console.log("   (localisation de carrières). `" + OUT_DIR + "/` est ignoré par git.");
})();
