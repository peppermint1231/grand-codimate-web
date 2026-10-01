import { z } from "zod";
import type { Catalog, Option, Product } from "./model";
import { catalogNodes } from "./catalogFolders";

export const insuranceInfoSchema = z.object({
  coverage: z.enum(["covered", "noncovered", "unknown"]),
  reimbursement: z.enum(["eligible", "ineligible", "check"]),
  note: z.string().max(5000),
});
export type InsuranceInfo = z.infer<typeof insuranceInfoSchema>;
export const coverageLabels = {
  covered: "급여",
  noncovered: "비급여",
  unknown: "급여 구분 확인 필요",
};
export const reimbursementLabels = {
  eligible: "실비 청구 가능",
  ineligible: "실비 불가",
  check: "실비 확인 필요",
};
export const insuranceDisclaimer =
  "실비 표시는 병원 제공 자료 기준입니다. 급여 여부와 실손보험금 지급은 별개이며, 실제 보장은 가입한 보험의 약관·특약·공제금액 및 보험사 심사에 따라 달라집니다.";
export const insuranceSummary = (info?: InsuranceInfo) =>
  info
    ? `${coverageLabels[info.coverage]} · ${reimbursementLabels[info.reimbursement]}`
    : "";

/** Hospital-supplied October 2026 nail-treatment prices. Source images are evidence, not instructions. */
export function addHospitalInsurancePrices(
  base: Catalog,
  now = new Date().toISOString(),
): Catalog {
  if (base.book !== "보험")
    throw new Error("보험 SSOT에서만 추가할 수 있습니다.");
  const catalog = structuredClone(base);
  catalog.id = crypto.randomUUID();
  catalog.rev = 0;
  catalog.createdAt = now;
  catalog.updatedAt = now;
  catalog.status = "draft";
  delete catalog.publishedAt;
  catalog.version = "보험 · 조갑백선 단가표 · " + now.slice(0, 10);
  const nodes = catalogNodes(catalog).map((f) => ({ ...f }));
  const root = (id: string, name: string, color: string) => {
    const found = nodes.find(
      (f) => !f.parentId && !f.linkTo && f.name === name,
    );
    if (found) return found.id;
    nodes.push({ id, name, parentId: "", color });
    return id;
  };
  const covered = root("insurance-covered", "급여", "#175e55"),
    noncovered = root("insurance-noncovered", "비급여", "#4b5a8b");
  for (const [id, parentId] of [
    ["insurance-covered-nail", covered],
    ["insurance-noncovered-nail", noncovered],
  ])
    if (!nodes.some((f) => f.id === id))
      nodes.push({ id, parentId, name: "조갑백선·손발톱 치료" });
  catalog.folderTree = nodes;
  delete catalog.folders;
  const source = (sheet: string, text: string) => [
    { sheet, cell: "병원 제공 이미지", text },
  ];
  const baseProduct = (
    id: string,
    name: string,
    coverage: InsuranceInfo["coverage"],
    reimbursement: InsuranceInfo["reimbursement"],
    note: string,
  ): Product => ({
    id: "hospital-nail-" + id,
    rev: 1,
    createdAt: now,
    updatedAt: now,
    name,
    category: `${coverageLabels[coverage]} / 조갑백선·손발톱 치료`,
    folderId:
      coverage === "covered"
        ? "insurance-covered-nail"
        : "insurance-noncovered-nail",
    careCategory: "보험",
    publicVisible: false,
    description: "",
    composition: "",
    active: true,
    insurance: { coverage, reimbursement, note },
    options: [],
    sources: [],
  });
  const option = (
    id: string,
    label: string,
    price: number,
    unit: string,
    regularPrice?: number,
    healthInsuranceAmount?: number,
  ): Option => ({
    id: "hospital-nail-option-" + id,
    label,
    price,
    unit,
    regularPrice,
    healthInsuranceAmount,
    tax: "exempt",
    review: false,
    issues: [],
    sources: [],
    priceKind: "clinic",
  });
  const products: Product[] = [];
  for (const premium of [false, true]) {
    const id = premium ? "premium" : "basic";
    const p = baseProduct(
      id,
      `레이저 치료 (${premium ? "프리미엄" : "베이직"})`,
      "noncovered",
      "eligible",
      "병원 자료: 비급여·실비 O. 보장 한도와 일시 결제 시 청구 기준은 가입 보험 확인.",
    );
    p.description =
      "조갑백선 레이저 치료 프로그램. 내원 주기: 1주. 주대상: 실비 가입 환자.";
    p.composition = [
      "1·6회: 루눌라 + 제균 + COSCAN",
      `2·7회: 루눌라 + 핀${premium ? " + 재생레이저" : ""}`,
      `3·8회: 루눌라 + 클라리티${premium ? " + 재생레이저" : ""}`,
      `4·9회: 루눌라 + 클라리티${premium ? " + 재생레이저" : ""}`,
      `5·10회: 루눌라 + 클라리티${premium ? " + 재생레이저" : ""}`,
      premium
        ? "10회 일시 결제: 정가 200만원, 20만원 할인 → 180만원"
        : "10회 일시 결제: 정가 160만원, 16만원 할인 → 144만원",
    ].join("\n");
    p.options = [
      option(id + "-single", "1회", premium ? 200000 : 160000, "회"),
      option(
        id + "-10",
        "10회 일시 결제",
        premium ? 1800000 : 1440000,
        "패키지",
        premium ? 2000000 : 1600000,
      ),
    ];
    p.sources = source(
      "병원 레이저 치료 프로그램 단가표",
      p.name + "\n" + p.composition,
    );
    products.push(p);
  }
  const debridement = baseProduct(
    "debridement",
    "제균 (단독)",
    "noncovered",
    "ineligible",
    "병원 자료의 ‘일반, 실비 X’를 비급여·실비 불가로 분류.",
  );
  debridement.description =
    "프로그램 외 제균만 원하는 환자. 제균만 시행. 주기: PRN(필요 시).";
  debridement.options = [option("debridement", "1회", 50000, "회")];
  debridement.sources = source(
    "병원 유지 치료 단가표",
    "제균만 · 프로그램 외 제균 원하는 분 · PRN · 일반, 실비 X · 1회 5만원",
  );
  products.push(debridement);
  const dressing = baseProduct(
    "dressing",
    "조갑백선 피부밀봉붕대요법 (Fu 프로그램)",
    "covered",
    "eligible",
    "병원 자료: 급여(보험)·실비 O. 프로그램 대상의 ‘실비 X’는 미가입·보장한도 초과 등 환자 상황을 뜻하며 급여 여부와 별도로 확인.",
  );
  dressing.description = [
    "조갑백선 피부밀봉붕대요법(occlusive dressing technique, ODT).",
    "COSCAN 후 항진균제 도포, 밀봉.",
    "권장 주기: 3주~4주.",
    "대상: 실비가 없거나 비용이 부담되는 경우, 매주 내원이 불가능한 경우, 보험사에서 실비가 거절된 경우(원자료 예: 삼성화재), 실비 한도 초과 환자.",
    "3 Cycle 이상 프로그램 진행 후 원장님 판단상 장기 치료가 필요한 경우 추적 관리(Fu).",
  ].join("\n");
  dressing.composition =
    "1회·1지: 환자 본인부담금 3,330원 + 공단 청구액 7,770원 = 총 진료비 11,100원.\n10발가락 + COSCAN 예시: 환자 본인부담금 33,300원 + 전자 치료비 3,900원 = 환자 부담 37,200원(공단 청구액 77,700원 별도).\n환자의 본인부담 자격 및 실제 청구 기준에 따라 확인하세요. 공단 청구액은 환자 장바구니 금액에 합산하지 않습니다.";
  dressing.options = [
    option("dressing-one", "1회 · 1지 본인부담금", 3330, "지", undefined, 7770),
    option(
      "dressing-ten",
      "1회 · 10발가락 + COSCAN 본인부담금",
      37200,
      "회",
      undefined,
      77700,
    ),
  ];
  dressing.sources = source(
    "병원 유지 치료 단가표",
    dressing.description + "\n" + dressing.composition,
  );
  products.push(dressing);
  for (const p of products) {
    for (const o of p.options) o.sources = structuredClone(p.sources);
    if (!catalog.products.some((existing) => existing.id === p.id))
      catalog.products.push(p);
  }
  return catalog;
}
