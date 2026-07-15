# 📗 MyKTAMap — User Guide

> This guide is intended for application users. It explains how to use each function, how to prepare your phone for a field trip, and outlines the essential rules regarding data discretion.

---

## 🔴 Important warnings

### ⚖️ Terms of use & legal notice (since v1.56.0)

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

### 🛡️ Revoked plans (anti-leak kill-switch, since v1.42.0)

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

#### 🔄 Automatic boot audit (since v1.42.3)

If a plan **you have already imported** is revoked by the author AFTER your import (between 2 sessions), the app detects it automatically at next startup:

- ~2 seconds after boot, in the background, the app computes the SHA-256 fingerprint of each of your local plans and compares against the public list
- If a match → plan is **automatically removed** from your list
- An **orange modal** appears listing the revoked plans (name + reason + date + truncated fingerprint) + "Got it" button
- The fingerprint is cached in your plan list → next boots are near-instant (no re-calc)

> ✅ **Privacy**: everything stays local, like at import. No fingerprint is ever sent to the server.

---

### 🌐 Migration to `myktamap.fr`

The application is changing its official domain. Starting **July 15, 2026**, the new address will be **`myktamap.fr`** (instead of the current `myktamap.fr`).

**How are you informed?**

A **permanent info alert** (blue 🚨 badge) is broadcast via the public alerts system. You can check it whenever you want by clicking the 🚨 badge in the loader header. The alert displays the cutoff date + the complete checklist of data to export before migration.

**What should I do to migrate my data?**

Your data (list of maps, sessions, preferences) is **linked to the domain** (web security rule — isolated origins). It will NOT follow automatically. You must act before the cutoff:

1. **📚 Export your map list**: in the loader, **📚 My maps** section → **💾** button → download a `.config` file containing all your saved maps (metadata + references). On the new domain, you will import this `.config` via the **📂** button at the same place.
2. **💾 Export your sessions**: on each open map, use **📤 Export** (Full or Advanced) → download a `.json` per session (annotations, paths, zones, custom points in progress).
3. **📦 Keep your map ZIPs** that you had imported. Local blobs stored in the browser are not exportable — you will need to re-import the ZIPs manually on the new domain via the usual drag-and-drop.
4. **On July 15, 2026**: go to `myktamap.fr` → import the map list `.config` + re-import the ZIPs + import the session `.json` files on each corresponding map.
5. **📱 If you had installed the app on your home screen** (PWA): you will need to manually delete the old icon then reinstall from `myktamap.fr` (since the origins are different, the installed icon points to the old domain).

**During the transition (until July 15, 2026)**: both domains will work in parallel. You can continue to use this site as before, and migrate at your own pace.

**After July 15, 2026**: the old domain will display a transition page that will automatically redirect you to `myktamap.fr`. The installed PWA will automatically deactivate at its next update check (≤24h after the cutoff).

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
- **🏅 Rank**: a **badge** (from *Tourist* to *Grandmaster*) computed from your **time spent** in the app, the **number of maps** explored and the **km of gallery** mapped. It shows as a **colored ring** around the photo + a **medal** in the corner + the **rank name under your nickname**. The breakdown (the 3 metrics + progress "X left for the next rank" + a score) is in the profile card. *(100% local and fun — it unlocks nothing, it's just for the joy of it.)*
- **🏆 Achievements**: **38 achievements** to unlock. **8 families × 4 tiers** (🥉🥈🥇👑) — *Cartographer* (maps), *Surveyor* (georeferenced maps), *Deep walker* (km), *Cellar rat* (time), *Pin master* (POIs), *Tracer* (paths), *Zoner* (zones), *Builder* (structures) — **+ 6 one-shot « 🎉 Special »**: *Jack of all trades*, *Centurion* (score ≥ 100), *Mole* (used the tracker), *Multi-level caver*, *Underground marathon* (tracker session > 4 h), *Completionist* (all the rest). A **toast** notifies you on unlock, the **N/38** grid lives in the profile card. You can also show your **score** and your **number of achievements** in the home banner stats (🎨 *Banner stats* section).
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
   - **🔆 Keep screen on** — prevents your screen from auto-sleeping while MyKTAMap is open (Wake Lock API). Useful on cataphile outings to avoid having to touch the phone every 30 sec. Auto re-acquire on return from background (visibilitychange). Toggle automatically hidden on browsers that don't support the API (Firefox notably). The same toggle is also accessible in **⚙️ Settings** in map mode (see dedicated section).

> 🌍 **Application language** *(since v1.46)*: MyKTAMap is translated into **3 languages — French, English, Spanish**. The language selector (flag + full name) is located in **⚙️ Configuration**, in its own section **right after the Incognito block**. The change applies immediately, without reloading the app. *Good to know*: the **Documentation**, the **built-in Help** and the **welcome tutorial** currently exist in French and English only — if you use the app in Spanish, the interface is indeed in Spanish but these long-form contents are displayed in **English by default**. You can switch these contents between 🇫🇷 and 🇬🇧 at any time via the flag button at the top of their window. On each language change, a message offers to **restart the app** for a fully clean switch (optional). 💡 In **incognito mode**, your interface language is now **kept** (all other data stays completely forgotten).

> 💡 **Since v1.36.2**: the "Show circles at path intersections" option is **no longer in Configuration home** but in **⚙️ Settings in map mode** (per-plan). Each map now has its own setting — handy to disable circles only on your very dense maps without touching the others.

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

## 📖 Story Mode — Free note + PDF for each plan

The **📖** button in the top bar (left of the battery 🔋) opens a two-tab modal scoped to each plan. It's your **personal exploration notebook** for each underground site.

### 📝 Free note (Markdown)

A text notepad auto-saved as you type. Perfect for the site's history, anecdotes, your exploration to-do, things to double-check. **One note per plan**, kept across reloads and app restarts.

The note supports **Markdown**:
- By default you see the **rendered output** (colored headings, bold, lists, clickable links, blockquotes).
- Tap **✏️ Edit** to modify the source ; a mini toolbar helps you insert formatting: **B**old · *I*talic · H1 · H2 · • List · 🔗 Link · `</>` code · ❝ quote.
- Tap **👁 Preview** to switch back to the rendered view.
- Any MD you type (`**bold**`, `# Title`, `- item`…) is interpreted on render.

### 📚 Story (PDF)

If the plan author embedded a PDF in the plan (historical narrative, scanned paper map, brochure, detailed legend), it shows up directly in this tab.

Otherwise you can **📥 import your own PDF** from your device (1 PDF per plan, replaceable / removable). An imported PDF survives reloads. On iPhone, an **↗️ Open in a tab** button kicks it into native fullscreen if the inline view isn't available.

### 📦 Bundled into session export

When you 📤 Export, both your Markdown free note AND your Story-mode PDF are automatically embedded in the `.mkmsession.zip` file. On re-import (on another device, or to share with a partner), everything is restored on the current plan. Backward-compatible (an old file without these fields still loads fine).

In **anonymized** mode, note + PDF are intentionally omitted from the ZIP (may contain personal info).

> 🔒 **100% offline** — the note and the PDF stay on your device. Nothing is sent to the internet.

---

## 🚨 Emergency Exit Mode — Find the nearest exit

The **🚨** button in the top bar (between 📖 Story Mode and the battery 🔋) triggers route computation toward the **nearest exit** from your current position.

**Use case**: you're underground, you want to get out **right now** with no thinking (injured, low battery, lamp failure, simply lost). You tap the button (or trigger it by voice), the app does the rest.

### How it works

1. Tap **🚨** in the top bar **OR** say "**exit**" / "**how do I get out**" via the 🎤 voice command.
2. The app scans every POI on the plan with an open-exit tag:
   - `cao` → **C**avage **A**utre **O**uvert (Open Cavage)
   - `peo` → **P**uits à **E**chelon **O**uvert (Open Echelon Shaft)
   - `eso` → **E**scalier de **S**ervice **O**uvert (Open Service Stairs)
   - `entrée` → any POI marked as a known entrance
3. For each candidate the app computes the **real navigable path** via the pathfinder (handles walls AND inter-level junctions).
4. A compact modal shows:
   - The nearest exit + its distance + its level if the plan is multi-floor
   - A **🧭 Trace route** button (reuses the regular Route Mode engine)
   - A foldable **See N other exits** sorted by distance

### Closed variants intentionally ignored

The codes `caf` / `pef` / `esf` (closed cavages, shafts, stairs) are **excluded** since they're not traversable in practice. If you mark a POI as closed, the app will never suggest going there.

If an exit is displayed with a **≈** badge (tilde), it means the pathfinder **could not compute a path** and fell back to **straight-line distance**. Beware: that exit may actually be unreachable (walls, isolated floor).

### Computation origin

By default the app starts from your **current tracker position**. If the tracker isn't active (or you're free-exploring without tracking), an alternative modal offers a **click-on-the-map picker** to specify your starting point.

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
| **Load / Import** | ⬇️ | Import a session, open the plan data editor, change map |
| **Create / Modify map** | 🏗️ | Map generator *(direct click)* |
| **Save** | ⬆️ | Save your session (3 modes), export the map as an image |
| **Tracker** | 🧭 | **Full-screen menu**: start / stop tracking, recalibrate, My position, path lock, compass, route, replay, heatmap, emergency |
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
| **🎯** | **My position** — recenter the map on you *(v1.49.0)* |
| **🔓** | **Suspend trace lock** — temporarily (30 s → 10 min) *(v1.49.0)* |
| **🗺️** | Calculate a route |
| **🎬** | Tracker session replay |
| **🔥** | Heatmap — see dedicated section |
| **⛑️** | I'm lost — **SOLID RED button** (danger signal) |
| **🚨** | XL Emergency Mode — **SOLID RED button** (danger signal) |

> 🚨 **The 2 emergency modes are deliberately placed at the END of the panel with a bright red background** to make them instantly visually identifiable. In a stressful situation, you know where to look.

> 🆕 **v1.49.0 — field**:
> - **🎯 My position**: recenter the map on your current position (handy after panning elsewhere).
> - **🔓 Suspend trace lock**: if "trace lock" (smart navigation) is on and you **leave the gallery network** (e.g. entering a cave), you can disable it temporarily (**30 s / 1 min / 10 min / until reactivation**) without going through settings. A **🔓 countdown shows in the bottom bar**, next to the tracker ON/OFF indicator; tap it to reactivate (confirmation asked).
> - **⚙️ Advanced settings**: in ⚙️ Settings → *Navigation & Tracker*, the lock's **lateral tolerance** and **heading weight** are adjustable (to tune junction behavior). Step length, threshold and cooldown are now **clamped** to avoid nonsensical values. ⚠️ Expert settings — set the plan's m/px scale first.

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
- **Accordion sections**: click on a section header to collapse/expand. All open by default.
- **Quick buttons per section**: `👁️ All` and `🚫 None` to toggle all items at once.
- **🔄 Show all button** (footer): resets all runtime filters (tags + types) to their neutral state (= everything visible). Does NOT touch the M-LVL toggles or the image/data layers — each kept independent.
- **Status footer**: counts active filters at the bottom (`Active filters: tags, paths`) in yellow if at least one active, gray if everything neutral.

**Per-map persistence**:

The tags + types filters are **saved in the map's session** (`SessionPersist`). If you enable "hide shafts" on map A, then switch to map B, then come back to A → your filters are **automatically restored**. Each map has its own filters.

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
| **⬛ Zones to avoid** *(since v1.48.0)* | Tick a **zone type** in the list (Water, Collapse, your custom types…) so the route **goes around** all zones of that type. **⛔ Inaccessible** zones don't appear here: they're already impassable (hard constraint, never relaxed). |
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
- ☑️ **🗺️ Route toggle**: checkbox in the header. **Unchecked** by default (anti-crash protection on very large maps). Check it to redisplay your active route in the minimap — rendered in **bright cyan + white halo** to remain visible on the tight zoomed background. Preference persisted between 2 openings of emergency mode.
- 🔋 **Battery**: the 🔋 STATUS block now displays the battery level in real time when the API is available (Chromium only). Critical in panic mode — you immediately know how much time you have left before the phone shuts down.
- 🌗 **Themes**: dark by default, light optional (depending on the outside environment — dim vs bright light)
- 🔋 **Wake Lock**: the screen does not turn off automatically while the mode is active (no need to touch the phone every 30 sec to wake it up)
- 📱 **Landscape**: the minimap reframes correctly when you turn the phone horizontally or flip the portrait — no more shifts on rotation transition.

**When to use it?**
- You panic at an intersection and need to re-orient yourself quickly
- You are looking for a visual detail on the map (a pillar, a shaft) that should be nearby
- You want to check that you are going in the right direction (compass heading)
- You need to read your position in large size to transmit it to someone (radio, SMS) without squinting

**Permissions**: the first time, the browser requests access to the phone's **orientation sensors** (for the compass). Accept — without that, the compass stays frozen.

**Exit**: press the ✕ at the top right to close the mode.

> ⚠️ As with all digital tools underground: **keep a physical compass** and a paper map in your pocket. The phone can fail, the magnetometer can be distorted by local metal, the tracker can drift. The 🚨 is a quick info reading aid, not a substitute for preparation.

### 🚨 Rescue Mode

Operational tool to **methodically assign rescue teams** to search areas on a cataphile map. Use case: someone is reported missing in a dense network, several teams arrive at the surface, the rescue command center must coordinate "who sweeps what" with a clear, printable briefing.

> 💡 **Different from ⛑️ I'm lost**: ⛑️ is *you* who are lost, you are trying to find yourself. **🚨 Rescue Mode** is *someone else* who is lost, you organize the teams who will look for them.

#### Access

🚨 button in the **🧭 Tracker** group (emergency flyout), next to ⛑️ I'm lost and 🚨 Panic. Consistent red emergency background.

#### Workflow

1. **List of scenarios** — You see all scenarios saved for this map (max 10, FIFO).
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
| ⬛ Define zone | Choice: (a) multi-click polygon + double-click to close, OR (b) path selection on click (re-click = remove, red highlight for selected) |
| 🗺️ Calc. route | Automatically calculates the shortest path between entry and exit by following existing galleries (via Pathfinder), displays distance + estimated duration (methodical speed 0.5 m/s) |

#### Map visualization

**🗺️ View on map** button in the edit header. Displays for each team (dedicated color):
- Polygon zone (fillOpacity 30%) OR colored halo on the selected paths
- 📍 Entry marker (green border circle + team color fill)
- 🚪 Exit marker (red border circle + team color fill)
- Suggested route (dashed polyline team color)

Auto-refresh on each modification. Re-click the button to hide.

#### Multi-scenarios per map

You can prepare **several hypotheses** simultaneously ("if Marc left via the East" vs "if via the South"). 🗐 Duplicate button to clone a scenario and test a variant without losing the original. Cap of 10 scenarios per map (beyond that, the oldest is automatically purged).

#### Exports

**📄 Printable PDF**: 1 A4 portrait page per team with color banner + Context/Members/Mission/Route sections + empty 60mm Observations box (to fill in with pen on field return). Filename `Rescue_<scenario_name>_<date>.pdf`.

**🌍 Geolocated KMZ**: embeds the complete scenario in a KMZ annex file (`myktamap-extras.json > secoursPlan`). Prerequisite: map already KMZ-calibrated (see Export sessions modal 🌍 KMZ tab). MyKTAMap can re-import the KMZ and reload the scenario as-is. Filename `Rescue_<scenario_name>_<date>.kmz`.

The sections below detail the advanced features: cross-app integrations (KML, Lost Mode, heatmap, etc.), real-time field exploitation (Live views by role, statuses, reports), and cross-device consolidation (import of teammate reports).

> 💡 **Operator ↔ teams sharing** goes through the classic **`.mkmsec.report.json` report** (device-to-device file exchange).

> 💡 **Field recommendation**: prepare one or two scenarios **BEFORE** an incident on your favorite maps to identify workflow frictions (where are the accesses, how to divide the network, which levels by team). During a real incident, you will be in emergency mode and the app must be ready to draw in 30 seconds.

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

### 🚨 Rescue Mode — Cross-app integrations

These integrations make Rescue Mode a complete operational coordination tool:

#### 🌍 KML cross-app (Google Earth, OsmAnd, Avenza…)

The exported KMZ now contains a root `🚨 Rescue` folder perfectly structured for third-party apps:

```
📁 Rescue — Marc search 26/05
   ├── 📁 🚨 Alpha team
   │   ├── 📁 📍 Points (5)           ← toggle ON/OFF in Google Earth
   │   ├── 📁 ⬛ Search zone
   │   └── 📁 🗺️ Route
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

In the mini-modal "📍 Choose a point", your map favorites now appear as clickable chips (max 8) ABOVE the autocomplete search. 1 click = waypoint applied (skip search + map click).

Especially useful for emergency scenarios where you want to quickly create several teams with the same 3-4 known access shafts.

#### 🛑 Configurable cross-feature pause

New section in the 🗺️ Route modal:

```
🛑 Pause between stops
☑️ Include a pause between each intermediate stop
   Duration per pause: [15] min
```

Default checked + 15 min (= preserved behavior). Modifiable → also applies to Rescue Mode duration calculations (cross-feature).

> ⚠️ As with all digital tools underground: **keep a physical compass** and a paper map in your pocket. The phone can fail, the magnetometer can be distorted by local metal, the tracker can drift. The 🚨 is a quick info reading aid, not a substitute for preparation.

### 🚨 Rescue Mode × 🌍 OSM View — External rescue coordination (v1.41)

Since v1.41.0, Rescue Mode is integrated with the OSM View to provide **external rescue teams** (firefighters, GRIMP, SDIS) with everything they need to intervene on site without knowing the place.

#### 🚪 "Plan entry point" tag

New built-in tag available in the **🚨 Rescue** category of the legend and POI editor. Marks the main entrance(s) for rescue teams:

- Vector SVG icon (yellow door on black background)
- Automatically appears in the Firefighter Briefing PDF ("critical POIs" section)
- Visible on the OSM View too (with its GPS georeference)

> To tag a POI: edit it → Tag menu → "🚨 Rescue" category → "🚪 Plan entry point". You can have multiple entries (north/south/etc.).

#### 📍 Team surface GPS

In the team form (Rescue Mode → team edit), new **📍 Surface GPS** field:

```
📍 Surface GPS: [48.8566, 2.3522        ]
                 ↑ format: lat, lng (decimal WGS84)
```

Enter the GPS position of the rescue HQ, firefighter rendezvous point, or any surface point of interest related to this team. Optional.

→ This data feeds the **Firefighter Briefing PDF** (clickable OSM link per team) and stays in the `.mkmsec.json` export.

#### 🌍 OSM View accessible everywhere in Rescue Mode

The **🌍 OSM View** button is now present in:
- The Edit view (scenario banner)
- All 3 Live views: 👤 Surface Operator, 🚨 Field Team, 🚑 Free Rescuer

No need to return to edit view to show the plan's location on OpenStreetMap to firefighters arriving mid-mission.

#### 🚒 Dedicated Firefighter Briefing PDF

New **🚒 Firefighter Briefing** button in all Rescue Mode banners. Generates a dedicated PDF specially designed for external rescue teams, containing:

| Section | Content |
|---------|---------|
| **INFO** | Scenario name · plan name · generation date |
| **LOCATION** | GPS center coordinates + bbox + **clickable OpenStreetMap link** + **clickable Google Maps link** |
| **TEAMS ON SITE** | For each team: name + members + surface GPS (if set) + individual OSM link per team |
| **CRITICAL POIs** | 🚪 Plan entry points · 🚨 Emergency exits · 🪜 Cavages (open/closed) with M-LVL level |

> 💡 **How to use**: Print the PDF or send it by email/Signal to the firefighter group leader BEFORE arrival. On site, they click the links from their phone/PC to open OSM or Google Maps centered on your site. No MyKTAMap installation needed on their side.

#### 📤 "Surface briefing" page in post-mission report

The post-mission PDF report (generated via 📤 Report button) now includes a new "SURFACE BRIEFING" page with the same info. Useful for geographic debrief with firefighters or archiving the intervention file.

#### 🏷️ OSM View tag filter fix

Previously, the tag filter chips in the OSM View modal only showed ~3 tags (data source bug). Since v1.41.4, **all tags present** in the plan are listed, aligned with the OSM View Home widget.

#### 💾 Save Offline — OSM View without Internet (v1.43.0 → v1.43.8)

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

**Smart offline behavior** (v1.43.1 → v1.43.7):

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
│ 🚨 Alpha team · Step 3/5     ⏱️ 14h 23min            │
├─────────────────────────────────────────────────────┤
│  ✓ ━ ✓ ━ ↻ ━ ○ ━ ○                                  │ ← stepper
│  clickable, status color per step                   │
├─────────────────────────────────────────────────────┤
│ 📍 STEP 3 — North ventilation shaft                 │
│ Status: 🟢 NTR                                       │
│                                                      │
│ 📝 Observations at this step:                       │
│ [central gallery nothing to report]                 │
│                                                      │
│ ⚡ Quick input:                                     │
│ [🟢 NTR] [🟡 Suspect] [⬛ Blocked] [🔵 Clue]        │
│ [🟠 Help requested] [🟣 U-turn] [🚨 Victim!]        │
│                                                      │
│ [📸 Photo (0/5)]  [🎯 Recenter map]                 │
├─────────────────────────────────────────────────────┤
│ [← Previous step]  [Next step →]                    │
│ [⏸️ Pause] [📤 Report] [View edit] [⏹️ End]          │
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

**Photos**: tap "📸 Photo (X/5)" → auto rear camera on mobile (`capture="environment"`) OR gallery. Max 5 photos per step, auto JPEG q85 compression max 1920px. Click a thumbnail → fullscreen viewer with swipe + zoom.

**Auto-save**: observations saved on textarea blur AND on step change. No need for "Save" button.

**Auto-status NTR**: moving to the next step without having set an explicit status → automatically marked "🟢 NTR" (assumes you did the step with nothing to report). Re-click status possible if needed.

#### 👤 Live view — SURFACE OPERATOR mode (overview)

For the command center coordinating several teams in parallel:

```
┌─────────────────────────────────────────────────────┐
│ 👤 Surface operator · 3 teams  ⏱️ 02h 14min          │
├─────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐         │
│  │ 🔴 Alpha    3/5  │  │ 🔵 Bravo    1/4  │         │
│  │ ████████░░ 60%   │  │ ███░░░░░░░ 25%   │         │
│  │ 🟢 NTR           │  │ 🟠 Help requested │         │
│  │ « NTR central    │  │ « Water on floor,│         │
│  │ gallery »        │  │ level rising »   │         │
│  │ ⏱️ 14:23         │  │ ⏱️ 14:18         │         │
│  │ [👁️ Details]     │  │ [👁️ Details]     │         │
│  │ [🚨 Take over]   │  │ [🚨 Take over]   │         │
│  └──────────────────┘  └──────────────────┘         │
│  ┌──────────────────┐                               │
│  │ 🟢 Charlie  ✓D   │ ← team Done (grayed)          │
│  └──────────────────┘                               │
├─────────────────────────────────────────────────────┤
│ [⏸️ Pause] [🗺️ Global map] [📤 Global report]       │
│ [View edit] [⏹️ End the plan]                        │
└─────────────────────────────────────────────────────┘
```

**Special cards** with strong visual signals:

- 🚨 **Victim found** → **FLASHING RED** card (1.2s animation, absolute emergency, you can't miss it)
- 🟠 **Help requested** → orange + glow (reinforcement to send)
- ✓ **Done** → grayed opacity 0.75 (all steps completed)

**"👁️ Details" button** → read-only mini-modal with chronological list of the team's steps (ts + emoji status + obs).

**"🚨 Take over" button** → switches to the Team Member view focused on this specific team. You become TEMPORARILY Alpha's team member to enter a detailed observation on their behalf (typical case: you are at the command post but you receive a radio call from Alpha who dictates their obs to you).

**Easy return**: once in Team Member mode after "Take over", a **"👤 Back to Operator"** button appears in the footer. On click → return to the intact Operator overview (the `_previousRole` flags survive reload + plan switch).

**"🗺️ View global map" button**: hides the modal + renders the map overlay with all the zones + waypoints + routes of the teams in NATO colors.

#### 🚑 Live view — FREE RESCUER mode (loose notes)

For the occasional reinforcement / reconnaissance without a pre-assigned team:

```
┌─────────────────────────────────────────────────────┐
│ 🚑 Free rescuer · 12 notes  ⏱️ 01h 47min             │
├─────────────────────────────────────────────────────┤
│ 📝 Add a note                                        │
│ [north gallery nothing to report]                   │
│ ⚡ Associated status:                                │
│ [🟢 NTR] [🟡 Suspect] [⬛ Blocked] [🔵 Clue]        │
│ [🟠 Help] [🟣 U-turn] [🚨 Victim!]                  │
├─────────────────────────────────────────────────────┤
│ 12. 🟢 NTR · ⏱️ 16:42:18                       [✕]  │
│     « East crossing, NTR, we continue »             │
│                                                      │
│ 11. 🟡 Suspect · ⏱️ 16:38:05                   [✕]  │
│     « Sound of running water, source?? »            │
│                                                      │
│ ... (chronological DESC)                            │
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

The ⏱️ timer displayed at the top of each Live view is calculated from `startedAt` MINUS the cumulative pause time. You can pause with the **"⏸️ Pause"** button (the timer freezes) then resume with **"▶️ Resume"** — the pause duration is NOT counted.

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
   - Imports the operator's `.mkmsec.json` (team ID consistency)
   - Launches the plan → Team Live view → fills in obs + statuses + photos per step
   - **On surface return**: generates their report via "📤 Report" in the Team Live footer → **`.mkmsec.report.json`** format → exports the file (local download)

3. **Operator side (field return)**:
   - Retrieves the 3 `.mkmsec.report.json` reports (one per team) via the channel of their choice (AirDrop, mail, USB stick, Discord)
   - In the Operator Live view → **"📥 Import team member report"** button in the footer
   - File picker → selects the file → preview modal showing: targeted team name, number of steps to merge, photos, and **detected conflicts** (steps on the op side already filled that will be merged)
   - Confirms the import → the app does a **snapshot BEFORE** (emergency backup) then merges:
     - Observations **concatenated with dated separator** (no loss)
     - **Most severe status retained**
     - Photos **imported with deduplication**
   - Result modal with detailed stats (X steps merged, Y photos imported, Z possible warnings)
   - Repeat for the 2 other teams

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

> 🪫 **If the API is not available** on your phone, the battery chip is **simply hidden** — no error message is displayed. This is normal on iOS. You still see the level in emergency mode if you want to have it in large size.

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
- 📤 Export → tab 📦 Full / 🎨 Advanced / 🔄 Conversion → check "📸 Include photos"
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

#### 🔗 Merge (combine several data layers)
Building a large map across **several sessions** and ending up with lots of files (`Point1.json`, `Point2.json`, `Road1.json`…)? The **🔗 Merge** tab **groups them into a single set per type**.

- Drop/select **N** data layer files (`.json` and/or `.zip`, can be added cumulatively).
- The app **concatenates them by category**: all points → `points.json`, all paths → `roads.json`, all zones → `zones.json`, all structures → `structure.json`.
- A **preview** shows the totals and **warns** you if any point ids are duplicated (duplicates are kept as-is).
- **Download** the result (a ZIP, or a direct `.json` if there is only one category), ready to drop into your map folder.

Also available **directly from the home screen** ("🔗 Merge data layers" button, between "📊 Data editor" and "🏗️ Generate a map") — no need to have a map open. **100% local**, no data sent.

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

### 📊 Plan data editor

Press **⬇️ → 📊 Plan data editor** (in map mode) **or** the **📊 Data editor** button on the home screen to open the table editor. You can **view, edit and export** the plan's data (points, paths, zones, structures).

> ℹ️ From the **home screen**, no plan is loaded yet: only the **📦 ZIP** and **📄 JSON** sources are offered (no "current plan").

#### Opening — 3 sources *(since v1.48.0)*

1. **🗺️ Current plan** — lists the data layers of the open plan (shafts, accesses, paths, zones…). Pick one to edit.
2. **📦 Import a ZIP** — retrieves the data layers from a full plan (`.zip`).
3. **📄 Import a JSON file** — a single data or session file (drag and drop).

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

In the **📊 Data layers** section of the generator, a golden yellow box offers **📦 Choose a datalayer ZIP…**. It serves to **retrieve in one go** the layers + photos from another map, exported via **📤 Export → 🔄 Conversion → ✏️→🗂️ Session to data layer** (with the 📸 Photos checkbox checked to include them).

**Typical use case**:
1. KARMA sees a friend who has annotated a map (points + paths + zones + structures + photos) and who exports a `data_<map>.zip` via Conversion
2. You copy this ZIP onto your device (Drive, AirDrop, USB…)
3. In the generator, **Modify existing** OR **New map** mode, you click the 📦 Choose a datalayer ZIP button
4. The ZIP is parsed → **data layers are automatically created**: `points` (the friend's points), `roads` (paths), `zones` (zones), `structure` (pillars/faces). If the ZIP contained photos, they are **kept in memory** to be embedded at generation time.
5. Green message "✅ N layer(s) created: points (X), roads (Y), zones (Z), structure (W) · 📸 M photos"
6. You **📦 Generate the ZIP** as usual → the final map contains your original layers (if Modify) + the imported layers + the `data/photos/` folder with the blobs
7. When this map is loaded by any user, the photos are automatically restored in IndexedDB and appear in the marker popups

**Behavior**:
- **New mode**: the imported layers become the map's data layers (the UI list is emptied and filled with the ZIP's layers)
- **Modify mode**: the existing layers of the source map are **preserved**; the imported ZIP's layers are added with **`_imported_<N>` suffix** if there's an id conflict (= never overwrites the original layers). Current map's IDB photos **merge** with the ZIP's photos (deduplication by photoId).

> 📸 **Expected datalayer ZIP format**: it's exactly what the **session → data layer Conversion** produces when you check "📸 Include attached photos" (Basic or Fine granularity doesn't matter). Contains `points.json` + `roads.json` + `zones.json` + `structure.json` (depending on what was present in the source session) + `photos/_index.json` + `photos/<photoId>.jpg`.

### 📸 Include photos attached to the map

In **Modify existing** mode, if the map you load already has **photos attached to its points** (stored in local IndexedDB via the editor), a **📸 Include attached photos (N · X MB)** checkbox appears in the "🖼️ Main images" section of the form.

- **Checked by default**: the map's IDB photos are embedded in the generated map ZIP under `data/photos/<photoId>.jpg`. You can thus share the complete map (annotations + photos) to another device.
- **Unchecked**: the generated map ZIP does not contain the photos. Lighter in size, but the user who imports the ZIP will not retrieve the photos.

When loading this map ZIP by any other user: the photos are **automatically restored** in IndexedDB under the local planId + a discreet toast "📸 N photos restored from the map" confirms.

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

When loading a V2 map, you can choose **Performance mode: Disabled** in the loader's **⚙️ Configuration** modal. In this case, the runtime ignores the tiles and directly loads the **source image** (`baseImage` of the ZIP, kept intact) as a classic V1 map.

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

### 6. ⚡ Performance mode — choose the right preset

When loading a map, you can choose from 5 presets in the loader:

| Preset | For which case |
|---|---|
| **💤 Disabled** | Small map ≤ 4 000 px, powerful desktop. **Risk of crash on Safari iOS beyond 8 000 px** |
| **🔄 Auto** (default) | Smart behavior — tiles if file > 60 MB. ✅ Good default choice |
| **🌟 Quality** | High-definition images, full perf (desktop/laptop) |
| **🎯 Balanced** | Good quality/perf compromise, recommended on most modern mobiles |
| **⚡ Performance** | Old mobile, very large map, absolute priority to stability |

> 💡 The preset is memorized **per map**: you can have one map in Performance mode for your old phone and another in Quality for your iPad.

### 6 bis. 🚀 Performance ULTRA mode — for the really big maps that crash

If despite Performance mode, your map still crashes (typically 4000+ × 2000+ pixel maps with many paths), open **⚙️ Settings → "🚀 Performance ULTRA mode" section** and enable the **🚀 ULTRA master toggle**. It enables 6 aggressive optimizations simultaneously.

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
- In case of crash: ⚙️ Settings → **🐛 Detailed logs** → ON to diagnose

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

## 🤖 AI Help

> Accessible via the **📚 Help / Doc / Legend → 🤖 AI Help** group.

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

> Accessible via the **📚 Help / Doc / Legend → 🗺️ Legend** group.

Displays the complete legend of icons and paths, grouped by category: **🕳️ Shafts**, **🪜 Access** (ladder shafts, stairs, cavages), **⚠️ Signage**, **🛣️ Paths** and **⬛ Zones**.

> 💡 The legend displays **all the icons the application can recognize**, even if your current map doesn't use them. It's handy for discovering the available types before adding your points.

---

## ⚙️ Settings (in map mode, per plan)

> Accessible directly via the **⚙️** button in the side bar (direct click, no sub-menu).
>
> This modal is focused **per map** (settings related to the currently opened map). For **global settings** (interface, PIN, reset, etc.), go through **⚙️ Configuration** on the home page — see the dedicated section above. The separation is intentional: Settings = what concerns THIS map, Configuration = what concerns the app.

Access the settings by clicking **⚙️**:

### 🧭 Tracking (map-specific)
- **Initial tracker position**: X/Y start coordinates
- **Step detection**: sensitivity (`stepThreshold`), step size (`stepLength`), anti-bounce cooldown
- **Scale (px/m)** with **🎯 Calibrate** button: computes the correct scale from a measured distance

### 🔍 Display
- **Zoom-adaptive icons** (`scaledMarkers`) — *global preference*: the point icons (shafts, accesses, signage, etc.) keep a constant size relative to the map. On zoom-out, they shrink; on zoom-in, they grow. Reload required on toggle.
- **⚪ Show circles at path intersections (this map)** — *per-plan since v1.36.2*: solid colored circle at the crossing of 2 paths (green × purple → yellow, etc.). Uncheck to visually clear very dense maps, or if the computation slows down rendering. **Immediate effect**, saved per map (another map keeps its own setting). Before v1.36.2 this option was in Configuration home and global to all maps.
- **🧭 North calibration (this map)** — *per-plan since v1.37.0*: useful when the TOP of the map is **not** the true North (aerial photo with arbitrary framing, cataphile map without aligned compass rose). Angle field [0,360[ in degrees or button **📐 Calibrate (2 clicks)** which opens a WYSIWYG picker: click first the SOUTH of the map, then the NORTH, a dashed Sud→Nord arrow appears and the angle is auto-computed. **Effect**: tracker icon rotation + walking direction adapt → the tracker points in the right direction RELATIVE TO THE MAP. The physical compass 🧭 keeps pointing to the real magnetic North (= expected behavior of a compass). **Saved per map**, **immediate effect** without reload. ↺ Reset button to return to default (0 = North toward top of map).

> 💡 **Map author v1.37.0**: to durably embed the North OR a **History PDF** in the map ZIP (cross-users), use the **advanced generator** (field "🧭 North orientation" in Tracking + optional "📖 History PDF" section). For a History PDF loaded only in your session (your browser), keep using the import button in the **📖 History Mode** modal (status bar) — unchanged since v1.34.20.
- **🔆 Keep screen on** — *global preference*: enables the Wake Lock API to prevent automatic screen sleep while the app is open. Auto re-acquisition on return from background. Hidden if the browser doesn't support the API. The same toggle is also available in **⚙️ Configuration** on the home page.

### 🎬 Presentation mode

- **🎬 Launch presentation mode**: button at the **top** of the Settings modal. Activates a full-screen mode without UI (for demos / projection), accessible with a single touch button.
- The **F** key is available as a PC shortcut.

### 🎯 Georeferencing pickers

The 2-point pickers (GPS calibration for KMZ / GPX) are available in **⚙️ Settings → Georeferencing tab** (in addition to the **Export → 🌍 KMZ** modal):

- **🔍 Search a point** on the map to auto-fill x/y
- **📍 Map click** to directly point to a position
- Manual lat/lng GPS entry to finalize the calibration

The calibration entered here is shared with the KMZ / GPX exports of the same map (per-map persistence via localStorage). Handy for validating your calibration **outside the export flow** (for example at the start of a field session).

### 🛠️ Debug
- **🐛 Detailed logs**: enables verbose mode (tracker sensor + tiling + detection logs). Useful for diagnosing a problem.
- Display of the **performance mode** of the current map (💤 Disabled / 🔄 Auto / 🌟 Quality / 🎯 Balanced / ⚡ Performance) — read-only here, modifiable at the next map load via the loader selector.

### Actions
- **Apply**: saves the changes
- **🐛 Logs**: displays the captured debug logs
- **Reset**: restores default values for THIS map (does not delete anything — different from **💥 Reset everything** in ⚙️ Configuration loader, which purges everything)

> 💡 **Performance mode is only modified at map load** (5-preset selector in the loader → ⚙️ Configuration → 🖼️ Tiling). Settings just displays the current one.

> ⚠️ **To enable / modify the local access code (PIN / Face ID)**, you must go through **⚙️ Configuration on the home page** — the 🔐 Local access code section is NOT in ⚙️ Settings (by design — global critical setting, not per map).

### 🎯 Calibrate the scale

If the app gives you a distance different from reality (for example 100 m displayed when you know there are 150 m on the field):

1. Measure the distance in the app with **📐**
2. Open **⚙️ → 🎯 Calibrate**
3. Enter the **displayed distance** (100) and the **real distance** (150)
4. The new scale displays in real time
5. Click **Apply** → the value is injected into the Scale field
6. Click **Apply** in the Settings modal to validate

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

## 🐳 Self-host with Docker (NEW v1.36.0)

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

> 🔒 **No data sent elsewhere**. The image bundles the vanilla app exactly as the official version, but served from your own hardware. It's even slightly more offline-friendly than production (no occasional fetch to `gstatic.com` for the connectivity ping — the `networkAudit.js` module stays active if you want to verify).

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
- 🔄 **[Leaflet.ImageOverlay.Rotated](https://github.com/IvanSanchez/Leaflet.ImageOverlay.Rotated)** *(BSD 2-Clause, vendored)* — plugin that projects an image as a parallelogram via 3 corners (CSS matrix transform). Used for the **2-anchor** calibration of image layers (v1.38+) and for the projection of MyKTAMap plans **onto the OSM View** (v1.39+). Thanks to **Iván Sánchez Ortega** for this elegant plugin.
- 📦 **[JSZip](https://stuk.github.io/jszip/)** *(MIT/GPL dual)* — reading and writing of `.zip` archives on the browser side (maps, sessions, exports, partial extraction for the HOME mini-map). Thanks to **Stuart Knightley** and contributors.
- 📤 **[jsPDF](https://github.com/parallax/jsPDF)** *(MIT)* — generation of printable PDFs (A0 → A4, portrait/landscape, miniature page Rescue Mode, embed Story Mode).
- 📸 **[html2canvas](https://html2canvas.hertzen.com/)** *(MIT, vendored)* — DOM-to-image capture (canvas → PNG). Used to embed the **Leaflet OSM map** in the **« Firefighters Briefing »** PDFs of the Rescue Mode (since v1.42.5): the full graphic stack (tiles + overlays + projected plan) is captured as a frozen image and embedded in the PDF handed to external rescue teams. Thanks to **Niklas von Hertzen** and contributors.
- 🌍 **[OpenStreetMap](https://www.openstreetmap.org/) & its contributors** — licensed under **[ODbL](https://opendatacommons.org/licenses/odbl/)** for data and **[CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)** for cartography. Worldwide map data displayed in the **OSM View** (modal + HOME widget, since v1.39+) **only when you enable it via the dedicated opt-in**. The app shows the `© OpenStreetMap contributors` attribution in the corner of every OSM map, **as the ODbL license requires**. Tile hosting: **[OSM Foundation](https://wiki.osmfoundation.org/wiki/Privacy_Policy)** (non-commercial foundation, public logs policy, no advertising tracking). Without this monumental common good — built since 2004 by **thousands of volunteers** mapping the world street by street — the OSM View would not exist.
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
