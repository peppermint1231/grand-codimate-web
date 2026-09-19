import type { Annotation } from "./model";
export function rotatedSize(width: number, height: number, degrees: number) {
  const r = (degrees * Math.PI) / 180,
    c = Math.abs(Math.cos(r)),
    s = Math.abs(Math.sin(r));
  return { width: width * c + height * s, height: width * s + height * c };
}
export function annotationHit(
  a: Annotation,
  point: { x: number; y: number },
  width: number,
  height: number,
  tolerance: number,
) {
  const ps = a.points.map((p) => ({ x: p.x * width, y: p.y * height }));
  if (!ps.length) return false;
  const p = { x: point.x * width, y: point.y * height },
    first = ps[0],
    last = ps.at(-1)!;
  const segment = (u: typeof p, v: typeof p) => {
    const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2;
    const t = d
      ? Math.max(
          0,
          Math.min(
            1,
            ((p.x - u.x) * (v.x - u.x) + (p.y - u.y) * (v.y - u.y)) / d,
          ),
        )
      : 0;
    return (
      Math.hypot(p.x - u.x - t * (v.x - u.x), p.y - u.y - t * (v.y - u.y)) <=
      tolerance
    );
  };
  if (a.tool === "text")
    return (
      p.x >= first.x - tolerance &&
      p.x <= first.x + Math.max(30, (a.text?.length || 1) * 20) + tolerance &&
      Math.abs(p.y - first.y) < 40 + tolerance
    );
  if (a.tool === "mosaic")
    return (
      p.x >= Math.min(first.x, last.x) - tolerance &&
      p.x <= Math.max(first.x, last.x) + tolerance &&
      p.y >= Math.min(first.y, last.y) - tolerance &&
      p.y <= Math.max(first.y, last.y) + tolerance
    );
  if (a.tool === "rect")
    return (
      segment(first, { x: last.x, y: first.y }) ||
      segment({ x: last.x, y: first.y }, last) ||
      segment(last, { x: first.x, y: last.y }) ||
      segment({ x: first.x, y: last.y }, first)
    );
  if (a.tool === "ellipse") {
    const rx = Math.abs(last.x - first.x) / 2,
      ry = Math.abs(last.y - first.y) / 2;
    if (!rx || !ry) return segment(first, last);
    return (
      Math.abs(
        Math.hypot(
          (p.x - (first.x + last.x) / 2) / rx,
          (p.y - (first.y + last.y) / 2) / ry,
        ) - 1,
      ) *
        Math.min(rx, ry) <=
      tolerance
    );
  }
  return ps.length === 1
    ? segment(first, first)
    : ps.slice(1).some((q, i) => segment(ps[i], q));
}
