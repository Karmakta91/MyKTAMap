# 🔎 Audit i18n — FR codé en dur (angle mort de la migration v1.46.x)

> Produit par `scripts/find-hardcoded-fr.js` + triage par 7 sous-agents (lecture seule).
> Chaque ligne = chaîne FR **user-facing** JAMAIS passée par `I18n.t()` / `data-i18n`.
> `check-i18n.js` ne pouvait pas les voir (il vérifie la parité + les clés *appelées*, pas le FR hors-dico).
> **⚠️ À VALIDER par KARMA avant migration (Phase B).**

## Total : ~335 vrais gaps (sur 804 candidats bruts)

| Groupe | Foyers principaux | Gaps |
|---|---|---|
| **G1 — index.html inline** | flux PIN (~45), modale Profil/pro/stats (~55), maintenance SW (~30) | **158** |
| **G4 — UI shell / utils** | utils.js (31), compass.js (12), interfaceConfig (11), main (1) | **55** |
| **G3 — Voix / crash / perf** | oomGuard (27), batteryGuard (12), presentationMode (2) | **41** |
| **G5 — Exports / session** | sessionReport (37), pdfExport (2), impexp/history/photos (3) | **41** |
| **G7 — Sécu / inspecteurs** | planRegistry (12), proLicense (9), networkAudit (3), stats/profile (2) | **26** |
| **G2 — Secours / urgence** | emergencyMode (8), pathfinder (4), road (1) | **13** |
| **G6 — Édition / légende** | createConf (1 — clé existe déjà) | **1** |

**Bonne nouvelle** : ~50 modules sont **réellement 100 % migrés** (le détecteur n'y voyait que des commentaires/données). Les gaps sont **concentrés** : index.html inline + une dizaine de modules.

## ⚠️ Arbitrages requis (cas ambigus signalés par les agents)

1. **sessionReport.js (37 gaps)** — contenu **généré** des rapports (TXT copié-collé + PDF), partagé hors-app (Discord/WhatsApp). Localiser ? (gros morceau, dépend aussi du format de dates)
2. **compass.js — cardinaux** (`SO/O/NO`) affichés : localiser en EN (`SW/W/NW`) / ES, ou laisser ?
3. **crashReports.formatReportText** — rapport diagnostique destiné au **mainteneur** (toi). Garder FR ?
4. **memInspector — ~5 messages d'erreur techniques** (Inspecteur mémoire). Localiser ou tolérer en FR ?
5. **Labels persistés à l'import** (kmzImport/gpxImport : « Plan importé KMZ », « (Tracé GPX) »…) — écrits en dur dans la donnée. Localiser **au rendu** (clé sentinelle) ou laisser figé ?
6. **Préfixe pour proLicense** → proposé `license.*` (valider le nom de préfixe).
7. **tiling.js / shortcuts.js** — libellés FR **non consommés** par l'UI actuelle (morts). Laisser / nettoyer ?

## Reco découpage en vagues (Phase B — 1 vague = 1 commit)

- **V1** — index.html inline (PIN + Profil + maintenance SW) — *le plus visible*.
- **V2** — utils + compass + interfaceConfig + main (UI quotidienne).
- **V3** — oomGuard + batteryGuard + emergencyMode (modales critiques crash/urgence).
- **V4** — planRegistry + proLicense + networkAudit + stats/profile + petits résidus.
- **V5** *(selon arbitrage)* — sessionReport + cas data-import.

Chaque clé ajoutée l'est dans **fr + en + es ensemble** (parité → même nombre partout). Clôture : re-run `find-hardcoded-fr.js` + `check-i18n.js` → ~0, corriger le statut « COMPLÈTE » des docs, bump.

---

# 📋 Inventaire détaillé par groupe


# Audit i18n — chaînes FR hardcodées dans `index.html` (scripts inline)

> Périmètre : **index.html uniquement**, scripts inline `<script>` qui construisent modales / boutons / toasts / alerts en JS sans passer par `window.I18n.t()`.
> HTML statique annoté `data-i18n` = ignoré (déjà traité). Commentaires / logs / données sérialisées / clés i18n = écartés.
> Détecteur : `node scripts/find-hardcoded-fr.js --full` (178 candidats sur index.html), trié manuellement.

Glossaire appliqué : code d'accès→access code/código de acceso · activer→enable/activar · modifier→change/cambiar · désactiver→disable/desactivar · supprimer→delete/eliminar · annuler→cancel/cancelar · valider→confirm/confirmar.

---

## 1. Flux PIN — config (préfixe `pin.setup.*`)

Le plus gros cluster. `_majPinStatusUI`, `_demanderPin`, `_lancerActivationPin`, `_lancerModificationPin`, `_lancerDesactivationPin`. Contient beaucoup de FR **sans accent** que le détecteur a raté (Annuler, Valider, Confirmer, Suivant, Désactiver, Code incorrect…).

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 4833 | Module PIN indisponible | label statut | `pin.setup.moduleUnavailable` | PIN module unavailable | Módulo PIN no disponible |
| 4844 | Code d'accès **activé** | label statut | `pin.setup.statusEnabled` | Access code **enabled** | Código de acceso **activado** |
| 4844 | · 🤳 biométrie configurée | label statut | `pin.setup.statusBioConfigured` | · 🤳 biometrics configured | · 🤳 biometría configurada |
| 4847 | ✏️ Modifier le code | bouton | `pin.setup.changeBtn` | ✏️ Change code | ✏️ Cambiar código |
| 4850 | 🔓 Désactiver | bouton | `pin.setup.disableBtn` | 🔓 Disable | 🔓 Desactivar |
| 4857 | Code d'accès **désactivé** | label statut | `pin.setup.statusDisabled` | Access code **disabled** | Código de acceso **desactivado** |
| 4860 | 🔐 Activer le code d'accès | bouton | `pin.setup.enableBtn` | 🔐 Enable access code | 🔐 Activar código de acceso |
| 4883 | Annuler | bouton | `pin.setup.cancel` | Cancel | Cancelar |
| 4884 | Valider | bouton (fallback label) | `pin.setup.validate` | Confirm | Confirmar |
| 4949 | Définir le code d'accès | titre modale | `pin.setup.defineTitle` | Set access code | Definir código de acceso |
| 4950-4951 | Choisis un code de **4 à 6 chiffres**. <br>**Note-le bien** : aucune récupération possible en cas d'oubli. | corps modale | `pin.setup.defineBody` | Choose a **4 to 6 digit** code. <br>**Write it down**: no recovery is possible if forgotten. | Elige un código de **4 a 6 dígitos**. <br>**Anótalo bien**: no hay recuperación posible si lo olvidas. |
| 4952 | Suivant | bouton | `pin.setup.next` | Next | Siguiente |
| 4957 | Le code doit faire 4 à 6 chiffres. | alert | `pin.setup.errLength` | The code must be 4 to 6 digits. | El código debe tener de 4 a 6 dígitos. |
| 4961 | Confirme ton code | titre modale | `pin.setup.confirmTitle` | Confirm your code | Confirma tu código |
| 4962 | Saisis ton code une seconde fois pour confirmer. | corps modale | `pin.setup.confirmBody` | Enter your code a second time to confirm. | Introduce tu código una segunda vez para confirmar. |
| 4963 | Confirmer | bouton | `pin.setup.confirm` | Confirm | Confirmar |
| 4967 | ❌ Les codes ne correspondent pas. Réessaie. | alert | `pin.setup.errMismatchRetry` | ❌ The codes don't match. Try again. | ❌ Los códigos no coinciden. Inténtalo de nuevo. |
| 4979 | Activer la biométrie ? | titre modale | `pin.setup.bioAskTitle` | Enable biometrics? | ¿Activar biometría? |
| 4980-4981 | 🤳 Veux-tu aussi activer **Face ID / Touch ID** ? <br><br>Le PIN reste actif en fallback si la biométrie échoue ou n'est pas disponible. | corps modale | `pin.setup.bioAskBody` | 🤳 Do you also want to enable **Face ID / Touch ID**? <br><br>The PIN stays active as a fallback if biometrics fail or are unavailable. | 🤳 ¿Quieres activar también **Face ID / Touch ID**? <br><br>El PIN sigue activo como respaldo si la biometría falla o no está disponible. |
| 4982 | Oui, activer | bouton | `pin.setup.bioYes` | Yes, enable | Sí, activar |
| 4982 | Non, PIN seul | bouton | `pin.setup.bioNo` | No, PIN only | No, solo PIN |
| 4992 | ✅ Code d'accès activé. | alert | `pin.setup.okEnabled` | ✅ Access code enabled. | ✅ Código de acceso activado. |
| 4992 | \n🤳 Biométrie configurée. | alert (suffixe) | `pin.setup.okBioConfigured` | \n🤳 Biometrics configured. | \n🤳 Biometría configurada. |
| 4996 | ✅ Code d'accès activé.\n⚠️ Biométrie échouée : | alert | `pin.setup.okEnabledBioFailed` | ✅ Access code enabled.\n⚠️ Biometrics failed: | ✅ Código de acceso activado.\n⚠️ Biometría fallida: |
| 4999 | ❌ Erreur lors de l'activation : | alert | `pin.setup.errEnable` | ❌ Error while enabling: | ❌ Error al activar: |
| 5019 | Modifier le code | titre modale | `pin.setup.changeTitle` | Change code | Cambiar código |
| 5020 | Saisis ton **code actuel** pour autoriser le changement. | corps modale | `pin.setup.changeOldBody` | Enter your **current code** to authorize the change. | Introduce tu **código actual** para autorizar el cambio. |
| 5021 | Vérifier | bouton | `pin.setup.verify` | Verify | Verificar |
| 5032 | ❌ Code incorrect. {n} tentative(s) restante(s). | alert | `pin.setup.errWrongCode` | ❌ Wrong code. {n} attempt(s) remaining. | ❌ Código incorrecto. {n} intento(s) restante(s). |
| 5039 | Nouveau code | titre modale | `pin.setup.newTitle` | New code | Nuevo código |
| 5040 | Choisis ton **nouveau code** de 4 à 6 chiffres. | corps modale | `pin.setup.newBody` | Choose your **new code** of 4 to 6 digits. | Elige tu **nuevo código** de 4 a 6 dígitos. |
| 5049 | Confirme le nouveau code | titre modale | `pin.setup.newConfirmTitle` | Confirm the new code | Confirma el nuevo código |
| 5050 | Saisis le nouveau code une seconde fois. | corps modale | `pin.setup.newConfirmBody` | Enter the new code a second time. | Introduce el nuevo código una segunda vez. |
| 5055 | ❌ Les codes ne correspondent pas. | alert | `pin.setup.errMismatch` | ❌ The codes don't match. | ❌ Los códigos no coinciden. |
| 5061 | ✅ Code d'accès modifié. | alert | `pin.setup.okChanged` | ✅ Access code changed. | ✅ Código de acceso cambiado. |
| 5064 | ❌ Erreur : | alert | `pin.setup.errGeneric` | ❌ Error: | ❌ Error: |
| 5074 | Désactiver le code d'accès ? | titre modale | `pin.setup.disableAskTitle` | Disable access code? | ¿Desactivar código de acceso? |
| 5075-5077 | L'app ne demandera plus de code au démarrage.<br><br>Si tu changes d'avis, tu pourras réactiver à tout moment depuis **⚙️ Configuration → 🔐 Code d'accès local**. | corps modale | `pin.setup.disableAskBody` | The app will no longer ask for a code at startup.<br><br>If you change your mind, you can re-enable it anytime from **⚙️ Settings → 🔐 Local access code**. | La app ya no pedirá código al iniciar.<br><br>Si cambias de idea, puedes reactivarlo en cualquier momento desde **⚙️ Configuración → 🔐 Código de acceso local**. |
| 5078 | Oui, désactiver | bouton | `pin.setup.disableYes` | Yes, disable | Sí, desactivar |
| 5078 | Non, garder | bouton | `pin.setup.disableNo` | No, keep it | No, mantener |
| 5092 | Désactiver le code | titre modale | `pin.setup.disableTitle` | Disable code | Desactivar código |
| 5093 | Saisis ton code pour confirmer la désactivation. | corps modale | `pin.setup.disableBody` | Enter your code to confirm disabling. | Introduce tu código para confirmar la desactivación. |
| 5094 | Désactiver | bouton | `pin.setup.disable` | Disable | Desactivar |
| 5099 | 🔓 Code d'accès désactivé. | alert | `pin.setup.okDisabled` | 🔓 Access code disabled. | 🔓 Código de acceso desactivado. |
| 5114 | 🔓 Code d'accès désactivé (validé par biométrie). | alert | `pin.setup.okDisabledBio` | 🔓 Access code disabled (verified by biometrics). | 🔓 Código de acceso desactivado (verificado por biometría). |

---

## 2. Verrou app — modales Lock (préfixe `home.lock.*`)

`_afficherLockNoPinInfo` (pas de PIN) + `_confirmLock` (confirmation verrouillage).

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 4395 | 🔒 Verrouiller MyKTAMap | titre modale | `home.lock.noPinTitle` | 🔒 Lock MyKTAMap | 🔒 Bloquear MyKTAMap |
| 4401-4402 | Aucun **code d'accès local** n'est configuré pour cette installation — il n'y a donc rien à verrouiller. | corps modale | `home.lock.noPinMsg` | No **local access code** is set for this installation — so there is nothing to lock. | No hay ningún **código de acceso local** configurado para esta instalación, así que no hay nada que bloquear. |
| 4405-4407 | Pour activer un code d'accès (PIN 4-6 chiffres + biométrie Face ID / Touch ID optionnelle), ouvre **⚙️ Configuration** → section **🔐 Code d'accès local**. | hint modale | `home.lock.noPinHint` | To set an access code (4-6 digit PIN + optional Face ID / Touch ID), open **⚙️ Settings** → **🔐 Local access code**. | Para configurar un código de acceso (PIN de 4-6 dígitos + Face ID / Touch ID opcional), abre **⚙️ Configuración** → **🔐 Código de acceso local**. |
| 4411 | Fermer | bouton | `home.lock.close` | Close | Cerrar |
| 4413 | ⚙️ Ouvrir Configuration | bouton | `home.lock.openConfig` | ⚙️ Open Settings | ⚙️ Abrir configuración |
| 4454 | 🔒 Verrouiller MyKTAMap ? | titre modale | `home.lock.confirmTitle` | 🔒 Lock MyKTAMap? | 🔒 ¿Bloquear MyKTAMap? |
| 4460-4463 | L'application va **stopper proprement** les modules actifs (tracker GPS, mode urgence, replay) puis **relancer** pour afficher la **gate PIN**. Tu devras saisir ton code d'accès pour reprendre. | corps modale | `home.lock.confirmMsg` | The app will **cleanly stop** active modules (GPS tracker, emergency mode, replay) then **restart** to show the **PIN gate**. You'll need to enter your access code to resume. | La app **detendrá limpiamente** los módulos activos (rastreador GPS, modo emergencia, replay) y luego **reiniciará** para mostrar la **pantalla de PIN**. Deberás introducir tu código de acceso para continuar. |
| 4466-4467 | Utile si tu prêtes ton téléphone, ou si tu veux protéger l'accès sans fermer l'onglet. | hint modale | `home.lock.confirmHint` | Useful if you lend your phone, or want to protect access without closing the tab. | Útil si prestas tu teléfono o quieres proteger el acceso sin cerrar la pestaña. |
| 4471 | Annuler | bouton | `home.lock.cancel` | Cancel | Cancelar |
| 4473 | 🔒 Verrouiller maintenant | bouton | `home.lock.confirmOk` | 🔒 Lock now | 🔒 Bloquear ahora |

---

## 3. Modale "Détails du profil" (préfixe `home.profile.*`)

`_ouvrirModaleProfilDetails` + `_confirmResetProfilModale` + handlers photo/surnom. Quasi-tout hardcodé (seul `home.splash.proEdition` L3212 passe déjà par I18n).

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 3153 | Module UserProfile non disponible. | alert | `home.profile.moduleUnavailable` | UserProfile module unavailable. | Módulo UserProfile no disponible. |
| 3164 | 👤 Mon profil | titre modale | `home.profile.title` | 👤 My profile | 👤 Mi perfil |
| 3165 | Fermer (aria-label) | aria-label | `home.profile.closeAria` | Close | Cerrar |
| 3172 | 📷 Photo | bouton | `home.profile.photoBtn` | 📷 Photo | 📷 Foto |
| 3173 | 🗑️ Retirer | bouton | `home.profile.photoRemove` | 🗑️ Remove | 🗑️ Quitar |
| 3177 | Surnom | label | `home.profile.nicknameLabel` | Nickname | Apodo |
| 3179 | Ex: Karma, Spéléo42, etc. | placeholder | `home.profile.nicknamePlaceholder` | E.g. Karma, Caver42, etc. | Ej: Karma, Espeleo42, etc. |
| 3181 | 💾 Enregistrer | bouton | `home.profile.saveName` | 💾 Save | 💾 Guardar |
| 3183 | Le surnom est local à cet appareil. Il sert juste à personnaliser ton accueil et à signer tes exports de profil. | hint | `home.profile.nicknameHint` | The nickname is local to this device. It only personalizes your home screen and signs your profile exports. | El apodo es local a este dispositivo. Solo personaliza tu inicio y firma tus exportaciones de perfil. |
| 3188 | ⏳ Calcul des stats… | loading | `home.profile.statsLoading` | ⏳ Computing stats… | ⏳ Calculando estadísticas… |
| 3197 | 🎨 Stats du bandeau d'accueil | header section | `home.profile.barStatsHeader` | 🎨 Home banner stats | 🎨 Estadísticas del panel de inicio |
| 3199 | Choisis 1 à 3 stats à afficher dans l'en-tête du loader. Cap mobile pour rester compact. | hint | `home.profile.barStatsHint` | Choose 1 to 3 stats to show in the loader header. Mobile cap to stay compact. | Elige de 1 a 3 estadísticas para mostrar en la cabecera. Límite móvil para mantenerlo compacto. |
| 3202 | ⏱️ Temps total | label checkbox | `home.profile.statTime` | ⏱️ Total time | ⏱️ Tiempo total |
| 3203 | 💾 Sauvegarde | label checkbox | `home.profile.statStorage` | 💾 Storage | 💾 Almacenamiento |
| 3204 | 🗺️ Plans visités | label checkbox | `home.profile.statPlans` | 🗺️ Plans visited | 🗺️ Planos visitados |
| 3221 | 📤 Exporter mon profil | bouton | `home.profile.exportBtn` | 📤 Export my profile | 📤 Exportar mi perfil |
| 3222 | 📥 Importer un profil | bouton | `home.profile.importBtn` | 📥 Import a profile | 📥 Importar un perfil |
| 3223 | 🗑️ Réinitialiser le profil | bouton | `home.profile.resetBtn` | 🗑️ Reset profile | 🗑️ Restablecer perfil |
| 3227-3229 | L'export inclut **tout** (registre des plans, préférences, favoris, sessions, snapshots, identité…). Le PIN/Face ID et le code communautaire ne sont jamais exportés (sécurité). Les ZIPs binaires des plans non plus (trop lourd). | hint footer | `home.profile.exportFooterHint` | The export includes **everything** (plan registry, preferences, favorites, sessions, snapshots, identity…). The PIN/Face ID and community code are never exported (security). Neither are plan ZIP binaries (too heavy). | La exportación incluye **todo** (registro de planos, preferencias, favoritos, sesiones, instantáneas, identidad…). El PIN/Face ID y el código comunitario nunca se exportan (seguridad). Tampoco los ZIP binarios de los planos (demasiado pesados). |
| 3273 | ⚠️ Max {n} stats dans le bandeau | toast | `home.profile.barStatsMax` | ⚠️ Max {n} stats in the banner | ⚠️ Máx {n} estadísticas en el panel |
| 3281 | ⚠️ Au moins 1 stat requise | toast | `home.profile.barStatsMin` | ⚠️ At least 1 stat required | ⚠️ Se requiere al menos 1 estadística |
| 3304 | ⏳ (label busy save) | bouton busy | `home.profile.saveBusy` | ⏳ | ⏳ |
| 3312 | 💾 Enregistrer (reset label) | bouton | `home.profile.saveName` (réutilise) | 💾 Save | 💾 Guardar |
| 3315 | Échec : | alert | `home.profile.errGeneric` | Failed: | Error: |
| 3334 | ⏳ Compression… | bouton busy | `home.profile.photoCompressing` | ⏳ Compressing… | ⏳ Comprimiendo… |
| 3340 | 🔄 Changer la photo | bouton | `home.profile.photoChange` | 🔄 Change photo | 🔄 Cambiar foto |
| 3342 | Échec upload photo : | alert | `home.profile.errPhotoUpload` | Photo upload failed: | Error al subir la foto: |
| 3349 | Retirer la photo de profil ? | confirm() | `home.profile.confirmRemovePhoto` | Remove profile photo? | ¿Quitar la foto de perfil? |
| 3365 | Module ProfileExportImport indisponible. | alert | `home.profile.errExportModule` | ProfileExportImport module unavailable. | Módulo ProfileExportImport no disponible. |
| 3411 | 🗑️ Réinitialiser le profil ? | titre modale | `home.profile.resetTitle` | 🗑️ Reset profile? | 🗑️ ¿Restablecer perfil? |
| 3412 | Annuler (aria-label) | aria-label | `home.profile.cancel` | Cancel | Cancelar |
| 3416 | Cette action va effacer **uniquement ton identité** sur cet appareil : | corps modale | `home.profile.resetBody` | This will erase **only your identity** on this device: | Esta acción borrará **solo tu identidad** en este dispositivo: |
| 3419 | Ton **surnom** | item liste | `home.profile.resetItemNickname` | Your **nickname** | Tu **apodo** |
| 3420 | Ta **photo de profil** | item liste | `home.profile.resetItemPhoto` | Your **profile photo** | Tu **foto de perfil** |
| 3423-3424 | **✅ Ne sont PAS touchés :** tes plans, sessions actives, favoris, snapshots, photos POI, préférences. | corps modale | `home.profile.resetKept` | **✅ NOT affected:** your plans, active sessions, favorites, snapshots, POI photos, preferences. | **✅ NO se tocan:** tus planos, sesiones activas, favoritos, instantáneas, fotos POI, preferencias. |
| 3427 | Tu peux refaire un profil tout de suite après (surnom + photo). | hint | `home.profile.resetAfterHint` | You can create a new profile right after (nickname + photo). | Puedes crear un perfil de nuevo justo después (apodo + foto). |
| 3431 | Annuler | bouton | `home.profile.cancel` (réutilise) | Cancel | Cancelar |
| 3432 | 🗑️ Réinitialiser | bouton | `home.profile.resetConfirm` | 🗑️ Reset | 🗑️ Restablecer |

---

## 4. Section "💼 Édition pro" (préfixe `home.profile.pro.*`)

`_proSourceLabel` / `_proSourceHint` / `_refreshProfileProSection` / `_bindProfileProHandlers`.

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 3513 | Serveur (instance pro déployée) | label | `home.profile.pro.sourceServer` | Server (deployed pro instance) | Servidor (instancia pro desplegada) |
| 3514 | Licence importée sur cet appareil | label | `home.profile.pro.sourceLocal` | License imported on this device | Licencia importada en este dispositivo |
| 3519 | Cette instance est servie en mode pro par son administrateur. Aucune action requise. | hint | `home.profile.pro.hintServer` | This instance is served in pro mode by its administrator. No action required. | Esta instancia es servida en modo pro por su administrador. No se requiere acción. |
| 3522-3523 | Mode pro activé pour CE navigateur uniquement, via une licence importée par toi. Retire-la si tu veux revenir au mode communautaire. | hint | `home.profile.pro.hintLocal` | Pro mode enabled for THIS browser only, via a license you imported. Remove it to return to community mode. | Modo pro activado solo para ESTE navegador, mediante una licencia que importaste. Quítala para volver al modo comunitario. |
| 3525-3526 | Mode communautaire actuel. Si tu as reçu une licence pro (fichier `Licence-pro.json`), importe-la ici pour activer l'édition pro sur cet appareil. | hint | `home.profile.pro.hintCommunity` | Currently in community mode. If you received a pro license (`Licence-pro.json` file), import it here to enable pro edition on this device. | Actualmente en modo comunitario. Si recibiste una licencia pro (archivo `Licence-pro.json`), impórtala aquí para activar la edición pro en este dispositivo. |
| 3534 | Module pro license indisponible. | erreur | `home.profile.pro.moduleUnavailable` | Pro license module unavailable. | Módulo de licencia pro no disponible. |
| 3551 | ✓ Édition pro active | badge | `home.profile.pro.badgeActive` | ✓ Pro edition active | ✓ Edición pro activa |
| 3557 | 🗑️ Retirer la licence locale | bouton | `home.profile.pro.removeLocalBtn` | 🗑️ Remove local license | 🗑️ Quitar licencia local |
| 3564 | 📂 Importer une licence pro | bouton | `home.profile.pro.importBtn` | 📂 Import a pro license | 📂 Importar una licencia pro |
| 3591-3593 | Retirer la licence pro locale ?\n\nL'application reviendra en mode communautaire sur cet appareil. Tu pourras la re-importer plus tard tant que tu gardes le fichier Licence-pro.json reçu. | confirm() | `home.profile.pro.confirmRemove` | Remove the local pro license?\n\nThe app will return to community mode on this device. You can re-import it later as long as you keep the Licence-pro.json file you received. | ¿Quitar la licencia pro local?\n\nLa app volverá al modo comunitario en este dispositivo. Podrás reimportarla más tarde mientras conserves el archivo Licence-pro.json recibido. |
| 3599 | Licence pro locale retirée | toast | `home.profile.pro.removedToast` | Local pro license removed | Licencia pro local quitada |
| 3612 | ✓ Licence pro importée — édition pro activée sur cet appareil | toast | `home.profile.pro.importedToast` | ✓ Pro license imported — pro edition enabled on this device | ✓ Licencia pro importada — edición pro activada en este dispositivo |
| 3615 | Erreur inconnue. | erreur fallback | `home.profile.pro.errUnknown` | Unknown error. | Error desconocido. |
| 3616 | Import refusé : | alert | `home.profile.pro.importRejected` | Import refused: | Importación rechazada: |

---

## 5. Stats profil — bandeau & table (préfixe `home.profile.stats.*`)

`PROFILE_BAR_STATS` (titres tooltip) + `_refreshProfileDetailsStats` (cellules + table "Mes plans").

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 2874 | Temps total passé sur l'app (toutes sessions cumulées) | title | `home.profile.stats.timeTitle` | Total time spent in the app (all sessions combined) | Tiempo total en la app (todas las sesiones acumuladas) |
| 2878 | Taille réelle de TES données MyKTAMap stockées localement : localStorage (préférences, sessions, favoris) + IndexedDB (plans mémorisés, photos POI, snapshots, profil, crashes). N'inclut PAS le Cache PWA volatile. | title | `home.profile.stats.storageTitle` | Actual size of YOUR MyKTAMap data stored locally: localStorage (preferences, sessions, favorites) + IndexedDB (saved plans, POI photos, snapshots, profile, crashes). Does NOT include the volatile PWA cache. | Tamaño real de TUS datos de MyKTAMap almacenados localmente: localStorage (preferencias, sesiones, favoritos) + IndexedDB (planos guardados, fotos POI, instantáneas, perfil, fallos). NO incluye la caché PWA volátil. |
| 2882 | Nombre de plans dans ton registre MyKTAMap (visités au moins une fois) | title | `home.profile.stats.plansTitle` | Number of plans in your MyKTAMap registry (visited at least once) | Número de planos en tu registro de MyKTAMap (visitados al menos una vez) |
| 3700 | 💾 sessions | label | `home.profile.stats.lblSessions` | 💾 sessions | 💾 sesiones |
| 3701 | ⭐ favoris | label | `home.profile.stats.lblFavorites` | ⭐ favorites | ⭐ favoritos |
| 3702 | 📦 snapshots | label | `home.profile.stats.lblSnapshots` | 📦 snapshots | 📦 instantáneas |
| 3703 | 📸 photos POI | label | `home.profile.stats.lblPhotos` | 📸 POI photos | 📸 fotos POI |
| 3704 | Taille totale réelle des données MyKTAMap (localStorage + IndexedDB, hors Cache PWA volatile) | title | `home.profile.stats.totalTitle` | Actual total size of MyKTAMap data (localStorage + IndexedDB, excluding volatile PWA cache) | Tamaño total real de los datos de MyKTAMap (localStorage + IndexedDB, sin la caché PWA volátil) |
| 3704 | 💾 sauvegarde | label | `home.profile.stats.lblStorage` | 💾 storage | 💾 almacenamiento |
| 3715 | 📊 Mes plans — préparation… | header | `home.profile.stats.plansHeaderLoading` | 📊 My plans — preparing… | 📊 Mis planos — preparando… |
| 3721 | Plan | th | `home.profile.stats.thPlan` | Plan | Plano |
| 3722 | Points d'intérêt ajoutés à la session de ce plan | title th | `home.profile.stats.thPoisTitle` | Points of interest added to this plan's session | Puntos de interés añadidos a la sesión de este plano |
| 3723 | Tracés (Principal / Secondaire / Chemin / Jonction) | title th | `home.profile.stats.thRoadsTitle` | Tracks (Main / Secondary / Path / Junction) | Trazados (Principal / Secundario / Camino / Unión) |
| 3724 | Distance totale des tracés (en m/km si plan calibré, sinon pixels image) | title th | `home.profile.stats.thDistTitle` | Total track distance (in m/km if plan calibrated, otherwise image pixels) | Distancia total de los trazados (en m/km si el plano está calibrado, si no en píxeles de imagen) |
| 3732-3734 | Calcul séquentiel pour éviter de saturer la mémoire sur mobile. Les distances sont en pixels image (universelles) — pour le plan courant, la valeur s'affiche aussi en m/km si calibré. | note | `home.profile.stats.plansNote` | Sequential calculation to avoid saturating memory on mobile. Distances are in image pixels (universal) — for the current plan, the value also shows in m/km if calibrated. | Cálculo secuencial para evitar saturar la memoria en móvil. Las distancias están en píxeles de imagen (universales); para el plano actual, el valor también se muestra en m/km si está calibrado. |
| 3896 | 📊 Mes plans — aucun plan enregistré | header | `home.profile.stats.plansHeaderEmpty` | 📊 My plans — no plan saved | 📊 Mis planos — ningún plano guardado |

---

## 6. Registre des plans — liste, badges, infos (préfixe `home.plans.*`)

`planRowHTML` (badges déjà via `_homeT` — OK), mais **titres des boutons d'action** + empty-state + modale infos hardcodés. Note : les labels modes/storage (L1881-1902, 2095-2102, 2511-2514) sont des **valeurs de modale infos / discordance** — réutiliser les clés `home.plans.mode.*` / `home.plans.badge.*` déjà définies pour `_homeT`.

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 1921 | Informations détaillées sur cette archive | title bouton | `home.plans.infoBtnTitle` | Detailed information about this archive | Información detallada sobre este archivo |
| 1922 | Charger ce plan | title bouton | `home.plans.loadBtnTitle` | Load this plan | Cargar este plano |
| 1923 | Retirer de la liste | title bouton | `home.plans.removeBtnTitle` | Remove from list | Quitar de la lista |
| 2215 | Aucun plan local — coche *Afficher les plans serveur* pour voir les plans découverts. | empty-state | `home.plans.emptyLocal` | No local plan — check *Show server plans* to see discovered plans. | Ningún plano local — marca *Mostrar planos del servidor* para ver los planos descubiertos. |
| 2237 | Retirer ce plan de votre liste ? | confirm() | `home.plans.confirmRemove` | Remove this plan from your list? | ¿Quitar este plano de tu lista? |
| 2090 | 🌐 Plan serveur (data/) | label type | `home.plans.info.typeServer` | 🌐 Server plan (data/) | 🌐 Plano de servidor (data/) |
| 2091 | 💾 Plan local (ZIP) | label type | `home.plans.info.typeLocal` | 💾 Local plan (ZIP) | 💾 Plano local (ZIP) |
| 2095 | ✅ Mémorisé dans l'app (IndexedDB) | label | `home.plans.info.storedBlob` | ✅ Saved in the app (IndexedDB) | ✅ Guardado en la app (IndexedDB) |
| 2096 | 🔐 Accès permanent autorisé (File System Access API) | label | `home.plans.info.storedFs` | 🔐 Permanent access granted (File System Access API) | 🔐 Acceso permanente concedido (File System Access API) |
| 2097 | 📁 Re-sélection requise au chargement (pick) | label | `home.plans.info.storedPick` | 📁 Re-selection required on load (pick) | 📁 Reselección requerida al cargar (pick) |
| 2100 | V2 tuilé (Google Maps-like) | label mode | `home.plans.info.modeV2` | V2 tiled (Google Maps-like) | V2 en mosaico (estilo Google Maps) |
| 2101 | Multi-niveau (carrière multi-étages) | label mode | `home.plans.info.modeMlvl` | Multi-level (multi-floor quarry) | Multinivel (cantera de varios pisos) |
| 2102 | V1 classique (mono-niveau, image entière en RAM) | label mode | `home.plans.info.modeV1` | V1 classic (single-level, full image in RAM) | V1 clásico (un solo nivel, imagen entera en RAM) |
| 2111 | Identifiant interne | key table | `home.plans.info.keyId` | Internal ID | Identificador interno |
| 2112 | Nom | key table | `home.plans.info.keyName` | Name | Nombre |
| 2113 | Version | key table | `home.plans.info.keyVersion` | Version | Versión |
| 2114 | Auteur | key table | `home.plans.info.keyAuthor` | Author | Autor |
| 2115 | Type | key table | `home.plans.info.keyType` | Type | Tipo |
| 2117 | Chemin serveur | key table | `home.plans.info.keyServerPath` | Server path | Ruta del servidor |
| 2119 | Fichier source | key table | `home.plans.info.keySourceFile` | Source file | Archivo de origen |
| 2120 | Taille | key table | `home.plans.info.keySize` | Size | Tamaño |
| 2121 | Persistance | key table | `home.plans.info.keyPersistence` | Persistence | Persistencia |
| 2123 | Mode | key table | `home.plans.info.keyMode` | Mode | Modo |
| 2125 | Préset performance | key table | `home.plans.info.keyPreset` | Performance preset | Ajuste de rendimiento |
| 2127 | Ajouté le | key table | `home.plans.info.keyAddedAt` | Added on | Añadido el |
| 2128 | Dernière ouverture | key table | `home.plans.info.keyLastOpened` | Last opened | Última apertura |
| 2128 | Jamais ouvert (découvert) | valeur | `home.plans.info.neverOpened` | Never opened (discovered) | Nunca abierto (descubierto) |
| 2090 (fmtSize) | Mo / Ko | unités | `home.plans.unitMb` / `home.plans.unitKb` | MB / KB | MB / KB |

---

## 7. Modale "ZIP refusé — Nom différent" (préfixe `home.plans.nameKO.*`)

`_afficherModaleNomZipKO`.

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 1973 | 🚫 ZIP refusé — Nom différent | titre modale | `home.plans.nameKO.title` | 🚫 ZIP refused — Different name | 🚫 ZIP rechazado — Nombre diferente |
| 1978 | Le ZIP que vous avez sélectionné contient un plan dont le nom ne correspond pas à celui sur lequel vous avez cliqué : | corps modale | `home.plans.nameKO.body` | The ZIP you selected contains a plan whose name doesn't match the one you clicked on: | El ZIP que seleccionaste contiene un plano cuyo nombre no coincide con el que pulsaste: |
| 1981 | Plan ciblé : | label | `home.plans.nameKO.targetLabel` | Target plan: | Plano objetivo: |
| 1983 | ZIP fourni : | label | `home.plans.nameKO.providedLabel` | Provided ZIP: | ZIP proporcionado: |
| 1987-1989 | Pour éviter toute incohérence (badges, sessions, métadonnées), l'import est refusé. Si vous souhaitez vraiment charger ce plan, importez-le via le bouton 📦 Charger un nouveau plan (il sera ajouté comme entrée distincte avec son propre nom). | hint | `home.plans.nameKO.hint` | To avoid any inconsistency (badges, sessions, metadata), the import is refused. If you really want to load this plan, import it via the 📦 Load a new plan button (it will be added as a separate entry with its own name). | Para evitar cualquier incoherencia (insignias, sesiones, metadatos), la importación se rechaza. Si realmente quieres cargar este plano, impórtalo con el botón 📦 Cargar un nuevo plano (se añadirá como entrada distinta con su propio nombre). |
| 1992 | J'ai compris | bouton | `home.plans.nameKO.ok` | Got it | Entendido |

---

## 8. Modale "Mode différent détecté" (préfixe `home.plans.modeWarn.*`)

`_afficherModaleModeDifferent`. Les valeurs `d.avant`/`d.apres` (L2511-2514) réutilisent `home.plans.info.modeV2/modeMlvl/modeV1` + labels mono/multi ci-dessous.

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 2027 | Mode mémorisé : | label | `home.plans.modeWarn.savedLabel` | Saved mode: | Modo guardado: |
| 2028 | Mode du ZIP : | label | `home.plans.modeWarn.zipLabel` | ZIP mode: | Modo del ZIP: |
| 2039 | ⚠️ Mode différent détecté | titre modale | `home.plans.modeWarn.title` | ⚠️ Different mode detected | ⚠️ Modo diferente detectado |
| 2044-2045 | Le plan **« {nom} »** était mémorisé dans un mode, mais le ZIP que vous venez de fournir est dans un autre mode : | corps modale | `home.plans.modeWarn.body` | The plan **"{name}"** was saved in one mode, but the ZIP you just provided is in another mode: | El plano **«{name}»** estaba guardado en un modo, pero el ZIP que acabas de proporcionar está en otro modo: |
| 2049-2050 | 👉 Si vous continuez, les badges de ce plan dans la liste seront mis à jour pour refléter le nouveau mode (le contenu du ZIP fait foi). | hint | `home.plans.modeWarn.hint` | 👉 If you continue, this plan's badges in the list will update to reflect the new mode (the ZIP content prevails). | 👉 Si continúas, las insignias de este plano se actualizarán para reflejar el nuevo modo (el contenido del ZIP prevalece). |
| 2053 | Annuler | bouton | `home.plans.modeWarn.cancel` | Cancel | Cancelar |
| 2054 | Continuer | bouton | `home.plans.modeWarn.continue` | Continue | Continuar |
| 2513-2514 | Mono-niveau (classique) | valeur mode | `home.plans.info.modeMono` | Single-level (classic) | Un solo nivel (clásico) |

---

## 9. Modale "Plan introuvable" (préfixe `home.plans.notFound.*`)

`afficherModalePlanIntrouvable`.

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 2354 | ⚠️ Plan introuvable | titre | `home.plans.notFound.titleDefault` | ⚠️ Plan not found | ⚠️ Plano no encontrado |
| 2360 | ⚠️ Plan serveur introuvable | titre | `home.plans.notFound.titleServer` | ⚠️ Server plan not found | ⚠️ Plano de servidor no encontrado |
| 2361-2363 | Le plan **{nom}** n'a pas été trouvé sur le serveur (chemin `{path}`). Causes possibles : le plan a été déplacé, renommé, supprimé, ou le serveur est temporairement indisponible. | corps | `home.plans.notFound.bodyServer` | The plan **{name}** was not found on the server (path `{path}`). Possible causes: the plan was moved, renamed, deleted, or the server is temporarily unavailable. | El plano **{name}** no se encontró en el servidor (ruta `{path}`). Causas posibles: el plano fue movido, renombrado, eliminado, o el servidor no está disponible temporalmente. |
| 2366 | ⚠️ Données du plan introuvables | titre | `home.plans.notFound.titleBlob` | ⚠️ Plan data not found | ⚠️ Datos del plano no encontrados |
| 2367-2375 | Le plan **{nom}** était mémorisé localement dans le navigateur, mais ses données ont disparu. Causes possibles : (Vidage du cache navigateur / Import d'une liste de plans depuis un autre appareil / Réinstallation de l'application / Quota de stockage atteint et purge automatique) | corps + liste | `home.plans.notFound.bodyBlob` | The plan **{name}** was saved locally in the browser, but its data disappeared. Possible causes: (Browser cache cleared / Plan list imported from another device / App reinstalled / Storage quota reached and auto-purged) | El plano **{name}** estaba guardado localmente en el navegador, pero sus datos desaparecieron. Causas posibles: (Caché del navegador borrada / Lista de planos importada desde otro dispositivo / App reinstalada / Cuota de almacenamiento alcanzada y purga automática) |
| 2378 | ⚠️ Accès au fichier perdu | titre | `home.plans.notFound.titleFs` | ⚠️ File access lost | ⚠️ Acceso al archivo perdido |
| 2379-2382 | Le plan **{nom}** avait un accès permanent configuré, mais celui-ci n'est plus valide. Causes possibles : le ZIP a été déplacé/supprimé sur votre disque, ou les autorisations du navigateur ont été révoquées (vidage de cache, autre profil, autre navigateur). | corps | `home.plans.notFound.bodyFs` | The plan **{name}** had permanent access configured, but it is no longer valid. Possible causes: the ZIP was moved/deleted on your disk, or the browser permissions were revoked (cache cleared, different profile, different browser). | El plano **{name}** tenía acceso permanente configurado, pero ya no es válido. Causas posibles: el ZIP fue movido/eliminado en tu disco, o los permisos del navegador fueron revocados (caché borrada, otro perfil, otro navegador). |
| 2385 | ⚠️ Permission refusée | titre | `home.plans.notFound.titleDenied` | ⚠️ Permission denied | ⚠️ Permiso denegado |
| 2386-2388 | Le navigateur a refusé l'accès au fichier ZIP du plan **{nom}**. Vous pouvez re-sélectionner le ZIP manuellement pour autoriser à nouveau l'accès. | corps | `home.plans.notFound.bodyDenied` | The browser denied access to the ZIP file of plan **{name}**. You can manually re-select the ZIP to grant access again. | El navegador denegó el acceso al archivo ZIP del plano **{name}**. Puedes volver a seleccionar el ZIP manualmente para autorizar el acceso de nuevo. |
| 2405 | Que souhaitez-vous faire ? | corps | `home.plans.notFound.prompt` | What would you like to do? | ¿Qué quieres hacer? |
| 2407 | 🔄 Réessayer | bouton | `home.plans.notFound.retry` | 🔄 Retry | 🔄 Reintentar |
| 2408 | 📁 Re-sélectionner le ZIP | bouton | `home.plans.notFound.reselect` | 📁 Re-select the ZIP | 📁 Volver a seleccionar el ZIP |
| 2409 | 🗑️ Retirer de la liste | bouton | `home.plans.notFound.remove` | 🗑️ Remove from list | 🗑️ Quitar de la lista |
| 2410 | Annuler | bouton | `home.plans.notFound.cancel` | Cancel | Cancelar |
| 2434 | Plan retiré de la liste | toast/status | `home.plans.removedStatus` | Plan removed from list | Plano quitado de la lista |

---

## 10. Loader — chargement ZIP : overlay, status, erreurs (préfixe `home.loader.*`)

Overlay de chargement + messages `setStatus()` + erreurs d'extraction.

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 1427 | Chargement du plan… | titre overlay | `home.loader.loadingTitle` | Loading plan… | Cargando plano… |
| 1429 | Ne ferme pas l'onglet. Pour les plans tuilés V2 ou les plans très détaillés, ça peut prendre plusieurs secondes. | hint overlay | `home.loader.loadingHint` | Don't close the tab. For V2 tiled plans or very detailed plans, this may take several seconds. | No cierres la pestaña. Para planos en mosaico V2 o muy detallados, puede tardar varios segundos. |
| 1434 | Initialisation… | message overlay | `home.loader.initializing` | Initializing… | Inicializando… |
| 1458 | JSZip non chargé. Vérifiez lib/jszip.min.js | throw/erreur | `home.loader.errJszip` | JSZip not loaded. Check lib/jszip.min.js | JSZip no cargado. Verifica lib/jszip.min.js |
| 1691 | 🔐 {fichier} (accès persistant) | label fichier | `home.loader.persistentAccess` | 🔐 {file} (persistent access) | 🔐 {file} (acceso persistente) |
| 1693 | ZIP sélectionné. Clique sur « Charger » pour continuer. | status | `home.loader.zipSelected` | ZIP selected. Click "Load" to continue. | ZIP seleccionado. Pulsa «Cargar» para continuar. |
| 1696 | Erreur de sélection : | status erreur | `home.loader.errSelection` | Selection error: | Error de selección: |
| 1722 | ⛔ Plan révoqué par l'auteur. | status erreur | `home.loader.planRevoked` | ⛔ Plan revoked by the author. | ⛔ Plano revocado por el autor. |
| 1747 | Extraction du ZIP en cours… | overlay/status | `home.loader.extracting` | Extracting ZIP… | Extrayendo ZIP… |
| 1748 | Extraction en cours… | status | `home.loader.extractingShort` | Extracting… | Extrayendo… |
| 1763 / 1777 | Étape « {step} » : | erreur préfixe | `home.loader.errStep` | Step "{step}": | Paso «{step}»: |
| 1766 | ZIP extrait — Chargement de la carte… | overlay | `home.loader.mapLoading` | ZIP extracted — Loading map… | ZIP extraído — Cargando el mapa… |
| 1767 | Chargement en cours… | status | `home.loader.loadingShort` | Loading… | Cargando… |
| 1780 | Plan chargé avec succès. | status | `home.loader.loadedOk` | Plan loaded successfully. | Plano cargado correctamente. |
| 1797 | Sélectionne d'abord une archive .zip | status erreur | `home.loader.selectZipFirst` | Select a .zip archive first | Selecciona primero un archivo .zip |
| 1823 / 1825 | Erreur inconnue / Erreur : | status erreur | `home.loader.errUnknown` / `home.loader.errPrefix` | Unknown error / Error: | Error desconocido / Error: |
| 1840 | Le générateur n'est pas disponible | status erreur | `home.loader.generatorUnavailable` | The generator is unavailable | El generador no está disponible |
| 2585 | Liste exportée (mode legacy — module ProfileExportImport non chargé) | status | `home.loader.listExportedLegacy` | List exported (legacy mode — ProfileExportImport module not loaded) | Lista exportada (modo legado — módulo ProfileExportImport no cargado) |
| 2677 | Erreur ouverture import : | status erreur | `home.loader.errImportOpen` | Import open error: | Error al abrir la importación: |
| 2684 | Erreur : | status erreur | `home.loader.errPrefix` (réutilise) | Error: | Error: |
| 2689 | Liste remplacée — {n} plan(s) | status | `home.loader.listReplaced` | List replaced — {n} plan(s) | Lista reemplazada — {n} plano(s) |
| 2690 | Liste fusionnée — {n} nouveau(x), {m} ignoré(s) | status | `home.loader.listMerged` | List merged — {n} new, {m} ignored | Lista fusionada — {n} nuevo(s), {m} ignorado(s) |
| 2692 | Erreur : | status erreur | `home.loader.errPrefix` (réutilise) | Error: | Error: |

---

## 11. Toggle plans serveur (préfixe `home.serverPlans.*`)

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 2635 | 🚫 Plans serveur masqués. Reload requis pour skip l'auto-discovery au boot. | toast | `home.serverPlans.hiddenToast` | 🚫 Server plans hidden. Reload required to skip auto-discovery at boot. | 🚫 Planos del servidor ocultos. Se requiere recargar para omitir el autodescubrimiento al iniciar. |
| 2636 | ✅ Plans serveur réactivés. Reload requis pour ré-importer la liste serveur. | toast | `home.serverPlans.shownToast` | ✅ Server plans re-enabled. Reload required to re-import the server list. | ✅ Planos del servidor reactivados. Se requiere recargar para reimportar la lista del servidor. |

---

## 12. Modale "Forcer la mise à jour" (préfixe `home.maint.forceUpdate.*`)

`_afficherConfirmForceUpdate`.

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 5627 | 🔄 Forcer la mise à jour ? | titre modale | `home.maint.forceUpdate.title` | 🔄 Force update? | 🔄 ¿Forzar la actualización? |
| 5632-5634 | Cette action va **purger le cache des assets** (HTML, JS, CSS, icônes) et **recharger l'application** pour télécharger la dernière version depuis le serveur. | corps | `home.maint.forceUpdate.body` | This will **purge the asset cache** (HTML, JS, CSS, icons) and **reload the app** to download the latest version from the server. | Esta acción **purgará la caché de recursos** (HTML, JS, CSS, iconos) y **recargará la app** para descargar la última versión del servidor. |
| 5637 | ✅ Préservé | sous-titre | `home.maint.forceUpdate.kept` | ✅ Preserved | ✅ Preservado |
| 5639 / 5714 | Tes plans mémorisés | item | `home.maint.keptPlans` | Your saved plans | Tus planos guardados |
| 5640 / 5715 | Sessions auto-save | item | `home.maint.keptSessions` | Auto-saved sessions | Sesiones auto-guardadas |
| 5641 / 5716 | Préférences (perf, debug, etc.) | item | `home.maint.keptPrefs` | Preferences (perf, debug, etc.) | Preferencias (rendimiento, depuración, etc.) |
| 5642 / 5717 | Code d'accès communautaire | item | `home.maint.keptCode` | Community access code | Código de acceso comunitario |
| 5646 | ⚠️ Conditions | sous-titre | `home.maint.forceUpdate.conditions` | ⚠️ Conditions | ⚠️ Condiciones |
| 5648 | **Connexion Internet active** (vérifiée juste après) | item | `home.maint.forceUpdate.condInternet` | **Active Internet connection** (checked right after) | **Conexión a Internet activa** (verificada justo después) |
| 5649 | Reload immédiat — ferme bien tes onglets / sessions sensibles avant | item | `home.maint.forceUpdate.condReload` | Immediate reload — close your sensitive tabs / sessions first | Recarga inmediata — cierra antes tus pestañas / sesiones sensibles |
| 5653-5654 | Si tu n'es pas sûr de la nécessité : pas grave, tu peux annuler. L'app reste utilisable sur sa version actuelle. | hint | `home.maint.forceUpdate.hint` | If you're not sure it's needed: no problem, you can cancel. The app stays usable on its current version. | Si no estás seguro de que sea necesario: no pasa nada, puedes cancelar. La app sigue funcionando en su versión actual. |
| 5658 | Annuler | bouton | `home.maint.cancel` | Cancel | Cancelar |
| 5659 | 🔄 Continuer | bouton | `home.maint.forceUpdate.continue` | 🔄 Continue | 🔄 Continuar |

---

## 13. Modale "Désinscrire le Service Worker" (Kill SW) (préfixe `home.maint.killSw.*`)

`_afficherConfirmKillSw` + `_afficherKillSwOfflineRefus`.

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 5702 | 🆘 Désinscrire le Service Worker ? | titre modale | `home.maint.killSw.title` | 🆘 Unregister the Service Worker? | 🆘 ¿Anular el registro del Service Worker? |
| 5707-5709 | Tu vas ouvrir la page `killsw.html` qui **désinscrit le Service Worker** et **purge les caches PWA**. Au prochain chargement, un SW tout neuf prend le relais avec la dernière version du serveur. | corps | `home.maint.killSw.body` | You're about to open the `killsw.html` page which **unregisters the Service Worker** and **purges the PWA caches**. On next load, a brand-new SW takes over with the latest server version. | Vas a abrir la página `killsw.html` que **anula el registro del Service Worker** y **purga las cachés PWA**. En la próxima carga, un SW nuevo toma el relevo con la última versión del servidor. |
| 5712 | ✅ Préservé (données utilisateur) | sous-titre | `home.maint.killSw.kept` | ✅ Preserved (user data) | ✅ Preservado (datos de usuario) |
| 5718 | Photos / annotations | item | `home.maint.killSw.keptPhotos` | Photos / annotations | Fotos / anotaciones |
| 5722 | ⚠️ Effets | sous-titre | `home.maint.killSw.effects` | ⚠️ Effects | ⚠️ Efectos |
| 5724 | **Re-download complet** des assets au prochain boot (HTML/JS/CSS/icônes) | item | `home.maint.killSw.effectRedownload` | **Full re-download** of assets on next boot (HTML/JS/CSS/icons) | **Re-descarga completa** de los recursos en el próximo arranque (HTML/JS/CSS/iconos) |
| 5725 | Nécessite une **connexion Internet** au retour sur l'app | item | `home.maint.killSw.effectInternet` | Requires an **Internet connection** when returning to the app | Requiere una **conexión a Internet** al volver a la app |
| 5726 | Mode hors-ligne indisponible jusqu'au prochain boot complet | item | `home.maint.killSw.effectOffline` | Offline mode unavailable until the next full boot | Modo sin conexión no disponible hasta el próximo arranque completo |
| 5730-5731 | À utiliser si la **mise à jour douce** n'a pas suffi (badge footer reste sur « ancienne → nouvelle » après reload). Moins destructif que le Reset complet. | hint | `home.maint.killSw.hint` | Use this if the **soft update** wasn't enough (footer badge stays on "old → new" after reload). Less destructive than a full Reset. | Úsalo si la **actualización suave** no fue suficiente (la insignia del pie sigue en «antigua → nueva» tras recargar). Menos destructivo que el Reinicio completo. |
| 5735 | Annuler | bouton | `home.maint.cancel` (réutilise) | Cancel | Cancelar |
| 5736 | 🆘 Continuer | bouton | `home.maint.killSw.continue` | 🆘 Continue | 🆘 Continuar |
| 5778 | ❌ Désinscription refusée — pas de connexion | titre modale | `home.maint.killSw.offlineTitle` | ❌ Unregister refused — no connection | ❌ Anulación rechazada — sin conexión |
| 5782-5785 | Internet ou le serveur MyKTAMap ne répond pas. La désinscription du Service Worker est **annulée** pour ta sécurité — sinon l'app deviendrait inutilisable au prochain chargement (re-download des assets impossible). | corps | `home.maint.killSw.offlineBody` | The Internet or MyKTAMap server is not responding. The Service Worker unregistration is **cancelled** for your safety — otherwise the app would become unusable on next load (asset re-download impossible). | Internet o el servidor de MyKTAMap no responde. La anulación del Service Worker se **cancela** por tu seguridad; de lo contrario, la app quedaría inutilizable en la próxima carga (re-descarga de recursos imposible). |
| 5788 | ✅ Aucune perte de données | sous-titre | `home.maint.killSw.offlineNoLoss` | ✅ No data loss | ✅ Sin pérdida de datos |
| 5789 | Rien n'a été touché. Tes plans, sessions et préférences sont intacts. L'app continue de fonctionner sur la version actuellement en cache. | corps | `home.maint.killSw.offlineNoLossBody` | Nothing was touched. Your plans, sessions and preferences are intact. The app keeps working on the version currently in cache. | No se tocó nada. Tus planos, sesiones y preferencias están intactos. La app sigue funcionando con la versión actualmente en caché. |
| 5792-5794 | Reconnecte-toi à Internet (Wi-Fi / 4G), vérifie que `myktamap.fr` répond bien, puis relance la désinscription depuis **⚙️ Configuration → 🆘 Désinscrire le Service Worker**. | hint | `home.maint.killSw.offlineRetryHint` | Reconnect to the Internet (Wi-Fi / 4G), check that `myktamap.fr` responds, then restart the unregistration from **⚙️ Settings → 🆘 Unregister the Service Worker**. | Reconéctate a Internet (Wi-Fi / 4G), comprueba que `myktamap.fr` responde, y reinicia la anulación desde **⚙️ Configuración → 🆘 Anular el Service Worker**. |
| 5798 | OK | bouton | `home.maint.killSw.offlineOk` | OK | OK |

---

## 14. Divers — debug toggle & kill switch URL (préfixe `home.misc.*`)

| ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| 5941 | Logs détaillés activés | status | `home.misc.debugLogsOn` | Detailed logs enabled | Registros detallados activados |
| 5941 | Logs détaillés désactivés | status | `home.misc.debugLogsOff` | Detailed logs disabled | Registros detallados desactivados |
| 5984 | 🔄 [DEBUG] Mise à jour mineure appliquée — assets fraîchement rechargés. | toast (debug only) | `home.misc.swUpdateToast` | 🔄 [DEBUG] Minor update applied — assets freshly reloaded. | 🔄 [DEBUG] Actualización menor aplicada — recursos recién recargados. |
| 6038 | ✓ SW + caches HTTP/PWA purgés.\n\nlocalStorage / IndexedDB préservés (plans, sessions, photos).\n\nClic OK pour recharger l'app neuve. | alert (kill switch URL) | `home.misc.killSwUrlDone` | ✓ SW + HTTP/PWA caches purged.\n\nlocalStorage / IndexedDB preserved (plans, sessions, photos).\n\nClick OK to reload the fresh app. | ✓ SW + cachés HTTP/PWA purgadas.\n\nlocalStorage / IndexedDB preservados (planos, sesiones, fotos).\n\nPulsa OK para recargar la app nueva. |

---

## Candidats ÉCARTÉS (faux positifs notables)

| ligne | chaîne | raison |
|---|---|---|
| 474, 475, 542, 571, 718, 820, 841, 932, 967, 1006, 1028, 1045-1051… | divers | **commentaires** `<!-- -->` / `//` (textes d'explication, pas affichés) |
| 959 "💥 Tout réinitialiser" | bouton | **déjà** `data-i18n="home.cfg.resetBtn"` (HTML statique) |
| 888-896 "🔐 Code d'accès local", "Chargement…" | section PIN HTML | **déjà** `data-i18n` (`home.cfg.pinTitle`, `home.cfg.pinLoading`, etc.) |
| 1296 "Ajouter à l'itinéraire" | — | dans un **commentaire** décrivant `interfaceItineraire.js` |
| 2492 "Charger quand même ?" | — | dans un **commentaire** (rappel historique de l'ancien `confirm()`) |
| 5513-5519 (netlog "✓ Copié", "Copie échouée"…) | toasts | **déjà i18n** via helper `_tNL("home.netlog.*")` |
| 1881-1902 (badges `planRowHTML`) | titles | **déjà i18n** via `_homeT("home.plans.badge.*"/"home.plans.mode.*")` |
| 1855-1856 ("fr-FR" locale), 2952-2957 (noms IDB stores), 5406 ("ping" enum)… | — | **données / enums / locale**, non user-facing |
| L5855-5859 (`_frDesc` perf preset) | desc | **déjà i18n** via `home.perf.desc.*` (fallback FR) |

---

**TOTAL vrais gaps : 158**

---

# Audit i18n — chaînes FR user-facing codées en dur (Groupe 2 — Mode Secours + Itinéraire)

> Périmètre : `secoursMode.js`, `emergencyMode.js`, `lostMode.js`, `sortieUrgence.js`, `secoursPhotos.js`, `pathfinder.js`, `roadGraph.js`, `road.js`, `interfaceItineraire.js`.
> Méthode : `node scripts/find-hardcoded-fr.js --full` (804 candidats globaux, ~130 sur le périmètre) → tri manuel en lisant le code autour de chaque candidat.
> Constat : ces modules sont **massivement migrés** (Vagues 3 & 7). Le bruit du détecteur est ÉNORME : ~95 % des candidats du périmètre sont des **commentaires** (FR dans `//`), des **labels-fallback déjà résolus via I18n au rendu**, ou des **logs/erreurs dev-facing**. Il ne reste que **3 poches de vrais gaps**.

---

## js/emergencyMode.js — **8 gaps** (1 modale entière)

Modale « ⚠️ Image volumineuse » (`_showBigImageWarning`, L672-699) : `modal.innerHTML` construit en FR pur, **aucun `t()`** (la fonction ne définit même pas de `const t` local, contrairement à `_buildOverlay` L122). Affichée quand un plan V1 a une image de fond trop lourde pour la minimap du mode urgence. Aucune clé `emergency.bigimg.*` n'existe.

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| emergencyMode.js:675 | `⚠️ Image volumineuse` | titre modale | `emergency.bigimg.titre` | ⚠️ Large image | ⚠️ Imagen muy pesada |
| emergencyMode.js:678 | `L'image de fond du plan est <strong>{dims}</strong>{size}.` | paragraphe | `emergency.bigimg.dims` | The plan's background image is <strong>{dims}</strong>{size}. | La imagen de fondo del plano es <strong>{dims}</strong>{size}. |
| emergencyMode.js:680 | `Au-delà de {px} M pixels (~{mo} Mo), la minimap du mode urgence peut <strong>faire crasher l'app</strong> sur mobile (mémoire GPU saturée).` | paragraphe | `emergency.bigimg.warn` | Above {px}M pixels (~{mo} MB), the emergency-mode minimap can <strong>crash the app</strong> on mobile (GPU memory saturated). | Por encima de {px}M de píxeles (~{mo} MB), el minimapa del modo emergencia puede <strong>bloquear la app</strong> en móvil (memoria GPU saturada). |
| emergencyMode.js:683 | `Tu peux <strong>continuer sans l'image de fond</strong> (les chemins, zones et structures restent affichés, c'est juste le fond qui manque), ou <strong>charger quand même</strong> à tes risques.` | paragraphe | `emergency.bigimg.choix` | You can <strong>continue without the background image</strong> (paths, zones and structures stay visible — only the backdrop is missing), or <strong>load it anyway</strong> at your own risk. | Puedes <strong>continuar sin la imagen de fondo</strong> (los caminos, zonas y estructuras siguen visibles, solo falta el fondo), o <strong>cargarla de todos modos</strong> bajo tu responsabilidad. |
| emergencyMode.js:685 | `💡 Astuce : convertis ce plan en V2 tuilé via 🏗️ Modifier un plan → la minimap utilisera alors automatiquement les tuiles légères.` | astuce | `emergency.bigimg.astuce` | 💡 Tip: convert this plan to tiled V2 via 🏗️ Edit a plan → the minimap will then automatically use the lightweight tiles. | 💡 Consejo: convierte este plano a V2 en mosaico mediante 🏗️ Editar un plano → el minimapa usará entonces automáticamente los mosaicos ligeros. |
| emergencyMode.js:689 | `✓ Continuer sans image` / `Recommandé — pas de crash` | bouton + sous-libellé | `emergency.bigimg.btnSkip` / `emergency.bigimg.btnSkipDesc` | ✓ Continue without image / Recommended — no crash | ✓ Continuar sin imagen / Recomendado — sin bloqueo |
| emergencyMode.js:693 | `⚠️ Charger quand même` / `Risque de crash mobile` | bouton + sous-libellé | `emergency.bigimg.btnLoad` / `emergency.bigimg.btnLoadDesc` | ⚠️ Load anyway / Mobile crash risk | ⚠️ Cargar de todos modos / Riesgo de bloqueo en móvil |
| emergencyMode.js:698 | `Mémoriser mon choix pour ce plan` | label checkbox | `emergency.bigimg.remember` | Remember my choice for this plan | Recordar mi elección para este plano |

> Note d'implémentation : ajouter `const t = window.I18n.t.bind(window.I18n);` en tête de `_showBigImageWarning` (absent aujourd'hui). `{dims}`, `{size}`, `{px}`, `{mo}` sont des valeurs calculées à interpoler.

---

## js/pathfinder.js — **4 gaps** (erreurs remontées à l'écran)

`throw new Error("…FR…")` dont le `.message` est affiché **directement à l'user** : `interfaceItineraire.js:1636` fait `errEl.textContent = err.message` (zone d'erreur de la modale Itinéraire). Donc ces messages FR atteignent l'écran. Préfixe `iti.*` (là où le message s'affiche) ; il n'existe pas de préfixe `pathfinder.*`.

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| pathfinder.js:717 | `Aucune route correspondant aux types sélectionnés ({types})` | message d'erreur affiché | `iti.err.aucuneRouteTypes` | No route matching the selected types ({types}) | Ninguna ruta coincide con los tipos seleccionados ({types}) |
| pathfinder.js:725 | `Impossible de snap le waypoint #{n} sur le réseau` | message d'erreur affiché | `iti.err.snapImpossible` | Could not snap waypoint #{n} onto the network | No se pudo enganchar el waypoint #{n} a la red |
| pathfinder.js:740 | `Aucun chemin trouvé entre le waypoint #{a} et le waypoint #{b} (le réseau est probablement déconnecté entre ces 2 points)` | message d'erreur affiché | `iti.err.pasDeChemin` | No path found between waypoint #{a} and waypoint #{b} (the network is probably disconnected between these 2 points) | No se encontró ningún camino entre el waypoint #{a} y el waypoint #{b} (la red está probablemente desconectada entre estos 2 puntos) |
| pathfinder.js:815 | `Aucune route disponible pour calculer un itinéraire` | message d'erreur affiché | `iti.err.aucuneRoute` | No route available to compute an itinerary | No hay ninguna ruta disponible para calcular un itinerario |

> Note : pathfinder ne définit pas de helper `t()` (module moteur sans I18n importé). Soit on importe `window.I18n.t` ici, soit on remplace les `throw new Error(...)` par des codes (`err.code = "NO_ROUTE_TYPES"`) et on localise côté appelant (`interfaceItineraire.js`, `secoursMode.js`) — cohérent avec le pattern `QUOTA_PER_ETAPE` déjà en place pour les photos. Le `#{n}` à interpoler.

---

## js/road.js — **1 gap** (labels fallback popup tracé)

`_roadPopupTitle` (L900-901) : map de libellés FR + fallback `"Tracé " + t`, atteints **uniquement** quand `window.LegendCustomization` est indisponible (chemin dégradé — le chemin nominal L897 passe par `LegendCustomization.getLabel("traces", t)` qui est i18n). User-facing (titre de popup au survol/clic d'un tracé) mais rarement déclenché. Clés `road.type.*` déjà existantes à réutiliser (avec préfixe emoji).

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| road.js:900 | `🟩 Tracé principal` | titre popup (fallback) | `road.popup.principal` (ou réutiliser `road.type.principal`) | 🟩 Main route | 🟩 Trazado principal |
| road.js:900 | `🟪 Tracé secondaire` | titre popup (fallback) | `road.popup.secondaire` | 🟪 Secondary route | 🟪 Trazado secundario |
| road.js:900 | `🟨 Chemin` | titre popup (fallback) | `road.popup.chemin` | 🟨 Path | 🟨 Camino |
| road.js:901 | `Tracé {type}` (fallback générique pour type inconnu) | titre popup (fallback) | `road.popup.fallback` | Route {type} | Trazado {type} |

> Note : `road.type.principal/secondaire/chemin` existent déjà (`"Principal"/"Secondaire"/"Chemin"` EN `"Main"/"Secondary"/"Path"`). On peut soit réutiliser ces clés (en composant l'emoji en JS), soit créer un set `road.popup.*` avec emoji inline. Gap mineur (chemin dégradé), mais c'est bien du FR potentiellement affichable.

---

## Fichiers SANS gap (vérifiés, RAS)

| fichier | verdict |
|---|---|
| **secoursMode.js** | 0 gap. Les 60 candidats = commentaires + labels `TABLEAU_STATUTS` (`Aide demandée`/`Demi-tour forcé`/`Victime trouvée` L229-243) qui sont des **fallbacks FR résolus au rendu** via `_statutLabel()` → `t("secours.statut.<id>")` (L133-140). `Équipe Alpha` L57 = JSDoc. Tous les renders (boutons, floaters, toasts, overlays, modales) utilisent `t()`. |
| **lostMode.js** | 0 gap. L45/L521 = commentaires. Les presets (`label`/`hint`) sont explicitement annotés data-only résolus via `_presetLabel()`/`_presetHint()` → `I18n.t("lost.preset.*")` (L46-47). |
| **sortieUrgence.js** | 0 gap. L19/L23/L30 = commentaires (`Tracer l'itinéraire`, `Puits à échelon ouvert`, `Aucune sortie identifiée`). Les renders réels utilisent `t("sortie.*")` (L201-248). `Puits à échelon ouvert` est un **tag moteur** (donnée, hors scope i18n par décision archi). |
| **secoursPhotos.js** | 0 gap. L253/278/281/449 = `throw new Error(...)` **dev-facing** (invariants type « stepIdx doit être un number »). L285 (`Maximum N photos par étape`) porte `err.code="QUOTA_PER_ETAPE"` et la modale parente affiche `t("secours.toast.photoQuota")` à la place (L8422-8423) → message FR jamais montré. |
| **roadGraph.js** | 0 gap. Moteur pathfinding pur, aucune UI. L96 = `console.log`, L148 = commentaire. |
| **interfaceItineraire.js** | 0 gap. Les 8 candidats = commentaires (`➕ Itinéraire`, `Inclure pause entre arrêts`, `aller à`, `Mode clic évitement actif`). Tous les renders (modale, floater, résultats, pause) utilisent `window.I18n.t("iti.*")`. |

---

## Cas ambigus / décisions

1. **road.js L900-901** — chemin dégradé (LegendCustomization absent). Techniquement affichable en FR donc compté comme gap, mais sévérité faible. Si KARMA juge le module toujours présent → écartable.
2. **pathfinder erreurs** — comptées comme gaps car remontées via `err.message` à l'écran (`interfaceItineraire.js:1636`). Si la décision est « les messages d'erreur moteur restent FR/techniques » → écartables. L'approche `err.code` (déjà utilisée pour les photos) serait la plus propre.
3. **secoursPhotos L285** — écartée car gatée par `err.code`. Mais le fallback générique `secours.toast.erreurAjoutPhoto` ré-affiche `e.message` si une AUTRE erreur photo remonte (ex. L253 `canvas.toBlob a retourné null`) → ces messages dev pourraient théoriquement s'afficher. Jugé hors scope (erreurs dev anormales, pas un parcours user nominal).
4. **TABLEAU_STATUTS / presets / tags moteur** — écartés : ce sont soit des fallbacks déjà résolus via I18n au rendu, soit des données/tags moteur explicitement hors scope par l'archi i18n (`docs/architecture/i18n.md` §121).

---

## Récap chiffré

- **emergencyMode.js** : 8 gaps (modale Image volumineuse)
- **pathfinder.js** : 4 gaps (erreurs remontées à l'écran)
- **road.js** : 1 poche / 4 entrées (labels fallback popup tracé)
- **secoursMode / lostMode / sortieUrgence / secoursPhotos / roadGraph / interfaceItineraire** : 0 gap

**Écartés (bruit détecteur)** : ~120 candidats — commentaires, labels-fallback résolus via I18n, logs `console.*`, erreurs dev-facing, tags/données moteur.

**TOTAL vrais gaps : 13**

---

# Audit i18n — Groupe G3 (chaînes FR USER-FACING codées en dur)

> Périmètre : `voiceCommand.js`, `voiceTts.js`, `oomGuard.js`, `crashReports.js`, `batteryGuard.js`, `wakeLock.js`, `tiling.js`, `shortcuts.js`, `presentationMode.js`.
> Méthode : `node scripts/find-hardcoded-fr.js --full` + tri manuel du code. Distinction stricte **grammaire vocale (data → ignore)** vs **feedback affiché à l'user (gap)**.
> Convention clés : préfixe par module. EN + ES fournis. FR = fallback universel.

---

## `js/oomGuard.js` — modales de crash 100% FR, jamais migrées (gros gap)

Deux modales de crash (`_afficherModaleKill`, `_afficherModaleV2Crash`) + un toast `aria-label`, entièrement codées FR. Aucune clé `oom.*` n'existe encore → toutes nouvelles.

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| oomGuard.js:55 | `Fermer` (aria-label bouton fermer toast) | aria-label | `oom.toast.closeAria` | Close | Cerrar |
| oomGuard.js:146 | `ATTENTION — ARRÊT BRUTAL DÉTECTÉ` | titre modale | `oom.kill.titre` | WARNING — ABRUPT SHUTDOWN DETECTED | ATENCIÓN — CIERRE BRUSCO DETECTADO |
| oomGuard.js:153-154 | `La fois précédente, l'application s'est arrêtée brutalement sans pouvoir sauvegarder sa session normalement.` | corps modale | `oom.kill.intro` | Last time, the app shut down abruptly and couldn't save its session normally. | La vez anterior, la aplicación se cerró bruscamente sin poder guardar su sesión normalmente. |
| oomGuard.js:158 | `🤔 Pourquoi ?` | sous-titre | `oom.kill.whyTitle` | 🤔 Why? | 🤔 ¿Por qué? |
| oomGuard.js:160-162 | `Sur smartphone (iOS et Android), le système d'exploitation tue silencieusement les onglets et les apps installées qui consomment trop de mémoire vive. C'est très souvent ce qui s'est passé ici, surtout si tu utilises un plan en haute résolution ou que beaucoup d'autres apps tournaient en parallèle.` | paragraphe | `oom.kill.whyBody` | On smartphones (iOS and Android), the operating system silently kills tabs and installed apps that use too much RAM. That's very often what happened here, especially if you're using a high-resolution map or many other apps were running at the same time. | En los smartphones (iOS y Android), el sistema operativo cierra silenciosamente las pestañas y apps instaladas que usan demasiada memoria. Es muy a menudo lo que ocurrió aquí, sobre todo si usas un plano de alta resolución o tenías muchas otras apps abiertas a la vez. |
| oomGuard.js:167 | `💡 Comment éviter que ça recommence` | sous-titre | `oom.kill.howTitle` | 💡 How to avoid it happening again | 💡 Cómo evitar que vuelva a pasar |
| oomGuard.js:169-170 | `Ferme les autres applications en arrière-plan` + reste du `<li>` (`avant d'utiliser MyKTAMap. Sur iPhone : double-clic Home ou swipe-up + dégage les vignettes. Sur Android : bouton multi-tâche + balaye.`) | item liste | `oom.kill.tip.closeApps` | <strong>Close other background apps</strong> before using MyKTAMap. On iPhone: double-tap Home or swipe up + dismiss the cards. On Android: multitask button + swipe away. | <strong>Cierra otras apps en segundo plano</strong> antes de usar MyKTAMap. En iPhone: doble pulsación Home o deslizar + descartar las miniaturas. En Android: botón multitarea + deslizar. |
| oomGuard.js:171-172 | `Réduis le mode performance` + reste (`dans le loader (icône 🚀 ou via ⚙️ Réglages). "Performance" charge des tuiles plus petites et utilise moins de RAM que "Qualité".`) | item liste | `oom.kill.tip.perf` | <strong>Lower the performance mode</strong> in the loader (🚀 icon or via ⚙️ Settings). "Performance" loads smaller tiles and uses less RAM than "Quality". | <strong>Baja el modo de rendimiento</strong> en el cargador (icono 🚀 o vía ⚙️ Ajustes). "Rendimiento" carga teselas más pequeñas y usa menos RAM que "Calidad". |
| oomGuard.js:173-174 | `Évite d'ouvrir plusieurs onglets de navigateur` + reste (`en parallèle si tu utilises l'app via Safari/Chrome — chaque onglet consomme aussi de la mémoire.`) | item liste | `oom.kill.tip.tabs` | <strong>Avoid opening multiple browser tabs</strong> at once if you use the app via Safari/Chrome — each tab also uses memory. | <strong>Evita abrir varias pestañas del navegador</strong> a la vez si usas la app vía Safari/Chrome — cada pestaña también consume memoria. |
| oomGuard.js:175-176 | `Garde ton smartphone à jour` + reste (`: iOS et Android améliorent régulièrement leur gestion mémoire pour les PWA.`) | item liste | `oom.kill.tip.update` | <strong>Keep your smartphone up to date</strong>: iOS and Android regularly improve their memory management for PWAs. | <strong>Mantén tu smartphone actualizado</strong>: iOS y Android mejoran regularmente su gestión de memoria para las PWA. |
| oomGuard.js:177-178 | `Si le problème persiste sur un plan précis` + reste (`, son image principale est peut-être trop volumineuse — il faut alors la ré-optimiser (compression PNG ou réduction des dimensions).`) | item liste | `oom.kill.tip.optimize` | <strong>If the problem persists on a specific map</strong>, its main image may be too large — it then needs re-optimizing (PNG compression or smaller dimensions). | <strong>Si el problema persiste en un plano concreto</strong>, su imagen principal puede ser demasiado grande — habrá que reoptimizarla (compresión PNG o reducir dimensiones). |
| oomGuard.js:179-180 | `Exporte régulièrement ta session` + reste (`(💾 Enregistrer la session) pour ne rien perdre en cas d'arrêt brutal.`) | item liste | `oom.kill.tip.export` | <strong>Export your session regularly</strong> (💾 Save session) so you lose nothing in case of an abrupt shutdown. | <strong>Exporta tu sesión con frecuencia</strong> (💾 Guardar sesión) para no perder nada en caso de cierre brusco. |
| oomGuard.js:185 | `🔧 Détails techniques` | sous-titre | `oom.kill.techTitle` | 🔧 Technical details | 🔧 Detalles técnicos |
| oomGuard.js:187 | `Plan :` (label détail technique) | label | `oom.kill.tech.plan` | Map: | Plano: |
| oomGuard.js:188 | `Dernière activité avant l'arrêt : il y a {n}s` | label dynamique | `oom.kill.tech.lastActivity` | Last activity before shutdown: {n}s ago | Última actividad antes del cierre: hace {n}s |
| oomGuard.js:189 | `Mode :` + valeurs `PWA installée` / `Navigateur` | label + valeurs | `oom.kill.tech.mode` / `oom.kill.tech.modePwa` / `oom.kill.tech.modeBrowser` | Mode: / Installed PWA / Browser | Modo: / PWA instalada / Navegador |
| oomGuard.js:194 | `✓ Compris` (bouton OK modale kill) | bouton | `oom.kill.ok` | ✓ Got it | ✓ Entendido |
| oomGuard.js:412 | `taille inconnue` (fallback taille image V2) | valeur | `oom.v2.unknownSize` | unknown size | tamaño desconocido |
| oomGuard.js:416 | `🧱❌ Génération V2 interrompue` | titre modale V2 | `oom.v2.titre` | 🧱❌ V2 generation interrupted | 🧱❌ Generación V2 interrumpida |
| oomGuard.js:420-422 | `La dernière fois, tu lançais la conversion en V2 du plan {nom} (image {taille}) et l'app s'est arrêtée brutalement avant la fin.` | corps modale | `oom.v2.intro` | Last time, you were running the V2 conversion of map {nom} (image {taille}) and the app shut down abruptly before it finished. | La última vez, estabas ejecutando la conversión V2 del plano {nom} (imagen {taille}) y la app se cerró bruscamente antes de terminar. |
| oomGuard.js:424-428 | `C'est très probablement une saturation mémoire du navigateur — la conversion V2 décode l'image source à pleine résolution puis génère N tuiles, ce qui peut dépasser le plafond mémoire des navigateurs mobiles (~500 MB sur iOS Safari, variable sur Android).` | paragraphe | `oom.v2.explain` | It's very likely a browser memory overload — V2 conversion decodes the source image at full resolution then generates N tiles, which can exceed the memory cap of mobile browsers (~500 MB on iOS Safari, variable on Android). | Es muy probable una saturación de memoria del navegador — la conversión V2 decodifica la imagen origen a resolución completa y genera N teselas, lo que puede superar el límite de memoria de los navegadores móviles (~500 MB en iOS Safari, variable en Android). |
| oomGuard.js:430 | `💡 Solutions` | sous-titre | `oom.v2.solutionsTitle` | 💡 Solutions | 💡 Soluciones |
| oomGuard.js:432-433 | `Fais la conversion sur PC` + reste (`(Windows / macOS / Linux). Pas de plafond mémoire en pratique. Une fois le ZIP V2 généré, importe-le sur ton téléphone — l'import est léger (pas de décodage à pleine résolution).`) | item liste | `oom.v2.sol.pc` | <strong>Do the conversion on a PC</strong> (Windows / macOS / Linux). No memory cap in practice. Once the V2 ZIP is generated, import it on your phone — the import is lightweight (no full-resolution decoding). | <strong>Haz la conversión en un PC</strong> (Windows / macOS / Linux). Sin límite de memoria en la práctica. Una vez generado el ZIP V2, impórtalo en tu teléfono — la importación es ligera (sin decodificación a resolución completa). |
| oomGuard.js:434-435 | `Réduis l'image source` + reste (`à 6000-8000 px max avant de réessayer (GIMP / Photoshop / Squoosh).`) | item liste | `oom.v2.sol.resize` | <strong>Shrink the source image</strong> to 6000-8000 px max before retrying (GIMP / Photoshop / Squoosh). | <strong>Reduce la imagen origen</strong> a 6000-8000 px máx. antes de reintentar (GIMP / Photoshop / Squoosh). |
| oomGuard.js:436 | `Ferme les autres apps` + reste (`en arrière-plan pour libérer de la RAM avant de retenter.`) | item liste | `oom.v2.sol.closeApps` | <strong>Close other apps</strong> in the background to free up RAM before retrying. | <strong>Cierra otras apps</strong> en segundo plano para liberar RAM antes de reintentar. |
| oomGuard.js:441 | `✓ Compris` (bouton OK modale V2) | bouton | `oom.v2.ok` | ✓ Got it | ✓ Entendido |

**Sous-total oomGuard : 27 gaps** (peut être regroupé en moins de clés si on accepte des clés HTML multi-`<li>`, mais découpage 1 clé/élément recommandé pour la maintenance).

---

## `js/batteryGuard.js` — toasts + modale critique FR codés en dur

Aucune clé `battery.*` n'existe → toutes nouvelles.

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| batteryGuard.js:246 | `🔋 Batterie à {n}% — pense au mode Performance ULTRA pour économiser.` | toast | `battery.toast.info20` | 🔋 Battery at {n}% — consider Performance ULTRA mode to save power. | 🔋 Batería al {n}% — considera el modo Rendimiento ULTRA para ahorrar. |
| batteryGuard.js:255 | `⚠️ Batterie à {n}% — active Perf ULTRA et envisage de stopper le tracker (capteurs gourmands).` | toast | `battery.toast.warn10` | ⚠️ Battery at {n}% — enable Perf ULTRA and consider stopping the tracker (sensors are power-hungry). | ⚠️ Batería al {n}% — activa Perf ULTRA y considera detener el rastreador (sensores que consumen mucho). |
| batteryGuard.js:279 | `🪫 Batterie critique — {n} %` | titre modale | `battery.critical.titre` | 🪫 Critical battery — {n}% | 🪫 Batería crítica — {n}% |
| batteryGuard.js:283 | `⚠️ Ta batterie est en zone rouge.` | corps | `battery.critical.intro` | ⚠️ Your battery is in the red zone. | ⚠️ Tu batería está en zona roja. |
| batteryGuard.js:284 | `Action immédiate recommandée :` | corps | `battery.critical.actionLabel` | Immediate action recommended: | Acción inmediata recomendada: |
| batteryGuard.js:286 | `💾 Sauvegarde ta session` + reste (`(⬆️ → 💾) — risque de perte si extinction brutale`) | item liste | `battery.critical.tip.save` | 💾 <strong>Save your session</strong> (⬆️ → 💾) — risk of loss if it shuts off suddenly | 💾 <strong>Guarda tu sesión</strong> (⬆️ → 💾) — riesgo de pérdida si se apaga de golpe |
| batteryGuard.js:287 | `📋 Si tu es en sous-sol et que tu sais où tu es, note ta position (papier + crayon ou photo de l'écran)` | item liste | `battery.critical.tip.notePos` | 📋 If you're underground and know where you are, <strong>note your position</strong> (pen + paper or a screen photo) | 📋 Si estás bajo tierra y sabes dónde estás, <strong>anota tu posición</strong> (papel y lápiz o foto de la pantalla) |
| batteryGuard.js:288 | `🔦 Active le mode économie (réduit la luminosité, ferme les autres apps)` | item liste | `battery.critical.tip.eco` | 🔦 Enable power-saving mode (lower brightness, close other apps) | 🔦 Activa el modo de ahorro (baja el brillo, cierra otras apps) |
| batteryGuard.js:289 | `🚪 Envisage de remonter en surface si tu n'as pas de batterie de secours` | item liste | `battery.critical.tip.surface` | 🚪 Consider heading back to the surface if you have no backup battery | 🚪 Considera volver a la superficie si no tienes batería de reserva |
| batteryGuard.js:291 | `Cette alerte ne réapparaît plus jusqu'à la prochaine charge.` | note | `battery.critical.note` | This alert won't appear again until the next charge. | Esta alerta no volverá a aparecer hasta la próxima carga. |
| batteryGuard.js:294 | `⚙️ Configuration` (bouton vers réglages) | bouton | `battery.critical.btnConfig` | ⚙️ Settings | ⚙️ Configuración |
| batteryGuard.js:295 | `✓ Compris` (bouton OK) | bouton | `battery.critical.ok` | ✓ Got it | ✓ Entendido |

**Sous-total batteryGuard : 12 gaps.**

> Note : `_state().label = "?"` (L141) et `formatLabel → "{n}%"` ne sont PAS des gaps (pur affichage numérique / placeholder neutre, pas de FR).

---

## `js/presentationMode.js` — toast d'activation + aria-label oubliés (module déjà partiellement migré)

⚠️ Le bouton de sortie utilise déjà `window.I18n.t("presentation.exitBtn")` (clé existante dans `fr.json`). Le toast d'activation et l'aria-label ont été manqués lors de la migration.

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| presentationMode.js:75 | `Sortir du mode présentation` (aria-label bouton ✕) | aria-label | `presentation.exitAria` | Exit presentation mode | Salir del modo presentación |
| presentationMode.js:106-108 | `🎬 Mode présentation activé — F / Échap (PC) ou ✕ en haut-droite (mobile) pour sortir` | toast | `presentation.toast.activated` | 🎬 Presentation mode on — F / Esc (PC) or ✕ top-right (mobile) to exit | 🎬 Modo presentación activado — F / Esc (PC) o ✕ arriba a la derecha (móvil) para salir |

**Sous-total presentationMode : 2 gaps.**

---

## `js/voiceCommand.js` — DÉJÀ MIGRÉ (aucun gap)

Tout le feedback affiché passe déjà par le helper `_t(...)` (overlay live, modale aide, messages d'erreur, libellés de commandes via `labelKey`/`_cmdLabel`). Les ~60 candidats remontés par le script sont **tous des patterns de grammaire vocale** (ce que l'app *écoute*) = DATA, à ne **pas** traduire.

Exemples écartés (grammaire vocale, data) : `"aller à <POI>"` (L228, dans un commentaire de doc), `"plus près"` (L428), `"zoom arrière"` (L436), `"vue complète"` (L447), `"où est"` (L467), `"crée point"` (L480), `"démarrer tracker"` (L603), `"arrêter le tracker"` (L618), `"déclencher urgence"` (L635), `"thème clair"` (L665), `"thème sombre"` (L678), `"arrête l'écoute"` (L708), `"ferme la fenêtre"` (L716), `"où est la sortie"` (L733)… → **patterns ÉCOUTÉS, jamais affichés**.

Le `"✅ " + _cmdLabel(...)` (L221) et `"Commande exécutée"` (L415, qui est en réalité dans un **commentaire** décrivant le comportement, pas du code rendu) ne sont pas des gaps : le label affiché vient de `labelKey` → i18n.

**Sous-total voiceCommand : 0 gap.**

---

## `js/tiling.js` — ÉCARTÉ (métadonnées non consommées par l'UI)

`PERF_PRESETS[*].label`/`.description`/`.emoji`, `PERF_AUTO_META`, `PERF_OFF_META` contiennent du FR (`"Qualité"`, `"Plus net. Recommandé sur PC desktop."`, `"Désactivé"`, etc.) MAIS :
- L'UI de réglage (`interfaceConfig.js` L686-690 + L969-970) utilise sa **propre** map `_PRESET_LABELS` câblée sur `window.I18n.t("config.preset.*")` et n'affiche **que** `emoji` + `label` recalculés.
- Aucun consommateur ne lit `.description` ni `PERF_AUTO_META`/`PERF_OFF_META` (`.label`/`.description`) pour affichage (vérifié par grep cross-projet).

→ Ces chaînes sont du **display metadata mort/non consommé** : pas un gap user-facing actif. (Dette à part : soit les supprimer, soit les brancher sur i18n — mais ce n'est PAS un angle mort de migration au sens « FR affiché non traduit ».)

**Sous-total tiling : 0 gap.**

---

## `js/shortcuts.js` — ÉCARTÉ (labels de cheatsheet non rendus)

`MAPPING[*].label` (`"✏️ Édition"`, `"📐 Mesure"`, `"🔍 Recherche (alt Ctrl+K)"`…) est exposé via `listMapping()` « pour cheatsheet ». MAIS `listMapping` n'a **aucun consommateur JS** dans le projet (grep : seules occurrences = `shortcuts.js` lui-même + `README.md`/`AI_CONTEXT.md` en doc). Aucune cheatsheet UI ne rend ces labels aujourd'hui.

→ **Display metadata non consommé** : pas un gap actif. (Si une cheatsheet UI est ajoutée plus tard, ces labels devront alors être migrés — préfixe `shortcuts.*`.)

**Sous-total shortcuts : 0 gap.**

---

## `js/voiceTts.js` — aucun gap

Aucune chaîne user-facing : que des `console.log`/`console.warn` (préfixe `[VoiceTts]`) et des états techniques sérialisés (`"started"`, `"ended"`, `"canceled"`, `"error"` = enums d'événement interne, pas affichés). **0 gap.**

---

## `js/wakeLock.js` — aucun gap

Aucune chaîne user-facing : que des `console.log`/`console.warn` (`[WakeLock]`). Pas de toast/modale/label. **0 gap.**

---

## `js/crashReports.js` — ÉCARTÉ (rapport diagnostique pour le mainteneur)

`formatReportText()` (L196-227) produit un texte plain en FR (`"📅 Archivé : "`, `"💥 Crash ~ : "`, `"📦 DERNIER SNAPSHOT SESSION (avant le crash)"`, `"📋 DERNIERS LOGS"`, `"Aucun snapshot session du plan disponible"`…). C'est un **rapport technique de diagnostic** destiné au copier/coller vers le mainteneur (Discord/mail), pas de la chrome UI traduisible — au même titre qu'un dump de logs. Format volontairement stable/technique.

→ Borderline mais classé **non-gap** (rapport diagnostique technique, audience = mainteneur, pas chrome user-facing localisée). Le reste du module = logs `[CrashReports]` + structures IDB. **0 gap actif.**

---

## Synthèse

| Fichier | Vrais gaps | Statut |
|---|---|---|
| oomGuard.js | **27** | 2 modales crash + 1 aria-label, jamais migrées |
| batteryGuard.js | **12** | 2 toasts + modale critique |
| presentationMode.js | **2** | toast activation + aria-label (module partiellement migré) |
| voiceCommand.js | 0 | déjà migré (`_t`) ; candidats = grammaire vocale (data) |
| voiceTts.js | 0 | logs + enums uniquement |
| wakeLock.js | 0 | logs uniquement |
| tiling.js | 0 | métadonnées preset non consommées (dette à part) |
| shortcuts.js | 0 | labels cheatsheet non rendus (dette à part) |
| crashReports.js | 0 | rapport diagnostique mainteneur (non-chrome) |

**TOTAL vrais gaps : 41**

### Décompte écartés
- **~60 candidats voiceCommand.js** = patterns de **grammaire vocale** (DATA écoutée, à ne PAS traduire) → écartés.
- **tiling.js / shortcuts.js** : métadonnées d'affichage **non consommées** par l'UI actuelle → écartées (dette de propreté distincte, pas un angle mort de migration).
- **crashReports.js** : rapport diagnostique technique pour le mainteneur → écarté.
- **voiceTts.js / wakeLock.js** : logs + enums internes uniquement → rien à écarter (0 candidat user-facing).

### Cas ambigus signalés
1. **crashReports.js `formatReportText`** : du FR bien réel, mais c'est un export diagnostique mainteneur, pas de la chrome localisable. Classé non-gap — à arbitrer par KARMA si on veut un rapport bilingue.
2. **tiling.js `PERF_PRESETS[*].description`** : FR jamais affiché aujourd'hui (UI lit `_PRESET_LABELS` i18n côté `interfaceConfig.js`). Si un jour l'UI rebranche `.description`, ça redevient un gap → préfixe `config.preset.*.desc`.
3. **shortcuts.js `MAPPING[*].label`** : idem, gap latent si une cheatsheet UI est ajoutée → préfixe `shortcuts.*`.
4. **oomGuard `oom.kill.tip.*` / `oom.v2.sol.*`** : items `<li>` contenant du HTML (`<strong>`) — découpage 1 clé/item proposé ; regroupables si on accepte des clés HTML longues.

---

# Audit i18n — chaînes FR user-facing codées en dur (Groupe G4)

> Périmètre : `js/utils.js`, `js/interface.js`, `js/refonteInterface.js`, `js/interfaceConfig.js`,
> `js/interfaceMaintenance.js`, `js/interfaceAlerts.js`, `js/interfaceDistanceTotale.js`,
> `js/main.js`, `js/map.js`, `js/config.js`, `js/themeManager.js`, `js/compass.js`.
>
> Méthode : `node scripts/find-hardcoded-fr.js --full` → tri manuel ligne par ligne (lecture du contexte
> réel pour distinguer commentaire / log / enum sérialisé vs vrai texte affiché). Complété par un scan
> *accent-free* dans les blocs de rendu (le script rate « metalliques », « a plat », titres sans accent…).
> Croisé avec `lang/fr.json` : plusieurs gaps ont **déjà une clé prête** non câblée (migration incomplète).
>
> EST un gap : FR affiché à l'user (bouton, modale, toast, label, placeholder, title/aria, alert/confirm)
> construit en JS sans `I18n.t()`. N'EST PAS un gap : commentaire, `console.*`, enum/id sérialisé, regex,
> clé i18n, texte déjà sous `data-i18n` ou `I18n.t()`.

---

## js/utils.js

Fichier le plus touché. La popup POI **mélange déjà** `I18n.t("poi.goThere")` / `poi.addWaypoint` /
`poi.deletePoint` avec des libellés voisins restés en dur → preuve d'une migration partielle. Plusieurs
gaps ont une clé **déjà existante** (réutiliser, ne pas dupliquer).

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| utils.js:453 | `Incohérence échelle modérée` | titre bannière | `utils.scaleCoherence.titleWarn` | Moderate scale mismatch | Discrepancia de escala moderada |
| utils.js:454 | `Incohérence échelle élevée` | titre bannière | `utils.scaleCoherence.titleAlert` | High scale mismatch | Discrepancia de escala alta |
| utils.js:455 | `Incohérence échelle critique` | titre bannière | `utils.scaleCoherence.titleCritical` | Critical scale mismatch | Discrepancia de escala crítica |
| utils.js:460 | `L'export KMZ/GPX géolocalisé utilise le géoréférencement GPS…` | corps modale (export) | `utils.scaleCoherence.introExport` | The geolocated KMZ/GPX export uses GPS georeferencing. If the gap with the calibrated scale is large, distances rendered in Google Earth / OsmAnd will NOT match the measurements made in MyKTAMap. | La exportación KMZ/GPX geolocalizada usa la georreferenciación GPS. Si la diferencia con la escala calibrada es grande, las distancias mostradas en Google Earth / OsmAnd NO coincidirán con las medidas hechas en MyKTAMap. |
| utils.js:461 | `L'échelle (px/m) saisie dans cette modale ne correspond pas…` | corps modale (settings) | `utils.scaleCoherence.introSettings` | The scale (px/m) entered in this dialog does not match the one derived from GPS georeferencing. <strong>One of the two values is probably wrong.</strong> | La escala (px/m) introducida en este diálogo no coincide con la deducida de la georreferenciación GPS. <strong>Uno de los dos valores es probablemente erróneo.</strong> |
| utils.js:469 | `% d'écart` (suffixe `+N% d'écart`) | label bannière | `utils.scaleCoherence.deltaSuffix` | % gap | % de diferencia |
| utils.js:475 | `📐 Échelle calibrée (saisie)` | cellule tableau | `utils.scaleCoherence.rowCalibrated` | 📐 Calibrated scale (entered) | 📐 Escala calibrada (introducida) |
| utils.js:479 | `🌐 Échelle déduite du géoréf GPS` | cellule tableau | `utils.scaleCoherence.rowGps` | 🌐 Scale derived from GPS georef | 🌐 Escala deducida del georref. GPS |
| utils.js:481 | `title="Copier la valeur GPS dans le presse-papier"` + texte bouton `📋 Copier` | title + bouton | `utils.scaleCoherence.copyTitle` / `utils.scaleCoherence.copyBtn` | Copy the GPS value to clipboard / 📋 Copy | Copiar el valor GPS al portapapeles / 📋 Copiar |
| utils.js:486 | `Aucune correction automatique appliquée.` | hint modale | `utils.scaleCoherence.hintNoFix` | No automatic correction applied. | No se aplicó corrección automática. |
| utils.js:487 | `Vérifie soit le géoréférencement (2 points GPS bien placés ?), soit le calibrage d'échelle (✏️ Réglages → 🎯 Calibrer l'échelle).` | hint modale | `utils.scaleCoherence.hintCheck` | Check either the georeferencing (2 GPS points well placed?) or the scale calibration (✏️ Settings → 🎯 Calibrate scale). | Comprueba la georreferenciación (¿2 puntos GPS bien situados?) o la calibración de escala (✏️ Ajustes → 🎯 Calibrar escala). |
| utils.js:488 | `Si tu fais confiance au géoréf, tu peux copier la valeur GPS et la coller dans le champ Échelle.` | hint modale | `utils.scaleCoherence.hintTrust` | If you trust the georef, you can copy the GPS value and paste it into the Scale field. | Si confías en la georref., puedes copiar el valor GPS y pegarlo en el campo Escala. |
| utils.js:766 | `❌ Erreur : ` (préfixe statut popup) | status text | `utils.popup.errorPrefix` | ❌ Error: | ❌ Error: |
| utils.js:837 / 849 | `📋 Copié : ` (préfixe toast) | toast | `utils.copiedPrefix` *(clé `utils.copied`="✓ Copié !" existe mais sans le nom collé)* | 📋 Copied: | 📋 Copiado: |
| utils.js:900 | `title="Modifier ce point (nom, type, description, photos)"` | title bouton | `poi.editPoint` *(symétrique de `poi.deletePoint` utilisé juste en dessous L909)* | Edit this point (name, type, description, photos) | Editar este punto (nombre, tipo, descripción, fotos) |
| utils.js:901 | `✏️ Modifier` | texte bouton | `poi.editBtn` | ✏️ Edit | ✏️ Editar |
| utils.js:977 | `➕ Itinéraire` | texte bouton popup | `poi.addWaypointBtn` *(le title L976 utilise déjà `poi.addWaypoint`)* | ➕ Route | ➕ Ruta |
| utils.js:986 / 1108 | `Retirer des favoris` / `Mettre en favori` | title bouton ⭐ | `poi.favRemoveTitle` / `poi.favAddTitle` | Remove from favorites / Add to favorites | Quitar de favoritos / Añadir a favoritos |
| utils.js:987 / 1106 | `⭐ Favori` / `☆ Favori` | texte bouton ⭐ | `poi.favOn` / `poi.favOff` | ⭐ Favorite / ☆ Favorite | ⭐ Favorito / ☆ Favorito |
| utils.js:1051 / 1060 / 1076 | `Lire la note à haute voix` | title bouton 🔊 | **`poi.readNote` (clé EXISTANTE, déjà = ce texte)** | Read the note aloud | Leer la nota en voz alta |
| utils.js:1064 | `Arrêter la lecture` | title bouton ⏹️ | `poi.stopReading` | Stop reading | Detener la lectura |
| utils.js:1114 | `⭐ Ajouté aux favoris : ` / `☆ Retiré des favoris : ` (préfixe toast) | toast | `poi.favAddedToast` / `poi.favRemovedToast` | ⭐ Added to favorites: / ☆ Removed from favorites: | ⭐ Añadido a favoritos: / ☆ Quitado de favoritos: |
| utils.js:1799-1803 | `🟩 Tracé principal` / `🟪 Tracé secondaire` / `🟨 Chemin` / `🪜 Jonction interniveau` / `🗺️ Itinéraire` | titres popup tracé | `legend.label.traces.*` (existe, sans emoji) ou nouveau `utils.tracePopup.*` | 🟩 Main route / 🟪 Secondary route / 🟨 Path / 🪜 Interlevel junction / 🗺️ Route | 🟩 Ruta principal / 🟪 Ruta secundaria / 🟨 Sendero / 🪜 Unión entreniveles / 🗺️ Ruta |
| utils.js:1805 | `Tracé ` (fallback `"Tracé " + t`) | fallback label | `utils.tracePopup.fallback` | Trace {type} | Trazo {type} |
| utils.js:1978-1982 | `🟡 Pilier 1ère masse` / `🟠 Pilier 2e masse` / `🔵 Mur` / `🟨 Front de taille 1ère masse` / `🟧 Front de taille 2e masse` | titres popup structure | **`struct.popup.pilier-1` / `pilier-2` / `mur` / `front-1` / `front-2` (clés EXISTANTES, valeurs identiques)** | 🟡 1st-mass pillar / 🟠 2nd-mass pillar / 🔵 Wall / 🟨 1st-mass cutting face / 🟧 2nd-mass cutting face | 🟡 Pilar 1.ª masa / 🟠 Pilar 2.ª masa / 🔵 Muro / 🟨 Frente de cantera 1.ª masa / 🟧 Frente de cantera 2.ª masa |
| utils.js:1984 | `Structure ` (fallback `"Structure " + t`) | fallback label | **`struct.popup.fallback` (clé EXISTANTE = "Structure {type}")** | Structure {type} | Estructura {type} |
| utils.js:2127 | `alert("Configuration du plan introuvable")` | alert natif | `utils.export.noPlanConfig` | Plan configuration not found | Configuración del plano no encontrada |
| utils.js:1245 | `title="Voir photo N / M"` | title miniature | `utils.popup.viewPhoto` | View photo {n} / {total} | Ver foto {n} / {total} |
| utils.js:2664-2666 | `Export impossible : le plan est trop grand pour être encodé par le navigateur (PNG et JPEG ont tous deux échoué). Essaye le 🎨 Mode avancé avec une résolution réduite (½ ou ¼) pour contourner la limite mémoire.` | Error re-throw → affiché en modale Export | `utils.export.tooLargeError` | Export failed: the plan is too large to be encoded by the browser (both PNG and JPEG failed). Try 🎨 Advanced mode with a reduced resolution (½ or ¼) to work around the memory limit. | Exportación imposible: el plano es demasiado grande para que el navegador lo codifique (PNG y JPEG fallaron). Prueba el 🎨 Modo avanzado con una resolución reducida (½ o ¼) para sortear el límite de memoria. |

**Sous-total utils.js : 31 vrais gaps** (lignes : 453, 454, 455, 460, 461, 469, 475, 479, 481×2, 486, 487, 488, 766, 837/849, 900, 901, 977, 986/1108, 987/1106, 1051+, 1064, 1114, 1799-1803, 1805, 1978-1982, 1984, 2127, 1245, 2664).
*Comptage par chaîne unique distincte (les répétitions L849/L1060/L1076/L1108 réutilisent la même clé).*

---

## js/interface.js

**0 gap.** Les 19 candidats du script sont **tous des commentaires ou des `console.log`** (ex. L180 « Section Plans récents » = commentaire ; le rendu réel L183 utilise `I18n.t("ui.switcher.recentTitle")`. L1659/L1763/L1266/L3042 = commentaires/log). Scan accent-free : RAS sur les blocs de rendu.

---

## js/refonteInterface.js

**0 gap.** Modale « Détails de la session » + bloc « Stats agrégées » **déjà migrés** (`I18n.t("ui.refonte.*")`, ex. L1150). Les 18 candidats (L326, L935, L946, L1147, L2076, L2300, L403, L527…) sont des **commentaires** (titres de section en commentaire) ou des `console.error` (L342-343). Scan accent-free : RAS.

---

## js/interfaceConfig.js

Le template HTML de la modale Réglages est **déjà I18n** (boutons, labels, hints via `config.*`). Les gaps restants sont des **toasts de feedback** et **alerts** non câblés (pas de clé existante côté toast).

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| interfaceConfig.js:1038 | `alert("Module PresentationMode indisponible.")` | alert natif | `config.presentation.unavailable` | Presentation module unavailable. | Módulo de presentación no disponible. |
| interfaceConfig.js:1075 | `alert("Module IncognitoMode indisponible. Recharge la page.")` | alert natif | `config.incognito.unavailable` | Incognito module unavailable. Reload the page. | Módulo de incógnito no disponible. Recarga la página. |
| interfaceConfig.js:1194 | `⚠️ Picker Nord indisponible (module pas chargé).` | toast warn | `config.display.north.pickerUnavailable` | ⚠️ North picker unavailable (module not loaded). | ⚠️ Selector de Norte no disponible (módulo no cargado). |
| interfaceConfig.js:1216 | `🧭 Nord calibré à N°` | toast info | `config.display.north.calibratedToast` | 🧭 North calibrated to {deg}° | 🧭 Norte calibrado a {deg}° |
| interfaceConfig.js:1222 | `Picker indisponible` (fallback `e.message ?`) | toast warn (fallback) | `config.display.north.pickerError` | Picker unavailable | Selector no disponible |
| interfaceConfig.js:1108 | `🔆 Écran maintenu allumé tant que l'app est ouverte` | toast info | `config.display.wakelock.toastOn` | 🔆 Screen kept on while the app is open | 🔆 Pantalla encendida mientras la app esté abierta |
| interfaceConfig.js:1109 | `🔅 Mise en veille écran ré-activée` | toast info | `config.display.wakelock.toastOff` | 🔅 Screen sleep re-enabled | 🔅 Suspensión de pantalla reactivada |
| interfaceConfig.js:1273 | `📳 Vibration activée` | toast info | `config.display.vibration.toastOn` | 📳 Vibration enabled | 📳 Vibración activada |
| interfaceConfig.js:1274 | `🔇 Vibration désactivée` | toast info | `config.display.vibration.toastOff` | 🔇 Vibration disabled | 🔇 Vibración desactivada |
| interfaceConfig.js:1299 | `🎤 Commandes vocales activées. Bouton 🎤 visible en bas à droite.` | toast info | `config.display.voice.toastOn` | 🎤 Voice commands enabled. 🎤 button shown at bottom right. | 🎤 Comandos de voz activados. Botón 🎤 visible abajo a la derecha. |
| interfaceConfig.js:1300 | `🎤 Commandes vocales désactivées.` | toast info | `config.display.voice.toastOff` | 🎤 Voice commands disabled. | 🎤 Comandos de voz desactivados. |

**Sous-total interfaceConfig.js : 11 vrais gaps.**

---

## js/interfaceMaintenance.js

**0 gap.** Les 10 candidats sont **tous des commentaires** (L20 « Calibrage d'échelle » = doc API ; L336 « Préparation… »/« Rechargement… » et L448 « Continuer quand même » apparaissent **uniquement entre guillemets dans un commentaire** — vérifié par grep, aucun rendu réel). La modale ping + le reset flow utilisent `I18n.t("maint.*")` (ex. L512). Scan accent-free : RAS.

---

## js/interfaceAlerts.js

**0 gap.** L19/L20/L101 (« Déjà à jour », « Vérification impossible (offline) ») sont dans la **doc en commentaire** ; le rendu réel utilise `I18n.t("alerts.absent.uptodate.msg")` (L96). Scan accent-free : RAS.

---

## js/interfaceDistanceTotale.js

**0 gap.** Modale **entièrement migrée** : titre, help, labels de type, total, boutons Effacer/Fermer → `I18n.t("disttot.*")` (L216-249). L205/L296 = commentaires. Scan accent-free : RAS.

---

## js/main.js

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| main.js:759 | `Récupération du plan depuis le serveur…` | overlay chargement | `ui.loading.fetchingPlan` | Fetching the plan from the server… | Recuperando el plano del servidor… |

Les 4 autres candidats (L386, L417, L1316, L1392) sont des **commentaires**.

**Sous-total main.js : 1 vrai gap.**

---

## js/map.js

**0 gap.** L146 = commentaire ; L435 = commentaire. L199 `throw new Error("PLAN_CONFIG non chargé")` = **erreur d'invariant interne** (surface console/crash, pas une UI traduisible) → écarté.

---

## js/config.js

**0 gap.** L448 et L616 (« ↺ Réinitialiser ») sont des **commentaires** ; le vrai bouton « ↺ Réinitialiser » est rendu ailleurs (`config.display.north.reset` existe déjà).

---

## js/themeManager.js

**0 gap.** L54 (« ☀️ Activer le thème CLAIR ») est un **commentaire** décrivant le toggle (rendu ailleurs). Aucun `showToast`/`textContent`/`title` user-facing dans le module.

---

## js/compass.js

⚠️ **Angle mort majeur du script** : une modale + un widget **entièrement codés en dur**, dont 1 seule ligne flaggée (L114) car le reste est **du FR sans accent** dans les blocs de rendu (« a plat », « metalliques », « carrieres », « magnetometre »…).

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| compass.js:74 | `title="Fermer la boussole"` + `aria-label="Fermer"` | title + aria bouton ✕ | `compass.widget.closeTitle` / `compass.widget.closeAria` | Close the compass / Close | Cerrar la brújula / Cerrar |
| compass.js:75 | `title="Cliquer pour agrandir"` | title rose widget | `compass.widget.enlargeTitle` | Click to enlarge | Clic para ampliar |
| compass.js:76 / 119 | `alt="Rose des vents"` | alt image | `compass.roseAlt` | Compass rose | Rosa de los vientos |
| compass.js:114 | `🧭 Boussole — Nord magnétique` | titre modale | `compass.modal.title` | 🧭 Compass — Magnetic North | 🧭 Brújula — Norte magnético |
| compass.js:115 | `aria-label="Fermer"` | aria bouton ✕ modale | `compass.modal.closeAria` | Close | Cerrar |
| compass.js:126-127 | `Le N de la rose pointe toujours vers le vrai Nord. Si tu avances en tenant le tel a plat dans la main (top du tel = direction de marche) :` | hint modale | `compass.modal.hint` | The N on the rose always points to true North. If you walk holding the phone flat in your hand (top of phone = walking direction): | La N de la rosa siempre apunta al Norte verdadero. Si avanzas sosteniendo el móvil plano en la mano (parte superior = dirección de marcha): |
| compass.js:130 | `Tu marches vers le Nord → N reste en haut` | item liste | `compass.modal.dirN` | Walking North → N stays up | Caminas al Norte → N arriba |
| compass.js:131 | `Tu marches vers l'Est → N pointe a gauche` | item liste | `compass.modal.dirE` | Walking East → N points left | Caminas al Este → N apunta a la izquierda |
| compass.js:132 | `Tu marches vers le Sud → N pointe en bas` | item liste | `compass.modal.dirS` | Walking South → N points down | Caminas al Sur → N apunta abajo |
| compass.js:133 | `Tu marches vers l'Ouest → N pointe a droite` | item liste | `compass.modal.dirW` | Walking West → N points right | Caminas al Oeste → N apunta a la derecha |
| compass.js:136-137 | `⚠️ Attention aux armatures metalliques (carrieres, galeries) qui faussent le magnetometre. Une vraie boussole physique reste plus fiable.` | note avertissement | `compass.modal.warning` | ⚠️ Beware of metal structures (quarries, galleries) that distort the magnetometer. A real physical compass remains more reliable. | ⚠️ Cuidado con las estructuras metálicas (canteras, galerías) que distorsionan el magnetómetro. Una brújula física real sigue siendo más fiable. |
| compass.js:59 *(ambigu)* | `["N","NE","E","SE","S","SO","O","NO"]` cardinaux FR affichés (widget L79/196 + modale L122) | display cardinal | `compass.cardinals` (tableau/8 clés) | N/NE/E/SE/S/SW/W/NW | N/NE/E/SE/S/SO/O/NO |

**Sous-total compass.js : 12 vrais gaps** (+1 ambigu = cardinaux `SO`/`O`/`NO`, voir notes).

---

## Notes de tri (cas écartés & ambigus)

**Écartés (NON gaps) — exemples représentatifs :**
- Tous les candidats de `interface.js`, `refonteInterface.js`, `interfaceMaintenance.js`, `interfaceAlerts.js`, `interfaceDistanceTotale.js`, `config.js`, `themeManager.js`, `map.js` → **commentaires, `console.*`, ou strings citées dans un commentaire**. `utils.js` contient aussi de nombreux fragments de commentaire flaggés (« URL réelle de l », « event popupopen est fiable… »).
- `map.js:199` `throw new Error("PLAN_CONFIG non chargé")` → erreur d'invariant interne (console/crash dev), pas une UI traduisible.
- Strings déjà migrées flaggées sur la ligne du **commentaire adjacent** (ex. `config.presentation.btn` rendu L729, commenté L720).

**Cas ambigus (à arbitrer KARMA) :**
1. **Cardinaux compass `_cardinal()`** (compass.js:59) : `N/NE/E/SE/S/SO/O/NO` sont affichés à l'user (widget + modale). `SO`/`O`/`NO` sont **spécifiques au FR** (EN = `SW`/`W`/`NW`). C'est un vrai gap visuel mais souvent toléré comme « quasi-neutre ». **Compté à part** (non inclus dans le total dur).
2. **`utils.js:766` `❌ Erreur : `** : seul le préfixe est FR (le reste = `e.message` brut). Gap mineur mais visible dans la popup d'édition rapide → **compté**.
3. **Labels popup tracé/structure (utils.js)** : `struct.popup.*` existe à l'identique → gap « facile » ; `legend.label.traces.*` existe **sans le préfixe emoji** → soit réutiliser + ajouter l'emoji au rendu, soit créer `utils.tracePopup.*`. Décision d'implémentation, pas de tri.
4. **`utils.js:837/849` `📋 Copié :`** : la clé `utils.copied` (« ✓ Copié ! ») existe mais ne gère pas le `+ txt` collé → nouvelle clé `utils.copiedPrefix` recommandée plutôt que réutilisation.

**Forte confiance :** les gaps `utils.js` popup (favoris, TTS, édition, photo) sont avérés car la **même popup utilise déjà `I18n.t("poi.*")`** sur les boutons voisins — migration laissée à moitié.

---

## TOTAL vrais gaps : 55

Répartition : utils.js 31 · interfaceConfig.js 11 · compass.js 12 · main.js 1.
(+1 cas ambigu = cardinaux compass `SO/O/NO`, hors total.)
Fichiers **sans gap** (déjà migrés ou candidats = commentaires) : interface.js, refonteInterface.js,
interfaceMaintenance.js, interfaceAlerts.js, interfaceDistanceTotale.js, map.js, config.js, themeManager.js.

---

# Audit i18n G5 — Chaînes FR user-facing codées en dur

> Périmètre : 15 fichiers export/import/session/histoire/photos.
> Méthode : `node scripts/find-hardcoded-fr.js --full` (filet heuristique, FN sur FR sans accent) + lecture manuelle de chaque candidat + traçage cross-module (qui affiche la chaîne).
> Règle de tri : **gap** = FR affiché à l'user (bouton/modale/toast/label/alert/erreur visible). **Pas un gap** = commentaire · log · contenu GRAVÉ dans un export KML/GPX/PDF lu par un outil tiers (= donnée) · enum/id sérialisé · fallback i18n inline · Error interne jamais affichée verbatim.

---

## js/kmzExport.js
**0 gap.** Module 100% générateur KML. Tous les candidats (`🗺️ Itinéraire`, `Pilier 1ère masse`, `Front de taille 1ère masse`, `Équipe N`, `Durée estimée`, `📍 Entrée`, `▾ Étape`, `🚨 Secours`, `Plan de secours`, noms de `<Folder>`/`<name>`/`<description>`…) sont du **contenu KML gravé dans le fichier** lu par Google Earth/OsmAnd/Avenza → **donnée fixe, PAS interface**. `définir un plan de secours` (L984) = commentaire. Aucun toast/erreur d'interface dans ce module (l'orchestration UI vit dans sessionExporter.js, déjà i18n).

## js/kmzImport.js
**0 gap clair** (2 ambigus → section dédiée). `IndexedDB...`/`info à l'`/`icône default qu'` = commentaires. `Plan importé KMZ` (L728) + `Annotations importées (KMZ)` (L869) = **défauts écrits dans le `plan-config.json` reconstruit** (nom de plan + label de dataLayer). Persistés comme donnée d'un plan généré, pas un libellé d'interface live → classés **ambigus** (cf. fin de doc).

## js/gpxIO.js
**0 gap clair** (2 ambigus). `pas calibré` (L76) = commentaire. ` tracé(s)</desc>` (L213) = contenu `<desc>` gravé dans le GPX exporté = **donnée tierce**. `(Point importé GPX)` (L477) + `(Tracé importé GPX)` (L518) = **fallback du `nom`/`label`** d'un POI/tracé importé quand le GPX n'a pas de nom → donnée d'annotation persistée → **ambigu** (cf. fin).

## js/gpxImport.js
**0 gap clair** (3 ambigus). `(Tracé GPX)` (L215), `Plan importé GPX` (L310), `Annotations importées (GPX)` (L394) = mêmes cas que kmzImport/gpxIO : nom de plan / label dataLayer / label de tracé écrits dans le `plan-config.json` ou l'annotation reconstruite → **ambigu**.

## js/exporter.js
**0 gap.** Module export PNG/légende **entièrement migré** : modale (`T("imgexport.*")`), alerts (`T("imgexport.alert.*")`, `imgexport.addEntry.alert.*`), bannière pick, titres de légende dessinés au canvas (`imgexport.legende.titreImg`), section names (via `LegendCustomization` i18n). Tous les candidats heuristiques = commentaires. `metaLignes` = nom de plan + date (donnée). Placeholders `"0"` / `"https://... ou data:image/..."` = techniques, pas du texte de phrase.

## js/pdfExport.js

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| js/pdfExport.js:504 | `jsPDF non chargé (lib/jspdf.umd.min.js manquant)` | Error affichée (modale erreur via `_afficherErreur` → `_escHtml(msg)`, L321/488) | `pdfexport.erreur.jspdfManquant` | The PDF library failed to load. Please reload the app and try again. | No se pudo cargar la biblioteca PDF. Recarga la app e inténtalo de nuevo. |
| js/pdfExport.js:513 | `Échec génération canvas du plan` | Error affichée (même chemin) | `pdfexport.erreur.canvasEchec` | Failed to render the map image. | No se pudo generar la imagen del plano. |

**Note** : le titre de la modale d'erreur est déjà i18n (`pdfexport.erreur.titre`) mais le **corps** = `err.message` brut → ces 2 messages FR (dont une fuite de nom de fichier `lib/jspdf...`) atteignent l'user verbatim. Tout le reste (header PDF, crédit, tagline, progression) est i18n ✅.

## js/sessionExporter.js
**0 gap.** Modale + onglets (`_renderFull/_renderAdvanced/_renderConversion/_renderExtern`) **100% `t("export.*")`** ; toasts/erreurs i18n. Candidats `Non inspectée` (L1616), `🛣️ Tracé #` (L1632), `POI #N` (L1609) = libellés réécrits **DANS la session anonymisée exportée** (fichier de partage) → donnée. Reste = commentaires.

## js/sessionReport.js
Modale UI = **100% i18n** (`report.*`). MAIS le **contenu généré** des rapports Texte (`_genererTexte`) et PDF (`_genererPDF`) est FR en dur. Ce sont des livrables **lus et partagés par l'user** (presse-papier WhatsApp/Discord, PDF) — pas consommés par un outil tiers → **gaps** (le rapport reste en FR même app en EN/ES).

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| js/sessionReport.js:218 | `📋 RAPPORT DE SORTIE — ` | en-tête texte | `report.txt.header` | TRIP REPORT — | INFORME DE SALIDA — |
| js/sessionReport.js:223 | `📅 Date : ` | ligne texte | `report.txt.date` | Date: | Fecha: |
| js/sessionReport.js:225 | `📅 Période : ` (+ ` → `) | ligne texte | `report.txt.period` | Period: | Periodo: |
| js/sessionReport.js:227 | `🌍 Plan : ` | ligne texte | `report.txt.plan` | Map: | Plano: |
| js/sessionReport.js:228 | `👤 Auteur plan : ` | ligne texte | `report.txt.author` | Map author: | Autor del plano: |
| js/sessionReport.js:229 | `📱 App : MyKTAMap ` | ligne texte | `report.txt.app` | App: MyKTAMap | App: MyKTAMap |
| js/sessionReport.js:235 | `📍 POI ajoutés : ` | ligne texte | `report.txt.poi` | POI added: | POI añadidos: |
| js/sessionReport.js:245 | `🛣️ Tracés : ` | ligne texte | `report.txt.roads` | Paths: | Trazados: |
| js/sessionReport.js:245 | ` (toutes périodes — pas de timestamp natif)` | suffixe texte | `report.txt.allPeriodsNoTs` | (all periods — no native timestamp) | (todos los periodos — sin marca temporal) |
| js/sessionReport.js:251 | `   • Distance totale tracés : ` | ligne texte | `report.txt.roadsDist` | • Total path distance: | • Distancia total de trazados: |
| js/sessionReport.js:259 | `⬛ Zones : ` (+ ` (toutes périodes)`) | ligne texte | `report.txt.zones` / `report.txt.allPeriods` | Zones: / (all periods) | Zonas: / (todos los periodos) |
| js/sessionReport.js:269 | `🏛️ Structures : ` (+ ` (toutes périodes)`) | ligne texte | `report.txt.structures` | Structures: | Estructuras: |
| js/sessionReport.js:280 | `🧭 Tracker GPS :` | ligne texte | `report.txt.tracker` | GPS tracker: | Rastreador GPS: |
| js/sessionReport.js:281 | `   • Distance parcourue : ` | ligne texte | `report.txt.trackerDist` | • Distance traveled: | • Distancia recorrida: |
| js/sessionReport.js:282 | `   • Durée : ` | ligne texte | `report.txt.duration` | • Duration: | • Duración: |
| js/sessionReport.js:283 | `   • Points enregistrés : ` | ligne texte | `report.txt.trackerPts` | • Recorded points: | • Puntos registrados: |
| js/sessionReport.js:289 | `📸 Photos attachées : ` | ligne texte | `report.txt.photos` | Attached photos: | Fotos adjuntas: |
| js/sessionReport.js:295 | `📝 NOTE` | section texte | `report.txt.note` | NOTE | NOTA |
| js/sessionReport.js:302 | `Généré par MyKTAMap ` (+ ` — `) | pied texte | `report.txt.generatedBy` | Generated by MyKTAMap | Generado por MyKTAMap |
| js/sessionReport.js:594 | `Rapport de sortie` | titre PDF | `report.pdf.title` | Trip report | Informe de salida |
| js/sessionReport.js:600 | `Date : ` / `Periode : ` | ligne PDF | `report.pdf.date` / `report.pdf.period` | Date: / Period: | Fecha: / Periodo: |
| js/sessionReport.js:602 | `Auteur plan : ` | ligne PDF | `report.pdf.author` | Map author: | Autor del plano: |
| js/sessionReport.js:604 | `Genere par MyKTAMap ` (+ ` - `) | ligne PDF | `report.pdf.generatedBy` | Generated by MyKTAMap | Generado por MyKTAMap |
| js/sessionReport.js:618 | `Carte miniature : POI (ambre), traces (couleur par type), zones (transparent), heatmap tracker (rouge).` | légende PDF | `report.pdf.mapLegend` | Thumbnail map: POI (amber), paths (color by type), zones (transparent), tracker heatmap (red). | Mapa en miniatura: POI (ámbar), trazados (color por tipo), zonas (transparente), mapa de calor del rastreador (rojo). |
| js/sessionReport.js:630 | `Statistiques` | titre PDF | `report.pdf.stats` | Statistics | Estadísticas |
| js/sessionReport.js:634 | `POI ajoutes : ` | ligne PDF | `report.pdf.poi` | POI added: | POI añadidos: |
| js/sessionReport.js:644 | `Traces : ` (+ ` (toutes periodes)`) | ligne PDF | `report.pdf.roads` / `report.pdf.allPeriods` | Paths: / (all periods) | Trazados: / (todos los periodos) |
| js/sessionReport.js:647 | `    Distance totale : ` | ligne PDF | `report.pdf.totalDist` | Total distance: | Distancia total: |
| js/sessionReport.js:653 | `Zones : ` | ligne PDF | `report.pdf.zones` | Zones: | Zonas: |
| js/sessionReport.js:658 | `Structures : ` | ligne PDF | `report.pdf.structures` | Structures: | Estructuras: |
| js/sessionReport.js:665 | `Tracker GPS :` | ligne PDF | `report.pdf.tracker` | GPS tracker: | Rastreador GPS: |
| js/sessionReport.js:666 | `    Distance parcourue : ` | ligne PDF | `report.pdf.trackerDist` | Distance traveled: | Distancia recorrida: |
| js/sessionReport.js:667 | `    Duree : ` | ligne PDF | `report.pdf.duration` | Duration: | Duración: |
| js/sessionReport.js:668 | `    Points enregistres : ` | ligne PDF | `report.pdf.trackerPts` | Recorded points: | Puntos registrados: |
| js/sessionReport.js:673 | `Photos attachees : ` | ligne PDF | `report.pdf.photos` | Attached photos: | Fotos adjuntas: |
| js/sessionReport.js:682 | `Note` | titre PDF | `report.pdf.note` | Note | Nota |
| js/sessionReport.js:697 | `... - Rapport sortie - Page ` | pied PDF | `report.pdf.footer` | Trip report - Page | Informe de salida - Página |
| js/sessionReport.js:577 | `jsPDF indisponible (vérifie le chargement de la lib)` | Error (throw → catch L950 → `report.status_pdf_err` qui injecte `e.message`) | `report.err.jspdf` | PDF library unavailable. | Biblioteca PDF no disponible. |

**Note** : `_stripPourPdf` enlève les emojis pour jsPDF, donc seuls les libellés texte comptent. La sortie JSON (`_genererJSON`) utilise des clés techniques (`type:"devmap-report"`, etc.) = non user-facing. L577 transite par `report.status_pdf_err` (i18n) mais le `e.message` FR brut y est interpolé.

## js/sessionPersist.js
**0 gap.** `session.toast.storageFull` (L371) avec **fallback FR inline** = pattern i18n attendu, pas un gap. `Session restaurée`, `une surface n'est pas persistée`, etc. = commentaires.

## js/sessionBackups.js
**0 gap.** Toutes les erreurs affichées = `window.I18n.t("backup.*")`. `IndexedDB indisponible` (L67) = `new Error()` interne (reject jamais affiché verbatim — l'UI consomme via I18n). `auto`/`beforeunload`/`before-clear-session` = enums `reason`. `rien restauré` = commentaire.

## js/profileExportImport.js
**0 gap.** Module **entièrement migré** : 3 modales (export/import/done) en `T("profileio.*")`, tous les `alert()`/`confirm()`/toasts/labels de sections en i18n.

## js/interfaceImportExport.js

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| js/interfaceImportExport.js:287 | `Fermer` (`aria-label="Fermer"` du bouton ✕ modale choix import) | aria-label (lecteur d'écran) | `impexp.choix.closeAria` | Close | Cerrar |

**Note** : 1 seul gap mineur. Tout le reste (3 modales import GPX/choix/session, tous les `alert`, previews, toasts, drop labels, erreurs) = i18n. Incohérence isolée : les autres boutons ✕ du module utilisent une clé, celui-ci a gardé `"Fermer"` en dur. `telechargerSessionJSON` fallback écrit `type:"devmap-session"` (donnée, non user-facing).

## js/modeHistoire.js
**0 gap.** Module **entièrement migré** : modale 2 onglets, toolbar MD, placeholders, statuts, erreurs PDF, confirms = tous `window.I18n.t("histoire.*")`. `IndexedDB non supportée` (L62) = `new Error()` interne. `✏️ Éditer`/`👁 Aperçu`/`PDF session présent` (L320/328/562) = commentaires (les vrais boutons sont i18n).

## js/historyManager.js

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| js/historyManager.js:187 | `Action` (fallback label undo : `String(label \|\| "Action")`, affiché dans toast `↩ Annulé : Action`) | label de repli toast | `history.action.default` | Action | Acción |

**Note** : 1 gap mineur. Le préfixe du toast (`history.undone`/`redone`) est déjà i18n+fallback ✅ ; seul le **label de repli** quand l'appelant n'en passe pas reste FR. Les `↩ Annulé :`/`↪ Refait :` (L57/59) sont le fallback inline du dico FR dans `_t()` = pattern attendu, pas un gap.

## js/photos.js

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| js/photos.js:335 | `Espace de stockage saturé sur l'appareil. Supprime des photos ou libère de la place.` | message d'Error code `QUOTA_DEVICE` — atteint l'user via `editor.err.photoAdd` (editor.js L511 interpole `err.message`, car `QUOTA_DEVICE` n'est PAS dans le switch L507-510) | `editor.err.photoQuotaDevice` (+ câbler le code dans editor.js) | Device storage is full. Delete photos or free up space. | El almacenamiento del dispositivo está lleno. Elimina fotos o libera espacio. |

**Note** : 1 gap subtil. `addPhoto: planId/pointId requis` (L290), `srcBlob doit être un Blob` (L293) = erreurs **programmeur** (jamais en flux normal). `Maximum N photos par point (déjà N).` (L299, code `QUOTA_PER_POINT`) **N'est PAS un gap** : editor.js le re-mappe sur `editor.err.photoQuotaPoint` (i18n) avant affichage. Mais `QUOTA_DEVICE` tombe dans le `else` → message FR brut affiché. `Tout réinitialiser` (L610) = commentaire.

---

## Cas ambigus (NON comptés en gaps — décision à valider par KARMA)

Catégorie unique : **défauts FR écrits dans un `plan-config.json` / une annotation reconstruits à l'import** (kmzImport, gpxImport, gpxIO). Ils SONT user-visibles (nom de plan dans le header, label de dataLayer dans le FilterPanel, `nom`/`label` d'un POI/tracé sur la carte) MAIS ce sont des **valeurs de données persistées** dans une structure générée, pas des libellés d'UI rendus live — statut équivalent au `name` stocké d'un plan. Migrer impliquerait de figer la langue **au moment de l'import** (la donnée ne se re-traduit pas si l'user change de langue ensuite).

| fichier:ligne | chaîne | rôle | clé éventuelle si KARMA tranche « gap » |
|---|---|---|---|
| kmzImport.js:728 | `Plan importé KMZ` | nom de plan (header) | `kmz.import.planNameDefault` |
| kmzImport.js:869 | `Annotations importées (KMZ)` | label dataLayer (FilterPanel) | `kmz.import.layerLabel` |
| gpxImport.js:310 | `Plan importé GPX` | nom de plan | `gpx.import.planNameDefault` |
| gpxImport.js:394 | `Annotations importées (GPX)` | label dataLayer | `gpx.import.layerLabel` |
| gpxImport.js:312 / kmzImport.js:730 | `Import GPX` / `Import KMZ` | champ `author` du plan | `gpx.import.authorDefault` / `kmz.import.authorDefault` |
| gpxImport.js:215 | `(Tracé GPX)` | fallback `label` de tracé | `gpx.import.trackLabelDefault` |
| gpxIO.js:477 | `(Point importé GPX)` | fallback `nom` de POI | `gpx.import.pointNameDefault` |
| gpxIO.js:518 | `(Tracé importé GPX)` | fallback `label` de tracé | `gpx.import.trackImportedDefault` |

**Reco** : traiter ces défauts au **rendu** (afficher une clé i18n quand `name`/`label` vaut la valeur sentinelle) plutôt qu'à l'écriture — sinon dette « langue figée à l'import ». Si trop coûteux, les laisser en FR est acceptable (donnée). À trancher.

---

## Bilan

- **Vrais gaps comptés** : 41
  - sessionReport.js : **37** (contenu Texte + PDF des rapports lus/partagés par l'user)
  - pdfExport.js : **2** (messages d'Error affichés en modale)
  - interfaceImportExport.js : **1** (`aria-label="Fermer"`)
  - historyManager.js : **1** (label de repli `"Action"`)
  - photos.js : **1** (message `QUOTA_DEVICE` qui fuit vers l'UI)
  *(En regroupant les paires de la table sessionReport — ex. L245 deux entrées, L259/269/600/644 suffixes « toutes périodes » — sur le périmètre strict des lignes signalées. Décompte par ligne de table ci-dessus.)*

- **Écartés (non-gaps)** : la très large majorité des 804 candidats heuristiques du périmètre, dont :
  - **Labels d'export = donnée** : tout kmzExport.js (KML), les `<desc>` GPX (gpxIO.js), la session anonymisée (sessionExporter.js) → **~40+ candidats** de contenu de fichier tiers/partagé, par construction non traduisibles (fixes pour l'outil lecteur).
  - Commentaires (la majorité des hits — heuristique imparfaite sur fragments de commentaires multi-lignes), logs, Errors internes jamais affichées verbatim, fallbacks i18n inline (pattern attendu), enums/ids sérialisés.
  - Modules **déjà 100% migrés** : exporter, sessionExporter, profileExportImport, modeHistoire, sessionBackups, sessionPersist (+ quasi-totalité d'interfaceImportExport).

- **Cas ambigus** : **8** (défauts FR écrits dans les plan-config/annotations à l'import — voir table dédiée ; à trancher par KARMA, reco = traiter au rendu ou laisser en donnée).

**TOTAL vrais gaps : 41**

---

# Audit i18n — chaînes FR USER-FACING codées en dur (groupe G6)

> Périmètre : `legendCustomization.js`, `interfaceLegende.js`, `editor.js`, `createConf.js`,
> `structures.js`, `measure.js`, `northPicker.js`, `imageLayerCalibration.js`, `heatmap.js`, `tracking.js`.
> Méthode : `node scripts/find-hardcoded-fr.js --full` (heuristique accents) + 2 scans complémentaires
> (fragments backtick hors commentaires + prose FR **sans accent**), puis tri manuel en lisant le code.
> Date : 2026-06-13.

**Constat global** : ces 10 fichiers sont déjà très largement migrés (createConf 425 `I18n.t`, heatmap 41,
editor 38, legendCustomization 41, north 12, structures 11, measure 5). La quasi-totalité des candidats du
détecteur sont des **commentaires**, des **`console.*`**, des **`new Error(...)`** non affichés, ou des
**libellés built-in de tag moteur** (donnée, déjà résolus via i18n au rendu avec le FR en simple fallback).

---

## js/createConf.js

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| createConf.js:1166 | `"Aucun fichier"` | label (textContent reset upload) | `gen.upload.aucunFichier` *(existe déjà FR/EN/ES)* | No file | Ningún archivo |

**Détail** : au reset d'un champ fichier, `nom.textContent = "Aucun fichier"` est écrit en FR brut, alors
que **tous les autres points d'écriture du même placeholder** (L263, L270, L504, L1019, L1135, L1408, L1622)
utilisent `window.I18n.t("gen.upload.aucunFichier")`. En session EN/ES, le placeholder repasse en français
après reset. **Fix trivial** : remplacer par `window.I18n.t("gen.upload.aucunFichier")` (clé déjà traduite,
rien à ajouter aux dicos).

> ⚠️ **Bug latent corrélé (hors périmètre « rendu », non compté)** : les comparaisons sentinelles
> `collNom !== "Aucun fichier"` (L2566) et `nomTxt !== "Aucun fichier"` (L2596) testent la valeur **affichée**
> contre le FR brut. En session EN/ES, `textContent` vaut « No file »/« Ningún archivo » → la sentinelle ne
> matche plus et la logique de conservation d'asset (mode Modifier) casse. Ce n'est pas une chaîne *affichée*
> (donc pas un gap i18n d'affichage), mais c'est la **même cause racine** : un placeholder localisé sert aussi
> de marqueur d'état. Reco : comparer sur un état/booléen plutôt que sur le texte, ou normaliser via la clé.

---

## js/legendCustomization.js
Aucun gap. Constantes `DEFAULT_LABELS`, `DEFAULT_RENDERS`, `CATEGORY_TITLES` = **données / fallback** : toute
sortie UI passe par `I18n.t` (titres via `legend.cat.<cat>` derrière `I18n.has`, alerts/confirm/placeholders
via `legend.add.*` / `legend.editor.*`).

## js/interfaceLegende.js
Aucun gap. `LEGENDE_LABELS` = fallback FR des **libellés built-in de tag** (résolus au rendu via
`legendui.label.<key>` dans `_label`). Tous les titres de sections/groupes et le bouton Modifier sont en
`legendui.*`.

## js/editor.js
Aucun gap. `EDITOR_TAG_LABELS` n'est qu'un **test de présence** ; le libellé rendu vient de
`window.I18n.t("editor.tag." + tag)` (L107). Le FR de la constante n'est jamais affiché.

## js/structures.js
Aucun gap. Popups (`struct.popup.*`), libellés (`struct.label.*`) et entrées d'historique (`struct.undo.*`)
tous via `I18n.t`. Les 2 candidats du détecteur (L102, L523) sont des commentaires.

## js/measure.js
Aucun gap. Labels et hints du contrôle de mesure via `measure.label.*` / `measure.hint.*` (L283, L291, L299,
L301). Les candidats du scan sont des **classes CSS** et emojis. L'unique hit accentué (L238) est un commentaire.

## js/northPicker.js
Aucun gap. Étapes, erreurs et boutons via `north.step.*` / `north.err.*` / `north.btn.*`. Les 2 candidats
(L174, L216) sont des commentaires.

## js/imageLayerCalibration.js
Aucun gap. **Ce fichier ne rend aucune UI** (0 `innerHTML`/`toast`/`alert`) — l'UI du picker vit dans
`imageLayerCalibrationPicker.js` (hors périmètre, qui consomme les clés `imgcal.*`). L'unique littéral accentué
(L292) est un message d'**`Error`** (`new Error("Échec chargement image : " + url)`) passé à `reject()` →
non affiché tel quel (cohérent avec le traitement des autres `Error` du repo).

## js/heatmap.js
Aucun gap. Modale, sections, toasts et compteurs via `heatmap.*` (41 appels). Tous les candidats du détecteur
sont des commentaires (dont des notes de specs FR).

## js/tracking.js
Aucun gap. **Module purement logique** (tracker/heading/géométrie : markers, polylines, maths) — **aucune
sortie user-facing** (0 `innerHTML`/`toast`/`alert`/`title`). Tous ses littéraux accentués sont des
commentaires ou des `console.*` (logs nombreux, comme annoncé).

---

TOTAL vrais gaps : 1

---

# Audit i18n — chaînes FR USER-FACING codées en dur (groupe G7)

> Périmètre : `js/pinLock.js`, `js/incognitoMode.js`, `js/unlockGate.js`, `js/planDenylist.js`, `js/networkAudit.js`, `js/swInspector.js`, `js/memInspector.js`, `js/updateChecker.js`, `js/alertChecker.js`, `js/proLicense.js`, `js/osmView.js`, `js/osmHomePreview.js`, `js/osmTilesCache.js`, `js/searchPoints.js`, `js/statsGlobales.js`, `js/planRegistry.js`, `js/trackerReplay.js`, `js/userProfile.js`, `js/mdParser.js`
>
> Méthode : lecture intégrale des 19 fichiers. On signale UNIQUEMENT le FR affiché à l'user (toast, alert, modale, label, error renvoyée et montrée) construit en JS sans `I18n.t()`. On ignore : commentaires, `console.*`, enums/statuts sérialisés, clés i18n, FR déjà migré via `t()`, chaînes de diagnostic réseau non affichées.

---

## js/proLicense.js

Erreurs de `_validateData` (return `{ ok:false, error }`) et `_importFile` (resolve `{ ok:false, error }`). Affichées à l'user via :
- `index.html:3616` → `window.alert("Import refusé : " + msg)` (import licence depuis Mon profil)
- `unlockGate.js:365` → `t("gate.licence.refused", { msg })` (import licence depuis l'écran de verrouillage)

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| proLicense.js:113 | Fichier vide ou format invalide. | error renvoyée+affichée | `license.err.emptyOrInvalid` | Empty file or invalid format. | Archivo vacío o formato no válido. |
| proLicense.js:115 | Champ "instance" doit valoir "pro". | error renvoyée+affichée | `license.err.instanceNotPro` | Field "instance" must be "pro". | El campo "instance" debe ser "pro". |
| proLicense.js:119 | Champ "license_hash" manquant. Format attendu : MKTM-LIC-<32 hex>. | error renvoyée+affichée | `license.err.hashMissing` | Missing "license_hash" field. Expected format: MKTM-LIC-<32 hex>. | Falta el campo "license_hash". Formato esperado: MKTM-LIC-<32 hex>. |
| proLicense.js:122 | Format de license_hash invalide. Attendu : MKTM-LIC-<32 hex>. | error renvoyée+affichée | `license.err.hashInvalid` | Invalid license_hash format. Expected: MKTM-LIC-<32 hex>. | Formato de license_hash no válido. Esperado: MKTM-LIC-<32 hex>. |
| proLicense.js:268 | Aucun fichier fourni. | error renvoyée+affichée | `license.err.noFile` | No file provided. | No se proporcionó ningún archivo. |
| proLicense.js:273 | Fichier trop volumineux (max 50 Ko). | error renvoyée+affichée | `license.err.tooLarge` | File too large (max 50 KB). | Archivo demasiado grande (máx. 50 KB). |
| proLicense.js:283 | Lecture du fichier impossible. | error renvoyée+affichée | `license.err.readImpossible` | Could not read the file. | No se pudo leer el archivo. |
| proLicense.js:290 | JSON invalide : `<msg>` | error renvoyée+affichée | `license.err.jsonInvalid` | Invalid JSON: {msg} | JSON no válido: {msg} |
| proLicense.js:304 | Erreur de lecture du fichier. | error renvoyée+affichée | `license.err.readError` | File read error. | Error de lectura del archivo. |

---

## js/planRegistry.js

### `importFromFile` — erreurs `throw new Error(...)` remontées au catch de l'appelant (modale import liste de plans, home loader)

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| planRegistry.js:304 | Aucun fichier fourni | error throw+affichée | `planreg.err.noFile` | No file provided | No se proporcionó ningún archivo |
| planRegistry.js:308 | Fichier JSON invalide | error throw+affichée | `planreg.err.jsonInvalid` | Invalid JSON file | Archivo JSON no válido |
| planRegistry.js:311 | Ce fichier n'est pas une liste de plans MyKTAMap | error throw+affichée | `planreg.err.notPlanList` | This file is not a MyKTAMap plan list | Este archivo no es una lista de planos MyKTAMap |
| planRegistry.js:314 | Format de liste invalide (champ 'plans' manquant) | error throw+affichée | `planreg.err.badListFormat` | Invalid list format ('plans' field missing) | Formato de lista no válido (falta el campo 'plans') |

### `statsImport` — erreurs `return { ok:false, error }` affichées via `index.html:2684` (`setStatus("Erreur : " + stats.error)`)

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| planRegistry.js:340 | JSON invalide | error renvoyée+affichée | `planreg.err.jsonInvalidShort` | Invalid JSON | JSON no válido |
| planRegistry.js:342 | Pas une liste MyKTAMap | error renvoyée+affichée | `planreg.err.notMktmList` | Not a MyKTAMap list | No es una lista MyKTAMap |

### `saveBlob` — erreurs `return { ok:false, error }` affichées via `main.js:983` (`t("main.rememberFailed", { msg: result.error })`, status loader orange)

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| planRegistry.js:441 | Aucun fichier | error renvoyée+affichée | `planreg.err.noFileShort` | No file | Ningún archivo |
| planRegistry.js:443 | IndexedDB indisponible | error renvoyée+affichée | `planreg.err.idbUnavailable` | IndexedDB unavailable | IndexedDB no disponible |
| planRegistry.js:451 | Erreur IDB | error renvoyée+affichée | `planreg.err.idbError` | IDB error | Error de IDB |
| planRegistry.js:457 | Quota dépassé — l'espace de stockage du navigateur est plein | error renvoyée+affichée | `planreg.err.quotaExceeded` | Quota exceeded — the browser storage is full | Cuota superada — el almacenamiento del navegador está lleno |
| planRegistry.js:459 | Stockage refusé | error renvoyée+affichée | `planreg.err.storageRefused` | Storage refused | Almacenamiento rechazado |
| planRegistry.js:463 | Erreur inattendue | error renvoyée+affichée | `planreg.err.unexpected` | Unexpected error | Error inesperado |

---

## js/userProfile.js

Résidu FR : les autres erreurs du module passent par `t("profile.err.*")`, seule celle-ci reste en dur. Affichée via `index.html:3342` → `alert("Échec upload photo : " + (e.message || e))` (upload avatar dans Détails du profil).

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| userProfile.js:306 | Aucune image fournie | error throw+affichée | `profile.err.noImage` | No image provided | No se proporcionó ninguna imagen |

---

## js/networkAudit.js

`WHITELIST_HUMAN` est exposé via `window.NetworkAudit.WHITELIST_HUMAN` et **affiché dans la modale doc « 📖 Que fait l'app sur le réseau ? »** (cf. en-tête : « Descriptions human-readable (affichées dans la modale doc audit) »). Ce sont des descriptions FR codées en dur. (Les messages `throw new Error("[NetworkAudit] Bloqué par...")` aux lignes 254/301/364/399 sont écartés : diagnostic réseau non affiché en clair à l'user — voir section « écartés ».)

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| networkAudit.js:122-125 | Même origine — l'app elle-même servie depuis `<origin>` (inclut le ping santé serveur `<origin>/ping.html`, body attendu "OK", utilisé avant Force update / Reset pour vérifier DNS / SSL / Nginx en un seul appel) | label modale doc | `netaudit.whitelist.sameOrigin` | Same origin — the app itself served from {origin} (includes the server health ping {origin}/ping.html, expected body "OK", used before Force update / Reset to check DNS / SSL / Nginx in a single call) | Mismo origen — la propia app servida desde {origin} (incluye el ping de salud del servidor {origin}/ping.html, cuerpo esperado "OK", usado antes de Forzar actualización / Reinicio para verificar DNS / SSL / Nginx en una sola llamada) |
| networkAudit.js:126 | blob: URLs (références locales au navigateur — utilisées par le tiling V2 pour servir les tuiles d'image depuis le ZIP en mémoire ; aucune fuite réseau possible) | label modale doc | `netaudit.whitelist.blob` | blob: URLs (browser-local references — used by V2 tiling to serve image tiles from the in-memory ZIP; no possible network leak) | URLs blob: (referencias locales al navegador — usadas por el teselado V2 para servir teselas de imagen desde el ZIP en memoria; sin fuga de red posible) |
| networkAudit.js:127 | data: URLs (base64 inline — icônes SVG embarquées dans le code, exports image ; aucune fuite réseau possible) | label modale doc | `netaudit.whitelist.data` | data: URLs (inline base64 — SVG icons embedded in the code, image exports; no possible network leak) | URLs data: (base64 en línea — iconos SVG incrustados en el código, exportaciones de imagen; sin fuga de red posible) |

---

## js/statsGlobales.js

| fichier:ligne | chaîne FR | type | clé proposée | EN | ES |
|---|---|---|---|---|---|
| statsGlobales.js:412 | (sans nom) | fallback nom de plan affiché (header modale `_renderHtml` + rapports) | `stats.plan.noName` | (no name) | (sin nombre) |

> Note : `"Plan"` (lignes 1119, 1185) et `"Plan"` (trackerReplay.js:602) sont des fallbacks de **nom de fichier** (slugifiés `[^a-zA-Z0-9_-]`), pas du texte d'UI → écartés.

---

## Fichiers SANS gap (entièrement migrés ou hors-scope)

- **js/pinLock.js** — entièrement migré (`pin.*`). Seul FR restant : `displayName: "Utilisateur MyKTAMap"` (l.220) = champ WebAuthn interne jamais affiché dans l'UI app → écarté.
- **js/incognitoMode.js** — migré (`incognito.*`), avec fallback FR explicite et documenté pour le badge (`_t("incognito.badge.label", "🕵️ INCOGNITO")`, l.415-416) car injecté avant que I18n soit prêt → comportement voulu, pas un gap.
- **js/unlockGate.js** — entièrement migré (`gate.*`).
- **js/planDenylist.js** — entièrement migré (`denylist.*`).
- **js/swInspector.js** — entièrement migré (`swinsp.*` via `_t`).
- **js/memInspector.js** — entièrement migré (`meminsp.*` via `_t`). Les `result.error` techniques (« Cache API non supportée… », « Module CrashReports non chargé »…) sont des messages de diagnostic affichés dans le rapport — cas limite, voir « ambigus ».
- **js/updateChecker.js** — entièrement migré ; modales déléguées à `interface.js`, reste = `console.*`.
- **js/alertChecker.js** — clean ; tout l'affichage est délégué aux handlers `interface.js`, reste = `console.*`.
- **js/osmView.js** — entièrement migré (`osm.*`).
- **js/osmHomePreview.js** — entièrement migré (`osm_home.*`), avec attente explicite d'`I18n.init()` avant le 1er `mount()` (l.1563-1566).
- **js/osmTilesCache.js** — aucune chaîne user-facing (logique IDB pure ; reste = `console.*`).
- **js/searchPoints.js** — entièrement migré (`search.*`).
- **js/trackerReplay.js** — entièrement migré (`replay.*`).
- **js/mdParser.js** — aucune chaîne user-facing (parser pur).

---

## Cas ÉCARTÉS (vus mais NON comptés)

- **networkAudit.js** l.254, 301, 364, 399 — `throw new Error("[NetworkAudit] … bloqué par le mode hors-ligne strict : <url>")` : message de **diagnostic réseau** rejeté comme raison d'un fetch/XHR/WS bloqué. Préfixé `[NetworkAudit]`, contient une URL technique, pas affiché en clair dans l'UI (consommé par le code appelant qui catch). → écarté par la consigne « chaîne purement technique de diagnostic réseau non affichée ».
- **pinLock.js** l.220 `"Utilisateur MyKTAMap"` (+ `"myktamap-user"`) — `user.displayName`/`user.name` WebAuthn : métadonnée passée à `navigator.credentials.create`, non rendue dans le DOM de l'app. → écarté.
- **planRegistry.js / statsGlobales.js / trackerReplay.js** — fallbacks `"Plan"` pour les **noms de fichier d'export** (slugifiés) → identifiant technique, pas du texte d'UI. → écarté.
- **statsGlobales.js / memInspector.js** — toutes les chaînes `console.*`, en-têtes ASCII de rapport (`====`, `─────`), unités (`px/m`, `m²`, `ha`), et clés CSV (`source`, `nb_points`, `distance_m`…) = identifiants sérialisés non traduisibles. → écarté.
- **proLicense.js** l.125, 127 — `console.warn` (mode dégradé licence) → écarté (log console).

## Cas AMBIGUS (jugement requis par KARMA)

1. **memInspector.js — messages d'erreur de collecte** (l.133, 199, 237, 347, et `scanError`/`error` rendus dans `_renderReport` via `_escapeHtml`). Ex. l.199 « Cache API non supportée par ce navigateur », l.347 « Module CrashReports non chargé », l.133 « indexedDB.databases() non supporté ou bloqué : … ». **Techniquement affichés** à l'user dans la modale Inspecteur mémoire (sections en `⚠️`), donc user-facing FR en dur. Mais ce sont des diagnostics techniques d'environnement (rares, dev-oriented). **Non comptés** dans le total : à la frontière entre « diagnostic technique » (écarté) et « message affiché » (gap). Si KARMA veut une couverture i18n 100 %, en faire ~5-6 clés `meminsp.collect.err.*`.

2. **statsGlobales.js:412 `"(sans nom)"`** — compté (1), mais c'est un fallback d'edge-case (plan sans champ `name`). Faible visibilité réelle.

---

**TOTAL vrais gaps : 26**

- Détail : proLicense (9) + planRegistry (12 : import 4 + statsImport 2 + saveBlob 6) + userProfile (1) + networkAudit (3) + statsGlobales (1) = 26.
- Écartés : ~5 catégories (diagnostic réseau `[NetworkAudit]`, métadonnées WebAuthn, fallbacks noms de fichier, logs console, en-têtes/unités/clés sérialisées).
- Ambigus (non comptés) : 1 bloc (≈5-6 messages d'erreur de diagnostic `memInspector`).

---
