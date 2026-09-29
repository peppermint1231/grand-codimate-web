import { useState } from "react";
import type { Consultation, Opinion, User } from "../core/model";
import { OpinionAnswer } from "./OpinionInbox";
export function DirectOpinion({
  consultation,
  user,
  send,
  onSaved,
}: {
  consultation: Consultation;
  user: User;
  send: (...args: any[]) => Promise<any>;
  onSaved: () => void;
}) {
  const [opinion] = useState<Opinion>(() => ({
    id: crypto.randomUUID(),
    rev: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    direct: true,
    consultationId: consultation.id,
    fromId: consultation.ownerId,
    toId: user.id,
    request: "",
    answer: "",
  }));
  return (
    <>
      <p className="small">
        요청 없이 의견을 남깁니다. 상담 사진 아래에서 함께 확인할 수 있으며
        상담자에게 새 의견으로 표시됩니다.
      </p>
      <OpinionAnswer
        opinion={opinion}
        photos={consultation.photos}
        createFor={consultation}
        editable
        send={send}
        onSaved={onSaved}
      />
    </>
  );
}
