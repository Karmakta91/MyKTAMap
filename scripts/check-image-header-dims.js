#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🖼️ check-image-header-dims.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Verrouille le parseur binaire de dimensions d'images du Générateur
// (v1.76.1 — bug KARMA : JPG 32K×32K « non décodable » sur PC, le décodeur
// Chrome/Skia refuse un côté > 32 767 px, on lit donc l'EN-TÊTE sans
// décoder). Fixtures synthétiques fabriquées octet par octet : PNG, GIF,
// WebP (VP8X/VP8/VP8L), JPEG (avec segment EXIF à sauter), et les refus.
// La fonction est extraite du code RÉEL de js/createConf.js.
// =====================================================================

const fs = require("fs");
const src = fs.readFileSync("js/createConf.js", "utf8");
const d = src.indexOf("function _lireDimensionsEntete");
if (d < 0) { console.error("❌ _lireDimensionsEntete introuvable"); process.exit(1); }
// eslint-disable-next-line no-eval
eval(src.slice(d, src.indexOf("\nfunction _lireImageDimensions", d)));

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };
const buf = (bytes) => Uint8Array.from(bytes).buffer;
const u16 = (v) => [v >> 8, v & 0xFF];          // big-endian
const u32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];

// ---- PNG 32768×32768 (le cas KARMA : lisible SANS décodage) ----
const png = buf([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  ...u32(13), 0x49, 0x48, 0x44, 0x52, ...u32(32768), ...u32(32768),
  8, 6, 0, 0, 0, ...u32(0)]);
let r = _lireDimensionsEntete(png);
t("PNG 32768×32768 lu dans l'IHDR", r && r.width === 32768 && r.height === 32768);

// ---- GIF 1044×610 (little-endian) ----
const gif = buf([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1044 & 0xFF, 1044 >> 8, 610 & 0xFF, 610 >> 8,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
r = _lireDimensionsEntete(gif);
t("GIF 1044×610 (LE)", r && r.width === 1044 && r.height === 610);

// ---- WebP VP8X 32768×16384 (w-1/h-1 sur 24 bits LE) ----
const wm1 = 32767, hm1 = 16383;
const vp8x = buf([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x58, ...u32(10).reverse(), 0, 0, 0, 0,
  wm1 & 0xFF, (wm1 >> 8) & 0xFF, (wm1 >> 16) & 0xFF,
  hm1 & 0xFF, (hm1 >> 8) & 0xFF, (hm1 >> 16) & 0xFF, 0, 0]);
r = _lireDimensionsEntete(vp8x);
t("WebP VP8X 32768×16384", r && r.width === 32768 && r.height === 16384);

// ---- JPEG 32768×32768 avec segment EXIF de 4 Ko à SAUTER avant le SOF0 ----
const exifLen = 4096;
const jpeg = [0xFF, 0xD8,
  0xFF, 0xE1, ...u16(exifLen + 2), ...new Array(exifLen).fill(0x00),   // APP1 EXIF
  0xFF, 0xDB, ...u16(4), 0x00, 0x00,                                   // DQT bidon
  0xFF, 0xC0, ...u16(17), 8, ...u16(32768), ...u16(32768), 3, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0xFF, 0xD9];
r = _lireDimensionsEntete(buf(jpeg));
t("JPEG 32768×32768, SOF0 après 4 Ko d'EXIF", r && r.width === 32768 && r.height === 32768);

// ---- JPEG progressif (SOF2) ----
// (padding : le parseur exige ≥ 26 octets — un vrai JPEG en a toujours plus)
const jpeg2 = [0xFF, 0xD8, 0xFF, 0xC2, ...u16(17), 8, ...u16(610), ...u16(1044), 3,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xFF, 0xD9];
r = _lireDimensionsEntete(buf(jpeg2));
t("JPEG progressif (SOF2) 1044×610", r && r.width === 1044 && r.height === 610);

// ---- DHT (C4) ne doit PAS être pris pour un SOF ----
const jpeg3 = [0xFF, 0xD8, 0xFF, 0xC4, ...u16(4), 0, 0,
  0xFF, 0xC0, ...u16(17), 8, ...u16(200), ...u16(100), 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xFF, 0xD9];
r = _lireDimensionsEntete(buf(jpeg3));
t("le marqueur DHT (C4) est sauté, pas confondu avec SOF", r && r.width === 100 && r.height === 200);

// ---- Refus propres ----
t("fichier trop court → null", _lireDimensionsEntete(buf([0xFF, 0xD8])) === null);
t("format inconnu → null", _lireDimensionsEntete(buf(new Array(64).fill(0x42))) === null);
t("JPEG sans SOF → null", _lireDimensionsEntete(buf([0xFF, 0xD8, 0xFF, 0xDB, ...u16(4), 0, 0, ...new Array(20).fill(0)])) === null);

console.log(ko === 0 ? "\n🎉 parseur d'en-têtes : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
