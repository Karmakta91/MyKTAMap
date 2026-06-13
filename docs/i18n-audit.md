# 🌍 Audit i18n — Inventaire du français codé en dur

> Phase 1 du chantier « migration multilingue complète ». État : **AUDIT (lecture seule)** — aucune migration appliquée. Source de référence du pattern : `docs/architecture/i18n.md`.

## Méthodologie

- **Périmètre (user-facing)** : labels de boutons, titres/corps de modales, toasts, tooltips (`title=` / `aria-label=`), placeholders, `alert()` / `confirm()`, légendes, libellés de menus, textes `innerHTML` / `textContent` / `bindPopup`, textes gravés dans les exports (PDF/PNG/CSV).
- **Exclu** : `console.log/warn/error` (préfixés `[Module]`), commentaires, ids/clés internes, noms de fichiers, CSS, et tout ce qui est **déjà migré** (`I18n.t()` ou `data-i18n`).
- **Hors scope (portée séparée)** : doc + onboarding (`interfaceDocs.js`, `tutorial.js` → clé `myktamap_readme_lang`), infra (`i18n.js`).
- **Méthode** : 8 sous-agents en parallèle, un par groupe de modules (grep accents + patterns `>texte<`, `"texte"`, `title=`, `alert/confirm`). Chiffres = chaînes distinctes user-facing.

## 📊 Master — par module (≈ 1400 chaînes)

| Module | Préfixe | Chaînes | Vague |
|---|---|---|---|
| **interface.js** | `ui.*` | 124 | 1 |
| **refonteInterface.js** | `ui.*` | 99 | 1 |
| filterPanel.js | `filter.*` | 9 | 1 |
| interfaceLegende.js | `legendui.*` | 28 | 1 |
| interfaceAlerts.js | `alerts.*` | 24 | 1 |
| interfaceDistanceTotale.js | `disttot.*` | 6 | 1 |
| searchPoints.js | `search.*` | 40 | 1 |
| **interfaceConfig.js** (lot 2b : Perf ULTRA, Géoréf, M-LVL) | `config.*` | 46 | 2 |
| **index.html** (footer, widget OSM, cartes plans, modale config HOME) | `home.*` | 41 | 2 |
| interfaceMaintenance.js | `maint.*` | 40 | 2 |
| pinLock.js | `pin.*` | 34 | 2 |
| unlockGate.js | `gate.*` | 18 | 2 |
| planDenylist.js | `denylist.*` | 9 | 2 |
| memInspector.js | `meminsp.*` | 76 | 2 |
| swInspector.js | `swinsp.*` | ~45 (hors logs) | 2 |
| incognitoMode.js | `incognito.*` | ~15 (hors logs) | 2 |
| userProfile.js | `profile.*` | 4 | 2 |
| **interfaceItineraire.js** | `iti.*` | 66 | 3 |
| **osmView.js** | `osm.*` | 44 | 3 |
| osmHomePreview.js | `osm_home.*` | 34 | 3 |
| road.js | `road.*` | 5 | 3 |
| heatmap.js | `heatmap.*` | 18 | 3 |
| favoris.js | `fav.*` | 2 | 3 |
| **createConf.js** | `gen.*` | 99 | 4 |
| editor.js | `editor.*` | 32 | 4 |
| tableEditor.js | `editor.*` (tbl) | 27 | 4 |
| legendCustomization.js | `legend.*` | 19 | 4 |
| structures.js | `struct.*` | 5 | 4 |
| measure.js | `measure.*` | 2 | 4 |
| northPicker.js | `north.*` | 5 | 4 |
| imageLayerCalibrationPicker.js | `imgcal.*` | 11 | 4 |
| **sessionExporter.js** | `export.*` | 34 | 5 |
| exporter.js | `export.*` | 22 | 5 |
| pdfExport.js | `export.*` (pdf) | 16 | 5 |
| sessionReport.js | `report.*` | 8 | 5 |
| sessionBackups.js | `backup.*` | 6 | 5 |
| kmzExport.js | `kmz.*` | 5 | 5 |
| kmzImport.js | `kmz.*` | 4 | 5 |
| gpxIO.js / gpxImport.js | `gpx.*` | ~5 | 5 |
| interfaceImportExport.js | `impexp.*` | ~11 | 5 |
| profileExportImport.js | `profileio.*` | ~12 | 5 |
| statsGlobales.js | `stats.*` | 70 | 6 |
| modeHistoire.js | `histoire.*` | 31 | 6 |
| voiceCommand.js | `voice.*` | 49 | 6 |
| trackerReplay.js | `replay.*` | 14 | 6 |
| photoViewer.js | `photoviewer.*` | ~3 (hors logs) | 6 |
| tracking.js | `track.*` | ~0 (logs only) | 6 |
| **secoursMode.js** | `secours.*` | **262** | 7 |
| emergencyMode.js | `emergency.*` | 14 | 7 |
| lostMode.js | `lost.*` | 72 | 7 |
| sortieUrgence.js | `sortie.*` | 21 | 7 |

**Modules SANS chaîne user-facing** (logs/logique uniquement, hors scope) : `utils.js`, `zones.js`, `map.js`, `photos.js`, `updateChecker.js` (modales déjà migrées ailleurs), `tracking.js` (logs).

---

## Détail par module

> Tables condensées : les blocs d'énumération répétitifs (labels de tags/légende) sont regroupés ; les lignes `console.log` pures sont retirées (non user-facing). Numéros de ligne = repère à l'instant de l'audit (peuvent dériver).

### Vague 1 — Navigation & UI core

#### js/interface.js (`ui.*`) — 124
Menus/sous-actions (barre d'outils), modales de confirmation, toasts d'édition. Exemples clés :
`ui.btn.annuler` Annuler · `ui.btn.confirmer` Confirmer · `ui.btn.charger` Charger · `ui.modal.changer_plan` Changer de plan · `ui.section.plans_recents` Plans récents · `ui.modal.tracker_warning` Tracker — Module expérimental (+ corps `ui.warning.tracker_*`) · `ui.group.aide_docs` / `.settings` / `.recherche` / `.charger` / `.save` / `.history` / `.tracker` / `.mesure` / `.edition` / `.traces` / `.zones` / `.structures` · sous-actions `ui.subaction.*` (Aide, Documentation, Aide IA, Légende, Importer, Éditer JSON, Enregistrer session, Export image/PDF, Undo/Redo, Boussole, Recalage, Itinéraire, Replay, Heatmap, Lost, Emergency, Secours, Distance/Surface, Route principale/secondaire/chemin, Jonction…) · alertes `ui.alert.*` (module X indisponible) · modales d'effacement `ui.modal.{traces,zones,structures,mesure}` + options · dates relatives `ui.date.{instant,min,h,hier,jours}` · `ui.info.aucun_favori`.
*(Liste exhaustive : sweep agent — ~124 entrées.)*

#### js/refonteInterface.js (`ui.*`) — 99
Header bar + status bar + modale « Détails de session ». Exemples : `ui.refonte.btn_home` Retour accueil · `ui.refonte.section_stats` Stats agrégées · `ui.refonte.label_duree` Durée · `ui.refonte.section_points/traces/zones/structures` + empty states + hints (« Utilise ✏️ Édition pour en ajouter »…) · `ui.refonte.export_*` (titre/footer du résumé TXT) · toasts `ui.refonte.toast_*` (résumé copié/exporté, snapshot restauré/créé, backups effacés) · modale bascule interface `ui.refonte.modal_{new,old}_interface` + `.desc_*` + `.section_preserved` + items · `ui.refonte.gps_actif/inactif`, `.battery_unsupported`.

#### js/filterPanel.js (`filter.*`) — 9
`filter.empty_session` Aucun élément dans cette session · `filter.empty_data_layers` · `filter.msg_mono_level` · `filter.section_{images,data_layers,road_types,zone_types,struct_types}` · `filter.active_traces`.

#### js/interfaceLegende.js (`legendui.*`) — 28
Labels d'icônes (Puits Aération, Puits Comblé, Cavage ouvert/fermé, Escalier service ouvert/fermé, Véhicule, Électricité, Épure, Information, Chatière, Passage, Danger, Plaque indication, Position du tracker, Point sans tag, Point d'entrée du plan…) → `legendui.label.*` · groupes `legendui.groupe.{puits,acces,signaletique,secours,autres,custom}` · `legendui.empty_config`.

#### js/interfaceAlerts.js (`alerts.*`) — 24
Modales « Mise à jour / Alerte / Déjà à jour ». `alerts.title_{verification_impossible,up_to_date,no_alert,update_available}` · `alerts.msg_{offline,latest_version,no_alert_active}` · `alerts.section_{version_notes,news,update_modes}` · `alerts.label_{published,installed,soft_update,acknowledged}` · `alerts.desc/note_soft_update` · `alerts.warning_reset_all` · `alerts.btn_{ok,soft_update,hard_reset}`.

#### js/interfaceDistanceTotale.js (`disttot.*`) — 6
`disttot.msg_no_roads` / `.msg_trace_first` · `disttot.modal_title` Distance totale des tracés · `disttot.modal_instruction` · `disttot.modal_note_highlight` / `.modal_note_persist`.

#### js/searchPoints.js (`search.*`) — 40
`search.unified_title` 🔍 Recherche unifiée · `search.query_placeholder` (… ou GPS « 48.68, 2.15 ») · labels de type de tracé/structure (Principal/Secondaire/Chemin/Jonction/Itinéraire ; Pilier 1ère/2e, Mur, Front 1ère/2e) → `search.road_*` / `search.struct_*` · résultats `search.{no_results,results_count,filtered_info,all_available,no_match_query,no_match_filters,more_results}` · GPS `search.{gps_detected,not_georeferenced,georeference_hint,coord_out_of_bounds,nearby_poi,no_nearby_poi,create_point}` · `search.assign_secours`.

### Vague 2 — Réglages, système, sécurité, inspecteurs

#### js/interfaceConfig.js — lot 2b (`config.perfultra.*` / `config.mlvl.*` / `config.georef.*`) — 46
**Perf ULTRA** : `config.perfultra.title` + `.hint` ; 8 toggles `config.perfultra.{master,decim,animOff,noIntersect,noTooltips,slowSave,viewportCull,mobileZoomLimit}.{label,hint}`.
**Multi-niveau** : `config.mlvl.{title,hint,label,toggleHint}`.
**Géoréf GPS** : `config.georef.intro` · `config.georef.point{A,B}.{title,xLabel,yLabel,coordsLabel}` · `config.georef.{example,searchBtn,clickBtn,saveBtn,clearBtn}` · erreurs `config.georef.errors.{kmzUnavailable,invalidCoords,allFieldsRequired,formatError}` · `config.georef.{success,toastSuccess,cleared}` · recherche `config.georef.search.{placeholder,noResults}` · `config.georef.click.msg` · `config.tracker.click.msg` / `config.tracker.search.noResults`.

#### index.html — HOME restant (`home.*`) — 41
Footer (`home.copyright.*`, `home.contact.*`, `home.credits`), badge `home.paranoia.badge`, widget OSM interne (`home.osm.loading`…), **modale config HOME** (`home.loader.config.title`, `home.incognito.start.btn`, tiling presets `home.perf.tiling.*` + `home.perf.presets.*`, Perf ULTRA home `home.perf.ultra.*` + toggles, Debug `home.debug.*`, Inspecteurs `home.inspector.*`, Audit réseau `home.privacy.*`).

#### js/interfaceMaintenance.js (`maint.*`) — 40
Modales mise à jour douce / reset complet + overlays connexion. `maint.title_{updating,soft_update_needs_server}` · `maint.msg_*` (checking, prep, reloading, caches_deleted, no_data_deleted, data_intact…) · `maint.reason_{server_down,ssl_dns}` · `maint.warning_*` (about_to_reset, server_offline, needs_server) · `maint.consequence_*` · `maint.btn_continue_anyway` · `maint.note_ask_code_after_reset`.

#### js/pinLock.js (`pin.*`) — 34
Erreurs PIN `pin.errors.*` (notNumber, notDigitsOnly, tooShort/Long, pinIncorrect, tooManyAttempts, lockoutActive…) · UI `pin.ui.{title,subtitle,attemptsRemaining,bioUnlock,erase,validate,readmeBtn}` · lockout `pin.lockout.{title,subtitle,solutions,message,readmeBtn}` · proposition `pin.proposal.{title,intro,whyTitle,whyDesc,warningTitle,warnings,footer,rejectBtn,acceptBtn,manualMsg}`.

#### js/unlockGate.js (`gate.*`) — 18
`gate.title` Accès restreint · `gate.info` · `gate.contact` · `gate.placeholder` Code d'accès · `gate.submitBtn` · `gate.proLicense.{desc,btn}` · `gate.readmeBtn` · `gate.signature` · lockout `gate.lockout.{title,message,hint,readmeBtn}` · `gate.errors.{empty,incorrect,attemptsRemaining,licenseModuleUnavailable}` · `gate.success` · `gate.license.success`.

#### js/planDenylist.js (`denylist.*`) — 9
`denylist.defaultReason` · `denylist.modal.{title,subtitle,reasonLabel,technicalDetails,confirmBtn}` · `denylist.purged.{title,subtitle,intro,btn}`.

#### js/memInspector.js (`meminsp.*`) — 76
Rapport texte (copié) + modale Inspecteur mémoire : `meminsp.report_header`, sections `meminsp.section_{runtime,localstorage,indexeddb,cache_pwa,storage_estimate,crashes}`, labels (`label_plan_loaded`, `label_author`, `label_mlevel`, `label_session_active`…), modale `meminsp.modal_title` + boutons `btn_{refresh,copy_report,clear_all_crashes}` + confirms + `modal_crash_detail_title`. *(Beaucoup de labels courts — sweep agent ~76.)*

#### js/swInspector.js (`swinsp.*`) — ~45 (hors ~25 logs)
Modale Inspecteur SW : verdicts `swinsp.verdict_{ok,incomplete}` + détails, labels d'échec (`label_{404,5xx,4xx,network_error,quota_exceeded,parse_error,unknown_error}`), sections (`section_{missing,install_failures,present,dynamic_cache}`), diagnostics (`diagnostic_{ftp_partial,network_issue,mixed_issues,quota_exceeded}`), boutons/feedbacks (`btn_refetch`, `progress_*`, `feedback_*`), toast `toast_{incomplete_title,action_text}`. **Exclure** les `swinsp.log_autoheal_*` (console).

#### js/incognitoMode.js (`incognito.*`) — ~15 (hors logs)
Modale de confirmation : `incognito.modal_title` · `incognito.section_{what_changes,warnings,ideal_for}` · `incognito.text_*` (no_data_saved, new_window, badge_reminder, skip_tutorial, changes_lost, demo, lend_session, explore_sensitive, test_fresh_state) · `incognito.btn_{cancel,activate}` · `incognito.badge_tooltip`. **Exclure** `incognito.log_*` (console/debug).

#### js/userProfile.js (`profile.*`) — 4
`profile.error_{image_dimensions,image_too_large,toblob_failed,image_load_failed}`.

### Vague 3 — Itinéraire & OSM

#### js/interfaceItineraire.js (`iti.*`) — 66
Modale itinéraire (navigation + calcul) : `iti.{active_itinerary_title,go_anyway,calculate_title,active_navigation}` · presets vitesse `iti.preset_{wounded,slow,normal}` + `.hint` · `iti.{distance_label,estimated_time,no_waypoints,goto_waypoint}` · évitements `iti.avoid_{prefs_title,prefs_help,points_title,tags_title,tags_help,margin_title,reset,impossible,fallback_explain}` · `iti.{recalculate,calculate,erase_button,speed_title,pause_title,include_pause,pause_duration,pause_help,save_as_itinerary}` · erreurs `iti.{pathfinder_not_loaded,calculation_error,min_waypoints,point_not_found,confirm_clear_avoid,confirm_erase}` · recherche `iti.{no_results,search_more}`.

#### js/osmView.js (`osm.*`) — 44
Modale Vue OSM : `osm.modal_title` · contrôles (`osm.{show_controls,hide_controls,opacity_label,center_tracker,levels_label,levels_hint,tag_filter_*}`) · GPS (`osm.{strict_offline_gps_alert,incognito_gps_alert,geoloc_unavailable,gps_out_of_bounds,gps_accuracy,gps_permission_denied,gps_unavailable_sensor,gps_timeout,gps_fix_tooltip}`) · cache (`osm.cache_{tooltip,stats_tooltip,no_network,downloaded,skipped,failed}`) · garde-fous (`osm.{no_georef,v2_only_title,v1_not_supported,v1_convert_hint,view_disabled_strict,view_disabled_incognito,offline_no_cache,osm_contact_warning,osm_opt_in_info,connection_check_title,connection_check_text,connection_failed}`) · Secours (`osm.secours_{iti_tooltip,entry_tooltip,toggle_tooltip}`).

#### js/osmHomePreview.js (`osm_home.*`) — 34
Placeholders (`osm_home.{offline_message,strict_offline_message,reactivate_hint,incognito_message,no_plans_title,settings_hint,auto_appear,no_cache_message,cache_instruction}`) · contrôles (`osm_home.{select_plan,gps_fix_tooltip,cache_tooltip,hide_controls,fullscreen_tooltip,opacity_*,cache_stats_tooltip,reduce_map,fullscreen,show_controls}`) · GPS/toasts (mêmes familles qu'osmView, préfixe `osm_home.`).

#### js/road.js (`road.*`) — 5
`road.new_road` Nouveau tracé {type} · `road.vertex_on_road` · `road.type_{principal,secondary,path}`.

#### js/heatmap.js (`heatmap.*`) — 18
`heatmap.{no_data,too_many_elements,info,modal_title,help_text,points_added,roads,roads_count,data_layers,toggle_all_layers,levels_title,toggle_all_levels,level_help,visual_params,intensity_label}`.

#### js/favoris.js (`fav.*`) — 2
`fav.storage_full` · `fav.file_read_error`.

### Vague 4 — Édition & Générateur

#### js/createConf.js (`gen.*`) — 99
Générateur de plan (le 2e plus gros) : modale (`gen.modal_title`), sections (`gen.{info_title,images_title,image_layers_title,data_layers_title,tracking_title,icons_tags_title,legend_title,georef_title,histoire_pdf_title}`), placeholders (`gen.{name_placeholder,version_placeholder,author_placeholder,tag_placeholder…}`), toggles + hints (`gen.{multilevel_*,tilingv2_tooltip,photos_*,north_offset_hint…}`), image vierge (`gen.{image_from_file,image_blank,blank_image_info,white/gray/black/sepia_color,generate_blank_btn,dimension_limits}`), géoréf (`gen.{point_a,point_b,gps_coords,gps_placeholder_*}`), boutons (`gen.{cancel_btn,generate_btn,choose_btn,load_defaults_btn,add_tag_btn,edit_legend_btn,reset_legend_btn}`), statuts/erreurs KMZ/GPX import (`gen.{kmz_*,gpx_*}`), confirms.

#### js/editor.js (`editor.*`) — 32
Modale ajout/édition de point : labels de tags built-in (Salle, Puits Aération, Puits Comblé/Bouché, Cavage ouvert/fermé, Escalier service…, Passage, Chatière, Véhicule, Danger, Information, Électricité, Épure, Plaque indication, Point d'entrée) → `editor.tag_labels.*` · `editor.{modal_add_title,modal_edit_title,save_btn,add_btn,position_title,info_title,name_placeholder,new_tag_option,custom_icon_hint,photos_title,take_photo_btn,gallery_btn,photo_hint,cancel_btn}` · erreurs (`editor.{name_required,invalid_tag,photos_unavailable,quota_per_point,quota_exceeded,photo_limit_reached,no_photos}`).

#### js/tableEditor.js (`editor.*` table) — 27
Éditeur tableau JSON : `editor.{modal_title,import_help,drop_label,drop_hint,editor_title,search_placeholder,add_row_btn,preview_map_btn,duplicate_btn,delete_btn,save_btn,large_dataset_warning,confirm_delete,preview_banner,back_to_editor_btn}` + erreurs (`invalid_file,no_data_found,no_points,select_rows_first,map_unavailable,no_valid_coords`).

#### js/legendCustomization.js (`legend.*`) — 19
Labels icônes/tracés/zones/structures (`legend.{icon,trace,zone,struct}_labels.*`) + catégories (`legend.category_{icons,traces,zones,structures}`) + modale (`legend.{editor_title,editor_info,add_entry_btn,reset_defaults_title,confirm_delete_custom}`).

#### js/structures.js (`struct.*`) — 5
`struct.{pilier1_label,pilier2_label,mur_label,front1_label,front2_label}`.

#### js/measure.js (`measure.*`) — 2
`measure.no_measure_alert` · `measure.no_roads_alert`.

#### js/northPicker.js (`north.*`) — 5
`north.{calibration_title,south_captured,north_captured,already_active,map_unavailable}`.

#### js/imageLayerCalibrationPicker.js (`imgcal.*`) — 11
`imgcal.{modal_title,close_label,step1,step2,step3,step4,step_preview,plugin_missing,anchors_too_close,already_active,missing_opts}`.

### Vague 5 — Exports / Imports

#### js/sessionExporter.js (`export.*`) — 34 · js/exporter.js (`export.*`) — 22 · js/pdfExport.js (`export.*`) — 16
Modale « Enregistrer la session » (onglets Avancé/Conversion/Export externe), modale Export image, modale Export PDF. Familles : `export.{modal_title,tab_*,btn_cancel,btn_download,full_*,advanced_*,conversion_*,kmz_*,gpx_*,pdf_*,mode_*,no_image_layers,no_data_layers,legend_*,error_*}` + crédits gravés (`export.pdf_credit`, etc.).

#### js/sessionReport.js (`report.*`) — 8 · js/sessionBackups.js (`backup.*`) — 6
`report.{title_label,description_label,description_placeholder,photo_label,btn_save,error_title_required,success_saved,error_not_saved}` · `backup.{modal_title,no_backups,btn_restore,btn_delete,success_restored,success_deleted}`.

#### js/kmzExport.js / kmzImport.js (`kmz.*`) — 9 · js/gpxIO.js / gpxImport.js (`gpx.*`) — ~5 · js/interfaceImportExport.js (`impexp.*`) — ~11 · js/profileExportImport.js (`profileio.*`) — ~12
`kmz.{calibration_required,point_a,point_b,coords_format,btn_generate,modal_title,select_file,importing,error}` · `gpx.{malformed,success,parse_error,modal_title,select_file}` · `impexp.{error_invalid_file,success_completed,error_during_import,gpx_module_unavailable,reading_file,error_display,drop_or_click,file_selected,file_loaded_success}` · `profileio.{error_display,export_generating,export_success,error_export_failed,error_no_file,error_reading_file,error_invalid_file,import_importing,error_import_failed,import_success,error_label_required,error_icon_url_required}`.

### Vague 6 — Stats, Histoire, Vocal, Replay, Photos

#### js/statsGlobales.js (`stats.*`) — 70
Modale Stats + rapport texte + PDF/CSV : cards (`stats.card_*`), sections écran (`stats.section_*`), rapport texte (`stats.report_*` / `stats.label_*`), boutons (`stats.btn_{refresh,export_csv,export_pdf,session_report,copy_report}`), feedbacks/erreurs (`stats.{feedback_*,error_*}`), libellés PDF (`stats.pdf_*` : title, author, dimensions, scale, headers de tableau, sections).

#### js/modeHistoire.js (`histoire.*`) — 31
`histoire.{modal_title,tab_note,tab_pdf,btn_edit,btn_preview,status_saved,status_modified}` · tooltips éditeur MD (`histoire.tooltip_{bold,italic,h1,h2,list,link,code,quote}`) · `histoire.{placeholder_notes,btn_import_pdf,btn_replace_pdf,btn_remove_pdf,text_no_pdf,text_pdf_info,text_empty_note,error_pdf_only,error_pdf_save,confirm_remove_pdf,text_ios_pdf_info,tooltip_open_pdf,btn_open_in_tab}`.

#### js/voiceCommand.js (`voice.*`) — 49
Feedbacks live + modale aide + labels de commandes : `voice.{status_listening,live_listening,feedback_success,feedback_unknown_command,error_*}` · `voice.{aria_mic_button,tooltip_mic_button,modal_help_title,help_text_intro,help_text_hint}` · labels commandes `voice.cmd_*` (zoom_in/out, center_view, open_search, add_point, itinerary, start/stop_tracker, emergency_mode, rescue_mode, light/dark_theme, help, stop_listening, close_modal, emergency_exit) + feedbacks associés.

#### js/trackerReplay.js (`replay.*`) — 14
`replay.{modal_title,button.minimize/maximize/restart/end.tooltip,section.time/point/speed,speed.options,error.no_tracking,export.info,button.export_csv,toast.exported}`.

#### js/photoViewer.js (`photoviewer.*`) — ~3
`photoviewer.tooltip_{close,prev,next}`. *(Le reste = console logs, exclus.)*

#### js/tracking.js (`track.*`) — ~0
Quasi exclusivement des `console.log [Tracking]` → **rien à migrer** (hors scope). Vérifier seulement s'il reste un `alert/toast` user-facing (sweep : aucun confirmé).

### Vague 7 — Mode Secours (le plus gros + critique → en dernier)

#### js/secoursMode.js (`secours.*`) — 262
Le plus volumineux. Familles : statuts (`secours.status.*`), toasts (`secours.toast.*` — ~80), modales (`secours.modal.{equipe,assigner,import,rapport,phase,lancer,zone,details,osm}.*`), formulaires (`secours.form.*`), boutons (`secours.btn.*` — ~50), labels/rôles (`secours.label.*`), erreurs/warnings d'import scénario+rapport (`secours.error.*`, `secours.warning.*`), résultats de fusion (`secours.result.*`), rapports texte/PDF (`secours.report.*`), empty states (`secours.empty.*`), hints (`secours.hint.*`), menus contextuels (`secours.menu.*`), recherche de points (`secours.{hint.recherche_*,form.recherche_placeholder}`), instructions carte (`secours.instruction.*`), notes Lost Mode importées (`secours.notes.*`). **Beaucoup d'interpolations** `{point}`, `{equipe}`, `{n}`, `{filename}`, `{distance}` → params i18n.

#### js/emergencyMode.js (`emergency.*`) — 14
`emergency.header.title` 🚨 MODE URGENCE · `emergency.section.{position,gps,heading,scale,plan,state}.label` · `emergency.hint.message` · `emergency.button.exit` · `emergency.status.{tracking_active,last_position,no_position,compass_unavailable}` · `emergency.scale.uncalibrated`.

#### js/lostMode.js (`lost.*`) — 72
Modale « Je suis perdu » + rapport texte. Presets (`lost.preset.{injured,slow,normal,fast}` + hints) · rapport (`lost.report.*` : title, plan, generated_at, sections position/elapsed/speed/radius/reach/matches/refined_location, disclaimer) · **bonnes pratiques** (`lost.practices.*` — ~25 items : stay_calm, orientation, light_resources, communication, wait, dont…) · UI (`lost.{section.*,search.placeholder,button.*,position.none_selected,unit.minutes,clues.placeholder,hint.close_behavior,error.no_tracker}`).

#### js/sortieUrgence.js (`sortie.*`) — 21
`sortie.modal.title` 🚨 Sortie d'urgence · `sortie.error.{none_found,none_found.detail,no_itinerary,no_map}` · `sortie.item.with_level` · `sortie.fallback.tooltip` · `sortie.button.{trace_route,show_alternatives,click_position,cancel,click_position}` · `sortie.modal.no_tracker` · `sortie.status.calculating` · `sortie.toast.pick_position`. ⚠️ `sortie.tag.*` (cao/peo/eso/entrée) = **valeurs moteur, NE PAS traduire** (ce sont des tags, pas du texte).

---

## ⚠️ Pièges relevés pendant l'audit

- **Ne pas traduire les valeurs-données** : tags moteur (`cao`, `peo`, `eso`, `entrée`, `track`, `default`…), ids de calques, noms de fichiers. Ce sont des clés logiques, pas du texte affiché.
- **`console.log` exclus** : tracking.js, photos.js, swInspector `log_autoheal_*`, incognitoMode `log_*`, map.js — non user-facing.
- **Interpolations nombreuses** dans secoursMode/lost/iti/osm → prévoir `{param}` des 2 côtés (fr + en) avec les MÊMES noms.
- **Pluriels** (`point(s)`, `tracé(s)`, `{n} équipe(s)`) : pour le FR le `(s)` inline reste OK ; pour l'EN, soit garder simple, soit gérer via param. À trancher au cas par cas (pas de moteur de pluralisation pour l'instant).
- **Textes gravés dans les exports** (PDF/CSV/PNG : crédits, en-têtes de tableau) = user-facing → à migrer aussi.
- **`updateChecker.js`** : ses modales sont rendues par `interface.js` (déjà comptées en `ui.*`) — ne pas doublonner.
