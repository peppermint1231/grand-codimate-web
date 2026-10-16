import { afterEach, expect, it, vi } from "vitest";
const plugin = vi.hoisted(() => ({
  readClipboardImages: vi.fn(),
  clearClipboardImages: vi.fn(async () => {}),
}));
vi.mock("../src/lib/native", () => ({ native: true, NativeClinic: plugin }));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    convertFileSrc: (url: string) =>
      url.replace("file://", "https://localhost/_capacitor_file_"),
  },
}));
import { readClipboardPhotos } from "../src/lib/clipboardPhotos";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("loads native URI images and removes the temporary copies after use", async () => {
  plugin.readClipboardImages.mockResolvedValue({
    files: [
      {
        path: "file:///cache/clipboard-photos/image.png",
        name: "image.png",
        type: "image/png",
      },
    ],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Blob(["image"], { type: "image/png" }))),
  );
  const files = await readClipboardPhotos();
  expect(files[0].name).toBe("image.png");
  expect(files[0].type).toBe("image/png");
  expect(plugin.clearClipboardImages).toHaveBeenCalledWith({
    paths: ["file:///cache/clipboard-photos/image.png"],
  });
});
it("also removes native temporary photos if the webview cannot read them", async () => {
  plugin.readClipboardImages.mockResolvedValue({
    files: [
      {
        path: "file:///cache/clipboard-photos/image.png",
        name: "image.png",
        type: "image/png",
      },
    ],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  await expect(readClipboardPhotos()).rejects.toThrow("사진을 읽지 못했습니다");
  expect(plugin.clearClipboardImages).toHaveBeenCalledTimes(1);
});
