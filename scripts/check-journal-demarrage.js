#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-journal-demarrage.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Le démarrage manuel d'une sortie (`js/journal.js > demarrer`, bouton de la
// section Carnet). La fonction extraite du fichier réel est EXÉCUTÉE (vm).
// 🩸 Régressions silencieuses visées :
//   1. garde « une sortie tourne déjà » qui saute : `_ouvrir` clôture la sortie
//      en cours, un clic de trop l'archive ou la coupe en deux ;
//   2. `demarrer` qui teste `isEnabled()` : carnet décoché, c'est le SEUL moyen
//      d'enregistrer une sortie ;
//   3. balayage de démarrage conditionné au carnet actif : une sortie manuelle
//      coupée par un crash resterait « en cours » pour toujours ;
//   4. bouton affiché en même temps que 🏁 Clôturer.
// Usage : node scripts/check-journal-demarrage.js [racine]
// 🏷️ REPÈRES DE DÉCOUPE : du CODE ou un marqueur explicite `// 🏷️ ancre:<nom>`
// posé dans la source, jamais un commentaire libre (un nettoyage le retirerait).
// Repère introuvable = ÉCHEC, jamais une découpe jusqu'à la fin du fichier.
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }
// Découpe [debut, fin[ ; fin === null : jusqu'au bout du fichier, VOULU. Repère absent → échec + "".
function bloc(src, debut, fin) {
  const i = src.indexOf(debut);
  const j = (i >= 0 && fin !== null) ? src.indexOf(fin, i + debut.length) : -1;
  if (i < 0 || (fin !== null && j < 0)) {
    t("repère de découpe introuvable : « " + (i < 0 ? debut : fin).trim() + " »", false);
    return "";
  }
  return src.slice(i, fin === null ? undefined : j);
}

const JRN = lire("js/journal.js");
const RFI = lire("js/refonteInterface.js");

// ── 1. La fonction, exécutée ─────────────────────────────────────────
{
  const i = JRN.indexOf("  function demarrer() {");
  const j = JRN.indexOf("\n  }\n", i);
  const src = (i >= 0 && j > i) ? JRN.slice(i, j + 4) : "";
  t("la fonction demarrer() est extractible", src.length > 0);
  if (src) {
    // `_ouvrir` (qui clôture la sortie en cours) remplacée par un mouchard.
    const jouer = function (etat) {
      const appels = [];
      const sb = {
        _cur: etat.cur || null,
        window: { _currentLoadedPlanId: etat.planId || null },
        _planNameCourant: function () { return "Plan test"; },
        _ouvrir: function (p, n, o) { appels.push({ planId: p, nom: n, origine: o }); return etat.ouvertureEchoue ? null : { id: "srt_test" }; },
        isEnabled: function () { return etat.carnetActif !== false; },
        resultat: null
      };
      let err = null;
      try { vm.runInNewContext(src + "\nresultat = demarrer();", sb, { filename: "journal.demarrer.js" }); } catch (e) { err = e.message; }
      return { r: sb.resultat, appels: appels, err: err };
    };

    const nominal = jouer({ planId: "plan-a" });
    t("🩸 …et s'exécute sans erreur" + (nominal.err ? " — " + nominal.err : ""), !nominal.err);
    t("cas nominal : une sortie s'ouvre sur le plan courant, marquée « manuel »",
      nominal.r && nominal.r.ok === true && nominal.appels.length === 1 &&
      nominal.appels[0].planId === "plan-a" && nominal.appels[0].origine === "manuel");

    const dejaEnCours = jouer({ planId: "plan-a", cur: { id: "srt_deja" } });
    t("🩸 une sortie DÉJÀ en cours : refus explicite, et rien n'est ouvert (la sortie en cours n'est pas écrasée)",
      dejaEnCours.r && dejaEnCours.r.ok === false && dejaEnCours.r.raison === "encours" && dejaEnCours.appels.length === 0);
    t("le refus nomme la sortie en cours (l'appelant peut la pointer)",
      dejaEnCours.r && dejaEnCours.r.id === "srt_deja");

    const sansPlan = jouer({ planId: null });
    t("🩸 aucun plan chargé : refus « sansPlan », rien d'ouvert (une sortie appartient à un plan)",
      sansPlan.r && sansPlan.r.ok === false && sansPlan.r.raison === "sansPlan" && sansPlan.appels.length === 0);

    const carnetOff = jouer({ planId: "plan-a", carnetActif: false });
    t("🩸 carnet DÉCOCHÉ : le démarrage manuel marche quand même — c'est son cas d'usage",
      carnetOff.r && carnetOff.r.ok === true && carnetOff.appels.length === 1);

    const echec = jouer({ planId: "plan-a", ouvertureEchoue: true });
    t("une ouverture qui échoue n'est pas annoncée comme réussie",
      echec.r && echec.r.ok === false && echec.r.raison === "echec");
  }
}

// ── 2. Le module autour ──────────────────────────────────────────────
{
  t("📔 demarrer est exposée dans l'API du module", /^\s*demarrer:\s*demarrer,/m.test(JRN));
  const opl = JRN.slice(JRN.indexOf("function onPlanLoaded("), JRN.indexOf("function demarrer()"));
  // ⚠️ La branche « carnet décoché » peut REPRENDRE une sortie manuelle
  // suspendue, mais n'en OUVRE jamais (aucun `_ouvrir`) et rend null.
  const brancheOff = (function () {
    const i = opl.indexOf("if (!isEnabled()) {");
    if (i < 0) return null;
    const j = opl.indexOf("return null;", i);
    return j < 0 ? null : opl.slice(i, j + "return null;".length);
  })();
  t("🩸 l'ouverture AUTOMATIQUE reste conditionnée au carnet actif (décocher doit encore tout arrêter)",
    brancheOff !== null && !/_ouvrir\(/.test(brancheOff) && /_ouvrir\(planId, planName, "auto"\)/.test(opl));
  const dem = bloc(JRN, "  function demarrer() {", "  function _ouvrir(");
  t("🩸 …et le démarrage MANUEL ne le teste pas (sinon le bouton ne sert à rien là où il sert)",
    dem.length > 0 && !/isEnabled\(\)/.test(dem));
  const bas = bloc(JRN, "// 🏷️ ancre:balayage-demarrage", null);
  t("🩸 le balayage de démarrage régularise TOUJOURS (plus sous condition de carnet actif)",
    /setTimeout\(function\(\) \{ _balayerEnCours\(\);( _expirerSuspendues\(\);)? \}, 4000\);/.test(bas) &&
    !/if \(isEnabled\(\)\) \{\n\s*setTimeout/.test(bas));
  t("clôturer ne rouvre une sortie que par le chemin automatique (carnet décoché : rien ne repart)",
    /function cloturer\(\)[\s\S]{0,900}onPlanLoaded\(planId, planName\);/.test(JRN));
  t("la sortie garde son origine (ouvertePar)", /ouvertePar:\s*\(origine === "manuel"\) \? "manuel" : "auto",/.test(JRN));
}

// ── 3. Le bouton ─────────────────────────────────────────────────────
{
  t("📔 le bouton existe dans la section Carnet de 📊 Détails de la session", /id="kta-refonte-session-carnet-demarrer"/.test(RFI));
  t("🩸 il n'est proposé QUE sans sortie en cours (sinon il coexisterait avec 🏁 Clôturer)",
    /\(cur \? '' : '<button type="button" class="kta-btn kta-btn-primary kta-btn-small" id="kta-refonte-session-carnet-demarrer"/.test(RFI));
  const h = RFI.slice(RFI.indexOf('const _btnCarnetDemarrer'), RFI.indexOf('const _btnCarnetOuvrir'));
  t("le clic passe par Journal.demarrer (source de vérité sur l'état, pas le bouton)", /window\.Journal\.demarrer\(\)/.test(h));
  t("🩸 un refus est DIT, avec la bonne raison (jamais un clic sans effet)",
    /jrn\.err\.sansPlan/.test(h) && /jrn\.err\.dejaEnCours/.test(h) && /if \(!r \|\| !r\.ok\)/.test(h));
  t("un démarrage réussi le dit et re-rend la section", /jrn\.toast\.demarree/.test(h) && /_afficherModaleSessionDetail\(\)/.test(h));
}

// ── 4. i18n et doc ×3 ────────────────────────────────────────────────
{
  const CLES = ["jrn.section.demarrer", "jrn.section.demarrerTitre", "jrn.section.aucuneHint",
                "jrn.toast.demarree", "jrn.err.dejaEnCours", "jrn.err.sansPlan", "jrn.err.indispo"];
  const F = { fr: "README_USER.md", en: "README_USER.en.md", es: "README_USER.es.md" };
  const H = { fr: "📔 Démarrer une sortie", en: "📔 Start an outing", es: "📔 Iniciar una salida" };
  const A = { fr: "Démarrer une sortie à la main", en: "Start an outing by hand", es: "Iniciar una salida a mano" };
  for (const l of ["fr", "en", "es"]) {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    t("🌍 " + l + " : les 7 textes du démarrage manuel existent", CLES.every(k => typeof d[k] === "string"));
    t("❓ " + l + " : l'aide du carnet explique le démarrage manuel", (d["aide.sec.carnet.html"] || "").includes(A[l]));
    // Le démarrage manuel est expliqué par l'aide et le Guide, pas par la case.
    t("📖 " + l + " : le README documente le bouton", lire("docs/applications/" + F[l]).includes(H[l]));
  }
}

console.log("");
if (echecs) { console.log("💥 démarrage manuel : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 démarrage manuel : une sortie à la fois, un refus toujours dit, et ça marche carnet décoché");
