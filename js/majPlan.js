/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// MAJPLAN.JS — Assistant « Mettre à jour le plan » : de la session à une nouvelle version du plan
// =====================================================================
// 1. Calques en modification (js/calqueSession.js) coches : chacun remplace son fichier.
// 2. Objets dessinés à la main, groupés par étiquette (points) ou par type (tracés, zones, structures), comme la
//    Conversion : par groupe, un calque du plan, un nouveau calque, ou laissés dans la session.
// 3. Le Générateur s'ouvre en mode Modifier sur le ZIP actuel du plan, déjà rempli (createConf.js >
//    ktaGenerateurMaj) ; l'utilisateur vérifie et génère. Avec le tuilage V2, le Générateur ferme d'abord le plan
//    (confirmation) pour libérer la mémoire : la suite le rouvre (remplacement, publication) ou laisse l'accueil.
// 4. Plan local : télécharger, ou remplacer dans l'app. Plan d'une extension : nouvelle version par la prise
//    `publierVersion` si l'extension l'autorise, sinon téléchargement seul. Plan du site : téléchargement.
// Après un remplacement ou une publication : rendre les calques (restitution, partagée sur un plan d'extension) et
// retirer de la session les objets versés (CalqueSession.retirerIntegres), sinon ils s'affichent en double.
// 🔒 Entrée refusée en lecture seule et sans le droit d'exporter tout le plan (le fichier d'un calque EST le plan).
// 🩸 Un objet versé est écrit daté de l'assistant (`updatedAt` = T) : la trace de suppression posée à T - 1 au
//    retrait ne peut pas le détruire dans le fichier (cf. CalqueSession.retirerIntegres).
// API : window.MajPlan = { ouvrir, _interne: { grouper, slug, construire } }. Garde-fou : check-maj-plan.js.
// Doc : docs/architecture/plans-loader.md (§ Mettre à jour le plan).

window.MajPlan = (function () {
  "use strict";

  const MAX_CALQUES = 10;   // plafond des calques de données du Générateur (_ajouterDataLayer)
  const FAMILLES = [
    { cle: "editorPoints", lc: "icones",     cible: "data" },
    { cle: "roads",        lc: "traces",     cible: "roads" },
    { cle: "zones",        lc: "zones",      cible: "zones" },
    { cle: "structures",   lc: "structures", cible: "structures" }
  ];

  const t = function (k, p) { return window.I18n.t(k, p); };
  const esc = function (s) { return window.ktaEsc(s); };
  function _log(m, x) { if (x !== undefined) console.log("[MajPlan] " + m, x); else console.log("[MajPlan] " + m); }

  function _toast(msg, type) {
    const O = window.OOMGuard;
    if (O && typeof O.showToast === "function") O.showToast(msg, type || "info");
  }

  function _libelle(cat, cle) {
    try {
      const LC = window.LegendCustomization;
      if (LC && typeof LC.getLabel === "function") return LC.getLabel(cat, cle) || cle;
    } catch (e) { /* libellé brut */ }
    return cle;
  }

  function _calquesDuPlan() {
    const pc = window.PLAN_CONFIG;
    return ((pc && Array.isArray(pc.dataLayers)) ? pc.dataLayers : []).filter(function (d) {
      return d && d.id && d.id !== "editor";
    });
  }

  // ── Étape 2 : groupes des objets dessinés à la main ──────────
  // `cand` = CalqueSession.candidatsAjout(). Un point va dans le groupe de sa PREMIÈRE étiquette (celle de son
  // icône) : un objet ne doit partir que dans un calque. → [{ cle, famille, type, objets }]
  function grouper(cand) {
    const out = [];
    FAMILLES.forEach(function (fam) {
      const parCle = new Map();
      ((cand && cand[fam.cle]) || []).forEach(function (o) {
        const type = (fam.cle === "editorPoints")
          ? ((Array.isArray(o.tags) && o.tags.length && o.tags[0]) ? String(o.tags[0]) : "")
          : String(o.type || "");
        if (!parCle.has(type)) parCle.set(type, []);
        parCle.get(type).push(o);
      });
      Array.from(parCle.keys()).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (type) {
        out.push({ cle: fam.cle + "|" + type, famille: fam.cle, type: type, objets: parCle.get(type) });
      });
    });
    return out;
  }

  function _libelleGroupe(g) {
    const fam = FAMILLES.find(function (f) { return f.cle === g.famille; });
    if (g.famille === "editorPoints" && !g.type) return t("maj.groupe.sansEtiquette");
    return _libelle(fam.lc, g.type);
  }

  // Identifiant de calque tiré d'un nom : minuscules sans accent, [a-z0-9_-], 40 caractères, unique dans `pris`.
  function slug(nom, pris) {
    let base = String(nom || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9_-]+/g, "_");
    // Bords « _ » retirés sans regex ancrée des deux côtés (retour arrière super-linéaire signalé par Sonar).
    let d = 0, f = base.length;
    while (d < f && base[d] === "_") d++;
    while (f > d && base[f - 1] === "_") f--;
    base = base.slice(d, f).slice(0, 40);
    if (!base || base === "editor") base = "calque";
    let id = base, n = 2;
    while (pris.has(id)) id = base + "_" + (n++);
    return id;
  }

  // ── Construction des fichiers de calque (pure, hors réseau) ──────────
  // entrée : { T, calques: [{ id, label, base, copies }], groupes: [{ objets, cible: { id, label, nouveau } }] }
  //   base   = JSON d'origine du calque (ses autres champs sont gardés), copies = CalqueSession.contenuCalque().payload
  //            (null : le calque n'est pas remplacé, ses objets d'origine restent)
  // → { calques: [{ id, label, nouveau, payload }], uids: [...] }
  function construire(e) {
    const parId = new Map();
    const uids = [];
    const prendre = function (id, label, base, nouveau) {
      if (parId.has(id)) return parId.get(id);
      const p = Object.assign({}, base || {});
      const data = Array.isArray(p.data) && p.data.length ? p.data
        : (Array.isArray(p.editorPoints) ? p.editorPoints : []);
      delete p.editorPoints;
      p.data = data.slice();
      ["roads", "zones", "structures"].forEach(function (k) { p[k] = Array.isArray(p[k]) ? p[k].slice() : []; });
      const c = { id: id, label: label || id, nouveau: !!nouveau, payload: p };
      parId.set(id, c);
      return c;
    };
    (e.calques || []).forEach(function (c) {
      const x = prendre(c.id, c.label, c.base, false);
      // 🩸 Remplacement : les tableaux de la copie remplacent ceux du fichier, VIDES compris (une suppression
      // faite en session doit tenir).
      if (c.copies) ["data", "roads", "zones", "structures"].forEach(function (k) {
        x.payload[k] = (c.copies[k] || []).slice();
      });
    });
    (e.groupes || []).forEach(function (g) {
      if (!g.cible || !g.cible.id) return;
      const x = prendre(g.cible.id, g.cible.label, g.cible.base, g.cible.nouveau);
      const fam = FAMILLES.find(function (f) { return f.cle === g.famille; });
      g.objets.forEach(function (o) {
        const c = JSON.parse(JSON.stringify(o));
        c.updatedAt = e.T;
        x.payload[fam.cible].push(c);
        if (typeof o.uid === "string" && o.uid) uids.push(o.uid);
      });
    });
    return { calques: Array.from(parId.values()), uids: uids };
  }

  function _lireCalque(lc) {
    if (!lc || !lc.file) return Promise.resolve({});
    return fetch(lc.file).then(function (r) { return r.json(); }).catch(function (er) {
      console.warn("[MajPlan] calque « " + lc.id + " » illisible, repris vide :", er);
      return {};
    });
  }

  // ZIP actuel du plan ouvert : copie gardée, sinon l'extension ou l'index du site. null si l'appareil ne l'a pas
  // (plan du site servi en dossier, plan local ouvert sans copie) : le Générateur attend alors qu'on le dépose.
  async function _zipDuPlan(e) {
    const PR = window.PlanRegistry;
    try {
      if (e.storedBlob && PR && typeof PR.getBlob === "function") {
        const b = await PR.getBlob(e.id);
        if (b) { await b.slice(0, 4).arrayBuffer(); return b; }
      }
    } catch (er) { console.warn("[MajPlan] copie gardée illisible :", er); }
    const X = window.KtaExtensions;
    if (e.type === "ext" && X && typeof X.chargerPlanExtension === "function") {
      try { return await X.chargerPlanExtension(e.extId || e.id); }
      catch (er) { console.warn("[MajPlan] plan de l'extension indisponible :", er); }
    }
    if (e.type === "server" && e.zip) {
      try { const r = await fetch(e.zip); if (r.ok) return await r.blob(); }
      catch (er) { console.warn("[MajPlan] ZIP du site indisponible :", er); }
    }
    return null;
  }

  // ── Fenêtre des étapes 1 et 2 ──────────
  let _ov = null;

  function _fermer() {
    if (_ov) { _ov.remove(); _ov = null; }
    document.removeEventListener("keydown", _onKey, true);
  }
  function _onKey(ev) { if (ev.key === "Escape") { ev.stopPropagation(); _fermer(); } }

  function ouvrir() {
    const CS = window.CalqueSession;
    if (!CS || !window.PLAN_CONFIG || !window._currentLoadedPlanId) return false;
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;   // le dit
    if (typeof window.ktaExportPlanRefuse === "function" && window.ktaExportPlanRefuse()) return false;  // le dit
    const rapatries = CS.listeRapatries();
    const groupes = grouper(CS.candidatsAjout());
    if (!rapatries.length && !groupes.length) {
      window.ktaAlerte(t("maj.rien"), { titre: t("maj.titre") });
      return false;
    }
    if (window.FilterPanel && typeof window.FilterPanel.fermer === "function") {
      try { window.FilterPanel.fermer(); } catch (e) { /* déjà fermé */ }
    }
    _fermer();
    const calques = _calquesDuPlan();
    const optionsCible = '<option value="">' + esc(t("maj.cible.laisser")) + '</option>' +
      calques.map(function (d) {
        return '<option value="c:' + esc(d.id) + '">' +
          esc(t("maj.cible.calque", { calque: d.label || d.id })) + '</option>';
      }).join("") +
      '<option value="n">' + esc(t("maj.cible.nouveau")) + '</option>';

    const html1 = rapatries.length
      ? '<div class="kta-fp-list">' + rapatries.map(function (id) {
          const a = CS.compterAjouts(id);
          return '<label class="kta-fp-row-cb"><input type="checkbox" data-maj-calque="' + esc(id) + '" checked>' +
                 '<span>📊 ' + esc(CS.libelle(id)) + '<span class="kta-fp-ajouts-meta"> · ' +
                 esc(t("maj.calque.objets", { n: CS.compterCopie(id) })) +
                 (a ? " · " + esc(t("maj.calque.ajouts", { n: a })) : "") + '</span></span></label>';
        }).join("") + '</div>'
      : '<div class="kta-fp-section-empty">' + esc(t("maj.etape1.vide")) + '</div>';

    const html2 = groupes.length
      ? groupes.map(function (g, i) {
          const fam = FAMILLES.find(function (f) { return f.cle === g.famille; });
          const pastille = (g.famille === "editorPoints" || typeof window.ktaTypeSwatchHtml !== "function") ? ""
            : (window.ktaTypeSwatchHtml(fam.lc, g.type) || "") + " ";
          return '<div class="kta-maj-groupe">' +
                   '<div class="kta-maj-groupe-titre">' + pastille + esc(_libelleGroupe(g)) +
                     '<span class="kta-fp-ajouts-meta"> · ' + esc(t("filter.ajouts.famille." + g.famille)) +
                     ' (' + g.objets.length + ')</span></div>' +
                   '<select class="kta-cfg-input" data-maj-groupe="' + i + '">' + optionsCible + '</select>' +
                   '<input class="kta-cfg-input" type="text" maxlength="40" data-maj-nom="' + i + '" hidden>' +
                 '</div>';
        }).join("")
      : '<div class="kta-fp-section-empty">' + esc(t("maj.etape2.vide")) + '</div>';

    _ov = document.createElement("div");
    _ov.id = "kta-maj-plan";
    _ov.className = "kta-readme-modal-overlay";
    _ov.style.zIndex = "100001";
    _ov.innerHTML =
      '<div class="kta-readme-modal-boite kta-fp-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + esc(t("maj.titre")) + '</span>' +
          '<button class="kta-panneau-close" data-maj-fermer type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-fp-corps">' +
          '<p class="kta-fp-ajouts-intro">' + esc(t("maj.intro")) + '</p>' +
          '<div class="kta-maj-etape">' + esc(t("maj.etape1.titre")) + '</div>' +
          '<p class="kta-fp-ajouts-intro">' + esc(t("maj.etape1.aide")) + '</p>' + html1 +
          '<div class="kta-maj-etape">' + esc(t("maj.etape2.titre")) + '</div>' +
          '<p class="kta-fp-ajouts-intro">' + esc(t("maj.etape2.aide")) + '</p>' + html2 +
          '<div class="kta-conv-erreur" id="kta-maj-erreur" hidden></div>' +
        '</div>' +
        '<div class="kta-fp-footer">' +
          '<button type="button" class="kta-btn kta-btn-ghost" data-maj-fermer>' + esc(t("maj.annuler")) + '</button>' +
          '<button type="button" class="kta-btn kta-btn-primary" id="kta-maj-suivant">' + esc(t("maj.suivant")) +
          '</button>' +
        '</div>' +
      '</div>';

    _ov.addEventListener("change", function (ev) {
      const sel = ev.target.closest && ev.target.closest("[data-maj-groupe]");
      if (!sel) return;
      const i = sel.getAttribute("data-maj-groupe");
      const nom = _ov.querySelector('[data-maj-nom="' + i + '"]');
      nom.hidden = sel.value !== "n";
      if (!nom.hidden && !nom.value) nom.value = _libelleGroupe(groupes[Number(i)]);
    });
    _ov.addEventListener("click", function (ev) {
      const c = ev.target;
      if (c === _ov || (c.closest && c.closest("[data-maj-fermer]"))) { _fermer(); return; }
      if (c.id === "kta-maj-suivant") _valider(groupes, calques);
    });
    document.addEventListener("keydown", _onKey, true);
    document.documentElement.appendChild(_ov);
    return true;
  }

  function _erreur(msg) {
    const el = _ov && _ov.querySelector("#kta-maj-erreur");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  // ── Étape 3 : construire, puis ouvrir le Générateur prérempli ──────────
  async function _valider(groupes, calques) {
    const CS = window.CalqueSession;
    const coches = Array.prototype.map.call(_ov.querySelectorAll("[data-maj-calque]:checked"), function (cb) {
      return cb.getAttribute("data-maj-calque");
    });
    const pris = new Set(calques.map(function (d) { return d.id; }).concat(["editor"]));
    const nouveaux = new Map();   // nom saisi (minuscules) → { id, label } : même nom = même calque
    const choix = [];
    for (let i = 0; i < groupes.length; i++) {
      const v = _ov.querySelector('[data-maj-groupe="' + i + '"]').value;
      if (!v) continue;
      if (v === "n") {
        const nom = String(_ov.querySelector('[data-maj-nom="' + i + '"]').value || "").trim();
        if (!nom) { _erreur(t("maj.err.nomVide")); return; }
        const k = nom.toLowerCase();
        if (!nouveaux.has(k)) { const id = slug(nom, pris); pris.add(id); nouveaux.set(k, { id: id, label: nom }); }
        choix.push({ g: groupes[i], cible: Object.assign({ nouveau: true }, nouveaux.get(k)) });
      } else {
        const lc = calques.find(function (d) { return "c:" + d.id === v; });
        if (lc) choix.push({ g: groupes[i], cible: { id: lc.id, label: lc.label || lc.id, lc: lc } });
      }
    }
    if (!coches.length && !choix.length) { _erreur(t("maj.err.rien")); return; }
    if (calques.length + nouveaux.size > MAX_CALQUES) {
      _erreur(t("maj.err.tropDeCalques", { max: MAX_CALQUES })); return;
    }
    const btn = _ov.querySelector("#kta-maj-suivant");
    btn.disabled = true;
    btn.textContent = t("maj.preparation");
    try {
      // Fichier d'origine relu pour chaque calque touché (ses autres champs restent) ; nouveau calque : rien.
      const bases = new Map();
      const aLire = new Set(coches);
      choix.forEach(function (c) { if (!c.cible.nouveau) aLire.add(c.cible.id); });
      for (const id of aLire) {
        bases.set(id, await _lireCalque(calques.find(function (d) { return d.id === id; })));
      }
      const entreeCalques = [];
      for (const id of coches) {
        const r = CS.contenuCalque(id);
        if (!r.ok) { _erreur(t("filter.calque.err", { code: r.code })); btn.disabled = false; return; }
        entreeCalques.push({ id: id, label: CS.libelle(id), base: bases.get(id), copies: r.payload });
      }
      const T = Date.now();
      const res = construire({
        T: T,
        calques: entreeCalques,
        groupes: choix.map(function (c) {
          return { famille: c.g.famille, objets: c.g.objets,
                   cible: { id: c.cible.id, label: c.cible.label, nouveau: !!c.cible.nouveau,
                            base: c.cible.nouveau ? null : bases.get(c.cible.id) } };
        })
      });
      // Légende des types référencés (types créés sur le terrain compris), reprise par la légende du plan.
      const tout = { data: [], roads: [], zones: [], structures: [] };
      res.calques.forEach(function (c) {
        ["data", "roads", "zones", "structures"].forEach(function (k) { tout[k] = tout[k].concat(c.payload[k]); });
      });
      const legende = typeof window.ktaLegendePourCalque === "function" ? window.ktaLegendePourCalque(tout) : null;

      const entree = window.PlanRegistry.findById(window._currentLoadedPlanId);
      if (!entree) { _erreur(t("maj.err.planInconnu")); btn.disabled = false; return; }
      const blob = await _zipDuPlan(entree);
      const etat = { planId: entree.id, T: T, rendus: coches, uids: res.uids };
      _fermer();
      _log("Générateur prérempli : " + res.calques.length + " calque(s), " + res.uids.length + " objet(s) versé(s)");
      if (typeof window.ktaGenerateurMaj !== "function") return;
      await window.ktaGenerateurMaj({
        zip: blob ? new File([blob], (entree.name || entree.id) + ".zip", { type: "application/zip" }) : null,
        calques: res.calques.map(function (c) { return { id: c.id, label: c.label, payload: c.payload }; }),
        legende: legende,
        onZip: function (zipBlob, nomZip, infos) {
          etat.planFerme = !!(infos && infos.planFerme);
          _etape4(etat, zipBlob, nomZip);
        }
      });
    } catch (er) {
      console.warn("[MajPlan] préparation :", er);
      _erreur(t("maj.err.preparation", { err: (er && er.message) || String(er) }));
      if (btn) { btn.disabled = false; btn.textContent = t("maj.suivant"); }
    }
  }

  // ── Étape 4 : la suite selon l'origine du plan ──────────
  function _telecharger(blob, nom) {
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url; a.download = nom;
      a.click();
    } finally { setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  }

  function _etape4(etat, blob, nomZip) {
    const PR = window.PlanRegistry;
    const entree = PR.findById(etat.planId);
    const X = window.KtaExtensions;
    const type = entree ? entree.type : "local";
    const peutPublier = type === "ext" && !!X && typeof X.versionAutorisee === "function" &&
      X.versionAutorisee(etat.planId);
    const actions = [{ cle: "telecharger", libelle: t("maj.fin.telecharger"),
                       primaire: type !== "local" && !peutPublier }];
    let note = "";
    if (type === "local") actions.push({ cle: "remplacer", libelle: t("maj.fin.remplacer"), primaire: true });
    else if (peutPublier) actions.push({ cle: "publier", libelle: t("maj.fin.publier"), primaire: true });
    else if (type === "ext") note = t("maj.fin.noteModifier");
    else note = t("maj.fin.noteSite");
    const noteFerme = etat.planFerme ? t(actions.length > 1 ? "maj.fin.planFermeRouvre" : "maj.fin.planFerme") : "";

    const ov = document.createElement("div");
    ov.id = "kta-maj-fin";
    ov.className = "kta-readme-modal-overlay";
    ov.style.zIndex = "100001";
    ov.innerHTML =
      '<div class="kta-readme-modal-boite kta-fp-boite">' +
        '<div class="kta-readme-modal-header"><span class="kta-readme-modal-titre">' + esc(t("maj.fin.titre")) +
          '</span><button class="kta-panneau-close" data-maj-fin="fermer" type="button">✕</button></div>' +
        '<div class="kta-readme-modal-corps kta-fp-corps">' +
          '<p class="kta-fp-ajouts-intro">' + esc(t("maj.fin.texte", { fichier: nomZip })) + '</p>' +
          (note ? '<p class="kta-fp-ajouts-intro kta-tx-warn">' + esc(note) + '</p>' : '') +
          (noteFerme ? '<p class="kta-fp-ajouts-intro">' + esc(noteFerme) + '</p>' : '') +
        '</div>' +
        '<div class="kta-fp-footer">' +
          '<button type="button" class="kta-btn kta-btn-ghost" data-maj-fin="fermer">' + esc(t("maj.fin.fermer")) +
          '</button>' +
          actions.map(function (a) {
            return '<button type="button" class="kta-btn ' + (a.primaire ? "kta-btn-primary" : "kta-btn-ghost") +
                   '" data-maj-fin="' + a.cle + '">' + esc(a.libelle) + '</button>';
          }).join("") +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(ov);
    let occupe = false;
    ov.addEventListener("click", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-maj-fin]");
      if (occupe || (!b && ev.target !== ov)) return;
      const cle = b ? b.getAttribute("data-maj-fin") : "fermer";
      if (cle === "fermer") { ov.remove(); return; }
      if (cle === "telecharger") { _telecharger(blob, nomZip); _toast(t("maj.fin.telecharge"), "success"); return; }
      occupe = true;
      ov.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
      const suite = (cle === "remplacer") ? _remplacer(etat, blob, nomZip) : _publier(etat, blob, nomZip);
      suite.then(function () { ov.remove(); }, function () {
        occupe = false;
        ov.querySelectorAll("button").forEach(function (x) { x.disabled = false; });
      });
    });
  }

  // Proposer le retrait : rendre les calques versés, retirer de la session les objets versés.
  async function _proposerNettoyage(etat, partage) {
    const CS = window.CalqueSession;
    const rendus = etat.rendus.filter(function (id) { return CS.estRapatrie(id); });
    if (!rendus.length && !etat.uids.length) return;
    const ok = await window.ktaConfirm(esc(t(partage ? "maj.nettoyage.texteEquipe" : "maj.nettoyage.texte",
      { calques: rendus.length, objets: etat.uids.length })), {
      titre: esc(t("maj.nettoyage.titre")),
      okLabel: esc(t("maj.nettoyage.oui")),
      cancelLabel: esc(t("maj.nettoyage.non"))
    });
    if (!ok) return;
    let n = 0;
    rendus.forEach(function (id) { const r = CS.restituer(id); if (r && r.ok) n++; });
    const r2 = CS.retirerIntegres(etat.uids, etat.T);
    _toast(t("maj.nettoyage.fait", { calques: n, objets: (r2 && r2.retires) || 0 }), "success");
    if (r2 && r2.gardes) _toast(t("maj.nettoyage.gardes", { n: r2.gardes }), "warn");
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch (e) { /* sauvegarde suivante */ }
    }
  }

  // Le plan de l'assistant est-il encore ouvert ? Le Générateur l'a fermé avant un tuilage V2 : le retrait des
  // objets versés attend alors la réouverture (la session d'un plan fermé ne s'enregistre plus).
  function _planOuvert(etat) {
    return !etat.planFerme && window._currentLoadedPlanId === etat.planId &&
      (typeof window.ktaPlanAffiche !== "function" || window.ktaPlanAffiche());
  }

  // Plan local : la nouvelle archive prend la place de l'ancienne sous le MÊME id (session, calage, photos et
  // favoris restent attachés). Plan encore ouvert : le retrait se fait AVANT, la session rechargée avec le plan est
  // alors déjà propre. Plan fermé par le Générateur : APRÈS la réouverture, sur la session restaurée.
  async function _remplacer(etat, blob, nomZip) {
    const entree = window.PlanRegistry.findById(etat.planId);
    if (!entree || typeof window.chargerZipFichier !== "function") throw new Error("plan introuvable");
    const avant = _planOuvert(etat);
    if (avant) await _proposerNettoyage(etat, false);
    const fichier = new File([blob], nomZip, { type: "application/zip" });
    try {
      await window.chargerZipFichier(fichier, entree.perfPreset || "auto",
        { planId: entree.id, storeBlob: true, zipFile: fichier });
      _toast(t("maj.fin.remplace"), "success");
      if (!avant && window._currentLoadedPlanId === etat.planId) await _proposerNettoyage(etat, false);
    } catch (er) {
      console.warn("[MajPlan] remplacement :", er);
      // Le ZIP n'est pas perdu : il part en téléchargement.
      _telecharger(blob, nomZip);
      await window.ktaAlerte(t("maj.err.remplacement", { err: (er && er.message) || String(er) }), { type: "erreur" });
    }
  }

  // Plan d'une extension : nouvelle version. 🔒 Le droit est revérifié par l'extension (et son serveur) à l'envoi.
  async function _publier(etat, blob, nomZip) {
    const entree = window.PlanRegistry.findById(etat.planId);
    _toast(t("maj.fin.publication"), "info");
    try {
      await window.KtaExtensions.publierVersion({ planId: etat.planId, blob: blob,
                                                  nom: (entree && entree.name) || nomZip });
    } catch (er) {
      console.warn("[MajPlan] publication de la version :", er);
      await window.ktaAlerte(t("maj.err.publication", { err: (er && er.message) || String(er) }), { type: "erreur" });
      throw er;
    }
    _toast(t("maj.fin.publie"), "success");
    const avant = _planOuvert(etat);
    if (avant) await _proposerNettoyage(etat, true);
    // Rouvrir sur la nouvelle version (la copie gardée est périmée : l'extension la retélécharge).
    if (typeof window.chargerPlanDuRegistre === "function") {
      try { await window.chargerPlanDuRegistre(etat.planId); }
      catch (er) { console.warn("[MajPlan] réouverture :", er); }
    }
    if (!avant && window._currentLoadedPlanId === etat.planId) await _proposerNettoyage(etat, true);
  }

  return { ouvrir: ouvrir, _interne: { grouper: grouper, slug: slug, construire: construire } };
})();

console.log("[MajPlan] Module charge — API window.MajPlan prete");
