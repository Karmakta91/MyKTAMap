/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// profileExportImport.js — export / import du profil utilisateur complet, par sections : registre des plans
// (méta), préférences, données par plan, favoris, sessions, Carnet, snapshots, tutoriel, profil, et en
// opt-in photos POI, PDF du Mode Histoire, rapports de crash.
// Format : JSON `{type: "myktamap-profile-export", version: 1, …}` (photos en base64), ou conteneur ZIP
// profil.json + plans/<id>.zip si des archives de plans sont cochées. "myktamap-plans-list" (ancien
// format, registre seul) reste importable.
// Expose : window.ProfileExportImport (buildProfile, computeSectionSizes, exportToFile, buildProfileArchive,
//   exportArchiveToFile, parseProfile, computeImportStats, applyProfile(profile, {mode: merge|replace}),
//   isLegacyFormat, ouvrirExportModale, ouvrirImportModale).
// 🔒 Jamais exportés : PIN / Face ID et UnlockGate (fuite si le fichier circule ; décision produit).
// ZIP des plans hors archives cochées : non exportés (trop lourds), le registre suffit à la liste.
// ☁️ Plans d'organisation (registre `type: "ext"`) : écartés par les modales (`exclureExtensions`).
// Garde-fou : scripts/check-profile-histpdf.js, scripts/check-kiosque-serveur.js

(function() {
  "use strict";

  const FORMAT_TYPE        = "myktamap-profile-export";
  const FORMAT_VERSION     = 1;
  const LEGACY_FORMAT_TYPE = "myktamap-plans-list";

  // Section "preferences". ⚠️ Seules ces clés sont écrites à l'import (garde anti-pollution).
  const PREF_KEYS = [
    "app_user_prefs",
    "myktamap_theme_v1",
    "myktamap_planner_mode",
    "myktamap_freehand_prefs_v1",
    "myktamap_loader_show_server_plans",
    "myktamap_perf_toggles",        // ancienne clé globale, plus lue : gardée pour les vieux exports
    "myktamap_last_version_data",
    "myktamap_total_time_ms",       // temps cumulé (rang du profil)
    "myktamap_achievements_v1",
    "myktamap_home_footer_replie_v1",
    "myktamap_journal_enabled",
    "myktamap_wallpaper_prefs_v1",  // ⚠️ réglages seulement : l'image du fond (IDB, avec l'avatar) ne voyage pas
    // Liaisons inter-plan (registre global des portails) : FUSIONNÉES par id à l'import, pour garder celles
    // de l'appareil cible.
    "myktamap_interplan_links_v1",
    "myktamap_ipr_multihop_v1",
    "myktamap_backbtn_mode"
  ];

  // Section "perPlanLs" : préfixes des clés localStorage par plan.
  // 🩸 Un nouveau préfixe par plan dans l'app doit être ajouté ici, sinon il manque à l'export, sans un mot.
  const PER_PLAN_PREFIXES = [
    "myktamap_kmz_calib_",        // géoréf GPS (pointA/B {x,y,lat,lng})
    "myktamap_plan_prefs_",       // préférences par plan (calibrations des calques image, Nord…)
    "myktamap_route_avoid_",      // avoidances itinéraire Pathfinder
    "myktamap_note_libre_",       // note libre Mode Histoire (markdown user)
    "myktamap_perf_toggles_v2_"   // toggles Perf ULTRA PER-PLAN (ex-clé globale)
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

  // ── ☁️ Plans d'une organisation ──────────────
  // 🔒 Un plan fourni par une extension appartient à l'organisation : ni lui, ni sa session, ni ses photos
  // ne partent dans le fichier (en clair), et un import n'en restaure aucun (plans fantômes d'une autre
  // organisation). Ils se récupèrent en se connectant. Seules les modales posent `exclureExtensions: true` ;
  // un appel programmatique sans l'option garde tout.
  // Reconnaissance : registre `type: "ext"` (appareil + fichier), sinon l'id de la fabrique des plans
  // d'extension (main.js > ktaEstIdRegistreExtension) : une session sans sa ligne de registre reste reconnue.

  function _estIdFabriqueExtension(id) {
    if (typeof window.ktaEstIdRegistreExtension === "function") return window.ktaEstIdRegistreExtension(id);
    return typeof id === "string" && id.indexOf("ext_") === 0;
  }

  // → prédicat (planId) → bool. `plansEnPlus` : registre d'un profil importé.
  function _predicatExtension(plansEnPlus) {
    const ids = new Set();
    const ajouter = function(liste) {
      (Array.isArray(liste) ? liste : []).forEach(function(p) {
        if (p && p.type === "ext" && p.id) ids.add(String(p.id));
      });
    };
    const local = _safeJsonParse(localStorage.getItem("myktamap_plans"));
    if (local) ajouter(local.plans);
    ajouter(plansEnPlus);
    return function(id) {
      if (id == null || id === "") return false;
      return ids.has(String(id)) || _estIdFabriqueExtension(String(id));
    };
  }

  // Retire des sections tout ce qui est rattaché à un plan ☁️. Pur : rend des
  // copies, ne touche ni l'appareil ni l'objet reçu.
  // → { sections, plans: Set des ids ☁️ rencontrés }
  function _sansPlansExtension(sections, estExt) {
    const vus = new Set();
    const ext = function(id) { if (estExt(id)) { vus.add(String(id)); return true; } return false; };
    const out = Object.assign({}, sections || {});
    const parPlanId = function(o) { return !(o && ext(o.planId)); };

    if (out.registry && Array.isArray(out.registry.plans)) {
      const r = Object.assign({}, out.registry);
      r.plans = r.plans.filter(function(p) {
        if (p && (p.type === "ext" || ext(p.id))) { if (p.id) vus.add(String(p.id)); return false; }
        return true;
      }).map(function(p) {
        if (p && p.folderId && _estIdFabriqueExtension(p.folderId)) {
          const c = Object.assign({}, p); delete c.folderId; delete c.folderSrc; return c;
        }
        return p;
      });
      if (r.lastPlanId && ext(r.lastPlanId)) r.lastPlanId = null;
      // Dossiers fournis par l'extension (même fabrique d'id) : noms de l'organisation.
      if (Array.isArray(r.folders)) {
        r.folders = r.folders.filter(function(f) { return !(f && _estIdFabriqueExtension(f.id)); });
        if (!r.folders.length) delete r.folders;
      }
      out.registry = r;
    }
    if (out.preferences && typeof out.preferences === "object") {
      const liens = out.preferences.myktamap_interplan_links_v1;
      if (liens && typeof liens === "object" && Array.isArray(liens.links)) {
        out.preferences = Object.assign({}, out.preferences);
        out.preferences.myktamap_interplan_links_v1 = Object.assign({}, liens, {
          links: liens.links.filter(function(l) {
            const a = ext(l && l.a && l.a.planId), b = ext(l && l.b && l.b.planId);
            return !a && !b;
          })
        });
      }
    }
    if (out.perPlanLs && typeof out.perPlanLs === "object") {
      const pp = {};
      Object.keys(out.perPlanLs).forEach(function(cle) {
        const pre = PER_PLAN_PREFIXES.find(function(x) { return cle.indexOf(x) === 0; });
        if (pre && ext(cle.slice(pre.length))) return;
        pp[cle] = out.perPlanLs[cle];
      });
      out.perPlanLs = pp;
    }
    if (out.favoris && out.favoris.byPlan && typeof out.favoris.byPlan === "object") {
      const bp = {};
      Object.keys(out.favoris.byPlan).forEach(function(pid) { if (!ext(pid)) bp[pid] = out.favoris.byPlan[pid]; });
      out.favoris = Object.assign({}, out.favoris, { byPlan: bp });
    }
    if (out.sessions && typeof out.sessions === "object") {
      const ss = {};
      Object.keys(out.sessions).forEach(function(pid) {
        const v = out.sessions[pid];
        if (pid === "__legacy__" ? (v && ext(v.planId)) : ext(pid)) return;
        ss[pid] = v;
      });
      out.sessions = ss;
    }
    if (Array.isArray(out.carnet))  out.carnet  = out.carnet.filter(parPlanId);
    if (Array.isArray(out.backups)) out.backups = out.backups.filter(parPlanId);
    if (Array.isArray(out.crashes)) out.crashes = out.crashes.filter(parPlanId);
    if (out.photos && Array.isArray(out.photos.photos)) {
      out.photos = Object.assign({}, out.photos, { photos: out.photos.photos.filter(parPlanId) });
    }
    if (out.histoirePdfs && Array.isArray(out.histoirePdfs.docs)) {
      out.histoirePdfs = Object.assign({}, out.histoirePdfs, { docs: out.histoirePdfs.docs.filter(parPlanId) });
    }
    return { sections: out, plans: vus };
  }

  // ── Collecte par section ──────────────
  function _collectRegistry() {
    // Lu directement dans localStorage (PlanRegistry n'expose pas de getAll), sans fsHandleId.
    if (!window.PlanRegistry) return null;
    try {
      const raw = localStorage.getItem("myktamap_plans");
      if (!raw) return { plans: [] };
      const parsed = _safeJsonParse(raw);
      if (!parsed || !Array.isArray(parsed.plans)) return { plans: [] };
      const plans = parsed.plans.map(function(p) {
        const clone = Object.assign({}, p);
        delete clone.fsHandleId;  // non portable
        return clone;
      });
      // Les dossiers et le mode d'affichage voyagent avec le registre.
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
        const parsed = _safeJsonParse(raw);
        prefs[key] = (parsed != null) ? parsed : raw;
      } catch(e) {}
    });
    return prefs;
  }

  // → { "<clé complète préfixe+planId>": valeur JSON ou texte brut }, réinjecté tel quel à l'import.
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
        const parsed = _safeJsonParse(raw);   // la note libre est du texte brut
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
    // KtaSessionStore (IndexedDB, ou localStorage en repli).
    const sessions = {};
    try {
      const st = window.KtaSessionStore;
      st.ids().forEach(function(planId) {
        if (!planId) return;
        const parsed = _safeJsonParse(st.lire(planId));
        if (parsed) sessions[planId] = parsed;
      });
      // Ancien slot unique encore présent (jamais migré) : exporté aussi.
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

  // Carnet (IDB `myktamap_journal` > `sorties`) : ~2-8 Ko par sortie, plafond 500, refs photos seulement →
  // coché par défaut. Les sorties `status: "encours"` partent aussi : Journal > _balayerEnCours les clôt à
  // l'arrivée.
  async function _collectCarnet() {
    if (!window.Journal || typeof window.Journal.list !== "function") return [];
    try {
      // 🩸 flush() d'abord : la sortie en cours n'est écrite en IDB que toutes les 30 s.
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

  async function _collectPhotos(estExt) {
    if (!window.MyKTAMapPhotos) return { photos: [], note: "Module MyKTAMapPhotos indisponible" };
    try {
      const reg = _collectRegistry();
      if (!reg || !Array.isArray(reg.plans)) return { photos: [] };
      const allPhotos = [];
      for (const p of reg.plans) {
        if (!p.id) continue;
        if (estExt && (p.type === "ext" || estExt(p.id))) continue;   // ☁️ jamais encodé pour rien
        try {
          const photos = await window.MyKTAMapPhotos.getAllPhotosForPlan(p.id);
          if (!Array.isArray(photos)) continue;
          for (const ph of photos) {
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
              fiche:    ph.fiche || undefined,   // fiche du point (retrouver une photo sans point)
              data:     b64
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

  // PDF du Mode Histoire : OPT-IN strict comme les photos, un plan peut porter 100 Mo de PDF.
  // 🩸 Lecture via window.JournalUi.histoire, jamais en rouvrant la base ici (schéma déjà dupliqué ailleurs).
  async function _collectHistoirePdfs(estExt) {
    const api = window.JournalUi && window.JournalUi.histoire;
    if (!api || typeof api.lister !== "function") {
      return { docs: [], note: "Module JournalUi indisponible" };
    }
    try {
      const metas = await api.lister();
      if (!Array.isArray(metas) || !metas.length) return { docs: [] };
      const out = [];
      for (const m of metas) {
        if (estExt && m && estExt(m.planId)) continue;   // ☁️ jamais lu pour rien
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
          // Document illisible : sauté en le disant, le reste part.
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

  // Section "user" (surnom + photo, ≤ 512 px, ~30-60 Ko : base64 inline acceptable).
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

  // ── Construction du profil ──────────────
  /**
   * @param {Object} opts - { include: { registry, preferences, perPlanLs, favoris, sessions, tutorial, user, carnet,
   *                          backups, photos, histoirePdfs, crashes }, exclureExtensions: bool }
   *                          (photos, histoirePdfs, crashes : opt-in `=== true` ; le reste : `!== false`)
   * @returns {Promise<Object>} le profil sérialisable
   */
  async function buildProfile(opts) {
    opts = opts || {};
    const include = opts.include || {};
    const estExt = opts.exclureExtensions === true ? _predicatExtension() : null;
    const profile = {
      type:       FORMAT_TYPE,
      version:    FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: (window.__MKM__ && window.__MKM__.build) || "?",
      sections:   {}
    };
    if (include.registry !== false)    profile.sections.registry    = _collectRegistry();
    if (include.preferences !== false) profile.sections.preferences = _collectPreferences();
    if (include.perPlanLs !== false)   profile.sections.perPlanLs   = _collectPerPlanLsKeys();
    if (include.favoris !== false)     profile.sections.favoris     = _collectFavoris();
    if (include.sessions !== false)    profile.sections.sessions    = _collectSessions();
    if (include.tutorial !== false)    profile.sections.tutorial    = _collectTutorial();
    if (include.user !== false)        profile.sections.user        = await _collectUser();
    if (include.carnet !== false)      profile.sections.carnet      = await _collectCarnet();
    if (include.backups !== false)     profile.sections.backups     = await _collectBackups();
    if (include.photos === true)       profile.sections.photos      = await _collectPhotos(estExt);
    if (include.histoirePdfs === true) profile.sections.histoirePdfs = await _collectHistoirePdfs(estExt);
    if (include.crashes === true)      profile.sections.crashes     = await _collectCrashes();
    if (estExt) profile.sections = _sansPlansExtension(profile.sections, estExt).sections;
    return profile;
  }

  /**
   * Tailles estimées par section, pour l'écran d'export.
   * @returns {Promise<Object>} { registry: {count, bytes}, preferences: {...}, ... }
   */
  async function computeSectionSizes(opts) {
    const sizes = {};
    // Mêmes exclusions ☁️ que buildProfile : les tailles affichées sont celles du fichier qui partira.
    const estExt = (opts && opts.exclureExtensions === true) ? _predicatExtension() : null;
    const filtrer = function(nom, val) {
      if (!estExt || val == null) return val;
      const o = {}; o[nom] = val;
      return _sansPlansExtension(o, estExt).sections[nom];
    };
    // Registry
    const reg = filtrer("registry", _collectRegistry());
    sizes.registry = {
      count: (reg && reg.plans) ? reg.plans.length : 0,
      bytes: reg ? JSON.stringify(reg).length : 0
    };
    const prefs = _collectPreferences();
    sizes.preferences = {
      count: Object.keys(prefs).length,
      bytes: JSON.stringify(prefs).length
    };
    const perPlan = filtrer("perPlanLs", _collectPerPlanLsKeys());
    sizes.perPlanLs = {
      count: Object.keys(perPlan).length,
      bytes: JSON.stringify(perPlan).length
    };
    const favs = filtrer("favoris", _collectFavoris());
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
    const sess = filtrer("sessions", _collectSessions());
    sizes.sessions = {
      count: Object.keys(sess).length,
      bytes: JSON.stringify(sess).length
    };
    sizes.tutorial = { count: 1, bytes: 20 };
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
    try {
      const carnet = filtrer("carnet", await _collectCarnet());
      sizes.carnet = {
        count: carnet.length,
        bytes: JSON.stringify(carnet).length
      };
    } catch(e) { sizes.carnet = { count: 0, bytes: 0 }; }
    try {
      const backups = filtrer("backups", await _collectBackups());
      sizes.backups = {
        count: backups.length,
        bytes: JSON.stringify(backups).length
      };
    } catch(e) { sizes.backups = { count: 0, bytes: 0 }; }
    // Photos : tailles IDB × 1,34 (base64), sans encoder (trop lent).
    if (window.MyKTAMapPhotos && typeof window.MyKTAMapPhotos.getAllPhotosForPlan === "function") {
      try {
        const reg2 = filtrer("registry", _collectRegistry());
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
        sizes.photos = { count: count, bytes: Math.round(bytes * 1.34) };
      } catch(e) { sizes.photos = { count: 0, bytes: 0 }; }
    } else {
      sizes.photos = { count: 0, bytes: 0 };
    }
    // PDF : depuis les MÉTADONNÉES seulement (lister() ne charge aucun blob ; lire les documents coûterait
    // jusqu'à 100 Mo de RAM par plan avant d'afficher l'écran).
    if (window.JournalUi && window.JournalUi.histoire && typeof window.JournalUi.histoire.lister === "function") {
      try {
        const docs = await window.JournalUi.histoire.lister();
        let n = 0, b = 0;
        (Array.isArray(docs) ? docs : []).forEach(function(d) {
          if (estExt && d && estExt(d.planId)) return;
          n++; b += (d.size || 0);
        });
        sizes.histoirePdfs = { count: n, bytes: Math.round(b * 1.34) };
      } catch(e) { sizes.histoirePdfs = { count: 0, bytes: 0 }; }
    } else {
      sizes.histoirePdfs = { count: 0, bytes: 0 };
    }
    try {
      const crashes = filtrer("crashes", await _collectCrashes());
      sizes.crashes = {
        count: crashes.length,
        bytes: JSON.stringify(crashes).length
      };
    } catch(e) { sizes.crashes = { count: 0, bytes: 0 }; }
    // ☁️ Nombre de plans d'organisation laissés de côté (note de la modale).
    if (estExt) {
      sizes.extExclus = _sansPlansExtension({
        registry: _collectRegistry(), perPlanLs: _collectPerPlanLsKeys(),
        favoris: _collectFavoris(), sessions: _collectSessions()
      }, estExt).plans.size;
    }
    return sizes;
  }

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

  // ── Archives de plans dans l'export ──────────────
  // Conteneur ZIP : profil.json (profil identique, parseProfile/applyProfile tels quels) + plans/<id>.zip en
  // STORE (déjà compressés). Pas de base64 inline (+33 %, tout en RAM). Garde-fou de taille par
  // CONFIRMATION, jamais de coupe silencieuse (décision produit).

  const SEUIL_ARCHIVES_IOS = 50 * 1048576;   // Safari iOS fragile sur les gros blobs
  const SEUIL_ARCHIVES_STD = 500 * 1048576;  // pic RAM generateAsync (desktop/Android)

  function _estIOS() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS desktop-UA
  }
  function _seuilArchives() { return _estIOS() ? SEUIL_ARCHIVES_IOS : SEUIL_ARCHIVES_STD; }

  // Plans dont l'archive est mémorisée (storedBlob) ; taille lue dans le registre, sans IDB.
  // ⚠️ storedBlob n'est qu'un drapeau : une éviction par quota se voit à l'export (plan signalé).
  function _listerPlansArchivables() {
    if (!window.PlanRegistry) return [];
    return (window.PlanRegistry.getAll() || [])
      .filter(function(p) { return p && p.type === "local" && p.storedBlob === true; })
      // Prise « filtre d'export » : une extension peut refuser l'archive d'un plan ; une prise qui échoue
      // REFUSE. ⚠️ Ça n'empêche pas de copier un plan lisible sur l'appareil.
      .filter(function(p) { return !window.KtaExtensions || window.KtaExtensions.exportAutorise(p.id); })
      .map(function(p) { return { id: p.id, name: p.name || p.id, bytes: p.fileSize || 0 }; });
  }

  /**
   * opts.include = sections ; opts.planIds = archives. Blobs lus un par un (un seul en RAM côté lecture).
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
   * ⚠️ APRÈS applyProfile : le rattachement se fait par id dans le registre importé. Un blob à la fois.
   * Fusion : une archive locale vivante est gardée ; remplacement : celle du fichier gagne.
   * Échec d'un plan (quota) → noté, le lot continue.
   * @returns {Promise<{restaures, conserves, orphelins, echecs: string[]}>}
   */
  async function _restaurerArchives(zipConteneur, mode, estExt) {
    const bilan = { restaures: 0, conserves: 0, orphelins: 0, echecs: [], extIgnores: [] };
    const entrees = [];
    zipConteneur.folder("plans").forEach(function(chemin, entry) {
      if (!entry.dir && /\.zip$/i.test(chemin)) entrees.push({ id: chemin.replace(/\.zip$/i, ""), entry: entry });
    });
    for (const e of entrees) {
      // ☁️ Jamais depuis un fichier : elle écraserait celle de l'organisation.
      if (estExt && estExt(e.id)) { bilan.extIgnores.push(e.id); continue; }
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

  // ── Lecture et détection du format ──────────────
  function isLegacyFormat(input) {
    const payload = (typeof input === "string") ? _safeJsonParse(input) : input;
    return !!(payload && payload.type === LEGACY_FORMAT_TYPE && Array.isArray(payload.plans));
  }

  // → { ok, profile?, format: "profile"|"legacy", error? } ; l'ancien format devient un profil minimal.
  function parseProfile(input) {
    const payload = (typeof input === "string") ? _safeJsonParse(input) : input;
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: window.I18n.t("profileio.err_json_invalid") };
    }
    if (payload.type === FORMAT_TYPE) {
      if (!payload.sections || typeof payload.sections !== "object") {
        return { ok: false, error: window.I18n.t("profileio.err_sections_missing") };
      }
      return { ok: true, format: "profile", profile: payload };
    }
    if (payload.type === LEGACY_FORMAT_TYPE) {
      if (!Array.isArray(payload.plans)) {
        return { ok: false, error: window.I18n.t("profileio.err_legacy_plans_missing") };
      }
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

  // Compteurs pour l'aperçu d'import.
  function computeImportStats(profile) {
    if (!profile || !profile.sections) return null;
    const s = profile.sections;
    return {
      user:        s.user        ? ((s.user.surnom ? 1 : 0) + (s.user.photoData ? 1 : 0)) : 0,
      registry:    s.registry    ? ((s.registry.plans || []).length) : 0,
      preferences: s.preferences ? Object.keys(s.preferences).length : 0,
      perPlanLs:   s.perPlanLs   ? Object.keys(s.perPlanLs).length : 0,
      favoris:     s.favoris     ? Object.keys(s.favoris.byPlan || {}).reduce(function(acc, pid) {
                     return acc + (s.favoris.byPlan[pid] || []).length;
                   }, 0) : 0,
      sessions:    s.sessions    ? Object.keys(s.sessions).length : 0,
      carnet:      s.carnet      ? (Array.isArray(s.carnet) ? s.carnet.length : 0) : 0,
      backups:     s.backups     ? (Array.isArray(s.backups) ? s.backups.length : 0) : 0,
      tutorial:    s.tutorial    ? (s.tutorial.seen ? 1 : 0) : 0,
      photos:      (s.photos && Array.isArray(s.photos.photos)) ? s.photos.photos.length : 0,
      histoirePdfs: (s.histoirePdfs && Array.isArray(s.histoirePdfs.docs)) ? s.histoirePdfs.docs.length : 0,
      crashes:     s.crashes     ? (Array.isArray(s.crashes) ? s.crashes.length : 0) : 0,
      appVersion:  profile.appVersion || "?",
      exportedAt:  profile.exportedAt || "?"
    };
  }

  // ── Application du profil ──────────────
  // Écrit `records` dans un store IDB (keyPath "id") et ferme la base. vider : mode « replace ».
  // garder(record) → bool : ce que le vidage épargne (☁️) ; absent = vidage total.
  // 🩸 Lecture, suppressions puis écritures dans la MÊME transaction et dans cet ordre : un curseur ouvert
  // avant les put() effacerait les nouveaux.
  function _remplirStore(db, nom, records, vider, garder) {
    return new Promise(function(resolve, reject) {
      const tx = db.transaction([nom], "readwrite");
      const store = tx.objectStore(nom);
      const poser = function() { records.forEach(function(r) { try { store.put(r); } catch(e) {} }); };
      if (!vider) poser();
      else if (!garder) { store.clear(); poser(); }
      else {
        const req = store.getAll();
        req.onsuccess = function() {
          (req.result || []).forEach(function(r) {
            if (r && r.id != null && !garder(r)) { try { store.delete(r.id); } catch(e) {} }
          });
          poser();
        };
      }
      tx.oncomplete = function() { db.close(); resolve(); };
      tx.onerror    = function() { db.close(); reject(tx.error); };
    });
  }

  /**
   * @param {Object} profile - retourné par parseProfile()
   * @param {Object} opts - { mode: "merge"|"replace", include: { sectionName: bool },
   *                          exclureExtensions: bool (☁️ rien d'un plan d'organisation n'est restauré, ni
   *                          effacé en « replace » → result.ignores) }
   * @returns {Promise<Object>} compteurs par section
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
    let s = profile.sections;
    const result = { ok: true, mode: mode, applied: {} };
    // ☁️ Ignoré à l'arrivée ; en « replace », ce que l'appareil en a est CONSERVÉ (resynchronisé avec
    // l'organisation, pas avec un fichier).
    const estExt = opts.exclureExtensions === true
      ? _predicatExtension(s.registry && s.registry.plans) : null;
    if (estExt) {
      const tri = _sansPlansExtension(s, estExt);
      s = tri.sections;
      result.ignores = { plansExtension: tri.plans.size, ids: Array.from(tri.plans) };
    }
    const garderExt = estExt ? function(r) { return !!(r && estExt(r.planId)); } : null;

    // ─── Registry ───
    if (include.registry !== false && s.registry && Array.isArray(s.registry.plans)) {
      try {
        const raw = localStorage.getItem("myktamap_plans");
        let store = _safeJsonParse(raw) || { version: 1, plans: [] };
        if (!Array.isArray(store.plans)) store.plans = [];
        // ☁️ Conservés en remplacement : entrées et dossiers de l'organisation.
        const extLocaux = estExt ? store.plans.filter(function(p) { return p && p.type === "ext"; }) : [];
        const dossiersExtLocaux = estExt ? (store.folders || []).filter(function(f) {
          return f && _estIdFabriqueExtension(f.id);
        }) : [];
        // Dossiers (PlanRegistry.fusionnerDossiers) : fusion par nom, casse ignorée, l'id local gagne ; le
        // folderId des plans qui ARRIVENT est traduit, le rangement des plans déjà présents ne bouge pas.
        const fusion = (window.PlanRegistry && typeof window.PlanRegistry.fusionnerDossiers === "function")
          ? window.PlanRegistry.fusionnerDossiers(store.folders, s.registry.folders, mode)
          : { folders: (mode === "replace") ? [] : (store.folders || []), table: {} };
        let dossiers = fusion.folders;
        if (mode === "replace" && dossiersExtLocaux.length) {
          dossiers = dossiers.concat(dossiersExtLocaux.filter(function(f) {
            return !dossiers.some(function(x) { return x.id === f.id; });
          }));
        }
        if (dossiers.length) store.folders = dossiers; else delete store.folders;
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
          store.plans = s.registry.plans.map(traduire).concat(extLocaux);
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
        // 🩸 Recharger la RAM de PlanRegistry : sinon findById ignore les plans importés (liste invisible
        // avant F5, archives toutes classées « orphelins »).
        if (window.PlanRegistry && typeof window.PlanRegistry.reload === "function") {
          window.PlanRegistry.reload();
        }
        result.applied.registry = s.registry.plans.length;
      } catch(e) {
        console.warn("[ProfileExportImport] apply registry échec :", e);
      }
    }

    // ─── Préférences ───
    if (include.preferences !== false && s.preferences && typeof s.preferences === "object") {
      try {
        let appliquees = 0;
        Object.keys(s.preferences).forEach(function(key) {
          // 🔒 Garde anti-pollution : un fichier ne peut pas poser une autre clé (session, extension, sécurité).
          if (PREF_KEYS.indexOf(key) === -1) return;
          const val = s.preferences[key];
          if (val == null) return;
          appliquees++;
          // app_user_prefs en fusion : sous-clés fusionnées.
          if (key === "app_user_prefs" && mode === "merge") {
            const existingRaw = localStorage.getItem(key);
            const existing = _safeJsonParse(existingRaw) || {};
            const merged = Object.assign({}, existing, val);
            localStorage.setItem(key, JSON.stringify(merged));
          } else if (key === "myktamap_interplan_links_v1" && mode === "merge"
                     && window.InterPlanLinks && typeof window.InterPlanLinks.importLinks === "function") {
            // Liaisons : fusion par link.id (InterPlanLinks.importLinks), celles de l'appareil restent.
            const links = (val && Array.isArray(val.links)) ? val.links : [];
            const added = window.InterPlanLinks.importLinks(links);
            console.log("[ProfileExportImport] Liaisons inter-plan fusionnées : +" + added);
          } else if (key === "myktamap_interplan_links_v1" && estExt && val && Array.isArray(val.links)) {
            // ☁️ Remplacement : les liaisons locales touchant un plan d'organisation restent.
            const local = _safeJsonParse(localStorage.getItem(key));
            const gardees = (local && Array.isArray(local.links) ? local.links : []).filter(function(l) {
              return l && ((l.a && estExt(l.a.planId)) || (l.b && estExt(l.b.planId)));
            });
            const ids = {};
            val.links.forEach(function(l) { if (l && l.id) ids[l.id] = true; });
            localStorage.setItem(key, JSON.stringify(Object.assign({}, val, {
              links: val.links.concat(gardees.filter(function(l) { return !ids[l.id]; }))
            })));
          } else {
            localStorage.setItem(key,
              typeof val === "string" ? val : JSON.stringify(val));
          }
        });
        result.applied.preferences = appliquees;
      } catch(e) {
        console.warn("[ProfileExportImport] apply preferences échec :", e);
      }
    }

    // ─── Clés par plan ───
    // Fusion : une clé déjà présente localement est gardée ; remplacement : écrasée.
    // 🔒 Garde anti-pollution : seules les clés des PER_PLAN_PREFIXES (profil édité à la main).
    if (include.perPlanLs !== false && s.perPlanLs && typeof s.perPlanLs === "object") {
      try {
        let n = 0;
        Object.keys(s.perPlanLs).forEach(function(key) {
          if (!key) return;
          const allowed = PER_PLAN_PREFIXES.some(function(prefix) { return key.startsWith(prefix); });
          if (!allowed) return;
          if (mode === "merge" && localStorage.getItem(key) != null) return;
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
            // Ancien slot : migré au boot suivant par sessionPersist.js > _migrerAncienSlotUniqueSiBesoin.
            localStorage.setItem("myktamap_session_v1", JSON.stringify(s.sessions[planId]));
          } else {
            if (mode === "merge") {
              // La session déjà présente sur l'appareil gagne.
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

    // ─── Carnet (IDB myktamap_journal) ───
    if (include.carnet !== false && Array.isArray(s.carnet) && s.carnet.length > 0) {
      console.log("[ProfileExportImport] import : section carnet…");
      try {
        // IDB ouverte ici (Journal n'a pas d'import en masse). 🩸 Créer aussi l'index `by_start` : si la base
        // naît ici, la purge FIFO de journal.js casserait sans lui.
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
        // Sans id, put() échoue (keyPath).
        const sorties = s.carnet.filter(function(r) { return r && typeof r === "object" && r.id; });
        await _remplirStore(db, "sorties", sorties, mode === "replace", garderExt);
        result.applied.carnet = s.carnet.length;
      } catch(e) {
        console.warn("[ProfileExportImport] apply carnet échec :", e);
      }
    }

    // ─── Backups (IDB myktamap_backups) ───
    if (include.backups !== false && Array.isArray(s.backups) && s.backups.length > 0) {
      console.log("[ProfileExportImport] import : section backups…");
      try {
        // IDB ouverte ici : SessionBackups n'a pas d'import en masse (et dépendance circulaire évitée).
        const db = await new Promise(function(resolve, reject) {
          const req = indexedDB.open("myktamap_backups", 1);
          req.onupgradeneeded = function() {
            const d = req.result;
            if (!d.objectStoreNames.contains("backups")) d.createObjectStore("backups", { keyPath: "id" });
          };
          req.onsuccess = function() { resolve(req.result); };
          req.onerror   = function() { reject(req.error); };
        });
        await _remplirStore(db, "backups", s.backups, mode === "replace", garderExt);
        result.applied.backups = s.backups.length;
      } catch(e) {
        console.warn("[ProfileExportImport] apply backups échec :", e);
      }
    }

    // ─── Tutoriel vu ───
    if (include.tutorial !== false && s.tutorial && typeof s.tutorial === "object") {
      try {
        if (s.tutorial.seen) localStorage.setItem("myktamap_tutorial_seen_v1", "1");
        result.applied.tutorial = s.tutorial.seen ? 1 : 0;
      } catch(e) {}
    }

    // ─── Photos POI ───
    if (include.photos !== false && s.photos && Array.isArray(s.photos.photos) && s.photos.photos.length > 0
        && window.MyKTAMapPhotos && typeof window.MyKTAMapPhotos.restorePhoto === "function") {
      try {
        if (mode === "replace" && estExt && typeof window.MyKTAMapPhotos.listerTout === "function"
            && typeof window.MyKTAMapPhotos.deletePhotosForPlan === "function") {
          // ☁️ Vidage de tous les plans SAUF ceux d'une organisation.
          const plans = new Set();
          (await window.MyKTAMapPhotos.listerTout()).forEach(function(ph) {
            if (ph && ph.planId && !estExt(ph.planId)) plans.add(ph.planId);
          });
          for (const pid of plans) await window.MyKTAMapPhotos.deletePhotosForPlan(pid);
        } else if (mode === "replace") {
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
            }, { source: "import" });   // restauration de l'app (≠ dépôt d'une extension)
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

    // ─── PDF du Mode Histoire ───
    // Document par document : un PDF illisible ne fait pas échouer l'import. Pas de vidage en « replace » :
    // restaurer() fait un put, réimporter écrase les mêmes ids sans doublon (idempotent).
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
        // 🩸 Base encore à l'ancien schéma (1 PDF par plan) : y écrire écraserait le document existant. On
        // s'arrête en le disant ; ouvrir le Mode Histoire une fois migre la base, puis le réimport passe.
        result.warnings = result.warnings || [];
        result.warnings.push("histoirePdfs:v1");
        console.warn("[ProfileExportImport] PDF histoire NON restaurés : base au schéma v1. " +
                     "Ouvre le Mode Histoire une fois (migration auto) puis réimporte.");
      }
    }

    // ─── Profil (surnom + photo) ───
    if (include.user !== false && s.user) {
      try {
        console.log("[ProfileExportImport] import : section user…");
        const r = await _restoreUser(s.user);
        result.applied.user = (r && r.ok) ? 1 : 0;
      } catch(e) {
        console.warn("[ProfileExportImport] apply user échec :", e);
      }
    }

    // ─── Rapports de crash (IDB myktamap_crashes) ───
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
        await _remplirStore(db, "crashes", s.crashes, mode === "replace", garderExt);
        result.applied.crashes = s.crashes.length;
      } catch(e) {
        console.warn("[ProfileExportImport] apply crashes échec :", e);
      }
    }

    return result;
  }

  // ── Modale d'export ──────────────
  function _escHtml(s) { return window.ktaEsc(s); }

  async function ouvrirExportModale() {
    _fermerModales();

    // Chargement affiché pendant le calcul des tailles.
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

    let sizes;
    try { sizes = await computeSectionSizes({ exclureExtensions: true }); }
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
    html += '<p class="kta-profile-intro" style="background: rgba(255,140,140,0.06); border:1px solid rgba(255,140,140,0.20); padding:8px 10px; border-radius:6px; color:#ffae80;">';
    html += '🔐 ' + T("profileio.export_security");
    html += '</p>';
    if (sizes.extExclus > 0) {
      html += '<p class="kta-profile-intro kta-tx-info">☁️ ' + _escHtml(T("profileio.export_ext_exclus", { n: sizes.extExclus })) + '</p>';
    }

    html += '<div class="kta-profile-sections">';
    html += _renderSectionRow("user",        "👤", T("profileio.sec_user_label"),        sizes.user,        true,  "");
    html += _renderSectionRow("registry",    "🗂️", T("profileio.sec_registry_label"),    sizes.registry,    true,  "");
    html += _renderSectionRow("preferences", "⚙️", T("profileio.sec_preferences_label"), sizes.preferences, true,  "");
    html += _renderSectionRow("perPlanLs",   "📍", T("profileio.sec_perplan_label"),     sizes.perPlanLs,   true,  "");
    html += _renderSectionRow("favoris",     "⭐", T("profileio.sec_favoris_label"),      sizes.favoris,     true,  "");
    html += _renderSectionRow("sessions",    "💾", T("profileio.sec_sessions_label"),    sizes.sessions,    true,  "");
    html += _renderSectionRow("carnet",      "📔", T("profileio.sec_carnet_label"),      sizes.carnet,      true,  "");
    html += _renderSectionRow("backups",     "📦", T("profileio.sec_backups_label"),     sizes.backups,     true,  "");
    html += _renderSectionRow("tutorial",    "🎓", T("profileio.sec_tutorial_label"),    sizes.tutorial,    true,  "");
    html += _renderSectionRow("photos",      "📸", T("profileio.sec_photos_label"),      sizes.photos,      false, T("profileio.sec_photos_hint"));
    html += _renderSectionRow("histoirePdfs", "📄", T("profileio.sec_histpdf_label"),    sizes.histoirePdfs, false, T("profileio.sec_histpdf_hint"));
    html += _renderSectionRow("crashes",     "📋", T("profileio.sec_crashes_label"),     sizes.crashes,     false, T("profileio.sec_crashes_hint"));
    html += '</div>';

    // Archives de plans : décochées par défaut (pas de gros fichier surprise, décision produit). Une seule
    // cochée → l'export devient un conteneur ZIP.
    const archivables = _listerPlansArchivables();
    if (archivables.length) {
      html += '<div class="kta-profile-sections" style="margin-top:10px;">';
      html += '<div style="font-weight:600; margin:2px 0 4px;">📦 ' + T("profileio.arch_title") + '</div>';
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

    corps.querySelectorAll('input[type="checkbox"][data-section]').forEach(function(cb) {
      cb.addEventListener("change", function() {
        _majTotalEstime(sizes);
      });
    });
    _majTotalEstime(sizes);

    const btnGo = document.getElementById("kta-profile-export-go");
    if (btnGo) {
      btnGo.disabled = false;
      btnGo.addEventListener("click", function() {
        const include = {};
        corps.querySelectorAll('input[type="checkbox"][data-section]').forEach(function(cb) {
          include[cb.dataset.section] = cb.checked;
        });
        // Archives cochées → conteneur ZIP ; aucune → JSON classique.
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
            ? exportArchiveToFile({ include: include, planIds: planIds, exclureExtensions: true })
            : exportToFile({ include: include, exclureExtensions: true });
          promesse.then(function(res) {
            btnGo.textContent = "✅ " + window.I18n.t("profileio.exported_done");
            // Archives évincées par le quota : dit franchement ; la modale attend que le message soit lu.
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

        // Au-delà du seuil (iOS 50 Mo / 500 Mo ailleurs) : confirmation, jamais de coupe.
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
               (hint ? '<div class="kta-profile-row-hint">' + hint + '</div>' : '') +
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
    // Enveloppe JSON + indentation ; les archives (STORE) comptent pour leur taille.
    totalBytes = Math.round(totalBytes * 1.1) + 200;
    let octetsArchives = 0;
    corps.querySelectorAll('input[data-plan-zip]:checked').forEach(function(cb) {
      octetsArchives += parseInt(cb.dataset.bytes, 10) || 0;
    });
    totalBytes += octetsArchives;
    const el = document.getElementById("kta-profile-export-totalsize");
    if (el) el.textContent = _formatBytes(totalBytes);
    // Encadré de dépassement : l'export reste possible, après confirmation au clic.
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

  // ── Modale d'import ──────────────
  async function ouvrirImportModale(file) {
    // 🔒 Refus en kiosque ICI, au goulot, pas sur un bouton : l'import restaure des archives ZIP (plans
    // locaux interdits en `serverPlansOnly`) et des préférences qui peuvent vider l'accueil. La modale
    // s'ouvre depuis plusieurs endroits.
    if (typeof window.ktaKiosqueServeurSeul === "function" && window.ktaKiosqueServeurSeul()) {
      window.ktaAlerte(window.I18n.t("profileio.kiosque_refus"));
      return;
    }
    if (!file) { window.ktaAlerte(window.I18n.t("profileio.no_file")); return; }
    _fermerModales();

    // Conteneur détecté au CONTENU (signature « PK »), pas à l'extension : un conteneur renommé .json reste
    // importable, un JSON renommé .zip est refusé proprement par JSZip.
    let text;
    let zipConteneur = null;   // gardé pour la restauration des archives
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
          if (!e2.dir && /\.zip$/i.test(chemin)) nbArchives++;   // (☁️ triées à la restauration)
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
    // ☁️ L'aperçu compte ce qui sera VRAIMENT restauré (mêmes exclusions qu'applyProfile).
    const estExt = _predicatExtension(profile.sections.registry && profile.sections.registry.plans);
    const stats = computeImportStats({ sections: _sansPlansExtension(profile.sections, estExt).sections,
                                       appVersion: profile.appVersion, exportedAt: profile.exportedAt });

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
          // Archives cochées par défaut : raison d'être d'un profil complet.
          (nbArchives ? (
            '<label class="kta-profile-row" style="margin-top:8px;">' +
              '<input type="checkbox" id="kta-profile-import-archives" checked>' +
              '<span class="kta-profile-row-emoji">📦</span>' +
              '<span class="kta-profile-row-label">' +
                '<strong>' + T("profileio.arch_import_label", { n: nbArchives }) + '</strong> ' +
                '<span class="kta-profile-row-meta">' + _formatBytes(file.size) + '</span>' +
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
      applyProfile(profile, { mode: mode, include: include, exclureExtensions: true }).then(async function(res) {
        if (!res || !res.ok) {
          btn.disabled = false; btn.textContent = orig;
          window.ktaAlerte(window.I18n.t("profileio.import_fail",
            { error: (res && res.error) || window.I18n.t("profileio.unknown_reason") }), { type: "erreur" });
          return;
        }
        // Archives APRÈS le registre (rattachement par id) ; bilan dans la modale de fin.
        const cbArch = document.getElementById("kta-profile-import-archives");
        if (zipConteneur && cbArch && cbArch.checked) {
          btn.textContent = "⏳ " + window.I18n.t("profileio.arch_restauration");
          try { res.archives = await _restaurerArchives(zipConteneur, mode, estExt); }
          catch(e) { res.archives = { restaures: 0, conserves: 0, orphelins: 0, echecs: ["(" + (e.message || e) + ")"] }; }
        }
        btn.textContent = "✅ " + window.I18n.t("profileio.imported_done");
        setTimeout(function() {
          _fermerModales();
          // Rafraîchit ce qui sait le faire à chaud ; le reste (thème, préférences…) attend le rechargement proposé.
          _refreshAfterImport().then(function() {
            _afficherModaleImportTermine(res, mode);
          });
        }, 800);
      }).catch(function(e) {
        // 🩸 Filet : sans ce catch, une exception fige le bouton sur « Import en cours » sans un mot.
        console.error("[ProfileExportImport] import échoué :", e);
        btn.disabled = false; btn.textContent = orig;
        window.ktaAlerte(window.I18n.t("profileio.import_fail", { error: (e && e.message) || String(e) }),
          { type: "erreur" });
      });
    });
  }

  // Rafraîchissement à chaud après import : liste des plans, profil, favoris du plan courant.
  // (SessionBackups notifie déjà par onChange.)
  async function _refreshAfterImport() {
    if (typeof window.refreshPlansList === "function") {
      try { window.refreshPlansList(); } catch(e) {}
    }
    if (window.UserProfile && typeof window.UserProfile.init === "function") {
      try {
        // Par précaution : setSurnom / setPhoto ont déjà notifié.
        await window.UserProfile.init();
      } catch(e) {}
    }
    if (window.Favoris && window._currentLoadedPlanId && typeof window.Favoris.loadPlan === "function") {
      try { window.Favoris.loadPlan(window._currentLoadedPlanId); } catch(e) {}
    }
    return true;
  }

  // Fin d'import : résumé + rechargement proposé, pour ce qui ne se met pas à jour à chaud.
  function _afficherModaleImportTermine(res, mode) {
    const ex = document.getElementById("kta-profile-import-done-modal");
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);

    const T = window.I18n.t.bind(window.I18n);
    const SECTION_LABELS = {
      user:        "👤 " + T("profileio.done_sec_user"),
      registry:    "🗂️ " + T("profileio.done_sec_registry"),
      preferences: "⚙️ " + T("profileio.done_sec_preferences"),
      perPlanLs:   T("profileio.done_sec_perPlanLs"),
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
    // ☁️ Plans d'organisation ignorés, sections et archives, chacun compté une fois.
    const idsExt = new Set((res.ignores && res.ignores.ids) || []);
    ((res.archives && res.archives.extIgnores) || []).forEach(function(id) { idsExt.add(id); });
    const nExt = idsExt.size;
    if (nExt > 0) {
      parts.push('<li class="kta-tx-info">☁️ ' + _escHtml(T("profileio.done_ext_ignores", { n: nExt })) + '</li>');
    }
    const summaryHtml = parts.length
      ? '<ul style="margin:8px 0 12px 18px; padding:0;">' + parts.join("") + '</ul>'
      : '<p style="font-style:italic; color:var(--kta-texte-3);">' + T("profileio.done_nothing") + '</p>';

    const overlay = document.createElement("div");
    overlay.id = "kta-profile-import-done-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:480px; height:auto !important; max-height:88vh !important; border-color:rgba(110,226,135,0.55); box-shadow:0 0 24px rgba(110,226,135,0.18);">' +
        '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(110,226,135,0.25);">' +
          '<span class="kta-readme-modal-titre" style="color:var(--kta-ok);">✅ ' + T("profileio.done_title") + '</span>' +
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
          '<p style="font-size:12px; color:var(--kta-texte-3); font-style:italic; margin:8px 0 0;">' +
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
      try { window.location.reload(); }
      catch(e) { window.location.assign(window.location.href); }
    });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    document.addEventListener("keydown", _onEsc);

    // Focus sur « Recharger », l'action recommandée.
    setTimeout(function() {
      const btn = document.getElementById("kta-profile-import-done-reload");
      if (btn) btn.focus();
    }, 50);
  }

  function _renderImportContent(profile, stats, isLegacy, fileName) {
    const T = window.I18n.t.bind(window.I18n);
    let html = '';

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

    html += '<div class="kta-profile-sections">';
    if (stats.user > 0)    html += _renderImportSection("user",     "👤", T("profileio.sec_user_label"),     stats.user);
    html += _renderImportSection("registry",    "🗂️", T("profileio.import_sec_registry"),  stats.registry);
    html += _renderImportSection("preferences", "⚙️", T("profileio.sec_preferences_label"), stats.preferences);
    if (stats.perPlanLs > 0) html += _renderImportSection("perPlanLs", "📍", T("profileio.sec_perplan_label"), stats.perPlanLs);
    html += _renderImportSection("favoris",     "⭐", T("profileio.sec_favoris_label"),     stats.favoris);
    html += _renderImportSection("sessions",    "💾", T("profileio.sec_sessions_label"),    stats.sessions);
    html += _renderImportSection("carnet",      "📔", T("profileio.import_sec_carnet"),     stats.carnet);
    html += _renderImportSection("backups",     "📦", T("profileio.import_sec_backups"),    stats.backups);
    html += _renderImportSection("tutorial",    "🎓", T("profileio.sec_tutorial_label"),    stats.tutorial);
    if (stats.photos > 0)  html += _renderImportSection("photos",  "📸", T("profileio.sec_photos_label"),    stats.photos);
    if (stats.histoirePdfs > 0) html += _renderImportSection("histoirePdfs", "📄", T("profileio.sec_histpdf_label"), stats.histoirePdfs);
    if (stats.crashes > 0) html += _renderImportSection("crashes", "📋", T("profileio.sec_crashes_label"),   stats.crashes);
    html += '</div>';

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

  window.ProfileExportImport = {
    buildProfile:        buildProfile,
    computeSectionSizes: computeSectionSizes,
    exportToFile:        exportToFile,
    buildProfileArchive: buildProfileArchive,
    exportArchiveToFile: exportArchiveToFile,
    parseProfile:        parseProfile,
    computeImportStats:  computeImportStats,
    applyProfile:        applyProfile,
    isLegacyFormat:      isLegacyFormat,
    ouvrirExportModale:  ouvrirExportModale,
    ouvrirImportModale:  ouvrirImportModale,
    fermerModales:       _fermerModales,
    FORMAT_TYPE:         FORMAT_TYPE,
    FORMAT_VERSION:      FORMAT_VERSION,
    LEGACY_FORMAT_TYPE:  LEGACY_FORMAT_TYPE,
    _formatBytes:        _formatBytes
  };
})();
