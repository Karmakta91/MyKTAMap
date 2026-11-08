/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// profondeurNiveaux.js — niveaux en hauteur (saisie : sol, hauteur, écart) + profil en long d'un itinéraire
// =====================================================================
// Un niveau est un entier (-1, 0, +1) ; ce module saisit son SOL (profondeur, m) et sa HAUTEUR de galerie, et
// montre l'ÉCART avec le niveau du dessus (calculé, jamais stocké : config.js > getNiveauVertical).
// ⚠️ Référence = la SURFACE, négatif vers le bas (décision produit) : niveau 0 à -25 m par défaut,
//   5 m entre étages. Stockage et cascade dans config.js (getPlanProfondeurs / setPlanProfondeurs,
//   setPlanHauteursNiveaux) ; ici l'interface et le calcul du profil seulement.
// ⚠️ contrat : la même table sert ⚙️ (ouvrirSaisie) et le Générateur (tableHtml / brancherTable / lireTable) :
//   saisir un écart déplace le sol du niveau ET ceux du dessous (config.js > ecartVersProfondeurs).
// 🩸 Une jonction coûte aussi sa différence de profondeur (pathfinder.js > _poidsSegment), sinon un
//   puits de 3 px entre deux étages à 12 m est sous-compté — UNIQUEMENT si les deux niveaux ont une
//   profondeur : un plan sans profondeur garde le calcul au pixel.
// Expose : window.ProfondeurNiveaux { ouvrirSaisie, ouvrirProfil(path), construireProfil(path),
//   tableHtml(niveaux, profondeurs, hauteurs, opts), brancherTable(racine), lireTable(racine) }
// Doc : docs/architecture/multilevel-pathfinding.md · Garde-fou : scripts/check-niveaux-verticaux.js

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
  function _defautH() { return Number(window.HAUTEUR_GALERIE_DEFAUT) > 0 ? Number(window.HAUTEUR_GALERIE_DEFAUT) : 2; }
  function _nombre(el) {
    const v = Number.parseFloat(String(el && el.value || "").replace(",", "."));
    return Number.isFinite(v) ? v : null;
  }

  // ── Table partagée (⚙️ et Générateur) ──────────────────────────────
  // `profondeurs` = { "<n>": nombre|null } (absent = non renseigné), `hauteurs` = { "<n>": m }.
  // opts.mono : plan à un niveau, seule la hauteur se saisit (sol, écart et « sans » masqués).
  function tableHtml(niveaux, profondeurs, hauteurs, opts) {
    const o = opts || {};
    const t = profondeurs || {}, h = hauteurs || {};
    const tri = niveaux.slice().sort(function (a, b) { return b - a; });
    const entete =
      '<div class="kta-prof-ligne kta-prof-entete" aria-hidden="true">' +
        '<span class="kta-prof-niv">' + _esc(_t("prof.col.niveau")) + '</span>' +
        '<span class="kta-prof-col kta-prof-col-sol">' + _esc(_t("prof.col.sol")) + '</span>' +
        '<span class="kta-prof-col">' + _esc(_t("prof.col.hauteur")) + '</span>' +
        '<span class="kta-prof-col kta-prof-col-ecart">' + _esc(_t("prof.col.ecart")) + '</span>' +
        '<span class="kta-prof-col kta-prof-col-sans">' + _esc(_t("prof.col.sans")) + '</span>' +
      '</div>';
    const lignes = tri.map(function (n) {
      const k = String(n);
      const sansProf = (k in t) && t[k] === null;
      const sol = (k in t && Number.isFinite(t[k])) ? t[k] : "";
      const haut = Number(h[k]) > 0 ? Number(h[k]) : _defautH();
      const nom = n > 0 ? "+" + n : String(n);
      return '<div class="kta-prof-ligne" data-ligne="' + k + '">' +
               '<span class="kta-prof-niv">' + nom + '</span>' +
               '<input type="number" class="kta-cfg-input kta-prof-val" data-niv="' + k + '" step="0.5" ' +
                 'aria-label="' + _esc(_t("prof.col.sol") + " " + nom) + '" value="' + _esc(sol) + '"' +
                 (sansProf ? " disabled" : "") + '>' +
               '<input type="number" class="kta-cfg-input kta-prof-h" data-h="' + k + '" step="0.1" min="0.1" ' +
                 'aria-label="' + _esc(_t("prof.col.hauteur") + " " + nom) + '" value="' + _esc(haut) + '">' +
               '<input type="number" class="kta-cfg-input kta-prof-ecart" data-ecart="' + k + '" step="0.1" ' +
                 'aria-label="' + _esc(_t("prof.col.ecart") + " " + nom) + '" title="' + _esc(_t("prof.ecartTitre")) +
                 '">' +
               '<label class="kta-prof-sans" title="' + _esc(_t("prof.sansTitre")) + '">' +
                 '<input type="checkbox" data-sans="' + k + '"' + (sansProf ? " checked" : "") +
                 ' aria-label="' + _esc(_t("prof.sans") + " " + nom) + '">' +
               '</label>' +
             '</div>';
    }).join("");
    return '<div class="kta-prof-table' + (o.mono ? " kta-prof-mono" : "") + '">' + entete + lignes + '</div>';
  }

  // Lecture : sols (vide = absent, jamais 0 ; « sans » = null) et hauteurs (> 0 seulement).
  function lireTable(racine) {
    const profondeurs = {}, hauteurs = {};
    racine.querySelectorAll(".kta-prof-ligne[data-ligne]").forEach(function (l) {
      const k = l.getAttribute("data-ligne");
      const cb = l.querySelector("[data-sans]");
      const sol = _nombre(l.querySelector(".kta-prof-val"));
      // 🩸 Champ vide = « non renseigné », jamais 0 (un oubli deviendrait « au ras du sol »).
      if (cb && cb.checked) profondeurs[k] = null;
      else if (sol !== null) profondeurs[k] = sol;
      const h = _nombre(l.querySelector(".kta-prof-h"));
      if (h !== null && h > 0) hauteurs[k] = h;
    });
    return { profondeurs: profondeurs, hauteurs: hauteurs };
  }

  // Écarts recalculés depuis les sols et les hauteurs (sauf le champ en cours de frappe) ; un écart n'est
  // saisissable que si le niveau du dessus a un sol et que ce niveau n'est pas « sans profondeur ».
  function _majEcarts(racine, sauf) {
    const lu = lireTable(racine);
    racine.querySelectorAll(".kta-prof-ecart").forEach(function (el) {
      const k = el.getAttribute("data-ecart");
      const cb = racine.querySelector('[data-sans="' + k + '"]');
      const appui = Number.isFinite(lu.profondeurs[String(Number(k) + 1)]);
      el.disabled = !appui || !!(cb && cb.checked);
      el.title = appui ? _t("prof.ecartTitre") : _t("prof.ecartSansAppui");
      if (el === sauf) return;
      const v = (typeof window.calculerNiveauVertical === "function")
        ? window.calculerNiveauVertical(Number(k), lu.profondeurs, function (c) {
          return lu.hauteurs[c] || _defautH();
        }).ecartM : null;
      el.value = v === null || el.disabled ? "" : String(v);
    });
  }

  function brancherTable(racine) {
    racine.addEventListener("input", function (ev) {
      const el = ev.target;
      if (el.classList.contains("kta-prof-ecart")) {
        const lu = lireTable(racine);
        const neuf = (typeof window.ecartVersProfondeurs === "function")
          ? window.ecartVersProfondeurs(lu.profondeurs, lu.hauteurs, Number(el.getAttribute("data-ecart")), el.value)
          : null;
        if (neuf) {
          Object.keys(neuf).forEach(function (k) {
            const champ = racine.querySelector('.kta-prof-val[data-niv="' + k + '"]');
            if (champ && !champ.disabled && Number.isFinite(neuf[k])) champ.value = String(neuf[k]);
          });
        }
        _majEcarts(racine, el);
        return;
      }
      if (el.classList.contains("kta-prof-val") || el.classList.contains("kta-prof-h")) _majEcarts(racine, null);
    });
    // « Sans profondeur » grise le sol et l'écart (sinon la valeur semble encore compter).
    racine.addEventListener("change", function (ev) {
      const cb = ev.target;
      if (!cb.hasAttribute || !cb.hasAttribute("data-sans")) return;
      const champ = racine.querySelector('.kta-prof-val[data-niv="' + cb.getAttribute("data-sans") + '"]');
      if (champ) champ.disabled = cb.checked;
      _majEcarts(racine, null);
    });
    _majEcarts(racine, null);
  }

  // ── Saisie (⚙️ Réglages du plan, et pastille « Niv X ») ──────────────────────────────
  // opts.apres : appelé à la fermeture (le lanceur de ⚙️ relit son état).
  function ouvrirSaisie(opts) {
    const dejaLa = document.getElementById("kta-prof-modal");
    if (dejaLa) { dejaLa.remove(); return; }

    const niveaux = _niveauxDuPlan();
    const table   = (typeof window.getPlanProfondeurs === "function")
      ? window.getPlanProfondeurs() : {};
    const vierge  = Object.keys(table).length === 0;
    // Rien de saisi : sols PRÉ-REMPLIS, rien n'est enregistré avant validation.
    const sols = vierge && typeof window.proposerProfondeurs === "function"
      ? window.proposerProfondeurs(niveaux) : table;
    const hauteurs = {};
    niveaux.forEach(function (n) {
      hauteurs[String(n)] = (typeof window.getHauteurNiveau === "function") ? window.getHauteurNiveau(n) : _defautH();
    });
    const mono = !(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);

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
          '<p class="kta-prof-hint">' + _esc(_t(mono ? "prof.hintMono" : "prof.hint")) + '</p>' +
          (vierge && !mono ? '<p class="kta-prof-hint kta-prof-propose">' + _esc(_t("prof.propose")) + '</p>' : "") +
          '<div id="kta-prof-table">' + tableHtml(mono ? [0] : niveaux, sols, hauteurs, { mono: mono }) + '</div>' +
          (mono ? "" : '<p class="kta-prof-hint kta-prof-avert">⚠️ ' + _esc(_t("prof.avert")) + '</p>') +
          '<div class="kta-prof-actions">' +
            '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kta-prof-plan" type="button" title="' +
              _esc(_t("prof.planTitre")) + '">↺ ' + _esc(_t("prof.plan")) + '</button>' +
            (mono ? "" : '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kta-prof-vider" type="button">' +
              _esc(_t("prof.vider")) + '</button>') +
            '<button class="kta-btn kta-btn-primary kta-btn-small" id="kta-prof-ok" type="button">' +
              _esc(_t("prof.valider")) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);
    const racine = document.getElementById("kta-prof-table");
    brancherTable(racine);

    const fermer = function () {
      modal.remove();
      if (opts && typeof opts.apres === "function") opts.apres();
    };
    document.getElementById("kta-prof-close").addEventListener("click", fermer);
    modal.addEventListener("click", function (e) { if (e.target === modal) fermer(); });

    document.getElementById("kta-prof-plan").addEventListener("click", function () {
      if (typeof window.effacerReglagesNiveaux === "function") window.effacerReglagesNiveaux(null);
      fermer();
    });
    const vider = document.getElementById("kta-prof-vider");
    if (vider) {
      vider.addEventListener("click", function () {
        if (typeof window.setPlanProfondeurs === "function") window.setPlanProfondeurs(null, {});
        fermer();
      });
    }

    document.getElementById("kta-prof-ok").addEventListener("click", function () {
      const lu = lireTable(racine);
      // Plan à un niveau : seules les hauteurs se saisissent, les sols restent ce qu'ils étaient.
      if (!mono && typeof window.setPlanProfondeurs === "function") window.setPlanProfondeurs(null, lu.profondeurs);
      if (typeof window.setPlanHauteursNiveaux === "function") window.setPlanHauteursNiveaux(null, lu.hauteurs);
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
    tableHtml:        tableHtml,
    brancherTable:    brancherTable,
    lireTable:        lireTable,
    ouvrirProfil:     ouvrirProfil,
    construireProfil: construireProfil
  };
})();
