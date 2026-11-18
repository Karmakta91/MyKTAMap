#!/usr/bin/env node
/*
 * MyKTAMap — check-detection.js
 * Garde-fou BLOQUANT du moteur de détection des structures (js/ktaDetection.js), en Node, sur des images
 * FABRIQUÉES ici (aucune image de plan réel, rien de data/).
 *
 * Ce qu'il garantit : formes retrouvées à la simplification près (carré, rectangle, L, polygone oblique), aire
 * exacte (contour sur les bords des pixels), classes de couleur séparées (orange / gris) et tolérance au bruit
 * de compression, moucheté et contours creux retirés par l'ouverture, aire minimale, pastille posée sur une
 * masse sans effet, piliers collés fusionnés (limite connue), masse à cheval sur deux blocs rendue UNE fois, masse
 * plus grande que la marge signalée et jamais coupée, masse coupée par le cadre demandé rendue entière, lecture
 * à résolution réduite, réglages en mètres, annulation, worker (message → résultat). Fronts : trait droit et en L,
 * trait de la couleur d'un pilier (le pilier reste une masse, le trait ne le traverse pas), ergot, bruit, trait sur
 * plusieurs blocs raccordé.
 * Contre-épreuves (sabotages) : sans marge, sans ouverture, sans dédoublonnage des blocs, sans comblement des trous,
 * sans classe de masse (squelette du pilier dans le trait), sans raccord des traits → le contrôle rougit.
 *
 * Usage : node scripts/check-detection.js   (exit 1 si un contrôle échoue)
 */
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const D = require(path.join(__dirname, "..", "js", "ktaDetection.js"));

let ko = 0;
const t = (n, c, detail) => {
  console.log((c ? "✅" : "❌") + " " + n + (!c && detail !== undefined ? " " + JSON.stringify(detail) : ""));
  if (!c) ko++;
};

const ORANGE = [255, 153, 51], GRIS = [150, 150, 150], NOIR = [20, 20, 20], BLANC = [255, 255, 255];
const CLASSES = [{ id: "a", couleurs: [ORANGE], tolerance: 14 }, { id: "b", couleurs: [GRIS], tolerance: 10 }];

// ── Image fabriquée : fond blanc, primitives remplies au pixel près ──
function image(W, H) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255; data[i * 4 + 3] = 255; }
  const img = {
    W, H, data,
    px(x, y, c) {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const k = (y * W + x) * 4; data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2];
    },
    rect(x, y, w, h, c) {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) img.px(i, j, c);
      return img;
    },
    // polygone rempli (règle pair-impair, centre de pixel)
    poly(pts, c) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const cx = x + 0.5, cy = y + 0.5; let dedans = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > cy) !== (yj > cy) && cx < (xj - xi) * (cy - yi) / (yj - yi) + xi) dedans = !dedans;
        }
        if (dedans) img.px(x, y, c);
      }
      return img;
    },
    anneau(x, y, w, h, ep, c) {
      img.rect(x, y, w, ep, c); img.rect(x, y + h - ep, w, ep, c);
      img.rect(x, y, ep, h, c); img.rect(x + w - ep, y, ep, h, c); return img;
    },
    disque(cx, cy, r, c) {
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) img.px(x, y, c);
      return img;
    },
    // bruit déterministe ± a sur chaque canal (compression JPEG)
    bruit(a) {
      let g = 12345;
      for (let i = 0; i < W * H * 4; i++) {
        if (i % 4 === 3) continue;
        g = (g * 1103515245 + 12345) & 0x7fffffff;
        data[i] = Math.max(0, Math.min(255, data[i] + ((g % (2 * a + 1)) - a)));
      }
      return img;
    }
  };
  return img;
}
// lireBloc d'une image fabriquée, à l'échelle e (plus proche voisin)
function lecteur(img) {
  return function (x, y, w, h, e) {
    const bw = Math.max(1, Math.round(w * e)), bh = Math.max(1, Math.round(h * e));
    const out = new Uint8ClampedArray(bw * bh * 4);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const sx = Math.min(img.W - 1, Math.floor(x + (i + 0.5) / e));
      const sy = Math.min(img.H - 1, Math.floor(y + (j + 0.5) / e));
      const s = (sy * img.W + sx) * 4, d = (j * bw + i) * 4;
      out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3];
    }
    return Promise.resolve({ data: out, w: bw, h: bh });
  };
}
function lancer(img, extra) {
  return D.detecter(Object.assign({ lireBloc: lecteur(img), region: { x: 0, y: 0, w: img.W, h: img.H },
    limites: { w: img.W, h: img.H }, classes: CLASSES, reglages: { aireMin: 100, ouverture: 7 } }, extra || {}));
}
const boiteDe = m => {
  const xs = m.points.map(p => p.x), ys = m.points.map(p => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const proche = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

(async function main() {
  // ── Couleurs ──
  t("ΔE : une couleur est à 0 d'elle-même", D.deltaE(D.rgbVersLab(10, 200, 30), D.rgbVersLab(10, 200, 30)) === 0);
  t("ΔE : orange et gris très éloignés (> 40)", D.deltaE(D.rgbVersLab(...ORANGE), D.rgbVersLab(...GRIS)) > 40);

  // ── Formes ──
  const f = image(400, 300)
    .rect(20, 20, 40, 40, ORANGE)                                   // carré
    .rect(100, 30, 80, 30, GRIS)                                    // rectangle gris
    .poly([[220, 20], [300, 20], [300, 50], [250, 50], [250, 100], [220, 100]], ORANGE)   // L
    .poly([[60, 150], [140, 130], [160, 210], [80, 230]], ORANGE);  // quadrilatère oblique
  let r = await lancer(f);
  t("formes : 4 masses", r.masses.length === 4, r.masses.length);
  const carre = r.masses.find(m => proche(boiteDe(m), [20, 20, 60, 60], 0.01));
  t("carré : contour sur les bords des pixels (20,20)-(60,60), 4 sommets", !!carre && carre.points.length === 4,
    carre && carre.points);
  t("carré : aire exacte 1 600 px²", !!carre && Math.abs(carre.aire - 1600) < 0.01, carre && carre.aire);
  const rect = r.masses.find(m => m.classe === "b");
  t("rectangle gris : classe b, boîte (100,30)-(180,60)", !!rect && proche(boiteDe(rect), [100, 30, 180, 60], 0.01));
  const L = r.masses.find(m => proche(boiteDe(m), [220, 20, 300, 100], 0.01));
  t("L : 6 sommets, aire 80×30 + 30×50 = 3 900 px²", !!L && L.points.length === 6 && Math.abs(L.aire - 3900) < 1,
    L && [L.points.length, L.aire]);
  const obl = r.masses.find(m => proche(boiteDe(m), [60, 130, 160, 230], 2.5));
  t("quadrilatère oblique : retrouvé à la simplification près (≤ 8 sommets)", !!obl && obl.points.length <= 8,
    obl && obl.points.length);

  // ── Bruit de compression ──
  r = await lancer(image(400, 300).rect(20, 20, 40, 40, ORANGE).rect(100, 30, 80, 30, GRIS).bruit(10));
  t("bruit ± 10 : les 2 masses tiennent", r.masses.length === 2, r.masses.length);

  // ── Ouverture : moucheté, contours creux, appendice ──
  const bruitee = image(300, 300).rect(100, 100, 50, 50, ORANGE);
  for (let k = 0; k < 400; k++) bruitee.px((k * 37) % 300, (k * 91) % 300, ORANGE);   // moucheté isolé
  bruitee.anneau(20, 180, 80, 80, 3, ORANGE);                                          // contour creux (3 px)
  bruitee.rect(150, 120, 30, 2, ORANGE);                                               // appendice fin
  r = await lancer(bruitee);
  t("ouverture : moucheté, contour creux et appendice retirés → 1 masse", r.masses.length === 1, r.masses.length);
  t("ouverture : l'appendice n'allonge pas la masse", r.masses.length === 1 && boiteDe(r.masses[0])[2] <= 150.01,
    r.masses[0] && boiteDe(r.masses[0]));
  // contre-épreuve : sans ouverture (côté 1), le contour creux sort
  r = await lancer(bruitee, { reglages: { aireMin: 100, ouverture: 1 } });
  t("contre-épreuve : sans ouverture, le contour creux est pris pour une masse", r.masses.length >= 2, r.masses.length);

  // ── Aire minimale ──
  r = await lancer(image(200, 200).rect(10, 10, 8, 8, ORANGE).rect(50, 50, 30, 30, ORANGE));
  t("aire minimale : la petite masse est ignorée et comptée", r.masses.length === 1 && r.ignorees >= 1,
    [r.masses.length, r.ignorees]);

  // ── Pastille sur une masse ──
  r = await lancer(image(200, 200).rect(40, 40, 100, 100, GRIS).disque(90, 90, 8, BLANC).disque(100, 60, 5, NOIR));
  t("pastilles posées sur une masse : une seule masse, contour extérieur entier",
    r.masses.length === 1 && proche(boiteDe(r.masses[0]), [40, 40, 140, 140], 0.01), r.masses.length);

  // 🩸 Pastille au centre d'un pilier ÉTROIT : sans comblement des petits trous, l'ouverture efface les bandes
  // de part et d'autre et coupe le pilier en deux (limite vue sur un relevé réel le 17/11).
  r = await lancer(image(200, 200).rect(40, 40, 24, 70, ORANGE).disque(52, 75, 5, BLANC), { reglages: { aireMin: 100,
    ouverture: 13 } });
  t("pastille au centre d'un pilier étroit : un seul pilier, entier",
    r.masses.length === 1 && proche(boiteDe(r.masses[0]), [40, 40, 64, 110], 0.01), r.masses.map(boiteDe));
  r = await lancer(image(200, 200).rect(40, 40, 24, 70, ORANGE).disque(52, 75, 5, BLANC), { reglages: { aireMin: 100,
    ouverture: 13, trouMax: 0 } });
  t("contre-épreuve : sans comblement des trous, la pastille coupe le pilier", r.masses.length !== 1 ||
    !proche(boiteDe(r.masses[0]), [40, 40, 64, 110], 0.01), r.masses.map(boiteDe));
  r = await lancer(image(300, 300).anneau(40, 40, 120, 120, 4, ORANGE), { reglages: { aireMin: 100, ouverture: 7 } });
  t("contour creux de grande taille : jamais comblé en masse", r.masses.length === 0, r.masses.map(boiteDe));

  // ── Piliers collés (limite connue : fusionnés) ──
  r = await lancer(image(200, 200).rect(20, 20, 40, 40, ORANGE).rect(60, 20, 40, 40, ORANGE));
  t("piliers collés : fusionnés en une masse (limite connue, retouche dans l'aperçu)", r.masses.length === 1);

  // ── Blocs : masse à cheval, masse trop grande, masse coupée par le cadre ──
  const grand = image(600, 400).rect(110, 110, 40, 40, ORANGE).rect(300, 50, 260, 40, GRIS)
    .rect(20, 300, 30, 30, ORANGE);
  const petitsBlocs = { reglages: { aireMin: 100, ouverture: 7, bloc: 128, marge: 64 } };
  r = await lancer(grand, petitsBlocs);
  const aCheval = r.masses.filter(m => proche(boiteDe(m), [110, 110, 150, 150], 0.01));
  t("blocs de 128 px : la masse à cheval sur 4 blocs est rendue une fois", aCheval.length === 1, aCheval.length);
  t("blocs : la masse plus grande que la marge est signalée, jamais coupée",
    r.tropGrands.length === 1 && !r.masses.some(m => m.classe === "b"), [r.tropGrands.length, r.masses.length]);
  t("blocs : plusieurs blocs lus (" + r.blocs + ")", r.blocs === 20, r.blocs);
  // contre-épreuve : sans marge, la masse à cheval est coupée (plusieurs morceaux ou signalée)
  r = await lancer(grand, { reglages: { aireMin: 10, ouverture: 7, bloc: 128, marge: 0 } });
  t("contre-épreuve : sans marge, la masse à cheval n'est plus rendue entière",
    !r.masses.some(m => proche(boiteDe(m), [110, 110, 150, 150], 0.01)));
  // contre-épreuve : un bloc qui rendrait tout ce qu'il lit (cœur = bloc entier) sortirait la masse plusieurs fois
  r = await lancer(grand, Object.assign({ executer: b => Promise.resolve(D.detecterBloc(Object.assign({}, b,
    { coeur: { x: 0, y: 0, w: b.w, h: b.h } }))) }, petitsBlocs));
  t("contre-épreuve : sans le cœur de bloc, la masse à cheval sort plusieurs fois",
    r.masses.filter(m => proche(boiteDe(m), [110, 110, 150, 150], 0.01)).length > 1);
  // cadre demandé qui coupe une masse : la marge lue au-delà la garde entière
  r = await lancer(grand, { region: { x: 0, y: 0, w: 130, h: 130 } });
  t("cadre (0,0)-(130,130) qui coupe la masse : rendue entière (110,110)-(150,150)",
    r.masses.length === 1 && proche(boiteDe(r.masses[0]), [110, 110, 150, 150], 0.01),
    r.masses.map(boiteDe));
  r = await lancer(grand, { region: { x: 120, y: 120, w: 100, h: 100 } });
  t("cadre qui ne contient pas le coin haut-gauche de la masse : rien (son bloc voisin la rendrait)",
    r.masses.length === 0, r.masses.map(boiteDe));

  // ── Traits (fronts) : couleur du trait moins les masses, squelette, ergots, raccord entre blocs ──
  const AT = [{ id: "a", couleurs: [ORANGE], tolerance: 14 },
    { id: "f", nature: "trait", couleurs: [ORANGE], tolerance: 14 }];
  const lancerT = (img, extra) => lancer(img, Object.assign({ classes: AT }, extra || {}));
  const bornes = tr => {
    const xs = tr.points.map(p => p.x), ys = tr.points.map(p => p.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  r = await lancerT(image(400, 200).rect(20, 98, 300, 4, ORANGE));
  t("trait droit de 4 px : un front, de x≈20 à x≈320, 2 ou 3 sommets, aucune masse",
    r.traits.length === 1 && r.masses.length === 0 && r.traits[0].points.length <= 3 &&
    Math.abs(bornes(r.traits[0])[0] - 20) <= 4 && Math.abs(bornes(r.traits[0])[2] - 320) <= 4,
    r.traits.map(x => x.points));
  r = await lancerT(image(400, 300).rect(40, 40, 4, 200, ORANGE).rect(40, 236, 250, 4, ORANGE));
  t("trait en L : un front, 3 sommets", r.traits.length === 1 && r.traits[0].points.length === 3,
    r.traits.map(x => x.points));
  // pilier de la même couleur posé sur le trait : le trait ne le traverse pas, le pilier reste une masse
  r = await lancerT(image(400, 200).rect(20, 98, 360, 4, ORANGE).rect(160, 70, 60, 60, ORANGE));
  // un segment du trait qui traverse le pilier (Douglas-Peucker ne garde aucun sommet sur une partie droite)
  const traverse = tr => tr.points.some((p, i) => i > 0 && Math.min(p.x, tr.points[i - 1].x) < 180 &&
    Math.max(p.x, tr.points[i - 1].x) > 200 && p.y > 75 && p.y < 125);
  const entre = r.traits.some(traverse);
  t("trait de la couleur d'un pilier : le pilier reste une masse, le trait ne passe pas dedans",
    r.masses.length === 1 && r.traits.length >= 1 && !entre, { masses: r.masses.length, traits: r.traits.length });
  r = await lancerT(image(400, 200).rect(20, 98, 360, 4, ORANGE).rect(160, 70, 60, 60, ORANGE),
    { classes: [AT[1]] });
  t("contre-épreuve : sans classe de masse, le squelette du pilier rentre dans le trait",
    r.traits.some(traverse));
  // ergot de 8 px au milieu d'un trait : retiré ; le trait reste d'un seul tenant (raccord)
  r = await lancerT(image(400, 200).rect(20, 98, 300, 4, ORANGE).rect(150, 90, 4, 10, ORANGE));
  t("ergot court : retiré, un seul front", r.traits.length === 1 &&
    !r.traits[0].points.some(p => p.y < 94), r.traits.map(x => x.points));
  r = await lancerT(image(300, 200).rect(40, 50, 12, 3, ORANGE).rect(40, 120, 200, 3, ORANGE));
  t("bruit : un bout de trait plus court que la longueur minimale est ignoré", r.traits.length === 1,
    r.traits.map(bornes));
  // trait sur plusieurs blocs : un seul front après raccord ; contre-épreuve sans raccord
  const long = image(600, 300).rect(10, 148, 580, 4, ORANGE);
  r = await lancerT(long, petitsBlocs);
  t("trait à cheval sur 5 blocs : un seul front après raccord", r.traits.length === 1 &&
    Math.abs(bornes(r.traits[0])[0] - 10) <= 4 && Math.abs(bornes(r.traits[0])[2] - 590) <= 4,
    r.traits.map(bornes));
  const morceaux = [];
  await lancerT(long, Object.assign({ executer: b => {
    const x = D.detecterBloc(b); morceaux.push.apply(morceaux, x.traits); return Promise.resolve(x);
  } }, petitsBlocs));
  t("contre-épreuve : sans raccord, le trait sort en plusieurs morceaux (" + morceaux.length + ")",
    morceaux.length > 1);

  // ── Résolution réduite ──
  r = await lancer(grand, { echelle: 0.5 });
  const red = r.masses.find(m => proche(boiteDe(m), [110, 110, 150, 150], 2.01));
  t("échelle 0,5 : coordonnées rendues en pixels du plan (à 2 px près)", !!red, r.masses.map(boiteDe));

  // ── Réglages en mètres ──
  const rm = D.depuisMetres({ ouvertureM: 0.5, aireMinM2: 0.25, simplificationM: 0.05 }, 20);
  t("réglages en mètres à 20 px/m : 10 px, 100 px², 1 px",
    rm.ouverture === 10 && rm.aireMin === 100 && rm.simplification === 1,
    rm);

  // ── Annulation ──
  const ac = { aborted: true };
  let annule = false;
  try { await lancer(grand, { signal: ac }); } catch (e) { annule = e.name === "AbortError"; }
  t("annulation : AbortError, rien rendu", annule);

  // ── Avancement ──
  const vus = [];
  await lancer(grand, Object.assign({ onProgres: (i, n) => vus.push(i + "/" + n) }, petitsBlocs));
  t("avancement : un appel par bloc, jusqu'à n/n", vus.length === 20 && vus[19] === "20/20", vus.slice(-1));

  // ── Worker : le fichier charge le moteur et répond à un message ──
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "ktaDetectionWorker.js"), "utf8");
  const envoyes = [];
  const self = { postMessage: m => envoyes.push(m) };
  self.importScripts = function (f) {
    t("worker : importe ktaDetection.js du même dossier", f === "ktaDetection.js", f);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx);
  };
  const ctx = vm.createContext({ self, importScripts: self.importScripts, Uint8Array, Uint8ClampedArray, Int32Array,
    Math, Map, Promise, console, setTimeout });
  ctx.self = self;
  vm.runInContext(src, ctx);
  const b = await lecteur(image(100, 100).rect(10, 10, 40, 40, ORANGE))(0, 0, 100, 100, 1);
  self.onmessage({ data: { id: 7, bloc: { data: b.data, w: b.w, h: b.h, x0: 0, y0: 0, echelle: 1, classes: CLASSES,
    reglages: D.REGLAGES } } });
  t("worker : répond { id, resultat } avec la masse", envoyes.length === 1 && envoyes[0].id === 7 &&
    envoyes[0].resultat && envoyes[0].resultat.masses.length === 1, envoyes[0]);
  self.onmessage({ data: { id: 8, bloc: null } });
  t("worker : une erreur revient en { id, erreur }, sans casser le worker", envoyes[1] && envoyes[1].id === 8 &&
    typeof envoyes[1].erreur === "string");

  // ── Pas de DOM dans le moteur ──
  const moteur = fs.readFileSync(path.join(__dirname, "..", "js", "ktaDetection.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  t("moteur pur : ni document, ni map, ni APP_CONFIG", !/\bdocument\.|window\.map\b|APP_CONFIG/.test(moteur));

  console.log(ko ? "\n❌ check-detection : " + ko + " échec(s)" : "\n🎉 check-detection : moteur de détection OK");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error("❌ check-detection : exception", e); process.exit(1); });
