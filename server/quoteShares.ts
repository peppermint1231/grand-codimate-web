import { z } from "zod";
import { open, seal } from "./crypto";
import { sha } from "../src/core/domain";
import { QUOTE_SHARE_DAYS } from "../src/core/quoteConsent";
export const quoteShareInput = z.object({
  consultationId: z.string().min(1),
  consentId: z.string().min(1),
  pages: z
    .array(
      z
        .string()
        .max(2_000_000)
        .regex(/^\/9j\/[A-Za-z0-9+/]+={0,2}$/),
    )
    .min(1)
    .max(30),
});
export interface QuoteShare {
  id: string;
  consultationId: string;
  consentId: string;
  actorId: string;
  expires: number;
  count: number;
}
export class QuoteShares {
  constructor(
    private sql: SqlStorage,
    private key: string,
  ) {}
  async get(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    const row = this.sql
      .exec<{ value: string }>(
        "SELECT value FROM quote_shares WHERE id=? AND part='meta'",
        await sha(token),
      )
      .toArray()[0];
    return row ? open<QuoteShare>(row.value, this.key) : undefined;
  }
  async create(
    input: z.infer<typeof quoteShareInput>,
    actorId: string,
    now = Date.now(),
  ) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const id = await sha(token),
      expires = now + QUOTE_SHARE_DAYS * 86400_000;
    const record: QuoteShare = {
      id,
      consultationId: input.consultationId,
      consentId: input.consentId,
      actorId,
      expires,
      count: input.pages.length,
    };
    try {
      for (let p = 0; p < input.pages.length; p++) {
        const data = input.pages[p];
        for (let i = 0; i < data.length; i += 100000)
          this.sql.exec(
            "INSERT INTO quote_shares VALUES(?,?,?,?,?)",
            id,
            `${p}:${i}`,
            input.consultationId,
            expires,
            await seal(data.slice(i, i + 100000), this.key),
          );
      }
      this.sql.exec(
        "INSERT INTO quote_shares VALUES(?,?,?,?,?)",
        id,
        "meta",
        input.consultationId,
        expires,
        await seal(record, this.key),
      );
    } catch (e) {
      this.remove(id);
      throw e;
    }
    return { ...record, token };
  }
  async page(id: string, page: number) {
    const rows = this.sql
      .exec<{ part: string; value: string }>(
        "SELECT part,value FROM quote_shares WHERE id=? AND part LIKE ?",
        id,
        `${page}:%`,
      )
      .toArray();
    rows.sort(
      (a, b) => Number(a.part.split(":")[1]) - Number(b.part.split(":")[1]),
    );
    const parts = await Promise.all(
      rows.map((r) => open<string>(r.value, this.key)),
    );
    return Buffer.from(parts.join(""), "base64");
  }
  async list(consultationId: string) {
    const rows = this.sql
      .exec<{ value: string }>(
        "SELECT value FROM quote_shares WHERE consultationId=? AND part='meta' AND expires>?",
        consultationId,
        Date.now(),
      )
      .toArray();
    return Promise.all(rows.map((r) => open<QuoteShare>(r.value, this.key)));
  }
  remove(id: string) {
    this.sql.exec("DELETE FROM quote_shares WHERE id=?", id);
  }
  purge() {
    this.sql.exec("DELETE FROM quote_shares WHERE expires<=?", Date.now());
  }
}
export const quoteShareHeaders = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
export function quoteShareHTML(token: string, share: QuoteShare) {
  // Only generated tokens, page numbers and a formatted timestamp enter this document.
  const base = `/api/public/quotes/${token}`;
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>환자용 견적서</title><style>body{font:16px sans-serif;background:#f5f7f3;color:#214b45;max-width:800px;margin:24px auto;padding:16px}a{display:inline-block;background:#145d55;color:white;padding:12px 18px;border-radius:8px;margin:12px 0}img{width:100%;display:block}p{line-height:1.6}@media print{header,a{display:none}img{break-after:page;width:100%}}</style><header><h1>환자용 견적서</h1><p>본인 보관용 자료입니다. 타인에게 파일이나 링크를 전달하지 마세요.<br>다운로드 가능 기한: ${new Date(share.expires).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간)</p></header>${Array.from({ length: share.count }, (_, i) => `<section><a href="${base}/${i}?download=1" download="quote-${i + 1}.jpg">${i + 1}페이지 JPG 다운로드</a><img src="${base}/${i}" alt="서명된 견적서 ${i + 1}페이지"></section>`).join("")}</html>`;
}
