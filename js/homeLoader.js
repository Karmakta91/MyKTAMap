/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// HOMELOADER.JS — chrome du loader + import ZIP + liste des plans + chargement
// =========================
// 🧹 B7 (v1.66.0) : extrait VERBATIM du monolithe index.html (ex-lignes
// 1434-2817 du bloc <script> inline). AUCUN refactor interne — seul ajout :
// les ponts window.* en fin de wrapper (le monolithe partageait UNE closure
// « load » ; découpé, chaque fichier expose ce que les autres consomment,
// les identifiants nus se résolvant sur l'objet global).
// ⚠️ Chargé SANS defer (exécution synchrone à l'emplacement d'origine) et
// wrappé dans window.addEventListener("load") : l'ordre d'enregistrement
// des listeners (homeLoader → homeProfile → homeConfig → résiduel inline)
// reproduit l'ordre d'exécution du bloc d'origine. Ne pas réordonner.
    // afficherLoader est défini dans main.js (avec refresh de la liste de plans)
    // On définit ici uniquement masquerLoader (utilisé par les boutons d'import)

    window.masquerLoader = function () {
      const overlay = document.getElementById("planLoaderOverlay");
      const mapEl   = document.getElementById("map");
      const loadBtn = document.getElementById("loadPlanBtn");

      if (overlay) overlay.style.display = "none";
      if (mapEl) {
        mapEl.style.display = "block";
        mapEl.style.pointerEvents = "auto";
      }
      if (loadBtn) loadBtn.disabled = false;

      // 🆕 v1.9.2-hotfix-loader-header : symétrique d'afficherLoader →
      // retire la classe pour ré-afficher le header + statusbar refonte.
      // Cf. js/main.js afficherLoader() pour le rationale détaillé.
      document.body.classList.remove("kta-loader-active");
    };

    window.addEventListener("load", function () {
      const loadBtn         = document.getElementById("loadPlanBtn");
      const statusBox       = document.getElementById("loaderStatus");
      const zipDropZone     = document.getElementById("zipDropZone");
      const zipFileInput    = document.getElementById("zipFile");
      const zipFileName     = document.getElementById("zipFileName");
      // v1.7.3 : le bouton "📥 Conf exemple" a été déplacé dans la modale
      // 🏗️ Générateur de plan (cf createConf.js). La const ci-dessous est
      // gardée à null pour rétro-compat avec le handler plus bas (lookup
      // null-safe). Si le bouton n'existe pas → handler skip.
      const confExBtn       = document.getElementById("loaderConfExempleBtn");


      // === HELPERS ===
      function setStatus(message, isError) {
        if (!statusBox) return;
        statusBox.textContent = message || "";
        statusBox.style.color = isError ? "#ffb3b3" : "#8cb4ff";
      }

      // =========================
      // 🌀 OVERLAY DE CHARGEMENT (depuis v152)
      // =========================
      // Affiche une modale plein écran avec spinner + message d'étape pendant
      // le chargement d'un plan. Visible au CENTRE de l'écran (pas en bas
      // comme #loaderStatus). Particulièrement utile pour les plans V2 qui
      // peuvent être longs à extraire (1000+ tuiles) — l'utilisateur sait
      // qu'il faut attendre et où on en est.
      function _afficherOverlayChargement(message) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        let overlay = document.getElementById("kta-load-overlay");
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.id = "kta-load-overlay";
          overlay.className = "kta-load-overlay";
          overlay.innerHTML =
            '<div class="kta-load-box">' +
              '<div class="kta-load-spinner"></div>' +
              '<div class="kta-load-titre">' + _t("home.loader.loadingTitle") + '</div>' +
              '<div class="kta-load-message" id="kta-load-message"></div>' +
              '<div class="kta-load-hint">' + _t("home.loader.loadingHint") + '</div>' +
            '</div>';
          document.documentElement.appendChild(overlay);
        }
        const msgEl = document.getElementById("kta-load-message");
        if (msgEl) msgEl.textContent = message || _t("home.loader.initializing");
      }
      function _majOverlayChargement(message) {
        const msgEl = document.getElementById("kta-load-message");
        if (msgEl) msgEl.textContent = message || "";
      }
      function _fermerOverlayChargement() {
        const overlay = document.getElementById("kta-load-overlay");
        if (overlay) overlay.remove();
      }
      // Expose pour main.js (lancerApplication peut envoyer des mises à jour
      // de message au fur et à mesure de ses étapes).
      window._afficherOverlayChargement = _afficherOverlayChargement;
      window._majOverlayChargement      = _majOverlayChargement;
      window._fermerOverlayChargement   = _fermerOverlayChargement;

      function guessMime(filename) {
        const ext = filename.split(".").pop().toLowerCase();
        return ({ json:"application/json", png:"image/png", jpg:"image/jpeg",
                  jpeg:"image/jpeg", gif:"image/gif", webp:"image/webp",
                  svg:"image/svg+xml" })[ext] || "application/octet-stream";
      }

      async function extraireZip(zipFile) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        if (typeof JSZip === "undefined") throw new Error(_t("home.loader.errJszip"));
        const zip = await JSZip.loadAsync(zipFile);
        let planConfigFile = null;
        const assetFiles = [];

        // 🐛 v1.34.10 (Pack RAM Phase 1 — dry-run logging) :
        // Préparation à la re-attaque v1.35.0 (lazy tile extraction).
        // v1.35.0 cassait l'image principale car le regex `^data/tiles/z-?\d+/`
        // pouvait catcher des assets référencés par plan-config (ex. baseImage).
        // Phase 1 = DEFENSIVE 2-PASS : on parse plan-config EN PREMIER pour
        // construire une whitelist des paths référencés (baseImage, collisionImage,
        // imageLayers, dataLayers). Cette whitelist sera consultée en Phase 2
        // pour ne JAMAIS stuber un asset référencé. Phase 1 = DRY-RUN : on log
        // ce qui serait stube mais on extrait tout eager comme avant → ZERO
        // changement de comportement. KARMA valide les logs F12 puis on active
        // le vrai stub en Phase 2 (v1.35.0 re-attaque).
        let referencedPaths = new Set();
        const planConfigEntry = zip.files["plan-config.json"];
        if (planConfigEntry) {
          try {
            const planText = await planConfigEntry.async("text");
            const planConfig = JSON.parse(planText);
            function _addPath(p) {
              if (p) referencedPaths.add(String(p).replace(/\\/g, "/").trim());
            }
            _addPath(planConfig.plan && planConfig.plan.baseImage);
            _addPath(planConfig.plan && planConfig.plan.collisionImage);
            // 🆕 v1.34.19 — Champ `histoirePdf` (PDF embarqué pour Mode Histoire).
            // À garder eager : c'est typiquement un PDF de taille modérée
            // (1-10 Mo) consulté à la demande user, lazy n'apporte rien et
            // simplifie le rendu iframe (qui veut une URL stable).
            _addPath(planConfig.plan && planConfig.plan.histoirePdf);
            // 📄 v1.71.0 — multi-PDF Histoire
            if (planConfig.plan && Array.isArray(planConfig.plan.histoirePdfs)) {
              planConfig.plan.histoirePdfs.forEach(_addPath);
            }
            (planConfig.imageLayers || []).forEach(function(l) { _addPath(l && l.file); });
            (planConfig.dataLayers || []).forEach(function(l) { _addPath(l && l.file); });
            console.log("[LazyTiles v1.34.10-dryrun] Whitelist des paths référencés (= NE PAS stuber en Phase 2) :", Array.from(referencedPaths));
          } catch(e) {
            console.warn("[LazyTiles v1.34.10-dryrun] Échec parse plan-config.json pour whitelist :", e);
          }
        } else {
          console.warn("[LazyTiles v1.34.10-dryrun] plan-config.json introuvable dans le ZIP — whitelist vide");
        }

        // === Pass 2 : extraction (eager pour assets référencés + stub pour tuiles) ===
        // 🐛 v1.34.11 (Phase 2) : activation du VRAI lazy tile.
        // Les tuiles dans /data/tiles/ qui ne sont PAS dans la whitelist sont
        // poussées comme STUBS (sans blob extrait) → grosse économie RAM au boot.
        // Le blob sera extrait à la demande par _extractLazyAsset (config.js) au
        // moment du rendu via _renderNiveau (tiling.js).
        let stubCount = 0;
        let eagerCount = 0;
        let canariCount = 0;
        for (const entry of Object.values(zip.files).filter(function(f) { return !f.dir; })) {
          const name = entry.name.split("/").pop();
          if (!name) continue;

          const fullPath = String(entry.name).replace(/\\/g, "/").trim();
          const matchesTilePath = /^data\/tiles\/z-?\d+\//i.test(fullPath);
          const isReferenced = referencedPaths.has(fullPath);

          // === DÉCISION : stub vs eager ===
          if (matchesTilePath && !isReferenced) {
            // 🐛 v1.34.11 — STUB : objet plain avec _lazyTile flag (pas un File).
            // Le blob sera extrait à la demande via window._lazyZipRef.
            // Note : on garde `name` (basename) + `_fullPath` (path complet ZIP)
            // pour compatibilité avec findMatchingFile / startImportedPlan.
            assetFiles.push({
              name: name,
              _fullPath: entry.name,
              _lazyTile: true,
              _zipPath: entry.name
            });
            stubCount++;
            continue;
          }
          if (matchesTilePath && isReferenced) {
            canariCount++;
            console.warn("[LazyTiles v1.34.11] ⚠️ CANARI : entrée qui matche /data/tiles/ MAIS est référencée dans plan-config — extraction EAGER (correct, mais à surveiller) :", fullPath);
          }

          // === EAGER : extraction immédiate du blob (comportement avant v1.34.11) ===
          const blob = await entry.async("blob");
          const file = new File([blob], name, { type: guessMime(name) });
          // 🧱 Tiling V2 (v149) : on annote le File avec son chemin complet
          // dans le ZIP via une propriété ad-hoc `_fullPath`. iOS Safari strip
          // les `/` du `File.name` (qui devient juste le basename), donc
          // impossible de stocker `data/tiles/z0/x0_y-1.jpg` dans `file.name`.
          // Les tuiles partagent souvent le même basename (x0_y-1.jpg existe
          // à z=0, z=-1, z=-2…) → seul le chemin complet permet de
          // désambiguer.
          file._fullPath = entry.name;
          if (name === "plan-config.json") planConfigFile = file;
          else {
            eagerCount++;
            assetFiles.push(file);
          }
        }

        console.log("[LazyTiles v1.34.11] Bilan : " + stubCount + " tuile(s) stube (lazy) + " + eagerCount + " asset(s) extrait eager + " + canariCount + " canari(s) détecté(s).");

        // 🐛 v1.34.11 (corrigé v1.34.12) — Garde la référence au ZIP source pour
        // extraction lazy ultérieure. ATTENTION : on N'ASSIGNE PAS directement à
        // window._lazyZipRef ici car startImportedPlan invoque immédiatement
        // _libererRessourcesPlanPrecedent → resetRuntimeAssets qui nullify
        // _lazyZipRef. À la place, on ANNOTE le tableau assetFiles avec _lazyZip,
        // et startImportedPlan (main.js) set window._lazyZipRef APRÈS le cleanup
        // du plan précédent.
        if (stubCount > 0) {
          assetFiles._lazyZip = zip;
          console.log("[LazyTiles v1.34.12] zip annoté sur assetFiles._lazyZip (sera set sur window après cleanup plan précédent ; taille ZIP : ~" + Math.round(zipFile.size / 1024) + " Ko)");
        }

        if (!planConfigFile) throw new Error("plan-config.json introuvable dans l'archive ZIP");
        return { planConfigFile, assetFiles };
      }

      // === CONF EXEMPLE ===
      if (confExBtn) {
        confExBtn.addEventListener("click", function() {
          const a = document.createElement("a");
          a.href = "data/myktamap.zip";
          a.download = "myktamap.zip";
          a.click();
        });
      }

      // === DROP ZONE ZIP ===
      zipDropZone.addEventListener("click", function () {
        zipFileInput.click();
      });
      // 🗺️ v1.75.2 — extensions routées vers « Convertir depuis un SIG ».
      // `.kmz` en est VOLONTAIREMENT absent : il part vers l'import KMZ
      // historique (celui qui reconstruit un plan depuis un GroundOverlay).
      // Un KMZ purement vectoriel y sera refusé — le message de refus renvoie
      // vers la conversion SIG.
      function _estFichierSig(nomMinuscule) {
        return nomMinuscule.endsWith(".geojson")
            || nomMinuscule.endsWith(".kml")
            || nomMinuscule.endsWith(".json");
      }

      // 🗺️ GeoTIFF : un plan scanne puis cale dans QGIS. Meme lecon que le SIG
      // en v1.75.2 — l'accueil est l'endroit evident ou deposer un fichier, et
      // un .tif y tombait sur « le fichier doit etre une archive .zip ».
      // 🚑 06/10/2026 — un fichier du Mode Secours (.mkmsec.json, rapport) déposé ici partait
      // à la conversion SIG (tout .json y va). On lit le DÉBUT du contenu (les messageries
      // renomment) : un « myktamap-secours-… » part au Mode Secours, le reste au SIG.
      function _routerSig(f) {
        if (typeof window.afficherImporterSig === "function") {
          zipFileName.textContent = "🗺️ " + f.name + " — ouverture de la conversion SIG…";
          window.afficherImporterSig(f);
        } else {
          setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.sigUnavailable") : "Module d'import SIG indisponible — ouvre 🏗️ Générer un plan et utilise « Convertir depuis un SIG »."), true);
        }
      }
      function _routerJson(f) {
        const SM = window.SecoursMode;
        if (!SM || typeof SM.ouvrirDepuisAccueil !== "function" || typeof f.slice !== "function") { _routerSig(f); return; }
        f.slice(0, 4096).text().then(function(debut) {
          if (debut.indexOf('"myktamap-secours-') < 0) { _routerSig(f); return null; }
          return f.text().then(function(txt) { return SM.ouvrirDepuisAccueil(txt, f.name); }).then(function(r) {
            if (!r) { _routerSig(f); return; }
            zipFileName.textContent = r.ok ? "🚑 " + f.name : "";
            if (r.message) setStatus(r.message, !r.ok);
          });
        }).catch(function(e) { console.warn("[HomeLoader] lecture du .json :", e); _routerSig(f); });
      }

      function _estGeoTiff(nomMinuscule) {
        return nomMinuscule.endsWith(".tif") || nomMinuscule.endsWith(".tiff");
      }

      // Ouvre le Generateur avec le GeoTIFF pose (image + georef + echelle).
      // Rend false si le module est absent, pour que l'appelant le DISE.
      function _routerGeoTiff(f) {
        if (typeof window.afficherImporterGeoTiff !== "function") return false;
        return window.afficherImporterGeoTiff(f) !== false;
      }

      zipFileInput.addEventListener("change", function () {
        const f = zipFileInput.files[0];
        if (!f) { zipFileName.textContent = ""; return; }
        // v1.14.20-hotfix6 / v1.15.0 — route KMZ et GPX vers leur modale
        // d'import dédiée. Pour un ZIP MyKTAMap classique : flow direct.
        const lower = f.name.toLowerCase();
        if (lower.endsWith(".kmz")) {
          zipFileInput.value = "";
          if (typeof window.afficherImporterKmz === "function") {
            zipFileName.textContent = "🌍 " + f.name + " — ouverture de l'import KMZ…";
            window.afficherImporterKmz(f);
          } else {
            setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.kmzUnavailable") : "Module d'import KMZ indisponible — ouvre 🏗️ Générer un plan et utilise l'import KMZ depuis là."), true);
          }
          return;
        }
        if (lower.endsWith(".gpx")) {
          zipFileInput.value = "";
          if (typeof window.afficherImporterGpx === "function") {
            zipFileName.textContent = "📤 " + f.name + " — ouverture de l'import GPX…";
            window.afficherImporterGpx(f);
          } else {
            setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.gpxUnavailable") : "Module d'import GPX indisponible — ouvre 🏗️ Générer un plan et utilise l'import GPX depuis là."), true);
          }
          return;
        }
        // 🗺️ v1.75.2 (retour KARMA « l'endroit où on importe nos données SIG
        // est mal indiqué ») — L'ACCUEIL LES REFUSAIT PUREMENT ET SIMPLEMENT.
        // La conversion SIG n'était atteignable que depuis la zone d'import DU
        // GÉNÉRATEUR ; ici, un .geojson tombait sur « le fichier doit être une
        // archive .zip ». Or c'est ÇA, l'endroit évident pour déposer un fichier.
        // ⚠️ `.json` est routé aussi : sur cette zone il ne peut pas être un
        // plan (JSZip échouerait), donc l'envoyer au parser SIG — qui refuse
        // proprement si ce n'est pas du GeoJSON — est strictement meilleur que
        // le comportement actuel.
        if (_estFichierSig(lower)) {
          zipFileInput.value = "";
          if (lower.endsWith(".json")) _routerJson(f); else _routerSig(f);
          return;
        }
        if (_estGeoTiff(lower)) {
          zipFileInput.value = "";
          if (_routerGeoTiff(f)) {
            zipFileName.textContent = "🗺️ " + f.name + ((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.tiffRoute") : " — ouverture du Générateur, géoréf lu dans le fichier…");
          } else {
            setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.tiffUnavailable") : "Module GeoTIFF indisponible — ouvre 🏗️ Générer un plan et choisis l'image depuis là."), true);
          }
          return;
        }
        zipFileName.textContent = "✅ " + f.name;
        // Note : pas d'auto-bascule de preset selon la taille — le mode "Auto" du
        // segmented control s'occupe naturellement des gros fichiers (> 60 Mo)
      });

      zipDropZone.addEventListener("dragover",  function(e) { e.preventDefault(); zipDropZone.classList.add("dragover"); });
      zipDropZone.addEventListener("dragleave", function()  { zipDropZone.classList.remove("dragover"); });
      zipDropZone.addEventListener("drop", function(e) {
        e.preventDefault(); zipDropZone.classList.remove("dragover");
        const f = e.dataTransfer.files[0];
        if (!f) return;
        const lower = f.name.toLowerCase();
        if (lower.endsWith(".zip")) {
          const dt = new DataTransfer(); dt.items.add(f);
          zipFileInput.files = dt.files;
          zipFileName.textContent = "✅ " + f.name;
        } else if (lower.endsWith(".kmz")) {
          // v1.14.20-hotfix6 — route KMZ vers la modale d'import dédiée
          // (parse + reconstruction en ZIP MyKTAMap avec icônes/annotations
          // préservées).
          if (typeof window.afficherImporterKmz === "function") {
            zipFileName.textContent = "🌍 " + f.name + " — ouverture de l'import KMZ…";
            window.afficherImporterKmz(f);
          } else {
            setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.kmzUnavailable") : "Module d'import KMZ indisponible — ouvre 🏗️ Générer un plan et utilise l'import KMZ depuis là."), true);
          }
        } else if (lower.endsWith(".gpx")) {
          // v1.15.0 — route GPX vers la nouvelle modale d'import GPX
          // (parse + canvas vierge auto-calibré + reconstruction ZIP
          // MyKTAMap). Cohérent avec le flow KMZ.
          if (typeof window.afficherImporterGpx === "function") {
            zipFileName.textContent = "📤 " + f.name + " — ouverture de l'import GPX…";
            window.afficherImporterGpx(f);
          } else {
            setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.gpxUnavailable") : "Module d'import GPX indisponible — ouvre 🏗️ Générer un plan et utilise l'import GPX depuis là."), true);
          }
        } else if (_estFichierSig(lower)) {
          // 🗺️ v1.75.2 — même routage que la sélection par clic (cf. plus haut).
          if (lower.endsWith(".json")) _routerJson(f); else _routerSig(f);
        } else if (_estGeoTiff(lower)) {
          // 🗺️ GeoTIFF — même routage que la sélection par clic (cf. plus haut).
          if (_routerGeoTiff(f)) {
            zipFileName.textContent = "🗺️ " + f.name + ((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.tiffRoute") : " — ouverture du Générateur, géoréf lu dans le fichier…");
          } else {
            setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.tiffUnavailable") : "Module GeoTIFF indisponible — ouvre 🏗️ Générer un plan et choisis l'image depuis là."), true);
          }
        } else {
          setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.badFileType") : "Le fichier doit être une archive .zip, un .kmz, un .gpx ou un fichier SIG (.geojson, .kml)"), true);
        }
      });

      // 📦 v1.94.0 — import multiple. Le module vit à part : ce bouton ne fait
      // que l'ouvrir, et le DIT si le module manque plutôt que de rester inerte.
      const impMasseBtn = document.getElementById("loaderImportMasseBtn");
      if (impMasseBtn) {
        impMasseBtn.addEventListener("click", function() {
          if (window.ImportMasse && typeof window.ImportMasse.ouvrir === "function") window.ImportMasse.ouvrir();
          else setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("impmasse.indispo") : "Module d indisponible"), true);
        });
      }

      // 💾 UN SEUL MÉCANISME DE PERSISTANCE : la copie du ZIP dans l'app.
      // 🩸 15/09/2026 (KARMA : « Autoriser l'accès permanent a l'air de servir
      // à rien et faire doublon ») — exact. Sur Chrome/Edge le bouton 🔐 était
      // affiché À LA PLACE de la case « Mémoriser », mais la case restait
      // cochée sous le masque et `onLoadPlanClick` lit son état, pas sa
      // visibilité : le ZIP était copié dans TOUS les cas, et la référence
      // disque prise en plus n'était jamais lue (l'ouverture essaie la copie
      // d'abord, et ne retombe pas sur la référence si la copie a été purgée).
      // Le bouton et la prise de référence à l'ajout sont retirés ; la LECTURE
      // des anciennes entrées `fsHandleId` reste (étape 2 de l'ouverture).
      //
      // Puis, même soir (KARMA : « ce truc à cocher alourdit pour rien le
      // home ») : la case quitte l'ACCUEIL et devient le réglage ⚙️
      // Configuration de l'accueil → « Mémoriser le plan dans l'app au premier
      // chargement », ACTIVÉ par défaut. Cette fonction est la source de
      // vérité unique : lue ici, par l'import multiple (défaut de la case
      // « Mémoriser les plans dans l'app ») et par homeConfig (la case du réglage).
      window.ktaMemoriserPlanActif = function () {
        try { return localStorage.getItem("myktamap_memoriser_plan") !== "0"; } catch (e) { return true; }
      };

      // === CHARGEMENT D'UN ZIP (utilisé par le bouton Charger ET les plans locaux du registre) ===
      // presetChoisi : "auto" | "quality" | "balanced" | "performance" (string)
      // =========================
      // 🔄 v1.73.1 — MÊME PLAN RÉIMPORTÉ : MISE À JOUR AU LIEU DE DOUBLON
      // =========================
      // (KARMA « j'importe le même plan des jours après → il duplique »)
      // Rappel du modèle : l'id d'un plan local est DÉRIVÉ de nom+version
      // (`local_<slug(nom)>_<slug(version)>`) → nom ET version identiques
      // écrasaient DÉJÀ l'entrée. Le doublon vient donc d'une **version qui
      // a changé** (regénération = c'est la norme). On détecte ce cas ici :
      // même nom + même auteur (normalisés), version différente → on demande.
      // Décisions KARMA 1:a 2:a 3:a — portée : import ZIP depuis l'accueil.
      function _normId(s) {
        return String(s == null ? "" : s).toLowerCase()
          .normalize("NFD").replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "").trim();
      }

      // Retourne l'entrée locale de MÊME NOM, ou null.
      // 🐛 v1.79.1 (KARMA « même nom → pas de popup, et le plan ne s'ajoute
      // jamais à la liste ») — l'ancien filtre exigeait même auteur ET version
      // DIFFÉRENTE (« version identique → même id, déjà géré ») : un ZIP
      // régénéré (même nom + même version) passait sous le radar et ÉCRASAIT
      // silencieusement l'entrée existante via l'id commun genLocalId(nom,
      // version) — y compris l'entrée d'un AUTRE plan homonyme d'un autre
      // auteur. Désormais : même nom (local) = la popup tranche. Les
      // rechargements ciblés (meta.planId posé : clic de row, re-sélection)
      // restent exemptés par le garde du caller.
      function _chercherPlanExistant(nom) {
        if (!window.PlanRegistry || !nom) return null;
        const nN = _normId(nom);
        if (!nN) return null;
        return window.PlanRegistry.getAll().find(function(p) {
          return p.type === "local" && _normId(p.name) === nN;
        }) || null;
      }

      // Modale de choix. Résout "update" | "both" | "cancel".
      // ✕ / Escape / backdrop = "cancel" (on ne charge rien) : le choix par
      // défaut ne doit jamais être celui qui écrase.
      function _demanderQuoiFaireDoublon(existant, nouvelleVersion) {
        return new Promise(function(resolve) {
          const t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
          const tiret = "—";
          const ov = document.createElement("div");
          ov.className = "kta-readme-modal-overlay";
          ov.style.display = "flex";
          const esc = (typeof window.ktaEsc === "function") ? window.ktaEsc : function(x){return x;};
          ov.innerHTML =
            '<div class="kta-modal" style="max-width:440px;">' +
              '<div class="kta-modal-icon" style="color:#f4c542;">🔄</div>' +
              '<div class="kta-modal-titre">' + esc(t("home.dup.titre")) + '</div>' +
              '<div class="kta-modal-texte">' +
                esc(t("home.dup.texte", {
                  nom: window.PlanRegistry.displayName(existant) || "?",
                  vA:  existant.version || tiret,
                  vB:  nouvelleVersion || tiret
                })) +
                '<br><span style="font-size:12px; color:#8892a4;">' + esc(t("home.dup.note")) + '</span>' +
              '</div>' +
              '<div class="kta-modal-actions" style="flex-wrap:wrap;">' +
                '<button class="kta-btn kta-btn-ghost" id="kta-dup-cancel" type="button">' + esc(t("ui.btn.cancel")) + '</button>' +
                '<button class="kta-btn kta-btn-ghost" id="kta-dup-both" type="button">' + esc(t("home.dup.btnBoth")) + '</button>' +
                '<button class="kta-btn kta-btn-primary" id="kta-dup-update" type="button">' + esc(t("home.dup.btnUpdate")) + '</button>' +
              '</div>' +
            '</div>';
          document.documentElement.appendChild(ov);
          let fini = false;
          function _fermer(choix) {
            if (fini) return;
            fini = true;
            document.removeEventListener("keydown", _onKey);
            try { ov.remove(); } catch(e) {}
            resolve(choix);
          }
          function _onKey(e) { if (e.key === "Escape") _fermer("cancel"); }
          document.addEventListener("keydown", _onKey);
          ov.addEventListener("click", function(e) { if (e.target === ov) _fermer("cancel"); });
          ov.querySelector("#kta-dup-cancel").addEventListener("click", function() { _fermer("cancel"); });
          ov.querySelector("#kta-dup-both").addEventListener("click",   function() { _fermer("both"); });
          ov.querySelector("#kta-dup-update").addEventListener("click", function() { _fermer("update"); });
        });
      }

      async function chargerZipFichier(zipFile, presetChoisi, meta) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        if (typeof window.startImportedPlan !== "function") {
          throw new Error("startImportedPlan introuvable");
        }
        // 🆕 v1.42.0 — Kill-switch anti-fuite : check denylist AVANT extraction.
        // Si le ZIP a une empreinte SHA-256 dans denylist.json côté serveur, on
        // refuse l'ouverture, on supprime le plan du registre, on affiche
        // une modale rouge explicative. Aucun hash envoyé au serveur (privacy).
        // Fail-open si module/hash impossible : log warning + ouverture autorisée
        // (pour ne pas bloquer le dev local sans HTTPS / SubtleCrypto).
        let _denylistComputedHash = null;
        if (window.PlanDenylist && typeof window.PlanDenylist.isPlanDenied === "function") {
          try {
            const denyCheck = await window.PlanDenylist.isPlanDenied(zipFile);
            _denylistComputedHash = (denyCheck && denyCheck.sha256) || null;
            if (denyCheck && denyCheck.denied) {
              console.warn("[Loader] Plan refusé (denylist) :", denyCheck.sha256, "- raison :", denyCheck.reason);
              _fermerOverlayChargement();
              setStatus(_t("home.loader.planRevoked"), true);
              const planId = (meta && meta.planId) || null;
              window.PlanDenylist.showDeniedModal(denyCheck, planId);
              return;  // STOP : pas d'extraction ni de chargement
            }
          } catch(eDeny) {
            // Fail-safe : log mais ne bloque pas (denylist down ≠ refus auto)
            console.warn("[Loader] Check denylist échec — chargement autorisé :", eDeny.message);
          }
        }
        // 🆕 v1.42.3 — Cache le hash dans le PlanRegistry APRÈS chargement réussi
        // pour que l'audit au prochain boot puisse skip le re-hash (perf gain).
        // L'id du plan local est dispo dans meta.planId si le caller l'a passé,
        // sinon on attendra l'audit suivant pour faire le hash (= sans regret).
        const _cacheHashAfterLoad = function() {
          try {
            const pid = meta && meta.planId;
            if (pid && _denylistComputedHash && window.PlanRegistry) {
              window.PlanRegistry.addOrUpdate({ id: pid, sha256: _denylistComputedHash });
            }
          } catch(e) {}
        };
        // 🌀 v152 : overlay plein écran visible avec spinner + message d'étape.
        // Plus visible que setStatus (qui écrit dans #loaderStatus tout en bas).
        // Particulièrement utile pour les plans V2 (extraction de 1000+ tuiles).
        _afficherOverlayChargement(_t("home.loader.extracting"));
        setStatus(_t("home.loader.extractingShort"), false);
        try {
          // v173 : wrapper de step pour capturer une trace utile dès la source
          // (avant que l'erreur ne se transforme en {} opaque en remontant).
          // Sans ça, une DOMException Safari ou un Event onerror sortait du
          // catch dans onLoadPlanClick avec message vide → console "[Loader] Erreur : {}".
          let _step = "extraction du ZIP";
          let planConfigFile, assetFiles;
          try {
            const res = await extraireZip(zipFile);
            planConfigFile = res.planConfigFile;
            assetFiles = res.assetFiles;
          } catch(eExtr) {
            const _m = (eExtr && eExtr.message) || (eExtr && eExtr.name) || String(eExtr) || "extraction ZIP échouée";
            console.error("[chargerZipFichier] Erreur étape '" + _step + "' :", _m, "| raw :", eExtr);
            throw new Error(_t("home.loader.errStep", { step: _step }) + _m);
          }

          // 🔄 v1.73.1 — Détection « même plan, autre version » (UNIQUEMENT sur
          // un import frais : si meta.planId est déjà posé, le caller vise une
          // entrée précise — rechargement depuis la liste, re-sélection de
          // fichier — et rien ne doit être demandé).
          if (!meta || !meta.planId) {
            let _infosPlan = null;
            try {
              const _cfg = JSON.parse(await planConfigFile.text());
              if (_cfg && _cfg.plan) _infosPlan = _cfg.plan;
            } catch(e) { /* plan-config illisible → startImportedPlan lèvera proprement */ }
            if (_infosPlan) {
              const _exist = _chercherPlanExistant(_infosPlan.name);
              if (_exist) {
                _fermerOverlayChargement();   // la modale doit être lisible
                const _choix = await _demanderQuoiFaireDoublon(_exist, _infosPlan.version);
                if (_choix === "cancel") {
                  setStatus(_t("home.dup.cancelled"), false);
                  if (loadBtn) loadBtn.disabled = false;
                  return;
                }
                if (_choix === "update") {
                  meta = Object.assign({}, meta || {});
                  meta.planId = _exist.id;   // → startImportedPlan écrase CETTE entrée
                  // Le ZIP mémorisé doit suivre : sans ça l'entrée pointerait
                  // encore sur l'ancienne archive (= « ça ne met pas à jour »).
                  if (_exist.storedBlob) meta.storeBlob = true;
                  console.log("[Loader] 🔄 Mise à jour du plan existant :", _exist.id,
                              "(v" + (_exist.version || "—") + " → v" + (_infosPlan.version || "—") + ")");
                }
                // 🐛 v1.79.1 — « Garder les deux » avec nom + version IDENTIQUES :
                // l'id naturel genLocalId(nom, version) collisionne avec
                // l'existant → sans suffixe, addOrUpdate aurait fusionné les
                // deux plans en une seule entrée (le « garder les deux » mentait).
                if (_choix === "both" && window.PlanRegistry) {
                  const _idNatif = window.PlanRegistry.genLocalId(_infosPlan.name, _infosPlan.version || "");
                  if (window.PlanRegistry.findById(_idNatif)) {
                    let _n = 2, _idLibre = _idNatif + "_" + _n;
                    while (window.PlanRegistry.findById(_idLibre)) _idLibre = _idNatif + "_" + (++_n);
                    meta = Object.assign({}, meta || {});
                    meta.planId = _idLibre;
                    console.log("[Loader] ➕ Garder les deux : id suffixé", _idLibre);
                  }
                }
                _afficherOverlayChargement(_t("home.loader.mapLoading"));
              }
            }
          }

          _majOverlayChargement(_t("home.loader.mapLoading"));
          setStatus(_t("home.loader.loadingShort"), false);

          _step = "lancement de l'application (startImportedPlan)";
          try {
            // Note : pas de localStorage global pour perfPreset — c'est sauvegardé
            // par plan dans PlanRegistry.setPerfPreset (via startImportedPlan)
            await window.startImportedPlan(planConfigFile, assetFiles, presetChoisi, Object.assign({ zipFile: zipFile }, meta || {}));
          } catch(eSta) {
            const _m = (eSta && eSta.message) || (eSta && eSta.name) || String(eSta) || "lancement échoué";
            console.error("[chargerZipFichier] Erreur étape '" + _step + "' :", _m, "| raw :", eSta, "| stack :", eSta && eSta.stack);
            throw new Error(_t("home.loader.errStep", { step: _step }) + _m);
          }

          setStatus(_t("home.loader.loadedOk"));
          // 🆕 v1.42.3 — cache le hash SHA-256 dans le PlanRegistry pour
          //    accélérer l'audit denylist au prochain boot.
          _cacheHashAfterLoad();
          if (window.masquerLoader) window.masquerLoader();
        } finally {
          _fermerOverlayChargement();
        }
      }
      // Exposer pour le bouton "Changer de plan"
      window.chargerZipFichier = chargerZipFichier;

      async function onLoadPlanClick() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        loadBtn.disabled = true;
        try {
          const zipFile = zipFileInput.files[0];
          if (!zipFile) {
            setStatus(_t("home.loader.selectZipFirst"), true);
            loadBtn.disabled = false;
            return;
          }
          // Lire le preset choisi dans le segmented control
          const presetChoisi = (typeof window.getLoaderPerfPreset === "function")
            ? window.getLoaderPerfPreset()
            : "auto";

          const meta = {};
          // Copie du ZIP dans l'app selon le réglage de l'accueil (le seul mécanisme)
          if (window.ktaMemoriserPlanActif()) meta.storeBlob = true;

          await chargerZipFichier(zipFile, presetChoisi, meta);
        } catch(err) {
          // v173 : extraction défensive pour éviter le log "[Loader] Erreur : {}"
          // qui apparait quand l'erreur est un objet sans message (throw {} ou
          // Promise reject avec valeur non-Error). On essaie plusieurs sources
          // pour donner une trace utile au F12.
          const _msg =
            (err && err.message) ||
            (err && err.toString && err.toString() !== "[object Object]" ? err.toString() : null) ||
            (err && err.name) ||
            (err && typeof err === "object" ? JSON.stringify(err, Object.getOwnPropertyNames(err)) : null) ||
            String(err) ||
            _t("home.loader.errUnknown");
          console.error("[Loader] Erreur :", _msg, "| raw err :", err, "| typeof :", typeof err, "| stack :", err && err.stack);
          setStatus(_t("home.loader.errPrefix") + _msg, true);
          loadBtn.disabled = false;
        }
      }

      if (loadBtn) loadBtn.addEventListener("click", onLoadPlanClick);

      // Le segmented control est initialisé à "auto" via le HTML (classe .active sur le bouton Auto).
      // L'ancienne pref globale `perfMode` n'est plus utilisée — perfPreset est désormais par plan.

      // === BOUTONS SECONDAIRES ===
      const plannerBtn = document.getElementById("loaderPlannerBtn");
      if (plannerBtn) {
        plannerBtn.addEventListener("click", function() {
          const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
          if (typeof window.afficherPlanner === "function") window.afficherPlanner();
          else setStatus(_t("home.loader.generatorUnavailable"), true);
        });
      }

      // 🆕 v1.48.0 — Éditeur de données du plan accessible depuis le home
      // (modale autoportante : depuis le home, pas de "plan en cours" → seules
      // les sources ZIP + JSON s'affichent, cf tableEditor.js > _afficherAccueil).
      const tableEditorBtn = document.getElementById("loaderTableEditorBtn");
      if (tableEditorBtn) {
        tableEditorBtn.addEventListener("click", function() {
          const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
          if (typeof window.ouvrirTableEditor === "function") window.ouvrirTableEditor();
          else setStatus(_t("ui.alert.tableEditorIndispo"), true);
        });
      }

      // 🔽 v1.71.0 (KARMA) — Footer repliable : gagne la hauteur du bloc
      // copyright pour le contenu. État persisté (et exporté avec le profil).
      const LS_FOOTER_REPLIE = "myktamap_home_footer_replie_v1";
      const footerToggle = document.getElementById("loaderFooterToggle");
      const footerBlock  = document.getElementById("loaderFooterBlock");
      function _appliquerFooter(replie) {
        if (!footerToggle || !footerBlock) return;
        footerBlock.style.display = replie ? "none" : "";
        footerToggle.setAttribute("aria-expanded", replie ? "false" : "true");
        // Replié : mention minimale (copyright jamais supprimé, juste replié)
        footerToggle.textContent = replie
          ? "▴ © 2026 MyKTAMap · " + ((window.__MKM__ && window.__MKM__.build) || "")
          : "▾";
        // 🔌 v2.0.0 — Replié, le bloc masque aussi la pastille de connexion
        // serveur : ktaExtensions repose son icône sur ce bouton (le
        // textContent ci-dessus vient de l'effacer).
        if (window.KtaExtensions && typeof window.KtaExtensions.peindre === "function") {
          window.KtaExtensions.peindre();
        }
      }
      if (footerToggle && footerBlock) {
        footerToggle.addEventListener("click", function() {
          const replie = footerBlock.style.display !== "none";
          try { localStorage.setItem(LS_FOOTER_REPLIE, replie ? "1" : "0"); } catch(e) {}
          _appliquerFooter(replie);
        });
        try { _appliquerFooter(localStorage.getItem(LS_FOOTER_REPLIE) === "1"); } catch(e) {}
      }

      // 🔎 v1.69.0 — Recherche multi-plans : n'est plus un bouton d'outil mais
      // une BARRE entre « Reprendre » et la liste des plans (allègement du HOME
      // demandé par KARMA). Entrée ou clic sur 🔎 ouvre la modale de résultats
      // avec la saisie reprise. On n'ouvre PAS à chaque frappe : le scan des
      // plans est coûteux, et une modale qui s'ouvre sous les doigts est hostile.
      const searchInput = document.getElementById("loaderSearchInput");
      const searchBtn   = document.getElementById("loaderSearchBtn");
      function _lancerRecherche() {
        const q = searchInput ? String(searchInput.value || "").trim() : "";
        if (window.CrossPlanSearch && typeof window.CrossPlanSearch.ouvrir === "function") {
          window.CrossPlanSearch.ouvrir(q);
          if (searchInput) searchInput.value = "";   // la modale porte la saisie
        } else {
          console.warn("[Home] CrossPlanSearch indisponible");
        }
      }
      if (searchBtn) searchBtn.addEventListener("click", _lancerRecherche);
      if (searchInput) {
        searchInput.addEventListener("keydown", function(e) {
          if (e.key === "Enter") { e.preventDefault(); _fermerLiveResultats(); _lancerRecherche(); }
          if (e.key === "Escape") { _fermerLiveResultats(); searchInput.blur(); }
        });
      }

      // 🔎 v1.72.1 (KARMA « même principe que la barre OSM ») — résultats EN
      // DIRECT sous la barre, sans passer par la modale. Scan via l'API
      // CrossPlanSearch.rechercher (cache RAM partagé avec la modale, TTL
      // 2 min). Entrée / 🔎 / « Voir tout » = modale complète (exhaustive).
      const liveRes = document.getElementById("loaderSearchResults");
      let _liveJeton = 0;         // anti-race : seule la dernière requête rend
      let _liveDebounce = null;

      function _fermerLiveResultats() {
        if (liveRes) { liveRes.style.display = "none"; liveRes.innerHTML = ""; }
      }

      // Même modèle éprouvé que la recherche OSM : fixed + rect de l'input.
      function _positionnerLive() {
        if (!liveRes || !searchInput) return;
        try {
          const r = searchInput.getBoundingClientRect();
          const vw = window.innerWidth || document.documentElement.clientWidth;
          const largeur = Math.min(Math.max(r.width, 320), vw - 16);
          let gauche = r.left;
          if (gauche + largeur > vw - 8) gauche = vw - 8 - largeur;
          if (gauche < 8) gauche = 8;
          liveRes.style.top   = Math.round(r.bottom + 6) + "px";
          liveRes.style.left  = Math.round(gauche) + "px";
          liveRes.style.width = Math.round(largeur) + "px";
        } catch(e) {}
      }

      function _renderLive(q, jeton) {
        const _t2 = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        // 1) Plans dont le NOM matche (immédiat, registre en RAM)
        const plans = (window.PlanRegistry && window.PlanRegistry.getAll)
          ? (window.PlanRegistry.getAll() || []) : [];
        const plansOk = plans.filter(function(p) {
          return p && p.name && p.name.toLowerCase().indexOf(q) !== -1;
        }).slice(0, 3);

        _positionnerLive();
        liveRes.style.display = "block";
        liveRes.innerHTML = '<div class="loader-search-vide">' + _t2("xps.scanning") + '</div>';

        // 2) Points (async, cache partagé avec la modale)
        if (!window.CrossPlanSearch || typeof window.CrossPlanSearch.rechercher !== "function") return;
        window.CrossPlanSearch.rechercher(q, 8).then(function(res) {
          if (jeton !== _liveJeton) return;   // saisie plus récente en cours
          const pts = res.points || [];
          if (!plansOk.length && !pts.length) {
            liveRes.innerHTML = '<div class="loader-search-vide">' + _t2("xps.noResult") + '</div>';
            return;
          }
          let html = "";
          plansOk.forEach(function(p, i) {
            html += '<button type="button" class="loader-search-row" data-lplan="' + i + '">' +
                    '🗺️ <b>' + escapeHtml(p.name) + '</b></button>';
          });
          pts.forEach(function(e, i) {
            html += '<button type="button" class="loader-search-row" data-lpt="' + i + '">' +
                    (e.pt.source === "session" ? "✏️" : "📄") + ' ' +
                    escapeHtml(e.pt.nom || e.pt.id || (e.pt.x + "," + e.pt.y)) +
                    '<span class="loader-search-badge">' + escapeHtml(window.PlanRegistry.displayName(e.plan)) + '</span>' +
                    '</button>';
          });
          html += '<button type="button" class="loader-search-row loader-search-tous" data-ltous="1">' +
                  _t2("home.search.tousResultats") + '</button>';
          liveRes.innerHTML = html;

          liveRes.querySelectorAll("[data-lplan]").forEach(function(b) {
            b.addEventListener("click", function() {
              const p = plansOk[parseInt(b.getAttribute("data-lplan"), 10)];
              _fermerLiveResultats();
              if (p) chargerPlanDuRegistre(p.id);
            });
          });
          liveRes.querySelectorAll("[data-lpt]").forEach(function(b) {
            b.addEventListener("click", function() {
              const e = pts[parseInt(b.getAttribute("data-lpt"), 10)];
              _fermerLiveResultats();
              if (!e || !window.InterPlanLinks) return;
              // Même pipeline d'arrivée que la modale : chargement du plan,
              // bascule niveau, pan/flash. Depuis le HOME → pas de confirmation.
              window.InterPlanLinks.goTo(e.plan.id, {
                x: e.pt.x, y: e.pt.y, level: e.pt.level,
                tag: (Array.isArray(e.pt.tags) && e.pt.tags[0]) || undefined,
                planName: window.PlanRegistry.displayName(e.plan),
                label: e.pt.nom || e.pt.id || (e.pt.x + "," + e.pt.y)
              }, { confirm: false });
            });
          });
          const tous = liveRes.querySelector("[data-ltous]");
          if (tous) tous.addEventListener("click", function() {
            _fermerLiveResultats();
            if (window.CrossPlanSearch) window.CrossPlanSearch.ouvrir(q);
          });
        });
      }

      if (searchInput && liveRes) {
        searchInput.addEventListener("input", function() {
          const q = String(searchInput.value || "").toLowerCase().trim();
          if (_liveDebounce) clearTimeout(_liveDebounce);
          if (q.length < 2) { _fermerLiveResultats(); return; }
          _liveDebounce = setTimeout(function() {
            _renderLive(q, ++_liveJeton);
          }, 250);
        });
        // Fermer au clic hors de la barre (le clic-résultat vit dans la barre)
        document.addEventListener("click", function(e) {
          if (!liveRes || liveRes.style.display === "none") return;
          const barre = document.getElementById("loaderSearchBar");
          if (barre && !barre.contains(e.target)) _fermerLiveResultats();
        });
      }

      // 📔 v1.69.0 — Le Carnet depuis le home : timeline de toutes les sorties
      // archivées, tous plans confondus (aucun plan à charger).
      const journalBtn = document.getElementById("loaderJournalBtn");
      if (journalBtn) {
        journalBtn.addEventListener("click", function() {
          if (window.JournalUi && typeof window.JournalUi.ouvrir === "function") {
            window.JournalUi.ouvrir();
          } else {
            console.warn("[Home] JournalUi indisponible");
          }
        });
      }

      // 🌀 v1.59.0 (A3) — Gestionnaire de liaisons inter-plan depuis le home :
      // vue globale du registre (état, navigation, suppression), sans plan chargé.
      const linksMgrBtn = document.getElementById("loaderLinksMgrBtn");
      if (linksMgrBtn) {
        linksMgrBtn.addEventListener("click", function() {
          if (window.InterPlanLinks && typeof window.InterPlanLinks.ouvrirGestionnaire === "function") {
            window.InterPlanLinks.ouvrirGestionnaire();
          } else {
            console.warn("[Home] InterPlanLinks.ouvrirGestionnaire indisponible");
          }
        });
      }

      // 🔗 v1.55.0 — Fusionneur de datalayers. 🧹 v1.69.0 : son bouton a quitté
      // le HOME (allègement demandé par KARMA) — il vit désormais comme 4e
      // source de l'Éditeur de données (`tableEditor.js > kta-tbl-src-fusion`),
      // qui appelle le même `ouvrirExportSessionModal("fusion", true)`.

      // (Le bouton "🌐 Plan serveur racine" a été retiré le 08/05/2026 — les plans serveur
      // sont déjà listés dans 📚 Mes plans via auto-discovery `data/index.json`.)

      // ════════════════════════════════════════════════════════
      // GESTION DU REGISTRE DES PLANS (Reprendre / Récents / Tous)
      // ════════════════════════════════════════════════════════

      function fmtDate(iso) {
        if (!iso) return "";
        try {
          const d = new Date(iso);
          return d.toLocaleDateString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
                 " " + d.toLocaleTimeString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { hour: "2-digit", minute: "2-digit" });
        } catch(e) { return ""; }
      }

      function fmtSize(bytes) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        if (!bytes) return "";
        const mo = bytes / 1024 / 1024;
        return mo >= 1 ? mo.toFixed(1) + " " + _t("home.plans.unitMb") : Math.round(bytes / 1024) + " " + _t("home.plans.unitKb");
      }

      // i18n : helper traduction avec fallback FR inline. 🐛 v1.68.1 (audit
      // clés manquantes) : l'ancien test « I18n présent ? » ne protégeait PAS
      // du dico pas-encore-chargé (course au window load) → t() warnait et
      // retournait la version humanisée. I18n.has() teste la présence réelle
      // de la clé (sans warn) : dico pas prêt OU clé absente → fallback FR.
      function _htmlBadgeExtension(idPlan) {
        const bx = window.KtaExtensions && typeof window.KtaExtensions.badgePlan === "function"
          ? window.KtaExtensions.badgePlan(idPlan) : null;
        return bx ? '<span class="plan-row-badge kta-plan-row-ext-badge" title="' + escapeHtml(bx.titre) + '">' +
          escapeHtml(bx.texte) + '</span>' : "";
      }
      window.ktaMajBadgesExtension = function() {
        document.querySelectorAll("[data-ext-badge-for]").forEach(function(slot) {
          const html = _htmlBadgeExtension(slot.getAttribute("data-ext-badge-for"));
          if (slot.innerHTML !== html) slot.innerHTML = html;
        });
      };

      function _homeT(key, fr) {
        if (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(key)) {
          return window.I18n.t(key);
        }
        return (fr !== undefined) ? fr : key;
      }

            // ══════════════════════════════════════════════════════════════
      // 💾 v1.90.0 — BOUTON HORS-LIGNE SUR LA LIGNE (plans SERVEUR)
      // ══════════════════════════════════════════════════════════════
      // Demande KARMA : « offline first oblige, on doit avoir le bouton pour
      // télécharger hors-ligne le plan serveur directement depuis le home ;
      // si DL full, ça devient un bouton de mise à jour. »
      //
      // 🩸 L'ÉTAT VIENT DU CACHE RÉEL, jamais d'un drapeau — même règle que la
      // fiche ℹ️ Infos. Le bouton naît donc CACHÉ (`hidden`) et n'apparaît
      // qu'une fois l'état connu : si le cache est illisible, il reste absent
      // plutôt que de mentir. Un cache purgé par le navigateur fait
      // naturellement repasser le bouton en « télécharger ».
      const _ETATS_DL = {
        absent:    { txt: "⬇️", cle: "home.plans.offline.rowDl",       repli: "Rendre disponible hors-ligne" },
        incomplet: { txt: "⬇️", cle: "home.plans.offline.rowResume",   repli: "Téléchargement incomplet — compléter" },
        partiel:   { txt: "↻",  cle: "home.plans.offline.rowRetry",    repli: "Disponible, mais des fichiers manquent — réessayer" },
        perime:    { txt: "⬇️", cle: "home.plans.offline.rowPerime",   repli: "Nouvelle version sur le serveur — la télécharger" },
        complet:   { txt: "↻",  cle: "home.plans.offline.rowUpdate",   repli: "Disponible hors-ligne — mettre à jour" }
      };

      function _peindreBoutonDl(btn, etat) {
        const meta = _ETATS_DL[etat];
        if (!meta) { btn.hidden = true; return; }
        btn.textContent = meta.txt;
        btn.title       = _homeT(meta.cle, meta.repli);
        btn.dataset.off = etat;
        btn.classList.toggle("kta-dl-ok", etat === "complet" || etat === "extGarde");
        btn.classList.toggle("kta-dl-partiel", etat === "partiel" || etat === "incomplet");
        btn.hidden = false;
      }

      // Un SEUL caches.keys() pour toute la liste (cf PlanOffline.statuts).
      // ☁️ Plans d'une installation reliée : l'état vient de l'extension (sa copie gardée).
      // Gardé = un CONSTAT (✅, sans action) : l'ancien « ↻ mettre à jour » ne faisait rien.
      const _ETAT_EXT = { garde: "extGarde", perime: "perime", absent: "extAbsent" };
      _ETATS_DL.extGarde  = { txt: "✅", cle: "home.plans.offline.rowExtGarde",  repli: "Gardé sur l'appareil, à jour" };
      _ETATS_DL.extAbsent = { txt: "💾", cle: "home.plans.offline.rowExtAbsent", repli: "Garder sur l'appareil (hors ligne)" };
      // Plan LOCAL dont l'archive n'est pas mémorisée (📁) : la mémoriser après coup.
      _ETATS_DL.localPick = { txt: "💾", cle: "home.plans.offline.rowMemoriser", repli: "Mémoriser ce plan dans l'app" };
      const _sondesZip = {};
      async function _rafraichirBoutonsHorsLigne() {
        const X = window.KtaExtensions;
        Array.from(document.querySelectorAll(".kta-plan-row-dl")).forEach(function (b) {
          const row = b.closest(".plan-row");
          const p = row && window.PlanRegistry && window.PlanRegistry.findById(row.dataset.id);
          if (p && p.type === "local") { _peindreBoutonDl(b, "localPick"); return; }
          // 📦 Plan ZIP de l'index : gardé ou pas ; s'il est gardé, une requête HEAD conditionnelle
          // dit s'il est à jour (304) ou périmé (200). Hors ligne : on constate la copie.
          if (p && p.type === "server" && p.zip) {
            if (!p.storedBlob) { _peindreBoutonDl(b, "extAbsent"); return; }
            // La liste se repeint plusieurs fois à l'affichage de l'accueil (mesuré : 3) : une
            // seule sonde par plan toutes les 30 s.
            const _s = _sondesZip[p.id];
            const sonde = (_s && Date.now() - _s.t < 30000 && _s.etag === p.zipEtag) ? _s.pr
              : (_sondesZip[p.id] = { t: Date.now(), etag: p.zipEtag, pr: (function () {
                  // Sonde bornée à 8 s : sans réponse, la copie est constatée (✅), le bouton ne reste pas caché.
                  const ctl = typeof AbortController === "function" ? new AbortController() : null;
                  const delai = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
                  return _telechargerZipIndex(p, null, true, "HEAD", ctl ? ctl.signal : undefined)
                    .finally(function () { clearTimeout(delai); });
                })() }).pr;
            sonde.then(function (r) {
              _peindreBoutonDl(b, r.statut === "frais" ? "perime" : "extGarde");
            }).catch(function () { _peindreBoutonDl(b, "extGarde"); });
            return;
          }
          if (!p || p.type !== "ext" || !X || typeof X.etatHorsLigneExtension !== "function") return;
          X.etatHorsLigneExtension(p.id).then(function (e) { if (e) _peindreBoutonDl(b, _ETAT_EXT[e]); else b.hidden = true; });
        });
        if (!window.PlanOffline || !window.PlanOffline.supporte()) return;
        const btns = Array.from(document.querySelectorAll(".kta-plan-row-dl")).filter(function (b) {
          const row = b.closest(".plan-row");
          const p = row && window.PlanRegistry && window.PlanRegistry.findById(row.dataset.id);
          return p && p.type === "server" && !p.zip;   // 📦 plan ZIP : sa copie, pas le cache du SW
        });
        if (!btns.length) return;
        const ids = btns.map(function (b) {
          const row = b.closest(".plan-row");
          return row ? row.dataset.id : null;
        }).filter(Boolean);
        let etats = {};
        try { etats = await window.PlanOffline.statuts(ids); } catch (e) { return; }
        btns.forEach(function (b) {
          const row = b.closest(".plan-row");
          const st  = row && etats[row.dataset.id];
          if (st) _peindreBoutonDl(b, st.etat);
        });
      }

      // Téléchargement / mise à jour depuis la ligne. Le bouton porte sa propre
      // progression : pas de modale, on reste dans la liste.
      async function _lancerHorsLigneLigne(planId, btn) {
        const plan = window.PlanRegistry && window.PlanRegistry.findById(planId);
        if (plan && plan.type === "local" && !plan.storedBlob) { _memoriserApresCoup(plan); return; }
        if (plan && plan.type === "server" && plan.zip) {
          if (btn.dataset.off === "extGarde") return;   // gardé et à jour : rien à faire
          btn.disabled = true; btn.textContent = "…";
          let ok = false;
          try { ok = await _garderZipIndex(plan); }
          catch (e) { console.warn("[Loader] plan ZIP : garde impossible —", e && e.message); }
          btn.disabled = false;
          if (!ok && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(_homeT("home.plans.offline.rowExtEchec",
              "Téléchargement impossible (serveur injoignable ou stockage plein)"), "warn");
          }
          _rafraichirBoutonsHorsLigne();
          return;
        }
        if (plan && plan.type === "ext" && window.KtaExtensions && typeof window.KtaExtensions.garderPlanExtension === "function") {
          if (btn.dataset.off === "extGarde") return;   // déjà gardé et à jour : rien à faire
          btn.disabled = true; btn.textContent = "…";
          const ok = await window.KtaExtensions.garderPlanExtension(planId);
          btn.disabled = false;
          if (!ok && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(_homeT("home.plans.offline.rowExtEchec", "Téléchargement impossible (serveur injoignable ou stockage plein)"), "warn");
          }
          _rafraichirBoutonsHorsLigne();
          return;
        }
        if (!plan || plan.type !== "server" || !window.PlanOffline) return;
        const avant = { txt: btn.textContent, title: btn.title };
        btn.disabled = true;
        btn.textContent = "…";
        try {
          const r = await window.PlanOffline.precacher(plan, function (p) {
            const pct = p.total ? Math.round((p.fait / p.total) * 100) : 0;
            btn.title = _homeT("home.plans.offline.rowProgress", "Téléchargement…") + " " + pct + " %";
          });
          if (r && r.echecs) {
            console.warn("[Loader] hors-ligne : " + r.echecs + " fichier(s) introuvable(s) —", r.manquants);
          }
        } catch (e) {
          console.warn("[Loader] hors-ligne échec :", e && e.message);
          btn.textContent = avant.txt;
          btn.title = avant.title;
        }
        btn.disabled = false;
        // On RELIT le cache plutôt que de croire le résultat retourné.
        _rafraichirBoutonsHorsLigne();
      }

      // 💾 Mémoriser APRÈS COUP un plan local chargé sans copie (réglage « Mémoriser le
      // plan dans l'app » décoché) : on redemande son ZIP — le navigateur ne l'a pas
      // gardé —, on vérifie que c'est bien ce plan (nom), puis on range la copie. Le
      // plan n'est pas ouvert.
      async function _memoriserApresCoup(plan) {
        const t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k) { return k; };
        const toast = function(m, ty) { if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(m, ty); };
        const file = await new Promise(function(resolve) {
          const input = document.createElement("input");
          input.type = "file"; input.accept = ".zip,application/zip";
          input.onchange = function() { resolve(input.files[0] || null); };
          input.click();
        });
        if (!file) return;
        try {
          const zip = await JSZip.loadAsync(file);
          const entree = zip.file(/(^|\/)plan-config\.json$/)[0];
          if (!entree) throw new Error(t("home.plans.offline.errSansConfig"));
          const cfg = JSON.parse(await entree.async("string"));
          const nomZip = String((cfg.plan && cfg.plan.name) || "").trim();
          const nomPlan = String(plan.name || "").trim();
          if (nomZip && nomPlan && nomZip !== nomPlan) { await _afficherModaleNomZipKO(nomZip, nomPlan); return; }
          if (window.PlanRegistry.requestPersistentStorage) await window.PlanRegistry.requestPersistentStorage();
          const r = await window.PlanRegistry.saveBlob(plan.id, file);
          if (!r || !r.ok) throw new Error((r && r.error) || t("home.plans.offline.errStockage"));
          window.PlanRegistry.addOrUpdate({ id: plan.id, storedBlob: true, originalFilename: file.name, fileSize: file.size });
          toast(t("home.plans.offline.memoriseOk"), "info");
        } catch (e) {
          console.warn("[Loader] mémorisation après coup :", e);
          toast(t("home.plans.offline.memoriseEchec") + " " + String((e && e.message) || e).slice(0, 100), "warn");
        }
        if (typeof window.refreshPlansList === "function") window.refreshPlansList();
      }

      // ☁️ Après « Publier ce plan » : remplacer la copie locale par la version ☁️.
      // Les données de l'appareil (session, photos, favoris, liaisons, calage) passent
      // sur la version ☁️ ; la synchro de l'extension les envoie à la première
      // ouverture (tout objet plus récent que le dernier envoi — aucun pour un plan neuf).
      async function _basculerVersPublie(planLocal, planPublie) {
        const t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k) { return k; };
        const toast = function(m, ty) { if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(m, ty); };
        const PR = window.PlanRegistry;
        if (!planPublie || !planPublie.id || typeof window.ktaIdRegistreExtension !== "function" ||
            typeof PR.transferAssociatedData !== "function") return false;
        if (window._currentLoadedPlanId === planLocal.id && typeof window.ktaPlanAffiche === "function" && window.ktaPlanAffiche()) return false;
        const oui = await window.ktaConfirm(
          t("home.plans.info.basculeMsg", { nom: escapeHtml(PR.displayName(planLocal)) }),
          { titre: t("home.plans.info.basculeTitre"), okLabel: t("home.plans.info.basculeOk") });
        if (!oui) return false;
        // L'entrée ☁️ arrive par la relecture de la liste (événement de publication).
        const idExt = window.ktaIdRegistreExtension(planPublie.id);
        for (let i = 0; i < 40 && !PR.findById(idExt); i++) await new Promise(function(r) { setTimeout(r, 250); });
        if (!PR.findById(idExt)) { toast(t("home.plans.info.basculeEchec"), "warn"); return false; }
        const bilan = await PR.transferAssociatedData(planLocal.id, idExt);
        if (!bilan.ok) { toast(t("home.plans.info.basculeEchec"), "warn"); return false; }
        if (planLocal.pinned) PR.setPinned(idExt, true);
        PR.remove(planLocal.id);   // entrée + archive locale ; ses sauvegardes de session suivent la purge des orphelins
        if (typeof PR.purgeAssociatedData === "function") { try { await PR.purgeAssociatedData(planLocal.id); } catch (e) { /* rien */ } }
        console.log("[Loader] ☁️ copie locale remplacée par la version publiée :", planLocal.id, "→", idExt, bilan);
        toast(t("home.plans.info.basculeOkToast", { photos: bilan.photos }), "info");
        return true;
      }

function planRowHTML(plan) {
        let icon = plan.type === "server" ? "🌐" : plan.type === "ext" ? "☁️" : "💾";   // 🧩 v2.7.0 : ☁️ = plan d'extension
        // Badge de persistance (plans locaux) — différencier visuellement les
        // modes de stockage (blob/fsHandle/pick).
        let badgeStorage = "";
        if (plan.type === "local") {
          if (plan.storedBlob) {
            badgeStorage = '<span class="plan-row-badge plan-row-badge-stored" title="' + _homeT("home.plans.badge.stored", "Plan mémorisé dans l'app") + '">✅</span>';
          } else if (plan.fsHandleId) {
            badgeStorage = '<span class="plan-row-badge plan-row-badge-fs" title="' + _homeT("home.plans.badge.fs", "Accès permanent autorisé") + '">🔐</span>';
          } else {
            badgeStorage = '<span class="plan-row-badge plan-row-badge-pick" title="' + _homeT("home.plans.badge.pick", "Re-sélection requise au chargement") + '">📁</span>';
          }
        }
        // 🧩 Badge fourni par une installation reliée (ex. « 👥 2 » : qui a ce plan ouvert) — texte échappé.
        // Emplacement identifié : mis à jour seul quand l'activité change (window.ktaMajBadgesExtension),
        // sans redessiner la liste entière (audit UI du 05/10/2026 : boutons qui clignotaient).
        if (plan.type === "ext" && window.KtaExtensions && typeof window.KtaExtensions.badgePlan === "function") {
          badgeStorage += '<span class="kta-plan-row-ext-badge-slot" data-ext-badge-for="' + escapeHtml(plan.id) + '">' +
            _htmlBadgeExtension(plan.id) + '</span>';
        }
        // 🏗️ Mode badges (v150) : V2 tuilé (violet), Multi-niveau (jaune), V1 (gris).
        // Plusieurs badges peuvent coexister (un plan V2 peut aussi être multi-niveau).
        // Si aucun flag → badge V1 implicite (mode classique).
        // 📐 v170 : les badges modes passent sur LIGNE 2 (sous le nom du plan)
        // — la ligne 1 contient juste le nom + version + badge storage. Évite
        // que les noms longs poussent les badges modes en ellipsis.
        let badgesMode = "";
        if (plan.tiledV2 === true) {
          badgesMode += '<span class="plan-row-mode plan-row-mode-v2" title="' + _homeT("home.plans.mode.v2", "Plan tuilé V2 (performance, Google Maps-like)") + '">V2</span>';
        }
        if (plan.multiLevel === true) {
          badgesMode += '<span class="plan-row-mode plan-row-mode-mlvl" title="' + _homeT("home.plans.mode.mlvl", "Plan multi-niveau (carrière multi-étages)") + '">M-LVL</span>';
        }
        if (!badgesMode) {
          badgesMode = '<span class="plan-row-mode plan-row-mode-v1" title="' + _homeT("home.plans.mode.v1", "Plan classique (mono-niveau, image entière en RAM)") + '">V1</span>';
        }
        // Structure (v170 suite 3 — épuration affichage compact) :
        // - .plan-row-title = ligne 1 : nom (ellipsis) + version uniquement
        // - .plan-row-modes = ligne 2 : badges V1/V2/M-LVL + badge storage (✅/🔐/📁)
        // - Sub (nom zip + taille) et date d'ouverture déplacés vers la
        //   modale ℹ️ Informations détaillées (bouton dans .plan-row-actions).
        //   Allège la liste, surtout quand on en a beaucoup.
        // 🏷️ v1.78.0 — tags du plan en mini-chips sur la ligne 2 (après les
        // badges de mode) + bouton ⭐/☆ d'épinglage dans les actions.
        let tagsHtml = "";
        if (Array.isArray(plan.tags) && plan.tags.length) {
          tagsHtml = plan.tags.map(function(tg) {
            return '<span class="kta-plan-row-tag">' + escapeHtml(tg) + '</span>';
          }).join("");
        }
        const pinTitle = plan.pinned
          ? _homeT("home.plans.unpinTitle", "Désépingler ce plan")
          : _homeT("home.plans.pinTitle", "Épingler ce plan en tête de liste");
        // 📁 16/09/2026 — dossier du plan : pastille de couleur devant le nom
        // (dans les deux modes), case de sélection et bouton « Déplacer vers »
        // (mode Dossiers seulement — le mode TOUT reste l'écran d'avant).
        const _fid  = window.PlanRegistry.planFolderId ? window.PlanRegistry.planFolderId(plan) : null;
        const _fold = _fid ? window.PlanRegistry.findFolder(_fid) : null;
        const _parRegle = !!(_fold && window.PlanRegistry.planFolderByRule && window.PlanRegistry.planFolderByRule(plan));
        // 🐛 16/09 (KARMA : « la pastille est coupée de quelques pixels ») — le
        // titre est en overflow:hidden et la pastille en est le PREMIER item :
        // l'ombre extérieure qui signalait « par règle » débordait à gauche et
        // se faisait rogner. La couleur passe en variable CSS et le contour
        // « règle » est dessiné À L'INTÉRIEUR de la pastille (ombre inset).
        const dotHtml = _fold ? '<span class="kta-plan-row-folder-dot' + (_parRegle ? " kta-plan-row-folder-dot-rule" : "") + '" style="--kta-dot:' + escapeHtml(_fold.color || "#8cb4ff") + '" title="' + escapeHtml(_fold.name + (_parRegle ? " · " + _homeT("home.plans.folders.byRule", "par règle d'étiquette") : "")) + '"></span>' : "";
        const enDossiers = (_plansVue === "folders");
        const selectionnee = enDossiers && _plansSelectMode && _plansSelection.has(plan.id);
        const caseHtml = (enDossiers && _plansSelectMode)
          ? '<span class="kta-plan-row-check' + (selectionnee ? " kta-actif" : "") + '" aria-hidden="true"></span>' : "";
        // (KARMA, après v1.95.0 : « enlève le bouton Déplacer vers sur chaque plan,
        // le glisser-déposer ou le bouton de sélection en haut suffisent »)
        const moveBtn = "";
        const glissable = (enDossiers && _plansDragOk()) ? ' draggable="true"' : "";
        return `
          <div class="plan-row${plan.pinned ? " kta-plan-row-pinned" : ""}${selectionnee ? " kta-plan-row-selected" : ""}" data-id="${plan.id}"${glissable} title="${_homeT("home.plans.loadBtnTitle", "Charger ce plan")}">
            ${caseHtml}<span class="plan-row-icon">${icon}</span>
            <div class="plan-row-info">
              <div class="plan-row-title">
                ${dotHtml}<span class="plan-row-name-text">${escapeHtml(window.PlanRegistry.displayName(plan))}</span>
              </div>
              <div class="plan-row-modes">${badgesMode}${badgeStorage}${tagsHtml}</div>
            </div>
            <div class="plan-row-actions">
              ${moveBtn}<button class="plan-row-btn kta-plan-row-pin${plan.pinned ? " kta-actif" : ""}" title="${pinTitle}">${plan.pinned ? "⭐" : "☆"}</button>
              ${(plan.type === "local" && !plan.storedBlob) ? `<button class="plan-row-btn kta-plan-row-dl" data-off="localPick"
                title="${_homeT("home.plans.offline.rowMemoriser", "Mémoriser ce plan dans l'app")}">💾</button>` : ""}
              ${plan.type === "server" || (plan.type === "ext" && window.KtaExtensions &&
                window.KtaExtensions.horsLigneExtensionDisponible()) ? `<button class="plan-row-btn kta-plan-row-dl" data-off="?" hidden
                title="${_homeT("home.plans.offline.rowWait", "Vérification…")}">⏳</button>` : ""}
              <button class="plan-row-btn plan-row-info-btn" title="${_homeT("home.plans.infoBtnTitle", "Informations détaillées sur cette archive")}">ℹ️</button>
            </div>
          </div>
        `;
      }

      // 🏷️ v1.78.0 — ORGANISATION DE LA LISTE (décision KARMA « 1, 3, 4 ») :
      // tags par plan (chips-filtres, édition dans ℹ️ Infos), épinglage ⭐
      // (remonte en tête), filtre par nom. Les filtres sont RAM only.
      let _plansNameFilter = "";     // minuscule, "" = pas de filtre
      let _plansTagFilter  = null;   // Set<string> (clés minuscules) | null
      // 📁 16/09/2026 — mode Dossiers : état d'écran (le registre est la source
      // du mode, des dossiers et des appartenances ; ici, seulement l'éphémère).
      let _plansVue = "all";                 // "all" | "folders", relu à chaque rendu
      let _plansSelectMode = false;          // sélection multiple (mode Dossiers)
      const _plansSelection = new Set();     // ids sélectionnés
      let _nonClassesReplie = false;         // repli de « Non classés » (RAM)
      const _mobileDeplies = new Set();      // dossiers dépliés par « Tout le dossier » (mobile, session)
      let _dragPlanId = null;                // id de la ligne en cours de glisser (souris)
      function _plansDragOk() { return !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches); }
      function _lireVuePlans() {
        const PR = window.PlanRegistry;
        if (!PR || typeof PR.getPlansView !== "function") return "all";
        if (PR.hasPlansViewChoice()) return PR.getPlansView();
        return (window._ktaPlansViewParDefaut === "folders") ? "folders" : "all";   // kiosque, seulement si jamais choisi
      }

      // 🌐 v170 : helpers de filtrage "Afficher plans serveur" (persisté localStorage)
      const LS_SHOW_SERVER = "myktamap_loader_show_server_plans";
      function _loaderShowServerPlans() {
        // Default = true (affiche les plans serveur). On retourne false UNIQUEMENT
        // si l'user a explicitement décoché ET que la valeur est en localStorage.
        return localStorage.getItem(LS_SHOW_SERVER) !== "false";
      }
      function _loaderSetShowServerPlans(value) {
        localStorage.setItem(LS_SHOW_SERVER, value ? "true" : "false");
      }

      // 🆕 v1.21.3 (KARMA "ne pas charger les plan serveur au démarrage") :
      // pref dédiée — désactive l'auto-discovery serveur (`data/index.json`)
      // au boot, masque le toggle "Afficher plans serveur" du home, et filtre
      // les plans `type === "server"` des stats agrégées du bandeau profil.
      // Default = false (rétrocompat : comportement v1.21.0+ inchangé pour
      // les users qui n'ont jamais touché cette pref).
      // 🔍 Exposé global pour permettre à main.js d'y accéder au boot.
      const LS_SKIP_SERVER = "myktamap_skip_server_plans_v1";
      // Jamais choisi par l'utilisateur → défaut de l'instance : `index.json >
      // config.sitePlansHiddenDefault: true` (installation où tout vit en base).
      // Sans effet en kiosque `serverPlansOnly` (les plans du site y sont les seuls).
      window._loaderSkipServerPlans = function() {
        let v = null;
        try { v = localStorage.getItem(LS_SKIP_SERVER); } catch (e) { v = null; }
        if (v === null) {
          const cfg = window.KIOSK_CONFIG || {};
          return cfg.sitePlansHiddenDefault === true && cfg.serverPlansOnly !== true;
        }
        return v === "true";
      };
      function _loaderSetSkipServerPlans(value) {
        localStorage.setItem(LS_SKIP_SERVER, value ? "true" : "false");
      }

      // ════════════════════════════════════════════════════════════════════
      // 🚫 v171 : Modale "Erreur — nom du ZIP ne correspond pas"
      // ════════════════════════════════════════════════════════════════════
      // Affichée quand l'user re-sélectionne un ZIP dont le `plan.name` ne
      // matche pas avec le plan sur lequel il a cliqué. Refus DÉFINITIF —
      // un seul bouton "J'ai compris" qui ferme la modale + retour sans
      // charger le ZIP. Pattern .kta-readme-modal pour cohérence charte.
      function _afficherModaleNomZipKO(zipName, planName) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        return new Promise(function(resolve) {
          const existing = document.getElementById("kta-zipname-error-modal");
          if (existing) existing.remove();

          const modal = document.createElement("div");
          modal.id = "kta-zipname-error-modal";
          modal.className = "kta-readme-modal-overlay";
          modal.innerHTML =
            '<div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:80vh; border:1px solid rgba(255,140,140,0.35);">' +
              '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,140,140,0.20);">' +
                '<span class="kta-readme-modal-titre" style="color:#ff8c8c;">' + _t("home.plans.nameKO.title") + '</span>' +
                '<button class="kta-panneau-close" id="kta-zipname-error-close">✕</button>' +
              '</div>' +
              '<div class="kta-readme-modal-corps">' +
                '<p style="font-size:13px; color:#c0c8d8; line-height:1.6; margin:0 0 14px;">' +
                  _t("home.plans.nameKO.body") +
                '</p>' +
                '<div style="display:grid; grid-template-columns:auto 1fr; gap:8px 12px; font-size:13px; padding:10px 12px; background:rgba(255,140,140,0.06); border:1px solid rgba(255,140,140,0.22); border-radius:6px; margin-bottom:14px;">' +
                  '<span style="color:#8892a4; white-space:nowrap;">' + _t("home.plans.nameKO.targetLabel") + '</span>' +
                  '<strong style="color:#e8eaf0; word-break:break-word;">' + escapeHtml(planName) + '</strong>' +
                  '<span style="color:#8892a4; white-space:nowrap;">' + _t("home.plans.nameKO.providedLabel") + '</span>' +
                  '<strong style="color:#ff8c8c; word-break:break-word;">' + escapeHtml(zipName) + '</strong>' +
                '</div>' +
                '<p style="font-size:12.5px; color:#8892a4; line-height:1.5; margin:0 0 14px; font-style:italic;">' +
                  _t("home.plans.nameKO.hint") +
                '</p>' +
                '<div style="display:flex; justify-content:flex-end;">' +
                  '<button class="kta-btn kta-btn-primary" id="kta-zipname-error-ok">' + _t("home.plans.nameKO.ok") + '</button>' +
                '</div>' +
              '</div>' +
            '</div>';
          document.documentElement.appendChild(modal);

          const _close = function() {
            modal.remove();
            document.removeEventListener("keydown", _onEsc);
            resolve();
          };
          document.getElementById("kta-zipname-error-close").addEventListener("click", _close);
          document.getElementById("kta-zipname-error-ok").addEventListener("click", _close);
          modal.addEventListener("click", function(e) { if (e.target === modal) _close(); });
          const _onEsc = function(ev) { if (ev.key === "Escape") _close(); };
          document.addEventListener("keydown", _onEsc);
        });
      }

      // ════════════════════════════════════════════════════════════════════
      // ⚠️ v171 : Modale "Mode différent détecté"
      // ════════════════════════════════════════════════════════════════════
      // Affichée quand le ZIP fourni a des flags (tiledV2, multiLevel) qui
      // diffèrent du registre. Pas un refus — l'user peut continuer (le
      // contenu du ZIP fait foi, sync automatique). Couleur orange (warning).
      // Returns Promise<boolean> : true = continuer, false = annuler.
      function _afficherModaleModeDifferent(planName, discordances) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        return new Promise(function(resolve) {
          const existing = document.getElementById("kta-mode-warn-modal");
          if (existing) existing.remove();

          const lignesHtml = discordances.map(function(d) {
            return '<div style="padding:10px 12px; background:rgba(255,179,128,0.06); border:1px solid rgba(255,179,128,0.22); border-radius:6px; margin-bottom:8px;">' +
                     '<div style="font-size:13px; font-weight:600; color:#ffb380; margin-bottom:6px;">' + escapeHtml(d.flag) + '</div>' +
                     '<div style="font-size:12px; color:#c0c8d8; line-height:1.6;">' +
                       '<span style="color:#8892a4;">' + _t("home.plans.modeWarn.savedLabel") + '</span> ' + escapeHtml(d.avant) + '<br>' +
                       '<span style="color:#8892a4;">' + _t("home.plans.modeWarn.zipLabel") + '</span> <strong style="color:#e8eaf0;">' + escapeHtml(d.apres) + '</strong>' +
                     '</div>' +
                   '</div>';
          }).join("");

          const modal = document.createElement("div");
          modal.id = "kta-mode-warn-modal";
          modal.className = "kta-readme-modal-overlay";
          modal.innerHTML =
            '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:85vh; border:1px solid rgba(255,179,128,0.35);">' +
              '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,179,128,0.20);">' +
                '<span class="kta-readme-modal-titre" style="color:#ffb380;">' + _t("home.plans.modeWarn.title") + '</span>' +
                '<button class="kta-panneau-close" id="kta-mode-warn-close">✕</button>' +
              '</div>' +
              '<div class="kta-readme-modal-corps">' +
                '<p style="font-size:13px; color:#c0c8d8; line-height:1.6; margin:0 0 12px;">' +
                  _t("home.plans.modeWarn.body", { nom: escapeHtml(planName) }) +
                '</p>' +
                lignesHtml +
                '<p style="font-size:12.5px; color:#8892a4; line-height:1.5; margin:12px 0 16px; font-style:italic;">' +
                  _t("home.plans.modeWarn.hint") +
                '</p>' +
                '<div style="display:flex; gap:10px; justify-content:flex-end;">' +
                  '<button class="kta-btn kta-btn-ghost" id="kta-mode-warn-cancel">' + _t("home.plans.modeWarn.cancel") + '</button>' +
                  '<button class="kta-btn kta-btn-primary" id="kta-mode-warn-ok">' + _t("home.plans.modeWarn.continue") + '</button>' +
                '</div>' +
              '</div>' +
            '</div>';
          document.documentElement.appendChild(modal);

          const _close = function(result) {
            modal.remove();
            document.removeEventListener("keydown", _onEsc);
            resolve(!!result);
          };
          document.getElementById("kta-mode-warn-close").addEventListener("click", function() { _close(false); });
          document.getElementById("kta-mode-warn-cancel").addEventListener("click", function() { _close(false); });
          document.getElementById("kta-mode-warn-ok").addEventListener("click", function() { _close(true); });
          modal.addEventListener("click", function(e) { if (e.target === modal) _close(false); });
          const _onEsc = function(ev) { if (ev.key === "Escape") _close(false); };
          document.addEventListener("keydown", _onEsc);
        });
      }

      // ℹ️ v170 (suite 3) : Modale "Informations détaillées sur l'archive".
      // Liste tous les attributs du plan stockés dans le PlanRegistry (id,
      // type, persistance, dates, modes, fichier source...). Le bouton ℹ️
      // dans la ligne plan ouvre cette modale. Compense le retrait du sub
      // (nom zip + taille) et de la date d'ouverture qui surchargeaient
      // visuellement la liste compacte.
      function _afficherInfosPlan(id) {
        if (!window.PlanRegistry) return;
        const plan = window.PlanRegistry.findById(id);
        if (!plan) { console.warn("[Loader] Plan introuvable :", id); return; }

        // Cleanup d'une éventuelle modale déjà ouverte
        const existing = document.getElementById("kta-plan-infos-modal");
        if (existing) existing.remove();

        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        // Labels lisibles pour les champs techniques
        const typeLabel = plan.type === "server" ? _t("home.plans.info.typeServer") :
                          plan.type === "local"  ? _t("home.plans.info.typeLocal")  :
                          plan.type;
        let storageLabel = "—";
        if (plan.type === "local") {
          if (plan.storedBlob)      storageLabel = _t("home.plans.info.storedBlob");
          else if (plan.fsHandleId) storageLabel = _t("home.plans.info.storedFs");
          else                      storageLabel = _t("home.plans.info.storedPick");
        }
        let modesParts = [];
        if (plan.tiledV2 === true)    modesParts.push(_t("home.plans.info.modeV2"));
        if (plan.multiLevel === true) modesParts.push(_t("home.plans.info.modeMlvl"));
        if (modesParts.length === 0)  modesParts.push(_t("home.plans.info.modeV1"));
        const modesLabel = modesParts.join(" + ");

        // Liste des champs à afficher (ordre cohérent : identité → source → tech → dates)
        const rows = [];
        function pushRow(label, value, mono) {
          if (value === undefined || value === null || value === "") return;
          rows.push({ label: label, value: String(value), mono: !!mono });
        }
        pushRow(_t("home.plans.info.keyId"),      plan.id, true);
        pushRow(_t("home.plans.info.keyName"),    plan.name);
        pushRow(_t("home.plans.info.keyVersion"), plan.version);
        pushRow(_t("home.plans.info.keyAuthor"),  plan.author);
        rows.push({ label: _t("home.plans.info.keyType"), value: typeLabel, mono: false });
        if (plan.type === "server") {
          pushRow(_t("home.plans.info.keyServerPath"), plan.zip || plan.path, true);
        } else if (plan.type === "local") {
          pushRow(_t("home.plans.info.keySourceFile"), plan.originalFilename, true);
          pushRow(_t("home.plans.info.keySize"),       plan.fileSize ? fmtSize(plan.fileSize) : null);
          rows.push({ label: _t("home.plans.info.keyPersistence"), value: storageLabel, mono: false });
        }
        rows.push({ label: _t("home.plans.info.keyMode"), value: modesLabel, mono: false });
        // 🖼️ v1.90.2 — le preset n'est plus une ligne de tableau en lecture
        // seule : il est devenu un CONTRÔLE, plus bas, et seulement pour les
        // plans que ça concerne (cf. `tuilageHtml`).
        pushRow(_t("home.plans.info.keyAddedAt"),    plan.addedAt    ? fmtDate(plan.addedAt)    : null);
        pushRow(_t("home.plans.info.keyLastOpened"), plan.lastOpened ? fmtDate(plan.lastOpened) : (plan.discovered ? _t("home.plans.info.neverOpened") : null));

        // ═══ 🖼️ TUILAGE — LE SEUL POINT DE RÉGLAGE (v1.90.2, décision KARMA) ═══
        // « enlève la possibilité de régler ce truc [au HOME]. On est en auto
        //   tout le temps. […] On peut à la rigueur le mettre dans info, d'un
        //   plan pour lequel ça a une pertinence (V1). »
        //
        // 🩸 IL NE S'AFFICHE QUE SI ÇA CHANGE QUELQUE CHOSE. Sur un plan tuilé
        // V2 — le cas courant, et le process conseillé — la branche tuiles est
        // prise AVANT le preset : « Désactivé » n'y a aucun effet, il est
        // seulement journalisé. Proposer le réglage là aurait été proposer un
        // interrupteur débranché.
        // ⚠️ `tiledV2` n'est connu qu'une fois le plan ouvert une première fois
        // (ou annoncé par l'index d'un serveur). Un plan jamais ouvert affiche
        // donc le contrôle ; il disparaît de lui-même à la première ouverture
        // si le plan s'avère V2. Assumé : le défaut « Auto » ne casse rien.
        // 🩸 Et contrairement à l'ancien sélecteur du HOME, celui-ci est
        // MÉMORISÉ pour ce plan — l'autre repartait à « Auto » à chaque
        // démarrage, ce qui en faisait un réglage qui n'en était pas un.
        let tuilageHtml = "";
        if (plan.tiledV2 !== true) {
          const _presetCur = (plan.perfPreset === "off") ? "off" : "auto";
          tuilageHtml =
            '<div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07);">' +
              '<div style="font-weight:600; margin-bottom:6px;">🖼️ ' + escapeHtml(_t("home.plans.info.tilingTitle")) + '</div>' +
              '<select class="kta-cfg-input" id="kta-plan-tiling-select" style="width:100%;">' +
                '<option value="auto"' + (_presetCur === "auto" ? " selected" : "") + '>' + escapeHtml(_t("home.perf.presetAuto")) + '</option>' +
                '<option value="off"'  + (_presetCur === "off"  ? " selected" : "") + '>' + escapeHtml(_t("home.perf.presetOff"))  + '</option>' +
              '</select>' +
              '<div style="display:flex; align-items:center; gap:10px; margin-top:8px;">' +
                '<span id="kta-plan-tiling-status" style="font-size:12px; color:#8892a4;"></span>' +
              '</div>' +
            '</div>';
        }

        const tableHtml = rows.map(function(r) {
          const valStyle = r.mono ? ' style="font-family:monospace; font-size:11.5px; color:#c8d0e0;"' : '';
          return '<tr>' +
                   '<td class="kta-info-key">' + escapeHtml(r.label) + '</td>' +
                   '<td class="kta-info-val"' + valStyle + '>' + escapeHtml(r.value) + '</td>' +
                 '</tr>';
        }).join("");

        // 💾 v1.74.0 — RÉCUPÉRATION DU ZIP (demande KARMA : « j'ai supprimé les
        // zip de mon PC, le seul truc qui subsiste c'est la DB du navigateur »).
        // L'export de profil n'embarque PAS les archives (exclu par design, cf.
        // profileExportImport.js) — sans ce bouton, un ZIP mémorisé dans le
        // navigateur était définitivement inatteignable.
        //
        // 3 états, et on AFFICHE le bouton grisé au lieu de le masquer quand la
        // récupération est impossible : masqué, l'user chercherait pourquoi
        // certains plans l'ont et pas d'autres.
        //   • plan serveur      → pas de bouton du tout (retéléchargeable, rien à sauver)
        //   • storedBlob        → actif
        //   • fsHandle / re-pick → grisé + raison (le ZIP vit sur le disque, pas ici)
        let dlHtml = "";
        if (plan.type === "local") {
          if (plan.storedBlob) {
            dlHtml = '<button class="kta-btn kta-btn-primary kta-btn-small" id="kta-plan-dl-zip" ' +
                     'title="' + escapeHtml(_t("home.plans.info.dlZipTitle")) + '">💾 ' +
                     escapeHtml(_t("home.plans.info.dlZip")) + '</button>';
          } else {
            const raison = plan.fsHandleId ? _t("home.plans.info.dlZipFs") : _t("home.plans.info.dlZipPick");
            dlHtml = '<button class="kta-btn kta-btn-ghost kta-btn-small" disabled ' +
                     'style="opacity:.5; cursor:not-allowed;">💾 ' + escapeHtml(_t("home.plans.info.dlZip")) +
                     '</button>' +
                     '<div style="font-size:11.5px; color:#8892a4; margin-top:6px; line-height:1.45;">' +
                     escapeHtml(raison) + '</div>';
          }
        }

        // 💾 v1.87.0 — DISPONIBILITÉ HORS-LIGNE (plans SERVEUR uniquement).
        // Un plan local vit déjà dans IndexedDB ; un plan serveur, non : il ne
        // survivait que par le cache au vol du SW, plafonné à 800 entrées et
        // purgé à chaque release. Cf js/planOffline.js pour le détail.
        // ⚠️ L'état est rendu APRÈS coup, depuis le cache RÉEL (asynchrone) —
        // jamais depuis un drapeau, sinon un cache purgé laisserait un bouton
        // fantôme annonçant « disponible » sur du vide (exigence KARMA).
        let offlineHtml = "";
        if (plan.type === "server" && !plan.zip && window.PlanOffline && window.PlanOffline.supporte()) {
          offlineHtml =
            '<div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07);">' +
              '<div style="font-weight:600; margin-bottom:6px;">💾 ' +
                escapeHtml(_t("home.plans.offline.titre")) + '</div>' +
              '<div id="kta-plan-offline-zone" style="min-height:28px;">' +
                '<span style="font-size:12px; color:#8892a4;">⏳</span>' +
              '</div>' +
            '</div>';
        }

        const modal = document.createElement("div");
        modal.id = "kta-plan-infos-modal";
        modal.className = "kta-readme-modal-overlay";
        modal.innerHTML =
          '<div class="kta-readme-modal-boite kta-plan-infos-boite">' +
            '<div class="kta-readme-modal-header">' +
              '<span class="kta-readme-modal-titre">' + _t("home.plans.info.title", {nom: escapeHtml(window.PlanRegistry.displayName(plan))}) + '</span>' +
              '<button class="kta-panneau-close" id="kta-plan-infos-close">✕</button>' +
            '</div>' +
            '<div class="kta-readme-modal-corps">' +
              '<table class="kta-plan-infos-table">' + tableHtml + '</table>' +
              // 🏷️ v1.78.0 — édition des tags du plan (saisie libre, séparés
              // par des virgules ; normalisation côté PlanRegistry.setTags).
              // ✏️ v1.79.1 — renommage d'AFFICHAGE (cas KARMA : deux plans
              // homonymes d'auteurs différents). Le vrai nom (table keyName
              // ci-dessus) reste intact : re-sélection de ZIP, session et
              // détection de doublon continuent de s'y référer.
              '<div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07);">' +
                '<div style="font-weight:600; margin-bottom:6px;">✏️ ' + escapeHtml(_t("home.plans.info.renameTitle")) + '</div>' +
                '<input class="kta-cfg-input" id="kta-plan-rename-input" type="text" style="width:100%;" maxlength="40" ' +
                  'placeholder="' + escapeHtml(plan.name || plan.id) + '" ' +
                  'value="' + escapeHtml(plan.displayName || "") + '">' +
                '<div style="display:flex; align-items:center; gap:10px; margin-top:8px;">' +
                  '<button class="kta-btn kta-btn-primary kta-btn-small" id="kta-plan-rename-save">💾 ' + escapeHtml(_t("home.plans.info.renameSave")) + '</button>' +
                  '<span id="kta-plan-rename-status" style="font-size:12px; color:#8892a4;"></span>' +
                '</div>' +
                '<div style="font-size:11.5px; color:#8892a4; margin-top:6px; line-height:1.45;">' + escapeHtml(_t("home.plans.info.renameHint")) + '</div>' +
              '</div>' +
              '<div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07);">' +
                '<div style="font-weight:600; margin-bottom:6px;">🏷️ ' + escapeHtml(_t("home.plans.info.tagsTitle")) + '</div>' +
                '<input class="kta-cfg-input" id="kta-plan-tags-input" type="text" style="width:100%;" ' +
                  'placeholder="' + escapeHtml(_t("home.plans.info.tagsPlaceholder")) + '" ' +
                  'value="' + escapeHtml(Array.isArray(plan.tags) ? plan.tags.join(", ") : "") + '">' +
                '<div style="display:flex; align-items:center; gap:10px; margin-top:8px;">' +
                  '<button class="kta-btn kta-btn-primary kta-btn-small" id="kta-plan-tags-save">💾 ' + escapeHtml(_t("home.plans.info.tagsSave")) + '</button>' +
                  '<span id="kta-plan-tags-status" style="font-size:12px; color:#8892a4;"></span>' +
                '</div>' +
                '<div style="font-size:11.5px; color:#8892a4; margin-top:6px; line-height:1.45;">' + escapeHtml(_t("home.plans.info.tagsHint")) + '</div>' +
              '</div>' +
              tuilageHtml +
              (dlHtml ? '<div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07);">' +
                        dlHtml +
                        '<div id="kta-plan-dl-status" style="font-size:12px; margin-top:8px; min-height:16px;"></div>' +
                        '</div>' : '') +
              offlineHtml +
              // ☁️ Plan LOCAL + installation reliée qui sait publier (prise publierPlan) :
              // l'envoyer sur l'installation, sans repasser par le Générateur.
              ((plan.type !== "ext" && plan.type !== "server" && window.KtaExtensions &&
                typeof window.KtaExtensions.aPrise === "function" && window.KtaExtensions.aPrise("publierPlan"))
                ? '<div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07);">' +
                    '<div style="font-weight:600; margin-bottom:6px;">☁️ ' + escapeHtml(_t("home.plans.info.publishTitle")) + '</div>' +
                    '<button class="kta-btn kta-btn-primary kta-btn-small" id="kta-plan-publish">☁️ ' +
                      escapeHtml(_t("home.plans.info.publishBtn")) + '</button>' +
                    '<div id="kta-plan-publish-status" style="font-size:12px; margin-top:8px; min-height:16px;"></div>' +
                    '<div style="font-size:11.5px; color:#8892a4; margin-top:6px; line-height:1.45;">' +
                      escapeHtml(_t("home.plans.info.publishHint")) + '</div>' +
                  '</div>'
                : '') +
              // 🧹 v1.78.0 (KARMA) — la suppression vit ICI, en fin de modale
              // (le ✕ de la liste est retiré : clic accidentel trop facile).
              '<div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07);">' +
                '<button class="kta-btn kta-btn-danger kta-btn-small" id="kta-plan-infos-remove">🗑️ ' +
                  escapeHtml(_t("home.plans.removeBtnTitle")) + '</button>' +
              '</div>' +
            '</div>' +
          '</div>';
        document.documentElement.appendChild(modal);

        // 🧹 v1.78.0 — suppression du plan depuis la modale (ktaConfirm,
        // règle D-confirm : nouveaux usages jamais en confirm() natif).
        // 🧹 v1.79.3 (décision KARMA) — la suppression PURGE aussi les
        // données associées (session, géoref, photos, backups) via
        // PlanRegistry.purgeAssociatedData ; le confirm LISTE ce qui part.
        // Carnet, récits (PDF/notes Histoire) et liaisons sont conservés.
        // 💾 v1.87.0 — ZONE HORS-LIGNE : rendue depuis le CACHE RÉEL, à chaque
        // ouverture de la fiche et après chaque action.
        // 🩸 Trois états, et le bouton de téléchargement DISPARAÎT quand le plan
        // est complet — il devient « mettre à jour ». Exigence KARMA : « ne plus
        // afficher ce bouton une fois le plan téléchargé, éviter un bouton
        // fantôme ; si cache perdu il revient ». C'est gratuit ici précisément
        // parce qu'on ne mémorise AUCUN drapeau : une purge navigateur fait
        // retomber l'état sur « absent » toute seule, et le bouton revient.
        if (plan.type === "server" && !plan.zip && window.PlanOffline && window.PlanOffline.supporte()) {
          const _fmtQuand = function (iso) {
            try { return new Date(iso).toLocaleString(); } catch (e) { return ""; }
          };
          const _bouton = function (id, cls, label) {
            return '<button class="kta-btn ' + cls + ' kta-btn-small" id="' + id + '" ' +
                   'style="margin:0 8px 6px 0;">' + escapeHtml(label) + '</button>';
          };

          const rendreOffline = async function () {
            const zone = document.getElementById("kta-plan-offline-zone");
            if (!zone) return;
            let st;
            try { st = await window.PlanOffline.statut(plan.id); }
            catch (e) { zone.textContent = "⚠️ " + ((e && e.message) || "?"); return; }

            let html = '<div style="font-size:12px; margin-bottom:8px;">';
            if (st.etat === "complet") {
              html += '<span style="color:#7bd88f;">' +
                      escapeHtml(_t("home.plans.offline.complet", { n: st.total, date: _fmtQuand(st.date) })) +
                      '</span>';
            } else if (st.etat === "partiel") {
              // 🩸 v1.87.1 — Le plan est utilisable : tout ce que le serveur a
              // servi est là. Ce qui manque, il ne l'a pas. On le DIT au lieu
              // de laisser un « incomplet » perpétuel (constat KARMA).
              html += '<span style="color:#f4c542;">' +
                      escapeHtml(_t("home.plans.offline.partiel", { n: st.manquants.length })) +
                      '</span>';
            } else if (st.etat === "incomplet") {
              html += '<span style="color:#f4c542;">' +
                      escapeHtml(_t("home.plans.offline.incomplet", { present: st.present, total: st.total })) +
                      '</span>';
            } else {
              html += '<span style="color:#8892a4;">' + escapeHtml(_t("home.plans.offline.absent")) + '</span>';
            }
            html += '</div>';

            // 🩸 On NOMME les fichiers manquants. « 9 sur 10 » sans dire lequel
            // ne permet ni de comprendre ni de corriger le déploiement.
            if (st.manquants && st.manquants.length) {
              const apercu = st.manquants.slice(0, 5);
              html += '<div style="font-size:11px; color:#8892a4; margin:-4px 0 8px; line-height:1.5;">' +
                        escapeHtml(_t("home.plans.offline.manquantsTitre")) + '<br>' +
                        apercu.map(function (u) {
                          return '<span style="font-family:monospace; font-size:10.5px; color:#c8d0e0;">' +
                                 escapeHtml(u) + '</span>';
                        }).join('<br>') +
                        (st.manquants.length > apercu.length
                          ? '<br>' + escapeHtml(_t("home.plans.offline.manquantsPlus",
                                                   { n: st.manquants.length - apercu.length }))
                          : '') +
                      '</div>';
            }

            if (st.etat === "complet") {
              html += _bouton("kta-offline-maj", "kta-btn-ghost",  _t("home.plans.offline.btnMaj"));
              html += _bouton("kta-offline-del", "kta-btn-danger", _t("home.plans.offline.btnRetirer"));
            } else if (st.etat === "partiel") {
              html += _bouton("kta-offline-maj", "kta-btn-ghost",  _t("home.plans.offline.btnReessayer"));
              html += _bouton("kta-offline-del", "kta-btn-danger", _t("home.plans.offline.btnRetirer"));
            } else if (st.etat === "incomplet") {
              html += _bouton("kta-offline-dl",  "kta-btn-primary", _t("home.plans.offline.btnCompleter"));
              html += _bouton("kta-offline-del", "kta-btn-danger",  _t("home.plans.offline.btnRetirer"));
            } else {
              html += _bouton("kta-offline-dl",  "kta-btn-primary", _t("home.plans.offline.btnTelecharger"));
            }
            zone.innerHTML = html;

            const lancer = async function () {
              zone.innerHTML = '<div style="font-size:12px; color:#8cb4ff;" id="kta-offline-prog">⏳</div>';
              const prog = document.getElementById("kta-offline-prog");
              try {
                const r = await window.PlanOffline.precacher(plan, function (p2) {
                  if (prog) prog.textContent = _t("home.plans.offline.progress", { fait: p2.fait, total: p2.total });
                });
                if (prog) {
                  prog.textContent = r.echecs
                    ? _t("home.plans.offline.erreurs", { n: r.echecs })
                    : _t("home.plans.offline.fini", { ok: r.ok });
                }
              } catch (e) {
                if (prog) prog.textContent = _t("home.plans.offline.echec", { msg: (e && e.message) || "?" });
              }
              // On re-lit le cache plutôt que de croire le résultat retourné.
              setTimeout(rendreOffline, 1500);
            };

            const bDl  = document.getElementById("kta-offline-dl");
            const bMaj = document.getElementById("kta-offline-maj");
            const bDel = document.getElementById("kta-offline-del");
            if (bDl)  bDl.addEventListener("click", lancer);
            if (bMaj) bMaj.addEventListener("click", lancer);
            if (bDel) bDel.addEventListener("click", function () {
              const msg = _t("home.plans.offline.confirmRetirer");
              const confirmer = window.ktaConfirm(msg, { okLabel: _t("home.plans.offline.btnRetirer") });
              confirmer.then(function (okc) {
                if (!okc) return;
                window.PlanOffline.supprimer(plan.id).then(rendreOffline);
              });
            });

            // 🔎 v1.88.0 — FRAÎCHEUR. Un plan pré-téléchargé est servi depuis
            // son cache dédié, que rien ne purge : il pouvait donc servir du
            // contenu périmé INDÉFINIMENT, et rien ne le disait. On sonde le
            // serveur en conditionnel (304 = inchangé) sur tout SAUF les
            // tuiles, et on affiche le verdict.
            // 🩸 On n'affiche « à jour » que si des sondes ont réellement
            // abouti : sans preuve, on dit « impossible de vérifier ».
            if (st.etat === "complet" || st.etat === "partiel") {
              const ligne = document.createElement("div");
              ligne.style.cssText = "font-size:11.5px; margin-top:8px; line-height:1.45; color:#8892a4;";
              ligne.textContent = _t("home.plans.offline.majCheck");
              zone.appendChild(ligne);
              window.PlanOffline.verifierMaj(plan).then(function (v) {
                if (!ligne.isConnected) return;   // fiche refermée entre-temps
                if (v.etat === "maj") {
                  ligne.style.color = "#f4c542";
                  ligne.textContent = _t("home.plans.offline.majDispo", { n: v.changes.length });
                } else if (v.etat === "ajour") {
                  ligne.style.color = "#7bd88f";
                  ligne.textContent = _t("home.plans.offline.majAjour", { n: v.verifies });
                } else {
                  ligne.textContent = _t("home.plans.offline.majInconnu");
                }
              }).catch(function () {
                if (ligne.isConnected) ligne.textContent = _t("home.plans.offline.majInconnu");
              });
            }
          };
          rendreOffline();
        }

        const btnRemove = document.getElementById("kta-plan-infos-remove");
        if (btnRemove) {
          btnRemove.addEventListener("click", async function() {
            const msg = _t("home.plans.confirmRemove") + "\n\n" + _t("home.plans.confirmRemovePurge");
            // 🗑️ 29/09/2026 (décision KARMA) — les documents d'histoire survivent
            // au plan par défaut (design v1.69 : l'histoire survit aux plans),
            // mais restaient ensuite orphelins dans le Carnet. Une case, décochée,
            // propose de les emporter, avec leur poids réel mesuré ICI.
            const H = window.JournalUi && window.JournalUi.histoire;
            let docs = [];
            if (H && typeof H.supprimerPourPlan === "function") {
              try {
                docs = (await H.lister()).filter(function(d) { return d.planId === String(plan.id); });
              } catch(e) { docs = []; }
            }
            let caseDocs = null;
            if (docs.length) {
              const octets = docs.reduce(function(s, d) { return s + (d.size || 0); }, 0);
              const mo = (octets / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 });
              caseDocs = { coche: false, label: _t("home.plans.removeDocs", { n: docs.length, mo: mo }) };
            }
            const confirmer = window.ktaConfirm(msg,
              { okLabel: _t("home.plans.removeBtnTitle"), caseACocher: caseDocs });
            confirmer.then(async function(ok) {
              if (!ok) return;
              try { await window.PlanRegistry.purgeAssociatedData(plan.id); } catch(e) {
                console.warn("[Loader] purge données associées :", e);
              }
              if (caseDocs && caseDocs.coche) {
                try { await H.supprimerPourPlan(plan.id); } catch(e) {
                  console.warn("[Loader] suppression des documents d'histoire :", e);
                }
              }
              window.PlanRegistry.remove(plan.id);
              modal.remove();
              window.refreshPlansList();
            });
          });
        }

        // ✏️ v1.79.1 — renommage d'affichage (vide = retour au nom d'origine)
        // ☁️ Publication d'un plan local sur l'installation reliée : l'archive gardée sur
        // l'appareil si elle existe, sinon le fichier ZIP choisi par l'utilisateur.
        const btnPublish = document.getElementById("kta-plan-publish");
        if (btnPublish) {
          btnPublish.addEventListener("click", async function() {
            const st = document.getElementById("kta-plan-publish-status");
            const dire = function(txt, cls) { if (st) { st.textContent = txt; st.className = cls || ""; } };
            const reussi = async function(publie, cleTexte) {
              dire(_t(cleTexte || "home.plans.info.publishOk"), "kta-tx-ok");
              if (await _basculerVersPublie(plan, publie)) {
                modal.remove();
                if (typeof window.refreshPlansList === "function") window.refreshPlansList();
              }
            };
            const envoyer = async function(blob) {
              btnPublish.disabled = true;
              const nom = window.PlanRegistry.displayName(plan);
              // Un gros plan sur une connexion lente : plusieurs minutes. Le temps qui
              // défile montre que l'app travaille (retour KARMA 05/10 : « ça répond pas »).
              const mo = (blob.size / 1048576).toFixed(blob.size < 10485760 ? 1 : 0);
              const t0 = Date.now();
              const tic = function() {
                const s = Math.round((Date.now() - t0) / 1000);
                dire(_t("home.plans.info.publishEnCours", { mo: mo, duree: Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") }), "kta-tx-muted");
              };
              tic();
              const minuteur = setInterval(tic, 1000);
              // Plans ☁️ connus AVANT l'envoi : si la réponse se perd en route (relais qui
              // coupe une réponse longue), un plan NOUVEAU de ce nom prouve que l'envoi a abouti.
              let avant = null;
              try { avant = new Set((await window.KtaExtensions.listerPlansExtension()).map(function(p) { return String(p.id); })); }
              catch (e) { avant = null; }
              let publie = null, erreur = null;
              try { publie = await window.KtaExtensions.publierPlan({ blob: blob, nom: nom }); }
              catch (e) { erreur = e; }
              clearInterval(minuteur);
              if (publie) { await reussi(publie); return; }
              console.warn("[Loader] publication :", erreur);
              dire(_t("home.plans.info.publishEchec") + " " + String((erreur && erreur.message) || erreur).slice(0, 120), "kta-tx-err");
              btnPublish.disabled = false;
              if (!avant) return;
              // Vérification en arrière-plan (3 min) : l'erreur reste affichée tant que
              // rien ne prouve le contraire ; un refus définitif ne fait donc rien attendre.
              for (let i = 0; i < 36 && btnPublish.isConnected; i++) {
                await new Promise(function(r) { setTimeout(r, 5000); });
                let l = [];
                try { l = await window.KtaExtensions.listerPlansExtension(); } catch (e) { l = []; }
                const arrive = l.find(function(p) { return !avant.has(String(p.id)) && String(p.name || "").trim() === nom.trim(); });
                if (arrive) {
                  console.warn("[Loader] publication : réponse perdue, mais le plan est arrivé :", arrive.id);
                  btnPublish.disabled = true;
                  try { window.dispatchEvent(new CustomEvent("mktm:plans-extension-changes")); } catch (e) { /* rien */ }
                  await reussi({ id: arrive.id, nom: arrive.name }, "home.plans.info.publishRattrape");
                  return;
                }
              }
            };
            let blob = null;
            if (plan.storedBlob && typeof window.PlanRegistry.getBlob === "function") {
              try { blob = await window.PlanRegistry.getBlob(plan.id); } catch (e) { blob = null; }
            }
            if (blob) { envoyer(blob); return; }
            const input = document.createElement("input");
            input.type = "file"; input.accept = ".zip,application/zip";
            input.addEventListener("change", function() { if (input.files && input.files[0]) envoyer(input.files[0]); });
            dire(_t("home.plans.info.publishChoisir"), "kta-tx-muted");
            input.click();
          });
        }

        const btnRename = document.getElementById("kta-plan-rename-save");
        if (btnRename) {
          btnRename.addEventListener("click", function() {
            const inp = document.getElementById("kta-plan-rename-input");
            const st  = document.getElementById("kta-plan-rename-status");
            if (window.PlanRegistry.setDisplayName(plan.id, inp.value)) {
              const maj = window.PlanRegistry.findById(plan.id);
              inp.value = (maj && maj.displayName) || "";
              st.textContent = _t("home.plans.info.renameSaved");
              setTimeout(function() { st.textContent = ""; }, 2500);
              // Le titre de la modale suit tout de suite (cohérence visuelle)
              const titre = modal.querySelector(".kta-readme-modal-titre");
              if (titre) titre.textContent = _t("home.plans.info.title", { nom: window.PlanRegistry.displayName(plan.id) });
              window.refreshPlansList();
            }
          });
        }

        // 🖼️ v1.90.2 — TUILAGE POUR CE PLAN. Enregistré au changement, sans
        // bouton : deux valeurs, aucun risque de saisie à moitié faite.
        // 🩸 Le `<select>` n'existe pas sur un plan V2 — d'où le test. Sans
        // lui, `addEventListener` sur null jetait et tuait le câblage des tags
        // et de la suppression, qui suivent dans la même fonction.
        const selTuilage = document.getElementById("kta-plan-tiling-select");
        if (selTuilage) {
          selTuilage.addEventListener("change", function() {
            const st = document.getElementById("kta-plan-tiling-status");
            const ok = window.PlanRegistry.setPerfPreset(plan.id, selTuilage.value);
            if (st) st.textContent = ok ? _t("home.plans.info.tilingSaved") : _t("home.plans.info.tilingErr");
          });
        }

        // 🏷️ v1.78.0 — sauvegarde des tags (split virgules, normalisation
        // dans PlanRegistry.setTags : trim, vides, doublons, 12×24 max).
        const btnTags = document.getElementById("kta-plan-tags-save");
        if (btnTags) {
          btnTags.addEventListener("click", function() {
            const inp = document.getElementById("kta-plan-tags-input");
            const st  = document.getElementById("kta-plan-tags-status");
            const ok  = window.PlanRegistry.setTags(plan.id, String(inp.value || "").split(","));
            if (ok) {
              const maj = window.PlanRegistry.findById(plan.id);
              inp.value = Array.isArray(maj.tags) ? maj.tags.join(", ") : "";
              st.textContent = _t("home.plans.info.tagsSaved");
              setTimeout(function() { st.textContent = ""; }, 2500);
              window.refreshPlansList();
            }
          });
        }

        const btnDl = document.getElementById("kta-plan-dl-zip");
        if (btnDl) {
          btnDl.addEventListener("click", async function() {
            const st = document.getElementById("kta-plan-dl-status");
            btnDl.disabled = true;
            st.style.color = "#8cb4ff";
            st.textContent = _t("home.plans.info.dlZipEnCours");
            try {
              const blob = await window.PlanRegistry.getBlob(plan.id);
              // ⚠️ `storedBlob` n'est qu'un FLAG du registre : le navigateur a pu
              // évincer l'archive (pression sur le quota) sans que le flag bouge.
              // On le dit clairement plutôt que de télécharger un fichier vide.
              if (!blob || blob.size === 0) {
                st.style.color = "#ff8c8c";
                st.textContent = _t("home.plans.info.dlZipMissing");
                btnDl.disabled = false;
                return;
              }
              const nom = plan.originalFilename
                       || ("plan_" + String(plan.name || plan.id).replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
                           + (plan.version ? "_" + String(plan.version).replace(/[^a-zA-Z0-9_.-]/g, "") : "") + ".zip");
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = nom;
              a.click();
              setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
              st.style.color = "#6ce28a";
              st.textContent = _t("home.plans.info.dlZipOk", { nom: nom, taille: fmtSize(blob.size) });
            } catch(e) {
              st.style.color = "#ff8c8c";
              st.textContent = _t("home.plans.info.dlZipErr", { err: (e && e.message) || String(e) });
            } finally {
              btnDl.disabled = false;
            }
          });
        }

        document.getElementById("kta-plan-infos-close").addEventListener("click", function() { modal.remove(); });
        modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });
        // Échap pour fermer (cohérent avec les autres modales du projet)
        const onEsc = function(ev) {
          if (ev.key === "Escape") { modal.remove(); document.removeEventListener("keydown", onEsc); }
        };
        document.addEventListener("keydown", onEsc);
      }

      function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
          return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
        });
      }

      window.refreshPlansList = function() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        if (!window.PlanRegistry) return;
        const all = window.PlanRegistry.getAll();
        const last = window.PlanRegistry.getLastOpened();
        _plansVue = _lireVuePlans();   // 📁 16/09/2026
        _majEnteteVuePlans();

        // Bouton Reprendre
        const resumeBox = document.getElementById("resumeBox");
        const resumeName = document.getElementById("resumeName");
        if (last && resumeBox && resumeName) {
          resumeName.textContent = window.PlanRegistry.displayName(last) + (last.version ? " (" + last.version + ")" : "");
          resumeBox.style.display = "block";
          resumeBox.dataset.planId = last.id;
        } else if (resumeBox) {
          resumeBox.style.display = "none";
        }

        // Liste unique
        const myPlansBox = document.getElementById("myPlansBox");
        // 🔎 v1.69.0 : la barre de recherche suit la liste — proposer de
        // chercher dans une bibliothèque vide n'a aucun sens.
        const searchBar = document.getElementById("loaderSearchBar");
        if (all.length === 0) {
          if (myPlansBox) myPlansBox.style.display = "none";
          if (searchBar)  searchBar.style.display  = "none";
          return;
        }
        if (myPlansBox) myPlansBox.style.display = "block";
        if (searchBar)  searchBar.style.display  = "flex";

        // 🌐 v170 : filtre "Afficher plans serveur" (persisté localStorage).
        // Si l'user a décoché → on retire tous les plans type === "server" de
        // la liste (mais on les laisse dans le PlanRegistry — c'est juste un
        // filtre d'affichage, ré-active toujours possible via le toggle).
        // 🆕 v1.21.3 : nouvelle pref `skipServerPlans` (Configuration loader).
        // Si actif → on FORCE le filtre serveur (peu importe le toggle home,
        // qui est de toute façon masqué visuellement). Cohérent avec le
        // message "le toggle disparaît" demandé par KARMA.
        const skipServer = (typeof window._loaderSkipServerPlans === "function")
                           && window._loaderSkipServerPlans();
        const showServer = !skipServer && _loaderShowServerPlans();
        const filtered = showServer ? all : all.filter(function(p) { return p.type !== "server"; });
        const _horsBase = !!(window.KtaExtensions && typeof window.KtaExtensions.aPrise === "function" &&
          window.KtaExtensions.aPrise("plans"));
        document.querySelectorAll(".kta-hors-base").forEach(function(el) { el.hidden = !_horsBase; });

        // Sync visuelle de la checkbox (au cas où refreshPlansList est appelé
        // sans que le checkbox ait été coché manuellement, ex: au boot).
        const cbServer = document.getElementById("loaderShowServerPlans");
        if (cbServer) cbServer.checked = showServer;
        // Même sync pour « Ne pas afficher les plans du site » : son défaut peut venir de la config de
        // l'installation (sitePlansHiddenDefault), lue APRÈS le premier rendu — sans ça, la case de
        // Configuration restait décochée et la rangée de l'accueil visible mais sans effet (audit 05/10/2026).
        const cbSkip = document.getElementById("loaderSkipServerPlansCb");
        if (cbSkip) cbSkip.checked = skipServer;
        // 11/10/2026 (retour KARMA) : aucun plan dans data/ → ni la case de l'accueil, ni la section de Configuration.
        // Exception : « Ne pas charger les plans du site » ACTIVE — la liste du site n'est alors pas lue, on ne sait
        // pas si elle a des plans, et l'option doit rester visible pour pouvoir être désactivée.
        const aDesPlansSite = all.some(function(p) { return p.type === "server"; });
        const rangeeFiltres = document.querySelector(".loader-plans-filters");
        if (rangeeFiltres) rangeeFiltres.style.display = (skipServer || !aDesPlansSite) ? "none" : "";
        const sectionSite = document.getElementById("loaderSitePlansSection");
        if (sectionSite) sectionSite.style.display = (!skipServer && !aDesPlansSite) ? "none" : "";

        // 🏷️ v1.78.0 — CHIPS TAGS : union des tags des plans visibles (avant
        // les filtres nom/tag, sinon les chips disparaissent dès qu'on filtre).
        // Le bandeau n'existe à l'écran que si au moins un plan est tagué —
        // zéro impact pour qui n'utilise pas la feature. Le Set de filtre est
        // épuré des tags disparus (plan retiré/détagué).
        const chipsBox = document.getElementById("loaderPlansTagChips");
        if (chipsBox) {
          const tousTags = {};   // clé minuscule → libellé d'origine (1er vu)
          filtered.forEach(function(p) {
            (Array.isArray(p.tags) ? p.tags : []).forEach(function(tg) {
              const k = tg.toLowerCase();
              if (!tousTags[k]) tousTags[k] = tg;
            });
          });
          const cles = Object.keys(tousTags).sort(function(a, b) { return a.localeCompare(b); });
          if (_plansTagFilter) {
            _plansTagFilter.forEach(function(k) { if (!tousTags[k]) _plansTagFilter.delete(k); });
            if (_plansTagFilter.size === 0) _plansTagFilter = null;
          }
          if (cles.length === 0) {
            chipsBox.style.display = "none";
            chipsBox.innerHTML = "";
          } else {
            chipsBox.style.display = "flex";
            chipsBox.innerHTML = cles.map(function(k) {
              const actif = _plansTagFilter && _plansTagFilter.has(k);
              return '<button type="button" class="kta-osm-home-tag-chip' + (actif ? " active" : "") +
                     '" data-tagkey="' + escapeHtml(k) + '">' + escapeHtml(tousTags[k]) + '</button>';
            }).join("") +
            // 🏷️ marche 2 — des chips cochées → « 📁 Dossier depuis ces étiquettes » :
            // crée un dossier à RÈGLE (les plans étiquetés y entrent seuls, les
            // prochains aussi) et bascule en mode Dossiers. Le pont entre
            // l'existant et le nouveau, sans rien ranger à la main.
            ((_plansTagFilter && _plansTagFilter.size)
              ? '<button type="button" class="kta-osm-home-tag-chip kta-plans-chip-folder" id="loaderPlansChipFolder" title="' +
                escapeHtml(_t("home.plans.folders.fromTags")) + '">📁+</button>' : "");
            const chipDossier = document.getElementById("loaderPlansChipFolder");
            if (chipDossier) chipDossier.addEventListener("click", function() {
              const PR = window.PlanRegistry;
              const libelles = Array.from(_plansTagFilter).map(function(k) { return tousTags[k] || k; });
              const f = PR.createFolder(libelles.join(" · "), { src: "user", rule: { tags: libelles } });
              if (!f) return;
              PR.setFolderRule(f.id, libelles);
              PR.setFolderCollapsed(f.id, false);
              _plansTagFilter = null;
              PR.setPlansView("folders");
              window.refreshPlansList();
            });
            chipsBox.querySelectorAll("[data-tagkey]").forEach(function(chip) {
              chip.addEventListener("click", function() {
                const k = chip.dataset.tagkey;
                if (!_plansTagFilter) _plansTagFilter = new Set();
                if (_plansTagFilter.has(k)) _plansTagFilter.delete(k);
                else _plansTagFilter.add(k);
                if (_plansTagFilter.size === 0) _plansTagFilter = null;
                window.refreshPlansList();
              });
            });
          }
        }

        // 📁 16/09/2026 — en mode Dossiers le bandeau de chips disparaît (c'est
        // lui qui déborde à 50 plans) et le filtre par étiquette ne s'applique
        // pas ; le filtre par nom, lui, agit à l'intérieur des dossiers.
        if (_plansVue === "folders" && chipsBox) { chipsBox.style.display = "none"; chipsBox.innerHTML = ""; }

        // 🏷️ v1.78.0 — filtres nom + tags (RAM only, sur la liste déjà
        // filtrée serveur). Tags : il suffit qu'UN tag du plan matche (OU).
        const visibles = filtered.filter(function(p) {
          // ✏️ v1.79.1 — le filtre matche le nom AFFICHÉ **et** le nom réel
          // (retrouver « Releve KARMA » ou « Relevé » doit marcher pareil).
          if (_plansNameFilter &&
              String(p.name || p.id).toLowerCase().indexOf(_plansNameFilter) === -1 &&
              String(p.displayName || "").toLowerCase().indexOf(_plansNameFilter) === -1) return false;
          if (_plansTagFilter && _plansVue !== "folders") {
            const tags = Array.isArray(p.tags) ? p.tags : [];
            if (!tags.some(function(tg) { return _plansTagFilter.has(tg.toLowerCase()); })) return false;
          }
          return true;
        });

        const allPlansList = document.getElementById("allPlansList");
        if (allPlansList && _plansVue === "folders") {
          _rendreDossiers(allPlansList, visibles);   // 📁 16/09/2026
        } else if (allPlansList) {
          if (visibles.length === 0) {
            // Cas particulier : registre non vide mais filtres cachent tout
            // (serveurs masqués, nom ou tags sans correspondance).
            allPlansList.innerHTML =
              '<div class="loader-plans-empty">' + _t("home.plans.emptyLocal") + '</div>';
          } else {
            // Tri : ⭐ épinglés d'abord (v1.78.0), puis lastOpened desc, puis name
            const sorted = visibles.slice().sort(function(a, b) {
              if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
              if (a.lastOpened && b.lastOpened) return b.lastOpened.localeCompare(a.lastOpened);
              if (a.lastOpened) return -1;
              if (b.lastOpened) return 1;
              return (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""); // ✏️ v1.79.1 : tri sur le nom affiché
            });
            allPlansList.innerHTML = sorted.map(planRowHTML).join("");
          }
        }
        if (_plansVue === "folders") _ktaMobileCollapseDossiers();   // 📁 par dossier déplié
        else _ktaMobileCollapsePlans();   // 📱 v1.68.0 : liste bornée sur mobile
        // 💾 v1.90.0 — l'état hors-ligne des lignes est relu à CHAQUE rendu :
        // il ne peut donc pas rester périmé après un téléchargement, une
        // suppression depuis la fiche, ou une purge du navigateur.
        _rafraichirBoutonsHorsLigne();

        // Brancher les listeners
        document.querySelectorAll(".plan-row").forEach(function(row) {
          const id = row.dataset.id;
          // 🧹 v1.71.0 : plus de bouton ▶️ — la row entière est cliquable
          // (listener plus bas) et porte le title « Charger ce plan ».
          // 🏷️ v1.78.0 — toggle épinglage (⭐/☆), sans charger le plan
          // 💾 v1.90.0 — bouton hors-ligne de la LIGNE (plans serveur).
          const dlBtn = row.querySelector(".kta-plan-row-dl");
          if (dlBtn) {
            dlBtn.addEventListener("click", function (ev) {
              ev.stopPropagation();   // ne pas déclencher le chargement du plan
              _lancerHorsLigneLigne(id, dlBtn);   // 🩸 `plan` n'existe pas ici : la boucle ne lie que `id`
            });
          }
          const pinBtn = row.querySelector(".kta-plan-row-pin");
          if (pinBtn) {
            pinBtn.addEventListener("click", function(e) {
              e.stopPropagation();
              const p = window.PlanRegistry.findById(id);
              window.PlanRegistry.setPinned(id, !(p && p.pinned));
              window.refreshPlansList();
            });
          }
          // 🧹 v1.78.0 (KARMA) — le ✕ de suppression a quitté la liste : la
          // suppression vit désormais EN FIN de modale ℹ️ Infos (ktaConfirm).
          // Moins de risque de clic accidentel dans une liste où chaque row
          // est cliquable.
          // ℹ️ v170 (suite 3) : bouton infos détaillées (compense le retrait
          // de l'affichage sub/date qui surchargeait la liste compacte)
          const infoBtn = row.querySelector(".plan-row-info-btn");
          if (infoBtn) {
            infoBtn.addEventListener("click", function(e) {
              e.stopPropagation();
              _afficherInfosPlan(id);
            });
          }
          row.addEventListener("click", function() {
            // 📁 en sélection multiple, un clic coche au lieu d'ouvrir
            if (_plansVue === "folders" && _plansSelectMode) { _basculerSelection(id); return; }
            chargerPlanDuRegistre(id);
          });
        });
        if (_plansVue === "folders" && allPlansList) _brancherDossiers(allPlansList);
      };

      // ═══════════════════════════════════════════════════════════════════
      // 📁 16/09/2026 — MODE DOSSIERS DE « MES PLANS » (étude + décisions
      // KARMA 1-11, docs/audits/2026-09-16_etude-dossiers-mes-plans.md (archivé : tag Git `archive-docs-2026-09-30`)).
      // Contrainte stricte : « Mes plans » garde sa hauteur et sa place. Le
      // sélecteur TOUT / DOSSIERS vit dans la ligne de titre (0 px ajouté),
      // un en-tête de dossier a la hauteur d'une ligne de plan, replié par
      // défaut. Tactile d'abord : tout se fait sans glisser (📁 Déplacer
      // vers…, sélection multiple) ; le glisser est un raccourci PC, actif
      // seulement pour un pointeur fin et après un seuil de déplacement.
      // Le mode TOUT reste strictement l'écran d'avant (une pastille de
      // couleur devant le nom des plans rangés, c'est tout).
      // ═══════════════════════════════════════════════════════════════════
      function _comparerPlans(a, b) {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        if (a.lastOpened && b.lastOpened) return b.lastOpened.localeCompare(a.lastOpened);
        if (a.lastOpened) return -1;
        if (b.lastOpened) return 1;
        return (a.displayName || a.name || "").localeCompare(b.displayName || b.name || "");
      }

      // Ligne de titre : état du sélecteur, boutons ➕ / ☑ visibles seulement
      // en mode Dossiers (rien n'est ajouté au mode TOUT).
      function _majEnteteVuePlans() {
        const sw = document.getElementById("loaderPlansViewSwitch");
        if (sw) sw.querySelectorAll("[data-view]").forEach(function(b) {
          b.classList.toggle("kta-actif", b.dataset.view === _plansVue);
          b.setAttribute("aria-selected", b.dataset.view === _plansVue ? "true" : "false");
        });
        const enDossiers = (_plansVue === "folders");
        const bNew = document.getElementById("loaderPlansFolderNew");
        const bSel = document.getElementById("loaderPlansSelect");
        if (bNew) bNew.hidden = !enDossiers;
        if (bSel) { bSel.hidden = !enDossiers; bSel.classList.toggle("kta-actif", enDossiers && _plansSelectMode); }
        if (!enDossiers && _plansSelectMode) { _plansSelectMode = false; _plansSelection.clear(); }
      }

      function _enteteDossierHTML(f, n, replie) {
        const t = window.I18n.t;
        const verrou = (f && f.src === "index")
          ? '<span class="kta-plans-folder-lock" title="' + escapeHtml(t("home.plans.folders.lockedIndex")) + '">🌐</span>' : "";
        const nom = f ? escapeHtml(f.name) : escapeHtml(t("home.plans.folders.unfiled"));
        const dot = f ? '<span class="kta-plans-folder-dot" style="background:' + escapeHtml(f.color || "#8cb4ff") + '"></span>'
                      : '<span class="kta-plans-folder-dot kta-plans-folder-dot-none"></span>';
        const menu = f ? '<button type="button" class="plan-row-btn kta-plans-folder-menu" title="' + escapeHtml(t("home.plans.folders.menu")) + '">⋮</button>' : "";
        return '<div class="kta-plans-folder-head' + (replie ? " kta-replie" : "") + '" data-folder="' + (f ? escapeHtml(f.id) : "") + '" role="button" tabindex="0">' +
                 '<span class="kta-plans-folder-caret">' + (replie ? "▸" : "▾") + '</span>' + dot +
                 '<span class="kta-plans-folder-name">' + nom + '</span>' +
                 '<span class="kta-plans-folder-count">' + n + '</span>' + verrou + menu +
               '</div>';
      }

      // Rendu du mode Dossiers : [dossier][lignes]… puis Non classés (dernier,
      // seulement s'il n'est pas vide). Tri identique au mode TOUT, par dossier.
      function _rendreDossiers(conteneur, visibles) {
        const PR = window.PlanRegistry;
        const t = window.I18n.t;
        const parDossier = {};
        const nonClasses = [];
        visibles.forEach(function(p) {
          const fid = PR.planFolderId(p);
          if (fid) { (parDossier[fid] = parDossier[fid] || []).push(p); } else nonClasses.push(p);
        });
        let html = "";
        PR.getFolders().forEach(function(f) {
          const plans = (parDossier[f.id] || []).sort(_comparerPlans);
          const replie = f.collapsed !== false;
          html += '<div class="kta-plans-folder" data-folder="' + escapeHtml(f.id) + '">' +
                    _enteteDossierHTML(f, plans.length, replie) +
                    '<div class="kta-plans-folder-rows" data-folder="' + escapeHtml(f.id) + '"' + (replie ? ' hidden' : '') + '>' +
                      (plans.length ? plans.map(planRowHTML).join("")
                                    : '<div class="kta-plans-folder-empty">' + escapeHtml(t("home.plans.folders.empty")) + '</div>') +
                    '</div>' +
                  '</div>';
        });
        if (nonClasses.length) {
          const plans = nonClasses.sort(_comparerPlans);
          html += '<div class="kta-plans-folder kta-plans-folder-unfiled" data-folder="">' +
                    _enteteDossierHTML(null, plans.length, _nonClassesReplie) +
                    '<div class="kta-plans-folder-rows" data-folder=""' + (_nonClassesReplie ? ' hidden' : '') + '>' + plans.map(planRowHTML).join("") + '</div>' +
                  '</div>';
        }
        if (!html) html = '<div class="loader-plans-empty">' + t("home.plans.emptyLocal") + '</div>';
        if (_plansSelectMode) {
          // 🐛 16/09 (KARMA : « j'avais pas vu le Déplacer vers en bas, selon le
          // nombre de plans tu ne penses pas à défiler ») — la barre vit EN
          // TÊTE de liste, collante, juste sous le ☑ qu'on vient de cliquer.
          html = '<div class="kta-plans-select-bar" id="loaderPlansSelectBar">' +
                   '<span class="kta-plans-select-count">' + escapeHtml(t("home.plans.folders.selected", { n: _plansSelection.size })) + '</span>' +
                   '<button type="button" class="kta-btn kta-btn-primary kta-btn-small" id="loaderPlansSelectMove"' + (_plansSelection.size ? "" : " disabled") + '>📁 ' + escapeHtml(t("home.plans.folders.moveTo")) + '</button>' +
                   '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="loaderPlansSelectDone">' + escapeHtml(t("home.plans.folders.selectDone")) + '</button>' +
                 '</div>' + html;
        }
        conteneur.innerHTML = html;
      }

      // Repli mobile PAR DOSSIER déplié (5 lignes puis « Tout le dossier (N) »),
      // le pendant de _ktaMobileCollapsePlans pour le mode TOUT.
      function _ktaMobileCollapseDossiers() {
        // 🐛 16/09 (KARMA : « un bouton Tous mes plans persiste en mode Dossiers »)
        // — le bouton global du mode TOUT vit HORS de #allPlansList (inséré
        // après), donc le re-rendu ne l'emporte pas : on le retire ici, comme
        // _ktaMobileCollapsePlans le fait de son côté.
        const ancien = document.getElementById("kta-home-plans-more");
        if (ancien) ancien.remove();
        const liste = document.getElementById("allPlansList");
        if (liste) liste.classList.remove("kta-collapsed");
        if (!window.matchMedia || !window.matchMedia("(max-width: 640px)").matches) return;
        const t = window.I18n.t;
        document.querySelectorAll("#allPlansList .kta-plans-folder-rows:not([hidden])").forEach(function(rows) {
          const n = rows.querySelectorAll(".plan-row").length;
          if (n <= 5) return;
          // 🐛 18/09 (KARMA : « je fais Tout le dossier, je coche un plan, et ça se
          // referme ») — cocher re-rend toute la liste, et ce repli se
          // réappliquait sans se souvenir du déplié. L'état « déplié » vit le
          // temps de la session, par dossier, et survit au rendu.
          const cle = rows.dataset.folder || "__nc__";
          if (!_mobileDeplies.has(cle)) rows.classList.add("kta-collapsed");
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "loader-btn-secondary kta-plans-folder-more";
          const maj = function() {
            btn.textContent = rows.classList.contains("kta-collapsed")
              ? "📚 " + t("home.plans.folders.all", { n: n }) : "▴ " + t("home.plans.folders.less");
          };
          btn.addEventListener("click", function() {
            rows.classList.toggle("kta-collapsed");
            if (rows.classList.contains("kta-collapsed")) _mobileDeplies.delete(cle); else _mobileDeplies.add(cle);
            maj();
          });
          rows.appendChild(btn);
          maj();
        });
      }

      function _basculerSelection(id) {
        if (_plansSelection.has(id)) _plansSelection.delete(id); else _plansSelection.add(id);
        window.refreshPlansList();
      }

      // Écouteurs du mode Dossiers : en-têtes (repli, ⋮), barre de sélection,
      // et le glisser PC. Appelé après chaque rendu (le HTML est reconstruit).
      function _brancherDossiers(conteneur) {
        const PR = window.PlanRegistry;
        conteneur.querySelectorAll(".kta-plans-folder-head").forEach(function(head) {
          const fid = head.dataset.folder || null;
          const basculer = function() {
            if (fid) { const f = PR.findFolder(fid); if (f) PR.setFolderCollapsed(fid, f.collapsed === false); }
            else _nonClassesReplie = !_nonClassesReplie;
            window.refreshPlansList();
          };
          head.addEventListener("click", function(e) {
            if (e.target.closest(".kta-plans-folder-menu")) return;
            basculer();
          });
          head.addEventListener("keydown", function(e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); basculer(); } });
          const menu = head.querySelector(".kta-plans-folder-menu");
          if (menu && fid) menu.addEventListener("click", function(e) { e.stopPropagation(); _ouvrirMenuDossier(fid); });
          _brancherCibleDepot(head, fid);
        });
        conteneur.querySelectorAll(".kta-plans-folder-rows").forEach(function(rows) { _brancherCibleDepot(rows, rows.dataset.folder || null); });
        const bMove = document.getElementById("loaderPlansSelectMove");
        if (bMove) bMove.addEventListener("click", function() { _ouvrirFeuilleDeplacer(Array.from(_plansSelection)); });
        const bDone = document.getElementById("loaderPlansSelectDone");
        if (bDone) bDone.addEventListener("click", function() { _plansSelectMode = false; _plansSelection.clear(); window.refreshPlansList(); });
        if (_plansDragOk()) _brancherGlisser(conteneur);
        if (("ontouchstart" in window) || (navigator.maxTouchPoints > 0)) _brancherGlisserTactile(conteneur);
      }

      // ── Glisser TACTILE par appui long (16/09, KARMA : « sur mobile le
      // glisser-déposer ne fonctionne pas ») ──
      // 🩸 Le conflit à résoudre est le DÉFILEMENT : un doigt qui bouge tout
      // de suite fait défiler la liste, comme partout. Un doigt qui reste
      // APPUI_LONG ms sans bouger « soulève » la ligne (fantôme sous le doigt,
      // petite vibration) ; à partir de là seulement, touchmove est
      // preventDefault-é (le défilement s'arrête le temps du geste) et le
      // dépôt se fait sur l'en-tête ou le corps d'un dossier, ou sur
      // « Non classés ». Relâcher ailleurs = rien. Aucun re-rendu au survol.
      const APPUI_LONG = 450, TOLERANCE_APPUI = 8;
      let _tDrag = null;   // { id, ghost, cible }
      function _brancherGlisserTactile(conteneur) {
        conteneur.querySelectorAll(".plan-row").forEach(function(row) {
          let timer = null, origine = null;
          const annuler = function() { if (timer) { clearTimeout(timer); timer = null; } origine = null; };
          row.addEventListener("touchstart", function(e) {
            if (e.touches.length !== 1 || e.target.closest("button")) return;
            const t0 = e.touches[0];
            origine = { x: t0.clientX, y: t0.clientY };
            timer = setTimeout(function() {
              timer = null;
              _soulever(row, t0.clientX, t0.clientY);
            }, APPUI_LONG);
          }, { passive: true });
          row.addEventListener("touchmove", function(e) {
            const t0 = e.touches[0];
            if (_tDrag && _tDrag.id === row.dataset.id) {
              e.preventDefault();                       // le geste est à nous : plus de défilement
              _suivre(t0.clientX, t0.clientY);
              return;
            }
            if (origine && (Math.abs(t0.clientX - origine.x) > TOLERANCE_APPUI || Math.abs(t0.clientY - origine.y) > TOLERANCE_APPUI)) annuler();   // c'est un défilement
          }, { passive: false });
          const fin = function() {
            annuler();
            if (_tDrag && _tDrag.id === row.dataset.id) _deposer();
          };
          row.addEventListener("touchend", fin);
          row.addEventListener("touchcancel", function() { annuler(); if (_tDrag) _deposer(true); });
          // un appui long ouvre le menu contextuel du navigateur et sélectionne du
          // texte (KARMA, PWA : « ça surligne le texte en même temps ») : pas
          // pendant le nôtre — le CSS user-select:none des lignes fait le gros du
          // travail, ceci couvre les navigateurs qui démarrent quand même une sélection.
          row.addEventListener("contextmenu", function(e) { if (timer || _tDrag) e.preventDefault(); });
          row.addEventListener("selectstart", function(e) { if (timer || _tDrag) e.preventDefault(); });
        });
      }
      // Le conteneur qui défile autour d'une ligne : la colonne sur PC
      // (#myPlansBox en overflow), la page sur mobile.
      function _trouverScroller(el) {
        let n = el && el.parentElement;
        while (n && n !== document.body) {
          const cs = getComputedStyle(n);
          if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
          n = n.parentElement;
        }
        return document.scrollingElement || document.documentElement;
      }
      function _soulever(row, x, y) {
        const ghost = row.cloneNode(true);
        ghost.className = "plan-row kta-plans-drag-ghost";
        ghost.style.width = row.getBoundingClientRect().width + "px";
        document.body.appendChild(ghost);
        // 🐛 (KARMA : « scintillement, doublement de ce que je déplace ») — la
        // ligne d'origine restait visible à 50 % sous le fantôme qui la
        // recouvrait presque : elle devient une empreinte discrète.
        row.classList.add("kta-plan-row-dragging", "kta-plan-row-empreinte");
        _tDrag = { id: row.dataset.id, ghost: ghost, cible: null, x: x, y: y, scroller: _trouverScroller(row), raf: 0 };
        _suivre(x, y);
        _defilerAuxBords();
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
      }
      // (KARMA : « tout en haut ça devrait défiler pour remonter la file, et
      // inversement en bas ») — tant que le doigt reste près d'un bord du
      // conteneur qui défile, on défile, et la cible sous le doigt est
      // recalculée puisque le contenu bouge.
      const ZONE_DEFIL = 72, VITESSE_DEFIL = 14;
      function _defilerAuxBords() {
        if (!_tDrag) return;
        // pas avant que le doigt ait bougé : soulever une ligne près d'un bord
        // ne doit pas faire partir la liste toute seule
        if (!_tDrag.bouge) { _tDrag.raf = requestAnimationFrame(_defilerAuxBords); return; }
        const sc = _tDrag.scroller;
        const estPage = (sc === document.scrollingElement || sc === document.documentElement);
        const haut = estPage ? 0 : sc.getBoundingClientRect().top;
        const bas  = estPage ? window.innerHeight : sc.getBoundingClientRect().bottom;
        let delta = 0;
        if (_tDrag.y < haut + ZONE_DEFIL) delta = -Math.ceil(VITESSE_DEFIL * (1 - (_tDrag.y - haut) / ZONE_DEFIL));
        else if (_tDrag.y > bas - ZONE_DEFIL) delta = Math.ceil(VITESSE_DEFIL * (1 - (bas - _tDrag.y) / ZONE_DEFIL));
        // (KARMA : « si je glisse vers le bas je ne peux pas défiler après OSM, le
        // plan n'a rien à faire glisser ici ») — on ne défile que tant que la
        // liste « Mes plans » a encore quelque chose à montrer dans ce sens :
        // jamais au-delà de sa fin, jamais au-dessus de son titre.
        if (delta) {
          const boite = document.getElementById("myPlansBox"), liste = document.getElementById("allPlansList");
          if (delta > 0 && liste && liste.getBoundingClientRect().bottom <= bas) delta = 0;
          if (delta < 0 && boite && boite.getBoundingClientRect().top >= haut) delta = 0;
        }
        if (delta) {
          const avant = sc.scrollTop;
          sc.scrollTop = avant + delta;
          if (sc.scrollTop !== avant) _suivre(_tDrag.x, _tDrag.y);
        }
        _tDrag.raf = requestAnimationFrame(_defilerAuxBords);
      }
      function _suivre(x, y) {
        if (!_tDrag) return;
        if (_tDrag.x !== undefined && (x !== _tDrag.x || y !== _tDrag.y)) _tDrag.bouge = true;
        _tDrag.x = x; _tDrag.y = y;
        _tDrag.ghost.style.transform = "translate(" + Math.round(x - 24) + "px, " + Math.round(y - 20) + "px)";
        const sous = document.elementFromPoint(x, y);
        const cible = sous ? sous.closest(".kta-plans-folder-head, .kta-plans-folder-rows") : null;
        if (cible !== _tDrag.cible) {
          if (_tDrag.cible) _tDrag.cible.classList.remove("kta-drop-cible");
          if (cible) cible.classList.add("kta-drop-cible");
          _tDrag.cible = cible;
        }
      }
      function _deposer(annule) {
        if (!_tDrag) return;
        const d = _tDrag; _tDrag = null;
        if (d.raf) cancelAnimationFrame(d.raf);
        d.ghost.remove();
        if (d.cible) d.cible.classList.remove("kta-drop-cible");
        const row = document.querySelector('.plan-row[data-id="' + d.id + '"]');
        if (row) row.classList.remove("kta-plan-row-dragging", "kta-plan-row-empreinte");
        if (annule || !d.cible) return;
        const fid = d.cible.dataset.folder || null;
        const ids = (_plansSelectMode && _plansSelection.has(d.id)) ? Array.from(_plansSelection) : [d.id];
        _deplacerPlans(ids, fid);
      }

      // ── Glisser PC (pointeur fin uniquement) ──
      // 🩸 La ligne reste ENTIÈREMENT cliquable : un clic ne déclenche jamais
      // `dragstart` — c'est le navigateur qui n'émet ce dernier qu'après SON
      // seuil de mouvement. Aucun re-rendu pendant le survol : seule une classe
      // sur la cible bouge ; on re-rend au dépôt.
      // 🐛 17/09 (KARMA : « sur PC le glisser ne marche plus ») — j'armais le
      // glisser après mon propre seuil de 6 px mesuré sur pointermove, et
      // j'annulais `dragstart` s'il arrivait avant : or Chrome déclenche le
      // glisser natif après ~4 px, donc AVANT le mien dès que la souris est
      // lente. Un mouvement vif passait, un mouvement posé était refusé. Le
      // seuil natif suffit ; le mien est retiré.
      function _brancherGlisser(conteneur) {
        conteneur.querySelectorAll(".plan-row[draggable]").forEach(function(row) {
          row.addEventListener("dragstart", function(e) {
            _dragPlanId = row.dataset.id;
            row.classList.add("kta-plan-row-dragging");
            try { e.dataTransfer.setData("text/plain", _dragPlanId); e.dataTransfer.effectAllowed = "move"; } catch (err) {}
          });
          row.addEventListener("dragend", function() {
            row.classList.remove("kta-plan-row-dragging");
            _dragPlanId = null;
            document.querySelectorAll(".kta-drop-cible").forEach(function(el) { el.classList.remove("kta-drop-cible"); });
          });
        });
      }
      function _brancherCibleDepot(el, fid) {
        if (!_plansDragOk()) return;
        el.addEventListener("dragover", function(e) {
          if (!_dragPlanId) return;
          e.preventDefault();
          try { e.dataTransfer.dropEffect = "move"; } catch (err) {}
          el.classList.add("kta-drop-cible");
        });
        el.addEventListener("dragleave", function() { el.classList.remove("kta-drop-cible"); });
        el.addEventListener("drop", function(e) {
          if (!_dragPlanId) return;
          e.preventDefault();
          el.classList.remove("kta-drop-cible");
          // un plan sélectionné glissé emmène toute la sélection
          const ids = (_plansSelectMode && _plansSelection.has(_dragPlanId)) ? Array.from(_plansSelection) : [_dragPlanId];
          _deplacerPlans(ids, fid);
        });
      }

      function _deplacerPlans(ids, fid) {
        const PR = window.PlanRegistry;
        const X = window.KtaExtensions;
        const avant = {};
        ids.forEach(function(id) { avant[id] = PR.planFolderId(PR.findById(id)); });
        let n = 0;
        ids.forEach(function(id) { if (PR.setPlanFolder(id, fid || null, "user")) n++; });
        // ☁️ Plan d'une installation reliée, rangé dans (ou sorti d') un dossier DE
        // L'INSTALLATION : rangé pour tous ceux qui voient ce plan, si le compte en a le
        // droit. Sinon (droit, hors ligne, dossier de l'appareil) : rangement local seul.
        if (X && typeof X.rangerPlanExtension === "function") {
          const diffuses = ids.filter(function(id) {
            const e = PR.findById(id);
            return e && e.type === "ext" && (fid ? !!X.dossierExtension(fid) : !!X.dossierExtension(avant[id]));
          });
          if (diffuses.length) {
            Promise.all(diffuses.map(function(id) { return X.rangerPlanExtension(id, fid || null); })).then(function(r) {
              const ok = r.filter(Boolean).length;
              if (ok && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
                window.OOMGuard.showToast(window.I18n.t("home.plans.folders.toastDiffuse", { n: ok }), "info");
              }
            });
          }
        }
        if (fid) PR.setFolderCollapsed(fid, false);   // on voit où le plan est arrivé
        _plansSelection.clear();
        _plansSelectMode = false;                       // un déplacement clôt la sélection
        window.refreshPlansList();
        if (n && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(window.I18n.t("home.plans.folders.toastMoved", { n: n }), "info");
        }
      }

      // ── Feuille « Déplacer vers… » (tactile et PC) ──
      function _feuille(titre, corpsHtml, brancher) {
        const ov = document.createElement("div");
        ov.className = "kta-readme-modal-overlay kta-plans-sheet-overlay";
        ov.style.zIndex = "100002";
        ov.innerHTML = '<div class="kta-readme-modal-boite kta-plans-sheet">' +
                         '<div class="kta-readme-modal-header"><span class="kta-readme-modal-titre">' + titre + '</span>' +
                         '<button class="kta-panneau-close" type="button" data-close>✕</button></div>' +
                         '<div class="kta-readme-modal-corps kta-plans-sheet-corps">' + corpsHtml + '</div></div>';
        const fermer = function() { document.removeEventListener("keydown", surTouche, true); ov.remove(); };
        const surTouche = function(e) { if (e.key === "Escape") { e.stopPropagation(); fermer(); } };
        ov.addEventListener("click", function(e) { if (e.target === ov || e.target.hasAttribute("data-close")) fermer(); });
        document.addEventListener("keydown", surTouche, true);
        document.documentElement.appendChild(ov);
        brancher(ov, fermer);
        return ov;
      }
      function _swatchesHTML(actuelle) {
        return '<div class="kta-plans-swatches">' + window.PlanRegistry.FOLDER_COLORS.map(function(c) {
          return '<button type="button" class="kta-plans-swatch' + (c === actuelle ? " kta-actif" : "") + '" data-color="' + c + '" style="background:' + c + '"></button>';
        }).join("") + '</div>';
      }
      function _ouvrirFeuilleDeplacer(ids) {
        if (!ids || !ids.length) return;
        const PR = window.PlanRegistry, t = window.I18n.t;
        const lignes = PR.getFolders().map(function(f) {
          return '<button type="button" class="kta-plans-sheet-item" data-fid="' + escapeHtml(f.id) + '">' +
                   '<span class="kta-plans-folder-dot" style="background:' + escapeHtml(f.color || "#8cb4ff") + '"></span>' + escapeHtml(f.name) + '</button>';
        }).join("");
        const corps = '<button type="button" class="kta-plans-sheet-item" data-fid=""><span class="kta-plans-folder-dot kta-plans-folder-dot-none"></span>' + escapeHtml(t("home.plans.folders.unfiled")) + '</button>' +
                      lignes +
                      '<div class="kta-plans-sheet-new"><input type="text" class="kta-cfg-input" id="kta-plans-sheet-new-name" maxlength="40" placeholder="' + escapeHtml(t("home.plans.folders.newTitle")) + '">' +
                      '<button type="button" class="kta-btn kta-btn-primary kta-btn-small" id="kta-plans-sheet-new-ok">➕</button></div>';
        _feuille(escapeHtml(t("home.plans.folders.moveTo")) + " · " + ids.length, corps, function(ov, fermer) {
          ov.querySelectorAll("[data-fid]").forEach(function(b) {
            b.addEventListener("click", function() { fermer(); _deplacerPlans(ids, b.dataset.fid || null); });
          });
          const inp = ov.querySelector("#kta-plans-sheet-new-name");
          const creer = function() {
            const f = PR.createFolder(inp.value, { src: "user" });
            if (!f) { inp.focus(); return; }
            fermer(); _deplacerPlans(ids, f.id);
          };
          ov.querySelector("#kta-plans-sheet-new-ok").addEventListener("click", creer);
          inp.addEventListener("keydown", function(e) { if (e.key === "Enter") { e.preventDefault(); creer(); } });
        });
      }

      // ── ➕ Nouveau dossier et ⋮ Options d'un dossier (même feuille) ──
      function _ouvrirMenuDossier(fid) {
        const PR = window.PlanRegistry, t = window.I18n.t;
        const f = fid ? PR.findFolder(fid) : null;
        const verrou = !!(f && f.src === "index");
        const corps = (verrou ? '<p class="kta-plans-sheet-lock">🌐 ' + escapeHtml(t("home.plans.folders.lockedIndex")) + '</p>' : "") +
          '<label class="kta-cfg-label">' + escapeHtml(t("home.plans.folders.name")) + '</label>' +
          '<input type="text" class="kta-cfg-input" id="kta-plans-folder-name" maxlength="40" value="' + (f ? escapeHtml(f.name) : "") + '"' + (verrou ? " disabled" : "") + '>' +
          '<div class="kta-plans-sheet-err" id="kta-plans-folder-err" hidden></div>' +
          '<label class="kta-cfg-label">' + escapeHtml(t("home.plans.folders.color")) + '</label>' +
          (verrou ? '<div class="kta-plans-swatches"><span class="kta-plans-swatch kta-actif" style="background:' + escapeHtml(f.color || "#8cb4ff") + '"></span></div>' : _swatchesHTML(f ? f.color : PR.FOLDER_COLORS[PR.getFolders().length % PR.FOLDER_COLORS.length])) +
          // 🏷️ marche 2 — règle par étiquette (virgules) ; l'index est maître de la sienne
          '<label class="kta-cfg-label">' + escapeHtml(t("home.plans.folders.rule")) + '</label>' +
          '<input type="text" class="kta-cfg-input" id="kta-plans-folder-rule" maxlength="200" placeholder="' + escapeHtml(t("home.plans.folders.rulePlaceholder")) + '" value="' +
            escapeHtml(f && f.rule && Array.isArray(f.rule.tags) ? f.rule.tags.join(", ") : "") + '"' + (verrou ? " disabled" : "") + '>' +
          '<div class="kta-plans-sheet-hint">' + escapeHtml(t("home.plans.folders.ruleHint")) + '</div>' +
          '<div class="kta-cfg-actions-bar kta-plans-sheet-actions">' +
            (f ? '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" data-move="-1" title="' + escapeHtml(t("home.plans.folders.up")) + '">▲</button>' +
                 '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" data-move="1" title="' + escapeHtml(t("home.plans.folders.down")) + '">▼</button>' +
                 '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small kta-plans-sheet-del" data-del' + (verrou ? " disabled" : "") + '>🗑️ ' + escapeHtml(t("home.plans.folders.delete")) + '</button>' : "") +
            '<span class="kta-plans-sheet-spacer"></span>' +
            (verrou ? "" : '<button type="button" class="kta-btn kta-btn-primary kta-btn-small" data-ok>' + escapeHtml(t(f ? "config.actions.close" : "home.plans.folders.new")) + '</button>') +
          '</div>';
        _feuille(escapeHtml(f ? f.name : t("home.plans.folders.newTitle")), corps, function(ov, fermer) {
          let couleur = f ? (f.color || "#8cb4ff") : null;
          ov.querySelectorAll(".kta-plans-swatch[data-color]").forEach(function(s) {
            s.addEventListener("click", function() {
              couleur = s.dataset.color;
              ov.querySelectorAll(".kta-plans-swatch").forEach(function(x) { x.classList.toggle("kta-actif", x === s); });
              if (f) { PR.setFolderColor(f.id, couleur); window.refreshPlansList(); }
            });
          });
          const inp = ov.querySelector("#kta-plans-folder-name");
          const err = ov.querySelector("#kta-plans-folder-err");
          const valider = function() {
            if (verrou) { fermer(); return; }
            const nom = String(inp.value || "").trim();
            if (!nom) { inp.focus(); return; }
            const dbl = PR.findFolderByName(nom);
            if (dbl && (!f || dbl.id !== f.id)) { err.textContent = t("home.plans.folders.nameTaken"); err.hidden = false; return; }
            const regle = String((ov.querySelector("#kta-plans-folder-rule") || {}).value || "").split(",");
            if (f) { PR.renameFolder(f.id, nom); PR.setFolderRule(f.id, regle); }
            else { const nf = PR.createFolder(nom, { src: "user", color: couleur || undefined, rule: { tags: regle } }); if (nf) PR.setFolderCollapsed(nf.id, false); }
            fermer(); window.refreshPlansList();
          };
          const ok = ov.querySelector("[data-ok]");
          if (ok) ok.addEventListener("click", valider);
          if (inp && !verrou) { inp.addEventListener("keydown", function(e) { if (e.key === "Enter") { e.preventDefault(); valider(); } }); setTimeout(function() { inp.focus(); }, 30); }
          ov.querySelectorAll("[data-move]").forEach(function(b) {
            b.addEventListener("click", function() { PR.moveFolder(f.id, Number(b.dataset.move)); window.refreshPlansList(); });
          });
          const del = ov.querySelector("[data-del]");
          if (del && !verrou) del.addEventListener("click", async function() {
            const n = PR.getAll().filter(function(p) { return PR.planFolderId(p) === f.id; }).length;
            const oui = await window.ktaConfirm(t("home.plans.folders.deleteConfirm", { nom: escapeHtml(f.name), n: n }), { okLabel: t("home.plans.folders.delete") });
            if (!oui) return;
            PR.deleteFolder(f.id); fermer(); window.refreshPlansList();
          });
        });
      }


      // 📦 07/10/2026 — PLAN DÉCLARÉ PAR SON ARCHIVE dans data/index.json (`"zip": "data/x.zip"`).
      // Téléchargement avec progression. `conditionnel` : la copie gardée porte ses validateurs
      // HTTP (ETag / Last-Modified) → 304 = « la copie est à jour », rien n'est retéléchargé.
      // `cache: "no-store"` : nos en-têtes conditionnels font foi, pas le cache HTTP du navigateur
      // (et le SW laisse passer les .zip, cf sw.js). Rend { statut: "frais"|"aJour"|"absent",
      // blob, etag, lastModified } ; une erreur réseau remonte (l'appelant se rabat sur la copie).
      async function _telechargerZipIndex(plan, progression, conditionnel, methode, signal) {
        const entetes = {};
        if (conditionnel && plan.storedBlob) {
          if (plan.zipEtag) entetes["If-None-Match"] = plan.zipEtag;
          if (plan.zipLastModified) entetes["If-Modified-Since"] = plan.zipLastModified;
        }
        const rep = await fetch(plan.zip, { method: methode || "GET", headers: entetes, cache: "no-store", signal: signal });
        if (rep.status === 304) return { statut: "aJour" };
        if (rep.status === 404 || rep.status === 410) return { statut: "absent" };
        if (!rep.ok) throw new Error("HTTP " + rep.status);
        const res = { statut: "frais", etag: rep.headers.get("ETag"), lastModified: rep.headers.get("Last-Modified") };
        if (methode === "HEAD") return res;
        const total = parseInt(rep.headers.get("Content-Length"), 10) || 0;
        if (!rep.body || typeof rep.body.getReader !== "function") { res.blob = await rep.blob(); return res; }
        const lecteur = rep.body.getReader(), morceaux = [];
        let recus = 0;
        for (;;) {
          const r = await lecteur.read();
          if (r.done) break;
          morceaux.push(r.value); recus += r.value.length;
          if (progression) progression(recus, total);
        }
        res.blob = new Blob(morceaux, { type: "application/zip" });
        return res;
      }

      // ⏱️ 07/10/2026 — VEILLEUR D'INACTIVITÉ d'un téléchargement de plan (ZIP de l'index, plan ☁️).
      // Retour KARMA (iPhone) : réseau perdu sur l'accueil → « Chargement du plan… » sans fin — la
      // requête ne finissait ni par une réponse ni par une erreur. Pas de délai TOTAL (300 Mo en 4G
      // faible, c'est légitime) : rien reçu en 15 s au départ, ou plus un octet pendant 20 s →
      // abandon. `course(p)` rend la main même si celui qui télécharge ignore l'annulation.
      const _VEILLE_DEBUT_MS = 15000, _VEILLE_INACTIF_MS = 20000;
      function _veilleurTelechargement() {
        const ctl = typeof AbortController === "function" ? new AbortController() : null;
        let minuterie = null, fini = false, rejeter = null;
        const expire = new Promise(function (_, rej) { rejeter = rej; });
        expire.catch(function () { /* lue par course() */ });
        const armer = function (ms) {
          clearTimeout(minuterie);
          minuterie = setTimeout(function () {
            if (fini) return;
            fini = true;
            if (ctl) { try { ctl.abort(); } catch (e) { /* déjà fini */ } }
            const err = new Error("téléchargement sans réponse"); err.code = "INACTIF";
            rejeter(err);
          }, ms);
        };
        armer(_VEILLE_DEBUT_MS);
        return {
          signal: ctl ? ctl.signal : undefined,
          toucher: function () { if (!fini) armer(_VEILLE_INACTIF_MS); },
          arreter: function () { fini = true; clearTimeout(minuterie); },
          course: function (p) { return Promise.race([p, expire]); }
        };
      }
      const _horsLigne = function () { return typeof navigator !== "undefined" && navigator.onLine === false; };

      // Range l'archive téléchargée comme copie gardée du plan (sans l'ouvrir) : bouton 💾 de la ligne.
      async function _garderZipIndex(plan) {
        const r = await _telechargerZipIndex(plan, null, true);
        if (r.statut === "aJour") return true;
        if (r.statut !== "frais" || !r.blob) return false;
        if (window.PlanRegistry.requestPersistentStorage) await window.PlanRegistry.requestPersistentStorage();
        const s = await window.PlanRegistry.saveBlob(plan.id, r.blob);
        if (!s || !s.ok) return false;
        window.PlanRegistry.addOrUpdate({ id: plan.id, storedBlob: true,
          zipEtag: r.etag || null, zipLastModified: r.lastModified || null });
        return true;
      }

      // === CHARGER UN PLAN DEPUIS LE REGISTRE ===
      async function chargerPlanDuRegistre(id) {
        const plan = window.PlanRegistry.findById(id);
        if (!plan) return setStatus("Plan introuvable dans la liste", true);

        // 📦 Plan ZIP de l'index : archive téléchargée (ou copie gardée si à jour / hors ligne),
        // puis ouverte comme un ZIP importé — elle reste un plan « server » (startImportedPlan).
        if (plan.type === "server" && plan.zip) {
          setStatus(_homeT("home.statut.chargementDe", "Chargement de {nom}…").replace("{nom}", plan.name || plan.id));
          const _tz = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
          const _nom = plan.name || plan.id;
          if (typeof window._afficherOverlayChargement === "function") {
            window._afficherOverlayChargement(_tz("zipIndex.chargement.debut", { nom: _nom }));
          }
          let _derniereMajZ = 0;
          const _progressionZ = function(recus, total) {
            const maintenant = Date.now();
            if (maintenant - _derniereMajZ < 250 && recus < total) return;
            _derniereMajZ = maintenant;
            const mo = function(o) { return (o / 1048576).toFixed(o < 10485760 ? 1 : 0); };
            const texte = total > 0
              ? _tz("ext.chargement.progres", { nom: _nom, pct: Math.floor(recus * 100 / total), recu: mo(recus), total: mo(total) })
              : _tz("ext.chargement.progresSansTotal", { nom: _nom, recu: mo(recus) });
            if (typeof window._majOverlayChargement === "function") window._majOverlayChargement(texte);
          };
          const _fermer = function() {
            if (typeof window._fermerOverlayChargement === "function") window._fermerOverlayChargement();
          };
          try {
            let r = null, blob = null, frais = false, coupe = false;
            // Réseau coupé : on ne tente même pas (copie gardée directement).
            const veille = _veilleurTelechargement();
            try {
              if (!_horsLigne()) {
                r = await veille.course(_telechargerZipIndex(plan, function (a, b) { veille.toucher(); _progressionZ(a, b); },
                                                             true, "GET", veille.signal));
              }
            } catch (eRes) {
              coupe = !!(eRes && eRes.code === "INACTIF");
              console.warn("[Loader] plan ZIP : réseau indisponible —", eRes && eRes.message);
            } finally { veille.arreter(); }
            if (r && r.statut === "absent") {
              _fermer();
              afficherModalePlanIntrouvable(plan, "server");
              return;
            }
            if (r && r.statut === "frais") { blob = r.blob; frais = true; }
            else if (plan.storedBlob) {
              if (!r && typeof window._majOverlayChargement === "function") {
                window._majOverlayChargement(_tz("zipIndex.chargement.copie"));
              }
              blob = await window.PlanRegistry.getBlob(plan.id);
            }
            if (!blob) {
              _fermer();
              return setStatus(coupe ? _tz("zipIndex.coupe", { nom: _nom }) : _tz("zipIndex.indispo"), true);
            }
            const fichier = new File([blob], (plan.zip.split("/").pop() || (_nom + ".zip")), { type: "application/zip" });
            const segmented = (typeof window.getLoaderPerfPreset === "function") ? window.getLoaderPerfPreset() : "auto";
            await chargerZipFichier(fichier, (segmented !== "auto") ? segmented : (plan.perfPreset || "auto"),
                                    { planId: plan.id, typeRegistre: "server-zip", zipFile: fichier,
                                      storeBlob: frais && (!!plan.storedBlob || window.ktaMemoriserPlanActif()),
                                      fromStoredBlob: !frais,
                                      zipEtag: r && r.etag, zipLastModified: r && r.lastModified });
            if (window.masquerLoader) window.masquerLoader();
          } catch (e) {
            _fermer();
            setStatus(_homeT("home.statut.erreur", "Erreur : {msg}").replace("{msg}", String(e.message || e)), true);
          }
          return;
        }

        if (plan.type === "server") {
          setStatus(_homeT("home.statut.chargementDe", "Chargement de {nom}…").replace("{nom}", plan.name || plan.id));
          try {
            // Si l'utilisateur a fait un choix explicite (≠ "auto") → on l'applique en override.
            // Sinon → on utilise le preset mémorisé pour ce plan (ou "auto" si jamais réglé).
            const segmented = (typeof window.getLoaderPerfPreset === "function") ? window.getLoaderPerfPreset() : "auto";
            const presetPlan = (segmented !== "auto") ? segmented : (plan.perfPreset || "auto");
            await window.chargerPlanServeur(plan.path, plan, presetPlan);
            if (window.masquerLoader) window.masquerLoader();
          } catch(e) {
            // Plan serveur introuvable (404 / dossier supprimé) → modale dédiée
            if (e && e.code === "PLAN_NOT_FOUND") {
              afficherModalePlanIntrouvable(plan, "server");
            } else {
              setStatus(_homeT("home.statut.erreur", "Erreur : {msg}").replace("{msg}", String(e.message || e)), true);
            }
          }
          return;
        }

        // 🧩 v2.7.0 — plan fourni par une extension (prise « source de plans ») :
        // l'archive vient de l'extension ; une fois ouverte elle est gardée sur
        // l'appareil (hors ligne), et l'effacement à la déconnexion la retire.
        if (plan.type === "ext") {
          setStatus(_homeT("home.statut.chargementDe", "Chargement de {nom}…").replace("{nom}", plan.name || plan.id));
          // 🧩 Écran de chargement central dès le début : un plan venu du serveur de
          // l'installation peut peser des centaines de Mo (retour KARMA 04/10/2026 :
          // « un long moment se passe, rien à l'écran »). Progression si l'extension
          // l'annonce.
          const _te = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
          if (typeof window._afficherOverlayChargement === "function") {
            window._afficherOverlayChargement(_te("ext.chargement.debut", { nom: plan.name || plan.id }));
          }
          let _derniereMaj = 0;
          const _progression = function(recus, total) {
            const maintenant = Date.now();
            if (maintenant - _derniereMaj < 250 && recus < total) return;
            _derniereMaj = maintenant;
            const mo = function(o) { return (o / 1048576).toFixed(o < 10485760 ? 1 : 0); };
            const texte = total > 0
              ? _te("ext.chargement.progres", { nom: plan.name || plan.id, pct: Math.floor(recus * 100 / total), recu: mo(recus), total: mo(total) })
              : _te("ext.chargement.progresSansTotal", { nom: plan.name || plan.id, recu: mo(recus) });
            if (typeof window._majOverlayChargement === "function") window._majOverlayChargement(texte);
          };
          try {
            let blob = null, coupe = false;
            const veille = _veilleurTelechargement();
            try {
              if (_horsLigne()) throw new Error("appareil hors ligne");
              blob = await veille.course(window.KtaExtensions.chargerPlanExtension(plan.extId || plan.id, {
                progression: function (r, t) { veille.toucher(); _progression(r, t); }, signal: veille.signal }));
            }
            catch (eExt) {
              coupe = !!(eExt && eExt.code === "INACTIF");
              if (plan.storedBlob && typeof window._majOverlayChargement === "function") window._majOverlayChargement(_te("ext.chargement.copie"));
              blob = plan.storedBlob ? await window.PlanRegistry.getBlob(plan.id) : null;
            } finally { veille.arreter(); }
            if (!blob) {
              if (typeof window._fermerOverlayChargement === "function") window._fermerOverlayChargement();
              return setStatus(coupe ? _te("ext.chargement.coupe", { nom: plan.name || plan.id })
                : _homeT("home.statut.extIndispo", "Plan indisponible (serveur injoignable)"), true);
            }
            const fichier = new File([blob], (plan.name || plan.id) + ".zip", { type: "application/zip" });
            const segmented = (typeof window.getLoaderPerfPreset === "function") ? window.getLoaderPerfPreset() : "auto";
            await chargerZipFichier(fichier, (segmented !== "auto") ? segmented : (plan.perfPreset || "auto"),
                                    { planId: plan.id, typeRegistre: "ext", zipFile: fichier,
                                      storeBlob: !!plan.storedBlob || window.ktaMemoriserPlanActif() });
            if (window.masquerLoader) window.masquerLoader();
          } catch (e) {
            if (typeof window._fermerOverlayChargement === "function") window._fermerOverlayChargement();
            setStatus(_homeT("home.statut.erreur", "Erreur : {msg}").replace("{msg}", String(e.message || e)), true);
          }
          return;
        }

        if (plan.type === "local") {
          // 1. Tenter le blob mémorisé (mobile + fallback)
          if (plan.storedBlob) {
            let blobOk = false;
            try {
              const blob = await window.PlanRegistry.getBlob(plan.id);
              if (blob) {
                // 🩸 16/09/2026 — un blob rangé PAR RÉFÉRENCE (imports d'avant
                // la copie réelle, cf. PlanRegistry.saveBlob) a la bonne taille
                // mais ne se lit plus si le fichier d'origine a bougé. On sonde
                // 4 octets AVANT d'y croire : sinon on tombe sur « archive
                // illisible » au lieu de la modale qui propose la re-sélection —
                // laquelle range désormais une vraie copie, et guérit l'entrée.
                try { await blob.slice(0, 4).arrayBuffer(); }
                catch (eLect) {
                  console.warn("[Loader] Blob mémorisé illisible (référence disque perdue) :", plan.id, eLect && eLect.name);
                  afficherModalePlanIntrouvable(plan, "local-blob");
                  return;
                }
                blobOk = true;
                const file = new File([blob], plan.originalFilename || "plan.zip", { type: "application/zip" });
                // Si l'utilisateur a fait un choix explicite (≠ "auto") → on l'applique en override.
                // Sinon → on utilise le preset mémorisé pour ce plan (ou "auto" si jamais réglé).
                const segmented = (typeof window.getLoaderPerfPreset === "function") ? window.getLoaderPerfPreset() : "auto";
                const presetPlan = (segmented !== "auto") ? segmented : (plan.perfPreset || "auto");
                setStatus("Chargement depuis le stockage local…", false);
                await chargerZipFichier(file, presetPlan, { planId: plan.id, fromStoredBlob: true });
                return;
              }
            } catch(e) {
              console.warn("[Loader] Erreur lecture blob :", e);
            }
            // Blob attendu mais introuvable → modale "Plan introuvable"
            // Cas typique : import d'une liste après vidage de cache
            if (!blobOk) {
              console.warn("[Loader] Blob mémorisé introuvable pour", plan.id);
              afficherModalePlanIntrouvable(plan, "local-blob");
              return;
            }
          }

          // 2. Tenter le FS handle (Chrome/Edge desktop)
          if (plan.fsHandleId && window.PlanRegistry.hasFsAccess()) {
            const handle = await window.PlanRegistry.getHandle(plan.fsHandleId);
            if (handle) {
              const ok = await window.PlanRegistry.ensureHandlePermission(handle);
              if (ok) {
                try {
                  const file = await handle.getFile();
                  // Si l'utilisateur a fait un choix explicite (≠ "auto") → on l'applique en override.
                  // Sinon → on utilise le preset mémorisé pour ce plan (ou "auto" si jamais réglé).
                  const segmented = (typeof window.getLoaderPerfPreset === "function") ? window.getLoaderPerfPreset() : "auto";
                  const presetPlan = (segmented !== "auto") ? segmented : (plan.perfPreset || "auto");
                  await chargerZipFichier(file, presetPlan, { fsHandle: handle, planId: plan.id });
                  return;
                } catch(e) {
                  console.warn("[Loader] FS handle invalide :", e);
                  // Handle attendu mais cassé → modale "Plan introuvable"
                  afficherModalePlanIntrouvable(plan, "local-fs");
                  return;
                }
              } else {
                // Permission refusée
                afficherModalePlanIntrouvable(plan, "local-fs-denied");
                return;
              }
            } else {
              // Handle attendu mais introuvable en IDB
              afficherModalePlanIntrouvable(plan, "local-fs");
              return;
            }
          }

          // 3. Fallback : ouvrir le sélecteur de fichier (cas par défaut, pas d'erreur)
          await reSelectionnerZipPourPlan(plan);
        }
      }

      // === MODALE "PLAN INTROUVABLE" ===
      // reason : "server" | "local-blob" | "local-fs" | "local-fs-denied"
      function afficherModalePlanIntrouvable(plan, reason) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const existing = document.getElementById("planIntrouvableModal");
        if (existing) existing.remove();

        let titre = _t("home.plans.notFound.titleDefault");
        let explication = "";
        let canRetry = false;
        let canReSelect = false;

        const _nom = escapeHtml(window.PlanRegistry.displayName(plan));
        if (reason === "server") {
          titre = _t("home.plans.notFound.titleServer");
          explication = _t("home.plans.notFound.bodyServer", { nom: _nom, path: escapeHtml(plan.zip || plan.path) });
          canRetry = true;
        } else if (reason === "local-blob") {
          titre = _t("home.plans.notFound.titleBlob");
          explication = _t("home.plans.notFound.bodyBlob", { nom: _nom });
          canReSelect = true;
        } else if (reason === "local-fs") {
          titre = _t("home.plans.notFound.titleFs");
          explication = _t("home.plans.notFound.bodyFs", { nom: _nom });
          canReSelect = true;
        } else if (reason === "local-fs-denied") {
          titre = _t("home.plans.notFound.titleDenied");
          explication = _t("home.plans.notFound.bodyDenied", { nom: _nom });
          canReSelect = true;
        }

        const modal = document.createElement("div");
        modal.id = "planIntrouvableModal";
        modal.className = "kta-readme-modal-overlay";
        modal.innerHTML = `
          <div class="kta-readme-modal-boite" style="max-width:480px;">
            <div class="kta-readme-modal-header">
              <span class="kta-readme-modal-titre">${titre}</span>
              <button class="kta-panneau-close" id="planIntrFermer">✕</button>
            </div>
            <div class="kta-readme-modal-corps" style="padding:18px;">
              <p style="font-size:13px; color:#c0c8d8; line-height:1.6; margin:0 0 14px;">
                ${explication}
              </p>
              <p style="font-size:13px; color:#e8eaf0; margin:0 0 12px;">${_t("home.plans.notFound.prompt")}</p>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${canRetry ? '<button class="kta-btn kta-btn-primary" data-action="retry">' + _t("home.plans.notFound.retry") + '</button>' : ''}
                ${canReSelect ? '<button class="kta-btn kta-btn-primary" data-action="reselect">' + _t("home.plans.notFound.reselect") + '</button>' : ''}
                <button class="kta-btn kta-btn-primary" data-action="remove" style="background:#5e2828; border-color:rgba(255,140,140,0.3);">${_t("home.plans.notFound.remove")}</button>
                <button class="kta-btn kta-btn-ghost" data-action="cancel">${_t("home.plans.notFound.cancel")}</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        function fermer() { modal.remove(); }
        document.getElementById("planIntrFermer").addEventListener("click", fermer);
        modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

        modal.querySelectorAll("button[data-action]").forEach(function(btn) {
          btn.addEventListener("click", async function() {
            const action = btn.dataset.action;
            fermer();
            if (action === "retry") {
              // Réessayer le chargement
              chargerPlanDuRegistre(plan.id);
            } else if (action === "reselect") {
              // Ouvrir le sélecteur de fichier (avec restauration des options de persistance)
              await reSelectionnerZipPourPlan(plan, { restorePersistance: true });
            } else if (action === "remove") {
              window.PlanRegistry.remove(plan.id);
              window.refreshPlansList();
              setStatus(_t("home.plans.removedStatus"));
            }
            // cancel → rien
          });
        });
      }

      // === RE-SÉLECTION D'UN ZIP POUR UN PLAN LOCAL ===
      // options = { restorePersistance: true } pour réactiver la copie si l'entrée originale l'avait
      async function reSelectionnerZipPourPlan(plan, options) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        options = options || {};
        let file = null;

        // 15/09/2026 : plus de sélecteur système ici (il ne servait qu'à prendre
        // une référence disque, retirée — cf. l'accueil). Champ classique partout.
        if (!file) {
          file = await new Promise(function(resolve) {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".zip,application/zip";
            input.onchange = function() { resolve(input.files[0] || null); };
            input.click();
          });
        }

        if (!file) return;

        // Vérifier que le ZIP correspond bien (nom du plan) ET les modes (V1/V2,
        // multi-niveau) — sinon incohérence registre vs ZIP réel.
        let zipFlags = { tiledV2: false, multiLevel: false };
        try {
          const { planConfigFile } = await extraireZip(file);
          const text = await planConfigFile.text();
          const cfg = JSON.parse(text);
          const ziPName = (cfg.plan?.name || "").trim();
          const planName = (plan.name || "").trim();

          // Capturer les flags du ZIP pour le sync ultérieur du registre
          zipFlags.tiledV2    = cfg.plan?.tiledV2    === true;
          zipFlags.multiLevel = cfg.plan?.multiLevel === true;

          // 1) Check nom du plan — REFUS DÉFINITIF si discordance (v171).
          // Avant : confirm "Charger quand même ?" → l'user pouvait accepter
          // un ZIP au nom différent, ce qui créait des incohérences silencieuses
          // (badges, sessions liées au mauvais plan, métadonnées polluées).
          // Maintenant : modale custom rouge, bouton unique "J'ai compris",
          // import refusé. Si l'user veut vraiment charger ce ZIP, il passe
          // par 📦 Charger un nouveau plan (= entrée distincte, id auto-généré).
          if (ziPName && planName && ziPName !== planName) {
            await _afficherModaleNomZipKO(ziPName, planName);
            return;
          }

          // 2) v170 fix : check discordance de mode (V1/V2 + multi-niveau).
          // Cas remonté : user reset + import sauvegarde liste → registre a
          // `tiledV2: true` mémorisé, mais le ZIP fourni à la re-sélection est
          // un V1 du même plan → incohérence visuelle (badge V2 sur plan V1)
          // + risque de crash runtime (modules qui lisent les flags registre).
          const registreV2  = plan.tiledV2    === true;
          const registreML  = plan.multiLevel === true;
          const discordances = [];
          if (registreV2  && !zipFlags.tiledV2)    discordances.push({ flag: "V2 tuilé",    avant: _t("home.plans.info.modeV2"),        apres: _t("home.plans.info.modeV1") });
          if (!registreV2 && zipFlags.tiledV2)     discordances.push({ flag: "V2 tuilé",    avant: _t("home.plans.info.modeV1"), apres: _t("home.plans.info.modeV2") });
          if (registreML  && !zipFlags.multiLevel) discordances.push({ flag: "Multi-niveau",avant: _t("home.plans.info.modeMlvl"),apres: _t("home.plans.info.modeMono") });
          if (!registreML && zipFlags.multiLevel)  discordances.push({ flag: "Multi-niveau",avant: _t("home.plans.info.modeMono"),            apres: _t("home.plans.info.modeMlvl") });

          // v171 : modale custom (orange warning) au lieu de confirm() natif.
          // Continue offert car le ZIP fait foi (sync automatique des flags).
          if (discordances.length > 0) {
            const ok = await _afficherModaleModeDifferent(window.PlanRegistry.displayName(plan), discordances);
            if (!ok) return;
          }
        } catch(e) {
          setStatus(_t("home.plans.zipInvalid") + (e.message || e), true);
          return;
        }

        // v170 fix : aligner les flags du registre AVANT le chargement.
        // addOrUpdate (appelé par startImportedPlan) merge avec Object.assign
        // → si on ne sync pas ici, les anciens flags tiledV2/multiLevel
        // restent en place (le ZIP V1 ne les déclare pas, donc Object.assign
        // ne les écrase pas).
        try {
          if (window.PlanRegistry && typeof window.PlanRegistry.syncModeFlags === "function") {
            window.PlanRegistry.syncModeFlags(plan.id, zipFlags);
          }
        } catch(e) { console.warn("[ReSelect] syncModeFlags KO :", e); }

        // Re-sélection = même règle que le clic sur Mes plans :
        // segmented explicite (≠ "auto") → override
        // segmented = "auto" → preset mémorisé pour ce plan (ou "auto" si jamais réglé)
        const segmented = (typeof window.getLoaderPerfPreset === "function") ? window.getLoaderPerfPreset() : "auto";
        const presetPlan = (segmented !== "auto") ? segmented : (plan.perfPreset || "auto");

        // Construire les meta — restaurer la persistance si demandé (option 4:a)
        const meta = { planId: plan.id };
        if (options.restorePersistance) {
          // Restaurer la copie si l'entrée était mémorisée. Une ancienne entrée
          // en « accès permanent » (référence disque cassée, donc on est ici)
          // MIGRE vers la copie : c'est désormais le seul mécanisme.
          if (plan.storedBlob || plan.fsHandleId) meta.storeBlob = true;
        }

        try {
          await chargerZipFichier(file, presetPlan, meta);
        } catch(err) {
          setStatus("Erreur : " + (err.message || err), true);
        }
      }

      // === BOUTON REPRENDRE ===
      const resumeBtn = document.getElementById("resumeBtn");
      if (resumeBtn) {
        resumeBtn.addEventListener("click", function() {
          const id = document.getElementById("resumeBox").dataset.planId;
          if (id) chargerPlanDuRegistre(id);
        });
      }

      // === EXPORTER LE PROFIL (v1.22.0) ===
      // L'ancien bouton "Exporter ma liste" devient "Exporter mon profil" :
      // plus seulement la liste des plans, mais aussi préférences + favoris
      // + sessions + snapshots + tutorial (+ photos / crashes optionnels).
      // Modale dédiée avec checkboxes granulaires + tailles MB par section.
      // L'ancien format `myktamap-plans-list` reste accepté à l'import via
      // rétro-compat (cf parseProfile détection auto).
      const exportListBtn = document.getElementById("exportListBtn");
      if (exportListBtn) {
        exportListBtn.addEventListener("click", function() {
          const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
          if (window.ProfileExportImport && typeof window.ProfileExportImport.ouvrirExportModale === "function") {
            window.ProfileExportImport.ouvrirExportModale();
          } else {
            // Fallback : ancien comportement si module pas chargé
            if (window.PlanRegistry) {
              window.PlanRegistry.exportToFile();
              setStatus(_t("home.loader.listExportedLegacy"));
            }
          }
        });
      }

      // === FILTRE "Afficher plans serveur" (v170) ===
      // Persistance localStorage via les helpers _loaderShowServerPlans /
      // _loaderSetShowServerPlans. Bind unique au boot, le state visuel de la
      // checkbox est sync'd dans refreshPlansList (au cas où on re-render
      // depuis ailleurs après un changement programmatique).
      const showServerCb = document.getElementById("loaderShowServerPlans");
      if (showServerCb) {
        // Restore l'état persisté au boot
        showServerCb.checked = _loaderShowServerPlans();
        showServerCb.addEventListener("change", function() {
          _loaderSetShowServerPlans(showServerCb.checked);
          window.refreshPlansList();
        });
      }

      // 📁 16/09/2026 — sélecteur TOUT / DOSSIERS (le mode est une préférence,
      // mémorisée dans le registre), ➕ Nouveau dossier, ☑ Sélection.
      const vueSwitch = document.getElementById("loaderPlansViewSwitch");
      if (vueSwitch) vueSwitch.querySelectorAll("[data-view]").forEach(function(b) {
        b.addEventListener("click", function() {
          if (window.PlanRegistry && window.PlanRegistry.setPlansView) window.PlanRegistry.setPlansView(b.dataset.view);
          window.refreshPlansList();
        });
      });
      const bNewFolder = document.getElementById("loaderPlansFolderNew");
      if (bNewFolder) bNewFolder.addEventListener("click", function() { _ouvrirMenuDossier(null); });
      const bSelect = document.getElementById("loaderPlansSelect");
      if (bSelect) bSelect.addEventListener("click", function() {
        _plansSelectMode = !_plansSelectMode;
        if (!_plansSelectMode) _plansSelection.clear();
        window.refreshPlansList();
      });

      // 🏷️ v1.78.0 — filtre par NOM (bind unique au boot, état RAM only :
      // un filtre est un geste de session, pas une préférence).
      const nameFilterInput = document.getElementById("loaderPlansNameFilter");
      if (nameFilterInput) {
        nameFilterInput.addEventListener("input", function() {
          _plansNameFilter = nameFilterInput.value.trim().toLowerCase();
          window.refreshPlansList();
        });
      }

      // 🆕 v1.21.3 — Wire-up de la pref "Ne pas charger les plans serveur".
      // Sync au boot + change handler. Masque automatiquement le toggle
      // "Afficher plans serveur" du home si pref active (= toggle inutile
      // quand les plans serveur sont déjà skippés à la racine).
      function _syncSkipServerPlansUI() {
        const skipCb = document.getElementById("loaderSkipServerPlansCb");
        if (skipCb) skipCb.checked = window._loaderSkipServerPlans();
        // Masque/montre le toggle home selon la pref
        const homeFilterRow = document.querySelector(".loader-plans-filters");
        if (homeFilterRow && window._loaderSkipServerPlans()) homeFilterRow.style.display = "none";
        // (l'affichage inverse est décidé par refreshPlansList : il sait s'il existe des plans du site)
      }
      const skipServerCb = document.getElementById("loaderSkipServerPlansCb");
      if (skipServerCb) {
        skipServerCb.checked = window._loaderSkipServerPlans();
        skipServerCb.addEventListener("change", function() {
          const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
          _loaderSetSkipServerPlans(skipServerCb.checked);
          _syncSkipServerPlansUI();
          // Re-render liste home immédiatement (filtre les plans serveur déjà
          // dans le registre, sans reload). Le re-discovery ne se fera qu'au
          // prochain reload — l'user voit déjà l'effet visuel principal.
          if (typeof window.refreshPlansList === "function") {
            try { window.refreshPlansList(); } catch(e) {}
          }
          // Toast informatif sur le reload pour effet complet
          if (window.OOMGuard && window.OOMGuard.showToast) {
            window.OOMGuard.showToast(
              skipServerCb.checked
                ? _t("home.serverPlans.hiddenToast")
                : _t("home.serverPlans.shownToast"),
              "info"
            );
          }
        });
      }
      // Sync initial du masquage du toggle home (au cas où pref active au boot)
      _syncSkipServerPlansUI();

      // === IMPORTER UN PROFIL (v1.22.0) ===
      // Le bouton ouvre désormais une modale unifiée qui détecte automatiquement
      // le format du JSON déposé :
      //   - "myktamap-profile-export" (nouveau v1.22.0+) → import par sections
      //     avec checkboxes granulaires + mode merge/replace
      //   - "myktamap-plans-list"     (legacy ≤ v1.21.x) → bannière "format ancien"
      //     + import limité à la section registry (= ancien comportement préservé)
      // Le file picker reste le même (#importListFile), seule la logique change.
      // 🐛 Fix Karma_dev : on découple le bind du handler `change` (qui doit
      // toujours être attaché car le file picker est trigger maintenant depuis
      // la modale Détails profil) du bind du click sur `importListBtn` (qui a
      // été retiré du DOM avec la refonte profil). Avant : `if (importListBtn
      // && importListFile)` → false dès qu'on retirait le bouton → change
      // handler jamais attaché → "Importer profil" ne faisait rien.
      const importListBtn = document.getElementById("importListBtn");
      const importListFile = document.getElementById("importListFile");
      if (importListBtn && importListFile) {
        // Ancien bouton encore présent (config legacy) : on garde son click.
        importListBtn.addEventListener("click", function() {
          importListFile.click();
        });
      }
      if (importListFile) {
        // Handler change INDÉPENDANT du bouton — sert AUSSI à la modale
        // Détails profil qui trigger ce file picker via getElementById + click().
        importListFile.addEventListener("change", async function() {
          const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
          const file = importListFile.files[0];
          if (!file) return;
          if (window.ProfileExportImport && typeof window.ProfileExportImport.ouvrirImportModale === "function") {
            try {
              await window.ProfileExportImport.ouvrirImportModale(file);
            } catch(e) {
              setStatus(_t("home.loader.errImportOpen") + (e.message || e), true);
            }
          } else {
            // Fallback : ancien comportement si module pas chargé (très improbable
            // car ProfileExportImport est dans ASSETS_TO_CACHE depuis v1.22.0)
            try {
              const stats = await window.PlanRegistry.statsImport(file);
              if (!stats.ok) { setStatus(_t("home.loader.errPrefix") + stats.error, true); importListFile.value = ""; return; }
              const choix = await afficherChoixImportListe(stats);
              if (!choix) { importListFile.value = ""; return; }
              const r = await window.PlanRegistry.importFromFile(file, choix);
              setStatus(choix === "replace"
                ? _t("home.loader.listReplaced", { n: r.count })
                : _t("home.loader.listMerged", { n: stats.newOnes, m: stats.duplicates }));
              window.refreshPlansList();
            } catch(e) { setStatus(_t("home.loader.errPrefix") + (e.message || e), true); }
          }
          importListFile.value = "";  // reset input pour permettre re-sélection
        });
      }

      // === 👤 BANDEAU PROFIL UTILISATEUR (Karma_dev) ===
      // Init au boot + refresh sur changement via UserProfile.onChange.
      // Le bandeau est cliquable (toute la zone) ET le bouton ⚙️ dédié.
      // Click → ouvre la modale détails (édition surnom / photo / stats /
      // export / import / reset).

      // ═══════════════════════════════════════════════════════════
      // 📱 v1.68.0 — HOME MOBILE (lot A, ≤ 640 px, desktop intouché)
      // ═══════════════════════════════════════════════════════════
      // Étude KARMA « interface plus dédiée mobile » (reco 1:a 2:a 3:a) :
      // ① liste des plans BORNÉE aux 5 récents + bouton « 📚 Tous mes
      //   plans (N) » dépliant (avec 20+ plans, les outils partaient à
      //   3 écrans de scroll) ;
      // ② les 5 boutons outils regroupés en ACCORDÉON « 🧰 Outils »
      //   replié (fréquence d'usage inégale, mur de texte évité).
      // Le reste du lot (hero Reprendre, dropzone compacte, cibles 44px)
      // est en CSS pur — cf style.css @media (max-width: 640px).

      // ① Liste bornée — rappelée à CHAQUE refreshPlansList (idempotente).
      // Masquage par classe CSS (les listeners des lignes cachées restent
      // branchés — le dépliage ne re-render rien).
      function _ktaMobileCollapsePlans() {
        const list = document.getElementById("allPlansList");
        if (!list) return;
        const old = document.getElementById("kta-home-plans-more");
        if (old) old.remove();
        list.classList.remove("kta-collapsed");
        if (!window.matchMedia || !window.matchMedia("(max-width: 640px)").matches) return;
        const rows = list.querySelectorAll(".plan-row").length;
        if (rows <= 5) return;
        list.classList.add("kta-collapsed");
        const btn = document.createElement("button");
        btn.id = "kta-home-plans-more";
        btn.type = "button";
        btn.className = "loader-btn-secondary";
        function _maj() {
          const replie = list.classList.contains("kta-collapsed");
          btn.textContent = replie
            ? "📚 " + _homeT("home.mobile.plansAll", "Tous mes plans") + " (" + rows + ")"
            : "▴ " + _homeT("home.mobile.plansLess", "Réduire la liste");
        }
        btn.addEventListener("click", function() {
          list.classList.toggle("kta-collapsed");
          _maj();
        });
        list.insertAdjacentElement("afterend", btn);
        _maj();
      }

      // ② HOME v2 (refonte KARMA 29/07) : l'accordéon Outils du lot A est
      // SUPPRIMÉ — la liste verticale de 5 boutons qui justifiait le repli
      // est devenue une grille 2×2 de 4 tuiles (~120 px), assez compacte pour
      // rester visible sur mobile. Le CSS `.loader-secondary-actions{display:
      // none}` ≤ 640 px a été retiré en même temps (sinon outils invisibles).

      // ── Ponts B7 : consommés par homeProfile/homeConfig/le bloc résiduel
      // (setStatus partout), le plan switcher du titre (chargerPlanDuRegistre,
      // ex-ligne 5918 du monolithe) et les modales SW (onLoadPlanClick,
      // reSelectionnerZipPourPlan). Call-sites inchangés (résolution globale).
      window.setStatus = setStatus;
      window.chargerPlanDuRegistre = chargerPlanDuRegistre;
      window.onLoadPlanClick = onLoadPlanClick;
      window.reSelectionnerZipPourPlan = reSelectionnerZipPourPlan;
    });
