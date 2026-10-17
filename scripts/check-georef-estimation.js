#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-georef-estimation.js — garde-fou pré-commit BLOQUANT de « Estimer le point B » du géoréférencement
// =====================================================================
// ⚠️ B est déduit de A + échelle (px/m) + northOffsetDeg (0 = Nord en haut, croissant HORAIRE, comme la
// boussole). Fonctions extraites du code réel (js/config.js > ktaEstimerPointB, ktaCoinLePlusLoin).
// =====================================================================

const fs = require("fs");
const src = fs.readFileSync("js/config.js", "utf8");
const d = src.indexOf("function ktaEstimerPointB");
const d2 = src.indexOf("function ktaCoinLePlusLoin");
const fin2 = src.indexOf("\n}", d2) + 2;
if (d < 0 || d2 < 0) { console.error("❌ fonctions introuvables dans js/config.js"); process.exit(1); }
// eslint-disable-next-line no-eval
eval(src.slice(d, src.indexOf("\n}", d) + 2) + "\n" + src.slice(d2, fin2));

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };
const A = { x: 1000, y: 1000, lat: 48.8580, lng: 2.2945 };
const M = 111320;

// ── Nord par défaut : 500 px vers le HAUT (y diminue) à 5 px/m = 100 m plein Nord ──
let b = ktaEstimerPointB(A, { x: 1000, y: 500 }, 5, 0);
t("plein nord : lat augmente de 100 m", b && Math.abs((b.lat - A.lat) * M - 100) < 0.01);
t("plein nord : lng inchangée", b && Math.abs(b.lng - A.lng) < 1e-9);
t("le point rendu porte estimated:true", b && b.estimated === true);
t("les pixels du B rendu sont ceux demandés", b && b.x === 1000 && b.y === 500);

b = ktaEstimerPointB(A, { x: 1500, y: 1000 }, 5, 0);
t("plein est : lng augmente", b && b.lng > A.lng && Math.abs(b.lat - A.lat) < 1e-9);
t("plein est : correction cos(lat) appliquée",
  b && Math.abs((b.lng - A.lng) * M * Math.cos(A.lat * Math.PI / 180) - 100) < 0.01);

// ── Nord calibré à 90° (flèche Nord vers la DROITE du plan) ──
b = ktaEstimerPointB(A, { x: 1500, y: 1000 }, 5, 90);
t("offset 90° : la droite de l'image = plein Nord",
  b && Math.abs((b.lat - A.lat) * M - 100) < 0.01 && Math.abs(b.lng - A.lng) * M < 0.01);
b = ktaEstimerPointB(A, { x: 1000, y: 500 }, 5, 90);
t("offset 90° : le haut de l'image = plein Ouest", b && b.lng < A.lng && Math.abs(b.lat - A.lat) < 1e-9);

// ── Hémisphère sud ──
const S = { x: 0, y: 0, lat: -33.86, lng: 151.20 };
b = ktaEstimerPointB(S, { x: 0, y: -1113.2 }, 10, 0);   // 111,32 m nord
t("hémisphère sud : le nord rapproche de l'équateur", b && b.lat > S.lat);

// ── Distance pixel = distance GPS reconstruite ──
b = ktaEstimerPointB(A, { x: 4000, y: 250 }, 4.9, 37);
const dPix = Math.hypot(3000, -750) / 4.9;
const dGps = Math.hypot((b.lat - A.lat) * M, (b.lng - A.lng) * M * Math.cos(A.lat * Math.PI / 180));
t("la distance est conservée par la projection (0,1 % près)", Math.abs(dPix - dGps) / dPix < 0.001);

// ── REFUS (jamais de clamp) ──
t("échelle 0 → null", ktaEstimerPointB(A, { x: 0, y: 0 }, 0, 0) === null);
t("échelle négative → null", ktaEstimerPointB(A, { x: 0, y: 0 }, -5, 0) === null);
t("échelle NaN → null", ktaEstimerPointB(A, { x: 0, y: 0 }, NaN, 0) === null);
t("A incomplet → null", ktaEstimerPointB({ x: 1, y: 2, lat: null, lng: 3 }, { x: 0, y: 0 }, 5, 0) === null);
t("latitude polaire (>85°) → null", ktaEstimerPointB({ x: 0, y: 0, lat: 88, lng: 0 }, { x: 10, y: 0 }, 5, 0) === null);
t("offset nord absent → traité comme 0",
  JSON.stringify(ktaEstimerPointB(A, { x: 1000, y: 500 }, 5, undefined)) ===
  JSON.stringify(ktaEstimerPointB(A, { x: 1000, y: 500 }, 5, 0)));

// ── Coin le plus éloigné ──
const c1 = ktaCoinLePlusLoin({ x: 100, y: 100 }, 2000, 1000);
t("coin le plus loin d'un A en haut-gauche = bas-droite", c1 && c1.x === 2000 && c1.y === 1000);
t("dimensions invalides → null", ktaCoinLePlusLoin({ x: 0, y: 0 }, 0, 500) === null);

console.log(ko === 0 ? "\n🎉 estimation géoref : " + "tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
