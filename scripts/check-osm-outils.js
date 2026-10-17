#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-osm-outils.js — garde-fou pré-commit BLOQUANT des outils de la Vue OSM
// =====================================================================
// Mesure (`osmMesure.js`) et coordonnées de surface (`osmCoords.js`), plus le placement des
// bandeaux et des panneaux d'outils. Le code est CHARGÉ dans un `vm`, pas recopié.
// 🩸 Ce qui régresse sans bruit :
//   - la SYMÉTRIE : chaque outil existe dans la Vue OSM du HOME ET dans celle du mode plan ;
//   - l'EXCLUSION MUTUELLE : les deux arment le même `click` Leaflet, ensemble chaque relevé de
//     coordonnée pose aussi un point de mesure ;
//   - le DÉMONTAGE : un listener `click` resté actif, ou le curseur croix, survit à la fermeture.
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
    // Un navigateur a TOUJOURS ces méthodes : sans elles, faux échec du module.
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

  // 🩸 Un seul `_initVisibleLevels()`, AVANT le rendu des POI/tracés : après, ils filtrent sur les
  // niveaux hérités de la modale précédente (un niveau actif manque à l'ouverture).
  {
    const nCall = (VIEW.match(/_initVisibleLevels\(\);/g) || []).length;
    t("🏗️ Vue OSM : un seul appel à _initVisibleLevels()", nCall === 1);
    // 🏷️ Repère = marqueur explicite `// 🏷️ ancre:osm-rendu-poi` posé avant le rendu des POI (jamais un
    // tag de version, qu'un nettoyage retirerait). Absent → échec dédié, pas un faux diagnostic.
    const iStep6 = VIEW.indexOf("// 🏷️ ancre:osm-rendu-poi");
    const iInit  = VIEW.indexOf("_initVisibleLevels();");
    t("🏗️ Vue OSM : repère `🏷️ ancre:osm-rendu-poi` présent", iStep6 > 0);
    t("🏗️ Vue OSM : les niveaux sont initialisés AVANT le rendu des POI/tracés " +
      "(sinon le niveau -1 manque à l'ouverture)",
      iStep6 > 0 && iInit > 0 && iInit < iStep6);
  }

  // Le widget OSM de l'accueil se rafraîchit au retour HOME, sinon un plan tout juste géoréférencé
  // n'y apparaît qu'après redémarrage.
  {
    const MAIN = fs.readFileSync("js/main.js", "utf8");
    const iAff = MAIN.indexOf("function afficherLoader()");
    const iEnd = iAff >= 0 ? MAIN.indexOf("\n}", iAff) : -1;
    const corps = iAff >= 0 && iEnd > iAff ? MAIN.slice(iAff, iEnd) : "";
    t("🗺️ retour home : afficherLoader() rafraîchit le widget OSM",
      /OsmHomePreview\.refresh\(/.test(corps));
    t("🗺️ retour home : le widget OSM s'ouvre sur le plan QUITTÉ (_currentLoadedPlanId)",
      /OsmHomePreview\.refresh\(window\._currentLoadedPlanId/.test(corps));

    // 🩸 On EXÉCUTE le bloc de sélection : un appel à une fonction inexistante passe `node -c` et un
    // grep, puis crashe `mount()` à chaque retour home, exception avalée par le try/catch
    // d'afficherLoader (le widget ne se rafraîchit jamais, sans erreur visible).
    {
      const iBloc = HOME.indexOf("let initialId = (preferId");
      const iEnd  = HOME.indexOf("_renderWidget(container, plans, initialId);", iBloc);
      const bloc  = (iBloc >= 0 && iEnd > iBloc) ? HOME.slice(iBloc, iEnd) : "";
      t("🗺️ le bloc de sélection du plan préféré est extractible", bloc.length > 0);
      if (bloc) {
        let sauve = null, err = null, id = null;
        const sb = {
          preferId: "server_x",
          plans: [{ id: "server_x" }, { id: "server_y" }],
          _getLastSelectedFromLs: function () { return null; },
          _saveLastSelected: function (v) { sauve = v; }
        };
        try {
          vm.runInNewContext(bloc + "; resultat = initialId;", sb, { filename: "osmHome.select.js" });
          id = sb.resultat;
        } catch (e) { err = e.message; }
        t("🗺️ …et il S'EXÉCUTE sans ReferenceError (fonction inexistante = crash silencieux du re-mount)" +
          (err ? " — " + err : ""), !err);
        t("🗺️ …choisit bien le plan préféré quand il est dans la liste", id === "server_x");
        t("🗺️ …et le grave comme sélection courante (_saveLastSelected)", sauve === "server_x");
      }
    }
    t("🗺️ …et le widget expose bien refresh()",
      /refresh:\s*refresh/.test(HOME) || /\brefresh\b[\s\S]{0,40}mount/.test(HOME));

    // 🩸 Un `img.onload` tardif peut taper une carte déjà détruite (re-mount) : `_reset` court-circuite.
    const ROT = fs.readFileSync("lib/leaflet-imageoverlay-rotated.js", "utf8");
    t("🐛 rotated overlay : _reset() court-circuite si la carte est détruite (!map)",
      /_reset: function\(\) \{[\s\S]{0,900}if \(!map \|\| !image \|\| !this\._rawImage\) return;/.test(ROT));
  }

  // ⚠️ Le bandeau se cale sur le CONTENEUR DE LA CARTE : en mode plan, un `top` fixe sur la fenêtre
  // recouvrirait la barre d'outils.
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
  // 🩸 La map de osmView s'appelle `_osmMap` : passer `_map` donne un bouton silencieusement mort.
  t("🩸 cablage : le mode plan passe bien `_osmMap` aux deux outils",
    /OsmMesure\.activer\(_osmMap\)/.test(VIEW) && /OsmCoords\.activer\(_osmMap\)/.test(VIEW));

  // L'infobulle avertit : la coordonnée est exacte pour la carte, pas pour un plan mal calé.
  // 🩸 Deux boutons voisins ne partagent pas une icône : « Ma position » garde 📍, le relevé de
  // coordonnées a 🎯 (on vérifie les DEUX côtés, une collision peut changer de camp).
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

// ───────── 5. 🩸 le bandeau NE SORT PAS DU CADRE (mobile) ─────────
// `max-width` plafonne la BOÎTE, pas son CONTENU : message en `nowrap` + boutons en `flex-shrink: 0`
// = débordement hors écran sur téléphone. La règle PARTAGÉE `.kta-iti-floater` sert aux six pickers.
// Contrôle STRUCTUREL (pas de navigateur) : on vérifie les conditions du débordement.
{
  const CSS = fs.readFileSync("css/style.css", "utf8");
  // Relus ici : les blocs sont scopés, les constantes de la section 4 ne sont pas visibles.
  const CRD = fs.readFileSync("js/osmCoords.js", "utf8");
  const MES = fs.readFileSync("js/osmMesure.js", "utf8");
  // 🩸 Tolérant à l'espacement avant l'accolade : sur une chaîne vide, une assertion NÉGATIVE passe
  // À VIDE. Un sélecteur introuvable rend `null`, traité comme un ÉCHEC.
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
  // 🩸 Sans `min-width: 0`, un enfant flex refuse de descendre sous son contenu : flex-wrap inopérant.
  [[".kta-iti-floater-msg", true], [".kta-osm-mes-info", false], [".kta-osm-coord-info", false]]
    .forEach(function (row) {
      const b = bloc(row[0]);
      t("🩸 " + row[0] + " : la règle existe (sinon les contrôles passent à vide)", b !== null);
      t("🩸 " + row[0] + " : plus de `white-space: nowrap`",
        b !== null && !/white-space:\s*nowrap/.test(b));
      t("🩸 " + row[0] + " : `min-width: 0` (sinon flex-wrap est inopérant)",
        b !== null && /min-width:\s*0/.test(b));
    });

  // Côté JS : largeur bridée et centrage bornés à la CARTE (en mode plan, pas toute la fenêtre).
  [["coordonnées", CRD], ["mesure", MES]].forEach(function (pair) {
    t("🩸 " + pair[0] + " : la largeur est bridée sur la carte, pas sur la fenêtre",
      /style\.maxWidth\s*=\s*Math\.max\(180, Math\.round\(r\.width - 24\)\)/.test(pair[1]));
    t("🩸 " + pair[0] + " : le centrage est borné aux bords de la carte",
      /Math\.min\(Math\.max\(cx, r\.left \+ 12 \+ demi\), r\.right - 12 - demi\)/.test(pair[1]));
  });
}

// ───────── 6. pas DEUX règles dans le bandeau de mesure ─────────
// Le bandeau porte déjà une icône FIXE 📏 : le texte ne la re-préfixe pas. Le ⬛ de la surface
// reste (seul repère qui la distingue de la distance).
{
  const MESJS = fs.readFileSync("js/osmMesure.js", "utf8");
  const iMaj = MESJS.indexOf("function _majFloater");
  const bloc = iMaj < 0 ? null : MESJS.slice(iMaj, iMaj + 900);
  t("la fonction d'affichage du bandeau existe", bloc !== null);
  t("🐛 mesure : le texte ne re-préfixe PAS l'icône 📏 (elle est déjà dans le bandeau)",
    bloc !== null && bloc.indexOf('"📏 "') < 0);
  t("mesure : l'icône fixe du bandeau est bien là, elle", MESJS.indexOf('mes-icone">📏') >= 0);
  // 🩸 Viser la ligne qui l'ÉCRIT : un commentaire voisin contient le même caractère.
  t("mesure : le ⬛ de la surface est conservé (rien ne la distingue sinon)",
    bloc !== null && /txt \+= "\s+⬛ " \+ _fmtS\(/.test(bloc));
}

// ───────── 7. les panneaux d'outils ne passent pas sous le footer ─────────
// 🩸 Ancré au haut de son bouton, un panneau à longue liste (un type de structure PAR NIVEAU sur un
// plan importé) descend sous le footer même avec le viewport réel. Centré par défaut ; l'ancrage
// reste un réglage (décision produit : utile à la souris sur grand écran).
{
  const ITF = fs.readFileSync("js/interface.js", "utf8");
  const CFG = fs.readFileSync("js/config.js", "utf8");
  const UIC = fs.readFileSync("js/interfaceConfig.js", "utf8");
  const i = ITF.indexOf("function _positionnerFlyout");
  const fn = i < 0 ? null : ITF.slice(i, ITF.indexOf("\n}", i));
  t("le positionneur de panneau existe", fn !== null);
  t("🪟 par défaut le panneau est CENTRÉ (le défaut est la négation du réglage)",
    fn !== null && /if \(!\(window\.APP_CONFIG && window\.APP_CONFIG\.panneauxAncres === true\)\)/.test(fn));
  // 🩸 La bande utile exclut AUSSI la barre du haut et le footer (z-index 1200, au-dessus du
  // panneau), sinon en paysage le bas du panneau reste caché.
  t("🪟 bande utile : viewport RÉEL, encoches déduites",
    fn !== null && /let haut = offY \+ safeMargin \+ insets\.top;/.test(fn) &&
    /let bas\s+= offY \+ vpH - safeMargin - insets\.bottom;/.test(fn));
  t("🩸 bande utile : sous la barre du haut et au-dessus du footer",
    fn !== null && /"kta-refonte-header"/.test(fn) && /"kta-refonte-statusbar"/.test(fn) &&
    /maxH = Math\.max\(120, bas - haut\)/.test(fn));
  t("🪟 centrage vertical dans la bande utile",
    fn !== null && /top\s*=\s*haut \+ \(bas - haut - flyHeight\) \/ 2/.test(fn));
  t("🪟 centrage horizontal de même",
    fn !== null && /left\s*=\s*offX \+ insets\.left \+ \(vpW - insets\.left - insets\.right - flyWidth\) \/ 2/.test(fn));
  // 🩸 Plus haut que l'écran, un panneau centré a un `top` négatif : collé en haut (scroll interne).
  // Le même clamp existe pour le mode ancré : on délimite la BRANCHE de centrage.
  const iC = fn === null ? -1 : fn.indexOf("panneauxAncres === true))");
  const branche = iC < 0 ? null : fn.slice(iC, fn.indexOf("}", fn.indexOf("insets.left) left", iC)));
  t("la branche de centrage est délimitable", branche !== null);
  t("🩸 un panneau plus haut que la bande utile est collé EN HAUT, pas au-dessus du bord",
    branche !== null && /if \(top\s+< haut\) top = haut;/.test(branche));
  t("🩸 et de même à gauche",
    branche !== null && /if \(left < offX \+ safeMargin \+ insets\.left\) left = offX \+ safeMargin \+ insets\.left;/.test(branche));

  t("réglage : `panneauxAncres` a un défaut déclaré", /panneauxAncres:\s*false/.test(CFG));
  t("🩸 réglage : sauvegardé par le chemin CANONIQUE (sinon invisible au contrôle des prefs)",
    /existing\.panneauxAncres\s*=/.test(CFG) && /sauvegarderPrefsUtilisateur\(\)/.test(UIC));
  t("réglage : relu au chargement d'un plan", /"panneauxAncres" in saved/.test(CFG));
  // ⚠️ Réglage global : il vit dans la configuration de l'ACCUEIL, pas dans celle d'un plan.
  t("réglage : la case existe dans ⚙️ Configuration de l'accueil",
    /id="loaderPanneauxAncres"/.test(fs.readFileSync("index.html", "utf8")));
  ["config.panneaux.label"].forEach(function (k) {
    ["fr", "en", "es"].forEach(function (l) {
      const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
      t("i18n " + l + " : " + k, typeof D[k] === "string" && D[k].length > 0);
    });
  });
}

console.log(ko === 0 ? "\n🎉 outils de la Vue OSM : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
