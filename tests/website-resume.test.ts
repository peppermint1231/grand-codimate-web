import { expect, it, vi, afterEach } from "vitest";
import {
  createWebsiteScanCheckpoint,
  scanWebsiteCatalog,
} from "../src/lib/eventSync";
import { parseWebsiteEvent } from "../server/eventCatalog";
import { eventDetail } from "./fixtures/websiteEvents";
afterEach(() => vi.useRealTimers());
const detail = (id: string) => ({
  ...parseWebsiteEvent(eventDetail(), "101", "20"),
  id,
});
const listing = (ids = ["101", "102", "103"]) => ({
  categories: [{ id: "20", name: "시험 이벤트" }],
  pages: [],
  items: ids.map((id) => ({
    id,
    categoryId: "20",
    categoryName: "시험 이벤트",
    name: "배너" + id,
  })),
});
it("retains every successful detail after one fails; resume rechecks lists and requests only the missing detail", async () => {
  const checkpoint = createWebsiteScanCheckpoint();
  let fail = true;
  const loader = vi.fn(async (q: string) => {
    const id = new URLSearchParams(q).get("item");
    if (!id) return listing();
    if (fail && id === "102")
      throw Object.assign(new Error("temporary upstream error"), {
        status: 422,
      });
    return detail(id);
  });
  await expect(
    scanWebsiteCatalog(loader, () => {}, undefined, checkpoint),
  ).rejects.toThrow("1개 배너");
  expect(checkpoint.pages.size).toBe(2);
  loader.mockClear();
  fail = false;
  const result = await scanWebsiteCatalog(
    loader,
    () => {},
    undefined,
    checkpoint,
  );
  expect(result.map((p) => p.id)).toEqual(["101", "102", "103"]);
  expect(loader.mock.calls.map((c) => c[0])).toEqual([
    "",
    "?category=20&page=1",
    "?category=20&item=102",
  ]);
});
it("drops removed cached banners, picks up newly listed banners and invalidates moved/renamed entries", async () => {
  const checkpoint = createWebsiteScanCheckpoint();
  await scanWebsiteCatalog(
    async (q) =>
      new URLSearchParams(q).get("item")
        ? detail(new URLSearchParams(q).get("item")!)
        : listing(),
    () => {},
    undefined,
    checkpoint,
  );
  const loader = vi.fn(async (q: string) => {
    const id = new URLSearchParams(q).get("item");
    if (id) return detail(id);
    const list = listing(["101", "104"]);
    list.items[0].name = "변경된 이름";
    return list;
  });
  const result = await scanWebsiteCatalog(
    loader,
    () => {},
    undefined,
    checkpoint,
  );
  expect(result.map((p) => p.id)).toEqual(["101", "104"]);
  expect(loader.mock.calls.filter((c) => c[0].includes("item="))).toHaveLength(
    2,
  );
  expect(checkpoint.pages.size).toBe(2);
});
it("expires checkpoints and never uses a cache to skip failed list validation", async () => {
  const checkpoint = createWebsiteScanCheckpoint();
  await scanWebsiteCatalog(
    async (q) =>
      new URLSearchParams(q).get("item") ? detail("101") : listing(["101"]),
    () => {},
    undefined,
    checkpoint,
  );
  await expect(
    scanWebsiteCatalog(
      async () => {
        throw Error("list broken");
      },
      () => {},
      undefined,
      checkpoint,
    ),
  ).rejects.toThrow("list broken");
  checkpoint.startedAt -= 10 * 60_000 + 1;
  const load = vi.fn(async (q: string) =>
    q.includes("item=") ? detail("101") : listing(["101"]),
  );
  await scanWebsiteCatalog(load, () => {}, undefined, checkpoint);
  expect(load.mock.calls.some((c) => c[0].includes("item="))).toBe(true);
});
it("stops on authentication failure and never turns it into a partial success", async () => {
  const load = vi.fn(async (q: string) => {
    if (q.includes("item="))
      throw Object.assign(new Error("login required"), { status: 401 });
    return listing();
  });
  await expect(scanWebsiteCatalog(load, () => {})).rejects.toMatchObject({
    status: 401,
  });
});
