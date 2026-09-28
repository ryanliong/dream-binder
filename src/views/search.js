import { h, emptyState } from '../ui.js';

export async function searchView(root) {
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'Search')), emptyState('Coming in step 5', 'This part of the binder is still being built.'));
}
