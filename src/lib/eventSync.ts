import { selectWebsiteOffers } from "../core/eventCatalog";
import type { EventPage, EventItem, WebsiteEvent } from "../core/eventCatalog";
const checkpointLifetime = 10 * 60_000;
export const createWebsiteScanCheckpoint = () => ({
  startedAt: Date.now(),
  pages: new Map<string, WebsiteEvent>(),
});
export type WebsiteScanCheckpoint = ReturnType<
  typeof createWebsiteScanCheckpoint
>;
const itemKey = (item: EventItem) =>
  JSON.stringify([item.id, item.categoryId, item.categoryName, item.name]);

export async function scanWebsiteCatalog(
  sourceLoad: (query: string) => Promise<EventPage | WebsiteEvent>,
  progress: (message: string) => void,
  signal?: AbortSignal,
  checkpoint = createWebsiteScanCheckpoint(),
): Promise<WebsiteEvent[]> {
  const check = () => {
    if (signal?.aborted) throw new DOMException("갱신 취소", "AbortError");
  };
  const load = (query: string) =>
    retryWebsitePage(() => sourceLoad(query), progress, signal);
  check();
  if (Date.now() - checkpoint.startedAt > checkpointLifetime) {
    checkpoint.pages.clear();
    checkpoint.startedAt = Date.now();
  }
  progress("홈페이지 분류 확인 중…");
  const root = (await load("")) as EventPage;
  if (!root.categories.length || root.categories.length > 80)
    throw new Error("홈페이지 분류를 확인할 수 없습니다.");
  const items = new Map<string, EventItem>();
  let pagesRead = 0;
  for (const category of root.categories) {
    const pending = [1],
      visited = new Set<number>();
    while (pending.length) {
      check();
      const page = pending.shift()!;
      if (visited.has(page)) continue;
      visited.add(page);
      if (++pagesRead > 160)
        throw new Error(
          "홈페이지 페이지 수가 제한을 넘었습니다. 기존 단가표를 유지합니다.",
        );
      progress(`${category.name} 목록 확인 중 (${pagesRead}페이지)`);
      const result = (await load(
        `?category=${category.id}&page=${page}`,
      )) as EventPage;
      for (const item of result.items)
        if (!items.has(item.id)) items.set(item.id, item);
      if (items.size > 400)
        throw new Error(
          "배너 수가 제한을 넘었습니다. 기존 단가표를 유지합니다.",
        );
      for (const next of result.pages)
        if (!visited.has(next)) pending.push(next);
    }
  }
  if (!items.size)
    throw new Error("홈페이지 상품이 비어 있습니다. 기존 단가표를 유지합니다.");
  const ordered = [...items.values()],
    events = new Array<WebsiteEvent>(ordered.length);
  // Lists are always re-read on resume. Removed or moved banners cannot linger.
  const keys = new Set(ordered.map(itemKey));
  for (const key of checkpoint.pages.keys())
    if (!keys.has(key)) checkpoint.pages.delete(key);
  const failures: string[] = [];
  let next = 0,
    completed = 0,
    stopped = false;
  const worker = async () => {
    while (!stopped && next < ordered.length) {
      check();
      const index = next++,
        item = ordered[index],
        key = itemKey(item);
      try {
        const event =
          checkpoint.pages.get(key) ||
          ((await load(
            `?category=${item.categoryId}&item=${item.id}`,
          )) as WebsiteEvent);
        if (
          event.id !== item.id ||
          event.categoryId !== item.categoryId ||
          !Array.isArray(event.offers) ||
          !event.offers.length
        )
          throw new Error("홈페이지 상세를 확인할 수 없습니다.");
        check();
        checkpoint.pages.set(key, structuredClone(event));
        events[index] = structuredClone(event);
        completed++;
      } catch (error) {
        check();
        if ([401, 403].includes((error as { status?: number }).status || 0))
          throw error;
        failures.push(
          `${item.categoryName} · ${item.name}: ${(error as Error).message}`,
        );
      }
      progress(
        `가격·기간·포스터 주소 확인 중 (${completed}/${ordered.length})${failures.length ? ` · 재확인 필요 ${failures.length}개` : ""}`,
      );
    }
  };
  const run = () =>
    worker().catch((error) => {
      stopped = true;
      throw error;
    });
  const results = await Promise.allSettled([run(), run()]);
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (failed) throw failed.reason;
  check();
  if (failures.length)
    throw new Error(
      `${failures.length}개 배너를 확인하지 못했습니다. 완료한 ${completed}개는 잠시 보관했습니다.\n${failures.slice(0, 5).join("\n")}`,
    );
  return events;
}
export async function scanWebsiteEvents(
  load: (query: string) => Promise<EventPage | WebsiteEvent>,
  progress: (message: string) => void,
  signal?: AbortSignal,
) {
  return selectWebsiteOffers(
    await scanWebsiteCatalog(load, progress, signal),
    "이벤트",
  );
}

/** Retry transient transport failures only; never apply a partial scan. */
export async function retryWebsitePage<T>(
  load: () => Promise<T>,
  progress: (message: string) => void,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await load();
    } catch (error) {
      signal?.throwIfAborted();
      const e = error as Error & { status?: number };
      const transient =
        [408, 429].includes(e.status || 0) ||
        (e.status !== undefined && e.status >= 500 && e.status <= 599) ||
        e instanceof TypeError ||
        e.name === "TimeoutError" ||
        /timeout/i.test(e.message);
      if (!transient || attempt >= 2) throw error;
      progress(`홈페이지 응답 지연 · 해당 페이지 자동 재시도 ${attempt + 1}/2`);
      signal?.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal?.reason);
        };
        const timer = setTimeout(
          () => {
            signal?.removeEventListener("abort", abort);
            resolve();
          },
          (attempt + 1) * 1000,
        );
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
  }
}
