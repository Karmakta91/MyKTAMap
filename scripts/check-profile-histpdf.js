#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-profile-histpdf.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Verrouille le transport des PDF du Mode Histoire dans l'export de profil
// (sans lui, les Récits arrivent sur un autre appareil sans leurs documents).
// Vérifie, sur le code réel de profileExportImport.js et journalUi.js :
//   A. section OPT-IN strict (`=== true`) : un plan peut porter 100 Mo de PDF ;
//   B. branchée aux 5 points de l'UI (collecte, estimation, ligne d'export,
//      récap, aperçu d'import) — un oubli = case sans effet ou données perdues ;
//   C. restauration par `JournalUi.histoire.restaurer`, jamais une 3ᵉ copie du
//      schéma IDB (déjà dupliqué entre modeHistoire.js et journalUi.js) ;
//   D. `put` et non `add` : réimporter le même profil ne crée pas de doublons ;
//   E. garde « base v1 » des deux côtés : un document v2 écrit dans une base v1
//      (keyPath planId) écrase le PDF existant du plan.
// ⚠️ Contrôles statiques : le câblage, pas l'aller-retour réel d'un gros PDF.
// =====================================================================

const fs = require("fs");

const PROFIL = "js/profileExportImport.js";
const JOURNAL = "js/journalUi.js";

let src, jsrc;
try {
  src = fs.readFileSync(PROFIL, "utf8");
  jsrc = fs.readFileSync(JOURNAL, "utf8");
} catch (e) {
  console.error("❌ [check-profile-histpdf] fichier illisible : " + e.message);
  process.exit(2);
}

const echecs = [];
function verif(nom, ok, aide) {
  console.log((ok ? "✅ " : "❌ ") + nom);
  if (!ok) echecs.push(aide);
}

// ── A. opt-in strict ──────────────────────────────────────────────────
verif(
  "la section est OPT-IN strict (=== true) à l'export",
  // 🩸 La garde doit être ACCOLÉE À L'AFFECTATION : la chaîne seule figure
  // aussi dans un commentaire d'en-tête, et le test resterait vert avec une
  // collecte passée à `!== false`.
  /if \(include\.histoirePdfs === true\)\s*profile\.sections\.histoirePdfs/.test(src),
  "La collecte doit être gardée par `include.histoirePdfs === true`. Un plan peut " +
  "porter 100 Mo de PDF : cochée par défaut, elle ferait exploser des exports sans prévenir."
);
verif(
  "décochée par défaut dans la ligne d'export",
  // 🩸 Pas `[^)]*?` : les arguments contiennent des `T("…")`, la classe
  // s'arrêterait à la première `)` et échouerait sur du code correct.
  /_renderSectionRow\("histoirePdfs"[\s\S]{0,200}?,\s*false\s*,/.test(src),
  "La ligne d'export doit passer `false` en 5e argument (= case décochée). " +
  "C'est le même régime que les photos, et pour la même raison : le poids."
);
verif(
  "décochée par défaut à l'import",
  /histoirePdfs:\s*false/.test(src),
  "Les défauts d'`applyProfile` doivent porter `histoirePdfs: false`."
);

// ── B. les 5 points de branchement ────────────────────────────────────
const POINTS = [
  // (estExt) : la modale d'export saute les plans ☁️ d'une organisation
  ["collecte",          /profile\.sections\.histoirePdfs\s*=\s*await _collectHistoirePdfs\((?:estExt)?\)/],
  ["estimation taille", /sizes\.histoirePdfs\s*=\s*\{/],
  ["ligne d'export",    /_renderSectionRow\("histoirePdfs"/],
  ["récap final",       /histoirePdfs:\s*"📄/],
  ["aperçu d'import",   /_renderImportSection\("histoirePdfs"/]
];
POINTS.forEach(function (p) {
  verif("branché : " + p[0], p[1].test(src),
        "Point de branchement manquant : " + p[0] + ". Une section à moitié câblée donne " +
        "soit une case sans effet, soit des données exportées qui ne reviennent jamais.");
});

// ── C. pas de 3e copie du schéma IDB ──────────────────────────────────
verif(
  "aucune réécriture du schéma IDB histoire dans " + PROFIL,
  !/myktamap_histoire_pdfs/.test(src),
  "`" + PROFIL + "` ne doit JAMAIS rouvrir la base `myktamap_histoire_pdfs` lui-même : " +
  "le schéma est déjà dupliqué entre modeHistoire.js et journalUi.js. Passe par " +
  "`window.JournalUi.histoire`. (Piège concret : `indexedDB.open(nom)` SANS version " +
  "CRÉE une base vide et casse ensuite le Mode Histoire — `_histOpen` gère déjà ce cas.)"
);
verif(
  "la restauration passe par JournalUi.histoire.restaurer",
  /window\.JournalUi\.histoire\.restaurer/.test(src),
  "L'import doit appeler `window.JournalUi.histoire.restaurer(...)`."
);
verif(
  "JournalUi expose bien l'API histoire (lister/getDoc/restaurer)",
  /histoire:\s*\{[\s\S]{0,400}?lister:[\s\S]{0,200}?getDoc:[\s\S]{0,200}?restaurer:/.test(jsrc),
  "`window.JournalUi.histoire` doit exposer `lister`, `getDoc` et `restaurer` — " +
  "sinon l'export de profil ne peut plus lire ni reposer les documents."
);

// ── D. idempotence ────────────────────────────────────────────────────
const mRest = /function _histRestaurer\([\s\S]*?\n  \}/.exec(jsrc);
verif(
  "restaurer() utilise put (idempotent), pas add",
  !!mRest && /\.put\(/.test(mRest[0]) && !/\bst\.add\(/.test(mRest[0]),
  "`_histRestaurer` doit faire un `put` : avec `add`, réimporter deux fois le même " +
  "profil lèverait une erreur de clé dupliquée ou créerait des doublons."
);
verif(
  "restaurer() conserve l'id, le nom et la date d'origine",
  !!mRest && /id:\s*String\(doc\.id\)/.test(mRest[0]) && /addedAt:\s*doc\.addedAt/.test(mRest[0]),
  "`_histRestaurer` doit reposer l'id ET la date d'origine. Sinon un réimport " +
  "renomme les documents et écrase toutes les dates d'ajout par celle de l'import."
);

// ── E. garde base v1 des deux côtés ───────────────────────────────────
verif(
  "garde 'base v1' dans _histRestaurer",
  !!mRest && /indexNames\.contains\(HIST_INDEX\)/.test(mRest[0]),
  "Sans ce garde, écrire un document v2 dans une base encore en v1 (keyPath planId) " +
  "ÉCRASE le PDF existant du plan."
);
verif(
  "l'import signale le cas v1 au lieu de l'ignorer",
  /histoirePdfs:v1/.test(src),
  "Quand la base est en v1, l'import doit le SIGNALER (warning) et s'arrêter : " +
  "échouer en silence sur des documents que l'utilisateur croit restaurés est pire " +
  "que de ne rien faire."
);

if (!echecs.length) {
  console.log("\n🎉 PDF du Mode Histoire : transport de profil câblé, opt-in, idempotent");
  process.exit(0);
}
console.log("\n============================================================");
console.log("🛑 COMMIT REFUSÉ — transport des PDF du Mode Histoire cassé");
console.log("============================================================");
echecs.forEach(function (a) { console.log("\n   • " + a); });
console.log("");
process.exit(1);
