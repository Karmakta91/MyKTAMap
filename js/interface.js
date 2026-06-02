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
// 🔧 MAINTENANCE — DÉPLACÉ (v1.30.2 P3 Lot 7)
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
// 🗺️ ITINÉRAIRE + ÉVITEMENTS — DÉPLACÉ (v1.30.2 P3 Lot 6)
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
// window.ouvrirCalibrageEchelle exposée dans js/interfaceMaintenance.js (v1.30.2 P3 Lot 7)
// window.viderCacheAppli       exposée dans js/interfaceMaintenance.js (v1.30.2 P3 Lot 7)
// window.mettreAJourCodeSeul   exposée dans js/interfaceMaintenance.js (v1.30.2 P3 Lot 7)
// window.afficherReadme exposée dans js/interfaceDocs.js (v1.30.2 P3 Lot 4)
// window.afficherAide        exposée dans js/interfaceDocs.js (v1.30.2 P3 Lot 4)
// window.afficherModaleAideIA exposée dans js/interfaceDocs.js (v1.30.2 P3 Lot 4)
// window.afficherLegende     exposée dans js/interfaceLegende.js (v1.30.2 P3 Lot 3)
// window.afficherConvertisseur retiré le 08/05/2026 — la conversion est maintenant
// dans le modal "💾 Enregistrer la session" → onglet "🔄 Conversion" (sessionExporter.js)
window.initInterface         = initInterface;
