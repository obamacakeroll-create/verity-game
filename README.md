# VERITY

> *hello i am verity — your personal helper friend. ask me anything. i know everything.*

A first-person psychological horror game for the browser, built with **three.js** and the **Web Audio API**.

You move into a cheap rental at 1107 Wren Street at 2:57 AM. At the end of the hallway, under the only working bulb, is a cardboard box you didn't pack. It says **VERITY** on it. When you get close, it opens by itself.

Verity is a smiling yellow ball that floats beside you and answers anything you type. Every question costs a little of its sanity, and being rude costs a lot. As its **insanity** rises, its face changes, the house loops and rots around you, and eventually Verity shows you what it really is.

The house is a looping P.T.-style hallway. Everything in it is generated in the browser at load time: the textures, lighting, music, sound effects and Verity's voice. There are no image or audio assets to download.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the build on http://localhost:4173
npm test           # unit tests for Verity's brain
```

The production build is fully static, so `dist/` can be hosted anywhere (GitHub Pages, itch.io, Netlify…).

A GitHub Pages workflow is included in `.github/workflows/deploy.yml`. To use it, enable **Settings → Pages → Source: GitHub Actions** on the repository.

Play in a desktop browser with a mouse and keyboard, headphones and the lights off. Chrome, Edge and Firefox are recommended.

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

## Tech overview

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

## Credits

An unofficial fan game inspired by ThatMob's *Something* ARG and the "Verity" meme. The hallway is a love letter to *P.T.* (2014).
