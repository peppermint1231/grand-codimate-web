import { it, expect, describe } from "vitest";
import {
  emptyState,
  type User,
  type State,
  type Line,
  type Command,
} from "../src/core/model";
import {
  applyCommand,
  calculate,
  metrics,
  gradeFor,
  duplicates,
  activeLedger,
} from "../src/core/domain";
const admin: User = {
  id: "admin",
  name: "관리자",
  username: "admin",
  role: "admin",
  active: true,
  permissions: {},
};
const staff: User = { ...admin, id: "staff", role: "coordinator" },
  other: User = { ...staff, id: "other" };
const command = (
  type: string,
  payload: Record<string, unknown>,
  entityId?: string,
  baseRev?: number,
): Command => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
const line = (p: Partial<Line> = {}): Line => ({
  id: "line",
  productId: "product",
  optionId: "option",
  name: "테스트",
  label: "1회",
  unit: "개",
  quantity: 1,
  price: 1000000,
  tax: "exclusive",
  discount: { kind: "amount", value: 0 },
  ...p,
});
async function fixture(passed = false) {
  let s = emptyState();
  s.users = [admin, staff, other];
  s = await applyCommand(
    s,
    staff,
    command(
      "patient.create",
      {
        name: "테스트환자",
        sex: "F",
        dob: "1990-01-01",
        phone: "01012345678",
        address: "테스트동",
      },
      "patient",
    ),
  );
  s = await applyCommand(
    s,
    staff,
    command(
      "consultation.create",
      { patientId: "patient", category: "미용" },
      "consult",
    ),
  );
  if (passed) {
    s.consultations[0].status = "P";
    s.consultations[0].quote = calculate(
      [line()],
      { kind: "amount", value: 0 },
      "included",
    );
  }
  return s;
}
const entry = (kind: string, amount: number, originalId?: string) =>
  command("ledger.create", {
    kind,
    amount,
    originalId,
    consultationId: "consult",
    date: "2026-09-18",
    method: "카드",
    memo: "테스트 사유",
  });
const receipt = async (s: State, n = 1000000) =>
  applyCommand(s, staff, entry("receipt", n));
describe("견적", () => {
  it.each([
    ["exclusive", "separate", 1100000],
    ["inclusive", "separate", 1000000],
    ["exclusive", "included", 1000000],
    ["exempt", "separate", 1000000],
  ] as const)("%s %s → %i", (tax, vat, total) =>
    expect(
      calculate([line({ tax })], { kind: "amount", value: 0 }, vat).total,
    ).toBe(total),
  );
  it("항목 할인 후 전체 할인", () =>
    expect(
      calculate(
        [line({ discount: { kind: "percent", value: 10 } })],
        { kind: "percent", value: 10 },
        "included",
      ).total,
    ).toBe(810000));
  it("배분 반올림에도 최종금액 보존", () =>
    expect(
      calculate(
        [line({ price: 1001 }), line({ price: 2002 }), line({ price: 3003 })],
        { kind: "amount", value: 100 },
        "included",
      ).total,
    ).toBe(5906));
  it("할인 초과와 수량 오류 차단", () => {
    expect(() =>
      calculate([line()], { kind: "percent", value: 101 }, "included"),
    ).toThrow();
    expect(() =>
      calculate(
        [line({ quantity: 0 })],
        { kind: "amount", value: 0 },
        "included",
      ),
    ).toThrow();
  });
});
describe("환자와 권한", () => {
  it("가족 전화번호는 후보일 뿐 자동 병합하지 않음", async () => {
    const s = await fixture();
    expect(
      duplicates(s, {
        name: "다른이름",
        dob: "2001-01-01",
        phone: "01012345678",
      }),
    ).toHaveLength(1);
    expect(s.patients).toHaveLength(1);
  });
  it("환자 수정 후 과거 상담 스냅샷 보존", async () => {
    const s = await fixture();
    const n = await applyCommand(
      s,
      admin,
      command(
        "patient.update",
        { ...s.patients[0], phone: "01011112222" },
        "patient",
        1,
      ),
    );
    expect(n.consultations[0].patient.phone).toBe("01012345678");
  });
  it("기준 버전 충돌", async () => {
    const s = await fixture();
    await expect(
      applyCommand(
        s,
        admin,
        command("patient.update", { ...s.patients[0] }, "patient", 0),
      ),
    ).rejects.toThrow("다른 기기");
  });
  it("타인 보류·직원의 확정 원문 수정 차단", async () => {
    for (const [passed, u] of [
      [false, other],
      [true, staff],
    ] as const) {
      const s = await fixture(passed);
      await expect(
        applyCommand(
          s,
          u,
          command(
            "consultation.save",
            {
              lines: [],
              discount: { kind: "amount", value: 0 },
              vat: "separate",
            },
            "consult",
            1,
          ),
        ),
      ).rejects.toThrow("권한");
    }
  });
  it("직원 환불 기본 차단", async () => {
    const s = await receipt(await fixture(true));
    await expect(
      applyCommand(s, staff, entry("refund", 1, s.ledger[0].id)),
    ).rejects.toThrow("권한");
  });
});
describe("금액 원장·등급", () => {
  it("부분 수납과 미수금", async () => {
    const s = await receipt(await fixture(true), 300000);
    expect(metrics(s, "patient")).toMatchObject({
      contract: 1000000,
      revenue: 300000,
      outstanding: 700000,
    });
  });
  it("계약 취소는 자동 환불 아님", async () => {
    let s = await receipt(await fixture(true));
    s = await applyCommand(
      s,
      admin,
      command("consultation.cancel", { reason: "계약 취소" }, "consult", 1),
    );
    expect(metrics(s, "patient")).toMatchObject({
      contract: 0,
      revenue: 1000000,
      outstanding: 0,
    });
  });
  it("환불 가능 잔액 초과 차단", async () => {
    const s = await receipt(await fixture(true), 300000);
    await expect(
      applyCommand(s, admin, entry("refund", 300001, s.ledger[0].id)),
    ).rejects.toThrow("초과");
  });
  it("정정 취소 후 원본은 보존", async () => {
    let s = await receipt(await fixture(true));
    s = await applyCommand(
      s,
      admin,
      entry("reversal", 1000000, s.ledger[0].id),
    );
    expect(s.ledger).toHaveLength(2);
    expect(activeLedger(s)).toHaveLength(0);
    expect(metrics(s, "patient").revenue).toBe(0);
  });
  it("환불 후 등급 하향, 고정 시 유지, 고정 해제 후 재계산", async () => {
    let s = await receipt(await fixture(true));
    s = await applyCommand(
      s,
      admin,
      command(
        "grade.policy",
        {
          grades: [
            { id: "vip", name: "VIP", color: "#145d55", minimum: 1000000 },
          ],
        },
        "grades",
      ),
    );
    expect(gradeFor(s, s.patients[0]).name).toBe("VIP");
    s = await applyCommand(s, admin, entry("refund", 100, s.ledger[0].id));
    expect(gradeFor(s, s.patients[0]).name).toBe("미분류");
    s = await applyCommand(
      s,
      admin,
      command(
        "grade.override",
        { gradeId: "vip", reason: "관리자 지정" },
        "patient",
        1,
      ),
    );
    expect(gradeFor(s, s.patients[0])).toMatchObject({
      name: "VIP",
      manual: true,
    });
    s = await applyCommand(
      s,
      admin,
      command("grade.override", {}, "patient", 2),
    );
    expect(gradeFor(s, s.patients[0]).name).toBe("미분류");
  });
});
