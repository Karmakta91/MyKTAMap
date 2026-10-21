/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// EXTENSIONS — js/ktaExtensions.js
// =========================
// Rôle : l'interrupteur de la CONNEXION SERVEUR d'une instance, sa pastille (pied de page de l'accueil),
// et les POINTS D'EXTENSION neutres (no-op sans extension). Contrat complet (API v1) :
// docs/architecture/community-server-line.md §3.
//
// ⚠️ L'instance déclare dans `data/index.json > config.serverConnection` :
//   { "state": "on" | "off", "api": "https://…" | "/api/", "modules": ["chemin/module.js?v=1.0.0"],
//     "transparence"?: "page.html" }
// États : off (absent ou "off" — myktamap.fr : aucun backend, jamais) · invalide (mal formé, raison
//   journalisée [Connexion]) · licence (« on » sans licence pro de source "server", ou licence refusée par
//   le serveur) · configuree (« on » + licence serveur) · on / down (SIGNALÉS par un module greffé).
//
// ⚠️ Ce module ne fait AUCUNE requête de lui-même : il lit l'index déjà chargé par
// main.js > _chargerIndexServeur() et ne sonde jamais `api` (règle C) ; les requêtes d'extension passent
// par la garde unique `requete`.
// 🩸 « Index injoignable » n'est PAS « connexion coupée » (même piège que UnlockGate.revaliderInstance) :
// l'appelant DÉCLARE si l'index a répondu ; injoignable → on rejoue la dernière config connue (règle B).
// Garde-fous : scripts/check-connexion-serveur.js, scripts/check-extensions.js

(function () {
  "use strict";

  // Dernière config valide connue : donnée de l'INSTANCE, pas de l'utilisateur (hors export de profil).
  const LS_MEMO = "myktamap_server_connection_v1";
  // `on` et `down` sont SIGNALÉS par un module greffé (règle C : community ne sonde jamais le serveur).
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
  let _signal = null;   // "on" | "down" | "licence" | null — posé par un module greffé (signaler)
  let _signalRaison = ""; // raison du refus de licence donnée par le serveur (expiree, signature, domaine…)
  let _reseauCoupe = typeof navigator !== "undefined" && navigator.onLine === false;

  // ── Validation : fonction PURE, sans DOM ni stockage ──
  // 🩸 confadmin.html applique EXACTEMENT les mêmes règles : scripts/check-connexion-serveur.js exécute les
  // deux sur la même table de cas et refuse toute divergence (sinon instance valide pour ConfAdmin, invalide
  // pour l'app).
  function valider(sc) {
    if (sc === undefined || sc === null) return { etat: "off", raison: "absent" };
    if (typeof sc !== "object" || Array.isArray(sc)) {
      return { etat: "invalide", raison: "serverConnection doit être un objet" };
    }
    if (sc.state === "off") return { etat: "off", raison: "désactivé par l'instance" };
    if (sc.state !== "on") return { etat: "invalide", raison: "state doit valoir \"on\" ou \"off\"" };

    // api : https:// (autre domaine possible, règle D) OU chemin du MÊME site (« /api/ »), résolu à
    // l'adresse de l'app au moment de l'appel (localhost, IP ou nom de domaine).
    if (typeof sc.api !== "string" ||
        !(/^https:\/\/[^\s/?#]+/i.test(sc.api.trim()) || /^\/(?!\/)[^\s?#]*$/.test(sc.api.trim()))) {
      return { etat: "invalide", raison: "api doit être une adresse https:// ou un chemin du même site (/api/)" };
    }
    if (!Array.isArray(sc.modules)) {
      return { etat: "invalide", raison: "modules doit être une liste" };
    }
    if (sc.modules.length > MAX_MODULES) {
      return { etat: "invalide", raison: "plus de " + MAX_MODULES + " modules" };
    }
    for (let i = 0; i < sc.modules.length; i++) {
      const m = sc.modules[i];
      // Même origine que l'app (script-src 'self') : chemin relatif, sans schéma ni « // » ni remontée,
      // terminé par .js. Seul suffixe permis : « ?v=<version> » — le SW sert les modules depuis son cache
      // (URL exacte), changer la version change l'URL et livre le module sans release community.
      if (typeof m !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.js(\?v=[A-Za-z0-9._-]{1,32})?$/.test(m) ||
          m.indexOf("..") >= 0 || m.indexOf("//") >= 0) {
        return { etat: "invalide", raison: "module hors de l'origine de l'app : " + String(m).slice(0, 80) };
      }
    }
    // transparence (facultatif) : page de transparence de l'installation, .html relatif du MÊME site (mêmes
    // règles qu'un module). La pastille y mène dès que l'état n'est pas OFF.
    if (sc.transparence !== undefined && (typeof sc.transparence !== "string" ||
        !/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.html$/.test(sc.transparence) ||
        sc.transparence.indexOf("..") >= 0 || sc.transparence.indexOf("//") >= 0)) {
      return { etat: "invalide", raison: "transparence doit être une page .html du même site (ex. pro/transparence.html)" };
    }
    const v = {
      etat: "on",
      raison: "",
      api: sc.api.trim(),
      modules: sc.modules.slice()
    };
    if (sc.transparence) v.transparence = sc.transparence;
    return v;
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
  // `indexRepondu` : true si data/index.json a répondu (même sans config), false s'il est injoignable.
  // Seul l'appelant le sait.
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
    // Le signal d'un module ne vaut que sur une instance « configurée » : il ne rallume jamais une instance OFF.
    if (_etat === "configuree" && _signal) _etat = _signal;
    // Réseau coupé (mode avion, tunnel) : « injoignable » tout de suite, sans attendre le module. En « down »
    // la garde refuse les requêtes et l'accueil rouvre aussitôt la copie gardée (sinon ouvrir un plan ☁️
    // attendrait le réseau sans fin).
    if ((_etat === "configuree" || _etat === "on") && _reseauCoupe) _etat = "down";
    _raison = (_etat === "licence" && _signal === "licence") ? _signalRaison : (_connexion.raison || "");
    // Installation RELIÉE (connexion déclarée, même sans licence valide) : splash et pied de page cessent
    // d'afficher l'identité community — aussi devant « Installation indisponible ». Posée dès la dernière
    // config connue.
    try { document.documentElement.classList.toggle("kta-instance-reliee", !!_connexion && _connexion.etat !== "off"); }
    catch (e) { /* pas de DOM (tests) */ }
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

  // Licence REFUSÉE par le serveur (signalée par le module) ≠ licence absente : même état « licence »
  // (contrat inchangé), libellés distincts.
  function _cle(etat) { return (etat === "licence" && _signal === "licence") ? "licenceRefusee" : etat; }
  function _libelle(etat) { return _t("home.serveur.mot." + _cle(etat)); }

  // Pastille du pied de page, bloc d'état de la modale « Que fait l'app sur le réseau ? », et icône du bouton
  // de pied de page replié. homeLoader rappelle peindre() après chaque repli/dépli (il réécrit ce bouton).
  function peindre() {
    // Dicos pas encore prêts : pas de clé brute, onChange repeindra.
    if (window.I18n && typeof window.I18n.has === "function" && !window.I18n.has("home.serveur.mot.off")) return;
    const cls = CLASSE_ETAT[_etat] || CLASSE_ETAT.off;
    const mot = _libelle(_etat);
    // Infobulle et titre du bloc : forme courte de l'état (le mot de la pastille contient déjà « Base de
    // données »).
    const etatCourt = _t("home.serveur.etat." + _cle(_etat));
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
      if (d) d.textContent = _t("home.serveur.explication." + _cle(_etat), { raison: _raison || "?" });
      // Installation reliée : la suite de la modale (« 100 % client-side », liste blanche) ne décrit que l'app
      // de base ; on le dit, et on mène à la page de transparence si elle existe.
      const relie = _etat === "on" || _etat === "down";
      const lien = relie && _connexion && _connexion.transparence;
      const audit = bloc.querySelector(".kta-cnx-bloc-audit");
      if (audit) {
        audit.textContent = relie ? _t(lien ? "home.serveur.audit.avecPage" : "home.serveur.audit.sansPage") : "";
        audit.hidden = !relie;
      }
      const ligne = bloc.querySelector(".kta-cnx-bloc-lien-ligne");
      if (ligne) {
        const b = ligne.querySelector(".kta-cnx-bloc-lien");
        if (b) b.textContent = _t("home.serveur.audit.ouvrir");
        ligne.hidden = !lien;
      }
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
        // Installation reliée avec page de transparence : c'est elle qui dit ce qu'elle fait des données.
        if (_etat !== "off" && _connexion && _connexion.transparence) {
          window.open(_connexion.transparence, "_blank", "noopener");
          return;
        }
        if (typeof window._ouvrirNetDocModal === "function") window._ouvrirNetDocModal();
      });
    }
    const blocCnx = document.getElementById("loaderNetDocCnx");
    const lien = blocCnx && blocCnx.querySelector(".kta-cnx-bloc-lien");
    if (lien && !lien._ktaCable) {
      lien._ktaCable = true;
      lien.addEventListener("click", function () {
        if (_connexion && _connexion.transparence) window.open(_connexion.transparence, "_blank", "noopener");
      });
    }
    // Libellés traduits au rendu : on attend les dicos.
    const dicos = (window.I18n && typeof window.I18n.init === "function") ? window.I18n.init() : null;
    Promise.resolve(dicos).then(peindre, peindre);
  }

  // La licence serveur arrive en asynchrone, parfois APRÈS l'index : recalcul à chaque changement.
  window.addEventListener("mktm:license-changed", _recalculer);

  // Avant la lecture de l'index (après les gates), dernière config connue : pas de clignotement
  // « désactivé » → « configurée » à chaque démarrage.
  appliquerConfig(null, false);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _cabler);
  } else {
    _cabler();
  }
  if (window.I18n && typeof window.I18n.onChange === "function") window.I18n.onChange(peindre);


  // =====================================================================
  // POINTS D'EXTENSION (community-server-line.md §3)
  // =====================================================================
  // Tout est NEUTRE : nommé sans référence au pro, utilisable par n'importe quelle extension, sans effet
  // tant qu'aucune ne s'est déclarée.
  //
  // Une extension se déclare par :
  //   KtaExtensions.register({
  //     nom: "…", apiVersion: 1,
  //     gate:     { ouvrir: function () → Promise },        // remplace la gate d'entrée
  //     plans:    { lister: () → Promise<[{id,name,version?,tags?}]>,
  //                 charger: (id) → Promise<Blob ZIP> },   // source de plans
  //     importAutorise: function () → bool,                 // permission (synchrone)
  //     exportAutorise: function (planId) → bool | { auteur }, // permission (synchrone), { auteur } = ses ajouts
  //     publierPlan:    function ({ blob, nom }) → Promise  // Générateur
  //     publierVersion: { autorise(idExt) → bool, publier({ id, blob, nom }) → Promise } // nouvelle version
  //   })
  // ⚠️ Prises de PERMISSION (gate, import, export) : une erreur = REFUS.
  //    Prises d'INFORMATION : une erreur est journalisée et ignorée.
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
    // Les écrans déjà dessinés (Mode Développeur…) se redessinent : une extension arrive APRÈS l'accueil.
    try { window.dispatchEvent(new CustomEvent("mktm:extensions-changees")); } catch (e) { /* rien */ }
    if (ext.outilHome) _poserOutilHome();
    if (ext.pastilleHome) _poserPastilleHome();
    if (ext.actionsObjet || ext.infoObjet) _observerFiches();
    console.log("[Extensions] « " + ext.nom + " » déclarée (prises : " +
      ["gate", "plans", "importAutorise", "exportAutorise", "publierPlan", "publierVersion", "compte", "presence", "itineraire", "actionsObjet", "outilsDev", "photos", "aide", "outilHome", "profilJeu", "alertes", "profilStats", "pastilleHome", "documentation", "liaisons", "importSession"].filter(function (k) { return !!ext[k]; }).join(", ") + ")");
    return true;
  }
  function _prise(nom) {
    for (let i = 0; i < _extensions.length; i++) if (_extensions[i][nom]) return _extensions[i];
    return null;
  }
  function aPrise(nom) { return !!_prise(nom); }

  // ── Signal d'état par un module (règle C) ──
  // "licence" : le SERVEUR refuse la licence de l'installation (expirée, signature, domaine), `raison` est la
  // sienne. 🔒 L'état devient « licence » : l'app reste fermée (main.js), jamais rouverte en mode community
  // sur les données de l'appareil.
  function signaler(etat, raison) {
    if (etat !== "on" && etat !== "down" && etat !== "licence" && etat !== null) return false;
    _signal = etat;
    _signalRaison = etat === "licence" ? String(raison || "").slice(0, 40) : "";
    // Un module qui JOINT son serveur dit que le réseau est revenu : « réseau coupé » ne doit pas rester
    // collant jusqu'à un événement online qui peut ne jamais venir (retour d'une autre appli). Sauf si le
    // navigateur se dit encore hors ligne.
    if (etat === "on" && _reseauCoupe && typeof navigator !== "undefined" && navigator.onLine !== false) {
      _reseauCoupe = false;
    }
    _recalculer();
    return true;
  }

  // ── Chargeur de modules (règle E : licence serveur ET « on ») ──
  // Scripts de `serverConnection.modules`, même origine. Promesse résolue quand tous ont fini (chargés ou en
  // échec, 8 s max chacun). Ne fait RIEN hors de l'état « configurée ».
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
  // 🔒 Toute requête vers le backend d'une instance passe ICI : refus avant tout envoi hors « configurée » /
  // « connectée » ; en « injoignable », seules les sondes (opts.sonde) partent. Jamais une autre origine que
  // celle de `serverConnection.api`. Un chemin du même site (« /api/ ») est résolu à location.origin.
  function _apiBase() {
    const a = _connexion && _connexion.api;
    if (typeof a !== "string" || !a) return null;
    if (a.charAt(0) !== "/") return a;
    const o = (typeof location !== "undefined" && location && location.origin && location.origin !== "null") ? location.origin : null;
    return o ? o + a : null;
  }
  function requete(chemin, opts) {
    const o = opts || {};
    const etat = _etat;
    const permis = etat === "configuree" || etat === "on" || (etat === "down" && o.sonde === true);
    if (!permis) return Promise.reject(new Error("connexion serveur indisponible (" + etat + ")"));
    let url;
    const base = _apiBase();
    try { url = new URL(String(chemin || ""), base); }
    catch (e) { return Promise.reject(new Error("adresse invalide")); }
    if (url.origin !== new URL(base).origin) {
      return Promise.reject(new Error("origine refusée : " + url.origin));
    }
    const init = Object.assign({}, o);
    delete init.sonde;
    // Marque la requête pour le Service Worker (jamais de cache) et interdit le cache HTTP : une réponse de
    // backend n'a rien à faire hors ligne.
    init.cache = "no-store";
    const entetes = new Headers(init.headers || {});
    entetes.set("X-Kta-Ext", "1");
    init.headers = entetes;
    // 🩸 Un échec réseau isolé NE fait PAS passer en « down » : la garde refuserait toute requête jusqu'à la
    // prochaine sonde du module (synchro, positions, envois en attente bloqués après un simple raté). « down »
    // vient du réseau de l'appareil (offline) ou du module ; une requête figée, du veilleur de l'accueil.
    return fetch(url.href, init);
  }

  // Réseau de l'appareil : coupé → « injoignable » aussitôt ; revenu → mktm:reseau-retour, les modules
  // sondent et signalent « on » ou « down ».
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("offline", function () { _reseauCoupe = true; _recalculer(); });
    window.addEventListener("online", function () {
      _reseauCoupe = false;
      _recalculer();
      try { window.dispatchEvent(new CustomEvent("mktm:reseau-retour")); } catch (e) { /* rien */ }
    });
  }

  // ── Prises de permission (synchrones) : une erreur = REFUS ──
  function _permission(nom, args, parDefaut) {
    const ext = _prise(nom);
    if (!ext) return parDefaut;
    try { return ext[nom].apply(ext, args || []) === true; }
    catch (e) { console.warn("[Extensions] « " + nom + " » a échoué → refus :", e); return false; }
  }
  function importAutorise() { return _permission("importAutorise", [], true); }
  // ── Alertes d'une extension (prise d'INFORMATION « alertes ») ──
  // alertes.lister() → Promise<[{ id, level, title, message, details?, released, source? }]> : mêmes champs
  // que alert.json, affichées par AlertChecker dans la MÊME modale. Nettoyées ici (textes, bornés, niveau
  // connu sinon « info »), id préfixé « ext_ » (pas de collision). Attente bornée ; erreur, délai ou forme
  // inattendue → []. Changement annoncé par mktm:alertes-changees.
  const ALERTES_DELAI_MS = 3000;
  function alertesExtension() {
    const ext = _prise("alertes");
    if (!ext || !ext.alertes || typeof ext.alertes.lister !== "function") return Promise.resolve([]);
    const txt = function (v, max) { return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : ""; };
    let delai;
    return Promise.race([
      Promise.resolve().then(function () { return ext.alertes.lister(); }),
      new Promise(function (ok) { delai = setTimeout(function () { ok(null); }, ALERTES_DELAI_MS); })
    ]).then(function (l) {
      clearTimeout(delai);
      if (!Array.isArray(l)) return [];
      return l.slice(0, 50).map(function (a) {
        if (!a || typeof a !== "object") return null;
        const id = txt(String(a.id == null ? "" : a.id), 80).replace(/[^\w.-]/g, "_");
        const released = txt(a.released, 40);
        const title = txt(a.title, 200), message = txt(a.message, 4000);
        if (!id || !released || (!title && !message)) return null;
        return { id: "ext_" + id, level: (["emergency", "warning", "info"].indexOf(a.level) >= 0) ? a.level : "info",
          title: title, message: message, released: released, source: txt(a.source, 80),
          details: Array.isArray(a.details) ? a.details.map(function (d) { return txt(d, 500); }).filter(Boolean).slice(0, 20) : [] };
      }).filter(Boolean);
    }).catch(function (e) { clearTimeout(delai); console.warn("[Extensions] alertes.lister a échoué :", e); return []; });
  }
  // ── Statistiques du profil (prise d'INFORMATION profilStats) ──
  // profilStats() → [{ cle, icone, libelle, valeur, titre? }] (ou Promise) : lignes de texte de « Détails du
  // profil », proposées au bandeau d'accueil (clé « ext:<cle> »). Nettoyées (12 lignes max, textes bornés,
  // clé [\w-]), attente bornée ; erreur, délai ou forme inattendue → []. Changement : mktm:profil-stats-changees.
  const PROFIL_STATS_DELAI_MS = 3000;
  function profilStatsExtension() {
    const ext = _prise("profilStats");
    if (!ext || typeof ext.profilStats !== "function") return Promise.resolve([]);
    const txt = function (v, max) {
      return (typeof v === "string" || typeof v === "number") && String(v).trim() ? String(v).trim().slice(0, max) : "";
    };
    let delai;
    return Promise.race([
      Promise.resolve().then(function () { return ext.profilStats(); }),
      new Promise(function (ok) { delai = setTimeout(function () { ok(null); }, PROFIL_STATS_DELAI_MS); })
    ]).then(function (l) {
      clearTimeout(delai);
      if (!Array.isArray(l)) return [];
      const vues = {};
      return l.slice(0, 12).map(function (x) {
        if (!x || typeof x !== "object") return null;
        const cle = txt(x.cle, 40);
        if (!/^[\w-]+$/.test(cle) || vues[cle]) return null;
        vues[cle] = 1;
        const libelle = txt(x.libelle, 60), valeur = txt(x.valeur, 40);
        if (!libelle || !valeur) return null;
        return { cle: cle, icone: txt(x.icone, 8) || "•", libelle: libelle, valeur: valeur, titre: txt(x.titre, 200) };
      }).filter(Boolean);
    }).catch(function (e) { clearTimeout(delai); console.warn("[Extensions] profilStats a échoué :", e); return []; });
  }
  // Grades et hauts faits (prise d'INFORMATION profilJeu → bool) : seul un false explicite les coupe ; sans
  // extension ou en erreur, ils restent. Les statistiques ne sont jamais concernées.
  function profilJeuActif() {
    const ext = _prise("profilJeu");
    if (!ext || typeof ext.profilJeu !== "function") return true;
    try { return ext.profilJeu() !== false; }
    catch (e) { console.warn("[Extensions] profilJeu :", e); return true; }
  }
  // Export de session : la prise rend true (tout), false (refus) ou { auteur: "<pseudo>" } = export permis, limité
  // aux objets créés par cet auteur. 🔒 Toute autre forme, ou une erreur = refus. → "tout" | { auteur } | null.
  function _droitExport(planId) {
    const ext = _prise("exportAutorise");
    if (!ext) return "tout";
    let v;
    try { v = ext.exportAutorise(planId); }
    catch (e) { console.warn("[Extensions] « exportAutorise » a échoué → refus :", e); return null; }
    if (v === true) return "tout";
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const cles = Object.keys(v);   // propres seulement : un `auteur` hérité ne compte pas
    const brut = cles.length === 1 && cles[0] === "auteur" ? v.auteur : null;
    if (typeof brut !== "string") return null;
    const auteur = brut.trim().slice(0, 40);
    return auteur ? { auteur: auteur } : null;
  }
  // ⚠️ Booléen : true seulement pour « tout ». Un export limité vaut REFUS pour tout appelant qui ne sait pas
  // filtrer (export de profil, export d'un calque).
  function exportAutorise(planId) { return _droitExport(planId) === "tout"; }
  // Pseudo auquel l'export est limité, sinon null (tout permis, ou refusé).
  function exportLimite(planId) { const d = _droitExport(planId); return d && d !== "tout" ? d.auteur : null; }
  // Avant un effacement complet (« Tout réinitialiser ») : l'extension ferme sa session (cookie HttpOnly,
  // ineffaçable par la page — sinon reconnexion seule au démarrage suivant). Attente bornée à 3 s ; true si
  // fait (ou sans extension), false sinon → l'appelant pose, APRÈS l'effacement, la marque
  // CLE_DECONNEXION_EN_ATTENTE que l'extension honore au démarrage suivant.
  const CLE_DECONNEXION_EN_ATTENTE = "myktamap_ext_deconnexion_en_attente";
  function avantReinitialisation() {
    const ext = _prise("avantReinitialisation");
    if (!ext || typeof ext.avantReinitialisation !== "function") return Promise.resolve(true);
    let delai;
    return Promise.race([
      Promise.resolve().then(function () { return ext.avantReinitialisation(); }).then(function (r) { return r === true; }, function () { return false; }),
      new Promise(function (r) { delai = setTimeout(function () { r(false); }, 3000); })
    ]).finally(function () { clearTimeout(delai); });
  }

  // Lecture seule d'un plan d'extension (droit « lire ») : l'extension le dit ; une erreur = lecture seule
  // (règle des permissions). Plan local ou du site : jamais.
  function lectureSeule(registreId) {
    const ext = _prise("lectureSeule");
    const id = _idExtension(registreId);
    if (!ext || !id) return false;
    try { return ext.lectureSeule(id) === true; }
    catch (e) { console.warn("[Extensions] « lectureSeule » a échoué → lecture seule :", e); return true; }
  }

  // Import d'un fichier de session sur un plan d'extension : `importSession(idExt) → { remplacer: bool }` dit que
  // le plan est PARTAGÉ (l'app propose « Ajouter » et, si permis, « Remplacer pour tous ») ; null / false = plan
  // non partagé (remplacement local). Plan local ou du site, sans prise : null (comportement de l'app seule).
  // 🔒 Erreur ou forme inattendue = plan partagé, remplacement REFUSÉ (ajout seul).
  function importPartage(registreId) {
    const ext = _prise("importSession");
    const id = _idExtension(registreId);
    if (!ext || !id || typeof ext.importSession !== "function") return null;
    let v;
    try { v = ext.importSession(id); }
    catch (e) { console.warn("[Extensions] « importSession » a échoué → ajout seul :", e); return { remplacer: false }; }
    if (v === null || v === false) return null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return { remplacer: false };
    return { remplacer: v.remplacer === true };
  }

  // ── Gate déléguée ──
  // null si aucune extension ne fournit de gate, sinon une promesse résolue quand l'accès est ouvert.
  // 🔒 Une gate qui échoue REJETTE : l'appelant affiche « instance indisponible », jamais la gate community.
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
  // opts.progression(recus, total) : avancement du téléchargement (octets ; total 0 si inconnu).
  function chargerPlanExtension(id, opts) {
    const ext = _prise("plans");
    if (!ext || typeof ext.plans.charger !== "function") return Promise.reject(new Error("aucune source de plans"));
    const progression = opts && typeof opts.progression === "function" ? function (r, t) {
      try { opts.progression(Number(r) || 0, Number(t) || 0); } catch (e) { /* affichage seulement */ }
    } : null;
    // opts.signal (AbortSignal) : le veilleur d'inactivité de l'accueil annule le téléchargement ; l'accueil
    // abandonne de son côté sans en dépendre.
    const signal = opts && opts.signal ? opts.signal : undefined;
    return Promise.resolve().then(function () { return ext.plans.charger(id, { progression: progression, signal: signal }); });
  }

  // Dossiers de l'instance (prise facultative plans.dossiers) : [{ id, name, color?, order?, rule?: { tags } }].
  // null = inconnu (pas de prise, serveur injoignable, erreur) → l'accueil ne touche à rien.
  function dossiersExtension() {
    const ext = _prise("plans");
    if (!ext || typeof ext.plans.dossiers !== "function") return Promise.resolve(null);
    return Promise.resolve().then(function () { return ext.plans.dossiers(); }).then(function (l) {
      if (!Array.isArray(l)) return null;
      return l.filter(function (d) { return d && (typeof d.id === "string" || typeof d.id === "number") && typeof d.name === "string" && d.name.trim(); })
        .slice(0, 100).map(function (d, i) {
          const o = { id: String(d.id).slice(0, 60), name: d.name.trim().slice(0, 40), order: Number.isFinite(d.order) ? d.order : i };
          if (typeof d.color === "string") o.color = d.color.slice(0, 16);
          if (d.rule && Array.isArray(d.rule.tags)) o.rule = { tags: d.rule.tags.filter(function (t) { return typeof t === "string"; }).slice(0, 20) };
          return o;
        });
    }).catch(function (e) { console.warn("[Extensions] plans.dossiers a échoué :", e); return null; });
  }

  // ── Publication depuis le Générateur ──
  function publierPlan(args) {
    const ext = _prise("publierPlan");
    if (!ext) return Promise.reject(new Error("aucune publication disponible"));
    return Promise.resolve().then(function () { return ext.publierPlan(args); }).then(function (r) {
      // Le plan publié rejoint tout de suite la liste de l'accueil.
      try { window.dispatchEvent(new CustomEvent("mktm:plans-extension-changes")); } catch (e) { /* rien */ }
      return r;
    });
  }

  // ── Nouvelle version d'un plan de l'extension (assistant « Mettre à jour le plan ») ──
  // Prise `publierVersion: { autorise(idExt) → bool, publier({ id: idExt, blob, nom }) → Promise }`.
  // ⚠️ `autorise` est une PERMISSION : absente, fausse ou en erreur = refus (l'assistant ne propose alors que le
  // téléchargement). Elle ne fait que choisir les boutons : le serveur de l'extension revérifie le droit à l'envoi.
  function versionAutorisee(registreId) {
    const ext = _prise("publierVersion");
    const id = _idExtension(registreId);
    if (!ext || !id || typeof ext.publierVersion.autorise !== "function") return false;
    try { return ext.publierVersion.autorise(id) === true; }
    catch (e) { console.warn("[Extensions] « publierVersion.autorise » a échoué → refus :", e); return false; }
  }
  function publierVersion(args) {
    const a = args || {};
    const ext = _prise("publierVersion");
    if (!ext || typeof ext.publierVersion.publier !== "function") {
      return Promise.reject(new Error("aucune publication de version"));
    }
    if (!versionAutorisee(a.planId)) return Promise.reject(new Error("publication de version refusée"));
    const id = _idExtension(a.planId);
    return Promise.resolve().then(function () {
      return ext.publierVersion.publier({ id: id, blob: a.blob, nom: a.nom });
    }).then(function (r) {
      try { window.dispatchEvent(new CustomEvent("mktm:plans-extension-changes")); } catch (e) { /* rien */ }
      return r;
    });
  }

  // ── Journal des changements (information) ──
  // Depuis `ts` (ms) : objets dont updatedAt > ts, traces de suppression postérieures (synchro incrémentale) et
  // restitutions de calque faites ici après ts ([{ calque, avant, uids }], CalqueSession.restitutionsDepuis).
  // ⚠️ Une restitution n'est PAS une trace : l'extension ne doit jamais la changer en suppression des uids.
  // 🔒 Plan pas encore prêt (chargement en cours) : listes vides — la mémoire peut encore tenir les objets du plan
  // quitté, qui partiraient sinon vers le nouveau (cf. planPret).
  function changementsDepuis(ts) {
    if (!planPret()) {
      return { editorPoints: [], roads: [], zones: [], structures: [], tombstones: [], restitutions: [] };
    }
    const seuil = (typeof ts === "number" && isFinite(ts)) ? ts : 0;
    const f = function (arr) { return (arr || []).filter(function (o) { return o && typeof o.updatedAt === "number" && o.updatedAt > seuil; }); };
    return {
      editorPoints: f(window.getEditorPoints && window.getEditorPoints()),
      roads:        f(window.getRoads && window.getRoads()).filter(function (o) { return o.type !== "itinerary"; }),
      zones:        f(window.getZones && window.getZones()),
      structures:   f(window.getStructures && window.getStructures()),
      tombstones:   (window.KtaUid ? window.KtaUid.getTombstones() : []).filter(function (t) { return t.deletedAt > seuil; }),
      restitutions: (window.CalqueSession && typeof window.CalqueSession.restitutionsDepuis === "function")
                      ? window.CalqueSession.restitutionsDepuis(seuil) : []
    };
  }

  // ── Actions du compte (Mon profil, Configuration) ──
  // Selon le LIEU (« profil » | « config »), les actions proposées : en tête de « Mon profil » sous le compte
  // connecté ; dans ⚙️ Configuration, un bloc « Installation ». Texte seulement (60 car.), 10 au plus, action
  // protégée ; erreur ou forme inattendue = aucune action.
  // Prise d'INFORMATION « outilsDev » : ext.outilsDev() → [{ libelle, page }], pages .html du MÊME site
  // (mêmes règles que serverConnection.transparence), proposées dans le Mode Développeur (js/devMode.js).
  // Entrée invalide ou erreur : ignorée.
  const PAGE_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.html$/;
  function outilsDev() {
    const ext = _prise("outilsDev");
    if (!ext || typeof ext.outilsDev !== "function") return [];
    try {
      const l = ext.outilsDev();
      return (Array.isArray(l) ? l : []).filter(function (o) {
        return o && typeof o.libelle === "string" && o.libelle.trim() && typeof o.page === "string" &&
          PAGE_RE.test(o.page) && o.page.indexOf("..") < 0 && o.page.indexOf("//") < 0;
      }).slice(0, 10).map(function (o) { return { libelle: o.libelle.trim().slice(0, 60), page: o.page }; });
    } catch (e) { console.warn("[Extensions] outilsDev :", e); return []; }
  }
  // Prise d'INFORMATION « aide » : UNE rubrique ajoutée à l'Aide intégrée (js/interfaceDocs.js) avant « Pour
  // aller plus loin ». ext.aide() → { titre, sections: [{ titre, html }] }, lue au rendu (langue courante).
  // HTML de mise en forme admis (l'extension est du code de la page : hygiène, pas frontière) — sans script,
  // cadre, formulaire, gestionnaire on* ni lien javascript:. Erreur ou forme inattendue = rien.
  // Nettoyage en un seul passage, balise par balise (pas de regex à retour arrière : Sonar S8786) : éléments
  // à contenu dangereux retirés AVEC leur contenu, link/meta/base retirés, on* retirés, javascript: → « # ».
  const _HTML_BLOC = { script: 1, style: 1, iframe: 1, object: 1, embed: 1, form: 1 };
  const _HTML_SEUL = { link: 1, meta: 1, base: 1 };
  function _attributsSurs(brut) {
    let out = "", i = 0;
    const n = brut.length, blanc = (c) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
    while (i < n) {
      while (i < n && blanc(brut[i])) i++;
      if (i >= n) break;
      if (brut[i] === "/") { out += " /"; i++; continue; }
      let j = i;
      while (j < n && !blanc(brut[j]) && brut[j] !== "=" && brut[j] !== "/") j++;
      const nom = brut.slice(i, j).toLowerCase();
      i = j;
      while (i < n && blanc(brut[i])) i++;
      let valeur = null;
      if (brut[i] === "=") {
        i++;
        while (i < n && blanc(brut[i])) i++;
        const q = brut[i];
        if (q === "\"" || q === "'") {
          const fin = brut.indexOf(q, i + 1);
          valeur = brut.slice(i + 1, fin < 0 ? n : fin); i = fin < 0 ? n : fin + 1;
        } else {
          let k = i;
          while (k < n && !blanc(brut[k])) k++;
          valeur = brut.slice(i, k); i = k;
        }
      }
      if (!nom || nom.slice(0, 2) === "on") continue;
      if ((nom === "href" || nom === "src") && valeur !== null &&
          valeur.trim().toLowerCase().replace(/[\t\n\r ]/g, "").indexOf("javascript:") === 0) valeur = "#";
      out += " " + nom + (valeur === null ? "" : "=\"" + valeur.replaceAll("\"", "&quot;") + "\"");
    }
    return out;
  }
  function _nettoyerHtml(h) {
    const s = String(h);
    let out = "", i = 0, bloc = null;
    while (i < s.length) {
      const lt = s.indexOf("<", i);
      if (lt < 0) { if (!bloc) out += s.slice(i); break; }
      if (!bloc) out += s.slice(i, lt);
      const gt = s.indexOf(">", lt + 1);
      if (gt < 0) break;                                   // balise jamais fermée : on s'arrête là
      const corps = s.slice(lt + 1, gt);
      const ferme = corps[0] === "/";
      let k = ferme ? 1 : 0;
      const debut = k;
      while (k < corps.length && /[A-Za-z0-9]/.test(corps[k])) k++;
      const nom = corps.slice(debut, k).toLowerCase();
      i = gt + 1;
      if (bloc) { if (ferme && nom === bloc) bloc = null; continue; }
      if (!nom || !/[a-z]/.test(nom[0])) { out += "&lt;" + corps.replaceAll("<", "&lt;") + "&gt;"; continue; }
      if (_HTML_BLOC[nom]) { if (!ferme) bloc = nom; continue; }
      if (_HTML_SEUL[nom]) continue;
      out += ferme ? "</" + nom + ">" : "<" + nom + _attributsSurs(corps.slice(k)) + ">";
    }
    return out;
  }
  function aide() {
    const ext = _prise("aide");
    if (!ext || typeof ext.aide !== "function") return null;
    try {
      const r = ext.aide();
      if (!r || typeof r.titre !== "string" || !r.titre.trim() || !Array.isArray(r.sections)) return null;
      const sections = r.sections.filter(function (s) {
        return s && typeof s.titre === "string" && s.titre.trim() && typeof s.html === "string";
      }).slice(0, 20).map(function (s, i) {
        // `id` facultatif ([a-z0-9-]) : slug stable « ext-<id> » (window.ktaOuvrirAideSection), sinon « ext-<rang> ».
        const id = typeof s.id === "string" && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : String(i);
        return { slug: "ext-" + id, titre: s.titre.trim().slice(0, 80), raccourci: "", html: _nettoyerHtml(s.html) };
      });
      return sections.length ? { titre: r.titre.trim().slice(0, 60), sections: sections } : null;
    } catch (e) { console.warn("[Extensions] aide :", e); return null; }
  }
  // Prise d'INFORMATION « documentation » : UN second guide dans la fenêtre 📖 Documentation
  // (js/interfaceDocs.js > afficherReadme), proposé à l'ouverture à côté du guide classique.
  // ext.documentation() → { titre, fichiers: { fr, en?, es? } } ou null. 🔒 Fichiers Markdown du MÊME site :
  // chemin relatif sans remontée ni « // », terminé par .md, un seul suffixe permis (?v=). `fr` obligatoire
  // (repli de toute langue absente). Erreur, forme inattendue ou null = rien : guide classique direct.
  const DOC_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.md(\?v=[A-Za-z0-9._-]{1,32})?$/;
  function documentation() {
    const ext = _prise("documentation");
    if (!ext || typeof ext.documentation !== "function") return null;
    try {
      const r = ext.documentation();
      if (!r || typeof r.titre !== "string" || !r.titre.trim() || !r.fichiers || typeof r.fichiers !== "object") return null;
      const fichiers = {};
      Object.keys(r.fichiers).slice(0, 8).forEach(function (code) {
        const f = r.fichiers[code];
        if (/^[a-z]{2}$/.test(code) && typeof f === "string" && DOC_RE.test(f) &&
            f.indexOf("..") < 0 && f.indexOf("//") < 0) fichiers[code] = f;
      });
      if (!fichiers.fr) return null;
      return { titre: r.titre.trim().slice(0, 40), fichiers: fichiers };
    } catch (e) { console.warn("[Extensions] documentation :", e); return null; }
  }
  function actionsCompte(lieu) {
    const ext = _prise("actionsCompte");
    if (!ext || typeof ext.actionsCompte !== "function") return [];
    try {
      const l = ext.actionsCompte(lieu);
      // Entrée : { libelle, action, groupe?, type? } — `groupe` : intitulé de rubrique (texte, 30 car.), posé
      // quand il change ; `type` : « etat » = ligne d'état (texte ; `action` + `lien` facultatifs → petit lien
      // à droite), « fin » = action à part, en bas (déconnexion).
      return (Array.isArray(l) ? l : []).filter(function (a) {
        return a && typeof a.libelle === "string" && a.libelle.trim() &&
          (typeof a.action === "function" || a.type === "etat");
      }).slice(0, 16).map(function (a) {
        const e = { libelle: a.libelle.trim().slice(0, 60), action: typeof a.action === "function" ? a.action : null,
          groupe: typeof a.groupe === "string" ? a.groupe.trim().slice(0, 30) : "",
          type: a.type === "etat" || a.type === "fin" ? a.type : "" };
        if (e.type === "etat" && e.action && typeof a.lien === "string" && a.lien.trim()) e.lien = a.lien.trim().slice(0, 30);
        if (e.type === "etat" && !e.lien) e.action = null;
        return e;
      });
    } catch (e) { console.warn("[Extensions] actionsCompte :", e); return []; }
  }
  function _lancerAction(a) {
    try { a.action(); } catch (e) { console.warn("[Extensions] action du compte :", e); }
  }

  // ── Pastille d'extension dans l'en-tête de l'accueil (prise d'INFORMATION « pastilleHome ») ──
  // ext.pastilleHome() → { icone (≤ 4 car.), titre (≤ 60 car.), url } ou null : UNE pastille à côté de 📖, qui
  // ouvre l'URL dans un nouvel onglet. 🔒 https:// seulement, rendu en textContent : forme inattendue = rien.
  // Aucune requête de l'app : c'est un lien que l'utilisateur choisit d'ouvrir.
  function pastilleHome() {
    const ext = _prise("pastilleHome");
    if (!ext || typeof ext.pastilleHome !== "function") return null;
    try {
      const p = ext.pastilleHome();
      if (!p || typeof p.icone !== "string" || typeof p.titre !== "string" || typeof p.url !== "string") return null;
      const icone = p.icone.trim(), titre = p.titre.trim(), url = p.url.trim();
      if (!icone || !titre || [...icone].length > 4) return null;
      let u;
      try { u = new URL(url); } catch (e) { return null; }
      if (u.protocol !== "https:") return null;
      return { icone: icone, titre: titre.slice(0, 60), url: u.href };
    } catch (e) { console.warn("[Extensions] pastilleHome :", e); return null; }
  }
  // Pose (ou retire) la pastille juste après 📖, à la déclaration d'une extension et quand le compte change.
  function _poserPastilleHome() {
    if (typeof document === "undefined" || !document.getElementById) return;
    const aide = document.getElementById("loaderHelpBtn");
    const vieux = document.getElementById("loaderExtPastilleBtn");
    const p = pastilleHome();
    if (!p) { if (vieux) vieux.remove(); return; }
    if (!aide || !aide.parentNode) return;
    const b = vieux || document.createElement("button");
    b.type = "button";
    b.id = "loaderExtPastilleBtn";
    b.className = "loader-btn-help";
    b.textContent = p.icone;
    b.title = p.titre;
    b.setAttribute("aria-label", p.titre);
    b.dataset.url = p.url;
    if (!vieux) {
      b.addEventListener("click", function () {
        if (b.dataset.url) window.open(b.dataset.url, "_blank", "noopener,noreferrer");
      });
      aide.parentNode.insertBefore(b, aide.nextSibling);
    }
  }

  // ── Tuile d'extension dans 🧰 Outils (prise d'INFORMATION « outilHome ») ──
  // ext.outilHome() → { libelle } (40 car.), une LISTE de 3 tuiles au plus, ou null. Une tuile sans `ouvrir` ouvre
  // le bloc du compte au lieu « outils » ; avec `ouvrir` (fonction), le clic l'appelle (l'extension montre sa
  // fenêtre). Sans extension (ou null) : aucune tuile. Erreur ou forme inattendue = rien ; entrée invalide écartée.
  const OUTILS_HOME_MAX = 3;
  function outilsHome() {
    const ext = _prise("outilHome");
    if (!ext || typeof ext.outilHome !== "function") return [];
    try {
      const r = ext.outilHome();
      const l = Array.isArray(r) ? r : (r ? [r] : []);
      return l.filter(function (o) { return o && typeof o.libelle === "string" && o.libelle.trim(); })
        .slice(0, OUTILS_HOME_MAX).map(function (o) {
          const t = { libelle: o.libelle.trim().slice(0, 40) };
          if (typeof o.ouvrir === "function") t.ouvrir = o.ouvrir;
          return t;
        });
    } catch (e) { console.warn("[Extensions] outilHome :", e); return []; }
  }
  // Première tuile (forme d'origine, un seul objet) ; null sans tuile.
  function outilHome() {
    const l = outilsHome();
    return l.length ? { libelle: l[0].libelle } : null;
  }
  function _fermerOutilHome() {
    const ov = document.getElementById("kta-ext-outil-modal");
    if (!ov) return;
    if (ov.__esc) document.removeEventListener("keydown", ov.__esc, true);
    ov.remove();
  }
  // Ouvre la tuile `rang` (0 par défaut). Tuile de l'extension (`ouvrir`) : son erreur est journalisée, jamais levée.
  function ouvrirOutilHome(rang) {
    const l = outilsHome();
    const o = l[typeof rang === "number" ? rang : 0];
    if (!o) return false;
    if (o.ouvrir) {
      _fermerOutilHome();
      try { o.ouvrir(); } catch (e) { console.warn("[Extensions] outilHome.ouvrir :", e); }
      return true;
    }
    _fermerOutilHome();
    // Une action ouvre souvent sa propre fenêtre (clés, 2FA, kit) : on referme celle-ci d'abord.
    const ov = document.createElement("div");
    ov.id = "kta-ext-outil-modal";
    ov.className = "kta-readme-modal-overlay";
    const boite = document.createElement("div");
    boite.className = "kta-readme-modal-boite kta-ext-outil-boite";
    const tete = document.createElement("div");
    tete.className = "kta-readme-modal-header";
    const titre = document.createElement("div");
    titre.className = "kta-readme-modal-titre";
    titre.textContent = o.libelle;
    const croix = document.createElement("button");
    croix.type = "button";
    croix.className = "kta-panneau-close";
    croix.textContent = "✕";
    croix.addEventListener("click", _fermerOutilHome);
    tete.appendChild(titre); tete.appendChild(croix);
    const corps = document.createElement("div");
    corps.className = "kta-readme-modal-corps";
    const bloc = blocActionsCompte("outils", "");
    if (bloc) {
      bloc.addEventListener("click", function (e) { if (e.target.closest("button")) _fermerOutilHome(); }, true);
      corps.appendChild(bloc);
    }
    boite.appendChild(tete); boite.appendChild(corps); ov.appendChild(boite);
    ov.addEventListener("click", function (e) { if (e.target === ov) _fermerOutilHome(); });
    ov.__esc = function (e) { if (e.key === "Escape") { e.stopPropagation(); _fermerOutilHome(); } };
    document.addEventListener("keydown", ov.__esc, true);
    document.documentElement.appendChild(ov);
    return true;
  }
  // Pose (ou retire) la tuile, à la déclaration d'une extension et au chargement.
  // Ids : loaderExtOutilBtn (1re tuile), loaderExtOutilBtn2, loaderExtOutilBtn3 ; une tuile disparue est retirée.
  function _poserOutilHome() {
    if (typeof document === "undefined" || !document.querySelector) return;
    const zone = document.querySelector(".loader-secondary-actions");
    const l = outilsHome();
    let avant = zone ? zone.firstChild : null;
    for (let i = 0; i < OUTILS_HOME_MAX; i++) {
      const id = "loaderExtOutilBtn" + (i ? String(i + 1) : "");
      const vieux = document.getElementById(id);
      const o = l[i];
      if (!o) { if (vieux) vieux.remove(); continue; }
      if (!zone) continue;
      const b = vieux || document.createElement("button");
      b.type = "button";
      b.id = id;
      b.className = "loader-btn-secondary";
      b.textContent = o.libelle;
      b.dataset.rang = String(i);
      if (!vieux) {
        b.addEventListener("click", function () { ouvrirOutilHome(Number(b.dataset.rang) || 0); });
        zone.insertBefore(b, avant);
      }
      avant = b.nextSibling;
    }
  }
  // Bloc prêt à insérer, null si rien à montrer. Lieux : « profil », « config », « outils ». Profil et outils :
  // carte du compte (pseudo, rôle en pastille, précision), rubriques, puis l'action « fin ». Dans « Mon
  // profil », si l'extension a une tuile d'outils, la carte mène à sa fenêtre (les actions y vivent).
  function blocActionsCompte(lieu, titre) {
    const actions = actionsCompte(lieu);
    const c = compte();
    const carteVisible = (lieu === "profil" || lieu === "outils") && c;
    if (!actions.length && !carteVisible) return null;
    const el = function (tag, cls, texte) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (texte) n.textContent = texte;
      return n;
    };
    const bloc = el("div", "kta-aide-section kta-ext-compte");
    if (titre) bloc.appendChild(el("div", "kta-ext-compte-titre", String(titre)));
    if (carteVisible) {
      const carte = el("div", "kta-ext-compte-carte");
      const ligne = el("div", "kta-ext-compte-qui");
      ligne.appendChild(el("span", "kta-ext-compte-pseudo", "👤 " + c.pseudo));
      if (c.libelle) ligne.appendChild(el("span", "kta-ext-compte-role", c.libelle));
      carte.appendChild(ligne);
      if (c.details) carte.appendChild(el("div", "kta-ext-compte-details", c.details));
      // Lien vers la première tuile du COMPTE (sans `ouvrir` propre).
      const tuiles = lieu === "profil" ? outilsHome() : [];
      const rangCompte = tuiles.findIndex(function (o) { return !o.ouvrir; });
      const outil = rangCompte >= 0 ? tuiles[rangCompte] : null;
      if (outil) {
        const lien = el("button", "kta-ext-compte-gerer", outil.libelle + "  ›");
        lien.type = "button";
        lien.addEventListener("click", function () { ouvrirOutilHome(rangCompte); });
        carte.appendChild(lien);
      }
      bloc.appendChild(carte);
    }
    let groupe = null;
    const fin = [];
    actions.forEach(function (a) {
      if (a.type === "fin") { fin.push(a); return; }
      if (a.groupe && a.groupe !== groupe) bloc.appendChild(el("div", "kta-ext-compte-groupe", a.groupe));
      groupe = a.groupe || groupe;
      if (a.type === "etat") {
        const l = el("div", "kta-ext-compte-etat");
        l.appendChild(el("span", "", a.libelle));
        if (a.lien) {
          const b = el("button", "kta-ext-compte-lien", a.lien);
          b.type = "button";
          b.addEventListener("click", function () { _lancerAction(a); });
          l.appendChild(b);
        }
        bloc.appendChild(l);
        return;
      }
      const b = el("button", "loader-btn-secondary kta-ext-compte-btn", a.libelle);
      b.type = "button";
      b.addEventListener("click", function () { _lancerAction(a); });
      bloc.appendChild(b);
    });
    fin.forEach(function (a) {
      const b = el("button", "kta-ext-compte-fin", a.libelle);
      b.type = "button";
      b.addEventListener("click", function () { _lancerAction(a); });
      bloc.appendChild(b);
    });
    return bloc;
  }

  // ── Photos des points (prise d'INFORMATION `photos`) ──
  // photos: { completerPoint(planId, pointId) → Promise<number>, completerPlan(planId) → Promise<{ ajoutees,
  //   total }> } : l'extension dépose les photos manquantes par MyKTAMapPhotos.restorePhoto ; l'app
  //   réaffiche si quelque chose est arrivé. Attente bornée à 8 s ; erreur ignorée (journalisée [Photos]).
  // Sans extension : aucune attente.
  const PHOTOS_DELAI_MS = 8000;
  function _photosBorne(appel, defaut, nom) {
    let delai;
    return Promise.race([
      Promise.resolve().then(appel).catch(function (e) { console.warn("[Photos] extension « " + nom + " » :", e); return defaut; }),
      new Promise(function (r) {
        delai = setTimeout(function () { console.warn("[Photos] extension « " + nom + " » : délai dépassé"); r(defaut); }, PHOTOS_DELAI_MS);
      })
    ]).finally(function () { clearTimeout(delai); });
  }
  function photosCompleterPoint(planId, pointId) {
    const ext = _prise("photos");
    if (!ext || typeof ext.photos.completerPoint !== "function" || !planId || !pointId) return Promise.resolve(0);
    return _photosBorne(function () { return ext.photos.completerPoint(String(planId), String(pointId)); }, 0, "completerPoint")
      .then(function (n) { return (Number.isInteger(n) && n > 0) ? n : 0; });
  }
  function photosCompleterPlan(planId) {
    const ext = _prise("photos");
    const rien = { ajoutees: 0, total: 0 };
    if (!ext || typeof ext.photos.completerPlan !== "function" || !planId) return Promise.resolve(rien);
    return _photosBorne(function () { return ext.photos.completerPlan(String(planId)); }, rien, "completerPlan")
      .then(function (r) {
        const n = function (v) { return (Number.isInteger(v) && v > 0) ? v : 0; };
        return (r && typeof r === "object") ? { ajoutees: n(r.ajoutees), total: n(r.total) } : rien;
      });
  }

  // ── Changements reçus (synchro entrante) ──
  // Applique au plan OUVERT des objets et traces de suppression d'un autre appareil : même règle que la fusion
  // de sessions (KtaUid.fusionnerCalques — par uid, le plus récent gagne, une trace postérieure l'emporte, un
  // objet supprimé ne ressuscite pas). L'itinéraire en cours n'est jamais touché. `lot.restitutions` =
  // [{ calque, avant }] : calques rendus à leur original ailleurs (CalqueSession.appliquerRestitutions, jamais
  // une trace de suppression). → { fusionnes, supprimes, calques: { retires, gardes } } ou null (aucun plan
  // ouvert, ou plan pas encore prêt : RIEN n'est appliqué). Objets reçus copiés : rien de partagé avec l'appelant.
  // ⚠️ null = lot à redemander : l'extension ne doit pas avancer son curseur (cf. planPret).
  function appliquerChangements(lot) {
    if (!planPret()) return null;
    if (!lot || typeof lot !== "object" || !window.KtaUid ||
        typeof window.getEditorPoints !== "function" || typeof window.setEditorPoints !== "function") return null;
    const copie = function (a) {
      return Array.isArray(a) ? JSON.parse(JSON.stringify(a.filter(function (o) { return o && typeof o === "object"; }))) : [];
    };
    const routes = (window.getRoads && window.getRoads()) || [];
    const horsFusion = routes.filter(function (r) { return r && (r.type === "itinerary" || r._preview); });
    const local = {
      data: window.getEditorPoints() || [],
      roads: routes.filter(function (r) { return horsFusion.indexOf(r) < 0; }),
      zones: (window.getZones && window.getZones()) || [],
      structures: (window.getStructures && window.getStructures()) || [],
      tombstones: window.KtaUid.getTombstones()
    };
    const distant = {
      data: copie(lot.editorPoints),
      roads: copie(lot.roads).filter(function (r) { return r.type !== "itinerary" && !r._preview; }),
      zones: copie(lot.zones),
      structures: copie(lot.structures),
      tombstones: Array.isArray(lot.tombstones) ? lot.tombstones : []
    };
    const r = window.KtaUid.fusionnerCalques([local, distant]);
    // Seules les familles touchées (objet reçu, ou trace visant un objet d'ici) sont réécrites : une
    // réécriture ferme la fiche ouverte et coupe le dessin en cours.
    const tracesRecues = new Set(distant.tombstones.map(function (t) { return t && t.uid; }));
    // 🩸 L'ÉCHO DE SES PROPRES ENVOIS N'EST PAS UNE NOUVEAUTÉ : le serveur renvoie les objets que cet appareil
    // vient d'envoyer (même uid, même updatedAt). Comptés comme reçus, ils réécriraient la famille et
    // videraient l'historique d'annulation à chaque synchro. Reçu = inconnu ici ou plus récent.
    const nouveau = function (fam) {
      const ici = new Map();
      local[fam].forEach(function (o) { if (o && o.uid) ici.set(o.uid, Number(o.updatedAt) || 0); });
      return function (o) { return !!o && (!ici.has(o.uid) || (Number(o.updatedAt) || 0) > ici.get(o.uid)); };
    };
    const touche = function (fam) {
      return distant[fam].some(nouveau(fam)) || local[fam].some(function (o) { return o && tracesRecues.has(o.uid); });
    };
    distant.data.concat(distant.roads, distant.zones, distant.structures).forEach(function (o) { if (o && o.uid) _recusADistance.add(o.uid); });
    const traces = new Map();
    local.tombstones.concat(distant.tombstones).forEach(function (t) {
      if (t && typeof t.uid === "string" && typeof t.deletedAt === "number") traces.set(t.uid, Math.max(traces.get(t.uid) || 0, t.deletedAt));
    });
    window.KtaUid.setTombstones(Array.from(traces, function (e) { return { uid: e[0], deletedAt: e[1] }; }));
    // L'objet EN COURS de dessin est retrouvé par son uid après réécriture (sinon le clic suivant en démarre
    // un nouveau).
    const enCours = function (getter) { const o = typeof window[getter] === "function" ? window[getter]() : null; return o && o.uid ? o.uid : null; };
    const reprendre = function (setter, liste, uid) {
      if (uid && typeof window[setter] === "function") window[setter](liste.findIndex(function (o) { return o && o.uid === uid; }));
    };
    const cRoad = enCours("getCurrentRoad"), cZone = enCours("getCurrentZone"), cStruct = enCours("getCurrentStructure");
    const touches = { data: touche("data"), roads: touche("roads"), zones: touche("zones"), structures: touche("structures") };
    // Calque ouvert à la modification ailleurs (copies marquées) : l'état « rapatrié » est local à l'appareil,
    // il se déduit des marques (CalqueSession.resynchroniser). Seulement si une copie marquée arrive, ou si une
    // copie d'ici disparaît : un tour sans rien de tel ne relance ni journal ni sauvegarde.
    const CS = window.CalqueSession;
    const cle = CS && CS.CLE_SOURCE;
    let recalerCalques = false;
    if (cle && typeof CS.resynchroniser === "function") {
      const FAMS = ["data", "roads", "zones", "structures"];
      recalerCalques = FAMS.some(function (fam) {
        return touches[fam] && distant[fam].filter(nouveau(fam)).some(function (o) { return o[cle] !== undefined; });
      });
      if (!recalerCalques) {
        const restants = new Set();
        FAMS.forEach(function (fam) { r[fam].forEach(function (o) { if (o && o.uid) restants.add(o.uid); }); });
        recalerCalques = FAMS.some(function (fam) {
          return touches[fam] && local[fam].some(function (o) { return o && o[cle] !== undefined && o.uid && !restants.has(o.uid); });
        });
      }
    }
    if (touches.data) window.setEditorPoints(r.data);
    if (touches.roads && window.setRoads) { const l = r.roads.concat(horsFusion); window.setRoads(l); reprendre("setCurrentRoadByIndex", l, cRoad); }
    if (touches.zones && window.setZones) { window.setZones(r.zones); reprendre("setCurrentZoneByIndex", r.zones, cZone); }
    if (touches.structures && window.setStructures) { window.setStructures(r.structures); reprendre("setCurrentStructureByIndex", r.structures, cStruct); }
    // Restitutions : appliquées APRÈS la fusion (une copie périmée reçue dans ce lot est traitée aussi), et à
    // chaque arrivée de copie marquée (restitutions déjà connues).
    const restRecues = (Array.isArray(lot.restitutions) ? lot.restitutions : []).filter(function (x) {
      return x && typeof x === "object";
    }).slice(0, 200).map(function (x) { return { calque: x.calque, avant: x.avant }; });
    let rest = null;
    if (cle && typeof CS.appliquerRestitutions === "function" && (restRecues.length || recalerCalques)) {
      try { rest = CS.appliquerRestitutions(restRecues); } catch (e) { console.warn("[Extensions] restitutions :", e); }
    }
    const rien = !touches.data && !touches.roads && !touches.zones && !touches.structures && !(rest && rest.change);
    // L'annulation remet une photo COMPLÈTE d'une famille : après une réception, elle effacerait ce que les
    // autres viennent d'ajouter. L'historique repart de zéro (message seulement s'il y avait de quoi annuler).
    if (!rien && window.HistoryManager && typeof window.HistoryManager.reset === "function") {
      const avait = typeof window.HistoryManager.canUndo === "function" && (window.HistoryManager.canUndo() ||
        (typeof window.HistoryManager.canRedo === "function" && window.HistoryManager.canRedo()));
      window.HistoryManager.reset();
      if (avait && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(_t("ext.sync.annulationVidee"), "info", { groupe: "ext-annulation" });
      }
    }
    if (recalerCalques || (rest && rest.change)) {
      try { CS.resynchroniser(); } catch (e) { console.warn("[Extensions] calques en modification :", e); }
    }
    if (!rien && window.SessionPersist && typeof window.SessionPersist.save === "function") window.SessionPersist.save({ force: true });
    // Le plan ouvert a changé : les statistiques (cache par plan du profil) se recalculent.
    if (!rien) {
      try { window.dispatchEvent(new CustomEvent("mktm:changements-appliques")); } catch (e) { /* rien */ }
    }
    return { fusionnes: r.fusionnes, supprimes: r.supprimes,
      calques: { retires: rest ? rest.retires : 0, gardes: rest ? rest.gardes : 0 } };
  }
  // uid reçus d'une installation reliée (la fiche d'édition s'en sert pour signaler un conflit).
  const _recusADistance = new Set();
  function recuADistance(uid) { return !!uid && _recusADistance.has(uid); }

  // ── Effacement à la déconnexion ──
  // Retire les plans d'une extension (registre `type: "ext"`) : session, photos, archive locale.
  // 🩸 Jamais un plan importé (type « local ») ni un plan de l'instance (type « server ») : ils ne viennent
  // pas du backend.
  function effacerDonneesExtension(planIds) {
    const PR = window.PlanRegistry;
    if (!PR || !Array.isArray(planIds)) return Promise.resolve({ effaces: 0, refuses: 0 });
    let effaces = 0, refuses = 0;
    return planIds.reduce(function (p, id) {
      return p.then(function () {
        const e = PR.findById(id);
        if (!e || e.type !== "ext") { refuses++; return; }
        try { window.KtaSessionStore.retirer(id); } catch (er) {}
        // Photos, sauvegardes de session et calage (purge du registre), puis l'entrée et son archive (remove).
        return Promise.resolve(typeof PR.purgeAssociatedData === "function" ? PR.purgeAssociatedData(id) : null)
          .catch(function () { /* purge partielle : on retire quand même l'entrée */ })
          .then(function () { return typeof PR.remove === "function" ? PR.remove(id) : null; })
          .then(function () { effaces++; });
      });
    }, Promise.resolve()).then(function () { return { effaces: effaces, refuses: refuses }; });
  }

  // ── Mode Secours partagé (entrant) ──
  // Modification reçue appliquée par la fusion en liste blanche (SecoursMode.update). Le sortant est
  // l'événement `mktm:secours-scenario-mutated`.
  function secoursAppliquer(scenarioId, partiel) {
    if (!window.SecoursMode || typeof window.SecoursMode.update !== "function") return false;
    try { return window.SecoursMode.update(scenarioId, partiel) !== false; }
    catch (e) { console.warn("[Extensions] secoursAppliquer :", e); return false; }
  }

  // ── Compte connecté ──
  // Une extension de connexion dit QUI est connecté : la carte profil de l'accueil l'affiche à la place du
  // profil local, sans rien y écrire (surnom et photo de l'appareil reviennent à la déconnexion). Texte
  // seulement, longueurs bornées ; erreur ou forme inattendue = null.
  function compte() {
    const ext = _prise("compte");
    if (!ext || typeof ext.compte !== "function") return null;
    try {
      const c = ext.compte();
      if (!c || typeof c.pseudo !== "string" || !c.pseudo.trim()) return null;
      return {
        pseudo: c.pseudo.trim().slice(0, 40),
        libelle: typeof c.libelle === "string" ? c.libelle.trim().slice(0, 24) : "",
        // Précision sous le pseudo (ex. l'organisation), dans « Mon profil » seulement ; facultative.
        details: typeof c.details === "string" ? c.details.trim().slice(0, 80) : ""
      };
    } catch (e) { console.warn("[Extensions] compte :", e); return null; }
  }
  function notifierCompte() {
    try { window.dispatchEvent(new CustomEvent("mktm:compte-changed")); } catch (e) { /* rien */ }
  }

  // ── Présence sur le plan ouvert (opt-in) ──
  // `presence: { actif(), basculer() }` publie la position UNIQUEMENT quand l'utilisateur l'a choisi (tuile 📡
  // du tracker). L'app fournit une lecture (positionTracker) et un affichage (afficherPresences,
  // js/ktaPresences.js). Sans extension : pas de tuile, rien n'est lu.
  function presenceActive() {
    const ext = _prise("presence");
    if (!ext || !ext.presence || typeof ext.presence.actif !== "function") return false;
    try { return ext.presence.actif() === true; } catch (e) { return false; }
  }
  function basculerPresence() {
    const ext = _prise("presence");
    if (!ext || !ext.presence || typeof ext.presence.basculer !== "function") return Promise.resolve(false);
    try {
      return Promise.resolve(ext.presence.basculer()).then(function () { return presenceActive(); },
        function (e) { console.warn("[Extensions] presence :", e); return presenceActive(); });
    } catch (e) { console.warn("[Extensions] presence :", e); return Promise.resolve(presenceActive()); }
  }
  // Position du tracker, ou null tant qu'elle ne veut rien dire (ni suivi ni position confirmée).
  function positionTracker() {
    try {
      if (!window.map || typeof window.getTrackingPosition !== "function") return null;
      const e = typeof window.getTrackingPositionEtat === "function" ? window.getTrackingPositionEtat() : {};
      if (!e.suiviActif && !e.confirmee) return null;
      const p = window.getTrackingPosition();
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
      const n = typeof window.getTrackerLevel === "function" ? window.getTrackerLevel() : null;
      return { x: p.x, y: p.y, niveau: Number.isInteger(n) ? n : null, suiviActif: !!e.suiviActif, ts: Date.now() };
    } catch (e) { return null; }
  }
  function afficherPresences(liste) {
    try { return window.KtaPresences ? window.KtaPresences.afficher(liste) : 0; }
    catch (e) { console.warn("[Extensions] afficherPresences :", e); return 0; }
  }

  // ── Itinéraire publié (opt-in) ──
  // `itineraire: { publie(), basculer() }` publie l'itinéraire actif UNIQUEMENT si l'utilisateur l'a choisi
  // (bouton de la fenêtre Itinéraire). Lecture : itineraireActuel ; affichage : afficherItineraires
  // (js/ktaPresences.js). Sans extension : pas de bouton, rien n'est lu.
  function itinerairePublie() {
    const ext = _prise("itineraire");
    if (!ext || !ext.itineraire || typeof ext.itineraire.publie !== "function") return false;
    try { return ext.itineraire.publie() === true; } catch (e) { return false; }
  }
  function basculerItineraire() {
    const ext = _prise("itineraire");
    if (!ext || !ext.itineraire || typeof ext.itineraire.basculer !== "function") return Promise.resolve(false);
    try {
      return Promise.resolve(ext.itineraire.basculer()).then(function () { return itinerairePublie(); },
        function (e) { console.warn("[Extensions] itineraire :", e); return itinerairePublie(); });
    } catch (e) { console.warn("[Extensions] itineraire :", e); return Promise.resolve(itinerairePublie()); }
  }
  // Itinéraire actif : { points: [[x, y, niveau]], etapes: [[x, y, faite]] }, ou null.
  function itineraireActuel() {
    try {
      if (!window.map || typeof window.getRoads !== "function") return null;
      const r = (window.getRoads() || []).find(function (o) { return o && o.type === "itinerary" && !o._preview; });
      if (!r || !Array.isArray(r.points) || r.points.length < 2) return null;
      const n = function (v) { return Number.isInteger(v) ? v : null; };
      return {
        points: r.points.filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); })
          .map(function (p) { return [p.x, p.y, n(p.level)]; }),
        etapes: (Array.isArray(r.waypoints) ? r.waypoints : [])
          .filter(function (w) { return w && isFinite(w.x) && isFinite(w.y) && w.source !== "tracker"; })
          .map(function (w) { return [w.x, w.y, w.done === true]; })
      };
    } catch (e) { return null; }
  }
  // Itinéraire REÇU (ex. attribué par un chef d'équipe), après acceptation côté extension : devient
  // l'itinéraire actif. Même forme ; entrées non conformes écartées ; sans carte ni module Itinéraire : false.
  function appliquerItineraire(it) {
    try {
      if (!it || !Array.isArray(it.points) || !window.map || typeof window.itineraireActiverRoad !== "function") return false;
      const fini = function (v) { return typeof v === "number" && isFinite(v); };
      const pts = it.points.filter(function (q) { return Array.isArray(q) && fini(q[0]) && fini(q[1]); }).slice(0, 5000)
        .map(function (q) { const p = { x: q[0], y: q[1] }; if (Number.isInteger(q[2])) p.level = q[2]; return p; });
      if (pts.length < 2) return false;
      const etapes = (Array.isArray(it.etapes) ? it.etapes : []).filter(function (q) { return Array.isArray(q) && fini(q[0]) && fini(q[1]); })
        .slice(0, 100).map(function (q) { return { x: q[0], y: q[1], source: "click", done: q[2] === true }; });
      // Départ en tête : la fenêtre Itinéraire passe en navigation à partir de 2 étapes.
      const waypoints = [{ x: pts[0].x, y: pts[0].y, source: "click" }].concat(etapes);
      if (waypoints.length < 2) waypoints.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, source: "click" });
      window.itineraireActiverRoad({ type: "itinerary", points: pts, waypoints: waypoints });
      return true;
    } catch (e) { console.warn("[Extensions] appliquerItineraire :", e); return false; }
  }
  // ── Mode Secours avec une installation reliée — prises neutres ──
  // secoursActions(ctx) → [{ libelle, action, danger? }] : boutons du Mode Secours (en-tête du scénario, carte
  //   d'une équipe, vue Live). ctx = { scenarioId, vue: "edition"|"live", equipeId?, role? }.
  // secoursInfoEquipe(scenarioId, equipeId) → texte affiché sur la carte de l'équipe.
  // secoursPeutAvancer(scenarioId, equipeId, quoi) → bool, quoi ∈ etape|depart|rentree|rappel :
  //   sans prise = oui ; 🔒 prise en erreur = NON (une permission qui échoue ne laisse pas passer).
  function secoursActions(ctx) {
    const out = [];
    _extensions.forEach(function (ext) {
      if (typeof ext.secoursActions !== "function") return;
      try {
        const l = ext.secoursActions(Object.assign({}, ctx || {}));
        (Array.isArray(l) ? l : []).forEach(function (a) {
          if (a && typeof a.libelle === "string" && a.libelle.trim() && typeof a.action === "function") {
            out.push({ libelle: a.libelle.trim().slice(0, 60), action: a.action, danger: a.danger === true });
          }
        });
      } catch (e) { console.warn("[Extensions] secoursActions :", e); }
    });
    return out.slice(0, 8);
  }
  function secoursInfoEquipe(scenarioId, equipeId) {
    const ext = _prise("secoursInfoEquipe");
    if (!ext) return "";
    try { const t = ext.secoursInfoEquipe(scenarioId, equipeId); return typeof t === "string" ? t.trim().slice(0, 200) : ""; }
    catch (e) { console.warn("[Extensions] secoursInfoEquipe :", e); return ""; }
  }
  // Comptes reliés à une équipe : entrent dans l'effectif automatique. Sans prise ou en erreur : 0.
  function secoursNbComptesEquipe(scenarioId, equipeId) {
    const ext = _prise("secoursNbComptesEquipe");
    if (!ext) return 0;
    try { const n = ext.secoursNbComptesEquipe(scenarioId, equipeId); return Number.isInteger(n) && n > 0 && n < 100 ? n : 0; }
    catch (e) { console.warn("[Extensions] secoursNbComptesEquipe :", e); return 0; }
  }
  function secoursPeutAvancer(scenarioId, equipeId, quoi) {
    const ext = _prise("secoursPeutAvancer");
    if (!ext) return true;
    try { return ext.secoursPeutAvancer(scenarioId, equipeId, quoi) === true; }
    catch (e) { console.warn("[Extensions] secoursPeutAvancer :", e); return false; }
  }
  // Bandeau d'alerte Secours : persistant en haut de l'écran, texte échappé, boutons de l'extension ; son +
  // vibration à la première apparition (ou si `sonner`). { id, titre, texte, actions: [{ libelle, action }],
  // sonner? } ; retirerAlerteSecours(id).
  function _bip() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      [0, 0.35, 0.7].forEach(function (t0) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.25, ctx.currentTime + t0); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + 0.3);
        o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + 0.3);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) { /* rien */ } }, 1500);
    } catch (e) { /* pas de son : la vibration et le bandeau restent */ }
  }
  function afficherAlerteSecours(a) {
    if (!a || typeof a.id !== "string" || !a.id) return false;
    let box = document.getElementById("kta-alerte-secours");
    const neuve = !box || box.getAttribute("data-alerte-id") !== a.id;
    if (!box) {
      box = document.createElement("div");
      box.id = "kta-alerte-secours";
      box.setAttribute("role", "alert");
      document.documentElement.appendChild(box);
    }
    box.setAttribute("data-alerte-id", a.id);
    box.textContent = "";
    const titre = document.createElement("div"); titre.className = "kta-alerte-secours-titre";
    titre.textContent = String(a.titre || "").slice(0, 120);
    const texte = document.createElement("div"); texte.className = "kta-alerte-secours-texte";
    texte.textContent = String(a.texte || "").slice(0, 400);
    const actions = document.createElement("div"); actions.className = "kta-alerte-secours-actions";
    (Array.isArray(a.actions) ? a.actions : []).slice(0, 5).forEach(function (x) {
      if (!x || typeof x.action !== "function") return;
      const b = document.createElement("button"); b.type = "button"; b.className = "kta-btn kta-btn-small";
      b.textContent = String(x.libelle || "").slice(0, 50);
      b.addEventListener("click", function () { try { x.action(); } catch (e) { console.warn("[Extensions] alerte :", e); } });
      actions.appendChild(b);
    });
    box.appendChild(titre); box.appendChild(texte); box.appendChild(actions);
    if (neuve || a.sonner === true) {
      _bip();
      if (window.kta_vibrate && typeof window.kta_vibrate.urgence === "function") window.kta_vibrate.urgence([500, 200, 500, 200, 500]);
      else if (navigator.vibrate) { try { navigator.vibrate([500, 200, 500, 200, 500]); } catch (e) { /* rien */ } }
    }
    return true;
  }
  function retirerAlerteSecours(id) {
    const box = document.getElementById("kta-alerte-secours");
    if (box && (!id || box.getAttribute("data-alerte-id") === id)) box.remove();
  }
  function afficherItineraires(liste) {
    try { return window.KtaPresences ? window.KtaPresences.afficherItineraires(liste) : 0; }
    catch (e) { console.warn("[Extensions] afficherItineraires :", e); return 0; }
  }

  // ── Plans d'extension : rangement DIFFUSÉ et copie hors ligne ──
  // plans.ranger(idExt, dossierExt|null) → Promise<bool> ; plans.horsLigne = { etat(idExt) →
  // Promise<"garde"|"perime"|"absent">, garder(idExt) → Promise<bool> }. Un dossier de l'installation a un id
  // local dans le registre (main.js > associerDossiersExtension). Un dossier créé sur l'appareil n'est jamais
  // diffusé.
  let _dossiersRegistre = {};
  function associerDossiersExtension(table) {
    _dossiersRegistre = (table && typeof table === "object") ? Object.assign({}, table) : {};
  }
  function dossierExtension(dossierRegistreId) {
    return (dossierRegistreId && _dossiersRegistre[dossierRegistreId]) || null;
  }
  function _idExtension(registreId) {
    const e = window.PlanRegistry && typeof window.PlanRegistry.findById === "function" ? window.PlanRegistry.findById(registreId) : null;
    return e && e.type === "ext" && e.extId ? String(e.extId) : null;
  }
  function rangerPlanExtension(registreId, dossierRegistreId) {
    const ext = _prise("plans");
    if (!ext || typeof ext.plans.ranger !== "function") return Promise.resolve(false);
    const id = _idExtension(registreId);
    const d = dossierRegistreId ? dossierExtension(dossierRegistreId) : null;
    if (!id || (dossierRegistreId && !d)) return Promise.resolve(false);
    try {
      return Promise.resolve(ext.plans.ranger(id, d)).then(function (r) { return r === true; }, function () { return false; });
    } catch (e) { console.warn("[Extensions] ranger :", e); return Promise.resolve(false); }
  }
  function _horsLigne() {
    const ext = _prise("plans");
    const h = ext && ext.plans.horsLigne;
    return h && typeof h.etat === "function" && typeof h.garder === "function" ? h : null;
  }
  function horsLigneExtensionDisponible() { return !!_horsLigne(); }
  function etatHorsLigneExtension(registreId) {
    const h = _horsLigne(), id = _idExtension(registreId);
    if (!h || !id) return Promise.resolve(null);
    try {
      return Promise.resolve(h.etat(id)).then(function (e) { return ["garde", "perime", "absent"].indexOf(e) >= 0 ? e : null; },
        function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function garderPlanExtension(registreId) {
    const h = _horsLigne(), id = _idExtension(registreId);
    if (!h || !id) return Promise.resolve(false);
    try { return Promise.resolve(h.garder(id)).then(function (r) { return r === true; }, function () { return false; }); }
    catch (e) { return Promise.resolve(false); }
  }

  // ── Actions d'extension sur la fiche d'un objet ──
  // actionsObjet(uid) → [{ libelle, action }] (synchrone). Les fiches portent data-kta-uid ; un observateur,
  // posé SEULEMENT si la prise existe, ajoute les boutons. Sans extension : rien n'est observé.
  function actionsObjet(uid) {
    const ext = _prise("actionsObjet");
    if (!ext || typeof ext.actionsObjet !== "function" || typeof uid !== "string" || !uid) return [];
    try {
      const l = ext.actionsObjet(uid);
      return (Array.isArray(l) ? l : []).filter(function (a) {
        return a && typeof a.libelle === "string" && a.libelle.trim() && typeof a.action === "function";
      }).slice(0, 4).map(function (a) { return { libelle: a.libelle.trim().slice(0, 40), action: a.action }; });
    } catch (e) { console.warn("[Extensions] actionsObjet :", e); return []; }
  }
  // Panneau d'extension sur la carte : `panneau: { icone, titre, rendre(conteneur) }`. Bouton à gauche sur la
  // carte, fenêtre dont l'extension remplit le corps (rendre rappelé à chaque ouverture et par
  // rafraichirPanneau()). Sans extension : rien. Erreur de l'extension = fenêtre avec un message.
  function panneauExtension() {
    const ext = _prise("panneau");
    const p = ext && ext.panneau;
    if (!p || typeof p.rendre !== "function") return null;
    return { icone: String(p.icone || "🧩").slice(0, 4), titre: String(p.titre || "").trim().slice(0, 40) || _t("ext.panneau.titreDefaut") };
  }
  let _panneauCorps = null;
  function _rendrePanneau() {
    const ext = _prise("panneau");
    if (!_panneauCorps || !_panneauCorps.isConnected || !ext) return;
    _panneauCorps.textContent = "";
    try { ext.panneau.rendre(_panneauCorps); }
    catch (e) { console.warn("[Extensions] panneau :", e); _panneauCorps.textContent = "⚠️ " + String((e && e.message) || e).slice(0, 120); }
  }
  function ouvrirPanneau() {
    const info = panneauExtension();
    if (!info) return false;
    const ancien = document.getElementById("kta-ext-panneau");
    if (ancien) ancien.remove();
    const ov = document.createElement("div");
    ov.className = "kta-readme-modal-overlay";
    ov.id = "kta-ext-panneau";
    const boite = document.createElement("div");
    boite.className = "kta-readme-modal-boite kta-ext-panneau-boite";
    const tete = document.createElement("div");
    tete.className = "kta-readme-modal-header";
    const titre = document.createElement("span");
    titre.className = "kta-readme-modal-titre";
    titre.textContent = info.icone + " " + info.titre;
    const fermer = document.createElement("button");
    fermer.className = "kta-readme-modal-close"; fermer.type = "button"; fermer.textContent = "✕";
    fermer.addEventListener("click", function () { ov.remove(); });
    tete.appendChild(titre); tete.appendChild(fermer);
    _panneauCorps = document.createElement("div");
    _panneauCorps.className = "kta-readme-modal-corps kta-ext-panneau-corps";
    boite.appendChild(tete); boite.appendChild(_panneauCorps);
    ov.appendChild(boite);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    document.documentElement.appendChild(ov);
    _rendrePanneau();
    return true;
  }
  function rafraichirPanneau() { _rendrePanneau(); }
  function fermerPanneau() {
    const ov = document.getElementById("kta-ext-panneau");
    if (ov) ov.remove();
    _panneauCorps = null;
  }
  // ── Plan prêt (fin de chargement) ──
  // Entre le début du chargement d'un plan et la restauration de sa session, la mémoire tient encore les objets
  // du plan quitté (ou rien), puis main.js > lancerApplication la remplace (initEditor, SessionPersist.onPlanLoaded).
  // 🩸 Un lot appliqué dans cette fenêtre est écrasé sans bruit ; un envoi y partirait avec les objets de l'AUTRE
  // plan. planCharge(id) est appelé par main.js une fois la session restaurée ; quitterPlan le remet à faux.
  // planPret() : vrai seulement pour ce plan-là, affiché. Signal : `mktm:plan-pret` { planId }.
  let _planPret = null;
  function planCharge(planId) {
    _planPret = { id: planId || null };
    try { window.dispatchEvent(new CustomEvent("mktm:plan-pret", { detail: { planId: planId || null } })); } catch (e) { /* rien */ }
  }
  function planPret() {
    if (!_planPret || _planPret.id !== (window._currentLoadedPlanId || null)) return false;
    return typeof window.ktaPlanAffiche !== "function" || window.ktaPlanAffiche();
  }
  // Sortie du plan (main.js : changement de plan, retour à l'accueil) : panneau fermé, présences et
  // itinéraires effacés, extension prévenue (mktm:plan-ferme).
  function quitterPlan(versOu) {
    _planPret = null;
    fermerPanneau();
    try { if (window.KtaPresences) window.KtaPresences.reinitialiser(); } catch (e) { /* rien */ }
    try { window.dispatchEvent(new CustomEvent("mktm:plan-ferme", { detail: { vers: versOu || "plan" } })); } catch (e) { /* rien */ }
  }

  // Badge d'un plan d'extension dans la liste de l'accueil : { texte (8 car.), titre (160 car.) }, en texte ;
  // changement annoncé par `mktm:plans-badges-changes`. Erreur ou forme inattendue = pas de badge.
  function badgePlan(registreId) {
    const ext = _prise("badgePlan");
    const id = _idExtension(registreId);
    if (!ext || typeof ext.badgePlan !== "function" || !id) return null;
    try {
      const b = ext.badgePlan(id);
      if (!b || typeof b.texte !== "string" || !b.texte.trim()) return null;
      return { texte: b.texte.trim().slice(0, 8), titre: typeof b.titre === "string" ? b.titre.trim().slice(0, 160) : "" };
    } catch (e) { console.warn("[Extensions] badgePlan :", e); return null; }
  }

  // Ligne d'information de l'extension (« Créé par X · modifié par Y ») : texte, 120 car. max ; l'app n'écrit
  // jamais d'auteur elle-même (community anonyme).
  function infoObjet(uid) {
    const ext = _prise("infoObjet");
    if (!ext || typeof ext.infoObjet !== "function" || typeof uid !== "string" || !uid) return "";
    try { const t = ext.infoObjet(uid); return typeof t === "string" ? t.trim().slice(0, 120) : ""; }
    catch (e) { console.warn("[Extensions] infoObjet :", e); return ""; }
  }
  // Liaisons inter-plan qu'une extension synchronise : prise `liaisons: { info(lien) → string, actions(lien) →
  // [{ libelle, action }], modifiable(lien) → bool }` (synchrones, `lien` = copie du registre). info : texte, 80 car. ;
  // actions : 2 au plus ; modifiable est une PERMISSION — sans prise : oui, erreur : non. Sans extension : rien.
  function _priseLiaisons(f) {
    const ext = _prise("liaisons");
    return ext && ext.liaisons && typeof ext.liaisons[f] === "function" ? ext.liaisons : null;
  }
  const _copieLien = function (l) { try { return JSON.parse(JSON.stringify(l)); } catch (e) { return null; } };
  function liaisonInfo(lien) {
    const p = _priseLiaisons("info");
    if (!p || !lien) return "";
    try { const t = p.info(_copieLien(lien)); return typeof t === "string" ? t.trim().slice(0, 80) : ""; }
    catch (e) { console.warn("[Extensions] liaisons.info :", e); return ""; }
  }
  function liaisonActions(lien) {
    const p = _priseLiaisons("actions");
    if (!p || !lien) return [];
    try {
      const l = p.actions(_copieLien(lien));
      return (Array.isArray(l) ? l : []).filter(function (a) {
        return a && typeof a.libelle === "string" && a.libelle.trim() && typeof a.action === "function";
      }).slice(0, 2).map(function (a) { return { libelle: a.libelle.trim().slice(0, 40), action: a.action }; });
    } catch (e) { console.warn("[Extensions] liaisons.actions :", e); return []; }
  }
  function liaisonModifiable(lien) {
    const p = _priseLiaisons("modifiable");
    if (!p || !lien) return true;
    try { return p.modifiable(_copieLien(lien)) === true; }
    catch (e) { console.warn("[Extensions] liaisons.modifiable a échoué → refus :", e); return false; }
  }

  // auteurObjet(uid) → { createur, modifiePar } : filtre « auteur » de l'export ; sans extension : null
  // (filtre non proposé).
  function auteurObjet(uid) {
    const ext = _prise("auteurObjet");
    if (!ext || typeof ext.auteurObjet !== "function" || typeof uid !== "string" || !uid) return null;
    try {
      const a = ext.auteurObjet(uid);
      if (!a || typeof a !== "object") return null;
      const txt = function (v) { return typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : null; };
      return { createur: txt(a.createur), modifiePar: txt(a.modifiePar) };
    } catch (e) { console.warn("[Extensions] auteurObjet :", e); return null; }
  }
  function _hydraterFiche(racine) {
    if (!racine || racine.getAttribute("data-kta-ext") === "1") return;
    racine.setAttribute("data-kta-ext", "1");
    const uid = racine.getAttribute("data-kta-uid");
    const info = infoObjet(uid);
    if (info) {
      const ligne = document.createElement("div");
      ligne.className = "kta-popup-ext-info";
      ligne.textContent = info;
      racine.appendChild(ligne);
    }
    const actions = actionsObjet(uid);
    if (!actions.length) return;
    const zone = document.createElement("div");
    zone.className = "kta-popup-actions kta-popup-ext";
    actions.forEach(function (a) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "kta-popup-btn"; b.textContent = a.libelle;
      b.addEventListener("click", function (ev) { ev.stopPropagation(); try { a.action(); } catch (e) { console.warn("[Extensions] action :", e); } });
      zone.appendChild(b);
    });
    racine.appendChild(zone);
  }
  let _observateurFiches = null;
  function _observerFiches() {
    if (_observateurFiches || typeof MutationObserver !== "function" || !document.body) return;
    // Une recherche par image affichée, limitée aux fiches pas encore traitées : un déplacement ou un zoom
    // produit des centaines de mutations.
    let prevu = false;
    const planifier = (typeof requestAnimationFrame === "function") ? requestAnimationFrame : function (f) { return setTimeout(f, 16); };
    _observateurFiches = new MutationObserver(function () {
      if (prevu) return;
      prevu = true;
      planifier(function () {
        prevu = false;
        document.querySelectorAll(".leaflet-popup-content [data-kta-uid]:not([data-kta-ext])").forEach(_hydraterFiche);
      });
    });
    _observateurFiches.observe(document.body, { childList: true, subtree: true });
  }

  // La tuile suit le compte (connexion, déconnexion) et l'accueil (posée une fois le DOM prêt).
  if (typeof window.addEventListener === "function") {
    window.addEventListener("mktm:compte-changed", _poserOutilHome);
    window.addEventListener("mktm:compte-changed", _poserPastilleHome);
    if (typeof document !== "undefined" && document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", _poserOutilHome);
      document.addEventListener("DOMContentLoaded", _poserPastilleHome);
    }
  }

  window.KtaExtensions = {
    API_VERSION: API_VERSION,
    register: register,
    aPrise: aPrise,
    outilsDev: outilsDev,
    aide: aide,
    documentation: documentation,
    signaler: signaler,
    chargerModules: chargerModules,
    modulesEtat: modulesEtat,
    requete: requete,
    importAutorise: importAutorise,
    exportAutorise: exportAutorise,
    exportLimite: exportLimite,
    profilJeuActif: profilJeuActif,
    alertesExtension: alertesExtension,
    profilStatsExtension: profilStatsExtension,
    gateDeleguee: gateDeleguee,
    listerPlansExtension: listerPlansExtension,
    dossiersExtension: dossiersExtension,
    chargerPlanExtension: chargerPlanExtension,
    publierPlan: publierPlan,
    versionAutorisee: versionAutorisee,
    publierVersion: publierVersion,
    changementsDepuis: changementsDepuis,
    effacerDonneesExtension: effacerDonneesExtension,
    secoursAppliquer: secoursAppliquer,
    compte: compte,
    notifierCompte: notifierCompte,
    appliquerChangements: appliquerChangements,
    actionsCompte: actionsCompte,
    presenceActive: presenceActive,
    basculerPresence: basculerPresence,
    positionTracker: positionTracker,
    afficherPresences: afficherPresences,
    itinerairePublie: itinerairePublie,
    basculerItineraire: basculerItineraire,
    itineraireActuel: itineraireActuel,
    afficherItineraires: afficherItineraires,
    appliquerItineraire: appliquerItineraire,
    secoursActions: secoursActions,
    secoursInfoEquipe: secoursInfoEquipe,
    secoursPeutAvancer: secoursPeutAvancer,
    secoursNbComptesEquipe: secoursNbComptesEquipe,
    afficherAlerteSecours: afficherAlerteSecours,
    retirerAlerteSecours: retirerAlerteSecours,
    auteurObjet: auteurObjet,
    associerDossiersExtension: associerDossiersExtension,
    dossierExtension: dossierExtension,
    rangerPlanExtension: rangerPlanExtension,
    horsLigneExtensionDisponible: horsLigneExtensionDisponible,
    lectureSeule: lectureSeule,
    importPartage: importPartage,
    avantReinitialisation: avantReinitialisation,
    CLE_DECONNEXION_EN_ATTENTE: CLE_DECONNEXION_EN_ATTENTE,
    recuADistance: recuADistance,
    etatHorsLigneExtension: etatHorsLigneExtension,
    garderPlanExtension: garderPlanExtension,
    actionsObjet: actionsObjet,
    infoObjet: infoObjet,
    liaisonInfo: liaisonInfo,
    liaisonActions: liaisonActions,
    liaisonModifiable: liaisonModifiable,
    photosCompleterPoint: photosCompleterPoint,
    photosCompleterPlan: photosCompleterPlan,
    badgePlan: badgePlan,
    panneauExtension: panneauExtension,
    ouvrirPanneau: ouvrirPanneau,
    rafraichirPanneau: rafraichirPanneau,
    fermerPanneau: fermerPanneau,
    quitterPlan: quitterPlan,
    planCharge: planCharge,
    planPret: planPret,
    blocActionsCompte: blocActionsCompte,
    outilHome: outilHome,
    outilsHome: outilsHome,
    pastilleHome: pastilleHome,
    ouvrirOutilHome: ouvrirOutilHome,
    valider: valider,
    etatDe: etatDe,
    appliquerConfig: appliquerConfig,
    etat: function () { return { etat: _etat, raison: _raison }; },
    peindre: peindre,
    apiBase: _apiBase,
    ETATS: ETATS.slice(),
    LS_MEMO: LS_MEMO
  };

  // ── Goulots pour le reste de l'app (sans extension : toujours « permis ») ──
  // Export de la SESSION du plan ouvert (complet, avancé, conversion, calque rapatrié) : refusé = message (marqué
  // important, visible même en mode « Essentielles »). KMZ, GPX, image, PDF, exports du Secours et ZIP de la fiche
  // ne passent pas ici : seule la session (ce qu'on a écrit sur le plan) est gardée.
  // `opts.limitePermise` : l'appelant sait limiter l'export à un auteur (ktaExportLimite) ; sinon un export limité
  // est refusé.
  window.ktaExportPlanRefuse = function (opts) {
    const id = window._currentLoadedPlanId;
    // Plan affiché seulement : depuis l'accueil (ex. fusionneur de sessions), rien à refuser.
    if (typeof window.ktaPlanAffiche === "function" && !window.ktaPlanAffiche()) return false;
    if (!id || exportAutorise(id)) return false;
    if (opts && opts.limitePermise === true && exportLimite(id)) return false;
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(_t("ext.export.refuse"), "warn", { important: true });
    }
    return true;
  };
  // Pseudo auquel l'export de session du plan OUVERT est limité, sinon null.
  window.ktaExportLimite = function () {
    const id = window._currentLoadedPlanId;
    if (typeof window.ktaPlanAffiche === "function" && !window.ktaPlanAffiche()) return null;
    return id ? exportLimite(id) : null;
  };
  // 🔒 À chaque ouverture d'un plan en lecture seule, une fenêtre le dit d'emblée. Appelée par main.js en fin
  // de chargement.
  window.ktaAnnoncerLectureSeule = function () {
    const id = window._currentLoadedPlanId;
    if (!id || !lectureSeule(id) || document.getElementById("kta-ext-lecture-seule")) return false;
    const ov = document.createElement("div");
    ov.id = "kta-ext-lecture-seule";
    ov.className = "kta-readme-modal-overlay";
    ov.style.zIndex = "100001";
    const boite = document.createElement("div");
    boite.className = "kta-readme-modal-boite";
    boite.style.cssText = "max-width:420px; height:auto;";
    const entete = document.createElement("div");
    entete.className = "kta-readme-modal-header";
    const titre = document.createElement("span");
    titre.className = "kta-readme-modal-titre";
    titre.textContent = _t("ext.lectureSeuleFenetre.titre");
    entete.appendChild(titre);
    const corps = document.createElement("div");
    corps.className = "kta-readme-modal-corps";
    corps.style.fontSize = "13px";
    const p = document.createElement("p");
    p.style.cssText = "line-height:1.55; margin:0 0 14px;";
    p.textContent = _t("ext.lectureSeuleFenetre.texte");
    const actions = document.createElement("div");
    actions.className = "kta-conv-actions";
    const ok = document.createElement("button");
    ok.className = "kta-btn kta-btn-primary";
    ok.textContent = _t("ext.lectureSeuleFenetre.ok");
    ok.addEventListener("click", function () { ov.remove(); });
    actions.appendChild(ok);
    corps.append(p, actions);
    boite.append(entete, corps);
    ov.appendChild(boite);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    document.documentElement.appendChild(ov);
    return true;
  };
  // Modifier le plan OUVERT (outils de dessin, fiche d'un point) : refusé = message.
  window.ktaEditionRefusee = function (silencieux) {
    const id = window._currentLoadedPlanId;
    if (!id || !lectureSeule(id)) return false;
    if (!silencieux && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(_t("ext.lectureSeule"), "warn", { groupe: "ext-lecture-seule", important: true });
    }
    return true;
  };
})();
