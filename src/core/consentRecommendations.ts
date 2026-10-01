import type { Consent, Line } from "./model";

// Match procedure identity, not boilerplate risks or alternatives in consent bodies.
// These are search aliases for the existing hospital template families.
const aliases: Record<string, RegExp> = {
  toxin: /보톡스|보툴리눔|다한증/,
  "ha-filler": /필러|히알루론산/,
  "skin-injection": /스킨부스터|콜라겐자극|리쥬란|쥬베룩|울트라콜|물광/,
  "pigment-laser": /색소|토닝|흑자|기미|잡티|리팟/,
  "lesion-removal": /점제거|쥐젖|양성피부병변|비립종|검버섯|편평사마귀/,
  fractional: /프락셔널|프락셀|흉터레이저/,
  "hair-removal": /제모/,
  "vascular-acne-light":
    /홍조|여드름레이저|광치료|v레이저|제네시스|피지선레이저|ptt/,
  "rf-microneedle": /마이크로니들|고주파니들|포텐자/,
  hifu: /집속초음파|슈링크|리프테라/,
  "rf-lifting": /고주파리프팅|흡입리프팅|볼뉴머|인모드/,
  threads: /실리프팅|민트실|모노실/,
  peeling: /필링|스케일링|아쿠아필|라라필|산소필/,
  subcision: /서브시전|흉터유착박리/,
  "fat-injection": /지방분해|지방파괴|윤곽주사/,
  "iv-injection": /수액|영양주사|백옥주사|ivnt/,
  repot: /리팟/,
  juvegen: /쥬브젠|진피재생/,
  "eye-bag": /아이백|눈밑시술/,
  scalp: /탈모|두피/,
  isotretinoin: /이소트레티노인/,
  "doctor-plan": /닥터플랜/,
  membership: /멤버십|회원권/,
};
const key = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·\-_/(),]/g, "");
const groups = (text: string) =>
  Object.keys(aliases).filter((k) => aliases[k].test(key(text)));
export interface ConsentRecommendation {
  template: Consent;
  reasons: string[];
  lineIds: string[];
  score: number;
}
export function recommendConsents(
  consents: Consent[],
  lines: Line[],
): ConsentRecommendation[] {
  // One latest published version per template lineage; never suggest drafts.
  const published = consents.filter((t) => t.status === "published");
  const byId = new Map(consents.map((t) => [t.id, t]));
  const family = (t: Consent) => {
    if (t.draftKey) return "key:" + t.draftKey;
    let current = t;
    const visited = new Set<string>();
    while (current.sourceTemplateId && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = byId.get(current.sourceTemplateId);
      if (!parent) break;
      if (parent.draftKey) return "key:" + parent.draftKey;
      current = parent;
    }
    return "name:" + key(current.name);
  };
  const latest = new Map<string, Consent>();
  for (const t of published) {
    const id = family(t),
      prior = latest.get(id);
    if (
      !prior ||
      t.version > prior.version ||
      (t.version === prior.version && t.updatedAt > prior.updatedAt)
    )
      latest.set(id, t);
  }
  return [...latest.values()]
    .flatMap((template) => {
      const matchedGroups =
        template.draftKey && aliases[template.draftKey]
          ? [template.draftKey]
          : groups(template.name);
      const reasons: string[] = [],
        lineIds: string[] = [];
      let score = 0;
      for (const line of lines) {
        let reason = "",
          rank = 0;
        if (template.productIds.includes(line.productId)) {
          reason = "연결 상품";
          rank = 100;
        } else {
          const identity = `${line.name} ${line.label}`;
          const named = groups(identity);
          const composition = groups(line.composition || "");
          const direct = matchedGroups.find((g) => named.includes(g));
          const composed = matchedGroups.find((g) => composition.includes(g));
          // Use folder hints only when the product itself has no recognized family.
          const folder =
            !named.length &&
            matchedGroups.find((g) =>
              groups(line.categorySnapshot || "").includes(g),
            );
          if (direct) {
            reason = "시술명·옵션 일치";
            rank = 70;
          } else if (composed) {
            reason = "시술 구성 일치";
            rank = 60;
          } else if (folder) {
            reason = "분류 일치 · 실제 시술 확인";
            rank = 20;
          } else {
            // Hospital-created templates can match a specific title without a draft key.
            const title = key(
              template.name.replace(/시술|설명|동의서|동의|안내|이용/g, ""),
            );
            if (
              title.length >= 2 &&
              !["레이저", "주사", "피부", "관리", "리프팅"].includes(title) &&
              key(identity).includes(title)
            ) {
              reason = "양식명 일치";
              rank = 50;
            }
          }
        }
        if (reason) {
          reasons.push(`${line.name} · ${line.label}: ${reason}`);
          lineIds.push(line.id);
          score = Math.max(score, rank);
        }
      }
      return reasons.length
        ? [{ template, reasons: [...new Set(reasons)], lineIds, score }]
        : [];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.template.name.localeCompare(b.template.name, "ko"),
    );
}
