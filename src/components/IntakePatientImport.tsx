import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type {
  IntakeSearchResult,
  IntakeSelection,
  IntakeStatus,
} from "../core/intake";
import "./IntakePatientImport.css";

export function IntakePatientImport({
  onSelect,
  onOpenExisting,
}: {
  onSelect: (selection: IntakeSelection) => void;
  onOpenExisting?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<IntakeStatus>();
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("동의서/초진설문지");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<IntakeSearchResult>();
  const [selection, setSelection] = useState<IntakeSelection>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  const run = async (fn: (active: () => boolean) => Promise<void>) => {
    const id = ++epoch.current;
    const active = () => id === epoch.current;
    setBusy(true);
    setError("");
    try {
      await fn(active);
    } catch (e) {
      if (active())
        setError(
          e instanceof Error ? e.message : "초진설문지를 불러오지 못했습니다",
        );
    } finally {
      if (active()) setBusy(false);
    }
  };
  const loadStatus = async () => {
    const next = await api<IntakeStatus>(
      "/intake/settings",
      {},
      { operation: null },
    );
    return next;
  };
  const search = (page = 0) =>
    run(async (active) => {
      setSelection(undefined);
      const next = await api<IntakeSearchResult>(
        "/intake/search?" +
          new URLSearchParams({ q: query, page: String(page) }),
        {},
        { operation: null },
      );
      if (active()) setResult(next);
    });
  return (
    <section
      className="intake-import"
      aria-label="초진설문지 환자 불러오기"
      aria-busy={busy}
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (expanded) {
            setExpanded(false);
            setResult(undefined);
            setSelection(undefined);
            setPassword("");
            return;
          }
          setExpanded(true);
          void run(async (active) => {
            const next = await loadStatus();
            if (active()) {
              setStatus(next);
              setFolder(next.folder);
            }
          });
        }}
      >
        {expanded ? "초진설문지 검색 닫기" : "초진설문지에서 환자 불러오기"}
      </button>
      {expanded && (
        <>
          <p>
            초진설문지에서 작성한 이름·연락처·생년월일·성별·주소·내원경로를
            불러옵니다.
          </p>
          {status && !status.configured && (
            <p>
              먼저 관리자가 초진설문지 연동을 설정해 주세요. 두 앱은 같은
              OneDrive 계정에 연결되어 있어야 합니다.
            </p>
          )}
          {status?.canConfigure && (
            <details open={!status.configured}>
              <summary>초진설문지 연동 설정</summary>
              <p>
                코디메이트에 연결된 OneDrive의 설문지를 읽습니다. 원본 설문지는
                변경하지 않습니다.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async (active) => {
                    await api(
                      "/intake/settings",
                      {
                        method: "POST",
                        body: JSON.stringify({ folder, password }),
                      },
                      { operation: null },
                    );
                    const next = await loadStatus();
                    if (active()) {
                      setPassword("");
                      setStatus(next);
                      setResult(undefined);
                      setSelection(undefined);
                    }
                  });
                }}
              >
                <label>
                  초진설문지 OneDrive 폴더
                  <input
                    value={folder}
                    maxLength={240}
                    required
                    disabled={busy}
                    onChange={(e) => setFolder(e.target.value)}
                  />
                </label>
                <label>
                  초진설문지 관리자 비밀번호
                  <input
                    type="password"
                    autoComplete="off"
                    value={password}
                    maxLength={128}
                    required
                    disabled={busy}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <div className="intake-actions">
                  <button type="submit" disabled={busy}>
                    연결 확인 및 저장
                  </button>
                  {status.configured && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async (active) => {
                          await api(
                            "/intake/settings",
                            {
                              method: "POST",
                              body: JSON.stringify({ enabled: false }),
                            },
                            { operation: null },
                          );
                          const next = await loadStatus();
                          if (active()) {
                            setStatus(next);
                            setPassword("");
                            setResult(undefined);
                            setSelection(undefined);
                          }
                        })
                      }
                    >
                      연동 해제
                    </button>
                  )}
                </div>
              </form>
            </details>
          )}
          {status?.configured && (
            <>
              <form
                className="intake-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
              >
                <label>
                  초진설문지 환자 검색
                  <input
                    value={query}
                    disabled={busy}
                    maxLength={80}
                    placeholder="이름 2자 이상 또는 전화번호 4자리 이상"
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setResult(undefined);
                      setSelection(undefined);
                    }}
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || query.trim().length < 2}
                >
                  검색
                </button>
              </form>
              {result && (
                <div aria-live="polite">
                  <p>
                    {result.total
                      ? `설문지 ${result.total}건 · 최근 작성순`
                      : "검색 결과가 없습니다. 초진설문지 앱에서 OneDrive 동기화 후 다시 검색해 주세요."}
                  </p>
                  <ul className="intake-results">
                    {result.rows.map((row) => (
                      <li key={row.id}>
                        <div>
                          <strong>{row.name}</strong>
                          <span>
                            {row.phone} · {row.createdAt.slice(0, 10)}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async (active) => {
                              const next = await api<IntakeSelection>(
                                "/intake/select",
                                {
                                  method: "POST",
                                  body: JSON.stringify({ id: row.id }),
                                },
                                { operation: null },
                              );
                              if (!active()) return;
                              if (next.matches.length) setSelection(next);
                              else {
                                onSelect(next);
                                setExpanded(false);
                                setResult(undefined);
                              }
                            })
                          }
                        >
                          선택
                        </button>
                      </li>
                    ))}
                  </ul>
                  {result.total > result.pageSize && (
                    <div className="intake-actions">
                      <button
                        type="button"
                        disabled={busy || result.page === 0}
                        onClick={() => void search(result.page - 1)}
                      >
                        이전
                      </button>
                      <span>
                        {result.page + 1} /{" "}
                        {Math.ceil(result.total / result.pageSize)}
                      </span>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          (result.page + 1) * result.pageSize >= result.total
                        }
                        onClick={() => void search(result.page + 1)}
                      >
                        다음
                      </button>
                    </div>
                  )}
                </div>
              )}
              {selection && (
                <div className="warning-panel">
                  <strong>코디메이트에 등록된 환자 후보가 있습니다.</strong>
                  <p>
                    같은 환자라면 기존 기록을 여세요. 동명이인·가족 연락처는
                    자동으로 합치지 않습니다.
                  </p>
                  <ul className="intake-results">
                    {selection.matches.map((p) => (
                      <li key={p.id}>
                        <div>
                          <strong>{p.name}</strong>
                          <span>
                            {p.dob} · {p.phone}
                            {p.archived ? " · 보관된 환자 (복원 필요)" : ""}
                          </span>
                        </div>
                        {!p.archived && onOpenExisting && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onOpenExisting(p.id)}
                          >
                            기존 환자 열기
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {!selection.alreadyImported && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        onSelect(selection);
                        setExpanded(false);
                        setSelection(undefined);
                        setResult(undefined);
                      }}
                    >
                      다른 환자입니다 · 정보 불러오기
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {busy && <p role="status">초진설문지를 확인하고 있습니다…</p>}
          {error && (
            <p role="alert" className="intake-error">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
