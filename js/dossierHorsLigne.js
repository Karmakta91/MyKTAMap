/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// dossierHorsLigne.js — « 📥 Tout garder hors ligne » d'un dossier de l'accueil
// =====================================================================
// Met chaque plan du dossier à jour sur l'appareil, UN plan à la fois (mémoire) : manquant → récupéré, version
// plus récente → mis à jour, à jour → sauté. Plan serveur : PlanOffline (cache dédié) ; plan ZIP de l'index :
// adaptateurs de l'accueil (copie gardée) ; plan d'extension : KtaExtensions.garderHorsLigneExtension ; plan
// local : déjà sur l'appareil. Bilan à la fin : récupérés, mis à jour, déjà là, en échec (avec la raison).
// ⚠️ Confirmation seulement au-delà de SEUIL_CONFIRMATION octets estimés, ou en données mobiles
//   (navigator.connection.type === "cellular" ; API absente = aucune détection, pas de question).
// 🩸 Onglet en arrière-plan : un mobile gèle la page, les requêtes en vol meurent ou restent muettes. Un plan qui
//   échoue après un passage en arrière-plan (ou hors réseau), ou qui ne progresse plus pendant INACTIF_MS au
//   premier plan, est REPRIS au retour, REPRISES_MAX fois : les fichiers déjà rangés par CETTE passe sont sautés
//   (PlanOffline.precacher, opts.faits), jamais un fichier trouvé en cache d'une version précédente.
// 🩸 Fraîcheur « inconnue » (aucune sonde aboutie, serveur sans ETag) : compté « déjà là, non vérifié », jamais
//   « à jour » ni retéléchargé à chaque passe.
// Expose : window.KtaDossierHorsLigne { lancer(planIds, opts), enCours(), SEUIL_CONFIRMATION }
//   opts : { titre, sonderZip(plan) → { statut, taille }, garderZip(plan, signal, progression) → bool, apres() }
// Doc : docs/TILING.md §7 · Checkup : scripts/smoke/checkup-dossier-hors-ligne.js

(function () {
  "use strict";

  const SEUIL_CONFIRMATION = 200 * 1024 * 1024;
  const INACTIF_MS = 30000;
  const REPRISES_MAX = 2;
  const SONDES_TUILES = 4;      // tuiles sondées (HEAD) pour estimer la taille d'un plan V2
  const SONDES_FICHIERS = 40;   // au-delà, les autres fichiers comptent à la moyenne des sondés

  let _enCours = false;

  function _t(k, v) { return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, v) : k; }
  const _esc = function (s) { return window.ktaEsc(s); };   // langManager.js, chargé avant
  function _toast(m, ty) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(m, ty);
  }
  function _mo(octets) {
    const loc = window.ktaLocale ? window.ktaLocale() : "fr-FR";
    return (octets / 1048576).toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  function _nomPlan(p, id) { return String((p && p.name) || id || "").slice(0, 80); }
  function _visible() { return typeof document === "undefined" || document.visibilityState !== "hidden"; }
  function _horsReseau() { return typeof navigator !== "undefined" && navigator.onLine === false; }
  function _erreurArret() { const e = new Error("arret"); e.code = "ARRET"; return e; }

  // true = données mobiles, false = autre réseau, null = navigateur sans navigator.connection (Safari, Firefox).
  function _donneesMobiles() {
    const c = typeof navigator !== "undefined" && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
    if (!c || typeof c.type !== "string") return null;
    return c.type === "cellular";
  }

  // ── Que faire de chaque plan ──────────────────────────────────────
  // → { action: "recuperer" | "maj" | "deja" | "echec", raison?, nonVerifie?, taille? }
  async function _classer(p, ad) {
    if (!p) return { action: "echec", raison: _t("home.plans.dossierHL.raisonIntrouvable") };
    if (p.type === "local") {
      return p.storedBlob ? { action: "deja" } : { action: "echec", raison: _t("home.plans.dossierHL.raisonLocal") };
    }
    if (p.type === "server" && p.zip) {
      if (typeof ad.sonderZip !== "function") return p.storedBlob ? { action: "deja", nonVerifie: true } : { action: "recuperer" };
      let r = null;
      try { r = await ad.sonderZip(p); } catch (e) { r = null; }
      if (!p.storedBlob) {
        if (r && r.statut === "absent") return { action: "echec", raison: _t("home.plans.dossierHL.raisonServeurAbsent") };
        return { action: "recuperer", taille: r && r.taille };
      }
      if (r && r.statut === "aJour") return { action: "deja" };
      if (r && r.statut === "frais") return { action: "maj", taille: r.taille };
      return { action: "deja", nonVerifie: true };
    }
    if (p.type === "server") {
      const PO = window.PlanOffline;
      if (!PO || !PO.supporte()) return { action: "echec", raison: _t("home.plans.dossierHL.raisonCache") };
      const st = await PO.statut(p.id);
      if (st.etat === "absent" || st.etat === "incomplet") return { action: "recuperer" };
      const v = await PO.verifierMaj(p);
      if (v.etat === "maj") return { action: "maj" };
      return v.etat === "ajour" ? { action: "deja" } : { action: "deja", nonVerifie: true };
    }
    if (p.type === "ext") {
      const X = window.KtaExtensions;
      const e = (X && typeof X.etatHorsLigneExtension === "function") ? await X.etatHorsLigneExtension(p.id) : null;
      if (e === "garde") return { action: "deja" };
      if (e === "perime") return { action: "maj" };
      if (e === "absent") return { action: "recuperer" };
      return { action: "echec", raison: _t("home.plans.dossierHL.raisonExtension") };
    }
    return { action: "echec", raison: _t("home.plans.dossierHL.raisonType") };
  }

  // ── Taille estimée (octets, null = inconnue) ──────────────────────
  async function _head(u, signal) {
    try {
      const r = await fetch(u, { method: "HEAD", cache: "no-store", signal: signal });
      const n = Number.parseInt(r.headers.get("Content-Length"), 10);
      return (r.ok && n >= 0) ? n : null;
    } catch (e) { return null; }
  }
  async function _moyenneSondes(urls, n, signal) {
    const pas = Math.max(1, Math.floor(urls.length / n));
    const ech = [];
    for (let i = 0; i < urls.length && ech.length < n; i += pas) ech.push(urls[i]);
    const tailles = (await Promise.all(ech.map(function (u) { return _head(u, signal); })))
      .filter(function (x) { return x !== null; });
    if (!tailles.length) return null;
    return tailles.reduce(function (a, b) { return a + b; }, 0) / tailles.length;
  }
  async function _taillePlanServeur(p, signal) {
    const l = await window.PlanOffline.listerUrls(p);
    const racine = l.racineTuiles;
    const tuiles = [], autres = [];
    l.urls.forEach(function (u) { (racine && u.indexOf(racine + "/") === 0 ? tuiles : autres).push(u); });
    let total = 0, connu = false;
    if (autres.length) {
      const m = await _moyenneSondes(autres, SONDES_FICHIERS, signal);
      if (m !== null) {
        // Peu de fichiers : sondés un par un (la moyenne d'un échantillon ne vaut que pour la masse).
        if (autres.length <= SONDES_FICHIERS) {
          const t = await Promise.all(autres.map(function (u) { return _head(u, signal); }));
          total += t.reduce(function (a, b) { return a + (b || 0); }, 0);
        } else total += m * autres.length;
        connu = true;
      }
    }
    if (tuiles.length) {
      const m = await _moyenneSondes(tuiles, SONDES_TUILES, signal);
      if (m !== null) { total += m * tuiles.length; connu = true; }
    }
    return connu ? Math.round(total) : null;
  }
  async function _taille(p, cl, signal) {
    try {
      if (typeof cl.taille === "number" && cl.taille > 0) return cl.taille;
      if (p.type === "server" && !p.zip) return await _taillePlanServeur(p, signal);
      if (p.type === "ext" && window.KtaExtensions && typeof window.KtaExtensions.tailleHorsLigneExtension === "function") {
        return await window.KtaExtensions.tailleHorsLigneExtension(p.id);
      }
    } catch (e) { /* inconnue */ }
    return null;
  }

  // ── Un plan ───────────────────────────────────────────────────────
  // Rejette avec une Error dont le message est la raison à afficher ; code ARRET = « Arrêter ».
  async function _executer(p, cl, ad, signal, faits, progres) {
    if (p.type === "server" && p.zip) {
      if (typeof ad.garderZip !== "function") throw new Error("");
      const ok = await ad.garderZip(p, signal, function (recus, total) { progres({ octets: recus, total: total }); });
      if (signal.aborted) throw _erreurArret();
      if (!ok) throw new Error(_t("home.plans.dossierHL.raisonZip"));
      return {};
    }
    if (p.type === "server") {
      let r;
      try {
        r = await window.PlanOffline.precacher(p, function (x) { progres({ fichiers: x.fait, total: x.total }); },
          signal, { faits: faits });
      } catch (e) {
        // plan-config.json illisible : raison traduite plutôt que le message technique.
        const m = /HTTP (\d{3})/.exec(String((e && e.message) || ""));
        throw new Error(m ? _t("home.plans.dossierHL.raisonHttp", { statut: m[1] }) : _t("home.plans.dossierHL.raisonReseau"));
      }
      if (r.annule || signal.aborted) throw _erreurArret();
      if (r.total && r.ok === 0) throw new Error(_t("home.plans.dossierHL.raisonAucunFichier"));
      return { manquants: r.echecs || 0 };
    }
    if (p.type === "ext") {
      const r = await window.KtaExtensions.garderHorsLigneExtension(p.id, {
        signal: signal, onProgres: function (recus, total) { progres({ octets: recus, total: total }); }
      });
      if (signal.aborted) throw _erreurArret();
      if (!r.ok) throw new Error(r.raison || _t("home.plans.dossierHL.raisonExtension"));
      return {};
    }
    throw new Error(_t("home.plans.dossierHL.raisonType"));
  }

  function _attendreRetour(stop) {
    return new Promise(function (resolve) {
      const verifier = function () {
        if (stop.aborted || (_visible() && !_horsReseau())) {
          document.removeEventListener("visibilitychange", verifier);
          window.removeEventListener("online", verifier);
          clearInterval(minuterie);
          resolve();
        }
      };
      const minuterie = setInterval(verifier, 1000);
      document.addEventListener("visibilitychange", verifier);
      window.addEventListener("online", verifier);
      verifier();
    });
  }

  // Un plan, avec reprise : passage en arrière-plan / hors réseau pendant le plan, ou plus aucun progrès.
  async function _executerAvecReprise(p, cl, ad, stop, fenetre) {
    const faits = {};
    for (let essai = 0; ; essai++) {
      const ctl = new AbortController();
      const relayer = function () { ctl.abort(); };
      stop.addEventListener("abort", relayer);
      let cache = !_visible(), inactif = false, dernier = Date.now();
      const surVisibilite = function () { if (!_visible()) cache = true; else dernier = Date.now(); };
      document.addEventListener("visibilitychange", surVisibilite);
      const veille = setInterval(function () {
        if (_visible() && Date.now() - dernier > INACTIF_MS) { inactif = true; ctl.abort(); }
      }, 2000);
      try {
        const r = await _executer(p, cl, ad, ctl.signal, faits, function (x) { dernier = Date.now(); fenetre.progres(x); });
        // Fichiers ratés pendant un gel de la page : pas « introuvables », à reprendre.
        if (!(r.manquants && (cache || _horsReseau()) && essai < REPRISES_MAX)) return r;
        console.log("[DossierHL] reprise de " + p.id + " (" + r.manquants + " fichier(s) raté(s) en arrière-plan)");
        fenetre.reprise();
        await _attendreRetour(stop);
        if (stop.aborted) throw _erreurArret();
      } catch (e) {
        if (stop.aborted) throw _erreurArret();
        const reprendre = (cache || inactif || _horsReseau()) && essai < REPRISES_MAX;
        if (!reprendre) {
          if (inactif) throw new Error(_t("home.plans.dossierHL.raisonInactif"));
          throw (e && e.code === "ARRET") ? new Error(_t("home.plans.dossierHL.raisonInterrompu")) : e;
        }
        console.log("[DossierHL] reprise de " + p.id + " (" + (inactif ? "sans progrès" : "arrière-plan / réseau") + ")");
        fenetre.reprise();
        await _attendreRetour(stop);
        if (stop.aborted) throw _erreurArret();
      } finally {
        clearInterval(veille);
        document.removeEventListener("visibilitychange", surVisibilite);
        stop.removeEventListener("abort", relayer);
      }
    }
  }

  // ── Fenêtre d'avancement puis bilan (DOM, textContent) ────────────
  function _fenetre(titre, surArret) {
    const ov = document.createElement("div");
    ov.className = "kta-readme-modal-overlay kta-dhl-overlay";
    ov.style.zIndex = "100002";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    const boite = document.createElement("div");
    boite.className = "kta-readme-modal-boite kta-dhl-boite";
    const tete = document.createElement("div"); tete.className = "kta-readme-modal-header";
    const ti = document.createElement("span"); ti.className = "kta-readme-modal-titre";
    ti.textContent = "📥 " + _t("home.plans.dossierHL.titre", { nom: titre });
    tete.appendChild(ti);
    const corps = document.createElement("div"); corps.className = "kta-readme-modal-corps kta-dhl-corps";
    const ligne = document.createElement("div"); ligne.className = "kta-dhl-ligne"; ligne.id = "kta-dhl-ligne";
    const barre = document.createElement("progress"); barre.className = "kta-dhl-barre"; barre.max = 100;
    const detail = document.createElement("div"); detail.className = "kta-dhl-detail kta-tx-muted"; detail.id = "kta-dhl-detail";
    const bilan = document.createElement("div"); bilan.className = "kta-dhl-bilan"; bilan.id = "kta-dhl-bilan"; bilan.hidden = true;
    const actions = document.createElement("div"); actions.className = "kta-conv-actions";
    const bArret = document.createElement("button");
    bArret.type = "button"; bArret.className = "kta-btn kta-btn-ghost"; bArret.id = "kta-dhl-arreter";
    bArret.textContent = "⏹ " + _t("home.plans.dossierHL.arreter");
    bArret.addEventListener("click", function () { bArret.disabled = true; detail.textContent = _t("home.plans.dossierHL.arretEnCours"); surArret(); });
    actions.appendChild(bArret);
    corps.append(ligne, barre, detail, bilan, actions);
    boite.append(tete, corps); ov.appendChild(boite);
    document.documentElement.appendChild(ov);
    let fini = false;
    const fermer = function () { document.removeEventListener("keydown", surTouche, true); ov.remove(); };
    // Échap : ne fait rien pendant le travail (le bouton « Arrêter » est le seul geste), ferme le bilan.
    const surTouche = function (e) { if (e.key === "Escape" && fini) { e.stopPropagation(); fermer(); } };
    document.addEventListener("keydown", surTouche, true);
    return {
      preparer(i, n) {
        ligne.textContent = _t("home.plans.dossierHL.preparation", { i: i, n: n });
        barre.removeAttribute("value"); detail.textContent = "";
      },
      estimer(i, n) {
        ligne.textContent = _t("home.plans.dossierHL.estimation", { i: i, n: n });
        barre.removeAttribute("value"); detail.textContent = "";
      },
      plan(i, n, nom) {
        ligne.textContent = _t("home.plans.dossierHL.planEnCours", { i: i, n: n, nom: nom });
        barre.removeAttribute("value"); detail.textContent = _t("home.plans.dossierHL.demarrage");
      },
      progres(x) {
        if (x.fichiers !== undefined) {
          if (x.total) barre.value = Math.min(100, Math.round(x.fichiers / x.total * 100));
          detail.textContent = _t("home.plans.dossierHL.fichiers", { fait: x.fichiers, total: x.total });
        } else if (x.total) {
          barre.value = Math.min(100, Math.round(x.octets / x.total * 100));
          detail.textContent = _t("home.plans.dossierHL.octets", { recus: _mo(x.octets), total: _mo(x.total) });
        } else {
          barre.removeAttribute("value");
          detail.textContent = _t("home.plans.dossierHL.octetsRecus", { recus: _mo(x.octets || 0) });
        }
      },
      reprise() { detail.textContent = _t("home.plans.dossierHL.reprise"); },
      masquer() { ov.hidden = true; },
      montrer() { ov.hidden = false; },
      bilan(res) {
        fini = true;
        ligne.textContent = _t(res.arrete ? "home.plans.dossierHL.finArret" : "home.plans.dossierHL.fin");
        barre.hidden = true; detail.textContent = "";
        bilan.hidden = false; bilan.textContent = "";
        const bloc = function (cle, liste, n, extra) {
          if (!n) return;
          const t = document.createElement("div"); t.className = "kta-dhl-bilan-titre"; t.dataset.bilan = cle;
          t.textContent = _t("home.plans.dossierHL.bilan." + cle, { n: n }) + (extra || "");
          bilan.appendChild(t);
          if (liste && liste.length) {
            const ul = document.createElement("ul"); ul.className = "kta-dhl-bilan-liste";
            liste.slice(0, 30).forEach(function (x) { const li = document.createElement("li"); li.textContent = x; ul.appendChild(li); });
            if (liste.length > 30) { const li = document.createElement("li"); li.textContent = "…"; ul.appendChild(li); }
            bilan.appendChild(ul);
          }
        };
        bloc("recuperes", res.recuperes, res.recuperes.length);
        bloc("majs", res.majs, res.majs.length);
        bloc("deja", null, res.deja,
          res.nonVerifies ? " " + _t("home.plans.dossierHL.bilan.nonVerifies", { n: res.nonVerifies }) : "");
        bloc("echecs", res.echecs.map(function (e) { return e.nom + (e.raison ? " — " + e.raison : ""); }), res.echecs.length);
        bloc("nonTraites", res.nonTraites, res.nonTraites.length);
        if (!bilan.childNodes.length) bloc("vide", null, 1);
        bArret.remove();
        const ok = document.createElement("button");
        ok.type = "button"; ok.className = "kta-btn kta-btn-primary"; ok.id = "kta-dhl-fermer";
        ok.textContent = _t("config.actions.close");
        ok.addEventListener("click", fermer);
        actions.appendChild(ok);
        setTimeout(function () { try { ok.focus(); } catch (e) { /* détaché */ } }, 30);
      }
    };
  }

  // ── Point d'entrée ────────────────────────────────────────────────
  async function lancer(planIds, opts) {
    const ad = opts || {};
    if (_enCours) { _toast(_t("home.plans.dossierHL.dejaEnCours"), "warn"); return null; }
    const PR = window.PlanRegistry;
    const ids = (Array.isArray(planIds) ? planIds : []).filter(Boolean);
    if (!ids.length) { _toast(_t("home.plans.dossierHL.vide"), "info"); return null; }
    if (_horsReseau()) { _toast(_t("home.plans.dossierHL.horsReseau"), "warn"); return null; }
    _enCours = true;
    const stop = new AbortController();
    const fenetre = _fenetre(String(ad.titre || ""), function () { stop.abort(); });
    const res = { recuperes: [], majs: [], deja: 0, nonVerifies: 0, echecs: [], nonTraites: [], arrete: false };
    try {
      // 1. Classer (lecture du cache, sondes conditionnelles) puis estimer ce qui doit partir.
      const aFaire = [];
      for (let i = 0; i < ids.length; i++) {
        if (stop.signal.aborted) break;
        fenetre.preparer(i + 1, ids.length);
        const p = PR && PR.findById(ids[i]);
        let cl;
        try { cl = await _classer(p, ad); } catch (e) { cl = { action: "echec", raison: String((e && e.message) || e).slice(0, 160) }; }
        if (cl.action === "deja") { res.deja++; if (cl.nonVerifie) res.nonVerifies++; }
        else if (cl.action === "echec") res.echecs.push({ nom: _nomPlan(p, ids[i]), raison: cl.raison || "" });
        else aFaire.push({ p: p, cl: cl });
      }
      let total = 0, inconnues = 0;
      for (let i = 0; i < aFaire.length && !stop.signal.aborted; i++) {
        fenetre.estimer(i + 1, aFaire.length);
        const n = await _taille(aFaire[i].p, aFaire[i].cl, stop.signal);
        if (n === null) inconnues++; else total += n;
      }
      // 2. Confirmation : gros volume ou données mobiles seulement.
      const mobile = _donneesMobiles();
      if (aFaire.length && !stop.signal.aborted && (total > SEUIL_CONFIRMATION || mobile === true)) {
        fenetre.masquer();
        const msg = _t("home.plans.dossierHL.confirmer", { n: aFaire.length, mo: _mo(total) }) +
          (inconnues ? "\n" + _t("home.plans.dossierHL.confirmerInconnues", { n: inconnues }) : "") +
          (mobile === true ? "\n\n" + _t("home.plans.dossierHL.confirmerMobile") : "");
        const oui = await window.ktaConfirm(_esc(msg), {
          titre: "📥 " + _esc(_t("home.plans.dossierHL.bouton")),
          okLabel: _esc(_t("home.plans.dossierHL.confirmerOk"))
        });
        fenetre.montrer();
        if (!oui) {
          res.arrete = true;
          aFaire.forEach(function (x) { res.nonTraites.push(_nomPlan(x.p)); });
          aFaire.length = 0;
        }
      }
      // 3. Un plan à la fois.
      for (let i = 0; i < aFaire.length; i++) {
        const x = aFaire[i];
        if (stop.signal.aborted) { res.nonTraites.push(_nomPlan(x.p)); continue; }
        fenetre.plan(i + 1, aFaire.length, _nomPlan(x.p));
        try {
          const r = await _executerAvecReprise(x.p, x.cl, ad, stop.signal, fenetre);
          const nom = _nomPlan(x.p) + (r && r.manquants ? " " + _t("home.plans.dossierHL.manquants", { n: r.manquants }) : "");
          (x.cl.action === "maj" ? res.majs : res.recuperes).push(nom);
        } catch (e) {
          if (e && e.code === "ARRET") { res.nonTraites.push(_nomPlan(x.p)); continue; }
          res.echecs.push({ nom: _nomPlan(x.p), raison: String((e && e.message) || "").slice(0, 160) });
        }
      }
      if (stop.signal.aborted) res.arrete = true;
    } finally {
      _enCours = false;
      if (typeof ad.apres === "function") { try { ad.apres(); } catch (e) { /* liste démontée */ } }
    }
    fenetre.bilan(res);
    const resume = _t("home.plans.dossierHL.toast", {
      nom: String(ad.titre || ""), r: res.recuperes.length, m: res.majs.length, d: res.deja
    }) + (res.echecs.length ? " " + _t("home.plans.dossierHL.toastEchecs", { n: res.echecs.length }) : "") +
      (res.arrete ? " " + _t("home.plans.dossierHL.toastArret") : "");
    _toast(resume, (res.echecs.length || res.arrete) ? "warn" : "success");
    console.log("[DossierHL] bilan :", JSON.stringify({ r: res.recuperes.length, m: res.majs.length, d: res.deja,
      e: res.echecs.length, n: res.nonTraites.length }));
    return res;
  }

  window.KtaDossierHorsLigne = {
    lancer: lancer,
    enCours: function () { return _enCours; },
    SEUIL_CONFIRMATION: SEUIL_CONFIRMATION
  };
})();
