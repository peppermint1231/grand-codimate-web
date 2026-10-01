import { afterEach, expect, it, vi } from "vitest";
import { retryWebsitePage } from "../src/lib/eventSync";
afterEach(() => vi.useRealTimers());
it("retries transient page failures twice then returns the intact page", async () => {
  vi.useFakeTimers();
  const load = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 504 }))
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValue({ items: [1, 2] });
  const progress = vi.fn();
  const result = retryWebsitePage(load, progress);
  await vi.runAllTimersAsync();
  await expect(result).resolves.toEqual({ items: [1, 2] });
  expect(load).toHaveBeenCalledTimes(3);
  expect(progress).toHaveBeenCalledTimes(2);
});
it("does not retry authentication, schema errors or explicit cancellation", async () => {
  for (const status of [401, 403, 422]) {
    const load = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("invalid"), { status }));
    await expect(retryWebsitePage(load, () => {})).rejects.toMatchObject({
      status,
    });
    expect(load).toHaveBeenCalledTimes(1);
  }
  const controller = new AbortController();
  const load = vi.fn().mockRejectedValue(new TypeError("offline"));
  const result = retryWebsitePage(
    load,
    () => controller.abort(),
    controller.signal,
  );
  // A callback can cancel between a failure and the retry delay.
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(load).toHaveBeenCalledTimes(1);
});
it("stops after three failures so a partial scan cannot be applied", async () => {
  vi.useFakeTimers();
  const load = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error("timeout"), { status: 504 }));
  const result = expect(retryWebsitePage(load, () => {})).rejects.toMatchObject(
    { status: 504 },
  );
  await vi.runAllTimersAsync();
  await result;
  expect(load).toHaveBeenCalledTimes(3);
});
