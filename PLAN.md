# Lake of Lights — Build Plan

A digital lamp-lighting ceremony for the AIS Halloween party. 140 guests scan a QR code, enter a 4-letter nickname and light a floating lamp. Each lamp drifts onto a misty, moonlit lake on the big screen. When the 140th lamp is lit, the lamps slowly drift together to spell **WELCOME**.

---

## 1. The experience

### Big screen (event laptop + projector)
- **The scene:** night sky with a large moon and faint stars. Bare tree silhouettes line the far shore. A dark lake reflects the moon, and layers of mist drift slowly across the water. Fireflies now and then, and a rare bat across the moon. The Halloween touches stay subtle and elegant.
- **Darkness lifts:** at 0 lamps the scene is very dark and misty. Every lamp brightens the whole scene a little and thins the mist.
- **A new lamp arrives:**
  1. A small spark rises from the bottom edge, as if from the audience.
  2. It becomes a clay lamp floating in from the near shore, leaving ripples.
  3. The lamp settles in its spot, the wick catches with a soft flare and chime, and its reflection appears on the water.
  4. The guest's nickname (e.g. `NIMA`) rises above it in glowing letters, then fades.
- **Queue:** if many taps arrive together, lamps arrive one after another (about 0.7s apart), so each guest gets a visible moment.
- **Living flames:** every flame flickers independently, the reflections shimmer, and lamps bob gently on the water.
- **Fixed lamp spots:** 140 spots are spread naturally across the lake, smaller towards the far shore for depth. Lamps fill in a scattered order (not row by row), so the lake fills organically. The layout is fixed, so reloading the screen restores every lamp in place.
- **On-screen info:** only a QR panel in the corner (no counter, no captions).
- **Milestones at 35, 70 and 105:** a deeper bell tone, a ripple across the whole lake, and the moon brightens a step.
- **Finale:**
  1. The last five lamps get a wordless build-up: a low heartbeat and a pulsing moon.
  2. The 140th lamp lights, followed by a short silence.
  3. All flames swell, the lamps slowly drift across the water (about 10 seconds, with a gentle wobble) and assemble into **WELCOME**, reflected in the lake.
  4. The mist clears completely, the moon glows full, and sparks rise into the sky.

### Guest phone
1. **Opening:** a small dark lake scene with one unlit clay lamp. "Light your lamp for tonight."
2. **Nickname:** a single text field, up to 6 letters A–Z, shown in capitals.
3. **Hold to light:** press and hold the lamp. The wick glows, sparks, then catches. The phone vibrates on Android (iPhones don't allow web pages to vibrate).
4. **Release to the lake:** swipe up (or tap "Send to the lake"). The flame lifts off the phone screen, while the request goes to the server in the background with automatic retries.
5. **Keepsake card:** "Lamp #37 of 140 · NIMA · lit 7:42 PM" with the flame still burning, a mini lake map marking where their lamp is, and "Look for NIMA on the big screen." It's worth a screenshot.
6. **Already lit:** if they reopen the page, they see their keepsake again, not a second lamp.
7. **Shake the flame:** the phone's motion sensor makes the flame lean, sway and flutter as the phone moves. A hard shake throws sparks, but the flame never goes out. Fallback: dragging a finger near the flame does the same.
   - Android: works automatically.
   - iPhone: needs one permission prompt. We ask during the "hold to light" tap, since iOS only allows the prompt after a tap.
   - Both need HTTPS, which GitHub Pages provides.

---

## 2. Architecture

```
 Guest phones (mobile data)          Event laptop (internet)
 ┌──────────────────────┐            ┌──────────────────────┐
 │ index.html  (guest)  │            │ screen.html          │
 │ GitHub Pages         │            │ GitHub Pages         │
 └─────────┬────────────┘            └──────────▲───────────┘
           │ light_lamp(nick, device)           │ reads new lamps
           ▼                                    │ (checks every 1s)
 ┌────────────────────────────────────────────────────────────┐
 │ Supabase (free tier): Postgres table `lamps` + one function │
 └────────────────────────────────────────────────────────────┘
```

- **Hosting: GitHub Pages.** Static files only, free, HTTPS, short clean URL, no Google banner.
- **Backend: Supabase.** GitHub Pages can't store a shared count, so we need a small online database.
  - A single database function hands out lamp numbers one at a time, so two simultaneous taps never get the same lamp.
  - The screen checks for new lamps every second.
  - The free tier easily handles 140 people tapping within a minute.

### Database (Supabase)
- **Table `lamps`:**
  - `id` 1–140, primary key (the lamp number)
  - `nickname` must be 1–6 letters A–Z
  - `device_id` unique (a random id saved on the guest's phone)
  - `created_at`
- **Function `light_lamp(nickname, device_id)`:**
  - Locks so only one tap is handled at a time.
  - If this device already lit a lamp, returns the same lamp.
  - If 140 are lit, returns "full".
  - Otherwise inserts the next number and returns it.
  - Also checks the nickname against a small blocklist of rude words.
- **Security:**
  - Guests can only call `light_lamp` (they can't write to the table directly). Anyone can read the table, which the screen needs.
  - The public "anon" key in the page is designed to be public. These rules are what protect the data.
- **`reset_ceremony()`:** runs only from the Supabase dashboard, never from the pages.
- **Note:** free Supabase projects pause after 7 days without activity. Open the dashboard or run a test the day before the event.

### One lamp per phone
The random `device_id` is saved on the phone (localStorage) and is unique in the database. This stops accidental double taps. Someone could still get around it with another browser, which is acceptable for a party.

---

## 3. Files

```
index.html          Guest page (the QR points here)
screen.html         Big-screen ceremony
css/                guest.css, screen.css
js/config.js        Supabase URL + public key, total lamps, finale text
js/guest.js         Nickname, hold-to-light, motion, send, keepsake
js/screen.js        Scene loop, lamp arrivals, queue, finale
js/scene/           sky, lake, mist, lamp drawing, WELCOME layout
js/audio.js         Generated sounds (no audio files to license)
js/backend.js       Supabase calls + demo/offline mode
supabase/schema.sql Table, function, security rules, reset
tools/simulate.html Fires fake taps (e.g. 140 in 60s) for rehearsal
README.md           Setup + event-day checklist
```

## 4. Technical choices

- **Screen drawn on a canvas** at the window's own size, composed for the 4:3 screen. Everything is drawn in code: lamps, flames, glow, reflections, mist. No emoji or images, so it looks the same on every machine. Aim for a steady 60 fps on a normal laptop.
- **WELCOME layout:**
  - At load, the word is drawn off-screen in a bold serif font, and 140 points are picked evenly along the letter strokes. Each letter gets points according to its size.
  - Each lamp is then matched to a letter point so the total distance travelled is smallest. Lamps glide without crossing paths chaotically.
- **Sound:** generated in the browser (WebAudio), so there are no files to license. Soft night ambience (water, crickets), a chime per lamp with slight pitch variation, deeper bells at milestones, and a swelling chord at the finale. Browsers need one click before playing sound, so the screen opens with a "Begin ceremony" overlay for the operator.
- **QR code:** generated on the screen from the guest URL.
- **Fonts:** Cormorant Garamond for text and Cinzel for the nicknames, from Google Fonts. WELCOME is spelled by the lamps themselves. The guest page loads only what it needs.
- **Guest page weight:** under about 150 KB total, so it loads fast on weak indoor 4G.
- **Operator keys on the screen:**

  | Key | Action |
  |---|---|
  | `F` | Fullscreen |
  | `M` | Mute |
  | `Q` | Show/hide QR |
  | `D` | Demo mode |
  | `Shift+R` | Replay finale (rehearsal only) |

- **Demo / backup mode:** `screen.html?demo` plays the full ceremony with fake nicknames in about 2 minutes, without internet. Useful for rehearsal, and as the fallback if the connection fails on the night.

---

## 5. Build phases

1. **Foundation:** Supabase schema + function, `backend.js`, simulator. Prove that 140 rapid taps give exactly lamps 1–140, with no duplicates and no gaps.
2. **The lake:** sky, moon, shoreline, water reflections, mist, fireflies, darkness lifting with the count.
3. **Lamps:** lamp and flame drawing, arrival animation, nickname glow, queue, reload restoring state.
4. **Finale:** wordless build-up, WELCOME formation, mist clearing.
5. **Guest page:** nickname input, hold-to-light, motion-reactive flame, send with retries, keepsake card.
6. **Polish:** sound, QR panel, milestones, operator keys, demo mode, performance check.
7. **Deploy + rehearse:**
   - Publish to GitHub Pages.
   - Test on real iPhones and Androids on mobile data.
   - Run the simulator for a 140-tap burst.
   - Run the full ceremony on the actual laptop and projector.
   - Reset.

## 6. Decisions (confirmed)

- Nicknames: **up to 6 letters**, A–Z, **duplicates allowed**, with a small blocklist of rude words.
- Backend: **Supabase**. Hosting: **GitHub Pages**.
- **No words on the big screen**: no counter, no subtitle, no logo, no countdown text. Only the nicknames, which glow briefly, and WELCOME at the end. The build-up for the last lamps is wordless: a heartbeat sound and a pulsing moon.
- The screen is **8×6 (4:3)**, so the scene is composed for 4:3 (it still adapts to other shapes).
- WELCOME lamps keep floating: each has a small random offset, its own drift, and a gentle swell rolls through the word.
- The laptop has speakers and internet. Guests use mobile data.
- Event: **5 November**.

## 7. Status

- [x] Database script, tested with 200 simultaneous taps (exactly 140 unique lamps)
- [x] Big screen: lake, lamps, arrivals, nicknames, milestones, heartbeat, WELCOME finale, sound, QR, operator keys, demo mode
- [x] Guest page: nickname, hold to light, swipe up, motion-reactive flame, keepsake with mini map, retries
- [x] Rehearsal simulator
- [x] Halloween scene: spooky trees, owl, spider, jack-o'-lanterns, haunted house, witch, bats, ghost, wisps, wind gusts
- [x] Shake mirroring: a guest's shake makes their own lamp flutter on the big screen
- [x] Hidden "light another lamp" on the phone (tap the moon 5×, or `?new`)
- [x] Guest count set in Supabase (`settings.total_lamps`), no code change; tea-lights complete WELCOME for small groups
- [ ] Owner: re-run `supabase/schema.sql` (adds the settings table)
- [ ] Owner: run `supabase/schema.sql` in the Supabase SQL Editor
- [ ] Owner: enable GitHub Pages
- [ ] Rehearse with real phones on mobile data, on the real laptop and projector
