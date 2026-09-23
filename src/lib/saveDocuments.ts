import { currentProgress } from "./operationProgress";
import { native, NativeClinic } from "./native";
export interface ExportDocument {
  name: string;
  blob: Blob;
}
export function exportFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180);
}
export async function saveDocuments(files: ExportDocument[]) {
  if (!files.length || files.some((f) => !f.blob.size))
    throw new Error("저장할 문서가 비어 있습니다. 다시 생성해주세요.");
  currentProgress()?.update({ title: "파일 저장 준비 중입니다" });
  if (native) {
    const encoded = [];
    for (const file of files) {
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      encoded.push({
        name: exportFileName(file.name),
        mimeType: file.blob.type,
        data: btoa(binary),
      });
    }
    currentProgress()?.update({
      title: "파일 저장 중입니다",
      detail:
        "기기에서 저장 위치를 선택해주세요. 파일 기록이 끝날 때까지 기다려주세요.",
    });
    const result = await NativeClinic.saveDocuments({ files: encoded });
    return result.cancelled ? "cancelled" : "saved";
  }
  // One download per click: browsers may silently block subsequent automatic downloads.
  if (files.length !== 1)
    throw new Error("각 페이지의 저장 버튼을 눌러주세요.");
  const url = URL.createObjectURL(files[0].blob),
    link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(files[0].name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "downloaded";
}
