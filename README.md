# Lake of Lights

A digital lamp-lighting ceremony for 140 guests, set on a haunted Halloween lake. Guests scan a QR code, choose a nickname of up to 4 letters, then press and hold a clay lamp on their phone to light it and swipe the flame up. It arrives on the big screen as a floating lamp on a misty, moonlit lake, and the guest's nickname glows briefly above it. When the 140th lamp is lit, all the lamps drift together to spell **WELCOME**.

- **Guest page:** `index.html`. The QR code points here.
- **Big screen:** `screen.html`.
- **Backend:** Supabase (a free online database), which hands out lamp numbers one at a time.

### What's on the big screen
- **Scene:** a misty, moonlit lake framed by two gnarled, claw-branched trees. One branch crosses the moon.
- **Lights:** jack-o'-lanterns glow on the near bank, smaller ones dot the far shore, and a haunted house there has flickering windows.
- **Creatures:**
  - an owl with blinking eyes and a spider that slowly lowers itself on its thread
  - bat flocks, plus a witch (with her cat) crossing the moon halfway through and now and then
  - a faint ghost drifting through the mist, and will-o'-the-wisps over the water that fade as the lake fills with light
- **Wind:** a gust every half-minute or so bends every flame and blows a few leaves across.
- **Shake mirroring:** when a guest shakes their phone, *their* lamp on the big screen flutters and sparks, and their nickname glows again.

---

## One-time setup

### 1. Supabase (5 minutes)
1. Open your project at [supabase.com](https://supabase.com) → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql), then click **Run**. It should say "Success". Running it again is safe.
3. The project URL and publishable key are already in [`js/config.js`](js/config.js).

**Never put the secret key (`sb_secret_...`) or the `service_role` key in this repo.** The publishable key is designed to be public. The database rules only let guests light a lamp through the `light_lamp` function, so nobody can edit or delete lamps directly.

### 2. GitHub Pages
1. In the GitHub repo, open **Settings → Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, choose the branch that holds this code (e.g. `main`) and the `/ (root)` folder, then click **Save**.
3. After a minute or two the site is live at:
   - Guest page: `https://arunatelshan.github.io/oil-lamp/`
   - Big screen: `https://arunatelshan.github.io/oil-lamp/screen.html`

The QR code on the big screen is generated automatically and points to the guest page.

---

## Rehearsal (do this before 5 November)

1. **Reset:** run `select public.reset_ceremony();` in the Supabase SQL Editor.
2. **Laptop check:** open the screen link in Chrome on the event laptop, click once to start, and press `F` for fullscreen.
3. **Phone test:** scan the QR with 3–5 real phones (iPhone and Android) **on mobile data**. Each one should:
   - enter a nickname,
   - press and hold to light the lamp,
   - swipe up,
   - see its lamp arrive on the screen with the nickname.

   Try shaking each phone on the keepsake card: the flame should sway. On iPhone, the phone asks for "Motion & Orientation" access. Tap **Allow**. If the card says "Tap here, then gently shake", tap that line first.
   While shaking, the guest's lamp on the big screen should flutter. Press `H` on the screen: "Phone shakes: connected" means the live link works.
   If shaking does nothing on a phone, open `https://arunatelshan.github.io/oil-lamp/?debug` on it. Green text at the top shows whether motion readings arrive.
4. **Burst test (optional):** open `https://arunatelshan.github.io/oil-lamp/tools/simulate.html` on the laptop. It fires 140 fake guests at the live database and reports whether every lamp number was unique.
   - Watch the screen do the full WELCOME finale.
   - Then **reset** (step 1) and reload the screen.
5. **Sound:** check the laptop speakers. You should hear soft water and crickets, a chime per lamp, and the finale swell.
6. **Keep Supabase awake:** free Supabase projects pause after 7 days without activity. Do a quick test within a few days of the event.

### Hidden: light another lamp from the same phone
A phone normally lights only one lamp. For testing, tap the **moon** on the phone page **5 times quickly**, or open `https://arunatelshan.github.io/oil-lamp/?new`. The phone forgets its lamp and goes back to "Name your light".

### If shake mirroring doesn't work
- Open the guest page with `?debug` and shake. The last line shows `to screen: sent … failed … last …`. `last 202` means the message was accepted.
- If the screen's operator panel (`H`) says "refused", check Supabase → **Project Settings → Realtime** and make sure public channels are allowed ("Allow public access" / private-only mode turned off).
- Everything else keeps working even if this link is down.

### Testing without Supabase
- `screen.html?demo` plays the whole ceremony with fake guests, with no internet needed. This is also your **backup if the connection fails on the night**. Use `screen.html?demo=fast` for a quicker run.
- `screen.html?local` together with `index.html?local` (same browser, two tabs) lets you test the real guest flow on one computer.

---

## On the night

1. A few hours before: reset the database (`select public.reset_ceremony();`).
2. Connect the laptop to the internet and the projector. Open the screen link, click once, and press `F`.
3. Guests scan the QR code in the corner of the screen. No words appear on the big screen apart from the nicknames and, at the end, WELCOME.

### Operator keys (big screen)

| Key | What it does |
|---|---|
| `F` | Fullscreen on/off |
| `M` | Mute/unmute |
| `Q` | Show/hide the QR code |
| `H` | Operator panel (lamp count, mode, guest link). Press again to hide |
| `Shift+R` | Replay the WELCOME finale (only after all 140 are lit) |
| `Space` / `D` | Demo mode only: add a lamp / pause or resume |

A small red dot in the top-left corner means the screen has lost its connection. It keeps retrying by itself, and nothing is lost: the database holds every lamp. If the screen is reloaded mid-ceremony, all lamps already lit reappear in their places.

---

## How it works

- **Lamp numbers:** each guest tap calls `light_lamp(nickname, device_id)` in Supabase.
  - The function lets only one tap through at a time, so two guests tapping together always get different lamps.
  - It refuses taps after 140, and returns the same lamp if the same phone asks twice.
  - Tested with 200 simultaneous taps: exactly 140 unique lamps, and the rest were told "full".
- **Shakes:** phones send tiny messages through Supabase Realtime (at most 2 per second per phone, only while shaking), and the screen listens on a live connection. This doesn't touch the database.
- **Screen updates:** the screen checks for new lamps every second. If several lamps arrive at once, they float in one after another so every guest gets a moment.
- **Lamp positions:** the 140 spots and their order are fixed (`LAYOUT_SEED` in `js/config.js`), so the phone's mini map shows each guest where their lamp floats.
- **Drawing:** everything is drawn in code on a canvas, with no images. The scene adapts to any screen shape and is designed for the 8×6 (4:3) screen.
- **Sound:** all sound is generated live in the browser, so there are no audio files.

### Files

```
index.html, css/guest.css, js/guest.js   Guest phone page
screen.html, css/screen.css, js/screen.js Big screen
js/scene.js       Sky, moon, far shore, water, mist, fireflies
js/halloween.js   Spooky trees, owl, spider, pumpkins, haunted house,
                  witch, bats, ghost, wisps, wind and leaves
js/lamp-art.js    Clay lamp + flame drawing (shared)
js/layout.js      Lamp positions, WELCOME letter shapes (shared)
js/audio.js       Generated sound
js/backend.js     Supabase / local / demo connection, phone shakes
js/config.js      Settings (Supabase URL + publishable key, lamp count)
supabase/schema.sql  Database setup
tools/simulate.html  Rehearsal tool: fake guests
```
