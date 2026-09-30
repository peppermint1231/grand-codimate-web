import { useRef, useState } from "react";
import { consentReviewGuide } from "../core/consentReviewGuide";
import type { Consent } from "../core/model";
import {
  consentPublishIssues,
  consentSources,
  treatmentConsentDrafts,
  CONSENT_DRAFT_REVISION,
} from "../core/treatmentConsents";

type Props = {
  consents: Consent[];
  send: (...args: any[]) => Promise<any>;
  work: (fn: () => Promise<any>) => any;
};
export function TreatmentConsentManager({ consents, send, work }: Props) {
  const [selected, setSelected] = useState<Consent>();
  const [dirty, setDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const missing = treatmentConsentDrafts.filter(
    (t) =>
      !consents.some(
        (c) =>
          c.draftKey === t.key && c.draftRevision === CONSENT_DRAFT_REVISION,
      ),
  );
  const choose = (t: Consent) => {
    if (
      dirty &&
      !window.confirm("저장하지 않은 변경을 버리고 양식을 전환할까요?")
    )
      return;
    setEditorKey((k) => k + 1);
    setSelected(t);
    setDirty(false);
    setNotice("");
  };
  const blank = (): Consent => ({
    id: "",
    rev: 0,
    createdAt: "",
    updatedAt: "",
    name: "",
    body: "",
    checks: [],
    productIds: [],
    status: "draft",
    version: 1,
  });
  return (
    <section className="treatment-consents" aria-label="시술동의서 양식 관리">
      <div className="card consent-intro">
        <div>
          <h3>시술별 동의서 초안</h3>
          <p>
            목적·대안·위험·사후 관리·환자 확인 항목을 작성해 두었습니다. 본문의{" "}
            <b className="consent-review-badge">검토 필요 · [병원 확인: …]</b>을
            보완하고 담당 의료진의 검토 후 게시하세요.
          </p>
          <p className="small">
            복합 시술은 각 시술에 필요한 양식을 함께 사용합니다. 초안은 환자
            서명 목록에 표시되지 않습니다.
          </p>
        </div>
        <div className="button-row">
          <button
            type="button"
            disabled={!missing.length}
            onClick={() =>
              work(async () => {
                await send("consent.installDrafts", {
                  keys: missing.map((t) => t.key),
                });
                setNotice(
                  `${missing.length}종을 보완했습니다. 미게시 초안은 업데이트하고 게시본은 별도 개정 초안으로 만들었습니다. 기존 서명은 유지됩니다.`,
                );
              })
            }
          >
            {missing.length
              ? `초안 ${missing.length}종 등록·업그레이드`
              : "최신 초안 등록 완료"}
          </button>
          <button type="button" onClick={() => choose(blank())}>
            새 양식 작성
          </button>
        </div>
      </div>
      {notice && <p role="status">{notice}</p>}
      <div className="consent-manager-grid">
        <aside className="card consent-template-list">
          <label className="field">
            양식 검색
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="시술 또는 양식명"
            />
          </label>
          <p className="small">
            초안 {consents.filter((t) => t.status === "draft").length} · 게시됨{" "}
            {consents.filter((t) => t.status === "published").length}
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
            />
            이전 초안 함께 보기
          </label>
          <div className="consent-list-scroll">
            {consents
              .filter(
                (t) =>
                  showHistory ||
                  !t.draftKey ||
                  t.status === "published" ||
                  !consents.some(
                    (other) =>
                      other.draftKey === t.draftKey &&
                      other.version > t.version,
                  ),
              )
              .filter((t) =>
                `${t.name} ${treatmentConsentDrafts.find((d) => d.key === t.draftKey)?.examples || ""}`.includes(
                  search.trim(),
                ),
              )
              .map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`consent-template-row ${selected?.id === t.id ? "active" : ""}`}
                  onClick={() => choose(t)}
                >
                  <b>{t.name}</b>
                  {/\[병원 확인\s*[:：]/.test(t.body) && (
                    <span className="consent-review-badge">검토 필요</span>
                  )}
                  {consents.some(
                    (c) =>
                      c.sourceTemplateId === t.id &&
                      c.status === "draft" &&
                      c.draftRevision === CONSENT_DRAFT_REVISION,
                  ) && (
                    <span className="consent-review-badge">
                      보완 개정 초안 있음
                    </span>
                  )}
                  {t.status === "draft" &&
                    consents.some(
                      (c) =>
                        c.id === t.sourceTemplateId && c.status === "published",
                    ) && (
                      <span className="small">게시본을 보완한 개정 초안</span>
                    )}
                  <span className="small">
                    {t.status === "draft" ? "검토 전 초안" : "게시됨"} · v
                    {t.version}
                  </span>
                </button>
              ))}
            {!consents.length && (
              <p>기본 초안을 등록하거나 새 양식을 작성하세요.</p>
            )}
          </div>
        </aside>
        {selected ? (
          <ConsentEditor
            key={editorKey}
            template={selected}
            dirty={dirty}
            onDirty={setDirty}
            onCancel={() => {
              if (!dirty || window.confirm("변경을 취소할까요?")) {
                setSelected(undefined);
                setDirty(false);
              }
            }}
            onClone={() =>
              choose({
                ...selected,
                id: "",
                rev: 0,
                status: "draft",
                name: selected.name + " (수정본)",
                sourceTemplateId: selected.id,
                version: selected.version + 1,
                reviewedAt: undefined,
                reviewedBy: undefined,
              })
            }
            onSave={(value, reviewed) =>
              work(async () => {
                const id = selected.id || crypto.randomUUID();
                await send(
                  "consent.save",
                  { ...value, reviewConfirmed: reviewed },
                  id,
                  selected.id ? selected.rev : undefined,
                );
                setSelected(undefined);
                setDirty(false);
                setNotice(
                  value.status === "published"
                    ? "검토한 양식을 게시했습니다. 상담에서 서명할 수 있습니다."
                    : "초안을 저장했습니다. 검토 후 게시하면 상담에서 사용할 수 있습니다.",
                );
              })
            }
          />
        ) : (
          <div className="card">
            <h3>검토할 양식을 선택하세요</h3>
            <p>
              왼쪽 목록에서 초안을 열어 문구와 필수 확인 항목을 수정할 수
              있습니다. 게시된 양식은 복제하여 수정합니다.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
function ConsentEditor({
  template,
  dirty,
  onDirty,
  onSave,
  onCancel,
  onClone,
}: {
  template: Consent;
  dirty: boolean;
  onDirty: (value: boolean) => void;
  onSave: (value: Consent, reviewed: boolean) => void;
  onCancel: () => void;
  onClone: () => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const checksRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(template);
  const [checks, setChecks] = useState(template.checks.join("\n"));
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState(false);
  const published = template.status === "published";
  const source = treatmentConsentDrafts.find(
    (t) => t.key === template.draftKey,
  );
  const data = {
    ...value,
    checks: checks
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  const issues = consentPublishIssues(data);
  const reviewItems = (["body", "checks"] as const).flatMap((field) => {
    const text = field === "body" ? value.body : checks;
    return [...text.matchAll(/\[병원 확인\s*[:：][^\]]*(?:\]|$)/g)].map(
      (match) => ({ field, text: match[0], index: match.index! }),
    );
  });
  const highlight = (text: string) =>
    text.split(/(\[병원 확인\s*[:：][^\]]*(?:\]|$))/g).map((part, i) =>
      part.startsWith("[병원 확인") ? (
        <mark className="consent-review-mark" key={i}>
          {part}
        </mark>
      ) : (
        part
      ),
    );
  const jumpToReview = (item: (typeof reviewItems)[number]) => {
    setPreview(false);
    requestAnimationFrame(() => {
      const input = item.field === "body" ? bodyRef.current : checksRef.current;
      input?.focus();
      input?.setSelectionRange(item.index, item.index + item.text.length);
      input?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };
  const change = (patch: Partial<Consent>) => {
    setValue((v) => ({ ...v, ...patch }));
    onDirty(true);
    setReviewed(false);
  };
  return (
    <div className="card consent-editor">
      <div className="button-row">
        <h3>{published ? "게시된 동의서" : "동의서 초안 편집"}</h3>
        <span className="small">
          v{template.version}
          {dirty ? " · 저장하지 않은 변경" : ""}
        </span>
      </div>
      {source && (
        <details className="consent-review-notes consent-review-required" open>
          <summary>
            <span className="consent-review-badge">의료진 검토</span> 검토할
            내용·참고 자료
          </summary>
          <p>
            <b>적용 예시:</b> {source.examples}
          </p>
          <p>
            <b>의료진 확인:</b> {source.review}
          </p>
          <p>
            <b>병원 양식 반영:</b> {source.hospitalReview}
          </p>
          {template.draftRevision !== CONSENT_DRAFT_REVISION && (
            <p className="consent-review-badge">
              이전 초안입니다. 최신 보완본을 등록·업그레이드해 비교하세요.
            </p>
          )}
          <p className="small">
            작성 기준 {CONSENT_DRAFT_REVISION}. 아래 자료는 일반적인 위험 설명의
            참고 자료입니다. 국내 제품의 허가 범위·용량·금기와 해당 병원 장비의
            사용설명서는 별도로 확인해야 합니다.
          </p>
          <ul>
            {source.sources.map((key) => (
              <li key={key}>
                <a
                  href={consentSources[key].url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {consentSources[key].title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <label className="field">
        양식명
        <input
          value={value.name}
          maxLength={200}
          readOnly={published}
          onChange={(e) => change({ name: e.target.value })}
        />
      </label>
      <div className="button-row">
        <b>본문</b>
        <button type="button" onClick={() => setPreview(!preview)}>
          {preview ? "본문 편집 보기" : "환자 화면 미리보기"}
        </button>
      </div>
      {reviewItems.length > 0 && (
        <section
          className="consent-review-required"
          aria-label="검토 필요 항목"
        >
          <b>검토 필요 {reviewItems.length}개</b>
          <p className="small">
            항목을 누르면 수정할 위치가 선택됩니다. 작성 예시는 실제 병원
            기준으로 보완하세요. ‘병원 확정 문구’로 표시된 안내는 그대로 사용할
            수 있습니다. 도움말은 본문에 자동 저장되지 않습니다.
          </p>
          <ul>
            {reviewItems.map((item, i) => {
              const guide = consentReviewGuide(template.draftKey, item.text);
              return (
                <li key={`${item.field}-${item.index}`}>
                  <button
                    type="button"
                    className="consent-review-jump"
                    onClick={() => jumpToReview(item)}
                  >
                    {i + 1}. {item.text}
                  </button>
                  <div className="consent-review-guide">
                    <p>
                      <b>작성 방법</b> {guide.instruction}
                    </p>
                    {guide.reference && (
                      <p className="small">
                        <b>병원 원문 참고 · 기간 확인 필요</b>
                        <br />
                        {guide.reference}
                      </p>
                    )}
                    <b className="small">
                      {guide.confirmed
                        ? "병원 확정 문구 · 추가 검토 불필요"
                        : "작성 예시 · 실제 정보로 수정"}
                    </b>
                    <blockquote>{guide.example}</blockquote>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {preview ? (
        <section className="consent-preview" aria-label="동의서 미리보기">
          <div className="consent-text">{highlight(value.body)}</div>
          <h4>필수 확인 항목</h4>
          {data.checks.map((c, i) => (
            <p key={i}>□ {highlight(c)}</p>
          ))}
          <p className="small">
            서명은 게시된 양식을 상담에서 선택한 뒤 받습니다.
          </p>
        </section>
      ) : (
        <textarea
          ref={bodyRef}
          aria-label="동의서 본문"
          className="consent-body-editor"
          rows={22}
          maxLength={30000}
          value={value.body}
          readOnly={published}
          onChange={(e) => change({ body: e.target.value })}
        />
      )}
      <label className="field">
        필수 확인 항목 (한 줄에 하나)
        <textarea
          ref={checksRef}
          rows={6}
          value={checks}
          readOnly={published}
          onChange={(e) => {
            setChecks(e.target.value);
            onDirty(true);
            setReviewed(false);
          }}
        />
      </label>
      {published ? (
        <>
          <p className="small">
            기존 서명을 보존하기 위해 게시본은 직접 수정할 수 없습니다.
          </p>
          <button type="button" onClick={onClone}>
            복제하여 수정
          </button>
        </>
      ) : (
        <>
          {issues.length > 0 && (
            <div className="consent-review-notes consent-review-required">
              <b>검토 필요 · 게시 전 보완</b>
              <ul>
                {issues.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            담당 의료진이 제품·장비·시술별 내용과 병원 연락처를 검토했고,
            환자에게 사용할 문구를 확인했습니다.
          </label>
          <div className="button-row consent-save-actions">
            <button
              type="button"
              className="primary"
              disabled={!data.name.trim() || !data.body.trim()}
              onClick={() => onSave({ ...data, status: "draft" }, false)}
            >
              초안 저장
            </button>
            <button
              type="button"
              disabled={!!issues.length || !reviewed}
              onClick={() => onSave({ ...data, status: "published" }, true)}
            >
              검토 완료·게시
            </button>
            <button type="button" onClick={onCancel}>
              취소
            </button>
          </div>
        </>
      )}
    </div>
  );
}
