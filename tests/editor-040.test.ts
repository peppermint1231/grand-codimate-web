import { it, expect } from "vitest";
import {
  annotationBox,
  moveAnnotation,
  resizeAnnotation,
} from "../src/core/annotationText";
import { frameToCrop, photoOutputSize } from "../src/core/photoGeometry";
import { applyCommand } from "../src/core/domain";
import {
  emptyState,
  type Annotation,
  type Photo,
  type User,
} from "../src/core/model";
const a: Annotation = {
  id: "a",
  tool: "pen",
  authorId: "admin",
  color: "#123456",
  width: 3,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.2, y: 0.3 },
    { x: 0.4, y: 0.3 },
  ],
};
it("moves every point of a stroke and clamps the whole shape to the image", () => {
  const moved = moveAnnotation(a, 0.1, 0.2, 1000, 750);
  expect(moved.points).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    expect(moved.points[i].x).toBeCloseTo(a.points[i].x + 0.1);
    expect(moved.points[i].y).toBeCloseTo(a.points[i].y + 0.2);
  }
  const edge = moveAnnotation(a, 2, -2, 1000, 750);
  expect(Math.max(...edge.points.map((p) => p.x))).toBeCloseTo(1);
  expect(Math.min(...edge.points.map((p) => p.y))).toBeCloseTo(0);
});
it("resizes shapes without collapsing their vertices into text boxes", () => {
  const resized = resizeAnnotation(a, 2, 1000, 750);
  expect(resized.points).toHaveLength(3);
  expect(resized.box).toBeUndefined();
  expect(annotationBox(resized, 1000, 750).width).toBeCloseTo(0.6);
  expect(resized.points[0]).toEqual(a.points[0]);
});
it("applies the viewport crop after rotation rather than rotating the frame", () => {
  const p: Photo = {
    id: "p",
    mediaId: "m",
    name: "p",
    rotation: 90,
    selected: true,
    annotations: [],
    viewportCrop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
  };
  const size = photoOutputSize(1000, 600, p);
  expect(size.width).toBeCloseTo(300);
  expect(size.height).toBeCloseTo(600);
  const crop = frameToCrop(
    { x: 300, y: 150, width: 600, height: 500 },
    { x: 100, y: 0, width: 1000, height: 900 },
  );
  expect(crop.x).toBeCloseTo(0.2);
  expect(crop.width).toBeCloseTo(0.6);
  const edge = frameToCrop(
    { x: -50, y: 50, width: 1600, height: 1000 },
    { x: 0, y: 0, width: 1200, height: 900 },
  );
  expect(edge.x + edge.width).toBeLessThanOrEqual(1);
  expect(edge.y + edge.height).toBeLessThanOrEqual(1);
});
const admin: User = {
  id: "admin",
  username: "admin",
  name: "시험",
  role: "admin",
  active: true,
  permissions: {},
};
const cmd = (
  type: string,
  payload: any,
  entityId: string,
  baseRev?: number,
) => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
async function fixture() {
  let s = await applyCommand(
    emptyState(),
    admin,
    cmd(
      "patient.create",
      {
        name: "시험",
        sex: "F",
        dob: "1980-01-01",
        phone: "01000000000",
        address: "시험동",
      },
      "p",
    ),
  );
  return applyCommand(
    s,
    admin,
    cmd("consultation.create", { patientId: "p", category: "미용" }, "c"),
  );
}
const photo: Photo = {
  id: "photo",
  mediaId: "media",
  name: "test",
  selected: true,
  rotation: 32,
  annotations: [a],
  representative: true,
  viewportCrop: { x: 0.1, y: 0.1, width: 0.7, height: 0.8 },
};
const payload = (photos: Photo[]) => ({
  lines: [],
  discount: { kind: "amount", value: 0 },
  vat: "separate",
  memo: "",
  photos,
});
it("round-trips the cover and rotated crop, rejects duplicate covers and invalid frames", async () => {
  const s = await fixture();
  const next = await applyCommand(
    s,
    admin,
    cmd("consultation.save", payload([photo]), "c", 1),
  );
  expect(next.consultations[0].photos[0]).toEqual(photo);
  await expect(
    applyCommand(
      s,
      admin,
      cmd(
        "consultation.save",
        payload([photo, { ...photo, id: "second" }]),
        "c",
        1,
      ),
    ),
  ).rejects.toThrow("대표사진");
  await expect(
    applyCommand(
      s,
      admin,
      cmd(
        "consultation.save",
        payload([
          { ...photo, viewportCrop: { x: 0.9, y: 0, width: 0.5, height: 0.5 } },
        ]),
        "c",
        1,
      ),
    ),
  ).rejects.toThrow();
});
it("removes a photo from a draft only when consultation save is applied", async () => {
  const s = await fixture();
  const withPhoto = await applyCommand(
    s,
    admin,
    cmd("consultation.save", payload([photo]), "c", 1),
  );
  const removed = await applyCommand(
    withPhoto,
    admin,
    cmd("consultation.save", payload([]), "c", 2),
  );
  expect(removed.consultations[0].photos).toHaveLength(0);
  expect(withPhoto.consultations[0].photos).toHaveLength(1);
});
