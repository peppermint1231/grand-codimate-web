import { Inquiries } from "./inquiries";
import {
  inquiryInput,
  publicProducts,
  publicCategories,
  type Inquiry,
} from "../src/core/discovery";
import { concerns } from "../src/core/concerns";
import {
  DEFAULT_STORAGE_ROOT,
  validStorageRoot,
  relocateStoragePath,
  patientFolder,
  photoFileName,
} from "../src/core/storagePaths";
import bundledRelease from "../releases/android-latest.json";
import { latestRelease, parseRelease } from "../src/core/appRelease";
import { DurableObject } from "cloudflare:workers";
import {
  emptyState,
  latestCatalogs,
  catalogBook,
  emptyQuote,
  allowed,
  permissions,
  type State,
  type User,
  type Command,
} from "../src/core/model";
import { applyCommand, DomainError, ensure, sha } from "../src/core/domain";
import { seal, open, hashPassword, verifyPassword } from "./crypto";
import {
  Drive,
  exchange,
  loginUrl,
  type OAuthTokens,
  type DriveEnv,
} from "./drive";
interface Env extends DriveEnv {
  CLINIC: DurableObjectNamespace<Clinic>;
  ASSETS: Fetcher;
  ENCRYPTION_KEY: string;
  SETUP_KEY: string;
  REQUIRE_ONEDRIVE: string;
}
type Account = User & { passwordHash: string };
type Change = { section: keyof State; id: string; value: unknown };
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export default {
  async fetch(req: Request, env: Env) {
    const u = new URL(req.url);
    if (!u.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    const origin = req.headers.get("Origin");
    const origins = [
      env.APP_ORIGIN,
      "https://localhost",
      "capacitor://localhost",
    ];
    if (origin && !origins.includes(origin))
      return json({ error: "허용되지 않은 출처입니다" }, 403);
    if (req.method === "OPTIONS")
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": origin || env.APP_ORIGIN,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers":
            "Content-Type,Authorization,X-File-Name,X-Consultation-Id,X-Upload-Id,X-Captured-At",
          "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        },
      });
    const res = await env.CLINIC.get(env.CLINIC.idFromName("hospital")).fetch(
      req,
    );
    const h = new Headers(res.headers);
    if (origin) {
      h.set("Access-Control-Allow-Origin", origin);
      h.set("Access-Control-Allow-Credentials", "true");
      h.set("Vary", "Origin");
    }
    return new Response(res.body, { status: res.status, headers: h });
  },
} satisfies ExportedHandler<Env>;
export class Clinic extends DurableObject<Env> {
  private queue: Promise<unknown> = Promise.resolve();
  private sql: SqlStorage;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS entities(section TEXT,id TEXT,value TEXT NOT NULL,PRIMARY KEY(section,id));CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,actor TEXT,digest TEXT,value TEXT,done INTEGER DEFAULT 0);CREATE TABLE IF NOT EXISTS secrets(id TEXT PRIMARY KEY,value TEXT);CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,value TEXT);CREATE TABLE IF NOT EXISTS inquiries(id TEXT PRIMARY KEY,value TEXT NOT NULL,expires INTEGER NOT NULL,remoteId TEXT);CREATE INDEX IF NOT EXISTS inquiries_expiry ON inquiries(expires);",
    );
  }
  private async secret<T>(id: string) {
    const row = this.sql
      .exec<{ value: string }>("SELECT value FROM secrets WHERE id=?", id)
      .toArray()[0];
    return row ? open<T>(row.value, this.env.ENCRYPTION_KEY) : undefined;
  }
  private async setSecret(id: string, v: unknown) {
    this.sql.exec(
      "INSERT OR REPLACE INTO secrets VALUES(?,?)",
      id,
      await seal(v, this.env.ENCRYPTION_KEY),
    );
  }
  private async account(id: string) {
    return this.secret<Account>("user:" + id);
  }
  private async state() {
    const s = emptyState();
    for (const row of this.sql
      .exec<{ section: keyof State; value: string }>(
        "SELECT section,value FROM entities",
      )
      .toArray()) {
      const item = await open(row.value, this.env.ENCRYPTION_KEY);
      (s[row.section] as unknown[]).push(item);
    }
    const rows = this.sql
      .exec<{ id: string }>("SELECT id FROM secrets WHERE id LIKE ?", "user:%")
      .toArray();
    for (const r of rows) {
      const a = await this.secret<Account>(r.id);
      if (a) {
        const { passwordHash, ...u } = a;
        s.users.push(u);
      }
    }
    return s;
  }
  private driveClient?: Drive;
  private drive() {
    return (this.driveClient ||= new Drive(async () => {
      let t = await this.secret<OAuthTokens>("drive");
      ensure(t, "OneDrive 연결이 필요합니다", 503);
      if (t.expires_at < Date.now() + 60000) {
        t = await exchange(this.env, {
          grant_type: "refresh_token",
          refresh_token: t.refresh_token,
        });
        await this.setSecret("drive", t);
      }
      return t.access_token;
    }));
  }
  private async user(req: Request) {
    const token =
      req.headers.get("Authorization")?.replace(/^Bearer /, "") ||
      req.headers.get("Cookie")?.match(/(?:^|; )codimate=([^;]+)/)?.[1];
    ensure(token, "로그인이 필요합니다", 401);
    const session = await this.secret<{ id: string; expires: number }>(
      "session:" + (await sha(token)),
    );
    ensure(
      session && session.expires > Date.now(),
      "로그인 세션이 만료되었습니다",
      401,
    );
    const u = await this.account(session.id);
    ensure(u?.active, "계정이 비활성화되었습니다", 401);
    return u;
  }
  private async inquiryStore() {
    return new Inquiries(
      this.sql,
      this.env.ENCRYPTION_KEY,
      this.env.REQUIRE_ONEDRIVE === "true" ? this.drive() : undefined,
      await this.storageRoot(),
    );
  }
  async alarm() {
    const run = this.queue.then(async () => {
      try {
        if (await this.secret("restore-required")) return;
        await this.settleStorageRename();
        const store = await this.inquiryStore();
        await store.purge();
        await store.flush();
      } finally {
        await this.ctx.storage.setAlarm(Date.now() + 3600_000);
      }
    });
    this.queue = run.catch(() => undefined);
    await run;
  }
  private async catalogState() {
    const state = emptyState();
    for (const row of this.sql
      .exec<{ value: string }>(
        "SELECT value FROM entities WHERE section='catalogs'",
      )
      .toArray())
      state.catalogs.push(await open(row.value, this.env.ENCRYPTION_KEY));
    return state;
  }
  private async persistChanges(
    id: string,
    actor: string,
    digest: string,
    changes: Change[],
  ) {
    const seq = Date.now().toString().padStart(16, "0");
    const value = await seal(
      {
        changes,
        operation: { id, actor, digest },
        path: `${await this.storageRoot()}/_codimate/commits/${seq}_${id}.enc`,
      },
      this.env.ENCRYPTION_KEY,
    );
    this.sql.exec(
      "INSERT INTO operations(id,actor,digest,value) VALUES(?,?,?,?)",
      id,
      actor,
      digest,
      value,
    );
    await this.flush();
  }
  private async storageRoot() {
    return (await this.secret<string>("storage-root")) || DEFAULT_STORAGE_ROOT;
  }
  private async settleStorageRename() {
    const pending = await this.secret<{ folderId: string }>("storage-rename");
    if (!pending) return;
    const item = await this.drive().item(pending.folderId);
    ensure(
      item.folder && validStorageRoot(item.name),
      "저장 폴더를 확인하세요",
      409,
    );
    await this.setSecret("storage-root", item.name);
    this.sql.exec("DELETE FROM secrets WHERE id=?", "storage-rename");
  }
  private async verifyMovedStorage(
    root: string,
    folderId: string,
    user: Account,
  ) {
    const message =
      "기존 자료가 보관된 폴더인지 확인할 수 없습니다. 원래 폴더를 복원한 뒤 다시 시도하세요";
    // Recognize an out-of-app rename only when the destination contains the
    // clinic's complete known receipt set and the current administrator backup.
    const rows = this.sql
      .exec<{ value: string }>(
        "SELECT value FROM operations WHERE done=1 ORDER BY rowid",
      )
      .toArray();
    ensure(rows.length > 0, message, 409);
    const commits = await this.drive().listCommits("commits", root);
    const byName = new Map(commits.map((item) => [item.name, item]));
    for (const row of rows) {
      const op = await open<{ path: string }>(
        row.value,
        this.env.ENCRYPTION_KEY,
      );
      ensure(byName.has(op.path.split("/").at(-1)), message, 409);
    }
    const last = rows.at(-1)!;
    const lastOp = await open<{ path: string }>(
      last.value,
      this.env.ENCRYPTION_KEY,
    );
    const lastFile = byName.get(lastOp.path.split("/").at(-1))!;
    ensure(
      (await (await this.drive().get(lastFile.id)).text()) === last.value,
      message,
      409,
    );
    const accountFile = await this.drive().exists(
      `${root}/_codimate/accounts/${user.id}.enc`,
    );
    ensure(accountFile, message, 409);
    const account = await open<Account>(
      await (await this.drive().get(accountFile.id)).text(),
      this.env.ENCRYPTION_KEY,
    );
    ensure(
      account.id === user.id && account.passwordHash === user.passwordHash,
      message,
      409,
    );
    // When media exists, its stable item ID must actually descend from this
    // folder. A copied folder with different item IDs is not an in-place rename.
    for (const row of this.sql
      .exec<{ value: string }>("SELECT value FROM media")
      .toArray()) {
      const media = await open<{ remoteId?: string }>(
        row.value,
        this.env.ENCRYPTION_KEY,
      );
      if (!media.remoteId) continue;
      let id: string | undefined = media.remoteId;
      for (let depth = 0; id && id !== folderId && depth < 10; depth++) {
        id = (await this.drive().item(id)).parentReference?.id;
      }
      ensure(id === folderId, message, 409);
      break;
    }
  }
  private async flush() {
    const root = await this.storageRoot();
    const rows = this.sql
      .exec<{ id: string; value: string }>(
        "SELECT id,value FROM operations WHERE done=0 ORDER BY rowid",
      )
      .toArray();
    for (const row of rows) {
      const op = await open<{ changes: Change[]; path: string }>(
        row.value,
        this.env.ENCRYPTION_KEY,
      );
      if (this.env.REQUIRE_ONEDRIVE === "true") {
        const state = await this.state();
        for (const change of op.changes.filter(
          (x) => x.section === "consultations",
        )) {
          const c = change.value as State["consultations"][number];
          const patient =
            (op.changes.find(
              (x) => x.section === "patients" && x.id === c.patientId,
            )?.value as State["patients"][number]) ||
            state.patients.find((x) => x.id === c.patientId);
          if (patient) {
            const photos = await Promise.all(
              c.photos.map(async (p) => {
                const m = await this.media(p.mediaId);
                const { thumbnail, ...photo } = p;
                return {
                  ...photo,
                  fileName: m?.name,
                  oneDriveItemId: m?.remoteId,
                  path: m?.path ? relocateStoragePath(m.path, root) : undefined,
                };
              }),
            );
            await this.drive().put(
              `${patientFolder(patient, c.category, await this.storageRoot())}/상담_${c.id}.json`,
              JSON.stringify(
                { schemaVersion: 1, consultation: { ...c, photos } },
                null,
                2,
              ),
              "application/json",
            );
          }
        }
        await this.drive().put(
          relocateStoragePath(op.path, root),
          row.value,
          "application/json",
        );
      }
      const encrypted = await Promise.all(
        op.changes.map(async (c) => ({
          ...c,
          value: await seal(c.value, this.env.ENCRYPTION_KEY),
        })),
      );
      this.ctx.storage.transactionSync(() => {
        for (const c of encrypted)
          this.sql.exec(
            "INSERT OR REPLACE INTO entities VALUES(?,?,?)",
            c.section,
            c.id,
            c.value,
          );
        this.sql.exec("UPDATE operations SET done=1 WHERE id=?", row.id);
      });
    }
  }
  async fetch(req: Request): Promise<Response> {
    // Serialize across network awaits as well as SQLite writes.
    const run = this.queue.then(() => this.route(req));
    this.queue = run.catch(() => undefined);
    try {
      return await run;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "처리 중 오류가 발생했습니다";
      return json(
        { error: message },
        e instanceof DomainError
          ? e.status
          : e instanceof Error && e.name === "ZodError"
            ? 400
            : 503,
      );
    }
  }
  private async route(req: Request) {
    const url = new URL(req.url),
      path = url.pathname;
    const body = async () => {
      ensure(
        Number(req.headers.get("content-length") || 0) < 8_000_000,
        "요청이 너무 큽니다",
        413,
      );
      return (await req.json()) as Record<string, any>;
    };
    if (path === "/api/health")
      return json({
        ok: true,
        version: "0.8.3",
        mode:
          this.env.REQUIRE_ONEDRIVE === "true"
            ? "onedrive"
            : "local-development",
        configured: !!this.env.ENCRYPTION_KEY,
        needsSetup: !this.sql
          .exec("SELECT id FROM secrets WHERE id LIKE ? LIMIT 1", "user:%")
          .toArray().length,
      });
    if (path === "/api/app-release" && req.method === "GET")
      return json(latestRelease(await this.secret("release"), bundledRelease));
    if (path === "/api/setup" && req.method === "POST") {
      const b = await body();
      ensure(
        this.env.SETUP_KEY && b.key === this.env.SETUP_KEY,
        "설정 키를 확인하세요",
        403,
      );
      ensure(
        !this.sql
          .exec("SELECT id FROM secrets WHERE id LIKE ? LIMIT 1", "user:%")
          .toArray().length,
        "초기 관리자가 이미 있습니다",
        409,
      );
      ensure(
        typeof b.username === "string" &&
          /^[a-zA-Z0-9_.-]{3,40}$/.test(b.username) &&
          typeof b.name === "string" &&
          b.name.trim(),
        "계정 정보를 확인하세요",
      );
      const a: Account = {
        id: crypto.randomUUID(),
        username: b.username,
        name: b.name,
        role: "admin",
        active: true,
        permissions: {},
        passwordHash: await hashPassword(b.password),
      };
      await this.setSecret("user:" + a.id, a);
      return json({ ok: true });
    }
    if (path === "/api/login-ids" && req.method === "GET") {
      const s = await this.state();
      return json({
        usernames: s.users
          .filter((u) => u.active)
          .map((u) => u.username)
          .sort(),
      });
    }
    if (path === "/api/login" && req.method === "POST") {
      const b = await body();
      const key =
        "attempt:" +
        (await sha(String(b.username) + req.headers.get("CF-Connecting-IP")));
      const attempts = await this.secret<{ count: number; until: number }>(key);
      ensure(
        !attempts || attempts.until < Date.now() || attempts.count < 5,
        "로그인 시도가 많습니다. 5분 후 다시 시도하세요",
        429,
      );
      const s = await this.state(),
        user = s.users.find((u) => u.username === b.username),
        a = user ? await this.account(user.id) : null;
      const ok =
        a?.active &&
        typeof b.password === "string" &&
        (await verifyPassword(b.password, a.passwordHash));
      await this.setSecret(key, {
        count: ok
          ? 0
          : (attempts && attempts.until > Date.now() ? attempts.count : 0) + 1,
        until: Date.now() + 300000,
      });
      ensure(ok, "아이디 또는 비밀번호를 확인하세요", 401);
      const token = crypto.randomUUID() + crypto.randomUUID();
      await this.setSecret("session:" + (await sha(token)), {
        id: a!.id,
        expires: Date.now() + 30 * 24 * 3600000,
      });
      const response = json({ token, user });
      response.headers.set(
        "Set-Cookie",
        `codimate=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=2592000${this.env.APP_ORIGIN.startsWith("https") ? "; Secure" : ""}`,
      );
      return response;
    }
    if (path === "/api/onedrive/callback") {
      const state = url.searchParams.get("state");
      const expected = await this.secret<{ value: string; expires: number }>(
        "oauth",
      );
      ensure(
        state && state === expected?.value && expected.expires > Date.now(),
        "인증 요청이 만료되었습니다",
        403,
      );
      await this.setSecret("oauth", {});
      const tokens = await exchange(this.env, {
        grant_type: "authorization_code",
        code: url.searchParams.get("code") || "",
      });
      await this.setSecret("drive", tokens);
      // A stable item ID finds renamed roots even on a fresh recovery server.
      const locator = await this.drive().exists(".codimate-storage.enc");
      if (locator) {
        const saved = await open<{ folderId: string }>(
          await (await this.drive().get(locator.id)).text(),
          this.env.ENCRYPTION_KEY,
        );
        const item = await this.drive().item(saved.folderId);
        ensure(
          item.folder && validStorageRoot(item.name),
          "저장 폴더를 확인하세요",
          409,
        );
        await this.setSecret("storage-root", item.name);
      }
      await this.settleStorageRename();
      await this.drive().folders(
        (await this.storageRoot()) + "/_codimate/accounts",
      );
      const savedAccounts = await this.drive().listCommits(
        "accounts",
        await this.storageRoot(),
      );
      // Connecting a recovery server must never overwrite the source accounts
      // or add its temporary bootstrap administrator to the source backup.
      for (const row of savedAccounts.length
        ? []
        : this.sql
            .exec<{ id: string }>(
              "SELECT id FROM secrets WHERE id LIKE ?",
              "user:%",
            )
            .toArray()) {
        const account = await this.secret<Account>(row.id);
        if (account)
          await this.drive().put(
            (await this.storageRoot()) +
              "/_codimate/accounts/" +
              account.id +
              ".enc",
            await seal(account, this.env.ENCRYPTION_KEY),
          );
      }
      for (const folder of ["commits", "media"])
        await this.drive().folders(
          (await this.storageRoot()) + "/_codimate/" + folder,
        );
      if (savedAccounts.length) {
        const localUsers = this.sql
          .exec<{ id: string }>(
            "SELECT id FROM secrets WHERE id LIKE ?",
            "user:%",
          )
          .toArray();
        const unknownAccount = localUsers.some(
          (u) => !savedAccounts.some((a) => a.name === u.id.slice(5) + ".enc"),
        );
        const missingHistory =
          !this.sql.exec("SELECT id FROM operations LIMIT 1").toArray()
            .length &&
          (await this.drive().listCommits("commits", await this.storageRoot()))
            .length > 0;
        if (unknownAccount || missingHistory)
          await this.setSecret("restore-required", true);
      }
      return Response.redirect(this.env.APP_ORIGIN + "/?connected=1", 302);
    }
    if (path === "/api/public/catalog" && req.method === "GET") {
      const token = await seal(
        { id: crypto.randomUUID(), expires: Date.now() + 3600_000 },
        this.env.ENCRYPTION_KEY,
      );
      const state = await this.catalogState();
      return json({
        products: publicProducts(state),
        categories: publicCategories(state),
        token,
      });
    }
    if (path === "/api/public/inquiries" && req.method === "POST") {
      ensure(
        !(await this.secret("restore-required")),
        "접수 준비 중입니다. 잠시 후 다시 시도하세요",
        503,
      );
      await this.settleStorageRename();
      const text = await req.text();
      ensure(text.length < 64_000, "입력 내용이 너무 깁니다", 413);
      const input = inquiryInput.parse(JSON.parse(text));
      const ticket = await open<{ id: string; expires: number }>(
        input.token,
        this.env.ENCRYPTION_KEY,
      );
      ensure(
        ticket.expires > Date.now() && /^[\w-]{8,100}$/.test(ticket.id),
        "입력 시간이 만료되었습니다. 새로고침 후 다시 접수하세요",
        400,
      );
      const store = await this.inquiryStore(),
        digest = await sha(JSON.stringify({ ...input, token: undefined }));
      const previous =
        (await store.get(ticket.id)) || (await store.recover(ticket.id));
      if (previous) {
        ensure(
          previous.digest === digest,
          "이미 접수한 내용입니다. 새 접수를 시작하세요",
          409,
        );
        await store.save(previous);
        return json({ ok: true, receipt: ticket.id });
      }
      const rateKey =
        "public-rate:" +
        (await sha(req.headers.get("CF-Connecting-IP") || "local"));
      const rate = await this.secret<{ count: number; expires: number }>(
        rateKey,
      );
      ensure(
        !rate || rate.expires < Date.now() || rate.count < 10,
        "접수가 많습니다. 잠시 후 다시 시도하세요",
        429,
      );
      await this.setSecret(rateKey, {
        count: rate && rate.expires > Date.now() ? rate.count + 1 : 1,
        expires:
          rate && rate.expires > Date.now()
            ? rate.expires
            : Date.now() + 600_000,
      });
      const publicState = await this.catalogState();
      const available = publicProducts(publicState);
      const categories = publicCategories(publicState);
      const chosenCategories = input.concerns.map(
        (id) =>
          categories.find((c) => c.id === id) ||
          categories.find((c) => c.folderId === id),
      );
      ensure(
        chosenCategories.every(Boolean) &&
          input.answers.every((id) =>
            chosenCategories.some((c) => c?.questions.some((q) => q.id === id)),
          ),
        "선택한 고민을 확인하세요",
      );
      ensure(
        input.concerns.length || input.selections.length,
        "관심 고민 또는 시술을 선택하세요",
      );
      const keys = new Set<string>();
      const selections = input.selections.map((selection) => {
        const product = available.find(
            (p) =>
              p.id === selection.productId &&
              p.catalogVersion === selection.catalogVersion,
          ),
          option = product?.options.find((o) => o.id === selection.optionId);
        ensure(
          product && option,
          "단가표가 갱신되었습니다. 새로고침 후 관심 시술을 다시 선택하세요",
          409,
        );
        const key =
          selection.catalogVersion +
          ":" +
          selection.productId +
          ":" +
          selection.optionId;
        ensure(!keys.has(key), "중복된 시술 선택입니다");
        keys.add(key);
        return {
          ...selection,
          book: product.book,
          name: product.name,
          label: option.label,
        };
      });
      const now = new Date().toISOString();
      if (!(await this.ctx.storage.getAlarm()))
        await this.ctx.storage.setAlarm(Date.now() + 3600_000);
      await store.save({
        id: ticket.id,
        createdAt: now,
        expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
        status: "new",
        digest,
        person: input.person,
        selections,
        concerns: input.concerns,
        concernLabels: chosenCategories.map((c) => c!.name),
        answerLabels: input.answers.map(
          (id) =>
            chosenCategories
              .flatMap((c) => c!.questions)
              .find((q) => q.id === id)!.label,
        ),
        answers: input.answers,
        consent: {
          personal: true,
          sensitive: true,
          version: "2026-09-21",
          at: now,
        },
      });
      return json({ ok: true, receipt: ticket.id });
    }
    const user = await this.user(req);
    await this.settleStorageRename();
    const admin = () =>
      ensure(user.role === "admin", "관리자만 가능합니다", 403);
    if (
      [
        "/api/commands",
        "/api/users",
        "/api/media",
        "/api/sync",
        "/api/update",
        "/api/storage",
      ].includes(path) &&
      req.method === "POST"
    )
      ensure(
        !(await this.secret("restore-required")),
        "기존 OneDrive 자료가 있습니다. 원본에서 재구축한 뒤 변경하세요.",
        409,
      );
    if (path === "/api/inquiries" && req.method === "GET")
      return json({ inquiries: await (await this.inquiryStore()).list() });
    if (path === "/api/inquiries/convert" && req.method === "POST") {
      ensure(
        !(await this.secret("restore-required")),
        "원본에서 재구축한 뒤 접수를 연결하세요",
        409,
      );
      const b = await body();
      ensure(typeof b.id === "string", "접수 ID를 확인하세요");
      await this.flush();
      const already = (await this.state()).consultations.find(
        (c) => c.id === "inquiry-" + b.id,
      );
      if (already) {
        await (
          await this.inquiryStore()
        ).complete(b.id, already.patientId, already.id);
        return json({
          ok: true,
          patientId: already.patientId,
          consultationId: already.id,
        });
      }
      const store = await this.inquiryStore(),
        inquiry = await store.get(b.id);
      ensure(
        inquiry && Date.parse(inquiry.expiresAt) > Date.now(),
        "접수가 없거나 보관 기간이 만료되었습니다",
        404,
      );
      await this.flush();
      const before = await this.state(),
        consultationId = "inquiry-" + inquiry.id;
      let consultation = before.consultations.find(
        (c) => c.id === consultationId,
      );
      if (!consultation) {
        let after = before;
        const patientId = b.patientId || "inquiry-" + inquiry.id;
        if (!b.patientId)
          after = await applyCommand(after, user, {
            id: inquiry.id + "-patient",
            type: "patient.create",
            entityId: patientId,
            payload: b.person,
          });
        after = await applyCommand(after, user, {
          id: inquiry.id + "-consult",
          type: "consultation.create",
          entityId: consultationId,
          payload: { patientId, category: b.category },
        });
        const current = after.consultations.find(
          (c) => c.id === consultationId,
        )!;
        const lines = inquiry.selections.flatMap((selection) => {
          const catalog = latestCatalogs(after).find(
              (c) => catalogBook(c) === selection.book,
            ),
            product = catalog?.products.find(
              (p) => p.id === selection.productId && p.active,
            ),
            option = product?.options.find(
              (o) =>
                o.id === selection.optionId &&
                !o.review &&
                o.price !== null &&
                o.tax !== "unknown",
            );
          return product && option && catalog
            ? [
                {
                  id: crypto.randomUUID(),
                  productId: product.id,
                  optionId: option.id,
                  catalogVersion: catalog.version,
                  book: catalogBook(catalog),
                  quantity: 1,
                  discount: { kind: "amount", value: 0 },
                },
              ]
            : [];
        });
        const labels =
          inquiry.concernLabels ||
          inquiry.concerns.map(
            (id) => concerns.find((c) => c.id === id)?.name || id,
          );
        const answers =
          inquiry.answerLabels ||
          inquiry.answers.map(
            (id) =>
              concerns.flatMap((c) => [...c.questions]).find((q) => q.id === id)
                ?.label || id,
          );
        const memo = [
          "맞춤 시술 찾기 접수",
          ...labels,
          ...answers,
          ...inquiry.selections.map(
            (x) => `${x.book} · ${x.name} / ${x.label}`,
          ),
          "검토되지 않은 옵션은 장바구니에 추가하지 않았습니다. 상담 후 확인하세요.",
        ].join("\n");
        after = await applyCommand(after, user, {
          id: inquiry.id + "-save",
          type: "consultation.save",
          entityId: consultationId,
          baseRev: current.rev,
          payload: {
            lines,
            discount: { kind: "amount", value: 0 },
            vat: "separate",
            memo,
            photos: [],
            catalogVersions: current.catalogVersions,
            catalogVersion: current.catalogVersion,
          },
        });
        after.consultations.find((c) => c.id === consultationId)!.intakeSource =
          {
            receiptId: inquiry.id,
            receivedAt: inquiry.createdAt,
            consentVersion: inquiry.consent.version,
            personalConsent: inquiry.consent.personal,
            sensitiveConsent: inquiry.consent.sensitive,
          };
        const changes: Change[] = [];
        for (const section of Object.keys(before) as (keyof State)[]) {
          if (section === "users") continue;
          for (const value of after[section])
            if (
              JSON.stringify(before[section].find((x) => x.id === value.id)) !==
              JSON.stringify(value)
            )
              changes.push({ section, id: value.id, value });
        }
        await this.persistChanges(
          inquiry.id + "-convert",
          user.id,
          await sha(JSON.stringify(b)),
          changes,
        );
        consultation = after.consultations.find(
          (c) => c.id === consultationId,
        )!;
      }
      await store.complete(inquiry.id, consultation.patientId, consultation.id);
      return json({
        ok: true,
        patientId: consultation.patientId,
        consultationId: consultation.id,
      });
    }
    if (path === "/api/storage" && req.method === "GET") {
      admin();
      const rootFolder = await this.storageRoot();
      const name = url.searchParams.get("name") || rootFolder;
      ensure(validStorageRoot(name), "폴더 이름을 확인하세요");
      const item =
        this.env.REQUIRE_ONEDRIVE === "true"
          ? await this.drive().exists(name)
          : undefined;
      return json({
        rootFolder,
        name,
        item: item
          ? {
              id: item.id,
              name: item.name,
              size: item.size,
              folder: item.folder,
            }
          : null,
      });
    }
    if (path === "/api/storage" && req.method === "POST") {
      admin();
      const b = await body();
      ensure(
        validStorageRoot(b.rootFolder),
        "폴더 이름은 80자 이내로 입력하고 경로 구분자·특수문자·끝의 마침표를 제외하세요",
      );
      const current = await this.storageRoot();
      ensure(
        b.baseRoot === current,
        "다른 기기에서 저장 폴더를 변경했습니다. 새로고침 후 다시 시도하세요",
        409,
      );
      if (b.rootFolder === current)
        return json({ ok: true, rootFolder: current });
      if (this.env.REQUIRE_ONEDRIVE === "true") {
        const source = await this.drive().exists(current);
        const target = await this.drive().exists(b.rootFolder);
        if (!source && target?.folder) {
          ensure(
            this.sql.exec("SELECT id FROM operations WHERE done=0").toArray()
              .length === 0,
            "대기 작업이 있습니다. OneDrive 폴더를 원래 이름으로 복원하고 저장 재시도 후 변경하세요",
            409,
          );
          await this.verifyMovedStorage(b.rootFolder, target.id, user);
          await this.drive().put(
            ".codimate-storage.enc",
            await seal({ folderId: target.id }, this.env.ENCRYPTION_KEY),
          );
          await this.setSecret("storage-root", b.rootFolder);
          return json({
            ok: true,
            rootFolder: b.rootFolder,
            reconnected: true,
          });
        }
        ensure(
          source?.folder,
          "현재 저장 폴더가 없습니다. OneDrive 연결과 폴더를 확인하세요",
          409,
        );
        ensure(
          !target || target.id === source.id,
          "같은 이름의 파일이나 폴더가 이미 있습니다. 다른 이름을 입력하세요",
          409,
        );
        await this.flush();
        // Write the stable locator BEFORE renaming, so recovery works even if
        // the process stops after Graph accepts PATCH but before local commit.
        await this.drive().put(
          ".codimate-storage.enc",
          await seal({ folderId: source.id }, this.env.ENCRYPTION_KEY),
        );
        await this.setSecret("storage-rename", { folderId: source.id });
        await this.drive().renameFolder(source.id, b.rootFolder);
        await this.settleStorageRename();
      } else {
        await this.flush();
        await this.setSecret("storage-root", b.rootFolder);
      }
      return json({ ok: true, rootFolder: await this.storageRoot() });
    }
    if (path === "/api/backup" && req.method === "POST") {
      admin();
      const snapshot = {
        version: 1,
        createdAt: new Date().toISOString(),
        entities: this.sql.exec("SELECT * FROM entities").toArray(),
        operations: this.sql
          .exec("SELECT * FROM operations WHERE done=1")
          .toArray(),
        accounts: this.sql
          .exec("SELECT * FROM secrets WHERE id LIKE ?", "user:%")
          .toArray(),
        media: this.sql.exec("SELECT * FROM media").toArray(),
        storageRoot: await this.storageRoot(),
      };
      return json({
        encrypted: await seal(snapshot, this.env.ENCRYPTION_KEY),
        note: "사진·PDF 원본은 OneDrive에서 별도로 백업해야 합니다.",
      });
    }
    if (path === "/api/update" && req.method === "GET")
      return json(latestRelease(await this.secret("release"), bundledRelease));
    if (path === "/api/update" && req.method === "POST") {
      admin();
      const b = await body();
      ensure(!!parseRelease(b), "버전·APK 주소·SHA-256을 확인하세요");
      const release = {
        versionCode: b.versionCode,
        version: b.version,
        notes: b.notes,
        url: b.url,
        sha256: b.sha256,
        publishedAt: new Date().toISOString(),
        actorId: user.id,
      };
      if (this.env.REQUIRE_ONEDRIVE === "true")
        await this.drive().put(
          (await this.storageRoot()) + "/_codimate/update.json",
          JSON.stringify(release),
          "application/json",
        );
      await this.setSecret("release", release);
      return json({ ok: true });
    }
    if (path === "/api/logout") {
      const token =
        req.headers.get("Authorization")?.replace(/^Bearer /, "") ||
        req.headers.get("Cookie")?.match(/codimate=([^;]+)/)?.[1];
      if (token)
        this.sql.exec(
          "DELETE FROM secrets WHERE id=?",
          "session:" + (await sha(token)),
        );
      const r = json({ ok: true });
      r.headers.set(
        "Set-Cookie",
        "codimate=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0",
      );
      return r;
    }
    if (path === "/api/state") {
      const s = await this.state();
      if (!allowed(user, "note.read")) s.notes = [];
      if (!allowed(user, "money.read")) {
        s.ledger = [];
        s.consultations = s.consultations.map((c) => ({
          ...c,
          quote: emptyQuote(),
        }));
      }
      if (!allowed(user, "catalog.edit")) {
        s.catalogs = s.catalogs.filter((c) => c.status === "published");
        s.catalogRevisions = [];
      }
      return json({
        state: s,
        user: { ...user, passwordHash: undefined },
        pending: this.sql
          .exec("SELECT id FROM operations WHERE done=0")
          .toArray().length,
        driveConnected: !!(await this.secret("drive")),
        storageRoot: await this.storageRoot(),
        publicUrl: this.env.APP_ORIGIN + "/discover",
        restoreRequired: !!(await this.secret("restore-required")),
        mode:
          this.env.REQUIRE_ONEDRIVE === "true"
            ? "onedrive"
            : "local-development",
      });
    }
    if (path === "/api/onedrive/connect") {
      admin();
      ensure(
        this.env.MICROSOFT_CLIENT_ID && this.env.MICROSOFT_CLIENT_SECRET,
        "Microsoft 앱 등록 설정이 필요합니다",
        503,
      );
      const value = crypto.randomUUID();
      await this.setSecret("oauth", { value, expires: Date.now() + 600000 });
      return json({ url: loginUrl(this.env, value) });
    }
    if (path === "/api/users" && req.method === "POST") {
      admin();
      const b = await body();
      ensure(
        ["admin", "doctor", "coordinator"].includes(b.role) &&
          typeof b.username === "string" &&
          /^[a-zA-Z0-9_.-]{3,40}$/.test(b.username) &&
          typeof b.name === "string" &&
          b.name.trim(),
        "계정 정보를 확인하세요",
      );
      const id = b.id || crypto.randomUUID(),
        old = await this.account(id),
        state = await this.state();
      ensure(/^[\w-]{1,100}$/.test(id), "계정 ID를 확인하세요");
      ensure(
        !state.users.some((u) => u.username === b.username && u.id !== id),
        "이미 사용 중인 아이디입니다",
      );
      ensure(
        id !== user.id || (b.active && b.role === "admin"),
        "현재 관리자 계정은 비활성화하거나 강등할 수 없습니다",
      );
      const a: Account = {
        id,
        username: b.username,
        name: b.name,
        role: b.role,
        active: !!b.active,
        permissions: Object.fromEntries(
          Object.entries(b.permissions || {}).filter(
            ([k, v]) =>
              permissions.includes(k as any) && typeof v === "boolean",
          ),
        ),
        passwordHash: b.password
          ? await hashPassword(b.password)
          : old?.passwordHash || "",
      };
      ensure(a.passwordHash, "비밀번호를 입력하세요");
      if (this.env.REQUIRE_ONEDRIVE === "true")
        await this.drive().put(
          (await this.storageRoot()) + "/_codimate/accounts/" + id + ".enc",
          await seal(a, this.env.ENCRYPTION_KEY),
        );
      await this.setSecret("user:" + id, a);
      if (b.password || !a.active) {
        for (const row of this.sql
          .exec<{ id: string }>(
            "SELECT id FROM secrets WHERE id LIKE ?",
            "session:%",
          )
          .toArray()) {
          const session = await this.secret<{ id: string }>(row.id);
          if (session?.id === id)
            this.sql.exec("DELETE FROM secrets WHERE id=?", row.id);
        }
      }
      return json({ ok: true });
    }
    if (path === "/api/commands" && req.method === "POST") {
      const cmd = (await body()) as Command;
      const digest = await sha(JSON.stringify(cmd));
      const previous = this.sql
        .exec<{ actor: string; digest: string; done: number }>(
          "SELECT actor,digest,done FROM operations WHERE id=?",
          cmd.id,
        )
        .toArray()[0];
      if (previous) {
        ensure(
          previous.actor === user.id && previous.digest === digest,
          "작업 ID를 다른 내용에 재사용할 수 없습니다",
          409,
        );
        await this.flush();
        return json({ ok: true, replayed: true });
      }
      await this.flush();
      const before = await this.state();
      const after = await applyCommand(before, user, cmd);
      if (
        cmd.type === "consultation.finalize" ||
        cmd.type === "consultation.save"
      ) {
        const c = after.consultations.find((c) => c.id === cmd.entityId)!;
        for (const id of [...c.photos.map((p) => p.mediaId), ...c.documents]) {
          const m = await this.media(id);
          ensure(
            m &&
              (m.consultationId === c.id ||
                (!c.documents.includes(id) &&
                  before.consultations.some(
                    (source) =>
                      source.id === m.consultationId &&
                      source.patientId === c.patientId &&
                      source.category === c.category,
                  ))),
            "같은 환자·구분의 사진 업로드를 먼저 완료하세요",
            409,
          );
          if (
            this.env.REQUIRE_ONEDRIVE === "true" &&
            m.remoteId &&
            !m.path &&
            m.mime.startsWith("image/")
          ) {
            // Copy legacy photos on first save. Preserve old files and stable app media IDs.
            const patient = after.patients.find((p) => p.id === c.patientId)!;
            const source = before.consultations.find(
              (x) => x.id === m.consultationId,
            )!;
            const capturedAt =
              c.photos.find((p) => p.mediaId === id)?.capturedAt ||
              m.capturedAt ||
              source.createdAt;
            const folder = patientFolder(
                patient,
                c.category,
                await this.storageRoot(),
              ),
              name = photoFileName(patient, capturedAt, m.mime);
            const reservation = await this.secret<{ path: string }>(
              "legacy-path:" + id,
            );
            let path = reservation?.path
              ? relocateStoragePath(reservation.path, await this.storageRoot())
              : `${folder}/${name}`;
            if (!reservation) {
              if (await this.drive().exists(path))
                path = path.replace(/(\.[^.]+)$/, "_" + id + "$1");
              await this.setSecret("legacy-path:" + id, { path });
            }
            const bytes = await (
              await this.drive().get(m.remoteId)
            ).arrayBuffer();
            const copied = await this.drive().put(path, bytes, m.mime);
            ensure(
              copied.size === m.size,
              "기존 사진 복사 크기가 다릅니다",
              503,
            );
            const value = await seal(
              {
                ...m,
                id,
                path,
                name: path.split("/").at(-1),
                capturedAt,
                remoteId: copied.id,
              },
              this.env.ENCRYPTION_KEY,
            );
            await this.drive().put(
              `${await this.storageRoot()}/_codimate/media/${id}.enc`,
              value,
            );
            this.sql.exec(
              "INSERT OR REPLACE INTO media VALUES(?,?)",
              id,
              value,
            );
          }
        }
      }
      const changes: Change[] = [];
      for (const section of Object.keys(before) as (keyof State)[]) {
        if (section === "users") continue;
        for (const v of after[section])
          if (
            JSON.stringify(before[section].find((x) => x.id === v.id)) !==
            JSON.stringify(v)
          )
            changes.push({ section, id: v.id, value: v });
      }
      await this.persistChanges(cmd.id, user.id, digest, changes);
      return json({
        ok: true,
        savedTo:
          this.env.REQUIRE_ONEDRIVE === "true" ? "OneDrive" : "개발 서버",
      });
    }
    if (path === "/api/sync" && req.method === "POST") {
      await this.flush();
      return json({ ok: true });
    }
    if (path === "/api/restore" && req.method === "POST") {
      admin();
      ensure(
        this.sql.exec("SELECT id FROM operations WHERE done=0").toArray()
          .length === 0,
        "대기 작업을 먼저 처리하세요",
        409,
      );
      const commits = await this.drive().listCommits(
        "commits",
        await this.storageRoot(),
      );
      const changes: Change[] = [];
      const receipts: {
        id: string;
        actor: string;
        digest: string;
        value: string;
      }[] = [];
      for (const item of commits) {
        const raw = await (await this.drive().get(item.id)).text();
        const op = await open<{
          changes: Change[];
          operation?: { id: string; actor: string; digest: string };
        }>(raw, this.env.ENCRYPTION_KEY);
        changes.push(...op.changes);
        if (op.operation) receipts.push({ ...op.operation, value: raw });
      }
      const encrypted = await Promise.all(
        changes.map(async (c) => ({
          ...c,
          value: await seal(c.value, this.env.ENCRYPTION_KEY),
        })),
      );
      const restored: { table: string; id: string; value: string }[] = [];
      let activeAdmins = 0;
      for (const folder of ["accounts", "media"]) {
        await this.drive().folders(
          (await this.storageRoot()) + "/_codimate/" + folder,
        );
        for (const item of await this.drive().listCommits(
          folder,
          await this.storageRoot(),
        )) {
          const value = await (await this.drive().get(item.id)).text();
          const record = await open<{
            id: string;
            role?: string;
            active?: boolean;
          }>(value, this.env.ENCRYPTION_KEY);
          ensure(record.id, "복구 파일 ID가 없습니다");
          if (folder === "accounts" && record.role === "admin" && record.active)
            activeAdmins++;
          restored.push({
            table: folder === "accounts" ? "secrets" : "media",
            id: (folder === "accounts" ? "user:" : "") + record.id,
            value,
          });
        }
      }
      const inquiries: {
        id: string;
        value: string;
        expires: number;
        remoteId: string;
      }[] = [];
      await this.drive().folders(
        `${await this.storageRoot()}/_codimate/inquiries`,
      );
      for (const item of await this.drive().listCommits(
        "inquiries",
        await this.storageRoot(),
      )) {
        const value = await (await this.drive().get(item.id)).text();
        const record = await open<Inquiry>(value, this.env.ENCRYPTION_KEY);
        ensure(
          record.id && Number.isFinite(Date.parse(record.expiresAt)),
          "접수 복구 기록을 확인하세요",
        );
        inquiries.push({
          id: record.id,
          value,
          expires: Date.parse(record.expiresAt),
          remoteId: item.id,
        });
      }
      if (inquiries.length)
        await this.ctx.storage.setAlarm(Date.now() + 60_000);
      ensure(
        activeAdmins > 0,
        "원본에 활성 관리자 계정이 없습니다. 기존 서버를 유지합니다.",
        409,
      );
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM entities");
        this.sql.exec("DELETE FROM operations");
        this.sql.exec("DELETE FROM media");
        this.sql.exec("DELETE FROM inquiries");
        for (const row of inquiries)
          this.sql.exec(
            "INSERT INTO inquiries VALUES(?,?,?,?)",
            row.id,
            row.value,
            row.expires,
            row.remoteId,
          );
        this.sql.exec(
          "DELETE FROM secrets WHERE id LIKE ? OR id LIKE ?",
          "user:%",
          "session:%",
        );
        this.sql.exec("DELETE FROM secrets WHERE id=?", "restore-required");
        for (const r of receipts)
          this.sql.exec(
            "INSERT OR REPLACE INTO operations(id,actor,digest,value,done) VALUES(?,?,?,?,1)",
            r.id,
            r.actor,
            r.digest,
            r.value,
          );
        for (const r of restored)
          this.sql.exec(
            `INSERT OR REPLACE INTO ${r.table} VALUES(?,?)`,
            r.id,
            r.value,
          );
        for (const c of encrypted)
          this.sql.exec(
            "INSERT OR REPLACE INTO entities VALUES(?,?,?)",
            c.section,
            c.id,
            c.value,
          );
      });
      const response = json({
        ok: true,
        commits: commits.length,
        requiresLogin: true,
      });
      response.headers.set(
        "Set-Cookie",
        "codimate=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0",
      );
      return response;
    }
    if (path === "/api/media" && req.method === "POST") {
      const consultationId = req.headers.get("X-Consultation-Id") || "";
      const s = await this.state(),
        c = s.consultations.find((c) => c.id === consultationId);
      ensure(
        c &&
          (user.role === "admin" ||
            (c.ownerId === user.id && c.status === "H")),
        "사진·문서 업로드 권한이 없습니다",
        403,
      );
      const mime = req.headers.get("Content-Type") || "";
      ensure(
        ["image/jpeg", "image/png", "application/pdf"].includes(mime),
        "지원하지 않는 파일 형식",
      );
      const data = await req.arrayBuffer();
      ensure(
        data.byteLength <= 8_000_000,
        "파일은 8MB 이하로 업로드하세요",
        413,
      );
      const id = req.headers.get("X-Upload-Id") || crypto.randomUUID();
      ensure(/^[\w-]{8,100}$/.test(id), "업로드 ID를 확인하세요");
      const fingerprint = await sha(Buffer.from(data).toString("base64"));
      const previous = await this.media(id);
      if (previous) {
        ensure(
          previous.consultationId === c.id &&
            previous.fingerprint === fingerprint,
          "업로드 ID 충돌",
          409,
        );
        return json({ id });
      }
      const name = decodeURIComponent(
        req.headers.get("X-File-Name") || "photo",
      ).replace(/[\\/:*?"<>|]/g, "_");
      let remoteId: string | undefined, storagePath: string | undefined;
      const capturedAt =
        req.headers.get("X-Captured-At") || new Date().toISOString();
      ensure(Number.isFinite(Date.parse(capturedAt)), "촬영 날짜를 확인하세요");
      if (this.env.REQUIRE_ONEDRIVE === "true") {
        const patient = s.patients.find((p) => p.id === c.patientId)!;
        const folder = patientFolder(
          patient,
          c.category,
          await this.storageRoot(),
        );
        const filename =
          mime === "application/pdf"
            ? name
            : photoFileName(patient, capturedAt, mime);
        const reserved = await this.secret<{
          path: string;
          fingerprint: string;
        }>("upload-path:" + id);
        if (reserved) {
          ensure(reserved.fingerprint === fingerprint, "업로드 ID 충돌", 409);
          storagePath = relocateStoragePath(
            reserved.path,
            await this.storageRoot(),
          );
        } else {
          storagePath = `${folder}/${filename}`;
          if (await this.drive().exists(storagePath))
            storagePath = storagePath.replace(/(\.[^.]+)$/, "_" + id + "$1");
          await this.setSecret("upload-path:" + id, {
            path: storagePath,
            fingerprint,
          });
        }
        const r = await this.drive().put(storagePath, data, mime);
        ensure(
          r.size === data.byteLength,
          "업로드 파일 크기가 일치하지 않습니다",
        );
        remoteId = r.id;
      } else {
        const a = new Uint8Array(data);
        for (let i = 0; i < a.length; i += 300000)
          await this.setSecret(
            "file:" + id + ":" + i,
            Buffer.from(a.slice(i, i + 300000)).toString("base64"),
          );
      }
      const value = await seal(
        {
          id,
          name: storagePath?.split("/").at(-1) || name,
          path: storagePath,
          capturedAt,
          patientId: c.patientId,
          category: c.category,
          mime,
          consultationId,
          remoteId,
          fingerprint,
          size: data.byteLength,
        },
        this.env.ENCRYPTION_KEY,
      );
      if (remoteId)
        await this.drive().put(
          (await this.storageRoot()) + "/_codimate/media/" + id + ".enc",
          value,
        );
      this.sql.exec("INSERT INTO media VALUES(?,?)", id, value);
      return json({ id });
    }
    if (path.startsWith("/api/media/")) {
      const id = path.split("/").pop()!,
        m = await this.media(id);
      ensure(m, "파일이 없습니다", 404);
      // Stored consultation PDFs contain the unredacted quotation. Hiding
      // amounts in /state alone does not protect these downloadable documents.
      if (m.mime === "application/pdf")
        ensure(
          allowed(user, "money.read") && allowed(user, "export"),
          "상담 문서 열람·내보내기 권한이 없습니다",
          403,
        );
      let data: ArrayBuffer;
      if (m.remoteId)
        data = await (await this.drive().get(m.remoteId)).arrayBuffer();
      else {
        const a = new Uint8Array(m.size);
        for (let i = 0; i < m.size; i += 300000) {
          const s = await this.secret<string>("file:" + id + ":" + i);
          ensure(s, "파일 조각이 없습니다", 503);
          a.set(Buffer.from(s, "base64"), i);
        }
        data = a.buffer;
      }
      return new Response(data, {
        headers: {
          "Content-Type": m.mime,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    throw new DomainError("API를 찾을 수 없습니다", 404);
  }
  private async media(id: string) {
    const row = this.sql
      .exec<{ value: string }>("SELECT value FROM media WHERE id=?", id)
      .toArray()[0];
    return row
      ? open<{
          consultationId: string;
          remoteId?: string;
          size: number;
          mime: string;
          fingerprint?: string;
          name?: string;
          path?: string;
          capturedAt?: string;
        }>(row.value, this.env.ENCRYPTION_KEY)
      : undefined;
  }
}
