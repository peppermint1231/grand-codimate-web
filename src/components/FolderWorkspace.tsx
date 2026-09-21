import { useRef, useState } from "react";
import {
  ChevronRight,
  GripVertical,
  Plus,
  Copy,
  Trash2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import type { Catalog } from "../core/model";
import {
  catalogNodes,
  folderPath,
  folderError,
  renameFolder,
  addFolder,
  deleteFolder,
  transferFolder,
  FolderCollision,
  folderImpact,
  moveProducts,
  type CollisionPolicy,
} from "../core/catalogFolders";
const colorPresets = [
  { name: "기본 그린", value: "#155e59" },
  { name: "블루", value: "#315d87" },
  { name: "퍼플", value: "#76528b" },
  { name: "로즈", value: "#a04d61" },
  { name: "앰버", value: "#936017" },
];
export function FolderWorkspace({
  catalog,
  selected,
  onSelect,
  editing,
  canEdit,
  start,
  cancel,
  save,
  onChange,
  selectedIds,
  onSelection,
  editActions,
  work,
}: {
  catalog: Catalog;
  selected: string;
  onSelect: (id: string) => void;
  editing: boolean;
  canEdit: boolean;
  start: () => void;
  cancel: () => void;
  save: () => Promise<unknown>;
  onChange: (c: Catalog) => void;
  selectedIds: string[];
  onSelection: (ids: string[]) => void;
  editActions?: React.ReactNode;
  work: (f: () => Promise<unknown>) => unknown;
}) {
  const nodes = catalogNodes(catalog);
  const [expanded, setExpanded] = useState<string[]>([]),
    [renaming, setRenaming] = useState(""),
    [name, setName] = useState(""),
    [color, setColor] = useState("#155e59"),
    [destination, setDestination] = useState("");
  const [collision, setCollision] = useState<{
    id: string;
    parentId: string;
    copy: boolean;
    beforeId?: string;
    afterId?: string;
    targetId: string;
  }>();
  const [deleting, setDeleting] = useState(""),
    [drop, setDrop] = useState<{ id: string; position: string }>();
  const drag = useRef<
    { id: string; x: number; y: number; moved: boolean } | undefined
  >(undefined);
  const apply = (next: Catalog) => {
    const error = folderError(next);
    if (error) throw new Error(error);
    onChange(next);
    if (selected && !catalogNodes(next).some((f) => f.id === selected))
      onSelect("");
    if (renaming && !catalogNodes(next).some((f) => f.id === renaming))
      setRenaming("");
  };
  const rename = () => {
    apply(renameFolder(catalog, renaming, name, color));
    setRenaming("");
  };
  const transfer = (
    id: string,
    parentId: string,
    copy = false,
    beforeId?: string,
    afterId?: string,
    policy?: CollisionPolicy,
  ) => {
    try {
      apply(
        transferFolder(catalog, id, parentId, {
          copy,
          beforeId,
          afterId,
          policy,
        }),
      );
      setCollision(undefined);
      setExpanded((x) => [...x, parentId]);
    } catch (e) {
      if (e instanceof FolderCollision)
        setCollision({
          id,
          parentId,
          copy,
          beforeId,
          afterId,
          targetId: e.targetId,
        });
      else throw e;
    }
  };
  const targetAt = (x: number, y: number) => {
    const el = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-tree-id]");
    if (!el) return;
    const id = el.dataset.treeId!,
      rect = el.getBoundingClientRect(),
      fraction = (y - rect.top) / rect.height;
    return {
      id,
      position: !id
        ? "inside"
        : fraction < 0.25
          ? "before"
          : fraction > 0.75
            ? "after"
            : "inside",
    };
  };
  const render = (parentId: string, depth = 0): React.ReactNode =>
    nodes
      .filter((f) => f.parentId === parentId)
      .map((f) => {
        const children = nodes.some((x) => x.parentId === f.id),
          open = expanded.includes(f.id);
        return (
          <div key={f.id}>
            <div
              className={
                "folder-tree-row folder-depth-" +
                Math.min(depth, 3) +
                " " +
                (selected === f.id ? "selected " : "") +
                (drop?.id === f.id ? "drop-" + drop.position : "")
              }
              style={{ paddingLeft: depth * 14 }}
              data-tree-id={f.id}
              data-depth={depth}
            >
              <button
                className="folder-expander"
                aria-label={f.name + (open ? " 접기" : " 펼치기")}
                disabled={!children}
                aria-expanded={children ? open : undefined}
                onClick={() =>
                  setExpanded(
                    open
                      ? expanded.filter((id) => id !== f.id)
                      : [...expanded, f.id],
                  )
                }
              >
                <ChevronRight
                  size={14}
                  style={{ transform: open ? "rotate(90deg)" : undefined }}
                />
              </button>
              {editing && (
                <button
                  className="catalog-move-handle"
                  aria-label={f.name + " 폴더 이동"}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    drag.current = {
                      id: f.id,
                      x: e.clientX,
                      y: e.clientY,
                      moved: false,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d) return;
                    d.moved ||=
                      Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7;
                    if (d.moved) {
                      setDrop(targetAt(e.clientX, e.clientY));
                      const pane = e.currentTarget.closest(".catalog-folders");
                      if (pane) {
                        const b = pane.getBoundingClientRect();
                        if (e.clientY > b.bottom - 40) pane.scrollTop += 12;
                        else if (e.clientY < b.top + 40) pane.scrollTop -= 12;
                      }
                    }
                  }}
                  onPointerCancel={() => {
                    drag.current = undefined;
                    setDrop(undefined);
                  }}
                  onPointerUp={(e) => {
                    const d = drag.current,
                      t = targetAt(e.clientX, e.clientY);
                    drag.current = undefined;
                    setDrop(undefined);
                    if (!d?.moved || !t || t.id === d.id) return;
                    work(async () => {
                      const parent =
                        t.position === "inside"
                          ? t.id
                          : nodes.find((f) => f.id === t.id)!.parentId;
                      transfer(
                        d.id,
                        parent,
                        false,
                        t.position === "before" ? t.id : undefined,
                        t.position === "after" ? t.id : undefined,
                      );
                    });
                  }}
                >
                  <GripVertical size={15} />
                </button>
              )}
              {renaming === f.id && editing ? (
                <div className="folder-inline-edit">
                  <input
                    autoFocus
                    aria-label="폴더 이름"
                    value={name}
                    style={{ color }}
                    maxLength={60}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        work(async () => rename());
                      }
                      if (e.key === "Escape") setRenaming("");
                    }}
                  />
                  <div
                    className="folder-color-presets"
                    role="group"
                    aria-label="텍스트 색상 프리셋"
                  >
                    {colorPresets.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        title={preset.name}
                        aria-label={preset.name}
                        aria-pressed={color === preset.value}
                        style={{ backgroundColor: preset.value }}
                        onClick={() => setColor(preset.value)}
                      />
                    ))}
                  </div>
                  <label className="folder-custom-color">
                    직접 선택
                    <input
                      type="color"
                      aria-label="폴더 색상"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                    />
                  </label>
                  <button
                    aria-label="폴더 이름 적용"
                    onClick={() => work(async () => rename())}
                  >
                    적용
                  </button>
                  <button
                    aria-label="이름 변경 취소"
                    onClick={() => setRenaming("")}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  className="folder-node"
                  data-folder-target={f.id}
                  onClick={() => {
                    onSelect(f.id);
                    setExpanded((x) => [...x, f.id]);
                  }}
                  onDoubleClick={() => {
                    if (editing) {
                      setRenaming(f.id);
                      setName(f.name);
                      setColor(f.color || "#155e59");
                    }
                  }}
                >
                  <span style={{ color: f.color || "#155e59" }}>{f.name}</span>
                  <small>{folderImpact(catalog, f.id).products}</small>
                </button>
              )}
            </div>
            {open && render(f.id, depth + 1)}
          </div>
        );
      });
  const targetName = nodes.find((f) => f.id === selected)?.name || "최상위";
  return (
    <aside className="card catalog-folders" aria-label="고민별 폴더 목록">
      <div className="folder-list-heading">
        <h3>고민별 폴더</h3>
        {canEdit && !editing && (
          <button onClick={start}>
            <Pencil size={15} />
            폴더 목록 수정
          </button>
        )}
      </div>
      <div className="catalog-fold-controls" aria-label="폴더 펼침 설정">
        <button type="button" onClick={() => setExpanded([])}>
          모두 접기
        </button>
        <button
          type="button"
          onClick={() => setExpanded(nodes.map((f) => f.id))}
        >
          모두 펼치기
        </button>
      </div>
      {editing && (
        <div className="folder-edit-toolbar">
          <fieldset
            className="catalog-edit-fieldset"
            disabled={!!renaming || !!collision || !!deleting}
          >
            {editActions}
          </fieldset>
          <button
            className="primary"
            disabled={!!renaming || !!collision || !!deleting}
            onClick={() => work(save)}
          >
            <Save size={15} />
            폴더 저장
          </button>
          <button
            onClick={() => {
              if (
                window.confirm("폴더 수정 내용을 저장하지 않고 취소할까요?")
              ) {
                setRenaming("");
                setCollision(undefined);
                setDeleting("");
                cancel();
              }
            }}
          >
            취소
          </button>
          <p className="small">
            이름은 두 번 누르면 수정됩니다. 손잡이를 폴더의 위·아래로 끌면 순서
            변경, 가운데로 끌면 폴더 안으로 이동합니다. 저장하면 추천기에
            반영됩니다.
          </p>
        </div>
      )}
      <button
        className={
          "folder-root-target " + (drop?.id === "" ? "drop-inside" : "")
        }
        data-tree-id=""
        onClick={() => onSelect("")}
      >
        전체 상품 · {catalog.products.length}
        {editing ? " / 최상위 위치" : ""}
      </button>
      {render("")}
      {editing && (
        <div className="folder-actions">
          <p className="small">선택: {targetName} · 하위 폴더 3단계까지</p>
          <div className="button-row">
            <button
              disabled={!!selected && folderPath(catalog, selected).length >= 4}
              onClick={() =>
                work(async () => {
                  let label = "새 폴더",
                    i = 2;
                  while (
                    nodes.some(
                      (f) => f.parentId === selected && f.name === label,
                    )
                  )
                    label = "새 폴더 " + i++;
                  const result = addFolder(catalog, selected, label);
                  apply(result.catalog);
                  setExpanded((x) => [...x, selected]);
                  onSelect(result.id);
                  setRenaming(result.id);
                  setName(label);
                  setColor("#155e59");
                })
              }
            >
              <Plus size={15} />
              폴더 생성
            </button>
            <button
              disabled={!selected}
              onClick={() => {
                const f = nodes.find((f) => f.id === selected)!;
                setRenaming(f.id);
                setName(f.name);
                setColor(f.color || "#155e59");
              }}
            >
              이름·색상
            </button>
            <button disabled={!selected} onClick={() => setDeleting(selected)}>
              <Trash2 size={15} />
              삭제
            </button>
          </div>
          <p className="small">
            복사한 상품은 비활성·추천기 숨김 상태로 생성됩니다.
          </p>
          <label className="field">
            <span>이동·복사할 위치</span>
            <select
              aria-label="이동할 폴더"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">최상위</option>
              {nodes.map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPath(catalog, f.id)
                    .map((x) => x.name)
                    .join(" / ")}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button
              disabled={!selected}
              onClick={() => work(async () => transfer(selected, destination))}
            >
              폴더 이동
            </button>
            <button
              disabled={!selected}
              onClick={() =>
                work(async () => transfer(selected, destination, true))
              }
            >
              <Copy size={15} />
              폴더 복사
            </button>
            <button
              disabled={!destination || !selectedIds.length}
              onClick={() =>
                work(async () => {
                  apply(moveProducts(catalog, selectedIds, destination));
                  onSelection([]);
                })
              }
            >
              선택 {selectedIds.length}개 상품 이동
            </button>
          </div>
        </div>
      )}
      {collision && (
        <div
          className="folder-decision"
          role="dialog"
          aria-label="중복 폴더 처리"
        >
          <h4>같은 이름의 폴더가 있습니다</h4>
          <p>
            대상 폴더에 폴더 {folderImpact(catalog, collision.targetId).folders}
            개, 상품 {folderImpact(catalog, collision.targetId).products}개가
            있습니다.
          </p>
          <p>
            합치기는 양쪽 하위 항목을 보존합니다. 덮어쓰기는 대상 폴더의 하위
            항목과 상품을 삭제하고 옮겨온 내용으로 교체합니다.
          </p>
          <div className="button-row">
            <button
              onClick={() =>
                work(async () =>
                  transfer(
                    collision.id,
                    collision.parentId,
                    collision.copy,
                    collision.beforeId,
                    collision.afterId,
                    "merge",
                  ),
                )
              }
            >
              하위항목 합치기
            </button>
            <button
              onClick={() =>
                work(async () =>
                  transfer(
                    collision.id,
                    collision.parentId,
                    collision.copy,
                    collision.beforeId,
                    collision.afterId,
                    "replace",
                  ),
                )
              }
            >
              대상 덮어쓰기
            </button>
            <button onClick={() => setCollision(undefined)}>취소</button>
          </div>
        </div>
      )}
      {deleting && (
        <div
          className="folder-decision"
          role="dialog"
          aria-label="폴더 삭제 확인"
        >
          <h4>하위 항목도 함께 삭제됩니다</h4>
          <p>
            {nodes.find((f) => f.id === deleting)?.name}: 폴더{" "}
            {folderImpact(catalog, deleting).folders}개와 상품{" "}
            {folderImpact(catalog, deleting).products}개가 삭제됩니다. 보존할
            항목은 먼저 다른 폴더로 옮기세요. 저장 전까지 실제 단가표는 바뀌지
            않습니다.
          </p>
          <button
            onClick={() =>
              work(async () => {
                apply(deleteFolder(catalog, deleting));
                setDeleting("");
                onSelect("");
              })
            }
          >
            하위항목 포함 삭제
          </button>
          <button onClick={() => setDeleting("")}>취소하고 항목 옮기기</button>
        </div>
      )}
    </aside>
  );
}
