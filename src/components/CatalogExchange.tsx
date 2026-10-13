import { useEffect, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import {
  allowed,
  catalogBook,
  catalogBookLabel,
  catalogBookDisplayOrder,
  latestCatalog,
  type Catalog,
  type CatalogBook,
  type State,
  type User,
} from "../core/model";
import { catalogTime, catalogVersionLabel } from "../core/catalogStatus";
import { catalogNodes, folderPath, inFolder } from "../core/catalogFolders";
import {
  catalogCSV,
  catalogWorkbook,
  download,
  downloadWorkbook,
} from "../core/excel";
import { api } from "../lib/api";

export function CatalogExchange({
  state,
  user,
  send,
  onImport,
}: {
  state: State;
  user: User;
  send: (...args: any[]) => Promise<any>;
  onImport: (catalog: Catalog) => void;
}) {
  const [book, setBook] = useState<CatalogBook>("이벤트");
  const [version, setVersion] = useState("");
  const [folder, setFolder] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loaded, setLoaded] = useState<Catalog>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const source =
    state.catalogs.find(
      (c) =>
        c.id === version && catalogBook(c) === book && c.status === "published",
    ) || latestCatalog(state, book);
  const catalog = source?.workspaceOnly
    ? loaded?.id === source.id && loaded.rev === source.rev
      ? loaded
      : undefined
    : source;
  const canEdit = allowed(user, "catalog.edit"),
    canExport = canEdit && allowed(user, "export");
  useEffect(() => {
    setError("");
    setLoaded(undefined);
    if (!source?.workspaceOnly || !canEdit) return;
    const controller = new AbortController();
    api("/catalogs/" + encodeURIComponent(source.id), {
      signal: controller.signal,
    })
      .then(({ catalog }) => {
        if (!controller.signal.aborted) setLoaded(catalog);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [source?.id, source?.rev, source?.workspaceOnly, canEdit, retry]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const filtered = catalog && {
    ...catalog,
    products: catalog.products.filter(
      (p) =>
        (includeInactive || p.active) &&
        (!folder || inFolder(catalog, p, folder)),
    ),
  };
  const exportFile = (format: "csv" | "xlsx") =>
    run(async () => {
      if (!canExport || !filtered || filtered.status !== "published")
        throw Error("게시된 단가표와 내보내기 권한을 확인하세요.");
      if (!(await send("audit.export", { format: "catalog-" + format })))
        return;
      const name = `코디메이트_${catalogBookLabel(book)}_단가표_${new Date().toISOString().slice(0, 10)}.${format}`;
      if (format === "csv") download(catalogCSV(filtered), name);
      else
        await downloadWorkbook(
          await catalogWorkbook(filtered, undefined, true),
          name,
        );
    });
  if (!canEdit) return null;
  return (
    <section className="card catalog-exchange" aria-label="단가표 자료 교환">
      <h3>단가표 자료 교환</h3>
      <p>파일을 가져와 수정하거나, 적용된 단가표를 CSV·Excel로 내려받습니다.</p>
      <div className="form-grid">
        <label className="field">
          <span>단가표 구분</span>
          <select
            aria-label="자료 교환 단가표"
            disabled={busy}
            value={book}
            onChange={(e) => {
              setBook(e.target.value as CatalogBook);
              setVersion("");
              setFolder("");
            }}
          >
            {catalogBookDisplayOrder.map((b) => (
              <option key={b} value={b}>
                {catalogBookLabel(b)} SSOT
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>내보낼 버전</span>
          <select
            aria-label="내보낼 단가표 버전"
            disabled={busy}
            value={source?.id || ""}
            onChange={(e) => {
              setVersion(e.target.value);
              setFolder("");
            }}
          >
            {!source && <option value="">게시된 단가표 없음</option>}
            {state.catalogs
              .filter(
                (c) => catalogBook(c) === book && c.status === "published",
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {catalogVersionLabel(c)}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>내보낼 폴더</span>
          <select
            aria-label="내보낼 폴더"
            disabled={!catalog || busy}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          >
            <option value="">전체 폴더</option>
            {catalog &&
              catalogNodes(catalog).map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPath(catalog, f.id)
                    .map((n) => n.name)
                    .join(" / ")}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          disabled={busy}
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
        />
        비활성 포함 내보내기
      </label>
      {source && !catalog && !error && (
        <p role="status">선택한 단가표 원본을 불러오는 중입니다…</p>
      )}
      {catalog && (
        <p className="small">
          적용 시각 {catalogTime(catalog.publishedAt || catalog.updatedAt)} ·
          내보낼 상품 {filtered?.products.length}개
        </p>
      )}
      <div className="button-row">
        <button
          disabled={!catalog || !canExport || busy}
          onClick={() => void exportFile("csv")}
        >
          CSV 자료 교환
        </button>
        <button
          disabled={!catalog || !canExport || busy}
          onClick={() => void exportFile("xlsx")}
        >
          <FileSpreadsheet size={18} />
          Excel 다운로드
        </button>
      </div>
      {!canExport && (
        <p className="permission-notice">내보내기 권한이 필요합니다.</p>
      )}
      <hr />
      <h4>JSON 가져와 수정</h4>
      <p className="small">
        선택한 {catalogBookLabel(book)} SSOT의 편집 화면으로 이동합니다. 내용을
        확인하고 ‘저장하고 적용’을 눌러야 반영됩니다.
      </p>
      <label className="button">
        <Upload size={18} />
        JSON 가져와 수정
        <input
          type="file"
          aria-label="단가표 JSON 파일"
          disabled={busy}
          hidden
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file)
              void run(async () => {
                const value = JSON.parse(await file.text());
                if (
                  !value ||
                  value.schemaVersion !== 1 ||
                  !Array.isArray(value.products) ||
                  !Array.isArray(value.references)
                )
                  throw Error("변환된 단가표 JSON을 선택하세요.");
                const now = new Date().toISOString();
                onImport({
                  ...value,
                  book,
                  id: crypto.randomUUID(),
                  rev: 0,
                  status: "draft",
                  workspaceOnly: undefined,
                  publishedAt: undefined,
                  createdAt: now,
                  updatedAt: now,
                });
              });
          }}
        />
      </label>
      {busy && <p role="status">자료를 처리하고 있습니다…</p>}
      {error && (
        <div role="alert" className="error">
          {error}
          {source?.workspaceOnly && !catalog && (
            <button onClick={() => setRetry((n) => n + 1)}>
              원본 다시 불러오기
            </button>
          )}
        </div>
      )}
    </section>
  );
}
