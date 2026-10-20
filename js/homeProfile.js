/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// HOMEPROFILE.JS — bandeau profil + rangs + hauts faits + stats + modale détails + édition pro
// =========================
// Accueil : bandeau profil (rang, stats choisies), fond d'écran, hauts faits, modale « Détails du profil »
// (stats agrégées de tous les plans, camemberts filtrables par étiquette), section Édition pro.
// Expose : window._persisterStatsPlanCourant, afficherChoixImportListe (pont pour homeLoader.js).
// ⚠️ Chargé SANS defer et enveloppé dans window.addEventListener("load") : l'ordre d'enregistrement des
// listeners (homeLoader → homeProfile → homeConfig) est voulu. Ne pas réordonner.
// 🩸 Blob URL (avatar, fond) : révoquer l'ancienne APRÈS avoir posé la nouvelle, et seul le DERNIER appel
// émis a le droit de commiter (jeton anti-course).
// Dépend de : UserProfile, profileGamification.js, profileAchievements.js, StatsGlobales, PlanRegistry.
    window.addEventListener("load", function () {
      // Statistiques fournies par une extension (prise profilStats, KtaExtensions) : texte seulement,
      // modale « Détails du profil » + choix du bandeau (clé « ext:<cle> »). Vide sans extension.
      let _statsExt = [];
      function _echapStat(s) { return window.ktaEsc(s); }
      async function _relireStatsExt() {
        if (!window.KtaExtensions || typeof window.KtaExtensions.profilStatsExtension !== "function") return;
        try { _statsExt = await window.KtaExtensions.profilStatsExtension(); } catch(e) { _statsExt = []; }
        _renderProfileBarStatsSlots(_getProfileBarStatsKeys());
        _hydrateProfileBarStats();
      }
      window.addEventListener("mktm:extensions-changees", function() { _relireStatsExt(); });
      window.addEventListener("mktm:profil-stats-changees", function() { _relireStatsExt(); });
      async function _initLoaderProfileBar() {
        const bar = document.getElementById("kta-loader-profile-bar");
        if (!bar || !window.UserProfile) return;
        try { await window.UserProfile.init(); } catch(e) {}
        // Slots de stats construits selon les préférences AVANT l'hydratation (sinon conteneur vide).
        _renderProfileBarStatsSlots(_getProfileBarStatsKeys());
        await _refreshLoaderProfileBar();
        bar.style.display = "";  // révèle (default = none)
        await _appliquerFondEcran();
        window.UserProfile.onChange(function() {
          _refreshLoaderProfileBar();
          _appliquerFondEcran();
        });
        // Re-rendu au changement de langue (« Bienvenue, … » et « Mon profil » viennent du dico ; le pseudo, jamais).
        if (window.I18n && window.I18n.onChange) {
          window.I18n.onChange(function() { _refreshLoaderProfileBar(); });
        }
        // Compte d'une installation reliée (KtaExtensions.compte) : la carte se redessine à chaque changement.
        window.addEventListener("mktm:compte-changed", function() { _refreshLoaderProfileBar(); });
        // Une extension arrivée APRÈS le 1er dessin peut couper grades et hauts faits (profilJeu) : le bandeau suit.
        window.addEventListener("mktm:extensions-changees", function() {
          _renderProfileBarStatsSlots(_getProfileBarStatsKeys());
          _refreshLoaderProfileBar();
        });
        // Toute la boîte est cliquable → modale Détails.
        bar.addEventListener("click", function() { _ouvrirModaleProfilDetails(); });
        bar.addEventListener("keydown", function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            _ouvrirModaleProfilDetails();
          }
        });
      }

      // ── Fond d'écran de l'accueil ──────────
      // Deux variables CSS : l'image et l'alpha du voile. La COULEUR du voile vient du CSS par thème : basculer
      // le thème réajuste le voile sans repasser ici.
      // ⚠️ La Blob URL précédente DOIT être révoquée, sinon chaque notification de profil en crée une nouvelle.
      // 🩸 JETON ANTI-COURSE : chaque réglage (voile, cadrage X/Y) déclenche `_notify()`, donc plusieurs
      // `_appliquerFondEcran()` et `_refreshLoaderProfileBar()` qui se chevauchent autour d'une lecture IDB. Un
      // appel ANCIEN qui finit après un récent réécrirait une URL périmée et révoquerait celle affichée (dégât
      // visible au repaint, à la fermeture de la modale). Seul le DERNIER appel émis a le droit de commiter.
      let _wallObjectUrl = null;
      let _wallJeton     = 0;
      async function _appliquerFondEcran() {
        const box = document.getElementById("planLoaderBox");
        if (!box || !window.UserProfile) return;
        // ⚠️ L'IMAGE EST PORTÉE PAR L'OVERLAY, PAS PAR LA BOX. La box est le contenu défilé (2000-3000 px en
        // portrait) : `cover` y rognerait ~88 % de la largeur et le fond défilerait. L'overlay (`position:fixed;
        // inset:0`) a le viewport pour boîte de fond. La classe `.kta-has-wall` reste sur la box (blocs de
        // contraste scopés dessus) ; l'overlay reçoit sa classe miroir.
        const fond = document.getElementById("planLoaderOverlay") || box;
        const monJeton = ++_wallJeton;
        try {
          const snap = window.UserProfile.get();
          // Révocation APRÈS la pose de la nouvelle URL, sinon le fond disparaît le temps de la lecture.
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
          // Appel plus récent passé pendant la lecture : on révoque NOTRE url (jamais affichée), surtout pas
          // l'ancienne, que le gagnant vient d'installer.
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
          // `contain` = image entière ; l'espace restant prend la couleur du voile (se lit comme une image posée
          // sur le fond de l'app).
          fond.style.setProperty("--kta-wall-size", snap.wallFit === "contain" ? "contain" : "cover");
          box.classList.add("kta-has-wall");        // ← blocs de contraste
          fond.classList.add("kta-has-wall-bg");    // ← porteur de l'image
          liberer();
        } catch(e) {
          console.warn("[Profile] fond d'écran non appliqué :", e);
        }
      }

      let _profileBarObjectUrl = null;  // tracker pour révoquer au refresh
      let _barJeton = 0;                // anti-course (cf. _appliquerFondEcran)
      async function _refreshLoaderProfileBar() {
        if (!window.UserProfile) return;
        // Installation reliée à une base : le compte connecté (pseudo + rôle de l'extension) remplace surnom et
        // rang. Rien n'est écrit dans le profil local, qui revient tel quel à la déconnexion. Sans extension : null.
        const _compte = (window.KtaExtensions && typeof window.KtaExtensions.compte === "function")
          ? window.KtaExtensions.compte() : null;
        const snap = Object.assign({}, window.UserProfile.get(), _compte ? { surnom: _compte.pseudo } : {});
        const avatarWrap = document.getElementById("kta-loader-profile-avatar");
        const surnomEl   = document.getElementById("kta-loader-profile-surnom");
        if (!avatarWrap || !surnomEl) return;
        // ⚠️ Jeton incrémenté APRÈS les gardes de sortie : un appel stérile (DOM absent) brûlerait un numéro et
        // ferait abandonner un appel légitime en vol.
        const monJetonBar = ++_barJeton;

        // Anneau de rang (sur le wrap : survit au remplacement du innerHTML) + nom du rang + médaille.
        const _rank = _appliquerRangAvatar(avatarWrap);
        if (!_rank) {
          // Grades coupés par une extension (profilJeu) : ni nom de grade, ni médaille.
          const rankLabelEl = document.getElementById("kta-loader-profile-rank");
          if (rankLabelEl) { rankLabelEl.textContent = ""; rankLabelEl.removeAttribute("data-kta-rank"); }
          const badgeEl = document.getElementById("kta-loader-profile-badge");
          if (badgeEl) { badgeEl.textContent = ""; badgeEl.style.display = "none"; }
        }
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

        if (_compte && _compte.libelle) {
          const rankLabelEl = document.getElementById("kta-loader-profile-rank");
          if (rankLabelEl) { rankLabelEl.textContent = _compte.libelle; rankLabelEl.removeAttribute("data-kta-rank"); }
        }

        // Hauts faits : toast si nouveaux succès. 1er calcul = accord rétroactif silencieux.
        _evalAchievements();

        // 🩸 Stats hydratées AVANT tout le reste et hors await : le bloc photo plus bas peut sortir tôt ou lever,
        // et les valeurs du bandeau resteraient à « — ».
        _hydrateProfileBarStats();

        // Titre « Bienvenue, <pseudo> » (sans pseudo : « Mon profil », l'invitation à le remplir). Le pseudo est une
        // donnée utilisateur, jamais traduite : 🔒 posé par textContent (aucun HTML interprété).
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : null;
        const hasName = !!(snap.surnom && snap.surnom.trim());
        if (hasName) {
          surnomEl.textContent = _t ? _t("home.profile.welcomeName", { pseudo: snap.surnom.trim() }) : snap.surnom;
          surnomEl.classList.remove("kta-loader-profile-surnom-empty");
        } else {
          surnomEl.textContent = _t ? _t("home.profile.placeholder") : "Mon profil";
          surnomEl.classList.add("kta-loader-profile-surnom-empty");
        }
        // Avatar : photo si disponible, sinon initiale colorée.
        // 🩸 On RETIENT l'ancienne URL, on installe la nouvelle, et on ne révoque qu'APRÈS : révoquer avant
        // l'await laisse le <img> sur une URL morte (le « ? » du navigateur), fréquent avec le fond d'écran.
        const _ancienneUrl = _profileBarObjectUrl;
        const _libererAncienne = function() {
          if (_ancienneUrl) { try { URL.revokeObjectURL(_ancienneUrl); } catch(e) {} }
        };
        if (snap.hasPhoto) {
          try {
            const url = await window.UserProfile.getPhotoObjectUrl();
            // Appel dépassé pendant la lecture IDB : on jette NOTRE url (cf. _appliquerFondEcran).
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
        // Pas de photo (ou lecture échouée) : l'initiale remplace le <img>, libération sans risque.
        _profileBarObjectUrl = null;
        _libererAncienne();
        const initial = hasName ? window.UserProfile.getInitial(snap.surnom) : "👤";
        const color   = window.UserProfile.getAvatarColor(snap.surnom || "");
        if (hasName) {
          avatarWrap.innerHTML =
            '<div class="kta-loader-profile-avatar-initial" style="background:' +
              color.bg + '; color:' + color.fg + ';">' + initial + '</div>';
        } else {
          // Vraiment vide : silhouette grise neutre.
          avatarWrap.innerHTML =
            '<div class="kta-loader-profile-avatar-initial kta-loader-profile-avatar-empty">👤</div>';
        }
      }

      // Temps d'app CUMULÉ (toutes sessions) dans `localStorage["myktamap_total_time_ms"]`.
      // 🩸 Le flush n'est PAS sauté quand l'onglet est caché : visibilitychange→hidden arrive AVANT
      // beforeunload/pagehide, et le delta de la session serait perdu. On arrête le comptage par la sentinelle
      // `_timeLastTick = null` ; le flush écrit toujours si le tick est valide ; retour visible → Date.now().
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

      // "12h 34min" / "45min" / "12s"
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

      // Rang selon temps + plans + km, lus dans les compteurs locaux existants ; calcul dans
      // js/profileGamification.js (module pur). km = galeries cartographiées (somme des distM en cache par plan).
      function _collectGamifMetrics() {
        let plans = 0, km = 0, pois = 0, roads = 0, zones = 0, structures = 0, plansGeoref = 0, list = [];
        let hasTracked = false, maxLevels = 0, maxTrackerH = 0;  // (spéciaux)
        try { if (window.PlanRegistry && window.PlanRegistry.getAll) list = window.PlanRegistry.getAll() || []; } catch(e) {}
        try {
          const opened = list.filter(function(p){ return p && p.lastOpened; });
          plans = opened.length || list.length;
        } catch(e) {}
        try {
          list.forEach(function(p){
            if (!p || !p.id) return;
            // Plan géoréférencé = calibration GPS présente (haut fait Géomètre).
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
            // Session scannée pour les spéciaux (tracker, niveaux annotés).
            try {
              const sraw = window.KtaSessionStore.lire(p.id);
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

      // Hauts faits (succès uniques) : détection, persistance, toast. Catalogue et évaluation :
      // js/profileAchievements.js.
      const _ACH_LS_KEY = "myktamap_achievements_v1";
      function _readUnlockedAch() {
        try { const a = JSON.parse(localStorage.getItem(_ACH_LS_KEY)); return (a && typeof a === "object") ? a : {}; }
        catch(e) { return {}; }
      }
      function _writeUnlockedAch(o) { try { localStorage.setItem(_ACH_LS_KEY, JSON.stringify(o)); } catch(e) {} }
      // Grades et hauts faits actifs sauf si une extension les coupe (prise profilJeu : plans de l'organisation
      // qui gonfleraient le grade). Plan d'extension (type « ext ») : contenu de plusieurs auteurs, compté À PART.
      function _estPlanExt(p) { return !!p && p.type === "ext"; }
      function _jeuProfilActif() {
        return !(window.KtaExtensions && typeof window.KtaExtensions.profilJeuActif === "function"
                 && window.KtaExtensions.profilJeuActif() === false);
      }
      function _evalAchievements() {
        if (!window.ProfileAchievements || !_jeuProfilActif()) return;
        // 1er calcul (clé absente) : accord rétroactif SANS toast.
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

      // Grille des hauts faits de la modale Détails (8 familles × 4 paliers).
      function _hydrateProfileFeats() {
        const box = document.getElementById("kta-profile-details-feats");
        if (!box || !window.ProfileAchievements) return;
        if (!_jeuProfilActif()) { box.innerHTML = ""; box.style.display = "none"; return; }
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

      // Anneau de rang sur un conteneur d'avatar (data-kta-rank lu par le CSS).
      function _appliquerRangAvatar(wrapEl) {
        if (!wrapEl || !window.ProfileGamification) return null;
        if (!_jeuProfilActif()) { wrapEl.removeAttribute("data-kta-rank"); wrapEl.removeAttribute("title"); return null; }
        try {
          const rank = window.ProfileGamification.computeRank(_collectGamifMetrics());
          wrapEl.setAttribute("data-kta-rank", rank.id);
          wrapEl.setAttribute("title", window.ProfileGamification.label(rank));
          return rank;
        } catch(e) { return null; }
      }

      // Bloc rang de la modale Détails (puce, métriques, progression, score).
      function _hydrateProfileRank() {
        const box = document.getElementById("kta-profile-details-rank");
        if (!box || !window.ProfileGamification) return;
        if (!_jeuProfilActif()) { box.innerHTML = ""; box.style.display = "none"; return; }
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
          // Rang affiché venu de l'Easter egg (pseudo → Légende) : on garde le rang réellement mérité.
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

      // Stats du bandeau d'accueil, au choix : PROFILE_BAR_STATS = pool disponible ;
      // `myktamap_loader_bar_stats_v1` = clés choisies (défaut ["time", "storage"]) ;
      // _renderProfileBarStatsSlots construit le DOM, _hydrateProfileBarStats remplit les slots présents.
      // ⚠️ i18n : on stocke des clés (titleKey) résolues AU RENDU, jamais au chargement.
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
        // Score + nombre de hauts faits débloqués.
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

      // Une clé du bandeau s'affiche si elle a encore un sens : score / hauts faits si le jeu est actif (profilJeu),
      // « ext:<clé> » si l'extension fournit la stat. La préférence n'est pas réécrite : la stat revient seule.
      function _cleBandeauUtilisable(k) {
        if (typeof k !== "string") return false;
        if (k.indexOf("ext:") === 0) return _statsExt.some(function(x) { return "ext:" + x.cle === k; });
        if ((k === "score" || k === "feats") && !_jeuProfilActif()) return false;
        return !!PROFILE_BAR_STATS[k];
      }
      function _getProfileBarStatsKeys() {
        try {
          const raw = localStorage.getItem(PROFILE_BAR_STATS_LS_KEY);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length > 0) {
              // Clés valides seulement, puis plafond.
              const filtered = arr.filter(_cleBandeauUtilisable);
              if (filtered.length) return filtered.slice(0, PROFILE_BAR_STATS_MAX);
            }
          }
        } catch(e) {}
        return ["time", "storage"];
      }
      function _setProfileBarStatsKeys(arr) {
        try { localStorage.setItem(PROFILE_BAR_STATS_LS_KEY, JSON.stringify(arr)); } catch(e) {}
      }

      function _renderProfileBarStatsSlots(keys) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const wrap = document.getElementById("kta-loader-profile-stats");
        if (!wrap) return;
        wrap.innerHTML = "";
        keys.forEach(function(k) {
          const ext = k.indexOf("ext:") === 0 ? _statsExt.find(function(x) { return "ext:" + x.cle === k; }) : null;
          const cfg = ext ? { icon: ext.icone, titre: ext.titre || ext.libelle } : PROFILE_BAR_STATS[k];
          if (!cfg) return;
          const div = document.createElement("div");
          div.className = "kta-loader-profile-stat";
          div.id = "kta-loader-profile-stat-" + k.replace(/[^\w-]/g, "_");
          div.title = cfg.titre != null ? cfg.titre : _t(cfg.titleKey);
          div.dataset.statKey = k;
          // Texte seulement : une stat d'extension n'est jamais du HTML.
          const ic = document.createElement("span"); ic.className = "kta-loader-profile-stat-icon"; ic.textContent = cfg.icon;
          const val = document.createElement("span"); val.className = "kta-loader-profile-stat-val"; val.textContent = "—";
          div.appendChild(ic); div.appendChild(val);
          wrap.appendChild(div);
        });
      }

      // "12 KB" / "1.2 MB" / "234 MB"
      function _formatBytesShort(n) {
        if (n == null || isNaN(n)) return "—";
        const num = Number(n);
        if (num < 1024)            return num + " B";
        if (num < 1024 * 1024)     return (num / 1024).toFixed(0) + " KB";
        if (num < 1024 * 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + " MB";
        return (num / (1024 * 1024 * 1024)).toFixed(2) + " GB";
      }

      // 🩸 Taille calculée sur les SOURCES MYKTAMAP seulement, pas navigator.storage.estimate() (qui inclut le
      // cache PWA, volatil, et fait fluctuer la valeur) :
      //   - clés localStorage "myktamap_" / "kta_" / "app_user_prefs"
      //   - stores IDB connus (handles/blobs, sauvegardes, photos, profil, crashes, sessions, Carnet, PDF)
      //   - autres bases "kta_…" / "myktamap…" de l'origine (extension, cache de tuiles), découvertes par
      //     indexedDB.databases() quand le navigateur l'offre.
      // ZIP des plans d'extension mesurés à part au même passage (« dont ☁️ »). Cache mémoire 30 s.
      let _storageCalcCache = null;  // { ts: number, bytes: number, extBytes: number }
      const _STORAGE_CACHE_MS = 30000;
      const _IDB_STORES = [
        { db: "myktamap_handles", store: "handles", blobFields: [] },
        // ext: true → les ZIP rangés sous l'id d'un plan d'extension sont aussi cumulés à part.
        { db: "myktamap_handles", store: "blobs",   blobFields: ["blob"], ext: true },
        { db: "myktamap_backups", store: "backups", blobFields: [] },
        // Sessions auto-sauvegardées (js/sessionStore.js).
        { db: "myktamap_sessions", store: "sessions", blobFields: [] },
        { db: "myktamap_photos",  store: "photos",  blobFields: ["blob"] },
        { db: "myktamap_profile", store: "profile", blobFields: ["photoBlob", "wallBlob"] },
        { db: "myktamap_crashes", store: "crashes", blobFields: [] },
        // Le Carnet (js/journal.js).
        { db: "myktamap_journal", store: "sorties", blobFields: [] },
        // Documents PDF du Mode Histoire.
        { db: "myktamap_histoire_pdfs", store: "pdfs", blobFields: ["blob"] }
      ];

      // Ouvre une base IDB en lecture SANS la garder si elle n'existait pas : indexedDB.open(name) sans version
      // la crée vide, l'upgrade le révèle et on la supprime (databases() manque sur Safari).
      function _openIdbReadOnly(dbName) {
        return new Promise(function(resolve) {
          let upgradeNeeded = false;
          const req = indexedDB.open(dbName);
          req.onupgradeneeded = function() { upgradeNeeded = true; };
          req.onsuccess = function() {
            const db = req.result;
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

      // Parcourt un store IDB et cumule les octets (Blobs + métadonnées JSON). 🩸 Trois formes de valeur :
      //   1. la valeur EST un Blob (`store.put(blob, id)` de myktamap_handles) ;
      //   2. objet enveloppe (champs Blob déclarés) ;
      //   3. objet opaque (FileSystemHandle) → ~200 octets forfaitaires.
      // blobFields === null : base inconnue (extension) → champs Blob de 1er niveau détectés valeur par valeur.
      // acc (facultatif) : { ids: { <idPlan>: true }, ext: 0 } — cumule à part les valeurs d'un plan ext.
      function _accStoreBytes(db, storeName, blobFields, acc) {
        const auto = blobFields === null;
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
              const avant = total;
              if (auto) {
                blobFields = [];
                try { for (const k in val) { if (val[k] instanceof Blob) blobFields.push(k); } } catch(e) {}
              }
              try {
                if (typeof cur.key === "string") total += cur.key.length * 2;
              } catch(e) {}
              if (val) {
                // 1. La valeur EST un Blob (saveBlob : store.put(blob, id)).
                if (val instanceof Blob) {
                  total += val.size || 0;
                } else if (typeof val.kind === "string"
                           && (val.kind === "file" || val.kind === "directory")) {
                  // 3. FileSystemHandle : pas de .size, objet léger.
                  total += 200;  // estimation flat (metadata interne navigateur)
                } else {
                  // 2. Enveloppe : .size réel des champs Blob déclarés.
                  let blobBytes = 0;
                  for (let i = 0; i < blobFields.length; i++) {
                    const f = blobFields[i];
                    if (val[f] && typeof val[f].size === "number"
                        && typeof val[f].type === "string") {
                      blobBytes += val[f].size;
                    }
                  }
                  // Reste : JSON.stringify (UTF-16 = ×2), champs Blob déjà comptés exclus.
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
              if (acc && typeof cur.key === "string" && acc.ids[cur.key]) acc.ext += total - avant;
              cur.continue();
            };
            req.onerror = function() { resolve(total); };
          } catch(e) { resolve(total); }
        });
      }

      async function _calculerStorageMyktamapBytes() {
        let total = 0;
        // 1. localStorage propre à MyKTAMap.
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
        const acc = { ids: {}, ext: 0 };
        try {
          const reg = (window.PlanRegistry && window.PlanRegistry.getAll) ? (window.PlanRegistry.getAll() || []) : [];
          reg.forEach(function(p) { if (_estPlanExt(p) && p.id) acc.ids[p.id] = true; });
        } catch(e) {}
        // Bases présentes, quand le navigateur sait les lister (sinon null → les connues seules). Une base connue
        // absente de la liste n'est pas ouverte (pas de création-suppression à vide).
        let presentes = null;
        try {
          if (typeof indexedDB.databases === "function") {
            presentes = (await indexedDB.databases()).map(function(d) { return d && d.name; }).filter(Boolean);
          }
        } catch(e) { presentes = null; }
        // 2. Stores IDB MyKTAMap (lecture seule, base absente ignorée).
        const seenDbs = {};
        async function _ouvrir(nom) {
          if (seenDbs[nom] === undefined) {
            seenDbs[nom] = (presentes && presentes.indexOf(nom) < 0) ? null : await _openIdbReadOnly(nom);
          }
          return seenDbs[nom];  // peut être null
        }
        for (let i = 0; i < _IDB_STORES.length; i++) {
          const spec = _IDB_STORES[i];
          try {
            const db = await _ouvrir(spec.db);
            if (!db) continue;
            const bytes = await _accStoreBytes(db, spec.store, spec.blobFields, spec.ext ? acc : null);
            total += bytes;
          } catch(e) {}
        }
        // 2bis. Autres bases "kta_…" / "myktamap…" (extension, caches) : tous leurs stores, champs Blob détectés à
        // la volée. Seulement des bases LISTÉES par le navigateur → jamais de création.
        if (presentes) {
          const connues = {};
          _IDB_STORES.forEach(function(sp) { connues[sp.db] = true; });
          const autres = presentes.filter(function(n) {
            return !connues[n] && (n.indexOf("kta_") === 0 || n.indexOf("myktamap") === 0);
          });
          for (let j = 0; j < autres.length; j++) {
            try {
              const db = await _ouvrir(autres[j]);
              if (!db) continue;
              const stores = Array.prototype.slice.call(db.objectStoreNames);
              for (let k = 0; k < stores.length; k++) total += await _accStoreBytes(db, stores[k], null);
            } catch(e) {}
          }
        }
        for (const dbName in seenDbs) {
          const db = seenDbs[dbName];
          if (db) { try { db.close(); } catch(e) {} }
        }
        return { bytes: total, extBytes: acc.ext };
      }

      async function _getStorageMyktamapCached(forceRefresh) {
        const now = Date.now();
        if (!forceRefresh && _storageCalcCache && (now - _storageCalcCache.ts) < _STORAGE_CACHE_MS) {
          return _storageCalcCache.bytes;
        }
        const r = await _calculerStorageMyktamapBytes();
        _storageCalcCache = { ts: now, bytes: r.bytes, extBytes: r.extBytes };
        return r.bytes;
      }
      // Part des ZIP de plans d'extension dans le dernier calcul (0 sans plan ext), mise en cache par
      // _getStorageMyktamapCached() au même passage.
      function _storageExtBytes() { return (_storageCalcCache && _storageCalcCache.extBytes) || 0; }

      // Hydrate les slots PRÉSENTS dans le DOM (data-stat-key) : une stat ajoutée au pool ne touche pas cette fonction.
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
              // La mémoire des SESSIONS (localStorage, ~5 Mo par site) peut être pleine alors que le total reste
              // modeste : signalé ici (⚠️ + infobulle), détail dans « Détails de la session ».
              const S = window.ktaStockageLocal;
              const mem = S ? S.mesurer() : null;
              const alerte = mem && mem.ratio >= S.SEUIL_ALERTE;
              valEl.textContent = _formatBytesShort(bytes) + (alerte ? " ⚠️" : "");
              // Part des plans d'extension : dans l'infobulle seulement, la valeur reste le total.
              const ext = _storageExtBytes();
              const titreBase = window.I18n.t("home.profile.stats.storageTitle");
              slot.title = ext ? titreBase + " — " + window.I18n.t("home.profile.stats.dontExt",
                { taille: _formatBytesShort(ext) }) : titreBase;
              if (alerte) {
                slot.title = window.I18n.t("home.profile.stats.memoireAlerte",
                  { pct: Math.min(100, Math.round(mem.ratio * 100)), occupe: S.mo(mem.car), limite: S.mo(mem.limite) });
              }
            } catch(e) {
              valEl.textContent = "—";
            }
          } else if (key === "plans") {
            try {
              let arr = (window.PlanRegistry && typeof window.PlanRegistry.getAll === "function")
                        ? (window.PlanRegistry.getAll() || [])
                        : [];
              // Pref skipServer active : plans serveur exclus du compte.
              if (typeof window._loaderSkipServerPlans === "function" && window._loaderSkipServerPlans()) {
                arr = arr.filter(function(p) { return p.type !== "server"; });
              }
              valEl.textContent = arr.filter(function(p) { return !_estPlanExt(p); }).length;
            } catch(e) {
              valEl.textContent = "—";
            }
          } else if (key.indexOf("ext:") === 0) {
            const st = _statsExt.find(function(x) { return "ext:" + x.cle === key; });
            valEl.textContent = st ? st.valeur : "—";
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

      // ── Modale « Détails du profil » ──────────
      // Surnom éditable en place, photo (input caché), stats agrégées, export / import / réinitialisation.
      function _ouvrirModaleProfilDetails() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const ex = document.getElementById("kta-profile-details-modal");
        if (ex) ex.parentNode.removeChild(ex);

        if (!window.UserProfile) {
          window.ktaAlerte(_t("home.profile.moduleUnavailable"), { type: "erreur" });
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
              '</div>' +

              '<div class="kta-profile-details-rank" id="kta-profile-details-rank"></div>' +

              '<div class="kta-profile-details-feats" id="kta-profile-details-feats"></div>' +

              '<div class="kta-profile-details-stats" id="kta-profile-details-stats">' +
                '<div class="kta-profile-details-stats-loading">' + _t("home.profile.statsLoading") + '</div>' +
              '</div>' +

              // Choix des stats du bandeau d'accueil, plafond 3 (PROFILE_BAR_STATS_MAX) pour rester lisible sur mobile.
              '<div class="kta-profile-barstats">' +
                '<div class="kta-profile-barstats-header">' + _t("home.profile.barStatsHeader") + '</div>' +
                '<p class="kta-profile-barstats-hint">' +
                  _t("home.profile.barStatsHint") +
                '</p>' +
                '<div class="kta-profile-barstats-options" id="kta-profile-barstats-options">' +
                  '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="time"> <span>' + _t("home.profile.statTime") + '</span></label>' +
                  '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="storage"> <span>' + _t("home.profile.statStorage") + '</span></label>' +
                  '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="plans"> <span>' + _t("home.profile.statPlans") + '</span></label>' +
                  (_jeuProfilActif()
                    ? '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="score"> <span>' + _t("home.profile.statScore") + '</span></label>' +
                      '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="feats"> <span>' + _t("home.profile.statFeats") + '</span></label>'
                    : '') +
                  _statsExt.map(function(x) {
                    return '<label class="kta-profile-barstats-cb"><input type="checkbox" data-bar-stat-key="ext:' + _echapStat(x.cle) + '"> <span>' +
                      _echapStat(x.icone + " " + x.libelle) + '</span></label>';
                  }).join("") +
                '</div>' +
              '</div>' +

              // Édition pro : affichée SEULEMENT quand l'installation sert sa licence (source serveur). Aucun
              // import ni retrait par l'utilisateur.
              '<div class="kta-profile-pro-section" id="kta-profile-pro-section" hidden>' +
                '<div class="kta-profile-pro-header">💼 ' + window.I18n.t("home.splash.proEdition") + '</div>' +
                '<div class="kta-profile-pro-body" id="kta-profile-pro-body">' +
                  '<div class="kta-profile-pro-loading">⏳…</div>' +
                '</div>' +
              '</div>' +

              // Fond d'écran, juste avant les actions : c'est de la déco, elle ne s'intercale pas entre l'identité
              // et les stats/rang qui se lisent d'affilée.
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
                '</div>' +
                '<p class="kta-profile-details-hint">' + _t("home.profile.wallHint") + '</p>' +
              '</div>' +

              '<div class="kta-profile-details-actions">' +
                '<button type="button" class="kta-btn kta-btn-primary" id="kta-profile-details-export">' + _t("home.profile.exportBtn") + '</button>' +
                // 🔒 En kiosque `serverPlansOnly`, l'import est refusé (cf. profileExportImport) : pas affiché.
                // L'export reste.
                ((typeof window.ktaKiosqueServeurSeul === "function" && window.ktaKiosqueServeurSeul())
                  ? ""
                  : '<button type="button" class="kta-btn kta-btn-secondary" id="kta-profile-details-import">' + _t("home.profile.importBtn") + '</button>') +
                '<button type="button" class="kta-btn kta-btn-danger" id="kta-profile-details-reset">' + _t("home.profile.resetBtn") + '</button>' +
              '</div>' +

              '<p class="kta-profile-details-footer-hint">' +
                _t("home.profile.exportFooterHint") +
              '</p>' +
            '</div>' +
          '</div>';
        document.documentElement.appendChild(overlay);

        _refreshProfileDetailsAvatar(snap);
        _hydrateProfileRank();  // bloc rang (puce + métriques + progression)
        _evalAchievements();
        _hydrateProfileFeats();  // grille des hauts faits

        _refreshProfileDetailsStats();

        _refreshProfileProSection();

        const closeFn = function() {
          const m = document.getElementById("kta-profile-details-modal");
          if (m) m.parentNode.removeChild(m);
          document.removeEventListener("keydown", escFn);
          // Resynchronisation de l'accueil à la fermeture : il DOIT refléter l'état final sans dépendre du
          // timing (le jeton règle les chevauchements, ceci rend le symptôme impossible par construction).
          // Fonctions async : un try ne voit pas leur rejet, le .catch si.
          _refreshLoaderProfileBar().catch(function() {});
          _appliquerFondEcran().catch(function() {});
        };
        const escFn = function(e) { if (e.key === "Escape" || e.key === "Esc") closeFn(); };
        document.getElementById("kta-profile-details-close").addEventListener("click", closeFn);
        overlay.addEventListener("click", function(e) { if (e.target === overlay) closeFn(); });
        document.addEventListener("keydown", escFn);

        // Cases « Stats du bandeau » : plafond PROFILE_BAR_STATS_MAX (3), au moins 1. Chaque changement sauve,
        // re-rend le bandeau et réhydrate.
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
            if (checked.length > PROFILE_BAR_STATS_MAX) {
              e.target.checked = false;
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(_t("home.profile.barStatsMax", { n: PROFILE_BAR_STATS_MAX }), "warn");
              }
              return;
            }
            if (checked.length === 0) {
              e.target.checked = true;
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(_t("home.profile.barStatsMin"), "warn");
              }
              return;
            }
            const keys = allCbs.filter(function(c) { return c.checked; })
                               .map(function(c) { return c.dataset.barStatKey; });
            _setProfileBarStatsKeys(keys);
            _renderProfileBarStatsSlots(keys);
            _hydrateProfileBarStats();
          }
          cbs.forEach(function(cb) { cb.addEventListener("change", _onChange); });
        })();

        const surnomInput = document.getElementById("kta-profile-details-surnom");
        const saveBtn     = document.getElementById("kta-profile-details-save-name");
        // Compte connecté : le pseudo vient du compte, non modifiable ici.
        const _compteModale = (window.KtaExtensions && typeof window.KtaExtensions.compte === "function")
          ? window.KtaExtensions.compte() : null;
        if (_compteModale) {
          surnomInput.value = _compteModale.pseudo;
          surnomInput.readOnly = true;
          surnomInput.title = _t("home.profile.nicknameAccount");
          const hint = surnomInput.closest(".kta-profile-details-name-row");
          const p = hint && hint.nextElementSibling;
          if (p && p.classList.contains("kta-profile-details-hint")) p.textContent = _t("home.profile.nicknameAccount");
        }
        // Compte de l'installation : APRÈS photo et pseudo, AVANT le grade, avec ses actions (gestion, hors
        // ligne, données perso, déconnexion — fournies par l'extension).
        if (window.KtaExtensions && typeof window.KtaExtensions.blocActionsCompte === "function") {
          const blocCompte = window.KtaExtensions.blocActionsCompte("profil", _t("home.profile.compteTitre"));
          const grade = document.getElementById("kta-profile-details-rank");
          if (blocCompte && grade && grade.parentNode) grade.parentNode.insertBefore(blocCompte, grade);
        }
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
            window.ktaAlerte(_t("home.profile.errGeneric") + (e.message || e), { type: "erreur" });
            saveBtn.disabled = false;
            saveBtn.textContent = _t("home.profile.saveName");
          }
        });
        surnomInput.addEventListener("keydown", function(e) {
          if (e.key === "Enter") { e.preventDefault(); if (saveBtn.style.display !== "none") saveBtn.click(); }
        });

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
            window.ktaAlerte(_t("home.profile.errPhotoUpload") + (e.message || e), { type: "erreur" });
            photoBtn.textContent = _t("home.profile.photoBtn");
          }
          photoBtn.disabled = false;
          photoInput.value = "";
        });
        removeBtn.addEventListener("click", async function() {
          if (!(await window.ktaConfirm(_t("home.profile.confirmRemovePhoto")))) return;
          try {
            await window.UserProfile.removePhoto();
            const snap2 = window.UserProfile.get();
            _refreshProfileDetailsAvatar(snap2);
            removeBtn.style.display = "none";
            photoBtn.textContent = _t("home.profile.photoBtn");
          } catch(e) { window.ktaAlerte(_t("home.profile.errGeneric") + (e.message || e), { type: "erreur" }); }
        });

        // Export / import : ProfileExportImport + le sélecteur déjà présent (#importListFile).
        document.getElementById("kta-profile-details-export").addEventListener("click", function() {
          if (window.ProfileExportImport && window.ProfileExportImport.ouvrirExportModale) {
            window.ProfileExportImport.ouvrirExportModale();
          } else {
            window.ktaAlerte(_t("home.profile.errExportModule"), { type: "erreur" });
          }
        });
        // 🩸 Le bouton n'existe pas en kiosque : sans ce test, addEventListener sur null lève et tue tout le
        // câblage qui suit.
        const _btnImp = document.getElementById("kta-profile-details-import");
        if (_btnImp) {
          _btnImp.addEventListener("click", function() {
            const fileInput = document.getElementById("importListFile");
            if (fileInput) fileInput.click();
          });
        }

        // Fond d'écran : l'aperçu montre l'image AVEC son voile et son cadrage, comme le vrai fond (une image
        // belle nue peut être illisible voilée).
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

        const wallFit = document.getElementById("kta-wall-fit");
        const _peindreApercu = function(url, voile, posX, posY, fit) {
          const a = voile / 100;
          const clair = document.body.classList.contains("kta-theme-light");
          const rgb = clair ? "201,184,143" : "26,31,46";
          wallPreview.style.backgroundImage =
            'linear-gradient(rgba(' + rgb + ',' + a + '), rgba(' + rgb + ',' + a + ')), url("' + url + '")';
          wallPreview.style.backgroundPosition = posX + "% " + posY + "%";
          // Même mode d'affichage que le vrai fond.
          wallPreview.style.backgroundSize = (fit === "contain") ? "contain" : "cover";
        };
        const _fitCourant = function() { return wallFit ? wallFit.value : "cover"; };

        const _rafraichirApercuFond = async function() {
          const s = window.UserProfile.get();
          // Révocation différée après remplacement (cf. avatar).
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
          // ⚠️ `_wallPreviewUrl = null` INDISPENSABLE : sinon les handlers `input` des curseurs repeignent
          // l'aperçu avec l'URL qu'on vient de révoquer.
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

        // Cadrage : `input` = aperçu live, `change` = persistance au relâchement (pas une écriture IDB par pixel).
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
            window.ktaAlerte(_t("home.profile.errGeneric") + (e.message || e), { type: "erreur" });
          } finally {
            wallBtn.disabled = false;
            wallBtn.textContent = label;
            wallInput.value = "";   // re-sélectionner le MÊME fichier doit refonctionner
          }
        });
        wallRemove.addEventListener("click", async function() {
          try { await window.UserProfile.removeWallpaper(); await _rafraichirApercuFond(); }
          catch(e) { window.ktaAlerte(_t("home.profile.errGeneric") + (e.message || e), { type: "erreur" }); }
        });
        // `input` = aperçu live ; `change` = persistance au relâchement seulement.
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

        // Mode d'affichage : un seul événement (un <select> ne se glisse pas).
        // ⚠️ Les curseurs de cadrage restent ACTIFS en mode Entière : ils choisissent alors OÙ l'image se pose
        // dans le cadre.
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

        // Réinitialisation du profil : modale charte (Promise, accent rouge).
        document.getElementById("kta-profile-details-reset").addEventListener("click", async function() {
          const ok = await _confirmResetProfilModale();
          if (!ok) return;
          try {
            await window.UserProfile.clear();
            const snap2 = window.UserProfile.get();
            surnomInput.value = "";
            _originalSurnom = "";
            saveBtn.style.display = "none";
            removeBtn.style.display = "none";
            photoBtn.textContent = _t("home.profile.photoBtn");
            _refreshProfileDetailsAvatar(snap2);
            // `clear()` efface aussi le fond : l'aperçu suit.
            await _rafraichirApercuFond();
          } catch(e) { window.ktaAlerte(_t("home.profile.errGeneric") + (e.message || e), { type: "erreur" }); }
        });
      }

      // Confirmation de réinitialisation (résout true / false). Z-index 100001 : au-dessus de la modale
      // « Détails du profil » (99999).
      function _confirmResetProfilModale() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        return new Promise(function(resolve) {
          // Anti-empilement.
          const ex = document.getElementById("kta-profile-reset-confirm-modal");
          if (ex && ex.parentNode) ex.parentNode.removeChild(ex);

          const overlay = document.createElement("div");
          overlay.id = "kta-profile-reset-confirm-modal";
          overlay.className = "kta-readme-modal-overlay";
          overlay.style.zIndex = "100001";  // au-dessus de la modale parente
          overlay.innerHTML =
            '<div class="kta-readme-modal-boite" style="max-width:440px; height:auto !important; max-height:88vh !important; border-color:rgba(255,140,140,0.55); box-shadow:0 0 24px rgba(255,140,140,0.18);">' +
              '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,140,140,0.25);">' +
                '<span class="kta-readme-modal-titre" style="color:var(--kta-erreur);">' + _t("home.profile.resetTitle") + '</span>' +
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

          // Focus sur « Annuler » (choix sûr).
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
        // Anneau de rang + médaille de coin (comme l'accueil).
        const _dRank = _appliquerRangAvatar(avatarEl);
        const _dBadge = document.getElementById("kta-profile-details-badge");
        if (_dBadge && !_dRank) { _dBadge.textContent = ""; _dBadge.style.display = "none"; }
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
        // Même règle que le bandeau : révoquer APRÈS le remplacement, jamais avant l'await.
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

      // ── Section « Édition pro » de la modale profil ──────────
      // État de la licence pro (cf. js/proLicense.js), source serveur seule.
      // Tronque un hash pour affichage compact (ex :
      // "MKTM-LIC-abc123..." → "MKTM-LIC-abc1…3456").
      function _proHashShort(hash) {
        if (typeof hash !== "string") return "";
        if (hash.length <= 18) return hash;
        return hash.slice(0, 13) + "…" + hash.slice(-4);
      }

      function _proSourceLabel(source) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        if (source === "server") return _t("home.profile.pro.sourceServer");
        return "—";
      }
      function _proSourceHint() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        return _t("home.profile.pro.hintServer");
      }

      // Section visible seulement avec une licence SERVEUR (installation pro) ; masquée sinon.
      function _refreshProfileProSection() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const section = document.getElementById("kta-profile-pro-section");
        const body = document.getElementById("kta-profile-pro-body");
        if (!section || !body) return;
        const lic = window.MyKTAMapProLicense;
        const actif = !!(lic && lic.isPro() && lic.getSource() === "server");
        section.hidden = !actif;
        if (!actif) { body.innerHTML = ""; return; }
        body.innerHTML =
          '<div class="kta-profile-pro-status kta-profile-pro-status-active">' +
            '<span class="kta-profile-pro-badge">' + _t("home.profile.pro.badgeActive") + '</span>' +
          '</div>' +
          '<p class="kta-profile-pro-hint">' + _proSourceHint() + '</p>';
      }

      async function _refreshProfileDetailsStats() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const statsEl = document.getElementById("kta-profile-details-stats");
        if (!statsEl) return;
        // Stats de l'extension relues à l'ouverture : la liste des plans de l'installation arrive souvent APRÈS
        // le dernier événement.
        await _relireStatsExt();
        // Liste des plans filtrée selon skipServerPlans, même source que le bandeau (PlanRegistry.getAll) ;
        // plans d'extension comptés À PART (_plansExtCount).
        let _plansExtCount = [];
        function _getPlansFiltered() {
          let plans = [];
          try { plans = (window.PlanRegistry && window.PlanRegistry.getAll) ? (window.PlanRegistry.getAll() || []) : []; } catch(e) {}
          _plansExtCount = plans.filter(_estPlanExt);
          plans = plans.filter(function(p) { return !_estPlanExt(p); });
          if (typeof window._loaderSkipServerPlans === "function"
              && window._loaderSkipServerPlans()) {
            plans = plans.filter(function(p) { return p.type !== "server"; });
          }
          return plans;
        }
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
        try { nbSessions = window.KtaSessionStore.ids().length; } catch(e) {}
        if (window.SessionBackups && window.SessionBackups.listAll) {
          try { const arr = await window.SessionBackups.listAll(); nbBackups = arr.length; } catch(e) {}
        }
        // Photos POI (nombre + octets), sur la liste FILTRÉE (cohérent avec nbPlans).
        let nbPhotos = 0, photosBytes = 0, nbPhotosExt = 0;
        if (window.MyKTAMapPhotos && window.MyKTAMapPhotos.getAllPhotosForPlan) {
          try {
            for (const p of _plansForCount.concat(_plansExtCount)) {
              if (!p.id) continue;
              const photos = await window.MyKTAMapPhotos.getAllPhotosForPlan(p.id);
              if (!Array.isArray(photos)) continue;
              if (_estPlanExt(p)) { nbPhotosExt += photos.length; continue; }
              nbPhotos += photos.length;
              photos.forEach(function(ph) { photosBytes += (ph.size || 0); });
            }
          } catch(e) {}
        }
        function _fmtBytes(n) {
          if (!n) return "0 B";
          if (n < 1024) return n + " B";
          if (n < 1024*1024) return (n/1024).toFixed(1) + " KB";
          return (n/1048576).toFixed(1) + " MB";
        }
        // Taille totale MyKTAMap (même valeur que la stat 💾 du bandeau).
        let storageTotalBytes = 0;
        try {
          storageTotalBytes = await _getStorageMyktamapCached();
        } catch(e) {}
        const storageExtBytes = _storageExtBytes();  // ZIP des plans ☁️ (inclus dans le total)
        statsEl.innerHTML =
          '<div class="kta-profile-stat-grid">' +
            '<div class="kta-profile-stat-cell"><span class="kta-profile-stat-num">' + nbPlans + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblPlans") + '</span></div>' +
            (_plansExtCount.length ? '<div class="kta-profile-stat-cell" title="' + _t("home.profile.stats.plansExtTitle") + '"><span class="kta-profile-stat-num">' + _plansExtCount.length + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblPlansExt") + '</span></div>' : '') +
            '<div class="kta-profile-stat-cell"><span class="kta-profile-stat-num">' + nbSessions + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblSessions") + '</span></div>' +
            '<div class="kta-profile-stat-cell"><span class="kta-profile-stat-num">' + nbFavoris + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblFavorites") + '</span></div>' +
            '<div class="kta-profile-stat-cell"><span class="kta-profile-stat-num">' + nbBackups + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblSnapshots") + '</span></div>' +
            '<div class="kta-profile-stat-cell"><span class="kta-profile-stat-num">' + nbPhotos + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblPhotos") + ' (' + _fmtBytes(photosBytes) + ')' + (nbPhotosExt ? ' · ☁️ ' + nbPhotosExt : '') + '</span></div>' +
            '<div class="kta-profile-stat-cell" title="' + _t("home.profile.stats.totalTitle") + '"><span class="kta-profile-stat-num kta-profile-stat-num-bytes">' + _fmtBytes(storageTotalBytes) + '</span><span class="kta-profile-stat-lbl">' + _t("home.profile.stats.lblStorage") + (storageExtBytes ? ' · ' + _t("home.profile.stats.dontExt", { taille: _fmtBytes(storageExtBytes) }) : '') + '</span></div>' +
          '</div>' +
          (_statsExt.length
            ? '<div class="kta-profile-extstats">' +
                '<div class="kta-profile-barstats-header">' + _t("home.profile.stats.extTitle") + '</div>' +
                '<div class="kta-profile-stat-grid">' +
                  _statsExt.map(function(x) {
                    return '<div class="kta-profile-stat-cell" title="' + _echapStat(x.titre || x.libelle) + '">' +
                      '<span class="kta-profile-stat-num">' + _echapStat(x.valeur) + '</span>' +
                      '<span class="kta-profile-stat-lbl">' + _echapStat(x.icone + " " + x.libelle) + '</span></div>';
                  }).join("") +
                '</div>' +
              '</div>'
            : '') +
          // Stats de tous les plans sans les ouvrir. 🩸 Calcul SÉQUENTIEL plan par plan : tout d'un coup ferait
          // planter. Squelette rendu d'abord, `_calculerStatsPlansAggregees` remplit le tbody au fil de l'eau.
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
          '</div>';

        // Calcul agrégé séquentiel, hors du innerHTML synchrone.
        _calculerStatsPlansAggregees();
      }

      // Stats complètes d'un plan = session + calques de données embarqués. Plan COURANT : registres en mémoire
      // (_ktaDataMarkers/Polylines/Polygons/StructurePolygons, peuplés par utils.js > ajouterPointsDepuisJSON).
      // Autres plans : cache `myktamap_plan_stats_v1_<id>` écrit par _persisterStatsPlanCourant.
      // Format : { pois, roads, distPx, nbPolys, ts, source: "live" } (distPx en pixels du plan).
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

      // { clé: nombre } depuis un tableau d'objets typés (camemberts par catégorie).
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
      // 1er tag d'un point ("default" sinon).
      function _firstTagOf(p) {
        if (Array.isArray(p.tags) && p.tags.length > 0) return p.tags[0];
        return "default";
      }
      // Fusionne { clé: nombre } dans target (mutation).
      function _mergeBreakdown(target, src) {
        if (!src || typeof src !== "object") return target;
        Object.keys(src).forEach(function(k) {
          target[k] = (target[k] || 0) + (src[k] || 0);
        });
        return target;
      }

      function _computePlanStatsLive() {
        // Session (getters) + embarqué (registres en mémoire) : le plan courant a tout.
        const editorPts   = (typeof window.getEditorPoints === "function") ? (window.getEditorPoints() || []) : [];
        const embedPts    = (typeof window.getAllEmbeddedPoints === "function") ? (window.getAllEmbeddedPoints() || []) : [];
        const sessRoads   = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
        const embedRoads  = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : [];
        const sessZones   = (typeof window.getZones === "function") ? (window.getZones() || []) : [];
        const embedZones  = (typeof window.getAllEmbeddedZones === "function") ? (window.getAllEmbeddedZones() || []) : [];
        const sessStructs = (typeof window.getStructures === "function") ? (window.getStructures() || []) : [];
        const embedStructs = (typeof window.getAllEmbeddedStructures === "function") ? (window.getAllEmbeddedStructures() || []) : [];

        const pointsByTag = _countBy(editorPts.concat(embedPts), _firstTagOf);
        const roadsByType = _countBy(sessRoads.concat(embedRoads), function(r) { return r.type || "principal"; });
        const zonesByType = _countBy(sessZones.concat(embedZones), function(z) { return z.type || "remblais"; });
        const structsByType = _countBy(sessStructs.concat(embedStructs), function(s) { return s.type || "pilier-1"; });

        // Distance + échelle (px/m) du plan courant. distM est persisté dans le cache avec l'échelle du plan :
        // chaque plan se convertit en mètres avec la sienne.
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
          // 🩸 Noms des types personnalisés mémorisés ICI, seul moment où on les connaît : sur l'accueil aucun
          // plan n'est chargé, et le nom d'un type né d'un import SIG vit dans le plan-config.json du ZIP. Sans ça,
          // les camemberts affichent « cust-sig-structures-l-nm2 ».
          labels: _labelsCustomCourants(pointsByTag, roadsByType, zonesByType, structsByType),
          ts:     Date.now(),
          source: "live"
        };
      }

      // Libellés des types `cust-…` PRÉSENTS dans les décomptes du plan courant. Seulement les personnalisés : un
      // type intégré garde son libellé par défaut dans un agrégat (sinon le renommage d'un plan s'impose à tous).
      function _labelsCustomCourants(parTag, parTrace, parZone, parStruct) {
        const out = {};
        const LC = window.LegendCustomization;
        if (!LC || typeof LC.getLabel !== "function") return out;
        [["icones", parTag], ["traces", parTrace],
         ["zones", parZone], ["structures", parStruct]].forEach(function(paire) {
          const cat = paire[0];
          Object.keys(paire[1] || {}).forEach(function(cle) {
            if (cle.indexOf("cust-") !== 0) return;
            try {
              const lbl = LC.getLabel(cat, cle);
              // 🩸 `getLabel` retombe sur la CLÉ quand il ne sait pas : la stocker passerait pour un nom résolu.
              if (lbl && lbl !== cle) out[cat + "." + cle] = String(lbl).slice(0, 60);
            } catch(e) {}
          });
        });
        return out;
      }

      // Persiste les stats COMPLÈTES du plan courant. Appelé par main.js après lancerApplication, différé de
      // 800 ms : les calques de données s'ajoutent par lots rAF (utils.js > ajouterPointsDepuisJSON, BATCH=50).
      window._persisterStatsPlanCourant = function() {
        const planId = window._currentLoadedPlanId;
        if (!planId) return;
        try {
          const stats = _computePlanStatsLive();
          localStorage.setItem("myktamap_plan_stats_v1_" + planId, JSON.stringify(stats));
          // Aussi dans le dictionnaire DURABLE : le cache de stats est purgé et versionné, les noms doivent
          // survivre. Plan d'extension : ses noms restent dans SON cache (effacé avec lui), jamais dans le
          // dictionnaire durable, qui survit à la déconnexion.
          const pc = window.PlanRegistry && window.PlanRegistry.findById ? window.PlanRegistry.findById(planId) : null;
          if (!_estPlanExt(pc)) _persisterNoms(stats.labels);
        } catch(e) {
          console.warn("[ProfileStats] Persist plan stats échec :", e);
        }
      };
      // Objets arrivés APRÈS l'ouverture (KtaExtensions.appliquerChangements) : cache du plan COURANT recalculé,
      // regroupé à 2 s (une synchro enchaîne des lots). Sans extension, l'événement n'arrive jamais.
      let _statsPlanDiffere = null;
      window.addEventListener("mktm:changements-appliques", function() {
        clearTimeout(_statsPlanDiffere);
        _statsPlanDiffere = setTimeout(function() {
          try { window._persisterStatsPlanCourant(); } catch(e) {}
        }, 2000);
      });

      // Stats agrégées, plan par plan : session lue dans KtaSessionStore (mémoire), points + tracés + longueur.
      // ⚠️ `await setTimeout(0)` entre deux plans laisse respirer le thread UI (vital sur mobile à 10+ plans) ;
      // le tbody grossit au fil de l'eau.
      async function _calculerStatsPlansAggregees() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const headerEl = document.getElementById("kta-profile-plansstats-header");
        const tbodyEl  = document.getElementById("kta-profile-plansstats-tbody");
        const tfootEl  = document.getElementById("kta-profile-plansstats-tfoot");
        if (!tbodyEl || !tfootEl) return;

        // ⚠️ L'API est PlanRegistry.getAll() (pas .list()).
        let plans = [];
        if (window.PlanRegistry && typeof window.PlanRegistry.getAll === "function") {
          try { plans = window.PlanRegistry.getAll() || []; } catch(e) {}
        }
        // Pref skipServerPlans : plans `server` exclus (ils gonfleraient les comptes).
        if (typeof window._loaderSkipServerPlans === "function" && window._loaderSkipServerPlans()) {
          plans = plans.filter(function(p) { return p.type !== "server"; });
        }
        if (plans.length === 0) {
          if (headerEl) headerEl.innerHTML = _t("home.profile.stats.plansHeaderEmpty");
          return;
        }

        let totalPois = 0, totalRoads = 0;
        // distM convertibles d'un côté, distPx orphelins (plans sans échelle connue) de l'autre : total en m/km
        // + « +N plan(s) en px ».
        let totalDistM = 0, totalDistPxOrphan = 0, nbPxOrphan = 0;
        let nbAvecData = 0, nbPartial = 0;
        let nbExt = 0, extPois = 0, extRoads = 0, extDistM = 0;   // plans d'extension
        // Breakdowns agrégés pour les camemberts, et dictionnaire des noms de types personnalisés, PARTI du
        // dictionnaire persistant. Premier arrivé, premier servi : deux plans peuvent forger la même clé
        // `cust-<ts36>-<rnd36>` (probabiliste) ; un nom reste préférable à une clé.
        const aggLabels = _nomsPersistes();
        // Détail par plan (id, étiquettes, décomptes) pour le filtre par étiquette, vidé à chaque recalcul.
        _statsParPlan.length = 0;
        const aggBreakdowns = {
          pointsByTag:   {},
          roadsByType:   {},
          zonesByType:   {},
          structsByType: {}
        };
        // Plan courant (marqueur ● dans la table). Chaque plan a sa propre `scale` dans son cache.
        const _currentId = window._currentLoadedPlanId || null;

        // Distance d'une ligne : m/km si distM connu, sinon pixels.
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

        // Trois sources par plan, en cascade :
        //   1. plan COURANT → calcul live (_computePlanStatsLive : session + calques embarqués) ;
        //   2. plan déjà ouvert → cache "myktamap_plan_stats_v1_<id>" (_persisterStatsPlanCourant) ;
        //   3. plan jamais ouvert → session seule + marqueur « ⚠️ » partiel (ouvrir le plan pour le total).
        function _resoudreStatsPlan(plan) {
          if (plan.id === _currentId) {
            const live = _computePlanStatsLive();
            return {
              pois: live.pois, roads: live.roads,
              distPx: live.distPx,
              distM:  live.distM,    // mètres, avec l'échelle courante
              scale:  live.scale,
              breakdowns: live.breakdowns || null,
              source: "live"
            };
          }
          // 2. Cache : avec distM + scale (mètres) ou seulement distPx (ancien format → partiel, rouvrir le plan).
          // 🩸 Un cache SANS breakdowns ne rend pas breakdowns:null (le plan disparaîtrait des camemberts) : on
          // passe au cas 3 pour avoir au moins ceux de la session.
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
                  source: hasDistM ? "cache" : "cache-legacy"   // → marqueur ⚠️
                };
              }
            }
          } catch(e) {}
          // 3. Session seule (partiel : ni échelle ni calques embarqués, aucun fetch). Zones et structures du
          // payload comptées ; niveaux et types (secondaire, chemin, jonction) gardés tels quels, sans filtre.
          let pois = 0, roads = 0, distPx = 0;
          let pointsByTag = {}, roadsByType = {};
          let zonesByType = {}, structsByType = {};
          try {
            const raw = window.KtaSessionStore.lire(plan.id);
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

        // ── Itération séquentielle anti-crash ──
        for (let i = 0; i < plans.length; i++) {
          const plan = plans[i];

          // ⚠️ NE JAMAIS retirer ce await : c'est lui qui empêche le gel sur 10+ plans chargés.
          await new Promise(function(r) { setTimeout(r, 0); });

          if (headerEl) {
            headerEl.innerHTML = _t("home.profile.statsProgress", { i: (i + 1), n: plans.length });
          }

          const stats = _resoudreStatsPlan(plan);
          const pois  = stats.pois;
          const roads = stats.roads;
          const distPx = stats.distPx;
          const distM  = stats.distM;
          // Partiel = session seule ou ancien cache sans distM/scale (rouvrir le plan met le cache à jour).
          const isPartial = (stats.source === "session-only" || stats.source === "cache-legacy");
          if (pois > 0 || roads > 0) nbAvecData++;
          if (isPartial)            nbPartial++;

          if (_estPlanExt(plan)) {
            // Plan d'extension : totaux à part (contenu de tous les auteurs), pas dans « mes » totaux.
            nbExt++; extPois += pois; extRoads += roads;
            if (typeof distM === "number" && distM > 0) extDistM += distM;
          } else {
            totalPois  += pois;
            totalRoads += roads;
          }
          if (_estPlanExt(plan)) {
            // Déjà compté à part.
          } else if (typeof distM === "number" && distM > 0) {
            totalDistM += distM;
          } else if (distPx > 0) {
            totalDistPxOrphan += distPx;
            nbPxOrphan++;
          }

          if (stats.breakdowns) {
            _mergeBreakdown(aggBreakdowns.pointsByTag,   stats.breakdowns.pointsByTag);
            _mergeBreakdown(aggBreakdowns.roadsByType,   stats.breakdowns.roadsByType);
            _mergeBreakdown(aggBreakdowns.zonesByType,   stats.breakdowns.zonesByType);
            _mergeBreakdown(aggBreakdowns.structsByType, stats.breakdowns.structsByType);
            if (stats.labels) {
              Object.keys(stats.labels).forEach(function(k) {
                if (aggLabels[k] == null) aggLabels[k] = stats.labels[k];
              });
            }
            // La SESSION porte aussi ses renommages, déjà en mémoire (KtaSessionStore) : lue toujours. Les types
            // nés d'un import SIG n'y sont pas (plan-config du ZIP), d'où la recherche à la demande.
            try {
              const brut = window.KtaSessionStore.lire(plan.id);
              if (brut) {
                const noms = _nomsDepuisLegende((JSON.parse(brut) || {}).customLegend);
                Object.keys(noms).forEach(function(k) {
                  if (aggLabels[k] == null) aggLabels[k] = noms[k];
                });
              }
            } catch (e) {}
            // Détail gardé par plan avec ses étiquettes. 🩸 Sinon chaque clic de chip relirait le localStorage de
            // tous les plans : refiltrer doit être une opération de RAM.
            _statsParPlan.push({
              id: plan.id,
              // `type` et `path` retrouvent le plan-config SANS ouvrir le plan (noms manquants).
              type: plan.type,
              // Plan ZIP de l'index : pas de dossier à interroger, sa copie gardée fait foi.
              path: plan.zip ? null : (plan.path || null),
              tags: Array.isArray(plan.tags) ? plan.tags.slice() : [],
              breakdowns: stats.breakdowns
            });
          }

          // Ligne ajoutée au tbody (rendu progressif).
          const isCurrent = (plan.id === _currentId);
          const planName  = plan.name || plan.id;
          const safeLabel = window.ktaEsc(planName);
          const versionTag = plan.version ? ' <span class="kta-pps-version">' + window.ktaEsc(plan.version) + '</span>' : '';
          const currentTag = isCurrent ? ' <span class="kta-pps-current" title="Plan actuellement chargé (stats live + data layers)">●</span>' : '';
          // Marqueur ⚠️ si stats partielles (plan jamais ouvert : calques absents).
          const partialTag = isPartial ? ' <span class="kta-pps-partial" title="⚠️ Stats partielles : session uniquement (les data layers embedded ne sont pas inclus). Ouvre ce plan une fois pour avoir les stats complètes en cache.">⚠️</span>' : '';
          const extTag = _estPlanExt(plan) ? ' <span class="kta-pps-ext" title="' + _t("home.profile.stats.plansExtTitle") + '">☁️</span>' : '';
          const row = document.createElement("tr");
          row.className = isCurrent ? "kta-pps-row-current" : (isPartial ? "kta-pps-row-partial" : "");
          row.innerHTML =
            '<td class="kta-pps-name">' + safeLabel + versionTag + extTag + currentTag + partialTag + '</td>' +
            '<td class="kta-pps-num">' + pois + '</td>' +
            '<td class="kta-pps-num">' + roads + '</td>' +
            '<td class="kta-pps-num">' + _fmtDist(stats) + '</td>';
          tbodyEl.appendChild(row);

          // Footer mis à jour en direct : tout en distM → « 12.5 km » ; mélange → « 12.5 km (+ N en px) » ;
          // tout en px → « X k px ».
          let totalDistStr;
          if (totalDistM > 0 && nbPxOrphan === 0) {
            totalDistStr = window.formatDistance(totalDistM, 0);
          } else if (totalDistM > 0 && nbPxOrphan > 0) {
            totalDistStr = window.formatDistance(totalDistM, 0) +
                           ' <span style="color:var(--kta-accent-texte); font-size:10px;" title="' + nbPxOrphan + ' plan' + (nbPxOrphan > 1 ? "s" : "") + ' sans scale connue, distance en pixels uniquement">(+ ' + nbPxOrphan + ' ⚠️ px)</span>';
          } else if (totalDistPxOrphan > 0) {
            totalDistStr = (totalDistPxOrphan >= 1000
                            ? (totalDistPxOrphan / 1000).toFixed(1) + "k px"
                            : Math.round(totalDistPxOrphan) + " px");
          } else {
            totalDistStr = "—";
          }
          const partialSuffix = nbPartial > 0 ? ', <span style="color:var(--kta-accent-texte);">' + nbPartial + ' ⚠️ partiel' + (nbPartial > 1 ? "s" : "") + '</span>' : '';
          tfootEl.innerHTML =
            '<tr>' +
              '<th>Total (' + nbAvecData + ' avec données' + partialSuffix + ')</th>' +
              '<th class="kta-pps-num">' + totalPois + '</th>' +
              '<th class="kta-pps-num">' + totalRoads + '</th>' +
              '<th class="kta-pps-num">' + totalDistStr + '</th>' +
            '</tr>' +
            (nbExt ? '<tr class="kta-pps-row-ext" title="' + _t("home.profile.stats.plansExtTitle") + '">' +
              '<th>' + _t("home.profile.stats.totalExt", { n: nbExt }) + '</th>' +
              '<th class="kta-pps-num">' + extPois + '</th>' +
              '<th class="kta-pps-num">' + extRoads + '</th>' +
              '<th class="kta-pps-num">' + (extDistM > 0 && window.formatDistance ? window.formatDistance(extDistM, 0) : "—") + '</th>' +
            '</tr>' : '');
        }

        if (headerEl) {
          const partialNote = nbPartial > 0
            ? ' <span style="color:var(--kta-accent-texte); font-size:11px;">(' + nbPartial + ' ⚠️ partiel' + (nbPartial > 1 ? "s" : "") + ' — ouvre une fois pour stats complètes)</span>'
            : '';
          headerEl.innerHTML = _t("home.profile.statsFinal", { n: plans.length, s: (plans.length > 1 ? "s" : "") }) + partialNote;
        }

        // Camemberts SVG agrégés, après la table (window.StatsGlobales.renderPieChart, même rendu que les Stats
        // globales d'un plan).
        _renderProfilePies(aggBreakdowns, aggLabels);
      }

      // Filtre des camemberts par étiquette de plan, trois états :
      //   neutre  → l'étiquette ne dit rien
      //   inclure → on ne garde QUE les plans qui la portent
      //   exclure → on retire les plans qui la portent, quoi qu'il arrive
      // 🩸 L'exclusion l'emporte toujours sur l'inclusion : un plan tagué « secteur » ET « brouillon », secteur
      // inclus et brouillon exclu, est ÉCARTÉ (sinon on rentre par une porte ce qu'on a fermé par l'autre).
      // ⚠️ RAM uniquement : un filtre qui survivrait à la modale ferait croire au retour que des plans ont disparu.
      // Dictionnaire PERSISTANT des noms de types personnalisés : il survit aux versions et se remplit au
      // chargement d'un plan et par la recherche à la demande (sinon il faudrait rouvrir chaque plan).
      const LS_NOMS = "myktamap_legend_labels_v1";
      function _nomsPersistes() {
        try { return JSON.parse(localStorage.getItem(LS_NOMS) || "{}") || {}; }
        catch (e) { return {}; }
      }
      function _persisterNoms(map) {
        try {
          const cur = _nomsPersistes();
          Object.keys(map || {}).forEach(function(k) { if (map[k]) cur[k] = map[k]; });
          localStorage.setItem(LS_NOMS, JSON.stringify(cur));
        } catch (e) { console.warn("[ProfileStats] noms non persistés :", e); }
      }

      // Noms extraits d'un bloc `customLegend` : `labels` (renommages) et `customEntries` (types créés, dont le
      // nom EST l'identité).
      function _nomsDepuisLegende(cl) {
        const out = {};
        if (!cl || typeof cl !== "object") return out;
        Object.keys(cl.labels || {}).forEach(function(k) {
          // 🩸 Clés custom SEULEMENT : un renommage de type intégré ne s'impose jamais à un agrégat.
          if (k.indexOf(".cust-") < 0) return;
          const v = cl.labels[k];
          if (v) out[k] = String(v).slice(0, 60);
        });
        (Array.isArray(cl.customEntries) ? cl.customEntries : []).forEach(function(e) {
          if (!e || !e.id || !e.label || !e.category) return;
          out[e.category + "." + e.id] = String(e.label).slice(0, 60);
        });
        return out;
      }

      const _statsParPlan = [];
      const _filtreTags = {};        // tag minuscule → "in" | "out"
      const SANS_TAG = "\u0000sans-etiquette";   // sentinelle : ne peut pas entrer en collision

      function _planRetenu(entree) {
        const tags = (entree.tags || []).map(function(t) { return String(t).toLowerCase(); });
        const cles = tags.length ? tags : [SANS_TAG];
        const inclus = Object.keys(_filtreTags).filter(function(k) { return _filtreTags[k] === "in"; });
        const exclus = Object.keys(_filtreTags).filter(function(k) { return _filtreTags[k] === "out"; });
        if (exclus.some(function(k) { return cles.indexOf(k) >= 0; })) return false;
        if (inclus.length === 0) return true;
        return inclus.some(function(k) { return cles.indexOf(k) >= 0; });
      }

      // Recalcule les 4 décomptes sur les plans retenus + la répartition des PLANS par étiquette (un plan
      // multi-étiquettes compte dans chacune : la somme peut dépasser le nombre de plans, c'est voulu).
      function _agregerFiltre() {
        const out = { pointsByTag: {}, roadsByType: {}, zonesByType: {}, structsByType: {}, plansByTag: {} };
        _statsParPlan.forEach(function(e) {
          if (!_planRetenu(e)) return;
          ["pointsByTag", "roadsByType", "zonesByType", "structsByType"].forEach(function(k) {
            _mergeBreakdown(out[k], (e.breakdowns || {})[k]);
          });
          const tags = (e.tags || []);
          if (tags.length === 0) out.plansByTag[SANS_TAG] = (out.plansByTag[SANS_TAG] || 0) + 1;
          else tags.forEach(function(t) { out.plansByTag[t] = (out.plansByTag[t] || 0) + 1; });
        });
        return out;
      }

      // Section camemberts (#kta-profile-pies, après la table « Mes plans ») : 4 max, chacun seulement si sa
      // catégorie a des données.
      function _renderProfilePies(breakdowns, labels) {
        const wrap = document.getElementById("kta-profile-plansstats");
        if (!wrap) return;
        const ex = document.getElementById("kta-profile-pies");
        if (ex) ex.remove();

        const renderPie = (window.StatsGlobales && typeof window.StatsGlobales.renderPieChart === "function")
                          ? window.StatsGlobales.renderPieChart
                          : null;
        if (!renderPie) return;

        const tr = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){ return k; };

        // Décomptes issus du FILTRE (sans filtre, même total). `breakdowns` reste en repli si le détail par plan
        // n'a pas été collecté.
        if (_statsParPlan.length) breakdowns = _agregerFiltre();

        const sections = [
          { key: "plansByTag",    category: "plantags",   label: "🏷️ " + tr("home.profile.pies.plansParTag") },
          { key: "pointsByTag",   category: "tags",       label: "📍 Points par tag" },
          { key: "roadsByType",   category: "traces",     label: "🛣️ Tracés par type" },
          { key: "zonesByType",   category: "zones",      label: "⬛ Zones par type" },
          { key: "structsByType", category: "structures", label: "🏛️ Structures par type" }
        ];
        const activeSections = sections.filter(function(s) {
          const data = breakdowns[s.key] || {};
          return Object.keys(data).length > 0;
        });
        // 🩸 Si le filtre exclut TOUT, les sections sont vides : sortir ici retirerait aussi les chips, seul moyen
        // de revenir en arrière.
        const filtreActif = Object.keys(_filtreTags).length > 0;
        if (activeSections.length === 0 && !filtreActif) return;  // rien a dessiner

        // 🩸 Quand on ne sait pas, on le dit : le nom d'un type personnalisé n'est connu qu'après ouverture du
        // plan ; sans note, la clé brute passe pour un bug permanent. Un seul bouton pour le bloc, remis à zéro à
        // chaque rendu.
        let _boutonNomsPose = false;
        function _noteTypesNonResolus(data, categorie, labels) {
          const cat = (categorie === "roads") ? "traces"
                    : (categorie === "tags")  ? "icones"
                    : categorie;
          const inconnus = Object.keys(data || {}).filter(function(k) {
            return k.indexOf("cust-") === 0 && !(labels && labels[cat + "." + k]);
          });
          if (inconnus.length === 0) return "";
          // 🩸 AUTONOME À DESSEIN : `_t` et `escapeHtml` sont déclarés dans d'autres fonctions, pas au niveau du
          // module. Les référencer ici = ReferenceError au runtime, que `node -c` ne voit pas.
          const tr = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){ return k; };
          const txt = window.ktaEsc(tr("home.profile.pies.typesInconnus", { n: inconnus.length }));
          // Bouton UNE FOIS pour tout le bloc (il interroge tous les plans) : porté par le 1er camembert qui a
          // des types inconnus.
          let bouton = "";
          if (!_boutonNomsPose) {
            _boutonNomsPose = true;
            const nbPlans = _statsParPlan.filter(function(e) {
              return e.type === "server" || window.PlanRegistry;
            }).length;
            bouton = ' <button type="button" class="kta-profile-pies-fix">' +
                       window.ktaEsc(tr("home.profile.pies.retrouverNoms", { n: nbPlans })) +
                     '</button>';
          }
          return '<div class="kta-profile-pies-note">' + txt + bouton + '</div>';
        }

        // Retrouver les noms SANS ouvrir les plans : le nom d'un type né d'un import SIG vit dans
        // `plan.customLegend` du plan-config.json. Plan SERVEUR : une requête vers son serveur ; plan local : une
        // lecture du ZIP mémorisé.
        // ⚠️ SUR DEMANDE, JAMAIS AUTOMATIQUE : 20 plans = 20 requêtes. Le bouton dit combien de plans il va
        // interroger ; pas de réseau dans le dos de l'utilisateur.
        async function _retrouverNoms(btn) {
          const trb = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){ return k; };
          const trouves = {};
          let interroges = 0, echecs = 0;
          for (const e of _statsParPlan) {
            let cl = null;
            try {
              if (e.type === "server" && e.path) {
                const dir = String(e.path).replace(/\/+$/, "");
                const r = await fetch(dir + "/plan-config.json", { cache: "no-store" });
                if (r.ok) {
                  const cfg = await r.json();
                  cl = cfg && cfg.plan ? cfg.plan.customLegend : null;
                }
                interroges++;
              } else if (window.PlanRegistry && typeof window.PlanRegistry.getBlob === "function"
                         && typeof window.JSZip !== "undefined") {
                // 🩸 Le BLOB uniquement, jamais le FileSystemFileHandle : il peut réclamer une permission, donc
                // une boîte de dialogue par plan.
                const blob = await window.PlanRegistry.getBlob(e.id);
                if (blob) {
                  const zip = await window.JSZip.loadAsync(blob);
                  const ent = zip.file("plan-config.json") || zip.file("data/plan-config.json");
                  if (ent) {
                    const cfg = JSON.parse(await ent.async("string"));
                    cl = cfg && cfg.plan ? cfg.plan.customLegend : null;
                  }
                  interroges++;
                }
              }
            } catch (err) { echecs++; }
            if (cl && e.type !== "ext") Object.assign(trouves, _nomsDepuisLegende(cl));   // ☁️ : jamais dans le dictionnaire durable
            // Respiration du thread UI entre deux plans (20 lectures de ZIP d'affilée figeraient l'écran).
            await new Promise(function(r2) { setTimeout(r2, 0); });
          }
          _persisterNoms(trouves);
          const n = Object.keys(trouves).length;
          if (btn) {
            btn.textContent = n
              ? trb("home.profile.pies.nomsTrouves", { n: n })
              : trb("home.profile.pies.nomsAucun", { n: interroges, e: echecs });
            btn.disabled = true;
          }
          if (n) _renderProfilePies(breakdowns, Object.assign({}, labels, trouves));
        }

        // Chips : un clic passe neutre → inclure → exclure → neutre. 🩸 L'état est PORTÉ PAR LA CHIP (✓ / ✕),
        // pas seulement par une couleur (illisible pour qui distingue mal les couleurs, et sur une capture).
        function _chipsFiltre() {
          if (!_statsParPlan.length) return "";
          const compte = {};
          let sansTag = 0;
          _statsParPlan.forEach(function(e) {
            const tags = e.tags || [];
            if (!tags.length) { sansTag++; return; }
            tags.forEach(function(t) {
              const k = String(t).toLowerCase();
              compte[k] = (compte[k] || 0) + 1;
            });
          });
          const cles = Object.keys(compte).sort(function(a, b) { return compte[b] - compte[a]; });
          if (sansTag > 0) cles.push(SANS_TAG);
          if (cles.length < 2) return "";

          const retenus = _statsParPlan.filter(_planRetenu).length;
          let h = '<div class="kta-profile-tagfilter">';
          h += '<div class="kta-profile-tagfilter-aide">' +
                 _echapper(tr("home.profile.pies.filtreAide")) + '</div>';
          h += '<div class="kta-profile-tagfilter-chips">';
          cles.forEach(function(k) {
            const etat = _filtreTags[k] || "";
            const nb = (k === SANS_TAG) ? sansTag : compte[k];
            const nom = (k === SANS_TAG) ? tr("home.profile.pies.sansTag") : k;
            const marque = (etat === "in") ? "✓ " : (etat === "out") ? "✕ " : "";
            h += '<button type="button" class="kta-profile-tagchip' +
                   (etat ? ' kta-profile-tagchip-' + etat : '') +
                 '" data-tag="' + _echapper(k) + '">' +
                   marque + _echapper(nom) + ' <span class="kta-profile-tagchip-n">' + nb + '</span>' +
                 '</button>';
          });
          h += '</div>';
          h += '<div class="kta-profile-tagfilter-etat">' +
                 _echapper(tr("home.profile.pies.filtreEtat",
                              { n: retenus, total: _statsParPlan.length })) + '</div>';
          h += '</div>';
          return h;
        }

        function _echapper(s2) { return window.ktaEsc(s2); }

        const piesContainer = document.createElement("div");
        piesContainer.id = "kta-profile-pies";
        piesContainer.className = "kta-profile-pies-wrap";
        let html = '<div class="kta-profile-pies-header">📊 Répartition par catégorie <span style="color:var(--kta-texte-3); font-size:11px; font-weight:400;">(agrégée sur tes plans)</span></div>';
        html += _chipsFiltre();
        html += '<div class="kta-profile-pies-grid">';
        activeSections.forEach(function(s) {
          let data = breakdowns[s.key] || {};
          // 🩸 La sentinelle « sans étiquette » ne s'affiche JAMAIS telle quelle : traduite dans une COPIE,
          // l'originale sert au filtre.
          if (s.key === "plansByTag" && data[SANS_TAG] != null) {
            const copie = {}; const nom = tr("home.profile.pies.sansTag");
            Object.keys(data).forEach(function(k) {
              copie[k === SANS_TAG ? nom : k] = data[k];
            });
            data = copie;
          }
          html += '<div class="kta-profile-pies-card">' +
                    '<div class="kta-profile-pies-card-title">' + s.label + '</div>' +
                    // 4e argument true : libellés par défaut, sans la cascade LegendCustomization (le renommage
                    // local d'un plan ne s'impose pas à l'agrégat).
                    renderPie(data, s.category, 140, true, labels || {}) +
                    _noteTypesNonResolus(data, s.category, labels) +
                  '</div>';
        });
        html += '</div>';
        piesContainer.innerHTML = html;
        wrap.appendChild(piesContainer);

        // Un clic fait tourner l'état puis re-rend TOUT le bloc : les autres camemberts se recalculent sur les
        // plans retenus. 🩸 Délégation sur le conteneur : les chips sont recréées à chaque rendu.
        piesContainer.addEventListener("click", function(ev) {
          const fix = ev.target && ev.target.closest ? ev.target.closest(".kta-profile-pies-fix") : null;
          if (fix) {
            fix.disabled = true;
            fix.textContent = (window.I18n && window.I18n.t)
              ? window.I18n.t("home.profile.pies.nomsRecherche") : "…";
            _retrouverNoms(fix);
            return;
          }
          const btn = ev.target && ev.target.closest ? ev.target.closest("[data-tag]") : null;
          if (!btn) return;
          const k = btn.getAttribute("data-tag");
          const cur = _filtreTags[k] || "";
          if (cur === "")          _filtreTags[k] = "in";
          else if (cur === "in")   _filtreTags[k] = "out";
          else                     delete _filtreTags[k];
          _renderProfilePies(breakdowns, labels);
        });
      }

      // Init du bandeau, différé pour laisser UserProfile.init().
      setTimeout(_initLoaderProfileBar, 100);

      function afficherChoixImportListe(stats) {
        return new Promise(function(resolve) {
          const modal = document.createElement("div");
          modal.className = "kta-readme-modal-overlay";
          modal.innerHTML = `
            <div class="kta-readme-modal-boite" style="max-width:440px;">
              <div class="kta-readme-modal-header">
                <span class="kta-readme-modal-titre">📂 Charger une liste de plans</span>
              </div>
              <div class="kta-readme-modal-corps" style="padding:18px;">
                <p style="font-size:13px; color:var(--kta-texte-2); line-height:1.5;">
                  Cette liste contient <strong>${stats.total}</strong> plan${stats.total > 1 ? "s" : ""}.<br>
                  ${stats.newOnes > 0 ? '<strong style="color:var(--kta-interaction);">' + stats.newOnes + '</strong> nouveau(x), ' : ''}
                  ${stats.duplicates > 0 ? '<span style="color:var(--kta-texte-3);">' + stats.duplicates + ' déjà connu(s)</span>' : ''}
                </p>
                <p style="font-size:13px; color:var(--kta-texte); margin-top:14px;">Que voulez-vous faire ?</p>
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

      // ── Bouton Documentation utilisateur ──────────
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


      // ── Pont : consommé par le flux d'import de homeLoader.js
      window.afficherChoixImportListe = afficherChoixImportListe;
    });
