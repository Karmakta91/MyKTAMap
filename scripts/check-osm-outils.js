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

  // L'INIT DES NIVEAUX PRÉCÈDE LE RENDU LEVEL-AWARE.
  // À l'ouverture, le niveau -1 n'apparaissait pas alors qu'il était actif :
  // `_initVisibleLevels()` était appelé APRÈS le rendu des POI/tracés, qui
  // filtraient donc sur un `_visibleLevels` hérité de la modale précédente. Un
  // seul appel, et il doit tomber AVANT le rendu des POI (étape 6 de la
  // séquence). Cette assertion rougit si quelqu'un le redescend.
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

  // LE WIDGET OSM DE L'ACCUEIL SE RAFRAÎCHIT AU RETOUR
  // HOME. Sans ça, un plan tout juste chargé (donc géoréférencé) n'apparaissait
  // dans sa Vue OSM qu'après un redémarrage complet de l'app.
  {
    const MAIN = fs.readFileSync("js/main.js", "utf8");
    const iAff = MAIN.indexOf("function afficherLoader()");
    const iEnd = iAff >= 0 ? MAIN.indexOf("\n}", iAff) : -1;
    const corps = iAff >= 0 && iEnd > iAff ? MAIN.slice(iAff, iEnd) : "";
    t("🗺️ retour home : afficherLoader() rafraîchit le widget OSM",
      /OsmHomePreview\.refresh\(/.test(corps));
    // …en préférant le plan qu'on vient de quitter.
    t("🗺️ retour home : le widget OSM s'ouvre sur le plan QUITTÉ (_currentLoadedPlanId)",
      /OsmHomePreview\.refresh\(window\._currentLoadedPlanId/.test(corps));

    // 🩸 ON EXÉCUTE LE BLOC DE SÉLECTION, ON NE LE GREP
    // PLUS. La v1.90.12 appelait `_setLastSelected(preferId)` — une fonction qui
    // N'EXISTE PAS (le vrai nom est `_saveLastSelected`). `node -c` ne voit pas
    // une ReferenceError, et l'ancienne assertion GREPAIT le texte de l'appel :
    // elle était donc VERTE sur un `mount()` qui crashait à chaque retour home.
    // Résultat vécu : la Vue OSM ne se rafraîchissait jamais (exception avalée
    // par le try/catch d'afficherLoader). On extrait le bloc et on le JOUE : un
    // nom de fonction inexistant lève ici, pas en silence chez l'utilisateur.
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

    // L'overlay image roté ne doit pas crasher quand
    // un `img.onload` tardif tape une carte déjà détruite (re-mount du widget).
    // `_reset` doit court-circuiter si `_map` est null.
    const ROT = fs.readFileSync("lib/leaflet-imageoverlay-rotated.js", "utf8");
    t("🐛 rotated overlay : _reset() court-circuite si la carte est détruite (!map)",
      /_reset: function\(\) \{[\s\S]{0,900}if \(!map \|\| !image \|\| !this\._rawImage\) return;/.test(ROT));
  }

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

// ───────── 6. 🐛 pas DEUX règles dans le bandeau de mesure ─────────
// KARMA, 05/09 : « on voit deux fois la règle ». Le bandeau porte une icône
// FIXE 📏, et le texte de mesure la re-préfixait — deux règles côte à côte.
// Le ⬛ de la surface, lui, reste : elle n'a pas d'icône fixe, et c'est ce
// qui la distingue de la distance dans la même ligne.
{
  const MESJS = fs.readFileSync("js/osmMesure.js", "utf8");
  const iMaj = MESJS.indexOf("function _majFloater");
  const bloc = iMaj < 0 ? null : MESJS.slice(iMaj, iMaj + 900);
  t("la fonction d'affichage du bandeau existe", bloc !== null);
  t("🐛 mesure : le texte ne re-préfixe PAS l'icône 📏 (elle est déjà dans le bandeau)",
    bloc !== null && bloc.indexOf('"📏 "') < 0);
  t("mesure : l'icône fixe du bandeau est bien là, elle", MESJS.indexOf('mes-icone">📏') >= 0);
  // 🩸 Viser la ligne qui l'ECRIT : le commentaire juste au-dessus contient
  // le meme caractere et suffisait a satisfaire une recherche de sous-chaine.
  t("mesure : le ⬛ de la surface est conservé (rien ne la distingue sinon)",
    bloc !== null && /txt \+= "\s+⬛ " \+ _fmtS\(/.test(bloc));
}

// ───────── 7. 🪟 les panneaux d'outils ne passent plus sous le footer ─────────
// KARMA, 05/09 : « la fenêtre structure passe sous le footer, toujours ».
// Le correctif de v1.82.0 (mesurer le viewport RÉEL via `visualViewport` au
// lieu de `innerHeight`) était juste mais insuffisant : le panneau reste
// ANCRÉ au haut de son bouton, donc plus sa liste s'allonge — un plan importé
// ajoute un type de structure PAR NIVEAU — plus il descend, et le clamp ne
// peut que le remonter jusqu'à buter. Centré, sa hauteur se répartit des deux
// côtés et la question ne se pose plus.
//
// L'ancrage reste offert en réglage : sur grand écran il ne gêne pas, et le
// retirer d'office serait une régression pour qui travaille à la souris.
{
  const ITF = fs.readFileSync("js/interface.js", "utf8");
  const CFG = fs.readFileSync("js/config.js", "utf8");
  const UIC = fs.readFileSync("js/interfaceConfig.js", "utf8");
  const i = ITF.indexOf("function _positionnerFlyout");
  const fn = i < 0 ? null : ITF.slice(i, ITF.indexOf("\n}", i));
  t("le positionneur de panneau existe", fn !== null);
  t("🪟 par défaut le panneau est CENTRÉ (le défaut est la négation du réglage)",
    fn !== null && /if \(!\(window\.APP_CONFIG && window\.APP_CONFIG\.panneauxAncres === true\)\)/.test(fn));
  // la bande utile exclut AUSSI la barre du haut et le footer de la refonte
  // (z-index 1200, au-dessus du panneau) — sinon, en paysage, le bas du panneau restait caché sous le footer.
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
  // 🩸 Un panneau plus haut que l'écran donne un `top` négatif : il doit être
  // collé en haut (son scroll interne prend le relais), pas laissé au-dessus
  // du bord — sinon on remplace un débordement par le bas par un par le haut.
  //
  // Ce clamp existe DÉJÀ plus haut dans la fonction, pour le mode ancré : une
  // recherche sur toute la fonction serait satisfaite par celui-là et ne dirait
  // rien du mode centré. On délimite donc la BRANCHE de centrage.
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
  // ⚠️ l'option a MIGRÉ vers la config de l'ACCUEIL (audit KARMA —
  // c'est un réglage global, il n'avait rien à faire dans la config d'un plan).
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
