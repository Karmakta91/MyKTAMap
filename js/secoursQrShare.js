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

  // ═══════════════════════════════════════════════════════════════════════════
  // Sérialisation payload — clés courtes pour rester sous le cap QR v40
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sérialise un briefing équipe en payload JSON compact.
   *
   * Format (clés courtes pour minimiser la taille — chaque char économisé
   * compte pour rester sous QR v40 = ~2.9 KB alphanum) :
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
   *     zt, zp, zr,                         // zoneType, zonePolygon, zoneRoadIds
   *     is, dm, du,                         // itineraireSuggere, distanceM, dureeMin
   *     in: [ {x, y, l, lb, pi?} ],         // intermediaires (clé "in" car "interm" trop long)
   *     st                                  // statut
   *   }
   * }
   *
   * @param {object} scenario - scénario complet (cf §65 modèle données)
   * @param {object} equipe   - équipe du scénario à embarquer
   * @returns {object} payload compact prêt à JSON.stringify + QR encode
   */
  function _serializerBriefing(scenario, equipe) {
    // TODO C2 : implémentation complète
    return {
      t:  PAYLOAD_TYPE_BRIEFING,
      v:  QR_FORMAT_VERSION,
      ts: Date.now(),
      p:  null,  // C2
      s:  null,  // C2
      e:  null   // C2
    };
  }

  /**
   * Désérialise un payload briefing depuis le QR decode.
   *
   * @param {object} payload - objet JSON parsé depuis le QR
   * @returns {object} {ok, error?, scenario?, equipe?}
   */
  function _deserializerBriefing(payload) {
    // TODO C3 : implémentation complète
    if (!payload || payload.t !== PAYLOAD_TYPE_BRIEFING) {
      return { ok: false, error: "Type de payload incompatible (attendu '" + PAYLOAD_TYPE_BRIEFING + "')" };
    }
    if (payload.v !== QR_FORMAT_VERSION) {
      return { ok: false, error: "Version de format incompatible (lu=" + payload.v + ", attendu=" + QR_FORMAT_VERSION + ")" };
    }
    return { ok: false, error: "Désérialisation non implémentée (C3 à venir)" };
  }

  /**
   * Sérialise les observations terrain d'une équipe en payload compact.
   *
   * Format :
   * {
   *   t:  "obs",
   *   v:  1,
   *   ts: ...,
   *   si: scenarioId,
   *   ei: equipeId,
   *   r:  "equipe" | "secouriste",          // role exécution
   *   o:  [ { i, s, o, st, ct } ],          // observations par étape
   *   nl: [ { i, ts, s, t } ]               // notes libres (si role=secouriste)
   * }
   *
   * @param {object} scenario
   * @param {string} equipeId
   * @returns {object} payload
   */
  function _serializerObservations(scenario, equipeId) {
    // TODO C4 : implémentation complète
    return {
      t:  PAYLOAD_TYPE_OBSERVATIONS,
      v:  QR_FORMAT_VERSION,
      ts: Date.now()
    };
  }

  /**
   * Désérialise un payload observations.
   *
   * @param {object} payload
   * @returns {object} {ok, error?, observations?}
   */
  function _deserializerObservations(payload) {
    // TODO C4 : implémentation complète
    if (!payload || payload.t !== PAYLOAD_TYPE_OBSERVATIONS) {
      return { ok: false, error: "Type de payload incompatible (attendu '" + PAYLOAD_TYPE_OBSERVATIONS + "')" };
    }
    return { ok: false, error: "Désérialisation non implémentée (C4 à venir)" };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API publique — stubs C1 (implémentation complète C2/C3/C4)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Ouvre la modale "📲 Partager briefing via QR" pour une équipe donnée
   * (côté Opérateur). Génère le QR + affiche aperçu + boutons sauvegarde/partage.
   *
   * @param {string} scenarioId
   * @param {string} equipeId
   */
  function ouvrirPartageQrBriefing(scenarioId, equipeId) {
    _warn("ouvrirPartageQrBriefing — implémentation C2 à venir (scenarioId=" + scenarioId + ", equipeId=" + equipeId + ")");
    _toast("⚠️ QR briefing : implémentation en cours (C2)", "info");
  }

  /**
   * Ouvre la modale "📲 Importer un briefing QR" (côté Équipe terrain).
   * 2 onglets : 📷 Scanner caméra (getUserMedia + jsQR loop) et 🖼️ Charger image.
   */
  function ouvrirImportQrBriefing() {
    _warn("ouvrirImportQrBriefing — implémentation C3 à venir");
    _toast("⚠️ Scan QR briefing : implémentation en cours (C3)", "info");
  }

  /**
   * Ouvre la modale "📲 Renvoyer observations à l'Op" pour l'équipe en
   * cours d'exécution (côté Équipe terrain). Génère le QR observations
   * uniquement (pas de photos, cf KARMA 9:a).
   *
   * @param {string} scenarioId
   * @param {string} equipeId
   */
  function ouvrirPartageQrObservations(scenarioId, equipeId) {
    _warn("ouvrirPartageQrObservations — implémentation C4 à venir");
    _toast("⚠️ QR observations : implémentation en cours (C4)", "info");
  }

  /**
   * Ouvre la modale "📲 Récupérer observations terrain" (côté Op surface).
   * Symétrique de ouvrirImportQrBriefing mais accepte uniquement les
   * payloads observations (t="obs") et merge dans le scénario actif.
   */
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
    PAYLOAD_TYPE_BRIEFING:       PAYLOAD_TYPE_BRIEFING,
    PAYLOAD_TYPE_OBSERVATIONS:   PAYLOAD_TYPE_OBSERVATIONS,

    // Helpers internes exposés pour tests + introspection (préfixe _ marque
    // qu'ils ne sont PAS API publique stable)
    _serializerBriefing:         _serializerBriefing,
    _deserializerBriefing:       _deserializerBriefing,
    _serializerObservations:     _serializerObservations,
    _deserializerObservations:   _deserializerObservations,
    _checkLibsDispo:             _checkLibsDispo
  };

})();
