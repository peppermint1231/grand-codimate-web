import "./Discovery.css";
import {
  patientConcerns,
  recommendedProducts,
  type PatientConcern,
} from "../core/patientDiscovery";
import { EventPrice } from "./EventCatalog";
import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  Phone,
  Sun,
  CircleDot,
  Waves,
  Grid2X2,
  Heart,
  MoveUpRight,
  Eye,
  Droplets,
  Smile,
  Feather,
  PersonStanding,
  Sprout,
  Eraser,
  HeartPulse,
  BatteryCharging,
  Check,
  ChevronRight,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import { catalogBookLabel, money, type State } from "../core/model";
import { concerns } from "../core/concerns";
import type { Inquiry, PublicProduct } from "../core/discovery";
const blankPerson = () => ({
  name: "",
  phone: "",
  sex: "U" as "U" | "M" | "F",
  dob: "",
  address: "",
});
export function Discovery() {
  type Selection = {
    productId: string;
    optionId: string;
    catalogVersion: string;
    concernId: string;
    answerId: string;
  };
  const [categories, setCategories] =
    useState<PatientConcern[]>(patientConcerns);
  const [products, setProducts] = useState<PublicProduct[]>([]),
    [token, setToken] = useState("");
  const [step, setStep] = useState(0),
    [concernId, setConcernId] = useState(""),
    [answerId, setAnswerId] = useState("");
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Selection[]>([]),
    [limit, setLimit] = useState(6);
  const [large, setLarge] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const [person, setPerson] = useState(blankPerson),
    [personalConsent, setPersonalConsent] = useState(false),
    [sensitiveConsent, setSensitiveConsent] = useState(false);
  const epoch = useRef(0);
  const kiosk = new URLSearchParams(location.search).has("kiosk");
  const load = async (id: number) => {
    setLoading(true);
    try {
      const d = await api("/public/catalog");
      if (id !== epoch.current) return;
      setProducts(d.products);
      setCategories(d.patientConcerns || patientConcerns);
      setToken(d.token);
      setError("");
    } catch (e) {
      if (id === epoch.current) setError((e as Error).message);
    } finally {
      if (id === epoch.current) setLoading(false);
    }
  };
  const reset = () => {
    const id = ++epoch.current;
    setStep(0);
    setConcernId("");
    setAnswerId("");
    setSelected([]);
    setSearch("");
    setLimit(6);
    setPerson(blankPerson());
    setPersonalConsent(false);
    setSensitiveConsent(false);
    setReceipt("");
    setError("");
    setBusy(false);
    setToken("");
    void load(id);
  };
  useEffect(() => {
    reset();
    return () => {
      epoch.current++;
    };
  }, []);
  useEffect(() => {
    if (!kiosk) return;
    let last = Date.now();
    const activity = () => {
      last = Date.now();
    };
    const timer = setInterval(() => {
      if (Date.now() - last > 180000) {
        last = Date.now();
        reset();
      }
    }, 5000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
    };
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document
      .querySelector<HTMLElement>("[data-discovery-heading]")
      ?.focus({ preventScroll: true });
  }, [step, receipt]);
  const concern = categories.find((c) => c.id === concernId),
    answer = concern?.questions.find((q) => q.id === answerId);
  const matches = recommendedProducts(products, concernId, answerId, search);
  const query = search.trim().toLocaleLowerCase();
  const shownConcerns = categories.filter(
    (c) =>
      [
        c.name,
        c.subtitle,
        ...c.tags,
        ...c.questions.flatMap((q) => [q.label, ...q.recommended]),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query) ||
      products.some(
        (p) =>
          p.matches?.some((m) => m.concernId === c.id) &&
          p.name.toLocaleLowerCase().includes(query),
      ),
  );
  const go = (n: number) => {
    setSearch("");
    setLimit(6);
    setError("");
    setStep(n);
  };
  const choose = (c: PatientConcern) => {
    setConcernId(c.id);
    setAnswerId("");
    go(1);
  };
  const itemKey = (
    p: { catalogVersion: string; id: string },
    optionId: string,
  ) => p.catalogVersion + ":" + p.id + ":" + optionId;
  const toggle = (p: PublicProduct, optionId: string) => {
    const key = itemKey(p, optionId),
      index = selected.findIndex(
        (s) => s.catalogVersion + ":" + s.productId + ":" + s.optionId === key,
      );
    if (index >= 0) setSelected(selected.filter((_, i) => i !== index));
    else if (selected.length < 30)
      setSelected([
        ...selected,
        {
          productId: p.id,
          optionId,
          catalogVersion: p.catalogVersion,
          concernId,
          answerId,
        },
      ]);
    else setError("관심 시술은 30개까지 담을 수 있어요.");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const current = epoch.current;
    setBusy(true);
    setError("");
    const concernIds = [
      ...new Set(
        [concernId, ...selected.map((s) => s.concernId)].filter(Boolean),
      ),
    ];
    const answerIds = [
      ...new Set(
        [answerId, ...selected.map((s) => s.answerId)].filter(Boolean),
      ),
    ];
    try {
      const result = await api("/public/inquiries", {
        method: "POST",
        body: JSON.stringify({
          token,
          person,
          selections: selected.map(
            ({ productId, optionId, catalogVersion }) => ({
              productId,
              optionId,
              catalogVersion,
            }),
          ),
          concerns: concernIds,
          answers: answerIds,
          personalConsent,
          sensitiveConsent,
        }),
      });
      if (current !== epoch.current) return;
      setPerson(blankPerson());
      setSelected([]);
      setConcernId("");
      setAnswerId("");
      setPersonalConsent(false);
      setSensitiveConsent(false);
      setReceipt(result.receipt);
    } catch (e) {
      if (current === epoch.current) setError((e as Error).message);
    } finally {
      if (current === epoch.current) setBusy(false);
    }
  };
  return (
    <main className={"patient-discovery" + (large ? " pd-large" : "")}>
      <div className="pd-shell">
        <header className="pd-header">
          <a
            className="pd-brand"
            href="/discover"
            aria-label="그랜드아름다운의원 맞춤 시술 찾기 처음으로"
          >
            <span className="pd-brand-mark">G</span>
            <span>
              그랜드아름다운의원<small>나를 위한 피부 상담</small>
            </span>
          </a>
          <div className="pd-header-tools">
            <button
              aria-label={large ? "기본 글씨" : "큰 글씨"}
              aria-pressed={large}
              onClick={() => setLarge(!large)}
            >
              가<span>{large ? "기본 글씨" : "큰 글씨"}</span>
            </button>
            <a href="tel:1899-5109" aria-label="병원 전화상담">
              <Phone size={18} />
              <span>전화상담</span>
            </a>
          </div>
        </header>
        {receipt ? (
          <section className="pd-complete pd-panel">
            <CheckCircle2 size={52} />
            <p className="pd-eyebrow">상담 준비 완료</p>
            <h1 data-discovery-heading tabIndex={-1}>
              선택하신 내용을
              <br />
              병원에 전달했어요
            </h1>
            <p>
              접수번호 <strong>{receipt.slice(0, 8).toUpperCase()}</strong>
            </p>
            <p>
              원내에서는 직원에게 접수번호를 알려주세요.
              <br />
              온라인 접수는 병원 확인 후 상담을 이어갑니다.
            </p>
            <p className="pd-muted">예약 확정은 병원 안내를 확인해주세요.</p>
            <button className="pd-primary" onClick={reset}>
              처음으로 돌아가기
            </button>
          </section>
        ) : (
          <>
            <section
              className={"pd-hero" + (step > 0 ? " pd-hero-compact" : "")}
            >
              <div>
                <p className="pd-eyebrow">GRAND · 맞춤 시술 찾기</p>
                {step === 0 ? (
                  <h1>
                    내 피부 고민에 맞는 시술,
                    <br />
                    <em>차근차근 찾아보세요.</em>
                  </h1>
                ) : (
                  <h1>맞춤 시술 찾기</h1>
                )}
                {step === 0 && (
                  <p>
                    어려운 시술 이름을 몰라도 괜찮아요.
                    <br />
                    가장 신경 쓰이는 고민부터 골라주세요.
                  </p>
                )}
              </div>
              <div className="pd-journey">
                <span>간단한 세 단계</span>
                <nav aria-label="시술 찾기 단계">
                  {["고민 선택", "내 상태", "추천 시술"].map((label, i) => (
                    <button
                      key={label}
                      disabled={i > 0 && !concernId}
                      aria-current={
                        Math.min(step, 2) === i ? "step" : undefined
                      }
                      onClick={() => go(i)}
                    >
                      <b>{i + 1}</b>
                      {label}
                    </button>
                  ))}
                </nav>
                <small>마음에 드는 시술은 상담으로 이어드려요.</small>
              </div>
            </section>
            {error && (
              <div className="pd-error" role="alert">
                {error}
                {!token && (
                  <button onClick={() => void load(epoch.current)}>
                    다시 불러오기
                  </button>
                )}
              </div>
            )}
            {step === 0 && (
              <section className="pd-section">
                <div className="pd-section-head">
                  <div>
                    <p className="pd-eyebrow">STEP 01</p>
                    <h2 data-discovery-heading tabIndex={-1}>
                      가장 고민되는 곳은 어디인가요?
                    </h2>
                    <p>
                      한 가지를 골라주세요. 다른 고민도 이어서 살펴볼 수 있어요.
                    </p>
                  </div>
                  <label className="pd-search">
                    <Search size={20} />
                    <input
                      aria-label="고민 검색"
                      placeholder="예: 기미, 주름, 가려움"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        aria-label="검색 지우기"
                        onClick={() => setSearch("")}
                      >
                        ×
                      </button>
                    )}
                  </label>
                </div>
                <div className="pd-keywords" aria-label="자주 찾는 고민">
                  {["기미", "여드름", "모공", "주름", "탈모", "가려움"].map(
                    (s) => (
                      <button
                        key={s}
                        aria-pressed={search === s}
                        onClick={() => setSearch(search === s ? "" : s)}
                      >
                        #{s}
                      </button>
                    ),
                  )}
                </div>
                {loading ? (
                  <p role="status" className="pd-empty">
                    상담 가능한 시술을 불러오고 있어요…
                  </p>
                ) : (
                  <div className="pd-concern-grid">
                    {shownConcerns.map((c, i) => (
                      <button
                        className="pd-concern-card"
                        key={c.id}
                        onClick={() => choose(c)}
                      >
                        <span className="pd-card-top">
                          <ConcernSymbol id={c.id} />
                          <span className="pd-select-hint">
                            선택하기 <ChevronRight size={17} />
                          </span>
                        </span>
                        <h3>{c.name}</h3>
                        <p>{c.subtitle}</p>
                        <span className="pd-tags">
                          {c.tags.slice(0, 3).map((t) => (
                            <span key={t}>{t}</span>
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {!loading && !shownConcerns.length && (
                  <div className="pd-empty">
                    <h3>검색어와 맞는 고민을 찾지 못했어요</h3>
                    <p>다른 말로 검색하거나 전체 고민을 살펴보세요.</p>
                    <button onClick={() => setSearch("")}>
                      전체 고민 보기
                    </button>
                  </div>
                )}
              </section>
            )}
            {step === 1 && concern && (
              <section className="pd-section">
                <button className="pd-back" onClick={() => go(0)}>
                  <ArrowLeft size={18} />
                  고민 다시 선택
                </button>
                <div className="pd-section-head">
                  <div>
                    <p className="pd-eyebrow">STEP 02 · {concern.name}</p>
                    <h2 data-discovery-heading tabIndex={-1}>
                      어떤 상태와 가장 비슷한가요?
                    </h2>
                    <p>가까운 항목 하나를 눌러주세요.</p>
                  </div>
                  <span className="pd-context">
                    선택한 고민 <b>{concern.name}</b>
                  </span>
                </div>
                <div className="pd-answer-grid">
                  {concern.questions.map((q, i) => (
                    <button
                      key={q.id}
                      className="pd-answer-card"
                      onClick={() => {
                        setAnswerId(q.id);
                        go(2);
                      }}
                    >
                      <span className="pd-answer-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <strong>{q.label}</strong>
                      <ChevronRight size={22} />
                    </button>
                  ))}
                </div>
                <button
                  className="pd-unsure"
                  onClick={() => {
                    setAnswerId("");
                    go(2);
                  }}
                >
                  <CircleHelp size={22} />
                  <span>
                    <strong>잘 모르겠어요</strong>
                    <small>이 고민의 시술을 먼저 둘러볼게요.</small>
                  </span>
                  <ChevronRight size={20} />
                </button>
              </section>
            )}
            {step === 2 && concern && (
              <section className="pd-section">
                <button className="pd-back" onClick={() => go(1)}>
                  <ArrowLeft size={18} />내 상태 다시 선택
                </button>
                <div className="pd-result-intro">
                  <div>
                    <p className="pd-eyebrow">
                      STEP 03 · 나에게 맞는 상담 준비
                    </p>
                    <h2 data-discovery-heading tabIndex={-1}>
                      이런 시술을 상담해보세요
                    </h2>
                    <p>
                      <strong>{concern.name}</strong>
                      {answer && <> · {answer.label}</>}
                    </p>
                    <small>
                      선택한 고민과 병원에 등록된 시술 정보로 찾은 상담
                      후보입니다.
                      <br />
                      실제 적합한 시술과 최종 비용은 의료진 상담 후 결정돼요.
                    </small>
                  </div>
                  <Sparkles size={42} />
                </div>
                <div className="pd-results-toolbar">
                  <p>
                    <b>{matches.length}</b>개의 상담 후보
                  </p>
                  <label className="pd-search">
                    <Search size={20} />
                    <input
                      aria-label="추천 시술 검색"
                      placeholder="결과에서 시술 찾기"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setLimit(6);
                      }}
                    />
                    {search && (
                      <button
                        aria-label="검색 지우기"
                        onClick={() => setSearch("")}
                      >
                        ×
                      </button>
                    )}
                  </label>
                </div>
                <div className="pd-product-grid">
                  {matches.slice(0, limit).map((p, i) => {
                    const prices = p.options.flatMap((o) =>
                      o.price === null ? [] : [o.price],
                    );
                    const from = prices.length ? Math.min(...prices) : null;
                    const hasPicked = selected.some(
                      (s) =>
                        s.catalogVersion === p.catalogVersion &&
                        s.productId === p.id,
                    );
                    return (
                      <article
                        className={
                          "pd-product" + (hasPicked ? " pd-picked" : "")
                        }
                        key={p.catalogVersion + ":" + p.id}
                      >
                        <div className="pd-product-top">
                          <span className="pd-result-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="pd-product-concern">
                            {concern.name}
                          </span>
                          {hasPicked && (
                            <span className="pd-selected-mark">
                              <Check size={16} />
                              관심 담음
                            </span>
                          )}
                        </div>
                        <h3>{p.name}</h3>
                        <p className="pd-product-copy">
                          {answer
                            ? `‘${answer.label}’ 선택에 연결된 상담 후보예요.`
                            : `${concern.name} 고민으로 상담할 수 있는 시술이에요.`}
                        </p>
                        {p.event?.period && (
                          <p className="pd-period">
                            안내 기간 {p.event.period}
                          </p>
                        )}
                        <div className="pd-price">
                          {from === null ? (
                            "상담 후 비용 안내"
                          ) : (
                            <>
                              {money(from)}
                              {p.options.length > 1 && <small>부터</small>}
                            </>
                          )}
                          <small>
                            구성별 금액과 부가세는 아래에서 확인해주세요.
                          </small>
                        </div>
                        {p.options.length ? (
                          <details
                            className="pd-options"
                            open={p.options.length === 1 ? true : undefined}
                          >
                            <summary>
                              구성·가격 보기 <ChevronRight size={18} />
                            </summary>
                            {p.options.map((o) => {
                              const picked = selected.some(
                                (s) =>
                                  s.catalogVersion === p.catalogVersion &&
                                  s.productId === p.id &&
                                  s.optionId === o.id,
                              );
                              return (
                                <button
                                  key={o.id}
                                  aria-pressed={picked}
                                  className={
                                    "pd-option" + (picked ? " selected" : "")
                                  }
                                  onClick={() => toggle(p, o.id)}
                                >
                                  <span>
                                    <strong>{o.label}</strong>
                                    <small>{o.unit}</small>
                                  </span>
                                  <span className="pd-option-price">
                                    {o.price === null ? (
                                      "상담 후 비용 확인"
                                    ) : o.event ? (
                                      <EventPrice {...o.event} />
                                    ) : (
                                      money(o.price)
                                    )}
                                    <small>
                                      {o.tax === "inclusive"
                                        ? "부가세 포함"
                                        : o.tax === "exclusive"
                                          ? "부가세 별도"
                                          : o.tax === "exempt"
                                            ? "면세"
                                            : ""}
                                    </small>
                                  </span>
                                  <span className="pd-pick-label">
                                    {picked ? (
                                      <>
                                        <Check size={16} />
                                        담았어요
                                      </>
                                    ) : (
                                      "관심 담기"
                                    )}
                                  </span>
                                </button>
                              );
                            })}
                          </details>
                        ) : (
                          <p className="pd-muted">
                            구체적인 구성은 상담으로 안내드려요.
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
                {!matches.length && (
                  <div className="pd-empty">
                    <CircleHelp size={36} />
                    <h3>정확한 시술은 상담으로 찾아드릴게요</h3>
                    <p>
                      현재 선택과 연결된 안내 시술이 없어요.
                      <br />
                      고민만 전달해도 상담을 요청할 수 있습니다.
                    </p>
                    {search && (
                      <button onClick={() => setSearch("")}>검색 지우기</button>
                    )}
                  </div>
                )}
                {matches.length > limit && (
                  <button
                    className="pd-more"
                    onClick={() => setLimit(limit + 6)}
                  >
                    시술 더 보기 · {matches.length - limit}개 남음{" "}
                    <ChevronRight size={18} />
                  </button>
                )}
                <div className="pd-bottom">
                  <div>
                    <strong>관심 시술 {selected.length}개</strong>
                    <small>고민만으로도 상담할 수 있어요.</small>
                  </div>
                  <button onClick={() => go(0)}>다른 고민도 찾기</button>
                  <button className="pd-primary" onClick={() => go(3)}>
                    상담으로 이어가기 <ChevronRight size={19} />
                  </button>
                </div>
              </section>
            )}
            {step === 3 && (
              <form className="pd-panel pd-form" onSubmit={submit}>
                <button type="button" className="pd-back" onClick={() => go(2)}>
                  <ArrowLeft size={18} />
                  추천 시술로 돌아가기
                </button>
                <p className="pd-eyebrow">마지막으로 알려주세요</p>
                <h2 data-discovery-heading tabIndex={-1}>
                  병원에서 상담을 이어드릴게요
                </h2>
                <p>
                  시술을 결정하는 단계가 아니에요. 고민을 편하게 전달해주세요.
                </p>
                <div className="pd-request-summary">
                  <strong>{concern?.name}</strong>
                  {answer && <p>{answer.label}</p>}
                  {selected.map((item) => {
                    const p = products.find(
                        (p) =>
                          p.id === item.productId &&
                          p.catalogVersion === item.catalogVersion,
                      ),
                      o = p?.options.find((o) => o.id === item.optionId);
                    return (
                      <div
                        key={
                          item.catalogVersion + item.productId + item.optionId
                        }
                      >
                        <span>
                          {p?.name} · {o?.label}
                        </span>
                        <button
                          type="button"
                          aria-label={(p?.name || "") + " 관심 목록에서 삭제"}
                          onClick={() =>
                            setSelected(selected.filter((s) => s !== item))
                          }
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="pd-fields">
                  <label>
                    이름 <span>필수</span>
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
                  <label>
                    연락처 <span>필수</span>
                    <input
                      required
                      type="tel"
                      autoComplete="off"
                      maxLength={15}
                      placeholder="010-0000-0000"
                      value={person.phone}
                      onChange={(e) =>
                        setPerson({ ...person, phone: e.target.value })
                      }
                    />
                  </label>
                </div>
                <details className="pd-optional">
                  <summary>
                    추가 정보 입력 <small>선택사항</small>
                  </summary>
                  <div className="pd-fields">
                    <label>
                      성별
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
                    <label>
                      생년월일
                      <input
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        value={person.dob}
                        onChange={(e) =>
                          setPerson({ ...person, dob: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      주소 · 동까지
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
                </details>
                <div className="pd-consent">
                  <details>
                    <summary>개인정보·건강정보 수집 및 이용 안내</summary>
                    <p>
                      그랜드아름다운의원은 상담 접수와 연락을 위해 이름·연락처
                      및 직접 입력한 성별·생년월일·주소를 사용합니다. 선택한
                      고민과 관심 시술도 함께 전달됩니다. 접수 정보는 30일 후
                      자동 삭제하며, 상담으로 연결하면 접수함에서 삭제하고 병원
                      상담 기록으로 관리합니다. 동의를 거부할 수 있으며 이 경우
                      온라인 접수는 진행되지 않습니다.
                    </p>
                  </details>
                  <label>
                    <input
                      type="checkbox"
                      required
                      checked={personalConsent}
                      onChange={(e) => setPersonalConsent(e.target.checked)}
                    />
                    개인정보 수집·이용에 동의합니다. (필수)
                  </label>
                  <label>
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
                <button
                  className="pd-primary pd-submit"
                  disabled={
                    busy || !token || !personalConsent || !sensitiveConsent
                  }
                >
                  {busy ? "전달하고 있어요…" : "상담 요청 보내기"}
                  <ChevronRight size={20} />
                </button>
              </form>
            )}
          </>
        )}
        <footer className="pd-footer">
          <b>그랜드아름다운의원</b>
          <span>고민을 듣고, 나에게 맞는 방향을 함께 찾습니다.</span>
          {kiosk && (
            <small>
              공용 태블릿에서는 3분 동안 입력이 없으면 처음 화면으로 돌아갑니다.
            </small>
          )}
          <small>입력하신 개인정보는 이 브라우저에 저장하지 않습니다.</small>
        </footer>
      </div>
    </main>
  );
}
function ConcernSymbol({ id }: { id: string }) {
  const icons: Record<string, typeof Sparkles> = {
    pigment: Sun,
    acne: CircleDot,
    scar: Waves,
    pores: Grid2X2,
    redness: Heart,
    lifting: MoveUpRight,
    eye: Eye,
    booster: Droplets,
    "botox-filler": Smile,
    "hair-removal": Feather,
    body: PersonStanding,
    "hair-loss": Sprout,
    tattoo: Eraser,
    "large-scar": Waves,
    medical: HeartPulse,
    condition: BatteryCharging,
  };
  const Icon = icons[id.replace("patient:", "")] || Sparkles;
  return (
    <span className="pd-concern-icon">
      <Icon size={26} strokeWidth={1.5} />
    </span>
  );
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
                {catalogBookLabel(s.book)} · {s.name} / {s.label}
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
