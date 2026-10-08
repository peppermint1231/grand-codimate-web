import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../server/worker";
import { applyCommand } from "../src/core/domain";
import { emptyState, type User } from "../src/core/model";
import {
  regionFromAddress,
  regionLabel,
  directoryRegions,
} from "../src/core/addressRegion";
import { patientImportSchema } from "../src/core/patientImport";
import { analyticsWorkbook } from "../src/core/analyticsExcel";
import { buildAnalytics } from "../src/core/analytics";
const admin: User = {
  id: "admin",
  username: "admin",
  name: "테스트",
  role: "admin",
  active: true,
  permissions: {},
};
const row = (n = 1) => ({
  id: "vegas-" + n.toString(16).padStart(32, "0"),
  number: "V" + n.toString().padStart(8, "0"),
  name: "가져오기시험" + n,
  sex: "F" as const,
  dob: "1980-01-01",
  phone: "01011112222",
  address: "석사동 123",
  addressRegion: regionFromAddress("석사동 123"),
  acquisitionSource: "",
  external: {
    source: "vegas" as const,
    fileHash: "a".repeat(64),
    rows: [n + 1],
    firstVisit: "2020-01-01",
    lastVisit: "2024-03-01",
    totalPaid: 9000000,
    visitCount: 12,
    issues: [],
  },
});
const command = (rows: any[]) => ({
  id: crypto.randomUUID(),
  type: "patient.import",
  payload: { rows },
});
it("resolves explicit neighbourhoods, defaults omitted city to Chuncheon, never guesses road-only addresses", () => {
  expect(regionFromAddress("석사동 123")).toMatchObject({
    sido: "강원특별자치도",
    sigungu: "춘천시",
    neighborhood: "석사동",
  });
  expect(regionFromAddress("강원도 춘천시 중앙로 68 (조양동)")).toMatchObject({
    neighborhood: "조양동",
  });
  expect(regionFromAddress("서울 강남구 테헤란로 1 (역삼동)")).toMatchObject({
    sido: "서울특별시",
    sigungu: "강남구",
    neighborhood: "역삼동",
  });
  expect(regionFromAddress("남산면 강촌리 123")?.neighborhood).toBe("남산면");
  expect(regionFromAddress("춘천시 중앙로 68")).toBeUndefined();
  expect(regionFromAddress("중앙로 68 101동")).toBeUndefined();
  expect(regionLabel({ address: "중앙로 68" })).toBe("주소 확인 필요");
  expect(
    directoryRegions([
      { address: "" },
      { address: "석사동" },
      { address: "중앙로 68" },
    ]),
  ).toMatchObject({ total: 3, unresolved: 1, missing: 1 });
});
it("imports reference history without creating financial/VIP history and refuses overwrites or resident numbers", async () => {
  const c = command([
    row(),
    { ...row(2), dob: "", address: "", addressRegion: undefined },
  ]);
  const s = await applyCommand(emptyState(), admin, c);
  expect(s.patients).toHaveLength(2);
  expect(s.ledger).toHaveLength(0);
  expect(s.vipAccounts).toHaveLength(0);
  expect(s.pointEntries).toHaveLength(0);
  expect(
    buildAnalytics(s, {
      from: "2020-01-01",
      to: "2029-01-01",
      ownerId: "",
      book: "",
    }).patients.registered,
  ).toBe(0);
  await expect(applyCommand(s, admin, command([row()]))).rejects.toThrow(
    "이미 가져온",
  );
  await expect(
    applyCommand(emptyState(), { ...admin, role: "coordinator" }, c),
  ).rejects.toThrow("관리자");
  expect(
    patientImportSchema.safeParse({
      rows: [{ ...row(), residentNumber: "800101-2000000" }],
    }).success,
  ).toBe(false);
  await expect(
    applyCommand(
      emptyState(),
      admin,
      command([row(), { ...row(2), name: "" }]),
    ),
  ).rejects.toThrow();
});
it("keeps directory outside workspace, pages/searches it, replays import safely, hydrates edits and consultations", async () => {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(q: string, ...args: any[]) {
      if (q.includes(";")) {
        db.exec(q);
        return { toArray: () => [] };
      }
      const rows = db.prepare(q).all(...args);
      return { toArray: () => rows };
    },
  };
  const ctx = {
    storage: { sql, transactionSync: (fn: () => unknown) => fn() },
  };
  const env = {
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    SETUP_KEY: "test-import",
    APP_ORIGIN: "https://test.example",
  };
  let clinic = new Clinic(ctx as any, env as any),
    token = "";
  const req = async (path: string, body?: any) => {
    const res = await clinic.fetch(
      new Request("https://test.example/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const data: any = await res.json();
    expect(res.status, JSON.stringify(data)).toBe(200);
    return data;
  };
  try {
    await req("/setup", {
      key: env.SETUP_KEY,
      username: "importtest",
      name: "테스트",
      password: "test-password-1234",
    });
    token = (
      await req("/login", {
        username: "importtest",
        password: "test-password-1234",
      })
    ).token;
    const batch = command(Array.from({ length: 35 }, (_, i) => row(i + 1)));
    await req("/commands", batch);
    expect((await req("/commands", batch)).replayed).toBe(true);
    expect((await req("/state?view=workspace")).state.patients).toHaveLength(0);
    const results = await req("/patients/search");
    expect(results.total).toBe(35);
    expect(results.rows).toHaveLength(30);
    expect((await req("/patients/search?page=1")).rows).toHaveLength(5);
    expect(
      (await req("/state?view=workspace&patientId=" + row().id)).state.patients,
    ).toHaveLength(1);
    await req("/commands", {
      id: crypto.randomUUID(),
      type: "patient.update",
      entityId: row().id,
      baseRev: 1,
      payload: {
        name: "수정시험",
        sex: "F",
        dob: "1980-01-01",
        phone: "01011112222",
        address: "퇴계동",
      },
    });
    expect(
      (await req("/patients/search?search=수정시험")).rows[0].p.addressRegion
        .neighborhood,
    ).toBe("퇴계동");
    await req("/commands", {
      id: crypto.randomUUID(),
      type: "consultation.create",
      entityId: "import-consult",
      payload: { patientId: row().id, category: "미용" },
    });
    expect((await req("/state?view=workspace")).state.patients).toHaveLength(1);
    const report = await req("/analytics?from=2026-01-01&to=2026-12-31");
    expect(report.patientDirectory).toMatchObject({ total: 35, imported: 35 });
    // Simulate DO eviction: encrypted storage reconstructs the complete directory.
    clinic = new Clinic(ctx as any, env as any);
    expect((await req("/patients/search")).total).toBe(35);
    const { defaultVipPolicy } = await import("../src/core/vipPoints");
    const policyState = (await req("/state?view=workspace")).state;
    await req("/commands", {
      id: crypto.randomUUID(),
      type: "vip.policy",
      baseRev: policyState.policies[0]?.rev,
      payload: { policy: { ...defaultVipPolicy, enabled: true } },
    });
    const vipImport = command([row(36)]);
    await req("/commands", vipImport);
    await req("/commands", vipImport);
    const withVip = (await req("/state?view=workspace")).state;
    expect(
      withVip.vipAccounts.filter((a: any) => a.patientId === row(36).id),
    ).toHaveLength(1);
    expect(
      withVip.pointEntries
        .filter(
          (e: any) => e.patientId === row(36).id && e.benefitKey === "welcome",
        )
        .map((e: any) => e.amount),
    ).toEqual([100000]);
  } finally {
    db.close();
  }
}, 30000);

it("uses imported cash totals for permanent VIP and welcome points, but starts annual spending at import", async () => {
  const {
    defaultVipPolicy,
    reconcileVip,
    annualCash,
    pointBalance,
    vipPeriod,
  } = await import("../src/core/vipPoints");
  const s = emptyState(),
    now = "2026-10-08T03:00:00.000Z";
  s.policies = [
    {
      id: "grades",
      rev: 1,
      createdAt: now,
      updatedAt: now,
      grades: [{ id: "vip", name: "VIP", minimum: 5000000, color: "#145d55" }],
      vip: {
        ...defaultVipPolicy,
        enabled: true,
        startedAt: "2026-10-01T03:00:00.000Z",
      },
    },
  ];
  const high = { ...row(), dob: "1980-12-01" },
    low = { ...row(2), external: { ...row(2).external, totalPaid: 4900000 } };
  const imported = await applyCommand(s, admin, command([high, low]), now);
  expect(imported.ledger).toHaveLength(0);
  expect(imported.vipAccounts).toHaveLength(1);
  expect(imported.vipAccounts[0].enrolledAt).toBe(now);
  expect(pointBalance(imported, high.id, now)).toBe(100000);
  const period = vipPeriod(imported.vipAccounts[0], now);
  expect(period).toEqual({ from: "2026-10-08", to: "2027-10-08" });
  expect(
    annualCash(imported, imported.vipAccounts[0], period.from, period.to, now),
  ).toBe(0);
  reconcileVip(imported, now, "another-operation");
  expect(pointBalance(imported, high.id, now)).toBe(100000);
  // A sub-threshold imported patient qualifies after new real receipts cross the threshold.
  imported.ledger.push({
    id: "new-receipt",
    rev: 1,
    createdAt: "2026-10-09T03:00:00.000Z",
    updatedAt: "2026-10-09T03:00:00.000Z",
    patientId: low.id,
    kind: "receipt",
    date: "2026-10-09",
    amount: 100000,
  } as any);
  reconcileVip(imported, "2026-10-09T04:00:00.000Z", "new-payment");
  expect(imported.vipAccounts).toHaveLength(2);
  expect(pointBalance(imported, low.id, "2026-10-09T04:00:00.000Z")).toBe(
    100000,
  );
});
