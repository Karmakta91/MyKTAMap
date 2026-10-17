#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-notifs.js — garde-fou pré-commit BLOQUANT du réglage des notifications (Toutes / Essentielles / Silence)
// =====================================================================
// 🩸 Ce qui régresse sans bruit :
//   1. un module dessine son propre toast sans passer par le goulot (js/oomGuard.js) : le réglage ne le
//      coupe pas, l'utilisateur croit le réglage cassé ;
//   2. une alerte importante (batterie 10 %, capteurs refusés) ou une erreur disparaît en « Silence » ;
//   3. la vibration ne suit plus le réglage (« Essentielles » vibre sur « filtres restaurés ») ;
//   4. les toasts de restauration au chargement ne sont plus regroupés.
// La décision (_decisionToast) est EXÉCUTÉE, extraite du goulot. Usage : node scripts/check-notifs.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

const OOM = lire("js/oomGuard.js");

// ── 1. La décision, exécutée ──────────
{
  const i = OOM.indexOf("function _decisionToast(");
  const j = OOM.indexOf("\n  }\n", i);
  const src = (i >= 0 && j > i) ? OOM.slice(i, j + 4) : "";
  t("la décision est extractible", src.length > 0);
  if (src) {
    const jouer = function (niveau, type, opts) { const sb = { out: null, n: niveau, ty: type, o: opts }; vm.runInNewContext(src + "\nout = _decisionToast(n, ty, o);", sb); return sb.out; };
    t("« Toutes » : tout passe, warn/error vibrent, info ne vibre pas",
      jouer("all", "info").afficher && !jouer("all", "info").vibrer && jouer("all", "warn").afficher && jouer("all", "warn").vibrer && jouer("all", "error").vibrer);
    t("🩸 « Essentielles » : plus d'info (confirmation d'un geste), warn passe SANS vibrer, error passe",
      !jouer("essential", "info").afficher && jouer("essential", "warn").afficher && !jouer("essential", "warn").vibrer && jouer("essential", "error").afficher);
    t("🩸 « Silence » : seuls les warn IMPORTANTS et les erreurs",
      !jouer("silent", "info").afficher && !jouer("silent", "warn").afficher && jouer("silent", "warn", { important: true }).afficher && jouer("silent", "error").afficher);
    t("🩸 une ERREUR passe et vibre quel que soit le réglage", ["all", "essential", "silent"].every(function (n) { const d = jouer(n, "error"); return d.afficher && d.vibrer; }));
    t("type inconnu = warn (jamais promu en error, jamais rétrogradé en info)", jouer("essential", "bizarre").afficher && !jouer("silent", "bizarre").afficher);
    t("niveau inconnu = « Toutes » n'est PAS supposé : un info est tu (le défaut sûr vit dans niveauNotifs)", !jouer("nimporte", "info").afficher);
  }
  t("niveauNotifs rend « essential » par défaut (KARMA 17/09) et refuse un niveau inconnu à l'écriture",
    /const NOTIFS_DEFAUT = "essential";/.test(OOM) && /return NOTIFS_NIVEAUX\.indexOf\(v\) >= 0 \? v : NOTIFS_DEFAUT/.test(OOM) && /catch \(e\) \{ return NOTIFS_DEFAUT; \}/.test(OOM) && /if \(NOTIFS_NIVEAUX\.indexOf\(n\) < 0\) return false;/.test(OOM));
}

// ── 2. Un seul goulot ──────────
{
  t("showToast passe par la décision avant tout rendu (et avant la file du splash)",
    /function _emettre\([\s\S]{0,200}_decisionToast\(niveauNotifs\(\), type, opts\)[\s\S]{0,300}_toastQueue\.push/.test(OOM));
  t("la file du splash rejoue la vibration DÉCIDÉE, pas celle du type", (OOM.match(/if \(t\.vibrer && window\.kta_vibrate\)/g) || []).length >= 2 && !/type === "warn" \|\| type === "error"\) \{\s*window\.kta_vibrate/.test(OOM));
  t("regroupement : un groupe sort en UN toast après une fenêtre courte, au niveau le plus fort",
    /function _grouper\([\s\S]{0,1400}join\(" · "\)/.test(OOM) && /GROUPE_FENETRE_MS = \d+/.test(OOM));
  t("regroupement : un message identique n'y apparaît qu'une fois (capture du 14/10/2026 : « Lecture seule » ×7)",
    /function _grouper\([\s\S]{0,1400}if \(vus\[m\]\) return false;[\s\S]{0,120}uniques\.join\(" · "\)/.test(OOM));
  const OSM = lire("js/osmView.js");
  t("🩸 le toast maison de la Vue OSM demande la permission au goulot", /toastAutorise\("info"\)\) return;/.test(OSM));
  const autres = fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return f.endsWith(".js") && f !== "oomGuard.js"; })
    .filter(function (f) { return /createElement\("div"\)[\s\S]{0,120}kta-toast\b/.test(lire("js/" + f)); });
  t("🩸 aucun autre module ne fabrique un #kta-toast à lui (un seul goulot)" + (autres.length ? " — " + autres.join(", ") : ""), autres.length === 0);
}

// ── 3. Les sites marqués ──────────
{
  t("batterie 10 % survit au mode Silence (important)", /battery\.toast\.warn10[\s\S]{0,200}\{ important: true \}/.test(lire("js/batteryGuard.js")));
  t("capteurs refusés survit au mode Silence (important)", /capteursRefuses"\), "warn", \{ important: true \}/.test(lire("js/compass.js")));
  t("les toasts de restauration au chargement sont regroupés (filtres, photos, optimisations)",
    /filtresRestaures[^\n]*groupe: "chargement"/.test(lire("js/sessionPersist.js")) && (lire("js/main.js").match(/groupe: "chargement"/g) || []).length >= 2);
}

// ── 4. Le réglage ──────────
{
  const IDX = lire("index.html"), HC = lire("js/homeConfig.js");
  t("⚙️ Configuration : un sélecteur à trois positions", /id="loaderNotifsSel"[\s\S]{0,400}value="all"[\s\S]{0,200}value="essential"[\s\S]{0,200}value="silent"/.test(IDX));
  t("homeConfig lit et écrit par OOMGuard, sans copie locale de l'état", /OOMGuard\.niveauNotifs\(\)/.test(HC) && /OOMGuard\.setNiveauNotifs\(sel\.value\)/.test(HC));
  for (const l of ["fr", "en", "es"]) {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    t("🌍 " + l + " : textes du réglage", ["config.notifs.label", "config.notifs.all", "config.notifs.essential", "config.notifs.silent"].every(function (k) { return typeof d[k] === "string" && d[k]; }));
  }
  t("les alertes serveur ne passent pas par les toasts (hors de portée du réglage par construction)", !/showToast\(/.test(lire("js/alertChecker.js")));
}

console.log("");
if (echecs) { console.log("💥 notifications : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 notifications : un seul goulot, trois positions, l'important survit, le serveur reste audible");
