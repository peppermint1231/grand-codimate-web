import type { Product } from "./model";
import { cleanProductDescription } from "./productDescription";
import { draftPatientDescription } from "./descriptionDraft";
import { optionSessionCount, parsePackageSchedule } from "./packageSchedule";
export function homepagePatientContent(product: Product): Product {
  const p = structuredClone(product);
  p.description = cleanProductDescription(p.description);
  const source = p.composition || p.description;
  if (/\d+\s*(주차|회차)/.test(source)) {
    const schedule = parsePackageSchedule(source);
    const namedCounts = [
      ...p.name.matchAll(/(\d+)\s*(?:회|주)(?=\s|$|[·(])/g),
    ].map((x) => Number(x[1]));
    const namedCount =
      new Set(namedCounts).size === 1 ? namedCounts[0] : undefined;
    const counts = p.options.map(
      (o) =>
        optionSessionCount(o) ||
        (p.options.length === 1 ? namedCount : undefined),
    );
    if (
      schedule &&
      counts.length &&
      counts.every((n) => n && n <= schedule.rows.length)
    ) {
      p.packageBySession = true;
      p.packageScheduleReview = undefined;
      p.options = p.options.map((o, i) => ({
        ...o,
        packageSessionCount: counts[i],
      }));
      if (!p.composition) {
        p.composition = source;
        p.description = source
          .split(/\r?\n/)
          .slice(
            0,
            source
              .split(/\r?\n/)
              .findIndex((l) => /^\s*\d+\s*(주차|회차)/.test(l)),
          )
          .filter((l) => !/^\s*\[.*\]\s*$/.test(l))
          .join("\n")
          .trim();
      }
    } else {
      p.packageBySession = false;
      p.packageScheduleReview =
        "옵션 횟수와 원문의 회차별 일정이 일치하지 않거나 중복되어 있습니다. 공통 구성과 옵션 회차 수를 확인하세요.";
    }
  }
  if (
    !p.description ||
    p.description.split("\n").every((l) => /^\*?\s*팁(?:값)?\s*별도/.test(l))
  ) {
    p.description = [draftPatientDescription(p).text, p.description]
      .filter(Boolean)
      .join("\n");
    p.descriptionOrigin = "generated";
  }
  return p;
}
