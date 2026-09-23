import { useRef, useState } from "react";
import type { State } from "../core/model";
import { catalogTime } from "../core/catalogStatus";
export function PatientTimeline({
  state,
  patientId,
}: {
  state: State;
  patientId: string;
}) {
  const [page, setPage] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const events = state.events
    .filter((e) => e.patientId === patientId)
    .slice()
    .reverse();
  const pages = Math.max(1, Math.ceil(events.length / 20)),
    current = Math.min(page, pages - 1);
  const go = (next: number) => {
    setPage(next);
    list.current?.scrollTo({ top: 0 });
  };
  return (
    <section className="card patient-timeline" aria-label="활동 타임라인">
      <h3>
        활동 타임라인 <small>{events.length}건</small>
      </h3>
      <div
        className="timeline-list"
        ref={list}
        tabIndex={0}
        role="region"
        aria-label="활동 기록 목록"
      >
        {events.slice(current * 20, (current + 1) * 20).map((e) => (
          <div className="timeline" key={e.id}>
            <span className="dot" />
            <div>
              <b>{e.text}</b>
              <small>
                {catalogTime(e.createdAt)} ·{" "}
                {state.users.find((u) => u.id === e.actorId)?.name}
              </small>
            </div>
          </div>
        ))}
        {!events.length && <p>아직 활동 기록이 없습니다.</p>}
      </div>
      <nav className="timeline-pages" aria-label="활동 타임라인 페이지">
        <button
          type="button"
          disabled={!current}
          onClick={() => go(current - 1)}
        >
          이전
        </button>
        <span role="status">
          {current + 1} / {pages} 페이지 · 20개씩
        </span>
        <button
          type="button"
          disabled={current >= pages - 1}
          onClick={() => go(current + 1)}
        >
          다음
        </button>
      </nav>
    </section>
  );
}
