import * as album from '../album.js';
import * as sync from '../sync.js';
import { h, icon, fmtDate, toast, confirmButton } from '../ui.js';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Dream%20Binder%20sync';

export async function backupView(root, ctx) {
  const syncPanel = h('section', { class: 'panel' });
  const exportPanel = h('section', { class: 'panel' });
  const importResult = h('div', { class: 'summary', 'aria-live': 'polite' });
  const dangerPanel = h('section', { class: 'panel' });

  root.append(
    h('div', { class: 'page-head' },
      h('h1', null, 'Backup & Sync'),
      h('p', { class: 'muted' }, 'Your album is stored in this browser’s local storage — there’s no Dream Binder server. Sync or back it up so it isn’t lost.')),
    h('div', { class: 'stack' }, syncPanel, exportPanel, importPanel(importResult), dangerPanel),
  );

  // ---- Sync ----
  function paintSync() {
    const s = sync.status();
    if (!s.connected) {
      const input = h('input', { class: 'input', id: 'token', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'ghp_…' });
      const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Connect');
      const err = h('p', { class: 'note', role: 'alert', hidden: true });
      const form = h('form', { class: 'field' },
        h('label', { for: 'token' }, 'GitHub token'),
        h('div', { class: 'search-row' }, input, btn),
        err);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        btn.disabled = true;
        btn.textContent = 'Connecting…';
        err.hidden = true;
        try {
          const { created, login } = await sync.connect(input.value);
          toast(created ? `Connected as @${login} — created your sync gist` : `Connected as @${login} — synced with your existing gist`);
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = 'Connect';
        }
      });
      syncPanel.replaceChildren(
        h('h2', null, 'Sync across devices'),
        h('div', { class: 'sync-status' }, h('span', { class: 'sync-dot' }), 'Not connected'),
        h('p', null, 'Stores your album in a private (secret) Gist on your own GitHub account, so your phone and laptop stay in sync. Do this once on each device.'),
        h('ol', { class: 'steps' },
          h('li', null, h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener' }, 'Create a GitHub token'), ' — the “gist” scope is pre-ticked; nothing else is needed.'),
          h('li', null, 'Pick an expiry (e.g. 1 year), then Generate token and copy it.'),
          h('li', null, 'Paste it below. On another device, you can reuse the same token.'),
        ),
        form,
        h('p', { class: 'fx-note' }, 'The token is saved only in this browser and only sent to api.github.com. It can read/write your gists and nothing else. Revoke it any time in GitHub → Settings → Developer settings → Tokens.'),
      );
      return;
    }
    const dotCls = s.syncing ? 'sync-dot' : s.lastError ? 'sync-dot err' : 'sync-dot on';
    const line = s.syncing ? 'Syncing…'
      : s.lastError ? `Sync problem: ${s.lastError}`
      : s.lastSyncAt ? `Synced ${fmtDate(s.lastSyncAt, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
      : 'Connected';
    syncPanel.replaceChildren(
      h('h2', null, 'Sync across devices'),
      h('div', { class: 'sync-status' }, h('span', { class: dotCls }), line),
      h('p', null, 'Connected as ',
        h('a', { href: `https://github.com/${s.login}`, target: '_blank', rel: 'noopener' }, `@${s.login}`),
        '. Album saved to ',
        h('a', { href: `https://gist.github.com/${s.login}/${s.gistId}`, target: '_blank', rel: 'noopener' }, 'your private gist'),
        '. Syncs automatically when you open the app and a few seconds after each change.'),
      s.lastError && /token/i.test(s.lastError) ? h('p', { class: 'note' }, 'Disconnect and connect again with a new token.') : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', type: 'button', disabled: s.syncing, onclick: () => sync.syncNow() }, icon('retry', 18), 'Sync now'),
        confirmButton('Disconnect', 'Tap again to disconnect', () => { sync.disconnect(); toast('Disconnected — your album stays on this device'); }),
      ),
    );
  }
  paintSync();
  ctx.onCleanup(sync.onStatus(paintSync));

  // ---- Export ----
  function paintExport() {
    const n = album.count();
    exportPanel.replaceChildren(
      h('h2', null, 'Export backup'),
      h('p', null, 'Download your album as a JSON file. Keep it in iCloud Drive, Google Drive or email it to yourself.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', type: 'button', disabled: !n, onclick: exportFile }, `Export ${n} card${n === 1 ? '' : 's'}`)),
    );
  }

  // ---- Clear ----
  function paintDanger() {
    const n = album.count();
    dangerPanel.replaceChildren(
      h('h2', null, 'Clear album'),
      h('p', null, sync.status().connected
        ? 'Removes every card from this album — including on your other synced devices. Export first if you might want them back.'
        : 'Removes every card from this browser. Export first if you might want them back.'),
      h('div', { class: 'btn-row' },
        n ? confirmButton(`Clear ${n} card${n === 1 ? '' : 's'}`, 'Tap again to clear everything', () => { album.clear(); toast('Album cleared'); })
          : h('button', { class: 'btn', type: 'button', disabled: true }, 'Album is empty')),
    );
  }

  paintExport();
  paintDanger();
  ctx.onCleanup(album.subscribe(() => { paintExport(); paintDanger(); }));
}

function exportFile() {
  const data = album.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `dream-binder-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(`Exported ${data.entries.length} cards`);
}

function importPanel(result) {
  const file = h('input', { type: 'file', accept: 'application/json,.json', id: 'import-file', class: 'visually-hidden' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    let summary;
    try {
      summary = album.importData(JSON.parse(await f.text()));
    } catch (err) {
      result.replaceChildren(h('p', { class: 'note', role: 'alert' }, err instanceof SyntaxError ? 'That file isn’t valid JSON.' : err.message));
      return;
    }
    const { added, updated, unchanged, invalid } = summary;
    const list = (names) => h('ul', null, names.slice(0, 12).map((n) => h('li', null, n)), names.length > 12 ? h('li', null, `…and ${names.length - 12} more`) : null);
    result.replaceChildren(
      h('div', { class: 'banner ok', style: 'display:block' },
        h('strong', null, `Imported from ${f.name}`),
        h('p', null, [
          `${added.length} added`,
          `${updated.length} updated`,
          `${unchanged} already in album`,
          invalid ? `${invalid} skipped (invalid)` : null,
        ].filter(Boolean).join(' · ')),
        added.length ? h('div', null, h('span', { class: 'muted' }, 'Added:'), list(added)) : null,
        updated.length ? h('div', null, h('span', { class: 'muted' }, 'Updated status/notes:'), list(updated)) : null,
      ),
    );
    toast(added.length ? `Added ${added.length} card${added.length === 1 ? '' : 's'}` : 'Nothing new to add');
  });
  return h('section', { class: 'panel' },
    h('h2', null, 'Import backup'),
    h('p', null, 'Merges a backup into your album — nothing already here is deleted. Cards you don’t have are added; for cards you do, the newer status and notes win.'),
    h('div', { class: 'btn-row' }, file, h('label', { class: 'btn', for: 'import-file', tabindex: '0', role: 'button',
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } }, 'Choose file…')),
    result,
  );
}
