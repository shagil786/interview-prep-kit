export interface ItemMeta {
  origin: "generated" | "user";
  edited_by_user: boolean;
  pinned: boolean;
}

export interface Overlay {
  brief?: ItemMeta;
  questions: Record<string, ItemMeta>;
  flashcards: Record<string, ItemMeta>;
}

export function metaFor(origin: "generated" | "user" = "generated"): ItemMeta {
  return { origin, edited_by_user: false, pinned: false };
}

export function emptyOverlay(): Overlay {
  return { questions: {}, flashcards: {} };
}

/** Generated + untouched + unpinned items are the only ones regeneration may replace. */
export function isReplaceable(meta: ItemMeta | undefined): boolean {
  return meta !== undefined && meta.origin === "generated" && !meta.edited_by_user && !meta.pinned;
}

export function ensureQuestion(overlay: Overlay, id: string, origin: "generated" | "user" = "generated"): ItemMeta {
  const existing = overlay.questions[id];
  if (existing) return existing;
  const meta = metaFor(origin);
  overlay.questions[id] = meta;
  return meta;
}

export function ensureFlashcard(overlay: Overlay, id: string, origin: "generated" | "user" = "generated"): ItemMeta {
  const existing = overlay.flashcards[id];
  if (existing) return existing;
  const meta = metaFor(origin);
  overlay.flashcards[id] = meta;
  return meta;
}
