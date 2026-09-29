import { expect, it } from "vitest";
import { clinicFixture } from "./fixtures/clinic";
it("shares reason suggestions across accounts while enforcing money visibility", async () => {
  const f = await clinicFixture();
  try {
    const c = f.state.consultations[0];
    await f.put("consultations", {
      ...c,
      priceReasonHistory: ["소개", "재방문"],
      quote: { ...c.quote, reason: "소개" },
    });
    const r = await f.request(f.staff, "/quote-reasons");
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).reasons).toEqual([
      { reason: "소개", count: 1 },
      { reason: "재방문", count: 1 },
    ]);
    const noMoney = { ...f.staff, permissions: { "money.read": false } };
    await f.add(noMoney);
    expect((await f.request(noMoney, "/quote-reasons")).status).toBe(403);
  } finally {
    f.db.close();
  }
});
