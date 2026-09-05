#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🧰 check-osm-outils.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Les DEUX outils de lecture de la carte en Vue OSM — 📏 mesure
// (`osmMesure.js`) et 🎯 coordonnées de surface (`osmCoords.js`) — et la règle
// qui les lie.
//
// 🩸 CE QUI RÉGRESSE ICI, ET SANS BRUIT :
//
//   1. L'ASYMÉTRIE ENTRE LES DEUX VUES. La mesure a vécu de la v1.83.0 à la
//      v1.85.0 dans la Vue OSM du HOME et **pas** dans celle du mode plan —
//      même module, même genre de carte, aucune raison technique. L'écart
//      venait de l'endroit où le besoin était né. Un outil ajouté à une seule
//      des deux vues repart dans ce travers sans que rien ne le signale.
//
//   2. L'EXCLUSION MUTUELLE. Les deux arment le MÊME événement `click` de
//      Leaflet. S'ils coexistent, chaque relevé de coordonnée pose aussi un
//      point de mesure — le symptôme est discret et l'utilisateur croit à un
//      bug de la carte.
//
//   3. LE DÉMONTAGE. Un listener `click` laissé sur la map continue d'agir
//      après fermeture de l'outil, et le curseur croix fait croire qu'il est
//      encore armé.
//
// Le code est CHARGÉ dans un `vm` (pas recopié) : s'il change, c'est la
// nouvelle version qui est éprouvée.
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// ───────── bouchons Leaflet : le minimum pour monter les deux outils ─────────
function contexte() {
  const conteneur = { style: {} };
  const ecoutes = {};
  const map = {
    on: (ev, fn) => { (ecoutes[ev] = ecoutes[ev] || []).push(fn); },
    off: (ev, fn) => { ecoutes[ev] = (ecoutes[ev] || []).filter((f) => f !== fn); },
    removeLayer() {}, addLayer() {},
    getContainer: () => conteneur
  };
  const groupe = { addTo: () => groupe, clearLayers() {}, addLayer() {} };
  const ctx = {
    console: { log() {}, warn() {} }, setTimeout, JSON, Math, Array, Object, String, Number,
    L: {
      layerGroup: () => groupe,
      circleMarker: () => ({ addTo: () => ({}) }),
      polyline: () => ({ addTo: () => ({}) }),
      polygon: () => ({ addTo: () => ({}) }),
      marker: () => ({ addTo: () => ({}) }),
      divIcon: () => ({}),
      latLng: (a, b) => ({ lat: a, lng: b, distanceTo: () => 0 })
    },
    document: {
      createElement: () => {
        const el = { style: {}, _h: "", children: [],
          set innerHTML(v) { el._h = v; }, get innerHTML() { return el._h; },
          querySelector: () => ({ addEventListener() {}, textContent: "", disabled: false }),
          appendChild() {}, remove() { el._retire = true; }, parentNode: null };
        return el;
      },
      body: { appendChild(el) { el.parentNode = { }; } }
    },
    navigator: {},
    // Un navigateur a TOUJOURS ces methodes : le bouchon qui ne les avait
    // pas faisait echouer le module pour une raison qui n existe pas en vrai.
    addEventListener() {}, removeEventListener() {},
    formatGpsCoords: (a, b) => a.toFixed(6) + ", " + b.toFixed(6)
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, map, ecoutes, conteneur };
}

const SRC_MES = fs.readFileSync("js/osmMesure.js", "utf8");
const SRC_CRD = fs.readFileSync("js/osmCoords.js", "utf8");

// ───────── 1. surface d'API ─────────
{
  const { ctx } = contexte();
  vm.runInContext(SRC_CRD, ctx, { filename: "osmCoords.js" });
  ["activer", "desactiver", "estActif"].forEach((m) =>
    t("API : OsmCoords." + m + "()", typeof ctx.OsmCoords[m] === "function"));
  t("API : le format de sortie est expose au harnais", typeof ctx.OsmCoords._format === "function");
  t("format : 6 decimales, separateur virgule-espace",
    ctx.OsmCoords._format(44.7008, -0.37904) === "44.700800, -0.379040");
}

// ───────── 2. cycle de vie : armer, basculer, demonter ─────────
{
  const { ctx, map, ecoutes, conteneur } = contexte();
  vm.runInContext(SRC_CRD, ctx, { filename: "osmCoords.js" });
  const CO = ctx.OsmCoords;

  t("au repos : inactif", CO.estActif() === false);
  CO.activer(map);
  t("activer : arme l'outil", CO.estActif() === true);
  t("activer : pose UN listener `click`", (ecoutes.click || []).length === 1);
  t("activer : passe le curseur en croix", conteneur.style.cursor === "crosshair");

  CO.activer(map);   // second clic sur le bouton
  t("second appel : bascule en OFF (pas de double armement)", CO.estActif() === false);
  t("🩸 desarmement : le listener `click` est RETIRE", (ecoutes.click || []).length === 0);
  t("🩸 desarmement : le curseur croix est RENDU", !conteneur.style.cursor);
}

// ───────── 3. 🩸 exclusion mutuelle des deux outils ─────────
{
  const { ctx, map, ecoutes } = contexte();
  vm.runInContext(SRC_MES, ctx, { filename: "osmMesure.js" });
  vm.runInContext(SRC_CRD, ctx, { filename: "osmCoords.js" });

  ctx.OsmMesure.activer(map);
  t("mesure armee", ctx.OsmMesure.estActif() === true);
  ctx.OsmCoords.activer(map);
  t("🩸 armer les coordonnees DESARME la mesure", ctx.OsmMesure.estActif() === false);
  t("  -> un seul listener `click` sur la map", (ecoutes.click || []).length === 1);
  t("  -> et c'est bien l'outil coordonnees qui est actif", ctx.OsmCoords.estActif() === true);
}

// ───────── 4. le cablage, que l'extraction ne voit pas ─────────
{
  const VIEW = fs.readFileSync("js/osmView.js", "utf8");
  const HOME = fs.readFileSync("js/osmHomePreview.js", "utf8");
  const IDX  = fs.readFileSync("index.html", "utf8");
  const SW   = fs.readFileSync("sw.js", "utf8");

  // 📌 Le bandeau se cale sur LE CONTENEUR DE LA CARTE, pas sur la fenetre :
  // en mode plan la barre d outils occupe le haut de la fenetre, un `top`
  // fixe recouvrirait ses boutons.
  const CRD = fs.readFileSync("js/osmCoords.js", "utf8");
  const MES = fs.readFileSync("js/osmMesure.js", "utf8");
  [["coordonnees", CRD], ["mesure", MES]].forEach(function (pair) {
    t("📌 " + pair[0] + " : le bandeau se place sur la CARTE, pas sur la fenetre",
      pair[1].indexOf("getContainer().getBoundingClientRect()") >= 0);
    t("🩸 " + pair[0] + " : le listener de resize est RETIRE au demontage",
      pair[1].indexOf('removeEventListener("resize"') >= 0);
  });

  t("cablage : osmCoords.js est charge par index.html", /src="js\/osmCoords\.js"/.test(IDX));
  t("cablage : osmCoords.js est precache", SW.indexOf('"./js/osmCoords.js"') >= 0);

  // 🩸 LA REGLE DE SYMETRIE : chaque outil dans LES DEUX vues.
  t("🩸 symetrie : la MESURE est dans la Vue OSM du mode plan",
    /OsmMesure\.activer\(/.test(VIEW));
  t("🩸 symetrie : la MESURE est dans la Vue OSM du HOME",
    /OsmMesure\.activer\(/.test(HOME));
  t("🩸 symetrie : les COORDONNEES sont dans la Vue OSM du mode plan",
    /OsmCoords\.activer\(/.test(VIEW));
  t("🩸 symetrie : les COORDONNEES sont dans la Vue OSM du HOME",
    /OsmCoords\.activer\(/.test(HOME));

  t("cablage : le bouton du mode plan existe", /id="kta-osm-coords"/.test(VIEW));
  t("cablage : le bouton du HOME existe", /id="ktaOsmHomeCoordBtn"/.test(HOME));
  // La map de osmView s'appelle `_osmMap` : passer `_map` (qui n'existe pas)
  // donnerait un bouton silencieusement mort — l'erreur a ete faite en ecrivant
  // ce lot, et c'est exactement ce que ce controle rattrape.
  t("🩸 cablage : le mode plan passe bien `_osmMap` aux deux outils",
    /OsmMesure\.activer\(_osmMap\)/.test(VIEW) && /OsmCoords\.activer\(_osmMap\)/.test(VIEW));

  // L'avertissement d'honnetete doit rester : la coordonnee est exacte pour la
  // carte, pas forcement pour la galerie d'un plan mal cale.
  // 🩸 DEUX BOUTONS VOISINS NE PARTAGENT PAS UNE ICONE. Le releve de
  // coordonnees est ne avec 📍 — deja celle de « Ma position » (`osm.btn.mygps`
  // = « 📍 Moi »), dans la MEME barre. L un donne TA position, l autre celle
  // d un point que tu choisis : rien ne les distinguait a l oeil. Et la
  // correction a d abord casse le bouton « Ma position » du HOME en lui
  // prenant sa nouvelle icone — la collision avait juste change de camp.
  const FR = JSON.parse(fs.readFileSync("lang/fr.json", "utf8"));
  const ICONE_MOI = "📍", ICONE_COORD = "🎯";
  t("🩸 icones : « Ma position » garde la sienne (" + ICONE_MOI + ")",
    (FR["osm.btn.mygps"] || "").indexOf(ICONE_MOI) >= 0);
  t("🩸 icones : le releve de coordonnees a la SIENNE (" + ICONE_COORD + ")",
    (FR["osm.coords.btnTitle"] || "").indexOf(ICONE_COORD) === 0);
  t("🩸 icones : les deux boutons du HOME sont distincts",
    /ktaOsmHomeMyGpsBtn[\s\S]{0,300}?📍/.test(HOME) && /ktaOsmHomeCoordBtn[\s\S]{0,300}?🎯/.test(HOME));
  t("🩸 icones : le bouton du mode plan porte celle des coordonnees",
    /kta-osm-coords[\s\S]{0,300}?🎯/.test(VIEW));
  t("honnetete : l'infobulle dit que la justesse depend du calage du plan",
    /calage du plan/i.test(FR["osm.coords.btnTitle"] || ""));
  ["osm.coords.invite", "osm.coords.copier", "osm.coords.copie", "osm.coords.copieKo"]
    .forEach((k) => t("i18n : " + k + " existe", typeof FR[k] === "string" && FR[k].length > 0));
}

// ───────── 5. 🩸 le bandeau NE SORT PAS DU CADRE (KARMA, mobile) ─────────
// `max-width` plafonne la BOÎTE, jamais son CONTENU. Avec un message en
// `white-space: nowrap` et des boutons en `flex-shrink: 0`, la ligne ne peut
// ni se couper ni se comprimer : elle déborde de la boîte, qui déborde de
// l'écran. Invisible sur un grand écran — tout y tient —, systématique sur
// téléphone. Le défaut vivait dans la règle PARTAGÉE `.kta-iti-floater`,
// donc dans les six pickers, pas seulement dans les deux outils OSM.
//
// Contrôle STRUCTUREL : on ne peut pas mesurer un débordement sans
// navigateur. On vérifie donc les trois conditions qui le rendent possible,
// et on le dit plutôt que de laisser croire à une mesure.
{
  const CSS = fs.readFileSync("css/style.css", "utf8");
  // Relus ICI : les blocs sont scopes, et les constantes de la section 4 ne
  // sont pas visibles depuis celle-ci (plantage a la premiere execution).
  const CRD = fs.readFileSync("js/osmCoords.js", "utf8");
  const MES = fs.readFileSync("js/osmMesure.js", "utf8");
  // 🩸 Tolérant à l'espacement : le projet aligne certains sélecteurs sur
  // DEUX espaces avant l'accolade. Un `indexOf(sel + " {")` strict rendait
  // alors "" — et sur une chaîne vide, une assertion NÉGATIVE (« plus de
  // nowrap ») passe À VIDE. Un sélecteur introuvable rend `null`, et c'est
  // traité comme un ÉCHEC, jamais comme un succès silencieux.
  function bloc(sel) {
    for (let n = 1; n <= 4; n++) {
      const i = CSS.indexOf(sel + " ".repeat(n) + "{");
      if (i >= 0) return CSS.slice(i, CSS.indexOf("}", i));
    }
    return null;
  }
  [".kta-iti-floater", "#kta-osm-mes-floater", "#kta-osm-coord-floater"].forEach(function (sel) {
    const b = bloc(sel);
    t("🩸 " + sel + " : la règle existe (sinon les contrôles passent à vide)", b !== null);
    t("🩸 " + sel + " : le contenu peut passer à la ligne (flex-wrap)",
      b !== null && /flex-wrap:\s*wrap/.test(b));
  });
  // 🩸 `min-width: 0` est la moitié qu'on oublie : sans lui un enfant flex
  // refuse de descendre sous sa largeur de contenu, et `flex-wrap` ne sert
  // à rien. Et un `nowrap` réintroduit ramènerait le bug tel quel.
  [[".kta-iti-floater-msg", true], [".kta-osm-mes-info", false], [".kta-osm-coord-info", false]]
    .forEach(function (row) {
      const b = bloc(row[0]);
      t("🩸 " + row[0] + " : la règle existe (sinon les contrôles passent à vide)", b !== null);
      t("🩸 " + row[0] + " : plus de `white-space: nowrap`",
        b !== null && !/white-space:\s*nowrap/.test(b));
      t("🩸 " + row[0] + " : `min-width: 0` (sinon flex-wrap est inopérant)",
        b !== null && /min-width:\s*0/.test(b));
    });

  // Côté JS : la largeur est bridée sur la CARTE (en mode plan elle n'occupe
  // pas toute la fenêtre), et le centrage reste DANS la carte.
  [["coordonnées", CRD], ["mesure", MES]].forEach(function (pair) {
    t("🩸 " + pair[0] + " : la largeur est bridée sur la carte, pas sur la fenêtre",
      /style\.maxWidth\s*=\s*Math\.max\(180, Math\.round\(r\.width - 24\)\)/.test(pair[1]));
    t("🩸 " + pair[0] + " : le centrage est borné aux bords de la carte",
      /Math\.min\(Math\.max\(cx, r\.left \+ 12 \+ demi\), r\.right - 12 - demi\)/.test(pair[1]));
  });
}

console.log(ko === 0 ? "\n🎉 outils de la Vue OSM : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
