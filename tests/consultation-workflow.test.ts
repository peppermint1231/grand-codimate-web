import { it, expect } from "vitest";
import {
  emptyState,
  emptyQuote,
  type State,
  type User,
} from "../src/core/model";
import { applyCommand, renewalQuote } from "../src/core/domain";
import { catalogAdmin, threeCatalogs } from "./fixtures/catalogs";
const now = "2026-10-02T05:00:00Z",
  base = { rev: 1, createdAt: now, updatedAt: now };
const owner: User = {
  ...catalogAdmin,
  id: "owner",
  name: "담당자",
  role: "coordinator",
  permissionLevel: "standard",
};
const doctor = (id: string): User => ({
  ...owner,
  id,
  name: id,
  role: "doctor",
});
function fixture() {
  const s = emptyState();
  s.users = [catalogAdmin, owner, doctor("doctor1"), doctor("doctor2")];
  s.catalogs = threeCatalogs();
  s.patients = [
    {
      ...base,
      id: "p",
      name: "시험",
      dob: "1990-01-01",
      sex: "F",
      phone: "01012345678",
      address: "동",
      ownerId: "owner",
    },
  ];
  s.consultations = [
    {
      ...base,
      id: "c",
      patientId: "p",
      patient: s.patients[0],
      ownerId: "owner",
      category: "미용",
      status: "P",
      cancelled: false,
      catalogVersion: "version-0",
      quote: {
        ...emptyQuote(),
        total: 11000,
        lines: [
          {
            id: "line",
            productId: "product-0",
            optionId: "option-0",
            catalogVersion: "version-0",
            book: "미용",
            name: "이전 메뉴",
            label: "1+1",
            unit: "회",
            quantity: 1,
            price: 10000,
            tax: "exclusive",
            discount: { kind: "amount", value: 0 },
          },
        ],
      },
      memo: "",
      photos: [],
      appointment: "",
      attendance: "방문",
      documents: [],
    },
  ];
  return s;
}
const command = (
  type: string,
  payload: Record<string, unknown>,
  entityId?: string,
  baseRev?: number,
) => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
it("renews a removed historical menu and saves the server-owned snapshot without inventing a current listing", async () => {
  let s = fixture();
  s.catalogs = [];
  const quote = renewalQuote(s.consultations[0], [], "r");
  expect(quote.total).toBe(11000);
  expect(quote.lines[0].renewalNotice).toContain("이전 상담");
  s = await applyCommand(
    s,
    owner,
    command(
      "consultation.create",
      {
        patientId: "p",
        category: "미용",
        kind: "renewal",
        sourceConsultationId: "c",
        sourceRev: 1,
      },
      "r",
    ),
    now,
  );
  const c = s.consultations[1];
  s = await applyCommand(
    s,
    owner,
    command(
      "consultation.save",
      {
        lines: c.quote.lines,
        discount: c.quote.discount,
        vat: c.quote.vat,
        reason: "",
        photos: [],
        memo: "확인",
        catalogVersion: "",
      },
      "r",
      1,
    ),
    now,
  );
  expect(s.consultations[1].quote.total).toBe(11000);
});
it("permits owner/admin reassignment, keeps receipts and requester identities, and rejects other staff and stale edits", async () => {
  const s = fixture();
  s.consultations[0].status = "F";
  const cmd = command(
    "consultation.owner",
    { ownerId: "doctor1", reason: "담당 인계" },
    "c",
    1,
  );
  await expect(applyCommand(s, s.users[2], cmd, now)).rejects.toThrow(
    "본인 또는 관리자",
  );
  const n = await applyCommand(s, owner, cmd, now);
  expect(n.consultations[0].ownerId).toBe("doctor1");
  expect(n.events.at(-1)?.text).toContain("담당 인계");
  await expect(applyCommand(n, catalogAdmin, cmd, now)).rejects.toThrow(
    "다른 기기",
  );
  expect(n.ledger).toEqual(s.ledger);
});
it("creates separate replies for multiple doctors atomically and deduplicates recipient selection", async () => {
  const s = fixture();
  s.consultations[0].status = "H";
  const cmd = command("opinion.request", {
    consultationId: "c",
    toIds: ["doctor1", "doctor2", "doctor1"],
    request: "사진 확인 부탁드립니다",
  });
  const n = await applyCommand(s, owner, cmd, now);
  expect(n.opinions.map((o) => o.toId)).toEqual(["doctor1", "doctor2"]);
  expect(new Set(n.opinions.map((o) => o.id)).size).toBe(2);
  expect(n.opinions.every((o) => o.request === "사진 확인 부탁드립니다")).toBe(
    true,
  );
  s.users[3].active = false;
  await expect(applyCommand(s, owner, cmd, now)).rejects.toThrow("활성 의사");
  expect(s.opinions).toHaveLength(0);
});
export { fixture as workflowFixture };
