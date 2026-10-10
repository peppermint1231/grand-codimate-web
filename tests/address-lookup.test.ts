import { expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  AddressLookup,
  roadQuery,
  matchRoadRegion,
  lookupRoad,
} from "../server/addressLookup";
import { regionFromAddress } from "../src/core/addressRegion";
const doc = (dong = "조양동", main = "68", city = "춘천시") => ({
  road_address: {
    road_name: "중앙로",
    main_building_no: main,
    sub_building_no: "",
  },
  address: {
    region_1depth_name: "강원특별자치도",
    region_2depth_name: city,
    region_3depth_name: dong,
  },
});
it("accepts Chuncheon bare neighbourhoods, postal prefixes and city aliases without inferring other cities or road names", () => {
  for (const address of [
    "후평동",
    "춘천 후평동",
    "춘천시후평동",
    "강원 춘천 후평동",
    "200-951 후평동",
    "(24300) 후평동",
    "춘천 후평 2동",
  ])
    expect(regionFromAddress(address)).toMatchObject({
      sigungu: "춘천시",
      neighborhood: address.includes("2동") ? "후평2동" : "후평동",
    });
  expect(regionFromAddress("서울 강남구 역삼동")?.sigungu).toBe("강남구");
  for (const address of [
    "중앙로 68",
    "후평동로 12",
    "춘천로 15",
    "성남시 없는동네",
  ])
    expect(regionFromAddress(address)).toBeUndefined();
});
it("sends only locality, road and building number; supports omitted city but never sends flat numbers or unrelated text", () => {
  expect(roadQuery("중앙로 68 4층 401호")).toMatchObject({
    query: "강원특별자치도 춘천시 중앙로 68",
    city: "춘천시",
    main: "68",
  });
  expect(roadQuery("강원도 춘천시 중앙로68 (조양동) 401호")?.query).toBe(
    "강원특별자치도 춘천시 중앙로 68",
  );
  expect(roadQuery("서울 강남구 테헤란로 15 101동 202호")).toMatchObject({
    city: "강남구",
    province: "서울",
  });
  expect(roadQuery("경기도 성남시 분당구 판교역로 12-3")?.city).toBe(
    "성남시 분당구",
  );
  expect(roadQuery("주소 메모 전화번호 01012345678 중앙로 68")).toBeUndefined();
  expect(roadQuery("중앙로")).toBeUndefined();
});
it("accepts exact building matches only and leaves conflicting or truncated results unresolved", () => {
  const q = roadQuery("중앙로 68")!;
  expect(
    matchRoadRegion(q, { documents: [doc()], meta: { total_count: 1 } })
      ?.neighborhood,
  ).toBe("조양동");
  expect(
    matchRoadRegion(q, { documents: [doc("조양동", "69")] }),
  ).toBeUndefined();
  expect(
    matchRoadRegion(q, { documents: [doc("조양동", "68", "강릉시")] }),
  ).toBeUndefined();
  expect(
    matchRoadRegion(q, { documents: [doc(), doc("교동")] }),
  ).toBeUndefined();
  expect(
    matchRoadRegion(q, { documents: [doc()], meta: { total_count: 2 } }),
  ).toBeUndefined();
});
it("normalizes spaced numbered side streets without confusing the street number with the building or floor", () => {
  const canonical = roadQuery("춘천시 후석로369번길 40");
  for (const address of [
    "춘천시 후석로 369번길 40 2층",
    "춘천시 후석로 369 번길 40 201호",
    "후석로369 번길40 2층",
  ]) {
    expect(roadQuery(address)?.query).toBe(canonical?.query);
    expect(roadQuery(address)).toMatchObject({
      road: "후석로369번길",
      main: "40",
      sub: "0",
    });
  }
  expect(roadQuery("후석로 369번길")).toBeUndefined();
  expect(roadQuery("동면 후석로 326 번길")).toBeUndefined();
  expect(roadQuery("동면 후석로 326 번길 31.302동1105호")).toMatchObject({
    road: "후석로326번길",
    main: "31",
  });
  expect(roadQuery("후석로 369 2층")).toMatchObject({
    road: "후석로",
    main: "369",
  });
  expect(roadQuery("후석로 369번길 40-2 3층")).toMatchObject({
    road: "후석로369번길",
    main: "40",
    sub: "2",
  });
  expect(roadQuery("중앙로 68 4층")?.main).toBe("68");
});
it("encrypts shared lookup queries, drains fan-out in bounded steps and reuses results after restart without a repeat queue", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE patient_directory_dirty(id TEXT PRIMARY KEY)");
  const sql = {
    exec(q: string, ...args: any[]) {
      if (q.includes(";")) {
        db.exec(q);
        return { toArray: () => [] };
      }
      const rows = db.prepare(q).all(...args);
      return { toArray: () => rows };
    },
  } as any;
  const key = Buffer.alloc(32, 9).toString("base64");
  let service = new AddressLookup(sql, key);
  for (let i = 0; i < 3; i++)
    await service.resolve("p" + i, "중앙로 68 " + i + "호");
  expect(
    (db.prepare("SELECT COUNT(*) n FROM address_queries").get() as any).n,
  ).toBe(1);
  expect(
    JSON.stringify(db.prepare("SELECT value FROM address_queries").all()),
  ).not.toContain("중앙로");
  const job = (await service.next())!;
  expect(await service.next()).toBeUndefined();
  service.complete(
    job.id,
    { region: matchRoadRegion(job.query, { documents: [doc()] }) },
    0,
  );
  expect(service.applyResolved(2)).toBe(true);
  expect(
    (db.prepare("SELECT COUNT(*) n FROM patient_directory_dirty").get() as any)
      .n,
  ).toBe(2);
  await service.resolve("p0", "중앙로 68");
  service = new AddressLookup(sql, key);
  service.applyResolved(2);
  expect(service.status().counts.resolved).toBe(1);
  expect(
    (db.prepare("SELECT COUNT(*) n FROM address_refs").get() as any).n,
  ).toBe(0);
  expect(service.cached("중앙로 68 401호")?.neighborhood).toBe("조양동");
});
it("maps provider authentication and rate-limit failures to safe messages, without echoing keys or query data", async () => {
  const f = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("private-key", { status: 401 }))
    .mockResolvedValueOnce(new Response("", { status: 429 }));
  try {
    expect(await lookupRoad(roadQuery("중앙로 68")!, "secret")).toMatchObject({
      blocked: true,
    });
    expect(await lookupRoad(roadQuery("중앙로 68")!, "secret")).toMatchObject({
      retry: 3600000,
    });
  } finally {
    f.mockRestore();
  }
});

it("only lets administrators configure the encrypted key and never returns it in status or audit logs", async () => {
  const { clinicFixture } = await import("./fixtures/clinic");
  const f = await clinicFixture();
  try {
    expect(
      (
        await f.request(f.admin, "/address-regions", {
          recheckPatientIds: Array(201).fill("example"),
        })
      ).status,
    ).toBe(400);
    expect((await f.request(f.staff, "/address-regions")).status).toBe(403);
    expect(
      (await f.request(f.staff, "/address-regions", { key: "a".repeat(32) }))
        .status,
    ).toBe(403);
    const r = await f.request(f.admin, "/address-regions", {
      key: "a".repeat(32),
      restart: true,
    });
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).not.toContain("a".repeat(32));
    expect(JSON.parse(body).configured).toBe(true);
    expect(
      JSON.stringify(
        f.db
          .prepare("SELECT value FROM secrets WHERE id='address-lookup-key'")
          .get(),
      ),
    ).not.toContain("a".repeat(32));
    expect(
      JSON.stringify(f.db.prepare("SELECT * FROM access_log").all()),
    ).not.toContain("a".repeat(32));
    const off = await f.request(f.admin, "/address-regions", { remove: true });
    expect(((await off.json()) as any).configured).toBe(false);
  } finally {
    f.db.close();
  }
});
