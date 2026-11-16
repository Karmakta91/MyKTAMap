/* eslint-disable no-console */
// =====================================================================
// navigateur.js — lancer le navigateur des harnais, avec replis, et ne jamais en laisser un derrière soi
// =====================================================================
// Ordre : headless shell Playwright → Chromium complet Playwright → Microsoft Edge (présent sur tout
// Windows) : sans ce repli, un poste sans navigateur Playwright ne lance aucun checkup de la porte.
// Seule l'absence du navigateur déclenche un repli ; toute autre erreur remonte.
// lancerNavigateur(chromium[, opts]) → Promise<Browser>
// Moteurs : moteurs() lit KTA_MOTEURS (« chromium,webkit » par défaut) ; lancerMoteur(nom[, opts]) → Promise<Browser|null>.
// WebKit = le moteur de Safari, donc de tout navigateur iPhone : deux bugs iPhone sont passés sous Chromium seul.
// WebKit absent (pas téléchargé) : null, le harnais le dit et joue le reste — jamais un faux vert silencieux.
// lancerPersistant(nom, dossier[, opts]) → Promise<BrowserContext|null> : profil persistant (cycle du Service Worker).
// ⚠️ contrat : tout harnais lance par ici (scripts/check-harnais-navigateur.js). Chaque navigateur est suivi ;
//   fermerTout() les ferme (sortie en erreur d'un harnais). Playwright tue déjà ses navigateurs quand node s'arrête
//   (fin, exception, SIGINT / SIGTERM, même taskkill /F : mesuré) ; le trou est le harnais BLOQUÉ, qui garde ses
//   navigateurs tant qu'il vit : au-delà de KTA_DELAI_HARNAIS_MS (45 min par défaut), il les ferme et sort en 124.
// =====================================================================
"use strict";

const DELAI_MS = Number(process.env.KTA_DELAI_HARNAIS_MS) || 45 * 60 * 1000;
const _ouverts = new Set();
const _profils = new Map();   // contexte persistant → son dossier (retiré du disque à la coupure par délai)
let _minuteur = null;

function _absent(e) { return /Executable doesn't exist/i.test(String((e && e.message) || "")); }

// Navigateur (événement disconnected) ou contexte persistant (close) : suivi jusqu'à sa fermeture.
function _suivre(objet, dossier) {
  if (!objet) return objet;
  _ouverts.add(objet);
  if (dossier) _profils.set(objet, require("path").resolve(dossier));
  const fin = function () { _ouverts.delete(objet); };
  if (typeof objet.newContext === "function") objet.on("disconnected", fin);
  else objet.on("close", fin);
  if (!_minuteur) {
    _minuteur = setTimeout(function () {
      const delai = DELAI_MS >= 60000 ? Math.round(DELAI_MS / 60000) + " min" : Math.round(DELAI_MS / 1000) + " s";
      console.error("\n[harnais] ⏱️ délai de " + delai + " dépassé (KTA_DELAI_HARNAIS_MS) : " + _ouverts.size +
        " navigateur(s) fermé(s), sortie en échec (124)");
      // 🩸 Fermer réveille les attentes du harnais : son catch sort avec SON code (2…), ou une promesse rejetée sans
      // catch tue node en 1, avant que les navigateurs soient fermés et les profils retirés. Pendant la coupure, ces
      // sorties sont neutralisées : c'est la coupure qui sort, en 124 (« délai dépassé »), une fois le ménage fait.
      const sortir = process.exit;
      process.exit = function () { /* la coupure sortira elle-même */ };
      process.on("uncaughtException", function () { /* idem */ });
      process.on("unhandledRejection", function () { /* idem */ });
      const dossiers = Array.from(_profils.values());
      fermerTout().then(function () {
        // Profils jetables du dossier temporaire seulement : le finally du harnais, qui les retire, ne tournera pas.
        const tmp = require("os").tmpdir();
        dossiers.forEach(function (d) {
          if (require("path").dirname(d) !== tmp) return;
          try { require("fs").rmSync(d, { recursive: true, force: true }); } catch (e) { /* encore tenu */ }
        });
        sortir.call(process, 124);
      });
    }, DELAI_MS);
    _minuteur.unref();   // ne retient pas un harnais qui a fini
  }
  return objet;
}

// Ferme tout ce qui est encore ouvert ; rend quand c'est fait (5 s au plus : un navigateur figé ne bloque pas la sortie).
function fermerTout() {
  const liste = Array.from(_ouverts);
  _ouverts.clear();
  const fermetures = Promise.all(liste.map(function (o) { return o.close().catch(function () { /* déjà fermé */ }); }));
  return Promise.race([fermetures, new Promise(function (r) { setTimeout(r, 5000).unref(); })]);
}

async function lancerNavigateur(chromium, opts) {
  const base = opts || {};
  // KTA_MOTEURS=webkit : tout checkup se joue sous WebKit sans être modifié (balayage Safari). Un checkup qui
  // ouvre une session CDP (Chromium seul) échouera là : c'est attendu, pas un bug de l'app.
  if (moteurs().length === 1 && moteurs()[0] === "webkit") {
    const wk = await lancerMoteur("webkit", base);
    if (wk) return wk;
    throw new Error("KTA_MOTEURS=webkit mais WebKit absent (npx playwright install webkit)");
  }
  const essais = [base, Object.assign({}, base, { channel: "chromium" }), Object.assign({}, base, { channel: "msedge" })];
  for (let i = 0; i < essais.length; i++) {
    try {
      return _suivre(await chromium.launch(essais[i]));
    } catch (e) {
      if (!_absent(e) || i === essais.length - 1) throw e;
      console.log("[harnais] navigateur absent → repli sur « " + essais[i + 1].channel + " »");
    }
  }
}

function moteurs() {
  const v = String(process.env.KTA_MOTEURS || "chromium,webkit").toLowerCase();
  return v.split(",").map(function (m) { return m.trim(); }).filter(function (m) { return m === "chromium" || m === "webkit"; });
}

async function lancerMoteur(nom, opts) {
  const pw = require("playwright");
  if (nom !== "webkit") return lancerNavigateur(pw.chromium, opts);
  try {
    return _suivre(await pw.webkit.launch(opts || {}));
  } catch (e) {
    if (!_absent(e)) throw e;
    console.log("[harnais] ⚠️ WebKit absent : moteur SAUTÉ (installer : npx playwright install webkit)");
    return null;
  }
}

// Profil persistant (Service Worker et caches gardés d'un lancement à l'autre) : mêmes replis que lancerNavigateur.
// lancerPersistant(nom, dossier[, opts]) → Promise<BrowserContext|null> (null : WebKit absent).
async function lancerPersistant(nom, dossier, opts) {
  const pw = require("playwright");
  const base = opts || {};
  if (nom === "webkit") {
    try { return _suivre(await pw.webkit.launchPersistentContext(dossier, base), dossier); }
    catch (e) { if (!_absent(e)) throw e; console.log("[harnais] ⚠️ WebKit absent : moteur SAUTÉ"); return null; }
  }
  const essais = [base, Object.assign({}, base, { channel: "chromium" }), Object.assign({}, base, { channel: "msedge" })];
  for (let i = 0; i < essais.length; i++) {
    try { return _suivre(await pw.chromium.launchPersistentContext(dossier, essais[i]), dossier); }
    catch (e) { if (!_absent(e) || i === essais.length - 1) throw e; }
  }
}

module.exports = lancerNavigateur;
module.exports.moteurs = moteurs;
module.exports.lancerMoteur = lancerMoteur;
module.exports.lancerPersistant = lancerPersistant;
module.exports.fermerTout = fermerTout;
module.exports.ouverts = function () { return _ouverts.size; };
