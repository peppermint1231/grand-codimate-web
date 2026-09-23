import { withProgress } from "../lib/operationProgress";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import {
  allowed,
  type Consultation,
  type QuoteConsent,
  type User,
} from "../core/model";
import {
  QUOTE_CONSENT_TEXT,
  quoteContentHash,
  validQuoteConsent,
} from "../core/quoteConsent";
import { api } from "../lib/api";
import { quoteJPG } from "../lib/documents";
import { saveDocuments, type ExportDocument } from "../lib/saveDocuments";
import { native, printPage } from "../lib/native";
import { SignaturePad } from "./PhotoEditor";
import { PhotoModal } from "./PhotoBoard";
import { useAppBack } from "../lib/navigation";
type Share = { id: string; url?: string; expires: number; count: number };
export function PatientQuote({
  consultation: c,
  consents,
  user,
  dirty,
  save,
  send,
}: {
  consultation: Consultation;
  consents: QuoteConsent[];
  user: User;
  dirty: boolean;
  save: () => Promise<unknown>;
  send: (...args: any[]) => Promise<any>;
}) {
  const [open, setOpen] = useState(false),
    [consent, setConsent] = useState<QuoteConsent>(),
    [agreed, setAgreed] = useState(false),
    [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [files, setFiles] = useState<ExportDocument[]>([]),
    [shares, setShares] = useState<Share[]>([]),
    [qr, setQr] = useState(""),
    [currentShare, setCurrentShare] = useState<Share>();
  const [printUrls, setPrintUrls] = useState<string[]>([]);
  const permitted = allowed(user, "export") && allowed(user, "money.read");
  const content = JSON.stringify({
    id: c.id,
    patient: c.patient.name,
    quote: c.quote,
    category: c.category,
    cancelled: c.cancelled,
  });
  useAppBack(open, () => setOpen(false), 86);
  useEffect(() => {
    setConsent(undefined);
    setFiles([]);
    setPrintUrls([]);
    setQr("");
    setCurrentShare(undefined);
    setAgreed(false);
    setSignature("");
  }, [content]);
  const consentKey = consents
    .filter((x) => x.consultationId === c.id)
    .map((x) => x.id + ":" + x.contentHash)
    .join("|");
  useEffect(() => {
    let active = true;
    void (async () => {
      for (const item of [...consents].reverse())
        if (await validQuoteConsent(c, item)) {
          if (active) setConsent(item);
          break;
        }
    })();
    return () => {
      active = false;
    };
  }, [content, consentKey]);
  useEffect(
    () => () => {
      for (const u of printUrls) URL.revokeObjectURL(u);
    },
    [printUrls],
  );
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await withProgress("견적서 처리 중입니다", fn);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const loadShares = async () => {
    const r = await api<{ shares: Share[] }>(
      "/quote-shares?consultationId=" + encodeURIComponent(c.id),
    );
    setShares(r.shares);
  };
  const generate = async () => {
    if (dirty) throw new Error("상담 변경을 먼저 저장해주세요.");
    if (!consent || !(await validQuoteConsent(c, consent)))
      throw new Error("유출방지 동의와 서명이 필요합니다.");
    const audited = await send("audit.export", {
      format: "quote-jpg",
      consultationId: c.id,
      consentId: consent.id,
    });
    if (audited === false)
      throw new Error("온라인 동기화 후 다시 내보내기 해주세요.");
    const output = (await quoteJPG(c, consent)).map((blob, i) => ({
      blob,
      name: `견적서_${c.patient.name}_${i + 1}.jpg`,
    }));
    setFiles(output);
    return output;
  };
  const download = async (output: ExportDocument[]) => {
    const result = await saveDocuments(output);
    setMessage(
      result === "saved"
        ? "선택한 위치에 저장했습니다."
        : result === "cancelled"
          ? "저장을 취소했습니다. 다시 저장할 수 있습니다."
          : "다운로드를 요청했습니다. 브라우저 다운로드 목록을 확인해주세요.",
    );
  };
  const print = async () => {
    const output = await generate();
    const urls = output.map((f) => URL.createObjectURL(f.blob));
    await Promise.all(
      urls.map(
        (src) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("인쇄 이미지 준비 실패"));
            image.src = src;
          }),
      ),
    );
    setPrintUrls(urls);
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    await printPage();
    setMessage("서명된 견적서 인쇄를 요청했습니다.");
  };
  return (
    <>
      <button
        disabled={!permitted || !c.quote.lines.length || c.cancelled}
        onClick={() => {
          setOpen(true);
          void run(loadShares);
        }}
      >
        환자용 JPG · 인쇄 · QR
      </button>
      {open && (
        <PhotoModal
          label="환자용 견적서"
          className="overlay patient-quote-overlay"
          close={() => setOpen(false)}
        >
          <div className="card patient-quote-content" aria-busy={busy}>
            <div className="section-title">
              <h3>환자용 견적서</h3>
              <button onClick={() => setOpen(false)}>닫기</button>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {message && <p role="status">{message}</p>}
            {dirty ? (
              <div className="notice">
                <p>
                  견적에 반영할 상담 변경을 먼저 저장해주세요. 저장 후 이 창을
                  다시 열어 서명받을 수 있습니다.
                </p>
                <button disabled={busy} onClick={() => void run(save)}>
                  상담 변경 저장
                </button>
              </div>
            ) : !consent ? (
              <>
                <h4>유출방지 안내 및 동의</h4>
                <p className="consent-text">{QUOTE_CONSENT_TEXT}</p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  위 내용을 읽고 동의합니다.
                </label>
                <p>
                  서명자: <b>{c.patient.name}</b> (환자 본인)
                </p>
                <SignaturePad key={content} onChange={setSignature} />
                <button
                  className="primary"
                  disabled={busy || !agreed || !signature}
                  onClick={() =>
                    void run(async () => {
                      const saved = await send("quote.consent", {
                        consultationId: c.id,
                        agreed: true,
                        signer: c.patient.name,
                        image: signature,
                        contentHash: await quoteContentHash(c),
                      });
                      if (saved === false)
                        throw new Error(
                          "서명 동기화가 대기 중입니다. 온라인에서 동기화 후 다시 열어주세요.",
                        );
                      setMessage("동의와 서명을 저장했습니다.");
                    })
                  }
                >
                  동의·서명 저장
                </button>
              </>
            ) : (
              <>
                <details>
                  <summary>동의·서명 완료 · {consent.signer}</summary>
                  <p>{consent.text}</p>
                  <img
                    className="quote-consent-signature"
                    src={consent.image}
                    alt="환자 서명"
                  />
                  <small>
                    {new Date(consent.createdAt).toLocaleString("ko-KR")} · 견적
                    변경 시 다시 서명받습니다.
                  </small>
                </details>
                <div className="button-row">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const output = await generate();
                        if (native || output.length === 1)
                          await download(output);
                        else
                          setMessage(
                            `견적서 ${output.length}장입니다. 아래에서 페이지별로 저장해주세요.`,
                          );
                      })
                    }
                  >
                    JPG 다운로드
                  </button>
                  <button disabled={busy} onClick={() => void run(print)}>
                    환자용 인쇄
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const output = await generate();
                        const pages = await Promise.all(
                          output.map(
                            (f) =>
                              new Promise<string>((resolve, reject) => {
                                const r = new FileReader();
                                r.onload = () =>
                                  resolve(String(r.result).split(",")[1]);
                                r.onerror = () =>
                                  reject(new Error("파일 읽기 실패"));
                                r.readAsDataURL(f.blob);
                              }),
                          ),
                        );
                        const share = await api<Share>("/quote-shares", {
                          method: "POST",
                          body: JSON.stringify({
                            consultationId: c.id,
                            consentId: consent.id,
                            pages,
                          }),
                        });
                        setCurrentShare(share);
                        setQr(
                          await QRCode.toDataURL(share.url!, {
                            width: 280,
                            margin: 4,
                            errorCorrectionLevel: "M",
                          }),
                        );
                        await loadShares();
                      })
                    }
                  >
                    QR 다운로드 링크 발급 · 7일
                  </button>
                </div>
                {files.length > 0 && (
                  <section
                    className="quote-export-files"
                    aria-label="환자용 견적서 파일"
                  >
                    {files.map((file, i) => (
                      <button
                        key={file.name}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await generate();
                            await download([file]);
                          })
                        }
                      >
                        {i + 1}페이지 JPG 저장
                      </button>
                    ))}
                  </section>
                )}
                {qr && currentShare && (
                  <div className="quote-share">
                    <img src={qr} alt="환자용 견적서 다운로드 QR 코드" />
                    <p>
                      스캔하여 다운로드 ·{" "}
                      {new Date(currentShare.expires).toLocaleString("ko-KR")}
                      까지
                    </p>
                    <a href={currentShare.url} target="_blank" rel="noreferrer">
                      다운로드 페이지 열기
                    </a>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await navigator.clipboard.writeText(
                            currentShare.url!,
                          );
                          setMessage("링크를 복사했습니다.");
                        })
                      }
                    >
                      링크 복사
                    </button>
                    <p className="hint">
                      이 링크를 가진 사람은 견적서를 볼 수 있습니다. 환자
                      본인에게만 전달해주세요.
                    </p>
                  </div>
                )}
              </>
            )}
            {shares.length > 0 && (
              <details>
                <summary>발급된 링크 관리 ({shares.length})</summary>
                {shares.map((share) => (
                  <div key={share.id} className="list-row">
                    <span>
                      {new Date(share.expires).toLocaleString("ko-KR")} 만료
                    </span>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api("/quote-shares", {
                            method: "POST",
                            body: JSON.stringify({
                              consultationId: c.id,
                              revokeId: share.id,
                            }),
                          });
                          if (currentShare?.id === share.id) {
                            setCurrentShare(undefined);
                            setQr("");
                          }
                          await loadShares();
                        })
                      }
                    >
                      즉시 만료
                    </button>
                  </div>
                ))}
              </details>
            )}
          </div>
        </PhotoModal>
      )}
      {printUrls.length > 0 &&
        createPortal(
          <div className="patient-quote-print-root">
            {printUrls.map((src) => (
              <img key={src} src={src} alt="서명된 환자용 견적서" />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
