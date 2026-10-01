import type { Catalog, Option, Product } from "./model";
import { catalogNodes } from "./catalogFolders";

/** Prices supplied by the hospital. VAT and package interpretation are explicit inputs. */
export function expandHospitalInsurancePrices(
  base: Catalog,
  policy: { tax: Option["tax"]; zosterPerVisit: boolean },
  now = new Date().toISOString(),
): Catalog {
  if (base.book !== "보험")
    throw new Error("보험 SSOT에서만 추가할 수 있습니다.");
  const c = structuredClone(base);
  c.id = crypto.randomUUID();
  c.rev = 0;
  c.createdAt = c.updatedAt = now;
  c.status = "draft";
  delete c.publishedAt;
  c.version = "보험 · IVNT·초음파·MD·한발 레이저 · " + now.slice(0, 10);
  const nodes = catalogNodes(c).map((f) => ({ ...f }));
  let root = nodes.find((f) => !f.parentId && !f.linkTo && f.name === "비급여");
  if (!root) {
    root = {
      id: "insurance-noncovered",
      name: "비급여",
      parentId: "",
      color: "#4b5a8b",
    };
    nodes.push(root);
  }
  const folder = (key: string, name: string) => {
    const existing = nodes.find(
      (f) => f.parentId === root!.id && !f.linkTo && f.name === name,
    );
    if (existing) return existing.id;
    const id = "insurance-noncovered-" + key;
    if (!nodes.some((f) => f.id === id))
      nodes.push({ id, parentId: root!.id, name });
    return id;
  };
  const ivntFolder = folder("ivnt", "보험 IVNT"),
    ultrasoundFolder = folder("ultrasound", "초음파 진단"),
    mdFolder = folder("md", "MD크림·로션");
  c.folderTree = nodes;
  delete c.folders;
  const source = (text: string) => [
    { sheet: "병원 추가 단가표", cell: "2026-10-01 사용자 제공", text },
  ];
  const option = (
    id: string,
    label: string,
    price: number,
    unit: string,
    regularPrice?: number,
  ): Option => ({
    id: "hospital-insurance-option-" + id,
    label,
    price,
    unit,
    regularPrice,
    tax: policy.tax,
    review: policy.tax === "unknown",
    issues: policy.tax === "unknown" ? ["부가세 확인 필요"] : [],
    sources: source(`${label}: ${price.toLocaleString("ko-KR")}원`),
    priceKind: "clinic",
  });
  const add = (
    key: string,
    name: string,
    folderId: string,
    folderName: string,
    options: Option[],
    composition = "",
  ) => {
    const id = "hospital-insurance-" + key;
    if (c.products.some((p) => p.id === id)) return;
    const p: Product = {
      id,
      rev: 1,
      createdAt: now,
      updatedAt: now,
      name,
      folderId,
      category: "비급여 / " + folderName,
      description: composition,
      composition,
      careCategory: "보험",
      publicVisible: false,
      active: policy.tax !== "unknown",
      insurance: {
        coverage: "noncovered",
        reimbursement: "eligible",
        note: "병원 제공 단가표: 비급여·실비 가능. 실제 보장은 가입 보험의 약관·공제금액 및 보험사 심사에 따라 확인.",
      },
      options,
      sources: source(name + "\n" + composition),
    };
    c.products.push(p);
  };
  for (const [key, name, prices] of [
    ["ivnt-skin", "두드러기·가려움·피부염·구순염 수액", [105000, 94500, 89250]],
    ["ivnt-zoster", "대상포진 수액", [95000, 85500, 80750]],
  ] as const) {
    const perVisit = key === "ivnt-skin" || policy.zosterPerVisit;
    const options = [1, 6, 10].map((count, i) => {
      const total = prices[i] * (perVisit ? count : 1);
      return option(
        `${key}-${count}`,
        count === 1 ? "1회" : `${count}회 패키지`,
        total,
        count === 1 ? "회" : "패키지",
        count > 1 && perVisit ? prices[0] * count : undefined,
      );
    });
    add(
      key,
      name,
      ivntFolder,
      "보험 IVNT",
      options,
      perVisit
        ? `1회: ${prices[0].toLocaleString("ko-KR")}원\n6회 패키지: 회당 ${prices[1].toLocaleString("ko-KR")}원 · 총 ${(prices[1] * 6).toLocaleString("ko-KR")}원\n10회 패키지: 회당 ${prices[2].toLocaleString("ko-KR")}원 · 총 ${(prices[2] * 10).toLocaleString("ko-KR")}원\n장바구니 수량 1은 해당 횟수의 전체 금액입니다.`
        : "6회·10회 가격은 해당 묶음의 전체 금액입니다.",
    );
  }
  add(
    "ultrasound",
    "내성발톱·양성종양 제거 초음파 진단",
    ultrasoundFolder,
    "초음파 진단",
    [option("ultrasound", "1회", 80000, "회")],
  );
  for (const [key, name, size, price] of [
    ["dexeryl", "덱세릴MD크림", "500g", 90000],
    ["easydew-cream", "이지듀MD크림", "85g", 40000],
    ["easydew-lotion", "이지듀MD로션", "200g", 48000],
  ] as const)
    add(key, name, mdFolder, "MD크림·로션", [option(key, size, price, "개")]);
  for (const [key, label, price] of [
    ["basic", "베이직", 720000],
    ["premium", "프리미엄", 900000],
  ] as const) {
    const p = c.products.find((p) => p.id === "hospital-nail-" + key);
    if (!p)
      throw new Error("기존 발톱무좀 레이저 상품을 찾지 못했습니다: " + label);
    p.name = `발톱무좀 레이저 치료 (${label})`;
    for (const o of p.options)
      if (
        o.id === `hospital-nail-option-${key}-single` ||
        o.id === `hospital-nail-option-${key}-10`
      ) {
        if (!o.label.includes("양발")) o.label = "양발 · " + o.label;
      }
    const id = `hospital-nail-option-${key}-one-foot-10`;
    if (!p.options.some((o) => o.id === id)) {
      p.options.push({
        ...option(
          `${key}-one-foot-10`,
          "한발 · 10회 일시 결제",
          price,
          "패키지",
        ),
        id,
      });
      p.rev++;
      p.updatedAt = now;
      p.composition += `\n양발 10회: ${label === "베이직" ? "1,440,000" : "1,800,000"}원 / 한발 10회: ${price.toLocaleString("ko-KR")}원.`;
    }
  }
  const debridement = c.products.find(
    (p) => p.id === "hospital-nail-debridement",
  );
  if (!debridement)
    throw new Error("기존 발톱무좀 제균 상품을 찾지 못했습니다.");
  if (debridement.name !== "발톱무좀 제균") {
    debridement.name = "발톱무좀 제균";
    debridement.rev++;
    debridement.updatedAt = now;
  }
  for (const o of debridement.options) {
    o.tax = policy.tax;
    o.review = policy.tax === "unknown";
  }
  return c;
}
