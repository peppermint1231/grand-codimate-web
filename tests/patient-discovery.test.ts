import { expect, it } from "vitest";
import {
  patientConcerns,
  patientMatches,
  recommendedProducts,
} from "../src/core/patientDiscovery";
import { publicProducts } from "../src/core/discovery";
import { emptyState } from "../src/core/model";
import { threeCatalogs } from "./fixtures/catalogs";
const product = (name: string, description = "", composition = "") => ({
  ...threeCatalogs()[0].products[0],
  name,
  description,
  composition,
});
it("uses patient concerns instead of book and merchandising folders", () => {
  expect(patientConcerns.length).toBeGreaterThan(13);
  expect(new Set(patientConcerns.map((c) => c.id)).size).toBe(
    patientConcerns.length,
  );
  expect(patientConcerns.map((c) => c.name).join("|")).not.toMatch(
    /IVNT|닥터플랜|멤버|미분류|검토|^관리$|급여|홈페이지|보험/,
  );
  expect(
    patientConcerns
      .find((c) => c.id === "patient:pigment")
      ?.questions.map((q) => q.id),
  ).toContain("spots");
});
it("classifies packages and care by stated indications, never by a merchandising name alone", () => {
  for (const folder of [
    "IVNT",
    "닥터플랜",
    "그랜드멤버쉽",
    "미분류·검토 필요",
    "관리",
  ]) {
    expect(
      patientMatches(product("피부염 수액"), [[{ name: folder }]]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          concernId: "patient:medical",
          answerIds: expect.arrayContaining(["itch-dermatitis"]),
        }),
      ]),
    );
    expect(
      patientMatches(product("닥터플랜 리팟 흑자제거"), [[{ name: folder }]]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          concernId: "patient:pigment",
          answerIds: expect.arrayContaining(["spots"]),
        }),
      ]),
    );
  }
  expect(
    patientMatches(product("그랜드멤버쉽 GOLD"), [[{ name: "그랜드멤버쉽" }]]),
  ).toEqual([]);
  expect(
    patientMatches(product("그랜드멤버쉽 색소 플랜", "", "기미 토닝 구성"), [
      [{ name: "그랜드멤버쉽" }],
    ]),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ concernId: "patient:pigment" }),
    ]),
  );
  expect(
    patientMatches(product("프리미엄 보습 관리"), [[{ name: "관리" }]]),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ concernId: "patient:booster" }),
    ]),
  );
});
it("combines all three published books and keeps stable selection identities", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  s.catalogs.forEach((c, i) => {
    c.products[0] = {
      ...c.products[0],
      name: ["리팟 흑자 상담", "잡티 집중 상담", "색소 잡티 플랜"][i],
      publicVisible: true,
    };
  });
  const rows = recommendedProducts(
    publicProducts(s),
    "patient:pigment",
    "spots",
  );
  expect(new Set(rows.map((p) => p.book))).toEqual(
    new Set(["미용", "보험", "이벤트"]),
  );
  expect(new Set(rows.map((p) => p.catalogVersion)).size).toBe(3);
  s.catalogs[1].products[0].publicVisible = false;
  expect(
    recommendedProducts(publicProducts(s), "patient:pigment", "spots"),
  ).toHaveLength(2);
});
it("filters by the selected detail and avoids matching unrelated generic devices or body botox", () => {
  const p = product("종아리 보톡스");
  expect(
    patientMatches(p, [[{ name: "보톡스" }]]).flatMap((m) => m.answerIds),
  ).not.toContain("botox-wrinkle");
  expect(patientMatches(product("고주파 관리"), [[{ name: "관리" }]])).toEqual(
    [],
  );
  const s = emptyState();
  s.catalogs = threeCatalogs().slice(0, 1);
  s.catalogs[0].products = [
    product("리팟 흑자제거"),
    { ...product("이마 주름 보톡스"), id: "botox" },
  ];
  const products = publicProducts(s);
  expect(
    recommendedProducts(products, "patient:pigment", "spots").map(
      (p) => p.name,
    ),
  ).toEqual(["리팟 흑자제거"]);
  expect(recommendedProducts(products, "patient:pigment", "moles")).toEqual([]);
});
it("deduplicates identical website offers without combining differing prices", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  const p = product("리팟 흑자제거");
  s.catalogs.forEach((c) => {
    c.products = [structuredClone(p)];
  });
  const rows = publicProducts(s).map((p) => ({
    ...p,
    book: "이벤트" as const,
    event: undefined,
    options: p.options.map((o) => ({
      ...o,
      price: 10000,
      tax: "exclusive",
      event: undefined,
    })),
  }));
  expect(recommendedProducts(rows, "patient:pigment", "spots")).toHaveLength(1);
  rows[1].options[0].price = 123456;
  expect(recommendedProducts(rows, "patient:pigment", "spots")).toHaveLength(2);
});
it("exposes the configured patient description but not composition or source material", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  s.catalogs[0].products[0] = product(
    "기미 상담",
    "기미 관리 상품 설명",
    "비공개 구성",
  );
  const rows = publicProducts(s),
    json = JSON.stringify(rows);
  expect(rows[0].matches?.some((m) => m.concernId === "patient:pigment")).toBe(
    true,
  );
  expect(rows[0].description).toBe("기미 관리 상품 설명");
  expect(json).not.toContain("비공개 구성");
});

it("prefers website offers even when beauty prices and option names differ, preserving course lengths", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  for (const c of s.catalogs) {
    c.products = [product("굿바이 여드름/트러블 4주 패키지")];
    c.products[0].publicVisible = true;
    c.products[0].options[0].label =
      c.book === "이벤트" ? "홈페이지 가격" : "5주 패키지";
    c.products[0].options[0].price = c.book === "이벤트" ? 440000 : 530000;
  }
  const beauty = s.catalogs.find((c) => c.book === "미용")!;
  beauty.products.push({
    ...product("굿바이 여드름/트러블 8주 패키지"),
    id: "eight",
  });
  beauty.products[0].name = "굿바이 여드름 · 트러블 4주 패키지";
  const rows = publicProducts(s);
  const result = recommendedProducts(rows, "patient:acne", "inflammatory-acne");
  expect(result[0].book).toBe("이벤트");
  expect(result.some((p) => p.book === "미용" && p.name.includes("4주"))).toBe(
    false,
  );
  expect(result.some((p) => p.book === "미용" && p.name.includes("8주"))).toBe(
    true,
  );
  expect(result.some((p) => p.book === "보험")).toBe(true);
  expect(result[0].options[0].label).toBe("이벤트가");
  expect(
    recommendedProducts(rows, "patient:acne", "inflammatory-acne", "5주").some(
      (p) => p.book === "미용" && p.name.includes("4주"),
    ),
  ).toBe(false);
  const withoutWebsite = rows.filter((p) => p.book !== "이벤트");
  expect(
    recommendedProducts(
      withoutWebsite,
      "patient:acne",
      "inflammatory-acne",
    ).some((p) => p.book === "미용" && p.name.includes("4주")),
  ).toBe(true);
});

it("does not collapse different doses or shot counts into a website offer", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  for (const c of s.catalogs)
    c.products = [
      product(c.book === "이벤트" ? "리쥬란 힐러 2cc" : "리쥬란 힐러 4cc"),
    ];
  const rows = publicProducts(s).map((p) => ({
    ...p,
    matches: [{ concernId: "patient:booster", answerIds: [] }],
  }));
  expect(
    recommendedProducts(rows, "patient:booster", "").some(
      (p) => p.book === "미용",
    ),
  ).toBe(true);
});

it("only exposes website prices in the patient API including event metadata", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  for (const c of s.catalogs) {
    c.products[0].options[0].price = 123456;
    c.products[0].options[0].regularPrice = 234567;
  }
  const rows = publicProducts(s);
  for (const p of rows.filter((p) => p.book !== "이벤트")) {
    expect(p.options[0].price).toBeNull();
    expect(p.options[0].tax).toBe("unknown");
    expect(p.event).toBeUndefined();
    expect(p.options[0].event).toBeUndefined();
    expect(JSON.stringify(p)).not.toMatch(/123456|234567/);
  }
  expect(rows.find((p) => p.book === "이벤트")?.options[0].price).toBe(123456);
});

it("does not turn recovery adjuncts, pores, or lift toning into unrelated indications", () => {
  const matches = patientMatches(
    product(
      "모공흉터 지우개 패키지",
      "",
      "크라이오진정관리 + LED재생레이저 + 수분팩 + 리프토닝",
    ),
    [[{ name: "모공·작은흉터·피부결" }]],
  );
  const ids = matches.map((m) => m.concernId);
  expect(ids).toContain("patient:pores");
  expect(ids).not.toContain("patient:redness");
  expect(ids).not.toContain("patient:acne");
  expect(ids).not.toContain("patient:pigment");
  expect(
    patientMatches(
      product("발톱무좀 레이저 프리미엄", "", "루눌라 + 재생레이저"),
      [],
    ),
  ).toEqual([{ concernId: "patient:medical", answerIds: ["nail-health"] }]);
});
it("keeps explicit multiple indications and the clinic's approved exceptions", () => {
  expect(
    patientMatches(product("슈링크 + 쥬베룩", "탄력·모공 개선"), []).map(
      (m) => m.concernId,
    ),
  ).toEqual(expect.arrayContaining(["patient:lifting", "patient:pores"]));
  for (const name of ["덱세릴MD크림", "이지듀MD크림", "이지듀MD로션"]) {
    const ids = patientMatches(product(name), []).flatMap((m) => m.answerIds);
    expect(ids).toContain("glow");
    expect(ids).toContain("itch-dermatitis");
  }
  const scar = patientMatches(product("나만의 닥터플랜 · 흉터"), []).flatMap(
    (m) => m.answerIds,
  );
  expect(scar).toEqual(expect.arrayContaining(["pitted-scar", "large-scar"]));
  for (const name of [
    "LDM (약물 침투) 6분",
    "오투덤 산소테라피",
    "스킨 배리어 SOS · 얼굴",
  ]) {
    const matches = patientMatches(product(name), [[{ name: "큰흉터" }]]);
    expect(matches.map((m) => m.concernId)).toEqual([
      "patient:redness",
      "patient:booster",
    ]);
    expect(matches.flatMap((m) => m.answerIds)).toEqual(
      expect.arrayContaining(["glow", "sensitive-barrier"]),
    );
  }
});
it("keeps hair removal anatomy and a selected LDM mode in context", () => {
  expect(
    patientMatches(
      product("수염전체 이중턱 5회", "멜라닌 색소를 흡수해 모근 파괴"),
      [[{ name: "제모" }]],
    ).map((m) => m.concernId),
  ).toEqual(["patient:hair-removal"]);
  const p = {
    ...product("LDM(리프팅) 20분", "여드름·홍조·장벽·보습"),
    webEvent: { offerDescription: "" } as any,
  };
  expect(patientMatches(p, []).map((m) => m.concernId)).toEqual([
    "patient:lifting",
  ]);
  expect(
    patientMatches(product("슈링크 + 리쥬란", "피부 컨디션 개선"), []).map(
      (m) => m.concernId,
    ),
  ).not.toContain("patient:condition");
});
