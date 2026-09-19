import type { Annotation, Photo } from "./model";
export const annotationFonts = {
  sans: { label: "고딕", family: "Codimate, sans-serif", load: "Codimate" },
  serif: {
    label: "고운 명조",
    family: "CodimateSerif, serif",
    load: "CodimateSerif",
  },
  mono: { label: "고정폭", family: "monospace", load: "monospace" },
  gaegu: {
    label: "개구 손글씨",
    family: "CodimateGaegu, sans-serif",
    load: "CodimateGaegu",
  },
  jua: {
    label: "주아 둥근체",
    family: "CodimateJua, sans-serif",
    load: "CodimateJua",
  },
  pen: {
    label: "나눔 펜글씨",
    family: "CodimatePen, sans-serif",
    load: "CodimatePen",
  },
};
export const emojiFont =
  '"Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
export const stampUrl = (text: string) =>
  `/stamps/${Array.from(text)
    .filter((c) => c.codePointAt(0) !== 0xfe0f)
    .map((c) => c.codePointAt(0)!.toString(16))
    .join("_")}.svg`;
const stampImages = new Map<string, HTMLImageElement>();
const pendingStamps = new Map<string, Promise<void>>();
export const stampImage = (text: string) => stampImages.get(text);
export function loadStamp(text: string) {
  if (!stamps.includes(text)) return Promise.resolve();
  if (stampImages.has(text)) return Promise.resolve();
  if (!pendingStamps.has(text)) {
    const img = new Image();
    img.src = stampUrl(text);
    pendingStamps.set(
      text,
      img
        .decode()
        .then(() => {
          stampImages.set(text, img);
        })
        .finally(() => {
          pendingStamps.delete(text);
        }),
    );
  }
  return pendingStamps.get(text)!;
}
export const stamps = [
  "😀",
  "😊",
  "🙂",
  "😐",
  "😟",
  "😢",
  "😍",
  "👍",
  "👎",
  "👌",
  "👀",
  "💬",
  "❤️",
  "⭐",
  "✨",
  "✅",
  "❌",
  "⚠️",
  "📍",
  "🎯",
  "⬆️",
  "⬇️",
  "➡️",
  "⬅️",
];
export async function loadPhotoFonts(photo: Photo) {
  await Promise.all(
    photo.annotations
      .filter((a) => a.tool === "stamp")
      .map((a) => loadStamp(a.text || "")),
  );
  await Promise.all(
    [
      ...new Set(
        photo.annotations
          .filter((a) => a.tool === "text")
          .map((a) => a.font || "sans"),
      ),
    ].map((font) => document.fonts.load(`24px ${annotationFonts[font].load}`)),
  );
}
export function annotationBox(a: Annotation, width: number, height: number) {
  const p = a.points[0] || { x: 0, y: 0 },
    unit = Math.max(width, height) / 1000;
  const size = (a.fontSize || 18 + a.width * 2) * unit;
  return {
    x: p.x,
    y: a.box ? p.y : Math.max(0, p.y - size / height),
    width:
      a.box?.width ||
      Math.min(1, Math.max(size, (a.text?.length || 1) * size * 0.85) / width),
    height: a.box?.height || Math.min(1, (size * 1.25) / height),
  };
}
export function resizeAnnotation(
  a: Annotation,
  factor: number,
  width: number,
  height: number,
): Annotation {
  const box = annotationBox(a, width, height),
    size = a.fontSize || 18 + a.width * 2;
  const f = Math.max(
    6 / size,
    Math.min(
      factor,
      500 / size,
      (1 - box.x) / box.width,
      (1 - box.y) / box.height,
    ),
  );
  return {
    ...a,
    points: [{ x: box.x, y: box.y }],
    box: {
      width: Math.min(1, box.width * f),
      height: Math.min(1, box.height * f),
    },
    fontSize: size * f,
  };
}
export function pinchView(
  start: {
    zoom: number;
    x: number;
    y: number;
    cx: number;
    cy: number;
    distance: number;
  },
  current: { cx: number; cy: number; distance: number },
  width = 1200,
  height = 900,
) {
  const zoom = Math.max(
    1.25,
    Math.min(
      100,
      (start.zoom * current.distance) / Math.max(1, start.distance),
    ),
  );
  const f = zoom / Math.max(1.25, start.zoom);
  return {
    zoom,
    x: current.cx - width / 2 - (start.cx - width / 2 - start.x) * f,
    y: current.cy - height / 2 - (start.cy - height / 2 - start.y) * f,
  };
}
