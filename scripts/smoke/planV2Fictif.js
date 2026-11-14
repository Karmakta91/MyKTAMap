/* eslint-disable no-console */
// =====================================================================
// planV2Fictif.js — plan tuilé V2 FICTIF pour les harnais, fabriqué en mémoire (aucun fichier, jamais dans data/)
// =====================================================================
// servirPlanV2Fictif(page[, opts]) → Promise<{ id, dossier, nom, config }> : ajoute le plan à la volée à la réponse
// de data/index.json, sert son plan-config V2 et des tuiles PNG unies (une teinte par niveau) par page.route.
// opts : nbX, nbY (tuiles de 512 px au niveau 0, défaut 32 × 20), nom, id, scale (px par mètre, pour la vue 3D).
// ⚠️ contrat : le contexte doit bloquer le Service Worker (serviceWorkers: "block"), sinon des requêtes échappent à
// l'interception. Les tuiles sont servies sous <dossier>/data/tiles/z<N>/x<col>_y<-k>.png, la mise en page du
// Générateur (premier candidat sondé par tiling.js > ktaResoudreRacineTuiles).
// Utilisé par : checkup-tuiles-hors-ecran.js, checkup-plan-sol-portee.js
// =====================================================================
"use strict";

const zlib = require("zlib");

const TUILE = 512;

// PNG uni (RVB 8 bits) de cote × cote : signature, IHDR, IDAT (zlib), IEND.
function pngUni(cote, r, v, b) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const crc = function (buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const bloc = function (type, data) {
    const t = Buffer.from(type, "ascii"), lg = Buffer.alloc(4), cs = Buffer.alloc(4);
    lg.writeUInt32BE(data.length);
    cs.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([lg, t, data, cs]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cote, 0); ihdr.writeUInt32BE(cote, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const ligne = Buffer.alloc(1 + cote * 3);
  for (let x = 0; x < cote; x++) { ligne[1 + x * 3] = r; ligne[2 + x * 3] = v; ligne[3 + x * 3] = b; }
  const brut = Buffer.alloc(ligne.length * cote);
  for (let y = 0; y < cote; y++) ligne.copy(brut, y * ligne.length);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), bloc("IHDR", ihdr),
    bloc("IDAT", zlib.deflateSync(brut)), bloc("IEND", Buffer.alloc(0))]);
}

let _tuiles = null;
function tuiles() {
  if (!_tuiles) {
    _tuiles = { "0": pngUni(TUILE, 90, 110, 140), "-1": pngUni(TUILE, 110, 130, 90),
      "-2": pngUni(TUILE, 140, 100, 90), "-3": pngUni(TUILE, 120, 120, 120), fond: pngUni(64, 100, 100, 100) };
  }
  return _tuiles;
}

async function servirPlanV2Fictif(page, opts) {
  const o = opts || {};
  const nbX = o.nbX || 32, nbY = o.nbY || 20;
  const plan = { id: o.id || "checkup_v2_fictif", dossier: "data/" + (o.id || "checkup_v2_fictif").replace(/_/g, "-"),
    nom: o.nom || "Plan V2 fictif du checkup" };
  const config = {
    plan: { name: plan.nom, version: "V2", author: "checkup", imageWidth: TUILE * nbX, imageHeight: TUILE * nbY,
      baseImage: "data/fond.png", tiledV2: true },
    imageLayers: [], dataLayers: [], tracking: {}, icons: {}, iconsEmbarquees: [],
    tiling: { version: 2, tileSize: TUILE, format: "png", alpha: false, minNativeZoom: -3, maxNativeZoom: 0 }
  };
  if (o.scale > 0) config.tracking = { scale: o.scale };
  const T = tuiles();
  await page.route(/\/data\/index\.json(\?.*)?$/, async function (route) {
    const rep = await route.fetch();
    let idx;
    try { idx = await rep.json(); } catch (e) { idx = { plans: [] }; }
    idx.plans = (idx.plans || []).concat([{ id: plan.id, path: plan.dossier, name: plan.nom }]);
    await route.fulfill({ response: rep, contentType: "application/json", body: JSON.stringify(idx) });
  });
  const echap = plan.dossier.replace(/[/-]/g, "\\$&");
  await page.route(new RegExp("/" + echap + "/(.*)$"), function (route) {
    const p = new URL(route.request().url()).pathname.split("/" + plan.dossier + "/")[1] || "";
    const m = /tiles\/z(-?\d)\/x\d+_y-?\d+\.png$/.exec(p);
    if (p === "plan-config.json") return route.fulfill({ contentType: "application/json", body: JSON.stringify(config) });
    if (m && T[m[1]]) return route.fulfill({ contentType: "image/png", body: T[m[1]] });
    if (/fond\.png$/.test(p)) return route.fulfill({ contentType: "image/png", body: T.fond });
    return route.fulfill({ status: 404, body: "" });
  });
  return Object.assign(plan, { config: config });
}

module.exports = { servirPlanV2Fictif: servirPlanV2Fictif, pngUni: pngUni, TUILE: TUILE };
