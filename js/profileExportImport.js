/*!
 * MyKTAMap — Export / Import de profil utilisateur complet
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// PROFILEEXPORTIMPORT.JS — Profil complet (depuis v1.22.0)
// =========================
// Remplace l'ancien "export liste de plans" (myktamap-plans-list) par un
// vrai export de PROFIL UTILISATEUR comprenant :
//   - Liste des plans (registry, méta seulement — pas les ZIPs binaires)
//   - Préférences utilisateur (app_user_prefs + theme + ...)
//   - Favoris (toutes les listes par plan)
//   - Sessions actives (KtaSessionStore : une par plan)
//   - 📔 Le Carnet (IDB `myktamap_journal` > `sorties`) — 🆕 v1.74.0, coché
//     par défaut. Refs photos seulement, ~2-8 Ko/sortie (plafond 500).
//   - Snapshots IDB (myktamap_backups, FIFO 10/plan)
//   - Tutorial seen flag
//   - Photos POI (OPTIONNEL — case décochée par défaut car potentiellement lourd)
//   - Crash reports (OPTIONNEL — case décochée par défaut car sensible)
//
// EXCLUS PAR DESIGN :
//   - Les ZIPs binaires des plans en dur (`myktamap_handles > blobs`) :
//     trop lourds pour un fichier d'export, et l'user devra de toute façon
//     re-déposer ses fichiers ZIP sur le nouvel appareil. Les méta du
//     registry suffisent à reconstruire la liste.
//   - PIN/Face ID local (`myktamap_pin_v1`) + UnlockGate communautaire
//     (`myktamap_unlock_v1`) : décision KARMA "Non jamais" — risque de
//     fuite si l'export est partagé par erreur. L'user redéfinit son PIN
//     sur le nouvel appareil.
//
// FORMAT FICHIER :
//   JSON unique versionné `{type: "myktamap-profile-export", version: 1, ...}`.
//   Photos POI en base64 inline si incluses (= simplicité vs ZIP+binaires
//   séparés). Fichier potentiellement gros si photos cochées.
//
// RÉTRO-COMPATIBILITÉ :
//   Détection du `type` à l'import :
//     - "myktamap-profile-export" (nouveau v1.22.0) → flow complet par sections
//     - "myktamap-plans-list" (legacy ≤ v1.21.x) → flow legacy registry-only
//
// API : window.ProfileExportImport = {
//   buildProfile(opts),           // assemble selon opts.sections (checkboxes)
//   computeSectionSizes(),        // pour afficher les MB par section
//   exportToFile(opts),           // build + Blob + download (JSON classique)
//   buildProfileArchive(opts),    // 📦 v1.79.0 : conteneur ZIP profil.json + plans/<id>.zip
//   exportArchiveToFile(opts),    // 📦 v1.79.0 : build conteneur + download .zip
//   parseProfile(input),          // valide + retourne {ok, profile, format, error}
//   computeImportStats(profile),  // pour preview UI avant apply
//   applyProfile(profile, opts),  // injecte dans le système (mode merge/replace)
//   isLegacyFormat(input)         // helper détection rétro-compat
// };
// Import : ouvrirImportModale détecte le CONTENEUR au contenu (signature
// « PK ») — un .zip contient profil.json (parsé comme un profil normal) et
// ses archives sont restaurées APRÈS applyProfile (_restaurerArchives).
// =========================

(function() {
  "use strict";

  const FORMAT_TYPE        = "myktamap-profile-export";
  const FORMAT_VERSION     = 1;
  const LEGACY_FORMAT_TYPE = "myktamap-plans-list";

  // Clés localStorage incluses dans la section "preferences"
  const PREF_KEYS = [
    "app_user_prefs",
    "myktamap_theme_v1",
    "myktamap_planner_mode",
    "myktamap_freehand_prefs_v1",
    "myktamap_loader_show_server_plans",
    "myktamap_perf_toggles",        // legacy — plus lue depuis v1.59.0 (per-plan), gardée pour compat vieux exports
    "myktamap_last_version_data",
    "myktamap_total_time_ms",       // 🆕 v1.52.0 : temps cumulé (rang/badge profil) — sinon perdu à migration device
    "myktamap_achievements_v1",     // 🆕 v1.53.0 : hauts faits débloqués (ids + dates)
    "myktamap_home_footer_replie_v1", // 🔽 v1.71.0 : footer HOME replié (demande KARMA « sauvegardé dans le profil »)
    "myktamap_journal_enabled",     // 📔 v1.74.0 : carnet activé/désactivé — voyage avec la section carnet
    "myktamap_wallpaper_prefs_v1",  // 🖼️ v1.75.2 : réglages d'affichage du fond (voile, cadrage, mode).
                                    // ⚠️ L'IMAGE elle-même ne voyage pas encore (elle vit en IDB avec
                                    // l'avatar) — ces réglages arrivent donc sans leur image tant que
                                    // ce point du backlog n'est pas traité.
    // 🌀 v1.67.2 (KARMA « la db des liaisons est-elle exportée ? » → non) :
    // le REGISTRE DES LIAISONS INTER-PLAN est une donnée globale cross-plan —
    // sans lui, une migration d'appareil perdait tout le réseau de portails.
    // À l'import : cas spécial FUSION par id (cf _applyImport) au lieu d'un
    // écrasement, pour ne pas perdre les liaisons créées sur l'appareil cible.
    "myktamap_interplan_links_v1",
    "myktamap_ipr_multihop_v1",     // case « itinéraire via plusieurs plans » (v1.64.0)
    "myktamap_backbtn_mode"         // préférence bouton Retour réduit/complet (v1.61.0)
  ];

  // 🆕 v1.39.15 — Préfixes localStorage per-plan inclus dans la section
  // "perPlanLs" (audit KARMA : la georef GPS, les calibrations de calques
  // image et la note libre Mode Histoire n'étaient pas sauvegardés dans le
  // profile exporté → perdus à reset/migration device).
  //
  // ⚠️ Si tu ajoutes un nouveau préfixe per-plan dans l'app, pense à
  // l'ajouter ici sinon il sera ABSENT de l'export profile (= dette
  // user-facing silencieuse).
  const PER_PLAN_PREFIXES = [
    "myktamap_kmz_calib_",        // GPS georef plan (pointA/B {x,y,lat,lng})
    "myktamap_plan_prefs_",       // prefs cascade per-plan (calibrations image layers v1.38.0, Nord, etc.)
    "myktamap_route_avoid_",      // avoidances itinéraire Pathfinder
    "myktamap_note_libre_",       // note libre Mode Histoire (markdown user)
    "myktamap_perf_toggles_v2_"   // 🆕 v1.59.0 : toggles Perf ULTRA PER-PLAN (ex-clé globale)
  ];

  // ───────── HELPERS ─────────

  function _formatBytes(n) {
    if (n == null || isNaN(n)) return "—";
    const num = Number(n);
    if (num < 1024)               return num + " B";
    if (num < 1024 * 1024)        return (num / 1024).toFixed(1) + " KB";
    if (num < 1024 * 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + " MB";
    return (num / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  function _safeJsonParse(txt) {
    try { return JSON.parse(txt); } catch(e) { return null; }
  }

  function _blobToBase64(blob) {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload  = function() {
        // Retire le préfixe "data:<mime>;base64," — on stocke juste les bytes encodés
        const result = String(reader.result || "");
        const i = result.indexOf(",");
        resolve(i >= 0 ? result.slice(i + 1) : result);
      };
      reader.onerror = function() { reject(reader.error || new Error("FileReader failed")); };
      reader.readAsDataURL(blob);
    });
  }

  function _base64ToBlob(b64, mime) {
    try {
      const binStr = atob(b64);
      const len = binStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
      return new Blob([bytes], { type: mime || "application/octet-stream" });
    } catch(e) {
      console.warn("[ProfileExportImport] _base64ToBlob échec :", e);
      return null;
    }
  }

  // ───────── COLLECTE PAR SECTION ─────────

  function _collectRegistry() {
    // Réutilise l'export legacy de PlanRegistry mais on sépare en "plans" only
    // (sans le wrapper {type, version, exported_at, ...}). Retire fsHandleId.
    if (!window.PlanRegistry) return null;
    try {
      // PlanRegistry n'a pas de getAll() public — on lit via findById + boucle
      // mais c'est mieux d'utiliser exportToFile en mode "build only".
      // Alternative : on lit directement le localStorage "myktamap_plans".
      const raw = localStorage.getItem("myktamap_plans");
      if (!raw) return { plans: [] };
      const parsed = _safeJsonParse(raw);
      if (!parsed || !Array.isArray(parsed.plans)) return { plans: [] };
      const plans = parsed.plans.map(function(p) {
        const clone = Object.assign({}, p);
        delete clone.fsHandleId;  // non portable
        return clone;
      });
      // 📁 16/09/2026 — les dossiers et le mode voyagent avec le registre
      const out = { plans: plans, lastPlanId: parsed.lastPlanId || null };
      if (Array.isArray(parsed.folders) && parsed.folders.length) out.folders = parsed.folders.map(function(f) { return Object.assign({}, f); });
      if (parsed.plansView) out.plansView = parsed.plansView;
      return out;
    } catch(e) {
      console.warn("[ProfileExportImport] registry collect échec :", e);
      return null;
    }
  }

  function _collectPreferences() {
    const prefs = {};
    PREF_KEYS.forEach(function(key) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return;
        // Tente parser JSON, sinon stocke en raw string
        const parsed = _safeJsonParse(raw);
        prefs[key] = (parsed != null) ? parsed : raw;
      } catch(e) {}
    });
    return prefs;
  }

  // 🆕 v1.39.15 — Scan localStorage pour tous les préfixes per-plan PER_PLAN_PREFIXES.
  // Retourne un objet { "<full-ls-key>": <parsed-value-or-string> } prêt à être
  // re-injecté tel quel via setItem au moment de l'import.
  // Le format est PLATEAU et conserve la full key (préfixe + planId) pour
  // robustesse : pas besoin de re-construire la key côté import, on loop juste
  // sur les entries.
  function _collectPerPlanLsKeys() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const hit = PER_PLAN_PREFIXES.some(function(prefix) { return key.startsWith(prefix); });
        if (!hit) continue;
        const raw = localStorage.getItem(key);
        if (raw == null) continue;
        // Tente JSON, sinon raw string (note libre = markdown plain text)
        const parsed = _safeJsonParse(raw);
        out[key] = (parsed != null) ? parsed : raw;
      }
    } catch(e) {
      console.warn("[ProfileExportImport] perPlanLs collect échec :", e);
    }
    return out;
  }

  function _collectFavoris() {
    if (!window.Favoris || typeof window.Favoris.exportToJson !== "function") return null;
    try {
      // exportToJson retourne le format complet, on ne garde que byPlan + meta
      const payload = window.Favoris.exportToJson({ scope: "all" });
      return {
        byPlan:      payload.byPlan || {},
        favVersion:  payload.version || 1
      };
    } catch(e) {
      console.warn("[ProfileExportImport] favoris collect échec :", e);
      return null;
    }
  }

  function _collectSessions() {
    // Toutes les sessions par plan (KtaSessionStore : IndexedDB, ou localStorage en repli)
    const sessions = {};
    try {
      const st = window.KtaSessionStore;
      st.ids().forEach(function(planId) {
        if (!planId) return;
        const parsed = _safeJsonParse(st.lire(planId));
        if (parsed) sessions[planId] = parsed;
      });
      // Inclure aussi le legacy slot unique si présent (cas user qui upgrade
      // depuis v1.16.0 sans avoir bouté en v1.16.1+)
      const legacyRaw = localStorage.getItem("myktamap_session_v1");
      if (legacyRaw) {
        const legacyParsed = _safeJsonParse(legacyRaw);
        if (legacyParsed) sessions["__legacy__"] = legacyParsed;
      }
    } catch(e) {
      console.warn("[ProfileExportImport] sessions collect échec :", e);
    }
    return sessions;
  }

  // 🆕 v1.74.0 — LE CARNET (IDB `myktamap_journal` > `sorties`).
  // Dette soldée : le carnet était la SEULE donnée user qui ne voyageait pas
  // avec le profil (changement d'appareil = historique de sorties perdu).
  // Volume : ~2-8 Ko par sortie, plafond 500 → ~4 Mo pire cas, aucune image
  // (le carnet ne stocke que des REFS photos) → coché par défaut.
  // On exporte AUSSI les records `status: "encours"` : le balayage au boot
  // (`Journal > _balayerEnCours`) les clôturera proprement à l'arrivée.
  async function _collectCarnet() {
    if (!window.Journal || typeof window.Journal.list !== "function") return [];
    try {
      // flush() d'abord : la sortie en cours n'est écrite en IDB que toutes les
      // 30 s — sans ça, exporter juste après une sortie perd les dernières minutes.
      if (typeof window.Journal.flush === "function") {
        try { await window.Journal.flush(); } catch(e) {}
      }
      const arr = await window.Journal.list();
      return Array.isArray(arr) ? arr : [];
    } catch(e) {
      console.warn("[ProfileExportImport] carnet collect échec :", e);
      return [];
    }
  }

  async function _collectBackups() {
    if (!window.SessionBackups || typeof window.SessionBackups.listAll !== "function") return [];
    try {
      const arr = await window.SessionBackups.listAll();
      return Array.isArray(arr) ? arr : [];
    } catch(e) {
      console.warn("[ProfileExportImport] backups collect échec :", e);
      return [];
    }
  }

  function _collectTutorial() {
    try {
      return { seen: !!localStorage.getItem("myktamap_tutorial_seen_v1") };
    } catch(e) {
      return { seen: false };
    }
  }

  async function _collectPhotos() {
    if (!window.MyKTAMapPhotos) return { photos: [], note: "Module MyKTAMapPhotos indisponible" };
    try {
      // On boucle tous les plans connus du registry et on récupère leurs photos
      const reg = _collectRegistry();
      if (!reg || !Array.isArray(reg.plans)) return { photos: [] };
      const allPhotos = [];
      for (const p of reg.plans) {
        if (!p.id) continue;
        try {
          const photos = await window.MyKTAMapPhotos.getAllPhotosForPlan(p.id);
          if (!Array.isArray(photos)) continue;
          for (const ph of photos) {
            // ph = { id, pointId, mime, size, blob, ... } — on encode le blob en base64
            const blob = await window.MyKTAMapPhotos.getBlob(ph.id);
            if (!blob) continue;
            const b64 = await _blobToBase64(blob);
            allPhotos.push({
              id:       ph.id,
              planId:   p.id,
              pointId:  ph.pointId,
              mime:     ph.mime || blob.type || "image/jpeg",
              size:     ph.size || blob.size || 0,
              addedAt:  ph.addedAt || null,
              fiche:    ph.fiche || undefined,   // 📸 fiche du point (retrouver une photo sans point)
              data:     b64   // base64-encoded blob content
            });
          }
        } catch(e) {
          console.warn("[ProfileExportImport] photos plan " + p.id + " échec :", e);
        }
      }
      return { photos: allPhotos };
    } catch(e) {
      console.warn("[ProfileExportImport] photos collect échec :", e);
      return { photos: [] };
    }
  }

  // 🆕 v1.81.0 — PDF du Mode Histoire (dette D1). L'onglet 📖 Récits arrivait
  // sur un nouvel appareil avec ses notes libres mais SANS les documents : le
  // carnet voyageait depuis v1.74.0, pas eux. Même régime que les photos —
  // OPT-IN strict (`include.histoirePdfs === true`), car un plan peut porter
  // jusqu'à 100 Mo de PDF (plafond de modeHistoire.js) : cocher par défaut
  // ferait exploser des exports en silence.
  // Lecture via `window.JournalUi.histoire` — le schéma IDB n'est PAS
  // redupliqué ici (cf. le commentaire de l'API côté journalUi.js).
  async function _collectHistoirePdfs() {
    const api = window.JournalUi && window.JournalUi.histoire;
    if (!api || typeof api.lister !== "function") {
      return { docs: [], note: "Module JournalUi indisponible" };
    }
    try {
      const metas = await api.lister();
      if (!Array.isArray(metas) || !metas.length) return { docs: [] };
      const out = [];
      for (const m of metas) {
        try {
          const rec = await api.getDoc(m.id);
          if (!rec || !rec.blob) continue;
          out.push({
            id:      String(m.id),
            planId:  String(m.planId),
            name:    m.name || "histoire.pdf",
            size:    m.size || rec.blob.size || 0,
            addedAt: m.addedAt || null,
            mime:    rec.blob.type || "application/pdf",
            data:    await _blobToBase64(rec.blob)
          });
        } catch(e) {
          // Un document illisible ne doit pas faire échouer TOUT l'export :
          // on le saute en le disant, le reste part.
          console.warn("[ProfileExportImport] PDF histoire " + m.id + " ignoré :", e);
        }
      }
      return { docs: out };
    } catch(e) {
      console.warn("[ProfileExportImport] PDF histoire collect échec :", e);
      return { docs: [] };
    }
  }

  async function _collectCrashes() {
    if (!window.CrashReports || typeof window.CrashReports.listAll !== "function") return [];
    try {
      const arr = await window.CrashReports.listAll();
      return Array.isArray(arr) ? arr : [];
    } catch(e) {
      return [];
    }
  }

  // v1.21.0 Karma_dev — section "user" (surnom + photo profil)
  // Photo profil est petite (max 512px côté long, JPEG q88 ≈ 30-60 KB),
  // donc base64 inline = OK sans bascule ZIP obligatoire.
  async function _collectUser() {
    if (!window.UserProfile) return null;
    try {
      const snap = window.UserProfile.get();
      const user = {
        surnom:    snap.surnom || "",
        createdAt: snap.createdAt || null,
        updatedAt: snap.updatedAt || null
      };
      if (snap.hasPhoto) {
        const blob = await window.UserProfile.getPhotoBlob();
        if (blob) {
          const b64 = await _blobToBase64(blob);
          user.photoMime = snap.photoMime || blob.type || "image/jpeg";
          user.photoData = b64;
          user.photoSize = blob.size;
        }
      }
      return user;
    } catch(e) {
      console.warn("[ProfileExportImport] user collect échec :", e);
      return null;
    }
  }

  async function _restoreUser(userSection) {
    if (!userSection || !window.UserProfile) return { ok: false, reason: "no-section-or-module" };
    try {
      if (typeof userSection.surnom === "string") {
        await window.UserProfile.setSurnom(userSection.surnom);
      }
      if (userSection.photoData) {
        const blob = _base64ToBlob(userSection.photoData, userSection.photoMime || "image/jpeg");
        if (blob) await window.UserProfile.setPhoto(blob);
      }
      return { ok: true };
    } catch(e) {
      console.warn("[ProfileExportImport] user restore échec :", e);
      return { ok: false, error: String(e) };
    }
  }

  // ───────── BUILD PROFIL ─────────

  /**
   * Assemble le profil selon les sections demandées.
   * @param {Object} opts - { include: { registry, preferences, favoris, sessions, carnet, backups, tutorial, photos, crashes } }
   * @returns {Promise<Object>} le profil complet sérialisable
   */
  async function buildProfile(opts) {
    opts = opts || {};
    const include = opts.include || {};
    const profile = {
      type:       FORMAT_TYPE,
      version:    FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: (window.__MKM__ && window.__MKM__.build) || "?",
      sections:   {}
    };
    if (include.registry !== false)    profile.sections.registry    = _collectRegistry();
    if (include.preferences !== false) profile.sections.preferences = _collectPreferences();
    if (include.perPlanLs !== false)   profile.sections.perPlanLs   = _collectPerPlanLsKeys(); // 🆕 v1.39.15
    if (include.favoris !== false)     profile.sections.favoris     = _collectFavoris();
    if (include.sessions !== false)    profile.sections.sessions    = _collectSessions();
    if (include.tutorial !== false)    profile.sections.tutorial    = _collectTutorial();
    // Async sections
    if (include.user !== false)        profile.sections.user        = await _collectUser();
    if (include.carnet !== false)      profile.sections.carnet      = await _collectCarnet(); // 🆕 v1.74.0
    if (include.backups !== false)     profile.sections.backups     = await _collectBackups();
    if (include.photos === true)       profile.sections.photos      = await _collectPhotos();
    if (include.histoirePdfs === true) profile.sections.histoirePdfs = await _collectHistoirePdfs(); // 🆕 v1.81.0 (D1)
    if (include.crashes === true)      profile.sections.crashes     = await _collectCrashes();
    return profile;
  }

  /**
   * Calcule les tailles estimées des sections (avant export) pour affichage UI.
   * @returns {Promise<Object>} { registry: {count, bytes}, preferences: {...}, ... }
   */
  async function computeSectionSizes() {
    const sizes = {};
    // Registry
    const reg = _collectRegistry();
    sizes.registry = {
      count: (reg && reg.plans) ? reg.plans.length : 0,
      bytes: reg ? JSON.stringify(reg).length : 0
    };
    // Preferences
    const prefs = _collectPreferences();
    sizes.preferences = {
      count: Object.keys(prefs).length,
      bytes: JSON.stringify(prefs).length
    };
    // 🆕 v1.39.15 — perPlanLs (georef GPS + calibrations layers + avoidances iti + note Histoire)
    const perPlan = _collectPerPlanLsKeys();
    sizes.perPlanLs = {
      count: Object.keys(perPlan).length,
      bytes: JSON.stringify(perPlan).length
    };
    // Favoris
    const favs = _collectFavoris();
    let favCount = 0;
    if (favs && favs.byPlan) {
      Object.keys(favs.byPlan).forEach(function(pid) {
        favCount += (favs.byPlan[pid] || []).length;
      });
    }
    sizes.favoris = {
      count: favCount,
      bytes: favs ? JSON.stringify(favs).length : 0
    };
    // Sessions
    const sess = _collectSessions();
    sizes.sessions = {
      count: Object.keys(sess).length,
      bytes: JSON.stringify(sess).length
    };
    // Tutorial
    sizes.tutorial = { count: 1, bytes: 20 };
    // User profile (v1.21.0 Karma_dev) — async (peut contenir photo)
    if (window.UserProfile && typeof window.UserProfile.get === "function") {
      try {
        const snap = window.UserProfile.get();
        let bytes = (snap.surnom || "").length * 2; // approx UTF-16
        let count = (snap.surnom ? 1 : 0);
        if (snap.hasPhoto) {
          const blob = await window.UserProfile.getPhotoBlob();
          if (blob) bytes += Math.round(blob.size * 1.34); // base64 inflation
          count += 1;
        }
        sizes.user = { count: count, bytes: bytes };
      } catch(e) { sizes.user = { count: 0, bytes: 0 }; }
    } else {
      sizes.user = { count: 0, bytes: 0 };
    }
    // Carnet (async) — 🆕 v1.74.0
    try {
      const carnet = await _collectCarnet();
      sizes.carnet = {
        count: carnet.length,
        bytes: JSON.stringify(carnet).length
      };
    } catch(e) { sizes.carnet = { count: 0, bytes: 0 }; }
    // Backups (async)
    try {
      const backups = await _collectBackups();
      sizes.backups = {
        count: backups.length,
        bytes: JSON.stringify(backups).length
      };
    } catch(e) { sizes.backups = { count: 0, bytes: 0 }; }
    // Photos (count + bytes IDB total, sans collecter le base64 qui serait lent)
    if (window.MyKTAMapPhotos && typeof window.MyKTAMapPhotos.getAllPhotosForPlan === "function") {
      try {
        const reg2 = _collectRegistry();
        let count = 0, bytes = 0;
        if (reg2 && reg2.plans) {
          for (const p of reg2.plans) {
            if (!p.id) continue;
            const photos = await window.MyKTAMapPhotos.getAllPhotosForPlan(p.id);
            if (Array.isArray(photos)) {
              count += photos.length;
              photos.forEach(function(ph) { bytes += (ph.size || 0); });
            }
          }
        }
        // base64 inflation factor ~1.33x
        sizes.photos = { count: count, bytes: Math.round(bytes * 1.34) };
      } catch(e) { sizes.photos = { count: 0, bytes: 0 }; }
    } else {
      sizes.photos = { count: 0, bytes: 0 };
    }
    // 🆕 v1.81.0 — PDF du Mode Histoire (D1). Compte + poids depuis les
    // MÉTADONNÉES seulement (`lister()` ne charge aucun blob) : lire les
    // documents pour estimer coûterait jusqu'à 100 Mo de RAM par plan, alors
    // que l'écran d'export doit s'afficher tout de suite. Même facteur
    // d'inflation base64 (~1,34×) que les photos.
    if (window.JournalUi && window.JournalUi.histoire && typeof window.JournalUi.histoire.lister === "function") {
      try {
        const docs = await window.JournalUi.histoire.lister();
        let n = 0, b = 0;
        (Array.isArray(docs) ? docs : []).forEach(function(d) { n++; b += (d.size || 0); });
        sizes.histoirePdfs = { count: n, bytes: Math.round(b * 1.34) };
      } catch(e) { sizes.histoirePdfs = { count: 0, bytes: 0 }; }
    } else {
      sizes.histoirePdfs = { count: 0, bytes: 0 };
    }
    // Crashes
    try {
      const crashes = await _collectCrashes();
      sizes.crashes = {
        count: crashes.length,
        bytes: JSON.stringify(crashes).length
      };
    } catch(e) { sizes.crashes = { count: 0, bytes: 0 }; }
    return sizes;
  }

  /**
   * Build + Blob + download du profil.
   */
  async function exportToFile(opts) {
    const profile = await buildProfile(opts || {});
    const json = JSON.stringify(profile, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    const filename = (opts && opts.filename) || ("myktamap_profile_" + stamp + ".json");
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    return { ok: true, filename: filename, bytes: json.length };
  }

  // ═══════════════════════════════════════════════════════════
  // 📦 v1.79.0 — ARCHIVES DE PLANS DANS L'EXPORT (backlog §3, GO KARMA)
  // ═══════════════════════════════════════════════════════════
  // Conteneur ZIP « profil complet » : profil.json (le profil actuel à
  // l'identique — parseProfile/applyProfile réutilisés tels quels) +
  // plans/<id>.zip (archives sélectionnées, STORE : déjà compressées, la
  // recompression coûterait du temps pour rien). Décisions backlog : pas de
  // base64 inline (+33 % et tout en RAM), sélection par plan + garde-fou de
  // taille en VALIDATION (encadré + confirmation, jamais de clamp silencieux).

  const SEUIL_ARCHIVES_IOS = 50 * 1048576;   // Safari iOS fragile sur les gros blobs
  const SEUIL_ARCHIVES_STD = 500 * 1048576;  // pic RAM generateAsync (desktop/Android)

  function _estIOS() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS desktop-UA
  }
  function _seuilArchives() { return _estIOS() ? SEUIL_ARCHIVES_IOS : SEUIL_ARCHIVES_STD; }

  // Plans dont l'archive est mémorisée dans l'app (flag storedBlob). La
  // taille vient du registre (fileSize) — zéro lecture IDB pour l'UI.
  // ⚠️ storedBlob n'est qu'un FLAG : l'éviction par quota est détectée au
  // moment de l'export (getBlob vide → plan signalé, jamais un zip muet).
  function _listerPlansArchivables() {
    if (!window.PlanRegistry) return [];
    return (window.PlanRegistry.getAll() || [])
      .filter(function(p) { return p && p.type === "local" && p.storedBlob === true; })
      // 🧩 v2.7.0 (prise « filtre d'export ») : une extension peut refuser
      // l'archive d'un plan (plan partagé dont on n'est pas propriétaire).
      // Une prise qui échoue REFUSE. ⚠️ Retirer le bouton n'empêche pas la
      // copie d'un plan qu'on peut lire (données sur l'appareil).
      .filter(function(p) { return !window.KtaExtensions || window.KtaExtensions.exportAutorise(p.id); })
      .map(function(p) { return { id: p.id, name: p.name || p.id, bytes: p.fileSize || 0 }; });
  }

  /**
   * Assemble le conteneur ZIP : profil.json + plans/<id>.zip.
   * opts.include = sections du profil ; opts.planIds = archives à embarquer.
   * Lecture SÉQUENTIELLE des blobs (un seul en RAM côté lecture à la fois).
   * @returns {Promise<{blob, nb, sautes: string[]}>}
   */
  async function buildProfileArchive(opts) {
    opts = opts || {};
    if (typeof window.JSZip === "undefined") throw new Error("JSZip indisponible");
    const profile = await buildProfile(opts);
    const zip = new window.JSZip();
    zip.file("profil.json", JSON.stringify(profile, null, 2));
    const dossier = zip.folder("plans");
    const sautes = [];
    let nb = 0;
    for (const id of (opts.planIds || [])) {
      const p = window.PlanRegistry ? window.PlanRegistry.findById(id) : null;
      const nom = (p && p.name) || id;
      let blob = null;
      try { blob = await window.PlanRegistry.getBlob(id); } catch(e) {}
      if (!blob || blob.size === 0) { sautes.push(nom); continue; }  // évincé par le quota
      dossier.file(id + ".zip", blob, { compression: "STORE" });
      nb++;
    }
    const out = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    return { blob: out, nb: nb, sautes: sautes };
  }

  async function exportArchiveToFile(opts) {
    const res = await buildProfileArchive(opts);
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    const filename = "myktamap_profil_complet_" + stamp + ".zip";
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
    return { ok: true, filename: filename, bytes: res.blob.size, nb: res.nb, sautes: res.sautes };
  }

  /**
   * Restaure les archives d'un conteneur APRÈS applyProfile (le registre
   * contient alors les entrées importées → rattachement par id). Séquentiel :
   * un blob en RAM à la fois. Politique fusion : un plan déjà présent AVEC
   * une archive locale VIVANTE garde la sienne (cohérent registre) ; en
   * remplacement, celle du profil gagne. QuotaExceeded → échec DU PLAN,
   * le lot continue (bilan chiffré).
   * @returns {Promise<{restaures, conserves, orphelins, echecs: string[]}>}
   */
  async function _restaurerArchives(zipConteneur, mode) {
    const bilan = { restaures: 0, conserves: 0, orphelins: 0, echecs: [] };
    const entrees = [];
    zipConteneur.folder("plans").forEach(function(chemin, entry) {
      if (!entry.dir && /\.zip$/i.test(chemin)) entrees.push({ id: chemin.replace(/\.zip$/i, ""), entry: entry });
    });
    for (const e of entrees) {
      const p = window.PlanRegistry ? window.PlanRegistry.findById(e.id) : null;
      if (!p) { bilan.orphelins++; continue; }   // pas d'entrée registre → blob sans foyer
      if (mode !== "replace" && p.storedBlob === true) {
        const dejaLa = await window.PlanRegistry.getBlob(e.id);
        if (dejaLa && dejaLa.size > 0) { bilan.conserves++; continue; }  // le local gagne
      }
      let blob = null;
      try { blob = await e.entry.async("blob"); } catch(err) {
        bilan.echecs.push((p.name || e.id) + " (lecture)");
        continue;
      }
      const res = await window.PlanRegistry.saveBlob(e.id, blob);
      if (res && res.ok) {
        window.PlanRegistry.addOrUpdate({ id: e.id, storedBlob: true });
        bilan.restaures++;
      } else {
        bilan.echecs.push((p.name || e.id) + " (" + ((res && res.error) || "?") + ")");
      }
    }
    return bilan;
  }

  // ───────── PARSE / DÉTECTION FORMAT ─────────

  /**
   * Détecte si le payload est l'ancien format myktamap-plans-list.
   */
  function isLegacyFormat(input) {
    const payload = (typeof input === "string") ? _safeJsonParse(input) : input;
    return !!(payload && payload.type === LEGACY_FORMAT_TYPE && Array.isArray(payload.plans));
  }

  /**
   * Parse + valide. Retourne { ok, profile?, format: "profile"|"legacy", error? }.
   * Format normalisé pour les 2 cas (legacy converti en profil minimal).
   */
  function parseProfile(input) {
    const payload = (typeof input === "string") ? _safeJsonParse(input) : input;
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: window.I18n.t("profileio.err_json_invalid") };
    }
    // Nouveau format v1.22.0+
    if (payload.type === FORMAT_TYPE) {
      if (!payload.sections || typeof payload.sections !== "object") {
        return { ok: false, error: window.I18n.t("profileio.err_sections_missing") };
      }
      return { ok: true, format: "profile", profile: payload };
    }
    // Legacy format ≤ v1.21.x : conversion en profil minimal (registry only)
    if (payload.type === LEGACY_FORMAT_TYPE) {
      if (!Array.isArray(payload.plans)) {
        return { ok: false, error: window.I18n.t("profileio.err_legacy_plans_missing") };
      }
      // Wrap dans un profil minimal pour réutiliser applyProfile()
      return {
        ok:     true,
        format: "legacy",
        profile: {
          type:       FORMAT_TYPE,
          version:    FORMAT_VERSION,
          exportedAt: payload.exported_at || new Date().toISOString(),
          appVersion: "(legacy)",
          sections: {
            registry: { plans: payload.plans }
          }
        }
      };
    }
    return { ok: false, error: window.I18n.t("profileio.err_unknown_type") };
  }

  /**
   * Pour le preview UI avant apply.
   */
  function computeImportStats(profile) {
    if (!profile || !profile.sections) return null;
    const s = profile.sections;
    return {
      user:        s.user        ? ((s.user.surnom ? 1 : 0) + (s.user.photoData ? 1 : 0)) : 0,
      registry:    s.registry    ? ((s.registry.plans || []).length) : 0,
      preferences: s.preferences ? Object.keys(s.preferences).length : 0,
      perPlanLs:   s.perPlanLs   ? Object.keys(s.perPlanLs).length : 0, // 🆕 v1.39.15
      favoris:     s.favoris     ? Object.keys(s.favoris.byPlan || {}).reduce(function(acc, pid) {
                     return acc + (s.favoris.byPlan[pid] || []).length;
                   }, 0) : 0,
      sessions:    s.sessions    ? Object.keys(s.sessions).length : 0,
      carnet:      s.carnet      ? (Array.isArray(s.carnet) ? s.carnet.length : 0) : 0, // 🆕 v1.74.0
      backups:     s.backups     ? (Array.isArray(s.backups) ? s.backups.length : 0) : 0,
      tutorial:    s.tutorial    ? (s.tutorial.seen ? 1 : 0) : 0,
      photos:      (s.photos && Array.isArray(s.photos.photos)) ? s.photos.photos.length : 0,
      histoirePdfs: (s.histoirePdfs && Array.isArray(s.histoirePdfs.docs)) ? s.histoirePdfs.docs.length : 0, // 🆕 v1.81.0 (D1)
      crashes:     s.crashes     ? (Array.isArray(s.crashes) ? s.crashes.length : 0) : 0,
      appVersion:  profile.appVersion || "?",
      exportedAt:  profile.exportedAt || "?"
    };
  }

  // ───────── APPLY (= injection dans le système) ─────────

  /**
   * Injecte le profil dans le système.
   * @param {Object} profile - retourné par parseProfile()
   * @param {Object} opts - { mode: "merge"|"replace", include: { sectionName: bool } }
   * @returns {Promise<Object>} résultat avec compteurs par section
   */
  async function applyProfile(profile, opts) {
    if (!profile || !profile.sections) return { ok: false, error: "Profil invalide" };
    opts = opts || {};
    const mode = (opts.mode === "replace") ? "replace" : "merge";
    const include = opts.include || {
      registry: true, preferences: true, perPlanLs: true,
      favoris: true, sessions: true, carnet: true, backups: true, tutorial: true,
photos: false, histoirePdfs: false, crashes: false
    };
    const s = profile.sections;
    const result = { ok: true, mode: mode, applied: {} };

    // ─── Registry ───
    if (include.registry !== false && s.registry && Array.isArray(s.registry.plans)) {
      try {
        const raw = localStorage.getItem("myktamap_plans");
        let store = _safeJsonParse(raw) || { version: 1, plans: [] };
        // 📁 16/09/2026 — DOSSIERS : fusion par nom (casse ignorée, l'id local
        // gagne) en mode Fusionner, remplacement en mode Remplacer ; le
        // folderId des plans qui ARRIVENT est traduit. Les plans déjà présents
        // ne sont pas touchés (règle anti-doublon ci-dessous) : leur rangement
        // local gagne. Normalisation unique : PlanRegistry.fusionnerDossiers.
        const fusion = (window.PlanRegistry && typeof window.PlanRegistry.fusionnerDossiers === "function")
          ? window.PlanRegistry.fusionnerDossiers(store.folders, s.registry.folders, mode)
          : { folders: (mode === "replace") ? [] : (store.folders || []), table: {} };
        if (fusion.folders.length) store.folders = fusion.folders; else delete store.folders;
        if (mode === "replace" && s.registry.plansView) store.plansView = s.registry.plansView;
        const traduire = function(p) {
          const c = Object.assign({}, p);
          if (c.folderId) {
            const reel = fusion.table[c.folderId];
            if (reel) c.folderId = reel; else { delete c.folderId; delete c.folderSrc; }
          }
          return c;
        };
        if (mode === "replace") {
          store.plans = s.registry.plans.map(traduire);
        } else {
          // merge anti-doublon sur id
          s.registry.plans.forEach(function(p) {
            if (!p || !p.id) return;
            const exists = store.plans.find(function(x) { return x.id === p.id; });
            if (!exists) store.plans.push(traduire(p));
          });
        }
        if (s.registry.lastPlanId && !store.lastPlanId) store.lastPlanId = s.registry.lastPlanId;
        localStorage.setItem("myktamap_plans", JSON.stringify(store));
        // 🐛 v1.79.0 — resync la RAM de PlanRegistry : sans ça, findById ne
        // voyait pas les plans importés (liste invisible avant F5, et la
        // restauration d'archives les classait tous « orphelins »).
        if (window.PlanRegistry && typeof window.PlanRegistry.reload === "function") {
          window.PlanRegistry.reload();
        }
        result.applied.registry = s.registry.plans.length;
      } catch(e) {
        console.warn("[ProfileExportImport] apply registry échec :", e);
      }
    }

    // ─── Preferences ───
    if (include.preferences !== false && s.preferences && typeof s.preferences === "object") {
      try {
        Object.keys(s.preferences).forEach(function(key) {
          const val = s.preferences[key];
          if (val == null) return;
          // app_user_prefs en mode merge : on fusionne les sous-clés
          if (key === "app_user_prefs" && mode === "merge") {
            const existingRaw = localStorage.getItem(key);
            const existing = _safeJsonParse(existingRaw) || {};
            const merged = Object.assign({}, existing, val);
            localStorage.setItem(key, JSON.stringify(merged));
          } else if (key === "myktamap_interplan_links_v1" && mode === "merge"
                     && window.InterPlanLinks && typeof window.InterPlanLinks.importLinks === "function") {
            // 🌀 v1.67.2 : registre des liaisons → FUSION par id (jamais
            // d'écrasement en mode merge — les liaisons déjà créées sur
            // l'appareil cible sont préservées, dédup par link.id via l'API
            // existante v1.57). Mode replace → setItem direct (branche else).
            const links = (val && Array.isArray(val.links)) ? val.links : [];
            const added = window.InterPlanLinks.importLinks(links);
            console.log("[ProfileExportImport] Liaisons inter-plan fusionnées : +" + added);
          } else {
            // Autres clés : remplacement direct (replace ou merge, c'est juste un toggle)
            localStorage.setItem(key,
              typeof val === "string" ? val : JSON.stringify(val));
          }
        });
        result.applied.preferences = Object.keys(s.preferences).length;
      } catch(e) {
        console.warn("[ProfileExportImport] apply preferences échec :", e);
      }
    }

    // 🆕 v1.39.15 — ─── Per-plan localStorage keys (georef + calibrations + avoidances + notes) ───
    // Sémantique merge vs replace :
    //   - merge : skip une clé si déjà présente localement (= préserve les
    //     changements locaux faits depuis l'export, ex: user a re-saisi sa
    //     georef sur le device cible)
    //   - replace : écrasement total (cohérent avec les autres sections en
    //     mode replace)
    // ⚠️ Garde anti-pollution : on filtre les keys contre PER_PLAN_PREFIXES
    // au moment de la restauration, pour ne pas injecter une clé arbitraire
    // si un profil édité à la main contient des clés hors préfixes attendus.
    if (include.perPlanLs !== false && s.perPlanLs && typeof s.perPlanLs === "object") {
      try {
        let n = 0;
        Object.keys(s.perPlanLs).forEach(function(key) {
          if (!key) return;
          const allowed = PER_PLAN_PREFIXES.some(function(prefix) { return key.startsWith(prefix); });
          if (!allowed) return; // garde anti-pollution
          if (mode === "merge" && localStorage.getItem(key) != null) return; // skip si déjà présent
          const val = s.perPlanLs[key];
          if (val == null) return;
          localStorage.setItem(key,
            typeof val === "string" ? val : JSON.stringify(val));
          n++;
        });
        result.applied.perPlanLs = n;
      } catch(e) {
        console.warn("[ProfileExportImport] apply perPlanLs échec :", e);
      }
    }

    // ─── Favoris ───
    if (include.favoris !== false && s.favoris && window.Favoris && typeof window.Favoris.importFromJson === "function") {
      try {
        const favPayload = {
          type:        "myktamap-favoris-export",
          version:     s.favoris.favVersion || 1,
          exportedAt:  profile.exportedAt,
          appVersion:  profile.appVersion,
          scope:       "all",
          byPlan:      s.favoris.byPlan || {}
        };
        const r = window.Favoris.importFromJson(favPayload, { mode: mode });
        result.applied.favoris = r && r.ok ? (r.added + r.replaced) : 0;
      } catch(e) {
        console.warn("[ProfileExportImport] apply favoris échec :", e);
      }
    }

    // ─── Sessions ───
    if (include.sessions !== false && s.sessions && typeof s.sessions === "object") {
      try {
        let n = 0;
        const st = window.KtaSessionStore;
        const ecritures = [];
        Object.keys(s.sessions).forEach(function(planId) {
          if (planId === "__legacy__") {
            // Le slot legacy myktamap_session_v1 sera migré au prochain boot par
            // sessionPersist.js > _migrerAncienSlotUniqueSiBesoin. On écrit dans
            // la clé legacy.
            localStorage.setItem("myktamap_session_v1", JSON.stringify(s.sessions[planId]));
          } else {
            if (mode === "merge") {
              // Skip si on a déjà une session pour ce plan (= ne pas écraser la
              // session en cours de l'user sur le nouvel appareil)
              if (st.lire(planId) != null) return;
            }
            // Écriture ATTENDUE : l'import se termine par un rechargement proposé.
            ecritures.push(st.ecrireDurable(planId, JSON.stringify(s.sessions[planId])));
          }
          n++;
        });
        await Promise.all(ecritures);
        result.applied.sessions = n;
      } catch(e) {
        console.warn("[ProfileExportImport] apply sessions échec :", e);
      }
    }

    // ─── Carnet / sorties (IDB myktamap_journal) — 🆕 v1.74.0 ───
    if (include.carnet !== false && Array.isArray(s.carnet) && s.carnet.length > 0) {
      console.log("[ProfileExportImport] import : section carnet…");
      try {
        // Open IDB direct (même raison que les backups : Journal n'expose pas
        // d'API d'import bulk). ⚠️ L'index `by_start` DOIT être créé ici aussi :
        // si la base n'existe pas encore sur cet appareil, c'est nous qui la
        // créons — sans l'index, la purge FIFO de journal.js casserait.
        const db = await new Promise(function(resolve, reject) {
          const req = indexedDB.open("myktamap_journal", 1);
          req.onupgradeneeded = function() {
            const d = req.result;
            if (!d.objectStoreNames.contains("sorties")) {
              const st = d.createObjectStore("sorties", { keyPath: "id" });
              st.createIndex("by_start", "startedAtMs", { unique: false });
            }
          };
          req.onsuccess = function() { resolve(req.result); };
          req.onerror   = function() { reject(req.error); };
        });
        const tx = db.transaction(["sorties"], "readwrite");
        const store = tx.objectStore("sorties");
        if (mode === "replace") store.clear();
        s.carnet.forEach(function(r) {
          // Filtre défensif : un record sans id ferait échouer put() (keyPath).
          if (r && typeof r === "object" && r.id) { try { store.put(r); } catch(e) {} }
        });
        await new Promise(function(resolve, reject) {
          tx.oncomplete = function() { db.close(); resolve(); };
          tx.onerror    = function() { db.close(); reject(tx.error); };
        });
        result.applied.carnet = s.carnet.length;
      } catch(e) {
        console.warn("[ProfileExportImport] apply carnet échec :", e);
      }
    }

    // ─── Backups (IDB myktamap_backups) ───
    if (include.backups !== false && Array.isArray(s.backups) && s.backups.length > 0) {
      console.log("[ProfileExportImport] import : section backups…");
      try {
        // Open IDB direct (on évite la dépendance circulaire avec SessionBackups
        // qui ne fournit pas d'API d'import bulk)
        const db = await new Promise(function(resolve, reject) {
          const req = indexedDB.open("myktamap_backups", 1);
          req.onupgradeneeded = function() {
            const d = req.result;
            if (!d.objectStoreNames.contains("backups")) d.createObjectStore("backups", { keyPath: "id" });
          };
          req.onsuccess = function() { resolve(req.result); };
          req.onerror   = function() { reject(req.error); };
        });
        const tx = db.transaction(["backups"], "readwrite");
        const store = tx.objectStore("backups");
        if (mode === "replace") store.clear();
        s.backups.forEach(function(b) { try { store.put(b); } catch(e) {} });
        await new Promise(function(resolve, reject) {
          tx.oncomplete = function() { db.close(); resolve(); };
          tx.onerror    = function() { db.close(); reject(tx.error); };
        });
        result.applied.backups = s.backups.length;
      } catch(e) {
        console.warn("[ProfileExportImport] apply backups échec :", e);
      }
    }

    // ─── Tutorial seen ───
    if (include.tutorial !== false && s.tutorial && typeof s.tutorial === "object") {
      try {
        if (s.tutorial.seen) localStorage.setItem("myktamap_tutorial_seen_v1", "1");
        result.applied.tutorial = s.tutorial.seen ? 1 : 0;
      } catch(e) {}
    }

    // ─── Photos POI (si présentes dans le profil ET incluses) ───
    if (include.photos !== false && s.photos && Array.isArray(s.photos.photos) && s.photos.photos.length > 0
        && window.MyKTAMapPhotos && typeof window.MyKTAMapPhotos.restorePhoto === "function") {
      try {
        if (mode === "replace") {
          // Wipe toutes les photos de tous les plans existants
          if (typeof window.MyKTAMapPhotos.clearAll === "function") {
            await window.MyKTAMapPhotos.clearAll();
          }
        }
        let n = 0;
        for (const ph of s.photos.photos) {
          if (!ph || !ph.id || !ph.data || !ph.planId || !ph.pointId) continue;
          try {
            const blob = _base64ToBlob(ph.data, ph.mime);
            if (!blob) continue;
            await window.MyKTAMapPhotos.restorePhoto({
              id:        ph.id,
              planId:    ph.planId,
              pointId:   ph.pointId,
              mime:      ph.mime,
              size:      ph.size || blob.size,
              createdAt: ph.addedAt || Date.now(),
              fiche:     ph.fiche,
              blob:      blob
            }, { source: "import" });   // 📣 restauration de l'app (≠ dépôt d'une extension)
            n++;
          } catch(e) {
            console.warn("[ProfileExportImport] restore photo " + ph.id + " échec :", e);
          }
        }
        result.applied.photos = n;
      } catch(e) {
        console.warn("[ProfileExportImport] apply photos échec :", e);
      }
    }

    // ─── 🆕 v1.81.0 — PDF du Mode Histoire (dette D1) ───
    // Restauration document par document : un PDF illisible ou une base restée
    // en v1 ne doit pas faire échouer le reste de l'import. Pas de wipe en mode
    // « replace » : contrairement aux photos, il n'existe pas d'API de purge
    // globale ici, et `restaurer()` fait un `put` — réimporter le même profil
    // écrase donc les mêmes ids sans créer de doublon (idempotent), ce qui est
    // le comportement voulu dans les deux modes.
    if (include.histoirePdfs !== false && s.histoirePdfs && Array.isArray(s.histoirePdfs.docs)
        && s.histoirePdfs.docs.length > 0
        && window.JournalUi && window.JournalUi.histoire
        && typeof window.JournalUi.histoire.restaurer === "function") {
      let n = 0, v1 = false;
      for (const d of s.histoirePdfs.docs) {
        if (!d || !d.id || !d.planId || !d.data) continue;
        try {
          const blob = _base64ToBlob(d.data, d.mime || "application/pdf");
          if (!blob) continue;
          await window.JournalUi.histoire.restaurer({
            id: d.id, planId: d.planId, name: d.name,
            size: d.size || blob.size, addedAt: d.addedAt, blob: blob
          });
          n++;
        } catch(e) {
          if (String(e && e.message) === "v1") { v1 = true; break; }
          console.warn("[ProfileExportImport] restore PDF histoire " + d.id + " échec :", e);
        }
      }
      result.applied.histoirePdfs = n;
      if (v1) {
        // Base encore au schéma v1 (1 PDF par plan) : y écrire écraserait le
        // document existant. On s'arrête et on le DIT, plutôt que d'abîmer des
        // données en silence. Ouvrir le Mode Histoire une fois déclenche la
        // migration, puis le réimport passe.
        result.warnings = result.warnings || [];
        result.warnings.push("histoirePdfs:v1");
        console.warn("[ProfileExportImport] PDF histoire NON restaurés : base au schéma v1. " +
                     "Ouvre le Mode Histoire une fois (migration auto) puis réimporte.");
      }
    }

    // ─── User profile (v1.21.0 Karma_dev — surnom + photo) ───
    if (include.user !== false && s.user) {
      try {
        console.log("[ProfileExportImport] import : section user…");
        const r = await _restoreUser(s.user);
        result.applied.user = (r && r.ok) ? 1 : 0;
      } catch(e) {
        console.warn("[ProfileExportImport] apply user échec :", e);
      }
    }

    // ─── Crashes (debug only, écriture IDB myktamap_crashes) ───
    if (include.crashes !== false && Array.isArray(s.crashes) && s.crashes.length > 0) {
      try {
        const db = await new Promise(function(resolve, reject) {
          const req = indexedDB.open("myktamap_crashes", 1);
          req.onupgradeneeded = function() {
            const d = req.result;
            if (!d.objectStoreNames.contains("crashes")) d.createObjectStore("crashes", { keyPath: "id" });
          };
          req.onsuccess = function() { resolve(req.result); };
          req.onerror   = function() { reject(req.error); };
        });
        const tx = db.transaction(["crashes"], "readwrite");
        const store = tx.objectStore("crashes");
        if (mode === "replace") store.clear();
        s.crashes.forEach(function(c) { try { store.put(c); } catch(e) {} });
        await new Promise(function(resolve, reject) {
          tx.oncomplete = function() { db.close(); resolve(); };
          tx.onerror    = function() { db.close(); reject(tx.error); };
        });
        result.applied.crashes = s.crashes.length;
      } catch(e) {
        console.warn("[ProfileExportImport] apply crashes échec :", e);
      }
    }

    return result;
  }

  // ===========================================================
  // UI : MODALE EXPORT
  // ===========================================================

  function _escHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function(c) {
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" })[c];
    });
  }

  async function ouvrirExportModale() {
    _fermerModales();

    // Loader initial pendant le calcul async des tailles
    const overlay = document.createElement("div");
    overlay.id = "kta-profile-export-modal";
    overlay.className = "kta-readme-modal-overlay";
    const T = window.I18n.t.bind(window.I18n);
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-profile-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📤 ' + T("profileio.export_title") + '</span>' +
          '<button type="button" class="kta-panneau-close" id="kta-profile-export-close" aria-label="' + T("profileio.close") + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" id="kta-profile-export-corps">' +
          '<div class="kta-mem-loading">⏳ ' + T("profileio.computing_sizes") + '</div>' +
        '</div>' +
        '<div class="kta-profile-footer">' +
          '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-profile-export-cancel">' + T("profileio.cancel") + '</button>' +
          '<button type="button" class="kta-btn kta-btn-primary" id="kta-profile-export-go" disabled>📤 ' + T("profileio.export_btn") + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    document.getElementById("kta-profile-export-close").addEventListener("click", _fermerModales);
    document.getElementById("kta-profile-export-cancel").addEventListener("click", _fermerModales);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _fermerModales(); });
    document.addEventListener("keydown", _onEscape);

    // Calcul async des tailles
    let sizes;
    try { sizes = await computeSectionSizes(); }
    catch(e) {
      const c = document.getElementById("kta-profile-export-corps");
      if (c) c.innerHTML = '<div class="kta-mem-warn">❌ ' + _escHtml(window.I18n.t("profileio.error_prefix", { error: (e.message || e) })) + '</div>';
      return;
    }
    if (!document.getElementById("kta-profile-export-modal")) return; // fermée entre-temps

    _renderExportContent(sizes);
  }

  function _renderExportContent(sizes) {
    const corps = document.getElementById("kta-profile-export-corps");
    if (!corps) return;
    const T = window.I18n.t.bind(window.I18n);
    let html = '';
    html += '<p class="kta-profile-intro">';
    html += T("profileio.export_intro");
    html += '</p>';
    html += '<p class="kta-profile-intro" style="background: rgba(255,140,140,0.06); border:1px solid rgba(255,140,140,0.20); padding:8px 10px; border-radius:6px; color:#ffae80;">';
    html += '🔐 ' + T("profileio.export_security");
    html += '</p>';

    html += '<div class="kta-profile-sections">';
    html += _renderSectionRow("user",        "👤", T("profileio.sec_user_label"),        sizes.user,        true,  T("profileio.sec_user_hint"));
    html += _renderSectionRow("registry",    "🗂️", T("profileio.sec_registry_label"),    sizes.registry,    true,  T("profileio.sec_registry_hint"));
    html += _renderSectionRow("preferences", "⚙️", T("profileio.sec_preferences_label"), sizes.preferences, true,  T("profileio.sec_preferences_hint"));
    html += _renderSectionRow("perPlanLs",   "📍", T("profileio.sec_perplan_label"),     sizes.perPlanLs,   true,  T("profileio.sec_perplan_hint"));
    html += _renderSectionRow("favoris",     "⭐", T("profileio.sec_favoris_label"),      sizes.favoris,     true,  T("profileio.sec_favoris_hint"));
    html += _renderSectionRow("sessions",    "💾", T("profileio.sec_sessions_label"),    sizes.sessions,    true,  T("profileio.sec_sessions_hint"));
    html += _renderSectionRow("carnet",      "📔", T("profileio.sec_carnet_label"),      sizes.carnet,      true,  T("profileio.sec_carnet_hint"));
    html += _renderSectionRow("backups",     "📦", T("profileio.sec_backups_label"),     sizes.backups,     true,  T("profileio.sec_backups_hint"));
    html += _renderSectionRow("tutorial",    "🎓", T("profileio.sec_tutorial_label"),    sizes.tutorial,    true,  T("profileio.sec_tutorial_hint"));
    html += _renderSectionRow("photos",      "📸", T("profileio.sec_photos_label"),      sizes.photos,      false, T("profileio.sec_photos_hint"));
    html += _renderSectionRow("histoirePdfs", "📄", T("profileio.sec_histpdf_label"),    sizes.histoirePdfs, false, T("profileio.sec_histpdf_hint"));
    html += _renderSectionRow("crashes",     "📋", T("profileio.sec_crashes_label"),     sizes.crashes,     false, T("profileio.sec_crashes_hint"));
    html += '</div>';

    // 📦 v1.79.0 — ARCHIVES DE PLANS : sous-liste des plans mémorisés
    // (storedBlob), décochés par défaut (sélection voulue, pas de gros
    // fichier surprise). Cocher au moins un → l'export bascule en conteneur
    // ZIP (profil.json + plans/). Tailles depuis le registre (fileSize).
    const archivables = _listerPlansArchivables();
    if (archivables.length) {
      html += '<div class="kta-profile-sections" style="margin-top:10px;">';
      html += '<div style="font-weight:600; margin:2px 0 4px;">📦 ' + T("profileio.arch_title") + '</div>';
      html += '<div class="kta-profile-row-hint" style="margin:0 0 6px;">' + T("profileio.arch_hint") + '</div>';
      html += '<label class="kta-profile-row" style="font-size:12px;">' +
                '<input type="checkbox" id="kta-profile-arch-all">' +
                '<span class="kta-profile-row-label"><strong>' + T("profileio.arch_all") + '</strong></span>' +
              '</label>';
      archivables.forEach(function(p) {
        html += '<label class="kta-profile-row">' +
                  '<input type="checkbox" data-plan-zip="' + _escHtml(p.id) + '" data-bytes="' + p.bytes + '">' +
                  '<span class="kta-profile-row-emoji">💾</span>' +
                  '<span class="kta-profile-row-label">' +
                    '<strong>' + _escHtml(p.name) + '</strong> ' +
                    '<span class="kta-profile-row-meta">' + _formatBytes(p.bytes) + '</span>' +
                  '</span>' +
                '</label>';
      });
      html += '</div>';
    }

    html += '<div class="kta-profile-total" id="kta-profile-export-total">' +
              '<strong>' + T("profileio.estimated_size") + '</strong> <span id="kta-profile-export-totalsize">—</span>' +
            '</div>';
    html += '<div id="kta-profile-arch-warn" style="display:none; border:1px solid rgba(255,80,80,0.55); background:rgba(255,80,80,0.08); border-radius:6px; padding:8px 10px; margin-top:8px; font-size:12px; color:#ff9c9c;"></div>';

    corps.innerHTML = html;

    // 📦 v1.79.0 — case « tout » + recalcul du total sur les archives
    const cbAll = document.getElementById("kta-profile-arch-all");
    if (cbAll) {
      cbAll.addEventListener("change", function() {
        corps.querySelectorAll('input[data-plan-zip]').forEach(function(cb) { cb.checked = cbAll.checked; });
        _majTotalEstime(sizes);
      });
      corps.querySelectorAll('input[data-plan-zip]').forEach(function(cb) {
        cb.addEventListener("change", function() { _majTotalEstime(sizes); });
      });
    }

    // Bind change handlers pour recalculer le total
    corps.querySelectorAll('input[type="checkbox"][data-section]').forEach(function(cb) {
      cb.addEventListener("change", function() {
        _majTotalEstime(sizes);
      });
    });
    _majTotalEstime(sizes);

    // Activer le bouton Exporter
    const btnGo = document.getElementById("kta-profile-export-go");
    if (btnGo) {
      btnGo.disabled = false;
      btnGo.addEventListener("click", function() {
        const include = {};
        corps.querySelectorAll('input[type="checkbox"][data-section]').forEach(function(cb) {
          include[cb.dataset.section] = cb.checked;
        });
        // 📦 v1.79.0 — archives cochées → export CONTENEUR ZIP ; aucune →
        // JSON classique (comportement historique bit-à-bit).
        const planIds = [];
        let octetsArchives = 0;
        corps.querySelectorAll('input[data-plan-zip]:checked').forEach(function(cb) {
          planIds.push(cb.dataset.planZip);
          octetsArchives += parseInt(cb.dataset.bytes, 10) || 0;
        });

        const lancer = function() {
          const origText = btnGo.textContent;
          btnGo.disabled = true; btnGo.textContent = "⏳ " + window.I18n.t("profileio.generating");
          const promesse = planIds.length
            ? exportArchiveToFile({ include: include, planIds: planIds })
            : exportToFile({ include: include });
          promesse.then(function(res) {
            btnGo.textContent = "✅ " + window.I18n.t("profileio.exported_done");
            // Archives évincées par le quota → dit franchement, pas un zip muet.
            // La fermeture de la modale attend que le message soit lu (comme la popup native bloquante d'avant).
            const lu = (res.sautes && res.sautes.length)
              ? window.ktaAlerte("⚠️ " + window.I18n.t("profileio.arch_sautes", { n: res.sautes.length }) +
                  "\n" + res.sautes.join("\n"))
              : Promise.resolve();
            lu.then(function() { setTimeout(function() {
              _fermerModales();
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(
                  "📤 " + window.I18n.t("profileio.export_toast", { filename: res.filename, size: _formatBytes(res.bytes) }),
                  "info"
                );
              }
            }, 800); });
          }).catch(function(e) {
            btnGo.disabled = false; btnGo.textContent = origText;
            window.ktaAlerte(window.I18n.t("profileio.export_fail", { error: (e.message || e) }), { type: "erreur" });
          });
        };

        // Garde-fou de taille : VALIDATION explicite au-delà du seuil
        // plateforme (iOS 50 Mo / 500 Mo ailleurs), jamais de clamp.
        if (planIds.length && octetsArchives > _seuilArchives()) {
          const msg = window.I18n.t(_estIOS() ? "profileio.arch_seuil_ios" : "profileio.arch_seuil_std",
                                    { taille: _formatBytes(octetsArchives), seuil: _formatBytes(_seuilArchives()) });
          const confirmer = window.ktaConfirm(msg, { okLabel: window.I18n.t("profileio.arch_seuil_ok") });
          confirmer.then(function(ok) { if (ok) lancer(); });
        } else {
          lancer();
        }
      });
    }
  }

  function _renderSectionRow(key, emoji, label, sizeObj, checked, hint) {
    const c = sizeObj ? sizeObj.count : 0;
    const b = sizeObj ? sizeObj.bytes : 0;
    const empty = (c === 0);
    return '<label class="kta-profile-row' + (empty ? ' kta-profile-row-empty' : '') + '">' +
             '<input type="checkbox" data-section="' + key + '" data-bytes="' + b + '" ' +
                (checked && !empty ? 'checked' : '') + (empty ? ' disabled' : '') + '>' +
             '<span class="kta-profile-row-emoji">' + emoji + '</span>' +
             '<span class="kta-profile-row-label">' +
               '<strong>' + _escHtml(label) + '</strong> ' +
               '<span class="kta-profile-row-meta">' + c + ' &middot; ' + _formatBytes(b) + '</span>' +
               '<div class="kta-profile-row-hint">' + hint + '</div>' +
             '</span>' +
           '</label>';
  }

  function _majTotalEstime(sizes) {
    const corps = document.getElementById("kta-profile-export-corps");
    if (!corps) return;
    let totalBytes = 0;
    corps.querySelectorAll('input[type="checkbox"][data-section]').forEach(function(cb) {
      if (cb.checked) totalBytes += parseInt(cb.dataset.bytes, 10) || 0;
    });
    // overhead JSON wrapper (~200 bytes) + indent (~2x sur le total)
    totalBytes = Math.round(totalBytes * 1.1) + 200;
    // 📦 v1.79.0 — archives (STORE : taille ≈ somme des ZIP, sans marge)
    let octetsArchives = 0;
    corps.querySelectorAll('input[data-plan-zip]:checked').forEach(function(cb) {
      octetsArchives += parseInt(cb.dataset.bytes, 10) || 0;
    });
    totalBytes += octetsArchives;
    const el = document.getElementById("kta-profile-export-totalsize");
    if (el) el.textContent = _formatBytes(totalBytes);
    // Encadré rouge de dépassement (l'export reste possible — confirmation
    // explicite au clic, cf garde-fou du bouton).
    const warn = document.getElementById("kta-profile-arch-warn");
    if (warn) {
      if (octetsArchives > _seuilArchives()) {
        warn.style.display = "";
        warn.textContent = "⚠️ " + window.I18n.t(_estIOS() ? "profileio.arch_seuil_ios" : "profileio.arch_seuil_std",
          { taille: _formatBytes(octetsArchives), seuil: _formatBytes(_seuilArchives()) });
      } else {
        warn.style.display = "none";
      }
    }
  }

  // ===========================================================
  // UI : MODALE IMPORT
  // ===========================================================

  async function ouvrirImportModale(file) {
    // 🔒 v1.90.1 (bug KARMA) — REFUS EN KIOSQUE, AU GOULOT ET PAS SUR UN
    // BOUTON. Un import de profil restaure les ARCHIVES ZIP : sur une
    // instance `serverPlansOnly`, il remettait des plans locaux que le mode
    // interdit, et pouvait réécrire les préférences d'affichage des plans
    // serveur — vidant l'accueil. Cacher le bouton n'aurait rien fermé :
    // la modale se déclenche depuis au moins deux endroits, et le sera
    // peut-être depuis un troisième demain.
    if (typeof window.ktaKiosqueServeurSeul === "function" && window.ktaKiosqueServeurSeul()) {
      window.ktaAlerte(window.I18n.t("profileio.kiosque_refus"));
      return;
    }
    if (!file) { window.ktaAlerte(window.I18n.t("profileio.no_file")); return; }
    _fermerModales();

    // 📦 v1.79.0 — détection CONTENEUR au contenu (signature ZIP « PK »),
    // pas à l'extension : un conteneur renommé .json reste importable, un
    // JSON renommé .zip est refusé proprement par JSZip.
    let text;
    let zipConteneur = null;   // JSZip lazy si conteneur — gardé pour la restauration
    let nbArchives = 0;
    try {
      const entete = new Uint8Array(await file.slice(0, 2).arrayBuffer());
      if (entete[0] === 0x50 && entete[1] === 0x4B) {  // "PK"
        if (typeof window.JSZip === "undefined") throw new Error("JSZip indisponible");
        zipConteneur = await window.JSZip.loadAsync(file);
        const entree = zipConteneur.file("profil.json");
        if (!entree) { window.ktaAlerte(window.I18n.t("profileio.arch_pas_profil"), { type: "erreur" }); return; }
        text = await entree.async("string");
        zipConteneur.folder("plans").forEach(function(chemin, e2) {
          if (!e2.dir && /\.zip$/i.test(chemin)) nbArchives++;
        });
      } else {
        text = await file.text();
      }
    }
    catch(e) {
      window.ktaAlerte(window.I18n.t("profileio.file_read_fail", { error: (e.message || e) }), { type: "erreur" });
      return;
    }

    const parsed = parseProfile(text);
    if (!parsed.ok) {
      window.ktaAlerte(window.I18n.t("profileio.file_invalid", { error: parsed.error }), { type: "erreur" });
      return;
    }

    const profile = parsed.profile;
    const isLegacy = (parsed.format === "legacy");
    const stats = computeImportStats(profile);

    const overlay = document.createElement("div");
    overlay.id = "kta-profile-import-modal";
    overlay.className = "kta-readme-modal-overlay";
    const T = window.I18n.t.bind(window.I18n);
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-profile-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📥 ' + T("profileio.import_title") + '</span>' +
          '<button type="button" class="kta-panneau-close" id="kta-profile-import-close" aria-label="' + T("profileio.close") + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" id="kta-profile-import-corps">' +
          _renderImportContent(profile, stats, isLegacy, file.name) +
          // 📦 v1.79.0 — ligne archives si conteneur (case cochée par défaut :
          // c'est la raison d'être d'un profil complet)
          (nbArchives ? (
            '<label class="kta-profile-row" style="margin-top:8px;">' +
              '<input type="checkbox" id="kta-profile-import-archives" checked>' +
              '<span class="kta-profile-row-emoji">📦</span>' +
              '<span class="kta-profile-row-label">' +
                '<strong>' + T("profileio.arch_import_label", { n: nbArchives }) + '</strong> ' +
                '<span class="kta-profile-row-meta">' + _formatBytes(file.size) + '</span>' +
                '<div class="kta-profile-row-hint">' + T("profileio.arch_import_hint") + '</div>' +
              '</span>' +
            '</label>') : '') +
        '</div>' +
        '<div class="kta-profile-footer">' +
          '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-profile-import-cancel">' + T("profileio.cancel") + '</button>' +
          '<button type="button" class="kta-btn kta-btn-primary" id="kta-profile-import-go">📥 ' + T("profileio.import_btn") + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-profile-import-close").addEventListener("click", _fermerModales);
    document.getElementById("kta-profile-import-cancel").addEventListener("click", _fermerModales);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _fermerModales(); });
    document.addEventListener("keydown", _onEscape);

    document.getElementById("kta-profile-import-go").addEventListener("click", async function() {
      const mode = (document.querySelector('input[name="kta-profile-import-mode"]:checked') || {}).value || "merge";
      const include = {};
      document.querySelectorAll('input[type="checkbox"][data-section]').forEach(function(cb) {
        include[cb.dataset.section] = cb.checked;
      });
      if (mode === "replace") {
        const ok = await window.ktaConfirm(window.I18n.t("profileio.replace_confirm"));
        if (!ok) return;
      }
      const btn = document.getElementById("kta-profile-import-go");
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = "⏳ " + window.I18n.t("profileio.importing");
      applyProfile(profile, { mode: mode, include: include }).then(async function(res) {
        if (!res || !res.ok) {
          btn.disabled = false; btn.textContent = orig;
          window.ktaAlerte(window.I18n.t("profileio.import_fail",
            { error: (res && res.error) || window.I18n.t("profileio.unknown_reason") }), { type: "erreur" });
          return;
        }
        // 📦 v1.79.0 — restauration des archives APRÈS le registre (le
        // rattachement par id exige les entrées importées). Séquentiel,
        // bilan intégré à la modale de fin.
        const cbArch = document.getElementById("kta-profile-import-archives");
        if (zipConteneur && cbArch && cbArch.checked) {
          btn.textContent = "⏳ " + window.I18n.t("profileio.arch_restauration");
          try { res.archives = await _restaurerArchives(zipConteneur, mode); }
          catch(e) { res.archives = { restaures: 0, conserves: 0, orphelins: 0, echecs: ["(" + (e.message || e) + ")"] }; }
        }
        btn.textContent = "✅ " + window.I18n.t("profileio.imported_done");
        setTimeout(function() {
          _fermerModales();
          // Refresh GRANULAIRE des modules qui supportent le live update.
          // Pour les autres (prefs, thème, perfPreset, tutoriel flag, etc.),
          // on propose un reload doux via modale charte.
          _refreshAfterImport().then(function() {
            _afficherModaleImportTermine(res, mode);
          });
        }, 800);
      }).catch(function(e) {
        // 🐛 v1.79.0 — FILET : sans ce catch, toute exception dans la chaîne
        // (applyProfile ou restauration) laissait le bouton figé sur
        // « Import en cours » POUR TOUJOURS, sans un mot (unhandled
        // rejection visible qu'en console). L'user voit l'erreur, le bouton
        // revit, il peut réessayer.
        console.error("[ProfileExportImport] import échoué :", e);
        btn.disabled = false; btn.textContent = orig;
        window.ktaAlerte(window.I18n.t("profileio.import_fail", { error: (e && e.message) || String(e) }),
          { type: "erreur" });
      });
    });
  }

  /**
   * Refresh granulaire des modules qui supportent le live update après import.
   * Les modules qui ne supportent PAS le live (thème, perfPreset, etc.)
   * nécessiteront un reload via _afficherModaleImportTermine.
   */
  async function _refreshAfterImport() {
    // (1) Liste des plans visible côté loader
    if (typeof window.refreshPlansList === "function") {
      try { window.refreshPlansList(); } catch(e) {}
    }
    // (2) Bandeau profil utilisateur (force re-init IDB + notify listeners)
    if (window.UserProfile && typeof window.UserProfile.init === "function") {
      try {
        // _initialized flag est privé au module, on force le re-read en
        // appelant init() qui early-return si déjà initialisé. Mais comme
        // _restoreUser a déjà appelé setSurnom + setPhoto qui notifient,
        // les listeners devraient déjà avoir été déclenchés. Belt-and-suspenders.
        await window.UserProfile.init();
      } catch(e) {}
    }
    // (3) Favoris : reload du plan courant si applicable
    if (window.Favoris && window._currentLoadedPlanId && typeof window.Favoris.loadPlan === "function") {
      try { window.Favoris.loadPlan(window._currentLoadedPlanId); } catch(e) {}
    }
    // (4) SessionBackups : ses listeners notifient via onChange (déjà ok)
    return true;
  }

  /**
   * Modale custom charte (cf §35 CLAUDE.md, pattern Promise-based) qui
   * confirme l'import + propose un reload doux pour garantir que TOUT est
   * pris en compte (thème, prefs, perfPreset, tutoriel flag, etc. qui ne
   * supportent pas le live update).
   */
  function _afficherModaleImportTermine(res, mode) {
    // Cleanup éventuel
    const ex = document.getElementById("kta-profile-import-done-modal");
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);

    const T = window.I18n.t.bind(window.I18n);
    // Construit le résumé des sections appliquées
    const SECTION_LABELS = {
      user:        "👤 " + T("profileio.done_sec_user"),
      registry:    "🗂️ " + T("profileio.done_sec_registry"),
      preferences: "⚙️ " + T("profileio.done_sec_preferences"),
      perPlanLs:   T("profileio.done_sec_perPlanLs"),  // 🐛 v1.79.0 : affichait « perPlanLs » brut
      favoris:     "⭐ " + T("profileio.done_sec_favoris"),
      sessions:    "💾 " + T("profileio.done_sec_sessions"),
      carnet:      "📔 " + T("profileio.done_sec_carnet"),
      backups:     "📦 " + T("profileio.done_sec_backups"),
      tutorial:    "🎓 " + T("profileio.done_sec_tutorial"),
      photos:      "📸 " + T("profileio.done_sec_photos"),
      histoirePdfs: "📄 " + T("profileio.done_sec_histpdf"),
      crashes:     "📋 " + T("profileio.done_sec_crashes")
    };
    const parts = [];
    Object.keys(res.applied || {}).forEach(function(k) {
      if (res.applied[k] > 0) {
        const lbl = SECTION_LABELS[k] || k;
        parts.push('<li><strong>' + lbl + '</strong> : ' + res.applied[k] + '</li>');
      }
    });
    // 📦 v1.79.0 — bilan des archives restaurées (si conteneur)
    if (res.archives) {
      const a = res.archives;
      let lbl = T("profileio.arch_bilan", { n: a.restaures });
      if (a.conserves) lbl += " · " + T("profileio.arch_bilan_conserves", { n: a.conserves });
      if (a.orphelins) lbl += " · " + T("profileio.arch_bilan_orphelins", { n: a.orphelins });
      parts.push('<li><strong>📦 ' + lbl + '</strong></li>');
      if (a.echecs.length) {
        parts.push('<li style="color:#ff9c9c;"><strong>⚠️ ' +
          T("profileio.arch_bilan_echecs", { n: a.echecs.length }) + '</strong> : ' +
          _escHtml(a.echecs.join(", ")) + '</li>');
      }
    }
    const summaryHtml = parts.length
      ? '<ul style="margin:8px 0 12px 18px; padding:0;">' + parts.join("") + '</ul>'
      : '<p style="font-style:italic; color:#8892a4;">' + T("profileio.done_nothing") + '</p>';

    const overlay = document.createElement("div");
    overlay.id = "kta-profile-import-done-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:480px; height:auto !important; max-height:88vh !important; border-color:rgba(110,226,135,0.55); box-shadow:0 0 24px rgba(110,226,135,0.18);">' +
        '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(110,226,135,0.25);">' +
          '<span class="kta-readme-modal-titre" style="color:#6ee287;">✅ ' + T("profileio.done_title") + '</span>' +
          '<button type="button" class="kta-panneau-close" id="kta-profile-import-done-close" aria-label="' + T("profileio.close") + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="margin-top:4px;">' +
            T("profileio.done_mode", { mode: _escHtml(mode) }) +
          '</p>' +
          summaryHtml +
          '<div style="background:rgba(244,197,66,0.08); border:1px solid rgba(244,197,66,0.30); border-radius:6px; padding:10px 12px; margin:10px 0;">' +
            '🔄 ' + T("profileio.done_reload_reco") +
          '</div>' +
          '<p style="font-size:12px; color:#8892a4; font-style:italic; margin:8px 0 0;">' +
            T("profileio.done_reload_later") +
          '</p>' +
        '</div>' +
        '<div class="kta-profile-footer" style="display:flex; gap:8px; padding:14px 16px; border-top:1px solid rgba(255,255,255,0.06);">' +
          '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-profile-import-done-later"  style="flex:1;">⏱️ ' + T("profileio.done_later") + '</button>' +
          '<button type="button" class="kta-btn kta-btn-primary" id="kta-profile-import-done-reload" style="flex:1;">🔄 ' + T("profileio.done_reload_now") + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    const _close = function() {
      document.removeEventListener("keydown", _onEsc);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    const _onEsc = function(e) {
      if (e.key === "Escape" || e.key === "Esc") {
        e.stopPropagation();
        _close();
      }
    };
    document.getElementById("kta-profile-import-done-close").addEventListener("click", _close);
    document.getElementById("kta-profile-import-done-later").addEventListener("click", _close);
    document.getElementById("kta-profile-import-done-reload").addEventListener("click", function() {
      // Reload pleine page : garantit que TOUS les modules relisent leur état
      try { window.location.reload(); }
      catch(e) { window.location.assign(window.location.href); }
    });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    document.addEventListener("keydown", _onEsc);

    // Focus auto sur "Recharger" (action recommandée)
    setTimeout(function() {
      const btn = document.getElementById("kta-profile-import-done-reload");
      if (btn) btn.focus();
    }, 50);
  }

  function _renderImportContent(profile, stats, isLegacy, fileName) {
    const T = window.I18n.t.bind(window.I18n);
    let html = '';

    // Banner : legacy vs nouveau format
    if (isLegacy) {
      html += '<div class="kta-profile-banner kta-profile-banner-legacy">' +
                '⚠️ ' + T("profileio.import_banner_legacy") +
              '</div>';
    } else {
      html += '<div class="kta-profile-banner kta-profile-banner-ok">' +
                '✅ ' + T("profileio.import_banner_ok") +
              '</div>';
    }

    html += '<div class="kta-profile-fileinfo">';
    html += '<div><strong>' + T("profileio.fileinfo_file") + '</strong> : <code>' + _escHtml(fileName) + '</code></div>';
    if (stats.exportedAt) {
      html += '<div><strong>' + T("profileio.fileinfo_exported_at") + '</strong> : ' + _escHtml(new Date(stats.exportedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR")) + '</div>';
    }
    if (stats.appVersion) {
      html += '<div><strong>' + T("profileio.fileinfo_source_version") + '</strong> : ' + _escHtml(stats.appVersion) + '</div>';
    }
    html += '</div>';

    html += '<p class="kta-profile-intro">' +
              T("profileio.import_intro") +
            '</p>';

    // Sections présentes dans le profil
    html += '<div class="kta-profile-sections">';
    if (stats.user > 0)    html += _renderImportSection("user",     "👤", T("profileio.sec_user_label"),     stats.user);
    html += _renderImportSection("registry",    "🗂️", T("profileio.import_sec_registry"),  stats.registry);
    html += _renderImportSection("preferences", "⚙️", T("profileio.sec_preferences_label"), stats.preferences);
    if (stats.perPlanLs > 0) html += _renderImportSection("perPlanLs", "📍", T("profileio.sec_perplan_label"), stats.perPlanLs); // 🆕 v1.39.15
    html += _renderImportSection("favoris",     "⭐", T("profileio.sec_favoris_label"),     stats.favoris);
    html += _renderImportSection("sessions",    "💾", T("profileio.sec_sessions_label"),    stats.sessions);
    html += _renderImportSection("carnet",      "📔", T("profileio.import_sec_carnet"),     stats.carnet);
    html += _renderImportSection("backups",     "📦", T("profileio.import_sec_backups"),    stats.backups);
    html += _renderImportSection("tutorial",    "🎓", T("profileio.sec_tutorial_label"),    stats.tutorial);
    if (stats.photos > 0)  html += _renderImportSection("photos",  "📸", T("profileio.sec_photos_label"),    stats.photos);
    if (stats.histoirePdfs > 0) html += _renderImportSection("histoirePdfs", "📄", T("profileio.sec_histpdf_label"), stats.histoirePdfs);
    if (stats.crashes > 0) html += _renderImportSection("crashes", "📋", T("profileio.sec_crashes_label"),   stats.crashes);
    html += '</div>';

    // Mode merge / replace
    html += '<div class="kta-profile-mode">';
    html += '<div class="kta-profile-mode-titre">' + T("profileio.mode_title") + '</div>';
    html += '<label class="kta-profile-mode-row">' +
              '<input type="radio" name="kta-profile-import-mode" value="merge" checked>' +
              '<span>' + T("profileio.mode_merge") + '</span>' +
            '</label>';
    html += '<label class="kta-profile-mode-row">' +
              '<input type="radio" name="kta-profile-import-mode" value="replace">' +
              '<span>' + T("profileio.mode_replace") + '</span>' +
            '</label>';
    html += '</div>';

    return html;
  }

  function _renderImportSection(key, emoji, label, count) {
    const empty = (count === 0);
    return '<label class="kta-profile-row' + (empty ? ' kta-profile-row-empty' : '') + '">' +
             '<input type="checkbox" data-section="' + key + '" ' +
                (empty ? '' : 'checked') + (empty ? ' disabled' : '') + '>' +
             '<span class="kta-profile-row-emoji">' + emoji + '</span>' +
             '<span class="kta-profile-row-label">' +
               '<strong>' + _escHtml(label) + '</strong> ' +
               '<span class="kta-profile-row-meta">' + window.I18n.t("profileio.elements_count", { count: count }) + '</span>' +
             '</span>' +
           '</label>';
  }

  // ───────── HELPERS UI ─────────
  function _fermerModales() {
    document.removeEventListener("keydown", _onEscape);
    ["kta-profile-export-modal", "kta-profile-import-modal"].forEach(function(id) {
      const ex = document.getElementById(id);
      if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
    });
  }

  function _onEscape(e) {
    if (e.key === "Escape" || e.key === "Esc") _fermerModales();
  }

  // ───────── EXPORT API ─────────
  window.ProfileExportImport = {
    buildProfile:        buildProfile,
    computeSectionSizes: computeSectionSizes,
    exportToFile:        exportToFile,
    buildProfileArchive: buildProfileArchive,  // 📦 v1.79.0
    exportArchiveToFile: exportArchiveToFile,  // 📦 v1.79.0
    parseProfile:        parseProfile,
    computeImportStats:  computeImportStats,
    applyProfile:        applyProfile,
    isLegacyFormat:      isLegacyFormat,
    // UI
    ouvrirExportModale:  ouvrirExportModale,
    ouvrirImportModale:  ouvrirImportModale,
    fermerModales:       _fermerModales,
    // Constants exposed for UI labels
    FORMAT_TYPE:         FORMAT_TYPE,
    FORMAT_VERSION:      FORMAT_VERSION,
    LEGACY_FORMAT_TYPE:  LEGACY_FORMAT_TYPE,
    // Helpers
    _formatBytes:        _formatBytes
  };
})();
