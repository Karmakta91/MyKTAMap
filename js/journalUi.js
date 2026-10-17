/*!
 * MyKTAMap — Carnet d'exploration : interface (v1.69.0)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// JOURNALUI.JS — modale « 📔 Mon carnet » et fiche de sortie
// =========================
// Couche VUE du Carnet ; donnée et cycle de vie dans js/journal.js (socle testable sans DOM).
// Écrans : CARNET (totaux + liste antéchronologique filtrable par plan, onglet Récits, fusion) et FICHE
// (sous-modale z-index 100001 : métriques, mini-tracé SVG, vignettes, note, fin corrigeable, suppression).
// Les photos ne sont pas copiées : la fiche lit les REFS du store Photos ; une photo supprimée donne une
// vignette « 🚫 photo supprimée », pas une erreur.
// Expose window.JournalUi : ouvrir(planIdFiltre?), ouvrirFiche(id), cloturerDepuisUi(), histoire (accès aux
//   documents du Mode Histoire pour l'export de profil).
// =========================

(function() {
  "use strict";

  const MODAL_ID = "kta-jrn-modal";
  const FICHE_ID = "kta-jrn-fiche";
  const RECIT_ID = "kta-jrn-recit";

  // URLs blob des vignettes de la fiche, révoquées à la fermeture (sinon quelques Mo fuient par ouverture).
  let _ficheUrls = [];

  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }
  function _esc(s) { return window.ktaEsc(s); }   // échappeur unique (js/langManager.js)
  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(msg, type || "info");
    }
  }

  // ── Formatage ──

  function _fmtDate(ms) {
    if (!ms) return "—";
    try {
      return new Date(ms).toLocaleString(undefined, {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
    } catch(e) { return new Date(ms).toISOString().slice(0, 16).replace("T", " "); }
  }

  function _dur(ms) {
    if (typeof ms !== "number" || ms < 0) return "—";
    const min = Math.floor(ms / 60000);
    if (min < 1) return _t("jrn.dur.lessMin");
    if (min < 60) return min + " min";
    const h = Math.floor(min / 60), r = min % 60;
    return r > 0 ? (h + " h " + r + " min") : (h + " h");
  }

  function _dist(m) {
    return (typeof window.formatDistance === "function")
      ? window.formatDistance(Number(m) || 0, 0)
      : (Math.round(Number(m) || 0) + " m");
  }

  // Records sans `type` traités comme bureau (pas de déplacement mesuré).
  // Durée AFFICHÉE = `Journal.dureeMs()` : la règle vit là-bas seulement (sinon détail et total divergent).
  function _dureeAffichee(rec) {
    if (window.Journal && typeof window.Journal.dureeMs === "function") {
      return window.Journal.dureeMs(rec);
    }
    return Number(rec && rec.activeMs) || 0;
  }

  function _estTerrain(rec) {
    return !!rec && rec.type === "terrain";
  }

  function _chipsAjouts(rec) {
    const a = rec.ajouts || {};
    const out = [];
    if (a.points)     out.push("📍 " + a.points);
    if (a.roads)      out.push("🛤️ " + a.roads);
    if (a.zones)      out.push("🔷 " + a.zones);
    if (a.structures) out.push("🏛️ " + a.structures);
    if (a.photos)     out.push("📷 " + a.photos);
    return out;
  }

  // ── Mini-tracé SVG ──

  // Tracé archivé en coordonnées IMAGE (x → droite, y → bas, origine haut-gauche) : pas de convertCoord,
  // c'est un dessin normalisé dans son propre viewBox, pas une projection carte.
  function _svgTrace(track) {
    if (!Array.isArray(track) || track.length < 2) return "";
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    track.forEach(function(p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const pad = Math.max(w, h) * 0.06 + 1;
    const d = track.map(function(p, i) {
      return (i === 0 ? "M" : "L") + (p.x - minX).toFixed(1) + " " + (p.y - minY).toFixed(1);
    }).join(" ");
    const last = track[track.length - 1];
    return '<svg class="kta-jrn-trace" viewBox="' + (-pad) + ' ' + (-pad) + ' ' +
             (w + pad * 2) + ' ' + (h + pad * 2) + '" preserveAspectRatio="xMidYMid meet" ' +
             'role="img" aria-label="' + _esc(_t("jrn.fiche.traceAria")) + '">' +
             '<path d="' + d + '" fill="none" stroke="#8cb4ff" stroke-width="' +
               (Math.max(w, h) / 120).toFixed(2) + '" stroke-linejoin="round" stroke-linecap="round"/>' +
             '<circle cx="' + (track[0].x - minX).toFixed(1) + '" cy="' + (track[0].y - minY).toFixed(1) +
               '" r="' + (Math.max(w, h) / 60).toFixed(2) + '" fill="#6ee287"/>' +
             '<circle cx="' + (last.x - minX).toFixed(1) + '" cy="' + (last.y - minY).toFixed(1) +
               '" r="' + (Math.max(w, h) / 60).toFixed(2) + '" fill="#f4c542"/>' +
           '</svg>';
  }

  // ── Fiche de sortie ──

  function _fermerFiche() {
    _ficheUrls.forEach(function(u) { try { URL.revokeObjectURL(u); } catch(e) {} });
    _ficheUrls = [];
    const el = document.getElementById(FICHE_ID);
    if (el) el.remove();
  }

  function ouvrirFiche(id) {
    return window.Journal.get(id).then(function(rec) {
      if (!rec) { _toast(_t("jrn.err.introuvable"), "warn"); return; }
      _fermerFiche();

      const chips = _chipsAjouts(rec);
      // Sortie affinée : on dessine le tracé RECONSTRUIT (le brut reste stocké). La mention sous le dessin
      // dit lequel est affiché : un tracé reconstruit est une HYPOTHÈSE (détours et demi-tours absents).
      const traceAffinee = Array.isArray(rec.trackAffine) && rec.trackAffine.length >= 2;
      const svg   = _svgTrace(traceAffinee ? rec.trackAffine : rec.track);
      const overlay = document.createElement("div");
      overlay.id = FICHE_ID;
      overlay.className = "kta-readme-modal-overlay";
      overlay.style.display = "flex";
      overlay.style.zIndex = "100001";   // sous-modale (charte z-index)
      overlay.innerHTML =
        '<div class="kta-readme-modal-boite kta-jrn-fiche-boite">' +
          '<div class="kta-readme-modal-header">' +
            '<span class="kta-readme-modal-titre">📔 ' + _esc(rec.planName || "?") + '</span>' +
            '<button class="kta-readme-modal-close" id="kta-jrn-fiche-close" type="button" aria-label="✕">✕</button>' +
          '</div>' +
          '<div class="kta-readme-modal-corps kta-jrn-fiche-corps">' +
            '<div class="kta-jrn-fiche-date">' + _esc(_fmtDate(rec.startedAtMs)) +
              ' <span class="kta-jrn-tag">' +
                (_estTerrain(rec) ? '🚶 ' + _esc(_t("jrn.type.terrain")) : '🖥️ ' + _esc(_t("jrn.type.bureau"))) +
              '</span>' +
              (rec.closedBy === "manual" ? ' <span class="kta-jrn-tag">' + _esc(_t("jrn.fiche.manuelle")) + '</span>' : '') +
              // ✏️ Corriger la fin : sinon une sortie non clôturée finit quand iOS a tué l'app.
              ' <button type="button" class="kta-btn kta-btn-ghost kta-btn-small kta-jrn-fin-btn" ' +
                'id="kta-jrn-fin">✏️ ' + _esc(_t("jrn.fin.corriger")) + '</button>' +
            '</div>' +
            '<div class="kta-jrn-metrics">' +
              // Durée de la SORTIE d'abord ; le temps d'usage juste dessous dit ce que vaut la mesure (3 h de
              // sortie pour 12 min d'app : le podomètre n'a presque rien vu).
              '<div class="kta-jrn-metric"><span class="kta-jrn-metric-val">' + _esc(_dur(_dureeAffichee(rec))) + '</span>' +
                '<span class="kta-jrn-metric-lab">' + _esc(_t("jrn.metric.duree")) +
                  (_estTerrain(rec)
                    ? ' ' + _esc(_t("jrn.metric.dontActif", { d: _dur(rec.activeMs) }))
                    : '') +
                  (rec.finManuelle ? ' ' + _esc(_t("jrn.metric.finCorrigee")) : '') +
                '</span></div>' +
              // Bureau : pas de distance (« 0 m » ferait croire à un tracker en panne), les photos à la place.
              (_estTerrain(rec)
                ? '<div class="kta-jrn-metric"><span class="kta-jrn-metric-val">' + _esc(_dist(rec.distM)) + '</span>' +
                    // La part estimée est dite, jamais fondue dans le total.
                    '<span class="kta-jrn-metric-lab">' + _esc(_t("jrn.metric.distance")) +
                      // 🩸 Dire D'OÙ vient la part estimée : « sur les galeries » et « à vol d'oiseau » diffèrent
                      // d'un facteur 2 ou 3 dans un labyrinthe. `trackAffine` n'existe QUE si l'affinage réseau
                      // a tourné : c'est le marqueur.
                      ((rec.distEstimeeM || 0) > 0
                        ? ' ' + _esc(_t(rec.trackAffine ? "jrn.section.dontReseau" : "jrn.section.dontVol",
                                        { dist: _dist(rec.distEstimeeM),
                                          n: Number(rec.validations) || 0 }))
                        : '') +
                    '</span></div>'
                : '<div class="kta-jrn-metric"><span class="kta-jrn-metric-val">' +
                    ((rec.ajouts && rec.ajouts.photos) || 0) + '</span>' +
                    '<span class="kta-jrn-metric-lab">' + _esc(_t("jrn.metric.photos")) + '</span></div>') +
              '<div class="kta-jrn-metric"><span class="kta-jrn-metric-val">' +
                ((rec.ajouts && (rec.ajouts.points + rec.ajouts.roads + rec.ajouts.zones + rec.ajouts.structures)) || 0) +
                '</span><span class="kta-jrn-metric-lab">' + _esc(_t("jrn.metric.ajouts")) + '</span></div>' +
              '<div class="kta-jrn-metric"><span class="kta-jrn-metric-val">' +
                ((rec.levels && rec.levels.length) || 1) + '</span>' +
                '<span class="kta-jrn-metric-lab">' + _esc(_t("jrn.metric.niveaux")) + '</span></div>' +
            '</div>' +
            (chips.length ? '<div class="kta-jrn-chips">' + chips.map(function(c) {
              return '<span class="kta-jrn-chip">' + _esc(c) + '</span>';
            }).join("") + '</div>' : '') +
            (svg ? '<div class="kta-jrn-trace-wrap">' + svg +
                     (traceAffinee
                       ? '<div style="font-size:11px; color:#8892a4; text-align:center; margin-top:4px;">' +
                           _esc(_t("jrn.fiche.traceAffinee")) + '</div>'
                       : '') +
                   '</div>' : '') +
            '<div class="kta-jrn-photos" id="kta-jrn-fiche-photos"></div>' +
            '<label class="kta-jrn-note-lab" for="kta-jrn-note">' + _esc(_t("jrn.fiche.note")) + '</label>' +
            '<textarea id="kta-jrn-note" class="kta-jrn-note" rows="4" ' +
              'placeholder="' + _esc(_t("jrn.fiche.notePlaceholder")) + '">' + _esc(rec.note || "") + '</textarea>' +
            '<div class="kta-jrn-fiche-actions">' +
              '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-jrn-note-save">💾 ' +
                _esc(_t("jrn.fiche.enregistrer")) + '</button>' +
              '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-jrn-type-toggle" ' +
                'title="' + _esc(_t("jrn.fiche.reclasserTitre")) + '">' +
                (_estTerrain(rec) ? '🖥️ ' + _esc(_t("jrn.fiche.versBureau"))
                                  : '🚶 ' + _esc(_t("jrn.fiche.versTerrain"))) + '</button>' +
              '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small kta-jrn-danger" id="kta-jrn-del">🗑️ ' +
                _esc(_t("jrn.fiche.supprimer")) + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(overlay);

      document.getElementById("kta-jrn-fiche-close").addEventListener("click", _fermerFiche);
      overlay.addEventListener("click", function(e) { if (e.target === overlay) _fermerFiche(); });

      // ✏️ Corriger la fin. 🩸 On saisit une HEURE, pas une durée (on se souvient de l'heure de sortie, pas
      // d'un calcul depuis un départ qu'on ne voit pas). Pré-remplie avec la fin actuelle (`datetime-local`) ;
      // le module refuse une fin antérieure au départ.
      const finBtn = document.getElementById("kta-jrn-fin");
      if (finBtn) {
        finBtn.addEventListener("click", async function () {
          const finMs = Date.parse(rec.endedAt || rec.updatedAt || 0) || Date.now();
          // 🩸 `datetime-local` veut du temps LOCAL sans fuseau : toISOString() brut décalerait de l'écart horaire.
          const d = new Date(finMs - new Date(finMs).getTimezoneOffset() * 60000);
          const val = d.toISOString().slice(0, 16);
          // Annuler = abandon (null) ; OK = la saisie, même vide (Date.parse("") → refus de format).
          const champ = { valeur: val, maxLength: 32 };
          const ok = await window.ktaConfirm(
            _esc(_t("jrn.fin.invite", { debut: _fmtDate(rec.startedAtMs) })), { texte: champ });
          if (!ok) return;
          const saisi = champ.valeur;
          const ms = Date.parse(saisi);
          if (!Number.isFinite(ms)) { _toast(_t("jrn.fin.koFormat"), "warn"); return; }
          window.Journal.setFin(rec.id, ms).then(function (maj) {
            if (!maj) { _toast(_t("jrn.fin.koAvant"), "warn"); return; }
            _toast(_t("jrn.fin.ok"), "info");
            return _rafraichirListe().then(function () { ouvrirFiche(rec.id); });
          });
        });
      }

      document.getElementById("kta-jrn-note-save").addEventListener("click", function() {
        const txt = document.getElementById("kta-jrn-note").value;
        window.Journal.setNote(rec.id, txt).then(function() {
          _toast(_t("jrn.toast.noteOk"), "info");
          _rafraichirListe();
        });
      });

      // Reclassement manuel : `typeManuel` côté socle, plus jamais reclassé automatiquement.
      document.getElementById("kta-jrn-type-toggle").addEventListener("click", function() {
        const cible = _estTerrain(rec) ? "bureau" : "terrain";
        window.Journal.setType(rec.id, cible).then(function() {
          _toast(_t(cible === "terrain" ? "jrn.toast.versTerrain" : "jrn.toast.versBureau"), "info");
          _rafraichirListe();
          ouvrirFiche(rec.id);   // recharge la fiche avec le nouveau classement
        });
      });

      document.getElementById("kta-jrn-del").addEventListener("click", async function() {
        if (!(await window.ktaConfirm(_t("jrn.confirm.supprimer")))) return;
        window.Journal.remove(rec.id).then(function() {
          _fermerFiche();
          _toast(_t("jrn.toast.supprimee"), "info");
          _rafraichirListe();
        });
      });

      _hydraterPhotos(rec);
    });
  }

  function _hydraterPhotos(rec) {
    const box = document.getElementById("kta-jrn-fiche-photos");
    if (!box) return;
    const ids = Array.isArray(rec.photoIds) ? rec.photoIds : [];
    if (ids.length === 0 || !window.MyKTAMapPhotos || typeof window.MyKTAMapPhotos.getPhoto !== "function") {
      box.style.display = "none";
      return;
    }
    box.innerHTML = '<div class="kta-jrn-photos-lab">📷 ' + _esc(_t("jrn.fiche.photos", { n: ids.length })) + '</div>' +
                    '<div class="kta-jrn-photos-grid" id="kta-jrn-photos-grid"></div>';
    const grid = document.getElementById("kta-jrn-photos-grid");
    ids.slice(0, 24).forEach(function(pid) {
      window.MyKTAMapPhotos.getPhoto(pid).then(function(p) {
        if (!document.getElementById(FICHE_ID)) return;   // fiche fermée entre-temps
        const cell = document.createElement("div");
        cell.className = "kta-jrn-photo";
        if (p && p.blob) {
          const url = URL.createObjectURL(p.blob);
          _ficheUrls.push(url);
          cell.innerHTML = '<img src="' + url + '" alt="" loading="lazy">';
        } else {
          cell.classList.add("kta-jrn-photo-vide");
          cell.textContent = "🚫";
          cell.title = _t("jrn.fiche.photoManquante");
        }
        grid.appendChild(cell);
      }).catch(function() {});
    });
  }

  // ── Modale carnet ──

  let _sorties = [];
  let _filtrePlan = "";

  function _fermer() {
    _fermerFiche();
    _fermerRecit();
    const m = document.getElementById(MODAL_ID);
    if (m) m.remove();
  }

  // Rend la promesse : « Terminer la sortie » enchaîne `.then(ouvrirFiche)` dessus.
  function _rafraichirListe() {
    if (!document.getElementById(MODAL_ID)) return Promise.resolve();
    return window.Journal.list().then(function(all) {
      _sorties = all;
      _renderListe();
      _renderTotaux();
    });
  }

  // Totaux = terrain SEULEMENT (décision produit) ; le bureau est en pied de bandeau, à part.
  function _renderTotaux() {
    const el = document.getElementById("kta-jrn-totaux");
    if (!el) return;
    let ms = 0, m = 0, nbT = 0, nbB = 0, bureauMs = 0;
    const plans = {};
    _sorties.forEach(function(r) {
      if (_estTerrain(r)) {
        nbT++;
        ms += Number(r.activeMs) || 0;
        m  += Number(r.distM)    || 0;
        if (r.planId) plans[r.planId] = 1;
      } else {
        nbB++;
        bureauMs += Number(r.activeMs) || 0;
      }
    });
    el.innerHTML =
      '<span>🚶 ' + _esc(_t("jrn.totaux.sorties", { n: nbT })) + '</span>' +
      '<span>⏱️ ' + _esc(_dur(ms)) + '</span>' +
      '<span>📏 ' + _esc(_dist(m)) + '</span>' +
      '<span>🗺️ ' + _esc(_t("jrn.totaux.plans", { n: Object.keys(plans).length })) + '</span>' +
      (nbB > 0
        ? '<span class="kta-jrn-totaux-bureau">🖥️ ' +
            _esc(_t("jrn.totaux.bureau", { n: nbB, duree: _dur(bureauMs) })) + '</span>'
        : '');
  }

  // ── Fusion de sorties ──
  // La reprise automatique (journal.js) empêche le hachage d'une sortie ; ce mode répare ce qui est déjà
  // haché : cocher N sorties, les recoller en une.
  let _modeFusion = false;
  const _selFusion = {};       // id -> true

  function _ligne(r, idx) {
    const chips = _chipsAjouts(r);
    const terrain = _estTerrain(r);
    // En mode fusion la ligne coche au lieu d'ouvrir la fiche ; on garde un <button> (cible tactile, style).
    const coche = _modeFusion
      ? '<span class="kta-jrn-coche">' + (_selFusion[r.id] ? '☑️' : '⬜') + '</span>'
      : '';
    return '<button type="button" class="kta-jrn-row' + (terrain ? '' : ' kta-jrn-row-bureau') +
             (_modeFusion && _selFusion[r.id] ? ' kta-jrn-row-sel' : '') +
             '" data-i="' + idx + '" data-id="' + _esc(r.id) + '">' +
             coche +
             '<span class="kta-jrn-row-date">' + _esc(_fmtDate(r.startedAtMs)) + '</span>' +
             '<span class="kta-jrn-row-plan">' + (terrain ? '🚶' : '🖥️') + ' ' +
               _esc(r.planName || "?") + '</span>' +
             '<span class="kta-jrn-row-meta">⏱️ ' + _esc(_dur(_dureeAffichee(r))) +
               (terrain ? ' · 📏 ' + _esc(_dist(r.distM)) : '') +
               (chips.length ? ' · ' + _esc(chips.join(" ")) : '') + '</span>' +
             (r.note ? '<span class="kta-jrn-row-note">📝 ' +
               _esc(String(r.note).slice(0, 90)) + (r.note.length > 90 ? '…' : '') + '</span>' : '') +
           '</button>';
  }

  // Terrain d'abord, travail sur plan dans une section repliée dessous (décision produit).
  function _renderListe() {
    const el = document.getElementById("kta-jrn-liste");
    if (!el) return;
    const rows = _filtrePlan
      ? _sorties.filter(function(r) { return r.planId === _filtrePlan; })
      : _sorties;

    if (rows.length === 0) {
      el.innerHTML = '<p class="kta-ipl-empty">' +
        _esc(_sorties.length === 0 ? _t("jrn.vide") : _t("jrn.videFiltre")) + '</p>';
      return;
    }

    const terrain = [], bureau = [];
    rows.forEach(function(r) { (_estTerrain(r) ? terrain : bureau).push(r); });

    let html = "";
    html += terrain.length
      ? terrain.map(function(r) { return _ligne(r, rows.indexOf(r)); }).join("")
      : '<p class="kta-ipl-empty">' + _esc(_t("jrn.videTerrain")) + '</p>';

    if (bureau.length > 0) {
      html += '<button type="button" class="kta-jrn-bureau-toggle" id="kta-jrn-bureau-toggle">' +
                '🖥️ ' + _esc(_t("jrn.bureau.section", { n: bureau.length })) +
                ' <span id="kta-jrn-bureau-chev">▾</span></button>' +
              '<div class="kta-jrn-bureau-liste" id="kta-jrn-bureau-liste" style="display:none;">' +
                bureau.map(function(r) { return _ligne(r, rows.indexOf(r)); }).join("") +
              '</div>';
    }
    el.innerHTML = html;

    const tog = document.getElementById("kta-jrn-bureau-toggle");
    if (tog) {
      tog.addEventListener("click", function() {
        const box = document.getElementById("kta-jrn-bureau-liste");
        const chev = document.getElementById("kta-jrn-bureau-chev");
        const ouvert = box.style.display !== "none";
        box.style.display = ouvert ? "none" : "";
        if (chev) chev.textContent = ouvert ? "▾" : "▴";
      });
    }

    el.querySelectorAll(".kta-jrn-row").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const r = rows[parseInt(btn.getAttribute("data-i"), 10)];
        if (!r) return;
        if (!_modeFusion) { ouvrirFiche(r.id); return; }
        if (_selFusion[r.id]) delete _selFusion[r.id]; else _selFusion[r.id] = true;
        _renderListe();
      });
    });
    _renderBarreFusion();
  }

  // Barre d'actions SOUS la liste (sur téléphone, elle repousserait les sorties hors de l'écran).
  function _renderBarreFusion() {
    const el = document.getElementById("kta-jrn-liste");
    if (!el) return;
    let barre = document.getElementById("kta-jrn-fusion-barre");
    if (!barre) {
      barre = document.createElement("div");
      barre.id = "kta-jrn-fusion-barre";
      barre.className = "kta-jrn-fusion-barre";
      el.parentNode.insertBefore(barre, el.nextSibling);
    }
    const n = Object.keys(_selFusion).length;
    if (!_modeFusion) {
      barre.innerHTML = '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" ' +
        'id="kta-jrn-fusion-on">🔗 ' + _esc(_t("jrn.fusion.entrer")) + '</button>';
      document.getElementById("kta-jrn-fusion-on").addEventListener("click", function () {
        _modeFusion = true; _renderListe();
      });
      return;
    }
    barre.innerHTML =
      '<span class="kta-jrn-fusion-msg">' + _esc(_t("jrn.fusion.compte", { n: n })) + '</span>' +
      '<button type="button" class="kta-btn kta-btn-primary kta-btn-small" id="kta-jrn-fusion-go"' +
        (n < 2 ? ' disabled' : '') + '>🔗 ' + _esc(_t("jrn.fusion.valider")) + '</button>' +
      '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-jrn-fusion-off">' +
        _esc(_t("jrn.fusion.annuler")) + '</button>';
    document.getElementById("kta-jrn-fusion-off").addEventListener("click", function () {
      _modeFusion = false;
      Object.keys(_selFusion).forEach(function (k) { delete _selFusion[k]; });
      _renderListe();
    });
    const go = document.getElementById("kta-jrn-fusion-go");
    if (go && n >= 2) {
      go.addEventListener("click", function () {
        const ids = Object.keys(_selFusion);
        // 🩸 La fusion SUPPRIME des enregistrements (seul geste destructif d'une archive append-only) : confirmation.
        const demander = window.ktaConfirm(_t("jrn.fusion.confirm", { n: ids.length }));
        demander.then(function (ok) {
          if (!ok) return;
          return window.Journal.fusionner(ids).then(function (rec) {
            _modeFusion = false;
            Object.keys(_selFusion).forEach(function (k) { delete _selFusion[k]; });
            _toast(rec ? _t("jrn.fusion.ok", { n: ids.length }) : _t("jrn.fusion.ko"), rec ? "info" : "warn");
            return _rafraichirListe();
          });
        });
      });
    }
  }

  // ── Onglet Récits : le Mode Histoire au HOME ──
  // Lu DIRECTEMENT, sans charger le plan : note libre (localStorage `myktamap_note_libre_<planId>`,
  // modeHistoire.js) et documents (IDB `myktamap_histoire_pdfs`, store `pdfs`). Un PDF livré dans le ZIP y
  // figure car `modeHistoire.js > syncDocsEmbarques` en dépose une COPIE au chargement du plan (id
  // `embed_<planId>_<rang>`, pas de doublon) : le chemin runtime d'un embarqué n'existe que plan chargé.
  const NOTE_PREFIX = "myktamap_note_libre_";
  const HIST_DB     = "myktamap_histoire_pdfs";
  const HIST_STORE  = "pdfs";
  const HIST_INDEX  = "by_plan";
  const MAX_DOCS_PAR_PLAN = 10;   // aligné sur modeHistoire.js

  let _recitUrl = null;   // blob URL du PDF ouvert dans la fiche récit

  // 🩸 Base du Mode Histoire ouverte en LECTURE sans jamais la créer : `indexedDB.open(name)` sans version crée
  // une base vide, puis modeHistoire.js ferait `open(name, 1)` SANS onupgradeneeded → store `pdfs` absent →
  // plantage. Si on l'a créée, on l'efface.
  function _histOpen() {
    return new Promise(function(resolve) {
      let creee = false, req;
      try { req = indexedDB.open(HIST_DB); } catch(e) { resolve(null); return; }
      req.onupgradeneeded = function() { creee = true; };
      req.onerror   = function() { resolve(null); };
      req.onsuccess = function() {
        const db = req.result;
        if (creee || !db.objectStoreNames.contains(HIST_STORE)) {
          try { db.close(); } catch(e) {}
          if (creee) { try { indexedDB.deleteDatabase(HIST_DB); } catch(e) {} }
          resolve(null);
          return;
        }
        resolve(db);
      };
    });
  }

  // Store v2 (N documents par plan, clé = id, index `by_plan`) ; base restée en v1 (Mode Histoire pas rouvert
  // depuis) : la clé EST le planId.
  function _histTousDocs() {
    return _histOpen().then(function(db) {
      if (!db) return [];
      return new Promise(function(resolve) {
        try {
          const st = db.transaction(HIST_STORE, "readonly").objectStore(HIST_STORE);
          const v1 = !st.indexNames.contains(HIST_INDEX);
          const req = st.getAll();
          req.onsuccess = function() {
            try { db.close(); } catch(e) {}
            const arr = (req.result || []).map(function(r) {
              return {
                id:      v1 ? String(r.planId) : String(r.id),
                planId:  String(r.planId),
                name:    r.name || "histoire.pdf",
                size:    r.size || 0,
                addedAt: r.addedAt || 0
              };
            });
            arr.sort(function(a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });
            resolve(arr);
          };
          req.onerror = function() { try { db.close(); } catch(e) {} resolve([]); };
        } catch(e) { try { db.close(); } catch(e2) {} resolve([]); }
      });
    });
  }

  function _histGet(docId) {
    return _histOpen().then(function(db) {
      if (!db) return null;
      return new Promise(function(resolve) {
        try {
          const req = db.transaction(HIST_STORE, "readonly").objectStore(HIST_STORE).get(String(docId));
          req.onsuccess = function() { try { db.close(); } catch(e) {} resolve(req.result || null); };
          req.onerror   = function() { try { db.close(); } catch(e) {} resolve(null); };
        } catch(e) { try { db.close(); } catch(e2) {} resolve(null); }
      });
    });
  }

  // Ajout / suppression depuis le carnet, par le MÊME schéma que modeHistoire.
  function _histAjouter(planId, file) {
    return _histOpen().then(function(db) {
      if (!db) return Promise.reject(new Error("base indisponible"));
      return new Promise(function(resolve, reject) {
        try {
          const st = db.transaction(HIST_STORE, "readwrite").objectStore(HIST_STORE);
          if (!st.indexNames.contains(HIST_INDEX)) {
            // 🩸 Base encore en v1 : y écrire écraserait le PDF existant (clé planId) ; le Mode Histoire migre.
            try { db.close(); } catch(e) {}
            reject(new Error("v1"));
            return;
          }
          const rec = {
            id:      "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
            planId:  String(planId),
            blob:    file,
            name:    file.name || "histoire.pdf",
            size:    file.size || 0,
            addedAt: Date.now()
          };
          const req = st.add(rec);
          req.onsuccess = function() { try { db.close(); } catch(e) {} resolve(rec); };
          req.onerror   = function() { try { db.close(); } catch(e) {} reject(req.error); };
        } catch(e) { try { db.close(); } catch(e2) {} reject(e); }
      });
    });
  }

  // Restauration d'un document d'un export de profil : on REPOSE le document avec son id, son nom et sa date
  // d'origine (sinon doublons au second import, dates écrasées). `put`, pas `add` : IDEMPOTENT.
  function _histRestaurer(doc) {
    return _histOpen().then(function(db) {
      if (!db) return Promise.reject(new Error("base indisponible"));
      return new Promise(function(resolve, reject) {
        try {
          const st = db.transaction(HIST_STORE, "readwrite").objectStore(HIST_STORE);
          if (!st.indexNames.contains(HIST_INDEX)) {
            // Base v1 : même garde que `_histAjouter`.
            try { db.close(); } catch(e) {}
            reject(new Error("v1"));
            return;
          }
          const req = st.put({
            id:      String(doc.id),
            planId:  String(doc.planId),
            blob:    doc.blob,
            name:    doc.name || "histoire.pdf",
            size:    doc.size || (doc.blob && doc.blob.size) || 0,
            addedAt: doc.addedAt || Date.now()
          });
          req.onsuccess = function() { try { db.close(); } catch(e) {} resolve(true); };
          req.onerror   = function() { try { db.close(); } catch(e) {} reject(req.error); };
        } catch(e) { try { db.close(); } catch(e2) {} reject(e); }
      });
    });
  }

  function _histSupprimer(docId) {
    return _histOpen().then(function(db) {
      if (!db) return false;
      return new Promise(function(resolve) {
        try {
          const req = db.transaction(HIST_STORE, "readwrite").objectStore(HIST_STORE).delete(String(docId));
          req.onsuccess = function() { try { db.close(); } catch(e) {} resolve(true); };
          req.onerror   = function() { try { db.close(); } catch(e) {} resolve(false); };
        } catch(e) { try { db.close(); } catch(e2) {} resolve(false); }
      });
    });
  }

  function _noteDe(planId) {
    try { return localStorage.getItem(NOTE_PREFIX + planId) || ""; } catch(e) { return ""; }
  }
  function _ecrireNote(planId, txt) {
    try { localStorage.setItem(NOTE_PREFIX + planId, String(txt || "")); return true; }
    catch(e) { console.warn("[JournalUi] écriture note échouée :", e); return false; }
  }

  // Nom lisible : registre, puis sorties du carnet (un plan supprimé garde son nom), sinon l'id.
  function _nomDePlan(planId) {
    if (planId === "default") return _t("jrn.recits.sansPlan");
    try {
      const reg = (window.PlanRegistry && window.PlanRegistry.getAll) ? (window.PlanRegistry.getAll() || []) : [];
      for (let i = 0; i < reg.length; i++) {
        if (reg[i] && reg[i].id === planId) return reg[i].name || planId;
      }
    } catch(e) {}
    for (let i = 0; i < _sorties.length; i++) {
      if (_sorties[i].planId === planId && _sorties[i].planName) return _sorties[i].planName;
    }
    return planId;
  }

  function _chargerRecits() {
    const el = document.getElementById("kta-jrn-recits");
    if (!el) return;
    const ids = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(NOTE_PREFIX) === 0) {
          const pid = k.slice(NOTE_PREFIX.length);
          if (String(localStorage.getItem(k) || "").trim()) ids[pid] = { note: true, pdf: false };
        }
      }
    } catch(e) {}
    _histTousDocs().then(function(docs) {
      const parPlan = {};
      docs.forEach(function(d) {
        if (!parPlan[d.planId]) parPlan[d.planId] = [];
        parPlan[d.planId].push(d);
        if (!ids[d.planId]) ids[d.planId] = { note: false };
      });
      const liste = Object.keys(ids).map(function(pid) {
        return { planId: pid, nom: _nomDePlan(pid), note: _noteDe(pid), docs: parPlan[pid] || [] };
      });
      liste.sort(function(a, b) { return a.nom.localeCompare(b.nom); });
      _renderRecits(liste);
    });
  }

  function _renderRecits(liste) {
    const el = document.getElementById("kta-jrn-recits");
    if (!el) return;
    if (liste.length === 0) {
      el.innerHTML = '<p class="kta-ipl-empty">' + _esc(_t("jrn.recits.vide")) + '</p>';
      return;
    }
    el.innerHTML = liste.map(function(r, i) {
      const extrait = String(r.note || "").replace(/[#*_>`\-]/g, " ").replace(/\s+/g, " ").trim();
      return '<button type="button" class="kta-jrn-row kta-jrn-recit-row" data-i="' + i + '">' +
               '<span class="kta-jrn-row-plan">📦 ' + _esc(r.nom) + '</span>' +
               '<span class="kta-jrn-row-meta">' +
                 (r.note ? '📝 ' + _esc(_t("jrn.recits.noteLong", { n: r.note.length })) : '') +
                 (r.note && r.docs.length ? ' · ' : '') +
                 (r.docs.length ? '📄 ' + _esc(_t("jrn.recits.docs", { n: r.docs.length })) : '') +
               '</span>' +
               (extrait ? '<span class="kta-jrn-row-note">' +
                 _esc(extrait.slice(0, 110)) + (extrait.length > 110 ? '…' : '') + '</span>' : '') +
             '</button>';
    }).join("");
    el.querySelectorAll(".kta-jrn-recit-row").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const r = liste[parseInt(btn.getAttribute("data-i"), 10)];
        if (r) _ouvrirRecit(r);
      });
    });
  }

  function _fermerRecit() {
    if (_recitUrl) { try { URL.revokeObjectURL(_recitUrl); } catch(e) {} _recitUrl = null; }
    const el = document.getElementById(RECIT_ID);
    if (el) {
      // 🩸 Vider l'iframe AVANT le remove : sinon WebKit garde la bitmap du PDF en mémoire (cf modeHistoire.js).
      const ifr = el.querySelector("iframe");
      if (ifr) { try { ifr.src = ""; } catch(e) {} }
      el.remove();
    }
  }

  function _ouvrirRecit(r) {
    _fermerRecit();
    const overlay = document.createElement("div");
    overlay.id = RECIT_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.style.zIndex = "100001";
    const rendu = (typeof window.kta_renderMd === "function" && r.note)
      ? window.kta_renderMd(r.note)
      : ('<p class="kta-ipl-empty">' + _esc(r.note || _t("jrn.recits.noteVide")) + '</p>');
    // Sur PC (≥ 1024 px), la fiche récit passe en DEUX COLONNES (note + documents | visionneuse) par la CSS
    // seule ; même balisage partout.
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-jrn-fiche-boite kta-jrn-recit-boite" id="kta-jrn-recit-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📖 ' + _esc(r.nom) + '</span>' +
          '<button class="kta-readme-modal-close" id="kta-jrn-recit-close" type="button" aria-label="✕">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-jrn-fiche-corps kta-jrn-recit-split">' +
          '<div class="kta-jrn-recit-col-gauche">' +
            '<div class="kta-jrn-recit-rendu" id="kta-jrn-recit-rendu">' + rendu + '</div>' +
            '<textarea id="kta-jrn-recit-edit" class="kta-jrn-note" rows="8" style="display:none;">' +
              _esc(r.note || "") + '</textarea>' +
            '<div class="kta-jrn-fiche-actions">' +
              '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-jrn-recit-mod">✏️ ' +
                _esc(_t("jrn.recits.modifier")) + '</button>' +
              '<input type="file" id="kta-jrn-recit-add" accept="application/pdf,.pdf" style="display:none;">' +
              '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-jrn-recit-addbtn">➕ ' +
                _esc(_t("jrn.recits.ajouterPdf")) + '</button>' +
            '</div>' +
            '<div class="kta-jrn-recit-docs" id="kta-jrn-recit-docs"></div>' +
          '</div>' +
          '<div class="kta-jrn-recit-col-droite" id="kta-jrn-recit-pdfbox"></div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-jrn-recit-close").addEventListener("click", _fermerRecit);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _fermerRecit(); });

    // Édition sur place : MÊME clé que le Mode Histoire (`myktamap_note_libre_<planId>`), pas de copie.
    const btnMod = document.getElementById("kta-jrn-recit-mod");
    const ta     = document.getElementById("kta-jrn-recit-edit");
    const vue    = document.getElementById("kta-jrn-recit-rendu");
    let enEdition = false;
    btnMod.addEventListener("click", function() {
      if (!enEdition) {
        enEdition = true;
        vue.style.display = "none";
        ta.style.display  = "";
        btnMod.textContent = "💾 " + _t("jrn.recits.enregistrer");
        try { ta.focus(); } catch(e) {}
        return;
      }
      const txt = ta.value;
      if (!_ecrireNote(r.planId, txt)) { _toast(_t("jrn.recits.errEcriture"), "warn"); return; }
      r.note = txt;
      enEdition = false;
      ta.style.display  = "none";
      vue.style.display = "";
      vue.innerHTML = (typeof window.kta_renderMd === "function" && txt)
        ? window.kta_renderMd(txt)
        : ('<p class="kta-ipl-empty">' + _esc(txt || _t("jrn.recits.noteVide")) + '</p>');
      btnMod.textContent = "✏️ " + _t("jrn.recits.modifier");
      _toast(_t("jrn.toast.noteOk"), "info");
      _chargerRecits();
    });

    // Ajout d'un document : refusé si la base est en v1 (écraserait le PDF) ; le message renvoie vers le
    // Mode Histoire, dont l'ouverture migre.
    const inpAdd = document.getElementById("kta-jrn-recit-add");
    const btnAdd = document.getElementById("kta-jrn-recit-addbtn");
    if (btnAdd && inpAdd) {
      btnAdd.addEventListener("click", function() { inpAdd.click(); });
      inpAdd.addEventListener("change", function() {
        const f = inpAdd.files && inpAdd.files[0];
        inpAdd.value = "";
        if (!f) return;
        const estPdf = (f.type === "application/pdf") || /\.pdf$/i.test(f.name || "");
        if (!estPdf) { _toast(_t("jrn.recits.errPdfSeul"), "warn"); return; }
        if (r.docs.length >= MAX_DOCS_PAR_PLAN) {
          _toast(_t("jrn.recits.errTrop", { max: MAX_DOCS_PAR_PLAN }), "warn");
          return;
        }
        _histAjouter(r.planId, f).then(function(rec) {
          r.docs.push({ id: rec.id, planId: rec.planId, name: rec.name, size: rec.size, addedAt: rec.addedAt });
          _toast(_t("jrn.recits.pdfAjoute"), "info");
          _renderRecitDocs(r);
          _chargerRecits();
        }).catch(function(e) {
          _toast(_t((e && e.message === "v1") ? "jrn.recits.errMigration" : "jrn.recits.errAjout"), "warn");
        });
      });
    }

    _renderRecitDocs(r);
  }

  function _renderRecitDocs(r) {
    const box = document.getElementById("kta-jrn-recit-docs");
    if (!box) return;
    if (!r.docs || r.docs.length === 0) {
      box.innerHTML = '<div class="kta-jrn-recit-pdfmeta">' + _esc(_t("jrn.recits.aucunDoc")) + '</div>';
      return;
    }
    box.innerHTML = r.docs.map(function(d, i) {
      return '<div class="kta-jrn-doc-row">' +
               '<button type="button" class="kta-jrn-doc-open" data-i="' + i + '">📄 ' +
                 _esc(d.name) + ' <span class="kta-jrn-doc-ko">' +
                 Math.round((d.size || 0) / 1024) + ' Ko</span></button>' +
               '<button type="button" class="kta-jrn-doc-del kta-jrn-danger" data-del="' + i + '" ' +
                 'title="' + _esc(_t("jrn.recits.supprimerPdf")) + '">🗑️</button>' +
             '</div>';
    }).join("");

    box.querySelectorAll(".kta-jrn-doc-open").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const d = r.docs[parseInt(btn.getAttribute("data-i"), 10)];
        if (!d) return;
        _histGet(d.id).then(function(rec) {
          if (!rec || !rec.blob) { _toast(_t("jrn.recits.pdfIntrouvable"), "warn"); return; }
          if (_recitUrl) { try { URL.revokeObjectURL(_recitUrl); } catch(e) {} }
          _recitUrl = URL.createObjectURL(rec.blob);
          const vue = document.getElementById("kta-jrn-recit-pdfbox");
          if (!vue) return;
          const vieux = vue.querySelector("iframe");
          if (vieux) { try { vieux.src = ""; } catch(e) {} }
          vue.innerHTML = '<div class="kta-jrn-recit-pdfmeta">' + _esc(rec.name || "histoire.pdf") +
                            ' · ' + Math.round((rec.size || 0) / 1024) + ' Ko</div>' +
                          '<iframe class="kta-jrn-recit-iframe" src="' + _recitUrl + '" title="PDF"></iframe>';
          // La fiche ne s'élargit (2 colonnes sur PC) QUE quand un PDF est ouvert.
          const boite = document.getElementById("kta-jrn-recit-boite");
          if (boite) boite.classList.add("kta-jrn-recit-avecpdf");
        });
      });
    });

    box.querySelectorAll(".kta-jrn-doc-del").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        const i = parseInt(btn.getAttribute("data-del"), 10);
        const d = r.docs[i];
        if (!d) return;
        if (!(await window.ktaConfirm(_t("jrn.recits.confirmSupprPdf", { nom: window.ktaEsc(d.name) })))) return;
        _histSupprimer(d.id).then(function(ok) {
          if (!ok) { _toast(_t("jrn.recits.errSuppr"), "warn"); return; }
          r.docs.splice(i, 1);
          const vue = document.getElementById("kta-jrn-recit-pdfbox");
          if (vue) {
            const ifr = vue.querySelector("iframe");
            if (ifr) { try { ifr.src = ""; } catch(e) {} }
            vue.innerHTML = "";
          }
          const boite = document.getElementById("kta-jrn-recit-boite");
          if (boite) boite.classList.remove("kta-jrn-recit-avecpdf");
          if (_recitUrl) { try { URL.revokeObjectURL(_recitUrl); } catch(e) {} _recitUrl = null; }
          _toast(_t("jrn.recits.pdfSupprime"), "info");
          _renderRecitDocs(r);
          _chargerRecits();
        });
      });
    });
  }

  function ouvrir(planIdFiltre) {
    if (!window.Journal) { _toast(_t("jrn.err.module"), "warn"); return; }
    _fermer();
    _filtrePlan = planIdFiltre || "";

    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-jrn-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📔 ' + _esc(_t("jrn.titre")) + '</span>' +
          '<button class="kta-readme-modal-close" id="kta-jrn-close" type="button" aria-label="✕">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          // 2e onglet : les récits, tous plans confondus, éditables sur place.
          '<div class="kta-jrn-onglets">' +
            '<button type="button" class="kta-jrn-onglet kta-jrn-onglet-actif" data-tab="sorties">📔 ' +
              _esc(_t("jrn.tab.sorties")) + '</button>' +
            '<button type="button" class="kta-jrn-onglet" data-tab="recits">📖 ' +
              _esc(_t("jrn.tab.recits")) + '</button>' +
          '</div>' +
          '<div id="kta-jrn-tab-sorties">' +
            '<div class="kta-jrn-totaux" id="kta-jrn-totaux"></div>' +
            '<div class="kta-jrn-barre">' +
              '<select id="kta-jrn-filtre" class="kta-jrn-select"></select>' +
            '</div>' +
            '<div class="kta-jrn-liste" id="kta-jrn-liste">' +
              '<p class="kta-ipl-empty">' + _esc(_t("jrn.chargement")) + '</p>' +
            '</div>' +
          '</div>' +
          '<div id="kta-jrn-tab-recits" style="display:none;">' +
            '<div class="kta-jrn-liste" id="kta-jrn-recits">' +
              '<p class="kta-ipl-empty">' + _esc(_t("jrn.chargement")) + '</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-jrn-close").addEventListener("click", _fermer);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _fermer(); });

    // Récits scannés à la première ouverture de l'onglet seulement (localStorage + IDB).
    let _recitsCharges = false;
    overlay.querySelectorAll(".kta-jrn-onglet").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const tab = btn.getAttribute("data-tab");
        overlay.querySelectorAll(".kta-jrn-onglet").forEach(function(b) {
          b.classList.toggle("kta-jrn-onglet-actif", b === btn);
        });
        document.getElementById("kta-jrn-tab-sorties").style.display = (tab === "sorties") ? "" : "none";
        document.getElementById("kta-jrn-tab-recits").style.display  = (tab === "recits")  ? "" : "none";
        if (tab === "recits" && !_recitsCharges) { _recitsCharges = true; _chargerRecits(); }
      });
    });

    window.Journal.list().then(function(all) {
      _sorties = all;
      // Filtre plan alimenté par les sorties (pas le registre : un plan supprimé garde ses sorties).
      const vus = {}, opts = [];
      all.forEach(function(r) {
        if (r.planId && !vus[r.planId]) { vus[r.planId] = 1; opts.push({ id: r.planId, nom: r.planName || r.planId }); }
      });
      const sel = document.getElementById("kta-jrn-filtre");
      if (sel) {
        sel.innerHTML = '<option value="">' + _esc(_t("jrn.filtre.tous")) + '</option>' +
          opts.map(function(o) {
            return '<option value="' + _esc(o.id) + '"' + (o.id === _filtrePlan ? ' selected' : '') + '>' +
                   _esc(o.nom) + '</option>';
          }).join("");
        sel.style.display = opts.length > 1 ? "" : "none";
        sel.addEventListener("change", function() { _filtrePlan = sel.value; _renderListe(); });
      }
      _renderListe();
      _renderTotaux();
    });
  }

  // « 🏁 Clôturer ma sortie » (modale Session) : la clôture manuelle garde TOUJOURS (cf journal.js > cloturer()).
  // On DEMANDE OÙ L'ON EST avant de clôturer.
  // 🩸 La distance entre deux « 📍 Je suis ici » se comble à l'arrivée de l'ancre SUIVANTE : après le dernier
  // repère, la marche jusqu'à la sortie n'est comptée que par le podomètre (rien, téléphone en poche).
  // 🩸 Une heure n'est pas une position : poser l'ancre à la position tracker ajouterait 0 m.
  // Passage par `recalerTrackerSurPoint`, seul chemin qui alimente la distance estimée. Le clic carte libre
  // (`src: "click"`) en est exclu parce qu'il corrige souvent une position fausse ; ici la personne DÉCLARE
  // où elle est ressortie.
  let _finPickHandler = null;
  let _finPickFloater = null;

  function _finPickFermer() {
    if (window.map && _finPickHandler) { try { window.map.off("click", _finPickHandler); } catch (e) {} }
    _finPickHandler = null;
    if (_finPickFloater && _finPickFloater.parentNode) _finPickFloater.remove();
    _finPickFloater = null;
    try { if (window.map) window.map.getContainer().style.cursor = ""; } catch (e) {}
  }

  // Promesse résolue quand la position est posée OU passée.
  function _demanderPositionSortie() {
    if (!window.map || typeof window.recalerTrackerSurPoint !== "function") {
      return Promise.resolve(false);
    }
    return new Promise(function (resolve) {
      _finPickFermer();
      // `.kta-iti-floater` est reconnue par `_modeClicCarteActif()` : aucune popup n'avale le clic, ré-émis
      // en phase capture.
      _finPickFloater = document.createElement("div");
      _finPickFloater.id = "kta-jrn-fin-pick";
      _finPickFloater.className = "kta-iti-floater";
      _finPickFloater.innerHTML =
        '<span class="kta-iti-floater-icon">🏁</span>' +
        '<span class="kta-iti-floater-msg"></span>' +
        '<button class="kta-btn kta-btn-ghost" id="kta-jrn-fin-skip" type="button"></button>';
      _finPickFloater.querySelector(".kta-iti-floater-msg").textContent = _t("jrn.finPos.invite");
      const skip = _finPickFloater.querySelector("#kta-jrn-fin-skip");
      skip.textContent = _t("jrn.finPos.passer");
      document.body.appendChild(_finPickFloater);
      skip.addEventListener("click", function () { _finPickFermer(); resolve(false); });

      _finPickHandler = function (e) {
        if (!e || !e.latlng) return;
        const x = e.latlng.lng;
        const y = (window.APP_CONFIG && window.APP_CONFIG.imageHeight)
                    ? (window.APP_CONFIG.imageHeight - e.latlng.lat) : e.latlng.lat;
        _finPickFermer();
        try { window.recalerTrackerSurPoint(x, y, undefined); } catch (err) {
          console.warn("[JournalUi] ancre de fin :", err && err.message);
        }
        resolve(true);
      };
      window.map.on("click", _finPickHandler);
      try { window.map.getContainer().style.cursor = "crosshair"; } catch (e) {}
    });
  }

  function cloturerDepuisUi() {
    if (!window.Journal || !window.Journal.getCurrent()) {
      _toast(_t("jrn.err.aucuneSortie"), "warn");
      return Promise.resolve(null);
    }
    // Demande FACULTATIVE : on ne bloque jamais une clôture (depuis le canapé, pas de position à donner).
    return _demanderPositionSortie().then(function () {
      return window.Journal.cloturer();
    }).then(function(rec) {
      if (!rec) return null;
      _toast(_t("jrn.toast.cloturee"), "info");
      ouvrirFiche(rec.id);
      return rec;
    });
  }

  window.JournalUi = {
    ouvrir:           ouvrir,
    ouvrirFiche:      ouvrirFiche,
    cloturerDepuisUi: cloturerDepuisUi,
    // Documents du Mode Histoire pour l'export/import de profil, exposés ICI plutôt que réécrits dans
    // profileExportImport.js : le schéma est déjà en double avec modeHistoire.js, une 3e copie dériverait.
    // 🩸 `_histOpen` porte le piège : `indexedDB.open(nom)` SANS version CRÉE une base vide.
    histoire: {
      lister:    _histTousDocs,    // → [{id, planId, name, size, addedAt}] (sans blob)
      getDoc:    _histGet,         // → l'enregistrement COMPLET, blob inclus
      restaurer: _histRestaurer,   // ← repose un doc exporté (idempotent)
      // Supprimer un plan PEUT emporter ses documents (case à cocher). Base v1 : l'id listé EST le planId,
      // la même suppression vaut pour les deux schémas.
      supprimerPourPlan: function(planId) {
        return _histTousDocs().then(function(docs) {
          const siens = docs.filter(function(d) { return d.planId === String(planId); });
          return Promise.all(siens.map(function(d) { return _histSupprimer(d.id); }))
            .then(function(r) { return r.filter(Boolean).length; });
        });
      }
    }
  };

  console.log("[JournalUi] Module chargé");
})();
