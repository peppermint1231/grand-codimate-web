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
    questions: c.questions,
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
    name: "피부 증상·손발톱",
    subtitle: "가려움, 피부염, 손발톱 상태 상담",
    tags: ["가려움", "피부염", "손발톱"],
    questions: [
      {
        id: "itch-dermatitis",
        label: "가렵거나 두드러기·피부염이 있어요",
        recommended: [],
      },
      {
        id: "herpes-zoster",
        label: "대상포진 진료를 상담하고 싶어요",
        recommended: [],
      },
      {
        id: "nail-health",
        label: "손발톱 무좀이나 내성발톱이 고민이에요",
        recommended: [],
      },
      {
        id: "skin-lump",
        label: "피부에 생긴 혹이나 돌출된 부위가 고민이에요",
        recommended: [],
      },
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
  "acne-pores": /여드름|피지|모공/,
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
  "sensitive-barrier": /장벽|예민|홍조|진정/,
  jawline: /리프팅|얼굴.*처짐|턱.*탄력/,
  "double-chin": /이중턱/,
  "thread-lift": /실리프팅|민트실|모노실/,
  wrinkles: /주름/,
  "under-eye-hollow": /눈밑.*꺼짐|눈밑.*볼륨/,
  "dark-circle": /다크서클/,
  glow: /수분|보습|광채|물광|건조/,
  regeneration: /재생|스킨부스터|탄력/,
  "texture-booster": /모공|피부결/,
  "botox-wrinkle":
    /표정주름|(?:이마|미간|눈가|콧잔등|자갈턱|목주름|주름).*(?:보톡스|톡신)|(?:보톡스|톡신).*주름/,
  "face-line": /윤곽|사각턱/,
  "filler-volume": /필러|꺼짐|볼륨/,
  "face-hair": /(얼굴|인중|턱|헤어라인|이마|구렛나루).*제모|제모.*(얼굴|인중)/,
  "male-beard": /수염|남성.*제모/,
  "double-chin-body": /이중턱/,
  "body-line": /비만|다이어트|바디라인|체형|지방분해|지방파괴/,
  "fat-injection": /지방분해.*주사|슬림주사|윤곽주사/,
  "early-hair-loss": /탈모|두피/,
  "intensive-scalp": /탈모|두피|정수리/,
  "spot-hair-loss": /원형탈모/,
  "black-tattoo": /단색.*문신|흑백.*문신|검정.*문신/,
  "color-tattoo": /컬러.*문신|칼라.*문신|문신.*컬러/,
  "large-scar": /화상흉터|수술흉터|켈로이드|비후성|선상흉터/,
  "stretch-marks": /튼살|닭살|모공각화/,
  "itch-dermatitis": /두드러기|가려움|피부염|구순염|아토피/,
  "herpes-zoster": /대상포진/,
  "nail-health": /발톱|손톱|조갑|무좀/,
  "skin-lump": /양성종양|피부종양|피지낭종|지방종/,
  "fatigue-care": /피로|컨디션|영양수액|영양요법/,
};
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
const rootPatterns: Record<string, RegExp> = {
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
export function patientMatches(
  p: Pick<Product, "name" | "description" | "composition" | "options">,
  paths: { name: string }[][],
) {
  const text = [
    p.name,
    p.description,
    p.composition,
    ...p.options.map((o) => o.label),
  ].join(" ");
  const productName = normalize(p.name);
  return patientConcerns.flatMap((c) => {
    const root = rootPatterns[c.id.slice(8)];
    const folderMatch =
      root && paths.some((path) => path.some((f) => root.test(f.name)));
    const answerIds = c.questions
      .filter(
        (q) =>
          symptoms[q.id]?.test(text) ||
          q.recommended.some((r) => {
            const candidate = normalize(r.replace(/^플러스 시술\s*\|\s*/, ""));
            const broadDevice =
              /^(고주파|클라리티2|v레이저|리브이|쥬브젠|실펌)$/.test(candidate);
            return (
              candidate.length >= 3 &&
              productName.includes(candidate) &&
              (!broadDevice || folderMatch)
            );
          }),
      )
      .map((q) => q.id);
    return answerIds.length || folderMatch
      ? [{ concernId: c.id, answerIds }]
      : [];
  });
}
export function recommendedProducts(
  products: PublicProduct[],
  concernId: string,
  answerId: string,
  search = "",
) {
  const key = normalize(search);
  const ranked = products
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
