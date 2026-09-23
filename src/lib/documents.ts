import { currentProgress } from "./operationProgress";
import { validQuoteConsent } from "../core/quoteConsent";
import type { QuoteConsent } from "../core/model";
import { opinionAnswerText } from "../core/opinions";
import { catalogDiscount, linePrices } from "../core/quotePrices";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  age,
  money,
  type Consultation,
  type User,
  type Signature,
  type Opinion,
} from "../core/model";
let fontBytes: Promise<ArrayBuffer> | undefined;
const font = () =>
  (fontBytes ??= fetch("/fonts/NanumGothic-Regular.ttf").then((r) => {
    if (!r.ok) throw new Error("문서 글꼴을 불러오지 못했습니다");
    return r.arrayBuffer();
  }));
export function documentName(c: Consultation, u: User, status = c.status) {
  const d = new Date(),
    parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(d)
      .replace(/[^\d]/g, "");
  return `${status}_${parts.slice(0, 6)}_${parts.slice(6, 10)}_${c.patient.sex}${age(c.patient.dob, new Date(c.createdAt))}${c.patient.name}_${u.name}.pdf`;
}
export async function consultationPDF(
  c: Consultation,
  u: User,
  images: { bytes: ArrayBuffer; type: string }[] = [],
  signatures: Signature[] = [],
  opinions: Opinion[] = [],
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // fontkit subsets omit Korean glyph outlines in some PDF renderers.
  // Embed the complete static font; verify the rasterized PDF as well as text extraction.
  const f = await pdf.embedFont(await font(), { subset: false });
  let page = pdf.addPage([595, 842]),
    y = 800;
  const write = (text: string, size = 11) => {
    text = text.replaceAll("−", "-"); // NanumGothic has no U+2212 outline.
    const lines = text.split("\n").flatMap((t) => {
      const lines: string[] = [];
      let l = "";
      for (const ch of t) {
        if (f.widthOfTextAtSize(l + ch, size) > 505) {
          lines.push(l);
          l = "";
        }
        l += ch;
      }
      lines.push(l);
      return lines;
    });
    for (const line of lines) {
      if (y < 55) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      page.drawText(line, {
        x: 45,
        y,
        size,
        font: f,
        color: rgb(0.12, 0.2, 0.18),
      });
      y -= size + 8;
    }
  };
  write("코디메이트 · 상담결과", 22);
  write(`상담번호 ${c.id}`);
  write(
    `${c.patient.name} · ${age(c.patient.dob, new Date(c.createdAt))}세 · ${c.category} · ${c.status === "P" ? "성공" : c.status === "F" ? "실패" : "보류"}`,
  );
  write(`연락처 ${c.patient.phone} / 주소 ${c.patient.address}`);
  write(
    `작성 ${u.name} / ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
  );
  write("");
  for (const l of c.quote.lines) {
    const prices = linePrices(l);
    write(
      `${l.name} / ${l.label} × ${l.quantity} · 시술 금액 ${money(prices.regular)}`,
    );
    if (prices.catalogDiscount > 0)
      write(
        `상품 할인 −${money(prices.catalogDiscount)} / 할인가 ${money(prices.sale)}`,
      );
  }
  const fixedDiscount = catalogDiscount(c.quote.lines);
  write(`시술 금액 ${money(c.quote.subtotal)}`);
  write(`할인 합계 −${money(c.quote.discountTotal)}`);
  if (fixedDiscount > 0)
    write(
      `상품 할인 ${money(fixedDiscount)} / 추가·전체 할인 ${money(c.quote.discountTotal - fixedDiscount)}`,
    );
  write(
    `공급가액·면세금액 ${money(c.quote.supply)} / 부가세 ${money(c.quote.vatAmount)}`,
  );
  write(`최종 견적 ${money(c.quote.total)}`, 18);
  write(`할인·조정 사유: ${c.quote.reason || "없음"}`);
  write(`상담 메모\n${c.memo || "없음"}`);
  for (const o of opinions)
    write(
      `의사 의견 요청: ${o.request}\n답변: ${opinionAnswerText(o, c.photos) || "답변 대기"}`,
    );
  for (const s of signatures) {
    page = pdf.addPage([595, 842]);
    y = 795;
    write(`동의서 · 양식 버전 ${s.templateVersion}`, 18);
    write(s.templateBody);
    write(`확인 항목: ${s.checks.join(" / ")}`);
    write(`서명자: ${s.signer} (${s.relationship}) · ${s.createdAt}`);
    write(`내용 해시: ${s.contentHash}`, 8);
    if (y < 150) {
      page = pdf.addPage([595, 842]);
      y = 795;
    }
    const signature = await pdf.embedPng(s.image);
    const scale = Math.min(300 / signature.width, 100 / signature.height);
    page.drawImage(signature, {
      x: 45,
      y: y - 100,
      width: signature.width * scale,
      height: signature.height * scale,
    });
  }
  const columns = Math.max(1, Math.min(4, c.photoColumns || 2));
  const cellWidth = (505 - (columns - 1) * 10) / columns;
  const cellHeight = columns === 1 ? 620 : Math.min(225, cellWidth * 0.85);
  const rows = Math.max(1, Math.floor(720 / (cellHeight + 28)));
  const perPage = columns * rows;
  for (let i = 0; i < images.length; i++) {
    if (i % perPage === 0) page = pdf.addPage([595, 842]);
    const image = images[i],
      embedded =
        image.type === "image/png"
          ? await pdf.embedPng(image.bytes)
          : await pdf.embedJpg(image.bytes);
    const position = i % perPage,
      x = 45 + (position % columns) * (cellWidth + 10),
      top = 795 - Math.floor(position / columns) * (cellHeight + 28);
    const scale = Math.min(
      cellWidth / embedded.width,
      cellHeight / embedded.height,
    );
    page.drawImage(embedded, {
      x: x + (cellWidth - embedded.width * scale) / 2,
      y: top - embedded.height * scale,
      width: embedded.width * scale,
      height: embedded.height * scale,
    });
    page.drawText(`${i + 1}`, {
      x,
      y: top - cellHeight - 14,
      font: f,
      size: 9,
    });
  }
  return new Blob([(await pdf.save()) as BlobPart], {
    type: "application/pdf",
  });
}
export async function quoteJPG(c: Consultation, consent: QuoteConsent) {
  if (!(await validQuoteConsent(c, consent)))
    throw new Error("현재 견적의 유출방지 동의·서명이 필요합니다");
  currentProgress()?.update({
    title: "견적서 이미지를 만들고 있습니다",
    detail: "견적 내용과 환자 서명을 포함하고 있습니다.",
  });
  await document.fonts.ready;
  const pages: Blob[] = [];
  const chunks = Array.from(
    { length: Math.max(1, Math.ceil(c.quote.lines.length / 6)) },
    (_, i) => c.quote.lines.slice(i * 6, i * 6 + 6),
  );
  for (let i = 0; i < chunks.length; i++) {
    currentProgress()?.update({
      title: "견적서 이미지를 만들고 있습니다",
      detail: `${i + 1} / ${chunks.length}페이지 생성 중`,
      percent: Math.floor((i / chunks.length) * 100),
      metric: "이미지 생성 진행률",
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1240;
    canvas.height = 1754;
    const x = canvas.getContext("2d")!;
    x.fillStyle = "#fcfbf7";
    x.fillRect(0, 0, 1240, 1754);
    x.fillStyle = "#145d55";
    x.font = "bold 48px Codimate, sans-serif";
    x.fillText("시술 상담 견적서", 80, 110);
    x.font = "28px Codimate, sans-serif";
    x.fillText(`${c.patient.name} 님 · ${c.category}`, 80, 175);
    let y = 260;
    x.fillStyle = "#253b36";
    for (const l of chunks[i]) {
      const prices = linePrices(l);
      x.fillText(l.name.slice(0, 32), 80, y, 1080);
      x.font = "24px Codimate, sans-serif";
      x.fillText(`${l.label.slice(0, 38)} × ${l.quantity}`, 80, y + 32, 1080);
      x.fillText(`시술 금액 ${money(prices.regular)}`, 80, y + 64, 1080);
      if (prices.catalogDiscount > 0)
        x.fillText(
          `상품 할인 −${money(prices.catalogDiscount)} · 할인가 ${money(prices.sale)}`,
          80,
          y + 94,
          1080,
        );
      x.font = "28px Codimate, sans-serif";
      y += 126;
    }
    if (i === chunks.length - 1) {
      y = Math.max(y + 20, 1040);
      const fixedDiscount = catalogDiscount(c.quote.lines);
      x.fillText(`시술 금액 ${money(c.quote.subtotal)}`, 80, y, 1080);
      x.fillText(
        `할인 합계 −${money(c.quote.discountTotal)}`,
        80,
        y + 40,
        1080,
      );
      x.font = "22px Codimate, sans-serif";
      if (fixedDiscount > 0)
        x.fillText(
          `상품 할인 ${money(fixedDiscount)} · 추가·전체 할인 ${money(c.quote.discountTotal - fixedDiscount)}`,
          80,
          y + 74,
          1080,
        );
      x.font = "28px Codimate, sans-serif";
      x.fillText(
        `공급가액·면세금액 ${money(c.quote.supply)} · 부가세 ${money(c.quote.vatAmount)}`,
        80,
        y + 116,
        1080,
      );
      x.font = "bold 42px Codimate, sans-serif";
      x.fillText(`최종 안내금액  ${money(c.quote.total)}`, 80, y + 186, 1080);
    }
    x.fillStyle = "#253b36";
    x.font = "bold 22px Codimate, sans-serif";
    x.fillText("유출방지 동의 · 환자 본인 서명", 80, 1320);
    x.font = "21px Codimate, sans-serif";
    let consentLine = "",
      consentY = 1354;
    for (const ch of consent.text) {
      if (x.measureText(consentLine + ch).width > 1080) {
        x.fillText(consentLine, 80, consentY);
        consentY += 29;
        consentLine = "";
      }
      consentLine += ch;
    }
    if (consentLine) x.fillText(consentLine, 80, consentY);
    x.fillText(
      `서명자 ${consent.signer} · ${new Date(consent.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
      80,
      1510,
      1080,
    );
    const signature = new Image();
    signature.src = consent.image;
    await signature.decode();
    x.drawImage(signature, 80, 1530, 315, 90);
    x.font = "16px Codimate, sans-serif";
    x.fillText(
      `동의 버전 ${consent.version} · 기록 ${consent.id}`,
      420,
      1595,
      740,
    );
    x.font = "20px Codimate, sans-serif";
    x.fillText(
      `견적 기준 ${new Date().toLocaleDateString("ko-KR")}    ${i + 1}/${chunks.length}`,
      80,
      1670,
    );
    pages.push(
      await new Promise<Blob>((r, reject) =>
        canvas.toBlob(
          (b) => (b ? r(b) : reject(new Error("견적서 이미지 생성 실패"))),
          "image/jpeg",
          0.92,
        ),
      ),
    );
  }
  return pages;
}
