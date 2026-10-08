import reference from "./discoveryReference.json";
import type { Product } from "./model";
import type { PublicProduct } from "./discovery";

export interface PatientConcern {
  id: string;
  name: string;
  subtitle: string;
  tags: string[];
  questions: { id: string; label: string; recommended: string[] }[];
}
const names: Record<string, string> = {
  booster: "건조함·피부 생기",
  "botox-filler": "표정주름·얼굴 볼륨",
  "hair-removal": "원치 않는 털",
  body: "체형·이중턱",
  tattoo: "지우고 싶은 문신",
};
export const patientConcerns: PatientConcern[] = [
  ...reference.map((c) => ({
    id: "patient:" + c.id,
    name: names[c.id] || c.title,
    subtitle: c.subtitle,
    tags: c.tags,
    questions:
      c.id === "hair-removal"
        ? [
            ...c.questions,
            {
              id: "body-hair",
              label: "팔·다리·몸의 털이 고민이에요",
              recommended: [],
            },
          ]
        : c.questions,
  })),
  {
    id: "patient:large-scar",
    name: "흉터·튼살",
    subtitle: "오래된 흉터, 튼살, 울퉁불퉁한 피부",
    tags: ["큰 흉터", "튼살", "닭살"],
    questions: [
      {
        id: "large-scar",
        label: "화상·수술 후 흉터가 고민이에요",
        recommended: [],
      },
      {
        id: "stretch-marks",
        label: "튼살이나 닭살 피부가 고민이에요",
        recommended: [],
      },
    ],
  },
  {
    id: "patient:medical",
    name: "손발톱 무좀",
    subtitle: "손발톱 무좀 치료 상담",
    tags: ["무좀", "손발톱"],
    questions: [
      { id: "nail-health", label: "손발톱 무좀이 고민이에요", recommended: [] },
    ],
  },
  {
    id: "patient:condition",
    name: "피로·컨디션",
    subtitle: "피로감과 영양 상태 상담",
    tags: ["피로", "영양", "컨디션"],
    questions: [
      {
        id: "fatigue-care",
        label: "피로감·영양 상태를 상담하고 싶어요",
        recommended: [],
      },
    ],
  },
];
// Match stated indications and the clinic's supplied reference candidate names.
// A merchandising folder alone is never clinical evidence.
const symptoms: Record<string, RegExp> = {
  moles: /점제거|점\s*제거|co2.*점/i,
  spots: /잡티|주근깨|흑자|리팟/,
  melasma: /기미/,
  "complex-pigment": /색소|기미|잡티|토닝/,
  "inflammatory-acne": /여드름|아크네|트러블/,
  sebum: /피지|아쿠아필|압출/,
  "acne-pores": /여드름|피지/,
  "body-acne": /(등|가슴|바디).*(여드름|트러블)|등드름|가드름/,
  "red-mark": /붉은.*자국|여드름.*자국|자국.*혈관/,
  "brown-mark": /색소침착|갈색.*자국|여드름.*자국/,
  "pitted-scar": /패인|여드름.*흉터|흉터.*여드름/,
  "deep-scar": /깊은.*흉터|패인.*흉터|서브시전/,
  "large-pores": /모공/,
  "rough-texture": /피부결|각질/,
  blackhead: /블랙헤드|코.*피지|아쿠아필/,
  "face-redness": /홍조|혈관종/,
  "rosacea-nose": /딸기코|주사비/,
  "sensitive-barrier": /장벽|예민|민감|홍조/,
  jawline: /리프팅|탄력|타이트닝|얼굴.*처짐/,
  "double-chin": /이중턱/,
  "thread-lift": /실리프팅|민트실|모노실/,
  wrinkles: /주름/,
  "under-eye-hollow": /눈밑.*꺼짐|눈밑.*볼륨/,
  "dark-circle": /다크서클/,
  glow: /수분|보습|광채|물광|건조/,
  regeneration: /피부재생|피부\s*재생|스킨부스터|콜라겐\s*부스터/,
  "texture-booster": /모공|피부결/,
  "botox-wrinkle":
    /표정주름|(?:이마|미간|눈가|콧잔등|자갈턱|목주름|주름).*(?:보톡스|톡신)|(?:보톡스|톡신).*주름/,
  "face-line": /사각턱.*(?:보톡스|톡신)|(?:보톡스|톡신).*사각턱|윤곽주사/,
  "filler-volume": /필러/,
  "face-hair": /(얼굴|인중|턱|헤어라인|이마|구렛나루).*제모|제모.*(얼굴|인중)/,
  "male-beard": /수염|남성.*제모/,
  "body-hair":
    /(?:팔|다리|겨드랑이|종아리|허벅지|브라질리언|비키니|전신|배|가슴|등|손등|발등).*제모|제모.*(?:팔|다리|겨드랑이|종아리|허벅지|브라질리언|비키니|전신)/,
  "double-chin-body": /이중턱/,
  "body-line": /비만|다이어트|바디라인|체형|지방분해|지방파괴/,
  "fat-injection": /지방분해.*주사|슬림주사|윤곽주사/,
  "early-hair-loss": /탈모|두피/,
  "intensive-scalp": /탈모|두피|정수리/,
  "spot-hair-loss": /원형탈모/,
  "black-tattoo": /단색.*문신|흑백.*문신|검정.*문신/,
  "color-tattoo": /컬러.*문신|칼라.*문신|문신.*컬러/,
  "large-scar": /화상\s*흉터|수술\s*흉터|켈로이드|비후성|선상\s*흉터/,
  "stretch-marks": /튼살|닭살|모공각화/,
  "itch-dermatitis": /두드러기|가려움|피부염|구순염|아토피/,
  "herpes-zoster": /대상포진/,
  "nail-health": /무좀|루눌라|조갑백선|조갑진균/,
  "skin-lump": /양성종양|피부종양|피지낭종|지방종/,
  "fatigue-care": /피로|전신\s*컨디션|영양수액|영양요법/,
};
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
export const rootPatterns: Record<string, RegExp> = {
  pigment: /기미|잡티|흑자|색소/,
  acne: /^여드름$/,
  scar: /여드름.*흉터|자국/,
  pores: /모공|작은흉터|피부결/,
  redness: /홍조|딸기코|혈관종/,
  lifting: /주름|탄력|리프팅/,
  eye: /눈밑|다크서클/,
  booster: /스킨부스터|피부재생/,
  "botox-filler": /보톡스|필러/,
  "hair-removal": /제모/,
  body: /비만|체형|이중턱/,
  "hair-loss": /탈모/,
  tattoo: /문신/,
  "large-scar": /큰흉터|튼살/,
  medical: /피부.*진료|손발톱/,
};
type MatchProduct = Pick<
  Product,
  "name" | "description" | "composition" | "options"
> &
  Partial<Pick<Product, "webEvent">>;
export const patientClassificationVersion = "2026-10-06-purpose-v1";
// Remove a named recovery adjunct, not an entire package or its explicit indications.
// Standalone soothing programmes keep their purpose; the rule applies to add-ons.
export function indicationText(value: string) {
  return value
    .normalize("NFKC")
    .replace(
      /(?:LED|엘이디)\s*(?:재생|진정)?\s*(?:레이저|관리|광선|치료)?/gi,
      " ",
    )
    .replace(/크라이오\s*(?:진정)?\s*(?:관리|케어)?/g, " ")
    .replace(
      /(?:재생|진정|보습|수분)\s*(?:모델링)?\s*(?:팩|마스크)|모델링\s*팩/g,
      " ",
    )
    .replace(/리프토닝/g, "리프팅")
    .replace(/여드름\s*(?:흉터|자국|붉은색소|색소침착)/g, (m) =>
      m.replace("여드름", "acne-scar"),
    );
}
export function patientMatchEvidence(
  p: MatchProduct,
  paths: { name: string; id?: string }[][],
) {
  // Generated links are an output of these rules, never evidence for the next run.
  paths = paths
    .filter((path) => !path.some((f) => f.id?.startsWith("rec-link-")))
    .map((path) => path.filter((f) => !f.id?.startsWith("rec-group-")));
  const barrier = /스킨\s*배리어\s*SOS/i.test(p.name);
  const supportive =
    /LDM\s*\(약물\s*침투\)|오투덤\s*산소테라피/i.test(p.name) || barrier;
  const md = /덱세릴\s*MD|이지듀\s*MD/i.test(p.name);
  const doctorScar = /닥터플랜/.test(p.name) && /흉터/.test(p.name);
  // A selected LDM mode has its own indication; the shared banner lists all modes.
  const description =
    /LDM\s*\(/i.test(p.name) && p.webEvent
      ? p.webEvent.offerDescription || ""
      : p.description;
  const primary = indicationText(p.name + " " + description);
  const dedicated = /제모/.test(
    p.name +
      " " +
      paths.map((path) => path.map((f) => f.name).join(" ")).join(" "),
  )
    ? "patient:hair-removal"
    : /문신/.test(p.name)
      ? "patient:tattoo"
      : /발톱|조갑|무좀/.test(p.name)
        ? "patient:medical"
        : "";
  const composition = indicationText(
    p.composition + " " + p.options.map((o) => o.label).join(" "),
  ).replace(/(?:재생|진정|보습|수분)\s*(?:레이저|관리|케어)/g, " ");
  const text = primary + " " + composition;
  const productName = normalize(indicationText(p.name));
  return patientConcerns.flatMap((c) => {
    if (
      c.id === "patient:medical" &&
      !/무좀|루눌라|조갑백선|조갑진균/.test(
        p.name + " " + (p.description || ""),
      )
    )
      return [];
    if (supportive && !["patient:booster", "patient:redness"].includes(c.id))
      return [];
    const root = rootPatterns[c.id.slice(8)];
    const folders = paths.flatMap((path) =>
      path.filter((f) => root?.test(f.name)).map((f) => f.name),
    );
    const folderMatch = folders.length > 0;
    if (dedicated && c.id !== dedicated && !folderMatch) return [];
    const reasons: string[] = folders.map((f) => "직접 분류: " + f);
    const answerIds = c.questions
      .filter((q) => {
        if (supportive && (q.id === "glow" || q.id === "sensitive-barrier")) {
          reasons.push("병원 지정: 건조·보습 및 장벽·예민 피부");
          return true;
        }
        if (md && (q.id === "glow" || q.id === "itch-dermatitis")) {
          reasons.push("병원 지정: MD 제품 건조·보습 및 피부염·장벽관리");
          return true;
        }
        if (
          doctorScar &&
          ["pitted-scar", "deep-scar", "large-scar"].includes(q.id)
        ) {
          reasons.push("병원 지정: 닥터플랜 흉터 두 범주");
          return true;
        }
        const folderText = paths
          .map((path) =>
            path
              .slice(1)
              .map((f) => f.name)
              .join(" "),
          )
          .join(" ");
        const context = primary + " " + folderText;
        const explicitFolderAnswer =
          (folderMatch &&
            q.id === "filler-volume" &&
            /필러/.test(folderText) &&
            !/녹이는|히알라제/.test(context)) ||
          (folderMatch &&
            q.id === "thread-lift" &&
            /실리프팅|녹는실|민트실|모노실|아이쓰레드|잼버실|실루엣/.test(
              context,
            )) ||
          (folderMatch &&
            q.id === "face-hair" &&
            /얼굴|인중|헤어라인|이마|구렛|구레나룻|앞턱/.test(context)) ||
          (folderMatch &&
            q.id === "male-beard" &&
            /수염|남성.*얼굴|얼굴.*남성/.test(context)) ||
          (folderMatch &&
            q.id === "body-hair" &&
            /상체|하체|겨드랑이|종아리|허벅지|팔|브라질리언|비키니|엉덩이|손등|발등/.test(
              context,
            )) ||
          (folderMatch && q.id === "large-scar" && /흉터|스카/.test(context)) ||
          (folderMatch &&
            q.id === "jawline" &&
            /레이저\s*리프팅|탄력/.test(folderText)) ||
          (folderMatch && q.id === "face-redness" && /홍조/.test(folderText)) ||
          (folderMatch &&
            q.id === "regeneration" &&
            /스킨부스터|콜라겐주사/.test(folderText)) ||
          (folderMatch && q.id === "large-pores" && /모공/.test(folderText)) ||
          (folderMatch &&
            q.id === "color-tattoo" &&
            /컬러|칼라/.test(primary)) ||
          (folderMatch && q.id === "body-line" && /비만/.test(folderText)) ||
          (folderMatch &&
            q.id === "face-line" &&
            /사각.*보톡스|턱\s*보톡스|윤곽주사/.test(context));
        if (explicitFolderAnswer) {
          reasons.push("세부 폴더·시술 목적: " + folderText);
          return true;
        }
        // Pores/texture alone do not establish an indication for a skin booster.
        const eligible =
          q.id !== "texture-booster" ||
          folderMatch ||
          /스킨부스터|쥬베룩|리쥬란|울트라콜|콜라겐/.test(primary);
        const pigmentText = text.replace(/(?:피지|콜라겐)\s*토닝/g, " ");
        const symptomText =
          q.id === "pitted-scar" || q.id === "red-mark" || q.id === "brown-mark"
            ? text.replace(/acne-scar/g, "여드름")
            : c.id === "patient:pigment"
              ? pigmentText
              : text;
        const hit = eligible && symptoms[q.id]?.exec(symptomText);
        if (hit) {
          reasons.push("명시된 목적: " + hit[0]);
          return true;
        }
        const candidate = q.recommended.find((r) => {
          const key = normalize(r.replace(/^플러스 시술\s*\|\s*/, ""));
          const broad = /^(고주파|클라리티2|v레이저|리브이|쥬브젠|실펌)$/.test(
            key,
          );
          // A generic device in another clinical folder is not enough to infer
          // redness, acne or filler indications. Explicit purpose above still wins.
          const needsContext =
            broad ||
            [
              "patient:redness",
              "patient:acne",
              "patient:botox-filler",
            ].includes(c.id);
          return (
            key.length >= 3 &&
            productName.includes(key) &&
            (!needsContext || folderMatch)
          );
        });
        if (candidate) {
          reasons.push("병원 추천기 시술: " + candidate);
          return true;
        }
        return false;
      })
      .map((q) => q.id);
    return answerIds.length || folderMatch
      ? [{ concernId: c.id, answerIds, reasons: [...new Set(reasons)] }]
      : [];
  });
}
export function patientMatches(
  p: MatchProduct,
  paths: { name: string; id?: string }[][],
) {
  return patientMatchEvidence(p, paths).map(({ concernId, answerIds }) => ({
    concernId,
    answerIds,
  }));
}
export function recommendedProducts(
  products: PublicProduct[],
  concernId: string,
  answerId: string,
  search = "",
) {
  const key = normalize(search);
  // A current, publicly visible website offer takes precedence over its
  // beauty-book counterpart, regardless of price or imported option labels.
  // Keep quantities/durations in the key: 4-week and 8-week courses differ.
  // Apply before search so searching an old option cannot revive a duplicate.
  const websiteNames = new Set(
    products.filter((p) => p.book === "이벤트").map((p) => normalize(p.name)),
  );
  const ranked = products
    .filter((p) => p.book !== "미용" || !websiteNames.has(normalize(p.name)))
    .filter((p) =>
      p.matches?.some(
        (m) =>
          m.concernId === concernId &&
          (!answerId || m.answerIds.includes(answerId)),
      ),
    )
    .filter(
      (p) =>
        !key ||
        normalize(
          [p.name, ...p.options.map((o) => o.label)].join(" "),
        ).includes(key),
    )
    .sort(
      (a, b) =>
        Number(a.book !== "이벤트") - Number(b.book !== "이벤트") ||
        Number(a.options.every((o) => o.price === null)) -
          Number(b.options.every((o) => o.price === null)) ||
        a.name.localeCompare(b.name, "ko"),
    );
  const seen = new Set<string>();
  return ranked.filter((p) => {
    const fingerprint = JSON.stringify([
      normalize(p.name),
      p.options
        .map((o) => [normalize(o.label), o.price, o.tax, o.unit, o.event])
        .sort(),
      p.event,
    ]);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}
