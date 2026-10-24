/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// planOffline.js — rendre un plan SERVEUR disponible hors ligne
// =====================================================================
// Cache DÉDIÉ par plan (`myktamap-plan-<id>`), exclu de l'éviction et de la purge au bump
// (sw.js > _estCachePlan). 🩸 Le cache au vol du SW ne suffit pas : plafond FIFO (un plan V2
// s'évince lui-même en se chargeant → carte trouée hors ligne), tuiles chargées seulement au
// zoom affiché, cache principal purgé à chaque release.
// ⚠️ L'état est TOUJOURS lu du cache réel, jamais d'un drapeau mémorisé (qui survivrait à une
// purge navigateur → bouton fantôme « disponible »). Le manifeste vit DANS le cache.
// Expose : window.PlanOffline { supporte, nomCache, listerUrls, statut, statuts, precacher,
//   verifierMaj, supprimer, PREFIXE, MANIFESTE }
// Garde-fou : scripts/check-plan-offline.js · Doc : docs/TILING.md

(function () {
  "use strict";

  const PREFIXE   = "myktamap-plan-";
  const MANIFESTE = "__kta_offline.json";   // stocké DANS le cache, jamais servi
  const PARALLELE = 6;                      // requêtes simultanées

  function _log()  { console.log.apply(console, ["[PlanOffline]"].concat([].slice.call(arguments))); }
  function _warn() { console.warn.apply(console, ["[PlanOffline]"].concat([].slice.call(arguments))); }

  function supporte() {
    return (typeof caches !== "undefined") && typeof caches.open === "function";
  }

  function nomCache(planId) { return PREFIXE + String(planId); }

  function _dossier(plan) {
    return String((plan && plan.path) || "").replace(/\/+$/, "");
  }
  function _urlManifeste(plan) { return _dossier(plan) + "/" + MANIFESTE; }

  // ── Énumération des URLs d'un plan ──────────────────────────────────
  // 🩸 Tuiles énumérées par `window.ktaTuilesV2Urls` (tiling.js), la fonction du rendu : une
  // seconde dérivation divergerait (plan « téléchargé » mais troué).
  async function listerUrls(plan) {
    const dir = _dossier(plan);
    if (!dir) throw new Error("plan sans chemin serveur");
    const urlCfg = dir + "/plan-config.json";
    const rep = await fetch(urlCfg, { cache: "reload" });
    if (!rep.ok) throw new Error("plan-config.json : HTTP " + rep.status);
    let cfg = await rep.json();

    // Mêmes règles de résolution que le chargement réel (config.js).
    if (typeof window.resolveServerPaths === "function") {
      cfg = window.resolveServerPaths(cfg, dir);
    }
    // 🩸 Mêmes icônes que le rendu (sondées aussi), sinon le plan reste « incomplet » à vie.
    if (typeof window.resoudreIconesPlanServeur === "function") {
      cfg = await window.resoudreIconesPlanServeur(cfg, dir);
    }

    const urls = [urlCfg];
    const ajouter = function (u) {
      if (typeof u === "string" && u && urls.indexOf(u) < 0 && !/^(https?:|blob:|data:)/.test(u)) urls.push(u);
    };
    if (cfg.plan) { ajouter(cfg.plan.baseImage); ajouter(cfg.plan.collisionImage); }
    (cfg.imageLayers || []).forEach(function (l) { ajouter(l && l.file); });
    (cfg.dataLayers  || []).forEach(function (l) { ajouter(l && l.file); });
    // Icônes du dossier du plan seulement : celles de l'app sont déjà précachées par le SW.
    if (cfg.icons) {
      Object.keys(cfg.icons).forEach(function (k) {
        const u = cfg.icons[k];
        if (typeof u === "string" && u.indexOf(dir + "/") === 0) ajouter(u);
      });
    }
    // Racine des tuiles rendue avec la liste : verifierMaj l'exclut des sondes.
    // 🩸 Racine SONDÉE comme le rendu : un déploiement peut déplacer l'image sans les tuiles
    // (sinon des centaines d'URLs en 404).
    const racineTuiles = (typeof window.ktaResoudreRacineTuiles === "function")
      ? await window.ktaResoudreRacineTuiles(cfg)
      : ((typeof window.ktaRacineTuilesServeur === "function") ? window.ktaRacineTuilesServeur(cfg) : null);

    if (typeof window.ktaTuilesV2Urls === "function") {
      (window.ktaTuilesV2Urls(cfg, racineTuiles) || []).forEach(ajouter);
    }
    return { urls: urls, cfg: cfg, racineTuiles: racineTuiles };
  }

  // ── État RÉEL, lu du cache ──────────────────────────────────────────
  // → { etat: "absent" | "complet" | "partiel" | "incomplet", present, total, manquants, date }
  // `clesDejaLues` : caches.keys() déjà lu par statuts() (un seul appel pour N plans).
  async function statut(planId, clesDejaLues) {
    const vide = { etat: "absent", present: 0, total: 0, date: null };
    if (!supporte() || !planId) return vide;
    let cles = clesDejaLues;
    if (!cles) { try { cles = await caches.keys(); } catch (e) { return vide; } }
    const nom = nomCache(planId);
    if (cles.indexOf(nom) < 0) return vide;

    const cache = await caches.open(nom);
    const entrees = await cache.keys();
    // Sans manifeste (ce qui était attendu), pas de conclusion : « incomplet », jamais « complet ».
    let man = null;
    for (let i = 0; i < entrees.length; i++) {
      if (entrees[i].url.indexOf("/" + MANIFESTE) >= 0) {
        try {
          const r = await cache.match(entrees[i]);
          man = r ? await r.json() : null;
        } catch (e) { man = null; }
        break;
      }
    }
    const present = Math.max(0, entrees.length - (man ? 1 : 0));
    if (!man || !Array.isArray(man.urls)) {
      return { etat: present > 0 ? "incomplet" : "absent", present: present, total: 0, manquants: [], date: null };
    }
    // 🩸 Trois états : complet ; partiel = tout ce qui EXISTE est là, le serveur a refusé
    // `manquants` (utilisable, et on dit lesquels — sinon « 9 sur 10 » à vie sur un fichier
    // non déployé) ; incomplet = téléchargement interrompu. Manifeste sans `manquants` : calcul
    // simple jusqu'au prochain téléchargement.
    const manquants  = Array.isArray(man.manquants) ? man.manquants : [];
    const attendus   = man.urls.length;
    const obtenables = Math.max(0, attendus - manquants.length);
    let etat;
    if (present >= attendus)                             etat = "complet";
    else if (manquants.length > 0 && present >= obtenables) etat = "partiel";
    else                                                 etat = "incomplet";
    return {
      etat:      etat,
      present:   present,
      total:     attendus,
      manquants: manquants,
      date:      man.date || null
    };
  }

  // ── Téléchargement ──────────────────────────────────────────────────
  // onProgress({ fait, total, echecs }) à chaque fichier → { total, ok, echecs, annule, manquants }
  // `opts.faits` (objet, muté) : URLs déjà rangées par une tentative précédente DE CETTE MÊME passe, avec leurs
  // validateurs → sautées (reprise après un passage en arrière-plan, js/dossierHorsLigne.js).
  // 🩸 Hors reprise, l'ancien manifeste est retiré AVANT la boucle : une mise à jour interrompue laisse
  //   « incomplet » (bouton « compléter »), pas « complet » sur un mélange d'ancienne et de nouvelle version.
  //   Une reprise ne saute que `faits`, jamais un fichier trouvé en cache (il peut être de l'ancienne version).
  async function precacher(plan, onProgress, signal, opts) {
    if (!supporte()) throw new Error("Cache API indisponible");
    const faits = (opts && opts.faits && typeof opts.faits === "object") ? opts.faits : null;
    const reprise = !!(faits && Object.keys(faits).length);
    const liste = await listerUrls(plan);
    const urls  = liste.urls;
    const cache = await caches.open(nomCache(plan.id));
    if (!reprise) { try { await cache.delete(_urlManifeste(plan)); } catch (e) { /* cache neuf */ } }
    let fait = 0, ok = 0, echecs = 0, annule = false;
    // QUELS fichiers manquent, pas seulement combien.
    const manquants = [];
    // Validateurs HTTP (ETag / Last-Modified) : seul signal fiable de changement côté serveur
    // (cf verifierMaj).
    const validateurs = {};

    let curseur = 0;
    const suivant = function () { return (curseur < urls.length) ? urls[curseur++] : null; };

    async function worker() {
      for (;;) {
        if (signal && signal.aborted) { annule = true; return; }
        const u = suivant();
        if (!u) return;
        if (faits && Object.prototype.hasOwnProperty.call(faits, u) && await cache.match(u)) {
          if (faits[u]) validateurs[u] = faits[u];
          ok++; fait++;
          if (typeof onProgress === "function") onProgress({ fait: fait, total: urls.length, echecs: echecs });
          continue;
        }
        try {
          const r = await fetch(u, { cache: "reload", signal: signal });
          // 🩸 Seulement du 200 : un 404 en cache donnerait un plan « complet » aux fichiers morts.
          if (r && r.status === 200) {
            const et = r.headers.get("ETag"), lm = r.headers.get("Last-Modified");
            if (et || lm) validateurs[u] = { etag: et || null, lm: lm || null };
            await cache.put(u, r.clone()); ok++;
            if (faits) faits[u] = validateurs[u] || null;
          }
          else { echecs++; manquants.push(u); _warn("HTTP " + (r && r.status) + " :", u); }
        } catch (e) { echecs++; manquants.push(u); _warn("echec :", u, e && e.message); }
        fait++;
        if (typeof onProgress === "function") onProgress({ fait: fait, total: urls.length, echecs: echecs });
      }
    }
    const pool = [];
    for (let i = 0; i < Math.min(PARALLELE, urls.length); i++) pool.push(worker());
    await Promise.all(pool);

    if (!annule) {
      // ⚠️ Manifeste écrit à la FIN seulement : interrompu → pas de manifeste → « incomplet »,
      // le bouton revient.
      await cache.put(_urlManifeste(plan), new Response(JSON.stringify({
        version: 3, planId: plan.id, urls: urls, manquants: manquants,
        validateurs: validateurs, racineTuiles: liste.racineTuiles || null,
        date: new Date().toISOString(), echecs: echecs
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    _notifierSW();
    _log("plan " + plan.id + " : " + ok + "/" + urls.length + " fichiers, " + echecs + " echec(s)");
    if (manquants.length) _warn("introuvables sur le serveur :", manquants);
    return { total: urls.length, ok: ok, echecs: echecs, annule: annule, manquants: manquants };
  }


  // ── Y a-t-il du neuf sur le serveur ? ───────────────────────────────
  // Requêtes CONDITIONNELLES : 304 = inchangé, 200 = changé.
  // 🩸 Pas le champ `version` d'index.json (saisi à la main, il dérive) ; plan-config.json n'a
  //   pas d'horodatage : ETag / Last-Modified est le seul signal fiable.
  // Tuiles exclues : elles dérivent de l'image, qui est sondée.
  // 🩸 `_ktacheck=1` indispensable : sans lui, le cache-first du SW répond toujours « inchangé ».
  // → { etat: "ajour" | "maj" | "inconnu", changes, verifies, date }
  async function verifierMaj(plan) {
    const inconnu = { etat: "inconnu", changes: [], verifies: 0, date: null };
    if (!supporte() || !plan || !plan.id) return inconnu;
    let cles;
    try { cles = await caches.keys(); } catch (e) { return inconnu; }
    if (cles.indexOf(nomCache(plan.id)) < 0) return inconnu;
    const cache = await caches.open(nomCache(plan.id));
    const rep = await cache.match(_urlManifeste(plan));
    if (!rep) return inconnu;
    let man;
    try { man = await rep.json(); } catch (e) { return inconnu; }
    // Manifeste sans validateurs : « inconnu », jamais « à jour » sans preuve.
    if (!man || !man.validateurs || !Array.isArray(man.urls)) {
      return { etat: "inconnu", changes: [], verifies: 0, date: man && man.date || null };
    }
    const racine = man.racineTuiles;
    const aSonder = man.urls.filter(function (u) {
      if (racine && u.indexOf(racine + "/") === 0) return false;   // tuiles : exclues
      return !!man.validateurs[u];
    });
    if (!aSonder.length) return { etat: "inconnu", changes: [], verifies: 0, date: man.date || null };

    const changes = [];
    let verifies = 0, echecs = 0;
    await Promise.all(aSonder.map(async function (u) {
      const v = man.validateurs[u];
      const h = {};
      if (v.etag) h["If-None-Match"] = v.etag;
      else if (v.lm) h["If-Modified-Since"] = v.lm;
      try {
        const r = await fetch(u + (u.indexOf("?") >= 0 ? "&" : "?") + "_ktacheck=1",
                              { headers: h, cache: "no-store" });
        if (r.status === 304) { verifies++; return; }
        if (r.status === 200) { verifies++; changes.push(u); return; }
        echecs++;
      } catch (e) { echecs++; }
    }));
    // 🩸 Aucune sonde aboutie (hors ligne, CORS, serveur muet) : pas de conclusion.
    if (verifies === 0) return { etat: "inconnu", changes: [], verifies: 0, date: man.date || null };
    _log("verif maj " + plan.id + " : " + verifies + " sonde(s), " + changes.length + " change(s)" +
         (echecs ? ", " + echecs + " sans reponse" : ""));
    return {
      etat:     changes.length ? "maj" : "ajour",
      changes:  changes,
      verifies: verifies,
      date:     man.date || null
    };
  }

  // Plusieurs plans en une passe, un seul caches.keys() (liste du HOME) → { <planId>: <statut> }
  async function statuts(planIds) {
    const out = {};
    if (!supporte() || !Array.isArray(planIds) || !planIds.length) return out;
    let cles = [];
    try { cles = await caches.keys(); } catch (e) { return out; }
    await Promise.all(planIds.map(async function (id) {
      try { out[id] = await statut(id, cles); } catch (e) { /* plan ignore */ }
    }));
    return out;
  }

  async function supprimer(planId) {
    if (!supporte()) return false;
    const r = await caches.delete(nomCache(planId));
    _notifierSW();
    _log("cache du plan " + planId + (r ? " supprime" : " introuvable"));
    return r;
  }

  // 🩸 Le SW mémorise la liste des caches de plan : sans invalidation, il ignore un cache neuf
  // pendant 30 s.
  function _notifierSW() {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "PLAN_CACHE_CHANGED" });
      }
    } catch (e) { /* no-op */ }
  }

  window.PlanOffline = {
    PREFIXE:    PREFIXE,
    MANIFESTE:  MANIFESTE,
    supporte:   supporte,
    nomCache:   nomCache,
    listerUrls: listerUrls,
    statut:     statut,
    statuts:    statuts,
    precacher:  precacher,
    verifierMaj: verifierMaj,
    supprimer:  supprimer
  };
})();
