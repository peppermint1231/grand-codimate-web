import { guideAccountReport } from "../core/guideLearningReport";
import type { Inquiry } from "../core/discovery";
import { consultationTimes, seoulToday } from "../core/appointments";
import {
  emptyState,
  emptyQuote,
  catalogBooks,
  type State,
  type User,
} from "../core/model";
import { applyCommand } from "../core/domain";
import { diffStateChanges } from "../core/stateChanges";
import { patientIndex, searchPatients } from "../core/patientSearch";
import { buildAnalytics } from "../core/analytics";
import { defaultVipPolicy, reconcileVip } from "../core/vipPoints";
import { setTrainingRuntime, type TrainingRoute } from "./environment";
export type PracticeCheckpoint = {
  kind: "codimate-practice-v1";
  state: State;
  route: TrainingRoute;
  actions: ReplayAction[];
  drafts?: State["consultations"];
  inquiries?: Inquiry[];
  editors?: Record<string, any>;
};
export type ReplayAction = {
  selector: string;
  value?: string;
  checked?: boolean;
};
export const practiceUser: User = {
  id: "practice-admin",
  name: "박지훈",
  username: "practice",
  role: "doctor",
  permissionLevel: "admin",
  active: true,
  permissions: {},
};
export function practiceState(): State {
  const s = emptyState(),
    now = new Date().toISOString(),
    base = { rev: 1, createdAt: now, updatedAt: now };
  s.users = [
    practiceUser,
    {
      ...practiceUser,
      id: "practice-staff",
      name: "최수진",
      role: "coordinator",
      permissionLevel: "standard",
    },
    {
      ...practiceUser,
      id: "practice-doctor",
      name: "정민호",
      permissionLevel: "standard",
    },
  ];
  s.patients = [
    {
      ...base,
      id: "practice-patient",
      number: "연습001",
      name: "이서연",
      sex: "F",
      dob: "1990-01-01",
      phone: "01000000001",
      address: "강원특별자치도 춘천시 후평동",
      ownerId: practiceUser.id,
    },
  ];
  s.catalogs = catalogBooks.map((book, i) => ({
    ...base,
    id: "practice-catalog-" + i,
    schemaVersion: 1,
    book,
    version: "practice-" + i,
    status: "published",
    publishedAt: now,
    references: [],
    folders: [],
    products: [
      {
        ...base,
        id: "practice-product-" + i,
        category: "색소·기미",
        folderId: "pigment",
        name: "연습토닝",
        description: "가상 환자를 위한 교육용 시술입니다.",
        composition: "",
        active: true,
        publicVisible: true,
        sources: [],
        options: [
          {
            id: "practice-option-" + i,
            label: "1회",
            price: 100000,
            tax: "exclusive",
            review: false,
            issues: [],
            sources: [],
            priceKind: book === "이벤트" ? "event" : "clinic",
            unit: "회",
          },
        ],
      },
    ],
  }));
  for (const catalog of s.catalogs) {
    catalog.products.push({
      ...structuredClone(catalog.products[0]),
      id: catalog.id + "-block",
      options: catalog.products[0].options.map((o) => ({
        ...o,
        id: o.id + "-block",
      })),
      name: "연습 시술 블록",
      productType: "block",
      active: false,
      publicVisible: false,
    });
  }
  const quote = {
    ...emptyQuote(),
    subtotal: 100000,
    supply: 100000,
    vatAmount: 10000,
    total: 110000,
    lines: [
      {
        id: "practice-line",
        productId: "practice-product-0",
        optionId: "practice-option-0",
        book: "미용" as const,
        catalogVersion: "practice-0",
        name: "연습토닝",
        label: "1회",
        price: 100000,
        unit: "회",
        quantity: 1,
        tax: "exclusive" as const,
        discount: { kind: "amount" as const, value: 0 },
      },
    ],
  };
  const consult = {
    ...base,
    id: "practice-consult",
    patientId: "practice-patient",
    patient: s.patients[0],
    ownerId: practiceUser.id,
    category: "미용" as const,
    status: "H" as const,
    cancelled: false,
    catalogVersion: "practice-0",
    quote,
    memo: "",
    photos: [1, 2].map((n) => ({
      id: "practice-photo-" + n,
      name: `연습사진${n}.jpg`,
      mediaId: "practice-media-" + n,
      selected: true,
      representative: n === 1,
      rotation: 0,
      annotations: [],
    })),
    appointment: "",
    attendance: "방문" as const,
    documents: [],
  };
  s.consultations = [
    consult,
    { ...structuredClone(consult), id: "practice-paid", status: "P" },
  ];
  s.policies = [
    {
      ...base,
      id: "grades",
      grades: [{ id: "VIP", name: "VIP", minimum: 5000000, color: "#145d55" }],
      vip: { ...defaultVipPolicy, enabled: true, startedAt: now },
    },
  ];
  s.patients[0].external = {
    source: "vegas",
    fileHash: "practice",
    rows: [],
    visitCount: 1,
    issues: [],
    totalPaid: 6000000,
    firstVisit: now.slice(0, 10),
    lastVisit: now.slice(0, 10),
  } as any;
  s.consents = [
    {
      ...base,
      id: "practice-consent",
      name: "교육용 시술동의서",
      body: "실제 진료에 사용하지 않는 가상 동의서입니다.",
      checks: ["가상 자료로 연습함을 확인했습니다."],
      productIds: ["practice-product-0"],
      status: "published",
      version: 1,
    },
  ];
  reconcileVip(s, now, "practice");
  return s;
}
export function installPractice(checkpoint?: PracticeCheckpoint) {
  let state =
    checkpoint?.kind === "codimate-practice-v1"
      ? structuredClone(checkpoint.state)
      : practiceState();
  let nextDay = seoulToday(Date.now() + 86400000);
  for (let i = 0; i < 30 && !consultationTimes(nextDay).length; i++)
    nextDay = seoulToday(Date.parse(nextDay + "T00:00:00Z") + 86400000);
  let inquiries: Inquiry[] = checkpoint?.inquiries || [
    {
      id: "practice-inquiry",
      createdAt: new Date().toISOString(),
      expiresAt: "2099-01-01T00:00:00Z",
      status: "new",
      rev: 0,
      visitType: "returning",
      requestedDate: nextDay,
      requestedTime: "10:00",
      digest: "practice",
      person: {
        name: "이서연",
        phone: "01000000001",
        sex: "F",
        dob: "1990-01-01",
        address: "춘천시 후평동",
      },
      selections: [],
      concerns: [],
      answers: [],
      consent: {
        personal: true,
        sensitive: true,
        version: "2026-10-06",
        at: new Date().toISOString(),
      },
    },
  ];
  const emit = (type: string, payload: unknown) => {
    if (typeof window !== "undefined")
      setTimeout(
        () =>
          window.dispatchEvent(
            new CustomEvent("practice:command", { detail: { type, payload } }),
          ),
        80,
      );
  };
  const initialEditors = new Map(Object.entries(checkpoint?.editors || {}));
  const editors = new Map(initialEditors);
  if (typeof window !== "undefined")
    window.addEventListener("practice:editor", (e) => {
      const { id, state } = (e as CustomEvent).detail;
      if (state) editors.set(id, state);
      else editors.delete(id);
    });
  const initialDrafts = new Map(
    (checkpoint?.drafts || []).map((c) => [c.id, c]),
  );
  const drafts = new Map<string, State["consultations"][number]>(
    (checkpoint?.drafts || []).map((c) => [c.id, c]),
  );
  if (typeof window !== "undefined")
    window.addEventListener("practice:draft", (e) => {
      const c = (e as CustomEvent).detail;
      drafts.set(c.id, c);
    });
  const media = new Blob(
    [
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e6ede8"/><ellipse cx="300" cy="290" rx="170" ry="220" fill="#d9bda5"/><circle cx="240" cy="245" r="12" fill="#555"/><circle cx="360" cy="245" r="12" fill="#555"/><path d="M260 365 Q300 390 340 365" fill="none" stroke="#876" stroke-width="8"/><text x="300" y="555" text-anchor="middle" font-size="28" fill="#36594f">연습용 가상 사진</text></svg>',
    ],
    { type: "image/svg+xml" },
  );
  const api = async (path: string, init: RequestInit = {}) => {
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const u = new URL(path, "https://practice.invalid"),
      p = u.pathname,
      q = Object.fromEntries(u.searchParams),
      body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    if (p === "/state")
      return {
        state: structuredClone(state),
        user: practiceUser,
        pending: 0,
        mode: "training",
        patientScope: "all",
      };
    if (p === "/health")
      return {
        ok: true,
        configured: true,
        mode: "training",
        version: "연습",
        storageConfigured: true,
      };
    if (p === "/quote-reasons") return { reasons: [] };
    if (p === "/intake/analytics-status")
      return { configured: false, ready: false };
    if (p === "/login-ids") return { usernames: [] };
    if (p === "/opinions") return { opinions: structuredClone(state.opinions) };
    if (p === "/access" || p === "/logout") return { ok: true };
    if (p === "/patients/search")
      return searchPatients(patientIndex(state), {
        search: "",
        grade: "",
        owner: "",
        sort: "name",
        since: "",
        ...q,
        page: Number(q.page) || 0,
        archived: q.archived === "true",
        duplicateOnly: q.duplicateOnly === "true",
        unpaid: q.unpaid === "true",
      } as any);
    if (p === "/analytics")
      return buildAnalytics(state, {
        ...q,
        cohorts: q.cohorts?.split(","),
      } as any);
    if (p.startsWith("/catalogs/"))
      return {
        catalog: structuredClone(
          state.catalogs.find(
            (c) => c.id === decodeURIComponent(p.split("/")[2]),
          ),
        ),
      };
    if (p === "/inquiries")
      return {
        inquiries: structuredClone(inquiries),
        appointments: [],
        closures: { rev: 0, dates: [] },
      };
    if (p === "/inquiries/schedule" && init.method === "POST") {
      const item = inquiries.find((i) => i.id === body.id);
      if (
        !item ||
        !state.users.some((u) => u.id === body.coordinatorId) ||
        !consultationTimes(body.date).includes(body.time)
      )
        throw Object.assign(Error("연습 상담일·시간·상담자를 확인하세요."), {
          status: 400,
        });
      item.schedule = {
        date: body.date,
        time: body.time,
        coordinatorId: body.coordinatorId,
        confirmed: body.action === "confirm",
        updatedBy: practiceUser.id,
        updatedAt: new Date().toISOString(),
      };
      item.rev = (item.rev || 0) + 1;
      emit("practice.schedule", body);
      return { inquiry: structuredClone(item) };
    }
    if (p === "/inquiries/manage" && init.method === "POST") {
      if (body.action !== "delete")
        throw Object.assign(
          Error("연습에서는 강조된 요청 삭제를 진행하세요."),
          { status: 400 },
        );
      inquiries = inquiries.filter((i) => i.id !== body.id);
      emit("practice.inquiryDelete", body);
      return { ok: true };
    }
    if (p === "/vip-shares" && init.method === "POST") {
      if (!state.patients.some((p) => p.id === body.patientId))
        throw Object.assign(Error("가상 환자를 찾을 수 없습니다."), {
          status: 404,
        });
      emit("practice.vipShare", body);
      return {
        share:
          body.action === "revoke"
            ? null
            : {
                id: "practice-share",
                url: "https://practice.invalid/vip-demo",
                createdAt: new Date().toISOString(),
              },
      };
    }
    if (p === "/commands") {
      const before = state;
      state = await applyCommand(state, practiceUser, body);
      const result = { ok: true, changes: diffStateChanges(before, state) };
      setTimeout(
        () =>
          window.dispatchEvent(
            new CustomEvent("practice:command", { detail: body }),
          ),
        80,
      );
      return result;
    }
    if (
      p === "/guide-progress/accounts" &&
      (!init.method || init.method === "GET")
    )
      return {
        accounts: state.users.map((u) =>
          guideAccountReport(u, { lessons: {} }),
        ),
      };
    if (p === "/users" && init.method === "POST") {
      const i = state.users.findIndex((x) => x.id === body.id);
      if (i < 0)
        throw Object.assign(Error("연습 계정을 선택하세요."), { status: 400 });
      state.users[i] = { ...state.users[i], ...body };
      window.dispatchEvent(
        new CustomEvent("practice:command", {
          detail: { type: "practice.users", payload: body },
        }),
      );
      return { ok: true };
    }
    if (p === "/storage" && init.method === "POST") {
      window.dispatchEvent(
        new CustomEvent("practice:command", {
          detail: { type: "practice.storage", payload: body },
        }),
      );
      return { ok: true, folder: body.folder };
    }
    throw Object.assign(
      new Error(
        "이 연습에서는 해당 외부 작업을 실행하지 않습니다. 강조된 항목을 따라 진행해주세요.",
      ),
      { status: 400 },
    );
  };
  setTrainingRuntime({
    api,
    media: () => media,
    editor: (id) => {
      const value = initialEditors.get(id);
      initialEditors.delete(id);
      return value;
    },
    draft: (id) => {
      const c = initialDrafts.get(id);
      initialDrafts.delete(id);
      return c;
    },
  });
  return {
    snapshot: () => structuredClone(state),
    drafts: () => structuredClone([...drafts.values()]),
    editors: () => structuredClone(Object.fromEntries(editors)),
    inquiries: () => structuredClone(inquiries),
    replace: (s: State) => {
      state = structuredClone(s);
    },
  };
}
/** Installed before importing App. No production storage, requests, plugins or windows. */
export function isolatePractice() {
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content =
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; frame-src 'self'; form-action 'none'; object-src 'none'";
  document.head.appendChild(policy);
  const memory = () => {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      getItem: (k: string) => m.get(k) ?? null,
      key: (i: number) => [...m.keys()][i] ?? null,
      removeItem: (k: string) => m.delete(k),
      setItem: (k: string, v: string) => m.set(k, String(v)),
    };
  };
  for (const key of ["localStorage", "sessionStorage"])
    Object.defineProperty(window, key, { value: memory(), configurable: true });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const u = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      location.href,
    );
    if (
      ["blob:", "data:"].includes(u.protocol) ||
      (u.origin === location.origin &&
        !u.pathname.startsWith("/api/") &&
        (!init?.method || init.method === "GET"))
    )
      return originalFetch(input, { ...init, credentials: "omit" });
    throw Error("연습 모드에서는 외부 연결이 차단됩니다.");
  };
  Object.defineProperty(window, "XMLHttpRequest", {
    value: class {
      constructor() {
        throw Error("연습 모드 외부 업로드 차단");
      }
    },
  });
  Object.defineProperty(window, "indexedDB", {
    value: {
      open() {
        throw Error("연습 모드에서는 기기 보관소를 사용하지 않습니다.");
      },
    },
  });
  window.open = () => null;
  window.print = () => window.dispatchEvent(new CustomEvent("practice:print"));
  window.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element)?.closest?.("a");
      if (
        a &&
        a.href &&
        !a.href.startsWith("blob:") &&
        !a.href.startsWith("data:")
      )
        e.preventDefault();
    },
    true,
  );
}
