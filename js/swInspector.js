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
        reject(new Error("Service Worker non actif (rechargez la page une fois)"));
        return;
      }
      const channel = new MessageChannel();
      const timeoutId = setTimeout(function() {
        reject(new Error("Timeout réponse SW (3s)"));
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
          reject(new Error("Réponse SW inattendue : " + data.type));
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
  // QUERY CACHE API : assets vraiment présents
  // ============================================================
  async function _queryActualAssets(cacheName) {
    if (!("caches" in window)) throw new Error("Cache API non supportée");
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
        reject(new Error("Service Worker non actif"));
        return;
      }
      const channel = new MessageChannel();
      const timeoutId = setTimeout(function() {
        reject(new Error("Timeout refetch (30s)"));
      }, 30000);
      channel.port1.onmessage = function(event) {
        clearTimeout(timeoutId);
        const data = event.data || {};
        if (data.type === "REFETCH_DONE") resolve(data);
        else reject(new Error("Réponse SW inattendue : " + data.type));
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
  function _renderReport(diff, cacheName) {
    const total      = diff.present.length + diff.missing.length;
    const presentPct = total > 0 ? Math.round(100 * diff.present.length / total) : 100;
    let html = "";

    // VERDICT en tête
    if (diff.missing.length === 0) {
      html +=
        '<div class="kta-mem-section" style="border-color:rgba(166,215,133,0.4); background:rgba(166,215,133,0.05);">' +
          '<div class="kta-mem-section-titre" style="color:#a6d785;">✅ Tout est bien enregistré</div>' +
          '<div class="kta-mem-line"><b>' + diff.present.length + '</b> assets attendus, tous présents dans le cache <code>' + _escapeHtml(cacheName) + '</code>.</div>' +
        '</div>';
    } else {
      html +=
        '<div class="kta-mem-section" style="border-color:rgba(244,107,107,0.4); background:rgba(244,107,107,0.05);">' +
          '<div class="kta-mem-section-titre" style="color:#f46b6b;">⚠️ Cache incomplet</div>' +
          '<div class="kta-mem-line"><b>' + diff.missing.length + '</b> assets attendus sont absents du cache (sur ' + total + ' total). ' +
          'Cache courant : <code>' + _escapeHtml(cacheName) + '</code></div>' +
          '<div class="kta-mem-line">Couverture : <b>' + presentPct + '%</b> (' + diff.present.length + ' / ' + total + ')</div>' +
          '<div style="margin-top:10px;">' +
            '<button type="button" id="kta-sw-inspector-refetch" class="kta-btn kta-btn-primary" style="font-size:13px; padding:8px 14px;">' +
              '🔄 Récupérer les ' + diff.missing.length + ' fichier' + (diff.missing.length > 1 ? 's' : '') + ' manquant' + (diff.missing.length > 1 ? 's' : '') +
            '</button>' +
            '<span id="kta-sw-inspector-refetch-status" style="margin-left:10px; font-size:12px; color:#8892a4;"></span>' +
          '</div>' +
        '</div>';
    }

    // Section MANQUANTS (si applicable)
    if (diff.missing.length > 0) {
      html +=
        '<div class="kta-mem-section">' +
          '<div class="kta-mem-section-titre">❌ Assets manquants (' + diff.missing.length + ')</div>' +
          '<div class="kta-mem-line kta-mem-dim">Ces fichiers sont déclarés dans <code>ASSETS_TO_CACHE</code> du Service Worker mais ne sont pas dans le cache actuel.</div>' +
          '<div style="max-height:200px; overflow-y:auto; margin-top:8px; padding:8px; background:rgba(0,0,0,0.2); border-radius:4px; font-family:monospace; font-size:11.5px;">' +
            diff.missing.map(function(a) { return _escapeHtml(a); }).join('<br>') +
          '</div>' +
        '</div>';
    }

    // Section PRÉSENTS (collapse par défaut, affiche le count)
    html +=
      '<details class="kta-mem-section">' +
        '<summary class="kta-mem-section-titre" style="cursor:pointer;">✅ Assets présents (' + diff.present.length + ')</summary>' +
        '<div class="kta-mem-line kta-mem-dim" style="margin-top:8px;">Tous ces fichiers sont correctement enregistrés.</div>' +
        '<div style="max-height:200px; overflow-y:auto; margin-top:8px; padding:8px; background:rgba(0,0,0,0.2); border-radius:4px; font-family:monospace; font-size:11.5px;">' +
          diff.present.map(function(a) { return _escapeHtml(a); }).join('<br>') +
        '</div>' +
      '</details>';

    // Section INATTENDUS (= cache dynamique LRU, plans utilisateur, etc.)
    if (diff.unexpected.length > 0) {
      html +=
        '<details class="kta-mem-section">' +
          '<summary class="kta-mem-section-titre" style="cursor:pointer;">📦 Cache dynamique (' + diff.unexpected.length + ')</summary>' +
          '<div class="kta-mem-line kta-mem-dim" style="margin-top:8px;">' +
            'Fichiers présents en cache mais non déclarés dans <code>ASSETS_TO_CACHE</code>. ' +
            'Normal — ce sont les ressources cachées au runtime (plans utilisateur, tuiles, fetches divers) ' +
            'soumises à l\'éviction LRU (cap ' + 800 + ' entrées).' +
          '</div>' +
          '<div style="max-height:200px; overflow-y:auto; margin-top:8px; padding:8px; background:rgba(0,0,0,0.2); border-radius:4px; font-family:monospace; font-size:11px;">' +
            diff.unexpected.slice(0, 100).map(function(u) {
              try { return _escapeHtml(new URL(u).pathname); } catch(e) { return _escapeHtml(u); }
            }).join('<br>') +
            (diff.unexpected.length > 100 ? '<br><i>… et ' + (diff.unexpected.length - 100) + ' de plus</i>' : '') +
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
      +     '<span class="kta-readme-modal-titre">🔧 Inspecteur Service Worker</span>'
      +     '<button type="button" id="kta-sw-inspector-close" aria-label="Fermer" style="background:none; border:none; color:#e8eaf0; font-size:24px; cursor:pointer; padding:0 6px;">×</button>'
      +   '</div>'
      +   '<div class="kta-readme-modal-contenu" id="kta-sw-inspector-body" style="flex:1 1 auto; overflow-y:auto; padding:16px 18px; font-size:13px; color:#c8d0e0; line-height:1.5;">'
      +     '<div style="text-align:center; padding:30px;">⏳ Analyse du cache en cours…</div>'
      +   '</div>'
      + '</div>';
  }

  // ============================================================
  // COLLECT + RENDER
  // ============================================================
  let _currentDiff = null;
  let _currentCacheName = null;

  async function _collectAndRender(bodyEl) {
    try {
      const expected = await _querySwExpectedAssets();
      const actual   = await _queryActualAssets(expected.cacheName);
      const diff     = _computeDiff(expected.assets, actual);
      _currentDiff = diff;
      _currentCacheName = expected.cacheName;
      bodyEl.innerHTML = _renderReport(diff, expected.cacheName);
      const btn = document.getElementById("kta-sw-inspector-refetch");
      if (btn) btn.addEventListener("click", _handleRefetchClick);
    } catch(e) {
      bodyEl.innerHTML =
        '<div class="kta-mem-section" style="border-color:rgba(244,107,107,0.4); background:rgba(244,107,107,0.05);">' +
          '<div class="kta-mem-section-titre" style="color:#f46b6b;">❌ Erreur</div>' +
          '<div class="kta-mem-line">' + _escapeHtml(e.message || String(e)) + '</div>' +
          '<div class="kta-mem-line kta-mem-dim" style="margin-top:6px;">' +
            'Si le Service Worker vient de s\'installer, recharge la page une fois et réessaie. ' +
            'Si le problème persiste : <a href="/killsw.html" style="color:#8cb4ff;">réinitialiser le SW</a>.' +
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
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Récupération…"; }
    if (status) status.textContent = "Téléchargement en cours…";
    try {
      const result = await _refetchMissing(_currentDiff.missing);
      const okCount   = (result.results || []).filter(function(r) { return r.ok; }).length;
      const failCount = (result.results || []).length - okCount;
      if (status) {
        status.textContent = "✅ " + okCount + " récupéré" + (okCount > 1 ? "s" : "") +
                             (failCount > 0 ? " · ❌ " + failCount + " échec" + (failCount > 1 ? "s" : "") : "");
        status.style.color = failCount > 0 ? "#f4c542" : "#a6d785";
      }
      // Recharge la liste après refetch
      setTimeout(function() {
        const bodyEl = document.getElementById("kta-sw-inspector-body");
        if (bodyEl) {
          bodyEl.innerHTML = '<div style="text-align:center; padding:30px;">⏳ Re-vérification du cache…</div>';
          _collectAndRender(bodyEl);
        }
      }, 1500);
    } catch(e) {
      if (btn) { btn.disabled = false; btn.textContent = "🔄 Réessayer"; }
      if (status) {
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

    const closeBtn = overlay.querySelector("#kta-sw-inspector-close");
    if (closeBtn) closeBtn.addEventListener("click", fermer);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) fermer();
    });

    const bodyEl = document.getElementById("kta-sw-inspector-body");
    if (bodyEl) _collectAndRender(bodyEl);
  }

  function fermer() {
    const el = document.getElementById(MODAL_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    _currentDiff = null;
    _currentCacheName = null;
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

  async function autoHealIfNeeded(opts) {
    opts = opts || {};
    const maxRefetch = (typeof opts.maxRefetch === "number") ? opts.maxRefetch : 100;

    // Garde-fous : 1 fois par session
    try {
      if (sessionStorage.getItem(SS_AUTOHEAL_KEY) === "1") {
        console.log("[SwInspector] auto-heal déjà tiré cette session, skip");
        return { skipped: true, reason: "already_done" };
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
      console.log("[SwInspector] auto-heal skipped : SW pas controller (recharge la page)");
      return { skipped: true, reason: "sw_not_ready" };
    }

    try {
      const expected = await _querySwExpectedAssets();
      const actual   = await _queryActualAssets(expected.cacheName);
      const diff     = _computeDiff(expected.assets, actual);

      // Marquer "tiré cette session" même si rien à faire (évite re-checks inutiles)
      try { sessionStorage.setItem(SS_AUTOHEAL_KEY, "1"); } catch(e) {}

      if (diff.missing.length === 0) {
        console.log("[SwInspector] auto-heal : ✅ cache complet (" + diff.present.length + " assets)");
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
      } else {
        console.log("[SwInspector] auto-heal terminé : ✅ " + okCount + " récupérés, cache complet.");
      }

      return {
        healed:  okCount,
        failed:  failCount,
        missing: diff.missing.length,
        capped:  capped,
        failedAssets: failedAssets
      };
    } catch(e) {
      console.warn("[SwInspector] auto-heal erreur :", e.message || e);
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

  console.log("[SwInspector] Module chargé (v1.43.13).");
})();
