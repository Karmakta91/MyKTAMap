/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// PLAN DENYLIST — Kill-switch anti-fuite (v1.42.0)
// =========================
// Permet à KARMA de bloquer l'ouverture de plans dont le ZIP a fuité
// publiquement. À chaque tentative d'import / ouverture d'un plan local :
//   1. SHA-256 du ZIP complet (calculé localement via SubtleCrypto)
//   2. Comparaison à la denylist (téléchargée depuis le serveur, cache 24h)
//   3. Si match → modale rouge bloquante + suppression du plan local
//
// PRIVACY STRICTE :
//   • Aucun hash n'est envoyé au serveur (= 0 fingerprinting des plans owned).
//   • Seule la denylist publique est fetchée (= info publique, anyone peut la lire).
//   • Pattern identique à alertChecker.js : fetch JSON public + check local.
//
// FORMAT denylist.json (publié à la racine du serveur) :
//   {
//     "version": 1,
//     "updated": "2026-06-07T14:00:00Z",
//     "deny": [
//       {
//         "sha256": "<64 chars hex>",
//         "reason": "Fuite publique constatée le 05/06/2026 sur Telegram",
//         "addedAt": "2026-06-07T13:50:00Z"
//       },
//       ...
//     ]
//   }
//
// CACHE STRATEGY :
//   • localStorage["myktamap_denylist_cache"] = { fetchedAt, payload }
//   • TTL 24h. Au-delà, refetch en arrière-plan. Si offline → utilise cache stale
//     (le check est appliqué avec la dernière liste connue, pas désactivé).
//
// QUOI EST CHECKÉ ?
//   • Plans LOCAUX (importés en ZIP) au moment de chargerZipFichier()
//   • Plans IMPORTÉS via FS Access API (même hook)
//   • Plans SERVEUR : pas concernés (publics par définition, hash impossible
//     sans fetch complet du ZIP qui n'existe pas)
//
// API publique :
//   • window.PlanDenylist.init()                        — fetch initial + cache
//   • window.PlanDenylist.isPlanDenied(blob)            — async, retourne {denied, reason?, addedAt?, sha256}
//   • window.PlanDenylist.refresh()                     — force refetch
//   • window.PlanDenylist.getDenylist()                 — debug
//   • window.PlanDenylist.computeSha256(blob)           — helper exposé
//   • window.PlanDenylist.showDeniedModal(info, planId) — affiche modale rouge bloquante
// =========================

(function() {
  "use strict";

  const DENYLIST_URL    = "denylist.json";
  const LS_CACHE_KEY    = "myktamap_denylist_cache";
  const CACHE_TTL_MS    = 24 * 60 * 60 * 1000;  // 24h

  let _denylist = null;       // { version, updated, deny: [{sha256, reason, addedAt}] }
  let _fetchPromise = null;   // dédoublonne fetches concurrents
  let _initDone = false;

  // ============================================================
  // FETCH + CACHE
  // ============================================================
  async function init() {
    if (_initDone) return _denylist;
    _initDone = true;

    // 1. Tentative cache local d'abord (instantané, évite race au 1er boot)
    _denylist = _loadFromCache();
    if (_denylist) {
      console.log("[PlanDenylist] Cache local hit — " + (_denylist.deny || []).length + " entrée(s)");
    }

    // 2. Refetch en arrière-plan si cache expiré OU absent
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
        // 🔇 cache:no-store pour bypasser le SW (denylist doit être TOUJOURS fraîche)
        const resp = await fetch(DENYLIST_URL, { cache: "no-store" });
        if (!resp.ok) {
          // 404 = pas de denylist publiée → liste vide (= aucun blocage)
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
        // Offline / DNS / CORS → on garde le cache existant (fail-safe)
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
        // Note : on évite Date.now() volontairement pour rester pur, mais
        // c'est nécessaire ici pour mesurer l'âge. Date.now() est OK runtime
        // (le warning concernait le workflow scripts, pas le code app).
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

  // ============================================================
  // HASH SHA-256
  // ============================================================
  async function computeSha256(blob) {
    if (!blob || (typeof blob.arrayBuffer !== "function" && !(blob instanceof ArrayBuffer))) {
      throw new Error("computeSha256: blob invalide");
    }
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("computeSha256: SubtleCrypto non disponible (HTTPS requis)");
    }
    const buf = (blob instanceof ArrayBuffer) ? blob : await blob.arrayBuffer();
    const digest = await window.crypto.subtle.digest("SHA-256", buf);
    // Conversion ArrayBuffer → hex string (64 chars)
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  // ============================================================
  // CHECK PLAN
  // ============================================================
  // Retourne :
  //   { denied: false, sha256: "..." } si OK
  //   { denied: true, sha256: "...", reason: "...", addedAt: "..." } si refusé
  async function isPlanDenied(blob) {
    // Lazy init si pas encore fait
    if (!_initDone) await init();

    // Calcul du hash (toujours, même si denylist vide — fail-safe + debug)
    let sha256;
    try {
      sha256 = await computeSha256(blob);
    } catch(e) {
      // SubtleCrypto indispo (HTTP non-HTTPS local dev ?) → on laisse passer
      // pour ne pas bloquer le dev local. Log warning explicite.
      console.warn("[PlanDenylist] Hash impossible — check denylist skip :", e.message);
      return { denied: false, sha256: null, error: e.message };
    }

    // Si denylist absente/vide → aucun blocage
    if (!_denylist || !Array.isArray(_denylist.deny) || _denylist.deny.length === 0) {
      return { denied: false, sha256: sha256 };
    }

    // Lookup linéaire (denylist attendue petite, <100 entrées)
    const lower = sha256.toLowerCase();
    for (const entry of _denylist.deny) {
      if (entry.sha256.toLowerCase() === lower) {
        return {
          denied:  true,
          sha256:  sha256,
          reason:  entry.reason  || "Plan révoqué par l'auteur.",
          addedAt: entry.addedAt || null
        };
      }
    }
    return { denied: false, sha256: sha256 };
  }

  // ============================================================
  // MODALE BLOQUANTE — affichage si refus
  // ============================================================
  function showDeniedModal(info, planId, onDismiss) {
    // Suppression d'une modale existante (anti-doublon)
    const existing = document.getElementById("kta-denylist-modal");
    if (existing) existing.remove();

    const reasonText  = info.reason  || "Plan révoqué par l'auteur.";
    const addedAtStr  = info.addedAt
                       ? new Date(info.addedAt).toLocaleString("fr-FR")
                       : "(date non précisée)";
    const sha256Short = info.sha256
                       ? (info.sha256.slice(0, 12) + "…" + info.sha256.slice(-8))
                       : "(hash indisponible)";

    // 🆕 v1.42.14 — Palette adaptée au thème (gardons le rouge danger fort
    // dans les 2 thèmes — la sémantique reste critique — juste les fonds
    // s'adaptent à la charte).
    const isLight = _isLightTheme();
    const pal = isLight ? {
      backdrop: "rgba(60,30,30,0.55)",
      boxBg:    "linear-gradient(135deg, #fff5f5 0%, #ffe6e6 100%)",
      txMain:   "#3a1010",
      txMuted:  "#7a4040",
      reasonBg: "rgba(211,47,47,0.08)",
      techCol:  "#8a5050",
      monoCol:  "#5a4f40"
    } : {
      backdrop: "rgba(15,5,5,0.92)",
      boxBg:    "linear-gradient(135deg, #2b0f0f 0%, #1a0808 100%)",
      txMain:   "#fff",
      txMuted:  "#ffd0d0",
      reasonBg: "rgba(0,0,0,0.35)",
      techCol:  "#a09595",
      monoCol:  "#9fa9bb"
    };

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
      "border:2px solid #d32f2f", "border-radius:14px",
      "box-shadow:0 0 60px rgba(211,47,47,0.55), 0 8px 32px rgba(0,0,0,0.6)",
      "color:" + pal.txMain, "font-family:system-ui,-apple-system,sans-serif",
      "animation:kta-denylist-pulse 2s ease-in-out infinite"
    ].join(";");

    // En-tête
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:14px;margin-bottom:14px;";
    head.innerHTML =
      '<div style="font-size:42px;line-height:1;flex:0 0 auto;">⛔</div>' +
      '<div>' +
        '<div style="font-size:20px;font-weight:700;color:' + (isLight ? "#b71c1c" : "#ffb4b4") + ';letter-spacing:0.3px;">Plan révoqué</div>' +
        '<div style="font-size:12px;color:' + (isLight ? "#a04040" : "#e8a0a0") + ';margin-top:2px;">Ce plan a été retiré par l\'auteur ou a fuité publiquement.</div>' +
      '</div>';
    box.appendChild(head);

    // Corps : raison
    const body = document.createElement("div");
    body.style.cssText = [
      "margin:14px 0", "padding:14px 16px",
      "background:" + pal.reasonBg, "border-left:3px solid #d32f2f",
      "border-radius:6px", "font-size:14px", "line-height:1.5",
      "color:" + (isLight ? "#3a1010" : "#fff5f5")
    ].join(";");
    body.innerHTML =
      '<div style="font-weight:600;color:' + (isLight ? "#b71c1c" : "#ffd0d0") + ';margin-bottom:6px;">Motif :</div>' +
      '<div>' + _escapeHtml(reasonText) + '</div>';
    box.appendChild(body);

    // Détails techniques
    const tech = document.createElement("div");
    tech.style.cssText = "font-size:11px;color:" + pal.techCol + ";margin:12px 0 18px;line-height:1.6;";
    tech.innerHTML =
      'Ajouté à la liste : <strong style="color:' + (isLight ? "#6a4040" : "#c0b0b0") + ';">' + _escapeHtml(addedAtStr) + '</strong><br>' +
      'Empreinte SHA-256 : <code style="font-family:monospace;color:' + pal.monoCol + ';font-size:11px;">' + _escapeHtml(sha256Short) + '</code>';
    box.appendChild(tech);

    // Action
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:8px;";
    const btn = document.createElement("button");
    btn.textContent = "Compris, supprimer ce plan";
    btn.style.cssText = [
      "padding:10px 22px", "background:#d32f2f", "color:#fff",
      "border:none", "border-radius:8px", "font-size:14px", "font-weight:600",
      "cursor:pointer", "transition:background 0.15s"
    ].join(";");
    btn.addEventListener("mouseenter", function() { btn.style.background = "#b71c1c"; });
    btn.addEventListener("mouseleave", function() { btn.style.background = "#d32f2f"; });
    btn.addEventListener("click", async function() {
      // Suppression du plan + cache associé
      if (planId && window.PlanRegistry) {
        try {
          // Note : PlanRegistry.remove supprime l'entrée. Le blob IDB sera
          // purgé via removeBlob si exposé, sinon resté orphelin (acceptable
          // car id unique non réutilisé). Le SW cache n'a pas de plan local
          // (data/<id>/... n'existe que pour les plans serveur).
          window.PlanRegistry.remove(planId);
          console.log("[PlanDenylist] Plan supprimé du registre :", planId);
        } catch(e) {
          console.warn("[PlanDenylist] Suppression registre échec :", e.message);
        }
      }
      overlay.remove();
      _injectKeyframes();  // safety si retiré du DOM
      if (typeof onDismiss === "function") onDismiss();
      // Recharger la page pour repartir propre (vide la liste loader)
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

  // 🆕 v1.42.14 — Détecte si le thème clair cataphile est actif (themeManager).
  function _isLightTheme() {
    try {
      return document.body.classList.contains("kta-theme-light") ||
             document.documentElement.classList.contains("kta-theme-light");
    } catch(e) { return false; }
  }

  function _escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ============================================================
  // 🆕 v1.42.3 — AUDIT BOOT : check des plans LOCAUX déjà importés
  // ============================================================
  // Au boot, on hash tous les plans `type:"local"` du PlanRegistry et on
  // compare à la denylist actuelle. Permet de purger automatiquement les
  // plans qui ont été révoqués ENTRE 2 sessions (cas où l'user a importé
  // un plan AVANT que KARMA ajoute son hash à la denylist).
  //
  // Performance :
  //   • Cache hash dans le registry (`plan.sha256`) → 1 seul hash par plan
  //     dans sa vie (sauf si KARMA force un re-hash via clearAllHashes()).
  //   • Audit séquentiel en arrière-plan (await yield entre chaque plan)
  //     pour ne pas bloquer le main thread.
  //   • Skip total si denylist vide (= cas commun, 0 charge).
  //
  // Privacy : tout reste local, aucun hash transmis au serveur (cf §80.7
  // doc archi security-legal).
  //
  // Notification :
  //   • Si des plans sont purgés, on stocke un résumé dans
  //     localStorage["myktamap_denylist_purged_at_boot"] que le loader
  //     pourra lire et afficher comme modale d'info.

  const LS_PURGED_KEY = "myktamap_denylist_purged_at_boot";

  // Audit les plans LOCAUX du registry contre la denylist active.
  // Retourne : { audited: N, purged: [{id, name, sha256, reason, addedAt, purgedAt}] }
  async function auditPlansLocaux() {
    if (!_initDone) await init();
    // Skip si denylist vide → 0 charge inutile
    if (!_denylist || !Array.isArray(_denylist.deny) || _denylist.deny.length === 0) {
      return { audited: 0, purged: [], reason: "denylist-empty" };
    }
    if (!window.PlanRegistry || typeof window.PlanRegistry.getAll !== "function") {
      console.warn("[PlanDenylist] PlanRegistry indisponible — audit skip");
      return { audited: 0, purged: [], reason: "no-registry" };
    }

    // Index hash → entry pour lookup O(1) au lieu de N
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
        // 1. Cache hit : si plan.sha256 déjà en cache → check direct
        let hash = (typeof plan.sha256 === "string" && /^[a-f0-9]{64}$/i.test(plan.sha256))
                   ? plan.sha256.toLowerCase()
                   : null;

        // 2. Cache miss : fetch blob + compute hash + persist
        if (!hash) {
          const blob = await window.PlanRegistry.getBlob(plan.id);
          if (!blob) {
            // Plan local sans blob (FS handle ou orphelin) → skip silencieux
            continue;
          }
          try {
            hash = (await computeSha256(blob)).toLowerCase();
          } catch(e) {
            console.warn("[PlanDenylist] Hash plan", plan.id, "échec :", e.message);
            continue;
          }
          // Persiste le hash dans le registry pour ne pas re-hasher au prochain boot
          try {
            window.PlanRegistry.addOrUpdate({ id: plan.id, sha256: hash });
          } catch(e) {
            console.warn("[PlanDenylist] Cache hash échec :", e.message);
          }
        }

        audited++;

        // 3. Lookup denylist
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
            reason:    match.reason  || "Plan révoqué par l'auteur.",
            addedAt:   match.addedAt || null,
            purgedAt:  new Date().toISOString()
          });
        }

        // Yield au main thread entre chaque plan (anti-freeze sur gros plans)
        await new Promise(function(r) { setTimeout(r, 10); });
      } catch(e) {
        console.warn("[PlanDenylist] Audit plan", plan.id, "exception :", e.message);
      }
    }

    // Stocke le résumé pour notif user au prochain affichage du loader
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

  // Lecture/effacement de la liste des plans purgés au boot.
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

  // Affiche une modale orange listant les plans purgés au dernier boot.
  // Appelée depuis le loader si getPurgedAtBoot() retourne une liste non-vide.
  // Auto-clear la liste à la fermeture (ne ré-affiche pas au prochain boot).
  function showPurgedNotifModal(purgedList) {
    if (!Array.isArray(purgedList) || purgedList.length === 0) return;

    const existing = document.getElementById("kta-denylist-purged-modal");
    if (existing) existing.remove();

    // 🆕 v1.42.14 — Palette adaptée au thème (orange ambré reste dominant
    // dans les 2 thèmes — sémantique alerte douce — fonds adaptés).
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
      "border:2px solid #e9a13b", "border-radius:14px",
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
          n + ' plan' + (n > 1 ? 's' : '') + ' révoqué' + (n > 1 ? 's' : '') + ' automatiquement supprimé' + (n > 1 ? 's' : '') +
        '</div>' +
        '<div style="font-size:12px;color:' + pp.subCol + ';margin-top:2px;">Détecté' + (n > 1 ? 's' : '') + ' au démarrage de l\'application.</div>' +
      '</div>';
    box.appendChild(head);

    const intro = document.createElement("p");
    intro.style.cssText = "font-size:13px;color:" + pp.introCol + ";line-height:1.5;margin:8px 0 14px;";
    intro.textContent = "L'auteur a ajouté ces plans à sa liste de révocations publique (fuite, retrait, etc.). " +
                        "Ils ont été supprimés de ta liste pour éviter une utilisation accidentelle.";
    box.appendChild(intro);

    const list = document.createElement("ul");
    list.style.cssText = "list-style:none;padding:0;margin:0 0 16px;";
    for (const p of purgedList) {
      const li = document.createElement("li");
      li.style.cssText = "margin:0 0 10px;padding:10px 14px;background:" + pp.itemBg + ";border-left:3px solid #e9a13b;border-radius:6px;";
      const shaShort = p.sha256 ? (p.sha256.slice(0, 12) + "…" + p.sha256.slice(-8)) : "(hash N/A)";
      const purgedStr = p.purgedAt ? new Date(p.purgedAt).toLocaleString("fr-FR") : "";
      li.innerHTML =
        '<div style="font-weight:600;color:' + pp.itemName + ';margin-bottom:4px;">📦 ' + _escapeHtml(p.name) + '</div>' +
        '<div style="font-size:12px;color:' + pp.itemDesc + ';margin-bottom:4px;">' +
          '<strong>Motif :</strong> ' + _escapeHtml(p.reason || "(non précisé)") +
        '</div>' +
        '<div style="font-size:10.5px;color:' + pp.itemMono + ';font-family:monospace;">' +
          'SHA-256 : ' + _escapeHtml(shaShort) + (purgedStr ? ' · Supprimé le ' + _escapeHtml(purgedStr) : '') +
        '</div>';
      list.appendChild(li);
    }
    box.appendChild(list);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:8px;";
    const btn = document.createElement("button");
    btn.textContent = "Compris";
    btn.style.cssText = [
      "padding:10px 22px", "background:#e9a13b", "color:#1a1505",
      "border:none", "border-radius:8px", "font-size:14px", "font-weight:700",
      "cursor:pointer", "transition:background 0.15s"
    ].join(";");
    btn.addEventListener("mouseenter", function() { btn.style.background = "#d18920"; });
    btn.addEventListener("mouseleave", function() { btn.style.background = "#e9a13b"; });
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

  // ============================================================
  // API PUBLIQUE
  // ============================================================
  window.PlanDenylist = {
    init:                init,
    isPlanDenied:        isPlanDenied,
    refresh:             function() { _initDone = false; return init(); },
    getDenylist:         function() { return _denylist; },
    computeSha256:       computeSha256,
    showDeniedModal:     showDeniedModal,
    // 🆕 v1.42.3 — Audit boot des plans locaux déjà importés
    auditPlansLocaux:    auditPlansLocaux,
    getPurgedAtBoot:     getPurgedAtBoot,
    clearPurgedAtBoot:   clearPurgedAtBoot,
    showPurgedNotifModal: showPurgedNotifModal
  };

  console.log("[PlanDenylist] Module chargé (v1.42.3). Init au boot via main.js.");
})();
