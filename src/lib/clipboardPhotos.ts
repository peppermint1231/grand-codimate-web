import { Capacitor } from "@capacitor/core";
import { native, NativeClinic } from "./native";
const raster = /^image\/(png|jpeg|webp)$/;
export const clipboardPhotoFiles = (data: DataTransfer) =>
  Array.from(data.files).filter((f) => raster.test(f.type));
export async function readClipboardPhotos(): Promise<File[]> {
  if (native) {
    const { files } = await NativeClinic.readClipboardImages();
    try {
      return await Promise.all(
        files.map(async (f) => {
          const response = await fetch(Capacitor.convertFileSrc(f.path));
          if (!response.ok)
            throw new Error(
              "복사한 사진을 읽지 못했습니다. 다시 복사해주세요.",
            );
          return new File([await response.blob()], f.name, { type: f.type });
        }),
      );
    } finally {
      await NativeClinic.clearClipboardImages({
        paths: files.map((f) => f.path),
      }).catch(() => {});
    }
  }
  if (!navigator.clipboard?.read)
    throw new Error(
      "이 브라우저에서는 버튼으로 읽을 수 없습니다. 사진을 복사한 뒤 이 버튼에 초점을 두고 Ctrl+V(맥: ⌘V)로 붙여넣으세요.",
    );
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error(
      "클립보드 접근을 허용한 뒤 다시 눌러주세요. 또는 이 버튼에 초점을 두고 Ctrl+V(맥: ⌘V)로 붙여넣으세요.",
    );
  }
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((t) => raster.test(t));
    if (!type) continue;
    const blob = await item.getType(type);
    if (blob.size > 25_000_000)
      throw new Error("클립보드 사진은 한 장당 25MB 이하로 추가하세요.");
    files.push(
      new File(
        [blob],
        `붙여넣기_${Date.now()}_${files.length + 1}.${type.split("/")[1]}`,
        { type },
      ),
    );
  }
  if (!files.length)
    throw new Error(
      "클립보드에 사진이 없습니다. 사진이나 캡처 이미지를 복사한 뒤 다시 눌러주세요.",
    );
  return files;
}
