/** Shared B / CONSULT symbol; decorative beside the accessible brand name. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <img
      className="codimate-brand-mark"
      src="/brand/codimate.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      style={{ flexShrink: 0, display: "block" }}
    />
  );
}
