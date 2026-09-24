import './ui/styles.css';
import { Game } from './core/Game.js';

// Boot: show a loading line while the procedural textures are painted,
// then the content warning (the first click unlocks audio).
const loading = document.createElement('div');
loading.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000;color:rgba(231,225,211,.5);font:italic 20px "Cormorant Garamond",Georgia,serif;letter-spacing:.2em;z-index:10';
loading.textContent = 'unpacking…';
document.body.appendChild(loading);

const start = async () => {
  try { await document.fonts?.ready; } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 30));
  const game = new Game();
  window.__verity = game;
  game.build();
  loading.remove();
  game.menus.show('warning');
  if (game.debug) {
    // ?debug skips the warning for automated testing
    const params = new URLSearchParams(location.search);
    game.audio.init();
    if (params.has('chapter')) {
      game.startChapter(parseInt(params.get('chapter'), 10), {});
    } else game.enterMenu();
  }
};
start();
