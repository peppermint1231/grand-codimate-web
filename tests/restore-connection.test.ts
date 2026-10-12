import { afterEach, expect, it, vi } from "vitest";
import { apiResponse } from "../src/lib/apiResponse";
import { restoreConnection } from "../src/lib/restoreConnection";
import worker from "../server/worker";
afterEach(() => vi.useRealTimers());
const controller = () => new AbortController();
it("recovers an HTML outage once, retaining the workspace and credentials outside the retry", async () => {
  vi.useFakeTimers();
  const read = vi
    .fn()
    .mockImplementationOnce(() =>
      apiResponse(new Response("<html>unavailable</html>", { status: 502 })),
    )
    .mockResolvedValueOnce({ state: { patients: [] } });
  const progress = vi.fn();
  const result = restoreConnection(read, controller().signal, progress);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(result).resolves.toEqual({ state: { patients: [] } });
  expect(read).toHaveBeenCalledTimes(2);
  expect(progress.mock.calls).toEqual([[1], [2]]);
});
it("bounds prolonged connection failures to three reads", async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  const result = restoreConnection(read, controller().signal, () => {});
  const check = expect(result).rejects.toThrow("Failed to fetch");
  await vi.runAllTimersAsync();
  await check;
  expect(read).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  { status: 401 },
  { status: 403 },
  { status: 429 },
  { status: 503, code: "STORAGE_DAILY_LIMIT" },
])(
  "does not retry authentication, permission, surge or quota failures: %j",
  async (failure) => {
    const read = vi.fn().mockRejectedValue(failure);
    await expect(
      restoreConnection(read, controller().signal, () => {}),
    ).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(1);
  },
);
it("cancels pending retries on navigation/unmount", async () => {
  vi.useFakeTimers();
  const c = controller(),
    read = vi.fn().mockRejectedValue(new TypeError("offline"));
  const result = restoreConnection(read, c.signal, () => {});
  const check = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  c.abort();
  await check;
  await vi.runAllTimersAsync();
  expect(read).toHaveBeenCalledTimes(1);
});
it("aborts slow reads and reports a clear error after the bounded attempts", async () => {
  vi.useFakeTimers();
  const read = vi.fn(
    (signal: AbortSignal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      ),
  );
  const result = restoreConnection(read, controller().signal, () => {});
  const check = expect(result).rejects.toMatchObject({
    status: 504,
    message: expect.stringContaining("지연"),
  });
  await vi.runAllTimersAsync();
  await check;
  expect(read).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});
it("only a valid JSON 401 expires the session; HTML 401/200 never do", async () => {
  await expect(
    apiResponse(Response.json({ error: "로그인 필요" }, { status: 401 })),
  ).rejects.toMatchObject({ status: 401 });
  for (const status of [200, 401])
    await expect(
      apiResponse(new Response("<html>gateway</html>", { status })),
    ).rejects.toMatchObject({ status: 503, code: "INVALID_SERVER_RESPONSE" });
  await expect(
    apiResponse(
      Response.json(
        { error: "한도", code: "STORAGE_DAILY_LIMIT" },
        { status: 503 },
      ),
    ),
  ).rejects.toMatchObject({ code: "STORAGE_DAILY_LIMIT" });
});
it("keeps an isolate failure JSON and CORS readable in the tablet app, without replaying a write", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("isolate reset"));
  const env = {
    APP_ORIGIN: "https://example.test",
    CLINIC: { idFromName: () => "hospital", get: () => ({ fetch }) },
  };
  const result = await worker.fetch(
    new Request("https://example.test/api/commands", {
      method: "POST",
      headers: { Origin: "https://localhost" },
      body: "{}",
    }),
    env as any,
  );
  expect(result.status).toBe(503);
  expect(result.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://localhost",
  );
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect(await result.json()).toMatchObject({
    code: "SERVER_TEMPORARILY_UNAVAILABLE",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
