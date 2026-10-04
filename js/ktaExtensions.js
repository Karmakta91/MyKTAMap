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
//   { "state": "on" | "off", "api": "https://…", "modules": ["chemin/module.js"] }
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
  const ETATS = ["off", "invalide", "licence", "configuree"];
  const CLASSE_ETAT = {
    off:        "kta-tx-muted",
    invalide:   "kta-tx-err",
    licence:    "kta-tx-warn",
    configuree: "kta-tx-info"
  };
  const MAX_MODULES = 20;

  let _connexion = { etat: "off", raison: "" };   // résultat de valider()
  let _etat = "off";
  let _raison = "";
  let _dejaEmis = false;

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
      // schéma, sans « // », sans remontée, terminé par .js.
      if (typeof m !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.js$/.test(m) ||
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
    // L'infobulle et le titre du bloc disent « Connexion serveur : <état> » :
    // ils prennent la forme courte de l'état, pas le mot de la pastille (qui
    // contient déjà « Serveur »).
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

  window.KtaExtensions = {
    valider: valider,
    etatDe: etatDe,
    appliquerConfig: appliquerConfig,
    etat: function () { return { etat: _etat, raison: _raison }; },
    peindre: peindre,
    ETATS: ETATS.slice(),
    LS_MEMO: LS_MEMO
  };
})();
