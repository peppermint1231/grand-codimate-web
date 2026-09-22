import { selectWebsiteOffers } from "../core/eventCatalog";
import type { EventPage, EventItem, WebsiteEvent } from "../core/eventCatalog";
export async function scanWebsiteCatalog(
  load: (query: string) => Promise<EventPage | WebsiteEvent>,
  progress: (message: string) => void,
  signal?: AbortSignal,
): Promise<WebsiteEvent[]> {
  const check = () => {
    if (signal?.aborted) throw new DOMException("갱신 취소", "AbortError");
  };
  check();
  progress("이벤트 분류 확인 중…");
  const root = (await load("")) as EventPage;
  if (!root.categories.length || root.categories.length > 80)
    throw new Error("이벤트 분류를 확인할 수 없습니다.");
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
          "이벤트 수가 제한을 넘었습니다. 기존 단가표를 유지합니다.",
        );
      for (const next of result.pages)
        if (!visited.has(next)) pending.push(next);
    }
  }
  if (!items.size)
    throw new Error(
      "홈페이지 이벤트가 비어 있습니다. 기존 단가표를 유지합니다.",
    );
  const ordered = [...items.values()],
    events = new Array<WebsiteEvent>(ordered.length);
  let next = 0,
    completed = 0,
    stopped = false;
  const worker = async () => {
    while (!stopped && next < ordered.length) {
      check();
      const index = next++,
        item = ordered[index];
      const event = (await load(
        `?category=${item.categoryId}&item=${item.id}`,
      )) as WebsiteEvent;
      if (event.id !== item.id || !Array.isArray(event.offers))
        throw new Error("이벤트 상세를 확인할 수 없습니다.");
      events[index] = event;
      completed++;
      progress(
        `가격·기간·포스터 주소 확인 중 (${completed}/${ordered.length})`,
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
