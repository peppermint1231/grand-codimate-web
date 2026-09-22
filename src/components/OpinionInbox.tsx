import { useEffect, useRef, useState } from "react";
import { ExternalLink, Pencil, MessageSquare } from "lucide-react";
import {
  isAdministrator,
  type State,
  type User,
  type Consultation,
  type Opinion,
  type Photo,
} from "../core/model";
import { PhotoPreview, PhotoEditor } from "./PhotoEditor";
import { PhotoModal } from "./PhotoBoard";
import { useAppBack } from "../lib/navigation";
type Send = (
  type: string,
  payload: Record<string, unknown>,
  entityId?: string,
  baseRev?: number,
) => Promise<boolean>;
const mayLeave = () =>
  window.dispatchEvent(
    new Event("codimate:before-opinion-photo-leave", { cancelable: true }),
  );
export function OpinionInbox({
  state,
  user,
  send,
  onOpen,
}: {
  state: State;
  user: User;
  send: Send;
  onOpen: (c: Consultation) => void;
}) {
  const [active, setActive] = useState<{
    opinion: Opinion;
    consultation: Consultation;
    photo: Photo;
    editing: boolean;
  }>();
  const [saveContainer, setSaveContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const close = () => {
    if (mayLeave()) setActive(undefined);
  };
  useAppBack(!!active, close, 100);
  const canAnnotate = (o: Opinion, c: Consultation) =>
    c.status === "H" &&
    !c.cancelled &&
    ((o.toId === user.id && user.role === "doctor") || isAdministrator(user));
  return (
    <div className="opinion-inbox">
      {!state.opinions.length && <p>의견 요청이 없습니다.</p>}
      {state.opinions
        .slice()
        .reverse()
        .map((o) => {
          const c = state.consultations.find((c) => c.id === o.consultationId);
          return (
            <section
              className="card opinion-card"
              key={o.id}
              aria-label="의견 요청"
            >
              <div className="section-title">
                <h3>{c?.patient.name || "확인할 수 없는 환자"} 님</h3>
                {c && (
                  <button
                    className="opinion-consult-link"
                    onClick={() => {
                      if (mayLeave()) onOpen(c);
                    }}
                  >
                    <ExternalLink size={16} /> 해당 상담 열기
                  </button>
                )}
              </div>
              {c && (
                <p className="opinion-context">
                  {c.category} · {c.createdAt.slice(0, 10)} · 상담자{" "}
                  <b>
                    {state.users.find((u) => u.id === c.ownerId)?.name ||
                      "미확인"}
                  </b>
                </p>
              )}
              <p className="opinion-context">
                요청자{" "}
                {state.users.find((u) => u.id === o.fromId)?.name || "미확인"} →{" "}
                {state.users.find((u) => u.id === o.toId)?.name || "담당 의사"}
              </p>
              <p className="opinion-request-text">{o.request}</p>
              {c && (
                <div className="opinion-photos" aria-label="요청 상담 사진">
                  {!c.photos.length && (
                    <p className="small">이 상담에 등록된 사진이 없습니다.</p>
                  )}
                  {c.photos.map((photo) => (
                    <div className="opinion-photo" key={photo.id}>
                      <button
                        className="opinion-thumbnail"
                        aria-label={`${photo.name} 크게 보기`}
                        onClick={() =>
                          setActive({
                            opinion: o,
                            consultation: c,
                            photo: structuredClone(photo),
                            editing: false,
                          })
                        }
                      >
                        <PhotoPreview photo={photo} />
                      </button>
                      <small>{photo.name}</small>
                      {canAnnotate(o, c) && (
                        <button
                          aria-label={`${photo.name} 주석 편집`}
                          onClick={() =>
                            setActive({
                              opinion: o,
                              consultation: c,
                              photo: structuredClone(photo),
                              editing: true,
                            })
                          }
                        >
                          <Pencil size={14} /> 편집
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <OpinionAnswer
                key={o.id}
                opinion={o}
                send={send}
                editable={
                  !!c &&
                  c.status === "H" &&
                  !c.cancelled &&
                  (o.toId === user.id || isAdministrator(user))
                }
              />
            </section>
          );
        })}
      {active && (
        <PhotoModal
          label={
            active.editing ? "의견 요청 사진 편집" : "의견 요청 사진 크게 보기"
          }
          className={
            active.editing
              ? "photo-editor-fullscreen opinion-photo-modal"
              : "photo-lightbox opinion-photo-modal"
          }
          close={close}
        >
          <header className="fullscreen-editor-header">
            <strong>
              {active.consultation.patient.name} 님 · {active.photo.name}
            </strong>
            <div className="fullscreen-editor-actions">
              <div ref={setSaveContainer} />
              {!active.editing &&
                canAnnotate(active.opinion, active.consultation) && (
                  <button
                    onClick={() => setActive({ ...active, editing: true })}
                  >
                    <Pencil size={16} /> 주석 편집
                  </button>
                )}
              <button onClick={close}>
                {active.editing ? "편집기 닫기" : "크게 보기 닫기"}
              </button>
            </div>
          </header>
          {active.editing ? (
            <div className="opinion-editor-body">
              <p>
                내 주석을 해당 상담에 저장합니다. 상담자의 사진과 다른 작성자의
                주석은 유지됩니다.
              </p>
              <PhotoEditor
                key={`${active.opinion.id}:${active.photo.id}`}
                photo={active.photo}
                userId={user.id}
                annotationsOnly
                directSave
                leaveEvent="codimate:before-opinion-photo-leave"
                saveContainer={saveContainer}
                onChange={async (photo) => {
                  const ok = await send(
                    "opinion.annotate",
                    {
                      photoId: photo.id,
                      annotations: photo.annotations,
                      consultationRev: active.consultation.rev,
                    },
                    active.opinion.id,
                    active.opinion.rev,
                  );
                  if (ok)
                    setActive(
                      (current) =>
                        current && {
                          ...current,
                          photo,
                          consultation: {
                            ...current.consultation,
                            rev: current.consultation.rev + 1,
                          },
                          opinion: {
                            ...current.opinion,
                            rev: current.opinion.rev + 1,
                          },
                        },
                    );
                  return ok;
                }}
              />
            </div>
          ) : (
            <div className="opinion-large-photo">
              <PhotoPreview photo={active.photo} />
            </div>
          )}
        </PhotoModal>
      )}
    </div>
  );
}
function OpinionAnswer({
  opinion: o,
  editable,
  send,
}: {
  opinion: Opinion;
  editable: boolean;
  send: Send;
}) {
  const [answer, setAnswer] = useState(o.answer),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const previous = useRef(o.answer);
  useEffect(() => {
    const last = previous.current;
    setAnswer((current) => (current === last ? o.answer : current));
    previous.current = o.answer;
  }, [o.answer]);
  return (
    <div className="opinion-answer">
      <h4>
        <MessageSquare size={16} /> 의사 의견
      </h4>
      {editable ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              const saved = await send(
                "opinion.answer",
                { answer },
                o.id,
                o.rev,
              );
              setMessage(
                saved ? "답변을 저장했습니다." : "기기에 저장됨 · 동기화 대기",
              );
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <textarea
            aria-label="의견 작성"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            required
            maxLength={10000}
            placeholder="의견을 작성하세요"
          />
          <button className="primary" disabled={busy || !answer.trim()}>
            {busy ? "답변 저장 중…" : "답변 저장"}
          </button>
        </form>
      ) : (
        <p className="opinion-answer-text">
          {o.answer || "담당 의사의 답변을 기다리고 있습니다."}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
