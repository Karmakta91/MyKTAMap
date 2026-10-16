#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// ❓ check-aide-contextuelle.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Le bouton ❓ posé dans l'en-tête des modales qui ont une section d'aide
// (D35 de l'audit ergonomie, 14/09/2026), et son interrupteur.
//
// 🎯 AUCUNE TABLE RECOPIÉE — la règle du repo depuis `check-icon-catalog.js` :
// la table `AIDE_PAR_MODALE` est confrontée AU CODE dans les deux sens.
//   • chaque id de modale doit EXISTER dans les sources (une modale renommée
//     ferait disparaître son ❓ en silence) ;
//   • chaque slug doit être une SECTION RÉELLE (sinon le ❓ ouvre du vide).
//
// 🩸 CE QUI RÉGRESSE SANS BRUIT :
//   1. Une modale renommée : le ❓ disparaît, personne ne le remarque.
//   2. L'interrupteur qui cesse d'agir sur ce qui est DÉJÀ à l'écran : la case
//      paraît inerte, on la coche trois fois et on abandonne.
//   3. Le défaut qui bascule à OFF : une aide qui ne se voit pas ne sert pas.
//
// ON EXÉCUTE la lecture du réglage, extraite du fichier réel.
// Usage : node scripts/check-aide-contextuelle.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

const DOCS = lire("js/interfaceDocs.js");
const IDX  = lire("index.html");
const HOME = lire("js/homeConfig.js");

// ---------- 1. La table, confrontée au code ----------
let table = {};
{
  const i = DOCS.indexOf("const AIDE_PAR_MODALE = {");
  const j = DOCS.indexOf("};", i);
  const src = (i >= 0 && j > i) ? DOCS.slice(i, j + 2) : "";
  t("la table modale → section est extractible", src.length > 0);
  if (src) {
    const sb = {};
    try { vm.runInNewContext(src + "\nout = AIDE_PAR_MODALE;", sb, { filename: "aide.table.js" }); } catch (e) {}
    table = sb.out || {};
    t("🩸 …et elle n'est pas vide (au moins 8 modales couvertes)", Object.keys(table).length >= 8);

    // Les sections réelles, lues dans AIDE_SECTIONS — pas une liste recopiée.
    const iS = DOCS.indexOf("const AIDE_SECTIONS = [");
    const sbS = {};
    try { vm.runInNewContext(DOCS.slice(iS, DOCS.indexOf("];", iS) + 2) + "\nout = AIDE_SECTIONS;", sbS, { filename: "aide.sections.js" }); } catch (e) {}
    const sections = sbS.out || [];
    t("les sections d'aide sont lisibles depuis le même fichier", sections.length > 0);

    // Sources JS où chercher les ids de modales.
    // 🩸 LA TABLE EST RETIRÉE DU CORPUS avant la recherche. Sans ça, le contrôle
    // se validait lui-même : un id renommé DANS la table restait « trouvé »,
    // puisque la table vit dans un des fichiers fouillés. Défaut révélé par la
    // falsification du 14/09/2026, pas par la relecture.
    const JS = fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return f.endsWith(".js"); })
      .map(function (f) { return lire("js/" + f); }).join("\n").split(src).join("");

    // 🩸 L'EXISTENCE DE L'ID NE SUFFIT PAS. Une modale sans
    // en-tête reconnu n'aurait jamais reçu son ❓, sans un mot : c'est arrivé
    // avec le menu Tracker, qui n'avait même pas d'id. On exige donc que le
    // fichier qui crée la modale porte AUSSI une des deux familles d'en-tête.
    const ENTETES = ["kta-readme-modal-header", "kta-tracker-modal-header"];
    const fichiers = fs.readdirSync(path.join(ROOT, "js"))
      .filter(function (f) { return f.endsWith(".js") && f !== "interfaceDocs.js"; })
      .map(function (f) { return { nom: f, txt: lire("js/" + f) }; });

    const idsMorts = [], slugsMorts = [], sansEntete = [];
    Object.keys(table).forEach(function (id) {
      if (JS.indexOf('"' + id + '"') < 0 && IDX.indexOf('"' + id + '"') < 0) idsMorts.push(id);
      if (sections.indexOf(table[id]) < 0) slugsMorts.push(id + " → " + table[id]);
      // Le fichier qui CRÉE la modale (`x.id = "…"`), pas le premier qui la
      // nomme : `kta-itinerary-modal` est cité par copyright.js, qui n'a
      // évidemment pas son en-tête (03/10/2026).
      const cite = fichiers.filter(function (f) { return f.txt.indexOf('"' + id + '"') >= 0; });
      const cree = new RegExp("\\.id\\s*=\\s*\"" + id + "\"|id=\\\\?\"" + id + "\\\\?\"");
      const src = cite.filter(function (f) { return cree.test(f.txt); })[0] || cite[0];
      if (src && !ENTETES.some(function (h) { return src.txt.indexOf(h) >= 0; })) {
        sansEntete.push(id + " (" + src.nom + ")");
      }
    });
    t("🩸 chaque modale de la table EXISTE dans le code" + (idsMorts.length ? " — morts : " + idsMorts.join(", ") : ""),
      idsMorts.length === 0);
    t("🩸 chaque section visée EXISTE" + (slugsMorts.length ? " — morts : " + slugsMorts.join(", ") : ""),
      slugsMorts.length === 0);
    t("🩸 chaque modale a un en-tête où poser le ❓" + (sansEntete.length ? " — sans en-tête : " + sansEntete.join(", ") : ""),
      sansEntete.length === 0);
  }
}

// ---------- 2. Le réglage, exécuté ----------
{
  const i = DOCS.indexOf("function ktaAideContextuelleActive()");
  const j = DOCS.indexOf("\n}", i);
  const src = (i >= 0 && j > i) ? DOCS.slice(i, j + 2) : "";
  t("la lecture du réglage est extractible", src.length > 0);
  if (src) {
    // La clé vit hors de la fonction : sans elle, le sandbox lèverait une
    // ReferenceError que le try/catch de la fonction avalerait — et le contrôle
    // validerait un code cassé en croyant tester le défaut.
    const CLE = (DOCS.match(/const AIDE_CTX_LS = "([^"]+)"/) || [])[1];
    t("la clé de réglage est nommée dans le code", !!CLE);
    const jouer = function (valeur) {
      const sb = { AIDE_CTX_LS: CLE, localStorage: { getItem: function () { return valeur; } }, out: null };
      vm.runInNewContext(src + "\nout = ktaAideContextuelleActive();", sb, { filename: "aide.reglage.js" });
      return sb.out;
    };
    t("🩸 DÉFAUT ACTIVÉ : jamais réglé (null) → le ❓ s'affiche", jouer(null) === true);
    t("🩸 seul « 0 » coupe (un « 1 » ou une valeur parasite n'éteint pas l'aide)",
      jouer("0") === false && jouer("1") === true && jouer("") === true);
    const sbErr = { AIDE_CTX_LS: CLE, localStorage: { getItem: function () { throw new Error("bloqué"); } }, out: null };
    vm.runInNewContext(src + "\nout = ktaAideContextuelleActive();", sbErr, { filename: "aide.reglage.err.js" });
    t("stockage inaccessible (navigation privée) → l'aide reste affichée", sbErr.out === true);
  }
}

// ---------- 3. La pose et le retrait ----------
{
  t("🩸 le bouton se pose à l'ouverture d'une modale (observateur), pas au cas par cas",
    /new MutationObserver\(/.test(DOCS) && /AIDE_PAR_MODALE\[n\.id\]/.test(DOCS));
  // 🩸 On lit le CODE, pas les commentaires : l'ancienne forme `head.insertBefore(b, croix)` (qui
  // jetait un NotFoundError quand la croix est imbriquée) ne survit plus QUE dans le commentaire qui
  // raconte ce bug — l'ancien contrôle était vert grâce à lui (audit commentaires 16/10/2026, QW1).
  const sansCom = function (s) { return s.replace(/^[ \t]*\/\/.*$/gm, ""); };
  const i3 = DOCS.indexOf("function _aidePoserBouton("), j3 = DOCS.indexOf("function ktaAideContextuelleRefresh(");
  const p = (i3 >= 0 && j3 > i3) ? sansCom(DOCS.slice(i3, j3)) : "";
  t("_aidePoserBouton est extractible", p.length > 0);
  t("🩸 rien n'est posé quand le réglage est coupé", /if \(!slug \|\| !ktaAideContextuelleActive\(\)\) return;/.test(p));
  t("le bouton n'est jamais posé deux fois", /head\.querySelector\("\.kta-aide-ctx-btn"\)/.test(p));
  t("il se place avant la croix (même ordre dans toutes les modales), dans le parent RÉEL de la croix",
    /croix\.parentNode\.insertBefore\(b, croix\)/.test(p) && !/head\.insertBefore\(b, croix\)/.test(p));
  t("🩸 les DEUX familles d'en-tête sont acceptées (contenu et menu Tracker)",
    /kta-readme-modal-header, \.kta-tracker-modal-header/.test(p) && /kta-tracker-modal-close/.test(p));
  t("il ouvre la section visée", /ktaOuvrirAideSection\(slug\)/.test(p));
  const r = DOCS.slice(DOCS.indexOf("function ktaAideContextuelleRefresh("), DOCS.indexOf("(function _aideCtxObserver()"));
  t("🩸 couper le réglage retire les ❓ DÉJÀ à l'écran (sinon la case paraît inerte)",
    /if \(!actif && b\) b\.remove\(\);/.test(r) && /if \(actif && !b\) _aidePoserBouton\(m\);/.test(r));
  t("un slug inconnu est refusé plutôt qu'ouvert à vide",
    /AIDE_SECTIONS\.indexOf\(slug\) < 0/.test(DOCS) && /console\.warn\("\[Aide\] section inconnue/.test(DOCS));
}

// ---------- 4. L'interrupteur, à l'accueil ----------
{
  t("❓ la case existe dans ⚙️ Configuration de l'accueil", IDX.indexOf('id="loaderAideCtxCb"') >= 0);
  t("🩸 …et elle est CÂBLÉE (écrit le réglage et rafraîchit l'écran)",
    /loaderAideCtxCb/.test(HOME) && /myktamap_aide_contextuelle/.test(HOME) && /ktaAideContextuelleRefresh\(\)/.test(HOME));
  const css = lire("css/style.css");
  t("CSS : le bouton a une cible d'au moins 34 px", /\.kta-aide-ctx-btn \{[\s\S]{0,400}min-height: 34px/.test(css));
  ["fr", "en", "es"].forEach(function (l) {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    t("🌍 " + l + " : libellés du bouton et du réglage",
      ["aide.ctx.btn", "config.aidectx.label",
       "config.aidectx.toastOn", "config.aidectx.toastOff"].every(function (k) { return typeof d[k] === "string"; }));
  });
}

console.log("");
if (echecs) { console.log("💥 aide contextuelle : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 aide contextuelle : " + Object.keys(table).length +
            " modales renvoient à leur page d'aide, et l'icône se coupe d'une case");
