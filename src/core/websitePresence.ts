import { inFolder } from "./catalogFolders";
import { catalogBook, type Catalog } from "./model";
export const websitePresenceStyles = {
  current: { color: "#0f766e", label: "홈페이지 게시 확인" },
  missing: { color: "#6b7280", label: "홈페이지에서 제외됨" },
  unknown: { color: "#76528b", label: "홈페이지 게시 여부 미확인" },
  mixed: { color: "#a16207", label: "홈페이지 게시 상태 혼합" },
};
export function websiteFolderPresence(catalog: Catalog, folderId: string) {
  if (catalogBook(catalog) !== "이벤트") return;
  const products = catalog.products.filter((p) =>
    inFolder(catalog, p, folderId),
  );
  const states = new Set(
    products.map((p) =>
      !p.webEvent ? "unknown" : p.webEvent.missing ? "missing" : "current",
    ),
  );
  if (!states.size) return;
  return websitePresenceStyles[
    states.size === 1
      ? ([...states][0] as "current" | "missing" | "unknown")
      : "mixed"
  ];
}
