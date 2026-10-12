/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// 📦 IMPORT MULTIPLE — N archives ZIP ajoutées à la liste, sans en ouvrir
// =====================================================================
// Demande KARMA (14/09/2026) : « je veux un moyen de pouvoir intégrer
// plusieurs zip MyKTAMap. En gros une sorte de module, où je charge N zip, et
// un à un, il me les décompresse, et me les rajoute à ma liste de plans. »
//
// 🩸 LE POINT DUR N'ÉTAIT PAS LA BOUCLE. Jusqu'ici, AJOUTER UN PLAN C'ÉTAIT
// L'OUVRIR : le seul chemin existant (`homeLoader > chargerZipFichier` puis
// `main > startImportedPlan`) lit le ZIP, pose ses assets en mémoire, écrit
// l'entrée du registre, stocke le fichier ET lance l'application dessus.
// Enchaîner vingt fois ce chemin ouvrirait vingt plans. Ce module fournit ce
// qui manquait : ENREGISTRER SANS OUVRIR.
//
// Ce qu'il réutilise, sans le réécrire :
//   • `PlanDenylist.isPlanDenied`   — le contrôle de blocage, par fichier ;
//   • `JSZip`                        — la lecture, pour le seul plan-config ;
//   • `PlanRegistry.genLocalId`      — l'identité (nom + version) ;
//   • `PlanRegistry.addOrUpdate`     — l'entrée dans la liste ;
//   • `PlanRegistry.saveBlob`         — le stockage et son quota.
//
// 🩸 LE ZIP RANGÉ DOIT ÊTRE ANNONCÉ (KARMA, 15/09/2026 : « pas besoin de
// sélectionner le zip si le plan a été ajouté à la liste »). Depuis v1.94.0
// le fichier ÉTAIT rangé, mais l'entrée ne le DISAIT pas : pas de
// `storedBlob`, le drapeau que `homeLoader` consulte en premier avant
// d'ouvrir un plan local. La liste redemandait donc le ZIP à chaque
// ouverture, et la copie en IndexedDB restait orpheline. Le drapeau est posé
// après le rangement réussi, jamais avant.
//
// Le rangement est une OPTION, « Mémoriser les plans dans l'app », dont le défaut suit le
// réglage ⚙️ Configuration de l'accueil → « Mémoriser le plan dans l'app au
// premier chargement » (activé par défaut). Décochée, seule l'entrée est écrite : la liste demande le fichier à la
// première ouverture (chemin `reSelectionnerZipPourPlan`, le même qu'un plan
// restauré depuis un profil), et la place n'est pas un sujet.
//
// 🩸 UN SEUL MÉCANISME : LA COPIE (15/09/2026, même soir). La v1.94.0 prenait
// une « autorisation permanente » (référence disque, `saveHandle`) sur
// Chrome/Edge pour ne rien copier. Retirée avec le bouton 🔐 de l'accueil :
// à l'ouverture la copie passe avant la référence, et cette dernière ne
// sert même pas de secours si la copie a été purgée. Deux mécanismes pour
// un seul effet, c'est un de trop. Le sélecteur multiple est le champ
// `<input type="file" multiple>` classique, partout.
//
// 🧠 CE QU'IL NE FAIT PAS, ET POURQUOI. Il ne décompresse pas les assets : un
// plan est CONSERVÉ SOUS FORME DE ZIP (blob en IndexedDB, ou fichier d'origine
// via une autorisation permanente), et ses tuiles sont extraites à la demande
// au chargement. Décompresser à l'import multiplierait le poids stocké par
// deux ou trois, pour rien. Seul `plan-config.json` est lu — quelques kilo-
// octets en tête d'archive — parce qu'il porte le nom, la version et les
// badges qui font la ligne de la liste.
//
// API : window.ImportMasse = { ouvrir, analyser, importer, _interne }
// 100 % local, aucune surface réseau nouvelle.
// =====================================================================

(function() {
  "use strict";

  const MODAL_ID = "kta-import-masse-modal";

  // Marge de sécurité sur la place restante : un navigateur refuse bien avant
  // d'atteindre son quota annoncé, et l'app doit garder de quoi écrire ses
  // sessions et ses photos APRÈS l'import.
  const MARGE_QUOTA = 0.85;

  function _t(k, p) { return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k; }
  // Défaut de « Mémoriser les plans » = le réglage de l'accueil (source de vérité
  // unique, définie par homeLoader). Sans lui : vrai.
  function _memoriserParDefaut() {
    return (typeof window.ktaMemoriserPlanActif === "function") ? !!window.ktaMemoriserPlanActif() : true;
  }
  // 📁 marche 2 — dossier de destination : les dossiers du registre, Non
  // classés (défaut), ou un nouveau dossier créé au lancement.
  function _optionsDossiers() {
    const PR = window.PlanRegistry;
    const dossiers = (PR && PR.getFolders) ? PR.getFolders() : [];
    return '<option value="">' + _esc(_t("impmasse.dossier.aucun")) + '</option>' +
      dossiers.map(function(f) { return '<option value="' + _esc(f.id) + '">' + _esc(f.name) + '</option>'; }).join("") +
      '<option value="__new__">' + _esc(_t("impmasse.dossier.nouveau")) + '</option>';
  }
  function _dossierCible() {
    const PR = window.PlanRegistry;
    const sel = _zone("kta-impm-dossier");
    if (!sel || !PR || !PR.createFolder) return null;
    if (sel.value === "__new__") {
      const nom = String((_zone("kta-impm-dossier-nom") || {}).value || "").trim();
      const f = nom ? PR.createFolder(nom, { src: "user" }) : null;
      return f ? f.id : null;
    }
    return sel.value || null;
  }
  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function _poids(o) {
    const n = Number(o) || 0;
    if (n >= 1024 * 1024 * 1024) return (n / 1073741824).toFixed(1) + " Go";
    if (n >= 1024 * 1024) return Math.round(n / 1048576) + " Mo";
    if (n >= 1024) return Math.round(n / 1024) + " Ko";
    return n + " o";
  }

  // ───────── LA DÉCISION SUR UN DOUBLON ─────────
  // 🩸 PURE, et exposée : `check-import-masse.js` l'EXÉCUTE. Vingt fichiers,
  // c'est vingt questions si on demande plan par plan — insupportable. La
  // politique est choisie UNE FOIS pour le lot, et cette fonction l'applique.
  //   • "ignorer"  : le plan déjà présent est laissé tel quel (défaut) ;
  //   • "remplacer": son entrée est réécrite, même id, même place ;
  //   • "doubler"  : un id distinct est forgé, les deux coexistent.
  function _deciderDoublon(politique, idNaturel, idsExistants) {
    const existe = Array.isArray(idsExistants) && idsExistants.indexOf(idNaturel) >= 0;
    if (!existe) return { action: "ajouter", id: idNaturel };
    if (politique === "remplacer") return { action: "remplacer", id: idNaturel };
    if (politique === "doubler") {
      // Suffixe numéroté : on cherche le premier libre plutôt que d'écraser
      // un doublon précédent (deux imports successifs du même lot).
      let n = 2;
      while (idsExistants.indexOf(idNaturel + "_" + n) >= 0) n++;
      return { action: "doubler", id: idNaturel + "_" + n };
    }
    return { action: "ignorer", id: idNaturel };
  }

  // ───────── LA DÉCISION SUR LA PLACE ─────────
  // 🩸 PURE, exposée, EXÉCUTÉE par le garde-fou. Le stockage d'un navigateur
  // tient entre 50 et 200 Mo selon l'appareil : vingt plans de 30 Mo ne
  // rentreront jamais sur un téléphone. On le dit AVANT, pas au quinzième.
  // `aStocker` vaut 0 quand tous les fichiers ont une autorisation permanente
  // (rien n'est copié) : la place n'est alors pas un sujet.
  function _verdictPlace(aStocker, dispo, quota) {
    if (!aStocker) return { ok: true, raison: "rien-a-stocker" };
    if (!Number.isFinite(dispo) || dispo <= 0) return { ok: true, raison: "inconnu" };
    const budget = dispo * MARGE_QUOTA;
    if (aStocker <= budget) return { ok: true, raison: "tient", budget: budget };
    return { ok: false, raison: "trop-gros", budget: budget, manque: aStocker - budget, quota: quota };
  }

  async function _placeDisponible() {
    try {
      if (!navigator.storage || !navigator.storage.estimate) return { dispo: NaN, quota: NaN };
      const e = await navigator.storage.estimate();
      const quota = Number(e.quota) || 0, usage = Number(e.usage) || 0;
      return { dispo: Math.max(0, quota - usage), quota: quota, usage: usage };
    } catch (e) { return { dispo: NaN, quota: NaN }; }
  }

  // ───────── LECTURE DE L'IDENTITÉ ─────────
  // Seul `plan-config.json` est lu. Un ZIP qui n'en a pas n'est pas un plan
  // MyKTAMap : on le refuse EN LE NOMMANT plutôt que d'inventer une entrée.
  async function _lireIdentite(fichier) {
    if (typeof JSZip === "undefined") throw new Error("impmasse.err.jszip");
    let zip;
    try { zip = await JSZip.loadAsync(fichier); }
    catch (e) { throw new Error("impmasse.err.zipIllisible"); }
    const entree = zip.file("plan-config.json") ||
                   zip.file(/(^|\/)plan-config\.json$/)[0] || null;
    if (!entree) throw new Error("impmasse.err.pasUnPlan");
    let cfg;
    try { cfg = JSON.parse(await entree.async("string")); }
    catch (e) { throw new Error("impmasse.err.configIllisible"); }
    const plan = cfg && cfg.plan;
    if (!plan || !plan.name) throw new Error("impmasse.err.sansNom");
    return {
      name: String(plan.name),
      version: plan.version ? String(plan.version) : "",
      author: plan.author ? String(plan.author) : null,
      multiLevel: plan.multiLevel === true,
      tiledV2: plan.tiledV2 === true,
      // 🏷️ 16/09/2026 — étiquettes proposées par le plan-config (Générateur).
      tags: Array.isArray(plan.tags) ? plan.tags : []
    };
  }

  // ───────── ANALYSE DU LOT, AVANT TOUT ÉCRIT ─────────
  // Rien n'est écrit ici : on lit, on décide, on rend un plan de bataille que
  // l'utilisateur valide. Un import qui commence doit aller au bout ou
  // s'arrêter proprement, jamais surprendre en cours de route.
  async function analyser(fichiers, politique) {
    const sortie = { lignes: [], aStocker: 0, poidsTotal: 0, nbAjouts: 0, nbIgnores: 0, nbRefus: 0 };
    const ids = (window.PlanRegistry && window.PlanRegistry.getAll)
      ? window.PlanRegistry.getAll().map(function(p) { return p.id; }) : [];
    const idsSimules = ids.slice();

    for (const f of fichiers) {
      // Le File lui-même reste sur la ligne : c'est lui qu'on rangera, sans
      // relire le disque.
      const ligne = { fichier: f.name, taille: f.size || 0, blob: f };
      sortie.poidsTotal += ligne.taille;
      try {
        if (window.PlanDenylist && typeof window.PlanDenylist.isPlanDenied === "function") {
          const d = await window.PlanDenylist.isPlanDenied(f);
          if (d && d.denied) throw new Error("impmasse.err.bloque");
        }
        const info = await _lireIdentite(f);
        const idNat = window.PlanRegistry.genLocalId(info.name, info.version);
        const dec = _deciderDoublon(politique, idNat, idsSimules);
        ligne.nom = info.name; ligne.version = info.version; ligne.info = info;
        ligne.action = dec.action; ligne.id = dec.id;
        if (dec.action === "ignorer") { sortie.nbIgnores++; }
        else {
          sortie.nbAjouts++;
          idsSimules.push(dec.id);
          sortie.aStocker += ligne.taille;   // remis à 0 par l'écran si « précharger » est décoché
        }
      } catch (e) {
        ligne.action = "refus";
        ligne.raison = (e && e.message) || "impmasse.err.inconnue";
        sortie.nbRefus++;
      }
      sortie.lignes.push(ligne);
    }
    return sortie;
  }

  // ───────── L'IMPORT, UN FICHIER À LA FOIS ─────────
  // 🩸 UN PAR UN, JAMAIS TOUT EN MÉMOIRE. Chaque archive est ouverte, son
  // plan-config lu, son entrée écrite, son fichier rangé — puis on passe à la
  // suivante et la précédente est relâchée. Vingt archives de 30 Mo chargées
  // ensemble feraient tomber un téléphone avant la cinquième.
  async function importer(plan, opts) {
    // 🔒 Deuxième verrou, sur le chemin qui ÉCRIT. `ouvrir()` garde l'écran,
    // celui-ci garde les données : un appel programmatique à `importer()`
    // n'entre pas plus qu'un clic.
    if (typeof window.ktaKiosqueServeurSeul === "function" && window.ktaKiosqueServeurSeul()) {
      console.warn("[ImportMasse] import refusé : instance en mode plans serveur uniquement");
      return { ajoutes: [], ignores: [], refuses: [], arrete: { apres: 0, motif: "impmasse.kiosque" } };
    }
    opts = opts || {};
    const onProgres = typeof opts.onProgres === "function" ? opts.onProgres : function() {};
    // Mémoriser = ranger le ZIP (copie ou autorisation permanente). VRAI par
    // défaut : c'est l'absence du drapeau qui faisait redemander le fichier.
    const precharger = opts.precharger !== false;
    const rapport = { ajoutes: [], ignores: [], refuses: [], arrete: null };
    const aFaire = plan.lignes.filter(function(l) { return l.action !== "refus" && l.action !== "ignorer"; });
    let i = 0;

    // Comme le chemin unitaire (`main > startImportedPlan`) : demander la
    // persistance AVANT la première copie, sinon iOS et Chrome peuvent purger
    // les blobs à la première pression sur l'espace. Une fois par lot.
    if (precharger && aFaire.length
        && typeof window.PlanRegistry.requestPersistentStorage === "function") {
      try { await window.PlanRegistry.requestPersistentStorage(); } catch (e) {}
    }

    for (const ligne of plan.lignes) {
      if (ligne.action === "refus")   { rapport.refuses.push(ligne); continue; }
      if (ligne.action === "ignorer") { rapport.ignores.push(ligne); continue; }
      i++;
      onProgres({ i: i, total: aFaire.length, nom: ligne.nom || ligne.fichier });

      try {
        const entree = {
          id: ligne.id,
          type: "local",
          name: ligne.info.name,
          version: ligne.info.version || null,
          author: ligne.info.author,
          originalFilename: ligne.fichier,
          fileSize: ligne.taille,
          perfPreset: "auto"
        };
        if (ligne.info.multiLevel) entree.multiLevel = true;
        if (ligne.info.tiledV2)    entree.tiledV2    = true;
        window.PlanRegistry.addOrUpdate(entree);
        // 🏷️ 16/09/2026 — le ZIP PROPOSE ses étiquettes, même règle que
        // `main > startImportedPlan` : jamais par-dessus des tags "user" ou
        // "index" ; un ZIP sans tags retire ceux qu'un précédent proposait.
        // 🏷️ début-tags-config
        try {
          const regTags = window.PlanRegistry.findById(ligne.id);
          const proposes = Array.isArray(ligne.info.tags) && ligne.info.tags.length > 0;
          const protege = !!(regTags && (regTags.tagsSrc === "user" || regTags.tagsSrc === "index"));
          if (proposes && !protege) window.PlanRegistry.setTags(ligne.id, ligne.info.tags, "config");
          else if (!proposes && regTags && regTags.tagsSrc === "config" && regTags.tags) window.PlanRegistry.setTags(ligne.id, [], "config");
        } catch (eTags) { console.warn("[ImportMasse] tags du plan-config ignorés :", eTags); }
        // 🏷️ fin-tags-config
        // 📁 marche 2 — rangement demandé pour le lot (geste de l'utilisateur)
        if (opts.dossier && window.PlanRegistry.setPlanFolder) {
          try { window.PlanRegistry.setPlanFolder(ligne.id, opts.dossier, "user"); } catch (eDos) {}
        }

        // Le rangement du fichier, si l'utilisateur l'a demandé : le ZIP est
        // copié dans l'espace local, puis l'entrée est RÉÉCRITE avec le
        // drapeau que `homeLoader` lit (`storedBlob`) — sans lui, le fichier
        // rangé n'est jamais retrouvé et la liste redemande le ZIP. Un
        // rangement DEMANDÉ et raté retire l'entrée : une ligne « à
        // re-sélectionner » alors que l'utilisateur a coché la copie serait
        // une dégradation silencieuse.
        ligne.stockage = "aucun";
        if (precharger) {
          const r = await window.PlanRegistry.saveBlob(ligne.id, ligne.blob);
          if (r && r.ok) {
            window.PlanRegistry.addOrUpdate({ id: ligne.id, storedBlob: true });
            ligne.stockage = "copie";
          } else {
            const motif = (r && r.error) || "impmasse.err.stockage";
            // Place épuisée : on s'arrête NET. Continuer produirait une série
            // d'entrées mortes, et l'utilisateur ne saurait plus lesquelles
            // sont utilisables.
            window.PlanRegistry.remove(ligne.id);
            ligne.raison = motif;
            rapport.refuses.push(ligne);
            rapport.arrete = { apres: i - 1, motif: motif };
            return rapport;
          }
        }
        rapport.ajoutes.push(ligne);
      } catch (e) {
        ligne.raison = (e && e.message) || "impmasse.err.inconnue";
        rapport.refuses.push(ligne);
      }
    }
    return rapport;
  }

  // =====================================================================
  // L'ÉCRAN
  // =====================================================================
  // Trois temps, jamais mélangés : on choisit, on VOIT ce qui va se passer,
  // on lance. Un import de vingt plans qui démarre sans annoncer son poids
  // est le meilleur moyen de saturer un téléphone à l'aveugle.
  let _fichiers = [];
  let _plan = null;
  let _politique = "ignorer";
  let _precharger = _memoriserParDefaut();

  function _fermer() {
    const m = document.getElementById(MODAL_ID);
    if (m) m.remove();
    document.removeEventListener("keydown", _esc2, true);
  }
  function _esc2(e) { if (e.key === "Escape") { e.stopPropagation(); _fermer(); } }

  function _zone(id) { return document.getElementById(id); }

  function _rendreListe(analyse) {
    const z = _zone("kta-impm-liste");
    if (!z) return;
    if (!analyse) { z.innerHTML = ""; return; }
    const LIB = { ajouter: "impmasse.act.ajouter", remplacer: "impmasse.act.remplacer",
                  doubler: "impmasse.act.doubler", ignorer: "impmasse.act.ignorer", refus: "impmasse.act.refus" };
    z.innerHTML = analyse.lignes.map(function(l) {
      const nom = l.nom ? _esc(l.nom) + (l.version ? " <span class=\"kta-impm-ver\">" + _esc(l.version) + "</span>" : "")
                        : _esc(l.fichier);
      const det = (l.action === "refus") ? _esc(_t(l.raison || "impmasse.err.inconnue")) : _poids(l.taille);
      return '<div class="kta-impm-ligne kta-impm-' + l.action + '">' +
               '<span class="kta-impm-nom">' + nom + '</span>' +
               '<span class="kta-impm-act">' + _esc(_t(LIB[l.action] || l.action)) + '</span>' +
               '<span class="kta-impm-det">' + det + '</span>' +
             '</div>';
    }).join("");
  }

  async function _analyserEtAfficher() {
    const resume = _zone("kta-impm-resume");
    const btn = _zone("kta-impm-lancer");
    if (btn) btn.disabled = true;
    if (resume) resume.textContent = _t("impmasse.analyse.encours", { n: _fichiers.length });
    _plan = await analyser(_fichiers, _politique);
    _rendreListe(_plan);

    // Sans préchargement, rien n'est copié du tout : la place n'est pas un
    // sujet, et le résumé le dit en clair plutôt que d'afficher « 0 o ».
    let aStocker = 0;
    if (_precharger) {
      _plan.lignes.forEach(function(l) {
        if (l.action === "refus" || l.action === "ignorer") return;
        aStocker += l.taille;
      });
    }
    _plan.aStocker = aStocker;

    const place = await _placeDisponible();
    const verdict = _verdictPlace(aStocker, place.dispo, place.quota);
    _plan.verdict = verdict;

    if (resume) {
      const parts = [_t("impmasse.resume.compte", { ajout: _plan.nbAjouts, ignore: _plan.nbIgnores, refus: _plan.nbRefus })];
      parts.push(_precharger
        ? _t("impmasse.resume.poids", { total: _poids(_plan.poidsTotal), stocke: _poids(aStocker) })
        : _t("impmasse.resume.poidsSansCopie", { total: _poids(_plan.poidsTotal) }));
      if (Number.isFinite(place.dispo) && place.dispo > 0) parts.push(_t("impmasse.resume.place", { dispo: _poids(place.dispo) }));
      resume.textContent = parts.join(" · ");
    }
    const alerte = _zone("kta-impm-alerte");
    if (alerte) {
      if (!verdict.ok) {
        alerte.textContent = _t("impmasse.place.refus", { manque: _poids(verdict.manque) });
        alerte.style.display = "";
      } else { alerte.textContent = ""; alerte.style.display = "none"; }
    }
    if (btn) {
      btn.disabled = !(verdict.ok && _plan.nbAjouts > 0);
      btn.textContent = _t("impmasse.btn.lancer", { n: _plan.nbAjouts });
    }
  }

  function _choisirFichiers() {
    // Champ classique partout : le sélecteur système ne servait qu'à prendre
    // des références disque, retirées (cf. en-tête).
    const inp = _zone("kta-impm-input");
    if (inp) inp.click();
  }

  async function _lancer() {
    if (!_plan) return;
    const btn = _zone("kta-impm-lancer"), prog = _zone("kta-impm-prog");
    if (btn) btn.disabled = true;
    if (prog) prog.style.display = "";
    const rapport = await importer(_plan, {
      precharger: _precharger,
      dossier: _dossierCible(),
      onProgres: function(p) {
        if (prog) prog.textContent = _t("impmasse.prog", { i: p.i, total: p.total, nom: p.nom });
      }
    });
    if (prog) prog.style.display = "none";

    const resume = _zone("kta-impm-resume");
    if (resume) {
      resume.textContent = _t("impmasse.fini", {
        ajout: rapport.ajoutes.length, ignore: rapport.ignores.length, refus: rapport.refuses.length });
    }
    const alerte = _zone("kta-impm-alerte");
    if (alerte && rapport.arrete) {
      alerte.textContent = _t("impmasse.arrete", { n: rapport.arrete.apres, motif: _t(rapport.arrete.motif) });
      alerte.style.display = "";
    }
    _plan.lignes.forEach(function(l) {
      if (rapport.ajoutes.indexOf(l) >= 0) l.action = "ajoute";
      else if (rapport.refuses.indexOf(l) >= 0 && l.action !== "refus") l.action = "refus";
    });
    _rendreListe(_plan);

    // 🩸 ON RESTE À L'ACCUEIL. Ouvrir un plan après un import de vingt serait
    // un choix arbitraire ; la liste, elle, doit montrer les nouveaux tout de
    // suite, sinon l'import a l'air de n'avoir rien fait.
    if (typeof window.rafraichirListePlans === "function") { try { window.rafraichirListePlans(); } catch(e) {} }
    else if (typeof window.afficherLoader === "function") { try { window.afficherLoader(); } catch(e) {} }
    if (window.OsmHomePreview && typeof window.OsmHomePreview.refresh === "function") {
      try { window.OsmHomePreview.refresh(); } catch(e) {}
    }
    // 🐛 15/09/2026 (KARMA : « ce bouton ne fonctionne pas ») — il restait
    // DÉSACTIVÉ avec le libellé « Terminé », tout en gardant l'aspect plein
    // d'un bouton actif : on clique, rien ne se passe, et rien ne dit pourquoi.
    // Après un import réussi, l'action évidente est d'aller VOIR ses plans :
    // le bouton devient donc actif et ferme la fenêtre, la liste derrière
    // ayant déjà été rafraîchie.
    if (btn) {
      btn.disabled = false;
      btn.dataset.fini = "1";
      btn.textContent = _t(rapport.ajoutes.length ? "impmasse.btn.voir" : "impmasse.btn.fermerRien");
    }
    // 🐛 16/09/2026 (KARMA : « on a le choix entre Fermer et Voir mes plans
    // qui font la même chose ») — deux sorties pour un seul geste. Une fois
    // l'import fini, le bouton principal EST la sortie : le « Fermer » de
    // pied disparaît (le ✕ d'en-tête reste, comme partout).
    const fermer = _zone("kta-impm-fermer");
    if (fermer) fermer.style.display = "none";
  }

  function ouvrir() {
    // 🔒 15/09/2026 (KARMA) — LA PORTE, PAS SEULEMENT LE BOUTON. En kiosque
    // « plans serveur uniquement », l'import local est refusé : le bouton est
    // masqué plus bas (`main.js > _appliquerConfigKiosque`), mais un appel
    // direct à `ImportMasse.ouvrir()` le contournerait. Même prédicat unique
    // que le reste de l'app, jamais `KIOSK_CONFIG` lu à la main.
    if (typeof window.ktaKiosqueServeurSeul === "function" && window.ktaKiosqueServeurSeul()) {
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(_t("impmasse.kiosque"), "warn");
      }
      console.warn("[ImportMasse] refusé : instance en mode plans serveur uniquement");
      return;
    }
    _fermer();
    _fichiers = []; _plan = null; _politique = "ignorer"; _precharger = _memoriserParDefaut();
    const ov = document.createElement("div");
    ov.id = MODAL_ID;
    ov.className = "kta-readme-modal-overlay";
    ov.style.display = "flex";
    ov.innerHTML =
      '<div class="kta-readme-modal-boite kta-impm-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _esc(_t("impmasse.titre")) + '</span>' +
          '<button class="kta-panneau-close" id="kta-impm-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-impm-corps">' +
          '<p class="kta-impm-intro">' + _esc(_t("impmasse.intro")) + '</p>' +
          '<div class="kta-impm-actions">' +
            '<button type="button" class="kta-btn kta-btn-primary" id="kta-impm-choisir">' + _esc(_t("impmasse.btn.choisir")) + '</button>' +
            '<input type="file" id="kta-impm-input" accept=".zip,application/zip" multiple style="display:none">' +
          '</div>' +
          '<div class="kta-impm-politique">' +
            '<span class="kta-impm-politique-titre">' + _esc(_t("impmasse.politique.titre")) + '</span>' +
            ["ignorer", "remplacer", "doubler"].map(function(p) {
              return '<label class="kta-impm-radio"><input type="radio" name="kta-impm-pol" value="' + p + '"' +
                     (p === "ignorer" ? " checked" : "") + '> <span>' + _esc(_t("impmasse.politique." + p)) + '</span></label>';
            }).join("") +
          '</div>' +
          // 📁 marche 2 — dossier de destination du lot (décision KARMA 6)
          '<div class="kta-impm-politique" id="kta-impm-dossier-bloc">' +
            '<span class="kta-impm-politique-titre">' + _esc(_t("impmasse.dossier.titre")) + '</span>' +
            '<select class="kta-cfg-input kta-impm-dossier" id="kta-impm-dossier">' + _optionsDossiers() + '</select>' +
            '<input type="text" class="kta-cfg-input kta-impm-dossier-nom" id="kta-impm-dossier-nom" maxlength="40" placeholder="' + _esc(_t("impmasse.dossier.nomPlaceholder")) + '" hidden>' +
          '</div>' +
          '<label class="kta-impm-precharger">' +
            '<input type="checkbox" id="kta-impm-precharger"' + (_precharger ? ' checked' : '') + '>' +
            '<span><span class="kta-impm-precharger-label">' + _esc(_t("impmasse.precharger.label")) + '</span></span>' +
          '</label>' +
          '<div class="kta-impm-resume" id="kta-impm-resume"></div>' +
          '<div class="kta-impm-alerte" id="kta-impm-alerte" style="display:none;"></div>' +
          '<div class="kta-impm-liste" id="kta-impm-liste"></div>' +
          '<div class="kta-impm-prog" id="kta-impm-prog" style="display:none;"></div>' +
        '</div>' +
        '<div class="kta-cfg-actions-bar">' +
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-impm-fermer">' + _esc(_t("config.actions.close")) + '</button>' +
          '<button type="button" class="kta-btn kta-btn-primary" id="kta-impm-lancer" disabled>' + _esc(_t("impmasse.btn.lancerVide")) + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(ov);

    document.getElementById("kta-impm-close").addEventListener("click", _fermer);
    document.getElementById("kta-impm-fermer").addEventListener("click", _fermer);
    ov.addEventListener("click", function(e) { if (e.target === ov) _fermer(); });
    document.addEventListener("keydown", _esc2, true);
    document.getElementById("kta-impm-choisir").addEventListener("click", _choisirFichiers);
    // 📁 « Nouveau dossier… » dévoile un champ de nom, sans quitter l'écran
    const selDossier = document.getElementById("kta-impm-dossier");
    if (selDossier) selDossier.addEventListener("change", function() {
      const nomEl = document.getElementById("kta-impm-dossier-nom");
      if (nomEl) { nomEl.hidden = (selDossier.value !== "__new__"); if (!nomEl.hidden) nomEl.focus(); }
    });
    // Un seul écouteur, deux rôles selon l'état : lancer, puis fermer. Poser
    // un second écouteur à la fin laisserait le premier en place — et un clic
    // relancerait l'import déjà fait.
    document.getElementById("kta-impm-lancer").addEventListener("click", function() {
      const b = _zone("kta-impm-lancer");
      if (b && b.dataset.fini === "1") { _fermer(); return; }
      _lancer();
    });
    document.getElementById("kta-impm-input").addEventListener("change", async function(ev) {
      _fichiers = Array.from(ev.target.files || []);
      if (_fichiers.length) await _analyserEtAfficher();
    });
    ov.querySelectorAll("[name=kta-impm-pol]").forEach(function(r) {
      r.addEventListener("change", async function() {
        _politique = r.value;
        if (_fichiers.length) await _analyserEtAfficher();
      });
    });
    // Le poids à copier et le verdict de place dépendent de l'option : on
    // ré-analyse, comme pour la politique de doublon.
    document.getElementById("kta-impm-precharger").addEventListener("change", async function(ev) {
      _precharger = !!ev.target.checked;
      if (_fichiers.length) await _analyserEtAfficher();
    });
  }

  window.ImportMasse = {
    ouvrir: ouvrir,
    analyser: analyser,
    importer: importer,
    _interne: { deciderDoublon: _deciderDoublon, verdictPlace: _verdictPlace,
                lireIdentite: _lireIdentite, placeDisponible: _placeDisponible,
                poids: _poids, MODAL_ID: MODAL_ID, MARGE_QUOTA: MARGE_QUOTA, t: _t, esc: _esc }
  };

  console.log("[ImportMasse] module chargé (enregistrer sans ouvrir)");
})();
