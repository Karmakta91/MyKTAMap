/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE MAINTENANCE — calibrage d'échelle, réinitialisation, mise à jour douce
// =========================
// Expose : ouvrirCalibrageEchelle() (produit en croix distance pixel mesurée / distance réelle →
//   APP_CONFIG.scale) · viderCacheAppli() (ping serveur + double confirmation, puis SW, caches, localStorage,
//   sessionStorage, TOUTES les bases IDB, reload) · mettreAJourCodeSeul() (purge du cache PWA seulement,
//   données préservées ; badge version du footer et Configuration) · _pingInternet() / _pingInternetUrl.
// Dépend de : UnlockGate, PinLock, KtaInstance, KtaExtensions (avantReinitialisation), afficherToast.
// Fonctions appelées au runtime : l'ordre de chargement est cosmétique.

// ── Calibrage d'échelle ──────────
function ouvrirCalibrageEchelle() {
  const existing = document.getElementById("kta-calib-modal");
  if (existing) { existing.remove(); return; }

  // Valeur du champ, pas APP_CONFIG (modifiée sans être appliquée).
  const champScale = document.getElementById("cfg_scale");
  const scaleActuel = champScale ? parseFloat(champScale.value) : APP_CONFIG.scale;

  // i18n au rendu (la modale s'ouvre après I18n.init).
  const _t = function(k) { return window.I18n.t(k); };

  const modal = document.createElement("div");
  modal.id = "kta-calib-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:420px; height:auto; max-height:90vh;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">${_t("maint.calib.title")}</span>
        <button class="kta-panneau-close" id="kta-calib-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <p style="font-size:13px; color:#8892a4; margin:0 0 14px; line-height:1.5;">
          ${_t("maint.calib.intro")}
        </p>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${_t("maint.calib.sectionValues")}</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">${_t("maint.calib.current")}</label>
            <input class="kta-cfg-input" id="calib_actuel" type="number" step="0.01" value="${scaleActuel}" readonly style="opacity:0.6;">

            <label class="kta-cfg-label">${_t("maint.calib.displayed")}</label>
            <input class="kta-cfg-input" id="calib_affichee" type="number" step="0.1" placeholder="${_t("maint.calib.phDisplayed")}">

            <label class="kta-cfg-label">${_t("maint.calib.real")}</label>
            <input class="kta-cfg-input" id="calib_reelle" type="number" step="0.1" placeholder="${_t("maint.calib.phReal")}">
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${_t("maint.calib.sectionResult")}</div>
          <div style="background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px; font-family:'Courier New',monospace; font-size:13px;">
            <div style="color:#8892a4;">${_t("maint.calib.newScale")}</div>
            <div id="calib_resultat" style="font-size:22px; color:#8cb4ff; font-weight:600; margin-top:4px;">—</div>
            <div id="calib_formule" style="font-size:11px; color:#6a7488; margin-top:6px;"></div>
          </div>
        </div>

        <div id="calib_erreur" class="kta-conv-erreur" style="display:none;"></div>

        <div class="kta-conv-actions" style="margin-top:14px;">
          <button class="kta-btn kta-btn-ghost"   id="calib_annuler">${_t("maint.btn_cancel")}</button>
          <button class="kta-btn kta-btn-primary"  id="calib_appliquer" disabled>${_t("maint.calib.apply")}</button>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  const inputAffichee = document.getElementById("calib_affichee");
  const inputReelle   = document.getElementById("calib_reelle");
  const resultatEl    = document.getElementById("calib_resultat");
  const formuleEl     = document.getElementById("calib_formule");
  const erreurEl      = document.getElementById("calib_erreur");
  const btnAppliquer  = document.getElementById("calib_appliquer");
  const btnAnnuler    = document.getElementById("calib_annuler");
  const btnClose      = document.getElementById("kta-calib-close");

  function fermer() { modal.remove(); }

  let nouveauScale = null;

  function recalculer() {
    erreurEl.style.display = "none";
    const aff = parseFloat(inputAffichee.value);
    const reel = parseFloat(inputReelle.value);

    if (!aff || !reel || aff <= 0 || reel <= 0) {
      resultatEl.textContent = "—";
      formuleEl.textContent  = "";
      btnAppliquer.disabled  = true;
      nouveauScale = null;
      return;
    }

    nouveauScale = scaleActuel * ( aff / reel );
    resultatEl.textContent = nouveauScale.toFixed(3) + " px/m";
    formuleEl.textContent  = scaleActuel + " × (" + aff + " / " + reel + ") = " + nouveauScale.toFixed(3);
    btnAppliquer.disabled  = false;
  }

  inputAffichee.addEventListener("input", recalculer);
  inputReelle.addEventListener("input", recalculer);

  btnClose.addEventListener("click", fermer);
  btnAnnuler.addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  btnAppliquer.addEventListener("click", function() {
    if (nouveauScale === null || nouveauScale <= 0) {
      erreurEl.textContent = _t("maint.calib.invalid");
      erreurEl.style.display = "block";
      return;
    }
    if (champScale) {
      champScale.value = nouveauScale.toFixed(3);
      // La valeur s'enregistre comme une saisie (change → setPlanScale), sans bouton Appliquer.
      champScale.dispatchEvent(new Event("change", { bubbles: true }));
    }
    fermer();
  });

  setTimeout(function() { inputAffichee.focus(); }, 50);
}

// ── Vider le cache applicatif ──────────
// 🔒 Ping sur <origin>/ping.html (location.origin DYNAMIQUE : prod, dev, local), plus aucun appel externe.
// Same-origin : pas de CORS côté Nginx. Promise<boolean>, timeout 5 s, navigator.onLine en court-circuit,
// corps attendu exactement « OK ». Vrai = DNS + SSL + Nginx joignables, la PWA peut se recharger.
// « Internet OK mais serveur down » = hors ligne (voulu : inutile de mettre à jour sans source du code).
const PING_URL = (typeof location !== "undefined" && location.origin)
  ? (location.origin + "/ping.html")
  : "/ping.html";  // fallback chemin relatif (très improbable)
const PING_EXPECTED_BODY = "OK";  // body attendu trim-comparé (case-insensitive)

function _pingInternet() {
  return new Promise(function(resolve) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Navigateur sûr d'être hors ligne : pas de fetch.
      resolve(false);
      return;
    }
    let done = false;
    const timer = setTimeout(function() {
      if (done) return;
      done = true;
      try { ctrl.abort(); } catch(e) {}
      resolve(false);
    }, 5000);
    const ctrl = new AbortController();
    // credentials: "omit" (requête neutre, sans cookie). 🩸 Cache-bust ?_=Date.now() (comme version.json /
    // alert.json) : sinon le SW peut servir un ancien ping réussi alors que le serveur est down.
    const pingUrlCb = PING_URL + "?_=" + Date.now();
    fetch(pingUrlCb, {
      method: "GET",
      cache:  "no-store",
      signal: ctrl.signal,
      credentials: "omit"
    }).then(function(res) {
      if (!res.ok) {
        // HTTP non-2xx (404 fichier absent, 5xx Nginx…).
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(false);
        return;
      }
      return res.text();
    }).then(function(body) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // « OK » attendu, tolère « ok\n » ou « Ok ».
      const trimmed = (body || "").trim().toUpperCase();
      resolve(trimmed === PING_EXPECTED_BODY);
    }).catch(function() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(false);
    });
  });
}
// Exposé (ex. sessionExporter, onglet KMZ, avant d'ouvrir un lien externe).
window._pingInternet = _pingInternet;
// URL résolue, pour les messages d'erreur.
window._pingInternetUrl = PING_URL;

// ── Mise à jour douce : purge du cache PWA seulement ──────────
// Contrairement à viderCacheAppli(), session, registre de plans, IndexedDB, localStorage, sessionStorage et
// cookies restent intacts. Étapes : ping (5 s) → reg.update() sans attendre → SKIP_WAITING au SW en
// attente → purge de TOUS les caches → reload.
// 🩸 Ne jamais demander le nom du cache au SW COURANT pour l'épargner : c'est l'ANCIEN avant update, son
// cache préservé ressert l'ancien copyright.js (__MKM__.build figé, badge « ancienne → nouvelle » qui
// persiste). Le handler GET_CACHE_NAME du SW reste pour le debug.

async function mettreAJourCodeSeul() {
  // Overlay pendant l'opération (1-3 s).
  const overlay = document.createElement("div");
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-modal">' +
      '<div class="kta-modal-icon">⏳</div>' +
      '<div class="kta-modal-titre">' + window.I18n.t("maint.title_soft_update") + '</div>' +
      '<div class="kta-modal-texte" id="kta-soft-update-status">' + window.I18n.t("maint.msg_checking_connection") + '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);
  const status = document.getElementById("kta-soft-update-status");

  function _statusUpdate(txt) { if (status) status.innerHTML = txt; }

  try {
    // 1. Ping : sans réseau, le re-fetch échouerait APRÈS la purge.
    _statusUpdate(window.I18n.t("maint.msg_checking_connection"));
    const online = await _pingInternet();
    if (!online) {
      overlay.remove();
      _softUpdateOfflineWarning();
      return;
    }

    // 2. reg.update() FIRE-AND-FORGET : l'attendre bloque 30 s-2 min (install synchrone de ~100 assets en
    //    cache:'reload'). Le téléchargement se fait pendant « Préparation… » / « Rechargement… ».
    // 🩸 Puis polling de reg.waiting (200 ms × 25 = 5 s max) : un reload trop tôt trouve waiting = null,
    //    SKIP_WAITING n'est jamais envoyé et l'ancien SW ressert l'ancienne version. Dès qu'un waiting
    //    apparaît : SKIP_WAITING puis attente de controllerchange (garde 1,5 s). Timeout sans waiting →
    //    reload quand même (mode dégradé).
    _statusUpdate(window.I18n.t("maint.msg_prep_sw"));
    if (navigator.serviceWorker) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          // Sans await : l'install tourne en arrière-plan.
          reg.update().catch(function(e) {
            console.warn("[Soft update] reg.update() :", e);
          });
          const DEADLINE_MS = Date.now() + 5000;
          let nouveauSwActive = false;
          while (Date.now() < DEADLINE_MS) {
            const reg2 = await navigator.serviceWorker.getRegistration();
            if (reg2 && reg2.waiting) {
              _statusUpdate(window.I18n.t("maint.msg_activating_sw"));
              reg2.waiting.postMessage({ type: "SKIP_WAITING" });
              // controllerchange (nouveau SW aux commandes) ou garde 1,5 s.
              await new Promise(function(resolve) {
                let done = false;
                function _onChange() { if (!done) { done = true; resolve(); } }
                navigator.serviceWorker.addEventListener("controllerchange", _onChange, { once: true });
                setTimeout(function() {
                  if (!done) {
                    done = true;
                    navigator.serviceWorker.removeEventListener("controllerchange", _onChange);
                    resolve();
                  }
                }, 1500);
              });
              nouveauSwActive = true;
              console.log("[Soft update] Nouveau SW actif via SKIP_WAITING");
              break;
            }
            await new Promise(function(r) { setTimeout(r, 200); });
          }
          if (!nouveauSwActive) {
            console.warn("[Soft update] Timeout 5s : pas de reg.waiting détecté, reload sans skip waiting (l'install se finira en background, l'user verra peut-être l'ancienne version au reload — 1 restart manuel nécessaire dans ce cas).");
          }
        }
      } catch(e) {
        console.warn("[Soft update] erreur SW :", e);
      }
    }

    // 3. Purge TOTALE des caches PWA, sans filtre (comme killsw.html) : le nouveau SW repeuple le sien au
    //    reload. Coût : un re-téléchargement des assets, acceptable pour une action volontaire.
    _statusUpdate(window.I18n.t("maint.msg_cleaning_caches"));
    if (window.caches) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(function(k) {
          console.log("[Soft update] suppression cache :", k);
          return caches.delete(k);
        }));
        console.log("[Soft update] " + keys.length + " cache(s) supprimé(s) (purge totale)");
      } catch(e) {
        console.warn("[Soft update] purge caches :", e);
      }
    }

    // 4. Reload : le nouveau SW prend le contrôle (cache rempli par son install, fini ou en cours) ;
    //    démarrage un peu plus long, mais la nouvelle version est garantie.
    _statusUpdate(window.I18n.t("maint.msg_reloading"));
    setTimeout(function() {
      window.location.reload();
    }, 200); // 200ms (au lieu de 400) — postMessage SKIP_WAITING est arrivé

  } catch(err) {
    overlay.remove();
    console.error("[Soft update] erreur :", err);
    window.ktaAlerte(window.I18n.t("maint.error_soft_update", { detail: (err.message || err) }), { type: "erreur" });
  }
}

// Hors ligne pendant la mise à jour douce : action ANNULÉE d'office (pas de « Continuer quand même », la
// relancer échouerait pareil), ton rassurant (rien n'a été touché). Même gabarit que
// _resetFlowOfflineWarning (kta-oom-modal-boite : Causes / Conséquence / Recommandation).
function _softUpdateOfflineWarning() {
  const origin = (window._pingInternetUrl || "").replace(/\/ping\.html.*$/, "") || "https://myktamap.fr";
  const overlay = document.createElement("div");
  overlay.id = "kta-soft-update-offline";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-oom-modal-boite">' +
      '<div class="kta-readme-modal-header kta-oom-header">' +
        '<span class="kta-oom-titre-big">' +
          '<span class="kta-oom-warn-side">⚠️</span>' +
          '<span class="kta-oom-titre-text">' + window.I18n.t("maint.title_offline_warning") + '</span>' +
          '<span class="kta-oom-warn-side">⚠️</span>' +
        '</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-oom-corps">' +
        '<div class="kta-oom-intro">' +
          window.I18n.t("maint.intro_soft_update_offline", { origin: origin }) +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">' + window.I18n.t("maint.section_causes") + '</div>' +
          '<ul class="kta-oom-list">' +
            '<li>' + window.I18n.t("maint.reason_no_internet") + '</li>' +
            '<li>' + window.I18n.t("maint.reason_server_down", { origin: origin }) + '</li>' +
            '<li>' + window.I18n.t("maint.reason_ssl_dns") + '</li>' +
          '</ul>' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">' + window.I18n.t("maint.section_good_news") + '</div>' +
          '<p>' +
            window.I18n.t("maint.reassurance_no_data_lost") +
          '</p>' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">' + window.I18n.t("maint.section_recommendation") + '</div>' +
          '<p>' +
            window.I18n.t("maint.recommendation_soft_update", { origin: origin }) +
          '</p>' +
        '</div>' +
      '</div>' +
      '<div class="kta-oom-actions" style="justify-content:center;">' +
        '<button class="kta-btn kta-btn-primary" id="kta-soft-update-offline-ok" type="button">' + window.I18n.t("maint.btn_understood") + '</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);
  document.getElementById("kta-soft-update-offline-ok").addEventListener("click", function() {
    overlay.remove();
  });
  // Clic sur le fond : ferme aussi.
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

function viderCacheAppli() {
  const cfgModal = document.getElementById("kta-cfg-modal");
  if (cfgModal) cfgModal.remove();

  // Connexion vérifiée AVANT toute confirmation, avec un « Vérification… » (pas de gel muet de 5 s).
  const overlayPing = document.createElement("div");
  overlayPing.className = "kta-modal-overlay";
  overlayPing.innerHTML = '<div class="kta-modal"><div class="kta-modal-icon">📶</div><div class="kta-modal-titre">' + window.I18n.t("maint.ping_title") + '</div><div class="kta-modal-texte">' + window.I18n.t("maint.ping_text") + '</div></div>';
  document.documentElement.appendChild(overlayPing);

  _pingInternet().then(function(online) {
    overlayPing.remove();
    if (online) {
      _resetFlowConfirmation();
    } else {
      _resetFlowOfflineWarning();
    }
  });
}

// Hors ligne ou serveur MyKTAMap injoignable (DNS, SSL, Nginx, hébergeur) : avertissement insistant, puis
// double confirmation si l'utilisateur continue. 🩸 Plus critique qu'en mise à jour : sans serveur, le SW
// ne peut PAS re-cacher les assets → app inutilisable après l'effacement.
function _resetFlowOfflineWarning() {
  const origin = (window._pingInternetUrl || "").replace(/\/ping\.html.*$/, "") || "https://myktamap.fr";
  const overlay = document.createElement("div");
  overlay.id = "kta-reset-offline";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-oom-modal-boite">' +
      '<div class="kta-readme-modal-header kta-oom-header">' +
        '<span class="kta-oom-titre-big">' +
          '<span class="kta-oom-warn-side">⚠️</span>' +
          '<span class="kta-oom-titre-text">' + window.I18n.t("maint.title_offline_warning") + '</span>' +
          '<span class="kta-oom-warn-side">⚠️</span>' +
        '</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-oom-corps">' +
        '<div class="kta-oom-intro">' +
          window.I18n.t("maint.intro_reset_offline", { origin: origin }) +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">' + window.I18n.t("maint.section_causes") + '</div>' +
          '<ul class="kta-oom-list">' +
            '<li>' + window.I18n.t("maint.reason_no_internet") + '</li>' +
            '<li>' + window.I18n.t("maint.reason_server_down", { origin: origin }) + '</li>' +
            '<li>' + window.I18n.t("maint.reason_ssl_dns") + '</li>' +
          '</ul>' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">' + window.I18n.t("maint.section_consequence_reset") + '</div>' +
          '<ul class="kta-oom-list">' +
            '<li>' + window.I18n.t("maint.consequence_app_unusable") + '</li>' +
            '<li>' + window.I18n.t("maint.consequence_no_splash") + '</li>' +
            '<li>' + window.I18n.t("maint.consequence_data_lost") + '</li>' +
          '</ul>' +
        '</div>' +
        '<div class="kta-oom-section">' +
          '<div class="kta-oom-section-titre">' + window.I18n.t("maint.section_recommendation_check") + '</div>' +
          '<p>' +
            window.I18n.t("maint.recommendation_reset", { origin: origin }) +
          '</p>' +
        '</div>' +
      '</div>' +
      '<div class="kta-oom-actions" style="justify-content:space-between;">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-reset-offline-annuler" type="button">' + window.I18n.t("maint.btn_cancel") + '</button>' +
        '<button class="kta-btn kta-btn-danger"  id="kta-reset-offline-forcer"  type="button">' + window.I18n.t("maint.btn_continue_anyway") + '</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);

  document.getElementById("kta-reset-offline-annuler").addEventListener("click", function() {
    overlay.remove();
  });
  document.getElementById("kta-reset-offline-forcer").addEventListener("click", function() {
    overlay.remove();
    _resetFlowConfirmation();
  });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

// 🔒 Aucun mot de passe communautaire stocké (ni hash, ni clair). Seule une instance qui publie SON mot de
// passe (index.json > config.accessHash) le redemande après reset : on PRÉVIENT, sans jamais l'afficher.
// Config d'instance lue en mémoire (KtaInstance, chargée au boot).
function _resetBlocAccesInstance() {
  const st = (window.KtaInstance && typeof window.KtaInstance.etat === "function") ? window.KtaInstance.etat() : null;
  const h = st && st.config ? st.config.accessHash : null;
  if (typeof h !== "string" || !/^[0-9a-f]{64}$/i.test(h.trim())) return "";
  return '<div style="margin-top:14px; padding:10px 12px; background:rgba(244,197,66,0.08); ' +
    'border:1px solid rgba(244,197,66,0.30); border-radius:6px; text-align:left; font-size:13px;">' +
    '🗝️ <strong class="kta-tx-accent">' + window.I18n.t("maint.reset_access_code_title") + '</strong><br>' +
    '<span class="kta-tx-clair">' + window.I18n.t("maint.reset_access_code_intro") + '</span></div>';
}

function _resetFlowConfirmation() {
  const overlay1 = document.createElement("div");
  overlay1.className = "kta-modal-overlay";
  overlay1.innerHTML = `
    <div class="kta-modal">
      <div class="kta-modal-icon">⚠️</div>
      <div class="kta-modal-titre">${window.I18n.t("maint.title_reset_confirm")}</div>
      <div class="kta-modal-texte">
        ${window.I18n.t("maint.reset_intro")}
        <ul style="text-align:left; margin:10px 0; padding-left:20px;">
          <li>${window.I18n.t("maint.reset_item_cache")}</li>
          <li>${window.I18n.t("maint.reset_item_maps")}</li>
          <li>${window.I18n.t("maint.reset_item_session")}</li>
          <li>${window.I18n.t("maint.reset_item_prefs")}</li>
          <li>${window.I18n.t("maint.reset_item_photos")}</li>
          <li>${window.I18n.t("maint.reset_item_journal")}</li>
          <li>${window.I18n.t("maint.reset_item_backups")}</li>
          <li>${window.I18n.t("maint.reset_item_profile")}</li>
          <li>${window.I18n.t("maint.reset_item_secours")}</li>
        </ul>
        <div style="margin:6px 0 10px; text-align:left;">
          <button type="button" class="kta-btn kta-btn-ghost" id="cache-export-profil" style="width:100%;">${window.I18n.t("maint.btn_export_profile_first")}</button>
        </div>
        <strong>${window.I18n.t("maint.reset_offline_warning")}</strong>

        ${_resetBlocAccesInstance()}
      </div>
      <div class="kta-modal-actions">
        <button class="kta-btn kta-btn-ghost" id="cache-annuler-1">${window.I18n.t("maint.btn_cancel")}</button>
        <button class="kta-btn kta-btn-danger" id="cache-continuer-1">${window.I18n.t("maint.btn_continue")}</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(overlay1);

  document.getElementById("cache-annuler-1").addEventListener("click", function () { overlay1.remove(); });
  // La liste dit TOUT ce qui est effacé (photos, carnet, backups, profil, PDF Histoire, photos Secours,
  // tuiles OSM, hauts faits), et l'export de profil — qui sait le sauver — est proposé AVANT.
  const _btnExportProfil = document.getElementById("cache-export-profil");
  if (_btnExportProfil) {
    _btnExportProfil.addEventListener("click", function () {
      overlay1.remove();
      if (window.ProfileExportImport && typeof window.ProfileExportImport.ouvrirExportModale === "function") {
        window.ProfileExportImport.ouvrirExportModale();
      }
    });
  }
  document.getElementById("cache-continuer-1").addEventListener("click", function () {
    overlay1.remove();

    const overlay2 = document.createElement("div");
    overlay2.className = "kta-modal-overlay";
    overlay2.innerHTML = `
      <div class="kta-modal kta-modal-danger">
        <div class="kta-modal-icon">🚨</div>
        <div class="kta-modal-titre">${window.I18n.t("maint.title_final_confirm")}</div>
        <div class="kta-modal-texte">
          ⚠️ <strong>${window.I18n.t("maint.final_warning_label")}</strong> ⚠️<br><br>
          ${window.I18n.t("maint.final_intro")}<br><br>
          <strong>${window.I18n.t("maint.final_offline")}</strong><br><br>
          ${window.I18n.t("maint.final_confirm_online")}
        </div>
        <div class="kta-modal-actions">
          <button class="kta-btn kta-btn-ghost" id="cache-annuler-2">${window.I18n.t("maint.btn_cancel")}</button>
          <button class="kta-btn kta-btn-danger" id="cache-confirmer-2">${window.I18n.t("maint.btn_clear_now")}</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay2);

    document.getElementById("cache-annuler-2").addEventListener("click", function () { overlay2.remove(); });
    document.getElementById("cache-confirmer-2").addEventListener("click", async function () {
      // Bouton désactivé AVANT tout async : un second clic lancerait un effacement concurrent (IDB ouvertes
      // qui restent verrouillées).
      const btn = this;
      btn.disabled = true;
      btn.textContent = window.I18n.t("maint.btn_cleaning");
      overlay2.remove();
      const overlayWait = document.createElement("div");
      overlayWait.className = "kta-modal-overlay";
      overlayWait.innerHTML = `<div class="kta-modal"><div class="kta-modal-icon">⏳</div><div class="kta-modal-titre">${window.I18n.t("maint.title_cleaning")}</div><div class="kta-modal-texte">${window.I18n.t("maint.cleaning_text")}</div></div>`;
      document.documentElement.appendChild(overlayWait);

      try {
        // 0) Installation reliée : session fermée AVANT l'effacement (sinon reconnexion seule). Sans
        //    extension : rien, immédiat.
        let sessionFermee = true;
        if (window.KtaExtensions && typeof window.KtaExtensions.avantReinitialisation === "function") {
          try { sessionFermee = await window.KtaExtensions.avantReinitialisation(); } catch(e) { sessionFermee = false; }
        }

        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(function(r) { return r.unregister(); }));
        }

        // 2) Caches HTTP / PWA
        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(function(name) { return caches.delete(name); }));
        }

        // 3) localStorage — tout (préfixes connus et clés inattendues)
        try { localStorage.clear(); } catch(e) { console.warn("[Reset] localStorage.clear :", e); }
        // Session d'installation pas fermée (hors ligne) : seule marque gardée, pour que l'extension la
        // ferme au retour du réseau au lieu de se reconnecter.
        if (!sessionFermee && window.KtaExtensions && window.KtaExtensions.CLE_DECONNEXION_EN_ATTENTE) {
          try { localStorage.setItem(window.KtaExtensions.CLE_DECONNEXION_EN_ATTENTE, "1"); } catch(e) {}
        }

        try { sessionStorage.clear(); } catch(e) { console.warn("[Reset] sessionStorage.clear :", e); }

        // 5) IndexedDB — toutes les bases (repli si indexedDB.databases() manque)
        try {
          if (indexedDB.databases) {
            const dbs = await indexedDB.databases();
            await Promise.all((dbs || []).map(function(db) {
              return new Promise(function(resolve) {
                if (!db.name) return resolve();
                const req = indexedDB.deleteDatabase(db.name);
                req.onsuccess = req.onerror = req.onblocked = function() { resolve(); };
              });
            }));
          } else {
            // 🩸 Safari/Firefox ne listent pas : bases connues, liste alignée sur memInspector.KNOWN_IDB_DBS
            // (sinon photos, backups, profil, carnet survivent à « tout effacer »).
            const knownDbs = [
              "myktamap_handles", "myktamap_backups", "myktamap_sessions", "myktamap_photos",
              "myktamap_profile", "myktamap_crashes", "myktamap_journal",
              "myktamap_histoire_pdfs", "myktamap_secours_photos", "myktamap_osm_tiles"
            ];
            await Promise.all(knownDbs.map(function(name) {
              return new Promise(function(resolve) {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = req.onerror = req.onblocked = function() { resolve(); };
              });
            }));
          }
        } catch(e) { console.warn("[Reset] IndexedDB :", e); }

        overlayWait.remove();
        window.location.reload(true);
      } catch (err) {
        overlayWait.remove();
        const overlayErr = document.createElement("div");
        overlayErr.className = "kta-modal-overlay";
        overlayErr.innerHTML = `<div class="kta-modal"><div class="kta-modal-icon">❌</div><div class="kta-modal-titre">${window.I18n.t("maint.title_error")}</div><div class="kta-modal-texte">${window.I18n.t("maint.error_clear_cache", { detail: (err.message || err) })}</div><div class="kta-modal-actions"><button class="kta-btn kta-btn-primary" id="cache-err-ok">${window.I18n.t("maint.btn_ok")}</button></div></div>`;
        document.documentElement.appendChild(overlayErr);
        document.getElementById("cache-err-ok").addEventListener("click", function () { overlayErr.remove(); });
      }
    });
  });
}

// ── Exports window ──────────
window.ouvrirCalibrageEchelle = ouvrirCalibrageEchelle;
window.viderCacheAppli        = viderCacheAppli;
window.mettreAJourCodeSeul    = mettreAJourCodeSeul;
