/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// planRegistry.js — registre des plans connus (serveur découverts + ZIP locaux) : localStorage
//   ["myktamap_plans"], handles et blobs ZIP en IndexedDB, export/import de la liste (.config).
// Expose : window.PlanRegistry.
// Format : { version, lastPlanId, plans: [
//   { id, type:"server", path, name, version, author, discovered, lastOpened, addedAt, perfPreset? },
//   { id, type:"local",  name, version, originalFilename, fileSize, fsHandleId?, lastOpened, addedAt, perfPreset? } ],
//   folders?: [{ id, name, color, order, collapsed, src: "user"|"index", rule? }], plansView?: "all"|"folders" }
//   Par plan, en option : folderId/folderSrc, pinned, tags/tagsSrc, displayName, tiledV2, multiLevel.
// ⚠️ Doctrine : l'index serveur PROPOSE, l'utilisateur DISPOSE (étiquettes, dossiers) (décision produit).
// 🩸 perfPreset garde les valeurs historiques ("quality", "balanced", "performance") en plus de
//   "auto"/"off" : un preset mémorisé ne doit jamais devenir invalide.
// Garde-fous : scripts/check-plan-folders.js, scripts/check-plan-tags.js, scripts/check-tags-index.js,
//   scripts/check-import-masse.js · Doc : docs/architecture/plans-loader.md

(function() {
  "use strict";

  const STORAGE_KEY = "myktamap_plans";
  const IDB_NAME    = "myktamap_handles";
  const IDB_STORE   = "handles";
  const IDB_BLOBS   = "blobs"; // ZIP stockés en local

  // Appelé à la construction d'une erreur (action utilisateur), jamais au chargement.
  function t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }

  let _data = null;

  // 🩸 À appeler après toute écriture EXTERNE de la clé (applyProfile l'écrit directement) : sinon
  // _data est périmé, findById ne voit pas les plans importés et leurs archives passent « orphelines ».
  function reload() {
    _data = null;
    return init();
  }

  function init() {
    if (_data) return _data;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _data = JSON.parse(raw);
        if (!_data.plans) _data.plans = [];
        if (!_data.version) _data.version = "1.0";
      }
    } catch(e) {
      console.warn("[PlanRegistry] localStorage corrompu, reset", e);
    }
    if (!_data) {
      _data = { version: "1.0", lastPlanId: null, plans: [] };
    }
    return _data;
  }

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    } catch(e) {
      console.error("[PlanRegistry] save échoué", e);
    }
  }

  // ── Identifiants ──────────────────────────────
  function _slug(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "plan";
  }

  function genServerId(path) {
    return "server_" + _slug(path);
  }

  function genLocalId(planName, version) {
    const base = _slug(planName) + (version ? "_" + _slug(version) : "");
    return "local_" + base;
  }

  // ── Lecture, ajout, retrait ──────────────────────────────
  function getAll() {
    init();
    return _data.plans.slice();
  }

  function findById(id) {
    init();
    return _data.plans.find(function(p) { return p.id === id; }) || null;
  }

  function getRecents(n) {
    init();
    n = n || 5;
    return _data.plans
      .filter(function(p) { return p.lastOpened; })
      .sort(function(a, b) {
        return (b.lastOpened || "").localeCompare(a.lastOpened || "");
      })
      .slice(0, n);
  }

  function getLastOpened() {
    init();
    if (!_data.lastPlanId) return null;
    return findById(_data.lastPlanId);
  }

  function setLastPlanId(id) {
    init();
    _data.lastPlanId = id || null;
    _save();
  }

  // Fusionne : les champs absents de `plan` (addedAt, lastOpened, drapeaux) sont conservés.
  function addOrUpdate(plan) {
    init();
    if (!plan || !plan.id) {
      console.warn("[PlanRegistry] addOrUpdate sans id ignoré");
      return null;
    }
    const idx = _data.plans.findIndex(function(p) { return p.id === plan.id; });
    if (idx >= 0) {
      _data.plans[idx] = Object.assign({}, _data.plans[idx], plan);
    } else {
      if (!plan.addedAt) plan.addedAt = new Date().toISOString();
      _data.plans.push(plan);
    }
    _save();
    return findById(plan.id);
  }

  function markOpened(id) {
    init();
    const p = findById(id);
    if (!p) return false;
    p.lastOpened = new Date().toISOString();
    _data.lastPlanId = id;
    _save();
    return true;
  }

  function remove(id) {
    init();
    const idx = _data.plans.findIndex(function(p) { return p.id === id; });
    if (idx < 0) return false;
    _data.plans.splice(idx, 1);
    if (_data.lastPlanId === id) _data.lastPlanId = null;
    _save();
    removeHandle(id);
    removeBlob(id);
    return true;
  }

  // Purge les données d'un plan (🗑️ de ℹ️ Infos, nettoyeur d'orphelins) : session, stats du profil,
  // calage KMZ, photos, sauvegardes. PRÉSERVE le Carnet, les récits du Mode Histoire et les liaisons
  // inter-plans, qui survivent au plan (décision produit). Chaque module externe est optionnel.
  async function purgeAssociatedData(id) {
    const bilan = { session: false, calib: false, photos: 0, backups: 0 };
    if (!id) return bilan;
    try {
      const S = window.KtaSessionStore;
      if (S.lire(id) != null) bilan.session = true;
      S.retirer(id);   // retire aussi l'ancienne copie localStorage
    } catch(e) {}
    // 🔒 Un plan ☁️ retiré à la déconnexion ne laisse rien de son contenu, pas même ses décomptes.
    try { localStorage.removeItem("myktamap_plan_stats_v1_" + id); } catch(e) {}
    if (window.KtaVuePlan) window.KtaVuePlan.retirer(id);
    try {
      if (localStorage.getItem("myktamap_kmz_calib_" + id) != null) {
        localStorage.removeItem("myktamap_kmz_calib_" + id);
        bilan.calib = true;
      }
    } catch(e) {}
    if (window.MyKTAMapPhotos && typeof window.MyKTAMapPhotos.deletePhotosForPlan === "function") {
      try { bilan.photos = (await window.MyKTAMapPhotos.deletePhotosForPlan(id)) || 0; } catch(e) {}
    }
    if (window.SessionBackups && typeof window.SessionBackups.deleteForPlan === "function") {
      try { bilan.backups = (await window.SessionBackups.deleteForPlan(id)) || 0; } catch(e) {}
    }
    return bilan;
  }

  // Transfère session (planId réécrit), calage, photos, favoris et liaisons vers un autre id (copie
  // locale remplacée par sa version ☁️). Refusé si la cible a déjà une session : jamais d'écrasement.
  // Les sauvegardes restent à l'ancien id (purgées avec lui).
  async function transferAssociatedData(ancienId, nouveauId) {
    const bilan = { ok: false, session: false, calib: false, photos: 0, favoris: 0, liaisons: 0 };
    if (!ancienId || !nouveauId || ancienId === nouveauId) return bilan;
    const S = window.KtaSessionStore;
    try {
      if (S.lire(nouveauId) != null) { bilan.raison = "cible-occupee"; return bilan; }
      const brut = S.lire(ancienId);
      if (brut != null) {
        let txt = brut;
        try { const o = JSON.parse(brut); if (o && typeof o === "object") { o.planId = nouveauId; txt = JSON.stringify(o); } }
        catch (e) { /* illisible : copié tel quel */ }
        // Copie CONFIRMÉE avant d'effacer l'ancienne : jamais les deux perdues à la fois.
        await S.ecrireDurable(nouveauId, txt);
        S.retirer(ancienId);
        bilan.session = true;
      }
      const cal = localStorage.getItem("myktamap_kmz_calib_" + ancienId);
      if (cal != null && localStorage.getItem("myktamap_kmz_calib_" + nouveauId) == null) {
        localStorage.setItem("myktamap_kmz_calib_" + nouveauId, cal);
        localStorage.removeItem("myktamap_kmz_calib_" + ancienId);
        bilan.calib = true;
      }
      if (window.KtaVuePlan) window.KtaVuePlan.transferer(ancienId, nouveauId);
    } catch (e) { bilan.raison = "stockage"; return bilan; }
    if (window.MyKTAMapPhotos && typeof window.MyKTAMapPhotos.changerPlan === "function") {
      try { bilan.photos = (await window.MyKTAMapPhotos.changerPlan(ancienId, nouveauId)) || 0; } catch (e) {}
    }
    if (window.Favoris && typeof window.Favoris.transfererPlan === "function") {
      try { bilan.favoris = window.Favoris.transfererPlan(ancienId, nouveauId) || 0; } catch (e) {}
    }
    if (window.InterPlanLinks && typeof window.InterPlanLinks.transfererPlan === "function") {
      try { bilan.liaisons = window.InterPlanLinks.transfererPlan(ancienId, nouveauId) || 0; } catch (e) {}
    }
    bilan.ok = true;
    return bilan;
  }

  function removeAll() {
    init();
    _data.plans = [];
    _data.lastPlanId = null;
    delete _data.folders;      // les dossiers partent avec la liste
    delete _data.plansView;
    _save();
  }

  const _PERF_VALID = ["off", "auto", "quality", "balanced", "performance"];

  // ── Organisation de la liste ──────────────────────────────
  // `pinned`, `tags`, `displayName` : métadonnées utilisateur LOCALES. Elles ne voyagent pas avec
  // les ZIP, mais suivent l'export de profil et l'export .config.

  function setPinned(id, pinned) {
    init();
    const p = findById(id);
    if (!p) { console.warn("[PlanRegistry] setPinned : plan introuvable", id); return false; }
    if (pinned) p.pinned = true;
    else delete p.pinned;          // jamais de `false` stocké
    _save();
    return true;
  }

  // 🩸 Nom d'affichage local : JAMAIS toucher à `name` (vrai nom du plan-config), qui sert aux
  // contrôles (re-sélection du ZIP, double-check de session, doublons, nom de fichier).
  function setDisplayName(id, nom) {
    init();
    const p = findById(id);
    if (!p) { console.warn("[PlanRegistry] setDisplayName : plan introuvable", id); return false; }
    const propre = String(nom || "").trim().slice(0, 40);
    if (propre && propre !== String(p.name || "").trim()) p.displayName = propre;
    else delete p.displayName;   // vide OU identique au vrai nom → retour au nom d'origine
    _save();
    return true;
  }

  // ⚠️ Libellé d'AFFICHAGE (displayName > name > id) ; jamais pour un usage fonctionnel de `name`.
  function displayName(planOuId) {
    const p = (planOuId && typeof planOuId === "object") ? planOuId : findById(planOuId);
    if (!p) return String(planOuId || "");
    return p.displayName || p.name || p.id;
  }

  // ⚠️ SEULE normalisation des étiquettes de l'app (ℹ️ Infos, index, Générateur et convertisseurs) :
  // trim, vides et doublons (casse ignorée) retirés, 12 au plus de 24 caractères, tronqués sans refus.
  function normaliserTags(tags) {
    const vus = {};
    return (Array.isArray(tags) ? tags : [])
      .map(function(t2) { return String(t2 || "").trim().slice(0, 24); })
      .filter(function(t2) {
        if (!t2) return false;
        const k = t2.toLowerCase();
        if (vus[k]) return false;
        vus[k] = true;
        return true;
      })
      .slice(0, 12);
  }

  // `origine` : "user" (défaut), "index" (data/index.json) ou "config" (plan-config > plan.tags).
  // 🩸 Sans origine, la découverte réécrirait les étiquettes à chaque démarrage et effacerait celles
  // de l'utilisateur. Sur un plan serveur, l'index passe avant le fichier (main.js, importMasse.js).
  function setTags(id, tags, origine) {
    init();
    const p = findById(id);
    if (!p) { console.warn("[PlanRegistry] setTags : plan introuvable", id); return false; }
    const propres = normaliserTags(tags);
    if (propres.length) {
      p.tags = propres;
      p.tagsSrc = (origine === "index" || origine === "config") ? origine : "user";
    } else {
      delete p.tags;
      // 🩸 Vider est un CHOIX : l'origine "user" reste, sinon l'index reproposerait ses étiquettes
      // au démarrage suivant.
      if (origine === "index" || origine === "config") delete p.tagsSrc;
      else p.tagsSrc = "user";
    }
    _save();
    return true;
  }

  function getPerfPreset(id) {
    init();
    const p = findById(id);
    return (p && typeof p.perfPreset === "string" && _PERF_VALID.indexOf(p.perfPreset) >= 0)
      ? p.perfPreset
      : null;
  }

  function setPerfPreset(id, preset) {
    init();
    if (_PERF_VALID.indexOf(preset) < 0) {
      console.warn("[PlanRegistry] perfPreset invalide :", preset, "— ignoré");
      return false;
    }
    const p = findById(id);
    if (!p) {
      console.warn("[PlanRegistry] setPerfPreset : plan introuvable", id);
      return false;
    }
    if (p.perfPreset === preset) return true;
    p.perfPreset = preset;
    _save();
    return true;
  }

  // ── Multi-niveau (opt-in par plan) ──────────────────────────────
  // Actif : sélecteur de niveau, jonctions, champ `level` sur les tracés. Inactif : aucun `level`.
  // Un choix explicite (⚙️ Réglages, true OU false) prime sur `fallbackIfUnset` (plan-config du ZIP).
  function getMultiLevel(id, fallbackIfUnset) {
    init();
    const p = findById(id);
    if (p && typeof p.multiLevel === "boolean") return p.multiLevel;
    return !!fallbackIfUnset;
  }

  function setMultiLevel(id, enabled) {
    init();
    const p = findById(id);
    if (!p) {
      console.warn("[PlanRegistry] setMultiLevel : plan introuvable", id);
      return false;
    }
    const target = !!enabled;
    if (!!p.multiLevel === target) return true;
    p.multiLevel = target;
    _save();
    return true;
  }

  // Aligne `tiledV2` / `multiLevel` sur le plan-config du ZIP chargé (source de vérité) : true → posé,
  // false → retiré. 🩸 addOrUpdate fusionne et garderait un ancien drapeau : un ZIP V1 re-sélectionné
  // après import d'une liste resterait marqué V2.
  function syncModeFlags(id, flags) {
    init();
    const p = findById(id);
    if (!p) {
      console.warn("[PlanRegistry] syncModeFlags : plan introuvable", id);
      return false;
    }
    let changed = false;
    if (flags && Object.prototype.hasOwnProperty.call(flags, "tiledV2")) {
      if (flags.tiledV2 === true) {
        if (p.tiledV2 !== true) { p.tiledV2 = true; changed = true; }
      } else {
        if (p.tiledV2 !== undefined) { delete p.tiledV2; changed = true; }
      }
    }
    if (flags && Object.prototype.hasOwnProperty.call(flags, "multiLevel")) {
      if (flags.multiLevel === true) {
        if (p.multiLevel !== true) { p.multiLevel = true; changed = true; }
      } else {
        if (p.multiLevel !== undefined) { delete p.multiLevel; changed = true; }
      }
    }
    if (changed) _save();
    return changed;
  }

  // ── Export / import de la liste ──────────────────────────────
  function exportToFile() {
    init();
    const exported = {
      type: "myktamap-plans-list",
      version: _data.version,
      exported_at: new Date().toISOString(),
      plans: _data.plans.map(function(p) {
        const clone = Object.assign({}, p);
        delete clone.fsHandleId;   // non portable
        return clone;
      }),
      folders: (_data.folders || []).map(function(f) { return Object.assign({}, f); })
    };
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    a.href = url;
    a.download = "myktamap_plans_" + stamp + ".config";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  // mode: "replace" | "merge"
  async function importFromFile(file, mode) {
    if (!file) throw new Error(t("planreg.err.noFile"));
    const text = await file.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch(e) { throw new Error(t("planreg.err.jsonInvalid")); }

    if (payload.type !== "myktamap-plans-list") {
      throw new Error(t("planreg.err.notPlanList"));
    }
    if (!Array.isArray(payload.plans)) {
      throw new Error(t("planreg.err.badListFormat"));
    }

    init();

    // Dossiers fusionnés par nom (ou remplacés) ; le folderId des plans importés est traduit.
    const fusion = fusionnerDossiers(_data.folders, payload.folders, mode);
    const traduire = function(p) {
      if (p && p.folderId) {
        const reel = fusion.table[p.folderId];
        if (reel) p.folderId = reel; else { delete p.folderId; delete p.folderSrc; }
      }
      return p;
    };
    if (fusion.folders.length) _data.folders = fusion.folders; else delete _data.folders;

    if (mode === "replace") {
      _data.plans = payload.plans.slice().map(traduire);
    } else {
      // merge : un id déjà connu garde la version locale.
      payload.plans.forEach(function(p) {
        if (!p || !p.id) return;
        const existing = findById(p.id);
        if (!existing) {
          _data.plans.push(traduire(p));
        }
      });
    }
    _save();
    return { count: payload.plans.length };
  }

  function statsImport(file) {
    return file.text().then(function(text) {
      let payload;
      try { payload = JSON.parse(text); }
      catch(e) { return { ok: false, error: t("planreg.err.jsonInvalidShort") }; }
      if (payload.type !== "myktamap-plans-list") {
        return { ok: false, error: t("planreg.err.notMktmList") };
      }
      const total = (payload.plans || []).length;
      init();
      const newOnes = (payload.plans || []).filter(function(p) {
        return p && p.id && !findById(p.id);
      }).length;
      const duplicates = total - newOnes;
      return { ok: true, total: total, newOnes: newOnes, duplicates: duplicates };
    });
  }

  // ── Dossiers de « Mes plans » ──────────────────────────────
  // Un plan est dans UN dossier au plus (`folderId`), sinon « Non classés ». Toute la normalisation
  // vit ici (écran, découverte, ConfAdmin, import de profil).
  // 🩸 Un dossier de l'index (`src` "index") est VERROUILLÉ tant que l'index le déclare (sinon il
  // reviendrait au démarrage), puis LIBÉRÉ, jamais supprimé. Un plan rangé à la main n'est jamais repris.
  const FOLDER_NAME_MAX = 40;
  const FOLDER_COLORS = ["#8cb4ff", "#f4c542", "#7ed6a5", "#ff9f7a", "#c39bff", "#7fd8e6", "#ff7aa8", "#b8c4d6"];

  function _nomDossier(nom) { return String(nom || "").trim().replace(/\s+/g, " ").slice(0, FOLDER_NAME_MAX); }
  // Règle par étiquette : le dossier inclut aussi les plans étiquetés X. Vide = pas de règle.
  function _regleDossier(rule) {
    const tags = normaliserTags(rule && rule.tags);
    return tags.length ? { tags: tags } : null;
  }
  // Premier dossier (dans l'ordre) dont la règle prend ce plan, hors exclusions.
  function _dossierParRegle(p) {
    if (!p) return null;
    const tags = (Array.isArray(p.tags) ? p.tags : []).map(function(x) { return String(x).toLowerCase(); });
    if (!tags.length) return null;
    const excl = Array.isArray(p.folderExclude) ? p.folderExclude : [];
    const f = getFolders().find(function(d) {
      if (!d.rule || !Array.isArray(d.rule.tags) || excl.indexOf(d.id) >= 0) return false;
      return d.rule.tags.some(function(rt) { return tags.indexOf(String(rt).toLowerCase()) >= 0; });
    });
    return f ? f.id : null;
  }
  function setFolderRule(id, tags) {
    const f = findFolder(id);
    if (!f || f.src === "index") return false;
    const r = _regleDossier({ tags: tags });
    if (r) f.rule = r; else delete f.rule;
    _save(); return true;
  }
  function _slugDossier(nom) {
    return String(nom).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "dossier";
  }
  function getFolders() {
    init();
    return (_data.folders || []).slice().sort(function(a, b) {
      return ((a.order || 0) - (b.order || 0)) || String(a.name).localeCompare(String(b.name));
    });
  }
  function findFolder(id) {
    init();
    return (_data.folders || []).find(function(f) { return f.id === id; }) || null;
  }
  // Même nom, casse ignorée = même dossier : clé de fusion (import de profil, index).
  function findFolderByName(nom) {
    init();
    const k = _nomDossier(nom).toLowerCase();
    if (!k) return null;
    return (_data.folders || []).find(function(f) { return String(f.name).toLowerCase() === k; }) || null;
  }
  // Crée un dossier ou rend celui de même nom/id. opts : { id?, color?, order?, src?, rule? }.
  // Un dossier "user" homonyme d'un dossier de l'index DEVIENT celui de l'index, sans doublon.
  function createFolder(nom, opts) {
    init();
    opts = opts || {};
    const name = _nomDossier(nom);
    if (!name) return null;
    const src = (opts.src === "index") ? "index" : "user";
    if (!_data.folders) _data.folders = [];
    let f = opts.id ? findFolder(String(opts.id)) : null;
    if (!f) f = findFolderByName(name);
    if (f) {
      if (src === "index") {
        f.src = "index";
        f.name = name;
        if (opts.color) f.color = String(opts.color).slice(0, 16);
        if (Number.isFinite(opts.order)) f.order = opts.order;
        const r = _regleDossier(opts.rule);
        if (r) f.rule = r; else delete f.rule;   // l'index est maître de la règle qu'il déclare
      }
      _save();
      return f;
    }
    const base = opts.id ? String(opts.id).slice(0, 48) : "f_" + _slugDossier(name);
    let id = base, n = 2;
    while (findFolder(id)) id = base + "_" + (n++);
    const order = Number.isFinite(opts.order) ? opts.order
      : _data.folders.reduce(function(m, x) { return Math.max(m, (x.order || 0) + 1); }, 0);
    f = { id: id, name: name, color: opts.color ? String(opts.color).slice(0, 16) : FOLDER_COLORS[_data.folders.length % FOLDER_COLORS.length],
          order: order, collapsed: true, src: src };
    const regle = _regleDossier(opts.rule);
    if (regle) f.rule = regle;
    _data.folders.push(f);
    _save();
    return f;
  }
  function renameFolder(id, nom) {
    const f = findFolder(id);
    if (!f || f.src === "index") return false;
    const name = _nomDossier(nom);
    if (!name) return false;
    const dbl = findFolderByName(name);
    if (dbl && dbl.id !== id) return false;
    f.name = name; _save(); return true;
  }
  function setFolderColor(id, color) {
    const f = findFolder(id);
    if (!f || f.src === "index") return false;
    f.color = String(color || "").slice(0, 16); _save(); return true;
  }
  function setFolderCollapsed(id, collapsed) {
    const f = findFolder(id);
    if (!f) return false;
    f.collapsed = !!collapsed; _save(); return true;
  }
  // Un cran (delta ±1) ; renumérote tout pour garder un ordre dense.
  function moveFolder(id, delta) {
    const list = getFolders();
    const i = list.findIndex(function(f) { return f.id === id; });
    if (i < 0) return false;
    const j = Math.max(0, Math.min(list.length - 1, i + (delta < 0 ? -1 : 1)));
    if (j === i) return false;
    const f = list.splice(i, 1)[0];
    list.splice(j, 0, f);
    list.forEach(function(x, k) { x.order = k; });
    _save(); return true;
  }
  // Ne supprime JAMAIS un plan (retour en Non classés). Refusé sur un dossier de l'index.
  function deleteFolder(id) {
    init();
    const f = findFolder(id);
    if (!f || f.src === "index") return false;
    _data.folders = _data.folders.filter(function(x) { return x.id !== id; });
    _data.plans.forEach(function(p) {
      if (p.folderId === id) { delete p.folderId; delete p.folderSrc; }
      if (Array.isArray(p.folderExclude)) {
        p.folderExclude = p.folderExclude.filter(function(x) { return x !== id; });
        if (!p.folderExclude.length) delete p.folderExclude;
      }
    });
    _save(); return true;
  }
  // Range un plan (folderId) ou le sort (null). origine "user" | "index".
  // 🩸 L'index ne passe jamais par-dessus un geste de l'utilisateur : sortir un plan à la main est
  // mémorisé (folderSrc "user" sans dossier), sinon l'index le rangerait à nouveau au démarrage.
  function setPlanFolder(planId, folderId, origine) {
    init();
    const p = findById(planId);
    if (!p) return false;
    const src = (origine === "index") ? "index" : "user";
    if (src === "index" && p.folderSrc === "user") return false;
    if (folderId && !findFolder(folderId)) return false;
    // 🩸 Sorti à la main d'un dossier à règle → EXCLUSION mémorisée, sinon la règle le reprend au
    // rendu suivant. Le remettre à la main dans ce dossier lève l'exclusion.
    if (src === "user") {
      const parRegle = _dossierParRegle(p);
      if (parRegle && parRegle !== folderId) {
        p.folderExclude = (Array.isArray(p.folderExclude) ? p.folderExclude : []).concat(parRegle);
      }
      if (folderId && Array.isArray(p.folderExclude)) {
        p.folderExclude = p.folderExclude.filter(function(x) { return x !== folderId; });
        if (!p.folderExclude.length) delete p.folderExclude;
      }
    }
    if (folderId) { p.folderId = folderId; p.folderSrc = src; }
    else {
      delete p.folderId;
      if (src === "user") p.folderSrc = "user"; else delete p.folderSrc;
    }
    _save(); return true;
  }
  // Dossier EFFECTIF : rangement manuel, sinon règle. Un folderId orphelin vaut Non classés, sans erreur.
  function planFolderId(p) {
    if (p && p.folderId && findFolder(p.folderId)) return p.folderId;
    return _dossierParRegle(p);
  }
  function planFolderByRule(p) {
    return !!(p && !(p.folderId && findFolder(p.folderId)) && _dossierParRegle(p));
  }
  function getPlansView() { init(); return _data.plansView === "folders" ? "folders" : "all"; }
  function hasPlansViewChoice() { init(); return _data.plansView === "folders" || _data.plansView === "all"; }
  function setPlansView(mode) { init(); _data.plansView = (mode === "folders") ? "folders" : "all"; _save(); return _data.plansView; }
  // Dossiers de data/index.json. Rend { idDéclaré → idRéel } : un homonyme "user" garde SON id, la
  // découverte doit traduire le `folder` de chaque plan. Un dossier "index" plus déclaré passe "user".
  function applyIndexFolders(liste) {
    init();
    const table = {};
    (Array.isArray(liste) ? liste : []).forEach(function(d, i) {
      if (!d || !d.name) return;
      const f = createFolder(d.name, { id: d.id, color: d.color, order: Number.isFinite(d.order) ? d.order : i, src: "index", rule: d.rule });
      if (f) table[String(d.id || f.id)] = f.id;
    });
    const gardes = {};
    Object.keys(table).forEach(function(k) { gardes[table[k]] = true; });
    (_data.folders || []).forEach(function(f) { if (f.src === "index" && !gardes[f.id]) f.src = "user"; });
    _save();
    return table;
  }

  // Fusion PURE (ni _data ni sauvegarde : l'appelant écrit). "replace" : les importés remplacent ;
  // "merge" : même nom = même dossier, l'id local gagne. Rend { folders, table: idImporté → idRéel }.
  // Un dossier importé arrive TOUJOURS "user" : seul l'index local peut le reverrouiller.
  function fusionnerDossiers(locaux, importes, mode) {
    const base = (mode === "replace") ? [] : (Array.isArray(locaux) ? locaux : []).map(function(f) { return Object.assign({}, f); });
    const table = {};
    (Array.isArray(importes) ? importes : []).forEach(function(imp) {
      if (!imp || !imp.name) return;
      const name = _nomDossier(imp.name);
      if (!name) return;
      const k = name.toLowerCase();
      let f = base.find(function(x) { return String(x.name).toLowerCase() === k; });
      if (!f) {
        const souhaite = imp.id ? String(imp.id).slice(0, 48) : "f_" + _slugDossier(name);
        let id = souhaite, n = 2;
        while (base.some(function(x) { return x.id === id; })) id = souhaite + "_" + (n++);
        f = { id: id, name: name, color: imp.color ? String(imp.color).slice(0, 16) : FOLDER_COLORS[base.length % FOLDER_COLORS.length],
              order: Number.isFinite(imp.order) ? imp.order : base.length, collapsed: imp.collapsed !== false, src: "user" };
        const regle = _regleDossier(imp.rule);
        if (regle) f.rule = regle;
        base.push(f);
      }
      if (imp.id) table[String(imp.id)] = f.id;
    });
    return { folders: base, table: table };
  }

  // ── IndexedDB : handles et blobs ZIP ──────────────────────────────
  function _openIDB() {
    return new Promise(function(resolve, reject) {
      if (!("indexedDB" in window)) { resolve(null); return; }
      // Version 2 = store "blobs".
      const req = indexedDB.open(IDB_NAME, 2);
      req.onupgradeneeded = function() {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
        if (!db.objectStoreNames.contains(IDB_BLOBS)) {
          db.createObjectStore(IDB_BLOBS);
        }
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { resolve(null); };
    });
  }

  async function saveHandle(id, handle) {
    if (!handle) return false;
    const db = await _openIDB();
    if (!db) return false;
    return new Promise(function(resolve) {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(handle, id);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  }

  async function getHandle(id) {
    const db = await _openIDB();
    if (!db) return null;
    return new Promise(function(resolve) {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror   = function() { resolve(null); };
    });
  }

  async function removeHandle(id) {
    const db = await _openIDB();
    if (!db) return false;
    return new Promise(function(resolve) {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  }

  function hasFsAccess() {
    return typeof window.showOpenFilePicker === "function";
  }

  async function ensureHandlePermission(handle) {
    if (!handle || !handle.queryPermission) return false;
    try {
      let p = await handle.queryPermission({ mode: "read" });
      if (p === "granted") return true;
      p = await handle.requestPermission({ mode: "read" });
      return p === "granted";
    } catch(e) {
      return false;
    }
  }

  // ── Blobs ZIP (mobile, ou sans accès fichiers) ──────────────────────────────
  // Stockage « persistant » : évite la purge automatique (iOS Safari, Chrome Android).
  async function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    try {
      const persisted = await navigator.storage.persisted();
      if (persisted) return true;
      return await navigator.storage.persist();
    } catch(e) { return false; }
  }

  // → { ok: true } | { ok: false, error }
  async function saveBlob(id, blob) {
    if (!blob) return { ok: false, error: t("planreg.err.noFileShort") };
    // 🩸 Ranger une COPIE, jamais le `File` : Chromium le stocke PAR RÉFÉRENCE au disque, et sa
    // lecture échoue (NotReadableError / NotFoundError) dès que le ZIP d'origine est modifié,
    // déplacé ou supprimé. Coût : le ZIP en mémoire le temps de l'écriture. Un Blob en mémoire
    // n'est pas recopié.
    if (typeof File !== "undefined" && blob instanceof File) {
      try { blob = new Blob([await blob.arrayBuffer()], { type: blob.type || "application/zip" }); }
      catch (e) { return { ok: false, error: (e && e.name) || t("planreg.err.unexpected") }; }
    }
    const db = await _openIDB();
    if (!db) return { ok: false, error: t("planreg.err.idbUnavailable") };

    return new Promise(function(resolve) {
      try {
        const tx = db.transaction(IDB_BLOBS, "readwrite");
        tx.objectStore(IDB_BLOBS).put(blob, id);
        tx.oncomplete = function() { resolve({ ok: true }); };
        tx.onerror = function(e) {
          resolve({ ok: false, error: (tx.error && tx.error.name) || t("planreg.err.idbError") });
        };
        tx.onabort = function() {
          const err = tx.error;
          if (err && err.name === "QuotaExceededError") {
            resolve({ ok: false, error: t("planreg.err.quotaExceeded") });
          } else {
            resolve({ ok: false, error: (err && err.name) || t("planreg.err.storageRefused") });
          }
        };
      } catch(e) {
        resolve({ ok: false, error: e.message || t("planreg.err.unexpected") });
      }
    });
  }

  async function getBlob(id) {
    const db = await _openIDB();
    if (!db) return null;
    return new Promise(function(resolve) {
      const tx = db.transaction(IDB_BLOBS, "readonly");
      const req = tx.objectStore(IDB_BLOBS).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror   = function() { resolve(null); };
    });
  }

  async function removeBlob(id) {
    const db = await _openIDB();
    if (!db) return false;
    return new Promise(function(resolve) {
      const tx = db.transaction(IDB_BLOBS, "readwrite");
      tx.objectStore(IDB_BLOBS).delete(id);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  }

  async function getStorageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      return await navigator.storage.estimate();
    } catch(e) { return null; }
  }

  window.PlanRegistry = {
    init:                 init,
    getAll:               getAll,
    findById:             findById,
    getRecents:           getRecents,
    getLastOpened:        getLastOpened,
    setLastPlanId:        setLastPlanId,
    addOrUpdate:          addOrUpdate,
    reload:               reload,
    purgeAssociatedData:  purgeAssociatedData,
    transferAssociatedData: transferAssociatedData,
    setPinned:            setPinned,
    setTags:              setTags,
    setDisplayName:       setDisplayName,
    displayName:          displayName,
    markOpened:           markOpened,
    remove:               remove,
    removeAll:            removeAll,
    getPerfPreset:        getPerfPreset,
    setPerfPreset:        setPerfPreset,
    getMultiLevel:        getMultiLevel,
    setMultiLevel:        setMultiLevel,
    syncModeFlags:        syncModeFlags,
    exportToFile:         exportToFile,
    importFromFile:       importFromFile,
    statsImport:          statsImport,
    genServerId:          genServerId,
    genLocalId:           genLocalId,
    normaliserTags:       normaliserTags,
    getFolders:           getFolders,
    findFolder:           findFolder,
    findFolderByName:     findFolderByName,
    createFolder:         createFolder,
    renameFolder:         renameFolder,
    setFolderColor:       setFolderColor,
    setFolderCollapsed:   setFolderCollapsed,
    moveFolder:           moveFolder,
    deleteFolder:         deleteFolder,
    setPlanFolder:        setPlanFolder,
    planFolderId:         planFolderId,
    planFolderByRule:     planFolderByRule,
    setFolderRule:        setFolderRule,
    getPlansView:         getPlansView,
    hasPlansViewChoice:   hasPlansViewChoice,
    setPlansView:         setPlansView,
    applyIndexFolders:    applyIndexFolders,
    fusionnerDossiers:    fusionnerDossiers,
    FOLDER_COLORS:        FOLDER_COLORS,
    saveHandle:           saveHandle,
    getHandle:            getHandle,
    removeHandle:         removeHandle,
    hasFsAccess:          hasFsAccess,
    ensureHandlePermission: ensureHandlePermission,
    saveBlob:             saveBlob,
    getBlob:              getBlob,
    removeBlob:           removeBlob,
    requestPersistentStorage: requestPersistentStorage,
    getStorageEstimate:   getStorageEstimate
  };

})();
