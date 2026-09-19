// JPEG EXIF DateTimeOriginal (with OffsetTimeOriginal when present).
// Files without capture metadata fall back to their last-modified timestamp.
export function jpegCaptureDate(bytes: ArrayBuffer): string | undefined {
  try {
    const v = new DataView(bytes);
    if (v.getUint16(0) !== 0xffd8) return;
    let at = 2;
    while (at + 4 < v.byteLength) {
      const marker = v.getUint16(at),
        length = v.getUint16(at + 2);
      if (marker === 0xffda || marker === 0xffd9 || length < 2) return;
      if (marker === 0xffe1 && v.getUint32(at + 4) === 0x45786966) {
        const base = at + 10,
          little = v.getUint16(base) === 0x4949;
        if (v.getUint16(base + 2, little) !== 42) return;
        const tags = (offset: number) => {
          const map = new Map<
              number,
              { type: number; count: number; value: number; slot: number }
            >(),
            pos = base + offset,
            n = v.getUint16(pos, little);
          if (n > 500) return map;
          for (let i = 0; i < n; i++) {
            const p = pos + 2 + i * 12;
            map.set(v.getUint16(p, little), {
              type: v.getUint16(p + 2, little),
              count: v.getUint32(p + 4, little),
              value: v.getUint32(p + 8, little),
              slot: p + 8,
            });
          }
          return map;
        };
        const primary = tags(v.getUint32(base + 4, little)),
          exif = primary.get(0x8769);
        if (!exif) return;
        const extra = tags(exif.value);
        const text = (tag: number) => {
          const t = extra.get(tag);
          if (!t || t.type !== 2 || t.count > 80) return "";
          const start = t.count <= 4 ? t.slot : base + t.value;
          return new TextDecoder()
            .decode(bytes.slice(start, start + t.count))
            .replace(/\0.*$/, "");
        };
        const date = text(0x9003),
          zone = text(0x9011) || "+09:00";
        if (
          !/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(date) ||
          !/^[-+]\d{2}:\d{2}$/.test(zone)
        )
          return;
        const iso =
          date.slice(0, 10).replaceAll(":", "-") + "T" + date.slice(11) + zone;
        if (Number.isFinite(Date.parse(iso)))
          return new Date(iso).toISOString();
        return;
      }
      at += 2 + length;
    }
  } catch {
    /* Truncated or unsupported EXIF is optional metadata. */
  }
}
