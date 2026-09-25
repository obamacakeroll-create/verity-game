# VERITY · VERITY II: RETURNS

> *hello i am verity — your personal helper friend. ask me anything. i know everything.*

Two first-person psychological horror games for the browser, built with **three.js** and the **Web Audio API**. Everything in both — every texture, model, light, sound, note of music and line of Verity's voice — is generated in your browser. There are no image, model or audio files to download.

Open the site and a **game picker** lets you choose:

| | |
| --- | --- |
| **VERITY** (`/verity/`) | The original. A looping P.T.-style hallway in a rental at 1107 Wren Street. |
| **VERITY II: RETURNS** (`/verity-ii/`) | The sequel. The box came back. It has a return address. |

Part two reads part one's save from the same browser, so Verity remembers what you did on Wren Street.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173  (the game picker)
npm run build      # production build in dist/  (three pages)
npm run preview    # serve the build on http://localhost:4173
npm test           # unit tests: both brains, puzzles, navigation
```

The production build is fully static, so `dist/` can be hosted anywhere (GitHub Pages, itch.io, Netlify…).
A GitHub Pages workflow is included in `.github/workflows/deploy.yml`; enable **Settings → Pages → Source: GitHub Actions** to use it.

Play in a desktop browser with headphones and the lights off. Chrome and Edge give the best performance; a dedicated GPU is recommended for part two on High/Ultra.

---

## VERITY II: RETURNS

Three nights after Wren Street, at 2:58 AM, your intercom buzzes. There's a box on your doormat: **VERITY — RETURN TO SENDER**. It's empty except for a note in crayon: *come home*. Then the TV turns itself on.

The return address is **HELPFUL FRIENDS Co., Unit 9, Kessler Industrial Park** — the derelict factory where every Verity was printed. The printers never stopped. Nobody told them to.

### Story

A prologue and five chapters, around 60–90 minutes:

0. **DELIVERY** — your apartment in the rain, a 1996 TV commercial, and a familiar face on the screen. Then the drive.
1. **RECEPTION** — restore power, wake the demo unit in the lobby, find the manager's keycard (the safe code is somebody's birthday).
2. **QUALITY CONTROL** — the print lab. Printed faces that turn when you look away, a breaker board with a power budget, and the *seconds* — half-printed rejects that only move when nobody is watching.
3. **FULFILLMENT** — a warehouse of VERITY boxes, one with your name on it. Route it through the sorter while something tall stalks the aisles.
4. **COLD STORAGE** — frozen corridors, rows of chairs with boxes on their heads, and F-01, the prototype that has never told the truth.
5. **VERITY** — the Core. Ask her anything, one last time.

**Four endings** (RETURNS · RECALL · NOW HIRING · SHIPPED), plus New Game+ and Hard mode. The true ending needs you to find all of Dr. Penrose's tapes, learn a name, stay kind — and say the right thing at the right time.

Collectibles: 5 tapes, 10 documents and 12 tiny Verity figures — some visible only through night vision.

### Controls

| Key / pad | Action |
| --- | --- |
| **W A S D** · left stick | Move |
| **Mouse** · right stick | Look |
| **Shift** · L3 | Run (limited stamina) |
| **C** · B | Crouch |
| **E** · A | Interact · hold for some actions · leave a hiding spot |
| **F** · X | Phone light (the battery drains) |
| **Q** / right mouse · LB | Raise the camcorder (VHS view) |
| **N** · d-pad up | Night vision (drains the camcorder battery) |
| **Mouse wheel** | Camcorder zoom |
| **G** · RB | Throw what you're holding (distract the hunter) |
| **T** / **Enter** · Y | Talk to Verity (type anything) |
| **H** · d-pad down | Ask Verity for a hint (she may lie) |
| **J** · Back | Journal: objective, tapes, documents, figures |
| **Space** · LT | Hold your breath while hiding · hold Space to skip cutscenes |
| **Esc** / **P** · Start | Pause |

All keys can be rebound under Settings → Controls.

### How it plays

- **Verity is back**, with the same offline dialogue engine and insanity bar as part one: questions, prying and rudeness push it up, kindness brings it down, her face changes, her hints start lying, and at 100% she turns into the tall one and hunts you.
- **Hide** in lockers and in big shipping boxes. Hold your breath when it comes close. Talking while hidden gives you away.
- **The seconds** move only when unobserved — keep them in your light, or in a lit room, or in night vision.
- **Sound matters**: footsteps, thrown cans and bottles, alarms and doors all draw the hunter. Throw things to lure it away.
- **Puzzles**: a keypad safe, a breaker board with a load limit, a conveyor sorter, and a valve sequence you can only get by questioning a liar.

### Graphics

Part two's renderer is a custom HDR pipeline aiming at a modern console look, entirely procedural:

- Scene-referred HDR rendering, **AgX** tone mapping and procedurally generated **3D LUT** colour grades that crossfade per room.
- **Ambient occlusion** (half-res, bilateral) plus **ray-traced per-vertex AO** baked at load with a BVH (cached in IndexedDB after the first load).
- **Volumetric lighting**: raymarched fog lit by the flashlight (with its shadow map) and the nearest lamps, with temporal reprojection.
- Physically based **bloom** (mip chain) with lens dirt, auto exposure, camera motion blur, depth of field in cutscenes, SMAA, film grain, chromatic aberration, lens distortion — and a VHS / night-vision camcorder mode.
- **GPU-baked PBR materials** (~30 recipes: plaster, terrazzo, brick, concrete, corrugated and rusted metal, cardboard, printed PLA, skin, frost…) with world-space grime, wet floors with rain ripples, frost, and box-projected reflection probes.
- A procedural **skinned monster** with two-bone IK feet, and a fixed pool of shadowed lights so shaders never recompile.
- Quality presets **Low / Medium / High / Ultra** (auto-detected, override with `?quality=`), dynamic resolution, and individual toggles for AO, volumetrics, motion blur, DOF and bloom.

### Debug URLs

- `?debug` skips the content warning.
- `?debug&chapter=3` jumps to a chapter (0–5). `?debug&newgame` starts the prologue.
- `?lookdev` opens the material/lighting test scene.

---

## VERITY (part one)

You move into a cheap rental at 1107 Wren Street at 2:57 AM. At the end of the hallway, under the only working bulb, is a cardboard box you didn't pack. It says **VERITY** on it. When you get close, it opens by itself.

Verity is a smiling yellow ball that floats beside you and answers anything you type. Every question costs a little of its sanity, and being rude costs a lot. As its **insanity** rises, its face changes, the house loops and rots around you, and eventually Verity shows you what it really is.

The house is a looping P.T.-style hallway. Everything in it is generated in the browser at load time: the textures, lighting, music, sound effects and Verity's voice. There are no image or audio assets to download.

---

## Controls

| Key | Action |
| --- | --- |
| **W A S D** / arrows | Move |
| **Mouse** | Look |
| **Shift** | Run (limited stamina) |
| **C** | Crouch |
| **E** | Interact / pick up / hide / leave hiding spot |
| **F** | Phone flashlight (the battery drains) |
| **T** or **Enter** | Talk to Verity (type anything, press Enter) |
| **Tab** / Enter on an empty line | Close the chat |
| **Space** | Hold your breath while hiding · hold to skip cutscenes |
| **Esc** / **P** | Pause |

Every key can be rebound under Settings → Controls.

## How it plays

- **Talk to Verity.** It really does answer. It does maths, knows capitals and facts, tells you the real time and day, remembers your name and what you asked, gives hints for your current objective, tells jokes, and reacts to how you treat it.
- **The insanity bar.**
  - Every question adds **+3**.
  - Repeating yourself adds **+6**.
  - Prying ("what are you *really*?", "how do I get out?") adds **+8**.
  - Rudeness, insults, swearing, threats and SHOUTING add **+18 to +30**.
  - Kindness and apologies bring it down a little.
- **The faces.** Verity's face changes as the bar rises: smile → wink → blank → disappointed → too-wide laugh → wail → the grin.
- **Its hints change too.** When it gets angry enough, it starts lying.
- **At 100%, it transforms and hunts you.**
  - Break line of sight, hide in the closet or the wardrobe, and **hold your breath** when it comes close.
  - If it saw you hide, it knows where you are.
  - Survive long enough and it goes back to being a ball. It says it's sorry, and the house gets worse.
- **Six chapters:** Arrival · The Helper · Something Is Knocking · Three Days · Best Friends · Verity.
  - The hallway loops, and each loop is darker and more wrong than the last.
  - Collectibles: 6 notes, 3 cassette tapes (one is well hidden) and a secret name to ask about.
- **Four endings** plus New Game+ (Verity remembers you) and Hard mode.
  - Some endings need you to be kind.
  - Some need you to listen to Marcus.

## The "hello I am Verity" voice clip

The famous meme clip is copyrighted audio from ThatMob's *Something* series, so it is **not** bundled with the game. By default, Verity's voice engine speaks the line itself.

If you have the clip, save it as:

```
public/audio/verity_intro.mp3
```

The opening cutscene will then play it automatically when Verity comes out of the box.

## Verity's voice

Settings → Audio → **Voice engine**:

- **Speech (browser voice)** uses your browser's speech synthesis, pitched and slowed as Verity deteriorates. Once it turns, a distorted "undervoice" growls underneath. You can pick the voice.
- **Synthesised babble** is a formant-synth voice made entirely with Web Audio.

## Tech overview (part one)

```
src/
  core/      Game loop & state, input, settings, save data, 2D collision
  render/    Renderer, post-processing (bloom, grain, vignette, chromatic
             aberration, insanity warp), procedural canvas textures
  world/     House geometry (static-batched), doors, props, lighting
  entities/  Player, Verity (ball + canvas face), the monster (procedural
             rig + animation), the cardboard box
  ai/        VerityBrain (offline dialogue engine), lexicon, knowledge,
             MonsterAI (A* nav graph, chase/hunt/search, hiding checks)
  audio/     Web Audio engine, synthesised SFX, generative music, voice
  story/     Chapters, cutscene director, ambient scare events, endings
  ui/        HUD, chat, subtitles, menus, settings
tests/       Vitest tests for the dialogue engine
```

- **Verity's brain** (`src/ai/VerityBrain.js`) runs fully offline, with no API keys or network. Each message goes through these steps:
  1. Normalise the text.
  2. Detect rudeness (lexicon, leetspeak, negation, caps and threat patterns).
  3. Match the intent.
  4. Pick an answer by stage (sweet → odd → dark → hostile).
  5. Apply the insanity change.
- **Cutscenes** are async scripts run on game time by `CutsceneDirector`. Holding Space fast-forwards any scene to its end state.
- Add `?debug` to the URL to skip the content warning. `?debug&chapter=3` jumps straight to a chapter.


Part two lives in `src/ii/` (render pipeline, world builder and levels, entities, the sequel's brain profile, story) and reuses part one's input, collision, dialogue core (`src/ai/BrainCore.js`), cutscene director, audio engine and UI.

## Credits

An unofficial fan game inspired by ThatMob's *Something* ARG and the "Verity" meme. Part one's hallway is a love letter to *P.T.* (2014).
