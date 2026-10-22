/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// planDenylist.js — kill-switch anti-fuite : bloque l'ouverture d'un plan LOCAL dont le ZIP a fuité.
// SHA-256 du ZIP (SubtleCrypto, local) comparé à denylist.json (racine du serveur) ; trouvé → modale
// rouge bloquante + suppression du plan. Vérifié à l'import (chargerZipFichier, FS Access) et au boot
// (auditPlansLocaux). Plans serveur non concernés.
// 🔒 Aucun hash ne quitte l'appareil : seule la liste publique est téléchargée (comme alertChecker.js).
// Format : { version, updated, deny: [{ sha256: "<64 hex>", reason, addedAt }] }
// Cache : localStorage["myktamap_denylist_cache"] = { fetchedAt, payload }, TTL 24 h ; hors ligne, la
//   dernière liste connue s'applique (jamais désactivé).
// Expose : window.PlanDenylist { init, isPlanDenied(blob) → {denied, sha256, reason?, addedAt?},
//   refresh, getDenylist, computeSha256, showDeniedModal(info, planId, onDismiss), auditPlansLocaux,
//   getPurgedAtBoot, clearPurgedAtBoot, showPurgedNotifModal }
// Doc : docs/architecture/security-legal.md

(function() {
  "use strict";

  const DENYLIST_URL    = "denylist.json";
  const LS_CACHE_KEY    = "myktamap_denylist_cache";
  const CACHE_TTL_MS    = 24 * 60 * 60 * 1000;

  let _denylist = null;       // { version, updated, deny: [{sha256, reason, addedAt}] }
  let _fetchPromise = null;   // dédoublonne fetches concurrents
  let _initDone = false;

  // ── Téléchargement et cache ──────────────────────────────────
  async function init() {
    if (_initDone) return _denylist;
    _initDone = true;

    // Cache d'abord : disponible tout de suite, pas de course au premier boot.
    _denylist = _loadFromCache();
    if (_denylist) {
      console.log("[PlanDenylist] Cache local hit — " + (_denylist.deny || []).length + " entrée(s)");
    }

    const cacheAge = _getCacheAgeMs();
    const needRefetch = (cacheAge === null) || (cacheAge > CACHE_TTL_MS);
    if (needRefetch) {
      _backgroundRefetch();
    }
    return _denylist;
  }

  function _backgroundRefetch() {
    if (_fetchPromise) return _fetchPromise;
    _fetchPromise = (async function() {
      try {
        // no-store : contourne le SW, la liste doit être fraîche.
        const resp = await fetch(DENYLIST_URL, { cache: "no-store" });
        if (!resp.ok) {
          // 404 = aucune liste publiée → aucun blocage.
          if (resp.status === 404) {
            _denylist = { version: 1, updated: null, deny: [] };
            _saveToCache(_denylist);
            console.log("[PlanDenylist] denylist.json non publiée (404) — aucun blocage actif");
          } else {
            console.warn("[PlanDenylist] Fetch HTTP " + resp.status);
          }
          return _denylist;
        }
        const json = await resp.json();
        if (!json || !Array.isArray(json.deny)) {
          console.warn("[PlanDenylist] Format invalide (deny[] manquant)");
          return _denylist;
        }
        _denylist = {
          version: json.version || 1,
          updated: json.updated || null,
          deny:    json.deny.filter(function(e) {
            return e && typeof e.sha256 === "string" && /^[a-f0-9]{64}$/i.test(e.sha256);
          })
        };
        _saveToCache(_denylist);
        console.log("[PlanDenylist] Fetch OK — " + _denylist.deny.length + " entrée(s) actives");
      } catch(e) {
        // Hors ligne / DNS / CORS : le cache existant reste appliqué.
        console.log("[PlanDenylist] Fetch échec (offline ?) — fallback cache local :", e.message);
      } finally {
        _fetchPromise = null;
      }
      return _denylist;
    })();
    return _fetchPromise;
  }

  function _loadFromCache() {
    try {
      const raw = localStorage.getItem(LS_CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (cached && cached.payload && Array.isArray(cached.payload.deny)) {
        return cached.payload;
      }
    } catch(e) {}
    return null;
  }

  function _getCacheAgeMs() {
    try {
      const raw = localStorage.getItem(LS_CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (cached && typeof cached.fetchedAt === "number") {
        return Date.now() - cached.fetchedAt;
      }
    } catch(e) {}
    return null;
  }

  function _saveToCache(payload) {
    try {
      localStorage.setItem(LS_CACHE_KEY, JSON.stringify({
        fetchedAt: Date.now(),
        payload:   payload
      }));
    } catch(e) {
      console.warn("[PlanDenylist] localStorage save échec :", e.message);
    }
  }

  // ── SHA-256 ──────────────────────────────────────────────────
  async function computeSha256(blob) {
    if (!blob || (typeof blob.arrayBuffer !== "function" && !(blob instanceof ArrayBuffer))) {
      throw new Error("computeSha256: blob invalide");
    }
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("computeSha256: SubtleCrypto non disponible (HTTPS requis)");
    }
    const buf = (blob instanceof ArrayBuffer) ? blob : await blob.arrayBuffer();
    const digest = await window.crypto.subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  // ── Vérification d'un plan ───────────────────────────────────
  // → { denied: false, sha256 } ou { denied: true, sha256, reason, addedAt }
  async function isPlanDenied(blob) {
    if (!_initDone) await init();

    // Hash calculé même si la liste est vide (diagnostic).
    let sha256;
    try {
      sha256 = await computeSha256(blob);
    } catch(e) {
      // ⚠️ SubtleCrypto absent (HTTP local) : on laisse passer pour ne pas bloquer le dev.
      console.warn("[PlanDenylist] Hash impossible — check denylist skip :", e.message);
      return { denied: false, sha256: null, error: e.message };
    }

    if (!_denylist || !Array.isArray(_denylist.deny) || _denylist.deny.length === 0) {
      return { denied: false, sha256: sha256 };
    }

    // Recherche linéaire : liste attendue petite (< 100 entrées).
    const lower = sha256.toLowerCase();
    for (const entry of _denylist.deny) {
      if (entry.sha256.toLowerCase() === lower) {
        return {
          denied:  true,
          sha256:  sha256,
          reason:  entry.reason  || (window.I18n ? window.I18n.t("denylist.defaultReason") : "denylist.defaultReason"),
          addedAt: entry.addedAt || null
        };
      }
    }
    return { denied: false, sha256: sha256 };
  }

  // ── Modale bloquante (plan refusé) ───────────────────────────
  function showDeniedModal(info, planId, onDismiss) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const locale = (window.I18n && window.I18n.getLang) ? window.I18n.getLang() : "fr";
    const existing = document.getElementById("kta-denylist-modal");
    if (existing) existing.remove();

    const reasonText  = info.reason  || t("denylist.defaultReason");
    const addedAtStr  = info.addedAt
                       ? new Date(info.addedAt).toLocaleString(locale)
                       : t("denylist.dateUnknown");
    const sha256Short = info.sha256
                       ? (info.sha256.slice(0, 12) + "…" + info.sha256.slice(-8))
                       : t("denylist.hashUnavailable");

    // Palette propre d'alarme, hors charte et déclinée par thème (décision produit) : le rouge danger reste
    // fort dans les deux thèmes, la charte n'a pas de rouge de fond.
    const isLight = _isLightTheme();
    const pal = isLight ? {
      backdrop: "rgba(60,30,30,0.55)",
      boxBg:    "linear-gradient(135deg, #fff5f5 0%, #ffe6e6 100%)",
      txMain:   "#3a1010",
      titre:    "#b71c1c",
      sousTitre: "#a04040",
      motif:    "#b71c1c",
      corps:    "#3a1010",
      date:     "#6a4040",
      reasonBg: "rgba(211,47,47,0.08)",
      techCol:  "#8a5050",
      monoCol:  "#5a4f40"
    } : {
      backdrop: "rgba(15,5,5,0.92)",
      boxBg:    "linear-gradient(135deg, #2b0f0f 0%, #1a0808 100%)",
      txMain:   "#fff",
      titre:    "#ffb4b4",
      sousTitre: "#e8a0a0",
      motif:    "#ffd0d0",
      corps:    "#fff5f5",
      date:     "#c0b0b0",
      reasonBg: "rgba(0,0,0,0.35)",
      techCol:  "#a09595",
      monoCol:  "#9fa9bb"
    };
    pal.bord = "#d32f2f";
    pal.btnFond = "#d32f2f";
    pal.btnTexte = "#fff";
    pal.btnSurvol = "#b71c1c";

    const overlay = document.createElement("div");
    overlay.id = "kta-denylist-modal";
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:100000",
      "background:" + pal.backdrop, "backdrop-filter:blur(4px)",
      "display:flex", "align-items:center", "justify-content:center",
      "padding:20px", "animation:kta-denylist-fadein 0.3s ease-out"
    ].join(";");

    const box = document.createElement("div");
    box.style.cssText = [
      "max-width:560px", "width:100%", "padding:28px 32px",
      "background:" + pal.boxBg,
      "border:2px solid " + pal.bord, "border-radius:14px",
      "box-shadow:0 0 60px rgba(211,47,47,0.55), 0 8px 32px rgba(0,0,0,0.6)",
      "color:" + pal.txMain, "font-family:system-ui,-apple-system,sans-serif",
      "animation:kta-denylist-pulse 2s ease-in-out infinite"
    ].join(";");

    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:14px;margin-bottom:14px;";
    head.innerHTML =
      '<div style="font-size:42px;line-height:1;flex:0 0 auto;">⛔</div>' +
      '<div>' +
        '<div style="font-size:20px;font-weight:700;color:' + pal.titre + ';letter-spacing:0.3px;">' + t("denylist.modal.titre") + '</div>' +
        '<div style="font-size:12px;color:' + pal.sousTitre + ';margin-top:2px;">' + t("denylist.modal.soustitre") + '</div>' +
      '</div>';
    box.appendChild(head);

    const body = document.createElement("div");
    body.style.cssText = [
      "margin:14px 0", "padding:14px 16px",
      "background:" + pal.reasonBg, "border-left:3px solid " + pal.bord,
      "border-radius:6px", "font-size:14px", "line-height:1.5",
      "color:" + pal.corps
    ].join(";");
    body.innerHTML =
      '<div style="font-weight:600;color:' + pal.motif + ';margin-bottom:6px;">' + t("denylist.motifLabel") + '</div>' +
      '<div>' + _escapeHtml(reasonText) + '</div>';
    box.appendChild(body);

    const tech = document.createElement("div");
    tech.style.cssText = "font-size:11px;color:" + pal.techCol + ";margin:12px 0 18px;line-height:1.6;";
    tech.innerHTML =
      t("denylist.addedAt") + ' <strong style="color:' + pal.date + ';">' + _escapeHtml(addedAtStr) + '</strong><br>' +
      t("denylist.fingerprint") + ' <code style="font-family:monospace;color:' + pal.monoCol + ';font-size:11px;">' + _escapeHtml(sha256Short) + '</code>';
    box.appendChild(tech);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:8px;";
    const btn = document.createElement("button");
    btn.textContent = t("denylist.btnDelete");
    btn.style.cssText = [
      "padding:10px 22px", "background:" + pal.btnFond, "color:" + pal.btnTexte,
      "border:none", "border-radius:8px", "font-size:14px", "font-weight:600",
      "cursor:pointer", "transition:background 0.15s"
    ].join(";");
    btn.addEventListener("mouseenter", function() { btn.style.background = pal.btnSurvol; });
    btn.addEventListener("mouseleave", function() { btn.style.background = pal.btnFond; });
    btn.addEventListener("click", async function() {
      if (planId && window.PlanRegistry) {
        try {
          // Retire l'entrée du registre. Un blob IDB orphelin est acceptable (id jamais réutilisé) ;
          // le cache SW ne contient pas de plan local.
          window.PlanRegistry.remove(planId);
          console.log("[PlanDenylist] Plan supprimé du registre :", planId);
        } catch(e) {
          console.warn("[PlanDenylist] Suppression registre échec :", e.message);
        }
      }
      overlay.remove();
      _injectKeyframes();
      if (typeof onDismiss === "function") onDismiss();
      // Rechargement : repart d'une liste de plans propre.
      try {
        if (window.location && typeof window.location.reload === "function") {
          window.location.reload();
        }
      } catch(e) {}
    });
    actions.appendChild(btn);
    box.appendChild(actions);

    overlay.appendChild(box);
    _injectKeyframes();
    document.body.appendChild(overlay);
  }

  function _injectKeyframes() {
    if (document.getElementById("kta-denylist-keyframes")) return;
    const style = document.createElement("style");
    style.id = "kta-denylist-keyframes";
    style.textContent =
      "@keyframes kta-denylist-fadein { from { opacity: 0; } to { opacity: 1; } }" +
      "@keyframes kta-denylist-pulse { " +
        "0%, 100% { box-shadow: 0 0 60px rgba(211,47,47,0.55), 0 8px 32px rgba(0,0,0,0.6); }" +
        "50%      { box-shadow: 0 0 80px rgba(211,47,47,0.75), 0 8px 32px rgba(0,0,0,0.6); }" +
      "}";
    document.head.appendChild(style);
  }

  function _isLightTheme() {
    try {
      return document.body.classList.contains("kta-theme-light") ||
             document.documentElement.classList.contains("kta-theme-light");
    } catch(e) { return false; }
  }

  function _escapeHtml(s) { return window.ktaEsc(s); }

  // ── Audit au boot des plans LOCAUX déjà importés ─────────────
  // Purge un plan révoqué APRÈS son import. Hash mémorisé dans le registre (`plan.sha256`,
  // un seul calcul par plan ; le vider force un nouveau calcul). Séquentiel avec pause entre
  // les plans ; rien si la liste est vide. Résumé des purges dans
  // localStorage["myktamap_denylist_purged_at_boot"], affiché ensuite par le loader.

  const LS_PURGED_KEY = "myktamap_denylist_purged_at_boot";

  // → { audited, purged: [{ id, name, sha256, reason, addedAt, purgedAt }] }
  async function auditPlansLocaux() {
    if (!_initDone) await init();
    if (!_denylist || !Array.isArray(_denylist.deny) || _denylist.deny.length === 0) {
      return { audited: 0, purged: [], reason: "denylist-empty" };
    }
    if (!window.PlanRegistry || typeof window.PlanRegistry.getAll !== "function") {
      console.warn("[PlanDenylist] PlanRegistry indisponible — audit skip");
      return { audited: 0, purged: [], reason: "no-registry" };
    }

    const denyByHash = {};
    for (const e of _denylist.deny) {
      denyByHash[e.sha256.toLowerCase()] = e;
    }

    const allPlans = window.PlanRegistry.getAll();
    const localPlans = allPlans.filter(function(p) { return p && p.type === "local"; });
    if (localPlans.length === 0) {
      return { audited: 0, purged: [], reason: "no-local-plans" };
    }

    const purged = [];
    let audited = 0;

    for (const plan of localPlans) {
      try {
        let hash = (typeof plan.sha256 === "string" && /^[a-f0-9]{64}$/i.test(plan.sha256))
                   ? plan.sha256.toLowerCase()
                   : null;

        if (!hash) {
          const blob = await window.PlanRegistry.getBlob(plan.id);
          if (!blob) {
            // Sans blob (handle FS ou orphelin) : ignoré.
            continue;
          }
          try {
            hash = (await computeSha256(blob)).toLowerCase();
          } catch(e) {
            console.warn("[PlanDenylist] Hash plan", plan.id, "échec :", e.message);
            continue;
          }
          try {
            window.PlanRegistry.addOrUpdate({ id: plan.id, sha256: hash });
          } catch(e) {
            console.warn("[PlanDenylist] Cache hash échec :", e.message);
          }
        }

        audited++;

        const match = denyByHash[hash];
        if (match) {
          console.warn("[PlanDenylist] AUDIT BOOT : plan local révoqué détecté →",
                       plan.id, "(" + (plan.name || "?") + ")", "raison :", match.reason);
          try {
            window.PlanRegistry.remove(plan.id);
          } catch(e) {
            console.warn("[PlanDenylist] Suppression échec :", e.message);
          }
          purged.push({
            id:        plan.id,
            name:      plan.name || plan.originalFilename || plan.id,
            sha256:    hash,
            reason:    match.reason  || (window.I18n ? window.I18n.t("denylist.defaultReason") : "denylist.defaultReason"),
            addedAt:   match.addedAt || null,
            purgedAt:  new Date().toISOString()
          });
        }

        // Rend la main entre deux plans (pas de gel sur les gros ZIP).
        await new Promise(function(r) { setTimeout(r, 10); });
      } catch(e) {
        console.warn("[PlanDenylist] Audit plan", plan.id, "exception :", e.message);
      }
    }

    if (purged.length > 0) {
      try {
        const existing = _getPurgedAtBoot();
        const combined = existing.concat(purged);
        localStorage.setItem(LS_PURGED_KEY, JSON.stringify(combined));
      } catch(e) {
        console.warn("[PlanDenylist] Save purged LS échec :", e.message);
      }
    }

    console.log("[PlanDenylist] AUDIT BOOT terminé —", audited, "plan(s) audité(s),", purged.length, "purge(s)");
    return { audited: audited, purged: purged };
  }

  function _getPurgedAtBoot() {
    try {
      const raw = localStorage.getItem(LS_PURGED_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch(e) { return []; }
  }

  function getPurgedAtBoot() { return _getPurgedAtBoot(); }

  function clearPurgedAtBoot() {
    try { localStorage.removeItem(LS_PURGED_KEY); return true; }
    catch(e) { return false; }
  }

  // Modale orange des plans purgés au dernier boot (appelée par le loader) ; la liste est
  // effacée à la fermeture.
  function showPurgedNotifModal(purgedList) {
    if (!Array.isArray(purgedList) || purgedList.length === 0) return;

    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const locale = (window.I18n && window.I18n.getLang) ? window.I18n.getLang() : "fr";

    const existing = document.getElementById("kta-denylist-purged-modal");
    if (existing) existing.remove();

    // Même logique que showDeniedModal, en ambre : palette propre hors charte (décision produit).
    const isLightP = _isLightTheme();
    const pp = isLightP ? {
      backdrop: "rgba(60,45,15,0.45)",
      boxBg:    "linear-gradient(135deg, #fff8e8 0%, #fbeacb 100%)",
      txMain:   "#3a2f10",
      titleCol: "#9a6e1a",
      subCol:   "#7a5a30",
      introCol: "#5a4720",
      itemBg:   "rgba(233,161,59,0.10)",
      itemName: "#3a2f10",
      itemDesc: "#5a4720",
      itemMono: "#7a6240"
    } : {
      backdrop: "rgba(15,10,0,0.85)",
      boxBg:    "linear-gradient(135deg, #2a1f0a 0%, #1a1505 100%)",
      txMain:   "#fff",
      titleCol: "#f4c542",
      subCol:   "#d8c890",
      introCol: "#e8dcc0",
      itemBg:   "rgba(0,0,0,0.3)",
      itemName: "#fff5dc",
      itemDesc: "#e8dcc0",
      itemMono: "#a09580"
    };
    pp.bord = "#e9a13b";
    pp.btnFond = "#e9a13b";
    pp.btnTexte = "#1a1505";
    pp.btnSurvol = "#d18920";

    const overlay = document.createElement("div");
    overlay.id = "kta-denylist-purged-modal";
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:99998",
      "background:" + pp.backdrop, "backdrop-filter:blur(3px)",
      "display:flex", "align-items:center", "justify-content:center",
      "padding:20px", "animation:kta-denylist-fadein 0.3s ease-out"
    ].join(";");

    const box = document.createElement("div");
    box.style.cssText = [
      "max-width:560px", "width:100%", "max-height:80vh", "overflow-y:auto",
      "padding:24px 28px",
      "background:" + pp.boxBg,
      "border:2px solid " + pp.bord, "border-radius:14px",
      "box-shadow:0 0 50px rgba(233,161,59,0.45), 0 8px 32px rgba(0,0,0,0.6)",
      "color:" + pp.txMain, "font-family:system-ui,-apple-system,sans-serif"
    ].join(";");

    const n = purgedList.length;
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:14px;margin-bottom:14px;";
    head.innerHTML =
      '<div style="font-size:38px;line-height:1;flex:0 0 auto;">⚠️</div>' +
      '<div>' +
        '<div style="font-size:18px;font-weight:700;color:' + pp.titleCol + ';letter-spacing:0.3px;">' +
          t(n > 1 ? "denylist.purged.titre.plural" : "denylist.purged.titre.one", { n: n }) +
        '</div>' +
        '<div style="font-size:12px;color:' + pp.subCol + ';margin-top:2px;">' + t(n > 1 ? "denylist.purged.detected.plural" : "denylist.purged.detected.one") + '</div>' +
      '</div>';
    box.appendChild(head);

    const intro = document.createElement("p");
    intro.style.cssText = "font-size:13px;color:" + pp.introCol + ";line-height:1.5;margin:8px 0 14px;";
    intro.textContent = t("denylist.purged.intro");
    box.appendChild(intro);

    const list = document.createElement("ul");
    list.style.cssText = "list-style:none;padding:0;margin:0 0 16px;";
    for (const p of purgedList) {
      const li = document.createElement("li");
      li.style.cssText = "margin:0 0 10px;padding:10px 14px;background:" + pp.itemBg + ";border-left:3px solid " + pp.bord + ";border-radius:6px;";
      const shaShort = p.sha256 ? (p.sha256.slice(0, 12) + "…" + p.sha256.slice(-8)) : t("denylist.purged.hashNA");
      const purgedStr = p.purgedAt ? new Date(p.purgedAt).toLocaleString(locale) : "";
      li.innerHTML =
        '<div style="font-weight:600;color:' + pp.itemName + ';margin-bottom:4px;">📦 ' + _escapeHtml(p.name) + '</div>' +
        '<div style="font-size:12px;color:' + pp.itemDesc + ';margin-bottom:4px;">' +
          '<strong>' + t("denylist.motifLabel") + '</strong> ' + _escapeHtml(p.reason || t("denylist.purged.reasonNone")) +
        '</div>' +
        '<div style="font-size:10.5px;color:' + pp.itemMono + ';font-family:monospace;">' +
          t("denylist.purged.sha256Label") + ' ' + _escapeHtml(shaShort) + (purgedStr ? ' ' + t("denylist.purged.deletedOn", { date: _escapeHtml(purgedStr) }) : '') +
        '</div>';
      list.appendChild(li);
    }
    box.appendChild(list);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:8px;";
    const btn = document.createElement("button");
    btn.textContent = t("denylist.purged.btnOk");
    btn.style.cssText = [
      "padding:10px 22px", "background:" + pp.btnFond, "color:" + pp.btnTexte,
      "border:none", "border-radius:8px", "font-size:14px", "font-weight:700",
      "cursor:pointer", "transition:background 0.15s"
    ].join(";");
    btn.addEventListener("mouseenter", function() { btn.style.background = pp.btnSurvol; });
    btn.addEventListener("mouseleave", function() { btn.style.background = pp.btnFond; });
    btn.addEventListener("click", function() {
      clearPurgedAtBoot();
      overlay.remove();
    });
    actions.appendChild(btn);
    box.appendChild(actions);

    overlay.appendChild(box);
    _injectKeyframes();
    document.body.appendChild(overlay);
  }

  window.PlanDenylist = {
    init:                init,
    isPlanDenied:        isPlanDenied,
    refresh:             function() { _initDone = false; return init(); },
    getDenylist:         function() { return _denylist; },
    computeSha256:       computeSha256,
    showDeniedModal:     showDeniedModal,
    auditPlansLocaux:    auditPlansLocaux,
    getPurgedAtBoot:     getPurgedAtBoot,
    clearPurgedAtBoot:   clearPurgedAtBoot,
    showPurgedNotifModal: showPurgedNotifModal
  };

  console.log("[PlanDenylist] Module chargé (v1.42.3). Init au boot via main.js.");
})();
