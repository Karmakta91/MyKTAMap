/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// 📉 profondeurNiveaux.js — profondeur des niveaux + profil en long
// =====================================================================
// LE TROU QU'IL COMBLE : un niveau n'était qu'un ENTIER NU (-1, 0, +1). Aucune
// altitude nulle part dans le projet — `kmzExport.js` écrivait même `alt = 0`
// en dur, et le GPX n'émettait aucun `<ele>`. Un relevé à six étages sortait
// donc plat, et une descente de 30 m ne comptait pas un mètre.
//
// RÉFÉRENCE : la SURFACE, négatif vers le bas (arbitrage KARMA). Niveau 0 à
// -25 m par défaut, pas de 5 m entre étages. Le stockage et la cascade vivent
// dans `config.js` (`getPlanProfondeurs` / `setPlanProfondeurs`) — ce module
// n'est que l'interface et le calcul du profil.
//
// 🩸 CE QUE LA PROFONDEUR CORRIGE, AU-DELÀ DU PROFIL : le coût d'une jonction
// était sa longueur DANS LE PLAN. Un puits dessiné sur 3 px entre deux étages
// distants de 12 m comptait pour 3 px — les distances multi-niveaux étaient
// sous-comptées, et Dijkstra préférait toujours le puits au détour à plat.
// Corrigé dans `pathfinder.js > _poidsSegment`, mais UNIQUEMENT quand les deux
// niveaux ont une profondeur : un plan qui n'en a pas garde son ancien calcul,
// au pixel près.
// =====================================================================

(function () {
  "use strict";

  function _t(cle, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(cle, p) : cle;
  }
  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function _niveauxDuPlan() {
    const c = window.APP_CONFIG || {};
    const l = Array.isArray(c.availableLevels) && c.availableLevels.length
      ? c.availableLevels.slice() : [-2, -1, 0, 1, 2];
    return l.sort(function (a, b) { return b - a; });   // du haut vers le bas
  }

  // ─────────────────────────────────────────────
  // SAISIE
  // ─────────────────────────────────────────────
  function ouvrirSaisie() {
    const dejaLa = document.getElementById("kta-prof-modal");
    if (dejaLa) { dejaLa.remove(); return; }

    const niveaux = _niveauxDuPlan();
    const table   = (typeof window.getPlanProfondeurs === "function")
      ? window.getPlanProfondeurs() : {};
    const vierge  = Object.keys(table).length === 0;
    // Rien de saisi → on PROPOSE, on n'impose pas : les champs sont pré-remplis
    // mais rien n'est enregistré tant que l'utilisateur n'a pas validé.
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

    // « Sans profondeur » grise le champ : les deux états s'excluent, et le
    // laisser saisissable donnerait à croire que la valeur compte encore.
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
        // Un champ vide n'est pas un zéro : c'est « non renseigné ». On ne
        // l'écrit pas, sinon un oubli de saisie deviendrait « au ras du sol ».
        if (Number.isFinite(v)) out[k] = v;
      });
      if (typeof window.setPlanProfondeurs === "function") window.setPlanProfondeurs(null, out);
      fermer();
    });
  }

  // ─────────────────────────────────────────────
  // PROFIL EN LONG
  // ─────────────────────────────────────────────
  // Construit le profil à partir d'un chemin rendu par `Pathfinder.computeRoute`
  // (chaque point porte `level`, ajouté en v1.83.0 — il était calculé puis jeté).
  //
  // Deux subtilités qui ne se devinent pas :
  //   • un point de `level: null` est INDÉTERMINÉ — nœud d'intersection à
  //     plusieurs niveaux, ou milieu de jonction qui n'est à aucun étage mais
  //     ENTRE deux. On INTERPOLE entre les profondeurs connues qui l'encadrent :
  //     c'est exactement ce qu'est un puits.
  //   • un niveau « sans profondeur » (le +1 du topo historique de l'import SIG)
  //     se comporte comme non renseigné. Le profil le signale au lieu de mentir.
  function construireProfil(path) {
    if (!Array.isArray(path) || path.length < 2) return null;
    const echelle = (window.APP_CONFIG && Number(window.APP_CONFIG.scale) > 0)
      ? Number(window.APP_CONFIG.scale) : null;
    if (!echelle) return null;                    // sans échelle, pas de mètres
    const zDe = (typeof window.getProfondeurNiveau === "function")
      ? window.getProfondeurNiveau : function () { return null; };

    // 1) distance cumulée (mètres) + profondeur connue par point
    const pts = [];
    let cumul = 0;
    for (let i = 0; i < path.length; i++) {
      if (i > 0) {
        cumul += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y) / echelle;
      }
      const lvl = Number.isInteger(path[i].level) ? path[i].level : null;
      pts.push({ d: cumul, z: (lvl === null ? null : zDe(lvl)), level: lvl });
    }

    // 2) interpolation des trous ENCADRÉS. Un trou en bout de chemin n'est pas
    //    interpolable : on le laisse à null plutôt que de l'extrapoler.
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

    // 3) dénivelé cumulé — le chiffre qu'un spéléo regarde en premier.
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

  // ─────────────────────────────────────────────
  // RENDU DU PROFIL
  // ─────────────────────────────────────────────
  // SVG et non canvas : le tracé est net à tout zoom, il s'imprime, et les
  // repères de niveau sont du texte sélectionnable. Une centaine de points au
  // plus — le canvas n'apporterait rien ici.
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
      // Pas d'échelle : on le DIT, au lieu d'afficher un graphe vide.
      corps = '<p class="kta-prof-hint">' + _esc(_t("prof.profil.sansEchelle")) + '</p>';
    } else if (p.connus < 2) {
      // Aucune profondeur saisie : c'est l'état de tout plan d'avant cette
      // version. On explique et on propose le geste, plutôt qu'un vide.
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
      // Une graduation par niveau réellement traversé — pas une grille
      // arbitraire : ce sont les étages qui font sens ici.
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
