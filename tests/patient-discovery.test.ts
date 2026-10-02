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
it("deduplicates identical offers across books without combining differing prices", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  const p = product("리팟 흑자제거");
  s.catalogs.forEach((c) => {
    c.products = [structuredClone(p)];
  });
  const rows = publicProducts(s).map((p) => ({
    ...p,
    event: undefined,
    options: p.options.map((o) => ({ ...o, event: undefined })),
  }));
  expect(recommendedProducts(rows, "patient:pigment", "spots")).toHaveLength(1);
  rows[1].options[0].price = 123456;
  expect(recommendedProducts(rows, "patient:pigment", "spots")).toHaveLength(2);
});
it("returns only matching metadata, not internal descriptions or source material", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  s.catalogs[0].products[0] = product(
    "기미 상담",
    "내부 기록: 기미 관리",
    "비공개 구성",
  );
  const rows = publicProducts(s),
    json = JSON.stringify(rows);
  expect(rows[0].matches?.some((m) => m.concernId === "patient:pigment")).toBe(
    true,
  );
  expect(json).not.toContain("내부 기록");
  expect(json).not.toContain("비공개 구성");
});
