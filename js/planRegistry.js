/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// PLAN REGISTRY — Gestion des plans connus
// =========================
// Stocke et gère la liste des plans (serveur découverts + locaux ZIP) avec :
//   • Persistance localStorage
//   • Stockage des FileSystemFileHandle dans IndexedDB pour ré-ouverture rapide
//   • Export / import de la liste (fichier MAIN.config)
//
// Format storage :
// {
//   version: "1.0",
//   lastPlanId: "server_data_test1" | "local_planmarseille_v1" | null,
//   plans: [
//     { id, type:"server", path, name, version, author, discovered, lastOpened, addedAt, perfPreset? },
//     { id, type:"local",  name, version, originalFilename, fileSize, fsHandleId?, lastOpened, addedAt, perfPreset? }
//   ]
// }
//
// 📁 16/09/2026 — DOSSIERS DE « MES PLANS » (étude docs/audits/2026-09-16_etude-dossiers-mes-plans.md (archivé : tag Git `archive-docs-2026-09-30`)) :
//   folders:   [{ id, name, color, order, collapsed, src: "user"|"index" }]   ← absent tant qu'aucun dossier
//   plansView: "all" | "folders"                                              ← absent = jamais choisi
//   par plan : folderId (absent = Non classés), folderSrc: "user"|"index"
//   Doctrine v1.90.1 étendue : l'index serveur PROPOSE, l'utilisateur DISPOSE.
//
// `perfPreset` (optionnel) : "auto" | "quality" | "balanced" | "performance"
//   → choix de mode performance mémorisé pour CE plan (champ ajouté en v2).
//   → absent = aucun choix mémorisé, le loader affichera "auto" par défaut.
//
// API publique : window.PlanRegistry
// =========================

(function() {
  "use strict";

  const STORAGE_KEY = "myktamap_plans";
  const IDB_NAME    = "myktamap_handles";
  const IDB_STORE   = "handles";
  const IDB_BLOBS   = "blobs"; // store séparé pour les fichiers ZIP stockés en local

  // Helper i18n — appelé quand l'erreur est construite (import / save = action
  // user), jamais au load → dicos prêts. Fallback = clé si I18n absent.
  function t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }

  let _data = null;

  // ========== INIT ==========
  // 🐛 v1.79.0 (bug KARMA « import de profil : la liste n'apparaît qu'après
  // F5, sans les archives ») — applyProfile écrit `myktamap_plans` DIRECT
  // dans le localStorage : l'état RAM (_data) devenait obsolète, findById ne
  // voyait pas les plans importés → la restauration d'archives les classait
  // tous « orphelins ». reload() force la relecture du LS ; à appeler après
  // toute écriture externe de la clé.
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

  // ========== ID GENERATORS ==========
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

  // ========== ACCESSEURS ==========
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

  // ========== ADD / UPDATE ==========
  function addOrUpdate(plan) {
    init();
    if (!plan || !plan.id) {
      console.warn("[PlanRegistry] addOrUpdate sans id ignoré");
      return null;
    }
    const idx = _data.plans.findIndex(function(p) { return p.id === plan.id; });
    if (idx >= 0) {
      // Merge en préservant addedAt et lastOpened existants si non fournis
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
    // Aussi supprimer le handle FS et le blob ZIP associés
    removeHandle(id);
    removeBlob(id);
    return true;
  }

  // 🧹 v1.79.3 (décision KARMA — reco 2:a) — PURGE des données associées à
  // un plan (appelée par le 🗑️ de la modale ℹ️ Infos et le nettoyeur
  // d'orphelins de l'inspecteur DB). Supprime : session auto (LS), géoref/
  // calibration KMZ (LS), photos (IDB), backups (IDB). PRÉSERVE
  // volontairement : le Carnet et les PDF/notes du Mode Histoire (famille
  // « Récits » — l'HISTOIRE survit aux plans, design v1.69) et les liaisons
  // inter-plans (nœuds fantômes gérés par le graphe, réutilisables si le
  // plan revient). Chaque module externe est optionnel (gardes défensives).
  async function purgeAssociatedData(id) {
    const bilan = { session: false, calib: false, photos: 0, backups: 0 };
    if (!id) return bilan;
    try {
      if (localStorage.getItem("myktamap_session_v1_" + id) != null) {
        localStorage.removeItem("myktamap_session_v1_" + id);
        bilan.session = true;
      }
    } catch(e) {}
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

  // ☁️ TRANSFERT des données associées d'un plan vers un autre id : la copie
  // locale d'un plan publié est remplacée par sa version ☁️ (même archive).
  // Session (LS, planId réécrit), calage, photos, favoris, liaisons. Refusé si
  // la cible a déjà une session : on n'écrase jamais. Les sauvegardes de
  // session restent à l'ancien id (purgées avec lui) — instantanés du passé.
  async function transferAssociatedData(ancienId, nouveauId) {
    const bilan = { ok: false, session: false, calib: false, photos: 0, favoris: 0, liaisons: 0 };
    if (!ancienId || !nouveauId || ancienId === nouveauId) return bilan;
    const cleS = function(id) { return "myktamap_session_v1_" + id; };
    try {
      if (localStorage.getItem(cleS(nouveauId)) != null) { bilan.raison = "cible-occupee"; return bilan; }
      const brut = localStorage.getItem(cleS(ancienId));
      if (brut != null) {
        let txt = brut;
        try { const o = JSON.parse(brut); if (o && typeof o === "object") { o.planId = nouveauId; txt = JSON.stringify(o); } }
        catch (e) { /* illisible : copié tel quel */ }
        localStorage.setItem(cleS(nouveauId), txt);
        localStorage.removeItem(cleS(ancienId));
        bilan.session = true;
      }
      const cal = localStorage.getItem("myktamap_kmz_calib_" + ancienId);
      if (cal != null && localStorage.getItem("myktamap_kmz_calib_" + nouveauId) == null) {
        localStorage.setItem("myktamap_kmz_calib_" + nouveauId, cal);
        localStorage.removeItem("myktamap_kmz_calib_" + ancienId);
        bilan.calib = true;
      }
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
    delete _data.folders;      // 📁 16/09/2026 — les dossiers partent avec la liste
    delete _data.plansView;
    _save();
  }

  // ========== PERF PRESET (PAR PLAN) ==========
  const _PERF_VALID = ["off", "auto", "quality", "balanced", "performance"];

  // Récupère le preset perf mémorisé pour un plan, ou null si jamais réglé.
  // ═══ 🏷️ v1.78.0 — ORGANISATION DE LA LISTE (décision KARMA 1+3+4) ═══
  // `pinned` (bool) et `tags` (string[]) sont des MÉTADONNÉES UTILISATEUR
  // locales : elles vivent dans le registre (LS), ne voyagent PAS avec les
  // ZIP, mais suivent l'export de profil (qui embarque le registre entier)
  // et l'export .config (exportToFile clone tout).

  // Épingle/désépingle un plan (remonte en tête de liste). true si appliqué.
  function setPinned(id, pinned) {
    init();
    const p = findById(id);
    if (!p) { console.warn("[PlanRegistry] setPinned : plan introuvable", id); return false; }
    if (pinned) p.pinned = true;
    else delete p.pinned;          // pas de false qui traîne dans le LS
    _save();
    return true;
  }

  // ✏️ v1.79.1 (KARMA « deux Catacombes d'auteurs différents — renommer
  // depuis le HOME pour différencier ») — NOM D'AFFICHAGE local. On ne
  // touche JAMAIS à `name` (le vrai nom du plan-config) : il sert aux
  // vérifications fonctionnelles (nameMatch de la re-sélection de ZIP,
  // double-check de session, détection de doublon, nom de fichier du 💾).
  // `displayName` n'est qu'un HABILLAGE local — il suit l'export de profil
  // et l'export .config comme tags/pinned.
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

  // Libellé à AFFICHER pour un plan (entrée ou id) : displayName > name > id.
  // Toute surface d'affichage passe par ici ; les usages FONCTIONNELS de
  // `name` (nameMatch, fichiers) ne doivent PAS l'utiliser.
  function displayName(planOuId) {
    const p = (planOuId && typeof planOuId === "object") ? planOuId : findById(planOuId);
    if (!p) return String(planOuId || "");
    return p.displayName || p.name || p.id;
  }

  // Remplace les tags d'un plan. Normalisation : trim, vides éliminés,
  // doublons (insensible casse) éliminés, 12 tags max de 24 chars max —
  // refus au-delà de la troncature silencieuse serait pire : on tronque en
  // loggant (métadonnée cosmétique, pas un réglage expert).
  // 🏷️ v1.90.1 — `origine` : "user" (défaut, édition dans ℹ️ Infos) ou
  // "index" (tags proposés par `data/index.json`, cf decouvrirPlansServeur).
  // 🩸 Sans cette distinction, la découverte réécrirait les tags à CHAQUE boot
  // et effacerait ceux que l'utilisateur a posés — exactement le ping-pong
  // corrigé sur `version` en v1.88.0. L'index PROPOSE, l'utilisateur DISPOSE.
  // 🏷️ 16/09/2026 — troisième origine, "config" : les étiquettes écrites dans
  // `plan-config.json > plan.tags` par le Générateur (champ 🏷️ Étiquettes) ou
  // ses convertisseurs KMZ / GPX / SIG. Même doctrine que l'index : le FICHIER
  // propose, l'utilisateur dispose, et l'index (le déployeur) passe avant le
  // fichier sur un plan serveur. Cf. `main.js > startImportedPlan` et
  // `importMasse.js > importer` pour l'application de la règle.
  //
  // La normalisation vit dans `normaliserTags` — UNE fonction pour l'app :
  // ℹ️ Infos, l'index, le Générateur et ses trois convertisseurs y passent.
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
      // 🩸 VIDER EST UN CHOIX, PAS UNE ABSENCE. Si on effaçait aussi
      // l'origine, la découverte verrait un plan « sans tags édités » et
      // REPROPOSERAIT ceux de l'index au démarrage suivant : l'utilisateur
      // effacerait, et ils reviendraient tout seuls. On garde donc la trace
      // du refus — seule une reprise en main par l'index la relâche.
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

  // Mémorise le preset perf pour un plan. Retourne true si modification appliquée.
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
    if (p.perfPreset === preset) return true; // pas de changement
    p.perfPreset = preset;
    _save();
    return true;
  }

  // ========== MULTI-NIVEAU (PAR PLAN, depuis v148) ==========
  // Opt-in par plan : quand multiLevel = true, l'UI affiche un sélecteur de
  // niveau dans le groupe Tracés + une sous-action 🪜 Jonction interniveau,
  // et les roads dessinees sont taguees avec un champ `level` (0, 1, 2…).
  // Quand multiLevel = false (defaut) → comportement strictement identique a
  // v147 (aucun champ level sur les roads, aucun selecteur visible).
  // Retro-compat absolue : plans existants restent intacts tant que le
  // toggle n'est pas active dans ⚙️ Reglages.
  //
  // Depuis v148.2 : le 2e parametre `fallbackIfUnset` permet a main.js de
  // passer la valeur `plan.multiLevel` du plan-config.json comme defaut.
  // Si l'utilisateur a explicitement set la valeur via ⚙️ Reglages (true
  // ou false), elle prime sur le fallback. Sinon, on prend le defaut du ZIP.
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

  // ========== SYNC MODE FLAGS (v170 — bug re-sélection ZIP) ==========
  // Aligne les flags `tiledV2` et `multiLevel` du registre sur ce qui est
  // déclaré dans un plan-config.json fraîchement uploadé. Différent de
  // addOrUpdate qui MERGE (préserve les flags existants si la nouvelle entry
  // ne les redéclare pas) : ici on SET ou DELETE explicitement selon le
  // ZIP source de vérité.
  //
  // Cas d'usage : user reset + import sauvegarde liste (registre = tiledV2:true)
  // puis re-sélectionne un ZIP V1 du même plan → on doit aligner les flags
  // pour éviter une incohérence visuelle (badge V2 sur un plan V1) et tout
  // crash runtime potentiel (si un module lit le flag du registre au lieu
  // de PLAN_CONFIG).
  //
  // flags : { tiledV2: boolean, multiLevel: boolean }
  // - true  → set le flag à true
  // - false → delete le flag (= absent dans le registre = V1 / mono-niveau)
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

  // ========== EXPORT / IMPORT ==========
  function exportToFile() {
    init();
    const exported = {
      type: "myktamap-plans-list",
      version: _data.version,
      exported_at: new Date().toISOString(),
      // Retirer les fsHandleId (non portables)
      plans: _data.plans.map(function(p) {
        const clone = Object.assign({}, p);
        delete clone.fsHandleId;
        return clone;
      }),
      // 📁 16/09/2026 — les dossiers voyagent avec la liste (comme avec le profil)
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

    // 📁 16/09/2026 — les dossiers de la liste importée : fusion par nom
    // (ou remplacement), et le folderId des plans qui arrivent est traduit.
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
      // merge : pour chaque plan importé, ajouter ou ignorer si id déjà présent
      payload.plans.forEach(function(p) {
        if (!p || !p.id) return;
        const existing = findById(p.id);
        if (!existing) {
          _data.plans.push(traduire(p));
        }
        // Si existe déjà, on ne touche pas (on garde notre version)
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

  // ═══════════════════════════════════════════════════════════════════
  // 📁 16/09/2026 — DOSSIERS DE « MES PLANS » (décisions KARMA 1-11 de
  // l'étude du même jour). Un dossier = une section nommée ; un plan est
  // dans UN dossier au plus (`folderId`), sinon « Non classés ».
  // 🩸 MÊME DOCTRINE QUE LES ÉTIQUETTES (v1.90.1) : l'index serveur PROPOSE
  // (`src`/`folderSrc` = "index"), l'utilisateur DISPOSE ("user"). Un
  // dossier déclaré par l'index est VERROUILLÉ (ni renommé ni supprimé) tant
  // que l'index le déclare — sinon il reviendrait au boot suivant, le
  // ping-pong déjà corrigé sur `version` (v1.88.0). Il est LIBÉRÉ, jamais
  // supprimé, le jour où l'index ne le déclare plus. Un plan déplacé à la
  // main n'est jamais repris par l'index. Toute la normalisation vit ici :
  // l'écran, la découverte, ConfAdmin et l'import de profil y passent.
  // ═══════════════════════════════════════════════════════════════════
  const FOLDER_NAME_MAX = 40;
  const FOLDER_COLORS = ["#8cb4ff", "#f4c542", "#7ed6a5", "#ff9f7a", "#c39bff", "#7fd8e6", "#ff7aa8", "#b8c4d6"];

  function _nomDossier(nom) { return String(nom || "").trim().replace(/\s+/g, " ").slice(0, FOLDER_NAME_MAX); }
  // 🏷️ Marche 2 — RÈGLE PAR ÉTIQUETTE : un dossier peut « inclure aussi les
  // plans étiquetés X ». Normalisée comme les étiquettes ; vide = pas de règle.
  function _regleDossier(rule) {
    const tags = normaliserTags(rule && rule.tags);
    return tags.length ? { tags: tags } : null;
  }
  // Le dossier qu'une RÈGLE donnerait à ce plan (le premier dans l'ordre des
  // dossiers), en respectant ses exclusions — jamais le rangement manuel.
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
  // Même nom, casse ignorée = même dossier. C'est la clé de fusion de l'import
  // de profil et de l'index : jamais deux « Gironde ».
  function findFolderByName(nom) {
    init();
    const k = _nomDossier(nom).toLowerCase();
    if (!k) return null;
    return (_data.folders || []).find(function(f) { return String(f.name).toLowerCase() === k; }) || null;
  }
  // Crée un dossier, ou rend celui qui porte déjà ce nom (ou cet id).
  // opts : { id?, color?, order?, src? }. L'index reprend nom/couleur/ordre
  // d'un dossier qu'il déclare ; un dossier "user" homonyme DEVIENT celui de
  // l'index (verrouillé) plutôt que d'être doublé.
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
  // Monter/descendre d'un cran (delta ±1). Renumérote tout : l'ordre est
  // toujours dense, l'index peut ensuite imposer le sien.
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
  // Supprimer un dossier ne supprime JAMAIS un plan : ils repassent en
  // Non classés. Refusé sur un dossier de l'index (il reviendrait).
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
  // 🩸 L'index ne passe JAMAIS par-dessus un geste de l'utilisateur ; sortir
  // un plan à la main est un CHOIX mémorisé (folderSrc "user" sans dossier),
  // comme vider ses étiquettes — sinon l'index le rangerait à nouveau au boot.
  function setPlanFolder(planId, folderId, origine) {
    init();
    const p = findById(planId);
    if (!p) return false;
    const src = (origine === "index") ? "index" : "user";
    if (src === "index" && p.folderSrc === "user") return false;
    if (folderId && !findFolder(folderId)) return false;
    // 🏷️ Marche 2 — si une RÈGLE capture ce plan et que l'utilisateur le sort
    // (ou le range ailleurs) à la main, on mémorise une EXCLUSION pour ce
    // dossier : sinon la règle le reprendrait au rendu suivant. Le remettre à
    // la main dans le dossier à règle lève l'exclusion.
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
  // Le dossier EFFECTIF d'un plan : un folderId orphelin (dossier disparu,
  // profil partiel) vaut Non classés — jamais une erreur.
  function planFolderId(p) {
    if (p && p.folderId && findFolder(p.folderId)) return p.folderId;   // le rangement manuel prime
    return _dossierParRegle(p);                                          // sinon la règle, sauf exclusion
  }
  // Vrai si le plan est dans son dossier PAR RÈGLE (pas rangé à la main).
  function planFolderByRule(p) {
    return !!(p && !(p.folderId && findFolder(p.folderId)) && _dossierParRegle(p));
  }
  function getPlansView() { init(); return _data.plansView === "folders" ? "folders" : "all"; }
  function hasPlansViewChoice() { init(); return _data.plansView === "folders" || _data.plansView === "all"; }
  function setPlansView(mode) { init(); _data.plansView = (mode === "folders") ? "folders" : "all"; _save(); return _data.plansView; }
  // Dossiers déclarés par data/index.json (ConfAdmin). Rend la table
  // { idDéclaré → idRéel } : un dossier "user" homonyme est repris sous SON
  // id, la découverte doit donc traduire le `folder` de chaque plan.
  // Un dossier "index" plus déclaré est LIBÉRÉ (src "user"), jamais supprimé.
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

  // Fusion PURE de dossiers importés (liste .config ou profil) dans une liste
  // locale — aucun accès à _data, aucune sauvegarde : l'appelant écrit.
  // mode "replace" : les importés remplacent ; "merge" : même nom (casse
  // ignorée) = même dossier, l'id local gagne. Rend { folders, table } où
  // table = { idImporté → idRéel } pour remapper le folderId des plans qui
  // arrivent. Un dossier importé arrive TOUJOURS "user" : le verrou "index"
  // n'a de sens que si l'index LOCAL le redéclare à la prochaine découverte.
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

  // ========== INDEXED DB POUR FILE SYSTEM HANDLES + BLOBS ZIP ==========
  function _openIDB() {
    return new Promise(function(resolve, reject) {
      if (!("indexedDB" in window)) { resolve(null); return; }
      // Version 2 : on ajoute le store "blobs" pour le stockage mobile
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

  // Demande la permission de lecture sur un handle. Retourne true/false.
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

  // ========== STOCKAGE BLOB ZIP (mobile + fallback) ==========

  // Demande au navigateur de marquer le stockage comme "persistant"
  // → empêche la purge automatique sur iOS Safari et Chrome Android
  async function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    try {
      const persisted = await navigator.storage.persisted();
      if (persisted) return true;
      return await navigator.storage.persist();
    } catch(e) { return false; }
  }

  // Stocke un Blob (le ZIP entier) dans IndexedDB
  // Retourne un objet { ok: true } ou { ok: false, error: "..." }
  async function saveBlob(id, blob) {
    if (!blob) return { ok: false, error: t("planreg.err.noFileShort") };
    // 🩸 16/09/2026 — UNE COPIE, PAS UNE RÉFÉRENCE. Chromium range un `File`
    // issu d'un sélecteur ou d'un dépôt PAR RÉFÉRENCE au fichier sur le
    // disque : IndexedDB rend ensuite un objet de la bonne taille, mais sa
    // LECTURE échoue dès que le fichier d'origine a été modifié, déplacé ou
    // supprimé (NotReadableError / NotFoundError). Vécu par KARMA après un
    // import multiple — « ça marche uniquement pour le dernier plan » : le
    // seul qui venait d'être rouvert avait été ré-enregistré depuis la
    // mémoire. Mesuré (Chromium) : plan1.zip modifié → illisible, plan2.zip
    // supprimé → introuvable, plan3 intact → lisible. On lit donc le contenu
    // et on range un Blob DÉTACHÉ du disque. Coût : le poids du ZIP en
    // mémoire une fois, le temps de l'écriture — un chargement le lit
    // entièrement de toute façon. Un Blob déjà en mémoire (export de profil,
    // `new File([blob])` d'un blob rangé) n'est pas recopié.
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
          // Souvent déclenché par QuotaExceededError
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

  // Estimation du quota disponible (utile pour avertir avant de stocker)
  async function getStorageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      return await navigator.storage.estimate();
    } catch(e) { return null; }
  }

  // ========== EXPORTS ==========
  window.PlanRegistry = {
    init:                 init,
    getAll:               getAll,
    findById:             findById,
    getRecents:           getRecents,
    getLastOpened:        getLastOpened,
    setLastPlanId:        setLastPlanId,
    addOrUpdate:          addOrUpdate,
    reload:               reload,      // 🐛 v1.79.0 — resync RAM après écriture LS externe
    purgeAssociatedData:  purgeAssociatedData,  // 🧹 v1.79.3 — session/géoref/photos/backups d'un plan
    transferAssociatedData: transferAssociatedData, // ☁️ copie locale → version publiée
    setPinned:            setPinned,   // 🏷️ v1.78.0
    setTags:              setTags,     // 🏷️ v1.78.0
    setDisplayName:       setDisplayName, // ✏️ v1.79.1
    displayName:          displayName,    // ✏️ v1.79.1 — libellé d'affichage
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
    // 📁 16/09/2026 — dossiers de « Mes plans »
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
    planFolderByRule:     planFolderByRule,   // 🏷️ marche 2
    setFolderRule:        setFolderRule,      // 🏷️ marche 2
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
    // Stockage Blob (mobile + fallback)
    saveBlob:             saveBlob,
    getBlob:              getBlob,
    removeBlob:           removeBlob,
    requestPersistentStorage: requestPersistentStorage,
    getStorageEstimate:   getStorageEstimate
  };

})();
