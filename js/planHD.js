/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// planHD.js — « Régénérer en haute résolution » (Éditeur de données) : un plan décalqué sur un scan basse
//   résolution donne un NOUVEAU plan k fois plus grand (×2, ×3, ×4), toutes ses données mises à l'échelle.
// Expose : window.ktaOuvrirPlanHD() (la fenêtre) · window.KtaPlanHD (calcul PUR, sans DOM).
// Parcours : fenêtre (facteur, fond, ancien scan, session) → archive préparée dans la page depuis celle du plan
//   (plan-config et calques à l'échelle, nouvelle image) → Générateur prérempli (createConf.js > ktaGenerateurMaj,
//   le chemin de « Mettre à jour le plan ») → Télécharger, ou Ajouter à mes plans et l'ouvrir.
// ⚠️ Contrat : le plan ouvert n'est jamais modifié ; le nouveau plan prend un identifiant libre, jamais le sien.
//   Les uid des objets sont GARDÉS : photos, favoris et liaisons s'y rattachent, et les sessions sont par plan
//   (aucune fusion possible avec l'ancien).
// 🩸 Le champ oublié est le bug classique : coordonnées des calques par KtaRecalageScan (homothétie exacte), du
//   plan-config par mettreAEchellePlanConfig ; les deux éprouvés par check-plan-hd.js.
// 🩸 Calage des Réglages, échelle recalibrée, départ du tracker et calages d'images de l'appareil sont repris ICI, à
//   l'échelle : le Générateur ne reçoit pas le planId (il les réappliquerait tels quels, dans l'ancien repère).
// Plafond : canvas de l'appareil (iPhone 16,7 Mpx, ailleurs 64 Mpx, comme l'export image) ; au-delà de 4096² px le
//   tuilage V2 est coché d'office (docs/TILING.md).
// Doc : docs/architecture/plans-loader.md (§ Régénérer en haute résolution), ui.md (Éditeur de données).

(function () {
  "use strict";

  // ── Calcul (PUR) ──────────────────────────────

  const FACTEURS = [2, 3, 4];
  const PX_IOS = 16777216;            // exporter.js > IOS_MAX_PX_CANVAS : surface maximale d'un canvas sous Safari iOS
  const PX_ORDI = 64 * 1024 * 1024;   // exporter.js > SEUIL_PX_EXPORT
  const PX_TUILAGE = 4096 * 4096;     // au-delà, une image entière plante un téléphone (docs/TILING.md § 1)
  const COTE_MAX = 32767;             // côté refusé par Chrome (createConf.js > en-tête des dimensions)
  const ID_SCAN = "scan_origine";

  function plafond(ios) { return ios ? PX_IOS : PX_ORDI; }

  // Facteurs proposés pour une image W × H : taille finale, refus au-delà du plafond, tuilage V2 requis.
  function facteurs(W, H, plaf) {
    const ok = W > 0 && H > 0;
    return FACTEURS.map(function (k) {
      const w = W * k, h = H * k, px = w * h;
      return { k: k, w: w, h: h, px: px, refuse: !ok || px > plaf || Math.max(w, h) > COTE_MAX, tuilage: px > PX_TUILAGE };
    });
  }

  function _clone(o) { return JSON.parse(JSON.stringify(o)); }
  function _pt(p, k) {
    if (p && typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      p.x *= k; p.y *= k;
      return 1;
    }
    return 0;
  }

  // Un fichier de calque (ou de session) à l'échelle k, sur place. `planSource` : id du plan d'origine, pour le côté
  // « ce plan » d'une liaison embarquée dans un point (`interPlanLinks`). → compte par tableau (KtaRecalageScan).
  function mettreAEchelleCalque(obj, k, planSource) {
    const K = window.KtaRecalageScan;
    if (!obj || typeof obj !== "object" || !K) return {};
    const compte = K.transformerCoordsFichier(obj, K.matriceHomothetie(k, k), { exact: true });
    ["data", "editorPoints"].forEach(function (cle) {
      (Array.isArray(obj[cle]) ? obj[cle] : []).forEach(function (p) {
        (p && Array.isArray(p.interPlanLinks) ? p.interPlanLinks : []).forEach(function (l) {
          ["a", "b"].forEach(function (s) {
            if (l && l[s] && planSource && l[s].planId === planSource) compte.liaisons = (compte.liaisons || 0) + _pt(l[s], k);
          });
        });
      });
    });
    return compte;
  }

  // plan-config.json du nouveau plan (copie). `o` : { nom, baseImage, georef (calage des Réglages, prioritaire),
  // scale (échelle recalibrée, px/m), depart ({ x, y } du tracker), calibrations ({ idCalque: calage de l'appareil }),
  // scan ({ file, label, rognage }) }. Tout le reste du format est gardé tel quel (mètres, niveaux, légende, icônes).
  function mettreAEchellePlanConfig(cfg, k, o) {
    o = o || {};
    const c = _clone(cfg || {});
    const plan = c.plan = c.plan || {};
    const W = Number(plan.imageWidth), H = Number(plan.imageHeight);
    plan.imageWidth = W * k;
    plan.imageHeight = H * k;
    if (o.nom) plan.name = o.nom;
    if (o.baseImage) plan.baseImage = o.baseImage;
    // Nouvelle image entière, retuilée par le Générateur : ni rognage, ni manifeste de l'ancienne.
    delete plan.rognage;
    delete plan.tiledV2;
    delete c.tiling;
    const g = o.georef || plan.georef;
    if (g) {
      plan.georef = _clone(g);
      ["pointA", "pointB", "pointC"].forEach(function (cle) { _pt(plan.georef[cle], k); });
    }
    const t = c.tracking = (c.tracking && typeof c.tracking === "object") ? c.tracking : {};
    const dep = o.depart || { x: t.startX, y: t.startY };
    if (Number.isFinite(Number(dep.x))) t.startX = Number(dep.x) * k;
    if (Number.isFinite(Number(dep.y))) t.startY = Number(dep.y) * k;
    // Échelle absente = 4,9 px/m, la valeur de l'app (config.js > DEFAULT_CONFIG.scale) : elle passe aussi à ×k.
    const s = (o.scale > 0) ? o.scale : ((Number(t.scale) > 0) ? Number(t.scale) : 4.9);
    t.scale = s * k;
    // Calque image sans calage = étiré sur le plan, il suit tout seul ; calé = ses cibles (px du plan) passent à ×k.
    c.imageLayers = (Array.isArray(c.imageLayers) ? c.imageLayers : []).map(function (l) {
      const cal = (o.calibrations && l && o.calibrations[l.id]) || (l && l.calibration);
      if (cal) {
        l.calibration = _clone(cal);
        _pt(l.calibration.targetA, k);
        _pt(l.calibration.targetB, k);
      }
      return l;
    });
    if (o.scan) c.imageLayers.push(calqueScan(W, H, k, o.scan));
    return c;
  }

  // Ancien scan en calque image : étiré sur le plan (= emprise ×k) ; image rognée (tuilage V2), calé sur la partie
  // qui fait le plan, sinon les marges le décaleraient.
  function calqueScan(W, H, k, s) {
    const l = { id: ID_SCAN, label: s.label || ID_SCAN, file: s.file, visible: true, order: 5, level: 0 };
    const r = s.rognage;
    if (r && (r.x || r.y)) {
      l.calibration = { sourceA: { sx: r.x, sy: r.y }, targetA: { x: 0, y: 0 },
                        sourceB: { sx: r.x + W, sy: r.y + H }, targetB: { x: W * k, y: H * k } };
    }
    return l;
  }

  // Liaisons du plan d'origine recopiées pour le nouveau plan (l'ancien garde les siennes) : nouvel id, côté du plan
  // d'origine renvoyé vers le nouveau, à l'échelle.
  function liaisonsPourNouveauPlan(liens, ancien, neuf, nom, k, genId) {
    const now = Date.now();
    return (Array.isArray(liens) ? liens : []).filter(function (l) {
      return l && l.a && l.b && (l.a.planId === ancien || l.b.planId === ancien);
    }).map(function (l, i) {
      const c = _clone(l);
      c.id = genId ? genId(i) : ("ipl_" + now.toString(36) + "_hd" + i);
      ["a", "b"].forEach(function (s) {
        if (c[s].planId !== ancien) return;
        c[s].planId = neuf;
        if (nom) c[s].planName = nom;
        _pt(c[s], k);
      });
      c.createdAt = new Date(now).toISOString();
      c.updatedAt = now;
      return c;
    });
  }

  // Identifiant du nouveau plan : celui de son nom et de sa version, suffixé s'il est pris ou s'il est celui d'origine.
  function idLibre(PR, nom, version, ancien) {
    const base = PR.genLocalId(nom, version || "");
    let id = base, n = 2;
    while (id === ancien || PR.findById(id)) id = base + "_" + (n++);
    return id;
  }

  window.KtaPlanHD = {
    FACTEURS: FACTEURS, PX_IOS: PX_IOS, PX_ORDI: PX_ORDI, PX_TUILAGE: PX_TUILAGE, ID_SCAN: ID_SCAN,
    plafond: plafond, facteurs: facteurs, mettreAEchelleCalque: mettreAEchelleCalque,
    mettreAEchellePlanConfig: mettreAEchellePlanConfig, calqueScan: calqueScan,
    liaisonsPourNouveauPlan: liaisonsPourNouveauPlan, idLibre: idLibre
  };

  // ── Interface ──────────────────────────────

  const t = function (k, p) { return window.I18n.t(k, p); };
  const esc = function (s) { return window.ktaEsc(s); };
  const COULEURS = { white: "#ffffff", gray: "#e8e8e8", black: "#000000", sepia: "#f4e4bc", transparent: null };
  const MAX_CALQUES = 10;   // plafond des calques du Générateur (_ajouterDataLayer, _ajouterImageLayer)

  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type || "info");
  }
  function _ios() { return typeof window.ktaEstIos === "function" && window.ktaEstIos(); }
  function _mpx(px) { return (Math.round(px / 100000) / 10).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR"); }

  let _ov = null;
  function _fermer() {
    if (_ov) { _ov.remove(); _ov = null; }
    document.removeEventListener("keydown", _onKey, true);
  }
  function _onKey(ev) { if (ev.key === "Escape") { ev.stopPropagation(); _fermer(); } }

  function _session() {
    const CS = window.CalqueSession, MP = window.MajPlan;
    if (!CS || !MP) return { rapatries: [], groupes: [], n: 0 };
    const rapatries = CS.listeRapatries();
    const groupes = MP._interne.grouper(CS.candidatsAjout());
    const n = groupes.reduce(function (s, g) { return s + g.objets.length; }, 0) +
      rapatries.reduce(function (s, id) { return s + CS.compterCopie(id); }, 0);
    return { rapatries: rapatries, groupes: groupes, n: n };
  }

  function ouvrir() {
    const pc = window.PLAN_CONFIG;
    const affiche = typeof window.ktaPlanAffiche === "function" ? window.ktaPlanAffiche() : !!pc;
    if (!pc || !pc.plan || !affiche || !window._currentLoadedPlanId) {
      window.ktaAlerte(t("planhd.err.sansPlan"), { titre: t("planhd.titre") });
      return false;
    }
    if (typeof window.ktaExportPlanRefuse === "function" && window.ktaExportPlanRefuse()) return false;   // le dit
    _fermer();
    const W = Number(pc.plan.imageWidth), H = Number(pc.plan.imageHeight);
    const plaf = plafond(_ios());
    const fs = facteurs(W, H, plaf);
    const premier = fs.find(function (f) { return !f.refuse; });
    const ses = _session();
    const nbImages = (pc.imageLayers || []).length;

    const lignesFacteur = fs.map(function (f) {
      const taille = t("planhd.facteur.taille", { w: f.w, h: f.h, mpx: _mpx(f.px) });
      const note = f.refuse ? t("planhd.facteur.refuse", { max: _mpx(plaf) })
        : (f.tuilage ? t("planhd.facteur.tuilage") : "");
      return '<label class="kta-export-radio-row' + (f.refuse ? ' kta-planhd-refuse' : '') + '">' +
        '<input type="radio" name="kta-planhd-k" value="' + f.k + '"' + (f.refuse ? " disabled" : "") +
        (premier && f.k === premier.k ? " checked" : "") + '>' +
        '<span><strong>×' + f.k + '</strong> · ' + esc(taille) +
        (note ? ' <span class="' + (f.refuse ? "kta-tx-err" : "kta-tx-warn") + '" data-planhd-note="' + f.k + '">' +
          esc(note) + '</span>' : '') + '</span></label>';
    }).join("");
    const optionsCouleur = Object.keys(COULEURS).map(function (c) {
      const cle = { white: "blanc", gray: "gris", black: "noir", sepia: "sepia", transparent: "transparent" }[c];
      return '<option value="' + c + '">' + esc(t("gen.couleur." + cle)) + '</option>';
    }).join("");

    _ov = document.createElement("div");
    _ov.id = "kta-plan-hd";
    _ov.className = "kta-readme-modal-overlay";
    _ov.style.zIndex = "100001";
    _ov.innerHTML =
      '<div class="kta-readme-modal-boite kta-fp-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + window.ktaIcone("scaling") + ' ' + esc(t("planhd.titre")) + '</span>' +
          '<button class="kta-panneau-close" data-planhd-fermer type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-fp-corps">' +
          '<p class="kta-fp-ajouts-intro">' + esc(t("planhd.intro", { w: W, h: H })) + '</p>' +
          '<div class="kta-maj-etape">' + esc(t("planhd.facteur.titre")) + '</div>' +
          '<div class="kta-planhd-groupe">' + lignesFacteur + '</div>' +
          (premier ? "" : '<p class="kta-fp-ajouts-intro kta-tx-err">' + esc(t("planhd.err.aucunFacteur")) + '</p>') +
          '<div class="kta-maj-etape">' + esc(t("planhd.fond.titre")) + '</div>' +
          '<div class="kta-planhd-groupe">' +
            '<label class="kta-export-radio-row"><input type="radio" name="kta-planhd-fond" value="uni" checked>' +
              '<span>' + esc(t("planhd.fond.uni")) + '</span></label>' +
            '<label class="kta-export-radio-row"><input type="radio" name="kta-planhd-fond" value="rendu">' +
              '<span>' + esc(t("planhd.fond.rendu")) + '</span></label>' +
            '<label class="kta-planhd-couleur"><span>' + esc(t("planhd.fond.couleur")) + '</span>' +
              '<select class="kta-cfg-input" id="kta-planhd-couleur">' + optionsCouleur + '</select></label>' +
            '<p class="kta-fp-ajouts-intro">' + esc(t("planhd.fond.aide")) + '</p>' +
          '</div>' +
          '<div class="kta-maj-etape">' + esc(t("planhd.donnees.titre")) + '</div>' +
          '<label class="kta-fp-row-cb"><input type="checkbox" id="kta-planhd-scan"' +
            (nbImages >= MAX_CALQUES ? " disabled" : " checked") + '><span>' + esc(t("planhd.scan.label")) +
            '<span class="kta-fp-ajouts-meta"> · ' + esc(t(nbImages >= MAX_CALQUES ? "planhd.scan.plein" : "planhd.scan.aide",
              { max: MAX_CALQUES })) + '</span></span></label>' +
          (ses.n ? '<label class="kta-fp-row-cb"><input type="checkbox" id="kta-planhd-session" checked><span>' +
            esc(t("planhd.session.label", { n: ses.n })) + '<span class="kta-fp-ajouts-meta"> · ' +
            esc(t("planhd.session.aide")) + '</span></span></label>' : '') +
          '<p class="kta-fp-ajouts-intro kta-tx-muted">' + esc(t("planhd.uid")) + '</p>' +
          '<p class="kta-fp-ajouts-intro kta-tx-muted" id="kta-planhd-etat" hidden></p>' +
          '<div class="kta-conv-erreur" id="kta-planhd-erreur" hidden></div>' +
        '</div>' +
        '<div class="kta-fp-footer">' +
          '<button type="button" class="kta-btn kta-btn-ghost" data-planhd-fermer>' + esc(t("planhd.annuler")) + '</button>' +
          '<button type="button" class="kta-btn kta-btn-primary" id="kta-planhd-suivant"' + (premier ? "" : " disabled") + '>' +
            esc(t("planhd.suivant")) + '</button>' +
        '</div>' +
      '</div>';
    _ov.addEventListener("click", function (ev) {
      const c = ev.target;
      if (c === _ov || (c.closest && c.closest("[data-planhd-fermer]"))) { _fermer(); return; }
      if (c.id === "kta-planhd-suivant") _valider(ses);
    });
    document.addEventListener("keydown", _onKey, true);
    document.documentElement.appendChild(_ov);
    return true;
  }

  function _erreur(msg) {
    const el = _ov && _ov.querySelector("#kta-planhd-erreur");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }
  function _etat(msg) {
    const el = _ov && _ov.querySelector("#kta-planhd-etat");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  function _choix() {
    const k = Number((_ov.querySelector('input[name="kta-planhd-k"]:checked') || {}).value);
    const fond = (_ov.querySelector('input[name="kta-planhd-fond"]:checked') || {}).value || "uni";
    const couleur = (_ov.querySelector("#kta-planhd-couleur") || {}).value || "white";
    const scan = !!(_ov.querySelector("#kta-planhd-scan") || {}).checked;
    const session = !!(_ov.querySelector("#kta-planhd-session") || {}).checked;
    return { k: k, fond: fond, couleur: (couleur in COULEURS) ? couleur : "white", scan: scan, session: session };
  }

  // Image du nouveau plan, W·k × H·k : couleur unie, ou rendu des données (exporter.js, structures à la loi du
  // terrain) posé sur cette couleur. Sans icônes : les marqueurs vivants passent par-dessus.
  async function _image(ch, W, H) {
    const w = W * ch.k, h = H * ch.k;
    const fill = COULEURS[ch.couleur];
    let canvas;
    if (ch.fond === "rendu") {
      if (typeof window.MyKTAMapExporterGenererCanvas !== "function") throw new Error("exporter.js");
      const tous = {};
      (window.PLAN_CONFIG.dataLayers || []).forEach(function (l) { tous[l.id] = true; });
      const multi = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
      canvas = await window.MyKTAMapExporterGenererCanvas({
        ann: { points: false, roads: ch.session, zones: ch.session, structures: ch.session,
               levels: multi ? new Set([0]) : null },
        scale: ch.k, bg: "transparent", imageLayers: {}, dataLayers: tous, sansIcones: true
      });
      if (!canvas || canvas._ktaPlafonne || canvas.width !== w || canvas.height !== h) {
        throw new Error(t("planhd.err.canvas", { w: w, h: h }));
      }
      if (fill) {
        const ctx = canvas.getContext("2d");
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    } else {
      canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, w, h); }
    }
    // 🩸 toBlob rend null sans autre signe au-delà de ce que l'appareil sait encoder : JPEG en repli (sans
    // transparence), sinon refus clair.
    let blob = await new Promise(function (r) { canvas.toBlob(r, "image/png"); });
    let ext = "png";
    if (!blob && fill) { blob = await new Promise(function (r) { canvas.toBlob(r, "image/jpeg", 0.92); }); ext = "jpg"; }
    canvas.width = 0; canvas.height = 0;   // mémoire rendue tout de suite (Safari)
    if (!blob) throw new Error(t("planhd.err.canvas", { w: w, h: h }));
    return { blob: blob, nom: "fond_hd_x" + ch.k + "_" + ch.fond + "." + ext };
  }

  // Calques de données du nouveau plan : fichiers de l'archive (et, session comprise, copies des calques en
  // modification + objets dessinés à la main dans un calque nouveau, comme « Mettre à jour le plan »), à l'échelle.
  async function _calques(zip, cfg, ch, ses, planSource) {
    const CS = window.CalqueSession, MP = window.MajPlan;
    const lus = new Map();
    const liste = (cfg.dataLayers || []).filter(function (d) { return d && d.id && d.id !== "editor" && d.file; });
    for (const d of liste) {
      const f = zip.file(d.file) || zip.file(String(d.file).replace(/^\.?\//, ""));
      let json = {};
      try { json = f ? JSON.parse(await f.async("string")) : {}; }
      catch (e) { console.warn("[PlanHD] calque « " + d.id + " » illisible, repris vide :", e); }
      lus.set(d.id, json);
    }
    let nouveau = null;
    let legende = null;
    if (ch.session && CS && MP) {
      const calques = [];
      for (const id of ses.rapatries) {
        if (!lus.has(id)) continue;
        const r = CS.contenuCalque(id);
        if (!r.ok) throw new Error(t("filter.calque.err", { code: r.code }));
        calques.push({ id: id, label: id, base: lus.get(id), copies: r.payload });
      }
      if (ses.groupes.length) {
        const pris = new Set(Array.from(lus.keys()).concat(["editor"]));
        const label = t("planhd.calqueSession");
        nouveau = { id: MP._interne.slug(label, pris), label: label };
      }
      const res = MP._interne.construire({
        T: Date.now(), calques: calques,
        groupes: ses.groupes.map(function (g) {
          return { famille: g.famille, objets: g.objets, cible: { id: nouveau.id, label: nouveau.label, nouveau: true } };
        })
      });
      const tout = { data: [], roads: [], zones: [], structures: [] };
      res.calques.forEach(function (c) {
        lus.set(c.id, c.payload);
        ["data", "roads", "zones", "structures"].forEach(function (cle) { tout[cle] = tout[cle].concat(c.payload[cle]); });
      });
      const icones = Object.keys(cfg.icons || {});
      legende = typeof window.ktaLegendePourCalque === "function" ? window.ktaLegendePourCalque(tout, icones) : null;
    }
    lus.forEach(function (json) { mettreAEchelleCalque(json, ch.k, planSource); });
    return { lus: lus, nouveau: nouveau, legende: legende };
  }

  // Calage d'un calque image posé sur l'appareil (prefs par plan), qui prime sur celui du plan-config.
  function _calibrationsAppareil(cfg) {
    const ILC = window.ImageLayerCalibration;
    const out = {};
    (cfg.imageLayers || []).forEach(function (l) {
      const c = ILC && typeof ILC.getCalibration === "function" ? ILC.getCalibration(l.id) : null;
      if (c) out[l.id] = c;
    });
    return out;
  }

  // Calage GPS des Réglages (KmzExport.getCalibration), retenu s'il est utilisable et dans l'image d'origine : même
  // règle que la mise à jour d'un plan (createConf.js > _georefReglagesPourMaj).
  function _georefReglages(planId, W, H) {
    const KE = window.KmzExport;
    const cal = (KE && typeof KE.getCalibration === "function") ? KE.getCalibration(planId) : null;
    if (!cal || !cal.pointA || !cal.pointB) return null;
    const dedans = function (p) {
      return !p || (Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -1 && p.x <= W + 1 && p.y >= -1 && p.y <= H + 1);
    };
    if (!(dedans(cal.pointA) && dedans(cal.pointB) && dedans(cal.pointC))) return null;
    try { KE.buildTransformCalib(cal); } catch (e) { return null; }
    return cal;
  }

  async function _valider(ses) {
    const ch = _choix();
    if (!(ch.k > 0)) { _erreur(t("planhd.err.aucunFacteur")); return; }
    const btn = _ov.querySelector("#kta-planhd-suivant");
    btn.disabled = true;
    _erreur("");
    try {
      const planSource = window._currentLoadedPlanId;
      const entree = window.PlanRegistry.findById(planSource);
      const MP = window.MajPlan;
      if (!entree || !MP) throw new Error(t("maj.err.planInconnu"));
      _etat(t("planhd.etat.archive"));
      const zipBlob = await MP._interne.zipDuPlan(entree);
      if (!zipBlob) { _erreur(t("planhd.err.sansArchive")); btn.disabled = false; _etat(""); return; }
      const zip = await window.JSZip.loadAsync(zipBlob);
      const fcfg = zip.file("plan-config.json");
      if (!fcfg) throw new Error(t("gen.zipModif.noPlanConfig"));
      const cfg = JSON.parse(await fcfg.async("string"));
      const W = Number(cfg.plan && cfg.plan.imageWidth), H = Number(cfg.plan && cfg.plan.imageHeight);
      const f = facteurs(W, H, plafond(_ios())).find(function (x) { return x.k === ch.k; });
      if (!f || f.refuse) {
        _erreur(t("planhd.facteur.refuse", { max: _mpx(plafond(_ios())) }));
        btn.disabled = false; _etat("");
        return;
      }

      _etat(t("planhd.etat.calques"));
      const cal = await _calques(zip, cfg, ch, ses, planSource);
      const nbCalques = (cfg.dataLayers || []).filter(function (d) { return d && d.id !== "editor"; }).length;
      if (cal.nouveau && nbCalques + 1 > MAX_CALQUES) {
        _erreur(t("maj.err.tropDeCalques", { max: MAX_CALQUES })); btn.disabled = false; _etat(""); return;
      }

      _etat(t("planhd.etat.image", { w: f.w, h: f.h }));
      const img = await _image(ch, W, H);

      // Archive du nouveau plan : tout ce que l'ancienne embarque (icônes, calques image, PDF), sauf ce qui est
      // refait ici ou par le Générateur (plan-config, image, calques, tuiles, photos — reprises de l'appareil).
      const baseOrig = String((cfg.plan && cfg.plan.baseImage) || "");
      const fichiersCalques = new Set((cfg.dataLayers || []).map(function (d) { return d && d.file; }));
      const out = new window.JSZip();
      for (const e of Object.values(zip.files)) {
        if (e.dir || e.name === "plan-config.json" || e.name === baseOrig || fichiersCalques.has(e.name)) continue;
        if (/^data\/(tiles|photos)\//.test(e.name)) continue;
        out.file(e.name, await e.async("blob"));
      }
      out.file("data/" + img.nom, img.blob);
      let scan = null;
      if (ch.scan && zip.file(baseOrig)) {
        const ext = (baseOrig.split(".").pop() || "png").toLowerCase();
        const nomScan = "data/" + ID_SCAN + "." + ext;
        out.file(nomScan, await zip.file(baseOrig).async("blob"));
        scan = { file: nomScan, label: t("planhd.calqueScan"), rognage: cfg.plan.rognage || null };
      }
      const cfgHD = mettreAEchellePlanConfig(cfg, ch.k, {
        nom: t("planhd.nom", { nom: (cfg.plan && cfg.plan.name) || entree.name || "" }),
        baseImage: "data/" + img.nom,
        georef: _georefReglages(planSource, W, H),
        scale: typeof window.getPlanScale === "function" ? window.getPlanScale(planSource) : null,
        depart: window.APP_CONFIG ? { x: window.APP_CONFIG.startX, y: window.APP_CONFIG.startY } : null,
        calibrations: _calibrationsAppareil(cfg),
        scan: scan
      });
      cal.lus.forEach(function (json, id) {
        const d = (cfgHD.dataLayers || []).find(function (x) { return x && x.id === id; });
        const chemin = d ? d.file : "data/" + id + ".json";
        if (!d) {
          const i = (cfgHD.dataLayers || []).findIndex(function (x) { return x && x.id === "editor"; });
          const neuf = { id: id, label: (cal.nouveau && cal.nouveau.label) || id, file: chemin, visible: true };
          cfgHD.dataLayers = cfgHD.dataLayers || [];
          if (i >= 0) cfgHD.dataLayers.splice(i, 0, neuf); else cfgHD.dataLayers.push(neuf);
        }
        out.file(chemin, JSON.stringify(json, null, 2));
      });
      out.file("plan-config.json", JSON.stringify(cfgHD, null, 2));
      const synth = await out.generateAsync({ type: "blob", compression: "STORE" });
      console.log("[PlanHD] archive préparée : ×" + ch.k + ", " + f.w + "×" + f.h + ", " + cal.lus.size + " calque(s)");

      _fermer();
      if (typeof window.ktaGenerateurMaj !== "function") return;
      const etat = { planSource: planSource, k: ch.k };
      await window.ktaGenerateurMaj({
        zip: new File([synth], cfgHD.plan.name + ".zip", { type: "application/zip" }),
        calques: [],
        legende: cal.legende,
        tilingV2: f.tuilage,
        statut: t("planhd.gen.statut", { k: ch.k, w: f.w, h: f.h }) + (f.tuilage ? " " + t("planhd.gen.tuilage") : ""),
        onZip: function (blob, nomZip, infos) { _fin(etat, blob, nomZip, infos || {}); }
      });
    } catch (er) {
      console.warn("[PlanHD] préparation :", er);
      _etat("");
      _erreur(t("planhd.err.preparation", { err: (er && er.message) || String(er) }));
      if (btn) btn.disabled = false;
    }
  }

  // ── Fin : télécharger, ou ajouter à mes plans et ouvrir ──────────
  function _telecharger(blob, nom) {
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url; a.download = nom;
      a.click();
    } finally { setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  }

  function _fin(etat, blob, nomZip, infos) {
    const ov = document.createElement("div");
    ov.id = "kta-plan-hd-fin";
    ov.className = "kta-readme-modal-overlay";
    ov.style.zIndex = "100001";
    ov.innerHTML =
      '<div class="kta-readme-modal-boite kta-fp-boite">' +
        '<div class="kta-readme-modal-header"><span class="kta-readme-modal-titre">' + window.ktaIcone("scaling") + ' ' +
          esc(t("planhd.fin.titre")) + '</span><button class="kta-panneau-close" data-planhd-fin="fermer" type="button">✕</button></div>' +
        '<div class="kta-readme-modal-corps kta-fp-corps">' +
          '<p class="kta-fp-ajouts-intro">' + esc(t("planhd.fin.texte", { fichier: nomZip })) + '</p>' +
          (infos.planFerme ? '<p class="kta-fp-ajouts-intro">' + esc(t("planhd.fin.planFerme")) + '</p>' : '') +
        '</div>' +
        '<div class="kta-fp-footer">' +
          '<button type="button" class="kta-btn kta-btn-ghost" data-planhd-fin="fermer">' + esc(t("planhd.fin.fermer")) + '</button>' +
          '<button type="button" class="kta-btn kta-btn-ghost" data-planhd-fin="telecharger">' + esc(t("planhd.fin.telecharger")) + '</button>' +
          '<button type="button" class="kta-btn kta-btn-primary" data-planhd-fin="ouvrir">' + esc(t("planhd.fin.ouvrir")) + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(ov);
    let occupe = false;
    ov.addEventListener("click", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-planhd-fin]");
      if (occupe || (!b && ev.target !== ov)) return;
      const cle = b ? b.getAttribute("data-planhd-fin") : "fermer";
      if (cle === "fermer") { ov.remove(); return; }
      if (cle === "telecharger") { _telecharger(blob, nomZip); _toast(t("planhd.fin.telecharge"), "success"); return; }
      occupe = true;
      ov.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
      _ajouter(etat, blob, nomZip, infos).then(function () { ov.remove(); }, function () {
        occupe = false;
        ov.querySelectorAll("button").forEach(function (x) { x.disabled = false; });
      });
    });
  }

  // Nouveau plan local sous un identifiant libre, archive gardée ; liaisons du plan d'origine recopiées.
  async function _ajouter(etat, blob, nomZip, infos) {
    const PR = window.PlanRegistry;
    if (!PR || typeof window.chargerZipFichier !== "function") throw new Error("chargerZipFichier");
    const nom = infos.nom || nomZip;
    const id = idLibre(PR, nom, infos.version, etat.planSource);
    const fichier = new File([blob], nomZip, { type: "application/zip" });
    try {
      await window.chargerZipFichier(fichier, "auto", { planId: id, storeBlob: true, zipFile: fichier });
    } catch (er) {
      console.warn("[PlanHD] ouverture :", er);
      _telecharger(blob, nomZip);   // le ZIP n'est pas perdu
      await window.ktaAlerte(t("planhd.err.ouverture", { err: (er && er.message) || String(er) }), { type: "erreur" });
      throw er;
    }
    const photos = await _copierPhotos(blob, id).catch(function (er) {
      console.warn("[PlanHD] photos non recopiées :", er);
      return 0;
    });
    const IPL = window.InterPlanLinks;
    let n = 0;
    if (IPL && typeof IPL.getLinksForPlan === "function" && typeof IPL.importLinks === "function") {
      const base = "ipl_" + Date.now().toString(36) + "_";
      n = IPL.importLinks(liaisonsPourNouveauPlan(IPL.getLinksForPlan(etat.planSource), etat.planSource, id, nom, etat.k,
        function (i) { return base + Math.random().toString(36).slice(2, 8) + i; }));
    }
    console.log("[PlanHD] nouveau plan « " + id + " » ajouté, " + photos + " photo(s) et " + n + " liaison(s) recopiée(s)");
    _toast(t("planhd.fin.ajoute"), "success");
  }

  // 🩸 Les photos sont rangées par identifiant, tous plans confondus : au chargement, une photo du ZIP déjà en base
  // (main.js > startImportedPlan, « déjà là ») n'est pas restaurée — elle reste à l'ancien plan et le nouveau n'en
  // a aucune. Sur CET appareil, celles que le Générateur a embarquées sont donc recopiées pour le nouveau plan,
  // sous un identifiant neuf, rattachées au même point (clé de l'index : son uid). Sans marque d'origine « plan » :
  // le tri du chargement suivant ne les retire jamais.
  async function _copierPhotos(blob, planId) {
    const MP = window.MyKTAMapPhotos;
    if (!MP || typeof MP.restorePhoto !== "function") return 0;
    const z = await window.JSZip.loadAsync(blob);
    const f = z.file("data/photos/_index.json");
    if (!f) return 0;
    const idx = (JSON.parse(await f.async("string")) || {}).photos || {};
    const ici = await MP.getAllPhotosForPlan(planId);
    const deja = new Set(ici.map(function (r) { return String((r.meta && r.meta.copieDe) || r.id); }));
    let n = 0;
    for (const pid of Object.keys(idx)) {
      if (deja.has(pid)) continue;
      const rec = await MP.getPhoto(pid);
      if (!rec || !rec.blob) continue;   // absente de l'appareil : le chargement l'a restaurée sous son id
      await MP.restorePhoto({
        id: MP.generateId(), planId: planId, pointId: String(idx[pid].pointId || rec.pointId), blob: rec.blob,
        mime: rec.mime, size: rec.size, createdAt: rec.createdAt, priseLe: rec.priseLe, fiche: rec.fiche,
        meta: { copieDe: pid }
      }, { source: "import" });
      n++;
    }
    return n;
  }

  window.ktaOuvrirPlanHD = ouvrir;
})();
