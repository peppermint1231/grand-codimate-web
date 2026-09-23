import { quoteTemplates, selectDocumentTheme } from "../core/quoteTemplate";
export function QuoteTemplatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className="quote-template-picker"
      role="group"
      aria-label="견적서 디자인 템플릿"
    >
      <span>출력 디자인</span>
      {quoteTemplates.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={value === t.id}
          onClick={() => {
            selectDocumentTheme(t.id);
            onChange(t.id);
          }}
        >
          <span
            className="quote-template-swatch"
            style={{ background: t.paper, borderColor: t.ink }}
          >
            <i style={{ background: t.ink }} />
            <i style={{ background: t.accent }} />
          </span>
          <span>
            {t.name}
            <small>{t.description}</small>
          </span>
        </button>
      ))}
      <small>PDF · JPG · 인쇄에 같은 디자인 적용</small>
    </div>
  );
}
