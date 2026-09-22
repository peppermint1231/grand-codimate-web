import type { Consultation, Opinion } from "./model";

// Reply identity is independent of photo edits and read receipts.
export const opinionReplyKey = (o: Opinion) =>
  String(o.answerRevision ?? o.answeredAt ?? "legacy");

export function receivesOpinionReply(
  o: Opinion,
  userId: string,
  consultations: Consultation[],
) {
  return (
    o.fromId === userId ||
    consultations.some((c) => c.id === o.consultationId && c.ownerId === userId)
  );
}

export function unreadOpinionReply(
  o: Opinion,
  userId: string,
  consultations: Consultation[],
) {
  return (
    !!o.answer.trim() &&
    receivesOpinionReply(o, userId, consultations) &&
    o.answerReadBy?.[userId] !== opinionReplyKey(o)
  );
}
