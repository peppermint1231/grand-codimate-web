import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const revisions = (state.catalogRevisions || [])
    .filter((r) => r.book === catalogBook(catalog))
    .slice()
    .reverse();
  const base = latestCatalog(state, catalogBook(catalog)) || catalog;
  return (
    <section className="card catalog-history">
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        <History size={17} />
        수정 이력 · 되돌리기 ({revisions.length})
      </button>
      {open && (
        <>
          <p className="small">
            저장한 시점의 단가표 전체를 복원합니다. 게시 이력은 추천기에
            반영하고, 초안 이력은 새 초안으로 복원합니다. 기존 상담 견적은
            유지됩니다.
          </p>
          {!revisions.length && (
            <p>다음 수정부터 변경 전 내용과 수정 내역을 기록합니다.</p>
          )}
          {revisions.map((r) => (
            <article key={r.id}>
              <div className="section-title">
                <b>
                  {r.action} · {new Date(r.createdAt).toLocaleString("ko-KR")}
                </b>
                <span>
                  {state.users.find((u) => u.id === r.actorId)?.name ||
                    "관리자"}
                </span>
              </div>
              <details>
                <summary>
                  {r.changes.slice(0, 2).join(" · ")}
                  {r.changes.length > 2 ? ` 외 ${r.changes.length - 2}건` : ""}
                </summary>
                <ul>
                  {r.changes.map((change, i) => (
                    <li key={i}>{change}</li>
                  ))}
                </ul>
              </details>
              {canEdit && (
                <button
                  disabled={disabled}
                  onClick={() =>
                    work(async () => {
                      if (
                        window.confirm(
                          r.snapshot.status === "published"
                            ? "이 시점의 폴더·상품·가격·공개 설정 전체를 복원하고 추천기에 반영할까요? 현재 내용도 이력에 보존됩니다."
                            : "이 시점의 내용을 새 초안으로 복원할까요? 검증 후 게시하면 추천기에 반영됩니다.",
                        )
                      )
                        await restore(r.id, base);
                    })
                  }
                >
                  <RotateCcw size={15} />이 시점으로 복원
                </button>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
