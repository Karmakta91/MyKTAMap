/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// EXTENSIONS — js/ktaExtensions.js
// =========================
//
// 🎯 Rôle : l'interrupteur de la CONNEXION SERVEUR d'une instance, et la
// pastille qui en montre l'état dans le pied de page de l'accueil.
// Contrat complet : docs/architecture/community-server-line.md §3.
//
// L'instance déclare dans `data/index.json > config.serverConnection` :
//   { "state": "on" | "off", "api": "https://…", "modules": ["chemin/module.js?v=1.0.0"] }
//
// États produits ici :
//   off        — champ absent ou "off" (myktamap.fr : aucun backend, jamais)
//   invalide   — champ mal formé (raison exacte journalisée [Connexion])
//   licence    — "on", mais aucune licence pro de source "server"
//   configuree — "on" + licence serveur, aucun module déclaré pour l'instant
//
// ⚠️ Ce module ne fait AUCUNE requête : il lit l'index déjà chargé par
// main.js > _chargerIndexServeur(), et ne contacte jamais `api`. Personne ne
// sonde le serveur tant qu'aucun module greffé ne le fait (règle C) ; les
// états « connecté » et « injoignable » viendront de ces modules.
//
// 🩸 « Index injoignable » n'est PAS « connexion coupée » (même piège que
// UnlockGate.revaliderInstance) : l'appelant DÉCLARE si l'index a répondu.
// Injoignable → on rejoue la dernière config connue (règle B), on ne
// l'efface pas.

(function () {
  "use strict";

  // Dernière config valide connue de l'instance. Donnée de l'INSTANCE, pas de
  // l'utilisateur : elle ne voyage pas avec l'export de profil.
  const LS_MEMO = "myktamap_server_connection_v1";
  // v2.7.0 (chantier 3) : `on` et `down` existent — un module greffé les
  // SIGNALE (règle C : community ne sonde jamais le serveur).
  const ETATS = ["off", "invalide", "licence", "configuree", "on", "down"];
  const CLASSE_ETAT = {
    off:        "kta-tx-muted",
    invalide:   "kta-tx-err",
    licence:    "kta-tx-warn",
    configuree: "kta-tx-info",
    on:         "kta-tx-ok",
    down:       "kta-tx-warn"
  };
  const MAX_MODULES = 20;

  let _connexion = { etat: "off", raison: "" };   // résultat de valider()
  let _etat = "off";
  let _raison = "";
  let _dejaEmis = false;
  let _signal = null;   // "on" | "down" | null — posé par un module greffé (signaler)

  // ── Validation : fonction PURE, sans DOM ni stockage ──
  // 🩸 confadmin.html applique EXACTEMENT les mêmes règles :
  // scripts/check-connexion-serveur.js exécute les deux sur la même table de
  // cas et refuse toute divergence (une instance que ConfAdmin juge valide et
  // que l'app juge invalide serait le pire des deux mondes).
  function valider(sc) {
    if (sc === undefined || sc === null) return { etat: "off", raison: "absent" };
    if (typeof sc !== "object" || Array.isArray(sc)) {
      return { etat: "invalide", raison: "serverConnection doit être un objet" };
    }
    if (sc.state === "off") return { etat: "off", raison: "désactivé par l'instance" };
    if (sc.state !== "on") return { etat: "invalide", raison: "state doit valoir \"on\" ou \"off\"" };

    if (typeof sc.api !== "string" || !/^https:\/\/[^\s/?#]+/i.test(sc.api.trim())) {
      return { etat: "invalide", raison: "api doit être une adresse https://" };
    }
    if (!Array.isArray(sc.modules)) {
      return { etat: "invalide", raison: "modules doit être une liste" };
    }
    if (sc.modules.length > MAX_MODULES) {
      return { etat: "invalide", raison: "plus de " + MAX_MODULES + " modules" };
    }
    for (let i = 0; i < sc.modules.length; i++) {
      const m = sc.modules[i];
      // Même origine que l'app (script-src 'self') : chemin relatif, sans
      // schéma, sans « // », sans remontée, terminé par .js. Un seul suffixe
      // permis : « ?v=<version> » (v2.7.2). Le SW sert les modules depuis son
      // cache (URL exacte) : changer la version change l'URL, donc la nouvelle
      // version d'un module arrive sans attendre une release community.
      if (typeof m !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.js(\?v=[A-Za-z0-9._-]{1,32})?$/.test(m) ||
          m.indexOf("..") >= 0 || m.indexOf("//") >= 0) {
        return { etat: "invalide", raison: "module hors de l'origine de l'app : " + String(m).slice(0, 80) };
      }
    }
    return {
      etat: "on",
      raison: "",
      api: sc.api.trim(),
      modules: sc.modules.slice()
    };
  }

  // ── Règle E : « on » n'aboutit qu'avec une licence de source "server" ──
  // Une licence importée par l'utilisateur (source "local") ne suffit pas.
  function etatDe(connexion, sourceLicence) {
    if (!connexion || connexion.etat === "off") return "off";
    if (connexion.etat === "invalide") return "invalide";
    return sourceLicence === "server" ? "configuree" : "licence";
  }

  function _sourceLicence() {
    const L = window.MyKTAMapProLicense;
    if (!L || typeof L.isPro !== "function" || !L.isPro()) return null;
    return typeof L.getSource === "function" ? L.getSource() : null;
  }

  function _lireMemo() {
    try {
      const brut = localStorage.getItem(LS_MEMO);
      return brut ? JSON.parse(brut) : null;
    } catch (e) { return null; }
  }

  function _ecrireMemo(connexion) {
    try {
      if (connexion.etat === "on") {
        localStorage.setItem(LS_MEMO, JSON.stringify({
          state: "on", api: connexion.api, modules: connexion.modules
        }));
      } else {
        localStorage.removeItem(LS_MEMO);
      }
    } catch (e) { /* stockage indisponible : on fera sans mémoire */ }
  }

  // ── Point d'entrée appelé par main.js ──
  // `indexRepondu` : true si data/index.json a répondu (même sans config),
  // false s'il est injoignable. Seul l'appelant le sait.
  function appliquerConfig(config, indexRepondu) {
    if (indexRepondu === true) {
      const sc = (config && typeof config === "object") ? config.serverConnection : undefined;
      _connexion = valider(sc);
      _ecrireMemo(_connexion);
      if (_connexion.etat === "invalide") {
        console.warn("[Connexion] config.serverConnection ignoré : " + _connexion.raison);
      }
    } else {
      const memo = _lireMemo();
      _connexion = memo ? valider(memo) : { etat: "off", raison: "absent" };
    }
    _recalculer();
  }

  function _recalculer() {
    const avant = _etat;
    _etat = etatDe(_connexion, _sourceLicence());
    // Le signal d'un module ne vaut que sur une instance « configurée » (on +
    // licence serveur) : il ne peut jamais rallumer une instance OFF.
    if (_etat === "configuree" && _signal) _etat = _signal;
    _raison = _connexion.raison || "";
    peindre();
    if (_etat !== avant || !_dejaEmis) {
      _dejaEmis = true;
      console.log("[Connexion] état : " + _etat + (_raison ? " (" + _raison + ")" : ""));
      try {
        window.dispatchEvent(new CustomEvent("mktm:connexion-changed", {
          detail: { etat: _etat, raison: _raison }
        }));
      } catch (e) {}
    }
  }

  // ── Affichage ──
  const _t = function (k, p) { return window.I18n ? window.I18n.t(k, p) : k; };

  function _libelle(etat) { return _t("home.serveur.mot." + etat); }

  // Pastille du pied de page, bloc d'état de la modale « Que fait l'app sur le
  // réseau ? », et icône du bouton de pied de page replié (qui masque tout
  // #loaderFooterBlock, pastille comprise). homeLoader rappelle peindre()
  // après chaque repli/dépli, car il réécrit le texte de ce bouton.
  function peindre() {
    // Dicos pas encore prêts : pas de clé brute à l'écran, onChange repeindra.
    if (window.I18n && typeof window.I18n.has === "function" && !window.I18n.has("home.serveur.mot.off")) return;
    const cls = CLASSE_ETAT[_etat] || CLASSE_ETAT.off;
    const mot = _libelle(_etat);
    // L'infobulle et le titre du bloc disent « Base de données : <état> » :
    // ils prennent la forme courte de l'état, pas le mot de la pastille (qui
    // contient déjà « Base de données »).
    const etatCourt = _t("home.serveur.etat." + _etat);
    const titre = _t("home.serveur.infobulle", { etat: etatCourt });

    const chip = document.getElementById("loaderCnxChip");
    if (chip) {
      Object.keys(CLASSE_ETAT).forEach(function (k) { chip.classList.remove(CLASSE_ETAT[k]); });
      chip.classList.add(cls);
      const motEl = chip.querySelector(".kta-cnx-mot");
      if (motEl) motEl.textContent = mot;
      chip.title = titre;
      chip.setAttribute("aria-label", titre);
      chip.hidden = false;
    }

    const bloc = document.getElementById("loaderNetDocCnx");
    if (bloc) {
      const t = bloc.querySelector(".kta-cnx-bloc-titre");
      const d = bloc.querySelector(".kta-cnx-bloc-texte");
      if (t) {
        t.textContent = _t("home.serveur.blocTitre", { etat: etatCourt });
        Object.keys(CLASSE_ETAT).forEach(function (k) { t.classList.remove(CLASSE_ETAT[k]); });
        t.classList.add(cls);
      }
      if (d) d.textContent = _t("home.serveur.explication." + _etat);
      bloc.hidden = false;
    }

    const toggle = document.getElementById("loaderFooterToggle");
    if (toggle) {
      let mini = toggle.querySelector(".kta-cnx-mini");
      const replie = toggle.getAttribute("aria-expanded") === "false";
      if (replie) {
        if (!mini) {
          mini = document.createElement("span");
          mini.className = "kta-cnx-mini";
          mini.setAttribute("aria-hidden", "true");
          mini.textContent = "🔌";
          toggle.appendChild(document.createTextNode(" · "));
          toggle.appendChild(mini);
        }
        Object.keys(CLASSE_ETAT).forEach(function (k) { mini.classList.remove(CLASSE_ETAT[k]); });
        mini.classList.add(cls);
        mini.title = titre;
      }
    }
  }

  function _cabler() {
    const chip = document.getElementById("loaderCnxChip");
    if (chip && !chip._ktaCable) {
      chip._ktaCable = true;
      chip.addEventListener("click", function () {
        if (typeof window._ouvrirNetDocModal === "function") window._ouvrirNetDocModal();
      });
    }
    // Les libellés sont traduits au rendu : on attend les dicos.
    const dicos = (window.I18n && typeof window.I18n.init === "function") ? window.I18n.init() : null;
    Promise.resolve(dicos).then(peindre, peindre);
  }

  // La licence serveur arrive en asynchrone, parfois APRÈS l'index : l'état
  // se recalcule à chaque changement.
  window.addEventListener("mktm:license-changed", _recalculer);

  // Avant la lecture de l'index (qui passe après les gates), on affiche la
  // dernière config connue : pas de clignotement « désactivé » → « configurée »
  // à chaque démarrage d'une instance connectée.
  appliquerConfig(null, false);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _cabler);
  } else {
    _cabler();
  }
  if (window.I18n && typeof window.I18n.onChange === "function") window.I18n.onChange(peindre);


  // =====================================================================
  // 🧩 v2.7.0 — POINTS D'EXTENSION (chantier 3, community-server-line.md §3)
  // =====================================================================
  // Tout est NEUTRE : nommé sans référence au pro, utilisable par n'importe
  // quelle extension, sans effet tant qu'aucune ne s'est déclarée.
  //
  // Une extension se déclare par :
  //   KtaExtensions.register({
  //     nom: "…", apiVersion: 1,
  //     gate:     { ouvrir: function () → Promise },        // remplace la gate d'entrée
  //     plans:    { lister: () → Promise<[{id,name,version?,tags?}]>,
  //                 charger: (id) → Promise<Blob ZIP> },   // source de plans
  //     importAutorise: function () → bool,                 // permission (synchrone)
  //     exportAutorise: function (planId) → bool,           // permission (synchrone)
  //     publierPlan:    function ({ blob, nom }) → Promise  // Générateur
  //   })
  // Prises de PERMISSION (gate, import, export) : une erreur = REFUS.
  // Prises d'INFORMATION : une erreur est journalisée et ignorée.
  const API_VERSION = 1;
  const _extensions = [];
  let _modules = { demandes: 0, charges: 0, echecs: 0, termine: false };

  function register(ext) {
    if (!ext || typeof ext !== "object" || typeof ext.nom !== "string" || !ext.nom) {
      console.warn("[Extensions] déclaration refusée : objet sans nom");
      return false;
    }
    if (ext.apiVersion !== API_VERSION) {
      console.warn("[Extensions] « " + ext.nom + " » refusée : apiVersion " + ext.apiVersion +
                   " (attendue " + API_VERSION + ")");
      return false;
    }
    if (_extensions.some(function (e) { return e.nom === ext.nom; })) {
      console.warn("[Extensions] « " + ext.nom + " » déjà déclarée");
      return false;
    }
    _extensions.push(ext);
    console.log("[Extensions] « " + ext.nom + " » déclarée (prises : " +
      ["gate", "plans", "importAutorise", "exportAutorise", "publierPlan", "compte"].filter(function (k) { return !!ext[k]; }).join(", ") + ")");
    return true;
  }
  function _prise(nom) {
    for (let i = 0; i < _extensions.length; i++) if (_extensions[i][nom]) return _extensions[i];
    return null;
  }
  function aPrise(nom) { return !!_prise(nom); }

  // ── Signal d'état par un module (règle C) ──
  function signaler(etat) {
    if (etat !== "on" && etat !== "down" && etat !== null) return false;
    _signal = etat;
    _recalculer();
    return true;
  }

  // ── Chargeur de modules (règle E : licence serveur ET « on ») ──
  // Charge les scripts de `serverConnection.modules`, même origine que l'app.
  // Rend une promesse résolue quand tous ont fini (chargés ou en échec, 8 s max
  // chacun). Ne fait RIEN hors de l'état « configurée ».
  function chargerModules() {
    if (etatDe(_connexion, _sourceLicence()) !== "configuree") {
      _modules = { demandes: 0, charges: 0, echecs: 0, termine: true };
      return Promise.resolve(_modules);
    }
    const liste = (_connexion.modules || []).slice();
    _modules = { demandes: liste.length, charges: 0, echecs: 0, termine: false };
    return Promise.all(liste.map(function (src) {
      return new Promise(function (resolve) {
        const s = document.createElement("script");
        let fini = false;
        const fin = function (ok) {
          if (fini) return; fini = true;
          if (ok) _modules.charges++; else { _modules.echecs++; console.warn("[Extensions] module non chargé : " + src); }
          resolve();
        };
        const t = setTimeout(function () { fin(false); }, 8000);
        s.onload = function () { clearTimeout(t); fin(true); };
        s.onerror = function () { clearTimeout(t); fin(false); };
        s.src = src;
        document.head.appendChild(s);
      });
    })).then(function () { _modules.termine = true; return _modules; });
  }

  // ── Garde unique des requêtes d'extension ──
  // Toute requête vers le backend d'une instance passe ICI. Refus avant tout
  // envoi hors des états « configurée » / « connectée » ; en « injoignable »,
  // seules les sondes (opts.sonde) partent, pour détecter le retour du serveur.
  // Jamais une autre origine que celle déclarée dans `serverConnection.api`.
  function requete(chemin, opts) {
    const o = opts || {};
    const etat = _etat;
    const permis = etat === "configuree" || etat === "on" || (etat === "down" && o.sonde === true);
    if (!permis) return Promise.reject(new Error("connexion serveur indisponible (" + etat + ")"));
    let url;
    try { url = new URL(String(chemin || ""), _connexion.api); }
    catch (e) { return Promise.reject(new Error("adresse invalide")); }
    if (url.origin !== new URL(_connexion.api).origin) {
      return Promise.reject(new Error("origine refusée : " + url.origin));
    }
    const init = Object.assign({}, o);
    delete init.sonde;
    // Marque la requête pour le Service Worker (jamais de cache, v2.7.1) et
    // interdit le cache HTTP : une réponse de backend n'a rien à faire hors ligne.
    init.cache = "no-store";
    const entetes = new Headers(init.headers || {});
    entetes.set("X-Kta-Ext", "1");
    init.headers = entetes;
    return fetch(url.href, init);
  }

  // ── Prises de permission (synchrones) : une erreur = REFUS ──
  function _permission(nom, args, parDefaut) {
    const ext = _prise(nom);
    if (!ext) return parDefaut;
    try { return ext[nom].apply(ext, args || []) === true; }
    catch (e) { console.warn("[Extensions] « " + nom + " » a échoué → refus :", e); return false; }
  }
  function importAutorise() { return _permission("importAutorise", [], true); }
  function exportAutorise(planId) { return _permission("exportAutorise", [planId], true); }

  // ── Gate déléguée ──
  // Rend null si aucune extension ne fournit de gate, sinon une promesse qui
  // résout quand l'extension a ouvert l'accès. Une gate qui échoue REJETTE :
  // l'appelant affiche « instance indisponible », jamais la gate community.
  function gateDeleguee() {
    const ext = _prise("gate");
    if (!ext || typeof ext.gate.ouvrir !== "function") return null;
    try { return Promise.resolve(ext.gate.ouvrir()); }
    catch (e) { return Promise.reject(e); }
  }
  function modulesEtat() { return Object.assign({}, _modules); }

  // ── Source de plans ──
  function listerPlansExtension() {
    const ext = _prise("plans");
    if (!ext || typeof ext.plans.lister !== "function") return Promise.resolve([]);
    return Promise.resolve().then(function () { return ext.plans.lister(); })
      .then(function (l) { return Array.isArray(l) ? l : []; })
      .catch(function (e) { console.warn("[Extensions] plans.lister a échoué :", e); return []; });
  }
  function chargerPlanExtension(id) {
    const ext = _prise("plans");
    if (!ext || typeof ext.plans.charger !== "function") return Promise.reject(new Error("aucune source de plans"));
    return Promise.resolve().then(function () { return ext.plans.charger(id); });
  }

  // ── Publication depuis le Générateur ──
  function publierPlan(args) {
    const ext = _prise("publierPlan");
    if (!ext) return Promise.reject(new Error("aucune publication disponible"));
    return Promise.resolve().then(function () { return ext.publierPlan(args); });
  }

  // ── Journal des changements (information) ──
  // Ce qui a changé depuis `ts` (ms) : objets dont updatedAt > ts, et traces de
  // suppression postérieures. Base de la synchro incrémentale (lot A/B).
  function changementsDepuis(ts) {
    const seuil = (typeof ts === "number" && isFinite(ts)) ? ts : 0;
    const f = function (arr) { return (arr || []).filter(function (o) { return o && typeof o.updatedAt === "number" && o.updatedAt > seuil; }); };
    return {
      editorPoints: f(window.getEditorPoints && window.getEditorPoints()),
      roads:        f(window.getRoads && window.getRoads()).filter(function (o) { return o.type !== "itinerary"; }),
      zones:        f(window.getZones && window.getZones()),
      structures:   f(window.getStructures && window.getStructures()),
      tombstones:   (window.KtaUid ? window.KtaUid.getTombstones() : []).filter(function (t) { return t.deletedAt > seuil; })
    };
  }

  // ── Effacement à la déconnexion ──
  // Retire les plans fournis par une extension (registre `type: "ext"`), leur
  // session, leurs photos et leur archive locale. 🩸 Jamais un plan importé par
  // l'utilisateur (type « local ») ni un plan de l'instance (type « server ») :
  // ils ne viennent pas du backend.
  function effacerDonneesExtension(planIds) {
    const PR = window.PlanRegistry;
    if (!PR || !Array.isArray(planIds)) return Promise.resolve({ effaces: 0, refuses: 0 });
    let effaces = 0, refuses = 0;
    return planIds.reduce(function (p, id) {
      return p.then(function () {
        const e = PR.findById(id);
        if (!e || e.type !== "ext") { refuses++; return; }
        try { localStorage.removeItem("myktamap_session_v1_" + id); } catch (er) {}
        return Promise.resolve(typeof PR.remove === "function" ? PR.remove(id) : null)
          .then(function () { effaces++; });
      });
    }, Promise.resolve()).then(function () { return { effaces: effaces, refuses: refuses }; });
  }

  // ── Mode Secours partagé (entrant) ──
  // Applique au scénario une modification reçue d'un autre appareil, par la
  // fusion en liste blanche existante (SecoursMode.update). Le sortant est
  // l'événement `mktm:secours-scenario-mutated`, déjà émis.
  function secoursAppliquer(scenarioId, partiel) {
    if (!window.SecoursMode || typeof window.SecoursMode.update !== "function") return false;
    try { return window.SecoursMode.update(scenarioId, partiel) !== false; }
    catch (e) { console.warn("[Extensions] secoursAppliquer :", e); return false; }
  }

  // ── Compte connecté (v2.7.4) ──
  // Une extension de connexion peut dire QUI est connecté : la carte profil de
  // l'accueil l'affiche à la place du profil local, sans rien y écrire (le
  // surnom et la photo de l'appareil restent intacts et reviennent à la
  // déconnexion). Rendu en texte seulement, longueurs bornées. Erreur ou forme
  // inattendue = aucun compte (null) : la carte garde le profil local.
  function compte() {
    const ext = _prise("compte");
    if (!ext || typeof ext.compte !== "function") return null;
    try {
      const c = ext.compte();
      if (!c || typeof c.pseudo !== "string" || !c.pseudo.trim()) return null;
      return {
        pseudo: c.pseudo.trim().slice(0, 40),
        libelle: typeof c.libelle === "string" ? c.libelle.trim().slice(0, 24) : ""
      };
    } catch (e) { console.warn("[Extensions] compte :", e); return null; }
  }
  // L'extension prévient quand le compte change (connexion, rôle modifié).
  function notifierCompte() {
    try { window.dispatchEvent(new CustomEvent("mktm:compte-changed")); } catch (e) { /* rien */ }
  }

  window.KtaExtensions = {
    API_VERSION: API_VERSION,
    register: register,
    aPrise: aPrise,
    signaler: signaler,
    chargerModules: chargerModules,
    modulesEtat: modulesEtat,
    requete: requete,
    importAutorise: importAutorise,
    exportAutorise: exportAutorise,
    gateDeleguee: gateDeleguee,
    listerPlansExtension: listerPlansExtension,
    chargerPlanExtension: chargerPlanExtension,
    publierPlan: publierPlan,
    changementsDepuis: changementsDepuis,
    effacerDonneesExtension: effacerDonneesExtension,
    secoursAppliquer: secoursAppliquer,
    compte: compte,
    notifierCompte: notifierCompte,
    valider: valider,
    etatDe: etatDe,
    appliquerConfig: appliquerConfig,
    etat: function () { return { etat: _etat, raison: _raison }; },
    peindre: peindre,
    ETATS: ETATS.slice(),
    LS_MEMO: LS_MEMO
  };
})();
