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
    titre.innerHTML = `
      <div class="map-title-text">
        ${planName}
        ${sousTitre ? `<span class="map-title-sub">${sousTitre}</span>` : ""}
      </div>
    `;
    document.body.appendChild(titre);

    return div;
  };

  return control;
};

// =========================
// PANNEAU ANCRÉ AUX BOUTONS
// Remplace les L.popup() pour les contrôles de la barre latérale.
// Usage : ouvrirPanneauAncre(btnElement, htmlContenu, titreOptionnel)
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
    // Fermer un éventuel panneau déjà ouvert
    fermerPanneau();

    const panneau = document.createElement("div");
    panneau.className = "kta-panneau";

    // Flèche
    const fleche = document.createElement("div");
    fleche.className = "kta-panneau-fleche";
    panneau.appendChild(fleche);

    // En-tête avec titre + bouton fermer
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

    // Corps
    const corps = document.createElement("div");
    corps.className = "kta-panneau-corps";
    corps.innerHTML = html;
    panneau.appendChild(corps);

    document.body.appendChild(panneau);
    _panneauActif = panneau;

    // Positionner à gauche du bouton
    const rect = btnEl.getBoundingClientRect();
    const panH = panneau.offsetHeight || 400; // estimation initiale

    // Horizontal : à gauche du bouton avec un petit gap
    const left = rect.left - panneau.offsetWidth - 10;
    // Vertical : aligné sur le centre du bouton, clampé dans la fenêtre
    let top = rect.top + rect.height / 2 - panH / 2;
    top = Math.max(10, Math.min(top, window.innerHeight - panH - 10));

    panneau.style.left = Math.max(8, left) + "px";
    panneau.style.top = top + "px";

    // Recalculer après rendu réel
    requestAnimationFrame(() => {
      const realH = panneau.offsetHeight;
      let realTop = rect.top + rect.height / 2 - realH / 2;
      realTop = Math.max(10, Math.min(realTop, window.innerHeight - realH - 10));
      panneau.style.top = realTop + "px";

      // Positionner la flèche verticalement au niveau du bouton
      const arrowTop = (rect.top + rect.height / 2) - panneau.getBoundingClientRect().top;
      fleche.style.top = Math.max(16, arrowTop) + "px";
    });

    // Fermer en cliquant dehors (délai pour éviter le clic d'ouverture)
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

// Surcharge appliquerConfig / resetConfig pour fermer le panneau au lieu de closePopup
// (les fonctions originales appellent window.map.closePopup() — on le garde intact,
//  on ajoute juste fermerPanneau() en plus)
const _origAppliquerConfig_wrap = window.appliquerConfig;
const _origResetConfig_wrap = window.resetConfig;

// Ces surcharges seront appliquées après que les fonctions originales soient définies
// (voir bas du fichier, section "patch post-définition")

// =========================
// EXPORT SESSION JSON
// =========================
function telechargerSessionJSON() {
  const data = {
    type: "devmap-session",
    version: 1,
    editorPoints: window.getEditorPoints ? window.getEditorPoints() : [],
    measure: {
      points: window.getMeasurePoints ? window.getMeasurePoints() : []
    },
    roads: window.getRoads ? window.getRoads() : []
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

      if (window.setEditorPoints) {
        window.setEditorPoints(data.editorPoints || []);
      }

      if (window.renderEditorPoints) {
        window.renderEditorPoints();
      }

      if (window.resetMesure) {
        window.resetMesure();
      }

      if (window.setMeasurePoints) {
        const measurePoints =
          data.measure && data.measure.points ? data.measure.points : [];
        window.setMeasurePoints(measurePoints);
      }

      if (window.resetRoads) {
        window.resetRoads();
      }

      if (window.setRoads) {
        window.setRoads(data.roads || []);
      }

      alert("Import terminé");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'import");
    }
  };

  reader.readAsText(file);
}

// =========================
// SÉLECTEUR IMPORT
// =========================
function ouvrirImportSession() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.onchange = function (e) {
    const file = e.target.files[0];
    if (file) {
      importerSessionJSON(file);
    }
  };

  input.click();
}

// =========================
// HELPER — modale de confirmation simple (1 clic)
// _confirmerAction(titre, texte, callbackOui)
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
  document.body.appendChild(overlay);

  document.getElementById("_conf-annuler").addEventListener("click", function () {
    overlay.remove();
  });
  document.getElementById("_conf-ok").addEventListener("click", function () {
    overlay.remove();
    callback();
  });
}

// =========================
// README — modale plein écran
// =========================
function afficherReadme() {
  console.log("[README] afficherReadme appelé");

  // Si déjà ouverte, fermer
  const existing = document.getElementById("kta-readme-modal");
  if (existing) { existing.remove(); return; }

  // Ouvrir immédiatement avec état de chargement
  _ouvrirReadmeModal("<p style='color:#8892a4; text-align:center; padding:20px;'>⏳ Chargement du README…</p>");

  console.log("[README] modale ouverte, lancement fetch");

  fetch("README.md")
    .then(function(res) {
      console.log("[README] fetch status:", res.status, res.ok);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then(function(md) {
      console.log("[README] contenu reçu, longueur:", md.length);
      const html = _renderMarkdown(md);
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (corps) corps.innerHTML = "<p>" + html + "</p>";
    })
    .catch(function(err) {
      console.error("[README] erreur fetch:", err);
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (corps) corps.innerHTML = `
        <p class="kta-readme-erreur">
          ❌ Impossible de charger README.md<br><br>
          <code>${err.message}</code><br><br>
          Vérifiez que <code>README.md</code> est à la racine du serveur.
        </p>`;
    });
}

function _renderMarkdown(md) {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```[\w]*\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm,  "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,   "<h2>$1</h2>")
    .replace(/^# (.+)$/gm,    "<h1>$1</h1>")
    .replace(/^---$/gm, "<hr>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,         "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function _ouvrirReadmeModal(html) {
  console.log("[README] _ouvrirReadmeModal appelé");
  const modal = document.createElement("div");
  modal.id = "kta-readme-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">📖 Documentation</span>
        <button class="kta-panneau-close" id="kta-readme-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">
        <div class="kta-readme-corps"><p>${html}</p></div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  document.getElementById("kta-readme-close").addEventListener("click", function () {
    modal.remove();
  });

  // Clic sur l'overlay pour fermer
  modal.addEventListener("click", function (e) {
    if (e.target === modal) modal.remove();
  });
}

// =========================
// AIDE — panneau ancré
// =========================
function afficherAide(btnEl) {
  const html = `
    <div class="kta-aide-grille">
      <span class="kta-aide-icone">▶️ / ⏹️</span><span>Démarrer / arrêter le tracking</span>
      <span class="kta-aide-icone">📍</span><span>Recalage de position</span>
      <span class="kta-aide-icone">📏</span><span>Mesurer une distance</span>
      <span class="kta-aide-icone">❌</span><span>Réinitialiser la mesure</span>
      <span class="kta-aide-icone">🖼️</span><span>Télécharger le plan</span>
      <span class="kta-aide-icone">✏️</span><span>Ajouter un point</span>
      <span class="kta-aide-icone">🗑️</span><span>Effacer les points ajoutés</span>
      <span class="kta-aide-icone">🟩</span><span>Route principale</span>
      <span class="kta-aide-icone">🟪</span><span>Route secondaire</span>
      <span class="kta-aide-icone">🟨</span><span>Chemin</span>
      <span class="kta-aide-icone">🧹</span><span>Réinitialiser les tracés</span>
      <span class="kta-aide-icone">📂</span><span>Importer une session</span>
      <span class="kta-aide-icone">💾</span><span>Exporter la session</span>
      <span class="kta-aide-icone">🗺️</span><span>Légende des icônes</span>
      <span class="kta-aide-icone">📖</span><span>Documentation (README)</span>
      <span class="kta-aide-icone">🗺️</span><span>Légende des icônes</span>
      <span class="kta-aide-icone">❓</span><span>Cette aide</span>
      <span class="kta-aide-icone">🗂️</span><span>Changer de plan</span>
      <span class="kta-aide-icone">⚙️</span><span>Configuration</span>
    </div>
  `;
  ouvrirPanneauAncre(btnEl, html, "Aide");
}

// =========================
// CHANGER DE PLAN — overlay modal (inchangé)
// =========================
function afficherPopupChangerPlan() {
  const existing = document.getElementById("popupChangerPlan");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "popupChangerPlan";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(10, 15, 25, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
  `;

  overlay.innerHTML = `
    <div style="
      background: #fff;
      color: #111;
      border-radius: 14px;
      padding: 24px;
      max-width: 380px;
      width: 100%;
      font-family: Arial, sans-serif;
      box-shadow: 0 10px 35px rgba(0,0,0,0.35);
    ">
      <h2 style="margin: 0 0 10px; font-size: 18px;">Changer de plan</h2>
      <p style="margin: 0 0 20px; font-size: 14px; color: #555;">
        Tu vas quitter la session en cours. Les données non exportées seront perdues.
      </p>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="popupResterIci" style="
          padding: 10px 16px;
          border-radius: 8px;
          border: 1px solid #ccc;
          background: #f5f5f5;
          color: #333;
          font-size: 14px;
          cursor: pointer;
        ">Rester ici</button>
        <button id="popupChargerPlan" style="
          padding: 10px 16px;
          border-radius: 8px;
          border: 0;
          background: #1f6feb;
          color: #fff;
          font-size: 14px;
          cursor: pointer;
        ">Charger un plan</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("popupResterIci").addEventListener("click", function () {
    overlay.remove();
  });

  document.getElementById("popupChargerPlan").addEventListener("click", function () {
    window.location.href = "import.html";
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });
}

// =========================
// CONFIG — panneau ancré
// =========================
function afficherConfig(btnEl) {
  const c = APP_CONFIG;

  const html = `
    <div class="kta-cfg-grille">

      <label class="kta-cfg-label">Échelle</label>
      <input class="kta-cfg-input" id="cfg_scale" type="number" step="0.1" value="${c.scale}">

      <label class="kta-cfg-label">Taille d'un pas (m)</label>
      <input class="kta-cfg-input" id="cfg_stepLength" type="number" step="0.1" value="${c.stepLength}">

      <label class="kta-cfg-label">Hauteur image (px)</label>
      <input class="kta-cfg-input" id="cfg_imageHeight" type="number" value="${c.imageHeight}">

      <label class="kta-cfg-label">Largeur image (px)</label>
      <input class="kta-cfg-input" id="cfg_imageWidth" type="number" value="${c.imageWidth}">

      <label class="kta-cfg-label">Position initiale X</label>
      <input class="kta-cfg-input" id="cfg_startX" type="number" value="${c.startX}">

      <label class="kta-cfg-label">Position initiale Y</label>
      <input class="kta-cfg-input" id="cfg_startY" type="number" value="${c.startY}">

      <label class="kta-cfg-label">Seuil détection pas</label>
      <input class="kta-cfg-input" id="cfg_stepThreshold" type="number" step="0.1" value="${c.stepThreshold}">

      <label class="kta-cfg-label">Cooldown pas (ms)</label>
      <input class="kta-cfg-input" id="cfg_stepCooldown" type="number" value="${c.stepCooldown}">

      <label class="kta-cfg-label">Debug mouvement</label>
      <select class="kta-cfg-input" id="cfg_motionDebug">
        <option value="true"  ${c.motionDebug ? "selected" : ""}>Oui</option>
        <option value="false" ${!c.motionDebug ? "selected" : ""}>Non</option>
      </select>

    </div>

    <div class="kta-cfg-actions">
      <button class="kta-btn kta-btn-ghost" onclick="resetConfig()">Reset</button>
      <button class="kta-btn kta-btn-primary" onclick="appliquerConfig()">Appliquer</button>
    </div>

    <div class="kta-cfg-cache">
      <button class="kta-btn kta-btn-danger" onclick="viderCacheAppli()">🗑️ Vider le cache</button>
    </div>
  `;

  ouvrirPanneauAncre(btnEl, html, "Réglages");
}

function appliquerConfig() {
  APP_CONFIG.scale          = parseFloat(document.getElementById("cfg_scale").value);
  APP_CONFIG.stepLength     = parseFloat(document.getElementById("cfg_stepLength").value);
  APP_CONFIG.imageHeight    = parseInt(document.getElementById("cfg_imageHeight").value, 10);
  APP_CONFIG.imageWidth     = parseInt(document.getElementById("cfg_imageWidth").value, 10);
  APP_CONFIG.startX         = parseInt(document.getElementById("cfg_startX").value, 10);
  APP_CONFIG.startY         = parseInt(document.getElementById("cfg_startY").value, 10);
  APP_CONFIG.stepThreshold  = parseFloat(document.getElementById("cfg_stepThreshold").value);
  APP_CONFIG.stepCooldown   = parseInt(document.getElementById("cfg_stepCooldown").value, 10);
  APP_CONFIG.motionDebug    = document.getElementById("cfg_motionDebug").value === "true";

  localStorage.setItem("app_config", JSON.stringify(APP_CONFIG));

  if (window.resetTrackingPosition) {
    window.resetTrackingPosition();
  }

  // Ferme le panneau ancré (+ closePopup pour compatibilité)
  if (window.fermerPanneau) window.fermerPanneau();
  if (window.map) window.map.closePopup();
}

function resetConfig() {
  Object.assign(APP_CONFIG, DEFAULT_CONFIG);

  localStorage.setItem("app_config", JSON.stringify(APP_CONFIG));

  if (window.resetTrackingPosition) {
    window.resetTrackingPosition();
  }

  if (window.fermerPanneau) window.fermerPanneau();
  if (window.map) window.map.closePopup();
}

// =========================
// VIDER LE CACHE APPLICATIF
// Double confirmation avant de désinscrire le SW et vider le Cache API
// =========================
function viderCacheAppli() {

  // — Première confirmation —
  const overlay1 = document.createElement("div");
  overlay1.className = "kta-modal-overlay";
  overlay1.innerHTML = `
    <div class="kta-modal">
      <div class="kta-modal-icon">⚠️</div>
      <div class="kta-modal-titre">Vider le cache ?</div>
      <div class="kta-modal-texte">
        Le cache applicatif sera entièrement supprimé.<br><br>
        <strong>Si vous utilisez l'app hors connexion, elle sera inutilisable jusqu'à la prochaine synchronisation.</strong>
      </div>
      <div class="kta-modal-actions">
        <button class="kta-btn kta-btn-ghost" id="cache-annuler-1">Annuler</button>
        <button class="kta-btn kta-btn-danger" id="cache-continuer-1">Continuer →</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay1);

  document.getElementById("cache-annuler-1").addEventListener("click", function () {
    overlay1.remove();
  });

  document.getElementById("cache-continuer-1").addEventListener("click", function () {
    overlay1.remove();

    // — Deuxième confirmation —
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
    document.body.appendChild(overlay2);

    document.getElementById("cache-annuler-2").addEventListener("click", function () {
      overlay2.remove();
    });

    document.getElementById("cache-confirmer-2").addEventListener("click", async function () {
      overlay2.remove();

      // — Feedback pendant l'opération —
      const overlayWait = document.createElement("div");
      overlayWait.className = "kta-modal-overlay";
      overlayWait.innerHTML = `
        <div class="kta-modal">
          <div class="kta-modal-icon">⏳</div>
          <div class="kta-modal-titre">Nettoyage en cours…</div>
          <div class="kta-modal-texte">Suppression des caches et désinscription du Service Worker.</div>
        </div>
      `;
      document.body.appendChild(overlayWait);

      try {
        // 1. Désinscrire tous les Service Workers
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(r => r.unregister()));
        }

        // 2. Vider tous les caches du Cache API
        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        }

        // 3. Rechargement forcé depuis le réseau
        overlayWait.remove();
        window.location.reload(true);

      } catch (err) {
        console.error("Erreur lors du vidage du cache :", err);
        overlayWait.remove();

        const overlayErr = document.createElement("div");
        overlayErr.className = "kta-modal-overlay";
        overlayErr.innerHTML = `
          <div class="kta-modal">
            <div class="kta-modal-icon">❌</div>
            <div class="kta-modal-titre">Erreur</div>
            <div class="kta-modal-texte">Impossible de vider le cache :<br>${err.message || err}</div>
            <div class="kta-modal-actions">
              <button class="kta-btn kta-btn-primary" id="cache-err-ok">OK</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlayErr);
        document.getElementById("cache-err-ok").addEventListener("click", function () {
          overlayErr.remove();
        });
      }
    });
  });
}

// =========================
// INIT INTERFACE
// =========================
function initInterface() {
  console.log("initInterface appelé");
  if (window.interfaceInitialized) return;
  window.interfaceInitialized = true;

  // ---------- TITRE ----------
  L.control.titleControl().addTo(window.map);

  // ---------- BLOC INFOS (aide, doc, plan, config, légende) ----------
  const infosControl = L.control({ position: "topright" });

  infosControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnHelp = L.DomUtil.create("a", "", div);
    btnHelp.innerHTML = "❓";
    btnHelp.href = "javascript:void(0)";
    btnHelp.title = "Aide";

    const btnReadme = L.DomUtil.create("a", "", div);
    btnReadme.innerHTML = "📖";
    btnReadme.href = "javascript:void(0)";
    btnReadme.title = "Documentation";

    const btnChangePlan = L.DomUtil.create("a", "", div);
    btnChangePlan.innerHTML = "🗂️";
    btnChangePlan.href = "javascript:void(0)";
    btnChangePlan.title = "Changer de plan";

    const btnSettings = L.DomUtil.create("a", "", div);
    btnSettings.innerHTML = "⚙️";
    btnSettings.href = "javascript:void(0)";
    btnSettings.title = "Réglages";

    const btnLegende = L.DomUtil.create("a", "", div);
    btnLegende.innerHTML = "🗺️";
    btnLegende.href = "javascript:void(0)";
    btnLegende.title = "Légende";

    L.DomEvent.on(btnHelp, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      afficherAide(btnHelp);
    });

    L.DomEvent.on(btnReadme, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      afficherReadme();
    });

    L.DomEvent.on(btnChangePlan, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      afficherPopupChangerPlan();
    });

    L.DomEvent.on(btnSettings, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      afficherConfig(btnSettings);
    });

    L.DomEvent.on(btnLegende, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      afficherLegende(btnLegende);
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  infosControl.addTo(window.map);

  // ---------- BLOC TRACKING ----------
  const trackingControl = L.control({ position: "topright" });

  trackingControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnTrack = L.DomUtil.create("a", "", div);
    btnTrack.innerHTML = "▶️";
    btnTrack.href = "javascript:void(0)";
    btnTrack.title = "Démarrer / arrêter le tracking";

    const btnRecal = L.DomUtil.create("a", "", div);
    btnRecal.innerHTML = "📍";
    btnRecal.href = "javascript:void(0)";
    btnRecal.title = "Mode recalage";

    let isTracking = false;

    L.DomEvent.on(btnTrack, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);

      if (!isTracking) {
        requestPermission();
        startTracking();
        btnTrack.innerHTML = "⏹️";
      } else {
        stopTracking();
        btnTrack.innerHTML = "▶️";
      }

      isTracking = !isTracking;
    });

    L.DomEvent.on(btnRecal, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);

      if (typeof modeRecalage !== "undefined") {
        modeRecalage = !modeRecalage;
        btnRecal.style.backgroundColor = modeRecalage ? "#4CAF50" : "";
      }
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  trackingControl.addTo(window.map);

  // ---------- BLOC MESURE ----------
  const measureControl = L.control({ position: "topright" });

  measureControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnMeasure = L.DomUtil.create("a", "", div);
    btnMeasure.innerHTML = "📏";
    btnMeasure.href = "javascript:void(0)";
    btnMeasure.title = "Activer la mesure";

    const btnResetMeasure = L.DomUtil.create("a", "", div);
    btnResetMeasure.innerHTML = "❌";
    btnResetMeasure.href = "javascript:void(0)";
    btnResetMeasure.title = "Réinitialiser la mesure";

    L.DomEvent.on(btnMeasure, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);

      if (typeof modeMesure !== "undefined") {
        modeMesure = !modeMesure;
        btnMeasure.style.backgroundColor = modeMesure ? "#4CAF50" : "";
      } else if (typeof window.modeMesure !== "undefined") {
        window.modeMesure = !window.modeMesure;
        btnMeasure.style.backgroundColor = window.modeMesure ? "#4CAF50" : "";
      }
    });

    L.DomEvent.on(btnResetMeasure, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      resetMesure();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  measureControl.addTo(window.map);

  // ---------- BLOC PLAN ----------
  const imageControl = L.control({ position: "topright" });

  imageControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnDownloadPlan = L.DomUtil.create("a", "", div);
    btnDownloadPlan.innerHTML = "🖼️";
    btnDownloadPlan.href = "javascript:void(0)";
    btnDownloadPlan.title = "Télécharger le plan";

    L.DomEvent.on(btnDownloadPlan, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      telechargerPlan();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  imageControl.addTo(window.map);

  // ---------- BLOC ÉDITION + RESET POINTS (même barre) ----------
  const editorControl = L.control({ position: "topright" });

  editorControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnEdit = L.DomUtil.create("a", "", div);
    btnEdit.innerHTML = "✏️";
    btnEdit.href = "javascript:void(0)";
    btnEdit.title = "Mode ajout de point";

    const btnResetEditor = L.DomUtil.create("a", "", div);
    btnResetEditor.innerHTML = "🗑️";
    btnResetEditor.href = "javascript:void(0)";
    btnResetEditor.title = "Effacer les points ajoutés";

    L.DomEvent.on(btnEdit, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      toggleEdition();
      btnEdit.style.backgroundColor = window.modeEdition ? "#4CAF50" : "";
    });

    L.DomEvent.on(btnResetEditor, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);

      if (!window.getEditorPoints || window.getEditorPoints().length === 0) return;

      _confirmerAction(
        "Effacer les points ajoutés ?",
        "Tous les points ajoutés manuellement seront supprimés.<br>Cette action est irréversible.",
        function () {
          if (window.setEditorPoints) window.setEditorPoints([]);
          if (window.renderEditorPoints) window.renderEditorPoints();
        }
      );
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  editorControl.addTo(window.map);

  // ---------- BLOC ROUTES ----------
  const roadControl = L.control({ position: "topright" });

  roadControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnPrincipal = L.DomUtil.create("a", "", div);
    btnPrincipal.innerHTML = "🟩";
    btnPrincipal.href = "javascript:void(0)";
    btnPrincipal.title = "Tracer une route principale";

    const btnSecondaire = L.DomUtil.create("a", "", div);
    btnSecondaire.innerHTML = "🟪";
    btnSecondaire.href = "javascript:void(0)";
    btnSecondaire.title = "Tracer une route secondaire";

    const btnChemin = L.DomUtil.create("a", "", div);
    btnChemin.innerHTML = "🟨";
    btnChemin.href = "javascript:void(0)";
    btnChemin.title = "Tracer un chemin";

    const btnResetRoads = L.DomUtil.create("a", "", div);
    btnResetRoads.innerHTML = "🧹";
    btnResetRoads.href = "javascript:void(0)";
    btnResetRoads.title = "Réinitialiser les tracés routes";

    function refreshRoadButtons() {
      btnPrincipal.style.backgroundColor  = window.modeRoad === "principal"  ? "#4CAF50" : "";
      btnSecondaire.style.backgroundColor = window.modeRoad === "secondaire" ? "#4CAF50" : "";
      btnChemin.style.backgroundColor     = window.modeRoad === "chemin"     ? "#4CAF50" : "";
    }

    L.DomEvent.on(btnPrincipal, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      toggleRoadMode("principal"); refreshRoadButtons();
    });

    L.DomEvent.on(btnSecondaire, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      toggleRoadMode("secondaire"); refreshRoadButtons();
    });

    L.DomEvent.on(btnChemin, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      toggleRoadMode("chemin"); refreshRoadButtons();
    });

    L.DomEvent.on(btnResetRoads, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);

      if (!window.getRoads || window.getRoads().length === 0) return;

      _confirmerAction(
        "Effacer les tracés ?",
        "Tous les tracés de routes seront supprimés.<br>Cette action est irréversible.",
        function () {
          resetRoads();
          refreshRoadButtons();
        }
      );
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  roadControl.addTo(window.map);

  // ---------- BLOC IMPORT / EXPORT ----------
  const ioControl = L.control({ position: "topright" });

  ioControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnImport = L.DomUtil.create("a", "", div);
    btnImport.innerHTML = "📂";
    btnImport.href = "javascript:void(0)";
    btnImport.title = "Importer une session";

    const btnExport = L.DomUtil.create("a", "", div);
    btnExport.innerHTML = "💾";
    btnExport.href = "javascript:void(0)";
    btnExport.title = "Exporter la session";

    L.DomEvent.on(btnImport, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      ouvrirImportSession();
    });

    L.DomEvent.on(btnExport, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      telechargerSessionJSON();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  ioControl.addTo(window.map);
}

// =========================
// LÉGENDE — panneau ancré
// Affiche les icônes du plan et leur label
// =========================

// Labels lisibles pour chaque clé d'icône
const LEGENDE_LABELS = {
  salle:    "Salle",
  pa:       "Puits Aération",
  pc:       "Puits Comblé",
  pb:       "Puits Bouché",
  pe:       "Puits au sol / Bassin",
  vehicule: "Véhicule",
  elec:     "Électricité",
  epure:    "Épure",
  ps:       "Puit extraction",
  info:     "Information",
  chatiere: "Chatière",
  passage:  "Passage",
  danger:   "Danger"
};

// Clés à exclure (icônes système, pas des types de points)
const LEGENDE_EXCLURE = ["default", "track"];

function afficherLegende(btnEl) {
  const icons = window.PLAN_CONFIG?.icons;

  if (!icons) {
    ouvrirPanneauAncre(btnEl, `<p style="color:#8892a4;">Aucune configuration d'icônes disponible.</p>`, "Légende");
    return;
  }

  // Lignes de tracés toujours présentes
  const lignesTracés = `
    <div class="kta-legende-separateur">Tracés</div>
    <div class="kta-legende-ligne">
      <span class="kta-legende-trait" style="background:#00ff00;"></span>
      <span class="kta-legende-label">Route principale</span>
    </div>
    <div class="kta-legende-ligne">
      <span class="kta-legende-trait" style="background:#b000ff;"></span>
      <span class="kta-legende-label">Route secondaire</span>
    </div>
    <div class="kta-legende-ligne">
      <span class="kta-legende-trait" style="background:#ffff00;"></span>
      <span class="kta-legende-label">Chemin</span>
    </div>
  `;

  // Icônes du plan
  const entrees = Object.entries(icons)
    .filter(function(e) { return !LEGENDE_EXCLURE.includes(e[0]); });

  const lignesIcones = entrees.map(function(entry) {
    const cle = entry[0];
    const url = entry[1];
    const label = LEGENDE_LABELS[cle] || cle;
    return `
      <div class="kta-legende-ligne">
        <img class="kta-legende-icone" src="${url}" alt="${label}" onerror="this.style.opacity='0.3'">
        <span class="kta-legende-label">${label}</span>
      </div>
    `;
  }).join("");

  const html = `
    <div class="kta-legende-separateur">Points d'intérêt</div>
    ${lignesIcones}
    ${lignesTracés}
  `;

  ouvrirPanneauAncre(btnEl, html, "Légende");
}

// =========================
// EXPORT GLOBAL
// =========================
window.afficherConfig    = afficherConfig;
window.appliquerConfig   = appliquerConfig;
window.resetConfig       = resetConfig;
window.viderCacheAppli   = viderCacheAppli;
window.afficherReadme    = afficherReadme;
window.afficherLegende   = afficherLegende;
window.initInterface     = initInterface;
