/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// swInspector.js — inspecteur du cache PWA : compare ce qui DEVRAIT être en cache (ASSETS_TO_CACHE +
// CRITICAL_APP_SHELL de sw.js) à ce qui Y EST, avec la cause des échecs d'installation, et récupère les
// manquants. Lecture seule hors l'action « Récupérer les fichiers manquants ».
// Modale : ⚙️ Configuration → 🛠️ Mode Développeur (js/devMode.js). Pour tous : pastille « hors-ligne » de
// l'accueil (homeConfig.js) via etat() / recuperer(), et auto-réparation silencieuse au boot.
// Expose : window.SwInspector (ouvrir, fermer, autoHealIfNeeded, etat, recuperer).
// Garde-fou : scripts/check-modal-lifecycle.js

(function() {
  "use strict";

  if (typeof window._loadCssOnce === "function") {
    window._loadCssOnce("css/style-meminspector.css", "kta-css-style-meminspector");
  }

  const MODAL_ID = "kta-sw-inspector-modal";

  function _escapeHtml(s) { return window.ktaEsc(s); }

  // Appelé au rendu seulement, jamais au chargement : les dicos sont prêts.
  function _t(key, params) {
    return (window.I18n && typeof window.I18n.t === "function")
      ? window.I18n.t("swinsp." + key, params)
      : key;
  }

  // URL ou chemin d'asset → pathname, pour comparer "./js/main.js" (liste) et "https://…/js/main.js" (clé de cache).
  function _normalize(urlLike) {
    try {
      if (!urlLike) return "";
      let s = String(urlLike);
      if (/^https?:\/\//.test(s)) {
        try { s = new URL(s).pathname; } catch(e) {}
      }
      s = s.replace(/^\.\//, "/");
      if (!s.startsWith("/")) s = "/" + s;
      s = s.split("?")[0].split("#")[0];
      return s;
    } catch(e) { return String(urlLike || ""); }
  }

  // ── Questions au SW (MessageChannel) et à la Cache API ──────────────
  function _querySwExpectedAssets() {
    return new Promise(function(resolve, reject) {
      if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        reject(new Error(_t("err.swInactive")));
        return;
      }
      const channel = new MessageChannel();
      const timeoutId = setTimeout(function() { // lint-ok-modal-lifecycle (query IDB SW hors modale)
        reject(new Error(_t("err.timeout")));
      }, 3000);
      channel.port1.onmessage = function(event) {
        clearTimeout(timeoutId);
        const data = event.data || {};
        if (data.type === "EXPECTED_ASSETS") {
          resolve({
            cacheName: data.cacheName || null,
            assets:    Array.isArray(data.assets)   ? data.assets   : [],
            critical:  Array.isArray(data.critical) ? data.critical : []
          });
        } else {
          reject(new Error(_t("err.unexpected", { type: data.type })));
        }
      };
      try {
        navigator.serviceWorker.controller.postMessage({ type: "GET_EXPECTED_ASSETS" }, [channel.port2]);
      } catch(e) {
        clearTimeout(timeoutId);
        reject(e);
      }
    });
  }

  // Échecs d'installation journalisés par sw.js > _cacheAddDiag (IDB myktamap_sw_install_log/install_failures) :
  // [{ asset, type ∈ 404|5xx|4xx|network|quota|parse|unknown, status, message, timestamp, phase }].
  function _querySwInstallFailures() {
    return new Promise(function(resolve) {
      if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        resolve([]); return;
      }
      const channel = new MessageChannel();
      const timeoutId = setTimeout(function() { resolve([]); }, 3000); // lint-ok-modal-lifecycle (query IDB SW hors modale)
      channel.port1.onmessage = function(event) {
        clearTimeout(timeoutId);
        const data = event.data || {};
        resolve(Array.isArray(data.failures) ? data.failures : []);
      };
      try {
        navigator.serviceWorker.controller.postMessage(
          { type: "GET_INSTALL_FAILURES" }, [channel.port2]);
      } catch(e) {
        clearTimeout(timeoutId);
        resolve([]);
      }
    });
  }

  async function _queryActualAssets(cacheName) {
    if (!("caches" in window)) throw new Error(_t("err.noCacheApi"));
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    return requests.map(function(r) { return r.url; });
  }

  // → { present, missing (attendu, absent), unexpected (en cache, non attendu : cache dynamique, tuiles…) }
  function _computeDiff(expected, actual) {
    const expectedNormalized = expected.map(_normalize);
    const actualNormalized   = actual.map(_normalize);
    const actualSet   = new Set(actualNormalized);
    const expectedSet = new Set(expectedNormalized);
    const present    = [];
    const missing    = [];
    const unexpected = [];
    expected.forEach(function(asset, i) {
      if (actualSet.has(expectedNormalized[i])) present.push(asset);
      else missing.push(asset);
    });
    actual.forEach(function(url, i) {
      if (!expectedSet.has(actualNormalized[i])) unexpected.push(url);
    });
    return { present: present, missing: missing, unexpected: unexpected };
  }

  function _refetchMissing(missing) {
    return new Promise(function(resolve, reject) {
      if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        reject(new Error(_t("err.swInactiveShort")));
        return;
      }
      const channel = new MessageChannel();
      const timeoutId = setTimeout(function() { // lint-ok-modal-lifecycle (query IDB SW hors modale)
        reject(new Error(_t("err.timeoutRefetch")));
      }, 30000);
      channel.port1.onmessage = function(event) {
        clearTimeout(timeoutId);
        const data = event.data || {};
        if (data.type === "REFETCH_DONE") resolve(data);
        else reject(new Error(_t("err.unexpected", { type: data.type })));
      };
      try {
        navigator.serviceWorker.controller.postMessage({
          type:   "REFETCH_MISSING_ASSETS",
          assets: missing
        }, [channel.port2]);
      } catch(e) {
        clearTimeout(timeoutId);
        reject(e);
      }
    });
  }

  // ── Rapport ──────────────
  // Par type d'échec, de quoi dire POURQUOI un fichier manque (dépôt partiel = 404, serveur = 5xx, réseau…).
  // icône / couleur ici ; libellé traduit au rendu (swinsp.fail.<type>).
  const FAILURE_META = {
    "404":     { icon: "🚫", color: "#f4c542" },
    "5xx":     { icon: "🔥", color: "#f46b6b" },
    "4xx":     { icon: "🚧", color: "#f4c542" },
    "network": { icon: "📡", color: "#8cb4ff" },
    "quota":   { icon: "💾", color: "#f46b6b" },
    "parse":   { icon: "⚠️", color: "#f4c542" },
    "unknown": { icon: "❓", color: "#8892a4" }
  };

  function _failureLabel(type) {
    const meta = FAILURE_META[type] || FAILURE_META.unknown;
    const safeType = FAILURE_META[type] ? type : "unknown";
    return { icon: meta.icon, color: meta.color, label: _t("fail." + safeType) };
  }

  function _renderReport(diff, cacheName, failures) {
    failures = Array.isArray(failures) ? failures : [];
    const failureByAsset = {};
    failures.forEach(function(f) { failureByAsset[f.asset] = f; });
    const failureCounts = {};
    failures.forEach(function(f) {
      const t = f.type || "unknown";
      failureCounts[t] = (failureCounts[t] || 0) + 1;
    });

    const total      = diff.present.length + diff.missing.length;
    const presentPct = total > 0 ? Math.round(100 * diff.present.length / total) : 100;
    let html = "";

    // Verdict en tête.
    if (diff.missing.length === 0) {
      html +=
        '<div class="kta-mem-section" style="border-color:var(--kta-ok-bord); background:var(--kta-ok-fond);">' +
          '<div class="kta-mem-section-titre" style="color:#a6d785;">' + _t("verdict.ok.titre") + '</div>' +
          '<div class="kta-mem-line">' + _t("verdict.ok.line", { count: diff.present.length, cache: '<code>' + _escapeHtml(cacheName) + '</code>' }) + '</div>' +
        '</div>';
    } else {
      html +=
        '<div class="kta-mem-section" style="border-color:var(--kta-erreur-bord); background:var(--kta-erreur-fond);">' +
          '<div class="kta-mem-section-titre" style="color:#f46b6b;">' + _t("verdict.ko.titre") + '</div>' +
          '<div class="kta-mem-line">' + _t("verdict.ko.line", { count: diff.missing.length, total: total, cache: '<code>' + _escapeHtml(cacheName) + '</code>' }) + '</div>' +
          '<div class="kta-mem-line">' + _t("verdict.ko.coverage", { pct: presentPct, present: diff.present.length, total: total }) + '</div>' +
          '<div style="margin-top:10px;">' +
            '<button type="button" id="kta-sw-inspector-refetch" class="kta-btn kta-btn-primary" style="font-size:13px; padding:8px 14px;">' +
              _t("btn.refetch", { count: diff.missing.length }) +
            '</button>' +
            '<span id="kta-sw-inspector-refetch-status" style="margin-left:10px; font-size:12px; color:var(--kta-texte-3);"></span>' +
          '</div>' +
        '</div>';
    }

    // Manquants, avec leur cause si elle est connue.
    if (diff.missing.length > 0) {
      html +=
        '<div class="kta-mem-section">' +
          '<div class="kta-mem-section-titre">' + _t("missing.titre", { count: diff.missing.length }) + '</div>' +
          '<div class="kta-mem-line kta-mem-dim">' + _t("missing.hint") + '</div>' +
          '<div class="kta-sw-inspector-scrollbox" style="max-height:240px; font-size:11.5px;">' +
            diff.missing.map(function(a) {
              const fail = failureByAsset[a];
              if (fail) {
                const lab = _failureLabel(fail.type);
                return '<div>' + _escapeHtml(a) +
                       ' <span style="color:' + lab.color + '; font-family:sans-serif; font-size:11px;">' +
                       lab.icon + ' ' + lab.label +
                       (fail.status ? ' (' + fail.status + ')' : '') +
                       '</span></div>';
              }
              return '<div>' + _escapeHtml(a) +
                     ' <span style="color:var(--kta-texte-3); font-family:sans-serif; font-size:11px;">' + _t("missing.causeUnknown") + '</span></div>';
            }).join('') +
          '</div>' +
        '</div>';
    }

    // Échecs par type, même si chaque manquant a déjà sa cause : la vue d'ensemble oriente le diagnostic.
    if (failures.length > 0) {
      const orderedTypes = ["404", "5xx", "4xx", "network", "quota", "parse", "unknown"];
      const statsLine = orderedTypes
        .filter(function(t) { return failureCounts[t] > 0; })
        .map(function(t) {
          const lab = _failureLabel(t);
          const safeType = FAILURE_META[t] ? t : "unknown";
          return '<span style="color:' + lab.color + '; margin-right:14px; white-space:nowrap;">' +
                 lab.icon + ' <b>' + failureCounts[t] + '</b> ' + _t("failStat." + safeType) +
                 '</span>';
        }).join('');
      const ftpPartial = (failureCounts["404"] || 0) > 0;
      const networkIssue = (failureCounts["network"] || 0) > 0;
      let interpretation = '';
      if (ftpPartial && !networkIssue) {
        interpretation = _t("diag.ftp");
      } else if (networkIssue && !ftpPartial) {
        interpretation = _t("diag.network");
      } else if (ftpPartial && networkIssue) {
        interpretation = _t("diag.mixed");
      } else if ((failureCounts["quota"] || 0) > 0) {
        interpretation = _t("diag.quota");
      }
      html +=
        '<div class="kta-mem-section" style="border-color:var(--kta-info-bord-fort); background:var(--kta-info-fond);">' +
          '<div class="kta-mem-section-titre" style="color:var(--kta-interaction);">' + _t("failures.titre", { count: failures.length }) + '</div>' +
          '<div class="kta-mem-line">' + statsLine + '</div>' +
          (interpretation
            ? '<div class="kta-mem-line" style="margin-top:8px; font-size:12.5px;">' + interpretation + '</div>'
            : ''
          ) +
        '</div>';
    }

    // Présents (repliés), puis inattendus (cache dynamique : tuiles, plans…).
    html +=
      '<details class="kta-mem-section">' +
        '<summary class="kta-mem-section-titre" style="cursor:pointer;">' + _t("present.titre", { count: diff.present.length }) + '</summary>' +
        '<div class="kta-sw-inspector-scrollbox" style="font-size:11.5px;">' +
          diff.present.map(function(a) { return _escapeHtml(a); }).join('<br>') +
        '</div>' +
      '</details>';

    if (diff.unexpected.length > 0) {
      html +=
        '<details class="kta-mem-section">' +
          '<summary class="kta-mem-section-titre" style="cursor:pointer;">' + _t("dynamic.titre", { count: diff.unexpected.length }) + '</summary>' +
          '<div class="kta-mem-line kta-mem-dim" style="margin-top:8px;">' +
            _t("dynamic.hint", { cap: 800 }) +
          '</div>' +
          '<div class="kta-sw-inspector-scrollbox" style="font-size:11px;">' +
            diff.unexpected.slice(0, 100).map(function(u) {
              try { return _escapeHtml(new URL(u).pathname); } catch(e) { return _escapeHtml(u); }
            }).join('<br>') +
            (diff.unexpected.length > 100 ? '<br><i>' + _t("dynamic.more", { count: (diff.unexpected.length - 100) }) + '</i>' : '') +
          '</div>' +
        '</details>';
    }

    return html;
  }

  // ── Modale ──────────────
  function _buildModalHtml() {
    return ''
      + '<div class="kta-readme-modal-boite" style="max-width:780px; width:95vw; max-height:90vh; display:flex; flex-direction:column;">'
      +   '<div class="kta-readme-modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid rgba(255,255,255,0.1);">'
      +     '<span class="kta-readme-modal-titre">' + _t("titre") + '</span>'
      +     '<button type="button" id="kta-sw-inspector-close" aria-label="' + _t("close") + '" style="background:none; border:none; color:var(--kta-texte); font-size:24px; cursor:pointer; padding:0 6px;">×</button>'
      +   '</div>'
      +   '<div class="kta-readme-modal-contenu" id="kta-sw-inspector-body" style="flex:1 1 auto; overflow-y:auto; padding:16px 18px; font-size:13px; color:var(--kta-texte-2); line-height:1.5;">'
      +     '<div style="text-align:center; padding:30px;">' + _t("loading") + '</div>'
      +   '</div>'
      + '</div>';
  }

  let _currentDiff = null;
  let _currentCacheName = null;
  let _lc = null;   // ModalLifecycle de la modale

  async function _collectAndRender(bodyEl) {
    try {
      // _lc.guard lève ModalClosedError si la modale se ferme pendant un await.
      const guard = _lc ? function(p) { return _lc.guard(p); } : function(p) { return p; };
      const expected = await guard(_querySwExpectedAssets());
      const actual   = await guard(_queryActualAssets(expected.cacheName));
      const diff     = _computeDiff(expected.assets, actual);
      const failures = await guard(_querySwInstallFailures());
      _currentDiff = diff;
      _currentCacheName = expected.cacheName;
      bodyEl.innerHTML = _renderReport(diff, expected.cacheName, failures);
      const btn = document.getElementById("kta-sw-inspector-refetch");
      if (btn && _lc) _lc.on(btn, "click", _handleRefetchClick);
    } catch(e) {
      if (e && e.name === "ModalClosedError") return;
      if (!bodyEl.isConnected) return;
      bodyEl.innerHTML =
        '<div class="kta-mem-section" style="border-color:var(--kta-erreur-bord); background:var(--kta-erreur-fond);">' +
          '<div class="kta-mem-section-titre" style="color:#f46b6b;">' + _t("error.titre") + '</div>' +
          '<div class="kta-mem-line">' + _escapeHtml(e.message || String(e)) + '</div>' +
          '<div class="kta-mem-line kta-mem-dim" style="margin-top:6px;">' +
            _t("error.hint", { link: '<a href="/killsw.html" style="color:var(--kta-interaction);">' + _t("error.resetLink") + '</a>' }) +
          '</div>' +
        '</div>';
    }
  }

  async function _handleRefetchClick() {
    if (!_currentDiff || !_currentDiff.missing || _currentDiff.missing.length === 0) return;
    const btn    = document.getElementById("kta-sw-inspector-refetch");
    const status = document.getElementById("kta-sw-inspector-refetch-status");
    // lockButton : disabled + libellé, rendus par release().
    const release = (_lc && btn) ? _lc.lockButton(btn, { text: _t("refetch.running") }) : function() {};
    if (status) status.textContent = _t("refetch.downloading");
    try {
      const refetchP = _refetchMissing(_currentDiff.missing);
      const result = await (_lc ? _lc.guard(refetchP) : refetchP);
      const okCount   = (result.results || []).filter(function(r) { return r.ok; }).length;
      const failCount = (result.results || []).length - okCount;
      if (status && status.isConnected) {
        status.textContent = _t("refetch.okCount", { count: okCount }) +
                             (failCount > 0 ? " · " + _t("refetch.failCount", { count: failCount }) : "");
        status.style.color = failCount > 0 ? "#f4c542" : "#a6d785";
      }
      // Minuteur suivi par _lc : annulé si la modale se ferme avant la re-vérification.
      const scheduleReload = function() {
        const bodyEl = document.getElementById("kta-sw-inspector-body");
        if (bodyEl) {
          bodyEl.innerHTML = '<div style="text-align:center; padding:30px;">' + _t("refetch.recheck") + '</div>';
          _collectAndRender(bodyEl);
        }
      };
      if (_lc) _lc.setTimeout(scheduleReload, 1500);
      else     setTimeout(scheduleReload, 1500); // lint-ok-modal-lifecycle (fallback si _lc null)
    } catch(e) {
      if (e && e.name === "ModalClosedError") return;
      release({ text: _t("refetch.retry") });
      if (status && status.isConnected) {
        status.textContent = "❌ " + (e.message || String(e));
        status.style.color = "#f46b6b";
      }
    }
  }

  function ouvrir() {
    fermer();
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.style.zIndex = "99999";
    overlay.innerHTML = _buildModalHtml();
    document.documentElement.appendChild(overlay);

    // Écouteurs (croix, fond, Échap) retirés par ModalLifecycle à la fermeture.
    _lc = window.ModalLifecycle.attach(overlay, {
      label: "SwInspector",
      onClose: function() {
        _currentDiff = null;
        _currentCacheName = null;
      }
    });
    const closeBtn = overlay.querySelector("#kta-sw-inspector-close");
    if (closeBtn) _lc.on(closeBtn, "click", fermer);
    _lc.bindBackdropClick(fermer);
    _lc.bindEscape(fermer);

    const bodyEl = document.getElementById("kta-sw-inspector-body");
    if (bodyEl) _collectAndRender(bodyEl);
  }

  function fermer() {
    if (_lc) { _lc.close(); _lc = null; }
    const el = document.getElementById(MODAL_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ── Auto-réparation silencieuse au boot ──────────────
  // Lancée par index.html ~5 s après le chargement. Conditions : en ligne, SW contrôleur, pas d'incognito
  // (aucune requête sortante), pas déjà réussie cette session ; 100 requêtes au plus sur un cache cassé.
  // Résultat : console + événement `kta-sw-autoheal`, que la pastille « hors-ligne » de l'accueil
  // (homeConfig.js) affiche. Aucun toast.

  const SS_AUTOHEAL_KEY = "kta_sw_autoheal_done";
  // Dernier passage en échec → on retente au rechargement suivant.
  const SS_AUTOHEAL_LAST_FAILED = "kta_sw_autoheal_last_failed";

  // Début et résultat (sorties « skipped » comprises) ; aucune logique n'en dépend.
  function _signalerAutoHeal(phase, resultat) {
    try {
      window.dispatchEvent(new CustomEvent("kta-sw-autoheal", { detail: { phase: phase, resultat: resultat } }));
    } catch(e) {}
  }

  async function autoHealIfNeeded(opts) {
    const resultat = await _autoHeal(opts);
    _signalerAutoHeal("fin", resultat);
    return resultat;
  }

  async function _autoHeal(opts) {
    opts = opts || {};
    const maxRefetch = (typeof opts.maxRefetch === "number") ? opts.maxRefetch : 100;

    // Dernier passage OK cette session → rien. En échec → on retente à CHAQUE rechargement : le serveur a pu
    // être corrigé, ou le cache runtime a comblé une partie.
    try {
      const alreadyDone = sessionStorage.getItem(SS_AUTOHEAL_KEY) === "1";
      const lastFailed  = sessionStorage.getItem(SS_AUTOHEAL_LAST_FAILED) === "1";
      if (alreadyDone && !lastFailed) {
        console.log("[SwInspector] auto-heal : précédent OK cette session, skip");
        return { skipped: true, reason: "already_done_ok" };
      }
      if (alreadyDone && lastFailed) {
        console.log("[SwInspector] auto-heal : précédent avait des échecs → re-tirage au reload pour retry");
      }
    } catch(e) {}

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      console.log("[SwInspector] auto-heal skipped : offline");
      return { skipped: true, reason: "offline" };
    }
    try {
      if (window.IncognitoMode && window.IncognitoMode.isActive
          && window.IncognitoMode.isActive()) {
        console.log("[SwInspector] auto-heal skipped : incognito actif");
        return { skipped: true, reason: "incognito" };
      }
    } catch(e) {}
    // SW contrôleur requis (sinon REFETCH_MISSING_ASSETS plante).
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      console.log("[SwInspector] auto-heal skipped : SW pas controller → retry dans 5s");
      // 1er chargement après mise à jour : le SW peut ne pas avoir fini son claim. Un essai 5 s plus tard,
      // ⚠️ sans poser le drapeau de session (il bloquerait les tentatives suivantes).
      setTimeout(function() { // lint-ok-modal-lifecycle (auto-heal background hors modale)
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          console.log("[SwInspector] SW controller arrivé, retry auto-heal");
          autoHealIfNeeded(opts);
        } else {
          console.log("[SwInspector] SW toujours pas controller après 5s, abandon");
        }
      }, 5000);
      return { skipped: true, reason: "sw_not_ready_retry_scheduled" };
    }

    try {
      const expected = await _querySwExpectedAssets();
      const actual   = await _queryActualAssets(expected.cacheName);
      const diff     = _computeDiff(expected.assets, actual);

      try { sessionStorage.setItem(SS_AUTOHEAL_KEY, "1"); } catch(e) {}

      if (diff.missing.length === 0) {
        console.log("[SwInspector] auto-heal : ✅ cache complet (" + diff.present.length + " assets)");
        try { sessionStorage.setItem(SS_AUTOHEAL_LAST_FAILED, "0"); } catch(e) {}
        return { healed: 0, present: diff.present.length, missing: 0 };
      }

      const toRefetch = diff.missing.slice(0, maxRefetch);
      const capped    = diff.missing.length > maxRefetch;
      console.warn(
        "[SwInspector] auto-heal : ⚠️ " + diff.missing.length + " manquants. " +
        "Refetch silencieux de " + toRefetch.length + (capped ? " (cap " + maxRefetch + ")" : "") + "…"
      );

      _signalerAutoHeal("debut", { missing: diff.missing.length });
      const result   = await _refetchMissing(toRefetch);
      const okCount  = (result.results || []).filter(function(r) { return r.ok; }).length;
      const failCount = (result.results || []).length - okCount;
      const failedAssets = (result.results || []).filter(function(r) { return !r.ok; })
                                                 .map(function(r) { return r.asset; });

      if (failCount > 0) {
        console.warn(
          "[SwInspector] auto-heal terminé : ✅ " + okCount + " récupérés, ❌ " + failCount + " échecs " +
          "(probablement absents du serveur). Pastille rouge sur l'accueil ; détail : 🔧 Inspecteur (mode dev)."
        );
        console.warn("[SwInspector] Échecs :", failedAssets);
      } else {
        console.log("[SwInspector] auto-heal terminé : ✅ " + okCount + " récupérés, cache complet.");
      }

      // Échecs, ou fichiers laissés par le plafond → « fail » : on retentera au rechargement.
      try {
        const stillFailing = (failCount > 0) || capped;
        sessionStorage.setItem(SS_AUTOHEAL_LAST_FAILED, stillFailing ? "1" : "0");
      } catch(e) {}

      return {
        healed:  okCount,
        failed:  failCount,
        missing: diff.missing.length,
        capped:  capped,
        failedAssets: failedAssets
      };
    } catch(e) {
      console.warn("[SwInspector] auto-heal erreur :", e.message || e);
      try { sessionStorage.setItem(SS_AUTOHEAL_LAST_FAILED, "1"); } catch(e2) {}
      return { error: String(e.message || e) };
    }
  }

  // ── État hors-ligne (pastille de l'accueil) ──────────────
  // etat() : comparaison SEULE (un message au SW + une lecture de la Cache API), zéro requête réseau.
  // → { etat: "ok"|"manquants"|"indisponible", manquants, attendus, version,
  //     raison? ("incognito"|"sw"|"erreur") }
  function _version() {
    return (window.__MKM__ && window.__MKM__.build) || "";
  }
  function _incognito() {
    try {
      return !!(window.IncognitoMode && window.IncognitoMode.isActive && window.IncognitoMode.isActive());
    } catch(e) { return false; }
  }
  function _indisponible(raison) {
    return { etat: "indisponible", raison: raison, manquants: 0, attendus: 0, version: _version() };
  }
  async function _diffCourant() {
    const expected = await _querySwExpectedAssets();
    const actual   = await _queryActualAssets(expected.cacheName);
    return { cacheName: expected.cacheName, diff: _computeDiff(expected.assets, actual) };
  }
  async function etat() {
    if (_incognito()) return _indisponible("incognito");
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller || !("caches" in window)) {
      return _indisponible("sw");
    }
    try {
      const r = await _diffCourant();
      const n = r.diff.missing.length;
      return {
        etat:      n === 0 ? "ok" : "manquants",
        manquants: n,
        attendus:  r.diff.present.length + n,
        version:   _version() || r.cacheName || ""
      };
    } catch(e) {
      console.warn("[SwInspector] etat() :", e.message || e);
      return _indisponible("erreur");
    }
  }

  // recuperer(onProgress(faits, total)) → { recuperes, echecs } : par paquets de 10 (le lot du SW) pour
  // annoncer la progression. Un seul appel à la fois.
  const LOT_RECUP = 10;
  let _recupEnCours = null;
  function recuperer(onProgress) {
    if (_recupEnCours) return _recupEnCours;
    _recupEnCours = (async function() {
      if (_incognito()) throw new Error("incognito");
      const r = await _diffCourant();
      const manquants = r.diff.missing;
      const total = manquants.length;
      let recuperes = 0, echecs = 0;
      if (typeof onProgress === "function") onProgress(0, total);
      for (let i = 0; i < total; i += LOT_RECUP) {
        const res = await _refetchMissing(manquants.slice(i, i + LOT_RECUP));
        const lot = Math.min(LOT_RECUP, total - i);
        const ok = (res.results || []).filter(function(x) { return x.ok; }).length;
        recuperes += ok;
        echecs    += lot - ok;
        if (typeof onProgress === "function") onProgress(i + lot, total);
      }
      console.log("[SwInspector] récupération : ✅ " + recuperes + " · ❌ " + echecs);
      return { recuperes: recuperes, echecs: echecs };
    })();
    const p = _recupEnCours;
    p.then(function() { _recupEnCours = null; }, function() { _recupEnCours = null; });
    return p;
  }

  window.SwInspector = {
    ouvrir:            ouvrir,
    fermer:            fermer,
    autoHealIfNeeded:  autoHealIfNeeded,
    etat:              etat,
    recuperer:         recuperer
  };

  console.log("[SwInspector] Module chargé (v1.43.24).");
})();
