import { useState } from "react";
import type { Consultation, State, User } from "../core/model";
import { OpinionBody } from "./OpinionBody";
import {
  hasOpinionAnswer,
  opinionReplyKey,
  unreadOpinionReply,
} from "../core/opinions";

export function ConsultationOpinions({
  consultation,
  state,
  user,
  send,
}: {
  consultation: Consultation;
  state: State;
  user: User;
  send: (...args: any[]) => Promise<any>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const opinions = state.opinions.filter(
    (o) => o.consultationId === consultation.id && hasOpinionAnswer(o),
  );
  if (!opinions.length) return null;
  return (
    <section className="consultation-opinions" aria-label="상담 사진 의사 의견">
      <button
        aria-expanded={expanded}
        onClick={async () => {
          setExpanded(!expanded);
          if (expanded) return;
          setError("");
          try {
            for (const o of opinions.filter((o) =>
              unreadOpinionReply(o, user.id, state.consultations),
            ))
              await send(
                "opinion.read",
                { replyKey: opinionReplyKey(o) },
                o.id,
              );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        의사 의견 {opinions.length}건 · {expanded ? "접기" : "펼치기"}
      </button>
      {expanded &&
        opinions.map((o) => (
          <div className="history-opinion" key={o.id}>
            <b>
              {state.users.find((u) => u.id === o.toId)?.name || "담당 의사"}
            </b>
            {o.answeredAt && (
              <small>{new Date(o.answeredAt).toLocaleString("ko-KR")}</small>
            )}
            <p className="small">요청: {o.request}</p>
            <OpinionBody opinion={o} photos={consultation.photos} />
          </div>
        ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
