import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { DatabaseSync } from "node:sqlite";
import {
  acquisitionSourceLabel,
  acquisitionSourceLabels,
  acquisitionSourceSummary,
} from "../src/core/acquisitionSource";
import { PatientMarketing } from "../server/patientMarketing";
import { buildAnalytics } from "../src/core/analytics";
import { analyticsWorkbook } from "../src/core/analyticsExcel";
import { emptyQuote, emptyState } from "../src/core/model";

it("combines whitespace variants and requested aliases while keeping reservations and blogs separate", () => {
  for (const source of [
    "네이버 검색광고",
    "네이버검색광고",
    " 네이버\u00a0플레이스 ",
    "네이버플레이스",
    "네이버\u200b검색",
  ])
    expect(acquisitionSourceLabel(source)).toBe("네이버 검색");
  expect(acquisitionSourceLabel("기존 환자")).toBe("재방문");
  expect(acquisitionSourceLabel("지인소개")).toBe("지인 소개");
  expect(acquisitionSourceLabel("네이버예약")).toBe("네이버 예약");
  expect(acquisitionSourceLabel("네이버블로그")).toBe("네이버 블로그");
  expect(acquisitionSourceLabel("기타 매체")).toBe(
    acquisitionSourceLabel("기타매체"),
  );
  expect(acquisitionSourceLabel(" \t")).toBe("미입력");
  expect(acquisitionSourceLabel("확인필요")).toBe("확인 필요");
  expect(acquisitionSourceLabel("네이버플레이스, 네이버검색광고")).toBe(
    "네이버 검색",
  );
  const combination = acquisitionSourceLabel("네이버검색광고, 기타");
  expect(combination).toBe(acquisitionSourceLabel("기타, 네이버 플레이스"));
  expect(acquisitionSourceLabel(combination)).toBe(combination);
});

it("merges existing persisted aggregates without rewriting inputs, rescanning patients or changing totals", () => {
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
  const m = new PatientMarketing(sql as any);
  const inputs: [string, number][] = [
    ["재방문", 254],
    ["기타", 242],
    ["네이버 검색광고", 107],
    ["네이버 예약", 107],
    ["지인 소개", 96],
    ["현장방문", 76],
    ["네이버 블로그", 30],
    ["네이버검색광고", 27],
    ["네이버예약", 27],
    ["네이버 플레이스", 26],
    ["지인소개", 23],
    ["네이버플레이스", 15],
    ["네이버블로그", 9],
    ["인스타그램", 9],
    ["기존 환자", 3],
    ["미입력", 20000],
  ];
  for (const [label, n] of inputs)
    db.prepare(
      "INSERT INTO patient_marketing_totals VALUES(2,'source',?,?,0)",
    ).run(label, n);
  const total = inputs.reduce((n, [, v]) => n + v, 0);
  db.prepare(
    "INSERT INTO patient_marketing_totals VALUES(2,'all','',?,1234)",
  ).run(total);
  const before = JSON.stringify(
    db.prepare("SELECT * FROM patient_marketing_totals").all(),
  );
  const r = m.report(["vegas"], true),
    counts = Object.fromEntries(r.sources.map((x) => [x.name, x.count]));
  expect(counts).toMatchObject({
    "네이버 검색": 175,
    "네이버 예약": 134,
    "네이버 블로그": 39,
    "지인 소개": 119,
    재방문: 257,
    미입력: 20000,
  });
  expect(r.sources.reduce((n, x) => n + x.count, 0)).toBe(total);
  expect(r).toMatchObject({ total, revenue: 1234 });
  expect(m.report(["codimate"], true).total).toBe(0);
  expect(
    JSON.stringify(db.prepare("SELECT * FROM patient_marketing_totals").all()),
  ).toBe(before);
  db.close();
});

it("uses one grouping for consultation statistics, demographic conversions and exported rows", async () => {
  const s = emptyState();
  const base = {
    rev: 1,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
  s.patients = ["네이버검색광고", "네이버 플레이스"].map(
    (acquisitionSource, i) => ({
      ...base,
      id: "p" + i,
      name: "환자" + i,
      phone: "0101111000" + i,
      dob: "1990-01-01",
      sex: "F",
      address: "후평동",
      ownerId: "staff",
      acquisitionSource,
    }),
  );
  s.consultations = s.patients.map((p, i) => ({
    ...base,
    id: "c" + i,
    patientId: p.id,
    patient: p,
    ownerId: "staff",
    kind: "first",
    category: "미용",
    status: i ? "F" : "P",
    catalogVersion: "",
    quote: { ...emptyQuote(), total: 100 },
    photos: [],
    memo: "",
    appointment: "",
    attendance: "미정",
  })) as any;
  const before = JSON.stringify(s.patients);
  const r = buildAnalytics(s, { from: "2026-10-01", to: "2026-10-31" });
  expect(r.patients.sources).toEqual([{ name: "네이버 검색", count: 2 }]);
  expect(r.marketing.filter((x) => x.dimension === "source")).toMatchObject([
    {
      name: "네이버 검색",
      patients: 2,
      consultations: 2,
      success: 1,
      failed: 1,
      conversion: 50,
      contract: 100,
    },
  ]);
  const blob = await analyticsWorkbook(r, "patient", {
    basis: "net",
    defaultRate: 3,
    floorZero: true,
    rates: {},
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  expect(wb.getWorksheet("유입경로")?.getCell("A4").value).toBe("네이버 검색");
  expect(wb.getWorksheet("연령 성별 유입경로")?.getCell("C4").value).toBe(
    "네이버 검색",
  );
  expect(JSON.stringify(s.patients)).toBe(before);
});

it("counts every selected channel once per respondent, maps none/Kakao, and preserves respondent and revenue totals", () => {
  const summary = acquisitionSourceSummary([
    { name: "기타 · 네이버 검색", count: 1 },
    { name: "네이버 검색광고,네이버 플레이스,네이버 예약", count: 1 },
    { name: "네이버 블로그 · 지인 소개", count: 1 },
    { name: "네이버 예약 · 지인 소개", count: 1 },
    { name: "없음", count: 2 },
    { name: "카카오", count: 2 },
    { name: "AI챗봇(Chatgpt등)", count: 2 },
    { name: "미입력", count: 20 },
  ]);
  expect(summary.respondents).toBe(10);
  const counts = Object.fromEntries(summary.rows.map((r) => [r.name, r.count]));
  expect(counts).toEqual({
    기타: 3,
    "네이버 검색": 2,
    "네이버 예약": 2,
    "네이버 블로그": 1,
    "지인 소개": 2,
    "현장 방문": 2,
    "AI챗봇(Chatgpt등)": 2,
    미입력: 20,
  });
  expect(acquisitionSourceLabels("카카오,기타")).toEqual(["기타"]);
  expect(acquisitionSourceLabels("미입력,네이버 예약")).toEqual([
    "네이버 예약",
  ]);
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(q: string, ...args: any[]) {
      if (q.includes(";")) {
        db.exec(q);
        return { toArray: () => [] };
      }
      return { toArray: () => db.prepare(q).all(...args) };
    },
  };
  const m = new PatientMarketing(sql as any);
  db.prepare(
    "INSERT INTO patient_marketing_totals VALUES(2,'all','',3,6000)",
  ).run();
  db.prepare(
    "INSERT INTO patient_marketing_totals VALUES(2,'source','네이버 플레이스,네이버 검색광고,기타',2,0)",
  ).run();
  db.prepare(
    "INSERT INTO patient_marketing_totals VALUES(2,'source','미입력',1,0)",
  ).run();
  const before = JSON.stringify(
    db.prepare("SELECT * FROM patient_marketing_totals").all(),
  );
  expect(m.report(["vegas"], true)).toMatchObject({
    total: 3,
    revenue: 6000,
    sourceRespondents: 2,
    sources: expect.arrayContaining([
      { name: "네이버 검색", count: 2 },
      { name: "기타", count: 2 },
      { name: "미입력", count: 1 },
    ]),
  });
  expect(
    JSON.stringify(db.prepare("SELECT * FROM patient_marketing_totals").all()),
  ).toBe(before);
  db.close();
});

it("splits consultation and demographic channels while keeping overall money and unique patient totals unchanged", async () => {
  const s = emptyState();
  const base = {
    rev: 1,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
  s.patients = ["네이버 검색광고,네이버 플레이스,네이버 예약", "카카오"].map(
    (acquisitionSource, i) => ({
      ...base,
      id: "multi" + i,
      name: "집계시험" + i,
      phone: "0101111111" + i,
      dob: "1990-01-01",
      sex: "F",
      address: "석사동",
      ownerId: "staff",
      acquisitionSource,
    }),
  );
  s.consultations = s.patients.map((p, i) => ({
    ...base,
    id: "mc" + i,
    patientId: p.id,
    patient: p,
    ownerId: "staff",
    kind: "first",
    category: "미용",
    status: "P",
    catalogVersion: "",
    quote: { ...emptyQuote(), total: 100 },
    photos: [],
    memo: "",
    appointment: "",
    attendance: "미정",
  })) as any;
  const f = { from: "2026-10-01", to: "2026-10-31" };
  const before = buildAnalytics(s, f);
  s.patients[0].acquisitionSource = "네이버 검색";
  const single = buildAnalytics(s, f);
  expect(before.totals).toEqual(single.totals);
  expect(before.patients.consulted).toBe(2);
  expect(before.patients.sourceRespondents).toBe(2);
  expect(before.patients.sources).toHaveLength(3);
  const names = before.marketing.filter((r) => r.dimension === "source");
  expect(names.map((r) => r.name).sort()).toEqual(
    ["기타", "네이버 검색", "네이버 예약"].sort(),
  );
  for (const row of names)
    expect(row).toMatchObject({
      patients: 1,
      consultations: 1,
      contract: 100,
      conversion: 100,
    });
  const blob = await analyticsWorkbook(before, "patient", {
    basis: "net",
    defaultRate: 3,
    floorZero: true,
    rates: {},
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  expect(wb.getWorksheet("유입경로")!.getCell("B3").value).toBe(
    "환자 수 · 복수 선택",
  );
  const labels: string[] = [];
  wb.getWorksheet("유입경로")!.eachRow((row, i) => {
    if (i > 3) labels.push(String(row.getCell(1).value));
  });
  expect(labels.sort()).toEqual(["기타", "네이버 검색", "네이버 예약"].sort());
});
