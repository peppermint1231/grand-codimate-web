import { DiscoverySettings } from "./DiscoverySettings";
import { usePatientLookup } from "../hooks/usePatientLookup";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { withProgress, currentProgress } from "../lib/operationProgress";
import {
  calendarDays,
  calendarSwipe,
  shiftCalendar,
  type CalendarView,
} from "../core/consultationCalendar";
import { allowed, age, catalogBookLabel, type State } from "../core/model";
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
  rev?: number;
  phone?: string;
  receivedAt?: string;
  canReassign?: boolean;
  patientId: string;
  name: string;
  date: string;
  time: string;
  coordinatorId: string;
  completed: boolean;
  confirmed: boolean;
  cancelled: boolean;
};
type RequestListRow = {
  id: string;
  name: string;
  phone: string;
  receivedAt: string;
  date: string;
  time: string;
  owner: string;
  status: string;
  rev: number;
  canReassign: boolean;
  inquiry?: Inquiry;
  appointment?: Appointment;
};
const requestFilters = ["전체", "배정", "미배정", "완료", "취소"] as const;
type RequestFilter = (typeof requestFilters)[number];
const requestStatus = (row: RequestListRow): Exclude<RequestFilter, "전체"> =>
  row.inquiry?.status === "cancelled" || row.appointment?.cancelled
    ? "취소"
    : row.appointment?.completed
      ? "완료"
      : row.owner
        ? "배정"
        : "미배정";
const blankPerson = () => ({
  name: "",
  phone: "",
  sex: "U" as "M" | "F" | "U",
  dob: "",
  address: "",
});
export function DiscoveryDesk({
  state,
  user,
  send,
  publicUrl,
  work,
  openConsult,
}: {
  state: State;
  user: import("../core/model").User;
  send: (
    type: string,
    payload: Record<string, unknown>,
    id?: string,
    rev?: number,
  ) => Promise<unknown>;
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
  const [calendarView, setCalendarView] = useState<CalendarView>("week"),
    [calendarDate, setCalendarDate] = useState(seoulToday()),
    [slideDirection, setSlideDirection] = useState(0);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const ignoreCalendarClickUntil = useRef(0);
  const [date, setDate] = useState(""),
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
  const [listPage, setListPage] = useState(0);
  const [listFilter, setListFilter] = useState<RequestFilter>("전체");
  const [assigning, setAssigning] = useState<RequestListRow>(),
    [assignOwner, setAssignOwner] = useState("");
  const [manageError, setManageError] = useState("");
  const assignDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (assigning && !assignDialog.current?.open)
      assignDialog.current?.showModal();
    if (!assigning) assignDialog.current?.close();
  }, [assigning]);
  const panel = useRef<HTMLElement>(null);
  const running = useRef(false);
  const [connecting, setConnecting] = useState(false),
    [connectError, setConnectError] = useState("");
  const refresh = async () => {
    const d = await api("/inquiries");
    setInquiries(d.inquiries);
    setClosures(d.closures || { rev: 0, dates: [] });
    setAppointments(d.appointments || []);
  };
  const run = async (fn: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
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
      const phone = selected.person.phone.replace(/\D/g, "");
      const name = selected.person.name.trim();
      const found = await api<{ rows: IntakeSearchRow[] }>(
        "/intake/search?" +
          new URLSearchParams({
            q: phone.length >= 4 ? phone : name,
            ...(name.length >= 2 ? { name } : {}),
            page: "0",
          }),
        {},
        { operation: null },
      );
      if (live) {
        setIntakes([...new Map(found.rows.map((x) => [x.id, x])).values()]);
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
    setConnectError("");
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
  const moveCalendar = (delta: number) => {
    setSlideDirection(delta);
    setCalendarDate((day) => shiftCalendar(day, calendarView, delta));
  };
  const days = calendarDays(calendarDate, calendarView);
  const calendarUnit = { month: "월", week: "주", day: "일" }[calendarView];
  const calendarHeading =
    calendarView === "month"
      ? calendarDate.slice(0, 7).replace("-", "년 ") + "월"
      : calendarView === "week"
        ? `${days[0]} ~ ${days.at(-1)}`
        : calendarDate;
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
  const requestRows: RequestListRow[] = [
    ...inquiries.map((i) => ({
      id: i.id,
      name: i.person.name,
      phone: i.person.phone,
      receivedAt: i.createdAt,
      date: i.schedule?.date || i.requestedDate || "",
      time: i.schedule?.time || i.requestedTime || "",
      owner: i.schedule?.coordinatorId || "",
      status:
        i.status === "cancelled"
          ? "취소"
          : i.schedule?.confirmed
            ? "확정"
            : i.schedule?.coordinatorId
              ? "배정"
              : "미배정",
      rev: i.rev || 0,
      canReassign: true,
      inquiry: i,
    })),
    ...appointments.map((a) => ({
      id: a.id,
      name: a.name,
      phone: a.phone || "",
      receivedAt: a.receivedAt || "",
      date: a.date,
      time: a.time,
      owner: a.coordinatorId,
      status: a.cancelled
        ? "취소"
        : a.completed
          ? "상담완료"
          : a.confirmed
            ? "확정 · 상담 연결"
            : "상담 연결",
      rev: a.rev || 0,
      canReassign: a.canReassign === true,
      appointment: a,
    })),
  ].sort(
    (a, b) =>
      b.receivedAt.localeCompare(a.receivedAt) || a.id.localeCompare(b.id),
  );
  const filteredRows = requestRows.filter(
    (row) => listFilter === "전체" || requestStatus(row) === listFilter,
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / 10));
  const visiblePage = Math.min(listPage, pageCount - 1);
  const manage = async (
    row: RequestListRow,
    action: "assign" | "delete",
    ownerId?: string,
  ) => {
    setManageError("");
    await run(async () => {
      try {
        await withProgress(
          action === "delete"
            ? "요청을 삭제하고 있습니다"
            : "상담자를 변경하고 있습니다",
          async () => {
            await api("/inquiries/manage", {
              method: "POST",
              body: JSON.stringify({
                id: row.id,
                consultationId: row.appointment?.id,
                rev: row.rev,
                action,
                ownerId,
              }),
            });
            if (selected?.id === row.inquiry?.id) setSelected(undefined);
            setAssigning(undefined);
            await refresh();
          },
        );
      } catch (e) {
        setManageError((e as Error).message);
      }
    });
  };
  const remotePatients = usePatientLookup(
    selected?.person.phone || selected?.person.name || "",
  );
  const availablePatients = [
    ...new Map(
      [...state.patients, ...remotePatients].map((p) => [p.id, p]),
    ).values(),
  ];
  const candidates = selected
    ? patientCandidates(availablePatients, selected.person)
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
      {allowed(user, "catalog.edit") && (
        <DiscoverySettings
          state={state}
          save={(settings, rev) =>
            send("discovery.settings", { settings }, state.policies[0]?.id, rev)
          }
        />
      )}
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
          <div
            className="inquiry-calendar-views"
            role="group"
            aria-label="캘린더 보기"
          >
            {(
              [
                ["month", "월별"],
                ["week", "주별"],
                ["day", "일별"],
              ] as const
            ).map(([view, label]) => (
              <button
                key={view}
                aria-pressed={calendarView === view}
                onClick={() => {
                  setSlideDirection(0);
                  setCalendarView(view);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="button-row inquiry-calendar-navigation">
            <button
              aria-label={`이전 ${calendarUnit}`}
              onClick={() => moveCalendar(-1)}
            >
              ‹
            </button>
            <input
              aria-label={
                calendarView === "month" ? "캘린더 월" : "캘린더 날짜"
              }
              type={calendarView === "month" ? "month" : "date"}
              value={
                calendarView === "month"
                  ? calendarDate.slice(0, 7)
                  : calendarDate
              }
              onChange={(e) => {
                if (e.target.value) {
                  setSlideDirection(0);
                  setCalendarDate(
                    calendarView === "month"
                      ? e.target.value + "-01"
                      : e.target.value,
                  );
                }
              }}
            />
            <button
              aria-label={`다음 ${calendarUnit}`}
              onClick={() => moveCalendar(1)}
            >
              ›
            </button>
            <button
              onClick={() => {
                setSlideDirection(0);
                setCalendarDate(seoulToday());
              }}
            >
              오늘
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
        <p className="inquiry-calendar-heading" aria-live="polite">
          {calendarHeading}
        </p>
        <div
          className="inquiry-calendar-scroll"
          onPointerDown={(e) => {
            if (e.pointerType !== "touch") return;
            if (!e.isPrimary) {
              swipe.current = null;
              return;
            }
            swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            const s = swipe.current;
            if (
              s?.id === e.pointerId &&
              calendarSwipe(e.clientX - s.x, e.clientY - s.y)
            )
              e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            const s = swipe.current;
            swipe.current = null;
            if (!s || s.id !== e.pointerId) return;
            const direction = calendarSwipe(e.clientX - s.x, e.clientY - s.y);
            if (direction) {
              ignoreCalendarClickUntil.current = Date.now() + 350;
              moveCalendar(direction);
            }
          }}
          onPointerCancel={() => {
            swipe.current = null;
          }}
          onClickCapture={(e) => {
            if (Date.now() < ignoreCalendarClickUntil.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div
            key={calendarView + calendarDate}
            className={`inquiry-month-grid calendar-${calendarView} ${slideDirection > 0 ? "calendar-next" : slideDirection < 0 ? "calendar-prev" : ""}`}
          >
            {calendarView === "month" &&
              ["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <b className="inquiry-weekday" key={d}>
                  {d}
                </b>
              ))}
            {days.map((day, i) => {
              if (!day)
                return <div className="inquiry-day empty" key={"empty" + i} />;
              return (
                <div
                  key={day}
                  className={
                    "inquiry-day" + (day === seoulToday() ? " today" : "")
                  }
                >
                  <b>
                    {calendarView === "month"
                      ? Number(day.slice(-2))
                      : `${Number(day.slice(5, 7))}/${Number(day.slice(-2))} (${["일", "월", "화", "수", "목", "금", "토"][new Date(day + "T12:00:00Z").getUTCDay()]})`}
                  </b>
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
                          <span className="calendar-event-time">{r.time}</span>{" "}
                          <span className="calendar-event-name">{r.name}</span>
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
          <h3>상담 요청 {requestRows.length}건</h3>
          <p className="small">
            미배정·배정·상담 연결·완료 요청을 함께 표시합니다.
          </p>
          <div
            className="inquiry-filters"
            role="group"
            aria-label="상담 요청 상태 필터"
          >
            {requestFilters.map((filter) => (
              <button
                type="button"
                key={filter}
                aria-pressed={listFilter === filter}
                onClick={() => {
                  setListFilter(filter);
                  setListPage(0);
                }}
              >
                {filter}{" "}
                <span>
                  {filter === "전체"
                    ? requestRows.length
                    : requestRows.filter((row) => requestStatus(row) === filter)
                        .length}
                </span>
              </button>
            ))}
          </div>
          {manageError && !assigning && (
            <p className="error" role="alert">
              {manageError}
            </p>
          )}
          <div className="inquiry-list" aria-label="상담 요청 목록">
            {filteredRows
              .slice(visiblePage * 10, visiblePage * 10 + 10)
              .map((row) => (
                <article className="inquiry-request-row" key={row.id}>
                  <button
                    className="inquiry-request-open"
                    disabled={busy}
                    onClick={() =>
                      row.appointment
                        ? work(() =>
                            openConsult(
                              row.appointment!.patientId,
                              row.appointment!.id,
                            ),
                          )
                        : choose(row.inquiry!)
                    }
                  >
                    <span>
                      <b>{row.name}</b>
                      <small>{row.phone}</small>
                      <small>
                        {row.date ? `${row.date} ${row.time}` : "일정 미정"}
                      </small>
                    </span>
                    <span>
                      <b
                        className="inquiry-owner-tag"
                        style={{
                          background: row.owner
                            ? coordinatorColor(
                                row.owner,
                                !!row.appointment?.completed,
                                colorRoster,
                              )
                            : "#475569",
                        }}
                      >
                        {row.owner ? staffName(row.owner) : "미배정"}
                      </b>
                      <small>{row.status}</small>
                    </span>
                  </button>
                  <div className="inquiry-request-actions">
                    <button
                      type="button"
                      disabled={busy || !row.canReassign}
                      title={
                        row.canReassign
                          ? "상담자 변경"
                          : "연결된 상담은 담당자 본인 또는 관리자만 변경할 수 있습니다"
                      }
                      onClick={() => {
                        setAssignOwner(row.owner);
                        setManageError("");
                        setAssigning(row);
                      }}
                    >
                      상담자 변경
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="danger"
                      onClick={() => {
                        if (
                          confirm(
                            row.appointment
                              ? `${row.name} 님의 요청을 목록·캘린더에서 삭제할까요? 환자·상담 기록은 유지됩니다.`
                              : `${row.name} 님의 상담 요청을 삭제할까요? 삭제한 요청은 복구할 수 없습니다.`,
                          )
                        )
                          void manage(row, "delete");
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </article>
              ))}
            {!filteredRows.length && (
              <p>
                {listFilter === "전체"
                  ? "상담 요청이 없습니다."
                  : `${listFilter} 요청이 없습니다.`}
              </p>
            )}
          </div>
          <nav
            className="button-row inquiry-pagination"
            aria-label="상담 요청 페이지"
          >
            <button
              disabled={visiblePage === 0 || busy}
              onClick={() => setListPage(visiblePage - 1)}
            >
              이전
            </button>
            <span aria-live="polite">
              {visiblePage + 1} / {pageCount} 페이지 · 10개씩
            </span>
            <button
              disabled={visiblePage + 1 >= pageCount || busy}
              onClick={() => setListPage(visiblePage + 1)}
            >
              다음
            </button>
          </nav>
          <dialog
            ref={assignDialog}
            className="inquiry-assignment-dialog"
            aria-label="상담자 변경"
            onCancel={(e) => {
              if (busy) e.preventDefault();
              else setAssigning(undefined);
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (assigning) void manage(assigning, "assign", assignOwner);
              }}
            >
              <h3>{assigning?.name} 님의 상담자 변경</h3>
              <label className="field">
                상담자
                <select
                  aria-label="변경할 상담자"
                  required
                  value={assignOwner}
                  onChange={(e) => setAssignOwner(e.target.value)}
                >
                  <option value="">직원 선택</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              {manageError && (
                <p className="error" role="alert">
                  {manageError}
                </p>
              )}
              <div className="button-row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAssigning(undefined)}
                >
                  취소
                </button>
                <button
                  className="primary"
                  disabled={
                    busy || !assignOwner || assignOwner === assigning?.owner
                  }
                >
                  {busy ? "변경 중…" : "상담자 변경 저장"}
                </button>
              </div>
            </form>
          </dialog>
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
                onInvalidCapture={(e) => {
                  const input = e.target as HTMLInputElement;
                  setConnectError(
                    `${input.closest("label")?.textContent?.trim() || "입력 항목"}을 확인해주세요. 신규 환자는 이름·연락처·생년월일·주소가 필요합니다.`,
                  );
                }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (running.current) return;
                  setConnectError("");
                  setConnecting(true);
                  void run(async () => {
                    try {
                      await withProgress(
                        "상담을 연결하고 있습니다",
                        async () => {
                          currentProgress()?.update({
                            title: "환자·상담 기록 저장 중입니다",
                            detail:
                              "접수 내용을 상담으로 연결하고 있습니다. 중복으로 생성되지 않도록 확인합니다.",
                          });
                          const d = await api("/inquiries/convert", {
                            method: "POST",
                            body: JSON.stringify({
                              id: selected.id,
                              patientId: patientId || undefined,
                              person,
                              category,
                            }),
                          });
                          currentProgress()?.update({
                            title: "상담 화면을 여는 중입니다",
                            detail: "최신 환자·상담 자료를 불러오고 있습니다.",
                          });
                          await openConsult(d.patientId, d.consultationId);
                        },
                      );
                    } catch (e) {
                      setConnectError(
                        (e as Error).message ||
                          "상담을 연결하지 못했습니다. 다시 시도해주세요.",
                      );
                    } finally {
                      setConnecting(false);
                    }
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
                    {availablePatients
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
                      나이 (생년월일 기준)
                      <input
                        readOnly
                        value={
                          person.dob
                            ? `${age(person.dob)}세`
                            : "생년월일을 입력해주세요"
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
                  이름·연락처·생년월일·주소 등 등록 정보만 불러옵니다. 저장된
                  담당자·일정을 상담에 연결합니다. 위에서 변경했다면 먼저
                  저장하세요.
                </p>
                {connectError && (
                  <p className="error" role="alert">
                    {connectError}
                  </p>
                )}
                <button
                  type="submit"
                  className="primary"
                  disabled={busy}
                  aria-busy={connecting}
                >
                  {connecting ? "상담 연결 중…" : "상담으로 연결"}
                </button>
              </form>
            )}
          </section>
        )}
      </div>
    </>
  );
}
