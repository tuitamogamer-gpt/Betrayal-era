// Keep a readable recovery screen if a browser cannot load the game bundle.
import('./main.js').catch(error => {
  console.error('The adventure could not start.', error);
  const screen = document.createElement('div');
  screen.id = 'boot-error';
  screen.style.cssText = 'min-height:100dvh;display:grid;place-content:center;text-align:center;gap:18px;padding:24px;box-sizing:border-box;font-family:system-ui,sans-serif';
  screen.innerHTML = '<h1 style="font:26px Georgia,serif;margin:0">Your adventure could not load</h1><p style="max-width:480px;line-height:1.8;color:#b5bda7">Check that the game server is still running, then reload. Your saved adventure remains in this browser.</p><button style="justify-self:center;min-height:44px;padding:12px 24px;background:#c8b47c;color:#18221a;border:0;border-radius:4px;font:inherit">Reload the game</button>';
  screen.querySelector('button').addEventListener('click', () => location.reload());
  document.querySelector('#app').replaceChildren(screen);
});
