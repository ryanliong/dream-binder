// Map TCGdex API card objects into the shape the UI and album use.

/** Full card from /cards/{id}. */
export function fromApiCard(c, lang) {
  return {
    lang,
    id: c.id,
    name: c.name,
    number: c.localId,
    image: c.image || '',
    rarity: c.rarity || '',
    setId: c.set?.id || '',
    setName: c.set?.name || '',
  };
}

/** Brief card from a set's card list or a search result. */
export function fromBrief(c, lang, set) {
  return {
    lang,
    id: c.id,
    name: c.name,
    number: c.localId,
    image: c.image || '',
    rarity: '',
    setId: set?.id || setIdFromCardId(c.id, c.localId),
    setName: set?.name || '',
  };
}

/** "sv08-238" + "238" → "sv08". Card IDs are "{setId}-{localId}". */
export function setIdFromCardId(id, localId) {
  const suffix = `-${localId}`;
  return id.endsWith(suffix) ? id.slice(0, -suffix.length) : id.replace(/-[^-]+$/, '');
}
