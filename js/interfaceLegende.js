/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE LÉGENDE — Modale plein écran avec sections groupées
// =========================
// 🆕 v1.31.0 (P3 Lot 3 — découpe interface.js) : module extrait de
// js/interface.js (lignes 8561-9009 avant extraction) pour réduire
// le volume du fichier principal.
//
// Aucun changement de comportement runtime. La fonction `afficherLegende`
// est exposée via `window.afficherLegende = afficherLegende;` en fin
// de fichier (pattern identique à v1.30.1).
//
// 📋 API publique :
//   - window.afficherLegende()
//        → Toggle ouverture/fermeture de la modale Légende plein écran.
//          Affiche les 4 sections : 🕳️ Icônes (groupées par catégorie
//          + Autres + Custom), 🛣️ Tracés, ⬛ Zones, 🏛️ Structures.
//          Bouton ✏️ Modifier ouvre LegendCustomization.ouvrirEditeur
//          si disponible. Cascade libellés : session > plan > LEGENDE_LABELS
//          (fallback hardcodé historique).
//
// 🔌 Dépendances externes :
//   - window.PLAN_CONFIG.icons         [config.js / plan-config.json]
//   - window.LegendCustomization       [legendCustomization.js]
//        - .getLabel(cat, key)
//        - .isVisible(cat, key)
//        - .listCustomEntries(cat)
//        - .ouvrirEditeur({onChange})
//   - window._iconMap                  [map.js]
//   - window.iconeDefault              [map.js]
//
// 📍 Ordre de chargement (cf index.html) :
//   - Doit charger APRÈS interface.js (ordre cosmétique, les fonctions
//     sont appelées au runtime via clic sidebar).

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
  // 🆕 v1.59.0 — Portail (liaison inter-plan)
  portail:  "Portail (liaison inter-plan)",
  track:    "Position du tracker",
  default:  "Point sans tag (défaut)",
  // 🆕 v1.41.0 D — Point d'entrée du plan (Vue OSM × Mode Secours).
  entree_plan: "Point d'entrée du plan"
};

// Tag default → label spécial (pas dans la config par défaut)

function afficherLegende() {
  const existing = document.getElementById("kta-legende-modal");
  if (existing) { existing.remove(); return; }

  const icons = window.PLAN_CONFIG?.icons;
  const LC = window.LegendCustomization;

  const modal = document.createElement("div");
  modal.id = "kta-legende-modal";
  modal.className = "kta-readme-modal-overlay";

  // 🆕 v1.16.0 step 2 : libellé résolu via LegendCustomization si dispo.
  // Cascade session > plan > LEGENDE_LABELS (fallback hardcodé historique).
  function _label(cat, key) {
    if (LC) return LC.getLabel(cat, key);
    // Pas de LegendCustomization : libellé via i18n (clé legendui.label.<key>),
    // fallback FR hardcodé historique (LEGENDE_LABELS), sinon la clé brute.
    if (cat === "icones" && window.I18n && window.I18n.has("legendui.label." + key)) {
      return window.I18n.t("legendui.label." + key);
    }
    return LEGENDE_LABELS[key] || key;
  }
  function _visible(cat, key) {
    if (LC) return LC.isVisible(cat, key);
    return true;
  }

  let contenuIcones = "";

  // Helper pour générer une ligne d'icône
  function ligneIcone(cle, url) {
    const label = _label("icones", cle);
    return `<div class="kta-legende-ligne">
      <img class="kta-legende-icone" src="${url}" alt="${label}" onerror="this.style.opacity='0.3'">
      <span class="kta-legende-label">${label}</span>
    </div>`;
  }

  if (!icons) {
    contenuIcones = `<p style="color:#8892a4; text-align:center; padding:20px;">${window.I18n.t("legendui.icons.empty")}</p>`;
  } else {
    const GROUPES = [
      { titre: window.I18n.t("legendui.group.wells"),   cles: ["pa", "pb", "pc", "pe", "ps"] },
      { titre: window.I18n.t("legendui.group.access"),  cles: ["peo", "pef", "eso", "esf", "cao", "caf"] },
      { titre: window.I18n.t("legendui.group.signage"), cles: ["salle", "chatiere", "passage", "danger", "info", "elec", "epure", "vehicule", "plaque", "portail"] },
      // 🆕 v1.41.0 D — Catégorie Secours (Vue OSM × Mode Secours).
      { titre: window.I18n.t("legendui.group.rescue"),  cles: ["entree_plan"] }
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

    // Sections groupées (filtrage par visibilité LC v1.16.0 step 2)
    GROUPES.forEach(function(groupe) {
      const entrees = groupe.cles
        .map(function(cle) {
          if (!_visible("icones", cle)) return null;
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
      .filter(function(cle) { return _visible("icones", cle); })
      .sort()
      .map(function(cle) { return ligneIcone(cle, getIconUrl(cle)); })
      .join("");

    if (autresEntrees) {
      contenuIcones += `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.group.others")}</div>${autresEntrees}</div>`;
    }

    // 🆕 v1.16.0 step 2 : entrées custom catégorie « icones » ajoutées par
    // l'user (cascade plan + session). Affichées si visibles et iconUrl set.
    if (LC) {
      const customsIcones = LC.listCustomEntries("icones")
        .filter(function(e) { return e.visible && e.iconUrl; });
      if (customsIcones.length > 0) {
        const html = customsIcones.map(function(e) {
          return `<div class="kta-legende-ligne">
            <img class="kta-legende-icone" src="${e.iconUrl}" alt="${e.label}" onerror="this.style.opacity='0.3'">
            <span class="kta-legende-label">${e.label}</span>
          </div>`;
        }).join("");
        contenuIcones += `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.group.custom")}</div>${html}</div>`;
      }
    }
  }

  // 🪜 v169 (Karma_dev) : ajout de Jonction interniveau (magenta) — type
  // conditionnel multi-niveau, présenté dans la légende même sans multiLevel
  // car cohérence avec la légende exportée PNG.
  // 🆕 v1.16.0 step 2 : libellés via LegendCustomization + filtre isVisible.
  // 🎨 v1.76.0 — les pastilles ne portent plus leurs couleurs en dur : elles
  // les demandent au styleResolver. C'était LE risque structurel de ce module —
  // cette légende décrivait la carte avec sa propre table, indépendante de
  // celle du rendu. Elles coïncidaient par chance ; le jour où l'une bougeait,
  // la légende mentait sur la carte sans qu'aucun test ne le voie.
  // `_couleurTrait` / `_couleurFond` retombent sur un gris neutre si le type
  // est introuvable — mieux vaut une pastille terne qu'une couleur inventée.
  function _resolu(cat, key) {
    return (typeof window.ktaResolveStyle === "function")
             ? window.ktaResolveStyle(cat, key, { flat: true }) : null;
  }
  function _couleurTrait(cat, key) { const s = _resolu(cat, key); return (s && s.color) || "#888888"; }
  function _couleurFond(cat, key)  { const s = _resolu(cat, key); return (s && s.fillColor) || "#888888"; }

  function _ligneTrace(key) {
    if (!_visible("traces", key)) return "";
    return `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${_couleurTrait("traces", key)};"></span><span class="kta-legende-label">${_label("traces", key)}</span></div>`;
  }
  let contenuTracés = `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.section.traces")}</div>`;
  contenuTracés += _ligneTrace("principal");
  contenuTracés += _ligneTrace("secondaire");
  contenuTracés += _ligneTrace("chemin");
  contenuTracés += _ligneTrace("jonction");
  // Customs traces (lineColor obligatoire)
  if (LC) {
    LC.listCustomEntries("traces")
      .filter(function(e) { return e.visible && (e.lineColor || e.fillColor); })
      .forEach(function(e) {
        contenuTracés += `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${e.lineColor || e.fillColor};"></span><span class="kta-legende-label">${e.label}</span></div>`;
      });
  }
  contenuTracés += `</div>`;

  // 🚫 v169 (Karma_dev) : Inaccessible (hachures rouge/noir).
  function _ligneZone(key) {
    if (!_visible("zones", key)) return "";
    return `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${_couleurFond("zones", key)}; opacity:0.7; height:14px; border:2px solid ${_couleurTrait("zones", key)};"></span><span class="kta-legende-label">${_label("zones", key)}</span></div>`;
  }
  let contenuZones = `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.section.zones")}</div>`;
  contenuZones += _ligneZone("eau");
  contenuZones += _ligneZone("remblais");
  contenuZones += _ligneZone("effondrement");
  // Inaccessible a un fond hachuré custom — handled inline (pas via _ligneZone)
  if (_visible("zones", "inaccessible")) {
    contenuZones += `<div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:repeating-linear-gradient(45deg, ${_couleurTrait("zones","inaccessible")} 0 6px, #1a1f2e 6px 10px); height:14px; border:2px solid ${_couleurTrait("zones","inaccessible")};"></span>
        <span class="kta-legende-label">${_label("zones", "inaccessible")}</span>
      </div>`;
  }
  // Customs zones
  if (LC) {
    LC.listCustomEntries("zones")
      .filter(function(e) { return e.visible && e.fillColor; })
      .forEach(function(e) {
        const border = e.borderColor || e.fillColor;
        contenuZones += `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${e.fillColor}; opacity:0.7; height:14px; border:2px solid ${border};"></span><span class="kta-legende-label">${e.label}</span></div>`;
      });
  }
  contenuZones += `</div>`;

  // 🏛️ v1.10.3 — Structures. Polygones (fillColor + borderColor) + polylines (lineColor).
  function _ligneStructPoly(key) {
    if (!_visible("structures", key)) return "";
    return `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${_couleurFond("structures", key)}; opacity:0.85; height:14px; border:2px solid ${_couleurTrait("structures", key)};"></span><span class="kta-legende-label">${_label("structures", key)}</span></div>`;
  }
  function _ligneStructLine(key) {
    if (!_visible("structures", key)) return "";
    return `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${_couleurTrait("structures", key)};"></span><span class="kta-legende-label">${_label("structures", key)}</span></div>`;
  }
  let contenuStructures = `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.section.structures")}</div>`;
  contenuStructures += _ligneStructPoly("pilier-1");
  contenuStructures += _ligneStructPoly("pilier-2");
  contenuStructures += _ligneStructPoly("mur");
  contenuStructures += _ligneStructLine("front-1");
  contenuStructures += _ligneStructLine("front-2");
  // Customs structures
  // 🐛 v1.16.0 step2-drawable-fix : utilise GEOMETRY comme discriminator
  // (au lieu de "lineColor first") — sinon une entrée polygon avec
  // lineColor stocké en accident apparaissait comme trait dans la légende
  // EN PLUS du polygone sur la carte → KARMA voyait les deux représentations.
  if (LC) {
    LC.listCustomEntries("structures")
      .filter(function(e) { return e.visible && (e.lineColor || e.fillColor); })
      .forEach(function(e) {
        const isLine = (e.geometry === "polyline") || (!e.geometry && e.lineColor && !e.fillColor);
        if (isLine) {
          const col = e.lineColor || e.fillColor;
          contenuStructures += `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${col};"></span><span class="kta-legende-label">${e.label}</span></div>`;
        } else {
          const fill   = e.fillColor || e.lineColor;
          const border = e.borderColor || e.lineColor || fill;
          contenuStructures += `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${fill}; opacity:0.85; height:14px; border:2px solid ${border};"></span><span class="kta-legende-label">${e.label}</span></div>`;
        }
      });
  }
  contenuStructures += `</div>`;

  // 🆕 v1.16.0 step 2 : bouton « ✏️ Modifier » dans le header (à gauche du
  // close). Ouvre LegendCustomization.ouvrirEditeur — au clic terminé,
  // l'éditeur appelle onChange qui re-render la modale Légende pour que
  // les renommages/visibilités/customs apparaissent immédiatement.
  // Disponible uniquement si LegendCustomization est chargé.
  const btnModifier = LC
    ? '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kta-legende-modifier" type="button" style="margin-right:8px;" title="' + window.I18n.t("legendui.edit.title") + '">' + window.I18n.t("legendui.edit.btn") + '</button>'
    : '';

  // 🆕 v1.9.2-fix13 : retrait du style inline `max-width:480px` qui
  // bloquait l'agrandissement PC. La modale utilise désormais les tailles
  // standard de .kta-readme-modal-boite (mobile : min(960px, 96vw),
  // PC : 1400px / 1700px / 2000px selon le palier — cf. style.css).
  // Sur mobile la légende reste lisible (96vw), sur PC elle profite
  // de l'espace pour afficher plus de groupes en parallèle si besoin.
  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-legende-modal-boite">
      <div class="kta-readme-modal-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span class="kta-readme-modal-titre">${window.I18n.t("legendui.modal.titre")}</span>
        <div style="display:flex; align-items:center; gap:4px;">
          ${btnModifier}
          <button class="kta-panneau-close" id="kta-legende-close">✕</button>
        </div>
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

  // 🆕 v1.16.0 step 2 : bouton « ✏️ Modifier » → ouvre l'éditeur. À chaque
  // change dans l'éditeur, on rafraîchit UNIQUEMENT le contenu (.kta-legende-corps)
  // sans recréer la modale entière — sinon l'éditeur ouvert par-dessus
  // pointerait vers un ancien DOM, et le bouton Modifier de la nouvelle
  // modale toggle-fermerait l'éditeur au prochain clic. Refresh in-place
  // = expérience continue, éditeur reste ouvert au-dessus.
  if (LC) {
    const btnMod = document.getElementById("kta-legende-modifier");
    if (btnMod) {
      btnMod.addEventListener("click", function() {
        LC.ouvrirEditeur({
          onChange: function() {
            // Refresh in-place : recalcule le HTML du corps avec les
            // libellés/visibilités/customs frais et l'injecte dans le
            // <div class="kta-legende-corps"> existant.
            const corps = modal.querySelector(".kta-legende-corps");
            if (!corps) return;
            const freshContent = _construireContenuLegende();
            corps.innerHTML = freshContent;
          }
        });
      });
    }
  }

  // Helper local — extraction du contenu courant des 4 sections pour le
  // refresh in-place. Recalcule en lisant LC à l'instant T (= post-change).
  function _construireContenuLegende() {
    // Re-utilise les variables de closure (contenuIcones, contenuTracés,
    // contenuZones, contenuStructures) ? Non, elles ont été figées au
    // build initial. On re-construit tout à partir des helpers _label /
    // _visible qui lisent LC à chaud.
    let html = "";

    // ── Icônes ──
    let icx = "";
    if (!icons) {
      icx = `<p style="color:#8892a4; text-align:center; padding:20px;">${window.I18n.t("legendui.icons.empty")}</p>`;
    } else {
      const GROUPES2 = [
        { titre: window.I18n.t("legendui.group.wells"),   cles: ["pa", "pb", "pc", "pe", "ps"] },
        { titre: window.I18n.t("legendui.group.access"),  cles: ["peo", "pef", "eso", "esf", "cao", "caf"] },
        { titre: window.I18n.t("legendui.group.signage"), cles: ["salle", "chatiere", "passage", "danger", "info", "elec", "epure", "vehicule", "plaque", "portail"] },
        // 🆕 v1.41.0 D — Catégorie Secours.
        { titre: window.I18n.t("legendui.group.rescue"),  cles: ["entree_plan"] }
      ];
      const clesGroupees2 = GROUPES2.flatMap(function(g) { return g.cles; });
      function urlPourCle2(cle) {
        if (icons[cle]) return icons[cle];
        const iconObj = window._iconMap?.[cle];
        if (!iconObj) return null;
        return iconObj._kta_iconUrl || (iconObj.options && iconObj.options.iconUrl) || null;
      }
      function ligneIcone2(cle, url) {
        const label = _label("icones", cle);
        return `<div class="kta-legende-ligne">
          <img class="kta-legende-icone" src="${url}" alt="${label}" onerror="this.style.opacity='0.3'">
          <span class="kta-legende-label">${label}</span>
        </div>`;
      }
      GROUPES2.forEach(function(groupe) {
        const entrees = groupe.cles
          .map(function(cle) {
            if (!_visible("icones", cle)) return null;
            const url = urlPourCle2(cle);
            if (!url) return null;
            return ligneIcone2(cle, url);
          })
          .filter(Boolean)
          .join("");
        if (entrees) icx += `<div class="kta-aide-section"><div class="kta-aide-section-titre">${groupe.titre}</div>${entrees}</div>`;
      });
      function getIconUrl2(cle) {
        const iconObj = window._iconMap?.[cle] || (cle === "default" ? window.iconeDefault : null);
        if (iconObj) {
          if (iconObj._kta_iconUrl) return iconObj._kta_iconUrl;
          if (iconObj.options && iconObj.options.iconUrl) return iconObj.options.iconUrl;
          if (typeof iconObj._getIconUrl === "function") {
            try { return iconObj._getIconUrl("icon"); } catch(e) {}
          }
          return "lib/leaflet/images/marker-icon.png";
        }
        return (icons || {})[cle];
      }
      const tousLesTags2 = new Set(Object.keys(icons || {}));
      if (window._iconMap) Object.keys(window._iconMap).forEach(function(t) { tousLesTags2.add(t); });
      const autresEntrees2 = Array.from(tousLesTags2)
        .filter(function(cle) { return !clesGroupees2.includes(cle); })
        .filter(function(cle) { return _visible("icones", cle); })
        .sort()
        .map(function(cle) { return ligneIcone2(cle, getIconUrl2(cle)); })
        .join("");
      if (autresEntrees2) icx += `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.group.others")}</div>${autresEntrees2}</div>`;
      if (LC) {
        const cs = LC.listCustomEntries("icones").filter(function(e) { return e.visible && e.iconUrl; });
        if (cs.length > 0) {
          icx += `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.group.custom")}</div>` +
                 cs.map(function(e) { return `<div class="kta-legende-ligne"><img class="kta-legende-icone" src="${e.iconUrl}" alt="${e.label}" onerror="this.style.opacity='0.3'"><span class="kta-legende-label">${e.label}</span></div>`; }).join("") +
                 `</div>`;
        }
      }
    }
    html += icx;

    // ── Tracés ──
    let trx = `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.section.traces")}</div>`;
    trx += _ligneTrace("principal");
    trx += _ligneTrace("secondaire");
    trx += _ligneTrace("chemin");
    trx += _ligneTrace("jonction");
    if (LC) {
      LC.listCustomEntries("traces")
        .filter(function(e) { return e.visible && (e.lineColor || e.fillColor); })
        .forEach(function(e) {
          trx += `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${e.lineColor || e.fillColor};"></span><span class="kta-legende-label">${e.label}</span></div>`;
        });
    }
    trx += `</div>`;
    html += trx;

    // ── Zones ──
    let zx = `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.section.zones")}</div>`;
    zx += _ligneZone("eau");
    zx += _ligneZone("remblais");
    zx += _ligneZone("effondrement");
    if (_visible("zones", "inaccessible")) {
      zx += `<div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:repeating-linear-gradient(45deg, ${_couleurTrait("zones","inaccessible")} 0 6px, #1a1f2e 6px 10px); height:14px; border:2px solid ${_couleurTrait("zones","inaccessible")};"></span>
        <span class="kta-legende-label">${_label("zones", "inaccessible")}</span>
      </div>`;
    }
    if (LC) {
      LC.listCustomEntries("zones")
        .filter(function(e) { return e.visible && e.fillColor; })
        .forEach(function(e) {
          const border = e.borderColor || e.fillColor;
          zx += `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${e.fillColor}; opacity:0.7; height:14px; border:2px solid ${border};"></span><span class="kta-legende-label">${e.label}</span></div>`;
        });
    }
    zx += `</div>`;
    html += zx;

    // ── Structures ──
    let sx = `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.section.structures")}</div>`;
    sx += _ligneStructPoly("pilier-1");
    sx += _ligneStructPoly("pilier-2");
    sx += _ligneStructPoly("mur");
    sx += _ligneStructLine("front-1");
    sx += _ligneStructLine("front-2");
    if (LC) {
      // 🐛 v1.16.0 step2-drawable-fix : geometry first
      LC.listCustomEntries("structures")
        .filter(function(e) { return e.visible && (e.lineColor || e.fillColor); })
        .forEach(function(e) {
          const isLine = (e.geometry === "polyline") || (!e.geometry && e.lineColor && !e.fillColor);
          if (isLine) {
            const col = e.lineColor || e.fillColor;
            sx += `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${col};"></span><span class="kta-legende-label">${e.label}</span></div>`;
          } else {
            const fill   = e.fillColor || e.lineColor;
            const border = e.borderColor || e.lineColor || fill;
            sx += `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${fill}; opacity:0.85; height:14px; border:2px solid ${border};"></span><span class="kta-legende-label">${e.label}</span></div>`;
          }
        });
    }
    sx += `</div>`;
    html += sx;

    return html;
  }
}

// Export window (identique à interface.js v1.30.1)
window.afficherLegende = afficherLegende;
