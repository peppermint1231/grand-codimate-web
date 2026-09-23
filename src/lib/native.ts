import { Capacitor, registerPlugin } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { ScreenOrientation } from "@capacitor/screen-orientation";
export const native = Capacitor.isNativePlatform();
export const NativeClinic = registerPlugin<{
  appInfo(): Promise<{ version: string; versionCode: number }>;
  seal(o: { value: string }): Promise<{ value: string }>;
  open(o: { value: string }): Promise<{ value: string }>;
  print(): Promise<void>;
  saveDocuments(o: {
    files: { name: string; mimeType: string; data: string }[];
  }): Promise<{ cancelled: boolean; count?: number }>;
  install(o: { url: string; sha256: string }): Promise<void>;
}>("ClinicDevice");
export async function takePhoto() {
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    quality: 100,
    saveToGallery: false,
    correctOrientation: true,
  });
  const blob = await (await fetch(photo.webPath!)).blob();
  return new File([blob], `촬영_${Date.now()}.${photo.format}`, {
    type: blob.type || "image/jpeg",
  });
}
export async function rotate(mode: string) {
  if (!native) return;
  if (mode === "auto") await ScreenOrientation.unlock();
  else
    await ScreenOrientation.lock({
      orientation: mode === "landscape" ? "landscape" : "portrait",
    });
}
export async function printPage() {
  if (native) await NativeClinic.print();
  else window.print();
}
