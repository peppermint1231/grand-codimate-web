/** Automatic comparison columns; portrait four-up is explicitly horizontal. */
export function photoColumnCount(
  count: number,
  portrait: boolean,
  manual?: number,
) {
  if (manual)
    return Math.max(1, Math.min(4, Math.round(manual), Math.max(1, count)));
  if (count <= 3) return Math.max(1, count);
  if (count === 4) return portrait ? 4 : 2;
  return count <= 6 ? 3 : 4;
}
export const viewerHeightBounds = { min: 360, max: 1600 };
export const clampViewerHeight = (value: number) =>
  Math.max(
    viewerHeightBounds.min,
    Math.min(viewerHeightBounds.max, Math.round(value)),
  );
