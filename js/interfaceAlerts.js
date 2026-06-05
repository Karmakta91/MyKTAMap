/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE ALERTS — Modales d'alertes publiques + mise à jour
// =========================
// 🆕 v1.31.0 (P3 Lot 1 — découpe interface.js) : module extrait de
// js/interface.js (lignes 9324-9701 avant extraction) pour réduire le
// volume du fichier principal et améliorer la maintenabilité.
//
// Aucun changement de comportement runtime. Les 4 fonctions exposées
// sur `window` sont strictement identiques à v1.30.1.
//
// 📋 Fonctions exposées (toutes via window.*) :
//   - afficherModaleAlerteAbsente(status)
//        → Modale informative "Aucune alerte en cours" / "Déjà à jour"
//          / "Vérification impossible (offline)". Pattern compact :
//          backdrop translucide, boîte centrée non pleine hauteur.
//          Utilisée au clic sur le badge 🚨 sans alerte active, et
//          au clic badge version footer sans update dispo.
//   - afficherSelecteurAlertes(alerts, opts)
//        → Liste à choix multi-alertes triée par criticité
//          (emergency > warning > info). Click sur une row → callback
//          opts.onSelect(alert) ou par défaut afficherModaleAlerte.
//   - afficherModaleAlerte(alert, onClose)
//        → Modale détail d'une alerte avec niveau coloré (emergency
//          rouge + pulse, warning orange, info bleu). Volontairement
//          sans fermeture backdrop (alerte critique = clic explicite).
//   - afficherModaleUpdateDispo(opts)
//        → Modale de proposition de mise à jour avec choix douce / reset
//          complet / plus tard. Déléguée par updateChecker.js au boot.
//
// 🔌 Dépendances externes (toutes via window.* — aucun import) :
//   - window.AlertChecker.dismiss(id, released)  [optionnel]
//   - window.afficherModaleAlerte                [self-ref interne]
//   - window.mettreAJourCodeSeul                 [interface.js]
//   - window.viderCacheAppli                     [interface.js]
//   - window.__MKM__.build                       [copyright.js]
//   - localStorage["myktamap_last_version_data"] [updateChecker.js]
//   - localStorage["myktamap_alert_seen_<id>"]   [alertChecker.js]
//
// 📍 Ordre de chargement (cf index.html) :
//   - Doit charger APRÈS interface.js (pour que window.mettreAJourCodeSeul
//     soit défini au moment où une modale Update est ouverte). En
//     pratique : ordre cosmétique car les modales sont ouvertes au
//     RUNTIME (clic user), bien après DOMContentLoaded → toutes les
//     fonctions globales sont déjà posées. Place ce script juste après
//     interface.js dans index.html.
//
// =========================
// 🚨 MODALE ALERTE PUBLIQUE — diffusée par alert.json (incendie, fermeture, etc.)
// =========================
// Déclenchée par alertChecker.js si alert.json a `active: true`.
// 3 niveaux possibles selon `level` :
//   - "emergency" : rouge + pulse (incendie, fermeture totale, etc.)
//   - "warning"   : orange (perturbation, info importante)
//   - "info"      : bleu (annonce neutre)
// Modale informative quand l'utilisateur clique sur 🔔 et qu'il n'y a pas
// d'alerte en cours (alert.json renommé en .lock côté serveur → 404, OU
// alert.json présent avec "active": false). Permet de confirmer visuellement
// que la situation est revenue à la normale.
window.afficherModaleAlerteAbsente = function(status) {
  if (document.getElementById("kta-alert-absent-modal")) return;

  const isOffline   = (status === "offline");
  const isUpToDate  = (status === "up-to-date");

  // Pour "up-to-date" : lit les notes de la dernière version connue (stockées
  // par UpdateChecker au dernier fetch réussi) pour les afficher dans la modale.
  let lastVersionData = null;
  if (isUpToDate) {
    try {
      const raw = localStorage.getItem("myktamap_last_version_data");
      if (raw) lastVersionData = JSON.parse(raw);
    } catch(e) {}
  }

  // Échappe le texte HTML (anti-XSS sur contenu remote)
  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  let icon, title, msg, extraHtml = "";
  if (isOffline) {
    icon  = "📡";
    title = "Vérification impossible";
    msg   = "Tu es hors ligne — impossible de vérifier l'état des alertes ou des mises à jour. Réessaie quand tu auras du réseau.";
  } else if (isUpToDate) {
    icon  = "✅";
    title = "Déjà à jour";
    const installed = (window.__MKM__ && window.__MKM__.build) || (lastVersionData && lastVersionData.version) || "?";
    msg = "Tu utilises la dernière version : <strong>" + _esc(installed) + "</strong>.";
    // 🐛 v1.34.25 — On affiche les notes UNIQUEMENT si la version cachée
    // dans localStorage correspond exactement à la version installée. Sinon
    // le cache est stale (cas typique : update douce v1.34.X → v1.35.0 →
    // rollback v1.34.4 — le LS gardait les notes de v1.35.0 alors que
    // __MKM__.build était v1.34.X, et la modale "Déjà à jour" affichait
    // des notes obsolètes/fausses). Si cache stale → on n'affiche pas les
    // notes (juste le titre + version installée). Le prochain check
    // version.json mettra à jour le cache LS avec les vraies notes.
    const cacheMatchInstalled = lastVersionData && lastVersionData.version === installed;
    if (cacheMatchInstalled && (lastVersionData.released || (Array.isArray(lastVersionData.notes) && lastVersionData.notes.length))) {
      extraHtml += '<div class="kta-alert-absent-version-block">';
      if (lastVersionData.released) {
        extraHtml += '<div class="kta-alert-absent-version-released">Publiée le <strong>' + _esc(lastVersionData.released) + '</strong></div>';
      }
      if (Array.isArray(lastVersionData.notes) && lastVersionData.notes.length) {
        extraHtml += '<div class="kta-alert-absent-version-notes-titre">📝 Notes de cette version</div>';
        extraHtml += '<ul class="kta-alert-absent-version-notes">';
        lastVersionData.notes.forEach(function(n) {
          extraHtml += '<li>' + _esc(n) + '</li>';
        });
        extraHtml += '</ul>';
      }
      extraHtml += '</div>';
    }
  } else {
    icon  = "✅";
    title = "Aucune alerte en cours";
    msg   = "Pas d'alerte publique active actuellement. Le serveur ne diffuse aucune communication urgente. Continue à utiliser l'app normalement.";
  }

  // Variante compacte pour les modales informatives (vs overlay opaque global) :
  // backdrop translucide léger, boîte centrée mais NON pleine hauteur.
  const modal = document.createElement("div");
  modal.id = "kta-alert-absent-modal";
  modal.className = "kta-alert-absent-overlay kta-alert-absent-compact";
  modal.innerHTML =
    '<div class="kta-alert-absent-boite">' +
      '<div class="kta-alert-absent-header">' +
        '<span class="kta-alert-absent-icon">' + icon + '</span>' +
        '<span class="kta-alert-absent-title">' + title + '</span>' +
      '</div>' +
      '<div class="kta-alert-absent-corps">' +
        '<p class="kta-alert-absent-msg">' + msg + '</p>' +
        extraHtml +
      '</div>' +
      '<div class="kta-alert-absent-actions">' +
        '<button class="kta-btn kta-btn-primary" id="kta-alert-absent-ok" type="button">OK</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() { modal.remove(); }
  document.getElementById("kta-alert-absent-ok").addEventListener("click", _fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });
  // Échap = fermer
  function _onKey(e) { if (e.key === "Escape") { _fermer(); document.removeEventListener("keydown", _onKey); } }
  document.addEventListener("keydown", _onKey);
};

// v166 : sélecteur d'alertes quand N > 1 alertes actives. Liste classée par
// criticité (emergency > warning > info). Click sur une row → ouvre la modale
// détail correspondante. Après acquit, si d'autres alertes restent → re-ouvre
// le sélecteur. Si l'user ferme le sélecteur (✕ ou Échap), tout se ferme.
//
// `alerts` : array d'objets alert (format normalisé par alertChecker.js).
// `opts.onSelect(alert)` : callback appelé quand l'user clique une row.
// `opts.fromBoot` : si true (boot post-splash), bypass-acquittement check
//                   (= filtre sur non-acquittées seulement). Si false (click
//                   bouton 🚨), affiche TOUTES les alertes même acquittées.
window.afficherSelecteurAlertes = function(alerts, opts) {
  if (!Array.isArray(alerts) || alerts.length === 0) return;
  if (document.getElementById("kta-alert-selector-modal")) return;
  opts = opts || {};

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Tri par priorité (emergency > warning > info) puis released desc
  const prioOrder = { emergency: 0, warning: 1, info: 2 };
  const sorted = alerts.slice().sort(function(a, b) {
    const pa = prioOrder[a.level] != null ? prioOrder[a.level] : 3;
    const pb = prioOrder[b.level] != null ? prioOrder[b.level] : 3;
    if (pa !== pb) return pa - pb;
    return (b.released || "").localeCompare(a.released || "");
  });

  // Indicateur acquit : utile en mode "click 🚨" pour distinguer les alertes
  // déjà lues. localStorage["myktamap_alert_seen_<id>"] = released acquitté.
  function _isAcquittee(a) {
    if (!a.id || !a.released) return false;
    try {
      const seen = localStorage.getItem("myktamap_alert_seen_" + a.id);
      return seen === a.released;
    } catch(e) { return false; }
  }

  const rowsHtml = sorted.map(function(a) {
    const level = (a.level === "warning" || a.level === "info") ? a.level : "emergency";
    const acq   = _isAcquittee(a);
    const ts    = a.released ? a.released.replace("T", " ").replace(/:\d{2}\.?\d*Z?$/, "") : "";
    return '' +
      '<button type="button" class="kta-alert-selector-row kta-alert-selector-row-' + level + (acq ? ' kta-alert-selector-row-seen' : '') + '" data-alert-id="' + _esc(a.id || "") + '">' +
        '<span class="kta-alert-selector-dot"></span>' +
        '<span class="kta-alert-selector-content">' +
          '<span class="kta-alert-selector-title">' + _esc(a.title || "(sans titre)") + '</span>' +
          (ts ? '<span class="kta-alert-selector-meta">' + _esc(ts) + (acq ? ' · ✓ acquittée' : '') + '</span>' : '') +
        '</span>' +
        '<span class="kta-alert-selector-arrow">›</span>' +
      '</button>';
  }).join("");

  const modal = document.createElement("div");
  modal.id = "kta-alert-selector-modal";
  modal.className = "kta-readme-modal-overlay kta-alert-selector-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite kta-alert-selector-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">📋 ' + sorted.length + ' alertes actives</span>' +
        '<button class="kta-panneau-close" id="kta-alert-selector-close" type="button" aria-label="Fermer">&times;</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-alert-selector-corps">' +
        '<p class="kta-alert-selector-hint">Sélectionne une alerte pour voir le détail. Triées par criticité décroissante.</p>' +
        '<div class="kta-alert-selector-list">' + rowsHtml + '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() {
    if (modal.parentNode) modal.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) { if (e.key === "Escape") _fermer(); }
  modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });
  document.addEventListener("keydown", _onKey);
  document.getElementById("kta-alert-selector-close").addEventListener("click", _fermer);

  modal.querySelectorAll(".kta-alert-selector-row").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const id = btn.getAttribute("data-alert-id");
      const alertObj = sorted.filter(function(a) { return a.id === id; })[0];
      if (!alertObj) return;
      _fermer();
      // Petite pause pour fade-out visuel propre, puis ouvre la détail.
      // Au close de la détail, on appelle onSelect pour permettre la cascade
      // (réouvrir le sélecteur si d'autres alertes restent à voir).
      setTimeout(function() {
        if (typeof opts.onSelect === "function") {
          opts.onSelect(alertObj);
        } else {
          window.afficherModaleAlerte(alertObj);
        }
      }, 150);
    });
  });
};

// v163 : 2e arg optionnel `onClose` — callback appelé à la fermeture de la
// modale (utilisé par AlertChecker pour la cascade multi-alertes).
window.afficherModaleAlerte = function(alert, onClose) {
  if (!alert) return;
  if (document.getElementById("kta-alert-modal")) return;

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const id    = alert.id    || "";  // v163 : acquit individuel par id
  const level = alert.level === "warning" || alert.level === "info" ? alert.level : "emergency";
  const title = alert.title   || "🚨 Alerte";
  const msg   = alert.message || "";
  const details = Array.isArray(alert.details) ? alert.details : [];
  const released = alert.released || "";

  const detailsHtml = details.length
    ? '<ul class="kta-alert-details">' +
        details.map(function(d) { return '<li>' + _esc(d) + '</li>'; }).join("") +
      '</ul>'
    : '';

  const footerInfo = released
    ? '<div class="kta-alert-released">Publié le ' + _esc(released) + '</div>'
    : '';

  const modal = document.createElement("div");
  modal.id = "kta-alert-modal";
  modal.className = "kta-readme-modal-overlay kta-alert-overlay kta-alert-level-" + level;
  modal.innerHTML =
    '<div class="kta-readme-modal-boite kta-alert-boite">' +
      '<div class="kta-readme-modal-header kta-alert-header">' +
        '<span class="kta-alert-pulse-side">!</span>' +
        '<span class="kta-alert-title-text">' + _esc(title) + '</span>' +
        '<span class="kta-alert-pulse-side">!</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-alert-corps">' +
        '<p class="kta-alert-msg">' + _esc(msg) + '</p>' +
        detailsHtml +
        footerInfo +
      '</div>' +
      '<div class="kta-alert-actions">' +
        '<button class="kta-btn kta-btn-primary kta-alert-btn-ok" id="kta-alert-ok" type="button">J\'ai compris</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() {
    if (window.AlertChecker && typeof window.AlertChecker.dismiss === "function") {
      // v163 : passe id + released pour acquit individuel (pas juste released)
      window.AlertChecker.dismiss(id, released);
    }
    modal.remove();
    // v163 : callback pour la cascade multi-alertes
    if (typeof onClose === "function") {
      try { onClose(); } catch(e) {}
    }
  }

  document.getElementById("kta-alert-ok").addEventListener("click", _fermer);
  // Volontairement PAS de fermeture au clic backdrop : alerte critique,
  // l'utilisateur doit cliquer explicitement "J'ai compris".
};

// =========================
// 🔔 MODALE MISE À JOUR DISPONIBLE — déclenchée par updateChecker.js
// =========================
window.afficherModaleUpdateDispo = function(opts) {
  // Si déjà ouverte (re-appel), ne fait rien
  if (document.getElementById("kta-update-modal")) return;

  const localVersion  = opts.localVersion  || "?";
  const remote        = opts.remote        || {};
  const remoteVersion = remote.version     || "?";
  const released      = remote.released    || "";
  const notes         = Array.isArray(remote.notes) ? remote.notes
                       : (remote.notes ? [remote.notes] : []);

  const notesHtml = notes.length
    ? '<ul style="margin:8px 0 0 0; padding-left:22px; color:#c8d0e0; font-size:13px; line-height:1.6;">' +
        notes.map(function(n) { return '<li>' + String(n).replace(/</g, "&lt;") + '</li>'; }).join("") +
      '</ul>'
    : '<p style="color:#8892a4; font-size:12px; font-style:italic; margin:8px 0 0 0;">Aucune note de version fournie.</p>';

  const modal = document.createElement("div");
  modal.id = "kta-update-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:85vh;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">🔔 Mise à jour disponible</span>' +
        '<button class="kta-panneau-close" id="kta-update-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">📦 Versions</div>' +
          '<div style="display:flex; align-items:center; gap:14px; padding:10px 14px; background:rgba(140,180,255,0.06); border-radius:8px; border:1px solid rgba(140,180,255,0.18);">' +
            '<div style="font-size:12px; color:#8892a4;">' +
              'Installée<br>' +
              '<strong style="font-size:18px; color:#c8d0e0; font-family:ui-monospace,monospace;">' + localVersion + '</strong>' +
            '</div>' +
            '<div style="font-size:20px; color:#8cb4ff;">→</div>' +
            '<div style="font-size:12px; color:#8892a4;">' +
              'Disponible' + (released ? ' (' + released + ')' : '') + '<br>' +
              '<strong style="font-size:18px; color:#f4c542; font-family:ui-monospace,monospace;">' + remoteVersion + '</strong>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">🆕 Nouveautés</div>' +
          notesHtml +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">🔄 Deux modes de mise à jour</div>' +
          '<div style="background:rgba(108,226,138,0.08); border:1px solid rgba(108,226,138,0.30); border-radius:8px; padding:10px 12px; margin-bottom:8px;">' +
            '<div style="font-weight:700; color:#6ce28a; font-size:13px; margin-bottom:4px;">🪶 Mise à jour douce (recommandée)</div>' +
            '<div style="color:#c8d0e0; font-size:12.5px; line-height:1.55;">' +
              'Seul le <strong>code de l\'app</strong> est rafraîchi (HTML, JS, CSS, docs). ' +
              'Tes <strong>plans, sessions et préférences sont préservés</strong>.' +
            '</div>' +
          '</div>' +
          '<div style="background:rgba(255,107,107,0.06); border:1px solid rgba(255,107,107,0.25); border-radius:8px; padding:10px 12px;">' +
            '<div style="font-weight:700; color:#ff6b6b; font-size:13px; margin-bottom:4px;">💥 Reset complet</div>' +
            '<div style="color:#c8d0e0; font-size:12.5px; line-height:1.55;">' +
              'À utiliser <strong>seulement</strong> si la mise à jour douce ne suffit pas ' +
              '(problème persistant). Purge <strong>tout</strong> : cache, plans, sessions, préférences.' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div style="display:flex; gap:10px; margin-top:14px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-update-postpone" type="button" style="flex:1;">Plus tard (24h)</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-update-accept-soft" type="button" style="flex:2;">🪶 Mise à jour douce</button>' +
        '</div>' +
        '<div style="text-align:center; margin-top:10px;">' +
          '<button class="kta-btn-link kta-update-link-danger" id="kta-update-accept-hard" type="button">💥 Forcer un reset complet à la place</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() { modal.remove(); }

  document.getElementById("kta-update-close").addEventListener("click", function() {
    _fermer();
    if (typeof opts.onPostpone === "function") opts.onPostpone();
  });
  document.getElementById("kta-update-postpone").addEventListener("click", function() {
    _fermer();
    if (typeof opts.onPostpone === "function") opts.onPostpone();
  });
  // 🪶 Mise à jour douce — préserve les données utilisateur
  document.getElementById("kta-update-accept-soft").addEventListener("click", function() {
    _fermer();
    if (typeof opts.onAcceptSoft === "function") {
      opts.onAcceptSoft();
    } else if (typeof window.mettreAJourCodeSeul === "function") {
      window.mettreAJourCodeSeul();
    }
  });
  // 💥 Reset complet — purge tout (fallback)
  document.getElementById("kta-update-accept-hard").addEventListener("click", function() {
    _fermer();
    if (typeof opts.onAcceptHard === "function") {
      opts.onAcceptHard();
    } else if (typeof opts.onAccept === "function") {
      // Rétro-compat — l'ancien callback `onAccept` était le reset complet
      opts.onAccept();
    } else if (typeof window.viderCacheAppli === "function") {
      window.viderCacheAppli();
    }
  });
  // Clic backdrop = postpone (équivalent Plus tard)
  modal.addEventListener("click", function(e) {
    if (e.target === modal) {
      _fermer();
      if (typeof opts.onPostpone === "function") opts.onPostpone();
    }
  });
};
