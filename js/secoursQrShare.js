/*! MyKTAMap (c) 2026 Flavien VIDAL — CC BY-NC-SA 4.0 — myktamap.fr
 *  Mode Secours Phase 4 — QR Share : partage briefing équipes via QR
 *  code (offline cataphile, anti-réseau souterrain).
 *
 *  Pattern : QR Op→Équipe (briefing focalisé sur 1 équipe) et QR
 *  Équipe→Op (observations terrain renvoyées au PC surface). Aucun
 *  fetch externe, aucune dépendance réseau — tout passe par le scan
 *  visuel du QR entre devices physiquement présents.
 *
 *  Libs externes (vanilla, no dep, MIT/Apache 2.0) :
 *    - qrcode-generator (lib/qrcode-generator.min.js) → génération
 *    - jsQR             (lib/jsqr.min.js)            → décode
 *
 *  Dépendances internes :
 *    - window.SecoursMode             (scénarios + équipes + exec)
 *    - window.MyKTAMapSecoursPhotos   (pas utilisé en C1, prévu C5)
 *    - window.OOMGuard.showToast      (feedback utilisateur)
 */
(function() {
  "use strict";

  // ═══════════════════════════════════════════════════════════════════════════
  // Constantes
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Version du format de payload QR. Bumper si on change la structure
   * (clés courtes, champs ajoutés/retirés). Le decoder valide et refuse
   * les versions inconnues pour éviter des imports corrompus.
   */
  const QR_FORMAT_VERSION = 1;

  /**
   * Niveau de correction d'erreur des QR codes générés.
   *   L = 7%   M = 15%   Q = 25%   H = 30%
   * 'M' = bon compromis taille/lisibilité sur écran de tel (sale,
   * reflets, distance ~30-50cm). 'L' rendrait les QR plus denses mais
   * fragiles ; 'H' ferait gonfler le QR (cap de payload réduit).
   */
  const QR_ERROR_CORRECTION_LEVEL = "M";

  /**
   * Type number max accepté pour le QR (auto-fit jusque là).
   *   40 = 177×177 cells = ~2.9 KB alphanum / ~4.3 KB binary
   * On laisse "auto" (= 0) à la lib, mais on cap pour fail-fast si le
   * payload est trop gros (= bug ou scénario trop riche).
   */
  const QR_MAX_TYPE_NUMBER = 40;

  /**
   * Types de payload distingués par le préfixe `t` du JSON :
   *   - "brf" → briefing Op→Équipe (1 équipe focalisée, plan + scénario + parcours)
   *   - "obs" → observations Équipe→Op (statuts + textes par étape, pas de photos)
   */
  const PAYLOAD_TYPE_BRIEFING     = "brf";
  const PAYLOAD_TYPE_OBSERVATIONS = "obs";

  /**
   * Taille du QR rendu côté UI (svg auto-scale à la largeur dispo). On
   * vise un QR visible jusqu'à ~50cm de distance pour scan fluide. La
   * version PNG sauvegardée est en haute résolution (600×600).
   */
  const QR_SVG_CELL_SIZE_PX  = 8;
  const QR_SVG_MARGIN_CELLS  = 4;     // quiet zone (norme = 4 cells min)
  const QR_PNG_TARGET_SIZE   = 600;   // px côté pour la version download/share

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers internes
  // ═══════════════════════════════════════════════════════════════════════════

  function _log(msg)  { try { console.log ("[SecoursQrShare] " + msg); } catch(e) {} }
  function _warn(msg) { try { console.warn("[SecoursQrShare] " + msg); } catch(e) {} }
  function _err(msg)  { try { console.error("[SecoursQrShare] " + msg); } catch(e) {} }

  /**
   * Toast court (réutilise OOMGuard.showToast si dispo, sinon console).
   */
  function _toast(msg, type) {
    type = type || "info";
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      try { window.OOMGuard.showToast(msg, type); return; } catch(e) {}
    }
    _log("[toast/" + type + "] " + msg);
  }

  /**
   * Check disponibilité des libs externes au boot. Loggue warn explicite
   * si une lib manque (= problème de cache SW ou ordre de scripts cassé).
   */
  function _checkLibsDispo() {
    const hasQrGen   = typeof window.qrcode === "function";
    const hasJsQR    = typeof window.jsQR    === "function";
    if (!hasQrGen) _warn("⚠️ window.qrcode (qrcode-generator) absent — génération QR indispo");
    if (!hasJsQR)  _warn("⚠️ window.jsQR (jsQR) absent — scan QR indispo");
    return hasQrGen && hasJsQR;
  }

  /**
   * Slugify pour les noms de fichier téléchargés (ASCII, sans caractères
   * spéciaux, séparé par tirets). Tronque à 40 chars max.
   */
  function _slugify(s) {
    if (!s || typeof s !== "string") return "equipe";
    return s.normalize("NFD")
            .replace(/[̀-ͯ]/g, "")        // accents
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .substring(0, 40) || "equipe";
  }

  /**
   * Échappe une string pour usage dans attribut HTML (paranoïa XSS — les
   * payloads décodés peuvent venir d'un QR malveillant).
   */
  function _escHtml(s) {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Sérialisation payload — clés courtes pour rester sous le cap QR v40
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compacte un waypoint {x, y, level?, label?, pointId?} en object minimal
   * pour le payload QR. Omet les champs falsy pour économiser des bytes.
   *
   * @param {object} pt - waypoint {x, y, level?, label?, pointId?}
   * @returns {object|null} {x, y, l?, lb?, pi?} ou null si pt invalide
   */
  function _pointCompact(pt) {
    if (!pt || typeof pt.x !== "number" || typeof pt.y !== "number") return null;
    const out = { x: pt.x, y: pt.y };
    if (typeof pt.level === "number") out.l = pt.level;
    // Label : on tronque à 30 chars pour éviter d'exploser le payload
    if (pt.label && typeof pt.label === "string" && pt.label.trim()) {
      out.lb = pt.label.trim().substring(0, 30);
    }
    if (pt.pointId && typeof pt.pointId === "string") out.pi = pt.pointId;
    return out;
  }

  /**
   * Reverse de _pointCompact : reconstruit un waypoint au format
   * SecoursMode {x, y, level, label, pointId} depuis le format compact.
   */
  function _pointExpand(c) {
    if (!c || typeof c.x !== "number" || typeof c.y !== "number") return null;
    return {
      x:       c.x,
      y:       c.y,
      level:   (typeof c.l === "number") ? c.l : null,
      label:   (typeof c.lb === "string") ? c.lb : "",
      pointId: (typeof c.pi === "string") ? c.pi : null
    };
  }

  /**
   * Sérialise un briefing équipe en payload JSON compact.
   *
   * Format (clés courtes pour minimiser la taille — chaque char économisé
   * compte pour rester sous QR v40 = ~2.9 KB binary) :
   *
   * {
   *   t:  "brf",                            // type briefing
   *   v:  1,                                // version format
   *   ts: 1747923456789,                    // timestamp génération
   *   p:  { i, n, w, h, m, l },             // plan : id, nom, imgW, imgH, multiLevel, [availableLevels]
   *   s:  { i, n, ia, lkx, lky, lkl, rm, no },  // scenario context essentiel
   *   e:  {                                 // équipe focalisée
   *     i, n, c, m, l,                      // id, nom, couleurIdx, membres, level
   *     en, so,                             // entree {x,y,l,lb,pi?}, sortie idem
   *     in: [ {x, y, l, lb, pi?} ],         // intermediaires (clé "in" car "interm" trop long)
   *     zt, zp, zr,                         // zoneType, zonePolygon, zoneRoadIds
   *     is, dm, du,                         // itineraireSuggere, distanceM, dureeMin
   *     st                                  // statut
   *   }
   * }
   *
   * @param {object} scenario - scénario complet (cf §65 modèle données)
   * @param {object} equipe   - équipe du scénario à embarquer
   * @returns {object} payload compact prêt à JSON.stringify + QR encode
   */
  function _serializerBriefing(scenario, equipe) {
    if (!scenario || !equipe) {
      throw new Error("_serializerBriefing : scenario et equipe requis");
    }

    // Plan minimal (lecture défensive de PLAN_CONFIG)
    const pc        = window.PLAN_CONFIG || {};
    const planMeta  = pc.plan || {};
    const planId    = window._currentLoadedPlanId
                   || (planMeta.id || planMeta.name || "")
                   || "unknown";
    const p = {
      i: planId,
      n: (planMeta.name || planMeta.title || "Plan").substring(0, 60),
      w: planMeta.imageWidth  || 0,
      h: planMeta.imageHeight || 0
    };
    if (planMeta.multiLevel === true) {
      p.m = 1;  // 1 = true (économie : 1 byte au lieu de 4)
      if (Array.isArray(pc.availableLevels)) p.l = pc.availableLevels.slice();
      else if (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.availableLevels)) {
        p.l = window.APP_CONFIG.availableLevels.slice();
      }
    }

    // Contexte scénario essentiel (notes tronquées à 500 chars)
    const ctx = scenario.context || {};
    const s = {
      i: scenario.id || "",
      n: (scenario.nom || "Scénario").substring(0, 80)
    };
    if (ctx.incidentAt) s.ia = ctx.incidentAt;
    if (ctx.lastKnownPoint && typeof ctx.lastKnownPoint.x === "number") {
      s.lkx = ctx.lastKnownPoint.x;
      s.lky = ctx.lastKnownPoint.y;
      if (typeof ctx.lastKnownPoint.level === "number") s.lkl = ctx.lastKnownPoint.level;
    }
    if (ctx.zoneIncertitude && typeof ctx.zoneIncertitude.radiusMeters === "number") {
      s.rm = ctx.zoneIncertitude.radiusMeters;
    }
    if (ctx.notes && typeof ctx.notes === "string") {
      s.no = ctx.notes.substring(0, 500);
    }

    // Équipe focalisée — tous les champs essentiels pour l'exécution
    const e = {
      i:  equipe.id,
      n:  (equipe.nom || "Équipe").substring(0, 40),
      c:  (typeof equipe.couleurIdx === "number") ? equipe.couleurIdx : 0
    };
    if (Array.isArray(equipe.membres) && equipe.membres.length > 0) {
      e.m = equipe.membres.slice(0, 20);  // cap 20 membres (rare en pratique)
    }
    if (typeof equipe.level === "number") e.l = equipe.level;

    // Waypoints du parcours
    const en = _pointCompact(equipe.entree);
    const so = _pointCompact(equipe.sortie);
    if (en) e.en = en;
    if (so) e.so = so;
    if (Array.isArray(equipe.intermediaires) && equipe.intermediaires.length > 0) {
      e.in = equipe.intermediaires
                   .map(_pointCompact)
                   .filter(function(x) { return x !== null; });
    }

    // Zone de recherche
    if (equipe.zoneType === "polygon" && Array.isArray(equipe.zonePolygon)) {
      e.zt = "polygon";
      e.zp = equipe.zonePolygon.map(_pointCompact).filter(Boolean);
    } else if (equipe.zoneType === "roads" && Array.isArray(equipe.zoneRoadIds)) {
      e.zt = "roads";
      e.zr = equipe.zoneRoadIds.slice();
    }

    // Itinéraire pré-calculé (compact)
    if (Array.isArray(equipe.itineraireSuggere) && equipe.itineraireSuggere.length > 0) {
      e.is = equipe.itineraireSuggere.map(_pointCompact).filter(Boolean);
    }
    if (typeof equipe.distanceM       === "number") e.dm = Math.round(equipe.distanceM);
    if (typeof equipe.dureeEstimeeMin === "number") e.du = Math.round(equipe.dureeEstimeeMin);
    if (equipe.statut) e.st = equipe.statut;

    return {
      t:  PAYLOAD_TYPE_BRIEFING,
      v:  QR_FORMAT_VERSION,
      ts: Date.now(),
      p:  p,
      s:  s,
      e:  e
    };
  }

  /**
   * Désérialise un payload briefing décodé depuis un QR.
   *
   * @param {object} payload - objet JSON parsé depuis le QR
   * @returns {object} {ok, error?, scenario?, equipe?, planMeta?}
   *                   — scenario et equipe sont au format SecoursMode (pas compact)
   *                   — planMeta : {id, name, imageWidth, imageHeight, multiLevel?, availableLevels?}
   */
  function _deserializerBriefing(payload) {
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: "Payload absent ou invalide" };
    }
    if (payload.t !== PAYLOAD_TYPE_BRIEFING) {
      return { ok: false, error: "Type incompatible (attendu '" + PAYLOAD_TYPE_BRIEFING + "', lu '" + payload.t + "')" };
    }
    if (payload.v !== QR_FORMAT_VERSION) {
      return { ok: false, error: "Version incompatible (lu " + payload.v + ", attendu " + QR_FORMAT_VERSION + ")" };
    }
    if (!payload.p || !payload.s || !payload.e) {
      return { ok: false, error: "Sections plan/scenario/équipe manquantes" };
    }

    // Plan meta
    const p = payload.p;
    const planMeta = {
      id:          p.i || "",
      name:        p.n || "Plan",
      imageWidth:  p.w || 0,
      imageHeight: p.h || 0
    };
    if (p.m === 1 || p.m === true) {
      planMeta.multiLevel = true;
      if (Array.isArray(p.l)) planMeta.availableLevels = p.l.slice();
    }

    // Scenario
    const s = payload.s;
    const scenario = {
      id:        s.i || "",
      nom:       s.n || "Scénario importé",
      context:   {}
    };
    if (s.ia) scenario.context.incidentAt = s.ia;
    if (typeof s.lkx === "number" && typeof s.lky === "number") {
      scenario.context.lastKnownPoint = {
        x:     s.lkx,
        y:     s.lky,
        level: (typeof s.lkl === "number") ? s.lkl : null,
        label: "Dernière position connue"
      };
    }
    if (typeof s.rm === "number") {
      scenario.context.zoneIncertitude = { radiusMeters: s.rm };
    }
    if (typeof s.no === "string") scenario.context.notes = s.no;

    // Équipe focalisée
    const e = payload.e;
    if (!e.i || !e.n) {
      return { ok: false, error: "Équipe sans id ou nom" };
    }
    const equipe = {
      id:                e.i,
      nom:               e.n,
      couleurIdx:        (typeof e.c === "number") ? e.c : 0,
      membres:           Array.isArray(e.m) ? e.m.slice() : [],
      level:             (typeof e.l === "number") ? e.l : null,
      entree:            _pointExpand(e.en),
      sortie:            _pointExpand(e.so),
      intermediaires:    Array.isArray(e.in) ? e.in.map(_pointExpand).filter(Boolean) : [],
      zoneType:          null,
      zonePolygon:       null,
      zoneRoadIds:       null,
      itineraireSuggere: Array.isArray(e.is) ? e.is.map(_pointExpand).filter(Boolean) : null,
      distanceM:         (typeof e.dm === "number") ? e.dm : null,
      dureeEstimeeMin:   (typeof e.du === "number") ? e.du : null,
      statut:            e.st || "non_demarré",
      observations:      ""
    };
    if (e.zt === "polygon" && Array.isArray(e.zp)) {
      equipe.zoneType    = "polygon";
      equipe.zonePolygon = e.zp.map(_pointExpand).filter(Boolean);
    } else if (e.zt === "roads" && Array.isArray(e.zr)) {
      equipe.zoneType    = "roads";
      equipe.zoneRoadIds = e.zr.slice();
    }

    return { ok: true, scenario: scenario, equipe: equipe, planMeta: planMeta };
  }

  /**
   * Sérialise les observations terrain d'une équipe en payload compact.
   * Pas de photos dans le QR (cf KARMA 9:a). Les photos restent sur le
   * device équipe et seront partagées via le rapport PDF/JSON exporté.
   *
   * Format :
   * {
   *   t:  "obs",
   *   v:  1,
   *   ts: ...,
   *   si: scenarioId,
   *   ei: equipeId,
   *   r:  "equipe" | "secouriste",
   *   o:  [ { i, s, o, st, ct } ],          // observations par étape
   *   nl: [ { i, ts, s, t } ]               // notes libres (si role=secouriste)
   * }
   */
  function _serializerObservations(scenario, equipeId) {
    // TODO C4 : implémentation complète
    return {
      t:  PAYLOAD_TYPE_OBSERVATIONS,
      v:  QR_FORMAT_VERSION,
      ts: Date.now()
    };
  }

  function _deserializerObservations(payload) {
    // TODO C4 : implémentation complète
    if (!payload || payload.t !== PAYLOAD_TYPE_OBSERVATIONS) {
      return { ok: false, error: "Type de payload incompatible (attendu '" + PAYLOAD_TYPE_OBSERVATIONS + "')" };
    }
    return { ok: false, error: "Désérialisation non implémentée (C4 à venir)" };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Rendu QR — SVG (UI) + Canvas/PNG (download/share)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Génère un objet QR depuis un payload JSON. Encode en mode Byte
   * (binaire UTF-8) sans passer par base64 (économie ~33% de taille).
   *
   * @param {object} payload - objet JSON sérialisable
   * @returns {object} {qr, payloadStr, payloadBytes, typeNumber, cellCount}
   * @throws si la lib qrcode-generator n'est pas chargée OU si le payload
   *         dépasse le cap QR_MAX_TYPE_NUMBER (v40)
   */
  function _genererQrFromPayload(payload) {
    if (typeof window.qrcode !== "function") {
      throw new Error("Lib qrcode-generator non chargée");
    }
    const payloadStr = JSON.stringify(payload);
    if (!payloadStr) throw new Error("Payload vide");

    // Auto-fit : type 0 = la lib choisit la version min qui rentre
    const qr = window.qrcode(0, QR_ERROR_CORRECTION_LEVEL);
    qr.addData(payloadStr, "Byte");

    // Tentative make() — peut throw si payload trop gros pour ECC niveau M
    // à n'importe quelle version ≤ 40
    try {
      qr.make();
    } catch (e) {
      throw new Error("Payload trop volumineux pour un QR v40 niveau M (" + payloadStr.length + " bytes JSON). " +
                      "Réduire le contexte ou les intermédiaires.");
    }

    const cellCount = qr.getModuleCount();
    // Approximation type number depuis cellCount : v1=21, v2=25, ..., vN=17+4N
    const typeNumber = Math.round((cellCount - 17) / 4);
    if (typeNumber > QR_MAX_TYPE_NUMBER) {
      throw new Error("QR généré dépasse le cap v" + QR_MAX_TYPE_NUMBER + " (atteint v" + typeNumber + ")");
    }

    return {
      qr:           qr,
      payloadStr:   payloadStr,
      payloadBytes: payloadStr.length,
      typeNumber:   typeNumber,
      cellCount:    cellCount
    };
  }

  /**
   * Génère le SVG d'un QR pour affichage dans la modale. Auto-scale via
   * width/height en CSS — le SVG n'est pas raster donc reste net à tout
   * zoom (utile pour l'user qui zoom sur son tel pour faciliter le scan).
   */
  function _qrToSvg(qrInfo, cellSize, margin) {
    cellSize = cellSize || QR_SVG_CELL_SIZE_PX;
    margin   = (margin != null) ? margin : QR_SVG_MARGIN_CELLS;
    return qrInfo.qr.createSvgTag({
      cellSize: cellSize,
      margin:   margin,
      scalable: true
    });
  }

  /**
   * Rend un QR sur un canvas haute résolution (pour download PNG ou
   * partage natif Web Share API). Cells noires sur fond blanc, quiet zone
   * de QR_SVG_MARGIN_CELLS cells.
   *
   * @param {object} qrInfo - {qr, cellCount}
   * @param {number} targetSize - taille px du canvas final (carré)
   * @returns {HTMLCanvasElement}
   */
  function _qrToCanvas(qrInfo, targetSize) {
    targetSize = targetSize || QR_PNG_TARGET_SIZE;
    const cells     = qrInfo.cellCount;
    const margin    = QR_SVG_MARGIN_CELLS;
    const totalCells = cells + 2 * margin;
    // Cell size en px (round down pour éviter overflow)
    const cellPx = Math.max(1, Math.floor(targetSize / totalCells));
    const realSize = cellPx * totalCells;

    const canvas = document.createElement("canvas");
    canvas.width  = realSize;
    canvas.height = realSize;
    const ctx = canvas.getContext("2d");

    // Fond blanc
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, realSize, realSize);

    // Cellules noires
    ctx.fillStyle = "#000000";
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        if (qrInfo.qr.isDark(row, col)) {
          ctx.fillRect(
            (col + margin) * cellPx,
            (row + margin) * cellPx,
            cellPx,
            cellPx
          );
        }
      }
    }

    return canvas;
  }

  /**
   * Convertit un canvas en Blob PNG via toBlob (async).
   */
  function _canvasToPngBlob(canvas) {
    return new Promise(function(resolve, reject) {
      if (!canvas || typeof canvas.toBlob !== "function") {
        return reject(new Error("Canvas invalide ou toBlob indispo"));
      }
      canvas.toBlob(function(blob) {
        if (!blob) return reject(new Error("toBlob a retourné null"));
        resolve(blob);
      }, "image/png");
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Download + Web Share API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Déclenche un download PNG en local via <a download>.
   */
  function _downloadPngBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1500);
  }

  /**
   * Tente le partage via Web Share API niveau 2 (fichiers). Fallback
   * silencieux false si pas supporté.
   *
   * @param {Blob} blob - PNG du QR
   * @param {string} filename - nom suggéré du fichier
   * @param {string} title - titre du partage (sera affiché dans WhatsApp/etc.)
   * @returns {Promise<boolean>} true si partagé, false si pas supporté ou cancel
   */
  async function _partagerPngBlob(blob, filename, title, text) {
    if (typeof navigator === "undefined") return false;
    if (typeof navigator.share !== "function") return false;

    let file;
    try {
      file = new File([blob], filename, { type: "image/png" });
    } catch (e) {
      // Vieux iOS : File constructor pas supporté → fallback
      return false;
    }

    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
      return false;
    }

    try {
      await navigator.share({
        files: [file],
        title: title || "Briefing MyKTAMap",
        text:  text  || "Scan ce QR avec MyKTAMap pour charger le briefing."
      });
      return true;
    } catch (e) {
      // AbortError = user a annulé le menu de partage → silent
      // Autres erreurs = pas supporté côté browser
      if (e && e.name === "AbortError") return false;
      _warn("navigator.share() a échoué : " + (e && e.message));
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Modale UI — Partage QR Briefing Op→Équipe
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Ouvre la modale "📲 Partager briefing via QR" pour une équipe donnée
   * (côté Opérateur). Génère le QR + affiche aperçu + boutons sauvegarde/partage.
   *
   * @param {string} scenarioId
   * @param {string} equipeId
   */
  function ouvrirPartageQrBriefing(scenarioId, equipeId) {
    if (!_checkLibsDispo()) {
      _toast("⚠️ Libs QR non chargées (cache PWA ?). Re-actualise.", "error");
      return;
    }
    const SM = window.SecoursMode;
    if (!SM) {
      _toast("⚠️ Module SecoursMode indispo.", "error");
      return;
    }
    const scenario = SM.get(scenarioId);
    if (!scenario) {
      _toast("⚠️ Scénario introuvable.", "error");
      return;
    }
    const equipe = (scenario.groupes || []).find(function(g) { return g.id === equipeId; });
    if (!equipe) {
      _toast("⚠️ Équipe introuvable.", "error");
      return;
    }

    // 1) Sérialisation + génération QR
    let qrInfo, payload;
    try {
      payload = _serializerBriefing(scenario, equipe);
      qrInfo  = _genererQrFromPayload(payload);
    } catch (e) {
      _err("Génération QR échouée : " + (e && e.message));
      _toast("❌ Impossible de générer le QR : " + (e && e.message), "error");
      return;
    }

    // 2) Cleanup éventuelle modale existante
    _fermerModaleQr();

    // 3) Construction DOM
    const PALETTE = SM.PALETTE || [];
    const couleur = PALETTE[equipe.couleurIdx % PALETTE.length] || { hex: "#f4c542", nom: "" };
    const nbWp = 0
               + (equipe.entree ? 1 : 0)
               + (equipe.sortie ? 1 : 0)
               + (Array.isArray(equipe.intermediaires) ? equipe.intermediaires.length : 0);
    const stats = "QR v" + qrInfo.typeNumber + " · " + qrInfo.cellCount + "×" + qrInfo.cellCount +
                  " cells · payload " + qrInfo.payloadBytes + " bytes · ECC " + QR_ERROR_CORRECTION_LEVEL;

    const overlay = document.createElement("div");
    overlay.id = "kta-secours-qr-share-overlay";
    overlay.className = "kta-readme-modal-overlay kta-secours-qr-share-overlay";

    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-qr-share-boite" style="max-width:540px;width:100%;">' +
        '<div class="kta-readme-modal-header">' +
          '<h2 style="margin:0;">📲 Briefing QR</h2>' +
          '<button class="kta-modal-close" data-action="qr-close" title="Fermer">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-secours-qr-share-corps">' +
          '<div class="kta-secours-qr-share-info">' +
            '<span class="kta-secours-qr-share-swatch" style="background:' + couleur.hex + ';"></span>' +
            '<div class="kta-secours-qr-share-info-text">' +
              '<strong>' + _escHtml(equipe.nom) + '</strong>' +
              '<span class="kta-secours-qr-share-meta">' +
                nbWp + ' waypoint(s) · ' +
                (equipe.zoneType ? '✓ zone' : '○ pas de zone') + ' · ' +
                (equipe.itineraireSuggere ? '✓ itinéraire' : '○ pas d\'iti') +
              '</span>' +
            '</div>' +
          '</div>' +
          '<div class="kta-secours-qr-share-canvas-wrap" id="kta-secours-qr-share-canvas-wrap">' +
            _qrToSvg(qrInfo) +
          '</div>' +
          '<div class="kta-secours-qr-share-hint">' +
            '👁️ Demande à l\'équipier d\'ouvrir <strong>Mode Secours → 📲 Importer briefing QR</strong> ' +
            'sur sa version MyKTAMap et de scanner ce code. Le briefing sera importé automatiquement ' +
            'dans son plan, avec parcours et contexte (offline, sans réseau).' +
          '</div>' +
          '<div class="kta-secours-qr-share-stats">' + _escHtml(stats) + '</div>' +
          '<div class="kta-secours-qr-share-actions">' +
            '<button class="kta-btn kta-btn-secondary" data-action="qr-download" title="Télécharger le PNG">💾 Sauvegarder PNG</button>' +
            '<button class="kta-btn kta-btn-primary" data-action="qr-share" title="Partager via WhatsApp / mail / etc.">📤 Partager</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.documentElement.appendChild(overlay);

    // 4) Handlers
    function _close() { _fermerModaleQr(); }

    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) _close();
    });
    overlay.querySelector('[data-action="qr-close"]').addEventListener("click", _close);

    function _onEsc(e) {
      if (e.key === "Escape") { _close(); document.removeEventListener("keydown", _onEsc); }
    }
    document.addEventListener("keydown", _onEsc);

    // Generation canvas + actions
    const filename = "briefing-" + _slugify(equipe.nom) + "-" + (new Date().toISOString().substring(0, 10)) + ".png";

    overlay.querySelector('[data-action="qr-download"]').addEventListener("click", async function() {
      try {
        const canvas = _qrToCanvas(qrInfo, QR_PNG_TARGET_SIZE);
        const blob   = await _canvasToPngBlob(canvas);
        _downloadPngBlob(blob, filename);
        _toast("💾 PNG sauvegardé : " + filename, "info");
      } catch (e) {
        _err("Download PNG : " + e.message);
        _toast("❌ Impossible de générer le PNG : " + e.message, "error");
      }
    });

    overlay.querySelector('[data-action="qr-share"]').addEventListener("click", async function() {
      try {
        const canvas = _qrToCanvas(qrInfo, QR_PNG_TARGET_SIZE);
        const blob   = await _canvasToPngBlob(canvas);
        const title  = "Briefing " + equipe.nom;
        const text   = "Briefing MyKTAMap pour l'équipe " + equipe.nom + ". " +
                       "Ouvre l'app et scanne ce QR dans Mode Secours.";
        const ok     = await _partagerPngBlob(blob, filename, title, text);
        if (!ok) {
          // Fallback : déclenche le download (l'user partagera manuellement)
          _downloadPngBlob(blob, filename);
          _toast("📤 Partage natif indispo — PNG téléchargé, partage-le manuellement", "info");
        }
        // Si ok, le menu OS s'est ouvert. Pas de toast (l'OS prend le relais).
      } catch (e) {
        _err("Share : " + e.message);
        _toast("❌ Impossible de partager : " + e.message, "error");
      }
    });
  }

  /**
   * Ferme la modale QR Share si elle est ouverte.
   */
  function _fermerModaleQr() {
    const existing = document.getElementById("kta-secours-qr-share-overlay");
    if (existing) existing.remove();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API publique restante — stubs pour C3/C4
  // ═══════════════════════════════════════════════════════════════════════════

  function ouvrirImportQrBriefing() {
    _warn("ouvrirImportQrBriefing — implémentation C3 à venir");
    _toast("⚠️ Scan QR briefing : implémentation en cours (C3)", "info");
  }

  function ouvrirPartageQrObservations(scenarioId, equipeId) {
    _warn("ouvrirPartageQrObservations — implémentation C4 à venir");
    _toast("⚠️ QR observations : implémentation en cours (C4)", "info");
  }

  function ouvrirImportQrObservations() {
    _warn("ouvrirImportQrObservations — implémentation C4 à venir");
    _toast("⚠️ Scan QR observations : implémentation en cours (C4)", "info");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Init au boot — vérifie présence des libs externes
  // ═══════════════════════════════════════════════════════════════════════════

  function _init() {
    const libsOk = _checkLibsDispo();
    _log("Module initialisé — libs externes : " + (libsOk ? "✓ OK" : "⚠️ MANQUANTES"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Exports
  // ═══════════════════════════════════════════════════════════════════════════

  window.MyKTAMapSecoursQrShare = {
    // API publique
    ouvrirPartageQrBriefing:     ouvrirPartageQrBriefing,
    ouvrirImportQrBriefing:      ouvrirImportQrBriefing,
    ouvrirPartageQrObservations: ouvrirPartageQrObservations,
    ouvrirImportQrObservations:  ouvrirImportQrObservations,

    // Constantes exposées (pour interface.js > afficherAide etc.)
    QR_FORMAT_VERSION:           QR_FORMAT_VERSION,
    QR_ERROR_CORRECTION_LEVEL:   QR_ERROR_CORRECTION_LEVEL,
    PAYLOAD_TYPE_BRIEFING:       PAYLOAD_TYPE_BRIEFING,
    PAYLOAD_TYPE_OBSERVATIONS:   PAYLOAD_TYPE_OBSERVATIONS,

    // Helpers internes exposés pour tests + introspection (préfixe _ marque
    // qu'ils ne sont PAS API publique stable)
    _serializerBriefing:         _serializerBriefing,
    _deserializerBriefing:       _deserializerBriefing,
    _serializerObservations:     _serializerObservations,
    _deserializerObservations:   _deserializerObservations,
    _genererQrFromPayload:       _genererQrFromPayload,
    _qrToCanvas:                 _qrToCanvas,
    _canvasToPngBlob:            _canvasToPngBlob,
    _checkLibsDispo:             _checkLibsDispo,
    _fermerModaleQr:             _fermerModaleQr
  };

})();
