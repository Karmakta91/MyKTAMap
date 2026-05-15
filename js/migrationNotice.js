/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.is-underground.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// MIGRATION NOTICE — annonce du changement de domaine
// =========================
// Affiche une modale one-shot au premier lancement sur l'ancien domaine
// `myktamap.is-underground.fr` pour informer l'utilisateur de la migration
// vers `myktamap.fr` prevue le 15 juillet 2026.
//
// DECISION DE DESIGN
//   - Modal pedagogique cote code (= ce module) au PREMIER LANCEMENT
//   - + Entree info permanente cote alert.json pour le rappel via badge 🚨
//   - 2 niveaux d'info complementaires : modal pousse une fois + alerte
//     consultable a la demande via le bouton 🚨
//
// PERSISTANCE
//   localStorage["myktamap_migration_seen"] = ISO timestamp du dernier "Plus tard"
//   - Si jamais vue → affiche au prochain lancement
//   - Si "Plus tard" cliqué → re-affiche dans 7 jours minimum (sympa, pas
//     harassant)
//   - Si "Ouvrir myktamap.fr" cliqué → marque comme vue indefiniment
//
// HOSTNAME GATE
//   Affiche UNIQUEMENT si hostname === "myktamap.is-underground.fr".
//   Sur localhost, dev, ou nouveau domaine, le module est silencieux.
//
// HOOK SPLASH
//   Comme AlertChecker, OOMGuard, UpdateChecker → différé jusqu'à la fin du
//   splash via window.MigrationNotice.notifySplashEnded().
//
// API exposée :
//   - window.MigrationNotice.check()             — appelée au boot
//   - window.MigrationNotice.notifySplashEnded() — appelée après splash
// =========================

(function() {
  "use strict";

  // === CONSTANTES DE LA MIGRATION ===
  const OLD_HOSTNAME       = "myktamap.is-underground.fr";
  const NEW_DOMAIN_DISPLAY = "myktamap.fr";
  const NEW_DOMAIN_LIVE    = false;                // ⚠️ Mettre à true quand DNS pointé
  const CUTOFF_DATE        = "15 juillet 2026";    // date affichée dans la modal
  const LS_KEY             = "myktamap_migration_seen";
  const RECHECK_AFTER_MS   = 7 * 24 * 60 * 60 * 1000;  // 7 jours

  let _splashEnded   = false;
  let _pendingShow   = false;

  function _shouldShow() {
    // Hostname gate
    if (typeof location === "undefined" || location.hostname !== OLD_HOSTNAME) {
      return false;
    }
    // Persistance : si déjà vu < 7j ago, on skip. Si "vu définitivement"
    // (= "Ouvrir le nouveau domaine" cliqué), on stocke un timestamp far
    // future et on skip toujours.
    let last;
    try { last = localStorage.getItem(LS_KEY); } catch(e) { return true; }
    if (!last) return true;
    if (last === "permanent") return false;
    const lastMs = Date.parse(last);
    if (isNaN(lastMs)) return true;
    return (Date.now() - lastMs) > RECHECK_AFTER_MS;
  }

  function _markSeen(permanent) {
    try {
      localStorage.setItem(LS_KEY, permanent ? "permanent" : new Date().toISOString());
    } catch(e) {}
  }

  function _afficherModaleInterne() {
    if (document.getElementById("kta-migration-modal")) return;

    const lienHtml = NEW_DOMAIN_LIVE
      ? '<a href="https://' + NEW_DOMAIN_DISPLAY + '/" target="_blank" rel="noopener" class="kta-migration-link">' +
          'Ouvrir ' + NEW_DOMAIN_DISPLAY +
        '</a>'
      : '<span class="kta-migration-link kta-migration-link-disabled" aria-disabled="true">' +
          '🚧 ' + NEW_DOMAIN_DISPLAY + ' — Arrive bientôt (' + CUTOFF_DATE + ')' +
        '</span>';

    const modal = document.createElement("div");
    modal.id = "kta-migration-modal";
    modal.className = "kta-readme-modal-overlay kta-migration-overlay";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-migration-boite">' +
        '<div class="kta-readme-modal-header kta-migration-header">' +
          '<span class="kta-readme-modal-titre">🌐 MyKTAMap déménage</span>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-migration-corps">' +

          '<p class="kta-migration-lead">' +
            'L\'application change de domaine officiel pour <strong>' + NEW_DOMAIN_DISPLAY + '</strong>.' +
          '</p>' +

          '<div class="kta-migration-section">' +
            '<div class="kta-migration-section-titre">📅 Quand ?</div>' +
            '<p>Migration prévue le <strong>' + CUTOFF_DATE + '</strong>. Tu as donc le temps de te préparer.</p>' +
          '</div>' +

          '<div class="kta-migration-section">' +
            '<div class="kta-migration-section-titre">🔗 Nouveau domaine</div>' +
            '<p style="text-align:center; margin:8px 0 0 0;">' + lienHtml + '</p>' +
          '</div>' +

          '<div class="kta-migration-section">' +
            '<div class="kta-migration-section-titre">⚠️ Que faire avant la coupure ?</div>' +
            '<ul style="margin:6px 0 0; padding-left:22px; line-height:1.6;">' +
              '<li><strong>Exporte tes sessions</strong> via 💾 Sauvegarde session sur chaque plan ' +
                '(les sessions sont liées au domaine actuel — elles ne suivront PAS automatiquement).</li>' +
              '<li><strong>Garde tes ZIPs de plans</strong> pour les ré-importer sur le nouveau domaine.</li>' +
              '<li><strong>Si l\'app est installée</strong> sur ton écran d\'accueil (PWA), tu devras la ' +
                '<em>supprimer manuellement</em> puis la réinstaller depuis ' + NEW_DOMAIN_DISPLAY + '.</li>' +
            '</ul>' +
          '</div>' +

          '<div class="kta-migration-section kta-migration-section-soft">' +
            '<div class="kta-migration-section-titre">ℹ️ Pendant la transition</div>' +
            '<p>L\'ancien et le nouveau domaine fonctionneront en parallèle pendant plusieurs semaines. ' +
              'Tu peux continuer à utiliser ce site comme d\'habitude jusqu\'à la date de coupure.</p>' +
          '</div>' +

        '</div>' +
        '<div class="kta-migration-actions">' +
          '<button class="kta-btn kta-btn-ghost" id="kta-migration-later" type="button">Plus tard</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-migration-ok" type="button">✓ J\'ai compris</button>' +
        '</div>' +
      '</div>';

    document.documentElement.appendChild(modal);

    function _fermer(permanent) {
      _markSeen(!!permanent);
      modal.remove();
    }

    document.getElementById("kta-migration-later").addEventListener("click", function() {
      _fermer(false);  // re-affiche dans 7 jours
    });
    document.getElementById("kta-migration-ok").addEventListener("click", function() {
      _fermer(true);   // vu définitivement, jamais re-affiché
    });
    // Pas de fermeture au clic backdrop : on veut un acquittement explicite.
  }

  function check() {
    if (!_shouldShow()) return;
    if (_splashEnded) {
      _afficherModaleInterne();
    } else {
      _pendingShow = true;
    }
  }

  function notifySplashEnded() {
    _splashEnded = true;
    if (_pendingShow) {
      _pendingShow = false;
      _afficherModaleInterne();
    }
  }

  // Boot — appel automatique au chargement du module. Le splash gate gère le timing.
  check();

  window.MigrationNotice = {
    check:             check,
    notifySplashEnded: notifySplashEnded
  };
})();
