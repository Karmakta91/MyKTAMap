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
 * plusieurs blocs raccordé. Exemple touché mesuré (aire, épaisseur, étalement, écart au fond), réglages déduits ;
 * scène brune (piliers de 6 à 50 px, bruit, dégradé, filigrane, flou) : ≥ 90 % avec 3 touchers, contre-épreuve
 * sur les réglages d'avant (la majorité ratée) ; scène bleue à bandes de galerie soudées : > 90 % sans curseur,
 * aucune bande posée, contre-épreuve sans le critère des bandes (< 70 %) ; pilier allongé gardé ; front et mur en
 * trait de la couleur des piliers ; pipette sur un trait de 2 px, un coin de pilier, le fond ; scènes « fond blanc »
 * (piliers blancs ou gris clair cernés d'un trait, taille maximale, contre-épreuve sans elle) ; recalcul sur les
 * blocs gardés sans relecture.
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
// Image entière en bloc (mesure d'un exemple).
function lecteurSync(img) { return { data: img.data, w: img.W, h: img.H }; }

// Scène brune (imite un plan peu détaillé, non calibré) : beaucoup de piliers de 6 à 12 px, des moyens, quelques
// gros, contour noir, dégradé de couleur, filigrane clair semi-transparent, bruit ± 20, flou 3 × 3.
function sceneBrune() {
  const W = 700, H = 460, img = image(W, H), vrais = [];
  let g = 11;
  const al = () => { g = (g * 16807) % 2147483647; return g / 2147483647; };
  for (let y = 20; y < H - 60; y += 46) for (let x = 20; x < W - 60; x += 46) {
    const r = al(), w = r < 0.5 ? 6 + al() * 6 : r < 0.9 ? 14 + al() * 16 : 40 + al() * 10;
    vrais.push({ x, y, w: Math.round(w), h: Math.round(w * (0.8 + al() * 0.8)) });
  }
  const f = new Float32Array(W * H * 3).fill(255);
  const poser = (i, j, c) => {
    if (i < 0 || j < 0 || i >= W || j >= H) return;
    const k = (j * W + i) * 3;
    f[k] = c[0]; f[k + 1] = c[1]; f[k + 2] = c[2];
  };
  vrais.forEach((p) => {
    for (let j = p.y - 2; j < p.y + p.h + 2; j++) for (let i = p.x - 2; i < p.x + p.w + 2; i++) {
      const dedans = i >= p.x && i < p.x + p.w && j >= p.y && j < p.y + p.h, t = (i / W) * 40 - 20;
      poser(i, j, dedans ? [150 + t, 90 + t * 0.6, 40 + t * 0.3] : [30, 30, 30]);
    }
  });
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!(((i + j) % 160 < 14) || ((i - j + 2000) % 220 < 14))) continue;
    const k = (j * W + i) * 3;
    for (let c = 0; c < 3; c++) f[k + c] = f[k + c] * 0.7 + 225 * 0.3;
  }
  let h = 7;
  for (let i = 0; i < f.length; i++) { h = (h * 1103515245 + 12345) & 0x7fffffff; f[i] += (h % 41) - 20; }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) for (let c = 0; c < 3; c++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = i + dx, y = j + dy;
      if (x >= 0 && y >= 0 && x < W && y < H) { s += f[(y * W + x) * 3 + c]; n++; }
    }
    img.data[(j * W + i) * 4 + c] = s / n;
  }
  return { img, vrais, couleur: [150, 90, 40], petit: vrais.find((p) => Math.min(p.w, p.h) <= 8),
    gauche: vrais.find((p) => p.x < 200 && p.w > 20), droite: vrais.filter((p) => p.x > 500 && p.w > 20).pop() };
}
// Scène bleue : piliers bleu clair bordés de bleu, bandes de galerie du même bleu clair (6 à 10 px).
function sceneBleue() {
  const W = 700, H = 460, img = image(W, H), vrais = [], BLEU = [170, 215, 245], BORD = [60, 110, 200];
  let g = 5;
  const al = () => { g = (g * 16807) % 2147483647; return g / 2147483647; };
  for (let y = 30; y < H - 60; y += 70) for (let x = 30; x < W - 60; x += 70) {
    const w = Math.round(10 + al() * 30), h = Math.round(10 + al() * 30);
    vrais.push({ x, y, w, h });
    for (let j = y - 1; j <= y + h; j++) for (let i = x - 1; i <= x + w; i++) {
      img.px(i, j, (i < x || j < y || i === x + w || j === y + h) ? BORD : BLEU);
    }
  }
  for (let b = 0; b < 6; b++) {
    const ep = 6 + (b % 5), y0 = 50 + b * 70, pente = (b % 3 - 1) * 0.15;
    for (let x = 0; x < W; x++) {
      const yc = Math.round(y0 + 35 + pente * (x - W / 2));
      for (let t = 0; t < ep; t++) img.px(x, yc + t, BLEU);
    }
  }
  img.bruit(10);
  return { img, vrais, petit: vrais.find((p) => Math.min(p.w, p.h) < 14),
    gros: vrais.find((p) => p.w > 30 && p.h > 30) };
}
// Scène « fond blanc » : plan au trait, galeries blanches entre des murs noirs, piliers de la couleur `pilier`
// (blancs = celle du fond) cernés d'un trait noir de 1 ou 2 px.
function sceneBlanche(pilier) {
  const W = 700, H = 460, img = image(W, H), vrais = [];
  let g = 3;
  const al = () => { g = (g * 16807) % 2147483647; return g / 2147483647; };
  for (let y = 40; y < H - 70; y += 72) for (let x = 40; x < W - 70; x += 72) {
    const w = Math.round(14 + al() * 30), h = Math.round(14 + al() * 30), ep = al() < 0.5 ? 1 : 2;
    vrais.push({ x, y, w, h });
    img.rect(x - ep, y - ep, w + 2 * ep, h + 2 * ep, NOIR).rect(x, y, w, h, pilier);
  }
  // murs des galeries (traits noirs de 2 px) qui découpent le fond sans fermer de pilier
  for (let x = 20; x < W; x += 144) img.rect(x, 0, 2, H, NOIR);
  return { img, vrais, petit: vrais.reduce((a, p) => (p.w * p.h < a.w * a.h ? p : a)),
    gros: vrais.reduce((a, p) => (p.w * p.h > a.w * a.h ? p : a)) };
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
  // (sans le critère des bandes, qui retire aussi un contour creux : c'est l'ouverture qu'on éprouve ici)
  r = await lancer(bruitee, { reglages: { aireMin: 100, ouverture: 1, bandes: false } });
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

  // ── Exemple touché à la pipette : composante, épaisseur, étalement ──
  const ex1 = D.mesurerExemple(lecteurSync(image(200, 200).rect(50, 40, 10, 30, ORANGE)), 55, 55);
  t("exemple mesuré : pilier de 10 × 30 px → aire 300, épaisseur 9 à 10, non coupé",
    ex1 && ex1.aire === 300 && ex1.epaisseur >= 9 && ex1.epaisseur <= 10 && !ex1.coupe, ex1);
  const ex2 = D.mesurerExemple(lecteurSync(image(200, 200).rect(50, 40, 40, 40, ORANGE).bruit(12)), 70, 60);
  t("exemple bruité : couleur médiane proche de l'orange, étalement mesuré (> 0)",
    ex2 && D.deltaE(D.rgbVersLab(...ex2.rgb), D.rgbVersLab(...ORANGE)) < 6 && ex2.etalement > 0, ex2);
  const ex3 = D.mesurerExemple(lecteurSync(image(100, 100).rect(0, 0, 100, 100, GRIS)), 50, 50);
  t("exemple qui remplit la fenêtre : signalé coupé ou fond (l'appelant relit plus grand)",
    ex3 && (ex3.coupe || ex3.fond), ex3);
  // 🩸 Pipette sur un trait fin ou un coin de pilier, un peu à côté du centre : la médiane du carré 5 × 5 était
  // le fond, le pixel touché rejeté, et la pipette disait « aucune image » (trait de 2 px : 2 touchers sur 2).
  const trait2 = lecteurSync(image(192, 192).rect(0, 95, 192, 2, ORANGE));
  const surTrait = [95, 96].map((y) => D.mesurerExemple(trait2, 96, y));
  t("pipette sur un trait de 2 px : chaque toucher sur le trait donne un exemple orange",
    surTrait.every((m) => m && !m.fond && D.deltaE(D.rgbVersLab(...m.rgb), D.rgbVersLab(...ORANGE)) < 6), surTrait);
  const pil10 = lecteurSync(image(192, 192).rect(90, 90, 10, 10, ORANGE));
  let ratesPil = 0;
  for (let y = 90; y < 100; y++) for (let x = 90; x < 100; x++) {
    const m = D.mesurerExemple(pil10, x, y);
    if (!m || m.fond || m.aire !== 100) ratesPil++;
  }
  t("pipette sur un pilier de 10 × 10 : les 100 pixels touchés donnent le pilier entier (aire 100)", ratesPil === 0,
    ratesPil);
  const surFond = D.mesurerExemple(pil10, 20, 20);
  t("pipette sur le fond : dit « fond » (pas « aucune image »), aucun exemple", surFond && surFond.fond === true,
    surFond);
  const rd = D.reglagesDepuisExemples({ a: [{ rgb: ORANGE, epaisseur: 7, etalement: 20.9 },
    { rgb: [200, 120, 60], epaisseur: 30, etalement: 4 }], b: [{ rgb: GRIS, epaisseur: 5, etalement: 2, coupe: true }],
    f: [{ rgb: ORANGE, epaisseur: 3, etalement: 1 }] }, { a: "masse", b: "masse", f: "trait" });
  t("réglages déduits : tolérance = étalement + marge (27), plancher 22, " +
    "taille = plus petit exemple de masse non coupé",
    rd.tolerances.a === 27 && rd.tolerances.b === 22 && rd.tolerances.f === 22 && rd.taille === 7, rd);
  const rt = D.reglagesPourTaille(7), rtm = D.reglagesPourTaille(7, 100);
  t("taille 7 px → ouverture 4, aire 25, trou 29 ; plan à 100 px/m : aire ≥ 10 × 10 cm",
    rt.ouverture === 4 && rt.aireMin === 25 && rt.trouMax === 29 && rtm.aireMin === 100, [rt, rtm]);

  // ── Scène brune (essai sur un vrai plan : 3 piliers sur une soixantaine) ──
  const brune = sceneBrune();
  const trouvesBrun = (res) => brune.vrais.filter((p) => res.masses.some((m) => {
    const cx = m.boite.x + m.boite.w / 2, cy = m.boite.y + m.boite.h / 2;
    return cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h;
  })).length;
  const lireBrun = lecteur(brune.img);
  const exBrun = [brune.gauche, brune.droite, brune.petit].map((p) =>
    D.mesurerExemple(lecteurSync(brune.img), p.x + p.w / 2, p.y + p.h / 2));
  const dBrun = D.reglagesDepuisExemples({ a: exBrun }, { a: "masse" });
  const rBrun = await D.detecter({ lireBloc: lireBrun, region: { x: 0, y: 0, w: brune.img.W, h: brune.img.H },
    limites: { w: brune.img.W, h: brune.img.H }, reglages: D.reglagesPourTaille(dBrun.taille),
    classes: [{ id: "a", couleurs: exBrun.map((x) => x.rgb), tolerance: dBrun.tolerances.a }] });
  const nBrun = trouvesBrun(rBrun);
  t("scène brune (bruit ± 20, dégradé, filigrane, flou), 3 touchers : " + nBrun + "/" + brune.vrais.length +
    " piliers trouvés (≥ 90 %)", nBrun >= 0.9 * brune.vrais.length,
    { tolerance: dBrun.tolerances.a, taille: dBrun.taille });
  const rAncien = await D.detecter({ lireBloc: lireBrun, region: { x: 0, y: 0, w: brune.img.W, h: brune.img.H },
    limites: { w: brune.img.W, h: brune.img.H }, reglages: { ouverture: 13, aireMin: 250 },
    classes: [{ id: "a", couleurs: [brune.couleur], tolerance: 14 }] });
  const nAncien = trouvesBrun(rAncien);
  t("contre-épreuve : réglages d'avant (13 px, 250 px², ΔE 14) → la majorité ratée (" + nAncien + "/" +
    brune.vrais.length + ")", nAncien < 0.5 * brune.vrais.length);

  // ── Scène bleue : bandes de galerie de la couleur des piliers (6 à 10 px) ──
  const bleue = sceneBleue();
  const trouvesBleu = (res) => bleue.vrais.filter((p) => res.masses.some((m) => {
    const cx = m.boite.x + m.boite.w / 2, cy = m.boite.y + m.boite.h / 2;
    return cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h;
  })).length;
  const exBleu = [bleue.petit, bleue.gros].map((p) =>
    D.mesurerExemple(lecteurSync(bleue.img), p.x + p.w / 2, p.y + p.h / 2));
  const dBleu = D.reglagesDepuisExemples({ a: exBleu }, { a: "masse" });
  const bleueAvec = (taille, bandes) => D.detecter({ lireBloc: lecteur(bleue.img),
    region: { x: 0, y: 0, w: bleue.img.W, h: bleue.img.H }, limites: { w: bleue.img.W, h: bleue.img.H },
    reglages: Object.assign({ bandes: bandes }, D.reglagesPourTaille(taille)),
    classes: [{ id: "a", couleurs: exBleu.map((x) => x.rgb), tolerance: dBleu.tolerances.a }] });
  const rBleu = await bleueAvec(dBleu.taille, true), nBleu = trouvesBleu(rBleu);
  // une masse dont le centre n'est dans aucun pilier = une bande (ou un morceau de bande) posée en pilier
  const horsPilier = rBleu.masses.filter((m) => !bleue.vrais.some((p) => {
    const cx = m.boite.x + m.boite.w / 2, cy = m.boite.y + m.boite.h / 2;
    return cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h;
  }));
  t("scène bleue, bandes de galerie soudées (6 à 10 px), réglages déduits SANS curseur : " + nBleu + "/" +
    bleue.vrais.length + " piliers (> 90 %)", nBleu > 0.9 * bleue.vrais.length, { taille: dBleu.taille });
  t("scène bleue : aucune bande posée en pilier (toute masse a son centre dans un pilier)", horsPilier.length === 0,
    horsPilier.map((m) => m.boite));
  const nSansCritere = trouvesBleu(await bleueAvec(dBleu.taille, false));
  t("contre-épreuve : sans le critère des bandes, la scène bleue retombe sous 70 % (" + nSansCritere + "/" +
    bleue.vrais.length + ")", nSansCritere < 0.7 * bleue.vrais.length);
  // pilier allongé (12 × 48, épaisseur constante sur son axe) : la pointe libre ne rend rien, il reste un pilier
  r = await lancer(image(200, 200).rect(60, 40, 12, 48, ORANGE), { reglages: { aireMin: 100, ouverture: 7 } });
  t("pilier allongé (12 × 48) : jamais pris pour une bande", r.masses.length === 1, r.masses.map(boiteDe));
  // front (4 px) et mur levé en trait (10 px) de la couleur des piliers : la classe trait les voit toujours, et le
  // mur n'est pas posé en pilier
  r = await lancer(image(500, 300).rect(40, 40, 40, 40, ORANGE).rect(20, 150, 440, 4, ORANGE)
    .rect(20, 220, 440, 10, ORANGE), { classes: [{ id: "a", couleurs: [ORANGE], tolerance: 14 },
    { id: "f", nature: "trait", couleurs: [ORANGE], tolerance: 14 }], reglages: { aireMin: 100, ouverture: 7 } });
  t("front et mur en trait de la couleur des piliers : 1 pilier (le mur n'en est pas un), 2 fronts trouvés",
    r.masses.length === 1 && r.traits.length === 2, { masses: r.masses.map(boiteDe), traits: r.traits.length });

  // ── Fond blanc : piliers de la couleur du fond, cernés d'un trait (curseur « Taille maximale ») ──
  for (const [nom, couleur] of [["blancs", BLANC], ["gris clair", [225, 225, 225]]]) {
    const sc = sceneBlanche(couleur);
    const dans = (m, p) => { const cx = m.boite.x + m.boite.w / 2, cy = m.boite.y + m.boite.h / 2;
      return cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h; };
    const ex = [sc.petit, sc.gros].map((p) => D.mesurerExemple(lecteurSync(sc.img), p.x + p.w / 2, p.y + p.h / 2));
    t("fond blanc, piliers " + nom + " : la pipette sur un pilier cerné donne un exemple (pas « le fond »)",
      ex.every((x) => x && !x.fond && !x.coupe), ex.map((x) => x && { fond: x.fond, coupe: x.coupe, aire: x.aire }));
    if (!ex.every((x) => x && !x.fond)) continue;
    const dd = D.reglagesDepuisExemples({ a: ex }, { a: "masse" });
    const avec = async (aireMax) => D.detecter({ lireBloc: lecteur(sc.img),
      region: { x: 0, y: 0, w: sc.img.W, h: sc.img.H }, limites: { w: sc.img.W, h: sc.img.H },
      classes: [{ id: "a", couleurs: ex.map((x) => x.rgb), tolerance: dd.tolerances.a }],
      reglages: Object.assign({ aireMax: aireMax }, D.reglagesPourTaille(dd.taille)) });
    const rMax = await avec(dd.tailleMax * dd.tailleMax), rSans = await avec(0);
    const nMax = sc.vrais.filter((p) => rMax.masses.some((m) => dans(m, p))).length;
    const geante = (r) => r.masses.filter((m) => m.aire > dd.tailleMax * dd.tailleMax).length;
    t("fond blanc, piliers " + nom + ", taille max déduite (" + dd.tailleMax + " px) : " + nMax + "/" +
      sc.vrais.length +
      " piliers, aucune masse plus grande que la taille max (" + rMax.ecartees + " écartée(s))",
      nMax >= 0.9 * sc.vrais.length && geante(rMax) === 0, { tolerance: dd.tolerances.a, taille: dd.taille });
    if (nom === "blancs") {
      t("contre-épreuve : sans taille maximale, le fond et les galeries sortent en masses géantes (" +
        geante(rSans) + ")",
        geante(rSans) > 0);
    }
  }

  // ── Recalcul sur les blocs gardés : pas de relecture de l'image ──
  let lectures = 0;
  const lireCompte = (x, y, w, h, e) => { lectures++; return lecteur(grand)(x, y, w, h, e); };
  const exLoc = D.executeurLocal();
  const r0 = await D.detecter({ lireBloc: lireCompte, region: { x: 0, y: 0, w: grand.W, h: grand.H },
    limites: { w: grand.W, h: grand.H }, classes: CLASSES, reglages: { aireMin: 100, ouverture: 7, bloc: 256 },
    executeur: exLoc, garder: true });
  const lus = lectures;
  const r1 = await D.recalculer(exLoc, { classes: CLASSES, reglages: D.reglagesPourTaille(45) });
  t("recalcul (taille 45 px) sur les blocs gardés : aucune relecture, compte changé (" + r0.masses.length + " → " +
    r1.masses.length + ")", r0.recalculable && lectures === lus && r1.masses.length < r0.masses.length,
    { lectures: lectures, lus: lus, recalculable: r0.recalculable });
  const r2 = await D.recalculer(exLoc, { classes: CLASSES, reglages: { aireMin: 100, ouverture: 7 } });
  t("recalcul aux réglages d'origine : même résultat que la détection", r2.masses.length === r0.masses.length);
  exLoc.fermer();
  const sansGarde = await D.detecter({ lireBloc: lecteur(grand), region: { x: 0, y: 0, w: grand.W, h: grand.H },
    limites: { w: grand.W, h: grand.H }, classes: CLASSES, executeur: D.executeurLocal() });
  t("sans « garder » : résultat non recalculable (l'appelant relit)", sansGarde.recalculable === false);

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
  const bg = await lecteur(image(100, 100).rect(10, 10, 40, 40, ORANGE))(0, 0, 100, 100, 1);
  self.onmessage({ data: { id: 9, garder: true, bloc: { data: bg.data, w: bg.w, h: bg.h, x0: 0, y0: 0, echelle: 1,
    classes: CLASSES, reglages: D.REGLAGES } } });
  self.onmessage({ data: { id: 10, recalculer: { classes: CLASSES, reglages: D.reglagesPourTaille(60) } } });
  t("worker : bloc gardé (garde), recalcul sans le renvoyer (taille 60 px → plus de masse)",
    envoyes[2] && envoyes[2].resultat.garde === true && Array.isArray(envoyes[3] && envoyes[3].resultat) &&
    envoyes[3].resultat.length === 1 && envoyes[3].resultat[0].masses.length === 0, [envoyes[2], envoyes[3]]);

  // ── Pas de DOM dans le moteur ──
  const moteur = fs.readFileSync(path.join(__dirname, "..", "js", "ktaDetection.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  t("moteur pur : ni document, ni map, ni APP_CONFIG", !/\bdocument\.|window\.map\b|APP_CONFIG/.test(moteur));

  console.log(ko ? "\n❌ check-detection : " + ko + " échec(s)" : "\n🎉 check-detection : moteur de détection OK");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error("❌ check-detection : exception", e); process.exit(1); });
