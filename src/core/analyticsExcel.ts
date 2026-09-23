import ExcelJS from "exceljs";
import {
  incentiveRows,
  type AnalyticsReport,
  type IncentiveSettings,
  type Performance,
} from "./analytics";
export async function analyticsWorkbook(
  report: AnalyticsReport,
  purpose: "employee" | "patient",
  settings: IncentiveSettings,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "코디메이트";
  wb.created = new Date(report.generatedAt);
  const sheet = (
    name: string,
    headers: string[],
    rows: (string | number | null)[][],
    currency: number[] = [],
  ) => {
    const ws = wb.addWorksheet(name);
    ws.addRow([
      `코디메이트 · ${name}`,
      `${report.filter.from} ~ ${report.filter.to}`,
    ]);
    ws.addRow([
      `직원: ${report.filter.ownerId || "전체"} / 구분: ${report.filter.book || "전체"} / 금액 열람: ${report.financial ? "가능" : "제한"}`,
    ]);
    ws.addRow(headers);
    ws.views = [{ state: "frozen", ySplit: 3, xSplit: 1 }];
    ws.columns = headers.map((h, i) => ({
      width: i === 0 ? 30 : Math.max(16, h.length * 2),
    }));
    for (const values of rows) ws.addRow(values);
    ws.getRow(3).eachCell((c) => {
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "145D55" },
      };
      c.font = { color: { argb: "FFFFFF" }, bold: true };
    });
    ws.eachRow((r, index) => {
      r.alignment = { vertical: "middle", wrapText: true };
      if (index > 3) {
        r.height = 28;
        r.eachCell((c) => {
          c.font = { name: "맑은 고딕", size: 11 };
          if (index % 2 === 0)
            c.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "F0F6F3" },
            };
        });
        for (const i of currency.filter((i) => i <= headers.length))
          r.getCell(i).numFmt = '#,##0"원"';
      }
    });
    ws.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: Math.max(3, ws.rowCount), column: headers.length },
    };
    ws.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:3",
    };
    return ws;
  };
  const performance = (rows: Performance[]) =>
    rows.map((r) => [
      r.name,
      r.consultations,
      r.success,
      r.failed,
      r.held,
      Math.round(r.conversion * 10) / 10,
      ...(report.financial
        ? [
            r.contract,
            r.receipts,
            r.refunds,
            r.net,
            r.outstanding,
            r.discount,
            r.average,
          ]
        : []),
    ]);
  const headers = [
    "직원/기간",
    "상담",
    "성공",
    "실패",
    "보류",
    "전환율(%)",
    ...(report.financial
      ? ["계약", "수납", "환불", "실수납", "미수", "할인", "평균 계약"]
      : []),
  ];
  if (purpose === "employee") {
    sheet(
      "직원 성과",
      headers,
      performance(report.employees),
      [7, 8, 9, 10, 11, 12, 13],
    );
    sheet(
      "직원 분야별",
      ["직원", "구분", "분야", ...headers.slice(1)],
      report.strengths.map((r) => [
        report.employees.find((e) => e.id === r.ownerId)?.name || r.ownerId,
        r.book,
        r.area,
        ...performance([r])[0].slice(1),
      ]),
      [9, 10, 11, 12, 13, 14, 15],
    );
    if (report.financial)
      sheet(
        "인센티브 시뮬레이션",
        ["직원·분야", "구분", "기준금액", "지급률(%)", "예상액"],
        incentiveRows(report, settings).map((r) => [
          r.employee,
          r.book,
          r.basis,
          r.rate,
          r.amount,
        ]),
        [3, 5],
      );
    sheet(
      "월별 추이",
      headers,
      performance(report.monthly),
      [7, 8, 9, 10, 11, 12, 13],
    );
    if (report.financial)
      sheet(
        "결제 방법",
        ["방법", "수납", "환불", "실수납"],
        report.methods.map((r) => [r.name, r.receipts, r.refunds, r.net]),
        [2, 3, 4],
      );
  } else {
    sheet(
      "환자 요약",
      ["지표", "값"],
      [
        ["조회 환자", report.patients.consulted],
        ["신규 상담 환자", report.patients.first],
        ["재상담 환자", report.patients.returning],
        ["재상담 비중(%)", report.patients.revisitRate],
        ["기간 내 등록", report.patients.registered],
        ...(report.financial
          ? [
              [
                "조회 환자 누적 실수납 평균",
                report.patients.meanLifetimeNet,
              ] as [string, number],
            ]
          : []),
      ],
    );
    for (const [title, key] of [
      ["연령대", "ages"],
      ["성별", "sexes"],
      ["지역", "regions"],
      ["유입경로", "sources"],
      ["재상담 관리", "segments"],
      ["등급", "grades"],
    ] as const)
      sheet(
        title,
        ["분류", "환자 수"],
        report.patients[key].map((r) => [r.name, r.count]),
      );
    sheet(
      "재상담 코호트",
      [
        "첫 상담 월",
        "신규 환자",
        "30일 관찰 완료",
        "30일 내 재상담",
        "30일 재상담률(%)",
        "90일 관찰 완료",
        "90일 내 재상담",
        "90일 재상담률(%)",
      ],
      report.patients.cohorts.map((c) => [
        c.month,
        c.patients,
        c.eligible30,
        c.returned30,
        c.eligible30
          ? Math.round((c.returned30 / c.eligible30) * 1000) / 10
          : null,
        c.eligible90,
        c.returned90,
        c.eligible90
          ? Math.round((c.returned90 / c.eligible90) * 1000) / 10
          : null,
      ]),
    );
    sheet(
      "상품 관심과 전환",
      [
        "상품",
        "구분",
        "선택 상담",
        "성공 상담",
        "판매 수량",
        ...(report.financial ? ["배분 계약"] : []),
      ],
      report.products.map((r) => [
        r.name,
        r.book,
        r.consultations,
        r.success,
        r.units,
        ...(report.financial ? [r.contract] : []),
      ]),
      [6],
    );
  }
  sheet(
    "집계 기준",
    ["항목", "설명"],
    report.definitions
      .map((s, i) => [i + 1, s])
      .concat([
        [8, "인센티브는 지급 확정 자료가 아닌 설정 기반 시뮬레이션입니다."],
        [
          9,
          `기준 ${settings.basis}, 기본 지급률 ${settings.defaultRate}%, 음수 하한 ${settings.floorZero ? "0원" : "허용"}`,
        ],
      ]),
  );
  return new Blob([(await wb.xlsx.writeBuffer()) as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
