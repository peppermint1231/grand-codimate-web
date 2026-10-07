import { closureReason } from "../src/core/appointments";
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../server/worker";
import { Drive } from "../server/drive";
import { seal, open } from "../server/crypto";
import { threeCatalogs } from "./fixtures/catalogs";
const dbs: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  dbs.splice(0).forEach((db) => db.close());
});
async function fixture() {
  const db = new DatabaseSync(":memory:");
  dbs.push(db);
  const sql = {
    exec(query: string, ...args: any[]) {
      if (query.includes(";")) {
        db.exec(query);
        return { toArray: () => [] };
      }
      const rows = db.prepare(query).all(...args);
      return { toArray: () => rows };
    },
  };
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64",
  );
  let alarm: number | null = null;
  const clinic = new Clinic(
    {
      storage: {
        sql,
        getAlarm: async () => alarm,
        setAlarm: async (value: number) => {
          alarm = value;
        },
        transactionSync(fn: () => void) {
          db.exec("BEGIN");
          try {
            fn();
            db.exec("COMMIT");
          } catch (e) {
            db.exec("ROLLBACK");
            throw e;
          }
        },
      },
    } as any,
    {
      ENCRYPTION_KEY: key,
      SETUP_KEY: "setup",
      APP_ORIGIN: "https://test.example",
      REQUIRE_ONEDRIVE: "true",
    } as any,
  );
  let token = "";
  const request = (path: string, body?: unknown, anonymous = false) =>
    clinic.fetch(
      new Request("https://test.example/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anonymous ? {} : { Authorization: "Bearer " + token }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  await request("/setup", {
    key: "setup",
    username: "admin",
    name: "시험",
    password: "test-password-1234",
  });
  const session = (await (
    await request("/login", {
      username: "admin",
      password: "test-password-1234",
    })
  ).json()) as any;
  token = session.token;
  const files = new Map<string, { id: string; value: string }>();
  const put = vi
    .spyOn(Drive.prototype, "put")
    .mockImplementation(async (path, data) => {
      const id = files.get(path)?.id || crypto.randomUUID();
      files.set(path, { id, value: String(data) });
      return { id, size: String(data).length, eTag: "tag" };
    });
  vi.spyOn(Drive.prototype, "exists").mockImplementation(async (path) => {
    const file = files.get(path);
    return file
      ? { id: file.id, size: file.value.length, name: path.split("/").at(-1)! }
      : undefined;
  });
  vi.spyOn(Drive.prototype, "get").mockImplementation(
    async (id) =>
      new Response([...files.values()].find((f) => f.id === id)?.value || ""),
  );
  const remove = vi
    .spyOn(Drive.prototype, "remove")
    .mockImplementation(async (id) => {
      for (const [path, file] of files) if (file.id === id) files.delete(path);
    });
  for (const c of threeCatalogs())
    db.prepare("INSERT INTO entities VALUES(?,?,?)").run(
      "catalogs",
      c.id,
      await seal(c, key),
    );
  const pub = (await (
    await request("/public/catalog", undefined, true)
  ).json()) as any;
  const input = {
    token: pub.token,
    person: {
      name: "접수시험",
      phone: "010-0000-0000",
      sex: "F",
      dob: "1990-01-01",
      address: "시험동",
    },
    selections: pub.products.map((p: any) => ({
      productId: p.id,
      optionId: p.options[0].id,
      catalogVersion: p.catalogVersion,
    })),
    concerns: ["pigment", "medical"],
    answers: [],
    personalConsent: true,
    sensitiveConsent: true,
  };
  return { db, key, clinic, request, files, put, remove, pub, input };
}
it("accepts consented public selections once without exposing private state or putting unconverted PII in immutable commits", async () => {
  const f = await fixture();
  expect((await f.request("/state", undefined, true)).status).toBe(401);
  expect((await f.request("/inquiries", undefined, true)).status).toBe(401);
  expect(JSON.stringify(f.pub)).not.toContain("내부");
  const first = await f.request("/public/inquiries", f.input, true);
  expect(first.status, await first.clone().text()).toBe(200);
  const receipt = ((await first.json()) as any).receipt;
  expect(
    await (await f.request("/public/inquiries", f.input, true)).json(),
  ).toMatchObject({ receipt });
  expect(
    (
      await f.request(
        "/public/inquiries",
        { ...f.input, person: { ...f.input.person, name: "변조" } },
        true,
      )
    ).status,
  ).toBe(409);
  expect(f.db.prepare("SELECT * FROM inquiries").all()).toHaveLength(1);
  expect(f.db.prepare("SELECT * FROM operations").all()).toHaveLength(0);
  expect([...f.files.values()].map((f) => f.value).join("")).not.toContain(
    "접수시험",
  );
  const list = (await (await f.request("/inquiries")).json()) as any;
  expect(list.inquiries[0].person.phone).toBe("01000000000");
});
it("requires separate consents and rejects unpublished or stale selections", async () => {
  const f = await fixture();
  for (const input of [
    { ...f.input, personalConsent: false },
    { ...f.input, sensitiveConsent: false },
    {
      ...f.input,
      selections: [{ ...f.input.selections[0], catalogVersion: "stale" }],
    },
  ])
    expect(
      (await f.request("/public/inquiries", input, true)).status,
    ).toBeGreaterThanOrEqual(400);
  expect(f.db.prepare("SELECT * FROM inquiries").all()).toHaveLength(0);
});
it("acknowledges durable intake without waiting for OneDrive and retries a failed backup without duplicates", async () => {
  const f = await fixture();
  const exists = vi.spyOn(Drive.prototype, "exists");
  exists.mockClear();
  f.put.mockRejectedValueOnce(new Error("offline"));
  expect((await f.request("/public/inquiries", f.input, true)).status).toBe(
    200,
  );
  expect(f.put).not.toHaveBeenCalled();
  expect(exists).not.toHaveBeenCalled();
  expect(
    f.db.prepare("SELECT * FROM inquiries WHERE remoteId='' ").all(),
  ).toHaveLength(1);
  // The staff list reads the durable receipt immediately, even during an outage.
  expect(
    ((await (await f.request("/inquiries")).json()) as any).inquiries,
  ).toHaveLength(1);
  expect(f.put).not.toHaveBeenCalled();
  await expect(f.clinic.alarm()).rejects.toThrow("offline");
  expect((await f.request("/public/inquiries", f.input, true)).status).toBe(
    200,
  );
  await f.clinic.alarm();
  expect(f.db.prepare("SELECT * FROM inquiries").all()).toHaveLength(1);
  expect(
    f.db.prepare("SELECT * FROM inquiries WHERE remoteId='' ").all(),
  ).toHaveLength(0);
  expect(
    [...f.files.keys()].filter((x) => x.includes("/inquiries/")),
  ).toHaveLength(1);
});
it("does not call a stalled OneDrive upload on the patient response path", async () => {
  const f = await fixture();
  f.put.mockImplementation(() => new Promise(() => {}));
  const response = await Promise.race([
    f.request("/public/inquiries", f.input, true),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(Error("blocked on backup")), 1000),
    ),
  ]);
  expect(response.status).toBe(200);
  expect(f.put).not.toHaveBeenCalled();
  expect(f.db.prepare("SELECT * FROM inquiries").all()).toHaveLength(1);
});
it("recovers the same receipt after an isolate restart without reintroducing scrubbed patient details", async () => {
  const f = await fixture();
  await f.request("/public/inquiries", f.input, true);
  await f.clinic.alarm();
  f.db.prepare("DELETE FROM inquiries").run();
  (f.clinic as any).inquiryEpoch = "restarted-instance";
  expect((await f.request("/public/inquiries", f.input, true)).status).toBe(
    200,
  );
  expect(f.db.prepare("SELECT * FROM inquiries").all()).toHaveLength(1);
});

it("converts three books to one consultation atomically, scrubs intake PII and is replay-safe", async () => {
  const f = await fixture();
  const receipt = (
    (await (await f.request("/public/inquiries", f.input, true)).json()) as any
  ).receipt;
  const body = { id: receipt, person: f.input.person, category: "미용" };
  const response = await f.request("/inquiries/convert", body);
  expect(response.status, await response.clone().text()).toBe(200);
  const result = await response.json();
  expect(await (await f.request("/inquiries/convert", body)).json()).toEqual(
    result,
  );
  const state = (await (await f.request("/state")).json()) as any;
  expect(state.state.patients).toHaveLength(1);
  expect(state.state.consultations).toHaveLength(1);
  expect(state.state.consultations[0].quote.total).toBe(24800);
  expect(state.state.consultations[0].intakeSource.personalConsent).toBe(true);
  expect(
    ((await (await f.request("/inquiries")).json()) as any).inquiries,
  ).toHaveLength(0);
  const row = f.db.prepare("SELECT value FROM inquiries").get() as any;
  expect((await open<any>(row.value, f.key)).person.name).toBe("");
  // A browser retry after staff conversion must not recreate the contact data.
  expect((await f.request("/public/inquiries", f.input, true)).status).toBe(
    200,
  );
  expect(
    ((await (await f.request("/inquiries")).json()) as any).inquiries,
  ).toHaveLength(0);
});
it("leaves unreviewed interests in the memo and never guesses a cart price", async () => {
  const f = await fixture(),
    catalogs = threeCatalogs();
  catalogs[2].products[0].active = false;
  f.db
    .prepare("UPDATE entities SET value=? WHERE id=?")
    .run(await seal(catalogs[2], f.key), catalogs[2].id);
  const receipt = (
    (await (await f.request("/public/inquiries", f.input, true)).json()) as any
  ).receipt;
  expect(
    (
      await f.request("/inquiries/convert", {
        id: receipt,
        person: f.input.person,
        category: "보험",
      })
    ).status,
  ).toBe(200);
  const { state } = (await (await f.request("/state")).json()) as any;
  expect(state.consultations[0].quote.lines).toHaveLength(2);
  expect(state.consultations[0].memo).toContain("시험 이벤트 상품");
});
it("automatically deletes expired intake files and rows by stable OneDrive item ID", async () => {
  const f = await fixture();
  await f.request("/public/inquiries", f.input, true);
  await f.clinic.alarm();
  f.db.prepare("UPDATE inquiries SET expires=?").run(Date.now() - 1);
  await f.clinic.alarm();
  expect(f.db.prepare("SELECT * FROM inquiries").all()).toHaveLength(0);
  expect(f.remove).toHaveBeenCalledTimes(1);
  expect(
    [...f.files.keys()].filter((x) => x.includes("/inquiries/")),
  ).toHaveLength(0);
});

it("retries a failed consultation commit without duplicating the patient or consultation", async () => {
  const f = await fixture();
  const receipt = (
    (await (await f.request("/public/inquiries", f.input, true)).json()) as any
  ).receipt;
  const input = { id: receipt, person: f.input.person, category: "미용" };
  f.put.mockRejectedValueOnce(new Error("commit upload failed"));
  expect((await f.request("/inquiries/convert", input)).status).toBe(503);
  expect(
    f.db.prepare("SELECT * FROM operations WHERE done=0").all(),
  ).toHaveLength(1);
  expect((await f.request("/inquiries/convert", input)).status).toBe(200);
  const { state } = (await (await f.request("/state")).json()) as any;
  expect(state.patients).toHaveLength(1);
  expect(state.consultations).toHaveLength(1);
  expect(
    f.db.prepare("SELECT * FROM operations WHERE done=0").all(),
  ).toHaveLength(0);
});
it("restores pending inquiries from encrypted OneDrive files and retains expiry cleanup", async () => {
  const f = await fixture();
  await f.request("/public/inquiries", f.input, true);
  await f.clinic.alarm();
  const account = f.db
    .prepare("SELECT id,value FROM secrets WHERE id LIKE 'user:%'")
    .get() as any;
  f.files.set("상담/_codimate/accounts/" + account.id.slice(5) + ".enc", {
    id: "account-file",
    value: account.value,
  });
  vi.spyOn(Drive.prototype, "folders").mockResolvedValue();
  vi.spyOn(Drive.prototype, "listCommits").mockImplementation(
    async (folder = "commits") =>
      [...f.files]
        .filter(([path]) => path.includes("/_codimate/" + folder + "/"))
        .map(([path, file]) => ({
          id: file.id,
          name: path.split("/").at(-1)!,
        })),
  );
  f.db.prepare("DELETE FROM inquiries").run();
  expect((await f.request("/restore", {})).status).toBe(200);
  const restored = f.db.prepare("SELECT * FROM inquiries").all() as any[];
  expect(restored).toHaveLength(1);
  expect((await open<any>(restored[0].value, f.key)).person.name).toBe(
    f.input.person.name,
  );
  f.db.prepare("UPDATE inquiries SET expires=?").run(Date.now() - 1);
  await f.clinic.alarm();
  expect(f.db.prepare("SELECT * FROM inquiries").all()).toHaveLength(0);
});

it("distinguishes matching product and option IDs in different catalog books", async () => {
  const f = await fixture(),
    catalogs = threeCatalogs();
  catalogs[2].products[0].id = catalogs[0].products[0].id;
  catalogs[2].products[0].options[0].id = catalogs[0].products[0].options[0].id;
  f.db
    .prepare("UPDATE entities SET value=? WHERE id=?")
    .run(await seal(catalogs[2], f.key), catalogs[2].id);
  f.input.selections[2].productId = f.input.selections[0].productId;
  f.input.selections[2].optionId = f.input.selections[0].optionId;
  const response = await f.request("/public/inquiries", f.input, true);
  expect(response.status, await response.clone().text()).toBe(200);
  const { receipt } = (await response.json()) as any;
  expect(
    (
      await f.request("/inquiries/convert", {
        id: receipt,
        person: f.input.person,
        category: "미용",
      })
    ).status,
  ).toBe(200);
  const { state } = (await (await f.request("/state")).json()) as any;
  expect(state.consultations[0].quote.total).toBe(24800);
  expect(state.consultations[0].quote.lines.map((l: any) => l.book)).toEqual([
    "미용",
    "보험",
    "이벤트",
  ]);
});
it("accepts renamed dynamic categories and preserves the original patient-selected label", async () => {
  const f = await fixture(),
    c = threeCatalogs()[0];
  c.folderTree = [
    {
      id: "custom-root",
      parentId: "",
      name: "나의 피부 고민",
      color: "#336699",
    },
  ];
  c.products[0].folderId = "custom-root";
  f.db
    .prepare("UPDATE entities SET value=? WHERE id=?")
    .run(await seal(c, f.key), c.id);
  const pub = (await (
    await f.request("/public/catalog", undefined, true)
  ).json()) as any;
  expect(
    pub.categories.find((x: any) => x.id === "미용:custom-root"),
  ).toMatchObject({ name: "나의 피부 고민", color: "#336699" });
  const input = { ...f.input, concerns: ["미용:custom-root"] };
  const response = await f.request("/public/inquiries", input, true);
  expect(response.status).toBe(200);
  const { receipt } = (await response.json()) as any;
  c.folderTree[0].name = "변경된 이름";
  f.db
    .prepare("UPDATE entities SET value=? WHERE id=?")
    .run(await seal(c, f.key), c.id);
  expect(
    (
      await f.request("/inquiries/convert", {
        id: receipt,
        person: f.input.person,
        category: "미용",
      })
    ).status,
  ).toBe(200);
  const { state } = (await (await f.request("/state")).json()) as any;
  expect(state.consultations[0].memo).toContain("나의 피부 고민");
  expect(state.consultations[0].memo).not.toContain("변경된 이름");
});
it("stores folder history atomically with its published catalog and hides draft snapshots from non-editors", async () => {
  const f = await fixture(),
    c = threeCatalogs()[0];
  c.folderTree = [{ id: "pigment", parentId: "", name: "편집한 고민" }];
  expect(
    (
      await f.request("/commands", {
        id: "folder-history-command",
        type: "catalog.folders.commit",
        entityId: c.id,
        baseRev: c.rev,
        payload: { catalog: c, basePublishedId: c.id },
      })
    ).status,
  ).toBe(200);
  const admin = (await (await f.request("/state")).json()) as any;
  expect(admin.state.catalogRevisions).toHaveLength(2);
  const accountRow = f.db
    .prepare("SELECT id,value FROM secrets WHERE id LIKE 'user:%'")
    .get() as any;
  const account = await open<any>(accountRow.value, f.key);
  account.role = "doctor";
  account.permissionLevel = "standard";
  account.permissions = {};
  f.db
    .prepare("UPDATE secrets SET value=? WHERE id=?")
    .run(await seal(account, f.key), accountRow.id);
  const limited = (await (await f.request("/state")).json()) as any;
  expect(limited.state.catalogRevisions).toHaveLength(0);
  expect(
    limited.state.catalogs.every((c: any) => c.status === "published"),
  ).toBe(true);
});

it("accepts unified patient concerns and records detail labels while retaining original book selections", async () => {
  const f = await fixture();
  expect(
    f.pub.patientConcerns.some((c: any) => c.id === "patient:pigment"),
  ).toBe(true);
  const input = {
    ...f.input,
    concerns: ["patient:pigment", "patient:medical"],
    answers: ["spots", "itch-dermatitis"],
  };
  const response = await f.request("/public/inquiries", input, true);
  expect(response.status, await response.clone().text()).toBe(200);
  const receipt = ((await response.json()) as any).receipt;
  const entry = (
    (await (await f.request("/inquiries")).json()) as any
  ).inquiries.find((x: any) => x.id === receipt);
  expect(entry.concernLabels).toEqual(["점·잡티·기미", "피부 증상·손발톱"]);
  expect(entry.answerLabels).toContain("잡티·주근깨가 눈에 띄어요");
  expect(new Set(entry.selections.map((s: any) => s.book))).toEqual(
    new Set(["미용", "보험", "이벤트"]),
  );
});

function futureSlot() {
  const start = Date.now();
  for (let i = 1; i < 10; i++) {
    const date = new Date(start + i * 86400000 + 9 * 3600000)
      .toISOString()
      .slice(0, 10);
    if (![0, 6].includes(new Date(date).getUTCDay()) && !closureReason(date))
      return { requestedDate: date, requestedTime: "11:00" };
  }
  throw Error("date");
}
it("requires new visitor details and valid requested hours while accepting returning visitors without DOB", async () => {
  const f = await fixture(),
    slot = futureSlot();
  for (const changes of [
    { person: { ...f.input.person, sex: "U" } },
    { person: { ...f.input.person, dob: "1985-02-30" } },
    { person: { ...f.input.person, dob: "" } },
    { person: { ...f.input.person, address: "" } },
    { requestedTime: "20:00" },
    { requestedTime: "13:30" },
  ]) {
    expect(
      (
        await f.request(
          "/public/inquiries",
          { ...f.input, visitType: "first", ...slot, ...changes },
          true,
        )
      ).status,
    ).toBe(400);
  }
  const r = await f.request(
    "/public/inquiries",
    {
      ...f.input,
      visitType: "returning",
      ...slot,
      person: { ...f.input.person, dob: "", address: "" },
      requests: "오후 연락 부탁합니다",
    },
    true,
  );
  expect(r.status, await r.clone().text()).toBe(200);
  const d: any = await (await f.request("/inquiries")).json();
  expect(d.inquiries[0]).toMatchObject({
    visitType: "returning",
    requests: "오후 연락 부탁합니다",
    schedule: {
      date: slot.requestedDate,
      time: "11:00",
      confirmed: false,
      coordinatorId: "",
    },
  });
});
it("assigns another coordinator, rejects stale edits, supports cancellation, and carries schedule into a lasting consultation calendar", async () => {
  const f = await fixture(),
    slot = futureSlot();
  const other = {
    id: "other-coordinator",
    name: "다른 상담자",
    username: "other",
    role: "coordinator",
    permissionLevel: "standard",
    active: true,
    permissions: {},
  };
  f.db
    .prepare("INSERT INTO entities VALUES(?,?,?)")
    .run("users", other.id, await seal(other, f.key));
  const r: any = await (
    await f.request(
      "/public/inquiries",
      { ...f.input, visitType: "first", ...slot, requests: "연락 요청" },
      true,
    )
  ).json();
  const update = {
    id: r.receipt,
    rev: 1,
    date: slot.requestedDate,
    time: "11:00",
    coordinatorId: other.id,
    action: "confirm",
  };
  expect(
    (await f.request("/inquiries/schedule", { ...update, coordinatorId: "" }))
      .status,
  ).toBe(400);
  expect((await f.request("/inquiries/schedule", update)).status).toBe(200);
  expect((await f.request("/inquiries/schedule", update)).status).toBe(409);
  expect(
    (
      await f.request("/inquiries/schedule", {
        ...update,
        rev: 2,
        action: "cancel",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await f.request("/inquiries/convert", {
        id: r.receipt,
        person: f.input.person,
        category: "미용",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await f.request("/inquiries/schedule", {
        ...update,
        rev: 3,
        action: "confirm",
      })
    ).status,
  ).toBe(200);
  const converted = await f.request("/inquiries/convert", {
    id: r.receipt,
    person: f.input.person,
    category: "미용",
  });
  expect(converted.status, await converted.clone().text()).toBe(200);
  const d: any = await (await f.request("/inquiries")).json();
  expect(d.inquiries).toHaveLength(0);
  expect(d.appointments[0]).toMatchObject({
    coordinatorId: other.id,
    date: slot.requestedDate,
    time: "11:00",
    completed: false,
  });
  const consultation: any = await open(
    (
      f.db
        .prepare("SELECT value FROM entities WHERE section=? AND id=?")
        .get("consultations", d.appointments[0].id) as any
    ).value,
    f.key,
  );
  expect(consultation.memo).toContain("연락 요청");
  expect(consultation.attendance).toBe("예약");
  consultation.status = "P";
  f.db
    .prepare("UPDATE entities SET value=? WHERE section=? AND id=?")
    .run(await seal(consultation, f.key), "consultations", consultation.id);
  f.db.prepare("UPDATE inquiries SET expires=?").run(Date.now() - 1);
  const after: any = await (await f.request("/inquiries")).json();
  expect(after.appointments[0].completed).toBe(true);
});
it("blocks custom closures on the server even when a patient has an older form open", async () => {
  const f = await fixture(),
    slot = futureSlot();
  expect(
    (
      await f.request("/inquiries/closures", {
        date: slot.requestedDate,
        action: "add",
        rev: 0,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await f.request(
        "/public/inquiries",
        { ...f.input, visitType: "first", ...slot },
        true,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await f.request("/inquiries/closures", {
        date: slot.requestedDate,
        action: "remove",
        rev: 0,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await f.request("/inquiries/closures", {
        date: slot.requestedDate,
        action: "remove",
        rev: 1,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await f.request(
        "/public/inquiries",
        { ...f.input, visitType: "first", ...slot },
        true,
      )
    ).status,
  ).toBe(200);
});

it("protects accepted pending inquiries from rebuilds and pauses new intake during staged recovery", async () => {
  const f = await fixture();
  expect((await f.request("/public/inquiries", f.input, true)).status).toBe(
    200,
  );
  f.put.mockRejectedValue(new Error("backup unavailable"));
  expect((await f.request("/restore-jobs", { action: "start" })).status).toBe(
    503,
  );
  expect((await f.request("/restore", {})).status).toBe(503);
  expect(f.db.prepare("SELECT * FROM inquiries").all()).toHaveLength(1);
  f.db.prepare("INSERT INTO restore_job VALUES(?,?)").run("active", "staged");
  expect((await f.request("/public/inquiries", f.input, true)).status).toBe(
    409,
  );
});

it("lists converted assignments and changes owners while request deletion preserves the consultation", async () => {
  const f = await fixture(),
    slot = futureSlot();
  const other = {
    id: "calendar-other",
    name: "배정 직원",
    username: "other",
    role: "coordinator",
    permissionLevel: "standard",
    active: true,
    permissions: {},
  };
  f.db
    .prepare("INSERT INTO entities VALUES(?,?,?)")
    .run("users", other.id, await seal(other, f.key));
  const receipt = (
    (await (
      await f.request(
        "/public/inquiries",
        { ...f.input, visitType: "first", ...slot },
        true,
      )
    ).json()) as any
  ).receipt;
  expect(
    (
      await f.request("/inquiries/manage", {
        id: receipt,
        rev: 1,
        action: "assign",
        ownerId: other.id,
      })
    ).status,
  ).toBe(200);
  const linked = await f.request("/inquiries/convert", {
    id: receipt,
    person: f.input.person,
    category: "미용",
  });
  expect(linked.status, await linked.clone().text()).toBe(200);
  let list: any = await (await f.request("/inquiries")).json();
  expect(list.inquiries).toHaveLength(0);
  expect(list.appointments).toHaveLength(1);
  const appointment = list.appointments[0];
  expect(appointment.coordinatorId).toBe(other.id);
  expect(appointment.canReassign).toBe(true);
  const account = f.db
    .prepare("SELECT value FROM secrets WHERE id LIKE 'user:%'")
    .get() as any;
  const admin = await open<any>(account.value, f.key);
  f.db
    .prepare("UPDATE secrets SET value=? WHERE id=?")
    .run(
      await seal({ ...admin, permissionLevel: "standard" }, f.key),
      "user:" + admin.id,
    );
  expect(
    (
      await f.request("/inquiries/manage", {
        id: appointment.id,
        consultationId: appointment.id,
        rev: appointment.rev,
        action: "assign",
        ownerId: admin.id,
      })
    ).status,
  ).toBe(403);
  f.db
    .prepare("UPDATE secrets SET value=? WHERE id=?")
    .run(account.value, "user:" + admin.id);
  expect(
    (
      await f.request("/inquiries/manage", {
        id: appointment.id,
        consultationId: appointment.id,
        rev: appointment.rev,
        action: "assign",
        ownerId: admin.id,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await f.request("/inquiries/manage", {
        id: appointment.id,
        consultationId: appointment.id,
        rev: appointment.rev,
        action: "delete",
      })
    ).status,
  ).toBe(409);
  list = await (await f.request("/inquiries")).json();
  const del = {
    id: appointment.id,
    consultationId: appointment.id,
    rev: list.appointments[0].rev,
    action: "delete",
  };
  expect((await f.request("/inquiries/manage", del)).status).toBe(200);
  expect((await f.request("/inquiries/manage", del)).status).toBe(200);
  expect(
    ((await (await f.request("/inquiries")).json()) as any).appointments,
  ).toHaveLength(0);
  const state: any = await (await f.request("/state")).json();
  expect(state.state.patients).toHaveLength(1);
  expect(state.state.consultations).toHaveLength(1);
});

it("connects an inquiry after its event expires without reading catalog revision history", async () => {
  const f = await fixture();
  const receipt = (
    (await (await f.request("/public/inquiries", f.input, true)).json()) as any
  ).receipt;
  const row = f.db
    .prepare("SELECT id,value FROM entities WHERE section='catalogs' LIMIT 1")
    .get() as any;
  const catalog = await open<any>(row.value, f.key);
  const product = catalog.products[0];
  product.webEvent = {
    provider: "grand4",
    eventId: "expired",
    offerId: "expired",
    eventName: "기간 종료",
    url: "https://www.grand4.co.kr",
    posterUrls: [],
    period: "종료",
    endsOn: "2020-01-01",
    regularPrice: null,
    salePrice: null,
    discountRate: null,
    priceText: "",
    sourceSignature: "",
    checkedAt: "",
  };
  f.db
    .prepare("UPDATE entities SET value=? WHERE section='catalogs' AND id=?")
    .run(await seal(catalog, f.key), row.id);
  // Unrelated history must never be loaded by conversion.
  f.db
    .prepare("INSERT INTO entities VALUES(?,?,?)")
    .run("catalogRevisions", "unreadable-history", "not-an-encrypted-record");
  const response = await f.request("/inquiries/convert", {
    id: receipt,
    person: f.input.person,
    category: "미용",
  });
  expect(response.status, await response.clone().text()).toBe(200);
  const linked = (await response.json()) as any;
  const stored = f.db
    .prepare(
      "SELECT value FROM entities WHERE section='consultations' AND id=?",
    )
    .get(linked.consultationId) as any;
  const consultation = await open<any>(stored.value, f.key);
  expect(
    consultation.quote.lines.some((line: any) => line.productId === product.id),
  ).toBe(false);
  expect(consultation.memo).toContain(product.name);
});
it("deletes an unassigned request with revision protection and removes its OneDrive backup", async () => {
  const f = await fixture();
  const receipt = (
    (await (await f.request("/public/inquiries", f.input, true)).json()) as any
  ).receipt;
  await f.clinic.alarm();
  expect(
    (
      await f.request("/inquiries/manage", {
        id: receipt,
        rev: 0,
        action: "delete",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await f.request("/inquiries/manage", {
        id: receipt,
        rev: 1,
        action: "delete",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await f.request("/inquiries/manage", {
        id: receipt,
        rev: 1,
        action: "delete",
      })
    ).status,
  ).toBe(200);
  expect(f.db.prepare("SELECT * FROM inquiries").all()).toHaveLength(0);
  expect(
    [...f.files.keys()].filter((p) => p.includes("/inquiries/")),
  ).toHaveLength(0);
});
