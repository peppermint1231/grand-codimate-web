import { activeLedger, calculate } from "./domain";
import {
  age,
  catalogBook,
  type State,
  type Consultation,
  type Line,
} from "./model";
import { productFolderPaths } from "./catalogFolders";
export type AnalyticsFilter = {
  from: string;
  to: string;
  ownerId?: string;
  book?: string;
};
export type Performance = {
  id: string;
  name: string;
  consultations: number;
  success: number;
  failed: number;
  held: number;
  cancelled: number;
  contract: number;
  receipts: number;
  refunds: number;
  net: number;
  outstanding: number;
  discount: number;
  listPrice: number;
  conversion: number;
  average: number;
};
export type Strength = Performance & {
  ownerId: string;
  book: string;
  area: string;
};
export type Bucket = { name: string; count: number };
export type AnalyticsReport = {
  filter: AnalyticsFilter;
  financial: boolean;
  generatedAt: string;
  totals: Performance;
  employees: Performance[];
  strengths: Strength[];
  monthly: Performance[];
  patients: {
    registered: number;
    consulted: number;
    first: number;
    returning: number;
    revisitRate: number;
    meanLifetimeNet: number;
    ages: Bucket[];
    sexes: Bucket[];
    regions: Bucket[];
    sources: Bucket[];
    segments: Bucket[];
    grades: Bucket[];
    cohorts: {
      month: string;
      patients: number;
      eligible30: number;
      returned30: number;
      eligible90: number;
      returned90: number;
    }[];
  };
  products: {
    name: string;
    book: string;
    consultations: number;
    success: number;
    units: number;
    contract: number;
  }[];
  methods: { name: string; receipts: number; refunds: number; net: number }[];
  definitions: string[];
};
const dayMs = 86400000;
const koreanDateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
});
export const koreanDay = (value: string) =>
  value.length === 10 ? value : koreanDateFormat.format(new Date(value));
const dayNumber = (value: string) =>
  Date.parse(value.slice(0, 10) + "T00:00:00+09:00") / dayMs;
const row = (id: string, name: string): Performance => ({
  id,
  name,
  consultations: 0,
  success: 0,
  failed: 0,
  held: 0,
  cancelled: 0,
  contract: 0,
  receipts: 0,
  refunds: 0,
  net: 0,
  outstanding: 0,
  discount: 0,
  listPrice: 0,
  conversion: 0,
  average: 0,
});
export function allocateAmount(total: number, weights: number[]) {
  if (!weights.length) return [];
  const sum = weights.reduce((a, v) => a + Math.max(0, v), 0);
  const ratios = sum
    ? weights.map((w) => Math.max(0, w) / sum)
    : weights.map(() => 1 / weights.length);
  const amounts = ratios.map((r) => Math.floor(Math.abs(total) * r));
  const fractions = ratios
    .map((r, i) => ({ i, fraction: Math.abs(total) * r - amounts[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  const remainder = Math.abs(total) - amounts.reduce((a, v) => a + v, 0);
  for (let i = 0; i < remainder; i++)
    amounts[fractions[i % fractions.length].i]++;
  return amounts.map((v) => (total < 0 ? -v : v));
}
const moneyKeys = [
  "contract",
  "receipts",
  "refunds",
  "net",
  "outstanding",
  "discount",
  "listPrice",
  "average",
] as const;
function finish(r: Performance, financial: boolean) {
  r.net = r.receipts - r.refunds;
  r.conversion =
    r.success + r.failed ? (r.success / (r.success + r.failed)) * 100 : 0;
  r.average = r.success ? Math.round(r.contract / r.success) : 0;
  if (!financial) for (const k of moneyKeys) r[k] = 0;
}
export function buildAnalytics(
  s: State,
  filter: AnalyticsFilter,
  financial = true,
): AnalyticsReport {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(filter.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(filter.to) ||
    !Number.isFinite(dayNumber(filter.from)) ||
    !Number.isFinite(dayNumber(filter.to)) ||
    koreanDay(new Date(dayNumber(filter.from) * dayMs).toISOString()) !==
      filter.from ||
    koreanDay(new Date(dayNumber(filter.to) * dayMs).toISOString()) !==
      filter.to ||
    filter.from > filter.to ||
    dayNumber(filter.to) - dayNumber(filter.from) > 3660
  )
    throw new Error("조회 기간은 시작일 이후, 최대 10년 이내로 선택하세요.");
  const inPeriod = (d: string) => d >= filter.from && d <= filter.to;
  const beforeEnd = (d: string) => d <= filter.to;
  const employeeNames = new Map(s.users.map((u) => [u.id, u.name]));
  const employees = new Map<string, Performance>();
  const strengths = new Map<string, Strength>();
  const monthly = new Map<string, Performance>();
  for (
    let d = new Date(filter.from.slice(0, 7) + "-01T00:00:00Z");
    d.toISOString().slice(0, 7) <= filter.to.slice(0, 7);
    d.setUTCMonth(d.getUTCMonth() + 1)
  ) {
    const key = d.toISOString().slice(0, 7);
    monthly.set(key, row(key, key));
  }
  const totals = row("all", "전체");
  const getEmployee = (id: string) => {
    if (!employees.has(id))
      employees.set(id, row(id, employeeNames.get(id) || "미지정·퇴사 직원"));
    return employees.get(id)!;
  };
  const getMonth = (day: string) => {
    const key = day.slice(0, 7);
    if (!monthly.has(key)) monthly.set(key, row(key, key));
    return monthly.get(key)!;
  };
  const catalogs = new Map(
    s.catalogs.map((c) => [catalogBook(c) + "\0" + c.version, c]),
  );
  const items = (c: Consultation) =>
    c.quote.lines.length
      ? c.quote.lines.map((l) => {
          const book = l.book || c.category;
          const catalog = catalogs.get(
            book +
              "\0" +
              (l.catalogVersion ||
                c.catalogVersions?.[book] ||
                c.catalogVersion),
          );
          const product = catalog?.products.find((p) => p.id === l.productId);
          const area =
            l.categorySnapshot ||
            (catalog && product
              ? productFolderPaths(catalog, product)[0]?.[0]?.name ||
                product.category
              : "분류 미지정");
          let weight = 0;
          try {
            weight = calculate(
              [l],
              { kind: "amount", value: 0 },
              c.quote.vat,
            ).total;
          } catch {
            weight = Math.max(0, l.price * l.quantity);
          }
          return { line: l, book, area, weight };
        })
      : [
          {
            line: null as Line | null,
            book: c.category,
            area: "상품 미선택",
            weight: 1,
          },
        ];
  const selections = new Map(
    s.consultations.map((c) => {
      const all = items(c);
      return [
        c.id,
        {
          all,
          chosen: all
            .map((x, i) => ({ ...x, index: i }))
            .filter((x) => !filter.book || x.book === filter.book),
        },
      ] as const;
    }),
  );
  const matchesFilter = (c: Consultation) =>
    (!filter.ownerId || c.ownerId === filter.ownerId) &&
    !!selections.get(c.id)!.chosen.length;
  const eligible = (c: Consultation) =>
    c.kind !== "interim" && matchesFilter(c);
  const getStrength = (c: Consultation, book: string, area: string) => {
    const key = [c.ownerId, book, area].join("\0");
    if (!strengths.has(key))
      strengths.set(key, {
        ...row(key, (employeeNames.get(c.ownerId) || "미지정") + " · " + area),
        ownerId: c.ownerId,
        book,
        area,
      });
    return strengths.get(key)!;
  };
  const totalsFor = (c: Consultation, d: string) => [
    totals,
    getEmployee(c.ownerId),
    getMonth(d),
  ];
  const allocate = (c: Consultation, total: number) =>
    allocateAmount(
      total,
      selections.get(c.id)!.all.map((x) => x.weight),
    );
  const products = new Map<string, AnalyticsReport["products"][number]>();
  const active = activeLedger(s).filter((l) => beforeEnd(l.date));
  const balances = new Map<string, number>();
  const lifetimeNet = new Map<string, number>();
  const methods = new Map<string, AnalyticsReport["methods"][number]>();
  for (const l of active) {
    balances.set(
      l.consultationId,
      (balances.get(l.consultationId) || 0) +
        (l.kind === "receipt" ? l.amount : -l.amount),
    );
    lifetimeNet.set(
      l.patientId,
      (lifetimeNet.get(l.patientId) || 0) +
        (l.kind === "receipt" ? l.amount : -l.amount),
    );
  }
  for (const c of s.consultations.filter(eligible)) {
    const d = koreanDay(c.createdAt),
      selected = selections.get(c.id)!;
    if (c.status === "P" && !c.cancelled && beforeEnd(d)) {
      const allocations = allocate(
        c,
        Math.max(0, c.quote.total - (balances.get(c.id) || 0)),
      );
      const amount = selected.chosen.reduce(
        (n, x) => n + allocations[x.index],
        0,
      );
      totals.outstanding += amount;
      getEmployee(c.ownerId).outstanding += amount;
      for (const item of selected.chosen)
        getStrength(c, item.book, item.area).outstanding +=
          allocations[item.index];
    }
    if (!inPeriod(d)) continue;
    const targets = totalsFor(c, d);
    const areas = [
      ...new Map(
        selected.chosen.map((x) => [[x.book, x.area].join("\0"), x]),
      ).values(),
    ].map((x) => getStrength(c, x.book, x.area));
    for (const target of [...targets, ...areas]) {
      if (c.cancelled) {
        target.cancelled++;
        continue;
      }
      target.consultations++;
      if (c.status === "P") target.success++;
      else if (c.status === "F") target.failed++;
      else target.held++;
    }
    if (c.cancelled) continue;
    const allocations = allocate(c, c.quote.total),
      discounts = allocate(c, c.quote.discountTotal),
      list = allocate(c, c.quote.subtotal);
    if (c.status === "P") {
      for (const target of targets) {
        target.contract += selected.chosen.reduce(
          (n, x) => n + allocations[x.index],
          0,
        );
        target.discount += selected.chosen.reduce(
          (n, x) => n + discounts[x.index],
          0,
        );
        target.listPrice += selected.chosen.reduce(
          (n, x) => n + list[x.index],
          0,
        );
      }
      for (const x of selected.chosen) {
        const target = getStrength(c, x.book, x.area);
        target.contract += allocations[x.index];
        target.discount += discounts[x.index];
        target.listPrice += list[x.index];
      }
    }
    const seen = new Set<string>();
    for (const x of selected.chosen)
      if (x.line) {
        const key = x.book + "\0" + x.line.productId;
        let p = products.get(key);
        if (!p) {
          p = {
            name: x.line.name,
            book: x.book,
            consultations: 0,
            success: 0,
            units: 0,
            contract: 0,
          };
          products.set(key, p);
        }
        if (!seen.has(key)) {
          p.consultations++;
          if (c.status === "P") p.success++;
          seen.add(key);
        }
        if (c.status === "P") {
          p.units += x.line.quantity;
          p.contract += allocations[x.index];
        }
      }
  }
  const byConsultation = new Map(s.consultations.map((c) => [c.id, c]));
  for (const l of active) {
    const c = byConsultation.get(l.consultationId);
    if (!c || !matchesFilter(c) || !inPeriod(l.date)) continue;
    const values = allocate(c, l.amount),
      chosen = selections.get(c.id)!.chosen;
    const amount = chosen.reduce((n, x) => n + values[x.index], 0),
      key = l.kind === "receipt" ? "receipts" : "refunds";
    for (const target of totalsFor(c, l.date)) target[key] += amount;
    for (const x of chosen)
      getStrength(c, x.book, x.area)[key] += values[x.index];
    if (!methods.has(l.method))
      methods.set(l.method, {
        name: l.method,
        receipts: 0,
        refunds: 0,
        net: 0,
      });
    methods.get(l.method)![key] += amount;
  }
  for (const target of [
    totals,
    ...employees.values(),
    ...strengths.values(),
    ...monthly.values(),
  ])
    finish(target, financial);
  for (const m of methods.values()) {
    m.net = m.receipts - m.refunds;
    if (!financial) m.receipts = m.refunds = m.net = 0;
  }
  if (!financial) for (const p of products.values()) p.contract = 0;
  const consultationsByPatient = new Map<string, Consultation[]>();
  for (const c of s.consultations.filter(
    (c) => eligible(c) && !c.cancelled && beforeEnd(koreanDay(c.createdAt)),
  )) {
    if (!consultationsByPatient.has(c.patientId))
      consultationsByPatient.set(c.patientId, []);
    consultationsByPatient.get(c.patientId)!.push(c);
  }
  const buckets = (values: string[]): Bucket[] => {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    return [...counts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  };
  const patientList = s.patients.filter(
    (p) => !p.mergedInto && !p.archived && beforeEnd(koreanDay(p.createdAt)),
  );
  const consulted = patientList.filter((p) =>
    consultationsByPatient
      .get(p.id)
      ?.some((c) => inPeriod(koreanDay(c.createdAt))),
  );
  const firstDate = (id: string) =>
    (consultationsByPatient.get(id) || [])
      .map((c) => koreanDay(c.createdAt))
      .sort()[0];
  const first = consulted.filter((p) => inPeriod(firstDate(p.id))).length;
  const asOf = new Date(filter.to + "T12:00:00+09:00");
  const cohort = new Map<
    string,
    AnalyticsReport["patients"]["cohorts"][number]
  >();
  for (const p of consulted) {
    const first = firstDate(p.id);
    if (!inPeriod(first)) continue;
    const month = first.slice(0, 7);
    if (!cohort.has(month))
      cohort.set(month, {
        month,
        patients: 0,
        eligible30: 0,
        returned30: 0,
        eligible90: 0,
        returned90: 0,
      });
    const entry = cohort.get(month)!;
    entry.patients++;
    const dates = [
      ...new Set(
        (consultationsByPatient.get(p.id) || []).map((c) =>
          koreanDay(c.createdAt),
        ),
      ),
    ].sort();
    for (const days of [30, 90] as const)
      if (dayNumber(filter.to) - dayNumber(first) >= days) {
        entry[days === 30 ? "eligible30" : "eligible90"]++;
        if (
          dates.some(
            (d) => d > first && dayNumber(d) - dayNumber(first) <= days,
          )
        )
          entry[days === 30 ? "returned30" : "returned90"]++;
      }
  }
  const patients: AnalyticsReport["patients"] = {
    registered: patientList.filter(
      (p) =>
        inPeriod(koreanDay(p.createdAt)) &&
        (!filter.ownerId || p.ownerId === filter.ownerId),
    ).length,
    consulted: consulted.length,
    first,
    returning: consulted.length - first,
    revisitRate: consulted.length
      ? ((consulted.length - first) / consulted.length) * 100
      : 0,
    meanLifetimeNet:
      financial && consulted.length
        ? Math.round(
            consulted.reduce((n, p) => n + (lifetimeNet.get(p.id) || 0), 0) /
              consulted.length,
          )
        : 0,
    ages: buckets(
      consulted.map((p) => {
        const a = age(p.dob, asOf);
        return !p.dob || !Number.isFinite(a)
          ? "미입력"
          : a < 20
            ? "20세 미만"
            : a >= 70
              ? "70세 이상"
              : Math.floor(a / 10) * 10 + "대";
      }),
    ),
    sexes: buckets(
      consulted.map((p) =>
        p.sex === "F" ? "여성" : p.sex === "M" ? "남성" : "미입력",
      ),
    ),
    regions: buckets(
      consulted.map(
        (p) =>
          p.address.match(
            /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충청북|충남|충청남|전북|전라북|전남|전라남|경북|경상북|경남|경상남|제주)/,
          )?.[1] || "기타·미입력",
      ),
    ),
    sources: buckets(
      consulted.map((p) => p.acquisitionSource?.trim() || "미입력"),
    ),
    grades: buckets(
      consulted.map((p) =>
        p.gradeOverride
          ? s.policies
              .flatMap((x) => x.grades)
              .find((g) => g.id === p.gradeOverride!.gradeId)?.name || "미분류"
          : financial
            ? [...s.policies.flatMap((x) => x.grades)]
                .sort((a, b) => b.minimum - a.minimum)
                .find((g) => (lifetimeNet.get(p.id) || 0) >= g.minimum)?.name ||
              "미분류"
            : "금액 열람 필요",
      ),
    ),
    segments: buckets(
      patientList
        .filter((p) => !!consultationsByPatient.get(p.id)?.length)
        .map((p) => {
          const last = (consultationsByPatient.get(p.id) || [])
            .map((c) => koreanDay(c.createdAt))
            .sort()
            .at(-1)!;
          const days = dayNumber(filter.to) - dayNumber(last);
          return days >= 180
            ? "180일 이상 미상담"
            : days >= 90
              ? "90~179일 미상담"
              : days >= 30
                ? "30~89일 미상담"
                : "최근 30일 상담";
        }),
    ),
    cohorts: [...cohort.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
  };
  return {
    filter,
    financial,
    generatedAt: new Date().toISOString(),
    totals,
    employees: [...employees.values()].sort(
      (a, b) => b.net - a.net || b.success - a.success,
    ),
    strengths: [...strengths.values()].sort(
      (a, b) => b.net - a.net || b.success - a.success,
    ),
    monthly: [...monthly.values()].sort((a, b) => a.id.localeCompare(b.id)),
    patients,
    products: [...products.values()].sort(
      (a, b) => b.contract - a.contract || b.consultations - a.consultations,
    ),
    methods: [...methods.values()],
    definitions: [
      "상담·계약은 상담 작성일(한국시간) 기준이며 취소·중간상담을 제외합니다. 현재 상태를 집계하므로 과거 기간도 이후 결과 변경에 따라 달라질 수 있습니다.",
      "전환율 = 성공 ÷ (성공+실패). 보류를 제외하며, 같은 상담에 여러 분야가 있으면 분야별 상담 수의 합은 전체보다 클 수 있습니다.",
      "수납·환불은 처리일 기준, 정정 취소된 금액 기록은 제외합니다. 담당 상담자에게 귀속하며 결제 입력 직원의 매출로 계산하지 않습니다.",
      "분야별 금액은 상담 견적 항목의 금액 비율로 배분한 추정치입니다. 원 단위 잔여분을 배분하여 합계를 보존합니다. 미수금은 조회 종료일 기준 현재 유효 계약 잔액입니다.",
      "신규/재상담은 선택한 직원·단가표 범위에서 첫 상담이 조회 기간 안/이전인지로 구분합니다. 기간 내 여러 번 상담해도 신규 환자는 신규로만 셉니다. 실제 내원 여부와 다릅니다. 30·90일 재상담률은 해당 관찰기간이 지난 신규 환자만 분모에 포함합니다.",
      "환자 연령은 조회 종료일 기준, 유입경로는 등록된 값만 사용합니다. 미입력 경로를 추측하지 않습니다. 마케팅 발송 동의 여부는 별도 확인이 필요합니다.",
      "누적 실수납 평균은 조회 환자의 종료일 이전 전체 수납−환불입니다. 여러 분야가 선택된 상담은 선택 분야만 금액을 배분하지만 환자 수는 중복 제거합니다.",
    ],
  };
}
export type IncentiveSettings = {
  basis: "net" | "receipts" | "contract";
  defaultRate: number;
  floorZero: boolean;
  rates: Record<string, number>;
};
export function incentiveRows(
  report: AnalyticsReport,
  settings: IncentiveSettings,
) {
  const rate = (v: number) =>
    Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  return report.strengths.map((s) => {
    const percent = rate(settings.rates[s.id] ?? settings.defaultRate);
    const base = s[settings.basis];
    return {
      employee: s.name,
      ownerId: s.ownerId,
      book: s.book,
      area: s.area,
      basis: base,
      rate: percent,
      amount: report.financial
        ? Math.round(
            ((settings.floorZero ? Math.max(0, base) : base) * percent) / 100,
          )
        : 0,
    };
  });
}
export function analyticsPrompt(
  report: AnalyticsReport,
  purpose: "employee" | "patient",
  question: string,
  settings: IncentiveSettings,
) {
  const suppress = (rows: Bucket[]) =>
    rows.map((r) => ({
      name: r.name,
      count: r.count < 5 ? "5명 미만" : r.count,
    }));
  const aliases = new Map(
    report.employees.map((e, i) => [e.id, "직원 " + (i + 1)]),
  );
  const data =
    purpose === "employee"
      ? {
          totals: report.totals,
          employees: report.employees.map(({ id, name, ...e }) => ({
            ...e,
            name: aliases.get(id),
          })),
          strengths: report.strengths
            .filter((s) => s.consultations >= 5)
            .map(({ id, ownerId, name, ...s }) => ({
              ...s,
              employee: aliases.get(ownerId),
            })),
          incentive: incentiveRows(report, settings).map(
            ({ employee, ownerId, ...v }) => ({
              ...v,
              employee: aliases.get(ownerId),
            }),
          ),
        }
      : {
          ...report.patients,
          ages: suppress(report.patients.ages),
          sexes: suppress(report.patients.sexes),
          regions: suppress(report.patients.regions),
          sources: suppress(
            report.patients.sources.map((r) => ({
              ...r,
              name: [
                "검색",
                "홈페이지",
                "SNS",
                "지인 소개",
                "병원 인근",
                "기존 환자",
                "광고",
                "미입력",
              ].includes(r.name)
                ? r.name
                : "기타 경로",
            })),
          ),
          grades: suppress(report.patients.grades),
          cohorts: report.patients.cohorts.filter((c) => c.patients >= 5),
        };
  return `당신은 병원 운영 통계 분석가입니다. 아래 자료는 ${report.filter.from}~${report.filter.to} 집계입니다.\n목적: ${purpose === "employee" ? "직원별 강점·교육·인센티브 검토" : "환자 재상담·유입경로·마케팅 개선"}\n추가 질문: ${question.trim() || "주요 변화와 실행 가능한 개선안을 제시해주세요."}\n\n분석 규칙: 관측 사실과 가설을 구분하세요. 작은 표본/관찰기간 차이를 명시하고, 인과관계·광고 성과를 단정하지 마세요. 인센티브는 설정 기반 예상치이며 확정 급여가 아닙니다. 미입력 항목을 추정으로 채우지 마세요. 개인 신원을 추론하지 마세요. 금액 열람 권한: ${report.financial ? "있음" : "없음, 0 금액은 비공개 처리값이므로 분석 금지"}.\n집계 기준:\n${report.definitions.join("\n")}\n\n집계 데이터:\n${JSON.stringify(data, null, 2)}\n\n출력: ① 핵심 지표 ② 강점/문제와 근거 수치 ③ 추가 확인할 데이터 ④ 우선순위별 실행안과 검증 지표. 개인정보 또는 환자별 진단은 요청하지 마세요.`;
}
