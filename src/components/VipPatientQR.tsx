import { useState } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api";
type Share = { id: string; url: string; createdAt: string };
export function VipPatientQR({ patientId }: { patientId: string }) {
  const [share, setShare] = useState<Share | null>(null);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action: "create" | "regenerate" | "revoke") => {
    if (
      action !== "create" &&
      !window.confirm(
        action === "revoke"
          ? "환자 조회 링크를 폐기할까요? 기존 QR로 조회할 수 없게 됩니다."
          : "새 QR을 발급할까요? 기존 QR은 즉시 사용할 수 없게 됩니다.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ share: Share | null }>("/vip-shares", {
        method: "POST",
        body: JSON.stringify({ patientId, action }),
      });
      setShare(result.share);
      setQr(
        result.share
          ? await QRCode.toDataURL(result.share.url, {
              width: 280,
              margin: 3,
              errorCorrectionLevel: "M",
            })
          : "",
      );
      if (!result.share) setMessage("조회 링크를 폐기했습니다.");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "QR을 만들지 못했습니다. 인터넷 연결을 확인해주세요.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card vip-patient-qr" aria-label="환자용 VIP 조회 QR">
      <h3>환자용 VIP 조회 QR</h3>
      <p>
        환자가 휴대폰으로 스캔하면 포인트 잔액·이용 실적·혜택을 확인할 수
        있습니다. 유효기간 없이 같은 QR로 최신 내용을 조회합니다.
      </p>
      {!share && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => void run("create")}
        >
          {busy ? "QR 준비 중…" : "조회 QR 생성·보기"}
        </button>
      )}
      {share && (
        <div className="vip-qr-content">
          {qr && (
            <img
              src={qr}
              width={280}
              height={280}
              alt="환자용 VIP 포인트·실적·혜택 조회 QR"
            />
          )}
          <div>
            <strong>유효기간 없음 · 본인 보관용</strong>
            <p className="small">
              QR·링크를 가진 사람은 이 환자의 포인트와 실적을 볼 수 있습니다.
              해당 환자에게만 전달해주세요.
            </p>
            <div className="button-row">
              <a
                className="button"
                href={share.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                환자 화면 열기
              </a>
              <button
                disabled={busy}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(share.url);
                    setMessage("조회 링크를 복사했습니다.");
                  } catch {
                    setMessage(
                      "링크 복사가 지원되지 않습니다. QR을 스캔해주세요.",
                    );
                  }
                }}
              >
                링크 복사
              </button>
              <button disabled={busy} onClick={() => void run("regenerate")}>
                QR 재발급
              </button>
              <button disabled={busy} onClick={() => void run("revoke")}>
                링크 폐기
              </button>
            </div>
            <p className="small">
              재발급·폐기 시 기존 QR은 즉시 사용할 수 없습니다.
            </p>
          </div>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
