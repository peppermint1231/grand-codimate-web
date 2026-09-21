import { DiscoveryDesk } from "./components/Discovery";
import { CatalogProductRows } from "./components/CatalogOrganizer";
import { FolderWorkspace } from "./components/FolderWorkspace";
import { CatalogHistory } from "./components/CatalogHistory";
import {
  inFolder,
  folderPath,
  productFolder,
  rootFolders,
  catalogNodes,
  editableTree,
} from "./core/catalogFolders";
import { appBack, useAppBack } from "./lib/navigation";
import { QuoteTotals } from "./components/QuoteTotals";
import { AddressSearch } from "./components/AddressSearch";
import {
  PhotoBoard,
  HistoryPhotoPicker,
  ConsultationCover,
} from "./components/PhotoBoard";
import { consultationKind, packageActive, productCategory } from "./core/model";
import { native, takePhoto, printPage } from "./lib/native";
import { requestAndroidUpdate } from "./components/AndroidUpdateNotice";
import { needsServer, configureServer } from "./lib/api";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Camera,
  Users,
  ClipboardList,
  Settings,
  BarChart3,
  LogOut,
  Plus,
  Search,
  ArrowLeft,
  Check,
  Cloud,
  FileSpreadsheet,
  ChevronRight,
  HeartHandshake,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  emptyState,
  emptyQuote,
  latestCatalog,
  latestCatalogs,
  catalogBooks,
  catalogBook,
  type CatalogBook,
  allowed,
  age,
  money,
  permissions,
  type State,
  type User,
  type Patient,
  type Consultation,
  type Command,
  type Catalog,
  type Product,
  type Photo,
} from "./core/model";
import {
  applyCommand,
  calculate,
  renewalQuote,
  metrics,
  gradeFor,
  duplicates,
  activeLedger,
  consentContent,
  sha,
} from "./core/domain";
import {
  api,
  command,
  makeCommand,
  setToken,
  unlockVault,
  rememberLogin,
  restoreLogin,
  forgetLogin,
  lockVault,
  vaultRead,
  vaultWrite,
  vaultEnabled,
  recoveryCommands,
  upload,
  stagePhoto,
  type CachedSession,
} from "./lib/api";
import {
  catalogWorkbook,
  catalogCSV,
  statisticsWorkbook,
  downloadWorkbook,
  download,
} from "./core/excel";
import { consultationPDF, quoteJPG, documentName } from "./lib/documents";
import {
  PhotoEditor,
  SignaturePad,
  annotatedBlob,
} from "./components/PhotoEditor";
const names: Record<string, string> = {
  "patient.edit": "환자정보 편집",
  "money.read": "금액 열람",
  "receipt.create": "수납 등록",
  "refund.create": "환불 등록",
  "ledger.correct": "금액 정정",
  "note.read": "환자 메모 열람",
  "note.edit": "메모 작성",
  "grade.edit": "등급 지정",
  "catalog.edit": "단가표 관리",
  "stats.read": "통계",
  export: "내보내기",
  "followup.edit": "후속 상태 변경",
};
const date = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const status = (c: Consultation) =>
  c.cancelled
    ? "취소"
    : c.kind === "interim"
      ? { H: "보류", P: "완료", F: "중단" }[c.status]
      : { H: "보류", P: "성공", F: "실패" }[c.status];
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <HeartHandshake size={36} />
      <p>{children}</p>
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  useAppBack(true, close, 80);
  return (
    <div className="overlay" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-title">
          <h2>{title}</h2>
          <button onClick={close}>닫기</button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function App() {
  const [state, setState] = useState<State>(emptyState()),
    [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState("patients"),
    [patientId, setPatientId] = useState(""),
    [consultId, setConsultId] = useState(""),
    [tab, setTab] = useState("photo"),
    [health, setHealth] = useState<any>({}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Command[]>([]),
    [modal, setModal] = useState(""),
    [guest, setGuest] = useState(false),
    [guestPhotos, setGuestPhotos] = useState<{ url: string; file: File }[]>([]);
  const [restoring, setRestoring] = useState(!needsServer);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("codimate-sidebar-collapsed") === "true",
  );
  const [loginIds, setLoginIds] = useState<string[]>([]);
  const [loginName, setLoginName] = useState("");
  useEffect(() => {
    if (user || needsServer) return;
    let active = true;
    api("/login-ids")
      .then((d) => {
        if (active) setLoginIds(d.usernames);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, health.needsSetup]);
  const routes = useRef<
    { page: string; patientId: string; consultId: string; tab: string }[]
  >([]);
  const route = useRef({ page, patientId, consultId, tab });
  const returning = useRef(false);
  useEffect(() => {
    const next = { page, patientId, consultId, tab };
    if (JSON.stringify(next) !== JSON.stringify(route.current)) {
      if (!returning.current) routes.current.push(route.current);
      route.current = next;
      returning.current = false;
    }
  }, [page, patientId, consultId, tab]);
  useAppBack(
    true,
    () => {
      if (modal) {
        setModal("");
        return;
      }
      if (guest) {
        setGuest(false);
        return;
      }
      if (
        !window.dispatchEvent(
          new Event("codimate:before-photo-leave", { cancelable: true }),
        )
      )
        return;
      const previous = routes.current.pop();
      if (previous) {
        returning.current = true;
        setPage(previous.page);
        setPatientId(previous.patientId);
        setConsultId(previous.consultId);
        setTab(previous.tab);
      } else {
        setNotice("첫 화면입니다.");
      }
    },
    0,
  );
  const restoreNeeded = useRef(true);
  const workInFlight = useRef(false);
  useEffect(() => {
    const beforeInstall = (event: Event) => {
      if (workInFlight.current || pending.length) event.preventDefault();
    };
    window.addEventListener("codimate:before-install", beforeInstall);
    return () =>
      window.removeEventListener("codimate:before-install", beforeInstall);
  }, [pending.length]);
  const work = async (fn: () => Promise<unknown>) => {
    if (workInFlight.current) return;
    workInFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다");
    } finally {
      workInFlight.current = false;
      setBusy(false);
    }
  };
  const refresh = async (preserveConsult = false) => {
    const d = await api("/state");
    setState((previous) => {
      const open =
        preserveConsult && page === "consult"
          ? previous.consultations.find((c) => c.id === consultId)
          : undefined;
      return open
        ? {
            ...d.state,
            consultations: d.state.consultations.map((c: Consultation) =>
              c.id === open.id ? open : c,
            ),
          }
        : d.state;
    });
    setHealth((h: any) => ({ ...h, ...d }));
    if (vaultEnabled())
      await vaultWrite("session", {
        state: d.state,
        user: d.user,
        savedAt: Date.now(),
      });
    return d.state as State;
  };
  useEffect(() => {
    if (needsServer) return;
    api("/health")
      .then((d) => setHealth((h: any) => ({ ...h, ...d })))
      .catch(() => setError("서버에 연결할 수 없습니다."));
  }, []);
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        !pending.length &&
        !consultId
      )
        refresh().catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [user, pending.length, consultId]);
  const execute = async (c: Command) => {
    if (vaultEnabled()) {
      const q = [
        ...((await vaultRead<Command[]>("pending")) || []).filter(
          (x) => x.id !== c.id,
        ),
        c,
      ];
      await vaultWrite("pending", q);
      setPending(q);
    }
    try {
      await command(c);
      if (c.type === "consultation.save" && vaultEnabled())
        await vaultWrite("draft:" + c.entityId, null);
      if (vaultEnabled()) {
        const q = ((await vaultRead<Command[]>("pending")) || []).filter(
          (x) => x.id !== c.id,
        );
        await vaultWrite("pending", q);
        setPending(q);
      }
      await refresh();
      setNotice(
        health.mode === "local-development"
          ? "개발 서버에 저장했습니다."
          : "OneDrive에 저장했습니다.",
      );
      return true;
    } catch (e: any) {
      if (!e.status || e.status >= 500) {
        if (!vaultEnabled())
          throw new Error(
            e.message +
              " · 기기 보관을 설정하지 않아 대기열에 저장하지 못했습니다. 화면 내용을 유지하세요.",
          );
        const queue = [
          ...((await vaultRead<Command[]>("pending")) || pending).filter(
            (x) => x.id !== c.id,
          ),
          c,
        ];
        await vaultWrite("pending", queue);
        setPending(queue);
        if (
          [
            "patient.create",
            "consultation.create",
            "consultation.save",
            "note.save",
          ].includes(c.type)
        ) {
          try {
            const next = await applyCommand(state, user!, c);
            setState(next);
            const cached = await vaultRead<CachedSession>("session");
            if (cached) await vaultWrite("session", { ...cached, state: next });
          } catch {}
        }
        setNotice("기기에 저장됨 · 동기화 대기");
        return false;
      }
      if (vaultEnabled()) {
        const q = ((await vaultRead<Command[]>("pending")) || []).filter(
          (x) => x.id !== c.id,
        );
        await vaultWrite("conflict:" + c.id, c);
        await vaultWrite("pending", q);
        setPending(q);
      }
      throw e;
    }
  };
  const send = (
    type: string,
    payload: Record<string, unknown>,
    entityId?: string,
    baseRev?: number,
  ) => execute(makeCommand(type, payload, entityId, baseRev));
  const sync = () =>
    work(async () => {
      for (const c of pending) {
        await command(c);
        const q = ((await vaultRead<Command[]>("pending")) || []).filter(
          (x) => x.id !== c.id,
        );
        await vaultWrite("pending", q);
        setPending(q);
      }
      await api("/sync", { method: "POST" });
      await refresh();
      setNotice("동기화를 완료했습니다.");
    });
  const patient = state.patients.find((p) => p.id === patientId),
    consult = state.consultations.find((c) => c.id === consultId);
  const newConsult = (
    p: Patient,
    kind: Consultation["kind"] = "initial",
    sourceConsultationId?: string,
    selectedCategory?: "미용" | "보험",
  ) =>
    work(async () => {
      const id = crypto.randomUUID();
      await send(
        "consultation.create",
        {
          patientId: p.id,
          kind,
          sourceConsultationId,
          sourceRev: sourceConsultationId
            ? state.consultations.find((c) => c.id === sourceConsultationId)
                ?.rev
            : undefined,
          category:
            selectedCategory ||
            (window.confirm(
              "미용 상담을 시작할까요? 취소를 누르면 보험 상담을 시작합니다.",
            )
              ? "미용"
              : "보험"),
        },
        id,
      );
      setPatientId(p.id);
      setConsultId(id);
      setPage("consult");
      setTab("photo");
      return true;
    });
  const logout = () => {
    if (
      pending.length &&
      !window.confirm(
        "기기 대기 자료가 있습니다. 로그아웃 후 같은 기기 보관 암호로 복구해야 합니다.",
      )
    )
      return;
    api("/logout", { method: "POST" }).catch(() => {});
    restoreNeeded.current = false;
    forgetLogin();
    lockVault();
    setUser(null);
    setState(emptyState());
    setPending([]);
    setConsultId("");
    setPatientId("");
    setPage("patients");
    setTab("photo");
  };
  useEffect(() => {
    if (needsServer) return;
    let live = true,
      checking = false;
    let controller: AbortController | undefined;
    const restore = async () => {
      if (checking || !restoreNeeded.current) return;
      checking = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15000);
      try {
        await restoreLogin();
        const d = await api("/state", { signal: controller.signal });
        if (live) {
          restoreNeeded.current = false;
          setUser(d.user);
          setState(d.state);
          setHealth((h: any) => ({ ...h, ...d }));
        }
      } catch (e: any) {
        if (live && e.status === 401) {
          restoreNeeded.current = false;
          forgetLogin();
        }
      } finally {
        clearTimeout(timeout);
        checking = false;
        if (live) setRestoring(false);
      }
    };
    void restore();
    const online = () => {
      void restore();
    };
    window.addEventListener("online", online);
    return () => {
      live = false;
      controller?.abort();
      window.removeEventListener("online", online);
    };
  }, []);
  if (restoring)
    return (
      <div className="login-page" role="status">
        로그인을 복원하고 있습니다…
      </div>
    );
  if (needsServer)
    return (
      <div className="login-page">
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            work(async () =>
              configureServer(
                String(new FormData(e.currentTarget).get("server")),
              ),
            );
          }}
        >
          <h1>병원 서버 연결</h1>
          <p>배포된 코디메이트 웹 주소를 입력하세요.</p>
          <input
            type="url"
            name="server"
            placeholder="https://codimate.example.workers.dev"
            required
          />
          <button className="primary">연결</button>
          {error && <p role="alert">{error}</p>}
        </form>
      </div>
    );
  if (!user)
    return (
      <div className="login-page">
        <div className="login-brand">
          <span className="brand-icon">
            <HeartHandshake size={30} />
          </span>
          <b>코디메이트</b>
          <span>GRAND · CONSULTATION WORKSPACE</span>
        </div>
        <main className="welcome">
          <p className="eyebrow">상담에 집중하는 시간</p>
          <h1>
            사진 한 장에서,
            <br />
            <em>더 깊은 상담으로.</em>
          </h1>
          <p className="intro">
            환자의 이야기와 사진, 시술 계획을
            <br />
            하나의 공간에서 이어갑니다.
          </p>
          <div className="welcome-actions">
            <button className="primary" onClick={() => setGuest(true)}>
              <Camera /> 사진 촬영
            </button>
            <button onClick={() => setGuest(false)}>
              <Users /> 상담 로그인
            </button>
          </div>
          <span className="small">
            사진 촬영은 로그인 없이 이용할 수 있습니다.
          </span>
        </main>
        <section className="login-card">
          <p className="eyebrow">
            {guest
              ? "PHOTO STUDIO"
              : health.needsSetup
                ? "INITIAL SETUP"
                : "WELCOME BACK"}
          </p>
          <h2>
            {guest
              ? "상담 전 사진 준비"
              : health.needsSetup
                ? "첫 관리자 등록"
                : "상담실에 오신 것을 환영합니다"}
          </h2>
          {guest ? (
            <>
              <input
                aria-label="사진 촬영 또는 선택"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => {
                  for (const file of Array.from(e.target.files || []))
                    setGuestPhotos((p) => [
                      ...p,
                      { file, url: URL.createObjectURL(file) },
                    ]);
                }}
              />
              <div className="thumbnails">
                {guestPhotos.map((p, i) => (
                  <img key={i} src={p.url} alt={`촬영 ${i + 1}`} />
                ))}
              </div>
              <p className="small">
                로그인 후 환자 상담에 연결하세요. 이 화면의 미연결 사진은 현재
                창에만 보관됩니다.
              </p>
              <button onClick={() => setGuest(false)}>로그인하고 연결</button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                work(async () => {
                  if (health.needsSetup) {
                    await api("/setup", {
                      method: "POST",
                      body: JSON.stringify(Object.fromEntries(data)),
                    });
                    setHealth({ ...health, needsSetup: false });
                    setNotice("관리자 등록 완료. 로그인하세요.");
                    return;
                  }
                  const username = String(data.get("username")),
                    password = String(data.get("password"));
                  const d = await api("/login", {
                    method: "POST",
                    body: JSON.stringify({ username, password }),
                  });
                  restoreNeeded.current = false;
                  setToken(d.token);
                  await rememberLogin(d.token);
                  if (data.get("trusted")) {
                    await unlockVault(
                      d.user.id,
                      String(data.get("vaultPassword")),
                    );
                    const q = (await vaultRead<Command[]>("pending")) || [];
                    setPending(q);
                  }
                  setUser(d.user);
                  await refresh();
                });
              }}
            >
              {health.needsSetup && (
                <>
                  <Field label="초기 설정 키">
                    <input
                      name="key"
                      type="password"
                      required
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="관리자 이름">
                    <input name="name" required />
                  </Field>
                </>
              )}
              {!health.needsSetup && loginIds.length > 0 && (
                <Field label="등록된 아이디 선택">
                  <select
                    aria-label="등록된 아이디 선택"
                    value={loginIds.includes(loginName) ? loginName : ""}
                    onChange={(e) => setLoginName(e.target.value)}
                  >
                    <option value="">직접 입력</option>
                    {loginIds.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="아이디">
                <input
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  name="username"
                  required
                  autoComplete="username"
                  placeholder="개인 계정 아이디"
                />
              </Field>
              <Field label="비밀번호">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={health.needsSetup ? 12 : 1}
                  autoComplete={
                    health.needsSetup ? "new-password" : "current-password"
                  }
                  placeholder="비밀번호 입력"
                />
              </Field>
              {!health.needsSetup && (
                <details>
                  <summary>병원 기기에서 오프라인 보관 사용</summary>
                  <label className="check">
                    <input name="trusted" type="checkbox" /> 이 기기에 암호화
                    보관
                  </label>
                  <Field label="기기 보관 암호 (12자 이상)">
                    <input
                      name="vaultPassword"
                      type="password"
                      minLength={12}
                    />
                  </Field>
                  <p className="small">
                    계정 비밀번호와 별도로 설정하며, 잊으면 기기 대기 자료를
                    복구할 수 없습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const id = window.prompt(
                          "이 기기에 마지막 로그인한 사용자 ID",
                        ),
                        pass = window.prompt("기기 보관 암호");
                      if (id && pass)
                        work(async () => {
                          await unlockVault(id, pass);
                          const cached =
                            await vaultRead<CachedSession>("session");
                          if (
                            !cached ||
                            Date.now() - cached.savedAt > 12 * 3600000
                          )
                            throw new Error(
                              "오프라인 로그인 유효기간(12시간)이 지났습니다. 온라인 로그인하세요.",
                            );
                          setState(cached.state);
                          setUser(cached.user);
                          setPending(
                            (await vaultRead<Command[]>("pending")) || [],
                          );
                          setNotice("오프라인 · 기기 보관 자료");
                        });
                    }}
                  >
                    오프라인 잠금 해제
                  </button>
                </details>
              )}
              <button className="primary full" disabled={busy}>
                {busy
                  ? "연결 중…"
                  : health.needsSetup
                    ? "관리자 등록"
                    : "로그인"}{" "}
                <ChevronRight size={18} />
              </button>
            </form>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {notice && <p className="notice">{notice}</p>}
          <p className="login-foot">
            {health.mode === "local-development"
              ? "개발 환경 · 실제 환자정보 입력 전 운영 연결 필요"
              : "병원 직원 전용 · 안전한 상담 기록"}
          </p>
        </section>
      </div>
    );
  return (
    <div
      className={"app-shell" + (sidebarCollapsed ? " sidebar-collapsed" : "")}
    >
      <aside className="sidebar" id="main-navigation">
        <div className="logo">
          <HeartHandshake />
          <div>
            코디메이트<small>GRAND CLINIC</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        {[
          ["patients", "환자목록", Users],
          ["consultations", "상담이력", ClipboardList],
          ["stats", "통계", BarChart3],
          ["catalog", "단가표 관리", FileSpreadsheet],
          ["discovery", "맞춤 시술 찾기", HeartHandshake],
          ["settings", "설정", Settings],
        ].map(([key, label, Icon]: any) => (
          <button
            key={key}
            aria-label={label}
            title={label}
            className={"nav-item " + (page === key ? "active" : "")}
            onClick={() => {
              if (
                !window.dispatchEvent(
                  new Event("codimate:before-photo-leave", {
                    cancelable: true,
                  }),
                )
              )
                return;
              setPage(key);
              setConsultId("");
              setPatientId("");
            }}
          >
            <Icon size={20} />
            {label}
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="avatar">{user.name.slice(0, 1)}</div>
          <div>
            <b>{user.name}</b>
            <small>
              {user.role === "admin"
                ? "관리자"
                : user.role === "doctor"
                  ? "의사"
                  : "코디네이터"}
            </small>
          </div>
          <button aria-label="로그아웃" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <button
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
            aria-expanded={!sidebarCollapsed}
            aria-controls="main-navigation"
            onClick={() => {
              const next = !sidebarCollapsed;
              setSidebarCollapsed(next);
              localStorage.setItem("codimate-sidebar-collapsed", String(next));
            }}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={22} />
            ) : (
              <PanelLeftClose size={22} />
            )}
          </button>
          <div>
            <span className="small">GRAND 아름다운의원</span>
            <span className="today">
              {new Date().toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </span>
          </div>
          <div className="top-actions">
            <button aria-label="뒤로가기" onClick={appBack}>
              ← 뒤로
            </button>
            <button
              disabled={busy}
              onClick={() =>
                work(async () => {
                  await refresh(true);
                  setNotice(
                    "최신 자료를 불러왔습니다. 작업 중인 상담은 유지됩니다.",
                  );
                })
              }
            >
              새로고침
            </button>
            <button onClick={() => setModal("recovery")}>복구 자료</button>
            <button
              onClick={() =>
                work(async () => {
                  if (native) {
                    requestAndroidUpdate();
                    return;
                  }
                  const r = await api("/update");
                  if (!r) throw new Error("게시된 업데이트가 없습니다.");
                  if (
                    window.confirm(
                      `${r.version}\n${r.notes}\n업데이트 파일을 열까요?`,
                    )
                  ) {
                    window.open(r.url, "_blank", "noopener,noreferrer");
                  }
                })
              }
            >
              업데이트
            </button>

            <span className={"sync " + (pending.length ? "warning" : "")}>
              <Cloud size={16} />
              {pending.length
                ? `기기 저장 · ${pending.length}건 대기`
                : health.mode === "local-development"
                  ? "개발 서버"
                  : health.driveConnected
                    ? "OneDrive 연결됨"
                    : "OneDrive 연결 필요"}
            </span>
            {pending.length > 0 && <button onClick={sync}>재시도</button>}
            <button
              aria-label="의견 요청 알림"
              onClick={() => setModal("opinions")}
            >
              <Bell size={20} />
              <span>
                {
                  state.opinions.filter((o) => o.toId === user.id && !o.answer)
                    .length
                }
              </span>
            </button>
          </div>
        </header>
        {error && (
          <div className="error floating" role="alert">
            {error}
            <button onClick={() => setError("")}>닫기</button>
          </div>
        )}
        {notice && (
          <div className="notice" onClick={() => setNotice("")}>
            {notice}
          </div>
        )}
        <div className="content">
          {page === "patients" && !patient && (
            <button
              className="card discovery-home-entry"
              onClick={() => setPage("discovery")}
            >
              <HeartHandshake size={24} />
              <span>
                <b>맞춤 시술 찾기</b>
                <small>환자용 웹 화면 열기 · 새 상담 요청 확인</small>
              </span>
              <ChevronRight size={20} />
            </button>
          )}
          {page === "patients" &&
            (patient ? (
              <PatientDetail
                patient={patient}
                state={state}
                user={user}
                back={() => setPatientId("")}
                start={(kind, source, category) =>
                  newConsult(patient, kind, source, category)
                }
                send={(...args: Parameters<typeof send>) =>
                  work(() => send(...args))
                }
                open={(c) => {
                  setConsultId(c.id);
                  setPage("consult");
                  setTab("consult");
                }}
              />
            ) : (
              <Patients
                state={state}
                user={user}
                select={setPatientId}
                create={() => setModal("patient")}
                send={(...args: Parameters<typeof send>) =>
                  work(() => send(...args))
                }
              />
            ))}
          {page === "consultations" && (
            <>
              <Title
                title="상담이력"
                description="함께 이어온 상담을 한눈에 확인하세요."
              />
              <div className="card">
                {state.consultations.length ? (
                  state.consultations
                    .slice()
                    .reverse()
                    .map((c) => (
                      <button
                        className="list-row"
                        key={c.id}
                        onClick={() => {
                          setConsultId(c.id);
                          setPatientId(c.patientId);
                          setPage("consult");
                          setTab("consult");
                        }}
                      >
                        <span>
                          <b>{c.patient.name}</b>
                          <small>
                            {c.createdAt.slice(0, 10)} · {c.category}
                          </small>
                        </span>
                        <span className={"badge " + c.status}>{status(c)}</span>
                        <span>{money(c.quote.total)}</span>
                        <ChevronRight />
                      </button>
                    ))
                ) : (
                  <Empty>환자목록에서 첫 상담을 시작하세요.</Empty>
                )}
              </div>
            </>
          )}
          {page === "consult" && consult && (
            <ConsultationView
              key={consult.id + "-" + consult.rev}
              consult={consult}
              state={state}
              user={user}
              tab={tab}
              setTab={setTab}
              send={send}
              work={work}
              back={() => {
                setPage("patients");
                setPatientId(consult.patientId);
                setConsultId("");
              }}
              guestPhotos={guestPhotos}
              clearGuest={() => {
                guestPhotos.forEach((p) => URL.revokeObjectURL(p.url));
                setGuestPhotos([]);
              }}
            />
          )}
          {page === "discovery" && (
            <DiscoveryDesk
              state={state}
              publicUrl={health.publicUrl || location.origin + "/discover"}
              work={work}
              openConsult={async (patientId, consultationId) => {
                await refresh();
                setPatientId(patientId);
                setConsultId(consultationId);
                setPage("consult");
                setTab("consult");
              }}
            />
          )}
          {page === "catalog" && (
            <CatalogView state={state} user={user} send={send} work={work} />
          )}
          {page === "stats" &&
            (allowed(user, "stats.read") ? (
              <Stats state={state} work={work} user={user} send={send} />
            ) : (
              <Empty>통계 열람 권한이 필요합니다.</Empty>
            ))}
          {page === "settings" && (
            <>
              <div className="card">
                <h3>이 기기의 오프라인 보관</h3>
                <p>
                  {vaultEnabled()
                    ? "암호화 기기 보관이 활성화되어 있습니다."
                    : "로그인 유지와 별도로, 기기 보관 암호로 초안·미전송 자료를 열 수 있습니다."}
                </p>
                {!vaultEnabled() && (
                  <button
                    onClick={() =>
                      work(async () => {
                        const pass =
                          window.prompt("기기 보관 암호 (12자 이상)");
                        if (!pass) return;
                        await unlockVault(user.id, pass);
                        setPending(
                          (await vaultRead<Command[]>("pending")) || [],
                        );
                        setNotice(
                          "기기 보관을 열었습니다. 미전송 자료가 있으면 재시도하세요.",
                        );
                      })
                    }
                  >
                    기기 보관 잠금 해제·설정
                  </button>
                )}
              </div>
              <SettingsView
                state={state}
                user={user}
                send={send}
                work={work}
                refresh={refresh}
                health={health}
              />
            </>
          )}
        </div>
      </main>
      {busy && <div className="busy-bar" />}
      {modal === "recovery" && (
        <Modal title="미전송·충돌 자료 보관함" close={() => setModal("")}>
          <RecoveryView pending={pending} state={state} />
        </Modal>
      )}
      {modal === "patient" && (
        <Modal title="새 환자 등록" close={() => setModal("")}>
          <PatientForm
            state={state}
            save={(data) =>
              work(async () => {
                const id = crypto.randomUUID();
                await send("patient.create", data, id);
                setModal("");
                setPatientId(id);
              })
            }
          />
        </Modal>
      )}
      {modal === "opinions" && (
        <Modal title="의견 요청·답변" close={() => setModal("")}>
          {state.opinions.length ? (
            state.opinions
              .slice()
              .reverse()
              .map((o) => (
                <div className="card" key={o.id}>
                  <b>
                    {
                      state.consultations.find((c) => c.id === o.consultationId)
                        ?.patient.name
                    }{" "}
                    님
                  </b>
                  <p>{o.request}</p>
                  {o.answer ? (
                    <p className="notice">{o.answer}</p>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const answer = new FormData(e.currentTarget).get(
                          "answer",
                        );
                        work(() =>
                          send("opinion.answer", { answer }, o.id, o.rev),
                        );
                      }}
                    >
                      <textarea
                        name="answer"
                        required
                        placeholder="의견을 작성하세요"
                      />
                      <button className="primary">답변 저장</button>
                    </form>
                  )}
                </div>
              ))
          ) : (
            <Empty>의견 요청이 없습니다.</Empty>
          )}
        </Modal>
      )}
    </div>
  );
}
function Title({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">CODIMATE WORKSPACE</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Patients({
  state,
  user,
  select,
  create,
  send,
}: {
  state: State;
  user: User;
  select: (id: string) => void;
  create: () => void;
  send: (
    type: string,
    payload: Record<string, unknown>,
    id?: string,
    rev?: number,
  ) => Promise<unknown>;
}) {
  const [search, setSearch] = useState(""),
    [grade, setGrade] = useState(""),
    [sort, setSort] = useState("recent"),
    [unpaid, setUnpaid] = useState(false),
    [owner, setOwner] = useState(""),
    [consultStatus, setConsultStatus] = useState(""),
    [since, setSince] = useState("");
  const [editing, setEditing] = useState<Patient | null>(null);
  const [duplicateId, setDuplicateId] = useState("");
  const [mergePair, setMergePair] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [archived, setArchived] = useState(false),
    [duplicateOnly, setDuplicateOnly] = useState(false);
  const candidates = (p: Patient) =>
    duplicates(state, p).filter((x) => x.id !== p.id);
  const duplicatePatient = state.patients.find((p) => p.id === duplicateId);
  const archive = async (p: Patient) => {
    if (
      !window.confirm(
        p.archived
          ? `${p.name} 환자를 목록에 복원할까요?`
          : `${p.name} 환자를 목록에서 삭제할까요? 상담·수납·사진 기록은 보존되며 삭제 목록에서 복원할 수 있습니다.`,
      )
    )
      return;
    await send("patient.archive", { archived: !p.archived }, p.id, p.rev);
  };
  const ps = state.patients
    .filter(
      (p) =>
        !p.mergedInto &&
        !!p.archived === archived &&
        (!duplicateOnly || candidates(p).length > 0),
    )
    .map((p) => ({
      p,
      m: metrics(state, p.id),
      g: gradeFor(state, p),
      cs: state.consultations.filter((c) => c.patientId === p.id),
    }))
    .filter(
      ({ p, g, m, cs }) =>
        [p.name, p.phone, p.dob, p.id].some((x) =>
          x.toLowerCase().includes(search.toLowerCase()),
        ) &&
        (!owner ||
          p.ownerId === owner ||
          cs.some((c) => c.ownerId === owner)) &&
        (!consultStatus ||
          cs.some((c) => c.status === consultStatus && !c.cancelled)) &&
        (!since || cs.some((c) => c.createdAt.slice(0, 10) >= since)) &&
        (!grade || g.id === grade) &&
        (!unpaid || m.outstanding > 0),
    )
    .sort((a, b) =>
      sort === "revenue"
        ? b.m.revenue - a.m.revenue
        : sort === "name"
          ? a.p.name.localeCompare(b.p.name)
          : (b.cs.at(-1)?.createdAt || b.p.createdAt).localeCompare(
              a.cs.at(-1)?.createdAt || a.p.createdAt,
            ),
    );
  return (
    <>
      <Title
        title="환자목록"
        description="환자의 이야기와 상담 기록을 한곳에서 이어가세요."
        action={
          <button className="primary" onClick={create}>
            <Plus size={20} />새 환자 등록
          </button>
        }
      />
      <div className="summary-grid">
        <Summary
          label="전체 환자"
          value={`${state.patients.filter((p) => !p.mergedInto && !p.archived).length}명`}
          detail="함께하고 있는 환자"
        />
        <Summary
          label="보류 상담"
          value={`${state.consultations.filter((c) => c.status === "H").length}건`}
          detail="이어서 상담할 기록"
        />
        <Summary
          label="기여매출"
          value={
            allowed(user, "money.read")
              ? money(
                  state.patients
                    .filter((p) => !p.mergedInto)
                    .reduce((a, p) => a + metrics(state, p.id).revenue, 0),
                )
              : "권한 필요"
          }
          detail="실수납 − 실제 환불"
        />
      </div>
      <div className="card">
        <div className="table-toolbar">
          <label className="check">
            <input
              type="checkbox"
              checked={duplicateOnly}
              onChange={(e) => setDuplicateOnly(e.target.checked)}
            />
            중복 의심만
          </label>
          {user.role === "admin" && (
            <label className="check">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              삭제된 환자
            </label>
          )}
          <div className="search">
            <Search size={19} />
            <input
              aria-label="환자 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 전화번호, 생년월일로 검색"
            />
          </div>
          <select
            aria-label="등급 필터"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            <option value="">모든 등급</option>
            {state.policies[0]?.grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            aria-label="정렬"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">최근 상담순</option>
            <option value="name">이름순</option>
            <option value="revenue">기여매출순</option>
          </select>
          <select
            aria-label="담당 직원 필터"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">모든 직원</option>
            {state.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            aria-label="상담 상태 필터"
            value={consultStatus}
            onChange={(e) => setConsultStatus(e.target.value)}
          >
            <option value="">모든 상태</option>
            <option value="H">보류</option>
            <option value="P">성공</option>
            <option value="F">실패</option>
          </select>
          <input
            aria-label="상담 시작일 필터"
            title="이 날짜 이후 상담한 환자"
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={unpaid}
              onChange={(e) => setUnpaid(e.target.checked)}
            />
            미납
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>환자</th>
                <th>연락처</th>
                <th>최근 상담</th>
                <th>계약금액</th>
                <th>기여매출</th>
                <th>미수금</th>
                <th>등급</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {ps.map(({ p, m, g, cs }) => (
                <tr
                  key={p.id}
                  onClick={() => select(p.id)}
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.target === e.currentTarget &&
                    e.key === "Enter" &&
                    select(p.id)
                  }
                >
                  <td>
                    <div className="person">
                      <span className="patient-avatar">{p.name[0]}</span>
                      <span>
                        <b>{p.name}</b>
                        <small>환자번호 {p.number || p.id}</small>
                        {!!candidates(p).length && (
                          <button
                            className="duplicate-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDuplicateId(p.id);
                              setMergePair(null);
                            }}
                          >
                            중복 의심 {candidates(p).length}명 · 비교
                          </button>
                        )}
                        {(["미용", "보험"] as const).map(
                          (category) =>
                            cs.some(
                              (c) =>
                                c.category === category && packageActive(c),
                            ) && (
                              <span className="badge P" key={category}>
                                {category} 진행 중
                              </span>
                            ),
                        )}
                        <small>
                          {age(p.dob)}세 ·{" "}
                          {p.sex === "M"
                            ? "남성"
                            : p.sex === "F"
                              ? "여성"
                              : "미상"}{" "}
                          · 상담 {cs.length}건
                        </small>
                      </span>
                    </div>
                  </td>
                  <td>{p.phone}</td>
                  <td>{cs.at(-1)?.createdAt.slice(0, 10) || "—"}</td>
                  <td>
                    {allowed(user, "money.read") ? money(m.contract) : "—"}
                  </td>
                  <td className="emphasis">
                    {allowed(user, "money.read") ? money(m.revenue) : "—"}
                  </td>
                  <td>
                    {allowed(user, "money.read") ? money(m.outstanding) : "—"}
                  </td>
                  <td>
                    <span className="grade" style={{ color: g.color }}>
                      {g.name}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="button-row patient-actions">
                      {allowed(user, "patient.edit") && !p.archived && (
                        <button
                          aria-label={`${p.name} 환자 수정`}
                          onClick={() => setEditing(p)}
                        >
                          수정
                        </button>
                      )}
                      {user.role === "admin" && (
                        <button
                          aria-label={`${p.name} 환자 ${p.archived ? "복원" : "삭제"}`}
                          onClick={() => void archive(p)}
                        >
                          {p.archived ? "복원" : "삭제"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!ps.length && (
          <Empty>
            등록된 환자가 없습니다. 새 환자를 등록해 상담을 시작하세요.
          </Empty>
        )}
      </div>
      {editing && (
        <Modal title="환자정보 수정" close={() => setEditing(null)}>
          <PatientForm
            state={state}
            patient={editing}
            save={async (d) => {
              if (await send("patient.update", d, editing.id, editing.rev))
                setEditing(null);
            }}
          />
        </Modal>
      )}
      {duplicatePatient && (
        <Modal
          title="중복 의심 환자 비교·병합"
          close={() => {
            setDuplicateId("");
            setMergePair(null);
          }}
        >
          <p>
            이름·생년월일 또는 전화번호가 같습니다. 가족 연락처와 동명이인을
            확인한 뒤 같은 환자일 때만 병합하세요.
          </p>
          <div className="duplicate-summary">
            <b>현재 환자: {duplicatePatient.name}</b>
            <p>
              {duplicatePatient.number || duplicatePatient.id} ·{" "}
              {duplicatePatient.dob} · {duplicatePatient.phone}
            </p>
          </div>
          {candidates(duplicatePatient).map((candidate) => (
            <div className="duplicate-summary" key={candidate.id}>
              <b>{candidate.name}</b>
              <p>
                {candidate.number || candidate.id} · {candidate.dob} ·{" "}
                {candidate.phone}
              </p>
              <p>
                {candidate.address} · 상담{" "}
                {
                  state.consultations.filter(
                    (c) => c.patientId === candidate.id,
                  ).length
                }
                건
              </p>
              <div className="button-row">
                <button
                  onClick={() => {
                    setDuplicateId("");
                    select(candidate.id);
                  }}
                >
                  이 환자 기록 열기
                </button>
                {user.role === "admin" && (
                  <>
                    <button
                      onClick={() =>
                        setMergePair({
                          from: duplicatePatient.id,
                          to: candidate.id,
                        })
                      }
                    >
                      이 환자를 남기고 병합
                    </button>
                    <button
                      onClick={() =>
                        setMergePair({
                          from: candidate.id,
                          to: duplicatePatient.id,
                        })
                      }
                    >
                      현재 환자를 남기고 병합
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!candidates(duplicatePatient).length && (
            <p>현재 중복 의심 환자가 없습니다.</p>
          )}
          {user.role !== "admin" && <p>병합은 관리자가 할 수 있습니다.</p>}
          {mergePair && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const from = state.patients.find(
                    (p) => p.id === mergePair.from,
                  )!,
                  to = state.patients.find((p) => p.id === mergePair.to)!;
                const reason = new FormData(e.currentTarget).get("reason");
                if (
                  !window.confirm(
                    `${from.name} (${from.number || from.id})의 기록을 ${to.name} (${to.number || to.id})에게 연결합니다. 진행할까요?`,
                  )
                )
                  return;
                if (
                  await send(
                    "patient.merge",
                    { targetId: to.id, targetRev: to.rev, reason },
                    from.id,
                    from.rev,
                  )
                ) {
                  setDuplicateId("");
                  setMergePair(null);
                  select(to.id);
                }
              }}
            >
              <p>
                <strong>
                  남길 환자번호:{" "}
                  {state.patients.find((p) => p.id === mergePair.to)?.number ||
                    mergePair.to}
                </strong>
              </p>
              <p>
                상담·수납·사진 연결을 보존합니다. 실제 중복 수납은 별도로
                정정하세요.
              </p>
              <Field label="병합 사유">
                <input name="reason" required />
              </Field>
              <button className="primary">병합 확정</button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
function Summary({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="summary">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function PatientForm({
  state,
  patient,
  save,
}: {
  state: State;
  patient?: Patient;
  save: (data: Record<string, unknown>) => void;
}) {
  const [data, setData] = useState({
    name: patient?.name || "",
    sex: patient?.sex || "F",
    dob: patient?.dob || "",
    phone: patient?.phone || "",
    address: patient?.address || "",
  });
  const found = duplicates(state, data).filter((p) => p.id !== patient?.id);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (
          found.length &&
          !window.confirm(
            "기존 환자 후보가 있습니다. 별도의 환자로 등록할까요?",
          )
        )
          return;
        save(data);
      }}
    >
      <div className="form-grid">
        {[
          ["name", "이름"],
          ["dob", "생년월일"],
          ["phone", "전화번호"],
          ["address", "주소 (동까지)"],
        ].map(([k, label]) => (
          <Field key={k} label={label}>
            {k === "address" ? (
              <AddressSearch
                value={data.address}
                onChange={(address) => setData({ ...data, address })}
              />
            ) : (
              <input
                type={k === "dob" ? "date" : "text"}
                value={data[k as keyof typeof data]}
                required
                onChange={(e) => setData({ ...data, [k]: e.target.value })}
              />
            )}
          </Field>
        ))}
        <Field label="성별">
          <select
            value={data.sex}
            onChange={(e) =>
              setData({ ...data, sex: e.target.value as Patient["sex"] })
            }
          >
            <option value="F">여성</option>
            <option value="M">남성</option>
            <option value="U">미상</option>
          </select>
        </Field>
      </div>
      {found.length > 0 && (
        <div className="warning-panel">
          기존 환자 후보:{" "}
          {found.map((p) => `${p.name} (${p.dob}, ${p.phone})`).join(", ")}
          <p>동명이인·가족 연락처는 자동 병합하지 않습니다.</p>
        </div>
      )}
      <button className="primary">저장</button>
    </form>
  );
}
function PatientDetail({
  patient: p,
  state: s,
  user,
  back,
  start,
  send,
  open,
}: {
  patient: Patient;
  state: State;
  user: User;
  back: () => void;
  start: (
    kind?: Consultation["kind"],
    source?: string,
    category?: "미용" | "보험",
  ) => Promise<unknown>;
  send: (...args: any[]) => any;
  open: (c: Consultation) => void;
}) {
  const [tab, setTab] = useState("history"),
    [edit, setEdit] = useState(false),
    [starting, setStarting] = useState<Consultation["kind"] | null>(null),
    [startCategory, setStartCategory] = useState<"미용" | "보험">("미용"),
    [sourceId, setSourceId] = useState("");
  const m = metrics(s, p.id),
    g = gradeFor(s, p),
    cs = s.consultations.filter((c) => c.patientId === p.id);
  const sources = cs.filter(
    (x) =>
      x.category === startCategory &&
      !x.cancelled &&
      x.kind !== "interim" &&
      (starting !== "renewal" || x.status === "P"),
  );
  const source = sources.find((x) => x.id === sourceId);
  let renewalPreview: ReturnType<typeof renewalQuote> | undefined;
  let renewalError = "";
  if (starting === "renewal" && source) {
    try {
      renewalPreview = renewalQuote(source, latestCatalogs(s), "preview");
    } catch (e) {
      renewalError = (e as Error).message;
    }
  }
  return (
    <>
      <button className="back" onClick={back}>
        <ArrowLeft size={18} />
        환자목록
      </button>
      <Title
        title={`${p.name} 님`}
        description={`${age(p.dob)}세 · ${p.dob} · ${p.phone}`}
        action={
          <div className="button-row">
            <button
              className="primary"
              onClick={() => {
                setStarting("initial");
                setSourceId("");
              }}
            >
              <Plus size={18} />새 상담 시작
            </button>
            <button
              onClick={() => {
                setStarting("interim");
                setSourceId("");
              }}
            >
              중간상담
            </button>
            <button
              onClick={() => {
                setStarting("renewal");
                setSourceId("");
              }}
            >
              연장상담
            </button>
          </div>
        }
      />
      {starting && (
        <Modal
          title={
            starting === "interim"
              ? "중간상담 시작"
              : starting === "renewal"
                ? "연장상담 시작"
                : "새 상담 시작"
          }
          close={() => setStarting(null)}
        >
          <Field label="상담 구분">
            <select
              value={startCategory}
              onChange={(e) => {
                setStartCategory(e.target.value as "미용" | "보험");
                setSourceId("");
              }}
            >
              <option>미용</option>
              <option>보험</option>
            </select>
          </Field>
          {starting !== "initial" && (
            <>
              <Field label="이어갈 이전 상담">
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                >
                  <option value="">이전 상담 선택</option>
                  {sources
                    .slice()
                    .reverse()
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.createdAt.slice(0, 10)} ·{" "}
                        {x.quote.lines
                          .map((l) => l.name + " " + l.label)
                          .join(", ") || "사진 상담"}{" "}
                        · {consultationKind(x)} · {status(x)}
                        {x.status === "P"
                          ? ` · ${packageActive(x) ? "진행 중" : "완료"}`
                          : ""}
                      </option>
                    ))}
                </select>
              </Field>
              {!sources.length && (
                <p className="small">
                  이 구분에 선택할 수 있는 이전 시술 상담이 없습니다.
                </p>
              )}
              {source && (
                <div
                  className="followup-preview"
                  aria-label="이전 상담 미리보기"
                >
                  <strong>
                    {source.createdAt.slice(0, 10)} · {consultationKind(source)}
                  </strong>
                  <p>
                    사진 {source.photos.length}장 · {source.photoColumns || 2}열
                    배치
                  </p>
                  <p>
                    기준 상담: {status(source)}
                    {source.status === "P"
                      ? ` · 패키지 ${packageActive(source) ? "진행 중" : "완료"}`
                      : ""}
                  </p>
                  {renewalPreview && (
                    <p>
                      이전 견적 {money(source.quote.total)} → 현재 단가 견적{" "}
                      {money(renewalPreview.total)} · 할인 초기화
                    </p>
                  )}
                </div>
              )}
              {renewalError && (
                <p className="error" role="alert">
                  {renewalError}
                </p>
              )}
              <p className="small">
                이전 사진과 주석을 불러온 뒤 비교할 사진을 선택합니다.
                {starting === "renewal"
                  ? " 기존 시술은 현재 게시 단가로 담으며, 이전 할인은 자동 적용하지 않습니다."
                  : ""}
              </p>
            </>
          )}
          <button
            className="primary"
            disabled={starting !== "initial" && (!source || !!renewalError)}
            onClick={async () => {
              if (await start(starting, sourceId || undefined, startCategory))
                setStarting(null);
            }}
          >
            상담 시작
          </button>
        </Modal>
      )}
      <div className="card package-summary">
        <h3>패키지 진행 상태</h3>
        {cs.filter(
          (x) => x.status === "P" && !x.cancelled && x.kind !== "interim",
        ).length === 0 ? (
          <p className="small">성공 확정하면 진행 중으로 표시됩니다.</p>
        ) : (
          cs
            .filter(
              (x) => x.status === "P" && !x.cancelled && x.kind !== "interim",
            )
            .slice()
            .reverse()
            .map((x) => (
              <div className="list-row" key={x.id}>
                <span>
                  <b>
                    {x.category} ·{" "}
                    {x.quote.lines.map((l) => l.name).join(", ") || "시술 상담"}
                  </b>
                  <small>{x.createdAt.slice(0, 10)}</small>
                </span>
                <span className={"badge " + (packageActive(x) ? "P" : "")}>
                  {packageActive(x) ? "진행 중" : "완료"}
                </span>
                {allowed(user, "followup.edit") && (
                  <button
                    onClick={() =>
                      send(
                        "consultation.package",
                        { complete: packageActive(x) },
                        x.id,
                        x.rev,
                      )
                    }
                  >
                    {packageActive(x) ? "완료로 전환" : "진행 중으로 전환"}
                  </button>
                )}
              </div>
            ))
        )}
      </div>
      <div className="patient-banner">
        <span className="grade" style={{ color: g.color }}>
          {g.name} · {g.manual ? "관리자 지정" : "자동 산정"}
        </span>
        <span>{p.address}</span>
        <small>환자번호 {p.number || p.id}</small>
        {allowed(user, "patient.edit") && (
          <button onClick={() => setEdit(true)}>정보 수정</button>
        )}
      </div>
      {allowed(user, "money.read") && (
        <div className="summary-grid four">
          <Summary
            label="유효 계약금액"
            value={money(m.contract)}
            detail="취소 계약 제외"
          />
          <Summary
            label="기여매출"
            value={money(m.revenue)}
            detail={`수납 ${money(m.receipts)} − 환불 ${money(m.refunds)}`}
          />
          <Summary
            label="미수금"
            value={money(m.outstanding)}
            detail="상담별 잔액 합계"
          />
          <Summary
            label="상담 횟수"
            value={`${cs.length}건`}
            detail={`시술 성공 ${cs.filter((c) => c.status === "P" && !c.cancelled && c.kind !== "interim").length}건 · 중간 완료 ${cs.filter((c) => c.status === "P" && !c.cancelled && c.kind === "interim").length}건`}
          />
        </div>
      )}
      <div className="tabs">
        {[
          ["history", "상담·타임라인"],
          ["money", "수납·환불"],
          ["notes", "환자 메모"],
          ["grade", "등급·관리"],
        ].map(([k, l]) => (
          <button
            className={tab === k ? "active" : ""}
            key={k}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "history" && (
        <div className="detail-grid">
          <div className="card">
            <h3>상담이력</h3>
            {cs.length ? (
              cs
                .slice()
                .reverse()
                .map((c) => (
                  <button
                    className="list-row"
                    key={c.id}
                    onClick={() => open(c)}
                  >
                    <span>
                      <b>
                        {c.category} · {consultationKind(c)}
                      </b>
                      <small>{c.createdAt.slice(0, 10)}</small>
                    </span>
                    <ConsultationCover photos={c.photos} />
                    <span className={"badge " + c.status}>{status(c)}</span>
                    <span>{money(c.quote.total)}</span>
                    <ChevronRight size={18} />
                  </button>
                ))
            ) : (
              <Empty>아직 상담이 없습니다.</Empty>
            )}
          </div>
          <div className="card">
            <h3>활동 타임라인</h3>
            {s.events
              .filter((e) => e.patientId === p.id)
              .slice()
              .reverse()
              .map((e) => (
                <div className="timeline" key={e.id}>
                  <span className="dot" />
                  <div>
                    <b>{e.text}</b>
                    <small>
                      {new Date(e.createdAt).toLocaleString("ko-KR")} ·{" "}
                      {s.users.find((u) => u.id === e.actorId)?.name}
                    </small>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      {tab === "notes" && allowed(user, "note.read") && (
        <div className="detail-grid">
          <div className="card">
            <h3>환자 메모</h3>
            {s.notes
              .filter((n) => n.patientId === p.id)
              .map((n) => (
                <article className="note" key={n.id}>
                  <b>{n.important ? "★ 중요 메모" : "메모"}</b>
                  <p>{n.text}</p>
                  <small>
                    {s.users.find((u) => u.id === n.authorId)?.name} ·{" "}
                    {n.updatedAt.slice(0, 10)}
                  </small>
                  {(n.authorId === user.id || user.role === "admin") && (
                    <button
                      onClick={() => {
                        const text = window.prompt("메모 수정", n.text);
                        if (text)
                          send(
                            "note.save",
                            { patientId: p.id, text, important: n.important },
                            n.id,
                            n.rev,
                          );
                      }}
                    >
                      수정
                    </button>
                  )}
                </article>
              ))}
          </div>
          {allowed(user, "note.edit") && (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                send("note.save", {
                  patientId: p.id,
                  text: d.get("text"),
                  important: !!d.get("important"),
                });
                e.currentTarget.reset();
              }}
            >
              <h3>메모 남기기</h3>
              <textarea
                name="text"
                required
                placeholder="상담 선호, 연락 요청 등 다음 상담에 필요한 내용을 남기세요."
              />
              <label className="check">
                <input type="checkbox" name="important" />
                중요 표시
              </label>
              <button className="primary">메모 저장</button>
            </form>
          )}
        </div>
      )}
      {tab === "money" && allowed(user, "money.read") && (
        <div className="detail-grid">
          <div className="card">
            <h3>수납·환불 기록</h3>
            {s.ledger
              .filter((l) => l.patientId === p.id)
              .slice()
              .reverse()
              .map((l) => (
                <div className="list-row" key={l.id}>
                  <span>
                    <b>
                      {
                        {
                          receipt: "수납",
                          refund: "환불",
                          reversal: "정정 취소",
                        }[l.kind]
                      }{" "}
                      · {money(l.amount)}
                    </b>
                    <small>
                      {l.date} · {l.method} · {l.memo}
                    </small>
                  </span>
                  {l.kind !== "reversal" &&
                    allowed(user, "ledger.correct") &&
                    activeLedger(s).some((x) => x.id === l.id) && (
                      <button
                        onClick={() => {
                          const memo = window.prompt("정정 사유");
                          if (memo)
                            send("ledger.create", {
                              kind: "reversal",
                              consultationId: l.consultationId,
                              originalId: l.id,
                              amount: l.amount,
                              date: date(),
                              method: l.method,
                              memo,
                            });
                        }}
                      >
                        정정
                      </button>
                    )}
                </div>
              ))}
          </div>
          <LedgerForm state={s} patient={p} send={send} />
        </div>
      )}
      {tab === "grade" && (
        <div className="card">
          <h3>환자 등급</h3>
          <p>
            누적 기여매출 {money(m.revenue)} · 현재 {g.name} (
            {g.manual ? "관리자 지정" : "자동 산정"})
          </p>
          {allowed(user, "grade.edit") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                send(
                  "grade.override",
                  { gradeId: d.get("gradeId"), reason: d.get("reason") },
                  p.id,
                  p.rev,
                );
              }}
            >
              <Field label="등급">
                <select name="gradeId">
                  <option value="">자동 산정으로 복귀</option>
                  {s.policies[0]?.grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="지정 사유">
                <input name="reason" />
              </Field>
              <button className="primary">등급 적용</button>
            </form>
          )}
          {user.role === "admin" && (
            <details>
              <summary>중복 환자 병합</summary>
              <p>
                이 환자의 상담·수납·이력을 선택한 환자에게 연결합니다. 실제 중복
                수납은 별도로 정정하세요.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  if (
                    window.confirm(
                      "환자정보와 이력을 확인했나요? 병합 이력이 남습니다.",
                    )
                  )
                    send(
                      "patient.merge",
                      {
                        targetId: d.get("targetId"),
                        targetRev: s.patients.find(
                          (x) => x.id === d.get("targetId"),
                        )?.rev,
                        reason: d.get("reason"),
                      },
                      p.id,
                      p.rev,
                    );
                }}
              >
                <select name="targetId">
                  {s.patients
                    .filter((x) => x.id !== p.id && !x.mergedInto)
                    .map((x) => (
                      <option value={x.id} key={x.id}>
                        {x.name} · {x.dob} · {x.phone}
                      </option>
                    ))}
                </select>
                <input name="reason" required placeholder="병합 사유" />
                <button>병합</button>
              </form>
            </details>
          )}
        </div>
      )}
      {edit && (
        <Modal title="환자정보 수정" close={() => setEdit(false)}>
          <PatientForm
            state={s}
            patient={p}
            save={(d) => {
              send("patient.update", d, p.id, p.rev);
              setEdit(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}
function LedgerForm({
  state: s,
  patient: p,
  send,
}: {
  state: State;
  patient: Patient;
  send: (...args: any[]) => any;
}) {
  const [kind, setKind] = useState("receipt");
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.currentTarget));
        send("ledger.create", { ...d, amount: Number(d.amount) });
      }}
    >
      <h3>금액 기록</h3>
      <Field label="구분">
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="receipt">수납</option>
          <option value="refund">환불</option>
        </select>
      </Field>
      <Field label="연결 상담">
        <select name="consultationId" required>
          {s.consultations
            .filter((c) => c.patientId === p.id && c.status === "P")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.createdAt.slice(0, 10)} · {c.category} ·{" "}
                {money(c.quote.total)}
                {c.cancelled ? " (취소)" : ""}
              </option>
            ))}
        </select>
      </Field>
      {kind === "refund" && (
        <Field label="원수납">
          <select name="originalId" required>
            {activeLedger(s)
              .filter((l) => l.patientId === p.id && l.kind === "receipt")
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.date} · {money(l.amount)}
                </option>
              ))}
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field label="금액">
          <input name="amount" type="number" min={1} required />
        </Field>
        <Field label="처리일">
          <input name="date" type="date" defaultValue={date()} required />
        </Field>
        <Field label="방법">
          <select name="method">
            <option>카드</option>
            <option>현금</option>
            <option>계좌이체</option>
            <option>기타</option>
          </select>
        </Field>
        <Field label="메모·사유">
          <input name="memo" required={kind === "refund"} />
        </Field>
      </div>
      <button className="primary">기록 확정</button>
      <p className="small">온라인 확인 후 기여매출·미수금·등급에 반영됩니다.</p>
    </form>
  );
}
function ConsultationView({
  consult: c,
  state: s,
  user,
  tab,
  setTab,
  send,
  work,
  back,
  guestPhotos,
  clearGuest,
}: {
  consult: Consultation;
  state: State;
  user: User;
  tab: string;
  setTab: (t: string) => void;
  send: (...args: any[]) => Promise<any>;
  work: (f: () => Promise<any>) => any;
  back: () => void;
  guestPhotos: { url: string; file: File }[];
  clearGuest: () => void;
}) {
  const [draft, setDraft] = useState(c),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [productLimit, setProductLimit] = useState(70),
    [historyOpen, setHistoryOpen] = useState(false),
    [adding, setAdding] = useState(false),
    [photoError, setPhotoError] = useState(""),
    [ratio, setRatio] = useState(50),
    [sig, setSig] = useState(""),
    [template, setTemplate] = useState(""),
    [checks, setChecks] = useState<string[]>([]),
    [signer, setSigner] = useState(c.patient.name);
  const [book, setBook] = useState<CatalogBook>(c.category);
  const bookVersion =
    draft.catalogVersions?.[book] ||
    (book === "미용" ? draft.catalogVersion : undefined);
  const catalog = bookVersion
    ? s.catalogs.find(
        (x) =>
          x.status === "published" &&
          x.version === bookVersion &&
          catalogBook(x) === book,
      )
    : latestCatalog(s, book);
  const source = s.consultations.find((x) => x.id === c.sourceConsultationId);
  const sourceInvalid =
    c.kind === "renewal" &&
    (!source ||
      source.cancelled ||
      source.status !== "P" ||
      source.kind === "interim" ||
      source.patientId !== c.patientId ||
      source.category !== c.category);
  const readonly = !(
    user.role === "admin" ||
    (c.status === "H" && !c.cancelled && c.ownerId === user.id)
  );
  const availableProducts = (catalog?.products || []).filter((p) => p.active);
  const query = search.trim().toLocaleLowerCase();
  const products = availableProducts.filter(
    (p) =>
      (!category || (catalog && inFolder(catalog, p, category))) &&
      [
        p.name,
        p.category,
        p.description,
        p.composition,
        ...p.options.map((o) => o.label),
      ].some((text) => text.toLocaleLowerCase().includes(query)),
  );
  useEffect(() => setProductLimit(70), [search, category]);
  let quote = draft.quote;
  let quoteError = "";
  try {
    quote = calculate(
      draft.quote.lines,
      draft.quote.discount,
      draft.quote.vat,
      draft.quote.reason,
    );
  } catch (e) {
    quoteError = (e as Error).message;
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(c);
  const validationError =
    quoteError ||
    (quote.discountTotal > 0 && !draft.quote.reason.trim()
      ? "할인 사유를 입력하세요."
      : "") ||
    (c.status !== "H" && dirty && !readonly && !draft.quote.reason.trim()
      ? "확정 상담 수정 사유를 입력하세요."
      : "");
  const [draftReady, setDraftReady] = useState(false);
  const [localSaved, setLocalSaved] = useState(false);
  useEffect(() => {
    let active = true;
    vaultRead<Consultation>("draft:" + c.id)
      .then((saved) => {
        if (!active) return;
        if (
          saved &&
          JSON.stringify(saved) !== JSON.stringify(c) &&
          window.confirm(
            saved.rev === c.rev
              ? "이 기기에 저장된 상담 초안을 이어서 작성할까요?"
              : "서버에 새 버전이 있습니다. 기기 초안을 열어 비교할까요? 저장 시 충돌 검사를 진행합니다.",
          )
        )
          setDraft({ ...saved, photos: c.photos });
        setDraftReady(true);
      })
      .catch(() => setDraftReady(true));
    return () => {
      active = false;
    };
  }, [c.id, c.rev]);
  useEffect(() => {
    if (!draftReady || !vaultEnabled()) return;
    setLocalSaved(false);
    const t = setTimeout(() => {
      vaultWrite("draft:" + c.id, { ...draft, photos: c.photos }).then(() =>
        setLocalSaved(true),
      );
    }, 350);
    return () => clearTimeout(t);
  }, [draft, draftReady]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!localSaved && JSON.stringify(draft) !== JSON.stringify(c)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, localSaved]);

  const updateQuote = (patch: Partial<typeof draft.quote>) =>
    setDraft({ ...draft, quote: { ...draft.quote, ...patch } });
  const save = () => {
    if (
      !window.dispatchEvent(
        new Event("codimate:before-consult-save", { cancelable: true }),
      )
    )
      throw new Error("편집기에서 ‘사진 편집 저장’을 먼저 눌러주세요.");
    if (validationError) throw new Error(validationError);
    return send(
      "consultation.save",
      {
        lines: draft.quote.lines,
        discount: draft.quote.discount,
        vat: draft.quote.vat,
        memo: draft.memo,
        photos: draft.photos,
        photoColumns: draft.photoColumns || 2,
        reason: draft.quote.reason,
        catalogVersion: draft.catalogVersion,
        catalogVersions: draft.catalogVersions,
      },
      c.id,
      draft.rev,
    );
  };
  const addPhotos = async (files: File[]) => {
    if (adding) return;
    if (draft.photos.length + files.length > 50) {
      setPhotoError("상담당 사진은 50장까지 추가할 수 있습니다.");
      return;
    }
    setAdding(true);
    setPhotoError("");
    try {
      for (const file of files) {
        const photo = await stagePhoto(file, c.id, user.id);
        setDraft((current) => ({
          ...current,
          photos: [...current.photos, photo],
        }));
      }
      clearGuest();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "사진 추가 실패");
    } finally {
      setAdding(false);
    }
  };
  const historyPhotos = s.consultations
    .filter(
      (x) =>
        x.id !== c.id &&
        x.patientId === c.patientId &&
        x.category === c.category,
    )
    .flatMap((x) =>
      x.photos.map((p) => ({
        ...p,
        capturedAt: p.capturedAt || x.createdAt,
        sourceConsultationId: x.id,
        sourcePhotoId: p.id,
      })),
    )
    .filter(
      (p, index, all) =>
        all.findIndex((x) => x.id === p.id) === index &&
        !draft.photos.some((x) => x.mediaId === p.mediaId),
    );
  const author = s.users.find((u) => u.id === c.ownerId) || user;
  const pdf = async (statusOverride?: "P" | "F") => {
    if (quoteError) throw new Error(quoteError);
    const images = [];
    for (const p of draft.photos.filter((p) => p.selected)) {
      const b = await annotatedBlob(p);
      images.push({ bytes: await b.arrayBuffer(), type: b.type });
    }
    return consultationPDF(
      { ...draft, quote, status: statusOverride || draft.status },
      author,
      images,
      s.signatures.filter((x) => x.consultationId === c.id),
      s.opinions.filter((x) => x.consultationId === c.id),
    );
  };
  return (
    <>
      {validationError && (
        <div className="error" role="alert">
          {validationError}
        </div>
      )}
      {localSaved && (
        <p className="small">
          기기 초안 저장됨 · 공유하려면 보류 저장을 눌러주세요
        </p>
      )}
      <button className="back" onClick={back}>
        <ArrowLeft size={18} />
        환자 상세
      </button>
      <Title
        title={`${c.patient.name} 님의 상담`}
        description={`${consultationKind(c)} · ${c.category} · ${age(c.patient.dob)}세 · ${status(c)} · ${c.createdAt.slice(0, 10)}`}
        action={
          <>
            <span className={"badge " + c.status}>{status(c)}</span>
            <button
              className="primary"
              disabled={readonly || !!validationError}
              onClick={() => work(save)}
            >
              <Check size={18} />
              보류·변경 저장
            </button>
          </>
        }
      />
      {c.sourceConsultationId && c.kind !== "initial" && (
        <div className="followup-preview" aria-label="기준 상담 정보">
          <strong>{consultationKind(c)}의 기준 상담</strong>
          {source ? (
            <p>
              {source.createdAt.slice(0, 10)} · {source.category} ·{" "}
              {consultationKind(source)} · {status(source)} · 패키지{" "}
              {packageActive(source) ? "진행 중" : "완료"}
            </p>
          ) : (
            <p>기준 상담을 찾을 수 없습니다.</p>
          )}
          <p>
            {c.kind === "interim"
              ? "중간상담을 완료해도 기존 패키지의 진행 상태는 유지됩니다."
              : "연장 확정 시 기존 패키지는 완료되고 새 상담이 진행 중이 됩니다. 연장 안 함은 기존 패키지만 완료합니다."}
          </p>
          {c.kind === "renewal" &&
            c.status === "H" &&
            source &&
            c.sourceRev !== undefined &&
            c.sourceRev !== source.rev && (
              <p className="small">
                상담 시작 후 기준 상담이 변경됐습니다. 현재 상태를 확인한 뒤
                확정하세요.
              </p>
            )}
          {sourceInvalid && (
            <p className="error" role="alert">
              기준 상담이 취소되었거나 연장할 수 없는 상태입니다.
            </p>
          )}
        </div>
      )}
      <div className="tabs">
        {[
          ["photo", "01  사진"],
          ["consult", "02  상담"],
          ["quote", c.kind === "interim" ? "03  상담결과" : "03  견적서"],
        ].map(([t, l]) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {l}
          </button>
        ))}
        <div className="tab-spacer" />
        <select
          aria-label="화면 방향"
          onChange={async (e) => {
            const { Capacitor } = await import("@capacitor/core");
            if (Capacitor.isNativePlatform()) {
              const { ScreenOrientation } =
                await import("@capacitor/screen-orientation");
              if (e.target.value === "auto") await ScreenOrientation.unlock();
              else
                await ScreenOrientation.lock({
                  orientation: e.target.value as "portrait" | "landscape",
                });
            }
          }}
        >
          <option value="auto">자동회전</option>
          <option value="landscape">가로 고정</option>
          <option value="portrait">세로 고정</option>
        </select>
      </div>
      {(tab === "photo" || tab === "consult") && (
        <div
          className={
            "consult-layout " +
            (tab === "photo" || c.kind === "interim" ? "photo-only" : "")
          }
          style={
            {
              "--split": ratio + "%",
              "--photo-height": ratio + "vh",
            } as React.CSSProperties
          }
        >
          <section
            className={
              "card photo-panel" +
              (tab === "consult" ? " consultation-viewer-panel" : "")
            }
          >
            {tab === "photo" ? (
              <>
                <div className="section-title">
                  <h3>
                    상담 사진 <small>{draft.photos.length}장</small>
                  </h3>
                  {native && (
                    <button
                      disabled={readonly}
                      onClick={() =>
                        work(async () => addPhotos([await takePhoto()]))
                      }
                    >
                      <Camera size={18} />
                      카메라
                    </button>
                  )}
                  <label className="button">
                    <Camera size={18} />
                    촬영·추가
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      disabled={readonly}
                      onChange={(e) => {
                        void addPhotos(Array.from(e.target.files || []));
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {user.role === "doctor" && (
                  <button
                    onClick={() =>
                      work(() =>
                        send(
                          "consultation.annotate",
                          { photos: draft.photos },
                          c.id,
                          c.rev,
                        ),
                      )
                    }
                  >
                    내 주석 저장
                  </button>
                )}
                {guestPhotos.length > 0 && (
                  <button
                    onClick={() => addPhotos(guestPhotos.map((p) => p.file))}
                  >
                    로그인 전 촬영한 {guestPhotos.length}장 연결
                  </button>
                )}
                {adding && <p role="status">사진 미리보기 준비 중…</p>}
                {photoError && (
                  <p className="error" role="alert">
                    {photoError}
                  </p>
                )}
                {!readonly && (
                  <button
                    disabled={!historyPhotos.length}
                    onClick={() => setHistoryOpen(true)}
                  >
                    이전 상담 사진 불러오기 ({historyPhotos.length})
                  </button>
                )}
                {historyOpen && (
                  <Modal
                    title="이전 상담 사진 · 주석 포함"
                    close={() => setHistoryOpen(false)}
                  >
                    <HistoryPhotoPicker
                      photos={historyPhotos}
                      onAdd={(photos) => {
                        if (draft.photos.length + photos.length > 50) {
                          setPhotoError(
                            "상담당 사진은 50장까지 추가할 수 있습니다.",
                          );
                          return;
                        }
                        setDraft((d) => ({
                          ...d,
                          photos: [
                            ...d.photos,
                            ...photos.map((p) => ({
                              ...p,
                              id: crypto.randomUUID(),
                              selected: true,
                              representative: false,
                            })),
                          ],
                        }));
                        setHistoryOpen(false);
                      }}
                    />
                  </Modal>
                )}
              </>
            ) : (
              <div className="section-title">
                <h3>상담 사진</h3>
                <button onClick={() => setTab("photo")}>사진 선택·추가</button>
              </div>
            )}
            <PhotoBoard
              viewer={tab === "consult"}
              photos={draft.photos}
              columns={draft.photoColumns || 2}
              userId={user.id}
              readonly={readonly}
              canAnnotate={!readonly || user.role === "doctor"}
              admin={user.role === "admin"}
              onChange={(photos) => setDraft((d) => ({ ...d, photos }))}
              onColumns={(photoColumns) =>
                setDraft((d) => ({ ...d, photoColumns }))
              }
            />
          </section>
          {tab === "consult" && c.kind !== "interim" && (
            <div
              className="split-handle"
              role="separator"
              tabIndex={0}
              aria-label="사진과 장바구니 분할선"
              aria-valuenow={ratio}
              aria-valuemin={25}
              aria-valuemax={75}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(
                    e.key,
                  )
                )
                  e.preventDefault();
                if (["ArrowLeft", "ArrowUp"].includes(e.key))
                  setRatio(Math.max(25, ratio - 5));
                if (["ArrowRight", "ArrowDown"].includes(e.key))
                  setRatio(Math.min(75, ratio + 5));
              }}
              onPointerDown={(e) => {
                const el = e.currentTarget,
                  parent = el.parentElement!;
                const vertical =
                  getComputedStyle(parent).flexDirection === "column";
                el.dataset.vertical = String(vertical);
                el.dataset.start = String(vertical ? e.clientY : e.clientX);
                el.dataset.ratio = String(ratio);
                el.dataset.extent = String(
                  vertical
                    ? window.innerHeight
                    : parent.getBoundingClientRect().width,
                );
                el.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const el = e.currentTarget;
                if (!el.hasPointerCapture(e.pointerId)) return;
                const at =
                  el.dataset.vertical === "true" ? e.clientY : e.clientX;
                setRatio(
                  Math.round(
                    Math.max(
                      25,
                      Math.min(
                        75,
                        Number(el.dataset.ratio) +
                          ((at - Number(el.dataset.start)) * 100) /
                            Number(el.dataset.extent),
                      ),
                    ),
                  ),
                );
              }}
            >
              ⋮
            </div>
          )}
          {tab === "consult" && c.kind !== "interim" && (
            <section className="catalog-panel">
              <div className="card">
                <div className="section-title">
                  <h3>시술 선택</h3>
                  <small>
                    단가표 {catalog?.publishedAt?.slice(0, 10) || "미게시"}
                  </small>
                </div>
                <div className="tabs" aria-label="상담 단가표 구분">
                  {catalogBooks.map((kind) => (
                    <button
                      type="button"
                      key={kind}
                      className={book === kind ? "active" : ""}
                      onClick={() => {
                        setBook(kind);
                        setCategory("");
                      }}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
                <p className="small">
                  세 단가표의 상품을 한 장바구니에 함께 담을 수 있습니다.
                </p>
                <div className="search">
                  <Search size={18} />
                  <input
                    aria-label="시술 검색"
                    placeholder="시술명·옵션·구성·설명 검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="시술 카테고리"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">모든 카테고리</option>
                  {(catalog ? catalogNodes(catalog) : rootFolders).map(
                    (folder) => (
                      <option key={folder.id} value={folder.id}>
                        {catalog
                          ? folderPath(catalog, folder.id)
                              .map((x) => x.name)
                              .join(" / ")
                          : folder.name}
                      </option>
                    ),
                  )}
                </select>
                <p className="small" role="status">
                  검색 결과 {products.length}개 ·{" "}
                  {Math.min(productLimit, products.length)}개 표시
                </p>
                <div className="product-list">
                  {products.slice(0, productLimit).map((p) => (
                    <div className="product" key={p.id}>
                      <b>{p.name}</b>
                      <small>{p.category}</small>
                      <details>
                        <summary>구성·설명</summary>
                        <p>{p.description}</p>
                        <p>{p.composition}</p>
                      </details>
                      {p.options.map((o) => (
                        <button
                          className="option-row"
                          disabled={readonly || o.review || o.price === null}
                          key={o.id}
                          onClick={() => {
                            const line = {
                              id: crypto.randomUUID(),
                              productId: p.id,
                              optionId: o.id,
                              catalogVersion: catalog!.version,
                              book,
                              name: p.name,
                              description: p.description,
                              composition: p.composition,
                              label: o.label,
                              quantity: 1,
                              unit: o.unit,
                              price: o.price!,
                              tax: o.tax,
                              discount: { kind: "amount" as const, value: 0 },
                            };
                            setDraft({
                              ...draft,
                              catalogVersion:
                                draft.catalogVersion ||
                                latestCatalog(s)?.version ||
                                "",
                              catalogVersions: {
                                ...draft.catalogVersions,
                                [book]: catalog!.version,
                              },
                              quote: {
                                ...draft.quote,
                                lines: [...draft.quote.lines, line],
                              },
                            });
                          }}
                        >
                          <span>
                            {o.label}
                            <small>
                              {o.unit} ·{" "}
                              {o.tax === "inclusive"
                                ? "VAT 포함"
                                : o.tax === "exempt"
                                  ? "면세"
                                  : o.tax === "unknown"
                                    ? "부가세 확인 필요"
                                    : "VAT 별도"}
                            </small>
                          </span>
                          <b>
                            {o.review
                              ? "확인 필요"
                              : o.price === null
                                ? "별도 견적"
                                : money(o.price)}
                          </b>
                          <Plus size={16} />
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                {products.length > productLimit && (
                  <button onClick={() => setProductLimit((n) => n + 70)}>
                    시술 더 보기 ({products.length - productLimit}개 남음)
                  </button>
                )}
                {!products.length && (
                  <Empty>
                    {availableProducts.length
                      ? "검색 조건에 맞는 시술이 없습니다."
                      : "게시된 판매상품이 없습니다. 관리자 단가표에서 검토 후 게시하세요."}
                  </Empty>
                )}
              </div>
              <div className="card">
                <h3>
                  장바구니 <small>{draft.quote.lines.length}개</small>
                </h3>
                {!draft.quote.lines.length && (
                  <Empty>
                    위에서 시술 옵션을 선택하면 장바구니에 추가됩니다.
                  </Empty>
                )}
                {draft.quote.lines.map((l, i) => (
                  <div className="cart-line" key={l.id}>
                    <b>{l.name}</b>
                    <small>
                      {l.book || "미용"} · {l.label} · {money(l.price)} ·{" "}
                      {l.tax === "inclusive"
                        ? "VAT 포함"
                        : l.tax === "exempt"
                          ? "면세"
                          : l.tax === "unknown"
                            ? "부가세 확인 필요"
                            : "VAT 별도"}
                    </small>
                    <div className="inline-fields">
                      <Field label="수량">
                        <input
                          type="number"
                          aria-label={`${l.name} ${l.label} 수량`}
                          min={0.1}
                          max={1000}
                          step={0.1}
                          disabled={readonly}
                          value={l.quantity}
                          onChange={(e) => {
                            const lines = [...draft.quote.lines];
                            lines[i] = {
                              ...l,
                              quantity: Number(e.target.value),
                            };
                            updateQuote({ lines });
                          }}
                        />
                      </Field>
                      <Field label="할인">
                        <input
                          type="number"
                          min={0}
                          max={
                            l.discount.kind === "percent"
                              ? 100
                              : Math.round(l.price * l.quantity)
                          }
                          aria-label={`${l.name} ${l.label} 할인`}
                          disabled={readonly}
                          value={l.discount.value}
                          onChange={(e) => {
                            const lines = [...draft.quote.lines];
                            lines[i] = {
                              ...l,
                              discount: {
                                ...l.discount,
                                value: Number(e.target.value),
                              },
                            };
                            updateQuote({ lines });
                          }}
                        />
                      </Field>
                      <select
                        aria-label={`${l.name} ${l.label} 할인 단위`}
                        value={l.discount.kind}
                        disabled={readonly}
                        onChange={(e) => {
                          const lines = [...draft.quote.lines];
                          lines[i] = {
                            ...l,
                            discount: {
                              ...l.discount,
                              kind: e.target.value as "amount" | "percent",
                            },
                          };
                          updateQuote({ lines });
                        }}
                      >
                        <option value="amount">원</option>
                        <option value="percent">%</option>
                      </select>
                      <button
                        disabled={readonly}
                        onClick={() =>
                          updateQuote({
                            lines: draft.quote.lines.filter(
                              (x) => x.id !== l.id,
                            ),
                          })
                        }
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
                <div className="inline-fields">
                  <Field label="전체 할인">
                    <input
                      type="number"
                      min={0}
                      max={
                        draft.quote.discount.kind === "percent"
                          ? 100
                          : undefined
                      }
                      value={draft.quote.discount.value}
                      disabled={readonly}
                      onChange={(e) =>
                        updateQuote({
                          discount: {
                            ...draft.quote.discount,
                            value: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                  <select
                    aria-label="전체 할인 단위"
                    disabled={readonly}
                    value={draft.quote.discount.kind}
                    onChange={(e) =>
                      updateQuote({
                        discount: {
                          ...draft.quote.discount,
                          kind: e.target.value as "amount" | "percent",
                        },
                      })
                    }
                  >
                    <option value="amount">원</option>
                    <option value="percent">%</option>
                  </select>
                </div>
                <p className="small">
                  항목별 할인 후 남은 금액에 전체 할인을 적용합니다.
                </p>
                <Field label="부가세 안내">
                  <select
                    disabled={readonly}
                    value={draft.quote.vat}
                    onChange={(e) =>
                      updateQuote({
                        vat: e.target.value as "separate" | "included",
                      })
                    }
                  >
                    <option value="separate">별도 추가 (포함 상품 제외)</option>
                    <option value="included">포함 금액으로 안내</option>
                  </select>
                </Field>
                <Field label="할인·변경 사유">
                  <input
                    value={draft.quote.reason}
                    onChange={(e) => updateQuote({ reason: e.target.value })}
                    disabled={readonly}
                  />
                </Field>
                <QuoteTotals quote={quote} error={quoteError} />
              </div>
            </section>
          )}
        </div>
      )}
      {tab === "consult" && (
        <div className="detail-grid">
          <div className="card">
            <Field label="상담 메모">
              <textarea
                disabled={readonly}
                value={draft.memo}
                onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
              />
            </Field>
            {c.kind !== "interim" &&
              latestCatalogs(s).some(
                (x) =>
                  x.version !==
                  (draft.catalogVersions?.[catalogBook(x)] ||
                    (catalogBook(x) === "미용"
                      ? draft.catalogVersion
                      : undefined)),
              ) && (
                <button
                  disabled={readonly}
                  onClick={() => {
                    if (
                      window.confirm(
                        "가격 갱신은 장바구니를 비운 뒤 최신 상품을 다시 선택합니다. 진행할까요?",
                      )
                    )
                      setDraft({
                        ...draft,
                        catalogVersion: latestCatalog(s)?.version || "",
                        catalogVersions: Object.fromEntries(
                          latestCatalogs(s).map((x) => [
                            catalogBook(x),
                            x.version,
                          ]),
                        ),
                        quote: emptyQuote(),
                      });
                  }}
                >
                  최신 단가표 가져오기
                </button>
              )}
          </div>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              work(() =>
                send("opinion.request", {
                  consultationId: c.id,
                  toId: d.get("toId"),
                  request: d.get("request"),
                }),
              );
            }}
          >
            <h3>의사 의견 요청</h3>
            <select name="toId" required>
              {s.users
                .filter((u) => u.role === "doctor" || u.role === "admin")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
            <textarea
              name="request"
              required
              placeholder="확인받고 싶은 내용을 적어주세요."
            />
            <button>요청 보내기</button>
          </form>
        </div>
      )}
      {tab === "quote" && (
        <div className="detail-grid">
          <div className="card quote-paper">
            <p className="eyebrow">GRAND CLINIC</p>
            <h2>
              {c.kind === "interim" ? "중간상담 결과" : "시술 상담 견적서"}
            </h2>
            <p>
              {c.patient.name} 님 · {c.category}
            </p>
            {quote.lines.map((l) => (
              <div className="list-row" key={l.id}>
                <span>
                  <b>{l.name}</b>
                  <small>
                    {l.label} × {l.quantity}
                  </small>
                </span>
                <span>{money(Math.round(l.price * l.quantity))}</span>
              </div>
            ))}
            <QuoteTotals quote={quote} error={quoteError} />
            <div className="button-row">
              <button
                disabled={!!quoteError}
                onClick={() =>
                  work(async () => {
                    await send("audit.export", { format: "consultation-pdf" });
                    return download(await pdf(), documentName(draft, author));
                  })
                }
              >
                병원용 PDF
              </button>
              <button
                disabled={!!quoteError}
                onClick={() =>
                  work(async () => {
                    await send("audit.export", { format: "quote-jpg" });
                    const pages = await quoteJPG({ ...draft, quote });
                    pages.forEach((b, i) =>
                      download(b, `견적서_${c.patient.name}_${i + 1}.jpg`),
                    );
                  })
                }
              >
                환자용 JPG
              </button>
              <button
                disabled={!!quoteError}
                onClick={() =>
                  work(async () => {
                    if (native) {
                      await printPage();
                      return;
                    }
                    const b = await pdf(),
                      u = URL.createObjectURL(b);
                    const w = window.open(u);
                    w?.addEventListener("load", () => w.print());
                    setTimeout(() => URL.revokeObjectURL(u), 60000);
                  })
                }
              >
                인쇄
              </button>
            </div>
            {c.status === "H" && dirty && !readonly && (
              <p className="small" role="status">
                변경 내용을 보류·변경 저장한 뒤 최종 견적을 확인하고 확정하세요.
              </p>
            )}
            {c.status === "H" && (
              <div className="button-row">
                <button
                  className="primary"
                  disabled={
                    readonly ||
                    dirty ||
                    sourceInvalid ||
                    !!validationError ||
                    (c.kind !== "interim" && !quote.lines.length)
                  }
                  onClick={() =>
                    work(async () => {
                      if (JSON.stringify(draft) !== JSON.stringify(c)) {
                        await save();
                        throw new Error(
                          "변경 내용을 저장했습니다. 최신 견적을 확인하고 다시 확정하세요.",
                        );
                      }
                      if (
                        !window.confirm(
                          c.kind === "interim"
                            ? "중간상담을 완료할까요? 기존 패키지 진행 상태는 유지됩니다."
                            : c.kind === "renewal"
                              ? "기존 패키지를 완료하고 이 연장상담을 진행 중으로 확정할까요?"
                              : "성공 확정 후 원문 수정·취소는 관리자만 가능합니다. 확정할까요?",
                        )
                      )
                        return;
                      await send(
                        "consultation.finalize",
                        {
                          status: "P",
                          documents: [],
                          ...(c.kind === "renewal"
                            ? { sourceRev: source?.rev }
                            : {}),
                        },
                        c.id,
                        c.rev,
                      );
                    })
                  }
                >
                  {c.kind === "interim"
                    ? "중간상담 완료"
                    : c.kind === "renewal"
                      ? "연장 확정 · 진행 중 유지"
                      : "성공 확정 · 진행 중"}
                </button>
                <button
                  disabled={
                    readonly || dirty || sourceInvalid || !!validationError
                  }
                  onClick={() =>
                    work(async () => {
                      if (JSON.stringify(draft) !== JSON.stringify(c)) {
                        await save();
                        throw new Error("저장 후 다시 확정하세요.");
                      }
                      if (
                        !window.confirm(
                          c.kind === "renewal"
                            ? "연장하지 않고 기존 패키지를 완료로 표시할까요?"
                            : c.kind === "interim"
                              ? "중간상담을 중단할까요? 기존 패키지 진행 상태는 유지됩니다."
                              : "실패 확정 후 수정은 관리자만 가능합니다.",
                        )
                      )
                        return;
                      await send(
                        "consultation.finalize",
                        {
                          status: "F",
                          documents: [],
                          ...(c.kind === "renewal"
                            ? { sourceRev: source?.rev }
                            : {}),
                        },
                        c.id,
                        c.rev,
                      );
                    })
                  }
                >
                  {c.kind === "renewal"
                    ? "연장 안 함 · 완료"
                    : c.kind === "interim"
                      ? "중간상담 중단"
                      : "실패 확정"}
                </button>
              </div>
            )}
            {user.role === "admin" && c.status !== "H" && (
              <div className="button-row">
                <button
                  onClick={() => {
                    const reason = window.prompt("계약 취소 사유 (환불 별도)");
                    if (reason)
                      work(() =>
                        send("consultation.cancel", { reason }, c.id, c.rev),
                      );
                  }}
                >
                  계약 취소
                </button>
                <button
                  onClick={() => {
                    const reason = window.prompt("재작성 사유");
                    if (reason)
                      work(() =>
                        send("consultation.rewrite", { reason }, c.id, c.rev),
                      );
                  }}
                >
                  재작성
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                work(() =>
                  send(
                    "followup.save",
                    {
                      appointment: d.get("appointment"),
                      attendance: d.get("attendance"),
                    },
                    c.id,
                    c.rev,
                  ),
                );
              }}
            >
              <h3>예약·방문</h3>
              <input
                name="appointment"
                type="datetime-local"
                defaultValue={c.appointment}
              />
              <select name="attendance" defaultValue={c.attendance}>
                {["미정", "예약", "방문", "노쇼"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <button>상태 저장</button>
            </form>
          </div>
          <div className="card">
            <h3>시술동의서</h3>
            <select
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                setChecks([]);
                setSig("");
              }}
            >
              <option value="">게시된 양식 선택</option>
              {s.consents
                .filter((t) => t.status === "published")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} v{t.version}
                  </option>
                ))}
            </select>
            {template &&
              (() => {
                const t = s.consents.find((t) => t.id === template)!;
                return (
                  <>
                    <div className="consent-text">{t.body}</div>
                    {t.checks.map((check) => (
                      <label className="check" key={check}>
                        <input
                          type="checkbox"
                          checked={checks.includes(check)}
                          onChange={(e) =>
                            setChecks(
                              e.target.checked
                                ? [...checks, check]
                                : checks.filter((x) => x !== check),
                            )
                          }
                        />
                        {check}
                      </label>
                    ))}
                    <Field label="서명자">
                      <input
                        value={signer}
                        onChange={(e) => setSigner(e.target.value)}
                      />
                    </Field>
                    <SignaturePad onChange={setSig} />
                    <button
                      className="primary"
                      disabled={!sig || readonly}
                      onClick={() =>
                        work(async () => {
                          if (JSON.stringify(draft) !== JSON.stringify(c))
                            throw new Error("상담 변경을 먼저 저장하세요.");
                          await send("signature.create", {
                            consultationId: c.id,
                            templateId: t.id,
                            signer,
                            relationship: "본인",
                            checks,
                            image: sig,
                            contentHash: await sha(
                              consentContent(c) + JSON.stringify(t),
                            ),
                          });
                        })
                      }
                    >
                      서명 저장
                    </button>
                  </>
                );
              })()}
            {!s.consents.some((t) => t.status === "published") && (
              <Empty>병원 검토 후 게시된 동의서가 없습니다.</Empty>
            )}
            {s.signatures
              .filter((x) => x.consultationId === c.id)
              .map((x) => (
                <p key={x.id}>
                  서명 기록 · {x.signer} · {x.createdAt.slice(0, 16)}
                </p>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
async function compressPhoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const factor = Math.min(1, 2500 / Math.max(img.width, img.height)),
      canvas = document.createElement("canvas");
    canvas.width = img.width * factor;
    canvas.height = img.height * factor;
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((r) =>
      canvas.toBlob((b) => r(b!), "image/jpeg", 0.92),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
function CatalogView({
  state: s,
  user,
  send,
  work,
}: {
  state: State;
  user: User;
  send: (...args: any[]) => Promise<any>;
  work: (f: () => Promise<any>) => any;
}) {
  const can = allowed(user, "catalog.edit");
  const [folderDraft, setFolderDraft] = useState<Catalog>();
  const folderBasePublished = useRef("");
  const [folderWidth, setFolderWidth] = useState(() => {
    const n = Number(localStorage.getItem("codimate-folder-width"));
    return n >= 220 && n <= 600 ? n : 300;
  });
  const splitRef = useRef<HTMLDivElement>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const resizeFolder = (width: number) => {
    const max = Math.min(
      600,
      Math.max(220, (splitRef.current?.clientWidth || 900) - 360),
    );
    const next = Math.min(max, Math.max(220, width));
    setFolderWidth(next);
    localStorage.setItem("codimate-folder-width", String(next));
  };

  const [book, setBook] = useState<CatalogBook>("미용");
  const [drafts, setDrafts] = useState<Partial<Record<CatalogBook, Catalog>>>(
    {},
  );
  const unsaved =
    !!folderDraft ||
    Object.values(drafts).some(
      (c) =>
        c &&
        c.status === "draft" &&
        JSON.stringify(c) !==
          JSON.stringify(s.catalogs.find((saved) => saved.id === c.id)),
    );
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (unsaved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const leave = (e: Event) => {
      if (
        unsaved &&
        !window.confirm(
          "저장하지 않은 단가표 변경이 있습니다. 저장하지 않고 이동할까요?",
        )
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("codimate:before-photo-leave", leave);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("codimate:before-photo-leave", leave);
    };
  }, [unsaved]);
  const draft = drafts[book];
  const setDraft = (value: Catalog | undefined) =>
    setDrafts((previous) => ({ ...previous, [book]: value }));
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [selected, setSelected] = useState(""),
    [includeInactive, setIncludeInactive] = useState(false),
    [onlyReview, setOnlyReview] = useState(false),
    [reviewFilter, setReviewFilter] = useState("all");
  const [bulkIds, setBulkIds] = useState<string[]>([]),
    [paste, setPaste] = useState("");
  const latest = latestCatalog(s, book);
  const current =
    folderDraft ||
    draft ||
    s.catalogs
      .filter(
        (c) =>
          c.status === "draft" &&
          catalogBook(c) === book &&
          (!latest || c.updatedAt > latest.updatedAt),
      )
      .at(-1) ||
    latest;
  const products =
    current?.products.filter(
      (p) =>
        (!category || (current && inFolder(current, p, category))) &&
        [p.name, p.description, p.composition, ...p.options.map((o) => o.label)]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!onlyReview || p.options.some((o) => o.review)) &&
        (reviewFilter === "all" ||
          p.options.some((o) =>
            reviewFilter === "tax"
              ? o.tax === "unknown"
              : reviewFilter === "missing"
                ? o.price === null
                : o.review &&
                  o.issues.some((i) => !i.startsWith("부가세 미표기")),
          )),
    ) || [];
  const product = current?.products.find((p) => p.id === selected);
  const editable = !folderDraft && current?.status === "draft" && can;
  const change = (p: Product) => {
    if (current)
      setDraft({
        ...current,
        products: current.products.map((x) => (x.id === p.id ? p : x)),
      });
  };
  const save = () => {
    if (!current) throw new Error("단가표를 선택하세요");
    return send("catalog.save", { catalog: current }, current.id, current.rev);
  };
  return (
    <>
      <Title
        title="단가표 관리"
        description="미용·보험·이벤트별 원본과 게시 버전을 관리합니다. 맞춤 시술 찾기에서도 같은 상품을 사용합니다."
        action={
          <div className="button-row">
            {can && !folderDraft && (
              <label className="button">
                <Plus size={18} />
                JSON 초안 가져오기
                <input
                  type="file"
                  hidden
                  accept="application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      work(async () => {
                        const c = JSON.parse(await file.text()) as Catalog;
                        if (c.schemaVersion !== 1 || !Array.isArray(c.products))
                          throw new Error("변환된 단가표 JSON을 선택하세요.");
                        setDraft({
                          ...c,
                          book,
                          id: crypto.randomUUID(),
                          rev: 0,
                          status: "draft",
                        });
                        setSelected("");
                      });
                  }}
                />
              </label>
            )}
            <button
              disabled={
                current?.status !== "published" || !allowed(user, "export")
              }
              onClick={() =>
                work(async () => {
                  await send("audit.export", { format: "catalog-csv" });
                  download(
                    catalogCSV(current!),
                    `코디메이트_${book}_단가표.csv`,
                  );
                })
              }
            >
              CSV 자료 교환
            </button>
            <button
              disabled={!current || !allowed(user, "export")}
              onClick={() =>
                work(async () => {
                  if (!current || current.status !== "published")
                    throw new Error("게시된 버전을 선택하세요.");
                  await send("audit.export", { format: "catalog-xlsx" });
                  await downloadWorkbook(
                    await catalogWorkbook(
                      {
                        ...current,
                        products: current.products.filter(
                          (p) => !category || inFolder(current, p, category),
                        ),
                      },
                      undefined,
                      includeInactive,
                    ),
                    `코디메이트_${book}_단가표_${date()}.xlsx`,
                  );
                })
              }
            >
              <FileSpreadsheet size={18} />
              Excel 다운로드
            </button>
          </div>
        }
      />
      {editable && (
        <div className="catalog-save-bar">
          <span>{book} SSOT 편집 중 · 변경 후 초안을 저장하세요</span>
          <button
            className="primary"
            onClick={() =>
              work(async () => {
                if (await save()) setDraft(undefined);
              })
            }
          >
            초안 저장
          </button>
        </div>
      )}
      <div className="tabs" aria-label="단가표 구분">
        {catalogBooks.map((kind) => (
          <button
            type="button"
            key={kind}
            className={book === kind ? "active" : ""}
            disabled={!!folderDraft}
            onClick={() => {
              setBook(kind);
              setCategory("");
              setSelected("");
              setBulkIds([]);
            }}
          >
            {kind} SSOT
          </button>
        ))}
      </div>
      <div className="card">
        <div className="table-toolbar">
          <select
            aria-label="단가표 버전"
            disabled={!!folderDraft}
            value={current?.id || ""}
            onChange={(e) => {
              setDraft(s.catalogs.find((c) => c.id === e.target.value));
              setSelected("");
            }}
          >
            <option value="">단가표 선택</option>
            {s.catalogs
              .filter((c) => catalogBook(c) === book)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.status === "draft" ? "초안" : "게시본"} · {c.version}
                </option>
              ))}
            {draft && !s.catalogs.some((c) => c.id === draft.id) && (
              <option value={draft.id}>가져온 새 초안</option>
            )}
          </select>
          <label className="check">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            비활성 포함 내보내기
          </label>
          {can && !folderDraft && (
            <button
              onClick={() => {
                const now = new Date().toISOString();
                setDraft({
                  id: crypto.randomUUID(),
                  rev: 0,
                  createdAt: now,
                  updatedAt: now,
                  schemaVersion: 1,
                  book,
                  version: `${book} 초안`,
                  status: "draft",
                  products: [],
                  folders: [],
                  references: [],
                });
              }}
            >
              새 {book} 단가표 작성
            </button>
          )}
          {current && can && !folderDraft && (
            <button
              onClick={() =>
                setDraft({
                  ...structuredClone(current),
                  id: crypto.randomUUID(),
                  rev: 0,
                  status: "draft",
                  publishedAt: undefined,
                })
              }
            >
              복제·이전 버전 복원 초안
            </button>
          )}
        </div>
        {current && (
          <div className="catalog-summary">
            <span>{current.products.length}개 상품 후보</span>
            <span>
              {current.products.reduce(
                (n, p) => n + p.options.filter((o) => o.review).length,
                0,
              )}
              개 가격 확인 필요
            </span>
            <span>{current.references.length}개 원본 시트</span>
          </div>
        )}
      </div>
      {current && (
        <CatalogHistory
          state={s}
          catalog={current}
          disabled={unsaved}
          canEdit={can}
          work={work}
          restore={async (revisionId, base) => {
            if (
              await send(
                "catalog.restore",
                { revisionId, basePublishedId: latest?.id || "" },
                base.id,
                base.rev,
              )
            ) {
              setDraft(undefined);
              setCategory("");
              setSelected("");
            }
          }}
        />
      )}
      <div
        className="catalog-admin catalog-resizable"
        ref={splitRef}
        style={{ "--folder-width": folderWidth + "px" } as React.CSSProperties}
      >
        {current && (
          <FolderWorkspace
            catalog={current}
            selected={category}
            onSelect={setCategory}
            editing={!!folderDraft}
            canEdit={can}
            start={() => {
              if (unsaved) {
                work(async () => {
                  throw new Error(
                    "작성 중인 상품 변경을 초안 저장한 뒤 폴더를 수정하세요",
                  );
                });
                return;
              }
              folderBasePublished.current = latest?.id || "";
              setFolderDraft(editableTree(current));
              setBulkIds([]);
            }}
            cancel={() => {
              setFolderDraft(undefined);
              setBulkIds([]);
              setCategory("");
            }}
            save={async () => {
              if (
                await send(
                  "catalog.folders.commit",
                  {
                    catalog: folderDraft,
                    basePublishedId: folderBasePublished.current,
                  },
                  current.id,
                  current.rev,
                )
              ) {
                setFolderDraft(undefined);
                setDraft(undefined);
                setBulkIds([]);
                setCategory("");
              }
            }}
            onChange={setFolderDraft}
            selectedIds={bulkIds}
            work={work}
          />
        )}
        <div
          role="separator"
          aria-label="폴더 목록 너비 조절"
          aria-orientation="vertical"
          aria-valuemin={220}
          aria-valuemax={600}
          aria-valuenow={folderWidth}
          tabIndex={0}
          className="catalog-divider"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              resizeFolder(folderWidth + (e.key === "ArrowLeft" ? -20 : 20));
            }
          }}
          onDoubleClick={() => resizeFolder(300)}
          onPointerDown={(e) => {
            resizeStart.current = { x: e.clientX, width: folderWidth };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (resizeStart.current)
              resizeFolder(
                resizeStart.current.width + e.clientX - resizeStart.current.x,
              );
          }}
          onPointerUp={() => {
            resizeStart.current = null;
          }}
          onPointerCancel={() => {
            resizeStart.current = null;
          }}
        >
          <span />
        </div>
        <div className="card">
          <div className="table-toolbar">
            <div className="search">
              <Search size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="상품 검색"
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={onlyReview}
                onChange={(e) => setOnlyReview(e.target.checked)}
              />
              확인 필요
            </label>
            <select
              aria-label="검토 항목"
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value)}
            >
              <option value="all">전체 검토 항목</option>
              <option value="details">가격·구성·판매 조건</option>
              <option value="tax">부가세 미확정</option>
              <option value="missing">가격 미기재·범위</option>
            </select>
          </div>
          {editable && current && (
            <details className="bulk-edit">
              <summary>표 편집·선택 가격 조정·엑셀 붙여넣기</summary>
              <div className="button-row">
                <button onClick={() => setBulkIds(products.map((p) => p.id))}>
                  현재 목록 선택
                </button>
                <button onClick={() => setBulkIds([])}>선택 해제</button>
                <button
                  onClick={() => {
                    const raw = window.prompt(
                      "선택 상품 옵션의 가격 조정률 (%) · 예: 5, -10",
                    );
                    if (raw === null) return;
                    const percent = Number(raw);
                    if (
                      !Number.isFinite(percent) ||
                      percent < -100 ||
                      percent > 1000
                    )
                      return;
                    setDraft({
                      ...current,
                      products: current.products.map((p) =>
                        bulkIds.includes(p.id)
                          ? {
                              ...p,
                              options: p.options.map((o) => ({
                                ...o,
                                price:
                                  o.price === null
                                    ? null
                                    : Math.round(o.price * (1 + percent / 100)),
                              })),
                            }
                          : p,
                      ),
                    });
                  }}
                >
                  선택 가격 일괄 조정
                </button>
                <button
                  onClick={() =>
                    setDraft({
                      ...current,
                      products: current.products.map((p) =>
                        bulkIds.includes(p.id) ? { ...p, active: false } : p,
                      ),
                    })
                  }
                >
                  선택 비활성화
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>선택</th>
                      <th>상품</th>
                      <th>첫 옵션 가격</th>
                      <th>판매</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={p.name + " 선택"}
                            checked={bulkIds.includes(p.id)}
                            onChange={(e) =>
                              setBulkIds(
                                e.target.checked
                                  ? [...bulkIds, p.id]
                                  : bulkIds.filter((id) => id !== p.id),
                              )
                            }
                          />
                        </td>
                        <td>{p.name}</td>
                        <td>
                          <input
                            aria-label={p.name + " 가격"}
                            type="number"
                            min={0}
                            value={p.options[0]?.price ?? ""}
                            disabled={!p.options.length}
                            onChange={(e) =>
                              change({
                                ...p,
                                options: p.options.map((o, i) =>
                                  i
                                    ? o
                                    : {
                                        ...o,
                                        price:
                                          e.target.value === ""
                                            ? null
                                            : Number(e.target.value),
                                      },
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={p.name + " 판매"}
                            type="checkbox"
                            checked={p.active}
                            onChange={(e) =>
                              change({ ...p, active: e.target.checked })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                카테고리 / 상품명 / 옵션명 / 가격 / 부가세(별도·포함·면세) 열을
                엑셀에서 복사하세요. 새 후보로 추가되며 검토 후 판매를 켭니다.
              </p>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="탭으로 구분된 여러 행"
              />
              <button
                onClick={() =>
                  work(async () => {
                    const now = new Date().toISOString();
                    const rows = paste
                      .trim()
                      .split(/\r?\n/)
                      .filter(Boolean)
                      .map((row) => {
                        const [category, name, label, raw, tax] =
                          row.split("\t");
                        if (!category || !name || !label)
                          throw new Error("카테고리·상품·옵션 열을 확인하세요");
                        const price = raw?.trim()
                          ? Number(raw.replaceAll(",", ""))
                          : null;
                        if (
                          price !== null &&
                          (!Number.isSafeInteger(price) || price < 0)
                        )
                          throw new Error("가격을 확인하세요");
                        return {
                          id: crypto.randomUUID(),
                          rev: 1,
                          createdAt: now,
                          updatedAt: now,
                          category,
                          name,
                          description: "",
                          composition: "",
                          active: false,
                          sources: [],
                          options: [
                            {
                              id: crypto.randomUUID(),
                              label,
                              price,
                              tax:
                                tax === "포함"
                                  ? "inclusive"
                                  : tax === "면세"
                                    ? "exempt"
                                    : tax === "별도"
                                      ? "exclusive"
                                      : "unknown",
                              review: true,
                              issues: ["붙여넣기 자료 검토"],
                              sources: [],
                              priceKind: "clinic",
                              unit: "개",
                            },
                          ],
                        } as Product;
                      });
                    setDraft({
                      ...current,
                      products: [...current.products, ...rows],
                    });
                    setPaste("");
                  })
                }
              >
                후보 행 추가
              </button>
            </details>
          )}
          {!current ? (
            <Empty>
              전체 XLSX에서 변환한 JSON 초안을 가져오세요.
              <br />
              실제 단가표는 소스코드에 포함하지 않습니다.
            </Empty>
          ) : (
            <CatalogProductRows
              catalog={current}
              products={products}
              editable={!!editable}
              folderEditing={!!folderDraft}
              selectedIds={bulkIds}
              onSelection={setBulkIds}
              onChange={folderDraft ? setFolderDraft : setDraft}
              onEdit={setSelected}
              work={work}
            />
          )}
          {current && editable && (
            <div className="button-row">
              <button
                onClick={() => {
                  const now = new Date().toISOString(),
                    p: Product = {
                      id: crypto.randomUUID(),
                      rev: 1,
                      createdAt: now,
                      updatedAt: now,
                      category: category
                        ? folderPath(current, category)
                            .map((x) => x.name)
                            .join(" / ")
                        : "새 분류",
                      folderId: category || undefined,
                      name: "새 상품",
                      description: "",
                      composition: "",
                      active: false,
                      sources: [],
                      options: [],
                    };
                  setDraft({ ...current, products: [...current.products, p] });
                  setSelected(p.id);
                }}
              >
                상품 추가
              </button>
              <button
                onClick={() =>
                  work(async () => {
                    if (await save()) setDraft(undefined);
                  })
                }
              >
                초안 저장
              </button>
              <button
                className="primary"
                onClick={() =>
                  work(async () => {
                    if (draft) {
                      if (!(await save())) return;
                      setDraft(undefined);
                      throw new Error(
                        "초안을 저장했습니다. 저장된 내용을 확인하고 다시 게시하세요.",
                      );
                    }
                    if (
                      window.confirm(
                        "검토한 활성 상품만 상담에 적용됩니다. 게시할까요?",
                      )
                    )
                      await send(
                        "catalog.publish",
                        {},
                        current.id,
                        current.rev,
                      );
                  })
                }
              >
                검증 후 게시
              </button>
            </div>
          )}
        </div>
      </div>
      {product && (
        <Modal title="상품·옵션 편집" close={() => setSelected("")}>
          <div className="form-grid">
            <Field label="상품명">
              <input
                disabled={!editable}
                value={product.name}
                onChange={(e) => change({ ...product, name: e.target.value })}
              />
            </Field>
            <Field label="소속 폴더">
              <select
                disabled={!editable}
                value={productFolder(current!, product)}
                onChange={(e) =>
                  change({ ...product, folderId: e.target.value })
                }
              >
                {(current ? catalogNodes(current) : rootFolders).map((f) => (
                  <option key={f.id} value={f.id}>
                    {folderPath(current!, f.id)
                      .map((x) => x.name)
                      .join(" / ")}
                  </option>
                ))}
              </select>
              <small>원본 분류: {product.category}</small>
            </Field>
          </div>
          <Field label="설명">
            <textarea
              disabled={!editable}
              value={product.description}
              onChange={(e) =>
                change({ ...product, description: e.target.value })
              }
            />
          </Field>
          <Field label="패키지·회차별 구성">
            <textarea
              disabled={!editable}
              value={product.composition}
              onChange={(e) =>
                change({ ...product, composition: e.target.value })
              }
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              disabled={!editable}
              checked={product.active}
              onChange={(e) => change({ ...product, active: e.target.checked })}
            />
            판매 활성화
          </label>
          <Field label="미용·보험 구분">
            <select
              disabled={!editable}
              value={productCategory(product)}
              onChange={(e) =>
                change({
                  ...product,
                  careCategory: e.target.value as "미용" | "보험",
                })
              }
            >
              <option>미용</option>
              <option>보험</option>
            </select>
          </Field>
          {product.options.map((o, i) => (
            <div className="option-edit" key={o.id}>
              <Field label="옵션">
                <input
                  disabled={!editable}
                  value={o.label}
                  onChange={(e) => {
                    const options = [...product.options];
                    options[i] = { ...o, label: e.target.value };
                    change({ ...product, options });
                  }}
                />
              </Field>
              <Field label="가격 (원)">
                <input
                  disabled={!editable}
                  type="number"
                  value={o.price ?? ""}
                  min={0}
                  onChange={(e) => {
                    const options = [...product.options];
                    options[i] = {
                      ...o,
                      price:
                        e.target.value === "" ? null : Number(e.target.value),
                    };
                    change({ ...product, options });
                  }}
                />
              </Field>
              <Field label="가격 구분">
                <select
                  disabled={!editable}
                  value={o.priceKind}
                  onChange={(e) =>
                    change({
                      ...product,
                      options: product.options.map((x) =>
                        x.id === o.id
                          ? {
                              ...x,
                              priceKind: e.target.value as typeof o.priceKind,
                            }
                          : x,
                      ),
                    })
                  }
                >
                  <option value="regular">정가</option>
                  <option value="clinic">원내 적용가</option>
                  <option value="event">이벤트가</option>
                  <option value="quote">별도 견적</option>
                </select>
              </Field>
              <Field label="부가세">
                <select
                  aria-label="부가세"
                  disabled={!editable}
                  value={o.tax}
                  onChange={(e) => {
                    const options = [...product.options];
                    options[i] = { ...o, tax: e.target.value as any };
                    change({ ...product, options });
                  }}
                >
                  <option value="unknown">확인 필요</option>
                  <option value="exclusive">별도</option>
                  <option value="inclusive">포함</option>
                  <option value="exempt">면세</option>
                </select>
              </Field>
              <label className="check">
                <input
                  disabled={!editable}
                  type="checkbox"
                  checked={!o.review}
                  onChange={(e) => {
                    const options = [...product.options];
                    options[i] = { ...o, review: !e.target.checked };
                    change({ ...product, options });
                  }}
                />
                가격·옵션 검토 완료
              </label>
              {o.review && <p className="small">{o.issues.join(" · ")}</p>}
              <Field label="계산 단위">
                <input
                  disabled={!editable}
                  value={o.unit}
                  onChange={(e) =>
                    change({
                      ...product,
                      options: product.options.map((x) =>
                        x.id === o.id ? { ...x, unit: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
              {o.tax === "unknown" && (
                <p className="error">
                  부가세 기준을 선택해야 판매용으로 게시할 수 있습니다.
                </p>
              )}
              {!!o.sources.length && (
                <details className="option-source">
                  <summary>이 옵션의 원본 가격·기준</summary>
                  {o.sources.map((source) => (
                    <p key={`${source.sheet}!${source.cell}`}>
                      <b>
                        {source.sheet}!{source.cell}
                      </b>
                      <br />
                      {source.text}
                    </p>
                  ))}
                </details>
              )}
            </div>
          ))}
          {editable && (
            <div className="button-row">
              <button
                onClick={() =>
                  change({
                    ...product,
                    options: [
                      ...product.options,
                      {
                        id: crypto.randomUUID(),
                        label: "새 옵션",
                        price: null,
                        tax: "unknown",
                        review: true,
                        issues: ["가격 검토 필요"],
                        sources: [],
                        priceKind: "clinic",
                        unit: "개",
                      },
                    ],
                  })
                }
              >
                옵션 추가
              </button>
              <button
                onClick={() => {
                  const copy = {
                    ...structuredClone(product),
                    id: crypto.randomUUID(),
                    name: product.name + " (복사)",
                    active: false,
                    options: product.options.map((o) => ({
                      ...o,
                      id: crypto.randomUUID(),
                    })),
                  };
                  setDraft({
                    ...current!,
                    products: [...current!.products, copy],
                  });
                  setSelected(copy.id);
                }}
              >
                상품 복제
              </button>
              <button className="primary" onClick={() => setSelected("")}>
                편집 내용 유지
              </button>
            </div>
          )}
          <details>
            <summary>원본 위치·내용</summary>
            {product.sources.map((source) => (
              <p key={`${source.sheet}!${source.cell}`}>
                <b>
                  {source.sheet}!{source.cell}
                </b>
                <br />
                {source.text}
              </p>
            ))}
          </details>
        </Modal>
      )}
    </>
  );
}
function Stats({
  state: s,
  work,
  user,
  send,
}: {
  state: State;
  user: User;
  send: (...args: any[]) => Promise<any>;
  work: (fn: () => Promise<any>) => any;
}) {
  const valid = s.consultations.filter(
      (c) => !c.cancelled && c.kind !== "interim",
    ),
    passed = valid.filter((c) => c.status === "P"),
    failed = valid.filter((c) => c.status === "F");
  const sums = s.patients
    .filter((p) => !p.mergedInto)
    .reduce(
      (a, p) => {
        const m = metrics(s, p.id);
        return {
          revenue: a.revenue + m.revenue,
          outstanding: a.outstanding + m.outstanding,
          contract: a.contract + m.contract,
        };
      },
      { revenue: 0, outstanding: 0, contract: 0 },
    );
  return (
    <>
      <Title
        title="상담·기여매출 통계"
        description="계약과 실제 수납을 구분해 성과를 확인하세요."
        action={
          <button
            disabled={!allowed(user, "export")}
            onClick={() =>
              work(async () => {
                await send("audit.export", { format: "statistics-xlsx" });
                return downloadWorkbook(
                  await statisticsWorkbook(s),
                  "코디메이트_통계_" + date() + ".xlsx",
                );
              })
            }
          >
            <FileSpreadsheet size={18} />
            통계 Excel
          </button>
        }
      />
      <div className="summary-grid four">
        <Summary
          label="성공률"
          value={`${passed.length + failed.length ? Math.round((passed.length / (passed.length + failed.length)) * 100) : 0}%`}
          detail={`성공 ${passed.length} / 실패 ${failed.length} · 보류 제외`}
        />
        <Summary
          label="유효 계약"
          value={money(sums.contract)}
          detail="취소 제외"
        />
        <Summary
          label="기여매출"
          value={money(sums.revenue)}
          detail="수납 − 환불"
        />
        <Summary
          label="미수금"
          value={money(sums.outstanding)}
          detail="상담별 미수 잔액"
        />
      </div>
      <div className="detail-grid">
        <div className="card">
          <h3>직원별 상담 성과</h3>
          {s.users.map((u) => {
            const cs = valid.filter((c) => c.ownerId === u.id);
            return (
              <div className="list-row" key={u.id}>
                <b>{u.name}</b>
                <span>
                  상담 {cs.length} · 성공{" "}
                  {cs.filter((c) => c.status === "P").length}
                </span>
                <span>
                  {money(
                    cs
                      .filter((c) => c.status === "P")
                      .reduce((a, c) => a + c.quote.total, 0),
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <div className="card">
          <h3>환자 등급별 현황</h3>
          {[
            ...new Set(
              s.patients
                .filter((p) => !p.mergedInto)
                .map((p) => gradeFor(s, p).name),
            ),
          ].map((name) => (
            <div className="list-row" key={name}>
              <b>{name}</b>
              <span>
                {
                  s.patients.filter(
                    (p) => !p.mergedInto && gradeFor(s, p).name === name,
                  ).length
                }
                명
              </span>
            </div>
          ))}
          <h3>방문 상태</h3>
          <p>
            노쇼 {valid.filter((c) => c.attendance === "노쇼").length}건 · 예약{" "}
            {valid.filter((c) => c.attendance === "예약").length}건
          </p>
        </div>
      </div>
    </>
  );
}
function SettingsView({
  state: s,
  user,
  send,
  work,
  refresh,
  health,
}: {
  state: State;
  user: User;
  send: (...args: any[]) => Promise<any>;
  work: (fn: () => Promise<any>) => any;
  refresh: () => Promise<any>;
  health: any;
}) {
  const [tab, setTab] = useState("grade"),
    [grades, setGrades] = useState(s.policies[0]?.grades || []),
    [account, setAccount] = useState<User | undefined>(),
    [storageRoot, setStorageRoot] = useState(health.storageRoot || "상담"),
    [storageNotice, setStorageNotice] = useState("");
  useEffect(() => {
    setStorageRoot(health.storageRoot || "상담");
  }, [health.storageRoot]);
  if (user.role !== "admin")
    return <Empty>관리자만 설정을 변경할 수 있습니다.</Empty>;
  return (
    <>
      <Title
        title="관리자 설정"
        description="병원 운영 기준과 직원별 권한을 관리합니다."
      />
      <div className="tabs">
        {[
          ["grade", "환자 등급"],
          ["users", "직원·권한"],
          ["consent", "동의서 양식"],
          ["connection", "연결·복구"],
          ["updates", "앱 업데이트"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={tab === k ? "active" : ""}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "updates" && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(e.currentTarget));
            work(() =>
              api("/update", {
                method: "POST",
                body: JSON.stringify({
                  ...d,
                  versionCode: Number(d.versionCode),
                }),
              }),
            );
          }}
        >
          <h3>APK 업데이트 게시</h3>
          <p>
            같은 서명 키로 만든 APK의 주소와 빌드 결과의 SHA-256을 등록합니다.
          </p>
          <div className="form-grid">
            {[
              ["version", "표시 버전"],
              ["versionCode", "버전 코드"],
              ["url", "APK HTTPS 주소"],
              ["sha256", "SHA-256"],
            ].map(([name, label]) => (
              <Field key={name} label={label}>
                <input
                  name={name}
                  required
                  type={
                    name === "versionCode"
                      ? "number"
                      : name === "url"
                        ? "url"
                        : "text"
                  }
                />
              </Field>
            ))}
          </div>
          <Field label="변경 내용">
            <textarea name="notes" required />
          </Field>
          <button className="primary">업데이트 게시</button>
        </form>
      )}
      {tab === "grade" && (
        <div className="card">
          <h3>누적 기여매출 기준</h3>
          <p>
            수납 − 환불에 따라 자동 산정합니다. 기준 미설정 시 미분류입니다.
          </p>
          {grades.map((g, i) => (
            <div className="inline-fields" key={g.id}>
              <Field label="등급명">
                <input
                  value={g.name}
                  onChange={(e) =>
                    setGrades(
                      grades.map((v, j) =>
                        i === j ? { ...v, name: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="하한액 (원)">
                <input
                  type="number"
                  min={0}
                  value={g.minimum}
                  onChange={(e) =>
                    setGrades(
                      grades.map((v, j) =>
                        i === j ? { ...v, minimum: Number(e.target.value) } : v,
                      ),
                    )
                  }
                />
              </Field>
              <input
                aria-label="등급 색상"
                type="color"
                value={g.color}
                onChange={(e) =>
                  setGrades(
                    grades.map((v, j) =>
                      i === j ? { ...v, color: e.target.value } : v,
                    ),
                  )
                }
              />
              <button
                onClick={() => setGrades(grades.filter((_, j) => j !== i))}
              >
                삭제
              </button>
            </div>
          ))}
          <div className="button-row">
            <button
              onClick={() =>
                setGrades([
                  ...grades,
                  {
                    id: crypto.randomUUID(),
                    name: "새 등급",
                    minimum: 0,
                    color: "#145d55",
                  },
                ])
              }
            >
              등급 추가
            </button>
            <button
              className="primary"
              onClick={() =>
                work(() =>
                  send(
                    "grade.policy",
                    { grades },
                    "grades",
                    s.policies[0]?.rev,
                  ),
                )
              }
            >
              기준 적용·재산정
            </button>
          </div>
        </div>
      )}
      {tab === "users" && (
        <div className="detail-grid">
          <div className="card">
            <h3>직원 계정</h3>
            {s.users.map((u) => (
              <button
                className="list-row"
                key={u.id}
                onClick={() => setAccount(u)}
              >
                <b>{u.name}</b>
                <span>
                  {u.username} · {u.role} · {u.active ? "사용" : "중지"}
                </span>
              </button>
            ))}
            <button
              onClick={() =>
                setAccount({
                  id: "",
                  name: "",
                  username: "",
                  role: "coordinator",
                  active: true,
                  permissions: {},
                })
              }
            >
              계정 추가
            </button>
          </div>
          {account && (
            <form
              className="card"
              key={account.id}
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                work(async () => {
                  await api("/users", {
                    method: "POST",
                    body: JSON.stringify({
                      ...account,
                      name: d.get("name"),
                      username: d.get("username"),
                      password: d.get("password") || undefined,
                    }),
                  });
                  await refresh();
                  setAccount(undefined);
                });
              }}
            >
              <Field label="이름">
                <input name="name" defaultValue={account.name} required />
              </Field>
              <Field label="아이디">
                <input
                  name="username"
                  defaultValue={account.username}
                  required
                />
              </Field>
              <Field label="새 비밀번호 (12자 이상)">
                <input
                  type="password"
                  name="password"
                  minLength={12}
                  required={!account.id}
                />
              </Field>
              <Field label="역할">
                <select
                  value={account.role}
                  onChange={(e) =>
                    setAccount({ ...account, role: e.target.value as any })
                  }
                >
                  <option value="coordinator">코디네이터</option>
                  <option value="doctor">의사</option>
                  <option value="admin">관리자</option>
                </select>
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={account.active}
                  onChange={(e) =>
                    setAccount({ ...account, active: e.target.checked })
                  }
                />
                사용 계정
              </label>
              {permissions.map((p) => (
                <div className="permission" key={p}>
                  <span>{names[p]}</span>
                  <select
                    value={
                      account.permissions[p] === undefined
                        ? "default"
                        : String(account.permissions[p])
                    }
                    onChange={(e) =>
                      setAccount({
                        ...account,
                        permissions: {
                          ...account.permissions,
                          [p]:
                            e.target.value === "default"
                              ? undefined
                              : e.target.value === "true",
                        },
                      })
                    }
                  >
                    <option value="default">역할 기본값</option>
                    <option value="true">허용</option>
                    <option value="false">차단</option>
                  </select>
                </div>
              ))}
              <button className="primary">계정 저장</button>
            </form>
          )}
        </div>
      )}
      {tab === "consent" && (
        <div className="detail-grid">
          <div className="card">
            <h3>양식 목록</h3>
            {s.consents.map((t) => (
              <div className="list-row" key={t.id}>
                <span>
                  <b>{t.name}</b>
                  <small>
                    v{t.version} ·{" "}
                    {t.status === "published" ? "게시됨" : "초안"}
                  </small>
                </span>
                {t.status === "draft" && (
                  <button
                    onClick={() =>
                      work(() =>
                        send(
                          "consent.save",
                          {
                            name: t.name,
                            body: t.body,
                            productIds: t.productIds,
                            checks: t.checks,
                            status: "published",
                          },
                          t.id,
                          t.rev,
                        ),
                      )
                    }
                  >
                    병원 검토 완료·게시
                  </button>
                )}
              </div>
            ))}
          </div>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              work(() =>
                send("consent.save", {
                  name: d.get("name"),
                  body: d.get("body"),
                  checks: String(d.get("checks")).split("\n").filter(Boolean),
                  productIds: [],
                  status: "draft",
                }),
              );
            }}
          >
            <h3>동의서 초안 등록</h3>
            <Field label="양식명">
              <input name="name" required />
            </Field>
            <Field label="본문">
              <textarea
                name="body"
                required
                rows={12}
                placeholder="병원에서 검토할 시술동의서 문구를 입력하세요."
              />
            </Field>
            <Field label="필수 확인 항목 (한 줄에 하나)">
              <textarea name="checks" />
            </Field>
            <button className="primary">초안 저장</button>
          </form>
        </div>
      )}
      {tab === "connection" && (
        <div className="detail-grid">
          <form
            className="card"
            onSubmit={(event) => {
              event.preventDefault();
              setStorageNotice("");
              work(async () => {
                const result = await api("/storage", {
                  method: "POST",
                  body: JSON.stringify({
                    rootFolder: storageRoot.trim(),
                    baseRoot: health.storageRoot || "상담",
                  }),
                });
                await refresh();
                setStorageNotice(
                  `저장 폴더를 ${result.rootFolder}(으)로 변경했습니다.`,
                );
              });
            }}
          >
            <h3>OneDrive 저장 폴더</h3>
            <p>현재 위치: 내 파일 / {health.storageRoot || "상담"}</p>
            <Field label="저장 폴더 이름">
              <input
                value={storageRoot}
                onChange={(e) => {
                  setStorageRoot(e.target.value);
                  setStorageNotice("");
                }}
                required
                maxLength={80}
                placeholder="코디메이트"
              />
            </Field>
            <button
              type="button"
              onClick={() => {
                setStorageRoot("코디메이트");
                setStorageNotice("");
              }}
            >
              코디메이트로 입력
            </button>
            <p>
              변경 후: {storageRoot.trim() || "폴더 이름"} / 미용 ·{" "}
              {storageRoot.trim() || "폴더 이름"} / 보험
            </p>
            <p className="small">
              기존 폴더의 이름을 변경합니다. 사진·상담 기록·단가표·복구 자료가
              함께 유지되며 병원 전체에 적용됩니다. 같은 이름의 폴더가 있으면
              다른 이름을 입력하세요.
            </p>
            <button
              className="primary"
              disabled={
                storageRoot.trim() === (health.storageRoot || "상담") ||
                !!health.restoreRequired ||
                (health.mode !== "local-development" && !health.driveConnected)
              }
            >
              저장 폴더 변경
            </button>
            {storageNotice && <p role="status">{storageNotice}</p>}
          </form>
          <div className="card">
            <h3>OneDrive 연결</h3>
            <p>
              {health.driveConnected
                ? "병원 OneDrive가 연결되어 있습니다."
                : "운영 데이터를 저장할 병원 계정을 연결하세요."}
            </p>
            <button
              className="primary"
              onClick={() =>
                work(async () => {
                  const d = await api("/onedrive/connect");
                  window.location.assign(d.url);
                })
              }
            >
              Microsoft 계정 연결
            </button>
            <p className="small">
              연결 정보는 서버에서 관리하며 직원에게 전달하지 않습니다.
            </p>
            <button
              onClick={() =>
                work(async () => {
                  const result = await api("/backup", { method: "POST" });
                  download(
                    new Blob([result.encrypted], { type: "application/json" }),
                    "codimate-backup-" + date() + ".enc",
                  );
                })
              }
            >
              암호화 백업 내보내기
            </button>
            <h3>원본에서 복구</h3>
            {health.restoreRequired && (
              <p role="alert" className="error">
                기존 OneDrive 자료를 발견했습니다. 재구축을 완료하기 전에는 새
                자료를 저장할 수 없습니다.
              </p>
            )}
            <p>
              OneDrive에 완료된 기록을 다시 읽어 검색·집계 인덱스를
              재구축합니다.
            </p>
            <button
              onClick={() =>
                work(async () => {
                  if (
                    window.confirm(
                      "현재 서버 인덱스와 계정을 OneDrive 원본으로 재구축할까요? 완료 후 원본에 보관된 계정으로 다시 로그인해야 합니다.",
                    )
                  ) {
                    const result = await api("/restore", { method: "POST" });
                    if (result.requiresLogin) {
                      lockVault();
                      window.location.reload();
                    } else await refresh();
                  }
                })
              }
            >
              OneDrive 원본에서 재구축
            </button>
          </div>
          <div className="card">
            <h3>암호화 기기 보관</h3>
            <p>
              {vaultEnabled()
                ? "이 기기에 암호화 보관이 활성화되어 있습니다."
                : "로그인 화면에서 병원 기기 보관과 암호를 설정할 수 있습니다."}
            </p>
            <p className="small">사용자 ID: {user.id}</p>
            <h3>운영 상태</h3>
            <p>
              {health.mode === "local-development"
                ? "개발 서버 · 실제 OneDrive 저장 아님"
                : "운영 연결 모드"}
            </p>
            <p>대기 작업 {health.pending || 0}건</p>
            <button
              onClick={() =>
                work(async () => {
                  await api("/sync", { method: "POST" });
                  await refresh();
                })
              }
            >
              서버 저장 재시도
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function RecoveryView({
  pending,
  state,
}: {
  pending: Command[];
  state: State;
}) {
  const [conflicts, setConflicts] = useState<Command[]>([]);
  useEffect(() => {
    recoveryCommands().then(setConflicts);
  }, []);
  return (
    <>
      <p>
        충돌하거나 권한 확인이 필요한 내 변경입니다. 서버 내용은 자동으로
        덮어쓰지 않습니다. 관리자는 해당 기록과 비교해 정정할 수 있습니다.
      </p>
      {[...pending, ...conflicts].map((c) => (
        <details key={c.id}>
          <summary>
            {c.type} · {c.entityId || c.id}
          </summary>
          <div className="detail-grid">
            <div>
              <h3>기기에 보존한 내 변경</h3>
              <pre className="recovery-json">
                {JSON.stringify(c.payload, null, 2)}
              </pre>
            </div>
            <div>
              <h3>현재 서버 자료</h3>
              <pre className="recovery-json">
                {JSON.stringify(
                  Object.values(state)
                    .flat()
                    .find((x: any) => x.id === c.entityId) || "현재 자료 없음",
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>
        </details>
      ))}
      {!pending.length && !conflicts.length && (
        <Empty>복구 대기 자료가 없습니다.</Empty>
      )}
    </>
  );
}
