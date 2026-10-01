import type { CatalogCategoryMode } from "../core/catalogCategoryView";
export function CatalogCategorySwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: CatalogCategoryMode;
  onChange: (mode: CatalogCategoryMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="catalog-category-switch"
      role="group"
      aria-label="분류 기준"
    >
      {(
        [
          ["concern", "고민별"],
          ["website", "홈페이지 분류"],
        ] as const
      ).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          className={value === mode ? "active" : ""}
          disabled={disabled}
          onClick={() => onChange(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
