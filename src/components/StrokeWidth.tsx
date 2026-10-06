import "./StrokeWidth.css";
export function StrokeWidth({
  value,
  onChange,
  color,
  label = "주석 굵기",
}: {
  value: number;
  onChange: (n: number) => void;
  color: string;
  label?: string;
}) {
  return (
    <label className="stroke-width-control">
      <span>
        굵기 <output>{value}</output>
      </span>
      <span className="stroke-width-track">
        <svg viewBox="0 0 180 32" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M 8 15.5 L 172 2 Q 180 16 172 30 L 8 16.5 Z"
            fill={color}
            opacity=".45"
          />
        </svg>
        <input
          aria-label={label}
          aria-valuetext={`${value} 굵기`}
          type="range"
          min={1}
          max={30}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
        />
      </span>
      <svg
        className="stroke-width-preview"
        viewBox="0 0 80 32"
        aria-label={`현재 선 굵기 ${value}`}
      >
        <line
          x1="17"
          y1="16"
          x2="63"
          y2="16"
          stroke={color}
          strokeWidth={value}
          strokeLinecap="round"
        />
      </svg>
    </label>
  );
}
