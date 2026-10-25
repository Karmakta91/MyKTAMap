/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE ALERTS — Modales d'alertes publiques + mise à jour
// =========================
// Exposé sur window :
//   - afficherModaleAlerteAbsente(status) → modale informative compacte « Aucune alerte en cours » / « Déjà à jour »
//     / « Vérification impossible (hors ligne) » (clic sur 🚨 sans alerte, ou sur la version du pied de page sans
//     mise à jour).
//   - afficherSelecteurAlertes(alerts, opts) → liste multi-alertes par criticité (emergency > warning > info) ;
//     clic sur une ligne → opts.onSelect(alert), sinon afficherModaleAlerte.
//   - afficherModaleAlerte(alert, onClose) → détail coloré (emergency rouge + pulse, warning orange, info bleu).
//   - afficherModaleUpdateDispo(opts) → proposition de mise à jour (douce / plus tard), appelée par updateChecker.js.
// Dépend de (window.*) : AlertChecker.dismiss (optionnel), KtaExtensions.ligneNotifications (optionnel),
// mettreAJourCodeSeul, viderCacheAppli, __MKM__.build ;
// localStorage["myktamap_last_version_data"] (updateChecker.js), ["myktamap_alert_seen_<id>"] (alertChecker.js).
// Chargé après interface.js (index.html) ; les modales s'ouvrent au runtime, les globales sont alors posées.
// Alertes : alert.json (`active: true`) lu par alertChecker.js ; « pas d'alerte » = alert.json renommé en .lock
// (404) ou `"active": false`.

// Ligne « 🔔 notifications » d'une extension (KtaExtensions.ligneNotifications) au pied du corps de la fenêtre 🚨 :
// null sans extension qui la propose, sur myktamap.fr, ou une fois l'autorisation donnée ou refusée — rien n'est alors
// ajouté. Posée dans les trois fenêtres (aucune alerte, sélecteur, détail) : en mode plan, l'alerte s'ouvre d'office.
function _ktaPoserLigneNotif(corps) {
  const K = window.KtaExtensions;
  if (!corps || !K || typeof K.ligneNotifications !== "function") return;
  let l = null;
  try { l = K.ligneNotifications(); } catch(e) { l = null; }
  if (l) corps.appendChild(l);
}

window.afficherModaleAlerteAbsente = function(status) {
  if (document.getElementById("kta-alert-absent-modal")) return;

  const isOffline   = (status === "offline");
  const isUpToDate  = (status === "up-to-date");

  // « up-to-date » : notes de la dernière version connue (mémorisées par UpdateChecker au dernier fetch réussi).
  let lastVersionData = null;
  if (isUpToDate) {
    try {
      const raw = localStorage.getItem("myktamap_last_version_data");
      if (raw) lastVersionData = JSON.parse(raw);
    } catch(e) {}
  }

  // Échappement (contenu distant, anti-XSS).
  function _esc(s) { return window.ktaEsc(s); }

  let icon, title, msg, extraHtml = "";
  if (isOffline) {
    icon  = "📡";
    title = window.I18n.t("alerts.absent.offline.title");
    msg   = window.I18n.t("alerts.absent.offline.msg");
  } else if (isUpToDate) {
    icon  = "✅";
    title = window.I18n.t("alerts.absent.uptodate.title");
    const installed = (window.__MKM__ && window.__MKM__.build) || (lastVersionData && lastVersionData.version) || "?";
    msg = window.I18n.t("alerts.absent.uptodate.msg", { version: _esc(installed) });
    // 🩸 Notes affichées SEULEMENT si la version en cache est EXACTEMENT la version installée : après une mise à jour
    // puis un retour arrière, le cache garderait les notes d'une autre version. Cache périmé → titre + version
    // seulement (le prochain check de version.json le remet à jour).
    const cacheMatchInstalled = lastVersionData && lastVersionData.version === installed;
    if (cacheMatchInstalled && (lastVersionData.released || (Array.isArray(lastVersionData.notes) && lastVersionData.notes.length))) {
      extraHtml += '<div class="kta-alert-absent-version-block">';
      if (lastVersionData.released) {
        extraHtml += '<div class="kta-alert-absent-version-released">' + window.I18n.t("alerts.absent.uptodate.publishedOn", { date: _esc(lastVersionData.released) }) + '</div>';
      }
      if (Array.isArray(lastVersionData.notes) && lastVersionData.notes.length) {
        extraHtml += '<div class="kta-alert-absent-version-notes-titre">' + window.I18n.t("alerts.absent.uptodate.notesTitre") + '</div>';
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
    title = window.I18n.t("alerts.absent.none.title");
    msg   = window.I18n.t("alerts.absent.none.msg");
  }

  // Variante compacte (fond translucide léger, boîte centrée non pleine hauteur).
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
        '<button class="kta-btn kta-btn-primary" id="kta-alert-absent-ok" type="button">' + window.I18n.t("alerts.btn.ok") + '</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);
  _ktaPoserLigneNotif(modal.querySelector(".kta-alert-absent-corps"));

  function _fermer() { modal.remove(); }
  document.getElementById("kta-alert-absent-ok").addEventListener("click", _fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });
  function _onKey(e) { if (e.key === "Escape") { _fermer(); document.removeEventListener("keydown", _onKey); } }
  document.addEventListener("keydown", _onKey);
};

// Sélecteur quand N > 1 alertes actives, classé par criticité ; clic sur une ligne → modale détail.
// `alerts` : alertes normalisées par alertChecker.js. `opts.onSelect(alert)` : clic sur une ligne.
// `opts.fromBoot` : vrai au démarrage (non acquittées seulement) ; faux au clic sur 🚨 (toutes, acquittées comprises).
// Source d'une alerte : celle d'une extension (« 🏢 Organisation… ») ; une alerte d'alert.json n'est étiquetée
// « plateforme » que si une extension fournit aussi des alertes (sinon rien ne change). Texte échappé par l'appelant.
function _ktaSourceAlerte(a) {
  if (a && a.source) return a.source;
  const ext = window.KtaExtensions && typeof window.KtaExtensions.aPrise === "function" && window.KtaExtensions.aPrise("alertes");
  return ext ? window.I18n.t("alerts.source.site") : "";
}

// Date de publication lisible : un horodatage ISO complet (alertes d'extension) passe en date + heure locales ;
// une date seule (alert.json, « 2026-10-18 ») reste telle quelle (la convertir la décalerait d'un jour selon le
// fuseau). ⚠️ `released` reste l'ISO brut partout ailleurs : il sert à reconnaître une alerte modifiée.
function _dateLisible(released) {
  const s = String(released || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR",
    { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

window.afficherSelecteurAlertes = function(alerts, opts) {
  if (!Array.isArray(alerts) || alerts.length === 0) return;
  if (document.getElementById("kta-alert-selector-modal")) return;
  opts = opts || {};

  function _esc(s) { return window.ktaEsc(s); }

  // Tri par priorité puis released décroissant.
  const prioOrder = { emergency: 0, warning: 1, info: 2 };
  const sorted = alerts.slice().sort(function(a, b) {
    const pa = prioOrder[a.level] != null ? prioOrder[a.level] : 3;
    const pb = prioOrder[b.level] != null ? prioOrder[b.level] : 3;
    if (pa !== pb) return pa - pb;
    return (b.released || "").localeCompare(a.released || "");
  });

  // Alerte déjà lue (utile au clic sur 🚨) : localStorage["myktamap_alert_seen_<id>"] = released acquitté.
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
    const src   = _ktaSourceAlerte(a);
    const ts    = a.released ? a.released.replace("T", " ").replace(/:\d{2}\.?\d*Z?$/, "") : "";
    return '' +
      '<button type="button" class="kta-alert-selector-row kta-alert-selector-row-' + level + (acq ? ' kta-alert-selector-row-seen' : '') + '" data-alert-id="' + _esc(a.id || "") + '">' +
        '<span class="kta-alert-selector-dot"></span>' +
        '<span class="kta-alert-selector-content">' +
          '<span class="kta-alert-selector-title">' + _esc(a.title || window.I18n.t("alerts.selector.noTitle")) + '</span>' +
          (ts || src ? '<span class="kta-alert-selector-meta">' + _esc([src, ts].filter(Boolean).join(" · ")) + (acq ? window.I18n.t("alerts.selector.acknowledgedSuffix") : '') + '</span>' : '') +
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
        '<span class="kta-readme-modal-titre">' + window.I18n.t("alerts.selector.titre", { count: sorted.length }) + '</span>' +
        '<button class="kta-panneau-close" id="kta-alert-selector-close" type="button" aria-label="' + window.I18n.t("alerts.btn.close") + '">&times;</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-alert-selector-corps">' +
        '<div class="kta-alert-selector-list">' + rowsHtml + '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);
  _ktaPoserLigneNotif(modal.querySelector(".kta-alert-selector-corps"));

  function _fermer() {
    if (modal.parentNode) modal.remove();
    document.removeEventListener("keydown", _onKey);
    // Une alerte arrivée pendant que le sélecteur était ouvert s'ouvre maintenant (AlertChecker).
    if (window.AlertChecker && typeof window.AlertChecker.dismiss === "function") window.AlertChecker.dismiss();
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
      // Courte pause (fondu), puis la modale détail ; à sa fermeture, onSelect.
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

// `onClose` optionnel : appelé à la fermeture (AlertChecker).
window.afficherModaleAlerte = function(alert, onClose) {
  if (!alert) return;
  if (document.getElementById("kta-alert-modal")) return;

  function _esc(s) { return window.ktaEsc(s); }

  const id    = alert.id    || "";  // acquittement individuel par id
  const level = alert.level === "warning" || alert.level === "info" ? alert.level : "emergency";
  const title = alert.title   || window.I18n.t("alerts.detail.defaultTitle");
  const msg   = alert.message || "";
  const details = Array.isArray(alert.details) ? alert.details : [];
  const released = alert.released || "";

  const detailsHtml = details.length
    ? '<ul class="kta-alert-details">' +
        details.map(function(d) { return '<li>' + _esc(d) + '</li>'; }).join("") +
      '</ul>'
    : '';

  const source = _ktaSourceAlerte(alert);
  const footerInfo = (source ? '<div class="kta-alert-released">' + _esc(source) + '</div>' : '') + (released
    ? '<div class="kta-alert-released">' + window.I18n.t("alerts.detail.publishedOn", { date: _esc(_dateLisible(released)) }) + '</div>'
    : '');

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
        '<button class="kta-btn kta-btn-primary kta-alert-btn-ok" id="kta-alert-ok" type="button">' + window.I18n.t("alerts.detail.understood") + '</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);
  _ktaPoserLigneNotif(modal.querySelector(".kta-alert-corps"));
  // Signal neutre : l'alerte est À L'ÉCRAN (détail ouvert, pas seulement listée dans le sélecteur). Une extension peut
  // en tirer un accusé de lecture ; sans écouteur, rien.
  try {
    window.dispatchEvent(new CustomEvent("mktm:alerte-affichee", { detail: { id: String(id), released: String(released) } }));
  } catch(e) { /* rien */ }

  function _fermer() {
    if (window.AlertChecker && typeof window.AlertChecker.dismiss === "function") {
      // id + released : acquittement individuel.
      window.AlertChecker.dismiss(id, released);
    }
    modal.remove();
    if (typeof onClose === "function") {
      try { onClose(); } catch(e) {}
    }
  }

  document.getElementById("kta-alert-ok").addEventListener("click", _fermer);
  // PAS de fermeture au clic sur le fond (décision produit) : alerte critique, « J'ai compris » explicite.
};

// ── Modale « mise à jour disponible » (updateChecker.js) ──────────
window.afficherModaleUpdateDispo = function(opts) {
  // Déjà ouverte : rien.
  if (document.getElementById("kta-update-modal")) return;

  const localVersion  = opts.localVersion  || "?";
  const remote        = opts.remote        || {};
  const remoteVersion = remote.version     || "?";
  const released      = remote.released    || "";
  const notes         = Array.isArray(remote.notes) ? remote.notes
                       : (remote.notes ? [remote.notes] : []);

  const notesHtml = notes.length
    ? '<ul style="margin:8px 0 0 0; padding-left:22px; color:var(--kta-texte-2); font-size:13px; line-height:1.6;">' +
        notes.map(function(n) { return '<li>' + window.ktaEsc(n) + '</li>'; }).join("") +
      '</ul>'
    : '<p style="color:var(--kta-texte-3); font-size:12px; font-style:italic; margin:8px 0 0 0;">' + window.I18n.t("alerts.update.noNotes") + '</p>';

  const modal = document.createElement("div");
  modal.id = "kta-update-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:85vh;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">' + window.I18n.t("alerts.update.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-update-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">' + window.I18n.t("alerts.update.versionsTitre") + '</div>' +
          '<div style="display:flex; align-items:center; gap:14px; padding:10px 14px; background:var(--kta-info-fond); border-radius:8px; border:1px solid var(--kta-info-bord);">' +
            '<div style="font-size:12px; color:var(--kta-texte-3);">' +
              window.I18n.t("alerts.update.installed") + '<br>' +
              '<strong style="font-size:18px; color:var(--kta-texte-2); font-family:ui-monospace,monospace;">' + localVersion + '</strong>' +
            '</div>' +
            '<div style="font-size:20px; color:var(--kta-interaction);">→</div>' +
            '<div style="font-size:12px; color:var(--kta-texte-3);">' +
              window.I18n.t("alerts.update.available") + (released ? ' (' + released + ')' : '') + '<br>' +
              '<strong style="font-size:18px; color:var(--kta-accent-texte); font-family:ui-monospace,monospace;">' + remoteVersion + '</strong>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">' + window.I18n.t("alerts.update.newsTitre") + '</div>' +
          notesHtml +
        '</div>' +

        // Un seul mode de mise à jour : une ligne dit ce qui est rafraîchi et ce qui est gardé.
        '<div class="kta-aide-section">' +
          '<div style="color:var(--kta-texte-2); font-size:12.5px; line-height:1.55; margin-bottom:8px;">' +
            window.I18n.t("alerts.update.softDesc") +
          '</div>' +
          // 🩸 Pas de « Reset complet » ici : il efface tout (sessions, photos, sauvegardes) sans recours et ne vit que
          // dans 🆘 Dépannage.
          '<div style="color:var(--kta-texte-3); font-size:12px; line-height:1.5;">' + window.I18n.t("alerts.update.depannage") + '</div>' +
        '</div>' +

        '<div style="display:flex; gap:10px; margin-top:14px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-update-postpone" type="button" style="flex:1;">' + window.I18n.t("alerts.update.postpone") + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-update-accept-soft" type="button" style="flex:2;">' + window.I18n.t("alerts.update.acceptSoft") + '</button>' +
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
  // Mise à jour douce : données utilisateur préservées.
  document.getElementById("kta-update-accept-soft").addEventListener("click", function() {
    _fermer();
    if (typeof opts.onAcceptSoft === "function") {
      opts.onAcceptSoft();
    } else if (typeof window.mettreAJourCodeSeul === "function") {
      window.mettreAJourCodeSeul();
    }
  });
  // Clic sur le fond = Plus tard.
  modal.addEventListener("click", function(e) {
    if (e.target === modal) {
      _fermer();
      if (typeof opts.onPostpone === "function") opts.onPostpone();
    }
  });
};
