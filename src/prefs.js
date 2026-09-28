// Small persisted UI preferences.

function read(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export const getLang = () => (read('db.lang', 'en') === 'ja' ? 'ja' : 'en');
export const setLang = (lang) => write('db.lang', lang);

export const THEMES = ['auto', 'light', 'dark'];
export const getTheme = () => {
  const t = read('db.theme', 'auto');
  return THEMES.includes(t) ? t : 'auto';
};
export function setTheme(theme) {
  write('db.theme', theme);
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export const getPref = (key, fallback) => read(`db.pref.${key}`, fallback);
export const setPref = (key, value) => write(`db.pref.${key}`, value);
