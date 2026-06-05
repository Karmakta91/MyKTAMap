# 📗 MyKTAMap — User Guide

> This guide is intended for application users. It explains how to use each function, how to prepare your phone for a field trip, and outlines the essential rules regarding data discretion.

---

## 🔴 Important warnings

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

---

### 🌐 Migration to `myktamap.fr`

The application is changing its official domain. Starting **July 15, 2026**, the new address will be **`myktamap.fr`** (instead of the current `myktamap.fr`).

**How are you informed?**

A **permanent info alert** (blue 🚨 badge) is broadcast via the public alerts system. You can check it whenever you want by clicking the 🚨 badge in the loader header. The alert displays the cutoff date + the complete checklist of data to export before migration.

**What should I do to migrate my data?**

Your data (list of maps, sessions, preferences) is **linked to the domain** (web security rule — isolated origins). It will NOT follow automatically. You must act before the cutoff:

1. **📚 Export your map list**: in the loader, **📚 My maps** section → **💾** button → download a `.config` file containing all your saved maps (metadata + references). On the new domain, you will import this `.config` via the **📂** button at the same place.
2. **💾 Export your sessions**: on each open map, use **💾 Save session** (Full or Advanced) → download a `.json` per session (annotations, paths, zones, custom points in progress).
3. **📦 Keep your map ZIPs** that you had imported. Local blobs stored in the browser are not exportable — you will need to re-import the ZIPs manually on the new domain via the usual drag-and-drop.
4. **On July 15, 2026**: go to `myktamap.fr` → import the map list `.config` + re-import the ZIPs + import the session `.json` files on each corresponding map.
5. **📱 If you had installed the app on your home screen** (PWA): you will need to manually delete the old icon then reinstall from `myktamap.fr` (since the origins are different, the installed icon points to the old domain).

**During the transition (until July 15, 2026)**: both domains will work in parallel. You can continue to use this site as before, and migrate at your own pace.

**After July 15, 2026**: the old domain will display a transition page that will automatically redirect you to `myktamap.fr`. The installed PWA will automatically deactivate at its next update check (≤24h after the cutoff).

---

<!-- v1.34.16+ : sprint anti-crash iPhone what's new section -->
## 🆕 What's new (sprint v1.34.x — June 2026)

This sprint focuses on **iPhone PWA stability** (large tiled maps in caves) and fixes a few small annoyances. Nothing new to learn on your side — it's all silent under the hood.

- **🍎 Stronger iPhone stability** — crashes after a long session on a large tiled map are heavily reduced. The app now actively releases the image data of tiles you no longer look at, drops POI photos when you switch plans, and properly cleans up its image layers on exit. If you used the "close/reopen the PWA every 20 min" trick to avoid crashes, you can stop.
- **🚀 Smoother boot on large maps** — when loading a tiled map, only the tiles needed for the current view are extracted from the archive (the others stay compressed in standby). The splash leaves quicker and RAM holds up better, especially on iPhone.
- **🗂️ Image layers filter fix** — bug fixed: if you unchecked an image layer (legend, collisions, etc.) then switched plans or reloaded, the layer used to ghost back in. Your choice is now properly remembered. The **🔄 Show all** button in the Filters modal also correctly re-checks image layers, not just data layers.
- **🔄 More reliable soft update** — the « Force update → app reloads itself » flow now works consistently (it used to occasionally stall halfway through and force you to refresh by hand). The new version activates automatically within 5 seconds.
- **🐛 Cleaner console errors** — a few stray error messages (Chrome extensions, fonts) that showed up for no good reason in DevTools are now silent. No functional change, just easier to read if you open the DevTools.
- **🔊 Voice reading of notes (NEW v1.34.18)** — a **🔊** button now appears next to each note in POI popups. One tap and the app reads the note aloud using your device's native voice (iPhone, Android, desktop). Handy underground when your hands/eyes are busy (helmet, climbing). Tap 🔊 or ⏹️ again to stop. Language follows your browser. **100% offline** — no permission asked, no data sent to Google/Apple, voice synthesis uses voices already installed on your device. Companion to the 🎤 "Go to $POI" voice command from v1.34.0 (audio in + audio out = full hands-free / eyes-free loop).
<!-- v1.34.19+ : Story Mode (free note + PDF) -->
- **📖 Story Mode (NEW v1.34.19+)** — a new **📖** button now appears in the top bar (right next to the battery 🔋, on its left). It opens a small two-tab modal, scoped to each plan:
  - **📝 Free note** — a text notepad auto-saved as you type. Perfect for the site's story, anecdotes, your exploration to-do, things to double-check. One note per plan, kept across reloads and app restarts.
  - **📚 Story** — if the plan author embedded a PDF (history, paper map, brochure, legend), it shows up directly in the tab. Otherwise you can **📥 import your own PDF** from your device (1 PDF per plan, replaceable / removable). An imported PDF survives reloads. On iPhone, an **↗️ Open in a tab** button kicks it into native fullscreen if the inline view isn't available.
  - **100% offline** — the note and the PDF stay on your device. Nothing is sent to the internet.

> ℹ️ Technical details about the « RAM Pack » operation: see the `README.md` changelog in the repo + `NETWORK_AUDIT.md`. On your side, nothing to do — reload the app, that's it.

---

## 🚀 Getting started

### 🗝️ Restricted access — Community code

The application is protected by a **single shared password** for all authorized users. The code will be communicated to you by the author (forum, direct message, etc.).

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

### 👤 User profile

A **profile banner** is displayed at the top of the home screen, just below the header. It groups your visual identity and configurable statistics on your use of the app.

**What you see on the banner**:

- **Avatar**: personal photo (square, ~64 px) OR colored auto-generated initial if no photo. The color of the initial is chosen deterministically (via djb2 hash of the nickname) from a palette of 10 colors of the chart — your avatar therefore remains visually stable from one session to the next as long as you do not change your nickname.
- **Nickname**: your alias (editable). Default "Cataphile" on first launch.
- **Compact stats** *(visible as soon as the screen is ≥ 380 px wide)* — now **configurable** from the Profile modal (see below). By default:
  - ⏱️ **Session time**: time elapsed since the app started in this session
  - 💾 **Save**: actual size of MyKTAMap data stored locally (see below)

> 💡 **Light theme chart**: in light mode, the profile banner background aligns with the "My maps" cards for clean visual integration.

**Edit your profile**:

Click on the profile banner → **👤 My profile** modal:

- **✏️ Nickname**: type whatever you want (letters / numbers / space). Used only to personalize local display.
- **📷 Photo**: choose an image from your gallery. The app **automatically compresses it** (512 px max long side, JPEG quality 88%) before IndexedDB storage to avoid saturating your browser quota.
- **🗑️ Reset profile**: reset button (chart confirmation modal — no native system `confirm()`). Empties nickname + photo + counters.

#### 📊 Stats grid

The Profile modal displays **6 global stats cells**:

| Cell | Description |
|---|---|
| 🗂️ **N maps** | Number of maps in your registry (server + local) |
| 💾 **N sessions** | Total number of saved sessions (per-map slots) |
| ⭐ **N favorites** | Cumulative number of points marked as favorites, across all maps |
| 📦 **N snapshots** | Number of session backup snapshots in IndexedDB (max 10 FIFO) |
| 📸 **N POI photos** | Number of photos attached to points + total size |
| 💾 **N MB save** | **Actual size of MyKTAMap data** (localStorage with MyKTAMap prefix + 6 known IndexedDB stores). Excluding volatile PWA Cache (which is not user data). |

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

- **MyKTAMap-targeted calculation**: we only sum up the localStorage entries prefixed `myktamap_*` + the 6 IndexedDB stores known to the app (handles, blobs, backups, photos, etc.). The volatile PWA Cache (which contains the app's JS/CSS code and is NOT user data) is **excluded** from the calculation.
- **30s cache**: the calculation is cumulated then cached for 30 seconds to avoid re-querying IndexedDB in a loop when you quickly open/close modals.
- **Tooltip**: "Size of MyKTAMap data (LS + IDB)" + clarification "excluding PWA Cache".

Result: the value is **stable, predictable, and truly reflects what you have mapped**.

**Profile import / export**:

Your profile is included in the **Advanced Export** of sessions (🎨 Advanced tab → "User identity" section). Useful for transferring your visual identity to another device. When importing a profile:

- A modal toast suggests a **reload** of the page so that the avatar and nickname are correctly updated everywhere in the UI (header, sidebar, etc.)

> 🔒 **100% local**: your nickname and photo remain in your browser (IndexedDB). Nothing is sent to a server. The profile export is explicit and controlled by you.

#### 💼 Pro edition — import a license

If the author has provided you with a **`Licence-pro.json`** file (by mail, private channel, etc.) following a professional license request, you can **import it directly** into your browser from the profile modal to activate pro edition **on this device only**.

**Dedicated section in the My Profile modal**:

- **If you are in community mode** (default state): a **📂 Import a pro license** button appears. On click, `.json` file picker → you select your file → immediate validation → confirmation toast. Pro mode is activated: the loader footer switches (✓ Pro license active), the splash displays "Professional edition", the gate screens remove the "Pro license" link (now redundant).
- **If a local license is active**: a **🗑️ Remove local license** button allows you to return to community mode. The license remains available in the original file if you want to re-import it later.
- **If a server license is active** (instance deployed by an admin with `Licence-pro.json` at the server root): ✓ badge only, no button — it's the server administrator who decides.

**File format**: minimum JSON `{"instance":"pro","license_hash":"MKTM-LIC-..."}`. If the hash is missing or malformed (strict regex `MKTM-LIC-` + 32 hexadecimal characters), the file is refused with an error message.

**🆕 Access route on first load**: if you install MyKTAMap for the first time on a new device (= **community code** entry screen at boot), under the code form you will now find a second block separated by "or" with a **📂 Import my pro license** button. On click, `.json` file picker → you select your file → if OK the app enters **directly into pro mode** (no need to enter the community code). Useful for pro users discovering the app: no need to ask a third party for the community code, the pro license is a legitimate access channel in itself.

> 🔒 **100% local**: the license file is read by the browser via `FileReader` then persisted in `localStorage`. It is **never sent to a server**, never transmitted. No network connection is added.

> ⚖️ **Legal value**: the `MKTM-LIC-...` hash that appears in the file is **nominative** — linked to a specific contract between the author and the license holder. **Its reproduction or sharing with an unauthorized third party constitutes a contractual breach** (the author can enforce their rights). The browser-side mechanism remains cosmetic: it does not cryptographically verify the hash, the contract signature is what matters legally.

### 📚 Managing your map list

The application remembers all the maps you load, whether they come from the server or your local disk.

**On the home screen:**

| Symbol | Meaning |
|---|---|
| 🌐 | Server map (subfolder of `data/`) |
| 💾 | Local ZIP map |
| ✅ | Local map **stored in the app** (instant reload, works offline) |
| 🔐 | Local map with **permanent access granted** (Chrome/Edge desktop) |
| 📁 | Local map without persistence — re-selection required at load |

**Available actions** on each row (3 buttons):

- **ℹ️** — opens a **Detailed info** window on this archive (internal id, name, version, author, type, source file, size, persistence, V1/V2/multi-level mode, performance preset, dates added and opened). Useful for checking what the app knows about the map without loading it.
- **▶️** — loads the map
- **✕** — removes the map from the list (does not delete the ZIP file on your disk, just the entry in the list)

**Buttons at the top of the list:**

- **💾 Export my list** — downloads a `myktamap_plans_YYYYMMDD.config` file that you can save or share.
- **📂 Load a list** — imports a previously exported list file. Three choices: Replace, Merge, or Cancel.

**Display filter**:

- **🌐 Show server maps** — check/uncheck this toggle above the list to hide automatically discovered server maps (test1, test2, demos…) and only see your personal maps. **Preserved** between sessions (localStorage). Unchecking does not delete anything — re-checking → the maps reappear intact.

> 💡 **Tip** — If you change PC or phone, export your list on the old device then import it on the new one to find all your maps in one click. Note: file access permissions are not portable (you will have to re-select local ZIPs the first time on the new device). When re-selecting, if you provide a ZIP in a different mode (e.g.: you had this map in V2 but the ZIP is V1), a warning message will clearly notify you before continuing.

### 🔐 Avoid re-selecting the ZIP at each opening

Depending on your platform, two persistence options appear under the import area:

#### On Chrome / Edge (PC)

Click on **🔐 Grant permanent access to the file**. The browser keeps a reference to your ZIP. On subsequent openings of the map from your list, reloading is done in **0 or 1 click** (Chrome may ask for quick confirmation again after a browser restart).

#### On mobile, Firefox, Safari

The **💾 Store this map in the app** option is **checked by default**. The ZIP is copied into the browser's local storage area. On subsequent openings:

- **0 clicks**, the map loads directly
- Works **offline** (the ZIP is in the browser, no need to find the file)
- Recommended on **mobile**

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

1. **🖼️ Image tiling (per map)** — 5-preset segmented control (see detail below), which chooses how the main image is split in memory at load. Stored **per map** (one map in Performance, another in Quality, etc.).

2. **🚀 Performance ULTRA mode (paths / markers)** — 7 optimization toggles that do **NOT** touch the image (already covered by Tiling above) but everything else (polylines, popups, intersections, auto-save, viewport culling, mobile zoom-out limit). **Global** preference, kept between sessions. See "🚀 Optimize your map" section below for details.

3. **🛠️ Debug** — **🐛 Detailed logs** toggle (verbose mode) **+ 📋 Show logs button** which directly opens the modal buffer of captured logs. Useful for consulting logs without having to load a map first (e.g.: if you are trying to diagnose a blocking bug at load).

4. **🔒 Privacy & Audit** — section dedicated to transparency: live network journal, "What does the app do on the network?" doc, and "Strict offline mode" toggle. See dedicated section below.

5. **🎨 Display** — interface toggles:
   - **⚪ Show circles at path intersections** — displays a colored solid circle at the crossing of 2 paths. Uncheck to visually clear very dense maps. Immediate effect.
   - **🔆 Keep screen on** — prevents your screen from auto-sleeping while MyKTAMap is open (Wake Lock API). Useful on cataphile outings to avoid having to touch the phone every 30 sec. Auto re-acquire on return from background (visibilitychange). Toggle automatically hidden on browsers that don't support the API (Firefox notably). The same toggle is also accessible in **⚙️ Settings** in map mode (see dedicated section).

6. **📚 Server maps** — **"🚫 Do not load server maps at startup"** checkbox:
   - **Disables auto-discovery** of the `data/index.json` file at app boot — the app will no longer query the server to list demo maps or public hosted maps.
   - **Hides the "🌐 Show server maps" toggle** of the home (becomes useless since there is nothing to show anymore).
   - **Excludes `type === "server"` maps from aggregated stats** in the Profile modal → no longer skews the "Visited maps" count with maps you never use.
   - **Reload required** for full effect (auto-discovery happens at splash, not during session).
   - **Default OFF** (absolute backward compatibility — the app continues to auto-discover server maps as long as you have not explicitly checked this box).

   > 💡 **Use case**: you use MyKTAMap only with your own local maps and you don't want to see the server demo/test maps that pollute your list. Check this box → reload → your 📚 My maps list only contains YOUR maps.

7. **🔐 Local access code (PIN / Face ID)** — locks the app at each startup with a 4-6 digit code + Face ID / Touch ID if the device supports it. 100% local (never sent over the Internet). 5 failed attempts = permanent lockout. No recovery if forgotten. See dedicated section **🔐 Local access code (PIN / Face ID)** below for full details (activation, modification, deactivation, lockout).

8. **🔄 Update — Force soft update** — re-downloads the latest version of the code (purges the PWA cache, keeps your data and your maps). Useful if you suspect that your app remains on an old version after a release. **Never** touches your maps, your active session, your community code or your local PIN. **Mandatory confirmation before triggering** (blue modal detailing what is preserved + need for active Internet connection).

9. **💥 Reset everything (full reset)** — total purge (cache + localStorage + IndexedDB + maps). Resets the community access code **AND** the local PIN if configured. **Double confirmation required.** Irreversible action.

**Organization**: **everything is grouped in a single ⚙️ Configuration modal**, accessible from the loader header. The 🏗️ Generate a map button remains directly visible in the home (not in the Configuration modal) because it is a creation action, not a setting.

### 🎚️ Performance mode — 5 presets

The **Performance mode** block in the loader lets you choose how to display your map, with 5 modes presented as a selector (in the style of DLSS in video games):

| Button | For which case? |
|---|---|
| 💤 **Disabled** | **No tiling at all.** Image displayed raw (native quality, but ⚠️ may crash on mobile for very large maps). Use only if you know your device can handle it. |
| 🔄 **Auto** *(default)* | The app decides based on file size — activated if the map exceeds 60 MB. **Recommended for most cases.** |
| 🌟 **Quality** | Very detailed maps to zoom deeply into. **Recommended on desktop PC** with enough RAM. Sharper image. |
| 🎯 **Balanced** | Compromise between sharpness and smoothness. Reproduces the historical "Performance" mode of the app. |
| ⚡ **Performance** | **Low mobile**, very heavy maps, field emergency. Slightly blurrier image but loads much faster. |

Click on a button before loading — the description under the selector changes to explain what it does.

**The setting is stored for each map**: if you load a map in "Performance", the next time you open it via 📚 My maps, it will open directly in "Performance". To change the setting of an already-stored map, re-import its ZIP by selecting another mode in the selector.

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
  - **In landscape mobile**, sub-menus unfold **horizontally toward the inside of the screen** (more ergonomic on tablet/smartphone in landscape). Zoom +/- remains vertical (universal convention).
- **🧭 Orientation compass**:
  - In portrait: **bottom-left** above the footer
  - In landscape: **bottom-centered** (so as not to hide the side icons)
- **≡ Reduction buttons** at the top of each sidebar (▾ deployed, ▸/◂ collapsed) — saves space without stopping active modes
- **"Session details" modal**: a click on the header counters opens an overview:
  - All your points (with tag, coordinates, level if multi-level)
  - Paths grouped by type (Main/Secondary/Path/Junction) with counter + total distance per type
  - Zones grouped by type
  - Active measurements (📐 simple measurement, 🗺️ route with waypoints, 🧭 tracker)
- **Redesigned "Change map" modal**: highlight card of current map with `● ACTIVE` badge, list of recent maps with hover animation, large blue "📚 View all my maps" button at the bottom
- **Map generator removed from map mode**: remains accessible **only from the home** via 🏗️ Generate a map (creation outside of map mode)

### 💾 Automatic saving of your session

Your **current annotations** (added points, paths, zones, measurements) are automatically saved in the background every ~1.5 seconds. So if you close the application and reopen it via **▶️ Resume**, your work is restored.

**How it works:**
- On each modification, your session is saved in the browser (a single "slot" — the current session replaces the previous one)
- On next launch, if you click on **▶️ Resume [map name]**, your session is restored — a **centered window** confirms with the details (*"3 points · 1 path · 2 zones"*)
- The window offers you two actions: **🗑️ Clear session** (start this map with a blank session) or **✓ Continue** (keep the restored session). Clicking outside or pressing Escape = Continue.

**Important:**
- If you **load another map** between two openings, the previous session is lost (single slot, last active session "wins")
- The **tracker path** is not restored (the tracker being experimental, reviving a frozen trail would be misleading)
- The **💥 Reset everything** also erases your saved session
- To keep an important session beyond auto-save, use **⬆️ Export JSON session** (explicit save that you can re-import later)
Sur la planète, on est en équipe de souterrains.

---

# 🐛 Detailed logs (debug mode)

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

The application uses a **Service Worker** that automatically caches all necessary files (interface, images, data). On first load with an Internet connection, everything is saved locally.

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
- **📁 Re-select the ZIP** (local maps) — opens your file explorer to find the ZIP again. If you have enabled "Remember this map in the app" or "Permanent access", persistence will be **automatically restored** after the new selection
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
- How to check yourself via your browser's DevTools (F12 → Network)
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
🌐 48.85661° N, 2.35222° E  📋
- Displayed just after the description (new line).
- **5-digit decimal** format (~1 m precision).
- **📋** button: copies the coordinates to the clipboard (`lat, lng` format ready to paste into Google Maps, OsmAnd, location SMS, etc.).
- Visible for **session points AND data layer points** (wells, vehicles, etc.).
- **Not displayed** for paths / zones / structures (these are multi-point geometries, not a single coordinate).
- If the map **is not calibrated**, the line does not appear (absolute backward compatibility).

> 💡 **Typical use case**: on a cataphile outing, you find an unlisted well, you add it via ✏️, you click on it → you can instantly copy its GPS coordinates to send them to a teammate by SMS or to mark them later in Google Earth.

---

## 🧭 Interface overview

All tools are accessible from the **right side bar**, organized into 11 groups:

| Group | Icon | What it's for |
|---|---|---|
| **Help / Docs / Legend** | 📚 | Help, documentation, icon legend |
| **Settings** | ⚙️ | Settings, scale calibration, debug *(direct click)* |
| **Search** | 🔍 | Quickly find a point on the map *(direct click)* |
| **Load / Import** | ⬇️ | Import a session, edit a JSON file, change map |
| **Create / Modify map** | 🏗️ | Map generator *(direct click)* |
| **Save** | ⬆️ | Save your session (3 modes), export the map as an image |
| **Tracker** | 🧭 | Start / stop tracking, recalibrate your position |
| **Measure** | 📐 | Measure a distance, erase |
| **Point editing** | ✏️ | Add your own points, erase |
| **Paths** | 🛣️ | Draw main, secondary roads, paths, **calculate total distance** |

> 💡 **"My annotations" layer** in the ≡ Filters modal (top right of the map, three horizontal bars button — custom MyKTAMap unified modal): this layer groups your added points and zones drawn during the session. Unchecking the box hides them, rechecking displays them again. **The route, measurement, tracker** are not affected (own lifecycle).
| **Zones** | ⬛ | Draw backfill, collapse or water zones |

**How it works:**

- **Only one group open at a time** — pressing another group closes the previous one
- **When a mode is active** (measure, add, road, zone, recalibrate), the group **remains open** so you can quickly access the associated actions (delete a point, etc.). The main icon changes to reflect the current mode
- **Touching outside** the open group closes it automatically
- **On mobile in landscape**, the bar becomes vertically scrollable if it overflows the screen

### 🔄 Quickly change map via the title

The **current map title** displayed at the top of the screen is **clickable**: it opens a small drop-down menu with:

- **📚 RECENT MAPS** — the last 3 maps you opened (excluding the current map)
- **📚 All my maps…** — to return to the home screen with the full list

When clicking on a map in the menu:

- If your **session is empty** (no annotation, road, zone or measurement) → the map loads **directly** without confirmation
- If you have **modifications in progress** → a window warns you with the **exact list** of what you will lose:
  ```
  ⚠️ Session in progress
  You have unsaved changes:
     • 5 points added
     • 2 paths
     • 1 zone
  Loading « Test Map 1 » will cause you to lose these changes.
  [Cancel]   [Load anyway]
  ```

> 💡 This function allows you to switch between your favorite maps in **2 clicks** without going back to the home screen. To close the menu without doing anything: click elsewhere or press **Esc**.

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
## CHAPITRE 4 : SAVED INTERFACE TRACKER

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
  │ icn │ PA1  Ventilation Shaft
  │     │   Shaft · ventilation · open · x:4843 y:2002
  └─────┘
  ...

🛣️ PATHS (3)
  ┌─────┐
  │ 🛣️  │ Main Path session #1
  │     │   Session · Main · Lvl 0 · 8 pts
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

### 🧭 Tracker side panel

The **🧭 Tracker** button opens a **side panel (flyout)** adjacent to the main button. It's readable, visually stable, and all sub-actions are accessible without scrolling, even on mobile.

**Sub-actions available in the flyout** (fixed order):

| Icon | Action |
|---|---|
| **▶️** / **⏹️** | Play / Stop tracking (the icon toggles dynamically based on state) |
| **🧭** | Compass (compass rose widget) |
| **📍** | Position recalibration |
| **🗺️** | Calculate a route |
| **🎬** | Tracker session replay |
| **🔥** | Heatmap — see dedicated section |
| **⛑️** | I'm lost — **SOLID RED button** (danger signal) |
| **🚨** | XL Emergency Mode — **SOLID RED button** (danger signal) |

> 🚨 **The 2 emergency modes are deliberately placed at the END of the panel with a bright red background** to make them instantly visually identifiable. In a stressful situation, you know where to look.

### ▶️ Start tracking

Press **▶️** to start.

**On the first start of the session**, a warning popup appears to remind you that the tracker is an **experimental module**: it's used to validate the calibration / step detection / heading formula, **not to actually locate yourself**. Click **"Understood — Start"** to continue (the popup won't reappear before the next page reload). On Mobile, the iOS / Android permission request for sensors appears next — accept it.

An icon appears on the map at your starting position. It moves as you walk, and a path records the route you've traveled.

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

The **🔥 Heatmap** button in the **🧭 Tracker** flyout opens a modal that draws a **density map** over your map. Handy for visualizing at a glance the **most frequented areas** (key passages) vs those rarely used.

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

**How it works:**

- **Live update**: each toggle (checked/unchecked) applies the filter **immediately** on the map (200 ms anti-flicker debounce for dense maps).
5. **💾 Save** keeps the route in the session, **❌ Clear** removes it.

**Distance label**: while a route is active, a small label **🗺️ Route: XX m · ⏱️ time · 🚶 speed mode** is displayed at the bottom left of the map, just above the classic distance measurement label.

**🏃 Estimated walking speed** (segmented control in the modal) — 4 presets to adjust the travel time estimate:

| Mode | Speed | When to use |
|---|---|---|
| 🍺 **Drunk** | 2 km/h | Very slow, hesitant, rough terrain, end of evening |
| 🐌 **Slow** | 3 km/h | Cautious, tight passages, exploration, gear hauling |
| 🚶 **Normal** | 5 km/h | Default, standard cataphile walking pace |
| 🏃 **Fast** | 7 km/h | Sustained pace, known route, fast return |

The active mode is displayed next to the estimated time in the bottomleft label. The choice is persisted between sessions (localStorage). You can switch modes at any time via the modal, the time updates instantly.

**Navigation mode** — when a route is already active and you reopen **🗺️ Calculate a route**, the modal switches to **navigation mode**:

- Quick buttons **⏮️ Start** (centers the map on the 1st waypoint with a flashing cyan circle), **⏭️ End** (same for the last), **🔁 Full tour** (zoom to see the entire path).
- **🎯** button on each waypoint to go view it directly.
- **🔄 Recalculate** switches back to edit mode (the waypoints are kept, you can adjust them).
- **❌ Clear route** completely removes the path.

**Tolerance**: the algorithm accepts that your start or end points may be a bit **off** the roads — it automatically snaps them onto the nearest network. If several roads visually intersect but without sharing exactly the same point (typical case of a hand-drawn path), the app also handles **junctions within 15 px** to trace the route without breaks.

> 💡 **Tip**: if you want to see only the path without the distance label, close the modal then reopen it in navigation mode to use the piloting buttons.

#### 🚫 Avoidance preferences

In the route modal, a collapsible section **🚫 Avoidance preferences (optional)** lets you set **soft** constraints that the pathfinder will try to respect:

| Type | Description |
|---|---|
| **📍 Points to avoid** | **3 methods** to choose from: (a) autocomplete search in the text field, (b) entry by exact ID, (c) **📍 Click on the map**: switches to click mode, each click on the map adds a point. Orange chips with ✕ to remove. |
| **🏷️ Tags to avoid** | Click a chip to toggle it. All points carrying this tag will be avoided (e.g.: you activate `pa` → all ventilation shafts are avoided). |
| **📏 Margin** | Distance around the avoided points (px, default 100). Any road segment closer than this margin is excluded from the graph. |

**Behavior**:
- ✅ If possible, the route avoids everything (= normal computation)
- ⚠️ If no alternative path exists → the app still computes by going through these points and displays an orange message `⚠️ Cannot avoid: X, Y` above the result
- ❌ If even the fallback fails (= true absence of path) → classic error message

**Difference with ⛔ Inaccessible Zone**:
- ⛔ Zone = **hard** constraint (never relaxed even in fallback)
- 🚫 Avoidance = **soft** constraint (fallback possible with message)

**Persistence**: your preferences are saved per map (localStorage). On the next computation on the same map, they are restored. **🗑️ Reset** button to clear everything.

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
   | 🍺 **Drunk** | 2 km/h | ~333 m | Very slow, confused, disoriented, hesitant walking |
   | 🐌 **Slow** | 3 km/h | ~500 m | Cautious walking, tight passages, exploration |
   | 🚶 **Normal** *(default)* | 5 km/h | ~833 m | Standard walking pace |
   | 🏃 **Fast** | 7 km/h | ~1167 m | Known route, sustained walking |

   The choice is persisted between sessions (localStorage). If the area is already displayed on the map, switching presets recalculates it instantly.

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

- 📍 **XL Position**: map coordinates displayed in huge characters (readable from a meter away from the phone)
- 🧭 **Giant compass**: heading (walking direction) with needle rotating in real time, updated live via the phone's orientation sensors
- 🗺️ **Auto-focus minimap**: tight zoom (~20-50 m horizon) permanently centered on your position. Displays in the background the **roads / zones / structures of the map** — useful to spot paths, exits, dangers in the immediate vicinity
- ☑️ **🗺️ Route toggle** **: checkbox in the header. **Unchecked** by default (anti-crash protection on very large maps). Check it to redisplay your active route in the minimap — rendered in **bright cyan + white halo** to remain visible on the tight zoomed background. Preference persisted between 2 openings of emergency mode.
- 🔋 **Battery** **: the 🔋 STATUS block now displays the battery level in real time when the API is available (Chromium only). Critical in panic mode — you immediately know how much time you have left before the phone shuts down.
- 🌗 **Themes**: dark by default, light optional (depending on the outside environment — dim vs bright light)
- 🔋 **Wake Lock**: the screen does not turn off automatically while the mode is active (no need to touch the phone every 30 sec to wake it up)
- 📱 **Landscape** **: the minimap reframes correctly when you turn the phone horizontally or flip the portrait — no more shifts on rotation transition.

**When to use it?**
- You panic at an intersection and need to re-orient yourself quickly
- You are looking for a visual detail on the map (a pillar, a shaft) that should be nearby
- You want to check that you are going in the right direction (compass heading)
- You need to read your position in large size to transmit it to someone (radio, SMS) without squinting

**Permissions**: the first time, the browser requests access to the phone's **orientation sensors** (for the compass). Accept — without that, the compass stays frozen.

**Exit**: press the ✕ at the top right to close the mode.

> ⚠️ As with all digital tools underground: **keep a physical compass** and a paper map in your pocket. The phone can fail, the magnetometer can be distorted by local metal, the tracker can drift. The 🚨 is a quick info reading aid, not a substitute for preparation.

---

### 🚨 Rescue Mode — Multi-phases

A scenario can now **sequence several phases** with a debrief intercalated between each. Typical field use case: *Phase 1 = one team sweeps ALL main passages without entering extraction chambers → team returns → debrief at command post → Phase 2 = X teams target the extraction chambers with the information brought back from Phase 1.*

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
2. **Auto-detection**: as soon as **all participating teams have marked their Exit step as `completedAt`**, the button turns **pulsing green** + an assistant toast informs you ("✅ All teams are out — the phase is ready to close"). The Op keeps the final decision.
3. **Click "✓ Phase ended"** → debrief modal: free textarea (5000 chars max) to capture the lessons from the phase (teams returned, points found, priority zones to explore, constraints encountered). This debrief will be intercalated in the final report between each phase section.
4. **Validate "✓ End the phase"** → the current phase is **archived** (deep clone, never overwritten, history preserved) + `phase.endedAt` is set
5. **If a next phase exists** → automatic chaining to **"🚀 Start phase X+1?"** modal with summary of participating teams
6. **You confirm** → the new phase starts, the steps of participating teams are **rebuilt from their CURRENT route** (so if you modified `entry/exit/intermediate` of a team between P1 and P2, the new steps take this into account)
7. **If no next phase** → native `confirm()` "Stop the plan completely?" (equivalent to ⏹️ End the plan)

**🔍 History safeguards**:

- `terminerPhase` **NEVER** deletes steps — it archives them in `s.execution.etapesArchive[phaseIdx]` as deep clone
- A phase already started can no longer be deleted from the UI (safety net)
- An active phase in the execution cannot be deleted (go through "✓ Phase ended" first)
- The auto-detection toast does not repeat (single display per phase)

> 💡 **Hybrid teams ↔ phases model**: your teams are defined **only once** at the scenario level (with members, NATO color, route). Participation in each phase is managed by checkbox in the phase modal. The same team can participate in several successive phases — at the phase transition, its steps are reset based on its current route (so you can modify the route between P1 and P2 to adapt to what was discovered).

> 💡 **"➕ Add a phase" button also available on-the-fly** from the Op Live footer (during execution), not just from the Edit view. Useful when the P1 debrief reveals the need for an unplanned P3.

---

## ⏪ Undo / Redo **

You can **undo** and **redo** your actions on the map, up to **50 actions back**.

### Keyboard shortcuts (recommended)

| Shortcut | Action |
|---|---|
| **Ctrl+Z** (`Cmd+Z` Mac) | Undo last action |
| **Ctrl+Y** (`Cmd+Y` Mac) | Redo the undone action |
| **Ctrl+Shift+Z** (`Cmd+Shift+Z` Mac) | Redo (alternative) |

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

- ❌ **Photos** attached to points: their deletion remains **irreversible** (the blobs are erased from the local IndexedDB database, not restorable)
- ❌ **Session imports**: an import that overwrites your session cannot be undone via Ctrl+Z (use the SessionPersist auto-save to recover)
- ❌ **Tracker** (real-time sensor mode)
- ❌ **Distance measurement** (= ephemeral tool, not a persistent mutation)

### History lifecycle

- **RAM only**: history is kept in volatile memory only, **lost on reload** of the page (this is intentional, to avoid bloating local storage).
- **Reset on map change**: if you load another map, history is cleared (logical: you don't want to undo an action done on another map).
- **Limit 50 actions**: beyond, the oldest are forgotten (FIFO).
- **A new action erases the redo**: if you do 5 undos then place a new point, redo becomes impossible (history branch logic).

---

## 🪫 Battery indicator **

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

> 🪫 **If the API is not available** on your phone, the battery chip is **simply hidden** — no error message is displayed. This is normal on iOS. You still see the level in emergency mode if you want to have it in large size.

---

## 📊 Session statistics **

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

## 📐 Distance measurement and ⬛ Area measurement **

> All measurement buttons are in the **📐 Measurement** group of the side bar.

### 📐 Distance Mode (default)

1. Press **📐** — measurement mode activates (green button)
2. Click on the map to place points
3. The total distance is displayed at the bottom left, in meters (`📐 Distance: X m`)

### ⬛ Area Mode **

1. In the **📐 Measurement** group, press the **📏/⬛** toggle to switch to area mode
2. Click on the map to draw a **polygon** (at least 3 points)
3. The area is displayed at the bottom left, in m² (`⬛ Area: X m²`)
4. Beyond 10,000 m², the app automatically displays in hectares (ha)

> **How it works** : the app applies the Shoelace formula to map coordinates and converts to m² via the map's calibrated scale (`APP_CONFIG.scale` in px/m). Accuracy therefore depends on the initial map calibration (`📏 SCALE` in ⚙️ Settings).

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

> All editing buttons are in the **✏️ Editing** group of the side bar.

1. Press **✏️** — add mode activates (green button)
2. Click on the map at the desired location
3. A window opens. Fill in:
   - **Name** (required)
   - **Type** : choose from existing tags, **— No tag —** (default icon), or **➕ Create a new tag…**
   - **Description** (optional)
4. Confirm with **✅ Add**

### 🎨 Available icon types

The application provides a default icon set, grouped by category:

| Category | Available types |
|---|---|
| 🕳️ **Shafts** | Ventilation, Blocked, Filled, At ground level / Basin, Extraction |
| 🪜 **Access** | Ladder shaft (open / closed), Service stairs (open / closed), Adit (open / closed) |
| ⚠️ **Signage** | Room, Crawlway, Passage, Danger, Information, Electricity, Survey sketch, Vehicle |

> 💡 The **Access** icons follow an intuitive color code: **green = open**, **red = closed**. Handy for spotting usable passages at a glance.

### 🏷️ Create a new tag

If the type you want does not exist yet, select **➕ Create a new tag…**. Enter a short name (letters, digits, underscore or dash only) — for example `fountain`, `arch` or `ruin_2`.

The new tag is added to your session and will use the default icon. To customize its icon permanently, edit the map via **🏗️ Create / Edit map**.

### 🗑️ Delete points

Press **🗑️** (next to ✏️). A window opens with two options:

| Option | Effect |
|---|---|
| **↩️ Last point** | Deletes the most recently added point |
| **🗑️ All points** | Clears all manually added points (irreversible) |
| Cancel | Closes the window without deleting anything |

> You can remove multiple points one by one by successively clicking **🗑️ → ↩️ Last point**.

> ⚠️ **All points** only deletes the points that **you** have added — the original map's points stay intact.

### ✏️ Edit an existing point

Click on a marker you have added → the popup displays the **✏️ Edit** button (blue). It opens the same window as for adding, **pre-filled** with the name, type, description and photos already attached (if applicable).

You can change whatever you want then **💾 Save**. If you rename the point AND it has photos, the photos follow automatically (transparent internal migration).

### 📸 Photos attached to points

You can attach up to **5 photos per point** (anti-saturation limit for browser storage). 100% local — no photo is sent over the Internet.

**When adding or editing** a point, the **📸 Photos (N/5)** section offers 2 buttons:

| Button | Effect |
|---|---|
| **📷 Take photo** | Directly opens the camera (on mobile) to shoot a new photo |
| **🖼️ From gallery** | Opens the file picker (mobile and PC), you can choose several photos at once |

**Auto compression** : photos are compressed before storage (1920 px long side max, JPEG quality 85%). A raw 5-10 MB photo drops to ~200-500 KB. For 5 photos = ~2 MB per point.

**Remove a photo** : click the red ✕ cross at the top right of the thumbnail → it appears grayed out with red hatching (marked for deletion). If you change your mind, click the green ↺ arrow to undo. Actual deletion only happens when you **💾 Save**.

**If you cancel** the editing window instead of saving, **the photos you just added are deleted** (auto cleanup). Deletion markings are on the contrary **undone** — the photo remains.

**Visualization** :

1. In the **popup** of the marker (map click) : a row of 44×44 thumbnails appears, with the "📸 N photos" counter. Tap on a thumbnail → opens the **fullscreen viewer**.
2. In the **fullscreen viewer** :
   - **Mobile** : 2-finger pinch to zoom (1× to 4×), drag to move, horizontal swipe to go to the previous / next photo
   - **PC** : mouse wheel to zoom, mouse drag to move, `← →` arrows or `◂ ▸` overlay buttons to navigate, `Esc` to close
3. In the app: a **📸 N** counter appears in the top bar (alongside the other counters 📍 / 🛣 / ⬛ / 🏛️). Click on it → "📊 Session details" modal with breakdown by point.

**Sharing / saving** : photos are **included** in:
- 💾 Save session → 📦 Full / 🎨 Advanced / 🔄 Conversion tab → tick "📸 Include photos"
- Re-import session ZIP → photos automatically restored
- 📦 Map ZIP generator (Edit mode) → "📸 Include attached photos" option
- When creating a new map via the generator, "📦 Import a datalayer ZIP in one click" button → you can retrieve points + photos exported from another map

**Technical limits** :
- Browser local storage (IndexedDB) — quota ~50-200 MB depending on the device. A warning toast notifies you if you approach the quota
- On **iOS Safari standalone PWA**, the browser may purge the IDB in case of lack of space or uninstall — regularly export your maps + photos to secure them
- In case of a full app reset (💥 Reset everything), **all photos are erased** (consistent with the full wipe)

---

## 🛣️ Draw routes

> All path buttons are in the **🛣️ Paths** group of the side bar.

- **🟩 Main route** — bright green
- **🟪 Secondary route** — purple
- **🟨 Path** — yellow
- **🪜 Inter-level junction** — dashed magenta (with white circles at the ends). **Appears only if the map is in multi-level mode** — used to connect two levels (staircase, steep slope, internal shaft). See the **🏗️ Multi-level mode** section below for details.

To draw: press the corresponding button → click on the map to place points → press again to stop.

### 📏 Total path distance

The **📏 Total distance** button in the **🛣️ Paths** group opens a window that calculates the **sum of the lengths** of all your visible paths, with a filter by type.

**How it works:**

1. Press **📏** — the window opens with 3 boxes checked (Main, Secondary, Path)
2. Uncheck the types you want to exclude from the calculation
3. The **total in meters** updates instantly, and the included paths are **highlighted in magenta** on the map (bright halo to see them clearly)
4. For each type, the window displays the **number of paths** and their **cumulative length**
5. Two output options:
   - **✓ Close (keep highlight)** — the window closes but the **magenta highlight stays displayed** on the map. You can explore the map with the segments still visible, and re-click **📏** to reopen the window (the previous filters are kept).
   - **❌ Clear highlight** — removes the magenta halo from the map AND closes the window.

> 💡 The calculation includes **all** visible routes: those you have drawn in the session AND those present in the activated **data layers**. If you hide a layer in the layer control, its routes automatically drop out of the calculation.
>
> ℹ️ This measurement is **on-screen only** — it does not appear in the PNG image export legend.

### 🧹 Clear a path

Press **🧹**. A window opens with three options:

| Option | Effect |
|---|---|
| **↩️ Last path point** | Undoes only the last clicked point on the ongoing path (ideal for correcting a misplaced point) |
| **✂️ Last entire path** | Deletes the last complete path (useful if you want to redo a path without touching the previous ones) |
| **🗑️ All paths** | Erases absolutely all paths (irreversible) |
| Cancel | Closes the window without deleting anything |

> Example use case: you draw a main route, you make a mistake on the last turn. Click **🧹 → ↩️ Last path point** to back up one point, then continue your path normally.

> 💡 **Inter-level junctions (multi-level mode)** : 🪜 junctions are treated as normal paths by 🧹. **Last entire path** deletes the last junction if it is the most recent; **All paths** clears routes AND junctions; **Click selection** also works on a junction.

---

## ⬛ Draw zones

> All zone buttons are in the **⬛ Zones** group of the side bar.

Lets you draw **closed surfaces** to annotate particular areas of the map: backfill, collapsed zones, bodies of water, or inaccessible zones that block route calculation.

| Type | Icon | Color | Pathfinder effect |
|---|---|---|---|
| **Backfill** | ⬛ | Dark gray | None |
| **Collapse** | 🟥 | Red | None |
| **Water** | 🟦 | Blue | None |
| **Inaccessible** | ⛔ | Dark red / black hatching | 🚫 **BLOCKS** — the route will never pass through this zone |

### ✏️ How to draw a zone

1. Press the icon of the desired type (⬛, 🟥, 🟦 or ⛔) — the mode activates
2. Click on the map to place the points (at least 3)
3. To close the zone, **two options** :
   - **Re-click on the first point** (a circle appears on it as soon as 3 points are placed)
   - **Press ✅** — closes the zone at the location of the last point
4. The zone automatically fills with its color

> During drawing, segments appear as a dashed line. Once closed, the zone becomes solid.

### ⛔ "Inaccessible" zone — blocks the route

Draw a zone of type **⛔ Inaccessible** on a part of the map you want to **forbid to the pathfinder** (recent collapse making the passage dangerous, deep water, unmarked passage, etc.).

**Effect** : any calculated route that would have crossed this zone will now go through another path. If no other path exists, the calculation fails with a clear message.

It is a **hard constraint** — never relaxed. If you want a **soft constraint** (avoid if possible, otherwise go through anyway with a message), use the **🚫 Avoidance preferences** in the route modal instead (see dedicated section below).

**Multi-level** : the ⛔ zone only blocks segments at the **same level** (consistent with the level filter). An inaccessible zone at Level 0 does not affect the route at Level -1.

**Independent of the layer toggle** : even if you uncheck the zones layer in the layer control, the zone remains taken into account by the pathfinder.

### 🧱 Display order

Zones overlay in this order, regardless of drawing order:

1. **Water** (in the background)
2. **Backfill** (above water)
3. **Collapse** (above)
4. **Inaccessible** (above everything — to clearly see blocking zones)

This allows, for example, drawing a collapse on top of a backfill without it being masked.

### 🧹 Clear a zone

Press **🧹**. A window opens with these options:

| Option | Effect |
|---|---|
| **↩️ Undo the last point** | On the current area, or on the last closed area |
| **✂️ Last area (in progress OR closed)** | Deletes the area you are currently drawing if it exists, otherwise the last closed one |
| **🎯 Select an area to delete** | Activates a mode where you click on an area on the map to delete it |
| **🗑️ All areas** | Erases absolutely everything (irreversible) |

---

## 🏛️ Structures (pillars, walls, quarry faces)

Specific to **underground quarries**: structures let you map the load-bearing physical elements (support pillars, walls) and the progress of the working face (quarry faces). Independent from paths and areas — it's a 4th annotation layer.

> All buttons are in the **🏛️ Structures** group of the sidebar.

### 5 sub-types available

| Type | Icon | Shape | Color | Typical use |
|---|---|---|---|---|
| 🟡 **1st mass pillar** | polygon | yellow | Load-bearing pillar of the upper level (1st mass limestone) |
| 🟠 **2nd mass pillar** | polygon | orange | Pillar of the lower level (2nd mass limestone). In multi-level mode, auto-tagged at level -1 |
| 🔵 **Wall** | polygon | blue | Dry stone wall, breeze block, masonry retaining wall |
| 🟨 **1st mass quarry face** | polyline | yellow (line) | Upper level working face — this is a LINE, not a closed polygon |
| 🟧 **2nd mass quarry face** | polyline | orange (line) | Lower level working face. In multi-level mode, auto-tagged at level -1 |

### Drawing a structure

1. Click the desired sub-type (🟡 / 🟠 / 🔵 / 🟧 / 🟨) — it becomes active (lit up)
2. Click successively on the map to add the points
3. **Pillars + Walls (polygons)**: minimum 3 points. To finish, re-click on the lit icon → automatically closes the polygon (connects the last point to the first)
4. **Quarry faces (polylines)**: minimum 2 points. To finish, re-click on the lit icon → validates the line without closing it

While drawing, the preview updates in real time. The color and transparency are fixed per type.

### 🧹 Erase structures

Press **🧹** in the Structures group:

| Option | Effect |
|---|---|
| **↩️ Undo the last point** | On the current structure, or on the last structure |
| **✂️ Last structure (in progress OR closed)** | Deletes the one being drawn if present, otherwise the last validated one |
| **🎯 Select a structure to delete** | Map click mode — select the one to erase by clicking on it or near its edge |
| **🗑️ All structures** | Erases absolutely everything (irreversible) |

> 💡 The "🎯 Select" mode is handy for erasing a specific structure in the middle of a rich map, without having to count the "last added".

### Difference with areas

| | Areas (⬛) | Structures (🏛️) |
|---|---|---|
| Shape | Closed polygon only | Polygon OR polyline depending on type |
| Colors | Water / Backfill / Collapse / Inaccessible | Pillar 1/2 / Wall / Face 1/2 |
| Pathfinder effect | ⛔ Inaccessible **blocks** the route | None (read-only) |
| Typical use | Delimit terrain areas (stagnant water, etc.) | Map the underground architecture (pillars, walls, progress) |

> 🏗️ **Multi-level mode**: 2nd mass Pillars and 2nd mass Quarry faces are **automatically tagged at level -1** upon creation (the app considers that the 2nd mass is below). The other types take the current active level. You can modify the levels afterwards via the JSON editor.

---

## 🏗️ Multi-level mode (multi-story quarries)

Some quarries / galleries have **several physically stacked levels** (Glacière, Capucins, sites with stories). Multi-level mode lets you manage these maps correctly: each path/area/point belongs to a level, and the pathfinder doesn't magically traverse from one level to another through 2D visual intersections.

> 📚 **Visual coherence of levels**: when multi-level mode is enabled, paths are automatically stacked according to their level — a gallery at Level 0 always appears **ABOVE** a gallery at Level -1, and the one at Level +1 above Level 0. Within the same level: Trail (in the back) < Secondary < Main (on top). The computed route and ⛔ inaccessible areas always pass above everything to remain visible.

> ⚠️ **Optional mode** — disabled by default. Most quarries are single-level, classic mode is enough. Enable it **only** for genuinely multi-story quarries.

### Enable the mode for a map

**2 ways**:

1. **When creating/modifying a map** (via 📦 Create a map or ✏️ Modify an existing map): tick the **🏗️ Multi-level map (advanced)** box in the "Map information" section. The generated ZIP contains the flag → on import, the mode is enabled automatically.

2. **Manually in plan-config.json**: add `"multiLevel": true` in the `plan` section, save, reload the map.

> 🔧 **Note**: the ⚙️ Settings toggle to enable/disable multi-level on an already-loaded map has been removed. To enable the mode on an existing map, **go through the generator**: 🏗️ Modify an existing map → tick **🏗️ Multi-level map** → 📦 Generate the updated ZIP → reload it. This forces an explicit declaration and avoids inconsistencies between runtime state and `plan-config.json`.

> 💡 If you want to disable multi-level mode on a map, also go through the generator (untick the box and re-generate). Existing paths keep their level info in the JSON (hidden if the feature is OFF) — re-enable later without losing anything.

### The "Active level" badge

When the mode is enabled, a **yellow badge** displaying the active level number (`0` at startup, e.g. `[0]`) appears **below the Leaflet zoom buttons** (top-left of the map, right below the `+` `-`). Click it to open the **Levels modal**.

> 💡 If you later enable the 🧭 Compass widget while multi-level mode is active, the compass automatically positions itself **below the badge** so as not to overlap.

### The Levels modal

Two sections:

#### 🎯 Active level (for drawing)

Radio buttons `[ − ] [-2] [-1] [0] [1] [2] [ + ]` (5 levels by default, symmetric around 0). The clicked level becomes the **active level**: all new paths, areas, editor points you will draw will be tagged with this level.

**Numeric convention**:
- **`0`** = reference level (= elements without a tagged level — typically old v147-and-before maps). This is your ground floor / the main gallery.
- **`1, 2, 3...`** = upper floors / levels above the ground floor
- **`-1, -2, -3...`** = basements / levels below the ground floor

⚠️ **Changing the active level cancels any path in progress** (if you had started a main path at Level 0 and you switch to Level -1, the in-progress path disappears). This is on purpose to prevent a path from straddling 2 levels.

⚠️ **Visible reset**: changing the active level ticks **only this level** in the "Visible levels" section below (focused mode by default).

**2 extension buttons**:
- **[ + ]** (right): adds an upper level (max + 1). Useful for floors above.
- **[ − ]** (left): adds a lower level (min − 1). Useful for additional basements.

💡 **Auto-extension**: if you load a map whose data layers already contain elements at levels outside the default range (e.g. a shaft tagged `level: 4`), the app automatically extends the list of available levels so you can select/filter them.

#### 👁️ Visible levels (filter)

Checkboxes per level. Paths/areas/points of **unticked** levels are hidden on the map (opacity 0). Inter-level junctions remain visible if **at least one** of their endpoints touches a ticked level.

Quick buttons:
- **All**: ticks all available levels
- **Active only**: ticks only the active level

### 🪜 Drawing an inter-level junction

To physically connect two levels (stairs, steep slope, internal shaft, ladder between floors), you use the **🪜 Inter-level junction** sub-action in the **🛣️ Paths** group.

> ⚠️ **Conditional visibility**: the 🪜 button only appears **if multi-level mode is enabled** on the current map. If you don't see it, first check that the yellow `[N]` badge is indeed visible at the top-left.

**Step-by-step procedure**:

1. Open the **🛣️ Paths** accordion group in the sidebar.
2. Click on the **🪜 Inter-level junction** sub-action.
3. A **modal opens** with 2 selectors: `Start level` and `End level`. By default, "start" = your active level. Choose the second level, then click **OK**.
4. Path drawing mode starts. **Click on the map** to place as many points as you want (like a normal polyline). You can follow the exact shape of the staircase or draw a simple diagonal.
5. **Press 🪜 again** to validate and exit path drawing mode.
6. The junction appears in **dashed magenta** with a **white+magenta circle** at each of the 2 endpoints.

**Semantics of the 2 levels**: *start* and *end* are **symmetric** on the pathfinder side — it doesn't matter which one you put first, the route crosses the junction in both directions. Choose the order that seems natural (e.g. a staircase going down from Level 1 to Level 0 → `start: 1, end: 0`; a shaft going down from Level 0 to Level -1 → `start: 0, end: -1`).

**Visibility of a junction**: remains displayed if **at least one** of its 2 levels is in the list of visible levels. Example: junction `0 ↔ 1`, filter `[0]` active → junction visible (since 0 is in the filter). Filter `[2]` → junction hidden.

**Special case: one junction = one logical passage**. If in reality there are 2 staircases between the same levels, draw **2 distinct junctions** at the 2 physical locations. The pathfinder will automatically choose the shortest one according to the requested route.

> 💡 **Important for the pathfinder**: junctions are the **only bridges** between levels. If you want a route to go from Level 0 to Level 1, you **MUST** draw a junction between these 2 levels at the physical location of the passage (real staircase). Without a junction, the pathfinder refuses to cross even if visually 2 paths cross on the screen.

### 🧹 Erasing a junction

Junctions are erased **exactly like other paths** via the 🧹 sub-action:
- **🎯 Click selection** → click on the junction → confirm the deletion
- **✂️ Last entire path** → if the junction is the last path made, it is deleted
- **🗑️ All paths** → erases absolutely everything (routes + junctions)

### Adding level info to image layers

In the **🏗️ Map generator**, each image layer (legend, hatching, etc.) has a **🏗️ Level** field (visible only when `🏗️ Multi-level map` is ticked). Enter the level the layer belongs to (integer, default `0`).

**At runtime**: the layer is automatically shown/hidden according to your "Visible levels" filter in the Levels modal. The modal has **authority** over the Leaflet layer control checkbox → if you manually untick a layer, a level change re-applies the correct state.

**Backwards compat**: if you modify an existing ZIP that didn't have a `level` on its image layers, they display at `0` in the generator — modify them to distribute them by level if needed.

### Adding level info to data layers

Existing data layers (`puits.json`, `cataphile.json`, etc.) can also have items tagged by level. Manually add `"level": N` in the JSON:

```json
{
  "data": [
    { "id": "PA1", "nom": "Puits Aération Niv 1", "x": 100, "y": 200, "tags": ["pa"], "level": 1 }
  ],
  "roads": [
    { "type": "principal", "level": 0, "points": [{"x":1,"y":2}, ...] }
  ],
  "zones": [
    { "type": "eau", "level": 0, "points": [...] }
  ]
}
Items without `level` → treated as `level: 0` (backwards compat with your existing JSON).

### Exporting with level selection

**Quick mode** (🖼️ → ⚡ Quick mode): exports what is currently visible (WYSIWYG, follows your filter).

**Advanced mode** (🖼️ → 🎨 Advanced mode): new **🏗️ Levels to export** section with checkboxes per level. **Independent** from the map filter → you can filter the map on [Level 0] but export [Level 0+1+2] by ticking the 3 boxes. Pre-ticked on what is currently visible to avoid surprises.

### Existing maps (backwards compat)

If you load a v147 or earlier map that **has not** enabled multi-level mode:
- No level buttons, no 🪜 sub-action, strictly identical behavior
- Your old sessions / exports continue to work without modification

If you enable the mode on an existing map:
- All paths/areas/points without level are considered as **Level 0**
- You can start adding Level 1, 2… paths that coexist with the old ones (at Level 0)

---

## ⬆️ Save and share

> All export buttons are in the **⬆️ Save** group of the sidebar.

### 💾 Save a session

Press **⬆️ → 💾**. A modal opens with **3 tabs** to choose from:

#### 🚀 Full
Exports everything in a single `devmap-session` file (added points, paths, areas).
Useful for saving your session and resuming it later.

> 📌 Distance measurement and tracker position are **not** included in Full mode.

#### 🎨 Advanced
Precise selection of what you want to export:

- ✏️ **Added points** + checkboxes per tag (with miniature icon) + a special `(no tag)` category for points without tags. So you can for example export only points with the `pa` or `danger` tag.
- 🛣️ **Paths** + checkboxes per type (main, secondary, trails)
- ⬛ **Areas** + checkboxes per type (water, backfill, collapse)
- 🧭 **Tracker position** *(optional)* — also includes the traveled path if it exists

**Output format** to choose from:
- 📄 **Single session file** (.json — re-importable like a classic backup)
- 📦 **Multi-file ZIP** (one file per category: `session_points.json`, `session_roads.json`, etc.)

#### 🔄 Conversion
Converts your session into a **data layer** ready to integrate into a definitive map via the `plan-config.json` file.

Checkboxes: Points / Paths / Areas (with **tag filtering** for points, like in Advanced). No tracker in conversion.

**Granularity** to choose from:
- 📄 **Basic**: 1 file per category (`points.json`, `roads.json`, `zones.json`)
- 🔬 **Fine**: 1 file per type (`zones_eau.json`, `zones_remblais.json`, `roads_principal.json`, etc.)

Direct download if a single file, ZIP otherwise.

> 💡 Conversion is useful for freezing part of your work into a permanent map. Once converted into a data layer, this data is no longer modifiable from the application.

### 🖼️ Export as PNG/JPG

> 🆕 **Renaming notice**: the modal was previously called "Export the map", renamed to "**Export as PNG/JPG**" to clearly distinguish from the new "**Export as printable PDF**" (see next section).

Press **⬆️ → 🖼️ Map as image**. A modal opens with two modes:

#### ⚡ Quick export
Everything is included automatically: complete map, all visible layers, points, paths, areas, tracker position and path. PNG format at original resolution. A single click on **Download**.
4. Beyond 10,000 m², the app automatically displays in hectares (ha)

> **How it works**: the app applies the Shoelace formula to the map coordinates and converts to m² via the calibrated scale of the map (`APP_CONFIG.scale` in px/m). Accuracy therefore depends on the initial calibration of the map (`📏 SCALE` in ⚙️ Settings).

### ❌ Clear the measurement

Press **❌**. A window opens with two options:

| Option | Effect |
|---|---|
| **↩️ Last point** | Undoes only the last clicked point (ideal in case of a wrong click) |
| **🗑️ All the measurement** | Clears all points and resets the distance/area to zero |
| Cancel | Closes the window without deleting anything |

> You can remove several points one by one by successively clicking **❌ → ↩️ Last point**.

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

Press **🗑️** (next to ✏️). A window opens with two options:

| Option | Effect |
|---|---|
| **↩️ Last point** | Deletes the most recently added point |
| **🗑️ All points** | Clears all manually added points (irreversible) |
| Cancel | Closes the window without deleting anything |

> You can remove several points one by one by successively clicking **🗑️ → ↩️ Last point**.

> ⚠️ **All points** only deletes the points that **you** added — the points of the original map remain intact.

### ✏️ Modify an existing point

Click on a marker you added → the popup displays the **✏️ Modify** (blue) button. It opens the same window as for adding, **pre-filled** with the name, type, description and photos already attached (if applicable).

You can change whatever you want then **💾 Save**. If you rename the point AND it has photos, the photos automatically follow (transparent internal migration).

### 📸 Photos attached to points

You can attach up to **5 photos per point** (anti-saturation limit for browser storage). 100% local — no photo is sent over the Internet.

**When adding or modifying** a point, the **📸 Photos (N/5)** section offers 2 buttons:

| Button | Effect |
|---|---|
| **📷 Take photo** | Opens the camera directly (on mobile) to shoot a new photo |
| **🖼️ From gallery** | Opens the file picker (mobile and PC), you can choose several photos at once |

**Auto compression**: photos are compressed before storage (1920 px long side max, JPEG quality 85%). A raw photo of 5-10 MB drops to ~200-500 KB. For 5 photos = ~2 MB per point.

**Remove a photo**: click on the red ✕ at the top right of the thumbnail → it appears greyed out with red hatching (marked for deletion). If you change your mind, click on the green ↺ arrow to undo. The actual deletion only happens when you **💾 Save**.

**If you cancel** the edit window instead of saving, **the photos you had just added are deleted** (auto cleanup). The deletion markings are conversely **canceled** — the photo stays.

**Display**:

1. In the **popup** of the marker (map click): a row of 44×44 thumbnails appears, with the counter "📸 N photos". Tap on a thumbnail → opens the **full-screen viewer**.
2. In the **full-screen viewer**:
   - **Mobile**: 2-finger pinch to zoom (1× to 4×), drag to move, horizontal swipe to switch to the previous / next photo
   - **PC**: scroll wheel to zoom, mouse drag to move, `← →` arrows or `◂ ▸` overlay buttons to navigate, `Esc` to close
3. In the app: a **📸 N** counter is displayed in the top bar (alongside the other counters 📍 / 🛣 / ⬛ / 🏛️). Click on it → "📊 Session details" modal with breakdown per point.

**Sharing / saving**: photos are **included** in:
- 💾 Save session → tab 📦 Full / 🎨 Advanced / 🔄 Conversion → check "📸 Include photos"
- Re-import session ZIP → photos automatically restored
- 📦 Map ZIP generator (Modify mode) → option "📸 Include attached photos"
- When creating a new map via the generator, button "📦 Import a datalayer ZIP in one click" → you can recover the points + photos exported from another map

**Technical limits**:
- Browser local storage (IndexedDB) — quota ~50-200 MB depending on the device. A warning toast notifies you if you approach the quota
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

It is a **hard constraint** — never relaxed. If you want a **soft** constraint (avoid if possible, otherwise pass through anyway with a message), use the **🚫 Avoidance preferences** in the route modal instead (see dedicated section below).

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
Karma_dev
You are powered by the model named Opus 4.7 (1M context). The exact model ID is claude-opus-4-7[1m].

### Cleaning the Trail of Magenta Highlights

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

### 💾 Save a session

Press **⬆️ → 💾**. A modal opens with **3 tabs** to choose from:

#### 🚀 Full
Exports everything in a single `devmap-session` file (added points, paths, zones, structures).
Handy for saving your session and resuming it later.

> 📌 Distance measurement is not included in Full mode.

> 🧭 **Tracker included in Full**: if the tracker is active (or was used during this session), its **current position + traveled path + complete timeline + start timestamp** are embedded in the payload under `session.tracker`. On re-import, your tracking session is **faithfully restored** (timeline + replay possible). If the tracker has never been activated, the field is simply absent (backward compatibility).

#### 🎨 Advanced
Precise selection of what you want to export:

- ✏️ **Added points** + boxes per tag (with miniature icon) + a special `(no tag)` category for points without tags. So you can for example export only points with the `pa` or `danger` tag.
- 🛣️ **Paths** + boxes per type (main, secondary, trails)
- ⬛ **Zones** + boxes per type (water, backfill, collapse, inaccessible)
- 🏛️ **Structures** + boxes per type (pillars / wall / faces)
- 🧭 **Tracker** *(optional)* — if checked, the box shows a real-time counter: *"timeline N evt · path M pts"*. On export includes: current position + traveled path + complete timeline + start timestamp. Re-import restores everything via `setTrackingTimeline` → your 🎬 replay is functional after re-import.
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

### 🖼️ Export to PNG/JPG

Press **⬆️ → 🖼️ Map as image**. A modal opens with two modes:

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
- **Resolution**: Original, ½ or ¼ (useful for very large maps)
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
- **🖼️ Base image & layers** — "Base map image" checkbox + 1 checkbox per `imageLayers[]` of the map (image layers like legends, photo annotations, etc.). Pre-checked = current visibility on the map.
- **📊 Data layers** — 1 checkbox per `dataLayers[]` of the map (wells, vehicles, paths, embedded structures, etc.). The `editor` layer appears with a special label "My annotations (= session layer)".
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

Press **⬆️ → 💾** then the **🌍 KMZ** tab. Generates a `.kmz` file that can be opened in any KML-compatible field mapping app.

Typical use cases:
- Visualize your map in **Google Earth** over satellite imagery
- Load into **OsmAnd / Locus / Avenza** for offline field navigation
- Share with a colleague who doesn't have MyKTAMap but has a KML viewer

#### Calibration via 2 GPS points

The KMZ needs to know **where your map is located on the globe**. You give it 2 pairs (point on your map ↔ real GPS coordinates), the app calculates the rotation+scale+translation transformation and positions everything correctly.

For each point (A and B), 3 methods to choose from:
- **🔍 Search for a point**: type a name in the bar, click the result → the map x/y coords are auto-filled. You just need to fill in the corresponding GPS coordinates.
- **📍 Click map**: the modal shrinks, you click on the map where you know the GPS coords → map x/y auto-filled. Fill in the GPS coords.
- **Manual entry** of the 3 fields (Map x, Map y, **GPS (lat, lng)**).

> 🌐 **GPS format**: the `GPS (lat, lng)` field directly accepts the **native Google Maps format** (`48.680831, 2.158843`). You can copy the coords from Google Maps (right-click → copy coordinates) and paste it all into the field — no need to split into 2 lat / lng fields. If the format is invalid, the field turns red with an explicit message. The same format is accepted **everywhere** in the app (Ctrl+K search · KMZ Settings · georeferenced map creation).

> 💡 **Tip**: choose 2 **far apart** points on the map (ideally at opposite ends) — the larger the AB distance, the better the transformation accuracy. The app refuses if AB is less than 50 px on the map or less than 1 meter IRL.

#### Live preview

As you fill in the fields, a **🌐 Corners preview** block displays with:
- The 4 corners of your map calculated in (lat, lng) — ↖️ ↗️ ↙️ ↘️
- The calculated **scale** (meters per pixel) and **rotation** (°)
- A **🔗 View center on Google Maps** link to visually verify that the center of the map falls where you expected (auto internet connection check before opening)

#### Content to include (fine granularity)

Same as the Advanced Image mode: parent checkboxes + sub-checkboxes for precise control.

- 🖼️ **Map image** (GroundOverlay) + **Opacity 0-100%** slider (default 60%) — lets you see satellite/OSM mapping under your map in Google Earth
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

Your 2-point calibration is saved **per map** (localStorage). On the next export of the same map, the 8 fields are already pre-filled — adjust if needed and re-download. If you change maps or start over, you'll just need to re-enter it.

> ⚠️ **Accuracy limits**: the transformation is a **2D similarity** (rotation + uniform scale + translation). On globally flat and rigid maps, it's sufficient. On very extensive or non-rigid maps (local deformations), expect a slight drift at the ends opposite to the calibration. A future version may support 3+ points (least squares) for more accuracy if needed.

> ⚠️ **As with PNG export**, check that your KMZ doesn't reveal sensitive information before sharing it publicly (private underground quarry, restricted access…).

---

## ⬇️ Load / Import

> The **⬇️ Load / Import** group in the sidebar contains the import actions.

### 📥 Import a session

Press **⬇️ → 📥 Import a session** to open the import window. A modal displays:

1. **Drag and drop** your `devmap-session.json` file into the area, or click to select it
2. A **preview** displays: number of points added, number of paths, number of zones, number of measurement points
3. A **warning** notifies you that the import will replace your current session — remember to export before if necessary
4. Click **Import** to validate, or **Cancel** to close without changing anything

### 📊 Edit a JSON file

Press **⬇️ → 📊 Edit a JSON file** to open the table editor. Lets you bulk edit the points of a layer or session.

#### Opening

1. **Drag and drop** a `.json` file (data layer like `puit.json`, or session `devmap-session.json`)
2. The format is auto-detected
3. The table displays with one column per detected field

#### Editing

- **Click a cell** to edit it (except ID, read-only)
- **Tab**: move to next cell
- **Enter**: move to next row (same column)
- **Esc**: cancel the current edit
- **Coordinates**: if X or Y is off the map, the cell turns red with a warning ⚠
- **Tags**: click the cell to open a multi-tag selector with icon preview. You can also create a new tag on the fly

#### Actions

- **🔍 Search**: filters all columns
- **Sort**: click a column header (asc → desc → cancelled)
- **Multi-selection**: checkbox + Shift+click for a range
- **+ Add row**: new empty row at the bottom
- **📋 Duplicate**: copies the selected rows
- **🗑️ Delete**: removes the selected rows (confirmation required)
- **📍 View on map**: displays the selected points in flashing orange on the map

#### Saving

**💾 Save** button → 3 choices:

| Option | Effect |
|---|---|
| **📥 Download** | Retrieves the modified `.json` file |
| **🗺️ Replace layer** | Updates the corresponding layer in memory (if `data` format and layer loaded on current map) |
| **✏️ Replace session** | Replaces the added points of the current session (if `editorPoints` format) |

> ⚠️ If you close the window with unsaved modifications, a confirmation offers to save, quit without saving, or continue editing.

### 🗂️ Change map

Press **⬇️ → 🗂️ Change map** to return to your map list (the **📚 My maps** home screen) and load another. Unexported data will be lost — **export your session before changing**.

From this screen, you can:

- Click **▶️ Resume** to relaunch the map you just left
- Choose another map in **My maps** (direct click or ▶️ button on the row)
- Load a new ZIP via the import area
- Import/Export your map list

---

## 🏗️ Create or modify a map

> Accessible directly via the **🏗️** button in the sidebar (direct click, no sub-menu).

Press **🏗️** to open the generator. Two tabs available:

### 📄 New map

Blank form. Fill in:

- **Information**: name, version, author
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

In the **📊 Data layers** section of the generator, a golden yellow box offers **📦 Choose a datalayer ZIP…**. It serves to **retrieve in one go** the layers + photos from another map, exported via **💾 Save session → 🔄 Conversion → ✏️→🗂️ Session to data layer** (with the 📸 Photos checkbox checked to include them).
# 11/12 — Configuration > 📥 Conf example
[REVIEW: original heading "Configuration > 📥 Conf exemple" — likely refers to a downloadable example config file]

Downloads a `plan-config.json` annotated with explanatory comments. Useful for:
- Understanding the structure
- Manually creating a plan with a text editor
- Reusing as a base for a custom plan

> 💡 Open this file with a code editor (VSCode, Notepad++, Sublime Text…) — the comments help understand each field.

### 🐛 Detailed logs

Enables capture of all console logs (debug + info + warnings + errors) for diagnosis. Once enabled:
1. Reproduce the issue
2. Open ⚙️ Configuration → 📋 Show logs
3. Copy / export logs to send them to the author or attach them to a feedback report

> ⚠️ Costs some performance (logs accumulate in RAM). Disable when no longer needed.

### 💥 Reset everything

⚠️ **DESTRUCTIVE ACTION**. Erases:
- Service Worker (forces fresh re-download at next boot)
- HTTP / PWA caches
- All localStorage (preferences, plan list, autosaved session, etc.)
- sessionStorage
- **All IndexedDB databases** (memorized handles + ZIP blobs stored on mobile + multi-rotation backups + photos POI + secours photos + your local PRO LICENSE if imported manually)
- **Unlock Gate access code** — the app will ask for the access code at next boot

**Internet pre-check** : before the double confirmation, the app tests your Internet connection. If you're offline, a red modal warns you explicitly that the app will be unusable after the reset (no SW + empty caches → nothing to download to restart). You can force "Continue anyway" if you really want to.

**Two confirmations** when online (three when offline) are then requested before execution to avoid any accidental click. Useful when:
- The app behaves strangely (last resort)
- You want to test a fresh install
- You want to free up space and start clean

> 🗝️ **Communautary access code required at restart** : after reset, the app will ask for the communautary access code at next boot. The first confirmation modal shows you the current code so you can note it/copy it before reset — otherwise impossible to log back in! If you have a pro license, you can also import it via "📂 Import my pro license" to log back in.

> 💡 Your plans on the server (in `data/`) are NOT affected — only your local data is erased.

---

## ⚙️ Settings (in map mode, per plan)

> Accessible via the **⚙️ Settings** group at the top right of the map.

Allows you to modify the **current plan** without going through ZIP regeneration. Changes are saved in localStorage and apply instantly (some need an app reload).

### Available sections

- **🎨 Display** — Light/dark theme, marker scaling at zoom, intersection circles
- **🐛 Debug** — Detailed logs (same as loader)
- **🌐 KMZ Georeferencing** — Configure GPS calibration of the plan via 2 reference points (see [section 🌐 KMZ Georeferencing](#-kmz-georeferencing-calibration-2-points))
- **🧭 Initial tracker position** — Define tracker start coordinates (X/Y) **assisted** :
  - **🔍 Choose via a point** : opens unified search to select an existing POI, auto-fills X/Y
  - **📍 Click on the map** : temporarily masks the modal, a floater appears, you click the position on the map → auto-fills X/Y + restores the modal
  - Manual entry remains possible in the X/Y fields

> 💡 **Cross-app consistency** : the GPS coordinates entry in georeferencing uses the **same combined `lat, lng` format** as Ctrl+K search and KMZ export. Direct paste from Google Maps (`48.680831, 2.158843`) works everywhere uniformly.

> 💡 **Time saved on the initial tracker position** : no more need to read X/Y coordinates manually in the plan. Click on the desired position or pick an existing POI — done.

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

> ⚠️ **This is a usage barrier, not data encryption.** The lock prevents normal opening of the app, but a motivated attacker can bypass it via DevTools. Photos and sessions remain stored in clear in the browser. This is exactly the same security level as the existing community access code — honestly assumed.

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

### Lockout: 5 failed attempts

For security reasons, after **5 incorrect codes in a row**, the app is locked **permanently** on a red screen with no exit button. The only way to recover access is to **💥 Reset everything** from the home screen (loss of the current session and unsaved maps).

> Failed biometric attempts do **not** count toward the 5 attempts — the WebAuthn spec manages its own native lockout on the device side. You can cancel a Face ID by mistake without worrying about exhausting your tries.

---

## 🔧 Reset

In case of a problem or to force an update, use **⚙️ → 🗑️ Reset**. This action unregisters the Service Worker, clears the cache and reloads the application.

> ⚠️ Only perform this action with an Internet connection available. Without a network, the application will be unusable until the next full reload.

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
Use **⚙️ → 🔄 Force update** (soft update, keeps all your data). If insufficient: **⚙️ → 🗑️ Reset** (full purge, last resort). The soft update is fast thanks to a background pre-download.

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
- 📦 **Data ownership** — your annotations, your photos, your measurements are stored **locally**, in the browser. No one else has access to them. You can export everything at any time (`💾 Save session`) and erase everything in 2 clicks (`💥 Reset everything`).
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

- 🍃 **[Leaflet](https://leafletjs.com/)** — interactive map engine. Heart of the map display.
- 📦 **[JSZip](https://stuk.github.io/jszip/)** — reading and writing of `.zip` archives on the browser side (maps, sessions, exports).
- 📤 **[jsPDF](https://github.com/parallax/jsPDF)** — generation of printable PDFs (A0 → A4, portrait/landscape).
- 🧭 **Dijkstra's algorithm** (1959) — shortest path calculation for assisted itineraries.
- 🌐 **[GPX 1.1 standard](https://www.topografix.com/gpx.asp)** — exchange format with TopoDroid, OsmAnd, Strava, Garmin and the outdoor ecosystem.
- 🛡️ **[Web standards](https://developer.mozilla.org/)** — Service Worker, IndexedDB, WebAuthn, FileSystemAccess API. Maintained by thousands of people we will never meet and to whom we owe enormously.

### To the PWA ecosystem

To the browsers (Chromium, Firefox, Safari, their mobile forks) that implement modern web standards and allow a simple page to function like a native app without depending on a store.

### To the development assistant

A good part of the code in this version was co-written with **Claude (Anthropic)**, an AI assistant that accompanied development over dozens of sessions. It's a tool just like Leaflet or JSZip — useful, honestly documented, and one that does not replace the vision or the final decisions (always on the human side).

### To you reading this guide

For taking 10 minutes to read instead of clicking blindly. This is exactly the state of mind these places require — **taking the time, understanding before acting, respecting what we don't yet master**.

> If you want to contribute — a bug report, a suggestion, a hand with the docs — go through the repo issue tracker or the usual community channels.
