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
    // Label : tronqué à 20 chars (était 30 avant hotfix10) pour limiter la
    // taille payload. L'équipier peut renommer après import si besoin.
    if (pt.label && typeof pt.label === "string" && pt.label.trim()) {
      out.lb = pt.label.trim().substring(0, 20);
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
      // hotfix10 : notes tronquées à 200 chars (était 500) pour réduire payload
      s.no = ctx.notes.substring(0, 200);
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

    // Itinéraire pré-calculé : VOLONTAIREMENT NON EMBARQUÉ dans le QR
    // (hotfix10). Raisons :
    //   1. Pathfinder peut générer 50-200 points = 1.5-6 KB → dépasse
    //      régulièrement la limite QR v40 niveau M (~2.9 KB).
    //   2. L'itinéraire est entièrement DÉRIVABLE depuis entrée + sortie +
    //      intermediaires + zone : l'équipier peut le recalculer en 1 clic
    //      via "🔄 Recalculer iti" dans la vue Edit, ou auto à l'import.
    //   3. Gain typique payload : -1.5 à -6 KB → tient dans QR v15-v25
    //      (lisible même sur petit écran téléphone).
    // → on garde seulement la distance + durée estimées (~10 bytes) qui
    // sont utiles pour l'aperçu avant import même sans iti recalculé.
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
  /**
   * Sérialise les observations terrain pour renvoi Équipier→Op.
   *
   * Format (clés courtes pour rester sous QR v40) :
   * {
   *   t:  "obs",
   *   v:  1,
   *   ts: Date.now(),
   *   si: scenarioId,          // matching côté Op (= même plan, même scénario)
   *   ei: equipeId,            // matching équipe précis
   *   en: equipeNom,           // fallback humain si scenarioId ≠
   *   r:  "equipe"|"secouriste",
   *   o:  [ { i, s, o, st, ct } ],  // observations par étape (texte tronqué 200ch)
   *   nl: [ { i, ts, s, t } ]       // notes libres (mode secouriste, texte ≤ 150ch)
   * }
   *
   * Pas de photos dans le QR (cf KARMA 9:a). Les photos restent côté
   * Équipier et seront partagées via le rapport PDF/JSON exporté.
   */
  function _serializerObservations(scenario, equipeId) {
    if (!scenario) throw new Error("_serializerObservations : scenario requis");
    if (!scenario.execution) throw new Error("Aucune exécution active pour ce scénario");

    const role = scenario.execution.role;
    const equipe = (scenario.groupes || []).find(function(g) { return g.id === equipeId; });

    // Mode secouriste : pas d'équipe focalisée, on extrait _notes_libres
    if (role === "secouriste" || !equipe) {
      const notes = (scenario.execution.etapes && scenario.execution.etapes._notes_libres) || [];
      return {
        t:  PAYLOAD_TYPE_OBSERVATIONS,
        v:  QR_FORMAT_VERSION,
        ts: Date.now(),
        si: scenario.id,
        r:  "secouriste",
        nl: notes.slice(0, 30).map(function(n) {
          return {
            i:  n.id,
            ts: n.ts,
            s:  n.statut,
            t:  (n.texte || "").substring(0, 150)
          };
        })
      };
    }

    // Mode équipe : extrait les étapes de l'équipe focalisée
    const etapes = (scenario.execution.etapes && scenario.execution.etapes[equipeId]) || [];
    const obsArr = etapes.map(function(e) {
      const out = { i: e.idx };
      if (e.statut)        out.s  = e.statut;
      if (e.observations)  out.o  = e.observations.substring(0, 200);
      if (e.startedAt)     out.st = e.startedAt;
      if (e.completedAt)   out.ct = e.completedAt;
      return out;
    });

    return {
      t:  PAYLOAD_TYPE_OBSERVATIONS,
      v:  QR_FORMAT_VERSION,
      ts: Date.now(),
      si: scenario.id,
      ei: equipeId,
      en: (equipe.nom || "").substring(0, 40),
      r:  "equipe",
      o:  obsArr
    };
  }

  /**
   * Désérialise un payload observations décodé depuis un QR.
   *
   * @param {object} payload
   * @returns {object} {ok, error?, scenarioId, equipeId?, equipeNom?, role,
   *                    observations?, notesLibres?}
   */
  function _deserializerObservations(payload) {
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: "Payload absent ou invalide." };
    }
    if (payload.t !== PAYLOAD_TYPE_OBSERVATIONS) {
      return { ok: false, error: "Type incompatible (attendu '" + PAYLOAD_TYPE_OBSERVATIONS + "', lu '" + payload.t + "')" };
    }
    if (payload.v !== QR_FORMAT_VERSION) {
      return { ok: false, error: "Version incompatible (lu " + payload.v + ", attendu " + QR_FORMAT_VERSION + ")" };
    }
    if (!payload.si || typeof payload.si !== "string") {
      return { ok: false, error: "scenarioId manquant" };
    }

    const out = {
      ok:         true,
      scenarioId: payload.si,
      role:       payload.r || "equipe",
      payload:    payload
    };

    if (out.role === "secouriste") {
      // Mode secouriste : notes libres
      out.notesLibres = Array.isArray(payload.nl) ? payload.nl.map(function(n) {
        return {
          id:     n.i,
          ts:     n.ts,
          statut: n.s,
          texte:  n.t || ""
        };
      }) : [];
    } else {
      // Mode équipe : observations par étape
      if (!payload.ei || typeof payload.ei !== "string") {
        return { ok: false, error: "equipeId manquant (mode équipe)" };
      }
      out.equipeId  = payload.ei;
      out.equipeNom = payload.en || "";
      out.observations = Array.isArray(payload.o) ? payload.o.map(function(o) {
        return {
          idx:          o.i,
          statut:       o.s,
          observations: o.o || "",
          startedAt:    o.st,
          completedAt:  o.ct
        };
      }) : [];
    }

    return out;
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

    // Stratégie cascade (hotfix10) : tente d'abord ECC niveau "M" (15%, plus
    // fiable au scan), puis fallback "L" (7%, +30% de capacité) si payload
    // dépasse. Le scan reste fiable en "L" tant que le QR est net et bien
    // éclairé — c'est un compromis acceptable pour faire passer des
    // briefings volumineux (équipe avec polygon de 30+ sommets, etc.).
    function _try(eccLevel) {
      const qr = window.qrcode(0, eccLevel);
      qr.addData(payloadStr, "Byte");
      qr.make();
      const cellCount  = qr.getModuleCount();
      const typeNumber = Math.round((cellCount - 17) / 4);
      if (typeNumber > QR_MAX_TYPE_NUMBER) {
        throw new Error("QR dépasse cap v" + QR_MAX_TYPE_NUMBER + " (atteint v" + typeNumber + ")");
      }
      return { qr: qr, cellCount: cellCount, typeNumber: typeNumber, eccUsed: eccLevel };
    }

    let qrInfo;
    try {
      qrInfo = _try(QR_ERROR_CORRECTION_LEVEL);   // tentative niveau M
    } catch (eM) {
      // Retry ECC niveau L (7%) — moins robuste au scan mais +30% capacité
      try {
        qrInfo = _try("L");
        _warn("Payload " + payloadStr.length + " bytes — fallback ECC L (7%) appliqué.");
      } catch (eL) {
        // Vraiment trop gros même en L → throw user-friendly avec conseils
        throw new Error(
          "Payload trop volumineux même en ECC L (" + payloadStr.length + " bytes JSON). " +
          "Réduire la zone (polygon avec moins de sommets), " +
          "limiter les intermédiaires (max 5-7), ou raccourcir les notes contexte."
        );
      }
    }

    return {
      qr:           qrInfo.qr,
      payloadStr:   payloadStr,
      payloadBytes: payloadStr.length,
      typeNumber:   qrInfo.typeNumber,
      cellCount:    qrInfo.cellCount,
      eccUsed:      qrInfo.eccUsed
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
    // hotfix10 : l'itinéraire pré-calculé n'est pas embarqué dans le QR
    // (trop volumineux). Il sera recalculé auto à l'import via Pathfinder.
    const hasIti = Array.isArray(equipe.itineraireSuggere) && equipe.itineraireSuggere.length > 0;
    const stats = "QR v" + qrInfo.typeNumber + " · " + qrInfo.cellCount + "×" + qrInfo.cellCount +
                  " cells · payload " + qrInfo.payloadBytes + " bytes · ECC " +
                  (qrInfo.eccUsed || QR_ERROR_CORRECTION_LEVEL) +
                  (qrInfo.eccUsed === "L" ? " (auto-réduit)" : "");

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
                (hasIti ? '🔄 iti recalculé à l\'import' : '○ pas d\'iti') +
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
  // Décode QR depuis un fichier image (caméra OS ou galerie) via jsQR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Charge une image depuis un File/Blob via Object URL + Image().
   * Cleanup ObjectURL automatique au load OU à l'erreur.
   *
   * @param {File|Blob} file
   * @returns {Promise<HTMLImageElement>}
   */
  function _loadImageFromFile(file) {
    return new Promise(function(resolve, reject) {
      if (!file) return reject(new Error("Fichier vide"));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function() {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function() {
        URL.revokeObjectURL(url);
        reject(new Error("Image illisible (format non supporté ?)"));
      };
      img.src = url;
    });
  }

  /**
   * Décode un QR depuis un File image (photo OS ou galerie).
   *
   * Pipeline :
   * 1. Load image via Image() (= passe par GPU decoder du navigateur)
   * 2. Draw sur canvas (cap à 2000px côté max pour limiter la RAM sur mobile —
   *    une photo 12 MP = 4032×3024 = 49 MB en RGBA, on tire ça vers ~2000px = 6 MB)
   * 3. ctx.getImageData → ImageData (RGBA pixel array)
   * 4. jsQR(imageData.data, w, h, {inversionAttempts: "dontInvert"}) → {data, location} | null
   * 5. JSON.parse + _deserializerBriefing pour valider le payload
   *
   * @param {File|Blob} file
   * @returns {Promise<{ok, error?, payload?, scenario?, equipe?, planMeta?}>}
   */
  async function _decodeQrFromFile(file) {
    if (typeof window.jsQR !== "function") {
      return { ok: false, error: "Lib jsQR non chargée — recharge l'app." };
    }
    if (!file) {
      return { ok: false, error: "Fichier vide." };
    }

    // 1) Load image
    let img;
    try {
      img = await _loadImageFromFile(file);
    } catch (e) {
      return { ok: false, error: e.message || "Échec lecture image." };
    }

    // 2) Canvas + downscale si nécessaire
    const MAX_SIDE = 2000;
    let w = img.naturalWidth  || img.width;
    let h = img.naturalHeight || img.height;
    if (w <= 0 || h <= 0) {
      return { ok: false, error: "Dimensions image invalides." };
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    try {
      ctx.drawImage(img, 0, 0, w, h);
    } catch (e) {
      return { ok: false, error: "Impossible de dessiner l'image : " + (e && e.message) };
    }

    // 3) Extraction pixels + jsQR
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      // Cas rarissime : tainted canvas (cross-origin image). Ne devrait jamais
      // arriver avec un File local mais on protège quand même.
      return { ok: false, error: "Canvas non lisible : " + (e && e.message) };
    }

    let qrResult;
    try {
      qrResult = window.jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });
    } catch (e) {
      return { ok: false, error: "Erreur de décodage jsQR : " + (e && e.message) };
    }

    if (!qrResult || !qrResult.data) {
      return {
        ok:    false,
        error: "Aucun QR détecté dans l'image. " +
               "Vérifie que le QR est bien centré, net et bien éclairé."
      };
    }

    // 4) Parse JSON
    let payload;
    try {
      payload = JSON.parse(qrResult.data);
    } catch (e) {
      return {
        ok:    false,
        error: "QR détecté mais contenu invalide (JSON corrompu). " +
               "Ce n'est probablement pas un QR briefing MyKTAMap."
      };
    }

    // 5) Validation + détection type (hotfix12) :
    //    - "brf" → briefing → _deserializerBriefing
    //    - "obs" → observations → _deserializerObservations
    //    Routing automatique côté caller via le champ `kind` retourné.
    if (payload && payload.t === PAYLOAD_TYPE_OBSERVATIONS) {
      const resObs = _deserializerObservations(payload);
      if (!resObs.ok) {
        return { ok: false, error: resObs.error || "Payload observations invalide." };
      }
      return {
        ok:           true,
        kind:         "obs",
        payload:      payload,
        scenarioId:   resObs.scenarioId,
        equipeId:     resObs.equipeId,
        equipeNom:    resObs.equipeNom,
        role:         resObs.role,
        observations: resObs.observations,
        notesLibres:  resObs.notesLibres
      };
    }

    // Default = briefing
    const result = _deserializerBriefing(payload);
    if (!result.ok) {
      return { ok: false, error: result.error || "Payload non reconnu." };
    }
    return {
      ok:        true,
      kind:      "brf",
      payload:   payload,
      scenario:  result.scenario,
      equipe:    result.equipe,
      planMeta:  result.planMeta
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Import scénario depuis briefing décodé
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Importe un briefing décodé : crée un nouveau scénario dans le plan
   * courant avec le contexte + l'équipe focalisée du QR.
   *
   * Le scénario est nommé "Briefing — <nom scénario source>" pour bien
   * marquer qu'il provient d'un partage. L'user pourra ensuite lancer
   * l'exécution Mode Équipe sur cette équipe (cf §67.7).
   *
   * @param {object} scenario - reconstruit depuis _deserializerBriefing
   * @param {object} equipe   - idem
   * @param {object} planMeta - {id, name, multiLevel, availableLevels, ...}
   * @returns {object} {ok, error?, scenarioId?, equipeId?}
   */
  function _importerBriefingDansPlan(scenario, equipe, planMeta) {
    const SM = window.SecoursMode;
    if (!SM) {
      return { ok: false, error: "Module SecoursMode indispo." };
    }

    try {
      // 1) Création scénario avec contexte importé
      const sNom = "📲 Briefing — " + (scenario.nom || "Scénario partagé");
      const newScenario = SM.create(sNom);
      if (!newScenario) {
        return { ok: false, error: "Échec création scénario." };
      }

      // 2) Injection contexte (incidentAt + lastKnownPoint + zoneIncertitude + notes)
      const ctxNotes = (scenario.context && scenario.context.notes) || "";
      const importedNote = "📲 Importé via QR le " + new Date().toLocaleString("fr-FR") +
                           (planMeta && planMeta.name && planMeta.id !== (window._currentLoadedPlanId || "")
                            ? "\n⚠️ Plan source : " + planMeta.name + " (≠ plan courant)"
                            : "");
      const fullContext = Object.assign({}, scenario.context || {}, {
        notes: importedNote + (ctxNotes ? "\n\n---\n" + ctxNotes : "")
      });

      SM.update(newScenario.id, { context: fullContext });

      // 3) Ajout de l'équipe importée
      const newGroupe = SM.addGroupe(newScenario.id, equipe.nom, equipe.level);
      if (!newGroupe) {
        return { ok: false, error: "Échec création équipe importée." };
      }

      // 4) Update équipe avec les détails reçus (whitelist updateGroupe)
      // Note : itineraireSuggere est volontairement absent du payload QR
      // depuis hotfix10 (cf _serializerBriefing). On garde distanceM/dureeEstimeeMin
      // comme indicateurs pré-calculés pour l'aperçu.
      SM.updateGroupe(newScenario.id, newGroupe.id, {
        couleurIdx:        equipe.couleurIdx,
        membres:           equipe.membres,
        entree:            equipe.entree,
        sortie:            equipe.sortie,
        intermediaires:    equipe.intermediaires,
        zoneType:          equipe.zoneType,
        zonePolygon:       equipe.zonePolygon,
        zoneRoadIds:       equipe.zoneRoadIds,
        // itineraireSuggere: pas dans payload QR — sera recalculé async ci-dessous
        distanceM:         equipe.distanceM,
        dureeEstimeeMin:   equipe.dureeEstimeeMin,
        statut:            equipe.statut
      });

      // 5) Auto-recalcul itinéraire (async, best-effort). Pathfinder peut
      // recréer l'iti depuis entrée + sortie + intermédiaires + zone.
      // On déclenche en fire-and-forget — pas bloquant pour l'utilisateur,
      // l'iti sera visible dès que recalcul terminé (typique 100-500ms).
      if (equipe.entree && equipe.sortie && typeof SM.recalculerItineraires === "function") {
        setTimeout(function() {
          try { SM.recalculerItineraires(newScenario.id); } catch(e) {
            _warn("Auto-recalc iti après import : " + (e && e.message));
          }
        }, 100);
      }

      return { ok: true, scenarioId: newScenario.id, equipeId: newGroupe.id };
    } catch (e) {
      _err("Import briefing : " + (e && e.message));
      return { ok: false, error: "Erreur lors de l'import : " + (e && e.message) };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI — Modale Scan QR Briefing (côté Équipe terrain qui importe)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Ouvre la modale d'import via QR :
   * - 2 boutons d'entrée : 📷 photographier le QR / 🖼️ charger une image
   * - Décode + affiche preview
   * - Bouton ✓ Importer → crée scénario + ouvre Mode Secours
   *
   * Pattern `<input type="file" capture="environment">` réutilise les permissions
   * caméra natives de l'OS (cohérent §42 photos POI). Aucune modif CSP requise.
   */
  function ouvrirImportQrBriefing() {
    if (typeof window.jsQR !== "function") {
      _toast("⚠️ Lib jsQR non chargée (cache PWA ?). Re-actualise.", "error");
      return;
    }

    // Cleanup éventuelle modale existante
    _fermerModaleScan();

    const overlay = document.createElement("div");
    overlay.id = "kta-secours-qr-scan-overlay";
    overlay.className = "kta-readme-modal-overlay kta-secours-qr-scan-overlay";

    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-qr-scan-boite" style="max-width:520px;width:100%;">' +
        '<div class="kta-readme-modal-header">' +
          '<h2 style="margin:0;">📲 Importer un briefing QR</h2>' +
          '<button class="kta-modal-close" data-action="scan-close" title="Fermer">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-secours-qr-scan-corps">' +
          '<div class="kta-secours-qr-scan-hint">' +
            'Scanne un QR <strong>MyKTAMap Mode Secours</strong> :<br>' +
            '• <strong>QR briefing</strong> reçu de l\'opérateur → importe l\'équipe dans ton plan<br>' +
            '• <strong>QR observations</strong> reçu d\'un équipier → fusion dans le scénario actif' +
          '</div>' +
          '<div class="kta-secours-qr-scan-buttons">' +
            '<label class="kta-btn kta-btn-primary kta-secours-qr-scan-btn">' +
              '📷 Photographier le QR' +
              '<input type="file" accept="image/*" capture="environment" data-action="scan-camera" style="display:none;">' +
            '</label>' +
            '<label class="kta-btn kta-btn-secondary kta-secours-qr-scan-btn">' +
              '🖼️ Charger une image' +
              '<input type="file" accept="image/*" data-action="scan-gallery" style="display:none;">' +
            '</label>' +
          '</div>' +
          '<div class="kta-secours-qr-scan-status" id="kta-secours-qr-scan-status"></div>' +
          '<div class="kta-secours-qr-scan-info">' +
            '💡 <strong>Astuce</strong> : assure-toi que le QR est <strong>net, bien éclairé et centré</strong>. ' +
            'Le scan marche sans réseau — tout reste local sur ton appareil.' +
          '</div>' +
        '</div>' +
      '</div>';

    document.documentElement.appendChild(overlay);

    function _close() { _fermerModaleScan(); }
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) _close();
    });
    overlay.querySelector('[data-action="scan-close"]').addEventListener("click", _close);

    function _onEsc(e) {
      if (e.key === "Escape") { _close(); document.removeEventListener("keydown", _onEsc); }
    }
    document.addEventListener("keydown", _onEsc);

    // Handler unique pour les 2 inputs file (caméra et galerie)
    const statusEl = overlay.querySelector("#kta-secours-qr-scan-status");
    async function _onFileChosen(input, isCamera) {
      const file = input.files && input.files[0];
      if (!file) return;

      statusEl.className = "kta-secours-qr-scan-status kta-status-loading";
      statusEl.innerHTML = '<span class="kta-spinner-mini"></span> Décodage en cours…';

      const result = await _decodeQrFromFile(file);

      // Reset input pour permettre re-sélection du MÊME fichier après une erreur
      input.value = "";

      if (!result.ok) {
        statusEl.className = "kta-secours-qr-scan-status kta-status-error";
        statusEl.innerHTML = '❌ <strong>Échec du scan</strong><br>' + _escHtml(result.error);
        return;
      }

      // Routing hotfix12 : selon le type détecté
      if (result.kind === "obs") {
        // Observations Équipier→Op : merge direct dans le scénario actif
        statusEl.className = "kta-secours-qr-scan-status kta-status-ok";
        statusEl.innerHTML = '✅ QR observations détecté — fusion en cours…';
        setTimeout(function() {
          const mergeRes = _mergerObservationsDansScenario(result);
          _close();
          if (!mergeRes.ok) {
            _toast("❌ Fusion échouée : " + mergeRes.error, "error");
            return;
          }
          const msg = mergeRes.role === "secouriste"
            ? "✅ " + mergeRes.notesCount + " note(s) secouriste fusionnée(s)"
            : "✅ " + mergeRes.count + " observation(s) d'étape fusionnée(s)";
          _toast(msg, "info");
          // Ouvre Mode Secours sur le scénario mis à jour
          if (window.SecoursMode && typeof window.SecoursMode.ouvrir === "function") {
            setTimeout(function() { window.SecoursMode.ouvrir(mergeRes.scenarioId); }, 250);
          }
        }, 350);
        return;
      }

      // Briefing Op→Équipier : ouvre preview pour confirmation avant import
      statusEl.className = "kta-secours-qr-scan-status kta-status-ok";
      statusEl.innerHTML = '✅ QR briefing décodé — ouverture de l\'aperçu…';
      setTimeout(function() {
        _close();
        _afficherModalePreviewImport(result);
      }, 350);
    }

    overlay.querySelector('[data-action="scan-camera"]').addEventListener("change", function() {
      _onFileChosen(this, true);
    });
    overlay.querySelector('[data-action="scan-gallery"]').addEventListener("change", function() {
      _onFileChosen(this, false);
    });
  }

  function _fermerModaleScan() {
    const existing = document.getElementById("kta-secours-qr-scan-overlay");
    if (existing) existing.remove();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI — Modale Preview Import (avant validation finale)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Affiche un aperçu détaillé du briefing décodé avant import définitif.
   * L'user voit nom équipe, parcours, contexte, plan source → valide ou annule.
   *
   * @param {object} decoded - retour de _decodeQrFromFile : {scenario, equipe, planMeta, payload}
   */
  function _afficherModalePreviewImport(decoded) {
    _fermerModalePreview();
    const sc = decoded.scenario;
    const eq = decoded.equipe;
    const pm = decoded.planMeta;
    const SM = window.SecoursMode;
    const PALETTE = (SM && SM.PALETTE) || [];
    const couleur = PALETTE[eq.couleurIdx % PALETTE.length] || { hex: "#f4c542", nom: "" };

    // Détection plan différent
    const currentPlanId = window._currentLoadedPlanId || "";
    const planMismatch  = pm && pm.id && currentPlanId && pm.id !== currentPlanId;

    // Composition résumé parcours
    const nbInterm = Array.isArray(eq.intermediaires) ? eq.intermediaires.length : 0;
    const nbWp     = (eq.entree ? 1 : 0) + nbInterm + (eq.sortie ? 1 : 0);
    const distance = (typeof eq.distanceM === "number") ? (eq.distanceM + " m") : "—";
    const duree    = (typeof eq.dureeEstimeeMin === "number") ? (eq.dureeEstimeeMin + " min") : "—";

    const overlay = document.createElement("div");
    overlay.id = "kta-secours-qr-preview-overlay";
    overlay.className = "kta-readme-modal-overlay kta-secours-qr-preview-overlay";

    const mismatchHtml = planMismatch
      ? '<div class="kta-secours-qr-preview-warn">' +
          '⚠️ <strong>Plan différent détecté</strong><br>' +
          'Plan source du QR : <strong>' + _escHtml(pm.name || pm.id) + '</strong><br>' +
          'Plan courant : <em>' + _escHtml((window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "?") + '</em><br>' +
          '<em>Les coordonnées du briefing ne correspondront probablement pas à ton plan. ' +
          'À utiliser uniquement si tu sais ce que tu fais.</em>' +
        '</div>'
      : '';

    const ctxHtml = (sc.context && (sc.context.incidentAt || sc.context.notes))
      ? '<div class="kta-secours-qr-preview-section">' +
          '<h3 style="margin:8px 0 6px 0;">📝 Contexte importé</h3>' +
          (sc.context.incidentAt
            ? '<div class="kta-secours-qr-preview-row">⏰ Incident : ' + _escHtml(new Date(sc.context.incidentAt).toLocaleString("fr-FR")) + '</div>'
            : '') +
          (sc.context.notes
            ? '<div class="kta-secours-qr-preview-row kta-secours-qr-preview-notes">📌 ' + _escHtml(sc.context.notes) + '</div>'
            : '') +
        '</div>'
      : '';

    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-qr-preview-boite" style="max-width:560px;width:100%;">' +
        '<div class="kta-readme-modal-header">' +
          '<h2 style="margin:0;">📲 Aperçu du briefing</h2>' +
          '<button class="kta-modal-close" data-action="preview-close" title="Fermer">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-secours-qr-preview-corps">' +
          mismatchHtml +
          '<div class="kta-secours-qr-preview-section">' +
            '<h3 style="margin:0 0 6px 0;">🗂️ Scénario source</h3>' +
            '<div class="kta-secours-qr-preview-row"><strong>' + _escHtml(sc.nom || "—") + '</strong></div>' +
          '</div>' +
          '<div class="kta-secours-qr-preview-section">' +
            '<h3 style="margin:8px 0 6px 0;">🚨 Équipe à importer</h3>' +
            '<div class="kta-secours-qr-preview-equipe">' +
              '<span class="kta-secours-qr-preview-swatch" style="background:' + couleur.hex + ';"></span>' +
              '<div class="kta-secours-qr-preview-equipe-info">' +
                '<strong>' + _escHtml(eq.nom) + '</strong>' +
                (eq.membres && eq.membres.length > 0
                  ? '<span class="kta-secours-qr-preview-meta">👥 ' + _escHtml(eq.membres.join(", ")) + '</span>'
                  : '') +
                (typeof eq.level === "number"
                  ? '<span class="kta-secours-qr-preview-meta">🏗️ Niveau ' + eq.level + '</span>'
                  : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="kta-secours-qr-preview-section">' +
            '<h3 style="margin:8px 0 6px 0;">🗺️ Parcours</h3>' +
            '<div class="kta-secours-qr-preview-row">📍 ' + nbWp + ' waypoint(s)' +
              (eq.entree ? ' · 🚪 Entrée définie' : '') +
              (eq.sortie ? ' · 🚪 Sortie définie' : '') +
              (nbInterm > 0 ? ' · ▾ ' + nbInterm + ' étape(s)' : '') +
            '</div>' +
            '<div class="kta-secours-qr-preview-row">' +
              (eq.zoneType === "polygon" ? '⬛ Zone polygonale (' + (eq.zonePolygon ? eq.zonePolygon.length : 0) + ' sommets)' :
               eq.zoneType === "roads"   ? '🛣️ Zone tracés (' + (eq.zoneRoadIds ? eq.zoneRoadIds.length : 0) + ' segments)' :
               '○ Pas de zone définie') +
            '</div>' +
            '<div class="kta-secours-qr-preview-row">' +
              '📏 Distance : ' + distance + ' · ⏱️ Durée estimée : ' + duree +
            '</div>' +
          '</div>' +
          ctxHtml +
          '<div class="kta-secours-qr-preview-actions">' +
            '<button class="kta-btn kta-btn-ghost" data-action="preview-cancel">❌ Annuler</button>' +
            '<button class="kta-btn kta-btn-primary" data-action="preview-confirm">' +
              '✓ Importer dans mon plan' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.documentElement.appendChild(overlay);

    function _close() { _fermerModalePreview(); }
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) _close();
    });
    overlay.querySelector('[data-action="preview-close"]').addEventListener("click", _close);
    overlay.querySelector('[data-action="preview-cancel"]').addEventListener("click", _close);

    function _onEsc(e) {
      if (e.key === "Escape") { _close(); document.removeEventListener("keydown", _onEsc); }
    }
    document.addEventListener("keydown", _onEsc);

    overlay.querySelector('[data-action="preview-confirm"]').addEventListener("click", function() {
      const importRes = _importerBriefingDansPlan(decoded.scenario, decoded.equipe, decoded.planMeta);
      if (!importRes.ok) {
        _toast("❌ Import échoué : " + importRes.error, "error");
        return;
      }
      _close();
      _toast("✅ Briefing importé : équipe « " + decoded.equipe.nom + " » prête", "info");

      // Ouvre Mode Secours en vue Edit sur le scénario fraîchement créé
      if (window.SecoursMode) {
        // Petit délai pour laisser le toast s'afficher
        setTimeout(function() {
          if (typeof window.SecoursMode.ouvrir === "function") {
            // ouvrir(scenarioId) attend une string id directe (cf secoursMode.js > ouvrir)
            window.SecoursMode.ouvrir(importRes.scenarioId);
          }
        }, 250);
      }
    });
  }

  function _fermerModalePreview() {
    const existing = document.getElementById("kta-secours-qr-preview-overlay");
    if (existing) existing.remove();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // C4 — Aller-retour observations Équipe→Op
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Merge des observations décodées dans le scénario actif côté Op.
   *
   * Stratégie de matching :
   *   1. scenarioId match (= même plan, même scénario chez Op) → update direct
   *   2. fallback equipeNom : cherche un scénario actif chez Op contenant
   *      une équipe avec le même nom
   *   3. échec → erreur user-friendly
   *
   * @param {object} decoded - retour _deserializerObservations
   * @returns {object} {ok, error?, scenarioId?, equipeId?, count?, notesCount?}
   */
  function _mergerObservationsDansScenario(decoded) {
    const SM = window.SecoursMode;
    if (!SM) return { ok: false, error: "Module SecoursMode indispo." };

    const allScenarios = SM.list ? SM.list() : [];
    if (!allScenarios || allScenarios.length === 0) {
      return { ok: false, error: "Aucun scénario dans ce plan — l'opérateur doit créer/charger le scénario avant de recevoir les observations." };
    }

    // 1) Match strict par scenarioId
    let target = allScenarios.find(function(s) { return s.id === decoded.scenarioId; });

    // 2) Fallback : équipe avec même nom dans un scénario actif
    if (!target && decoded.equipeNom) {
      target = allScenarios.find(function(s) {
        return s.execution && s.execution.active &&
               (s.groupes || []).some(function(g) { return g.nom === decoded.equipeNom; });
      });
    }

    if (!target) {
      return {
        ok:    false,
        error: "Aucun scénario correspondant trouvé. " +
               "L'opérateur doit avoir le scénario source (id: " + decoded.scenarioId.substring(0, 8) + "…) " +
               "ou une équipe nommée « " + (decoded.equipeNom || "?") + " » dans un scénario actif."
      };
    }

    try {
      // Mode secouriste : pas d'équipe ciblée, on remplace _notes_libres
      if (decoded.role === "secouriste") {
        if (!target.execution) {
          return { ok: false, error: "Le scénario cible n'a pas d'exécution active." };
        }
        if (!target.execution.etapes) target.execution.etapes = {};
        target.execution.etapes._notes_libres = (decoded.notesLibres || []).map(function(n) {
          return { id: n.id, ts: n.ts, statut: n.statut, texte: n.texte, photoIds: [] };
        });
        // Force commit via update (passe par le pipeline standard pour notif onChange)
        SM.update(target.id, { context: target.context || {} });
        return {
          ok:         true,
          scenarioId: target.id,
          notesCount: (decoded.notesLibres || []).length,
          role:       "secouriste"
        };
      }

      // Mode équipe : trouve l'équipe ciblée
      let equipe = (target.groupes || []).find(function(g) { return g.id === decoded.equipeId; });
      if (!equipe && decoded.equipeNom) {
        equipe = (target.groupes || []).find(function(g) { return g.nom === decoded.equipeNom; });
      }
      if (!equipe) {
        return { ok: false, error: "Équipe « " + (decoded.equipeNom || decoded.equipeId) + " » non trouvée dans le scénario cible." };
      }

      // Merge observations par étape via SM.updateEtape (whitelist auto)
      let count = 0;
      (decoded.observations || []).forEach(function(obs) {
        if (typeof obs.idx !== "number") return;
        const partial = {};
        if (obs.statut)       partial.statut       = obs.statut;
        if (obs.observations) partial.observations = obs.observations;
        if (obs.startedAt)    partial.startedAt    = obs.startedAt;
        if (obs.completedAt)  partial.completedAt  = obs.completedAt;
        if (Object.keys(partial).length > 0) {
          try {
            SM.updateEtape(target.id, equipe.id, obs.idx, partial);
            count++;
          } catch (e) {
            _warn("updateEtape échouée pour étape " + obs.idx + " : " + (e && e.message));
          }
        }
      });

      return { ok: true, scenarioId: target.id, equipeId: equipe.id, count: count, role: "equipe" };
    } catch (e) {
      _err("Merge observations : " + (e && e.message));
      return { ok: false, error: "Erreur lors du merge : " + (e && e.message) };
    }
  }

  /**
   * Ouvre la modale "📲 Renvoyer observations" côté Équipier en mode Live.
   * Génère un QR avec uniquement les observations terrain (statuts + textes
   * + timestamps), sans photos (cf §66.12 + KARMA 9:a).
   *
   * @param {string} scenarioId
   * @param {string} equipeId - optionnel, sinon lu depuis execution.currentEquipeId
   */
  function ouvrirPartageQrObservations(scenarioId, equipeId) {
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
    if (!scenario || !scenario.execution) {
      _toast("⚠️ Scénario ou exécution introuvable.", "error");
      return;
    }

    // Si equipeId pas fourni, utilise currentEquipeId
    const effectiveEquipeId = equipeId || scenario.execution.currentEquipeId;
    const role = scenario.execution.role;

    // 1) Sérialisation + génération QR
    let qrInfo, payload;
    try {
      payload = _serializerObservations(scenario, effectiveEquipeId);
      qrInfo  = _genererQrFromPayload(payload);
    } catch (e) {
      _err("Génération QR obs échouée : " + (e && e.message));
      _toast("❌ Impossible de générer le QR : " + (e && e.message), "error");
      return;
    }

    // 2) Cleanup éventuelle modale existante
    _fermerModaleQr();

    // 3) Stats payload
    const stats = "QR v" + qrInfo.typeNumber + " · " + qrInfo.cellCount + "×" + qrInfo.cellCount +
                  " cells · payload " + qrInfo.payloadBytes + " bytes · ECC " +
                  (qrInfo.eccUsed || QR_ERROR_CORRECTION_LEVEL) +
                  (qrInfo.eccUsed === "L" ? " (auto-réduit)" : "");

    // 4) Construction DOM — réutilise les classes .kta-secours-qr-share-* C2
    const PALETTE = SM.PALETTE || [];
    const equipe  = (scenario.groupes || []).find(function(g) { return g.id === effectiveEquipeId; });
    const couleur = equipe && PALETTE[equipe.couleurIdx % PALETTE.length] || { hex: "#8cb4ff", nom: "" };
    const titreContexte = role === "secouriste"
      ? "Mode secouriste — " + ((payload.nl && payload.nl.length) || 0) + " note(s)"
      : "Équipe " + (equipe ? equipe.nom : "?") + " — " + ((payload.o && payload.o.length) || 0) + " étape(s)";

    const overlay = document.createElement("div");
    overlay.id = "kta-secours-qr-share-overlay";
    overlay.className = "kta-readme-modal-overlay kta-secours-qr-share-overlay";

    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-qr-share-boite" style="max-width:540px;width:100%;">' +
        '<div class="kta-readme-modal-header">' +
          '<h2 style="margin:0;">📲 Renvoyer mes observations</h2>' +
          '<button class="kta-modal-close" data-action="qr-close" title="Fermer">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-secours-qr-share-corps">' +
          '<div class="kta-secours-qr-share-info">' +
            '<span class="kta-secours-qr-share-swatch" style="background:' + couleur.hex + ';"></span>' +
            '<div class="kta-secours-qr-share-info-text">' +
              '<strong>' + _escHtml(titreContexte) + '</strong>' +
              '<span class="kta-secours-qr-share-meta">' +
                '🚫 Pas de photos dans le QR · 📸 Les photos restent sur ton appareil' +
              '</span>' +
            '</div>' +
          '</div>' +
          '<div class="kta-secours-qr-share-canvas-wrap">' +
            _qrToSvg(qrInfo) +
          '</div>' +
          '<div class="kta-secours-qr-share-hint">' +
            '👁️ Demande à l\'<strong>opérateur de surface</strong> de scanner ce code via ' +
            '<strong>Mode Secours → 📲 Scanner un QR</strong>. Les statuts + observations ' +
            'seront fusionnés dans son scénario, prêts pour le rapport final.' +
          '</div>' +
          '<div class="kta-secours-qr-share-stats">' + _escHtml(stats) + '</div>' +
          '<div class="kta-secours-qr-share-actions">' +
            '<button class="kta-btn kta-btn-secondary" data-action="qr-download" title="Télécharger le PNG">💾 Sauvegarder PNG</button>' +
            '<button class="kta-btn kta-btn-primary" data-action="qr-share" title="Partager via WhatsApp / mail / etc.">📤 Partager</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.documentElement.appendChild(overlay);

    function _close() { _fermerModaleQr(); }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    overlay.querySelector('[data-action="qr-close"]').addEventListener("click", _close);
    function _onEsc(e) {
      if (e.key === "Escape") { _close(); document.removeEventListener("keydown", _onEsc); }
    }
    document.addEventListener("keydown", _onEsc);

    const filename = "observations-" + (equipe ? _slugify(equipe.nom) : "secouriste") +
                     "-" + (new Date().toISOString().substring(0, 10)) + ".png";

    overlay.querySelector('[data-action="qr-download"]').addEventListener("click", async function() {
      try {
        const canvas = _qrToCanvas(qrInfo, QR_PNG_TARGET_SIZE);
        const blob   = await _canvasToPngBlob(canvas);
        _downloadPngBlob(blob, filename);
        _toast("💾 PNG sauvegardé : " + filename, "info");
      } catch (e) {
        _toast("❌ Génération PNG échouée : " + (e && e.message), "error");
      }
    });

    overlay.querySelector('[data-action="qr-share"]').addEventListener("click", async function() {
      try {
        const canvas = _qrToCanvas(qrInfo, QR_PNG_TARGET_SIZE);
        const blob   = await _canvasToPngBlob(canvas);
        const ok     = await _partagerPngBlob(blob, filename, "Observations terrain",
                                               "Observations de l'équipe à scanner par l'opérateur de surface (MyKTAMap).");
        if (!ok) {
          _downloadPngBlob(blob, filename);
          _toast("📤 Partage natif indispo — PNG téléchargé, partage-le manuellement", "info");
        }
      } catch (e) {
        _toast("❌ Partage échoué : " + (e && e.message), "error");
      }
    });
  }

  /**
   * Wrapper : ouvre le même scanner que pour les briefings.
   * Le décode auto détecte le type (brf/obs) et route vers le bon flow.
   * Exposé pour compat API mais redirige vers ouvrirImportQrBriefing
   * (refactor scan unifié hotfix12).
   */
  function ouvrirImportQrObservations() {
    return ouvrirImportQrBriefing();
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
    _decodeQrFromFile:                _decodeQrFromFile,
    _importerBriefingDansPlan:        _importerBriefingDansPlan,
    _mergerObservationsDansScenario:  _mergerObservationsDansScenario,
    _checkLibsDispo:                  _checkLibsDispo,
    _fermerModaleQr:             _fermerModaleQr,
    _fermerModaleScan:           _fermerModaleScan,
    _fermerModalePreview:        _fermerModalePreview
  };

})();
