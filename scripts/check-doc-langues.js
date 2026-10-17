#!/usr/bin/env node
/*!
 * MyKTAMap — check-doc-langues.js
 * Parité des 3 guides utilisateur servis dans l'app (modale Documentation) :
 *   docs/applications/README_USER.md (FR, référence) · .en.md · .es.md
 *
 * Pourquoi (27/09/2026) : `check-i18n.js` garde la parité des DICTIONNAIRES,
 * mais rien ne gardait celle des GUIDES. Un audit a trouvé, en silence :
 * une section entière absente en espagnol, deux sections espagnoles qui
 * décrivaient un réglage supprimé depuis des mois, 7 puces manquantes, et —
 * pire — une règle de sécurité fausse en EN et ES (la zone ⛔ Inaccessible
 * « jamais relâchée », faux depuis la v1.82.0).
 *
 * Ce qu'il vérifie (BLOQUANT) :
 *   1. STRUCTURE — mêmes titres, dans le même ordre, dans les 3 langues.
 *      Un titre se compare par son NIVEAU et son ÉMOJI de tête (le texte,
 *      lui, est traduit) ; l'alignement est optimal (plus longue
 *      sous-séquence commune), donc une section manquante est nommée
 *      précisément au lieu de décaler tout le reste.
 *   2. VOLUME — aucune section traduite sous 70 % du français (sections FR
 *      d'au moins 300 caractères). L'anglais est naturellement ~15 % plus
 *      court ; sous 70 %, c'est qu'un paragraphe ou un encadré manque.
 *
 * Ce qu'il ne voit PAS : un contenu faux mais de bonne longueur. La règle de
 * CLAUDE.md (mettre à jour les 3 langues ensemble) reste le premier filet.
 *
 * Usage : node scripts/check-doc-langues.js   (exit 1 si écart)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "..", "docs", "applications");
const SEUIL = 0.7;
const MIN_FR = 300;

// Découpe un guide en sections : { i (ligne), lvl, txt, sig, n (caractères hors blancs) }.
// Les titres d'encadrés (« > #### … ») comptent comme des titres.
function sections(texte) {
  const out = [];
  let cur = null;
  texte.split(/\r?\n/).forEach(function(l, i) {
    if (/^>?\s*#{1,6} /.test(l)) {
      const t = l.replace(/^>?\s*/, "");
      const lvl = t.match(/^#+/)[0].length;
      const txt = t.replace(/^#+\s*/, "");
      const m = txt.match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u);
      cur = { i: i + 1, lvl: lvl, txt: txt.slice(0, 80), sig: lvl + ":" + (m ? m[0] : "·"), n: 0 };
      out.push(cur);
    } else if (cur) {
      cur.n += l.replace(/\s/g, "").length;
    }
  });
  return out;
}

// Alignement optimal (LCS) → { paires, manquants, enTrop }.
function aligner(a, b) {
  const n = a.length, m = b.length;
  const T = Array.from({ length: n + 1 }, function() { return new Int32Array(m + 1); });
  for (let x = n - 1; x >= 0; x--) {
    for (let y = m - 1; y >= 0; y--) {
      T[x][y] = a[x].sig === b[y].sig ? T[x + 1][y + 1] + 1 : Math.max(T[x + 1][y], T[x][y + 1]);
    }
  }
  const paires = [], manquants = [], enTrop = [];
  let x = 0, y = 0;
  while (x < n && y < m) {
    if (a[x].sig === b[y].sig) paires.push([a[x++], b[y++]]);
    else if (T[x + 1][y] >= T[x][y + 1]) manquants.push(a[x++]);
    else enTrop.push(b[y++]);
  }
  while (x < n) manquants.push(a[x++]);
  while (y < m) enTrop.push(b[y++]);
  return { paires: paires, manquants: manquants, enTrop: enTrop };
}

// Compare une traduction à la référence → liste de problèmes (chaînes).
function comparer(fr, trad, lang) {
  const pbs = [];
  const r = aligner(sections(fr), sections(trad));
  r.manquants.forEach(function(s) {
    pbs.push(lang + " : section ABSENTE — « " + "#".repeat(s.lvl) + " " + s.txt + " » (FR l." + s.i + ")");
  });
  r.enTrop.forEach(function(s) {
    pbs.push(lang + " : section SANS ÉQUIVALENT FR — « " + "#".repeat(s.lvl) + " " + s.txt + " » (l." + s.i + ")");
  });
  r.paires.forEach(function(p) {
    const f = p[0], t = p[1];
    if (f.n >= MIN_FR && t.n < SEUIL * f.n) {
      pbs.push(lang + " : section INCOMPLÈTE (" + Math.round(100 * t.n / f.n) + " % du FR) — « " + f.txt +
               " » (FR l." + f.i + " → " + lang + " l." + t.i + ")");
    }
  });
  return pbs;
}

let ko = 0;
function t(nom, ok) { console.log((ok ? "✅" : "❌") + " " + nom); if (!ok) ko++; }

// ── Auto-test : le contrôle doit ROUGIR sur des guides sabotés ──
(function autoTest() {
  const long = "x".repeat(400);
  const ref = "# 📚 Guide\n\n" + long + "\n\n## 🧭 Tracker\n\n" + long + "\n\n## 🪧 Guidage\n\n" + long + "\n";
  t("auto-test : un guide identique passe", comparer(ref, ref, "xx").length === 0);
  const sansSection = "# 📚 Guide\n\n" + long + "\n\n## 🧭 Tracker\n\n" + long + "\n";
  const p1 = comparer(ref, sansSection, "xx");
  t("🩸 auto-test : une section absente est détectée ET nommée", p1.length === 1 && /ABSENTE.*Guidage/.test(p1[0]));
  const courte = ref.replace("## 🧭 Tracker\n\n" + long, "## 🧭 Tracker\n\n" + "x".repeat(200));
  const p2 = comparer(ref, courte, "xx");
  t("🩸 auto-test : une section à 50 % est détectée", p2.length === 1 && /INCOMPLÈTE \(50 % du FR\)/.test(p2[0]));
  const traduite = ref.replace("Guidage", "Guidance").replace("Tracker", "Rastreador");
  t("auto-test : un titre traduit (même émoji) n'est pas une différence", comparer(ref, traduite, "xx").length === 0);
  const decale = "# 📚 Guide\n\n" + long + "\n\n## 🪧 Guidage\n\n" + long + "\n\n## 🧭 Tracker\n\n" + long + "\n";
  t("🩸 auto-test : deux sections interverties sont détectées", comparer(ref, decale, "xx").length > 0);
})();

// ── Les vrais guides ──
const fr = fs.readFileSync(path.join(DIR, "README_USER.md"), "utf8");
["en", "es"].forEach(function(lang) {
  const trad = fs.readFileSync(path.join(DIR, "README_USER." + lang + ".md"), "utf8");
  const pbs = comparer(fr, trad, lang);
  if (!pbs.length) {
    t(lang + " : mêmes sections que le FR, aucune sous " + Math.round(SEUIL * 100) + " % du FR", true);
  } else {
    pbs.forEach(function(p) { t(p, false); });
  }
});

if (ko) {
  console.log("\n⚠️ " + ko + " écart(s) entre les guides utilisateur. Les 3 langues sont servies dans l'app :" +
              "\n   mets à jour README_USER.en.md et README_USER.es.md dans le même commit que le FR.");
} else {
  console.log("\n🎉 guides utilisateur : FR / EN / ES alignés");
}
process.exit(ko ? 1 : 0);
