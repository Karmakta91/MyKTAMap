/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// ALERTCHECKER.JS — Alertes publiques du site (incendie, fermeture, migration…)
// =========================
// Au démarrage, lit `alert.json` à la racine du site (l'auteur l'édite côté serveur) et affiche les alertes actives.
// Format :
//   {
//     "active": true|false,
//     "alerts": [
//       { "id": "migration-2026", "level": "info" | "warning" | "emergency",
//         "title": "...", "message": "...", "details": [...], "released": "2026-05-15T12:00:00Z" },
//       ...
//     ]
//   }
// Ancien format mono-alerte ({ "active", "level", "title", … } sans `alerts[]`) toujours accepté : enveloppé en
// alerts:[{...}] avec un id généré (released, ou hash du titre).
// Priorité : emergency (rouge) > warning (orange) > info (bleu), puis released décroissant. 1 alerte → détail ;
// plusieurs → sélecteur, UN clic = UNE modale (décision produit). D'office (démarrage, relecture) : non acquittées,
// URGENCES D'ABORD — une urgence s'ouvre seule, même sur une information affichée, qui revient après (_recouvrir).
// Bouton 🚨 : TOUTES les alertes, acquittées comprises.
// Acquittement par alerte : localStorage["myktamap_alert_seen_<id>"] = released ; l'ancienne clé
// "myktamap_alert_seen" sert de repli aux alertes mono-format (id "legacy-*").
// API : window.AlertChecker = { check(), notifySplashEnded(), dismiss(id, ts), showCurrent(), getActiveAlerts(),
//   onChange(cb) }

(function() {
  "use strict";

  const ALERT_URL          = "alert.json";
  const LS_SEEN_LEGACY     = "myktamap_alert_seen";       // ancien format mono
  const LS_SEEN_PREFIX     = "myktamap_alert_seen_";       // nouveau format par id

  let _splashEnded     = false;
  let _pendingAlerts   = [];               // queue d'alertes à afficher après splash
  let _activeAlertsCache = [];             // dernier snapshot pour getActiveAlerts()
  const _changeListeners = [];             // callbacks pour MAJ badge
  // Alertes d'une EXTENSION (prise « alertes », KtaExtensions.alertesExtension) : mêmes champs, id « ext_… », champ
  // source. Fusionnées avec alert.json (même modale, même badge, même acquittement). Aucun appel réseau ici :
  // l'extension fournit sa liste (et sa copie hors ligne) et annonce un changement par mktm:alertes-changees.
  let _siteAlerts = [];                    // dernier alert.json lu (actif)
  let _extAlerts  = [];                    // dernière liste de l'extension
  const _montreesAuto = {};                // id → released déjà ouvert AUTOMATIQUEMENT (pas deux fois)
  async function _lireExtension() {
    if (!window.KtaExtensions || typeof window.KtaExtensions.alertesExtension !== "function") return [];
    try { return await window.KtaExtensions.alertesExtension(); } catch(e) { return []; }
  }
  function _toutes() { return _siteAlerts.concat(_extAlerts); }
  // Non acquittées et pas encore ouvertes d'office : une liste relue n'ouvre que les NOUVELLES alertes (ou une
  // alerte dont released a changé). Une modale d'alerte (ou le sélecteur) déjà ouverte : rien par-dessus
  // (afficherModaleAlerte refuserait), rien de marqué ; ce qui attend s'ouvre à sa fermeture (dismiss) — sauf une
  // urgence devant une information : l'information quitte l'écran (_recouvrir) et l'urgence s'ouvre tout de suite.
  // File : urgences d'abord, seules ; puis les recouvertes, puis le reste.
  // ⚠️ Urgence = level "emergency", strict (comme la vibration d'urgence) ; warning et info sont des informations.
  let _enAttente = false;
  // Alertes retirées de l'écran par une urgence sans « J'ai compris » : id → released. Elles reviennent après
  // l'urgence, même si l'extension les dit déjà vues (`vue` : l'accusé est parti à leur premier affichage) ; seul
  // l'acquittement de l'appareil (localStorage) les retire.
  const _recouvertes = {};
  let _onDoneRecouvert = null;             // fin du séquenceur de premier lancement d'une fenêtre recouverte
  function _urgence(a) { return !!a && a.level === "emergency"; }
  function _rel(a) { return String(a.released || ""); }
  function _modaleOuverte() {
    return !!(document.getElementById("kta-alert-modal") || document.getElementById("kta-alert-selector-modal"));
  }
  // 🩸 La fenêtre est retirée par sa propre fonction (interfaceAlerts.js > _ktaRecouvrir) : son _fermer appellerait
  // dismiss(id, released), donc l'acquitterait sans qu'on l'ait lue. Rend false si la fenêtre ouverte montre une
  // urgence (ou ne sait pas se retirer) : la nouvelle urgence attend alors son tour.
  function _recouvrir() {
    const m = document.getElementById("kta-alert-modal") || document.getElementById("kta-alert-selector-modal");
    const r = m && typeof m._ktaRecouvrir === "function" ? m._ktaRecouvrir() : null;
    if (!r) return false;
    (r.alertes || []).forEach(function(a) { if (a && a.id) _recouvertes[a.id] = _rel(a); });
    if (typeof r.onClose === "function") {
      const avant = _onDoneRecouvert, apres = r.onClose;
      _onDoneRecouvert = avant ? function() { avant(); apres(); } : apres;
    }
    return true;
  }
  function _prendreOnDone() { const f = _onDoneRecouvert; _onDoneRecouvert = null; return f; }
  function _aOuvrirDOffice(alerts) {
    const neuves = _filtrerEtTrier(alerts).filter(function(a) {
      return _montreesAuto[a.id] !== a.released && _recouvertes[a.id] !== _rel(a);
    });
    if (_modaleOuverte() && !(neuves.some(_urgence) && _recouvrir())) { _enAttente = true; return []; }
    const revenues = _toutes().filter(function(a) {
      return _recouvertes[a.id] === _rel(a) && !_urgence(a) && _getSeenForId(a.id) !== a.released;
    });
    const file = neuves.filter(_urgence).concat(revenues, neuves.filter(function(a) { return !_urgence(a); }));
    const urg = file.filter(_urgence);
    const l = urg.length > 0 ? urg : file;
    if (l.length < file.length) _enAttente = true;
    l.forEach(function(a) { _montreesAuto[a.id] = a.released; delete _recouvertes[a.id]; });
    return l;
  }

  // ── Normalisation ──────────
  // Ancien format mono-alerte → alerts[]. Rend { active: bool, alerts: [...] }.
  function _normaliserPayload(raw) {
    if (!raw || typeof raw !== "object") return { active: false, alerts: [] };

    if (Array.isArray(raw.alerts)) {
      const cleaned = raw.alerts
        .filter(function(a) { return a && typeof a === "object"; })
        .map(function(a) {
          // Id absent : généré depuis released ou title (acquittement unique).
          if (!a.id) {
            a.id = a.released ? ("auto-" + a.released) :
                   a.title    ? ("auto-" + a.title.replace(/[^a-z0-9]/gi, "_").slice(0, 40)) :
                   ("auto-" + Date.now());
          }
          return a;
        });
      return { active: !!raw.active, alerts: cleaned };
    }

    // Ancien format : enveloppé dans alerts: [{...}], id basé sur released.
    if (raw.title || raw.message || raw.level) {
      const single = {
        id:       raw.released ? ("legacy-" + raw.released) : "legacy-mono",
        level:    raw.level,
        title:    raw.title,
        message:  raw.message,
        details:  raw.details,
        released: raw.released
      };
      return { active: !!raw.active, alerts: [single] };
    }

    return { active: !!raw.active, alerts: [] };
  }

  // ── Filtrage et tri ──────────
  // Alertes non acquittées, par priorité puis released. Acquittée = sur cet appareil (localStorage), ou alerte
  // d'extension que l'extension dit déjà vue (`vue: true`, ce qu'elle sait ailleurs : un autre appareil du même compte).
  // ⚠️ `vue` n'est cru que pour un id « ext_ » (posé par KtaExtensions.alertesExtension) : alert.json n'en a pas.
  function _vueParExtension(a) { return a.vue === true && String(a.id || "").indexOf("ext_") === 0; }
  function _filtrerEtTrier(alerts) {
    const prioOrder = { emergency: 0, warning: 1, info: 2 };
    return alerts
      .filter(function(a) {
        if (_vueParExtension(a)) return false;
        const seen = _getSeenForId(a.id);
        return !(seen && seen === a.released);
      })
      .sort(function(a, b) {
        const pa = prioOrder[a.level] != null ? prioOrder[a.level] : 3;
        const pb = prioOrder[b.level] != null ? prioOrder[b.level] : 3;
        if (pa !== pb) return pa - pb;
        const ra = a.released || "";
        const rb = b.released || "";
        return rb.localeCompare(ra);
      });
  }

  // TOUTES les alertes actives, acquittées comprises (le badge 🚨 se colore selon le niveau max).
  function getActiveAlerts() {
    return _activeAlertsCache.slice();
  }

  // ── Acquittement ──────────
  function _getSeenForId(id) {
    if (!id) return null;
    try {
      const v = localStorage.getItem(LS_SEEN_PREFIX + id);
      if (v) return v;
      // Repli : ancienne clé mono pour les id "legacy-*".
      if (id.indexOf("legacy-") === 0) {
        return localStorage.getItem(LS_SEEN_LEGACY);
      }
      return null;
    } catch(e) { return null; }
  }

  function _setSeenForId(id, ts) {
    if (!id || !ts) return;
    try { localStorage.setItem(LS_SEEN_PREFIX + id, ts); } catch(e) {}
    if (id.indexOf("legacy-") === 0) {
      try { localStorage.setItem(LS_SEEN_LEGACY, ts); } catch(e) {}
    }
  }

  function dismiss(id, ts) {
    if (id && ts) _setSeenForId(id, ts);
    // Les listeners sont notifiés (getActiveAlerts + tri distinguent acquittées / non).
    _notifyChange();
    // Une alerte arrivée pendant que celle-ci était ouverte, ou recouverte par elle : à son tour (après le fondu de
    // fermeture). La fin du premier lancement d'une fenêtre recouverte part avec la dernière de la file.
    if (_enAttente) {
      _enAttente = false;
      setTimeout(function() {
        const l = _aOuvrirDOffice(_toutes());
        const fin = (_enAttente || _modaleOuverte()) ? null : _prendreOnDone();
        if (l.length > 0) _showOrDefer(l, fin);
        else if (fin) { try { fin(); } catch(e) {} }
      }, 300);
    }
  }

  // ── Affichage : sélecteur si N > 1, modale détail si N == 1 ──────────
  // `fromManualClick` (bouton 🚨) : toutes les alertes actives, acquittées comprises ; sinon (démarrage) les non
  // acquittées seulement.
  function _afficherAlertes(alertsAaffich, fromManualClick, onDone) {
    // onDone : fin pour le séquenceur de premier lancement (js/firstRunFlow.js), à la fermeture de la modale
    // (ou tout de suite s'il n'y a rien / cas multi non bloquant).
    const _od = function() { if (typeof onDone === "function") { try { onDone(); } catch(e) {} } };
    if (!alertsAaffich || alertsAaffich.length === 0) { _od(); return; }
    if (typeof window.afficherModaleAlerte !== "function") {
      console.warn("[AlertChecker] afficherModaleAlerte absente — alerte ignorée");
      _od();
      return;
    }
    // Vibration d'erreur seulement pour une alerte remontée automatiquement (démarrage, relecture), pas au clic
    // sur 🚨. Préférence et support gérés par le helper.
    if (!fromManualClick && window.kta_vibrate) {
      // Une alerte emergency vibre MÊME si la préférence de confort est coupée (classe urgence, cf. utils.js).
      const critique = alertsAaffich.some(function(a) { return a && a.level === "emergency"; });
      if (critique && window.kta_vibrate.urgence) window.kta_vibrate.urgence.error();
      else window.kta_vibrate.error();
    }

    // 1 alerte → modale détail, onDone câblé sur le onClose de afficherModaleAlerte(alert, onClose).
    if (alertsAaffich.length === 1) {
      window.afficherModaleAlerte(alertsAaffich[0], _od);
      return;
    }

    // Plusieurs → sélecteur.
    if (typeof window.afficherSelecteurAlertes !== "function") {
      // Repli si le sélecteur est absent.
      console.warn("[AlertChecker] afficherSelecteurAlertes absent — fallback modale détail 1ère alerte");
      window.afficherModaleAlerte(alertsAaffich[0], _od);
      return;
    }

    // Pas d'enchaînement après acquittement : fermer la modale ne rouvre ni le sélecteur ni la suivante ; pour une
    // autre alerte, nouveau clic sur 🚨 (« 1 clic = 1 alerte », décision produit).
    window.afficherSelecteurAlertes(alertsAaffich, {
      fromBoot: !fromManualClick,
      onSelect: function(chosen) {
        window.afficherModaleAlerte(chosen);
        // Pas de onClose : fermeture simple.
      }
    });
    // Cas multi : la file de premier lancement n'attend PAS l'acquittement (légal, visite guidée peuvent suivre
    // par-dessus le sélecteur).
    _od();
  }

  // 🩸 Pendant le splash, une liste relue S'AJOUTE à celle qui attend : la remplacer perdait les alertes déjà
  // marquées ouvertes d'office (elles ne revenaient qu'au bouton 🚨).
  function _showOrDefer(alertsAaffich, onDone) {
    if (_splashEnded) {
      _afficherAlertes(alertsAaffich, false, onDone);
    } else {
      const ids = alertsAaffich.map(function(a) { return a.id; });
      _pendingAlerts = _pendingAlerts.filter(function(a) { return ids.indexOf(a.id) < 0; }).concat(alertsAaffich);
      if (typeof onDone === "function") _onDoneRecouvert = onDone;
      console.log("[AlertChecker] " + _pendingAlerts.length + " alerte(s) différée(s) jusqu'à la fin du splash");
    }
  }

  function notifySplashEnded(onDone) {
    _splashEnded = true;
    if (_pendingAlerts.length > 0) {
      let list = _pendingAlerts;
      _pendingAlerts = [];
      // Urgences d'abord, ici aussi : le reste n'est pas encore marqué, il s'ouvrira à la fermeture (dismiss).
      const urg = list.filter(_urgence);
      if (urg.length > 0 && urg.length < list.length) {
        list.forEach(function(a) { if (!_urgence(a)) delete _montreesAuto[a.id]; });
        _enAttente = true;
        list = urg;
      }
      // Une file reste derrière : le premier lancement (légal, visite) attend qu'elle soit vidée.
      if (_enAttente && typeof onDone === "function") { _onDoneRecouvert = onDone; onDone = null; }
      _afficherAlertes(list, false, onDone);
    } else {
      // Rien à afficher : le séquenceur est notifié tout de suite.
      if (typeof onDone === "function") { try { onDone(); } catch(e) {} }
    }
  }

  // ── Listeners du badge ──────────
  function onChange(cb) {
    if (typeof cb === "function") _changeListeners.push(cb);
  }

  function _notifyChange() {
    _changeListeners.forEach(function(cb) {
      try { cb(); } catch(e) {}
    });
  }

  // Délai de 1500 ms (comme proLicense.js et updateChecker.js) : un réseau ou un serveur lent ne doit pas faire
  // traîner le fetch jusqu'au délai navigateur (~30 s) et retarder les modales différées.
  const FETCH_TIMEOUT_MS = 1500;

  // Fetch avec AbortController + cache-bust ; lève sur délai ou erreur HTTP, comme un fetch normal.
  async function _fetchAlertJson() {
    const url = ALERT_URL + "?_=" + Date.now();
    const opts = { cache: "no-store" };
    let timeoutId = null;
    if (typeof AbortController === "function") {
      const ctrl = new AbortController();
      timeoutId = setTimeout(function() {
        try { ctrl.abort(); } catch(e) {}
      }, FETCH_TIMEOUT_MS);
      opts.signal = ctrl.signal;
    }
    try {
      const resp = await fetch(url, opts);
      if (timeoutId) clearTimeout(timeoutId);
      return resp;
    } catch(e) {
      if (timeoutId) clearTimeout(timeoutId);
      throw e;
    }
  }

  // ── Check au démarrage ──────────
  async function check() {
    let raw, statutSite = null;
    try {
      const resp = await _fetchAlertJson();
      if (!resp.ok) statutSite = "no-alert";
      else raw = await resp.json();
    } catch(e) {
      console.log("[AlertChecker] Fetch échoué (offline ?) :", e.message);
      statutSite = "offline";
    }
    _siteAlerts = [];
    if (!statutSite) {
      const norm = _normaliserPayload(raw);
      if (!norm.active) { console.log("[AlertChecker] Aucune alerte active (active: false)"); statutSite = "inactive"; }
      else _siteAlerts = norm.alerts.slice();
    }
    _extAlerts = await _lireExtension();

    const toutes = _toutes();
    _activeAlertsCache = toutes.slice();
    _notifyChange();
    if (toutes.length === 0) return { status: statutSite || "inactive" };

    const aShown = _aOuvrirDOffice(toutes);
    if (aShown.length === 0) {
      console.log("[AlertChecker] Toutes les alertes actives sont déjà acquittées");
      return { status: "all-seen", alerts: toutes };
    }

    console.log("[AlertChecker] " + aShown.length + " alerte(s) à afficher (sur " + toutes.length + " active(s))");
    _showOrDefer(aShown);
    return { status: "shown", alerts: aShown };
  }

  // Liste de l'extension changée (alerte lancée, modifiée, terminée ; clés prêtes ; retour au premier plan) : badge
  // à jour, et les NOUVELLES alertes s'ouvrent comme au démarrage (après le splash).
  async function _relireExtension() {
    _extAlerts = await _lireExtension();
    _activeAlertsCache = _toutes();
    _notifyChange();
    const aShown = _aOuvrirDOffice(_extAlerts);
    if (aShown.length > 0) _showOrDefer(aShown);
  }
  window.addEventListener("mktm:alertes-changees", function() { _relireExtension(); });

  // ── Bouton 🚨 (affichage manuel) ──────────
  async function showCurrent() {
    let raw;
    let status = "ok";
    try {
      const resp = await _fetchAlertJson();
      if (resp.status === 404 || !resp.ok) {
        status = "no-alert";
      } else {
        raw = await resp.json();
      }
    } catch(e) {
      console.log("[AlertChecker] showCurrent fetch échoué :", e.message);
      status = "offline";
    }

    _siteAlerts = [];
    if (status === "ok" && raw) {
      const n = _normaliserPayload(raw);
      if (n.active) _siteAlerts = n.alerts.slice();
    }
    _extAlerts = await _lireExtension();
    const toutes = _toutes();
    if (toutes.length > 0) {
      // Sélecteur (N > 1) ou modale (N = 1) ; fromManualClick=true → acquittées comprises (l'utilisateur demande à les
      // revoir). Site et extension mêlés.
      const sorted = toutes.slice().sort(function(a, b) {
        const prio = { emergency: 0, warning: 1, info: 2 };
        const pa = prio[a.level] != null ? prio[a.level] : 3;
        const pb = prio[b.level] != null ? prio[b.level] : 3;
        if (pa !== pb) return pa - pb;
        return (b.released || "").localeCompare(a.released || "");
      });
      _afficherAlertes(sorted, true);  // true = fromManualClick
      _activeAlertsCache = toutes.slice();
      _notifyChange();
      return { status: "shown", alerts: sorted };
    }
    if (status === "ok") status = "no-alert";
    _activeAlertsCache = [];
    _notifyChange();

    if (typeof window.afficherModaleAlerteAbsente === "function") {
      window.afficherModaleAlerteAbsente(status);
    }
    return { status: status };
  }

  window.AlertChecker = {
    check:              check,
    notifySplashEnded:  notifySplashEnded,
    dismiss:            dismiss,
    showCurrent:        showCurrent,
    getActiveAlerts:    getActiveAlerts,
    onChange:           onChange
  };
})();
