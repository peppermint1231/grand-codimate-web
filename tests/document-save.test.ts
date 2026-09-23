import { afterEach, expect, it, vi } from "vitest";
const device = vi.hoisted(() => ({ enabled: true, save: vi.fn() }));
vi.mock("../src/lib/native", () => ({
  get native() {
    return device.enabled;
  },
  NativeClinic: { saveDocuments: device.save },
}));
import { exportFileName, saveDocuments } from "../src/lib/saveDocuments";
afterEach(() => {
  device.enabled = true;
  device.save.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("passes all PDF/JPG bytes and safe filenames to the Android save bridge", async () => {
  device.save.mockResolvedValue({ cancelled: false, count: 2 });
  const bytes = new Uint8Array([0, 255, 128, 1]);
  expect(
    await saveDocuments([
      {
        name: "견적서.pdf",
        blob: new Blob([bytes], { type: "application/pdf" }),
      },
      {
        name: "환자/견적:1.jpg",
        blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      },
    ]),
  ).toBe("saved");
  const files = device.save.mock.calls[0][0].files;
  expect(files.map((f: any) => [f.name, f.mimeType])).toEqual([
    ["견적서.pdf", "application/pdf"],
    ["환자_견적_1.jpg", "image/jpeg"],
  ]);
  expect([...Buffer.from(files[0].data, "base64")]).toEqual([...bytes]);
  expect(Buffer.from(files[1].data, "base64").toString()).toBe("jpeg");
});
it("reports Android cancellation without claiming success", async () => {
  device.save.mockResolvedValue({ cancelled: true });
  expect(
    await saveDocuments([{ name: "a.pdf", blob: new Blob(["pdf"]) }]),
  ).toBe("cancelled");
});
it("propagates Android write failures for the retry UI", async () => {
  device.save.mockRejectedValue(new Error("저장 공간 부족"));
  await expect(
    saveDocuments([{ name: "a.pdf", blob: new Blob(["pdf"]) }]),
  ).rejects.toThrow("저장 공간 부족");
});
it("rejects empty or missing generated documents before saving", async () => {
  await expect(saveDocuments([])).rejects.toThrow("비어");
  await expect(
    saveDocuments([{ name: "a.pdf", blob: new Blob([]) }]),
  ).rejects.toThrow("비어");
  expect(device.save).not.toHaveBeenCalled();
});
it("does not silently launch multiple browser downloads", async () => {
  device.enabled = false;
  await expect(
    saveDocuments([
      { name: "1.jpg", blob: new Blob(["a"]) },
      { name: "2.jpg", blob: new Blob(["b"]) },
    ]),
  ).rejects.toThrow("각 페이지");
});
it("attaches the browser download link, removes it, and eventually releases the blob URL", async () => {
  device.enabled = false;
  vi.useFakeTimers();
  const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() },
    append = vi.fn();
  vi.stubGlobal("document", {
    createElement: () => link,
    body: { appendChild: append },
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:quote");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  expect(
    await saveDocuments([{ name: "파일.pdf", blob: new Blob(["pdf"]) }]),
  ).toBe("downloaded");
  expect(link.download).toBe("파일.pdf");
  expect(append).toHaveBeenCalledWith(link);
  expect(link.click).toHaveBeenCalledOnce();
  expect(link.remove).toHaveBeenCalledOnce();
  expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60000);
  expect(revoke).toHaveBeenCalledWith("blob:quote");
});
it("preserves Korean names while removing path and control characters", () => {
  expect(exportFileName("환자\\견적/파일\n.pdf")).toBe("환자_견적_파일_.pdf");
});
