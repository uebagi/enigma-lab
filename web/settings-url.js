'use strict';
// Settings are URL data, never executable code. Each page validates its payload.
window.SettingsURL = {
  read(page) {
    const raw = new URL(location.href).searchParams.get('settings');
    if (raw === null) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || data.page !== page) throw new Error('Unsupported settings link.');
    return data;
  },
  write(data) {
    const url = new URL(location.href);
    url.searchParams.set('settings', JSON.stringify(data));
    if (url.href !== location.href) history.replaceState(null, '', url);
    return url.href;
  },
  setupCopy(getSettings) {
    const button = document.getElementById('share-settings');
    button.addEventListener('click', async () => {
      const url = this.write(getSettings());
      try {
        await navigator.clipboard.writeText(url);
        button.textContent = 'Link copied';
        setTimeout(() => button.textContent = 'Copy share link', 1500);
      } catch {
        const field = document.getElementById('share-url');
        field.hidden = false; field.value = url; field.focus({preventScroll:true}); field.select();
      }
    });
  },
};
