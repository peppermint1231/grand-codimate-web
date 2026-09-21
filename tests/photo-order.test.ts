import { expect, it } from "vitest";
import { applyPhotoOrder, movePhotoIds } from "../src/core/photoOrder";
import type { Photo } from "../src/core/model";

const photos = ["a", "hidden", "b", "c"].map((id) => ({
  id,
  mediaId: id,
  name: id,
  rotation: 0,
  annotations: [],
  selected: id !== "hidden",
})) satisfies Photo[];

it("reorders selected photos while retaining hidden slots, identity and annotations", () => {
  const next = applyPhotoOrder(photos, ["c", "a", "b"]);
  expect(next.map((p) => p.id)).toEqual(["c", "hidden", "a", "b"]);
  expect(next[0]).toBe(photos[3]);
  expect(next[1]).toBe(photos[1]);
  expect(photos.map((p) => p.id)).toEqual(["a", "hidden", "b", "c"]);
});

it("ignores invalid orders rather than losing or duplicating photos", () => {
  expect(applyPhotoOrder(photos, ["a", "a"])).toBe(photos);
  expect(applyPhotoOrder(photos, ["missing", "b"])).toBe(photos);
  expect(applyPhotoOrder(photos, [])).toEqual(photos);
});

it("repeated hover over a fixed slot has the same preview until drop", () => {
  const original = ["a", "b", "c"];
  for (let i = 0; i < 20; i++)
    expect(movePhotoIds(original, "a", "c")).toEqual(["b", "c", "a"]);
  expect(original).toEqual(["a", "b", "c"]);
  expect(movePhotoIds(original, "missing", "c")).toEqual(original);
});
