#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📌 check-repositionner.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Le repositionnement d'un POI de session (KARMA, 05/09 : « si le POI a été
// mal mis »). Septième picker « clic carte » du code, et le premier qui MUTE
// un objet de la session au lieu de remplir un champ de formulaire — d'où les
// pièges qui lui sont propres.
//
// 🩸 CE QUI RÉGRESSE ICI, ET SANS BRUIT :
//
//   1. LA CONVERSION INVERSE. `convertCoord(x, y) = [imageHeight - y, x]`.
//      Le picker fait le chemin retour. Inverser lat et lng, ou oublier le
//      `imageHeight - `, déplace le point AILLEURS que sous le doigt — et
//      comme le marqueur se re-rend à la nouvelle position, ça a l'air
//      volontaire. Le contrôle refait le tour complet.
//
//   2. L'INDEX PÉRIMÉ. Entre l'armement du mode et le clic, l'utilisateur
//      peut supprimer un autre point, vider sa session, recharger le plan.
//      Un index capturé à l'armement désignerait alors le MAUVAIS point : on
//      en déplacerait un au hasard. Le point est donc re-cherché au clic.
//
//   3. LA MARQUE DE CALQUE ET LE NIVEAU. Le point doit être muté EN PLACE :
//      s'il était reconstruit, il perdrait `_srcCalque` (→ doublon à la
//      restauration du calque, cf. check-calque-session.js) et son `level`
//      (→ téléporté d'étage en douce sur un plan multi-niveau).
//
//   4. LES LIAISONS INTER-PLAN. Elles sont indexées par `id:<id>`, donc elles
//      SURVIVENT au déplacement — mais elles stockent AUSSI les coordonnées,
//      qui servent au tracé du lien à l'export KMZ. Sans recalage, le lien
//      part de l'ancienne position dans le KMZ, et rien ne le dit.
//
//   5. LE DÉMONTAGE. Un handler `click` laissé sur la map déplacerait le
//      point au clic suivant, longtemps après la fermeture du floater.
//
//   6. LA CLASSE DU FLOATER. `.kta-iti-floater` n'est pas cosmétique :
//      `_modeClicCarteActif()` (utils.js) la reconnaît, ce qui empêche les
//      popups d'annotation pendant le mode et fait ré-émettre le clic en
//      phase capture (map.js). La renommer casserait le mode en silence.
//
// Le code est CHARGÉ dans un `vm` (pas recopié) : s'il change, c'est la
// nouvelle version qui est éprouvée.
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const SRC = fs.readFileSync("js/editor.js", "utf8");

// ───────── bouchons : le minimum pour monter le picker ─────────
function contexte(hauteur) {
  const noeuds = {};                 // id -> element (le "DOM")
  function creer() {
    const el = {
      style: {}, className: "", id: "", textContent: "", _html: "",
      _enfants: {}, _clics: [],
      set innerHTML(v) {
        el._html = v;
        // Le picker interroge son propre floater : on rend les 3 noeuds qu'il
        // vient de declarer, reperes par leur classe ou leur id.
        el._enfants[".kta-iti-floater-msg"] = creer();
        el._enfants["#kta-repo-cancel"]     = creer();
      },
      get innerHTML() { return el._html; },
      querySelector: (sel) => el._enfants[sel] || null,
      addEventListener: (ev, fn) => { if (ev === "click") el._clics.push(fn); },
      appendChild() {},
      remove() { if (el.id) delete noeuds[el.id]; el._retire = true; }
    };
    return el;
  }
  const ecoutes = {};
  const map = {
    on: (ev, fn) => { (ecoutes[ev] = ecoutes[ev] || []).push(fn); },
    off: (ev, fn) => { ecoutes[ev] = (ecoutes[ev] || []).filter((f) => f !== fn); },
    closePopup() { map._popupsFermees = (map._popupsFermees || 0) + 1; }
  };
  const journal = { record: [], captures: 0, liens: [] };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, JSON, Math, Array, Object, String, Number, Date, RegExp,
    document: {
      createElement: creer,
      getElementById: (id) => noeuds[id] || null,
      body: { appendChild(el) { if (el.id) noeuds[el.id] = el; }, classList: { contains: () => false } },
      querySelector: () => null,
      querySelectorAll: () => []
    },
    L: { marker: () => ({ addTo: () => ({}), on: () => ({}), bindPopup: () => ({}) }), divIcon: () => ({}) },
    APP_CONFIG: { imageHeight: hauteur, activeLevel: 0 },
    I18n: { t: (k, p) => k + (p && p.nom ? ":" + p.nom : "") },
    HistoryManager: {
      captureState: (cat) => { journal.captures++; return { cat: cat }; },
      record: (label, avant, cat) => { journal.record.push({ label: label, avant: avant, cat: cat }); }
    },
    OOMGuard: { showToast: (m) => { journal.toast = m; } },
    InterPlanLinks: {
      onPointMoved: (planId, pt, ax, ay) => {
        journal.liens.push({ planId: planId, x: pt.x, y: pt.y, ancX: ax, ancY: ay });
        return 1;
      }
    },
    _currentLoadedPlanId: "plan-test",
    layerEditor: null,          // → renderEditorPoints sort tôt, pas de Leaflet à monter
    addEventListener() {}, removeEventListener() {}
  };
  ctx.window = ctx;
  ctx.map = map;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "editor.js" });
  return { ctx, map, ecoutes, journal, noeuds };
}

function pointDeBase() {
  return {
    id: "Puits nord", nom: "Puits nord", x: 10, y: 20,
    tags: ["entree"], level: -2, description: "note",
    _srcCalque: "sig"          // vient d'un calque ouvert à la modification
  };
}

// ───────── 1. surface d'API ─────────
{
  const { ctx } = contexte(1000);
  t("API : window.repositionnerPointEditor()", typeof ctx.repositionnerPointEditor === "function");
  t("API : window.repositionnerAnnuler()", typeof ctx.repositionnerAnnuler === "function");
}

// ───────── 2. armement ─────────
{
  const { ctx, map, ecoutes, noeuds } = contexte(1000);
  ctx.setEditorPoints([pointDeBase()]);

  ctx.repositionnerPointEditor("Puits nord", 10, 20);
  t("armer : pose UN listener `click` sur la map", (ecoutes.click || []).length === 1);
  t("armer : ferme la popup du point (sinon elle masque la carte)", map._popupsFermees === 1);

  const fl = noeuds["kta-repo-floater"];
  t("armer : le floater est dans le DOM", !!fl);
  // 🩸 C'est cette classe qui fait reconnaitre le mode par _modeClicCarteActif().
  t("🩸 armer : le floater porte la classe `kta-iti-floater`",
    !!fl && String(fl.className).indexOf("kta-iti-floater") >= 0);
  t("armer : le nom est injecté en TEXTE, jamais en HTML (XSS)",
    !!fl && String(fl._html).indexOf("Puits nord") < 0 &&
    String(fl.querySelector(".kta-iti-floater-msg").textContent).indexOf("Puits nord") >= 0);

  ctx.repositionnerPointEditor("Fantome", 999, 999);
  t("armer sur un point inconnu : refuse (aucun 2e listener)", (ecoutes.click || []).length === 1);
}

// ───────── 3. 🩸 le clic : la conversion inverse ─────────
{
  const H = 1000;
  const { ctx, ecoutes, journal, noeuds } = contexte(H);
  ctx.setEditorPoints([pointDeBase()]);
  ctx.repositionnerPointEditor("Puits nord", 10, 20);

  // 🩸 lat ET lng doivent DIFFERER, sinon les inverser ne casse rien et
  // l assertion ne prouve rien (piege tombe a la falsification du 05/09).
  // On vise le pixel plan (300, 250) : convertCoord = [1000-250, 300] = [750, 300].
  // Les centiemes servent a eprouver l arrondi pour de vrai.
  const cible = { x: 300.12, y: 249.75 };
  ecoutes.click[0]({ latlng: { lat: H - 249.753, lng: 300.1234 } });

  const pt = ctx.getEditorPoints()[0];
  t("🩸 clic : x = lng", pt.x === cible.x);
  t("🩸 clic : y = imageHeight - lat", pt.y === cible.y);
  t("clic : arrondi au centipixel (300.1234 -> 300.12)", pt.x === 300.12 && pt.y === 249.75);

  t("🩸 mutation EN PLACE : `_srcCalque` survit", pt._srcCalque === "sig");
  t("🩸 mutation EN PLACE : le `level` n'est PAS réattribué au niveau affiché", pt.level === -2);
  t("mutation EN PLACE : tags conservés", Array.isArray(pt.tags) && pt.tags[0] === "entree");
  t("mutation EN PLACE : description conservée", pt.description === "note");
  t("mutation EN PLACE : nom et id inchangés", pt.nom === "Puits nord" && pt.id === "Puits nord");
  t("un seul point en session (déplacé, pas dupliqué)", ctx.getEditorPoints().length === 1);

  t("undo : un snapshot est pris AVANT la mutation", journal.captures === 1);
  t("undo : l'action est enregistrée", journal.record.length === 1);
  t("undo : dans la catégorie `editorPoints`", journal.record[0].cat === "editorPoints");
  t("undo : le libellé nomme le point", String(journal.record[0].label).indexOf("Puits nord") >= 0);

  t("🩸 liaisons : InterPlanLinks est prévenu", journal.liens.length === 1);
  t("🩸 liaisons : avec les ANCIENNES coords (seule clé d'un point sans id)",
    journal.liens[0].ancX === 10 && journal.liens[0].ancY === 20);
  t("🩸 liaisons : et les NOUVELLES à écrire",
    journal.liens[0].x === cible.x && journal.liens[0].y === cible.y);
  t("liaisons : sur le plan courant", journal.liens[0].planId === "plan-test");

  t("🩸 démontage : le listener `click` est RETIRÉ", (ecoutes.click || []).length === 0);
  t("🩸 démontage : le floater est retiré du DOM", !noeuds["kta-repo-floater"]);
  t("retour : l'utilisateur est informé", String(journal.toast || "").indexOf("editor.repo.done") >= 0);
}

// ───────── 4. 🩸 l'index périmé ─────────
{
  // 🩸 CE TEST DOIT DISTINGUER TROIS INDEX DIFFERENTS, sinon il ne prouve
  // rien. Version initiale (05/09) : on visait un point qui se retrouvait
  // justement en index 0 apres coup — remplacer la recherche par `const i = 0`
  // tombait juste par accident et l assertion restait verte. Tautologie.
  //
  // Ici : on arme sur « sud » (index 1), puis DEUX points s inserent devant →
  // « sud » passe en index 3. Un index fige a l armement (1) toucherait
  // « nord », un index code en dur (0) toucherait « est ». Les trois cibles
  // sont distinctes, seule la vraie recherche tombe juste.
  const { ctx, ecoutes } = contexte(1000);
  const nord = pointDeBase();
  const sud  = { id: "Puits sud",  nom: "Puits sud",  x: 50, y: 60, tags: [], level: 0 };
  const est  = { id: "Puits est",  nom: "Puits est",  x: 70, y: 80, tags: [], level: 0 };
  const ouest= { id: "Puits ouest",nom: "Puits ouest",x: 90, y: 95, tags: [], level: 0 };
  ctx.setEditorPoints([nord, sud]);

  ctx.repositionnerPointEditor("Puits sud", 50, 60);      // index 1 a l armement
  ctx.setEditorPoints([est, ouest, nord, sud]);           // « sud » glisse en index 3
  ecoutes.click[0]({ latlng: { lat: 1000 - 700, lng: 300 } });

  const par = {};
  ctx.getEditorPoints().forEach(function (p) { par[p.id] = p; });
  t("🩸 index périmé : c'est bien « Puits sud » qui a bougé",
    par["Puits sud"].x === 300 && par["Puits sud"].y === 700);
  t("  -> l'index figé à l'armement (1) n'a PAS déplacé « Puits nord »",
    par["Puits nord"].x === 10 && par["Puits nord"].y === 20);
  t("  -> un index codé en dur (0) n'a PAS déplacé « Puits est »",
    par["Puits est"].x === 70 && par["Puits est"].y === 80);
  t("  -> « Puits ouest » est intact lui aussi",
    par["Puits ouest"].x === 90 && par["Puits ouest"].y === 95);
}
{
  const { ctx, ecoutes, journal, noeuds } = contexte(1000);
  ctx.setEditorPoints([pointDeBase()]);
  ctx.repositionnerPointEditor("Puits nord", 10, 20);
  ctx.setEditorPoints([]);                               // le point disparait entre-temps
  ecoutes.click[0]({ latlng: { lat: 300, lng: 300 } });

  t("🩸 point disparu pendant le mode : rien n'est déplacé", ctx.getEditorPoints().length === 0);
  t("  -> aucune entrée d'historique fantôme", journal.record.length === 0);
  t("  -> le mode se démonte quand même", (ecoutes.click || []).length === 0 && !noeuds["kta-repo-floater"]);
}

// ───────── 5. annulation ─────────
{
  const { ctx, ecoutes, journal, noeuds } = contexte(1000);
  ctx.setEditorPoints([pointDeBase()]);
  ctx.repositionnerPointEditor("Puits nord", 10, 20);

  noeuds["kta-repo-floater"].querySelector("#kta-repo-cancel")._clics[0]();
  t("annuler : le listener `click` est retiré", (ecoutes.click || []).length === 0);
  t("annuler : le floater disparaît", !noeuds["kta-repo-floater"]);
  t("annuler : le point n'a pas bougé",
    ctx.getEditorPoints()[0].x === 10 && ctx.getEditorPoints()[0].y === 20);
  t("annuler : rien dans l'historique", journal.record.length === 0);
}

// ───────── 6. ré-armement : pas d'empilement de listeners ─────────
{
  const { ctx, ecoutes } = contexte(1000);
  ctx.setEditorPoints([pointDeBase()]);
  ctx.repositionnerPointEditor("Puits nord", 10, 20);
  ctx.repositionnerPointEditor("Puits nord", 10, 20);
  ctx.repositionnerPointEditor("Puits nord", 10, 20);
  t("🩸 ré-armer 3× : UN SEUL listener `click` (sinon 1 clic = N déplacements)",
    (ecoutes.click || []).length === 1);
}

// ───────── 7. le repli sans géoréf / sans dépendances ─────────
{
  const { ctx, ecoutes } = contexte(undefined);   // pas d'imageHeight
  ctx.setEditorPoints([pointDeBase()]);
  ctx.HistoryManager = null;
  ctx.InterPlanLinks = null;
  ctx.OOMGuard = null;
  ctx.repositionnerPointEditor("Puits nord", 10, 20);
  ecoutes.click[0]({ latlng: { lat: 42, lng: 300 } });
  const pt = ctx.getEditorPoints()[0];
  t("sans imageHeight : y retombe sur lat brut, sans planter", pt.x === 300 && pt.y === 42);
  t("sans HistoryManager / InterPlanLinks / OOMGuard : aucun crash", (ecoutes.click || []).length === 0);
}

// ───────── 8. le lookup partagé sert bien les trois actions ─────────
{
  const SRC_TXT = SRC;
  const n = (SRC_TXT.match(/_indexPointSession\(/g) || []).length;
  t("lookup partagé : `_indexPointSession` est utilisé par les 3 actions + le clic (" + n + " appels)", n >= 5);
  t("lookup partagé : plus aucune copie de la boucle de recherche",
    (SRC_TXT.match(/Fallback : match par coords seules/g) || []).length === 0);
}

// ───────── 9. le câblage, que l'extraction ne voit pas ─────────
{
  const UTILS = fs.readFileSync("js/utils.js", "utf8");
  const LIENS = fs.readFileSync("js/interPlanLinks.js", "utf8");

  t("câblage : le bouton est dans la popup d'un point",
    UTILS.indexOf("window.repositionnerPointEditor(") >= 0);
  // 🩸 Le bouton doit vivre dans `editRow`, gouverne par showSessionActions :
  // pose ailleurs, il apparaitrait sur les points de calque en lecture seule,
  // ou les points ne seraient pas dans listePoints -> bouton mort.
  const iEdit = UTILS.indexOf("const editRow = showSessionActions");
  const iDel  = UTILS.indexOf("const deleteRow = showSessionActions");
  const iRepo = UTILS.indexOf("window.repositionnerPointEditor(");
  t("🩸 câblage : le bouton est dans `editRow` (réservé aux points de SESSION)",
    iEdit >= 0 && iDel > iEdit && iRepo > iEdit && iRepo < iDel);

  t("câblage : InterPlanLinks expose onPointMoved", /onPointMoved:\s+onPointMoved/.test(LIENS));
  t("câblage : onPointMoved recale bien x ET y",
    /side\.x = Number\(point\.x\)/.test(LIENS) && /side\.y = Number\(point\.y\)/.test(LIENS));
  // Purger au lieu de recaler detruirait des liaisons a chaque deplacement.
  t("🩸 câblage : onPointMoved RECALE, il ne purge pas",
    LIENS.indexOf("function onPointMoved") >= 0 &&
    LIENS.slice(LIENS.indexOf("function onPointMoved"),
                LIENS.indexOf("function onPointMoved") + 1200).indexOf("reg.links.filter") < 0);

  ["poi.moveBtn", "poi.movePoint", "editor.repo.floater", "editor.repo.cancel",
   "editor.repo.done", "editor.undo.movePoint"].forEach(function (k) {
    ["fr", "en", "es"].forEach(function (l) {
      const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
      t("i18n " + l + " : " + k, typeof D[k] === "string" && D[k].length > 0);
    });
  });
}

console.log(ko === 0 ? "\n🎉 repositionnement d'un POI : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
