import { afterEach, expect, it, vi } from "vitest";
import { Drive } from "../server/drive";
afterEach(() => vi.restoreAllMocks());
it("renames by stable item ID with conflict failure and clears cached paths", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({}));
  const drive = new Drive(async () => "test-only");
  await drive.folders("상담");
  fetch.mockClear();
  fetch
    .mockResolvedValueOnce(
      Response.json({ id: "root-id", name: "상담", folder: {} }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(
      Response.json({ id: "root-id", name: "코디메이트", folder: {} }),
    );
  await drive.renameFolder("root-id", "코디메이트");
  expect(fetch.mock.calls[2][0]).toBe(
    "https://graph.microsoft.com/v1.0/me/drive/items/root-id",
  );
  expect(fetch.mock.calls[2][1]).toMatchObject({
    method: "PATCH",
    body: JSON.stringify({
      name: "코디메이트",
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
  await drive.folders("상담");
  expect(fetch.mock.calls.at(-1)?.[1]?.method).toBe("POST");
});
it("refuses an occupied destination without patching", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ id: "source", folder: {} }))
    .mockResolvedValueOnce(Response.json({ id: "other", folder: {} }));
  await expect(
    new Drive(async () => "test-only").renameFolder("source", "코디메이트"),
  ).rejects.toThrow("이미 있습니다");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("uploads the root locator directly and reads commits below the configured folder", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ id: "locator" }))
    .mockResolvedValueOnce(
      Response.json({ value: [{ name: "02" }, { name: "01" }] }),
    );
  const drive = new Drive(async () => "test-only");
  await drive.put(".codimate-storage.enc", "encrypted");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(
    "https://graph.microsoft.com/v1.0/me/drive/root:/.codimate-storage.enc:/content",
  );
  expect(await drive.listCommits("commits", "코디메이트")).toEqual([
    { name: "01" },
    { name: "02" },
  ]);
  expect(decodeURIComponent(String(fetch.mock.calls[1][0]))).toContain(
    "/코디메이트/_codimate/commits:",
  );
});
