/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// profondeurNiveaux.js — profondeur des niveaux (saisie) + profil en long d'un itinéraire
// =====================================================================
// Un niveau est un entier (-1, 0, +1) ; ce module lui associe une profondeur en mètres.
// ⚠️ Référence = la SURFACE, négatif vers le bas (décision produit) : niveau 0 à -25 m par défaut,
//   5 m entre étages. Stockage et cascade dans config.js (getPlanProfondeurs / setPlanProfondeurs) ;
//   ici l'interface et le calcul du profil seulement.
// 🩸 Une jonction coûte aussi sa différence de profondeur (pathfinder.js > _poidsSegment), sinon un
//   puits de 3 px entre deux étages à 12 m est sous-compté — UNIQUEMENT si les deux niveaux ont une
//   profondeur : un plan sans profondeur garde le calcul au pixel.
// Expose : window.ProfondeurNiveaux { ouvrirSaisie, ouvrirProfil(path), construireProfil(path) }
// Doc : docs/architecture/multilevel-pathfinding.md

(function () {
  "use strict";

  function _t(cle, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(cle, p) : cle;
  }
  function _esc(s) { return window.ktaEsc(s); }
  function _niveauxDuPlan() {
    const c = window.APP_CONFIG || {};
    const l = Array.isArray(c.availableLevels) && c.availableLevels.length
      ? c.availableLevels.slice() : [-2, -1, 0, 1, 2];
    return l.sort(function (a, b) { return b - a; });   // du haut vers le bas
  }

  // ── Saisie ──────────────────────────────
  function ouvrirSaisie() {
    const dejaLa = document.getElementById("kta-prof-modal");
    if (dejaLa) { dejaLa.remove(); return; }

    const niveaux = _niveauxDuPlan();
    const table   = (typeof window.getPlanProfondeurs === "function")
      ? window.getPlanProfondeurs() : {};
    const vierge  = Object.keys(table).length === 0;
    // Rien de saisi : champs PRÉ-REMPLIS, rien n'est enregistré avant validation.
    const propose = (vierge && typeof window.proposerProfondeurs === "function")
      ? window.proposerProfondeurs(niveaux) : {};

    const lignes = niveaux.map(function (n) {
      const k = String(n);
      const sansProf = (k in table) && table[k] === null;
      const val = (k in table && table[k] !== null) ? table[k]
                : (k in propose ? propose[k] : "");
      return '<div class="kta-prof-ligne">' +
               '<span class="kta-prof-niv">' + (n > 0 ? "+" + n : n) + '</span>' +
               '<input type="number" class="kta-cfg-input kta-prof-val" data-niv="' + k + '" ' +
                 'step="0.5" value="' + _esc(val) + '"' + (sansProf ? " disabled" : "") + '>' +
               '<span class="kta-prof-unite">m</span>' +
               '<label class="kta-prof-sans" title="' + _esc(_t("prof.sansTitre")) + '">' +
                 '<input type="checkbox" data-sans="' + k + '"' + (sansProf ? " checked" : "") + '>' +
                 '<span>' + _esc(_t("prof.sans")) + '</span>' +
               '</label>' +
             '</div>';
    }).join("");

    const modal = document.createElement("div");
    modal.id = "kta-prof-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-prof-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📉 ' + _esc(_t("prof.titre")) + '</span>' +
          '<button class="kta-panneau-close" id="kta-prof-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p class="kta-prof-hint">' + _esc(_t("prof.hint")) + '</p>' +
          (vierge ? '<p class="kta-prof-hint kta-prof-propose">' + _esc(_t("prof.propose")) + '</p>' : "") +
          lignes +
          '<p class="kta-prof-hint kta-prof-avert">⚠️ ' + _esc(_t("prof.avert")) + '</p>' +
          '<div class="kta-prof-actions">' +
            '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kta-prof-vider" type="button">' +
              _esc(_t("prof.vider")) + '</button>' +
            '<button class="kta-btn kta-btn-primary kta-btn-small" id="kta-prof-ok" type="button">' +
              _esc(_t("prof.valider")) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);

    const fermer = function () { modal.remove(); };
    document.getElementById("kta-prof-close").addEventListener("click", fermer);
    modal.addEventListener("click", function (e) { if (e.target === modal) fermer(); });

    // « Sans profondeur » grise le champ (sinon la valeur semble encore compter).
    modal.querySelectorAll("[data-sans]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        const champ = modal.querySelector('.kta-prof-val[data-niv="' + cb.getAttribute("data-sans") + '"]');
        if (champ) champ.disabled = cb.checked;
      });
    });

    document.getElementById("kta-prof-vider").addEventListener("click", function () {
      if (typeof window.setPlanProfondeurs === "function") window.setPlanProfondeurs(null, {});
      fermer();
    });

    document.getElementById("kta-prof-ok").addEventListener("click", function () {
      const out = {};
      modal.querySelectorAll(".kta-prof-val").forEach(function (el) {
        const k = el.getAttribute("data-niv");
        const cb = modal.querySelector('[data-sans="' + k + '"]');
        if (cb && cb.checked) { out[k] = null; return; }
        const v = parseFloat(el.value);
        // 🩸 Champ vide = « non renseigné », jamais 0 (un oubli deviendrait « au ras du sol »).
        if (Number.isFinite(v)) out[k] = v;
      });
      if (typeof window.setPlanProfondeurs === "function") window.setPlanProfondeurs(null, out);
      fermer();
    });
  }

  // ── Profil en long ──────────────────────────────
  // À partir d'un chemin de Pathfinder.computeRoute (chaque point porte `level`).
  // 🩸 `level: null` = INDÉTERMINÉ (intersection multi-niveaux, milieu de jonction) : interpolé entre
  //   les profondeurs connues qui l'encadrent — c'est un puits. Un niveau « sans profondeur » (+1
  //   conventionnel de l'import SIG) compte comme non renseigné, et le profil le signale.
  function construireProfil(path) {
    if (!Array.isArray(path) || path.length < 2) return null;
    const echelle = (window.APP_CONFIG && Number(window.APP_CONFIG.scale) > 0)
      ? Number(window.APP_CONFIG.scale) : null;
    if (!echelle) return null;
    const zDe = (typeof window.getProfondeurNiveau === "function")
      ? window.getProfondeurNiveau : function () { return null; };

    // 1) distance cumulée (m) + profondeur connue par point
    const pts = [];
    let cumul = 0;
    for (let i = 0; i < path.length; i++) {
      if (i > 0) {
        cumul += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y) / echelle;
      }
      const lvl = Number.isInteger(path[i].level) ? path[i].level : null;
      pts.push({ d: cumul, z: (lvl === null ? null : zDe(lvl)), level: lvl });
    }

    // 2) 🩸 seuls les trous ENCADRÉS s'interpolent : en bout de chemin, null (jamais d'extrapolation).
    let connus = 0;
    pts.forEach(function (p) { if (p.z !== null) connus++; });
    if (connus < 2) return { pts: pts, connus: connus, incomplet: true, longueur: cumul };
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].z !== null) continue;
      let a = i - 1; while (a >= 0 && pts[a].z === null) a--;
      let b = i + 1; while (b < pts.length && pts[b].z === null) b++;
      if (a < 0 || b >= pts.length) continue;
      const t = (pts[b].d - pts[a].d) > 0 ? (pts[i].d - pts[a].d) / (pts[b].d - pts[a].d) : 0;
      pts[i].z = pts[a].z + t * (pts[b].z - pts[a].z);
      pts[i].interpole = true;
    }

    // 3) dénivelé cumulé
    let montee = 0, descente = 0, zMin = Infinity, zMax = -Infinity;
    let prev = null;
    pts.forEach(function (p) {
      if (p.z === null) return;
      if (prev !== null) {
        const d = p.z - prev;
        if (d > 0) montee += d; else descente -= d;
      }
      prev = p.z;
      if (p.z < zMin) zMin = p.z;
      if (p.z > zMax) zMax = p.z;
    });

    return {
      pts:       pts,
      longueur:  cumul,
      montee:    montee,
      descente:  descente,
      zMin:      (zMin === Infinity ? null : zMin),
      zMax:      (zMax === -Infinity ? null : zMax),
      connus:    connus,
      incomplet: connus < pts.length
    };
  }

  // ── Rendu du profil ──────────────────────────────
  // SVG plutôt que canvas : net à tout zoom, imprimable, repères sélectionnables (≈ 100 points).
  function ouvrirProfil(path) {
    const dejaLa = document.getElementById("kta-profil-modal");
    if (dejaLa) dejaLa.remove();

    const p = construireProfil(path);
    const modal = document.createElement("div");
    modal.id = "kta-profil-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";

    let corps;
    if (!p) {
      // Sans échelle : on le dit, pas de graphe vide.
      corps = '<p class="kta-prof-hint">' + _esc(_t("prof.profil.sansEchelle")) + '</p>';
    } else if (p.connus < 2) {
      // Aucune profondeur saisie : explication + bouton de saisie.
      corps = '<p class="kta-prof-hint">' + _esc(_t("prof.profil.vide")) + '</p>' +
              '<button class="kta-btn kta-btn-primary kta-btn-small" id="kta-profil-saisir" type="button">📉 ' +
                _esc(_t("prof.btn.saisir")) + '</button>';
    } else {
      const W = 640, H = 220, MG = 44, MB = 28;
      const zMin = p.zMin, zMax = p.zMax;
      const dz = (zMax - zMin) || 1;
      const sx = function (d) { return MG + (d / (p.longueur || 1)) * (W - MG - 12); };
      const sy = function (z) { return 10 + ((zMax - z) / dz) * (H - 10 - MB); };
      const dessinables = p.pts.filter(function (q) { return q.z !== null; });
      const d = dessinables.map(function (q, i) {
        return (i ? "L" : "M") + sx(q.d).toFixed(1) + " " + sy(q.z).toFixed(1);
      }).join(" ");
      // Une graduation par niveau traversé, pas une grille arbitraire.
      const vus = {};
      p.pts.forEach(function (q) { if (Number.isInteger(q.level) && q.z !== null) vus[q.level] = q.z; });
      const reperes = Object.keys(vus).map(function (n) {
        const y = sy(vus[n]).toFixed(1);
        return '<line x1="' + MG + '" y1="' + y + '" x2="' + (W - 12) + '" y2="' + y +
               '" class="kta-profil-grille"/>' +
               '<text x="4" y="' + (parseFloat(y) + 4) + '" class="kta-profil-tick">' +
               (Number(n) > 0 ? "+" + n : n) + " · " + Math.round(vus[n]) + "m</text>";
      }).join("");
      const fmt = function (m) {
        return (typeof window.formatDistance === "function")
          ? window.formatDistance(m, 0) : Math.round(m) + " m";
      };
      corps =
        '<div class="kta-profil-chiffres">' +
          '<span><b>' + fmt(p.longueur) + '</b> ' + _esc(_t("prof.profil.longueur")) + '</span>' +
          '<span class="kta-profil-monte">▲ <b>' + fmt(p.montee) + '</b></span>' +
          '<span class="kta-profil-descend">▼ <b>' + fmt(p.descente) + '</b></span>' +
          '<span>' + Math.round(zMax) + " → " + Math.round(zMin) + ' m</span>' +
        '</div>' +
        '<svg class="kta-profil-svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet">' +
          reperes +
          '<path d="' + d + '" class="kta-profil-trace"/>' +
        '</svg>' +
        (p.incomplet
          ? '<p class="kta-prof-hint kta-prof-avert">⚠️ ' + _esc(_t("prof.profil.partiel")) + '</p>'
          : "");
    }

    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-profil-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📉 ' + _esc(_t("prof.profil.titre")) + '</span>' +
          '<button class="kta-panneau-close" id="kta-profil-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' + corps + '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);

    const fermer = function () { modal.remove(); };
    document.getElementById("kta-profil-close").addEventListener("click", fermer);
    modal.addEventListener("click", function (e) { if (e.target === modal) fermer(); });
    const bs = document.getElementById("kta-profil-saisir");
    if (bs) bs.addEventListener("click", function () { fermer(); ouvrirSaisie(); });
  }

  window.ProfondeurNiveaux = {
    ouvrirSaisie:     ouvrirSaisie,
    ouvrirProfil:     ouvrirProfil,
    construireProfil: construireProfil
  };
})();
