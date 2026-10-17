/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// tiling.js — rendu du fond de plan : direct, tuiles runtime V1 (découpe en canvas) ou tuiles V2 du
// Générateur (un L.imageOverlay par tuile, swap de niveau au zoom, tuiles hors écran non posées).
// Expose : chargerImage, chargerImageTuillee, libererTuiles, resoudrePerfPreset, PERF_PRESETS,
//   ktaCullerTuilesV2(Throttle), _libererTuilesV2, _applyLevelFilterToBasePlan, ktaRacineTuilesServeur,
//   ktaCandidatsRacineTuiles, ktaResoudreRacineTuiles, ktaTuilesV2Urls, ktaDessinerRegionTuiles,
//   ktaTuilesSurAppareil, ktaRemplissageTuile, ktaRognerTuile.
// ⚠️ Un plan V2 tuile toujours, quelle que soit sa taille (choix).
// 🩸 En V1, au-delà de 4096² px le rendu direct est instable sur GPU mobile : on tuile même en Qualité.
// 🩸 Rendu, pré-cache hors-ligne (planOffline.js) et export partagent la MÊME dérivation des URLs de tuiles.
// Garde-fou : scripts/check-tiling.js, scripts/check-plan-offline.js · Doc : docs/TILING.md

// Mode « auto » : second critère, le poids du fichier.
const PERF_AUTO_TILE_THRESHOLD = 60 * 1024 * 1024;

// Au-delà de cette surface, le rendu direct est instable (mémoire GPU mobile) : on tuile même en Qualité.
const TUILING_NECESSAIRE_PIXELS = 4096 * 4096;

// ── Presets de performance ──────────────
// maxWorkDim : canvas de travail max (réduction au-dessus) · tileSize · jpegQuality.
const PERF_PRESETS = {
  quality: {
    label:        "Qualité",
    emoji:        "🌟",
    maxWorkDim:   12288,
    tileSize:     1024,
    jpegQuality:  0.95,
    description:  "Plus net. Recommandé sur PC desktop."
  },
  balanced: {
    label:        "Équilibré",
    emoji:        "🎯",
    maxWorkDim:   8192,
    tileSize:     1024,
    jpegQuality:  0.88,
    description:  "Compromis recommandé. Défaut idéal."
  },
  performance: {
    label:        "Performance",
    emoji:        "⚡",
    maxWorkDim:   6144,
    tileSize:     768,
    jpegQuality:  0.78,
    description:  "Plans très lourds, mobile faible."
  }
};

// ── Résolution du preset ──────────────
// Rend { tile: bool, params: {maxWorkDim, tileSize, jpegQuality} | null }.
function resoudrePerfPreset(preset, fileSize, imageW, imageH) {
  const p = (typeof preset === "string") ? preset : "auto";

  // ⚠️ « off » = jamais de tuilage, choix explicite (risque de crash Safari iOS sur un gros plan V1).
  if (p === "off") {
    return { tile: false, params: null };
  }

  // 🩸 Auto tranche d'abord sur les PIXELS : un JPEG de 100 Mpx pèse ~15 Mo, et `fileSize` vaut toujours
  // null sur un plan serveur (RUNTIME_ASSETS vide). Le poids reste un second critère (décodage coûteux).
  if (p === "auto") {
    const surfaceKO = (typeof imageW === "number" && typeof imageH === "number")
      && (imageW * imageH) > TUILING_NECESSAIRE_PIXELS;
    const poidsKO   = (typeof fileSize === "number" && fileSize > PERF_AUTO_TILE_THRESHOLD);
    const tile      = surfaceKO || poidsKO;
    return {
      tile:   tile,
      params: tile ? PERF_PRESETS.balanced : null
    };
  }

  // Preset explicite : tuilage seulement si l'image est trop grande pour le rendu direct.
  const params = PERF_PRESETS[p];
  if (!params) {
    console.warn("[Tiling] Preset inconnu :", p, "— fallback auto");
    return resoudrePerfPreset("auto", fileSize, imageW, imageH);
  }

  let tile = false;
  if (typeof imageW === "number" && typeof imageH === "number") {
    tile = (imageW * imageH) > TUILING_NECESSAIRE_PIXELS;
  }
  return {
    tile:   tile,
    params: tile ? params : null
  };
}

// ── Point d'entrée ──────────────
async function chargerImage(url, bounds, map, fileSize, sourceFile) {
  const W = bounds[1][1];
  const H = bounds[1][0];

  const preset = (typeof APP_CONFIG !== "undefined") ? APP_CONFIG.perfPreset : "auto";

  // Plan V2 (`plan.tiledV2` + manifest `tiling`, générés par createConf.js > _genererTuilesV2) : runtime
  // multi-imageOverlay. 🩸 « off » y est ignoré : recharger le baseImage entier en un overlay est
  // exactement le crash Safari iOS à éviter. Le baseImage ne sert qu'au dézip manuel et au repli d'erreur.
  //
  // Overlays du plan principal en rendu direct : sans référence, le filtre multi-niveau ne peut pas les
  // masquer. Remis à zéro à chaque chargement.
  window._ktaBaseLayers = [];
  window._ktaBaseHidden = false;

  const pc = window.PLAN_CONFIG;
  if (pc && pc.plan && pc.plan.tiledV2 === true && pc.tiling) {
    if (preset === "off") {
      console.log("[Tiling] Plan V2 : « Désactivé » ignoré — un plan tuilé utilise toujours ses tuiles");
    }
    console.log("[Tiling] Mode V2 (Option B : multi-imageOverlay swap on zoom)");
    // Racine des tuiles SONDÉE avant le rendu (cf ktaCandidatsRacineTuiles).
    const _racine = await ktaResoudreRacineTuiles(pc);
    return _chargerImageV2OptionB(url, bounds, map, pc.tiling, _racine);
  }
  // ⚠️ « Désactivé » sur un plan V1 trop grand : permis (qualité native sur PC), mais signalé.
  if (preset === "off" && (W * H) > TUILING_NECESSAIRE_PIXELS) {
    console.warn("[Tiling] « Désactivé » sur une image de " + W + "×" + H +
                 " px (> 4096²) — rendu direct, risque de crash mémoire sur mobile.");
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(
        (window.I18n && window.I18n.t)
          ? window.I18n.t("tiling.off.grosPlan")
          : "Découpage désactivé sur un très grand plan — risque de plantage sur mobile.",
        "warn");
    }
  }
  const r = resoudrePerfPreset(preset, fileSize, W, H);

  if (r.tile && r.params) {
    console.log("[Tiling] Mode", preset, "—",
                fileSize ? Math.round(fileSize/1024/1024)+"Mo" : "taille inconnue",
                "params:", r.params.maxWorkDim+"px / tile "+r.params.tileSize+" / Q "+r.params.jpegQuality);
    return await chargerImageTuillee(url, bounds, map, sourceFile, r.params);
  }
  console.log("[Tiling] Rendu direct (mode "+preset+")");
  window._ktaBaseLayers.push(L.imageOverlay(url, bounds).addTo(map));
  return [];
}

// ── Le plan principal est le niveau 0 (décision produit) ──────────────
// Décocher 0 dans la modale Niveaux masque le fond, pour voir un autre niveau seul. Couvre les 3 rendus :
// direct (_ktaBaseLayers), V1 (_baseTiles), V2 (activeOverlays + garde _ktaBaseHidden dans _renderNiveau).
// Appelé par appliquerFiltreNiveau.
window._applyLevelFilterToBasePlan = function() {
  if (!window.map) return;
  const cfg = window.APP_CONFIG;
  const visible = !(cfg && cfg.multiLevel === true)
    || !Array.isArray(cfg.visibleLevels)
    || cfg.visibleLevels.indexOf(0) >= 0;
  window._ktaBaseHidden = !visible;
  function _tog(ov) {
    if (!ov) return;
    try {
      if (visible) { if (!window.map.hasLayer(ov)) window.map.addLayer(ov); }
      else         { if (window.map.hasLayer(ov))  window.map.removeLayer(ov); }
    } catch(e) {}
  }
  (window._ktaBaseLayers || []).forEach(_tog);
  (window._baseTiles || []).forEach(function(t) { _tog(t && t.overlay); });
  // V2 : masquer retire tout en le marquant « à reprendre » ; ré-afficher ne remet que ce qui est proche
  // de l'écran (sinon tout le niveau serait redemandé).
  const st = window._tilingV2State;
  if (st && Array.isArray(st.activeOverlays)) {
    st.activeOverlays.forEach(function(ov) {
      if (!ov) return;
      if (!visible && window.map.hasLayer(ov)) { try { window.map.removeLayer(ov); } catch(e) {} }
      if (!window.map.hasLayer(ov)) ov._ktaCulled = true;
    });
    if (visible) window.ktaCullerTuilesV2();
  }
};

// ── V2 : tuiles hors écran ──────────────
// Une image d'overlay n'est demandée qu'une fois posée : ne poser que ce qui est proche de l'écran évite des
// centaines d'overlays, de requêtes et d'abonnements Leaflet pour quelques tuiles visibles. Seule
// implémentation, appelée par le tuilage (déplacement, zoom, nouveau niveau) et par mapBearing (rotation).
//   • zone = écran réel (`MapBearing.zoneVisible`, coins dé-tournés sous rotation) élargi de MARGE ;
//   • on ne remet QUE les tuiles retirées ou jamais posées par nous (`_ktaCulled`) ;
//   • fond masqué par le filtre multi-niveau → rien n'est posé.
// 0,6 mesuré : trous au grand glissé ~0-1 % (36 % avec 0,15) ; 0,3 ne gagnait rien (tuiles de 512 px).
const MARGE_TUILES_V2 = 0.6;
window.ktaCullerTuilesV2 = function() {
  const map = window.map;
  const st = window._tilingV2State;
  if (!map || !st || !Array.isArray(st.activeOverlays) || !st.activeOverlays.length) return;
  const zone = _zoneTuilesV2(map);
  if (!zone) return;
  let retirees = 0, posees = 0;
  st.activeOverlays.forEach(function(ov) {
    if (!ov || typeof ov.getBounds !== "function") return;
    let dedans = true;
    try { dedans = zone.intersects(ov.getBounds()); } catch(e) { dedans = true; }
    const surCarte = map.hasLayer(ov);
    if (!dedans && surCarte) {
      try { map.removeLayer(ov); ov._ktaCulled = true; retirees++; } catch(e) {}
    } else if (dedans && !surCarte && ov._ktaCulled && !window._ktaBaseHidden) {
      try { ov.addTo(map); ov._ktaCulled = false; posees++; } catch(e) {}
    }
  });
  if (retirees || posees) {
    console.log("[Tiling V2] Hors écran : " + retirees + " retirée(s), " + posees + " posée(s) — " +
                st.activeOverlays.length + " au niveau");
  }
};

function _zoneTuilesV2(map) {
  try {
    const z = (window.MapBearing && typeof window.MapBearing.zoneVisible === "function")
      ? window.MapBearing.zoneVisible(MARGE_TUILES_V2) : null;
    return z || map.getBounds().pad(MARGE_TUILES_V2);
  } catch(e) { return null; }
}

// Au plus un passage par frame : moveend, zoomend et la rotation tombent ensemble.
let _cullV2Planifie = false;
window.ktaCullerTuilesV2Throttle = function() {
  if (_cullV2Planifie) return;
  _cullV2Planifie = true;
  requestAnimationFrame(function() {
    _cullV2Planifie = false;
    try { window.ktaCullerTuilesV2(); } catch(e) {}
  });
};

// ── Runtime V2 (multi-imageOverlay, swap au zoom) ──────────────
// plan-config : plan.imageWidth/imageHeight (après recadrage), plan.tiledV2 = true,
//   tiling = { version: 2, tileSize: 512, format, minNativeZoom: -3, maxNativeZoom: 0 }.
// Tuiles : RUNTIME_ASSETS[`data/tiles/z<N>/x<col>_y<-k>.<ext>`] (ZIP) ou HTTP (plan serveur). Le niveau z suit
// le zoom (borné), chaque tuile est un L.imageOverlay à ses bounds : pas de GridLayer, Leaflet gère l'échelle.
//
// Plan serveur : chargerPlanServeur ne remplit pas RUNTIME_ASSETS, les chemins sont absolus depuis la racine
// du site alors que le manifest code des chemins relatifs au ZIP.
// 🩸 Racine et liste des URLs sont EXPOSÉES parce que le pré-cache hors-ligne (planOffline.js) doit énumérer
// exactement les mêmes URLs que le rendu ; deux dérivations divergeraient (plan « téléchargé » mais troué).

// Chemin d'une tuile TEL QU'IL EST DANS LE ZIP : seul endroit à changer si le Générateur change sa mise en
// page (carte, pré-extraction, région PDF).
function _cheminTuileZipExt(z, col, k, ext) {
  return "data/tiles/z" + z + "/x" + col + "_y" + (-k) + "." + ext;
}

// ── Tuiles de bord : masquer le remplissage ──────────────
// Le Générateur complète les tuiles du bord à 512 px : rangée du HAUT remplie en haut, dernière COLONNE remplie
// à droite ; noir sur un plan opaque. Ce noir déborderait (rectangles sombres en Vue OSM, ou sur un fond de
// carte non noir) : on le masque à l'affichage, sans régénérer les plans.
// Fractions (0..1) de la tuile occupées par le remplissage, à droite et en haut. scale = 2^-z (pixels plan par
// pixel de tuile) ; k = rangée comptée depuis le BAS (k = 1), comme partout ailleurs.
function ktaRemplissageTuile(planW, planH, tileSize, scale, col, k) {
  const T = tileSize || 512;
  const lvlW = Math.ceil((+planW || 0) / scale), lvlH = Math.ceil((+planH || 0) / scale);
  const cw = Math.max(0, Math.min(T, lvlW - col * T));
  const ch = Math.max(0, Math.min(T, lvlH - (k - 1) * T));
  return { droite: (T - cw) / T, haut: (T - ch) / T };
}
// Masque le remplissage d'un overlay de tuile (L.imageOverlay ou rotated) : clip-path en pourcentages de l'image,
// qui suit le zoom et la rotation sans recalcul. Posé à l'ajout (l'élément n'existe qu'une fois l'overlay ajouté).
function ktaRognerTuile(overlay, r) {
  if (!overlay || !r || !(r.droite > 0.0001 || r.haut > 0.0001)) return overlay;
  const clip = "inset(" + (r.haut * 100).toFixed(4) + "% " + (r.droite * 100).toFixed(4) + "% 0 0)";
  const poser = function () {
    const el = overlay.getElement ? overlay.getElement() : overlay._image;
    if (el) el.style.clipPath = clip;
  };
  if (overlay.on) overlay.on("add load", poser);
  poser();
  return overlay;
}

// Extension des tuiles d'après le manifest (webp/png = alpha, jpg = historique).
function _extTuile(tilingManifest) {
  return (typeof window.ktaTileExt === "function") ? window.ktaTileExt(tilingManifest) : "jpg";
}

// Racine HTTP des tuiles, ou null pour un plan LOCAL (baseImage en `blob:`, tuiles dans RUNTIME_ASSETS).
// Hypothèse SYNCHRONE = premier candidat, pour les appelants qui ne peuvent pas attendre ; le rendu passe
// par ktaResoudreRacineTuiles, qui sonde.
function ktaRacineTuilesServeur(pc) {
  const c = ktaCandidatsRacineTuiles(pc);
  return c.length ? c[0] : null;
}

// 🩸 L'emplacement des tuiles est indépendant de celui de l'image :
//   dézip brut          data/<plan>/data/img.png  → data/<plan>/data/tiles
//   aplati + réécrit    data/<plan>/img.png       → data/<plan>/tiles
//   image remontée,     data/<plan>/img.png       → tuiles restées dans data/<plan>/data/tiles
// Dériver la racine du dossier du baseImage rate le 3e cas : on SONDE (comme les icônes), une tuile témoin
// par candidat, à l'ouverture du plan.
function ktaCandidatsRacineTuiles(pc) {
  if (!pc || !pc.plan) return [];
  const bi = pc.plan.baseImage;
  if (typeof bi !== "string" || /^(blob:|data:)/.test(bi)) return [];   // plan importé (ZIP)
  const out = [];
  const push = function (r) { if (r && out.indexOf(r) < 0) out.push(r); };
  const tm = pc.tiling || {};
  const dir = (typeof pc._baseDir === "string" && pc._baseDir) ? pc._baseDir.replace(/\/+$/, "") : null;
  // 1. surcharge explicite du plan-config : gagne toujours
  if (typeof tm.tilesDir === "string" && tm.tilesDir) push(tm.tilesDir.replace(/\/+$/, ""));
  // 2. 🩸 la mise en page du Générateur (`_genererTuilesV2` écrit TOUJOURS dans data/tiles du ZIP) : le plus
  //    sûr, même si l'image a été déplacée au déploiement.
  if (dir) push(dir + "/data/tiles");
  // 3. à côté de l'image : déploiements aplatis (image ET tuiles remontées d'un cran).
  const i = bi.lastIndexOf("/");
  push((i > 0) ? bi.slice(0, i) + "/tiles" : "tiles");
  // 4. dernier recours
  if (dir) push(dir + "/tiles");
  return out;
}

// Tuile témoin : niveau le plus détaillé, x0_y-1. Le Générateur écrit toute la grille : elle existe si le
// dossier est le bon.
function _urlTuileTemoin(racine, tm) {
  const z = Number.isInteger(tm && tm.maxNativeZoom) ? tm.maxNativeZoom : 0;
  const ext = _extTuile(tm || {});
  return racine + "/z" + z + "/x0_y-1." + ext;
}

// Racine réelle, sondée ; null pour un plan local. Aucune sonde n'aboutit (hors-ligne, CORS) : premier
// candidat plutôt que rien. Le repli baseImage reste le filet final.
async function ktaResoudreRacineTuiles(pc) {
  const cands = ktaCandidatsRacineTuiles(pc);
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  for (let k = 0; k < cands.length; k++) {
    try {
      const r = await fetch(_urlTuileTemoin(cands[k], pc.tiling), { method: "GET" });
      if (r && r.status === 200) {
        if (k > 0) console.log("[Tiling V2] Racine tuiles sondée :", cands[k], "(candidat " + (k + 1) + ")");
        return cands[k];
      }
    } catch (e) { /* candidat suivant */ }
  }
  console.warn("[Tiling V2] Aucune racine de tuiles ne répond — repli sur", cands[0]);
  return cands[0];
}

// Toutes les URLs de tuiles, tous niveaux, pour le pré-cache hors-ligne. Même grille que `_renderNiveau` :
// scale = 2^-z, cols/rows par division entière supérieure (le Générateur : scale = 2^L, z = -L).
function ktaTuilesV2Urls(pc, racineDejaResolue) {
  // 🩸 Passer la racine SONDÉE : l'hypothèse synchrone peut lister des URLs en 404.
  const racine = racineDejaResolue || ktaRacineTuilesServeur(pc);
  if (!racine || !pc.tiling || !pc.plan) return [];
  const tm    = pc.tiling;
  const T     = tm.tileSize || 512;
  const ext   = _extTuile(tm);
  const zMin  = Number.isInteger(tm.minNativeZoom) ? tm.minNativeZoom : -3;
  const zMax  = Number.isInteger(tm.maxNativeZoom) ? tm.maxNativeZoom : 0;
  const W     = Number(pc.plan.imageWidth)  || 0;
  const H     = Number(pc.plan.imageHeight) || 0;
  if (!W || !H) return [];
  const urls = [];
  for (let z = zMax; z >= zMin; z--) {
    const scale = Math.pow(2, -z);
    const cols  = Math.ceil(Math.ceil(W / scale) / T);
    const rows  = Math.ceil(Math.ceil(H / scale) / T);
    for (let k = 1; k <= rows; k++) {
      for (let col = 0; col < cols; col++) {
        urls.push(racine + "/z" + z + "/x" + col + "_y" + (-k) + "." + ext);
      }
    }
  }
  return urls;
}

// ── Région d'un plan V2 peinte depuis les tuiles ──────────────
// Pour les cartes PDF et l'export : peindre le plan entier sous 16 Mpx (limite canvas Safari iOS) puis
// recadrer rend les noms illisibles. Ici, seule la région est peinte, au niveau qui suffit à l'échelle
// (z = 0 : pleine résolution). Mémoire bornée par la région.
//   ctx     : contexte 2D, (0, 0) = coin haut-gauche de la région
//   region  : { x, y, w, h } en unités plan (y = 0 en HAUT de l'image)
//   echelle : pixels du canvas par unité plan
//   opts.plafond : tuiles au-delà desquelles on descend d'un niveau (600 ; Infinity = jamais)
//   opts.aligner : bords calés sur le pixel (pas de filet entre tuiles à une échelle fractionnaire)
// Rend { ok, tuiles, manquantes, z } ; ok = false si le plan n'est pas V2 (l'appelant prend l'image de base).
// Une tuile introuvable laisse un trou blanc. Grille : rangée k = 1 EN BAS, comme le Générateur.
// Grille d'une région : niveau z, pas (unités plan par tuile), colonnes c0..c1, rangées k0..k1.
// Partagée par le dessin et par ktaTuilesSurAppareil : les deux lisent les MÊMES tuiles.
function _grilleRegionTuiles(pc, region, echelle, plafond) {
  if (!pc || !pc.plan || !pc.plan.tiledV2 || !pc.tiling || !region) return null;
  const tm = pc.tiling;
  const T = tm.tileSize || 512;
  const zMin = Number.isInteger(tm.minNativeZoom) ? tm.minNativeZoom : -3;
  const zMax = Number.isInteger(tm.maxNativeZoom) ? tm.maxNativeZoom : 0;
  const W = Number(pc.plan.imageWidth) || 0, H = Number(pc.plan.imageHeight) || 0;
  if (!W || !H || !(echelle > 0)) return null;
  const max = (typeof plafond === "number" && plafond > 0) ? plafond : 600;
  // Niveau le moins détaillé qui couvre l'échelle voulue (2^z pixels de tuile par unité plan).
  const g = { T: T, ext: _extTuile(tm), W: W, H: H,
              z: Math.min(zMax, Math.max(zMin, Math.ceil(Math.log2(echelle) - 1e-9))) };
  const calculer = function() {
    g.pas = T * Math.pow(2, -g.z);   // unités plan couvertes par une tuile
    const cols = Math.ceil(Math.ceil(W / Math.pow(2, -g.z)) / T);
    const rows = Math.ceil(Math.ceil(H / Math.pow(2, -g.z)) / T);
    g.c0 = Math.max(0, Math.floor(region.x / g.pas));
    g.c1 = Math.min(cols - 1, Math.floor((region.x + region.w) / g.pas));
    g.k0 = Math.max(1, Math.ceil((H - (region.y + region.h)) / g.pas));   // rangée du bas
    g.k1 = Math.min(rows, Math.ceil((H - region.y) / g.pas));             // rangée du haut
  };
  calculer();
  // Garde-fou : une région immense à pleine résolution → niveau moins détaillé.
  while ((g.c1 - g.c0 + 1) * (g.k1 - g.k0 + 1) > max && g.z > zMin) { g.z--; calculer(); }
  return g;
}

// Les tuiles de la région sont-elles TOUTES sur l'appareil (RUNTIME_ASSETS, ou Cache Storage pour un plan
// serveur) ? Rien n'est téléchargé, hors la sonde de racine. Si oui, l'export image compose le fond depuis
// les tuiles au lieu de retélécharger l'image de base (des dizaines de Mo). Une seule absente → false.
async function ktaTuilesSurAppareil(pc, region, echelle, opts) {
  const g = _grilleRegionTuiles(pc, region, echelle, opts && opts.plafond);
  if (!g) return false;
  const assets = window.RUNTIME_ASSETS || {};
  const absentes = [];
  for (let k = g.k0; k <= g.k1; k++) {
    for (let col = g.c0; col <= g.c1; col++) {
      if (!assets[_cheminTuileZipExt(g.z, col, k, g.ext)]) absentes.push([col, k]);
    }
  }
  if (!absentes.length) return true;
  if (typeof caches === "undefined" || typeof caches.match !== "function") return false;
  const racine = await ktaResoudreRacineTuiles(pc);
  if (!racine) return false;
  for (let i = 0; i < absentes.length; i += 48) {
    const lot = absentes.slice(i, i + 48).map(function(ck) {
      return caches.match(racine + "/z" + g.z + "/x" + ck[0] + "_y" + (-ck[1]) + "." + g.ext)
        .then(function(r) { return !!(r && r.ok); }, function() { return false; });
    });
    const res = await Promise.all(lot);
    if (res.indexOf(false) >= 0) return false;
  }
  return true;
}

async function ktaDessinerRegionTuiles(ctx, pc, region, echelle, opts) {
  if (!ctx) return { ok: false };
  const g = _grilleRegionTuiles(pc, region, echelle, opts && opts.plafond);
  if (!g) return { ok: false };
  const T = g.T, ext = g.ext, H = g.H, W = g.W, z = g.z, pas = g.pas;
  const c0 = g.c0, c1 = g.c1, k0 = g.k0, k1 = g.k1;
  const aligner = !!(opts && opts.aligner);
  const racine = await ktaResoudreRacineTuiles(pc);   // null pour un plan importé (ZIP)
  const aLiberer = [];
  async function urlDe(col, k) {
    const chemin = _cheminTuileZipExt(z, col, k, ext);
    const asset = window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[chemin];
    if (!asset) return racine ? racine + "/z" + z + "/x" + col + "_y" + (-k) + "." + ext : null;
    // URL PROPRES (révoquées à la fin) : celles de la carte sont libérées par son LRU.
    let f = asset.file;
    if (!f && asset._zipPath && typeof window._extractLazyAsset === "function") {
      try { f = await window._extractLazyAsset(chemin); } catch (e) { f = null; }
      if (f && !(f instanceof Blob)) f = asset.file;
    }
    if (!f) return null;
    const u = URL.createObjectURL(f);
    aLiberer.push(u);
    return u;
  }
  const charger = function(src) {
    return new Promise(function(res) {
      const img = new Image();
      img.onload = function() { res(img); };
      img.onerror = function() { res(null); };
      img.src = src;
    });
  };
  const travaux = [];
  for (let k = k0; k <= k1; k++) for (let col = c0; col <= c1; col++) travaux.push([col, k]);
  let manquantes = 0, i = 0;
  const ech = Math.pow(2, -z);   // unités plan par pixel de tuile
  async function ouvrier() {
    while (i < travaux.length) {
      const [col, k] = travaux[i++];
      const u = await urlDe(col, k);
      const img = u ? await charger(u) : null;
      if (!img) { manquantes++; continue; }
      const xPlan = col * pas, yPlan = H - k * pas;
      // Remplissage des tuiles de bord (haut / droite) non dessiné : il est noir sur un plan opaque.
      const rem = ktaRemplissageTuile(W, H, T, ech, col, k);
      const nw = img.naturalWidth, nh = img.naturalHeight;
      const sy = Math.round(nh * rem.haut), sw = Math.round(nw * (1 - rem.droite)), sh = nh - sy;
      if (sw <= 0 || sh <= 0) continue;
      let dx = (xPlan - region.x) * echelle, dy = (yPlan + sy * ech - region.y) * echelle;
      let dw = sw * ech * echelle, dh = sh * ech * echelle;
      if (aligner) {   // filet entre tuiles à une échelle fractionnaire : bords calés sur le pixel
        const x2 = Math.ceil(dx + dw - 1e-6), y2 = Math.ceil(dy + dh - 1e-6);
        dx = Math.floor(dx + 1e-6); dy = Math.floor(dy + 1e-6); dw = x2 - dx; dh = y2 - dy;
      }
      ctx.drawImage(img, 0, sy, sw, sh, dx, dy, dw, dh);
    }
  }
  try {
    await Promise.all([ouvrier(), ouvrier(), ouvrier(), ouvrier(), ouvrier(), ouvrier()]);
  } finally {
    aLiberer.forEach(function(u) { try { URL.revokeObjectURL(u); } catch (e) { /* déjà libérée */ } });
  }
  if (manquantes) console.warn("[Tiling V2] Région : " + manquantes + "/" + travaux.length + " tuile(s) introuvable(s) (z" + z + ")");
  return { ok: manquantes < travaux.length, tuiles: travaux.length, manquantes: manquantes, z: z };
}

function _chargerImageV2OptionB(urlBase, bounds, map, tilingManifest, racineSrv) {
  const H = bounds[1][0];
  const W = bounds[1][1];

  const TILE_SIZE = tilingManifest.tileSize || 512;
  const MIN_NATIVE = (Number.isInteger(tilingManifest.minNativeZoom)) ? tilingManifest.minNativeZoom : -3;
  const MAX_NATIVE = (Number.isInteger(tilingManifest.maxNativeZoom)) ? tilingManifest.maxNativeZoom : 0;
  const TILE_EXT = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(tilingManifest) : "jpg";

  // Exposé (window._tilingV2State) pour le nettoyage au changement de plan.
  const state = {
    currentLevel: null,
    activeOverlays: [],        // tous les overlays du niveau, posés ou différés (`_ktaCulled`)
    blobUrlsCreated: [],       // révoquées au changement de plan
    // LRU par niveau : seuls les MAX_CACHED_LEVELS niveaux récents gardent leurs bitmaps décodés, sinon la
    // RAM croît au fil du zoom. Re-décoder au retour coûte moins qu'une fuite.
    blobAssetsByLevel: {},     // { z: [asset, ...] }
    levelLRU: [],              // MRU en fin de tableau
    repliFait: false,          // 🩸 repli baseImage posé une seule fois
    erreursPremier: 0,         // tuiles du PREMIER rendu qui ont échoué à charger
    attendusPremier: 0         // tuiles du PREMIER rendu qu'on a demandées
  };
  window._tilingV2State = state;

  // 🩸 Racine SONDÉE, reçue de chargerImage ; ne pas la recalculer ici (repli synchrone seulement).
  const RACINE_SRV = racineSrv || ktaRacineTuilesServeur(window.PLAN_CONFIG);
  if (RACINE_SRV) console.log("[Tiling V2] Racine tuiles serveur :", RACINE_SRV);

  function _cheminTuileZip(z, col, k) { return _cheminTuileZipExt(z, col, k, TILE_EXT); }

  // Niveaux gardés décodés : courant + adjacent sur mobile, un de plus ailleurs.
  const _lowMem = (typeof navigator !== "undefined"
                   && ((navigator.deviceMemory && navigator.deviceMemory < 6)
                       || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "")));
  // 🩸 Jamais ≥ 4 : le Générateur produit EXACTEMENT 4 niveaux (-3…0), l'éviction ne se déclencherait
  // jamais. Plan serveur : rien à libérer ici (URL HTTP, cache du navigateur).
  const MAX_CACHED_LEVELS = _lowMem ? 2 : 3;

  // URL d'une tuile : blob URL créée au premier appel puis réutilisée, rangée dans le seau LRU du niveau.
  function _resoudreUrlTuile(z, col, k) {
    const path = _cheminTuileZip(z, col, k);
    const asset = window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[path];
    if (!asset) {
      // Plan serveur : HTTP. null hors serveur = vraie tuile manquante.
      return RACINE_SRV
        ? RACINE_SRV + "/z" + z + "/x" + col + "_y" + (-k) + "." + TILE_EXT
        : null;
    }
    if (!asset.url && asset.file) {
      asset.url = URL.createObjectURL(asset.file);
      state.blobUrlsCreated.push(asset.url);
      if (!state.blobAssetsByLevel[z]) state.blobAssetsByLevel[z] = [];
      state.blobAssetsByLevel[z].push(asset);
    }
    return asset.url || path;
  }

  // z devient le plus récent ; les niveaux au-delà du cap perdent leur blob URL (bitmap libéré) ET leur
  // File s'ils ont un `_zipPath` (_extractLazyAsset le recrée depuis window._lazyZipRef) : c'est le File
  // qui pèse. 🩸 Un asset sans `_zipPath` garde son File : rien ne pourrait le ré-extraire.
  function _trimLevelsLRU(currentZ) {
    const i = state.levelLRU.indexOf(currentZ);
    if (i >= 0) state.levelLRU.splice(i, 1);
    state.levelLRU.push(currentZ);
    while (state.levelLRU.length > MAX_CACHED_LEVELS) {
      const oldZ = state.levelLRU.shift();
      const assets = state.blobAssetsByLevel[oldZ];
      if (!assets) continue;
      let urlsLib = 0, filesLib = 0;
      assets.forEach(function(a) {
        if (a && a.url) {
          try { URL.revokeObjectURL(a.url); } catch(e) {}
          a.url = null;
          urlsLib++;
        }
        if (a && a.file && a._zipPath) {
          a.file = null;
          filesLib++;
        }
      });
      delete state.blobAssetsByLevel[oldZ];
      console.log("[Tiling V2] LRU : niveau z=" + oldZ + " révoqué (" + urlsLib + " URLs + " + filesLib + " fichiers libérés sur " + assets.length + " tuiles)");
    }
  }

  // Niveau = zoom arrondi, borné aux niveaux générés.
  // 🩸 null tant que la carte n'a pas de vue (le tuilage s'initialise avant le fitBounds) : sinon un rendu
  // fantôme « z=NaN » consomme le drapeau « premier rendu » et le repli d'erreur ne se déclenche plus jamais.
  function _choisirNiveau(mapZoom) {
    if (!Number.isFinite(mapZoom)) return null;
    const z = Math.max(MIN_NATIVE, Math.min(MAX_NATIVE, Math.round(mapZoom)));
    return z;
  }

  // Overlays du niveau z. Les tuiles lazy ou évincées (file null + `_zipPath`) sont ré-extraites AVANT la
  // boucle. Jeton monotone : un zoom plus récent invalide le rendu en cours.
  async function _renderNiveau(z) {
    state.renderToken = (state.renderToken || 0) + 1;
    const myToken = state.renderToken;

    const scale = Math.pow(2, -z);       // z=0 → 1, z=-1 → 2, z=-2 → 4, z=-3 → 8
    const lvlW  = Math.ceil(W / scale);
    const lvlH  = Math.ceil(H / scale);
    const cols  = Math.ceil(lvlW / TILE_SIZE);
    const rows  = Math.ceil(lvlH / TILE_SIZE);

    // Pendant l'extraction, les anciens overlays restent affichés (pas de flash blanc).
    if (typeof window._extractLazyAsset === "function" && window.RUNTIME_ASSETS) {
      const aExtraire = [];
      for (let k = 1; k <= rows; k++) {
        for (let col = 0; col < cols; col++) {
          const path = _cheminTuileZip(z, col, k);
          const asset = window.RUNTIME_ASSETS[path];
          if (asset && !asset.file && asset._zipPath) {
            aExtraire.push(path);
          }
        }
      }
      if (aExtraire.length > 0) {
        const tDebut = Date.now();
        await Promise.all(aExtraire.map(function(p) {
          return window._extractLazyAsset(p).catch(function(e) {
            console.warn("[Tiling V2] Pre-extract failed for", p, e);
            return null;
          });
        }));
        console.log("[Tiling V2] Lazy : " + aExtraire.length + " tuile(s) extraite(s) pour z=" + z + " en " + (Date.now() - tDebut) + " ms");
      }
    }

    if (myToken !== state.renderToken) {
      console.log("[Tiling V2] z=" + z + " obsolète (token " + myToken + " != " + state.renderToken + ") — render annulé");
      return;
    }

    state.activeOverlays.forEach(function(o) { try { o.remove(); } catch(e) {} });
    state.activeOverlays = [];

    let added = 0, missing = 0, differees = 0;
    // Capturé AVANT la boucle : state.currentLevel est réaffecté juste après.
    const premierRendu = (state.currentLevel === null);
    // Seules les tuiles proches de l'écran sont posées (donc demandées) ; les autres attendent, marquées.
    const zoneVue = _zoneTuilesV2(map);
    for (let k = 1; k <= rows; k++) {
      for (let col = 0; col < cols; col++) {
        const url = _resoudreUrlTuile(z, col, k);
        if (!url) { missing++; continue; }

        // CRS.Simple : lat = H - y. Une tuile partielle dépasse H (haut) ou W (droite), cf ktaRognerTuile.
        const latMin = (k - 1) * TILE_SIZE * scale;
        const latMax = k       * TILE_SIZE * scale;
        const lngMin = col       * TILE_SIZE * scale;
        const lngMax = (col + 1) * TILE_SIZE * scale;

        const tileBounds = [[latMin, lngMin], [latMax, lngMax]];
        const overlay = L.imageOverlay(url, tileBounds, {
          interactive: false,
          pane: "tilePane"   // sous les vecteurs et les icônes
        });
        ktaRognerTuile(overlay, ktaRemplissageTuile(W, H, TILE_SIZE, scale, col, k));   // remplissage des bords masqué
        // 🩸 Déploiement serveur raté : une URL HTTP « résout » toujours, même en 404, donc `added` ne dit rien ;
        // c'est l'événement `error` qui parle. Toutes les tuiles du premier rendu en erreur → repli baseImage.
        // Lu sur `premierRendu` (local) : state.currentLevel est déjà réaffecté quand l'erreur arrive.
        overlay.on("error", function () {
          if (!premierRendu || state.repliFait) return;
          state.erreursPremier++;
          if (state.attendusPremier > 0 && state.erreursPremier >= state.attendusPremier) {
            _repliBaseImage("les " + state.attendusPremier + " tuiles du premier rendu ont échoué au chargement");
          }
        });
        let proche = true;
        if (zoneVue) {
          try { proche = zoneVue.intersects(L.latLngBounds(tileBounds)); } catch(e) { proche = true; }
        }
        // Fond masqué par le filtre niveau : la tuile reste hors carte mais suivie dans activeOverlays.
        if (!window._ktaBaseHidden && proche) {
          overlay.addTo(map);
          added++;
        } else {
          overlay._ktaCulled = true;   // reprise par ktaCullerTuilesV2 / le filtre niveau
          differees++;
        }
        state.activeOverlays.push(overlay);
      }
    }
    // Le repli d'erreur compte les tuiles réellement DEMANDÉES au premier rendu.
    if (premierRendu) state.attendusPremier = added;
    state.currentLevel = z;
    _trimLevelsLRU(z);
    console.log("[Tiling V2] Niveau z=" + z + " — " + added + " tuiles affichées" +
                (differees > 0 ? ", " + differees + " hors écran en attente" : "") +
                (missing > 0 ? " (" + missing + " manquantes)" : ""));

    // 🩸 Repli d'erreur, pas un mode : tuiles inatteignables → image entière plutôt qu'une carte blanche
    // muette. Déclencheurs : aucune tuile résolue, ou toutes celles du premier rendu en erreur. Une seule
    // fois par chargement, sinon chaque zoom empile un overlay plein format.
    function _repliBaseImage(motif) {
      if (state.repliFait) return;
      state.repliFait = true;
      console.error("[Tiling V2] " + motif + " — repli sur baseImage. " +
                    "Plan V2 servi en HTTP : les tuiles doivent être dans « " +
                    (RACINE_SRV || "<dossier du plan>/tiles") + " ».");
      try {
        const ovRepli = L.imageOverlay(urlBase, bounds).addTo(map);
        window._ktaBaseLayers.push(ovRepli);
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(
            (window.I18n && window.I18n.t)
              ? window.I18n.t("tiling.v2.repli")
              : "Tuiles introuvables — image entière affichée.",
            "warn");
        }
      } catch (e) {
        console.error("[Tiling V2] Repli baseImage impossible :", e);
      }
    }

    // Résolue = posée OU différée (hors écran).
    const resolues = added + differees;
    if (resolues === 0 && missing > 0) {
      _repliBaseImage("AUCUNE tuile résolue (" + missing + " manquantes)");
    }
  }

  function _onZoom() {
    const z = _choisirNiveau(map.getZoom());
    if (z === null) return;                    // pas encore de vue
    if (z !== state.currentLevel) _renderNiveau(z);
  }
  map.on("zoomend", _onZoom);
  map.on("moveend zoomend", window.ktaCullerTuilesV2Throttle);

  // Sans vue encore (fitBounds après), on attend : le premier VRAI rendu garde son drapeau et le repli reste
  // armé. zoomend et whenReady peuvent arriver tous deux : le second voit currentLevel posé.
  const zInitial = _choisirNiveau(map.getZoom());
  if (zInitial !== null) {
    _renderNiveau(zInitial);
  } else {
    map.whenReady(function() {
      const z = _choisirNiveau(map.getZoom());
      if (z !== null && state.currentLevel === null) _renderNiveau(z);
    });
  }

  // Retour lu par main.js > _libererRessourcesPlanPrecedent ; le nettoyage V2 complet passe par
  // window._libererTuilesV2.
  state.zoomHandler = _onZoom;
  return state.activeOverlays;
}

// Nettoyage V2, appelé par main.js > _libererRessourcesPlanPrecedent.
window._libererTuilesV2 = function() {
  const state = window._tilingV2State;
  if (!state) return;
  if (window.map && state.zoomHandler) {
    try { window.map.off("zoomend", state.zoomHandler); } catch(e) {}
  }
  if (window.map) {
    try { window.map.off("moveend zoomend", window.ktaCullerTuilesV2Throttle); } catch(e) {}
  }
  state.activeOverlays.forEach(function(o) { try { o.remove(); } catch(e) {} });
  state.activeOverlays = [];
  state.blobUrlsCreated.forEach(function(u) {
    try { URL.revokeObjectURL(u); } catch(e) {}
  });
  state.blobUrlsCreated = [];
  state.blobAssetsByLevel = {};
  state.levelLRU = [];
  // Filet : RUNTIME_ASSETS est normalement vidé au changement de plan.
  if (window.RUNTIME_ASSETS) {
    Object.keys(window.RUNTIME_ASSETS).forEach(function(k) {
      if (k.startsWith("data/tiles/")) {
        const a = window.RUNTIME_ASSETS[k];
        if (a && a.lazy === true) a.url = null;
      }
    });
  }
  window._tilingV2State = null;
  console.log("[Tiling V2] Cleanup OK");
};

// ── Tuilage runtime V1 ──────────────
async function chargerImageTuillee(url, bounds, map, sourceFile, params) {
  if (!params) params = PERF_PRESETS.balanced;

  const W = bounds[1][1];
  const H = bounds[1][0];

  let srcBlob = null;
  if (sourceFile instanceof File || sourceFile instanceof Blob) {
    srcBlob = sourceFile;
  } else if (url.startsWith("blob:")) {
    const asset = Object.values(window.RUNTIME_ASSETS || {}).find(function(a) {
      return a.url === url;
    });
    if (asset?.file) srcBlob = asset.file;
  }

  // Le blob est passé tel quel : _imageVersCanvasReduit crée ET révoque sa Blob URL après chargement.
  const workCanvas = srcBlob
    ? await _imageVersCanvasReduit(null, W, H, srcBlob, params.maxWorkDim)
    : await _imageVersCanvasReduit(url, W, H, null, params.maxWorkDim);

  if (!workCanvas) {
    console.warn("[Tiling] Canvas impossible — fallback imageOverlay direct");
    L.imageOverlay(url, bounds).addTo(map);
    return [];
  }

  const overlays = await _tilerDepuisCanvas(workCanvas, W, H, map, params);
  workCanvas.width  = 0;
  workCanvas.height = 0;

  console.log("[Tiling]", overlays.length, "tuiles chargées");
  return overlays;
}

// Image → canvas réduit. ⚠️ Un <img> et non createImageBitmap : Safari iOS gère mieux la mémoire des gros JPEG.
function _imageVersCanvasReduit(url, targetW, targetH, srcBlob, maxWorkDim) {
  const dimMax = (typeof maxWorkDim === "number") ? maxWorkDim : 8192;
  return new Promise(function(resolve) {
    // Blob URL créée ici, révoquée seulement après le onload.
    let localUrl = url;
    if (srcBlob) {
      localUrl = URL.createObjectURL(srcBlob);
      console.log("[Tiling] Blob URL créée depuis", srcBlob.name || "blob");
    }

    const img = new Image();

    img.onload = function() {
      if (srcBlob) URL.revokeObjectURL(localUrl);

      try {
        const naturalW = img.naturalWidth  || targetW;
        const naturalH = img.naturalHeight || targetH;

        let workW = naturalW;
        let workH = naturalH;
        if (naturalW > dimMax || naturalH > dimMax) {
          const ratio = Math.min(dimMax / naturalW, dimMax / naturalH);
          workW = Math.round(naturalW * ratio);
          workH = Math.round(naturalH * ratio);
          console.log("[Tiling] Réduction", naturalW+"×"+naturalH, "→", workW+"×"+workH, "(max "+dimMax+")");
        }

        const canvas = document.createElement('canvas');
        canvas.width  = workW;
        canvas.height = workH;
        const ctx = canvas.getContext('2d');

        // Alpha détecté AVANT de peindre : une source transparente le garde de bout en bout (pas de fond).
        const hasAlpha = (typeof window.ktaDetecterAlpha === "function")
          ? window.ktaDetecterAlpha(img)
          : false;
        canvas._ktaHasAlpha = hasAlpha;
        if (hasAlpha) console.log("[Tiling] Source transparente — alpha conservé (pas de fond)");

        // Fond charte #0a0d18 (aucun si alpha). ⚠️ Jamais #000000 pur : la détection « canvas noir » ci-dessous
        // teste un pixel (0,0,0) opaque et ferait un faux positif.
        if (!hasAlpha) {
          ctx.fillStyle = "#0a0d18";
          ctx.fillRect(0, 0, workW, workH);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, workW, workH);

        // 🩸 Canvas noir = drawImage JPEG échoué en silence. Seul un pixel OPAQUE compte (0,0,0,0 est légitime).
        let estNoir = false;
        try {
          const px = ctx.getImageData(1, 1, 1, 1).data;
          estNoir = (px[0] === 0 && px[1] === 0 && px[2] === 0 && px[3] === 255);
        } catch(e) {}

        if (estNoir) {
          console.warn("[Tiling] Canvas noir — re-essai dans 100ms");
          setTimeout(function() {
            if (hasAlpha) {
              ctx.clearRect(0, 0, workW, workH);
            } else {
              ctx.fillStyle = "#0a0d18";
              ctx.fillRect(0, 0, workW, workH);
            }
            ctx.drawImage(img, 0, 0, workW, workH);
            let encoreNoir = false;
            try {
              const px2 = ctx.getImageData(1, 1, 1, 1).data;
              encoreNoir = (px2[0] === 0 && px2[1] === 0 && px2[2] === 0 && px2[3] === 255);
            } catch(e) {}
            if (encoreNoir) {
              console.error("[Tiling] Canvas toujours noir après re-essai — image non dessinable à cette taille");
            }
            img.src = "";
            resolve(encoreNoir ? null : canvas);
          }, 100);
          return;
        }

        img.src = "";
        resolve(canvas);

      } catch(err) {
        console.error("[Tiling] Erreur canvas :", err);
        img.src = "";
        resolve(null);
      }
    };

    img.onerror = function() {
      if (srcBlob) URL.revokeObjectURL(localUrl);
      console.error("[Tiling] Impossible de charger :", localUrl);
      resolve(null);
    };

    requestAnimationFrame(function() { img.src = localUrl; });
  });
}

async function _tilerDepuisCanvas(srcCanvas, W, H, map, params) {
  if (!params) params = PERF_PRESETS.balanced;
  const tileSize    = params.tileSize;
  const jpegQuality = params.jpegQuality;

  const workW  = srcCanvas.width;
  const workH  = srcCanvas.height;
  const scaleX = workW / W;
  const scaleY = workH / H;
  const nbX    = Math.ceil(W / tileSize);
  const nbY    = Math.ceil(H / tileSize);

  // Source avec alpha (drapeau de _imageVersCanvasReduit) : tuiles sans fond, WebP sinon PNG. Sinon JPEG + fond.
  const hasAlpha = !!srcCanvas._ktaHasAlpha;
  const fmt = hasAlpha
    ? await window.ktaProbeAlphaTileFormat()
    : { mime: "image/jpeg", ext: "jpg", name: "jpeg" };
  const fmtQuality = (fmt.mime === "image/webp") ? 0.90
                   : (fmt.mime === "image/jpeg") ? jpegQuality
                   : undefined;

  console.log("[Tiling]", nbX+"×"+nbY, "=", nbX*nbY, "tuiles depuis canvas", workW+"×"+workH,
              "(tile "+tileSize+", " + fmt.name + (fmtQuality ? " Q "+fmtQuality : "") +
              (hasAlpha ? ", alpha conservé" : "") + ")");

  const overlays = [];

  for (let row = 0; row < nbY; row++) {
    for (let col = 0; col < nbX; col++) {
      const tileW = Math.min(tileSize, W - col * tileSize);
      const tileH = Math.min(tileSize, H - row * tileSize);
      const srcX  = Math.round(col * tileSize * scaleX);
      const srcY  = Math.round(row * tileSize * scaleY);
      const srcW  = Math.max(1, Math.round(tileW * scaleX));
      const srcH  = Math.max(1, Math.round(tileH * scaleY));

      const tuile  = document.createElement('canvas');
      tuile.width  = tileW;
      tuile.height = tileH;
      const tCtx   = tuile.getContext('2d');

      if (!hasAlpha) {
        tCtx.fillStyle = "#0a0d18";
        tCtx.fillRect(0, 0, tileW, tileH);
      }
      tCtx.drawImage(srcCanvas, srcX, srcY, srcW, srcH, 0, 0, tileW, tileH);

      const blobUrl = await _canvasToBlob(tuile, fmt.mime, fmtQuality);

      tuile.width = 0;
      tuile.height = 0;

      if (!blobUrl) continue;

      const lngMin = col * tileSize;
      const lngMax = col * tileSize + tileW;
      const latMin = H - (row * tileSize + tileH);
      const latMax = H - row * tileSize;

      const overlay = L.imageOverlay(blobUrl, [[latMin, lngMin], [latMax, lngMax]], {
        className: "kta-tile-overlay"
      });
      overlay.addTo(map);
      overlays.push({ overlay, blobUrl });
    }

    // Pause entre rangées : laisse Safari collecter la mémoire.
    await _pause();
  }

  return overlays;
}

function _canvasToBlob(canvas, format, quality) {
  return new Promise(function(resolve) {
    try {
      canvas.toBlob(function(blob) {
        resolve(blob ? URL.createObjectURL(blob) : null);
      }, format || 'image/png', quality || 1.0);
    } catch(err) {
      console.warn("[Tiling] toBlob échoué :", err);
      resolve(null);
    }
  });
}

function _pause() {
  return new Promise(function(resolve) { setTimeout(resolve, 16); });
}

function libererTuiles(overlays, map) {
  if (!Array.isArray(overlays)) return;
  overlays.forEach(function(t) {
    // 🩸 Vider img.src AVANT removeLayer : sinon WebKit garde le bitmap décodé en mémoire native (invisible
    // dans jsHeapSizeUsed, compté dans le budget de la PWA iPhone) ; des centaines de tuiles → crash.
    try {
      if (t.overlay && t.overlay._image) t.overlay._image.src = "";
    } catch(e) {}
    try { map.removeLayer(t.overlay); } catch(e) {}
    try { URL.revokeObjectURL(t.blobUrl); } catch(e) {}
  });
}

window.chargerImage             = chargerImage;
window.chargerImageTuillee      = chargerImageTuillee;
window.libererTuiles            = libererTuiles;
window.resoudrePerfPreset       = resoudrePerfPreset;
window.PERF_PRESETS             = PERF_PRESETS;
window.PERF_AUTO_TILE_THRESHOLD = PERF_AUTO_TILE_THRESHOLD;

window.PERF_MODE_SIZE_BYTES     = PERF_AUTO_TILE_THRESHOLD;   // alias
// Pré-cache hors-ligne et export : la même dérivation que le rendu.
window.ktaRacineTuilesServeur   = ktaRacineTuilesServeur;
window.ktaTuilesV2Urls          = ktaTuilesV2Urls;
window.ktaDessinerRegionTuiles  = ktaDessinerRegionTuiles;
window.ktaTuilesSurAppareil     = ktaTuilesSurAppareil;
window.ktaRemplissageTuile      = ktaRemplissageTuile;
window.ktaRognerTuile           = ktaRognerTuile;
window.ktaCandidatsRacineTuiles = ktaCandidatsRacineTuiles;
window.ktaResoudreRacineTuiles  = ktaResoudreRacineTuiles;
