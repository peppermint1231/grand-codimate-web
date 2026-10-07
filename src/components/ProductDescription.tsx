import { useId, useState } from "react";

export function ProductDescription({ description }: { description?: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const text =
    description?.trim() || "자세한 시술 설명은 상담 시 안내해드려요.";
  const long = text.length > 140 || text.split("\n").length > 3;
  return (
    <div className="pd-description">
      <p
        id={id}
        className={`pd-product-copy${long && !expanded ? " pd-copy-collapsed" : ""}`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          className="pd-copy-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "설명 접기" : "설명 전체 보기"}
        </button>
      )}
    </div>
  );
}
