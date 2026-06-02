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
// 📤 IMPORT / EXPORT SESSION — DÉPLACÉ (v1.30.2 P3 Lot 5)
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
      ${row("cfg_perf_viewportCull", "👁️ Ne rendre que les éléments visibles", s.viewportCull,
            "Saute les routes <strong>ET les markers POI</strong> hors viewport. Pop-in léger au pan mais énorme gain sur plans denses (100+ POI).")}
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
// 🌐 GÉORÉFÉRENCEMENT GPS — section de la modale ⚙️ Configuration
// =========================
// v1.14.19 (KARMA « rajoute la possibilité de faire le géo référencement
// depuis les paramètres en mode map, auto remplis ensuite si je retourne
// dans exporter »).
//
// Persistance via window.KmzExport.setCalibration(planId, c) — exactement
// le même backend que la modale 📡 Export externe (sessionExporter.js).
// Du coup, calibrage saisi ici → automatiquement pré-rempli quand l'user
// va dans Export externe.
//
// Convention d'IDs : préfixe `cfg_kmz_` pour ne pas entrer en collision
// avec les `kmz_A_x` etc. de sessionExporter (au cas où les 2 modales
// seraient ouvertes en même temps — improbable mais propre).
function _renderCfgGeorefSection() {
  // Pré-charge le calibrage actuel s'il existe
  const planId = window._currentLoadedPlanId || "default";
  const saved  = (window.KmzExport && window.KmzExport.getCalibration)
                  ? window.KmzExport.getCalibration(planId) : null;
  const pA = (saved && saved.pointA) || { x: "", y: "", lat: "", lng: "" };
  const pB = (saved && saved.pointB) || { x: "", y: "", lat: "", lng: "" };

  return '' +
    '<div class="kta-aide-section">' +
      '<div class="kta-aide-section-titre">🌐 Géoréférencement GPS</div>' +
      '<p style="font-size:12px; color:#8892a4; margin:4px 0 12px; line-height:1.5;">' +
        'Calibre le plan en saisissant <strong>2 points de référence</strong> ' +
        '(coordonnées x/y plan + lat/lng GPS WGS84). MyKTAMap calcule la ' +
        'transformation rotation+échelle+translation pour projeter toutes les ' +
        'annotations sur le globe. Le calibrage est <strong>persisté localement ' +
        'par plan</strong> et automatiquement pré-rempli quand tu ouvres ' +
        '<strong>📡 Export externe</strong> (KMZ / GPX) ou que tu importes un GPX.' +
      '</p>' +

      // ===== Point A =====
      // 🆕 v1.21.0-fix1 : ajout des 2 boutons d'aide à la saisie (parité
      // UX avec la modale 💾 Enregistrer > 📡 Export externe) :
      //   - 🔍 Chercher un point : autocomplete sur POI plan → fill x/y
      //   - 📍 Cliquer carte : mode pick → clic sur la carte fill x/y
      // Les coords GPS lat/lng restent saisies manuellement (l'app ne
      // connaît pas le GPS du plan tant que la calibration n'existe pas).
      '<div class="kta-kmz-section" style="margin:8px 0;">' +
        '<div class="kta-kmz-section-titre">📍 Point A</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">Plan x :</label>' +
          '<input type="number" id="cfg_kmz_A_x"   value="' + pA.x   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">Plan y :</label>' +
          '<input type="number" id="cfg_kmz_A_y"   value="' + pA.y   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">GPS (lat, lng) :</label>' +
          // 🆕 hotfix21 — Input combiné lat/lng (format Google Maps natif).
          '<input type="text" id="cfg_kmz_A_coords" value="' + ((typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(pA.lat, pA.lng) : (Number.isFinite(pA.lat) && Number.isFinite(pA.lng) ? pA.lat + ", " + pA.lng : "")) + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8580, 2.2945">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="cfg_kmz_A_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_A_search" type="button">🔍 Chercher un point</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_A_click" type="button">📍 Cliquer carte</button>' +
        '</div>' +
        '<div id="cfg_kmz_A_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      // ===== Point B =====
      '<div class="kta-kmz-section" style="margin:8px 0;">' +
        '<div class="kta-kmz-section-titre">📍 Point B</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">Plan x :</label>' +
          '<input type="number" id="cfg_kmz_B_x"   value="' + pB.x   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">Plan y :</label>' +
          '<input type="number" id="cfg_kmz_B_y"   value="' + pB.y   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">GPS (lat, lng) :</label>' +
          // 🆕 hotfix21 — Input combiné lat/lng (format Google Maps natif).
          '<input type="text" id="cfg_kmz_B_coords" value="' + ((typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(pB.lat, pB.lng) : (Number.isFinite(pB.lat) && Number.isFinite(pB.lng) ? pB.lat + ", " + pB.lng : "")) + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8520, 2.3050">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="cfg_kmz_B_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_B_search" type="button">🔍 Chercher un point</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_B_click" type="button">📍 Cliquer carte</button>' +
        '</div>' +
        '<div id="cfg_kmz_B_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      '<div id="cfg_kmz_status" style="font-size:12px; margin:8px 2px 4px; min-height:18px;"></div>' +

      '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
        '<button class="kta-btn kta-btn-primary" type="button" id="cfg_kmz_save">' +
          '💾 Sauvegarder le calibrage' +
        '</button>' +
        '<button class="kta-btn kta-btn-ghost"   type="button" id="cfg_kmz_clear">' +
          '🗑️ Effacer' +
        '</button>' +
      '</div>' +
    '</div>';
}

function _bindCfgGeorefHandlers() {
  const btnSave   = document.getElementById("cfg_kmz_save");
  const btnClear  = document.getElementById("cfg_kmz_clear");
  const statusEl  = document.getElementById("cfg_kmz_status");
  if (!btnSave || !btnClear) return;  // section pas dans le DOM (sécurité)

  function _setStatus(msg, type) {
    if (!statusEl) return;
    const color = (type === "ok") ? "#6ce28a" : (type === "err") ? "#ff8080" : "#8892a4";
    statusEl.style.color = color;
    statusEl.textContent = msg || "";
  }

  function _readVal(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = el.value;
    if (v === "" || v == null) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  // 🆕 hotfix21 — Bind validation live des inputs GPS combinés cfg_kmz_*_coords.
  // Idempotent : ré-attaches sans risque si déjà bindé (cf. utils.js).
  if (typeof window.attacherGpsValidationCombo === "function") {
    window.attacherGpsValidationCombo(
      document.getElementById("cfg_kmz_A_coords"),
      { errorEl: document.getElementById("cfg_kmz_A_err") }
    );
    window.attacherGpsValidationCombo(
      document.getElementById("cfg_kmz_B_coords"),
      { errorEl: document.getElementById("cfg_kmz_B_err") }
    );
  }

  // 🆕 hotfix21 — Helper : lit l'input combiné "lat, lng", parse + applique
  // border rouge + message inline si format invalide. Retourne {lat, lng}
  // ou null (vide ou invalide). Le caller distingue via 2e param `errKey`.
  function _readCoordsCombo(id, errId) {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = String(el.value || "").trim();
    if (v === "") return null;
    const parsed = (typeof window.parseGpsCoords === "function")
                    ? window.parseGpsCoords(v) : null;
    if (!parsed) {
      el.classList.add("kta-gps-invalid");
      const errEl = errId ? document.getElementById(errId) : null;
      if (errEl) {
        errEl.textContent = "Format attendu : 48.6808, 2.1588";
        errEl.style.display = "";
      }
      return { invalid: true };
    }
    el.classList.remove("kta-gps-invalid");
    const errEl = errId ? document.getElementById(errId) : null;
    if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }
    return { lat: parsed.lat, lng: parsed.lng };
  }

  btnSave.addEventListener("click", function() {
    if (!window.KmzExport) {
      _setStatus("Module KmzExport indisponible.", "err");
      return;
    }
    // 🆕 hotfix21 — Lecture lat/lng via input combiné. Format invalide
    // → border rouge + message + abort silencieux (la combo bloque le save).
    const coordsA = _readCoordsCombo("cfg_kmz_A_coords", "cfg_kmz_A_err");
    const coordsB = _readCoordsCombo("cfg_kmz_B_coords", "cfg_kmz_B_err");
    if ((coordsA && coordsA.invalid) || (coordsB && coordsB.invalid)) {
      _setStatus("Coordonnées GPS invalides — corrige les champs en rouge.", "err");
      return;
    }
    const c = {
      pointA: { x: _readVal("cfg_kmz_A_x"), y: _readVal("cfg_kmz_A_y"),
                lat: coordsA ? coordsA.lat : null,
                lng: coordsA ? coordsA.lng : null },
      pointB: { x: _readVal("cfg_kmz_B_x"), y: _readVal("cfg_kmz_B_y"),
                lat: coordsB ? coordsB.lat : null,
                lng: coordsB ? coordsB.lng : null }
    };
    // Validation : tous les champs requis (x, y, lat, lng pour A et B)
    if (c.pointA.x == null || c.pointA.y == null || c.pointA.lat == null || c.pointA.lng == null ||
        c.pointB.x == null || c.pointB.y == null || c.pointB.lat == null || c.pointB.lng == null) {
      _setStatus("Tous les champs sont obligatoires (Plan x/y + GPS pour A et B).", "err");
      return;
    }
    // Validation transform (lève si points colinéaires ou distance nulle)
    try {
      window.KmzExport.buildTransform(
        { x: c.pointA.x, y: c.pointA.y },
        { x: c.pointB.x, y: c.pointB.y },
        { lat: c.pointA.lat, lng: c.pointA.lng },
        { lat: c.pointB.lat, lng: c.pointB.lng }
      );
    } catch(e) {
      _setStatus("Calibrage invalide : " + e.message, "err");
      return;
    }
    // Persistance
    const planId = window._currentLoadedPlanId || "default";
    window.KmzExport.setCalibration(planId, c);
    _setStatus("✅ Calibrage sauvegardé. Auto-rempli dans 📡 Export externe.", "ok");
    if (window.OOMGuard && window.OOMGuard.showToast) {
      window.OOMGuard.showToast("🌐 Calibrage GPS sauvegardé", "info");
    }
  });

  btnClear.addEventListener("click", function() {
    // 🆕 hotfix21 — Wipe x/y + coords combinés (au lieu des 4 inputs séparés).
    ["A_x","A_y","A_coords","B_x","B_y","B_coords"].forEach(function(k) {
      const el = document.getElementById("cfg_kmz_" + k);
      if (el) {
        el.value = "";
        el.classList.remove("kta-gps-invalid");
      }
    });
    // Cache aussi les éventuels messages d'erreur restants
    ["cfg_kmz_A_err", "cfg_kmz_B_err"].forEach(function(id) {
      const e = document.getElementById(id);
      if (e) { e.textContent = ""; e.style.display = "none"; }
    });
    // Efface aussi la version persistée (préfixe identique à
    // KMZ_CALIB_LS_PREFIX dans js/kmzExport.js).
    try {
      const planId = window._currentLoadedPlanId || "default";
      localStorage.removeItem("myktamap_kmz_calib_" + planId);
    } catch(e) {}
    _setStatus("Calibrage effacé.", null);
  });

  // 🆕 v1.21.0-fix1 : boutons 🔍 Chercher / 📍 Cliquer carte (parité UX
  // avec la modale 💾 Enregistrer > 📡 Export externe). Pattern identique
  // à sessionExporter.js > _kmzOuvrirRecherche / _kmzActiverModeClic mais
  // sur les IDs `cfg_kmz_*` (au lieu de `kmz_*`).
  ["A", "B"].forEach(function(letter) {
    const btnSearch = document.getElementById("cfg_kmz_" + letter + "_search");
    const btnClick  = document.getElementById("cfg_kmz_" + letter + "_click");
    if (btnSearch) btnSearch.addEventListener("click", function() { _cfgOuvrirRechercheGeoref(letter); });
    if (btnClick)  btnClick.addEventListener("click",  function() { _cfgActiverModeClicGeoref(letter); });
  });
}

// ───────── 🔍 RECHERCHE POI (Géoref Réglages — v1.21.0-fix1) ─────────
// Autocomplete inline qui réutilise window.SearchPoints.findByQuery
// (déjà chargé par js/searchPoints.js). Pattern identique au picker
// utilisé dans la modale Enregistrer KMZ.
function _cfgOuvrirRechercheGeoref(letter) {
  const res = document.getElementById("cfg_kmz_" + letter + "_search_results");
  if (!res) return;
  res.style.display = "block";
  res.innerHTML =
    '<input type="text" id="cfg_kmz_' + letter + '_search_q" class="kta-cfg-input" ' +
      'placeholder="Tape un nom / id / tag..." style="width:100%; margin-bottom:6px;">' +
    '<div id="cfg_kmz_' + letter + '_search_list"></div>';
  const input = document.getElementById("cfg_kmz_" + letter + "_search_q");
  const list  = document.getElementById("cfg_kmz_" + letter + "_search_list");
  if (!input || !list) return;
  input.focus();
  let debTimer = null;
  input.addEventListener("input", function() {
    const q = input.value.trim();
    if (debTimer) clearTimeout(debTimer);
    if (!q || !window.SearchPoints || typeof window.SearchPoints.findByQuery !== "function") {
      list.innerHTML = "";
      return;
    }
    debTimer = setTimeout(async function() {
      let results = [];
      try { results = await window.SearchPoints.findByQuery(q) || []; } catch(e) {}
      if (input.value.trim() !== q) return;
      if (results.length === 0) {
        list.innerHTML = '<div class="kta-kmz-search-empty">Aucun résultat pour « ' + q + ' »</div>';
        return;
      }
      list.innerHTML = results.slice(0, 10).map(function(it, i) {
        const p = it.point;
        const nom = p.nom || p.id || "(point)";
        const metaParts = [];
        if (p.id && p.id !== nom) metaParts.push(p.id);
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
          metaParts.push("x=" + p.x + ", y=" + p.y);
        }
        const meta = metaParts.length > 0
          ? '<span class="kta-kmz-search-meta">(' + metaParts.join(" · ") + ')</span>'
          : '';
        return '<div class="kta-kmz-search-item" data-idx="' + i + '">' +
                 '<strong>' + nom + '</strong>' + meta +
               '</div>';
      }).join("");
      list.querySelectorAll(".kta-kmz-search-item").forEach(function(row, i) {
        row.addEventListener("click", function() {
          const p = results[i].point;
          const xEl = document.getElementById("cfg_kmz_" + letter + "_x");
          const yEl = document.getElementById("cfg_kmz_" + letter + "_y");
          if (xEl) xEl.value = p.x;
          if (yEl) yEl.value = p.y;
          res.style.display = "none";
        });
      });
    }, 150);
  });
}

// ───────── 📍 MODE CLIC CARTE (Géoref Réglages — v1.21.0-fix1) ─────────
// Masque temporairement la modale ⚙️ Réglages, active un listener
// `map.on("click")` qui remplit x/y du Point cible et restaure la modale.
// Pattern identique à sessionExporter.js > _kmzActiverModeClic.
let _cfgGeorefClickActive  = false;
let _cfgGeorefClickHandler = null;
let _cfgGeorefClickTarget  = null;

function _cfgActiverModeClicGeoref(letter) {
  if (!window.map) return;
  _cfgDesactiverModeClicGeoref();  // annule un mode précédent éventuel
  _cfgGeorefClickActive = true;
  _cfgGeorefClickTarget = letter;
  _cfgGeorefClickHandler = function(e) {
    const x = e.latlng.lng;
    const y = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) ? (window.APP_CONFIG.imageHeight - e.latlng.lat) : e.latlng.lat;
    const xEl = document.getElementById("cfg_kmz_" + letter + "_x");
    const yEl = document.getElementById("cfg_kmz_" + letter + "_y");
    if (xEl) xEl.value = Math.round(x * 100) / 100;
    if (yEl) yEl.value = Math.round(y * 100) / 100;
    _cfgDesactiverModeClicGeoref();
    const cfgModal = document.getElementById("kta-cfg-modal");
    if (cfgModal) cfgModal.style.display = "";
  };
  window.map.on("click", _cfgGeorefClickHandler);
  // Cache la modale Réglages le temps du clic
  const cfgModal = document.getElementById("kta-cfg-modal");
  if (cfgModal) cfgModal.style.display = "none";
  // Floater visuel pour indiquer le mode (réutilise les classes existantes
  // .kta-iti-floater stylées par la mesure d'itinéraire — visuellement
  // cohérent avec le picker de la modale Enregistrer KMZ).
  const fl = document.createElement("div");
  fl.id = "kta-cfg-georef-click-floater";
  fl.className = "kta-iti-floater";
  fl.innerHTML =
    '<span class="kta-iti-floater-icon">📍</span>' +
    '<span class="kta-iti-floater-msg">Clique sur la carte pour saisir le Point ' + letter + '</span>' +
    '<button class="kta-btn kta-btn-ghost" id="cfg_kmz_click_cancel" type="button">Annuler</button>';
  document.body.appendChild(fl);
  const cancelBtn = document.getElementById("cfg_kmz_click_cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function() {
      _cfgDesactiverModeClicGeoref();
      const m = document.getElementById("kta-cfg-modal");
      if (m) m.style.display = "";
    });
  }
}

function _cfgDesactiverModeClicGeoref() {
  if (!_cfgGeorefClickActive) return;
  _cfgGeorefClickActive = false;
  _cfgGeorefClickTarget = null;
  if (window.map && _cfgGeorefClickHandler) window.map.off("click", _cfgGeorefClickHandler);
  _cfgGeorefClickHandler = null;
  const fl = document.getElementById("kta-cfg-georef-click-floater");
  if (fl) fl.remove();
}

// ───────── 🧭 POSITION INITIALE TRACKER — pickers assistés ─────────
// Parité UX stricte avec les pickers Géoréf ci-dessus, ciblant cfg_startX/Y :
//   - 🔍 Choisir via un point : autocomplete POI → remplit startX/Y
//   - 📍 Cliquer sur la carte : mode pick → clic plan → remplit startX/Y
// startX/Y sont des entiers (parseInt au save) → on arrondit à l'entier.
// Bindés par _bindCfgTrackerStartHandlers() après le rendu de la modale.
function _cfgOuvrirRechercheStart() {
  const res = document.getElementById("cfg_start_search_results");
  if (!res) return;
  res.style.display = "block";
  res.innerHTML =
    '<input type="text" id="cfg_start_search_q" class="kta-cfg-input" ' +
      'placeholder="Tape un nom / id / tag..." style="width:100%; margin-bottom:6px;">' +
    '<div id="cfg_start_search_list"></div>';
  const input = document.getElementById("cfg_start_search_q");
  const list  = document.getElementById("cfg_start_search_list");
  if (!input || !list) return;
  input.focus();
  let debTimer = null;
  input.addEventListener("input", function() {
    const q = input.value.trim();
    if (debTimer) clearTimeout(debTimer);
    if (!q || !window.SearchPoints || typeof window.SearchPoints.findByQuery !== "function") {
      list.innerHTML = "";
      return;
    }
    debTimer = setTimeout(async function() {
      let results = [];
      try { results = await window.SearchPoints.findByQuery(q) || []; } catch(e) {}
      if (input.value.trim() !== q) return;
      if (results.length === 0) {
        list.innerHTML = '<div class="kta-kmz-search-empty">Aucun résultat pour « ' + q + ' »</div>';
        return;
      }
      list.innerHTML = results.slice(0, 10).map(function(it, i) {
        const p = it.point;
        const nom = p.nom || p.id || "(point)";
        const metaParts = [];
        if (p.id && p.id !== nom) metaParts.push(p.id);
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) metaParts.push("x=" + p.x + ", y=" + p.y);
        const meta = metaParts.length > 0
          ? '<span class="kta-kmz-search-meta">(' + metaParts.join(" · ") + ')</span>'
          : '';
        return '<div class="kta-kmz-search-item" data-idx="' + i + '"><strong>' + nom + '</strong>' + meta + '</div>';
      }).join("");
      list.querySelectorAll(".kta-kmz-search-item").forEach(function(row, i) {
        row.addEventListener("click", function() {
          const p = results[i].point;
          const xEl = document.getElementById("cfg_startX");
          const yEl = document.getElementById("cfg_startY");
          if (xEl && Number.isFinite(p.x)) xEl.value = Math.round(p.x);
          if (yEl && Number.isFinite(p.y)) yEl.value = Math.round(p.y);
          res.style.display = "none";
        });
      });
    }, 150);
  });
}

let _cfgStartClickActive  = false;
let _cfgStartClickHandler = null;

function _cfgActiverModeClicStart() {
  if (!window.map) return;
  _cfgDesactiverModeClicStart();  // annule un mode précédent éventuel
  _cfgStartClickActive = true;
  _cfgStartClickHandler = function(e) {
    const x = e.latlng.lng;
    const y = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) ? (window.APP_CONFIG.imageHeight - e.latlng.lat) : e.latlng.lat;
    const xEl = document.getElementById("cfg_startX");
    const yEl = document.getElementById("cfg_startY");
    if (xEl) xEl.value = Math.round(x);
    if (yEl) yEl.value = Math.round(y);
    _cfgDesactiverModeClicStart();
    const cfgModal = document.getElementById("kta-cfg-modal");
    if (cfgModal) cfgModal.style.display = "";
  };
  window.map.on("click", _cfgStartClickHandler);
  const cfgModal = document.getElementById("kta-cfg-modal");
  if (cfgModal) cfgModal.style.display = "none";
  const fl = document.createElement("div");
  fl.id = "kta-cfg-start-click-floater";
  fl.className = "kta-iti-floater";
  fl.innerHTML =
    '<span class="kta-iti-floater-icon">🧭</span>' +
    '<span class="kta-iti-floater-msg">Clique sur la carte pour la position initiale du tracker</span>' +
    '<button class="kta-btn kta-btn-ghost" id="cfg_start_click_cancel" type="button">Annuler</button>';
  document.body.appendChild(fl);
  const cancelBtn = document.getElementById("cfg_start_click_cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function() {
      _cfgDesactiverModeClicStart();
      const m = document.getElementById("kta-cfg-modal");
      if (m) m.style.display = "";
    });
  }
}

function _cfgDesactiverModeClicStart() {
  if (!_cfgStartClickActive) return;
  _cfgStartClickActive = false;
  if (window.map && _cfgStartClickHandler) window.map.off("click", _cfgStartClickHandler);
  _cfgStartClickHandler = null;
  const fl = document.getElementById("kta-cfg-start-click-floater");
  if (fl) fl.remove();
}

// 🐛 v1.28.0 : annule TOUS les modes « cliquer sur la carte » en cours (géoréf,
// départ tracker, itinéraire, + tout floater pick résiduel) et retire la modale
// config si elle avait été masquée par un picker. Appelé par afficherLoader()
// (retour home) — sinon le floater et/ou la modale masquée restaient « ouverts »
// par-dessus l'accueil, avec un handler map.on("click") orphelin.
window._ktaAnnulerModesClicCarte = function() {
  try { _cfgDesactiverModeClicGeoref(); } catch(_) {}
  try { _cfgDesactiverModeClicStart(); } catch(_) {}
  try { if (typeof _desactiverModeClicCarte === "function") _desactiverModeClicCarte(); } catch(_) {}
  // Filet de sécurité : retire tout floater pick résiduel (évitement, KMZ…).
  try { document.querySelectorAll(".kta-iti-floater").forEach(function(f) { f.remove(); }); } catch(_) {}
  // La modale config a pu être masquée (display:none) par un picker → on la
  // retire pour ne pas la laisser fantôme au retour home.
  try { var m = document.getElementById("kta-cfg-modal"); if (m) m.remove(); } catch(_) {}
};

// Bind des 2 boutons de la section 🧭 Position initiale du tracker.
function _bindCfgTrackerStartHandlers() {
  const btnSearch = document.getElementById("cfg_start_search");
  const btnClick  = document.getElementById("cfg_start_click");
  if (btnSearch) btnSearch.addEventListener("click", _cfgOuvrirRechercheStart);
  if (btnClick)  btnClick.addEventListener("click",  _cfgActiverModeClicStart);
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

        ${(typeof window.renderBannerCoherenceEchelle === "function")
            ? window.renderBannerCoherenceEchelle(window._currentLoadedPlanId, { context: "settings" })
            : ""}

        <!-- 🆕 v1.21.0-fix3 (KARMA "met le mode présentation tout en haut") :
             Bouton "🎬 Activer le mode présentation" en TÊTE de la modale
             (mobile-friendly + accessible en 1 vue). Avant : enfoui dans la
             section 🔍 Affichage en bas. Plus pratique d'avoir cet accès
             rapide visible dès l'ouverture des Réglages. Pour SORTIR sur
             mobile : bouton flottant ✕ créé par presentationMode.js. -->
        <div class="kta-aide-section kta-cfg-presentation-section">
          <button class="kta-btn kta-btn-primary" type="button" id="cfg_presentation_btn"
                  style="width:100%; display:flex; align-items:center; justify-content:center; gap:10px; padding:12px 16px; font-size:14px;">
            <span style="font-size:20px;">🎬</span>
            <span><strong>Activer le mode présentation</strong></span>
          </button>
          <div style="font-size:11.5px; color:#8892a4; margin-top:8px; line-height:1.5; padding:0 4px; text-align:center;">
            Cache header + sidebars + footer pour libérer toute la surface pour la carte.
            Sortie : <kbd>F</kbd> ou <kbd>Échap</kbd> (PC), ou bouton flottant ✕ en haut-droite (mobile).
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Position initiale du tracker</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">Position X</label>
            <input class="kta-cfg-input" id="cfg_startX" type="number" value="${c.startX}">
            <label class="kta-cfg-label">Position Y</label>
            <input class="kta-cfg-input" id="cfg_startY" type="number" value="${c.startY}">
          </div>
          <!-- 🆕 Saisie assistée de la position de départ (parité UX géoréf) :
               🔍 via un point existant, 📍 au clic sur la carte. Évite la saisie
               manuelle des coordonnées (gros gain de temps). -->
          <div class="kta-kmz-pt-actions" style="margin-top:8px;">
            <button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_start_search" type="button">🔍 Choisir via un point</button>
            <button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_start_click" type="button">📍 Cliquer sur la carte</button>
          </div>
          <div id="cfg_start_search_results" class="kta-kmz-search-results" style="display:none;"></div>
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
          <div class="kta-aide-section-titre">🧭 Navigation intelligente</div>
          <label class="kta-perf-ultra-row" style="margin-top:0;">
            <input type="checkbox" id="cfg_smartNav" ${c.smartNav === true ? "checked" : ""}>
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">🧭 Caler la position sur les tracés</span>
              <span class="kta-perf-ultra-hint">
                Décoché par défaut. Quand le plan possède un <strong>réseau de tracés</strong>,
                la position estimée est <strong>recalée sur la galerie la plus proche</strong> pour
                compenser la dérive des capteurs (boussole / pas). Hors réseau, retour automatique
                au comportement actuel. Sans tracés sur le plan, l'option reste sans effet.
              </span>
            </span>
          </label>
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

          <!-- 🆕 v1.21.0-fix3 (KARMA) : bouton "🎬 Activer le mode présentation"
               DÉPLACÉ TOUT EN HAUT de la modale Réglages (avant la 1ère section)
               pour accès en 1 vue dès l'ouverture, mobile-friendly. -->

          <!-- 🆕 v1.21.1+ (KARMA) : toggle Wake Lock API — empêche l'écran de
               s'éteindre tant que l'app est ouverte. Utile cataphile pour ne
               pas avoir à débloquer son téléphone toutes les 30s en cavité.
               Compatibilité : Chrome 84+, Edge 84+, Safari iOS 16.4+ (PWA),
               PAS Firefox (Bug 1589554). Toggle masqué automatiquement si
               l'API n'est pas supportée. -->
          <label class="kta-perf-ultra-row" id="cfg_wake_lock_row" style="margin-top:8px; display:none;">
            <input type="checkbox" id="cfg_wake_lock">
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">🔆 Garder l'écran allumé (Wake Lock)</span>
              <span class="kta-perf-ultra-hint">
                Empêche la mise en veille de l'écran tant que l'app est ouverte.
                <strong>Idéal en cavité</strong> pour ne pas avoir à débloquer son téléphone
                toutes les 30s. Persistant entre sessions. Le wake lock est auto-relâché
                quand tu changes d'onglet/app, et ré-activé au retour si la case est cochée.
              </span>
            </span>
          </label>
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

        ${_renderCfgGeorefSection()}

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

  // 🆕 v1.26.1 — Bind bouton "📋 Copier" du banner cohérence échelle (si affiché)
  if (typeof window.attacherBoutonCopierEchelleGps === "function") {
    window.attacherBoutonCopierEchelleGps(modal);
  }

  // 🚀 PerfUltra : bind les change events sur les toggles de la section Perf Ultra
  _bindPerfUltraToggles();

  // 🌐 v1.14.19 (KARMA « rajoute la possibilité de faire le géo référencement
  // depuis les paramètres en mode map, auto remplis ensuite si je retourne
  // dans exporter ») : bind les handlers de la nouvelle section
  // 🌐 Géoréférencement GPS. Sauve via KmzExport.setCalibration(planId, c)
  // → pré-rempli automatiquement à l'ouverture de la modale 📡 Export externe
  // (sessionExporter > _renderCalibrageCommun lit KmzExport.getCalibration).
  _bindCfgGeorefHandlers();

  // 🧭 Position initiale du tracker : boutons 🔍 via un point / 📍 cliquer carte.
  _bindCfgTrackerStartHandlers();

  // 🎬 v1.21.0-fix2 (KARMA mobile-friendly) : bouton "Activer le mode
  // présentation" dans la section 🔍 Affichage. Sur mobile, la touche F
  // est inaccessible faute de clavier physique → ce bouton est le seul
  // chemin pour entrer dans le mode. Sortie : touche F/Échap (PC) ou
  // bouton flottant ✕ injecté par presentationMode.js > activate().
  const btnPresentation = document.getElementById("cfg_presentation_btn");
  if (btnPresentation) {
    btnPresentation.addEventListener("click", function() {
      // Ferme la modale Réglages AVANT d'activer le mode (sinon le mode
      // présentation laisse la modale ouverte par-dessus la carte).
      const cfgModal = document.getElementById("kta-cfg-modal");
      if (cfgModal) cfgModal.remove();
      // Active après un micro-délai pour laisser le DOM se nettoyer.
      setTimeout(function() {
        if (window.PresentationMode && typeof window.PresentationMode.activate === "function") {
          window.PresentationMode.activate();
        } else {
          alert("Module PresentationMode indisponible.");
        }
      }, 50);
    });
  }

  // 🆕 v1.21.1+ (KARMA Wake Lock) : toggle "Garder l'écran allumé".
  // Visible UNIQUEMENT si l'API navigator.wakeLock est supportée par le
  // browser (Chrome/Edge/Safari iOS 16.4+, PAS Firefox).
  // Sync UI ↔ state via window.WakeLock.isEnabled() + setEnabled().
  const wlRow = document.getElementById("cfg_wake_lock_row");
  const wlCb  = document.getElementById("cfg_wake_lock");
  if (wlRow && wlCb && window.WakeLock) {
    if (window.WakeLock.isSupported()) {
      wlRow.style.display = "";  // révèle (default = none pour rétrocompat)
      wlCb.checked = window.WakeLock.isEnabled();
      wlCb.addEventListener("change", function() {
        window.WakeLock.setEnabled(wlCb.checked);
        // Feedback toast (optionnel, discret)
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(
            wlCb.checked
              ? "🔆 Écran maintenu allumé tant que l'app est ouverte"
              : "🔅 Mise en veille écran ré-activée",
            "info"
          );
        }
      });
    } else {
      // API pas supportée → on garde le row caché (display:none par défaut
      // dans le HTML). Pas de message UI (ne pas frustrer l'user Firefox).
    }
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
  // 🐛 v1.28.0 : on mémorise la position initiale AVANT écrasement pour ne
  // réinitialiser la position du tracker QUE si startX/startY a réellement
  // changé (cf plus bas). Sinon un simple toggle (smartNav…) ou un changement
  // d'échelle replaçait le tracker au départ → perte de la position courante.
  const _oldStartX = APP_CONFIG.startX;
  const _oldStartY = APP_CONFIG.startY;

  APP_CONFIG.scale         = parseFloat(document.getElementById("cfg_scale").value);
  APP_CONFIG.stepLength    = parseFloat(document.getElementById("cfg_stepLength").value);
  // 🐛 v1.28.0 (#3) : ne pas écraser startX/startY avec NaN si le champ est
  // vidé (sinon le reset conditionnel placerait le tracker à NaN). On conserve
  // l'ancienne valeur si la saisie est invalide.
  const _sx = parseInt(document.getElementById("cfg_startX").value, 10);
  const _sy = parseInt(document.getElementById("cfg_startY").value, 10);
  if (Number.isFinite(_sx)) APP_CONFIG.startX = _sx;
  if (Number.isFinite(_sy)) APP_CONFIG.startY = _sy;
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

  // 🧭 Nav Intelligente C2 : toggle smartNav (pref globale, défaut OFF). Lu à
  // chaud par tracking.js > avancer() — pas de reload requis.
  const cbSmartNav = document.getElementById("cfg_smartNav");
  if (cbSmartNav) APP_CONFIG.smartNav = !!cbSmartNav.checked;

  // 🆕 v1.9.2 : le handler de showRoadIntersections en mode carte a été retiré
  // (toggle exclusivement dans le ⚙️ Configuration du loader/home désormais).
  // La valeur reste lue depuis APP_CONFIG par road.js > renderRoads()
  // peu importe d'où elle a été modifiée.

  if (window.sauvegarderPrefsUtilisateur) sauvegarderPrefsUtilisateur();
  // 🐛 v1.28.0 : ne replacer le tracker au départ QUE si la position initiale
  // (startX/startY) a explicitement changé. Pour tout autre réglage (toggle
  // smartNav, échelle, seuil de pas…), on PRÉSERVE la position courante + le
  // tracé. (Avant : reset systématique → le tracker sautait à l'origine.)
  const _startChanged = (APP_CONFIG.startX !== _oldStartX) || (APP_CONFIG.startY !== _oldStartY);
  if (window.resetTrackingPosition && _startChanged) window.resetTrackingPosition();
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
// 🆕 hotfix21 — Helper : demande au SW courant son CACHE_NAME via MessageChannel.
// Utilisé par mettreAJourCodeSeul() pour ne PAS supprimer le cache qu'on
// vient juste de remplir au cours de reg.update() — évite un double-download.
// Retourne null si pas de SW actif ou timeout (2s). Pattern :
//   1. Client crée MessageChannel
//   2. Client envoie port2 au SW via postMessage avec [transferList]
//   3. SW répond via event.ports[0] (qui est port2 côté SW)
//   4. Client écoute port1 (linké à port2)
function _getCacheNameFromSW() {
  return new Promise(function(resolve) {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      return resolve(null);
    }
    const channel = new MessageChannel();
    const timeout = setTimeout(function() {
      console.warn("[Soft update] _getCacheNameFromSW timeout");
      resolve(null);
    }, 2000);
    channel.port1.onmessage = function(event) {
      clearTimeout(timeout);
      const data = event.data || {};
      resolve(data.name || null);
    };
    try {
      navigator.serviceWorker.controller.postMessage(
        { type: "GET_CACHE_NAME" },
        [channel.port2]
      );
    } catch(e) {
      clearTimeout(timeout);
      console.warn("[Soft update] postMessage GET_CACHE_NAME :", e);
      resolve(null);
    }
  });
}

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

    // 🆕 hotfix21 — Récupère le CACHE_NAME courant via le SW. Permet ensuite
    // de NE PAS le supprimer à l'étape 3 (évite double-download au reload).
    // Si SW pas joignable ou timeout : currentCacheName reste null, on
    // fallback sur l'ancien comportement (purge totale).
    const currentCacheName = await _getCacheNameFromSW();
    if (currentCacheName) {
      console.log("[Soft update] CACHE_NAME courant :", currentCacheName);
    }

    // 2. 🆕 hotfix21 — SW update FIRE-AND-FORGET (au lieu de await). Avant,
    // `await reg.update()` bloquait 30s-2min en téléchargeant ~100 assets
    // via l'install event SYNCHRONE (cache.add x 100 avec cache:'reload').
    // Maintenant : on lance update() en background, le téléchargement se
    // fait pendant que l'user voit "Préparation…" + "Rechargement…", et
    // au reload le nouveau SW est déjà prêt avec son cache populé.
    _statusUpdate("Préparation du Service Worker…");
    if (navigator.serviceWorker) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          // Fire-and-forget : pas de await, le téléchargement des assets se
          // fait en background. Si reg.update() trouve un nouveau sw.js, il
          // déclenche INSTALL en arrière-plan (cache.add x 100). On laisse
          // tourner, on n'attend pas.
          reg.update().catch(function(e) {
            console.warn("[Soft update] reg.update() :", e);
          });
          if (reg.waiting) {
            // Le SW en attente est déjà prêt → on le pousse à prendre le relais.
            // Notre sw.js fait déjà self.skipWaiting() au install, mais on
            // renforce ici via postMessage explicit (cf. handler hotfix21).
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        }
      } catch(e) {
        console.warn("[Soft update] erreur SW :", e);
      }
    }

    // 3. 🆕 hotfix21 — Purge des SEULS anciens caches HTTP/PWA (préserve le
    // cache courant si on a réussi à le récupérer du SW). Avant : on
    // purgait TOUT y compris le cache qu'on venait de remplir via update()
    // → re-download de ~100 assets au reload. Maintenant : on garde le
    // cache courant intact, donc le reload retrouve son cache pré-rempli.
    _statusUpdate("Nettoyage des anciens caches…");
    if (window.caches) {
      try {
        const keys = await caches.keys();
        const toDelete = currentCacheName
          ? keys.filter(function(k) { return k !== currentCacheName; })
          : keys; // Fallback : si pas de currentCacheName, on purge tout (ancien comportement)
        await Promise.all(toDelete.map(function(k) {
          console.log("[Soft update] suppression cache :", k);
          return caches.delete(k);
        }));
        console.log("[Soft update] " + toDelete.length + "/" + keys.length + " cache(s) supprimé(s) (préservé : " + (currentCacheName || "aucun") + ")");
      } catch(e) {
        console.warn("[Soft update] purge caches :", e);
      }
    }

    // 4. Reload : le SW (potentiellement nouveau, son install tourne en bg)
    // prend le relais avec son cache pré-rempli — pas de re-download
    // séquentiel des 100 assets au reload.
    _statusUpdate("Rechargement…");
    setTimeout(function() {
      window.location.reload();
    }, 200); // 200ms (au lieu de 400) — postMessage SKIP_WAITING est arrivé

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

  // 🆕 v1.21.5 (KARMA "refonte filtre Leaflet") : sync M-LVL bidirectionnel.
  // Quand visibleLevels change (via modale Niveaux), notifie FilterPanel pour
  // qu'il rafraîchisse la section M-LVL si la modale est ouverte.
  if (window.FilterPanel && typeof window.FilterPanel.onLevelChange === "function") {
    try { window.FilterPanel.onLevelChange(); } catch(e) {}
  }
};

// 🆕 v1.21.5 (KARMA "refonte filtre Leaflet") : helper global qui cascade
// le re-render après changement des filtres runtime (tags, types, etc.).
// Alias de appliquerFiltreNiveau car les modules level-aware appliquent
// aussi window._ktaRuntimeFilters dans la même passe de rendu.
window.appliquerFiltreRuntime = function() {
  if (typeof window.appliquerFiltreNiveau === "function") {
    window.appliquerFiltreNiveau();
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
    _initLevelFilterControl();

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
      // 🆕 v1.30.2 P3 Lot 4 : afficherAide / afficherReadme extraites vers
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
      // 🆕 v1.30.2 P3 Lot 5 : ouvrirImportSession extraite vers
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
        _ouvrirCreationJonction(btn);
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
  blesse:  { kmh: 2, label: "Blessé",  icon: "🤕", hint: "Progression entravée, très lent, terrain accidenté" },
  lente:   { kmh: 3, label: "Lente",   icon: "🐌", hint: "Prudent, étroitures, exploration" },
  normale: { kmh: 5, label: "Normale", icon: "🚶", hint: "Allure standard (défaut)" },
  rapide:  { kmh: 7, label: "Rapide",  icon: "🏃", hint: "Allure soutenue, parcours connu" }
};
const DEFAULT_ITI_SPEED       = "normale";
const ITI_SPEED_STORAGE_KEY   = "myktamap_iti_walking_preset";

// 🆕 v1.23.0 (KARMA "rajoute dans le modal itineraire un temps de pause
// définissable entre chaque point en minutes") : la pause par arrêt
// intermédiaire est désormais CONFIGURABLE :
//   • Checkbox "Inclure pause entre arrêts" (default ON = comportement v1.22.x)
//   • Input minutes par pause (default 15 min)
// Persistance : localStorage. Le Mode Secours (secoursMode.js > _recalculer-
// ItineraireGroupe) lit les mêmes prefs pour cohérence cross-feature.
const TEMPS_PAUSE_PAR_POINT_MIN_DEFAULT = 15;
const ITI_PAUSE_ENABLED_STORAGE_KEY     = "myktamap_iti_pause_enabled";
const ITI_PAUSE_MINUTES_STORAGE_KEY     = "myktamap_iti_pause_minutes";

function _getItiPauseEnabled() {
  try {
    const v = localStorage.getItem(ITI_PAUSE_ENABLED_STORAGE_KEY);
    if (v === null || v === undefined) return true;   // default ON
    return v === "1" || v === "true";
  } catch(e) { return true; }
}
function _setItiPauseEnabled(enabled) {
  try { localStorage.setItem(ITI_PAUSE_ENABLED_STORAGE_KEY, enabled ? "1" : "0"); } catch(e) {}
}
function _getItiPauseMinutes() {
  try {
    const v = parseFloat(localStorage.getItem(ITI_PAUSE_MINUTES_STORAGE_KEY));
    if (!isFinite(v) || v < 0) return TEMPS_PAUSE_PAR_POINT_MIN_DEFAULT;
    return Math.min(120, v);   // cap dur 2h (anti-doigt qui glisse sur l'input)
  } catch(e) { return TEMPS_PAUSE_PAR_POINT_MIN_DEFAULT; }
}
function _setItiPauseMinutes(min) {
  const v = Math.max(0, Math.min(120, parseFloat(min) || 0));
  try { localStorage.setItem(ITI_PAUSE_MINUTES_STORAGE_KEY, String(v)); } catch(e) {}
}
// Exposé globalement pour que js/secoursMode.js réutilise les mêmes prefs
// (cohérence cross-feature : si l'user change la pause dans itinéraire, ça
// s'applique aussi au calcul des durées Mode Secours).
window.getItiPauseEnabled = _getItiPauseEnabled;
window.getItiPauseMinutes = _getItiPauseMinutes;
// 🆕 v1.23.6 — Setters exposés pour permettre à Mode Secours (et autres
// modules futurs) de modifier la pause depuis leur propre UI. Persistance
// localStorage immédiate via _setItiPauseEnabled/_setItiPauseMinutes.
// Pas de side-effect global au set (pas de re-render auto) — le caller
// est responsable de recalculer ce qui dépend de la pause (durées
// estimées d'itinéraire, durées d'équipes Mode Secours, etc.).
window.setItiPauseEnabled = _setItiPauseEnabled;
window.setItiPauseMinutes = _setItiPauseMinutes;

function _getItiSpeedPreset() {
  try {
    let stored = localStorage.getItem(ITI_SPEED_STORAGE_KEY);
    // 🆕 v1.26.3 — Micro-migration : ancien preset "bourre" renommé "blesse"
    // (professionnalisation). Réécrit la valeur pour garder le réglage user.
    if (stored === "bourre") {
      stored = "blesse";
      try { localStorage.setItem(ITI_SPEED_STORAGE_KEY, stored); } catch(e) {}
    }
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
// 🆕 v1.23.0 : pause configurable via _getItiPauseEnabled + _getItiPauseMinutes
function _tempsItineraireMinutes(distanceM, nbWaypoints) {
  if (typeof distanceM !== "number" || distanceM <= 0) return 0;
  const tempsMarcheMin = distanceM / (_vitesseMarcheKmh() * 1000 / 60);  // m / (m/min)
  const nbPausesInter  = Math.max(0, (nbWaypoints || 0) - 2);
  const pauseEnabled   = _getItiPauseEnabled();
  const pauseMin       = pauseEnabled ? _getItiPauseMinutes() : 0;
  const tempsPauseMin  = nbPausesInter * pauseMin;
  return tempsMarcheMin + tempsPauseMin;
}
// Exposé globalement pour cohérence cross-feature (Mode Secours utilise le même)
window.getItiTempsMinutes = _tempsItineraireMinutes;

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
    // 🆕 v1.23.0 : pause configurable → lit la valeur dynamique
    const pauseActive = _getItiPauseEnabled();
    const pauseMin    = _getItiPauseMinutes();
    el.title =
      "Distance : " + distFmt + "\n" +
      "Temps estimé : " + tempsFmt +
      " (vitesse " + preset.label + " — " + preset.kmh + " km/h" +
      (nbPausesInter > 0 && pauseActive && pauseMin > 0
        ? " + " + nbPausesInter + " pause" + (nbPausesInter > 1 ? "s" : "") +
          " de " + pauseMin + " min"
        : "") +
      ")\nCliquer pour ouvrir le menu Itinéraire (vitesse, pause).";
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

  // 🆕 v1.23.0 (KARMA "rajoute un temps de pause définissable entre chaque
  // point en minutes... avec un par default auto cocher [système actuel]") :
  // section dédiée Pause configurable. Default = case cochée + 15 min (=
  // comportement v1.22.x strictement préservé).
  const pauseEnabled   = _getItiPauseEnabled();
  const pauseMin       = _getItiPauseMinutes();
  const sectionPause =
    '<div class="kta-iti-section">' +
      '<div class="kta-iti-section-titre">🛑 Pause entre les arrêts</div>' +
      '<label class="kta-iti-pause-row">' +
        '<input type="checkbox" id="kta-iti-pause-cb"' + (pauseEnabled ? " checked" : "") + '>' +
        '<span>Inclure une pause entre chaque arrêt intermédiaire</span>' +
      '</label>' +
      '<div class="kta-iti-pause-row" id="kta-iti-pause-min-wrap" ' +
           'style="' + (pauseEnabled ? "" : "opacity:0.5; pointer-events:none;") + '">' +
        '<label for="kta-iti-pause-min" style="flex-shrink:0;">Durée par pause :</label>' +
        '<input type="number" id="kta-iti-pause-min" min="0" max="120" step="1" ' +
               'value="' + pauseMin + '" style="width:70px;"> min' +
      '</div>' +
      '<p class="kta-iti-speed-hint">Augmente la précision de l\'estimation : ' +
        'chaque arrêt intermédiaire (entre départ et arrivée) ajoute cette pause. ' +
        '2 waypoints = 0 pause, N waypoints = N-2 pauses. ' +
        'S\'applique aussi au Mode Secours 🚨.</p>' +
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
        sectionPause +
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
        _refreshItiTempsInPlace();
      });
    });
  })();

  // 🆕 v1.23.0 — Bind handlers section Pause (checkbox + input minutes)
  (function bindPauseSection() {
    const cb     = document.getElementById("kta-iti-pause-cb");
    const inp    = document.getElementById("kta-iti-pause-min");
    const wrapM  = document.getElementById("kta-iti-pause-min-wrap");
    if (cb) {
      cb.addEventListener("change", function() {
        _setItiPauseEnabled(cb.checked);
        if (wrapM) {
          wrapM.style.opacity = cb.checked ? "" : "0.5";
          wrapM.style.pointerEvents = cb.checked ? "" : "none";
        }
        _refreshItiTempsInPlace();
        if (typeof window._majLabelDistanceItineraire === "function") {
          window._majLabelDistanceItineraire();
        }
      });
    }
    if (inp) {
      // Change ET input (live feedback pendant la saisie au clavier)
      const _onInput = function() {
        const v = parseFloat(inp.value);
        if (isFinite(v) && v >= 0) {
          _setItiPauseMinutes(v);
          _refreshItiTempsInPlace();
          if (typeof window._majLabelDistanceItineraire === "function") {
            window._majLabelDistanceItineraire();
          }
        }
      };
      inp.addEventListener("input", _onInput);
      inp.addEventListener("change", _onInput);
    }
  })();

  // Helper local : refresh le bloc statusActuel (mode navigation) — partagé
  // entre vitesse + pause handlers pour cohérence.
  function _refreshItiTempsInPlace() {
    const statusBlk = document.getElementById("kta-iti-status-block");
    if (!statusBlk) return;
    const distM = parseFloat(statusBlk.dataset.distm) || 0;
    const nbWp  = parseInt(statusBlk.dataset.nbwp, 10) || 2;
    const tMin  = _tempsItineraireMinutes(distM, nbWp);
    const p     = ITI_SPEED_PRESETS[_getItiSpeedPreset()];
    const tEl   = document.getElementById("kta-iti-temps-val");
    const hEl   = document.getElementById("kta-iti-temps-speed-hint");
    if (tEl) tEl.textContent = _formatTempsMinutes(tMin);
    if (hEl) hEl.textContent = "(" + p.icon + " " + p.label + ")";
  }

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
// 📏 DISTANCE TOTALE DES TRACÉS — DÉPLACÉ (v1.30.2 P3 Lot 2)
// =========================
// Les 4 fonctions globales `window.ouvrirRoadsDistanceFloater`,
// `window._rdEffacerHighlight`, `window.getDistanceTotaleStatus`,
// `window._rdOnRoadsChanged` + les helpers privés + variables module-level
// ont été extraits vers `js/interfaceDistanceTotale.js` pour réduire le
// volume du fichier principal (cf. P3 Lot 2, découpe interface.js).
// Comportement runtime strictement identique à v1.30.1.

// =========================
// 🗺️ LÉGENDE — DÉPLACÉ (v1.30.2 P3 Lot 3)
// =========================
// `window.afficherLegende` + LEGENDE_LABELS + helpers de génération HTML
// (4 sections : Icônes / Tracés / Zones / Structures) ont été extraits
// vers `js/interfaceLegende.js` pour réduire le volume du fichier principal
// (cf. P3 Lot 3, découpe interface.js). Comportement runtime strictement
// identique à v1.30.1.


// =========================
// EXPORT GLOBAL
// =========================
window.afficherConfig         = afficherConfig;
window.appliquerConfig        = appliquerConfig;
window.resetConfig            = resetConfig;
window.ouvrirCalibrageEchelle = ouvrirCalibrageEchelle;
window.viderCacheAppli       = viderCacheAppli;
window.mettreAJourCodeSeul   = mettreAJourCodeSeul;
// window.afficherReadme exposée dans js/interfaceDocs.js (v1.30.2 P3 Lot 4)
// window.afficherAide        exposée dans js/interfaceDocs.js (v1.30.2 P3 Lot 4)
// window.afficherModaleAideIA exposée dans js/interfaceDocs.js (v1.30.2 P3 Lot 4)
// window.afficherLegende     exposée dans js/interfaceLegende.js (v1.30.2 P3 Lot 3)
// window.afficherConvertisseur retiré le 08/05/2026 — la conversion est maintenant
// dans le modal "💾 Enregistrer la session" → onglet "🔄 Conversion" (sessionExporter.js)
window.initInterface         = initInterface;
