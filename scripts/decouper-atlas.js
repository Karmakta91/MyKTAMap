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
//      contexte en streaming, sinon tout retombe sur un seul niveau.
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
// Quelles couches verser dans le plan. Le fichier Gironde en porte deux qui se
// recouvrent : le relevé STRUCTURÉ par niveaux (`niveau1`…`niveau6`) et un TOPO
// HISTORIQUE, bien plus dense — sur Citon_Graves_RD, 16 612 features contre
// 3 917 pour les six niveaux réunis.
//
// 🕰️ v2 (demande KARMA) : l'historique est désormais inclus PAR DÉFAUT, et
// rangé sur un ÉTAGE À LUI. C'est ce qui permet de le manipuler dans l'app
// comme n'importe quel niveau — l'afficher, le masquer, lui donner sa couleur —
// au lieu de le superposer aveuglément au relevé moderne. Sans niveau propre,
// deux relevés du même endroit se seraient mélangés sans moyen de les séparer.
// Niveau +1 par défaut : au-dessus de tout ce qui existe (les niveaux réels
// sont négatifs), donc jamais en collision.
const COUCHES   = opt("couches", "tout");        // niveaux | historique | tout
const NIV_HISTO = parseInt(opt("historique-niveau", "1"), 10);

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
    let anonymes = 0;
    // 🩸 La passe 1 ne doit collecter QUE la couche des emprises. Sans ce
    // suivi, le repli « (sans nom) » attrapait aussi les 13 685 polygones de
    // PILIERS des niveaux — qui n ont pas de <name> non plus : --lister
    // annonçait 13 588 zones au lieu de 1 471. Avant le repli, le filtre était
    // implicite (pas de nom = ignoré) ; en le levant, il faut le rendre explicite.
    let coucheP1 = null;
    const zones = [];
    const cibles = [];

    lireLignes(function (l) {
      if (l.indexOf("<name>") >= 0) {
        if (/<name>niveau\d+<\/name>/.test(l))           { coucheP1 = "niveau"; return; }
        if (/<name>topo_[^<]*<\/name>/.test(l))           { coucheP1 = "historique"; return; }
        if (/<name>0?Zone de carri[^<]*<\/name>/.test(l)) { coucheP1 = "emprises"; return; }
      }
      if (coucheP1 !== "emprises") return;   // hors de la couche des emprises
      if (l.includes("<Placemark")) { dansPm = true; buf = { nom: null, com: null }; dansOuter = false; coordsOuter = ""; }
      if (!dansPm) return;

      // ⚡ Garde de perf : 1 237 lignes sur 4 143 622 (0,03 %) contiennent
      // `<name>`. Sans ce test préalable, la regex balaye les 4,1 M de lignes,
      // dont celles de coordonnées qui font jusqu'à 437 ko.
      if (l.indexOf("<name>") >= 0 && !buf.nom) {
        const mn = /<name>([^<]*)<\/name>/.exec(l);
        if (mn) buf.nom = mn[1];
      }
      // 🕳️ Emprises ANONYMES : 267 des 1 471 zones du relevé de Gironde n'ont
      // aucun `<name>` — ni `nom_usage`, ni identifiant, ni rien. Ce n'est pas
      // un défaut de lecture, la donnée source est incomplète. Sans repli elles
      // étaient invisibles à `--lister` ET inextractables : 18 % du fichier
      // hors d'atteinte, sans que rien ne le dise.
      // On récupère au moins le commentaire quand il existe (10 cas), sinon un
      // numéro d'ordre. Un nom inventé mais STABLE vaut mieux qu'une zone
      // inaccessible — et le préfixe dit franchement que le nom vient de nous.
      if (!buf.nom && l.indexOf("<td>commentair</td>") >= 0) {
        const mc = /<td>commentair<\/td><td>([^<]+)<\/td>/.exec(l);
        if (mc && mc[1].trim()) buf.com = mc[1].trim();
      }

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
        if (!buf.nom && coordsOuter.trim()) {
          anonymes++;
          buf.nom = "(sans nom) " + (buf.com ? buf.com + " " : "") + "#" + anonymes;
          buf.anonyme = true;
        }
        if (buf.nom && coordsOuter.trim()) {
          const pts = parseCoords(coordsOuter);
          if (pts.length >= 4) {
            zones.push({ nom: buf.nom, n: pts.length, anonyme: !!buf.anonyme });
            // 🩸 EMPRISES HOMONYMES. Découvert sur « Grande_carrière_de_Latresne » :
            // la couche en porte DEUX, de 6 445 et 2 582 sommets. La version
            // précédente écrasait la première par la seconde et perdait donc
            // les deux tiers du site, sans rien dire.
            // Deux polygones de même nom sont deux parties d'une même carrière
            // (multipolygone éclaté à l'export). On les GARDE TOUTES et on teste
            // l'appartenance à l'une OU l'autre.
            if (ZONE && buf.nom === ZONE) cibles.push({ nom: buf.nom, poly: pts, bbox: bboxDe(pts) });
          }
        }
        dansPm = false; buf = null; coordsOuter = ""; dansOuter = false; dansCoords = false;
      }
      void nomCourant;
    }, function () { resolve({ zones: zones, cibles: cibles }); });
  });
}

// ── PASSE 2 ────────────────────────────────────────────────────────────────
// 🩸 UNE GÉOMÉTRIE PAR <LineString> / <Polygon>, PAS UNE PAR <Placemark>.
// La première version accumulait TOUS les `<coordinates>` d'un Placemark dans
// une seule chaîne, puis en faisait une seule polyligne. Or un Placemark peut
// contenir un `<MultiGeometry>` avec plusieurs LineString : sur le relevé de
// Gironde, 66 Placemarks en portent 1 440 à eux tous — et l'un d'eux en
// contient 554 À LUI SEUL. Fusionnés bout à bout, ces segments produisaient de
// longues diagonales reliant des galeries éloignées : un fouillis de traits
// qui n'existent pas sur le terrain. Repéré par KARMA sur le niveau -3, au
// sud-est de Citon_Graves_RD.
// On suit donc l'ouverture et la fermeture de CHAQUE géométrie, et on émet
// séparément. Le `<Point>` de placement d'un MultiGeometry est ignoré : ce
// n'est pas du contenu, c'est une ancre d'affichage.
function passe2(cibles) {
  return new Promise(function (resolve) {
    // Bbox ENGLOBANTE de toutes les emprises homonymes.
    const bb = cibles.reduce(function (a, c) {
      return { x0: Math.min(a.x0, c.bbox.x0), x1: Math.max(a.x1, c.bbox.x1),
               y0: Math.min(a.y0, c.bbox.y0), y1: Math.max(a.y1, c.bbox.y1) };
    }, { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
    // Marge : une galerie qui frôle l'emprise appartient au réseau. Sans elle,
    // on couperait net des tronçons au bord — l'utilisateur verrait des
    // galeries qui s'arrêtent dans le vide sans raison.
    const dLat = MARGE_M / 111320;
    const dLng = MARGE_M / (111320 * Math.cos(((bb.y0 + bb.y1) / 2) * Math.PI / 180));
    const BB = { x0: bb.x0 - dLng, x1: bb.x1 + dLng, y0: bb.y0 - dLat, y1: bb.y1 + dLat };

    let niveau = 0, couche = "niveau";
    let dansPm = false, nomPm = null;
    let geom = null;          // "LineString" | "Polygon" en cours
    let coords = "";          // coordonnées de la géométrie COURANTE
    let dansCoords = false;
    let dansOuter = false;    // anneau extérieur d'un Polygon
    const retenus = [];
    const stats = { lus: 0, geoms: 0, bboxOk: 0, retenus: 0, parNiveau: {} };

    // Teste puis range UNE géométrie complète.
    function emettre() {
      if (!geom || !coords.trim()) { geom = null; coords = ""; return; }
      stats.geoms++;
      const pts = parseCoords(coords);
      coords = "";
      const g = geom; geom = null;
      if (pts.length < 2) return;
      const b = bboxDe(pts);
      if (b.x1 < BB.x0 || b.x0 > BB.x1 || b.y1 < BB.y0 || b.y0 > BB.y1) return;
      stats.bboxOk++;
      let dedans = false;
      for (let k = 0; k < pts.length; k += Math.max(1, Math.floor(pts.length / 40))) {
        // Dans N'IMPORTE LAQUELLE des emprises du même nom.
        for (let c = 0; c < cibles.length; c++) {
          if (dansPolygone(pts[k][0], pts[k][1], cibles[c].poly)) { dedans = true; break; }
        }
        if (dedans) break;
      }
      // Les EMPRISES ne sont pas du contenu de plan : ce sont les contours
      // administratifs, y compris ceux des carrières voisines qui débordent
      // dans la bbox. Les importer donnerait de fausses galeries épousant les
      // limites de zone.
      const gardee = (COUCHES === "tout") ? (couche !== "emprises")
                   : (COUCHES === "historique") ? (couche === "historique")
                   : (couche === "niveau");
      if (!dedans || !gardee) return;
      retenus.push({ nom: nomPm, geom: g, pts: pts, niveau: niveau, couche: couche });
      stats.retenus++;
      const cle = (couche === "niveau") ? ("niveau " + niveau)
                : (couche === "historique") ? ("historique (niv " + NIV_HISTO + ")")
                : couche;
      stats.parNiveau[cle] = (stats.parNiveau[cle] || 0) + 1;
    }

    lireLignes(function (l) {
      // 🩸 Le niveau vient du Folder englobant, et le fichier ne contient pas
      // que des niveaux : après `niveau6` viennent un topo historique et les
      // emprises. Sans changer de contexte, tout retombait en « -6 ».
      const mf = /<name>niveau(\d+)<\/name>/.exec(l);
      if (mf) { niveau = -parseInt(mf[1], 10); couche = "niveau"; return; }
      if (/<name>topo_[^<]*<\/name>/.test(l))          { couche = "historique"; niveau = NIV_HISTO; return; }
      if (/<name>0?Zone de carri[^<]*<\/name>/.test(l)) { couche = "emprises";   niveau = null; return; }

      if (l.includes("<Placemark")) { dansPm = true; nomPm = null; geom = null; coords = ""; stats.lus++; }
      if (!dansPm) return;

      const mn = /<name>([^<]*)<\/name>/.exec(l);
      if (mn && !nomPm) nomPm = mn[1];

      // Ouverture d'une géométrie. Le <Point> d'un MultiGeometry n'en est pas
      // une : on ne le prend jamais.
      if (l.includes("<LineString")) { geom = "LineString"; coords = ""; }
      else if (l.includes("<Polygon")) { geom = "Polygon"; coords = ""; dansOuter = false; }
      if (l.includes("<outerBoundaryIs>"))  dansOuter = true;
      if (l.includes("</outerBoundaryIs>")) dansOuter = false;

      // Coordonnées : pour un Polygon, SEUL l'anneau extérieur (les trous
      // deviendraient des polygones parasites).
      const prendre = (geom === "LineString") || (geom === "Polygon" && dansOuter);
      if (prendre) {
        if (l.includes("<coordinates>")) {
          dansCoords = true;
          const apres = l.split("<coordinates>")[1] || "";
          coords += apres.split("</coordinates>")[0] + " ";
          if (l.includes("</coordinates>")) dansCoords = false;
        } else if (dansCoords) {
          if (l.includes("</coordinates>")) { coords += l.split("</coordinates>")[0] + " "; dansCoords = false; }
          else coords += l + " ";
        }
      }

      // Fermeture : on émet TOUT DE SUITE, sans attendre la fin du Placemark.
      // C'est là toute la correction.
      if (l.includes("</LineString>") || l.includes("</Polygon>")) { emettre(); dansCoords = false; }
      if (l.includes("</Placemark>")) { emettre(); dansPm = false; nomPm = null; dansCoords = false; }
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
    const nAnon = p1.zones.filter(function (z) { return z.anonyme; }).length;
    if (nAnon) {
      console.log("⚠️  " + nAnon + " zone(s) SANS NOM dans la source (ni nom_usage, ni identifiant).");
      console.log("    Nommées « (sans nom) #N » pour rester extractables — la numérotation");
      console.log("    est stable tant que le fichier source ne change pas.");
    }
    return;
  }

  if (!p1.cibles.length) {
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

  // Emprise englobante, pour l'affichage récapitulatif.
  const bb = p1.cibles.reduce(function (a, c) {
    return { x0: Math.min(a.x0, c.bbox.x0), x1: Math.max(a.x1, c.bbox.x1),
             y0: Math.min(a.y0, c.bbox.y0), y1: Math.max(a.y1, c.bbox.y1) };
  }, { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  const lat = (bb.y0 + bb.y1) / 2;
  const nSom = p1.cibles.reduce(function (n, c) { return n + c.poly.length; }, 0);
  console.log("Zone      : " + p1.cibles[0].nom +
              (p1.cibles.length > 1 ? "  (" + p1.cibles.length + " emprises distinctes, fusionnées)" : "") +
              " — " + nSom + " sommets au total");
  console.log("Emprise   : " + Math.round((bb.x1 - bb.x0) * 111320 * Math.cos(lat * Math.PI / 180)) +
              " m (E-O) × " + Math.round((bb.y1 - bb.y0) * 111320) + " m (N-S)");
  console.log("Marge     : " + MARGE_M + " m autour du contour");
  console.log("Couches   : " + COUCHES + "   (niveaux | historique | tout)");
  if (COUCHES !== "niveaux") {
    console.log("Historique: rangé au niveau " + (NIV_HISTO >= 0 ? "+" + NIV_HISTO : NIV_HISTO) +
                "  (--historique-niveau pour changer)\n");
  } else { console.log(""); }

  process.stdout.write("Passe 2/2 — filtrage des galeries… ");
  const p2 = await passe2(p1.cibles);
  console.log("terminé\n");

  const st = p2.stats;
  console.log("Placemarks lus        : " + st.lus.toLocaleString("fr-FR"));
  console.log("Geometries lues       : " + st.geoms.toLocaleString("fr-FR"));
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
  const dest = path.join(OUT_DIR, p1.cibles[0].nom.replace(/[^\w.-]+/g, "_") + ".geojson");
  fs.writeFileSync(dest, JSON.stringify({ type: "FeatureCollection", features: feats }));

  const mo = (fs.statSync(dest).size / 1048576).toFixed(2);
  console.log("\n📄 " + dest + "  (" + mo + " Mo, " + feats.length + " features)");

  // Le seuil de l'app, dit ICI plutôt que découvert à l'import.
  // Aligne sur sigImport : avertissement a 20 000, refus dur a 60 000.
  const MAX = 60000, WARN = 20000;
  if (feats.length > MAX) {
    console.log("\n⚠️  " + feats.length + " features > la limite de " + MAX + " de l'import SIG.");
    console.log("   Ce fichier sera REFUSÉ par l'app. Pistes, dans l'ordre :");
    console.log("     • `--couches niveaux` : le relevé structuré SEUL, sans le topo");
    console.log("       historique — c'est lui qui pèse le plus lourd ;");
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
