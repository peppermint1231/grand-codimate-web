import type { Photo } from "./model";

export function movePhotoIds(ids: string[], from: string, to: string) {
  const next = [...ids],
    a = next.indexOf(from),
    b = next.indexOf(to);
  if (a < 0 || b < 0 || a === b) return next;
  next.splice(b, 0, next.splice(a, 1)[0]);
  return next;
}

// Reorder visible photos in their existing slots; preserve hidden photos and data.
export function applyPhotoOrder(photos: Photo[], ids: string[]) {
  const byId = new Map(photos.map((p) => [p.id, p]));
  if (new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id)))
    return photos;
  const visible = new Set(ids);
  let index = 0;
  return photos.map((p) => (visible.has(p.id) ? byId.get(ids[index++])! : p));
}
