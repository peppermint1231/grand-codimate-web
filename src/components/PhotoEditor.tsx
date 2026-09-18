import { useEffect, useRef, useState } from "react";
import type { Photo, Annotation } from "../core/model";
import { mediaUrl } from "../lib/api";
export function paintPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  photo: Photo,
  annotations = true,
) {
  const w = ctx.canvas.width,
    h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  const crop = photo.crop || { x: 0, y: 0, width: 1, height: 1 };
  const r = ((photo.rotation % 360) + 360) % 360;
  const cw = img.width * crop.width,
    ch = img.height * crop.height;
  const rotated = r === 90 || r === 270;
  const scale = Math.min(w / (rotated ? ch : cw), h / (rotated ? cw : ch));
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((r * Math.PI) / 180);
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
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = a.width / scale;
      ctx.lineCap = "round";
      const points = a.points.map((p) => ({
        x: p.x * img.width,
        y: p.y * img.height,
      }));
      if (!points.length) continue;
      const p = points[0],
        q = points.at(-1)!;
      ctx.beginPath();
      if (a.tool === "text") {
        ctx.font = `${24 / scale}px sans-serif`;
        ctx.fillText(a.text || "", p.x, p.y);
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
        for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
        if (a.tool === "arrow") {
          const t = Math.atan2(q.y - p.y, q.x - p.x),
            n = 18 / scale;
          ctx.moveTo(q.x - n * Math.cos(t - 0.5), q.y - n * Math.sin(t - 0.5));
          ctx.lineTo(q.x, q.y);
          ctx.lineTo(q.x - n * Math.cos(t + 0.5), q.y - n * Math.sin(t + 0.5));
        }
        ctx.stroke();
      }
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
    const canvas = document.createElement("canvas");
    const odd = Math.abs(photo.rotation % 180) === 90;
    const crop = photo.crop || { width: 1, height: 1 };
    canvas.width = odd ? img.height * crop.height : img.width * crop.width;
    canvas.height = odd ? img.width * crop.width : img.height * crop.height;
    const scale = Math.min(1, 1800 / Math.max(canvas.width, canvas.height));
    canvas.width *= scale;
    canvas.height *= scale;
    paintPhoto(canvas.getContext("2d")!, img, photo);
    return await new Promise<Blob>((r) =>
      canvas.toBlob((b) => r(b!), "image/jpeg", 0.9),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function PhotoEditor({
  photo,
  onChange,
  userId,
  readonly = false,
}: {
  photo: Photo;
  onChange: (p: Photo) => void;
  userId: string;
  readonly?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement>(null),
    transform = useRef<DOMMatrix>(new DOMMatrix()),
    drawing = useRef<Annotation | null>(null);
  const [tool, setTool] = useState<Annotation["tool"] | "crop">("pen"),
    [width, setWidth] = useState(3),
    [ownOnly, setOwnOnly] = useState(false),
    [undo, setUndo] = useState<Photo[]>([]),
    [color, setColor] = useState("#e76555"),
    [hidden, setHidden] = useState(false),
    [redo, setRedo] = useState<Photo[]>([]),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState("");
  const draw = (p = photo) => {
    if (canvas.current && image.current)
      transform.current = paintPhoto(
        canvas.current.getContext("2d")!,
        image.current,
        ownOnly
          ? {
              ...p,
              annotations: p.annotations.filter((a) => a.authorId === userId),
            }
          : p,
        !hidden,
      );
  };
  useEffect(() => {
    let live = true,
      u = "";
    mediaUrl(photo.mediaId)
      .then(async (url) => {
        u = url;
        const img = new Image();
        img.src = url;
        await img.decode();
        if (live) {
          image.current = img;
          draw();
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [photo.mediaId]);
  useEffect(() => draw(), [photo, hidden, ownOnly]);
  useEffect(() => {
    setUndo([]);
    setRedo([]);
  }, [photo.id]);
  const commit = (next: Photo) => {
    setUndo([...undo.slice(-49), photo]);
    setRedo([]);
    onChange(next);
  };
  const point = (e: React.PointerEvent) => {
    const c = canvas.current!,
      rect = c.getBoundingClientRect();
    const pos = new DOMPoint(
      ((e.clientX - rect.left) * c.width) / rect.width,
      ((e.clientY - rect.top) * c.height) / rect.height,
    ).matrixTransform(transform.current.inverse());
    return {
      x: Math.max(0, Math.min(1, pos.x / (image.current?.width || 1))),
      y: Math.max(0, Math.min(1, pos.y / (image.current?.height || 1))),
    };
  };
  return (
    <div className="photo-editor">
      <div className="editor-tools">
        {(["pen", "arrow", "rect", "ellipse", "text"] as const).map((t, i) => (
          <button
            disabled={readonly}
            className={tool === t ? "selected" : ""}
            key={t}
            onClick={() => setTool(t)}
          >
            {["펜", "화살표", "사각형", "원", "글자"][i]}
          </button>
        ))}
        <input
          aria-label="주석 색상"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <button onClick={() => setHidden(!hidden)}>
          {hidden ? "주석 표시" : "원본 보기"}
        </button>
        <label>
          굵기{" "}
          <input
            aria-label="주석 굵기"
            type="range"
            min={1}
            max={15}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <button onClick={() => setOwnOnly(!ownOnly)}>
          {ownOnly ? "전체 주석" : "내 주석만"}
        </button>
        <button onClick={() => setZoom(zoom === 1 ? 1.6 : 1)}>확대</button>
      </div>
      <div className="photo-stage">
        {error ? (
          <p>{error}</p>
        ) : (
          <canvas
            width={1000}
            height={750}
            ref={canvas}
            style={{ width: `${zoom * 100}%` }}
            onPointerDown={(e) => {
              if (readonly || !image.current) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const a: Annotation = {
                id: crypto.randomUUID(),
                tool: tool === "crop" ? "rect" : tool,
                color,
                width,
                authorId: userId,
                points: [point(e)],
              };
              if (tool === "text") {
                a.text = window.prompt("주석 내용") || "";
                if (a.text)
                  commit({
                    ...photo,
                    annotations: [...photo.annotations, a],
                  });
                return;
              }
              drawing.current = a;
            }}
            onPointerMove={(e) => {
              const a = drawing.current;
              if (!a) return;
              if (a.tool === "pen") a.points.push(point(e));
              else a.points = [a.points[0], point(e)];
              draw({ ...photo, annotations: [...photo.annotations, a] });
            }}
            onPointerCancel={() => {
              drawing.current = null;
              draw();
            }}
            onPointerUp={(e) => {
              if (drawing.current) {
                const a = drawing.current;
                if (tool === "crop") {
                  const p = a.points[0],
                    q = point(e),
                    width = Math.abs(q.x - p.x),
                    height = Math.abs(q.y - p.y);
                  if (width > 0.01 && height > 0.01)
                    commit({
                      ...photo,
                      crop: {
                        x: Math.min(p.x, q.x),
                        y: Math.min(p.y, q.y),
                        width,
                        height,
                      },
                    });
                  setTool("pen");
                } else
                  commit({
                    ...photo,
                    annotations: [...photo.annotations, drawing.current],
                  });
                drawing.current = null;
                setRedo([]);
              }
            }}
          />
        )}
      </div>
      <div className="editor-tools">
        <button
          disabled={readonly || !undo.length}
          onClick={() => {
            setRedo([...redo, photo]);
            onChange(undo.at(-1)!);
            setUndo(undo.slice(0, -1));
          }}
        >
          실행취소
        </button>
        <button
          disabled={readonly || !redo.length}
          onClick={() => {
            setUndo([...undo, photo]);
            onChange(redo.at(-1)!);
            setRedo(redo.slice(0, -1));
          }}
        >
          다시실행
        </button>
        <button
          disabled={readonly}
          onClick={() =>
            commit({ ...photo, rotation: (photo.rotation + 90) % 360 })
          }
        >
          90° 회전
        </button>
        <button
          disabled={readonly}
          onClick={() => {
            if (photo.crop) commit({ ...photo, crop: undefined });
            else setTool("crop");
          }}
        >
          {photo.crop
            ? "자르기 해제"
            : tool === "crop"
              ? "사진에서 자를 영역을 드래그"
              : "영역 자르기"}
        </button>
        <button
          onClick={() => canvas.current?.parentElement?.requestFullscreen?.()}
        >
          크게 보기
        </button>
      </div>
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
