// =====================================================================
// 🔄 convertirObjet.js — changer un objet de TYPE, et au besoin de FAMILLE
// =====================================================================
// LE BESOIN, ET POURQUOI IL N'EST PAS COSMÉTIQUE (KARMA, 03/09/2026) :
// à l'import SIG d'un relevé de carrière, tout part en « front de taille » —
// globalement juste, puisque la géométrie d'un fichier SIG ne dit pas ce que
// l'objet EST. Mais certains vecteurs sont en réalité des GALERIES.
//
// Or le Pathfinder construit son graphe UNIQUEMENT sur les `roads`
// (`getRoads` + `getAllEmbeddedRoads`) : les structures n'y sont ni arêtes ni
// obstacles. Un plan dont tout le relevé est en structures n'a donc pas
// « un itinéraire médiocre » — il n'a AUCUN itinéraire possible. Reclasser un
// vecteur est ce qui le fait exister.
//
// LA RÈGLE, ÉNONCÉE PAR KARMA : « un vecteur fermé = zone ou pilier, un
// vecteur non fermé = tracé ou front de taille ». On s'y tient strictement :
//
//     OUVERT   ⇄   tracés (galeries)  ⇄  structures polylignes (fronts)
//     FERMÉ    ⇄   zones              ⇄  structures polygones (piliers, murs)
//
// La frontière ouvert/fermé n'est pas une convention : elle porte les
// MINIMUMS DE POINTS. Un front de taille peut n'avoir que 2 points ; une zone
// en exige 3. Autoriser la traversée obligerait à fermer ou ouvrir la
// géométrie — c'est-à-dire à INVENTER de la donnée relevée sur le terrain.
// Refus assumé, et dit à l'utilisateur.
//
// CE QUI EST CONSERVÉ : la géométrie (`points`), le NIVEAU (`level`) et la
// note (`description`). Seul le type — et donc la famille — change.
//
// ⛔ EXCLUS DES CIBLES :
//   • `jonction`  — porte `fromLevel`/`toLevel`, deux niveaux qu'une
//                   conversion ne peut pas deviner. Elle se crée par l'outil
//                   multi-niveau, qui les demande.
//   • `itinerary` — c'est le trajet CALCULÉ, pas une donnée du relevé.
//
// ⚠️ SESSION UNIQUEMENT. Un objet de calque de données n'est pas éditable en
// place (le calque est en lecture seule, cf. tableEditor : export-only). Le
// chemin, c'est « Session → Conversion » pour rapatrier le calque, puis ici.
// =====================================================================

(function () {
  "use strict";

  // Famille de stockage ← → catégorie de légende. `roads` se dit `traces`
  // côté LegendCustomization : le décalage est historique, on le traverse ici
  // une fois pour toutes plutôt que dans chaque appel.
  const CAT_DE_FAMILLE = { roads: "traces", zones: "zones", structures: "structures" };
  const FAMILLE_DE_CAT = { traces: "roads", zones: "zones", structures: "structures" };

  // Types de tracés qui ne peuvent pas être une CIBLE (cf. en-tête).
  const CIBLES_INTERDITES = { jonction: true, itinerary: true };

  function _t(cle, params) {
    return (window.I18n && typeof window.I18n.t === "function")
      ? window.I18n.t(cle, params) : cle;
  }

  // Un objet est-il OUVERT (polyligne) ou FERMÉ (polygone) ?
  // Ce n'est pas la géométrie qui tranche mais le TYPE : les mêmes `points`
  // se peignent en trait ou en surface selon lui. `isStructurePolylineType`
  // sait déjà lire la géométrie déclarée dans la légende, customs compris.
  function _estOuvert(famille, type) {
    if (famille === "roads") return true;
    if (famille === "zones") return false;
    return (typeof window.isStructurePolylineType === "function")
      ? !!window.isStructurePolylineType(type) : false;
  }

  function _libelle(cat, cle) {
    try {
      const LC = window.LegendCustomization;
      if (LC && typeof LC.getLabel === "function") {
        const l = LC.getLabel(cat, cle);
        if (l) return l;
      }
    } catch (e) {}
    return cle;
  }

  function _pastille(cat, cle) {
    try {
      if (typeof window.ktaTypeSwatchHtml === "function") {
        return window.ktaTypeSwatchHtml(cat, cle) || "";
      }
    } catch (e) {}
    return "";
  }

  // Toutes les cibles compatibles avec l'objet source, built-in ET custom.
  // Retourne [{ cat, famille, type, label, swatch }], la source exclue.
  function listerCibles(famille, type) {
    const ouvert = _estOuvert(famille, type);
    const out = [];
    const cats = ouvert ? ["traces", "structures"] : ["zones", "structures"];

    cats.forEach(function (cat) {
      const famCible = FAMILLE_DE_CAT[cat];
      // Built-in
      const builtins = (typeof window.ktaStyleBuiltins === "function")
        ? (window.ktaStyleBuiltins(cat) || []) : [];
      builtins.forEach(function (cle) {
        if (cat === "traces" && CIBLES_INTERDITES[cle]) return;
        // Dans « structures », seuls les types de la BONNE géométrie.
        if (cat === "structures" && _estOuvert("structures", cle) !== ouvert) return;
        if (famCible === famille && cle === type) return;   // c'est la source
        out.push({ cat: cat, famille: famCible, type: cle,
                   label: _libelle(cat, cle), swatch: _pastille(cat, cle) });
      });
      // Custom — mêmes règles. Sans eux, un plan importé n'aurait presque
      // aucune cible : ses types sont tous personnalisés.
      let customs = [];
      try {
        const LC = window.LegendCustomization;
        if (LC && typeof LC.listCustomEntries === "function") {
          customs = LC.listCustomEntries(cat) || [];
        }
      } catch (e) {}
      customs.forEach(function (e) {
        if (!e || !e.id) return;
        if (cat === "structures" && _estOuvert("structures", e.id) !== ouvert) return;
        if (famCible === famille && e.id === type) return;
        out.push({ cat: cat, famille: famCible, type: e.id,
                   label: e.label || e.id, swatch: _pastille(cat, e.id) });
      });
    });
    return out;
  }

  // ─────────────────────────────────────────────
  // L'OPÉRATION
  // ─────────────────────────────────────────────
  // 🩸 Les trois listes sont lues d'un bloc AVANT toute écriture. Sinon une
  // conversion à l'intérieur d'une même famille (front → pilier) retirerait
  // l'objet, réécrirait la liste, puis la relirait — et perdrait l'ajout.
  // On n'écrit ensuite QUE les familles réellement touchées : `setStructures`
  // relance un rendu complet, ce qui coûte cher sur un relevé à 20 000 objets.
  // Les accesseurs des trois familles. HISSES ici (et non dans `convertir`)
  // depuis que la suppression existe : elle a besoin des memes, et une 4e
  // copie de cette table serait exactement la dette qu on vient de solder
  // ailleurs. Lus a chaque appel — `window.setRoads` peut ne pas encore
  // exister au chargement du module.
  function _lire(famille) {
    const g = { roads: "getRoads", zones: "getZones", structures: "getStructures" }[famille];
    return (g && typeof window[g] === "function") ? (window[g]() || []) : [];
  }
  function _ecrivain(famille) {
    const s = { roads: "setRoads", zones: "setZones", structures: "setStructures" }[famille];
    return (s && typeof window[s] === "function") ? window[s] : null;
  }

  function convertir(famille, obj, familleCible, typeCible) {
    if (!obj || !famille || !familleCible || !typeCible) return false;
    const lire = {
      roads:      function () { return _lire("roads"); },
      zones:      function () { return _lire("zones"); },
      structures: function () { return _lire("structures"); }
    };
    const ecrire = {
      roads:      _ecrivain("roads"),
      zones:      _ecrivain("zones"),
      structures: _ecrivain("structures")
    };
    if (typeof ecrire[famille] !== "function" || typeof ecrire[familleCible] !== "function") {
      console.warn("[Convertir] setteur manquant :", famille, "→", familleCible);
      return false;
    }

    const avant = (window.HistoryManager && window.HistoryManager.captureState)
      ? window.HistoryManager.captureState() : null;

    const listes = {
      roads:      lire.roads().slice(),
      zones:      lire.zones().slice(),
      structures: lire.structures().slice()
    };
    const idx = listes[famille].indexOf(obj);
    if (idx < 0) {
      console.warn("[Convertir] objet introuvable dans", famille);
      return false;
    }
    listes[famille].splice(idx, 1);

    // On repart de l'objet d'origine pour ne rien perdre de ce qu'il porte
    // (champs ajoutés par une version future comprise), puis on remplace le
    // type. `fromLevel`/`toLevel` d'une jonction n'ont plus de sens ailleurs.
    const neuf = Object.assign({}, obj, { type: typeCible });
    delete neuf.fromLevel;
    delete neuf.toLevel;
    listes[familleCible].push(neuf);

    const touchees = (famille === familleCible) ? [famille] : [famille, familleCible];
    touchees.forEach(function (f) { ecrire[f](listes[f]); });

    if (window.HistoryManager && avant && window.HistoryManager.record) {
      window.HistoryManager.record(_t("convert.history"), avant);
    }
    if (window.SessionPersist && window.SessionPersist.save) window.SessionPersist.save();
    return true;
  }

  // 🗑️ SUPPRIMER L'OBJET (KARMA, 05/09 : « rajoute, dans le truc pour
  // convertir, un bouton supprimer »). Meme popup, meme reference directe sur
  // l objet : le seul endroit du code ou l on tient a la fois la famille et
  // l objet vise.
  //
  // 🩸 IDENTITE PAR REFERENCE, jamais par contenu. `roads` et `zones` n ont
  // PAS d id (`data-formats.md`) et deux tracés peuvent avoir exactement la
  // meme geometrie et le meme type : chercher par egalite de contenu
  // supprimerait le mauvais. `indexOf(obj)` compare les references — la popup
  // porte l objet lui-meme, c est la seule cle fiable.
  //
  // 🩸 PAS DE CONFIRMATION, par coherence avec la suppression d un POINT
  // (`supprimerPointEditor`) qui s appuie sur Ctrl+Z. Le filet est donc le
  // snapshot d historique : sans lui, l objet serait perdu pour de bon.
  function supprimer(famille, obj) {
    if (!obj || !famille) return false;
    const ecrire = _ecrivain(famille);
    if (typeof ecrire !== "function") {
      console.warn("[Convertir] setteur manquant pour la suppression :", famille);
      return false;
    }
    const liste = _lire(famille).slice();
    const idx = liste.indexOf(obj);
    if (idx < 0) {
      console.warn("[Convertir] objet introuvable dans", famille);
      return false;
    }
    const avant = (window.HistoryManager && window.HistoryManager.captureState)
      ? window.HistoryManager.captureState() : null;
    liste.splice(idx, 1);
    ecrire(liste);
    if (window.HistoryManager && avant && window.HistoryManager.record) {
      window.HistoryManager.record(_t("convert.histoireSuppr"), avant);
    }
    if (window.SessionPersist && window.SessionPersist.save) window.SessionPersist.save();
    return true;
  }

  // ─────────────────────────────────────────────
  // MODALE DE CHOIX
  // ─────────────────────────────────────────────
  // 🎯 LE LOT (KARMA, 05/09 : « sélectionner N vecteurs et les convertir
  // d'un coup »). `items` = [{ famille, obj }].
  //
  // 🩸 UN SEUL INSTANTANÉ, UNE SEULE ÉCRITURE PAR FAMILLE, UN SEUL RENDU.
  // Appeler `convertir()` N fois donnerait N re-rendus complets — `setRoads`
  // reconstruit tout, ce qui coûte cher à 20 000 objets — et N entrées
  // d'historique : annuler la conversion demanderait N Ctrl+Z. Le lot est UN
  // geste, il doit s'annuler en UN geste.
  //
  // 🩸 UNE CIBLE DÉJÀ ATTEINTE N'EST PAS UNE ERREUR. Sur une sélection mixte
  // (40 fronts + 5 chemins → galerie), les objets déjà du bon type sont
  // SAUTÉS et comptés à part. L'alternative — masquer une cible parce qu'un
  // seul objet de la sélection l'a déjà — rendrait la liste incompréhensible.
  function convertirLot(items, familleCible, typeCible) {
    const bilan = { convertis: 0, sautes: 0, echecs: 0 };
    if (!Array.isArray(items) || !items.length || !familleCible || !typeCible) return bilan;
    if (typeof _ecrivain(familleCible) !== "function") {
      console.warn("[Convertir] setteur manquant :", familleCible);
      bilan.echecs = items.length;
      return bilan;
    }

    const avant = (window.HistoryManager && window.HistoryManager.captureState)
      ? window.HistoryManager.captureState() : null;

    // Les trois listes sont lues d'un bloc AVANT toute écriture — même raison
    // que pour `convertir` : une conversion intra-famille lirait une liste
    // déjà amputée et perdrait les objets.
    const listes = {
      roads:      _lire("roads").slice(),
      zones:      _lire("zones").slice(),
      structures: _lire("structures").slice()
    };
    const touchees = {};

    items.forEach(function (it) {
      if (!it || !it.obj || !listes[it.famille]) { bilan.echecs++; return; }
      if (it.famille === familleCible && it.obj.type === typeCible) { bilan.sautes++; return; }
      const idx = listes[it.famille].indexOf(it.obj);
      if (idx < 0) { bilan.echecs++; return; }
      listes[it.famille].splice(idx, 1);
      const neuf = Object.assign({}, it.obj, { type: typeCible });
      delete neuf.fromLevel;
      delete neuf.toLevel;
      listes[familleCible].push(neuf);
      touchees[it.famille] = true;
      touchees[familleCible] = true;
      bilan.convertis++;
    });

    if (bilan.convertis === 0) return bilan;   // rien écrit, donc rien à annuler
    Object.keys(touchees).forEach(function (f) { _ecrivain(f)(listes[f]); });
    if (window.HistoryManager && avant && window.HistoryManager.record) {
      window.HistoryManager.record(_t("convert.histoireLot", { n: bilan.convertis }), avant);
    }
    if (window.SessionPersist && window.SessionPersist.save) window.SessionPersist.save();
    return bilan;
  }

  // Cibles d'un LOT : l'UNION de celles de chaque objet. Un type qui est la
  // source de l'un peut être la cible d'un autre (40 fronts + 5 chemins →
  // « chemin » reste une cible valable pour les fronts). L'intersection
  // ferait disparaître des cibles légitimes sans que rien ne l'explique.
  function listerCiblesLot(items) {
    const vues = {}, out = [];
    (items || []).forEach(function (it) {
      if (!it || !it.obj) return;
      listerCibles(it.famille, it.obj.type).forEach(function (c) {
        const k = c.famille + ":" + c.type;
        if (vues[k]) return;
        vues[k] = true;
        out.push(c);
      });
    });
    return out;
  }

  function ouvrir(famille, obj, opts) {
    if (!obj) return;
    opts = opts || {};
    const lot = Array.isArray(opts.lot) && opts.lot.length ? opts.lot : null;
    const existante = document.getElementById("kta-convert-modal");
    if (existante) existante.remove();

    const cibles = lot ? listerCiblesLot(lot) : listerCibles(famille, obj.type);
    const ouvert = _estOuvert(famille, obj.type);
    const catSrc = CAT_DE_FAMILLE[famille] || famille;
    const nomSrc = _libelle(catSrc, obj.type);

    function _esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // Regroupées par catégorie : passer d'une famille à l'autre est le geste
    // qui change tout (un tracé entre dans le calcul d'itinéraire, pas une
    // structure), il doit se voir.
    const parCat = {};
    cibles.forEach(function (c) { (parCat[c.cat] = parCat[c.cat] || []).push(c); });

    let corps = "";
    ["traces", "zones", "structures"].forEach(function (cat) {
      const liste = parCat[cat];
      if (!liste || !liste.length) return;
      corps +=
        '<div class="kta-convert-groupe">' +
          '<div class="kta-convert-groupe-titre">' + _esc(_t("convert.cat." + cat)) + '</div>' +
          liste.map(function (c) {
            return '<button class="kta-convert-choix" type="button" ' +
                     'data-famille="' + _esc(c.famille) + '" data-type="' + _esc(c.type) + '">' +
                     '<span class="kta-convert-swatch">' + (c.swatch || "") + '</span>' +
                     '<span class="kta-convert-label">' + _esc(c.label) + '</span>' +
                   '</button>';
          }).join("") +
        '</div>';
    });
    if (!corps) {
      corps = '<p class="kta-convert-vide">' + _esc(_t("convert.aucuneCible")) + '</p>';
    }

    const niveau = Number.isInteger(obj.level) ? obj.level : 0;
    const modal = document.createElement("div");
    modal.id = "kta-convert-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-convert-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _esc(_t("convert.titre")) + '</span>' +
          '<button class="kta-panneau-close" id="kta-convert-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p class="kta-convert-source">' +
            _esc(lot
              ? _t("convert.lotSource", { n: lot.length })
              : _t("convert.source", { type: nomSrc, niveau: (niveau < 0 ? niveau : "+" + niveau) })) +
          '</p>' +
          '<p class="kta-convert-regle">' +
            _esc(_t(ouvert ? "convert.regleOuvert" : "convert.regleFerme")) +
          '</p>' +
          // 🎯 Entrée du mode lot. Absente quand on EST déjà en lot : on ne
          // relance pas une sélection depuis l'écran qui en présente une.
          (lot ? '' :
            '<button class="kta-btn kta-btn-ghost kta-convert-multi" type="button" id="kta-convert-multi">' +
              _esc(_t("convert.selMulti")) +
            '</button>') +
          corps +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);

    const fermer = function () { modal.remove(); };
    document.getElementById("kta-convert-close").addEventListener("click", fermer);
    modal.addEventListener("click", function (e) { if (e.target === modal) fermer(); });

    modal.querySelectorAll(".kta-convert-choix").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const fam = btn.getAttribute("data-famille");
        const typ = btn.getAttribute("data-type");
        // La carte est re-rendue par les setteurs : la popup encore ouverte
        // pointerait un layer détruit. On ferme avant.
        try { if (window.map && window.map.closePopup) window.map.closePopup(); } catch (e) {}
        fermer();
        if (lot) {
          const bilan = convertirLot(lot, fam, typ);
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(_t("convert.lotBilan", bilan), "info");
          }
        } else {
          convertir(famille, obj, fam, typ);
        }
      });
    });

    const btnMulti = document.getElementById("kta-convert-multi");
    if (btnMulti && window.SelectionMulti) {
      btnMulti.addEventListener("click", function () {
        // La modale disparaît le temps de la désignation : elle couvre la
        // carte sur laquelle il faut justement cliquer. Elle revient à la
        // validation, avec le lot.
        try { if (window.map && window.map.closePopup) window.map.closePopup(); } catch (e) {}
        fermer();
        window.SelectionMulti.ouvrir({ famille: famille, obj: obj }, function (sel) {
          ouvrir(famille, obj, { lot: sel });
        });
      });
    }
  }

  window.KtaConvertir = {
    ouvrir:        ouvrir,
    convertir:     convertir,
    convertirLot:  convertirLot,   // 🎯 v1.85.0 — N objets d un coup
    listerCiblesLot: listerCiblesLot,
    supprimer:     supprimer,   // 🗑️ v1.85.0 — depuis la popup de l objet
    listerCibles:  listerCibles,
    estOuvert:     _estOuvert
  };
})();
