/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// ALERT CHECKER — diffusion d'alertes publiques (incendie, fermeture, migration, etc.)
// =========================
// À chaque boot, fetch `alert.json` à la racine du site.
// Affiche une (ou plusieurs) modales d'alerte à l'utilisateur si actives.
// L'auteur active/désactive en éditant `alert.json` côté serveur.
//
// FORMAT alert.json (v163+, multi-alertes)
//   {
//     "active": true|false,
//     "alerts": [
//       {
//         "id":      "migration-myktamap-fr-2026",
//         "level":   "info" | "warning" | "emergency",
//         "title":   "...",
//         "message": "...",
//         "details": [...],
//         "released": "2026-05-15T12:00:00Z"
//       },
//       ...
//     ]
//   }
//
// RETRO-COMPAT — ancien format mono-alerte (v144-v162) toujours supporté :
//   {
//     "active": true,
//     "level":  "emergency",
//     "title":  "...",
//     ...
//   }
//   → Détecté via absence de champ `alerts[]` → wrappé en alerts:[{...}] avec
//     un id généré (= released, ou hash du title si absent).
//
// PRIORITE D'AFFICHAGE
//   emergency (rouge) > warning (orange) > info (bleu), puis tri par released
//   descendant (plus récent en haut).
//
// AFFICHAGE — sélecteur si N>1, modale détail si N=1 (depuis v166)
//   - 1 seule alerte : modale détail direct
//   - Plusieurs alertes : sélecteur (liste classée par criticité), l'user
//     choisit ce qui l'intéresse. UN click = UNE modale détail (v167+).
//     Pas de cascade auto après acquit — l'user re-clique 🚨 pour voir une
//     autre alerte (le sélecteur réapparaît avec ce qui reste).
//   - L'user peut fermer le sélecteur (✕ / Échap / backdrop) sans rien lire.
//
//   Mode "click bouton 🚨" (manuel) : sélecteur affiche TOUTES les alertes
//   actives même acquittées (badge "✓ acquittée" sur celles déjà lues).
//   Mode "boot post-splash" : sélecteur n'affiche QUE les non acquittées.
//
// ACQUITTEMENT INDIVIDUEL
//   localStorage["myktamap_alert_seen_<id>"] = released timestamp
//   → permet d'acquitter migration sans toucher à incendie, et vice-versa.
//
// MIGRATION DEPUIS v162 (single seen)
//   L'ancienne clé localStorage["myktamap_alert_seen"] est conservée et
//   utilisée comme fallback pour les alertes sans `id` (= cas mono-alerte
//   rétro-compat). Aucun reset au passage v163.
//
// API exposée :
//   - window.AlertChecker.check()             — appelé au boot, scan + cascade
//   - window.AlertChecker.notifySplashEnded() — appelé après le splash
//   - window.AlertChecker.dismiss(id, ts)     — acquitte une alerte par id
//   - window.AlertChecker.showCurrent()       — force re-affichage (bouton 🚨)
//   - window.AlertChecker.getActiveAlerts()   — pour le badge dynamique
//   - window.AlertChecker.onChange(cb)        — listener pour MAJ badge
// =========================

(function() {
  "use strict";

  const ALERT_URL          = "alert.json";
  const LS_SEEN_LEGACY     = "myktamap_alert_seen";       // ancien format mono
  const LS_SEEN_PREFIX     = "myktamap_alert_seen_";       // nouveau format par id

  let _splashEnded     = false;
  let _pendingAlerts   = [];               // queue d'alertes à afficher après splash
  let _activeAlertsCache = [];             // dernier snapshot pour getActiveAlerts()
  const _changeListeners = [];             // callbacks pour MAJ badge

  // =========================
  // NORMALISATION
  // =========================
  // Convertit l'ancien format mono-alerte en nouveau format alerts[].
  // Retourne { active: bool, alerts: [...] }.
  function _normaliserPayload(raw) {
    if (!raw || typeof raw !== "object") return { active: false, alerts: [] };

    // Nouveau format : { active, alerts: [...] }
    if (Array.isArray(raw.alerts)) {
      const cleaned = raw.alerts
        .filter(function(a) { return a && typeof a === "object"; })
        .map(function(a) {
          // Si id absent, on le génère depuis released ou title (pour acquit unique)
          if (!a.id) {
            a.id = a.released ? ("auto-" + a.released) :
                   a.title    ? ("auto-" + a.title.replace(/[^a-z0-9]/gi, "_").slice(0, 40)) :
                   ("auto-" + Date.now());
          }
          return a;
        });
      return { active: !!raw.active, alerts: cleaned };
    }

    // Ancien format mono : { active, level, title, message, ... }
    // → wrap dans alerts: [{...}] avec id basé sur released
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

  // =========================
  // FILTRAGE & TRI
  // =========================
  // Retourne les alertes non acquittées, triées par priorité puis released.
  function _filtrerEtTrier(alerts) {
    const prioOrder = { emergency: 0, warning: 1, info: 2 };
    return alerts
      .filter(function(a) {
        const seen = _getSeenForId(a.id);
        return !(seen && seen === a.released);
      })
      .sort(function(a, b) {
        const pa = prioOrder[a.level] != null ? prioOrder[a.level] : 3;
        const pb = prioOrder[b.level] != null ? prioOrder[b.level] : 3;
        if (pa !== pb) return pa - pb;
        // Même priorité → released descendant (plus récent en premier)
        const ra = a.released || "";
        const rb = b.released || "";
        return rb.localeCompare(ra);
      });
  }

  // Retourne TOUTES les alertes actives (pour le badge, sans filtrer les acquittées).
  // Sert au badge 🚨 dynamique qui colore selon le niveau max.
  function getActiveAlerts() {
    return _activeAlertsCache.slice();
  }

  // =========================
  // ACQUITTEMENT
  // =========================
  function _getSeenForId(id) {
    if (!id) return null;
    try {
      const v = localStorage.getItem(LS_SEEN_PREFIX + id);
      if (v) return v;
      // Fallback rétro-compat : ancienne clé mono pour les id "legacy-*"
      if (id.indexOf("legacy-") === 0) {
        return localStorage.getItem(LS_SEEN_LEGACY);
      }
      return null;
    } catch(e) { return null; }
  }

  function _setSeenForId(id, ts) {
    if (!id || !ts) return;
    try { localStorage.setItem(LS_SEEN_PREFIX + id, ts); } catch(e) {}
    // Pour les legacy-mono, on update aussi l'ancienne clé pour cohérence
    if (id.indexOf("legacy-") === 0) {
      try { localStorage.setItem(LS_SEEN_LEGACY, ts); } catch(e) {}
    }
  }

  function dismiss(id, ts) {
    if (id && ts) _setSeenForId(id, ts);
    // Met à jour le cache (alerte enlevée des "non acquittées")
    // Le cache _activeAlertsCache reste comme avant — c'est getActiveAlerts +
    // tri qui distingue acquittées/non. Mais on notifie les listeners.
    _notifyChange();
  }

  // =========================
  // AFFICHAGE — sélecteur si N > 1, modale détail si N == 1
  // =========================
  // v166 : remplace l'ancienne cascade automatique (qui enchaînait les modales
  // sans laisser le choix à l'user) par un sélecteur quand N > 1. L'user voit
  // la liste classée par criticité, choisit ce qui l'intéresse. Après acquit
  // d'une alerte, si d'autres restent non acquittées → re-ouvre le sélecteur.
  //
  // `fromManualClick` : si true (click bouton 🚨), affiche TOUTES les alertes
  // actives même acquittées dans le sélecteur. Si false (boot post-splash),
  // ne montre que les non acquittées.
  function _afficherAlertes(alertsAaffich, fromManualClick, onDone) {
    // 🆕 v1.56.0 — onDone : signal de fin pour le séquenceur de premier
    // lancement (js/firstRunFlow.js). Appelé à la fermeture de la modale
    // d'alerte (ou immédiatement s'il n'y a rien / cas multi non bloquant).
    const _od = function() { if (typeof onDone === "function") { try { onDone(); } catch(e) {} } };
    if (!alertsAaffich || alertsAaffich.length === 0) { _od(); return; }
    if (typeof window.afficherModaleAlerte !== "function") {
      console.warn("[AlertChecker] afficherModaleAlerte absente — alerte ignorée");
      _od();
      return;
    }
    // 🆕 v1.34.27 — Vibration haptique error pour signaler l'alerte serveur.
    // Pas pour fromManualClick (= l'user a cliqué le bouton 🚨, il sait déjà
    // qu'il va voir des alertes). Seulement quand l'app remonte une alerte
    // automatiquement (au boot ou sur poll). Pref + support gérés par helper.
    if (!fromManualClick && window.kta_vibrate) {
      // 🚨 13/09/2026 : une alerte de niveau emergency vibre MÊME si la
      // préférence de confort est OFF (classe urgence, cf utils.js).
      const critique = alertsAaffich.some(function(a) { return a && a.level === "emergency"; });
      if (critique && window.kta_vibrate.urgence) window.kta_vibrate.urgence.error();
      else window.kta_vibrate.error();
    }

    // Cas simple : 1 seule alerte → modale détail direct.
    // onDone câblé sur le onClose natif de afficherModaleAlerte(alert, onClose).
    if (alertsAaffich.length === 1) {
      window.afficherModaleAlerte(alertsAaffich[0], _od);
      return;
    }

    // Cas multi : sélecteur. L'user choisit. À l'acquit d'une, on rouvre le
    // sélecteur s'il reste des non-acquittées (en mode boot uniquement).
    if (typeof window.afficherSelecteurAlertes !== "function") {
      // Fallback si le sélecteur est absent (vieille version interface.js)
      console.warn("[AlertChecker] afficherSelecteurAlertes absent — fallback modale détail 1ère alerte");
      window.afficherModaleAlerte(alertsAaffich[0], _od);
      return;
    }

    // v167 : SUPPRESSION de la cascade auto après acquit. Le close de la
    // modale détail ne re-ouvre PAS le sélecteur ni la modale suivante.
    // L'user qui veut voir une autre alerte re-clique 🚨 → sélecteur
    // réapparaît avec les alertes restantes. Comportement plus prévisible :
    // "1 click = 1 alerte affichée".
    //
    // Avant v167 : enchaînait automatiquement les modales après acquit
    // ("il m'ouvre les deux" remonté par KARMA), trop intrusif.
    window.afficherSelecteurAlertes(alertsAaffich, {
      fromBoot: !fromManualClick,
      onSelect: function(chosen) {
        window.afficherModaleAlerte(chosen);
        // PAS de callback onClose → fermeture simple, pas de re-déclenchement
      }
    });
    // 🆕 v1.56.0 — cas multi : on ne bloque PAS la file de premier lancement sur
    // l'acquittement (l'user gère via le sélecteur / bouton 🚨). La suite de la
    // séquence (légal, onboarding, PIN) peut s'enchaîner par-dessus le sélecteur.
    _od();
  }

  function _showOrDefer(alertsAaffich) {
    if (_splashEnded) {
      _afficherAlertes(alertsAaffich, false);
    } else {
      _pendingAlerts = alertsAaffich;
      console.log("[AlertChecker] " + alertsAaffich.length + " alerte(s) différée(s) jusqu'à la fin du splash");
    }
  }

  function notifySplashEnded(onDone) {
    _splashEnded = true;
    if (_pendingAlerts.length > 0) {
      const list = _pendingAlerts;
      _pendingAlerts = [];
      _afficherAlertes(list, false, onDone);
    } else {
      // 🆕 v1.56.0 — rien à afficher : notifie tout de suite le séquenceur.
      if (typeof onDone === "function") { try { onDone(); } catch(e) {} }
    }
  }

  // =========================
  // LISTENERS POUR LE BADGE
  // =========================
  function onChange(cb) {
    if (typeof cb === "function") _changeListeners.push(cb);
  }

  function _notifyChange() {
    _changeListeners.forEach(function(cb) {
      try { cb(); } catch(e) {}
    });
  }

  // 🚀 v1.30.0 (P6.A boot fetch timeout) : timeout 1500ms aligné avec
  // proLicense.js + updateChecker.js. Évite qu'un réseau lent (ou un
  // serveur lent à répondre sur /alert.json) laisse le fetch traîner
  // jusqu'au timeout browser (~30 s) et retarde le flush des modales
  // différées. 1500 ms = compromis offline-fail-fast / online-success.
  const FETCH_TIMEOUT_MS = 1500;

  // Helper interne : fetch avec AbortController + cache-bust. Throw
  // standard si timeout ou erreur HTTP, comme un fetch normal.
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

  // =========================
  // CHECK AU BOOT
  // =========================
  async function check() {
    let raw;
    try {
      const resp = await _fetchAlertJson();
      if (!resp.ok) {
        _activeAlertsCache = [];
        _notifyChange();
        return { status: "no-alert" };
      }
      raw = await resp.json();
    } catch(e) {
      console.log("[AlertChecker] Fetch échoué (offline ?) :", e.message);
      _activeAlertsCache = [];
      _notifyChange();
      return { status: "offline" };
    }

    const norm = _normaliserPayload(raw);
    if (!norm.active) {
      console.log("[AlertChecker] Aucune alerte active (active: false)");
      _activeAlertsCache = [];
      _notifyChange();
      return { status: "inactive" };
    }

    _activeAlertsCache = norm.alerts.slice();
    _notifyChange();

    const aShown = _filtrerEtTrier(norm.alerts);
    if (aShown.length === 0) {
      console.log("[AlertChecker] Toutes les alertes actives sont déjà acquittées");
      return { status: "all-seen", alerts: norm.alerts };
    }

    console.log("[AlertChecker] " + aShown.length + " alerte(s) à afficher (sur " + norm.alerts.length + " active(s))");
    _showOrDefer(aShown);
    return { status: "shown", alerts: aShown };
  }

  // =========================
  // SHOW CURRENT (bouton 🚨 manuel)
  // =========================
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

    if (status === "ok" && raw) {
      const norm = _normaliserPayload(raw);
      if (norm.active && norm.alerts.length > 0) {
        // v166 : si N>1, affiche un SELECTEUR (au lieu de la cascade auto).
        // Si N=1, modale détail direct. fromManualClick=true → TOUTES les
        // alertes visibles dans le sélecteur même acquittées (= l'user a
        // explicitement demandé à les revoir).
        const sorted = norm.alerts.slice().sort(function(a, b) {
          const prio = { emergency: 0, warning: 1, info: 2 };
          const pa = prio[a.level] != null ? prio[a.level] : 3;
          const pb = prio[b.level] != null ? prio[b.level] : 3;
          if (pa !== pb) return pa - pb;
          return (b.released || "").localeCompare(a.released || "");
        });
        _afficherAlertes(sorted, true);  // true = fromManualClick
        // MAJ cache et badge
        _activeAlertsCache = norm.alerts.slice();
        _notifyChange();
        return { status: "shown", alerts: sorted };
      } else {
        status = "no-alert";
        _activeAlertsCache = [];
        _notifyChange();
      }
    }

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
