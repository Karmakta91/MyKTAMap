/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE LEAFLET
// =========================

// Sécurité : éviter double init
window.interfaceInitialized = false;

// =========================
// TITRE
// =========================
L.control.titleControl = function () {
  let control = L.control({ position: "topleft" });

  control.onAdd = function () {
    // Conteneur Leaflet vide — le vrai titre est injecté en fixed hors Leaflet
    let div = L.DomUtil.create("div", "");
    div.style.display = "none";

    const planName    = window.PLAN_CONFIG?.plan?.name    || "DEVMAP";
    const planAuthor  = window.PLAN_CONFIG?.plan?.author  || "";
    const planVersion = window.PLAN_CONFIG?.plan?.version || "";

    const parts = [planAuthor, planVersion].filter(Boolean);
    const sousTitre = parts.join(" — ");

    // Supprimer un éventuel titre existant
    const existing = document.getElementById("kta-titre-fixe");
    if (existing) existing.remove();

    const titre = document.createElement("div");
    titre.id = "kta-titre-fixe";
    titre.title = "Cliquer pour changer de plan";
    titre.innerHTML = `
      <div class="map-title-text">
        ${planName}
        <span class="kta-titre-arrow">▾</span>
        ${sousTitre ? `<span class="map-title-sub">${sousTitre}</span>` : ""}
      </div>
    `;
    document.body.appendChild(titre);

    // Cliquable : ouvre/ferme le panneau de sélection rapide
    titre.addEventListener("click", function(e) {
      e.stopPropagation();
      togglePlanSwitcher();
    });

    return div;
  };

  return control;
};

// =========================
// PANNEAU "PLAN SWITCHER" — sélection rapide depuis le titre
// =========================
function _sessionAModif() {
  const editorPts  = (window.getEditorPoints  && window.getEditorPoints())  || [];
  const roads      = (window.getRoads         && window.getRoads())         || [];
  const zones      = (window.getZones         && window.getZones())         || [];
  // 🆕 v1.9.3-A1.a : structures comptent aussi comme modif (sinon
  // l'utilisateur perdrait ses piliers sans avertissement au switch).
  const structures = (window.getStructures    && window.getStructures())    || [];
  const measure    = (window.getMeasurePoints && window.getMeasurePoints()) || [];
  // 🆕 v1.12.0-fix : surface compte aussi comme session active
  const measureSurf = (window.getMeasurePointsSurface && window.getMeasurePointsSurface()) || [];
  const trackPath  = (window.getTrackingPath  && window.getTrackingPath())  || [];
  return editorPts.length > 0 || roads.length > 0 || zones.length > 0
      || structures.length > 0
      || measure.length > 0   || measureSurf.length > 0
      || trackPath.length > 1;
}

function _resumeSession() {
  // Liste détaillée des modifs en cours pour l'avertissement
  const items = [];
  const editorPts  = (window.getEditorPoints  && window.getEditorPoints())  || [];
  const roads      = (window.getRoads         && window.getRoads())         || [];
  const zones      = (window.getZones         && window.getZones())         || [];
  const structures = (window.getStructures    && window.getStructures())    || [];
  const measure     = (window.getMeasurePoints        && window.getMeasurePoints())        || [];
  // 🆕 v1.12.0-fix : surface listée séparément dans le résumé
  const measureSurf = (window.getMeasurePointsSurface && window.getMeasurePointsSurface()) || [];
  const trackPath   = (window.getTrackingPath         && window.getTrackingPath())         || [];

  if (editorPts.length  > 0) items.push(editorPts.length + " point" + (editorPts.length > 1 ? "s" : "") + " ajouté" + (editorPts.length > 1 ? "s" : ""));
  if (roads.length      > 0) items.push(roads.length     + " tracé"  + (roads.length     > 1 ? "s" : ""));
  if (zones.length      > 0) items.push(zones.length     + " zone"   + (zones.length     > 1 ? "s" : ""));
  // 🆕 v1.9.3-A1.a : structures dans le résumé session (avertissement
  // au changement de plan / retour loader).
  if (structures.length  > 0) items.push(structures.length + " structure" + (structures.length > 1 ? "s" : ""));
  if (measure.length     > 0) items.push("une mesure de distance");
  if (measureSurf.length > 0) items.push("une mesure de surface");
  if (trackPath.length   > 1) items.push("le parcours du tracker");
  return items;
}

function _fmtDateRel(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1)    return "à l'instant";
    if (min < 60)   return "il y a " + min + " min";
    const h = Math.floor(min / 60);
    if (h < 24)     return "il y a " + h + " h";
    const j = Math.floor(h / 24);
    if (j === 1)    return "hier";
    if (j < 7)      return "il y a " + j + " jours";
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  } catch(e) { return ""; }
}

function _ouvrirPlanSwitcher() {
  // Fermer un panneau existant
  _fermerPlanSwitcher();

  if (!window.PlanRegistry) return;

  const all = window.PlanRegistry.getAll();
  const current = window.PlanRegistry.getLastOpened();
  const currentId = current && current.id;

  // 3 plans récents EXCLUANT le plan en cours
  const recents = all
    .filter(function(p) { return p.id !== currentId && p.lastOpened; })
    .sort(function(a, b) { return (b.lastOpened || "").localeCompare(a.lastOpened || ""); })
    .slice(0, 3);

  // 🆕 v1.8.1-refonte-15 : 2 modes de rendu selon flag refonte.
  // - Refonte ON  → modale centrée avec overlay (charte refonte)
  // - Legacy mode → dropdown ancré sous le titre fixe (comportement v1.8.x)
  const refonte = window._refonteInterfaceActive === true;
  if (refonte) {
    _ouvrirPlanSwitcherRefonte(recents, current);
  } else {
    _ouvrirPlanSwitcherLegacy(recents);
  }

  // Listeners de fermeture communs aux 2 modes
  setTimeout(function() {
    document.addEventListener("click", _onClicAilleursPanneau, true);
    document.addEventListener("keydown", _onEscapePanneau, true);
  }, 0);
}

// ─────────────────────────────────────────────────────────────────
// Rendu MODALE REFONTE — overlay + boîte centrée, charte v1.8.1+
// ─────────────────────────────────────────────────────────────────
// On reprend les classes .kta-readme-modal-overlay / .kta-readme-modal-boite
// pour bénéficier du backdrop sombre + animation fade-in + safe-area auto.
// La boîte interne a son propre style compact (.kta-plan-switcher-modal-*).
function _ouvrirPlanSwitcherRefonte(recents, current) {
  const overlay = document.createElement("div");
  overlay.id = "kta-plan-switcher-overlay";
  overlay.className = "kta-readme-modal-overlay kta-plan-switcher-overlay";

  // Carte du plan en cours (highlight, non-cliquable car déjà chargé)
  let currentHtml = "";
  if (current) {
    const icon = current.type === "server" ? "🌐" : "💾";
    const ver  = current.version
      ? ' <span class="kta-switcher-ver">' + escapeHtmlSwitcher(current.version) + '</span>'
      : '';
    const sub  = current.lastOpened
      ? "Ouvert " + (_fmtDateRel(current.lastOpened) || "récemment")
      : "Plan en cours";
    currentHtml =
      '<div class="kta-plan-switcher-current">' +
        '<div class="kta-plan-switcher-current-label">📍 Plan en cours</div>' +
        '<div class="kta-plan-switcher-current-name">' +
          '<span class="kta-plan-switcher-current-icon">' + icon + '</span>' +
          '<span>' + escapeHtmlSwitcher(current.name || current.id) + '</span>' + ver +
        '</div>' +
        '<div class="kta-plan-switcher-current-sub">' + escapeHtmlSwitcher(sub) + '</div>' +
      '</div>';
  }

  // Section "Plans récents"
  let recentsHtml = "";
  if (recents.length > 0) {
    recentsHtml += '<div class="kta-plan-switcher-section-titre">📚 Plans récents</div>';
    recentsHtml += '<div class="kta-switcher-list">';
    recents.forEach(function(p) {
      const icon = p.type === "server" ? "🌐" : "💾";
      const sub  = _fmtDateRel(p.lastOpened) || "";
      const ver  = p.version ? ' <span class="kta-switcher-ver">' + escapeHtmlSwitcher(p.version) + '</span>' : '';
      recentsHtml +=
        '<div class="kta-switcher-row" data-plan-id="' + escapeHtmlSwitcher(p.id) + '">' +
          '<span class="kta-switcher-icon">' + icon + '</span>' +
          '<div class="kta-switcher-info">' +
            '<div class="kta-switcher-name">' + escapeHtmlSwitcher(p.name || p.id) + ver + '</div>' +
            (sub ? '<div class="kta-switcher-sub">' + sub + '</div>' : '') +
          '</div>' +
          '<span class="kta-switcher-row-arrow">›</span>' +
        '</div>';
    });
    recentsHtml += '</div>';
  } else {
    recentsHtml +=
      '<div class="kta-plan-switcher-section-titre">📚 Plans récents</div>' +
      '<div class="kta-switcher-empty">Aucun autre plan dans votre liste pour le moment.</div>';
  }

  overlay.innerHTML =
    '<div class="kta-plan-switcher-modal-boite" id="kta-plan-switcher">' +
      '<div class="kta-plan-switcher-modal-header">' +
        '<span class="kta-plan-switcher-modal-titre">🗂 Changer de plan</span>' +
        '<button class="kta-panneau-close" id="kta-plan-switcher-close" aria-label="Fermer">✕</button>' +
      '</div>' +
      '<div class="kta-plan-switcher-modal-corps">' +
        currentHtml +
        recentsHtml +
      '</div>' +
      '<div class="kta-plan-switcher-modal-footer">' +
        '<button class="kta-plan-switcher-cta" id="kta-switcher-tous">' +
          '<span class="kta-plan-switcher-cta-icon">📚</span>' +
          '<span class="kta-plan-switcher-cta-label">Voir tous mes plans</span>' +
          '<span class="kta-plan-switcher-cta-sub">Gérer / supprimer / importer</span>' +
        '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  // Marquer le titre comme "ouvert" (effet visuel cohérent même en modal)
  const titre = document.getElementById("kta-titre-fixe");
  if (titre) titre.classList.add("ouvert");

  // Clic sur le backdrop overlay (hors de la boîte) → fermeture
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) _fermerPlanSwitcher();
  });

  // Bouton ✕
  const closeBtn = overlay.querySelector("#kta-plan-switcher-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      _fermerPlanSwitcher();
    });
  }

  // Clic sur une ligne plan récent
  overlay.querySelectorAll(".kta-switcher-row").forEach(function(row) {
    row.addEventListener("click", function(e) {
      e.stopPropagation();
      const id = row.dataset.planId;
      _fermerPlanSwitcher();
      _confirmEtChargerPlan(id);
    });
  });

  // CTA "Voir tous mes plans"
  const btnTous = overlay.querySelector("#kta-switcher-tous");
  if (btnTous) {
    btnTous.addEventListener("click", function(e) {
      e.stopPropagation();
      _fermerPlanSwitcher();
      _retourLoaderAvecConfirm();
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// Rendu LEGACY — dropdown ancré sous le titre (comportement v1.8.x)
// ─────────────────────────────────────────────────────────────────
function _ouvrirPlanSwitcherLegacy(recents) {
  const panneau = document.createElement("div");
  panneau.id = "kta-plan-switcher";

  let html = "";
  if (recents.length > 0) {
    html += '<div class="kta-switcher-head">📚 Plans récents</div>';
    html += '<div class="kta-switcher-list">';
    recents.forEach(function(p) {
      const icon = p.type === "server" ? "🌐" : "💾";
      const sub  = _fmtDateRel(p.lastOpened) || "";
      const ver  = p.version ? ' <span class="kta-switcher-ver">' + escapeHtmlSwitcher(p.version) + '</span>' : '';
      html +=
        '<div class="kta-switcher-row" data-plan-id="' + p.id + '">' +
          '<span class="kta-switcher-icon">' + icon + '</span>' +
          '<div class="kta-switcher-info">' +
            '<div class="kta-switcher-name">' + escapeHtmlSwitcher(p.name || p.id) + ver + '</div>' +
            (sub ? '<div class="kta-switcher-sub">' + sub + '</div>' : '') +
          '</div>' +
        '</div>';
    });
    html += '</div>';
  } else {
    html += '<div class="kta-switcher-empty">Aucun autre plan dans votre liste</div>';
  }

  html += '<div class="kta-switcher-divider"></div>';
  html += '<div class="kta-switcher-link" id="kta-switcher-tous">📚 Tous mes plans…</div>';

  panneau.innerHTML = html;
  document.body.appendChild(panneau);

  // Marquer le titre comme "ouvert"
  const titre = document.getElementById("kta-titre-fixe");
  if (titre) titre.classList.add("ouvert");

  // Listeners — clic sur une ligne plan
  panneau.querySelectorAll(".kta-switcher-row").forEach(function(row) {
    row.addEventListener("click", function(e) {
      e.stopPropagation();
      const id = row.dataset.planId;
      _fermerPlanSwitcher();
      _confirmEtChargerPlan(id);
    });
  });

  // Listener — "Tous mes plans..."
  const btnTous = panneau.querySelector("#kta-switcher-tous");
  if (btnTous) {
    btnTous.addEventListener("click", function(e) {
      e.stopPropagation();
      _fermerPlanSwitcher();
      _retourLoaderAvecConfirm();
    });
  }
}

function _fermerPlanSwitcher() {
  // 🆕 v1.8.1-refonte-15 : 2 modes — modale refonte (overlay parent) ou
  // dropdown legacy (panneau seul). On retire le parent le plus haut.
  const overlay = document.getElementById("kta-plan-switcher-overlay");
  if (overlay) {
    overlay.remove();
  } else {
    const panneau = document.getElementById("kta-plan-switcher");
    if (panneau) panneau.remove();
  }
  const titre = document.getElementById("kta-titre-fixe");
  if (titre) titre.classList.remove("ouvert");
  document.removeEventListener("click", _onClicAilleursPanneau, true);
  document.removeEventListener("keydown", _onEscapePanneau, true);
}

function _onClicAilleursPanneau(e) {
  // En mode refonte (modale avec overlay), le clic sur le backdrop overlay
  // est déjà géré par son propre listener. Ici on couvre uniquement le mode
  // legacy (dropdown anchored) où l'overlay n'existe pas — clic ailleurs
  // que sur le panneau ou le titre fixe → fermeture.
  const overlay = document.getElementById("kta-plan-switcher-overlay");
  if (overlay) return;  // mode refonte : géré par overlay.onclick
  const panneau = document.getElementById("kta-plan-switcher");
  const titre   = document.getElementById("kta-titre-fixe");
  if (!panneau) return;
  if (panneau.contains(e.target)) return;
  if (titre && titre.contains(e.target)) return;
  _fermerPlanSwitcher();
}

function _onEscapePanneau(e) {
  if (e.key === "Escape") _fermerPlanSwitcher();
}

function togglePlanSwitcher() {
  const existant = document.getElementById("kta-plan-switcher");
  if (existant) {
    _fermerPlanSwitcher();
  } else {
    _ouvrirPlanSwitcher();
  }
}

// Confirmation puis chargement direct d'un plan depuis le panneau
function _confirmEtChargerPlan(planId) {
  if (!window.PlanRegistry) return;
  const plan = window.PlanRegistry.findById(planId);
  if (!plan) return;

  const items = _resumeSession();

  if (items.length === 0) {
    // Session vierge → chargement direct
    _chargerPlanDirect(plan);
    return;
  }

  // Session active → modale d'avertissement
  const overlay = document.createElement("div");
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-modal">' +
      '<div class="kta-modal-icon">⚠️</div>' +
      '<div class="kta-modal-titre">Session en cours</div>' +
      '<div class="kta-modal-texte">' +
        'Vous avez des modifications non enregistrées sur le plan en cours :' +
        '<ul style="text-align:left; margin:10px 0 14px 0; padding-left:24px; color:#a8b3c8; line-height:1.6; list-style-type:disc;">' +
          items.map(function(it) { return '<li style="color:#a8b3c8;">' + escapeHtmlSwitcher(it) + '</li>'; }).join("") +
        '</ul>' +
        'Charger « <strong>' + escapeHtmlSwitcher(plan.name || plan.id) + '</strong> » va vous faire perdre ces modifications.' +
      '</div>' +
      '<div class="kta-modal-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-switch-annuler">Annuler</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-switch-confirmer">Charger quand même</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);

  document.getElementById("kta-switch-annuler").addEventListener("click", function() { overlay.remove(); });
  document.getElementById("kta-switch-confirmer").addEventListener("click", function() {
    overlay.remove();
    _chargerPlanDirect(plan);
  });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

// Chargement effectif d'un plan depuis le panneau (sans repasser par le loader)
async function _chargerPlanDirect(plan) {
  // Fermer uniquement la popup "changer plan" éventuelle
  // Ne PAS supprimer kta-titre-fixe ici : si le chargement échoue ou que
  // l'utilisateur annule la modale "Plan introuvable", on doit conserver
  // le titre du plan en cours. Le titre sera recréé par initInterface()
  // si un nouveau plan se charge avec succès.
  const popup = document.getElementById("popupChangerPlan");
  if (popup) popup.remove();

  if (plan.type === "server") {
    try {
      await window.chargerPlanServeur(plan.path, plan);
    } catch(e) {
      // Plan introuvable / erreur → revenir au loader pour proposer la modale d'erreur
      console.error("[Switcher] Erreur chargement serveur :", e);
      if (window.afficherLoader) window.afficherLoader();
    }
    return;
  }

  if (plan.type === "local") {
    // Pour les plans locaux, on a besoin de la logique de chargerPlanDuRegistre
    // qui gère blob → fsHandle → re-sélection. Cette fonction est dans index.html.
    // On revient au loader pour que l'utilisateur puisse cliquer dessus,
    // ou on peut l'appeler directement si elle est exposée globalement.
    if (typeof window.chargerPlanDuRegistre === "function") {
      try { await window.chargerPlanDuRegistre(plan.id); }
      catch(e) {
        console.error("[Switcher] Erreur chargement local :", e);
        if (window.afficherLoader) window.afficherLoader();
      }
    } else {
      // Fallback : revenir au loader
      if (window.afficherLoader) window.afficherLoader();
    }
  }
}

// Retour au loader avec confirmation si session active
function _retourLoaderAvecConfirm() {
  const items = _resumeSession();
  if (items.length === 0) {
    if (window.afficherLoader) window.afficherLoader();
    return;
  }
  // Réutilise la modale popupChangerPlan existante
  if (typeof afficherPopupChangerPlan === "function") {
    afficherPopupChangerPlan();
  } else if (window.afficherLoader) {
    window.afficherLoader();
  }
}
// 🆕 Refonte UI v1.2 : exposé pour que le bouton 🗂 home du header
// refondu (refonteInterface.js) puisse utiliser la modale charte
// "Changer de plan" au lieu du confirm() natif du navigateur.
window._retourLoaderAvecConfirm = _retourLoaderAvecConfirm;

function escapeHtmlSwitcher(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
  });
}

// =========================
// PANNEAU ANCRÉ AUX BOUTONS
// =========================
(function () {
  let _panneauActif = null;
  let _closeOnOutside = null;

  function fermerPanneau() {
    if (_panneauActif) {
      _panneauActif.remove();
      _panneauActif = null;
    }
    if (_closeOnOutside) {
      document.removeEventListener("mousedown", _closeOnOutside);
      _closeOnOutside = null;
    }
  }

  window.fermerPanneau = fermerPanneau;

  window.ouvrirPanneauAncre = function (btnEl, html, titre) {
    fermerPanneau();

    const panneau = document.createElement("div");
    panneau.className = "kta-panneau";

    const fleche = document.createElement("div");
    fleche.className = "kta-panneau-fleche";
    panneau.appendChild(fleche);

    if (titre) {
      const header = document.createElement("div");
      header.className = "kta-panneau-header";
      header.innerHTML = `<span class="kta-panneau-titre">${titre}</span>`;

      const btnClose = document.createElement("button");
      btnClose.className = "kta-panneau-close";
      btnClose.innerHTML = "✕";
      btnClose.addEventListener("click", fermerPanneau);
      header.appendChild(btnClose);

      panneau.appendChild(header);
    }

    const corps = document.createElement("div");
    corps.className = "kta-panneau-corps";
    corps.innerHTML = html;
    panneau.appendChild(corps);

    document.body.appendChild(panneau);
    _panneauActif = panneau;

    const rect = btnEl.getBoundingClientRect();
    const panH = panneau.offsetHeight || 400;

    const left = rect.left - panneau.offsetWidth - 10;
    let top = rect.top + rect.height / 2 - panH / 2;
    top = Math.max(10, Math.min(top, window.innerHeight - panH - 10));

    panneau.style.left = Math.max(8, left) + "px";
    panneau.style.top = top + "px";

    requestAnimationFrame(() => {
      const realH = panneau.offsetHeight;
      let realTop = rect.top + rect.height / 2 - realH / 2;
      realTop = Math.max(10, Math.min(realTop, window.innerHeight - realH - 10));
      panneau.style.top = realTop + "px";

      const arrowTop = (rect.top + rect.height / 2) - panneau.getBoundingClientRect().top;
      fleche.style.top = Math.max(16, arrowTop) + "px";
    });

    setTimeout(() => {
      _closeOnOutside = function (ev) {
        if (!panneau.contains(ev.target) && ev.target !== btnEl) {
          fermerPanneau();
        }
      };
      document.addEventListener("mousedown", _closeOnOutside);
    }, 150);
  };
})();

const _origAppliquerConfig_wrap = window.appliquerConfig;
const _origResetConfig_wrap = window.resetConfig;

// =========================
// EXPORT SESSION JSON
// =========================
function telechargerSessionJSON() {
  // Fonction conservée comme fallback si sessionExporter.js n'est pas chargé.
  // Format Full (sans mesure, sans tracker) — voir sessionExporter.js pour la modale complète.
  const data = {
    type: "devmap-session",
    version: "1.0",
    date_export: new Date().toISOString(),
    editorPoints: window.getEditorPoints ? window.getEditorPoints() : [],
    roads:        window.getRoads        ? window.getRoads()        : [],
    zones:        window.getZones        ? window.getZones()        : [],
    // 🆕 v1.9.3-A1.a : structures aussi dans le fallback JSON. Reste
    // rétro-compatible — les anciens imports sans 'structures' tomberont
    // sur l'array vide via `dataParsee.structures || []` côté import.
    structures:   window.getStructures   ? window.getStructures()   : []
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "devmap-session.json";
  a.click();

  URL.revokeObjectURL(url);
}

// =========================
// IMPORT SESSION JSON
// =========================
function importerSessionJSON(file) {
  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);

      if (data.type !== "devmap-session") {
        alert("Fichier invalide");
        return;
      }

      if (window.setEditorPoints) window.setEditorPoints(data.editorPoints || []);
      if (window.renderEditorPoints) window.renderEditorPoints();
      if (window.resetMesure) window.resetMesure();
      if (window.setMeasurePoints) {
        window.setMeasurePoints(data.measure && data.measure.points ? data.measure.points : []);
      }
      // 🆕 v1.12.0-fix : restore aussi le polygone surface si présent dans le fichier importé
      if (window.setMeasurePointsSurface) {
        window.setMeasurePointsSurface(data.measureSurface && data.measureSurface.points ? data.measureSurface.points : []);
      }
      if (window.resetRoads) window.resetRoads();
      if (window.setRoads) window.setRoads(data.roads || []);

      alert("Import terminé");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'import");
    }
  };

  reader.readAsText(file);
}

// =========================
// 📤 IMPORT GPX — v1.14.0
// =========================
// Modale d'import d'un fichier GPX externe (TopoDroid, OsmAnd, Avenza,
// etc.). Réutilise la calibration KMZ existante (window.KmzExport
// .getCalibration / gpsToPlan) pour transformer les coords WGS84 → plan.
// Flow : sélection fichier → preview (X points / Y tracés) → confirm
// → ajout aux annotations session avec snapshot HistoryManager (undo OK).
window.ouvrirImportGpx = function() {
  const existing = document.getElementById("kta-import-gpx-modal");
  if (existing) { existing.remove(); return; }

  if (!window.GpxIO) {
    alert("Module GPX IO indisponible — rechargement nécessaire");
    return;
  }
  const calibre = window.GpxIO.verifierCalibrage();

  const overlay = document.createElement("div");
  overlay.id = "kta-import-gpx-modal";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:560px; height:auto !important; max-height:90vh !important;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">📤 Importer un fichier GPX</span>' +
        '<button class="kta-panneau-close" id="kta-import-gpx-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        (!calibre ?
          '<div class="kta-aide-section" style="background:rgba(220,50,50,0.10); border-color:rgba(220,50,50,0.30);">' +
            '<p style="color:#b02020; font-weight:600;">⚠️ Ce plan n\'est pas calibré GPS.</p>' +
            '<p>Pour importer un GPX, l\'app a besoin de savoir comment transformer les coordonnées WGS84 (lat/lng) en coordonnées plan locales. Cette transformation est définie par 2 points de calibrage (plan ↔ GPS).</p>' +
            '<p><strong>Comment calibrer</strong> : ferme cette fenêtre → 💾 Enregistrer session → onglet 📡 Export externe → saisis 2 points (x/y plan + GPS lat/lng). Une fois fait, reviens ici pour importer ton GPX.</p>' +
          '</div>'
        :
          '<div class="kta-aide-section">' +
            '<p>L\'import GPX ajoute les <strong>waypoints</strong> (points) et <strong>tracks</strong> (tracés) du fichier aux annotations de session du plan courant.</p>' +
            '<p><strong>Compatibilité</strong> : GPX 1.1 standard (TopoDroid, OsmAnd, Avenza, GPSies, Strava, Garmin, etc.). Les commentaires <code>MyKTAMap level=N</code> sont reconnus pour restaurer le niveau M-LVL si le GPX vient de MyKTAMap.</p>' +
            '<p><strong>Annulable</strong> : si l\'import ne te convient pas après preview, tu peux faire Ctrl+Z (Undo) pour revenir en arrière.</p>' +
          '</div>' +
          '<div class="kta-aide-section">' +
            '<label class="kta-net-paranoia-toggle" style="cursor:pointer;">' +
              '<input type="file" accept=".gpx,application/gpx+xml" id="kta-import-gpx-file" style="display:none;">' +
              '<span style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:22px;">📁</span>' +
                '<span><strong>Sélectionner un fichier .gpx</strong></span>' +
              '</span>' +
            '</label>' +
            '<div id="kta-import-gpx-preview" style="margin-top:12px;"></div>' +
          '</div>'
        ) +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);

  document.getElementById("kta-import-gpx-close").addEventListener("click", function() {
    overlay.remove();
  });

  if (!calibre) return;

  // File picker handler
  let _pendingPreview = null;
  const fileInput = document.getElementById("kta-import-gpx-file");
  const previewEl = document.getElementById("kta-import-gpx-preview");

  // Click sur le label déclenche le file picker
  const labelEl = fileInput.closest("label");
  if (labelEl) {
    labelEl.addEventListener("click", function(e) {
      if (e.target !== fileInput) {
        e.preventDefault();
        fileInput.click();
      }
    });
  }

  fileInput.addEventListener("change", function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    previewEl.innerHTML = '<p style="color:#8892a4;">⏳ Lecture en cours…</p>';

    window.GpxIO.importer(file, { confirmAdd: false }).then(function(r) {
      if (!r.ok) {
        previewEl.innerHTML = '<div style="background:rgba(220,50,50,0.10); border:1px solid rgba(220,50,50,0.30); padding:10px 14px; border-radius:6px; color:#b02020;"><strong>❌ Erreur :</strong> ' + r.msg + '</div>';
        return;
      }
      _pendingPreview = r;
      let warnHtml = '';
      if (r.preview.outOfBoundsWpt > 0) {
        warnHtml += '<div style="color:#8b4a0c; font-size:12px; margin-top:6px;">⚠️ ' + r.preview.outOfBoundsWpt + ' waypoint(s) sont hors du plan et seront ignorés (peut-être un mauvais calibrage ?)</div>';
      }
      if (r.preview.outOfBoundsTrk > 0) {
        warnHtml += '<div style="color:#8b4a0c; font-size:12px; margin-top:6px;">⚠️ ' + r.preview.outOfBoundsTrk + ' tracé(s) sont hors du plan et seront ignorés</div>';
      }
      previewEl.innerHTML =
        '<div style="background:rgba(244,197,66,0.12); border:1px solid rgba(244,197,66,0.40); padding:12px 14px; border-radius:6px;">' +
          '<div style="font-weight:700; margin-bottom:8px;">📊 Aperçu de l\'import</div>' +
          '<div>📍 <strong>' + r.preview.wpts + '</strong> waypoint(s) à ajouter</div>' +
          '<div>🛣️ <strong>' + r.preview.trks + '</strong> tracé(s) à ajouter</div>' +
          (r.preview.metadata && r.preview.metadata.name ? '<div style="margin-top:6px; font-size:12px; color:#6b6354;">Source : ' + r.preview.metadata.name + '</div>' : '') +
          warnHtml +
        '</div>' +
        '<div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-import-gpx-cancel" type="button">Annuler</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-import-gpx-confirm" type="button" ' +
                  (r.preview.wpts === 0 && r.preview.trks === 0 ? "disabled" : "") + '>Confirmer l\'import</button>' +
        '</div>';

      document.getElementById("kta-import-gpx-cancel").addEventListener("click", function() {
        _pendingPreview = null;
        previewEl.innerHTML = '';
        fileInput.value = '';
      });
      document.getElementById("kta-import-gpx-confirm").addEventListener("click", function() {
        if (!_pendingPreview || !_pendingPreview._toApply) return;
        window.GpxIO._appliquerImport(_pendingPreview._toApply.points, _pendingPreview._toApply.tracks);
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(
            "📤 Import GPX OK : " + _pendingPreview._toApply.points.length + " point(s) + " +
            _pendingPreview._toApply.tracks.length + " tracé(s) ajoutés. Ctrl+Z pour annuler.",
            "info"
          );
        }
        overlay.remove();
      });
    });
  });
};

// =========================
// 📥 IMPORT — modale de choix (v1.14.5 → refactor onglets v1.14.12)
// =========================
// Unification (KARMA UX) : un seul bouton "📥 Importer" dans le menu ⬇️
// Charger, qui ouvre une modale avec 2 onglets (pattern identique à la
// modale 💾 Enregistrer session : Full / Avancé / Conversion / Export
// externe).
//
// v1.14.12 (KARMA « toujours pas bon le modal import, sépare en 2
// possibilités comme on a fait pour exporter ») : abandon du pattern
// cards-en-grille (.kta-import-choix-card) qui se cassait régulièrement
// sur certains UA (divs internes débordaient dans la grille parente,
// emojis rendus "NaN"). Pattern onglets = plus simple, plus fiable, 100%
// cohérent avec la modale Enregistrer session.
window.ouvrirImportChoix = function() {
  const existing = document.getElementById("kta-import-choix-modal");
  if (existing) { existing.remove(); return; }

  // v1.14.12 — réutilise les styles .kta-ses-* de la modale Enregistrer
  // session (injectés via window.SessionExporterStyles.inject). Idempotent.
  if (window.SessionExporterStyles && typeof window.SessionExporterStyles.inject === "function") {
    window.SessionExporterStyles.inject();
  }

  // État local : onglet actif (rien d'écrit en localStorage — pas de
  // besoin de persister, c'est juste un sélecteur ponctuel).
  let _activeTab = "session"; // "session" | "gpx"

  const modal = document.createElement("div");
  modal.id = "kta-import-choix-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML = ''
    + '<div class="kta-readme-modal-boite kta-import-choix-boite">'
    +   '<div class="kta-readme-modal-header">'
    +     '<span class="kta-readme-modal-titre">📥 Importer</span>'
    +     '<button class="kta-panneau-close" id="kta-import-choix-close" type="button">✕</button>'
    +   '</div>'
    +   // === Onglets — mêmes classes .kta-ses-tabs / .kta-ses-tab que la
    +   // modale Enregistrer session, pour réutiliser le styling existant.
    +   '<div class="kta-ses-tabs">'
    +     '<button type="button" class="kta-ses-tab active" data-imp-tab="session">📥 Session</button>'
    +     '<button type="button" class="kta-ses-tab"        data-imp-tab="gpx">📤 GPX</button>'
    +   '</div>'
    +   '<div class="kta-readme-modal-corps" id="kta-import-choix-content"></div>'
    +   '<div class="kta-ses-actions">'
    +     '<button class="kta-ses-btn kta-ses-btn-secondary" id="kta-import-choix-cancel" type="button">Annuler</button>'
    +     '<button class="kta-ses-btn kta-ses-btn-primary"   id="kta-import-choix-ok"     type="button">📂 Choisir un fichier</button>'
    +   '</div>'
    + '</div>';

  document.documentElement.appendChild(modal);

  function _renderTab() {
    // Highlight onglet actif
    modal.querySelectorAll(".kta-ses-tab").forEach(function(t) {
      t.classList.toggle("active", t.dataset.impTab === _activeTab);
    });
    const content = document.getElementById("kta-import-choix-content");
    if (!content) return;

    if (_activeTab === "session") {
      content.innerHTML = ''
        + '<p class="kta-ses-intro">'
        +   '📥 <strong>Session MyKTAMap</strong> — un fichier <code>session.json</code> '
        +   'ou un <code>.zip</code> exporté depuis l\'app (depuis 💾 Enregistrer session). '
        +   'Contient tes <strong>annotations</strong> : points, tracés, zones, structures, '
        +   'mesure en cours, et photos rattachées si c\'est un ZIP.'
        + '</p>'
        + '<div class="kta-ses-summary">'
        +   '<strong>📁 Extensions acceptées :</strong> <code>.json</code> · <code>.zip</code>'
        +   '<br>'
        +   '<strong>🔄 Restauration :</strong> les annotations remplacent ou fusionnent '
        +   'avec ta session courante (choix proposé après preview).'
        + '</div>';
    } else {
      content.innerHTML = ''
        + '<p class="kta-ses-intro">'
        +   '📤 <strong>Fichier GPX externe</strong> — depuis une autre app outdoor : '
        +   '<strong>TopoDroid, OsmAnd, Avenza, GPSies, Strava, Garmin</strong>… '
        +   'Les waypoints deviennent des points, les tracks deviennent des tracés.'
        + '</p>'
        + '<div class="kta-ses-summary">'
        +   '<strong>📁 Extensions acceptées :</strong> <code>.gpx</code>'
        +   '<br>'
        +   '<strong>🌐 Calibrage GPS requis :</strong> le plan doit avoir un calibrage 2 points '
        +   '(📡 Export externe) pour transformer les coordonnées WGS84 en coords plan locales.'
        +   '<br>'
        +   '<strong>↻ Roundtrip :</strong> les GPX exportés depuis MyKTAMap (commentaires '
        +   '<code>&lt;cmt&gt;MyKTAMap level=N&lt;/cmt&gt;</code>) sont ré-importables avec '
        +   'restauration des niveaux M-LVL.'
        + '</div>';
    }
  }

  function _fermer() {
    modal.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) {
    if (e.key === "Escape") _fermer();
    else if (e.key === "Enter") _validate();
  }
  function _validate() {
    const choix = _activeTab;
    _fermer();
    if (choix === "session") {
      ouvrirImportSession();
    } else {
      if (typeof window.ouvrirImportGpx === "function") window.ouvrirImportGpx();
      else alert("Module import GPX indisponible");
    }
  }

  document.getElementById("kta-import-choix-close").addEventListener("click", _fermer);
  document.getElementById("kta-import-choix-cancel").addEventListener("click", _fermer);
  document.getElementById("kta-import-choix-ok").addEventListener("click", _validate);
  modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });
  modal.querySelectorAll(".kta-ses-tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
      _activeTab = tab.dataset.impTab;
      _renderTab();
    });
  });
  document.addEventListener("keydown", _onKey);

  _renderTab();
};

// =========================
// IMPORT SESSION — modale plein écran
// =========================
function ouvrirImportSession() {
  const existing = document.getElementById("kta-import-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id = "kta-import-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:90vh;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">📥 Importer une session</span>
        <button class="kta-panneau-close" id="kta-import-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <p style="font-size:13px; color:#8892a4; margin:0 0 14px; line-height:1.5;">
          Charge un fichier <code>session.json</code> exporté depuis l'application,
          ou un <code>.zip</code> de session avec photos (depuis v1.9.3).
          Contient tes points ajoutés, tes tracés, tes zones, tes structures, ta
          mesure en cours et ses photos rattachées.
        </p>

        <div class="kta-conv-champ">
          <label class="kta-conv-label">Fichier session</label>
          <div class="kta-conv-drop" id="kta-import-drop">
            <span id="kta-import-drop-label">📂 Cliquer ou glisser un fichier .json ou .zip</span>
            <input type="file" id="kta-import-file" accept=".json,.zip,application/json,application/zip" style="display:none">
          </div>
        </div>

        <div id="kta-import-apercu-wrap" class="kta-conv-champ" style="display:none;">
          <label class="kta-conv-label">Aperçu</label>
          <div id="kta-import-apercu" style="background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px; font-size:13px; color:#e8eaf0;"></div>
        </div>

        <div class="kta-aide-section" id="kta-import-warn" style="display:none; border-color:rgba(255,200,100,0.3); background:rgba(255,180,80,0.06);">
          <div style="font-size:13px; color:#ffd28a;">
            ⚠️ <strong>Attention</strong> — l'import remplacera tes points, tracés et mesure actuels.
            Pense à exporter ta session en cours avant si tu veux la conserver.
          </div>
        </div>

        <div id="kta-import-erreur" class="kta-conv-erreur" style="display:none;"></div>

        <div class="kta-conv-actions" style="margin-top:14px;">
          <button class="kta-btn kta-btn-ghost"   id="kta-import-annuler">Annuler</button>
          <button class="kta-btn kta-btn-primary"  id="kta-import-valider" disabled>Importer</button>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  const dropZone   = document.getElementById("kta-import-drop");
  const fileInput  = document.getElementById("kta-import-file");
  const dropLabel  = document.getElementById("kta-import-drop-label");
  const apercuWrap = document.getElementById("kta-import-apercu-wrap");
  const apercuEl   = document.getElementById("kta-import-apercu");
  const warnEl     = document.getElementById("kta-import-warn");
  const erreurEl   = document.getElementById("kta-import-erreur");
  const btnValider = document.getElementById("kta-import-valider");
  const btnAnnuler = document.getElementById("kta-import-annuler");
  const btnClose   = document.getElementById("kta-import-close");

  let fichierCharge = null;
  let dataParsee    = null;

  function fermer() { modal.remove(); }

  function setErr(msg) {
    erreurEl.textContent = msg || "";
    erreurEl.style.display = msg ? "block" : "none";
  }

  // 🆕 v1.9.3-B1d : ZIP avec photos (session.json + photos/) en plus du JSON pur.
  // _pendingPhotosToRestore stocke les photos extraites du ZIP entre la parse
  // et la validation. Format : [{id, pointId, mime, size, blob}, ...]
  let _pendingPhotosToRestore = null;

  function _renderApercu(data) {
    const nbPoints     = (data.editorPoints || []).length;
    const nbMesure     = (data.measure && data.measure.points) ? data.measure.points.length : 0;
    const nbTraces     = (data.roads || []).length;
    const nbZones      = (data.zones || []).length;
    // 🆕 v1.9.3-A1.a-fix5 : structures dans l'aperçu d'import session
    // (sinon KARMA voyait l'import accepté sans confirmation visuelle
    // que les structures étaient bien dans le fichier).
    const nbStructures = (data.structures || []).length;
    // 🆕 v1.9.3-B1d : photos
    const nbPhotos     = (_pendingPhotosToRestore && _pendingPhotosToRestore.length) || 0;
    const photosBadge  = nbPhotos > 0
      ? '<span><strong style="color:#f4c542;">📸 ' + nbPhotos + '</strong> photo' + (nbPhotos > 1 ? "s" : "") + '</span>'
      : '';

    apercuEl.innerHTML = `
      <div style="display:flex; gap:14px; flex-wrap:wrap;">
        <span><strong style="color:#8cb4ff;">${nbPoints}</strong> point(s) ajouté(s)</span>
        <span><strong style="color:#8cb4ff;">${nbTraces}</strong> tracé(s)</span>
        <span><strong style="color:#8cb4ff;">${nbZones}</strong> zone(s)</span>
        <span><strong style="color:#8cb4ff;">${nbStructures}</strong> structure(s)</span>
        <span><strong style="color:#8cb4ff;">${nbMesure}</strong> point(s) de mesure</span>
        ${photosBadge}
      </div>
    `;
    apercuWrap.style.display = "block";
    warnEl.style.display = "block";
    btnValider.disabled = false;
  }

  function _parseSessionJson(text) {
    const data = JSON.parse(text);
    if (data.type !== "devmap-session") {
      throw new Error("Le fichier n'est pas une session devmap-session valide.");
    }
    return data;
  }

  // Parse un ZIP de session (v1.9.3-B1d) : extrait session.json + photos/
  // Retourne Promise<data> où data est l'objet session parsé + remplit le
  // tableau _pendingPhotosToRestore en variable de fermeture.
  function _parseSessionZip(file) {
    if (typeof JSZip === "undefined") {
      return Promise.reject(new Error("JSZip non chargé (ZIP impossible)"));
    }
    return JSZip.loadAsync(file).then(function(zip) {
      const sessionFile = zip.file("session.json");
      if (!sessionFile) throw new Error("ZIP invalide : session.json manquant à la racine.");
      return sessionFile.async("string").then(function(jsonText) {
        const data = _parseSessionJson(jsonText);
        // Cherche le sous-dossier photos/ + l'index. Si absent → pas de photos.
        const indexFile = zip.file("photos/_index.json");
        if (!indexFile) {
          _pendingPhotosToRestore = [];
          return data;
        }
        return indexFile.async("string").then(function(idxText) {
          let idxObj;
          try { idxObj = JSON.parse(idxText); }
          catch(e) { throw new Error("photos/_index.json corrompu : " + e.message); }
          const idxMap = idxObj && idxObj.photos ? idxObj.photos : {};
          const photoIds = Object.keys(idxMap);
          if (photoIds.length === 0) {
            _pendingPhotosToRestore = [];
            return data;
          }
          // Charge chaque blob photo en parallèle
          const promises = photoIds.map(function(pid) {
            const info = idxMap[pid] || {};
            const filename = "photos/" + (info.file || (pid + ".jpg"));
            const f = zip.file(filename);
            if (!f) {
              console.warn("[Import] Photo manquante dans le ZIP :", filename);
              return null;
            }
            return f.async("blob").then(function(blob) {
              return {
                id:      pid,
                pointId: info.pointId,
                mime:    info.mime || blob.type || "image/jpeg",
                size:    info.size || blob.size,
                blob:    blob
              };
            });
          });
          return Promise.all(promises).then(function(arr) {
            _pendingPhotosToRestore = arr.filter(function(p) { return p !== null; });
            return data;
          });
        });
      });
    });
  }

  function chargerFichier(file) {
    fichierCharge = file;
    dropLabel.textContent = "✅ " + file.name;
    setErr("");
    _pendingPhotosToRestore = null;

    const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip"
                  || file.type === "application/x-zip-compressed";

    if (isZip) {
      // 🆕 v1.9.3-B1d : ZIP avec photos
      _parseSessionZip(file).then(function(data) {
        dataParsee = data;
        _renderApercu(data);
      }).catch(function(err) {
        console.error("[Import session ZIP] :", err);
        setErr("❌ ZIP invalide : " + (err.message || err));
        dataParsee = null;
        _pendingPhotosToRestore = null;
        apercuWrap.style.display = "none";
        warnEl.style.display = "none";
        btnValider.disabled = true;
      });
      return;
    }

    // JSON pur (rétrocompat)
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = _parseSessionJson(e.target.result);
        dataParsee = data;
        _renderApercu(data);
      } catch(err) {
        setErr("❌ " + err.message);
        dataParsee = null;
        apercuWrap.style.display = "none";
        warnEl.style.display = "none";
        btnValider.disabled = true;
      }
    };
    reader.readAsText(file);
  }

  // Drop zone
  dropZone.addEventListener("click", function() { fileInput.click(); });
  fileInput.addEventListener("change", function() {
    if (fileInput.files[0]) chargerFichier(fileInput.files[0]);
  });
  dropZone.addEventListener("dragover", function(e) {
    e.preventDefault(); dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", function() { dropZone.classList.remove("dragover"); });
  dropZone.addEventListener("drop", function(e) {
    e.preventDefault(); dropZone.classList.remove("dragover");
    const f = e.dataTransfer.files[0];
    // 🆕 v1.9.3-B1d : accepte aussi les .zip (session avec photos)
    const okExt = f && (/\.(json|zip)$/i).test(f.name);
    if (okExt) chargerFichier(f);
    else setErr("Le fichier doit être un .json ou .zip (session)");
  });

  // Boutons
  btnClose.addEventListener("click", fermer);
  btnAnnuler.addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  btnValider.addEventListener("click", function() {
    if (!dataParsee) return;

    // 🆕 v1.9.3-B1d : restauration des photos en IDB AVANT de pousser
    // editorPoints (= avant que la grille puisse interroger IDB).
    // Stratégie : on purge TOUTES les photos du plan courant en IDB,
    // puis on injecte celles du ZIP. C'est le comportement attendu
    // (= un import est un remplacement, pas un merge — cohérent avec
    // points/roads/zones qui sont aussi reset+set).
    function _restorerPhotos() {
      if (!_pendingPhotosToRestore || _pendingPhotosToRestore.length === 0) {
        return Promise.resolve(0);
      }
      if (!window.MyKTAMapPhotos) {
        console.warn("[Import] MyKTAMapPhotos indispo — photos ignorées");
        return Promise.resolve(0);
      }
      const planId = window._currentLoadedPlanId || "default";
      return window.MyKTAMapPhotos.deletePhotosForPlan(planId).then(function() {
        const promises = _pendingPhotosToRestore.map(function(p) {
          return window.MyKTAMapPhotos.restorePhoto({
            id:      p.id,
            planId:  planId,
            pointId: String(p.pointId),
            blob:    p.blob,
            mime:    p.mime,
            size:    p.size
          });
        });
        return Promise.all(promises).then(function() {
          console.log("[Import] Photos restaurées :", _pendingPhotosToRestore.length);
          return _pendingPhotosToRestore.length;
        });
      });
    }

    _restorerPhotos().then(function() {
      try {
        if (window.setEditorPoints)    window.setEditorPoints(dataParsee.editorPoints || []);
        if (window.renderEditorPoints) window.renderEditorPoints();
        if (window.resetMesure)        window.resetMesure();
        if (window.setMeasurePoints) {
          window.setMeasurePoints(dataParsee.measure && dataParsee.measure.points ? dataParsee.measure.points : []);
        }
        // 🆕 v1.12.0-fix : restore aussi le polygone surface si présent
        if (window.setMeasurePointsSurface) {
          window.setMeasurePointsSurface(dataParsee.measureSurface && dataParsee.measureSurface.points ? dataParsee.measureSurface.points : []);
        }
        if (window.resetRoads)         window.resetRoads();
        if (window.setRoads)           window.setRoads(dataParsee.roads || []);
        if (window.resetZones)         window.resetZones();
        if (window.setZones)           window.setZones(dataParsee.zones || []);
        // 🆕 v1.9.3-A1.a : restauration des structures depuis l'import
        // session JSON. Rétrocompat : si l'import est antérieur à v1.9.3,
        // dataParsee.structures sera undefined → array vide via `|| []`.
        if (window.resetStructures)    window.resetStructures();
        if (window.setStructures)      window.setStructures(dataParsee.structures || []);

        _pendingPhotosToRestore = null;  // cleanup
        fermer();
      } catch(err) {
        console.error(err);
        setErr("Erreur lors de l'import : " + (err.message || err));
      }
    }).catch(function(err) {
      console.error("[Import] _restorerPhotos a échoué :", err);
      setErr("Erreur lors de la restauration des photos : " + (err.message || err));
    });
  });
}

// =========================
// CONVERTISSEUR JSON — DÉPLACÉ
// =========================
// La fonction afficherConvertisseur (qui supportait les 2 sens ed2data / data2ed)
// a été retirée le 08/05/2026. La conversion bidirectionnelle est maintenant
// dans le modal "💾 Enregistrer la session" → onglet "🔄 Conversion" (sessionExporter.js).
// Voir _renderConversion / _exportConversion dans sessionExporter.js
// =========================

// =========================
// HELPER — modale de confirmation simple (1 clic)
// =========================
function _confirmerAction(titre, texte, callback) {
  const overlay = document.createElement("div");
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML = `
    <div class="kta-modal">
      <div class="kta-modal-icon">⚠️</div>
      <div class="kta-modal-titre">${titre}</div>
      <div class="kta-modal-texte">${texte}</div>
      <div class="kta-modal-actions">
        <button class="kta-btn kta-btn-ghost" id="_conf-annuler">Annuler</button>
        <button class="kta-btn kta-btn-danger" id="_conf-ok">Confirmer</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(overlay);
  document.getElementById("_conf-annuler").addEventListener("click", function () { overlay.remove(); });
  document.getElementById("_conf-ok").addEventListener("click", function () { overlay.remove(); callback(); });
}

// =========================
// HELPER — modale de choix de suppression (plusieurs options)
// options = [{ label, icon, onClick, danger }]
// =========================
// 🆕 v1.9.3-A1.b.2.5-fix2 (KARMA "fait ce modal plus en cohérence de
// notre charte, pareille pour zone") : helper alert() charté.
// Remplace les `alert()` natifs OS-styled (zones/structures) par une
// modale charte (même pattern que _choixSuppression et popupChangerPlan).
//
// Paramètres :
//   - titre : court (1-5 mots), affiché en bold
//   - texte : phrase explicative, peut contenir du HTML léger
//   - icone : emoji optionnel (default ⚠️ warning)
//
// Comportement : 1 bouton "OK" jaune charte, fermeture par clic OK ou
// clic sur l'overlay extérieur. Pas de callback de retour — c'est juste
// un alert (= info, pas de décision utilisateur à prendre).
function _alertCharte(titre, texte, icone) {
  const ic = icone || "⚠️";
  const existing = document.getElementById("kta-alert-charte");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "kta-alert-charte";
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-modal" style="max-width:420px;">' +
      '<div class="kta-modal-icon">' + ic + '</div>' +
      '<div class="kta-modal-titre">' + titre + '</div>' +
      '<div class="kta-modal-texte">' + texte + '</div>' +
      '<div class="kta-modal-actions">' +
        '<button class="kta-btn kta-btn-primary" id="kta-alert-charte-ok">OK</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);

  const btnOk = document.getElementById("kta-alert-charte-ok");
  if (btnOk) {
    btnOk.addEventListener("click", function() { overlay.remove(); });
    // Focus auto pour permettre Enter direct
    setTimeout(function() { try { btnOk.focus(); } catch(e) {} }, 0);
  }
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
  // Escape ferme la modale
  function _onKey(e) {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", _onKey);
    }
  }
  document.addEventListener("keydown", _onKey);
}

function _choixSuppression(titre, texte, options) {
  const overlay = document.createElement("div");
  overlay.className = "kta-modal-overlay";

  const boutonsHtml = options.map(function(opt, i) {
    const cls = opt.danger ? "kta-btn-danger" : (opt.ghost ? "kta-btn-ghost" : "kta-btn-primary");
    const ic  = opt.icon ? opt.icon + " " : "";
    return `<button class="kta-btn ${cls}" id="_choix-${i}" style="text-align:left; padding:10px 14px;">
      ${ic}${opt.label}
      ${opt.desc ? `<span style="display:block; font-size:11px; opacity:0.7; font-weight:400; margin-top:2px;">${opt.desc}</span>` : ""}
    </button>`;
  }).join("");

  overlay.innerHTML = `
    <div class="kta-modal" style="max-width:420px;">
      <div class="kta-modal-icon">⚠️</div>
      <div class="kta-modal-titre">${titre}</div>
      <div class="kta-modal-texte">${texte || ""}</div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:14px;">
        ${boutonsHtml}
        <button class="kta-btn kta-btn-ghost" id="_choix-annuler" style="margin-top:4px;">Annuler</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  options.forEach(function(opt, i) {
    document.getElementById("_choix-" + i).addEventListener("click", function() {
      overlay.remove();
      try { opt.onClick(); } catch(e) { console.error(e); }
    });
  });

  document.getElementById("_choix-annuler").addEventListener("click", function() { overlay.remove(); });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

// =========================
// README — modale plein écran
// =========================
function afficherReadme() {
  const existing = document.getElementById("kta-readme-modal");
  if (existing) { existing.remove(); return; }

  // Chargement direct de la doc utilisateur
  _chargerReadme("docs/README_USER.md");
}

// Construit le sommaire latéral (sidebar desktop / haut sur mobile) avec H2 + sous-H3 collapsibles
function _construireSommaireReadme(corpsEl) {
  const sidebar = document.getElementById("kta-readme-toc-sidebar");
  if (!sidebar || !corpsEl) return;

  const h2List = Array.from(corpsEl.querySelectorAll("h2"));
  if (h2List.length === 0) {
    sidebar.style.display = "none";
    return;
  }

  // Construire l'arbre H2 → [H3...] en parcourant le DOM dans l'ordre
  const tree = h2List.map(function(h2, idx) {
    h2.id = "kta-readme-h2-" + idx;
    const children = [];
    let next = h2.nextElementSibling;
    let h3idx = 0;
    while (next && next.tagName !== "H2") {
      if (next.tagName === "H3") {
        next.id = "kta-readme-h2-" + idx + "-h3-" + h3idx;
        children.push(next);
        h3idx++;
      }
      next = next.nextElementSibling;
    }
    return { h2: h2, children: children };
  });

  let html = '<div class="kta-readme-toc-title">📚 Sommaire</div>';
  html += '<ul class="kta-readme-toc-list">';

  tree.forEach(function(node) {
    const hasChildren = node.children.length > 0;
    html += '<li class="kta-readme-toc-item' + (hasChildren ? '' : ' kta-readme-toc-item-leaf') + '">';
    html += '<div class="kta-readme-toc-row">';
    if (hasChildren) {
      html += '<button class="kta-readme-toc-toggle" type="button" aria-label="Plier ou déplier">▾</button>';
    } else {
      html += '<span class="kta-readme-toc-bullet">•</span>';
    }
    html += '<a href="#' + node.h2.id + '" class="kta-readme-toc-link kta-readme-toc-link-h2">';
    html += node.h2.textContent;
    html += '</a>';
    html += '</div>';
    if (hasChildren) {
      html += '<ul class="kta-readme-toc-sublist">';
      node.children.forEach(function(h3) {
        html += '<li><a href="#' + h3.id + '" class="kta-readme-toc-link kta-readme-toc-link-h3">' + h3.textContent + '</a></li>';
      });
      html += '</ul>';
    }
    html += '</li>';
  });
  html += '</ul>';

  sidebar.innerHTML = html;
  sidebar.style.display = "";

  // Brancher les toggles plier/déplier
  sidebar.querySelectorAll(".kta-readme-toc-toggle").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      const item = btn.closest(".kta-readme-toc-item");
      if (item) item.classList.toggle("collapsed");
    });
  });
}

// Setup smooth scroll, active section highlighting, back-to-top
function _setupReadmeNavigation() {
  const corpsScroll = document.getElementById("kta-readme-corps-scroll");
  const backBtn     = document.getElementById("kta-readme-back-top");
  const sidebar     = document.getElementById("kta-readme-toc-sidebar");
  if (!corpsScroll) return;

  const tocLinks = sidebar ? sidebar.querySelectorAll(".kta-readme-toc-link") : [];
  const sections = corpsScroll.querySelectorAll("h2[id], h3[id]");

  // Smooth scroll personnalisé sur les liens du TOC (l'ancrage natif scrollerait la page entière, pas notre conteneur)
  tocLinks.forEach(function(link) {
    link.addEventListener("click", function(e) {
      e.preventDefault();
      const targetId = link.getAttribute("href").substring(1);
      const target = corpsScroll.querySelector("#" + (window.CSS && CSS.escape ? CSS.escape(targetId) : targetId));
      if (target) {
        const containerTop = corpsScroll.getBoundingClientRect().top;
        const targetTop    = target.getBoundingClientRect().top;
        corpsScroll.scrollTo({
          top: corpsScroll.scrollTop + (targetTop - containerTop) - 12,
          behavior: "smooth"
        });
      }
    });
  });

  // Active section highlighting via IntersectionObserver
  if (typeof IntersectionObserver !== "undefined" && sections.length > 0 && tocLinks.length > 0) {
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        tocLinks.forEach(function(link) {
          const isActive = link.getAttribute("href") === "#" + id;
          link.classList.toggle("active", isActive);
          // Si c'est un H3 actif, déplier son parent H2 pour qu'on le voie
          if (isActive && link.classList.contains("kta-readme-toc-link-h3")) {
            const parentItem = link.closest(".kta-readme-toc-item");
            if (parentItem) parentItem.classList.remove("collapsed");
          }
        });
      });
    }, {
      root: corpsScroll,
      rootMargin: "0px 0px -65% 0px",  // section "active" quand elle entre dans le tiers supérieur
      threshold: 0
    });
    sections.forEach(function(s) { observer.observe(s); });
  }

  // Bouton retour-en-haut : visible après scroll > 250px
  if (backBtn) {
    const onScroll = function() {
      backBtn.classList.toggle("visible", corpsScroll.scrollTop > 250);
    };
    corpsScroll.addEventListener("scroll", onScroll, { passive: true });
    backBtn.addEventListener("click", function() {
      corpsScroll.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

function _chargerReadme(fichier) {
  _ouvrirReadmeModal("<p style='color:#8892a4; text-align:center; padding:20px;'>⏳ Chargement…</p>");
  fetch(fichier)
    .then(function(res) { if (!res.ok) throw new Error("HTTP " + res.status + " — " + fichier); return res.text(); })
    .then(function(md) {
      const html = _renderMarkdown(md);
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (!corps) return;
      // Injection directe du HTML rendu (plus de <p> wrapper qui cassait le rendu)
      corps.innerHTML = html;
      // Construction du sommaire latéral à partir du DOM rendu
      _construireSommaireReadme(corps);
      // Activation des comportements de navigation
      _setupReadmeNavigation();
    })
    .catch(function(err) {
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (corps) corps.innerHTML = '<p class="kta-readme-erreur">❌ Impossible de charger <code>' + fichier + '</code><br><br><code>' + err.message + '</code></p>';
      // Pas de sommaire si erreur
      const sidebar = document.getElementById("kta-readme-toc-sidebar");
      if (sidebar) sidebar.style.display = "none";
    });
}

function _renderMarkdown(md) {
  // 0. Normaliser les fins de ligne — les fichiers markdown éditésur Windows ont
  //    souvent CRLF, ce qui casse les regex \n (notamment celle des fenced code blocks)
  md = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 1. Protéger les blocs de code fenced AVANT tout traitement
  const codeBlocks = [];
  md = md.replace(/```[\w]*\n([\s\S]*?)```/g, function(_, code) {
    codeBlocks.push(code);
    return "%%CODE" + (codeBlocks.length - 1) + "%%";
  });

  // 2. Échapper le HTML (hors blocs protégés)
  md = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 3. Code inline
  md = md.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 4. Images ![alt](url) — avant les liens
  md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function(_, alt, url) {
    // Ignorer les images GitHub (assets) qui ne sont pas accessibles hors contexte
    if (url.includes("github.com") || url.includes("user-attachments")) {
      return '<span class="kta-readme-img-skip">📷 <em>' + (alt || "Image") + '</em></span>';
    }
    return '<img src="' + url + '" alt="' + alt + '" style="max-width:100%;border-radius:6px;margin:8px 0;">';
  });

  // 5. Liens [texte](url)
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 6. Tableaux Markdown |---|
  md = md.replace(/((?:^\|.+\|\n?)+)/gm, function(block) {
    const lines = block.trim().split("\n").filter(function(l) { return l.trim(); });
    if (lines.length < 2) return block;

    let html = '<table class="kta-readme-table">';
    lines.forEach(function(line, i) {
      // Ignorer la ligne de séparation |---|
      if (/^\|[\s\-:|]+\|/.test(line)) return;
      const cells = line.split("|").filter(function(_, ci) { return ci > 0 && ci < line.split("|").length - 1; });
      const tag = (i === 0) ? "th" : "td";
      html += "<tr>" + cells.map(function(c) { return "<" + tag + ">" + c.trim() + "</" + tag + ">"; }).join("") + "</tr>";
    });
    html += "</table>";
    return html;
  });

  // 7. Blockquotes
  md = md.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  md = md.replace(/(<\/blockquote>\n?<blockquote>)/g, "<br>");

  // 8. Titres
  md = md
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm,  "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,   "<h2>$1</h2>")
    .replace(/^# (.+)$/gm,    "<h1>$1</h1>");

  // 9. HR
  md = md.replace(/^---$/gm, "<hr>");

  // 10. Gras / italique
  md = md
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,         "<em>$1</em>");

  // 11. Listes
  md = md.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
  md = md.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, "<ul>$&</ul>");

  // 12. Paragraphes — split sur double saut de ligne.
  //  Pré-traitement : on isole les placeholders %%CODEN%% dans leurs propres blocs
  //  pour éviter que le wrap <p> englobe un futur <pre> (HTML invalide → bug rendu).
  md = md.replace(/(%%CODE\d+%%)/g, "\n\n$1\n\n");
  md = md.replace(/\n{3,}/g, "\n\n");

  //  - les blocs commençant par une balise block-level sont gardés tels quels
  //  - les blocs qui SONT un placeholder de code fenced sont gardés tels quels
  //  - les autres blocs (texte) sont enveloppés dans <p>, les sauts simples deviennent <br>
  const _BLOCK_TAG = /^<(h[1-6]|ul|ol|li|table|tr|td|th|blockquote|hr|pre|div|img|figure)/i;
  const _CODE_PLACEHOLDER = /^%%CODE\d+%%$/;
  md = md.split(/\n{2,}/).map(function(block) {
    block = block.trim();
    if (!block) return "";
    if (_BLOCK_TAG.test(block)) return block;
    if (_CODE_PLACEHOLDER.test(block)) return block;
    return "<p>" + block.replace(/\n/g, "<br>") + "</p>";
  }).join("\n");

  // 13. Restaurer les blocs de code
  md = md.replace(/%%CODE(\d+)%%/g, function(_, i) {
    const escaped = codeBlocks[parseInt(i)]
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return "<pre><code>" + escaped + "</code></pre>";
  });

  return md;
}

function _ouvrirReadmeModal(html) {
  const modal = document.createElement("div");
  modal.id = "kta-readme-modal";
  modal.className = "kta-readme-modal-overlay";
  // Structure : header / [sidebar | corps scrollable] / footer
  // - sidebar : sommaire desktop fixe / inline en haut sur mobile (CSS @media)
  // - corps : contenu rendu, scroll-behavior: smooth, contient aussi le bouton retour-en-haut
  // - footer : crédit Leaflet (cohérence avec le splash)
  modal.innerHTML = `
    <div class="kta-readme-modal-boite">
      <div class="kta-readme-modal-header">
        <button class="kta-readme-toc-toggle-btn" id="kta-readme-toc-toggle" type="button" aria-label="Afficher ou masquer le sommaire" title="Afficher ou masquer le sommaire">📚</button>
        <span class="kta-readme-modal-titre">📖 Documentation</span>
        <button class="kta-panneau-close" id="kta-readme-close">✕</button>
      </div>
      <div class="kta-readme-modal-layout" id="kta-readme-layout">
        <aside class="kta-readme-toc-sidebar" id="kta-readme-toc-sidebar"></aside>
        <div class="kta-readme-modal-corps" id="kta-readme-corps-scroll">
          <div class="kta-readme-corps">${html}</div>
        </div>
        <button class="kta-readme-back-top" id="kta-readme-back-top" type="button" aria-label="Retour en haut" title="Retour en haut">↑</button>
      </div>
      <div class="kta-readme-modal-footer">
        <span class="kta-readme-modal-by">Développé par <img src="icon/karma.png" alt="KARMA"></span>
        <!-- 🆕 v1.9.2-fix17 (KARMA "rajoute dans le footer de la doc nos
             nouvelles citations") : élargi pour citer toutes les
             dépendances/algos majeurs, en cohérence avec le splash et
             le footer du home. -->
        <span>— 🍃 Leaflet · 📦 JSZip · 🧭 Dijkstra</span>
      </div>
    </div>
  `;
  document.documentElement.appendChild(modal);

  // === ÉTAT INITIAL DU SOMMAIRE ===
  // - Pref user mémorisée si présente
  // - Sinon : visible par défaut sur écrans larges (≥ 1100px), masqué sur écrans étroits
  const layout = modal.querySelector("#kta-readme-layout");
  const toggleBtn = modal.querySelector("#kta-readme-toc-toggle");
  let tocVisible;
  try {
    const saved = localStorage.getItem("kta_readme_toc_visible");
    tocVisible = (saved !== null)
      ? (saved === "true")
      : (window.innerWidth >= 1100);
  } catch(e) {
    tocVisible = window.innerWidth >= 1100;
  }
  if (layout) layout.classList.toggle("toc-hidden", !tocVisible);
  if (toggleBtn) toggleBtn.classList.toggle("active", tocVisible);

  if (toggleBtn && layout) {
    toggleBtn.addEventListener("click", function() {
      const nowVisible = layout.classList.toggle("toc-hidden");
      // toc-hidden true = sommaire CACHÉ (logique inversée de tocVisible)
      const isVisibleNow = !nowVisible;
      toggleBtn.classList.toggle("active", isVisibleNow);
      try { localStorage.setItem("kta_readme_toc_visible", isVisibleNow ? "true" : "false"); } catch(e) {}
    });
  }

  document.getElementById("kta-readme-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
}

// =========================
// AIDE — modale plein écran
// =========================
function afficherAide() {
  const existing = document.getElementById("kta-aide-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id = "kta-aide-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-aide-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">❓ Aide — Référence des boutons</span>
        <button class="kta-panneau-close" id="kta-aide-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps kta-aide-corps">

        <p class="kta-aide-intro">
          La barre latérale droite est organisée en groupes déroulables.
          Un seul groupe peut être ouvert à la fois — cliquer sur un autre referme le précédent.
        </p>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📚 Aide / Doc / Légende</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">❓</span><span>Cette aide — référence des boutons</span>
            <span class="kta-aide-icone">📖</span><span>Documentation utilisateur</span>
            <span class="kta-aide-icone">🤖</span><span>Aide IA — télécharge un fichier contexte à coller dans ChatGPT/Claude/Gemini/etc.</span>
            <span class="kta-aide-icone">🗺️</span><span>Légende des icônes du plan</span>
            <span class="kta-aide-icone">🚨</span><span>Alerte publique (bouton du loader, à gauche du 📖) — affiche l'alerte en cours, ou "Aucune alerte en cours" si la situation est OK</span>
            <span class="kta-aide-icone">🔒</span><span><strong>Verrouiller l'application</strong> (v1.14.11, bouton du loader, à droite du ⚙️) — si un code d'accès local est configuré, stoppe les modules actifs et relance MyKTAMap : la gate PIN s'affiche au boot et le code doit être ressaisi pour reprendre. Si aucun code n'est configuré, une modale invite à en créer un depuis ⚙️ Configuration.</span>
            <span class="kta-aide-icone">🏷️</span><span>Badge version (footer du loader) — clique pour voir la modale de mise à jour ou les notes de la version installée. Clignote en bleu si une nouvelle version est dispo.</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff8a5c;">🚨 Alertes publiques :</strong> si l'auteur diffuse une alerte (incendie, fermeture, gaz toxiques...),
            une modale rouge pulsante apparaît automatiquement après le splash, avec titre, message et consignes. 3 niveaux possibles :
            <strong>emergency</strong> (rouge pulse, situation critique), <strong>warning</strong> (orange) ou <strong>info</strong> (bleu).
            Le bouton <strong>🚨</strong> dans le header du loader permet de re-consulter l'alerte à tout moment, OU de vérifier
            "✅ Aucune alerte en cours" si la situation est revenue à la normale. Une fois "J'ai compris" cliqué, la modale ne réapparaît plus
            au reload tant que l'alerte est la même — sauf si l'auteur en publie une nouvelle.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⚙️ Paramètres</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⚙️</span><span>Réglages, calibrage de l'échelle, debug — réglages <strong>par plan</strong></span>
            <span class="kta-aide-icone">☀️</span><span><strong>Thème clair / sombre</strong> (v1.13.0, v1.14.2 reload) — bascule entre fond beige cataphile (clair) et fond noir nuit (sombre, défaut). Activable <strong>uniquement depuis la home → Configuration → ☀️ Activer le thème CLAIR</strong>. Le toggle déclenche un reload complet de l'app pour éviter les bugs résiduels d'affichage. Choix persisté globalement par appareil.</span>
            <span class="kta-aide-icone">🚀</span><span>Mode Performance ULTRA (dans ⚙️ Réglages) — pour les gros plans qui crashent</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Contient le bouton 🎯 pour calibrer l'échelle, 🐛 pour les logs détaillés. Depuis v1.7.3,
            <strong>le reset complet n'est plus ici</strong> — passe par ⚙️ Configuration sur la page d'accueil →
            💥 Tout réinitialiser. Idem pour le <strong>🔐 Code d'accès local (PIN/Face ID)</strong>
            qui n'est activable que depuis ⚙️ Configuration loader (par design).
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#f4c542;">🚀 Mode Performance ULTRA :</strong> section dans la modale ⚙️ Réglages pour les
            gros plans / appareils faibles. Active le toggle <strong>🚀 ULTRA</strong> pour appliquer 6 optims agressives d'un coup,
            ou ajuste individuellement : <strong>🪜 Décimer les tracés au dézoom</strong>, <strong>⚡ Désactiver animations zoom/pan</strong>
            (reload requis), <strong>🎯 Désactiver cercles intersections</strong> (seuil 50 vs 200), <strong>🚫 Désactiver popups
            sur calques de données</strong> (utilise 🔍 Recherche à la place), <strong>🐢 Auto-save lent</strong> (30s vs 1.5s),
            <strong>👁️ Ne rendre que les tracés visibles</strong> (viewport culling). Aucune optim ne touche à l'image (déjà
            gérée par le mode performance au chargement). Persistance globale en localStorage, conservée entre sessions.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🔍 Recherche unifiée <span style="font-size:10px; color:#8892a4; font-weight:400;">(Ctrl+K)</span></div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📍</span><span>Points (nom, id, tag, description, état)</span>
            <span class="kta-aide-icone">🛣️</span><span>Tracés (label, type, niveau M-LVL)</span>
            <span class="kta-aide-icone">⬛</span><span>Zones (type, niveau)</span>
            <span class="kta-aide-icone">🏛️</span><span>Structures (piliers, murs, fronts)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>Depuis v1.10.3 :</strong> la recherche couvre désormais 4 catégories.
            <strong>Raccourci clavier Ctrl+K</strong> (Cmd+K sur Mac) pour ouvrir/fermer instantanément.
            Résultats groupés par catégorie avec compteurs. Au clic : centre + flash visuel
            (cercle pour les points, polyline dashed pour les tracés, polygon transparent pour zones / piliers).
            Filtre par catégorie + calque + tag.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬇️ Charger / Import</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📥</span><span><strong>Importer</strong> (v1.14.5 unifié) — un seul bouton qui ouvre une modale à 2 cards : 📥 <strong>Session MyKTAMap</strong> (.json / .zip avec photos) ou 📤 <strong>GPX externe</strong> (TopoDroid, OsmAnd, Avenza, Strava, Garmin… nécessite calibrage GPS). Preview avant import, Ctrl+Z pour annuler.</span>
            <span class="kta-aide-icone">📊</span><span>Éditer un fichier JSON sous forme de tableau</span>
            <span class="kta-aide-icone">🗂️</span><span>Changer de plan (revenir au home)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Multi-plans :</strong> chaque plan que tu charges (serveur ou ZIP local) est mémorisé
            dans ta liste personnelle. Au retour sur le home, tu retrouves :
          </p>
          <ul style="font-size:12px; color:#8892a4; margin:4px 0 0 18px; line-height:1.6;">
            <li><strong style="color:#a8b3c8;">▶️ Reprendre</strong> — relance le dernier plan ouvert en 1 clic.</li>
            <li><strong style="color:#a8b3c8;">📅 Récents</strong> — les 5 derniers plans utilisés.</li>
            <li><strong style="color:#a8b3c8;">📂 Tous</strong> — l'ensemble de tes plans connus.</li>
            <li><strong style="color:#a8b3c8;">🌐</strong> = plan serveur · <strong style="color:#a8b3c8;">💾</strong> = plan ZIP local.</li>
            <li><strong style="color:#a8b3c8;">💾 Exporter / 📂 Importer</strong> ta liste pour la partager ou la migrer.</li>
          </ul>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Plans serveur</strong> — l'app détecte automatiquement les sous-dossiers
            de <code style="color:#cfd6e4;">data/</code> via <code style="color:#cfd6e4;">data/index.json</code>.
            Format minimal : <code style="color:#cfd6e4;">{ "plans": ["test1", "test2"] }</code>.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Plans locaux</strong> — au clic sur un plan local, l'app utilise
            la méthode de persistance choisie au chargement initial :
          </p>
          <ul style="font-size:12px; color:#8892a4; margin:4px 0 0 18px; line-height:1.6;">
            <li>
              <strong style="color:#6ce28a;">✅ Mémorisé</strong> — le ZIP est copié dans le navigateur
              (cochez <strong>« 💾 Mémoriser ce plan dans l'app »</strong> à l'import).
              Recharge en 0 clic, fonctionne <strong>même hors-ligne</strong> et sur <strong>mobile</strong>.
              Limite de stockage selon le navigateur (~50 Mo iOS, plusieurs Go Android/desktop).
            </li>
            <li>
              <strong style="color:#8cb4ff;">🔐 Accès permanent</strong> — Chrome/Edge desktop uniquement,
              via le bouton <strong>« 🔐 Autoriser l'accès permanent »</strong>. Le navigateur garde
              une référence vers le ZIP sur le disque (1 clic max après refresh).
            </li>
            <li>
              <strong style="color:#c0c8d8;">📁 Re-sélection</strong> — le ZIP est demandé à chaque clic
              (drag & drop ou clic sur la zone). Comportement par défaut sans persistance.
            </li>
          </ul>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">📱 Mobile</strong> — préférez <strong>« 💾 Mémoriser dans l'app »</strong>
            qui fonctionne partout. Pour une persistance maximale sur iPhone, installez l'app en
            <strong>PWA</strong> (Partager → Sur l'écran d'accueil) avant de mémoriser le plan.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🏗️ Créer / Modifier un plan</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🏗️</span><span>Ouvrir le générateur de plan (clic direct)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Permet de créer un nouveau plan ou de modifier un plan existant à partir d'une archive ZIP.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⏪ Historique (Undo / Redo) <span style="font-size:10px; color:#8892a4; font-weight:400;">(Ctrl+Z / Ctrl+Y)</span></div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⏪</span><span>Annuler la dernière action (Ctrl+Z) — jusqu'à 50 actions</span>
            <span class="kta-aide-icone">⏩</span><span>Rétablir l'action annulée (Ctrl+Y ou Ctrl+Shift+Z)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>Depuis v1.11.0 :</strong> couvre les 4 catégories d'annotations dessinables —
            ✏️ points, 🛣️ tracés, ⬛ zones, 🏛️ structures. Granularité atomique (1 clic = 1 annulable).
            Toast discret à chaque action. Boutons sidebar auto-grisés quand la pile est vide.
            Historique en RAM (perdu au reload), reset auto au changement de plan.
            <strong>⚠️ Photos exclues</strong> (suppression IDB irréversible).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🪫 Indicateur de batterie <span style="font-size:10px; color:#8892a4; font-weight:400;">(v1.12.0)</span></div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⚡</span><span>Chip header — en charge (vert)</span>
            <span class="kta-aide-icone">🪫</span><span>Chip header — en décharge (couleur selon niveau)</span>
            <span class="kta-aide-icone">🔋</span><span>Bloc 🔋 ÉTAT du mode urgence (level + état affichés en grand)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>3 points d'affichage</strong> : en-tête nouvelle interface (chip ⚡/🪫 à côté des compteurs session), footer modale 📋 Session active, bloc 🔋 ÉTAT mode urgence.
            <strong>Warnings graduels</strong> via toast à 20 % / 10 % / 5 % (1 fois par seuil par cycle de décharge).
            <strong>⚠️ Compatibilité limitée</strong> : Battery Status API dispo en Chromium uniquement (Android Chrome, PC Chrome/Edge).
            Sur Safari iOS et Firefox récents, l'API a été retirée pour des raisons de privacy — la chip est alors <strong>masquée</strong>, sans message d'erreur.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📊 Stats session enrichies <span style="font-size:10px; color:#8892a4; font-weight:400;">(v1.12.0)</span></div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📊</span><span>Bloc stats en tête de la modale 📋 Session active</span>
            <span class="kta-aide-icone">📋</span><span>Copier le résumé dans le presse-papier (texte plain, prêt pour Discord / SMS / mail)</span>
            <span class="kta-aide-icone">💾</span><span>Export TXT — télécharge un fichier .txt avec le résumé complet</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Affichage : total annotations, breakdown par type (📍 points · 🛣️ tracés · ⬛ zones · 🏛️ structures), <strong>distance cumulée</strong> des tracés (auto m → km), <strong>surface cumulée</strong> des zones (auto m² → ha), photos POI attachées, durée écoulée depuis le démarrage de session.
            En multi-niveau (M-LVL), un breakdown additionnel par niveau s'affiche.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🎬 Replay de session tracker <span style="font-size:10px; color:#8892a4; font-weight:400;">(v1.12.0)</span></div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🎬</span><span>Bouton Replay dans le groupe 🧭 Tracker — ouvre la modale plein écran</span>
            <span class="kta-aide-icone">▶️</span><span>Play / Pause / Restart / End — slider timeline + sélecteur de vitesse 0.5× → 10×</span>
            <span class="kta-aide-icone">⛶</span><span>Toggle mode compact (bottom sheet) ↔ mode normal — pour libérer la carte pendant le replay</span>
            <span class="kta-aide-icone">💾</span><span>Export CSV — fichier 5 colonnes <code>timestamp_ms_epoch,delta_ms_since_start,x_plan,y_plan,type</code> (+ <code>level</code> en M-LVL)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Pendant le tracking, l'app enregistre en interne une <strong>timeline</strong> des événements : démarrage, chaque pas PDR appliqué, chaque recalage.
            Au clic sur 🎬, tu rejoues ta session avec un marker mobile jaune.
            <strong>Trail multi-segments</strong> : les recalages (téléportations) sont sautés visuellement — pas de ligne droite artificielle.
            <strong>Raccourcis clavier</strong> : Espace = play/pause · ← → = seek 1s · Échap = fermer.
            Reset au changement de plan (RAM-only).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬆️ Enregistrer</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">💾</span><span>Enregistrer la session — modale avec 4 onglets : 🚀 Full · 🎨 Avancé · 🔄 Conversion · <strong>📡 Export externe (KMZ + GPX, v1.14.1)</strong></span>
            <span class="kta-aide-icone">🖼️</span><span>Exporter en PNG/JPG — modale avec mode Rapide / Avancé</span>
            <span class="kta-aide-icone">📤</span><span><strong>Exporter en PDF imprimable</strong> (v1.10.3) — A0 à A4 × portrait/paysage, légende positionnable dans un coin</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>📤 PDF v1.10.3 :</strong> 10 formats (A0/A1/A2/A3/A4 × portrait/paysage), choix
            des calques data + image au cas par cas, légende overlay 4-coins avec 3 tailles et 4 styles
            (dont 🆕 « Pro fond blanc » par défaut pour l'impression papier). Reprend la même
            chaîne de rendu que l'export PNG avancé pour cohérence visuelle parfaite.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Tracker</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">▶️⏹️</span><span>Démarrer / arrêter le tracking par capteurs (expérimental)</span>
            <span class="kta-aide-icone">📍</span><span>Mode recalage : clic sur la carte pour repositionner le marker. <strong>(v1.12.0)</strong> auto-close après click + retour boussole automatique</span>
            <span class="kta-aide-icone">🎬</span><span><strong>Replay de session tracker</strong> (v1.12.0) — slider timeline + play/pause + vitesse 0.5×→10× + export CSV. Mode compact auto au Play pour libérer la carte. Raccourcis Espace / ← → / Échap</span>
            <span class="kta-aide-icone">⛑️</span><span>Mode urgence "Je suis perdu" — estime la zone probable de ta position à partir de ta dernière position connue, du temps écoulé et d'indices visuels</span>
            <span class="kta-aide-icone">🚨</span><span><strong>Mode urgence "panique"</strong> (v1.10.1) — affichage XL position + cap boussole + minimap auto-focus + 🔋 batterie (v1.12.0) + toggle 🗺️ itinéraire (v1.12.0), pour retrouver ses repères vite en situation critique</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff5555;">🚨 Mode urgence "panique" :</strong> bouton rouge distinctif,
            <strong>différent</strong> du ⛑️ "Je suis perdu" (qui calcule une zone). Ici on suppose que tu sais où tu es
            (le tracker l'affiche) mais que <strong>tu paniques et tu as besoin d'infos vitales en gros</strong> :
            <strong>position XL</strong> (coords plan), <strong>cap boussole en gros</strong> (sens de marche, aiguille
            tournée), <strong>minimap auto-focus</strong> avec les <strong>roads / zones / structures du plan en arrière-plan</strong>
            (utile pour repérer chemins, sorties, dangers). Wake Lock automatique (l'écran ne s'éteint pas).
            Permissions capteurs auto-demandées si pas déjà accordées. Sortie via le ✕.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff8a5c;">⛑️ Mode urgence :</strong> sous-action orange distinctive. Tu indiques où tu étais (recherche
            d'un point existant, clic sur la carte ou position tracker), <strong>depuis combien de temps</strong>, et
            l'app dessine un <strong>cercle de recherche</strong> orange autour (rayon = <strong>vitesse × temps</strong>, sans marge).
            La vitesse se choisit via <strong>4 presets</strong> (segmented control) — <strong>mêmes valeurs que le mode
            itinéraire</strong> pour la cohérence : <strong>🍺 Bourré</strong> (2 km/h), <strong>🐌 Lente</strong>
            (3 km/h), <strong>🚶 Normale</strong> (5 km/h, défaut), <strong>🏃 Rapide</strong> (7 km/h).
            Temps écoulé max <strong>1h30</strong> (au-delà la zone devient immense et non pertinente).
            Tu peux ajouter des <strong>indices visuels</strong> ("bidon eau", "épure bélier"...) — l'app cherche ces mots
            dans le nom, la description et les tags des points du plan ; les indices qui matchent <strong>dans la zone</strong>
            apparaissent en violet pulsant, et leur <strong>barycentre</strong> donne une <strong>localisation probable affinée</strong>.
            Bouton <strong>👁️ Fermer</strong> ferme la modale en gardant la zone visible sur la carte (pour explorer).
            Bouton <strong>🗑️ Effacer la zone</strong> (dans les résultats) retire tout. Rapport texte copiable au
            presse-papiers (📋) pour partage offline (radio, SMS).
            Un accordion <strong>📚 Bonnes pratiques</strong> en haut de la modale regroupe les conseils essentiels
            (garde ton calme, reviens sur tes pas, cherche les axes principaux/roulages, utilise une boussole physique,
            économise ta lumière, préviens quelqu'un si tu captes du réseau, à ne pas faire). ⚠️ Estimation géométrique
            uniquement — ne remplace <strong>PAS</strong> une opération de secours réelle (fil d'Ariane, boussole,
            lampe de rechange, carte papier).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📐 Outils de mesure</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📐</span><span>Mesure de distance — clic pour poser des points, total affiché en bas-gauche (label <code>📐 Distance: X m</code>)</span>
            <span class="kta-aide-icone">⬛</span><span><strong>Mesure de surface</strong> (v1.12.0) — toggle 📏/⬛ dans le groupe, dessine un polygone, l'app calcule l'aire en m² via Shoelace (auto ha au-delà de 10 000 m²)</span>
            <span class="kta-aide-icone">📏</span><span>Distance totale des tracés — sous-action du groupe Tracés, panneau flottant avec filtres par type</span>
            <span class="kta-aide-icone">🗺️</span><span>Itinéraire — chemin le plus court entre 2 points ou plus en suivant les routes existantes</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">📏 Distance totale :</strong> ouvre un petit panneau bas-droite avec 3 cases à cocher
            (Principal / Secondaire / Chemin). Le total des longueurs des tracés cochés est affiché en mètres,
            et les tronçons inclus sont surlignés en magenta sur la carte. Inclut aussi les routes des calques
            de données visibles. <strong>Pas exporté dans la légende des images PNG.</strong>
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">🗺️ Itinéraire :</strong> ajoute des waypoints (clic sur la carte, recherche par nom/id/tag, ou bouton <strong>🧭 Ma position</strong> qui prend ta position tracker actuelle),
            l'app calcule le trajet le plus court en empruntant les routes existantes (session + calques de données, <strong>même les calques masqués</strong> — utile si les routes sont dessinées en dur sur le PNG et que tu veux gagner en perf).
            Le label en bas-gauche affiche la <strong>distance</strong>, le <strong>⏱️ temps estimé</strong> et le <strong>mode de vitesse actif</strong> (🍺 Bourré 2 km/h / 🐌 Lente 3 km/h / 🚶 Normale 5 km/h défaut / 🏃 Rapide 7 km/h, + 15 min de pause par point intermédiaire). Le mode se change via un segmented control dans la modale itinéraire et est persisté entre sessions.
            Le tracé apparaît en cyan néon avec un label de distance en bas-gauche. Au re-clic, la modale s'ouvre en
            <strong>mode navigation</strong> : boutons <strong>⏮️ Début</strong>, <strong>⏭️ Fin</strong>,
            <strong>🔁 Tour complet</strong>, et 🎯 par waypoint pour centrer la carte dessus.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#ffb266;">🚫 Contraintes d'évitement (depuis Karma_dev / v169) :</strong>
            <strong style="color:#a8b3c8;">⛔ Zone Inaccessible</strong> (groupe Zones) = contrainte <em>dure</em>, l'itinéraire ne passera jamais à travers, jamais relâchée.
            <strong style="color:#a8b3c8;">🚫 Préférences d'évitement</strong> (section repliable dans la modale itinéraire) = contrainte <em>souple</em> : points à éviter (recherche / ID / clic carte) + tags à éviter + marge (px, défaut 100). Si pas de chemin alternatif, l'app calcule quand même en passant à proximité et affiche un message orange <em>⚠️ Impossible d'éviter : X, Y</em>. Préférences persistées par plan en localStorage.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">✏️ Édition de points</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">✏️</span><span>Activer le mode ajout de point (clic sur la carte = nouveau point)</span>
            <span class="kta-aide-icone">📸</span><span>Photos attachées au point (max 5) — section dans la modale d'ajout/édition. Boutons 📷 Prendre / 🖼️ Galerie</span>
            <span class="kta-aide-icone">✏️</span><span>Modifier un point existant — bouton bleu dans la popup du marker (relance la même modale pré-remplie)</span>
            <span class="kta-aide-icone">🗑️</span><span>Effacer (dernier point ou tous les points)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#f4c542;">📸 Photos POI (depuis v1.10.0) :</strong> attache jusqu'à <strong>5 photos par point</strong>
            (caméra mobile via 📷 ou import galerie via 🖼️). Compression auto JPEG q85 max 1920px. <strong>100 % local en IndexedDB</strong>
            — jamais envoyé sur Internet. Miniatures 44×44 dans la popup du marker (tap → viewer plein écran avec pinch-zoom + pan +
            swipe horizontal pour naviguer entre photos). Inclues dans tous les exports (session ZIP + générateur ZIP plan) + restaurées
            automatiquement au re-import. 5e compteur 📸 dans le header + section dans la modale "📊 Détails de la session".
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🏛️ Structures (piliers + murs + fronts de taille)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🟡</span><span>Pilier 1ère masse (polygone, fill jaune)</span>
            <span class="kta-aide-icone">🟠</span><span>Pilier 2e masse (polygone, fill orange) — auto-taggé niveau -1 en M-LVL</span>
            <span class="kta-aide-icone">🔵</span><span>Mur (polygone, fill bleu)</span>
            <span class="kta-aide-icone">🟨</span><span>Front de taille 1ère masse (polyligne, trait jaune) — c'est une LIGNE, pas un polygone fermé</span>
            <span class="kta-aide-icone">🟧</span><span>Front de taille 2e masse (polyligne, trait orange) — auto-taggé niveau -1 en M-LVL</span>
            <span class="kta-aide-icone">🧹</span><span>Effacer (dernier point / dernière structure en cours OU fermée / 🎯 sélection au clic carte / toutes)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Cartographie de l'architecture souterraine</strong> : piliers porteurs (1ère/2e masse de
            calcaire), murs de soutènement, et fronts d'exploitation. Pour les polygones (piliers + murs), pose au moins 3 points
            puis re-clique sur l'icône allumée pour fermer. Pour les polylignes (fronts), pose au moins 2 points puis re-clique sur
            l'icône pour valider la ligne. Aucun effet pathfinder (lecture seule — c'est différent de la zone ⛔ Inaccessible qui
            bloque l'itinéraire).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🛣️ Tracés & Routes</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🟩</span><span>Tracer une route principale</span>
            <span class="kta-aide-icone">🟪</span><span>Tracer une route secondaire</span>
            <span class="kta-aide-icone">🟨</span><span>Tracer un chemin</span>
            <span class="kta-aide-icone">🪜</span><span>Jonction interniveau (magenta pointillé) — sous-action visible uniquement si le mode multi-niveau est activé. Bridge entre 2 niveaux pour le pathfinder.</span>
            <span class="kta-aide-icone">📏</span><span>Distance totale des tracés (panneau flottant avec filtres par type)</span>
            <span class="kta-aide-icone">🧹</span><span>Effacer (dernier point, dernier tracé ou tous)</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬛ Zones (remblais / effondrements / eau / inaccessible)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⬛</span><span>Tracer une zone de remblais</span>
            <span class="kta-aide-icone">🟥</span><span>Tracer une zone d'effondrement</span>
            <span class="kta-aide-icone">🟦</span><span>Tracer une zone d'eau</span>
            <span class="kta-aide-icone">⛔</span><span>Tracer une zone inaccessible (hachures rouge/noir) — bloque le pathfinder</span>
            <span class="kta-aide-icone">✅</span><span>Fermer la zone en cours (au moins 3 points)</span>
            <span class="kta-aide-icone">🧹</span><span>Effacer (dernier point, dernière zone ou toutes)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Pose au moins 3 points puis re-clique sur le 1er point pour fermer la zone, ou utilise le bouton ✅.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🚀 Optimiser un plan</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            Plan léger = chargement rapide, navigation fluide, moins de risque de crash mémoire mobile.
            <strong>Conseils principaux :</strong>
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🖼️</span><span><strong>Image base</strong> ≤ 8 000 px de côté, format <strong>JPEG qualité 85</strong> (5-10× plus léger que PNG)</span>
            <span class="kta-aide-icone">🗂️</span><span><strong>1 seul calque image</strong> idéalement — fusionne légendes/repères dans le PNG base</span>
            <span class="kta-aide-icone">🛣️</span><span><strong>Routes nombreuses</strong> ? Dessine-les dans le PNG + masque le calque JSON. Le pathfinder utilise les routes même masquées</span>
            <span class="kta-aide-icone">📍</span><span><strong>Points denses</strong> ? Sépare-les en plusieurs calques toggleables (puits / passages / élec…)</span>
            <span class="kta-aide-icone">⚡</span><span><strong>Mode perf</strong> : 🎯 Équilibré sur mobile moderne, ⚡ Performance sur vieux device</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            Plus de détails et chiffres précis dans la <strong>Documentation 📖</strong> (groupe 📚 Aide / Doc) section "Optimiser ton plan pour la performance".
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🔐 Code d'accès local (PIN / Face ID)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🔐</span><span>Verrouillage optionnel de l'app à chaque démarrage (depuis v1.10.0)</span>
            <span class="kta-aide-icone">🤳</span><span>Biométrie Face ID / Touch ID / Windows Hello si l'appareil le supporte (WebAuthn natif)</span>
            <span class="kta-aide-icone">🚫</span><span>5 tentatives ratées = lockout définitif. Aucune recovery en cas d'oubli.</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#f4c542;">À activer depuis la page d'accueil uniquement :</strong>
            ⚙️ Configuration → 🔐 Code d'accès local → bouton "🔐 Activer le code d'accès". Saisis un PIN
            4-6 chiffres, confirme, puis accepte la biométrie si proposée. Au prochain démarrage, l'app
            te demandera ton code avant d'ouvrir.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#ff8a5c;">⚠️ Note importante :</strong> c'est une <strong>barrière d'usage</strong>,
            PAS un chiffrement des données. Les photos et sessions restent en clair en stockage local du navigateur.
            Le PIN est haché côté client (SHA-256 + sel random) et jamais envoyé sur Internet.
            <strong>Note bien ton code</strong> — aucune recovery possible en cas d'oubli (no backend, no email reset).
            En lockout : seules solutions = réinstaller l'app (perte session + plans non mémorisés) OU contacter
            l'auteur (qui ne pourra rien faire, c'est cohérent avec la philo no-backend).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">💡 Astuces</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>Modes exclusifs</strong> : Mesure, Ajout de point, Recalage et Tracés sont mutuellement
            exclusifs — activer l'un désactive automatiquement les autres.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>Mode actif</strong> : tant qu'un mode est actif, son groupe reste ouvert pour permettre
            l'accès direct aux actions secondaires (effacer le dernier point par exemple).
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0; line-height:1.5;">
            <strong>Icône qui change</strong> : l'icône principale du groupe reflète le mode actif (par exemple
            🟩 sur le bouton Tracés quand un tracé principal est en cours, ou 📍 sur le Tracker pendant le recalage).
          </p>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);
  document.getElementById("kta-aide-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
}

// =========================
// CHANGER DE PLAN — overlay modal
// =========================
function afficherPopupChangerPlan() {
  const existing = document.getElementById("popupChangerPlan");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "popupChangerPlan";
  overlay.className = "kta-readme-modal-overlay";

  overlay.innerHTML = `
    <div class="kta-modal" style="max-width:400px;">
      <div class="kta-modal-icon">🗂️</div>
      <div class="kta-modal-titre">Changer de plan</div>
      <div class="kta-modal-texte">
        Tu vas quitter la session en cours pour revenir à la liste de tes plans.<br>
        <strong>Les données non exportées seront perdues.</strong>
      </div>
      <div class="kta-modal-actions">
        <button class="kta-btn kta-btn-ghost" id="popupResterIci">Rester ici</button>
        <button class="kta-btn kta-btn-primary" id="popupChargerPlan">📚 Mes plans</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);
  document.getElementById("popupResterIci").addEventListener("click", function () { overlay.remove(); });
  document.getElementById("popupChargerPlan").addEventListener("click", function () {
    overlay.remove();
    if (window.afficherLoader) window.afficherLoader();
  });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
}

// =========================
// 🚀 PERF ULTRA — section de toggles dans la modale Réglages
// =========================
// Génère le HTML de la section "🚀 Mode Performance ULTRA" avec :
//   - Toggle master "🚀 ULTRA" (preset qui active les 6 ensemble)
//   - 6 toggles individuels pour ajustement fin par power users
// Le binding des change events se fait dans _bindPerfUltraToggles après render.
function _renderPerfUltraSection() {
  if (!window.PerfUltra) return "";
  const s = window.PerfUltra.getAll();
  function row(id, label, value, hint, danger) {
    return `
      <label class="kta-perf-ultra-row${danger ? " kta-perf-ultra-row-danger" : ""}">
        <input type="checkbox" id="${id}" ${value ? "checked" : ""}>
        <span class="kta-perf-ultra-text">
          <span class="kta-perf-ultra-label">${label}</span>
          ${hint ? `<span class="kta-perf-ultra-hint">${hint}</span>` : ""}
        </span>
      </label>`;
  }
  return `
    <div class="kta-aide-section">
      <div class="kta-aide-section-titre">🚀 Mode Performance ULTRA</div>
      <p style="font-size:11.5px; color:#8892a4; margin:0 0 10px 0; line-height:1.5;">
        Pour les gros plans / appareils faibles. Active <strong>🚀 ULTRA</strong> pour appliquer
        les optims d'un coup, ou ajuste individuellement chaque levier. Les changements
        s'appliquent à la volée — sauf les options marquées d'un <span style="color:#ffb380;">liseré orange</span>
        qui nécessitent un reload du plan pour prendre effet.
      </p>
      ${row("cfg_perf_ultra", "🚀 Mode ULTRA (active tout)", s.ultra,
            "Préset qui active les 7 toggles ci-dessous. Décocher = désactive tout.")}
      <div style="border-top:1px solid rgba(255,255,255,0.08); margin:10px 0; padding-top:8px;"></div>
      ${row("cfg_perf_decim", "🪜 Décimer les tracés au dézoom", s.decim,
            "Simplifie les polylines via Ramer-Douglas-Peucker. Tracés moins lisses au dézoom mais bien plus rapides.")}
      ${row("cfg_perf_animOff", "⚡ Désactiver animations zoom/pan", s.animOff,
            "Pan/zoom instantanés au lieu d'animés. <strong>Reload requis</strong> après changement.", true)}
      ${row("cfg_perf_noIntersect", "🎯 Désactiver cercles intersections (gros plans)", s.noIntersect,
            "Seuil abaissé à 50 routes (vs 200 normal). Pas de cercles aux carrefours au-delà.")}
      ${row("cfg_perf_noTooltips", "🚫 Désactiver popups sur calques données", s.noTooltips,
            "Plus de popup au clic sur les markers des calques de données. Les points session restent interactifs. Utilise 🔍 pour interagir.")}
      ${row("cfg_perf_slowSave", "🐢 Auto-save lent (30s)", s.slowSave,
            "Sauvegarde automatique toutes les 30s au lieu de 1.5s. Risque de perdre ~30s de modifs si crash.")}
      ${row("cfg_perf_viewportCull", "👁️ Ne rendre que les tracés visibles", s.viewportCull,
            "Saute les routes hors viewport. Pop-in léger au pan mais énorme gain sur plans denses.")}
      ${row("cfg_perf_mobileZoomLimit", "🛡️ Limiter le dézoom sur mobile (anti-crash mémoire)", s.mobileZoomLimit,
            "<strong>Coché par défaut</strong>. Sur smartphone, plafonne le dézoom max pour éviter le crash OOM quand Leaflet tente de rendre l'image entière au minZoom. <strong>Décocher</strong> = autorise le même dézoom max que sur PC (utile pour vue d'ensemble), mais risque de crash sur gros plans. <strong>Reload requis</strong> après changement.", true)}
    </div>`;
}

// Binding des change events sur les toggles PerfUltra après render.
function _bindPerfUltraToggles() {
  if (!window.PerfUltra) return;
  const ultraEl = document.getElementById("cfg_perf_ultra");
  if (ultraEl) {
    ultraEl.addEventListener("change", function() {
      window.PerfUltra.setUltra(ultraEl.checked);
      // Re-render la section pour refléter les nouveaux états individuels
      const m = document.getElementById("kta-cfg-modal");
      if (m) { m.remove(); afficherConfig(); }
    });
  }
  const map = {
    "cfg_perf_decim":           "decim",
    "cfg_perf_animOff":         "animOff",
    "cfg_perf_noIntersect":     "noIntersect",
    "cfg_perf_noTooltips":      "noTooltips",
    "cfg_perf_slowSave":        "slowSave",
    "cfg_perf_viewportCull":    "viewportCull",
    "cfg_perf_mobileZoomLimit": "mobileZoomLimit"
  };
  Object.keys(map).forEach(function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", function() {
      window.PerfUltra.set(map[id], el.checked);
      // Sync visuel du master ULTRA (coché si tous les autres le sont)
      if (ultraEl) ultraEl.checked = window.PerfUltra.isUltra();
    });
  });
}

// =========================
// 🏗️ MULTI-NIVEAU — section toggle dans Réglages (depuis v148)
// =========================
// Toggle "opt-in" par plan : quand activé, l'UI affiche un selecteur de
// niveau dans le groupe Tracés + une sous-action 🪜 Jonction interniveau.
// Quand désactivé (defaut), aucun changement visible → retro-compat absolue
// avec les plans existants v147 et avant.
// Le toggle ecrit dans PlanRegistry[planId].multiLevel (pas dans
// localStorage global) → persistance par plan, comme perfPreset.
function _renderMultiLevelSection() {
  const planId = window._currentLoadedPlanId;
  // Si on est dans le contexte d'un plan charge → on lit la valeur. Sinon
  // (cas improbable, modale ouverte hors chargement) → false.
  const enabled = !!(planId && window.PlanRegistry && typeof window.PlanRegistry.getMultiLevel === "function"
    && window.PlanRegistry.getMultiLevel(planId));
  return `
    <div class="kta-aide-section">
      <div class="kta-aide-section-titre">🏗️ Mode multi-niveau (avancé)</div>
      <p style="font-size:11.5px; color:#8892a4; margin:0 0 10px 0; line-height:1.5;">
        Active la gestion des niveaux (étages) pour les carrières multi-étages.
        Ajoute un sélecteur de niveau dans le groupe <strong>🛣️ Tracés</strong> +
        une sous-action <strong>🪜 Jonction interniveau</strong>. Les roads existantes
        sans niveau explicite sont automatiquement considérées comme niveau 0.
        <br><strong style="color:#c8d0e0;">Désactivé par défaut</strong> — uniquement
        pour les plans qui le nécessitent (Glacière, Capucins, etc.).
      </p>
      <label class="kta-perf-ultra-row">
        <input type="checkbox" id="cfg_multiLevel" ${enabled ? "checked" : ""}>
        <span class="kta-perf-ultra-text">
          <span class="kta-perf-ultra-label">🏗️ Activer le mode multi-niveau pour ce plan</span>
          <span class="kta-perf-ultra-hint">Persisté par plan. Reload requis pour que les changements UI soient visibles dans la sidebar.</span>
        </span>
      </label>
    </div>`;
}

// Binding du toggle multi-niveau apres render. Sauvegarde dans PlanRegistry,
// applique au state runtime (APP_CONFIG.multiLevel) immediatement pour les
// rerenders ne necessitant pas de reload.
function _bindMultiLevelToggle() {
  const el = document.getElementById("cfg_multiLevel");
  if (!el) return;
  el.addEventListener("change", function() {
    const planId = window._currentLoadedPlanId;
    if (!planId || !window.PlanRegistry || typeof window.PlanRegistry.setMultiLevel !== "function") {
      console.warn("[Config] setMultiLevel indisponible (planId ou PlanRegistry manquant)");
      return;
    }
    const newVal = !!el.checked;
    window.PlanRegistry.setMultiLevel(planId, newVal);
    // Applique au runtime immédiatement → permet aux re-renders (renderRoads,
    // initInterface si re-appellé) de prendre le bon filtre. Le user verra le
    // selecteur de niveau apparaitre/disparaitre seulement apres reload car
    // initInterface() crée les sous-actions une seule fois au boot.
    APP_CONFIG.multiLevel = newVal;
    if (newVal) {
      APP_CONFIG.activeLevel   = 0;
      APP_CONFIG.visibleLevels = [0];
      document.body.classList.add("kta-multilevel-active");
    } else {
      document.body.classList.remove("kta-multilevel-active");
    }
    window.APP_CONFIG = APP_CONFIG;
    if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    console.log("[Config] multiLevel →", newVal, "(plan", planId + ")");
  });
}

// =========================
// CONFIG — modale plein écran
// =========================
function afficherConfig() {
  const existing = document.getElementById("kta-cfg-modal");
  if (existing) { existing.remove(); return; }

  const c = APP_CONFIG;

  // Métadonnées du preset perf actif (pour l'affichage read-only)
  const _PRESET_LABELS = {
    "off":         { emoji: "💤", label: "Désactivé" },
    "auto":        { emoji: "🔄", label: "Auto" },
    "quality":     { emoji: "🌟", label: "Qualité" },
    "balanced":    { emoji: "🎯", label: "Équilibré" },
    "performance": { emoji: "⚡", label: "Performance" }
  };
  const presetMeta = _PRESET_LABELS[c.perfPreset] || _PRESET_LABELS.auto;

  const modal = document.createElement("div");
  modal.id = "kta-cfg-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-cfg-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">⚙️ Réglages</span>
        <button class="kta-panneau-close" id="kta-cfg-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps kta-cfg-corps">

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Position initiale du tracker</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">Position X</label>
            <input class="kta-cfg-input" id="cfg_startX" type="number" value="${c.startX}">
            <label class="kta-cfg-label">Position Y</label>
            <input class="kta-cfg-input" id="cfg_startY" type="number" value="${c.startY}">
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">👣 Détection des pas</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">Échelle (px/m)</label>
            <div style="display:flex; gap:6px; align-items:center;">
              <input class="kta-cfg-input" id="cfg_scale" type="number" step="0.1" value="${c.scale}" style="flex:1;">
              <button type="button" class="kta-btn kta-btn-ghost"
                onclick="ouvrirCalibrageEchelle()"
                style="padding:6px 10px; font-size:13px; white-space:nowrap;"
                title="Calculer l'échelle à partir d'une mesure réelle">🎯</button>
            </div>
            <label class="kta-cfg-label">Taille d'un pas (m)</label>
            <input class="kta-cfg-input" id="cfg_stepLength" type="number" step="0.1" value="${c.stepLength}">
            <label class="kta-cfg-label">Seuil de détection</label>
            <input class="kta-cfg-input" id="cfg_stepThreshold" type="number" step="0.1" value="${c.stepThreshold}">
            <label class="kta-cfg-label">Cooldown (ms)</label>
            <input class="kta-cfg-input" id="cfg_stepCooldown" type="number" value="${c.stepCooldown}">
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🔍 Affichage</div>
          <label class="kta-perf-ultra-row kta-perf-ultra-row-danger" style="margin-top:0;">
            <input type="checkbox" id="cfg_scaledMarkers" ${c.scaledMarkers !== false ? "checked" : ""}>
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">📐 Adapter la taille des icônes au zoom</span>
              <span class="kta-perf-ultra-hint">
                Coché par défaut : les icônes des points rétrécissent quand tu dézoomes
                (taille relative au plan constante). <strong>Décocher</strong> = comportement Leaflet
                standard (icônes taille écran fixe, elles deviennent énormes au dézoom).
                <strong>Reload requis</strong> après changement.
              </span>
            </span>
          </label>
          <!-- 🆕 v1.9.2 : le toggle "⚪ Afficher les ronds aux intersections
               de tracés" était initialement aussi ici, retiré sur feedback
               KARMA "enleve du menu carte la possibilité activer ou non les
               rond, reste uniquement sur le home". L'option reste accessible
               UNIQUEMENT depuis ⚙️ Configuration du loader/home (cf. index.html
               > #loaderShowIntersectionsCb). Logique : c'est une pref d'affichage
               qui survit aux changements de plan, son toggle "à la racine" suffit. -->
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🛠️ Debug</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">Logs détaillés</label>
            <select class="kta-cfg-input" id="cfg_debugMode">
              <option value="true"  ${c.debugMode ? "selected" : ""}>Oui</option>
              <option value="false" ${!c.debugMode ? "selected" : ""}>Non</option>
            </select>
          </div>

          <div style="display:flex; align-items:center; gap:12px; margin-top:12px;">
            <div style="flex:1;">
              <div style="font-size:13px; font-weight:600; color:#e8eaf0;">Mode performance</div>
              <div style="font-size:11px; color:#8892a4; margin-top:2px;">Modifiable au chargement du plan</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:rgba(255,255,255,0.04); border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
              <span style="font-size:22px;">${presetMeta.emoji}</span>
              <span style="font-size:15px; font-weight:600; color:#e8eaf0;">${presetMeta.label}</span>
            </div>
          </div>
        </div>

        ${_renderPerfUltraSection()}

        <!-- 🎨 Affichage : choix interface (nouvelle = défaut depuis
             v1.8.1-refonte-8, ancienne = opt-in pour conservateurs ou
             en cas de bug bloquant sur la refonte). -->
        <div class="kta-aide-section">
          <div class="kta-perf-titre">🎨 Affichage</div>
          <label class="kta-net-paranoia-toggle" style="background: rgba(140, 180, 255, 0.06); border-color: rgba(140, 180, 255, 0.22);">
            <input type="checkbox" id="kta-cfg-legacy-cb" ${window._refonteInterfaceActive === true ? "" : "checked"}>
            <span><strong>📜 Utiliser l'ancienne interface (classique v1.8.x)</strong> — par défaut tu utilises la <strong>nouvelle interface</strong> (header bar avec compteurs, sidebars unifiées gauche/droite, status bar). Coche cette case si tu préfères l'ancienne (icônes empilées sans header). <strong>Reload requis</strong> au toggle.</span>
          </label>
        </div>

        <!--
          🆕 v1.7.3 (suite KARMA) : bouton 🗑️ Réinitialiser RETIRÉ de la modale ⚙️
          Réglages en mode carte. Le reset complet reste accessible UNIQUEMENT
          depuis la modale ⚙️ Configuration du loader (home). Raison : limiter
          les déclenchements accidentels une fois un plan chargé (l'user perd
          potentiellement sa session active + tous ses plans mémorisés en 2 clics).
          Pour reset depuis la map : passer par 🗂️ titre cliquable → home → ⚙️
          Configuration → 💥 Tout réinitialiser.
        -->
        <div class="kta-cfg-actions-bar">
          <button class="kta-btn kta-btn-ghost"   onclick="resetConfig()">Reset</button>
          <button class="kta-btn kta-btn-primary"  onclick="appliquerConfig()">Appliquer</button>
          <button class="kta-btn kta-btn-ghost"    onclick="afficherLogsDebug()">🐛 Logs</button>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);
  document.getElementById("kta-cfg-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });

  // 🚀 PerfUltra : bind les change events sur les toggles de la section Perf Ultra
  _bindPerfUltraToggles();

  // 🎨 Affichage : toggle "Utiliser l'ancienne interface" (LEGACY).
  // Sémantique inversée depuis v1.8.1-refonte-8 :
  //   - case cochée  = ancienne interface (legacy)
  //   - case décochée = nouvelle interface (refonte, défaut)
  // RefonteInterface.setActive(value) prend la valeur DE LA NOUVELLE
  // interface (true = nouvelle, false = legacy). Donc on l'appelle avec
  // !checkbox.checked.
  const legacyCb = document.getElementById("kta-cfg-legacy-cb");
  if (legacyCb) {
    legacyCb.addEventListener("change", function() {
      const wantNouvelle = !legacyCb.checked;  // cochée = legacy, donc !cochée = nouvelle
      if (window.RefonteInterface && typeof window.RefonteInterface.setActive === "function") {
        // 🆕 v1.9.2-fix4 : setActive retourne une Promise (modale charte).
        // On revert le checkbox si l'utilisateur annule (Plus tard / ✕ /
        // backdrop / Échap) — le flag n'a PAS été écrit dans ce cas.
        const result = window.RefonteInterface.setActive(wantNouvelle);
        if (result && typeof result.then === "function") {
          result.then(function(confirmed) {
            if (!confirmed) {
              legacyCb.checked = (window._refonteInterfaceActive !== true);
            }
          });
        } else {
          // Fallback ancien API sync (sécurité)
          legacyCb.checked = (window._refonteInterfaceActive !== true);
        }
      } else {
        // Fallback (module non chargé) — set direct localStorage
        try {
          if (wantNouvelle) localStorage.removeItem("myktamap_legacy_interface");
          else              localStorage.setItem("myktamap_legacy_interface", "1");
        } catch(e) {}
        if (confirm("Interface " + (wantNouvelle ? "nouvelle" : "ancienne") + " au prochain démarrage. Recharger ?")) {
          location.reload();
        }
      }
    });
  }

  // 🏗️ Multi-niveau : section UI retirée v1.7.3 (KARMA) — activation
  // uniquement via le générateur de plan désormais. Les fonctions
  // _renderMultiLevelSection et _bindMultiLevelToggle restent définies
  // dans le code pour rétro-compat (lecture) mais ne sont plus appelées.
  // La cascade APP_CONFIG.multiLevel ← PlanRegistry[id].multiLevel ← PLAN_CONFIG.plan.multiLevel
  // reste fonctionnelle (cf §26 CLAUDE.md) — un user qui avait toggle via
  // Réglages avant v1.7.3 garde son état persisté en PlanRegistry.
}

function appliquerConfig() {
  APP_CONFIG.scale         = parseFloat(document.getElementById("cfg_scale").value);
  APP_CONFIG.stepLength    = parseFloat(document.getElementById("cfg_stepLength").value);
  APP_CONFIG.startX        = parseInt(document.getElementById("cfg_startX").value, 10);
  APP_CONFIG.startY        = parseInt(document.getElementById("cfg_startY").value, 10);
  APP_CONFIG.stepThreshold = parseFloat(document.getElementById("cfg_stepThreshold").value);
  APP_CONFIG.stepCooldown  = parseInt(document.getElementById("cfg_stepCooldown").value, 10);
  // ⚠️ Passer par setDebugMode() au lieu d'ecrire directement APP_CONFIG.debugMode :
  // ainsi le toast feedback (copyright.js > __MKM_showWarning__) se declenche
  // si l'utilisateur passe de OFF a ON via les Reglages.
  const newDebugMode = document.getElementById("cfg_debugMode").value === "true";
  if (typeof window.setDebugMode === "function") {
    window.setDebugMode(newDebugMode);
  } else {
    APP_CONFIG.debugMode = newDebugMode;
  }

  // 🔍 v174 : scaledMarkers (lu une fois à creerIcones + au hook zoom, reload requis)
  const cbScaled = document.getElementById("cfg_scaledMarkers");
  if (cbScaled) APP_CONFIG.scaledMarkers = !!cbScaled.checked;

  // 🆕 v1.9.2 : le handler de showRoadIntersections en mode carte a été retiré
  // (toggle exclusivement dans le ⚙️ Configuration du loader/home désormais).
  // La valeur reste lue depuis APP_CONFIG par road.js > renderRoads()
  // peu importe d'où elle a été modifiée.

  if (window.sauvegarderPrefsUtilisateur) sauvegarderPrefsUtilisateur();
  if (window.resetTrackingPosition) window.resetTrackingPosition();
  const modal = document.getElementById("kta-cfg-modal");
  if (modal) modal.remove();
  if (window.fermerPanneau) window.fermerPanneau();
}

function resetConfig() {
  Object.assign(APP_CONFIG, DEFAULT_CONFIG);
  if (window.sauvegarderPrefsUtilisateur) sauvegarderPrefsUtilisateur();
  if (window.resetTrackingPosition) window.resetTrackingPosition();
  const modal = document.getElementById("kta-cfg-modal");
  if (modal) modal.remove();
  if (window.fermerPanneau) window.fermerPanneau();
}

// =========================
// CALIBRAGE D'ÉCHELLE — produit en croix
// =========================
function ouvrirCalibrageEchelle() {
  const existing = document.getElementById("kta-calib-modal");
  if (existing) { existing.remove(); return; }

  // Lire la valeur actuelle du champ (pas APP_CONFIG, au cas où on l'a modifiée sans appliquer)
  const champScale = document.getElementById("cfg_scale");
  const scaleActuel = champScale ? parseFloat(champScale.value) : APP_CONFIG.scale;

  const modal = document.createElement("div");
  modal.id = "kta-calib-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:420px; height:auto; max-height:90vh;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">🎯 Calibrer l'échelle</span>
        <button class="kta-panneau-close" id="kta-calib-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <p style="font-size:13px; color:#8892a4; margin:0 0 14px; line-height:1.5;">
          Mesure une distance connue avec <strong>📐</strong>, puis renseigne ici la distance
          <strong>réelle</strong> (mesurée au sol). L'échelle sera recalculée automatiquement.
        </p>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📐 Valeurs</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">Échelle actuelle (px/m)</label>
            <input class="kta-cfg-input" id="calib_actuel" type="number" step="0.01" value="${scaleActuel}" readonly style="opacity:0.6;">

            <label class="kta-cfg-label">Distance affichée (m)</label>
            <input class="kta-cfg-input" id="calib_affichee" type="number" step="0.1" placeholder="ex: 100">

            <label class="kta-cfg-label">Distance réelle (m)</label>
            <input class="kta-cfg-input" id="calib_reelle" type="number" step="0.1" placeholder="ex: 150">
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧮 Résultat</div>
          <div style="background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px; font-family:'Courier New',monospace; font-size:13px;">
            <div style="color:#8892a4;">Nouvelle échelle :</div>
            <div id="calib_resultat" style="font-size:22px; color:#8cb4ff; font-weight:600; margin-top:4px;">—</div>
            <div id="calib_formule" style="font-size:11px; color:#6a7488; margin-top:6px;"></div>
          </div>
        </div>

        <div id="calib_erreur" class="kta-conv-erreur" style="display:none;"></div>

        <div class="kta-conv-actions" style="margin-top:14px;">
          <button class="kta-btn kta-btn-ghost"   id="calib_annuler">Annuler</button>
          <button class="kta-btn kta-btn-primary"  id="calib_appliquer" disabled>Appliquer</button>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  const inputAffichee = document.getElementById("calib_affichee");
  const inputReelle   = document.getElementById("calib_reelle");
  const resultatEl    = document.getElementById("calib_resultat");
  const formuleEl     = document.getElementById("calib_formule");
  const erreurEl      = document.getElementById("calib_erreur");
  const btnAppliquer  = document.getElementById("calib_appliquer");
  const btnAnnuler    = document.getElementById("calib_annuler");
  const btnClose      = document.getElementById("kta-calib-close");

  function fermer() { modal.remove(); }

  let nouveauScale = null;

  function recalculer() {
    erreurEl.style.display = "none";
    const aff = parseFloat(inputAffichee.value);
    const reel = parseFloat(inputReelle.value);

    if (!aff || !reel || aff <= 0 || reel <= 0) {
      resultatEl.textContent = "—";
      formuleEl.textContent  = "";
      btnAppliquer.disabled  = true;
      nouveauScale = null;
      return;
    }

    nouveauScale = scaleActuel * ( aff / reel );
    resultatEl.textContent = nouveauScale.toFixed(3) + " px/m";
    formuleEl.textContent  = scaleActuel + " × (" + aff + " / " + reel + ") = " + nouveauScale.toFixed(3);
    btnAppliquer.disabled  = false;
  }

  inputAffichee.addEventListener("input", recalculer);
  inputReelle.addEventListener("input", recalculer);

  btnClose.addEventListener("click", fermer);
  btnAnnuler.addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  btnAppliquer.addEventListener("click", function() {
    if (nouveauScale === null || nouveauScale <= 0) {
      erreurEl.textContent = "Valeur invalide";
      erreurEl.style.display = "block";
      return;
    }
    if (champScale) champScale.value = nouveauScale.toFixed(3);
    fermer();
  });

  setTimeout(function() { inputAffichee.focus(); }, 50);
}

// =========================
// VIDER LE CACHE APPLICATIF
// =========================
// 🆕 v1.9.3-B-side (KARMA "on modifie le test internet, doit être vers
// origin/ping.html, plus aucun appel externe vers Google. On assure le
// serveur dispo, SSL, Nginx avant Force update. On attend retour 'OK'").
//
// 🆕 v1.9.3-B-side-fix (KARMA "j'ai dit myktamap.fr dans le cadre de prod,
// mais ca doit etre origin, pour devmap ca doit attaquer l'url de dev") :
// PING_URL utilise location.origin DYNAMIQUEMENT au lieu d'un hardcode :
//   - Prod (myktamap.fr) → https://myktamap.fr/ping.html
//   - Dev  (devmap.is-underground.fr)   → https://devmap.is-underground.fr/ping.html
//   - Prod future (myktamap.fr)         → https://myktamap.fr/ping.html
//   - Local (localhost:8080)            → http://localhost:8080/ping.html
//
// Avantage same-origin : plus besoin de header CORS côté Nginx (le fetch
// est same-origin → la SOP autorise). On peut même retirer le mode "cors"
// explicite (default same-origin). Simplification déploiement : KARMA crée
// /ping.html UNE fois sur chaque serveur, ça marche partout.
//
// Vérification connexion Internet + disponibilité serveur MyKTAMap :
//   - timeout 5s, retourne Promise<boolean>
//   - navigator.onLine (rapide) en court-circuit si false
//   - fetch GET sur PING_URL same-origin
//   - body attendu : exactement "OK" (texte brut)
//
// Avantages vs ancien ping Google :
//   ✅ Plus AUCUN appel externe (cohérent avec privacy)
//   ✅ Si OK → on garantit DNS + SSL + Nginx + PWA peut pull
//   ❌ "Internet OK mais serveur down" est traité comme offline (voulu —
//      pas la peine d'updater si le serveur source du nouveau code est down)
const PING_URL = (typeof location !== "undefined" && location.origin)
  ? (location.origin + "/ping.html")
  : "/ping.html";  // fallback chemin relatif (très improbable)
const PING_EXPECTED_BODY = "OK";  // body attendu trim-comparé (case-insensitive)

function _pingInternet() {
  return new Promise(function(resolve) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Le navigateur est sûr d'être offline → on évite même le fetch
      resolve(false);
      return;
    }
    let done = false;
    const timer = setTimeout(function() {
      if (done) return;
      done = true;
      try { ctrl.abort(); } catch(e) {}
      resolve(false);
    }, 5000);
    const ctrl = new AbortController();
    // Same-origin par défaut (PING_URL = location.origin + "/ping.html").
    // Pas besoin de mode "cors" explicite → moins de friction Nginx.
    // credentials: "omit" pour ne pas envoyer de cookies (le ping n'a
    // pas besoin de session, garde la requête neutre).
    //
    // 🆕 Cache-bust ?_=Date.now() : même pattern que version.json /
    // alert.json (cf. CLAUDE.md §20). Garantit que le SW ne sert pas
    // une réponse cachée d'un précédent ping (= false positive si le
    // serveur est down maintenant mais OK avant). Chaque appel a une
    // URL unique → cache miss → fetch réseau forcé.
    const pingUrlCb = PING_URL + "?_=" + Date.now();
    fetch(pingUrlCb, {
      method: "GET",
      cache:  "no-store",
      signal: ctrl.signal,
      credentials: "omit"
    }).then(function(res) {
      if (!res.ok) {
        // Status HTTP non-2xx (404 si fichier absent, 5xx Nginx down, etc.)
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(false);
        return;
      }
      return res.text();
    }).then(function(body) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Body "OK" attendu (trim + uppercase pour tolérer "ok\n" ou " Ok ")
      const trimmed = (body || "").trim().toUpperCase();
      resolve(trimmed === PING_EXPECTED_BODY);
    }).catch(function() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(false);
    });
  });
}
// Expose globalement (consommé par d'autres modules, ex: sessionExporter
// onglet KMZ qui vérifie la connexion avant d'ouvrir un lien externe).
window._pingInternet = _pingInternet;
// Expose aussi l'URL résolue pour les messages d'erreur user-friendly.
window._pingInternetUrl = PING_URL;

// =========================
// 🔄 MISE À JOUR DOUCE — purge SW cache uniquement, préserve toutes les données
// =========================
// Différent de viderCacheAppli() qui fait table rase. Ici on ne touche QUE
// au cache PWA (assets HTTP) — la session, le registre de plans, l'IndexedDB
// et le localStorage restent intacts.
//
// Flow :
//   1. Quick ping Internet (5s) — sinon erreur claire avant de tout purger.
//   2. Demande au SW de skipWaiting si une nouvelle version attend.
//   3. Force reg.update() pour que le navigateur check sw.js sur le réseau.
//   4. Purge caches.keys() (cache PWA uniquement).
//   5. Reload — les nouveaux assets sont re-fetchés depuis le réseau.
//
// Préservé : localStorage (sessions, plans registry, prefs), IndexedDB (handles + blobs),
// sessionStorage, cookies, données utilisateur.
// =========================
async function mettreAJourCodeSeul() {
  // Affiche un overlay pendant l'opération pour que l'utilisateur voie
  // qu'il se passe quelque chose. Cette phase peut prendre 1-3s.
  const overlay = document.createElement("div");
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-modal">' +
      '<div class="kta-modal-icon">⏳</div>' +
      '<div class="kta-modal-titre">Mise à jour en cours…</div>' +
      '<div class="kta-modal-texte" id="kta-soft-update-status">Vérification de la connexion…</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);
  const status = document.getElementById("kta-soft-update-status");

  function _statusUpdate(txt) { if (status) status.innerHTML = txt; }

  try {
    // 1. Ping Internet — sans réseau le re-fetch va échouer après la purge
    _statusUpdate("Vérification de la connexion…");
    const online = await _pingInternet();
    if (!online) {
      overlay.remove();
      _softUpdateOfflineWarning();
      return;
    }

    // 2. Force le check + skipWaiting du SW
    _statusUpdate("Vérification de la version du Service Worker…");
    if (navigator.serviceWorker) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          try { await reg.update(); } catch(e) { console.warn("[Soft update] reg.update() :", e); }
          if (reg.waiting) {
            // Demande au SW en attente de prendre le relais sans attendre que tous
            // les clients soient fermés (notre sw.js fait déjà skipWaiting() au install,
            // mais on renforce ici en cas de SW custom dans le futur)
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        }
      } catch(e) {
        console.warn("[Soft update] erreur SW :", e);
      }
    }

    // 3. Purge des caches HTTP / PWA UNIQUEMENT (pas localStorage / IDB)
    _statusUpdate("Purge du cache des assets PWA…");
    if (window.caches) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(function(k) {
          console.log("[Soft update] suppression cache :", k);
          return caches.delete(k);
        }));
      } catch(e) {
        console.warn("[Soft update] purge caches :", e);
      }
    }

    // 4. Reload : le SW re-cache tout depuis le réseau au prochain démarrage
    _statusUpdate("Rechargement…");
    setTimeout(function() {
      window.location.reload();
    }, 400);

  } catch(err) {
    overlay.remove();
    console.error("[Soft update] erreur :", err);
    alert("Erreur pendant la mise à jour douce :\n" + (err.message || err) + "\n\nTu peux essayer le reset complet à la place.");
  }
}

// Avertissement spécifique offline pour la mise à jour douce.
// 🆕 v1.9.3-B-side (KARMA "rend le modal plus jolie pour l'erreur") :
// upgrade visuel — passage du style basique kta-modal (icône + titre + texte
// + un bouton OK) au style élaboré kta-oom-modal-boite (header big avec
// ⚠️ qui pulsent, sections 🔍 Causes / ⛔ Conséquence / ✅ Recommandation),
// strictement symétrique avec _resetFlowOfflineWarning. Sémantique adaptée :
//   - action ANNULÉE automatiquement (pas de bouton "Continuer quand même")
//     car relancer le soft update offline ferait le même crash
//   - ton rassurant ("aucune donnée perdue, app continue de fonctionner")
//     car contrairement au reset, on n'a touché à rien
function _softUpdateOfflineWarning() {
  const origin = (window._pingInternetUrl || "").replace(/\/ping\.html.*$/, "") || "https://myktamap.fr";
  const overlay = document.createElement("div");
  overlay.id = "kta-soft-update-offline";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-oom-modal-boite">' +
      '<div class="kta-readme-modal-header kta-oom-header">' +
        '<span class="kta-oom-titre-big">' +
          '<span class="kta-oom-warn-side">⚠️</span>' +
          '<span class="kta-oom-titre-text">PAS INTERNET OU SERVEUR INDISPO</span>' +
          '<span class="kta-oom-warn-side">⚠️</span>' +
        '</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-oom-corps">' +
        '<div class="kta-oom-intro">' +
          'La <strong>mise à jour douce</strong> a besoin de joindre le serveur ' +
          '<code>' + origin + '</code> pour télécharger les nouveaux fichiers (HTML, JS, CSS, icônes). ' +
          'Le ping de vérification a échoué — l\'opération est <strong>annulée</strong>.' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">🔍 Causes possibles</div>' +
          '<ul class="kta-oom-list">' +
            '<li>Pas de connexion Internet (Wi-Fi / 4G / 5G)</li>' +
            '<li>Serveur <code>' + origin + '</code> indisponible (maintenance, panne hébergeur)</li>' +
            '<li>Certificat SSL invalide ou DNS qui ne résout pas</li>' +
          '</ul>' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">✅ Bonne nouvelle</div>' +
          '<p>' +
            '<strong>Aucune donnée n\'a été supprimée.</strong> Le cache PWA, tes plans mémorisés, ' +
            'ta session en cours et tes préférences sont <strong>intacts</strong>. ' +
            'Tu peux continuer à utiliser l\'app normalement avec la version actuelle.' +
          '</p>' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">🔄 Recommandation</div>' +
          '<p>' +
            '<strong>Vérifie ta connexion Internet</strong> (Wi-Fi, 4G/5G) et que ' +
            '<code>' + origin + '</code> répond bien, puis relance la mise à jour depuis ' +
            '<strong>⚙️ Configuration → 🔄 Forcer la mise à jour</strong>.' +
          '</p>' +
        '</div>' +
      '</div>' +
      '<div class="kta-oom-actions" style="justify-content:center;">' +
        '<button class="kta-btn kta-btn-primary" id="kta-soft-update-offline-ok" type="button">✓ J\'ai compris</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);
  document.getElementById("kta-soft-update-offline-ok").addEventListener("click", function() {
    overlay.remove();
  });
  // Cohérent avec _resetFlowOfflineWarning : clic backdrop ferme aussi
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

function viderCacheAppli() {
  const cfgModal = document.getElementById("kta-cfg-modal");
  if (cfgModal) cfgModal.remove();

  // 1ère étape : check connexion Internet AVANT toute confirmation.
  // Affichage bref d'un "Vérification connexion…" pour pas avoir un
  // freeze silencieux de 5s si le réseau ne répond pas.
  const overlayPing = document.createElement("div");
  overlayPing.className = "kta-modal-overlay";
  overlayPing.innerHTML = '<div class="kta-modal"><div class="kta-modal-icon">📶</div><div class="kta-modal-titre">Vérification de la connexion…</div><div class="kta-modal-texte">Test de la connexion Internet (max 5s).</div></div>';
  document.documentElement.appendChild(overlayPing);

  _pingInternet().then(function(online) {
    overlayPing.remove();
    if (online) {
      _resetFlowConfirmation();
    } else {
      _resetFlowOfflineWarning();
    }
  });
}

// Affiche d'abord le warning insistant "PAS INTERNET OU SERVEUR INDISPO" en
// rouge (style cohérent avec la modale OOM), puis bascule sur le flow de
// double confirmation classique si l'utilisateur veut quand même continuer.
//
// 🆕 v1.9.3-B-side (KARMA "ca fonctionne en mise jours mais pas en mode tout
// reset, il devrait nous dire serveur indispo ou pas internet") : message
// aligné avec _softUpdateOfflineWarning car le ping cible désormais le serveur
// MyKTAMap (<origin>/ping.html), pas Google. Un échec peut signifier "pas
// d'internet" OU "serveur MyKTAMap indispo (DNS, SSL, Nginx, hébergeur)".
// Pour le reset, c'est encore plus critique : sans serveur joignable, le SW
// ne peut PAS re-cacher les assets → app inutilisable post-wipe.
function _resetFlowOfflineWarning() {
  const origin = (window._pingInternetUrl || "").replace(/\/ping\.html.*$/, "") || "https://myktamap.fr";
  const overlay = document.createElement("div");
  overlay.id = "kta-reset-offline";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-oom-modal-boite">' +
      '<div class="kta-readme-modal-header kta-oom-header">' +
        '<span class="kta-oom-titre-big">' +
          '<span class="kta-oom-warn-side">⚠️</span>' +
          '<span class="kta-oom-titre-text">PAS INTERNET OU SERVEUR INDISPO</span>' +
          '<span class="kta-oom-warn-side">⚠️</span>' +
        '</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-oom-corps">' +
        '<div class="kta-oom-intro">' +
          'Tu es sur le point de <strong>tout réinitialiser</strong> alors que le serveur ' +
          '<code>' + origin + '</code> est <strong>injoignable</strong>. ' +
          'L\'application a besoin de ce serveur pour redescendre ses fichiers (HTML, JS, CSS, icônes) après le wipe.' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">🔍 Causes possibles</div>' +
          '<ul class="kta-oom-list">' +
            '<li>Pas de connexion Internet (Wi-Fi / 4G / 5G)</li>' +
            '<li>Serveur <code>' + origin + '</code> indisponible (maintenance, panne hébergeur)</li>' +
            '<li>Certificat SSL invalide ou DNS qui ne résout pas</li>' +
          '</ul>' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">⛔ Conséquence si tu continues maintenant</div>' +
          '<ul class="kta-oom-list">' +
            '<li><strong>L\'app sera inutilisable</strong> tant que le serveur ne sera pas joignable à nouveau.</li>' +
            '<li>Le splash et le loader ne s\'afficheront même pas — le navigateur cherchera les fichiers, ne les trouvera plus en cache, et restera bloqué.</li>' +
            '<li>Tous tes plans mémorisés, ta session en cours et tes préférences seront <strong>perdus définitivement</strong>.</li>' +
          '</ul>' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">✅ Recommandation</div>' +
          '<p>' +
            '<strong>Vérifie ta connexion Internet</strong> (Wi-Fi, 4G/5G) et que <code>' + origin + '</code> ' +
            'répond bien, puis relance la réinitialisation. L\'app aura ainsi une chance de se recharger ' +
            'correctement après le wipe.' +
          '</p>' +
        '</div>' +
      '</div>' +
      '<div class="kta-oom-actions" style="justify-content:space-between;">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-reset-offline-annuler" type="button">Annuler</button>' +
        '<button class="kta-btn kta-btn-danger"  id="kta-reset-offline-forcer"  type="button">Continuer quand même</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);

  document.getElementById("kta-reset-offline-annuler").addEventListener("click", function() {
    overlay.remove();
  });
  document.getElementById("kta-reset-offline-forcer").addEventListener("click", function() {
    overlay.remove();
    _resetFlowConfirmation();
  });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

// 🗝️ v173 : mot de passe en clair affiché à l'écran de reset pour que
// l'user le retrouve avant de tout effacer (choix 6=a validé KARMA).
// ⚠️ Volontairement en clair ici (sinon impossible d'afficher à l'user).
// Le hash SHA-256 dans unlockGate.js reste la source de vérité pour la
// comparaison. Si on bumpe le mdp un jour : changer les 2 endroits ensemble.
const KTA_UNLOCK_PASSWORD_DISPLAY = "F!sYs44!h4z!3J";

function _resetFlowConfirmation() {
  const overlay1 = document.createElement("div");
  overlay1.className = "kta-modal-overlay";
  overlay1.innerHTML = `
    <div class="kta-modal">
      <div class="kta-modal-icon">⚠️</div>
      <div class="kta-modal-titre">Tout réinitialiser ?</div>
      <div class="kta-modal-texte">
        Cette action efface <strong>l'intégralité des données locales</strong> de l'application :
        <ul style="text-align:left; margin:10px 0; padding-left:20px;">
          <li>Cache PWA (assets, Service Worker)</li>
          <li>Liste de plans mémorisés (registre + ZIPs locaux)</li>
          <li>Session en cours (points / tracés / zones / structures / mesures)</li>
          <li>Préférences (mode performance, logs détaillés…)</li>
        </ul>
        <strong>Si vous utilisez l'app hors connexion, elle sera inutilisable jusqu'à la prochaine synchronisation.</strong>

        <div style="margin-top:14px; padding:10px 12px; background:rgba(244,197,66,0.08); border:1px solid rgba(244,197,66,0.30); border-radius:6px; text-align:left; font-size:13px;">
          🗝️ <strong style="color:#f4c542;">Code d'accès requis au redémarrage</strong><br>
          <span style="color:#c8d0e0;">Après reset, l'app redemandera le code d'accès communautaire :</span><br>
          <code style="display:inline-block; margin-top:6px; padding:4px 10px; background:#0a0d18; border:1px solid rgba(244,197,66,0.30); border-radius:4px; color:#f4c542; font-family:'SF Mono',Monaco,Consolas,monospace; font-size:14px; user-select:all;">${KTA_UNLOCK_PASSWORD_DISPLAY}</code>
          <br><span style="color:#8892a4; font-size:11.5px; font-style:italic;">Note-le ou copie-le avant de reset, sinon tu ne pourras plus rentrer dans l'app !</span>
        </div>
      </div>
      <div class="kta-modal-actions">
        <button class="kta-btn kta-btn-ghost" id="cache-annuler-1">Annuler</button>
        <button class="kta-btn kta-btn-danger" id="cache-continuer-1">Continuer →</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(overlay1);

  document.getElementById("cache-annuler-1").addEventListener("click", function () { overlay1.remove(); });
  document.getElementById("cache-continuer-1").addEventListener("click", function () {
    overlay1.remove();

    const overlay2 = document.createElement("div");
    overlay2.className = "kta-modal-overlay";
    overlay2.innerHTML = `
      <div class="kta-modal kta-modal-danger">
        <div class="kta-modal-icon">🚨</div>
        <div class="kta-modal-titre">Confirmation finale</div>
        <div class="kta-modal-texte">
          ⚠️ <strong>ATTENTION</strong> ⚠️<br><br>
          Cette action vide intégralement le cache du navigateur pour cette application.<br><br>
          <strong>Hors connexion → l'application sera hors service.</strong><br><br>
          Confirmez uniquement si vous êtes connecté à Internet.
        </div>
        <div class="kta-modal-actions">
          <button class="kta-btn kta-btn-ghost" id="cache-annuler-2">Annuler</button>
          <button class="kta-btn kta-btn-danger" id="cache-confirmer-2">🗑️ Vider maintenant</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay2);

    document.getElementById("cache-annuler-2").addEventListener("click", function () { overlay2.remove(); });
    document.getElementById("cache-confirmer-2").addEventListener("click", async function () {
      overlay2.remove();
      const overlayWait = document.createElement("div");
      overlayWait.className = "kta-modal-overlay";
      overlayWait.innerHTML = `<div class="kta-modal"><div class="kta-modal-icon">⏳</div><div class="kta-modal-titre">Nettoyage en cours…</div><div class="kta-modal-texte">Suppression de tout le stockage local + désinscription du Service Worker.</div></div>`;
      document.documentElement.appendChild(overlayWait);

      try {
        // 1) Service Worker
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(function(r) { return r.unregister(); }));
        }

        // 2) Caches HTTP / PWA
        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(function(name) { return caches.delete(name); }));
        }

        // 3) localStorage — wipe complet (tous les préfixes connus + clés inattendues)
        try { localStorage.clear(); } catch(e) { console.warn("[Reset] localStorage.clear :", e); }

        // 4) sessionStorage
        try { sessionStorage.clear(); } catch(e) { console.warn("[Reset] sessionStorage.clear :", e); }

        // 5) IndexedDB — toutes les bases (avec fallback Safari/Firefox qui n'a pas indexedDB.databases())
        try {
          if (indexedDB.databases) {
            const dbs = await indexedDB.databases();
            await Promise.all((dbs || []).map(function(db) {
              return new Promise(function(resolve) {
                if (!db.name) return resolve();
                const req = indexedDB.deleteDatabase(db.name);
                req.onsuccess = req.onerror = req.onblocked = function() { resolve(); };
              });
            }));
          } else {
            // Safari/Firefox : on ne peut pas lister, on supprime au moins les bases connues
            const knownDbs = ["myktamap_handles"];
            await Promise.all(knownDbs.map(function(name) {
              return new Promise(function(resolve) {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = req.onerror = req.onblocked = function() { resolve(); };
              });
            }));
          }
        } catch(e) { console.warn("[Reset] IndexedDB :", e); }

        overlayWait.remove();
        window.location.reload(true);
      } catch (err) {
        overlayWait.remove();
        const overlayErr = document.createElement("div");
        overlayErr.className = "kta-modal-overlay";
        overlayErr.innerHTML = `<div class="kta-modal"><div class="kta-modal-icon">❌</div><div class="kta-modal-titre">Erreur</div><div class="kta-modal-texte">Impossible de vider le cache :<br>${err.message || err}</div><div class="kta-modal-actions"><button class="kta-btn kta-btn-primary" id="cache-err-ok">OK</button></div></div>`;
        document.documentElement.appendChild(overlayErr);
        document.getElementById("cache-err-ok").addEventListener("click", function () { overlayErr.remove(); });
      }
    });
  });
}

// =========================
// GESTIONNAIRE DE MODES EXCLUSIFS
// =========================
const _modesActifs = {};

function _desactiverTousLesModes() {
  Object.values(_modesActifs).forEach(function(m) {
    try { m.desactiverFn(); } catch(e) {}
    m.btnEl.classList.remove("kta-actif");
  });
  Object.keys(_modesActifs).forEach(function(k) { delete _modesActifs[k]; });
}

function _activerMode(cle, btnEl, activerFn, desactiverFn) {
  const dejaActif = !!_modesActifs[cle];
  _desactiverTousLesModes();
  if (dejaActif) return;
  activerFn();
  btnEl.classList.add("kta-actif");
  _modesActifs[cle] = { btnEl, desactiverFn };
}

// =========================
// FERMETURE CIBLEE D'UN MODE (utilise par les onClicks suppression)
// =========================
// Quand une action de suppression efface le trace en cours (ou tous les
// traces), il faut imperativement fermer le mode actif : sinon le bouton
// reste "kta-actif" en surbrillance dans la sidebar, mais window.modeRoad
// vient d'etre reinitialise par resetRoads → clic sur la carte fait rien
// (state incoherent). Idem pour zones.
function _fermerModeRoad() {
  const m = _modesActifs["road"];
  if (!m) return;
  try { m.desactiverFn(); } catch(e) {}
  if (m.btnEl) m.btnEl.classList.remove("kta-actif");
  delete _modesActifs["road"];
}

function _fermerModeZone() {
  const m = _modesActifs["zone"];
  if (!m) return;
  try { m.desactiverFn(); } catch(e) {}
  if (m.btnEl) m.btnEl.classList.remove("kta-actif");
  delete _modesActifs["zone"];
}

// 🆕 v1.9.3-A1.a : symétrique pour les structures (piliers + murs).
// Appelée par les onClicks de suppression dans l'accordéon Structures
// quand une action de purge a vidé la structure en cours.
function _fermerModeStructure() {
  const m = _modesActifs["structure"];
  if (!m) return;
  try { m.desactiverFn(); } catch(e) {}
  if (m.btnEl) m.btnEl.classList.remove("kta-actif");
  delete _modesActifs["structure"];
}

// =========================
// AVERTISSEMENT TRACKER (popup au ▶️ Play)
// =========================
// Affiche une popup d'avertissement la PREMIÈRE FOIS que l'utilisateur clique
// ▶️ Play sur le tracker dans la session courante. Le flag est in-memory (pas
// de localStorage) → réaffiché au prochain reload, suffisant pour rappeler la
// non-fiabilité sans saouler pendant les tests.
//
// ⚠️ iOS : DeviceMotionEvent.requestPermission() doit être appelé depuis un
// geste utilisateur SYNCHRONE. Le clic sur "J'ai compris" EST un geste
// utilisateur valide (event click), donc on enchaîne directement onConfirm
// dans son handler — pas de setTimeout, pas d'await intercalaire entre le
// click et requestPermission() sinon la popup permission iOS ne s'affiche pas.

let _trackerWarningAcknowledged = false;

function _afficherAvertissementTracker(onConfirm) {
  // Guard contre double-ouverture (double-clic rapide).
  if (document.getElementById("kta-tracker-warn-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "kta-tracker-warn-overlay";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-tracker-warn-boite">' +
      '<div class="kta-readme-modal-header kta-tracker-warn-header">' +
        '<span class="kta-readme-modal-titre">⚠️ Tracker — Module expérimental</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p class="kta-tracker-warn-lead">' +
          'Ce module ne doit <strong>PAS</strong> être utilisé pour te repérer en situation réelle.' +
        '</p>' +
        '<p>' +
          'Le suivi par capteurs (boussole + accéléromètre) est <strong>expérimental</strong> et ' +
          'accumule de la dérive à chaque pas. La précision dépend du calibrage du plan, de la ' +
          'qualité du magnétomètre du téléphone, et de l\'environnement (les armatures métalliques ' +
          'des carrières / galeries faussent fortement la boussole).' +
        '</p>' +
        '<div class="kta-tracker-warn-section">' +
          '<div class="kta-tracker-warn-section-titre">✅ Utilisations recommandées</div>' +
          '<ul>' +
            '<li>Debug de la formule de heading (avec la boussole 🧭)</li>' +
            '<li>Tester la calibration du plan (échelle pixel→mètre)</li>' +
            '<li>Valider la détection de pas (seuils accéléromètre)</li>' +
          '</ul>' +
        '</div>' +
        '<div class="kta-tracker-warn-section kta-tracker-warn-section-bad">' +
          '<div class="kta-tracker-warn-section-titre">❌ NE PAS utiliser pour</div>' +
          '<ul>' +
            '<li>Te localiser réellement (utilise un fil d\'Ariane physique)</li>' +
            '<li>Tracer un itinéraire fiable</li>' +
            '<li>Retrouver ton chemin en cas de perte (utilise ⛑️ Je suis perdu)</li>' +
          '</ul>' +
        '</div>' +
        '<p class="kta-tracker-warn-note">' +
          'Recalage manuel via 📍 indispensable tous les ~50m pour limiter la dérive.' +
        '</p>' +
      '</div>' +
      '<div class="kta-tracker-warn-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-tracker-warn-cancel" type="button">Annuler</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-tracker-warn-ok"     type="button">J\'ai compris — Démarrer</button>' +
      '</div>' +
    '</div>';

  document.documentElement.appendChild(overlay);

  function _cleanup() {
    if (overlay.parentNode) overlay.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) {
    if (e.key === "Escape") _cleanup();
  }

  // Clic backdrop = annuler (l'utilisateur doit explicitement cliquer "J'ai
  // compris" pour démarrer le tracking → safety-first).
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) _cleanup();
  });
  document.addEventListener("keydown", _onKey);

  document.getElementById("kta-tracker-warn-cancel").addEventListener("click", _cleanup);

  document.getElementById("kta-tracker-warn-ok").addEventListener("click", function() {
    _trackerWarningAcknowledged = true;
    _cleanup();
    // ⚠️ APPEL SYNCHRONE — voir commentaire d'en-tête. Pas de setTimeout ici.
    try { onConfirm(); } catch(e) { console.error("[Tracker] onConfirm threw:", e); }
  });
}

// =========================
// 🏗️ MULTI-NIVEAU — modales et helpers (depuis v148)
// =========================
// _ouvrirSelecteurNiveau : modal complète gérant 2 dimensions :
//   1. NIVEAU ACTIF (single-select) → utilisé pour DESSINER nouvelles roads/points/zones
//   2. NIVEAUX VISIBLES (multi-select) → filtre d'AFFICHAGE
// Apparaît au clic sur la pastille "Niv X" dans le groupe Tracés.
// Changer le niveau actif → coupe le mode road en cours ET reset le filtre
// visible à [newActive] (mode focalisé par défaut).
function _ouvrirSelecteurNiveau(btnPastille) {
  if (document.getElementById("kta-niv-modal")) return;

  const cur = APP_CONFIG.activeLevel || 0;
  const visibles = Array.isArray(APP_CONFIG.visibleLevels) ? APP_CONFIG.visibleLevels.slice() : [cur];
  const levels = Array.isArray(APP_CONFIG.availableLevels) && APP_CONFIG.availableLevels.length
    ? APP_CONFIG.availableLevels.slice()
    : [-2, -1, 0, 1, 2];
  // 🏗️ v154 : tri croissant pour affichage horizontal naturel -2 → +2 (gauche
  // a droite = negatif a positif, comme un axe numerique). availableLevels en
  // memoire peut etre dans n'importe quel ordre (apres push/unshift par les
  // boutons +/-), on trie systematiquement avant rendu.
  levels.sort(function(a, b) { return a - b; });

  // Segmented (niveau actif) : boutons radio visuels, encadres de [-] et [+]
  let segmented = "";
  levels.forEach(function(lvl) {
    const active = (lvl === cur);
    segmented +=
      '<button type="button" class="kta-niv-seg-btn' + (active ? ' kta-actif' : '') +
      '" data-level="' + lvl + '">' + lvl + '</button>';
  });

  // Checkboxes (niveaux visibles) - meme ordre croissant
  let checkboxes = "";
  levels.forEach(function(lvl) {
    const checked = (visibles.indexOf(lvl) >= 0);
    checkboxes +=
      '<label class="kta-niv-vis-box">' +
        '<input type="checkbox" data-level="' + lvl + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="kta-niv-vis-label">Niv ' + lvl + '</span>' +
      '</label>';
  });

  const overlay = document.createElement("div");
  overlay.id = "kta-niv-modal";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-niv-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">🏗️ Niveaux</span>' +
        '<button class="kta-panneau-close" id="kta-niv-close" type="button" aria-label="Fermer">&times;</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +

        // SECTION 1 : Niveau actif (single-select)
        '<div class="kta-niv-section">' +
          '<div class="kta-niv-section-titre">🎯 Niveau actif (pour dessiner)</div>' +
          '<p class="kta-niv-section-hint">' +
            'Tous les nouveaux éléments (tracés, points, zones, tracker recalé) seront ' +
            'tagués avec ce niveau.' +
          '</p>' +
          '<div class="kta-niv-segmented">' +
            '<button type="button" class="kta-niv-seg-btn kta-niv-seg-add" id="kta-niv-sub" title="Ajouter un niveau en-dessous (min - 1)">−</button>' +
            segmented +
            '<button type="button" class="kta-niv-seg-btn kta-niv-seg-add" id="kta-niv-add" title="Ajouter un niveau au-dessus (max + 1)">+</button>' +
          '</div>' +
        '</div>' +

        // SECTION 2 : Niveaux visibles (multi-select)
        '<div class="kta-niv-section">' +
          '<div class="kta-niv-section-titre">👁️ Niveaux visibles (filtre)</div>' +
          '<p class="kta-niv-section-hint">' +
            'Coche les niveaux que tu veux afficher sur la carte. Les jonctions sont ' +
            'visibles si au moins un de leurs endpoints touche un niveau coché.' +
          '</p>' +
          '<div class="kta-niv-vis-grid">' + checkboxes + '</div>' +
          '<div class="kta-niv-vis-actions">' +
            '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-niv-vis-all">Tous</button>' +
            '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-niv-vis-active">Actif seul</button>' +
          '</div>' +
        '</div>' +

        '<p style="font-size:11.5px; color:#8892a4; margin:6px 0 0 0; line-height:1.5;">' +
          '⚠️ Changer le niveau actif <strong>annule</strong> tout tracé en cours et ' +
          'reset le filtre visibles à [actif].' +
        '</p>' +
      '</div>' +
    '</div>';

  document.documentElement.appendChild(overlay);

  function _cleanup() {
    if (overlay.parentNode) overlay.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) { if (e.key === "Escape") _cleanup(); }
  overlay.addEventListener("click", function(e) { if (e.target === overlay) _cleanup(); });
  document.addEventListener("keydown", _onKey);
  document.getElementById("kta-niv-close").addEventListener("click", _cleanup);

  // v155 : segmented en mode nowrap (scroll horizontal si trop de niveaux).
  // Scroll vers le bouton actif pour qu'il soit visible a l'ouverture.
  setTimeout(function() {
    const activeBtn = overlay.querySelector(".kta-niv-seg-btn.kta-actif");
    if (activeBtn && typeof activeBtn.scrollIntoView === "function") {
      try {
        activeBtn.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
      } catch(e) {
        // Fallback Safari (pas de "instant" sur vieille version)
        try { activeBtn.scrollIntoView({ block: "nearest", inline: "center" }); } catch(e2) {}
      }
    }
  }, 0);

  // Clic sur un niveau actif : applique + ferme
  overlay.querySelectorAll(".kta-niv-seg-btn[data-level]").forEach(function(b) {
    b.addEventListener("click", function() {
      const lvl = parseInt(b.dataset.level, 10);
      if (!Number.isInteger(lvl)) return;
      _changerNiveauActif(lvl);
      _cleanup();
    });
  });

  // Bouton + : ajoute un niveau au-dela du max existant (vers le haut)
  const addBtn = document.getElementById("kta-niv-add");
  if (addBtn) {
    addBtn.addEventListener("click", function() {
      const maxLvl = Math.max.apply(null, APP_CONFIG.availableLevels || [0]);
      APP_CONFIG.availableLevels = (APP_CONFIG.availableLevels || []).concat(maxLvl + 1);
      window.APP_CONFIG = APP_CONFIG;
      _cleanup();
      _ouvrirSelecteurNiveau(btnPastille);
    });
  }

  // 🏗️ v154 : Bouton − : ajoute un niveau en-dessous du min existant
  const subBtn = document.getElementById("kta-niv-sub");
  if (subBtn) {
    subBtn.addEventListener("click", function() {
      const minLvl = Math.min.apply(null, APP_CONFIG.availableLevels || [0]);
      APP_CONFIG.availableLevels = (APP_CONFIG.availableLevels || []).concat(minLvl - 1);
      window.APP_CONFIG = APP_CONFIG;
      _cleanup();
      _ouvrirSelecteurNiveau(btnPastille);
    });
  }

  // Checkboxes filtre visible : toggle a la volee → applique le filtre
  overlay.querySelectorAll(".kta-niv-vis-box input[type=checkbox]").forEach(function(cb) {
    cb.addEventListener("change", function() {
      const lvl = parseInt(cb.dataset.level, 10);
      if (!Number.isInteger(lvl)) return;
      let arr = Array.isArray(APP_CONFIG.visibleLevels) ? APP_CONFIG.visibleLevels.slice() : [];
      if (cb.checked) {
        if (arr.indexOf(lvl) < 0) arr.push(lvl);
      } else {
        arr = arr.filter(function(l) { return l !== lvl; });
      }
      APP_CONFIG.visibleLevels = arr;
      window.APP_CONFIG = APP_CONFIG;
      if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    });
  });

  // Quick action : "Tous" coche toutes les boites
  const allBtn = document.getElementById("kta-niv-vis-all");
  if (allBtn) {
    allBtn.addEventListener("click", function() {
      APP_CONFIG.visibleLevels = levels.slice();
      window.APP_CONFIG = APP_CONFIG;
      // Update DOM checkboxes
      overlay.querySelectorAll(".kta-niv-vis-box input[type=checkbox]").forEach(function(cb) {
        cb.checked = true;
      });
      if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    });
  }
  // Quick action : "Actif seul"
  const activeBtn = document.getElementById("kta-niv-vis-active");
  if (activeBtn) {
    activeBtn.addEventListener("click", function() {
      const lvl = APP_CONFIG.activeLevel || 0;
      APP_CONFIG.visibleLevels = [lvl];
      window.APP_CONFIG = APP_CONFIG;
      overlay.querySelectorAll(".kta-niv-vis-box input[type=checkbox]").forEach(function(cb) {
        cb.checked = parseInt(cb.dataset.level, 10) === lvl;
      });
      if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    });
  }
}

// Applique le changement de niveau actif : coupe le mode road en cours (Q5),
// reset le filtre visibles a [newActive] (mode focalise), met a jour la
// pastille, propage le filtre a tous les modules.
function _changerNiveauActif(newLevel) {
  // v155 fix : retire le check newLevel < 0 qui bloquait les niveaux negatifs
  // (reste de v148 quand availableLevels etait [0..3] strict). Depuis v154 on
  // supporte les sous-sols (-1, -2, …), donc tout entier est valide.
  if (!Number.isInteger(newLevel)) return;

  // Annule le tracé en cours
  if (typeof _fermerModeRoad === "function") _fermerModeRoad();

  APP_CONFIG.activeLevel   = newLevel;
  APP_CONFIG.visibleLevels = [newLevel];  // reset filtre au mode focalise
  window.APP_CONFIG = APP_CONFIG;

  // Mise à jour de la pastille dans la sidebar (chiffre seul, pas de prefixe)
  const pill = document.getElementById("kta-niv-pastille-icone");
  if (pill) pill.textContent = String(newLevel);

  // Propage le filtre a tous les modules level-aware
  if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();

  console.log("[MultiNiveau] Niveau actif →", newLevel, "| Visibles :", APP_CONFIG.visibleLevels);
}

// 🏗️ Multi-niveau : helper global qui re-render / re-filtre TOUS les modules
// level-aware. Appele apres tout changement de visibleLevels.
// Chaque module expose _applyLevelFilterTo*() qui itere ses markers et
// applique setOpacity selon le filtre courant.
window.appliquerFiltreNiveau = function() {
  // Roads + zones de session : re-render complet (filtre applique au build)
  if (typeof window.renderRoads === "function") {
    try { window.renderRoads(); } catch(e) {}
  }
  if (typeof window.renderZones === "function") {
    try { window.renderZones(); } catch(e) {}
  }
  // 🆕 v1.9.3-A1.a-fix5 : structures de session re-render aussi au
  // changement de niveau (sinon les piliers/murs restaient figés à
  // la visibilité du niveau initial).
  if (typeof window.renderStructures === "function") {
    try { window.renderStructures(); } catch(e) {}
  }
  // Markers / points des layers DATA (puits, cataphile, etc.)
  if (typeof window._applyLevelFilterToDataPoints === "function") {
    try { window._applyLevelFilterToDataPoints(); } catch(e) {}
  }
  // Routes embarquees dans les calques DATA (json.roads[])
  if (typeof window._applyLevelFilterToDataRoads === "function") {
    try { window._applyLevelFilterToDataRoads(); } catch(e) {}
  }
  // Zones embarquees dans les calques DATA (json.zones[])
  if (typeof window._applyLevelFilterToDataZones === "function") {
    try { window._applyLevelFilterToDataZones(); } catch(e) {}
  }
  // 🆕 v1.9.3-A1.a-fix5 : structures embarquées dans les calques DATA
  // (json.structures[]). Sans cet appel, les piliers/murs data layer
  // restaient figés à la visibilité du niveau initial au boot et ne
  // re-filtraient pas au changement de niveau.
  if (typeof window._applyLevelFilterToDataStructures === "function") {
    try { window._applyLevelFilterToDataStructures(); } catch(e) {}
  }
  // Points editor (session)
  if (typeof window._applyLevelFilterToEditorPoints === "function") {
    try { window._applyLevelFilterToEditorPoints(); } catch(e) {}
  }
  // Tracker marker + polyline parcouru
  if (typeof window._applyLevelFilterToTracker === "function") {
    try { window._applyLevelFilterToTracker(); } catch(e) {}
  }
  // 🏗️ v162 : Image layers (calques image du plan : legende, etc.) qui ont
  // un champ `level`. Force addLayer/removeLayer selon visibleLevels. Modale
  // Niveaux = authority (override le checkbox Leaflet).
  if (typeof window._applyLevelFilterToImageLayers === "function") {
    try { window._applyLevelFilterToImageLayers(); } catch(e) {}
  }
};

// _ouvrirCreationJonction : modal pour saisir fromLevel/toLevel avant
// d'activer le mode tracé jonction.
function _ouvrirCreationJonction(btnSub) {
  if (document.getElementById("kta-jct-modal")) return;

  const cur = APP_CONFIG.activeLevel || 0;
  const levels = Array.isArray(APP_CONFIG.availableLevels) && APP_CONFIG.availableLevels.length
    ? APP_CONFIG.availableLevels.slice()
    : [-2, -1, 0, 1, 2];
  // v154 : tri croissant pour cohrence avec la modale Niveaux
  levels.sort(function(a, b) { return a - b; });

  // Options du select : tous les niveaux dispo
  function _optionsHtml(selectedLevel) {
    return levels.map(function(l) {
      return '<option value="' + l + '"' + (l === selectedLevel ? ' selected' : '') + '>' +
             'Niveau ' + l + '</option>';
    }).join('');
  }

  // Defaut : depuis le niveau actif vers le niveau juste au-dessus
  const defaultTo = (cur === 0 && levels.indexOf(1) >= 0) ? 1
                  : (cur + 1 <= Math.max.apply(null, levels) ? cur + 1
                  : Math.max.apply(null, levels));

  const overlay = document.createElement("div");
  overlay.id = "kta-jct-modal";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-jct-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">🪜 Nouvelle jonction interniveau</span>' +
        '<button class="kta-panneau-close" id="kta-jct-close" type="button" aria-label="Fermer">&times;</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="margin:0 0 12px 0; font-size:13px; color:#c8d0e0;">' +
          'Cette jonction (escalier, pente raide, puits interne) relie deux niveaux.' +
        '</p>' +
        '<div class="kta-jct-grille">' +
          '<label class="kta-cfg-label">Niveau de départ</label>' +
          '<select class="kta-cfg-input" id="kta-jct-from">' + _optionsHtml(cur) + '</select>' +
          '<label class="kta-cfg-label">Niveau d\'arrivée</label>' +
          '<select class="kta-cfg-input" id="kta-jct-to">' + _optionsHtml(defaultTo) + '</select>' +
        '</div>' +
        '<p style="font-size:11.5px; color:#8892a4; margin:12px 0 0 0; line-height:1.5;">' +
          'Après OK, clique sur la carte pour poser les points de la jonction (autant que tu veux). ' +
          'Le tracé sera magenta pointillé et restera toujours visible peu importe le niveau actif.' +
        '</p>' +
      '</div>' +
      '<div class="kta-tracker-warn-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-jct-cancel" type="button">Annuler</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-jct-ok"     type="button">OK — Tracer la jonction</button>' +
      '</div>' +
    '</div>';

  document.documentElement.appendChild(overlay);

  function _cleanup() {
    if (overlay.parentNode) overlay.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) { if (e.key === "Escape") _cleanup(); }
  overlay.addEventListener("click", function(e) { if (e.target === overlay) _cleanup(); });
  document.addEventListener("keydown", _onKey);
  document.getElementById("kta-jct-close").addEventListener("click", _cleanup);
  document.getElementById("kta-jct-cancel").addEventListener("click", _cleanup);

  document.getElementById("kta-jct-ok").addEventListener("click", function() {
    const fromLvl = parseInt(document.getElementById("kta-jct-from").value, 10);
    const toLvl   = parseInt(document.getElementById("kta-jct-to").value,   10);
    if (!Number.isInteger(fromLvl) || !Number.isInteger(toLvl)) return;
    if (fromLvl === toLvl) {
      alert("Les niveaux de départ et d'arrivée doivent être différents.");
      return;
    }
    _cleanup();
    // Stocke la meta pour que road.js > mousedown la lise au premier clic
    window._jonctionPendingMeta = { fromLevel: fromLvl, toLevel: toLvl };
    // Active le mode tracé "jonction"
    _activerJonctionMode(btnSub, fromLvl, toLvl);
  });
}

// Active le mode tracé jonction (utilise le même pattern que _activerRoute
// mais avec type "jonction" + icone reflet 🪜).
function _activerJonctionMode(btnCible, fromLvl, toLvl) {
  // Replique _activerRoute en inline : on est en scope module, alors que
  // _activerRoute est dans initInterface (closure sur _groupes etc.).
  //
  // ⚠️ Bug v148.test : sans _desactiverTousLesModes() ici, activer la jonction
  // alors qu'un autre mode est actif (✏️ point, 📐 mesure, ⬛ zone, etc.) laisse
  // les 2 modes actifs en parallele → clic carte declenche plusieurs handlers
  // contradictoires. Fix : on tue tout avant de demarrer la jonction.
  _desactiverTousLesModes();

  toggleRoadMode("jonction");  // sets window.modeRoad = "jonction"
  if (btnCible) btnCible.classList.add("kta-actif");
  const grp = _groupes["traces"];
  _modesActifs["road"] = {
    btnEl: btnCible,
    desactiverFn: function() {
      if (window.modeRoad) toggleRoadMode(window.modeRoad);
      if (grp) grp.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
      _setGroupeModeActif("traces", false);
      window._jonctionPendingMeta = null;
    }
  };
  _setGroupeModeActif("traces", true, "🪜");
  console.log("[MultiNiveau] Jonction mode activé :", fromLvl, "→", toLvl);
}

// =========================
// INIT INTERFACE
// =========================
// =========================
// HELPER ACCORDÉON
// =========================
// Gère l'ouverture/fermeture exclusive des groupes
// + maintien forcé en ouvert si un mode est actif

const _groupes = {}; // { groupeId: { container, btnPrincipal, subActions: [], modeActif: false } }
let _groupeOuvert = null;

function _fermerGroupe(id) {
  const g = _groupes[id];
  if (!g) return;
  g.subActions.forEach(function(el) { el.classList.add("kta-hidden"); });
  if (g.btnPrincipal) g.btnPrincipal.classList.remove("kta-group-open");
  if (_groupeOuvert === id) _groupeOuvert = null;
}

// 🆕 Refonte UI v1.2 : ferme le groupe accordéon ouvert si présent dans
// la sidebar 'left' ou 'right'. Appelé par le bouton ≡ de réduction
// dans refonteInterface.js. No-op si aucun groupe n'est ouvert, ou si
// le groupe ouvert n'est pas dans la sidebar demandée.
window._fermerGroupeOuvertSide = function(side) {
  if (!_groupeOuvert) return;
  const g = _groupes[_groupeOuvert];
  if (!g || !g.position) return;
  const expected = side === "left" ? "topleft" : "topright";
  if (g.position !== expected) return;
  // Ne pas fermer si mode actif (sécurité : tracker en Play, etc.)
  if (g.modeActif) return;
  _fermerGroupe(_groupeOuvert);
};

function _ouvrirGroupe(id) {
  // 🆕 v1.9.3-A1.b.2.5 (KARMA "maintenant que on peut le fermer même en
  // play, je veux que si j'ouvre un menu tracé ou autre il se ferme,
  // même comportement que tous les autres menus") :
  // Fermer TOUS les autres groupes, y compris ceux en mode actif. Le
  // mode actif lui-même reste activé (tracker continue en background)
  // — seul le tiroir des sous-actions se ferme. L'icône principale
  // garde la classe kta-group-mode-actif pour feedback visuel.
  //
  // Avant : on préservait le tracker ouvert pour ne pas perdre l'accès
  // à ⏹️ Stop. Mais ça créait une inconsistance UX (1 menu peut rester
  // ouvert pendant qu'un autre s'ouvre). Maintenant cohérent partout :
  // 1 seul menu ouvert à la fois (sauf clic externe qui respecte
  // toujours le modeActif via _initClickExterieur, anti-fermeture
  // accidentelle).
  Object.keys(_groupes).forEach(function(autreId) {
    if (autreId === id) return;
    _fermerGroupe(autreId);
  });

  const g = _groupes[id];
  if (!g) return;
  g.subActions.forEach(function(el) {
    el.classList.remove("kta-hidden");
    el.classList.add("kta-sub-anim");
    setTimeout(function() { el.classList.remove("kta-sub-anim"); }, 200);
  });
  if (g.btnPrincipal) g.btnPrincipal.classList.add("kta-group-open");
  _groupeOuvert = id;
}

function _toggleGroupe(id) {
  if (_groupeOuvert === id) {
    // 🆕 v1.8.0 (suite KARMA) : autoriser la fermeture MÊME en mode actif.
    //
    // Comportement avant : si un mode était actif (ex: tracker en Play),
    // on refusait de fermer le groupe pour éviter de "perdre" l'accès aux
    // sous-actions (⏹️ stop, 📍 recalage, etc.). En pratique cette
    // protection bloquait l'user qui voulait juste replier le groupe pour
    // gagner de la place à l'écran sans arrêter son mode.
    //
    // Maintenant : le clic sur le bouton principal toggle l'affichage
    // des sous-actions, peu importe le modeActif. Le mode lui-même reste
    // actif (tracker continue, etc.), seule la visibilité du tiroir
    // d'actions change. L'icône reflète toujours l'état actif (⏹️ au lieu
    // de 🧭 par ex), donc l'user voit que c'est en cours et peut rouvrir
    // d'un clic pour accéder à ⏹️ s'il veut stopper.
    //
    // Protection conservée : clic externe + ouverture d'un autre groupe
    // ne ferment toujours pas en mode actif (anti-fermeture accidentelle).
    // Cf. _initClickExterieur et _fermerGroupesAutres.
    _fermerGroupe(id);
  } else {
    _ouvrirGroupe(id);
  }
}

// Marque un groupe comme ayant un mode actif → reste ouvert
function _setGroupeModeActif(id, actif, iconeReflet) {
  const g = _groupes[id];
  if (!g) return;
  g.modeActif = actif;
  if (actif) {
    if (iconeReflet && g.btnPrincipal) {
      g.btnPrincipal.dataset.iconeOriginale = g.btnPrincipal.dataset.iconeOriginale || g.btnPrincipal.innerHTML;
      g.btnPrincipal.innerHTML = iconeReflet;
    }
    // 🆕 v1.8.0 : classe CSS persistante sur le btnPrincipal quand un mode
    // est actif. Permet à l'user de voir d'un coup d'œil que le mode tourne
    // même quand il a replié le groupe (fix v1.8.0 du toggle qui autorise
    // la fermeture en modeActif). Utile en particulier pour le tracker
    // depuis qu'on ne remplace plus l'icône par ⏹️ (fix v1.8.0 KARMA :
    // garder 🧭 toujours visible comme identité du groupe). Sans cette
    // classe, l'user n'aurait aucun feedback visuel que tracker tourne
    // une fois le groupe replié.
    if (g.btnPrincipal) g.btnPrincipal.classList.add("kta-group-mode-actif");
    _ouvrirGroupe(id);
  } else {
    if (g.btnPrincipal && g.btnPrincipal.dataset.iconeOriginale) {
      g.btnPrincipal.innerHTML = g.btnPrincipal.dataset.iconeOriginale;
    }
    if (g.btnPrincipal) g.btnPrincipal.classList.remove("kta-group-mode-actif");
  }
}

// Clic en dehors → ferme le groupe ouvert (si pas de mode actif)
function _initClickExterieur() {
  if (window._clickExterieurInit) return;
  window._clickExterieurInit = true;

  document.addEventListener("click", function(e) {
    if (!_groupeOuvert) return;
    const g = _groupes[_groupeOuvert];
    if (!g || g.modeActif) return;
    if (g.container.contains(e.target)) return;
    _fermerGroupe(_groupeOuvert);
  });
}

// =========================
// HELPER : créer un groupe accordéon
// =========================
// config = {
//   id, iconePrincipale, titre, soloAction (function|null si pas solo),
//   sousActions: [ { icone, titre, onClick, refClassName? } ]
// }
function _creerGroupeAccordeon(config) {
  // 🆕 Refonte UI v1 : option config.position lue UNIQUEMENT si flag actif
  // (window._refonteInterfaceActive = true). Sinon comportement strict
  // v1.8.x (tous les groupes en topright). Évite toute régression sur
  // l'UI actuelle quand le flag est OFF.
  let pos = "topright";
  if (window._refonteInterfaceActive === true && typeof config.position === "string") {
    pos = config.position;
  }
  const ctrl = L.control({ position: pos });
  ctrl.onAdd = function() {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnPrincipal = L.DomUtil.create("a", "kta-group-toggle", div);
    btnPrincipal.innerHTML = config.iconePrincipale;
    btnPrincipal.href      = "javascript:void(0)";
    btnPrincipal.title     = config.titre;

    const subActions = [];

    // Solo : clic direct sur l'action principale, pas d'accordéon
    if (config.soloAction) {
      L.DomEvent.on(btnPrincipal, "click", function(e) {
        L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
        // Si un autre groupe est ouvert, le fermer
        if (_groupeOuvert) {
          const autre = _groupes[_groupeOuvert];
          if (autre && !autre.modeActif) _fermerGroupe(_groupeOuvert);
        }
        config.soloAction();
      });
    } else {
      // Créer les sous-actions (cachées par défaut)
      (config.sousActions || []).forEach(function(sub) {
        const extraCls = sub.cssClass ? (" " + sub.cssClass) : "";
        const btnSub = L.DomUtil.create("a", "kta-sub kta-hidden" + extraCls, div);
        btnSub.innerHTML = sub.icone;
        btnSub.href      = "javascript:void(0)";
        btnSub.title     = sub.titre;
        if (sub.refClassName) btnSub.dataset.refClassName = sub.refClassName;

        L.DomEvent.on(btnSub, "click", function(e) {
          L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
          sub.onClick(btnSub);
        });

        // Référence directe pour pouvoir manipuler après création
        if (sub.id) btnSub.dataset.subId = sub.id;
        subActions.push(btnSub);
      });

      L.DomEvent.on(btnPrincipal, "click", function(e) {
        L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
        _toggleGroupe(config.id);
      });
    }

    L.DomEvent.disableClickPropagation(div);

    _groupes[config.id] = {
      container:    div,
      btnPrincipal: btnPrincipal,
      subActions:   subActions,
      modeActif:    false,
      // 🆕 Refonte UI v1.2 : stocker la sidebar du groupe (left/right)
      // pour permettre au bouton ≡ de réduction de fermer le groupe
      // ouvert dans SA sidebar avant de collapser. Lit la même config
      // que pour le L.control({position}).
      position:     pos  // "topleft" ou "topright"
    };

    return div;
  };
  ctrl.addTo(window.map);
}

// =========================
// LEAFLET LAYERS CONTROL WATCHER
// =========================
// Observe la classe ".leaflet-control-layers-expanded" sur le contrôle des
// couches Leaflet. Quand l'utilisateur ouvre le panneau, on ajoute une classe
// sur <body> pour permettre au CSS de décaler le #kta-titre-fixe à gauche
// (sinon le panneau passe derrière le titre, bug stacking context observé sur
// mobile où le titre prend pleine largeur).
function _initLayersControlWatcher() {
  function _attachWatcher() {
    const layersCtrl = document.querySelector(".leaflet-control-layers");
    if (!layersCtrl) {
      // Pas encore créé par Leaflet → retry dans 200ms (rare, mais safety net)
      setTimeout(_attachWatcher, 200);
      return;
    }
    const observer = new MutationObserver(function() {
      document.body.classList.toggle(
        "kta-layers-panel-open",
        layersCtrl.classList.contains("leaflet-control-layers-expanded")
      );
    });
    observer.observe(layersCtrl, { attributes: true, attributeFilter: ["class"] });
    // Sync initial (au cas où expanded au boot)
    document.body.classList.toggle(
      "kta-layers-panel-open",
      layersCtrl.classList.contains("leaflet-control-layers-expanded")
    );
  }
  _attachWatcher();
}

// =========================
// INIT INTERFACE — barre 9 groupes (accordéons)
// =========================
function initInterface() {
  console.log("[Interface] initInterface");
  if (window.interfaceInitialized) return;
  window.interfaceInitialized = true;

  // Reset état accordéons (au cas où on recharge un plan)
  Object.keys(_groupes).forEach(function(k) { delete _groupes[k]; });
  _groupeOuvert = null;

  L.control.titleControl().addTo(window.map);

  // 🆕 Refonte UI v1.2 (KARMA) :
  //   1. Bouton ≡ de réduction de chaque sidebar (gauche + droite)
  //      → créé en PREMIER, positionné en HAUT via flex order:-1 (cf. CSS).
  //      → au clic toggle classe body.kta-refonte-sidebar-{left|right}-collapsed.
  //   2. Bouton 🏗 Niveau (multi-niveau) — ordre intermédiaire dans la
  //      sidebar gauche (après les natifs Layers/Zoom, avant Doc/Settings).
  //
  // En refonte OFF : aucun de ces appels n'a lieu → comportement v1 strict
  // (Niveau créé à la fin de initInterface, pas de bouton réduction).
  if (window._refonteInterfaceActive === true) {
    // Boutons de réduction (gauche + droite). Position visuelle "en haut"
    // de chaque sidebar gérée via CSS flex order:-1, peu importe l'ordre
    // d'ajout au DOM (Layers/Zoom natifs Leaflet sont déjà placés avant).
    if (typeof window._refonteInterfaceCreerBoutonReductionLeft === "function") {
      window._refonteInterfaceCreerBoutonReductionLeft();
    }
    if (typeof window._refonteInterfaceCreerBoutonReductionRight === "function") {
      window._refonteInterfaceCreerBoutonReductionRight();
    }
    // Bouton Niveau (avant les groupes accordéon topleft)
    _initLevelFilterControl();
  }

  // ===== Watcher pour le contrôle des couches Leaflet =====
  // Quand le panneau des couches s'ouvre (clic ou hover), il s'agrandit en haut-droite
  // de la map. Mais le #map est position:fixed → stacking context isolé → le panneau
  // ne peut pas passer au-dessus du titre fixe (z-index 1100, dans le body). Sur mobile
  // avec un titre qui prend la pleine largeur, le panneau passe derriere le titre.
  // Solution : MutationObserver qui detecte l'ouverture du panneau (classe
  // "leaflet-control-layers-expanded" ajoutee/retiree par Leaflet) et ajoute une
  // classe sur le body, qui declenche un decalage CSS du titre vers la gauche.
  _initLayersControlWatcher();

  // 1. AIDE / DOC / LÉGENDE
  // 🆕 Refonte UI v1 : position topleft si flag actif (sinon topright par défaut).
  _creerGroupeAccordeon({
    id: "aide",
    iconePrincipale: "📚",
    titre: "Aide / Documentation / Légende",
    position: "topleft",
    sousActions: [
      { icone: "❓", titre: "Aide",          onClick: afficherAide },
      { icone: "📖", titre: "Documentation", onClick: afficherReadme },
      { icone: "🤖", titre: "Aide IA",       onClick: function() {
          if (typeof window.afficherModaleAideIA === "function") {
            window.afficherModaleAideIA();
          }
        } },
      { icone: "🗺️", titre: "Légende",       onClick: afficherLegende }
    ]
  });

  // 2. PARAMÈTRES (solo)
  // 🔧 v1.14.2 (KARMA) : le toggle thème est retiré du mode map. Il a été
  // déplacé exclusivement vers la modale Configuration home — et tout
  // changement de thème déclenche désormais un reload complet de l'app
  // (ThemeManager.setThemeAndReload) pour éviter les bugs résiduels de
  // bandeau top / modales chargées avant le toggle qu'on n'a jamais
  // réussi à régler avec un swap "live".
  // ⚙️ Paramètres redevient donc une soloAction qui ouvre direct la
  // modale Configuration (= comportement d'avant v1.13.0).
  _creerGroupeAccordeon({
    id: "settings",
    iconePrincipale: "⚙️",
    titre: "Paramètres",
    position: "topleft",
    soloAction: function() { afficherConfig(); }
  });

  // 2bis. RECHERCHE (solo)
  _creerGroupeAccordeon({
    id: "recherche",
    iconePrincipale: "🔍",
    titre: "Rechercher un point",
    soloAction: function() {
      if (window.ouvrirRecherche) window.ouvrirRecherche();
      else alert("Module recherche indisponible");
    }
  });

  // 3. CHARGER / IMPORT
  // 🆕 v1.8.1-refonte-14 : retrait du sous-action "🗂️ Changer de plan"
  // (KARMA feedback "enleve l'icone charger un plan du menu déroulant
  // import"). En mode refonte, le bouton rose des vents 🌟 du header
  // ouvre déjà la même modale via _retourLoaderAvecConfirm. En mode
  // legacy, le clic sur le titre du plan en haut centre fait le même
  // boulot (togglePlanSwitcher). Plus de doublon dans le menu Import.
  // 🆕 v1.14.5 (KARMA UX) : les 2 sous-actions « 📥 Importer session » et
  // « 📤 Importer GPX » sont fusionnées en une seule « 📂 Importer » qui
  // ouvre une modale de choix (2 cards : session vs GPX). Avant, les
  // icônes 📥 / 📤 étaient trop proches → confusion à l'usage. Pattern
  // miroir de la modale 💾 Enregistrer session.
  _creerGroupeAccordeon({
    id: "charger",
    iconePrincipale: "⬇️",
    titre: "Charger / Import",
    position: "topleft",
    sousActions: [
      // v1.14.7 : retour à l'icône 📥 (l'icône classique d'import) — KARMA :
      // « plus de soucis de doublon » maintenant qu'il n'y a qu'une seule
      // entrée dans le menu, l'icône folder neutre 📂 n'était plus nécessaire.
      { icone: "📥", titre: "Importer (session MyKTAMap ou GPX externe)", onClick: function() {
          if (typeof window.ouvrirImportChoix === "function") window.ouvrirImportChoix();
          else ouvrirImportSession();
        } },
      { icone: "📊", titre: "Éditer un fichier JSON", onClick: function() {
          if (window.ouvrirTableEditor) window.ouvrirTableEditor();
          else alert("Module éditeur de tableau indisponible");
        } }
    ]
  });

  // 4. CRÉER / MODIFIER PLAN (solo)
  // 🆕 Refonte UI v1 : ce groupe est RETIRÉ du mode carte si le flag est
  // actif. Le Générateur reste accessible UNIQUEMENT depuis le loader/home
  // via le bouton "🏗️ Générer un plan". Cohérent avec la philosophie
  // "actions de création hors du mode carte" (cf. choix KARMA).
  if (window._refonteInterfaceActive !== true) {
    _creerGroupeAccordeon({
      id: "planner",
      iconePrincipale: "🏗️",
      titre: "Créer ou modifier un plan",
      soloAction: function() {
        if (typeof afficherPlanner === "function") afficherPlanner();
      }
    });
  }

  // 5. ENREGISTRER
  _creerGroupeAccordeon({
    id: "save",
    iconePrincipale: "⬆️",
    titre: "Enregistrer",
    position: "topleft",
    sousActions: [
      { icone: "💾", titre: "Enregistrer la session", onClick: function() {
          if (window.ouvrirExportSessionModal) window.ouvrirExportSessionModal();
          else if (window.telechargerSessionJSON) window.telechargerSessionJSON();
        } },
      { icone: "🖼️", titre: "Exporter le plan en image", onClick: function() {
          if (window.ouvrirExportModal) {
            window.ouvrirExportModal();
          } else if (window.telechargerPlan) {
            // Fallback : telechargerPlan rethrow désormais — on l'attrape ici pour
            // afficher un message visible au lieu d'une promesse rejetée silencieuse.
            window.telechargerPlan().catch(function(err) {
              alert("Erreur lors de l'export du plan : " + (err && err.message ? err.message : err));
            });
          }
        } },
      // 🆕 v1.10.3 : Export PDF imprimable A4/A3 portrait/paysage (via jsPDF).
      // Réutilise le canvas généré par exporter.js pour cohérence visuelle.
      { icone: "📤", titre: "Exporter en PDF imprimable", onClick: function() {
          if (window.MyKTAMapPdfExport && window.MyKTAMapPdfExport.afficherModale) {
            window.MyKTAMapPdfExport.afficherModale();
          } else {
            alert("Module PDF non chargé. Recharge la page si le problème persiste.");
          }
        } }
    ]
  });

  // 🆕 v1.11.0 : 5'. HISTORIQUE (Undo / Redo) — groupe dédié, placé À LA
  // FIN de la sidebar GAUCHE (KARMA "met l'icône historique à gauche dans
  // la barre à la fin"). Position topleft + déclaré APRÈS save = dernier
  // groupe de la colonne gauche.
  // Raccourcis clavier Ctrl+Z / Ctrl+Y déjà actifs au niveau global
  // (cf. js/historyManager.js), les boutons UI sont pour la découvrabilité
  // + l'usage mobile sans clavier. Auto-grisés quand la pile est vide
  // (via HistoryManager.onChange).
  _creerGroupeAccordeon({
    id: "history",
    iconePrincipale: "⏪",
    titre: "Historique (Ctrl+Z / Ctrl+Y)",
    position: "topleft",
    sousActions: [
      {
        icone: "⏪",
        titre: "Annuler la dernière action (Ctrl+Z)",
        onClick: function(btnSub) {
          if (!window.HistoryManager) return;
          if (!window.HistoryManager.canUndo()) {
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast("Rien à annuler.", "info");
            }
            return;
          }
          window.HistoryManager.undo();
        }
      },
      {
        icone: "⏩",
        titre: "Rétablir l'action annulée (Ctrl+Y)",
        onClick: function(btnSub) {
          if (!window.HistoryManager) return;
          if (!window.HistoryManager.canRedo()) {
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast("Rien à rétablir.", "info");
            }
            return;
          }
          window.HistoryManager.redo();
        }
      }
    ]
  });

  // 🆕 v1.11.0 (KARMA "le grisage marche pas") : grisage des 2 boutons
  // selon canUndo/canRedo. v1 cherchait dans le DOM via data-groupe-id
  // qui n'existe pas → fix : on récupère directement les <a> sous-actions
  // via _groupes["history"].subActions (array exposé par _creerGroupeAccordeon
  // ligne ~3506) ; ordre conservé = [⏪ Undo, ⏩ Redo] (= ordre de déclaration
  // dans sousActions ci-dessus).
  (function _wireHistoryUiState() {
    if (!window.HistoryManager) return;
    const grp = _groupes["history"];
    if (!grp || !Array.isArray(grp.subActions) || grp.subActions.length < 2) {
      console.warn("[HistoryUI] grisage indisponible — _groupes[history].subActions manquant ou incomplet.");
      return;
    }
    const btnUndo = grp.subActions[0];  // ⏪
    const btnRedo = grp.subActions[1];  // ⏩
    function _applyDisabled(btn, disabled) {
      if (!btn) return;
      if (disabled) {
        btn.classList.add("kta-disabled-state");
        btn.style.opacity = "0.4";
        btn.style.cursor = "not-allowed";
        btn.style.pointerEvents = "auto"; // garder cliquable pour afficher le toast "Rien à annuler"
      } else {
        btn.classList.remove("kta-disabled-state");
        btn.style.opacity = "";
        btn.style.cursor = "";
        btn.style.pointerEvents = "";
      }
    }
    function _sync(state) {
      _applyDisabled(btnUndo, !state.canUndo);
      _applyDisabled(btnRedo, !state.canRedo);
    }
    // Sync initial (état au boot = piles vides après init)
    _sync({
      canUndo: window.HistoryManager.canUndo(),
      canRedo: window.HistoryManager.canRedo()
    });
    // Listener pour les futurs changements
    window.HistoryManager.onChange(_sync);
  })();

  // 6. TRACKER
  let isTracking = false;
  _creerGroupeAccordeon({
    id: "tracker",
    iconePrincipale: "🧭",
    titre: "Tracker",
    sousActions: [
      {
        icone: "▶️",
        titre: "Démarrer / arrêter le tracking",
        onClick: function(btnSub) {
          if (isTracking) {
            // Arrêt : pas d'avertissement, direct.
            stopTracking();
            btnSub.innerHTML = "▶️";
            _setGroupeModeActif("tracker", false);
            isTracking = false;
            return;
          }
          // Démarrage : enchaîne requestPermission + startTracking dans un
          // callback synchrone (le clic "J'ai compris" est un geste user
          // valide pour iOS requestPermission). Cf. commentaire d'en-tête de
          // _afficherAvertissementTracker.
          const _doStart = function() {
            requestPermission();
            startTracking();
            btnSub.innerHTML = "⏹️";
            // 🆕 v1.8.0 (fix KARMA) : on garde l'icône principale 🧭
            // pendant le Play (au lieu de la remplacer par ⏹️ comme avant).
            // Le ⏹️ est déjà visible en sous-action (btnSub ci-dessus),
            // donc le mettre aussi en principal était redondant et
            // perdait l'identité visuelle du groupe Tracker.
            // Le mode actif reste signalé par : (a) la sous-action ⏹️
            // visible, (b) le groupe qui reste ouvert (modeActif=true),
            // (c) la couleur d'accent CSS sur le groupe via .kta-actif
            // si applicable.
            _setGroupeModeActif("tracker", true, null);
            isTracking = true;
          };
          if (_trackerWarningAcknowledged) {
            _doStart();
          } else {
            _afficherAvertissementTracker(_doStart);
          }
        }
      },
      {
        icone: "🧭",
        titre: "Afficher la boussole (Nord)",
        onClick: function(btnSub) {
          if (!window.CompassWidget) return;
          window.CompassWidget.toggle();
          const visible = window.CompassWidget.isVisible();
          btnSub.classList.toggle("kta-actif", visible);
          // Hook pour decocher visuellement si l'utilisateur ferme le widget
          // via la croix ✕ (et non en re-cliquant la sous-action).
          window._onCompassHiddenExternally = function() {
            btnSub.classList.remove("kta-actif");
          };
        }
      },
      {
        icone: "📍",
        titre: "Mode recalage",
        onClick: function(btnSub) {
          if (typeof modeRecalage === "undefined") return;
          const dejaActif = btnSub.classList.contains("kta-actif");
          _desactiverTousLesModes();
          if (dejaActif) {
            modeRecalage = false;
            // 🆕 v1.8.0 (fix KARMA) : pas de reflet d'icône principale même si
// tracking actif. Garde 🧭 toujours visible (cf. _doStart ci-dessus).
_setGroupeModeActif("tracker", isTracking, null);
            return;
          }
          modeRecalage = true;
          btnSub.classList.add("kta-actif");
          // 🆕 v1.11.3-fix (KARMA "quand on a fini de l'utiliser, on doit
          // repartir sur la boussole") : helper exposé pour que tracking.js
          // puisse appeler la même fn de désactivation après le clic carte
          // (= retire .kta-actif + remet l'icône principale à 🧭).
          const _desactiverFn = function() {
            modeRecalage = false;
            btnSub.classList.remove("kta-actif");
            delete _modesActifs["recalage"];
            // 🆕 v1.11.3-fix2 (KARMA "fix marche pas quand on est en play") :
            // restore EXPLICITE de l'icône principale du groupe Tracker.
            // _setGroupeModeActif(actif=true, iconeReflet=null) ne touche
            // PAS à l'icône (= elle reste à 📍 set par l'activation), donc
            // on doit la remettre à l'original (🧭) manuellement avant
            // d'appeler la fn.
            const g = _groupes["tracker"];
            if (g && g.btnPrincipal && g.btnPrincipal.dataset.iconeOriginale) {
              g.btnPrincipal.innerHTML = g.btnPrincipal.dataset.iconeOriginale;
            }
            _setGroupeModeActif("tracker", isTracking, null);
          };
          _modesActifs["recalage"] = { btnEl: btnSub, desactiverFn: _desactiverFn };
          // Expose au scope global pour tracking.js
          window._fermerModeRecalage = _desactiverFn;
          _setGroupeModeActif("tracker", true, "📍");
        }
      },
      {
        icone: "🗺️",
        titre: "Calculer un itinéraire",
        onClick: function() {
          if (typeof window.ouvrirItinerairModal === "function") {
            window.ouvrirItinerairModal();
          }
        }
      },
      {
        icone: "⛑️",
        titre: "Je suis perdu — Mode urgence",
        cssClass: "kta-sous-action-urgence",
        onClick: function() {
          if (window.LostMode && typeof window.LostMode.open === "function") {
            window.LostMode.open();
          } else {
            alert("Mode urgence indisponible (LostMode non chargé).");
          }
        }
      },
      // 🆕 v1.10.1 — 🚨 Mode urgence "panique" : différent du ⛑️ Je suis
      // perdu (qui calcule une zone de recherche). Ici c'est juste de
      // l'AFFICHAGE en grand des infos vitales (position + cap boussole),
      // désactive tout le superflu. Utile pour lire ses coordonnées et
      // son heading en grand format sans avoir à pinch-zoomer la sidebar.
      {
        icone: "🚨",
        titre: "Mode urgence — Affichage XL (position + cap)",
        cssClass: "kta-sous-action-urgence",
        onClick: function() {
          if (window.EmergencyMode && typeof window.EmergencyMode.activer === "function") {
            window.EmergencyMode.activer();
          } else {
            alert("Mode urgence indisponible (EmergencyMode non chargé).");
          }
        }
      },
      // 🆕 v1.11.3 V2.3 — 🎬 Replay du parcours tracker. Ouvre une modale
      // avec slider timeline + play/pause + sélecteur vitesse (0.5x → 10x)
      // + bouton export CSV. La timeline est cumulée depuis startTracking
      // (les recalages 📍 sont marqués comme anchors). Visible si tracker
      // jamais activé, mais clic affiche un toast informatif si timeline
      // vide (= "active le tracking d'abord puis viens replay").
      {
        icone: "🎬",
        titre: "Replay du parcours tracker (timeline datée)",
        onClick: function() {
          if (window.MyKTAMapTrackerReplay && typeof window.MyKTAMapTrackerReplay.ouvrirModale === "function") {
            window.MyKTAMapTrackerReplay.ouvrirModale();
          } else {
            alert("Module Replay tracker indisponible. Recharge la page si le problème persiste.");
          }
        }
      }
      // 🚫 v1.11.4 V2.4 : bouton 🔥 Heatmap retiré depuis v1.12.0
      // (KARMA "on désactive ce module, on garde de côté le code").
      // L'utilité n'était pas claire dans le contexte cataphile actuel
      // (tracker session-only RAM, pas de cumul multi-session). Le code
      // reste dans js/heatmap.js + le wiring est prêt — pour réactiver
      // il suffit de restaurer le bloc ci-dessous + décommenter le
      // <script> dans index.html + sw.js.
      /*
      ,{
        icone: "🔥",
        titre: "Heatmap — densité tracker + points",
        onClick: function() {
          if (window.MyKTAMapHeatmap && typeof window.MyKTAMapHeatmap.ouvrirModale === "function") {
            window.MyKTAMapHeatmap.ouvrirModale();
          } else {
            alert("Module Heatmap indisponible. Recharge la page si le problème persiste.");
          }
        }
      }
      */
    ]
  });

  // 7. MESURE
  _creerGroupeAccordeon({
    id: "mesure",
    iconePrincipale: "📐",
    titre: "Mesure",
    sousActions: [
      // 🔧 v1.12.0-fix (KARMA "le mode calcul de surface ne fonctionne pas
      // ... le mode utilisation n'est pas logique") : refonte des 2 boutons
      // mesure en 2 ACTIONS DISTINCTES exclusives au lieu d'un toggle séparé :
      //   - 📐 Distance (polyline) : active mode mesure + force _measureMode="distance"
      //   - ⬛ Surface  (polygone) : active mode mesure + force _measureMode="surface"
      // Avant : le toggle 📏/⬛ changeait juste le mode SANS activer modeMesure,
      // donc clic sur ⬛ alors que modeMesure=false → aucun effet au click carte.
      // Maintenant : chaque bouton ACTIVE le mode mesure ET sélectionne son
      // sous-mode. Click handlers identiques au pattern groupe Tracés (un seul
      // sous-mode actif à la fois, re-clic désactive).
      {
        icone: "📐",
        titre: "Mesurer une DISTANCE (polyline)",
        onClick: function(btnSub) {
          const dejaActif = btnSub.classList.contains("kta-actif");
          _desactiverTousLesModes();
          if (dejaActif) {
            window.modeMesure = false;
            _setGroupeModeActif("mesure", false);
            return;
          }
          // Switch mode AVANT d'activer (cleanup propre des labels segments si
          // on revient d'un mode surface).
          if (typeof window.setMeasureMode === "function") {
            window.setMeasureMode("distance");
          }
          window.modeMesure = true;
          btnSub.classList.add("kta-actif");
          _modesActifs["mesure"] = {
            btnEl: btnSub,
            desactiverFn: function() {
              window.modeMesure = false;
              btnSub.classList.remove("kta-actif");
              _setGroupeModeActif("mesure", false);
            }
          };
          _setGroupeModeActif("mesure", true, "📐");
        }
      },
      {
        icone: "⬛",
        titre: "Mesurer une SURFACE (polygone fermé)",
        onClick: function(btnSub) {
          const dejaActif = btnSub.classList.contains("kta-actif");
          _desactiverTousLesModes();
          if (dejaActif) {
            window.modeMesure = false;
            _setGroupeModeActif("mesure", false);
            return;
          }
          // Switch mode AVANT d'activer pour cacher la polyline et afficher
          // le polygon sur la map.
          if (typeof window.setMeasureMode === "function") {
            window.setMeasureMode("surface");
          }
          window.modeMesure = true;
          btnSub.classList.add("kta-actif");
          _modesActifs["mesure"] = {
            btnEl: btnSub,
            desactiverFn: function() {
              window.modeMesure = false;
              btnSub.classList.remove("kta-actif");
              _setGroupeModeActif("mesure", false);
            }
          };
          // Reflet sur le bouton principal du groupe pour qu'on voie d'un
          // coup d'œil qu'on est en mode surface (au lieu de l'icône 📐 par
          // défaut du groupe Mesure).
          _setGroupeModeActif("mesure", true, "⬛");
          if (window.OOMGuard && window.OOMGuard.showToast) {
            window.OOMGuard.showToast(
              "⬛ Mode Surface — clique 3 points minimum, l'aire s'affiche en bas-gauche.",
              "info"
            );
          }
        }
      },
      {
        icone: "❌",
        titre: "Effacer (dernier point ou tout)",
        onClick: function() {
          // 🆕 v1.12.0-fix : 2 mesures indépendantes possibles → choix
          // granulaire. "Dernier point" cible la mesure du mode actif
          // (drive par window.getMeasureMode). Les boutons "Toute la X"
          // n'apparaissent que si la mesure correspondante a au moins
          // 1 point. Bouton "Tout effacer" disponible dès qu'au moins
          // une des 2 mesures existe.
          const ptsD = (window.getMeasurePoints        ? window.getMeasurePoints()        : []) || [];
          const ptsS = (window.getMeasurePointsSurface ? window.getMeasurePointsSurface() : []) || [];
          if (ptsD.length === 0 && ptsS.length === 0) return;

          const activeMode = (typeof window.getMeasureMode === "function") ? window.getMeasureMode() : "distance";
          const ptsActive  = (activeMode === "surface") ? ptsS : ptsD;
          const labelActive = (activeMode === "surface") ? "⬛ surface" : "📐 distance";

          const choix = [];
          if (ptsActive.length > 0) {
            choix.push({
              label: "Dernier point — " + labelActive, icon: "↩️",
              desc: ptsActive.length + " point(s) sur la mesure " + labelActive,
              onClick: function() { if (window.removeLastMeasurePoint) window.removeLastMeasurePoint(); }
            });
          }
          if (ptsD.length > 0) {
            choix.push({
              label: "Toute la distance 📐", icon: "🗑️", danger: true,
              desc: ptsD.length + " point(s)",
              onClick: function() { if (window.resetMesureMode) window.resetMesureMode("distance"); }
            });
          }
          if (ptsS.length > 0) {
            choix.push({
              label: "Toute la surface ⬛", icon: "🗑️", danger: true,
              desc: ptsS.length + " point(s)",
              onClick: function() { if (window.resetMesureMode) window.resetMesureMode("surface"); }
            });
          }
          if (ptsD.length > 0 && ptsS.length > 0) {
            choix.push({
              label: "Tout effacer (📐 + ⬛)", icon: "🗑️", danger: true,
              onClick: function() { if (window.resetMesure) window.resetMesure(); }
            });
          }

          _choixSuppression("Mesure", "Que veux-tu effacer ?", choix);
        }
      }
    ]
  });

  // 8. ÉDITION
  _creerGroupeAccordeon({
    id: "edition",
    iconePrincipale: "✏️",
    titre: "Édition de points",
    sousActions: [
      {
        icone: "✏️",
        titre: "Activer le mode ajout de point",
        onClick: function(btnSub) {
          const dejaActif = btnSub.classList.contains("kta-actif");
          _desactiverTousLesModes();
          if (dejaActif) {
            window.modeEdition = false;
            _setGroupeModeActif("edition", false);
            return;
          }
          window.modeEdition = true;
          btnSub.classList.add("kta-actif");
          _modesActifs["edition"] = {
            btnEl: btnSub,
            desactiverFn: function() {
              window.modeEdition = false;
              btnSub.classList.remove("kta-actif");
              _setGroupeModeActif("edition", false);
            }
          };
          _setGroupeModeActif("edition", true);
        }
      },
      {
        icone: "🗑️",
        titre: "Effacer (dernier point ou tous)",
        onClick: function() {
          const pts = window.getEditorPoints ? window.getEditorPoints() : [];
          if (pts.length === 0) return;
          _choixSuppression(
            "Points ajoutés", "Que veux-tu effacer ?",
            [
              { label: "Dernier point", icon: "↩️",
                desc: pts.length + " point(s) au total — supprime le plus récent",
                onClick: function() { if (window.removeLastEditorPoint) window.removeLastEditorPoint(); }
              },
              { label: "Tous les points", icon: "🗑️", danger: true,
                desc: "Action irréversible",
                onClick: function() {
                  if (window.setEditorPoints) window.setEditorPoints([]);
                  if (window.renderEditorPoints) window.renderEditorPoints();
                }
              }
            ]
          );
        }
      }
    ]
  });

  // 9. TRACÉS
  // Helper local : active un type de tracé
  function _activerRoute(type, btnCible, iconeReflet) {
    const dejaActif = window.modeRoad === type;
    _desactiverTousLesModes();

    // Désactivation interne route
    if (window.modeRoad) toggleRoadMode(window.modeRoad);
    const grp = _groupes["traces"];
    if (grp) grp.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
    _setGroupeModeActif("traces", false);

    if (dejaActif) return;

    toggleRoadMode(type);
    btnCible.classList.add("kta-actif");
    _modesActifs["road"] = {
      btnEl: btnCible,
      desactiverFn: function() {
        if (window.modeRoad) toggleRoadMode(window.modeRoad);
        if (grp) grp.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
        _setGroupeModeActif("traces", false);
      }
    };
    _setGroupeModeActif("traces", true, iconeReflet);
  }

  // 🏗️ Multi-niveau : construction dynamique des sous-actions selon le toggle.
  // Si multiLevel = false (defaut) → liste identique à v147 (retro-compat).
  // Si multiLevel = true → ajout sous-action 🪜 Jonction interniveau juste
  // apres 🟨 Chemin. La pastille de niveau n'est PLUS dans la sidebar : elle
  // a ete deplacee dans un Leaflet control top-left sous le zoom (cf
  // _initLevelFilterControl) pour rester accessible peu importe l'etat de
  // l'accordeon ET pour eviter le debordement texte du sous-action button.
  const _isMultiLevel = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);

  const _sousActionsTraces = [];

  _sousActionsTraces.push(
    { icone: "🟩", titre: "Route principale",
      onClick: function(btn) { _activerRoute("principal",  btn, "🟩"); } },
    { icone: "🟪", titre: "Route secondaire",
      onClick: function(btn) { _activerRoute("secondaire", btn, "🟪"); } },
    { icone: "🟨", titre: "Chemin",
      onClick: function(btn) { _activerRoute("chemin",     btn, "🟨"); } }
  );

  if (_isMultiLevel) {
    _sousActionsTraces.push({
      icone: "🪜",
      titre: "Jonction interniveau",
      onClick: function(btn) {
        // Toggle (Bug 4 fix v148.test) : si le mode jonction est deja actif,
        // re-clic = on désactive proprement le mode (cohérent avec le
        // comportement des autres types via _activerRoute). Sinon → ouvre
        // la modale de saisie from/to.
        if (window.modeRoad === "jonction") {
          _fermerModeRoad();
          return;
        }
        _ouvrirCreationJonction(btn);
      }
    });
  }

  _sousActionsTraces.push(
    { icone: "📏", titre: "Distance totale (filtres)",
        onClick: function() {
          if (typeof window.ouvrirRoadsDistanceFloater === "function") {
            window.ouvrirRoadsDistanceFloater();
          }
        }
      },
      { icone: "🧹", titre: "Effacer",
        onClick: function() {
          const roads = window.getRoads ? window.getRoads() : [];
          if (roads.length === 0) return;
          const dernier = roads[roads.length - 1];
          const nbPts = dernier?.points?.length || 0;
          // Compte uniquement les tracés selectionnables (pas itinerary).
          // 🪜 v169 (Karma_dev) : jonction incluse dans les selectionnables —
          // l'user peut cliquer sur une jonction pour la supprimer, cohérent
          // avec les autres tracés.
          const tracesSelectables = roads.filter(function(r) {
            return r && ["principal", "secondaire", "chemin", "jonction"].indexOf(r.type) !== -1;
          });
          _choixSuppression(
            "Tracés", "Que veux-tu effacer ?",
            [
              { label: "Dernier point du tracé", icon: "↩️",
                desc: nbPts + " point(s) sur le dernier tracé",
                onClick: function() { if (window.removeLastRoadPoint) window.removeLastRoadPoint(); } },
              { label: "Dernier tracé entier", icon: "✂️",
                desc: roads.length + " tracé(s) au total",
                onClick: function() {
                  // Capturer la ref du tracé en cours AVANT la suppression :
                  // si removeLastRoad efface justement la road en cours, il
                  // faut fermer le mode (sinon icone reste allumee mais clic
                  // map fait rien car modeRoad = null cote road.js).
                  const before = (typeof window.getCurrentRoad === "function") ? window.getCurrentRoad() : null;
                  if (window.removeLastRoad) window.removeLastRoad();
                  const after = (typeof window.getCurrentRoad === "function") ? window.getCurrentRoad() : null;
                  if (before && !after) _fermerModeRoad();
                } },
              { label: "Sélectionner un tracé à supprimer", icon: "🎯",
                desc: "Clique sur le tracé sur la carte (" + tracesSelectables.length + " disponibles)",
                onClick: function() {
                  if (typeof window.activerModeSuppressionTraceClic === "function") {
                    window.activerModeSuppressionTraceClic();
                  }
                } },
              { label: "Tous les tracés", icon: "🗑️", danger: true,
                desc: "Annulable via ⏪ Ctrl+Z",
                onClick: function() {
                  // 🆕 v1.11.0 Undo/Redo : snapshot before reset
                  const _hb = window.HistoryManager ? window.HistoryManager.captureState() : null;
                  if (window.resetRoads) window.resetRoads();
                  // resetRoads vide tout y compris currentRoad ET coupe
                  // window.modeRoad → on doit fermer le mode UI sans condition.
                  _fermerModeRoad();
                  if (window.HistoryManager && _hb) {
                    window.HistoryManager.record("Supprimer tous les tracés", _hb);
                  }
                } }
            ]
          );
        }
      }
  );

  _creerGroupeAccordeon({
    id: "traces",
    iconePrincipale: "🛣️",
    titre: "Tracés / Routes",
    sousActions: _sousActionsTraces
  });

  // 10. ZONES (polygones remplis : remblais / effondrement)
  function _activerZone(type, btnCible, iconeReflet) {
    const dejaActif = window.modeZone === type;
    _desactiverTousLesModes();

    // Désactivation interne zone
    if (window.modeZone) toggleZoneMode(window.modeZone);
    const grpZ = _groupes["zones"];
    if (grpZ) grpZ.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
    _setGroupeModeActif("zones", false);

    if (dejaActif) return;

    toggleZoneMode(type);
    btnCible.classList.add("kta-actif");
    _modesActifs["zone"] = {
      btnEl: btnCible,
      desactiverFn: function() {
        if (window.modeZone) toggleZoneMode(window.modeZone);
        if (grpZ) grpZ.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
        _setGroupeModeActif("zones", false);
      }
    };
    _setGroupeModeActif("zones", true, iconeReflet);
  }

  _creerGroupeAccordeon({
    id: "zones",
    iconePrincipale: "⬛",
    titre: "Zones (remblais / effondrements / eau / inaccessible)",
    sousActions: [
      { icone: "⬛", titre: "Zone de remblais",
        onClick: function(btn) { _activerZone("remblais",     btn, "⬛"); } },
      { icone: "🟥", titre: "Zone d'effondrement",
        onClick: function(btn) { _activerZone("effondrement", btn, "🟥"); } },
      { icone: "🟦", titre: "Zone d'eau",
        onClick: function(btn) { _activerZone("eau",          btn, "🟦"); } },
      // 🚫 v169 (Karma_dev) : zone bloquante pour le pathfinder. Hachures
      // rouge/noir 45°. Tout segment de route qui traverse est inutilisable
      // pour le calcul d'itinéraire (= contrainte dure).
      { icone: "⛔", titre: "Zone inaccessible (bloque l'itinéraire)",
        onClick: function(btn) { _activerZone("inaccessible", btn, "⛔"); } },
      { icone: "✅", titre: "Fermer la zone en cours",
        onClick: function() {
          if (!window.modeZone) {
            _alertCharte(
              "Aucune zone en cours",
              "Active d'abord un type de zone (remblais, effondrement, eau, ou inaccessible) avant de tenter de la fermer.",
              "⛔"
            );
            return;
          }
          if (window.fermerZoneEnCours) {
            const ok = window.fermerZoneEnCours();
            if (!ok) {
              _alertCharte(
                "Pas assez de points",
                "Une zone est un polygone fermé. Place <strong>au moins 3 points</strong> sur la carte avant de la fermer.",
                "📐"
              );
            }
          }
        }
      },
      { icone: "🧹", titre: "Effacer",
        onClick: function() {
          const zones = window.getZones ? window.getZones() : [];
          if (zones.length === 0) return;

          // Compter les zones fermées (différentes de currentZone)
          const nbZonesFermees = zones.length;
          // Compte les zones fermables/supprimables (au moins 3 points)
          const nbSelectables = zones.filter(function(z) {
            return z && Array.isArray(z.points) && z.points.length >= 3;
          }).length;

          _choixSuppression(
            "Zones", "Que veux-tu effacer ?",
            [
              { label: "Annuler le dernier point", icon: "↩️",
                desc: "Sur la zone en cours ou la dernière zone",
                onClick: function() { if (window.removeLastZonePoint) window.removeLastZonePoint(); } },
              // 🆕 v1.9.4 (KARMA "supprimer d'un coup le tracé en cours") :
              // removeLastZone priorise désormais currentZone si existe,
              // sinon la dernière fermée. Label adapté pour clarifier.
              { label: "Dernière zone (en cours OU fermée)", icon: "✂️",
                desc: nbZonesFermees + " zone(s) fermée(s) au total",
                onClick: function() {
                  // Symetrique du fix roads : si la zone en cours vient
                  // d'etre supprimee, on ferme le mode UI (sinon icone
                  // reste allumee et clic map fait rien).
                  const before = (typeof window.getCurrentZone === "function") ? window.getCurrentZone() : null;
                  if (window.removeLastZone) window.removeLastZone();
                  const after = (typeof window.getCurrentZone === "function") ? window.getCurrentZone() : null;
                  if (before && !after) _fermerModeZone();
                } },
              { label: "Sélectionner une zone à supprimer", icon: "🎯",
                desc: "Clique sur la zone sur la carte (" + nbSelectables + " disponibles)",
                onClick: function() {
                  if (typeof window.activerModeSuppressionZoneClic === "function") {
                    window.activerModeSuppressionZoneClic();
                  }
                } },
              { label: "Toutes les zones", icon: "🗑️", danger: true,
                desc: "Annulable via ⏪ Ctrl+Z",
                onClick: function() {
                  // 🆕 v1.11.0 Undo/Redo : snapshot before reset
                  const _hb = window.HistoryManager ? window.HistoryManager.captureState() : null;
                  if (window.resetZones) window.resetZones();
                  // resetZones reset currentZone + window.modeZone → on ferme
                  // le mode UI inconditionnellement.
                  _fermerModeZone();
                  if (window.HistoryManager && _hb) {
                    window.HistoryManager.record("Supprimer toutes les zones", _hb);
                  }
                } }
            ]
          );
        }
      }
    ]
  });

  // 🆕 v1.9.3-A1.a — 11. STRUCTURES (piliers + murs)
  // Calqué sur Zones (techniquement c'est des polygones aussi) mais
  // sémantique différente : représentent des éléments PHYSIQUES de la
  // carrière (piliers de 1ère/2e masse, murs). Bloqueront le pathfinder
  // en A1.b (pas encore actif en A1.a). Position : entre Zones et
  // Tracker dans la sidebar droite refonte (ou en queue topright si
  // legacy UI).
  function _activerStructure(type, btnCible, iconeReflet) {
    const dejaActif = window.modeStructure === type;
    _desactiverTousLesModes();

    // Désactivation interne structure (équivalent du flow zones)
    if (window.modeStructure && typeof window.toggleStructureMode === "function") {
      window.toggleStructureMode(window.modeStructure);
    }
    const grpS = _groupes["structures"];
    if (grpS) grpS.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
    _setGroupeModeActif("structures", false);

    if (dejaActif) return;

    if (typeof window.toggleStructureMode === "function") {
      window.toggleStructureMode(type);
    }
    btnCible.classList.add("kta-actif");
    _modesActifs["structure"] = {
      btnEl: btnCible,
      desactiverFn: function() {
        if (window.modeStructure && typeof window.toggleStructureMode === "function") {
          window.toggleStructureMode(window.modeStructure);
        }
        if (grpS) grpS.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
        _setGroupeModeActif("structures", false);
      }
    };
    _setGroupeModeActif("structures", true, iconeReflet);
  }

  _creerGroupeAccordeon({
    id: "structures",
    iconePrincipale: "🏛️",
    titre: "Structures (piliers / murs)",
    sousActions: [
      // 🟡 Pilier 1ère masse : icone rond jaune (= couleur charte MKM,
      // cohérent avec le fill #f4c542 de la structure rendue sur carte).
      // KARMA-fix : 1ère masse en JAUNE (couleurs inversées par rapport
      // au draft initial qui avait orange / jaune dans le mauvais sens).
      // En multi-niveau : tagué au niveau actif.
      { icone: "🟡", titre: "Pilier 1ère masse (jaune)",
        onClick: function(btn) { _activerStructure("pilier-1", btn, "🟡"); } },
      // 🟠 Pilier 2e masse : icone rond orange (fill #ff9933).
      // En multi-niveau : AUTO-tagué à `activeLevel - 1` (cf. structures.js)
      // car structurellement la masse inférieure visible depuis l'actuelle.
      { icone: "🟠", titre: "Pilier 2e masse (orange) — niveau -1 auto",
        onClick: function(btn) { _activerStructure("pilier-2", btn, "🟠"); } },
      // 🔵 Mur : KARMA "rond bleu pour pas confondre avec icône eau"
      // (la zone eau utilise 🟦 carré bleu clair, ici on prend ROND bleu
      // foncé pour distinguer visuellement).
      { icone: "🔵", titre: "Mur (bleu foncé)",
        onClick: function(btn) { _activerStructure("mur", btn, "🔵"); } },
      // 🆕 v1.9.3-A1.b.2 : fronts de taille (polylines épaisses sans
      // contour). KARMA : "ce sont des tracé ok mais il reste dans
      // 'structure'". Couleurs INVERSÉES vs piliers : front-1 = orange
      // (cohérent avec pilier-2), front-2 = jaune (cohérent avec pilier-1).
      // Même règle multi-niveau que les piliers : front-2 auto-tagué
      // activeLevel - 1.
      { icone: "🟨", titre: "Front de taille 1ère masse (jaune épais)",
        onClick: function(btn) { _activerStructure("front-1", btn, "🟨"); } },
      { icone: "🟧", titre: "Front de taille 2e masse (orange épais) — niveau -1 auto",
        onClick: function(btn) { _activerStructure("front-2", btn, "🟧"); } },
      { icone: "✅", titre: "Fermer la structure en cours",
        onClick: function() {
          if (!window.modeStructure) {
            _alertCharte(
              "Aucune structure en cours",
              "Active d'abord un type (pilier 1ère/2e masse, mur, ou front de taille 1ère/2e masse) avant de tenter de la fermer.",
              "🏛️"
            );
            return;
          }
          if (window.fermerStructureEnCours) {
            const ok = window.fermerStructureEnCours();
            if (!ok) {
              // 🆕 v1.9.3-A1.b.2 + fix2 : message adapté au type (front
              // = polyline 2pts min, pilier/mur = polygon 3pts min).
              // Modale charte au lieu d'alert() natif.
              const isFront = window.modeStructure === "front-1" || window.modeStructure === "front-2";
              if (isFront) {
                _alertCharte(
                  "Pas assez de points",
                  "Un front de taille est un tracé. Place <strong>au moins 2 points</strong> sur la carte avant de le valider.",
                  "📐"
                );
              } else {
                _alertCharte(
                  "Pas assez de points",
                  "Un pilier ou un mur est un polygone fermé. Place <strong>au moins 3 points</strong> sur la carte avant de le fermer.",
                  "📐"
                );
              }
            }
          }
        }
      },
      { icone: "🧹", titre: "Effacer",
        onClick: function() {
          const structures = window.getStructures ? window.getStructures() : [];
          if (structures.length === 0) return;

          const nbStructFermees = structures.length;
          const nbSelectables = structures.filter(function(s) {
            return s && Array.isArray(s.points) && s.points.length >= 3;
          }).length;

          _choixSuppression(
            "Structures", "Que veux-tu effacer ?",
            [
              { label: "Annuler le dernier point", icon: "↩️",
                desc: "Sur la structure en cours ou la dernière structure",
                onClick: function() {
                  if (window.removeLastStructurePoint) window.removeLastStructurePoint();
                } },
              // 🆕 v1.9.4 (KARMA "supprimer d'un coup le tracé en cours") :
              // removeLastStructure priorise désormais currentStructure si
              // existe, sinon la dernière fermée. Label adapté.
              { label: "Dernière structure (en cours OU fermée)", icon: "✂️",
                desc: nbStructFermees + " structure(s) fermée(s) au total",
                onClick: function() {
                  const before = (typeof window.getCurrentStructure === "function") ? window.getCurrentStructure() : null;
                  if (window.removeLastStructure) window.removeLastStructure();
                  const after = (typeof window.getCurrentStructure === "function") ? window.getCurrentStructure() : null;
                  if (before && !after) _fermerModeStructure();
                } },
              // 🆕 v1.9.4 (KARMA) : sélection au clic carte pour les structures,
              // pattern identique aux zones et tracés.
              { label: "Sélectionner une structure à supprimer", icon: "🎯",
                desc: "Clique sur la structure sur la carte (" + nbSelectables + " disponibles)",
                onClick: function() {
                  if (typeof window.activerModeSuppressionStructureClic === "function") {
                    window.activerModeSuppressionStructureClic();
                  }
                } },
              { label: "Toutes les structures", icon: "🗑️", danger: true,
                desc: "Annulable via ⏪ Ctrl+Z (" + nbSelectables + " supprimable(s))",
                onClick: function() {
                  // 🆕 v1.11.0 Undo/Redo : snapshot before reset
                  const _hb = window.HistoryManager ? window.HistoryManager.captureState() : null;
                  if (window.resetStructures) window.resetStructures();
                  _fermerModeStructure();
                  if (window.HistoryManager && _hb) {
                    window.HistoryManager.record("Supprimer toutes les structures", _hb);
                  }
                } }
            ]
          );
        }
      }
    ]
  });

  // Initialiser le clic extérieur (une seule fois)
  _initClickExterieur();

  // 🏗️ Multi-niveau : si actif pour ce plan, créer le bouton flottant
  // top-left (sous les boutons de zoom Leaflet) pour ouvrir la modale niveau.
  // Si OFF → rien n'est crée → comportement v147 strict.
  // 🆕 Refonte UI v1 : si mode refonte actif, le bouton a déjà été créé
  // au DÉBUT de initInterface (cf. fix ordre — Niveau doit être 3e après
  // Zoom, pas en queue après les groupes accordéon topleft). On skip
  // l'appel ici pour éviter la double création (qui serait nettoyée par
  // la garde interne mais reste inutile).
  if (window._refonteInterfaceActive !== true) {
    _initLevelFilterControl();
  }
}

// =========================
// 🏗️ MULTI-NIVEAU — Leaflet control top-left (pastille niveau actif)
// =========================
// Bouton carré 30x30 sous les boutons de zoom, style coherent avec les autres
// controles Leaflet (.leaflet-bar). Au clic → ouvre la modale niveau (active +
// visibles). Affiche le chiffre du niveau actif dans une pastille jaune.
// Refresh automatique du chiffre via getElementById("kta-niv-pastille-icone")
// dans _changerNiveauActif (l'ID est dans le span).
function _initLevelFilterControl() {
  if (!window.map) return;
  if (!window.APP_CONFIG || window.APP_CONFIG.multiLevel !== true) return;
  // Pour eviter de dupliquer si initInterface est appele 2 fois (shouldn't
  // happen mais safety net) : on detruit le precedent control si present.
  if (window._levelFilterControl) {
    try { window.map.removeControl(window._levelFilterControl); } catch(e) {}
    window._levelFilterControl = null;
  }

  const ctrl = L.control({ position: "topleft" });
  ctrl.onAdd = function() {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control kta-level-control");
    const a   = L.DomUtil.create("a", "kta-level-btn", div);
    a.href      = "javascript:void(0)";
    a.title     = "Niveau actif — Cliquer pour changer / filtrer";
    a.innerHTML = '<span class="kta-niv-pastille" id="kta-niv-pastille-icone">' +
                  (APP_CONFIG.activeLevel || 0) + '</span>';
    // Empeche les events de propager a la carte (clic-pan + zoom-wheel)
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    L.DomEvent.on(a, "click", function(e) {
      L.DomEvent.stop(e);
      _ouvrirSelecteurNiveau(a);
    });
    return div;
  };
  ctrl.addTo(window.map);
  window._levelFilterControl = ctrl;
  console.log("[MultiNiveau] Level filter control créé (top-left)");
}

// =========================
// ITINÉRAIRE — modale + mode clic + rendu du tracé calculé
// =========================
function _escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
  });
}

// =========================
// PAN + FLASH (style searchPoints) — pour les boutons "aller à" sur les waypoints
// =========================
let _itiFlashLayer = null;
function _panEtFlashSurPoint(p) {
  if (!window.map || !window.APP_CONFIG) return;
  const latlng = convertCoord(p.x, p.y);
  window.map.setView(latlng, window.map.getZoom(), { animate: false });
  window.map.invalidateSize();

  if (_itiFlashLayer) {
    try { window.map.removeLayer(_itiFlashLayer); } catch(e) {}
    _itiFlashLayer = null;
  }
  _itiFlashLayer = L.circleMarker(latlng, {
    radius:      24,
    color:       "#00d4ff",
    fillColor:   "#00d4ff",
    fillOpacity: 0,
    weight:      3,
    opacity:     0.9,
    interactive: false
  }).addTo(window.map);
  setTimeout(function() {
    if (_itiFlashLayer) {
      try { window.map.removeLayer(_itiFlashLayer); } catch(e) {}
      _itiFlashLayer = null;
    }
  }, 3000);
}

// =========================
// POPUP D'UN POINT — boutons "Y aller" / "Ajouter à l'itinéraire"
// =========================
// Appelees depuis le HTML inline genere par utils.js > buildPointPopupHtml.
// Toutes les routes session + embedded (visibles ou non) participent au calcul
// via le pathfinder qui utilise getAllEmbeddedRoads (cf suite 26).

// Modal charte : confirme remplacement de l'itineraire en cours
function _confirmRemplacerItineraire(onConfirm) {
  const existing = document.getElementById("kta-iti-confirm-replace");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "kta-iti-confirm-replace";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-modal" style="max-width:420px;">' +
      '<div class="kta-modal-icon" style="color:#f4c542;">⚠️</div>' +
      '<div class="kta-modal-titre">Itinéraire en cours</div>' +
      '<div class="kta-modal-texte">' +
        'Un itinéraire est déjà actif. Si tu continues, il sera ' +
        '<strong>remplacé</strong> par un nouvel itinéraire vers ce point ' +
        '(depuis ta position tracker actuelle).' +
      '</div>' +
      '<div class="kta-modal-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-iti-confirm-cancel" type="button">Annuler</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-iti-confirm-ok"     type="button">🧭 Y aller quand même</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _ferme() { modal.remove(); }

  document.getElementById("kta-iti-confirm-cancel").addEventListener("click", _ferme);
  document.getElementById("kta-iti-confirm-ok").addEventListener("click", function() {
    _ferme();
    if (typeof onConfirm === "function") onConfirm();
  });
  modal.addEventListener("click", function(e) { if (e.target === modal) _ferme(); });
}

// "🧭 Y aller" : depuis position tracker → ce point. Calcul direct + trace.
// Si itineraire actif → confirme avant remplacement.
window.itineraireYAller = function(x, y, nom) {
  if (typeof x !== "number" || typeof y !== "number") return;

  const pos = (typeof window.getTrackingPosition === "function")
    ? window.getTrackingPosition()
    : null;
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
    alert("Position du tracker indisponible.");
    return;
  }
  if (!window.Pathfinder) {
    alert("Module Pathfinder non chargé.");
    return;
  }

  const labelPoint = nom ? String(nom) : ("Point (" + Math.round(x) + ", " + Math.round(y) + ")");

  async function _calculer() {
    // Ferme la popup Leaflet ouverte (sinon elle reste affichee derriere le tracé)
    if (window.map) try { window.map.closePopup(); } catch(e) {}

    const waypoints = [
      {
        x: pos.x, y: pos.y, source: "tracker",
        label: "🧭 Position actuelle (" + Math.round(pos.x) + ", " + Math.round(pos.y) + ")"
      },
      { x: x, y: y, source: "search", label: labelPoint }
    ];

    try {
      // 🚫 v169 : computeRoute est async (await getAllPoints pour avoidTags).
      // Pour les itineraires depuis popup "Itineraire jusqu'ici", on n'a pas
      // d'avoidances configurees → mais on peut les charger depuis localStorage
      // pour cohérence avec la modale itineraire (l'user voudrait probablement
      // les memes preferences).
      const avoidPrefs = _getItiAvoidPrefs();
      const result = await window.Pathfinder.computeRoute(waypoints, {
        avoidPoints: avoidPrefs.points || [],
        avoidTags:   avoidPrefs.tags   || [],
        avoidRadius: avoidPrefs.radius || ITI_AVOID_DEFAULT_RADIUS
      });

      // Cree la road itineraire (sans flag _preview : on enregistre direct)
      const newRoad = {
        type:      "itinerary",
        points:    result.path,
        waypoints: waypoints
      };

      // Remove ancien itineraire + add le nouveau
      const currentRoads = window.getRoads ? window.getRoads() : [];
      const filtered = currentRoads.filter(function(r) { return r.type !== "itinerary"; });
      filtered.push(newRoad);
      if (window.setRoads) window.setRoads(filtered);

      // Update markers visuels des waypoints + label distance bottomleft
      _itineraryWaypoints = waypoints.map(function(w) { return Object.assign({}, w); });
      if (_itineraryMarkerLayer) _itineraryMarkerLayer.clearLayers();
      _itineraryWaypoints.forEach(function(p, i) {
        _ajouterWaypointVisuel(p, i + 1);
      });
      _majLabelDistanceItineraire();

      // Pan + flash sur le point d'arrivée pour indiquer ce qui vient d'etre calcule
      _panEtFlashSurPoint({ x: x, y: y });

    } catch(err) {
      alert("Erreur calcul itinéraire : " + (err.message || err));
    }
  }

  // Check si itineraire actif → confirm
  const existing = (window.getRoads ? window.getRoads() : [])
    .find(function(r) { return r.type === "itinerary"; });
  if (existing) {
    _confirmRemplacerItineraire(_calculer);
  } else {
    _calculer();
  }
};

// "➕ Itinéraire" : ajoute le point comme waypoint à un itinéraire existant
// (mode navigation) ou ouvre la modale en mode calcul avec ce waypoint pre-rempli.
window.itineraireAjouterWaypoint = function(x, y, nom) {
  if (typeof x !== "number" || typeof y !== "number") return;

  // Ferme la popup Leaflet
  if (window.map) try { window.map.closePopup(); } catch(e) {}

  const labelPoint = nom ? String(nom) : ("Point (" + Math.round(x) + ", " + Math.round(y) + ")");
  const newWaypoint = { x: x, y: y, source: "search", label: labelPoint };

  // Cas 1 : modale itineraire deja ouverte → ajoute direct a la liste
  if (document.getElementById("kta-itinerary-modal")) {
    _itineraryWaypoints.push(newWaypoint);
    _ajouterWaypointVisuel({ x: x, y: y }, _itineraryWaypoints.length);
    _rafraichirListeWaypointsModale();
    _majPanneauFloaterCount();
    return;
  }

  // Cas 2 : pas de modale ouverte → on ouvre, et on push le waypoint apres
  // ouverture (la modale restore _itineraryWaypoints depuis l'itineraire actif
  // si mode navigation, sinon vide en mode calcul).
  window.ouvrirItinerairModal();
  _itineraryWaypoints.push(newWaypoint);
  _ajouterWaypointVisuel({ x: x, y: y }, _itineraryWaypoints.length);
  _rafraichirListeWaypointsModale();
};

// =========================
// SUPPRESSION D'UN TRACÉ — mode clic visuel sur la carte
// =========================
// Active un mode "selection visuelle" : un floater apparait en bas et invite
// l'utilisateur a cliquer sur un tracé sur la carte. La polyline la plus
// proche du clic (dans une tolerance pixel) est supprimee immediatement.
// Pattern coherent avec le mode clic carte de l'itineraire (memes principes).

let _suppTraceClickHandler = null;
let _suppTraceFloater      = null;

function _pointSegmentDistanceFlat(p, a, b) {
  // Distance perpendiculaire d'un point a un segment, clampee aux extremites.
  // Coords plan (px image), pas latlng Leaflet.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function _desactiverModeSuppressionTrace() {
  if (_suppTraceClickHandler && window.map) {
    window.map.off("click", _suppTraceClickHandler);
    _suppTraceClickHandler = null;
  }
  if (_suppTraceFloater) {
    _suppTraceFloater.remove();
    _suppTraceFloater = null;
  }
}

window.activerModeSuppressionTraceClic = function() {
  if (!window.map) return;

  const allRoads = window.getRoads ? (window.getRoads() || []) : [];
  // 🪜 v169 (Karma_dev) : jonction incluse dans les tracés supprimables au clic
  const supprimables = allRoads.filter(function(r) {
    return r && Array.isArray(r.points) && r.points.length >= 2 &&
           ["principal", "secondaire", "chemin", "jonction"].indexOf(r.type) !== -1;
  });
  if (supprimables.length === 0) {
    alert("Aucun tracé session à supprimer.");
    return;
  }

  // Cleanup mode existant si l'utilisateur clique 2x consecutivement
  _desactiverModeSuppressionTrace();

  // Floater info + Annuler (pattern identique au mode clic itineraire)
  _suppTraceFloater = document.createElement("div");
  _suppTraceFloater.id = "kta-supp-trace-floater";
  _suppTraceFloater.className = "kta-supp-trace-floater";
  _suppTraceFloater.innerHTML =
    '<span class="kta-supp-trace-icon">🎯</span>' +
    '<span class="kta-supp-trace-msg">Clique sur un tracé pour le <strong>supprimer</strong></span>' +
    '<button class="kta-btn kta-btn-ghost" id="kta-supp-trace-annuler" type="button">✕ Annuler</button>';
  document.body.appendChild(_suppTraceFloater);

  document.getElementById("kta-supp-trace-annuler")
    .addEventListener("click", _desactiverModeSuppressionTrace);

  // Tolerance de selection en pixels image (pas screen). Plus la tolerance
  // est grande, plus c'est facile de cliquer sans precision. 20 px est un
  // bon compromis pour un doigt sur mobile / souris sur desktop.
  const TOLERANCE_PX = 20;

  _suppTraceClickHandler = function(e) {
    // Coords plan du click (cf convention du projet)
    const cx = e.latlng.lng;
    const cy = APP_CONFIG.imageHeight - e.latlng.lat;

    let closestRoad = null;
    let closestDist = Infinity;

    // Cherche la road dont un de ses segments est le plus proche du clic
    for (let r = 0; r < supprimables.length; r++) {
      const road = supprimables[r];
      const pts  = road.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = _pointSegmentDistanceFlat({ x: cx, y: cy }, pts[i], pts[i + 1]);
        if (d < closestDist) {
          closestDist = d;
          closestRoad = road;
        }
      }
    }

    if (!closestRoad || closestDist > TOLERANCE_PX) {
      console.log("[Suppr trace] Click à", Math.round(closestDist), "px — hors tolérance, ignoré");
      return;
    }

    // Si la road cliquee est la road en cours de trace, on devra fermer
    // le mode trace apres suppression (sinon icone reste allumee). setRoads
    // remet currentRoad = null cote road.js, donc on capture la ref AVANT.
    const currentBefore = (typeof window.getCurrentRoad === "function") ? window.getCurrentRoad() : null;
    const closeRoadMode = (currentBefore && currentBefore === closestRoad);

    // 🆕 v1.11.0 Undo/Redo : snapshot before
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState() : null;

    // Supprime la road
    const currentRoads = window.getRoads ? window.getRoads() : [];
    const filtered = currentRoads.filter(function(r) { return r !== closestRoad; });
    if (window.setRoads) window.setRoads(filtered);
    console.log("[Suppr trace] Tracé supprimé :", closestRoad.type,
                "(distance click :", Math.round(closestDist), "px) —",
                filtered.length, "tracé(s) restant(s)");

    if (closeRoadMode) _fermerModeRoad();

    _desactiverModeSuppressionTrace();

    if (window.HistoryManager && _historyBefore) {
      window.HistoryManager.record("Supprimer tracé au clic (" + (closestRoad.type || "?") + ")", _historyBefore);
    }
  };

  window.map.on("click", _suppTraceClickHandler);
};

// =========================
// SUPPRESSION D'UNE ZONE — mode clic visuel sur la carte
// =========================
// Pattern identique a la suppression de tracé clic (cf au-dessus). Detection
// en deux temps :
//   1. Test "point dans polygone" (ray casting) → zone qui contient le clic
//   2. Si aucun match interieur, fallback sur "click pres d'un bord" (tolerance
//      px) → utile pour cliquer juste a cote d'une petite zone.
// Si plusieurs zones contiennent le point (overlap), on prend la DERNIERE
// dessinée (top de la pile = ce que l'utilisateur voit le plus).

let _suppZoneClickHandler = null;
let _suppZoneFloater      = null;

// Algorithme classique du ray casting : on compte les intersections d'un rayon
// horizontal partant du point avec les arêtes du polygone. Nombre impair = dedans.
function _pointInPolygon(p, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
                      (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function _desactiverModeSuppressionZone() {
  if (_suppZoneClickHandler && window.map) {
    window.map.off("click", _suppZoneClickHandler);
    _suppZoneClickHandler = null;
  }
  if (_suppZoneFloater) {
    _suppZoneFloater.remove();
    _suppZoneFloater = null;
  }
}

window.activerModeSuppressionZoneClic = function() {
  if (!window.map) return;

  const allZones = window.getZones ? (window.getZones() || []) : [];
  const supprimables = allZones.filter(function(z) {
    return z && Array.isArray(z.points) && z.points.length >= 3;
  });
  if (supprimables.length === 0) {
    alert("Aucune zone session à supprimer.");
    return;
  }

  _desactiverModeSuppressionZone();

  _suppZoneFloater = document.createElement("div");
  _suppZoneFloater.id = "kta-supp-zone-floater";
  _suppZoneFloater.className = "kta-supp-trace-floater";  // reuse meme style charte
  _suppZoneFloater.innerHTML =
    '<span class="kta-supp-trace-icon">🎯</span>' +
    '<span class="kta-supp-trace-msg">Clique sur une zone pour la <strong>supprimer</strong></span>' +
    '<button class="kta-btn kta-btn-ghost" id="kta-supp-zone-annuler" type="button">✕ Annuler</button>';
  document.body.appendChild(_suppZoneFloater);

  document.getElementById("kta-supp-zone-annuler")
    .addEventListener("click", _desactiverModeSuppressionZone);

  // Tolerance pour le fallback "click pres du bord" (zone de petit polygon
  // sur lequel l'utilisateur clique a cote sans rentrer dedans).
  const TOLERANCE_BORD_PX = 20;

  _suppZoneClickHandler = function(e) {
    const cx = e.latlng.lng;
    const cy = APP_CONFIG.imageHeight - e.latlng.lat;
    const cp = { x: cx, y: cy };

    // 1) Test "dans le polygone" — on parcourt en ordre INVERSE pour prendre
    // la zone dessinée en dernier (top z-order visuel) si plusieurs s'overlap.
    let foundZone = null;
    for (let i = supprimables.length - 1; i >= 0; i--) {
      if (_pointInPolygon(cp, supprimables[i].points)) {
        foundZone = supprimables[i];
        break;
      }
    }

    // 2) Fallback : click pres d'un bord (segment du contour ferme)
    if (!foundZone) {
      let closestDist = Infinity;
      let closestZone = null;
      for (let z = 0; z < supprimables.length; z++) {
        const pts = supprimables[z].points;
        // Boucle fermee : segment final pts[N-1] → pts[0]
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const d = _pointSegmentDistanceFlat(cp, a, b);
          if (d < closestDist) {
            closestDist = d;
            closestZone = supprimables[z];
          }
        }
      }
      if (closestZone && closestDist <= TOLERANCE_BORD_PX) {
        foundZone = closestZone;
      }
    }

    if (!foundZone) {
      console.log("[Suppr zone] Click hors zone et hors tolérance bord, ignoré");
      return;
    }

    // Si la zone cliquee est la zone en cours, on ferme le mode UI apres
    // suppression (setZones reset currentZone → on capture la ref AVANT).
    const currentBefore = (typeof window.getCurrentZone === "function") ? window.getCurrentZone() : null;
    const closeZoneMode = (currentBefore && currentBefore === foundZone);

    // 🆕 v1.11.0 Undo/Redo : snapshot before
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState() : null;

    // Supprime la zone
    const currentZones = window.getZones ? window.getZones() : [];
    const filtered = currentZones.filter(function(z) { return z !== foundZone; });
    if (window.setZones) window.setZones(filtered);
    console.log("[Suppr zone] Zone supprimée :", foundZone.type, "—",
                filtered.length, "zone(s) restante(s)");

    if (closeZoneMode) _fermerModeZone();

    _desactiverModeSuppressionZone();

    if (window.HistoryManager && _historyBefore) {
      window.HistoryManager.record("Supprimer zone au clic (" + (foundZone.type || "?") + ")", _historyBefore);
    }
  };

  window.map.on("click", _suppZoneClickHandler);
};

// =========================
// 🏛️ SUPPRESSION STRUCTURE PAR CLIC CARTE (v1.9.4, KARMA)
// =========================
// Pattern copié sur activerModeSuppressionZoneClic + Trace, avec gestion
// hybride polygon (piliers + murs) / polyline (fronts) via le helper
// window.isStructurePolylineType exposé par structures.js.
//
//   - Structures POLYGON (pilier-1, pilier-2, mur) → test pointInPolygon
//     puis fallback distance bord (TOLERANCE_BORD_PX = 20)
//   - Structures POLYLINE (front-1, front-2) → test distance segment
//     (TOLERANCE_TRACE_PX = 15, plus serré car les fronts sont fins)
//
// Si la structure cliquée == currentStructure → on ferme le mode UI
// (pareil que pour zones, anti-state stale).
let _suppStructureClickHandler = null;
let _suppStructureFloater      = null;

function _desactiverModeSuppressionStructure() {
  if (_suppStructureClickHandler && window.map) {
    window.map.off("click", _suppStructureClickHandler);
    _suppStructureClickHandler = null;
  }
  if (_suppStructureFloater) {
    _suppStructureFloater.remove();
    _suppStructureFloater = null;
  }
}

window.activerModeSuppressionStructureClic = function() {
  if (!window.map) return;

  const allStructures = window.getStructures ? (window.getStructures() || []) : [];
  // Selectionnables = structures avec assez de points (min 2 polyline, 3 polygon)
  const supprimables = allStructures.filter(function(s) {
    if (!s || !Array.isArray(s.points)) return false;
    const isLine = (typeof window.isStructurePolylineType === "function")
                   && window.isStructurePolylineType(s.type);
    const minPts = isLine ? 2 : 3;
    return s.points.length >= minPts;
  });
  if (supprimables.length === 0) {
    alert("Aucune structure à supprimer.");
    return;
  }

  _desactiverModeSuppressionStructure();

  _suppStructureFloater = document.createElement("div");
  _suppStructureFloater.id = "kta-supp-structure-floater";
  _suppStructureFloater.className = "kta-supp-trace-floater";  // reuse meme style charte
  _suppStructureFloater.innerHTML =
    '<span class="kta-supp-trace-icon">🎯</span>' +
    '<span class="kta-supp-trace-msg">Clique sur une structure pour la <strong>supprimer</strong></span>' +
    '<button class="kta-btn kta-btn-ghost" id="kta-supp-structure-annuler" type="button">✕ Annuler</button>';
  document.body.appendChild(_suppStructureFloater);

  document.getElementById("kta-supp-structure-annuler")
    .addEventListener("click", _desactiverModeSuppressionStructure);

  const TOLERANCE_BORD_PX  = 20;  // polygon fallback bord
  const TOLERANCE_TRACE_PX = 15;  // polyline (fronts)

  _suppStructureClickHandler = function(e) {
    const cx = e.latlng.lng;
    const cy = APP_CONFIG.imageHeight - e.latlng.lat;
    const cp = { x: cx, y: cy };

    let foundStruct = null;

    // Étape 1 : test dans le polygone pour les structures polygon
    // Itération inverse pour prendre la structure dessinée en dernier si
    // plusieurs s'overlap (top z-order visuel).
    for (let i = supprimables.length - 1; i >= 0; i--) {
      const s = supprimables[i];
      const isLine = (typeof window.isStructurePolylineType === "function")
                     && window.isStructurePolylineType(s.type);
      if (!isLine && _pointInPolygon(cp, s.points)) {
        foundStruct = s;
        break;
      }
    }

    // Étape 2 : fallback distance bord/segment (utile pour les piliers
    // petits où l'user clique à côté, ET pour les fronts qui sont des
    // polylines fines).
    if (!foundStruct) {
      let closestDist = Infinity;
      let closestStruct = null;
      for (let z = 0; z < supprimables.length; z++) {
        const s = supprimables[z];
        const pts = s.points;
        const isLine = (typeof window.isStructurePolylineType === "function")
                       && window.isStructurePolylineType(s.type);
        const tolerance = isLine ? TOLERANCE_TRACE_PX : TOLERANCE_BORD_PX;
        // Pour polyline : segments ouverts (pts[N-1] → fin, pas de bouclage).
        // Pour polygon : segments fermés (pts[N-1] → pts[0]).
        const segCount = isLine ? pts.length - 1 : pts.length;
        for (let i = 0; i < segCount; i++) {
          const a = pts[i];
          const b = pts[isLine ? (i + 1) : ((i + 1) % pts.length)];
          if (!a || !b) continue;
          const d = _pointSegmentDistanceFlat(cp, a, b);
          if (d < closestDist && d <= tolerance) {
            closestDist = d;
            closestStruct = s;
          }
        }
      }
      if (closestStruct) foundStruct = closestStruct;
    }

    if (!foundStruct) {
      console.log("[Suppr structure] Click hors structure et hors tolérance, ignoré");
      return;
    }

    // Si la structure cliquée est la structure en cours, on ferme le mode UI
    // après suppression (setStructures reset currentStructure indirectement
    // via render — on capture la ref AVANT).
    const currentBefore = (typeof window.getCurrentStructure === "function")
                          ? window.getCurrentStructure() : null;
    const closeMode = (currentBefore && currentBefore === foundStruct);

    // Supprime la structure via le setter standard (anti désynchro avec
    // l'état interne du module).
    // 🆕 v1.11.0 Undo/Redo : snapshot before
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState() : null;
    const currentStructures = window.getStructures ? window.getStructures() : [];
    const filtered = currentStructures.filter(function(s) { return s !== foundStruct; });
    if (window.setStructures) window.setStructures(filtered);
    console.log("[Suppr structure] Supprimée :", foundStruct.type, "—",
                filtered.length, "structure(s) restante(s)");

    if (closeMode) _fermerModeStructure();

    _desactiverModeSuppressionStructure();

    if (window.HistoryManager && _historyBefore) {
      window.HistoryManager.record("Supprimer structure au clic (" + (foundStruct.type || "?") + ")", _historyBefore);
    }
  };

  window.map.on("click", _suppStructureClickHandler);
};

// =========================
// LABEL DISTANCE ITINÉRAIRE — au-dessus du label measure (bottomleft)
// =========================
let _itiDistanceCtrl = null;

// =========================
// Presets de vitesse de marche pour l'itinéraire
// =========================
// 4 modes choisis par l'utilisateur via segmented control dans la modale
// Itinéraire. Le mode courant est affiché dans le label bottomleft (icône +
// nom) et persisté en localStorage pour conserver le réglage entre sessions.
const ITI_SPEED_PRESETS = {
  bourre:  { kmh: 2, label: "Bourré",  icon: "🍺", hint: "Très lent, hésitant, terrain accidenté" },
  lente:   { kmh: 3, label: "Lente",   icon: "🐌", hint: "Prudent, étroitures, exploration" },
  normale: { kmh: 5, label: "Normale", icon: "🚶", hint: "Allure standard (défaut)" },
  rapide:  { kmh: 7, label: "Rapide",  icon: "🏃", hint: "Allure soutenue, parcours connu" }
};
const DEFAULT_ITI_SPEED       = "normale";
const ITI_SPEED_STORAGE_KEY   = "myktamap_iti_walking_preset";

// Temps de pause par point intermediaire (entre depart et arrivee).
// 2 waypoints = 0 pauses (depart + arrivee). 3 waypoints = 1 pause. N = N-2.
const TEMPS_PAUSE_PAR_POINT_MIN = 15;

function _getItiSpeedPreset() {
  try {
    const stored = localStorage.getItem(ITI_SPEED_STORAGE_KEY);
    if (stored && ITI_SPEED_PRESETS[stored]) return stored;
  } catch(e) {}
  return DEFAULT_ITI_SPEED;
}

function _setItiSpeedPreset(preset) {
  if (!ITI_SPEED_PRESETS[preset]) return false;
  try { localStorage.setItem(ITI_SPEED_STORAGE_KEY, preset); } catch(e) {}
  // Re-rendu du label bottomleft (la durée change avec la nouvelle vitesse)
  if (typeof window._majLabelDistanceItineraire === "function") {
    window._majLabelDistanceItineraire();
  }
  return true;
}

function _vitesseMarcheKmh() {
  const preset = _getItiSpeedPreset();
  return ITI_SPEED_PRESETS[preset].kmh;
}

// Retourne le temps total estime en minutes : marche + pauses intermediaires.
function _tempsItineraireMinutes(distanceM, nbWaypoints) {
  if (typeof distanceM !== "number" || distanceM <= 0) return 0;
  const tempsMarcheMin = distanceM / (_vitesseMarcheKmh() * 1000 / 60);  // m / (m/min)
  const nbPausesInter  = Math.max(0, (nbWaypoints || 0) - 2);
  const tempsPauseMin  = nbPausesInter * TEMPS_PAUSE_PAR_POINT_MIN;
  return tempsMarcheMin + tempsPauseMin;
}

// Formate une duree en minutes : "X min" si < 60, "Xh YY" sinon.
function _formatTempsMinutes(totalMin) {
  if (!totalMin || totalMin < 1) return "<1 min";
  if (totalMin < 60) return Math.round(totalMin) + " min";
  const heures  = Math.floor(totalMin / 60);
  const minutes = Math.round(totalMin - heures * 60);
  return heures + "h" + (minutes < 10 ? "0" + minutes : minutes);
}

function _afficherLabelDistanceItineraire(distanceM, nbWaypoints) {
  if (!window.map) return;
  // Détection d'un contrôle "détaché" : après un plan switch, map.remove()
  // a été appelé et le contrôle n'est plus rattaché à la map. _itiDistanceCtrl._map
  // devient null/undefined → on doit re-créer le contrôle, pas réutiliser l'ancien.
  if (!_itiDistanceCtrl || !_itiDistanceCtrl._map) {
    _itiDistanceCtrl = L.control({ position: "bottomleft" });
    _itiDistanceCtrl.onAdd = function() {
      const div = L.DomUtil.create("div", "leaflet-bar leaflet-control kta-iti-distance");
      div.innerHTML = '<span class="kta-iti-distance-icon">🗺️</span>Itinéraire : 0 m';
      // Raccourci : clic sur le label → ouvre la modale itineraire (mode
      // navigation ou calcul selon presence d'un itineraire actif).
      div.style.cursor = "pointer";
      div.title = "Cliquer pour ouvrir le menu Itinéraire";
      // Empecher Leaflet de capturer les events (sinon clic propage a la map)
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(div, "click", function() {
        if (typeof window.ouvrirItinerairModal === "function") {
          window.ouvrirItinerairModal();
        }
      });
      return div;
    };
    _itiDistanceCtrl.addTo(window.map);
  }
  const el = document.querySelector(".kta-iti-distance");
  if (el) {
    el.style.display = "block";
    const presetKey  = _getItiSpeedPreset();
    const preset     = ITI_SPEED_PRESETS[presetKey];
    const tempsMin   = _tempsItineraireMinutes(distanceM, nbWaypoints);
    const distFmt    = window.formatDistance(distanceM, 1);
    const tempsFmt   = _formatTempsMinutes(tempsMin);
    const nbPausesInter = Math.max(0, (nbWaypoints || 0) - 2);
    el.innerHTML =
      '<span class="kta-iti-distance-icon">🗺️</span>' +
      '<span class="kta-iti-distance-val">' + distFmt + '</span>' +
      '<span class="kta-iti-distance-sep">·</span>' +
      '<span class="kta-iti-distance-time">⏱️ ' + tempsFmt + '</span>' +
      '<span class="kta-iti-distance-sep">·</span>' +
      '<span class="kta-iti-distance-speed" title="Vitesse de marche : ' +
        preset.label + ' (' + preset.kmh + ' km/h)">' +
        preset.icon + ' ' + preset.label +
      '</span>';
    // Tooltip detaille pour la breakdown (vitesse + nb pauses)
    el.title =
      "Distance : " + distFmt + "\n" +
      "Temps estimé : " + tempsFmt +
      " (vitesse " + preset.label + " — " + preset.kmh + " km/h" +
      (nbPausesInter > 0
        ? " + " + nbPausesInter + " pause" + (nbPausesInter > 1 ? "s" : "") +
          " de " + TEMPS_PAUSE_PAR_POINT_MIN + " min"
        : "") +
      ")\nCliquer pour ouvrir le menu Itinéraire (changer la vitesse).";
  }
}

function _masquerLabelDistanceItineraire() {
  const el = document.querySelector(".kta-iti-distance");
  if (el) el.style.display = "none";
}

// Recalcule la distance d'un tracé itinerary à partir de ses points (en pixels
// plan) et la convertit en mètres via APP_CONFIG.scale (px/m).
function _distanceItineraireMeters(road) {
  if (!road || !Array.isArray(road.points) || road.points.length < 2) return 0;
  let totalPx = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    totalPx += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
  return totalPx / scale;
}

// Met à jour le label de distance en fonction de l'état actuel des roads.
// À appeler après chaque setRoads / save / discard / plan switch / session restore.
function _majLabelDistanceItineraire() {
  if (!window.getRoads || !window.map) return;
  const itineraryRoad = window.getRoads().find(function(r) { return r.type === "itinerary"; });
  if (itineraryRoad) {
    const distM = _distanceItineraireMeters(itineraryRoad);
    const nbWp  = Array.isArray(itineraryRoad.waypoints) ? itineraryRoad.waypoints.length : 2;
    _afficherLabelDistanceItineraire(distM, nbWp);
  } else {
    _masquerLabelDistanceItineraire();
  }
}
// Exposé globalement pour que main.js puisse appeler après lancerApplication
window._majLabelDistanceItineraire = _majLabelDistanceItineraire;

let _itineraryWaypoints   = [];
let _itineraryMarkerLayer = null;     // layer Leaflet contenant les markers numérotés
let _itineraryClickActive = false;
let _itineraryClickHandler = null;

function _ajouterWaypointVisuel(p, num) {
  if (!window.map) return;
  // Idem _afficherLabelDistanceItineraire : si l'ancien layerGroup a été détaché
  // par un plan switch (map.remove() précédent), on doit le recréer avant
  // d'ajouter des markers — sinon ils sont attachés à un layer mort qui
  // n'apparaîtra jamais sur la nouvelle map.
  if (!_itineraryMarkerLayer || !_itineraryMarkerLayer._map) {
    _itineraryMarkerLayer = L.layerGroup().addTo(window.map);
  }
  const icon = L.divIcon({
    className: "kta-itinerary-waypoint",
    html: '<div class="kta-iti-num">' + num + '</div>',
    iconSize:  [28, 28],
    iconAnchor: [14, 14]
  });
  const m = L.marker(convertCoord(p.x, p.y), { icon: icon, interactive: false })
              .addTo(_itineraryMarkerLayer);
  return m;
}

function _redessinerWaypoints() {
  if (_itineraryMarkerLayer) {
    _itineraryMarkerLayer.clearLayers();
  }
  _itineraryWaypoints.forEach(function(p, i) {
    _ajouterWaypointVisuel(p, i + 1);
  });
  _rafraichirListeWaypointsModale();
}

function _rafraichirListeWaypointsModale() {
  const cont = document.getElementById("kta-iti-waypoints-list");
  if (!cont) return;
  if (_itineraryWaypoints.length === 0) {
    cont.innerHTML = '<div class="kta-iti-empty">Aucun waypoint — clique sur la carte ou sélectionne un point ci-dessus</div>';
    return;
  }
  cont.innerHTML = _itineraryWaypoints.map(function(p, i) {
    const label = p.label || ("x:" + Math.round(p.x) + " y:" + Math.round(p.y));
    // 3 sources possibles : "search" (point existant), "tracker" (position
    // tracker), "click" (par defaut, clic carte). Icone + title adaptes.
    let sourceIcon, sourceTitle, sourceClass;
    if (p.source === "search") {
      sourceIcon  = "🎯";
      sourceTitle = "Point existant";
      sourceClass = "";
    } else if (p.source === "tracker") {
      sourceIcon  = "📍";
      sourceTitle = "Position tracker (snapshot)";
      sourceClass = " kta-iti-wp-icon-tracker";
    } else {
      sourceIcon  = "📍";
      sourceTitle = "Clic carte";
      sourceClass = "";
    }
    return '<div class="kta-iti-wp-row">' +
             '<span class="kta-iti-wp-num">' + (i + 1) + '</span>' +
             '<span class="kta-iti-wp-icon' + sourceClass + '" title="' + sourceTitle + '">' + sourceIcon + '</span>' +
             '<span class="kta-iti-wp-coord">' + _escapeHtml(label) + '</span>' +
             '<button class="kta-iti-wp-goto"   data-idx="' + i + '" title="Aller à ce waypoint">🎯</button>' +
             '<button class="kta-iti-wp-remove" data-idx="' + i + '" title="Retirer ce waypoint">✕</button>' +
           '</div>';
  }).join("");
  // Wire-up des boutons retirer
  Array.from(cont.querySelectorAll(".kta-iti-wp-remove")).forEach(function(btn) {
    btn.addEventListener("click", function() {
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx >= 0 && idx < _itineraryWaypoints.length) {
        _itineraryWaypoints.splice(idx, 1);
        _redessinerWaypoints();
        _majPanneauFloaterCount();
      }
    });
  });
  // Wire-up des boutons "aller à"
  Array.from(cont.querySelectorAll(".kta-iti-wp-goto")).forEach(function(btn) {
    btn.addEventListener("click", function() {
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx >= 0 && idx < _itineraryWaypoints.length) {
        const p = _itineraryWaypoints[idx];
        // Ferme la modale pour laisser voir la map (comportement style search)
        const modal = document.getElementById("kta-itinerary-modal");
        if (modal) modal.remove();
        _panEtFlashSurPoint(p);
      }
    });
  });
}

function _activerModeClicCarte() {
  if (_itineraryClickActive) return;
  _itineraryClickActive = true;
  if (window.map) {
    _itineraryClickHandler = function(e) {
      // Coords plan (cf. convention du projet : convertCoord inverse y)
      const x = e.latlng.lng;
      const y = APP_CONFIG.imageHeight - e.latlng.lat;
      _itineraryWaypoints.push({ x: x, y: y, source: "click" });
      _ajouterWaypointVisuel({ x: x, y: y }, _itineraryWaypoints.length);
      _rafraichirListeWaypointsModale();
      _majPanneauFloaterCount();
    };
    window.map.on("click", _itineraryClickHandler);
  }
}

function _desactiverModeClicCarte() {
  if (!_itineraryClickActive) return;
  _itineraryClickActive = false;
  if (window.map && _itineraryClickHandler) {
    window.map.off("click", _itineraryClickHandler);
  }
  _itineraryClickHandler = null;
}

function _viderItineraire() {
  _itineraryWaypoints = [];
  if (_itineraryMarkerLayer) {
    _itineraryMarkerLayer.clearLayers();
  }
}

// Mini panneau flottant en bas d'écran pendant le mode clic, pour ne pas
// bloquer la carte. Bouton "✓ Terminer" → re-affiche la modale principale.
let _itineraryFloater = null;
function _afficherPanneauItineraireFlottant(mainModal) {
  if (_itineraryFloater) _itineraryFloater.remove();
  const panneau = document.createElement("div");
  panneau.id = "kta-iti-floater";
  panneau.className = "kta-iti-floater";
  panneau.innerHTML =
    '<span class="kta-iti-floater-icon">📍</span>' +
    '<span class="kta-iti-floater-msg">' +
      'Mode clic actif — <strong id="kta-iti-floater-count">' + _itineraryWaypoints.length + '</strong> point(s)' +
    '</span>' +
    '<button class="kta-btn kta-btn-primary" id="kta-iti-floater-done" type="button">✓ Terminer</button>';
  document.body.appendChild(panneau);
  _itineraryFloater = panneau;

  document.getElementById("kta-iti-floater-done").addEventListener("click", function() {
    _desactiverModeClicCarte();
    if (_itineraryFloater) { _itineraryFloater.remove(); _itineraryFloater = null; }
    if (mainModal) {
      mainModal.style.display = "";
      _rafraichirListeWaypointsModale();
      const btn = document.getElementById("kta-iti-mode-click");
      if (btn) {
        btn.textContent = "📍 Activer mode clic carte";
        btn.classList.remove("kta-actif");
      }
    }
  });
}

function _majPanneauFloaterCount() {
  const el = document.getElementById("kta-iti-floater-count");
  if (el) el.textContent = _itineraryWaypoints.length;
}

// =========================
// 🚫 EVITEMENTS ITINERAIRE — preferences par plan (depuis v169 / Karma_dev)
// =========================
// Stockage localStorage par planId : { points: [{x,y,label,id?}], tags: [], radius: 100 }
// Restauration a l'ouverture de la modale itineraire, ecriture a chaque
// modification (ajout/suppression/changement radius). Reset via bouton dedie.

const ITI_AVOID_LS_PREFIX = "myktamap_route_avoid_";
const ITI_AVOID_DEFAULT_RADIUS = 100;

function _itiAvoidLsKey() {
  const planId = window._currentLoadedPlanId || "default";
  return ITI_AVOID_LS_PREFIX + planId;
}

function _getItiAvoidPrefs() {
  try {
    const raw = localStorage.getItem(_itiAvoidLsKey());
    if (!raw) return { points: [], tags: [], radius: ITI_AVOID_DEFAULT_RADIUS };
    const obj = JSON.parse(raw);
    return {
      points: Array.isArray(obj.points) ? obj.points : [],
      tags:   Array.isArray(obj.tags)   ? obj.tags   : [],
      radius: Number.isFinite(obj.radius) ? obj.radius : ITI_AVOID_DEFAULT_RADIUS
    };
  } catch(e) {
    return { points: [], tags: [], radius: ITI_AVOID_DEFAULT_RADIUS };
  }
}

function _setItiAvoidPrefs(prefs) {
  try {
    localStorage.setItem(_itiAvoidLsKey(), JSON.stringify(prefs));
  } catch(e) {}
}

// Liste des tags presents dans le plan (depuis SearchPoints) pour le dropdown
// "+ Ajouter un tag a eviter". Distincts, tries alphabetiquement.
// ASYNC depuis v169 : SearchPoints.getAllPoints est async (cache fetch). Le
// 1er appel peut prendre 1 frame, les suivants sont en cache. Structure des
// retours : [{point, source, layerId}, ...] — on lit `.point.tags`.
async function _itiAvoidGetAvailableTags() {
  if (typeof window.SearchPoints !== "object" ||
      typeof window.SearchPoints.getAllPoints !== "function") {
    return [];
  }
  try {
    const all = await window.SearchPoints.getAllPoints();
    if (!Array.isArray(all)) return [];
    const set = new Set();
    all.forEach(function(it) {
      const p = it && it.point;
      if (p && Array.isArray(p.tags)) {
        p.tags.forEach(function(t) { if (t) set.add(t); });
      }
    });
    return Array.from(set).sort();
  } catch(e) { return []; }
}

// 🚫 v169 (Karma_dev) : mode clic carte pour ajouter des points d'évitement
// directement en cliquant sur la map. Réutilise le pattern des waypoints mais
// avec un état séparé (sinon conflit avec le mode clic des waypoints).
//
// Flow :
//   1. Click bouton "📍 Cliquer sur la carte" → _activerModeClicAvoid
//   2. Modale cachée + floater orange "Mode clic évitement actif"
//   3. Chaque clic sur la map ajoute aux avoidPoints + persiste localStorage
//   4. Click "✓ Terminer" sur le floater → _desactiverModeClicAvoid + re-affiche modale

let _itiAvoidClickActive  = false;
let _itiAvoidClickHandler = null;
let _itiAvoidFloater      = null;

function _activerModeClicAvoid(mainModal) {
  if (_itiAvoidClickActive) return;
  _itiAvoidClickActive = true;
  if (!window.map) return;

  _itiAvoidClickHandler = function(e) {
    const x = e.latlng.lng;
    const y = APP_CONFIG.imageHeight - e.latlng.lat;
    const prefs = _getItiAvoidPrefs();
    prefs.points.push({
      x:     x,
      y:     y,
      label: "📍 Clic carte (" + Math.round(x) + ", " + Math.round(y) + ")",
      id:    null
    });
    _setItiAvoidPrefs(prefs);
    _majPanneauFloaterAvoidCount();
  };
  window.map.on("click", _itiAvoidClickHandler);

  // Cache la modale (pas remove → on garde son DOM pour réafficher)
  if (mainModal) mainModal.style.display = "none";

  // Floater orange (couleur thématique avoid) avec compteur live
  if (_itiAvoidFloater) _itiAvoidFloater.remove();
  const panneau = document.createElement("div");
  panneau.id = "kta-iti-avoid-floater";
  panneau.className = "kta-iti-floater kta-iti-avoid-floater";
  panneau.innerHTML =
    '<span class="kta-iti-floater-icon">🚫</span>' +
    '<span class="kta-iti-floater-msg">' +
      'Mode clic évitement actif — <strong id="kta-iti-avoid-floater-count">' + _getItiAvoidPrefs().points.length + '</strong> point(s) à éviter' +
    '</span>' +
    '<button class="kta-btn kta-btn-primary" id="kta-iti-avoid-floater-done" type="button">✓ Terminer</button>';
  document.body.appendChild(panneau);
  _itiAvoidFloater = panneau;

  document.getElementById("kta-iti-avoid-floater-done").addEventListener("click", function() {
    _desactiverModeClicAvoid();
    if (mainModal) {
      mainModal.style.display = "";
      _rafraichirListeAvoidPoints();
      const btn = document.getElementById("kta-iti-avoid-click-map");
      if (btn) {
        btn.textContent = "📍 Cliquer sur la carte";
        btn.classList.remove("kta-actif");
      }
    }
  });
}

function _desactiverModeClicAvoid() {
  if (!_itiAvoidClickActive) return;
  _itiAvoidClickActive = false;
  if (window.map && _itiAvoidClickHandler) {
    window.map.off("click", _itiAvoidClickHandler);
  }
  _itiAvoidClickHandler = null;
  if (_itiAvoidFloater) {
    _itiAvoidFloater.remove();
    _itiAvoidFloater = null;
  }
}

function _majPanneauFloaterAvoidCount() {
  const el = document.getElementById("kta-iti-avoid-floater-count");
  if (el) el.textContent = _getItiAvoidPrefs().points.length;
}

// Genere le HTML de la section "🚫 Preferences d'evitement" pour la modale
// itineraire. Replie par defaut via <details> (HTML natif). Composants :
//   - Recherche autocomplete (input + dropdown resultats)
//   - Saisie ID texte + bouton Ajouter
//   - Multi-select des tags (chips cliquables)
//   - Champ marge (px)
//   - Liste des points evites avec ✕
//   - Bouton 🗑️ Reset
function _htmlSectionAvoidItineraire(prefs) {
  const radiusVal = Number.isFinite(prefs.radius) ? prefs.radius : ITI_AVOID_DEFAULT_RADIUS;
  return '' +
    '<div class="kta-iti-section">' +
      '<details class="kta-iti-avoid-details">' +
        '<summary class="kta-iti-section-titre" style="cursor:pointer;">🚫 Préférences d\'évitement (optionnel)</summary>' +
        '<p class="kta-iti-help">' +
          'Définis des points ou tags que le pathfinder essaiera de ne PAS traverser. ' +
          'Si aucun chemin n\'existe en évitant ces contraintes, un fallback les ignore ' +
          'avec un message d\'avertissement. <em>Les zones inaccessibles ⛔ sont des ' +
          'contraintes dures séparées (toujours respectées).</em>' +
        '</p>' +

        // === Points à éviter ===
        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">📍 Points à éviter</div>' +
          '<div class="kta-iti-avoid-search-wrap">' +
            '<input type="text" id="kta-iti-avoid-search-input" class="kta-cfg-input" ' +
              'placeholder="🔍 Rechercher un point existant (nom, id, tag)…" autocomplete="off">' +
            '<div id="kta-iti-avoid-search-results" class="kta-iti-search-results"></div>' +
          '</div>' +
          '<div class="kta-iti-avoid-byid-wrap">' +
            '<input type="text" id="kta-iti-avoid-byid-input" class="kta-cfg-input" ' +
              'placeholder="Saisir un ID exact…" autocomplete="off" style="flex:1;">' +
            '<button id="kta-iti-avoid-byid-add" class="kta-btn kta-btn-ghost kta-btn-small" type="button">+ Ajouter par ID</button>' +
          '</div>' +
          // 🚫 v169 (Karma_dev) : bouton mode clic carte — bascule la modale en
          // floater, chaque clic sur la map ajoute un point d'évitement
          '<button id="kta-iti-avoid-click-map" class="kta-btn kta-btn-ghost kta-btn-small" type="button" style="margin-bottom:8px;">📍 Cliquer sur la carte</button>' +
          '<div id="kta-iti-avoid-points-list" class="kta-iti-avoid-list"></div>' +
        '</div>' +

        // === Tags à éviter ===
        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">🏷️ Tags à éviter</div>' +
          '<p class="kta-iti-help" style="margin:2px 0 6px; font-size:11.5px;">' +
            'Clique un tag pour le toggler. Tous les points avec ce tag seront évités.' +
          '</p>' +
          '<div id="kta-iti-avoid-tags-chips" class="kta-iti-avoid-tags-chips"></div>' +
        '</div>' +

        // === Marge ===
        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">📏 Marge autour des points à éviter</div>' +
          '<div style="display:flex; align-items:center; gap:8px;">' +
            '<input type="number" id="kta-iti-avoid-radius" class="kta-cfg-input" ' +
              'value="' + radiusVal + '" min="0" max="500" step="10" style="width:90px;">' +
            '<span style="font-size:12px; color:#8892a4;">px (défaut 100)</span>' +
          '</div>' +
        '</div>' +

        // === Reset ===
        '<button id="kta-iti-avoid-reset" class="kta-btn kta-btn-ghost kta-btn-small" type="button" style="margin-top:6px;">🗑️ Reset tous les évitements</button>' +
      '</details>' +
    '</div>';
}

// Re-rendu de la liste des points evites (chips avec ✕). Appelle apres
// chaque ajout/suppression. Lit prefs depuis localStorage.
function _rafraichirListeAvoidPoints() {
  const el = document.getElementById("kta-iti-avoid-points-list");
  if (!el) return;
  const prefs = _getItiAvoidPrefs();
  if (prefs.points.length === 0) {
    el.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">Aucun point à éviter pour le moment.</p>';
    return;
  }
  function _esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  el.innerHTML = prefs.points.map(function(p, idx) {
    return '<div class="kta-iti-avoid-chip">' +
             '<span class="kta-iti-avoid-chip-label">' + _esc(p.label || p.id || ("(" + p.x.toFixed(0) + "," + p.y.toFixed(0) + ")")) + '</span>' +
             '<button class="kta-iti-avoid-chip-remove" data-idx="' + idx + '" type="button" title="Retirer">✕</button>' +
           '</div>';
  }).join("");
  // Bind retraits
  el.querySelectorAll(".kta-iti-avoid-chip-remove").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const i = parseInt(btn.getAttribute("data-idx"), 10);
      if (!Number.isInteger(i)) return;
      const prefs2 = _getItiAvoidPrefs();
      prefs2.points.splice(i, 1);
      _setItiAvoidPrefs(prefs2);
      _rafraichirListeAvoidPoints();
    });
  });
}

// Re-rendu des chips de tags avec etat actif/inactif selon prefs.tags.
// ASYNC depuis v169 (await _itiAvoidGetAvailableTags). Pendant le chargement,
// on affiche un placeholder "Chargement…" pour ne pas laisser un vide visible.
async function _rafraichirChipsAvoidTags() {
  const el = document.getElementById("kta-iti-avoid-tags-chips");
  if (!el) return;
  el.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">Chargement des tags…</p>';
  const prefs = _getItiAvoidPrefs();
  const available = await _itiAvoidGetAvailableTags();
  // Si l'utilisateur a deja ferme la modale entre temps, le sub-element peut
  // ne plus exister — on re-check.
  const el2 = document.getElementById("kta-iti-avoid-tags-chips");
  if (!el2) return;
  if (available.length === 0) {
    el2.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">Aucun tag détecté dans les points de ce plan.</p>';
    return;
  }
  function _esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  el2.innerHTML = available.map(function(tag) {
    const active = prefs.tags.indexOf(tag) >= 0;
    return '<button class="kta-iti-avoid-tag-chip' + (active ? ' kta-iti-avoid-tag-chip-active' : '') + '" ' +
             'data-tag="' + _esc(tag) + '" type="button">' +
             (active ? '🚫 ' : '') + _esc(tag) +
           '</button>';
  }).join("");
  el2.querySelectorAll(".kta-iti-avoid-tag-chip").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const tag = btn.getAttribute("data-tag");
      const prefs2 = _getItiAvoidPrefs();
      const idx = prefs2.tags.indexOf(tag);
      if (idx >= 0) prefs2.tags.splice(idx, 1);
      else prefs2.tags.push(tag);
      _setItiAvoidPrefs(prefs2);
      _rafraichirChipsAvoidTags();
    });
  });
}

// Setup des handlers de la section evitement (recherche, ajout par ID, radius,
// reset). Appele apres injection du HTML dans la modale itineraire.
function _bindAvoidSectionHandlers() {
  // 1. Recherche autocomplete : reuse SearchPoints.findByQuery (ASYNC).
  // Structure retournee : [{point, source, layerId}, ...] — on lit `.point.*`.
  // Debounce 150ms pour eviter de spam le fetch a chaque keystroke.
  const searchInput = document.getElementById("kta-iti-avoid-search-input");
  const searchRes   = document.getElementById("kta-iti-avoid-search-results");
  if (searchInput && searchRes && window.SearchPoints &&
      typeof window.SearchPoints.findByQuery === "function") {
    let _searchDebounce = null;
    searchInput.addEventListener("input", function() {
      const q = searchInput.value.trim();
      if (_searchDebounce) clearTimeout(_searchDebounce);
      if (!q) { searchRes.innerHTML = ""; searchRes.style.display = "none"; return; }
      _searchDebounce = setTimeout(async function() {
        let results = [];
        try { results = await window.SearchPoints.findByQuery(q) || []; }
        catch(e) { results = []; }
        // Si l'input a change entre temps, on annule (la prochaine query
        // viendra en remplacement)
        if (searchInput.value.trim() !== q) return;
        if (results.length === 0) {
          searchRes.innerHTML = '<div class="kta-iti-search-result-empty">Aucun point trouvé</div>';
          searchRes.style.display = "block";
          return;
        }
        function _esc(s) {
          return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        searchRes.innerHTML = results.slice(0, 10).map(function(it, i) {
          const p = it.point;
          const label = p.nom || p.id || "(point sans nom)";
          const sub   = p.id  ? p.id : "";
          return '<div class="kta-iti-search-result" data-idx="' + i + '">' +
                   '<strong>' + _esc(label) + '</strong>' +
                   (sub ? ' <span style="color:#8892a4;">(' + _esc(sub) + ')</span>' : '') +
                 '</div>';
        }).join("");
        searchRes.style.display = "block";
        searchRes.querySelectorAll(".kta-iti-search-result").forEach(function(row, i) {
          row.addEventListener("click", function() {
            const it = results[i];
            if (!it || !it.point) return;
            const p = it.point;
            const prefs2 = _getItiAvoidPrefs();
            prefs2.points.push({
              x:     p.x,
              y:     p.y,
              label: p.nom || p.id || ("(" + (p.x ?? 0).toFixed(0) + "," + (p.y ?? 0).toFixed(0) + ")"),
              id:    p.id || null
            });
            _setItiAvoidPrefs(prefs2);
            _rafraichirListeAvoidPoints();
            searchInput.value = "";
            searchRes.innerHTML = "";
            searchRes.style.display = "none";
          });
        });
      }, 150);
    });
  }

  // 2. Ajout par ID texte
  const idInput = document.getElementById("kta-iti-avoid-byid-input");
  const idBtn   = document.getElementById("kta-iti-avoid-byid-add");
  if (idInput && idBtn && window.Pathfinder &&
      typeof window.Pathfinder.resolvePointById === "function") {
    function _ajouterParId() {
      const id = idInput.value.trim();
      if (!id) return;
      const resolved = window.Pathfinder.resolvePointById(id);
      if (!resolved) {
        alert("Aucun point trouvé avec l'ID/nom : \"" + id + "\"");
        return;
      }
      const prefs2 = _getItiAvoidPrefs();
      prefs2.points.push({
        x:     resolved.x,
        y:     resolved.y,
        label: (resolved.point && (resolved.point.nom || resolved.point.id)) || id,
        id:    (resolved.point && resolved.point.id) || id
      });
      _setItiAvoidPrefs(prefs2);
      _rafraichirListeAvoidPoints();
      idInput.value = "";
    }
    idBtn.addEventListener("click", _ajouterParId);
    idInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") { e.preventDefault(); _ajouterParId(); }
    });
  }

  // 2bis. 🚫 v169 (Karma_dev) : mode clic carte — bascule en floater, chaque
  // clic ajoute un point. Coexiste avec le mode clic waypoints (handlers
  // séparés via _itiAvoidClickHandler) → si l'user active les 2 modes en
  // même temps, c'est OK (clics partagés) mais peu utile en pratique.
  const clickMapBtn = document.getElementById("kta-iti-avoid-click-map");
  if (clickMapBtn) {
    clickMapBtn.addEventListener("click", function() {
      const mainModal = document.getElementById("kta-itinerary-modal");
      _activerModeClicAvoid(mainModal);
      // Indicateur visuel (devient inactif au "✓ Terminer" du floater)
      clickMapBtn.classList.add("kta-actif");
      clickMapBtn.textContent = "📍 Mode clic actif…";
    });
  }

  // 3. Champ radius
  const radiusInput = document.getElementById("kta-iti-avoid-radius");
  if (radiusInput) {
    radiusInput.addEventListener("change", function() {
      const v = parseInt(radiusInput.value, 10);
      const prefs2 = _getItiAvoidPrefs();
      prefs2.radius = (Number.isFinite(v) && v >= 0) ? v : ITI_AVOID_DEFAULT_RADIUS;
      _setItiAvoidPrefs(prefs2);
    });
  }

  // 4. Reset complet
  const resetBtn = document.getElementById("kta-iti-avoid-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function() {
      if (!confirm("Effacer tous les évitements (points + tags) ?")) return;
      _setItiAvoidPrefs({ points: [], tags: [], radius: ITI_AVOID_DEFAULT_RADIUS });
      _rafraichirListeAvoidPoints();
      _rafraichirChipsAvoidTags();
      if (radiusInput) radiusInput.value = String(ITI_AVOID_DEFAULT_RADIUS);
    });
  }

  // Premier rendu des chips + liste
  _rafraichirListeAvoidPoints();
  _rafraichirChipsAvoidTags();
}

window.ouvrirItinerairModal = function() {
  // Si une modale existe déjà, on la ferme et reset l'état
  const existing = document.getElementById("kta-itinerary-modal");
  if (existing) existing.remove();

  // Détection itinéraire actif : si une road de type "itinerary" existe,
  // on RESTAURE ses waypoints et on bascule en MODE NAVIGATION
  // (pas de calcul, juste les boutons pour aller voir chaque waypoint).
  const existingItinerary = (window.getRoads ? window.getRoads() : [])
    .find(function(r) { return r.type === "itinerary"; });

  const modeNavigation = !!(existingItinerary && Array.isArray(existingItinerary.waypoints) && existingItinerary.waypoints.length >= 2);

  if (modeNavigation) {
    // Restaure les waypoints et leurs markers visuels
    _itineraryWaypoints = existingItinerary.waypoints.map(function(w) { return Object.assign({}, w); });
    if (_itineraryMarkerLayer) _itineraryMarkerLayer.clearLayers();
    _itineraryWaypoints.forEach(function(p, i) {
      _ajouterWaypointVisuel(p, i + 1);
    });
  } else {
    _viderItineraire();
  }

  const titre = modeNavigation ? "🗺️ Itinéraire actif — Navigation" : "🗺️ Calculer un itinéraire";

  // ===== Section "Points de passage" UNIFIEE (mode calcul + mode navigation) =====
  // Les deux modes ont desormais les memes controles d'edition (ajout/suppression
  // de waypoints) → l'utilisateur peut modifier son itineraire actif sans
  // passer par "Recalculer" qui efface tout et recommence.
  // En mode navigation : on ajoute en plus une quick-nav (Debut/Fin/Tour) au-dessus
  // de la liste, pour acceder rapidement aux extremites du tracé.
  const quickNavHtml = modeNavigation
    ? '<div class="kta-iti-quicknav">' +
        '<button id="kta-iti-nav-debut" class="kta-btn kta-btn-primary" type="button">⏮️ Début</button>' +
        '<button id="kta-iti-nav-fin"   class="kta-btn kta-btn-primary" type="button">⏭️ Fin</button>' +
        '<button id="kta-iti-nav-tour"  class="kta-btn kta-btn-ghost"   type="button">🔁 Tour complet</button>' +
      '</div>'
    : '';

  const helpText = modeNavigation
    ? 'Modifie tes waypoints (ajout via clic carte / 🧭 Ma position / recherche, suppression via ✕) puis 🔄 Recalculer pour mettre à jour le tracé.'
    : 'Clique sur la carte, sélectionne un point existant, ou utilise ta position tracker. L\'itinéraire passera dans l\'ordre par chacun d\'eux, en suivant le réseau de routes existant au plus court.';

  const sectionPoints =
    '<div class="kta-iti-section">' +
      '<div class="kta-iti-section-titre">📍 Points de passage</div>' +
      '<p class="kta-iti-help">' + helpText + '</p>' +
      quickNavHtml +
      '<div class="kta-iti-mode-toggle">' +
        '<button id="kta-iti-mode-click" class="kta-btn kta-btn-primary" type="button">📍 Mode clic carte</button>' +
        '<button id="kta-iti-tracker-pos" class="kta-btn kta-btn-ghost" type="button" style="margin-left:8px;" title="Ajoute la position actuelle du tracker comme waypoint (snapshot fige)">🧭 Ma position</button>' +
        '<button id="kta-iti-clear" class="kta-btn kta-btn-ghost" type="button" style="margin-left:8px;">🗑️ Vider</button>' +
      '</div>' +
      '<div class="kta-iti-search-wrap">' +
        '<input type="text" id="kta-iti-search-input" class="kta-cfg-input" ' +
          'placeholder="🔍 Rechercher un point existant (nom, id, tag)…" autocomplete="off">' +
        '<div id="kta-iti-search-results" class="kta-iti-search-results"></div>' +
      '</div>' +
      '<div id="kta-iti-waypoints-list" class="kta-iti-waypoints-list"></div>' +
    '</div>';

  // ===== Section action UNIFIEE =====
  // Bouton principal "🎯 Calculer" / "🔄 Recalculer" selon presence d'itineraire.
  // Bouton "❌ Effacer" affiche uniquement si itineraire actif.
  // Statut Distance/Tronçons en haut si mode navigation.
  const computeBtnLabel = modeNavigation ? "🔄 Recalculer l'itinéraire" : "🎯 Calculer l'itinéraire";
  const currentPresetKey = _getItiSpeedPreset();
  const currentPreset    = ITI_SPEED_PRESETS[currentPresetKey];
  let statusActuel = '';
  if (modeNavigation) {
    const distActMeters = _distanceItineraireMeters(existingItinerary);
    const nbWpAct       = Array.isArray(existingItinerary.waypoints) ? existingItinerary.waypoints.length : 2;
    const tempsActMin   = _tempsItineraireMinutes(distActMeters, nbWpAct);
    statusActuel =
      '<div class="kta-iti-result" id="kta-iti-status-block" style="display:block; margin-bottom:10px;" ' +
           'data-distm="' + distActMeters + '" data-nbwp="' + nbWpAct + '">' +
        '<div class="kta-iti-result-row"><strong>Distance :</strong> ' + window.formatDistance(distActMeters, 1) + '</div>' +
        '<div class="kta-iti-result-row"><strong>⏱️ Temps estimé :</strong> ' +
          '<span id="kta-iti-temps-val">' + _formatTempsMinutes(tempsActMin) + '</span> ' +
          '<span class="kta-iti-temps-speed-hint" id="kta-iti-temps-speed-hint">(' + currentPreset.icon + ' ' + currentPreset.label + ')</span>' +
        '</div>' +
        '<div class="kta-iti-result-row"><strong>Tronçons :</strong> ' + (existingItinerary.points.length - 1) + '</div>' +
      '</div>';
  }
  const eraseBtn = modeNavigation
    ? '<button id="kta-iti-erase" class="kta-btn kta-btn-danger" type="button" style="width:100%; margin-top:8px;">❌ Effacer l\'itinéraire</button>'
    : '';
  // Segmented control pour la vitesse de marche (4 presets)
  // currentPresetKey est déjà défini plus haut (avant statusActuel)
  let speedButtonsHtml = "";
  Object.keys(ITI_SPEED_PRESETS).forEach(function(key) {
    const p = ITI_SPEED_PRESETS[key];
    const active = (key === currentPresetKey);
    speedButtonsHtml +=
      '<button type="button" class="kta-iti-speed-btn' + (active ? " kta-iti-speed-active" : "") + '" ' +
        'data-speed="' + key + '" ' +
        'title="' + p.label + ' — ' + p.kmh + ' km/h. ' + p.hint + '">' +
        '<span class="kta-iti-speed-icon">' + p.icon + '</span>' +
        '<span class="kta-iti-speed-label">' + p.label + '</span>' +
        '<span class="kta-iti-speed-kmh">' + p.kmh + ' km/h</span>' +
      '</button>';
  });
  const sectionVitesse =
    '<div class="kta-iti-section">' +
      '<div class="kta-iti-section-titre">🏃 Vitesse de marche estimée</div>' +
      '<div class="kta-iti-speed-segmented" id="kta-iti-speed-segmented">' +
        speedButtonsHtml +
      '</div>' +
      '<p class="kta-iti-speed-hint">Ajuste l\'estimation du temps de parcours. ' +
        'Le mode actif s\'affiche dans le label bottom-left de la carte.</p>' +
    '</div>';

  const sectionAction =
    '<div class="kta-iti-section">' +
      '<div class="kta-iti-section-titre">🎯 ' + (modeNavigation ? "Itinéraire actuel" : "Action") + '</div>' +
      statusActuel +
      '<button id="kta-iti-compute" class="kta-btn kta-btn-primary" type="button" style="width:100%;">' + computeBtnLabel + '</button>' +
      eraseBtn +
      '<div id="kta-iti-result" class="kta-iti-result" style="display:none;"></div>' +
      '<div id="kta-iti-error" class="kta-iti-error" style="display:none;"></div>' +
    '</div>';

  // 🚫 v169 (Karma_dev) : section preferences d'evitement (avancees, repliees
  // par defaut via <details> HTML). Lit les prefs depuis localStorage par
  // planId pour restaurer l'etat entre 2 ouvertures de la modale.
  const sectionAvoid = _htmlSectionAvoidItineraire(_getItiAvoidPrefs());

  const modal = document.createElement("div");
  modal.id = "kta-itinerary-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite kta-iti-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">' + titre + '</span>' +
        '<button class="kta-panneau-close" id="kta-iti-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-iti-corps">' +
        sectionPoints +
        sectionAvoid +
        sectionVitesse +
        sectionAction +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);
  _rafraichirListeWaypointsModale();
  _bindAvoidSectionHandlers();

  // Bind du segmented control de vitesse — clic = update preset + refresh
  // visuel des boutons + refresh in-place du temps affiché dans le bloc
  // statusActuel (mode navigation) + refresh du label bottom-left (géré par
  // _setItiSpeedPreset).
  (function bindSpeedSegmented() {
    const wrap = document.getElementById("kta-iti-speed-segmented");
    if (!wrap) return;
    wrap.querySelectorAll(".kta-iti-speed-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const key = btn.getAttribute("data-speed");
        if (!_setItiSpeedPreset(key)) return;
        // Toggle visuel des boutons
        wrap.querySelectorAll(".kta-iti-speed-btn").forEach(function(b) {
          b.classList.toggle("kta-iti-speed-active", b === btn);
        });
        // Refresh in-place du bloc statusActuel (mode navigation) :
        // on lit distM/nbwp depuis les data-* attributs et on regénère le
        // texte du span temps + hint preset.
        const statusBlk = document.getElementById("kta-iti-status-block");
        if (statusBlk) {
          const distM = parseFloat(statusBlk.dataset.distm) || 0;
          const nbWp  = parseInt(statusBlk.dataset.nbwp, 10) || 2;
          const tMin  = _tempsItineraireMinutes(distM, nbWp);
          const p     = ITI_SPEED_PRESETS[key];
          const tEl   = document.getElementById("kta-iti-temps-val");
          const hEl   = document.getElementById("kta-iti-temps-speed-hint");
          if (tEl) tEl.textContent = _formatTempsMinutes(tMin);
          if (hEl) hEl.textContent = "(" + p.icon + " " + p.label + ")";
        }
      });
    });
  })();

  function fermer() {
    _desactiverModeClicCarte();
    if (_itineraryFloater) { _itineraryFloater.remove(); _itineraryFloater = null; }
    if (modeNavigation) {
      // Mode navigation : si un preview existe (l'utilisateur a recalcule
      // pendant cette session de modale), on l'auto-save → l'itineraire
      // utilise la nouvelle version au lieu d'etre perdu. Cohérent avec
      // l'intention "j'ai recalculé donc je veux le nouveau". L'utilisateur
      // peut explicitement annuler via le bouton ❌ Effacer du preview.
      const hasPreview = (window.getRoads ? window.getRoads() : []).some(function(r) { return r._preview; });
      if (hasPreview) {
        const roadsNow = (window.getRoads ? window.getRoads() : []).map(function(r) {
          if (r._preview) { const c = Object.assign({}, r); delete c._preview; return c; }
          return r;
        });
        if (window.setRoads) window.setRoads(roadsNow);
      }
      // On garde les markers numérotés (waypoints visuels) sur la carte pour
      // que l'utilisateur les voie toujours hors modale.
    } else {
      // Mode calcul : on retire le preview éventuel + les markers numérotés
      // (sinon ça encombre la carte). L'utilisateur doit explicitement
      // sauver via le bouton 💾 dans la zone résultat.
      _viderItineraire();
      const roadsNow = (window.getRoads ? window.getRoads() : []).filter(function(r) { return !r._preview; });
      if (window.setRoads) window.setRoads(roadsNow);
    }
    modal.remove();
    _majLabelDistanceItineraire();
  }

  document.getElementById("kta-iti-close").addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  // ===== Mode navigation : wiring des quick-nav + erase =====
  // Ces boutons ne sont presents que si modeNavigation = true (HTML conditionnel
  // plus haut). Le reste du wiring (mode-click, search, tracker-pos, clear,
  // compute) est commun aux 2 modes — pas de return early.
  if (modeNavigation) {
    document.getElementById("kta-iti-nav-debut").addEventListener("click", function() {
      if (_itineraryWaypoints.length === 0) return;
      modal.remove();
      _panEtFlashSurPoint(_itineraryWaypoints[0]);
    });
    document.getElementById("kta-iti-nav-fin").addEventListener("click", function() {
      if (_itineraryWaypoints.length === 0) return;
      modal.remove();
      _panEtFlashSurPoint(_itineraryWaypoints[_itineraryWaypoints.length - 1]);
    });
    document.getElementById("kta-iti-nav-tour").addEventListener("click", function() {
      // fitBounds sur l'ensemble des points du tracé
      if (!existingItinerary || !existingItinerary.points || existingItinerary.points.length < 2) return;
      const latlngs = existingItinerary.points.map(function(p) { return convertCoord(p.x, p.y); });
      const bounds = L.latLngBounds(latlngs);
      modal.remove();
      window.map.fitBounds(bounds, { padding: [40, 40], animate: false });
    });
    document.getElementById("kta-iti-erase").addEventListener("click", function() {
      if (!confirm("Effacer l'itinéraire actif ?")) return;
      const roadsNow = (window.getRoads ? window.getRoads() : []).filter(function(r) { return r.type !== "itinerary"; });
      if (window.setRoads) window.setRoads(roadsNow);
      _viderItineraire();
      modal.remove();
      _majLabelDistanceItineraire();
    });
  }

  // ===== Sélecteur de point existant (autocomplete) =====
  // Recherche sur tous les points du plan (data layers + editor) via l'API
  // window.SearchPoints.findByQuery. Affiche les résultats sous l'input,
  // clic sur un résultat → ajoute un waypoint avec les coords du point ET son nom.
  const searchInput   = document.getElementById("kta-iti-search-input");
  const searchResults = document.getElementById("kta-iti-search-results");
  let _searchTimer = null;

  function _afficherResultatsRecherche(items) {
    if (!items || items.length === 0) {
      searchResults.innerHTML = '<div class="kta-iti-search-empty">Aucun résultat</div>';
      searchResults.style.display = "block";
      return;
    }
    // Limite l'affichage aux 10 premiers résultats pour pas saturer le DOM
    const limite = items.slice(0, 10);
    searchResults.innerHTML = limite.map(function(it, idx) {
      const p = it.point;
      const name = p.nom || p.id || "(sans nom)";
      const sub = (p.id && p.id !== name) ? p.id + " — " : "";
      const layer = it.layerLabel || it.layerId || "";
      return '<div class="kta-iti-search-item" data-idx="' + idx + '">' +
               '<div class="kta-iti-search-name">' + _escapeHtml(name) + '</div>' +
               '<div class="kta-iti-search-meta">' + _escapeHtml(sub + layer) + '</div>' +
             '</div>';
    }).join("");
    if (items.length > 10) {
      searchResults.innerHTML += '<div class="kta-iti-search-more">+ ' + (items.length - 10) + ' autres résultats — affine la recherche</div>';
    }
    searchResults.style.display = "block";

    Array.from(searchResults.querySelectorAll(".kta-iti-search-item")).forEach(function(el, idx) {
      el.addEventListener("click", function() {
        const it = limite[idx];
        const p = it.point;
        if (typeof p.x !== "number" || typeof p.y !== "number") return;
        _itineraryWaypoints.push({
          x:      p.x,
          y:      p.y,
          source: "search",
          label:  (p.nom || p.id || "?") + " (" + (it.layerLabel || it.layerId) + ")"
        });
        _ajouterWaypointVisuel({ x: p.x, y: p.y }, _itineraryWaypoints.length);
        _rafraichirListeWaypointsModale();
        _majPanneauFloaterCount();
        // Reset l'input pour faciliter un autre ajout
        searchInput.value    = "";
        searchResults.style.display = "none";
      });
    });
  }

  searchInput.addEventListener("input", function() {
    clearTimeout(_searchTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      searchResults.style.display = "none";
      return;
    }
    _searchTimer = setTimeout(function() {
      if (window.SearchPoints && typeof window.SearchPoints.findByQuery === "function") {
        window.SearchPoints.findByQuery(query).then(_afficherResultatsRecherche);
      }
    }, 150);
  });
  searchInput.addEventListener("blur", function() {
    // Petit délai pour laisser le clic sur un résultat fonctionner avant de cacher
    setTimeout(function() { searchResults.style.display = "none"; }, 200);
  });

  // Bouton activer / désactiver mode clic carte
  // Quand on active : on cache la modale et affiche un mini-panneau flottant
  // pour que l'utilisateur puisse cliquer sur la carte (la modale plein-écran
  // bloquait les clics).
  const btnMode = document.getElementById("kta-iti-mode-click");
  btnMode.addEventListener("click", function() {
    if (_itineraryClickActive) {
      _desactiverModeClicCarte();
      btnMode.textContent = "📍 Activer mode clic carte";
      btnMode.classList.remove("kta-actif");
    } else {
      _activerModeClicCarte();
      // Cacher la modale principale + montrer mini-panneau
      modal.style.display = "none";
      _afficherPanneauItineraireFlottant(modal);
    }
  });

  // 🧭 Ma position tracker — ajoute un waypoint avec la position courante du
  // tracker (snapshot fige au moment du clic, ne bouge plus apres). Position
  // toujours disponible : APP_CONFIG.startX/Y au boot, puis modifiee par
  // recalage manuel ou par les pas du tracker actif.
  const btnTrackerPos = document.getElementById("kta-iti-tracker-pos");
  if (btnTrackerPos) {
    btnTrackerPos.addEventListener("click", function() {
      if (typeof window.getTrackingPosition !== "function") return;
      const pos = window.getTrackingPosition();
      if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
        alert("Position du tracker indisponible.");
        return;
      }
      _itineraryWaypoints.push({
        x:      pos.x,
        y:      pos.y,
        source: "tracker",
        label:  "🧭 Position actuelle (" + Math.round(pos.x) + ", " + Math.round(pos.y) + ")"
      });
      _ajouterWaypointVisuel({ x: pos.x, y: pos.y }, _itineraryWaypoints.length);
      _rafraichirListeWaypointsModale();
      _majPanneauFloaterCount();
    });
  }

  // Vider
  document.getElementById("kta-iti-clear").addEventListener("click", function() {
    _itineraryWaypoints = [];
    if (_itineraryMarkerLayer) _itineraryMarkerLayer.clearLayers();
    _rafraichirListeWaypointsModale();
    document.getElementById("kta-iti-result").style.display = "none";
    document.getElementById("kta-iti-error").style.display  = "none";
  });

  // Calculer (handler async depuis v169 : computeRoute peut await SearchPoints
  // si avoidTags non vide — l'await passe immediatement si pas d'avoidTags)
  document.getElementById("kta-iti-compute").addEventListener("click", async function() {
    const errEl = document.getElementById("kta-iti-error");
    const resEl = document.getElementById("kta-iti-result");
    errEl.style.display = "none";
    resEl.style.display = "none";

    if (_itineraryWaypoints.length < 2) {
      errEl.textContent = "Il faut au moins 2 waypoints pour calculer un itinéraire.";
      errEl.style.display = "block";
      return;
    }

    if (!window.Pathfinder) {
      errEl.textContent = "Module Pathfinder non chargé.";
      errEl.style.display = "block";
      return;
    }

    try {
      // 🚫 v169 (Karma_dev) : lit les preferences d'evitement depuis localStorage
      // et les passe au Pathfinder. La logique 2-passes (fallback) est interne
      // au Pathfinder — on lit result.usedFallback et result.avoidedThrough pour
      // afficher un message d'avertissement au user le cas echeant.
      const avoidPrefs = _getItiAvoidPrefs();
      const result = await window.Pathfinder.computeRoute(_itineraryWaypoints, {
        avoidPoints: avoidPrefs.points || [],
        avoidTags:   avoidPrefs.tags   || [],
        avoidRadius: avoidPrefs.radius || ITI_AVOID_DEFAULT_RADIUS
      });
      // Conversion px → mètres via APP_CONFIG.scale (px/mètre)
      const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
      const distM = result.totalDistance / scale;

      // Message fallback si certains evitements n'ont pas pu etre respectes
      let fallbackHtml = "";
      if (result.usedFallback && Array.isArray(result.avoidedThrough) && result.avoidedThrough.length > 0) {
        function _esc(s) {
          return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        const noms = result.avoidedThrough.map(function(ap) {
          return _esc(ap.label || ap.id || "(point)");
        }).join(", ");
        fallbackHtml =
          '<div class="kta-iti-result-row kta-iti-avoid-warning" style="color:#ff9933; background:rgba(255,153,51,0.10); border-left:3px solid #ff9933; padding:8px 10px; margin:6px 0; border-radius:4px;">' +
            '⚠️ <strong>Impossible d\'éviter</strong> : ' + noms +
            '<br><span style="font-size:11.5px;">Aucun chemin alternatif possible avec ces contraintes — l\'itinéraire calculé passe à proximité de ces points (marge ' + (result.avoidRadius || ITI_AVOID_DEFAULT_RADIUS) + 'px).</span>' +
          '</div>';
      }

      const tempsCalcMin = _tempsItineraireMinutes(distM, _itineraryWaypoints.length);
      resEl.innerHTML =
        fallbackHtml +
        '<div class="kta-iti-result-row"><strong>Distance :</strong> ' + window.formatDistance(distM, 1) + '</div>' +
        '<div class="kta-iti-result-row"><strong>⏱️ Temps estimé :</strong> ' + _formatTempsMinutes(tempsCalcMin) + '</div>' +
        '<div class="kta-iti-result-row"><strong>Tronçons traversés :</strong> ' + result.segmentCount + '</div>' +
        '<div class="kta-iti-result-actions">' +
          '<button id="kta-iti-save" class="kta-btn kta-btn-primary" type="button">💾 Enregistrer comme itinéraire</button>' +
          '<button id="kta-iti-discard" class="kta-btn kta-btn-ghost" type="button" style="margin-left:8px;">❌ Effacer</button>' +
        '</div>';
      resEl.style.display = "block";

      // Tracer immédiatement (preview) en utilisant le type "itinerary".
      // ⚠️ Sémantique : un seul itinéraire actif à la fois — on retire TOUTES
      // les roads de type "itinerary" (preview ET déjà enregistrées) avant
      // d'ajouter le nouveau. Recalculer remplace la session précédente.
      // ⚠️ Les waypoints originaux (avec leurs labels/sources) sont stockés sur
      // le road via la propriété `waypoints` → restauration au re-open de la
      // modale (mode navigation).
      const previewRoad = {
        type:      "itinerary",
        points:    result.path,
        waypoints: _itineraryWaypoints.map(function(w) { return Object.assign({}, w); }),
        _preview:  true
      };
      const currentRoads = window.getRoads ? window.getRoads() : [];
      const filtered = currentRoads.filter(function(r) { return r.type !== "itinerary"; });
      filtered.push(previewRoad);
      if (window.setRoads) window.setRoads(filtered);
      _majLabelDistanceItineraire();

      document.getElementById("kta-iti-save").addEventListener("click", function() {
        // Convertit le preview en road persistante (les waypoints sont déjà attachés)
        const roadsNow = (window.getRoads ? window.getRoads() : []).map(function(r) {
          if (r._preview) { const c = Object.assign({}, r); delete c._preview; return c; }
          return r;
        });
        if (window.setRoads) window.setRoads(roadsNow);
        _majLabelDistanceItineraire();
        fermer();
      });
      document.getElementById("kta-iti-discard").addEventListener("click", function() {
        const roadsNow = (window.getRoads ? window.getRoads() : []).filter(function(r) { return !r._preview; });
        if (window.setRoads) window.setRoads(roadsNow);
        _majLabelDistanceItineraire();
        resEl.style.display = "none";
      });

    } catch(err) {
      errEl.textContent = err.message || String(err);
      errEl.style.display = "block";
    }
  });
};

// =========================
// DISTANCE TOTALE DES TRACÉS — panneau flottant + surlignage
// =========================
// Calcule la somme des longueurs des polylines (Principal / Secondaire / Chemin)
// présentes sur le plan (session getRoads + calques embarqués visibles getEmbeddedRoads).
// L'utilisateur filtre par type via 3 checkboxes ; le total est mis à jour live et
// les tronçons inclus sont surlignés en magenta avec un halo (même pattern que
// l'itinéraire cyan, mais couleur distincte pour ne pas confondre).
// Le type "itinerary" est exclu (c'est un calcul dérivé du réseau, pas une route
// indépendante).

const _RD_TYPES_TOUS    = ["principal", "secondaire", "chemin"];
const _RD_HIGHLIGHT_HEX = "#ff4ecb";

let _rdFloater         = null;
let _rdHighlightLayer  = null;  // L.layerGroup contenant les polylines magenta
let _rdFiltres         = { principal: true, secondaire: true, chemin: true };

// Collecte toutes les roads pertinentes (session + TOUTES embedded, masquees
// comprises), filtrees pour ne garder que les types principal/secondaire/chemin.
//
// ⚠️ On utilise getAllEmbeddedRoads (pas getEmbeddedRoads) — symetrie avec
// Pathfinder/Search qui prennent tout : le panneau "Distance totale" doit
// donner un chiffre fiable meme si l'utilisateur a masque un calque dans
// le controle des couches (cas typique : routes dessinees en dur sur le PNG
// du plan + calque routes masque pour gagner en perf de rendu — l'utilisateur
// veut quand meme connaitre la distance totale du reseau).
function _rdRoadsExploitables() {
  const session  = (window.getRoads             ? window.getRoads()             : []) || [];
  const embedded = (window.getAllEmbeddedRoads  ? window.getAllEmbeddedRoads()  : []) || [];
  return session.concat(embedded).filter(function(r) {
    return r && Array.isArray(r.points) && r.points.length >= 2 &&
           _RD_TYPES_TOUS.indexOf(r.type) !== -1;
  });
}

// Longueur d'une road en pixels (somme des distances euclidiennes entre
// points consécutifs).
function _rdLongueurPx(road) {
  let total = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

// Calcule un breakdown par type sur les roads filtrées par les checkboxes.
// Retourne { principal: {nb, distM}, secondaire: {...}, chemin: {...}, totalM }.
function _rdCalculerBreakdown() {
  const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
  const out = {
    principal:  { nb: 0, distM: 0 },
    secondaire: { nb: 0, distM: 0 },
    chemin:     { nb: 0, distM: 0 },
    totalM:     0
  };
  _rdRoadsExploitables().forEach(function(r) {
    if (!_rdFiltres[r.type]) return;
    const distM = _rdLongueurPx(r) / scale;
    out[r.type].nb    += 1;
    out[r.type].distM += distM;
    out.totalM        += distM;
  });
  return out;
}

// Dessine (ou redessine) la polyline magenta surlignant les tronçons inclus.
// ⚠️ Perf critique : on utilise UNE SEULE L.polyline avec un array d'arrays
// (multi-segments dans 1 seul élément SVG path). Sans ça, on aurait N éléments
// SVG avec chacun un `filter: drop-shadow` GPU → crash garanti sur mobile dès
// une dizaine de routes (compositing layers explosent en mémoire iOS Safari).
// Leaflet supporte nativement le format [[seg1], [seg2], ...] pour rendre
// plusieurs sous-paths dans UN seul `<path>` SVG — coût ~constant peu importe
// le nombre de routes incluses.
function _rdRedessinerHighlight() {
  if (!window.map) return;
  // Cleanup ancien layer (gestion du cas plan switch : ._map devient null)
  if (_rdHighlightLayer && _rdHighlightLayer._map) {
    _rdHighlightLayer.clearLayers();
  } else {
    _rdHighlightLayer = L.layerGroup().addTo(window.map);
  }
  // Collecte de tous les segments inclus → array d'arrays de latlngs
  const multiSegments = [];
  _rdRoadsExploitables().forEach(function(r) {
    if (!_rdFiltres[r.type]) return;
    multiSegments.push(r.points.map(function(p) { return convertCoord(p.x, p.y); }));
  });
  if (multiSegments.length === 0) return;  // rien à dessiner (toutes les cases décochées)
  L.polyline(multiSegments, {
    color:     _RD_HIGHLIGHT_HEX,
    weight:    9,
    opacity:   0.85,
    renderer:  L.svg(),       // SVG forcé pour drop-shadow CSS
    className: "kta-rd-highlight-polyline",
    interactive: false
  }).addTo(_rdHighlightLayer);
}

// ⚠️ Nom volontairement différent de `window._rdEffacerHighlight` (l'export
// global) — sans ça, function declarations top-level deviennent propriétés
// de window, et l'export plus bas écrasait celle-ci, causant une récursion
// infinie silencieuse (les appels internes à `_rdEffacerHighlight()` partaient
// dans le wrapper export qui se rappelait lui-même).
function _rdInternalEffacerHighlight() {
  if (_rdHighlightLayer) {
    try { _rdHighlightLayer.clearLayers(); } catch(e) {}
    if (window.map && _rdHighlightLayer._map) {
      try { window.map.removeLayer(_rdHighlightLayer); } catch(e) {}
    }
    _rdHighlightLayer = null;
  }
}

// Mise à jour des compteurs et du total dans le panneau flottant (live).
function _rdRafraichirAffichage() {
  const b = _rdCalculerBreakdown();
  const setTxt = function(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setTxt("kta-rd-cnt-principal",  b.principal.nb  + " — " + window.formatDistance(b.principal.distM,  1));
  setTxt("kta-rd-cnt-secondaire", b.secondaire.nb + " — " + window.formatDistance(b.secondaire.distM, 1));
  setTxt("kta-rd-cnt-chemin",     b.chemin.nb     + " — " + window.formatDistance(b.chemin.distM,     1));
  setTxt("kta-rd-total",          window.formatDistance(b.totalM, 1));
}

window.ouvrirRoadsDistanceFloater = function() {
  // Toggle : si la modale est déjà ouverte, on la ferme (mais on GARDE le
  // surlignage actif, cohérent avec le choix initial "persiste jusqu'à clic
  // ❌ Effacer"). L'utilisateur peut ainsi voir la map avec les tronçons
  // surlignés, puis re-cliquer 📏 pour rouvrir la modale.
  if (_rdFloater) {
    _rdFloater.remove();
    _rdFloater = null;
    return;
  }

  const roads = _rdRoadsExploitables();
  if (roads.length === 0) {
    alert("Aucun tracé de route présent sur ce plan.\n\nTrace au moins une route (Principal / Secondaire / Chemin) avant de calculer une distance totale.");
    return;
  }

  // Modale plein écran style charte (.kta-readme-modal-overlay) — on conserve
  // les filtres précédents si un highlight était déjà actif (réouverture après
  // fermeture sans avoir cliqué ❌ Effacer). Sinon reset à "tous cochés".
  if (!_rdHighlightLayer) {
    _rdFiltres = { principal: true, secondaire: true, chemin: true };
  }

  const modal = document.createElement("div");
  modal.id = "kta-rd-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite kta-rd-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">📏 Distance totale des tracés</span>' +
        '<button class="kta-panneau-close" id="kta-rd-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<div class="kta-aide-section">' +
          '<p class="kta-rd-help">' +
            'Décoche les types à exclure du calcul. Les tracés inclus sont surlignés ' +
            '<strong style="color:#ff4ecb;">en magenta</strong> sur la carte. ' +
            'Le surlignage <strong>persiste après fermeture</strong> de la modale — clique ❌ ' +
            'Effacer pour le retirer.' +
          '</p>' +
          '<label class="kta-rd-row">' +
            '<input type="checkbox" id="kta-rd-chk-principal"' + (_rdFiltres.principal ? ' checked' : '') + '>' +
            '<span class="kta-rd-swatch" style="background:#00ff00;"></span>' +
            '<span class="kta-rd-label">Principal</span>' +
            '<span class="kta-rd-count" id="kta-rd-cnt-principal">—</span>' +
          '</label>' +
          '<label class="kta-rd-row">' +
            '<input type="checkbox" id="kta-rd-chk-secondaire"' + (_rdFiltres.secondaire ? ' checked' : '') + '>' +
            '<span class="kta-rd-swatch" style="background:#b000ff;"></span>' +
            '<span class="kta-rd-label">Secondaire</span>' +
            '<span class="kta-rd-count" id="kta-rd-cnt-secondaire">—</span>' +
          '</label>' +
          '<label class="kta-rd-row">' +
            '<input type="checkbox" id="kta-rd-chk-chemin"' + (_rdFiltres.chemin ? ' checked' : '') + '>' +
            '<span class="kta-rd-swatch" style="background:#ffff00;"></span>' +
            '<span class="kta-rd-label">Chemin</span>' +
            '<span class="kta-rd-count" id="kta-rd-cnt-chemin">—</span>' +
          '</label>' +
          '<div class="kta-rd-total-wrap">' +
            '<span class="kta-rd-total-label">Total</span>' +
            '<span class="kta-rd-total-value" id="kta-rd-total">—</span>' +
          '</div>' +
        '</div>' +
        '<div class="kta-rd-actions">' +
          '<button id="kta-rd-erase" class="kta-btn kta-btn-danger" type="button">❌ Effacer le surlignage</button>' +
          '<button id="kta-rd-done"  class="kta-btn kta-btn-primary" type="button">✓ Fermer (garder le surlignage)</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);
  _rdFloater = modal;

  // Wire-up des checkboxes : toggle filtre + redraw highlight + refresh affichage
  _RD_TYPES_TOUS.forEach(function(type) {
    const chk = document.getElementById("kta-rd-chk-" + type);
    if (!chk) return;
    chk.addEventListener("change", function() {
      _rdFiltres[type] = chk.checked;
      _rdRedessinerHighlight();
      _rdRafraichirAffichage();
    });
  });

  // Fermer la modale (✕ / clic backdrop / ✓ Fermer) — on GARDE le surlignage
  function _rdFermerModale() {
    if (_rdFloater) { _rdFloater.remove(); _rdFloater = null; }
  }

  // ❌ Effacer le surlignage ET fermer la modale
  function _rdToutEffacer() {
    _rdInternalEffacerHighlight();
    if (_rdFloater) { _rdFloater.remove(); _rdFloater = null; }
  }

  document.getElementById("kta-rd-close").addEventListener("click", _rdFermerModale);
  document.getElementById("kta-rd-done").addEventListener("click",  _rdFermerModale);
  document.getElementById("kta-rd-erase").addEventListener("click", _rdToutEffacer);
  modal.addEventListener("click", function(e) { if (e.target === modal) _rdFermerModale(); });

  // Premier rendu : highlight + breakdown
  _rdRedessinerHighlight();
  _rdRafraichirAffichage();
};

// Cleanup helper exposé pour main.js (libération avant plan switch).
// Appelle _rdInternalEffacerHighlight (le vrai cleanup) — voir le warning sur
// la collision de noms juste au-dessus de la fonction interne.
window._rdEffacerHighlight = function() {
  if (_rdFloater) { _rdFloater.remove(); _rdFloater = null; }
  _rdInternalEffacerHighlight();
};

// 🆕 API publique : état actuel de la "Distance totale des tracés".
// Retourne null si pas de surlignage actif (= rien à afficher).
// Sinon { totalM, breakdown: {principal,secondaire,chemin} }.
//
// Pourquoi exposer ça : le statusbar refonte v1 lisait avant directement
// le DOM .kta-rd-total-value, qui n'existe que QUAND LA MODALE EST OUVERTE.
// Fermer la modale (en gardant le surlignage magenta) cassait l'affichage
// dans le statusbar — bug remonté KARMA. Avec cette API, on calcule en
// live à partir de _rdHighlightLayer (qui survit à la fermeture modale).
window.getDistanceTotaleStatus = function() {
  // Pas de surlignage actif → aucune donnée à afficher
  if (!_rdHighlightLayer) return null;
  // Surlignage actif : recalcule en live depuis les roads + filtres courants
  const b = _rdCalculerBreakdown();
  return {
    totalM:    b.totalM,
    breakdown: {
      principal:  { nb: b.principal.nb,  distM: b.principal.distM  },
      secondaire: { nb: b.secondaire.nb, distM: b.secondaire.distM },
      chemin:     { nb: b.chemin.nb,     distM: b.chemin.distM     }
    }
  };
};

// Hook appelé par road.js > renderRoads (et par le listener overlayadd/remove)
// quand l'ensemble des roads change. Si le panneau est ouvert, on rejoue le
// surlignage et l'affichage. Sinon, no-op.
window._rdOnRoadsChanged = function() {
  if (!_rdFloater) return;
  _rdRedessinerHighlight();
  _rdRafraichirAffichage();
};

// =========================
// LÉGENDE — modale plein écran
// =========================
const LEGENDE_LABELS = {
  salle:    "Salle",
  pa:       "Puits Aération",
  pc:       "Puits Comblé",
  pb:       "Puits Bouché",
  pe:       "Puits au sol / Bassin",
  ps:       "Puit extraction",
  peo:      "Puits à échelon ouvert",
  pef:      "Puits à échelon fermé",
  eso:      "Escalier service ouvert",
  esf:      "Escalier service fermé",
  cao:      "Cavage ouvert",
  caf:      "Cavage fermé",
  vehicule: "Véhicule",
  elec:     "Électricité",
  epure:    "Épure",
  info:     "Information",
  chatiere: "Chatière",
  passage:  "Passage",
  danger:   "Danger",
  plaque:   "Plaque indication",
  track:    "Position du tracker",
  default:  "Point sans tag (défaut)"
};

// Tag default → label spécial (pas dans la config par défaut)

function afficherLegende() {
  const existing = document.getElementById("kta-legende-modal");
  if (existing) { existing.remove(); return; }

  const icons = window.PLAN_CONFIG?.icons;

  const modal = document.createElement("div");
  modal.id = "kta-legende-modal";
  modal.className = "kta-readme-modal-overlay";

  let contenuIcones = "";

  // Helper pour générer une ligne d'icône
  function ligneIcone(cle, url) {
    const label = LEGENDE_LABELS[cle] || cle;
    return `<div class="kta-legende-ligne">
      <img class="kta-legende-icone" src="${url}" alt="${label}" onerror="this.style.opacity='0.3'">
      <span class="kta-legende-label">${label}</span>
    </div>`;
  }

  if (!icons) {
    contenuIcones = `<p style="color:#8892a4; text-align:center; padding:20px;">Aucune configuration d'icônes disponible.</p>`;
  } else {
    const GROUPES = [
      { titre: "🕳️ Puits",         cles: ["pa", "pb", "pc", "pe", "ps"] },
      { titre: "🪜 Accès",          cles: ["peo", "pef", "eso", "esf", "cao", "caf"] },
      { titre: "⚠️ Signalétique",  cles: ["salle", "chatiere", "passage", "danger", "info", "elec", "epure", "vehicule", "plaque"] }
    ];

    const clesGroupees = GROUPES.flatMap(function(g) { return g.cles; });

    // Helper : récupérer l'URL pour une clé — d'abord le plan-config, sinon _iconMap (fallback built-in)
    // v174 : _kta_iconUrl backup pour les divIcon (cf creerIcones avec scaledMarkers ON)
    function urlPourCle(cle) {
      if (icons[cle]) return icons[cle];
      const iconObj = window._iconMap?.[cle];
      if (!iconObj) return null;
      return iconObj._kta_iconUrl || (iconObj.options && iconObj.options.iconUrl) || null;
    }

    // Sections groupées
    GROUPES.forEach(function(groupe) {
      const entrees = groupe.cles
        .map(function(cle) {
          const url = urlPourCle(cle);
          if (!url) return null;
          return ligneIcone(cle, url);
        })
        .filter(Boolean)
        .join("");

      if (entrees) {
        contenuIcones += `<div class="kta-aide-section"><div class="kta-aide-section-titre">${groupe.titre}</div>${entrees}</div>`;
      }
    });

    // Helper : récupérer l'URL réellement utilisée par Leaflet pour un tag
    function getIconUrl(cle) {
      const iconObj = window._iconMap?.[cle] || (cle === "default" ? window.iconeDefault : null);

      if (iconObj) {
        // v174 : _kta_iconUrl backup pour les divIcon créés par creerIcones
        // quand scaledMarkers ON (options.iconUrl undefined dans ce cas).
        if (iconObj._kta_iconUrl) return iconObj._kta_iconUrl;
        // Cas 1 : icône custom L.icon({ iconUrl }) → récupération directe
        if (iconObj.options && iconObj.options.iconUrl) {
          return iconObj.options.iconUrl;
        }
        // Cas 2 : L.Icon.Default natif → utiliser sa méthode interne pour obtenir l'URL
        if (typeof iconObj._getIconUrl === "function") {
          try { return iconObj._getIconUrl("icon"); } catch(e) {}
        }
        // Cas 3 : fallback chemin standard Leaflet
        return "lib/leaflet/images/marker-icon.png";
      }

      // Fallback ultime : URL définie dans PLAN_CONFIG.icons
      return (icons || {})[cle];
    }

    // Section "Autres" — tous les tags non groupés (custom + tracker + default)
    const tousLesTags = new Set(Object.keys(icons || {}));
    if (window._iconMap) Object.keys(window._iconMap).forEach(function(t) { tousLesTags.add(t); });

    const autresEntrees = Array.from(tousLesTags)
      .filter(function(cle) { return !clesGroupees.includes(cle); })
      .sort()
      .map(function(cle) { return ligneIcone(cle, getIconUrl(cle)); })
      .join("");

    if (autresEntrees) {
      contenuIcones += `<div class="kta-aide-section"><div class="kta-aide-section-titre">📌 Autres</div>${autresEntrees}</div>`;
    }
  }

  // 🪜 v169 (Karma_dev) : ajout de Jonction interniveau (magenta) — type
  // conditionnel multi-niveau, présenté dans la légende même sans multiLevel
  // car cohérence avec la légende exportée PNG.
  const contenuTracés = `
    <div class="kta-aide-section">
      <div class="kta-aide-section-titre">🛣️ Tracés</div>
      <div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:#00ff00;"></span><span class="kta-legende-label">Route principale</span></div>
      <div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:#b000ff;"></span><span class="kta-legende-label">Route secondaire</span></div>
      <div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:#ffff00;"></span><span class="kta-legende-label">Chemin</span></div>
      <div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:#ff4ecb;"></span><span class="kta-legende-label">Jonction interniveau</span></div>
    </div>
  `;

  // 🚫 v169 (Karma_dev) : ajout d'Inaccessible (hachures rouge/noir) — zone
  // bloquante pour le pathfinder, contrainte dure. Visuel cohérent avec
  // l'on-map (pattern SVG via background pour la swatch de légende).
  const contenuZones = `
    <div class="kta-aide-section">
      <div class="kta-aide-section-titre">⬛ Zones</div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#3aa9e8; opacity:0.7; height:14px; border:2px solid #0066aa;"></span>
        <span class="kta-legende-label">Eau</span>
      </div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#5a5a68; opacity:0.7; height:14px; border:2px solid #3a3a44;"></span>
        <span class="kta-legende-label">Remblais</span>
      </div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#ff3333; opacity:0.7; height:14px; border:2px solid #cc0000;"></span>
        <span class="kta-legende-label">Effondrement</span>
      </div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:repeating-linear-gradient(45deg, #5a0a0a 0 6px, #1a1f2e 6px 10px); height:14px; border:2px solid #5a0a0a;"></span>
        <span class="kta-legende-label">Inaccessible</span>
      </div>
    </div>
  `;

  // 🏛️ v1.10.3 (KARMA "structures pas dans la légende") : ajout section
  // Structures (piliers + mur en polygones, fronts en polylines). Couleurs
  // cohérentes avec STRUCTURE_STYLES (structures.js) et le hotfix v1.10.1-2
  // (front-1 jaune = pilier-1, front-2 orange = pilier-2).
  const contenuStructures = `
    <div class="kta-aide-section">
      <div class="kta-aide-section-titre">🏛️ Structures</div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#f4c542; opacity:0.85; height:14px; border:2px solid #000000;"></span>
        <span class="kta-legende-label">Pilier 1ère masse</span>
      </div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#ff9933; opacity:0.85; height:14px; border:2px solid #000000;"></span>
        <span class="kta-legende-label">Pilier 2e masse</span>
      </div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#1e3a8a; opacity:0.85; height:14px; border:2px solid #000000;"></span>
        <span class="kta-legende-label">Mur</span>
      </div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#f4c542;"></span>
        <span class="kta-legende-label">Front de taille 1ère masse</span>
      </div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#ff9933;"></span>
        <span class="kta-legende-label">Front de taille 2e masse</span>
      </div>
    </div>
  `;

  // 🆕 v1.9.2-fix13 : retrait du style inline `max-width:480px` qui
  // bloquait l'agrandissement PC. La modale utilise désormais les tailles
  // standard de .kta-readme-modal-boite (mobile : min(960px, 96vw),
  // PC : 1400px / 1700px / 2000px selon le palier — cf. style.css).
  // Sur mobile la légende reste lisible (96vw), sur PC elle profite
  // de l'espace pour afficher plus de groupes en parallèle si besoin.
  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-legende-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">🗺️ Légende</span>
        <button class="kta-panneau-close" id="kta-legende-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps kta-legende-corps">
        ${contenuIcones}
        ${contenuTracés}
        ${contenuZones}
        ${contenuStructures}
      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);
  document.getElementById("kta-legende-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
}

// =========================
// 🤖 AIDE IA — génère un fichier de contexte téléchargeable
// =========================
// Le contenu vit dans le fichier STATIQUE `docs/AI_CONTEXT.md` (depuis
// v1.8.0 — auparavant à la racine, déplacé dans docs/ avec README_USER.md).
// JS se contente de :
//   1. fetch docs/AI_CONTEXT.md (le squelette enrichi)
//   2. fetch docs/README_USER.md (la doc officielle)
//   3. remplacer les placeholders {{DATE}}, {{BUILD}}, {{README_USER}}
//   4. proposer le fichier au téléchargement
//
// Avantage : tout l'enrichissement du contexte IA se fait en éditant
// docs/AI_CONTEXT.md, sans toucher au code JS. Le SW propage automatiquement.
// =========================

function _genererContenuContexteIA(aiContextTemplate, readmeUserText) {
  const dateExport = new Date().toISOString().slice(0, 10);
  const buildVersion = (window.__MKM__ && window.__MKM__.build) || "non-défini";

  // Si le template docs/AI_CONTEXT.md est dispo, on s'en sert. Sinon fallback minimal.
  if (aiContextTemplate && aiContextTemplate.trim().length > 0) {
    return aiContextTemplate
      .replace(/\{\{DATE\}\}/g, dateExport)
      .replace(/\{\{BUILD\}\}/g, buildVersion)
      .replace(
        /\{\{README_USER\}\}/g,
        readmeUserText && readmeUserText.trim().length > 0
          ? readmeUserText
          : "_⚠️ Documentation utilisateur indisponible au moment de la génération (échec du fetch docs/README_USER.md). Réessaye depuis l'app avec une connexion active ou après que le service worker ait mis le fichier en cache._"
      );
  }

  // ===== Fallback ultra-minimal si AI_CONTEXT.md est introuvable =====
  return (
    "# MyKTAMap — Contexte IA (fallback minimal)\n\n" +
    "> ⚠️ Le fichier `AI_CONTEXT.md` n'a pas pu être récupéré. Ce fichier de secours " +
    "contient uniquement la documentation utilisateur brute. Réessaye depuis l'app " +
    "quand le service worker aura mis `AI_CONTEXT.md` en cache.\n\n" +
    "**Auteur** : Flavien VIDAL (alias KARMA) · **Licence** : CC BY-NC-SA 4.0 · " +
    "**Site** : https://myktamap.fr\n\n" +
    "Date d'export : " + dateExport + " · Build : " + buildVersion + "\n\n" +
    "---\n\n" +
    (readmeUserText || "_Documentation utilisateur également indisponible._") +
    "\n"
  );
}


// =========================
// 🔔 MODALE MISE À JOUR DISPONIBLE — déclenchée par updateChecker.js
// =========================
// =========================
// 🚨 MODALE ALERTE PUBLIQUE — diffusée par alert.json (incendie, fermeture, etc.)
// =========================
// Déclenchée par alertChecker.js si alert.json a `active: true`.
// 3 niveaux possibles selon `level` :
//   - "emergency" : rouge + pulse (incendie, fermeture totale, etc.)
//   - "warning"   : orange (perturbation, info importante)
//   - "info"      : bleu (annonce neutre)
// Modale informative quand l'utilisateur clique sur 🔔 et qu'il n'y a pas
// d'alerte en cours (alert.json renommé en .lock côté serveur → 404, OU
// alert.json présent avec "active": false). Permet de confirmer visuellement
// que la situation est revenue à la normale.
window.afficherModaleAlerteAbsente = function(status) {
  if (document.getElementById("kta-alert-absent-modal")) return;

  const isOffline   = (status === "offline");
  const isUpToDate  = (status === "up-to-date");

  // Pour "up-to-date" : lit les notes de la dernière version connue (stockées
  // par UpdateChecker au dernier fetch réussi) pour les afficher dans la modale.
  let lastVersionData = null;
  if (isUpToDate) {
    try {
      const raw = localStorage.getItem("myktamap_last_version_data");
      if (raw) lastVersionData = JSON.parse(raw);
    } catch(e) {}
  }

  // Échappe le texte HTML (anti-XSS sur contenu remote)
  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  let icon, title, msg, extraHtml = "";
  if (isOffline) {
    icon  = "📡";
    title = "Vérification impossible";
    msg   = "Tu es hors ligne — impossible de vérifier l'état des alertes ou des mises à jour. Réessaie quand tu auras du réseau.";
  } else if (isUpToDate) {
    icon  = "✅";
    title = "Déjà à jour";
    const installed = (window.__MKM__ && window.__MKM__.build) || (lastVersionData && lastVersionData.version) || "?";
    msg = "Tu utilises la dernière version : <strong>" + _esc(installed) + "</strong>.";
    // Bloc "📝 Dernière mise à jour" si on a les données
    if (lastVersionData && (lastVersionData.released || (Array.isArray(lastVersionData.notes) && lastVersionData.notes.length))) {
      extraHtml += '<div class="kta-alert-absent-version-block">';
      if (lastVersionData.released) {
        extraHtml += '<div class="kta-alert-absent-version-released">Publiée le <strong>' + _esc(lastVersionData.released) + '</strong></div>';
      }
      if (Array.isArray(lastVersionData.notes) && lastVersionData.notes.length) {
        extraHtml += '<div class="kta-alert-absent-version-notes-titre">📝 Notes de cette version</div>';
        extraHtml += '<ul class="kta-alert-absent-version-notes">';
        lastVersionData.notes.forEach(function(n) {
          extraHtml += '<li>' + _esc(n) + '</li>';
        });
        extraHtml += '</ul>';
      }
      extraHtml += '</div>';
    }
  } else {
    icon  = "✅";
    title = "Aucune alerte en cours";
    msg   = "Pas d'alerte publique active actuellement. Le serveur ne diffuse aucune communication urgente. Continue à utiliser l'app normalement.";
  }

  // Variante compacte pour les modales informatives (vs overlay opaque global) :
  // backdrop translucide léger, boîte centrée mais NON pleine hauteur.
  const modal = document.createElement("div");
  modal.id = "kta-alert-absent-modal";
  modal.className = "kta-alert-absent-overlay kta-alert-absent-compact";
  modal.innerHTML =
    '<div class="kta-alert-absent-boite">' +
      '<div class="kta-alert-absent-header">' +
        '<span class="kta-alert-absent-icon">' + icon + '</span>' +
        '<span class="kta-alert-absent-title">' + title + '</span>' +
      '</div>' +
      '<div class="kta-alert-absent-corps">' +
        '<p class="kta-alert-absent-msg">' + msg + '</p>' +
        extraHtml +
      '</div>' +
      '<div class="kta-alert-absent-actions">' +
        '<button class="kta-btn kta-btn-primary" id="kta-alert-absent-ok" type="button">OK</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() { modal.remove(); }
  document.getElementById("kta-alert-absent-ok").addEventListener("click", _fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });
  // Échap = fermer
  function _onKey(e) { if (e.key === "Escape") { _fermer(); document.removeEventListener("keydown", _onKey); } }
  document.addEventListener("keydown", _onKey);
};

// v166 : sélecteur d'alertes quand N > 1 alertes actives. Liste classée par
// criticité (emergency > warning > info). Click sur une row → ouvre la modale
// détail correspondante. Après acquit, si d'autres alertes restent → re-ouvre
// le sélecteur. Si l'user ferme le sélecteur (✕ ou Échap), tout se ferme.
//
// `alerts` : array d'objets alert (format normalisé par alertChecker.js).
// `opts.onSelect(alert)` : callback appelé quand l'user clique une row.
// `opts.fromBoot` : si true (boot post-splash), bypass-acquittement check
//                   (= filtre sur non-acquittées seulement). Si false (click
//                   bouton 🚨), affiche TOUTES les alertes même acquittées.
window.afficherSelecteurAlertes = function(alerts, opts) {
  if (!Array.isArray(alerts) || alerts.length === 0) return;
  if (document.getElementById("kta-alert-selector-modal")) return;
  opts = opts || {};

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Tri par priorité (emergency > warning > info) puis released desc
  const prioOrder = { emergency: 0, warning: 1, info: 2 };
  const sorted = alerts.slice().sort(function(a, b) {
    const pa = prioOrder[a.level] != null ? prioOrder[a.level] : 3;
    const pb = prioOrder[b.level] != null ? prioOrder[b.level] : 3;
    if (pa !== pb) return pa - pb;
    return (b.released || "").localeCompare(a.released || "");
  });

  // Indicateur acquit : utile en mode "click 🚨" pour distinguer les alertes
  // déjà lues. localStorage["myktamap_alert_seen_<id>"] = released acquitté.
  function _isAcquittee(a) {
    if (!a.id || !a.released) return false;
    try {
      const seen = localStorage.getItem("myktamap_alert_seen_" + a.id);
      return seen === a.released;
    } catch(e) { return false; }
  }

  const rowsHtml = sorted.map(function(a) {
    const level = (a.level === "warning" || a.level === "info") ? a.level : "emergency";
    const acq   = _isAcquittee(a);
    const ts    = a.released ? a.released.replace("T", " ").replace(/:\d{2}\.?\d*Z?$/, "") : "";
    return '' +
      '<button type="button" class="kta-alert-selector-row kta-alert-selector-row-' + level + (acq ? ' kta-alert-selector-row-seen' : '') + '" data-alert-id="' + _esc(a.id || "") + '">' +
        '<span class="kta-alert-selector-dot"></span>' +
        '<span class="kta-alert-selector-content">' +
          '<span class="kta-alert-selector-title">' + _esc(a.title || "(sans titre)") + '</span>' +
          (ts ? '<span class="kta-alert-selector-meta">' + _esc(ts) + (acq ? ' · ✓ acquittée' : '') + '</span>' : '') +
        '</span>' +
        '<span class="kta-alert-selector-arrow">›</span>' +
      '</button>';
  }).join("");

  const modal = document.createElement("div");
  modal.id = "kta-alert-selector-modal";
  modal.className = "kta-readme-modal-overlay kta-alert-selector-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite kta-alert-selector-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">📋 ' + sorted.length + ' alertes actives</span>' +
        '<button class="kta-panneau-close" id="kta-alert-selector-close" type="button" aria-label="Fermer">&times;</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-alert-selector-corps">' +
        '<p class="kta-alert-selector-hint">Sélectionne une alerte pour voir le détail. Triées par criticité décroissante.</p>' +
        '<div class="kta-alert-selector-list">' + rowsHtml + '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() {
    if (modal.parentNode) modal.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) { if (e.key === "Escape") _fermer(); }
  modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });
  document.addEventListener("keydown", _onKey);
  document.getElementById("kta-alert-selector-close").addEventListener("click", _fermer);

  modal.querySelectorAll(".kta-alert-selector-row").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const id = btn.getAttribute("data-alert-id");
      const alertObj = sorted.filter(function(a) { return a.id === id; })[0];
      if (!alertObj) return;
      _fermer();
      // Petite pause pour fade-out visuel propre, puis ouvre la détail.
      // Au close de la détail, on appelle onSelect pour permettre la cascade
      // (réouvrir le sélecteur si d'autres alertes restent à voir).
      setTimeout(function() {
        if (typeof opts.onSelect === "function") {
          opts.onSelect(alertObj);
        } else {
          window.afficherModaleAlerte(alertObj);
        }
      }, 150);
    });
  });
};

// v163 : 2e arg optionnel `onClose` — callback appelé à la fermeture de la
// modale (utilisé par AlertChecker pour la cascade multi-alertes).
window.afficherModaleAlerte = function(alert, onClose) {
  if (!alert) return;
  if (document.getElementById("kta-alert-modal")) return;

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const id    = alert.id    || "";  // v163 : acquit individuel par id
  const level = alert.level === "warning" || alert.level === "info" ? alert.level : "emergency";
  const title = alert.title   || "🚨 Alerte";
  const msg   = alert.message || "";
  const details = Array.isArray(alert.details) ? alert.details : [];
  const released = alert.released || "";

  const detailsHtml = details.length
    ? '<ul class="kta-alert-details">' +
        details.map(function(d) { return '<li>' + _esc(d) + '</li>'; }).join("") +
      '</ul>'
    : '';

  const footerInfo = released
    ? '<div class="kta-alert-released">Publié le ' + _esc(released) + '</div>'
    : '';

  const modal = document.createElement("div");
  modal.id = "kta-alert-modal";
  modal.className = "kta-readme-modal-overlay kta-alert-overlay kta-alert-level-" + level;
  modal.innerHTML =
    '<div class="kta-readme-modal-boite kta-alert-boite">' +
      '<div class="kta-readme-modal-header kta-alert-header">' +
        '<span class="kta-alert-pulse-side">!</span>' +
        '<span class="kta-alert-title-text">' + _esc(title) + '</span>' +
        '<span class="kta-alert-pulse-side">!</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-alert-corps">' +
        '<p class="kta-alert-msg">' + _esc(msg) + '</p>' +
        detailsHtml +
        footerInfo +
      '</div>' +
      '<div class="kta-alert-actions">' +
        '<button class="kta-btn kta-btn-primary kta-alert-btn-ok" id="kta-alert-ok" type="button">J\'ai compris</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() {
    if (window.AlertChecker && typeof window.AlertChecker.dismiss === "function") {
      // v163 : passe id + released pour acquit individuel (pas juste released)
      window.AlertChecker.dismiss(id, released);
    }
    modal.remove();
    // v163 : callback pour la cascade multi-alertes
    if (typeof onClose === "function") {
      try { onClose(); } catch(e) {}
    }
  }

  document.getElementById("kta-alert-ok").addEventListener("click", _fermer);
  // Volontairement PAS de fermeture au clic backdrop : alerte critique,
  // l'utilisateur doit cliquer explicitement "J'ai compris".
};

window.afficherModaleUpdateDispo = function(opts) {
  // Si déjà ouverte (re-appel), ne fait rien
  if (document.getElementById("kta-update-modal")) return;

  const localVersion  = opts.localVersion  || "?";
  const remote        = opts.remote        || {};
  const remoteVersion = remote.version     || "?";
  const released      = remote.released    || "";
  const notes         = Array.isArray(remote.notes) ? remote.notes
                       : (remote.notes ? [remote.notes] : []);

  const notesHtml = notes.length
    ? '<ul style="margin:8px 0 0 0; padding-left:22px; color:#c8d0e0; font-size:13px; line-height:1.6;">' +
        notes.map(function(n) { return '<li>' + String(n).replace(/</g, "&lt;") + '</li>'; }).join("") +
      '</ul>'
    : '<p style="color:#8892a4; font-size:12px; font-style:italic; margin:8px 0 0 0;">Aucune note de version fournie.</p>';

  const modal = document.createElement("div");
  modal.id = "kta-update-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:85vh;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">🔔 Mise à jour disponible</span>' +
        '<button class="kta-panneau-close" id="kta-update-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">📦 Versions</div>' +
          '<div style="display:flex; align-items:center; gap:14px; padding:10px 14px; background:rgba(140,180,255,0.06); border-radius:8px; border:1px solid rgba(140,180,255,0.18);">' +
            '<div style="font-size:12px; color:#8892a4;">' +
              'Installée<br>' +
              '<strong style="font-size:18px; color:#c8d0e0; font-family:ui-monospace,monospace;">' + localVersion + '</strong>' +
            '</div>' +
            '<div style="font-size:20px; color:#8cb4ff;">→</div>' +
            '<div style="font-size:12px; color:#8892a4;">' +
              'Disponible' + (released ? ' (' + released + ')' : '') + '<br>' +
              '<strong style="font-size:18px; color:#f4c542; font-family:ui-monospace,monospace;">' + remoteVersion + '</strong>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">🆕 Nouveautés</div>' +
          notesHtml +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">🔄 Deux modes de mise à jour</div>' +
          '<div style="background:rgba(108,226,138,0.08); border:1px solid rgba(108,226,138,0.30); border-radius:8px; padding:10px 12px; margin-bottom:8px;">' +
            '<div style="font-weight:700; color:#6ce28a; font-size:13px; margin-bottom:4px;">🪶 Mise à jour douce (recommandée)</div>' +
            '<div style="color:#c8d0e0; font-size:12.5px; line-height:1.55;">' +
              'Seul le <strong>code de l\'app</strong> est rafraîchi (HTML, JS, CSS, docs). ' +
              'Tes <strong>plans, sessions et préférences sont préservés</strong>.' +
            '</div>' +
          '</div>' +
          '<div style="background:rgba(255,107,107,0.06); border:1px solid rgba(255,107,107,0.25); border-radius:8px; padding:10px 12px;">' +
            '<div style="font-weight:700; color:#ff6b6b; font-size:13px; margin-bottom:4px;">💥 Reset complet</div>' +
            '<div style="color:#c8d0e0; font-size:12.5px; line-height:1.55;">' +
              'À utiliser <strong>seulement</strong> si la mise à jour douce ne suffit pas ' +
              '(problème persistant). Purge <strong>tout</strong> : cache, plans, sessions, préférences.' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div style="display:flex; gap:10px; margin-top:14px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-update-postpone" type="button" style="flex:1;">Plus tard (24h)</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-update-accept-soft" type="button" style="flex:2;">🪶 Mise à jour douce</button>' +
        '</div>' +
        '<div style="text-align:center; margin-top:10px;">' +
          '<button class="kta-btn-link kta-update-link-danger" id="kta-update-accept-hard" type="button">💥 Forcer un reset complet à la place</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() { modal.remove(); }

  document.getElementById("kta-update-close").addEventListener("click", function() {
    _fermer();
    if (typeof opts.onPostpone === "function") opts.onPostpone();
  });
  document.getElementById("kta-update-postpone").addEventListener("click", function() {
    _fermer();
    if (typeof opts.onPostpone === "function") opts.onPostpone();
  });
  // 🪶 Mise à jour douce — préserve les données utilisateur
  document.getElementById("kta-update-accept-soft").addEventListener("click", function() {
    _fermer();
    if (typeof opts.onAcceptSoft === "function") {
      opts.onAcceptSoft();
    } else if (typeof window.mettreAJourCodeSeul === "function") {
      window.mettreAJourCodeSeul();
    }
  });
  // 💥 Reset complet — purge tout (fallback)
  document.getElementById("kta-update-accept-hard").addEventListener("click", function() {
    _fermer();
    if (typeof opts.onAcceptHard === "function") {
      opts.onAcceptHard();
    } else if (typeof opts.onAccept === "function") {
      // Rétro-compat — l'ancien callback `onAccept` était le reset complet
      opts.onAccept();
    } else if (typeof window.viderCacheAppli === "function") {
      window.viderCacheAppli();
    }
  });
  // Clic backdrop = postpone (équivalent Plus tard)
  modal.addEventListener("click", function(e) {
    if (e.target === modal) {
      _fermer();
      if (typeof opts.onPostpone === "function") opts.onPostpone();
    }
  });
};

window.afficherModaleAideIA = function() {
  const existing = document.getElementById("kta-aide-ia-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id = "kta-aide-ia-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:600px; height:auto; max-height:90vh;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">🤖 Aide IA — Contexte téléchargeable</span>' +
        '<button class="kta-panneau-close" id="kta-aide-ia-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">💡 Concept</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:13px;">' +
            'Télécharge un fichier <strong>.md</strong> qui résume tout ce que ' +
            'l\'app permet de faire. Donne-le à <strong>n\'importe quelle IA</strong> ' +
            '(ChatGPT, Claude, Gemini, Perplexity, Le Chat, Copilot, etc.) — elle ' +
            'pourra répondre à toutes tes questions sur MyKTAMap avec un contexte ' +
            'précis et à jour.' +
          '</p>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">📋 Comment ça marche</div>' +
          '<ol style="color:#c8d0e0; line-height:1.7; font-size:13px; padding-left:22px; margin:0;">' +
            '<li>Clique <strong>📥 Télécharger le contexte</strong> en bas</li>' +
            '<li>Ouvre l\'IA de ton choix (web, app mobile, etc.)</li>' +
            '<li>Copie-colle le fichier dans le <strong>premier message</strong> de la conversation</li>' +
            '<li>Pose tes questions : <em>"Comment ajouter un point ?"</em>, <em>"Mon plan plante, que faire ?"</em>, etc.</li>' +
          '</ol>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">🔒 Confidentialité</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:13px;">' +
            'Le fichier ne contient <strong>QUE la documentation</strong> de l\'app — ' +
            '<strong>aucune donnée personnelle</strong> (pas de tes plans, points, sessions, etc.). ' +
            'Tu peux donc le partager sans risque.' +
          '</p>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">📋 Prompt prêt à coller (anti-hallucination)</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:12px; margin:0 0 8px 0;">' +
            'Colle ce texte <strong>avec</strong> le fichier .md dans le premier message de l\'IA. ' +
            'Il cadre les règles et limite les hallucinations.' +
          '</p>' +
          '<div class="kta-aide-ia-prompt-wrap">' +
            '<textarea id="kta-aide-ia-prompt" class="kta-aide-ia-prompt" readonly>' +
              'Voici la documentation officielle de l\'application MyKTAMap (fichier .md joint).\n\n' +
              'Tu vas m\'aider à l\'utiliser en suivant ces règles STRICTES :\n\n' +
              '⛔ Ne réponds QUE à partir du contenu du fichier joint.\n' +
              '⛔ Si une fonctionnalité n\'y est pas décrite, dis-le clairement — n\'invente JAMAIS.\n' +
              '⛔ N\'extrapole pas à partir d\'autres applis (Google Maps, QGIS, etc.).\n' +
              '⛔ Tu n\'as accès ni au code source, ni au site web, ni à mon application.\n' +
              '✅ Cite la section du fichier où tu trouves l\'info dans tes réponses.\n' +
              '✅ Utilise les icônes et libellés exacts mentionnés dans la doc.\n\n' +
              'Si tu as bien compris, réponds simplement « OK, prêt » et attends ma première question.' +
            '</textarea>' +
            '<button class="kta-btn kta-btn-ghost kta-aide-ia-copy-btn" id="kta-aide-ia-copy" type="button">📋 Copier</button>' +
          '</div>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">💰 Note importante</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:13px;">' +
            'L\'utilisation d\'une IA peut être <strong>payante ou limitée</strong> selon ' +
            'le service (ChatGPT gratuit avec quotas, Claude Pro, etc.). MyKTAMap reste ' +
            '<strong>gratuit</strong> — le contexte téléchargé est juste pour aider une ' +
            'IA externe à mieux te répondre.' +
          '</p>' +
        '</div>' +

        '<div style="display:flex; gap:10px; margin-top:14px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-aide-ia-cancel"   type="button" style="flex:1;">Annuler</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-aide-ia-download" type="button" style="flex:2;">📥 Télécharger le contexte (.md)</button>' +
        '</div>' +
        '<div id="kta-aide-ia-status" style="margin-top:10px; font-size:12px; color:#8892a4; min-height:18px; text-align:center;"></div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() { modal.remove(); }

  document.getElementById("kta-aide-ia-close").addEventListener("click", _fermer);
  document.getElementById("kta-aide-ia-cancel").addEventListener("click", _fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });

  // Copie du prompt dans le presse-papiers
  document.getElementById("kta-aide-ia-copy").addEventListener("click", async function() {
    const btn = this;
    const ta = document.getElementById("kta-aide-ia-prompt");
    const originalText = btn.textContent;
    try {
      // navigator.clipboard requiert HTTPS ou localhost — fallback execCommand sinon
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(ta.value);
      } else {
        ta.select();
        document.execCommand("copy");
        ta.setSelectionRange(0, 0);
        ta.blur();
      }
      btn.textContent = "✓ Copié !";
      btn.classList.add("kta-aide-ia-copy-ok");
      setTimeout(function() {
        btn.textContent = originalText;
        btn.classList.remove("kta-aide-ia-copy-ok");
      }, 1500);
    } catch(e) {
      console.warn("[AideIA] Copy failed :", e);
      btn.textContent = "❌ Échec — sélectionne manuellement";
      setTimeout(function() { btn.textContent = originalText; }, 2000);
    }
  });

  document.getElementById("kta-aide-ia-download").addEventListener("click", async function() {
    const btn = this;
    const statusEl = document.getElementById("kta-aide-ia-status");
    btn.disabled = true;
    btn.textContent = "⏳ Génération en cours...";
    statusEl.textContent = "Fetch de la documentation...";

    // Fetch en parallèle : docs/AI_CONTEXT.md (template) + docs/README_USER.md (doc utilisateur)
    // v1.8.0 : déplacés dans le sous-dossier docs/ (sauf README.md qui reste racine).
    let aiContextTpl = "";
    let readmeText = "";
    try {
      const [respCtx, respDoc] = await Promise.all([
        fetch("docs/AI_CONTEXT.md", { cache: "no-cache" }),
        fetch("docs/README_USER.md", { cache: "no-cache" })
      ]);
      if (respCtx.ok) {
        aiContextTpl = await respCtx.text();
      } else {
        console.warn("[AideIA] docs/AI_CONTEXT.md HTTP " + respCtx.status);
      }
      if (respDoc.ok) {
        readmeText = await respDoc.text();
      } else {
        console.warn("[AideIA] docs/README_USER.md HTTP " + respDoc.status);
      }
      const tplKo = Math.round(aiContextTpl.length / 1024);
      const docKo = Math.round(readmeText.length / 1024);
      statusEl.textContent = "Template " + tplKo + " Ko + doc " + docKo + " Ko. Génération...";
    } catch(e) {
      console.warn("[AideIA] Erreur fetch :", e);
      statusEl.textContent = "⚠️ Échec du fetch — fallback minimal.";
    }

    // Construction du contenu complet via remplacement de placeholders
    const contenu = _genererContenuContexteIA(aiContextTpl, readmeText);
    const blob = new Blob([contenu], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Nom de fichier avec timestamp
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MyKTAMap-AI-Context-" + ts + ".md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    statusEl.textContent = "✓ Fichier téléchargé (" + Math.round(contenu.length / 1024) + " Ko)";
    btn.textContent = "📥 Télécharger le contexte (.md)";
    btn.disabled = false;

    // Fermer la modale après 1.5s
    setTimeout(_fermer, 1500);
  });
};

// =========================
// EXPORT GLOBAL
// =========================
window.afficherConfig         = afficherConfig;
window.appliquerConfig        = appliquerConfig;
window.resetConfig            = resetConfig;
window.ouvrirCalibrageEchelle = ouvrirCalibrageEchelle;
window.viderCacheAppli       = viderCacheAppli;
window.mettreAJourCodeSeul   = mettreAJourCodeSeul;
window.afficherReadme        = afficherReadme;
window.afficherLegende       = afficherLegende;
// window.afficherConvertisseur retiré le 08/05/2026 — la conversion est maintenant
// dans le modal "💾 Enregistrer la session" → onglet "🔄 Conversion" (sessionExporter.js)
window.initInterface         = initInterface;
