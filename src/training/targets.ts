import type { GuideTargetSpec } from "../core/guideTraining";
export const normalize = (s: string) =>
  s.replace(/[\s·\-]/g, "").toLocaleLowerCase();
export function visible(el: Element) {
  if (
    "checkVisibility" in el &&
    !el.checkVisibility({ checkVisibilityCSS: true })
  )
    return false;
  const r = el.getBoundingClientRect();
  return (
    r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
  );
}
export function findTarget(spec: GuideTargetSpec): HTMLElement | undefined {
  const topModal = [
    ...document.querySelectorAll<HTMLElement>('[aria-modal="true"]'),
  ]
    .filter(visible)
    .at(-1);
  const root = spec.scope
    ? document.querySelector(spec.scope)
    : topModal || document;
  if (!root) return;
  const all = (selector: string) =>
    [...root.querySelectorAll<HTMLElement>(selector)].filter(
      (e) => visible(e) && !e.closest(".training-coach"),
    );
  if (spec.selector) return all(spec.selector)[0];
  if (spec.label) {
    const direct = all("[aria-label], [title]").find(
      (e) =>
        e.getAttribute("aria-label") === spec.label || e.title === spec.label,
    );
    if (direct) return direct;
    const l = all("label").find(
      (e) =>
        normalize(e.childNodes[0]?.textContent || "") ===
          normalize(spec.label!) ||
        normalize(e.querySelector("span")?.textContent || "") ===
          normalize(spec.label!),
    );
    const control = (l as HTMLLabelElement | undefined)?.control;
    return (
      (control instanceof HTMLElement && visible(control)
        ? control
        : undefined) ||
      l?.querySelector<HTMLElement>("input,textarea,select") ||
      l
    );
  }
  if (spec.text) {
    const n = normalize(spec.text);
    return (
      all('button,summary,a,label,[role="button"]').find(
        (e) => normalize(e.textContent || "") === n,
      ) ||
      all("h1,h2,h3,strong,b,span").find(
        (e) => normalize(e.textContent || "") === n,
      )
    );
  }
}
export function selectorFor(el: Element) {
  const parts: string[] = [];
  for (
    let p: Element | null = el;
    p && p !== document.body;
    p = p.parentElement
  ) {
    if (p.id) {
      parts.unshift("#" + CSS.escape(p.id));
      break;
    }
    const siblings = p.parentElement
      ? [...p.parentElement.children].filter((e) => e.tagName === p!.tagName)
      : [];
    parts.unshift(
      p.tagName.toLowerCase() + `:nth-of-type(${siblings.indexOf(p) + 1})`,
    );
  }
  return parts.join(" > ");
}
