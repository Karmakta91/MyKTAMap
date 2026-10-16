/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE MAINTENANCE — Calibrage + Reset + Mise à jour douce
// =========================
// (P3 Lot 7 — découpe interface.js) : module extrait de
// js/interface.js pour réduire le
// volume du fichier principal.
//
// Aucun changement de comportement runtime. Les 3 fonctions publiques
// + 2 helpers ping exposés via `window.*` sont strictement identiques
// à v1.30.1.
//
// 📋 API publique :
//   - window.ouvrirCalibrageEchelle()
//        Modale "Calibrage d'échelle" — produit en croix entre une
//        distance pixel mesurée et une distance réelle saisie par l'user.
//        Met à jour APP_CONFIG.scale + persiste dans plan-config local.
//   - window.viderCacheAppli()
//        Reset complet : pré-check Internet (ping no-cors gstatic.com)
//        + double confirmation (3 si offline) + purge SW + caches HTTP/
//        PWA + localStorage + sessionStorage + TOUTES les bases IDB +
//        location.reload(true).
//   - window.mettreAJourCodeSeul()
//        Mise à jour douce : purge SW cache uniquement, préserve
//        localStorage + IDB + UnlockGate. Réutilisée par le badge
//        version footer et par le bouton dans Configuration.
//   - window._pingInternet() / window._pingInternetUrl
//        Helpers ping connectivité (fetch no-cors gstatic.com + timeout
//        5s + navigator.onLine). Exposés pour réutilisation par d'autres
//        modules qui veulent tester l'état réseau avant action destructive.
//
// 🔌 Dépendances externes (toutes via window.*) :
//   - navigator.serviceWorker.unregister      [browser API]
//   - caches.delete / caches.keys             [browser API]
//   - localStorage / sessionStorage           [browser API]
//   - indexedDB.databases / .deleteDatabase   [browser API + fallback]
//   - window.UnlockGate (depuis v1.7.x)       [unlockGate.js]
//   - window.PinLock                          [pinLock.js]
//   - window.afficherToast                    [refonteInterface.js]
//
// 📍 Ordre de chargement (cf index.html) :
//   - Doit charger APRÈS interface.js (cohérence ordre découpe).
//     L'ordre est cosmétique car les fonctions sont appelées au runtime
//     (clic user, badge version, etc.).

// =========================
// CALIBRAGE D'ÉCHELLE — produit en croix
// =========================
function ouvrirCalibrageEchelle() {
  const existing = document.getElementById("kta-calib-modal");
  if (existing) { existing.remove(); return; }

  // Lire la valeur actuelle du champ (pas APP_CONFIG, au cas où on l'a modifiée sans appliquer)
  const champScale = document.getElementById("cfg_scale");
  const scaleActuel = champScale ? parseFloat(champScale.value) : APP_CONFIG.scale;

  // 🌍 i18n au rendu (la modale s'ouvre toujours après I18n.init).
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
      // (L4) : plus de bouton Appliquer dans Réglages — la valeur
      // s'enregistre comme une saisie (change → setPlanScale).
      champScale.dispatchEvent(new Event("change", { bubbles: true }));
    }
    fermer();
  });

  setTimeout(function() { inputAffichee.focus(); }, 50);
}

// =========================
// VIDER LE CACHE APPLICATIF
// =========================
// (KARMA "on modifie le test internet, doit être vers
// origin/ping.html, plus aucun appel externe vers Google. On assure le
// serveur dispo, SSL, Nginx avant Force update. On attend retour 'OK'").
//
// (KARMA "j'ai dit myktamap.fr dans le cadre de prod,
// mais ca doit etre origin, pour devmap ca doit attaquer l'url de dev") :
// PING_URL utilise location.origin DYNAMIQUEMENT au lieu d'un hardcode :
//   - Prod (myktamap.fr) → https://myktamap.fr/ping.html
//   - Prod future (myktamap.fr)         → https://myktamap.fr/ping.html
//   - Local (localhost:8080)            → http://localhost:8080/ping.html
//
// Avantage same-origin : plus besoin de header CORS côté Nginx (le fetch
// est same-origin → la SOP autorise). On peut même retirer le mode "cors"
// explicite (default same-origin). Simplification déploiement : KARMA crée
// /ping.html UNE fois sur chaque serveur, ça marche partout.
//
// Vérification connexion Internet + disponibilité serveur MyKTAMap :
//   - timeout 5s, retourne Promise<boolean>
//   - navigator.onLine (rapide) en court-circuit si false
//   - fetch GET sur PING_URL same-origin
//   - body attendu : exactement "OK" (texte brut)
//
// Avantages vs ancien ping Google :
//   ✅ Plus AUCUN appel externe (cohérent avec privacy)
//   ✅ Si OK → on garantit DNS + SSL + Nginx + PWA peut pull
//   ❌ "Internet OK mais serveur down" est traité comme offline (voulu —
//      pas la peine d'updater si le serveur source du nouveau code est down)
const PING_URL = (typeof location !== "undefined" && location.origin)
  ? (location.origin + "/ping.html")
  : "/ping.html";  // fallback chemin relatif (très improbable)
const PING_EXPECTED_BODY = "OK";  // body attendu trim-comparé (case-insensitive)

function _pingInternet() {
  return new Promise(function(resolve) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Le navigateur est sûr d'être offline → on évite même le fetch
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
    // Same-origin par défaut (PING_URL = location.origin + "/ping.html").
    // Pas besoin de mode "cors" explicite → moins de friction Nginx.
    // credentials: "omit" pour ne pas envoyer de cookies (le ping n'a
    // pas besoin de session, garde la requête neutre).
    //
    // 🆕 Cache-bust ?_=Date.now() : même pattern que version.json /
    // alert.json (cf. CLAUDE.md §20). Garantit que le SW ne sert pas
    // une réponse cachée d'un précédent ping (= false positive si le
    // serveur est down maintenant mais OK avant). Chaque appel a une
    // URL unique → cache miss → fetch réseau forcé.
    const pingUrlCb = PING_URL + "?_=" + Date.now();
    fetch(pingUrlCb, {
      method: "GET",
      cache:  "no-store",
      signal: ctrl.signal,
      credentials: "omit"
    }).then(function(res) {
      if (!res.ok) {
        // Status HTTP non-2xx (404 si fichier absent, 5xx Nginx down, etc.)
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
      // Body "OK" attendu (trim + uppercase pour tolérer "ok\n" ou " Ok ")
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
// Expose globalement (consommé par d'autres modules, ex: sessionExporter
// onglet KMZ qui vérifie la connexion avant d'ouvrir un lien externe).
window._pingInternet = _pingInternet;
// Expose aussi l'URL résolue pour les messages d'erreur user-friendly.
window._pingInternetUrl = PING_URL;

// =========================
// 🔄 MISE À JOUR DOUCE — purge SW cache uniquement, préserve toutes les données
// =========================
// Différent de viderCacheAppli() qui fait table rase. Ici on ne touche QUE
// au cache PWA (assets HTTP) — la session, le registre de plans, l'IndexedDB
// et le localStorage restent intacts.
//
// Flow :
//   1. Quick ping Internet (5s) — sinon erreur claire avant de tout purger.
//   2. Demande au SW de skipWaiting si une nouvelle version attend.
//   3. Force reg.update() pour que le navigateur check sw.js sur le réseau.
//   4. Purge caches.keys() (cache PWA uniquement).
//   5. Reload — les nouveaux assets sont re-fetchés depuis le réseau.
//
// Préservé : localStorage (sessions, plans registry, prefs), IndexedDB (handles + blobs),
// sessionStorage, cookies, données utilisateur.
// La fonction _getCacheNameFromSW (hotfix21) a été RETIRÉE.
// Elle interrogeait le SW COURANT (= l'ancien avant update) → on récupérait
// le nom du cache de l'ANCIENNE version → la purge filtrait `k !== currentName`
// → on PRÉSERVAIT EXPLICITEMENT l'ancien cache → l'ancien SW continuait de
// servir son ancien copyright.js → __MKM__.build figé → badge footer
// "ancienne → nouvelle" persistait après reload.
// Le handler côté SW (GET_CACHE_NAME) est lui conservé pour rétrocompat
// (modules tiers éventuels, debug F12 manuel).

async function mettreAJourCodeSeul() {
  // Affiche un overlay pendant l'opération pour que l'utilisateur voie
  // qu'il se passe quelque chose. Cette phase peut prendre 1-3s.
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
    // 1. Ping Internet — sans réseau le re-fetch va échouer après la purge
    _statusUpdate(window.I18n.t("maint.msg_checking_connection"));
    const online = await _pingInternet();
    if (!online) {
      overlay.remove();
      _softUpdateOfflineWarning();
      return;
    }

    // RETRAIT du hotfix21 _getCacheNameFromSW. Cause racine du
    // bug "badge footer ancienne→nouvelle persiste après reload" :
    //   - hotfix21 interrogeait le SW COURANT (= l'ancien) AVANT reg.update()
    //   - Récupérait son CACHE_NAME → croyait être le "courant"
    //   - Filtre purge `k !== currentCacheName` préservait EXPLICITEMENT
    //     l'ancien cache
    //   - Au reload, l'ancien SW (toujours controller) servait son ancien
    //     copyright.js depuis son cache préservé → __MKM__.build figé
    // Le polling v1.34.9 ne couvrait que le happy path (install < 5s).
    // En 4G molle ou ~100 assets cache:'reload', timeout fréquent → fallback
    // reload avec cache ancien préservé = même bug.
    //
    // Fix : purge TOTALE comme killsw.html (qui marche systématiquement).
    // Coût : 1 re-DL des assets au reload (~100 fichiers) — acceptable car
    // Force update est une action volontaire avec ping internet déjà validé.
    // Audit indépendant : cause racine confirmée + reco piste 1 validée KARMA.

    // 2. SW update FIRE-AND-FORGET (au lieu de await). Avant,
    // `await reg.update()` bloquait 30s-2min en téléchargeant ~100 assets
    // via l'install event SYNCHRONE (cache.add x 100 avec cache:'reload').
    // Maintenant : on lance update() en background, le téléchargement se
    // fait pendant que l'user voit "Préparation…" + "Rechargement…", et
    // au reload le nouveau SW est déjà prêt avec son cache populé.
    //
    // Polling reg.waiting (max 5s) avant le reload. Sans ça,
    // race condition : reload 200ms après reg.update() = nouveau SW pas
    // encore installed → reg.waiting = null → SKIP_WAITING jamais envoyé
    // → ancien SW sert encore l'ancien copyright.js au reload →
    // __MKM__.build = ancienne version → badge footer affiche
    // "ancienne → nouvelle" alors qu'on vient juste de mettre à jour.
    // L'user devait restart 1 fois manuellement pour avoir la nouvelle
    // version active (régression hotfix21).
    // Fix : polling de reg.waiting (200ms x 25 = max 5s). Dès qu'on voit
    // un waiting, on lui envoie SKIP_WAITING puis on await controllerchange
    // (avec safety timeout 1.5s) → le nouveau SW est actif, son cache
    // contient le nouveau copyright.js → reload sert la bonne version.
    // Si timeout 5s atteint sans waiting (= install vraiment lent) →
    // fallback reload anyway (= comportement v1.34.8 dégradé, pas pire).
    _statusUpdate(window.I18n.t("maint.msg_prep_sw"));
    if (navigator.serviceWorker) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          // Fire-and-forget : pas de await, le téléchargement des assets se
          // fait en background. Si reg.update() trouve un nouveau sw.js, il
          // déclenche INSTALL en arrière-plan (cache.add x 100). On laisse
          // tourner, on n'attend pas.
          reg.update().catch(function(e) {
            console.warn("[Soft update] reg.update() :", e);
          });
          // Polling actif sur reg.waiting (max 5s).
          const DEADLINE_MS = Date.now() + 5000;
          let nouveauSwActive = false;
          while (Date.now() < DEADLINE_MS) {
            const reg2 = await navigator.serviceWorker.getRegistration();
            if (reg2 && reg2.waiting) {
              _statusUpdate(window.I18n.t("maint.msg_activating_sw"));
              reg2.waiting.postMessage({ type: "SKIP_WAITING" });
              // Attendre controllerchange (= nouveau SW pris le contrôle)
              // ou safety timeout 1.5s (si le browser tarde).
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
            // Petit sleep avant prochain check (200ms = 25 checks max sur 5s)
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

    // 3. 🐛 v1.37.1 — Purge TOTALE des caches PWA (sans préservation).
    // Audit indépendant : le filtre hotfix21 préservait l'ANCIEN cache
    // (interrogé via SW courant) → reload servait l'ancienne version.
    // Pattern killsw.html (qui marche) : `caches.keys().map(caches.delete)`
    // sans filter. Le nouveau SW (install en bg via reg.update fire-and-forget
    // ci-dessus) re-populera son cache au reload via son install handler.
    // Coût : 1 re-DL des assets au reload (~100 fichiers) — acceptable pour
    // une action volontaire avec ping internet validé en amont.
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

    // 4. Reload : le nouveau SW (install possiblement encore en cours) prend
    // le contrôle. Son cache sera populé soit via l'install handler s'il
    // n'a pas encore fini, soit déjà rempli si l'install a terminé.
    // L'user voit un boot un poil plus long (~3-8s sur fibre) mais c'est
    // garantie de servir la nouvelle version.
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

// Avertissement spécifique offline pour la mise à jour douce.
// (KARMA "rend le modal plus jolie pour l'erreur") :
// upgrade visuel — passage du style basique kta-modal (icône + titre + texte
// + un bouton OK) au style élaboré kta-oom-modal-boite (header big avec
// ⚠️ qui pulsent, sections 🔍 Causes / ⛔ Conséquence / ✅ Recommandation),
// strictement symétrique avec _resetFlowOfflineWarning. Sémantique adaptée :
//   - action ANNULÉE automatiquement (pas de bouton "Continuer quand même")
//     car relancer le soft update offline ferait le même crash
//   - ton rassurant ("aucune donnée perdue, app continue de fonctionner")
//     car contrairement au reset, on n'a touché à rien
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
  // Cohérent avec _resetFlowOfflineWarning : clic backdrop ferme aussi
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

function viderCacheAppli() {
  const cfgModal = document.getElementById("kta-cfg-modal");
  if (cfgModal) cfgModal.remove();

  // 1ère étape : check connexion Internet AVANT toute confirmation.
  // Affichage bref d'un "Vérification connexion…" pour pas avoir un
  // freeze silencieux de 5s si le réseau ne répond pas.
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

// Affiche d'abord le warning insistant "PAS INTERNET OU SERVEUR INDISPO" en
// rouge (style cohérent avec la modale OOM), puis bascule sur le flow de
// double confirmation classique si l'utilisateur veut quand même continuer.
//
// (KARMA "ca fonctionne en mise jours mais pas en mode tout
// reset, il devrait nous dire serveur indispo ou pas internet") : message
// aligné avec _softUpdateOfflineWarning car le ping cible désormais le serveur
// MyKTAMap (<origin>/ping.html), pas Google. Un échec peut signifier "pas
// d'internet" OU "serveur MyKTAMap indispo (DNS, SSL, Nginx, hébergeur)".
// Pour le reset, c'est encore plus critique : sans serveur joignable, le SW
// ne peut PAS re-cacher les assets → app inutilisable post-wipe.
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

// plus de mot de passe communautaire (ni hash, ni valeur en
// clair). Seule une instance qui publie SON mot de passe (index.json >
// config.accessHash) le redemande après reset : on PRÉVIENT, sans jamais
// l'afficher. Config d'instance lue en mémoire (KtaInstance, chargée au boot).
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
  // 🚨 B4 (audit ergonomie 13/09/2026) : la modale listait 4 postes et en
  // effaçait 9 (photos, carnet, backups, profil, PDF Histoire, photos Secours,
  // tuiles OSM, hauts faits). La liste dit tout, et l'export de profil — qui
  // sait sauver tout ça — est proposé AVANT, pas découvert après.
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
      // (Pattern D) — Disable IMMÉDIAT du bouton avant tout async
      // (reset complet : SW unregister + caches.delete + localStorage.clear +
      // IDB wipe). Sans ça, l'user qui re-clique pendant le wipe peut
      // déclencher un 2e flow concurrent qui collide avec le 1er (en
      // particulier les IDB ouvertes qui restent verrouillées).
      const btn = this;
      btn.disabled = true;
      btn.textContent = window.I18n.t("maint.btn_cleaning");
      overlay2.remove();
      const overlayWait = document.createElement("div");
      overlayWait.className = "kta-modal-overlay";
      overlayWait.innerHTML = `<div class="kta-modal"><div class="kta-modal-icon">⏳</div><div class="kta-modal-titre">${window.I18n.t("maint.title_cleaning")}</div><div class="kta-modal-texte">${window.I18n.t("maint.cleaning_text")}</div></div>`;
      document.documentElement.appendChild(overlayWait);

      try {
        // 0) Installation reliée : sa session est fermée AVANT l'effacement (sinon l'appli se
        //    reconnectait seule). Sans extension : rien, immédiat.
        let sessionFermee = true;
        if (window.KtaExtensions && typeof window.KtaExtensions.avantReinitialisation === "function") {
          try { sessionFermee = await window.KtaExtensions.avantReinitialisation(); } catch(e) { sessionFermee = false; }
        }

        // 1) Service Worker
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(function(r) { return r.unregister(); }));
        }

        // 2) Caches HTTP / PWA
        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(function(name) { return caches.delete(name); }));
        }

        // 3) localStorage — wipe complet (tous les préfixes connus + clés inattendues)
        try { localStorage.clear(); } catch(e) { console.warn("[Reset] localStorage.clear :", e); }
        // Session d'une installation reliée pas fermée (hors ligne) : seule marque gardée, pour que
        // l'extension la ferme au retour du réseau au lieu de se reconnecter.
        if (!sessionFermee && window.KtaExtensions && window.KtaExtensions.CLE_DECONNEXION_EN_ATTENTE) {
          try { localStorage.setItem(window.KtaExtensions.CLE_DECONNEXION_EN_ATTENTE, "1"); } catch(e) {}
        }

        // 4) sessionStorage
        try { sessionStorage.clear(); } catch(e) { console.warn("[Reset] sessionStorage.clear :", e); }

        // 5) IndexedDB — toutes les bases (avec fallback Safari/Firefox qui n'a pas indexedDB.databases())
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
            // Safari/Firefox : on ne peut pas lister, on supprime au moins les bases connues.
            // la liste s'était arrêtée à `handles` — sur Safari, « tout
            // effacer » laissait donc en place photos, backups, profil, crashes (et
            // maintenant le carnet). Liste alignée sur memInspector.KNOWN_IDB_DBS.
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

// ==========================================
// EXPORTS WINDOW (v1.31.0 P3 Lot 7)
// ==========================================
// ouvrirCalibrageEchelle, viderCacheAppli, mettreAJourCodeSeul
// étaient exposés depuis interface.js > EXPORT GLOBAL.
// Post-extraction : on les expose ici.
window.ouvrirCalibrageEchelle = ouvrirCalibrageEchelle;
window.viderCacheAppli        = viderCacheAppli;
window.mettreAJourCodeSeul    = mettreAJourCodeSeul;
