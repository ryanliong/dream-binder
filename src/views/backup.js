import { h, emptyState } from '../ui.js';

export async function backupView(root) {
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'Backup & Sync')), emptyState('Coming in step 6', 'This part of the binder is still being built.'));
}
