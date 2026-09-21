import { useAppBack } from "../lib/navigation";
import { useEffect, useRef, useState } from "react";
import {
  PenLine,
  MoveUpRight,
  RectangleHorizontal,
  Circle,
  Type,
  Stamp,
  MousePointer2,
  Grid2X2,
  Eraser,
  Hand,
} from "lucide-react";
import type { Photo, Annotation } from "../core/model";
import { mediaUrl } from "../lib/api";
import {
  rotatedSize,
  annotationHit,
  photoOutputSize,
  frameToCrop,
} from "../core/photoGeometry";
import {
  annotationFonts,
  annotationBox,
  resizeAnnotation,
  moveAnnotation,
  pinchView,
  emojiFont,
  stamps,
  loadPhotoFonts,
  loadStamp,
  stampImage,
  stampUrl,
} from "../core/annotationText";
export function paintPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  photo: Photo,
  annotations = true,
  view = { zoom: 1, x: 0, y: 0 },
) {
  const w = ctx.canvas.width,
    h = ctx.canvas.height,
    crop = photo.crop || { x: 0, y: 0, width: 1, height: 1 };
  const cw = img.width * crop.width,
    ch = img.height * crop.height,
    bounds = rotatedSize(cw, ch, photo.rotation);
  const viewport = photo.viewportCrop || { x: 0, y: 0, width: 1, height: 1 };
  const ow = bounds.width * viewport.width,
    oh = bounds.height * viewport.height;
  const fit = Math.min(w / ow, h / oh),
    scale = fit * view.zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2 + view.x, h / 2 + view.y);
  ctx.beginPath();
  ctx.rect((-ow * scale) / 2, (-oh * scale) / 2, ow * scale, oh * scale);
  ctx.clip();
  ctx.translate(
    (0.5 - viewport.x - viewport.width / 2) * bounds.width * scale,
    (0.5 - viewport.y - viewport.height / 2) * bounds.height * scale,
  );
  ctx.rotate((photo.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.translate(-cw / 2, -ch / 2);
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.clip();
  ctx.translate(-crop.x * img.width, -crop.y * img.height);
  ctx.drawImage(img, 0, 0);
  const transform = ctx.getTransform();
  if (annotations)
    for (const a of photo.annotations) {
      const ps = a.points.map((p) => ({
        x: p.x * img.width,
        y: p.y * img.height,
      }));
      if (!ps.length) continue;
      const p = ps[0],
        q = ps.at(-1)!;
      // A fixed reference size keeps annotations identical in previews and exports.
      const unit = Math.max(img.width, img.height) / 1000;
      ctx.save();
      ctx.globalAlpha = a.opacity ?? 1;
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = a.width * unit;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(a.dashed ? [a.width * unit * 3, a.width * unit * 2] : []);
      ctx.beginPath();
      if (a.tool === "stamp" && a.box && stampImage(a.text || "")) {
        ctx.drawImage(
          stampImage(a.text || "")!,
          p.x,
          p.y,
          a.box.width * img.width,
          a.box.height * img.height,
        );
      } else if (a.tool === "text" || a.tool === "stamp") {
        const size = (a.fontSize || 18 + a.width * 2) * unit;
        ctx.font = `${size}px ${a.tool === "stamp" ? emojiFont : annotationFonts[a.font || "sans"].family}`;
        if (a.box) ctx.textBaseline = "top";
        for (const [index, line] of (a.text || "").split("\n").entries())
          ctx.fillText(line, p.x, p.y + index * size * 1.25);
      } else if (a.tool === "mosaic") {
        const x = Math.min(p.x, q.x),
          y = Math.min(p.y, q.y),
          mw = Math.abs(p.x - q.x),
          mh = Math.abs(p.y - q.y);
        if (mw > 0 && mh > 0) {
          const tile = document.createElement("canvas");
          tile.width = Math.max(1, Math.ceil(mw / (12 * unit)));
          tile.height = Math.max(1, Math.ceil(mh / (12 * unit)));
          tile
            .getContext("2d")!
            .drawImage(img, x, y, mw, mh, 0, 0, tile.width, tile.height);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tile, 0, 0, tile.width, tile.height, x, y, mw, mh);
        }
      } else if (a.tool === "rect")
        ctx.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
      else if (a.tool === "ellipse") {
        ctx.ellipse(
          (p.x + q.x) / 2,
          (p.y + q.y) / 2,
          Math.abs(q.x - p.x) / 2,
          Math.abs(q.y - p.y) / 2,
          0,
          0,
          2 * Math.PI,
        );
        ctx.stroke();
      } else {
        ctx.moveTo(p.x, p.y);
        for (const pt of ps.slice(1)) ctx.lineTo(pt.x, pt.y);
        if (a.tool === "arrow") {
          const t = Math.atan2(q.y - p.y, q.x - p.x),
            n = 18 * unit;
          ctx.moveTo(q.x - n * Math.cos(t - 0.5), q.y - n * Math.sin(t - 0.5));
          ctx.lineTo(q.x, q.y);
          ctx.lineTo(q.x - n * Math.cos(t + 0.5), q.y - n * Math.sin(t + 0.5));
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  ctx.restore();
  return transform;
}
export async function annotatedBlob(photo: Photo) {
  const url = await mediaUrl(photo.mediaId);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    await loadPhotoFonts(photo);
    const size = photoOutputSize(img.width, img.height, photo),
      scale = Math.min(1, 1800 / Math.max(size.width, size.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(size.width * scale));
    c.height = Math.max(1, Math.ceil(size.height * scale));
    paintPhoto(c.getContext("2d")!, img, photo);
    return await new Promise<Blob>((resolve, reject) =>
      c.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("사진 출력 실패"))),
        "image/jpeg",
        0.9,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function PhotoPreview({ photo }: { photo: Photo }) {
  const ref = useRef<HTMLCanvasElement>(null),
    img = useRef<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true,
      url = "";
    setError("");
    img.current = null;
    mediaUrl(photo.mediaId)
      .then(async (u) => {
        url = u;
        const i = new Image();
        i.src = u;
        await i.decode();
        await loadPhotoFonts(photo);
        if (live) {
          img.current = i;
          if (ref.current) {
            const size = photoOutputSize(i.width, i.height, photo);
            const f = Math.min(1, 1600 / Math.max(size.width, size.height));
            ref.current.width = Math.max(1, Math.round(size.width * f));
            ref.current.height = Math.max(1, Math.round(size.height * f));
            paintPhoto(ref.current.getContext("2d")!, i, photo);
          }
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo.mediaId]);
  useEffect(() => {
    let live = true;
    void loadPhotoFonts(photo)
      .then(() => {
        if (live && img.current && ref.current) {
          const size = photoOutputSize(
            img.current.width,
            img.current.height,
            photo,
          );
          const f = Math.min(1, 1600 / Math.max(size.width, size.height));
          ref.current.width = Math.max(1, Math.round(size.width * f));
          ref.current.height = Math.max(1, Math.round(size.height * f));
          paintPhoto(ref.current.getContext("2d")!, img.current, photo);
        }
      })
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [photo]);
  return error ? (
    <span role="alert">{error}</span>
  ) : (
    <canvas
      ref={ref}
      width={800}
      height={700}
      aria-label={photo.name + " 주석 포함 사진"}
    />
  );
}
type Tool = Annotation["tool"] | "crop" | "erase" | "pan" | "select";
const toolNames: [Tool, string, string][] = [
  ["pen", "펜", "P"],
  ["arrow", "화살표", "A"],
  ["rect", "사각형", "R"],
  ["ellipse", "원", "O"],
  ["text", "글자", "T"],
  ["stamp", "스탬프", "S"],
  ["select", "선택", "V"],
  ["mosaic", "모자이크", "M"],
  ["erase", "지우개", "E"],
  ["pan", "이동", "H"],
];
const toolIcons = {
  pen: PenLine,
  arrow: MoveUpRight,
  rect: RectangleHorizontal,
  ellipse: Circle,
  text: Type,
  stamp: Stamp,
  select: MousePointer2,
  mosaic: Grid2X2,
  erase: Eraser,
  pan: Hand,
  crop: RectangleHorizontal,
};
export function PhotoEditor({
  photo: savedPhoto,
  onChange: savePhoto,
  userId,
  readonly = false,
  canEraseAll = false,
}: {
  photo: Photo;
  onChange: (p: Photo) => void;
  userId: string;
  readonly?: boolean;
  canEraseAll?: boolean;
}) {
  const [photo, onChange] = useState(savedPhoto);
  const [savedMessage, setSavedMessage] = useState("");
  const dirty =
    JSON.stringify({
      ...photo,
      selected: savedPhoto.selected,
      representative: savedPhoto.representative,
    }) !== JSON.stringify(savedPhoto);
  useEffect(() => {
    const leave = (e: Event) => {
      if (
        dirty &&
        !window.confirm("이 사진의 저장하지 않은 편집을 버리고 이동할까요?")
      )
        e.preventDefault();
    };
    const beforeSave = (e: Event) => {
      if (dirty) e.preventDefault();
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("codimate:before-photo-leave", leave);
    window.addEventListener("codimate:before-consult-save", beforeSave);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("codimate:before-photo-leave", leave);
      window.removeEventListener("codimate:before-consult-save", beforeSave);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty]);
  const [textOpen, setTextOpen] = useState(false),
    [styleOpen, setStyleOpen] = useState(false);
  const [frame, setFrame] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const frameDrag = useRef<{
    mode: string;
    start: { x: number; y: number };
    frame: NonNullable<typeof frame>;
  } | null>(null);
  useAppBack(
    textOpen || styleOpen || !!frame,
    () => {
      setTextOpen(false);
      setStyleOpen(false);
      setFrame(null);
    },
    100,
  );
  const canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null),
    transform = useRef(new DOMMatrix());
  const drawing = useRef<Annotation | null>(null),
    pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null),
    space = useRef(false),
    erasing = useRef<Photo | null>(null);
  const [tool, setTool] = useState<Tool>("pen"),
    [width, setWidth] = useState(3),
    [color, setColor] = useState("#e76555"),
    [opacity, setOpacity] = useState(100),
    [dashed, setDashed] = useState(false),
    [font, setFont] = useState<Annotation["font"]>("sans");
  const [hidden, setHidden] = useState(false),
    [ownOnly, setOwnOnly] = useState(false),
    [undo, setUndo] = useState<Photo[]>([]),
    [redo, setRedo] = useState<Photo[]>([]),
    [zoom, setZoom] = useState(25),
    [offset, setOffset] = useState({ x: 0, y: 0 }),
    [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [textDraft, setTextDraft] = useState(""),
    [textAnchor, setTextAnchor] = useState<{ x: number; y: number } | null>(
      null,
    ),
    [fontSize, setFontSize] = useState(40),
    [stamp, setStamp] = useState("📍"),
    [fontReady, setFontReady] = useState(true);
  const selected = photo.annotations.find((a) => a.id === selectedId);
  const [selectionSpot, setSelectionSpot] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const primaryPointer = useRef<number | null>(null),
    multi = useRef(false);
  const pinch = useRef<{
    zoom: number;
    x: number;
    y: number;
    cx: number;
    cy: number;
    distance: number;
  } | null>(null);
  const dragging = useRef<{
    original: Annotation;
    start: { x: number; y: number };
    resize: boolean;
    preview: Annotation;
  } | null>(null);
  const clickAction = useRef<{
    tool: "text" | "stamp";
    point: { x: number; y: number };
  } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (frame) {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.min(100, Math.max(0, z - (e.deltaY > 0 ? 3 : -3))));
      } else if (tool === "pan" || space.current) {
        e.preventDefault();
        setOffset((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [tool, !!frame]);
  const scale = Math.max(0.05, zoom / 25);
  const draw = (p = photo) => {
    if (!canvas.current || !image.current) return;
    const ctx = canvas.current.getContext("2d")!;
    if (frame) p = { ...p, viewportCrop: undefined };
    transform.current = paintPhoto(
      ctx,
      image.current,
      ownOnly
        ? {
            ...p,
            annotations: p.annotations.filter((a) => a.authorId === userId),
          }
        : p,
      !hidden,
      { zoom: scale, ...offset },
    );
    const a = p.annotations.find((a) => a.id === selectedId);
    if (!a || hidden || frame) return;
    const img = image.current,
      box = annotationBox(a, img.width, img.height),
      f = Math.hypot(transform.current.a, transform.current.b);
    ctx.save();
    ctx.setTransform(transform.current);
    ctx.strokeStyle = "#167264";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 2 / f;
    ctx.setLineDash([5 / f, 4 / f]);
    ctx.strokeRect(
      box.x * img.width,
      box.y * img.height,
      box.width * img.width,
      box.height * img.height,
    );
    if (!readonly && (canEraseAll || a.authorId === userId)) {
      ctx.setLineDash([]);
      const handle = 14 / f;
      const x = (box.x + box.width) * img.width,
        y = (box.y + box.height) * img.height;
      ctx.fillRect(x - handle / 2, y - handle / 2, handle, handle);
      ctx.strokeRect(x - handle / 2, y - handle / 2, handle, handle);
    }
    ctx.restore();
    const spot = new DOMPoint(
      (box.x + box.width) * img.width,
      box.y * img.height,
    ).matrixTransform(transform.current);
    setSelectionSpot((prev) =>
      Math.abs(prev.x - spot.x) + Math.abs(prev.y - spot.y) < 0.01
        ? prev
        : { x: spot.x, y: spot.y },
    );
  };
  useEffect(() => {
    let live = true,
      url = "";
    image.current = null;
    setError("");
    mediaUrl(photo.mediaId)
      .then(async (u) => {
        url = u;
        const i = new Image();
        i.src = u;
        await i.decode();
        await loadPhotoFonts(photo);
        if (live) {
          image.current = i;
          draw();
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo.mediaId]);
  useEffect(
    () => draw(),
    [photo, hidden, ownOnly, zoom, offset, selectedId, frame],
  );
  useEffect(() => {
    let live = true;
    setFontReady(false);
    Promise.all([
      document.fonts.load(`24px ${annotationFonts[font || "sans"].load}`),
      loadPhotoFonts(photo),
      loadStamp(stamp),
    ])
      .then(() => {
        if (live) {
          setFontReady(true);
          draw();
        }
      })
      .catch((e) => {
        if (live) {
          setError(String(e));
          setFontReady(false);
        }
      });
    return () => {
      live = false;
    };
  }, [font, photo.annotations, stamp]);
  useEffect(() => {
    setUndo([]);
    setRedo([]);
    setZoom(25);
    setOffset({ x: 0, y: 0 });
    drawing.current = null;
    setSelectedId(null);
    setTextAnchor(null);
    pointers.current.clear();
  }, [photo.id]);
  const commit = (next: Photo) => {
    if (readonly) return;
    setUndo((x) => [...x.slice(-49), photo]);
    setRedo([]);
    onChange(next);
  };
  const undoOne = () => {
    if (readonly || !undo.length) return;
    setRedo((x) => [...x, photo]);
    onChange(undo.at(-1)!);
    setUndo((x) => x.slice(0, -1));
  };
  const redoOne = () => {
    if (readonly || !redo.length) return;
    setUndo((x) => [...x, photo]);
    onChange(redo.at(-1)!);
    setRedo((x) => x.slice(0, -1));
  };
  const resetView = () => {
    setZoom(25);
    setOffset({ x: 0, y: 0 });
  };
  const point = (e: React.PointerEvent) => {
    const c = canvas.current!,
      r = c.getBoundingClientRect();
    const p = new DOMPoint(
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    ).matrixTransform(transform.current.inverse());
    return {
      x: Math.max(0, Math.min(1, p.x / (image.current?.width || 1))),
      y: Math.max(0, Math.min(1, p.y / (image.current?.height || 1))),
    };
  };
  const erase = (e: React.PointerEvent) => {
    const p = point(e),
      img = image.current!;
    const source = erasing.current || photo;
    const radius = ((8 + width) * img.width) / 1000 / scale;
    const hit = [...source.annotations]
      .reverse()
      .find(
        (a) =>
          (canEraseAll || a.authorId === userId) &&
          annotationHit(a, p, img.width, img.height, radius),
      );
    if (hit) {
      erasing.current = {
        ...source,
        annotations: source.annotations.filter((a) => a.id !== hit.id),
      };
      draw(erasing.current);
    }
  };
  const rotate = (degrees: number) =>
    commit({
      ...photo,
      rotation: ((((degrees + 180) % 360) + 360) % 360) - 180,
    });
  const canvasPoint = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * 1200) / r.width,
      y: ((e.clientY - r.top) * 900) / r.height,
    };
  };
  const pair = () => {
    const [a, b] = [...pointers.current.values()];
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  };
  const boxed = (a: Annotation): Annotation => {
    const img = image.current!,
      ctx = canvas.current!.getContext("2d")!,
      unit = Math.max(img.width, img.height) / 1000;
    const size = a.fontSize || fontSize;
    ctx.save();
    ctx.font = `${size * unit}px ${a.tool === "stamp" ? emojiFont : annotationFonts[a.font || "sans"].family}`;
    const lines = (a.text || "").split("\n");
    const w =
      (Math.max(
        size * unit,
        ...lines.map((line) => ctx.measureText(line).width),
      ) *
        1.08) /
      img.width;
    const h = (size * unit * 1.25 * lines.length) / img.height;
    ctx.restore();
    const x = Math.min(0.95, a.points[0].x),
      y = Math.min(0.95, a.points[0].y);
    const fit = Math.min(1, (1 - x) / w, (1 - y) / h);
    return {
      ...a,
      points: [{ x, y }],
      fontSize: Math.max(6, size * fit),
      box: {
        width: Math.min(1 - x, w * fit),
        height: Math.min(1 - y, h * fit),
      },
    };
  };
  const textCandidate = (sample = false) => {
    if (!image.current || !canvas.current) return;
    const editing =
      selected?.tool === "text" && (canEraseAll || selected.authorId === userId)
        ? selected
        : null;
    const anchor = editing
      ? annotationBox(editing, image.current.width, image.current.height)
      : textAnchor;
    if (!anchor) return;
    return boxed({
      ...(editing || {}),
      id: editing?.id || "text-preview",
      tool: "text",
      authorId: editing?.authorId || userId,
      points: [{ x: anchor.x, y: anchor.y }],
      text: sample && !textDraft.trim() ? "미리보기" : textDraft,
      width,
      color,
      opacity: opacity / 100,
      font,
      fontSize,
    });
  };
  const textPreview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!textOpen || !fontReady || !textPreview.current || !image.current)
      return;
    const candidate = textCandidate(true);
    if (!candidate) return;
    paintPhoto(
      textPreview.current.getContext("2d")!,
      image.current,
      {
        ...photo,
        annotations: [
          ...photo.annotations.filter((a) => a.id !== candidate.id),
          candidate,
        ],
      },
      true,
      { zoom: scale, ...offset },
    );
  }, [
    textOpen,
    textDraft,
    font,
    fontSize,
    color,
    opacity,
    width,
    fontReady,
    photo,
    textAnchor,
    selectedId,
    zoom,
    offset,
  ]);
  const applyText = () => {
    if (!textDraft.trim() || !image.current || !fontReady || readonly) return;
    const candidate = textCandidate();
    if (!candidate) {
      setError("사진에서 글자를 넣을 위치를 먼저 눌러주세요.");
      return;
    }
    const editing =
      selected?.tool === "text" && (canEraseAll || selected.authorId === userId)
        ? selected
        : null;
    const a = { ...candidate, id: editing?.id || crypto.randomUUID() };
    commit({
      ...photo,
      annotations: editing
        ? photo.annotations.map((x) => (x.id === a.id ? a : x))
        : [...photo.annotations, a],
    });
    setSelectedId(a.id);
    setTextAnchor(null);
    setTextOpen(false);
    setError("");
  };
  const removeSelected = () => {
    if (!selected || readonly || (!canEraseAll && selected.authorId !== userId))
      return;
    commit({
      ...photo,
      annotations: photo.annotations.filter((a) => a.id !== selected.id),
    });
    setSelectedId(null);
    setTextOpen(false);
    setStyleOpen(false);
  };
  const editSelected = () => {
    if (!selected) return;
    setColor(selected.color);
    setWidth(selected.width);
    setOpacity((selected.opacity ?? 1) * 100);
    setDashed(!!selected.dashed);
    if (selected.tool === "text") {
      setTextDraft(selected.text || "");
      setFont(selected.font || "sans");
      setFontSize(selected.fontSize || 18 + selected.width * 2);
      setTextOpen(true);
    } else {
      if (selected.tool === "stamp") setStamp(selected.text || "📍");
      setStyleOpen(true);
    }
  };
  const frameBounds = () => {
    const img = image.current!;
    const size = rotatedSize(
      img.width * (photo.crop?.width || 1),
      img.height * (photo.crop?.height || 1),
      photo.rotation,
    );
    const f = Math.min(1200 / size.width, 900 / size.height);
    return {
      x: (1200 - size.width * f) / 2,
      y: (900 - size.height * f) / 2,
      width: size.width * f,
      height: size.height * f,
    };
  };
  const beginFrame = () => {
    if (!image.current) return;
    resetView();
    setSelectedId(null);
    const b = frameBounds();
    setFrame({
      x: b.x + b.width * 0.12,
      y: b.y + b.height * 0.08,
      width: b.width * 0.76,
      height: b.height * 0.84,
    });
  };
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image.current || frame) return;
    e.preventDefault();
    e.currentTarget
      .closest<HTMLElement>(".photo-editor")
      ?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, canvasPoint(e));
    if (pointers.current.size >= 2) {
      multi.current = true;
      drawing.current = null;
      erasing.current = null;
      pan.current = null;
      dragging.current = null;
      clickAction.current = null;
      pinch.current = { ...pair(), zoom: Math.max(1.25, zoom), ...offset };
      draw();
      return;
    }
    if (multi.current) return;
    primaryPointer.current = e.pointerId;
    if (tool === "pan" || space.current || e.button === 1 || e.button === 2) {
      pan.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      return;
    }
    if (readonly) return;
    if (tool === "erase") {
      erasing.current = photo;
      erase(e);
      return;
    }
    const at = point(e);
    if (["select", "text", "stamp"].includes(tool)) {
      const img = image.current,
        tolerance = 16 / Math.hypot(transform.current.a, transform.current.b);
      const hit = [...photo.annotations].reverse().find(
        (a) =>
          (tool === "select" || a.tool === "text" || a.tool === "stamp") &&
          (!ownOnly || a.authorId === userId) &&
          (annotationHit(a, at, img.width, img.height, tolerance) ||
            (a.id === selectedId &&
              (() => {
                const b = annotationBox(a, img.width, img.height);
                return (
                  at.x >= b.x - tolerance / img.width &&
                  at.x <= b.x + b.width + tolerance / img.width &&
                  at.y >= b.y - tolerance / img.height &&
                  at.y <= b.y + b.height + tolerance / img.height
                );
              })())),
      );
      if (hit) {
        setSelectedId(hit.id);
        setTextAnchor(null);
        if (hit.tool === "text") {
          setTextDraft(hit.text || "");
          setFont(hit.font || "sans");
          setFontSize(hit.fontSize || 18 + hit.width * 2);
          setColor(hit.color);
          setOpacity((hit.opacity ?? 1) * 100);
        }
        if (canEraseAll || hit.authorId === userId) {
          const b = annotationBox(hit, img.width, img.height);
          const resize =
            Math.hypot(
              (at.x - b.x - b.width) * img.width,
              (at.y - b.y - b.height) * img.height,
            ) <= tolerance;
          dragging.current = { original: hit, start: at, resize, preview: hit };
        }
      } else {
        setSelectedId(null);
        if (tool === "text" || tool === "stamp")
          clickAction.current = { tool, point: at };
      }
      return;
    }
    if (tool === "select") return;
    drawing.current = {
      id: crypto.randomUUID(),
      tool: tool === "crop" ? "rect" : tool,
      color: tool === "crop" ? "#ffffff" : color,
      width: tool === "crop" ? 2 : width,
      opacity: tool === "crop" ? 1 : opacity / 100,
      dashed: tool === "crop" ? true : dashed,
      font,
      authorId: userId,
      points: [at],
    };
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, canvasPoint(e));
    if (multi.current) {
      if (pointers.current.size >= 2 && pinch.current) {
        const v = pinchView(pinch.current, pair());
        setZoom(v.zoom);
        setOffset({ x: v.x, y: v.y });
      }
      return;
    }
    if (primaryPointer.current !== e.pointerId) return;
    if (pan.current) {
      const r = e.currentTarget.getBoundingClientRect();
      setOffset({
        x: pan.current.ox + ((e.clientX - pan.current.x) * 1200) / r.width,
        y: pan.current.oy + ((e.clientY - pan.current.y) * 900) / r.height,
      });
      return;
    }
    if (dragging.current && image.current) {
      const d = dragging.current,
        at = point(e),
        img = image.current,
        b = annotationBox(d.original, img.width, img.height);
      if (d.resize) {
        const f = Math.max((at.x - b.x) / b.width, (at.y - b.y) / b.height);
        d.preview = resizeAnnotation(d.original, f, img.width, img.height);
      } else
        d.preview = moveAnnotation(
          d.original,
          at.x - d.start.x,
          at.y - d.start.y,
          img.width,
          img.height,
        );
      draw({
        ...photo,
        annotations: photo.annotations.map((a) =>
          a.id === d.original.id ? d.preview : a,
        ),
      });
      return;
    }
    if (erasing.current) {
      erase(e);
      return;
    }
    const a = drawing.current;
    if (!a) return;
    if (a.tool === "pen") a.points.push(point(e));
    else a.points = [a.points[0], point(e)];
    if (tool === "crop") {
      draw();
      const ctx = canvas.current!.getContext("2d")!,
        img = image.current!,
        p = a.points[0],
        q = a.points.at(-1)!;
      const f = Math.hypot(transform.current.a, transform.current.b);
      ctx.save();
      ctx.setTransform(transform.current);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 / f;
      ctx.globalAlpha = 1;
      ctx.setLineDash([7 / f, 5 / f]);
      ctx.strokeRect(
        p.x * img.width,
        p.y * img.height,
        (q.x - p.x) * img.width,
        (q.y - p.y) * img.height,
      );
      ctx.restore();
    } else draw({ ...photo, annotations: [...photo.annotations, a] });
  };
  const pointerUp = (
    e: React.PointerEvent<HTMLCanvasElement>,
    cancelled = false,
  ) => {
    pointers.current.delete(e.pointerId);
    if (multi.current) {
      if (pointers.current.size >= 2)
        pinch.current = { ...pair(), zoom: Math.max(1.25, zoom), ...offset };
      if (!pointers.current.size) {
        multi.current = false;
        pinch.current = null;
        primaryPointer.current = null;
      }
      return;
    }
    if (primaryPointer.current !== e.pointerId) return;
    primaryPointer.current = null;
    pan.current = null;
    const a = drawing.current,
      erased = erasing.current,
      dragged = dragging.current,
      action = clickAction.current;
    drawing.current = null;
    erasing.current = null;
    dragging.current = null;
    clickAction.current = null;
    if (cancelled) {
      draw();
      return;
    }
    if (
      dragged &&
      JSON.stringify(dragged.original) !== JSON.stringify(dragged.preview)
    )
      commit({
        ...photo,
        annotations: photo.annotations.map((a) =>
          a.id === dragged.original.id ? dragged.preview : a,
        ),
      });
    if (erased && erased !== photo) commit(erased);
    if (action?.tool === "text") {
      setTextAnchor(action.point);
      setTextDraft("");
      setTextOpen(true);
    }
    if (action?.tool === "stamp") {
      const a = boxed({
        id: crypto.randomUUID(),
        tool: "stamp",
        points: [action.point],
        text: stamp,
        authorId: userId,
        color,
        width,
        opacity: opacity / 100,
        fontSize: 64,
      });
      commit({ ...photo, annotations: [...photo.annotations, a] });
      setSelectedId(a.id);
    }
    if (!a) return;
    if (tool === "crop") {
      const p = a.points[0],
        q = point(e),
        w = Math.abs(q.x - p.x),
        h = Math.abs(q.y - p.y);
      if (w > 0.01 && h > 0.01)
        commit({
          ...photo,
          viewportCrop: undefined,
          crop: {
            x: Math.min(p.x, q.x),
            y: Math.min(p.y, q.y),
            width: w,
            height: h,
          },
        });
      setTool("pen");
    } else commit({ ...photo, annotations: [...photo.annotations, a] });
  };
  return (
    <div
      className="photo-editor"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).matches("input,textarea,select")) return;
        const key = e.key.toLowerCase();
        if (frame) {
          if (key === "escape") setFrame(null);
          return;
        }
        if ((key === "delete" || key === "backspace") && selected) {
          e.preventDefault();
          removeSelected();
          return;
        }
        if (key === " ") {
          space.current = true;
          e.preventDefault();
        }
        if ((e.ctrlKey || e.metaKey) && key === "z") {
          e.preventDefault();
          e.shiftKey ? redoOne() : undoOne();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && key === "y") {
          e.preventDefault();
          redoOne();
          return;
        }
        const found = toolNames.find((x) => x[2].toLowerCase() === key);
        if (found) {
          setTool(found[0]);
          e.preventDefault();
        }
        if (key === "+" || key === "=") setZoom((z) => Math.min(100, z + 5));
        if (key === "-") setZoom((z) => Math.max(0, z - 5));
        if (key === "0") resetView();
      }}
      onKeyUp={(e) => {
        if (e.key === " ") space.current = false;
      }}
      onBlur={() => {
        space.current = false;
      }}
    >
      <div className="editor-tools">
        {toolNames.map(([value, name, key]) => {
          const Icon = toolIcons[value];
          return (
            <button
              key={value}
              disabled={!!frame || (readonly && value !== "pan")}
              aria-pressed={tool === value}
              aria-label={name}
              title={`${name} (${key})`}
              className={
                "editor-tool-icon " + (tool === value ? "selected" : "")
              }
              onClick={() => {
                setTool(value);
                if (!["text", "stamp", "select"].includes(value))
                  setSelectedId(null);
              }}
            >
              <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
            </button>
          );
        })}
        <input
          aria-label="주석 색상"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <label>
          선
          <select
            aria-label="선 종류"
            value={dashed ? "dashed" : "solid"}
            onChange={(e) => setDashed(e.target.value === "dashed")}
          >
            <option value="solid">실선</option>
            <option value="dashed">점선</option>
          </select>
        </label>
        <label>
          굵기
          <input
            aria-label="주석 굵기"
            type="range"
            min={1}
            max={30}
            value={width}
            onChange={(e) => setWidth(+e.target.value)}
          />
        </label>
        <label>
          투명도 {100 - opacity}%
          <input
            aria-label="주석 투명도"
            type="range"
            min={0}
            max={100}
            value={100 - opacity}
            onChange={(e) => setOpacity(100 - Number(e.target.value))}
          />
        </label>
      </div>
      {tool === "stamp" && (
        <div className="stamp-picker" aria-label="이모지 스탬프">
          {stamps.map((value) => (
            <button
              key={value}
              title={value}
              aria-label={`스탬프 ${value}`}
              aria-pressed={stamp === value}
              className={stamp === value ? "selected" : ""}
              onClick={() => setStamp(value)}
            >
              <img src={stampUrl(value)} alt="" width={30} height={30} />
            </button>
          ))}
        </div>
      )}
      {tool === "text" && (
        <p className="small">
          사진에서 글자를 넣을 위치를 누르세요. 기존 글자는 선택 후 ✎ 수정할 수
          있습니다.
        </p>
      )}
      {(textOpen || styleOpen) && (
        <div
          className="annotation-dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={textOpen ? "텍스트 박스 설정" : "주석 설정"}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              setTextOpen(false);
              setStyleOpen(false);
            }
          }}
        >
          <div
            className={
              "annotation-dialog" + (textOpen ? " text-settings-dialog" : "")
            }
          >
            {textOpen && (
              <div className="text-preview-panel">
                <strong>사진 위 미리보기</strong>
                <canvas
                  ref={textPreview}
                  width={1200}
                  height={900}
                  aria-label="텍스트 사진 미리보기"
                />
                <p className="small">
                  폰트·크기·색상·투명도가 바로 반영됩니다. 글자 적용을 누르면
                  사진에 추가됩니다.
                </p>
                {!fontReady && <p role="status">폰트 준비 중…</p>}
              </div>
            )}
            <div className="annotation-settings-fields">
              <h3>{textOpen ? "텍스트 박스 설정" : "주석 설정"}</h3>
              {textOpen && (
                <>
                  <textarea
                    autoFocus
                    aria-label="텍스트 내용"
                    placeholder="글자를 입력하세요"
                    maxLength={500}
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                  />
                  <label>
                    폰트
                    <select
                      aria-label="주석 폰트"
                      value={font}
                      onChange={(e) =>
                        setFont(e.target.value as Annotation["font"])
                      }
                    >
                      {Object.entries(annotationFonts).map(([key, f]) => (
                        <option key={key} value={key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    글자 크기
                    <input
                      aria-label="글자 크기"
                      type="number"
                      min={6}
                      max={500}
                      value={fontSize}
                      onChange={(e) =>
                        setFontSize(Math.max(6, Math.min(500, +e.target.value)))
                      }
                    />
                  </label>
                </>
              )}
              {styleOpen && selected?.tool === "stamp" && (
                <div className="stamp-picker">
                  {stamps.map((v) => (
                    <button
                      key={v}
                      aria-label={`변경 스탬프 ${v}`}
                      aria-pressed={stamp === v}
                      onClick={() => setStamp(v)}
                    >
                      <img src={stampUrl(v)} alt="" width={30} height={30} />
                    </button>
                  ))}
                </div>
              )}
              <label>
                색상
                <input
                  aria-label="설정 색상"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
              <label>
                투명도
                <input
                  aria-label="설정 투명도"
                  type="range"
                  min={0}
                  max={100}
                  value={100 - opacity}
                  onChange={(e) => setOpacity(100 - Number(e.target.value))}
                />
              </label>
              {styleOpen && (
                <>
                  <label>
                    굵기
                    <input
                      aria-label="설정 굵기"
                      type="range"
                      min={1}
                      max={30}
                      value={width}
                      onChange={(e) => setWidth(+e.target.value)}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={dashed}
                      onChange={(e) => setDashed(e.target.checked)}
                    />
                    점선
                  </label>
                </>
              )}
              <div className="button-row">
                <button
                  onClick={() => {
                    setTextOpen(false);
                    setStyleOpen(false);
                  }}
                >
                  취소
                </button>
                <button
                  className="primary"
                  disabled={!fontReady || (textOpen && !textDraft.trim())}
                  onClick={() => {
                    if (textOpen) applyText();
                    else if (
                      selected &&
                      (canEraseAll || selected.authorId === userId)
                    ) {
                      commit({
                        ...photo,
                        annotations: photo.annotations.map((a) =>
                          a.id === selected.id
                            ? {
                                ...a,
                                color,
                                width,
                                dashed,
                                opacity: opacity / 100,
                                ...(a.tool === "stamp" ? { text: stamp } : {}),
                              }
                            : a,
                        ),
                      });
                      setStyleOpen(false);
                    }
                  }}
                >
                  {textOpen ? "글자 적용" : "주석 적용"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div
        ref={stage}
        className={"photo-stage tool-" + tool}
        onContextMenu={(e) => e.preventDefault()}
      >
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <canvas
            ref={canvas}
            width={1200}
            height={900}
            aria-label="사진 편집 캔버스"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={(e) => pointerUp(e)}
            onPointerCancel={(e) => pointerUp(e, true)}
            onLostPointerCapture={(e) => {
              if (pointers.current.has(e.pointerId)) pointerUp(e, true);
            }}
          />
        )}
        {selected &&
          !hidden &&
          !frame &&
          image.current &&
          (() => {
            const editable =
              !readonly && (canEraseAll || selected.authorId === userId);
            return (
              <div
                className="annotation-selection-actions"
                style={{
                  left: `${Math.max(0, Math.min(82, selectionSpot.x / 12))}%`,
                  top: `${Math.max(0, Math.min(88, selectionSpot.y / 9))}%`,
                }}
              >
                <button
                  aria-label="선택 주석 수정"
                  disabled={!editable}
                  onClick={editSelected}
                >
                  ✎
                </button>
                <button
                  aria-label="선택 주석 삭제"
                  disabled={!editable}
                  onClick={removeSelected}
                >
                  ×
                </button>
              </div>
            );
          })()}
        {frame && (
          <div className="crop-overlay" aria-label="포트레이트 자르기 프레임">
            <div
              className="crop-frame"
              style={{
                left: `${frame.x / 12}%`,
                top: `${frame.y / 9}%`,
                width: `${frame.width / 12}%`,
                height: `${frame.height / 9}%`,
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                const r = canvas.current!.getBoundingClientRect();
                frameDrag.current = {
                  mode: (e.target as HTMLElement).dataset.handle || "move",
                  start: {
                    x: ((e.clientX - r.left) * 1200) / r.width,
                    y: ((e.clientY - r.top) * 900) / r.height,
                  },
                  frame,
                };
              }}
              onPointerMove={(e) => {
                const d = frameDrag.current;
                if (!d) return;
                const r = canvas.current!.getBoundingClientRect(),
                  dx = ((e.clientX - r.left) * 1200) / r.width - d.start.x,
                  dy = ((e.clientY - r.top) * 900) / r.height - d.start.y;
                let { x, y, width: w, height: h } = d.frame;
                if (d.mode === "move") {
                  x = Math.max(0, Math.min(1200 - w, x + dx));
                  y = Math.max(0, Math.min(900 - h, y + dy));
                } else {
                  if (d.mode.includes("e"))
                    w = Math.max(40, Math.min(1200 - x, w + dx));
                  if (d.mode.includes("s"))
                    h = Math.max(40, Math.min(900 - y, h + dy));
                  if (d.mode.includes("w")) {
                    const nx = Math.max(0, Math.min(x + w - 40, x + dx));
                    w += x - nx;
                    x = nx;
                  }
                  if (d.mode.includes("n")) {
                    const ny = Math.max(0, Math.min(y + h - 40, y + dy));
                    h += y - ny;
                    y = ny;
                  }
                }
                setFrame({ x, y, width: w, height: h });
              }}
              onPointerUp={() => {
                frameDrag.current = null;
              }}
              onPointerCancel={() => {
                frameDrag.current = null;
              }}
            >
              <div className="crop-thirds" />
              {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => (
                <span
                  key={h}
                  data-handle={h}
                  className={`crop-handle handle-${h}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {frame && (
        <div className="button-row">
          <span className="small">
            모서리·변을 끌어 조절 · 안쪽을 끌어 이동 · 아래에서 사진 회전
          </span>
          <button onClick={() => setFrame(null)}>자르기 취소</button>
          <button
            className="primary"
            onClick={() => {
              commit({
                ...photo,
                viewportCrop: frameToCrop(frame, frameBounds()),
              });
              setFrame(null);
              resetView();
            }}
          >
            자르기 적용
          </button>
        </div>
      )}
      <div className="editor-tools">
        <label>
          확대·축소 {Math.round(zoom)}
          <input
            aria-label="확대 축소"
            disabled={!!frame}
            type="range"
            min={0}
            max={100}
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
          />
        </label>
        <button onClick={resetView}>화면 맞춤</button>
        <button onClick={() => setHidden(!hidden)}>
          {hidden ? "주석 표시" : "원본 보기"}
        </button>
        <button onClick={() => setOwnOnly(!ownOnly)}>
          {ownOnly ? "전체 주석" : "내 주석만"}
        </button>
        <button disabled={readonly || !undo.length} onClick={undoOne}>
          실행취소
        </button>
        <button disabled={readonly || !redo.length} onClick={redoOne}>
          다시실행
        </button>
        <button disabled={readonly} onClick={() => rotate(photo.rotation - 90)}>
          ↶ 좌 90°
        </button>
        <button disabled={readonly} onClick={() => rotate(photo.rotation + 90)}>
          ↷ 우 90°
        </button>
        <button disabled={readonly} onClick={() => rotate(0)}>
          0° 원래 회전
        </button>
        <label>
          자유회전 {photo.rotation}°
          <input
            aria-label="자유회전"
            disabled={readonly}
            type="range"
            min={-180}
            max={180}
            value={photo.rotation}
            onChange={(e) => commit({ ...photo, rotation: +e.target.value })}
          />
        </label>
        <button
          disabled={readonly}
          onClick={() =>
            photo.crop || photo.viewportCrop
              ? commit({ ...photo, crop: undefined, viewportCrop: undefined })
              : setTool("crop")
          }
        >
          {photo.crop || photo.viewportCrop ? "자르기 해제" : "영역 자르기"}
        </button>
        <button disabled={readonly || !!frame} onClick={beginFrame}>
          영역 자르기 (포트레이트)
        </button>
        <button
          className="primary"
          disabled={readonly || !dirty || !!frame || textOpen || styleOpen}
          onClick={() => {
            savePhoto(photo);
            setSavedMessage(
              "현재 사진을 작업 중인 상담에 반영했습니다. 상담 저장을 해야 다시 열 때 유지됩니다.",
            );
          }}
        >
          사진 편집 저장
        </button>
        <button
          onClick={() => canvas.current?.parentElement?.requestFullscreen?.()}
        >
          크게 보기
        </button>
      </div>
      <p className="small" role="status">
        {dirty
          ? "사진 편집 미저장 · 사진 편집 저장 후 상담을 저장하세요."
          : savedMessage}
      </p>
      <p className="small">
        도구 사용 중에도 두 손가락으로 확대·축소하거나 사진을 이동할 수
        있습니다.
      </p>
      <details className="shortcut-help">
        <summary>PC 단축키·마우스 사용법</summary>
        <p>
          P 펜 · A 화살표 · R 사각형 · O 원 · T 글자 · M 모자이크 · E 지우개 · H
          이동
          <br />
          Space+드래그 / 마우스 가운데·오른쪽 버튼: 이동 · Ctrl+휠 / + −:
          확대·축소 · 0: 화면 맞춤
          <br />
          Ctrl/Cmd+Z: 실행취소 · Ctrl/Cmd+Shift+Z: 다시실행. 편집 화면을 누른 뒤
          사용하세요. 지우개는 주석 한 개씩 지웁니다.
        </p>
      </details>
    </div>
  );
}
export function SignaturePad({
  onChange,
}: {
  onChange: (data: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    down = useRef(false);
  return (
    <div>
      <canvas
        className="signature"
        ref={ref}
        width={700}
        height={200}
        onPointerDown={(e) => {
          down.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect(),
            ctx = e.currentTarget.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(
            ((e.clientX - r.left) * 700) / r.width,
            ((e.clientY - r.top) * 200) / r.height,
          );
        }}
        onPointerMove={(e) => {
          if (!down.current) return;
          const r = e.currentTarget.getBoundingClientRect(),
            ctx = e.currentTarget.getContext("2d")!;
          ctx.strokeStyle = "#183b34";
          ctx.lineWidth = 3;
          ctx.lineTo(
            ((e.clientX - r.left) * 700) / r.width,
            ((e.clientY - r.top) * 200) / r.height,
          );
          ctx.stroke();
        }}
        onPointerUp={() => {
          down.current = false;
          onChange(ref.current!.toDataURL("image/png"));
        }}
      />
      <button
        onClick={() => {
          ref.current!.getContext("2d")!.clearRect(0, 0, 700, 200);
          onChange("");
        }}
      >
        서명 지우기
      </button>
    </div>
  );
}
