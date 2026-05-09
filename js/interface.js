/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.is-underground.fr — Licence CC BY-NC-SA 4.0
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
  const editorPts = (window.getEditorPoints  && window.getEditorPoints())  || [];
  const roads     = (window.getRoads         && window.getRoads())         || [];
  const zones     = (window.getZones         && window.getZones())         || [];
  const measure   = (window.getMeasurePoints && window.getMeasurePoints()) || [];
  const trackPath = (window.getTrackingPath  && window.getTrackingPath())  || [];
  return editorPts.length > 0 || roads.length > 0 || zones.length > 0
      || measure.length > 0   || trackPath.length > 1;
}

function _resumeSession() {
  // Liste détaillée des modifs en cours pour l'avertissement
  const items = [];
  const editorPts = (window.getEditorPoints  && window.getEditorPoints())  || [];
  const roads     = (window.getRoads         && window.getRoads())         || [];
  const zones     = (window.getZones         && window.getZones())         || [];
  const measure   = (window.getMeasurePoints && window.getMeasurePoints()) || [];
  const trackPath = (window.getTrackingPath  && window.getTrackingPath())  || [];

  if (editorPts.length > 0) items.push(editorPts.length + " point" + (editorPts.length > 1 ? "s" : "") + " ajouté" + (editorPts.length > 1 ? "s" : ""));
  if (roads.length     > 0) items.push(roads.length     + " tracé"  + (roads.length     > 1 ? "s" : ""));
  if (zones.length     > 0) items.push(zones.length     + " zone"   + (zones.length     > 1 ? "s" : ""));
  if (measure.length   > 0) items.push("une mesure de distance");
  if (trackPath.length > 1) items.push("le parcours du tracker");
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
  const currentId = window.PlanRegistry.getLastOpened()?.id;

  // 3 plans récents EXCLUANT le plan en cours
  const recents = all
    .filter(function(p) { return p.id !== currentId && p.lastOpened; })
    .sort(function(a, b) { return (b.lastOpened || "").localeCompare(a.lastOpened || ""); })
    .slice(0, 3);

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

  // Fermeture au clic ailleurs / Escape
  setTimeout(function() {
    document.addEventListener("click", _onClicAilleursPanneau, true);
    document.addEventListener("keydown", _onEscapePanneau, true);
  }, 0);
}

function _fermerPlanSwitcher() {
  const panneau = document.getElementById("kta-plan-switcher");
  if (panneau) panneau.remove();
  const titre = document.getElementById("kta-titre-fixe");
  if (titre) titre.classList.remove("ouvert");
  document.removeEventListener("click", _onClicAilleursPanneau, true);
  document.removeEventListener("keydown", _onEscapePanneau, true);
}

function _onClicAilleursPanneau(e) {
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
    zones:        window.getZones        ? window.getZones()        : []
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
          Charge un fichier <code>devmap-session.json</code> exporté depuis l'application.
          Il contient tes points ajoutés, tes tracés et ta mesure en cours.
        </p>

        <div class="kta-conv-champ">
          <label class="kta-conv-label">Fichier session</label>
          <div class="kta-conv-drop" id="kta-import-drop">
            <span id="kta-import-drop-label">📂 Cliquer ou glisser un fichier .json</span>
            <input type="file" id="kta-import-file" accept=".json,application/json" style="display:none">
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

  function chargerFichier(file) {
    fichierCharge = file;
    dropLabel.textContent = "✅ " + file.name;
    setErr("");

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (data.type !== "devmap-session") {
          setErr("❌ Fichier invalide — il doit s'agir d'une session devmap-session");
          dataParsee = null;
          apercuWrap.style.display = "none";
          warnEl.style.display = "none";
          btnValider.disabled = true;
          return;
        }

        dataParsee = data;
        const nbPoints  = (data.editorPoints || []).length;
        const nbMesure  = (data.measure && data.measure.points) ? data.measure.points.length : 0;
        const nbTraces  = (data.roads || []).length;
        const nbZones   = (data.zones || []).length;

        apercuEl.innerHTML = `
          <div style="display:flex; gap:14px; flex-wrap:wrap;">
            <span><strong style="color:#8cb4ff;">${nbPoints}</strong> point(s) ajouté(s)</span>
            <span><strong style="color:#8cb4ff;">${nbTraces}</strong> tracé(s)</span>
            <span><strong style="color:#8cb4ff;">${nbZones}</strong> zone(s)</span>
            <span><strong style="color:#8cb4ff;">${nbMesure}</strong> point(s) de mesure</span>
          </div>
        `;
        apercuWrap.style.display = "block";
        warnEl.style.display = "block";
        btnValider.disabled = false;

      } catch(err) {
        setErr("❌ JSON invalide : " + err.message);
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
    if (f && f.name.toLowerCase().endsWith(".json")) chargerFichier(f);
    else setErr("Le fichier doit être un .json");
  });

  // Boutons
  btnClose.addEventListener("click", fermer);
  btnAnnuler.addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  btnValider.addEventListener("click", function() {
    if (!dataParsee) return;

    try {
      if (window.setEditorPoints)    window.setEditorPoints(dataParsee.editorPoints || []);
      if (window.renderEditorPoints) window.renderEditorPoints();
      if (window.resetMesure)        window.resetMesure();
      if (window.setMeasurePoints) {
        window.setMeasurePoints(dataParsee.measure && dataParsee.measure.points ? dataParsee.measure.points : []);
      }
      if (window.resetRoads)         window.resetRoads();
      if (window.setRoads)           window.setRoads(dataParsee.roads || []);
      if (window.resetZones)         window.resetZones();
      if (window.setZones)           window.setZones(dataParsee.zones || []);

      fermer();
    } catch(err) {
      console.error(err);
      setErr("Erreur lors de l'import : " + (err.message || err));
    }
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
  _chargerReadme("README_USER.md");
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
        <span>— 🍃 Cartographie propulsée par Leaflet</span>
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
    <div class="kta-readme-modal-boite" style="max-width:580px;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">❓ Aide — Référence des boutons</span>
        <button class="kta-panneau-close" id="kta-aide-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <p style="color:#8892a4; font-size:13px; margin:0 0 14px; line-height:1.5;">
          La barre latérale droite est organisée en groupes déroulables.
          Un seul groupe peut être ouvert à la fois — cliquer sur un autre referme le précédent.
        </p>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📚 Aide / Doc / Légende</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">❓</span><span>Cette aide — référence des boutons</span>
            <span class="kta-aide-icone">📖</span><span>Documentation utilisateur</span>
            <span class="kta-aide-icone">🗺️</span><span>Légende des icônes du plan</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⚙️ Paramètres</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⚙️</span><span>Réglages, calibrage de l'échelle, debug (clic direct)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Contient le bouton 🎯 pour calibrer l'échelle, 🐛 pour les logs et 🗑️ pour réinitialiser le cache.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🔍 Rechercher un point</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🔍</span><span>Trouver un point par nom, id, tag ou description (clic direct)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Cherche dans tous les calques de données et tes points ajoutés. Au clic sur un résultat,
            la carte se centre sur le point avec un flash visuel et le popup s'ouvre.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬇️ Charger / Import</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📥</span><span>Importer une session sauvegardée</span>
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
          <div class="kta-aide-section-titre">⬆️ Enregistrer</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">💾</span><span>Enregistrer la session — modale avec 3 modes : Full / Avancé / Conversion</span>
            <span class="kta-aide-icone">🖼️</span><span>Exporter le plan en image — modale avec mode Rapide / Avancé</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Tracker</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">▶️⏹️</span><span>Démarrer / arrêter le tracking par capteurs (expérimental)</span>
            <span class="kta-aide-icone">📍</span><span>Mode recalage : clic sur la carte pour repositionner le marker</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📐 Outils de mesure</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📐</span><span>Mesure de distance simple — clic pour poser des points, total affiché en bas-gauche</span>
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
            Le tracé apparaît en cyan néon avec un label de distance en bas-gauche. Au re-clic, la modale s'ouvre en
            <strong>mode navigation</strong> : boutons <strong>⏮️ Début</strong>, <strong>⏭️ Fin</strong>,
            <strong>🔁 Tour complet</strong>, et 🎯 par waypoint pour centrer la carte dessus.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">✏️ Édition de points</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">✏️</span><span>Activer le mode ajout de point</span>
            <span class="kta-aide-icone">🗑️</span><span>Effacer (dernier point ou tous les points)</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🛣️ Tracés & Routes</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🟩</span><span>Tracer une route principale</span>
            <span class="kta-aide-icone">🟪</span><span>Tracer une route secondaire</span>
            <span class="kta-aide-icone">🟨</span><span>Tracer un chemin</span>
            <span class="kta-aide-icone">📏</span><span>Distance totale des tracés (panneau flottant avec filtres par type)</span>
            <span class="kta-aide-icone">🧹</span><span>Effacer (dernier point, dernier tracé ou tous)</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬛ Zones (remblais / effondrements / eau)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⬛</span><span>Tracer une zone de remblais (gris)</span>
            <span class="kta-aide-icone">🟥</span><span>Tracer une zone d'effondrement (rouge)</span>
            <span class="kta-aide-icone">🟦</span><span>Tracer une zone d'eau (bleu)</span>
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
    <div class="kta-readme-modal-boite" style="max-width:440px; height:auto; max-height:90vh;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">⚙️ Réglages</span>
        <button class="kta-panneau-close" id="kta-cfg-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

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

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.08);">
          <button class="kta-btn kta-btn-ghost"   onclick="resetConfig()">Reset</button>
          <button class="kta-btn kta-btn-primary"  onclick="appliquerConfig()">Appliquer</button>
          <button class="kta-btn kta-btn-danger"   onclick="viderCacheAppli()">🗑️ Réinitialiser</button>
          <button class="kta-btn kta-btn-ghost"    onclick="afficherLogsDebug()">🐛 Logs</button>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);
  document.getElementById("kta-cfg-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
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
// Vérification connexion Internet : timeout 5s, retourne Promise<boolean>.
// Combine navigator.onLine (rapide) + fetch no-cors sur un endpoint léger
// (Google generate_204 = endpoint historique pour ce check, retourne juste
// un HTTP 204 No Content). En mode no-cors la promesse résout dès qu'un
// network round-trip a lieu — donc fail = vrai offline. AbortSignal pour
// gérer le timeout proprement.
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
    fetch("https://www.gstatic.com/generate_204", {
      method: "GET",
      mode:   "no-cors",
      cache:  "no-store",
      signal: ctrl.signal
    }).then(function() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(true);
    }).catch(function() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(false);
    });
  });
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

// Affiche d'abord le warning insistant "PAS DE CONNEXION INTERNET" en rouge
// (style cohérent avec la modale OOM), puis bascule sur le flow de double
// confirmation classique si l'utilisateur veut quand même continuer.
function _resetFlowOfflineWarning() {
  const overlay = document.createElement("div");
  overlay.id = "kta-reset-offline";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-oom-modal-boite">' +
      '<div class="kta-readme-modal-header kta-oom-header">' +
        '<span class="kta-oom-titre-big">' +
          '<span class="kta-oom-warn-side">⚠️</span>' +
          '<span class="kta-oom-titre-text">PAS DE CONNEXION INTERNET</span>' +
          '<span class="kta-oom-warn-side">⚠️</span>' +
        '</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-oom-corps">' +
        '<div class="kta-oom-intro">' +
          'Tu es sur le point de <strong>tout réinitialiser</strong> alors que tu es <strong>hors ligne</strong>. ' +
          'L\'application a besoin d\'Internet pour redescendre ses fichiers (HTML, JS, CSS, icônes) après le wipe.' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">⛔ Conséquence si tu continues maintenant</div>' +
          '<ul class="kta-oom-list">' +
            '<li><strong>L\'app sera inutilisable</strong> tant que tu n\'auras pas une connexion Internet.</li>' +
            '<li>Le splash et le loader ne s\'afficheront même pas — le navigateur cherchera les fichiers, ne les trouvera plus en cache, et restera bloqué.</li>' +
            '<li>Tous tes plans mémorisés, ta session en cours et tes préférences seront <strong>perdus définitivement</strong>.</li>' +
          '</ul>' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">✅ Recommandation</div>' +
          '<p>' +
            '<strong>Reconnecte-toi à Internet</strong> (Wi-Fi, 4G/5G) puis relance la réinitialisation. ' +
            'L\'app aura ainsi une chance de se recharger correctement après le wipe.' +
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
          <li>Session en cours (points / tracés / zones / mesures)</li>
          <li>Préférences (mode performance, logs détaillés…)</li>
        </ul>
        <strong>Si vous utilisez l'app hors connexion, elle sera inutilisable jusqu'à la prochaine synchronisation.</strong>
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

function _ouvrirGroupe(id) {
  // Fermer tous les autres groupes (sauf ceux qui ont un mode actif)
  Object.keys(_groupes).forEach(function(autreId) {
    if (autreId === id) return;
    if (_groupes[autreId].modeActif) return; // ne pas fermer si mode actif
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
    // Si on referme un groupe avec mode actif, on ne ferme pas
    if (_groupes[id]?.modeActif) return;
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
    _ouvrirGroupe(id);
  } else {
    if (g.btnPrincipal && g.btnPrincipal.dataset.iconeOriginale) {
      g.btnPrincipal.innerHTML = g.btnPrincipal.dataset.iconeOriginale;
    }
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
  const ctrl = L.control({ position: "topright" });
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
        const btnSub = L.DomUtil.create("a", "kta-sub kta-hidden", div);
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
      modeActif:    false
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
  _creerGroupeAccordeon({
    id: "aide",
    iconePrincipale: "📚",
    titre: "Aide / Documentation / Légende",
    sousActions: [
      { icone: "❓", titre: "Aide",          onClick: afficherAide },
      { icone: "📖", titre: "Documentation", onClick: afficherReadme },
      { icone: "🗺️", titre: "Légende",       onClick: afficherLegende }
    ]
  });

  // 2. PARAMÈTRES (solo)
  _creerGroupeAccordeon({
    id: "settings",
    iconePrincipale: "⚙️",
    titre: "Paramètres",
    soloAction: afficherConfig
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
  _creerGroupeAccordeon({
    id: "charger",
    iconePrincipale: "⬇️",
    titre: "Charger / Import",
    sousActions: [
      { icone: "📥", titre: "Importer une session", onClick: ouvrirImportSession },
      { icone: "📊", titre: "Éditer un fichier JSON", onClick: function() {
          if (window.ouvrirTableEditor) window.ouvrirTableEditor();
          else alert("Module éditeur de tableau indisponible");
        } },
      { icone: "🗂️", titre: "Changer de plan",     onClick: afficherPopupChangerPlan }
    ]
  });

  // 4. CRÉER / MODIFIER PLAN (solo)
  _creerGroupeAccordeon({
    id: "planner",
    iconePrincipale: "🏗️",
    titre: "Créer ou modifier un plan",
    soloAction: function() {
      if (typeof afficherPlanner === "function") afficherPlanner();
    }
  });

  // 5. ENREGISTRER
  _creerGroupeAccordeon({
    id: "save",
    iconePrincipale: "⬆️",
    titre: "Enregistrer",
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
        } }
    ]
  });

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
          if (!isTracking) {
            requestPermission(); startTracking();
            btnSub.innerHTML = "⏹️";
            _setGroupeModeActif("tracker", true, "⏹️");
          } else {
            stopTracking();
            btnSub.innerHTML = "▶️";
            _setGroupeModeActif("tracker", false);
          }
          isTracking = !isTracking;
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
            _setGroupeModeActif("tracker", isTracking, isTracking ? "⏹️" : null);
            return;
          }
          modeRecalage = true;
          btnSub.classList.add("kta-actif");
          _modesActifs["recalage"] = {
            btnEl: btnSub,
            desactiverFn: function() {
              modeRecalage = false;
              btnSub.classList.remove("kta-actif");
              _setGroupeModeActif("tracker", isTracking, isTracking ? "⏹️" : null);
            }
          };
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
      }
    ]
  });

  // 7. MESURE
  _creerGroupeAccordeon({
    id: "mesure",
    iconePrincipale: "📐",
    titre: "Mesure",
    sousActions: [
      {
        icone: "📐",
        titre: "Activer la mesure",
        onClick: function(btnSub) {
          const dejaActif = btnSub.classList.contains("kta-actif");
          _desactiverTousLesModes();
          if (dejaActif) {
            window.modeMesure = false;
            _setGroupeModeActif("mesure", false);
            return;
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
          _setGroupeModeActif("mesure", true);
        }
      },
      {
        icone: "❌",
        titre: "Effacer (dernier point ou tout)",
        onClick: function() {
          const pts = window.getMeasurePoints ? window.getMeasurePoints() : [];
          if (pts.length === 0) return;
          _choixSuppression(
            "Mesure", "Que veux-tu effacer ?",
            [
              { label: "Dernier point", icon: "↩️",
                desc: pts.length + " point(s) au total",
                onClick: function() { if (window.removeLastMeasurePoint) window.removeLastMeasurePoint(); }
              },
              { label: "Toute la mesure", icon: "🗑️", danger: true,
                onClick: function() { if (window.resetMesure) window.resetMesure(); }
              }
            ]
          );
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

  _creerGroupeAccordeon({
    id: "traces",
    iconePrincipale: "🛣️",
    titre: "Tracés / Routes",
    sousActions: [
      { icone: "🟩", titre: "Route principale",
        onClick: function(btn) { _activerRoute("principal",  btn, "🟩"); } },
      { icone: "🟪", titre: "Route secondaire",
        onClick: function(btn) { _activerRoute("secondaire", btn, "🟪"); } },
      { icone: "🟨", titre: "Chemin",
        onClick: function(btn) { _activerRoute("chemin",     btn, "🟨"); } },
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
          _choixSuppression(
            "Tracés", "Que veux-tu effacer ?",
            [
              { label: "Dernier point du tracé", icon: "↩️",
                desc: nbPts + " point(s) sur le dernier tracé",
                onClick: function() { if (window.removeLastRoadPoint) window.removeLastRoadPoint(); } },
              { label: "Dernier tracé entier", icon: "✂️",
                desc: roads.length + " tracé(s) au total",
                onClick: function() { if (window.removeLastRoad) window.removeLastRoad(); } },
              { label: "Tous les tracés", icon: "🗑️", danger: true,
                desc: "Action irréversible",
                onClick: function() { if (window.resetRoads) window.resetRoads(); } }
            ]
          );
        }
      }
    ]
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
    titre: "Zones (remblais / effondrements)",
    sousActions: [
      { icone: "⬛", titre: "Zone de remblais",
        onClick: function(btn) { _activerZone("remblais",     btn, "⬛"); } },
      { icone: "🟥", titre: "Zone d'effondrement",
        onClick: function(btn) { _activerZone("effondrement", btn, "🟥"); } },
      { icone: "🟦", titre: "Zone d'eau",
        onClick: function(btn) { _activerZone("eau",          btn, "🟦"); } },
      { icone: "✅", titre: "Fermer la zone en cours",
        onClick: function() {
          if (!window.modeZone) {
            alert("Activez d'abord un type de zone (remblais ou effondrement)");
            return;
          }
          if (window.fermerZoneEnCours) {
            const ok = window.fermerZoneEnCours();
            if (!ok) alert("Pose au moins 3 points avant de fermer la zone");
          }
        }
      },
      { icone: "🧹", titre: "Effacer",
        onClick: function() {
          const zones = window.getZones ? window.getZones() : [];
          if (zones.length === 0) return;

          // Compter les zones fermées (différentes de currentZone)
          const nbZonesFermees = zones.length;

          _choixSuppression(
            "Zones", "Que veux-tu effacer ?",
            [
              { label: "Annuler le dernier point", icon: "↩️",
                desc: "Sur la zone en cours ou la dernière zone",
                onClick: function() { if (window.removeLastZonePoint) window.removeLastZonePoint(); } },
              { label: "Dernière zone fermée", icon: "✂️",
                desc: nbZonesFermees + " zone(s) au total",
                onClick: function() { if (window.removeLastZone) window.removeLastZone(); } },
              { label: "Toutes les zones", icon: "🗑️", danger: true,
                desc: "Action irréversible",
                onClick: function() { if (window.resetZones) window.resetZones(); } }
            ]
          );
        }
      }
    ]
  });

  // Initialiser le clic extérieur (une seule fois)
  _initClickExterieur();
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

  function _calculer() {
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
      const result = window.Pathfinder.computeRoute(waypoints);

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
// LABEL DISTANCE ITINÉRAIRE — au-dessus du label measure (bottomleft)
// =========================
let _itiDistanceCtrl = null;

function _afficherLabelDistanceItineraire(distanceM) {
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
    el.innerHTML = '<span class="kta-iti-distance-icon">🗺️</span>Itinéraire : ' + window.formatDistance(distanceM, 1);
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
    _afficherLabelDistanceItineraire(_distanceItineraireMeters(itineraryRoad));
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
  const statusActuel = modeNavigation
    ? '<div class="kta-iti-result" style="display:block; margin-bottom:10px;">' +
        '<div class="kta-iti-result-row"><strong>Distance :</strong> ' + window.formatDistance(_distanceItineraireMeters(existingItinerary), 1) + '</div>' +
        '<div class="kta-iti-result-row"><strong>Tronçons :</strong> ' + (existingItinerary.points.length - 1) + '</div>' +
      '</div>'
    : '';
  const eraseBtn = modeNavigation
    ? '<button id="kta-iti-erase" class="kta-btn kta-btn-danger" type="button" style="width:100%; margin-top:8px;">❌ Effacer l\'itinéraire</button>'
    : '';
  const sectionAction =
    '<div class="kta-iti-section">' +
      '<div class="kta-iti-section-titre">🎯 ' + (modeNavigation ? "Itinéraire actuel" : "Action") + '</div>' +
      statusActuel +
      '<button id="kta-iti-compute" class="kta-btn kta-btn-primary" type="button" style="width:100%;">' + computeBtnLabel + '</button>' +
      eraseBtn +
      '<div id="kta-iti-result" class="kta-iti-result" style="display:none;"></div>' +
      '<div id="kta-iti-error" class="kta-iti-error" style="display:none;"></div>' +
    '</div>';

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
        sectionAction +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);
  _rafraichirListeWaypointsModale();

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

  // Calculer
  document.getElementById("kta-iti-compute").addEventListener("click", function() {
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
      const result = window.Pathfinder.computeRoute(_itineraryWaypoints);
      // Conversion px → mètres via APP_CONFIG.scale (px/mètre)
      const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
      const distM = result.totalDistance / scale;

      resEl.innerHTML =
        '<div class="kta-iti-result-row"><strong>Distance :</strong> ' + window.formatDistance(distM, 1) + '</div>' +
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

// Collecte toutes les roads pertinentes (session + embedded visibles), filtrées
// pour ne garder que les types principal/secondaire/chemin.
function _rdRoadsExploitables() {
  const session  = (window.getRoads          ? window.getRoads()          : []) || [];
  const embedded = (window.getEmbeddedRoads  ? window.getEmbeddedRoads()  : []) || [];
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
      { titre: "⚠️ Signalétique",  cles: ["salle", "chatiere", "passage", "danger", "info", "elec", "epure", "vehicule"] }
    ];

    const clesGroupees = GROUPES.flatMap(function(g) { return g.cles; });

    // Helper : récupérer l'URL pour une clé — d'abord le plan-config, sinon _iconMap (fallback built-in)
    function urlPourCle(cle) {
      if (icons[cle]) return icons[cle];
      const iconObj = window._iconMap?.[cle];
      if (iconObj && iconObj.options && iconObj.options.iconUrl) {
        return iconObj.options.iconUrl;
      }
      return null;
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

  const contenuTracés = `
    <div class="kta-aide-section">
      <div class="kta-aide-section-titre">🛣️ Tracés</div>
      <div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:#00ff00;"></span><span class="kta-legende-label">Route principale</span></div>
      <div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:#b000ff;"></span><span class="kta-legende-label">Route secondaire</span></div>
      <div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:#ffff00;"></span><span class="kta-legende-label">Chemin</span></div>
    </div>
  `;

  const contenuZones = `
    <div class="kta-aide-section">
      <div class="kta-aide-section-titre">⬛ Zones</div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#3aa9e8; opacity:0.7; height:14px; border:2px solid #0066aa;"></span>
        <span class="kta-legende-label">Eau (bleu)</span>
      </div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#5a5a68; opacity:0.7; height:14px; border:2px solid #3a3a44;"></span>
        <span class="kta-legende-label">Remblais (gris)</span>
      </div>
      <div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:#ff3333; opacity:0.7; height:14px; border:2px solid #cc0000;"></span>
        <span class="kta-legende-label">Effondrement (rouge)</span>
      </div>
    </div>
  `;

  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:480px;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">🗺️ Légende</span>
        <button class="kta-panneau-close" id="kta-legende-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">
        ${contenuIcones}
        ${contenuTracés}
        ${contenuZones}
      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);
  document.getElementById("kta-legende-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
}

// =========================
// EXPORT GLOBAL
// =========================
window.afficherConfig         = afficherConfig;
window.appliquerConfig        = appliquerConfig;
window.resetConfig            = resetConfig;
window.ouvrirCalibrageEchelle = ouvrirCalibrageEchelle;
window.viderCacheAppli       = viderCacheAppli;
window.afficherReadme        = afficherReadme;
window.afficherLegende       = afficherLegende;
// window.afficherConvertisseur retiré le 08/05/2026 — la conversion est maintenant
// dans le modal "💾 Enregistrer la session" → onglet "🔄 Conversion" (sessionExporter.js)
window.initInterface         = initInterface;
