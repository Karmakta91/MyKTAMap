// =====================================================================
// 💾 planOffline.js — rendre un plan SERVEUR disponible hors-ligne
// =====================================================================
// 🩸 POURQUOI CE MODULE EXISTE. Le Service Worker cache deja au vol tout ce
// qu'il telecharge — mais ca ne suffisait pas, pour trois raisons cumulees :
//
//   1. PLAFOND. Le cache principal est borne a MAX_DYNAMIC_ENTRIES (800) avec
//      eviction FIFO. Un plan V2 de 20000x12000 pese 1275 tuiles, et son SEUL
//      niveau z=0 en fait 960 : le plan s'evincait lui-meme EN SE CHARGEANT.
//      Hors-ligne, on n'obtenait pas une erreur mais une carte TROUEE.
//   2. PARESSE. Les tuiles ne sont telechargees qu'a l'AFFICHAGE : _renderNiveau
//      ne demande que le niveau de zoom courant. Ouvrir un plan sans zoomer
//      n'en cachait qu'un sur quatre.
//   3. BUMP. `activate` supprimait tout cache != CACHE_NAME → chaque release
//      remettait le plan a zero.
//
// On ecrit donc dans un cache DEDIE par plan (`myktamap-plan-<id>`), que le SW
// exclut de l'eviction ET de la purge au bump (cf sw.js > _estCachePlan).
//
// ⚠️ L'ETAT EST TOUJOURS LU DU CACHE REEL, jamais d'un drapeau memorise
// (exigence KARMA : « attention a ne plus afficher ce bouton une fois le plan
// telecharge, eviter un bouton fantome »). Un drapeau survivrait a une purge
// navigateur et afficherait « disponible » sur un cache vide — le mensonge
// exact qu'on veut eviter. Le manifeste est stocke DANS le cache : s'il
// disparait, l'etat retombe tout seul sur « absent ».
// =====================================================================

(function () {
  "use strict";

  const PREFIXE   = "myktamap-plan-";
  const MANIFESTE = "__kta_offline.json";   // stocke DANS le cache, jamais servi
  const PARALLELE = 6;                      // requetes simultanees

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

  // ── Enumeration des URLs d'un plan ──────────────────────────────────
  // 🩸 Les tuiles sont enumerees par `window.ktaTuilesV2Urls` (tiling.js), la
  // MEME fonction dont derive le rendu. Une seconde derivation ici aurait
  // diverge au premier changement de mise en page du generateur, et le
  // symptome aurait ete un plan « telecharge » mais troue — soit exactement
  // le bug qu'on corrige.
  async function listerUrls(plan) {
    const dir = _dossier(plan);
    if (!dir) throw new Error("plan sans chemin serveur");
    const urlCfg = dir + "/plan-config.json";
    const rep = await fetch(urlCfg, { cache: "reload" });
    if (!rep.ok) throw new Error("plan-config.json : HTTP " + rep.status);
    let cfg = await rep.json();

    // Memes regles de resolution que le chargement reel (config.js).
    if (typeof window.resolveServerPaths === "function") {
      cfg = window.resolveServerPaths(cfg, dir);
    }

    const urls = [urlCfg];
    const ajouter = function (u) {
      if (typeof u === "string" && u && urls.indexOf(u) < 0 && !/^(https?:|blob:|data:)/.test(u)) urls.push(u);
    };
    if (cfg.plan) { ajouter(cfg.plan.baseImage); ajouter(cfg.plan.collisionImage); }
    (cfg.imageLayers || []).forEach(function (l) { ajouter(l && l.file); });
    (cfg.dataLayers  || []).forEach(function (l) { ajouter(l && l.file); });
    // Icones : seules celles resolues DANS le dossier du plan (= perso, livrees
    // dans le ZIP). Celles de l'app vivent a la racine et sont deja pre-cachees
    // par le Service Worker a l'install.
    if (cfg.icons) {
      Object.keys(cfg.icons).forEach(function (k) {
        const u = cfg.icons[k];
        if (typeof u === "string" && u.indexOf(dir + "/") === 0) ajouter(u);
      });
    }
    if (typeof window.ktaTuilesV2Urls === "function") {
      (window.ktaTuilesV2Urls(cfg) || []).forEach(ajouter);
    }
    return { urls: urls, cfg: cfg };
  }

  // ── Etat REEL, lu du cache ──────────────────────────────────────────
  // Retourne { etat: "absent" | "complet" | "incomplet", present, total, date }
  async function statut(planId) {
    const vide = { etat: "absent", present: 0, total: 0, date: null };
    if (!supporte() || !planId) return vide;
    let cles;
    try { cles = await caches.keys(); } catch (e) { return vide; }
    const nom = nomCache(planId);
    if (cles.indexOf(nom) < 0) return vide;

    const cache = await caches.open(nom);
    const entrees = await cache.keys();
    // Le manifeste dit ce qui ETAIT attendu. Sans lui, on ne peut pas conclure :
    // on rend « incomplet » plutot que d'annoncer « complet » a tort.
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
      return { etat: present > 0 ? "incomplet" : "absent", present: present, total: 0, date: null };
    }
    return {
      etat:    (present >= man.urls.length) ? "complet" : "incomplet",
      present: present,
      total:   man.urls.length,
      date:    man.date || null
    };
  }

  // ── Telechargement ──────────────────────────────────────────────────
  // onProgress({ fait, total, echecs }) — appele a chaque fichier termine.
  // Retourne { total, ok, echecs, annule }.
  async function precacher(plan, onProgress, signal) {
    if (!supporte()) throw new Error("Cache API indisponible");
    const liste = await listerUrls(plan);
    const urls  = liste.urls;
    const cache = await caches.open(nomCache(plan.id));
    let fait = 0, ok = 0, echecs = 0, annule = false;

    let curseur = 0;
    const suivant = function () { return (curseur < urls.length) ? urls[curseur++] : null; };

    async function worker() {
      for (;;) {
        if (signal && signal.aborted) { annule = true; return; }
        const u = suivant();
        if (!u) return;
        try {
          const r = await fetch(u, { cache: "reload" });
          // 🩸 On ne met en cache QUE du 200 : cacher un 404 rendrait le plan
          // « complet » avec des fichiers morts, invisibles jusqu'au terrain.
          if (r && r.status === 200) { await cache.put(u, r.clone()); ok++; }
          else { echecs++; _warn("HTTP " + (r && r.status) + " :", u); }
        } catch (e) { echecs++; _warn("echec :", u, e && e.message); }
        fait++;
        if (typeof onProgress === "function") onProgress({ fait: fait, total: urls.length, echecs: echecs });
      }
    }
    const pool = [];
    for (let i = 0; i < Math.min(PARALLELE, urls.length); i++) pool.push(worker());
    await Promise.all(pool);

    if (!annule) {
      // Le manifeste n'est ecrit qu'a la FIN : un telechargement interrompu
      // laisse donc un cache SANS manifeste → etat « incomplet », le bouton
      // revient. C'est voulu.
      await cache.put(_urlManifeste(plan), new Response(JSON.stringify({
        version: 1, planId: plan.id, urls: urls, date: new Date().toISOString(), echecs: echecs
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    _notifierSW();
    _log("plan " + plan.id + " : " + ok + "/" + urls.length + " fichiers, " + echecs + " echec(s)");
    return { total: urls.length, ok: ok, echecs: echecs, annule: annule };
  }

  async function supprimer(planId) {
    if (!supporte()) return false;
    const r = await caches.delete(nomCache(planId));
    _notifierSW();
    _log("cache du plan " + planId + (r ? " supprime" : " introuvable"));
    return r;
  }

  // Le SW memoise la liste des caches de plan : on l'invalide tout de suite,
  // sinon il peut ignorer un cache tout neuf pendant 30 s.
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
    precacher:  precacher,
    supprimer:  supprimer
  };
})();
