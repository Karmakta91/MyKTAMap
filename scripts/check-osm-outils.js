#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🧰 check-osm-outils.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Les DEUX outils de lecture de la carte en Vue OSM — 📏 mesure
// (`osmMesure.js`) et 📍 coordonnées de surface (`osmCoords.js`) — et la règle
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
  const FR = JSON.parse(fs.readFileSync("lang/fr.json", "utf8"));
  t("honnetete : l'infobulle dit que la justesse depend du calage du plan",
    /calage du plan/i.test(FR["osm.coords.btnTitle"] || ""));
  ["osm.coords.invite", "osm.coords.copier", "osm.coords.copie", "osm.coords.copieKo"]
    .forEach((k) => t("i18n : " + k + " existe", typeof FR[k] === "string" && FR[k].length > 0));
}

console.log(ko === 0 ? "\n🎉 outils de la Vue OSM : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
