import {
  beautyClassifier,
  classificationReviewId,
} from "./catalogClassification";
import { catalogNodes } from "./catalogFolders";
import { selectWebsiteOffers, type WebsiteEvent } from "./eventCatalog";
import { catalogBook, type Catalog, type Product } from "./model";

// Keep quantities, body sites and composition: different doses are not duplicates.
export const websiteNameKey = (name: string) =>
  name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/패키지|정상가|원내수가/g, "")
    .replace(/구렛나룻/g, "구렛나루")
    .replace(/[\s·_()[\]{}'"]/g, "")
    .replace(/^(남성|여성)(.*)제모/, "$1$2");

export function addMissingWebsiteBeauty(
  base: Catalog,
  pages: WebsiteEvent[],
  now = new Date().toISOString(),
) {
  if (catalogBook(base) !== "미용") throw new Error("미용 SSOT를 선택하세요.");
  const catalog = structuredClone(base);
  const classify = beautyClassifier(base);
  const nodes = catalogNodes(catalog).map((f) => ({ ...f }));
  const known = new Map<string, Product>();
  for (const p of base.products) {
    known.set(websiteNameKey(p.name), p);
    for (const o of p.options) known.set(websiteNameKey(p.name + o.label), p);
  }
  const decisions: {
    id: string;
    name: string;
    status: "existing" | "added";
    rootId?: string;
    reason: string;
  }[] = [];
  let sequence = 1;
  for (const page of selectWebsiteOffers(pages, "미용"))
    for (const offer of page.offers) {
      const id = `grand4-beauty-${page.id}-${offer.id}`;
      const existing =
        base.products.find(
          (p) =>
            p.id === id ||
            p.sources.some((s) => s.sheet === page.url && s.cell === offer.id),
        ) || known.get(websiteNameKey(offer.name));
      if (
        existing &&
        (base.products.some((p) => p.id === existing.id) ||
          existing.options.some((o) => o.price === offer.price))
      ) {
        decisions.push({
          id: existing.id,
          name: offer.name,
          status: "existing",
          reason: "기존 상품·옵션 이름 또는 홈페이지 원본 ID 일치",
        });
        continue;
      }
      const source = {
        sheet: page.url,
        cell: offer.id,
        text: `${page.name} / ${offer.name} / ${offer.priceText}`,
      };
      const p: Product = {
        id,
        rev: 1,
        createdAt: now,
        updatedAt: now,
        name: offer.name,
        category: page.name,
        description: [page.description, offer.description]
          .filter(Boolean)
          .join("\n"),
        composition: "",
        careCategory: "미용",
        active: false,
        publicVisible: false,
        sources: [source],
        options: [
          {
            id: `grand4-beauty-option-${page.id}-${offer.id}`,
            label: "홈페이지 가격",
            price: offer.price,
            priceKind: "clinic",
            tax: offer.tax,
            unit: "건",
            review: true,
            issues: [
              "홈페이지 누락 상품 검토 · 기존 상품과 중복·구성 확인",
              ...offer.issues,
              ...(offer.tax === "unknown"
                ? ["부가세 미표기 · 항목별 확인 필요"]
                : []),
            ],
            sources: [source],
          },
        ],
      };
      let decision = classify(p);
      // Dedicated non-event catalogue sections are a fallback, not a price/tax assumption.
      if (decision.rootId === classificationReviewId)
        decision = classify({ ...p, name: page.categoryName || page.name });
      const root = decision.rootId;
      if (root === classificationReviewId && !nodes.some((f) => f.id === root))
        nodes.push({
          id: root,
          parentId: "",
          name: "미분류·검토 필요",
          color: "#9a6700",
        });
      let folder = nodes.find(
        (f) =>
          f.parentId === root && f.name === "홈페이지 추가·검토" && !f.linkTo,
      );
      if (!folder) {
        let fid: string;
        do {
          fid = `website-additions-${sequence++}`;
        } while (nodes.some((f) => f.id === fid));
        folder = { id: fid, parentId: root, name: "홈페이지 추가·검토" };
        nodes.push(folder);
      }
      p.folderId = folder.id;
      catalog.products.push(p);
      known.set(websiteNameKey(p.name), p);
      decisions.push({
        id,
        name: p.name,
        status: "added",
        rootId: root,
        reason: decision.reason,
      });
    }
  catalog.folderTree = nodes;
  delete catalog.folders;
  return {
    catalog,
    decisions,
    added: decisions.filter((d) => d.status === "added").length,
    existing: decisions.filter((d) => d.status === "existing").length,
  };
}
