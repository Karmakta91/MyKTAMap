/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// verifierPlanAuto.js — passe légère de « Vérifier le plan » : les bloquants seuls (C1 à C3), au repos, à l'ouverture
// d'un plan et à la fin du Générateur. Pastille du nombre sur l'entrée de l'outil, UN toast « warn » tant que ce
// nombre ne change pas (mémorisé par plan sur l'appareil), rien quand il vaut 0.
// ⚠️ contrat : compte avec KtaVerifierPlan.bloquants (les fonctions de la liste, jamais une copie) ; gravité
//   « bloquant » seulement (un niveau traversé de C2 est « info »), « Vu, normal » exclus à la LECTURE (nombre()),
//   donc juste dès qu'on en marque un.
// ⚠️ contrat : jamais pendant le splash ni le premier rendu (mktm:plan-pret, fin du splash, deux images, ATTENTE_MS,
//   puis requestIdleCallback) ; par tranches dont la taille s'ajuste pour viser TRANCHE_MS. Plafond PLAFOND_MS ou
//   PLAFOND_TRANCHES dépassé, ou exception du moteur : abandon, console.warn, ni pastille ni toast.
// 🩸 Une tranche ne descend pas sous UN objet (un tracé, un point, une jonction) : un objet démesuré reste d'un bloc.
// Urgence (Mode Secours, mode urgence, Je suis perdu) ou plan en lecture seule : pastille seule, aucun toast.
// Expose : window.KtaVerifierPlanAuto = { lancer(d, opts) → Promise, verifierZip(zip, cfg) → Promise, nombre(),
//   etat(), pastilleHtml(), toastAutorise(), CLE_LS, TRANCHE_MS }.
// Garde-fous : scripts/check-verifier-plan-auto.js, scripts/smoke/checkup-verifier-plan-auto.js.
// Doc : docs/architecture/multilevel-pathfinding.md § Vérifier le plan.

window.KtaVerifierPlanAuto = (function () {
  "use strict";

  const CLE_LS = "myktamap_verif_auto_v1";   // { planId: nombre annoncé } ; propre à l'appareil, hors export du profil
  const LS_MAX = 200;                         // plans retenus, les plus anciens partent
  const TRANCHE_MS = 8;                       // durée visée d'une tranche (le fil reste libre bien sous 50 ms)
  const BUDGET_MS = 12;                       // tranches enchaînées dans un même créneau de repos
  const ATTENTE_MS = 1500;                    // après le plan prêt : tuiles et calques finissent de se poser
  const DONNEES_MS = 2000;                    // calme après une modification avant de recompter
  const PLAFOND_MS = 60000;                   // au-delà, la passe abandonne (moteur qui ne rend plus la main)
  const PLAFOND_TRANCHES = 20000;
  const TAILLE0 = { C1: 64, C2: 1, C3: 1 };

  let _jeton = 0;
  let _etat = null;          // { planId, cles: [clés des bloquants], maxMs, tranches, ms }
  let _donneesTimer = 0;

  function _t(k, p) { return window.I18n && typeof window.I18n.t === "function" ? window.I18n.t(k, p) : k; }
  function _api() {
    const V = window.KtaVerifierPlan;
    return typeof V?.bloquants?.C1 === "function" ? V : null;
  }
  function _maintenant() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }
  function _repos(fn) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(function (dl) { fn(dl); }, { timeout: 2000 });
    } else {
      setTimeout(function () { fn(null); }, 16);
    }
  }

  // ── Découpage ──────────
  // Unités par contrôle : C1 = galeries (un constat par paire tracé × obstacle, donc par tracé), C2 = points qui
  // relient des niveaux, C3 = tracés jonction. Une tranche reçoit les données entières sauf la liste découpée ; C2 et
  // C3 (multi-niveau seulement) mesurent la distance aux galeries d'un niveau : la tranche ne reçoit que les galeries
  // des niveaux qu'elle lit (même résultat, _segmentsNiveau filtre par niveau), unités triées par niveaux pour que
  // les tranches en partagent.
  function _niv(o) { return Number.isInteger(o && o.level) ? o.level : 0; }
  function _niveauxDe(ctl, o) {
    if (ctl === "C3") {
      return [Number.isInteger(o.fromLevel) ? o.fromLevel : 0, Number.isInteger(o.toLevel) ? o.toLevel : 0];
    }
    const PJ = window.KtaPoiJonction;
    const n = PJ && typeof PJ.niveaux === "function" ? PJ.niveaux(o) : null;
    return Array.isArray(n) && n.length ? n : [_niv(o)];
  }
  function _unites(d) {
    const PJ = window.KtaPoiJonction;
    const galeries = [], jonctions = [], parNiveau = new Map();
    (d.roads || []).forEach(function (r) {
      if (!r || !Array.isArray(r.points)) return;
      if (r.type === "jonction") { jonctions.push(r); return; }
      galeries.push(r);
      const n = _niv(r);
      if (!parNiveau.has(n)) parNiveau.set(n, []);
      parNiveau.get(n).push(r);
    });
    const estJonction = typeof PJ?.estJonction === "function" ? PJ.estJonction : null;
    const points = d.multiLevel && estJonction
      ? (d.points || []).filter(function (p) { return !!p && estJonction(p); }) : [];
    return { C1: galeries, C2: d.multiLevel ? _trierParNiveaux("C2", points) : [],
      C3: d.multiLevel ? _trierParNiveaux("C3", jonctions) : [], parNiveau: parNiveau };
  }
  function _trierParNiveaux(ctl, l) {
    return l.map(function (o) { return { o: o, k: _niveauxDe(ctl, o).join(",") }; })
      .sort(function (a, b) { return a.k.localeCompare(b.k); }).map(function (e) { return e.o; });
  }
  function _galeriesDes(u, ctl, lot) {
    const niveaux = new Set();
    lot.forEach(function (o) { _niveauxDe(ctl, o).forEach(function (n) { niveaux.add(n); }); });
    let out = [];
    niveaux.forEach(function (n) { out = out.concat(u.parNiveau.get(n) || []); });
    return out;
  }
  function _donneesTranche(d, u, ctl, lot) {
    if (ctl === "C1") return { ...d, roads: lot };
    if (ctl === "C2") return { ...d, points: lot, roads: _galeriesDes(u, ctl, lot) };
    return { ...d, roads: _galeriesDes(u, ctl, lot).concat(lot) };
  }

  // Données hors plan ouvert (Générateur) : le multi-niveau du graphe et de KtaPoiJonction.estJonction se lit sur
  // APP_CONFIG ; il prend celui du plan généré le temps du découpage et d'une tranche (synchrone : rien d'autre ne
  // s'exécute entre les deux).
  function _avecMulti(d, fn) {
    const C = window.APP_CONFIG;
    if (d.planOuvert || !C) return fn();
    const avant = C.multiLevel;
    C.multiLevel = d.multiLevel === true;
    try { return fn(); } finally { C.multiLevel = avant; }
  }

  // 🩸 C2 compte aussi, pour l'affichage, les galeries que proposerait KtaPoiJonction.proposerRaccords : un parcours de
  // tout le réseau par passage signalé (~17 ms chacun sur 10 000 tracés). La passe ne lit que le compte des constats :
  // proposerRaccords est neutralisé le temps de la tranche (synchrone, rendu dans finally).
  function _sansPropositions(fn) {
    const PJ = window.KtaPoiJonction;
    if (!PJ || typeof PJ.proposerRaccords !== "function") return fn();
    const avant = PJ.proposerRaccords;
    PJ.proposerRaccords = function () { return null; };
    try { return fn(); } finally { PJ.proposerRaccords = avant; }
  }

  // Une tranche de la passe p : le lot suivant du contrôle en cours, taille ajustée sur sa durée. → false : fini.
  function _tranche(p) {
    const ordre = ["C1", "C2", "C3"];
    while (p.ic < ordre.length && p.pos >= p.u[ordre[p.ic]].length) { p.ic++; p.pos = 0; }
    if (p.ic >= ordre.length) return false;
    const ctl = ordre[p.ic];
    const lot = p.u[ctl].slice(p.pos, p.pos + p.taille[ctl]);
    const a = p.now();
    const constats = _avecMulti(p.d, function () { return _controler(p.V, ctl, _donneesTranche(p.d, p.u, ctl, lot)); });
    const dt = p.now() - a;
    p.pos += lot.length;
    p.res.tranches++;
    if (dt > p.res.maxMs) p.res.maxMs = dt;
    (constats || []).forEach(function (c) { if (c?.gravite === "bloquant") p.res.cles.push(c.cle); });
    if (dt < TRANCHE_MS / 2) p.taille[ctl] *= 2;
    else if (dt > TRANCHE_MS * 2) p.taille[ctl] = Math.max(1, Math.floor(p.taille[ctl] / 2));
    return true;
  }
  function _controler(V, ctl, td) {
    if (ctl !== "C2") return V.bloquants[ctl](td);
    return _sansPropositions(function () { return V.bloquants.C2(td); });
  }
  // Un créneau de repos : collecte au premier, puis tranches tant que le budget le permet.
  // → "suite" (replanifier), "fini", ou "abandon".
  function _creneau(p, dl) {
    if (!p.d) {
      const a = p.now();
      p.d = p.donnees || p.V.collecter();
      p.u = _avecMulti(p.d, function () { return _unites(p.d); });
      p.res.maxMs = Math.max(p.res.maxMs, p.now() - a);
    }
    const debut = p.now();
    let encore = true;
    do {
      encore = _tranche(p);
      if (p.now() - p.t0 > PLAFOND_MS || p.res.tranches > PLAFOND_TRANCHES) return "abandon";
    } while (encore && p.now() - debut < BUDGET_MS && (!dl || dl.timeRemaining() > TRANCHE_MS));
    return encore ? "suite" : "fini";
  }

  // → Promise<{ cles, maxMs, tranches, ms } | null> (null : abandon, ou passe remplacée par une plus récente).
  // opts : { jeton, repos(fn) (planificateur, Node), maintenant() }.
  function lancer(donnees, opts) {
    const o = opts || {};
    const V = _api();
    if (!V) return Promise.resolve(null);
    const repos = o.repos || _repos;
    const now = o.maintenant || _maintenant;
    const p = { V: V, donnees: donnees, now: now, t0: now(), d: null, u: null, ic: 0, pos: 0, taille: { ...TAILLE0 },
      res: { cles: [], maxMs: 0, tranches: 0, ms: 0 } };
    return new Promise(function (resolve) {
      const abandon = function (motif, err) {
        console.warn("[VerifierPlan] passe légère abandonnée : " + motif, err || "");
        resolve(null);
      };
      const creneau = function (dl) {
        if (o.jeton !== undefined && o.jeton !== _jeton) return resolve(null);
        let issue;
        try { issue = _creneau(p, dl); } catch (e) { return abandon("erreur du moteur", e); }
        if (issue === "abandon") return abandon("plafond dépassé");
        if (issue === "suite") return repos(creneau);
        p.res.ms = now() - p.t0;
        return resolve(p.res);
      };
      repos(creneau);
    });
  }

  // ── Mémoire par plan (nombre annoncé par un toast) ──────────
  function _lireLs() {
    try {
      const v = JSON.parse(localStorage.getItem(CLE_LS) || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }   // illisible ou stockage refusé : rien de retenu, le toast reviendra
  }
  function _ecrireLs(planId, n) {
    try {
      const m = _lireLs();
      delete m[planId];
      m[planId] = n;
      const cles = Object.keys(m);
      cles.slice(0, Math.max(0, cles.length - LS_MAX)).forEach(function (k) { delete m[k]; });
      localStorage.setItem(CLE_LS, JSON.stringify(m));
    } catch (e) { /* stockage plein ou refusé : le toast reviendra à la prochaine ouverture */ }
  }

  // ── Lecture ──────────
  function _vus() {
    return new Set(typeof window.getPlanVerifVus === "function" ? window.getPlanVerifVus() : []);
  }
  // Nombre de bloquants du plan ouvert, « Vu, normal » retirés ; null tant qu'aucune passe n'a abouti pour lui.
  function nombre() {
    if (!_etat || _etat.planId !== (window._currentLoadedPlanId || null)) return null;
    const vus = _vus();
    return _etat.cles.filter(function (k) { return !vus.has(k); }).length;
  }
  function pastilleHtml() {
    const n = nombre();
    if (!n) return "";
    return '<span class="kta-verif-pastille" data-kta-verif-pastille title="' +
      window.ktaEsc(_t(n === 1 ? "verif.auto.pastille.un" : "verif.auto.pastille.n", { n: n })) + '">' + n + "</span>";
  }
  function _urgence() {
    try {
      if (window.EmergencyMode?.isActif?.()) return true;
      if (window.SecoursMode?.isOpen?.()) return true;
      if (window.LostMode?.isActive?.()) return true;
    } catch (e) { /* module absent ou en erreur : pas d'urgence connue */ }
    return false;
  }
  function _lectureSeule() {
    return typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee(true) === true;
  }
  // Toast permis ici : ni urgence, ni plan en lecture seule (l'utilisateur ne peut rien corriger).
  function toastAutorise() { return !_urgence() && !_lectureSeule(); }

  // Pastilles déjà affichées (Éditeur de données ouvert pendant la passe) : remises au nombre courant.
  function _majPastilles() {
    const n = nombre();
    document.querySelectorAll("[data-kta-verif-hote]").forEach(function (hote) {
      const p = hote.querySelector("[data-kta-verif-pastille]");
      if (p) p.remove();
      if (n) hote.insertAdjacentHTML("beforeend", pastilleHtml());
    });
  }

  function _toast(msg) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, "warn");
  }

  // ── Plan ouvert ──────────
  // `silencieux` : recompte après une modification (pastille seule ; le toast de saisie de verifierPlan.js dit déjà
  // une coupure nouvelle).
  function _passePlan(silencieux) {
    const planId = window._currentLoadedPlanId || null;
    if (!planId || !_api()) return Promise.resolve(null);
    const jeton = ++_jeton;
    return lancer(null, { jeton: jeton }).then(function (r) {
      if (!r || jeton !== _jeton || planId !== (window._currentLoadedPlanId || null)) return null;
      _etat = { planId: planId, cles: r.cles, maxMs: r.maxMs, tranches: r.tranches, ms: r.ms };
      _majPastilles();
      if (silencieux) return _etat;
      const n = nombre();
      if (!n) { _ecrireLs(planId, 0); return _etat; }
      if (_lireLs()[planId] === n || !toastAutorise()) return _etat;
      _ecrireLs(planId, n);
      _toast(_t(n === 1 ? "verif.auto.toast.un" : "verif.auto.toast.n", { n: n }));
      return _etat;
    });
  }

  function _apresPremierRendu(fn) {
    const suite = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { setTimeout(fn, ATTENTE_MS); });
      });
    };
    if (window.KtaSplash && typeof window.KtaSplash.surFermeture === "function") window.KtaSplash.surFermeture(suite);
    else suite();
  }

  window.addEventListener("mktm:plan-pret", function () {
    _etat = null;
    _jeton++;
    clearTimeout(_donneesTimer);
    _apresPremierRendu(function () { _passePlan(false); });
  });
  window.addEventListener("mktm:plan-ferme", function () {
    _etat = null;
    _jeton++;
    clearTimeout(_donneesTimer);
  });
  window.addEventListener("kta:donneesPlanChange", function () {
    if (!_etat) return;   // passe d'ouverture pas encore faite : elle lira l'état à jour
    clearTimeout(_donneesTimer);
    _donneesTimer = setTimeout(function () { _passePlan(true); }, DONNEES_MS);
  });

  // ── Fin du Générateur ──────────
  // Lit les calques écrits dans le ZIP (data/*.json, après le décalage du rognage), comme le chargement les lira.
  // cfg : { multiLevel, echelle, image: { w, h } }. → Promise<nombre | null> ; toast « warn » s'il y a des bloquants.
  function _lireCalque(json, d) {
    if (!json || typeof json !== "object") return;
    if (Array.isArray(json.roads)) d.roads = d.roads.concat(json.roads);
    if (Array.isArray(json.zones)) {
      const lue = typeof window.ktaZoneLue === "function" ? window.ktaZoneLue : function (z) { return z; };
      d.zones = d.zones.concat(json.zones.map(lue));
    }
    if (Array.isArray(json.structures)) d.structures = d.structures.concat(json.structures);
    [json.data, json.editorPoints, json.points].forEach(function (l) {
      if (Array.isArray(l)) d.points = d.points.concat(l.filter(function (p) { return p && typeof p === "object"; }));
    });
  }
  function verifierZip(zip, cfg) {
    const c = cfg || {};
    if (!zip || typeof zip.file !== "function" || !_api()) return Promise.resolve(null);
    const d = { roads: [], zones: [], structures: [], points: [], multiLevel: c.multiLevel === true,
      echelle: Number(c.echelle) || 0, image: c.image || { w: 0, h: 0 }, niveaux: null, planOuvert: false };
    const fichiers = zip.file(/^data\/[^/]+\.json$/);
    return Promise.all(fichiers.map(function (f) {
      return f.async("string").then(function (txt) {
        try { _lireCalque(JSON.parse(txt), d); } catch (e) { /* calque illisible : le chargement l'ignorera aussi */ }
      });
    })).then(function () { return lancer(d); }).then(function (r) {
      if (!r) return null;
      const n = r.cles.length;
      if (n && !_urgence()) _toast(_t(n === 1 ? "verif.auto.generateur.un" : "verif.auto.generateur.n", { n: n }));
      return n;
    }).catch(function (e) {
      console.warn("[VerifierPlan] passe du Générateur abandonnée", e);
      return null;
    });
  }

  return {
    lancer: lancer,
    verifierZip: verifierZip,
    nombre: nombre,
    pastilleHtml: pastilleHtml,
    toastAutorise: toastAutorise,
    // Diagnostic et harnais : dernière passe du plan ouvert.
    etat: function () {
      return _etat ? { planId: _etat.planId, bloquants: _etat.cles.length, nombre: nombre(), maxMs: _etat.maxMs,
        tranches: _etat.tranches, ms: _etat.ms } : null;
    },
    CLE_LS: CLE_LS,
    TRANCHE_MS: TRANCHE_MS
  };
})();
