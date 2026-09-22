import type { Consultation, Opinion, Photo } from "./model";

export const hasOpinionAnswer = (o: Opinion) =>
  !!o.answer.trim() || !!o.answerPhotoComments?.some((c) => c.text.trim());

export function opinionPhotoLabel(photos: Photo[], photoId: string) {
  const photo = photos.find((p) => p.id === photoId);
  if (!photo) return "삭제된 사진";
  if (!photo.selected) return "비교 제외 사진";
  return `${photos.filter((p) => p.selected).findIndex((p) => p.id === photoId) + 1}번 사진`;
}

export function opinionAnswerText(o: Opinion, photos: Photo[]) {
  return [
    o.answer,
    ...(o.answerPhotoComments || []).map(
      (c) =>
        `${opinionPhotoLabel(photos, c.photoId)} · ${photos.find((p) => p.id === c.photoId)?.name || c.photoName}\n${c.text}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

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
    hasOpinionAnswer(o) &&
    receivesOpinionReply(o, userId, consultations) &&
    o.answerReadBy?.[userId] !== opinionReplyKey(o)
  );
}
