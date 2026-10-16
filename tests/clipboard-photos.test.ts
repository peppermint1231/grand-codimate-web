import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/lib/native", () => ({ native: false, NativeClinic: {} }));
import {
  readClipboardPhotos,
  clipboardPhotoFiles,
} from "../src/lib/clipboardPhotos";
afterEach(() => vi.unstubAllGlobals());
it("uses one image representation per clipboard item and ignores copied links/text", async () => {
  const getType = vi.fn(async (type: string) => new Blob(["image"], { type }));
  vi.stubGlobal("navigator", {
    clipboard: {
      read: async () => [
        { types: ["text/html", "image/png", "image/jpeg"], getType },
        { types: ["text/plain"], getType },
      ],
    },
  });
  const files = await readClipboardPhotos();
  expect(files).toHaveLength(1);
  expect(files[0].type).toBe("image/png");
  expect(getType).toHaveBeenCalledTimes(1);
});
it("explains empty clipboard, denied permissions, and unsupported browsers", async () => {
  vi.stubGlobal("navigator", { clipboard: { read: async () => [] } });
  await expect(readClipboardPhotos()).rejects.toThrow("사진이 없습니다");
  vi.stubGlobal("navigator", {
    clipboard: {
      read: async () => {
        throw Error("denied");
      },
    },
  });
  await expect(readClipboardPhotos()).rejects.toThrow("Ctrl+V");
  vi.stubGlobal("navigator", {});
  await expect(readClipboardPhotos()).rejects.toThrow("Ctrl+V");
});
it("keeps paste events limited to image files", () => {
  expect(
    clipboardPhotoFiles({
      files: [
        new File(["x"], "a.png", { type: "image/png" }),
        new File(["text"], "a.txt", { type: "text/plain" }),
      ],
    } as unknown as DataTransfer),
  ).toHaveLength(1);
});
