#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// releve-theme.js — outil de mesure (Playwright, hors hooks) : surcharges claires sans effet, preuve avant / après
// =====================================================================
// Relève le style calculé (couleurs, fonds, bordures, ombres, opacité, filtre, display, visibility et toute
// propriété qu'une règle `.kta-theme-light` déclare, ::before et ::after compris) de chaque élément visible sur
// les écrans de releve-theme-ecrans.js, relevé fictif seulement. Survol, focus et actif : forcés par CDP.
//   proprietes <props.json> <etats.json>       propriétés relevées et sélecteurs à état forcé (CSS d'origine)
//   chercher <resultat.json> [larg haut]       sélecteurs clairs retirables : dans la page, sélecteur retiré du
//                                              CSSOM, style comparé ; écart = gardé. Reprend un résultat existant
//   relever <light|dark> <sortie.json> <props.json> [etats.json] [larg haut]
//   comparer <avant.json> <apres.json> [props.json]   écarts par écran (0 attendu)
// ⚠️ contrat : « chercher » ne prouve rien seul. On retire à la main ce qu'il liste, puis on relève avant (CSS
// d'origine servis par RELEVE_CSS=<dossier>) et après, clair et sombre, PC et téléphone : 0 écart exigé.
// 🩸 Un sélecteur qu'aucun écran n'atteint n'est jamais « retirable » : non couvert n'est pas mort.
// 🩸 Ordre du DOM variable d'un chargement à l'autre (camembert des stats, tags des filtres) : un écran dont
// seul l'ordre diffère compte 0 et est signalé.
// Serveur intégré (port RELEVE_PORT, défaut 8124) ; RELEVE_DATA=<dossier data d'une autre copie> si le relevé
// fictif n'est pas dans celle-ci (data/index.json reste celui de la copie). Méthode : docs/architecture/ui.md §53.3.
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const ECRANS = require("./releve-theme-ecrans.js");

const RACINE = path.resolve(__dirname, "..", "..");
const PORT = parseInt(process.env.RELEVE_PORT, 10) || 8124;
const BASE = "http://127.0.0.1:" + PORT;
const CSS_DIR = process.env.RELEVE_CSS ? path.resolve(process.env.RELEVE_CSS) : null;
const DATA_DIR = process.env.RELEVE_DATA ? path.resolve(process.env.RELEVE_DATA) : null;

const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
try {
  const live = JSON.parse(fs.readFileSync(path.join(RACINE, "alert.json"), "utf8"));
  (Array.isArray(live.alerts) ? live.alerts : []).forEach(function (a) {
    if (a && a.id && a.released) LS_PREGATES["myktamap_alert_seen_" + a.id] = a.released;
  });
} catch (e) { /* pas d'alert.json : rien à acquitter */ }

// ── Serveur : la copie, CSS d'une autre version (RELEVE_CSS), data/ d'une autre copie (RELEVE_DATA) ──
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".gif": "image/gif", ".woff2": "font/woff2", ".zip": "application/zip", ".ico": "image/x-icon" };
const CSP = (function () {
  try {
    const conf = fs.readFileSync(path.join(RACINE, "docker", "nginx-docker.conf"), "utf8");
    const m = conf.match(/add_header Content-Security-Policy "([^"]+)"/);
    return m ? m[1].replace(/\s*upgrade-insecure-requests;?/, "").trim() : null;
  } catch (e) { return null; }
})();
function servir() {
  return http.createServer(function (req, res) {
    const u = decodeURIComponent((req.url || "/").split("?")[0]);
    let fp;
    if (CSS_DIR && u.startsWith("/css/")) fp = path.join(CSS_DIR, u.slice(5));
    else if (DATA_DIR && u.startsWith("/data/") && u !== "/data/index.json") fp = path.join(DATA_DIR, u.slice(6));
    else fp = path.join(RACINE, u === "/" ? "index.html" : u);
    fs.stat(fp, function (err, st) {
      if (!err && st.isDirectory()) fp = path.join(fp, "index.html");
      fs.readFile(fp, function (err2, data) {
        if (err2) { res.writeHead(404); res.end("404"); return; }
        const h = { "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" };
        if (CSP && /\.html$/i.test(fp) && path.basename(fp) !== "killsw.html") h["Content-Security-Policy"] = CSP;
        res.writeHead(200, h);
        res.end(data);
      });
    });
  }).listen(PORT, "127.0.0.1");
}

// ── Fonctions installées dans la page (window.__tc) : autonome, sérialisée par Playwright ──
function installer() {
  if (window.__tc) return true;
  const FICHIERS = /\/css\/(style|style-secours|style-meminspector|style-filtres|style-stats-globales|vue3d)\.css(\?|$)/;
  const DEFAUTS = ["color", "background-color", "background-image", "border-top-color", "border-right-color",
    "border-bottom-color", "border-left-color", "box-shadow", "text-shadow", "opacity", "filter", "display",
    "visibility", "outline-color", "fill", "stroke", "-webkit-text-fill-color", "backdrop-filter", "caret-color",
    "accent-color", "text-decoration-color", "column-rule-color", "border-top-width", "border-right-width",
    "border-bottom-width", "border-left-width", "border-top-style", "border-right-style", "border-bottom-style",
    "border-left-style", "outline-style", "outline-width"];
  // Propriétés que le gel des animations écrase : leur valeur ne dit rien de la règle.
  const EXCLUS = /^(transition|animation-duration|animation-delay|animation-iteration-count|--)/;
  const RXPS = /:(hover|focus-visible|focus-within|focus|active)\b/g;
  const tc = { rules: [], byKey: new Map(), orig: new WeakMap(), units: [], uByKey: new Map(), props: null,
    base: new Map(), applied: new Set(), sujets: new Map() };
  window.__tc = tc;

  function decouper(sel, combinateurs) {
    const out = []; let prof = 0, cur = "", q = null;
    for (let i = 0; i < sel.length; i++) {
      const c = sel[i];
      if (q) { cur += c; if (c === q && sel[i - 1] !== "\\") q = null; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === "(" || c === "[") prof++;
      if (c === ")" || c === "]") prof--;
      if (prof === 0 && !combinateurs && c === ",") { out.push(cur.trim()); cur = ""; continue; }
      if (prof === 0 && combinateurs && (c === " " || c === ">" || c === "+" || c === "~")) {
        if (cur) { out.push(cur); cur = ""; }
        continue;
      }
      cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function visible(el) {
    try { return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); }
    catch (e) { return el.getClientRects().length > 0; }
  }
  tc.visible = visible;

  // Règles claires des feuilles de l'app, clé « fichier:rang » stable tant que le fichier ne change pas.
  tc.collecter = function () {
    for (const sh of Array.from(document.styleSheets)) {
      const m = (sh.href || "").match(FICHIERS); if (!m) continue;
      let rs; try { rs = sh.cssRules; } catch (e) { continue; }
      let seq = 0;
      (function marcher(liste, conds) {
        for (const r of Array.from(liste)) {
          if (r instanceof CSSStyleRule) {
            const k = m[1] + ":" + (seq++);
            if (!tc.orig.has(r)) tc.orig.set(r, r.selectorText);
            const sel = tc.orig.get(r);
            if (sel.indexOf("kta-theme-light") < 0 || tc.byKey.has(k)) continue;
            const props = []; let custom = false;
            for (let i = 0; i < r.style.length; i++) { if (r.style[i].startsWith("--")) custom = true; props.push(r.style[i]); }
            const rec = { key: k, rule: r, sel: sel, items: decouper(sel), conds: conds.slice(), custom: custom, props: props };
            tc.rules.push(rec); tc.byKey.set(k, rec);
            rec.items.forEach(function (it, i) {
              if (it.indexOf("kta-theme-light") < 0) return;
              const u = { key: k + "/" + i, rk: k, item: it };
              tc.units.push(u); tc.uByKey.set(u.key, u);
            });
          } else if (r.cssRules && !(r instanceof CSSKeyframesRule)) {
            let c = { t: "autre", v: "" };
            if (r instanceof CSSMediaRule) c = { t: "media", v: r.media.mediaText };
            else if (typeof CSSSupportsRule !== "undefined" && r instanceof CSSSupportsRule) c = { t: "supports", v: r.conditionText };
            marcher(r.cssRules, conds.concat([c]));
          }
        }
      })(rs, []);
    }
    if (!tc.props || tc._n !== tc.rules.length) {
      const s = new Set(DEFAUTS);
      tc.rules.forEach(function (r) { r.props.forEach(function (p) { if (!EXCLUS.test(p)) s.add(p); }); });
      tc.props = Array.from(s); tc._n = tc.rules.length; tc.base = new Map();
    }
    return { regles: tc.rules.length, unites: tc.units.length };
  };
  function condOk(c) {
    if (c.t === "media") return matchMedia(c.v).matches;
    if (c.t === "supports") { try { return CSS.supports(c.v); } catch (e) { return false; } }
    return false;
  }
  // Pseudo-élément final : ::before / ::after relevés ; les autres (barre de défilement…) = non couverts.
  function pseudoElement(item) {
    const m = item.match(/::?(before|after|placeholder|-webkit-[a-z-]+|-moz-[a-z-]+|selection|marker|backdrop|first-line|first-letter)\s*$/i);
    return m ? { sel: item.slice(0, m.index) || "*", ps: m[1].toLowerCase() } : { sel: item, ps: null };
  }
  // Sujets de chaque sélecteur sur l'écran courant (sélecteurs d'origine) et couverture.
  tc.apparier = function () {
    const sauve = Array.from(tc.applied); tc.appliquer([]);
    tc.sujets = new Map();
    const res = {};
    for (const u of tc.units) {
      const r = tc.byKey.get(u.rk), p = pseudoElement(u.item);
      let els = [];
      try { els = Array.from(document.querySelectorAll(p.sel)); } catch (e) { continue; }
      tc.sujets.set(u.key, els);
      const vis = els.some(visible);
      const couvrable = !r.custom && r.conds.every(condOk) && (p.ps === null || p.ps === "before" || p.ps === "after");
      res[u.key] = { n: els.length, couv: couvrable && vis ? 1 : 0 };
    }
    tc.appliquer(sauve);
    return res;
  };
  // Pose l'ensemble des sélecteurs retirés (remplace le précédent) en réécrivant selectorText.
  tc.appliquer = function (keys) {
    const S = new Set(keys), touches = new Set();
    tc.applied.forEach(function (k) { touches.add(tc.uByKey.get(k).rk); });
    S.forEach(function (k) { touches.add(tc.uByKey.get(k).rk); });
    touches.forEach(function (rk) {
      const r = tc.byKey.get(rk);
      const rest = r.items.filter(function (it, i) { return !S.has(rk + "/" + i); });
      const voulu = rest.length ? rest.join(", ") : ".kta-releve-jamais:not(*)";
      if (r.rule.selectorText !== voulu) r.rule.selectorText = voulu;
    });
    tc.applied = S;
  };
  function sig(el) {
    const cs = getComputedStyle(el);
    let s = visible(el) ? "V|" : "H|";
    for (const p of tc.props) s += cs.getPropertyValue(p) + "|";
    for (const ps of ["::before", "::after"]) {
      const c = getComputedStyle(el, ps), ct = c.getPropertyValue("content");
      s += ps + ct;
      if (ct && ct !== "none" && ct !== "normal") for (const p of tc.props) s += c.getPropertyValue(p) + "|";
    }
    return s;
  }
  // Retirer une règle ne change que ses sujets et leurs descendants (héritage) : on ne compare que ceux-là.
  function affectes(keys) {
    const set = new Set();
    for (const k of keys) {
      for (const el of (tc.sujets.get(k) || [])) {
        if (set.has(el)) continue;
        set.add(el); el.querySelectorAll("*").forEach(function (d) { set.add(d); });
      }
    }
    return Array.from(set);
  }
  function tester(acquis, lot) {
    const els = affectes(lot);
    const manque = els.filter(function (e) { return !tc.base.has(e); });
    if (manque.length) { tc.appliquer([]); manque.forEach(function (e) { tc.base.set(e, sig(e)); }); }
    tc.appliquer(acquis.concat(lot));
    const ecarts = [];
    for (const e of els) {
      const b = tc.base.get(e), a = sig(e);
      if (b === a || (b[0] === "H" && a[0] === "H")) continue;
      ecarts.push(e);
      if (ecarts.length > 3) break;
    }
    return ecarts;
  }
  function decrire(e) {
    let s = e.tagName.toLowerCase() + (e.id ? "#" + e.id : "");
    if (typeof e.className === "string" && e.className.trim()) s += "." + e.className.trim().split(/\s+/).slice(0, 3).join(".");
    const b = tc.base.get(e).split("|"), a = sig(e).split("|"), noms = ["visible"].concat(tc.props), d = [];
    for (let i = 0; i < Math.max(a.length, b.length) && d.length < 3; i++) {
      if (a[i] !== b[i]) d.push((noms[i] || "#" + i) + " " + (b[i] || "").slice(0, 40) + " → " + (a[i] || "").slice(0, 40));
    }
    return s + " : " + d.join(" ; ");
  }
  tc.verifier = function (keys) { return tester([], keys).length; };
  // Glouton par dichotomie : un lot sans écart est acquis, sinon coupé en deux jusqu'au sélecteur seul.
  tc.glouton = function (acquisBase, cands) {
    const acq = acquisBase.slice(), rej = [], pourquoi = {};
    (function resoudre(lot) {
      if (!lot.length) return;
      const d = tester(acq, lot);
      if (!d.length) { acq.push.apply(acq, lot); return; }
      if (lot.length === 1) { rej.push(lot[0]); pourquoi[lot[0]] = decrire(d[0]); return; }
      const m = lot.length >> 1;
      resoudre(lot.slice(0, m)); resoudre(lot.slice(m));
    })(cands);
    tc.appliquer([]);
    return { acq: acq.slice(acquisBase.length), rej: rej, pourquoi: pourquoi };
  };
  // États forcés : éléments visibles du composé qui porte la pseudo-classe (+ ancêtres pour survol et actif,
  // comme un vrai pointeur), 8 au plus par sélecteur.
  function chemin(el) {
    const parts = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n === document.documentElement) { parts.unshift("html"); break; }
      let i = 1, s = n; while ((s = s.previousElementSibling)) i++;
      parts.unshift(n.tagName.toLowerCase() + ":nth-child(" + i + ")");
    }
    return parts.join(" > ");
  }
  tc.itemsEtat = function () {
    return tc.units.map(function (u) { return u.item; }).filter(function (it) { return /:(hover|focus-visible|focus-within|focus|active)\b/.test(it); });
  };
  tc.cibles = function (items) {
    const m = new Map();
    function ajouter(el, ps) { if (!m.has(el)) m.set(el, new Set()); m.get(el).add(ps); }
    for (const item of items) {
      const cs = decouper(pseudoElement(item).sel, true);
      for (let i = 0; i < cs.length; i++) {
        const pss = (cs[i].match(RXPS) || []).map(function (x) { return x.slice(1); });
        if (!pss.length) continue;
        const sel = cs.slice(0, i + 1).map(function (c) { return c.replace(RXPS, "") || "*"; }).join(" ");
        let els = [];
        try { els = Array.from(document.querySelectorAll(sel)).filter(visible).slice(0, 8); } catch (e) { continue; }
        els.forEach(function (el) {
          pss.forEach(function (ps) {
            ajouter(el, ps);
            if (ps === "hover" || ps === "active") for (let a = el.parentElement; a; a = a.parentElement) ajouter(a, ps);
          });
        });
      }
    }
    const out = [];
    m.forEach(function (ps, el) { out.push({ p: chemin(el), ps: Array.from(ps) }); });
    return out;
  };
  // Relevé complet : chaque élément visible, clé = chemin (id stable compris).
  tc.releve = function () {
    const out = {};
    for (const el of document.querySelectorAll("*")) {
      const sg = sig(el);
      if (sg[0] === "H") continue;
      let p = "";
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        let i = 0, s = n; while ((s = s.previousElementSibling)) i++;
        p = n.tagName + (n.id && !/\d{4,}/.test(n.id) ? "#" + n.id : "") + ":" + i + ">" + p;
      }
      out[p] = sg;
    }
    return out;
  };
  return true;
}

// ── Navigateur ──
async function demarrer(theme, larg, haut) {
  const nav = await lancerNavigateur(chromium, { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: larg, height: haut }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(function (o) { for (const k in o) localStorage.setItem(k, o[k]); },
    Object.assign({}, LS_PREGATES, { "myktamap_theme_v1": theme }));
  await amorcer(page);
  return { nav, page };
}
async function amorcer(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.OOMGuard && !document.getElementById("splashOverlay"); }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.waitForTimeout(300);
  // Gel : transitions coupées, animations menées à leur fin d'emblée (un style calculé stable, le même des deux côtés).
  // 🩸 Spécificité (4,0,0) : un `transition: … !important` de l'app battrait un simple `*` et laisserait un fond
  // à mi-chemin sous un survol forcé (écart de quelques unités, différent à chaque relevé).
  const tous = "*:not(#kta-g1#kta-g2#kta-g3#kta-g4)";
  await page.addStyleTag({ content: tous + "," + tous + "::before," + tous + "::after{transition:none!important;" +
    "animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important}" });
  // Feuilles chargées à la demande : toutes présentes, dans le même ordre à chaque relevé.
  await page.evaluate(function () {
    return Promise.all([["style-secours"], ["style-filtres"], ["style-meminspector"], ["style-stats-globales"]].map(function (x) {
      return window._loadCssOnce("css/" + x[0] + ".css", "kta-css-" + x[0]);
    }));
  });
  await page.waitForTimeout(500);
  await page.evaluate(installer);
}
async function ouverts(page) {
  return page.evaluate(function () {
    const l = [];
    document.querySelectorAll("body > *, html > *, [class*=overlay], [class*=modal], [id*=odal], [class*=panneau]").forEach(function (e) {
      if (/^(SCRIPT|HEAD|BODY|STYLE|LINK)$/.test(e.tagName) || e.id === "planLoaderOverlay") return;
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if ((cs.position === "fixed" || cs.position === "absolute") && window.__tc.visible(e) &&
          (parseInt(cs.zIndex, 10) || 0) >= 1000 && r.width > 100 && r.height > 100) l.push(e.id || String(e.className).split(" ")[0]);
    });
    return l.join(",");
  });
}
// Parcours des écrans dans l'ordre ; une fenêtre qui ne se ferme pas = page rechargée (état suivant propre).
async function parcourir(page, surEcran) {
  const filtre = process.env.RELEVE_ECRANS ? new RegExp(process.env.RELEVE_ECRANS) : null;
  for (const e of ECRANS.liste()) {
    if (e.nom === "__plan__") { await ECRANS.chargerPlan(page); continue; }
    if (filtre && e.nom !== "accueil" && !filtre.test(e.nom)) continue;
    try { await e.go(page); } catch (err) { console.log("  ! " + e.nom + " : " + String(err.message).slice(0, 100)); }
    await page.waitForTimeout(900);
    await surEcran(e);
    try { if (e.ferme) await e.ferme(page); await ECRANS.fermer(page); } catch (err) { /* rechargé ci-dessous */ }
    if (await ouverts(page)) { await amorcer(page); if (e.phase === "carte") await ECRANS.chargerPlan(page); }
  }
}
// États forcés par CDP : querySelectorAll et le style calculé les voient (Element.matches non).
async function forcer(page, items) {
  const cibles = await page.evaluate(function (a) { return window.__tc.cibles(a); }, items);
  if (!cibles.length) return [];
  if (!page.__cdp) { page.__cdp = await page.context().newCDPSession(page); await page.__cdp.send("DOM.enable"); await page.__cdp.send("CSS.enable"); }
  const { root } = await page.__cdp.send("DOM.getDocument", { depth: 0 });
  const ids = [];
  for (const c of cibles) {
    try {
      const r = await page.__cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: c.p });
      if (!r.nodeId) continue;
      await page.__cdp.send("CSS.forcePseudoState", { nodeId: r.nodeId, forcedPseudoClasses: c.ps });
      ids.push(r.nodeId);
    } catch (e) { /* élément disparu : non forcé */ }
  }
  return ids;
}
async function relacher(page, ids) {
  for (const id of ids) { try { await page.__cdp.send("CSS.forcePseudoState", { nodeId: id, forcedPseudoClasses: [] }); } catch (e) { /* parti */ } }
}

// ── Modes ──
async function chercher(sortie, larg, haut) {
  const prec = fs.existsSync(sortie) ? JSON.parse(fs.readFileSync(sortie, "utf8")) : {};
  const R = new Set(prec.retirables ? prec.retirables.map(function (x) { return x.cle; }) : []);
  const REJ = prec.gardes || {}, COUV = prec.couverture || {}, UNITES = prec.unites || {}, REGLES = prec.regles || {};
  const { nav, page } = await demarrer("light", larg, haut);
  async function traiter(nom) {
    await page.evaluate(function () { window.__tc.base = new Map(); window.__tc.appliquer([]); window.__tc.collecter(); });
    const l = await page.evaluate(function () {
      return { u: window.__tc.units.map(function (u) { return [u.key, u.item]; }),
        r: window.__tc.rules.map(function (r) { return [r.key, r.sel]; }) };
    });
    l.u.forEach(function (x) { UNITES[x[0]] = x[1]; });
    l.r.forEach(function (x) { REGLES[x[0]] = x[1]; });
    const cov = await page.evaluate(function () { return window.__tc.apparier(); });
    const vus = [], couverts = [];
    for (const k in cov) {
      if (cov[k].n > 0) vus.push(k);
      if (cov[k].couv) { couverts.push(k); if ((COUV[k] = COUV[k] || []).indexOf(nom) < 0) COUV[k].push(nom); }
    }
    // L'acquis doit tenir sur chaque écran ; sinon les fautifs repassent en « gardés ».
    const acquis = vus.filter(function (k) { return R.has(k); });
    if (acquis.length && await page.evaluate(function (a) { return window.__tc.verifier(a); }, acquis)) {
      const g = await page.evaluate(function (a) { return window.__tc.glouton([], a); }, acquis);
      g.rej.forEach(function (k) { R.delete(k); REJ[k] = nom + " : " + g.pourquoi[k]; });
    }
    const base = vus.filter(function (k) { return R.has(k); });
    // body.* d'abord : le préfixe html atteint aussi les fenêtres ajoutées hors de <body>.
    const rang = function (k) { return /^body\./.test(UNITES[k]) ? 0 : /^html\./.test(UNITES[k]) ? 1 : 2; };
    const cands = couverts.filter(function (k) { return !R.has(k) && !REJ[k]; }).sort(function (a, b) { return rang(a) - rang(b); });
    let g = { acq: [], rej: [], pourquoi: {} };
    if (cands.length) g = await page.evaluate(function (a) { return window.__tc.glouton(a[0], a[1]); }, [base, cands]);
    g.acq.forEach(function (k) { R.add(k); });
    g.rej.forEach(function (k) { REJ[k] = nom + " : " + g.pourquoi[k]; });
    console.log(nom.padEnd(34) + " couverts " + couverts.length + " · candidats " + cands.length + " → retirables +" +
      g.acq.length + ", gardés +" + g.rej.length + " · total retirables " + R.size);
    fs.writeFileSync(sortie, JSON.stringify({
      retirables: Array.from(R).sort().map(function (k) { return { cle: k, selecteur: UNITES[k], regle: REGLES[k.split("/")[0]] }; }),
      gardes: REJ, couverture: COUV, unites: UNITES, regles: REGLES }, null, 1));
  }
  await parcourir(page, async function (e) {
    await traiter(e.nom);
    const items = await page.evaluate(function () { return window.__tc.itemsEtat(); });
    const ids = await forcer(page, items);
    if (ids.length) { await traiter(e.nom + "#etat"); await relacher(page, ids); }
  });
  await nav.close();
  const tot = Object.keys(UNITES).length;
  console.log("\nsélecteurs clairs vus : " + tot + " · couverts : " + Object.keys(COUV).length + " · retirables : " + R.size +
    " · gardés (écart mesuré) : " + Object.keys(REJ).length + " → " + sortie);
}

async function proprietes(sortieProps, sortieEtats) {
  const { nav, page } = await demarrer("light", 1280, 800);
  const etats = new Set();
  await parcourir(page, async function () {
    await page.evaluate(function () { window.__tc.collecter(); });
    (await page.evaluate(function () { return window.__tc.itemsEtat(); })).forEach(function (x) { etats.add(x); });
  });
  const props = await page.evaluate(function () { return window.__tc.props; });
  fs.writeFileSync(sortieProps, JSON.stringify(props));
  if (sortieEtats) fs.writeFileSync(sortieEtats, JSON.stringify(Array.from(etats)));
  console.log("propriétés relevées : " + props.length + " · sélecteurs à état forcé : " + etats.size);
  await nav.close();
}

async function relever(theme, sortie, fProps, fEtats, larg, haut) {
  const props = JSON.parse(fs.readFileSync(fProps, "utf8"));
  const etats = fEtats ? JSON.parse(fs.readFileSync(fEtats, "utf8")) : null;
  const { nav, page } = await demarrer(theme, larg, haut);
  const res = {};
  await parcourir(page, async function (e) {
    res[e.nom] = await page.evaluate(function (p) { window.__tc.props = p; return window.__tc.releve(); }, props);
    if (etats) {
      const ids = await forcer(page, etats);
      if (ids.length) res[e.nom + "#etat"] = await page.evaluate(function () { return window.__tc.releve(); });
      await relacher(page, ids);
    }
  });
  fs.writeFileSync(sortie, JSON.stringify(res));
  let n = 0; for (const k in res) n += Object.keys(res[k]).length;
  console.log("relevé " + theme + " " + larg + "×" + haut + " : " + Object.keys(res).length + " écrans, " + n + " éléments visibles");
  await nav.close();
}

function comparer(fa, fb, fProps) {
  const A = JSON.parse(fs.readFileSync(fa, "utf8")), B = JSON.parse(fs.readFileSync(fb, "utf8"));
  const P = fProps ? ["visible"].concat(JSON.parse(fs.readFileSync(fProps, "utf8"))) : null;
  const multi = function (o) {
    return Object.keys(o).map(function (k) { return k.replace(/:\d+>/g, ">").split(">").slice(-3).join(">") + "=" + o[k]; }).sort().join("\n");
  };
  let tot = 0, el = 0;
  for (const s of Object.keys(A)) {
    const a = A[s] || {}, b = B[s] || {};
    const cles = new Set(Object.keys(a).concat(Object.keys(b)));
    let d = 0; const ex = [];
    for (const k of cles) {
      el++;
      if (a[k] === b[k]) continue;
      d++;
      if (ex.length >= 4) continue;
      let det = a[k] ? (b[k] ? "" : " (absent après)") : " (absent avant)";
      if (a[k] && b[k] && P) {
        const x = a[k].split("|"), y = b[k].split("|");
        for (let i = 0; i < x.length && det.length < 300; i++) if (x[i] !== y[i]) det += " " + (P[i] || "#" + i) + " " + x[i].slice(0, 50) + " → " + (y[i] || "").slice(0, 50);
      }
      ex.push(k.split(">").slice(-4).join(">") + det);
    }
    if (d && multi(a) === multi(b)) { console.log(s + " : " + d + " écarts de position seulement (mêmes styles) → 0"); d = 0; }
    tot += d;
    if (d) { console.log(s + " : " + d + " écarts / " + cles.size); ex.forEach(function (x) { console.log("    " + x); }); }
  }
  console.log("TOTAL " + Object.keys(A).length + " écrans, " + el + " éléments comparés, " + tot + " écarts");
  return tot;
}

(async function () {
  const [mode, a, b, c, d, e, f] = process.argv.slice(2);
  if (mode === "comparer") { process.exit(comparer(a, b, c) ? 1 : 0); }
  const usage = "usage : node scripts/smoke/releve-theme.js proprietes|chercher|relever|comparer … (cf en-tête)";
  if (["proprietes", "chercher", "relever"].indexOf(mode) < 0) { console.log(usage); process.exit(2); }
  const serveur = servir();
  try {
    if (mode === "proprietes") await proprietes(a, b);
    else if (mode === "chercher") await chercher(a, +(b || 1280), +(c || 800));
    else {
      const avecEtats = c && d && !/^\d+$/.test(d);
      await relever(a, b, c, avecEtats ? d : null, +((avecEtats ? e : d) || 1280), +((avecEtats ? f : e) || 800));
    }
  } finally { serveur.close(); }
})().catch(function (err) { console.error(err); process.exit(1); });
