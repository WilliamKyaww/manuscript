// Applies the saved appearance before the first paint, so there is no flash of the wrong look:
// the theme, the colour palette and Simplified UI (on unless turned off). Keep the keys and values in
// sync with app/theme/theme.ts and app/theme/appearance.ts.
// Loaded as a separate file because the Content Security Policy forbids inline scripts.
(() => {
  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      // Storage unavailable (private mode): the defaults apply.
      return null;
    }
  };
  const root = document.documentElement;

  const stored = read('skb.theme');
  const preference = stored === 'light' || stored === 'dark' ? stored : 'system';
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';

  const palettes = ['manuscript', 'graphite', 'sand', 'slate', 'sage', 'iris'];
  const palette = read('skb.palette');
  root.dataset.palette = palettes.includes(palette) ? palette : 'manuscript';

  root.dataset.ui = read('skb.ui') === 'standard' ? 'standard' : 'simplified';
})();
