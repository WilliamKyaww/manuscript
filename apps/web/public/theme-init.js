// Applies the saved theme before the first paint, so there is no flash of the wrong theme.
// Loaded as a separate file because the Content Security Policy forbids inline scripts.
(() => {
  let preference = 'system';
  try {
    const stored = localStorage.getItem('skb.theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') preference = stored;
  } catch {
    // Storage unavailable (private mode): fall back to the system setting.
  }
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
