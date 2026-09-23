import { afterEach, expect, it, vi } from "vitest";
import {
  beginProgress,
  currentProgress,
  progressSnapshot,
  reportTransfer,
  transferPercent,
  watchProgress,
  withProgress,
} from "../src/lib/operationProgress";
import { uploadRequest } from "../src/lib/uploadRequest";
afterEach(() => {
  currentProgress()?.end();
  vi.unstubAllGlobals();
});
it("keeps progress visible through the server wait and closes only when the operation resolves", async () => {
  let resolve!: () => void;
  const wait = new Promise<void>((r) => (resolve = r));
  const running = withProgress("저장", async () => {
    reportTransfer(currentProgress(), {
      loaded: 100,
      total: 100,
      waiting: true,
    });
    await wait;
  });
  expect(progressSnapshot()).toMatchObject({
    percent: 100,
    title: "서버에 저장 중입니다",
  });
  resolve();
  await running;
  expect(progressSnapshot()).toBeNull();
});
it("cleans up failures and prevents stale callbacks from altering a later operation", async () => {
  const old = beginProgress("이전"),
    next = beginProgress("다음");
  old.update({ title: "늦은 응답", percent: 100 });
  old.end();
  expect(progressSnapshot()?.title).toBe("다음");
  next.end();
  await expect(
    withProgress("실패", async () => {
      throw new Error("network");
    }),
  ).rejects.toThrow("network");
  expect(progressSnapshot()).toBeNull();
});
it("preserves outer progress across nested saves and notifies accessible status subscribers", async () => {
  const listener = vi.fn(),
    unsub = watchProgress(listener);
  await withProgress("상담 저장", async () => {
    const id = progressSnapshot()?.id;
    await withProgress("파일 저장", async () => {
      currentProgress()?.update({ title: "전송", percent: 50 });
    });
    expect(progressSnapshot()).toMatchObject({ id, percent: 50 });
  });
  expect(listener).toHaveBeenCalledTimes(3);
  unsub();
});
it("never guesses unknown percentages or rounds incomplete bytes to 100", () => {
  expect(transferPercent({ loaded: 999, total: 1000, waiting: false })).toBe(
    99,
  );
  expect(transferPercent({ loaded: 5, waiting: false })).toBeUndefined();
  expect(
    transferPercent({ loaded: 0, total: 0, waiting: false }),
  ).toBeUndefined();
  expect(transferPercent({ loaded: 110, total: 100, waiting: true })).toBe(100);
});
class FakeXHR {
  static last: FakeXHR;
  upload: any = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  status = 200;
  responseText = '{"ok":true}';
  withCredentials = false;
  timeout = 0;
  headers: Record<string, string> = {};
  open = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => this.onabort?.());
  constructor() {
    FakeXHR.last = this;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
}
const request = () => {
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  const progress = vi.fn();
  const result = uploadRequest(
    "/api/commands",
    {
      method: "POST",
      body: "1234567890",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
    },
    progress,
  );
  return { progress, result, xhr: FakeXHR.last };
};
it("tracks actual upload bytes with authentication, without resolving when bytes finish", async () => {
  const { xhr, result, progress } = request();
  const done = vi.fn();
  void result.then(done);
  expect(xhr.withCredentials).toBe(true);
  expect(xhr.headers.authorization).toBe("Bearer token");
  expect(progress).toHaveBeenLastCalledWith({
    loaded: 0,
    total: 10,
    waiting: false,
  });
  xhr.upload.onprogress({ loaded: 5, total: 10, lengthComputable: true });
  expect(progress).toHaveBeenLastCalledWith({
    loaded: 5,
    total: 10,
    waiting: false,
  });
  xhr.upload.onload();
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  expect(progress).toHaveBeenLastCalledWith({
    loaded: 10,
    total: 10,
    waiting: true,
  });
  xhr.onload?.();
  await expect(result).resolves.toEqual({ ok: true });
});
it("preserves conflict and permission errors rather than treating them as successful uploads", async () => {
  for (const status of [401, 403, 409]) {
    const { xhr, result } = request();
    xhr.status = status;
    xhr.responseText = '{"error":"충돌"}';
    xhr.onload?.();
    await expect(result).rejects.toMatchObject({ message: "충돌", status });
  }
});
it("reports network failures, timeout and unreadable server responses for existing retry handling", async () => {
  for (const event of ["onerror", "ontimeout"] as const) {
    const { xhr, result } = request();
    xhr[event]?.();
    await expect(result).rejects.toThrow();
  }
  const { xhr, result } = request();
  xhr.status = 502;
  xhr.responseText = "<html>bad gateway</html>";
  xhr.onload?.();
  await expect(result).rejects.toMatchObject({ status: 502 });
});
it("aborts an interrupted request and does not leave the progress dialog hanging", async () => {
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  const controller = new AbortController();
  const result = withProgress("업로드", () =>
    uploadRequest(
      "/api/media",
      { body: new Blob(["bytes"]), signal: controller.signal },
      (p) => reportTransfer(currentProgress(), p),
    ),
  );
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(FakeXHR.last.abort).toHaveBeenCalledOnce();
  expect(progressSnapshot()).toBeNull();
});
