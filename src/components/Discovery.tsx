import { EventPrice } from "./EventCatalog";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  HeartHandshake,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import {
  catalogBooks,
  money,
  type CatalogBook,
  type State,
} from "../core/model";
import { concerns } from "../core/concerns";
import type { Inquiry, PublicProduct, PublicCategory } from "../core/discovery";
const blankPerson = () => ({
  name: "",
  phone: "",
  sex: "U" as "U" | "M" | "F",
  dob: "",
  address: "",
});
export function Discovery() {
  const [concerns, setCategories] = useState<PublicCategory[]>([]);
  const [folderFilter, setFolderFilter] = useState("");
  const [products, setProducts] = useState<PublicProduct[]>([]),
    [token, setToken] = useState("");
  const [step, setStep] = useState(0),
    [selectedConcerns, setConcerns] = useState<string[]>([]),
    [answers, setAnswers] = useState<string[]>([]);
  const [book, setBook] = useState<CatalogBook>("미용"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<
      { productId: string; optionId: string; catalogVersion: string }[]
    >([]);
  const [person, setPerson] = useState(blankPerson),
    [personalConsent, setPersonalConsent] = useState(false),
    [sensitiveConsent, setSensitiveConsent] = useState(false);
  const [filterConcerns, setFilterConcerns] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const reset = () => {
    setStep(0);
    setBook("미용");
    setFolderFilter("");
    setFilterConcerns(true);
    setConcerns([]);
    setAnswers([]);
    setSelected([]);
    setPerson(blankPerson());
    setPersonalConsent(false);
    setSensitiveConsent(false);
    setReceipt("");
    setSearch("");
    setError("");
    api("/public/catalog")
      .then((d) => {
        setProducts(d.products);
        setCategories(d.categories || []);
        setToken(d.token);
      })
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    reset();
  }, []);
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("kiosk")) return;
    let last = Date.now();
    const activity = () => {
      last = Date.now();
    };
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const interval = setInterval(() => {
      if (Date.now() - last > 180_000) {
        last = Date.now();
        reset();
      }
    }, 5000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
    };
  }, []);
  const filtered = products.filter(
    (p) =>
      p.book === book &&
      (!filterConcerns ||
        !selectedConcerns.length ||
        (p.folders || [p.folder]).some((path) =>
          path.some((f) => selectedConcerns.includes(p.book + ":" + f.id)),
        )) &&
      (!folderFilter ||
        (p.folders || [p.folder]).some((path) =>
          path.some((f) => f.id === folderFilter),
        )) &&
      [p.name, ...p.options.map((o) => o.label)].some((x) =>
        x.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
      ),
  );
  const toggleConcern = (id: string) =>
    setConcerns(
      selectedConcerns.includes(id)
        ? selectedConcerns.filter((x) => x !== id)
        : [...selectedConcerns, id],
    );
  return (
    <main className="discovery">
      <header className="discovery-hero">
        <div>
          <span className="discovery-eyebrow">
            <HeartHandshake size={18} /> GRAND · 상담 준비
          </span>
          <h1>맞춤 시술 찾기</h1>
          <p>
            관심 있는 고민과 시술을 골라주세요.
            <br />
            선택한 내용을 병원에 전달하면 상담을 이어갈 수 있어요.
          </p>
        </div>
        <Sparkles size={64} />
      </header>
      {receipt ? (
        <section className="card discovery-complete">
          <Check size={44} />
          <h2>상담 요청을 전달했어요</h2>
          <p>
            접수번호 <b>{receipt.slice(0, 8).toUpperCase()}</b>
          </p>
          <p>
            병원에서 접수 내용을 확인한 뒤 상담을 이어갑니다. 예약 확정은 병원
            안내를 확인해주세요.
          </p>
          <button className="primary" onClick={reset}>
            처음으로
          </button>
        </section>
      ) : (
        <>
          <nav className="discovery-steps" aria-label="상담 준비 단계">
            {["고민 선택", "관심 시술", "상담 접수"].map((label, index) => (
              <button
                key={label}
                className={step === index ? "active" : ""}
                disabled={
                  index > 0 && !selectedConcerns.length && !selected.length
                }
                onClick={() => setStep(index)}
              >
                {index + 1}. {label}
              </button>
            ))}
          </nav>
          <p className="discovery-note">
            선택한 고민과 연결된 상담 후보를 안내합니다. 개인에게 맞는 시술과
            최종 비용은 의료진 상담 후 결정됩니다.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {step === 0 && (
            <section>
              <div className="section-title">
                <h2>어떤 고민이 있으세요?</h2>
                <span>여러 개 선택할 수 있어요</span>
              </div>
              <div className="tabs" aria-label="고민 단가표 구분">
                {catalogBooks.map((kind) => (
                  <button
                    key={kind}
                    className={kind === book ? "active" : ""}
                    onClick={() => {
                      setBook(kind);
                      setFolderFilter("");
                    }}
                  >
                    {kind}
                  </button>
                ))}
              </div>
              <div className="discovery-concerns">
                {concerns
                  .filter((c) => c.book === book)
                  .map((c) => (
                    <button
                      key={c.id}
                      aria-pressed={selectedConcerns.includes(c.id)}
                      className={
                        selectedConcerns.includes(c.id) ? "selected" : ""
                      }
                      style={
                        c.color
                          ? { borderLeft: `5px solid ${c.color}` }
                          : undefined
                      }
                      onClick={() => toggleConcern(c.id)}
                    >
                      <span>{c.name}</span>
                      {selectedConcerns.includes(c.id) ? (
                        <Check size={20} />
                      ) : (
                        <PlusMark />
                      )}
                    </button>
                  ))}
              </div>
              {selectedConcerns.map((id) => {
                const c = concerns.find((c) => c.id === id)!;
                if (!c.questions.length) return null;
                return (
                  <fieldset className="discovery-question" key={id}>
                    <legend>{c.name} · 해당하는 내용을 골라주세요</legend>
                    {c.questions.map((q) => (
                      <label className="check" key={q.id}>
                        <input
                          type="checkbox"
                          checked={answers.includes(q.id)}
                          onChange={(e) =>
                            setAnswers(
                              e.target.checked
                                ? [...answers, q.id]
                                : answers.filter((x) => x !== q.id),
                            )
                          }
                        />
                        {q.label}
                      </label>
                    ))}
                  </fieldset>
                );
              })}
              <div className="discovery-bottom">
                <span>{selectedConcerns.length}개 고민 선택</span>
                <button
                  className="primary"
                  disabled={!selectedConcerns.length}
                  onClick={() => setStep(1)}
                >
                  시술 둘러보기 <ChevronRight size={18} />
                </button>
              </div>
            </section>
          )}
          {step === 1 && (
            <section>
              <div className="section-title">
                <h2>상담하고 싶은 시술을 골라주세요</h2>
                <button onClick={() => setStep(0)}>
                  <ArrowLeft size={16} />
                  고민 다시 선택
                </button>
              </div>
              <div className="tabs" aria-label="시술 단가표 구분">
                {catalogBooks.map((kind) => (
                  <button
                    key={kind}
                    className={book === kind ? "active" : ""}
                    onClick={() => {
                      setBook(kind);
                      setFolderFilter("");
                    }}
                  >
                    {kind}
                  </button>
                ))}
              </div>
              <div className="search">
                <Search size={18} />
                <input
                  aria-label="관심 시술 검색"
                  placeholder="시술명이나 옵션으로 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="check discovery-filter">
                <input
                  type="checkbox"
                  checked={filterConcerns}
                  onChange={(e) => setFilterConcerns(e.target.checked)}
                />
                선택한 고민에 해당하는 시술만 보기
              </label>
              <label className="field">
                <span>세부 폴더</span>
                <select
                  value={folderFilter}
                  onChange={(e) => setFolderFilter(e.target.value)}
                >
                  <option value="">전체 세부 폴더</option>
                  {[
                    ...new Map(
                      products
                        .filter((p) => p.book === book)
                        .flatMap((p) =>
                          (p.folders || [p.folder]).flatMap((path) =>
                            path.map(
                              (f, i) =>
                                [
                                  f.id,
                                  {
                                    id: f.id,
                                    name: path
                                      .slice(0, i + 1)
                                      .map((x) => x.name)
                                      .join(" / "),
                                  },
                                ] as const,
                            ),
                          ),
                        ),
                    ).values(),
                  ].map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="discovery-products">
                {filtered.map((p) => (
                  <article className="card" key={p.id}>
                    <small>
                      {(
                        (p.folders || [p.folder]).find((path) =>
                          folderFilter
                            ? path.some((f) => f.id === folderFilter)
                            : path.some((f) =>
                                selectedConcerns.includes(p.book + ":" + f.id),
                              ),
                        ) || p.folder
                      )
                        .map((f) => f.name)
                        .join(" / ")}
                    </small>
                    <h3>{p.name}</h3>
                    {p.event && (
                      <div className="event-source-info">
                        <p className="event-period">
                          이벤트 기간: {p.event.period || "홈페이지 미표기"}
                        </p>
                        <EventPrice {...p.event} />
                      </div>
                    )}
                    {p.options.map((o) => {
                      const picked = selected.some(
                        (x) =>
                          x.catalogVersion === p.catalogVersion &&
                          x.productId === p.id &&
                          x.optionId === o.id,
                      );
                      return (
                        <button
                          key={o.id}
                          aria-pressed={picked}
                          className={
                            "discovery-option " + (picked ? "selected" : "")
                          }
                          onClick={() => {
                            if (picked)
                              setSelected(
                                selected.filter(
                                  (x) =>
                                    !(
                                      x.catalogVersion === p.catalogVersion &&
                                      x.productId === p.id &&
                                      x.optionId === o.id
                                    ),
                                ),
                              );
                            else if (selected.length < 30)
                              setSelected([
                                ...selected,
                                {
                                  productId: p.id,
                                  optionId: o.id,
                                  catalogVersion: p.catalogVersion,
                                },
                              ]);
                            else
                              setError(
                                "관심 시술은 30개까지 선택할 수 있어요.",
                              );
                          }}
                        >
                          <span>
                            <b>{o.label}</b>
                            <small>{o.unit}</small>
                          </span>
                          <span>
                            {o.price === null
                              ? "상담 후 비용 확인"
                              : money(o.price)}
                            <small>
                              {o.tax === "inclusive"
                                ? "VAT 포함"
                                : o.tax === "exclusive"
                                  ? "VAT 별도"
                                  : o.tax === "exempt"
                                    ? "면세"
                                    : ""}
                            </small>
                          </span>
                          {picked && <Check size={18} />}
                        </button>
                      );
                    })}
                  </article>
                ))}
              </div>
              {!filtered.length && (
                <div className="empty">
                  <p>
                    선택한 고민의 시술 목록을 준비하고 있어요.
                    <br />
                    고민만 전달해도 상담을 요청할 수 있어요.
                  </p>
                </div>
              )}
              <div className="discovery-bottom">
                <span>관심 시술 {selected.length}개</span>
                <button className="primary" onClick={() => setStep(2)}>
                  선택 내용 전달하기 <ChevronRight size={18} />
                </button>
              </div>
            </section>
          )}
          {step === 2 && (
            <form
              className="card discovery-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  const result = await api("/public/inquiries", {
                    method: "POST",
                    body: JSON.stringify({
                      token,
                      person,
                      selections: selected,
                      concerns: selectedConcerns,
                      answers: answers.filter((id) =>
                        concerns.some(
                          (c) =>
                            selectedConcerns.includes(c.id) &&
                            c.questions.some((q) => q.id === id),
                        ),
                      ),
                      personalConsent,
                      sensitiveConsent,
                    }),
                  });
                  setPerson(blankPerson());
                  setSelected([]);
                  setConcerns([]);
                  setAnswers([]);
                  setReceipt(result.receipt);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>병원에서 상담을 이어갈게요</h2>
              <p>
                {selectedConcerns
                  .map((id) => concerns.find((c) => c.id === id)?.name)
                  .join(" · ")}
              </p>
              <div className="discovery-selection-list">
                {selected.map((item) => {
                  const p = products.find(
                      (p) =>
                        p.id === item.productId &&
                        p.catalogVersion === item.catalogVersion,
                    ),
                    o = p?.options.find((o) => o.id === item.optionId);
                  return (
                    <div
                      key={item.catalogVersion + item.productId + item.optionId}
                    >
                      <span>
                        {p?.book} · {p?.name} / {o?.label}
                      </span>
                      <button
                        type="button"
                        aria-label={(p?.name || "") + " 관심 목록에서 삭제"}
                        onClick={() =>
                          setSelected(selected.filter((x) => x !== item))
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>이름 *</span>
                  <input
                    required
                    autoComplete="off"
                    maxLength={80}
                    value={person.name}
                    onChange={(e) =>
                      setPerson({ ...person, name: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>연락처 *</span>
                  <input
                    required
                    type="tel"
                    autoComplete="off"
                    maxLength={15}
                    value={person.phone}
                    onChange={(e) =>
                      setPerson({ ...person, phone: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>성별 (선택)</span>
                  <select
                    value={person.sex}
                    onChange={(e) =>
                      setPerson({
                        ...person,
                        sex: e.target.value as typeof person.sex,
                      })
                    }
                  >
                    <option value="U">선택 안 함</option>
                    <option value="F">여성</option>
                    <option value="M">남성</option>
                  </select>
                </label>
                <label className="field">
                  <span>생년월일 (선택)</span>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={person.dob}
                    onChange={(e) =>
                      setPerson({ ...person, dob: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>주소 · 동까지 (선택)</span>
                  <input
                    autoComplete="off"
                    maxLength={160}
                    value={person.address}
                    onChange={(e) =>
                      setPerson({ ...person, address: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="discovery-consent">
                <p>
                  그랜드아름다운의원은 상담 접수와 연락을 위해 이름·연락처 및
                  직접 입력한 성별·생년월일·주소를 사용합니다. 선택한 고민과
                  관심 시술도 함께 전달됩니다. 접수 정보는 30일 후 자동
                  삭제하며, 상담으로 연결하면 접수함에서 삭제하고 병원 상담
                  기록으로 관리합니다. 동의를 거부할 수 있으며 이 경우 온라인
                  접수는 진행되지 않습니다.
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    required
                    checked={personalConsent}
                    onChange={(e) => setPersonalConsent(e.target.checked)}
                  />
                  개인정보 수집·이용에 동의합니다. (필수)
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    required
                    checked={sensitiveConsent}
                    onChange={(e) => setSensitiveConsent(e.target.checked)}
                  />
                  고민·관심 시술 등 건강 관련 정보의 수집·이용에 동의합니다.
                  (필수)
                </label>
              </div>
              <div className="button-row">
                <button type="button" onClick={() => setStep(1)}>
                  선택 수정
                </button>
                <button
                  className="primary"
                  disabled={
                    busy || !token || !personalConsent || !sensitiveConsent
                  }
                >
                  {busy ? "전달 중…" : "상담 요청 보내기"}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      <footer>
        원내 공용 태블릿에서는 3분 동안 입력이 없으면 초기화됩니다. 입력 정보는
        이 브라우저에 저장하지 않습니다.
      </footer>
    </main>
  );
}
function PlusMark() {
  return <ChevronRight size={20} />;
}
export function DiscoveryDesk({
  state,
  publicUrl,
  work,
  openConsult,
}: {
  state: State;
  publicUrl: string;
  work: (fn: () => Promise<unknown>) => unknown;
  openConsult: (patientId: string, consultationId: string) => Promise<void>;
}) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Inquiry>(),
    [person, setPerson] = useState(blankPerson),
    [patientId, setPatientId] = useState(""),
    [category, setCategory] = useState<"미용" | "보험">("미용");
  const refresh = async () => {
    const d = await api("/inquiries");
    setInquiries(d.inquiries);
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <div className="page-title">
        <div>
          <h1>맞춤 시술 찾기</h1>
          <p>환자가 선택한 고민·관심 시술을 확인하고 상담으로 연결합니다.</p>
        </div>
      </div>
      <div className="card">
        <h3>환자용 웹 주소</h3>
        <p>
          <a href={publicUrl} target="_blank" rel="noreferrer">
            {publicUrl}
          </a>
        </p>
        <div className="button-row">
          <button
            onClick={() =>
              work(async () => navigator.clipboard.writeText(publicUrl))
            }
          >
            주소 복사
          </button>
          <a
            className="button"
            href={publicUrl + "?kiosk=1"}
            target="_blank"
            rel="noreferrer"
          >
            원내 태블릿 화면 열기
          </a>
        </div>
        <p className="small">
          홈페이지에는 이 주소를 링크하거나 iframe으로 넣을 수 있습니다.
        </p>
        <code className="embed-code">{`<iframe src="${publicUrl}" title="맞춤 시술 찾기" width="100%" height="960" style="border:0"></iframe>`}</code>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="detail-grid">
        <section className="card">
          <div className="section-title">
            <h3>새 상담 요청 {inquiries.length}건</h3>
            <button onClick={() => work(refresh)}>새로고침</button>
          </div>
          {inquiries.map((item) => (
            <button
              className="list-row"
              key={item.id}
              onClick={() => {
                setSelected(item);
                setPerson(item.person);
                setPatientId("");
                setCategory(
                  item.selections.every((s) => s.book === "보험") &&
                    item.selections.length
                    ? "보험"
                    : "미용",
                );
              }}
            >
              <span>
                <b>{item.person.name}</b>
                <small>
                  {item.person.phone} ·{" "}
                  {new Date(item.createdAt).toLocaleString("ko-KR")}
                </small>
              </span>
              <span>관심 {item.selections.length}개</span>
            </button>
          ))}
          {!inquiries.length && <p>접수된 요청이 없습니다.</p>}
        </section>
        {selected && (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              work(async () => {
                const d = await api("/inquiries/convert", {
                  method: "POST",
                  body: JSON.stringify({
                    id: selected.id,
                    patientId: patientId || undefined,
                    person,
                    category,
                  }),
                });
                await openConsult(d.patientId, d.consultationId);
              });
            }}
          >
            <h3>{selected.person.name} 님의 상담 준비</h3>
            <p>
              {(
                selected.concernLabels ||
                selected.concerns.map(
                  (id) => concerns.find((c) => c.id === id)?.name || id,
                )
              ).join(" · ")}
            </p>
            <p className="small">
              {(
                selected.answerLabels ||
                selected.answers
                  .map(
                    (id) =>
                      concerns
                        .flatMap((c) => [...c.questions])
                        .find((q) => q.id === id)?.label,
                  )
                  .filter(Boolean)
              ).join(" · ")}
            </p>
            {selected.selections.map((s) => (
              <p key={s.catalogVersion + s.productId + s.optionId}>
                {s.book} · {s.name} / {s.label}
              </p>
            ))}
            <p className="small">
              검토·판매 중인 옵션만 현재 게시 가격으로 장바구니에 담습니다.
              나머지 관심 항목은 상담 메모에 남습니다.
            </p>
            <label className="field">
              <span>환자 연결</span>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              >
                <option value="">신규 환자로 등록</option>
                {state.patients
                  .filter((p) => !p.archived && !p.mergedInto)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.dob} · {p.phone}
                    </option>
                  ))}
              </select>
            </label>
            {!patientId && (
              <>
                <label className="field">
                  <span>이름</span>
                  <input
                    required
                    value={person.name}
                    onChange={(e) =>
                      setPerson({ ...person, name: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>연락처</span>
                  <input
                    required
                    value={person.phone}
                    onChange={(e) =>
                      setPerson({ ...person, phone: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>성별</span>
                  <select
                    value={person.sex}
                    onChange={(e) =>
                      setPerson({
                        ...person,
                        sex: e.target.value as typeof person.sex,
                      })
                    }
                  >
                    <option value="U">미상</option>
                    <option value="M">남성</option>
                    <option value="F">여성</option>
                  </select>
                </label>
                <label className="field">
                  <span>생년월일</span>
                  <input
                    required
                    type="date"
                    value={person.dob}
                    onChange={(e) =>
                      setPerson({ ...person, dob: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>주소 · 동까지</span>
                  <input
                    required
                    value={person.address}
                    onChange={(e) =>
                      setPerson({ ...person, address: e.target.value })
                    }
                  />
                </label>
              </>
            )}
            <label className="field">
              <span>상담 구분</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
              >
                <option>미용</option>
                <option>보험</option>
              </select>
            </label>
            <button className="primary">상담으로 연결</button>
          </form>
        )}
      </div>
    </>
  );
}
