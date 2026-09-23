import { api } from "../lib/api";
import { catalogTime } from "../core/catalogStatus";
import { useEffect, useRef, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { useAppBack } from "../lib/navigation";
import {
  catalogBook,
  latestCatalog,
  type Catalog,
  type State,
} from "../core/model";
export function CatalogHistory({
  state,
  catalog,
  disabled,
  canEdit,
  restore,
  work,
}: {
  state: State;
  catalog: Catalog;
  disabled: boolean;
  canEdit: boolean;
  restore: (revisionId: string, base: Catalog) => Promise<unknown>;
  work: (f: () => Promise<unknown>) => unknown;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState("");
  const trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLElement>(null);
  const [remote, setRemote] = useState<State["catalogRevisions"] | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    setRemote(null);
    api("/catalog-history?book=" + encodeURIComponent(catalogBook(catalog)))
      .then((d) => {
        if (active) setRemote(d.revisions);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, catalog.id, catalog.rev]);
  const revisions = (remote || state.catalogRevisions || [])
    .filter((r) => r.book === catalogBook(catalog))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const revision = revisions.find((r) => r.id === selected);
  const base = latestCatalog(state, catalogBook(catalog)) || catalog;
  useAppBack(open, () => setOpen(false), 90);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
      if (e.key === "Tab") {
        const nodes = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [tabindex="0"]',
          ) || []),
        ];
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key, true);
      trigger.current?.focus();
    };
  }, [open]);
  return (
    <section className="card catalog-history">
      <button
        ref={trigger}
        onClick={() => {
          setSelected("");
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <History size={17} />
        수정 이력 · 되돌리기
      </button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <section
            ref={dialog}
            className="modal catalog-history-dialog"
            data-catalog-history-dialog
            role="dialog"
            aria-modal="true"
            aria-label="수정 이력 · 되돌리기"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-title">
              <h2>수정 이력 · 되돌리기</h2>
              <button onClick={() => setOpen(false)}>닫기</button>
            </div>
            <p className="small">
              {catalogBook(catalog)} SSOT · 목록에서 저장 시점을 선택하세요.
              게시 이력은 추천기에 반영하고, 초안 이력은 새 초안으로 복원합니다.
              기존 상담 견적은 유지됩니다.
            </p>
            {disabled && (
              <p className="catalog-history-warning">
                편집 중인 내용을 먼저 저장하거나 취소한 뒤 복원하세요.
              </p>
            )}
            {loading ? (
              <p role="status">이력을 불러오는 중입니다…</p>
            ) : error ? (
              <p role="alert">{error}</p>
            ) : !revisions.length ? (
              <p>다음 수정부터 변경 전 내용과 수정 내역을 기록합니다.</p>
            ) : (
              <div className="catalog-history-browser">
                <div
                  className="catalog-history-list"
                  role="group"
                  aria-label="저장 이력 목록"
                >
                  {revisions.map((r) => (
                    <button
                      key={r.id}
                      className="catalog-history-choice"
                      aria-pressed={selected === r.id}
                      onClick={() => setSelected(r.id)}
                    >
                      <strong>{r.action}</strong>
                      <span>{catalogTime(r.createdAt)}</span>
                      <small>
                        {state.users.find((u) => u.id === r.actorId)?.name ||
                          "관리자"}{" "}
                        · {r.changes.length}개 변경
                      </small>
                      <span className="history-summary">
                        {r.changes.slice(0, 2).join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="catalog-history-preview" aria-live="polite">
                  {!revision ? (
                    <p className="small">
                      복원할 이력을 선택하면 변경 내용을 확인할 수 있습니다.
                    </p>
                  ) : (
                    <>
                      <h3>{revision.action}</h3>
                      <p className="small">
                        {catalogTime(revision.createdAt)} ·{" "}
                        {revision.snapshot.status === "published"
                          ? "게시본"
                          : "초안"}
                      </p>
                      <p className="small">
                        이 시점의 폴더·상품·가격·공개 설정 전체를 복원합니다.
                      </p>
                      <ul>
                        {revision.changes.map((change, i) => (
                          <li key={i}>{change}</li>
                        ))}
                      </ul>
                      {canEdit && (
                        <button
                          className="primary"
                          disabled={disabled}
                          onClick={() =>
                            work(async () => {
                              if (
                                !window.confirm(
                                  revision.snapshot.status === "published"
                                    ? "이 시점의 폴더·상품·가격·공개 설정 전체를 복원하고 추천기에 반영할까요? 현재 내용도 이력에 보존됩니다."
                                    : "이 시점의 내용을 새 초안으로 복원할까요? 검증 후 게시하면 추천기에 반영됩니다.",
                                )
                              )
                                return;
                              if (await restore(revision.id, base))
                                setOpen(false);
                            })
                          }
                        >
                          <RotateCcw size={15} />이 시점으로 복원
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
