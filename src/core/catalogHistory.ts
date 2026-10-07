import { insuranceSummary } from "./insuranceCatalog";
import type { Catalog } from "./model";
import { catalogNodes, folderPath, productFolder } from "./catalogFolders";
export function catalogChanges(
  before: Catalog | undefined,
  after: Catalog,
): string[] {
  if (!before) return [`단가표 생성: 상품 ${after.products.length}개`];
  const changes: string[] = [],
    oldNodes = catalogNodes(before),
    nodes = catalogNodes(after);
  const path = (c: Catalog, id: string) =>
    folderPath(c, id)
      .map((f) => f.name)
      .join(" / ");
  for (const f of oldNodes)
    if (!nodes.some((x) => x.id === f.id))
      changes.push(
        `${f.linkTo ? "폴더 링크 삭제" : "폴더 삭제"}: ${path(before, f.id)}`,
      );
  for (const f of nodes) {
    const old = oldNodes.find((x) => x.id === f.id);
    if (!old) {
      changes.push(
        `${f.linkTo ? "폴더 링크 생성" : "폴더 생성"}: ${path(after, f.id)}${f.linkTo ? " → " + path(after, f.linkTo) : ""}`,
      );
      continue;
    }
    if (old.linkTo !== f.linkTo)
      changes.push(
        `폴더 링크 원본 변경: ${f.name} → ${f.linkTo ? path(after, f.linkTo) : "일반 폴더"}`,
      );
    if (old.name !== f.name) changes.push(`폴더 이름: ${old.name} → ${f.name}`);
    if ((old.color || "") !== (f.color || ""))
      changes.push(
        `폴더 색상: ${f.name} (${old.color || "기본"} → ${f.color || "기본"})`,
      );
    if (old.parentId !== f.parentId)
      changes.push(`폴더 이동: ${path(before, f.id)} → ${path(after, f.id)}`);
    else if (
      oldNodes
        .filter((x) => x.parentId === f.parentId)
        .findIndex((x) => x.id === f.id) !==
      nodes
        .filter((x) => x.parentId === f.parentId)
        .findIndex((x) => x.id === f.id)
    )
      changes.push(`폴더 순서: ${f.name}`);
  }
  for (const p of before.products)
    if (!after.products.some((x) => x.id === p.id))
      changes.push(`상품 삭제: ${p.name}`);
  for (const p of after.products) {
    const old = before.products.find((x) => x.id === p.id);
    if (!old) {
      changes.push(`상품 추가: ${p.name}`);
      continue;
    }
    if (JSON.stringify(old.insurance) !== JSON.stringify(p.insurance))
      changes.push(
        `급여·실비 구분 변경: ${p.name} (${insuranceSummary(old.insurance) || "미지정"} → ${insuranceSummary(p.insurance) || "미지정"})`,
      );
    if (JSON.stringify(old.offering) !== JSON.stringify(p.offering))
      changes.push(`패키지·멤버십 구성 변경: ${p.name}`);
    if (old.name !== p.name) changes.push(`상품 이름: ${old.name} → ${p.name}`);
    if (productFolder(before, old) !== productFolder(after, p))
      changes.push(
        `상품 이동: ${p.name} → ${path(after, productFolder(after, p))}`,
      );
    if (
      JSON.stringify(old.webEvent && { ...old.webEvent, checkedAt: "" }) !==
      JSON.stringify(p.webEvent && { ...p.webEvent, checkedAt: "" })
    )
      changes.push(`이벤트 기간·정가·할인율·할인가·포스터 갱신: ${p.name}`);
    if (
      JSON.stringify(
        old.websiteListings?.map(({ checkedAt, ...link }) => link),
      ) !==
      JSON.stringify(p.websiteListings?.map(({ checkedAt, ...link }) => link))
    )
      changes.push(`홈페이지 게시 상태·원문 가격 점검: ${p.name}`);
    if (old.active !== p.active)
      changes.push(`판매 상태: ${p.name} → ${p.active ? "판매 중" : "비활성"}`);
    if (!!old.publicVisible !== !!p.publicVisible)
      changes.push(
        `추천기 공개: ${p.name} → ${p.publicVisible ? "표시" : "숨김"}`,
      );
    if (
      old.description !== p.description ||
      old.composition !== p.composition ||
      old.packageBySession !== p.packageBySession ||
      old.packageAllowGaps !== p.packageAllowGaps ||
      old.category !== p.category ||
      old.productType !== p.productType
    )
      changes.push(`상품 설명·구성·분류 수정: ${p.name}`);
    for (const o of old.options)
      if (!p.options.some((x) => x.id === o.id))
        changes.push(`옵션 삭제: ${p.name} / ${o.label}`);
    for (const o of p.options) {
      const prev = old.options.find((x) => x.id === o.id);
      if (!prev) {
        changes.push(`옵션 추가: ${p.name} / ${o.label}`);
        continue;
      }
      if (JSON.stringify(prev.packagePlan) !== JSON.stringify(o.packagePlan))
        changes.push(`패키지 블록·가격 구성 변경: ${p.name} / ${o.label}`);
      if (prev.packageComposition !== o.packageComposition)
        changes.push(`옵션별 구성 변경: ${p.name} / ${o.label}`);
      if (prev.packageSessionCount !== o.packageSessionCount)
        changes.push(`옵션 회차 수 변경: ${p.name} / ${o.label}`);
      if (JSON.stringify(prev.offering) !== JSON.stringify(o.offering))
        changes.push(`옵션 패키지·멤버십 구성 변경: ${p.name} / ${o.label}`);
      if (prev.priceKind !== o.priceKind)
        changes.push(
          `가격 방식 변경: ${p.name} / ${o.label} → ${o.priceKind === "quote" ? "상담 시 가격 입력" : "고정 가격"}`,
        );
      if (prev.healthInsuranceAmount !== o.healthInsuranceAmount)
        changes.push(
          `공단 청구액: ${p.name} / ${o.label} (${prev.healthInsuranceAmount ?? "미지정"} → ${o.healthInsuranceAmount ?? "미지정"}원)`,
        );
      if (prev.price !== o.price)
        changes.push(
          `가격: ${p.name} / ${o.label} (${prev.price ?? "미확정"} → ${o.price ?? "미확정"}원)`,
        );
      if (prev.regularPrice !== o.regularPrice)
        changes.push(
          `이벤트 정가: ${p.name} / ${o.label} (${prev.regularPrice === undefined ? "홈페이지 기준" : (prev.regularPrice ?? "미확정")} → ${o.regularPrice === undefined ? "홈페이지 기준" : (o.regularPrice ?? "미확정")}원)`,
        );
      if (prev.tax !== o.tax) {
        const names = {
          unknown: "미확정",
          inclusive: "포함",
          exclusive: "별도",
          exempt: "면세",
        };
        changes.push(
          `부가세: ${p.name} / ${o.label} (${names[prev.tax]} → ${names[o.tax]})`,
        );
      }
      if (
        prev.label !== o.label ||
        prev.unit !== o.unit ||
        JSON.stringify(prev.issues) !== JSON.stringify(o.issues)
      )
        changes.push(`옵션 이름·단위·검토 수정: ${p.name} / ${o.label}`);
    }
  }
  if (before.status !== after.status)
    changes.push(after.status === "published" ? "게시 완료" : "초안으로 저장");
  return changes.length ? changes : ["내용 동일 · 저장 기록"];
}
