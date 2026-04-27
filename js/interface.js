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
// SÉLECTEUR IMPORT
// =========================
function ouvrirImportSession() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.onchange = function (e) {
    const file = e.target.files[0];
    if (file) importerSessionJSON(file);
  };

  input.click();
}

// =========================
// CONVERTISSEUR JSON — modale plein écran
// =========================
function afficherConvertisseur() {
  const existing = document.getElementById("kta-conv-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id = "kta-conv-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:90vh;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">🔄 Convertisseur JSON</span>
        <button class="kta-panneau-close" id="kta-conv-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <div class="kta-conv-sens-wrap">
          <button class="kta-conv-sens-btn active" id="kta-conv-btn-ed2data">
            <span class="kta-conv-sens-label">✏️ → 🗂️ Vers calque de données</span>
            <span class="kta-conv-sens-desc">Convertit les points et tracés de la session en calque chargeable dans le plan</span>
          </button>
          <button class="kta-conv-sens-btn" id="kta-conv-btn-data2ed">
            <span class="kta-conv-sens-label">🗂️ → ✏️ Vers mode édition</span>
            <span class="kta-conv-sens-desc">Convertit un calque de données (points + tracés) en session importable</span>
          </button>
        </div>

        <div id="kta-conv-type-wrap" class="kta-conv-champ">
          <label class="kta-conv-label">
            Type du fichier de sortie
            <span class="kta-conv-hint">ex: carriere, puits, vehicule…</span>
          </label>
          <input class="kta-cfg-input" id="kta-conv-type" type="text" placeholder="carriere" value="carriere">
        </div>

        <div class="kta-conv-champ">
          <label class="kta-conv-label">Fichier source</label>
          <div class="kta-conv-drop" id="kta-conv-drop">
            <span id="kta-conv-drop-label">📂 Cliquer ou glisser un fichier .json</span>
            <input type="file" id="kta-conv-file" accept=".json" style="display:none">
          </div>
        </div>

        <div class="kta-conv-champ" id="kta-conv-apercu-wrap" style="display:none;">
          <label class="kta-conv-label">Aperçu</label>
          <div class="kta-conv-apercu" id="kta-conv-apercu"></div>
        </div>

        <div class="kta-conv-actions">
          <button class="kta-btn kta-btn-ghost" id="kta-conv-annuler">Annuler</button>
          <button class="kta-btn kta-btn-primary" id="kta-conv-telecharger" disabled>⬇️ Télécharger</button>
        </div>

        <div id="kta-conv-erreur" class="kta-conv-erreur" style="display:none;"></div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  let sens = "ed2data";
  let jsonSource = null;
  let nomFichierSource = "";

  const btnClose   = document.getElementById("kta-conv-close");
  const btnEd2Data = document.getElementById("kta-conv-btn-ed2data");
  const btnData2Ed = document.getElementById("kta-conv-btn-data2ed");
  const typeWrap   = document.getElementById("kta-conv-type-wrap");
  const inputType  = document.getElementById("kta-conv-type");
  const dropZone   = document.getElementById("kta-conv-drop");
  const fileInput  = document.getElementById("kta-conv-file");
  const dropLabel  = document.getElementById("kta-conv-drop-label");
  const apercuWrap = document.getElementById("kta-conv-apercu-wrap");
  const apercuEl   = document.getElementById("kta-conv-apercu");
  const btnDl      = document.getElementById("kta-conv-telecharger");
  const btnAnnuler = document.getElementById("kta-conv-annuler");
  const erreurEl   = document.getElementById("kta-conv-erreur");

  function afficherErreur(msg) {
    erreurEl.textContent = msg;
    erreurEl.style.display = msg ? "block" : "none";
  }

  function mettreAJourApercu() {
    if (!jsonSource) return;
    try {
      const converti = convertir(jsonSource, sens, inputType.value.trim() || "data");
      const preview = JSON.stringify(converti, null, 2);
      const lignes = preview.split("\n").slice(0, 12).join("\n");
      apercuEl.textContent = lignes + (preview.split("\n").length > 12 ? "\n  …" : "");
      apercuWrap.style.display = "block";
      btnDl.disabled = false;
      afficherErreur("");
    } catch (err) {
      afficherErreur("❌ " + err.message);
      apercuWrap.style.display = "none";
      btnDl.disabled = true;
    }
  }

  function chargerFichier(file) {
    nomFichierSource = file.name;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        jsonSource = JSON.parse(e.target.result);
        dropLabel.textContent = "✅ " + file.name;
        afficherErreur("");
        mettreAJourApercu();
      } catch(err) {
        afficherErreur("❌ JSON invalide : " + err.message);
        jsonSource = null;
        btnDl.disabled = true;
      }
    };
    reader.readAsText(file);
  }

  function convertir(json, direction, typeLabel) {
    if (direction === "ed2data") {
      // session → data : points + routes embarquées
      let points = [];
      if (Array.isArray(json.editorPoints))   points = json.editorPoints;
      else if (Array.isArray(json.data))       points = json.data;
      else throw new Error("Aucun champ 'editorPoints' ou 'data' trouvé dans le fichier source.");

      const roads = Array.isArray(json.roads) ? json.roads : [];

      const result = { type: typeLabel, version: 1, data: points };
      if (roads.length > 0) result.roads = roads;
      return result;

    } else {
      // data → session : points + routes restaurées
      let points = [];
      if (Array.isArray(json.data))            points = json.data;
      else if (Array.isArray(json.editorPoints)) points = json.editorPoints;
      else throw new Error("Aucun champ 'data' ou 'editorPoints' trouvé dans le fichier source.");

      const roads = Array.isArray(json.roads) ? json.roads : [];

      return {
        type: "devmap-session",
        version: 1,
        editorPoints: points,
        measure: { points: [] },
        roads: roads
      };
    }
  }

  function nomFichierSortie() {
    const base = nomFichierSource.replace(/\.json$/i, "");
    return sens === "ed2data" ? base + "_data.json" : base + "_session.json";
  }

  btnClose.addEventListener("click", function() { modal.remove(); });
  btnAnnuler.addEventListener("click", function() { modal.remove(); });
  modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });

  btnEd2Data.addEventListener("click", function() {
    sens = "ed2data";
    btnEd2Data.classList.add("active"); btnData2Ed.classList.remove("active");
    typeWrap.style.display = "block"; mettreAJourApercu();
  });
  btnData2Ed.addEventListener("click", function() {
    sens = "data2ed";
    btnData2Ed.classList.add("active"); btnEd2Data.classList.remove("active");
    typeWrap.style.display = "none"; mettreAJourApercu();
  });

  inputType.addEventListener("input", mettreAJourApercu);
  dropZone.addEventListener("click", function() { fileInput.click(); });
  fileInput.addEventListener("change", function() { if (fileInput.files[0]) chargerFichier(fileInput.files[0]); });
  dropZone.addEventListener("dragover", function(e) { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", function() { dropZone.classList.remove("dragover"); });
  dropZone.addEventListener("drop", function(e) {
    e.preventDefault(); dropZone.classList.remove("dragover");
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".json")) chargerFichier(f);
    else afficherErreur("Le fichier doit être un .json");
  });

  btnDl.addEventListener("click", function() {
    if (!jsonSource) return;
    try {
      const converti = convertir(jsonSource, sens, inputType.value.trim() || "data");
      const json = JSON.stringify(converti, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomFichierSortie(); a.click();
      URL.revokeObjectURL(url);
    } catch(err) { afficherErreur("❌ " + err.message); }
  });
}

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
// README — modale plein écran
// =========================
function afficherReadme() {
  const existing = document.getElementById("kta-readme-modal");
  if (existing) { existing.remove(); return; }

  const choix = document.createElement("div");
  choix.id = "kta-readme-choix";
  choix.className = "kta-readme-modal-overlay";

  choix.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:380px; height:auto;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">📖 Documentation</span>
        <button class="kta-panneau-close" id="kta-choix-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">
        <p style="color:#8892a4; font-size:13px; margin:0 0 16px;">Quelle documentation souhaitez-vous consulter ?</p>
        <div style="display:flex; gap:10px; flex-direction:column;">
          <button class="kta-btn kta-btn-primary" id="kta-choix-user" style="text-align:left; padding:12px 16px;">
            📗 Documentation Utilisateur
            <span style="display:block; font-size:11px; opacity:0.7; font-weight:400; margin-top:3px;">Guide d'utilisation de l'application</span>
          </button>
          <button class="kta-btn kta-btn-ghost" id="kta-choix-dev" style="text-align:left; padding:12px 16px;">
            📘 Documentation Développeur
            <span style="display:block; font-size:11px; opacity:0.7; font-weight:400; margin-top:3px;">Architecture technique et configuration</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(choix);
  document.getElementById("kta-choix-close").addEventListener("click", function () { choix.remove(); });
  choix.addEventListener("click", function (e) { if (e.target === choix) choix.remove(); });
  document.getElementById("kta-choix-user").addEventListener("click", function () { choix.remove(); _chargerReadme("README_USER.md"); });
  document.getElementById("kta-choix-dev").addEventListener("click",  function () { choix.remove(); _chargerReadme("README.md"); });
}

function _chargerReadme(fichier) {
  _ouvrirReadmeModal("<p style='color:#8892a4; text-align:center; padding:20px;'>⏳ Chargement…</p>");
  fetch(fichier)
    .then(function(res) { if (!res.ok) throw new Error("HTTP " + res.status + " — " + fichier); return res.text(); })
    .then(function(md) {
      const html = _renderMarkdown(md);
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (corps) corps.innerHTML = "<p>" + html + "</p>";
    })
    .catch(function(err) {
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (corps) corps.innerHTML = `<p class="kta-readme-erreur">❌ Impossible de charger <code>${fichier}</code><br><br><code>${err.message}</code></p>`;
    });
}

function _renderMarkdown(md) {
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

  // 12. Paragraphes
  md = md.replace(/\n\n+/g, "</p><p>");
  md = md.replace(/\n/g, "<br>");

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
    <div class="kta-readme-modal-boite" style="max-width:560px;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">❓ Aide — Référence des boutons</span>
        <button class="kta-panneau-close" id="kta-aide-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Navigation & Carte</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🗂️</span><span>Changer de plan</span>
            <span class="kta-aide-icone">🖼️</span><span>Télécharger le plan (image)</span>
            <span class="kta-aide-icone">📏</span><span>Mesurer une distance</span>
            <span class="kta-aide-icone">❌</span><span>Réinitialiser la mesure</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📍 Tracking & Déplacement</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">▶️ / ⏹️</span><span>Démarrer / arrêter le tracking</span>
            <span class="kta-aide-icone">📍</span><span>Mode recalage de position</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">✏️ Points d'intérêt</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">✏️</span><span>Activer le mode ajout de point</span>
            <span class="kta-aide-icone">🗑️</span><span>Effacer tous les points ajoutés</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🛣️ Tracés & Routes</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🟩</span><span>Tracer une route principale</span>
            <span class="kta-aide-icone">🟪</span><span>Tracer une route secondaire</span>
            <span class="kta-aide-icone">🟨</span><span>Tracer un chemin</span>
            <span class="kta-aide-icone">🧹</span><span>Effacer tous les tracés</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">💾 Import / Export</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📂</span><span>Importer une session</span>
            <span class="kta-aide-icone">💾</span><span>Exporter la session en cours</span>
            <span class="kta-aide-icone">🔄</span><span>Convertir édition ↔ calque de données</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">ℹ️ Informations & Réglages</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">❓</span><span>Cette aide</span>
            <span class="kta-aide-icone">📖</span><span>Documentation (README)</span>
            <span class="kta-aide-icone">📦</span><span>Créer un nouveau plan (ZIP)</span>
            <span class="kta-aide-icone">🗂️</span><span>Changer de plan</span>
            <span class="kta-aide-icone">⚙️</span><span>Réglages & configuration</span>
            <span class="kta-aide-icone">🗺️</span><span>Légende des icônes du plan</span>
          </div>
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
        Tu vas quitter la session en cours.<br>
        <strong>Les données non exportées seront perdues.</strong>
      </div>
      <div class="kta-modal-actions">
        <button class="kta-btn kta-btn-ghost" id="popupResterIci">Rester ici</button>
        <button class="kta-btn kta-btn-primary" id="popupChargerPlan">Charger un plan</button>
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
            <input class="kta-cfg-input" id="cfg_scale" type="number" step="0.1" value="${c.scale}">
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
            <label class="kta-cfg-label">Debug mouvement</label>
            <select class="kta-cfg-input" id="cfg_motionDebug">
              <option value="true"  ${c.motionDebug ? "selected" : ""}>Oui</option>
              <option value="false" ${!c.motionDebug ? "selected" : ""}>Non</option>
            </select>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⚡ Mode Performance</div>
          <p style="font-size:12px; color:#8892a4; margin:0 0 10px; line-height:1.5;">
            Découpe le plan en tuiles pour éviter les crashes sur les images lourdes (&gt;60 Mo).<br>
            <strong style="color:#8cb4ff;">Auto</strong> = activé uniquement si l'image dépasse 60 Mo.<br>
            <span style="color:#ffb3b3;">⚠️ Un rechargement du plan est nécessaire pour appliquer ce changement.</span>
          </p>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">Mode performance</label>
            <select class="kta-cfg-input" id="cfg_perfMode">
              <option value="null"  ${c.perfMode === null  || c.perfMode === undefined ? "selected" : ""}>Auto (≥ 60 Mo)</option>
              <option value="true"  ${c.perfMode === true  ? "selected" : ""}>Toujours activé</option>
              <option value="false" ${c.perfMode === false ? "selected" : ""}>Désactivé</option>
            </select>
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
  APP_CONFIG.motionDebug   = document.getElementById("cfg_motionDebug").value === "true";

  const perfVal = document.getElementById("cfg_perfMode").value;
  APP_CONFIG.perfMode = perfVal === "null" ? null : perfVal === "true";

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

/// VERIF INTERNET

// =========================
// CHECK CONNEXION AVANT RESET CACHE
// =========================
function verifierConnexionInternet(timeoutMs = 5000) {
  return new Promise(function(resolve) {
    if (!navigator.onLine) {
      resolve(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(function() {
      controller.abort();
      resolve(false);
    }, timeoutMs);

    fetch("https://www.google.com/generate_204?_=" + Date.now(), {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal
    })
      .then(function() {
        clearTimeout(timeout);
        resolve(true);
      })
      .catch(function() {
        clearTimeout(timeout);
        resolve(false);
      });
  });
}

function afficherConfirmationOffline(callbackContinuer) {
  const overlay = document.createElement("div");
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML = `
    <div class="kta-modal kta-modal-danger">
      <div class="kta-modal-icon">📡</div>
      <div class="kta-modal-titre">Mode hors connexion détecté</div>
      <div class="kta-modal-texte">
        Impossible de joindre Internet.<br><br>
        Si tu vides le cache maintenant, l'application sera inutilisable.<br><br>
        <strong>Mais bon, chacun ses choix de vie.</strong>
      </div>
      <div class="kta-modal-actions">
        <button class="kta-btn kta-btn-danger" id="offline-continuer">
          Je suis très con et je continue
        </button>
        <button class="kta-btn kta-btn-ghost" id="offline-annuler">
          Oups, j'annule
        </button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  document.getElementById("offline-annuler").addEventListener("click", function () {
    overlay.remove();
  });

  document.getElementById("offline-continuer").addEventListener("click", function () {
    overlay.remove();
    callbackContinuer();
  });
}




// =========================
// VIDER LE CACHE APPLICATIF
// =========================
function viderCacheAppli() {
  const cfgModal = document.getElementById("kta-cfg-modal");
  if (cfgModal) cfgModal.remove();

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

  document.documentElement.appendChild(overlay1);

  document.getElementById("cache-annuler-1").addEventListener("click", function () {
    overlay1.remove();
  });

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

    document.getElementById("cache-annuler-2").addEventListener("click", function () {
      overlay2.remove();
    });

    document.getElementById("cache-confirmer-2").addEventListener("click", async function () {
      overlay2.remove();

      const okInternet = await verifierConnexionInternet(5000);

      if (!okInternet) {
        afficherConfirmationOffline(function () {
          executerVidageCache();
        });
        return;
      }

      executerVidageCache();
    });
  });
}
// =========================
// EXÉCUTION RÉELLE DU RESET CACHE
// =========================
async function executerVidageCache() {
  const overlayWait = document.createElement("div");
  overlayWait.className = "kta-modal-overlay";
  overlayWait.innerHTML = `
    <div class="kta-modal">
      <div class="kta-modal-icon">⏳</div>
      <div class="kta-modal-titre">Nettoyage en cours…</div>
      <div class="kta-modal-texte">
        Suppression des caches et désinscription du Service Worker.
      </div>
    </div>
  `;
  document.documentElement.appendChild(overlayWait);

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    overlayWait.remove();
    window.location.reload(true);

  } catch (err) {
    overlayWait.remove();

    const overlayErr = document.createElement("div");
    overlayErr.className = "kta-modal-overlay";
    overlayErr.innerHTML = `
      <div class="kta-modal">
        <div class="kta-modal-icon">❌</div>
        <div class="kta-modal-titre">Erreur</div>
        <div class="kta-modal-texte">
          Impossible de vider le cache :<br>${err.message || err}
        </div>
        <div class="kta-modal-actions">
          <button class="kta-btn kta-btn-primary" id="cache-err-ok">OK</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlayErr);

    document.getElementById("cache-err-ok").addEventListener("click", function () {
      overlayErr.remove();
    });
  }
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
function initInterface() {
  console.log("initInterface appelé");
  if (window.interfaceInitialized) return;
  window.interfaceInitialized = true;

  L.control.titleControl().addTo(window.map);

  // ---------- BLOC INFOS ----------
  // Ordre : ❓ 📖 📦 🗂️ ⚙️ 🗺️
  const infosControl = L.control({ position: "topright" });
  infosControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnHelp       = L.DomUtil.create("a", "", div);
    const btnReadme     = L.DomUtil.create("a", "", div);
    const btnPlanner    = L.DomUtil.create("a", "", div);
    const btnChangePlan = L.DomUtil.create("a", "", div);
    const btnSettings   = L.DomUtil.create("a", "", div);
    const btnLegende    = L.DomUtil.create("a", "", div);

    btnHelp.innerHTML       = "❓"; btnHelp.href       = "javascript:void(0)"; btnHelp.title       = "Aide";
    btnReadme.innerHTML     = "📖"; btnReadme.href     = "javascript:void(0)"; btnReadme.title     = "Documentation";
    btnPlanner.innerHTML    = "📦"; btnPlanner.href    = "javascript:void(0)"; btnPlanner.title    = "Créer un nouveau plan";
    btnChangePlan.innerHTML = "🗂️"; btnChangePlan.href = "javascript:void(0)"; btnChangePlan.title = "Changer de plan";
    btnSettings.innerHTML   = "⚙️"; btnSettings.href   = "javascript:void(0)"; btnSettings.title   = "Réglages";
    btnLegende.innerHTML    = "🗺️"; btnLegende.href    = "javascript:void(0)"; btnLegende.title    = "Légende";

    L.DomEvent.on(btnHelp,       "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); afficherAide(); });
    L.DomEvent.on(btnReadme,     "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); afficherReadme(); });
    L.DomEvent.on(btnPlanner,    "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); afficherPlanner(); });
    L.DomEvent.on(btnChangePlan, "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); afficherPopupChangerPlan(); });
    L.DomEvent.on(btnSettings,   "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); afficherConfig(); });
    L.DomEvent.on(btnLegende,    "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); afficherLegende(); });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  infosControl.addTo(window.map);

  // ---------- BLOC TRACKING ----------
  const trackingControl = L.control({ position: "topright" });
  trackingControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnTrack = L.DomUtil.create("a", "", div);
    btnTrack.innerHTML = "▶️"; btnTrack.href = "javascript:void(0)"; btnTrack.title = "Démarrer / arrêter le tracking";

    const btnRecal = L.DomUtil.create("a", "", div);
    btnRecal.innerHTML = "📍"; btnRecal.href = "javascript:void(0)"; btnRecal.title = "Mode recalage";

    let isTracking = false;

    L.DomEvent.on(btnTrack, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      if (!isTracking) { requestPermission(); startTracking(); btnTrack.innerHTML = "⏹️"; }
      else { stopTracking(); btnTrack.innerHTML = "▶️"; }
      isTracking = !isTracking;
    });

    L.DomEvent.on(btnRecal, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      if (typeof modeRecalage === "undefined") return;
      _activerMode("recalage", btnRecal,
        function () { modeRecalage = true; },
        function () { modeRecalage = false; }
      );
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
    btnMeasure.innerHTML = "📏"; btnMeasure.href = "javascript:void(0)"; btnMeasure.title = "Activer la mesure";

    const btnResetMeasure = L.DomUtil.create("a", "", div);
    btnResetMeasure.innerHTML = "❌"; btnResetMeasure.href = "javascript:void(0)"; btnResetMeasure.title = "Réinitialiser la mesure";

    L.DomEvent.on(btnMeasure, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      const varMesure = typeof modeMesure !== "undefined" ? "local" : "window";
      _activerMode("mesure", btnMeasure,
        function () { if (varMesure === "local") modeMesure = true; else window.modeMesure = true; },
        function () { if (varMesure === "local") modeMesure = false; else window.modeMesure = false; }
      );
    });

    L.DomEvent.on(btnResetMeasure, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
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
    btnDownloadPlan.innerHTML = "🖼️"; btnDownloadPlan.href = "javascript:void(0)"; btnDownloadPlan.title = "Télécharger le plan";
    L.DomEvent.on(btnDownloadPlan, "click", function (e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); telechargerPlan(); });
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  imageControl.addTo(window.map);

  // ---------- BLOC ÉDITION + RESET POINTS ----------
  const editorControl = L.control({ position: "topright" });
  editorControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnEdit = L.DomUtil.create("a", "", div);
    btnEdit.innerHTML = "✏️"; btnEdit.href = "javascript:void(0)"; btnEdit.title = "Mode ajout de point";

    const btnResetEditor = L.DomUtil.create("a", "", div);
    btnResetEditor.innerHTML = "🗑️"; btnResetEditor.href = "javascript:void(0)"; btnResetEditor.title = "Effacer les points ajoutés";

    L.DomEvent.on(btnEdit, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      _activerMode("edition", btnEdit,
        function () { window.modeEdition = true; },
        function () { window.modeEdition = false; }
      );
    });

    L.DomEvent.on(btnResetEditor, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
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

    const btnPrincipal  = L.DomUtil.create("a", "", div);
    const btnSecondaire = L.DomUtil.create("a", "", div);
    const btnChemin     = L.DomUtil.create("a", "", div);
    const btnResetRoads = L.DomUtil.create("a", "", div);

    btnPrincipal.innerHTML  = "🟩"; btnPrincipal.href  = "javascript:void(0)"; btnPrincipal.title  = "Tracer une route principale";
    btnSecondaire.innerHTML = "🟪"; btnSecondaire.href = "javascript:void(0)"; btnSecondaire.title = "Tracer une route secondaire";
    btnChemin.innerHTML     = "🟨"; btnChemin.href     = "javascript:void(0)"; btnChemin.title     = "Tracer un chemin";
    btnResetRoads.innerHTML = "🧹"; btnResetRoads.href = "javascript:void(0)"; btnResetRoads.title = "Réinitialiser les tracés routes";

    function _desactiverRoute() {
      if (window.modeRoad) toggleRoadMode(window.modeRoad);
      btnPrincipal.classList.remove("kta-actif");
      btnSecondaire.classList.remove("kta-actif");
      btnChemin.classList.remove("kta-actif");
    }

    function activerRoute(type, btnCible) {
      const dejaActif = window.modeRoad === type;
      _desactiverTousLesModes();
      _desactiverRoute();
      if (dejaActif) return;
      toggleRoadMode(type);
      btnCible.classList.add("kta-actif");
      _modesActifs["road"] = { btnEl: btnCible, desactiverFn: _desactiverRoute };
    }

    L.DomEvent.on(btnPrincipal,  "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); activerRoute("principal",  btnPrincipal); });
    L.DomEvent.on(btnSecondaire, "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); activerRoute("secondaire", btnSecondaire); });
    L.DomEvent.on(btnChemin,     "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); activerRoute("chemin",     btnChemin); });

    L.DomEvent.on(btnResetRoads, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      if (!window.getRoads || window.getRoads().length === 0) return;
      _confirmerAction(
        "Effacer les tracés ?",
        "Tous les tracés de routes seront supprimés.<br>Cette action est irréversible.",
        function () { resetRoads(); }
      );
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  roadControl.addTo(window.map);

  // ---------- BLOC IMPORT / EXPORT / CONVERTISSEUR ----------
  const ioControl = L.control({ position: "topright" });
  ioControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnImport  = L.DomUtil.create("a", "", div);
    const btnExport  = L.DomUtil.create("a", "", div);
    const btnConvert = L.DomUtil.create("a", "", div);

    btnImport.innerHTML  = "📂"; btnImport.href  = "javascript:void(0)"; btnImport.title  = "Importer une session";
    btnExport.innerHTML  = "💾"; btnExport.href  = "javascript:void(0)"; btnExport.title  = "Exporter la session";
    btnConvert.innerHTML = "🔄"; btnConvert.href = "javascript:void(0)"; btnConvert.title = "Convertisseur JSON";

    L.DomEvent.on(btnImport,  "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); ouvrirImportSession(); });
    L.DomEvent.on(btnExport,  "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); telechargerSessionJSON(); });
    L.DomEvent.on(btnConvert, "click", function(e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e); afficherConvertisseur(); });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  ioControl.addTo(window.map);
}

// =========================
// LÉGENDE — modale plein écran
// =========================
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

const LEGENDE_EXCLURE = ["default", "track"];

function afficherLegende() {
  const existing = document.getElementById("kta-legende-modal");
  if (existing) { existing.remove(); return; }

  const icons = window.PLAN_CONFIG?.icons;

  const modal = document.createElement("div");
  modal.id = "kta-legende-modal";
  modal.className = "kta-readme-modal-overlay";

  let contenuIcones = "";

  if (!icons) {
    contenuIcones = `<p style="color:#8892a4; text-align:center; padding:20px;">Aucune configuration d'icônes disponible.</p>`;
  } else {
    const GROUPES = [
      { titre: "🕳️ Puits",        cles: ["pa", "pb", "pc", "pe", "ps"] },
      { titre: "⚠️ Signalétique", cles: ["salle", "chatiere", "passage", "danger", "info", "elec", "epure", "vehicule"] }
    ];

    const clesDansGroupe = GROUPES.flatMap(function(g) { return g.cles; });

    GROUPES.forEach(function(groupe) {
      const entrees = groupe.cles
        .filter(function(cle) { return icons[cle]; })
        .map(function(cle) {
          const label = LEGENDE_LABELS[cle] || cle;
          return `<div class="kta-legende-ligne">
            <img class="kta-legende-icone" src="${icons[cle]}" alt="${label}" onerror="this.style.opacity='0.3'">
            <span class="kta-legende-label">${label}</span>
          </div>`;
        }).join("");

      if (entrees) {
        contenuIcones += `<div class="kta-aide-section"><div class="kta-aide-section-titre">${groupe.titre}</div>${entrees}</div>`;
      }
    });

    const autresEntrees = Object.entries(icons)
      .filter(function(e) { return !LEGENDE_EXCLURE.includes(e[0]) && !clesDansGroupe.includes(e[0]); })
      .map(function(entry) {
        const cle = entry[0];
        const label = LEGENDE_LABELS[cle] || cle;
        return `<div class="kta-legende-ligne"><img class="kta-legende-icone" src="${entry[1]}" alt="${label}" onerror="this.style.opacity='0.3'"><span class="kta-legende-label">${label}</span></div>`;
      }).join("");

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

  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:480px;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">🗺️ Légende</span>
        <button class="kta-panneau-close" id="kta-legende-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">
        ${contenuIcones}
        ${contenuTracés}
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
window.afficherConfig        = afficherConfig;
window.appliquerConfig       = appliquerConfig;
window.resetConfig           = resetConfig;
window.viderCacheAppli       = viderCacheAppli;
window.afficherReadme        = afficherReadme;
window.afficherLegende       = afficherLegende;
window.afficherConvertisseur = afficherConvertisseur;
window.initInterface         = initInterface;
