import { h, emptyState } from '../ui.js';

export async function cardView(root) {
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'Card detail')), emptyState('Coming in step 3', 'This part of the binder is still being built.'));
}
