# 📗 MyKTAMap — User Guide

> This guide is intended for application users. It explains how to use each function, how to prepare your phone for a field trip, and outlines the essential rules regarding data discretion.

---

## 🔴 Important warnings

### ⚖️ Terms of use & legal notice

On **first launch**, a **terms of use** page reminds you that MyKTAMap is a **mapping and orientation tool**, not an encouragement to enter forbidden places. It must be **read and accepted once** (checkbox + "I accept").

- Access to many underground sites — notably the **former quarry network of Paris** — is **forbidden** (Paris prefectural order of 2 November 1955) and **punishable by a fine** (€135 to €375).
- Any intrusion into a private or forbidden place is **your sole responsibility**.
- The **full text** (order of 2 November 1955 + French Senate written reply no. 03710 of 05/06/2025) is available from the page — reproduced in French only, as they are French official acts — and at any time via the **⚖️ Terms of use** link in the home footer.

> Clandestine exploration is dangerous (getting lost, collapses, falls into pits) and illegal. Respect the law, site owners and your own safety.

---

### 🔐 Data confidentiality — read this first

MyKTAMap is a field mapping tool that may contain sensitive information: **precise location of entrances, shafts, passages, underground structures.**

If these data were made public, it could:

- Make it easier for unprepared people to access dangerous places
- Cause overcrowding that damages these fragile spaces
- Expose users to legal proceedings
- Endanger ill-equipped people

**Rules that must absolutely be respected:**

- Never share data files (`data/*.json`) outside your trusted group
- Never publish screenshots showing coordinates or precise locations
- Never leave the application open and visible on a device accessible to third parties

> These places belong to their history. Their preservation depends on the discretion of those who visit them.

---

### ⚠️ Position tracker warning

The simulated movement module is **experimental**. It relies on the phone's inertial sensors (accelerometer + gyroscope) to estimate your position without GPS — a technique called **PDR (Pedestrian Dead Reckoning)**.

**Limits to know before use:**

- Drift accumulates over time: the more you walk, the more the error grows
- Accuracy varies greatly depending on the phones and how the device is held
- Altitude changes (stairs, ladders, shafts) are not taken into account
- The tracker **does not replace** a physical compass, an Ariadne thread or a paper map
- Underground, never trust your phone alone to locate yourself

**The tracker is a visual aid, not a reliable navigation system.**

Always use **manual recalibration** (📍 button) as soon as you identify a known landmark on the map.

**For any underground trip, always bring:**
- A paper map or a printed version of the map
- A physical compass
- A headlamp with spare batteries

---

### 🚨 Public alerts (real-time broadcast)

The application supports a **public alerts** system broadcast by the author to the community in case of a risky situation (fire in cataphily, access closure, toxic gases, etc.).

**How it appears**:

- When launching the app (after the splash), if an alert is active on the server side, a **pulsing red modal** is displayed with title, main message and list of instructions.
- **Levels**:
  - 🚨 **emergency** (pulsing red + flashing `!`) — critical situation, must be read
  - ⚠️ **warning** (orange) — important info, attention required
  - ℹ️ **info** (blue) — neutral announcement, simple notification
- **Acknowledgment**: clicking **"Got it"** stores the confirmation in your browser. The modal will no longer reappear as long as the alert remains the same.
- **If a new alert is published** (or the same one is re-edited by the author), it will automatically reappear on the next reload.

**Multi-alerts**: several alerts can coexist (e.g.: domain migration alert + occasional fire alert). They are displayed in cascade at launch (priority: emergency → warning → info, most recent first). Each one is acknowledged individually with its own "Got it" button.

**🚨 button in the loader** (to the left of 📖 Documentation) — **dynamic color according to the max active level**:

| State | 🚨 badge appearance |
|---|---|
| At least 1 unacknowledged `emergency` alert | 🚨 **pulsing red** |
| Otherwise, at least 1 `warning` | 🚨 **orange** |
| Otherwise, only `info` | 🚨 **discreet blue** |
| No active alert | 🚨 **neutral gray** |

**Counter pellet**: if several unacknowledged alerts coexist, a small red circle with the number appears at the top right of the badge.

When clicked, the 🚨 button forces the re-display of ALL active alerts in cascade (even those already acknowledged):

| Server state | Displayed modal |
|---|---|
| Active alerts | Cascade of alerts sorted by priority |
| No active alert | **Sober green modal** "✅ No alerts currently" |
| Offline | Neutral modal "📡 Verification impossible — try again with network" |

> 💡 If you still see the alert in memory after several days but want to check the official status, click 🚨 — you'll immediately know if the situation is still relevant or if it has been resolved.

> ⚠️ This system is intended for alerts **important for community safety**. It is not used for commercial or promotional messages.

### 🛡️ Revoked plans (anti-leak kill-switch)

If a plan ZIP **leaks massively** (= it's been distributed outside its trusted group — public Telegram, forum, warez site…), the author can **revoke** it: its fingerprint is added to a public server-side list (`denylist.json`). The application will then automatically refuse to open it for **all users**.

**What happens if you download a revoked plan by mistake**:

1. You import the ZIP into the app (main loader OR generator "Modify existing plan")
2. **Before** opening the ZIP, the app computes its **SHA-256 fingerprint** (locally, on your device)
3. If the fingerprint matches a revoked plan, a **red blocking modal** appears:
   - Title: "⛔ Plan revoked"
   - **Reason**: text given by the author (e.g., "Public leak observed on 05/06/2026 on Telegram")
   - **Date added** to the blocklist
   - **SHA-256 fingerprint** (first 12 + last 8 chars, anti-doxxing)
   - "Got it, delete this plan" button → the plan is automatically removed from your list, the page reloads
4. The plan **is never opened** on your device

**Strict privacy**:
- ✅ **No fingerprint is sent to the server**. Only the public list of revoked plans is downloaded, and comparison happens 100% on your device.
- ✅ The author doesn't know which plans you own (= zero tracking).
- ✅ The `denylist.json` list is public: you can audit it yourself at `https://myktamap.fr/denylist.json` (same for pro instances).

**Cache & propagation**:
- The revocation list is refreshed at app boot then cached for 24h.
- For urgent additions by the author, propagation is **immediate** for users reopening the app, max 24h for others.
- When **offline**, the app uses the last known list (= mechanism stays active offline).

**Assumed limitation**: only **byte-perfect** leaks are blocked (= the exact ZIP). If an attacker re-packs the ZIP with another tool or modifies 1 byte, the fingerprint changes. This is enough to block **accidental redistribution** of a circulating ZIP, but not an intentional active derivation (= acceptable max friction).

> 💡 **For plan authors who want to revoke a ZIP**: contact KARMA (app author) with your ZIP's SHA-256 fingerprint (command: `sha256sum your-plan.zip`) + a short reason. Revocation is applied server-side within a few days.

#### 🔄 Automatic boot audit

If a plan **you have already imported** is revoked by the author AFTER your import (between 2 sessions), the app detects it automatically at next startup:

- ~2 seconds after boot, in the background, the app computes the SHA-256 fingerprint of each of your local plans and compares against the public list
- If a match → plan is **automatically removed** from your list
- An **orange modal** appears listing the revoked plans (name + reason + date + truncated fingerprint) + "Got it" button
- The fingerprint is cached in your plan list → next boots are near-instant (no re-calc)

> ✅ **Privacy**: everything stays local, like at import. No fingerprint is ever sent to the server.


---

## 🚀 Getting started

### 🗝️ Restricted access — Community code

The application is protected by a **single shared password** for all authorized users. The code will be communicated to you by the author (forum, direct message, etc.).

> 🌍 At the top of this screen, a **FR · EN · ES** selector lets you pick your language **from the very first launch** (pre-selected from your browser's) — the screen translates immediately and the whole app follows, tutorial included.

**On first installation** (or after a complete reset):
1. The splash displays normally (3.5 seconds)
2. A **🗝️ Restricted access** screen appears with an input field
3. Enter the code → click **🔓 Unlock**
4. If correct → the app loads normally and you don't need to re-enter it
5. If incorrect → red message, you have 4 remaining attempts

**Before doing a complete reset**: the confirmation modal displays the code in clear so you can re-enter it at the next startup. **Note it down or copy it before clicking "Reset"**, otherwise you won't be able to log in again.

> 🛡️ **Security level**: this is a **community barrier**, not real authentication. The app's source code is public on GitHub. This gate is used to discourage passers-by and frame a circle of informed users, not to protect sensitive data.

### 📱 Install the application on Mobile (iPhone/Android)

MyKTAMap can be installed as a native application on Mobile — without going through the App Store/Play Store:

1. Open `myktamap.fr` in **chrome/safari**
2. Tap the share button ↑ at the bottom of the screen
3. Select **"Add to Home Screen"**
4. Confirm — an icon appears on your home screen
5. Always launch the application from this icon

> The application thus runs in full screen mode, without the browser bar.

### 📥 Install the application on PC

MyKTAMap can also be installed as a native application on PC — without installing an executable.

1. Open `myktamap.fr` in **chrome**
2. Click the "Install" button next to the URL
3. Confirm — an icon appears on your desktop
4. Always launch the application from this icon


### 🎬 Startup animation

When the application launches (PWA app opening, page refresh, first access), a **welcome animation** is displayed for about 3.5 seconds:

- MyKTAMap **logo** (yellow compass rose)
- **Title** and subtitle
- Golden **loading bar**
- **Author signature** and license mention

This animation **only appears once per session**. If you change maps via 🗂️ or ▶️ Resume, it will not be re-displayed — you stay in your active session.

> To see it again, close the application then relaunch it from your home icon (PWA) or refresh the page (F5 on PC).

### 📦 Load a map

At startup, the application displays a **home screen** that groups together:

- **▶️ Resume [name]** — relaunches the last used map in 1 click.
- **📚 My maps** — the list of all maps you have already loaded (server or local ZIP), sorted from most recently opened to oldest. Available server maps are **auto-discovered** at startup and appear here.
- **📦 Load a new map** — to add a ZIP to your list.
- **🏗️ Generate a map** — opens the map generator from scratch.

**Three ways to add a map:**

1. **Import a local ZIP** — drag and drop your archive onto the designated area, or click to select it. Then click **Load the map**. The map is automatically added to your list for next time.
2. **Click on a known map** — in **📚 My maps**, a click directly relaunches an already opened map (🌐 server or 💾 local).
3. **🏗️ Generate a map** — dedicated button on the home page to create a map from scratch.

> 🔄 **Re-importing a map you regenerated* — if the ZIP you import has the **same name and same author** as a map already in your list but a **different version**, the app asks instead of stacking a duplicate:
> - **🔄 Update** — the existing entry is replaced (name, version, size, stored archive). Your **session, notes and inter-map links are kept**. Photos are only replaced if the new ZIP contains some.
> - **➕ Keep both** — both versions live side by side in the list.
> - **Cancel** (or ✕ / Escape / click outside) — nothing is touched. This is always the default: no accidental overwrite.
>
> Good to know: a ZIP with **exactly the same name AND version** updates the existing entry without asking. No question either for server maps, or when you re-select the file of a specific map from your list.

### 🗺️ Convert a GIS file (QGIS…) into a map
Got data in a GIS package you want to use in MyKTAMap? Drop your export **straight onto the "📦 Load a new map" area of the home screen** — the same one you already use for ZIPs: the app recognises the format and opens **"Convert from GIS"**. It also works from the **🏗️ Generator** import area.

**Accepted formats**: `.geojson`, `.json`, `.kml`, `.kmz` (vector). Points, paths and zones are imported.

**No map image needed**: if all you have is vector data, the app **generates a blank background automatically aligned** on your file's coordinates — your annotations land in the right place. You can replace that background with a real image later via 🏗️ **Edit a map**.

**Your own naming is respected.** A GIS file has its own vocabulary (`CANALISATION`, `galerie_tech`, `ZH`…). A **mapping screen** lets you pick the column holding the type, then say what each value means in MyKTAMap. Obvious values are pre-filled — check them, nothing is forced. Listed values are **split by family**: those found on polygons offer zone types, never path types.

> ⚠️ **Your file must use standard GPS coordinates (WGS84 / EPSG:4326).** In QGIS: *Export → Save Features As…* then pick **EPSG:4326** in the CRS field.

> 📐 **Lambert 93 converted automatically* — if your QGIS export uses **Lambert 93** (EPSG:2154, the official French system: coordinates in **metres** such as 650000 / 6860000, not degrees), the app **recognises and converts** it on its own. A banner tells you how many coordinates were reprojected: check that the resulting position matches your site before continuing. **Other** projections (UTM, Web Mercator…) are still rejected — re-export from QGIS as **EPSG:4326 (WGS84)** in that case.

> 🗺️ **Quarry surveys: what the import can do**
> 
> - **One level per floor.** If your file has a level column (`niveau`, `level`, `etage`…), pick it under “Level column”: every object keeps its floor, and a preview shows you the breakdown **before** generating. Tick “One colour per level” so each floor gets its own shade — without it, six stacked floors blend together. You can **rename and recolour** each level with the 🏷️ button without leaving the screen. Everything you change there is **kept in the generated plan** — including types you rename, hide, recolour or add yourself. ⚠️ If the screen says the legend has been reset, a change in the mapping has invalidated your names: reopen 🏷️ before generating.
> - **Every type goes where you want.** An object's shape in the file does not say what it is: a polygon may be a zone, a pillar, a wall — or a **working face**, if whoever drew it closed the outline. Each value can target any family in the dropdown.
> - **The plan's height is computed**, you only give the width. That is what keeps the plan inside the frame: with free proportions, content overflowed. Past a certain size a warning appears (possible empty background on iPhone, or heavy generation) — it is **advice**, not a block.
> 
> ⚠️ **If you created a plan from a GPX or SIG file with an older version of the app**: its **scale was wrong** (a fixed value unrelated to the terrain), and so were the distances measured on it. Regenerate it from the source file to get correct measurements. Plans built from a scanned image are unaffected.


>
> A file in **another** projection (UTM, Web Mercator…) will be **refused**, with the number of offending coordinates and what to do. This is deliberate: silently accepting coordinates we cannot interpret would place your site thousands of kilometres away, without the slightest warning. *(Lambert 93 itself is recognised and converted — see just above.)*

**Good to know**: polygon holes (inner rings) are ignored — MyKTAMap has no zone with holes. Beyond 20,000 objects the import is refused: filter your layer in QGIS before exporting.

*Not supported*: Shapefile and GeoPackage. They would require heavy libraries, incompatible with the "100% offline, no install" promise. Re-export as GeoJSON from QGIS, it's two clicks.

### 👤 User profile

A **profile banner** is displayed at the top of the home screen, just below the header. It groups your visual identity and configurable statistics on your use of the app.

**What you see on the banner**:

- **Avatar**: personal photo (square, ~64 px) OR colored auto-generated initial if no photo. The color of the initial is chosen deterministically from a palette of 10 colors of the chart — your avatar therefore remains visually stable from one session to the next as long as you do not change your nickname.
- **Nickname**: your alias (editable). Default "Cataphile" on first launch.
- **🏅 Rank**: a **badge** (from *Tourist* to *Grandmaster*) computed from your **time spent** in the app, the **number of maps** explored and the **km of gallery** mapped. It shows as a **colored ring** around the photo + a **medal** in the corner + the **rank name under your nickname**. The breakdown (the 3 metrics + progress "X left for the next rank" + a score) is in the profile card. *(100% local and fun — it unlocks nothing, it's just for the joy of it.)*
- **🏆 Achievements**: **38 achievements** to unlock. **8 families × 4 tiers** (🥉🥈🥇👑) — *Cartographer* (maps), *Surveyor* (georeferenced maps), *Deep walker* (km), *Cellar rat* (time), *Pin master* (POIs), *Tracer* (paths), *Zoner* (zones), *Builder* (structures) — **+ 6 one-shot « 🎉 Special »**: *Jack of all trades*, *Centurion* (score ≥ 100), *Mole* (used the tracker), *Multi-level caver*, *Underground marathon* (tracker session > 4 h), *Completionist* (all the rest). A **toast** notifies you on unlock, the **N/38** grid lives in the profile card. You can also show your **score** and your **number of achievements** in the home banner stats (🎨 *Banner stats* section).
- **Compact stats** *(visible as soon as the screen is ≥ 380 px wide)* — now **configurable** from the Profile modal (see below). By default:
  - ⏱️ **Session time**: time elapsed since the app started in this session
  - 💾 **Save**: actual size of MyKTAMap data stored locally (see below)

> 💡 **Light theme chart**: in light mode, the profile banner background aligns with the "My maps" cards for clean visual integration.

#### 🖼️ Home wallpaper

In the **Profile** modal (click the banner), at the very bottom before the export buttons, you can set **your own image as the home screen background** instead of the theme colour.

Three settings, and they matter:

- **🖼️ Choose an image** — any photo. It is resized and re-encoded on add, which also **strips its metadata**, including where the photo was taken.
- **Veil** — darkens (or lightens, in light theme) the image so text stays readable on top. At 0% the image is bare, at 100% you get the plain background back. Default 55%.
- **Framing ↔ / ↕** — the screen **never shows the whole photo**: it is scaled up to cover, the rest is cropped. In portrait on a phone, a landscape photo only shows about a quarter of its width. These sliders pick **which part stays visible**. Only the one for the overflowing axis has an effect — the other does nothing, that's expected.

**🗑️ Remove** goes back to the theme colour.

> 💡 The image stays **on your device**, in the same storage as your avatar. It disappears if you reset your profile.
>
> ⚠️ It **does not travel yet** with the profile export: on a new device you will need to set it again.

**Edit your profile**:

Click on the profile banner → **👤 My profile** modal:

- **✏️ Nickname**: type whatever you want (letters / numbers / space). Used only to personalize local display.
- **📷 Photo**: choose an image from your gallery. The app **automatically compresses it** (512 px max long side, JPEG quality 88%) before saving it on your device, to avoid saturating your browser quota.
- **🗑️ Reset profile**: reset button (with confirmation). Empties nickname + photo + counters.

#### 📊 Stats grid

The Profile modal displays **6 global stats cells**:

| Cell | Description |
|---|---|
| 🗂️ **N maps** | Number of maps in your registry (server + local) |
| 💾 **N sessions** | Total number of saved sessions (per-map slots) |
| ⭐ **N favorites** | Cumulative number of points marked as favorites, across all maps |
| 📦 **N snapshots** | Number of session backups kept on this device (max 10 **per map** — beyond that, the oldest are dropped) |
| 📸 **N POI photos** | Number of photos attached to points + total size |
| 💾 **N MB save** | **Actual size of MyKTAMap data** (everything MyKTAMap has saved in your browser). Excluding volatile PWA Cache (which is not user data). |

#### 📊 My maps

**"📊 My maps"** section under the grid: **progressive table** that lists each map in your registry with:

- 📍 **POIs**: number of points (session count + embedded count in data layers)
- 🛣️ **Paths**: number of paths (same session + embedded)
- ↔ **Total distance**: cumulative sum in m or km if the map is calibrated (otherwise displayed in pixels)
- Footer **global cumulative total** for all maps

> ⚠️ **"partial" marker**: a map you have **never opened in this release** appears with an orange ⚠️ badge. Its data layers are not yet in cache → only the session counts (local to the app) are available. **Solution**: open the map once, the cache fills automatically, and the next time you reopen the Profile modal, the row becomes complete.

The table is built **sequentially** (one map at a time) to avoid saturating memory — anti-crash behavior on mobile for users with 20+ maps in registry.

#### 📊 Breakdown by category

**"📊 Breakdown by category"** section: **4 aggregated cross-map SVG pie charts** that give an overall view of your mapping:

| Pie chart | Breakdown |
|---|---|
| 📍 **Points by tag** | All points (session + embedded) grouped by tag (ventilation shaft, open access, room, etc.) |
| 🛣️ **Paths by type** | Main / Secondary / Path / Inter-level junction |
| 🛣️ **Paths by type** | Main / Secondary / Path / Interlevel junction |
| ⬛ **Zones by type** | Water / Backfill / Collapse / Inaccessible |
| 🏛️ **Structures by type** | Pillars (1st / 2nd mass) / Walls / Quarry faces |

The visual rendering is **identical** to the pie chart on the **Global Stats** page of an open map — same color palette, **but with one important difference**:

> 💡 **ALWAYS default labels**: in this cross-map home section, we display the **generic built-in** labels (`Main`, `Secondary`, `Path`, `Junction` for paths; `Water`, `Backfill`, `Collapse`, `Inaccessible` for zones). If you renamed a type in the legend of a specific map (for example "main" → "surface road" on your map A), this rename **does NOT appear here** — this is intentional to keep a consistent cross-map view. The local rename remains visible normally in the **in-map** Global Stats modal of map A.

> 📌 **Cache limitation**: for maps **never recently reopened**, only **session** annotations (stored locally) are contributed to the pie charts — not the data layers embedded in the ZIP (the `data/*.json`). If you see "secondary" / "level -1" that seem to be missing, **reopen the map once**: the full cache (including embedded data layers) will be regenerated automatically after ~800 ms. On your next return to the home page, the pie charts will be up to date.

As you open your maps and their data layers load, the pie charts are automatically enriched with the actual breakdowns.

#### 🎨 Home banner stats

**"🎨 Home banner stats"** section: **choose which stats appear** in the home profile banner (1 to 3 stats max).

**Currently available pool**:
- ⏱️ **Session time**: time elapsed since app startup
- 💾 **Storage**: size of MyKTAMap data stored locally
- 🗺️ **Visited maps**: number of maps in your registry

**Rules**:
- **Hard cap of 3 stats max**: you cannot enable more than 3, even if you check more
- **At least 1 stat required**: you cannot uncheck everything (the banner would have an awkward gap)
- **Defaults**: `["time", "storage"]` (Time + Storage) — KARMA's field choice

**Instant update**: the home banner re-renders **live** as soon as you check/uncheck, without needing to reload the page.

#### 💾 Storage stat

The "Storage" stat (visible in the home banner + in the Profile modal grid) reflects the **actual size of your MyKTAMap data**:

- **MyKTAMap-targeted calculation**: we only sum up what MyKTAMap wrote in your browser — the `myktamap_*` keys and the app's 6 local databases (handles, blobs, backups, photos, etc.). The volatile PWA Cache (which contains the app's JS/CSS code and is NOT user data) is **excluded** from the calculation.
- **30s cache**: the calculation is cumulated then cached for 30 seconds to avoid re-querying storage in a loop when you quickly open/close modals.
- **Tooltip**: "Size of MyKTAMap data (LS + IDB)" + clarification "excluding PWA Cache".

Result: the value is **stable, predictable, and truly reflects what you have mapped**.

**Profile import / export**:

Your profile is included in the **Advanced Export** of sessions (🎨 Advanced tab → "User identity" section). Useful for transferring your visual identity to another device. When importing a profile:

- A modal toast suggests a **reload** of the page so that the avatar and nickname are correctly updated everywhere in the UI (header, sidebar, etc.)

**📄 History Mode PDFs travel too**:

The export window gains a **📄 History Mode PDFs** checkbox, **unchecked by default**. Tick it and your documents leave with the profile, then get **put back on import** with their original name and date. Without it, a re-imported profile arrived with your free notes but **no documents** — the 📖 Stories tab was half empty with nothing to explain why.

> ⚠️ **Unchecked by default, for a good reason**: a single map can carry up to **100 MB** of PDFs. The estimated weight shows next to the checkbox and counts towards the window total — past the threshold, the app asks for confirmation before exporting.
>
> 💡 Re-importing the same profile twice does **not** create duplicates: each document takes its place back.

> 🔒 **On an installation that only offers its own server's maps** — the ones where the "Load a new map" block is missing —, **profile import is refused**, with a message saying why. Two reasons: it would bring back maps this installation does not offer, and above all it carries your display preferences — a profile where "show server maps" was unchecked **emptied the list**, leaving no visible setting to get it back. **Export** stays available: your logbook, sessions and notes are yours and leave whenever you want.

**📦 Full profile with map archives**:

The profile export can now **bundle the ZIP archives of maps stored in the app**. In the export window, a "📦 Map archives" section lists your stored maps with their size: tick the ones to carry (nothing is ticked by default) — the export then becomes a **"full profile" `.zip` file** instead of the usual JSON. On import on another device, archives are **injected back and attached to their maps**: no more re-dropping ZIPs one by one.

- **Size guard**: beyond ~50 MB on iPhone/iPad (Safari is fragile with large downloads) or ~500 MB elsewhere, a red warning asks for an **explicit confirmation** — nothing is blocked, you decide.
- **Honesty about eviction**: if the browser deleted an archive to free space (the "stored" flag can outlive the eviction), the export **lists the affected maps** instead of producing a silently incomplete zip.
- In **Merge** mode on import, a map that already has its archive on the device **keeps its own**; in **Replace** mode, the profile's wins. A storage failure (quota full) is reported **per map**, the rest continues.
- Maps in "re-selection" mode (and older entries in "permanent file access") don't appear in the list: their ZIP lives on your disk, not in the app — there is nothing to bundle.

> 🔒 **100% local**: your nickname and photo remain in your browser. Nothing is sent to a server. The profile export is explicit and controlled by you.

#### 💼 Pro edition — import a license

If the author has provided you with a **`Licence-pro.json`** file (by mail, private channel, etc.) following a professional license request, you can **import it directly** into your browser from the profile modal to activate pro edition **on this device only**.

**Dedicated section in the My Profile modal**:

- **If you are in community mode** (default state): a **📂 Import a pro license** button appears. On click, `.json` file picker → you select your file → immediate validation → confirmation toast. Pro mode is activated: the loader footer switches (✓ Pro license active), the splash displays "Professional edition", the gate screens remove the "Pro license" link (now redundant).
- **If a local license is active**: a **🗑️ Remove local license** button allows you to return to community mode. The license remains available in the original file if you want to re-import it later.
- **If a server license is active** (instance deployed by an admin with `Licence-pro.json` at the server root): ✓ badge only, no button — it's the server administrator who decides.

**File format**: minimum JSON `{"instance":"pro","license_hash":"MKTM-LIC-..."}`. If the hash is missing or malformed (strict format `MKTM-LIC-` + 32 hexadecimal characters), the file is refused with an error message.

**🆕 Access route on first load**: if you install MyKTAMap for the first time on a new device (= **community code** entry screen at boot), under the code form you will now find a second block separated by "or" with a **📂 Import my pro license** button. On click, `.json` file picker → you select your file → if OK the app enters **directly into pro mode** (no need to enter the community code). Useful for pro users discovering the app: no need to ask a third party for the community code, the pro license is a legitimate access channel in itself.

> 🔒 **100% local**: the license file is read by the browser then kept in your local storage. It is **never sent to a server**, never transmitted. No network connection is added.

> ⚖️ **Legal value**: the `MKTM-LIC-...` hash that appears in the file is **nominative** — linked to a specific contract between the author and the license holder. **Its reproduction or sharing with an unauthorized third party constitutes a contractual breach** (the author can enforce their rights). The browser-side mechanism remains cosmetic: it does not cryptographically verify the hash, the contract signature is what matters legally.

### 📚 Managing your map list

The application remembers all the maps you load, whether they come from the server or your local disk.

**On the home screen:**

| Symbol | Meaning |
|---|---|
| 🌐 | Server map (subfolder of `data/`) |
| 💾 | Local ZIP map |
| ✅ | Local map **stored in the app** (instant reload, works offline) |
| 🔐 | Older entry with **permanent access** (mechanism removed on 15/09/2026 — at its next re-selection the map becomes ✅ stored) |
| 📁 | Local map without persistence — re-selection required at load |

#### 💾 Making a server map available offline

A **local** map already lives in your browser: it works offline with no effort. A **server** map does not — and until now it only survived through the app's automatic cache, which **was not enough**:

- the app only keeps a limited number of recent files, and **a large map exceeds that number on its own**: it evicted its own pieces while loading. Offline, you got no error — you got a map full of **holes**;
- only the tiles you had **displayed** were kept — opening a map without zooming kept one level out of four;
- and **every app update wiped it all**.

Open a server map's **ℹ️ Info** panel: a **💾 Offline availability** section offers to **download everything** — image, data and **every tile of every zoom level** — into a reserved space that **survives app updates**.

| What you see | What it means |
|---|---|
| **Not downloaded** + ⬇️ button | Only what you displayed is kept, with no guarantee |
| **✅ Available offline** + ↻ / 🗑️ | Everything is there. The download button **is gone** — it became "Update" |
| **⚠️ Incomplete — n of N** + ⬇️ | Interrupted download, or files cleared by the browser: the button **comes back** to finish |
| **✅ Available, but n not found** + ↻ | The server did not provide some files declared by the map. The app **names them**: the map is usable, and you can fix your deployment then hit "Retry" |

**🔎 And the app tells you when the server has changed**. A downloaded map is served from your phone and never asks the server again — handy, but it could stay stale **with nothing to tell you**. When you open the info panel, the app now checks, file by file, whether anything moved on the server, and shows one of three verdicts: **⚠️ Update available**, **✓ Up to date**, or **Cannot check** (offline, or map downloaded before this version). *It never claims "up to date" without actually checking.*

> 💡 **The state is read from the real cache, not from a remembered flag.** If the browser clears its storage, the app notices and offers the download again — instead of showing "available" over nothing and letting you find out underground.

**Available actions** on each row (3 buttons):

- **ℹ️** — opens a **Detailed info** window on this archive (internal id, name, version, author, type, source file, size, persistence, V1/V2/multi-level mode, performance preset, dates added and opened). Useful for checking what the app knows about the map without loading it.
- **▶️** — loads the map
- **⭐/☆** — pins/unpins the map to the top of the list
- **✏️ Rename display** — in the ℹ️ Info window: a local display name (40 chars max) to tell two same-named maps apart; empty = back to the original name; the map's real name is still used for file checks.
- **🗑️ Remove from list** now lives **at the end of the ℹ️ Info window** *(the row ✕ is gone: removal asks for confirmation there — no more accidental removal)*. Removing a map does not delete the ZIP file on your disk, but it does clear the archive possibly stored in the app. If the plan has **story documents** (Story Mode PDFs), the confirmation offers an **« Also delete its documents (X MB) »** box, unchecked: left as is, they remain readable in 📔 My logbook → 📖 Stories.

**Buttons at the top of the list:**

- **💾 Export my list** — downloads a `myktamap_plans_YYYYMMDD.config` file that you can save or share.
- **📂 Load a list** — imports a previously exported list file. Three choices: Replace, Merge, or Cancel.

**Display filters & organization**:

- **🌐 Show server maps** — check/uncheck this toggle above the list to hide automatically discovered server maps (test1, test2, demos…) and only see your personal maps. **Preserved** between sessions (on this device). Unchecking does not delete anything — re-checking → the maps reappear intact.
- **📁 Folders** — right of the "📚 My maps" title, an **All | Folders** switch (always visible). In **Folders** mode your list is arranged in sections you create yourself (➕ in the title row): "Gironde", "Limestone", whatever you like, with a **colour** per folder, shown as a dot before the map name in both modes. A map lives in **one** folder; the others sit in "Unfiled", last. To file a map: **☑ Select** one or more maps then "Move to…" (the bar stays at the top of the list), or **drag** the row onto a folder header: with the mouse on PC, or by touch with a **long press** (the row lifts after half a second; a finger that moves right away scrolls the list, as usual). Headers collapse; ⋮ on a header = rename, colour, move up/down, delete (its maps go back to Unfiled, **no map is ever deleted**). **🏷️ Tag rule**: in ⋮, "also include maps tagged…" files on its own every map carrying the tag, future ones too — and in All mode, ticked chips offer "📁 Create a folder from these tags". Moving a map by hand always beats a rule. The **dot** before the name tells you which one applies: **filled** = filed explicitly (by hand, by the multi-import or by the server), **hollow** = brought in by a rule — it follows its tags, remove the tag and it leaves the folder. Folders **travel with your profile**; a server (ConfAdmin) can propose some: those cannot be renamed or deleted while the server declares them, but you stay free to move a map in or out. The 📦 multi-import offers "File into:" for a whole batch. All mode is the usual screen, unchanged.
- **🔎 Filter by name** — a field above the list filters live as you type. Pure display filter, reset the next time you visit the home screen.
- **⭐ Pin** — each row's star moves the map **to the top of the list** (pinned maps keep the "last opened" order among themselves). Click again to unpin.
- **🖼️ Tiling for this map** — the selector that used to sit above the "Load this map" button **is gone**: the app decides on its own ("Auto"), which is what it already did for nearly every map. It only ever affected very large maps **not tiled at generation time (V1)**; on an already-tiled map, "Disabled" changed nothing. The setting now lives in **ℹ️ Info**, and **only for the maps it applies to** — and unlike the old one, it is **remembered** for that map instead of resetting on every start.
- **🔒 On a protected installation, no pro license opens it in place of the password** — if the installation has set its password, neither **your own** imported license file nor the license served **by the installation itself** unlocks the app: the password is still required. Your license may enable **pro mode**, but access goes through the password. (An installation with **no** password still opens directly with the license.)
- **🔑 The instance's password at the code screen** — if the app is served to you by an instance that has set **its own** password (an association, a club), **that one** is what you need: on a protected instance, the community code does not open it. If the deployer changes or removes their password, the app asks again **on the next start** — but **offline, your access stays valid**: a network outage never locks you out. ⚠️ *Like the community code, this is a **social** barrier, not authentication: the password's fingerprint sits in a public file.*
- **🔎 "Find the names"** — if a chart still shows a custom type by its identifier (`cust-…`), a button appears under it. It looks the name up **inside your maps themselves**, so you do not have to open them one by one: for a map on your server it asks that server for its descriptor; for a local map it reads the archive already stored. **It states how many maps it will read, and only runs on click.** Names found are kept **for good** — the operation never has to be repeated, even after an update.
- **🏷️ Filter your statistics by tag** — above the profile pie charts, a row of tags. **One click** keeps only the maps carrying it, **a second** excludes them, **a third** resets. **All charts follow** — that is the whole point: take your county atlas out to see what you actually surveyed elsewhere. If a map carries both an included and an excluded tag, it is **dropped**: exclusion always wins. A new **"Maps per tag"** chart shows the split, with an "Untagged" slice telling you what is left to tag. This filter is **not remembered**: it resets every time you reopen the window.
- **🏷️ Custom types in statistics** — the profile pie charts showed your own types by their internal identifier (`cust-…`) instead of their name. Their name lives **inside the map**: the app remembers it the **first time you open that map** from this version on. A map never reopened therefore keeps its identifier, and a note under the chart tells you so — open it once and the name appears.
- **🏷️ Tags** — label your maps ("Paris 13", "GTech", "to finish"…) via **ℹ️ Info → Map tags** (free input, comma-separated — 12 max, 24 characters each). They show under the map name, and as soon as one map is tagged, a row of **filter chips** appears above the list: click one or more chips to only see those maps (a map matches if it carries **at least one** of the selected tags). Tags live **in the app** (a ZIP generated with the Generator's **🏷️ Tags** field **proposes** them on import, never overwriting the ones you set) but follow the **profile export** and the 💾 list export.
  - **🌐 Maps from a server can arrive already tagged** — if the deployer filled in tags in their map list, those show up and filter exactly like yours, with nothing to do. **Yours always win**: as soon as you edit a map's tags, the server never touches them again, neither on the next start nor on any later one. And **clearing them is a choice**: empty the field and they will not grow back. To get the server's tags back, nothing special is needed — remove the map from the list and it will be rediscovered with them.

> 💡 **Tip** — If you change PC or phone, export your list on the old device then import it on the new one to find all your maps in one click. Note: file access permissions are not portable (you will have to re-select local ZIPs the first time on the new device). When re-selecting, if you provide a ZIP in a different mode (e.g.: you had this map in V2 but the ZIP is V1), a warning message will clearly notify you before continuing.

> 📐 **Point C (optional) — for distorted maps**: if your map is an **assembly** that projects poorly (stretched one way, different X/Y scales), add a **3rd point** in ⚙️ Settings → Georeferencing (or in the generator): the app then switches to a transformation that **corrects the global distortion** — OSM view, KMZ/GPX exports and Rescue Mode all benefit. Pick C **far from the A-B line** (an aligned C adds nothing and is refused). Note: this corrects an *overall* distortion — if each piece of the assembly has its own error, the result improves but cannot be perfect everywhere. Leave C empty if your map already projects well: nothing changes.

### 🔐 Avoid re-selecting the ZIP at each opening

By default the app **stores each map on first load**: the ZIP is copied into the browser's local storage area, nothing to tick on the home screen. The setting lives in **⚙️ Home configuration → "💾 Store the map in the app on first load"** (on by default; when off, the ZIP is asked for at every opening). On subsequent openings:

- **0 clicks**, the map loads directly
- Works **offline** (the ZIP is in the browser, no need to find the file)
- Recommended on **mobile**

> ℹ️ **The "🔐 Grant permanent access to the file" button (Chrome/Edge) was removed on 15/09/2026.** It was redundant: the ZIP was copied into the app anyway, and the file reference was never used. Maps that had it still open; at their next re-selection they become "stored".

> ⚠️ **Storage limits**:
> - **iPhone (classic Safari)**: ~50 MB, may be erased after prolonged inactivity
> - **iPhone (installed PWA)**: up to 1 GB, persistent
> - **Android Chrome**: several GB available
> - **PC**: very large
>
> For maximum persistence on iPhone, **install the application as a PWA** (see 📱 section) before storing your maps.

> ⚠️ If the quota is exceeded, a warning is displayed and the map remains usable but will require re-selection on each opening.

### 🗂️ Automatic discovery of server maps

If the application is hosted on a server with multiple maps in `data/` (for example `data/test1/`, `data/test2/`...), it can detect them automatically via a `data/index.json` file:

**Minimal format**:
```json
{ "plans": ["test1", "test2"] }
**Detailed format** (recommended to display names right away):
```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Test Map 1", "version": "V1" },
    { "id": "test2", "path": "data/test2", "name": "Test Map 2", "version": "V1" }
  ]
}
On startup, these maps appear in **My maps** marked as "discovered" and can be loaded with one click.

### ⚙️ "Configuration" modal (loader)

On the home page, a **⚙️ Configuration button** in the loader header (next to 📖 Documentation and 🚨 Alerts) opens a single modal that groups all loader settings (tiling, performance, debug, update, reset):

> **Order of sections in the modal (top to bottom, identical to UI)**:

1. **🌍 Application** — the **language selector** for the whole app (🇫🇷 Français · 🇬🇧 English · 🇪🇸 Español). This is now the **only place** to change it while using the app: it left ⚙️ Settings in map mode, where it looked like it only concerned the open map — and where it offered to restart the app at the worst possible moment, deep underground. You can still pick it on the unlock screen, before going in.

2. **🛰️ Sensor-based options** — the options that rely on a phone sensor: **🔋 Battery level** and **📳 Haptic vibration**. Each one can be turned off, and an option that is off displays nothing **and stops listening to the sensor**. When the system refuses the sensor — vibration on iPhone, for instance — the option stays **visible but greyed out, with the reason**, instead of vanishing with no explanation.

> 🗺️ **OSM view is on by default**. If you have at least one GPS-calibrated map, the home screen shows it on top of an OpenStreetMap background — and therefore **requests that background from `tile.openstreetmap.org` as soon as it loads**, with no click. **No data from your maps leaves the device**: only the coordinates of the tiles you are looking at are requested, everything else is drawn on top locally. A banner tells you the first time. To turn it off: the checkbox above. **If you had already unchecked it, it stays unchecked** — a refusal is never overridden. And nothing is sent in **strict offline mode**, in **incognito**, or if no map is calibrated.

> 🖼️ **Image tiling is not in this modal** — and it is not on the loading screen either. It went through both without ever finding its place: in practice it only concerns maps **not split at generation time**, and on the others it changed nothing. It now lives in the map's **ℹ️ Info** panel, only for the maps it applies to, and it is finally **remembered** there.
>
> 🚀 **The Performance ULTRA toggles are gone too**. They were displayed here but **saved nothing** — they are **per-map** settings: you set them in **⚙️ Settings**, once the map is open. See "🚀 Optimize your map" below.

3. **🛠️ Developer Mode** — replaces the old Debug section. **Password-protected** on first activation (with a responsibility warning). Once active: **🐛 Detailed logs** toggle, **📋 Show logs** button (the buffer, viewable even without a map loaded), and **📚 Technical documentation** — the whole project doc (architecture, backlog, maths…) readable in-app (online only). The logs setting in the map-mode ⚙️ Settings was removed: everything is driven from here.

4. **🔒 Privacy & Audit** — section dedicated to transparency: live network journal, "What does the app do on the network?" doc, and "Strict offline mode" toggle. See dedicated section below.

5. **🎨 Display** — interface toggles:
   - **🔎 Icons that grow with zoom**, **📌 Anchor tool panels to their button**, **🧲 Snap while drawing** and its **radius** — these four apply to **all your maps**. They used to live in ⚙️ Settings in map mode, where you changed them from one map without knowing you were changing them everywhere.
   - **🔆 Keep screen on** — prevents your screen from auto-sleeping while MyKTAMap is open (Wake Lock API). Useful on cataphile outings to avoid having to touch the phone every 30 sec. Auto re-acquire on return from background (visibilitychange). Toggle automatically hidden on browsers that don't support the API (Firefox notably). The same toggle is also accessible in **⚙️ Settings** in map mode (see dedicated section).

> 📊 **See memory state** — in this same modal, a **“📊 See memory state”** button opens the **inspector**: what the app takes up on your device (storage keys sorted by size, databases, application cache, browser quota) and what is loaded right now. A **📋 Copy report** button produces text ready to paste when reporting a problem.

> ❓ **Help button inside windows** — puts a small **❓** in the title row of windows that have a help page: ⚙️ Settings, 📊 Session details, 🧭 Tracker menu, ⬆️ Save, ⬇️ Load, ≡ Legend, 🔍 Search, 🚨 Rescue, 📖 History mode, 🏗️ Generator, 📔 Logbook, 🌍 OSM view, 👤 Profile, ℹ️ Map info. One tap opens **the right page directly**, without going through the ❓ Help group. Untick if you prefer an interface without this icon: it disappears at once, even from windows already open.
>
> 🔔 **Notifications** — the small messages that appear at the bottom of the screen. Three positions: **All** (every action is confirmed), **Essential** (**the default**; no more messages confirming something you just did, such as "2 maps moved" or "copied"; status messages stay, without vibration), **Silence** (only what matters: low battery, sensors refused, errors). **Server alerts** and windows asking you for a decision are **never** muted. When a map loads, the "session restored, filters, photos" messages now come out as one.

> 📔 **Keep a logbook of my outings** — every map you open becomes an **outing** archived in 📔 My logbook (duration, distance, additions, photos). Unticked, the app no longer opens anything by itself and the current outing stops; what is already in the logbook stays, and you can still start one on demand from **📊 Session details**. *(Setting moved here from ⚙️ Settings in map mode: it applies to all your maps, and the logbook opens from the home screen.)*

> 🌍 **Application language**: MyKTAMap is translated into **3 languages — French, English, Spanish**. The language selector (flag + full name) is in **⚙️ Configuration → 🌍 Application**, at the very top of the modal. The change applies immediately, without reloading the app. *Good to know*: the **Documentation** (this guide) and the **welcome tutorial** exist in all **3 languages** — they follow your app language automatically, and the flag button at the top of the Documentation window lets you switch 🇫🇷 / 🇬🇧 / 🇪🇸 whenever you want. So does the **built-in Help** (the 📚 in the sidebar in map mode). On each language change, a message offers to **restart the app** for a fully clean switch (optional). 💡 In **incognito mode**, your interface language is now **kept** (all other data stays completely forgotten).

> 💡 The "Show circles at path intersections" option is **not in Configuration home** but in **⚙️ Settings in map mode** (per-plan). Each map now has its own setting — handy to disable circles only on your very dense maps without touching the others.

6. **📚 Server maps** — **"🚫 Do not load server maps at startup"** checkbox:
   - **Disables auto-discovery** of the `data/index.json` file at app boot — the app will no longer query the server to list demo maps or public hosted maps.
   - **Hides the "🌐 Show server maps" toggle** of the home (becomes useless since there is nothing to show anymore).
   - **Excludes server maps from aggregated stats** in the Profile modal → no longer skews the "Visited maps" count with maps you never use.
   - **Reload required** for full effect (auto-discovery happens at splash, not during session).
   - **Default OFF** (absolute backward compatibility — the app continues to auto-discover server maps as long as you have not explicitly checked this box).

   > 💡 **Use case**: you use MyKTAMap only with your own local maps and you don't want to see the server demo/test maps that pollute your list. Check this box → reload → your 📚 My maps list only contains YOUR maps.

7. **🔐 Local access code (PIN / Face ID)** — locks the app at each startup with a 4-6 digit code + Face ID / Touch ID if the device supports it. 100% local (never sent over the Internet). 5 wrong codes = **temporary** lock (10 min, then 1 h, 6 h, 24 h), never permanent. No code recovery if forgotten. See dedicated section **🔐 Local access code (PIN / Face ID)** below for full details (activation, modification, deactivation, lockout).

8. **🔄 Update — Force soft update** — re-downloads the latest version of the code (purges the PWA cache, keeps your data and your maps). Useful if you suspect that your app remains on an old version after a release. **Never** touches your maps, your active session, your community code or your local PIN. **Mandatory confirmation before triggering** (blue modal detailing what is preserved + need for active Internet connection).

9. **💥 Reset everything (full reset)** — total purge: the cache, everything saved in your browser, and your maps. Resets the community access code **AND** the local PIN if configured. **Double confirmation required.** Irreversible action.

**Organization**: **everything is grouped in a single ⚙️ Configuration modal**, accessible from the loader header. The 🏗️ Generate a map button remains directly visible in the home (not in the Configuration modal) because it is a creation action, not a setting.

### 🎚️ Image splitting — the app decides

**There is nothing to set here any more.** The *"🖼️ Tiling for this load"* strip that used to sit right above
the **▶️ Load this map** button **has been removed**: the app automatically splits maps too large to be shown
in one piece, which is already what it did for nearly all of them.

> 🩸 **Why it went away.** It only mattered for very large maps **not split at generation time** ("V1"). On an
> **already-split** map — today's common case, and the recommended method — "Disabled" **changed nothing**: the
> map always uses its pieces. So it occupied the most visible spot of the loading screen for almost no effect.
> And it was **not remembered**: it went back to "Auto" at every start — a setting that forgets itself is not a
> setting.

**Where it went**: into the map's **ℹ️ Info** panel, and **only for the maps it applies to** — if you do not see
it, your map is already split and the setting would do nothing. There, it is **remembered for that map** and
applies to every later load.

| Choice | What it does |
|---|---|
| 🔄 **Auto** *(default)* | Automatically splits maps too large to be displayed in one piece. **This is the right choice in every case.** |
| 💤 **Disabled** | No splitting: the whole image at once. Native quality on desktop, but ⚠️ **may crash your phone** on a very large map — a message warns you when it applies. |

> 🩸 **There used to be 5 buttons** (🌟 Quality, 🎯 Balanced, ⚡ Performance). They only tuned the
> splitting done **by the browser at load time**, which only concerns **older** maps. On a map **already split
> at generation**, they changed **absolutely nothing**, while the app still claimed "Sharper. Recommended on
> desktop PC.". They were removed.

> 🩸 **And "Auto" protected you less than the others, even though it was the default.** It decided on **file
> weight** (60 MB) while the others decided on **pixel size**. A well-compressed 100-megapixel map weighs
> ~15 MB: "Auto" did not split it, and the app could crash on iPhone. Fixed: pixel size now decides.

### 🎨 The interface in map mode

> MyKTAMap uses a map mode interface that is **clear, touch-friendly and mobile-first**. The PC home page is full-screen, modals enlarge on large screens, and the splash displays the animated KARMA signature + library credits (🍃 Leaflet · 📦 JSZip · 📤 jsPDF · 🧭 Dijkstra).

**Visual presentation**:

- **🌟 Persistent header bar at the top** (44px sticky):
  - Clickable compass rose on the left — return to the home (with safeguard if session modified)
  - Map name + version in the center, **clickable** to open the **"🗂 Change map"** modal (with highlight card of current map + recent list + "View all my maps" CTA)
  - **Clickable counters** on the right: 📍 points · 🛣 paths · ⬛ zones — on click, **"📊 Session details"** modal that lists all your elements with their info
- **📊 Status bar at the bottom** (52px, grows dynamically) — permanently groups live measurements:
  - 📐 Simple measurement (if ≥ 2 points placed)
  - 📏 Total path distance (if magenta highlight active) — **clickable to open the modal**
  - 🗺️ Route (distance + time + mode) — **clickable to open the Route modal**
  - 🧭 GPS Tracker — **LED compass ON (green) / OFF (red)** always visible
  - If everything is active and it doesn't fit, the footer **automatically grows and wraps to the next line** — no info is cut off
  - Large ▾▴ button on the right to manually shrink / enlarge the footer
- **Unified left/right sidebars** — each side is a **single continuous vertical bar**:
  - **Left**: ⊞ Layers · − + Zoom · 🏗 Level · ≡ collapse · 📚 Doc · ⚙ Settings · ⬇ Load · ⬆ Save
  - **Right**: ≡ collapse · 🔍 Search · ✏️ Edition · 📐 Measurement · 🛣 Paths · ⬛ Zones · 🧭 Tracker
  - **Tool panels**: they open **centred on screen** (Paths, Zones, Structures, like Tracker and Filters); the “🪟 Anchor tool panels to the button” option (⚙️ Configuration) restores anchoring.
- **🧭 Orientation compass**:
  - In portrait: **bottom-left** above the footer
  - In landscape: **bottom-centered** (so as not to hide the side icons)
- **≡ Reduction buttons** at the top of each sidebar (▾ deployed, ▸/◂ collapsed) — saves space without stopping active modes
- **"📊 Session details" modal**: a click on the header counters opens the map's **dashboard**:
  - At the top, **✅ Saved N s ago** (red if saving fails)
  - Aggregated stats, and a per-level breakdown in multi-level
  - All your points (tag, coordinates, level), paths by type with distance, zones, structures, photos
  - Other measurements (📐 measurement, 🗺️ route and its steps, 🧭 tracking)
  - **📔 Current outing**: 🏁 Close, 🧭 Refine the trail, open the logbook. **If no outing is running**, a **📔 Start an outing** button opens one on this map — it works even when “Keep a logbook of my outings” is unticked in ⚙️ Settings, and it is then the only way to record one. One outing at a time: while one is running, the button gives way to 🏁 Close.
  - **⭐ Favorites**: export this map's or all, import
  - **📦 Recent backups** of this map: ↻ Restore, 📆 Snapshot now, 🗑️ Clear all — every deletion asks for confirmation
  - The **📊 Global stats** button (copyable report, CSV, PDF)
- **Redesigned "Change map" modal**: highlight card of current map with `● ACTIVE` badge, list of recent maps with hover animation, large blue "📚 View all my maps" button at the bottom
- **Map generator removed from map mode**: remains accessible **only from the home** via 🏗️ Generate a map (creation outside of map mode)

### 💾 Automatic saving of your session

Your **current annotations** (added points, paths, zones, measurements) are automatically saved in the background every ~1.5 seconds. So if you close the application and reopen it via **▶️ Resume**, your work is restored.

**How it works:**
- On each modification, your session is saved in the browser, **in a slot of its own for each map**: working on another map no longer overwrites the first one's session
- On next launch, if you click on **▶️ Resume [map name]**, your session is restored — a **centered window** confirms with the details (*"3 points · 1 path · 2 zones"*)
- The window offers you two actions: **🗑️ Clear session** (start this map with a blank session) or **✓ Continue** (keep the restored session). Clicking outside or pressing Escape = Continue.

**Important:**
- Each map keeps its own session: coming back to a map you left restores what you had there
- The **tracker path** is not restored (the tracker being experimental, reviving a frozen trail would be misleading)
- The **💥 Reset everything** also erases your saved session
- To keep an important session beyond auto-save, use **⬆️ Export JSON session** (explicit save that you can re-import later)

---

### 📔 My logbook — the history of your trips

The auto-save above keeps the **current state** of a map. The **logbook** keeps the **history**: every time you explore a map, a **trip** is archived with its date, duration, distance travelled and what you added. Clearing a session does not delete the trips already filed in the logbook.

**Where to find it:** the **📔 My logbook** tile on the home screen, in the « 🧰 Tools » card (grid under « 📦 Add a map », visible on mobile too). No map to load. From a map: **Session** modal → **📔 Trip in progress** section.

**What a trip contains:**
- date, **duration** (from start to finish for a field outing; time using the app for work on the plan) and **distance travelled** with the tracker,
- how many **points, paths, zones and structures you added**,
- the **path you walked** (mini-map in the trip sheet),
- the **photos taken during the trip** (the logbook does not copy them: it points at your existing photos — delete one and its thumbnail becomes « 🚫 »),
- a **free-form note** you can write whenever you want, even weeks later.

**🚶 Field trip or 🖥️ desk work?**

The logbook tells them apart on its own, and it matters: preparing a map at home is not a trip.

- If you **moved** during the session → **field trip**. A single **"📍 I am here"** is enough: you are stating you physically walked to a point, so it counts as a trip even with the tracker off.
- If you only **annotated without moving** → **desk work**, filed in a collapsed section of its own at the bottom of the logbook.
- The **totals** at the top of the logbook (number of trips, time, distance) count **field trips only** — time spent drawing at home has no business there.
- Got it wrong? Open the sheet and click **🚶 Mark as field trip** (or the other way round). From a map, the same **🚶 / 🖥️** buttons sit in the **Session** modal, 📔 section, next to "Close my trip". Your correction is final, it is never recomputed.

**📏 Distance when you don't use the pedometer**

You often navigate without the tracker: you walk, and now and then you tap **"📍 I am here"** on a point. The app **links those markers together** to estimate how far you travelled — and it follows the **galleries** to do so, not the straight line (in a maze, a straight line would tell you nonsense).

In practice: you start at **A**, pass through **C**, then reach **B** → the app counts A→C, then C→B.

- This distance is always **flagged as estimated** ("820 m, 600 m of it estimated"): it never passes itself off as a measurement.
- ⏱️ **During the trip the figure is deliberately conservative**: the app counts in a straight line so that "📍 I am here" stays **instant** underground. The gallery-following calculation happens **once, when the trip is filed into the logbook** — which is why the distance **goes up** at that point. On a very large map the app may skip that final pass and keep the straight-line figure rather than freeze.
- 🧭 **The "Refine track" button** (**Session** modal, 📔 section) runs that calculation **whenever you want**, without waiting for the end: it recomputes the distance **and redraws the route** along the galleries between your markers. The counter next to it shows how many legs are pending. On a very large map the app warns you it will freeze for a few seconds and lets you decide.
- ⚠️ **That redrawn route is a reconstruction, not a survey.** The app assumes you went from one marker to the next by the shortest path: a detour, a gallery explored then abandoned, a U-turn will not show up. It is therefore displayed **in the trip sheet only**, clearly labelled — your **GPX/KMZ exports and the heatmap keep the actually recorded track**, never the reconstruction.
- If the pedometer **did** measure between two markers, the pedometer wins — never both at once.
- A **map click** to correct your position does not count as travel, and neither does a **portal crossing** to another map.

**When is a session archived?**
- **Automatically** when you leave the map (map switch or back to home) — but not right away: the outing is first **paused for 2 hours** (come back to the same map and it resumes, see "Resuming" below). After that, it is archived if **either** condition is met:
  - **50 m travelled** (measured by the pedometer or estimated between your "📍 I am here" markers),
  - **or** 10 minutes of actual work **and** at least one annotation.
  - Below that, nothing is kept — opening a map for 20 seconds to check a detail does not clutter the logbook.
- **Manually** with **🏁 Close my trip**: it is filed unconditionally, and a new one starts right away. Handy to split a long day into stages — and it is the safe move whenever you want to keep a short session.

**📖 The Stories tab — your plan notes and PDFs, gathered at last**

**Story mode** (free note + PDF) lives inside a plan's screen: to re-read your notes about a quarry, you have to load that quarry. The logbook's second tab, **📖 Stories**, gathers them **across all plans, without loading anything**:

- the list shows every plan that has a note or a PDF, with an excerpt of the note;
- opening a sheet shows the note **formatted** (Markdown) and lets you **edit it right there** — it is the very same note as in the plan's Story mode, not a copy;
- the plan's **PDF documents** are listed: click to open, 🗑️ to delete, **➕ Add a PDF** to attach a new one — all without loading the plan.
- 📕 A PDF **shipped inside the map's ZIP** shows up here too, as soon as you have opened that map **once**: the app keeps a copy on your device. You can delete it like one of your own documents; reopening the map brings it back.

**Good to know:**
- The logbook **starts empty**: it cannot reconstruct trips from before it existed, they were never recorded as such.
- Everything is **strictly local** to your device (no upload, no account). Each trip can be deleted individually from its sheet.
- Beyond **500 trips**, the oldest ones are removed automatically.
- The logbook **is part of the profile export**: switching devices via the profile export does carry your outing history over.

---

### 🧙 Generator: step-by-step wizard

The **Generator** (🏗️) now guides you **step by step**, like an installer: each page shows one thing (name, image, layers…), optional steps can be **skipped** in one click, and a **final summary** shows what's filled, skipped or missing — with useful warnings (e.g. no GPS georeferencing = no OSM view or KMZ export) **before** generating. An imported ZIP pre-fills every step: you just review. Power users can switch back to the old full view via **🗒️ Show all** (choice remembered).

### 🔽 Collapsible footer

The small **arrow** under the home screen collapses the footer (copyright, links, credits) to free up space — only a minimal « © MyKTAMap · version » line remains. Click again to expand. Your choice is remembered and travels with the profile export.

### 🐛 Detailed logs (debug mode)

The **🐛 Detailed logs** button in the **⚙️ Configuration** modal of the loader enables verbose mode:
- Additional console logs (tracker sensors, tiling steps)
- Display of **technical figures** under the Performance mode selector (tile sizes, JPEG quality, trigger threshold)

Useful to report a problem or understand what's happening under the hood. Disabled by default. Setting also accessible from ⚙️ Settings > Detailed logs.

### ⚠️ If the application stops abruptly

On smartphone, the operating system (iOS / Android) may **abruptly close applications that consume too much memory**. When this happens, the next time you launch MyKTAMap, a **red window "WARNING — ABRUPT STOP DETECTED"** appears right after the splash to warn you.

The window details:
- **Why** it happened (saturated memory most of the time)
- **How to prevent it from happening again**: close other applications in the background, lower the performance mode in the loader, avoid opening too many browser tabs in parallel, keep your smartphone up to date, regularly export your session to avoid losing anything

If you see this window **regularly**, it's a sign that you need to **reduce the performance mode** (Performance < Balanced < Quality, decreasing RAM level).

### 📡 Offline use

MyKTAMap works **entirely offline** once the map has been loaded for the first time.

The application installs an **offline component** (a “Service Worker”) that automatically caches all necessary files (interface, images, data). On first load with an Internet connection, everything is saved locally.

**To prepare for an offline outing:**

1. Open the application **before leaving**, with a connection available
2. Load your complete map — on mobile, **check « 💾 Remember in app »** to be able to reopen it without re-selecting the file
3. Navigate for a few seconds so that all files are cached
4. You can now close the application and go into an area without network — it will remain functional

> If a new version is available with a connection, the application will update automatically on the next load.

### ⚠️ If a map no longer loads

If you click on a map in your list and a **« ⚠️ Map not found »** window appears, it means that the data for this map is no longer accessible. Typical causes:

- **Browser cache cleared** (memorized ZIPs have been deleted)
- **Import of a list from another device** (the list was restored but not the ZIPs themselves)
- **Reinstalling the application** or changing browser
- **Server map moved/deleted** (404)
- **Storage quota reached** (the browser purged the data automatically)

The window offers you 3 actions:

- **🔄 Retry** (server maps only) — useful if the server was temporarily unavailable
- **📁 Re-select the ZIP** (local maps) — opens your file explorer to find the ZIP again. If the map was stored (or in the former "Permanent access"), persistence will be **automatically restored** after the new selection
- **🗑️ Remove from list** — if you no longer have the map, delete its entry from your list

> 💡 **Tip**: regularly export your list via 💾 (icon at the top right of **📚 My maps**) so you can restore it in case of trouble.

### 💥 Reset everything

If you want to return the application **to its initial state** (like a first launch), a **💥 Reset everything** button is available in two places:

- In **⚙️ Settings** from the application
- In **⚙️ Configuration** on the home screen (loader)

⚠️ **This action is irreversible** and erases:
- The application cache (offline mode disabled until reconnection)
- Your **list of maps** (entries deleted)
- The **ZIPs memorized in the browser** (lost)
- Your **preferences** (performance mode per map, tracker options, detailed logs, etc.)

The application requests **two confirmations** before executing the reset, and reminds you to **export your list** beforehand if you want to keep it.

> 📡 **Connection check**: before the first confirmation, the application quickly tests your Internet connection (max 5 seconds). If you are **offline**, an **additional red window** warns you that the application will be **unusable** after the reset (the empty cache cannot be refilled without network). Reconnect to Wi-Fi or mobile data before restarting the reset, or click "Continue anyway" if you know what you're doing.

> Useful in case of persistent trouble, or to test the application "as a new user" when you publish or share your work.

### 🔒 Privacy & Network audit

**MyKTAMap is a 100% client-side application. None of your annotations, sessions, maps or personal data is ever sent to a server, nor to a third-party service.** And you can check it yourself.

The **🔒 Privacy & Audit** section in the ⚙️ Configuration modal of the loader offers you three tools:

#### 📋 View the network log

Opens a real-time table that logs **all** network requests issued by the application (method, URL, category, status, and especially whether there is a *body* — that is, data sent).

You can:
- **📋 Copy** the log as JSON to the clipboard
- **📥 Export** the log as a `.json` file (to share / archive / have audited)
- **🗑️ Empty** the buffer

**To watch out for**: if you see a `POST`, `PUT`, `PATCH`, `DELETE`, `sendBeacon`, `WebSocket` or `EventSource` request appear, or an external URL (category in red) other than the Google connectivity ping → **contact the author immediately** (Instagram **@karma_kta** or **contact@myktamap.fr**): this would contradict the promise of this page.

#### 📖 What does the app do on the network?

A window detailing:
- The technical model (pure PWA, no backend)
- The complete and nominative **whitelist** of URLs the app can contact
- How to check for yourself with your browser's developer tools (F12 key, Network tab)
- How the server's Content Security Policy (CSP) additionally protects

A 📄 button allows you to open the **complete documentation** (`docs/NETWORK_AUDIT.md`) in a new tab.

#### 🔒 Strict offline mode (opt-in)

Check this box if you want an **active guarantee** on the browser side: any non-whitelisted outgoing request will be **blocked BEFORE reaching the network** (the browser receives an exception, not a timeout).

Once activated:
- An orange `🔒 STRICT OFFLINE MODE ACTIVE` badge appears in the footer of the home page
- The app continues to work normally (annotations, calculations, PNG/KMZ exports, navigation, multi-level, route, tracker…)
- Only the update pings to the Internet are cut off (but the app remains usable with its current version)

The toggle is **persistent** (survives reloads and tab closures) until you uncheck it or do a full reset.

> 🛡️ **Guarantee level**: it's a **triple protection**:
> 1. The PWA architecture makes collection technically impossible (no backend)
> 2. The JS audit module logs + can block on the client side
> 3. The server's Content Security Policy asks the browser itself to refuse any unauthorized connection
>
> You never have to take the author's word for it: everything is verifiable.

---

## 🌍 OSM mode — built-in search

The **⛶** button of the OSM view widget is now called **"Open OSM mode"**: the map goes full screen. A **search bar** shows up there:

- it sits **in the « 🌍 OSM view » title line**, so it's available on the reduced home widget too;
- it finds **a plan** (among your georeferenced plans) or **a point** (those plans' POIs) — type, click a result, the map flies to it with a marker;
- **100% local**: the search reads your own plans, no internet address service is queried;
- ⚠️ **A map you have never opened does not appear either, even if it is calibrated**. The calibration travels **inside the map**, but the app only reads it on the **first open**: before that, it cannot know. **Open each map once** and the calibrated ones will show up on their own. The OSM view empty message now says so, instead of claiming there is no georeferenced map, which was false in that case.
- only **georeferenced** plans appear — a plan without GPS calibration is invisible in OSM mode (calibrate it via the Generator or Settings).

**📏 Measuring on the OSM map** — in OSM mode, the measuring tool gives a **distance** and an **area** by clicking on the map. A measurement made here depends on **no calibration**: the coordinates are already geographic, so it is more reliable than a measurement made on the plan.

**🎯 Surface coordinates** — a click on the OSM map gives the **latitude and longitude of the point right above**, copyable with one button. That is what you pass to a team coming in from the surface.

**🗂️ Several plans at once* — the "Displayed plans" panel of OSM mode lets you **stack your georeferenced plans**: ➕ to add one, ▲▼ to choose what goes above/below, a per-plan **opacity** slider, ✕ to remove. The plan marked ◉ is the "primary" one (the top selector's). All this management lives in a **dedicated modal** opened by the banner's **≡** button (nothing covers the map): **global display** switches, **tag filtering** (aggregated across displayed plans), and the plan stack. The old rows under the selector (opacity, checkboxes, tags) are gone from the widget — the map gains their height. Each row also carries **5 mini filter buttons of its own** (🖼️ image, 📍 POI, 🛣️ routes, 🌐 zones, 🏛️ structures) — the global display switches live in the same modal (Display section), the two levels combine. Perfect to show two neighbouring sectors on top of an overview plan, keeping e.g. only one's POIs and the other's image. **🏷️ And adding by LABEL**: under “Plans”, a row of chips lists the labels carried by **at least two** of your georeferenced plans (the ones you type in your library), with a “3/12” counter. One click **shows all** the plans of that label, a second click **removes them** — essential as soon as a split atlas produces twenty of them. Case is ignored (“Gironde” and “GIRONDE” are the same label), and past 3 displayed plans the app asks for confirmation, stating the count: plans then load **one by one**, filling the map progressively.

On the first opening of the mode, a message reminds you that rendering full plans can be slower on mobile — and another one shows if you display **more than 3 plans** at once.

> 👁️ **Layers hidden by default* — a data layer shipped "unchecked" in a plan ZIP (so hidden when the map opens) is rendered like the others: hide or show it with the existing filters (global and per-plan category chips, tag filter). The OSM view of the map screen is unaffected — it has always followed the layers actually displayed on your map.

> 🔍 **Sharp when zooming* — in the home screen's OSM preview, zooming on a plan automatically loads **more detailed tiles** (only the area you're looking at, V2-tiled plans). Nothing to configure, and no extra network requests: the tiles come from the plan file, already on your device.

> 🎨 **Your colors everywhere* — the legend colors you customize (≡ Legend → ✏️ Edit) now show up **on the OSM background too**: full-screen mode AND home preview, and with multiple plans each one keeps **its own** colors.

## 📖 Story Mode — Free note + PDF for each plan

The **📖** button in the top bar (left of the battery 🔋) opens a two-tab modal scoped to each plan. It's your **personal exploration notebook** for each underground site.

### 📝 Free note (Markdown)

A text notepad auto-saved as you type. Perfect for the site's history, anecdotes, your exploration to-do, things to double-check. **One note per plan**, kept across reloads and app restarts.

The note supports **Markdown**:
- By default you see the **rendered output** (colored headings, bold, lists, clickable links, blockquotes).
- Tap **✏️ Edit** to modify the source ; a mini toolbar helps you insert formatting: **B**old · *I*talic · H1 · H2 · • List · 🔗 Link · `</>` code · ❝ quote.
- Tap **👁 Preview** to switch back to the rendered view.
- Any MD you type (`**bold**`, `# Title`, `- item`…) is interpreted on render.

> 🎨 **Your maps' icons (v1.97.9)** — if you generated maps between June and September 2026, the "Map entry point" icon could show nothing: the app now falls back to its own built-in one, and **regenerating the map** fixes the file for good. Also, opening a **regenerated** map no longer fires the twenty-odd useless requests it took to locate its icons.

### 📚 Story (PDF) — **several documents per plan**

You can now keep **up to 10 PDF documents per plan**. A 2019 report, a scanned paper map, a press article, a survey sheet: all in the same place.

- A **document list** appears above the viewer as soon as there is more than one; click a document to open it.
- **📥 Import** adds a document (it replaces nothing). **🗑️ Remove** deletes the one being displayed.
- The map author can embed PDFs in the ZIP — **several** (the Generator now accepts a list of files): they appear at the top of the list (📕). Their presence does not prevent you from adding your own documents.
- 📕 **Those map documents are copied onto your device** the first time you open the map: that is what makes them show up in **📔 My logbook → 📖 Stories** without loading anything. You can **remove** them like your own — and if you reopen the map, they come back (the map provides them).
- Guardrails: **10 documents maximum** per plan, warning past **25 MB** total, refusal past **100 MB**. The space used shows up in **Storage**.
- On iPhone, an **↗️ Open in a tab** button kicks a document into native fullscreen if the inline view isn't available.
- Your documents are also listed, added and deleted from **📔 My logbook → 📖 Stories**, without loading the plan.

### 📦 Bundled into session export

When you 📤 Export, both your Markdown free note AND **all your Story-mode PDF documents** are embedded in the `.mkmsession.zip` file. On re-import (on another device, or to share with a partner), they are **added** to the current plan — an import no longer overwrites the document already there. Backward-compatible (an old file with a single PDF still loads fine).

In **anonymized** mode, note + PDF are intentionally omitted from the ZIP (may contain personal info).

> 🔒 **100% offline** — the note and the PDF stay on your device. Nothing is sent to the internet.

---

## 🚨 Emergency Exit Mode — Find the nearest exit

> 🧭 This tool takes you back out. If you are rather trying to **locate yourself** (⛑️ I'm lost), need a **highly readable screen** (panic mode), or are **coordinating teams** (Rescue Mode), all of that lives further down, in the Rescue chapter.

The **🚨** button in the top bar (between 📖 Story Mode and the battery 🔋) triggers route computation toward the **nearest exit** from your current position.

**Use case**: you're underground, you want to get out **right now** with no thinking (injured, low battery, lamp failure, simply lost). You tap the button (or trigger it by voice), the app does the rest.

### How it works

1. Tap **🚨** in the top bar **OR** say "**exit**" / "**how do I get out**" via the 🎤 voice command.
2. The app scans every POI on the plan with an open-exit tag:
   - `cao` → **C**avage **A**utre **O**uvert (Open Cavage)
   - `peo` → **P**uits à **E**chelon **O**uvert (Open Echelon Shaft)
   - `eso` → **E**scalier de **S**ervice **O**uvert (Open Service Stairs)
   - `entrée` → any POI marked as a known entrance, **and** the built-in "🚪 Plan entry point" tag
3. For each candidate the app computes the **real navigable path** via the pathfinder (handles walls AND inter-level junctions).
4. A compact modal shows:
   - The nearest exit + its distance + its level if the plan is multi-floor
   - A **🧭 Trace route** button (reuses the regular Route Mode engine)
   - 🪧 Once drawn, the **guidance banner** tells you what to do at each junction — **with no ✕** during an emergency exit, even if guidance is turned off. If you move away, its button becomes **"Nearest exit from here"** (see "🪧 Guidance" in the route section)
   - A foldable **See N other exits** sorted by distance

### Closed variants intentionally ignored

The codes `caf` / `pef` / `esf` (closed cavages, shafts, stairs) are **excluded** since they're not traversable in practice. If you mark a POI as closed, the app will never suggest going there.

If an exit shows the label **“Straight-line distance — route not verified”** (dashed card), the pathfinder **could not compute a path**: the distance is measured as the crow flies. Such exits are pushed under an **“Unconfirmed”** separator in the list, and if **no** exit has a verified route, a red banner says so first. Beware: such an exit may actually be unreachable (walls, isolated floor).

### Computation origin

The app starts from your **position at that very moment**, without asking, as soon as tracking is active **or** you have located yourself at least once since the plan was opened (“📍 I am here” on a point, recalibration on the map, arrival through a portal, or a restored session that contained a recalibration). The modal tells you where the computation starts from: *“from your position (tracking active)”*, *“from your last confirmed position, N min ago”* or *“from the point you tapped”*.

**The only case where the app asks “Where are you?”**: you have **never** confirmed your position since the plan was opened (it still equals the plan's start point). A banner appears, you **tap your position on the map** (it works even when aiming at an existing marker), and the computation starts from there — that tap **also recalibrates tracking**, so “Draw the route”, “Go there” and the XL emergency screen share the same position. Before, in that case, the app silently computed from the plan entrance and presented it as your position.

### Multi-level native

If you're on level 2 and the nearest exit is on level 0, the route **automatically crosses inter-level junctions** defined by the plan author. The result shows the target exit's level (badge "N0", "N1", "N2"…).

### Haptic feedback

- Exit found → short confirmation vibration (if enabled in Settings)
- No exit identified → alert vibration + explanatory message reminding the expected tags

> 🔒 **100% offline** — the computation runs on your device (POI filtering + pathfinder client-side). Zero network request.

---

## 🗺️ Reading the map

Once the map is loaded:

- **Pinch / zoom** to enlarge or reduce the view
- **Drag** to move on the map
- **Click** on an icon to display the point's information
- **Double-click** on an icon to quickly zoom in on it with a smooth animation (= shortcut equivalent to the "Go there" button in the popup)

The **+** and **−** buttons at the top left allow you to zoom. The layer control at the top right allows you to show or hide information layers.

> 📐 **Adaptive icon size**: the size of icons adapts automatically to the zoom level. When zooming out, they shrink to keep their size proportional to the map. You can disable this behavior in ⚙️ Settings → 🔍 Display → "📐 Adapt icon size to zoom" if you prefer the default Leaflet behavior (fixed screen-size icons).

### 🌐 GPS coordinates in popups

If your map is **GPS calibrated** (see "Export to geolocated KMZ" section for 2-point calibration), a new element appears in the popups of points:

📌 Point name
[Description if present]
🌐 48.85661° N, 2.35222° E 📋
- Displayed just after the description (new line).
- **5-digit decimal** format (~1 m precision).
- **📋** button: copies the coordinates to the clipboard (`lat, lng` format ready to paste into Google Maps, OsmAnd, location SMS, etc.).
- Visible for **session points AND data layer points** (wells, vehicles, etc.).
- **Not displayed** for paths / zones / structures (these are multi-point geometries, not a single coordinate).
- If the map **is not calibrated**, the line does not appear (absolute backward compatibility).

> 💡 **Typical use case**: on a cataphile outing, you find an unlisted well, you add it via ✏️, you click on it → you can instantly copy its GPS coordinates to send them to a teammate by SMS or to mark them later in Google Earth.

### 🌀 Inter-plan links

You can **link a point on one plan to a point on another plan** — like a "portal" between two touching networks (two neighboring quarries, or an overview plan and a detail plan).

**Create a link**:
1. Click a point (session **or** data layer) → in its popup, button **"🌀 Link to another plan"**.
2. Pick the **target plan** from your library, then **search the arrival point** (by name, id or tag) — no need to open the other plan, its points are read in place.
3. The link is created **both ways**: it shows in both points' popups.

**On the map**: you choose whether a linked point stands out or not. By default, **nothing distinguishes it** (it keeps its usual tag and icon). If you want to mark it visually, give it the new **"Portal" tag**: it then gets a **dedicated vortex icon** (golden ring, blue spiral). *(The old automatic golden badge has been removed.)*

**🌀 My links**: on the **home screen**, the **"🌀 My links"** button lists all your links (across all plans): each side's status (⛔ if the plan is not on this device), **➜** button to jump straight to either point, **🗑️** to delete. If a plan's data is unreachable (server offline…), the app tells you clearly instead of showing "0 points".

> 📐 **“Alignment gap”* — each link can show a distance in metres. **This is not a distance to walk.** A portal's two ends mark the **same physical spot**, seen from two different plans: if both plans are properly georeferenced, those two ends should land at the exact same place on the world map. The gap shown measures how far they miss by — in other words, **how good your alignment is**. The smaller the figure, the better. This is the only place in the app that can tell you, because it takes **two** georeferences to reveal it.
> 
> - The figure only appears if **both** plans are georeferenced. Otherwise **nothing** is shown: the measurement is impossible, and writing “0” would suggest a perfect alignment.
> - **No colours, no thresholds** — deliberately. A 20 m gap is huge in a small quarry and negligible across a 5 km network. You get the figure; you are the one who judges, with your own scale in mind.
> - In **OSM View** (full screen → 🎚️ Filters → 🌀), the same measurement appears as a list sorted **worst first**: whatever needs realigning is at the top. Clicking an entry frames both ends of the link on the map.
> - A gap that looks absurd almost always comes from **one of the two plans' georeferencing**, not from the link itself.


**🕸️ Graph view**: in the same window, toggle **📋 List ⇄ 🕸️ Graph** — your library drawn as a **network**: each plan is a bubble (V2/M-LVL badges, link counter, golden ring on the current plan, grayed ⛔ if missing from this device), each border a line whose **thickness follows the number of links**. Plans without links sit in a strip at the bottom. **Click a bubble** to open the plan (arriving at its first portal), **click a line** to see that border's links in detail (the list filters itself), and **drag the bubbles** to arrange the view your way.

**Use a link**: in the point's popup, a 🌀 line shows the destination plan and point → **➜** button → confirmation → the app **switches plan** (your current session is saved automatically), **switches to the arrival point's level** (multi-level plans) and drops you **right on it** (blue flash). If a tag filter hides the arrival point, a warning is shown — your filters are never modified.

**📍 Automatic recalibration on arrival**: when you **physically cross** a portal (a link's ➜ button, or an inter-plan route's "Take the portal"), your **tracker position is recalibrated onto the arrival point** of the target plan — you ARE there, the app knows it. Multi-plan search and the links manager do **not** recalibrate (viewing a point ≠ moving there). And if a route is active on the arrival plan, it replans from the portal.

**🧭 Inter-plan route**: request a route to a point **on another plan** connected by a portal — from the **Route** modal ("🌐 Destination on another plan" button) or the **multi-plan search** (🧭 button on a distant result). The app compares available portals at **real cost**, shows the trip in steps ("① Reach 🌀 North well — 450 m · ② Cross · ③ Reach the room — 300 m · Total ≈ 750 m") and **draws the route on your plan**. Each plan's avoidances (zones, points, tags) are honored. If it's impossible (no portal, plan offline, destination cut off from the network…), a message tells you **exactly why**.

**🚶 The trip follows your pace**: the summary button is "**🗺️ Let's go**" — it does not teleport you. You **walk** your route (with "📍 I am here" stop validation and replanning on recalibration), and the crossing is offered when you are **at the portal**: floating "**🌀 Next portal (X m)**" button (dismissible — "📍 I am here" on the portal point brings it back), or the portal point's ➜ button. At each crossing, the rest is drawn automatically on the other side, all the way to the destination.

**🧭 Your stops first**: set your **waypoints** in the Route modal (curiosity X, Y…) then pick the distant destination — the trip goes through **all your stops in order, before the portal**.

**🌀 Across multiple plans**: check "**🌀 Route across multiple plans**" in the multi-plan search (choice remembered, unchecked by default) → the app can compute a trip that **crosses intermediate plans** (A → B → C, up to 3 crossings), comparing every portal combination at real cost. An unreachable intermediate plan is set aside (and named if no path survives). Each arrival draws that plan's leg and offers the next portal.

**🔄 Always-fresh popups**: if you rename or move a linked point, the link entries (on both sides) **update automatically** the next time the plan is opened.

**↩️ Going back**: after taking a portal (or a multi-plan search jump), a floating **"↩️ Back: <plan>"** button appears at the bottom of the screen for 15 seconds — one click brings you back to the plan **and the exact view** you came from (level and zoom included). Jumps stack up: chain 3 portals, you can go back 3 times.

**↩️ Discreet Back button**: if the button bothers you, two new controls on it — **[–]** shrinks it to a discreet **↩️ mini-chip** at the bottom right (it stays until it expires, one click re-expands it), **[✕]** closes it **and forgets the stacked returns** (closing means giving up the return chain). Your [–] choice is remembered: once minimized, future returns arrive directly as a mini-chip.

**Good to know**:
- A point can carry **several links** (a "hub" point).
- If the destination plan is **not on your device**, the link still shows (⛔) — add the plan to be able to "go there".
- **Deleting a point** also deletes its links (both sides).
- Links **travel with the session export** (restored on import on another device).
- A distributed plan ("data layer") can embed ready-to-use links: you can **use** them, not edit them.

### 🔎 Multi-plan search

Search for a point across **every plan in your library** at once, without opening them one by one:

- **From the home screen**: the **🔎 search bar at the top of the screen**, centered in the header. **Results show up live under the bar** from 2 characters (plans + points, with the plan badge) — clicking a result loads the plan and centers the map. **Enter** or 🔎 opens the full search. On mobile the bar takes the header's second line.
- **From the map**: open the search (Ctrl+K or 🔍) → **"🌐 Search across all plans"** button at the bottom — your current input is kept.

The app reads each plan's points (session + data layers) **in place**, showing progress ("Reading 2/5: Oise…"). Each result carries the **badge of the plan** it belongs to. One click: confirmation (if a plan is open), the right plan loads, the right level is selected and the view centers on the point — with the ↩️ Back button to return.

---

## 🧭 Interface overview

The interface is organized into **13 groups** spread over the **two side bars** — left: ⭐ Favorites, 📚 Help, ⚙️ Settings, ⬇️ Load, ⬆️ Save, ⏪ History; right: 🔍 Search, 🧭 Tracker, 📐 Measurement, ✏️ Edit, 🛣️ Paths, ⬛ Zones, 🏛️ Structures:

| Group | Icon | What it's for |
|---|---|---|
| **Favorites** | ⭐ | Your favorited points, one click away |
| **Help / Documentation / Legend** | 📚 | Help, documentation, AI Help, icon legend |
| **Settings** | ⚙️ | Settings, scale calibration, debug *(direct click)* |
| **Search** | 🔍 | Quickly find a point on the plan *(direct click)* |
| **Load / Import** | ⬇️ | Import a session or a GPX, plan data editor |
| **Save** | ⬆️ | Export your session, the plan as an image, or a printable PDF |
| **History** | ⏪ | Undo (`Ctrl+Z`) / Redo (`Ctrl+Y`) |
| **Tracker** | 🧭 | **Full-screen menu**: start / stop tracking, recalibrate, My position, path lock, route, replay, heatmap, Lost Mode, Rescue Mode |
| **Measurement** | 📐 | Measure a distance or an area, clear |
| **Point editing** | ✏️ | Add your own points *(direct click — ON/OFF switch)* |
| **Paths** | 🛣️ | Draw main roads, secondary roads, paths, junctions, **compute the total distance** |
| **Zones** | ⬛ | Draw backfill, collapse, water or inaccessible zones |
| **Structures** | 🏛️ | Pillars, walls and working faces |

> ⚠️ **The plan Generator is NOT in this bar.** Creating or editing a plan happens **from the home screen**, via the **🏗️ Generate a plan** button — creation actions live outside map mode.

> 💡 **“My annotations” layer** in the ≡ Filters modal (top right of the map, three-bar button): it groups **everything you add** — points, paths, zones, structures. Unchecking it hides all your additions at once without deleting anything.

**How it works:**

- **Only one group open at a time** — pressing another group closes the previous one
- **When a mode is active** (measure, add, road, zone, recalibrate), the group **remains open** so you can quickly access the associated actions (delete a point, etc.). The main icon changes to reflect the current mode
- **Touching outside** the open group closes it automatically
- **On mobile in landscape**, the bar becomes vertically scrollable if it overflows the screen

> 🛡️ **Opening a window cancels the active tool* — if you are in **measure, point editing, path, zone, structure or recalibration** mode and you open a modal on top (Settings, Filters, Documentation, Rescue Mode…), the mode disarms itself. Before, it stayed armed behind: after closing, your map clicks went into the tool with nothing to remind you, and the button stayed lit without effect. **The tracker is never cancelled** (it runs in the background, it is not a click mode), and the form of a point you just placed does not cancel editing — you can chain your points normally.

### 🎨 Customise the legend (rename, hide, colours, custom types)

Open **≡ Legend** (📚 Help / Documentation / Legend group) then **✏️ Edit**. For each trace, zone or structure type:

- **Rename**: type your own label (e.g. "Principal" → "Main gallery"). It shows everywhere: legend, popups, stats, filters.
- **🎨 Change the colour**: one colour square per row — and for **zones and pillars/walls, two squares**: fill and an **independent border**. The colour applies **everywhere** — map, image/PDF exports, KMZ, statistics, session report — immediately, no reload. A **↺** button restores both fill AND border. Details: with no border chosen, a zone derives it automatically (darker shade) and a pillar/wall keeps its black outline (the historical default); a recoloured *Inaccessible* zone loses its hatching (fixed pattern) in favour of a flat fill. **Custom entries** are edited the same way, live.
- **👁️ Hide**: the checkbox removes the entry **from the legend box only** — nothing disappears from the map. To hide objects on the map, use the **🔍 Filters** panel.
- **➕ Add a custom entry**: create your own types (trace, zone, structure, icon) with their colour. They become drawable from the sidebar, and a custom icon is offered in the point editor.
- **🗑️ Delete a custom type**: if drawn objects still use it, the app warns you with the count before confirming.

> 🧳 **Your legend travels with your exports**: an exported data layer carries the definition of the types it uses, and the generator picks it up on import (whatever already exists in the plan keeps priority). The session JSON and the Advanced ZIP carry it too.
>
> ⚠️ **"Orphan types" banner**: if objects use a type that no longer exists in the legend (deleted entry, old layer), the ≡ Legend modal shows it at the top with the count — those objects render in fallback colours until you recreate or re-import the entry.

Everything is saved automatically in your session, **per plan**.

### 🔄 Quickly change map via the title

The **current map title** at the top of the screen is **clickable**: it opens the **“🗂 Change map”** window — the current map's card (`● ACTIVE` badge), the **last 3 maps** opened, and a **📚 See all my maps** button back to the home screen. The **compass rose 🧭** left of the title goes straight to the home screen.

When you pick a map, your current session is **saved automatically** (auto-save + snapshot) before switching: there is no “changes will be lost” warning any more. To close without doing anything: ✕, click outside or **Esc**.

---

## 🔍 Unified search

The **🔍** button in the side bar **OR** the keyboard shortcut **Ctrl+K** (`Cmd+K` on Mac) opens the search window.

> 🔍 The search covers **4 categories**: 📍 Points · 🛣️ Paths · ⬛ Zones · 🏛️ Structures (pillars / wall / quarry faces).

### 🔎 What you can search for

**For points**:
- The **name** (e.g.: "Ventilation Well")
- The **identifier** (e.g.: "PA1")
- A **tag** (e.g.: "pa", "danger", "elec")
- The **description**
- The **state**

**For paths / zones / structures**:
- The **label** (auto-generated of type "Main Path #3" or "Pillar 1st mass #1" if not explicit)
- The **type** in French (`Principal`, `Eau`, `Pilier 1ère masse`...)
- The **level** (in multi-level mode)

**🌐 GPS coordinates** *(only if the map is georeferenced)*:
- Paste directly a pair of coordinates in **Google Maps format**: `48.680831, 2.158843`
- The app converts to position on the map via the map's GPS calibration
- If a **POI exists within 50 px around** → green card "🎯 Go to point" with distance displayed
- Otherwise → blue card "➕ Create a point here" → opens the input form pre-filled at this position (= 3 clicks total from Maps: Ctrl+K · Paste · Create)
- Off-map or non-calibrated map → explicit error message (orange / red)

The search is **accent and case insensitive** — typing "aeration" will also find "Aération".

### ⚙️ How it works

1. **Open**: click on **🔍** OR type **Ctrl+K** (Cmd+K)
2. (Optional) Check **filter chips** under the field
3. Type your search in the field — results display in real time
4. Navigate with the **↑** / **↓** arrows or with the cursor
5. Validate with **Enter** or by clicking
6. The map centers on the element:
   - **Point** → orange circle around + information popup
   - **Path** or **quarry face** → 4 sec dashed yellow polyline + info popup
   - **Zone** or **pillar / wall** → 4 sec transparent yellow polygon + info popup

> 🔁 **Press Ctrl+K again** when the modal is already open → it closes. Handy for quick back-and-forth.

### 🎚️ Filters (Category + Layers + Tags)

Below the search field, up to three lines of chips:

- **Category**: 4 chips `📍 Points (N)` · `🛣️ Paths (M)` · `⬛ Zones (K)` · `🏛️ Structures (L)` with counter per category. Click to activate (yellow) or deactivate. No active chip = all categories visible. This line only appears if **at least 2 categories have content** on the map.
- **Layers**: one chip per layer (Shafts, Underground quarry, My additions, etc.) — **only for points** (other categories have no "layer" notion).
- **Tags**: one chip per tag found in the points (pa, open, closed, ventilation, etc.) — **only for points**.

**Combination logic**:
- **Multiple chips on the same line** = OR (any of them)
- **Between lines** = AND
- The text field remains an additional filter (in AND)

The **✕ Clear filters** button appears to the right of the counter when at least one chip is active. Filters are **reset each time** the window is opened.

### 📊 Grouped rendering

Results are **grouped by category** with headers:

📍 POINTS (12)
  ┌─────┐
  │ icn │ PA1 Ventilation Shaft
  │ │ Shaft · ventilation · open · x:4843 y:2002
  └─────┘
  ...

🛣️ PATHS (3)
  ┌─────┐
  │ 🛣️ │ Main Path session #1
  │ │ Session · Main · Lvl 0 · 8 pts
  └─────┘
  ...

⬛ ZONES (1)
  ...

🏛️ STRUCTURES (2)
  ...
### 🧭 Scope

The search covers:
- **Points**: all data layers of the map (shafts, vehicles, etc.) + your added points (session)
- **Paths**: your session + the routes embedded in the data layers
- **Zones**: same
- **Structures**: same

---

## 📍 Position tracker

> All tracker buttons are in the **🧭 Tracker** group of the sidebar.

### 🧭 Tracker menu (full-screen modal)

The **🧭 Tracker** button opens a **full-screen modal of large tiles**, arranged in three sections: **Tracking**, **Tools**, **Emergency**. Each tile closes the modal as it acts.

**Available tiles**:

| Icon | Action |
|---|---|
| **▶️** / **⏹️** | Play / Stop tracking (the icon toggles dynamically based on state) |
| **🧭** | Compass (compass rose widget) |
| **📍** | Position recalibration |
| **🎯** | **My position** — recenter the map on you |
| **🔓** | **Suspend trace lock** — temporarily (30 s → 10 min) |
| **🗺️** | Calculate a route |
| **🗺️** | **Oriented map** — the map turns with you while tracking |
| **🪧** | **Itinerary guidance** — Auto / Never ("In 40 m, turn left" banner) |
| **🎬** | Tracker session replay |
| **🔥** | Heatmap — see dedicated section |
| **⛑️** | I'm lost — **SOLID RED button** (danger signal) |
| **🚨** | XL Emergency Mode — **SOLID RED button** (danger signal) |
| **🚨** | Rescue Mode — search plans (teams + zones), **RED background** |

> 🚨 **The 3 emergency tiles (⛑️ I'm lost, 🚨 XL emergency mode, 🚨 Rescue Mode) form the Emergency section, at the bottom, on a bright red background.** The **🚨 Emergency exit** button (nearest exit) lives in the **top bar**, one tap away.

> 🧭 **Bottom bar**: the 🧭 indicator shows **ON · 👣 steps · distance** live while tracking, and **a tap on it opens the Tracker menu**. When tracking starts, the warning dialog offers **🔆 Keep the screen on** (pre-ticked): a screen that goes off means lost steps. The **≡ Filters** button carries a badge with the number of active filters (levels included); when a map is reloaded, a message tells you if filters were restored. In **📊 Session details**, the first line says **“✅ Saved N s ago”** (red if saving fails).

> 🆕 **In the field**:
> - **🎯 My position**: recenter the map on your current position (handy after panning elsewhere).
> - **🔓 Suspend trace lock**: if "trace lock" (smart navigation) is on and you **leave the gallery network** (e.g. entering a cave), you can disable it temporarily (**30 s / 1 min / 10 min / until reactivation**) without going through settings. A **🔓 countdown shows in the bottom bar**, next to the tracker ON/OFF indicator; tap it to reactivate (confirmation asked).
> - **⚙️ Advanced settings**: in ⚙️ Settings → *Navigation & Tracker*, the lock's **lateral tolerance** and **heading weight** are adjustable (to tune junction behavior). Step length, threshold and cooldown are now **clamped** to avoid nonsensical values. ⚠️ Expert settings — set the plan's m/px scale first.

### ▶️ Start tracking

Press **▶️** to start.

**On the first start of the session**, a warning popup appears to remind you that the tracker is an **experimental module**: it's used to validate the calibration / step detection / heading formula, **not to actually locate yourself**. Click **"Understood — Start"** to continue (the popup won't reappear before the next page reload). On Mobile, the iOS / Android permission request for sensors appears next — accept it.

An icon appears on the map at your starting position. It moves as you walk, and a path records the route you've traveled.


> #### 🧭 "Oriented map" — the map turns with you
>
> In the 🧭 Tracker menu, the **🗺️ Oriented map** tile changes how the map behaves while tracking: instead of the icon spinning on a fixed map, **the map itself turns**, so that your walking direction always points to the top of the screen (like a car GPS).
>
> - **Off by default**, and your choice is remembered on this device.
> - It only turns **while tracking**: when you stop the tracker, the map goes back upright.
> - The map **follows you**: if you drag it aside to look elsewhere, a **🎯 Recenter** button appears to bring you back (it also appears without this mode, as soon as your position leaves the screen).
> - Text stays readable: measurements and point cards do not turn upside down with the map.
> - The map straightens by itself as soon as you pick a tool that needs a tap on the map (measure, draw, realign) or open a full-screen mode.
>
> ⚠️ The rotation follows your compass: **near large metal masses** (rails, rebar, structures) it can become approximate — like the rest of the tracker.

> 🧭 **Directional icon**: during active tracking, the icon (blue cone + white dot, GPS style) **rotates in real time to point in the walking direction** — calculated from the phone's heading (same source as the compass 🧭). At rest (tracker stopped or recalibration only), the icon points North (neutral pose). Built-in smoothing to avoid jitter.

Press **⏹️** to stop.

> ⚠️ **Important**: cumulative drift is inevitable. Manually recalibrate your position (📍 below) every ~50m at a recognized point on the map. The metal reinforcements in underground quarries and galleries strongly distort the phone's magnetometer — a real physical compass remains essential.

### 🧭 Compass — verify heading consistency

The **🧭** button in the **🧭 Tracker** group displays a **floating compass rose** at the top left of the map (below the zoom buttons). The rose counter-rotates in real time so that the **N always points to true North**.

> 🧭 The compass-dedicated rose displays **N/S/E/W clearly marked** + a red arrow on North, for easy reading. The MyKTAMap logo is still used for the splash/loader (visual identity).

**How to verify everything is consistent?**

Hold the phone flat in your hand, screen facing you, **top edge of the phone in your walking direction** (compass pose). By turning around:

| Walking direction | The N of the rose should be... |
|---|---|
| North 🧭 | Up (12 o'clock) |
| East ➡️ | Left (9 o'clock) |
| South 🧭 | Down (6 o'clock) |
| West ⬅️ | Right (3 o'clock) |

If the orientation is consistent, the tracker correctly records your movements. Otherwise, suspect a magnetic disturbance (reinforcements, scrap metal, ground) — recalibrate via 📍 as soon as possible and limit confidence in the path.

> 🧭 The compass and the rotation of the tracker icon work correctly in **landscape mode** (phone held horizontally) and in **inverted portrait**: instant recalibration as soon as you turn your phone, the N stays at visual top regardless of orientation. All 4 orientations are covered.

**Click on the widget** to open an **enlarged display** in full screen (240px rose + large cardinal + exact angle). Handy for validating from afar or doing a demo. Close via ✕, Escape, or by clicking next to it.

The widget remains displayed even when the tracker is stopped — you can use it to validate the compass without starting tracking. ✕ on the widget to close it entirely.

### 📍 Recalibrate your position

The calculated position inevitably drifts. As soon as you recognize a landmark on the map:

1. Press **📍** — the button lights up green
2. Tap the point on the map corresponding to your actual position
3. The icon moves to the chosen location and the path restarts from scratch
4. Recalibration mode closes automatically after the click and the directional icon (blue cone) takes over — no need to click 📍 again to deactivate the mode

> Only one mode can be active at a time: measure, add point, route drawing, or recalibration.

### 🎬 Tracker session replay

The **🎬** button in the **🧭 Tracker** group opens the **Replay** modal. It lets you **replay your tracking session** from the beginning, with an interactive timeline and CSV export.

**How it works**:

- While you're tracking, the app internally records a **timeline**: for each applied PDR step, each manual recalibration, and the start moment, it stores `(timestamp_epoch_ms, x_map, y_map, type)`.
- On clicking 🎬, a full-screen modal opens with:
  - **Timeline slider** (left → right = start → end)
  - Buttons **⏮ Restart · ▶️ Play · ⏸ Pause · ⏭ End**
  - **Speed** selector: 0.5× · 1× · 2× · 5× · 10×
  - **💾 Export CSV** button
  - **⛶** button to toggle to compact mode (bottom sheet) that frees up the map
- On pressing **▶️ Play**, the modal **automatically switches to compact mode** — you see the map large while the yellow marker replays your steps. The trail (line) extends as it goes.

**Keyboard shortcuts**:

| Key | Action |
|---|---|
| Space | Play / Pause |
| ← | Go back 1s |
| → | Go forward 1s |
| Escape | Close the modal |

**💾 Export CSV button** produces a `.csv` file with 5 columns (or 6 in M-LVL):

timestamp_ms_epoch,delta_ms_since_start,x_map,y_map,type[,level]
- `type` = `start` (tracking start), `pdr` (PDR step applied), `recalage` (manual recalibration)
- Openable in Excel / LibreOffice / Numbers / Python pandas / R / etc.

**Case of recalibrations**: a recalibration = teleportation. Visually, the trail jumps (no line between point N and N+1 if type = recalage) so as not to display a straight line that has no geographical reality.

**Reset**: the timeline is reset when the map is changed or on reload (RAM-only).

### 🔥 Heatmap — passage density

The **🔥 Heatmap** button in the **🧭 Tracker** menu opens a modal that draws a **density map** over your map. Handy for visualizing at a glance the **most frequented areas** (key passages) vs those rarely used.

> 📌 **Relevance**: the heatmap relies on interpolation along segments + histogram normalization + filters on the tracker timeline, for a faithful rendering of actual frequentation.

#### 🗂️ 6 checkable sources (combinable)

You choose what contributes to the displayed heat:

| Source | Content |
|---|---|
| 🧭 **Tracker timeline** | All points of your tracking session (filtered: skip recalibrations = teleport, skip starts, skip gaps > 5 min) |
| 📍 **Session points** | Your points added via the editor |
| 🛣️ **Session paths** | Your routes (Main / Secondary / Path) drawn in session |
| ⬛ **Session zones** | Your zones (water / backfill / collapse / inaccessible) |
| 🏛️ **Session structures** | Your pillars / walls / quarry faces |
| 📊 **Data layers** | All elements embedded in the map's data layers (points + roads + zones + structures + quarry faces) |

#### 🎚️ Live settings

Two sliders at the bottom of the modal, real-time update:

| Slider | Range | Effect |
|---|---|---|
| **Radius** | 10 - 120 px | Spread of the "blob" around each point. Small = locally precise, large = macro view |
| **Intensity** | 0.2× - 3.0× | Global multiplier. If everything is too pale → increase. If everything is saturated red → decrease |

#### 🏗️ M-LVL level filter

If your map is **multi-level** (underground quarry with several floors — ground floor, basement, mezzanine, etc.), a new **"🏗️ Levels to include"** section appears in the Heatmap modal.

- **Chips per level**: one clickable pill per level available in the map (`Lvl -2`, `Lvl -1`, `Lvl 0`, `Lvl 1`...)
- **Pre-selection**: levels **currently visible** on the map are pre-checked automatically
- **⇅ All button**: (un)checks everything in one click
- **Effect**: the heatmap restricts collection to items belonging to the selected levels. Handy for generating a heatmap dedicated to the ground floor only (for example), or for comparing density between 2 floors without cross-pollution.

> 💡 **Use case**: you want to compare the frequentation of the ground floor vs the basement → 2 successive heatmaps with dedicated filter → screenshot of each → you immediately see the asymmetry.

> 📌 If your map is **not** multi-level, this section does not appear at all.

#### 🎯 Algorithms (why it's relevant now)

- **Interpolation along segments**: for paths / zones / polyline structures / tracker timeline, the app distributes heat points **along the path** instead of a single point per vertex. Result: you see real **continuous trails**, not spaced "pearls".
- **Histogram normalization**: the densest pixel of the image = pure red, the least dense = pure blue, smoothed gradient in between. **Auto-adaptive**: no need to manually adjust thresholds, it works just as well on a 20-point map as on a 5000-point map.
- **Tracker timeline filter**: skip teleportations (recalibrations), starts, and gaps > 5 min (pause without moving should not generate phantom heat).

#### 💡 Use cases

- **Identify the main passages** of an underground quarry: what comes out red = where you actually pass, vs what comes out blue = explored once
- **Completeness audit**: blue zones = under-mapped → next field objective
- **Visual presentation** of a session: heatmap screenshot + comment to share a macro view of the explored map

> ⚠️ The heatmap is **purely visual** (canvas overlay). It does not alter the map, the annotations, or the exports. Close the modal to hide it.

### ≡ Unified Filters modal

The **≡ three horizontal bars** button at the top right of the map opens the **unified Filters modal**, a window that groups **7 filtering sections**:

| Section | Filters what |
|---|---|
| 🖼️ **Image layers** | Base image + additional layers (legend, signage, etc.) |
| 📊 **Data layers** | The `puits`, `vehicule`, `cataphile`, `editor` (= My annotations) layers, etc. |
| 🏗️ **M-LVL Levels** *(if multi-level map)* | Active level (drawing) + visible levels (multi-selection) — **synchronized** with the classic Levels modal |
| 🏷️ **Point tags** | Filter by tag (ventilation shaft, room, squeeze...). Auto list = tags **actually present** in the map with counter. |
| 🛣️ **Path types** | Main / Secondary / Path / Junction + customs |
| ⬛ **Zone types** | Water / Backfill / Collapse / Inaccessible + customs |
| 🏛️ **Structure types** | 1st mass Pillar / 2nd mass Pillar / Wall / Face 1 / Face 2 + customs |

> 🔄 **Correcting a data layer** — a layer shipped in the plan's ZIP is **read-only**: you can hide it, not edit it. Each line of the **📊 Data layers** section therefore has a **"🔄 Edit"** button: its content moves into your session, where all your tools apply — in particular **🔄 Convert this object**, to turn a quarry face into a gallery on an imported survey. The original layer **hides itself** (its checkbox shows "being edited — show anyway", which you can tick again to compare both). **"↩️ Restore"** undoes everything; **"💾 Export"** gives you a corrected file to hand back to the plan via 🏗️ Generator → "Edit a plan", by clicking **"Choose" on that layer's line** — it REPLACES the old content, no duplicate is possible.
>
> ⚠️ **What the app tells you before acting**: the weight the copy will take in your session (a large survey exceeds a megabyte, and the browser's limit is around 5 MB for all plans together) and the space already used. On export, it also tells you how many objects **you drew yourself** are left out — they don't belong to that layer. And "Clear session" **restores** the layers opened for editing: the copy and the hiding go together.

**How it works:**

- **Live update**: each toggle (checked/unchecked) applies the filter **immediately** on the map.
- **Accordion sections**: click on a section header to collapse/expand. All open by default.
- **Quick buttons per section**: `👁️ All` and `🚫 None` to toggle all items at once.
- **🔄 Show all button** (footer): resets all runtime filters (tags + types) to their neutral state (= everything visible). Does NOT touch the M-LVL toggles or the image/data layers — each kept independent.
- **Status footer**: counts active filters at the bottom (`Active filters: tags, paths`) in yellow if at least one active, gray if everything neutral.

**Per-map persistence**:

The tags + types filters are **saved in the map's session**. If you enable "hide shafts" on map A, then switch to map B, then come back to A → your filters are **automatically restored**. Each map has its own filters.

**Bidirectional M-LVL synchronization**:

The 🏗️ M-LVL section of the Filters modal **coexists** with the M-LVL pill and the classic Levels modal. Any action on one side is reflected on the other:

- You tick `Lvl 1` in the Filters modal → the Levels modal and the map are updated.
- You use the M-LVL pill to change active level → if the Filters modal is open, its 🏗️ section refreshes live.

> 💡 **Typical use case**: you work on a large quarry with many tags. You are only interested in open shafts (tags `peo` and `cao`) to plan a ventilation tour. Open ≡ Filters → 🏷️ Tags section → click 🚫 None then re-check `peo` + `cao`. The map only displays these 2 categories. Automatically saved for this map.

> 📌 **Compatibility**: sessions saved before this feature arrived are restored without active filter (= everything visible). The first interaction with the modal creates the state and persists it at the next auto-save (≤ 1.5 s).

> ⚠️ **The in-progress drawing is always visible**: if you are drawing a route and you uncheck its type in the filter, **the current drawing stays visible** so you don't get lost. Other drawings of the same type are hidden as expected. Same for in-progress zones and structures.

### ⚙️ Tracker settings

Access the settings via the **⚙️ Settings** button in the side bar:

- **Scale (px/m)**: pixel/real-meter ratio — **🎯** button next to it to calibrate
- 👣 **Step length, detection threshold and cooldown are yours, not the map's**: set once, they apply to **all your maps** on this device, and travel with your profile. The Generator no longer offers them (a map has no stride), and an older map that carried them is simply ignored. "Reset" brings them back to the app's factory values.
- **Step length (m)**: estimated length of your stride (≈ 0.7 m)
- **Detection threshold**: sensitivity of the step detector
- **Cooldown (ms)**: minimum delay between two steps
- **Initial X / Y position**: starting point of the icon at load

> 🧭 **Assisted entry of the starting position** — no more need to type the coordinates by hand. Below the X / Y fields, two buttons:
> - **🔍 Choose via a point**: searches for an existing point (by name, identifier or tag) and selects it as the starting position.
> - **📍 Click on the map**: the settings window is hidden, you click the desired spot on the map, and the coordinates auto-fill (**Cancel** button to exit without choosing).
>
> Same input logic as georeferencing. Remember to **💾 Save** to keep the setting.

### 🧭 Smart navigation (snap position onto the paths)

Underground, satellite GPS doesn't work: the tracker estimates your position with **your steps + the compass**, which **drifts** over time. If your map contains a **network of paths**, **smart navigation** continuously snaps your estimated position **onto the nearest gallery** to compensate for this imprecision.

**Activation**: ⚙️ Configuration → **"🧭 Smart navigation"** → check "Snap position onto paths". **Disabled by default**, reversible at any time.

- When you **move forward**, the position follows the gallery; at **intersections**, the branch that matches your **heading** (walking direction) is chosen.
- If you **leave the drawn galleries** (uncharted area), **automatic** return to classic mode, then re-snap as soon as you come back near a path.
- **Without a network of paths** on the map, the option is **without effect**.
- Fine tuning possible (snap tolerance) — ask if you want to adjust it.

> 💡 The **manual recalibration (📍)** remains your best friend: as soon as you recognize a landmark, recalibrate — smart navigation then restarts from a clean base.

> 🧭 **Your track is preserved**: it is **redrawn at app reload** (rebuilt from the session history), and the **📊 Statistics** recap shows your **distance traveled + number of steps**.

### 🗺️ Calculate a route

The **🗺️** button in the **🧭 Tracker** group opens the route modal. It calculates the **shortest path** between 2 or more points using the **existing roads** of the map (both those you have drawn and those present in the data layers).

**To draw a route:**

> 💡 **🧭 My position button** — adds your current tracker position as a waypoint (frozen snapshot). Handy if you are walking in the cata with the tracker active and you want to calculate a route starting from where you are. If you recalibrated your position at the start, it's this recalibrated position that is used.

> 🚀 **Perf tip**: if your roads are already drawn solidly on the PNG of the map, you can **hide the roads layer** in the Leaflet layer control (top-right). You keep visual readability (the PNG shows the roads) AND you gain rendering perf (Leaflet doesn't draw the data polylines on top). The **🗺️ Route module continues to work**: it uses all the roads of the layer, whether displayed or not.

1. Open the **🗺️ Calculate a route** modal
2. Choose your **waypoints** in 2 ways (combinable):
   - **📍 Map click mode**: the modal shrinks to a mini-banner "Click mode active", click on the map to place each waypoint (numbered cyan markers). **✓ Finish** button to return to the modal.
   - **🔍 Search**: type the name, ID or tag of an existing point; click in the suggestion list to add it.
3. You can **remove** a waypoint with the ✕ button on the right of each line.
4. Click **🎯 Calculate the route**: a **neon cyan** path appears, the app shows you the **total distance in meters** and the number of segments crossed.
5. **💾 Save** keeps the route in the session, **❌ Clear** removes it.

**Distance label**: while a route is active, a small label **🗺️ Route: XX m · ⏱️ time · 🚶 speed mode** is displayed at the bottom left of the map, just above the classic distance measurement label.

**🏃 Estimated walking speed** (segmented control in the modal) — 4 presets to adjust the travel time estimate:

| Mode | Speed | When to use |
|---|---|---|
| 🤕 **Injured** | 2 km/h | Hampered progression, very slow, rough terrain |
| 🐌 **Slow** | 3 km/h | Cautious, tight passages, exploration, gear hauling |
| 🚶 **Normal** | 5 km/h | Default, standard cataphile walking pace |
| 🏃 **Fast** | 7 km/h | Sustained pace, known route, fast return |

The active mode is displayed next to the estimated time in the bottomleft label. The choice is persisted between sessions (on this device). You can switch modes at any time via the modal, the time updates instantly.

**Navigation mode** — when a route is already active and you reopen **🗺️ Calculate a route**, the modal switches to **navigation mode**:

- Quick buttons **⏮️ Start** (centers the map on the 1st waypoint with a flashing cyan circle), **⏭️ End** (same for the last), **🔁 Full tour** (zoom to see the entire path).
- **🎯** button on each waypoint to go view it directly.
- **🔄 Recalculate** switches back to edit mode (the waypoints are kept, you can adjust them).
- **❌ Clear route** completely removes the path.

**Tolerance**: the algorithm accepts that your start or end points may be a bit **off** the roads — it automatically snaps them onto the nearest network. If several roads visually intersect but without sharing exactly the same point (typical case of a hand-drawn path), the app also handles **junctions within 15 px** to trace the route without breaks.

> 💡 **Tip**: if you want to see only the path without the distance label, close the modal then reopen it in navigation mode to use the piloting buttons.

#### 🔄 Living route — replanning on recalibration + stop validation

During a real outing, the tracker can drift and the phone spends time locked in your pocket. The route adapts on its own every time you **recalibrate your position**:

- **Recalibrate your position** (map click in recalibration mode, a point's **📍 I am here** button, or arriving through a portal) → the active route is **automatically recalculated from your new position**. Your position becomes the new point 0, the remaining stops are kept **in the order you planned**, and your avoidance preferences are respected.
- **Validate your passage at a stop**: tap **📍 I am here** on a point that belongs to your route → the stop is **validated** (**green ✓** marker on the map, struck-through line in the modal), excluded from future calculations, and the route restarts from there. **The order is free**: you can visit stop 3 before stop 1 — the app validates what YOU do, not what it suggests.
- **All stops validated** (including your exit) → a small "🎉 Route complete" message and the path clears. Your tracker trail stays on screen.
- **Map-click** recalibration never validates a stop (it is approximate by nature): it only replans.
- Validated stops **survive reloads and phone locking** (saved with the session).

> 💡 In practice: plan your outing (me → curiosity X → curiosity Y → exit), walk, and at each point you reach tap **📍 I am here** on its popup. The app checks it off, recalculates, and always shows the way from where you actually are.

#### 🪧 Guidance — "In 40 m, turn left" (since v1.98.0)

When the **tracker is on** and an **itinerary is drawn** (from the modal, a "🧭 Go there" on a point, or the emergency exit), a **banner** appears on its own at the top of the map and tells you what to do:

- **"In 40 m, turn left"**, **"Continue for 120 m"**, then **"Now: turn left"** as you get close. Underneath, in small print, the next instruction ("Then turn right").
- **Only at junctions**: as long as there is a single gallery to follow, guidance stays silent, even if it bends. It never says "the 3rd on the left" (traces do not show every real opening): always a **distance**.
- **Two close galleries** → "take the left / right branch". When crossing a level link → "go up / down to level N".
- **Big junctions**: several close junctions (5 m or less apart) count as **a single junction**, with **a single instruction** given at its entrance. From **4 galleries** on, a **small diagram** replaces the arrow: each gallery is a line, the one you come from dashed at the bottom, **the one to take in gold**. If a named point lies in the junction, its name opens the instruction.
- **Off the trace at the start** → "Reach the trace: ~12 m", with an **arrow** pointing to the nearest gallery, relative to your phone.
- **Distances**: sharp with **🧭 Smart navigation** (⚙️ Settings → Navigation & tracker); without it they are **approximate** ("~40 m", rounded to 10 m), because the position comes from the step counter and drifts.

**Moving away or turning back?** The banner turns orange ("Off the itinerary?" / "Turning back?") and offers **[I am here]** (tap where you are, the itinerary is recomputed from there), **[Recompute from here]** and **[Ignore]** (no more alerts until you are back on the path). Nothing is recomputed without you: step-counter drift looks like a deviation.

**Tapping the banner** opens the **🪧 Route sheet**: every instruction with its distance (tap a line to see the spot). It is also available **without the tracker**, from the Itinerary modal ("🪧 Route sheet" button), to prepare an outing.

**The ✕** hides the banner **for this itinerary**; it comes back with the next one. To turn it off **for good**: 🧭 Tracker menu → **🪧 Itinerary guidance**.

**As the crow flies**: if your start, a stop or your destination lies beside the galleries, the stretch to the nearest one is drawn **dashed** and **counted** in the distance (an off-trace stop counts there and back). Beyond **50 m**, the app warns you: that stretch is not a known gallery, check your position. On a plan **with no trace at all**, no itinerary can be computed: the app says so right away.

> 🚨 **During an emergency exit**, the banner has **no ✕** and shows even if guidance is turned off; on a deviation, the button becomes **"Nearest exit from here"**. The **XL emergency screen** repeats the instruction in large print.

#### 🚫 Avoidance preferences

In the route modal, a collapsible section **🚫 Avoidance preferences (optional)** lets you set **soft** constraints that the pathfinder will try to respect:

| Type | Description |
|---|---|
| **📍 Points to avoid** | **3 methods** to choose from: (a) autocomplete search in the text field, (b) entry by exact ID, (c) **📍 Click on the map**: switches to click mode, each click on the map adds a point. Orange chips with ✕ to remove. |
| **🏷️ Tags to avoid** | Click a chip to toggle it. All points carrying this tag will be avoided (e.g.: you activate `pa` → all ventilation shafts are avoided). |
| **⬛ Zones to avoid** | Tick a **zone type** in the list (Water, Collapse, your custom types…) so the route **goes around** all zones of that type. **⛔ Inaccessible** zones don't appear here: they're impassable by default (hard constraint, which the "Respect impassable areas" box of this same window can relax). |
| **📏 Margin** | Distance around the avoided points (px, default 100). Any road segment closer than this margin is excluded from the graph. |

**Behavior**:
- ✅ If possible, the route avoids everything (= normal computation)
- ⚠️ If no alternative path exists → the app still computes by going through these points and displays an orange message `⚠️ Cannot avoid: X, Y` above the result
- ❌ If even the fallback fails (= true absence of path) → classic error message

**Difference with ⛔ Inaccessible Zone**:
- ⛔ Zone = **hard** constraint **by default** — can be relaxed with the "Respect impassable areas" box of the Itinerary modal. Rescue Mode and "Lost" mode always respect them.
- 🚫 Avoidance = **soft** constraint (fallback possible with message)

**Persistence**: your preferences are saved per map (on this device). On the next computation on the same map, they are restored. **🗑️ Reset** button to clear everything.

> 🧭 **Where to start, depending on your situation.** The pages below cover four different tools. Which one you need depends on what is happening to you:
>
> | Your situation | The tool | Where |
> |---|---|---|
> | I want **the nearest exit**, right now | 🚨 Emergency exit | "Emergency Exit Mode" section, above |
> | **I no longer know where I am**, but I know where I have been | ⛑️ I'm lost | just below |
> | I am panicking, I need a **screen readable at a glance** | 🚨 "Panic" emergency mode | right after |
> | **I am coordinating teams** looking for someone | 🚨 Rescue Mode | the rest of this chapter |
>
> The four are independent. Rescue Mode is the only one that needs preparation: declared teams, assigned areas.

### ⛑️ Emergency Mode — "I'm lost"

The orange **⛑️** button in the **🧭 Tracker** group opens emergency mode. It estimates the **likely area where you may be right now** based on your last known position, the elapsed time and **visual clues** that you observe around you.

> ⚠️ **Emergency Mode is a geometric aid. It does NOT replace**: an Ariadne's thread, a compass, a lamp with spare batteries, a paper map, and the golden rule of telling someone before going out. If you are really lost: stay calm, don't panic, save your light, and signal your position if you have network coverage.

**How it works:**

1. **📍 Last known position** — enter where you were sure to be X minutes ago:
   - 🔎 **Search** for an existing point by name/id (e.g.: "PA1", "room", "épure XYZ")
   - 📍 **Map click** — direct click on the map to place a marker
   - 🧭 **Tracker position** — uses the tracker's current position if it is active

2. **⏱️ Elapsed time** — slider from 1 to 90 minutes (1h30 max). Beyond that, the area becomes so large that the mode is no longer relevant — prefer then a real rescue signal.

3. **🏃 Assumed walking speed** — a segmented control with 4 presets. Final radius = `speed × time`. The km/h values are **the same as route mode** for consistency (a "Normal" preset represents the same speed everywhere in the app).

   | Preset | Speed | Radius for 10 min | When to use |
   |---|---|---|---|
   | 🤕 **Injured** | 2 km/h | ~333 m | Very slow, hindered progress (injury, fatigue, hesitant walking) |
   | 🐌 **Slow** | 3 km/h | ~500 m | Cautious walking, tight passages, exploration |
   | 🚶 **Normal** *(default)* | 5 km/h | ~833 m | Standard walking pace |
   | 🏃 **Fast** | 7 km/h | ~1167 m | Known route, sustained walking |

   The choice is persisted between sessions (on this device). If the area is already displayed on the map, switching presets recalculates it instantly.

4. **🔮 Visual clues (optional but very useful)** — free text, separated by comma or line break. Examples: *"water can, ram engraving, blue room, broken shaft, descending stairs"*. The app searches these words in the **name**, **description** and **tags** of all the points of the map (layers and session points combined).

5. Click **🎯 Calculate the area**.

**What appears on the map:**

| Element | Meaning |
|---|---|
| **Pulsing orange circle** | Search area (radius = speed × time) |
| **📍 pulsing green** | Your last known position |
| **🔮 pulsing purple** | Text clue that matches AND is **within the area** (the most important) |
| **· gray** | Text clue that matches but is **outside the area** (excluded) |
| **Inner purple circle** | Refined likely location (barycenter of in-area clues) — appears only if there is at least 1 in-area match |

**⚠️ If the area exceeds the map boundaries** (radius too large vs map size), an orange alert banner in the results notifies you: *"The radius exceeds the map size — you could be anywhere"*. Decrease the elapsed time or refine with clues.

**Available actions in the results:**

- **📋 Copy report** — copies a structured text to the clipboard (map, position, time, clues, refined loc, timestamp) to share via SMS, radio or any other means of communication.
- **✅ Delete the area and save my assumed position** — removes the search area from the map AND adds a permanent editor point (⚠️ danger icon) at the likely location. You can then export or convert it like any other point.
- **🗑️ Clear the area and close** — removes the area and markers from the map without saving a point.

**👁️ Close the modal without clearing the area**: the **👁️ Close** button (and the ✕ cross at the top, and the click outside the modal) just close the modal. The area remains visible on the map so that you can explore; reopening **⛑️** restores all your previous settings.

> 💡 **Typical use case** — you came out of the last identified shaft 20 minutes ago, you have been walking since without tracker, and you now see *"a 'Ram' engraving on the wall, and a water can on the floor"*. Open ⛑️, select the shaft as last position, set 20 min, type `ram, can` in the clues. The app shows you the likely area and — if there is a point named "Ram engraving" in the map that falls within the area — a purple circle at that spot.

#### 📚 Good practices when lost

The ⛑️ mode includes a **collapsible block "📚 Good practices"** at the top of the modal (click to open). It gathers the essential advice in 6 sections, to be read calmly if the situation requires it:

**🧘 Keep your calm (first)** — Stop. Breathe. Panic makes you lose your bearings and wastes light + energy. Eat/drink a bit if you have something.

**🗺️ Orientation** — **Retrace your steps** rather than try to reach your destination (statistically more reliable). Look for the **main passages** (main passages, straight galleries, railroad tracks) that lead to known landmarks. **Use a physical compass** — not the one on the phone (distorted by the ground and rebar). **Listen to noises**: traffic, subway, running water = direction clue.

**🔦 Light & resources** — Power saving mode immediately. Keep a backup lamp. Hydrate a bit but save.

**📡 Communication** — If you **get network coverage** (often near shafts / manholes) → notify someone on the surface BEFORE your battery dies. Use the **📋 Copy report** button to prepare a ready-made message with your last position + elapsed time.

**📍 If you decide to wait** — Settle at an **identifiable** spot (numbered shaft, named room). Stay where you are if **no one knows you are there**. Mark your spot so you can be found.

**⚠️ Don't do** — Don't follow water (dangerous diaclases). Don't attempt an unknown passage just because it "goes up". Don't trust the phone tracker (it drifts under stress).

> ⚠️ These tips are **general principles** drawn from cataphile practice. They do not replace training, equipment and common sense. The golden rule remains: notify someone on the surface BEFORE going out, with estimated return time.

### 🚨 "Panic" Emergency Mode

> 💡 **Do not confuse with ⛑️ "I'm lost"**: ⛑️ calculates a theoretical area (where you may be based on a last known position + elapsed time). 🚨, on the other hand, assumes that **you KNOW where you are** (the tracker shows it), but that **you are panicking and you need vital info in large size to react quickly**.

The red **🚨** button in the **🧭 Tracker** group opens a full-screen "panic" mode that gathers at a glance:

- 📍 **One position only, huge** (readable from a meter away): **GPS** coordinates if your map is georeferenced — those are the ones you read out to rescuers — otherwise the **X / Y position on the map**. Never both: the block title tells you which one you are reading. Below the figures, a line states whether this is your tracked position, your last known position, or the **map's starting position, never confirmed**.
- 🧭 **Giant compass**: heading (walking direction) with needle rotating in real time, updated live via the phone's orientation sensors
- 🪧 **The guidance instruction in large print** (since v1.98.0): if an itinerary is drawn and tracking is on, the next instruction ("In 40 m, turn left", diagram of big junctions) shows at the top of the screen. On a deviation, a **"See the options on the map"** button takes you back to the banner and its buttons
- 🗺️ **Auto-focus minimap**: tight zoom (~20-50 m horizon) permanently centered on your position. Displays in the background the **roads / zones / structures of the map** — useful to spot paths, exits, dangers in the immediate vicinity
  It uses **your legend's colours**: if you recoloured a type or created your own types, you recognise them here just like on the map.
  Your **active route** is always drawn on it (bright cyan + white halo, to stay visible on that tightly zoomed background), and the map **rotates** like the main map if you enabled "oriented map" mode.
- 📋 **“Copy my position”**: a square button **to the right of the figures** (tapping the figures works too — that is where your finger goes first). It turns into ✅ while it confirms the copy. If your map is georeferenced it copies **the coordinates alone** — `48.823328, 2.322915` — the format that pastes straight into a text message, Google Maps or Apple Maps with nothing to clean up. Otherwise it copies the **map name and your X/Y position**, which only means something to someone holding the same map. Worth having ready the moment you catch any signal. ⚠️ *The doubt stays on screen, not in the message: if your position was never confirmed, the line under the figures says so — say it too, to whoever you write.*
- 🔋 **One status line at the top right**: your **battery level** (only if your browser exposes it and you have not unticked the setting — otherwise nothing at all, no “?”; critical here: you know how long you have before the phone shuts down), the **tracker** state and the **compass** state. The **map name** sits right under the 🚨 title. *The map scale is gone (v1.97.11): it is a calibration figure, it belongs in ⚙️ Settings, not on the screen where you are looking for yourself.*
- 🌗 **Theme**: the screen follows the app's own (dark or light). There is no dedicated button any more — one setting, in the home screen's ⚙️ Configuration.
- 🔋 **Wake Lock**: the screen does not turn off automatically while the mode is active (no need to touch the phone every 30 sec to wake it up)
- 📱 **Landscape**: the minimap reframes correctly when you turn the phone, and the layout changes — position on the left, map on the right over the full height.
- 🗺️ **Everything fits on one screen**: nothing to scroll any more, and **the map takes all the room freed up** (measured: its height doubled on a phone in portrait).

**When to use it?**
- You panic at an intersection and need to re-orient yourself quickly
- You are looking for a visual detail on the map (a pillar, a shaft) that should be nearby
- You want to check that you are going in the right direction (compass heading)
- You need to read your position in large size to transmit it to someone (radio, SMS) without squinting

**Permissions**: the first time, the browser requests access to the phone's **orientation sensors** (for the compass). Accept — without that, the compass stays frozen.

**Exit**: the large **↩️ EXIT EMERGENCY MODE** button at the bottom of the screen — it stays stuck to the bottom, you never have to hunt for it. On a computer, the **Esc** key does the same.

> ⚠️ As with all digital tools underground: **keep a physical compass** and a paper map in your pocket. The phone can fail, the magnetometer can be distorted by local metal, the tracker can drift. The 🚨 is a quick info reading aid, not a substitute for preparation.

### 🚨 Rescue Mode

Operational tool to **methodically assign rescue teams** to search areas on a cataphile map. Use case: someone is reported missing in a dense network, several teams arrive at the surface, the rescue command center must coordinate "who sweeps what" with a clear, printable briefing.

> 💡 **Different from ⛑️ I'm lost**: ⛑️ is *you* who are lost, you are trying to find yourself. **🚨 Rescue Mode** is *someone else* who is lost, you organize the teams who will look for them.

#### Access

🚨 button in the **🧭 Tracker** menu (emergency section, at the bottom), next to ⛑️ I'm lost and 🚨 Panic. Consistent red emergency background.

#### Workflow

1. **List of scenarios** — You see all scenarios saved for this map (max 10, the oldest are dropped — never a running scenario, the one you have open, nor a finished intervention whose report has not yet left the device).
2. **➕ New scenario** — Lightweight stepper: Name + Context notes + Incident time.
3. **Free-form editing** — 3 accordion sections:
   - **📝 Context**: name, incident time, notes (e.g.: "Marc left around 2pm to check East gallery…")
   - **🚨 Teams**: add as many teams as needed. For each team: name (auto Alpha/Bravo/Charlie...), color (fixed 10-color NATO palette), members (CSV), entry/exit (map click), zone (polygon OR path selection), suggested route (auto-calc via Pathfinder)
   - **📤 Export**: printable PDF (1 page/team) + geolocated KMZ (cross-app)

#### Interactive map modes

| Button | Action |
|---|---|
| 📍 Entry | 1 map click = captures the team's entry position |
| 🚪 Exit | 1 map click = captures the exit position |
| ⬛ Define zone | Choice: (a) multi-click polygon + double-click to close, OR (b) path selection on click: the nearest gallery, among the displayed levels, is taken (re-click = remove, highlighted in red). The map's galleries are found identically on any phone that has the same map; a path drawn by hand on a single device only exists on that one. Hidden layers remain selectable |
| 🗺️ Calc. route | Automatically calculates the shortest path between entry and exit by following existing galleries (via Pathfinder), displays distance + estimated duration according to the rescue plan's **⏱️ Estimated durations** settings (search speed 1.5 km/h and pause 0 by default, adjustable) |

> 🔁 **During the intervention**: a team added as reinforcement, or whose entry, exit or steps you change, gets its steps right away. What has already been entered (status, observations, photos) stays on the same step, even when two steps share the same name. Removing a step that already has entries asks for confirmation, and is **refused** if it reports "Help requested" or "Victim found": change its status first. Put back later **in the same phase**, the step recovers what had been entered (after a phase change it starts empty; its entries stay in the closed phase's history). If a team reports "Help requested" or "Victim found" on a step you removed in the meantime, importing its report **puts the point back in its route**, in its place, and tells you in red; if the point cannot be put back (team no longer in the current phase), the red alert is shown anyway. ⚠️ **After an app update, re-import the plan on every phone before the intervention**: a phone that imported the plan with an older version (before v1.98.5) sends reports the PC cannot merge. **Relaunching** a finished plan erases the previous intervention, photos included: a confirmation reminds you, export its report first. "All POIs in the zone" adds the steps from nearest to nearest, to avoid back-and-forth.

> 🗺️ **On the map, during the intervention**: when you **launch the plan in team mode**, you are **placed at your team's entry** — automatically if your position was not confirmed yet, otherwise the app offers it ("Place me at the entry" / "Keep my position"). At launch, **a single message** sums everything up (plan launched, placed at the entry, map not available offline) and no longer blocks the buttons below it; relaunching a scenario already played starts from scratch (no more false delays carried over from the day before). Closing the Rescue Mode window no longer removes anything — your zone and your route stay displayed (a team member sees their team, the operator all of them), even after a reload. At the bottom of the screen, a red badge **"🚨 Rescue · Alpha · 3/8 ›"** reminds you the intervention is running and where you stand: one tap takes you **straight to the steps** to validate. While preparing: teams **collapse** (▾/▸ or "Collapse all"); while drawing a zone, the other teams' zones show dashed so you can line up the edges; tapping a POI to choose the entry, the exit or a step **takes it as the point** (its sheet no longer opens); an unnamed point shows as **GPS coordinates** if the plan is georeferenced; "Auto: 1 team per level" skips empty levels, and level lists mark the ones with nothing on them "(empty)" (still selectable).

> 🚑 **Victim, delays and recall**: a step set to **"Victim found"** gives a **position** (the step's, level included) — **📍 Refine on the map** adjusts it, **🚑 Evacuate** opens the Emergency exit from the victim, and a **red ✚** marks it on the map, for everyone. The operator sees it as a banner at the top of their view, and the report prints it first. Each team has its **departure time** (**▶️ Departure**, otherwise the launch) and its **expected return time** (departure + estimated duration): **orange** once that time has passed, **red** after the margin (30 min by default, adjustable in ⏱️ Estimated durations) — late teams move to the top, the bottom badge changes colour, a message and a vibration warn you. **✅ Back** stops the clock. **📢 General recall** (or 📢 Recall, per team) marks the teams still underground as recalled, with the time. ⚠️ **The app notifies nobody** — there is no network underground: pass the order on by radio or by voice. Departure, return, recall and refined position travel in the team report.

> 🧭 **Step-by-step route guidance**: in your team's view, **🧭 Follow my route** turns the route into the app's itinerary — the guidance banner ("In 40 m, turn left"), the road book and the XL screen take you from step to step (turn tracking 🧭 on). The steps you validate are ticked on the itinerary; if you stray, **Recompute** starts again from here towards the **next step not done**, still avoiding the other teams' zones. When you reach a step, a message and a vibration warn you, and the 🚨 badge opens that step directly. The **briefing PDF** also prints, for each team, its **road book** junction by junction (level changes included) — compute the team's route to get it.

> 👥 **Leader, headcount, people back up and log**: each team has a **👤 leader** (chosen among its members) and a **headcount**. At **✅ Back**, the app asks **how many came back up**: below the headcount, a **red alert "N person(s) missing"** stays on screen (and the bottom badge turns red) until the count is corrected. The **📜 log** (operator view) records everything, time by time: launch, statuses, victim, departures, returns, recalls, imports, phases — plus your own notes (radio call, decision). It travels in team reports and is printed as an annex of the report. The **free rescuer's report** can now be imported like a team's: their notes join the log, at their time.

> 🗂️ **Preparing and relaunching**: when a phase is closed, each team's **planned route** is kept — replanning the next phase no longer erases it, and the report shows each phase's route. In the edit view, the **📊 Coverage** block (computed when opened) gives the **share of galleries covered** by the zones, the **POIs inside a team's zone but off its route**, and the **POIs visited by several teams** — a reading aid, nothing is assigned automatically. At launch, the app **warns you if the map is not fully available offline** on the device (server map not downloaded). In the team view, three shortcuts: **🚪 Emergency exit**, **🆘 XL screen**, **⛑️ I'm lost** — hidden, like "Follow my route", when the surface operator **takes over** to relay a team: they would act on the operator's own device.

#### Map visualization

**🗺️ View on map** button in the edit header. Displays for each team (dedicated color):
- Polygon zone (fillOpacity 30%) OR colored halo on the selected paths
- 📍 Entry marker (green border circle + team color fill)
- 🚪 Exit marker (red border circle + team color fill)
- Suggested route (dashed polyline team color)

Auto-refresh on each modification. Re-click the button to hide.

#### Multi-scenarios per map

You can prepare **several hypotheses** simultaneously ("if Marc left via the East" vs "if via the South"). 🗐 Duplicate button to clone a scenario and test a variant without losing the original. Cap of 10 scenarios per map: beyond that, the oldest is automatically purged — except a running scenario, the one you have open, the most recent one, or a finished intervention whose report (PDF or file) has not yet left the device.

#### Exports

**📄 Printable PDF**: 1 A4 portrait page per team (a 2nd one if the step list is long) with color banner + Context/Members/Mission/Route sections + empty 60mm Observations box (to fill in with pen on field return). Filename `Rescue_<scenario_name>_<date>.pdf`.

**🌍 Geolocated KMZ**: embeds the complete scenario in a KMZ annex file (`myktamap-extras.json > secoursPlan`). Prerequisite: map already KMZ-calibrated (see Export sessions modal 🌍 KMZ tab). MyKTAMap can re-import the KMZ and reload the scenario as-is. Filename `Rescue_<scenario_name>_<date>.kmz`.

The sections below detail the advanced features: cross-app integrations (KML, Lost Mode, heatmap, etc.), real-time field exploitation (Live views by role, statuses, reports), and cross-device consolidation (import of teammate reports).

> 💡 **Operator ↔ teams sharing** goes through the classic **`.mkmsec.report.json` report** (device-to-device file exchange).

> 💡 **Field recommendation**: prepare one or two scenarios **BEFORE** an incident on your favorite maps to identify workflow frictions (where are the accesses, how to divide the network, which levels by team). During a real incident, you will be in emergency mode and the app must be ready to draw in 30 seconds.

---

### 🚨 Rescue Mode — Multi-phases

A scenario can **sequence several phases** with a debrief intercalated between each. Typical field use case: *Phase 1 = one team sweeps ALL main passages without entering extraction chambers → team returns → debrief at command post → Phase 2 = X teams target the extraction chambers with the information brought back from Phase 1.*

> 💡 **If you don't use multi-phases**, change nothing: your scenario stays with **1 single implicit phase** and the behavior is strictly identical to previous behavior. No visual pollution (multi-phase badges and buttons only appear if you actually create 2+ phases).

**🔧 Create and manage phases (scenario Edit view)**:

- **📋 Phases (N)** section below the Teams section
- **➕ Add a phase** button → creation modal:
  - Enter a name (e.g.: *"Phase 2 — East Chambers"*)
  - Check the **participating teams** for this phase (hybrid model: your teams are defined only once at the scenario level, then you check box by box "participates in this phase")
- ✏️ button to rename a phase or modify the team selection
- 🗑️ button to delete (refused if it's the last phase, if it's active in the execution, or if it has already been started → history is preserved)

**🏷️ Sticky badge in the 3 Live views**: an amber badge "**📋 Phase 1 1/N**" appears in the header of the Team / Operator / Free Rescuer views as soon as there are 2+ phases. Displays the name of the active phase + its position.

**✓ End a phase + debrief (Operator only)**:

1. During the active phase, the Op Live footer displays a new **"✓ Phase ended"** amber button (visible only if multi-phase)
2. **Auto-detection**: as soon as **all participating teams have marked their Exit step as done**, the button turns **pulsing green** + an assistant toast informs you ("✅ All teams are out — the phase is ready to close"). The Op keeps the final decision.
3. **Click "✓ Phase ended"** → debrief modal: free textarea (5000 chars max) to capture the lessons from the phase (teams returned, points found, priority zones to explore, constraints encountered). This debrief will be intercalated in the final report between each phase section.
4. **Validate "✓ End the phase"** → the current phase is **archived** (never overwritten, history preserved)
5. **If a next phase exists** → automatic chaining to **"🚀 Start phase X+1?"** modal with summary of participating teams
6. **You confirm** → the new phase starts, the steps of participating teams are **rebuilt from their CURRENT route** (so if you modified `entry/exit/intermediate` of a team between P1 and P2, the new steps take this into account)
7. **If no next phase** → a confirmation "Stop the plan completely?" (equivalent to ⏹️ End the plan)

**🔍 History safeguards**:

- Closing a phase **NEVER** deletes steps — they are archived as they are
- A phase already started can no longer be deleted from the UI (safety net)
- An active phase in the execution cannot be deleted (go through "✓ Phase ended" first)
- The auto-detection toast does not repeat (single display per phase)

> 💡 **Hybrid teams ↔ phases model**: your teams are defined **only once** at the scenario level (with members, NATO color, route). Participation in each phase is managed by checkbox in the phase modal. The same team can participate in several successive phases — at the phase transition, its steps are reset based on its current route (so you can modify the route between P1 and P2 to adapt to what was discovered).

> 💡 **"➕ Add a phase" button also available on-the-fly** from the Op Live footer (during execution), not just from the Edit view. Useful when the P1 debrief reveals the need for an unplanned P3.

### 🚨 Rescue Mode — Cross-app integrations

These integrations make Rescue Mode a complete operational coordination tool:

#### 🌍 KML cross-app (Google Earth, OsmAnd, Avenza…)

The exported KMZ now contains a root `🚨 Rescue` folder perfectly structured for third-party apps:

```
📁 Rescue — Marc search 26/05
   ├── 📁 🚨 Alpha team
   │ ├── 📁 📍 Points (5) ← toggle ON/OFF in Google Earth
   │ ├── 📁 ⬛ Search zone
   │ └── 📁 🗺️ Route
   └── 📁 🚨 Bravo team (idem)
```

- Background map as GroundOverlay 60% opacity (simultaneous reading of map + zones)
- Auto-calc of missing routes BEFORE export (1 click = complete KMZ)
- 43 NATO color styles (10 teams × 4 categories + 3 fixed entry/exit/loop styles)

#### ⛑️→🚨 Lost Mode → Rescue workflow

In the ⛑️ "I'm lost" emergency modal, a new button:

```
🚨 Launch a rescue plan (teams + zones)
```

On click, the app **automatically creates a Rescue Mode scenario** with:
- Auto name `Search - 26/05/2026 14:32`
- Incident time calculated from the elapsed time of Lost Mode
- Last known position + uncertainty zone (radius + dashed circle on the map)
- Auto notes with walking speed, radius, entered clues

→ Natural workflow: you are searching for someone → you launch Lost Mode → you click 🚨 → you coordinate the teams.

#### 🚫 Anti-overlap between teams

When you calculate a team's route, the **waypoints + zones of the other teams** automatically become "avoid preferences" for Pathfinder. Result: the routes go around each other instead of crossing, no involuntary relay.

If really no choice (shared unique passage), warn toast `⚠️ Route crosses N point(s) of other teams — check overlaps`.

#### 🔥 Activity heatmap in Rescue Mode

New orange "🔍 Analysis tools" block in the Context section with **🔥 Show activity heatmap** button. Visualizes the zones where the tracker has recorded passage → useful for identifying probable zones to search in priority.

If the missing person was using MyKTAMap and exported their session with tracker timeline, the heatmap directly shows where they spent time.

#### 🏗️ Auto-create 1 team per level (M-LVL)

On multi-level maps, conditional button **🏗️ Auto: 1 team per level (N)** in the Teams section. Auto-creates N teams named `Level GF / +1 / -1...` with auto-cycled colors. You then place zones + waypoints on each level separately by changing the active level via the top-left M-LVL pill.

#### ⭐ Favorites in quick access

In the mini-modal "📍 Choose a point", your map favorites appear as clickable chips (max 8) ABOVE the autocomplete search. 1 click = waypoint applied (skip search + map click).

Especially useful for emergency scenarios where you want to quickly create several teams with the same 3-4 known access shafts.

#### 🛑 Pause between stops (route)

New section in the 🗺️ Route modal:

```
🛑 Pause between stops
☑️ Include a pause between each intermediate stop
   Duration per pause: [15] min
```

Default checked + 15 min (= preserved behavior). ⚠️ Since v1.98.11 this pause **no longer** applies to Rescue Mode: each rescue plan has its own settings (**⏱️ Estimated durations** block: search speed and pause per step), sent to the teams with the plan.

> ⚠️ As with all digital tools underground: **keep a physical compass** and a paper map in your pocket. The phone can fail, the magnetometer can be distorted by local metal, the tracker can drift. The 🚨 is a quick info reading aid, not a substitute for preparation.

### 🚨 Rescue Mode × 🌍 OSM View — External rescue coordination

Rescue Mode is integrated with the OSM View to provide **external rescue teams** (firefighters, GRIMP, SDIS) with everything they need to intervene on site without knowing the place.

#### 🚪 "Plan entry point" tag

New built-in tag available in the **🚨 Rescue** category of the legend and POI editor. Marks the main entrance(s) for rescue teams:

- Vector SVG icon (yellow door on black background)
- Automatically appears in the Firefighter Briefing PDF ("critical POIs" section)
- Visible on the OSM View too (with its GPS georeference)

> To tag a POI: edit it → Tag menu → "🚨 Rescue" category → "🚪 Plan entry point". You can have multiple entries (north/south/etc.).

#### 📍 Team surface GPS

In the team form (Rescue Mode → team edit), new **📍 Surface GPS** field:

```
📍 Surface GPS: [48.8566, 2.3522 ]
                 ↑ format: lat, lng (decimal WGS84)
```

Enter the GPS position of the rescue HQ, firefighter rendezvous point, or any surface point of interest related to this team. Optional.

→ This data feeds the **Firefighter Briefing PDF** (clickable OSM link per team) and stays in the `.mkmsec.json` export.

#### 🌍 OSM View accessible everywhere in Rescue Mode

The **🌍 OSM View** button is present in:
- The Edit view (scenario banner)
- All 3 Live views: 👤 Surface Operator, 🚨 Field Team, 🚑 Free Rescuer

No need to return to edit view to show the plan's location on OpenStreetMap to firefighters arriving mid-mission.

#### 🚒 Dedicated Firefighter Briefing PDF

New **🚒 Firefighter Briefing** button in all Rescue Mode banners. Generates a dedicated PDF specially designed for external rescue teams, containing:

| Section | Content |
|---------|---------|
| **SURFACE ACCESS POINTS** | At the top: the map **cropped to the teams' access points** (no POIs), a **numbered marker** per access, and a table No. · access (entry, exit or both) · teams · **GPS + clickable map link**. Two teams leaving from the same access share one number. Remember to **name your entries** ("Manhole, X street"): otherwise the table says "Unnamed access" |
| **INFO** | Scenario name · plan name · generation date |
| **LOCATION** | GPS center coordinates + bbox + **clickable OpenStreetMap link** + **clickable Google Maps link** |
| **TEAMS ON SITE** | For each team: name + members + surface GPS (if set) + individual OSM link per team |
| **CRITICAL POIs** | The map's accesses, with their level: first the **open** ones (🚪 entry points, cavages, rung shafts, service staircases — the same as the Emergency exit), then the **closed** ones (which firefighters and the IGC can open). List taken from the map's tagged points (up to v1.98.6 this block stayed empty) |

> 💡 **How to use**: Print the PDF or send it by email/Signal to the firefighter group leader BEFORE arrival. On site, they click the links from their phone/PC to open OSM or Google Maps centered on your site. No MyKTAMap installation needed on their side.

#### 📤 "Surface briefing" page in post-mission report

The post-mission PDF report (generated via 📤 Report button) includes a "SURFACE BRIEFING" page with the same info, access map at the top (the OpenStreetMap view of the whole map, unreadable on an A4 page, is no longer in it; in the firefighter briefing it stays optional, POIs unticked by default). On team maps, an entry and an exit set at the same access (less than 10 m apart) now make a single "ENTRY / EXIT" marker. When a route is computed, a step placed far from any gallery is named ("Step "PA3" is 68 m from the nearest trace"): fix it before going down. Useful for geographic debrief with firefighters or archiving the intervention file.

#### 🏷️ OSM View tag filter

The tag filter chips in the OSM View modal list **all tags present** in the plan, aligned with the OSM View Home widget.

#### 💾 Save Offline — OSM View without Internet

Heading out on a cataphile trip, or prepping for a Rescue Mode in an area with terrible cellular? You can now **download the OpenStreetMap tiles around your plan ahead of time**, and view them **with no Internet** once you're on site.

**What it's for**:

- You open the OSM View in the field even without network (long underground trip, Rescue Mode in a dead zone, low battery forcing data-saver mode…)
- The basemap (streets, surface landmarks, contours) stays visible normally → you know where you are relative to the plan without depending on 4G
- Especially useful **for firefighters / rescue teams** you show the OSM View to upon arrival: the map shows up instantly, no loading wait

**How to enable it**:

A **💾 Save Offline** button is available in the OSM View top bar. **One click is all it takes**:

1. The app downloads the visible OpenStreetMap tiles around your plan + a few zoom levels close in
2. After download, the bar shows: **📦 N tiles · X MB** (= what's now stored on your device)
3. You can click again later if you zoom on another area you also want saved

> 💡 **Max ~200 tiles per click** (~5-10 MB): this is a strict cap to respect the OpenStreetMap usage policy (= a free service funded by donations, so no abuse). To save a very wide area, do several clicks while moving the view around.

**Where it's available**:

The 💾 Save Offline button shows up in **3 contexts** — and the cache is **shared** across all three:

| Context | When to use it |
|---|---|
| **🌍 OSM View modal** (map mode) | You're prepping a trip: open the OSM View, frame the zone, click 💾 |
| **🌍 OSM widget on the home screen** | You're prepping your plans from home without having to load a plan in map mode |
| **🚨 Rescue Mode** (Creation + Live banners) | You're triggering a mission: one 💾 click and the whole team has the zone on the device before going down |

> ✅ **Shared cache**: you download ONCE → it's available everywhere, no duplicates. No need to redo the download per mode.

**Smart offline behavior**:

When the app detects you have no Internet, it adapts the 🌍 icon behavior based on what's stored on your device:

| Internet | Plan saved | 🌍 icon | Action |
|---|---|---|---|
| ✅ | – | visible | normal opening |
| ❌ | ✅ | visible | direct opening from your device (no ping test) |
| ❌ | ❌ | hidden | reconnection required — clear message "Plan not available offline, click 💾 when connected" |

In practice: if you saved your plan the night before on Wi-Fi, the 🌍 icon stays visible the next day on weak cellular and the modal opens **directly** without a network test that would slow everything down. If you forgot to save, the app tells you clearly instead of leaving you spinning in circles.

**🔒 Everything stays local and private**:

- The downloaded tiles are **stored 100% on your device** (your browser / the installed PWA)
- **Nothing is ever transmitted** to a third-party server, nor to the author, nor to OpenStreetMap after the initial download
- No trace of what you save is ever tracked
- On the next full reset (💥 Reset everything), saved tiles are erased along with the rest

> 💡 **Cataphile trip tip**: the day before your trip, open the OSM View on your phone at home (Wi-Fi), zoom on the entrance area + nearby streets, click **💾 Save Offline**. The next day at the surface meeting point, even with weak cellular, the map shows up instantly.

### 🚨 Rescue Mode — Real-time field exploitation

The scenario has **2 distinct states**:

1. 📝 **CREATION** — Edit view. You prepare your teams, their routes, their zones, the suggested itineraries.
2. 🚀 **EXECUTION** — Live real-time view. The team has LEFT, you follow their observations step by step, you comment live.

You toggle from one state to another via the **"🚀 Launch the rescue plan"** button in the Edit view.

#### 🚀 Launching the plan + role selection

A new dynamic banner appears at the top of the Edit view:

| Banner state | When | Buttons |
|---|---|---|
| Gray "Add at least one team…" | 0 team defined | None |
| **Yellow CTA "🚀 Launch"** | At least 1 team | 🚀 Launch the rescue plan |
| **Green "🟢 PLAN ACTIVE — <Role>"** | Plan launched in progress | ▶️ Resume Live view · 📤 Report · ⏹️ Stop |
| **Blue "📦 PLAN ENDED"** | Plan stopped (history) | 📤 View historical report · 🚀 Relaunch |

On click "🚀 Launch", **role selection modal** with 3 choices:

```
◉ 👤 Surface operator
   You coordinate from the command post. You see all teams in
   parallel, you can edit their observations in supervision.

○ 🚨 Team on the field: [Alpha ▾]
   You are part of an assigned team. You follow your route step
   by step and comment live.

○ 🚑 Free rescuer
   You intervene without a pre-assigned team (occasional reinforcement, recon).
   You take free notes with timestamps.
```

> 💡 You will be able to change role later without losing the observations.

#### 🚨 Live view — TEAM MEMBER mode (step-by-step)

For the rescuer on the field who follows their route:

```
┌─────────────────────────────────────────────────────┐
│ 🚨 Alpha team · Step 3/5 ⏱️ 14h 23min │
├─────────────────────────────────────────────────────┤
│ ✓ ━ ✓ ━ ↻ ━ ○ ━ ○ │ ← stepper
│ clickable, status color per step │
├─────────────────────────────────────────────────────┤
│ 📍 STEP 3 — North ventilation shaft │
│ Status: 🟢 NTR │
│ │
│ 📝 Observations at this step: │
│ [central gallery nothing to report] │
│ │
│ ⚡ Quick input: │
│ [🟢 NTR] [🟡 Suspect] [⬛ Blocked] [🔵 Clue] │
│ [🟠 Help requested] [🟣 U-turn] [🚨 Victim!] │
│ │
│ [📸 Photo (0/5)] [🎯 Recenter map] │
├─────────────────────────────────────────────────────┤
│ [← Previous step] [Next step →] │
│ [⏸️ Pause] [📤 Report] [View edit] [⏹️ End] │
└─────────────────────────────────────────────────────┘
```

**8 clickable statuses** (colors engraved in the chart):

| Emoji | Label | When to use |
|---|---|---|
| • | Pending | (default status before interaction) |
| 🟢 | NTR | Nothing to report |
| 🟡 | Suspect | Unusual traces / noises / smell |
| ⬛ | Blocked | Impassable passage (collapse, water) |
| 🔵 | Clue | Object / remains found |
| 🟠 | Help requested | Material / human reinforcement requested |
| 🟣 | Forced u-turn | Abandoned route, early return |
| 🚨 | **Victim found** | **Absolute emergency** — triggers flashing red signal on the operator side |

**Photos**: tap "📸 Photo (X/5)" → auto rear camera on mobile OR gallery. Max 5 photos per step, auto JPEG q85 compression max 1920px. Click a thumbnail → fullscreen viewer with swipe + zoom.

**Auto-save**: observations saved on textarea blur AND on step change. No need for "Save" button.

**Auto-status NTR**: moving to the next step without having set an explicit status → automatically marked "🟢 NTR" (assumes you did the step with nothing to report). Re-click status possible if needed.

#### 👤 Live view — SURFACE OPERATOR mode (overview)

For the command center coordinating several teams in parallel:

```
┌─────────────────────────────────────────────────────┐
│ 👤 Surface operator · 3 teams ⏱️ 02h 14min │
├─────────────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌──────────────────┐ │
│ │ 🔴 Alpha 3/5 │ │ 🔵 Bravo 1/4 │ │
│ │ ████████░░ 60% │ │ ███░░░░░░░ 25% │ │
│ │ 🟢 NTR │ │ 🟠 Help requested │ │
│ │ « NTR central │ │ « Water on floor,│ │
│ │ gallery » │ │ level rising » │ │
│ │ ⏱️ 14:23 │ │ ⏱️ 14:18 │ │
│ │ [👁️ Details] │ │ [👁️ Details] │ │
│ │ [🚨 Take over] │ │ [🚨 Take over] │ │
│ └──────────────────┘ └──────────────────┘ │
│ ┌──────────────────┐ │
│ │ 🟢 Charlie ✓D │ ← team Done (grayed) │
│ └──────────────────┘ │
├─────────────────────────────────────────────────────┤
│ [⏸️ Pause] [🗺️ Global map] [📤 Global report] │
│ [View edit] [⏹️ End the plan] │
└─────────────────────────────────────────────────────┘
```

**Special cards** with strong visual signals:

- 🚨 **Victim found** → **FLASHING RED** card (1.2s animation, absolute emergency, you can't miss it)
- 🟠 **Help requested** → orange + glow (reinforcement to send)
- ✓ **Done** → grayed opacity 0.75 (all steps completed)

**"👁️ Details" button** → read-only mini-modal with chronological list of the team's steps (ts + emoji status + obs).

**"🚨 Take over" button** → switches to the Team Member view focused on this specific team. You become TEMPORARILY Alpha's team member to enter a detailed observation on their behalf (typical case: you are at the command post but you receive a radio call from Alpha who dictates their obs to you). The view opens on **this team's first unfinished step**, even if you were further along with another team.

**Easy return**: once in Team Member mode after "Take over", a **"👤 Back to Operator"** button appears in the footer. On click → return to the intact Operator overview (going back stays possible after a reload or a map switch).

**"🗺️ View global map" button**: hides the modal + renders the map overlay with all the zones + waypoints + routes of the teams in NATO colors.

#### 🚑 Live view — FREE RESCUER mode (loose notes)

For the occasional reinforcement / reconnaissance without a pre-assigned team:

```
┌─────────────────────────────────────────────────────┐
│ 🚑 Free rescuer · 12 notes ⏱️ 01h 47min │
├─────────────────────────────────────────────────────┤
│ 📝 Add a note │
│ [north gallery nothing to report] │
│ ⚡ Associated status: │
│ [🟢 NTR] [🟡 Suspect] [⬛ Blocked] [🔵 Clue] │
│ [🟠 Help] [🟣 U-turn] [🚨 Victim!] │
├─────────────────────────────────────────────────────┤
│ 12. 🟢 NTR · ⏱️ 16:42:18 [✕] │
│ « East crossing, NTR, we continue » │
│ │
│ 11. 🟡 Suspect · ⏱️ 16:38:05 [✕] │
│ « Sound of running water, source?? » │
│ │
│ ... (chronological DESC) │
└─────────────────────────────────────────────────────┘
```

No stepper, no structured steps. Just a timestamped notes feed with status. Handy for missions where the route isn't planned in advance (reinforcement arriving mid-mission, reconnaissance team, etc.).

#### 📤 Reports along the steps

At any time during execution AND after the plan stops, you can generate a report via the **"📤 Report"** button present in:

- The footer of each Live view (scope adapted to the current role)
- The Edit view banner (if execution active OR ended)

3 formats to choose from in the unified modal:

| Format | Use case |
|---|---|
| 📄 **Printable A4 PDF** | Global briefing page 1 + steps text page per team + photos page in 2-col grid. Ideal for paper report / printing / archiving / paper handover to firefighters. |
| 📦 **`.mkmsec.report.json`** | Autonomous structured data (photos in base64 if checked). Re-importable on the surface operator device (cross-device consolidation, see dedicated section). |
| 📋 **Plain text** | Markdown-like copied to clipboard. For Discord / SMS / quick mail sharing. |

**3 scopes depending on your role**:

- 👤 **Operator mode** → "📤 Global report": ALL teams + their steps + photos
- 🚨 **Team Member mode** → "📤 Report": HIS team only (individual route)
- 🚑 **Free Rescuer mode** → "📤 Report": HIS chronological free notes

**Compact preview** at the top of the modal: role title + step count + progress % + duration. **"📸 Include photos" checkbox** CHECKED by default (with dynamic hint counter). Toast feedback on each action.

**Report generated on the fly**: reflects the CURRENT state of the scenario. Reusable as many times as needed. Ideal for:
- Briefing during mission (intermediate snapshot to print for the relief)
- Cross-device handover (JSON export → mail / USB stick → import on operator PC)
- Post-mission final report (printable PDF + archiving)

#### ⏱️ Global timer with fair pause

The ⏱️ timer displayed at the top of each Live view is calculated from the start time MINUS the cumulative pause time. You can pause with the **"⏸️ Pause"** button (the timer freezes) then resume with **"▶️ Resume"** — the pause duration is NOT counted.

**Re-render 1×/second** without visual flash, without focus loss in the textarea observations during input. Allows keeping the real-time report accurate during long missions (h+).

#### 🎬 Typical complete cycle

```
1. 📝 Scenario creation (Edit view)
   ├─ Add Alpha/Bravo/Charlie teams (NATO colors)
   ├─ For each team: route entry → steps → exit
   ├─ Search zones (polygon OR selected paths)
   ├─ Pathfinder auto-calc routes (cross-team avoidances)
   └─ Export PDF / KMZ / .mkmsec.json for initial briefing

2. 🚀 Launch (role selection modal)
   └─ Switch to Live view according to chosen role

3. 🚨 Execution (Live view)
   ├─ Team Member mode: follows route step-by-step + observations + photos
   ├─ Operator mode: cards overview + supervision + take over
   └─ Free Rescuer mode: chronological loose notes

4. 📤 Reports along the steps (n times)
   ├─ Printable PDF for relief / paper handover
   ├─ JSON for cross-device consolidation
   └─ Clipboard text for Discord / quick mail

5. ⏹️ Plan stop (banner "📦 PLAN ENDED")
   ├─ Observations kept as history
   ├─ "📤 View historical report" button reusable
   └─ "🚀 Relaunch" button if re-mission
```

#### 📥 Cross-device consolidation

On field return, each team member can **share their report** with the surface operator who **imports and merges** their observations in the supervision dashboard.

**Typical workflow — operation with 3 teams**:

1. **Operator side (surface, BEFORE incident)**:
   - Prepares the scenario (Alpha / Bravo / Charlie teams + routes + zones)
   - Launches the plan (🚀) → Surface Operator Live view
   - Transmits the scenario to team members via classic `.mkmsec.json` export (mail / USB stick / AirDrop)

2. **Each Team Member side (field)**:
   - Imports the operator's `.mkmsec.json`: the import keeps the command post's identifiers, which is what lets the operator accept their report. If the plan is **already** on the phone (plan updated by the operator), the preview offers **"Replace"** (checked: keeps the link with the operator, but erases the statuses, observations and photos already entered on this phone) or **"Import as a copy"** (a new scenario, whose report the operator will refuse)
   - Launches the plan → Team Live view → fills in obs + statuses + photos per step
   - **On surface return**: generates their report via "📤 Report" in the Team Live footer → **`.mkmsec.report.json`** format → exports the file (local download)

3. **Operator side (field return)**:
   - Retrieves the 3 `.mkmsec.report.json` reports (one per team) via the channel of their choice (AirDrop, mail, USB stick, Discord)
   - In the Operator Live view → **"📥 Import team member report"** button in the footer
   - File picker → selects the file → preview modal showing: targeted team name, number of steps to merge, photos, and **detected conflicts** (steps on the op side already filled that will be merged)
   - Confirms the import → the app does a **snapshot BEFORE** (emergency backup) then merges:
     - Observations **concatenated with dated separator** (no loss)
     - **Most serious status retained**; at equal seriousness, **the most recent** — an "All clear" reported by the team replaces "Pending", a victim is never downgraded
     - Photos **imported with deduplication**
   - Result modal with detailed stats (X steps merged, Y photos imported, Z possible warnings)
   - Repeat for the 2 other teams
   - ⚠️ **Report arriving after a phase change**: if it concerns a phase already closed, it is filed in **that phase's history** — never in the current phase — and the app flags it in orange (in red if it contains "Help requested" or "Victim found")
   - 🧭 **Report on a step you removed**: it is not lost — it shows in orange on import and appears in the **"Reports outside the route"** section of the final report
   - 🗺️ **Plan changed since sending**: if the plan changed version (or was redrawn) since the scenario was exported, the import preview warns you and counts the zone traces it can no longer find
   - 📚 The **final report** also includes the steps of **closed phases**, phase by phase

4. **Post-merge visualization**:
   - On each Op team card: blue "📥 imported" chip appears if at least one step received consolidation
   - In the "Team details" modal (read-only): "📥 imported" chip on each step concerned + tooltip with import date + source app version

**Import safety**: refuses if scope ≠ team member (global operator reports or free rescuer reports are not mergeable), if the source scenario is different, if the team is absent from the active scenario, or if no execution is in progress on the op side. **Different plan on the team member side** → warning (not error, we keep the text obs).

**Undo**: a SessionBackups snapshot is automatically created **BEFORE** each import. In case of error, restore from **📊 Session details → Recent backups** (title: "Before team member report import <name>").

> ⚠️ Important: **teams must be registered on the Operator side BEFORE the plan launch** (no silent creation on import). If you prepare your scenario with Alpha / Bravo / Charlie but a team member exports under a "Delta" name created locally, the import will be rejected — Delta should have been received in the initial scenario.

---

## ⏪ Undo / Redo

You can **undo** and **redo** your actions on the map, up to **50 actions back**.

### Keyboard shortcuts (recommended)

> ⌨️ **Press `?` anytime** to show the full list of shortcuts (cheatsheet).

| Shortcut | Action |
|---|---|
| **?** | Show all shortcuts (cheatsheet) |
| **E / M / Z / S / T / P** | Open Editing / Measure / Zones / Structures / Tracker / Paths |
| **L / B / R** | Legend / Compass / Search |
| **Ctrl+K** (`Cmd+K` Mac) | Search (alternative to R) |
| **TAB / Enter** | In an open tool menu: cycle options / confirm selection |
| **F** | Presentation mode (Esc to exit) |
| **Ctrl+Z** (`Cmd+Z` Mac) | Undo last action |
| **Ctrl+Y** (`Cmd+Y` Mac) | Redo the undone action |
| **Ctrl+Shift+Z** (`Cmd+Shift+Z` Mac) | Redo (alternative) |
| **Esc** | Close the menu / window |

> 💡 The shortcuts do not trigger if you are typing in a text field — to avoid breaking the browser's native undo in inputs.

### Buttons in the sidebar

A new **⏪ History** group appears in the **left sidebar, in last position** (just below **⬆️ Save**, after Doc / Settings / Load / Save). It contains 2 sub-actions:
- ⏪ **Undo** (= Ctrl+Z)
- ⏩ **Redo** (= Ctrl+Y)

The buttons are **grayed out** (reduced opacity + barred cursor) when there is nothing to undo / redo. Clicking a grayed button still displays a short toast ("Nothing to undo." / "Nothing to redo.") to confirm the empty action.

### What is covered

- ✏️ **Points**: addition, modification (name/tag/desc/level), deletion of last, deletion on click
- 🛣️ **Paths**: each click placing a vertex (= 1 entry) + deletion of last + deletion on click + "All paths"
- ⬛ **Zones**: same + closure by return to the 1st point
- 🏛️ **Structures**: same (pillars, wall, faces)

Each action triggers a **discreet toast** at the bottom: `↩ Undone: Placement of point PA1` or `↪ Redone: Deletion of Zone Water`.

### What is NOT covered

- ❌ **Photos** attached to points: their deletion remains **irreversible** (the files are erased from your browser's local storage, with no way back)
- ❌ **Session imports**: an import that overwrites your session cannot be undone via Ctrl+Z (use the automatic session save to recover)
- ❌ **Tracker** (real-time sensor mode)
- ❌ **Distance measurement** (= ephemeral tool, not a persistent mutation)

### History lifecycle

- **RAM only**: history is kept in volatile memory only, **lost on reload** of the page (this is intentional, to avoid bloating local storage).
- **Reset on map change**: if you load another map, history is cleared (logical: you don't want to undo an action done on another map).
- **Limit 50 actions**: beyond, the oldest are forgotten.
- **A new action erases the redo**: if you do 5 undos then place a new point, redo becomes impossible (history branch logic).

---

## 🪫 Battery indicator

The app monitors in real time the phone's battery level (when the browser exposes this info) and displays a compact indicator in 3 places:

| Place | Appearance |
|---|---|
| **Header** of the new interface (next to the session counters) | Compact chip `⚡ 78%` (charging, green) or `🪫 23%` (discharging, color depending on level) |
| **Footer** of the 📋 Active session modal | Line `🔋 Status · 🪫 23% · Discharging` |
| **🔋 STATUS block** of emergency mode 🚨 | Long label `🪫 23% · discharging` |

### Levels and colors

| % | Color | Behavior |
|---|---|---|
| ≥ 50 % | Green / neutral | OK |
| 20-49 % | Yellow-orange | Monitor |
| 10-19 % | Dark orange + toast `🪫 Low battery — consider recharging` (once) |
| 5-9 % | Red + toast `🪫 Critical battery — exit recommended` (once) |
| < 5 % | Pulsing red + toast `🚨 Critical battery — less than 5%` (once) |

Each threshold sends its toast **only once** per discharge cycle (no spam if you oscillate around 10%, 12%, 9%, etc.). The threshold counter is reset as soon as you switch back to charging or rise above 50%.

### Browser compatibility

The app uses the standard browser **Battery Status API**. This API is **no longer available everywhere**:

| Browser | Support |
|---|---|
| Chrome Android / PC | ✅ Yes |
| Edge Android / PC | ✅ Yes |
| Samsung Internet | ✅ Yes |
| Safari iOS / macOS | ❌ No (the API was removed for privacy / fingerprinting reasons) |
| Recent Firefox | ❌ No (the API was disabled by default) |

> 🪫 **If the API is not available** on your phone, the battery chip is **simply hidden** — no error message is displayed. This is normal on iOS. **Emergency mode 🚨 does not show it either** (v1.97.11): with no sensor there is nothing to show, and a “?” where a battery level belongs — on the very screen you open when it dies — reassures nobody. The rest of the status (tracker, compass) is untouched. Same thing if you untick ⚙️ **🔋 Battery level**.

---

## 📊 Session statistics

The **📋 Active session** modal (accessible from the new interface header, 📊 chip on mobile) now displays a statistics block at the top of the modal.

### What you see

| Stat | Value |
|---|---|
| **Total annotations** | Sum of all elements (points + paths + zones + structures) |
| **Breakdown by type** | 📍 N points · 🛣️ M paths · ⬛ K zones · 🏛️ L structures |
| **Total distance** | Sum of path lengths (auto m → km beyond 1,000 m) |
| **Total area** | Sum of zone areas (auto m² → ha beyond 10,000 m²) |
| **POI photos** | Number of photos attached to points |
| **Session duration** | Time elapsed since the app started on this map (`HH:MM:SS`) |

In **multi-level (M-LVL)**, an additional breakdown by level is displayed (e.g. `Level -1: 12 pts · 3 paths` / `Level 0: 45 pts · 8 paths`).

### Share the summary

2 buttons at the bottom of the stats block:

- **📋 Copy** : copies a text summary to the clipboard (formatted for Discord, SMS, mail)
- **💾 Export TXT** : downloads a `.txt` file with the same content

Handy for doing a session check-in with your partner at the exit, or for archiving the mapping progress state.

---

## 📐 Distance measurement and ⬛ Area measurement

> All measurement buttons are in the **📐 Measurement** group of the side bar.

### 📐 Distance Mode (default)

1. Press **📐** — measurement mode activates (green button)
2. Click on the map to place points
3. The total distance is displayed at the bottom left, in meters (`📐 Distance: X m`)

### ⬛ Area Mode

1. In the **📐 Measurement** group, press the **📏/⬛** toggle to switch to area mode
2. Click on the map to draw a **polygon** (at least 3 points)
3. The area is displayed at the bottom left, in m² (`⬛ Area: X m²`)
4. Beyond 10,000 m², the app automatically displays in hectares (ha)

> **How it works** : the app converts the area to m² via the map's calibrated scale. Accuracy therefore depends on the initial map calibration (`📏 SCALE` in ⚙️ Settings).

### ❌ Clear the measurement

Press **❌**. A window opens with two options:

| Option | Effect |
|---|---|
| **↩️ Last point** | Undoes only the last clicked point (ideal in case of a misclick) |
| **🗑️ Entire measurement** | Clears all points and resets the distance/area to zero |
| Cancel | Closes the window without deleting anything |

> You can remove multiple points one by one by successively clicking **❌ → ↩️ Last point**.

> 💾 The mode (distance/area) and the points are persisted in the session save — on reload or session import, your ongoing measurement is restored identically.

---

## ✏️ Add points

> The **✏️ Edit** button in the sidebar is a **direct click**: 1 click = toggle ON/OFF of the add mode. When ON (highlighted icon), each click on the map places a new point.
>
> To **delete a point**: click on the marker → popup → button **🗑️ Delete this point**. To undo: <code>Ctrl+Z</code>.

1. Press **✏️** — add mode activates (green button)
2. Click on the map at the desired location
3. A window opens. Fill in:
   - **Name** (required)
   - **Type**: choose from existing tags, **— No tag —** (default icon), or **➕ Create a new tag…**
   - **Description** (optional)
4. Confirm with **✅ Add**

### 🎨 Available icon types

The application offers a default set of icons, grouped by category:

| Category | Available types |
|---|---|
| 🕳️ **Shafts** | Ventilation, Plugged, Filled, Ground / Basin, Extraction |
| 🪜 **Access** | Ladder shaft (open / closed), Service stairs (open / closed), Adit (open / closed) |
| ⚠️ **Signage** | Room, Cat hole, Passage, Danger, Information, Electricity, Survey, Vehicle |

> 💡 The **Access** icons follow an intuitive color code: **green = open**, **red = closed**. Handy for spotting usable passages at a glance.

### 🏷️ Create a new tag

If the type you want doesn't yet exist, select **➕ Create a new tag…**. Enter a short name (letters, digits, underscore or hyphen only) — for example `fountain`, `arch` or `ruin_2`.

The new tag is added to your session and will use the default icon. To customize its icon permanently, modify the map via **🏗️ Create / Modify map**.

### 🗑️ Clear the points

Deletion happens **on the point itself**, not from the toolbar: click the marker → popup → **🗑️ Delete this point**.

| What you want | How |
|---|---|
| Remove **one** point | Click the marker → **🗑️ Delete this point** |
| Undo the deletion | `Ctrl+Z` (or ↩️ in the bar) |
| Clear **everything** | ⚙️ **Clear session** — resets the plan (points, paths, zones, structures) |

> ℹ️ The 🗑️ button only shows on **your** points. Points coming from the plan itself or from a data layer are read-only: to remove one, first open its layer for editing from 🔍 **Filters**, then export the corrected layer.

> 💡 There is **no** 🗑️ button next to ✏️: the Edition group is a plain switch (add mode ON/OFF).

### ✏️ Modify an existing point

Click on a marker you added → the popup displays the **✏️ Modify** (blue) button. It opens the same window as for adding, **pre-filled** with the name, type, description and photos already attached (if applicable).

You can change whatever you want then **💾 Save**. If you rename the point AND it has photos, the photos automatically follow (transparent internal migration).

### 📌 Reposition a misplaced point

Dropped a point roughly in the right place and want to fine-tune it? Click the marker → popup → **📌 Reposition**.

The popup closes and a banner appears at the top: **“Click the new position for …”**. Your next click on the map moves the point there. A **Cancel** button is there if you change your mind, and nothing moves until you click.

What the point **keeps**: its name, type, description, photos, level (it does not change floor), and its layer membership if you opened that layer for editing. Only its position changes.

The move is **undoable** with ↩️ like any other action.

> ℹ️ The button only shows on **your** points (session ones). A point coming from a data layer is read-only — to reposition it, first open its layer for editing from 🔍 Filters.

### 📸 Photos attached to points

You can attach up to **5 photos per point** (anti-saturation limit for browser storage). 100% local — no photo is sent over the Internet.

**When adding or modifying** a point, the **📸 Photos (N/5)** section offers 2 buttons:

| Button | Effect |
|---|---|
| **📷 Take photo** | Opens the camera directly (on mobile) to shoot a new photo |
| **🖼️ From gallery** | Opens the file picker (mobile and PC), you can choose several photos at once |

**Auto compression**: photos are compressed before storage (1920 px long side max, JPEG quality 85%). A raw photo of 5-10 MB drops to ~200-500 KB. For 5 photos = ~2 MB per point.

**🔒 Metadata scrubbed**: **every** photo is re-encoded when added, even already-small ones — the file's hidden metadata (**EXIF: GPS position of the shot, date, camera model**) is systematically removed. None of it enters the app or leaves in an export. Small photos are re-encoded without resizing at high quality (invisible degradation).

**🛡️ Anonymized export + photos**: in 💾 Save session → 📦 Full, the "🛡️ Anonymize for public sharing" checkbox now accepts photos: each one is **re-encoded without metadata** (including photos added before this protection existed) and **renamed** (`photo-anon-1`, `photo-anon-2`…), linked to the points' anonymized codes (`📍 POI salle #1`…). A photo that cannot be re-encoded is **excluded** from the export — never embedded as-is. The free note and History PDF remain excluded from the anonymized export.

**Remove a photo**: click on the red ✕ at the top right of the thumbnail → it appears greyed out with red hatching (marked for deletion). If you change your mind, click on the green ↺ arrow to undo. The actual deletion only happens when you **💾 Save**.

**If you cancel** the edit window instead of saving, **the photos you had just added are deleted** (auto cleanup). The deletion markings are conversely **canceled** — the photo stays.

**Display**:

1. In the **popup** of the marker (map click): a row of 44×44 thumbnails appears, with the counter "📸 N photos". Tap on a thumbnail → opens the **full-screen viewer**.
2. In the **full-screen viewer**:
   - **Mobile**: 2-finger pinch to zoom (1× to 4×), drag to move, horizontal swipe to switch to the previous / next photo
   - **PC**: scroll wheel to zoom, mouse drag to move, `← →` arrows or `◂ ▸` overlay buttons to navigate, `Esc` to close
3. In the app: a **📸 N** counter is displayed in the top bar (alongside the other counters 📍 / 🛣 / ⬛ / 🏛️). Click on it → "📊 Session details" modal with breakdown per point.

**Sharing / saving**: photos are **included** in:
- 📤 Export → tab 📦 Full / 🎨 Advanced / 🔄 Conversion → check "📸 Include photos"
- Re-import session ZIP → photos automatically restored
- 📦 Map ZIP generator (Modify mode) → option "📸 Include attached photos"
- When creating a new map via the generator, button "📦 Import a datalayer ZIP in one click" → you can recover the points + photos exported from another map

**Technical limits**:
- Browser local storage — quota ~50-200 MB depending on the device. A warning toast notifies you if you approach the quota
- On **iOS Safari standalone PWA**, the browser may purge the IDB in case of lack of space or uninstall — regularly export your maps + photos to secure them
- In case of a full reset of the app (💥 Reset everything), **all photos are deleted** (consistent with the full wipe)

---

## 🛣️ Draw paths

> All path buttons are located in the **🛣️ Paths** group of the sidebar.

- **🟩 Main path** — bright green
- **🟪 Secondary path** — purple
- **🟨 Path** — yellow
- **🪜 Interlevel junction** — dashed magenta (with white circles at the ends). **Appears only if the map is in multi-level mode** — used to connect two floors (stairs, steep slope, internal shaft). See the **🏗️ Multi-level mode** section below for details.

To draw: press the corresponding button → click on the map to place points → press again to stop.

### 📏 Total length of paths

The **📏 Total length** button in the **🛣️ Paths** group opens a window that calculates the **sum of the lengths** of all your visible paths, with a filter by type.

**How it works:**

1. Press **📏** — the window opens with 3 checked boxes (Main, Secondary, Path)
2. Uncheck the types you want to exclude from the calculation
3. The **total in meters** updates instantly, and the included paths are **highlighted in magenta** on the map (luminous halo to see them well)
4. For each type, the window displays the **number of paths** and their **cumulative length**
5. Two output options:
   - **✓ Close (keep the highlight)** — the window closes but the **magenta highlight remains displayed** on the map. You can explore the map with the segments still visible, and re-click **📏** to reopen the window (the previous filters are kept).
   - **❌ Clear the highlight** — removes the magenta halo from the map AND closes the window.

> 💡 The calculation includes **all** visible paths: those you have drawn in the session AND those present in the activated **data layers**. If you hide a layer in the layer control, its paths are automatically excluded from the calculation.
>
> ℹ️ This measurement is **only on-screen** — it does not appear in the legend of the PNG image export.

### 🧹 Clear a path

Press **🧹**. A window opens with three options:

| Option | Effect |
|---|---|
| **↩️ Last point of the path** | Undoes only the last clicked point on the ongoing path (ideal to correct a misplaced point) |
| **✂️ Last entire path** | Deletes the last complete path (useful if you want to redo a path without affecting the previous ones) |
| **🗑️ All paths** | Clears absolutely all paths (irreversible) |
| Cancel | Closes the window without deleting anything |

> Example of use: you draw a main path, you make a mistake on the last bend. Click **🧹 → ↩️ Last point of the path** to step back one point, then continue your path normally.

> 💡 **Interlevel junctions (multi-level mode)**: 🪜 junctions are treated as normal paths by 🧹. **Last entire path** deletes the last junction if it is the most recent; **All paths** clears paths AND junctions; **Selection by click** also works on a junction.

---

## ⬛ Draw zones

> All zone buttons are located in the **⬛ Zones** group of the sidebar.

Allows you to draw **closed surfaces** to annotate particular spaces of the map: backfill, collapsed areas, bodies of water, or inaccessible zones that block route calculation.

| Type | Icon | Color | Pathfinder effect |
|---|---|---|---|
| **Backfill** | ⬛ | Dark grey | None |
| **Collapse** | 🟥 | Red | None |
| **Water** | 🟦 | Blue | None |
| **Inaccessible** | ⛔ | Dark red / black hatching | 🚫 **BLOCKS** — the route will never pass through this zone |

### ✏️ How to draw a zone

1. Press the icon of the desired type (⬛, 🟥, 🟦 or ⛔) — the mode activates
2. Click on the map to place the points (at least 3)
3. To close the zone, **two options**:
   - **Re-click on the first point** (a circle appears on it as soon as 3 points are placed)
   - **Press ✅** — closes the zone at the location of the last point
4. The zone fills automatically with its color

> During the drawing, the segments appear as dashed. Once closed, the zone becomes solid.

### ⛔ "Inaccessible" zone — blocks the route

Draw a zone of type **⛔ Inaccessible** on a part of the map that you want to **forbid to the pathfinder** (recent collapse that makes the passage dangerous, deep water, unmarked passage, etc.).

**Effect**: any calculated route that would have crossed this zone will now go via another path. If no other path exists, the calculation fails with a clear message.

It is a **hard constraint by default**, but you can relax it: the "Respect impassable areas" box of the Itinerary modal is checked out of the box; unchecking it lets the route cross them. ⚠️ **Rescue Mode** and "Lost" mode respect them in all circumstances — a comfort preference does not widen a rescue perimeter. If you want a **soft** constraint (avoid if possible, otherwise pass through anyway with a message), use the **🚫 Avoidance preferences** in the route modal instead (see dedicated section below).

**Multi-level**: the ⛔ zone blocks only the segments of the **same level** (consistent with the level filter). An inaccessible zone at Level 0 does not affect the route at Level -1.

**Independent of the layer toggle**: even if you uncheck the zones layer in the layer control, the zone is still taken into account by the pathfinder.

### 🧱 Display order

Zones overlap in this order, regardless of drawing order:

1. **Water** (in the background)
2. **Backfill** (above water)
3. **Collapse** (above)
4. **Inaccessible** (above everything — to clearly see the blocking zones)

This allows, for example, drawing a collapse on top of backfill without it being hidden.

### 🧹 Clear a zone

Press **🧹**. A window opens with these options:

| Option | Effect |
|---|---|
| **↩️ Undo the last point** | On the ongoing zone, or on the last closed zone |
| **✂️ Last zone (ongoing OR closed)** | Deletes the zone you are drawing if it exists, otherwise the last closed one |
| **🎯 Select a zone to delete** | Activates a mode where you click on a zone of the map to delete it |
| **🗑️ All zones** | Clears absolutely everything (irreversible) |

---

## 🏛️ Structures (pillars, walls, quarry faces)

Specific to **underground quarries**: structures allow mapping the load-bearing physical elements (support pillars, walls) and the progress of the extraction front (quarry faces). Independent of paths and zones — it is a 4th annotation layer.

> All buttons are in the **🏛️ Structures** group of the sidebar.

### 5 available sub-types

| Type | Icon | Shape | Color | Typical use |
|---|---|---|---|---|
| 🟡 **1st mass pillar** | polygon | yellow | Load-bearing pillar of the upper level (1st mass limestone) |
| 🟠 **2nd mass pillar** | polygon | orange | Pillar of the lower level (2nd mass limestone). In multi-level mode, auto-tagged at level -1 |
| 🔵 **Wall** | polygon | blue | Dry stone wall, breeze block, masonry retaining wall |
| 🟨 **1st mass quarry face** | polyline | yellow (line) | Extraction front upper level — this is a LINE, not a closed polygon |
| 🟧 **2nd mass quarry face** | polyline | orange (line) | Extraction front lower level. In multi-level mode, auto-tagged at level -1 |

### Draw a structure

1. Click the desired sub-type (🟡 / 🟠 / 🔵 / 🟧 / 🟨) — it becomes active (lit)
2. Click successively on the map to add points
3. **Pillars + Walls (polygons)**: minimum 3 points. To finish, re-click on the lit icon → automatically closes the polygon (links the last point to the first)
4. **Quarry faces (polylines)**: minimum 2 points. To finish, re-click on the lit icon → validates the line without closing it

During drawing, the preview updates in real time. The color and transparency are fixed by type.

### 🧹 Erase structures

Press **🧹** in the Structures group:

| Option | Effect |
|---|---|
| **↩️ Undo last point** | On the current structure, or on the last structure |
| **✂️ Last structure (in progress OR closed)** | Removes the one being drawn if present, otherwise the last validated one |
| **🎯 Select a structure to delete** | Map click mode — select the one to erase by clicking on it or near its edge |
| **🗑️ All structures** | Erases absolutely everything (irreversible) |

> 💡 The "🎯 Select" mode is handy for erasing a specific structure in the middle of a rich map, without having to count the "last added".

### Difference with zones

| | Zones (⬛) | Structures (🏛️) |
|---|---|---|
| Shape | Closed polygon only | Polygon OR polyline depending on the type |
| Colors | Water / Backfill / Collapse / Inaccessible | Pillar 1/2 / Wall / Face 1/2 |
| Pathfinder effect | ⛔ Inaccessible **blocks** the route | None (read only) |
| Typical use | Delineating terrain zones (stagnant water, etc.) | Mapping underground architecture (pillars, walls, progress) |

> 🏗️ **Multi-level mode**: 2nd-mass Pillars and 2nd-mass Quarry Faces are **automatically tagged at level -1** upon creation (the app considers the 2nd mass to be below). Other types take the current active level. You can modify levels afterwards via the JSON editor.

---

## 🫧 An object's popup — note, convert, delete

Clicking **a path, a zone or a structure you drew** opens a small popup. It is the same for all three families.

| Item | What it's for |
|---|---|
| **Text area** | A free note, multi-line if you want — the state of a passage, an observation, a reminder |
| **💾 Save note** | Saves the note. The popup closes on its own |
| **🔄 Convert** | Changes the object's **type**, and if needed its **family** |
| **🗑️ Delete** | Removes the object. Red, on its own row |

### 📍 A point's popup

A tap on a **marker** (a map point or one you added) opens its popup: name, type, note, and a row of buttons.

| Button | What it does |
|---|---|
| **📍 I am here** | Recalibrates tracking on this point. It is also what **confirms your position**: from then on, 🚨 Emergency exit and 🧭 Go there start from here without asking |
| **🧭 Go there** | Computes a route from your position to this point |
| **➕ Route** | Adds the point as a step of a route (current or new) |
| **☆ Favorite** | Adds or removes the point from ⭐ Favorites |
| **🔊 Read the note** | Reads the note aloud (local speech synthesis) |
| **📋 GPS** | Copyable GPS coordinates, if the map is georeferenced |
| **📸 Thumbnails** | Attached photos, tap = full screen |
| **🌀 Links** | Inter-map links leaving from this point |

On **your own points** (your session's) you also get **✏️ Edit**, **📌 Reposition** (then tap the new position on the map) and, on its own red line, **🗑️ Delete** — undoable with ⏪.

### 🔄 Convert — change an object's type, or family

The typical case: on a survey imported from GIS, a **working face** is in fact a **gallery**. As long as it stays a structure, it does not enter route calculation — the router only reads paths. Converting it into a path puts it in the graph.

The dialog only offers targets **compatible with the object's shape**: a **line** (path, working face) can only become another line, a **closed surface** (zone, pillar, wall) another closed surface. You cannot turn a line into a polygon: there is nothing to close it with.

The object keeps everything else — its geometry, its level, its note.

### 🛰️ Options that use a sensor

⚙️ **Settings** → **🛰️ Sensor-based options**. These settings rely on a phone sensor, and **each can be turned off entirely**: a disabled option shows nothing and listens to nothing.

| Option | Default | What it does |
|---|---|---|
| **🔋 Battery level** | on | Shows the remaining charge at the top, warns below 20 %, 10 % and 5 %. Unticked: no icon **and** no sensor listening |
| **📳 Haptic vibration** | **off** | Tactile feedback on some actions |

> ℹ️ **Turning the battery off takes effect on the next launch.** The listening is set up at startup and there is no clean way to remove it mid-session — the app tells you rather than pretending.

#### ⛔ “Sensor refused”

If an option appears **greyed out** with “Sensor refused by iOS” or “by this device”, it is neither a bug nor an oversight: **your system does not give that sensor to web pages**. Apple provides neither vibration nor battery level to a website, even installed as an app.

> 💡 These options used to be simply **hidden** — you could not tell whether they did not exist or whether the phone refused them. They now show up, with the reason.

### 🏁 Your distance when the pedometer saw nothing

With the phone in your pocket the pedometer counts almost nothing. But every **📍 I am here** you place on a point of the plan leaves a **timestamped marker**. The app links those markers **following your galleries** — the same computation as a route — and derives the distance actually walked between them.

In practice: a marker at 12:00, one at 12:30, one at 13:00 → the app computes A→B→C through the galleries, not as the crow flies.

#### 🏁 The last leg, the one that was lost

A leg is only computed when the **next** marker arrives. So everything you walk **after your last marker** was counted by nobody.

When you tap **🏁 Close my outing**, the app asks **where you came out**. One tap on the map and the last leg joins the total. You can **Skip** if you are closing from home.

#### What the record tells you about the number

| What it says | What it means |
|---|---|
| *including 900 m computed through the galleries between 6 markers* | The path was rebuilt on your drawn paths — trustworthy |
| *including 900 m as the crow flies between 6 markers (not refined)* | Straight lines between markers — **underestimated**, sometimes badly |

> ⚠️ **What this computation cannot do**: it takes the **shortest** path between two markers, not necessarily yours. Back-and-forth, dead ends explored, hesitations — all underestimated. And with no “I am here” at all there is nothing to link: the distance stays the pedometer's.

### ⏱️ How an outing's duration is counted

A **field** outing is counted **from start to end**, not from the time the app was open. That is what you mean by “we were down there 3 hours”: the phone in your pocket counts, and so does the app going to sleep.

The record also shows the **time the app was open**, right below. It is not a duplicate: it tells you what the measurement is worth. *3 hours of outing for 12 minutes of app* means a pedometer that saw almost nothing — treat the distance with caution.

> ℹ️ A **desk work** session keeps the usage time: you leave a plan open all evening without looking at it, so the real duration would mean nothing.

#### ✏️ Fixing a forgotten end

If you did not tap **🏁 Close my outing** on the way out, the app does not know when you left: it takes the last moment it was alive — often when the phone put it to sleep. The duration is then underestimated.

Open the outing's record → **✏️ Fix the end**, and enter the real time. The duration is recomputed at once.

> ℹ️ The **app-open time** is never changed: it is a measurement, not a statement. And an end before the start is refused.

### 🔁 An outing split in several — resume and merge

If you leave MyKTAMap during an outing — to change music, to take a call — the phone may **unload the app** to free memory. Previously, coming back started a **new** outing: one real outing showed up as two or three in the logbook, each with part of the counters.

**It now resumes on its own.** On return, if the previous outing on the same plan was interrupted that way less than **45 minutes** ago, the app **continues** it instead of opening another. A message tells you.

**And if you open another plan along the way** — to show it to someone, to check a passage — your outing is **paused**, not ended. Come back to your outing's plan within **2 hours**: it **resumes** where it was, counters and track included. Beyond that, it is filed in the logbook as usual. For a field outing, the time spent on the other plan **counts** in its duration (measured from start to finish): you were still underground. ⚠️ **Tracking**, however, stops when you switch plans: when a field outing resumes, the app offers **"▶️ Restart tracking"** — one tap is enough.

> ℹ️ An outing you closed **yourself** (🏁) is never re-joined. The app only resumes what was cut *against your will*.

#### 🔗 Re-joining outings that were already split

For older ones, or if the delay was exceeded: 📔 **My logbook** → **🔗 Merge outings** → tick the ones to join (at least 2) → **Merge**.

| What gets joined | How |
|---|---|
| Duration, distance, steps, additions | Summed |
| Total duration | From the **start of the first to the end of the last**, gaps included |
| Notes | Stacked, separated by a rule |
| Photos, tracks, levels | Joined |
| Field / desk | If **a single** piece was field work, the whole thing is |

> ⚠️ **Irreversible**: the original outings disappear from the logbook. The app asks for confirmation — it is the only action in the logbook that erases anything.

### 🪟 Where tool panels open

The **Paths**, **Zones** and **Structures** panels open **centred on screen**, like the Tracker and the Filters.

> 🐛 **Why this changed** — they used to stick to the top of their button. The longer their list got — an imported plan adds one type per level — the further down they reached, until they ran past the bottom edge on a phone: the last buttons became unreachable.

If you prefer the old behaviour, tick **🪟 Anchor tool panels to their button** in ⚙️ **Settings**. It is comfortable on a large screen, where space is not an issue — not advised on a phone.

### 🎯 Convert several objects at once

On an imported survey it is common to have **dozens** of mis-typed objects — every working face on a level that is in fact a gallery, for instance. Redoing them one by one would take forever.

In the conversion dialog, click **🎯 Select several objects to convert**. The dialog steps aside and a banner appears:

| Action | Effect |
|---|---|
| **Click an object** | Adds it to the selection (shown as a blue dashed outline) |
| **Click a selected object again** | Removes it — to fix a mis-click without starting over |
| **➕ All “type” on the displayed level** | Extends the selection to **every** object of the same type as the last one added |
| **✅ Convert (N)** | Reopens the choice dialog, with the batch |
| **Cancel** | Drops the selection |

**⛔ Lines and closed surfaces don't mix.** If your selection is made of **lines** (paths, working faces), clicking a **zone** or a **pillar** is refused — and the banner tells you why. Same rule as for a single conversion: there is no common target, you cannot close a line.

You **can** mix families as long as the shape matches: working faces (structures) and tracks (paths) are both lines, so you can convert them together into galleries.

Objects that are **already** of the chosen type are simply left alone — the closing message says how many were converted and how many were already right.

> 💡 The whole batch undoes with a **single** `Ctrl+Z`. It is not N conversions, it is one.

### 🗑️ Delete

**No confirmation dialog**: `Ctrl+Z` is the safety net, as for a point, and the message that appears reminds you. The button is **red and on its own row**, away from “Save”, so it is not clicked by accident.

> ℹ️ These three actions only show on **your** objects. An object coming from a data layer opens a **read-only** popup: to fix or delete it, first open its layer for editing from 🔍 **Filters**, then export the corrected layer.

## 🏗️ Multi-level mode (multi-story underground quarries)

Some underground quarries / galleries have **several physically stacked levels** (Glacière, Capucins, sites with stories). Multi-level mode lets you manage these maps correctly: each path/zone/point belongs to a level, and the pathfinder doesn't magically cross from one level to another through 2D visual intersections.

> 📚 **Visual consistency of levels**: when multi-level mode is enabled, paths are automatically stacked according to their level — a gallery at Level 0 always appears **ABOVE** a gallery at Level -1, and the one at Level +1 above Level 0. Within the same level: Trail (in the back) < Secondary < Main (above). The calculated route and inaccessible zones ⛔ always pass above everything to remain visible.

> ⚠️ **Optional mode** — disabled by default. Most underground quarries are single-level, classic mode is sufficient. Enable it **only** for true multi-story underground quarries.

### Enabling the mode for a map

**2 ways**:

1. **When creating/modifying a map** (via 📦 Create a map or ✏️ Modify an existing map): check the **🏗️ Multi-level map (advanced)** box in the "Map information" section. The generated ZIP contains the flag → on import, the mode is automatically enabled.

2. **Manually in plan-config.json**: add `"multiLevel": true` in the `plan` section, save, reload the map.

> 🔧 **Activation via the generator**: to enable multi-level mode on an existing map, **go through the generator**: 🏗️ Modify an existing map → check **🏗️ Multi-level map** → 📦 Generate the updated ZIP → reload it. This forces an explicit declaration and avoids inconsistencies between runtime state and `plan-config.json`.

> 💡 If you want to disable multi-level mode for a map, also go through the generator (uncheck the box and re-generate). Existing paths keep their level info in the JSON (hidden if the feature is OFF) — re-enable later without losing anything.

### The "Active Level" pill

When the mode is enabled, a **yellow pill** displaying the active level digit (`0` at startup, e.g. `[0]`) appears **below the Leaflet zoom buttons** (top-left of the map, just below the `+` `-`). Click on it to open the **Levels modal**.

> 💡 If you later enable the 🧭 Compass widget while multi-level mode is active, the compass automatically positions itself **below the pill** to avoid overlap.

### The Levels modal

Two sections:

#### 🎯 Active level (for drawing)

Radio buttons `[ − ] [-2] [-1] [0] [1] [2] [ + ]` (5 levels by default, symmetric around 0). The clicked level becomes the **active level**: all new paths, zones, editor points you draw will be tagged with this level.

**Numeric convention**:
- **`0`** = reference level (= elements without a tagged level — typically maps created before multi-level arrived). This is your ground floor / the main gallery.
- **`1, 2, 3...`** = upper stories / levels above the ground floor
- **`-1, -2, -3...`** = basements / levels below the ground floor

⚠️ **Changing the active level cancels any path in progress** (if you had started a main path at Lvl 0 and you switch to Lvl -1, the path in progress disappears). This is intentional to prevent a path from straddling 2 levels.

⚠️ **Reset visible**: changing the active level checks **only that level** in the "Visible levels" section below (focused mode by default).

**2 extension buttons**:
- **[ + ]** (on the right): adds a higher level (max + 1). Useful for upper stories.
- **[ − ]** (on the left): adds a lower level (min − 1). Useful for additional basements.

💡 **Auto-extension**: if you load a map whose data layers already contain elements at levels outside the default range (e.g. a shaft tagged `level: 4`), the app automatically extends the list of available levels so you can select/filter them.

#### 👁️ Visible levels (filter)

Checkboxes per level. Paths/zones/points of **unchecked** levels are hidden on the map (opacity 0). Inter-level junctions remain visible if **at least one** of their endpoints touches a checked level.

**🏗️ The main plan IS level 0**: unchecking level **0** also hides **the plan's main image** (tiles included) — you can finally look at a single floor (e.g. only the transparent level -1 layer), without the level-0 background polluting the stack. Re-check 0 and it comes back. Without multi-level mode, the main plan is never hidden.

**🫥 Level layer transparency**: for stacking to make sense, every level layer (≠ 0) must be a **PNG with a transparent background**. The generator now warns you at generation time if a level layer is opaque (JPEG, or PNG with a flattened background) — it would hide everything below.

Quick buttons:
- **All**: checks all available levels
- **Active only**: checks only the active level

### 🪜 Drawing an inter-level junction

To physically connect two levels (stairs, steep slope, internal shaft, ladder between stories), you use the **🪜 Inter-level junction** sub-action in the **🛣️ Paths** group.

> ⚠️ **Conditional visibility**: the 🪜 button only appears **if multi-level mode is enabled** on the current map. If you don't see it, first check that the yellow pill `[N]` is visible at the top-left.

**Step-by-step procedure**:

1. Open the **🛣️ Paths** accordion group in the sidebar.
2. Click on the **🪜 Inter-level junction** sub-action.
3. A **modal opens** with 2 selectors: `Starting level` and `Arrival level`. By default, "starting" = your active level. Choose the second level, then click **OK**.
4. Path mode starts. **Click on the map** to place as many points as you want (like a normal polyline). You can follow the exact shape of the stairs or draw a simple diagonal.
5. **Press 🪜 again** to validate and exit path mode.
6. The junction appears in **dashed magenta** with a **white+magenta circle** at each of the 2 endpoints.

**Semantics of the 2 levels**: *start* and *arrival* are **symmetrical** on the pathfinder side — no matter which one you put first, the route crosses the junction in both directions. Choose the order that seems natural to you (e.g. stairs going down from Lvl 1 to Lvl 0 → `start: 1, arrival: 0`; a shaft going down from Lvl 0 to Lvl -1 → `start: 0, arrival: -1`).

**Visibility of a junction**: stays displayed if **at least one** of its 2 levels is in the list of visible levels. Example: junction `0 ↔ 1`, filter `[0]` active → junction visible (because 0 is in the filter). Filter `[2]` → junction hidden.

**Special case: one junction = one logical passage**. If in reality there are 2 stairs between the same levels, draw **2 distinct junctions** at the 2 physical locations. The pathfinder will automatically choose the shortest one based on the requested route.

> 💡 **Important for the pathfinder**: junctions are the **only bridges** between levels. If you want a route to go from Lvl 0 to Lvl 1, you **MUST** draw a junction between these 2 levels at the physical location of the passage (actual stairs). Without a junction, the pathfinder refuses to cross even if two paths visually intersect on screen.

### 🧹 Erasing a junction

Junctions are erased **exactly like other paths** via the 🧹 sub-action:
- **🎯 Click selection** → click on the junction → confirm deletion
- **✂️ Last entire path** → if the junction is the last path made, it is deleted
- **🗑️ All paths** → erases absolutely everything (paths + junctions)

### Adding levels to image layers

In the **🏗️ Map Generator**, each image layer (legend, hatching, etc.) has a **🏗️ Level** field (visible only when `🏗️ Multi-level map` is checked). Enter the level the layer belongs to (integer, default `0`).

**At runtime**: the layer is automatically displayed/hidden according to your "Visible levels" filter in the Levels modal. The modal is **authoritative** over the Leaflet checkbox of the layer control → if you manually uncheck a layer, the level change re-applies the correct state.

**Backward compatibility**: if you modify an existing ZIP that didn't have `level` on its image layers, they display at `0` in the generator — modify them to distribute them by level if needed.

### Adding levels to data layers

Existing data layers (`puits.json`, `cataphile.json`, etc.) can also have items tagged by level. Manually add `"level": N` in the JSON:

```json
{
  "data": [
    { "id": "PA1", "nom": "Ventilation Shaft Lvl 1", "x": 100, "y": 200, "tags": ["pa"], "level": 1 }
  ],
  "roads": [
    { "type": "principal", "level": 0, "points": [{"x":1,"y":2}, ...] }
  ],
  "zones": [
    { "type": "eau", "level": 0, "points": [...] }
  ]
}
```

Items without `level` → treated as `level: 0` (backward compatibility with your existing JSON).

### Exporting with level selection

**Quick mode** (🖼️ → ⚡ Quick mode): exports what is currently visible (WYSIWYG, follows your filter).

**Advanced mode** (🖼️ → 🎨 Advanced mode): new **🏗️ Levels to export** section with checkboxes per level. **Independent** of the map filter → you can filter the map on [Lvl 0] but export [Lvl 0+1+2] by checking all 3 boxes. Pre-checked on what is currently visible to avoid surprises.

### Existing maps (backward compatibility)

If you load a map that **has not** enabled multi-level mode:
- No level button, no 🪜 sub-action, strictly identical behavior
- Your old sessions / exports continue to work without modification

If you enable the mode on an existing map:
- All paths/zones/points without a level are considered as **Lvl 0**
- You can start adding Lvl 1, 2… paths that coexist with the old ones (at Lvl 0)

---

## ⬆️ Save and share

> All export buttons are located in the **⬆️ Save** group of the sidebar.

### 📤 Export

Press **⬆️ → 💾**. A modal opens with **5 tabs**: 🚀 Full · 🎨 Advanced · 🔄 Conversion · 🔗 Merge · 📡 External export:

#### 🚀 Full
Exports everything in a single `.json` file (or `.zip` if you tick photos): added points, paths, zones, structures, measurements, tracking trail.
Handy for saving your session and resuming it later.

> 📌 Distance measurement is not included in Full mode.

> 🧭 **Tracker included in Full**: if the tracker is active (or was used during this session), its **current position + traveled path + complete timeline + start timestamp** are embedded in the payload under `session.tracker`. On re-import, your tracking session is **faithfully restored** (timeline + replay possible). If the tracker has never been activated, the field is simply absent (backward compatibility).

#### 🎨 Advanced
Precise selection of what you want to export:

- ✏️ **Added points** + boxes per tag (with miniature icon) + a special `(no tag)` category for points without tags. So you can for example export only points with the `pa` or `danger` tag.
- 🛣️ **Paths** + boxes per type (main, secondary, trails)
- ⬛ **Zones** + boxes per type (water, backfill, collapse, inaccessible)
- 🏛️ **Structures** + boxes per type (pillars / wall / faces)
- 🧭 **Tracker** *(optional)* — if checked, the box shows a real-time counter: *"timeline N evt · path M pts"*. On export includes: current position + traveled path + complete timeline + start timestamp. Re-import restores everything → your 🎬 replay is functional after re-import.
- 👤 **User identity** — dedicated box to include your **profile** (nickname + photo + counters). Useful for migrating your visual identity to another device. On import, a modal toast suggests a reload so the profile banner is updated everywhere in the UI.

**Output format** of choice:
- 📄 **A single session file** (.json — re-importable as a classic save)
- 📦 **Multi-file ZIP** (one file per category: `session_points.json`, `session_roads.json`, etc.)

#### 🔄 Conversion
Converts your session into a **data layer** ready to integrate into a definitive map via the `plan-config.json` file.

Checkboxes: Points / Paths / Zones / Structures (with **tag filtering** for points, as in Advanced).

> 📌 **The tracker is intentionally IGNORED in Conversion mode**. The tracker is by nature **ephemeral and experimental** (PDR subject to drift) — freezing it as a permanent data layer would be misleading for future users of the map. If you want to archive a tracking session, use **Full** or **Advanced** mode (= re-importable as a session, not frozen in the map).

**Granularity** of choice:
- 📄 **Basic**: 1 file per category (`points.json`, `roads.json`, `zones.json`)
- 🔬 **Fine**: 1 file per type (`zones_eau.json`, `zones_remblais.json`, `roads_principal.json`, etc.)

Direct download if 1 single file, ZIP otherwise.

> 💡 Conversion is useful for freezing part of your work in a permanent map. Once converted to a data layer, this data is no longer modifiable from the application.

#### 🔗 Merge (combine several data layers)
Building a large map across **several sessions** and ending up with lots of files (`Point1.json`, `Point2.json`, `Road1.json`…)? The **🔗 Merge** tab **groups them into a single set per type**.

- Drop/select **N** data layer files (`.json` and/or `.zip`, can be added cumulatively).
- The app **concatenates them by category**: all points → `points.json`, all paths → `roads.json`, all zones → `zones.json`, all structures → `structure.json`.
- A **preview** shows the totals and **warns** you if any point ids are duplicated (duplicates are kept as-is).
- **Download** the result (a ZIP, or a direct `.json` if there is only one category), ready to drop into your map folder.

Available **without an open map** from the home screen: **📊 Data editor → 🔗 Merge data layers**. **100% local**, no data sent.

### 🖼️ Export to PNG/JPG

Press **⬆️ → 🖼️ Export the map as an image**. A modal opens with two modes:

#### ⚡ Quick export
Everything is included automatically: complete map, all visible layers, points, paths, zones, tracker position and path. PNG format original resolution. A single click on **Download**.

#### 🎨 Advanced export
For precise control over everything you export:

- **Image layers** — check/uncheck each layer (map legend, annotations, etc.)
- **Data layers** — check the layers to include (shafts, vehicles, etc.). The zones and paths embedded in these layers are also exported.
- **Annotations** — choose what to include from your points, paths, zones, measure, tracker position and path
- **Built-in legend** — adds a stylized legend directly on the exported map:
  - **Position**: 4 corners (top-left, top-right, bottom-left, bottom-right) or **custom** (click 🎯 then on the map to place the top-left corner of the legend)
  - **Style**: Opaque / Semi-transparent / Watermark
  - **Size**: Compact / Standard / Large
  - **Content**: Icons / Paths / Zones / Tracker tag / Map metadata (name, version, author, date)
- **Format**: PNG or JPEG (90% quality, lighter file)
- **Resolution**: Original, ½ or ¼. The app pre-selects the largest one that stays reasonable (½ or ¼ on a very large map) and shows, below the choice, the image size and the memory it will need; beyond that, a warning appears. On iPhone/iPad, the resolutions Safari cannot create are greyed out
- **Preview**: a mini-canvas updates in real time to visualize the result

> ⚠️ Before sharing this image, check that it does not reveal sensitive information.

### 📤 Export to printable PDF

Press **⬆️ → 📤 Printable PDF**. Generates a print-ready PDF with header (title + metadata) and positionable legend.

**Typical use cases**:
- 🖨️ Paper printing to take into the field (A4, A3, or even large formats)
- 📧 Sharing by email with a colleague who doesn't have the app
- 📁 Durable archive of an important session

#### 📐 Supported formats
| Format | Dimensions | Typical use |
|---|---|---|
| **A0** | 841×1189 mm | Pro plotter, wall poster |
| **A1** | 594×841 mm | Large format, workshop |
| **A2** | 420×594 mm | Poster, presentation |
| **A3** | 297×420 mm | A3 paper |
| **A4** | 210×297 mm | Standard paper *(landscape default)* |

× **Portrait** or **Landscape** (10 combinations total).

#### 🗂️ Content selection

Like the advanced PNG export, you tick exactly what you want to include:

- **📦 Session annotations** — Points / Paths / Zones / Structures (real-time counters based on your session)
- **🖼️ Base image & layers** — "Base map image" checkbox + 1 checkbox per image layer of the map (image layers like legends, photo annotations, etc.). Pre-checked = current visibility on the map.
- **📊 Data layers** — 1 checkbox per data layer of the map (wells, vehicles, paths, embedded structures, etc.). Your own annotations layer appears with a special label "My annotations (= session layer)".
- **🎨 Layout** — Header checkbox (title + metadata at top)
- **📏 Quality** — Standard ×1 (default, recommended A3/A4) · HD ×2 (heavier file, recommended A0/A1) · Draft ×0.5

> ⚠️ A0/A1 + quality ×2 can take 30-60 sec on mobile (large canvas).

#### 🗗️ Legend — 4-corner overlay

Instead of a dedicated footer, the legend is placed as an overlay on the map, at the corner of your choice. Configure in the **🗺️ Legend** section:

- **Enable**: checkbox "Include the legend overlaid on the map"
- **📍 Position**: 4 radios — ↖ Top-left · ↗ Top-right · ↙ Bottom-left *(default)* · ↘ Bottom-right
- **📏 Size**: Compact (16px icons) · Standard (22px) · Large (30px)
- **🎨 Style**:
  - **Pro white background** *(default)* — suited for paper printing (dark text, navy blue accent)
  - **Opaque dark** — charter dark background, yellow accent
  - **Semi-transp. dark** — lets you see the map through the legend
  - **Discreet watermark** — most discreet version

The legend automatically contains:
- 🕳️ Wells + 🪜 Access + ⚠️ Signage (icons of points actually present on the map)
- 🛣️ Paths (by type)
- ⬛ Zones (by type)
- 🏛️ Structures (pillars / wall / faces)

> 🎯 **Filter by actual use**: an icon / type only appears in the legend if it's present at least once on the exported map. You won't get a "2nd mass Pillar" type displayed if you haven't drawn any.

#### 📛 Credits

The generated PDF carries the signature `Generated by MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr` at the bottom right. File name: `<map>_<date>.pdf`.

> ⚠️ **No emoji in native PDF text** (the jsPDF lib uses Helvetica latin1 which doesn't support Unicode). Emojis in the legend are OK because it's rendered as a canvas image before being pasted into the PDF.

---

### 🌍 Export as geolocated KMZ (Google Earth, OsmAnd, Locus, Avenza)

Press **⬆️ → 💾** then the **📡 External export** tab (KMZ). Generates a `.kmz` file that can be opened in any KML-compatible field mapping app.

Typical use cases:
- Visualize your map in **Google Earth** over satellite imagery
- Load into **OsmAnd / Locus / Avenza** for offline field navigation
- Share with a colleague who doesn't have MyKTAMap but has a KML viewer

#### Calibration via 2 GPS points (+ optional 3rd point)

The KMZ needs to know **where your map is located on the globe**. You give it 2 pairs (point on your map ↔ real GPS coordinates), the app calculates the rotation+scale+translation transformation and positions everything correctly.

For each point (A and B), 3 methods to choose from:
- **🔍 Search for a point**: type a name in the bar, click the result → the map x/y coords are auto-filled. You just need to fill in the corresponding GPS coordinates.
- **📍 Click map**: the modal shrinks, you click on the map where you know the GPS coords → map x/y auto-filled. Fill in the GPS coords.
- **Manual entry** of the 3 fields (Map x, Map y, **GPS (lat, lng)**).

> 🌐 **GPS format**: the `GPS (lat, lng)` field directly accepts the **native Google Maps format** (`48.680831, 2.158843`). You can copy the coords from Google Maps (right-click → copy coordinates) and paste it all into the field — no need to split into 2 lat / lng fields. If the format is invalid, the field turns red with an explicit message. The same format is accepted **everywhere** in the app (Ctrl+K search · KMZ Settings · georeferenced map creation).

> 💡 **Tip**: choose 2 **far apart** points on the map (ideally at opposite ends) — the larger the AB distance, the better the transformation accuracy. The app refuses if AB is less than 50 px on the map or less than 1 meter IRL.

> 📐 **Point C (optional) — for distorted plans**: if your plan is an **assembly** that projects badly (stretched in one direction, different scales in X and Y), add a **3rd point** in ⚙️ Settings → Georeferencing (or in the generator): the app then switches to a transformation that **corrects the overall distortion** — OSM view, KMZ/GPX exports and Rescue Mode all benefit. Choose C **far from the A-B line** (an aligned C adds nothing and is refused). Good to know: it corrects an *overall* distortion — if each piece of the assembly has its own error, the result improves but cannot be perfect everywhere. Leave C empty if your plan already projects well: nothing changes.

#### Live preview

As you fill in the fields, a **🌐 Corners preview** block displays with:
- The 4 corners of your map calculated in (lat, lng) — ↖️ ↗️ ↙️ ↘️
- The calculated **scale** (meters per pixel) and **rotation** (°)
- A **🔗 View center on Google Maps** link to visually verify that the center of the map falls where you expected (auto internet connection check before opening)

#### Content to include (fine granularity)

Same as the Advanced Image mode: parent checkboxes + sub-checkboxes for precise control.

- 🖼️ **Map image** (GroundOverlay) + **Opacity 0-100%** slider (default 60%) — lets you see satellite/OSM mapping under your map in Google Earth Images beyond ~8,000 px are **automatically reduced** (Google Earth silently cropped them) — a V2-tiled map is recomposed from its tiles; if reduction is impossible, the app asks before exporting.
- 📍 **Points** + sub-checkboxes per tag with icons and counters (session + data layers)
- 🛣️ **Paths** + sub-checkboxes Main / Secondary / Trails
- ⬛ **Zones** + sub-checkboxes Water / Backfill / Collapse / Inaccessible
- 🪜 **Inter-level junctions** (if multi-level map)
- 🗺️ **Active route** (if calculated)

For example, you can export only the **ventilation wells** without the trails, or only the **inaccessible zones** to provide a danger layer to an external viewer.

#### Levels to include (if multi-level)

Dedicated section with chips to filter by level. By default all available levels are checked (1 KML Folder per level in the file).

#### Download

Click **Download** → file `MyKTAMap_<MapName>_<date>.kmz` downloaded.

#### Calibration persistence

Your 2-point calibration is saved **per map** (on this device). On the next export of the same map, the 8 fields are already pre-filled — adjust if needed and re-download. If you change maps or start over, you'll just need to re-enter it.

> ⚠️ **Accuracy limits**: the transformation is a **2D similarity** (rotation + uniform scale + translation). On globally flat and rigid maps, it's sufficient. On very extensive or non-rigid maps (local deformations), expect a slight drift at the ends opposite to the calibration. A future version may support 3+ points (least squares) for more accuracy if needed.

> ⚠️ **As with PNG export**, check that your KMZ doesn't reveal sensitive information before sharing it publicly (private underground quarry, restricted access…).

---

## ⬇️ Load / Import

> The **⬇️ Load / Import** group in the sidebar contains the import actions.

### 📥 Import a session

Press **⬇️ → 📥 Import**, then the **MyKTAMap session** card to open the import window. A modal displays:

1. **Drag and drop** your `.json` file (or `.zip` with photos) into the area, or click to select it
2. A **preview** displays: number of points added, number of paths, number of zones, number of measurement points
3. A **warning** notifies you that the import will replace your current session — remember to export before if necessary
4. Click **Import** to validate, or **Cancel** to close without changing anything

### 📊 Plan data editor

Press **⬇️ → 📊 Plan data editor** (in map mode) **or** the **📊 Data editor** button on the home screen to open the table editor. You can **view, edit and export** the plan's data (points, paths, zones, structures).

> ℹ️ From the **home screen**, no plan is loaded yet: only the **📦 ZIP** and **📄 JSON** sources are offered (no "current plan").

#### Opening — 3 sources

1. **🗺️ Current plan** — lists the data layers of the open plan (shafts, accesses, paths, zones…). Pick one to edit.
2. **📦 Import a ZIP** — retrieves the data layers from a full plan (`.zip`).
3. **📄 Import a JSON file** — a single data or session file (drag and drop).
4. **🔁 Convert resolution** — standalone tool to **migrate your data from an old scan to a new scan of the same map**. Give both resolutions (typed or 📷 auto-detected from the images — even huge ones), one or more `.json` files, and get them back converted. If the new scan has different margins: add a **landmark common to both maps** (the same pillar read on each) — the conversion anchors exactly on it, with optional rotation; with **two landmarks**, scale and rotation are derived automatically. Whatever is not in the file (inter-map links, georeferencing, map scale) must be redone on the new map.
5. **🧹 Deduplicate data** — removes **consecutive identical vertices** accumulated in the roads, zones, structures and measurements of a `.json` file (data layer or exported session): an old "map click" mode bug could stack several per click — invisible on screen, but they bloat files and exports. Pick one or more files, get them back cleaned as `_dedup.json` with a count of what was removed. Points (POIs) are **never touched** — two deliberately overlapping points stay distinct.

If a source contains several datasets, a **selector** appears (each with its element count). The table then opens with one column per detected field.

#### Editing

- **Click a cell** to edit it (except ID, read-only)
- **Tab**: next cell · **Enter**: next row (same column) · **Esc**: cancel
- **Coordinates**: if X or Y is off the map, the cell turns red with a warning ⚠
- **Tags**: click the cell to open a multi-tag selector with icon preview (you can create a new tag on the fly)
- **🔒 Paths / zones / structures**: you can edit the **note** (description), **type** and **level**, but the **geometry** (the `points` column) stays **read-only** — to redraw it, use the drawing tools on the map.

#### Actions *(points only)*

- **🔍 Search** filters all columns · **Sort**: click a header (asc → desc → cancelled) · **Multi-selection**: checkbox + Shift+click
- **+ Add row** · **📋 Duplicate** · **🗑️ Delete** (confirmation) · **📍 View on map** (selected points in flashing orange)

#### Saving *(plan data is never loaded live)*

**💾 Save** button:

| Case | Effect |
|---|---|
| **Plan data** (points / paths / zones / structures) | **📥 Download** the modified `.json` file. ⚠️ To **apply** it, re-import that file in the **Generator** (🏗️) — the editor never changes the plan live on the map. |
| **Session** (your current annotations) | **📥 Download** **or** **✏️ Replace the current session** (live update of your session points). |

> ⚠️ If you close the window with unsaved modifications, a confirmation offers to save, quit without saving, or continue editing.

### 🗂️ Change map

This button is **no longer in the ⬇️ menu**. To change map: tap the **compass rose 🧭** (home) or the **map title** (“Change map” window, see above) in the top bar. Your session is **saved automatically** before switching.

From this screen, you can:

- Click **▶️ Resume** to relaunch the map you just left
- Choose another map in **My maps** (direct click or ▶️ button on the row)
- Load a new ZIP via the import area
- Import/Export your map list

---

## 🏗️ Create or modify a map

> Accessible directly via the **🏗️** button in the sidebar (direct click, no sub-menu).

Press **🏗️** to open the generator. Two tabs available:

### 📦 Importing several maps at once

The **📦 Import several maps** button, in the **🧰 Tools** section of the home screen, adds as many ZIP archives as you want to your list — **without opening any of them**. You then open the one you want, from the list.

The screen reads in three steps:

1. **You choose** your files.
2. **You see what will happen**, line by line: what will be added, what is already in your list, what is refused and why. The summary gives the total size, what will be copied into the app, and the space left.
3. **You start.** Maps come in one by one, with the current name shown, then a summary: added, skipped, refused.

**If a map is already in your list**, you choose once for the whole batch: leave it as is, replace it, or keep both. By default it is left as is — an import never overwrites anything unless you ask.

> 💾 **Space is announced up front.** A browser's storage holds between 50 and 200 MB depending on the device. If your batch does not fit, the app refuses to start and tells you how much is missing. If space runs out along the way, it **stops right there**: the maps already added are kept, and the summary says where it stopped.
>
> 📁 **"File into:"** — pick the "My maps" folder that receives the whole batch (or "➕ New folder…", named on the spot). By default, maps arrive as "Unfiled".
>
> 💾 **"Preload the ZIP" (checked by default, it follows the "Store the map in the app on first load" setting of ⚙️ Home configuration)**: the app keeps the file, and each imported map **opens from the list without you having to pick its ZIP again**. Uncheck it if you only want to fill your list without storing anything: nothing is copied, space is no longer a concern, and you will be asked for the ZIP the first time you open each map (as with a map restored from a profile).

> 🔒 **100 % local**: everything is read and stored **in your browser**. Not one byte is sent anywhere, and it works offline.

### 🗺️ Dropping a GeoTIFF

If you georeferenced your map in **QGIS**, export it as a **GeoTIFF** (`.tif` / `.tiff`): the image **and** its georeferencing travel in the same file. Pick it as the map image — in the generator or straight from the home screen — and the app does the rest:

- it **reads the georeferencing written in the file** and fills in the **GPS calibration** by itself;
- it derives the **scale** (px/m) and the map's **extent**, both shown in the confirmation message;
- it converts the image to PNG for the rest of the flow (no desktop browser displays a TIFF), then tiling and ZIP proceed as usual.

**You no longer have to re-enter the two GPS points** you had just set in QGIS.

> ✅ **What is read**: **LZW, Deflate or no** compression · **8 bits per channel** · **greyscale, RGB or RGBA** · **strip-organised** image · **north-up, rotation-free** georeferencing · coordinates in **Lambert 93, Web Mercator or WGS84**.
>
> ❌ **Whatever is refused is always named**, with what to change on export: BigTIFF, tiled image, separate channels, palette / CMYK / YCbCr, unusual predictor, rotated georeferencing, unsupported coordinate system. A message tells you exactly what to re-export — the app never guesses for you.

> 🔒 **100 % local**: the file is read and converted **in your browser**. Not one byte is sent anywhere.

### 📄 New map

Blank form. Fill in:

- **Information**: name, version, author, **🏷️ tags** (comma-separated, 12 max, 24 characters each — the same input as in ℹ️ Info). They travel in the ZIP and are **proposed** to whoever imports it: if you already set your own tags on that map, yours stay, even when re-importing a new version. The field also exists in the KMZ, GPX and SIG conversions.
- **Main image** (required) — the **map dimensions are auto-detected** as soon as you choose your file. A box displays the dimensions and size in MB, with **red warnings** if the image exceeds 10,000 px per side or 30 MB (memory crash risk on mobile / very heavy ZIP).
- **Collision map** (optional)

- **Initial tracker position** (🧭 Tracking group) — **auto-centered** to the middle of the map (W/2 × H/2) as soon as the main image is loaded. You can manually modify these values if you want to start the tracker at a specific location. **🎯 Recenter starting position** button available to reapply the center at any time.
- Additional **image layers** (legends, annotations) — up to 10
- JSON **data layers** — up to 10 (created empty if not provided)
- **Tracking parameters**: starting position, scale, sensitivity
- **Icons & Tags**: dynamic manager
  - Click **↺ Load defaults** to pre-fill with standard icons
  - Click **+ Add a tag** to create a custom type
  - For each tag, choose a custom icon or leave the default path
  - The `default` and `track` tags are required (system)

The **Additions** layer (`editor.json`) is always automatically included.

Click **📦 Generate ZIP** — the archive is ready.

### 📂 Modify existing

Import an existing ZIP — the form auto-fills with its configuration. Modify what you want (add tags, change icons, add layers, etc.) and click **📦 Generate ZIP** to download the modified version.

> Useful for adding new icons to a map already in circulation, or to adjust the initial tracker position.

### 🎨 Blank image

If you want to create a map **from scratch** without a source image (for example to draw only pillars / quarry faces / paths on a blank canvas), you can generate a **blank image**.

In the **🖼️ Main images** section of the generator, 2 radio modes:

| Mode | Effect |
|---|---|
| **📷 From an image** (default) | Standard upload of a PNG / JPG / WebP |
| **🎨 Blank image** | The app generates an empty canvas at the dimensions and color you choose |

When you select **Blank image**:

- **Width** and **Height** in pixels (500 min, 12,000 max — anti-mobile-memory-crash limits)
- **Background color**:
  - ⬜ **White**: paper style — useful for drawing architectural plans
  - ▫️ **Light gray**: neutral, less aggressive
  - ⬛ **Black**: dark background style (terrain in darkness, drawing white trace on top)
  - 🌫️ **Dark gray**: between neutral and dark
- **🎨 Generate image** button: the app creates the canvas + auto-injects it as the main image. The map dimensions adjust accordingly.

You can then add your data layers (empty), tracking, icons and **📦 Generate ZIP** as for a normal map. Once the map is loaded in the app, draw what you want (pillars, quarry faces, paths, points) via the usual tools.

> 💡 **Typical case**: a cartographer visiting an underground quarry to explore, without an existing paper map, can generate a blank 4000×4000 black map upon arrival, then draw progressively (with the tracker as a reference). At the end, the ZIP is shareable.

### 📦 Import a datalayer ZIP in one click

In the **📊 Data layers** section of the generator, a golden yellow box offers **📦 Choose a datalayer ZIP…**. It serves to **retrieve in one go** the layers + photos from another map, exported via **📤 Export → 🔄 Conversion → ✏️→🗂️ Session to data layer** (with the 📸 Photos checkbox checked to include them).

**Typical use case**:
1. KARMA sees a friend who has annotated a map (points + paths + zones + structures + photos) and who exports a `data_<map>.zip` via Conversion
2. You copy this ZIP onto your device (Drive, AirDrop, USB…)
3. In the generator, **Modify existing** OR **New map** mode, you click the 📦 Choose a datalayer ZIP button
4. The ZIP is parsed → **data layers are automatically created**: `points` (the friend's points), `roads` (paths), `zones` (zones), `structure` (pillars/faces). If the ZIP contained photos, they are **kept in memory** to be embedded at generation time.
5. Green message "✅ N layer(s) created: points (X), roads (Y), zones (Z), structure (W) · 📸 M photos"
6. You **📦 Generate the ZIP** as usual → the final map contains your original layers (if Modify) + the imported layers + the `data/photos/` folder with the blobs
7. When this map is loaded by any user, the photos are automatically restored on their device and appear in the marker popups

**Behavior**:
- **New mode**: the imported layers become the map's data layers (the UI list is emptied and filled with the ZIP's layers)
- **Modify mode**: the existing layers of the source map are **preserved**; the imported ZIP's layers are added with **`_imported_<N>` suffix** if there's an id conflict (= never overwrites the original layers). Current map's IDB photos **merge** with the ZIP's photos (deduplication by photoId).

> 📸 **Expected datalayer ZIP format**: it's exactly what the **session → data layer Conversion** produces when you check "📸 Include attached photos" (Basic or Fine granularity doesn't matter). Contains `points.json` + `roads.json` + `zones.json` + `structure.json` (depending on what was present in the source session) + `photos/_index.json` + `photos/<photoId>.jpg`.

### 📸 Include photos attached to the map

In **Modify existing** mode, if the map you load already has **photos attached to its points** (saved on your device by the editor), a **📸 Include attached photos (N · X MB)** checkbox appears in the "🖼️ Main images" section of the form.

- **Checked by default**: the map's IDB photos are embedded in the generated map ZIP under `data/photos/<photoId>.jpg`. You can thus share the complete map (annotations + photos) to another device.
- **Unchecked**: the generated map ZIP does not contain the photos. Lighter in size, but the user who imports the ZIP will not retrieve the photos.

When loading this map ZIP by any other user: the photos are **automatically restored** on the device, under the map's local id + a discreet toast "📸 N photos restored from the map" confirms.

> ⚠️ If you uncheck **AND** you have also imported a datalayer ZIP with photos (see previous section), only the imported datalayer's photos will be embedded. The 📸 checkbox controls ONLY the current map's IDB photos.

### 🧱 Convert to V2 tile (performance)

If your map is heavy (image > 50 MB, dimensions > 8000 px), you can convert it to a **V2 tiled map** to massively reduce runtime memory consumption. The system splits the image into 512×512 tiles over 4 zoom levels (Google Maps-like) — at any time, only the tiles of the current zoom level are loaded in RAM.

**Workflow**:

The 🧱 Convert to V2 checkbox appears in the form as soon as you have **uploaded a main image**, whether you are in **New map** OR **Modify existing** mode (no need to go through a V1 source ZIP).

1. **New map**: choose a main image → the 🧱 checkbox appears<br>
   OR **Modify existing**: upload your V1 ZIP (the 🧱 checkbox is available)
2. Check the **☑️ 🧱 Convert to V2 tile (performance)** box (purple frame)
3. **Warning modal**: the conversion is heavy (CPU + RAM). Read the message, click **I understand — Continue** (or **Cancel (uncheck)** if you want to think about it). See "PC vs mobile" section below.
4. Fill in the rest of the form (name, version, layers, tracking, etc.)
5. Click **📦 Generate the ZIP** → progress overlay "Level z=−N · X / Y tiles (Z%)"
6. ZIP downloaded with `_v2` suffix (e.g.: `plan_xxx_v2.zip`)
7. **Re-import this ZIP via the loader** → V2 mode activates automatically (purple `V2` badge on the map plan)

**Built-in auto-crop**: if your source image has lots of white margins (typical of scanned paper plans), the generator automatically detects the bbox of useful content and only tiles this area. You gain ZIP size + sharpness at max zoom. If the image is already well framed, no crop.

**🫥 Transparency preserved**: if your source image is a **PNG/WebP with real transparency** (alpha background), the generator no longer adds a **dark background**: tiles keep the transparency (WebP format, or PNG depending on the browser). Result: behind transparent areas you see the map's dark background — and in the **OSM View**, the OpenStreetMap map shows **through your plan**. Detection is automatic (it looks at pixels, not the file extension — a PNG whose background was already flattened is still treated as opaque). On a transparent source, the auto-crop above is **disabled** so your points/paths/georeferencing are never shifted. **Existing V2 plans**: the background was baked into their tiles back then — regenerate once (Edit → re-check V2) to benefit; without regeneration they keep working as before.

**Trade-offs**:

| ✅ Gains | ⚠️ Costs |
|---|---|
| Memory consumption massively reduced (~16 MB max instead of the entire image in RAM) | Slow conversion (1-5 min depending on image size) |
| Ideal for mobile (Safari iOS, large maps that crash in V1) | The final ZIP contains more files (the tiles) but ~same total weight as a single PNG/JPEG |
| Smoother navigation on pan/zoom | Light visual flash on zoom level change (tile swap) |
| Auto-crop of white margins | Black border visible when you zoom out very very far (beyond the edges) |

**Modify an already-V2 map**: the box is **pre-checked** by default → the tiles will be regenerated with the new modifications. If you uncheck, explicit V2 → V1 downgrade (the tiles are not carried over into the new ZIP).

#### 💻 PC vs 📱 Mobile for conversion

> ⚠️ **Important** — this is the topic of the warning modal that appears when you check the box.

| Platform | Source image decoding | Recommendation |
|---|---|---|
| 💻 **Computer** (Windows / macOS / Linux) | No memory limit in practice. Conversion 1-5 min depending on size. | ✅ **Recommended** for generation |
| 📱 **Mobile** (iOS / Android) | Capped at **~500 MB of RAM** for the PWA. Crash almost guaranteed on image >50 MB or >8K px. | ❌ Avoid — **but** the V2 ZIP generated on PC imports without cost on mobile (that's the whole point of V2) |

> 💡 **Recommended workflow**: generate the V2 ZIP once and for all on your PC, then share it on your phone (Drive, AirDrop, etc.). The phone imports it in a few seconds and you enjoy the tiled runtime without memory cost at boot.

#### 🎛️ Disable tiling on read (V2 → V1 raw)

When loading a V2 map, you can choose **Performance mode: Disabled** in the loader's **⚙️ Configuration** modal. In this case, the runtime ignores the tiles and directly loads the **source image** of the ZIP, kept intact, as a classic V1 map.

Use cases:
- Compare V2 vs V1 rendering on the same map
- Temporary bypass if you see weird behavior of the tile system (debug)

⚠️ This mode loads the entire image in RAM → may crash on mobile for large maps (this is what V2 normally avoids).

> 💡 **To test in priority** on your largest map that crashes on mobile, or before sharing a heavy map with someone with a modest phone.

---

## 🚀 Optimize your map for performance

A lightweight map loads faster, navigates more smoothly, and **strongly reduces the risk of memory crash on mobile**. Here are the best practices in order of impact.

### 1. 🖼️ Main image — limit the dimensions

The base image is the **biggest memory consumer**. On mobile, the browser allocates a canvas the size of the entire image.

| Dimensions | Behavior | Recommendation |
|---|---|---|
| ≤ 4 000 × 4 000 px | OK everywhere | ✅ Ideal |
| 4 000 - 8 000 px | OK desktop, limited zoom-out on mobile | ⚠️ Acceptable |
| 8 000 - 16 000 px | Risk of crash on low/mid-range mobile | ⚠️ Forces tiling (Performance mode) |
| > 16 000 px | Crash almost guaranteed on mobile | ❌ To avoid |

**Tip**: if your source map is gigantic, resize to 6 000-8 000 px side max with an image editor (GIMP, Photoshop, [Squoosh](https://squoosh.app/) online). You lose a bit of detail at max zoom but you gain a lot in stability.

### 2. 📦 Image format — JPEG vs PNG

| Format | When to use | Typical weight (8000×6000 px) |
|---|---|---|
| **JPEG** (quality 80-90%) | Photos, scans, plans with gradients | ~3-8 MB ✅ |
| **PNG** | Plans with transparency or sharp flat colors | ~15-50 MB ⚠️ |
| **WebP** | Quality/weight compromise (modern Chrome/Firefox/Safari) | ~2-5 MB ✅✅ |

> 💡 For a classic quarry map with roads drawn over a solid color, **JPEG quality 85** divides the weight by 5 to 10 without perceptible visual loss.

### 3. 🗂️ Image layers — limit the number

Each additional image layer (legend, annotations, etc.) **multiplies the memory used**. The visitor loads all layers even if they hide some.

| Number of image layers | Recommendation |
|---|---|
| 1 (base image only) | ✅ Optimal |
| 2-3 | ⚠️ Acceptable if each is ≤ 2 MB |
| 4+ | ❌ To avoid — merge into the base PNG |

**Alternative**: if you have decorative elements (legend, markers), **integrate them directly into the base image** rather than making them separate layers. You lose the ability to hide them but you gain in perf.

### 4. 🛣️ Routes — integrate into the PNG if numerous

JSON routes (Main/Secondary/Trail) are rendered by Leaflet as a vector overlay. Beyond **~50 routes**, the browser may lag on pan/zoom.

**Strategy for large maps**:
1. Trace the routes in your image editor (GIMP/Photoshop) **directly on the PNG**
2. Keep a minimal JSON layer with invisible routes visually but usable by the **🗺️ Route module** (the pathfinder uses all the layer's routes, **even hidden**)
3. In the Leaflet layer control, **uncheck the JSON routes layer** → you see the routes via the PNG, the app doesn't draw the vector polylines → big perf gain
4. The route module continues to work

> 🎯 This technique allows having **hundreds of segments** on the map without any perf impact on pan/zoom.

### 5. 📍 Points — limit dense data layers

Each JSON layer of points (`puits.json`, `chatieres.json`, etc.) creates Leaflet markers. Beyond **~500 markers simultaneously visible**, it can slow down rendering on mobile.

| Number of markers | Recommendation |
|---|---|
| ≤ 200 | ✅ OK |
| 200-500 | ⚠️ OK desktop, caution mobile |
| 500-2000 | ⚠️ Separate into several toggleable data layers |
| > 2000 | ❌ Consider a "grouping" mode (clustering, future feature) |

**Tip**: separate your points into several data layers (e.g.: `puits.json`, `passages.json`, `electricite.json`) so the user can hide those that interest them less.

### 6. ⚡ Image splitting — Auto, unless you have a reason

⚠️ **This setting is no longer on the loading screen.** It lives in the map's **ℹ️ Info** panel,
and **only for a map not split at generation time** — on a V2 map it would have no effect, so it is not shown.
Good news: it is **remembered for that map** there, whereas the old selector went back to Auto at every start.

Two choices:

| Choice | When |
|---|---|
| **🔄 Auto** (default) | Splits as soon as the image exceeds 4,096 × 4,096 px, or the file exceeds 60 MB. ✅ **The right choice unless you have a specific reason.** |
| **💤 Disabled** | Small map on a powerful desktop, when you want native quality with no re-encoding. **⚠️ Risk of crash on Safari iOS beyond 8,000 px** — a message warns you. **No effect on an already-split map** (V2), which always uses its pieces. |

> 🩸 **What changed, and why.** The 🌟 Quality / 🎯 Balanced / ⚡ Performance presets were **removed**: they only tuned the splitting done by the browser at load time, which only concerns **V1** maps. On a **V2** map — today's common case — they changed **nothing at all**.
> And "Auto" decided on **file weight**, not pixel size: a well-compressed 100 Mpx map (~15 MB) **was not split** and could crash an iPhone, while "Quality" would have split it. The default was therefore the **least** protective mode. Fixed.

> 💡 The choice is remembered **per map**: it applies to every later load until you change it. *(Previously the loader's selector was not remembered and went back to Auto at every start.)*

### 6 bis. 🚀 Performance ULTRA mode — for the really big maps that crash

If despite Performance mode, your map still crashes (typically 4000+ × 2000+ pixel maps with many paths), open **⚙️ Settings → "🚀 Performance ULTRA mode" section** and enable the **🚀 ULTRA master toggle**. It enables 6 aggressive optimizations simultaneously.

> 🆕 **Three things to know**:
> - **PER-PLAN setting**: enabling ULTRA here only affects the open plan. Your other plans are not impacted. After the update, plans that had ULTRA start disabled again — re-enable it on the ones that need it.
> - **Your session points are sacred**: POIs you add by hand (✏️) stay **always visible**, even with the "Viewport culling" option on — only the thousands of data-layer points get lightened.
> - **Message on load**: when optimizations are active on a plan, a message reminds you at load time — a "lightened" display (simplified paths, data popups off…) is not a bug.

> ⚠️ These optims do **NOT** touch the image (already managed by the performance mode above). They target vector elements (paths, points, calculations).

**The 6 individual toggles** (activable separately if you want to refine):

| Toggle | Effect | Trade-off |
|---|---|---|
| 🪜 **Decimate paths on zoom-out** | Simplifies polylines on zoom out | Less smooth paths on zoom-out |
| ⚡ **Disable zoom/pan animations** | Instant transitions instead of animated | More abrupt visual — **reload required** |
| 🎯 **Disable intersection circles** | No more circles at crossings beyond 50 roads (vs 500) | Crossings less visible |
| 🚫 **Disable popups on data layers** | No popup on click on layer markers (puits, etc.) | Use 🔍 Search to interact |
| 🐢 **Slow auto-save (30s)** | Save every 30s instead of 1.5s | Risk of losing 30s of edits if crash |
| 👁️ **Only render visible paths** | Skip off-screen roads | Light pop-in on pan |

**How to use it**:

- **If the app still crashes** → check **🚀 ULTRA** (enables everything). Immediate effect (except "animations" which requires a reload).
- **If you want to refine** → keep ULTRA unchecked and manually enable the toggles according to what you want to sacrifice. For example: you can enable just **🐢 Slow auto-save** and **👁️ Viewport culling** to gain quite a bit without losing anything visually.
- **To return to normal behavior** → uncheck **🚀 ULTRA** (this unchecks everything) or uncheck individually.

**Persistence**: the toggles are memorized in your browser (global preference, not per map). They remain enabled between sessions.

> 💡 Recommended combo for very large maps: 🚀 ULTRA + ⚡ Performance mode at load + source image ≤ 8000 px / JPEG q85.

### 7. 📱 Mobile-specific

- **iPhone PWA** (installed on home screen) handles large maps better than direct iPhone Safari
- **Android Chrome** is generally more tolerant than iOS for memory
- In case of crash: ⚙️ Configuration (home) → **🛠️ Developer Mode** → detailed logs to diagnose

### 8. 💾 Regular saving

Very large maps can cause **silent memory kills** on iOS — the OS kills the tab without warning to reclaim RAM. The app detects this kill at reboot and shows you a warning toast.

> 📌 **Reflex**: export your session (📤 Export) every 10-15 minutes of intensive work. Local auto-save already protects against most cases, but an external export is the safest.

### Quick recap

✅ **For an optimal map**:
- Base image **JPEG quality 85** ≤ 8 000 px on a side
- 1 or 2 image layers max
- Routes **drawn in the PNG** + hidden JSON layer for the pathfinder
- Points distributed across 2-3 toggleable data layers
- **🎯 Balanced** preset by default, **⚡ Performance** for old mobiles

---

### 🎓 Replaying the tutorial

The welcome tutorial (27 cards) **can be replayed at any time**: open **📖 Documentation** and tap the **🎓** button in the title row, next to the language flags. Nothing to reinstall or reset.

### 🔎 Searching the documentation

This documentation is long. At the top of the 📖 modal, a **🔎 Search** field searches **the whole text**: occurrences are highlighted, **Enter** or ↓ jumps to the next one, the counter shows “i / n”, and table-of-contents entries without a match fade out. Accents do not matter: “cafe” finds “café”. The ❓ Help hub search, for its part, looks in the titles **and** the content of the sections.

## 🤖 AI Help

> Accessible via the **📚 Help / Documentation / Legend → 🤖 AI Help** group.

Downloads a `.md` file that summarizes everything the app allows you to do (this doc + a FAQ + instructions for the AI). Give it to **any conversational AI** (ChatGPT, Claude, Gemini, Perplexity, Le Chat, Copilot, etc.) — it will be able to answer all your questions about MyKTAMap with precise context.

**How to use**:

1. Click on 🤖 AI Help → **📥 Download context (.md)** button
2. The `MyKTAMap-AI-Context-YYYY-MM-DD.md` file arrives in your downloads
3. Open the AI of your choice → paste the file at the start of the conversation
4. Ask your questions normally: *"How to add a point?"*, *"My map crashes, why?"*, etc.

> 🔒 **Confidentiality**: the file contains ONLY the documentation — no personal data (none of your maps, points, sessions, etc.). You can share it without risk.

> 💰 **Note**: the AI used may be paid or have quotas depending on the service. MyKTAMap remains free — AI help is just a way to leverage an external AI.

---

## 🗺️ Legend

> Accessible via the **📚 Help / Documentation / Legend → 🗺️ Legend** group.

Displays the complete legend of icons and paths, grouped by category: **🕳️ Shafts**, **🪜 Access** (ladder shafts, stairs, cavages), **⚠️ Signage**, **🛣️ Paths** and **⬛ Zones**.

> 💡 The legend displays **all the icons the application can recognize**, even if your current map doesn't use them. It's handy for discovering the available types before adding your points.

---

## ⚙️ Settings (in map mode, per plan)

> Accessible directly via the **⚙️ Settings** button in the side bar (direct click, no sub-menu).
>
> This modal is focused **per map**. For **global settings** (language, theme, PIN, reset, zoom-scaled icons, snapping…), go through **⚙️ Configuration** on the home page — see the dedicated section above. The separation is intentional: Settings = what concerns THIS map, Configuration = what concerns the app.

### ✓ Everything is saved as you change it

There is **no Apply button anymore**: every field is saved as soon as you change it (a green flash confirms it). An **out-of-range** value turns red, a message states the bounds, and **nothing is written** — the previous value stays. Close with **Esc**, **✕** or **Close**: nothing is lost.

Every group carries its **scope** in its title — **📍 this map** or **🌍 all maps** — and **collapses** with a tap on the title (choice remembered). On a phone, only the titles show at opening, except the first group.

### 🌍 Application *(🌍 all maps)*
- **🎬 Enable presentation mode**: full screen without UI (demos / projection). **F** key on PC; exit with **F** / **Esc** or the floating ✕ button.
- **🏠 Set from the home screen** *(read-only)*: language, theme, zoom-scaled icons, anchored panels, snapping while drawing, **outings logbook**. Their value is shown here; the **🏠 Go to the home screen to change them** button leaves the map (your session is kept) and takes you to ⚙️ Configuration.

### 📐 Map: scale & geolocation *(📍 this map)*
- **Scale (px/m)** with the **🎯 Calibrate** button (see below). A zero or negative scale is refused.
- **🧭 North calibration**: useful when the TOP of the map is not true North. Angle field [0,360[ or **📐 Calibrate (2 clicks)** button (South then North on the map). Immediate effect on the tracker; the physical compass keeps pointing to true North. **↺ Reset** to go back to 0.
- **🌐 GPS georeferencing**: the state shows in the group (“not georeferenced”, “✅ points A and B”, “A, B and C”, “B estimated”) and the **🌐 Open georeferencing…** button opens its **own window**: points A / B (+ optional C) with **🔍 Search a point**, **📍 Map click** and **🧭 Estimate B**, then **💾 Save** / **🗑️ Clear** (confirmation). The calibration entered here is shared with the map's KMZ / GPX exports and pre-fills 📡 External export.

> 💡 **Map author**: to durably embed the North or a **History PDF** in the map ZIP (cross-users), use the **advanced generator**. For a History PDF loaded only in your session, use the import button of the **📖 History Mode** modal (status bar).

### 📍 Navigation & tracker *(📍 this map)*
- **Initial tracker position**: X/Y, or **🔍 Pick via a point**, or **📍 Click on the map**. As soon as the start point changes, tracking **restarts from there** (the current trail is cleared) — a message says so.
- **Step detection**: step length [0; 1.5 m], threshold [10; 30], delay [300; 3,000 ms]. Out of range, nothing is saved.
- **🧭 Smart navigation** (snapping to paths): switch (a message confirms), lateral tolerance [1; 50 m], heading weight [0; 5].

### 🎨 Display *(📍/🌍 per line)*
- **⚪ Show circles at path intersections** *(this map)* — immediate effect, saved per map.
- **🔆 Keep screen on** *(all maps)* — Wake Lock, re-acquired on return from background. Also in ⚙️ Configuration.
- **🎤 Voice commands (BETA)** *(all maps)*.
- If your browser does not support wake lock or voice (Firefox), the line stays **visible, greyed out, with the reason** — like the sensors below.

### 🚀 Performance *(📍 this map)*
- **🚀 ULTRA mode** applies 7 optimizations at once, or one by one (path decimation, animations, circles, popups, slow auto-save, viewport-only rendering, mobile zoom-out limit). Details in the Performance section above.
- On a **multi-level** map: **🏗️ Show every level at launch** (applied at the next map load).

### 🛰️ Sensor options *(🌍 all maps)*
- **🔋 Battery level** and **📳 Haptic vibration**. A sensor refused by the device (or by iOS) shows greyed out, with the reason.

### 🔒 Privacy & security *(🌍 all maps)*
- **🕵️ Incognito mode**: opens a new window that writes nothing on the device.

### 🛠️ System & maintenance *(📍 this map)*
- Display of the current map's **performance mode** — read-only here (it is chosen in ℹ️ Info, for a map without V2 tiling). Detailed logs live in ⚙️ Configuration (home) → 🛠️ Developer Mode.

### Actions
- **↺ Default values**: resets **THIS map's settings** (scale, pedometer, start point, smart navigation, North) to the map's values and puts tracking back at the start — **confirmation asked**. Home-screen settings do not move. Different from **💥 Reset everything** in ⚙️ Configuration, which purges everything.
- **Close** (or Esc, or ✕) — nothing to validate.

> ⚠️ **To enable / modify the local access code (PIN / Face ID)**, you must go through **⚙️ Configuration on the home page** — the 🔐 Local access code section is NOT in ⚙️ Settings (by design — global critical setting, not per map).

### 🎯 Calibrate the scale

If the app gives you a distance different from reality (for example 100 m displayed when you know there are 150 m on the field):

1. Measure the distance in the app with **📐**
2. Open **⚙️ → 🎯 Calibrate**
3. Enter the **displayed distance** (100) and the **real distance** (150)
4. The new scale displays in real time
5. Click **Apply** → the value is injected into the Scale field **and saved right away** (nothing left to validate)

> The longer the distance you calibrate on, the more accurate the result will be.

---

## 🏷️ Version badge in the footer (loader)

At the bottom of the loader, next to the license mention, a small **version badge** shows the current installed version of the app.

**Two visual states:**

| State | Display | Action on click |
|---|---|---|
| **You are up to date** | version number in subtle grey | "✅ Already up to date" modal — shows the installed version + release date + **release notes** (changelog) |
| **Update available** | `installed version → new version` in **flashing blue** | "🔔 Update available" modal — offers a soft update (preserves maps and sessions) or a full reset |

When a new version is available, the badge **flashes blue** to catch your attention without being visually aggressive. On click, you can choose to act immediately (soft update or full reset) or postpone it (24h snooze).

> 💡 The badge bypasses the 24h snooze: if you clicked "Later" a few minutes ago but change your mind, click the badge to relaunch the update modal.

> 💡 If you are already up to date, clicking the badge still shows the notes of the latest version — handy to re-read what changed in the update you installed.

---

## 🔐 Local access code (PIN / Face ID)

Lock the app at every startup with a 4-6 digit PIN, **Face ID** or **Touch ID** if your device supports it. 100% local — no password is sent over the Internet, no recovery possible if forgotten.

> ⚠️ **This is a usage barrier, not data encryption.** The lock prevents normal opening of the app, but a motivated attacker can bypass it with the browser's developer tools. Photos and sessions remain stored in clear in the browser. This is exactly the same security level as the existing community access code — honestly assumed.

### Enable the PIN

1. From the home page (loader) → **⚙️ Configuration** button in the top right
2. Scroll down to the **🔐 Local access code** section
3. Click **🔐 Enable access code**
4. Choose your code (4 to 6 digits) then confirm it a second time
5. If your device supports biometrics (iPhone Face ID, iPad Touch ID, Android fingerprint, Windows Hello…) a "Also enable biometrics?" prompt appears. Accepting = at the next startup you unlock at a glance or with one finger (without entering the code)

> 📝 **Note your code carefully** somewhere safe. No recovery is possible if forgotten — you would be forced to reset everything (loss of session + unsaved maps).

### At the next app startup

The lock screen appears automatically after the splash:

- **With biometrics**: the Face ID / Touch ID prompt appears immediately. You can also cancel and enter your PIN instead.
- **Without biometrics**: you enter your PIN directly via the numeric keypad. The last digit entered is visible for 0.5s then replaced by ● (iOS pattern).

### Change the PIN

⚙️ Configuration → 🔐 Local access code → **✏️ Change the code**. Validation by biometrics OR current code, then enter the new PIN twice.

### Disable the PIN

⚙️ Configuration → 🔐 Local access code → **🔓 Disable**. Confirmation by biometrics OR current code. The app no longer asks for a code at the next startup.

### Temporary lock: 5 wrong codes

After **5 wrong codes in a row**, the app locks **temporarily**: 10 min the first time, then 1 h, 6 h and 24 h with each new run of 5 errors. A countdown is shown and the keypad comes back by itself when the delay ends; a correct code resets everything. There is **no reset button** on that screen and no code recovery if forgotten — if it is really lost, **💥 Reset everything** from the home screen remains (loss of the current session and unsaved maps). The delay follows the phone's clock.

> Failed biometric attempts do **not** count toward the 5 attempts — the WebAuthn spec manages its own native lockout on the device side. You can cancel a Face ID by mistake without worrying about exhausting your tries.

---

## 🔧 Reset

In case of a problem or to force an update, use **⚙️ Configuration (home page) → 💥 Reset everything**. This action removes the offline component (Service Worker) and unregisters the Service Worker, clears the cache and reloads the application.

> ⚠️ Only perform this action with an Internet connection available. Without a network, the application will be unusable until the next full reload.

---

## 🐳 Self-host with Docker

If you want to run MyKTAMap **on your own hardware** (PC, Raspberry Pi, NAS, dedicated server) — to have it available on your local network, guarantee 100% offline operation, or just out of curiosity — a **ready-to-run Docker image** is now available.

### In one command

```bash
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

Then open **`https://localhost:8443/`** in your browser. On the first access, your browser will warn about an **untrusted certificate** (this is normal, the image generates a self-signed certificate at startup). Click **"Advanced" → "Continue to localhost"** to accept, and the app appears.

### Multi-platform

The image is built for 2 architectures:
- **amd64** (Intel/AMD desktop or server PC)
- **arm64** (Raspberry Pi 4/5 in 64-bit, Synology ARM, Apple Silicon)

Docker automatically detects the correct version on `pull`.

### Bonus: your own maps

To persist your maps across container restarts:

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -v /path/to/your/maps:/usr/share/nginx/html/data/plans \
  ghcr.io/karmakta91/myktamap:latest
```

### Bonus: your own TLS certificate

If you have a valid certificate (Let's Encrypt with a local domain, internal CA, etc.), you can mount it as a volume instead of using the self-signed one:

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -v /path/to/your/certs:/etc/nginx/certs \
  ghcr.io/karmakta91/myktamap:latest
```

The volume must contain `server.crt` + `server.key`.

### Bonus: access via local hostname

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -e MKM_HOSTNAME=myktamap.local \
  ghcr.io/karmakta91/myktamap:latest
```

The self-signed certificate will include `myktamap.local` in the allowed names. Handy if you have a local DNS (Pi-hole, AdGuard Home) resolving that name to your host.

### Updates

To upgrade to a new version:

```bash
docker pull ghcr.io/karmakta91/myktamap:latest
docker stop myktamap && docker rm myktamap
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

You can also **pin** a specific version instead of `latest`:
- `ghcr.io/karmakta91/myktamap:v1.36.0` — this exact version, immutable
- `ghcr.io/karmakta91/myktamap:1.36` — latest patch in 1.36.x
- `ghcr.io/karmakta91/myktamap:1` — latest minor in 1.x

### Limits

- **Service Worker + self-signed certificate**: some browsers (Chromium, Safari) refuse to install the Service Worker if the certificate isn't trusted. If the app works but seems "not to cache" for offline mode, accept the security warning first, then reload.
- **Port conflict**: if you already have another service on `8443` on the host, change the mapping: `-p 9443:8443` for example.
- **No automatic updates**: you decide when to `docker pull`. For auto-update, check [Watchtower](https://github.com/containrrr/watchtower).

> 🔒 **No data sent elsewhere**. The image bundles the vanilla app exactly as the official version, but served from your own hardware. It's even slightly more offline-friendly than production (no occasional fetch to `gstatic.com` for the connectivity ping — the network audit stays active if you want to verify).

> 📖 **Never used Docker?** A dedicated step-by-step guide exists: **[`docs/applications/DOCKER_INSTALL.en.md`](DOCKER_INSTALL.en.md)** — Docker Desktop install (Windows/Mac/Linux), daemon startup, troubleshooting common errors (self-signed cert, port conflicts, WSL 2), Docker-free alternatives.

> 📚 **Technical details**: see `docs/architecture/docker-selfhost.md` in the GitHub repo.

---

## 🆘 Troubleshooting

**The map does not load**
Check that `plan-config.json` is at the root of your ZIP archive, and that all referenced files are present.

**The map image is blurry**
Depending on the chosen preset, the working resolution is reduced (`Performance` more than `Balanced`, which is more than `Quality`). If your device has enough memory, switch to **🌟 Quality** at the next loading for a sharper image.

**The tracker drifts too fast**
Recalibrate your position frequently. Adjust the scale and step size in the settings.

**The application crashes on Mobile with a large JPEG**
Choose **⚡ Performance** in the Performance mode selector before loading the map.

**A mode stays active without intent**
Press the active button (in green) again to deactivate it.

**The application does not update after a new version**
Use **⚙️ Configuration (home page) → 🔄 Force the update** (soft update, keeps all your data). If insufficient: **⚙️ Configuration → 💥 Reset everything** (full purge, last resort). The soft update is fast thanks to a background pre-download.

**📡 App stuck after a soft update**
If after an update the app remains stuck (loader without CSS, blank page, badly loaded assets), the most frequent cause is a **GitHub Pages edge CDN serving corrupted content** (bad MIME, truncated asset) for the current geographic area. First reflex before any reset: **disable your VPN if active and change networks** (4G ↔ Wi-Fi ↔ another Wi-Fi). Just switching IP/edge CDN is often enough to unblock.

**🆘 Emergency reset without touching the data**
If the app is completely stuck even after changing networks, two options that preserve your maps / sessions / photos / prefs:

1. **URL kill switch**: open in a **private tab** in Chrome/Safari (NOT the PWA):
   ```
   https://myktamap.fr/?killsw=1
   ```
   → unregisters the Service Worker + clears all HTTP/PWA caches → success message → normal reload.

2. **Standalone reset page**: if the URL is not enough (HTML cache stuck):
   ```
   https://myktamap.fr/killsw.html
   ```
   → standalone page 100% inline (CSS/JS), zero dependency, works even if the rest of the app is broken. Shows 3 steps (SW unregistered, caches purged, ready to reload) + "🚀 Reload the app" button.

> ⚠️ These two tools **do NOT delete ANY user data** (saved maps, per-map sessions, POI photos, Rescue Mode photos, backups, preferences). They only purge the cache of the app files (HTML / CSS / JS / icons). When in doubt, **📤 Export your profile** BEFORE to have a backup.

**Unresolved problem**
Open **⚙️ → 🐛 Logs**, copy the journals and pass them on to the technical team.

---

## 📖 The story

> *A map has never replaced going out. It just helps you not get lost.*

### Where it comes from

MyKTAMap was born from a simple need: having, **in your pocket**, a cataphile map that is **reliable, offline, and doesn't leak**. Not an app store that asks for access to your contacts to display a map. Not a website that tracks you the moment you click. Not a cloud that decides tomorrow to send you a newsletter or resell your traces.

Just a `.zip` file containing the map, opened in a browser tab, that works **without a network**, and that gives you **full control** over what you do with it.

### Who it's for

For those who go down. Parisian cataphiles, amateur cavers, prudent urban explorers, rescuers trained for underground environments, heritage researchers — in short, anyone with a **legitimate and respectful** use of these places who wants a tool that doesn't put anyone in danger (neither people nor places).

The app has **no ambition to replace** old annotated paper maps, outings guided by elders, oral transmission, collective memory. It comes **as a complement**, like a digital layer superimposed on this knowledge — not a substitute.

### The philosophy

- 🌐 **100% offline by default** — the app works without a network once the map is loaded. You can launch it on a plane, in the metro, or 30 m underground.
- 🔒 **Zero telemetry** — no third-party service is called to track you. The only possible external fetch is the update of the app code (and you can disable it). The auditor can verify in `🔒 Network audit`.
- 📦 **Data ownership** — your annotations, your photos, your measurements are stored **locally**, in the browser. No one else has access to them. You can export everything at any time (`📤 Export`) and erase everything in 2 clicks (`💥 Reset everything`).
- 🤝 **Open code** — the license is `CC BY-NC-SA 4.0`. You can read the code, audit it. No black box, no marketing.
- ⚖️ **Discretion = respect** — a map shared carelessly is a weakened place. The app contains no maps by default; it is up to each user to load their own, and **not to distribute them** beyond the circle of trust.

### What the app is not

- ❌ **Not an underground GPS** — native geolocation doesn't work under rock. The app's "tracker" is a **pedometer + heading** that drifts quickly; you need to recalibrate regularly.
- ❌ **Not a safety guarantee** — the map gives the path, not the oxygen. You remain the sole judge of the risks (collapses, water, gas, fatigue).
- ❌ **Not a directory** — the app does not reference places. It displays what you give it, period.
- ❌ **Not a social network** — no account, no profile, no one-click sharing. You choose who you send your `.zip` to, and how.

> If you're looking for a turnkey consumer app with reviews and stars, this isn't it. If you're looking for a tool that keeps you in control of your data and your anonymity underground, **welcome**.

---

## 🙏 Acknowledgements

MyKTAMap would not exist without the work, knowledge and patience of many people. This project is carried by **one person** on the development side (KARMA), but it relies on **communities**, **open-source tools**, and **people** who took the time to pass things on.

### To the cataphile community

To the elders who surveyed the galleries with a pencil, map in hand, generation after generation. To the enthusiasts who compiled, digitized, cross-checked, verified. To those who pass it on — on outings, during initiations, whispering to a beginner "no, this way, not that way". MyKTAMap is just **one more tool** in this long chain. Without your maps, without your stories, without your vigilance, this app would have nothing to display.

### To the beta-testers in the field

To those who agreed to go down with an unstable `1.x.y-beta` version, to come back up with screenshots of bugs, to report UX friction, to propose features impossible to imagine from a desk. To the few comrades who tested every release underground, in the dark, in the cold, and who took the trouble to tell what was wrong. Your feedback shaped every hotfix — without you, the app would have remained a comfortable prototype from a couch.

### To the open-source tools

MyKTAMap relies entirely on **open-source bricks**. Without these projects, the app simply would not exist:

- 🍃 **[Leaflet](https://leafletjs.com/)** *(BSD 2-Clause)* — interactive map engine. Heart of the map display. Thanks to **Vladimir Agafonkin** and the many contributors of the project.
- 🔄 **[Leaflet.ImageOverlay.Rotated](https://github.com/IvanSanchez/Leaflet.ImageOverlay.Rotated)** *(BSD 2-Clause, vendored)* — plugin that projects an image as a parallelogram via 3 corners (CSS matrix transform). Used for the **2-anchor** calibration of image layers and for the projection of MyKTAMap plans **onto the OSM View**. Thanks to **Iván Sánchez Ortega** for this elegant plugin.
- 📦 **[JSZip](https://stuk.github.io/jszip/)** *(MIT/GPL dual)* — reading and writing of `.zip` archives on the browser side (maps, sessions, exports, partial extraction for the HOME mini-map). Thanks to **Stuart Knightley** and contributors.
- 📤 **[jsPDF](https://github.com/parallax/jsPDF)** *(MIT)* — generation of printable PDFs (A0 → A4, portrait/landscape, miniature page Rescue Mode, embed Story Mode).
- 📸 **[html2canvas](https://html2canvas.hertzen.com/)** *(MIT, vendored)* — DOM-to-image capture (canvas → PNG). Used to embed the **Leaflet OSM map** in the **« Firefighters Briefing »** PDFs of the Rescue Mode: the full graphic stack (tiles + overlays + projected plan) is captured as a frozen image and embedded in the PDF handed to external rescue teams. Thanks to **Niklas von Hertzen** and contributors.
- 🌍 **[OpenStreetMap](https://www.openstreetmap.org/) & its contributors** — licensed under **[ODbL](https://opendatacommons.org/licenses/odbl/)** for data and **[CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)** for cartography. Worldwide map data displayed in the **OSM View** (modal + HOME widget) **only when you enable it via the dedicated opt-in**. The app shows the `© OpenStreetMap contributors` attribution in the corner of every OSM map, **as the ODbL license requires**. Tile hosting: **[OSM Foundation](https://wiki.osmfoundation.org/wiki/Privacy_Policy)** (non-commercial foundation, public logs policy, no advertising tracking). Without this monumental common good — built since 2004 by **thousands of volunteers** mapping the world street by street — the OSM View would not exist.
- 🧭 **Dijkstra's algorithm** (1959) — shortest path calculation for assisted itineraries. Edsger W. Dijkstra (1930-2002): thanks for this 60+ year old idea that still underpins Google Maps, OpenStreetMap routing, and every GPS in the world.
- 🌐 **[GPX 1.1 standard](https://www.topografix.com/gpx.asp)** — exchange format with TopoDroid, OsmAnd, Strava, Garmin and the outdoor ecosystem.
- 🛡️ **[Web standards](https://developer.mozilla.org/)** — Service Worker, IndexedDB, WebAuthn, FileSystemAccess API, Geolocation API. Maintained by thousands of people we will never meet and to whom we owe enormously.

> 📜 **License compliance**: vendored files (`lib/leaflet/`, `lib/leaflet-imageoverlay-rotated.js`, `lib/jszip.min.js`, `lib/jspdf.umd.min.js`, `lib/html2canvas.min.js`) keep their original license header. For network details (when each resource is contacted), see the **[Network Audit](./NETWORK_AUDIT.md)** (also accessible from the Audit modal in the app).

### To the PWA ecosystem

To the browsers (Chromium, Firefox, Safari, their mobile forks) that implement modern web standards and allow a simple page to function like a native app without depending on a store.

### To the development assistant

A good part of the code in this version was co-written with **Claude (Anthropic)**, an AI assistant that accompanied development over dozens of sessions. It's a tool just like Leaflet or JSZip — useful, honestly documented, and one that does not replace the vision or the final decisions (always on the human side).

### To you reading this guide

For taking 10 minutes to read instead of clicking blindly. This is exactly the state of mind these places require — **taking the time, understanding before acting, respecting what we don't yet master**.

> If you want to contribute — a bug report, a suggestion, a hand with the docs — go through the repo issue tracker or the usual community channels.

---

**Library & algorithm credits** — 🍃 Leaflet (interactive mapping) · 🔄 Leaflet.ImageOverlay.Rotated (2-anchor fitting + OSM View projection) · 📦 JSZip (reading/writing ZIP archives) · 📤 jsPDF (printable PDF export) · 📸 html2canvas (DOM capture for the firefighters' Briefing PDF) · 🌍 OpenStreetMap & contributors (ODbL data, opt-in OSM View) · 🧭 Dijkstra (shortest path for itineraries) · 🌐 GPX 1.1 (outdoor exchange).

*MyKTAMap — User Guide*
*These places are fragile. Discretion is a form of respect.*
