/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// main.js — démarrage de l'app : découverte des plans serveur (data/index.json), import navigateur, registre de
// plans, lancement de la carte et libération du plan précédent.
// Expose : window.ktaKiosqueServeurSeul, ktaIdRegistreExtension, ktaEstIdRegistreExtension, lancerApplication…
// Dépend de : PlanRegistry, SessionPersist, KtaInstance, KtaExtensions, map.js, utils.js.
// Pièges : 🩸 l'ordre initMapFromConfig → initDataFromConfig est un contrat (registres vidés au bon endroit).
//          🔒 tout refus kiosque passe par window.ktaKiosqueServeurSeul, jamais par KIOSK_CONFIG à la main.
// Garde-fous : check-plan-tags.js (ancres des tags), check-gate-instance.js, check-kiosque-serveur.js,
// check-extensions.js (une partie de l'ordre du boot).
// Doc : docs/architecture/plans-loader.md, community-server-line.md
// =========================

// ── Chargement des données ──────────────────────
async function initDataFromConfig() {
  const config = window.PLAN_CONFIG;
  if (!config || !Array.isArray(config.dataLayers)) {
    console.warn("[Main] Aucune dataLayer à charger");
    return;
  }
  // Routes embarquées du plan précédent : re-remplies par ajouterPointsDepuisJSON > registerEmbeddedRoad.
  if (typeof window.clearEmbeddedRoads === "function") {
    window.clearEmbeddedRoads();
  }

  // 🩸 Registres des objets data layers vidés au changement de plan : sinon le filtre niveau modifie des objets
  // détachés de la carte. Re-remplis par ajouterPointsDepuisJSON ci-dessous.
  window._ktaDataMarkers   = [];
  window._ktaDataPolylines = [];
  window._ktaDataPolygons  = [];
  window._ktaDataStructurePolygons = [];
  // 🩸 Ne PAS vider window._ktaImageOverlays ici : initDataFromConfig tourne APRÈS initMapFromConfig, qui vient de
  // le remplir (reset fait dans map.js juste avant les push). Le vider casse les cases imageLayer du filtre.
  // Ghosts note du data layer KMZ : sinon références mortes vers les layerGroups du plan précédent (utils.js).
  if (typeof window._kta_resetDataLayerNoteGhosts === "function") {
    window._kta_resetDataLayerNoteGhosts();
  }
  // ⚠️ Couche « plan » de la légende personnalisée (PLAN_CONFIG.customLegend) : exige PLAN_CONFIG en place.
  // La couche « session » est chargée par SessionPersist._applyRestore().
  if (window.LegendCustomization && typeof window.LegendCustomization.loadPlanState === "function") {
    window.LegendCustomization.loadPlanState();
  }
  // Favoris indexés par planId : changer de plan = changer de liste active.
  if (window.Favoris && typeof window.Favoris.loadPlan === "function") {
    window.Favoris.loadPlan(window._currentLoadedPlanId || null);
  }

  // 🩸 Session avec des points editor pour ce plan → on saute data/editor.json (la session fait autorité).
  // Sinon les markers du JSON arrivent après le restore, hors listePoints, et le prochain render les efface en
  // silence. Lecture par SessionPersist.getSaved(planId) (slot par plan), jamais l'ancien slot unique.
  let _skipEditorJsonLoad = false;
  try {
    const planId = window._currentLoadedPlanId;
    const saved  = (window.SessionPersist && typeof window.SessionPersist.getSaved === "function")
                   ? window.SessionPersist.getSaved(planId)
                   : null;
    if (saved) {
      const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "";
      const idMatch   = saved.planId === planId;
      const nameMatch = (!saved.planName || !planName) ? true : (saved.planName === planName);
      if (idMatch && nameMatch && Array.isArray(saved.editorPoints) && saved.editorPoints.length > 0) {
        _skipEditorJsonLoad = true;
        console.log("[Main] Session active avec", saved.editorPoints.length, "point(s) editor → skip data/editor.json (session autoritative)");
      }
    }
  } catch(e) {
    console.warn("[Main] _skipEditorJsonLoad detection failed :", e);
  }

  config.dataLayers.forEach(function(layerConfig) {
    if (_skipEditorJsonLoad && layerConfig.id === "editor") return;
    const targetLayer = window.dataLayerGroups?.[layerConfig.id];
    if (targetLayer) {
      ajouterPointsDepuisJSON(layerConfig.file, targetLayer);
    }
  });
}

// Verrou anti double lancement.
let _appEnCours = false;
// true = l'utilisateur a explicitement demandé un import.
let _importDemande = false;

// ── Découverte serveur (data/index.json) ──────────────────────
// Mode serveur kiosque (community-server-line.md) : index.json porte plans[], un bloc `config` (subtitle + 2 flags
// MAX, règle figée) et un bloc `liaisons`. Servi network-first par le SW : une modif s'applique au boot suivant.
// ⚠️ _chargerIndexServeur() tourne TOUJOURS au boot : la pref « ne pas charger les plans serveur » ne saute que
// l'enregistrement des plans, jamais la config d'instance.
async function _chargerIndexServeur() {
  try {
    // La config d'instance a déjà été lue avant les gates (js/ktaInstance.js) : on reprend ce résultat.
    // 🩸 Repli sans le module : `no-store` explicite. Quand le SW ne contrôle pas encore l'onglet, c'est le cache
    // HTTP qui répond, et Nginx ne pose `no-cache` que sur sw.js/version.json/… : un index modifié remonterait périmé.
    let idx = null;
    if (window.KtaInstance && typeof window.KtaInstance.charger === "function") {
      const st = await window.KtaInstance.charger();
      idx = st && st.repondu ? st.index : null;
      // Index injoignable mais config connue : le kiosque garde ses réglages hors ligne (même source que la gate
      // et le connecteur). Pas de plans à découvrir : on sort sans index.
      if (!idx && st && st.config) {
        window.KIOSK_CONFIG = st.config;
        _appliquerConfigKiosque();
      }
    } else {
      const r = await fetch("data/index.json", { cache: "no-store" });
      idx = r.ok ? await r.json() : null;
    }
    if (!idx) {
      console.log("[Main] data/index.json absent — pas de config d'instance");
      // 🩸 Hors ligne sans cache, le SW répond un 404 SYNTHÉTIQUE, indiscernable d'un vrai : traité en « index
      // injoignable » → dernière config connue (règle B), jamais OFF (décision produit : instance connectée hors
      // ligne = HS).
      _appliquerConnexionServeur(null, false);
      return null;
    }
    window.KIOSK_CONFIG = (idx && typeof idx.config === "object" && idx.config) ? idx.config : null;
    _appliquerConfigKiosque();
    // Défauts de l'installation (ex. sitePlansHiddenDefault) connus seulement maintenant : l'accueil se resynchronise.
    if (typeof window.refreshPlansList === "function") { try { window.refreshPlansList(); } catch(e) {} }
    _appliquerConnexionServeur(window.KIOSK_CONFIG, true);

    // La revalidation du mot de passe d'instance a lieu AVANT la gate (initApp) : rien à refaire ici.
    // Liaisons de l'instance : fusion idempotente par link.id à chaque boot. Une liaison retirée côté serveur reste
    // chez qui l'a déjà (décision produit).
    try {
      const lks = idx && idx.liaisons && Array.isArray(idx.liaisons.links) ? idx.liaisons.links : [];
      if (lks.length && window.InterPlanLinks && typeof window.InterPlanLinks.importLinks === "function") {
        const added = window.InterPlanLinks.importLinks(lks);
        if (added > 0) console.log("[Main] Liaisons kiosque fusionnées : +" + added);
      }
    } catch(e) { console.warn("[Main] liaisons kiosque :", e); }
    return idx;
  } catch(e) {
    console.warn("[Main] lecture data/index.json :", e);
    _appliquerConnexionServeur(null, false);
    return null;
  }
}

// Connexion serveur de l'instance (`config.serverConnection`) : état et pastille dans js/ktaExtensions.js.
// ⚠️ `indexRepondu` dit si l'index a vraiment répondu : la fonction ne peut pas le deviner (cf revaliderInstance).
function _appliquerConnexionServeur(config, indexRepondu) {
  try {
    if (window.KtaExtensions && typeof window.KtaExtensions.appliquerConfig === "function") {
      window.KtaExtensions.appliquerConfig(config, indexRepondu === true);
    }
  } catch(e) { console.warn("[Main] connexion serveur :", e); }
}

// « Instance indisponible » : instance connectée dont le module de connexion ne se charge pas ou dont la gate
// déléguée échoue. L'app reste bloquée ici ; « Réessayer » recharge la page.
// 🔒 JAMAIS de repli sur la gate community. Motif "licence" (licence pro absente, expirée, refusée) : même écran,
// sinon l'app s'ouvrirait en community sur les données du dernier utilisateur de l'appareil.
function _motifBlocage() {
  const e = (window.KtaExtensions && typeof window.KtaExtensions.etat === "function") ? window.KtaExtensions.etat() : null;
  return (e && e.etat === "licence") ? "licence" : "";
}
function _ktaInstanceIndisponible(motif) {
  return new Promise(function() {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const lic = motif === "licence";
    const e = (lic && window.KtaExtensions) ? window.KtaExtensions.etat() : null;
    const ov = document.createElement("div");
    ov.id = "kta-instance-indispo";
    ov.className = "kta-instance-indispo";
    ov.setAttribute("role", "alertdialog");
    const boite = document.createElement("div");
    boite.className = "kta-instance-indispo-boite";
    const h = document.createElement("h2"); h.textContent = t(lic ? "ext.licence.titre" : "ext.indispo.titre");
    const p = document.createElement("p");
    p.textContent = lic
      ? t((e && e.raison) ? "ext.licence.texteRaison" : "ext.licence.texte", { raison: e && e.raison ? e.raison : "" })
      : t("ext.indispo.texte");
    const b = document.createElement("button"); b.type = "button"; b.className = "kta-btn kta-btn-primary";
    b.textContent = t("ext.indispo.reessayer");
    b.addEventListener("click", function() { location.reload(); });
    boite.appendChild(h); boite.appendChild(p); boite.appendChild(b);
    // Licence absente / refusée : lien vers la présentation de la licence pro (même adresse que le pied de page
    // de l'accueil, index.html).
    if (lic) {
      const lien = document.createElement("a");
      lien.className = "kta-instance-indispo-lien";
      lien.href = "https://pro.myktamap.fr/?presentation";
      lien.target = "_blank"; lien.rel = "noopener noreferrer";
      lien.textContent = t("ext.licence.lienPro");
      boite.appendChild(lien);
    }
    ov.appendChild(boite);
    document.body.appendChild(ov);
    // Promesse jamais résolue : le démarrage s'arrête là, comme un lockout de gate.
  });
}

// Plans fournis par une extension (prise « source de plans ») : inscrits en `type: "ext"`, ouverts par
// KtaExtensions.chargerPlanExtension (homeLoader). Extension muette = aucun plan ajouté (erreur ignorée).
// Id du registre d'un plan d'extension : seule fabrique, aussi lue par l'accueil.
window.ktaIdRegistreExtension = function(extId) {
  return "ext_" + String(extId).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
};
// Réciproque (plan ou dossier d'extension, même préfixe) : sert quand la ligne du registre manque (profil importé
// avec une session ou photo d'un plan d'extension sans son entrée).
window.ktaEstIdRegistreExtension = function(id) {
  return typeof id === "string" && id.indexOf("ext_") === 0;
};
async function _decouvrirPlansExtension() {
  if (!window.KtaExtensions || !window.PlanRegistry || !window.KtaExtensions.aPrise("plans")) return;
  const liste = await window.KtaExtensions.listerPlansExtension();
  liste.forEach(function(p) {
    if (!p || !p.id) return;
    const id = window.ktaIdRegistreExtension(p.id);
    const entree = { id: id, type: "ext", extId: String(p.id), name: String(p.name || p.id), version: p.version || null };
    // Mode fourni par l'extension (badge avant la 1re ouverture) : seulement « vrai », jamais d'écrasement d'un
    // réglage de l'utilisateur.
    if (p.tiledV2 === true) entree.tiledV2 = true;
    if (p.multiLevel === true) entree.multiLevel = true;
    window.PlanRegistry.addOrUpdate(entree);
    if (Array.isArray(p.tags) && typeof window.PlanRegistry.setTags === "function") window.PlanRegistry.setTags(id, p.tags, "index");
  });
  if (liste.length) console.log("[Main] " + liste.length + " plan(s) fourni(s) par une extension");

  // Dossiers fournis par l'extension : même doctrine que ceux de l'index (proposés, verrouillés tant que déclarés,
  // le rangement manuel l'emporte). 🩸 Appliqués EN MÊME TEMPS que ceux de l'index, sinon applyIndexFolders
  // libère ces derniers. null (serveur injoignable) : rien ne bouge.
  const dossiers = await window.KtaExtensions.dossiersExtension();
  if (Array.isArray(dossiers) && typeof window.PlanRegistry.applyIndexFolders === "function") {
    const st = (window.KtaInstance && window.KtaInstance.etat) ? window.KtaInstance.etat() : null;
    const deIndex = (st && st.index && Array.isArray(st.index.folders)) ? st.index.folders : [];
    const table = window.PlanRegistry.applyIndexFolders(deIndex.concat(dossiers.map(function(d) {
      return Object.assign({}, d, { id: "ext_" + d.id });
    })));
    // Dossier du registre → dossier de l'extension : un rangement manuel dans un dossier de l'installation vaut
    // pour tous (si le compte en a le droit).
    if (typeof window.KtaExtensions.associerDossiersExtension === "function") {
      const corresp = {};
      dossiers.forEach(function(d) { const r = table["ext_" + d.id]; if (r) corresp[r] = String(d.id); });
      window.KtaExtensions.associerDossiersExtension(corresp);
    }
    liste.forEach(function(p) {
      if (!p || !p.id || typeof window.PlanRegistry.setPlanFolder !== "function") return;
      const id = window.ktaIdRegistreExtension(p.id);
      const cible = p.dossier ? (table["ext_" + p.dossier] || null) : null;
      const e = window.PlanRegistry.findById(id);
      if (cible) window.PlanRegistry.setPlanFolder(id, cible, "index");
      else if (e && e.folderSrc === "index") window.PlanRegistry.setPlanFolder(id, null, "index");
    });
  }
}

// 🔒 Le verrou kiosque, en un seul point. Masquer un bouton ne ferme pas une porte (un import de profil rouvrirait
// tous les ZIP) : tout ce qui doit être refusé en kiosque interroge CE prédicat, jamais `KIOSK_CONFIG` à la main.
window.ktaKiosqueServeurSeul = function() {
  if (window.KIOSK_CONFIG && window.KIOSK_CONFIG.serverPlansOnly === true) return true;
  // Prise « droit d'import » : une extension peut refuser l'import local (réglage admin, rôle Lecteur). Même goulot
  // pour import simple, multiple et de profil. 🔒 Une prise qui échoue REFUSE (KtaExtensions._permission).
  if (window.KtaExtensions && typeof window.KtaExtensions.importAutorise === "function" &&
      !window.KtaExtensions.importAutorise()) return true;
  return false;
};

// Application de `config` : sous-titre (textContent, data-i18n retiré pour survivre au changement de langue) et
// flags kiosque (désencombrer l'UI, pas de la sécurité : la sécurité est dans ktaKiosqueServeurSeul).
function _appliquerConfigKiosque() {
  const cfg = window.KIOSK_CONFIG || {};
  const st = (typeof cfg.subtitle === "string") ? cfg.subtitle.trim().slice(0, 80) : "";
  if (st) {
    document.querySelectorAll('[data-i18n="home.tagline"]').forEach(function(el) {
      el.textContent = st;
      el.removeAttribute("data-i18n");
    });
    console.log("[Main] Sous-titre kiosque appliqué :", st);
  }
  if (cfg.serverPlansOnly === true) {
    // Masque le flux d'import et les prefs serveur sans objet ; liste, Outils et données user restent intacts.
    const pz = document.getElementById("panelZip");
    if (pz) {
      pz.style.display = "none";
      const head = pz.previousElementSibling;
      if (head && head.classList && head.classList.contains("loader-section-head")) head.style.display = "none";
    }
    const filtres = document.querySelector(".loader-plans-filters");
    if (filtres) filtres.style.display = "none";
    // 🩸 L'import multiple vit dans les Outils, HORS de `#panelZip` : à masquer à part, sinon N plans entrent d'un
    // coup. Le module refuse aussi de s'ouvrir.
    const impMasse = document.getElementById("loaderImportMasseBtn");
    if (impMasse) impMasse.style.display = "none";
    const skipCb = document.getElementById("loaderSkipServerPlansCb");
    if (skipCb && skipCb.closest) {
      const sec = skipCb.closest(".kta-aide-section");
      if (sec) sec.style.display = "none";
    }
    // 🩸 Deux préférences vident un kiosque et leurs cases sont masquées ici : « Ne pas charger les plans serveur »
    // et « Afficher les plans serveur » (décochée). Écran vide sans réglage pour s'en sortir. Elles arrivent par
    // import de profil ou d'avant le kiosque : on les remet à leur valeur sûre.
    try {
      localStorage.setItem("myktamap_loader_show_server_plans", "true");
      localStorage.setItem("myktamap_skip_server_plans_v1", "false");
    } catch(e) {}
    console.log("[Main] Kiosque : serverPlansOnly actif (import masqué)");
  }
  if (cfg.disableGenerator === true) {
    const gen = document.getElementById("loaderPlannerBtn");
    if (gen) gen.style.display = "none";
    console.log("[Main] Kiosque : disableGenerator actif");
  }
  // Défauts d'installation (sitePlansHiddenDefault, plansViewDefault) : ne valent que tant que l'utilisateur n'a
  // pas choisi. Rien n'est écrit dans le registre (ce serait un choix qu'il n'a pas fait) : homeLoader les lit.
  if (cfg.sitePlansHiddenDefault === true && cfg.serverPlansOnly !== true) {
    console.log("[Main] Instance : plans du site masqués par défaut (sitePlansHiddenDefault)");
  }
  if (cfg.plansViewDefault === "folders" || cfg.plansViewDefault === "all") {
    window._ktaPlansViewParDefaut = cfg.plansViewDefault;
    const dejaChoisi = !!(window.PlanRegistry && window.PlanRegistry.hasPlansViewChoice && window.PlanRegistry.hasPlansViewChoice());
    console.log("[Main] Kiosque : plansViewDefault =", cfg.plansViewDefault, dejaChoisi ? "(ignoré : l'utilisateur a déjà choisi)" : "(appliqué)");
  }
}

async function decouvrirPlansServeur(idxDeja) {
  if (!window.PlanRegistry) return;
  try {
    const idx = idxDeja || await _chargerIndexServeur();
    if (!idx) return;
    const plans = Array.isArray(idx?.plans) ? idx.plans : [];
    // Ids vus dans l'index : sert à élaguer en fin de fonction les entrées qui n'y sont plus.
    const vus = [];
    console.log("[Main] index.json trouvé :", plans.length, "plan(s)");

    // Dossiers déclarés par l'index : l'index PROPOSE, l'utilisateur DISPOSE. Verrouillé tant que déclaré, LIBÉRÉ
    // (jamais supprimé) ensuite. La table traduit l'id déclaré vers l'id réel (dossier local homonyme repris).
    const tableDossiers = (window.PlanRegistry.applyIndexFolders)
      ? window.PlanRegistry.applyIndexFolders(Array.isArray(idx.folders) ? idx.folders : []) : {};

    plans.forEach(function(entry) {
      // Format détaillé : { id, path, name, version?, author?, multiLevel?, tiledV2? }
      // Format minimal : "test1" (string) → on déduit
      let path, name, version, author, id, multiLevel, tiledV2, zip = null;
      if (typeof entry === "string") {
        path = "data/" + entry;
        name = entry;
        id   = window.PlanRegistry.genServerId(path);
      } else if (entry && typeof entry === "object") {
        path = entry.path || ("data/" + (entry.id || ""));
        // Plan déclaré par son ARCHIVE (`"zip": "data/x.zip"`) : ouvert comme un ZIP importé.
        // 🔒 Chemin relatif seulement (ni schéma, ni « .. », ni absolu) : jamais de téléchargement hors installation.
        if (typeof entry.zip === "string" && /^[\w./-]+\.zip$/i.test(entry.zip) &&
            entry.zip.indexOf("..") < 0 && entry.zip.charAt(0) !== "/") {
          zip = entry.zip;
        } else if (entry.zip) {
          console.warn("[Main] index.json : zip refusé (chemin relatif .zip attendu) :", entry.zip);
        }
        name = entry.name || entry.id || path;
        version = entry.version || null;
        author  = entry.author  || null;
        // Flags optionnels : badges V2 / Multi-LVL sans charger chaque plan-config.json. Sinon ils sont stockés au
        // premier chargement (_enregistrerPlanCharge).
        if (entry.multiLevel === true) multiLevel = true;
        if (entry.tiledV2    === true) tiledV2    = true;
        id   = entry.id ? "server_" + entry.id.replace(/[^a-z0-9_-]/gi, "_") : window.PlanRegistry.genServerId(path);
      } else {
        return;
      }

      const regEntry = {
        id: id,
        type: "server",
        path: path,
        zip: zip,
        name: name,
        author: author,
        discovered: true,
        addedAt: new Date().toISOString()
      };
      // 🩸 Version : plan-config.json fait autorité (il est DANS le plan), index.json n'est qu'un indice avant le
      // premier chargement. addOrUpdate fait un Object.assign : écrire la version de l'index à chaque boot la ferait
      // ping-ponguer, et écrire `null` l'effacerait. On n'écrase jamais une version d'origine « plan ».
      const _dejaLa = window.PlanRegistry.findById ? window.PlanRegistry.findById(id) : null;
      if (version && !(_dejaLa && _dejaLa.versionSrc === "plan")) {
        regEntry.version    = version;
        regEntry.versionSrc = "index";
      }
      // 🩸 Flags ajoutés seulement s'ils sont vrais : sinon l'Object.assign efface un multiLevel:false de l'user.
      if (multiLevel === true) regEntry.multiLevel = true;
      if (tiledV2    === true) regEntry.tiledV2    = true;
      // Dossier proposé : appliqué après l'écriture de l'entrée (setPlanFolder exige le plan).
      const dossierIndex = (entry && entry.folder) ? (tableDossiers[String(entry.folder)] || null) : null;
      vus.push(id);
      window.PlanRegistry.addOrUpdate(regEntry);

      // Jamais par-dessus un plan rangé à la main (folderSrc "user", setPlanFolder refuse). Un plan que l'index ne
      // range plus n'en sort que s'il y était par lui.
      if (window.PlanRegistry.setPlanFolder) {
        const _apres = window.PlanRegistry.findById(id);
        if (dossierIndex) window.PlanRegistry.setPlanFolder(id, dossierIndex, "index");
        else if (_apres && _apres.folderSrc === "index") window.PlanRegistry.setPlanFolder(id, null, "index");
      }

      // Tags proposés par l'index (ConfAdmin). 🩸 Jamais par-dessus des tags posés à la main, sinon chaque boot
      // efface le travail de l'utilisateur. Normalisation (trim, dédup, 12 max, 24 car.) : PlanRegistry.setTags.
      if (Array.isArray(entry && entry.tags) && entry.tags.length &&
          !(_dejaLa && _dejaLa.tagsSrc === "user")) {
        window.PlanRegistry.setTags(id, entry.tags, "index");
      } else if (_dejaLa && _dejaLa.tagsSrc === "index" && _dejaLa.tags) {
        // Tags retirés de l'index : ceux qu'il avait posés s'en vont (jamais ceux de l'utilisateur).
        window.PlanRegistry.setTags(id, [], "index");
      }
    });

    // 🩸 Élagage des plans serveur disparus de index.json : sans lui, ils restent dans « Mes plans » et partent dans
    // l'export de profil. Seules les entrées serveur `discovered: true` sont retirées (jamais un plan importé).
    // Atteint seulement si index.json a répondu : un serveur injoignable ne vide pas la liste.
    // ⚠️ Les données associées (sessions, photos, géoréf) restent : elles se rattachent si le plan revient.
    try {
      const connus = new Set(vus);
      const aRetirer = (window.PlanRegistry.getAll() || []).filter(function (p) {
        return p && p.type === "server" && p.discovered === true && !connus.has(p.id);
      });
      aRetirer.forEach(function (p) {
        console.log("[Main] Plan serveur disparu de index.json — retiré du registre :", p.id);
        window.PlanRegistry.remove(p.id);
      });
      if (aRetirer.length) console.log("[Main] Élagage serveur :", aRetirer.length, "entrée(s)");
    } catch (e) {
      console.warn("[Main] élagage des plans serveur :", e);
    }
  } catch(e) {
    console.warn("[Main] Erreur auto-discovery serveur :", e);
  }
}

// ── Registre après chargement ──────────────────────
function _enregistrerPlanCharge(infos) {
  if (!window.PlanRegistry || !infos) return;
  window.PlanRegistry.addOrUpdate(infos);
  window.PlanRegistry.markOpened(infos.id);
}

// ── Lancement de la carte (après config prête) ──────────────────────
async function lancerApplication() {
  if (_appEnCours) {
    console.warn("[Main] lancerApplication déjà en cours, ignoré");
    return;
  }
  _appEnCours = true;

  // Début de session (durée affichée par Détails session) ; remis à zéro au changement de plan.
  window._sessionStartTs = Date.now();

  try {
  window.interfaceInitialized = false;
  window.roadInitialized      = false;
  window.zonesInitialized     = false;
  // 🩸 cleanupExistingMap (map.js) détruit l'ancienne carte et ses listeners map.on() : sans ce reset,
  // initStructures sort tôt et le clic de dessin des structures est perdu sur la nouvelle carte.
  window.structuresInitialized = false;

  // Multi-niveau : préférence par plan, et à chaque changement de plan activeLevel = 0. Feature off → UI cachée,
  // comportement mono-niveau.
  try {
    const _planId = window._currentLoadedPlanId;
    // Priorité : 1. choix explicite de l'user (PlanRegistry.multiLevel, true ou false) · 2. plan-config.json
    // `plan.multiLevel` · 3. false.
    const _fromConfig = !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan
                            && window.PLAN_CONFIG.plan.multiLevel === true);
    const _multiOn = (_planId && window.PlanRegistry && typeof window.PlanRegistry.getMultiLevel === "function")
      ? window.PlanRegistry.getMultiLevel(_planId, _fromConfig)
      : _fromConfig;
    APP_CONFIG.multiLevel     = !!_multiOn;
    APP_CONFIG.activeLevel    = 0;
    if (!Array.isArray(APP_CONFIG.availableLevels) || APP_CONFIG.availableLevels.length === 0) {
      APP_CONFIG.availableLevels = [-2, -1, 0, 1, 2];  // défaut symétrique
    }
    // Tous les niveaux visibles au lancement (décision produit) : un relevé SIG en porte six ou sept, n'en montrer
    // que trois cache le reste du travail sans le dire. « Afficher tous les niveaux au lancement » décochée (panneau
    // Performance du HOME) → -1, 0, +1. Hors du méta ULTRA : afficher plus n'est pas optimiser.
    if (APP_CONFIG.multiLevel) {
      const _tous = !(window.PerfUltra && window.PerfUltra.get("tousNiveaux") === false);
      if (_tous) {
        APP_CONFIG.visibleLevels = APP_CONFIG.availableLevels.slice();
      } else {
        const _candidats = [-1, 0, 1].filter(function(l) {
          return APP_CONFIG.availableLevels.indexOf(l) >= 0;
        });
        APP_CONFIG.visibleLevels = _candidats.length > 0 ? _candidats : [0];
      }
    } else {
      APP_CONFIG.visibleLevels = [0];   // reset filtre : montre uniquement le niveau 0 au load
    }
    // Auto-extension de availableLevels, premier passage (session) : voir window._etendreAvailableLevelsSiBesoin.
    if (APP_CONFIG.multiLevel === true && typeof window._etendreAvailableLevelsSiBesoin === "function") {
      window._etendreAvailableLevelsSiBesoin();
    }
    window.APP_CONFIG = APP_CONFIG;
    // Classe lue par la boussole et les éléments fixes en haut à gauche : ils descendent pour laisser place au
    // contrôle « niveau actif » sous le zoom.
    if (APP_CONFIG.multiLevel === true) {
      document.body.classList.add("kta-multilevel-active");
    } else {
      document.body.classList.remove("kta-multilevel-active");
    }
    console.log("[Main] multiLevel pour ce plan :", APP_CONFIG.multiLevel, "(planId=" + _planId + ")");
  } catch(e) {
    console.warn("[Main] init multi-niveau a echoue :", e);
  }

  // Modales orphelines du plan précédent.
  ["kta-aide-modal","kta-legende-modal","kta-cfg-modal","kta-readme-modal",
   "kta-readme-choix","kta-conv-modal","kta-planner-modal","popupChangerPlan",
   "kta-titre-fixe"
  ].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  const overlay = document.getElementById("planLoaderOverlay");
  if (overlay) overlay.style.display = "none";

  // Ré-affiche header et statusbar (symétrique d'afficherLoader).
  document.body.classList.remove("kta-loader-active");

  // Message pendant le rendu de la carte (lourd en V2).
  if (typeof window._majOverlayChargement === "function") {
    window._majOverlayChargement(window.I18n.t("main.loading.mapInit"));
  }

  // 🩸 Jamais un requestAnimationFrame nu ici : il peut ne jamais venir (cf utils.js > ktaAttendreImage).
  await window.ktaAttendreImage();

  await initMapFromConfig();
  await initDataFromConfig();

  map.fitBounds(bounds);

  initEditor();
  initRoad();
  initZones();
  // Structures (piliers + murs) après initZones : ordre lisible des map.on("click") (ils se cumulent).
  if (typeof window.initStructures === "function") {
    window.initStructures();
  }
  initMeasure();
  initInterface();
  // 🔒 Plan relié en droit « lire » : outils de dessin grisés dès l'ouverture (sans extension : rien).
  if (typeof window.ktaMajOutilsLectureSeule === "function") window.ktaMajOutilsLectureSeule();
  initTracking();

  // ⚠️ Ordre : 1. SessionBackups.init() (IDB + timer 5 min) · 2. snapshot AVANT restore — au changement de plan,
  // c'est la seule copie de la session du plan précédent avant que les saves auto l'écrasent ·
  // 3. SessionPersist.onPlanLoaded · 4. second snapshot APRÈS restore (point de retour récent).
  if (window.SessionBackups && typeof window.SessionBackups.init === "function") {
    window.SessionBackups.init().then(function() {
      try { window.SessionBackups.snapshot("boot-pre-restore"); } catch(e) {}
    });
  }

  // 🩸 Échelle recalibrée et réglages tracking par plan : appliqués ICI, où _currentLoadedPlanId est enfin posé
  // (buildAppConfigFromPlan tourne trop tôt pour lire la bonne pref).
  if (typeof window.appliquerScalePerPlan === "function") window.appliquerScalePerPlan();
  if (typeof window.appliquerTrackingPerPlan === "function") window.appliquerTrackingPerPlan();
  if (typeof window.appliquerSmartNavPerPlan === "function") window.appliquerSmartNavPerPlan();

  // Restauration de session du plan courant + démarrage de l'auto-save.
  if (window.SessionPersist) {
    window.SessionPersist.onPlanLoaded(window._currentLoadedPlanId || null);
  }
  // Photos rangées sous le nom du point → sous son uid.
  if (typeof window._ktaPlanifierMigrationPhotos === "function") window._ktaPlanifierMigrationPhotos();
  // Vue laissée à la dernière visite, APRÈS la restauration (qui recentre sur la dernière position du tracker) ;
  // sans vue mémorisée, le cadrage initial reste. Un portail (InterPlanLinks) recentre encore après.
  if (window.KtaVuePlan) {
    try { window.KtaVuePlan.appliquer(window._currentLoadedPlanId || null); } catch(e) {
      console.warn("[Main] vue mémorisée :", e);
    }
  }

  // 🩸 Ouverture d'une sortie au carnet APRÈS onPlanLoaded : la baseline des compteurs doit inclure la session
  // restaurée, sinon tout l'existant compte comme « ajouté pendant cette sortie ».
  if (window.Journal && typeof window.Journal.onPlanLoaded === "function") {
    try {
      window.Journal.onPlanLoaded(
        window._currentLoadedPlanId || null,
        (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || null
      );
    } catch(e) { console.warn("[Main] Journal.onPlanLoaded échec :", e); }
  }

  // Scénarios de secours du plan (localStorage). Idempotent.
  if (window.SecoursMode && typeof window.SecoursMode.init === "function") {
    try { window.SecoursMode.init(); } catch(e) {
      console.warn("[Main] SecoursMode.init échec :", e);
    }
  }

  // Second snapshot APRÈS restore, avec un délai pour laisser finir setRoads & co.
  if (window.SessionBackups && typeof window.SessionBackups.snapshot === "function") {
    setTimeout(function() {
      try { window.SessionBackups.snapshot("boot-after-restore"); } catch(e) {}
    }, 500);
  }

  // Label de distance d'un road "itinerary" restauré (aussi rappelé après chaque setRoads de la modale).
  if (typeof window._majLabelDistanceItineraire === "function") {
    window._majLabelDistanceItineraire();
  }

  // Heartbeat OOMGuard : marker localStorage toutes les 5 s, effacé au pagehide. Retrouvé au boot = l'OS a tué
  // l'app (typiquement OOM) → toast.
  if (window.OOMGuard) window.OOMGuard.start();

  // Header + status bar de refonteInterface.js, maintenant que la carte et les getters sont prêts.
  if (typeof window._refonteInterfacePostInit === "function") {
    try { window._refonteInterfacePostInit(); } catch(e) {
      console.warn("[Refonte UI] postInit error:", e);
    }
  }

  // 🩸 Sync BatteryGuard après le postInit (chips créés) : getBattery() est async et peut arriver après
  // l'attachement du listener, d'où 4 tentatives étalées.
  if (window.BatteryGuard && typeof window.BatteryGuard.forceCheck === "function") {
    function _batteryForceSync() {
      try { window.BatteryGuard.forceCheck(); } catch(e) {}
    }
    // Ids gardés pour être annulés au changement de plan (sinon callbacks orphelins sur un DOM reconstruit).
    if (Array.isArray(window._ktaBatteryForceTimers)) {
      window._ktaBatteryForceTimers.forEach(function(id) { clearTimeout(id); });
    }
    window._ktaBatteryForceTimers = [];
    _batteryForceSync();              // immédiat (pas un timeout, pas à tracker)
    window._ktaBatteryForceTimers.push(setTimeout(_batteryForceSync, 300));   // après getBattery().then typique
    window._ktaBatteryForceTimers.push(setTimeout(_batteryForceSync, 1000));  // safety net si promise lente
    window._ktaBatteryForceTimers.push(setTimeout(_batteryForceSync, 3000));  // dernière chance (3s = limite raisonnable)
  }

  // 🩸 iOS PWA (viewport-fit=cover) : la viewport change après l'activation du SW, Leaflet garde l'ancienne taille
  // (bande en haut/bas, tuiles décalées). invalidateSize + listeners resize/orientation (rotation, barre Safari).
  if (window.map && typeof window.map.invalidateSize === "function") {
    requestAnimationFrame(function() {
      try { window.map.invalidateSize(); } catch(e) {}
      // 2e passe : fin de l'animation de la status bar iOS.
      setTimeout(function() {
        try { window.map.invalidateSize(); } catch(e) {}
      }, 300);
    });
    if (!window._ktaResizeBound) {
      window._ktaResizeBound = true;
      window.addEventListener("resize", function() {
        if (window.map && typeof window.map.invalidateSize === "function") {
          try { window.map.invalidateSize(); } catch(e) {}
        }
      });
      window.addEventListener("orientationchange", function() {
        setTimeout(function() {
          if (window.map && typeof window.map.invalidateSize === "function") {
            try { window.map.invalidateSize(); } catch(e) {}
          }
        }, 200);
      });
    }
  }

  console.log("[Main] Application lancée");

  // ⚠️ Plan prêt pour une extension (synchro entrante et sortante) : APRÈS la restauration de session, jamais
  // avant — un lot reçu plus tôt serait écrasé par initEditor / onPlanLoaded (ktaExtensions.js > planPret).
  if (window.KtaExtensions && typeof window.KtaExtensions.planCharge === "function") {
    try { window.KtaExtensions.planCharge(window._currentLoadedPlanId || null); } catch(e) {
      console.warn("[Main] KtaExtensions.planCharge échec :", e);
    }
  }

  // Badges de liaison inter-plan sur les points liés (js/interPlanLinks.js, différé interne).
  if (window.InterPlanLinks && typeof window.InterPlanLinks.onPlanLoaded === "function") {
    try { window.InterPlanLinks.onPlanLoaded(); } catch(e) {
      console.warn("[Main] InterPlanLinks.onPlanLoaded échec :", e);
    }
  }

  // Itinéraire inter-plan : trace le tronçon en attente (portail traversé avec un itinéraire calculé).
  if (window.InterPlanRoute && typeof window.InterPlanRoute.onPlanLoaded === "function") {
    try { window.InterPlanRoute.onPlanLoaded(); } catch(e) {
      console.warn("[Main] InterPlanRoute.onPlanLoaded échec :", e);
    }
  }

  // Optimisations Perf ULTRA actives sur CE plan (hors mobileZoomLimit, sécurité par défaut) : toast au
  // chargement, pour qu'un affichage allégé ne passe jamais pour un bug. Mis en file si le splash est affiché.
  if (window.PerfUltra && Array.isArray(window.PerfUltra.TOGGLES)) {
    try {
      const _optimsActives = window.PerfUltra.TOGGLES.filter(function(k) {
        return k !== "mobileZoomLimit" && window.PerfUltra.get(k);
      });
      if (_optimsActives.length > 0 && window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(
          window.I18n.t("perf.toast.activeOnPlan", { n: _optimsActives.length }), "info", { groupe: "chargement" });   // 🔕 regroupé au chargement
      }
    } catch(e) { console.warn("[Main] toast PerfUltra échec :", e); }
  }

  // Documents livrés avec le plan copiés dans la base du Mode Histoire, seule source que le Carnet lit sans
  // charger de plan. Différé (n'a pas à retarder la carte), idempotent ; une copie supprimée revient à la
  // réouverture (décision produit).
  if (window.ModeHistoire && typeof window.ModeHistoire.syncDocsEmbarques === "function") {
    setTimeout(function() {
      try { window.ModeHistoire.syncDocsEmbarques(); } catch(e) {
        console.warn("[Main] synchro des documents du plan échouée :", e);
      }
    }, 1200);
  }

  // Stats COMPLÈTES du plan (session + data layers) persistées pour Profil > Mes plans. 🩸 800 ms : les data
  // layers se chargent par rAF (utils.js) et doivent avoir rempli leurs registres.
  if (typeof window._persisterStatsPlanCourant === "function") {
    setTimeout(function() {
      try { window._persisterStatsPlanCourant(); } catch(e) {
        console.warn("[Main] _persisterStatsPlanCourant échec :", e);
      }
    }, 800);
  }
  // 🔒 Plan en lecture seule (installation reliée, droit « lire ») : dit d'emblée, une fois par ouverture.
  if (typeof window.ktaAnnoncerLectureSeule === "function") {
    setTimeout(function() {
      try {
        if (typeof window.ktaMajOutilsLectureSeule === "function") window.ktaMajOutilsLectureSeule();
        window.ktaAnnoncerLectureSeule();
      } catch(e) { /* affichage seulement */ }
    }, 600);
  }
  } finally {
    _appEnCours = false;
    // Overlay de chargement (chargerZipFichier / chargerPlanServeur) fermé en succès comme en erreur.
    if (typeof window._fermerOverlayChargement === "function") {
      window._fermerOverlayChargement();
    }
  }
}

// ── Niveaux occupés et auto-extension de availableLevels (multi-niveau) ──────────────────────
// Niveaux qui portent réellement quelque chose (tracés, zones, structures, points, data layers, images de niveau) :
// liste triée sans doublon, peut être vide. Source unique du scan.
// 🩸 availableLevels vaut -2..+2 par défaut : le lire à la place créerait des équipes Secours sur des niveaux vides.
window.ktaNiveauxOccupes = function() {
  const levelsFound = [];
  // Niveaux desservis d'un passage (poiJonction.js : jes / jpe / jps, peo / eso) : comptés comme occupés, même
  // seul objet d'un niveau. Lus par le tag, pas par estJonction (qui exige le multi-niveau déjà actif).
  const PJ = window.KtaPoiJonction;
  const _pushNiveaux = function(tags, niveaux) {
    if (!PJ || !Array.isArray(niveaux) || !Array.isArray(tags) || !PJ.porteNiveaux(String(tags[0] || ""))) return;
    niveaux.forEach(function(n) { if (Number.isInteger(n)) levelsFound.push(n); });
  };
  try {
    const _push = function(arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(function(it) {
        if (it && typeof it === "object") {
          if (Number.isInteger(it.level))      levelsFound.push(it.level);
          if (Number.isInteger(it.fromLevel))  levelsFound.push(it.fromLevel);
          if (Number.isInteger(it.toLevel))    levelsFound.push(it.toLevel);
          _pushNiveaux(it.tags, it.niveaux);
        }
      });
    };
    if (typeof window.getRoads        === "function") _push(window.getRoads());
    if (typeof window.getZones        === "function") _push(window.getZones());
    if (typeof window.getStructures   === "function") _push(window.getStructures());
    if (typeof window.getEditorPoints === "function") _push(window.getEditorPoints());
    // ⚠️ Data layers : niveau en _ktaLevel sur les markers, en .level sur les entrées polylines/polygons
    // (utils.js > ajouterPointsDepuisJSON).
    if (Array.isArray(window._ktaDataMarkers)) {
      window._ktaDataMarkers.forEach(function(m) {
        if (m && Number.isInteger(m._ktaLevel)) levelsFound.push(m._ktaLevel);
        if (m) _pushNiveaux(m._ktaTags, m._ktaNiveauxSrc);
      });
    }
    if (Array.isArray(window._ktaDataPolylines)) {
      _push(window._ktaDataPolylines);   // jonction de calque : fromLevel / toLevel portés par l'entrée
    }
    if (Array.isArray(window._ktaDataPolygons)) {
      window._ktaDataPolygons.forEach(function(entry) {
        if (entry && Number.isInteger(entry.level)) levelsFound.push(entry.level);
      });
    }
    if (Array.isArray(window._ktaDataStructurePolygons)) {
      window._ktaDataStructurePolygons.forEach(function(entry) {
        if (entry && Number.isInteger(entry.level)) levelsFound.push(entry.level);
      });
    }
    // Image layers (PLAN_CONFIG.imageLayers[i].level).
    if (Array.isArray(window._ktaImageOverlays)) {
      window._ktaImageOverlays.forEach(function(entry) {
        if (entry && Number.isInteger(entry.level)) levelsFound.push(entry.level);
      });
    }
  } catch(e) {
    console.warn("[Main] ktaNiveauxOccupes echec :", e);
  }
  return levelsFound.filter(function(v, i, a) { return a.indexOf(v) === i; })
                    .sort(function(a, b) { return a - b; });
};

// Migration des photos, favoris et liaisons vers l'uid du point (docs/ETUDE_UID.md).
// Les calques arrivent un par un sans signal « tout est chargé » : on attend 2 s après le DERNIER appel.
// Règle « jamais deviné » : rattachement seulement si le nom n'est porté que par ce point (ou l'homonyme à la
// même position), jugé sur TOUS les points du plan. 🩸 Le plan peut avoir changé pendant l'attente : id vérifié.
let _ktaMigrPhotosTimer = null;
window._ktaPlanifierMigrationPhotos = function() {
  if (!window.MyKTAMapPhotos || typeof window.MyKTAMapPhotos.migrerPhotosPlan !== "function") return;
  const planId = window._currentLoadedPlanId || null;
  if (!planId) return;
  if (_ktaMigrPhotosTimer) clearTimeout(_ktaMigrPhotosTimer);
  _ktaMigrPhotosTimer = setTimeout(function() {
    _ktaMigrPhotosTimer = null;
    if ((window._currentLoadedPlanId || null) !== planId) return;
    const pts = [].concat(
      (window.getEditorPoints ? window.getEditorPoints() || [] : []).map(function(p) { return Object.assign({ layerId: "editor" }, p); }),
      (typeof window.getAllEmbeddedPoints === "function" ? window.getAllEmbeddedPoints() : [])
    ).filter(Boolean).map(function(p) { return { uid: p.uid, id: p.id, x: p.x, y: p.y, layerId: p.layerId }; });
    const _migr = window.MyKTAMapPhotos.migrerPhotosPlan(planId, pts);
    // Photos « sans point » : toast discret APRÈS la migration (une photo encore rangée sous un nom n'est pas
    // « sans point »). Une fois par ouverture.
    if (window.KtaPhotosGalerie && typeof window.KtaPhotosGalerie.apresOuverturePlan === "function") {
      Promise.resolve(_migr).then(function() { window.KtaPhotosGalerie.apresOuverturePlan(planId); });
    }
    try { if (window.Favoris && window.Favoris.migrerVersUid) window.Favoris.migrerVersUid(pts); } catch(e) { console.warn("[Main] migration favoris :", e); }
    try { if (window.InterPlanLinks && window.InterPlanLinks.migrerVersUid) window.InterPlanLinks.migrerVersUid(planId, pts); } catch(e) { console.warn("[Main] migration liaisons :", e); }
  }, 2000);
};

// Étend APP_CONFIG.availableLevels jusqu'au min/max des niveaux occupés. Idempotent. Appelé au lancement (session
// restaurée) puis après chaque data layer chargé (utils.js > ajouterPointsDepuisJSON).
window._etendreAvailableLevelsSiBesoin = function() {
  if (!window.APP_CONFIG || window.APP_CONFIG.multiLevel !== true) return false;
  try {
    const levelsFound = window.ktaNiveauxOccupes();
    if (levelsFound.length === 0) return false;

    let avail = Array.isArray(window.APP_CONFIG.availableLevels)
                && window.APP_CONFIG.availableLevels.length
      ? window.APP_CONFIG.availableLevels.slice()
      : [-2, -1, 0, 1, 2];
    const minF = Math.min.apply(null, levelsFound);
    const maxF = Math.max.apply(null, levelsFound);
    let extended = false;
    while (Math.min.apply(null, avail) > minF) {
      avail.unshift(Math.min.apply(null, avail) - 1);
      extended = true;
    }
    while (Math.max.apply(null, avail) < maxF) {
      avail.push(Math.max.apply(null, avail) + 1);
      extended = true;
    }
    if (extended) {
      window.APP_CONFIG.availableLevels = avail;
      console.log("[Main] availableLevels auto-etendu :",
                  "items min/max =", minF, "/", maxF,
                  "→ availableLevels =", avail);
      // 🩸 Les niveaux découverts ici (data layer lu APRÈS le calcul initial de visibleLevels) doivent devenir
      // visibles aussi, sinon « Afficher tous les niveaux » ne couvre que -2..+2.
      const _tousNiv = !(window.PerfUltra && window.PerfUltra.get("tousNiveaux") === false);
      if (_tousNiv) {
        window.APP_CONFIG.visibleLevels = avail.slice();
        if (typeof window.appliquerFiltreNiveau === "function") {
          try { window.appliquerFiltreNiveau(); } catch(e) {}
        }
      }
    }
    return extended;
  } catch(e) {
    console.warn("[Main] Auto-extension availableLevels echec :", e);
    return false;
  }
};

// ── Libération du plan précédent ──────────────────────
// Démontage unique du plan affiché : avant un rechargement (chargerPlanServeur, startImportedPlan) et au retour à
// l'accueil (afficherLoader). Sur iOS Safari chaque Mo retenu compte.
// vers : "plan" (défaut, un autre plan suit) | "accueil" (rien ne suit : chaîne multi-plans et pile de retour
// abandonnées, extension prévenue avec "accueil").
function _libererRessourcesPlanPrecedent(vers) {
  const versAccueil = vers === "accueil";
  // Vue laissée (centre, zoom, niveau) mémorisée pour la réouverture : AVANT l'arrêt du suivi et le démontage de la
  // carte (js/vuePlan.js).
  if (window.KtaVuePlan) {
    try { window.KtaVuePlan.liberer(); } catch(e) {}
  }
  // 🩸 FIGER LA PERSISTANCE EN PREMIER : save final (état intact) + arrêt du poll auto-save. Sinon un tick pendant
  // le chargement du nouveau plan sauve l'état mutilé (timeline tracker vidée plus bas, voire slot purgé) et le
  // tracker revient à la position initiale. Le poll ne redémarre qu'au onPlanLoaded du nouveau plan.
  if (window.SessionPersist && typeof window.SessionPersist.onPlanUnload === "function") {
    try { window.SessionPersist.onPlanUnload(); } catch(e) {}
  }

  // 🩸 Clôture de la sortie au carnet, même contrainte : avant resetTrackingTimeline(), sinon tracé et distance
  // perdus. Écriture IDB async, mais le record est figé de façon SYNCHRONE dans l'appel.
  if (window.Journal && typeof window.Journal.onPlanUnload === "function") {
    try { window.Journal.onPlanUnload(); } catch(e) {}
  }

  // Installation reliée : panneau d'extension fermé, présences / itinéraires de l'ancien plan effacés.
  if (window.KtaExtensions && typeof window.KtaExtensions.quitterPlan === "function") {
    try { window.KtaExtensions.quitterPlan(versAccueil ? "accueil" : "plan"); } catch(e) {}
  }

  // Flottants de navigation purgés, sinon la pastille de retour survit avec une pile périmée. Au changement de
  // plan, les hooks distinguent goTo (pendingTarget posé : rien côté liaison, chaîne gardée côté route).
  _quitterNavigationInterPlans(versAccueil ? "home" : "switch");

  // Header + status bar retirés avant le démontage, sinon vieilles valeurs pendant le splash du nouveau plan.
  if (typeof window._refonteInterfacePreUnload === "function") {
    try { window._refonteInterfacePreUnload(); } catch(e) {}
  }

  // Distance totale des tracés : panneau et surlignage purgés avant le démontage de la carte.
  if (typeof window._rdEffacerHighlight === "function") {
    try { window._rdEffacerHighlight(); } catch(e) {}
  }

  // « Je suis perdu » : modale fermée et layers purgés avant le démontage de la carte.
  if (window.LostMode && typeof window.LostMode._onPlanSwitch === "function") {
    try { window.LostMode._onPlanSwitch(); } catch(e) {}
  }

  // Mode Secours : modale, overlay et scénarios en mémoire purgés (ceux du localStorage restent, par plan).
  if (window.SecoursMode && typeof window.SecoursMode.reset === "function") {
    try { window.SecoursMode.reset(); } catch(e) {}
  }

  // 🩸 Undo/Redo par plan : une pile gardée restaurerait les données de l'ancien plan dans le nouveau.
  if (window.HistoryManager && typeof window.HistoryManager.reset === "function") {
    try { window.HistoryManager.reset(); } catch(e) {}
  }

  // Durée de session (Détails session) comptée depuis le chargement du plan.
  // Compromis voulu : comptée depuis le chargement, pas depuis le 1er ajout.
  window._sessionStartTs = null;

  // 🩸 Suivi coupé AVANT le démontage : un pas compté à l'accueil ferait avancer le tracker d'une carte détruite
  // (canvas de collision, marqueur) et écrirait dans la timeline vidée juste après.
  if (typeof window.stopTracking === "function") {
    try { window.stopTracking(); } catch(e) {}
  }

  // Timeline tracker remise à zéro (RAM) ; TrackerReplay fermé pour ne pas garder la carte détruite.
  if (window.MyKTAMapTrackerReplay && typeof window.MyKTAMapTrackerReplay.fermer === "function") {
    try { window.MyKTAMapTrackerReplay.fermer(); } catch(e) {}
  }
  if (typeof window.resetTrackingTimeline === "function") {
    try { window.resetTrackingTimeline(); } catch(e) {}
  }

  // Flash d'accrochage (magnétisme) : son circleMarker transitoire survivrait sur la carte détruite.
  if (typeof window.ktaPurgerFlashSnap === "function") {
    try { window.ktaPurgerFlashSnap(); } catch(e) {}
  }

  // Heatmap effacée AVANT la destruction de la carte (sinon référence morte vers l'ancien overlay).
  if (window.MyKTAMapHeatmap && typeof window.MyKTAMapHeatmap.effacer === "function") {
    try { window.MyKTAMapHeatmap.effacer(); } catch(e) {}
  }

  // 🩸 img.src vidé AVANT map.remove() : sinon WebKit garde la bitmap décodée en cache GPU (calques image
  // 4096² × 4-10 niveaux = 64-160 Mo retenus). map.remove() plus bas détache les layers.
  if (Array.isArray(window._ktaImageOverlays) && window.map) {
    window._ktaImageOverlays.forEach(function(entry) {
      try {
        if (entry && entry.overlay && entry.overlay._image) {
          entry.overlay._image.src = "";
        }
      } catch(e) {}
    });
  }

  // Tuiles : overlays libérés, blob URLs révoquées, img.src vidé (tiling.js > libererTuiles).
  if (window._baseTiles && window._baseTiles.length > 0) {
    libererTuiles(window._baseTiles, window.map);
    window._baseTiles = [];
  }

  // Tiling V2 : listener zoomend, overlays actifs et blob URLs lazy. ⚠️ Indépendant de _baseTiles, qui ne contient
  // en V2 que les overlays du niveau courant.
  if (typeof window._libererTuilesV2 === "function") {
    try { window._libererTuilesV2(); } catch(e) {}
  }

  // 🩸 map.remove() détache tous les listeners SAUF le 'scroll' posé par L.Map._initContainer. Comme
  // `<div id="map">` est permanent (index.html), sa closure épingle l'ancienne carte : +1 L.Map, ~+2,4 Mo de heap
  // par plan, sans plafond. On le retire à la main avant remove().
  if (window.map) {
    try {
      if (L && L.DomEvent && window.map._container && window.map._onScroll) {
        L.DomEvent.off(window.map._container, "scroll", window.map._onScroll, window.map);
      }
    } catch(e) {}
    // 🩸 Zoom animé en cours : sa minuterie de fin survit à remove() (cf map.js > cleanupExistingMap).
    try { window.map._animatingZoom = false; window.map.remove(); } catch(e) {}
    window.map = null;
  }

  // Canvas de collision (jusqu'à 64 Mo) : width/height à 0 libère les pixels tout de suite, sans attendre le GC.
  if (window.collisionCanvas) {
    try {
      window.collisionCanvas.width  = 0;
      window.collisionCanvas.height = 0;
    } catch(e) {}
    window.collisionCanvas = null;
    window.collisionCtx    = null;
  }

  // Blob URLs des fichiers du ZIP importé.
  resetRuntimeAssets();

  // 🩸 Token de chargement des data layers incrémenté AVANT de vider dataLayerGroups : un rAF en cours dans
  // ajouterPointsDepuisJSON sort à l'itération suivante, au lieu de poser des markers zombies dans l'ancien plan.
  window._ktaDataLayerLoadToken = (window._ktaDataLayerLoadToken || 0) + 1;

  // Registres data layer vidés (sinon fuite linéaire et getAllEmbedded* mélangent les plans). Les layers sont déjà
  // détachés par map.remove() : on vide seulement les tableaux.
  if (Array.isArray(window._ktaDataMarkers))            window._ktaDataMarkers.length            = 0;
  if (Array.isArray(window._ktaDataPolylines))          window._ktaDataPolylines.length          = 0;
  if (Array.isArray(window._ktaDataPolygons))           window._ktaDataPolygons.length           = 0;
  if (Array.isArray(window._ktaDataStructurePolygons))  window._ktaDataStructurePolygons.length  = 0;
  if (Array.isArray(window._kta_dataLayerNoteGhosts))   window._kta_dataLayerNoteGhosts.length   = 0;

  // Timers BatteryGuard.forceCheck en attente (sinon callbacks orphelins sur un DOM reconstruit).
  if (Array.isArray(window._ktaBatteryForceTimers)) {
    window._ktaBatteryForceTimers.forEach(function(id) { clearTimeout(id); });
    window._ktaBatteryForceTimers.length = 0;
  }

  // ObjectURL des photos affichées (sinon les Blob restent tant que l'onglet vit).
  if (typeof window._revokeAllPhotoObjectUrls === "function") {
    try { window._revokeAllPhotoObjectUrls(); } catch(e) {}
  }

  // Mode Histoire : modale fermée (la note libre est déjà en localStorage).
  if (window.ModeHistoire && typeof window.ModeHistoire._onPlanSwitch === "function") {
    try { window.ModeHistoire._onPlanSwitch(); } catch(e) {}
  }

  // Mode urgence XL désactivé : son _orientationListener sur window resterait attaché.
  if (window.EmergencyMode && typeof window.EmergencyMode.desactiver === "function") {
    try { window.EmergencyMode.desactiver(); } catch(e) {}
  }

  // Flags d'init : re-init au prochain lancerApplication (sinon les clics ne se ré-attachent pas à la carte).
  window.interfaceInitialized = false;
  window.roadInitialized      = false;
  window.zonesInitialized     = false;
  window.structuresInitialized = false;
}

// ── Chargement d'un plan serveur (depuis le registre) ──────────────────────
// presetChoisi (optionnel) : "off" | "auto" | "quality" | "balanced" | "performance" → APP_CONFIG.perfPreset,
// mémorisé dans le registre pour ce plan.
const _PERF_VALID_PRESETS = ["off", "auto", "quality", "balanced", "performance"];

async function chargerPlanServeur(planPath, registryEntry, presetChoisi) {
  _libererRessourcesPlanPrecedent();

  // Overlay plein écran dès le clic, avant le fetch du plan-config.
  if (typeof window._afficherOverlayChargement === "function") {
    window._afficherOverlayChargement(window.I18n.t("ui.loading.fetchingPlan"));
  }

  const ok = await loadAppConfig(planPath);
  if (!ok) {
    if (typeof window._fermerOverlayChargement === "function") window._fermerOverlayChargement();
    const err = new Error("Plan serveur introuvable : " + planPath);
    err.code = "PLAN_NOT_FOUND";
    throw err;
  }

  // Preset perf appliqué avant lancerApplication (donc avant le rendu de l'image).
  if (typeof presetChoisi === "string" && _PERF_VALID_PRESETS.indexOf(presetChoisi) >= 0) {
    APP_CONFIG.perfPreset = presetChoisi;
    DEFAULT_CONFIG.perfPreset = presetChoisi;
    window.APP_CONFIG = APP_CONFIG;
    console.log("[Loader] perfPreset (server) :", presetChoisi);
  }

  if (window.PlanRegistry && window.PLAN_CONFIG?.plan) {
    const id = registryEntry?.id || window.PlanRegistry.genServerId(planPath);
    window._currentLoadedPlanId = id;  // pour SessionPersist (restore après lancerApplication)
    const planEntry = {
      id: id,
      type: "server",
      path: planPath,
      name:    window.PLAN_CONFIG.plan.name    || (registryEntry && registryEntry.name) || planPath,
      version: window.PLAN_CONFIG.plan.version || (registryEntry && registryEntry.version) || null,
      // 🩸 Origine marquée : le plan-config fait autorité, la découverte index.json ne l'écrase plus au boot.
      versionSrc: window.PLAN_CONFIG.plan.version ? "plan" : undefined,
      author:  window.PLAN_CONFIG.plan.author  || (registryEntry && registryEntry.author)  || null,
      discovered: registryEntry?.discovered || false,
      perfPreset: APP_CONFIG.perfPreset
    };
    // Badges M-LVL / V2 : flags posés seulement s'ils sont vrais (ne pas écraser un multiLevel:false de l'user).
    if (window.PLAN_CONFIG.plan.multiLevel === true) planEntry.multiLevel = true;
    if (window.PLAN_CONFIG.plan.tiledV2    === true) planEntry.tiledV2    = true;
    _enregistrerPlanCharge(planEntry);

    _propagerGeorefVersKmzExport(id);
  }

  _appEnCours    = false;
  _importDemande = false;
  await lancerApplication();
}

// Même calage (mêmes points) des deux côtés, modèles différents : le modèle "local" gagne, dans les deux sens.
// 🩸 Sans ça, un plan régénéré au modèle local garde l'ancien calage du localStorage (qui a la priorité), et un
// plan recalé dans les Réglages repasse au modèle historique pour la Vue OSM et le Secours, qui lisent
// PLAN_CONFIG.plan.georef en premier. PLAN_CONFIG est corrigé en MÉMOIRE seulement (le ZIP n'est pas réécrit).
function _accorderModeleCalage(planId, dejaLa, georef) {
  const KE = window.KmzExport;
  if (!KE || typeof KE.memesPoints !== "function" || !KE.memesPoints(dejaLa, georef)) return;
  const LOCAL = KE.MODELE_LOCAL;
  if (dejaLa.modele === LOCAL && georef.modele !== LOCAL) {
    georef.modele = LOCAL;
  } else if (georef.modele === LOCAL && dejaLa.modele !== LOCAL) {
    KE.setCalibration(planId, Object.assign({}, dejaLa, { modele: LOCAL }));
  }
}

// Calibrage GPS embarqué (plan-config.json > plan.georef) → KmzExport.setCalibration : pré-remplit Export
// externe et Réglages > Géoréférencement. Idempotent ; un calibrage local saisi par l'user a la priorité.
function _propagerGeorefVersKmzExport(planId) {
  try {
    const georef = window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.georef;
    if (!georef || !georef.pointA || !georef.pointB) return;
    if (!window.KmzExport || typeof window.KmzExport.setCalibration !== "function") return;
    // Calibrage local existant : respecté, 🩸 SAUF s'il est périmé. Le planId est déterministe (nom+version) :
    // un plan régénéré à d'autres dimensions hérite d'un calibrage dont les x/y désignent un canvas disparu →
    // échelle déduite fausse et fausse alerte « incohérence d'échelle ». Points hors du plan = donnée morte,
    // remplacée ; un calibrage manuel valide a forcément ses points dans le plan.
    const dejaLa = window.KmzExport.getCalibration && window.KmzExport.getCalibration(planId);
    if (dejaLa) {
      const W = window.PLAN_CONFIG.plan.imageWidth;
      const H = window.PLAN_CONFIG.plan.imageHeight;
      const dansLePlan = function (pt) {
        return pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)
            && pt.x >= -1 && pt.x <= W + 1 && pt.y >= -1 && pt.y <= H + 1;
      };
      // Dimensions inconnues : on ne peut rien juger, on respecte l'existant.
      if (!Number.isFinite(W) || !Number.isFinite(H) || (dansLePlan(dejaLa.pointA) && dansLePlan(dejaLa.pointB))) {
        _accorderModeleCalage(planId, dejaLa, georef);
        return;
      }
      console.warn("[Main] 🌐 Calibrage périmé pour planId=" + planId +
                   " (points hors du plan " + W + "×" + H + ") → remplacé par plan.georef.");
    }
    window.KmzExport.setCalibration(planId, georef);
    console.log("[Main] 🌐 Géoréférencement plan.georef propagé vers KmzExport (planId=" + planId + ")");

    // 🩸 Aussi dans le REGISTRE : le HOME ne lit pas PLAN_CONFIG (aucun plan chargé), et sans ça son widget OSM
    // ignore les plans géoréférencés par construction (import SIG). C'est la donnée du plan, pas une préférence :
    // le localStorage reste la voix de l'utilisateur et garde la priorité.
    if (window.PlanRegistry && typeof window.PlanRegistry.addOrUpdate === "function") {
      window.PlanRegistry.addOrUpdate({ id: planId, georef: georef });
    }
  } catch(e) {
    console.warn("[Main] _propagerGeorefVersKmzExport :", e);
  }
}

// ── Chargement depuis un import navigateur ──────────────────────
// presetChoisi : "off" | "auto" | "quality" | "balanced" | "performance" (string)
// meta = { zipFile?, planId?, storeBlob?, fromStoredBlob?, typeRegistre?, zipEtag?, zipLastModified? } (optionnels)
async function startImportedPlan(planConfigFile, assetFiles, presetChoisi, meta) {
  if (!planConfigFile) throw new Error("Aucun fichier plan-config.json fourni");

  meta = meta || {};

  _importDemande = true;
  _appEnCours    = false;

  _libererRessourcesPlanPrecedent();

  // 🩸 _lazyZipRef posé APRÈS la libération : resetRuntimeAssets le remet à null. Absent (pas de tuiles V2
  // paresseuses) → reste null.
  if (assetFiles && assetFiles._lazyZip) {
    window._lazyZipRef = assetFiles._lazyZip;
    console.log("[LazyTiles v1.34.12] window._lazyZipRef restauré post-cleanup");
  }

  const planText  = await planConfigFile.text();
  const rawConfig = JSON.parse(planText);

  const validation = validateImportedPlan(rawConfig);
  if (!validation.ok) throw new Error(validation.errors.join(" | "));


  const files = Array.from(assetFiles || []);
  const allLogicalPaths = [];
  if (rawConfig.plan?.baseImage)      allLogicalPaths.push(rawConfig.plan.baseImage);
  if (rawConfig.plan?.collisionImage) allLogicalPaths.push(rawConfig.plan.collisionImage);
  // PDF embarqué du Mode Histoire.
  if (rawConfig.plan?.histoirePdf)    allLogicalPaths.push(rawConfig.plan.histoirePdf);
  (rawConfig.imageLayers || []).forEach(function(l) { if (l.file) allLogicalPaths.push(l.file); });
  (rawConfig.dataLayers  || []).forEach(function(l) { if (l.file) allLogicalPaths.push(l.file); });

  const uniquePaths = [...new Set(allLogicalPaths.map(normalizePath))];

  await Promise.all(uniquePaths.map(async function(logicalPath) {
    const matched = findMatchingFile(logicalPath, files);
    if (!matched) { console.warn("[Loader] Fichier non trouvé :", logicalPath); return; }
    await registerAsset(logicalPath, matched);
  }));

  // Icônes personnalisées du plan (`icons`, chemins `icon/…` du ZIP) : enregistrées comme les autres fichiers,
  // sinon le plan les cherche à la racine du site (404) et chaque marqueur retombe sur l'icône de l'app.
  // 🩸 Une icône de l'app (pas dans le ZIP) n'est pas un fichier manquant : aucun avertissement.
  const iconesPlan = (rawConfig.icons && typeof rawConfig.icons === "object") ? rawConfig.icons : {};
  await Promise.all([...new Set(Object.values(iconesPlan).filter(function(v) {
    return typeof v === "string" && v && !/^(data:|blob:|https?:)/.test(v);
  }).map(normalizePath))].map(async function(chemin) {
    const f = findMatchingFile(chemin, files);
    if (f && !window.RUNTIME_ASSETS[chemin]) await registerAsset(chemin, f);
  }));

  // Tiling V2 : tuiles `data/tiles/z<N>/*` (.jpg, .webp ou .png : le format vit dans `tiling.format`).
  // Enregistrement LAZY (1000+ tuiles possibles) : blob URL créée au rendu (tiling.js > _chargerImageTuileV2).
  if (rawConfig.plan?.tiledV2 === true || rawConfig.tiling) {
    const totalTuiles = files.filter(function(f) {
      const fp = f._fullPath || f.name;
      return typeof fp === "string" && /^data\/tiles\/z-?\d+\//.test(fp);
    }).length;
    if (typeof window._majOverlayChargement === "function") {
      window._majOverlayChargement(window.I18n.t("main.loading.tilesIndex", { n: totalTuiles }));
    }
    let nbTuiles = 0;
    for (const f of files) {
      const fullPath = f._fullPath || f.name;
      if (typeof fullPath === "string" && /^data\/tiles\/z-?\d+\//.test(fullPath)) {
        await registerAsset(fullPath, f, { lazy: true });
        nbTuiles++;
        if (nbTuiles % 50 === 0 && typeof window._majOverlayChargement === "function") {
          window._majOverlayChargement(window.I18n.t("main.loading.tilesProgress", { done: nbTuiles, total: totalTuiles }));
        }
      }
    }
    console.log("[Loader] Tiling V2 — " + nbTuiles + " tuiles enregistrées (lazy)");
    if (typeof window._majOverlayChargement === "function") {
      window._majOverlayChargement(window.I18n.t("main.loading.tilesReady"));
    }
  }

  window.PLAN_CONFIG = cloneAndResolvePlanConfig(rawConfig);

  const cfg = buildAppConfigFromPlan(rawConfig);

  // ⚠️ DEFAULT_CONFIG muté EN PLACE : resetConfig() doit retomber sur les valeurs du plan importé.
  Object.assign(DEFAULT_CONFIG, cfg);
  window.DEFAULT_CONFIG = DEFAULT_CONFIG;

  APP_CONFIG = { ...cfg };
  window.APP_CONFIG = APP_CONFIG;

  // Preset perf du loader appliqué AVANT lancerApplication : l'image est tuilée selon lui dès le 1er rendu.
  if (typeof presetChoisi === "string" && _PERF_VALID_PRESETS.indexOf(presetChoisi) >= 0) {
    APP_CONFIG.perfPreset = presetChoisi;
    DEFAULT_CONFIG.perfPreset = presetChoisi;
    window.APP_CONFIG = APP_CONFIG;
    console.log("[Loader] perfPreset imposé :", presetChoisi);
  }

  console.log("[Loader] APP_CONFIG.perfPreset au lancement :", APP_CONFIG.perfPreset);

  if (window.PlanRegistry && rawConfig.plan) {
    const planName = rawConfig.plan.name || "Plan importé";
    const planVer  = rawConfig.plan.version || "";
    const id = meta.planId || window.PlanRegistry.genLocalId(planName, planVer);
    window._currentLoadedPlanId = id;  // pour SessionPersist (restore après lancerApplication)

    // 🩸 Plan d'extension : nom et version sont ceux de l'installation, jamais ceux inscrits dans le ZIP (sinon
    // un renommage côté installation est annulé à chaque ouverture).
    const _estExt = meta.typeRegistre === "ext";
    // Plan déclaré par son archive dans index.json : reste « server » (l'index le gère) ; nom de l'index, version
    // du plan-config (le fichier DANS le plan fait autorité).
    const _estZipSrv = meta.typeRegistre === "server-zip";
    const _existant = (_estExt || _estZipSrv) && typeof window.PlanRegistry.findById === "function"
      ? window.PlanRegistry.findById(id) : null;
    const entry = {
      id: id,
      // Un plan d'extension garde le type « ext », sinon l'effacement à la déconnexion ne le retrouve plus.
      type: _estExt ? "ext" : (_estZipSrv ? "server" : "local"),
      name: (_existant && _existant.name) ? _existant.name : planName,
      version: (_estExt && _existant && _existant.version) ? _existant.version
        : (planVer || (_existant && _existant.version) || null),
      author: rawConfig.plan.author || null,
      originalFilename: meta.zipFile?.name || null,
      fileSize: meta.zipFile?.size || null,
      perfPreset: APP_CONFIG.perfPreset
    };
    // Badges M-LVL / V2 : seulement si vrais (ne pas écraser un setMultiLevel(id, false) de l'user).
    if (rawConfig.plan.multiLevel === true) entry.multiLevel = true;
    if (rawConfig.plan.tiledV2    === true) entry.tiledV2    = true;
    if (_estZipSrv && planVer) entry.versionSrc = "plan";

    // La copie du ZIP en IDB est le seul mécanisme de mémorisation ; on ne crée plus de `fsHandleId` (les
    // entrées existantes restent lues par homeLoader).
    if (meta.storeBlob && meta.zipFile) {
      try {
        // Stockage persistant : évite la purge automatique iOS/Chrome.
        if (window.PlanRegistry.requestPersistentStorage) {
          await window.PlanRegistry.requestPersistentStorage();
        }
        // 🩸 Plan d'extension déjà gardé (même taille) : pas de réécriture sur lui-même. Sous iOS, réécrire efface
        // les données du fichier encore en lecture (« object can not be found »). L'extension tient sa copie à jour.
        let _dejaGarde = false;
        if (meta.typeRegistre === "ext" && typeof window.PlanRegistry.getBlob === "function") {
          const g = await window.PlanRegistry.getBlob(id).catch(function() { return null; });
          _dejaGarde = !!g && g.size === meta.zipFile.size;
        }
        const result = _dejaGarde ? { ok: true } : await window.PlanRegistry.saveBlob(id, meta.zipFile);
        if (result.ok) {
          entry.storedBlob = true;
          // Plan ZIP de l'index : validateurs HTTP pour la requête conditionnelle suivante (304 = copie à jour).
          if (_estZipSrv) { entry.zipEtag = meta.zipEtag || null; entry.zipLastModified = meta.zipLastModified || null; }
          console.log("[Loader] ZIP mémorisé dans IndexedDB :", id);
        } else {
          console.error("[Loader] Mémorisation ZIP échouée :", result.error);
          if (typeof window !== "undefined") {
            const status = document.getElementById("loaderStatus");
            if (status) {
              status.textContent = window.I18n.t("main.rememberFailed", { msg: result.error });
              status.style.color = "#ffb380";
            }
          }
        }
      } catch(e) {
        console.error("[Loader] Erreur saveBlob :", e);
      }
    } else if (meta.fromStoredBlob) {
      entry.storedBlob = true;
    }

    _enregistrerPlanCharge(entry);

    // Tags proposés par le ZIP (`plan.tags`, origine "config"). 🩸 Le fichier propose, l'utilisateur dispose :
    // tags posés à la main ("user") jamais touchés ; l'index du déployeur ("index") passe avant ; un ZIP réimporté
    // sans tags retire seulement ceux d'origine "config".
    // 🏷️ ancre:debut-tags-config
    try {
      const _cfgTags = rawConfig.plan.tags;
      const _reg = window.PlanRegistry.findById(id);
      const _proposes = Array.isArray(_cfgTags) && _cfgTags.length > 0;
      const _protege = !!(_reg && (_reg.tagsSrc === "user" || _reg.tagsSrc === "index"));
      if (_proposes && !_protege) {
        window.PlanRegistry.setTags(id, _cfgTags, "config");
      } else if (!_proposes && _reg && _reg.tagsSrc === "config" && _reg.tags) {
        window.PlanRegistry.setTags(id, [], "config");
      }
    } catch (eTags) { console.warn("[Loader] tags du plan-config ignorés :", eTags); }
    // 🏷️ ancre:fin-tags-config

    _propagerGeorefVersKmzExport(id);
  }

  // Photos embarquées dans le ZIP (createConf.js > _genererZip, « Inclure les photos ») :
  //   data/photos/_index.json      ← photoId → {pointId, mime, size, file, createdAt?, priseLe?}
  //   data/photos/<photoId>.<ext>  ← blob de chaque photo
  // Sans _index.json, section sautée.
  try {
    const indexFile = findMatchingFile("data/photos/_index.json", files);
    if (indexFile && window.MyKTAMapPhotos && window._currentLoadedPlanId) {
      const planId = window._currentLoadedPlanId;
      const idxText = await indexFile.text();
      let idxObj;
      try { idxObj = JSON.parse(idxText); }
      catch(e) {
        console.warn("[Loader] data/photos/_index.json corrompu :", e);
        idxObj = null;
      }
      if (idxObj && idxObj.photos) {
        const photoIds = Object.keys(idxObj.photos);
        if (photoIds.length > 0) {
          if (typeof window._majOverlayChargement === "function") {
            window._majOverlayChargement(window.I18n.t("main.loading.photosRestore", { n: photoIds.length }));
          }
          // 🩸 Jamais d'effacement global (deletePhotosForPlan) : il emporterait les photos de l'utilisateur et
          // leurs rattachements. Règle : photo du ZIP déjà présente → gardée telle quelle ; absente → restaurée,
          // marquée origine « plan » ; seules les « plan » disparues du ZIP sont retirées ; une photo sans
          // marque (prise par l'user, ou restaurée anciennement) n'est jamais touchée — au pire périmée, jamais perdue.
          const _dansIndex = new Set(photoIds.map(String));
          try {
            const _existantes = await window.MyKTAMapPhotos.getAllPhotosForPlan(planId);
            for (const rec of _existantes) {
              if (rec && rec.meta && rec.meta.origine === "plan" && !_dansIndex.has(String(rec.id))) {
                await window.MyKTAMapPhotos.deletePhoto(rec.id);
              }
            }
          } catch(e) { console.warn("[Loader] tri des photos du plan :", e); }

          let restoredCount = 0;
          for (const pid of photoIds) {
            const info = idxObj.photos[pid] || {};
            try {
              if (await window.MyKTAMapPhotos.getPhoto(pid)) continue;   // déjà là : on n'écrase rien
            } catch(e) { /* lecture impossible : on restaure */ }
            const filename = "data/photos/" + (info.file || (pid + ".jpg"));
            const blobFile = findMatchingFile(filename, files);
            if (!blobFile) {
              console.warn("[Loader] Photo manquante dans le ZIP :", filename);
              continue;
            }
            try {
              const blob = await blobFile.arrayBuffer().then(function(buf) {
                return new Blob([buf], { type: info.mime || "image/jpeg" });
              });
              await window.MyKTAMapPhotos.restorePhoto({
                id:      pid,
                planId:  planId,
                pointId: String(info.pointId || ""),
                blob:    blob,
                mime:    info.mime || "image/jpeg",
                size:    info.size || blob.size,
                createdAt: info.createdAt,   // dates facultatives, validées par restorePhoto
                priseLe: info.priseLe,
                meta:    { origine: "plan" }   // seules celles-ci peuvent être retirées
              }, { source: "import" });   // restauration de l'app (≠ dépôt d'une extension)
              restoredCount++;
            } catch(e) {
              console.warn("[Loader] restorePhoto échoué pour", pid, ":", e);
            }
          }
          console.log("[Loader] " + restoredCount + " / " + photoIds.length + " photo(s) restaurée(s) en IDB");

          // Toast discret (mis en file jusqu'à la fin du splash).
          if (restoredCount > 0 && window.OOMGuard
              && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(
              window.I18n.t(restoredCount > 1 ? "main.toast.photosRestored.many" : "main.toast.photosRestored.one",
                            { n: restoredCount }),
              "info", { groupe: "chargement" }   // regroupé avec les autres restaurations
            );
          }
        }
      }
    }
  } catch(e) {
    console.warn("[Loader] Restore photos depuis ZIP plan :", e);
    // Non bloquant : le plan se charge sans les photos.
  }

  _appEnCours    = false;
  _importDemande = false;

  await lancerApplication();
}

// Pile de retour et chaîne multi-plans : "home" les abandonne, "switch" les laisse à goTo.
function _quitterNavigationInterPlans(contexte) {
  if (window.InterPlanLinks && typeof window.InterPlanLinks.onPlanExit === "function") {
    try { window.InterPlanLinks.onPlanExit(contexte); } catch(e) {}
  }
  if (window.InterPlanRoute && typeof window.InterPlanRoute.onPlanExit === "function") {
    try { window.InterPlanRoute.onPlanExit(contexte); } catch(e) {}
  }
}

// ── Retour à l'accueil (loader) ──────────────────────
// ⚠️ Fermer un plan = le vider (décision produit) : tout retour à l'accueil passe ici et, si une carte existe, la
// démonte comme un changement de plan (session enregistrée d'abord, puis tuiles, calques, canvas de collision,
// carte). « Reprendre » recharge le plan et restaure sa session (PlanRegistry). Après ce retour : window.map = null,
// PLAN_CONFIG = null, _currentLoadedPlanId = null ; le plan quitté reste dans window._ktaDernierPlanId (carte OSM
// de l'accueil). 🩸 Un id gardé à l'accueil faisait croire le plan ouvert : stats et photos du plan quitté
// proposées, côté installation reliée présence et itinéraire du plan quitté.
// 🩸 La carte peut exister sans être affichée (ouverture ratée sous l'accueil) : le test porte sur L.Map, pas sur
// ktaPlanAffiche().
function afficherLoader() {
  // Mode « cliquer sur la carte » encore actif (floater, modale config masquée, handler) annulé.
  if (typeof window._ktaAnnulerModesClicCarte === "function") {
    try { window._ktaAnnulerModesClicCarte(); } catch(e) {}
  }
  // 🩸 Flottants purgés, sinon ils restent par-dessus le HOME : boussole, modale itinéraire cachée dans le DOM
  // (pastille de retour et invite « Portail suivant » : _quitterNavigationInterPlans).
  if (window.CompassWidget && typeof window.CompassWidget.hide === "function") {
    try { window.CompassWidget.hide(); } catch(e) {}
  }
  const itiFantome = document.getElementById("kta-itinerary-modal");
  if (itiFantome) { try { itiFantome.remove(); } catch(e) {} }
  // ⚠️ `window.map` vaut le <div id="map"> (accès nommé) tant qu'aucune carte n'a été créée : tester L.Map.
  if (window.L && window.map instanceof window.L.Map) {
    _libererRessourcesPlanPrecedent("accueil");
  } else {
    _quitterNavigationInterPlans("home");
    if (window.KtaExtensions && typeof window.KtaExtensions.quitterPlan === "function") {
      try { window.KtaExtensions.quitterPlan("accueil"); } catch(e) {}
    }
  }
  // Après le démontage, qui lit encore l'id (session, carnet, extension) : plus aucun plan n'est ouvert.
  if (window._currentLoadedPlanId) {
    window._ktaDernierPlanId = window._currentLoadedPlanId;
    window._currentLoadedPlanId = null;
  }
  const overlay = document.getElementById("planLoaderOverlay");
  if (overlay) {
    overlay.style.display = "flex";
    // Retour en haut à chaque ouverture. ⚠️ Le conteneur qui défile est #planLoaderOverlay (overflow-y), pas body.
    overlay.scrollTop = 0;
    const btn = document.getElementById("loadPlanBtn");
    if (btn) btn.disabled = false;
    const status = document.getElementById("loaderStatus");
    if (status) status.textContent = "";
  }
  const mapEl = document.getElementById("map");
  if (mapEl) mapEl.style.display = "none";

  // 🩸 Le fond du loader est semi-opaque (8 %) : le header refonte transparaît, différemment selon le chemin
  // d'arrivée (compositing iOS). Cette classe masque header et statusbar tant que le loader est visible.
  document.body.classList.add("kta-loader-active");

  if (typeof window.refreshPlansList === "function") {
    window.refreshPlansList();
  }

  // 🩸 Widget OSM de l'accueil re-monté : il calcule sa liste de plans géoréférencés au mount(), sinon un plan
  // chargé entre-temps n'y apparaît qu'au redémarrage. Il s'ouvre sur le plan qu'on vient de quitter
  // (_ktaDernierPlanId) ; non géoréférencé → sélection précédente.
  if (window.OsmHomePreview && typeof window.OsmHomePreview.refresh === "function") {
    try { window.OsmHomePreview.refresh(window._ktaDernierPlanId || null); } catch (e) {
      console.warn("[Main] OsmHomePreview.refresh au retour home :", e);
    }
  }
}

// ── Fermer le plan pour libérer la mémoire (avant un travail lourd) ──────────────────────
// Le tuilage V2 d'une grande image (createConf.js > _genererZip) a besoin de la place d'un plan ouvert : sous
// pression mémoire, le navigateur rejette l'image source décodée et la redécode à chaque tuile. C'est le retour à
// l'accueil (afficherLoader démonte la carte) ; le plan reste en tête de « Reprendre ».
// → { ferme, planId } ; ferme: false = aucune carte de plan en mémoire, rien n'est touché.
function ktaFermerPlanPourMemoire() {
  // Lu AVANT afficherLoader, qui le remet à null.
  const planId = window._currentLoadedPlanId || null;
  if (!(window.L && window.map instanceof window.L.Map)) return { ferme: false, planId: planId };
  afficherLoader();
  console.log("[Main] Plan fermé pour libérer la mémoire :", planId);
  return { ferme: true, planId: planId };
}

// ── Splash de démarrage ──────────────────────
// Animation, versions, passage au clic et plafond : js/ktaSplash.js. Ici, le boot dit QUAND l'écran suivant est prêt.
// ⚠️ Avant une gate : _splashAvantGate() attend seulement la fin de l'animation ; le splash reste DESSOUS (toutes
// les gates sont au-dessus de 9999) et couvre le temps mort jusqu'à l'accueil. 🩸 Le fermer avant une gate qui ne
// dessine rien (session déjà ouverte, licence qui contourne la gate) laissait un écran vide jusqu'à l'accueil.
// _splashEnd(pret) ferme une fois l'animation finie ET `pret` résolu (puis deux images : l'écran est peint).

function _splashStart() {
  // Version lue sur window.__MKM__.build (js/copyright.js) : jamais en dur.
  const ver = document.getElementById("splashVersion");
  if (ver) {
    const b = (window.__MKM__ && window.__MKM__.build) ? String(window.__MKM__.build) : "";
    ver.textContent = b ? (b.charAt(0) === "v" ? b : "v" + b) : "";
  }
  if (window.KtaSplash) window.KtaSplash.surFermeture(_apresSplash);
}

// Splash retiré du DOM (fermeture normale ou plafond de sécurité).
function _apresSplash() {
  // Toasts en attente et modale de mise à jour détectée pendant le splash.
  if (window.OOMGuard) window.OOMGuard.flushPendingToasts();
  if (window.UpdateChecker && typeof window.UpdateChecker.notifySplashEnded === "function") {
    window.UpdateChecker.notifySplashEnded();
  }
  // ⚠️ Séquenceur de premier lancement (js/firstRunFlow.js) : une étape à la fois — alerte critique →
  // conditions d'utilisation → visite guidée — pour qu'elles ne se superposent pas. Il appelle
  // lui-même AlertChecker.notifySplashEnded. Rejoué à chaque boot, les étapes faites se sautent.
  if (window.FirstRunFlow && typeof window.FirstRunFlow.run === "function") {
    window.FirstRunFlow.run();
  } else if (window.AlertChecker && typeof window.AlertChecker.notifySplashEnded === "function") {
    // Module absent : au moins les alertes.
    window.AlertChecker.notifySplashEnded();
  }
}

async function _splashAvantGate() {
  if (window.KtaSplash) await window.KtaSplash.finAnimation();
  _rideauSiSplashParti();
}

// 🩸 Le plafond du splash (12 s) le retire pendant une gate longue (conditions lues) : à la fermeture de cette
// gate, l'app restait nue (~2 s : config d'instance, licence, chargement de l'écran suivant). Le rideau prend le
// relais du splash, même rang (sous toutes les gates), jusqu'à _splashEnd.
function _rideauSiSplashParti() {
  if (document.getElementById("splashOverlay") || document.getElementById("kta-rideau-boot")) return;
  const r = document.createElement("div");
  r.id = "kta-rideau-boot";
  r.setAttribute("aria-hidden", "true");
  document.body.appendChild(r);
}

async function _splashEnd(pret) {
  try { await _fermerSplash(pret); }
  finally {
    const r = document.getElementById("kta-rideau-boot");
    if (r) r.remove();
  }
}

async function _fermerSplash(pret) {
  if (window.KtaSplash) { await window.KtaSplash.fermer(pret); return; }
  // js/ktaSplash.js absent (cache incomplet) : retrait direct, l'app ne reste jamais derrière le splash.
  const splash = document.getElementById("splashOverlay");
  if (!splash) return;
  splash.parentNode.removeChild(splash);
  _apresSplash();
}

// ── i18n du DOM (HOME statique) ──────────────────────
// ⚠️ Attributs : data-i18n → textContent · data-i18n-html → innerHTML · data-i18n-title → title + aria-label ·
// data-i18n-placeholder → placeholder · data-i18n-aria-label → aria-label seul.
// Le FR du HTML n'est qu'un repli ; la source est lang/<code>.json. Idempotent, rejoué à chaque changement de langue.
// Générique : poser l'attribut data-i18n* suffit, rien à coder ici pour une nouvelle zone ou langue.
function _applyI18nDom(root) {
  if (!window.I18n || typeof window.I18n.t !== "function") return;
  root = root || document;
  root.querySelectorAll("[data-i18n]").forEach(function(el) {
    el.textContent = window.I18n.t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-html]").forEach(function(el) {
    el.innerHTML = window.I18n.t(el.getAttribute("data-i18n-html"));
  });
  root.querySelectorAll("[data-i18n-title]").forEach(function(el) {
    const v = window.I18n.t(el.getAttribute("data-i18n-title"));
    el.setAttribute("title", v);
    el.setAttribute("aria-label", v);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(function(el) {
    el.setAttribute("placeholder", window.I18n.t(el.getAttribute("data-i18n-placeholder")));
  });
  // Nom accessible d'un champ sans libellé visible (recherche, fichier) : aria-label seul, sans l'infobulle
  // que poserait data-i18n-title. Le HTML garde un aria-label FR de repli (lu aussi par Sonar).
  root.querySelectorAll("[data-i18n-aria-label]").forEach(function(el) {
    el.setAttribute("aria-label", window.I18n.t(el.getAttribute("data-i18n-aria-label")));
  });
}

// Re-traduit le HOME EN PLACE (data-i18n + description du preset perf rendue en JS). Rejoué à la bascule de
// langue et au swap SW passif. Idempotent.
function _retraduireI18nDomEnPlace() {
  _applyI18nDom(document);
  // #loaderPerfDesc n'est pas un data-i18n (rempli en JS) : on rejoue le preset.
  try {
    if (typeof window.setLoaderPerfPreset === "function" &&
        typeof window.getLoaderPerfPreset === "function") {
      window.setLoaderPerfPreset(window.getLoaderPerfPreset());
    }
  } catch (e) { /* no-op : home non encore monté */ }
}

// 🩸 Swap SW passif (nouveau SW sans reload) : le 1er boot a pu charger un dico périmé (clés brutes affichées).
// On recharge les dicos (I18n.reload) et on re-traduit en place, une fois par page. La mise à jour manuelle
// recharge déjà la page.
(function _initI18nSwSwapRefresh() {
  if (!("serviceWorker" in navigator)) return;
  var _done = false;
  navigator.serviceWorker.addEventListener("controllerchange", function() {
    if (_done) return;
    _done = true;
    var _retrad = function() { try { _retraduireI18nDomEnPlace(); } catch (e) {} };
    if (window.I18n && typeof window.I18n.reload === "function") {
      window.I18n.reload().then(_retrad).catch(_retrad);
    } else {
      _retrad();
    }
  });
})();

// Sélecteur de langue du HOME, peuplé depuis I18n.available() (aucun code de langue figé). Bascule = I18n puis
// re-traduction EN PLACE, sans reload (en incognito, un reload perdrait le choix tenu en mémoire). Idempotent.
function _initHomeLangSelect() {
  const sel = document.getElementById("loaderAppLang");
  if (!sel || !window.I18n || typeof window.I18n.available !== "function") return;
  const langs = window.I18n.available() || [];
  const cur = window.I18n.getLang();
  // Drapeau + libellé complet (sous Windows, le drapeau s'affiche en 2 lettres).
  sel.innerHTML = langs.map(function(l) {
    return '<option value="' + l.code + '"' + (l.code === cur ? ' selected' : '') +
           ' title="' + l.label + '">' + (l.flag ? l.flag + " " : "") + l.label + '</option>';
  }).join("");
  if (sel._i18nBound) return;
  sel._i18nBound = true;
  sel.addEventListener("change", function() {
    const code = sel.value;
    const done = (typeof window.I18n.setLang === "function") ? window.I18n.setLang(code) : Promise.resolve();
    Promise.resolve(done).then(function() {
      _retraduireI18nDomEnPlace();
      if (typeof window.proposerRedemarrageLangue === "function") window.proposerRedemarrageLangue();
    });
  });
}

// Popup « redémarrer pour appliquer la langue » : certains contenus (doc, onboarding, modules non abonnés à
// I18n.onChange) ne se re-traduisent qu'au reload. Recommandé, jamais imposé. Appelé par les 2 sélecteurs, après
// setLang() (texte dans la NOUVELLE langue). Pas en incognito : un reload y perdrait la session en mémoire.
window.proposerRedemarrageLangue = function() {
  if (window.IncognitoMode && window.IncognitoMode.active) return;
  var existing = document.getElementById("kta-lang-restart-modal");
  if (existing) existing.remove();
  var _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){ return k; };
  var overlay = document.createElement("div");
  overlay.id = "kta-lang-restart-modal";
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-modal">' +
      '<div class="kta-modal-icon">🌍</div>' +
      '<div class="kta-modal-titre">' + _t("lang.restart.title") + '</div>' +
      '<div class="kta-modal-texte">' + _t("lang.restart.body") + '</div>' +
      '<div class="kta-modal-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="ktaLangRestartLater" type="button">' + _t("lang.restart.continue") + '</button>' +
        '<button class="kta-btn kta-btn-primary" id="ktaLangRestartNow"   type="button">' + _t("lang.restart.restart") + '</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);
  document.getElementById("ktaLangRestartLater").addEventListener("click", function() { overlay.remove(); });
  document.getElementById("ktaLangRestartNow").addEventListener("click", function() {
    overlay.remove();
    try { location.reload(); } catch (e) {}
  });
};

// ── Point d'entrée ──────────────────────
// ⚠️ Ordre du boot (contrat, vérifié EN PARTIE par check-gate-instance.js et check-extensions.js) : i18n →
// sessions → HOME traduit → splash → conditions d'utilisation → config d'instance → revalidation du mot de
// passe → licence (si « on ») → verrou licence → modules et gate déléguée → UnlockGate → PIN → FirstRunFlow →
// découverte des plans.
(async function initApp() {
  console.log("[Main] Démarrage…");

  // Dicos (fr = repli obligatoire + langue active) AVANT toute UI, pour que I18n.t() ne rende jamais la clé
  // brute. Échec réseau → dico {} (jamais de rejet), repli FR (js/langManager.js).
  if (window.I18n && typeof window.I18n.init === "function") {
    try { await window.I18n.init(); }
    catch (e) { console.warn("[Main] I18n.init a échoué (fallback FR) :", e); }
  }

  // Sessions chargées depuis IndexedDB (migrées du localStorage au 1er lancement) AVANT tout rendu qui les lit.
  // Jamais de rejet : IndexedDB indisponible = repli localStorage (js/sessionStore.js).
  if (window.KtaSessionStore && typeof window.KtaSessionStore.init === "function") {
    try { await window.KtaSessionStore.init(); }
    catch (e) { console.warn("[Main] KtaSessionStore.init a échoué :", e); }
  }

  // HOME traduit AVANT le splash : déjà dans la bonne langue quand il devient visible.
  try { _applyI18nDom(document); _initHomeLangSelect(); }
  catch (e) { console.warn("[Main] i18n HOME a échoué :", e); }

  _splashStart();

  // Config d'instance lue UNE fois, avant les gates (community-server-line.md §3) : gate, kiosque, connecteur et
  // découverte la partagent (js/ktaInstance.js). Délai 2 s, puis dernière config connue.
  const _instanceBoot = (window.KtaInstance && typeof window.KtaInstance.charger === "function")
    ? await window.KtaInstance.charger() : null;
  // Rotation du mot de passe d'instance à effet immédiat : revalidation avant la gate, jamais en pleine session.
  // 🩸 Seulement si l'index a VRAIMENT répondu : une config rejouée de mémoire ne révoque rien (sinon une coupure
  // réseau reverrouillerait l'app).
  if (_instanceBoot && _instanceBoot.repondu && window.UnlockGate &&
      typeof window.UnlockGate.revaliderInstance === "function") {
    window.UnlockGate.revaliderInstance(_instanceBoot.config ? _instanceBoot.config.accessHash : null, true);
  }
  // État de connexion connu avant la gate (la gate déléguée en a besoin) ; la licence n'est ATTENDUE que si
  // l'instance déclare « on » : myktamap.fr et toute instance OFF ne perdent pas une milliseconde.
  if (_instanceBoot) _appliquerConnexionServeur(_instanceBoot.config, _instanceBoot.repondu);
  const _scBoot = _instanceBoot && _instanceBoot.config ? _instanceBoot.config.serverConnection : null;

  // Conditions d'utilisation : bloquantes, sautées en incognito (flag non persistant) ; l'étape légale de
  // FirstRunFlow reste en filet. Deux moments (décision produit) :
  // - un écran d'entrée va s'afficher (Bienvenue ou code de l'installation community ; installation reliée : la gate
  //   déléguée) : au moment où la personne ENTRE (« Entrer », code juste, connexion ou demande d'accès validée),
  //   refusables — un visiteur de passage n'est pas arrêté par une fenêtre. Passées à l'écran par `avantEntree`
  //   (UnlockGate.ouvrirGate, KtaExtensions.gateDeleguee) : résolue à false = refus, on reste sur l'écran, rien
  //   n'est mémorisé, elles reviennent à la prochaine entrée ;
  // - sinon (accès community déjà ouvert) : EN PREMIER, avant toute gate.
  // 🩸 Avant une gate, au-dessus d'elle : lancée après, la gate légale (z 99999) passait DERRIÈRE l'UnlockGate
  // (z 100100) ; à l'entrée, elle s'ouvre au-dessus (LegalGate.ouvrirGate({ auDessus })).
  const _legalAFaire = !!(window.LegalGate && typeof window.LegalGate.ouvrirGate === "function"
    && !window.LegalGate.isAccepted() && !(window.IncognitoMode && window.IncognitoMode.active));
  const _scOn = !!(_scBoot && _scBoot.state === "on");
  const _legalApresEntree = _legalAFaire
    && (_scOn || !!(window.UnlockGate && !window.UnlockGate.isUnlocked()));
  const _ouvrirLegal = async function(auDessus, refusable) {
    try { return await window.LegalGate.ouvrirGate({ auDessus: auDessus, refusable: refusable }); }
    catch (e) { console.warn("[Main] LegalGate a échoué :", e); return true; }
  };
  const _legalAEntree = _legalApresEntree
    ? { avantEntree: function() { return _ouvrirLegal(true, true); } } : undefined;
  if (_legalAFaire && !_legalApresEntree) {
    await _splashAvantGate();
    await _ouvrirLegal(false, false);
    _rideauSiSplashParti();
  }
  if (_scBoot && _scBoot.state === "on" && window.MyKTAMapProLicense && !window.MyKTAMapProLicense.isPro()) {
    // Licence serveur déjà connue : 2 s. Sinon (1er lancement, après réinitialisation) : jusqu'à 15 s, on repart dès
    // mktm:license-checked, trouvée ou non.
    let _licConnue = false;
    try { _licConnue = !!localStorage.getItem(window.MyKTAMapProLicense._LS_KEY_SERVER); } catch(e) {}
    await new Promise(function(resolve) {
      const fin = function() {
        window.removeEventListener("mktm:license-changed", fin);
        window.removeEventListener("mktm:license-checked", fin);
        clearTimeout(t); resolve();
      };
      const t = setTimeout(fin, _licConnue ? 2000 : 15000);
      window.addEventListener("mktm:license-changed", fin);
      window.addEventListener("mktm:license-checked", fin);
    });
  }

  // Modules greffés et gate déléguée. Règle E : modules chargés seulement sur une instance « on » avec une licence
  // de source serveur (myktamap.fr n'en charge jamais), AVANT les gates, pour qu'un module remplace la gate d'entrée.
  // 🔒 Installation pro sans licence valide (absente, expirée, signature refusée) = APP FERMÉE. Sans ce verrou, ni
  // modules ni gate déléguée : l'app tomberait sur la gate community (souvent déjà franchie) et s'ouvrirait sur les
  // données du dernier utilisateur. Hors ligne avec une licence valide en cache : état « configurée », rien ne change.
  if (_motifBlocage() === "licence") {
    console.warn("[Main] Installation pro sans licence valide : accès fermé (jamais de repli community)");
    await _splashEnd();
    await _ktaInstanceIndisponible("licence");
  }

  let _gateDelegueeOk = false;
  if (window.KtaExtensions && typeof window.KtaExtensions.chargerModules === "function") {
    const _mods = await window.KtaExtensions.chargerModules();
    // 🩸 Animation finie AVANT la gate déléguée : gate.ouvrir() dessine son écran tout de suite, par-dessus une
    // animation en cours sinon. Le splash reste dessous : une session déjà ouverte ne dessine rien.
    if (_mods && _mods.demandes > 0) await _splashAvantGate();
    const _gate = window.KtaExtensions.gateDeleguee(_legalAEntree);
    if (_gate) {
      try { await _gate; _gateDelegueeOk = true; console.log("[Main] Gate déléguée franchie"); }
      catch (e) {
        // 🔒 JAMAIS de repli sur la gate community : le code communautaire, diffusé largement, ouvrirait une
        // instance privée.
        console.warn("[Main] Gate déléguée en échec :", e);
        await _splashEnd();
        await _ktaInstanceIndisponible(_motifBlocage());
      }
    } else if (_mods && _mods.demandes > 0 && _mods.echecs > 0) {
      // Module qui ne se charge pas : écran dédié, même règle.
      await _splashEnd();
      await _ktaInstanceIndisponible();
    }
  }

  // Unlock Gate (barrière communautaire) : après le splash, avant toute init qui touche au plan ou à l'UI. Déjà
  // déverrouillé (cas courant) → étape sautée sans overlay.
  // ⚠️ ouvrirGate() ne résout pas pendant un verrou temporisé : le boot attend là (volontaire).
  if (!_gateDelegueeOk && window.UnlockGate && !window.UnlockGate.isUnlocked()) {
    await _splashAvantGate();

    // Licence pro active → la gate community est contournée (sinon gate ET bouton d'import de licence au 1er boot).
    // isPro() déjà vrai → immédiat ; sinon attente max 2 s de mktm:license-changed (fetch /Licence-pro.json) ;
    // toujours pas pro → gate normale.
    const _proLicenseReady = async function(maxMs) {
      if (!window.MyKTAMapProLicense) return false;
      if (window.MyKTAMapProLicense.isPro()) return true;
      return new Promise(function(resolve) {
        const timer = setTimeout(function() {
          window.removeEventListener("mktm:license-changed", onChange);
          resolve(!!(window.MyKTAMapProLicense && window.MyKTAMapProLicense.isPro()));
        }, maxMs || 2000);
        function onChange(e) {
          if (e && e.detail && e.detail.isPro) {
            clearTimeout(timer);
            window.removeEventListener("mktm:license-changed", onChange);
            resolve(true);
          }
        }
        window.addEventListener("mktm:license-changed", onChange);
      });
    };

    const _proActive = await _proLicenseReady(2000);

    // 🔒 Instance avec mot de passe (`accessHash`) : AUCUNE licence ne le contourne, ni "local" ni "server". Le mot
    // de passe est l'accès, la licence n'accorde que le MODE pro. 🩸 Pas d'exception "server" : /Licence-pro.json est
    // servi à TOUS les visiteurs, elle rendrait le mot de passe muet. Instance pro SANS mot de passe → bypass.
    // (check-gate-instance.js exécute ce bloc.)
    let _proBypass = _proActive;
    if (_proActive
        && typeof window.UnlockGate.instanceRequiertMotDePasse === "function"
        && await window.UnlockGate.instanceRequiertMotDePasse()) {
      _proBypass = false;
      console.log("[Main] Licence pro (toute source) ignorée pour le déverrouillage : " +
                  "instance protégée par mot de passe → saisie requise");
    }

    if (_proBypass) {
      console.log("[Main] Licence pro active (source=" +
                  window.MyKTAMapProLicense.getSource() +
                  ") → bypass UnlockGate community");
      // Flag unlock posé (la licence est un accès légitime, comme le code validé) : pas de gate au prochain boot.
      // Jamais le hash en dur ici : API publique d'UnlockGate, sinon rien (le bypass se rejoue au reload).
      try {
        if (typeof window.UnlockGate.markUnlockedViaLicensePro === "function") {
          window.UnlockGate.markUnlockedViaLicensePro();
        }
      } catch(e) { /* swallow */ }
    } else {
      console.log("[Main] Gate auth ouverte (pas encore déverrouillé)…");
      await window.UnlockGate.ouvrirGate(_legalAEntree);
      console.log("[Main] Gate auth franchie → init normale");
    }
  }
  // Filet des conditions qu'aucun écran d'entrée n'a posées : carte de repli (sans avantEntree), licence qui a
  // contourné la gate, gate déléguée franchie sans écran (session reprise) ou qui ignore `avantEntree`. Plus d'écran
  // d'entrée derrière : non refusable. Déjà acceptées à l'entrée : rien.
  if (_legalAFaire && !window.LegalGate.isAccepted()) {
    await _splashAvantGate();
    await _ouvrirLegal(false);
    _rideauSiSplashParti();
  }

  // PIN/biométrie optionnel, APRÈS l'UnlockGate (js/pinLock.js). Désactivé ou déjà déverrouillé cette session →
  // rien ; sinon gate PIN jusqu'au déverrouillage (verrou temporisé, jamais définitif : décision produit).
  if (window.MyKTAMapPinLock && window.MyKTAMapPinLock.isEnabled()
      && !window.MyKTAMapPinLock.isUnlocked()) {
    await _splashAvantGate();
    console.log("[Main] Gate PIN ouverte (pas encore déverrouillé)…");
    await window.MyKTAMapPinLock.ouvrirGate();
    console.log("[Main] Gate PIN franchie → init normale");
  }

  // 🩸 Toutes les gates franchies : on libère le séquenceur de premier lancement. Sans ce signal, FirstRunFlow
  // (lancé par _splashEnd) démarrait dans une fenêtre sans gate (attente de licence) et le tutoriel passait
  // derrière la saisie du code. En verrou, jamais atteint : la file ne démarre pas (voulu).
  if (window.FirstRunFlow && typeof window.FirstRunFlow.notifyBootGatesDone === "function") {
    window.FirstRunFlow.notifyBootGatesDone();
  }

  if (window.PlanRegistry) {
    window.PlanRegistry.init();
  }

  // Mise à jour (version.json, non bloquant, silencieux hors ligne) : modale au-dessus du splash (z 99999).
  if (window.UpdateChecker && typeof window.UpdateChecker.check === "function") {
    window.UpdateChecker.check().catch(function(e) {
      console.warn("[Main] UpdateChecker error :", e);
    });
  }

  // Alerte publique (alert.json) : modale affichée après le splash via notifySplashEnded.
  if (window.AlertChecker && typeof window.AlertChecker.check === "function") {
    window.AlertChecker.check().catch(function(e) {
      console.warn("[Main] AlertChecker error :", e);
    });
  }

  // WakeLock : second filet (le module s'initialise déjà en fin de fichier), repris quand l'app est stabilisée.
  // 🩸 Une préférence sauvegardée doit être RELUE au boot : en PWA iOS chaque retour dans l'app est un boot.
  // La vraie panne était le verrou fantôme (en-tête de js/wakeLock.js). check-wakelock.js exige cet appel.
  if (window.WakeLock && typeof window.WakeLock.init === "function") {
    window.WakeLock.init().catch(function () {});
  }

  // Kill-switch anti-fuite (denylist.json, cache 24 h). Le refus d'un ZIP se joue dans chargerZipFichier
  // (PlanDenylist.isPlanDenied) ; ici, audit différé des plans LOCAUX déjà importés.
  if (window.PlanDenylist && typeof window.PlanDenylist.init === "function") {
    window.PlanDenylist.init().then(function() {
      // Plans purgés au DERNIER boot : modale d'information.
      const purged = window.PlanDenylist.getPurgedAtBoot();
      if (purged && purged.length > 0) {
        setTimeout(function() {
          try { window.PlanDenylist.showPurgedNotifModal(purged); } catch(e) {}
        }, 800);
      }
      // Audit en arrière-plan, différé de 2 s pour ne pas bloquer le boot.
      setTimeout(function() {
        window.PlanDenylist.auditPlansLocaux().then(function(res) {
          if (res.purged && res.purged.length > 0) {
            console.warn("[Main] Audit denylist : " + res.purged.length + " plan(s) purgé(s) au boot — affichage notif");
            try { window.PlanDenylist.showPurgedNotifModal(res.purged); } catch(e) {}
          }
        }).catch(function(e) {
          console.warn("[Main] auditPlansLocaux error :", e);
        });
      }, 2000);
    }).catch(function(e) {
      console.warn("[Main] PlanDenylist init error :", e);
    });
  }

  // Découverte serveur. La pref « ne pas charger les plans serveur » ne saute que l'inscription des plans ; la
  // config d'instance est toujours chargée. 🩸 Index lu AVANT la pref : le kiosque peut la remettre à false, sinon
  // l'accueil reste vide pour ce démarrage.
  const _idxServeur = await _chargerIndexServeur();
  const _skipServer = (typeof window._loaderSkipServerPlans === "function")
                      && window._loaderSkipServerPlans();
  if (_skipServer) {
    console.log("[Main] Auto-discovery serveur SKIPPÉ (pref user : myktamap_skip_server_plans_v1)");
  } else if (_idxServeur) {
    await decouvrirPlansServeur(_idxServeur);
  }
  try { await _decouvrirPlansExtension(); } catch(e) { console.warn("[Main] plans d'extension :", e); }
  // Badges des plans d'extension changés (activité) : seuls les emplacements de badge sont mis à jour.
  window.addEventListener("mktm:plans-badges-changes", function() {
    if (typeof window.ktaMajBadgesExtension === "function") window.ktaMajBadgesExtension();
  });
  // Un plan publié (ou retiré) par une extension en cours de route : la liste est relue.
  window.addEventListener("mktm:plans-extension-changes", function() {
    _decouvrirPlansExtension().then(function() {
      if (typeof window.refreshPlansList === "function") window.refreshPlansList();
      // 🩸 La Vue OSM de l'accueil suit la liste (sinon elle garde les noms de la première lecture, parfois encore
      // illisibles). Seulement si l'accueil est affiché : en mode carte, le retour à l'accueil la remonte.
      const osm = document.getElementById("ktaOsmHomeContent");
      if (osm && osm.offsetParent !== null && window.OsmHomePreview && typeof window.OsmHomePreview.refresh === "function") {
        try { window.OsmHomePreview.refresh(); } catch (e) { console.warn("[Main] Vue OSM après la liste :", e); }
      }
    }).catch(function(e) { console.warn("[Main] plans d'extension :", e); });
  });

  // Registre vide ET plan racine présent (data/plan-config.json) : chargé automatiquement.
  const registreVide = !window.PlanRegistry || window.PlanRegistry.getAll().length === 0;

  if (registreVide) {
    const chargéDepuisServeur = await loadAppConfig();
    if (chargéDepuisServeur) {
      console.log("[Main] Plan serveur racine détecté — chargement auto (rétro-compat)");

      if (window.PlanRegistry && window.PLAN_CONFIG?.plan) {
        const id = "server_root";
        window._currentLoadedPlanId = id;  // pour SessionPersist (sinon save() ne saurait pas qui sauvegarder)
        _enregistrerPlanCharge({
          id: id,
          type: "server",
          path: "data",
          name:    window.PLAN_CONFIG.plan.name    || "Plan racine",
          version: window.PLAN_CONFIG.plan.version || null,
          author:  window.PLAN_CONFIG.plan.author  || null,
          discovered: true
        });
      }

      try {
        if (_importDemande) {
          console.log("[Main] Import demandé entretemps — chargement serveur annulé");
          await _splashEnd();
          return;
        }
        // Application lancée sous le splash ; il se ferme quand le plan est affiché (ou au plafond).
        const appPromise = lancerApplication();
        await _splashEnd(appPromise);
        await appPromise;
        return;
      } catch(err) {
        console.error("[Main] Erreur chargement serveur :", err);
      }
    }
  }

  // ⚠️ « Accueil affiché » = retour d'afficherLoader : #planLoaderOverlay visible et liste remplie (refreshPlansList
  // est synchrone) ; _splashEnd attend ensuite deux images, l'accueil est peint quand le fondu commence.
  console.log("[Main] Affichage du home avec liste des plans");
  afficherLoader();
  await _splashEnd();
})();

// ── Exports globaux ──────────────────────
window.startImportedPlan   = startImportedPlan;
window.chargerPlanServeur  = chargerPlanServeur;
window.initDataFromConfig  = initDataFromConfig;
window.lancerApplication   = lancerApplication;
window.afficherLoader      = afficherLoader;
window.ktaFermerPlanPourMemoire = ktaFermerPlanPourMemoire;
window.decouvrirPlansServeur = decouvrirPlansServeur;
