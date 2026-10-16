#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📦 check-import-masse.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// L'import multiple (v1.94.0) : N archives ajoutées à la liste des plans,
// SANS qu'aucune ne s'ouvre.
//
// 🩸 CE QUI RÉGRESSE SANS BRUIT :
//   1. Le module se remet à OUVRIR un plan. C'était le chemin d'origine et le
//      seul qui existait : un appel à `startImportedPlan` et l'import de vingt
//      archives ouvre vingt fois l'application.
//   2. Le traitement passe en parallèle. Vingt archives de 30 Mo chargées
//      ensemble font tomber un téléphone avant la cinquième — et ça ne se voit
//      que sur l'appareil de quelqu'un d'autre.
//   3. Une entrée survit à un stockage raté : la liste montre un plan que rien
//      ne peut ouvrir, et l'utilisateur ne sait pas lequel.
//   4. Le défaut sur les doublons bascule vers « remplacer » : un import écrase
//      alors des plans existants sans que personne l'ait demandé.
//   5. La marge de quota disparaît : on remplit jusqu'au refus du navigateur,
//      donc on s'arrête au milieu au lieu de prévenir avant.
//   6. Le ZIP est rangé mais l'entrée ne le DIT pas (v1.94.0, trouvé le
//      15/09 : KARMA « pas besoin de sélectionner le zip si le plan a été
//      ajouté à la liste »). Sans `storedBlob`, homeLoader redemande le
//      fichier et la copie en IndexedDB est orpheline.
//   7. La « référence disque » revient (`saveHandle`, `showOpenFilePicker`).
//      Retirée le 15/09 avec le bouton 🔐 de l'accueil : à l'ouverture la
//      copie passe avant elle, et elle ne sert même pas de secours. Deux
//      mécanismes pour un seul effet.
//
// ON EXÉCUTE les deux décisions, extraites du fichier réel (leçon v1.90.15).
// Usage : node scripts/check-import-masse.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

const M    = lire("js/importMasse.js");
const IDX  = lire("index.html");
const HOME = lire("js/homeLoader.js");
const SW   = lire("sw.js");

// ---------- 1. La décision sur les doublons, exécutée ----------
{
  const i = M.indexOf("function _deciderDoublon(");
  const j = M.indexOf("\n  }\n", i);
  const src = (i >= 0 && j > i) ? M.slice(i, j + 4) : "";
  t("la décision sur les doublons est extractible", src.length > 0);
  if (src) {
    const sb = { out: null };
    let err = null;
    try { vm.runInNewContext(src, sb, { filename: "impmasse.doublon.js" }); } catch (e) { err = e.message; }
    t("🩸 …et s'exécute sans erreur" + (err ? " — " + err : ""), !err);
    const jouer = function (pol, id, existants) {
      const s2 = Object.assign({}, sb);
      vm.runInNewContext(src + "\nout = _deciderDoublon(pol, id, ex);",
        Object.assign(s2, { pol: pol, id: id, ex: existants }), { filename: "impmasse.doublon.run.js" });
      return s2.out;
    };
    t("un plan absent s'ajoute, quelle que soit la politique",
      jouer("ignorer", "local_a", ["local_b"]).action === "ajouter" &&
      jouer("remplacer", "local_a", []).action === "ajouter");
    t("🩸 DÉFAUT : un plan déjà là est LAISSÉ TEL QUEL (un import n'écrase rien sans qu'on le demande)",
      jouer("ignorer", "local_a", ["local_a"]).action === "ignorer");
    t("« remplacer » réécrit la MÊME entrée (même id, même place dans la liste)",
      (function () { const r = jouer("remplacer", "local_a", ["local_a"]); return r.action === "remplacer" && r.id === "local_a"; })());
    t("🩸 « garder les deux » forge un id LIBRE, sans écraser un doublon précédent",
      jouer("doubler", "local_a", ["local_a"]).id === "local_a_2" &&
      jouer("doubler", "local_a", ["local_a", "local_a_2"]).id === "local_a_3" &&
      jouer("doubler", "local_a", ["local_a", "local_a_2", "local_a_3"]).id === "local_a_4");
    t("une politique inconnue retombe sur le choix le plus sûr (ignorer)",
      jouer("nimporte-quoi", "local_a", ["local_a"]).action === "ignorer");
    t("liste d'ids absente ou vide : on ajoute, sans planter",
      jouer("ignorer", "local_a", null).action === "ajouter" && jouer("ignorer", "local_a", []).action === "ajouter");
  }
}

// ---------- 2. La décision sur la place, exécutée ----------
{
  const i = M.indexOf("function _verdictPlace(");
  const j = M.indexOf("\n  }\n", i);
  const src = (i >= 0 && j > i) ? M.slice(i, j + 4) : "";
  const marge = Number((M.match(/const MARGE_QUOTA = ([\d.]+)/) || [])[1]);
  t("la décision sur la place est extractible", src.length > 0);
  t("🩸 une MARGE de sécurité existe et reste < 1 (un navigateur refuse avant son quota annoncé)",
    Number.isFinite(marge) && marge > 0 && marge < 1);
  if (src && Number.isFinite(marge)) {
    const jouer = function (aStocker, dispo, quota) {
      const sb = { MARGE_QUOTA: marge, out: null };
      vm.runInNewContext(src + "\nout = _verdictPlace(a, d, q);",
        Object.assign(sb, { a: aStocker, d: dispo, q: quota }), { filename: "impmasse.place.js" });
      return sb.out;
    };
    const Mo = 1024 * 1024;
    t("ce qui tient largement passe", jouer(10 * Mo, 100 * Mo, 200 * Mo).ok === true);
    t("🩸 ce qui dépasse la place disponible est REFUSÉ AVANT de commencer",
      jouer(300 * Mo, 100 * Mo, 200 * Mo).ok === false);
    t("🩸 …et la marge mord : 95 Mo à copier dans 100 Mo libres est refusé",
      jouer(95 * Mo, 100 * Mo, 200 * Mo).ok === false);
    t("rien à copier (tout en accès permanent) : la place n'est pas un sujet", jouer(0, 1, 1).ok === true);
    t("place inconnue (navigateur qui ne la dit pas) : on laisse faire plutôt que de bloquer à tort",
      jouer(10 * Mo, NaN, NaN).ok === true);
    t("le refus dit COMBIEN il manque", (function () { const r = jouer(300 * Mo, 100 * Mo, 200 * Mo); return Number(r.manque) > 0; })());
  }
}

// ---------- 3. Le module n'ouvre JAMAIS de plan ----------
{
  const sansCommentaires = M.split("\n").filter(function (l) { return !/^\s*\/\//.test(l); }).join("\n");
  t("🩸 aucun appel à startImportedPlan (ce serait ouvrir le plan)", !/startImportedPlan\s*\(/.test(sansCommentaires));
  t("🩸 aucun appel à lancerApplication ni à chargerZipFichier",
    !/lancerApplication\s*\(/.test(sansCommentaires) && !/chargerZipFichier\s*\(/.test(sansCommentaires));
  t("le module écrit bien dans le registre et range le fichier (copie)",
    /PlanRegistry\.addOrUpdate\(/.test(M) && /PlanRegistry\.saveBlob\(/.test(M));
  t("🩸 aucune référence disque : ni saveHandle ni showOpenFilePicker (un seul mécanisme, la copie)",
    !/saveHandle\s*\(/.test(sansCommentaires) && !/showOpenFilePicker/.test(sansCommentaires));
  t("le contrôle de blocage est appliqué par fichier", /PlanDenylist[\s\S]{0,120}isPlanDenied\(f\)/.test(M));
  // 🩸 Chromium range un File PAR RÉFÉRENCE au disque : sans
  // copie réelle, les plans importés meurent dès que leurs ZIP bougent.
  const PR = lire("js/planRegistry.js");
  t("🩸 PlanRegistry.saveBlob range une COPIE (File → arrayBuffer → Blob), jamais une référence disque",
    /async function saveBlob\([\s\S]{0,1600}instanceof File[\s\S]{0,200}await blob\.arrayBuffer\(\)/.test(PR));
  t("🩸 à l'ouverture, un blob mémorisé est SONDÉ avant d'être cru (sinon « archive illisible » au lieu de la re-sélection)",
    /getBlob\(plan\.id\);[\s\S]{0,900}blob\.slice\(0, 4\)\.arrayBuffer\(\)[\s\S]{0,400}afficherModalePlanIntrouvable\(plan, "local-blob"\)/.test(HOME));
}

// ---------- 4. Un fichier à la fois, et rien de mort dans la liste ----------
{
  // 🩸 Repère NON AMBIGU : « window.ImportMasse = { » apparaît aussi dans le
  // commentaire d'en-tête qui documente l'API, DONC avant la fonction — la
  // tranche sortait vide et cinq contrôles passaient au vert sans rien lire.
  const imp = M.slice(M.indexOf("async function importer("), M.indexOf("\n  window.ImportMasse = {"));
  t("importer() est extractible", imp.length > 0);
  t("🩸 les fichiers sont traités UN PAR UN (aucun Promise.all sur le lot)",
    /for \(const ligne of plan\.lignes\)/.test(imp) && !/Promise\.all/.test(imp));
  t("🩸 un stockage raté RETIRE l'entrée (pas de ligne morte dans la liste)",
    /PlanRegistry\.remove\(ligne\.id\)/.test(imp));
  t("🩸 …et l'import s'ARRÊTE net, en gardant ce qui est déjà entré",
    /rapport\.arrete = \{ apres: i - 1, motif: motif \};/.test(imp) && /return rapport;/.test(imp));
  t("l'avancement est annoncé fichier par fichier", /onProgres\(\{ i: i, total: aFaire\.length/.test(imp));
  const ana = M.slice(M.indexOf("async function analyser("), M.indexOf("async function importer("));
  t("🩸 l'analyse n'écrit RIEN (elle prépare, elle ne range pas)",
    !/addOrUpdate\(/.test(ana) && !/saveBlob\(/.test(ana) && !/saveHandle\(/.test(ana));
}

// ---------- 6. Le ZIP rangé est RETROUVÉ par la liste (importer() exécuté) ----------
// On EXÉCUTE importer() avec un registre factice : c'est la seule preuve que
// le drapeau est posé sur l'entrée, et seulement après un rangement réussi.
async function section6() {
  const i = M.indexOf("async function importer(");
  const j = M.indexOf("\n  }\n", i);
  const src = (i >= 0 && j > i) ? M.slice(i, j + 4) : "";
  t("importer() est extractible seule", src.length > 0);
  if (!src) return;

  function jouer(scenario) {
    const journal = { entrees: {}, saveBlob: 0, saveHandle: 0, remove: 0, persist: 0 };
    const reg = {
      hasFsAccess: function () { return !!scenario.fs; },
      addOrUpdate: function (p) { journal.entrees[p.id] = Object.assign(journal.entrees[p.id] || {}, p); },
      remove: function (id) { journal.remove++; delete journal.entrees[id]; },
      requestPersistentStorage: async function () { journal.persist++; },
      saveHandle: async function () { journal.saveHandle++; return true; },
      saveBlob: async function () { journal.saveBlob++; return scenario.blobOk === false ? { ok: false, error: "impmasse.err.stockage" } : { ok: true }; }
    };
    const sb = { window: { PlanRegistry: reg }, console: { warn: function () {} }, out: null };
    const ligne = { id: "local_a", fichier: "a.zip", taille: 10, blob: {},
                    info: { name: "A", version: "1" }, action: "ajouter" };
    const plan = { lignes: [ligne] };
    vm.runInNewContext(src + "\nout = importer(plan, opts);",
      Object.assign(sb, { plan: plan, opts: scenario.opts || {} }), { filename: "impmasse.importer.js" });
    return Promise.resolve(sb.out).then(function (rapport) { return { rapport: rapport, j: journal, ligne: ligne }; });
  }

  const a = await jouer({});
  t("🩸 DÉFAUT (sans option) : le ZIP est copié ET l'entrée porte storedBlob — la liste le retrouve",
    a.j.saveBlob === 1 && a.j.entrees.local_a && a.j.entrees.local_a.storedBlob === true && a.ligne.stockage === "copie");
  t("…et la persistance du stockage est demandée avant la première copie", a.j.persist === 1);

  const b = await jouer({ fs: true });
  t("🩸 même avec le sélecteur système disponible (Chrome/Edge) : COPIE, jamais de référence disque",
    b.j.saveBlob === 1 && b.j.saveHandle === 0 && b.j.entrees.local_a.storedBlob === true && !b.j.entrees.local_a.fsHandleId);

  const c = await jouer({ fs: true, opts: { precharger: false } });
  t("🩸 « Mémoriser les plans » DÉCOCHÉ : pas de copie, l'entrée seule, aucun drapeau",
    c.j.saveBlob === 0 && c.j.persist === 0 && c.j.entrees.local_a &&
    !c.j.entrees.local_a.storedBlob && c.rapport.ajoutes.length === 1);

  const d = await jouer({ blobOk: false });
  t("🩸 copie ratée : l'entrée est RETIRÉE, aucun drapeau ne survit, l'import s'arrête",
    d.j.remove === 1 && !d.j.entrees.local_a && d.rapport.arrete && d.rapport.ajoutes.length === 0);

  t("🩸 la case « Mémoriser les plans dans l'app » suit le réglage de l'accueil, VRAI par défaut",
    /id="kta-impm-precharger"' \+ \(_precharger \? ' checked' : ''\)/.test(M) &&
    /function _memoriserParDefaut\(\)[\s\S]{0,200}ktaMemoriserPlanActif[\s\S]{0,80}: true;/.test(M) &&
    /_precharger = _memoriserParDefaut\(\)/.test(M));
  t("l'écran transmet l'option à importer()", /precharger: _precharger/.test(M));
  t("sans préchargement, le résumé ne parle pas de copie", /impmasse\.resume\.poidsSansCopie/.test(M));
}

// ---------- 5. Après l'import, on reste à l'accueil ----------
{
  const lan = M.slice(M.indexOf("async function _lancer()"), M.indexOf("function ouvrir()"));
  t("🩸 la liste des plans est rafraîchie (sinon l'import a l'air de n'avoir rien fait)",
    /rafraichirListePlans|afficherLoader/.test(lan));
  t("la vue OSM de l'accueil est prévenue (les nouveaux plans géoréférencés y entrent)",
    /OsmHomePreview[\s\S]{0,80}refresh\(\)/.test(lan));
  // 🩸 KARMA, 15/09/2026 : « ce bouton ne fonctionne pas ». Le bouton de fin
  // restait DÉSACTIVÉ avec le libellé « Terminé », tout en gardant l'aspect
  // plein d'un bouton actif. Un bouton qui invite à cliquer doit agir.
  t("🩸 le bouton de fin d'import est RÉACTIVÉ (il ne reste pas mort à l'écran)",
    /btn\.disabled = false;/.test(lan) && /dataset\.fini = "1"/.test(lan));
  t("🩸 …et il FAIT quelque chose : il ferme, la liste étant déjà rafraîchie",
    /dataset\.fini === "1"\) \{ _fermer\(\); return; \}/.test(M));
  t("son libellé dit l'action, pas seulement l'état",
    /impmasse\.btn\.voir/.test(M) && /impmasse\.btn\.fermerRien/.test(M));
  // « Fermer » et « Voir mes plans » faisaient la même chose.
  t("🩸 une fois l'import fini, UNE seule sortie en pied : le « Fermer » secondaire disparaît",
    /_zone\("kta-impm-fermer"\)[\s\S]{0,80}style\.display = "none"/.test(lan));
}

// ---------- 6. Le bouton, le câblage, le chargement ----------
{
  t("📦 le bouton existe au HOME", IDX.indexOf('id="loaderImportMasseBtn"') >= 0);
  // KARMA a déplacé le bouton : « mets ce bouton dans OUTILS
  // (car pas forcément utilisé bcp) ». Il était au-dessus de l'accès permanent,
  // donc entre la zone de dépôt et « Charger ce plan » — deux gestes
  // quotidiens encadrant un outil occasionnel. La règle CHANGE avec la
  // décision : il doit vivre dans la section Outils, pas ailleurs.
  t("🩸 …dans la section 🧰 Outils, avec les outils occasionnels",
    (function () {
      const iOutils = IDX.indexOf('data-i18n="home.tools.title"');
      const iFin    = IDX.indexOf("</div><!-- /.loader-col-actions -->");
      const iBtn    = IDX.indexOf('id="loaderImportMasseBtn"');
      return iOutils > 0 && iBtn > iOutils && (iFin < 0 || iBtn < iFin);
    })());
  t("il porte le style commun des outils (pas un bloc à lui)",
    /class="loader-btn-secondary"[^>]*id="loaderImportMasseBtn"/.test(IDX));
  t("il est câblé, et le DIT si le module manque",
    /loaderImportMasseBtn/.test(HOME) && /ImportMasse\.ouvrir\(\)/.test(HOME) && /impmasse\.indispo/.test(HOME));
  t("🩸 le module est chargé AVANT homeLoader, qui câble son bouton",
    IDX.indexOf("js/importMasse.js") > 0 && IDX.indexOf("js/importMasse.js") < IDX.indexOf("js/homeLoader.js"));
  t("il est précaché (l'app reste installable hors ligne)", SW.indexOf('"./js/importMasse.js"') >= 0);
}

// ---------- 7. Les textes ----------
{
  const CLES = ["impmasse.titre", "impmasse.intro", "impmasse.btn.ouvrir", "impmasse.btn.choisir",
                "impmasse.btn.lancer", "impmasse.politique.titre", "impmasse.politique.ignorer",
                "impmasse.politique.remplacer", "impmasse.politique.doubler", "impmasse.place.refus",
                "impmasse.prog", "impmasse.fini", "impmasse.arrete", "impmasse.indispo",
                "impmasse.err.pasUnPlan", "impmasse.err.zipIllisible", "impmasse.err.bloque"];
  ["fr", "en", "es"].forEach(function (l) {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    const manque = CLES.filter(function (k) { return typeof d[k] !== "string"; });
    t("🌍 " + l + " : les textes de l'import multiple" + (manque.length ? " — manquants : " + manque.join(", ") : ""),
      manque.length === 0);
  });
  // Toute clé d'erreur levée par le module doit exister : un refus qui affiche
  // sa clé brute ne dit rien à personne.
  const levees = (M.match(/new Error\("(impmasse\.err\.[a-zA-Z]+)"\)/g) || [])
    .map(function (s) { return (s.match(/"([^"]+)"/) || [])[1]; });
  const fr = JSON.parse(lire("lang/fr.json"));
  const sansTexte = levees.filter(function (k) { return typeof fr[k] !== "string"; });
  t("🩸 chacune des " + levees.length + " raisons de refus a un texte" +
    (sansTexte.length ? " — sans texte : " + sansTexte.join(", ") : ""), sansTexte.length === 0);
}

section6().catch(function (e) { t("🩸 section 6 : importer() s'exécute — " + e.message, false); }).then(function () {
  console.log("");
  if (echecs) { console.log("💥 import multiple : " + echecs + " contrôle(s) en échec"); process.exit(1); }
  console.log("🎉 import multiple : N plans entrent dans la liste, aucun ne s'ouvre, le ZIP rangé est retrouvé, et la place est annoncée avant");
});
