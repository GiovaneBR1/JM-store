// Tema da loja e da gestão: automático (segue o aparelho), claro ou escuro.
// A escolha fica no navegador ("jm-theme") e vale para as duas páginas.
(function () {
  'use strict';
  var THEMES = {
    auto: ['Tema automático: segue o seu aparelho', '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none"/></svg>'],
    light: ['Tema claro', '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>'],
    dark: ['Tema escuro', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>']
  };
  var NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
  function get() { try { var t = localStorage.getItem('jm-theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch (e) { return 'auto'; } }
  function set(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    try { if (t === 'auto') localStorage.removeItem('jm-theme'); else localStorage.setItem('jm-theme', t); } catch (e) { /* vale só nesta visita */ }
    var btn = document.getElementById('theme-btn');
    if (!btn) return;
    btn.innerHTML = THEMES[t][1];
    btn.setAttribute('aria-label', THEMES[t][0] + '. Toque para trocar.');
    btn.title = THEMES[t][0];
  }
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  var btn = document.getElementById('theme-btn');
  if (btn) btn.addEventListener('click', function () { var t = NEXT[get()]; set(t); toast(THEMES[t][0]); });
  set(get());
})();
