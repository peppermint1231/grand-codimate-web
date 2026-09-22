import { catalogBook, type Catalog, type Product } from "./model";
import { catalogNodes, folderPath, productFolder } from "./catalogFolders";

export const classificationReviewId = "event-classification-review";
export function withBeautyRootLabels(
  event: Catalog,
  beauty?: Catalog,
): Catalog {
  if (!beauty || catalogBook(event) !== "이벤트") return event;
  const roots = catalogNodes(beauty).filter((f) => !f.parentId);
  const order = new Map(roots.map((f, i) => [f.id, i]));
  const nodes = catalogNodes(event).map((f) => {
    const root = !f.parentId && roots.find((r) => r.id === f.id);
    return root ? { ...f, name: root.name, color: root.color } : f;
  });
  nodes.sort((a, b) =>
    a.parentId || b.parentId
      ? Number(!!a.parentId) - Number(!!b.parentId)
      : (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999),
  );
  return { ...event, folderTree: nodes };
}
const clean = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, "")
    .replace(
      /\d+(?:\.\d+)?\s*(?:cc|ml|mm|cm|샷|줄|회|개|부위|분|유닛|단계|주|병|제)/gi,
      "",
    )
    .replace(/[^a-z가-힣]/g, "");
const ignored = new Set(
  "얼굴 전체 얼굴전체 부분 국소 기본 프리미엄 베이직 패키지 프로그램 관리 재생 진정 레이저 주사 시술 한정 단독 정가 수가 원내 옵션 상세표 크기 이하 이상 초과 미만 집중 양쪽 부위 리셋 그랜드 콤보 케어 토탈 리커버리 플러스 스킨 단계 국산 수입 남성 여성 포함 선택 가능".split(
    " ",
  ),
);
const words = (text: string) =>
  (
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[a-z]+|[가-힣]+/g) || []
  ).filter(
    (w) =>
      w.length >= 2 && !ignored.has(w) && !/^(cc|mm|cm|ml|or|led|rf)$/.test(w),
  );

export interface Classification {
  rootId: string;
  reason: string;
}

// Learn destinations from the edited beauty catalogue, not the original concern IDs.
// Only unambiguous matches are assigned; merchandising names alone are not evidence.
export function beautyClassifier(beauty: Catalog) {
  const nodes = catalogNodes(beauty);
  const roots = nodes.filter((f) => !f.parentId);
  const samples = beauty.products
    .map((p) => ({
      p,
      root: folderPath(beauty, productFolder(beauty, p))[0]?.id,
      name: clean(p.name),
    }))
    .filter((s) => s.root && roots.some((r) => r.id === s.root));
  // Recognise treatment spellings, then learn their destination from the user's
  // folder names and primary (not add-on) beauty products. No legacy root IDs.
  const aliases: [RegExp, string][] = [
    [/닥터플랜/i, "닥터플랜"],
    [/멤버십|멤버쉽/i, "멤버"],
    [
      /영양수액|수액|ivnt|태반주사|감초주사|항산화주사|푸르설티아민|미백개선주사/i,
      "ivnt",
    ],
    [
      /여드름\s*흉터|피코(?:플러스)?\s*프락셀|피코mla|모자이크\s*프락셀|에어\s*서브시전|모공/i,
      "모공",
    ],
    [/아크네|ptt|네오빔|여드름|트러블|피지선/i, "여드름"],
    [/리팟|흑자|점제거|기미|잡티|색소/i, "기미"],
    [/혈관종|홍조|딸기코/i, "홍조"],
    [/문신/i, "문신제거"],
    [/제모/i, "제모"],
    [/두피|탈모/i, "탈모"],
    [/비후성|화상흉터|켈로이드|선상흉터|튼살|모공각화증|닭살/i, "큰흉터"],
    [/지방\s*파괴|지방분해|비만|체형|슬림주사|다이어트|인모드.*fx/i, "비만"],
    [/보톡스|톡신/i, "보톡스"],
    [/필러/i, "필러"],
    [/리쥬란|리제반/i, "리쥬란"],
    [/쥬베룩/i, "쥬베룩"],
    [/울트라콜/i, "울트라콜"],
    [/릴리이드|물광/i, "물광"],
    [/스킨부스터/i, "스킨부스터"],
    [/콜광/i, "콜광주사"],
    [/엑소좀/i, "엑소좀"],
    [/아쿠아필/i, "아쿠아필"],
    [
      /라라필|산소필|이온토|각질|스케일링|피부관리|내맘대로관리|진정관리|압출관리/i,
      "피부관리",
    ],
    [/리프테라/i, "리프테라"],
    [/슈링크/i, "슈링크"],
    [/볼뉴머|볼링크/i, "볼뉴머"],
    [/다이아/i, "다이아"],
    [
      /민트|모노실|실리프팅|쥬브젠|리프팅|깊은주름|팔자전용실|볼륨실/i,
      "리프팅",
    ],
    [/눈밑/i, "눈밑"],
    [/토닝/i, "기미"],
  ];
  const destination = (term: string): string | undefined => {
    const named = roots.filter((r) => clean(r.name).includes(term));
    if (named.length === 1) return named[0].id;
    const folders = nodes.filter(
      (f) => !f.linkTo && clean(f.name).includes(term),
    );
    const folderRoots = new Set(
      folders.map((f) => folderPath(beauty, f.id)[0]?.id).filter(Boolean),
    );
    if (folderRoots.size === 1) return [...folderRoots][0];
    // A standalone product is stronger evidence than a combo mentioning an add-on.
    const primary = samples.filter(({ p }) => {
      const head = p.name.split(/[+＋·]/)[0];
      return clean(head).includes(term) && !/패키지|시그니처|콤보/.test(head);
    });
    const counts = new Map<string, number>();
    for (const sample of primary)
      counts.set(sample.root!, (counts.get(sample.root!) || 0) + 1);
    const ranked = [...counts].sort((a, b) => b[1] - a[1]);
    if (ranked[0] && (!ranked[1] || ranked[0][1] >= ranked[1][1] * 2))
      return ranked[0][0];
  };
  const classify = (p: Product, fallback = true): Classification => {
    const name = clean(p.name);
    const exact = samples.filter((s) => s.name.length >= 4 && s.name === name);
    if (exact.length && new Set(exact.map((s) => s.root)).size === 1)
      return {
        rootId: exact[0].root!,
        reason: `미용 상품명·시술 구성 일치: ${exact[0].p.name}`,
      };
    // Find the first named treatment in a package, not a promotional banner.
    const head = p.name
      .replace(/\[(?:event|이벤트|첫방문|\d+월[^\]]*)\]/gi, "")
      .replace(/^(?:마크뷰|피부상담)\s*[+＋]/g, "")
      .replace(/^피부상담\s*[+＋]/, "")
      .split(/[+＋*]/)[0];
    const hits = aliases.flatMap(([pattern, term]) => {
      const match = pattern.exec(head);
      const root = match && destination(term);
      return match && root ? [{ root, term, index: match.index }] : [];
    });
    hits.sort((a, b) => a.index - b.index);
    if (hits[0])
      return {
        rootId: hits[0].root,
        reason: `미용 분류·대표 시술 기준: ${hits[0].term}`,
      };
    const ownWords = words(head);
    const matching = samples.filter(
      (s) => clean(s.p.name.split(/[+＋·]/)[0]) === clean(head),
    );
    const candidates = new Set(matching.map((s) => s.root));
    if (candidates.size === 1 && ownWords.length)
      return {
        rootId: [...candidates][0]!,
        reason: `미용 대표 상품 일치: ${matching[0].p.name}`,
      };
    if (fallback && p.webEvent?.offerDescription) {
      const detail = classify(
        { ...p, name: p.webEvent.offerDescription },
        false,
      );
      if (detail.rootId !== classificationReviewId)
        return { ...detail, reason: "상품 설명 · " + detail.reason };
    }
    if (
      fallback &&
      p.webEvent?.eventName &&
      !/이벤트|event/i.test(p.webEvent.eventName)
    ) {
      const banner = classify({ ...p, name: p.webEvent.eventName }, false);
      if (banner.rootId !== classificationReviewId)
        return { ...banner, reason: "배너 분류 · " + banner.reason };
    }
    return {
      rootId: classificationReviewId,
      reason: "상품명·설명으로 미용 분류를 확정하기 어려움",
    };
  };
  return (p: Product) => classify(p);
}

export function alignEventCategories(event: Catalog, beauty: Catalog) {
  if (catalogBook(event) !== "이벤트" || catalogBook(beauty) !== "미용")
    throw new Error("미용 SSOT를 기준으로 이벤트만 분류할 수 있습니다.");
  const classify = beautyClassifier(beauty);
  const catalog = structuredClone(event);
  const nodes = catalogNodes(beauty)
    .filter((f) => !f.parentId)
    .map(({ id, name, color }) => ({ id, name, color, parentId: "" }));
  const decisions = catalog.products.map((p) => ({
    id: p.id,
    name: p.name,
    ...classify(p),
  }));
  if (decisions.some((d) => d.rootId === classificationReviewId))
    nodes.push({
      id: classificationReviewId,
      name: "미분류·검토 필요",
      parentId: "",
      color: "#9a6700",
    });
  const groups = new Map<string, string>();
  let ordinal = 1;
  catalog.products.forEach((p, i) => {
    const root = decisions[i].rootId;
    const label =
      (p.webEvent?.eventName || p.category || "이벤트 상품")
        .replace(/[\\/]/g, "·")
        .trim()
        .slice(0, 60) || "이벤트 상품";
    const key = JSON.stringify([root, label]);
    let folderId = groups.get(key);
    if (!folderId) {
      // Stable per-root sequence avoids collisions with arbitrary user folder IDs.
      do {
        folderId = `event-group-${ordinal++}`;
      } while (nodes.some((f) => f.id === folderId));
      groups.set(key, folderId);
      nodes.push({
        id: folderId,
        name: label,
        parentId: root,
        color: undefined,
      });
    }
    p.folderId = folderId;
  });
  catalog.folderTree = nodes;
  delete catalog.folders;
  return {
    catalog,
    decisions,
    reviewCount: decisions.filter((d) => d.rootId === classificationReviewId)
      .length,
  };
}
