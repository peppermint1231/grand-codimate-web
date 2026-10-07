import { useState } from "react";
import type { Catalog, Product, Option } from "../core/model";
import {
  catalogNodes,
  folderPath,
  sourceFolderId,
} from "../core/catalogFolders";
import { PackageBuilder, blankPackage } from "./PackageBuilder";
import {
  packageOption,
  packagePlanSchema,
  type PackagePlan,
} from "../core/packageBuilder";
import { money } from "../core/model";
const option = (): Option => ({
  id: crypto.randomUUID(),
  label: "1회",
  price: null,
  tax: "exclusive",
  priceKind: "clinic",
  unit: "회",
  review: true,
  issues: [],
  sources: [],
});
export function ProductWizard({
  catalog,
  catalogs,
  initialFolder,
  onCreate,
  onCancel,
  onAddBlock,
}: {
  catalog: Catalog;
  catalogs: Catalog[];
  initialFolder: string;
  onCreate: (p: Product) => void;
  onCancel: () => void;
  onAddBlock: (p: Product) => void;
}) {
  const [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [kind, setKind] = useState("single"),
    [description, setDescription] = useState(""),
    [folder, setFolder] = useState(
      initialFolder || catalogNodes(catalog).find((f) => !f.linkTo)?.id || "",
    );
  const [options, setOptions] = useState<Option[]>([option()]),
    [plan, setPlan] = useState<PackagePlan>(blankPackage),
    [error, setError] = useState(""),
    [publicVisible, setPublicVisible] = useState(false);
  const resolve = () =>
    kind === "package"
      ? [
          packageOption(plan, {
            ...options[0],
            label: `${plan.sessions}회 패키지`,
          }),
        ]
      : options;
  const next = () => {
    setError("");
    if (step === 0 && (!name.trim() || !folder)) {
      setError("상품명과 저장할 폴더를 입력해주세요.");
      return;
    }
    if (step === 1) {
      if (kind === "package") {
        const r = packagePlanSchema.safeParse(plan);
        if (!r.success) {
          setError(r.error.issues.map((i) => i.message).join(" / "));
          return;
        }
      } else if (
        options.some(
          (o) =>
            !o.label.trim() ||
            o.price === null ||
            !Number.isSafeInteger(o.price) ||
            o.price < 0 ||
            o.price > 1e9 ||
            o.tax === "unknown",
        )
      ) {
        setError("모든 옵션의 이름·가격·부가세를 입력해주세요.");
        return;
      }
    }
    setStep(step + 1);
  };
  const create = () => {
    const now = new Date().toISOString();
    onCreate({
      id: crypto.randomUUID(),
      rev: 1,
      createdAt: now,
      updatedAt: now,
      name: name.trim(),
      description,
      composition: "",
      category: folderPath(catalog, folder)
        .map((f) => f.name)
        .join(" / "),
      folderId: sourceFolderId(catalog, folder),
      active: false,
      productType: kind as Product["productType"],
      publicVisible: kind === "block" ? false : publicVisible,
      sources: [],
      options: resolve(),
      ...(kind === "membership"
        ? { offering: { kind: "membership", items: [], terms: "" } }
        : {}),
    });
  };
  return (
    <div className="product-wizard">
      <ol className="wizard-steps">
        {["상품 기본 정보", "옵션·구성 설정", "확인 후 추가"].map((s, i) => (
          <li key={s} aria-current={step === i ? "step" : undefined}>
            STEP {i + 1}
            <strong>{s}</strong>
          </li>
        ))}
      </ol>
      {step === 0 && (
        <>
          <h3>어떤 상품을 만드시나요?</h3>
          <label className="field">
            상품명
            <input
              autoFocus
              value={name}
              maxLength={200}
              placeholder="예: 피부결 관리 5회 패키지"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            상품 타입
            <select
              aria-label="상품 타입"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="single">일반 상품 · 시술/부위/횟수별 옵션</option>
              <option value="package">
                패키지 · 개별 시술을 회차별로 조합
              </option>
              <option value="membership">멤버십 · 등급별 판매 옵션</option>
              <option value="block">블록 · 패키지를 구성하는 개별 시술</option>
            </select>
          </label>
          <label className="field">
            저장할 폴더
            <select value={folder} onChange={(e) => setFolder(e.target.value)}>
              {catalogNodes(catalog)
                .filter((f) => !f.linkTo)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {folderPath(catalog, f.id)
                      .map((x) => x.name)
                      .join(" / ")}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            환자에게 보여줄 상품 설명
            <textarea
              value={description}
              maxLength={10000}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="어떤 고민에 맞는지, 어떤 구성인지 쉽게 설명해주세요."
            />
          </label>
        </>
      )}
      {step === 1 && (
        <>
          <h3>
            {kind === "package"
              ? "패키지를 구성해주세요"
              : "선택 가능한 옵션과 가격을 입력해주세요"}
          </h3>
          {kind === "package" ? (
            <PackageBuilder
              catalogs={catalogs}
              blockCatalog={catalog}
              onAddBlock={onAddBlock}
              value={plan}
              onChange={setPlan}
            />
          ) : (
            <>
              <p>
                옵션 하나가 장바구니에 담는 한 단위입니다. 예: 1회 / 5회, 얼굴 /
                목, GOLD / PLATINUM.
              </p>
              {options.map((o, i) => (
                <div className="wizard-option" key={o.id}>
                  <label className="field">
                    옵션 {i + 1} 이름
                    <input
                      value={o.label}
                      onChange={(e) =>
                        setOptions(
                          options.map((x) =>
                            x.id === o.id ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="form-grid">
                    <label className="field">
                      판매 가격 (원)
                      <input
                        type="number"
                        min="0"
                        value={o.price ?? ""}
                        onChange={(e) =>
                          setOptions(
                            options.map((x) =>
                              x.id === o.id
                                ? {
                                    ...x,
                                    price:
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      부가세
                      <select
                        value={o.tax}
                        onChange={(e) =>
                          setOptions(
                            options.map((x) =>
                              x.id === o.id
                                ? { ...x, tax: e.target.value as Option["tax"] }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="exclusive">별도</option>
                        <option value="inclusive">포함</option>
                        <option value="exempt">면세</option>
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    단위
                    <input
                      value={o.unit}
                      maxLength={30}
                      placeholder="회 / 개 / cc"
                      onChange={(e) =>
                        setOptions(
                          options.map((x) =>
                            x.id === o.id ? { ...x, unit: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={options.length === 1}
                    onClick={() =>
                      setOptions(options.filter((x) => x.id !== o.id))
                    }
                  >
                    이 옵션 삭제
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setOptions([...options, { ...option(), label: "" }])
                }
              >
                옵션 추가
              </button>
            </>
          )}
        </>
      )}
      {step === 2 && (
        <>
          <h3>{name}</h3>
          <p style={{ whiteSpace: "pre-line" }}>{description}</p>
          {resolve().map((o) => (
            <div className="wizard-option" key={o.id}>
              <strong>
                {o.label} · {money(o.price || 0)} (
                {o.tax === "exclusive"
                  ? "부가세 별도"
                  : o.tax === "exempt"
                    ? "면세"
                    : "부가세 포함"}
                )
              </strong>
              {o.regularPrice !== undefined && (
                <p>
                  블록 합계 {money(o.regularPrice || 0)} → 판매가{" "}
                  {money(o.price || 0)}
                </p>
              )}
              {o.packageComposition && <pre>{o.packageComposition}</pre>}
            </div>
          ))}
          {kind !== "block" && (
            <label className="check">
              <input
                type="checkbox"
                checked={publicVisible}
                onChange={(e) => setPublicVisible(e.target.checked)}
              />
              맞춤 시술 찾기에 표시
            </label>
          )}
          <p>
            비활성 상품으로 편집 중 단가표에 추가됩니다. 내용을 확인하고 판매
            활성화한 뒤 ‘저장하고 적용’을 눌러주세요.
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="wizard-actions">
        <button type="button" onClick={onCancel}>
          취소
        </button>
        {step > 0 && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep(step - 1);
            }}
          >
            이전
          </button>
        )}
        {step < 2 ? (
          <button type="button" className="primary" onClick={next}>
            다음 단계
          </button>
        ) : (
          <button type="button" className="primary" onClick={create}>
            상품 추가 완료
          </button>
        )}
      </div>
    </div>
  );
}
