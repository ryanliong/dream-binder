import { h, emptyState } from '../ui.js';

export async function albumView(root) {
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'My Album')), emptyState('Coming in step 4', 'This part of the binder is still being built.'));
}
