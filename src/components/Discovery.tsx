import { PackageComposition } from "./PackageComposition";
import { ProductDescription } from "./ProductDescription";
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
import {
  consultationTimes,
  seoulToday,
  closureReason,
} from "../core/appointments";
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
  const [visitType, setVisitType] = useState<"" | "first" | "returning">("");
  const [requestedDate, setRequestedDate] = useState(""),
    [requestedTime, setRequestedTime] = useState(""),
    [requests, setRequests] = useState("");
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const epoch = useRef(0);
  const kiosk = new URLSearchParams(location.search).has("kiosk");
  const load = async (id: number) => {
    setLoading(true);
    try {
      const d = await api("/public/catalog");
      if (id !== epoch.current) return;
      setProducts(d.products);
      setClosedDates(d.closedDates || []);
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
    setVisitType("");
    setRequestedDate("");
    setRequestedTime("");
    setRequests("");
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
          visitType,
          requestedDate,
          requestedTime,
          requests,
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
      setVisitType("");
      setRequestedDate("");
      setRequestedTime("");
      setRequests("");
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
                {[
                  {
                    title: "이벤트",
                    items: matches.filter((p) => p.book === "이벤트"),
                    event: true,
                  },
                  {
                    title: "추천시술",
                    items: matches.filter((p) => p.book !== "이벤트"),
                    event: false,
                  },
                ]
                  .filter((g) => g.items.length)
                  .map((group) => (
                    <section
                      key={group.title}
                      className={
                        "pd-recommendation-group" +
                        (group.event ? " pd-event-group" : "")
                      }
                      aria-label={group.title}
                    >
                      <h3 className="pd-group-title">
                        {group.event && <Sparkles size={22} />} {group.title}{" "}
                        <small>{group.items.length}개</small>
                      </h3>
                      <p>
                        {group.event
                          ? "이벤트가로 만나보는 시술이에요."
                          : "내 상태에 맞는 구성과 비용은 맞춤 상담 후 안내해드려요."}
                      </p>
                      <div className="pd-product-grid">
                        {group.items.slice(0, limit).map((p, i) => {
                          const prices = p.options.flatMap((o) =>
                            o.price === null ? [] : [o.price],
                          );
                          const from = prices.length
                            ? Math.min(...prices)
                            : null;
                          const hasPicked = selected.some(
                            (s) =>
                              s.catalogVersion === p.catalogVersion &&
                              s.productId === p.id,
                          );
                          return (
                            <article
                              className={
                                "pd-product" +
                                (group.event ? " pd-event-product" : "") +
                                (hasPicked ? " pd-picked" : "")
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
                                {group.event && (
                                  <span className="pd-event-badge">이벤트</span>
                                )}
                                {hasPicked && (
                                  <span className="pd-selected-mark">
                                    <Check size={16} />
                                    관심 담음
                                  </span>
                                )}
                              </div>
                              <h3 className="pd-product-title">{p.name}</h3>
                              {p.options.some((o) => o.packageComposition) && (
                                <span className="pd-copy-label">
                                  공통 상품 설명
                                </span>
                              )}
                              <ProductDescription description={p.description} />
                              {p.event?.period && (
                                <p className="pd-period">
                                  안내 기간 {p.event.period}
                                </p>
                              )}
                              <div className="pd-price">
                                {p.book !== "이벤트" ? (
                                  "맞춤 상담 후 안내"
                                ) : from === null ? (
                                  "맞춤 상담 후 안내"
                                ) : (
                                  <>
                                    {money(from)}
                                    {p.options.length > 1 && (
                                      <small>부터</small>
                                    )}
                                  </>
                                )}
                                <small>
                                  {p.book === "이벤트"
                                    ? "구성별 금액과 부가세는 아래에서 확인해주세요."
                                    : "나에게 필요한 시술 구성을 상담으로 확인하세요."}
                                </small>
                              </div>
                              {p.options.length ? (
                                <details
                                  className="pd-options"
                                  open={
                                    p.options.length === 1 ||
                                    p.options.some((o) => o.packageComposition)
                                      ? true
                                      : undefined
                                  }
                                >
                                  <summary>
                                    {p.book === "이벤트"
                                      ? "구성·가격 보기"
                                      : "시술 구성 보기"}{" "}
                                    <ChevronRight size={18} />
                                  </summary>
                                  {p.options.some(
                                    (o) => o.packageComposition,
                                  ) && (
                                    <p className="pd-package-help">
                                      회차별 구성을 비교한 뒤 원하는 옵션을
                                      담아주세요. 선택 후 상담에서 최종 결정할
                                      수 있습니다.
                                    </p>
                                  )}
                                  {p.options.map((o) => {
                                    const picked = selected.some(
                                      (s) =>
                                        s.catalogVersion === p.catalogVersion &&
                                        s.productId === p.id &&
                                        s.optionId === o.id,
                                    );
                                    return (
                                      <div
                                        key={o.id}
                                        className="pd-option-group"
                                      >
                                        <button
                                          aria-pressed={picked}
                                          className={
                                            "pd-option" +
                                            (picked ? " selected" : "")
                                          }
                                          onClick={() => toggle(p, o.id)}
                                        >
                                          <span>
                                            <strong>{o.label}</strong>
                                            <small>{o.unit}</small>
                                          </span>
                                          <span className="pd-option-price">
                                            {p.book !== "이벤트" ? (
                                              "맞춤 상담 후 안내"
                                            ) : o.price === null ? (
                                              "맞춤 상담 후 안내"
                                            ) : o.event ? (
                                              <EventPrice {...o.event} />
                                            ) : (
                                              money(o.price)
                                            )}
                                            <small>
                                              {p.book !== "이벤트"
                                                ? ""
                                                : o.tax === "inclusive"
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
                                        {o.packageComposition && (
                                          <details className="pd-package-composition">
                                            <summary>
                                              {o.label} 패키지 구성 보기
                                            </summary>
                                            <PackageComposition
                                              text={o.packageComposition}
                                            />
                                          </details>
                                        )}
                                      </div>
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
                      {group.items.length > limit && (
                        <button
                          className="pd-more"
                          onClick={() => setLimit(limit + 6)}
                        >
                          {group.title} 더 보기 · {group.items.length - limit}개
                          남음 <ChevronRight size={18} />
                        </button>
                      )}
                    </section>
                  ))}
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
                <label className="pd-visit-type">
                  <span>
                    방문 여부 <small>필수</small>
                  </span>
                  <select
                    required
                    value={visitType}
                    onChange={(e) =>
                      setVisitType(e.target.value as typeof visitType)
                    }
                  >
                    <option value="">선택해주세요</option>
                    <option value="first">처음 방문</option>
                    <option value="returning">재방문</option>
                  </select>
                </label>
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
                <div className="pd-optional">
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
                      생년월일 {visitType === "first" && <span>필수</span>}
                      <input
                        required={visitType === "first"}
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        value={person.dob}
                        onChange={(e) =>
                          setPerson({ ...person, dob: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      주소 · 동까지 {visitType === "first" && <span>필수</span>}
                      <input
                        required={visitType === "first"}
                        placeholder="예: 춘천시 퇴계동"
                        autoComplete="off"
                        maxLength={160}
                        value={person.address}
                        onChange={(e) =>
                          setPerson({ ...person, address: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </div>
                <div className="pd-fields pd-booking-fields">
                  <label>
                    상담 희망일 <span>필수</span>
                    <input
                      type="date"
                      required
                      min={seoulToday()}
                      max={seoulToday(Date.now() + 90 * 86400000)}
                      value={requestedDate}
                      onChange={(e) => {
                        setRequestedDate(e.target.value);
                        setRequestedTime("");
                      }}
                    />
                  </label>
                  <label>
                    상담 희망 시간 <span>필수</span>
                    <select
                      required
                      value={requestedTime}
                      onChange={(e) => setRequestedTime(e.target.value)}
                    >
                      <option value="">시간 선택</option>
                      {consultationTimes(
                        requestedDate,
                        Date.now(),
                        closedDates,
                      ).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {requestedDate &&
                  !consultationTimes(requestedDate, Date.now(), closedDates)
                    .length && (
                    <p role="status">
                      {closureReason(requestedDate, closedDates) ||
                        "선택 가능한 시간이 없어요."}{" "}
                      다른 날짜를 골라주세요.
                    </p>
                  )}
                <p className="pd-muted">
                  평일 10:00~19:00(13:00~14:00 제외), 토요일 09:00~14:00.
                  일요일·공휴일은 휴진입니다. 희망 일정이며 병원에서 연락드린 뒤
                  확정됩니다.
                </p>
                <label className="pd-request-note">
                  요청사항 <small>선택</small>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="다른 희망 시간이나 미리 전하고 싶은 내용을 적어주세요."
                    value={requests}
                    onChange={(e) => setRequests(e.target.value)}
                  />
                </label>
                <div className="pd-consent">
                  <details>
                    <summary>개인정보·건강정보 수집 및 이용 안내</summary>
                    <p>
                      그랜드아름다운의원은 상담 접수와 연락을 위해 이름·연락처
                      및 직접 입력한 성별·생년월일·주소를 사용합니다. 선택한
                      고민·관심 시술·방문 여부·희망 일정·요청사항도 함께
                      전달됩니다. 접수 정보는 희망일 또는 변경된 상담일로부터
                      30일 후 자동 삭제하며, 상담으로 연결하면 접수함에서
                      삭제하고 병원 상담 기록으로 관리합니다. 동의를 거부할 수
                      있으며 이 경우 온라인 접수는 진행되지 않습니다.
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
                {busy && (
                  <p className="pd-saving" role="status" aria-live="polite">
                    상담 요청을 안전하게 저장하고 있어요. 접수가 끝나면 완료
                    화면으로 안내해 드립니다.
                  </p>
                )}
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

export { DiscoveryDesk } from "./DiscoveryDesk";
