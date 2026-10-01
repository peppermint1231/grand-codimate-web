import { expect, it } from "vitest";
import { recommendConsents } from "../src/core/consentRecommendations";
import type { Consent, Line } from "../src/core/model";
const template = (id: string, name: string, draftKey?: string): Consent => ({
  id,
  name,
  draftKey,
  rev: 1,
  version: 1,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
  status: "published",
  productIds: [],
  body: "필러, 보톡스 등 대안 및 위험 안내",
  checks: ["확인"],
});
const line = (name: string, patch: Partial<Line> = {}): Line => ({
  id: "line",
  productId: "p",
  optionId: "o",
  name,
  label: "1회",
  price: 10000,
  quantity: 1,
  tax: "exclusive",
  unit: "회",
  discount: { kind: "amount", value: 0 },
  ...patch,
});
it("matches procedure aliases, not broad neighboring folders or boilerplate bodies", () => {
  const templates = [
    template("a", "보톡스 동의서", "toxin"),
    template("b", "필러", "ha-filler"),
    template("c", "제모", "hair-removal"),
  ];
  expect(
    recommendConsents(templates, [
      line("턱 보톡스", { categorySnapshot: "보톡스·필러" }),
    ]).map((r) => r.template.id),
  ).toEqual(["a"]);
  expect(recommendConsents(templates, [line("발톱 무좀 레이저")])).toEqual([]);
});
it("prefers explicit product links, finds package components, and explains folder-only candidates", () => {
  const templates = [
    template("a", "보톡스", "toxin"),
    template("b", "스킨부스터", "skin-injection"),
    { ...template("c", "특별 양식"), productIds: ["p"] },
  ];
  const result = recommendConsents(templates, [
    line("맞춤 패키지", { composition: "리쥬란 2회 + 보톡스 1회" }),
  ]);
  expect(result.map((r) => r.template.id)).toEqual(["c", "a", "b"]);
  expect(result[1].reasons[0]).toContain("구성 일치");
  expect(
    recommendConsents(
      [templates[0]],
      [line("맞춤 A", { categorySnapshot: "보톡스" })],
    )[0].reasons[0],
  ).toContain("실제 시술 확인");
});
it("offers latest published versions only, keeps a published version while its revision is a draft", () => {
  const old = template("old", "보톡스", "toxin");
  const next = { ...old, id: "next", version: 2, status: "draft" as const };
  expect(
    recommendConsents([old, next], [line("보톡스")]).map((r) => r.template.id),
  ).toEqual(["old"]);
  next.status = "published" as any;
  expect(
    recommendConsents([old, next], [line("보톡스")]).map((r) => r.template.id),
  ).toEqual(["next"]);
  expect(recommendConsents([old], [])).toEqual([]);
});
it("handles multiple selected treatments and option-specific membership composition", () => {
  const templates = [
    template("m", "멤버십 이용 안내", "membership"),
    template("r", "리팟", "repot"),
    template("d", "닥터플랜", "doctor-plan"),
  ];
  const result = recommendConsents(templates, [
    line("GOLD", { composition: "멤버십 안내\n관리 3회" }),
    line("닥터플랜 리팟 흑자제거", { id: "two" }),
  ]);
  expect(result.map((r) => r.template.id).sort()).toEqual(["d", "m", "r"]);
  expect(result.find((r) => r.template.id === "m")!.lineIds).toEqual(["line"]);
});
