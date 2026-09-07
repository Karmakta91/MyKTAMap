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
    // 🎨 v1.87.2 — memes icones que le chargement reel : on SONDE aussi,
    // sinon le pre-cache listerait une icone que le rendu n utilise pas
    // (ou l inverse), et le plan serait « incomplet » a vie.
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
    // Icones : seules celles resolues DANS le dossier du plan (= perso, livrees
    // dans le ZIP). Celles de l'app vivent a la racine et sont deja pre-cachees
    // par le Service Worker a l'install.
    if (cfg.icons) {
      Object.keys(cfg.icons).forEach(function (k) {
        const u = cfg.icons[k];
        if (typeof u === "string" && u.indexOf(dir + "/") === 0) ajouter(u);
      });
    }
    // La racine des tuiles est rendue avec la liste : `verifierMaj` s en sert
    // pour EXCLURE les tuiles des sondes. Sonder 1275 tuiles serait absurde,
    // et inutile : elles derivent de l image, qui est sondee, elle.
    // 🩸 v1.88.3 — on SONDE, comme le rendu. L hypothese synchrone se
    // trompait sur les plans dont le deploiement a deplace l image sans
    // deplacer les tuiles : le pre-cache telechargeait alors 1275 URLs en 404.
    const racineTuiles = (typeof window.ktaResoudreRacineTuiles === "function")
      ? await window.ktaResoudreRacineTuiles(cfg)
      : ((typeof window.ktaRacineTuilesServeur === "function") ? window.ktaRacineTuilesServeur(cfg) : null);

    if (typeof window.ktaTuilesV2Urls === "function") {
      (window.ktaTuilesV2Urls(cfg, racineTuiles) || []).forEach(ajouter);
    }
    return { urls: urls, cfg: cfg, racineTuiles: racineTuiles };
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
      return { etat: present > 0 ? "incomplet" : "absent", present: present, total: 0, manquants: [], date: null };
    }
    // 🩸 v1.87.1 — TROIS ÉTATS, PAS DEUX. Le manifeste v1 listait tout ce qu'on
    // avait TENTÉ, y compris les fichiers absents du serveur. Un plan dont le
    // plan-config déclare un fichier non déployé restait donc « incomplet — 9
    // sur 10 » À VIE : le bouton invitait à retélécharger indéfiniment un
    // fichier qui n'existe pas, sans jamais dire lequel. Constaté par KARMA.
    // On distingue désormais :
    //   • complet   : tout est là ;
    //   • partiel   : tout ce qui EXISTE est là, mais le serveur n'a pas
    //                 répondu 200 sur N fichiers — utilisable, et on DIT
    //                 lesquels ;
    //   • incomplet : téléchargement réellement interrompu (il en manque plus
    //                 que ce que le serveur avait refusé).
    // ⚠️ Manifeste v1 (sans `manquants`) → on retombe sur l'ancien calcul :
    // il sera remplacé par un v2 au prochain téléchargement.
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

  // ── Telechargement ──────────────────────────────────────────────────
  // onProgress({ fait, total, echecs }) — appele a chaque fichier termine.
  // Retourne { total, ok, echecs, annule }.
  async function precacher(plan, onProgress, signal) {
    if (!supporte()) throw new Error("Cache API indisponible");
    const liste = await listerUrls(plan);
    const urls  = liste.urls;
    const cache = await caches.open(nomCache(plan.id));
    let fait = 0, ok = 0, echecs = 0, annule = false;
    // 🩸 v1.87.1 — on retient QUELS fichiers manquent, pas juste combien.
    // Sans la liste, l utilisateur voyait « 9 sur 10 » sans jamais savoir
    // lequel, et retelechargait en boucle un fichier absent du serveur.
    const manquants = [];
    // 🔎 v1.88.0 — VALIDATEURS HTTP, retenus au telechargement. Ils sont la
    // seule facon FIABLE de savoir plus tard si le serveur a change : le
    // champ `version` de index.json est saisi a la main et derive (dans ce
    // repo meme, index dit V1 et le plan-config dit V2), et le generateur
    // n ecrit aucun horodatage dans plan-config.json.
    const validateurs = {};

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
          if (r && r.status === 200) {
            const et = r.headers.get("ETag"), lm = r.headers.get("Last-Modified");
            if (et || lm) validateurs[u] = { etag: et || null, lm: lm || null };
            await cache.put(u, r.clone()); ok++;
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
      // Le manifeste n'est ecrit qu'a la FIN : un telechargement interrompu
      // laisse donc un cache SANS manifeste → etat « incomplet », le bouton
      // revient. C'est voulu.
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
  // 🔎 v1.88.0 — On envoie des requetes CONDITIONNELLES : 304 = inchange
  // (corps vide, cout quasi nul), 200 = le fichier a change.
  //
  // 🩸 POURQUOI PAS LE CHAMP `version` : il est saisi a la main dans
  // index.json et derive deja dans ce repo (index dit V1, plan-config dit V2).
  // Et `plan-config.json` ne porte AUCUN horodatage. Le seul signal fiable
  // sans changer de format est donc HTTP : ETag / Last-Modified, que tout
  // serveur statique emet par defaut.
  //
  // 🩸 LES TUILES SONT EXCLUES : elles peuvent etre 1275, et elles derivent de
  // l image — qui, elle, EST sondee. Si l image a change, la mise a jour est
  // annoncee et le retelechargement reprend tout.
  //
  // 🩸 LE MARQUEUR `_ktacheck=1` EST INDISPENSABLE : sans lui, la branche
  // cache-first du Service Worker servirait la sonde depuis le cache et elle
  // repondrait TOUJOURS « rien n a change » (cf sw.js).
  //
  // Retourne { etat: "ajour" | "maj" | "inconnu", changes: [...], verifies, date }
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
    // Manifeste v2 ou anterieur : aucun validateur retenu, on ne peut RIEN
    // affirmer. On le dit, plutot que d annoncer « a jour » sans preuve.
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
    // 🩸 Aucune sonde n a abouti (hors-ligne, CORS, serveur muet) : on ne
    // conclut pas. Annoncer « a jour » sans avoir rien verifie serait le
    // meme mensonge qu un drapeau memorise.
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
    verifierMaj: verifierMaj,
    supprimer:  supprimer
  };
})();
