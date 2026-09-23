import { afterEach, expect, it, vi } from "vitest";
import { Drive } from "../server/drive";
afterEach(() => vi.restoreAllMocks());
it("sends sequential Graph content ranges without bearer credentials, resumes 416, rejects foreign upload hosts", async () => {
  const drive = new Drive(async () => {
    throw new Error("must not load bearer token");
  });
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1
      ? new Response("", { status: 416 })
      : new Response(JSON.stringify({ nextExpectedRanges: ["327680-"] }));
  });
  expect(
    await drive.uploadPart(
      "https://up.1drv.com/session",
      new ArrayBuffer(327680),
      0,
      655360,
    ),
  ).toMatchObject({ nextExpectedRanges: ["327680-"] });
  expect(calls).toHaveLength(2);
  expect(calls[0].init?.headers).toEqual({
    "Content-Length": "327680",
    "Content-Range": "bytes 0-327679/655360",
  });
  expect(calls[1].init).toBeUndefined();
  for (const url of [
    "http://up.1drv.com/x",
    "https://up.1drv.com.evil.example/x",
    "https://user:pass@up.1drv.com/x",
  ])
    await expect(
      drive.uploadPart(url, new ArrayBuffer(1), 0, 1),
    ).rejects.toThrow();
  expect(calls).toHaveLength(2);
});
