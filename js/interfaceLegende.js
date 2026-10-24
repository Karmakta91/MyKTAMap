/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE LÉGENDE — modale ≡ Légende plein écran
// =========================
// Expose window.afficherLegende() (bascule, plan chargé) : 🕳️ Icônes (par catégorie + Autres + custom),
// 🛣️ Tracés, ⬛ Zones, 🏛️ Structures, bandeau des types orphelins, ✏️ Modifier → LegendCustomization.ouvrirEditeur.
// Expose window.ktaLegendeLectureSeule(opts) : la MÊME légende sans rien de modifiable (Vue OSM, carte OSM de
// l'accueil) ; opts.plan = légende d'un plan NON chargé (_sourcePlanDonnees), opts.avertissement = texte.
// Libellés : session > plan > LEGENDE_LABELS (repli si LegendCustomization manque).
// Dépend de : PLAN_CONFIG.icons, LegendCustomization, _iconMap / _ktaBuiltinIconUrls / iconeDefault (map.js),
//   ktaResolveStyle (couleurs des pastilles).
// 🩸 Un seul constructeur du corps (_ktaLegendeCorps) : deux copies ont déjà divergé (rendu initial ≠ rafraîchi).
// Garde-fous : scripts/check-icon-catalog.js (LEGENDE_LABELS, GROUPES), scripts/check-style-canon.js

// ── Légende : modale plein écran ──────────
const LEGENDE_LABELS = {
  salle:    "Salle",
  pa:       "Puits Aération",
  pc:       "Puits Comblé",
  pb:       "Puits Bouché",
  pe:       "Puits au sol / Bassin",
  ps:       "Puits extraction",
  psf:      "Puits extraction fermé",
  peo:      "Puits à échelon ouvert",
  pef:      "Puits à échelon fermé",
  eso:      "Escalier service ouvert",
  esf:      "Escalier service fermé",
  cao:      "Cavage ouvert",
  caf:      "Cavage fermé",
  jes:      "Escalier entre niveaux",
  jpe:      "Puits à échelons entre niveaux",
  jps:      "Puits sans échelon entre niveaux",
  vehicule: "Véhicule",
  elec:     "Électricité",
  epure:    "Épure",
  info:     "Information",
  chatiere: "Chatière",
  passage:  "Passage",
  danger:   "Danger",
  plaque:   "Plaque indication",
  portail:  "Portail (liaison inter-plan)",
  track:    "Position du tracker",
  default:  "Point sans tag (défaut)",
  // Point d'entrée du plan (Vue OSM × Mode Secours).
  entree_plan: "Point d'entrée du plan"
};

// Tag default : libellé spécial (absent de la config par défaut).

// Groupes d'icônes de la légende (ordre d'affichage) ; titres traduits au rendu.
function _ktaLegendeGroupes() {
  const GROUPES = [
    { titre: window.I18n.t("legendui.group.wells"),   cles: ["pa", "pb", "pc", "pe", "ps", "psf"] },
    { titre: window.I18n.t("legendui.group.access"),  cles: ["peo", "pef", "eso", "esf", "cao", "caf"] },
    { titre: window.I18n.t("legendui.group.levels"),  cles: ["jes", "jpe", "jps"] },
    { titre: window.I18n.t("legendui.group.signage"), cles: ["salle", "chatiere", "passage", "danger", "info", "elec", "epure", "vehicule", "plaque", "portail"] },
    // Catégorie Secours (Vue OSM × Mode Secours).
    { titre: window.I18n.t("legendui.group.rescue"),  cles: ["entree_plan"] }
  ];
  return GROUPES;
}

// ── Sources : ce qu'il faut savoir d'UN plan pour dessiner sa légende ──────────
// { icons (plan-config > icons, null = message « vide »), urlGroupe(tag), urlAutre(tag), tags[], multiLevel }.
// Plan chargé : état live (PLAN_CONFIG, _iconMap, APP_CONFIG).
function _sourcePlanCharge() {
  const icons = window.PLAN_CONFIG?.icons || null;
  // URL d'une clé groupée : plan-config, sinon _iconMap (`_kta_iconUrl` pour les divIcon de scaledMarkers).
  function urlGroupe(cle) {
    if (icons && icons[cle]) return icons[cle];
    const iconObj = window._iconMap?.[cle];
    if (!iconObj) return null;
    return iconObj._kta_iconUrl || (iconObj.options && iconObj.options.iconUrl) || null;
  }
  // URL réellement utilisée par Leaflet pour un tag hors groupe.
  function urlAutre(cle) {
    const iconObj = window._iconMap?.[cle] || (cle === "default" ? window.iconeDefault : null);
    if (iconObj) {
      // divIcon (scaledMarkers) : options.iconUrl n'existe pas, `_kta_iconUrl` si.
      if (iconObj._kta_iconUrl) return iconObj._kta_iconUrl;
      if (iconObj.options && iconObj.options.iconUrl) return iconObj.options.iconUrl;
      // L.Icon.Default natif : sa méthode interne.
      if (typeof iconObj._getIconUrl === "function") {
        try { return iconObj._getIconUrl("icon"); } catch(e) {}
      }
      return window._ktaIconeDefaut || "icon/default.png";
    }
    return (icons || {})[cle];
  }
  const tags = new Set(Object.keys(icons || {}));
  if (window._iconMap) Object.keys(window._iconMap).forEach(function(t) { tags.add(t); });
  return {
    icons: icons, urlGroupe: urlGroupe, urlAutre: urlAutre, tags: Array.from(tags),
    multiLevel: !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true)
  };
}

// Plan NON chargé (carte OSM de l'accueil) : ce que l'accueil a déjà extrait pour lui — config, icônes résolues
// (tag → URL) — sans recharger le plan. d = { config, iconUrls, multiLevel }.
// 🩸 Complété par le catalogue built-in (`_ktaBuiltinIconUrls`) et l'icône par défaut, comme map.js remplit
// _iconMap : un plan serveur n'apporte que ses `config.icons`, et ses groupes Accès / Secours disparaissaient.
function _sourcePlanDonnees(d) {
  const cfg = (d && d.config) || {};
  const urls = Object.assign({}, window._ktaBuiltinIconUrls || {},
    { "default": window._ktaIconeDefaut || "icon/default.png" }, (d && d.iconUrls) || {});
  const url = function(cle) { return urls[cle] || (cfg.icons || {})[cle] || null; };
  return {
    icons: cfg.icons ? urls : null, urlGroupe: url, urlAutre: url,
    tags: Array.from(new Set(Object.keys(cfg.icons || {}).concat(Object.keys(urls)))),
    multiLevel: !!(d && d.multiLevel)
  };
}

// Corps des 4 sections (et du bandeau des orphelins), lu à l'instant T dans `src` et LegendCustomization.
// opts.lectureSeule : ni bandeau des orphelins (son « ➕ Lier » modifie la légende) ni rien de cliquable.
function _ktaLegendeCorps(src, opts) {
  const LC = window.LegendCustomization;
  const lectureSeule = !!(opts && opts.lectureSeule);
  const icons = src.icons;
  function _escHtml(s) { return window.ktaEsc(s); }

  // Cascade session > plan > LEGENDE_LABELS.
  function _label(cat, key) {
    if (LC) return LC.getLabel(cat, key);
    // Sans LegendCustomization : i18n (legendui.label.<key>), puis LEGENDE_LABELS, sinon la clé brute.
    if (cat === "icones" && window.I18n && window.I18n.has("legendui.label." + key)) {
      return window.I18n.t("legendui.label." + key);
    }
    return LEGENDE_LABELS[key] || key;
  }
  function _visible(cat, key) {
    if (LC) return LC.isVisible(cat, key);
    return true;
  }

  // Types orphelins : objets dont le type custom n'existe dans aucune légende (sinon blancs/gris sans ligne
  // ici, invisibles là où l'on cherche la réponse). Le bandeau nomme les types et compte les objets.
  function _bandeauOrphelins() {
    if (lectureSeule) return "";
    if (!LC || typeof LC.listOrphanTypes !== "function") return "";
    let orphelins;
    try { orphelins = LC.listOrphanTypes(); } catch(e) { return ""; }
    if (!orphelins || !orphelins.length) return "";
    const totalObjets = orphelins.reduce(function(s, o) { return s + o.nb; }, 0);
    // « ➕ Lier » ouvre la dialog d'ajout PRÉ-REMPLIE avec l'id EXACT du type (catégorie verrouillée) : recréer
    // l'entrée à la main donnerait un id neuf qui ne se lie jamais. L'id n'est jamais montré ni saisi.
    // Une LIGNE par type (flex + wrap) : un nowrap ferait déborder le bouton de la colonne étroite ; les ids
    // longs (`cust-…`) cassent par word-break.
    const details = orphelins.map(function(o) {
      return '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin:3px 0;">' +
             '<code style="font-size:11px; word-break:break-all; min-width:0;">' + _escHtml(o.type) + '</code>' +
             '<span style="color:var(--kta-texte-3);">(' + o.nb + ')</span>' +
             '<button type="button" class="kta-orphan-link" data-otype="' + _escHtml(o.type) + '" data-ocat="' + o.categorie + '"' +
             ' style="font-size:11px; padding:1px 6px; cursor:pointer; background:transparent; border:1px solid rgba(140,180,255,0.4); color:var(--kta-interaction); border-radius:4px; flex:0 0 auto;">➕ ' +
             window.I18n.t("legendui.orphans.lier") + '</button></div>';
    }).join("");
    return `<div style="border:1px solid rgba(255,120,80,0.5); background:rgba(255,120,80,0.08); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:12px; line-height:1.5; color:var(--kta-texte);">
        ⚠️ ${window.I18n.t("legendui.orphans.intro", { objets: totalObjets, types: orphelins.length })}
        ${details}
        <span style="color:var(--kta-texte-3);">${window.I18n.t("legendui.orphans.aide")}</span>
      </div>`;
  }

  function ligneIcone(cle, url) {
    const label = _label("icones", cle);
    // Pas de onerror inline : échec géré par délégation en capture (cf repli d'icône, _ouvrirLegende).
    return `<div class="kta-legende-ligne">
      <img class="kta-legende-icone" src="${url}" alt="${label}" data-kta-tag="${cle}">
      <span class="kta-legende-label">${label}</span>
    </div>`;
  }

  let contenuIcones = "";
  if (!icons) {
    contenuIcones = `<p style="color:var(--kta-texte-3); text-align:center; padding:20px;">${window.I18n.t("legendui.icons.empty")}</p>`;
  } else {
    const groupes = _ktaLegendeGroupes();
    const clesGroupees = groupes.flatMap(function(g) { return g.cles; });

    // Sections groupées, filtrées par visibilité.
    groupes.forEach(function(groupe) {
      const entrees = groupe.cles
        .map(function(cle) {
          if (!_visible("icones", cle)) return null;
          const url = src.urlGroupe(cle);
          if (!url) return null;
          return ligneIcone(cle, url);
        })
        .filter(Boolean)
        .join("");
      if (entrees) {
        contenuIcones += `<div class="kta-aide-section"><div class="kta-aide-section-titre">${groupe.titre}</div>${entrees}</div>`;
      }
    });

    // « Autres » : tags non groupés (tracker, default, tags propres au plan).
    // 🩸 Les icônes custom (`cust-…`) sont aussi dans _iconMap (map.js > _enregistrerIconesCustom) : sans ce
    // filtre, chacune sortait deux fois, ici sous son id brut et dans « Custom » sous son libellé.
    const estCustom = function(cle) {
      return !!(LC && typeof LC.findCustomEntry === "function" && LC.findCustomEntry(cle));
    };
    const autresEntrees = src.tags
      .filter(function(cle) { return !clesGroupees.includes(cle) && !estCustom(cle); })
      .filter(function(cle) { return _visible("icones", cle); })
      .sort(function(a, b) { return String(a).localeCompare(String(b)); })
      .map(function(cle) { return ligneIcone(cle, src.urlAutre(cle)); })
      .join("");
    if (autresEntrees) {
      contenuIcones += `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.group.others")}</div>${autresEntrees}</div>`;
    }

    // Entrées custom « icones » (plan + session), si visibles et avec iconUrl.
    if (LC) {
      const customsIcones = LC.listCustomEntries("icones")
        .filter(function(e) { return e.visible && e.iconUrl; });
      if (customsIcones.length > 0) {
        const html = customsIcones.map(function(e) {
          return `<div class="kta-legende-ligne">
            <img class="kta-legende-icone" src="${e.iconUrl}" alt="${e.label}" data-kta-echec="0.3">
            <span class="kta-legende-label">${e.label}</span>
          </div>`;
        }).join("");
        contenuIcones += `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.group.custom")}</div>${html}</div>`;
      }
    }
  }

  // 🩸 Pas de couleurs en dur : les pastilles les demandent au styleResolver, sinon cette légende décrirait la
  // carte avec sa propre table et mentirait le jour où l'une bouge. Type introuvable → gris neutre (mieux
  // qu'une couleur inventée). Libellés via LegendCustomization + filtre isVisible.
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
  let contenuTraces = `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.section.traces")}</div>`;
  contenuTraces += _ligneTrace("principal");
  contenuTraces += _ligneTrace("secondaire");
  contenuTraces += _ligneTrace("chemin");
  // Jonction interniveau : plan multi-niveau seulement.
  if (src.multiLevel) contenuTraces += _ligneTrace("jonction");
  // Customs traces (lineColor obligatoire).
  if (LC) {
    LC.listCustomEntries("traces")
      .filter(function(e) { return e.visible && (e.lineColor || e.fillColor); })
      .forEach(function(e) {
        contenuTraces += `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${e.lineColor || e.fillColor};"></span><span class="kta-legende-label">${e.label}</span></div>`;
      });
  }
  contenuTraces += `</div>`;

  function _ligneZone(key) {
    if (!_visible("zones", key)) return "";
    return `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${_couleurFond("zones", key)}; opacity:0.7; height:14px; border:2px solid ${_couleurTrait("zones", key)};"></span><span class="kta-legende-label">${_label("zones", key)}</span></div>`;
  }
  let contenuZones = `<div class="kta-aide-section"><div class="kta-aide-section-titre">${window.I18n.t("legendui.section.zones")}</div>`;
  contenuZones += _ligneZone("eau");
  contenuZones += _ligneZone("remblais");
  contenuZones += _ligneZone("effondrement");
  // Inaccessible : fond hachuré, traité à part.
  if (_visible("zones", "inaccessible")) {
    contenuZones += `<div class="kta-legende-ligne">
        <span class="kta-legende-trait" style="background:repeating-linear-gradient(45deg, ${_couleurTrait("zones","inaccessible")} 0 6px, #1a1f2e 6px 10px); height:14px; border:2px solid ${_couleurTrait("zones","inaccessible")};"></span>
        <span class="kta-legende-label">${_label("zones", "inaccessible")}</span>
      </div>`;
  }
  if (LC) {
    LC.listCustomEntries("zones")
      .filter(function(e) { return e.visible && e.fillColor; })
      .forEach(function(e) {
        const border = e.borderColor || e.fillColor;
        contenuZones += `<div class="kta-legende-ligne"><span class="kta-legende-trait" style="background:${e.fillColor}; opacity:0.7; height:14px; border:2px solid ${border};"></span><span class="kta-legende-label">${e.label}</span></div>`;
      });
  }
  contenuZones += `</div>`;

  // Structures : polygones (fillColor + borderColor), polylines (lineColor).
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
  // Customs structures : la GÉOMÉTRIE décide de la pastille (pas « lineColor d'abord »), sinon un polygone avec
  // lineColor stocké par accident s'afficherait aussi en trait.
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

  return _bandeauOrphelins() + contenuIcones + contenuTraces + contenuZones + contenuStructures;
}

// Ouvre la modale. opts = { lectureSeule, plan?: données d'un plan non chargé, avertissement?: texte }.
// ⚠️ Lecture seule = aucun chemin vers une écriture : ni ✏️ Modifier, ni « ➕ Lier », ni écouteur qui en ouvre un.
function _ouvrirLegende(opts) {
  const existing = document.getElementById("kta-legende-modal");
  if (existing) { existing.remove(); return; }

  const LC = window.LegendCustomization;
  const lectureSeule = !!opts.lectureSeule;

  // Corps d'un plan non chargé : ses deux états de légende (session, plan) remplacent l'état live le temps du
  // rendu, pour que libellés, masquages, couleurs choisies et types `cust-…` passent par les mêmes résolveurs
  // (LegendCustomization, ktaResolveStyle) que la légende du mode plan.
  function construire() {
    if (opts.plan) {
      const src = _sourcePlanDonnees(opts.plan);
      const lg = opts.plan.legende || {};
      if (LC && typeof LC.lireAvecEtats === "function") {
        return LC.lireAvecEtats(lg.session || null, lg.plan || null, function() {
          return _ktaLegendeCorps(src, { lectureSeule: true });
        });
      }
      return _ktaLegendeCorps(src, { lectureSeule: true });
    }
    return _ktaLegendeCorps(_sourcePlanCharge(), { lectureSeule: lectureSeule });
  }

  const modal = document.createElement("div");
  modal.id = "kta-legende-modal";
  modal.className = "kta-readme-modal-overlay";
  // Au-dessus des cartes OSM (modale 99999, plein écran de l'accueil) : rang des sous-modales.
  if (lectureSeule) {
    modal.classList.add("kta-legende-lecture-seule");
    modal.style.zIndex = "100001";
  }

  // ✏️ Modifier (si LegendCustomization est chargé) : ouvre l'éditeur, dont onChange rafraîchit la modale.
  const btnModifier = (LC && !lectureSeule)
    ? '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kta-legende-modifier" type="button" style="margin-right:8px;" title="' + window.I18n.t("legendui.edit.title") + '">' + window.I18n.t("legendui.edit.btn") + '</button>'
    : '';
  // Texte posé par textContent (nom de plan fourni par l'utilisateur).
  // Hors du corps : celui-ci se répartit en colonnes sur PC (style.css), un bandeau y serait découpé.
  const bandeauLecture = lectureSeule
    ? '<div class="kta-legende-lecture-tete">' +
        '<p class="kta-legende-avertissement" id="kta-legende-avertissement" hidden></p>' +
      '</div>'
    : '';

  // Pas de max-width inline : tailles standard de .kta-readme-modal-boite (96vw mobile, paliers PC, style.css).
  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-legende-modal-boite">
      <div class="kta-readme-modal-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span class="kta-readme-modal-titre">${window.I18n.t("legendui.modal.titre")}</span>
        <div style="display:flex; align-items:center; gap:4px;">
          ${btnModifier}
          <button class="kta-panneau-close" id="kta-legende-close" type="button" aria-label="${window.ktaEsc(window.I18n.t("legendui.fermer"))}">✕</button>
        </div>
      </div>
      ${bandeauLecture}
      <div class="kta-readme-modal-corps kta-legende-corps">${construire()}</div>
    </div>
  `;
  if (lectureSeule && opts.avertissement) {
    const av = modal.querySelector("#kta-legende-avertissement");
    av.textContent = opts.avertissement;
    av.hidden = false;
  }

  document.documentElement.appendChild(modal);

  // Repli d'icône à l'échec : un tag built-in déclaré avec un chemin mort dans plan-config.json > icons gagne
  // sur l'icône intégrée (PLAN_CONFIG.icons lu en premier). À l'erreur, bascule UNE fois sur
  // `_ktaBuiltinIconUrls` (map.js), sinon opacité réduite. Délégation en CAPTURE : `error` ne bulle pas, et le
  // corps est re-rendu par innerHTML à chaque édition (un listener sur la modale survit, pas sur les <img>).
  modal.addEventListener("error", function(ev) {
    const img = ev.target;
    if (!img || !img.classList || !img.classList.contains("kta-legende-icone")) return;
    const tag = img.getAttribute("data-kta-tag");
    const repli = tag && window._ktaBuiltinIconUrls && window._ktaBuiltinIconUrls[tag];
    if (repli && img.src !== repli && !img.dataset.ktaReplied) {
      img.dataset.ktaReplied = "1";   // une seule tentative — pas de boucle si le repli échoue
      img.src = repli;
      return;
    }
    img.style.opacity = "0.3";
  }, true);

  // 🩸 Échap en CAPTURE, arrêté ici : sinon il remonte au plein écran de la carte OSM de l'accueil, qui se
  // referme sous la légende restée ouverte.
  function surEchap(e) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    e.preventDefault();
    fermer();
  }
  function fermer() {
    document.removeEventListener("keydown", surEchap, true);
    modal.remove();
  }
  if (lectureSeule) document.addEventListener("keydown", surEchap, true);
  document.getElementById("kta-legende-close").addEventListener("click", fermer);
  modal.addEventListener("click", function (e) { if (e.target === modal) fermer(); });
  if (lectureSeule) return;

  function rafraichir() {
    const corps = modal.querySelector(".kta-legende-corps");
    if (corps) corps.innerHTML = construire();
  }

  // « ➕ Lier » du bandeau orphelins (délégué : corps re-rendu par innerHTML).
  modal.addEventListener("click", async function (e) {
    const btn = e.target.closest ? e.target.closest(".kta-orphan-link") : null;
    if (!btn) return;
    if (!LC || typeof LC.ouvrirAddDialog !== "function") return;
    const type = btn.getAttribute("data-otype");
    const cat  = btn.getAttribute("data-ocat");
    // Une entrée du même LIBELLÉ existe déjà (autre id, donc NON liée à ce type) : on prévient, sinon deux
    // lignes « Bas » identiques sans savoir laquelle agit.
    const dejaLabel = (typeof LC.listCustomEntries === "function") &&
      LC.listCustomEntries(cat).some(function(e) { return e && e.label === type && e.id !== type; });
    if (dejaLabel && !(await window.ktaConfirm(window.I18n.t("legendui.orphans.labelExiste",
      { label: window.ktaEsc(type) })))) return;
    // (addCustomEntry repeint lui-même la carte)
    LC.ouvrirAddDialog(rafraichir, { id: type, category: cat, label: type });
  });

  // ✏️ Modifier : à chaque changement, seul le CONTENU est rafraîchi. Recréer la modale laisserait l'éditeur
  // ouvert pointer vers un ancien DOM, et le nouveau bouton refermerait l'éditeur.
  const btnMod = document.getElementById("kta-legende-modifier");
  if (btnMod) {
    btnMod.addEventListener("click", function() {
      LC.ouvrirEditeur({ onChange: rafraichir });
    });
  }
}

function afficherLegende() {
  _ouvrirLegende({});
}

function ktaLegendeLectureSeule(opts) {
  _ouvrirLegende(Object.assign({}, opts || {}, { lectureSeule: true }));
}

window.afficherLegende = afficherLegende;
window.ktaLegendeLectureSeule = ktaLegendeLectureSeule;
