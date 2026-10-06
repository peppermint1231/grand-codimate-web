import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { allowed, catalogBookLabel, type State } from "../core/model";
import type { Inquiry } from "../core/discovery";
import type {
  IntakeSearchRow,
  IntakeSelection,
  IntakeStatus,
} from "../core/intake";
import {
  consultationTimes,
  closureReason,
  coordinatorColor,
  patientCandidates,
  seoulToday,
} from "../core/appointments";
import "./DiscoveryDesk.css";
type Appointment = {
  id: string;
  patientId: string;
  name: string;
  date: string;
  time: string;
  coordinatorId: string;
  completed: boolean;
  confirmed: boolean;
  cancelled: boolean;
};
const blankPerson = () => ({
  name: "",
  phone: "",
  sex: "U" as "M" | "F" | "U",
  dob: "",
  address: "",
});
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
    [appointments, setAppointments] = useState<Appointment[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Inquiry>(),
    [person, setPerson] = useState(blankPerson),
    [patientId, setPatientId] = useState(""),
    [category, setCategory] = useState<"미용" | "보험">("미용");
  const [month, setMonth] = useState(seoulToday().slice(0, 7)),
    [date, setDate] = useState(""),
    [time, setTime] = useState(""),
    [owner, setOwner] = useState("");
  const [intakes, setIntakes] = useState<IntakeSearchRow[]>([]),
    [intakeMessage, setIntakeMessage] = useState(""),
    [intakeSelection, setIntakeSelection] = useState<IntakeSelection>();
  const [closures, setClosures] = useState<{ rev: number; dates: string[] }>({
      rev: 0,
      dates: [],
    }),
    [closureDate, setClosureDate] = useState("");
  const panel = useRef<HTMLElement>(null);
  const refresh = async () => {
    const d = await api("/inquiries");
    setInquiries(d.inquiries);
    setClosures(d.closures || { rev: 0, dates: [] });
    setAppointments(d.appointments || []);
  };
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const t = setInterval(() => void refresh().catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let live = true;
    setIntakes([]);
    setIntakeSelection(undefined);
    setIntakeMessage("");
    if (selected?.visitType !== "returning") return;
    setIntakeMessage("초진설문지 후보를 찾고 있습니다…");
    void (async () => {
      const status = await api<IntakeStatus>(
        "/intake/settings",
        {},
        { operation: null },
      );
      if (!status.configured) {
        if (live)
          setIntakeMessage(
            "초진설문지 연동이 설정되지 않았습니다. 환자목록에서 확인하거나 설정에서 연동해주세요.",
          );
        return;
      }
      const queries = [
        selected.person.phone.replace(/\D/g, ""),
        selected.person.name,
      ].filter((q) => q.length >= 2);
      const found = await Promise.all(
        queries.map((q) =>
          api<{ rows: IntakeSearchRow[] }>(
            "/intake/search?" + new URLSearchParams({ q, page: "0" }),
            {},
            { operation: null },
          ),
        ),
      );
      if (live) {
        setIntakes([
          ...new Map(
            found.flatMap((x) => x.rows).map((x) => [x.id, x]),
          ).values(),
        ]);
        setIntakeMessage("이름·연락처를 확인한 뒤 연결할 환자를 선택하세요.");
      }
    })().catch((e) => {
      if (live)
        setIntakeMessage("초진설문지를 불러오지 못했습니다. " + e.message);
    });
    return () => {
      live = false;
    };
  }, [selected?.id]);
  const choose = (item: Inquiry) => {
    setSelected(item);
    setPerson(item.person);
    setPatientId("");
    setDate(item.schedule?.date || item.requestedDate || "");
    setTime(item.schedule?.time || item.requestedTime || "");
    setOwner(item.schedule?.coordinatorId || "");
    setCategory(
      item.selections.length && item.selections.every((s) => s.book === "보험")
        ? "보험"
        : "미용",
    );
    setError("");
    setTimeout(
      () =>
        panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  };
  const saveSchedule = (action: string) =>
    run(async () => {
      if (!selected) return;
      const d = await api("/inquiries/schedule", {
        method: "POST",
        body: JSON.stringify({
          id: selected.id,
          rev: selected.rev || 0,
          action,
          date,
          time,
          coordinatorId: owner,
        }),
      });
      setSelected(d.inquiry);
      await refresh();
    });
  const shiftMonth = (delta: number) => {
    const d = new Date(month + "-01T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + delta);
    setMonth(d.toISOString().slice(0, 7));
  };
  const start = new Date(month + "-01T12:00:00Z"),
    offset = start.getUTCDay(),
    days = new Date(
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      0,
    ).getDate();
  const staff = state.users.filter((u) => u.active);
  const colorRoster = state.users.map((u) => u.id);
  const staffName = (id: string) =>
    state.users.find((u) => u.id === id)?.name || "미배정";
  const calendarRows = [
    ...inquiries
      .filter((i) => i.schedule || i.requestedDate)
      .map((i) => ({
        id: i.id,
        date: i.schedule?.date || i.requestedDate!,
        time: i.schedule?.time || i.requestedTime || "",
        name: i.person.name,
        owner: i.schedule?.coordinatorId || "",
        cancelled: i.status === "cancelled",
        completed: false,
        confirmed: !!i.schedule?.confirmed,
        inquiry: i,
        appointment: undefined as Appointment | undefined,
      })),
    ...appointments.map((a) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      name: a.name,
      owner: a.coordinatorId,
      cancelled: a.cancelled,
      completed: a.completed,
      confirmed: a.confirmed || a.completed,
      inquiry: undefined as Inquiry | undefined,
      appointment: a,
    })),
  ];
  const candidates = selected
    ? patientCandidates(state.patients, selected.person)
    : [];
  return (
    <>
      <div className="page-title">
        <div>
          <h1>맞춤 시술 찾기 · 상담 일정</h1>
          <p>희망 일정을 확인하고 연락 후 상담자와 시간을 확정하세요.</p>
        </div>
        <button onClick={() => void run(refresh)}>새로고침</button>
      </div>
      <details className="card">
        <summary>환자용 추천기 주소 · 태블릿</summary>
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
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="card inquiry-calendar" aria-label="상담요청 캘린더">
        <div className="section-title">
          <h2>상담요청 캘린더</h2>
          <div className="button-row">
            <button aria-label="이전 달" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
            <input
              aria-label="캘린더 월"
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
            <button aria-label="다음 달" onClick={() => shiftMonth(1)}>
              ›
            </button>
            <button onClick={() => setMonth(seoulToday().slice(0, 7))}>
              이번 달
            </button>
          </div>
        </div>
        <div className="inquiry-legend">
          <span className="inquiry-legend-unassigned">새 요청·미배정</span>
          <span className="inquiry-legend-cancelled">취소</span>
          {staff.map((u) => (
            <span
              key={u.id}
              style={{ background: coordinatorColor(u.id, false, colorRoster) }}
            >
              {u.name}
            </span>
          ))}
          <small>확정: 상담자 색상 · 완료: 같은 색의 어두운 배경</small>
        </div>
        <details className="inquiry-closure-settings">
          <summary>임시공휴일 · 병원 휴진일 추가</summary>
          <p className="small">
            공휴일은 자동 제외됩니다. 아래는 추가 휴진일입니다. 기존 접수는 자동
            취소되지 않으므로 환자에게 연락해 일정을 변경하세요.
          </p>
          <div className="button-row">
            <input
              aria-label="추가 휴진일"
              type="date"
              value={closureDate}
              onChange={(e) => setClosureDate(e.target.value)}
            />
            <button
              disabled={busy || !closureDate}
              onClick={() =>
                void run(async () => {
                  const d = await api("/inquiries/closures", {
                    method: "POST",
                    body: JSON.stringify({
                      date: closureDate,
                      action: "add",
                      rev: closures.rev,
                    }),
                  });
                  setClosures(d.closures);
                })
              }
            >
              휴진일 추가
            </button>
          </div>
          {closures.dates.map((d) => (
            <div className="button-row" key={d}>
              <span>{d}</span>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await api("/inquiries/closures", {
                      method: "POST",
                      body: JSON.stringify({
                        date: d,
                        action: "remove",
                        rev: closures.rev,
                      }),
                    });
                    setClosures(r.closures);
                  })
                }
              >
                휴진 해제
              </button>
            </div>
          ))}
        </details>
        <div className="inquiry-calendar-scroll">
          <div className="inquiry-month-grid">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <b className="inquiry-weekday" key={d}>
                {d}
              </b>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div className="inquiry-day empty" key={"empty" + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = month + "-" + String(i + 1).padStart(2, "0");
              return (
                <div
                  key={day}
                  className={
                    "inquiry-day" + (day === seoulToday() ? " today" : "")
                  }
                >
                  <b>{i + 1}</b>
                  {closureReason(day, closures.dates) && (
                    <small className="inquiry-closure-label">
                      {closureReason(day, closures.dates)}
                    </small>
                  )}
                  {calendarRows
                    .filter((r) => r.date === day)
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((r) => (
                      <button
                        key={r.id}
                        className="inquiry-calendar-event"
                        style={{
                          background: r.cancelled
                            ? "#71717a"
                            : r.confirmed && r.owner
                              ? coordinatorColor(
                                  r.owner,
                                  r.completed,
                                  colorRoster,
                                )
                              : "#4a6178",
                        }}
                        onClick={() =>
                          r.appointment
                            ? work(() =>
                                openConsult(
                                  r.appointment!.patientId,
                                  r.appointment!.id,
                                ),
                              )
                            : choose(r.inquiry!)
                        }
                      >
                        <strong>
                          {r.time} {r.name}
                        </strong>
                        <small>
                          {r.cancelled
                            ? "취소"
                            : r.completed
                              ? "상담완료"
                              : r.confirmed
                                ? "일정 확정"
                                : r.owner
                                  ? "배정·일정 미확정"
                                  : "새 상담요청 · 미배정"}
                          {r.owner ? " · " + staffName(r.owner) : ""}
                        </small>
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <div className="detail-grid inquiry-workspace">
        <section className="card">
          <h3>
            상담 요청 {inquiries.filter((i) => i.status === "new").length}건
          </h3>
          <div className="inquiry-list">
            {inquiries.map((i) => (
              <button className="list-row" key={i.id} onClick={() => choose(i)}>
                <span>
                  <b>{i.person.name}</b>
                  <small>
                    {i.person.phone} ·{" "}
                    {i.visitType === "first"
                      ? "처음 방문"
                      : i.visitType === "returning"
                        ? "재방문"
                        : "방문 구분 없음"}
                  </small>
                  <small>
                    {i.schedule?.date || i.requestedDate}{" "}
                    {i.schedule?.time || i.requestedTime}
                  </small>
                </span>
                <span>
                  {i.status === "cancelled"
                    ? "취소"
                    : i.schedule?.confirmed
                      ? "확정"
                      : i.schedule?.coordinatorId
                        ? "배정"
                        : "미배정"}
                </span>
              </button>
            ))}
            {!inquiries.length && <p>새 요청이 없습니다.</p>}
          </div>
        </section>
        {selected && (
          <section
            className="card inquiry-preparation"
            ref={panel}
            aria-label="상담 준비"
          >
            <h3>{selected.person.name} 님의 상담 준비</h3>
            <p>
              {selected.visitType === "first"
                ? "처음 방문"
                : selected.visitType === "returning"
                  ? "재방문"
                  : "기존 접수"}{" "}
              · {selected.person.phone}
            </p>
            <p>
              최초 희망: {selected.requestedDate || "미입력"}{" "}
              {selected.requestedTime}
            </p>
            {selected.requests && (
              <div className="inquiry-request-note">
                <strong>환자 요청사항</strong>
                <p>{selected.requests}</p>
              </div>
            )}
            <p>{selected.concernLabels?.join(" · ")}</p>
            <p>{selected.answerLabels?.join(" · ")}</p>
            {selected.selections.map((s) => (
              <p
                className="small"
                key={s.catalogVersion + s.productId + s.optionId}
              >
                {catalogBookLabel(s.book)} · {s.name} / {s.label}
              </p>
            ))}
            <fieldset disabled={busy}>
              <legend>연락 후 일정 · 상담자 지정</legend>
              <div className="form-grid">
                <label className="field">
                  상담일
                  <input
                    type="date"
                    min={seoulToday()}
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setTime("");
                    }}
                  />
                </label>
                <label className="field">
                  상담 시간
                  <select
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  >
                    <option value="">시간 선택</option>
                    {[
                      ...new Set([
                        time,
                        ...consultationTimes(date, Date.now(), closures.dates),
                      ]),
                    ]
                      .filter(Boolean)
                      .sort()
                      .map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  상담자
                  <select
                    aria-label="상담자"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    <option value="">미배정</option>
                    {staff.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="button-row">
                <button
                  onClick={() =>
                    saveSchedule(
                      selected.status === "cancelled" ? "reopen" : "save",
                    )
                  }
                >
                  {selected.status === "cancelled"
                    ? "다시 접수"
                    : "변경 저장 · 미확정"}
                </button>
                <button
                  className="primary"
                  onClick={() => saveSchedule("confirm")}
                >
                  연락 완료 · 일정 확정
                </button>
                {selected.status !== "cancelled" && (
                  <button
                    onClick={() => {
                      if (confirm("이 상담 요청을 취소할까요?"))
                        void saveSchedule("cancel");
                    }}
                  >
                    요청 취소
                  </button>
                )}
              </div>
              <p className="small">
                자동 문자 발송은 하지 않습니다. 환자와 연락한 뒤 확정하세요.
                다른 상담자도 배정할 수 있습니다.
              </p>
            </fieldset>
            {selected.status !== "cancelled" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
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
                {selected.visitType === "returning" && (
                  <div className="inquiry-candidates">
                    <h4>추정 환자 · 확인 후 선택</h4>
                    {candidates.map(({ patient: p, score }) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setPatientId(p.id)}
                        aria-pressed={patientId === p.id}
                      >
                        {p.name} · {p.phone} · {p.dob}
                        <small>
                          {score === 3
                            ? "이름·연락처 일치"
                            : score === 2
                              ? "연락처 일치"
                              : "이름 일치"}
                        </small>
                      </button>
                    ))}
                    {!candidates.length && (
                      <p>환자목록에 일치하는 후보가 없습니다.</p>
                    )}
                    <h4>초진설문지 후보</h4>
                    <p className="small">{intakeMessage}</p>
                    {intakes.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const d = await api<IntakeSelection>(
                              "/intake/select",
                              {
                                method: "POST",
                                body: JSON.stringify({ id: row.id }),
                              },
                            );
                            setIntakeSelection(d);
                            if (d.alreadyImported) setPatientId(d.patientId);
                            else if (!d.matches.length) {
                              setPerson(d.fields);
                              setPatientId("");
                            }
                          })
                        }
                      >
                        {row.name} · {row.phone}
                      </button>
                    ))}
                    {intakeSelection && (
                      <div>
                        {intakeSelection.matches.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => setPatientId(p.id)}
                          >
                            {p.name} · {p.phone} · {p.dob} 연결
                          </button>
                        ))}
                        {!intakeSelection.alreadyImported && (
                          <button
                            type="button"
                            onClick={() => {
                              setPerson(intakeSelection.fields);
                              setPatientId("");
                            }}
                          >
                            설문지 정보로 신규 등록 준비
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <label className="field">
                  환자 연결
                  <select
                    aria-label="환자 연결"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                  >
                    <option value="">신규 환자로 등록</option>
                    {state.patients
                      .filter((p) => !p.archived && !p.mergedInto)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.phone} · {p.dob}
                        </option>
                      ))}
                  </select>
                </label>
                {!patientId && (
                  <div className="form-grid">
                    <label className="field">
                      이름
                      <input
                        required
                        value={person.name}
                        onChange={(e) =>
                          setPerson({ ...person, name: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      연락처
                      <input
                        required
                        value={person.phone}
                        onChange={(e) =>
                          setPerson({ ...person, phone: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      생년월일
                      <input
                        required
                        type="date"
                        max={seoulToday()}
                        value={person.dob}
                        onChange={(e) =>
                          setPerson({ ...person, dob: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      주소 · 동까지
                      <input
                        required
                        value={person.address}
                        onChange={(e) =>
                          setPerson({ ...person, address: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
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
                        <option value="U">미상</option>
                        <option value="M">남성</option>
                        <option value="F">여성</option>
                      </select>
                    </label>
                  </div>
                )}
                <label className="field">
                  상담 구분
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as typeof category)
                    }
                  >
                    <option>미용</option>
                    <option>보험</option>
                  </select>
                </label>
                <p className="small">
                  저장된 담당자·일정을 상담에 연결합니다. 위에서 변경했다면 먼저
                  저장하세요.
                </p>
                <button className="primary" disabled={busy}>
                  상담으로 연결
                </button>
              </form>
            )}
          </section>
        )}
      </div>
    </>
  );
}
