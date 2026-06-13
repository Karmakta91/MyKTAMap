/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// SWINSPECTOR.JS — Inspecteur Service Worker (v1.43.12)
// =========================
// Outil de transparence + diagnostic du cache PWA. Compare ce qui DEVRAIT
// être en cache (= liste ASSETS_TO_CACHE + CRITICAL_APP_SHELL du sw.js)
// avec ce qui Y EST VRAIMENT (= contenu réel du cache courant).
//
// Cas d'usage :
//   - Debug "page X pas à jour après update" : voir si l'asset est cached
//     et si oui, depuis quel cache.
//   - Vérifier qu'un update du SW a bien pré-caché tous les assets critiques.
//   - Récupérer manuellement les assets manquants (bouton retry).
//
// Accessible depuis le loader home : ⚙️ Configuration → 📊 Inspecteur →
// 🔧 Voir l'état du cache SW (bouton ajouté juste après "État mémoire").
//
// Lecture seule pour l'essentiel + 1 action explicite : "Récupérer les
// fichiers manquants". Aucune écriture destructive.
// =========================

(function() {
  "use strict";

  if (typeof window._loadCssOnce === "function") {
    window._loadCssOnce("css/style-meminspector.css", "kta-css-style-meminspector");
  }

  const MODAL_ID = "kta-sw-inspector-modal";

  // ============================================================
  // HELPERS
  // ============================================================
  function _escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function(c) {
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" })[c];
    });
  }

  // ========== HELPER I18N ==========
  // Appelé AU RENDU uniquement (jamais au load) → les dicos sont prêts.
  function _t(key, params) {
    return (window.I18n && typeof window.I18n.t === "function")
      ? window.I18n.t("swinsp." + key, params)
      : key;
  }

  // Normalise une URL ou un asset path en pathname relatif au scope SW.
  // Permet de comparer "./js/main.js" (asset list) avec "https://.../js/main.js" (cache key).
  function _normalize(urlLike) {
    try {
      if (!urlLike) return "";
      let s = String(urlLike);
      // URL absolue → pathname
      if (/^https?:\/\//.test(s)) {
        try { s = new URL(s).pathname; } catch(e) {}
      }
      // Retirer leading ./
      s = s.replace(/^\.\//, "/");
      // Forcer leading /
      if (!s.startsWith("/")) s = "/" + s;
      // Retirer query + hash
      s = s.split("?")[0].split("#")[0];
      return s;
    } catch(e) { return String(urlLike || ""); }
  }

  // ============================================================
  // QUERY SW : liste attendue (via MessageChannel)
  // ============================================================
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

  // ============================================================
  // 🆕 v1.43.22 — QUERY SW : INSTALL FAILURES LOG
  // ============================================================
  // Récupère la liste des échecs d'install loggués dans IDB
  // myktamap_sw_install_log/install_failures par _cacheAddDiag.
  // Chaque entrée : { asset, type, status, message, timestamp, phase }
  // Type possible : "404" / "5xx" / "4xx" / "network" / "quota" / "parse" / "unknown"
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

  // ============================================================
  // QUERY CACHE API : assets vraiment présents
  // ============================================================
  async function _queryActualAssets(cacheName) {
    if (!("caches" in window)) throw new Error(_t("err.noCacheApi"));
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    return requests.map(function(r) { return r.url; });
  }

  // ============================================================
  // DIFF
  // ============================================================
  // Retourne { present: [], missing: [], unexpected: [] }
  // - present    : asset attendu ET présent en cache
  // - missing    : asset attendu MAIS absent du cache
  // - unexpected : asset présent en cache MAIS pas dans la liste attendue
  //                (= cache dynamique : tuiles, fetches runtime, etc.)
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

  // ============================================================
  // REFETCH MISSING (action utilisateur)
  // ============================================================
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

  // ============================================================
  // RENDER REPORT (HTML)
  // ============================================================
  // 🆕 v1.43.22 — Labels user-friendly + emoji pour chaque type d'erreur
  // d'install. Permet à l'user de comprendre POURQUOI un asset manque
  // (FTP partiel = 404, serveur en erreur = 5xx, offline = network, etc.).
  // icon/color = données visuelles (non traduites) ; le label texte est résolu
  // au rendu via I18n (clé swinsp.fail.<type>).
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
    // Index par asset path pour lookup rapide quand on rend la section "Manquants"
    const failureByAsset = {};
    failures.forEach(function(f) { failureByAsset[f.asset] = f; });
    // Stats agrégées par type
    const failureCounts = {};
    failures.forEach(function(f) {
      const t = f.type || "unknown";
      failureCounts[t] = (failureCounts[t] || 0) + 1;
    });

    const total      = diff.present.length + diff.missing.length;
    const presentPct = total > 0 ? Math.round(100 * diff.present.length / total) : 100;
    let html = "";

    // VERDICT en tête
    if (diff.missing.length === 0) {
      html +=
        '<div class="kta-mem-section" style="border-color:rgba(166,215,133,0.4); background:rgba(166,215,133,0.05);">' +
          '<div class="kta-mem-section-titre" style="color:#a6d785;">' + _t("verdict.ok.titre") + '</div>' +
          '<div class="kta-mem-line">' + _t("verdict.ok.line", { count: diff.present.length, cache: '<code>' + _escapeHtml(cacheName) + '</code>' }) + '</div>' +
        '</div>';
    } else {
      html +=
        '<div class="kta-mem-section" style="border-color:rgba(244,107,107,0.4); background:rgba(244,107,107,0.05);">' +
          '<div class="kta-mem-section-titre" style="color:#f46b6b;">' + _t("verdict.ko.titre") + '</div>' +
          '<div class="kta-mem-line">' + _t("verdict.ko.line", { count: diff.missing.length, total: total, cache: '<code>' + _escapeHtml(cacheName) + '</code>' }) + '</div>' +
          '<div class="kta-mem-line">' + _t("verdict.ko.coverage", { pct: presentPct, present: diff.present.length, total: total }) + '</div>' +
          '<div style="margin-top:10px;">' +
            '<button type="button" id="kta-sw-inspector-refetch" class="kta-btn kta-btn-primary" style="font-size:13px; padding:8px 14px;">' +
              _t("btn.refetch", { count: diff.missing.length }) +
            '</button>' +
            '<span id="kta-sw-inspector-refetch-status" style="margin-left:10px; font-size:12px; color:#8892a4;"></span>' +
          '</div>' +
        '</div>';
    }

    // Section MANQUANTS (si applicable) — 🆕 v1.43.22 : avec cause si connue
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
                     ' <span style="color:#8892a4; font-family:sans-serif; font-size:11px;">' + _t("missing.causeUnknown") + '</span></div>';
            }).join('') +
          '</div>' +
        '</div>';
    }

    // 🆕 v1.43.22 — Section ÉCHECS DÉTECTÉS — stats agrégées par type d'erreur.
    // Affichée même si tous les manquants ont une cause (= utile pour vue
    // synthétique : "j'ai 3 fichiers absents du serveur + 1 erreur réseau").
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
        '<div class="kta-mem-section" style="border-color:rgba(140,180,255,0.4); background:rgba(140,180,255,0.05);">' +
          '<div class="kta-mem-section-titre" style="color:#8cb4ff;">' + _t("failures.titre", { count: failures.length }) + '</div>' +
          '<div class="kta-mem-line">' + statsLine + '</div>' +
          (interpretation
            ? '<div class="kta-mem-line" style="margin-top:8px; font-size:12.5px;">' + interpretation + '</div>'
            : ''
          ) +
        '</div>';
    }

    // Section PRÉSENTS (collapse par défaut, affiche le count)
    html +=
      '<details class="kta-mem-section">' +
        '<summary class="kta-mem-section-titre" style="cursor:pointer;">' + _t("present.titre", { count: diff.present.length }) + '</summary>' +
        '<div class="kta-mem-line kta-mem-dim" style="margin-top:8px;">' + _t("present.hint") + '</div>' +
        '<div class="kta-sw-inspector-scrollbox" style="font-size:11.5px;">' +
          diff.present.map(function(a) { return _escapeHtml(a); }).join('<br>') +
        '</div>' +
      '</details>';

    // Section INATTENDUS (= cache dynamique LRU, plans utilisateur, etc.)
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

  // ============================================================
  // MODALE
  // ============================================================
  function _buildModalHtml() {
    return ''
      + '<div class="kta-readme-modal-boite" style="max-width:780px; width:95vw; max-height:90vh; display:flex; flex-direction:column;">'
      +   '<div class="kta-readme-modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid rgba(255,255,255,0.1);">'
      +     '<span class="kta-readme-modal-titre">' + _t("titre") + '</span>'
      +     '<button type="button" id="kta-sw-inspector-close" aria-label="' + _t("close") + '" style="background:none; border:none; color:#e8eaf0; font-size:24px; cursor:pointer; padding:0 6px;">×</button>'
      +   '</div>'
      +   '<div class="kta-readme-modal-contenu" id="kta-sw-inspector-body" style="flex:1 1 auto; overflow-y:auto; padding:16px 18px; font-size:13px; color:#c8d0e0; line-height:1.5;">'
      +     '<div style="text-align:center; padding:30px;">' + _t("loading") + '</div>'
      +   '</div>'
      + '</div>';
  }

  // ============================================================
  // COLLECT + RENDER
  // ============================================================
  let _currentDiff = null;
  let _currentCacheName = null;
  // 🆕 v1.44.0 — Pilote ModalLifecycle de la modale Inspecteur SW.
  let _lc = null;

  async function _collectAndRender(bodyEl) {
    try {
      // 🆕 v1.44.0 — Pattern C via _lc.guard : throw ModalClosedError si
      // modale fermée pendant les 3 awaits. Plus besoin de N isConnected.
      const guard = _lc ? function(p) { return _lc.guard(p); } : function(p) { return p; };
      const expected = await guard(_querySwExpectedAssets());
      const actual   = await guard(_queryActualAssets(expected.cacheName));
      const diff     = _computeDiff(expected.assets, actual);
      // 🆕 v1.43.22 — Fetch aussi le log des échecs d'install
      // (peut être vide si tout est OK ou si v1.43.21 ou antérieur).
      const failures = await guard(_querySwInstallFailures());
      _currentDiff = diff;
      _currentCacheName = expected.cacheName;
      bodyEl.innerHTML = _renderReport(diff, expected.cacheName, failures);
      const btn = document.getElementById("kta-sw-inspector-refetch");
      if (btn && _lc) _lc.on(btn, "click", _handleRefetchClick);
    } catch(e) {
      // 🆕 v1.44.0 — Modale fermée pendant l'await → silently return.
      if (e && e.name === "ModalClosedError") return;
      if (!bodyEl.isConnected) return;
      bodyEl.innerHTML =
        '<div class="kta-mem-section" style="border-color:rgba(244,107,107,0.4); background:rgba(244,107,107,0.05);">' +
          '<div class="kta-mem-section-titre" style="color:#f46b6b;">' + _t("error.titre") + '</div>' +
          '<div class="kta-mem-line">' + _escapeHtml(e.message || String(e)) + '</div>' +
          '<div class="kta-mem-line kta-mem-dim" style="margin-top:6px;">' +
            _t("error.hint", { link: '<a href="/killsw.html" style="color:#8cb4ff;">' + _t("error.resetLink") + '</a>' }) +
          '</div>' +
        '</div>';
    }
  }

  // ============================================================
  // ACTION : REFETCH
  // ============================================================
  async function _handleRefetchClick() {
    if (!_currentDiff || !_currentDiff.missing || _currentDiff.missing.length === 0) return;
    const btn    = document.getElementById("kta-sw-inspector-refetch");
    const status = document.getElementById("kta-sw-inspector-refetch-status");
    // 🆕 v1.44.0 — Pattern D via _lc.lockButton : auto-restore disabled + label
    // au release(). Plus besoin de gérer manuellement btn.disabled.
    const release = (_lc && btn) ? _lc.lockButton(btn, { text: _t("refetch.running") }) : function() {};
    if (status) status.textContent = _t("refetch.downloading");
    try {
      // 🆕 v1.44.0 — Pattern C via _lc.guard : throw ModalClosedError si
      // modale fermée pendant le refetch (long : ~50 assets × HTTP).
      const refetchP = _refetchMissing(_currentDiff.missing);
      const result = await (_lc ? _lc.guard(refetchP) : refetchP);
      const okCount   = (result.results || []).filter(function(r) { return r.ok; }).length;
      const failCount = (result.results || []).length - okCount;
      if (status && status.isConnected) {
        status.textContent = _t("refetch.okCount", { count: okCount }) +
                             (failCount > 0 ? " · " + _t("refetch.failCount", { count: failCount }) : "");
        status.style.color = failCount > 0 ? "#f4c542" : "#a6d785";
      }
      // 🆕 v1.44.0 — setTimeout tracked : cleared si user ferme la modale
      // dans le 1.5s entre le refetch et la re-vérification.
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

  // ============================================================
  // OUVRIR / FERMER
  // ============================================================
  function ouvrir() {
    fermer(); // sécurité : reset si modale existante
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.style.zIndex = "99999";
    overlay.innerHTML = _buildModalHtml();
    document.documentElement.appendChild(overlay);

    // 🆕 v1.44.0 — ModalLifecycle : listeners (close, backdrop, Escape)
    // cleared automatiquement au fermer().
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

  // ============================================================
  // 🆕 v1.43.13 — AUTO-HEAL SILENCIEUX AU BOOT
  // ============================================================
  // Appelé depuis index.html après ~5s post-load, tente automatiquement
  // de récupérer les assets manquants SI on a internet. Garde-fous stricts
  // pour ne pas casser la performance ni la privacy.
  //
  // Conditions cumulatives requises :
  //   1. navigator.onLine === true (pas en mode avion)
  //   2. Service Worker controller actif (= app contrôlée)
  //   3. Pas en Mode hors-ligne strict (NetworkAudit)
  //   4. Pas en Mode incognito
  //   5. Pas déjà tiré cette session (sessionStorage anti-spam)
  //   6. Cap à 100 fetches max pour ne pas DDoS-er le serveur sur cache cassé
  //
  // Output : console only (pas de toast user-visible). Si tu veux voir le
  // résultat, ouvre la console ou la modale Inspecteur SW.

  const SS_AUTOHEAL_KEY = "kta_sw_autoheal_done";
  // 🆕 v1.43.23 — Mémorise le résultat du dernier check pour décider si
  // on doit re-tirer au reload (échecs non résolus = retry) ou pas (tout OK).
  const SS_AUTOHEAL_LAST_FAILED = "kta_sw_autoheal_last_failed";

  // 🆕 v1.43.22 — Toast non-bloquant si le cache est gravement incomplet
  // après l'auto-heal au boot. Clic = ouvrir l'Inspecteur SW direct.
  // Un seul affichage par session (anti-spam).
  const SS_INCOMPLET_TOAST_KEY = "kta_sw_incomplet_toast_done";

  function _showCacheIncompletToast(failCount) {
    try {
      if (sessionStorage.getItem(SS_INCOMPLET_TOAST_KEY) === "1") return;
      sessionStorage.setItem(SS_INCOMPLET_TOAST_KEY, "1");
    } catch(e) {}
    try {
      // Pas de dépendance dure à OOMGuard — on construit un toast minimaliste
      // pour rester self-contained et fonctionner même si OOMGuard absent.
      const t = document.createElement("div");
      t.id = "kta-sw-incomplet-toast";
      t.style.cssText =
        "position:fixed; top:14px; left:50%; transform:translateX(-50%);" +
        "background:rgba(244,107,107,0.95); color:#1a1f2e; padding:10px 18px;" +
        "border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.35);" +
        "font-size:13px; font-weight:600; z-index:100200; cursor:pointer;" +
        "max-width:90vw; text-align:center; line-height:1.45;" +
        "border:1px solid rgba(244,107,107,1);";
      t.innerHTML = _t("toast.incomplete", { count: failCount }) +
                    "<br><span style='font-size:11.5px; font-weight:400; opacity:0.92;'>" +
                    _t("toast.incomplete.action") + "</span>";
      t.addEventListener("click", function() { // lint-ok-modal-lifecycle (toast standalone hors modale)
        try { t.remove(); } catch(e) {}
        if (window.SwInspector && typeof window.SwInspector.ouvrir === "function") {
          window.SwInspector.ouvrir();
        }
      });
      document.documentElement.appendChild(t);
      // Auto-dismiss après 12s si pas cliqué (id stocké pour cohérence avec les
      // autres setTimeout du module + permet un éventuel clearTimeout futur si
      // on ajoute une action « ne plus afficher ce tour-ci »).
      const _autoDismissId = setTimeout(function() { // lint-ok-modal-lifecycle (toast standalone hors modale)
        try { if (t.parentNode) t.parentNode.removeChild(t); } catch(e) {}
      }, 12000);
      // Si l'user clique avant le 12s, on cancel l'auto-dismiss (le toast est
      // déjà retiré par le handler ligne 509, mais on libère le timer).
      t.addEventListener("click", function() { clearTimeout(_autoDismissId); }); // lint-ok-modal-lifecycle (toast standalone hors modale)
    } catch(e) {
      console.warn("[SwInspector] Toast cache incomplet échec :", e.message || e);
    }
  }

  async function autoHealIfNeeded(opts) {
    opts = opts || {};
    const maxRefetch = (typeof opts.maxRefetch === "number") ? opts.maxRefetch : 100;

    // 🆕 v1.43.23 — Garde-fou INTELLIGENT (au lieu de "1× par session" brut) :
    //   - Si le dernier check était OK → skip (cache déjà sain, pas de spam)
    //   - Si le dernier check avait des échecs → RE-TIRER à chaque reload
    //     (KARMA "50 manquants au 1er load, 7 après reload, mais l'auto-heal
    //     ne re-tire pas") → le serveur a peut-être été corrigé entre temps,
    //     ou le runtime cache a réglé une partie, donc on retente.
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

    // Garde-fous : online
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      console.log("[SwInspector] auto-heal skipped : offline");
      return { skipped: true, reason: "offline" };
    }
    // Garde-fous : pas en mode strict offline (paranoia user)
    try {
      if (window.NetworkAudit && window.NetworkAudit.isStrictOfflineEnabled
          && window.NetworkAudit.isStrictOfflineEnabled()) {
        console.log("[SwInspector] auto-heal skipped : strict offline actif");
        return { skipped: true, reason: "strict_offline" };
      }
    } catch(e) {}
    // Garde-fous : pas en incognito (= aucun fetch sortant)
    try {
      if (window.IncognitoMode && window.IncognitoMode.isActive
          && window.IncognitoMode.isActive()) {
        console.log("[SwInspector] auto-heal skipped : incognito actif");
        return { skipped: true, reason: "incognito" };
      }
    } catch(e) {}
    // Garde-fous : SW controller actif (sinon REFETCH_MISSING_ASSETS plante)
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      console.log("[SwInspector] auto-heal skipped : SW pas controller → retry dans 5s");
      // 🆕 v1.43.23 — Au lieu d'abandonner, on re-programme un retry dans 5s.
      // Ça couvre le cas où le timeout 5s d'index.html tire avant que le SW
      // ait terminé son install (1er load post-update, SW en train de claim).
      // On NE marque PAS le flag sessionStorage (sinon on bloquerait toutes
      // les tentatives suivantes), on laisse le retry tourner.
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

      // Marquer "tiré cette session" même si rien à faire
      try { sessionStorage.setItem(SS_AUTOHEAL_KEY, "1"); } catch(e) {}

      if (diff.missing.length === 0) {
        console.log("[SwInspector] auto-heal : ✅ cache complet (" + diff.present.length + " assets)");
        // 🆕 v1.43.23 — Marquer "dernier check OK" → garde-fou pour skip
        // les reload suivants tant que le cache est sain.
        try { sessionStorage.setItem(SS_AUTOHEAL_LAST_FAILED, "0"); } catch(e) {}
        return { healed: 0, present: diff.present.length, missing: 0 };
      }

      // Cap pour ne pas spammer le serveur si le cache est complètement cassé
      const toRefetch = diff.missing.slice(0, maxRefetch);
      const capped    = diff.missing.length > maxRefetch;
      console.warn(
        "[SwInspector] auto-heal : ⚠️ " + diff.missing.length + " manquants. " +
        "Refetch silencieux de " + toRefetch.length + (capped ? " (cap " + maxRefetch + ")" : "") + "…"
      );

      const result   = await _refetchMissing(toRefetch);
      const okCount  = (result.results || []).filter(function(r) { return r.ok; }).length;
      const failCount = (result.results || []).length - okCount;
      const failedAssets = (result.results || []).filter(function(r) { return !r.ok; })
                                                 .map(function(r) { return r.asset; });

      if (failCount > 0) {
        console.warn(
          "[SwInspector] auto-heal terminé : ✅ " + okCount + " récupérés, ❌ " + failCount + " échecs " +
          "(probablement absents du serveur). Ouvre 🔧 Inspecteur Service Worker pour diagnostiquer."
        );
        console.warn("[SwInspector] Échecs :", failedAssets);
        // 🆕 v1.43.22 — Toast non-bloquant si beaucoup d'échecs résiduels
        // après l'auto-heal. Seuil > 10 pour ne pas spammer sur un blip
        // ponctuel. L'user peut cliquer pour ouvrir directement l'inspecteur.
        if (failCount > 10) {
          _showCacheIncompletToast(failCount);
        }
      } else {
        console.log("[SwInspector] auto-heal terminé : ✅ " + okCount + " récupérés, cache complet.");
      }

      // 🆕 v1.43.23 — Persiste le résultat pour décider du retry au prochain
      // reload. Si failCount > 0 (ou capped = il reste des fichiers non
      // traités), on marque "fail" pour re-tirer la prochaine fois. Sinon
      // c'est "ok" et on skip jusqu'à la prochaine session.
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
      // En cas d'exception, on marque "fail" pour retenter au prochain reload
      try { sessionStorage.setItem(SS_AUTOHEAL_LAST_FAILED, "1"); } catch(e2) {}
      return { error: String(e.message || e) };
    }
  }

  // ============================================================
  // EXPORTS
  // ============================================================
  window.SwInspector = {
    ouvrir:            ouvrir,
    fermer:            fermer,
    autoHealIfNeeded:  autoHealIfNeeded
  };

  console.log("[SwInspector] Module chargé (v1.43.24).");
})();
