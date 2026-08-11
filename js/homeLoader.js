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

      // Handle FS Access courant (si l'utilisateur a sélectionné via showOpenFilePicker)
      let _currentFsHandle = null;

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
      zipDropZone.addEventListener("click", function (e) {
        // Ne pas ouvrir le picker si l'utilisateur a cliqué sur le bouton FS Access
        if (e.target.closest("#fsAccessHint")) return;
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
          if (typeof window.afficherImporterSig === "function") {
            zipFileName.textContent = "🗺️ " + f.name + " — ouverture de la conversion SIG…";
            window.afficherImporterSig(f);
          } else {
            setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.sigUnavailable") : "Module d'import SIG indisponible — ouvre 🏗️ Générer un plan et utilise « Convertir depuis un SIG »."), true);
          }
          return;
        }
        zipFileName.textContent = "✅ " + f.name;
        // Sélection via input classique : pas de handle FS
        _currentFsHandle = null;
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
          // Drop : pas de handle FS
          _currentFsHandle = null;
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
          if (typeof window.afficherImporterSig === "function") {
            zipFileName.textContent = "🗺️ " + f.name + " — ouverture de la conversion SIG…";
            window.afficherImporterSig(f);
          } else {
            setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.sigUnavailable") : "Module d'import SIG indisponible — ouvre 🏗️ Générer un plan et utilise « Convertir depuis un SIG »."), true);
          }
        } else {
          setStatus(((window.I18n && window.I18n.t) ? window.I18n.t("home.loader.badFileType") : "Le fichier doit être une archive .zip, un .kmz, un .gpx ou un fichier SIG (.geojson, .kml)"), true);
        }
      });

      // === FS ACCESS — sélection via showOpenFilePicker (handle persistable) ===
      const fsAccessHint = document.getElementById("fsAccessHint");
      const fsAccessBtn  = document.getElementById("fsAccessBtn");
      const storeBlobHint = document.getElementById("storeBlobHint");
      const storeBlobCb   = document.getElementById("storeBlobCb");
      const storeBlobInfo = document.getElementById("storeBlobInfo");

      // Choix de l'affichage selon la plateforme :
      //  - FS Access dispo (Chrome/Edge desktop) → bouton 🔐 visible, store-blob masqué
      //  - Sinon (mobile, Firefox, Safari) → store-blob visible, FS Access masqué
      const fsOk = window.PlanRegistry && window.PlanRegistry.hasFsAccess();
      if (fsOk && fsAccessHint) {
        fsAccessHint.style.display = "block";
      } else if (storeBlobHint) {
        storeBlobHint.style.display = "block";
      }

      if (fsAccessBtn) {
        fsAccessBtn.addEventListener("click", async function(e) {
          const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
          e.stopPropagation();
          try {
            const [handle] = await window.showOpenFilePicker({
              types: [{ description: "Plan ZIP", accept: { "application/zip": [".zip"] } }],
              excludeAcceptAllOption: false,
              multiple: false
            });
            const file = await handle.getFile();
            // Injecter dans l'input pour cohérence avec le flux de chargement existant
            const dt = new DataTransfer();
            dt.items.add(file);
            zipFileInput.files = dt.files;
            zipFileName.textContent = _t("home.loader.persistentAccess", { file: file.name });
            _currentFsHandle = handle;
            setStatus(_t("home.loader.zipSelected"), false);
          } catch(err) {
            if (err && err.name !== "AbortError") {
              setStatus(_t("home.loader.errSelection") + (err.message || err), true);
            }
          }
        });
      }

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
          if (_currentFsHandle) meta.fsHandle = _currentFsHandle;
          // Stockage du blob ZIP demandé (case cochée)
          if (storeBlobCb && storeBlobCb.checked) meta.storeBlob = true;

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
          return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
                 " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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
      function _homeT(key, fr) {
        if (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(key)) {
          return window.I18n.t(key);
        }
        return (fr !== undefined) ? fr : key;
      }

      function planRowHTML(plan) {
        let icon = plan.type === "server" ? "🌐" : "💾";
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
        return `
          <div class="plan-row${plan.pinned ? " kta-plan-row-pinned" : ""}" data-id="${plan.id}" title="${_homeT("home.plans.loadBtnTitle", "Charger ce plan")}">
            <span class="plan-row-icon">${icon}</span>
            <div class="plan-row-info">
              <div class="plan-row-title">
                <span class="plan-row-name-text">${escapeHtml(window.PlanRegistry.displayName(plan))}</span>
              </div>
              <div class="plan-row-modes">${badgesMode}${badgeStorage}${tagsHtml}</div>
            </div>
            <div class="plan-row-actions">
              <button class="plan-row-btn kta-plan-row-pin${plan.pinned ? " kta-actif" : ""}" title="${pinTitle}">${plan.pinned ? "⭐" : "☆"}</button>
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
      window._loaderSkipServerPlans = function() {
        return localStorage.getItem(LS_SKIP_SERVER) === "true";
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
          pushRow(_t("home.plans.info.keyServerPath"), plan.path, true);
        } else if (plan.type === "local") {
          pushRow(_t("home.plans.info.keySourceFile"), plan.originalFilename, true);
          pushRow(_t("home.plans.info.keySize"),       plan.fileSize ? fmtSize(plan.fileSize) : null);
          rows.push({ label: _t("home.plans.info.keyPersistence"), value: storageLabel, mono: false });
        }
        rows.push({ label: _t("home.plans.info.keyMode"), value: modesLabel, mono: false });
        if (plan.perfPreset) {
          pushRow(_t("home.plans.info.keyPreset"), plan.perfPreset);
        }
        pushRow(_t("home.plans.info.keyAddedAt"),    plan.addedAt    ? fmtDate(plan.addedAt)    : null);
        pushRow(_t("home.plans.info.keyLastOpened"), plan.lastOpened ? fmtDate(plan.lastOpened) : (plan.discovered ? _t("home.plans.info.neverOpened") : null));

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
              (dlHtml ? '<div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07);">' +
                        dlHtml +
                        '<div id="kta-plan-dl-status" style="font-size:12px; margin-top:8px; min-height:16px;"></div>' +
                        '</div>' : '') +
              // 🧹 v1.78.0 (KARMA) — la suppression vit ICI, en fin de modale
              // (le ✕ de la liste est retiré : clic accidentel trop facile).
              '<div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07);">' +
                '<button class="kta-btn kta-btn-danger kta-btn-small" id="kta-plan-infos-remove">🗑️ ' +
                  escapeHtml(_t("home.plans.removeBtnTitle")) + '</button>' +
                '<div style="font-size:11.5px; color:#8892a4; margin-top:6px; line-height:1.45;">' +
                  escapeHtml(_t("home.plans.info.removeHint")) + '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
        document.documentElement.appendChild(modal);

        // 🧹 v1.78.0 — suppression du plan depuis la modale (ktaConfirm,
        // règle D-confirm : nouveaux usages jamais en confirm() natif).
        const btnRemove = document.getElementById("kta-plan-infos-remove");
        if (btnRemove) {
          btnRemove.addEventListener("click", function() {
            const confirmer = (typeof window.ktaConfirm === "function")
              ? window.ktaConfirm(_t("home.plans.confirmRemove"), { okLabel: _t("home.plans.removeBtnTitle") })
              : Promise.resolve(confirm(_t("home.plans.confirmRemove")));
            confirmer.then(function(ok) {
              if (!ok) return;
              window.PlanRegistry.remove(plan.id);
              modal.remove();
              window.refreshPlansList();
            });
          });
        }

        // ✏️ v1.79.1 — renommage d'affichage (vide = retour au nom d'origine)
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

        // Sync visuelle de la checkbox (au cas où refreshPlansList est appelé
        // sans que le checkbox ait été coché manuellement, ex: au boot).
        const cbServer = document.getElementById("loaderShowServerPlans");
        if (cbServer) cbServer.checked = showServer;

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
          const cles = Object.keys(tousTags).sort();
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
            }).join("");
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

        // 🏷️ v1.78.0 — filtres nom + tags (RAM only, sur la liste déjà
        // filtrée serveur). Tags : il suffit qu'UN tag du plan matche (OU).
        const visibles = filtered.filter(function(p) {
          // ✏️ v1.79.1 — le filtre matche le nom AFFICHÉ **et** le nom réel
          // (retrouver « Cata KARMA » ou « Catacombes » doit marcher pareil).
          if (_plansNameFilter &&
              String(p.name || p.id).toLowerCase().indexOf(_plansNameFilter) === -1 &&
              String(p.displayName || "").toLowerCase().indexOf(_plansNameFilter) === -1) return false;
          if (_plansTagFilter) {
            const tags = Array.isArray(p.tags) ? p.tags : [];
            if (!tags.some(function(tg) { return _plansTagFilter.has(tg.toLowerCase()); })) return false;
          }
          return true;
        });

        const allPlansList = document.getElementById("allPlansList");
        if (allPlansList) {
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
        _ktaMobileCollapsePlans();   // 📱 v1.68.0 : liste bornée sur mobile

        // Brancher les listeners
        document.querySelectorAll(".plan-row").forEach(function(row) {
          const id = row.dataset.id;
          // 🧹 v1.71.0 : plus de bouton ▶️ — la row entière est cliquable
          // (listener plus bas) et porte le title « Charger ce plan ».
          // 🏷️ v1.78.0 — toggle épinglage (⭐/☆), sans charger le plan
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
            chargerPlanDuRegistre(id);
          });
        });
      };

      // === CHARGER UN PLAN DEPUIS LE REGISTRE ===
      async function chargerPlanDuRegistre(id) {
        const plan = window.PlanRegistry.findById(id);
        if (!plan) return setStatus("Plan introuvable dans la liste", true);

        if (plan.type === "server") {
          setStatus("Chargement de " + plan.name + "…");
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
              setStatus("Erreur : " + (e.message || e), true);
            }
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
          explication = _t("home.plans.notFound.bodyServer", { nom: _nom, path: escapeHtml(plan.path) });
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
      // options = { restorePersistance: true } pour réactiver storeBlob/fsHandle si l'entrée originale les avait
      async function reSelectionnerZipPourPlan(plan, options) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        options = options || {};
        let file = null;
        let handle = null;

        // Préférence : showOpenFilePicker (donne un handle persistable)
        if (window.PlanRegistry.hasFsAccess()) {
          try {
            const [h] = await window.showOpenFilePicker({
              types: [{ description: "Plan ZIP", accept: { "application/zip": [".zip"] } }],
              excludeAcceptAllOption: false,
              multiple: false
            });
            handle = h;
            file = await handle.getFile();
          } catch(e) {
            // Annulation utilisateur ou erreur — fallback input file
            if (e && e.name === "AbortError") return; // utilisateur a annulé
          }
        }

        // Fallback input file classique
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
        if (handle) meta.fsHandle = handle;
        if (options.restorePersistance) {
          // Restaurer storeBlob si l'entrée originale était mémorisée en IDB
          if (plan.storedBlob) meta.storeBlob = true;
          // Le fsHandle est déjà géré ci-dessus (handle est non-null si FS Access dispo + utilisateur a sélectionné via picker)
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
        if (homeFilterRow) {
          homeFilterRow.style.display = window._loaderSkipServerPlans() ? "none" : "";
        }
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
