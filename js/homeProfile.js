/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// HOMEPROFILE.JS — bandeau profil + rangs + hauts faits + stats + modale détails + édition pro
// =========================
// 🧹 B7 (v1.66.0) : extrait VERBATIM du monolithe index.html (ex-lignes
// 2818-4642 du bloc <script> inline). AUCUN refactor interne — seul ajout :
// les ponts window.* en fin de wrapper (le monolithe partageait UNE closure
// « load » ; découpé, chaque fichier expose ce que les autres consomment,
// les identifiants nus se résolvant sur l'objet global).
// ⚠️ Chargé SANS defer (exécution synchrone à l'emplacement d'origine) et
// wrappé dans window.addEventListener("load") : l'ordre d'enregistrement
// des listeners (homeLoader → homeProfile → homeConfig → résiduel inline)
// reproduit l'ordre d'exécution du bloc d'origine. Ne pas réordonner.
    window.addEventListener("load", function () {
      async function _initLoaderProfileBar() {
        const bar = document.getElementById("kta-loader-profile-bar");
        if (!bar || !window.UserProfile) return;
        try { await window.UserProfile.init(); } catch(e) {}
        // 🆕 v1.21.3 : construit les slots stats selon les prefs user AVANT
        // de hydrater (sinon les querySelectorAll dans _hydrateProfileBarStats
        // tombent sur un container vide).
        _renderProfileBarStatsSlots(_getProfileBarStatsKeys());
        await _refreshLoaderProfileBar();
        bar.style.display = "";  // révèle (default = none)
        await _appliquerFondEcran();
        // Listener changement (notifie sur setSurnom / setPhoto / removePhoto / clear)
        window.UserProfile.onChange(function() {
          _refreshLoaderProfileBar();
          _appliquerFondEcran();
        });
        // 🌍 v1.45.0 — Re-render au changement de langue (greeting + placeholder
        // "Mon profil" viennent du dico ; le pseudo reste inchangé). Couvre la
        // bascule live via le sélecteur du HOME.
        if (window.I18n && window.I18n.onChange) {
          window.I18n.onChange(function() { _refreshLoaderProfileBar(); });
        }
        // 🆕 v1.21.1 : bouton ⚙️ retiré (KARMA) — toute la box est cliquable.
        // Click anywhere → ouvre la modale Détails.
        bar.addEventListener("click", function() { _ouvrirModaleProfilDetails(); });
        // Accessibilité clavier (Enter/Espace sur bandeau focusable)
        bar.addEventListener("keydown", function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            _ouvrirModaleProfilDetails();
          }
        });
      }

      // 🖼️ v1.74.0 — FOND D'ÉCRAN DU HOME (demande KARMA « un peu comme Windows »).
      // On pose 2 variables CSS sur #planLoaderBox : l'image et l'alpha du voile.
      // La COULEUR du voile est définie côté CSS par thème (sombre / clair), donc
      // basculer le thème réajuste automatiquement le voile sans repasser ici.
      //
      // ⚠️ La Blob URL précédente DOIT être révoquée : sans ça, chaque
      // notification de profil (renommage, avatar, réglage du voile…) en créerait
      // une nouvelle et l'image resterait en mémoire à chaque fois.
      // 🐛 v1.75.0 (repro KARMA : « je perds ma photo de profil ET le fond
      // d'écran en fermant la modale, ça revient au restart ») — JETON
      // ANTI-COURSE. Chaque réglage du fond (voile, cadrage X, cadrage Y)
      // déclenche un `_notify()`, donc plusieurs `_appliquerFondEcran()` et
      // `_refreshLoaderProfileBar()` se chevauchent, chacun avec une lecture
      // IDB asynchrone au milieu. Un appel ANCIEN pouvait alors se terminer
      // APRÈS un plus récent : il réécrivait son URL périmée et révoquait
      // celle réellement affichée. Le dégât ne se voyait qu'au repaint —
      // c'est-à-dire à la fermeture de la modale, d'où le symptôme trompeur.
      // Les données n'ont jamais été touchées : un rechargement recréait des
      // URL fraîches, d'où le « ça revient au restart ».
      // Règle : seul le DERNIER appel émis a le droit de commiter.
      let _wallObjectUrl = null;
      let _wallJeton     = 0;
      async function _appliquerFondEcran() {
        const box = document.getElementById("planLoaderBox");
        if (!box || !window.UserProfile) return;
        // ⚠️ v1.75.0 — L'IMAGE EST PORTÉE PAR L'OVERLAY, PAS PAR LA BOX.
        // La box est le CONTENU DÉFILÉ (hauteur = hauteur du contenu, 2000-3000 px
        // en portrait) ; l'overlay est `position:fixed; inset:0` + le scroller,
        // donc sa boîte de fond EST le viewport et ne bouge pas au défilement.
        // Peindre sur la box faisait calculer `cover` sur 2500 px de haut →
        // ~88 % de la largeur rognée, et le fond défilait avec le contenu.
        // La CLASSE `.kta-has-wall` reste sur la box : une douzaine de blocs
        // de contraste (header, profil, footer, titres) sont scopés dessus.
        // L'overlay reçoit sa propre classe miroir.
        const fond = document.getElementById("planLoaderOverlay") || box;
        const monJeton = ++_wallJeton;
        try {
          const snap = window.UserProfile.get();
          // Même règle que pour l'avatar : on ne révoque qu'APRÈS avoir posé
          // la nouvelle URL, sinon le fond disparaît le temps de la lecture.
          const ancienne = _wallObjectUrl;
          const liberer = function() {
            if (ancienne) { try { URL.revokeObjectURL(ancienne); } catch(e) {} }
          };
          if (!snap.hasWallpaper) {
            box.classList.remove("kta-has-wall");
            fond.classList.remove("kta-has-wall-bg");
            fond.style.removeProperty("--kta-wall-img");
            fond.style.removeProperty("--kta-wall-a");
            fond.style.removeProperty("--kta-wall-pos");
            fond.style.removeProperty("--kta-wall-size");
            _wallObjectUrl = null;
            liberer();
            return;
          }
          const url = await window.UserProfile.getWallpaperObjectUrl();
          // Un appel plus récent est passé pendant la lecture : on abandonne
          // en révoquant NOTRE url (jamais affichée) — surtout pas l'ancienne,
          // qui est celle que le gagnant vient d'installer.
          if (monJeton !== _wallJeton) {
            if (url) { try { URL.revokeObjectURL(url); } catch(e) {} }
            return;
          }
          if (!url) {
            box.classList.remove("kta-has-wall");
            fond.classList.remove("kta-has-wall-bg");
            _wallObjectUrl = null; liberer(); return;
          }
          _wallObjectUrl = url;
          const voile = Number.isFinite(snap.wallVoile) ? snap.wallVoile : 55;
          const px    = Number.isFinite(snap.wallPosX) ? snap.wallPosX : 50;
          const py    = Number.isFinite(snap.wallPosY) ? snap.wallPosY : 50;
          fond.style.setProperty("--kta-wall-img", 'url("' + url + '")');
          fond.style.setProperty("--kta-wall-a", String(Math.max(0, Math.min(100, voile)) / 100));
          fond.style.setProperty("--kta-wall-pos", px + "% " + py + "%");
          // 🖼️ v1.75.0 — mode d'affichage. `contain` = image entière, l'espace
          // restant prend la couleur du thème (le voile joue déjà cette
          // couleur, donc ça se lit comme une image posée sur le fond de
          // l'app, pas comme un rendu raté).
          fond.style.setProperty("--kta-wall-size", snap.wallFit === "contain" ? "contain" : "cover");
          box.classList.add("kta-has-wall");        // ← blocs de contraste
          fond.classList.add("kta-has-wall-bg");    // ← porteur de l'image
          liberer();
        } catch(e) {
          console.warn("[Profile] fond d'écran non appliqué :", e);
        }
      }

      let _profileBarObjectUrl = null;  // tracker pour révoquer au refresh
      let _barJeton = 0;                // 🐛 v1.75.0 — anti-course (cf. _appliquerFondEcran)
      async function _refreshLoaderProfileBar() {
        if (!window.UserProfile) return;
        const snap = window.UserProfile.get();
        const avatarWrap = document.getElementById("kta-loader-profile-avatar");
        const surnomEl   = document.getElementById("kta-loader-profile-surnom");
        const greetingEl = document.getElementById("kta-loader-profile-greeting");
        if (!avatarWrap || !surnomEl) return;
        // ⚠️ Le jeton s'incrémente APRÈS les gardes de sortie — sinon un appel
        // stérile (DOM absent) brûlait un numéro et faisait abandonner un appel
        // légitime déjà en vol. `_appliquerFondEcran` avait déjà le bon ordre.
        const monJetonBar = ++_barJeton;

        // 🆕 v1.52.0 : anneau de rang (sur le wrap → survit au remplacement du innerHTML)
        // + nom du rang sous le pseudo + médaille en coin bas-droite de la photo.
        const _rank = _appliquerRangAvatar(avatarWrap);
        if (_rank && window.ProfileGamification) {
          const rankLabelEl = document.getElementById("kta-loader-profile-rank");
          if (rankLabelEl) {
            rankLabelEl.textContent = window.ProfileGamification.nom(_rank);  // nom seul (la médaille porte déjà l'emoji)
            rankLabelEl.setAttribute("data-kta-rank", _rank.id);
          }
          const badgeEl = document.getElementById("kta-loader-profile-badge");
          if (badgeEl) {
            if (_rank.emoji) {
              badgeEl.textContent = _rank.emoji;
              badgeEl.setAttribute("data-kta-rank", _rank.id);
              badgeEl.style.display = "";
            } else {
              badgeEl.textContent = "";
              badgeEl.style.display = "none";  // Touriste : pas de médaille
            }
          }
        }

        // 🆕 v1.53.0 : hauts faits — toast si de nouveaux succès sont débloqués
        // (au retour sur le home). 1er calcul = accord rétroactif silencieux.
        _evalAchievements();

        // 🐛 v1.21.1-fix1 (KARMA "j'ai que un —") : hydrate les stats AVANT
        // toute autre opération (et hors await) pour garantir que les valeurs
        // s'affichent même si le bloc photo plus bas fait un early return
        // (cas user avec photo de profil) ou throw silencieusement.
        // Avant le fix : `_hydrateProfileBarStats()` à la fin → skip si
        // `snap.hasPhoto && url` → tous les users avec photo voyaient "—".
        _hydrateProfileBarStats();

        // Surnom display
        // 🌍 v1.45.0 — greeting + placeholder viennent du dico (I18n.t) ; le
        // pseudo (snap.surnom) reste tel quel (donnée user, pas traduite).
        const _tGreeting = (window.I18n && window.I18n.t) ? window.I18n.t("home.profile.greeting") : "Bienvenue";
        const _tPlaceholder = (window.I18n && window.I18n.t) ? window.I18n.t("home.profile.placeholder") : "Mon profil";
        const hasName = !!(snap.surnom && snap.surnom.trim());
        if (hasName) {
          surnomEl.textContent = snap.surnom;
          surnomEl.classList.remove("kta-loader-profile-surnom-empty");
          if (greetingEl) greetingEl.textContent = _tGreeting;
        } else {
          surnomEl.textContent = _tPlaceholder;
          surnomEl.classList.add("kta-loader-profile-surnom-empty");
          if (greetingEl) greetingEl.textContent = _tGreeting;
        }
        // Avatar : photo si dispo, sinon initiale colorée
        // 🐛 v1.75.0 (repro KARMA : « quand je charge un fond d'écran, la
        // miniature de ma photo de profil devient un ? ») — l'ancienne URL
        // était révoquée AVANT l'await : entre les deux, le <img> affiché
        // pointait sur une URL morte → image cassée (le « ? » du navigateur).
        // Invisible tant que les rafraîchissements étaient rares ; le fond
        // d'écran en déclenche beaucoup plus (ajout, voile, cadrage) et la
        // fenêtre est devenue systématiquement visible.
        // Fix : on RETIENT l'ancienne URL, on installe la nouvelle, et on ne
        // révoque qu'APRÈS le remplacement.
        const _ancienneUrl = _profileBarObjectUrl;
        const _libererAncienne = function() {
          if (_ancienneUrl) { try { URL.revokeObjectURL(_ancienneUrl); } catch(e) {} }
        };
        if (snap.hasPhoto) {
          try {
            const url = await window.UserProfile.getPhotoObjectUrl();
            // Appel dépassé pendant la lecture IDB → on jette NOTRE url et on
            // laisse le gagnant tranquille (cf. _appliquerFondEcran).
            if (monJetonBar !== _barJeton) {
              if (url) { try { URL.revokeObjectURL(url); } catch(e) {} }
              return;
            }
            if (url) {
              _profileBarObjectUrl = url;
              avatarWrap.innerHTML =
                '<img class="kta-loader-profile-avatar-img" src="' + url + '" alt="Avatar de ' +
                  (snap.surnom || "profil").replace(/"/g, "&quot;") + '">';
              _libererAncienne();
              return;
            }
          } catch(e) {
            console.warn("[Profile] avatar photo échec, fallback initiale :", e);
          }
        }
        if (monJetonBar !== _barJeton) return;
        // Pas de photo (ou lecture échouée) : l'initiale remplace le <img>,
        // on peut libérer sans risque.
        _profileBarObjectUrl = null;
        _libererAncienne();
        // Fallback initiale
        const initial = hasName ? window.UserProfile.getInitial(snap.surnom) : "👤";
        const color   = window.UserProfile.getAvatarColor(snap.surnom || "");
        if (hasName) {
          avatarWrap.innerHTML =
            '<div class="kta-loader-profile-avatar-initial" style="background:' +
              color.bg + '; color:' + color.fg + ';">' + initial + '</div>';
        } else {
          // Vraiment vide : silhouette grise neutre, pas d'initiale
          avatarWrap.innerHTML =
            '<div class="kta-loader-profile-avatar-initial kta-loader-profile-avatar-empty">👤</div>';
        }
      }

      // 🆕 v1.21.1-fix2 (KARMA "temps session en cours pas général") :
      // tracking temps app CUMULÉ (toutes sessions). Stocké dans
      // `localStorage["myktamap_total_time_ms"]`.
      //
      // 🐛 Bug v1.21.1-fix1 : `_flushTotalTime` avait `if (document.hidden)
      // return` au début, ce qui faisait skip TOUS les flushes après
      // visibilitychange→hidden (qui fire AVANT beforeunload/pagehide).
      // Conséquence : à la fermeture de l'onglet, le delta de la session
      // courante n'était JAMAIS persisté → l'user voyait son temps repartir
      // à 0 à chaque reload.
      //
      // Fix : sentinel `_timeLastTick = null` pour stopper le comptage
      // quand l'onglet devient caché. Le flush écrit toujours si tick valide
      // (qu'il soit appelé via heartbeat, visibilitychange, beforeunload ou
      // pagehide). Au retour de visibility, on remet `_timeLastTick = Date.now()`.
      const _TOTAL_TIME_LS_KEY = "myktamap_total_time_ms";
      const _TIME_TICK_MS      = 30000;  // sauvegarde toutes les 30s
      let _timeLastTick = Date.now();   // null = onglet caché, sinon timestamp
      function _readTotalTimeMs() {
        try {
          const v = parseInt(localStorage.getItem(_TOTAL_TIME_LS_KEY), 10);
          return Number.isFinite(v) && v >= 0 ? v : 0;
        } catch(e) { return 0; }
      }
      function _writeTotalTimeMs(ms) {
        try { localStorage.setItem(_TOTAL_TIME_LS_KEY, String(ms)); } catch(e) {}
      }
      function _flushTotalTime() {
        if (_timeLastTick === null) return;  // déjà flushé (onglet caché)
        const now = Date.now();
        const delta = now - _timeLastTick;
        _timeLastTick = now;
        if (delta > 0 && delta < 5 * 60 * 1000) {  // skip si > 5min (suspended/standby)
          _writeTotalTimeMs(_readTotalTimeMs() + delta);
        }
      }
      setInterval(_flushTotalTime, _TIME_TICK_MS);
      window.addEventListener("beforeunload", _flushTotalTime);
      window.addEventListener("pagehide",     _flushTotalTime);
      document.addEventListener("visibilitychange", function() {
        if (document.hidden) {
          _flushTotalTime();      // flush ce qui a couru avant de devenir caché
          _timeLastTick = null;   // stop comptage tant que caché
        } else {
          _timeLastTick = Date.now();  // reprendre comptage au retour visibility
        }
      });

      // Formattage temps humain : "12h 34min" / "45min" / "12s"
      function _formatDuration(ms) {
        if (typeof ms !== "number" || ms < 0) return "—";
        const s = Math.floor(ms / 1000);
        if (s < 60) return s + "s";
        const m = Math.floor(s / 60);
        if (m < 60) return m + "min";
        const h = Math.floor(m / 60);
        const remM = m % 60;
        return remM > 0 ? h + "h " + remM + "min" : h + "h";
      }

      // 🆕 v1.52.0 — Gamification du profil : rang/badge selon temps + plans + km.
      // Métriques lues depuis les compteurs EXISTANTS (toutes locales) ; le calcul
      // de rang vit dans js/profileGamification.js (module pur). km = galeries
      // cartographiées (somme des distM en cache par plan).
      function _collectGamifMetrics() {
        let plans = 0, km = 0, pois = 0, roads = 0, zones = 0, structures = 0, plansGeoref = 0, list = [];
        let hasTracked = false, maxLevels = 0, maxTrackerH = 0;  // 🆕 v1.54.0 (spéciaux)
        try { if (window.PlanRegistry && window.PlanRegistry.getAll) list = window.PlanRegistry.getAll() || []; } catch(e) {}
        try {
          const opened = list.filter(function(p){ return p && p.lastOpened; });
          plans = opened.length || list.length;
        } catch(e) {}
        try {
          list.forEach(function(p){
            if (!p || !p.id) return;
            // 🆕 v1.53.0 : plan géoréférencé = calibration GPS présente (hauts faits Géomètre)
            try { if (localStorage.getItem("myktamap_kmz_calib_" + p.id)) plansGeoref++; } catch(e) {}
            try {
              const raw = localStorage.getItem("myktamap_plan_stats_v1_" + p.id);
              if (raw) {
                const c = JSON.parse(raw);
                if (c && typeof c.distM === "number" && c.distM > 0) km += c.distM / 1000;
                if (c) {
                  pois       += Number(c.pois)    || 0;
                  roads      += Number(c.roads)   || 0;
                  zones      += Number(c.zones)   || 0;
                  structures += Number(c.structs) || 0;  // ⚠️ cache = "structs"
                }
              }
            } catch(e) {}
            // 🆕 v1.54.0 : scan session pour les spéciaux (tracker + niveaux annotés)
            try {
              const sraw = localStorage.getItem("myktamap_session_v1_" + p.id);
              if (sraw) {
                const s = JSON.parse(sraw);
                const tl = Array.isArray(s.trackerTimeline) ? s.trackerTimeline : [];
                if (tl.length > 0) {
                  hasTracked = true;
                  if (tl.length >= 2) {
                    let tmin = Infinity, tmax = -Infinity;
                    for (let i = 0; i < tl.length; i++) {
                      const t = Number(tl[i] && tl[i].t);
                      if (isFinite(t)) { if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
                    }
                    if (isFinite(tmin) && isFinite(tmax) && tmax > tmin) {
                      maxTrackerH = Math.max(maxTrackerH, (tmax - tmin) / 3600000);
                    }
                  }
                }
                const lv = {};
                ["editorPoints", "roads", "zones", "structures"].forEach(function(coll) {
                  const arr = Array.isArray(s[coll]) ? s[coll] : [];
                  for (let i = 0; i < arr.length; i++) { lv[Number(arr[i] && arr[i].level) || 0] = 1; }
                });
                const nlv = Object.keys(lv).length;
                if (nlv > maxLevels) maxLevels = nlv;
              }
            } catch(e) {}
          });
        } catch(e) {}
        const timeMs = _readTotalTimeMs() + (_timeLastTick ? Math.max(0, Date.now() - _timeLastTick) : 0);
        let score = 0;
        try { if (window.ProfileGamification) score = window.ProfileGamification.getScore({ plans: plans, hours: timeMs / 3600000, km: km }); } catch(e) {}
        return {
          plans: plans, hours: timeMs / 3600000, km: km, timeMs: timeMs,
          plansGeoref: plansGeoref, pois: pois, roads: roads, zones: zones, structures: structures,
          hasTracked: hasTracked, maxLevels: maxLevels, maxTrackerH: maxTrackerH, score: score
        };
      }

      // 🆕 v1.53.0 — Hauts faits (succès one-shot). Détection des nouveaux
      // débloqués + persistance + toast. Catalogue/éval dans js/profileAchievements.js.
      const _ACH_LS_KEY = "myktamap_achievements_v1";
      function _readUnlockedAch() {
        try { const a = JSON.parse(localStorage.getItem(_ACH_LS_KEY)); return (a && typeof a === "object") ? a : {}; }
        catch(e) { return {}; }
      }
      function _writeUnlockedAch(o) { try { localStorage.setItem(_ACH_LS_KEY, JSON.stringify(o)); } catch(e) {} }
      function _evalAchievements() {
        if (!window.ProfileAchievements) return;
        // 1er calcul (clé absente) → on accorde rétroactivement SANS toast (pas de spam).
        const firstRun = (localStorage.getItem(_ACH_LS_KEY) === null);
        const m = _collectGamifMetrics();
        const ids = window.ProfileAchievements.unlockedIds(m);
        const stored = _readUnlockedAch();
        let changed = false;
        ids.forEach(function(id) {
          if (!stored[id]) {
            stored[id] = new Date().toISOString();
            changed = true;
            if (!firstRun) _toastAchievement(id, m);
          }
        });
        if (changed || firstRun) _writeUnlockedAch(stored);
      }
      function _toastAchievement(id, m) {
        try {
          const ach = window.ProfileAchievements.byId(id, m);
          if (!ach) return;
          const tt = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){ return k; };
          const msg = "🏆 " + tt("feat.unlocked") + " : " + ach.tierIcon + " " + ach.nom + " " + ach.tierRoman;
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, "info");
        } catch(e) {}
      }

      // Remplit la grille des hauts faits dans la modale Détails profil (8 familles × 4 paliers).
      function _hydrateProfileFeats() {
        const box = document.getElementById("kta-profile-details-feats");
        if (!box || !window.ProfileAchievements) return;
        const PA = window.ProfileAchievements;
        const tt = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){ return k; };
        const m = _collectGamifMetrics();
        const all = PA.list(m);
        const nbU = all.filter(function(a){ return a.unlocked; }).length;
        let html = '<div class="kta-feats-head">🏆 ' + tt("feat.title") +
                   ' <span class="kta-feats-count">' + nbU + '/' + PA.total + '</span></div>' +
                   '<div class="kta-feats-list">';
        PA.FAMILIES.forEach(function(f) {
          const fa = all.filter(function(a){ return a.familyId === f.id; });
          const val = fa.length ? fa[0].value : 0;
          let valTxt;
          if (f.unit === "h")        valTxt = _formatDuration(m.timeMs);
          else if (f.unit === "km")  valTxt = (val < 10 ? val.toFixed(1) : String(Math.round(val))) + " km";
          else if (f.unit === "plans") valTxt = Math.round(val) + " " + tt("rank.unitPlans");
          else                       valTxt = String(Math.round(val));
          let badges = "";
          fa.forEach(function(a) {
            badges += '<span class="kta-feat-badge' + (a.unlocked ? " kta-feat-unlocked" : "") + '" title="' +
                      a.tierRoman + " — " + a.seuilLabel + '">' + a.tierIcon + '</span>';
          });
          html += '<div class="kta-feat-row">' +
                    '<span class="kta-feat-fam"><span class="kta-feat-emoji">' + f.emoji + '</span>' + PA.nom(f.id) + '</span>' +
                    '<span class="kta-feat-val">' + valTxt + '</span>' +
                    '<span class="kta-feat-badges">' + badges + '</span>' +
                  '</div>';
        });
        html += '</div>';
        // 🆕 v1.54.0 : section Spéciaux (hauts faits one-shot)
        const specials = all.filter(function(a){ return a.group === "special"; });
        if (specials.length) {
          html += '<div class="kta-feats-sptitle">🎉 ' + tt("feat.specials") + '</div>' +
                  '<div class="kta-feats-specials">';
          specials.forEach(function(a) {
            html += '<span class="kta-feat-sp' + (a.unlocked ? " kta-feat-unlocked" : "") + '">' +
                      a.emoji + " " + a.nom + '</span>';
          });
          html += '</div>';
        }
        box.innerHTML = html;
      }

      // Applique l'anneau de rang sur un conteneur d'avatar (data-kta-rank lu par le CSS).
      function _appliquerRangAvatar(wrapEl) {
        if (!wrapEl || !window.ProfileGamification) return null;
        try {
          const rank = window.ProfileGamification.computeRank(_collectGamifMetrics());
          wrapEl.setAttribute("data-kta-rank", rank.id);
          wrapEl.setAttribute("title", window.ProfileGamification.label(rank));
          return rank;
        } catch(e) { return null; }
      }

      // Remplit le bloc rang de la modale Détails profil (puce + métriques + progression + score).
      function _hydrateProfileRank() {
        const box = document.getElementById("kta-profile-details-rank");
        if (!box || !window.ProfileGamification) return;
        const PG = window.ProfileGamification;
        const tt = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){ return k; };
        const m = _collectGamifMetrics();
        const rank  = PG.computeRank(m);
        const prog  = PG.getProgress(m);
        const score = PG.getScore(m);
        const unitP = tt("rank.unitPlans");
        const kmTxt = (m.km < 10 ? m.km.toFixed(1) : String(Math.round(m.km))) + " km";
        let html =
          '<div class="kta-profile-rank-head">' +
            '<span class="kta-profile-rank-chip" data-kta-rank="' + rank.id + '">' + PG.nom(rank) + '</span>' +
            '<span class="kta-profile-rank-score">' + tt("rank.scoreLabel") + ' ' + score + '</span>' +
          '</div>' +
          '<div class="kta-profile-rank-metrics">' +
            '<span>🗺️ ' + m.plans + ' ' + unitP + '</span>' +
            '<span>⏱️ ' + _formatDuration(m.timeMs) + '</span>' +
            '<span>📏 ' + kmTxt + '</span>' +
          '</div>';
        if (prog.next) {
          const parts = [];
          if (prog.missing.plans > 0) parts.push(prog.missing.plans + ' ' + unitP);
          if (prog.missing.hours > 0) parts.push(Math.ceil(prog.missing.hours) + ' h');
          if (prog.missing.km    > 0) parts.push(Math.ceil(prog.missing.km) + ' km');
          html +=
            '<div class="kta-profile-rank-progress">' +
              '<div class="kta-profile-rank-bar"><span style="width:' + prog.pct.toFixed(0) + '%"></span></div>' +
              '<div class="kta-profile-rank-next">' +
                tt("rank.progress", { parts: parts.join(" · "), rank: PG.label(prog.next) }) +
              '</div>' +
            '</div>';
        } else {
          html += '<div class="kta-profile-rank-next kta-profile-rank-max">' + tt("rank.maxReached") + '</div>';
          // 🥚 Si le rang affiché vient de l'Easter egg (pseudo Karma → Légende),
          // on garde l'info : le rang réellement mérité par les métriques.
          const real = (typeof PG.rankByMetrics === "function") ? PG.rankByMetrics(m) : null;
          if (real && real.id !== rank.id) {
            html += '<div class="kta-profile-rank-real">' + tt("rank.realRank") + ' : ' +
                      '<span class="kta-profile-rank-chip kta-profile-rank-chip-sm" data-kta-rank="' + real.id + '">' +
                        PG.label(real) +
                      '</span>' +
                    '</div>';
          }
        }
        box.setAttribute("data-kta-rank", rank.id);  // couleur héritée par la puce + la barre
        box.innerHTML = html;
      }

      // 🆕 v1.21.3 (KARMA "on doit pouvoir choisir dans profile les 2 ou 3
      // stats du bandeau accueil") : système dynamique de stats configurables.
      //
      // - PROFILE_BAR_STATS = pool de stats disponibles (3 actuellement,
      //   extensible si besoin).
      // - localStorage key `myktamap_loader_bar_stats_v1` = array de keys
      //   sélectionnées par l'user (default ["time", "storage"]).
      // - _renderProfileBarStatsSlots(keys) construit le DOM dynamiquement.
      // - _hydrateProfileBarStats() itère les slots présents (pas hardcodé)
      //   et remplit les valeurs selon la key.
      // 🌐 i18n : on stocke des clés (titleKey) résolues AU RENDU, jamais au load.
      const PROFILE_BAR_STATS = {
        time: {
          icon:  "⏱️",
          titleKey: "home.profile.stats.timeTitle"
        },
        storage: {
          icon:  "💾",
          titleKey: "home.profile.stats.storageTitle"
        },
        plans: {
          icon:  "🗺️",
          titleKey: "home.profile.stats.plansTitle"
        },
        // 🆕 v1.53.0 : score (gamification) + nb de hauts faits débloqués.
        score: {
          icon:  "⭐",
          titleKey: "home.profile.stats.scoreTitle"
        },
        feats: {
          icon:  "🏆",
          titleKey: "home.profile.stats.featsTitle"
        }
      };
      const PROFILE_BAR_STATS_LS_KEY = "myktamap_loader_bar_stats_v1";
      const PROFILE_BAR_STATS_MAX    = 3;  // cap mobile (et général)

      function _getProfileBarStatsKeys() {
        try {
          const raw = localStorage.getItem(PROFILE_BAR_STATS_LS_KEY);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length > 0) {
              // Filtre les keys valides (anti-corruption) et applique le cap
              const filtered = arr.filter(function(k) { return !!PROFILE_BAR_STATS[k]; });
              return filtered.slice(0, PROFILE_BAR_STATS_MAX);
            }
          }
        } catch(e) {}
        // Default : time + storage (= comportement v1.21.1+)
        return ["time", "storage"];
      }
      function _setProfileBarStatsKeys(arr) {
        try { localStorage.setItem(PROFILE_BAR_STATS_LS_KEY, JSON.stringify(arr)); } catch(e) {}
      }

      // Construit dynamiquement les slots dans le bandeau profil
      function _renderProfileBarStatsSlots(keys) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const wrap = document.getElementById("kta-loader-profile-stats");
        if (!wrap) return;
        wrap.innerHTML = "";
        keys.forEach(function(k) {
          const cfg = PROFILE_BAR_STATS[k];
          if (!cfg) return;
          const div = document.createElement("div");
          div.className = "kta-loader-profile-stat";
          div.id = "kta-loader-profile-stat-" + k;
          div.title = _t(cfg.titleKey);
          div.dataset.statKey = k;
          div.innerHTML =
            '<span class="kta-loader-profile-stat-icon">' + cfg.icon + '</span>' +
            '<span class="kta-loader-profile-stat-val" id="kta-loader-profile-stat-' + k + '-val">—</span>';
          wrap.appendChild(div);
        });
      }

      // Formattage bytes : "12 KB" / "1.2 MB" / "234 MB"
      function _formatBytesShort(n) {
        if (n == null || isNaN(n)) return "—";
        const num = Number(n);
        if (num < 1024)            return num + " B";
        if (num < 1024 * 1024)     return (num / 1024).toFixed(0) + " KB";
        if (num < 1024 * 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + " MB";
        return (num / (1024 * 1024 * 1024)).toFixed(2) + " GB";
      }

      // 🐛 v1.21.3-fix (KARMA "valeur sauvegarde dans profil varie bizarement") :
      // L'ancien code utilisait navigator.storage.estimate() qui retourne TOUTE
      // la consommation de l'origine, y compris le Cache PWA volatile (eviction
      // LRU v1.21.3 → fluctuation visible). Le tooltip annonçait pourtant
      // "données MyKTAMap (localStorage + IDB)" → mensonge.
      //
      // Fix : calcul ciblé qui scanne uniquement les sources MyKTAMap fiables :
      //   - localStorage keys prefix "myktamap_" / "kta_" / "app_user_prefs"
      //   - IDB stores connus (handles/blobs, backups, photos, profile, crashes)
      //
      // Cache mémoire 30s pour éviter de recalculer à chaque ouverture du
      // loader (le scan IDB est rapide mais inutile en re-render).
      let _storageCalcCache = null;  // { ts: number, bytes: number }
      const _STORAGE_CACHE_MS = 30000;
      const _IDB_STORES = [
        { db: "myktamap_handles", store: "handles", blobFields: [] },
        { db: "myktamap_handles", store: "blobs",   blobFields: ["blob"] },
        { db: "myktamap_backups", store: "backups", blobFields: [] },
        { db: "myktamap_photos",  store: "photos",  blobFields: ["blob"] },
        { db: "myktamap_profile", store: "profile", blobFields: ["photoBlob", "wallBlob"] },
        { db: "myktamap_crashes", store: "crashes", blobFields: [] },
        // 🆕 v1.69.0 — Le Carnet (js/journal.js) : sans cette ligne, l'espace
        // occupé par les sorties archivées serait invisible dans « Stockage ».
        { db: "myktamap_journal", store: "sorties", blobFields: [] },
        // 🆕 v1.69.0 — Documents PDF du Mode Histoire : jamais comptés jusqu'ici
        // (un PDF de 40 Mo était invisible dans « Stockage »).
        { db: "myktamap_histoire_pdfs", store: "pdfs", blobFields: ["blob"] }
      ];

      // Ouvre une DB IDB en lecture seule SANS la créer si absente. Utilise
      // indexedDB.open(name) sans version → ouvre la version actuelle. Si la
      // DB n'existe pas, ça la créera vide (overhead trivial accepté, alternative
      // databases() pas dispo Safari).
      function _openIdbReadOnly(dbName) {
        return new Promise(function(resolve) {
          let upgradeNeeded = false;
          const req = indexedDB.open(dbName);
          req.onupgradeneeded = function() { upgradeNeeded = true; };
          req.onsuccess = function() {
            const db = req.result;
            // Si on a déclenché un upgrade = la DB n'existait pas. On la ferme + delete.
            if (upgradeNeeded) {
              db.close();
              try { indexedDB.deleteDatabase(dbName); } catch(e) {}
              resolve(null);
              return;
            }
            resolve(db);
          };
          req.onerror = function() { resolve(null); };
          req.onblocked = function() { resolve(null); };
        });
      }

      // Itère un store IDB et accumule les bytes (Blobs + JSON metadata)
      // 🐛 v1.21.3-fix2 (KARMA "valeur sauvegarde pas bonne, j'ai 150 Mo de
      // plans en mémoire") : le helper ratait les stores qui mettent la
      // valeur Blob/Handle DIRECTEMENT comme `store.put(blob, id)` (cas de
      // myktamap_handles.handles + myktamap_handles.blobs). Mon code
      // cherchait `val.blob.size` qui n'existe pas pour ces stores → 0 bytes
      // comptés pour potentiellement des MB de ZIPs plans mémorisés.
      // Fix : détection 3 cas :
      //   1. Valeur EST un Blob (a `.size` + `.type` typique Blob)
      //   2. Valeur est un objet wrapper (cherche les champs Blob déclarés)
      //   3. Valeur est un objet opaque (FileSystemHandle) → ~200 bytes flat
      function _accStoreBytes(db, storeName, blobFields) {
        return new Promise(function(resolve) {
          if (!db.objectStoreNames.contains(storeName)) { resolve(0); return; }
          let total = 0;
          try {
            const tx = db.transaction([storeName], "readonly");
            const os = tx.objectStore(storeName);
            const req = os.openCursor();
            req.onsuccess = function(e) {
              const cur = e.target.result;
              if (!cur) { resolve(total); return; }
              const val = cur.value;
              // Compte la clé (string ID typique 30-50 chars)
              try {
                if (typeof cur.key === "string") total += cur.key.length * 2;
              } catch(e) {}
              if (val) {
                // CAS 1 : la valeur EST elle-même un Blob (cf saveBlob :
                // store.put(blob, id) → cursor.value = Blob directement)
                if (val instanceof Blob) {
                  total += val.size || 0;
                } else if (typeof val.kind === "string"
                           && (val.kind === "file" || val.kind === "directory")) {
                  // CAS 3 : FileSystemHandle (kind = "file" | "directory").
                  // Pas de .size accessible, mais l'objet est léger.
                  total += 200;  // estimation flat (metadata interne navigateur)
                } else {
                  // CAS 2 : objet wrapper avec champs typés
                  // - Champs Blob déclarés → use .size réel
                  let blobBytes = 0;
                  for (let i = 0; i < blobFields.length; i++) {
                    const f = blobFields[i];
                    if (val[f] && typeof val[f].size === "number"
                        && typeof val[f].type === "string") {
                      blobBytes += val[f].size;
                    }
                  }
                  // Reste : approx via JSON.stringify (UTF-16 = ×2). On skip
                  // les champs Blob déjà comptés ci-dessus.
                  try {
                    const clean = {};
                    for (const k in val) {
                      if (blobFields.indexOf(k) >= 0) continue;
                      clean[k] = val[k];
                    }
                    total += JSON.stringify(clean).length * 2;
                  } catch(e) {}
                  total += blobBytes;
                }
              }
              cur.continue();
            };
            req.onerror = function() { resolve(total); };
          } catch(e) { resolve(total); }
        });
      }

      async function _calculerStorageMyktamapBytes() {
        let total = 0;
        // 1. localStorage MyKTAMap-specific
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.startsWith("myktamap_") || k.startsWith("kta_") || k === "app_user_prefs") {
              const v = localStorage.getItem(k) || "";
              total += (k.length + v.length) * 2; // UTF-16
            }
          }
        } catch(e) {}
        // 2. IDB stores MyKTAMap (lecture seule, skip si DB absente)
        const seenDbs = {};
        for (let i = 0; i < _IDB_STORES.length; i++) {
          const spec = _IDB_STORES[i];
          try {
            let db = seenDbs[spec.db];
            if (db === undefined) {
              db = await _openIdbReadOnly(spec.db);
              seenDbs[spec.db] = db;  // peut être null
            }
            if (!db) continue;
            const bytes = await _accStoreBytes(db, spec.store, spec.blobFields);
            total += bytes;
          } catch(e) {}
        }
        // 3. Close les DBs ouvertes
        for (const dbName in seenDbs) {
          const db = seenDbs[dbName];
          if (db) { try { db.close(); } catch(e) {} }
        }
        return total;
      }

      async function _getStorageMyktamapCached(forceRefresh) {
        const now = Date.now();
        if (!forceRefresh && _storageCalcCache && (now - _storageCalcCache.ts) < _STORAGE_CACHE_MS) {
          return _storageCalcCache.bytes;
        }
        const bytes = await _calculerStorageMyktamapBytes();
        _storageCalcCache = { ts: now, bytes: bytes };
        return bytes;
      }

      // Hydrate les stats compactes du bandeau profil — refactor dynamique
      // 🆕 v1.21.3 : itère les slots PRÉSENTS dans le DOM (data-stat-key)
      // au lieu de hardcoder time/storage. Permet d'ajouter de nouvelles
      // stats au pool PROFILE_BAR_STATS sans toucher à cette fonction.
      async function _hydrateProfileBarStats() {
        const slots = document.querySelectorAll("#kta-loader-profile-stats [data-stat-key]");
        for (const slot of slots) {
          const key   = slot.dataset.statKey;
          const valEl = slot.querySelector(".kta-loader-profile-stat-val");
          if (!valEl) continue;
          if (key === "time") {
            const liveDelta = (_timeLastTick === null) ? 0 : (Date.now() - _timeLastTick);
            const totalMs = _readTotalTimeMs() + liveDelta;
            valEl.textContent = _formatDuration(totalMs);
          } else if (key === "storage") {
            try {
              const bytes = await _getStorageMyktamapCached();
              valEl.textContent = _formatBytesShort(bytes);
            } catch(e) {
              valEl.textContent = "—";
            }
          } else if (key === "plans") {
            try {
              let arr = (window.PlanRegistry && typeof window.PlanRegistry.getAll === "function")
                        ? (window.PlanRegistry.getAll() || [])
                        : [];
              // 🆕 v1.21.3 : si pref skipServer active, exclut les plans
              // serveur du count (cohérent avec "ne pas fausser les stats").
              if (typeof window._loaderSkipServerPlans === "function" && window._loaderSkipServerPlans()) {
                arr = arr.filter(function(p) { return p.type !== "server"; });
              }
              valEl.textContent = arr.length;
            } catch(e) {
              valEl.textContent = "—";
            }
          } else if (key === "score") {
            try {
              const m = _collectGamifMetrics();
              valEl.textContent = (window.ProfileGamification) ? String(window.ProfileGamification.getScore(m)) : "—";
            } catch(e) { valEl.textContent = "—"; }
          } else if (key === "feats") {
            try {
              const m = _collectGamifMetrics();
              const n   = (window.ProfileAchievements) ? window.ProfileAchievements.unlockedIds(m).length : 0;
              const tot = (window.ProfileAchievements) ? window.ProfileAchievements.total : 0;
              valEl.textContent = tot ? (n + "/" + tot) : String(n);
            } catch(e) { valEl.textContent = "—"; }
          }
        }
      }

      // === MODALE "Détails du profil" ===
      // Pattern .kta-readme-modal-overlay. Édition inline (surnom contenteditable),
      // bouton modifier/retirer photo (input file caché), stats agrégées,
      // boutons export profil / import profil / reset.
      function _ouvrirModaleProfilDetails() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        // Cleanup d'une modale précédente
        const ex = document.getElementById("kta-profile-details-modal");
        if (ex) ex.parentNode.removeChild(ex);

        if (!window.UserProfile) {
          alert(_t("home.profile.moduleUnavailable"));
          return;
        }
        const snap = window.UserProfile.get();

        const overlay = document.createElement("div");
        overlay.id = "kta-profile-details-modal";
        overlay.className = "kta-readme-modal-overlay";
        overlay.innerHTML =
          '<div class="kta-readme-modal-boite kta-profile-details-boite">' +
            '<div class="kta-readme-modal-header">' +
              '<span class="kta-readme-modal-titre">' + _t("home.profile.title") + '</span>' +
              '<button type="button" class="kta-panneau-close" id="kta-profile-details-close" aria-label="' + _t("home.profile.closeAria") + '">✕</button>' +
            '</div>' +
            '<div class="kta-readme-modal-corps kta-profile-details-corps">' +
              // — Identité (gros avatar + surnom inline) —
              '<div class="kta-profile-details-identity">' +
                '<div class="kta-profile-details-avatar-holder">' +
                  '<div class="kta-profile-details-avatar-big" id="kta-profile-details-avatar"></div>' +
                  '<span class="kta-profile-details-badge" id="kta-profile-details-badge" aria-hidden="true" style="display:none;"></span>' +
                '</div>' +
                '<div class="kta-profile-details-photo-actions">' +
                  '<button type="button" class="kta-btn kta-btn-ghost kta-btn-mini" id="kta-profile-details-photo-btn">' + _t("home.profile.photoBtn") + '</button>' +
                  '<button type="button" class="kta-btn kta-btn-ghost kta-btn-mini" id="kta-profile-details-photo-remove" style="' + (snap.hasPhoto ? '' : 'display:none;') + '">' + _t("home.profile.photoRemove") + '</button>' +
                  '<input type="file" id="kta-profile-details-photo-input" accept="image/*" style="display:none;">' +
                '</div>' +
                '<div class="kta-profile-details-name-row">' +
                  '<label class="kta-profile-details-label" for="kta-profile-details-surnom">' + _t("home.profile.nicknameLabel") + '</label>' +
                  '<input type="text" id="kta-profile-details-surnom" class="kta-profile-details-input" ' +
                    'placeholder="' + _t("home.profile.nicknamePlaceholder") + '" maxlength="40" ' +
                    'value="' + (snap.surnom || "").replace(/"/g, "&quot;") + '">' +
                  '<button type="button" class="kta-btn kta-btn-primary kta-btn-mini" id="kta-profile-details-save-name" style="display:none;">' + _t("home.profile.saveName") + '</button>' +
                '</div>' +
                '<p class="kta-profile-details-hint">' + _t("home.profile.nicknameHint") + '</p>' +
              '</div>' +

              // 🆕 v1.52.0 — Rang / badge (gamification, hydraté par _hydrateProfileRank)
              '<div class="kta-profile-details-rank" id="kta-profile-details-rank"></div>' +

              // 🆕 v1.53.0 — Hauts faits (succès, hydraté par _hydrateProfileFeats)
              '<div class="kta-profile-details-feats" id="kta-profile-details-feats"></div>' +

              // — Stats compactes —
              '<div class="kta-profile-details-stats" id="kta-profile-details-stats">' +
                '<div class="kta-profile-details-stats-loading">' + _t("home.profile.statsLoading") + '</div>' +
              '</div>' +

              // 🆕 v1.21.3 (KARMA "on doit dans ce cas pouvoir choisir dans
              // profile les 2 ou 3 stats du bandeau") : section toggle pour
              // configurer quelles stats apparaissent dans le bandeau home.
              // Cap dur 3 (cf PROFILE_BAR_STATS_MAX) pour rester lisible
              // sur mobile compact.
              '<div class="kta-profile-barstats">' +
                '<div class="kta-profile-barstats-header">' + _t("home.profile.barStatsHeader") + '</div>' +
                '<p class="kta-profile-barstats-hint">' +
                  _t("home.profile.barStatsHint") +
                '</p>' +
                '<div class="kta-profile-barstats-options" id="kta-profile-barstats-options">' +
                  '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="time"> <span>' + _t("home.profile.statTime") + '</span></label>' +
                  '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="storage"> <span>' + _t("home.profile.statStorage") + '</span></label>' +
                  '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="plans"> <span>' + _t("home.profile.statPlans") + '</span></label>' +
                  '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="score"> <span>' + _t("home.profile.statScore") + '</span></label>' +
                  '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="feats"> <span>' + _t("home.profile.statFeats") + '</span></label>' +
                '</div>' +
              '</div>' +

              // 🆕 v1.28.4 : section Édition pro — statut + import/retrait
              // licence locale. Le contenu dynamique (statut, source, hash
              // tronqué, boutons) est rendu par _refreshProfileProSection().
              '<div class="kta-profile-pro-section" id="kta-profile-pro-section">' +
                '<div class="kta-profile-pro-header">💼 ' + window.I18n.t("home.splash.proEdition") + '</div>' +
                '<div class="kta-profile-pro-body" id="kta-profile-pro-body">' +
                  '<div class="kta-profile-pro-loading">⏳…</div>' +
                '</div>' +
                '<input type="file" id="kta-profile-pro-input" accept=".json,application/json" style="display:none;">' +
              '</div>' +

              // 🖼️ v1.74.0 — Fond d'écran du HOME. Placé JUSTE AVANT les actions
              // (retour KARMA : « mal intégré, mets-le plus vers la fin ») —
              // c'est de la déco, elle ne doit pas s'intercaler entre l'identité
              // et les stats/rang qui, eux, se lisent d'affilée.
              '<div class="kta-profile-details-section">' +
                '<div class="kta-profile-details-section-titre">' + _t("home.profile.wallTitle") + '</div>' +
                '<div class="kta-wall-preview" id="kta-wall-preview">' + _t("home.profile.wallNone") + '</div>' +
                '<div class="kta-wall-actions">' +
                  '<button type="button" class="kta-btn kta-btn-ghost kta-btn-mini" id="kta-wall-btn">' + _t("home.profile.wallBtn") + '</button>' +
                  '<button type="button" class="kta-btn kta-btn-ghost kta-btn-mini" id="kta-wall-remove" style="' + (snap.hasWallpaper ? '' : 'display:none;') + '">' + _t("home.profile.wallRemove") + '</button>' +
                  '<input type="file" id="kta-wall-input" accept="image/*" style="display:none;">' +
                '</div>' +
                '<div id="kta-wall-reglages" style="' + (snap.hasWallpaper ? '' : 'display:none;') + '">' +
                  '<div class="kta-wall-voile-row">' +
                    '<label class="kta-profile-details-label" for="kta-wall-fit">' + _t("home.profile.wallFit") + '</label>' +
                    '<select class="kta-cfg-input" id="kta-wall-fit" style="flex:1; min-width:0;">' +
                      '<option value="cover"' + (snap.wallFit !== "contain" ? " selected" : "") + '>' + _t("home.profile.wallFitCover") + '</option>' +
                      '<option value="contain"' + (snap.wallFit === "contain" ? " selected" : "") + '>' + _t("home.profile.wallFitContain") + '</option>' +
                    '</select>' +
                  '</div>' +
                  '<div class="kta-wall-voile-row">' +
                    '<label class="kta-profile-details-label" for="kta-wall-voile">' + _t("home.profile.wallVoile") + '</label>' +
                    '<input type="range" id="kta-wall-voile" min="0" max="100" step="5" value="' + (Number.isFinite(snap.wallVoile) ? snap.wallVoile : 55) + '">' +
                    '<span class="kta-wall-voile-val" id="kta-wall-voile-val">' + (Number.isFinite(snap.wallVoile) ? snap.wallVoile : 55) + ' %</span>' +
                  '</div>' +
                  '<div class="kta-wall-voile-row">' +
                    '<label class="kta-profile-details-label" for="kta-wall-posx">' + _t("home.profile.wallPosX") + '</label>' +
                    '<input type="range" id="kta-wall-posx" min="0" max="100" step="5" value="' + (Number.isFinite(snap.wallPosX) ? snap.wallPosX : 50) + '">' +
                    '<span class="kta-wall-voile-val" id="kta-wall-posx-val">' + (Number.isFinite(snap.wallPosX) ? snap.wallPosX : 50) + ' %</span>' +
                  '</div>' +
                  '<div class="kta-wall-voile-row">' +
                    '<label class="kta-profile-details-label" for="kta-wall-posy">' + _t("home.profile.wallPosY") + '</label>' +
                    '<input type="range" id="kta-wall-posy" min="0" max="100" step="5" value="' + (Number.isFinite(snap.wallPosY) ? snap.wallPosY : 50) + '">' +
                    '<span class="kta-wall-voile-val" id="kta-wall-posy-val">' + (Number.isFinite(snap.wallPosY) ? snap.wallPosY : 50) + ' %</span>' +
                  '</div>' +
                  '<p class="kta-profile-details-hint">' + _t("home.profile.wallCadrageHint") + '</p>' +
                '</div>' +
                '<p class="kta-profile-details-hint">' + _t("home.profile.wallHint") + '</p>' +
              '</div>' +

              // — Actions profil —
              '<div class="kta-profile-details-actions">' +
                '<button type="button" class="kta-btn kta-btn-primary" id="kta-profile-details-export">' + _t("home.profile.exportBtn") + '</button>' +
                '<button type="button" class="kta-btn kta-btn-secondary" id="kta-profile-details-import">' + _t("home.profile.importBtn") + '</button>' +
                '<button type="button" class="kta-btn kta-btn-danger" id="kta-profile-details-reset">' + _t("home.profile.resetBtn") + '</button>' +
              '</div>' +

              '<p class="kta-profile-details-footer-hint">' +
                _t("home.profile.exportFooterHint") +
              '</p>' +
            '</div>' +
          '</div>';
        document.documentElement.appendChild(overlay);

        // Render avatar initial dans la modale (gros format)
        _refreshProfileDetailsAvatar(snap);
        _hydrateProfileRank();  // 🆕 v1.52.0 : bloc rang (puce + métriques + progression)
        _evalAchievements();
        _hydrateProfileFeats();  // 🆕 v1.53.0 : grille des hauts faits

        // Calcul stats async
        _refreshProfileDetailsStats();

        // 🆕 v1.28.4 : Render initial + bind handlers de la section Édition pro.
        _refreshProfileProSection();
        _bindProfileProHandlers();

        // Fermeture
        const closeFn = function() {
          const m = document.getElementById("kta-profile-details-modal");
          if (m) m.parentNode.removeChild(m);
          document.removeEventListener("keydown", escFn);
          // 🐛 v1.75.0 — RESYNCHRONISATION du HOME à la fermeture. Le jeton
          // anti-course règle les chevauchements, mais on ne veut pas dépendre
          // du timing pour que l'accueil soit juste : après avoir édité son
          // profil, l'user revient au HOME, et le HOME DOIT refléter l'état
          // final. Deux rendus frais, coût négligeable (une fois par
          // fermeture), et ça rend le symptôme impossible par construction.
          try { _refreshLoaderProfileBar(); } catch(e) {}
          try { _appliquerFondEcran(); }     catch(e) {}
        };
        const escFn = function(e) { if (e.key === "Escape" || e.key === "Esc") closeFn(); };
        document.getElementById("kta-profile-details-close").addEventListener("click", closeFn);
        overlay.addEventListener("click", function(e) { if (e.target === overlay) closeFn(); });
        document.addEventListener("keydown", escFn);

        // 🆕 v1.21.3 : bind des checkboxes "Stats du bandeau d'accueil".
        // Cap dur PROFILE_BAR_STATS_MAX (3). Au moins 1 stat requise.
        // À chaque change : sauve + re-render bandeau + re-hydrate les valeurs.
        (function() {
          const cbs = document.querySelectorAll(".kta-profile-barstats-cb input[type=checkbox][data-bar-stat-key]");
          if (cbs.length === 0) return;
          const current = new Set(_getProfileBarStatsKeys());
          cbs.forEach(function(cb) {
            cb.checked = current.has(cb.dataset.barStatKey);
          });
          function _onChange(e) {
            const allCbs = Array.from(cbs);
            const checked = allCbs.filter(function(c) { return c.checked; });
            // Cap dur 3 : si on dépasse, on uncheck cette case + toast
            if (checked.length > PROFILE_BAR_STATS_MAX) {
              e.target.checked = false;
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(_t("home.profile.barStatsMax", { n: PROFILE_BAR_STATS_MAX }), "warn");
              }
              return;
            }
            // Au moins 1 stat : si l'user décoche la dernière, on annule
            if (checked.length === 0) {
              e.target.checked = true;
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(_t("home.profile.barStatsMin"), "warn");
              }
              return;
            }
            // Save + re-render bandeau live
            const keys = allCbs.filter(function(c) { return c.checked; })
                               .map(function(c) { return c.dataset.barStatKey; });
            _setProfileBarStatsKeys(keys);
            _renderProfileBarStatsSlots(keys);
            _hydrateProfileBarStats();
          }
          cbs.forEach(function(cb) { cb.addEventListener("change", _onChange); });
        })();

        // Bind handlers édition surnom (live + save button)
        const surnomInput = document.getElementById("kta-profile-details-surnom");
        const saveBtn     = document.getElementById("kta-profile-details-save-name");
        let _originalSurnom = surnomInput.value;
        surnomInput.addEventListener("input", function() {
          saveBtn.style.display = (surnomInput.value !== _originalSurnom) ? "" : "none";
        });
        saveBtn.addEventListener("click", async function() {
          saveBtn.disabled = true;
          saveBtn.textContent = _t("home.profile.saveBusy");
          try {
            await window.UserProfile.setSurnom(surnomInput.value);
            _originalSurnom = surnomInput.value;
            saveBtn.textContent = "✅";
            setTimeout(function() {
              saveBtn.style.display = "none";
              saveBtn.disabled = false;
              saveBtn.textContent = _t("home.profile.saveName");
            }, 700);
          } catch(e) {
            alert(_t("home.profile.errGeneric") + (e.message || e));
            saveBtn.disabled = false;
            saveBtn.textContent = _t("home.profile.saveName");
          }
        });
        // Submit aussi sur Enter
        surnomInput.addEventListener("keydown", function(e) {
          if (e.key === "Enter") { e.preventDefault(); if (saveBtn.style.display !== "none") saveBtn.click(); }
        });

        // Photo : upload
        const photoBtn   = document.getElementById("kta-profile-details-photo-btn");
        const photoInput = document.getElementById("kta-profile-details-photo-input");
        const removeBtn  = document.getElementById("kta-profile-details-photo-remove");
        photoBtn.addEventListener("click", function() { photoInput.click(); });
        photoInput.addEventListener("change", async function() {
          const f = photoInput.files[0];
          if (!f) return;
          photoBtn.disabled = true;
          photoBtn.textContent = _t("home.profile.photoCompressing");
          try {
            await window.UserProfile.setPhoto(f);
            const snap2 = window.UserProfile.get();
            _refreshProfileDetailsAvatar(snap2);
            removeBtn.style.display = "";
            photoBtn.textContent = _t("home.profile.photoChange");
          } catch(e) {
            alert(_t("home.profile.errPhotoUpload") + (e.message || e));
            photoBtn.textContent = _t("home.profile.photoBtn");
          }
          photoBtn.disabled = false;
          photoInput.value = "";
        });
        removeBtn.addEventListener("click", async function() {
          if (!confirm(_t("home.profile.confirmRemovePhoto"))) return;
          try {
            await window.UserProfile.removePhoto();
            const snap2 = window.UserProfile.get();
            _refreshProfileDetailsAvatar(snap2);
            removeBtn.style.display = "none";
            photoBtn.textContent = _t("home.profile.photoBtn");
          } catch(e) { alert(_t("home.profile.errGeneric") + (e.message || e)); }
        });

        // Boutons export / import (réutilise ProfileExportImport + le file picker
        // déjà présent dans le DOM = #importListFile)
        document.getElementById("kta-profile-details-export").addEventListener("click", function() {
          if (window.ProfileExportImport && window.ProfileExportImport.ouvrirExportModale) {
            window.ProfileExportImport.ouvrirExportModale();
          } else {
            alert(_t("home.profile.errExportModule"));
          }
        });
        document.getElementById("kta-profile-details-import").addEventListener("click", function() {
          const fileInput = document.getElementById("importListFile");
          if (fileInput) fileInput.click();
        });

        // 🖼️ v1.74.0 — FOND D'ÉCRAN. L'aperçu montre l'image AVEC son voile,
        // exactement comme le vrai fond : sans ça on choisirait une image qui
        // rend bien nue mais illisible une fois voilée.
        const wallPreview = document.getElementById("kta-wall-preview");
        const wallInput   = document.getElementById("kta-wall-input");
        const wallBtn     = document.getElementById("kta-wall-btn");
        const wallRemove  = document.getElementById("kta-wall-remove");
        const wallRow     = document.getElementById("kta-wall-reglages");
        const wallRange   = document.getElementById("kta-wall-voile");
        const wallVal     = document.getElementById("kta-wall-voile-val");
        const wallPosX    = document.getElementById("kta-wall-posx");
        const wallPosXVal = document.getElementById("kta-wall-posx-val");
        const wallPosY    = document.getElementById("kta-wall-posy");
        const wallPosYVal = document.getElementById("kta-wall-posy-val");
        let _wallPreviewUrl = null;

        // Peint l'aperçu avec le voile ET le cadrage courants — l'aperçu doit
        // montrer exactement ce que donnera le vrai fond, sinon on choisit une
        // image qui rend bien nue et illisible une fois voilée.
        const wallFit = document.getElementById("kta-wall-fit");
        const _peindreApercu = function(url, voile, posX, posY, fit) {
          const a = voile / 100;
          const clair = document.body.classList.contains("kta-theme-light");
          const rgb = clair ? "201,184,143" : "26,31,46";
          wallPreview.style.backgroundImage =
            'linear-gradient(rgba(' + rgb + ',' + a + '), rgba(' + rgb + ',' + a + ')), url("' + url + '")';
          wallPreview.style.backgroundPosition = posX + "% " + posY + "%";
          // L'aperçu doit montrer le MÊME mode que le vrai fond, sinon on
          // choisit « Entière » sur une vignette qui affiche du « Remplir ».
          wallPreview.style.backgroundSize = (fit === "contain") ? "contain" : "cover";
        };
        const _fitCourant = function() { return wallFit ? wallFit.value : "cover"; };

        const _rafraichirApercuFond = async function() {
          const s = window.UserProfile.get();
          // Idem : révocation différée après remplacement (cf. avatar).
          const ancienneP = _wallPreviewUrl;
          const libererP = function() {
            if (ancienneP) { try { URL.revokeObjectURL(ancienneP); } catch(e) {} }
          };
          if (!s.hasWallpaper) {
            wallPreview.style.backgroundImage = "";
            wallPreview.textContent = _t("home.profile.wallNone");
            wallRemove.style.display = "none";
            wallRow.style.display    = "none";
            _wallPreviewUrl = null;
            libererP();
            return;
          }
          const url = await window.UserProfile.getWallpaperObjectUrl();
          // ⚠️ `_wallPreviewUrl = null` INDISPENSABLE ici : sans ça la variable
          // gardait l'URL qu'on vient de révoquer, et les handlers `input` des
          // curseurs repeignaient l'aperçu avec une URL morte.
          if (!url) { _wallPreviewUrl = null; libererP(); return; }
          _wallPreviewUrl = url;
          libererP();
          wallPreview.textContent = "";
          const vx = Number.isFinite(s.wallPosX) ? s.wallPosX : 50;
          const vy = Number.isFinite(s.wallPosY) ? s.wallPosY : 50;
          wallRange.value   = Number.isFinite(s.wallVoile) ? s.wallVoile : 55;
          wallVal.textContent    = wallRange.value + " %";
          wallPosX.value    = vx; wallPosXVal.textContent = vx + " %";
          wallPosY.value    = vy; wallPosYVal.textContent = vy + " %";
          if (wallFit) wallFit.value = (s.wallFit === "contain") ? "contain" : "cover";
          _peindreApercu(url, Number(wallRange.value), vx, vy, _fitCourant());
          wallRemove.style.display = "";
          wallRow.style.display    = "";
        };
        _rafraichirApercuFond();

        // Cadrage : `input` = aperçu live, `change` = persistance au relâchement
        // (même contrat que le voile — sinon une écriture IDB par pixel parcouru).
        [[wallPosX, wallPosXVal, "x"], [wallPosY, wallPosYVal, "y"]].forEach(function(t) {
          const el = t[0], lab = t[1], axe = t[2];
          el.addEventListener("input", function() {
            lab.textContent = el.value + " %";
            if (_wallPreviewUrl) {
              _peindreApercu(_wallPreviewUrl, Number(wallRange.value),
                             Number(wallPosX.value), Number(wallPosY.value), _fitCourant());
            }
          });
          el.addEventListener("change", async function() {
            try { await window.UserProfile.setWallpaperCadrage(axe, Number(el.value)); }
            catch(e) { console.warn("[Profile] cadrage non enregistré :", e); }
          });
        });

        wallBtn.addEventListener("click", function() { wallInput.click(); });
        wallInput.addEventListener("change", async function() {
          const f = wallInput.files && wallInput.files[0];
          if (!f) return;
          const label = wallBtn.textContent;
          wallBtn.disabled = true;
          wallBtn.textContent = _t("home.profile.photoCompressing");
          try {
            await window.UserProfile.setWallpaper(f);
            await _rafraichirApercuFond();
          } catch(e) {
            alert(_t("home.profile.errGeneric") + (e.message || e));
          } finally {
            wallBtn.disabled = false;
            wallBtn.textContent = label;
            wallInput.value = "";   // re-sélectionner le MÊME fichier doit refonctionner
          }
        });
        wallRemove.addEventListener("click", async function() {
          try { await window.UserProfile.removeWallpaper(); await _rafraichirApercuFond(); }
          catch(e) { alert(_t("home.profile.errGeneric") + (e.message || e)); }
        });
        // `input` = aperçu live pendant le glissement ; `change` = persistance
        // au relâchement seulement (sinon une écriture IDB par pixel parcouru).
        wallRange.addEventListener("input", function() {
          wallVal.textContent = wallRange.value + " %";
          if (_wallPreviewUrl) {
            _peindreApercu(_wallPreviewUrl, Number(wallRange.value),
                           Number(wallPosX.value), Number(wallPosY.value), _fitCourant());
          }
        });
        wallRange.addEventListener("change", async function() {
          try { await window.UserProfile.setWallpaperVoile(Number(wallRange.value)); }
          catch(e) { console.warn("[Profile] voile non enregistré :", e); }
        });

        // 🖼️ v1.75.0 — mode d'affichage. Pas de `input`/`change` séparés ici :
        // un <select> ne se « glisse » pas, un seul événement suffit.
        // ⚠️ Les curseurs de cadrage restent ACTIFS en mode Entière : quand
        // l'image ne remplit pas l'écran, ils ne choisissent plus ce qui est
        // rogné mais OÙ l'image se pose dans le cadre. Même contrôle, usage
        // différent — les griser aurait retiré une possibilité réelle.
        if (wallFit) {
          wallFit.addEventListener("change", async function() {
            if (_wallPreviewUrl) {
              _peindreApercu(_wallPreviewUrl, Number(wallRange.value),
                             Number(wallPosX.value), Number(wallPosY.value), _fitCourant());
            }
            try { await window.UserProfile.setWallpaperFit(wallFit.value); }
            catch(e) { console.warn("[Profile] mode d'affichage non enregistré :", e); }
          });
        }

        // Reset profil — modale custom charte (cf §35 CLAUDE.md, pattern
        // Promise-based, .kta-readme-modal-overlay + accent rouge danger).
        document.getElementById("kta-profile-details-reset").addEventListener("click", async function() {
          const ok = await _confirmResetProfilModale();
          if (!ok) return;
          try {
            await window.UserProfile.clear();
            // Refresh modale en place
            const snap2 = window.UserProfile.get();
            surnomInput.value = "";
            _originalSurnom = "";
            saveBtn.style.display = "none";
            removeBtn.style.display = "none";
            photoBtn.textContent = _t("home.profile.photoBtn");
            _refreshProfileDetailsAvatar(snap2);
            // 🖼️ v1.74.0 : `clear()` efface l'entrée entière, fond compris —
            // l'aperçu doit suivre, sinon il montre une image qui n'existe plus.
            await _rafraichirApercuFond();
          } catch(e) { alert(_t("home.profile.errGeneric") + (e.message || e)); }
        });
      }

      /**
       * Modale custom charte pour confirmer la réinitialisation du profil.
       * Pattern Promise-based (résout true = continuer, false = annuler).
       * Z-index 100001 pour passer au-dessus de la modale parente "Détails
       * du profil" (qui est à 99999 via .kta-readme-modal-overlay).
       */
      function _confirmResetProfilModale() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        return new Promise(function(resolve) {
          // Cleanup d'une instance précédente éventuelle (anti-empilement)
          const ex = document.getElementById("kta-profile-reset-confirm-modal");
          if (ex && ex.parentNode) ex.parentNode.removeChild(ex);

          const overlay = document.createElement("div");
          overlay.id = "kta-profile-reset-confirm-modal";
          overlay.className = "kta-readme-modal-overlay";
          overlay.style.zIndex = "100001";  // au-dessus de la modale parente
          overlay.innerHTML =
            '<div class="kta-readme-modal-boite" style="max-width:440px; height:auto !important; max-height:88vh !important; border-color:rgba(255,140,140,0.55); box-shadow:0 0 24px rgba(255,140,140,0.18);">' +
              '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,140,140,0.25);">' +
                '<span class="kta-readme-modal-titre" style="color:#ff8c8c;">' + _t("home.profile.resetTitle") + '</span>' +
                '<button type="button" class="kta-panneau-close" id="kta-profile-reset-close" aria-label="' + _t("home.profile.cancel") + '">✕</button>' +
              '</div>' +
              '<div class="kta-readme-modal-corps">' +
                '<p style="margin-top:4px;">' +
                  _t("home.profile.resetBody") +
                '</p>' +
                '<ul style="margin:8px 0 12px 18px; padding:0;">' +
                  '<li>' + _t("home.profile.resetItemNickname") + '</li>' +
                  '<li>' + _t("home.profile.resetItemPhoto") + '</li>' +
                '</ul>' +
                '<div style="background:rgba(110,226,135,0.06); border:1px solid rgba(110,226,135,0.22); border-radius:6px; padding:10px 12px; margin-bottom:8px;">' +
                  _t("home.profile.resetKept") +
                '</div>' +
                '<p style="font-size:12px; color:#8892a4; font-style:italic; margin:8px 0 0;">' +
                  _t("home.profile.resetAfterHint") +
                '</p>' +
              '</div>' +
              '<div class="kta-profile-footer" style="display:flex; gap:8px; padding:14px 16px; border-top:1px solid rgba(255,255,255,0.06);">' +
                '<button type="button" class="kta-btn kta-btn-ghost"  id="kta-profile-reset-cancel" style="flex:1;">' + _t("home.profile.cancel") + '</button>' +
                '<button type="button" class="kta-btn kta-btn-danger" id="kta-profile-reset-go"     style="flex:1;">' + _t("home.profile.resetConfirm") + '</button>' +
              '</div>' +
            '</div>';
          document.documentElement.appendChild(overlay);

          const _close = function(result) {
            document.removeEventListener("keydown", _onEsc);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            resolve(!!result);
          };
          const _onEsc = function(e) {
            if (e.key === "Escape" || e.key === "Esc") {
              e.stopPropagation();  // pas fermer la modale parente
              _close(false);
            }
          };

          document.getElementById("kta-profile-reset-close").addEventListener("click", function() { _close(false); });
          document.getElementById("kta-profile-reset-cancel").addEventListener("click", function() { _close(false); });
          document.getElementById("kta-profile-reset-go").addEventListener("click", function() { _close(true); });
          overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(false); });
          document.addEventListener("keydown", _onEsc);

          // Focus accessibilité : focus auto sur "Annuler" (sécuritaire)
          setTimeout(function() {
            const btn = document.getElementById("kta-profile-reset-cancel");
            if (btn) btn.focus();
          }, 50);
        });
      }

      let _profileDetailsObjectUrl = null;
      async function _refreshProfileDetailsAvatar(snap) {
        const avatarEl = document.getElementById("kta-profile-details-avatar");
        if (!avatarEl || !window.UserProfile) return;
        // 🆕 v1.52.0 : anneau de rang + 🆕 médaille de coin (parité avec le home)
        const _dRank = _appliquerRangAvatar(avatarEl);
        const _dBadge = document.getElementById("kta-profile-details-badge");
        if (_dBadge && _dRank) {
          if (_dRank.emoji) {
            _dBadge.textContent = _dRank.emoji;
            _dBadge.setAttribute("data-kta-rank", _dRank.id);
            _dBadge.style.display = "";
          } else {
            _dBadge.textContent = "";
            _dBadge.style.display = "none";  // Touriste : pas de médaille
          }
        }
        // 🐛 v1.75.0 — même correctif que le bandeau : révoquer AVANT l'await
        // laissait le <img> sur une URL morte le temps de la lecture IDB.
        // C'est l'avatar de CETTE modale que KARMA voyait passer en « ? »,
        // puisque c'est là qu'on charge un fond d'écran.
        const _ancienneUrlD = _profileDetailsObjectUrl;
        const _libererAncienneD = function() {
          if (_ancienneUrlD) { try { URL.revokeObjectURL(_ancienneUrlD); } catch(e) {} }
        };
        snap = snap || window.UserProfile.get();
        if (snap.hasPhoto) {
          try {
            const url = await window.UserProfile.getPhotoObjectUrl();
            if (url) {
              _profileDetailsObjectUrl = url;
              avatarEl.innerHTML = '<img class="kta-profile-details-avatar-photo" src="' + url + '" alt="Photo profil">';
              _libererAncienneD();
              return;
            }
          } catch(e) {}
        }
        _profileDetailsObjectUrl = null;
        _libererAncienneD();
        const hasName = !!(snap.surnom && snap.surnom.trim());
        const initial = hasName ? window.UserProfile.getInitial(snap.surnom) : "👤";
        const color   = window.UserProfile.getAvatarColor(snap.surnom || "");
        if (hasName) {
          avatarEl.innerHTML =
            '<div class="kta-profile-details-avatar-initial" style="background:' + color.bg + '; color:' + color.fg + ';">' +
              initial +
            '</div>';
        } else {
          avatarEl.innerHTML =
            '<div class="kta-profile-details-avatar-initial kta-profile-details-avatar-empty">👤</div>';
        }
      }

      // ============================================================
      // 🆕 v1.28.4 — Section "💼 Édition pro" dans la modale profil
      // ============================================================
      // Permet à un user d'importer un fichier Licence-pro.json reçu
      // par mail/canal privé pour activer le mode pro localement
      // (cf. js/proLicense.js doctrine 2 sources serveur + local).

      // Helper : tronque un hash pour affichage compact (ex:
      // "MKTM-LIC-abc123..." → "MKTM-LIC-abc1…3456").
      function _proHashShort(hash) {
        if (typeof hash !== "string") return "";
        if (hash.length <= 18) return hash;
        return hash.slice(0, 13) + "…" + hash.slice(-4);
      }

      // Helper : libellés humains selon source.
      function _proSourceLabel(source) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        if (source === "server") return _t("home.profile.pro.sourceServer");
        if (source === "local")  return _t("home.profile.pro.sourceLocal");
        return "—";
      }
      function _proSourceHint(source) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        if (source === "server") {
          return _t("home.profile.pro.hintServer");
        }
        if (source === "local") {
          return _t("home.profile.pro.hintLocal");
        }
        return _t("home.profile.pro.hintCommunity");
      }

      // Rend la section selon l'état actuel de la licence pro.
      function _refreshProfileProSection() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const body = document.getElementById("kta-profile-pro-body");
        if (!body) return;
        if (!window.MyKTAMapProLicense) {
          body.innerHTML = '<p class="kta-profile-pro-error">' + _t("home.profile.pro.moduleUnavailable") + '</p>';
          return;
        }
        const lic = window.MyKTAMapProLicense;
        const isPro = lic.isPro();
        const source = lic.getSource();
        const data = lic.getData();

        let html = "";
        if (isPro) {
          // 🆕 v1.28.4 (post-feedback KARMA) : suppression du bloc méta
          // (Source / Client / Hash). Le badge + le hint suffisent pour
          // donner le contexte sans saturer la modale.
          // Les helpers _proHashShort / _proSourceLabel restent disponibles
          // si un usage futur (export profil, diagnostic, etc.) en a besoin.
          html +=
            '<div class="kta-profile-pro-status kta-profile-pro-status-active">' +
              '<span class="kta-profile-pro-badge">' + _t("home.profile.pro.badgeActive") + '</span>' +
            '</div>';
          html += '<p class="kta-profile-pro-hint">' + _proSourceHint(source) + '</p>';
          if (source === "local") {
            html +=
              '<div class="kta-profile-pro-actions">' +
                '<button type="button" class="kta-btn kta-btn-danger kta-btn-mini" id="kta-profile-pro-remove">' + _t("home.profile.pro.removeLocalBtn") + '</button>' +
              '</div>';
          }
        } else {
          html += '<p class="kta-profile-pro-hint">' + _proSourceHint(null) + '</p>';
          html +=
            '<div class="kta-profile-pro-actions">' +
              '<button type="button" class="kta-btn kta-btn-primary kta-btn-mini" id="kta-profile-pro-import">' + _t("home.profile.pro.importBtn") + '</button>' +
            '</div>';
        }
        body.innerHTML = html;
      }

      // Bind handlers (boutons import / retrait + input file).
      // Idempotent : un seul binding global via délégation sur le body
      // de la section (qui est re-renduré à chaque change d'état).
      function _bindProfileProHandlers() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const section = document.getElementById("kta-profile-pro-section");
        const fileInput = document.getElementById("kta-profile-pro-input");
        if (!section || !fileInput) return;

        // Délégation sur la section (les boutons sont à l'intérieur du body
        // qui se re-rendre, donc on délègue plutôt que bind direct).
        section.addEventListener("click", function(e) {
          const target = e.target;
          if (!(target instanceof HTMLElement)) return;
          if (target.id === "kta-profile-pro-import" || target.closest("#kta-profile-pro-import")) {
            fileInput.value = ""; // reset pour permettre re-pick du même fichier
            fileInput.click();
            return;
          }
          if (target.id === "kta-profile-pro-remove" || target.closest("#kta-profile-pro-remove")) {
            if (!window.MyKTAMapProLicense) return;
            const ok = window.confirm(_t("home.profile.pro.confirmRemove"));
            if (!ok) return;
            window.MyKTAMapProLicense.removeLocal();
            _refreshProfileProSection();
            if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
              window.OOMGuard.showToast(_t("home.profile.pro.removedToast"), "info");
            }
          }
        });

        fileInput.addEventListener("change", function() {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          if (!window.MyKTAMapProLicense) return;
          window.MyKTAMapProLicense.importFile(file).then(function(result) {
            if (result && result.ok) {
              _refreshProfileProSection();
              if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
                window.OOMGuard.showToast(_t("home.profile.pro.importedToast"), "info");
              }
            } else {
              const msg = (result && result.error) ? result.error : _t("home.profile.pro.errUnknown");
              window.alert(_t("home.profile.pro.importRejected") + msg);
            }
          });
        });
      }

      async function _refreshProfileDetailsStats() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const statsEl = document.getElementById("kta-profile-details-stats");
        if (!statsEl) return;
        // 🆕 v1.29.0-fix2 (KARMA "si je relance, mes plans srv disparaissent
        // mais ils restent dans les stats profil — 2 plans en trop") :
        // helper qui retourne la liste des plans filtrée selon la pref
        // skipServerPlans. Utilisé pour les 2 compteurs ci-dessous (nbPlans
        // + boucle photos POI) qui lisaient le localStorage brut sans
        // appliquer le filtre — divergence avec _hydrateProfileBarStats et
        // la table détaillée plus bas qui filtraient déjà.
        function _getPlansFiltered() {
          let plans = [];
          try {
            const raw = localStorage.getItem("myktamap_plans");
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && Array.isArray(parsed.plans)) plans = parsed.plans;
          } catch(e) {}
          if (typeof window._loaderSkipServerPlans === "function"
              && window._loaderSkipServerPlans()) {
            plans = plans.filter(function(p) { return p.type !== "server"; });
          }
          return plans;
        }
        // Compteurs simples sync
        let nbPlans = 0, nbFavoris = 0, nbSessions = 0, nbBackups = 0;
        const _plansForCount = _getPlansFiltered();
        nbPlans = _plansForCount.length;
        try {
          const favRaw = localStorage.getItem("myktamap_favoris_v1");
          if (favRaw) {
            const fp = JSON.parse(favRaw);
            if (fp && fp.byPlan) {
              Object.keys(fp.byPlan).forEach(function(pid) {
                nbFavoris += (fp.byPlan[pid] || []).length;
              });
            }
          }
        } catch(e) {}
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith("myktamap_session_v1_")) nbSessions++;
          }
        } catch(e) {}
        if (window.SessionBackups && window.SessionBackups.listAll) {
          try { const arr = await window.SessionBackups.listAll(); nbBackups = arr.length; } catch(e) {}
        }
        // Photos POI (count + bytes total) — utilise la liste FILTRÉE
        // (cohérence avec le compteur nbPlans ci-dessus). Cf v1.29.0-fix2.
        let nbPhotos = 0, photosBytes = 0;
        if (window.MyKTAMapPhotos && window.MyKTAMapPhotos.getAllPhotosForPlan) {
          try {
            for (const p of _plansForCount) {
              if (!p.id) continue;
              const photos = await window.MyKTAMapPhotos.getAllPhotosForPlan(p.id);
              if (Array.isArray(photos)) {
                nbPhotos += photos.length;
                photos.forEach(function(ph) { photosBytes += (ph.size || 0); });
              }
            }
          } catch(e) {}
        }
        function _fmtBytes(n) {
          if (!n) return "0 B";
          if (n < 1024) return n + " B";
          if (n < 1024*1024) return (n/1024).toFixed(1) + " KB";
          return (n/1048576).toFixed(1) + " MB";
        }
        // 🆕 v1.21.3 (KARMA "il manque le sauvegarde (la taille)") : 6e cell
        // dans la grid stats — taille totale MyKTAMap (= même valeur que la
        // stat 💾 du bandeau home, calcul ciblé LS + IDB).
        let storageTotalBytes = 0;
        try {
          storageTotalBytes = await _getStorageMyktamapCached();
        } catch(e) {}
        statsEl.innerHTML =
          '<div class="kta-profile-stat-grid">' +
            '<div class="kta-profile-stat-cell"><span class="kta-profile-stat-num">' + nbPlans + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblPlans") + '</span></div>' +
            '<div class="kta-profile-stat-cell"><span class="kta-profile-stat-num">' + nbSessions + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblSessions") + '</span></div>' +
            '<div class="kta-profile-stat-cell"><span class="kta-profile-stat-num">' + nbFavoris + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblFavorites") + '</span></div>' +
            '<div class="kta-profile-stat-cell"><span class="kta-profile-stat-num">' + nbBackups + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblSnapshots") + '</span></div>' +
            '<div class="kta-profile-stat-cell"><span class="kta-profile-stat-num">' + nbPhotos + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblPhotos") + ' (' + _fmtBytes(photosBytes) + ')</span></div>' +
            '<div class="kta-profile-stat-cell" title="' + _t("home.profile.stats.totalTitle") + '"><span class="kta-profile-stat-num kta-profile-stat-num-bytes">' + _fmtBytes(storageTotalBytes) + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblStorage") + '</span></div>' +
          '</div>' +
          // 🆕 v1.21.3 (KARMA "récuperer les stat global de chaque plan pour les
          // lister (ne pas avoir a rentrer dans le plan pour consulter)") :
          // section enrichie avec calcul SÉQUENTIEL plan par plan (anti-crash :
          // KARMA "si on fait tout les plan d'un coup ca crash a 100%, il faut
          // donc de facons séquentiel, cumuler un plan par un plan").
          // Squelette rendu d'abord, le calcul peuple le tbody progressivement
          // via `_calculerStatsPlansAggregees` (cf ci-après).
          '<div class="kta-profile-plansstats" id="kta-profile-plansstats">' +
            '<div class="kta-profile-plansstats-header" id="kta-profile-plansstats-header">' +
              _t("home.profile.stats.plansHeaderLoading") +
            '</div>' +
            '<div class="kta-profile-plansstats-wrap">' +
              '<table class="kta-profile-plansstats-table">' +
                '<thead>' +
                  '<tr>' +
                    '<th>' + _t("home.profile.stats.thPlan") + '</th>' +
                    '<th title="' + _t("home.profile.stats.thPoisTitle") + '">📍</th>' +
                    '<th title="' + _t("home.profile.stats.thRoadsTitle") + '">🛣️</th>' +
                    '<th title="' + _t("home.profile.stats.thDistTitle") + '">↔</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody id="kta-profile-plansstats-tbody"></tbody>' +
                '<tfoot id="kta-profile-plansstats-tfoot"></tfoot>' +
              '</table>' +
            '</div>' +
            '<p class="kta-profile-plansstats-note">' +
              _t("home.profile.stats.plansNote") +
            '</p>' +
          '</div>';

        // Lancement async du calcul agrégé séquentiel (anti-crash)
        // Géré HORS du innerHTML synchrone pour ne pas bloquer le rendu.
        _calculerStatsPlansAggregees();
      }

      // 🆕 v1.21.3 (KARMA "les stat de plan ne comprenne que les session") :
      // helper de calcul "stats complètes d'un plan" qui agrège session
      // (localStorage) + data layers embedded (registries en mémoire).
      // À utiliser pour le plan COURANT (chargé) — il a besoin que les
      // registries _ktaDataMarkers/Polylines/Polygons/StructurePolygons soient
      // peuplés (= via utils.js > ajouterPointsDepuisJSON). Pour les autres
      // plans, on lit le CACHE localStorage `myktamap_plan_stats_v1_<id>`
      // qui a été persisté par _persisterStatsPlanCourant au dernier load.
      //
      // Format cache : { pois, roads, distPx, nbPolys, ts, source: "live" }
      //   - pois    : count des points (session + embedded)
      //   - roads   : count des roads (session + embedded)
      //   - distPx  : longueur totale des roads en pixels (= unité plan)
      //   - ts      : timestamp du calcul (pour invalidation future si besoin)
      function _sumRoadsDistPx(roads) {
        if (!Array.isArray(roads)) return 0;
        let total = 0;
        roads.forEach(function(r) {
          if (!r || !Array.isArray(r.points)) return;
          for (let k = 1; k < r.points.length; k++) {
            const a = r.points[k - 1], b = r.points[k];
            if (!a || !b || typeof a.x !== "number" || typeof b.x !== "number") continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            total += Math.sqrt(dx * dx + dy * dy);
          }
        });
        return total;
      }

      // 🆕 v1.21.3 (KARMA "rajoute comme on voit sur chaque plan stat détailé
      // les graph et tout") : breakdowns par catégorie pour camemberts.
      // Helper qui produit { key: count } depuis un array d'items typés.
      function _countBy(items, accessor) {
        const out = {};
        if (!Array.isArray(items)) return out;
        items.forEach(function(it) {
          if (!it) return;
          const k = accessor(it);
          if (k == null || k === "") return;
          out[k] = (out[k] || 0) + 1;
        });
        return out;
      }
      // Helper : retourne le 1er tag d'un point (default "default")
      function _firstTagOf(p) {
        if (Array.isArray(p.tags) && p.tags.length > 0) return p.tags[0];
        return "default";
      }
      // Helper : merge un objet { key: count } dans un autre (mutation)
      function _mergeBreakdown(target, src) {
        if (!src || typeof src !== "object") return target;
        Object.keys(src).forEach(function(k) {
          target[k] = (target[k] || 0) + (src[k] || 0);
        });
        return target;
      }

      function _computePlanStatsLive() {
        // Agrège session (getters) + embedded (registries en mémoire).
        // Le plan COURANT a tout ce qu'il faut chargé.
        const editorPts   = (typeof window.getEditorPoints === "function") ? (window.getEditorPoints() || []) : [];
        const embedPts    = (typeof window.getAllEmbeddedPoints === "function") ? (window.getAllEmbeddedPoints() || []) : [];
        const sessRoads   = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
        const embedRoads  = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : [];
        const sessZones   = (typeof window.getZones === "function") ? (window.getZones() || []) : [];
        const embedZones  = (typeof window.getAllEmbeddedZones === "function") ? (window.getAllEmbeddedZones() || []) : [];
        const sessStructs = (typeof window.getStructures === "function") ? (window.getStructures() || []) : [];
        const embedStructs = (typeof window.getAllEmbeddedStructures === "function") ? (window.getAllEmbeddedStructures() || []) : [];

        // Breakdowns par catégorie (pour camemberts agrégés cross-plan)
        const pointsByTag = _countBy(editorPts.concat(embedPts), _firstTagOf);
        const roadsByType = _countBy(sessRoads.concat(embedRoads), function(r) { return r.type || "principal"; });
        const zonesByType = _countBy(sessZones.concat(embedZones), function(z) { return z.type || "remblais"; });
        const structsByType = _countBy(sessStructs.concat(embedStructs), function(s) { return s.type || "pilier-1"; });

        // Distance + scale (px/m) du plan courant. Si scale dispo, on calcule
        // aussi distM en mètres → cohérent cross-plan dans la modale Profil
        // (les autres plans lisent distM via leur cache, persisté avec leur
        // propre scale au moment du load).
        // 🐛 v1.21.4 (KARMA "il m'affiche KM pour le dernier plan charger,
        // sinon en px") : avant on retournait juste distPx → impossible de
        // convertir pour les autres plans (scale inconnue). Maintenant on
        // persiste distM dans le cache aussi → conversion universelle.
        const distPx = _sumRoadsDistPx(sessRoads) + _sumRoadsDistPx(embedRoads);
        const scale  = (window.APP_CONFIG && typeof window.APP_CONFIG.scale === "number" && window.APP_CONFIG.scale > 0)
                       ? window.APP_CONFIG.scale
                       : null;
        const distM  = scale ? (distPx / scale) : null;

        return {
          pois:   editorPts.length + embedPts.length,
          roads:  sessRoads.length + embedRoads.length,
          zones:  sessZones.length + embedZones.length,
          structs: sessStructs.length + embedStructs.length,
          distPx: distPx,
          distM:  distM,
          scale:  scale,
          breakdowns: {
            pointsByTag:   pointsByTag,
            roadsByType:   roadsByType,
            zonesByType:   zonesByType,
            structsByType: structsByType
          },
          ts:     Date.now(),
          source: "live"
        };
      }

      // Persiste les stats COMPLÈTES du plan courant dans localStorage.
      // Appelé depuis main.js après lancerApplication terminé (defer 800ms
      // pour laisser le temps aux data layers async de finir leur ajout via
      // rAF batch — cf utils.js > ajouterPointsDepuisJSON BATCH=50).
      window._persisterStatsPlanCourant = function() {
        const planId = window._currentLoadedPlanId;
        if (!planId) return;
        try {
          const stats = _computePlanStatsLive();
          localStorage.setItem("myktamap_plan_stats_v1_" + planId, JSON.stringify(stats));
        } catch(e) {
          console.warn("[ProfileStats] Persist plan stats échec :", e);
        }
      };

      // 🆕 v1.21.3 — Calcul SÉQUENTIEL plan par plan des stats agrégées.
      // Itère le PlanRegistry, pour chaque plan lit son slot localStorage
      // `myktamap_session_v1_<planId>` (lecture instantanée), compte
      // editorPoints + roads et somme la longueur cumulée des tracés en
      // pixels. `await new Promise(r => setTimeout(r, 0))` entre 2 plans
      // pour laisser respirer le thread UI (vital sur mobile avec 10+ plans).
      // Le tbody est peuplé progressivement → l'user voit la liste grossir
      // au lieu d'attendre un blocking compute.
      async function _calculerStatsPlansAggregees() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const headerEl = document.getElementById("kta-profile-plansstats-header");
        const tbodyEl  = document.getElementById("kta-profile-plansstats-tbody");
        const tfootEl  = document.getElementById("kta-profile-plansstats-tfoot");
        if (!tbodyEl || !tfootEl) return;

        // 🐛 v1.21.3-fix2 (KARMA "il voit aucun plan enrengistrer alors que
        // j'en ai 3") : l'API PlanRegistry est `.getAll()`, pas `.list()`
        // (que j'avais inventé). Mon code retournait undefined → "aucun
        // plan enregistré" alors que le registre était plein.
        let plans = [];
        if (window.PlanRegistry && typeof window.PlanRegistry.getAll === "function") {
          try { plans = window.PlanRegistry.getAll() || []; } catch(e) {}
        }
        // 🆕 v1.21.3 (KARMA "peut en plus fausser nos statistique") : si la
        // pref `skipServerPlans` est active, on exclut les plans `type ===
        // "server"` des stats (gonflerait artificiellement le count Plans
        // pour les users qui ne veulent pas les voir).
        if (typeof window._loaderSkipServerPlans === "function" && window._loaderSkipServerPlans()) {
          plans = plans.filter(function(p) { return p.type !== "server"; });
        }
        if (plans.length === 0) {
          if (headerEl) headerEl.innerHTML = _t("home.profile.stats.plansHeaderEmpty");
          return;
        }

        // Totaux cumulés (mis à jour à chaque plan)
        let totalPois = 0, totalRoads = 0;
        // 🐛 v1.21.4 : cumul séparé pour les distM convertibles vs distPx
        // orphelins (= plans sans scale connue). On affiche le total en m/km
        // avec un suffix "+N plan(s) en px" si certains sont orphelins.
        let totalDistM = 0, totalDistPxOrphan = 0, nbPxOrphan = 0;
        let nbAvecData = 0, nbPartial = 0;
        // 🆕 v1.21.3 : agrégation des breakdowns cross-plan pour les camemberts
        const aggBreakdowns = {
          pointsByTag:   {},
          roadsByType:   {},
          zonesByType:   {},
          structsByType: {}
        };
        // ID du plan courant (pour marqueur ● dans la table)
        // 🐛 v1.21.4 : la variable _currentScale a été retirée — chaque plan
        // a désormais sa propre `scale` dans son cache (via `_computePlanStatsLive`
        // qui la persiste au load du plan). Plus besoin de hack "scale courant
        // pour tous les plans" → conversion m/km précise par plan.
        const _currentId = window._currentLoadedPlanId || null;

        // Format distance pour une row (m/km si distM connu, sinon pixels).
        // 🐛 v1.21.4 (KARMA "il m'affiche KM pour le dernier plan charger,
        // sinon en px") : avant on convertissait UNIQUEMENT le plan courant
        // via _currentScale → tous les autres plans en pixels. Maintenant
        // chaque plan stocke sa propre scale dans le cache → distM précis
        // pour tous les plans déjà ouverts.
        function _fmtDist(stats) {
          const distM  = stats && typeof stats.distM === "number" ? stats.distM : null;
          const distPx = stats && typeof stats.distPx === "number" ? stats.distPx : 0;
          if (distM !== null && distM > 0 && typeof window.formatDistance === "function") {
            return window.formatDistance(distM, 0);
          }
          if (distPx <= 0) return "—";
          if (distPx < 1000) return Math.round(distPx) + " px";
          return (distPx / 1000).toFixed(1) + "k px";
        }

        // 🆕 v1.21.3 (KARMA "les stat de plan ne comprenne que les session") :
        // 3 sources de stats avec fallback en cascade par plan :
        //   1. Plan COURANT → calcul live via _computePlanStatsLive (registries
        //      en mémoire = session + data layers embedded chargés)
        //   2. Plan déjà ouvert au moins une fois → cache localStorage
        //      "myktamap_plan_stats_v1_<id>" (rempli par _persisterStatsPlanCourant
        //      dans main.js après lancerApplication)
        //   3. Plan jamais ouvert → fallback session-only via localStorage
        //      "myktamap_session_v1_<id>" + marqueur "⚠️" partiel (data layers
        //      manquants — il faut ouvrir le plan pour avoir le total complet)
        function _resoudreStatsPlan(plan) {
          // Cas 1 : plan courant → live (avec distM + scale via APP_CONFIG)
          if (plan.id === _currentId) {
            const live = _computePlanStatsLive();
            return {
              pois: live.pois, roads: live.roads,
              distPx: live.distPx,
              distM:  live.distM,    // ← v1.21.4 : mètres précis avec scale courante
              scale:  live.scale,
              breakdowns: live.breakdowns || null,
              source: "live"
            };
          }
          // Cas 2 : cache localStorage. Tolère 2 formats :
          //   • v1.21.4+ : cache contient distM + scale (= mètres convertibles)
          //   • v1.21.3  : cache contient juste distPx (= pixels seulement)
          //                → traité comme partial (réopen plan pour upgrade)
          // 🐛 v1.21.5-fix1 (KARMA "les route secondaire ou taguer lvl -1 ne
          // semble pas pris en compte en stat general plan") : si le cache
          // existe mais N'A PAS de breakdowns (cache antérieur à v1.21.3, ou
          // entry corrompue), on NE retourne PAS breakdowns:null (qui ferait
          // skip totalement ce plan dans l'agrégation des camemberts). On
          // FALL THROUGH au cas 3 (session-only) pour avoir au moins les
          // breakdowns session — sans les embedded data layers, mais c'est
          // mieux que rien.
          try {
            const raw = localStorage.getItem("myktamap_plan_stats_v1_" + plan.id);
            if (raw) {
              const cached = JSON.parse(raw);
              if (cached && typeof cached.pois === "number"
                  && cached.breakdowns && typeof cached.breakdowns === "object") {
                const hasDistM = (typeof cached.distM === "number");
                return {
                  pois:   cached.pois || 0,
                  roads:  cached.roads || 0,
                  distPx: cached.distPx || 0,
                  distM:  hasDistM ? cached.distM : null,
                  scale:  cached.scale || null,
                  breakdowns: cached.breakdowns,
                  source: hasDistM ? "cache" : "cache-legacy"   // v1.21.3 → marqueur ⚠️
                };
              }
            }
          } catch(e) {}
          // Cas 3 : fallback session-only (partial — pas de scale, pas
          // d'embedded data layers : on ne lit QUE le payload SessionPersist
          // du plan, jamais les data/*.json embedded qui demandent un fetch).
          // 🆕 v1.21.5-fix1 (KARMA "les route secondaire ou taguer lvl -1 ne
          // semble pas pris en compte") : on étend désormais zones + structures
          // du payload session (rétrocompat v1.9.3-A1.a+ qui les a ajoutées).
          // Les niveaux M-LVL et tous les types (secondaire, chemin, jonction)
          // sont préservés tels quels — pas de filtre par type ni par level.
          let pois = 0, roads = 0, distPx = 0;
          let pointsByTag = {}, roadsByType = {};
          let zonesByType = {}, structsByType = {};
          try {
            const raw = localStorage.getItem("myktamap_session_v1_" + plan.id);
            if (raw) {
              const data = JSON.parse(raw);
              const eps = Array.isArray(data.editorPoints) ? data.editorPoints : [];
              const rds = Array.isArray(data.roads) ? data.roads : [];
              const zns = Array.isArray(data.zones) ? data.zones : [];
              const sts = Array.isArray(data.structures) ? data.structures : [];
              pois  = eps.length;
              roads = rds.length;
              distPx = _sumRoadsDistPx(rds);
              pointsByTag   = _countBy(eps, _firstTagOf);
              roadsByType   = _countBy(rds, function(r) { return r.type || "principal"; });
              zonesByType   = _countBy(zns, function(z) { return z.type || "remblais"; });
              structsByType = _countBy(sts, function(s) { return s.type || "pilier-1"; });
            }
          } catch(e) {}
          return {
            pois: pois, roads: roads, distPx: distPx,
            distM: null, scale: null,
            breakdowns: {
              pointsByTag:   pointsByTag,
              roadsByType:   roadsByType,
              zonesByType:   zonesByType,
              structsByType: structsByType
            },
            source: "session-only"
          };
        }

        // ════════ ITÉRATION SÉQUENTIELLE ANTI-CRASH ════════
        for (let i = 0; i < plans.length; i++) {
          const plan = plans[i];

          // Yield au thread UI entre chaque plan (vital mobile)
          // ⚠️ NE JAMAIS retirer ce await — c'est ce qui empêche le freeze
          // sur 10+ plans, surtout avec des sessions chargées.
          await new Promise(function(r) { setTimeout(r, 0); });

          // Update progress header
          if (headerEl) {
            headerEl.innerHTML = _t("home.profile.statsProgress", { i: (i + 1), n: plans.length });
          }

          const stats = _resoudreStatsPlan(plan);
          const pois  = stats.pois;
          const roads = stats.roads;
          const distPx = stats.distPx;
          const distM  = stats.distM;
          // 🐛 v1.21.4 : "partial" inclut désormais aussi "cache-legacy"
          // (cache v1.21.3 sans distM/scale). L'user doit re-ouvrir le plan
          // pour upgrader son cache au format v1.21.4 avec mètres.
          const isPartial = (stats.source === "session-only" || stats.source === "cache-legacy");
          if (pois > 0 || roads > 0) nbAvecData++;
          if (isPartial)            nbPartial++;

          totalPois  += pois;
          totalRoads += roads;
          // Cumul intelligent : distM si dispo, sinon distPx orphelin
          if (typeof distM === "number" && distM > 0) {
            totalDistM += distM;
          } else if (distPx > 0) {
            totalDistPxOrphan += distPx;
            nbPxOrphan++;
          }

          // 🆕 v1.21.3 : merge des breakdowns dans l'agrégat cross-plan
          if (stats.breakdowns) {
            _mergeBreakdown(aggBreakdowns.pointsByTag,   stats.breakdowns.pointsByTag);
            _mergeBreakdown(aggBreakdowns.roadsByType,   stats.breakdowns.roadsByType);
            _mergeBreakdown(aggBreakdowns.zonesByType,   stats.breakdowns.zonesByType);
            _mergeBreakdown(aggBreakdowns.structsByType, stats.breakdowns.structsByType);
          }

          // Append row au tbody (rendu progressif visible par l'user)
          const isCurrent = (plan.id === _currentId);
          const planName  = plan.name || plan.id;
          const safeLabel = String(planName).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const versionTag = plan.version ? ' <span class="kta-pps-version">' + String(plan.version).replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</span>' : '';
          const currentTag = isCurrent ? ' <span class="kta-pps-current" title="Plan actuellement chargé (stats live + data layers)">●</span>' : '';
          // 🆕 v1.21.3 : marqueur ⚠️ si stats partielles (session-only, data
          // layers absents car plan jamais ouvert dans cette release)
          const partialTag = isPartial ? ' <span class="kta-pps-partial" title="⚠️ Stats partielles : session uniquement (les data layers embedded ne sont pas inclus). Ouvre ce plan une fois pour avoir les stats complètes en cache.">⚠️</span>' : '';
          const row = document.createElement("tr");
          row.className = isCurrent ? "kta-pps-row-current" : (isPartial ? "kta-pps-row-partial" : "");
          row.innerHTML =
            '<td class="kta-pps-name">' + safeLabel + versionTag + currentTag + partialTag + '</td>' +
            '<td class="kta-pps-num">' + pois + '</td>' +
            '<td class="kta-pps-num">' + roads + '</td>' +
            '<td class="kta-pps-num">' + _fmtDist(stats) + '</td>';
          tbodyEl.appendChild(row);

          // Mise à jour live du footer (totaux cumulés).
          // 🐛 v1.21.4 : cumul intelligent en 3 cas :
          //   • Tout en distM → "12.5 km"
          //   • Mix distM + px orphan → "12.5 km (+ N en px)"
          //   • Tout en px → "X k px" (= cas tous plans jamais ouverts)
          let totalDistStr;
          if (totalDistM > 0 && nbPxOrphan === 0) {
            totalDistStr = window.formatDistance(totalDistM, 0);
          } else if (totalDistM > 0 && nbPxOrphan > 0) {
            totalDistStr = window.formatDistance(totalDistM, 0) +
                           ' <span style="color:#f4c542; font-size:10px;" title="' + nbPxOrphan + ' plan' + (nbPxOrphan > 1 ? "s" : "") + ' sans scale connue, distance en pixels uniquement">(+ ' + nbPxOrphan + ' ⚠️ px)</span>';
          } else if (totalDistPxOrphan > 0) {
            totalDistStr = (totalDistPxOrphan >= 1000
                            ? (totalDistPxOrphan / 1000).toFixed(1) + "k px"
                            : Math.round(totalDistPxOrphan) + " px");
          } else {
            totalDistStr = "—";
          }
          const partialSuffix = nbPartial > 0 ? ', <span style="color:#f4c542;">' + nbPartial + ' ⚠️ partiel' + (nbPartial > 1 ? "s" : "") + '</span>' : '';
          tfootEl.innerHTML =
            '<tr>' +
              '<th>Total (' + nbAvecData + ' avec données' + partialSuffix + ')</th>' +
              '<th class="kta-pps-num">' + totalPois + '</th>' +
              '<th class="kta-pps-num">' + totalRoads + '</th>' +
              '<th class="kta-pps-num">' + totalDistStr + '</th>' +
            '</tr>';
        }

        // Header final (calcul terminé)
        if (headerEl) {
          const partialNote = nbPartial > 0
            ? ' <span style="color:#f4c542; font-size:11px;">(' + nbPartial + ' ⚠️ partiel' + (nbPartial > 1 ? "s" : "") + ' — ouvre une fois pour stats complètes)</span>'
            : '';
          headerEl.innerHTML = _t("home.profile.statsFinal", { n: plans.length, s: (plans.length > 1 ? "s" : "") }) + partialNote;
        }

        // 🆕 v1.21.3 (KARMA "dans les stat, rajoute comme on voit sur chaque
        // plan stat détailé les graph et tout") : section camemberts SVG
        // agrégés cross-plan, après la table. Réutilise renderPieChart
        // exposé par window.StatsGlobales (= même rendu que la modale Stats
        // Globales d'un plan, mais agrégé sur tous les plans accessibles).
        _renderProfilePies(aggBreakdowns);
      }

      // 🆕 v1.21.3 — Rend la section camemberts dans la modale Profil.
      // Construit ou met à jour le DOM #kta-profile-pies (après la table
      // "📊 Mes plans"). Une grille de 4 camemberts max (4 catégories) ;
      // chaque camembert n'apparaît QUE si sa catégorie a des données.
      function _renderProfilePies(breakdowns) {
        const wrap = document.getElementById("kta-profile-plansstats");
        if (!wrap) return;
        // Cleanup précédent (en cas de re-render)
        const ex = document.getElementById("kta-profile-pies");
        if (ex) ex.remove();

        // StatsGlobales.renderPieChart accessible ?
        const renderPie = (window.StatsGlobales && typeof window.StatsGlobales.renderPieChart === "function")
                          ? window.StatsGlobales.renderPieChart
                          : null;
        if (!renderPie) return;

        // Une cat à afficher = breakdown non vide
        const sections = [
          { key: "pointsByTag",   category: "tags",       label: "📍 Points par tag" },
          { key: "roadsByType",   category: "traces",     label: "🛣️ Tracés par type" },
          { key: "zonesByType",   category: "zones",      label: "⬛ Zones par type" },
          { key: "structsByType", category: "structures", label: "🏛️ Structures par type" }
        ];
        const activeSections = sections.filter(function(s) {
          const data = breakdowns[s.key] || {};
          return Object.keys(data).length > 0;
        });
        if (activeSections.length === 0) return;  // rien à dessiner

        const piesContainer = document.createElement("div");
        piesContainer.id = "kta-profile-pies";
        piesContainer.className = "kta-profile-pies-wrap";
        let html = '<div class="kta-profile-pies-header">📊 Répartition par catégorie <span style="color:#8892a4; font-size:11px; font-weight:400;">(agrégée sur tes plans)</span></div>';
        html += '<div class="kta-profile-pies-grid">';
        activeSections.forEach(function(s) {
          const data = breakdowns[s.key] || {};
          html += '<div class="kta-profile-pies-card">' +
                    '<div class="kta-profile-pies-card-title">' + s.label + '</div>' +
                    // 🆕 v1.21.5-fix1 (KARMA "en stat général, on doit toujours
                    // prendre la valeur par default") : 4e arg true = bypass la
                    // cascade LegendCustomization (qui appliquerait le renommage
                    // local du plan A à l'agrégat cross-plan home). Cross-plan =
                    // labels par défaut cohérents partout.
                    renderPie(data, s.category, 140, true) +
                  '</div>';
        });
        html += '</div>';
        piesContainer.innerHTML = html;
        wrap.appendChild(piesContainer);
      }

      // Init bandeau au boot du loader (différé pour laisser UserProfile.init())
      setTimeout(_initLoaderProfileBar, 100);

      function afficherChoixImportListe(stats) {
        return new Promise(function(resolve) {
          // Modale simple avec 3 options
          const modal = document.createElement("div");
          modal.className = "kta-readme-modal-overlay";
          modal.innerHTML = `
            <div class="kta-readme-modal-boite" style="max-width:440px;">
              <div class="kta-readme-modal-header">
                <span class="kta-readme-modal-titre">📂 Charger une liste de plans</span>
              </div>
              <div class="kta-readme-modal-corps" style="padding:18px;">
                <p style="font-size:13px; color:#c0c8d8; line-height:1.5;">
                  Cette liste contient <strong>${stats.total}</strong> plan${stats.total > 1 ? "s" : ""}.<br>
                  ${stats.newOnes > 0 ? '<strong style="color:#8cb4ff;">' + stats.newOnes + '</strong> nouveau(x), ' : ''}
                  ${stats.duplicates > 0 ? '<span style="color:#8892a4;">' + stats.duplicates + ' déjà connu(s)</span>' : ''}
                </p>
                <p style="font-size:13px; color:#e8eaf0; margin-top:14px;">Que voulez-vous faire ?</p>
                <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                  <button class="kta-btn kta-btn-primary" data-mode="replace">🔁 Remplacer ma liste actuelle</button>
                  <button class="kta-btn kta-btn-primary" data-mode="merge">➕ Fusionner (garder les deux)</button>
                  <button class="kta-btn kta-btn-ghost"   data-mode="cancel">Annuler</button>
                </div>
              </div>
            </div>
          `;
          document.body.appendChild(modal);
          modal.querySelectorAll("button").forEach(function(b) {
            b.addEventListener("click", function() {
              const m = b.dataset.mode;
              modal.remove();
              resolve(m === "cancel" ? null : m);
            });
          });
        });
      }

      // === BOUTON 📖 DOCUMENTATION UTILISATEUR ===
      const helpBtn = document.getElementById("loaderHelpBtn");
      if (helpBtn) {
        helpBtn.addEventListener("click", function() {
          if (typeof window.afficherReadme === "function") {
            window.afficherReadme();
          } else {
            setStatus("Documentation indisponible", true);
          }
        });
      }


      // ── Pont B7 : consommé par le flux d'import de homeLoader.js
      window.afficherChoixImportListe = afficherChoixImportListe;
    });
