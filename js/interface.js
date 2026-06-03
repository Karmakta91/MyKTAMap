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

  // Modale centrée avec overlay (charte refonte). L'ancienne interface
  // (dropdown legacy v1.8.x) a été retirée en v1.14.19 — cf cleanup v1.26.2.
  _ouvrirPlanSwitcherRefonte(recents, current);

  // Listeners de fermeture
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
  // 🐛 v1.16.0-fix (KARMA "les deux garde-fou — les données non exportées
  // seront perdues — avec les autosaves et snap c'est plus totalement
  // vrai, il faut adapter") : reformulation pour refléter le filet de
  // sécurité SessionPersist (auto-save par plan) + SessionBackups (10
  // snapshots FIFO IDB). La session du plan courant n'est pas PERDUE en
  // changeant de plan — elle est sauvegardée et restaurée au retour.
  const overlay = document.createElement("div");
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-modal">' +
      '<div class="kta-modal-icon">🗂️</div>' +
      '<div class="kta-modal-titre">Charger un autre plan</div>' +
      '<div class="kta-modal-texte">' +
        'Session actuellement active sur le plan en cours :' +
        '<ul style="text-align:left; margin:10px 0 14px 0; padding-left:24px; color:#a8b3c8; line-height:1.6; list-style-type:disc;">' +
          items.map(function(it) { return '<li style="color:#a8b3c8;">' + escapeHtmlSwitcher(it) + '</li>'; }).join("") +
        '</ul>' +
        '<strong style="color:#6ce28a;">✅ La session du plan courant est sauvegardée</strong> ' +
        'et sera restaurée à ton retour sur ce plan.<br>' +
        '<span style="color:#a8b3c8; font-size:12.5px;">' +
          '📦 Les 10 derniers snapshots restent dispos dans 📊 Détails de ' +
          'session › Backups pour revenir à un état antérieur si besoin.' +
        '</span><br><br>' +
        'Charger « <strong>' + escapeHtmlSwitcher(plan.name || plan.id) + '</strong> » ?' +
      '</div>' +
      '<div class="kta-modal-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-switch-annuler">Annuler</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-switch-confirmer">📚 Charger</button>' +
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
// 📤 IMPORT / EXPORT SESSION — DÉPLACÉ (v1.31.0 P3 Lot 5)
// =========================
// `window.telechargerSessionJSON`, `window.importerSessionJSON`,
// `window.ouvrirImportChoix`, `window.ouvrirImportSession` + leurs helpers
// (modale d'import GPX externe, validation format, etc.) ont été extraits
// vers `js/interfaceImportExport.js` pour réduire le volume du fichier
// principal (cf. P3 Lot 5, découpe interface.js). Comportement runtime
// strictement identique à v1.30.1.

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
    <div class="kta-modal" style="max-width:440px;">
      <div class="kta-modal-icon">🗂️</div>
      <div class="kta-modal-titre">Changer de plan</div>
      <div class="kta-modal-texte">
        Tu vas quitter la session en cours pour revenir à la liste de tes plans.<br><br>
        <strong style="color:#6ce28a;">✅ Ta session est sauvegardée automatiquement</strong>
        et sera restaurée quand tu reviendras sur ce plan.<br>
        <span style="color:#a8b3c8; font-size:12.5px;">
          📦 Les 10 derniers snapshots restent aussi disponibles dans
          📊 Détails de session › Backups récents pour revenir à un état
          antérieur à tout moment.
        </span>
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
// ⚙️ CONFIG (Réglages + Perf ULTRA + Multi-niveau + Géoref) — DÉPLACÉ (v1.31.0 P3 Lot 9)
// =========================
// `window.afficherConfig`, `window.appliquerConfig`, `window.resetConfig`,
// `window.appliquerFiltreNiveau`, `window.appliquerFiltreRuntime`,
// `window._initLevelFilterControl`, `window._ouvrirCreationJonction`
// + leurs helpers internes (_renderPerfUltraSection,
// _renderMultiLevelSection, géoréférencement GPS, modale Réglages
// complète, M-LVL modales et helpers, M-LVL Leaflet control top-left)
// ont été extraits vers `js/interfaceConfig.js` pour réduire le volume
// du fichier principal (cf. P3 Lot 9, DERNIER LOT de la découpe
// interface.js). Comportement runtime strictement identique à v1.30.1.

// =========================
// 🔧 MAINTENANCE — DÉPLACÉ (v1.31.0 P3 Lot 7)
// =========================
// `window.ouvrirCalibrageEchelle`, `window.viderCacheAppli`,
// `window.mettreAJourCodeSeul` + helpers ping connectivité
// (`window._pingInternet`, `window._pingInternetUrl`) ont été extraits
// vers `js/interfaceMaintenance.js` pour réduire le volume du fichier
// principal (cf. P3 Lot 7, découpe interface.js). Comportement runtime
// strictement identique à v1.30.1.

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
// INIT INTERFACE
// =========================
// =========================
// HELPER ACCORDÉON
// =========================
// Gère l'ouverture/fermeture exclusive des groupes
// + maintien forcé en ouvert si un mode est actif

const _groupes = {}; // { groupeId: { container, btnPrincipal, subActions: [], modeActif: false } }
// 🆕 v1.21.0 (U4) : expose pour le module js/shortcuts.js qui doit pouvoir
// trigger un click sur btnPrincipal[id] depuis un raccourci clavier global.
// Lecture uniquement côté consumers — les mutations restent locales à
// _creerGroupeAccordeon. Pas de risque de casse car la référence reste
// stable après init (chaque ajout `_groupes[id] = {...}` est aussi visible
// via `window._groupes[id]` puisque c'est le MÊME objet).
window._groupes = _groupes;
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
    // 🆕 v1.16.0 step2-flyout : pas d'expansion accordéon pour les groupes
    // en mode flyout (= traces/zones/structures). L'expansion est gérée
    // séparément par _ouvrirFlyout (panel latéral, pas cascade verticale).
    if (!g.useFlyout) {
      _ouvrirGroupe(id);
    }
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
    } else if (config.useFlyout === true) {
      // 🆕 v1.16.0 step2-flyout : ne crée PAS les sub-actions dans le DOM
      // de la sidebar. Elles sont rendues dans un PANEL latéral à
      // l'ouverture (cf _ouvrirFlyout). Avantage : pas de cascade
      // verticale qui déborde l'écran avec beaucoup de types + customs.
      L.DomEvent.on(btnPrincipal, "click", function(e) {
        L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
        _toggleFlyout(config.id);
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
        // 🆕 v1.16.0 step2-drawable-fix : marqueur des boutons « type »
        // (activent un mode de dessin). Les customs s'insèrent ENTRE les
        // types et les outils dans la sidebar (cf KARMA "on ajoute les
        // icônes avant Valider et Effacer").
        if (sub.isTypeAction) btnSub.dataset.typeAction = "1";

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
      position:     pos,  // "topleft" ou "topright"
      // 🆕 v1.16.0 step2-flyout : stocke la config pour le rendu du flyout
      // (sousActionsConfig est la liste raw des sous-actions, lcCat est la
      // catégorie LegendCustomization pour pull des customs, customActivator
      // est le helper d'activation pour un id custom).
      useFlyout:        config.useFlyout === true,
      sousActionsConfig: config.sousActions || [],
      lcCat:             config.lcCat || null,
      customActivator:   config.customActivator || null,
      // 🆕 v1.16.0 step 3 : si fourni, override de sousActionsConfig au
      // moment de l'ouverture du flyout. Permet aux groupes qui ont une
      // liste de sub-actions dynamique (ex: ⭐ Favoris) de la recalculer
      // à chaque ouverture sans rebuild du groupe entier.
      dynamicSousActions: (typeof config.dynamicSousActions === "function")
                           ? config.dynamicSousActions
                           : null
    };

    return div;
  };
  ctrl.addTo(window.map);
}

// =========================
// 🆕 v1.16.0 step2-flyout : Flyout panel latéral
// =========================
//
// Remplace la cascade verticale des sub-actions par un panneau ouvert à
// côté du bouton principal du groupe. Évite que la sidebar déborde l'écran
// quand l'utilisateur cumule beaucoup de types + customs (cf KARMA
// scalability concern v1.16.0 step2-flyout).

let _currentFlyout = null;

function _toggleFlyout(groupId) {
  if (_currentFlyout && _currentFlyout.dataset.groupId === groupId) {
    _fermerFlyout();
    return;
  }
  _ouvrirFlyout(groupId);
}

function _fermerFlyout() {
  if (_currentFlyout) {
    try { _currentFlyout.remove(); } catch(e) {}
    _currentFlyout = null;
  }
  document.removeEventListener("click",    _onDocClickFlyout, true);
  document.removeEventListener("touchend", _onDocClickFlyout, true);
  window.removeEventListener("resize",     _onResizeFlyout);
  window.removeEventListener("scroll",     _onResizeFlyout, true);
}

function _onDocClickFlyout(e) {
  if (!_currentFlyout) return;
  if (_currentFlyout.contains(e.target)) return;
  // Le clic sur le bouton principal du groupe associé est géré par son
  // propre handler (_toggleFlyout) qui inversera proprement → on le laisse
  // faire son toggle sans fermer ici (sinon double-close).
  const grpId = _currentFlyout.dataset.groupId;
  const grp = _groupes[grpId];
  if (grp && grp.btnPrincipal && grp.btnPrincipal.contains(e.target)) return;
  _fermerFlyout();
}

function _onResizeFlyout() {
  if (!_currentFlyout) return;
  const grpId = _currentFlyout.dataset.groupId;
  const grp = _groupes[grpId];
  if (!grp) return;
  _positionnerFlyout(_currentFlyout, grp.btnPrincipal, grp.position);
}

function _ouvrirFlyout(groupId) {
  // Ferme un éventuel autre flyout en cours
  _fermerFlyout();
  // Ferme aussi tout groupe accordéon ouvert (cohérence "1 menu à la fois")
  if (_groupeOuvert) _fermerGroupe(_groupeOuvert);

  const grp = _groupes[groupId];
  if (!grp || !grp.useFlyout) return;
  if (!grp.btnPrincipal) return;

  const fly = document.createElement("div");
  fly.className = "kta-group-flyout";
  fly.dataset.groupId = groupId;

  // Header
  const header = document.createElement("div");
  header.className = "kta-group-flyout-header";
  const titleEl = document.createElement("span");
  titleEl.className = "kta-group-flyout-title";
  titleEl.textContent = (grp.btnPrincipal.title || groupId);
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "kta-group-flyout-close";
  closeBtn.title = "Fermer";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", function(ev) {
    ev.stopPropagation();
    _fermerFlyout();
  });
  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  fly.appendChild(header);

  // Grid de boutons
  const grid = document.createElement("div");
  grid.className = "kta-group-flyout-grid";
  fly.appendChild(grid);

  // Construit la liste finale des actions : types built-in + customs
  // (insérés AVANT les outils, cf step2-drawable-fix) + outils.
  // 🆕 v1.16.0 step 3 : si le groupe a un `dynamicSousActions` (cas du
  // groupe ⭐ Favoris dont la liste varie à chaque ouverture), on l'appelle
  // pour obtenir la liste fraîche au lieu de relire sousActionsConfig.
  const baseActions = (typeof grp.dynamicSousActions === "function")
                        ? (grp.dynamicSousActions() || [])
                        : (grp.sousActionsConfig || []).slice();
  const allActions  = baseActions.slice();
  if (window.LegendCustomization && grp.lcCat && typeof window.LegendCustomization.listCustomEntries === "function") {
    const customs = window.LegendCustomization.listCustomEntries(grp.lcCat).filter(function(e) { return e.visible; });
    if (customs.length > 0) {
      const firstNonTypeIdx = allActions.findIndex(function(a) { return !a.isTypeAction; });
      const insertIdx = firstNonTypeIdx >= 0 ? firstNonTypeIdx : allActions.length;
      const customActions = customs.map(function(e) {
        const isLine = (e.geometry === "polyline") || (!e.geometry && e.lineColor && !e.fillColor);
        let iconHtml;
        if (isLine) {
          const col = e.lineColor || e.fillColor || '#888';
          iconHtml = '<span style="display:inline-block;width:18px;height:3px;background:' + col + ';vertical-align:middle;border-radius:1px;"></span>';
        } else {
          const fill   = e.fillColor || e.lineColor || '#888';
          const border = e.borderColor || e.lineColor || fill;
          iconHtml = '<span style="display:inline-block;width:14px;height:14px;background:' + fill + ';border:1px solid ' + border + ';vertical-align:middle;border-radius:2px;"></span>';
        }
        return {
          icone:        iconHtml,
          // 🐛 v1.16.0 step2-flyout-fix (KARMA "pour les nouveaux ajouts en
          // légende j'ai des étoiles en icône pour tous dans le menu normal") :
          // on retire le préfixe "✨ " du libellé — le swatch coloré (icône
          // de gauche) différencie déjà visuellement un custom d'un built-in,
          // le préfixe étoile était redondant.
          titre:        e.label,
          isTypeAction: true,
          isCustom:     true,
          customType:   e.id,
          onClick:      function(btn) {
            if (typeof grp.customActivator === "function") grp.customActivator(e.id, btn);
          }
        };
      });
      allActions.splice(insertIdx, 0, ...customActions);
    }
  }

  // Détermine le type courant actif pour ce groupe (pour kta-actif visuel)
  const currentMode = (function() {
    if (groupId === "traces")     return window.modeRoad      || null;
    if (groupId === "zones")      return window.modeZone      || null;
    if (groupId === "structures") return window.modeStructure || null;
    return null;
  })();

  // Indique où insérer le séparateur (entre dernier type-action et premier
  // non-type-action). Si pas de mix, pas de séparateur.
  let sepInserted = false;

  allActions.forEach(function(sub, idx) {
    // Séparateur visuel avant la 1ère sub-action non-type-action
    if (!sepInserted && !sub.isTypeAction && idx > 0 && allActions[idx-1].isTypeAction) {
      const sep = document.createElement("div");
      sep.className = "kta-group-flyout-sep";
      grid.appendChild(sep);
      sepInserted = true;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kta-group-flyout-btn";
    // 🆕 v1.21.2 (KARMA "met je suis perdu et urgence a la fin du menu tracker
    // avec un fond rouge") : propage la cssClass de la sub-action sur le
    // bouton flyout, comme déjà fait dans la cascade verticale legacy
    // (cf bloc else "Créer les sous-actions" + extraCls). Avant, la classe
    // kta-sous-action-urgence n'était pas appliquée en mode flyout, donc
    // le fond rouge des modes urgence/lost n'apparaissait pas.
    if (sub.cssClass)     btn.classList.add(sub.cssClass);
    if (sub.isTypeAction) btn.dataset.typeAction = "1";
    if (sub.customType)   btn.dataset.customType = sub.customType;

    const iconEl = document.createElement("span");
    iconEl.className = "kta-group-flyout-btn-icon";
    // 🆕 v1.21.2 (KARMA tracker flyout) : support icône dynamique pour les
    // sous-actions dont l'apparence dépend d'un état runtime (ex: ▶️↔⏹️
    // pour Play/Stop du tracker). Sinon icône statique habituelle.
    iconEl.innerHTML = (typeof sub.dynamicIcon === "function")
                       ? (sub.dynamicIcon() || sub.icone || "")
                       : (sub.icone || "");
    const lblEl = document.createElement("span");
    lblEl.className = "kta-group-flyout-btn-label";
    lblEl.textContent = sub.titre || "";
    btn.appendChild(iconEl);
    btn.appendChild(lblEl);

    // Marqueur actif visuel — 2 chemins :
    // (1) sub.isActive() : function custom qui retourne bool. Utilisé par
    //     les groupes qui ont PLUSIEURS modes actifs en parallèle (ex:
    //     tracker = Play + Recalage + Boussole peuvent être tous actifs).
    // (2) currentMode (fallback historique) : pour les groupes traces/
    //     zones/structures qui ont 1 SEUL mode actif à la fois.
    if (typeof sub.isActive === "function") {
      try { if (sub.isActive()) btn.classList.add("kta-actif"); } catch(e) {}
    } else if (currentMode && (sub.customType === currentMode)) {
      btn.classList.add("kta-actif");
    } else if (currentMode && !sub.customType && sub.isTypeAction) {
      // Pour les types built-in, on n'a pas l'ID dans le config sub-action
      // (l'ID est dans la closure onClick). Heuristique : typeKey.
      if (sub.typeKey && sub.typeKey === currentMode) {
        btn.classList.add("kta-actif");
      }
    }

    btn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      // Ferme le flyout AVANT de déclencher l'action — sinon le mode actif
      // ouvre des modales (ex : suppression) qui se mélangeraient avec le
      // flyout encore ouvert.
      _fermerFlyout();
      try { sub.onClick(btn); } catch(err) {
        console.warn("[Flyout] action click erreur :", err);
      }
    });
    grid.appendChild(btn);
  });

  document.body.appendChild(fly);
  _positionnerFlyout(fly, grp.btnPrincipal, grp.position);
  _currentFlyout = fly;

  // Click externe / scroll / resize → ferme ou repositionne
  // setTimeout pour éviter que le click ayant déclenché l'ouverture
  // ne re-déclenche immédiatement la fermeture (bubble).
  setTimeout(function() {
    document.addEventListener("click",    _onDocClickFlyout, true);
    document.addEventListener("touchend", _onDocClickFlyout, true);
    window.addEventListener("resize",     _onResizeFlyout);
    window.addEventListener("scroll",     _onResizeFlyout, true);
  }, 0);
}

function _positionnerFlyout(fly, btnPrincipal, sidebarPosition) {
  const rect    = btnPrincipal.getBoundingClientRect();
  const padding = 8;
  const vpW     = window.innerWidth;
  const vpH     = window.innerHeight;
  const safeMargin = 12;

  // 🐛 v1.16.0 step2-flyout-fix (KARMA "le modal doit pouvoir se dérouler
  // et ne pas sortir du cadre en horizontal") : on COMPUTE la max-height
  // en pixels réels (pas en vh) pour garantir que le panneau ne déborde
  // jamais du viewport — particulièrement en landscape mobile où 78vh peut
  // dépasser 80% de l'écran et où Safari iOS a parfois des soucis avec vh
  // (URL bar dynamique, safe-area, etc.). Le scroll INTERNE prend le relais.
  const maxH = Math.max(120, vpH - 2 * safeMargin);
  fly.style.maxHeight = maxH + "px";

  // Idem pour la largeur (utile en portrait étroit où 280px peut être trop
  // large par rapport au viewport, et en landscape étroit où l'espace
  // dispo de chaque côté de la sidebar est limité).
  const maxW = Math.max(180, vpW - 2 * safeMargin);
  fly.style.maxWidth = Math.min(maxW, 320) + "px";

  // Mesure réelle après application des max-* (le navigateur clamp si
  // le contenu est trop grand, sinon offsetHeight reflète le contenu).
  const flyWidth  = fly.offsetWidth  || 240;
  const flyHeight = fly.offsetHeight || 200;

  // Position verticale : aligné au top du bouton, clampé au viewport.
  // Si le panel dépasserait en bas → on le remonte. Si le top dépasse
  // déjà en bas (cas extrême), on clamp à safeMargin.
  let top = rect.top;
  if (top + flyHeight > vpH - safeMargin) {
    top = vpH - flyHeight - safeMargin;
  }
  if (top < safeMargin) top = safeMargin;

  // Position horizontale : selon sidebar (topleft → flyout à droite ;
  // topright → flyout à gauche). Clamp + bascule si pas de place.
  let left;
  const isLeft = (sidebarPosition === "topleft");
  if (isLeft) {
    left = rect.right + padding;
    if (left + flyWidth > vpW - safeMargin) {
      left = rect.left - flyWidth - padding;
    }
  } else {
    left = rect.left - flyWidth - padding;
    if (left < safeMargin) {
      left = rect.right + padding;
    }
  }
  // Clamp final
  if (left < safeMargin) left = safeMargin;
  if (left + flyWidth > vpW - safeMargin) {
    left = vpW - flyWidth - safeMargin;
  }

  fly.style.top  = top  + "px";
  fly.style.left = left + "px";
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
// 🆕 v1.21.5 (KARMA "refonte filtre Leaflet") : bouton custom ≡ qui remplace
// le L.control.layers natif. Au clic, ouvre la modale FilterPanel unifiée
// (Images + Data layers + M-LVL + Tags + Types Road/Zone/Struct).
// =========================
L.control.ktaFilterControl = function() {
  const ctrl = L.control({ position: "topright" });
  ctrl.onAdd = function() {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control kta-filter-ctrl");
    // 🐛 v1.21.5-fix2 (KARMA "en mode sombre, je fond de l'icone filtre est
    // blanc au lieu du fond habituel en mode sombre") : on NE hardcode PAS
    // color/background en inline. Le styling vient de :
    //   • Leaflet base (.leaflet-bar a) — fond blanc + texte noir par défaut
    //   • MyKTAMap dark theme override (body.kta-refonte-v1 .leaflet-bar a)
    //   • MyKTAMap light theme override (html.kta-theme-light .leaflet-bar a)
    // → match automatique du thème courant comme les autres boutons sidebar.
    div.innerHTML =
      '<a href="#" role="button" aria-label="Filtres" title="Filtres (Images, Données, Niveaux, Tags, Types)" ' +
      'style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;font-size:18px;line-height:1;text-decoration:none;">' +
      '&#9776;' +  // ≡ (trois barres horizontales)
      '</a>';
    // Empêche le clic de propager au map (pan/zoom)
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.on(div, "click", function(e) {
      L.DomEvent.preventDefault(e);
      if (window.FilterPanel && typeof window.FilterPanel.ouvrir === "function") {
        window.FilterPanel.ouvrir();
      } else {
        console.warn("[Interface] FilterPanel non chargé");
      }
    });
    return div;
  };
  return ctrl;
};

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

  // 🆕 v1.21.5 (KARMA "refonte filtre Leaflet") : bouton ≡ custom topright
  // qui ouvre la modale FilterPanel unifiée (remplace L.control.layers natif).
  L.control.ktaFilterControl().addTo(window.map);

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
    // 🆕 v1.31.0 P3 Lot 9 : _initLevelFilterControl extraite vers
    // js/interfaceConfig.js → fallback via window.X.
    if (typeof window._initLevelFilterControl === "function") {
      window._initLevelFilterControl();
    }

    // 🆕 v1.16.0 step 3 (KARMA "met plutôt l'icône favoris dans le menu
    // de gauche, juste après M-LVL") — Groupe ⭐ FAVORIS positionné en
    // topleft, AJOUTÉ APRÈS la pastille M-LVL → apparaît juste sous
    // elle dans la sidebar gauche. Pattern flyout (panel latéral, pas
    // cascade verticale) pour scalabilité.
    //
    // dynamicSousActions = liste recalculée à chaque ouverture du flyout
    // depuis window.Favoris.getAll() — reflète en live les ajouts/retraits
    // via le bouton ⭐ dans les popups POI. _allerVersFavori est défini
    // plus bas dans initInterface (hoisting JS).
    _creerGroupeAccordeon({
      id: "favoris",
      iconePrincipale: "⭐",
      titre: "Favoris",
      position: "topleft",
      useFlyout: true,
      dynamicSousActions: function() {
        if (!window.Favoris) return [];
        const favs = window.Favoris.getAll();
        if (favs.length === 0) {
          return [{
            icone: "ℹ️",
            titre: "(aucun favori — clique ⭐ dans une popup pour ajouter)",
            onClick: function() {}  // no-op
          }];
        }
        return favs.map(function(f) {
          const tag = f.tag || "default";
          let iconHtml;
          if (window.PLAN_CONFIG && window.PLAN_CONFIG.icons && window.PLAN_CONFIG.icons[tag]) {
            iconHtml = '<img src="' + window.PLAN_CONFIG.icons[tag] + '" alt="" style="width:18px;height:18px;object-fit:contain;">';
          } else if (window._iconMap && window._iconMap[tag]) {
            const io = window._iconMap[tag];
            const url = io._kta_iconUrl || (io.options && io.options.iconUrl);
            if (url) iconHtml = '<img src="' + url + '" alt="" style="width:18px;height:18px;object-fit:contain;">';
          }
          if (!iconHtml) iconHtml = "📍";

          return {
            icone: iconHtml,
            titre: f.nom,
            onClick: function() {
              _allerVersFavori(f);
            }
          };
        });
      }
    });
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
      // 🆕 v1.31.0 P3 Lot 4 : afficherAide / afficherReadme extraites vers
      // js/interfaceDocs.js et exposées via window.* — référence indirecte
      // via window.X car les identifiers locaux n'existent plus dans le
      // scope de interface.js après extraction.
      { icone: "❓", titre: "Aide",          onClick: function() { if (typeof window.afficherAide === "function") window.afficherAide(); } },
      { icone: "📖", titre: "Documentation", onClick: function() { if (typeof window.afficherReadme === "function") window.afficherReadme(); } },
      { icone: "🤖", titre: "Aide IA",       onClick: function() {
          if (typeof window.afficherModaleAideIA === "function") {
            window.afficherModaleAideIA();
          }
        } },
      { icone: "🗺️", titre: "Légende",       onClick: afficherLegende }
      // 🆕 v1.21.0 — Rejouer le tutoriel premier-lancement à tout moment.
      // 🔄 v1.21.3 (KARMA "le bouton Onboarding on peux le mettre tout en
      // haut de la doc README") : retiré de ce menu, désormais accessible
      // via le bouton 🎓 directement dans le header de la modale 📖
      // Documentation (afficherReadme). Markedasseen est toujours posé au
      // boot par Tutorial.ouvrir() pour empêcher l'auto-popup.
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
    soloAction: function() { if (typeof window.afficherConfig === "function") window.afficherConfig(); }
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
      // 🆕 v1.31.0 P3 Lot 5 : ouvrirImportSession extraite vers
      // js/interfaceImportExport.js → fallback via window.X.
      { icone: "📥", titre: "Importer (session MyKTAMap ou GPX externe)", onClick: function() {
          if (typeof window.ouvrirImportChoix === "function") window.ouvrirImportChoix();
          else if (typeof window.ouvrirImportSession === "function") window.ouvrirImportSession();
        } },
      { icone: "📊", titre: "Éditer un fichier JSON", onClick: function() {
          if (window.ouvrirTableEditor) window.ouvrirTableEditor();
          else alert("Module éditeur de tableau indisponible");
        } }
    ]
  });

  // 4. CRÉER / MODIFIER PLAN — RETIRÉ du mode carte (refonte UI imposée
  // depuis v1.14.19). Le Générateur reste accessible UNIQUEMENT depuis le
  // loader/home via le bouton "🏗️ Générer un plan" (philosophie "actions
  // de création hors du mode carte", choix KARMA). Branche legacy supprimée
  // au cleanup v1.26.2.

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
  // 🆕 v1.21.2 (KARMA "on commence a voir bcp icone") : migration vers le
  // pattern flyout (panel latéral, cf §16 CLAUDE.md) car la cascade verticale
  // débordait avec ~7 sous-actions. Spécificités tracker vs traces/zones/
  // structures : (a) icône dynamique ▶️↔⏹️ selon état tracking →
  // dynamicIcon function (b) plusieurs modes actifs en parallèle
  // (Play + Recalage + Boussole) → isActive function par sub-action.
  let isTracking = false;
  _creerGroupeAccordeon({
    id: "tracker",
    iconePrincipale: "🧭",
    titre: "Tracker",
    useFlyout: true,
    sousActions: [
      {
        icone: "▶️",
        titre: "Démarrer / arrêter le tracking",
        // Icône dynamique selon état tracking — relu à chaque ouverture flyout
        dynamicIcon: function() { return isTracking ? "⏹️" : "▶️"; },
        isActive:    function() { return isTracking === true; },
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
        // 🆕 v1.21.2 : actif si le widget compass est visible (sync au re-ouvert flyout)
        isActive: function() {
          return !!(window.CompassWidget && typeof window.CompassWidget.isVisible === "function"
                    && window.CompassWidget.isVisible());
        },
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
        // 🆕 v1.21.2 : actif si le mode recalage est en cours (sync au re-ouvert flyout)
        isActive: function() { return window.modeRecalage === true; },
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
      },
      // 🔥 v1.21.2 RÉACTIVÉ (KARMA "on reactive") — pertinent maintenant que
      // la timeline tracker GPS est persistée dans SessionPersist /
      // SessionBackups (= cumul multi-session exploitable).
      {
        icone: "🔥",
        titre: "Heatmap — densité tracker + points",
        onClick: function() {
          if (window.MyKTAMapHeatmap && typeof window.MyKTAMapHeatmap.ouvrirModale === "function") {
            window.MyKTAMapHeatmap.ouvrirModale();
          } else {
            alert("Module Heatmap indisponible. Recharge la page si le problème persiste.");
          }
        }
      },
      // 🆕 v1.21.2 (KARMA "met je suis perdu et urgence a la fin du menu
      // tracker avec un fond rouge") : les 2 modes urgence sont placés EN
      // FIN du flyout pour les séparer visuellement des fonctions de
      // navigation/visualisation normales. cssClass = kta-sous-action-urgence
      // applique le fond rouge distinctif (cf css/style.css §sous-action-urgence
      // + light theme override §11290).
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
      // 🆕 v1.22.0 — 🚨 Mode Secours : outil opérationnel pour assigner
      // des équipes de recherche à des zones du plan. Multi-scénarios,
      // export PDF/KMZ. KARMA : "définir un plan de secours / lire un
      // plan de secours". Placé en FIN du flyout, fond rouge urgence.
      {
        icone: "🚨",
        titre: "Mode Secours — Plans de recherche (équipes + zones)",
        cssClass: "kta-sous-action-urgence",
        onClick: function() {
          if (window.SecoursMode && typeof window.SecoursMode.ouvrir === "function") {
            window.SecoursMode.ouvrir();
          } else {
            alert("Mode Secours indisponible (SecoursMode non chargé).");
          }
        }
      }
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
  // 🆕 v1.21.3 (KARMA "on garde le crayon, mais on enleve la poubelle […]
  // c'est plus un menu déroulant juste le crayon") :
  //   • Avant : groupe accordéon avec 2 sous-actions [✏️ Ajouter, 🗑️ Effacer].
  //   • Maintenant : soloAction sur le bouton principal ✏️ qui toggle
  //     directement le mode ajout de point. Plus de menu déroulant.
  //   • La sous-action 🗑️ a été retirée — la suppression d'un point se
  //     fait désormais via la popup du marker (bouton 🗑️ Supprimer ce point)
  //     ou Ctrl+Z (Undo) pour annuler la dernière action. Wipe complet :
  //     passer par Reset session.
  //   • Toggle visuel via classe `.kta-group-mode-actif` sur le btnPrincipal
  //     (gérée à la main ici car _setGroupeModeActif est pensée pour
  //     subActions/flyout, on évite l'overhead inutile pour un solo toggle).
  _creerGroupeAccordeon({
    id: "edition",
    iconePrincipale: "✏️",
    titre: "Ajouter un point (clic = toggle mode)",
    soloAction: function() {
      const grp = _groupes["edition"];
      if (!grp || !grp.btnPrincipal) return;
      const btn = grp.btnPrincipal;
      const dejaActif = btn.classList.contains("kta-group-mode-actif");
      // Toujours désactiver les autres modes avant de basculer (cohérent
      // avec les sub-actions historiques).
      _desactiverTousLesModes();
      if (dejaActif) {
        window.modeEdition = false;
        btn.classList.remove("kta-group-mode-actif");
        grp.modeActif = false;
        delete _modesActifs["edition"];
        return;
      }
      window.modeEdition = true;
      btn.classList.add("kta-group-mode-actif");
      grp.modeActif = true;
      _modesActifs["edition"] = {
        btnEl: btn,
        desactiverFn: function() {
          window.modeEdition = false;
          btn.classList.remove("kta-group-mode-actif");
          grp.modeActif = false;
        }
      };
    }
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
    { icone: "🟩", titre: "Route principale", isTypeAction: true, typeKey: "principal",
      onClick: function(btn) { _activerRoute("principal",  btn, "🟩"); } },
    { icone: "🟪", titre: "Route secondaire", isTypeAction: true, typeKey: "secondaire",
      onClick: function(btn) { _activerRoute("secondaire", btn, "🟪"); } },
    { icone: "🟨", titre: "Chemin", isTypeAction: true, typeKey: "chemin",
      onClick: function(btn) { _activerRoute("chemin",     btn, "🟨"); } }
  );

  if (_isMultiLevel) {
    _sousActionsTraces.push({
      icone: "🪜",
      titre: "Jonction interniveau",
      isTypeAction: true,
      typeKey: "jonction",
      onClick: function(btn) {
        // Toggle (Bug 4 fix v148.test) : si le mode jonction est deja actif,
        // re-clic = on désactive proprement le mode (cohérent avec le
        // comportement des autres types via _activerRoute). Sinon → ouvre
        // la modale de saisie from/to.
        if (window.modeRoad === "jonction") {
          _fermerModeRoad();
          return;
        }
        // 🆕 v1.31.0 P3 Lot 9 : _ouvrirCreationJonction extraite vers
        // js/interfaceConfig.js → fallback via window.X.
        if (typeof window._ouvrirCreationJonction === "function") {
          window._ouvrirCreationJonction(btn);
        }
      }
    });
  }

  _sousActionsTraces.push(
    // 🆕 v1.16.0 step2-flyout-valider (KARMA "rajoute un bouton Valider
    // dans tracé, qui fait la même chose que fermer le tracé en cours") :
    // bouton générique qui valide le tracé en cours quel que soit son
    // type (principal, secondaire, chemin, jonction, OU custom ✨). C'est
    // l'équivalent d'un re-clic sur le type actif (toggle off → road
    // reste dans roadsData mais window.modeRoad/currentRoad → null).
    // Pas isTypeAction → s'affiche APRÈS les types dans le flyout (après
    // le séparateur visuel).
    { icone: "✅", titre: "Valider le tracé en cours",
      onClick: function() {
        if (!window.modeRoad) {
          _alertCharte(
            "Aucun tracé en cours",
            "Active d'abord un type (🟩 Principal, 🟪 Secondaire, 🟨 Chemin) ou un tracé custom ✨ avant de valider.",
            "🛣️"
          );
          return;
        }
        // _fermerModeRoad fait : desactiverFn() (= toggleRoadMode +
        // reset visuel) + delete _modesActifs["road"]. Comportement
        // identique à un re-clic sur le bouton du type actif.
        _fermerModeRoad();
      }
    },
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
    sousActions: _sousActionsTraces,
    // 🆕 v1.16.0 step2-flyout : panel latéral au lieu de cascade verticale
    useFlyout: true,
    lcCat: "traces",
    customActivator: function(customId, btn) { _activerRoute(customId, btn, "✨"); }
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
    // 🆕 v1.16.0 step2-flyout : panel latéral
    useFlyout: true,
    lcCat: "zones",
    customActivator: function(customId, btn) { _activerZone(customId, btn, "✨"); },
    sousActions: [
      { icone: "⬛", titre: "Zone de remblais", isTypeAction: true, typeKey: "remblais",
        onClick: function(btn) { _activerZone("remblais",     btn, "⬛"); } },
      { icone: "🟥", titre: "Zone d'effondrement", isTypeAction: true, typeKey: "effondrement",
        onClick: function(btn) { _activerZone("effondrement", btn, "🟥"); } },
      { icone: "🟦", titre: "Zone d'eau", isTypeAction: true, typeKey: "eau",
        onClick: function(btn) { _activerZone("eau",          btn, "🟦"); } },
      // 🚫 v169 (Karma_dev) : zone bloquante pour le pathfinder. Hachures
      // rouge/noir 45°. Tout segment de route qui traverse est inutilisable
      // pour le calcul d'itinéraire (= contrainte dure).
      { icone: "⛔", titre: "Zone inaccessible (bloque l'itinéraire)", isTypeAction: true, typeKey: "inaccessible",
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
    // 🆕 v1.16.0 step2-flyout : panel latéral
    useFlyout: true,
    lcCat: "structures",
    customActivator: function(customId, btn) { _activerStructure(customId, btn, "✨"); },
    sousActions: [
      // 🟡 Pilier 1ère masse : icone rond jaune (= couleur charte MKM,
      // cohérent avec le fill #f4c542 de la structure rendue sur carte).
      // KARMA-fix : 1ère masse en JAUNE (couleurs inversées par rapport
      // au draft initial qui avait orange / jaune dans le mauvais sens).
      // En multi-niveau : tagué au niveau actif.
      { icone: "🟡", titre: "Pilier 1ère masse (jaune)", isTypeAction: true, typeKey: "pilier-1",
        onClick: function(btn) { _activerStructure("pilier-1", btn, "🟡"); } },
      // 🟠 Pilier 2e masse : icone rond orange (fill #ff9933).
      // En multi-niveau : AUTO-tagué à `activeLevel - 1` (cf. structures.js)
      // car structurellement la masse inférieure visible depuis l'actuelle.
      { icone: "🟠", titre: "Pilier 2e masse (orange) — niveau -1 auto", isTypeAction: true, typeKey: "pilier-2",
        onClick: function(btn) { _activerStructure("pilier-2", btn, "🟠"); } },
      // 🔵 Mur : KARMA "rond bleu pour pas confondre avec icône eau"
      // (la zone eau utilise 🟦 carré bleu clair, ici on prend ROND bleu
      // foncé pour distinguer visuellement).
      { icone: "🔵", titre: "Mur (bleu foncé)", isTypeAction: true, typeKey: "mur",
        onClick: function(btn) { _activerStructure("mur", btn, "🔵"); } },
      // 🆕 v1.9.3-A1.b.2 : fronts de taille (polylines épaisses sans
      // contour). KARMA : "ce sont des tracé ok mais il reste dans
      // 'structure'". Couleurs INVERSÉES vs piliers : front-1 = orange
      // (cohérent avec pilier-2), front-2 = jaune (cohérent avec pilier-1).
      // Même règle multi-niveau que les piliers : front-2 auto-tagué
      // activeLevel - 1.
      { icone: "🟨", titre: "Front de taille 1ère masse (jaune épais)", isTypeAction: true, typeKey: "front-1",
        onClick: function(btn) { _activerStructure("front-1", btn, "🟨"); } },
      { icone: "🟧", titre: "Front de taille 2e masse (orange épais) — niveau -1 auto", isTypeAction: true, typeKey: "front-2",
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
              // 🐛 v1.16.0 step2-flyout-valider : pour les CUSTOM structures,
              // window.isStructurePolylineType consulte LegendCustomization
              // pour distinguer polyline (front custom) vs polygon (pilier
              // custom). Avant : check hardcodé sur "front-1/front-2" qui
              // tombait toujours sur "polygon, 3 points" pour les customs
              // → message faux pour un custom polyline.
              const isLine = (typeof window.isStructurePolylineType === "function")
                && window.isStructurePolylineType(window.modeStructure);
              if (isLine) {
                _alertCharte(
                  "Pas assez de points",
                  "Un front de taille (ligne ouverte) est un tracé. Place <strong>au moins 2 points</strong> sur la carte avant de le valider.",
                  "📐"
                );
              } else {
                _alertCharte(
                  "Pas assez de points",
                  "Un pilier / mur (polygone fermé) doit avoir <strong>au moins 3 points</strong>. Place les points sur la carte avant de le fermer.",
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

  // 🆕 v1.16.0 step2-drawable : injection des boutons des entrées CUSTOM
  // dans les groupes traces / zones / structures de la sidebar. Permet à
  // l'utilisateur de DESSINER directement les types qu'il a ajoutés via le
  // bouton ✏️ Modifier de la légende.
  //
  // Chaque bouton :
  //   - icône = swatch couleur (lineColor pour polylines, fillColor pour
  //     polygones) ou img si iconUrl
  //   - title = "✨ <label>"
  //   - data-custom-id = entry.id (pour identifier / retirer plus tard)
  //   - click → appelle _activerRoute/_activerZone/_activerStructure avec
  //     entry.id comme type (les helpers passent ça à toggleXMode qui le
  //     stocke comme road.type / zone.type / structure.type)
  //
  // Hook LegendCustomization.onCustomEntriesChange → refresh quand un
  // custom est ajouté/supprimé/modifié pour que la sidebar suive en live.
  function _injecterBoutonsCustomSidebar() {
    const mapping = [
      { groupeId: "traces",     lcCat: "traces",     activerFn: _activerRoute     },
      { groupeId: "zones",      lcCat: "zones",      activerFn: _activerZone      },
      { groupeId: "structures", lcCat: "structures", activerFn: _activerStructure }
    ];
    const LC = window.LegendCustomization;
    if (!LC) return;

    mapping.forEach(function(m) {
      const grp = _groupes[m.groupeId];
      if (!grp || !grp.container) return;

      // 🆕 v1.16.0 step2-flyout : pour les groupes en mode FLYOUT, les
      // customs sont pullés lazily à chaque _ouvrirFlyout. On ne touche
      // PAS au DOM de la sidebar (pas de cascade).
      if (grp.useFlyout) {
        // Si le flyout est actuellement ouvert pour ce groupe, on le
        // rebuild pour refléter la nouvelle liste de customs.
        if (_currentFlyout && _currentFlyout.dataset.groupId === m.groupeId) {
          _ouvrirFlyout(m.groupeId);
        }
        return;
      }

      // 1) Retire les boutons custom existants (data-custom-id) du DOM ET
      //    du tableau subActions, pour repartir propre.
      grp.container.querySelectorAll('a.kta-sub[data-custom-id]').forEach(function(el) {
        el.remove();
      });
      grp.subActions = grp.subActions.filter(function(el) {
        return !el.dataset || !el.dataset.customId;
      });

      // 2) Trouve l'ANCRE = premier bouton non-type (= outil : ✅ Valider,
      //    🧹 Effacer, 📏 Distance, etc.). Les customs s'insèrent JUSTE
      //    AVANT cette ancre, donc ENTRE les types built-in et les outils.
      //    KARMA : « on ajoute les icônes avant Valider et avant Effacer ».
      const allSubs   = Array.from(grp.container.querySelectorAll('a.kta-sub'));
      const ancreBtn  = allSubs.find(function(b) { return !b.dataset.typeAction; });
      // Position dans subActions où insérer (= index du 1er non-type-action,
      // sinon en queue si tous sont des types).
      const ancreIdx  = ancreBtn
        ? grp.subActions.indexOf(ancreBtn)
        : grp.subActions.length;

      // 3) Construit les nouveaux boutons depuis LC.listCustomEntries.
      //    Filtre les invisibles.
      const customs = LC.listCustomEntries(m.lcCat).filter(function(e) { return e.visible; });
      customs.forEach(function(e, i) {
        // 🐛 v1.16.0 step2-drawable-fix : geometry first pour le swatch.
        const isLine = (e.geometry === "polyline") || (!e.geometry && e.lineColor && !e.fillColor);
        // L.DomUtil.create sans parent → on attache via insertBefore
        const btn = L.DomUtil.create("a", "kta-sub kta-hidden");
        btn.href            = "javascript:void(0)";
        btn.title           = "✨ " + e.label;
        btn.dataset.customId = e.id;
        btn.dataset.subId    = "custom-" + e.id;

        // Swatch visuel selon la géométrie déclarée
        if (isLine) {
          const col = e.lineColor || e.fillColor || '#888';
          btn.innerHTML = '<span style="display:inline-block;width:16px;height:3px;background:' + col + ';vertical-align:middle;border-radius:1px;"></span>';
        } else {
          const fill   = e.fillColor || e.lineColor || '#888';
          const border = e.borderColor || e.lineColor || fill;
          btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;background:' + fill + ';border:1px solid ' + border + ';vertical-align:middle;border-radius:2px;"></span>';
        }

        // Bind click → active le mode pour ce custom (réutilise les helpers
        // existants — fonctionnent avec n'importe quel type string).
        L.DomEvent.on(btn, "click", function(ev) {
          L.DomEvent.stop(ev); L.DomEvent.preventDefault(ev);
          m.activerFn(e.id, btn, "✨");
        });

        // Insère AVANT l'ancre dans le DOM, et au bon index dans subActions
        if (ancreBtn) {
          grp.container.insertBefore(btn, ancreBtn);
        } else {
          grp.container.appendChild(btn);
        }
        grp.subActions.splice(ancreIdx + i, 0, btn);

        // Si le groupe est ouvert, on rend le bouton visible tout de suite
        if (_groupeOuvert === m.groupeId || grp.modeActif) {
          btn.classList.remove("kta-hidden");
        }
      });
    });
  }

  // Premier remplissage au load (au cas où des customs sont déjà persistés)
  _injecterBoutonsCustomSidebar();

  // Refresh automatique sur tout changement (add / remove / update / reset)
  if (window.LegendCustomization && typeof window.LegendCustomization.onCustomEntriesChange === "function") {
    window.LegendCustomization.onCustomEntriesChange(function() {
      _injecterBoutonsCustomSidebar();
    });
  }

  // 🆕 v1.16.0 step 3 — Refresh du flyout Favoris quand la liste change
  // (ajout / retrait via popup ⭐). Si le flyout est ouvert pour favoris,
  // on le re-render en place. Sinon no-op (sera fresh au prochain open).
  //
  // Note : le groupe ⭐ Favoris LUI-MÊME est créé plus haut (juste après
  // _initLevelFilterControl, position topleft pour apparaître juste sous
  // la pastille M-LVL dans la sidebar gauche — cf KARMA "met plutôt
  // l'icône favoris dans le menu de gauche, juste après M-LVL").
  if (window.Favoris && typeof window.Favoris.onChange === "function") {
    window.Favoris.onChange(function() {
      if (_currentFlyout && _currentFlyout.dataset.groupId === "favoris") {
        _ouvrirFlyout("favoris");
      }
    });
  }

  // Helper "aller vers un favori" : centre la carte + flash (cercle
  // pulsant 3s) + open popup si un marker correspondant existe.
  function _allerVersFavori(fav) {
    if (!fav || !window.map) return;
    const latlng = convertCoord(fav.x, fav.y);
    window.map.setView(latlng, window.map.getZoom(), { animate: false });
    window.map.invalidateSize();

    // Cleanup d'un éventuel flash précédent
    if (window._favFlashLayer) {
      try { window.map.removeLayer(window._favFlashLayer); } catch(e) {}
      window._favFlashLayer = null;
    }

    // Cercle d'entourage statique (cohérent avec _ouvrirPopupEtFlash de
    // searchPoints.js — même couleur orange charte).
    window._favFlashLayer = L.circleMarker(latlng, {
      radius:       28,
      color:        "#ffaa00",
      fillColor:    "#ffcc44",
      fillOpacity:  0,
      weight:       3,
      opacity:      0.9,
      interactive:  false
    }).addTo(window.map);

    // Tentative d'ouvrir le popup du marker existant (session ou data
    // layer). Matching par coords plan x/y (tolerance < 0.5 px).
    let foundMarker = null;
    function _scanLayer(lyr) {
      if (foundMarker || !lyr || !lyr.eachLayer) return;
      lyr.eachLayer(function(m) {
        if (foundMarker) return;
        if (m.getLatLng) {
          const ll = m.getLatLng();
          const mx = ll.lng;
          const my = APP_CONFIG.imageHeight - ll.lat;
          if (Math.abs(mx - fav.x) < 0.5 && Math.abs(my - fav.y) < 0.5) {
            foundMarker = m;
          }
        }
      });
    }
    if (window.layerEditor) _scanLayer(window.layerEditor);
    if (!foundMarker && window.dataLayerGroups) {
      Object.keys(window.dataLayerGroups).forEach(function(id) {
        _scanLayer(window.dataLayerGroups[id]);
      });
    }
    if (foundMarker && foundMarker.openPopup) {
      foundMarker.openPopup();
    }

    // Le flash disparaît après 3 secondes
    setTimeout(function() {
      if (window._favFlashLayer) {
        try { window.map.removeLayer(window._favFlashLayer); } catch(e) {}
        window._favFlashLayer = null;
      }
    }, 3000);
  }

  // Initialiser le clic extérieur (une seule fois)
  _initClickExterieur();

  // 🏗️ Multi-niveau : le bouton flottant top-left (sous les boutons de zoom)
  // est déjà créé au DÉBUT de initInterface (fix ordre — Niveau doit être 3e
  // après Zoom, pas en queue après les groupes accordéon topleft). L'ancien
  // appel legacy ici (double création) a été supprimé au cleanup v1.26.2.
}


// =========================
// 🗺️ ITINÉRAIRE + ÉVITEMENTS — DÉPLACÉ (v1.31.0 P3 Lot 6)
// =========================
// `window.ouvrirItinerairModal` + helpers PAN+FLASH + POPUP POI +
// LABEL DISTANCE + Presets vitesse + Évitements (points/tags/zones)
// + getItiTempsMinutes / getItiPauseMinutes / setItiPause* /
// _majLabelDistanceItineraire / itineraireYAller / itineraireAjouterWaypoint
// ont été extraits vers `js/interfaceItineraire.js` (Lot 6 + Lot 8 du
// plan initial fusionnés car helpers partagés). Comportement runtime
// strictement identique à v1.30.1.
//
// La SUPPRESSION clic visuel (tracé/zone/structure ci-dessous) reste
// dans interface.js — aucune dep partagée avec l'itinéraire.

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
// 📏 DISTANCE TOTALE DES TRACÉS — DÉPLACÉ (v1.31.0 P3 Lot 2)
// =========================
// Les 4 fonctions globales `window.ouvrirRoadsDistanceFloater`,
// `window._rdEffacerHighlight`, `window.getDistanceTotaleStatus`,
// `window._rdOnRoadsChanged` + les helpers privés + variables module-level
// ont été extraits vers `js/interfaceDistanceTotale.js` pour réduire le
// volume du fichier principal (cf. P3 Lot 2, découpe interface.js).
// Comportement runtime strictement identique à v1.30.1.

// =========================
// 🗺️ LÉGENDE — DÉPLACÉ (v1.31.0 P3 Lot 3)
// =========================
// `window.afficherLegende` + LEGENDE_LABELS + helpers de génération HTML
// (4 sections : Icônes / Tracés / Zones / Structures) ont été extraits
// vers `js/interfaceLegende.js` pour réduire le volume du fichier principal
// (cf. P3 Lot 3, découpe interface.js). Comportement runtime strictement
// identique à v1.30.1.


// =========================
// EXPORT GLOBAL
// =========================
// window.afficherConfig        exposée dans js/interfaceConfig.js (v1.31.0 P3 Lot 9)
// window.appliquerConfig       exposée dans js/interfaceConfig.js (v1.31.0 P3 Lot 9)
// window.resetConfig           exposée dans js/interfaceConfig.js (v1.31.0 P3 Lot 9)
// window.ouvrirCalibrageEchelle exposée dans js/interfaceMaintenance.js (v1.31.0 P3 Lot 7)
// window.viderCacheAppli       exposée dans js/interfaceMaintenance.js (v1.31.0 P3 Lot 7)
// window.mettreAJourCodeSeul   exposée dans js/interfaceMaintenance.js (v1.31.0 P3 Lot 7)
// window.afficherReadme exposée dans js/interfaceDocs.js (v1.31.0 P3 Lot 4)
// window.afficherAide        exposée dans js/interfaceDocs.js (v1.31.0 P3 Lot 4)
// window.afficherModaleAideIA exposée dans js/interfaceDocs.js (v1.31.0 P3 Lot 4)
// window.afficherLegende     exposée dans js/interfaceLegende.js (v1.31.0 P3 Lot 3)
// window.afficherConvertisseur retiré le 08/05/2026 — la conversion est maintenant
// dans le modal "💾 Enregistrer la session" → onglet "🔄 Conversion" (sessionExporter.js)
window.initInterface         = initInterface;
