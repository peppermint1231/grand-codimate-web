import { useEffect, useRef, useState } from "react";
import {
  newerRelease,
  parseRelease,
  type AppRelease,
} from "../core/appRelease";
import { api, hasPendingUploads, needsServer } from "../lib/api";
import { native, NativeClinic } from "../lib/native";

export const requestAndroidUpdate = () =>
  window.dispatchEvent(new Event("codimate:check-update"));

export function AndroidUpdateNotice() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [message, setMessage] = useState("");
  const [installed, setInstalled] = useState("");
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const dismissed = useRef(0),
    installingRef = useRef(false);
  useEffect(() => {
    if (!native || needsServer) return;
    let active = true,
      inFlight = false,
      lastChecked = 0;
    let controller: AbortController | undefined;
    const check = async (manual = false) => {
      if (inFlight || installingRef.current) return;
      if (
        !manual &&
        (document.visibilityState === "hidden" ||
          Date.now() - lastChecked < 15 * 60_000)
      )
        return;
      if (!navigator.onLine) {
        if (manual) setMessage("인터넷 연결 후 업데이트를 다시 확인하세요.");
        return;
      }
      inFlight = true;
      lastChecked = Date.now();
      if (manual) {
        setChecking(true);
        setMessage("새 버전을 확인하고 있습니다…");
      }
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15_000);
      try {
        const [info, value] = await Promise.all([
          NativeClinic.appInfo(),
          api<unknown>("/app-release", {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);
        if (!active) return;
        if (value !== null && !parseRelease(value))
          throw new Error("업데이트 정보를 확인하지 못했습니다.");
        const next = newerRelease(value, info.versionCode);
        setInstalled(info.version);
        if (next) {
          if (manual || dismissed.current !== next.versionCode) {
            setRelease(next);
            setMessage("");
          }
        } else {
          setRelease(null);
          if (manual)
            setMessage(
              `현재 ${info.version} · 사용 가능한 새 업데이트가 없습니다.`,
            );
        }
      } catch (e) {
        lastChecked = 0;
        if (active && manual)
          setMessage(
            e instanceof Error && e.name !== "AbortError"
              ? e.message
              : "업데이트 서버에 연결하지 못했습니다. 잠시 후 다시 확인하세요.",
          );
        // A failed background check must not interrupt consultation or login.
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (active) setChecking(false);
      }
    };
    const automatic = () => {
      void check();
    };
    const manual = () => {
      void check(true);
    };
    automatic();
    window.addEventListener("online", automatic);
    window.addEventListener("focus", automatic);
    document.addEventListener("visibilitychange", automatic);
    window.addEventListener("codimate:check-update", manual);
    const timer = setInterval(automatic, 15 * 60_000);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("online", automatic);
      window.removeEventListener("focus", automatic);
      document.removeEventListener("visibilitychange", automatic);
      window.removeEventListener("codimate:check-update", manual);
    };
  }, []);
  if (!native || needsServer || (!release && !message)) return null;
  const install = async () => {
    if (!release || installingRef.current) return;
    if (
      hasPendingUploads() ||
      !window.dispatchEvent(
        new Event("codimate:before-install", { cancelable: true }),
      )
    ) {
      setMessage(
        "저장·전송 중인 자료가 있습니다. 상담 저장과 동기화를 마친 뒤 설치하세요.",
      );
      return;
    }
    if (
      !window.confirm(
        "상담 내용을 저장했나요? 설치하면 앱이 종료될 수 있습니다. 저장을 마쳤다면 설치를 진행하세요.",
      )
    )
      return;
    installingRef.current = true;
    setInstalling(true);
    setMessage("업데이트 파일을 내려받고 확인하고 있습니다…");
    try {
      await NativeClinic.install({ url: release.url, sha256: release.sha256 });
      setMessage(
        "Android 설치 화면에서 확인하세요. 취소했다면 다시 설치할 수 있습니다.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "업데이트 설치를 시작하지 못했습니다. 다시 시도하세요.",
      );
    } finally {
      installingRef.current = false;
      setInstalling(false);
    }
  };
  return (
    <aside
      className="android-update-notice"
      role="status"
      aria-label="앱 업데이트 안내"
    >
      {release && (
        <>
          <strong>코디메이트 {release.version} 업데이트</strong>
          <span className="small">
            현재 {installed} · 상담 저장 후 설치하세요.
          </span>
          <p className="release-notes">{release.notes}</p>
        </>
      )}
      {message && <p>{message}</p>}
      <div className="button-row">
        {release && (
          <button
            disabled={installing || checking}
            onClick={() => void install()}
          >
            {installing ? "다운로드 중…" : "업데이트 설치"}
          </button>
        )}
        <button
          disabled={installing}
          onClick={() => {
            if (release) dismissed.current = release.versionCode;
            setRelease(null);
            setMessage("");
          }}
        >
          {release ? "나중에" : "닫기"}
        </button>
      </div>
    </aside>
  );
}
