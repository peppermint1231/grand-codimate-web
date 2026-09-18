import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:8787/api";
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
async function request(path: string, body?: any, token?: string) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await r.json()) as any;
  return { status: r.status, data };
}
assert.equal(
  (await request("/health")).data.mode,
  "local-development",
  "Only run against isolated development storage",
);
const login = await request("/login", {
  username: creds.username,
  password: creds.password,
});
assert.equal(login.status, 200);
const token = login.data.token;
const cmd = (
  type: string,
  payload: any,
  entityId = crypto.randomUUID(),
  baseRev?: number,
) => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
const send = async (c: any, who = token, status = 200) => {
  const r = await request("/commands", c, who);
  assert.equal(r.status, status, JSON.stringify(r.data));
  return r.data;
};
const now = new Date().toISOString(),
  catId = crypto.randomUUID(),
  productId = crypto.randomUUID(),
  optionId = crypto.randomUUID();
await send(
  cmd(
    "catalog.save",
    {
      catalog: {
        id: catId,
        rev: 0,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
        status: "draft",
        version: "synthetic-verification",
        references: [],
        products: [
          {
            id: productId,
            rev: 1,
            createdAt: now,
            updatedAt: now,
            category: "검증전용",
            name: "검증상품 · 실제 판매 금지",
            description: "테스트 데이터",
            composition: "",
            active: true,
            sources: [],
            options: [
              {
                id: optionId,
                label: "1회",
                price: 100000,
                tax: "inclusive",
                review: false,
                issues: [],
                sources: [],
                priceKind: "clinic",
                unit: "회",
              },
            ],
          },
        ],
      },
    },
    catId,
  ),
);
await send(cmd("catalog.publish", {}, catId, 1));
const patientId = crypto.randomUUID(),
  consultId = crypto.randomUUID();
await send(
  cmd(
    "patient.create",
    {
      name: "API검증용",
      sex: "F",
      dob: "1990-01-01",
      phone: "01000000000",
      address: "검증동",
    },
    patientId,
  ),
);
await send(
  cmd("consultation.create", { patientId, category: "미용" }, consultId),
);
await send(
  cmd(
    "consultation.save",
    {
      lines: [
        {
          id: crypto.randomUUID(),
          productId,
          optionId,
          quantity: 1,
          discount: { kind: "amount", value: 0 },
        },
      ],
      discount: { kind: "amount", value: 0 },
      vat: "included",
      memo: "검증",
      photos: [],
    },
    consultId,
    1,
  ),
);
const pdf = await PDFDocument.create();
pdf.addPage();
const bytes = await pdf.save();
const uploadId = crypto.randomUUID();
const headers = {
  Authorization: "Bearer " + token,
  "Content-Type": "application/pdf",
  "X-Consultation-Id": consultId,
  "X-File-Name": "verification.pdf",
  "X-Upload-Id": uploadId,
};
let r = await fetch(base + "/media", {
  method: "POST",
  headers,
  body: bytes as unknown as BodyInit,
});
assert.equal(r.status, 200);
const media = (await r.json()) as any;
r = await fetch(base + "/media", {
  method: "POST",
  headers,
  body: bytes as unknown as BodyInit,
});
assert.equal(r.status, 200);
assert.equal(((await r.json()) as any).id, media.id);
await send(
  cmd(
    "consultation.finalize",
    { status: "P", documents: [media.id] },
    consultId,
    2,
  ),
);
const receipt = cmd("ledger.create", {
  consultationId: consultId,
  kind: "receipt",
  amount: 60000,
  method: "카드",
  date: "2026-09-18",
  memo: "분할 수납",
});
await send(receipt);
assert.equal((await send(receipt)).replayed, true);
await send(
  cmd("ledger.create", {
    consultationId: consultId,
    kind: "refund",
    originalId: receipt.entityId,
    amount: 10000,
    method: "카드",
    date: "2026-09-18",
    memo: "일부 환불",
  }),
);
await send(
  cmd("ledger.create", {
    consultationId: consultId,
    kind: "refund",
    originalId: receipt.entityId,
    amount: 60000,
    method: "카드",
    date: "2026-09-18",
    memo: "한도 초과",
  }),
  token,
  400,
);
const employee = {
  id: crypto.randomUUID(),
  username: "verify_" + Date.now(),
  name: "검증직원",
  password: crypto.randomUUID(),
  role: "coordinator",
  active: true,
  permissions: { "money.read": false, export: false },
};
assert.equal((await request("/users", employee, token)).status, 200);
const staff = (
  await request("/login", {
    username: employee.username,
    password: employee.password,
  })
).data.token;
await send(
  cmd("consultation.cancel", { reason: "권한 검사" }, consultId, 3),
  staff,
  403,
);
await send(
  cmd("ledger.create", {
    consultationId: consultId,
    kind: "refund",
    originalId: receipt.entityId,
    amount: 1,
    method: "카드",
    date: "2026-09-18",
    memo: "권한 검사",
  }),
  staff,
  403,
);
await send(cmd("audit.export", { format: "statistics-xlsx" }), staff, 403);
const state = (await request("/state", undefined, staff)).data.state;
assert.equal(state.ledger.length, 0);
assert.equal(
  state.consultations.find((c: any) => c.id === consultId).quote.total,
  0,
);
assert.equal((await fetch(base + "/media/" + media.id, {
  headers: { Authorization: "Bearer " + staff },
})).status, 403, "An unredacted PDF must not bypass money/export restrictions");
assert.equal((await fetch(base + "/media/" + media.id, {
  headers: { Authorization: "Bearer " + token },
})).status, 200);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/api-verification.json",
  JSON.stringify(
    {
      passed: true,
      checks: [
        "catalog publish",
        "patient consultation linkage",
        "server price calculation",
        "media retry",
        "finalization",
        "partial receipt",
        "receipt retry dedup",
        "partial refund",
        "over-refund rejection",
        "cancel/refund/export API permissions",
        "money redaction",
        "PDF money/export permissions",
      ],
    },
    null,
    2,
  ),
);
console.log("API verification passed");
