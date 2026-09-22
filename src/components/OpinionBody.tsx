import { useState } from "react";
import type { Opinion, Photo } from "../core/model";
import { opinionPhotoLabel } from "../core/opinions";
import { PhotoPreview } from "./PhotoEditor";
import { PhotoModal } from "./PhotoBoard";
import { useAppBack } from "../lib/navigation";

export function OpinionPhotoLink({
  photos,
  photoId,
  photoName,
}: {
  photos: Photo[];
  photoId: string;
  photoName: string;
}) {
  const [large, setLarge] = useState(false);
  const photo = photos.find((p) => p.id === photoId);
  const label = `${opinionPhotoLabel(photos, photoId)} · ${photo?.name || photoName}`;
  useAppBack(large, () => setLarge(false), 110);
  return (
    <>
      {photo ? (
        <button
          type="button"
          className="opinion-photo-reference"
          onClick={() => setLarge(true)}
          aria-label={`${label} 크게 보기`}
        >
          <span className="opinion-reference-thumbnail">
            <PhotoPreview photo={photo} />
          </span>
          <span>{label}</span>
        </button>
      ) : (
        <strong className="opinion-photo-missing">{label}</strong>
      )}
      {large && photo && (
        <PhotoModal
          label={label}
          className="photo-lightbox opinion-photo-modal"
          close={() => setLarge(false)}
        >
          <header className="fullscreen-editor-header">
            <strong>{label}</strong>
            <button onClick={() => setLarge(false)}>크게 보기 닫기</button>
          </header>
          <div className="opinion-large-photo">
            <PhotoPreview photo={photo} />
          </div>
        </PhotoModal>
      )}
    </>
  );
}

export function OpinionBody({
  opinion,
  photos,
}: {
  opinion: Opinion;
  photos: Photo[];
}) {
  return (
    <>
      {opinion.answer && (
        <p className="opinion-answer-text">{opinion.answer}</p>
      )}
      {(opinion.answerPhotoComments || []).map((comment) => (
        <div className="opinion-photo-comment" key={comment.photoId}>
          <OpinionPhotoLink
            photos={photos}
            photoId={comment.photoId}
            photoName={comment.photoName}
          />
          <p className="opinion-answer-text">{comment.text}</p>
        </div>
      ))}
    </>
  );
}
