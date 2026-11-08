#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// check-icones-ui.js — garde-fou pré-commit BLOQUANT (rejoué en CI), à CLIQUET : icônes SVG de l'interface
// =====================================================================
// Les contrôles passés en SVG (js/ktaIcones.js) ne doivent pas revenir à l'emoji, et la doc doit montrer la
// même icône que le bouton. Contrôle :
//   1. js/interface.js : aucun emoji dans `iconePrincipale`, `icone:`, une icône dynamique, un reflet de mode
//      ou un `innerHTML = "…"` (seules les pastilles de TYPE, ligne avec `typeKey:`, gardent leur repli) ;
//      index.html : les boutons d'en-tête et de « Mes plans » migrés portent `data-kta-ico` et aucun emoji ;
//   2. chaque nom passé à ktaIcone("…") ou à data-kta-ico="…" (js/*.js, index.html) existe dans le module ;
//   3. chaque règle de la table de doc (KtaIcones.DOC) pointe vers une icône existante ;
//   4. EXHAUSTIF : chaque occurrence d'un emoji migré dans docs/applications/README_USER{,.en,.es}.md et dans
//      les clés aide.* de lang/{fr,en,es}.json est soit substituée (DOC), soit listée « autre sens »
//      (AUTRE_SENS). Sinon : échec avec fichier:ligne et le texte voisin ;
//   5. CLIQUET : le nombre d'emplois rangés par une règle « tout le reste » est figé par emoji (PLAFOND_RESTE).
// Usage : node scripts/check-icones-ui.js [--liste]   (--liste : comptes par emoji, substitués / autre sens)
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");
const K = require(path.join(RACINE, "js", "ktaIcones.js"));
const LISTE = process.argv.indexOf("--liste") >= 0;

let ko = 0;
const t = (n, c, detail) => {
  if (!c) { ko++; console.log("❌ " + n + (detail ? "\n   " + detail : "")); }
  else if (LISTE) console.log("✅ " + n);
};
const EMO = /[\p{Extended_Pictographic}⬛⬜☑ℹ]/u;

// Emoji des contrôles passés en SVG : chacun doit avoir ses règles de doc (sinon ses occurrences échappent au
// point 4). Retirer un emoji d'ici = revenir à l'emoji dans l'interface.
const EMOJI_MIGRES = ["🧭", "✏️", "🛣️", "⬛", "🏛️", "📐", "🔍", "🔎", "⬇️", "⬆️", "⏪", "⏩", "⭐", "📚", "⚙️",
  "▶️", "⏹️", "🔃", "🪧", "📍", "🎯", "🔓", "🔒", "🗺️", "🎬", "🔥", "⛑️", "🔆", "🚑", "📡", "♦️", "📏", "⛏️",
  "❌", "✅", "🧹", "🪜", "➕", "🖼️", "🖨️", "🛰️", "💾", "🎨", "📊", "🔄", "🌍", "❓", "📖", "📥", "🚨", "☑", "ℹ️",
  "🧊"];
const BOUTONS_INDEX = ["loaderSearchBtn", "loaderOfflineHdrBtn", "loaderAlertBtn", "loaderHelpBtn", "loaderConfigBtn",
  "loaderPlansFolderNew", "loaderPlansSelect"];

// ── 0. auto-test du classement (chaque sabotage doit rougir) ─────────────────────────────
{
  const un = (txt) => K.classerDoc(txt)[0] || {};
  t("auto-test : « 🧭 Tracker » → navigation", un("menu 🧭 Tracker").icone === "navigation");
  t("auto-test : « 🧭 Boussole » → compass", un("la tuile 🧭 Boussole").icone === "compass");
  t("auto-test : la variante U+FE0F est la même occurrence", K.classerDoc("⚙️ Réglages ⚙ Réglages").length === 2);
  t("auto-test : un emoji non migré n'est pas compté", K.classerDoc("🦄 licorne").length === 0);
  const sub = K.substituerDoc("menu 🧭 Tracker", { jeton: true });
  t("auto-test : jeton puis SVG", /<svg class="kta-ico kta-ico-navigation kta-ico-doc"/.test(K.jetonsEnSvg(sub)) && !/🧭/.test(sub));
  t("auto-test : nom inconnu → chaîne vide", (() => {
    const w = console.warn; console.warn = () => {}; const r = K.icone("n-existe-pas"); console.warn = w; return r === "";
  })());
}

// ── 1. aucun emoji dans les contrôles migrés ─────────────────────────────
const SRC_INTERFACE = lire("js/interface.js");
{
  const motifs = [/(iconePrincipale|icone)\s*:\s*"([^"]*)"/, /innerHTML\s*=\s*"([^"]*)"/,
    /dynamicIcon\s*:\s*function[^\n]*"([^"]*)"/, /_setGroupeModeActif\([^)\n]*"([^"]*)"/];
  const fautes = [];
  SRC_INTERFACE.split(/\r?\n/).forEach((l, i) => {
    if (/typeKey\s*:/.test(l) || /_iconeType\(/.test(l)) return;   // pastille de type : repli emoji permis
    if (motifs.some((re) => { const m = re.exec(l); return m && EMO.test(m[m.length - 1]); })) {
      fautes.push("js/interface.js:" + (i + 1) + "  " + l.trim().slice(0, 100));
    }
  });
  t("1. interface.js : aucun emoji dans une icône de contrôle (cliquet 0)", fautes.length === 0, fautes.join("\n   "));

  const html = lire("index.html");
  BOUTONS_INDEX.forEach((id) => {
    const m = new RegExp("<button[^>]*id=\"" + id + "\"[^>]*>([^<]*)</button>").exec(html);
    t("1. index.html : #" + id + " trouvé", !!m);
    if (!m) return;
    t("1. index.html : #" + id + " porte data-kta-ico", /data-kta-ico="[^"]+"/.test(m[0]));
    t("1. index.html : #" + id + " sans emoji", !EMO.test(m[1]), m[1]);
  });
}

// ── 2. noms connus ─────────────────────────────
{
  // Le module lui-même cite `data-kta-ico="nom"` dans son en-tête : hors balayage.
  const sources = fs.readdirSync(path.join(RACINE, "js")).filter((f) => /\.js$/.test(f) && f !== "ktaIcones.js")
    .map((f) => "js/" + f).concat(["index.html"]);
  const inconnus = [];
  let n = 0;
  sources.forEach((f) => {
    const s = lire(f);
    const re = /ktaIcone\(\s*["']([^"']+)["']|data-kta-ico=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      n++;
      const nom = m[1] || m[2];
      if (!K.existe(nom)) inconnus.push(f + " : « " + nom + " »");
    }
  });
  t("2. " + n + " appels nommés, tous connus du module", n > 0 && inconnus.length === 0, inconnus.join("\n   "));
}

// ── 3. table de doc saine ─────────────────────────────
{
  const mauvais = K.DOC.filter((r) => !r.e || !K.existe(r.i)).map((r) => r.e + " → " + r.i);
  t("3. chaque règle DOC pointe vers une icône existante", mauvais.length === 0, mauvais.join(", "));
  const sansSens = K.AUTRE_SENS.filter((r) => !r.e || !r.s).map((r) => r.e);
  t("3. chaque entrée AUTRE_SENS dit son sens", sansSens.length === 0, sansSens.join(", "));
  const cles = new Set(K.DOC.concat(K.AUTRE_SENS).map((r) => r.e.replace(/️/g, "")));
  const sansRegle = EMOJI_MIGRES.filter((e) => !cles.has(e.replace(/️/g, "")));
  t("3. chaque emoji migré a ses règles de doc", sansRegle.length === 0, sansRegle.join(" "));
}

// ── 4. doc exhaustive ─────────────────────────────
{
  const SOURCES = [];
  ["README_USER.md", "README_USER.en.md", "README_USER.es.md"].forEach((f) => {
    SOURCES.push({ fichier: "docs/applications/" + f, morceaux: [{ texte: lire("docs/applications/" + f), ligne: 1 }] });
  });
  ["fr", "en", "es"].forEach((l) => {
    const brut = lire("lang/" + l + ".json"), dico = JSON.parse(brut), lignes = brut.split(/\r?\n/);
    const morceaux = Object.keys(dico).filter((k) => /^aide\./.test(k)).map((k) => {
      const i = lignes.findIndex((x) => x.indexOf("\"" + k + "\"") >= 0);
      return { texte: String(dico[k]), ligne: i + 1, cle: k };
    });
    SOURCES.push({ fichier: "lang/" + l + ".json", morceaux: morceaux });
  });
  const comptes = {}, orphelins = [];
  SOURCES.forEach((src) => src.morceaux.forEach((mc) => {
    const langue = /\.(en|es)\./.test(src.fichier) ? RegExp.$1 : (/lang\/(\w+)/.test(src.fichier) ? RegExp.$1 : "fr");
    K.classerDoc(mc.texte).forEach((o) => {
      const c = comptes[o.emoji] ||
        (comptes[o.emoji] = { svg: 0, autre: 0, reste: 0, fr: [0, 0], en: [0, 0], es: [0, 0] });
      if (o.icone || o.sens) c[langue][o.icone ? 0 : 1]++;
      if (o.reste) c.reste++;
      if (o.icone) { c.svg++; return; }
      if (o.sens) { c.autre++; return; }
      const ligne = mc.cle ? mc.ligne : mc.texte.slice(0, o.debut).split("\n").length;
      const voisin = mc.texte.slice(Math.max(0, o.debut - 30), o.fin + 40).replace(/\s+/g, " ");
      orphelins.push(src.fichier + ":" + ligne + (mc.cle ? " (" + mc.cle + ")" : "") + "  …" + voisin + "…");
    });
  }));
  t("4. doc : chaque emoji migré est substitué ou listé « autre sens » (" + orphelins.length + " non classé(s))",
    orphelins.length === 0, orphelins.slice(0, 400).join("\n   "));
  // 5. CLIQUET « tout le reste » : la règle sans motif d'un emoji (AUTRE_SENS sans a ni b) range aussi une phrase
  // NOUVELLE qui citerait le bouton par un libellé inconnu — elle resterait en emoji, donc icône périmée. Son
  // compte (3 guides + aide.* des 3 langues) est figé : une hausse échoue tant que le nouvel emploi n'est pas
  // classé (règle DOC ciblée = SVG, ou AUTRE_SENS ciblé = autre sens voulu) ; une baisse se reporte ici.
  // Clés sans U+FE0F (forme rendue par classerDoc). Recalcul : node scripts/check-icones-ui.js --plafond
  const PLAFOND_RESTE = {
    "📖": 60, "🔒": 33, "💾": 121, "❌": 33, "🔄": 127, "🧊": 6, "🌍": 66, "🧭": 170, "📍": 210, "🚨": 99, "ℹ": 27,
    "✅": 81, "📡": 12, "✏": 180, "📥": 51, "▶": 48, "📚": 39, "➕": 72, "🚑": 30, "🪧": 45, "🗺": 138, "🎯": 120,
    "📊": 105, "⭐": 42, "⬇": 15, "🎨": 54, "🖼": 51, "🔎": 27, "🔓": 6, "❓": 18, "🪜": 39
  };
  if (process.argv.indexOf("--plafond") >= 0) {
    console.log(JSON.stringify(Object.keys(comptes).filter((e) => comptes[e].reste)
      .reduce((o, e) => { o[e] = comptes[e].reste; return o; }, {})));
  }
  const ecartsReste = [];
  Object.keys(comptes).concat(Object.keys(PLAFOND_RESTE)).filter((e, i, a) => a.indexOf(e) === i).forEach((e) => {
    const n = comptes[e] ? comptes[e].reste : 0, p = PLAFOND_RESTE[e] || 0;
    if (n > p) ecartsReste.push(e + " : " + n + " emplois « tout le reste » pour " + p + " figés → classer le nouveau " +
      "(DOC ciblé ou AUTRE_SENS ciblé)");
    else if (n < p) ecartsReste.push(e + " : " + n + " < " + p + " figés → reporter " + n + " dans PLAFOND_RESTE");
  });
  t("5. doc : emplois « tout le reste » figés (cliquet, aucune phrase nouvelle rangée en silence)",
    ecartsReste.length === 0, ecartsReste.join("\n   "));
  if (LISTE) {
    // Les trois langues décrivent la même chose : un écart de SVG entre elles trahit un motif mal traduit.
    Object.keys(comptes).forEach((e) => {
      const c = comptes[e], ecart = c.fr[0] !== c.en[0] || c.fr[0] !== c.es[0];
      console.log("   " + e + "  SVG " + c.svg + " · autre sens " + c.autre + "   (fr/en/es SVG " + c.fr[0] + "/" +
        c.en[0] + "/" + c.es[0] + ", autre " + c.fr[1] + "/" + c.en[1] + "/" + c.es[1] + ")" + (ecart ? "  ≠" : ""));
    });
  }
}

console.log(ko === 0 ? "🎉 icônes de l'interface : SVG partout où migré, doc alignée" : "⚠️ " + ko + " échec(s)");
process.exit(ko === 0 ? 0 : 1);
