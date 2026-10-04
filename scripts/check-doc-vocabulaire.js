#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📚 check-doc-vocabulaire.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Deux écarts doc ↔ app de l'audit ergonomie (§6.1), corrigés le 14/09/2026 :
//
//   • D2 — « le flyout Tracker ». Le Tracker n'est PAS un flyout : c'est une
//     modale plein écran de tuiles (v1.50.0). Le mot est juste ailleurs —
//     Favoris, Tracés, Zones et Structures portent `useFlyout: true`. Un mot
//     d'interface employé pour le mauvais objet envoie chercher une barre
//     latérale qui ne s'ouvrira jamais.
//   • D13 — « 4 styles » de légende pour l'export IMAGE, qui n'en a que 3 ;
//     le 4ᵉ (impression) est propre au PDF.
//
// 🎯 AUCUNE TABLE RECOPIÉE — même règle que `check-icon-catalog.js` : les
// groupes qui ont droit au mot « flyout » sont LUS dans `interface.js`, leurs
// noms dans les dictionnaires, et les styles de légende COMPTÉS dans les deux
// écrans d'export. Une table figée ici validerait le bug le jour où le code
// change.
//
// Usage : node scripts/check-doc-vocabulaire.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

const IFACE = lire("js/interface.js");
const LANGS = ["fr", "en", "es"];
const DICOS = {}; LANGS.forEach(function (l) { DICOS[l] = JSON.parse(lire("lang/" + l + ".json")); });
const DOCS  = { fr: lire("docs/applications/README_USER.md"),
                en: lire("docs/applications/README_USER.en.md"),
                es: lire("docs/applications/README_USER.es.md") };

// ---------- 1. Qui a droit au mot « flyout » ----------
// Un groupe est declaré par `id: "x"` ; `useFlyout: true` apparaît dans le même
// littéral. On découpe sur les `id:` et on regarde ce que chaque bloc contient.
const groupes = [];
{
  const re = /id:\s*"([a-z0-9_-]+)"/gi;
  const positions = [];
  let m;
  while ((m = re.exec(IFACE)) !== null) positions.push({ id: m[1], i: m.index });
  positions.forEach(function (p, k) {
    const fin = (k + 1 < positions.length) ? positions[k + 1].i : Math.min(p.i + 1500, IFACE.length);
    const bloc = IFACE.slice(p.i, fin);
    if (/titre:\s*window\.I18n\.t\("ui\.group\./.test(bloc) || /useFlyout:\s*true/.test(bloc)) {
      groupes.push({ id: p.id, flyout: /useFlyout:\s*true/.test(bloc) });
    }
  });
  t("les groupes de la barre sont lisibles dans interface.js", groupes.length >= 8);
  const avec = groupes.filter(function (g) { return g.flyout; }).map(function (g) { return g.id; });
  t("🩸 au moins un groupe porte réellement useFlyout (sinon la règle ne vaut rien)", avec.length > 0);
  console.log("   → flyout : " + avec.join(", ") + " · pas flyout : " +
              groupes.filter(function (g) { return !g.flyout; }).map(function (g) { return g.id; }).join(", "));
}

// ---------- 2. Le mot n'est employé que pour eux ----------
{
  const FLY = /flyout/i;
  const sansFlyout = groupes.filter(function (g) { return !g.flyout; });
  LANGS.forEach(function (l) {
    // Textes à contrôler : la doc utilisateur et tout texte du dictionnaire.
    const sources = [{ nom: "README_USER (" + l + ")", txt: DOCS[l] }];
    Object.keys(DICOS[l]).forEach(function (k) {
      const v = DICOS[l][k];
      if (typeof v === "string" && FLY.test(v)) sources.push({ nom: l + " / " + k, txt: v });
    });
    const fautes = [];
    sansFlyout.forEach(function (g) {
      const nom = DICOS[l]["ui.group." + g.id];
      if (!nom) return;
      // Le nom du groupe et « flyout » à moins de 40 caractères l'un de l'autre.
      const escape = nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("(" + escape + "[\\s\\S]{0,40}flyout|flyout[\\s\\S]{0,40}" + escape + ")", "i");
      sources.forEach(function (s) {
        if (re.test(s.txt)) fautes.push(s.nom + " → « " + nom + " » présenté comme un flyout");
      });
    });
    t("🩸 " + l + " : aucun groupe SANS flyout n'est présenté comme tel" +
      (fautes.length ? " — " + fautes.slice(0, 3).join(" · ") : ""), fautes.length === 0);
  });
}

// ---------- 3. Les styles de légende, comptés dans le code ----------
{
  const IMG = lire("js/exporter.js");
  const PDF = lire("js/pdfExport.js");
  const nImg = (IMG.match(/name="leg_style"[^>]*value="[a-z]+"/g) || []).length;
  const nPdf = (PDF.match(/_radioRowInline\("pdf_leg_style",\s*"[a-z]+"/g) || []).length;
  t("les styles de légende sont comptables dans les deux écrans (image " + nImg + " · PDF " + nPdf + ")", nImg > 0 && nPdf > 0);
  // Le tutoriel ne compte plus les styles (refonte du 03/10/2026 : une carte
  // d'accueil ne détaille pas l'export). Le contrôle ne lit plus une carte
  // par son numéro : toute carte qui annoncerait un nombre de styles doit
  // annoncer celui de l'export image.
  const MOT = { fr: ["styles", "estilos"], en: ["styles"], es: ["estilos"] };
  LANGS.forEach(function (l) {
    const faux = [];
    Object.keys(DICOS[l]).filter(function (k) { return /^tutorial\.card\./.test(k); }).forEach(function (k) {
      MOT[l].forEach(function (mot) {
        const m = DICOS[l][k].match(new RegExp("(\\d+)\\s+" + mot, "i"));
        if (m && Number(m[1]) !== nImg) faux.push(k + " annonce " + m[1]);
      });
    });
    t("🩸 " + l + " : aucune carte du tutoriel n'annonce un autre nombre de styles que l'export image (" + nImg + ")" +
      (faux.length ? " — " + faux.join(" · ") : ""), faux.length === 0);
  });
}

console.log("");
if (echecs) { console.log("💥 vocabulaire doc : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 vocabulaire doc : « flyout » désigne les bons groupes, et les styles de légende sont comptés dans le code");
