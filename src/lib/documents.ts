import { documentTheme, wrapDocumentText } from "../core/quoteTemplate";
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
  const theme = documentTheme();
  const color = (hex: string) =>
    rgb(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    );
  const addPage = () => {
    const p = pdf.addPage([595, 842]);
    p.drawRectangle({
      x: 0,
      y: 0,
      width: 595,
      height: 842,
      color: color(theme.paper),
    });
    p.drawRectangle({
      x: 0,
      y: 742,
      width: 595,
      height: 100,
      color: color(theme.ink),
    });
    p.drawText("GRAND  CLINIC", {
      x: 45,
      y: 797,
      size: 19,
      font: f,
      color: rgb(1, 1, 1),
    });
    p.drawText("아름다운의원 · 상담 기록", {
      x: 45,
      y: 768,
      size: 11,
      font: f,
      color: rgb(1, 1, 1),
    });
    p.drawRectangle({
      x: 45,
      y: 730,
      width: 505,
      height: 3,
      color: color(theme.accent),
    });
    return p;
  };
  let page = addPage(),
    y = 699;
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
        page = addPage();
        y = 699;
      }
      page.drawText(line, {
        x: 45,
        y,
        size,
        font: f,
        color: color(theme.ink),
      });
      y -= size + 8;
    }
  };
  write("시술 상담 견적 · 병원 보관용", 22);
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
    if (y < 140) {
      page = addPage();
      y = 699;
    }
    y -= 8;
    page.drawRectangle({
      x: 39,
      y: y - 8,
      width: 517,
      height: 26,
      color: color(theme.soft),
    });
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
  y -= 16;
  if (y < 100) {
    page = addPage();
    y = 699;
  }
  page.drawRectangle({
    x: 39,
    y: y - 12,
    width: 517,
    height: 37,
    color: color(theme.soft),
  });
  write(`최종 견적 ${money(c.quote.total)}`, 18);
  write(`할인·조정 사유: ${c.quote.reason || "없음"}`);
  write(`상담 메모\n${c.memo || "없음"}`);
  for (const o of opinions)
    write(
      `의사 의견 요청: ${o.request}\n답변: ${opinionAnswerText(o, c.photos) || "답변 대기"}`,
    );
  for (const s of signatures) {
    page = addPage();
    y = 699;
    write(`동의서 · 양식 버전 ${s.templateVersion}`, 18);
    write(s.templateBody);
    write(`확인 항목: ${s.checks.join(" / ")}`);
    write(`서명자: ${s.signer} (${s.relationship}) · ${s.createdAt}`);
    write(`내용 해시: ${s.contentHash}`, 8);
    if (y < 150) {
      page = addPage();
      y = 699;
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
  const rows = Math.max(1, Math.floor(630 / (cellHeight + 28)));
  const perPage = columns * rows;
  for (let i = 0; i < images.length; i++) {
    if (i % perPage === 0) page = addPage();
    const image = images[i],
      embedded =
        image.type === "image/png"
          ? await pdf.embedPng(image.bytes)
          : await pdf.embedJpg(image.bytes);
    const position = i % perPage,
      x = 45 + (position % columns) * (cellWidth + 10),
      top = 710 - Math.floor(position / columns) * (cellHeight + 28);
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
  for (const [index, p] of pdf.getPages().entries()) {
    p.drawLine({
      start: { x: 45, y: 35 },
      end: { x: 550, y: 35 },
      thickness: 0.5,
      color: color(theme.accent),
    });
    p.drawText(
      `GRAND CLINIC · 병원 보관 자료    ${index + 1} / ${pdf.getPageCount()}`,
      { x: 45, y: 20, font: f, size: 8, color: color(theme.ink) },
    );
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
  const theme = documentTheme();
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = "26px Codimate, sans-serif";
  type Item = {
    line: Consultation["quote"]["lines"][number];
    texts: string[];
    continuation: boolean;
    height: number;
  };
  const rows: Item[] = c.quote.lines.flatMap((line) => {
    const texts = [
      ...wrapDocumentText(
        line.name,
        (text) => measure.measureText(text).width,
        610,
      ),
      ...wrapDocumentText(
        `${line.label} · ${line.quantity}${line.unit || "개"}`,
        (text) => measure.measureText(text).width,
        610,
      ),
    ];
    return Array.from({ length: Math.ceil(texts.length / 12) }, (_, i) => ({
      line,
      texts: texts.slice(i * 12, i * 12 + 12),
      continuation: i > 0,
      height: Math.max(110, Math.min(12, texts.length - i * 12) * 30 + 30),
    }));
  });
  const chunks: Item[][] = [[]];
  let used = 0;
  for (const row of rows) {
    if (used + row.height > 690 && chunks.at(-1)!.length) {
      chunks.push([]);
      used = 0;
    }
    chunks.at(-1)!.push(row);
    used += row.height;
  }
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
    const text = (
      value: string,
      px: number,
      y: number,
      size = 24,
      color: string = theme.ink,
      align: CanvasTextAlign = "left",
    ) => {
      x.fillStyle = color;
      x.font = `${size >= 38 ? "bold " : ""}${size}px Codimate, sans-serif`;
      x.textAlign = align;
      x.fillText(value, px, y);
      x.textAlign = "left";
    };
    const rect = (
      left: number,
      top: number,
      width: number,
      height: number,
      color: string,
    ) => {
      x.fillStyle = color;
      x.fillRect(left, top, width, height);
    };
    rect(0, 0, 1240, 1754, theme.paper);
    rect(0, 0, 1240, 215, theme.ink);
    text("GRAND  CLINIC", 70, 80, 40, "#ffffff");
    text("아름다운의원", 72, 126, 24, "#ffffff");
    text("시술 상담 견적서", 1170, 89, 38, "#ffffff", "right");
    text("PERSONAL TREATMENT PLAN", 1170, 135, 18, "#e1e7e3", "right");
    rect(70, 211, 1100, 5, theme.accent);
    text(`${c.patient.name} 님`, 70, 271, 34);
    text(
      `${c.category} · ${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul" }).format(new Date(c.createdAt))}`,
      1170,
      269,
      23,
      theme.ink,
      "right",
    );
    rect(70, 305, 1100, 48, theme.ink);
    text("시술 · 구성", 92, 337, 22, "#ffffff");
    text("시술 금액 / 할인가", 1148, 337, 22, "#ffffff", "right");
    let y = 362;
    for (const [index, item] of chunks[i].entries()) {
      rect(
        70,
        y,
        1100,
        item.height - 4,
        index % 2 === 0 ? "#ffffff" : theme.soft,
      );
      item.texts.forEach((t, k) =>
        text(t, 92, y + 35 + k * 30, k === 0 && !item.continuation ? 26 : 23),
      );
      if (!item.continuation) {
        const prices = linePrices(item.line);
        text(money(prices.regular), 1148, y + 36, 26, theme.ink, "right");
        if (prices.catalogDiscount > 0) {
          text(
            `할인 −${money(prices.catalogDiscount)}`,
            1148,
            y + 66,
            20,
            "#947448",
            "right",
          );
          text(
            `할인가 ${money(prices.sale)}`,
            1148,
            y + 94,
            23,
            theme.ink,
            "right",
          );
        }
      }
      y += item.height;
    }
    if (i === chunks.length - 1) {
      rect(70, 1070, 1100, 232, theme.soft);
      text(`시술 금액 ${money(c.quote.subtotal)}`, 92, 1107, 25);
      text(
        `할인 합계 −${money(c.quote.discountTotal)}`,
        1148,
        1107,
        25,
        theme.ink,
        "right",
      );
      const fixed = catalogDiscount(c.quote.lines);
      text(
        `상품 할인 ${money(fixed)} · 추가·전체 할인 ${money(c.quote.discountTotal - fixed)}`,
        92,
        1142,
        21,
      );
      text(
        `공급가액·면세금액 ${money(c.quote.supply)} · 부가세 ${money(c.quote.vatAmount)}`,
        92,
        1184,
        24,
      );
      rect(70, 1214, 1100, 88, theme.ink);
      text("최종 안내금액", 95, 1270, 29, "#ffffff");
      text(money(c.quote.total), 1145, 1273, 43, "#ffffff", "right");
    } else text("최종 금액은 마지막 페이지에서 확인해주세요.", 70, 1120, 23);
    text("유출방지 동의 · 환자 본인 서명", 70, 1345, 24);
    x.font = "20px Codimate, sans-serif";
    wrapDocumentText(consent.text, (t) => x.measureText(t).width, 1100).forEach(
      (line, k) => text(line, 70, 1380 + k * 27, 20),
    );
    text(
      `서명자 ${consent.signer} · ${new Date(consent.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
      70,
      1510,
      21,
    );
    rect(70, 1528, 1100, 105, "#ffffff");
    const signature = new Image();
    signature.src = consent.image;
    await signature.decode();
    const scale = Math.min(315 / signature.width, 85 / signature.height);
    x.drawImage(
      signature,
      86,
      1538,
      signature.width * scale,
      signature.height * scale,
    );
    text(`동의 버전 ${consent.version}`, 460, 1568, 17);
    text(`기록 ${consent.id}`, 460, 1600, 17);
    rect(70, 1660, 1100, 2, theme.accent);
    text("GRAND CLINIC · 개인 상담용", 70, 1699, 19);
    text(`${i + 1} / ${chunks.length}`, 1170, 1699, 19, theme.ink, "right");
    pages.push(
      await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("견적서 이미지 생성 실패")),
          "image/jpeg",
          0.94,
        ),
      ),
    );
  }
  return pages;
}
