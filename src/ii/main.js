import '../ui/styles.css';
import './ui/styles2.css';

// VERITY II boot: paint every texture on the GPU while a loading line
// animates, then show the content warning (the first click unlocks audio).
const params = new URLSearchParams(location.search);

async function boot() {
  const loading = document.createElement('div');
  loading.id = 'boot';
  loading.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;gap:18px;align-items:center;justify-content:center;background:#000;color:rgba(231,225,211,.55);font:italic 20px "Cormorant Garamond",Georgia,serif;letter-spacing:.2em;z-index:50';
  loading.innerHTML = '<div class="l">unpacking…</div><div style="width:220px;height:2px;background:rgba(255,255,255,.08)"><i style="display:block;height:100%;width:0;background:#f2c21a;transition:width .2s"></i></div>';
  document.body.appendChild(loading);
  const bar = loading.querySelector('i'), label = loading.querySelector('.l');
  try { await document.fonts?.ready; } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 30));
  const { Game2 } = await import('./core/Game2.js');
  const game = new Game2();
  window.__verity2 = game;
  try {
    await game.build((p, l) => { bar.style.width = `${Math.round(p * 100)}%`; if (l) label.textContent = l + '…'; });
  } catch (e) {
    console.error(e);
    label.textContent = 'Your browser could not start the renderer (WebGL 2 required).';
    return;
  }
  loading.remove();
  if (game.debug) {
    game.audio.init();
    if (params.has('chapter')) game.startChapter(parseInt(params.get('chapter'), 10), {});
    else if (params.has('newgame')) { game.ui.fade(1, 0.01); game.newGame({}); }
    else game.enterMenu();
    return;
  }
  game.menus.show('warning');
}

if (params.has('lookdev')) import('./dev/lookdev.js').then((m) => m.lookdev());
else boot();
