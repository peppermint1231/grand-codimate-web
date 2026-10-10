import { useEffect, useMemo, useState } from "react";
import { DonutChart } from "./AnalyticsCharts";
import { comparisonBuckets } from "../core/analyticsComparison";
import {
  compactRegionDonut,
  mergeRegionCounts,
  regionBreakdown,
  regionCatchment,
  regionCityCodes,
  regionParts,
  type RegionCount,
} from "../core/regionStatistics";
import "./PatientRegionExplorer.css";
const fmt = (v: number) => v.toLocaleString("ko-KR");
const chuncheon = "강원특별자치도 춘천시";
type MapFeature = { id: string; name: string; path: string; bounds: number[] };
type MapData = { features: MapFeature[] };
type Place = { id: string; name: string };
const maps = new Map<string, MapData>();
function bounds(features: MapFeature[]) {
  if (!features.length) return [0, 0, 1000, 1000];
  const x = Math.min(...features.map((f) => f.bounds[0])),
    y = Math.min(...features.map((f) => f.bounds[1]));
  const w = Math.max(...features.map((f) => f.bounds[0] + f.bounds[2])) - x,
    h = Math.max(...features.map((f) => f.bounds[1] + f.bounds[3])) - y;
  const pad = Math.max(w, h) * 0.04;
  return [x - pad, y - pad, w + pad * 2, h + pad * 2];
}
function RegionBars({
  rows,
  onSelect,
}: {
  rows: RegionCount[];
  onSelect?: (name: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count)),
    total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <div className="region-detail-bars" role="list">
      {rows.map((r) => (
        <button
          type="button"
          key={r.name}
          role="listitem"
          disabled={!onSelect}
          onClick={() => onSelect?.(r.name)}
          className="region-bar"
        >
          <span>{r.name}</span>
          <strong>
            {fmt(r.count)}명{" "}
            <small>{((r.count / (total || 1)) * 100).toFixed(1)}%</small>
          </strong>
          <i>
            <i style={{ width: (r.count / max) * 100 + "%" }} />
          </i>
        </button>
      ))}
      {!rows.length && (
        <p className="small">이 지역에 집계된 환자가 없습니다.</p>
      )}
    </div>
  );
}
export function PatientRegionExplorer({
  rows: rawRows,
  total,
}: {
  rows: RegionCount[];
  total: number;
}) {
  const rows = useMemo(
    () => comparisonBuckets(mergeRegionCounts(rawRows)).included,
    [rawRows],
  );
  const mapped = rows.filter((r) => regionParts(r.name));
  const known = mapped.reduce((n, r) => n + r.count, 0);
  const cities = useMemo(() => regionBreakdown(rows, "city"), [rows]);
  const local = useMemo(
    () => rows.filter((r) => r.name.startsWith(chuncheon + " ")),
    [rows],
  );
  const catchment = useMemo(() => regionBreakdown(rows, "catchment"), [rows]);
  const [places, setPlaces] = useState<Place[]>([]),
    [data, setData] = useState<MapData>(),
    [error, setError] = useState("");
  const [targetRegion, setTargetRegion] = useState("");
  const [retry, setRetry] = useState(0),
    [hover, setHover] = useState("");
  const [detail, setDetail] = useState<{
    title: string;
    rows: RegionCount[];
  }>();
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState([0, 0]);
  const leaf = places.length === 3 ? places[2] : undefined;
  const scope = places[Math.min(places.length, 2) - 1];
  const key = scope?.id || "national";
  useEffect(() => {
    setError("");
    setHover("");
    setZoom(1);
    setPan([0, 0]);
    if (maps.has(key)) {
      setData(maps.get(key));
      return;
    }
    setData(undefined);
    const controller = new AbortController();
    fetch(`/maps/korea-v1/${key}.json`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then(async (r) => {
        if (!r.ok) throw Error("지도 경계를 불러오지 못했습니다.");
        const result = (await r.json()) as MapData;
        if (!Array.isArray(result.features))
          throw Error("지도 파일을 확인할 수 없습니다.");
        if (controller.signal.aborted) return;
        if (maps.size >= 32) maps.delete(maps.keys().next().value!);
        maps.set(key, result);
        setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("지도를 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요.");
      });
    return () => controller.abort();
  }, [key, retry]);
  useEffect(() => {
    setZoom(1);
    setPan([0, 0]);
    setHover("");
  }, [leaf?.id]);
  const features = useMemo(() => data?.features || [], [data]);
  useEffect(() => {
    if (!targetRegion || !data) return;
    const f = data.features.find((f) => f.name === targetRegion);
    if (f && key.length === 5) {
      setPlaces((p) => [...p.slice(0, 2), f]);
      setTargetRegion("");
    }
  }, [data, targetRegion, key]);
  const counts = useMemo(
    () =>
      new Map(
        features.map((f) => [
          f.name,
          rows
            .filter((r) => r.name === f.name || r.name.startsWith(f.name + " "))
            .reduce((n, r) => n + r.count, 0),
        ]),
      ),
    [features, rows],
  );
  const max = Math.max(1, ...counts.values());
  const visible = scope
    ? rows.filter(
        (r) => r.name === scope.name || r.name.startsWith(scope.name + " "),
      )
    : rows;
  const displayedTotal = [...counts.values()].reduce((n, v) => n + v, 0);
  const unresolvedBoundary =
    visible.reduce((n, r) => n + r.count, 0) - displayedTotal;
  const box = bounds(
    leaf ? features.filter((f) => f.id === leaf.id) : features,
  );
  const view = [
    box[0] + (box[2] * (1 - 1 / zoom)) / 2 + pan[0] * box[2],
    box[1] + (box[3] * (1 - 1 / zoom)) / 2 + pan[1] * box[3],
    box[2] / zoom,
    box[3] / zoom,
  ];
  const pathFor = (city: string): Place[] => {
    const id = regionCityCodes[city];
    if (!id) return [];
    return [
      { id: id.slice(0, 2), name: city.split(" ")[0] },
      { id, name: city },
    ];
  };
  const choose = (f: MapFeature) => {
    setTargetRegion("");
    setDetail(undefined);
    if (key === "national") setPlaces([f]);
    else if (key.length === 2) setPlaces([places[0], f]);
    else setPlaces([...places.slice(0, 2), f]);
  };
  const mapRows = leaf
    ? [
        { name: leaf.name, count: counts.get(leaf.name) || 0 },
        ...features
          .filter((f) => f.id !== leaf.id)
          .map((f) => ({ name: f.name, count: counts.get(f.name) || 0 }))
          .filter((r) => r.count)
          .sort((a, b) => b.count - a.count),
      ]
    : features
        .map((f) => ({ name: f.name, count: counts.get(f.name) || 0 }))
        .sort((a, b) => b.count - a.count);
  const showCity = (city: string) => {
    setPlaces(pathFor(city));
    setDetail({
      title: city + " · 동·읍·면",
      rows: rows.filter((r) => r.name.startsWith(city + " ")),
    });
  };
  return (
    <div className="patient-region-explorer">
      <p className="region-explainer">
        도로명·지번 주소를 같은 법정동으로 통합했습니다. 비율은 지역이 확인된
        환자를 기준으로 계산합니다. 지역 확인 {fmt(known)}명 · 비교 제외{" "}
        {fmt(Math.max(0, total - known))}명.
      </p>
      <div className="region-donuts">
        <section>
          <h4>시·군·구별 비율</h4>
          <DonutChart
            rows={compactRegionDonut(cities)}
            label="시·군·구별 환자 비율"
            formatLabel={(name) =>
              name.replace(/^(강원특별자치도|경기도) /, "")
            }
            onSelect={(name) => {
              if (name === "그 외 지역") {
                setDetail({ title: "그 외 시·군·구", rows: cities.slice(7) });
                setPlaces([]);
              } else showCity(name);
            }}
          />
        </section>
        <section>
          <h4>춘천시 내 동·읍·면 비율</h4>
          <DonutChart
            rows={compactRegionDonut(local).map((r) => ({
              ...r,
              name: r.name.replace(chuncheon + " ", ""),
            }))}
            label="춘천시 법정동별 환자 비율"
            onSelect={(name) => {
              setPlaces(pathFor(chuncheon));
              setTargetRegion(
                name === "그 외 지역" ? "" : chuncheon + " " + name,
              );
              setDetail({
                title:
                  name === "그 외 지역"
                    ? "춘천시 · 그 외 동·읍·면"
                    : `춘천시 ${name}`,
                rows:
                  name === "그 외 지역"
                    ? local.slice(7)
                    : local.filter((r) => r.name === chuncheon + " " + name),
              });
            }}
          />
        </section>
        <section>
          <h4>환자 유입 권역</h4>
          <DonutChart
            rows={catchment}
            label="환자 유입 권역 비율"
            onSelect={(name) => {
              const subset = rows.filter(
                (r) => regionCatchment(r.name) === name,
              );
              setDetail({
                title: name + " · 상세 지역",
                rows: regionBreakdown(subset, "city"),
              });
              setPlaces(
                name === "춘천시"
                  ? pathFor(chuncheon)
                  : name === "강원 타지역"
                    ? [{ id: "51", name: "강원특별자치도" }]
                    : [],
              );
            }}
          />
        </section>
      </div>
      {detail && (
        <section className="region-selection" aria-live="polite">
          <div className="region-heading">
            <h4>{detail.title}</h4>
            <button type="button" onClick={() => setDetail(undefined)}>
              선택 해제
            </button>
          </div>
          <RegionBars
            rows={detail.rows}
            onSelect={(name) => {
              if (regionCityCodes[name]) showCity(name);
            }}
          />
        </section>
      )}
      <div className="region-heading">
        <div>
          <h4>전국 환자 지역 지도</h4>
          <p className="small">
            지역을 누르면 확대됩니다. 진할수록 환자 수가 많습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPlaces(pathFor(chuncheon));
            setDetail(undefined);
          }}
        >
          춘천시 바로 보기
        </button>
      </div>
      <nav className="region-breadcrumb" aria-label="지역 지도 단계">
        <button
          type="button"
          onClick={() => {
            setPlaces([]);
            setDetail(undefined);
          }}
        >
          전국
        </button>
        {places.map((p, i) => (
          <span key={p.id}>
            {" "}
            ›{" "}
            <button
              type="button"
              aria-current={i === places.length - 1 ? "location" : undefined}
              onClick={() => {
                setPlaces(places.slice(0, i + 1));
                setDetail(undefined);
              }}
            >
              {p.name
                .split(" ")
                .slice(i === 0 ? 0 : i === 1 ? 1 : 2)
                .join(" ") || p.name}
            </button>
          </span>
        ))}
      </nav>
      <div className="region-map-layout">
        <div className="region-map-panel">
          {error ? (
            <div role="alert">
              {error}{" "}
              <button type="button" onClick={() => setRetry((n) => n + 1)}>
                다시 불러오기
              </button>
            </div>
          ) : !data ? (
            <p role="status">지역 지도를 불러오는 중입니다…</p>
          ) : (
            <>
              <div className="region-map-tools">
                <button
                  type="button"
                  aria-label="지도 확대"
                  disabled={zoom >= 8}
                  onClick={() => setZoom((v) => Math.min(8, v * 1.6))}
                >
                  ＋
                </button>
                <button
                  type="button"
                  aria-label="지도 축소"
                  disabled={zoom <= 1}
                  onClick={() => {
                    setZoom((v) => Math.max(1, v / 1.6));
                    setPan([0, 0]);
                  }}
                >
                  −
                </button>
                {zoom > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="지도 왼쪽 이동"
                      onClick={() => setPan(([x, y]) => [x - 0.15 / zoom, y])}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      aria-label="지도 위로 이동"
                      onClick={() => setPan(([x, y]) => [x, y - 0.15 / zoom])}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="지도 아래로 이동"
                      onClick={() => setPan(([x, y]) => [x, y + 0.15 / zoom])}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label="지도 오른쪽 이동"
                      onClick={() => setPan(([x, y]) => [x + 0.15 / zoom, y])}
                    >
                      →
                    </button>
                  </>
                )}
              </div>
              <svg
                className="region-map"
                viewBox={view.join(" ")}
                aria-label={`${leaf?.name || scope?.name || "전국"} 환자 지역 지도`}
              >
                {features.map((f) => {
                  const count = counts.get(f.name) || 0;
                  const intensity = count
                    ? Math.log1p(count) / Math.log1p(max)
                    : 0;
                  return (
                    <path
                      key={f.id}
                      d={f.path}
                      fill={
                        count
                          ? `hsl(170 46% ${88 - intensity * 65}%)`
                          : "#e3e9ee"
                      }
                      stroke={
                        hover === f.name || leaf?.id === f.id
                          ? "#e5a040"
                          : "#ffffff"
                      }
                      strokeWidth={
                        hover === f.name || leaf?.id === f.id ? 2.5 : 0.8
                      }
                      vectorEffect="non-scaling-stroke"
                      fillRule="evenodd"
                      role="button"
                      tabIndex={0}
                      aria-label={`${f.name} ${fmt(count)}명 · ${key.length === 5 ? "선택" : "확대"}`}
                      onClick={() => choose(f)}
                      onMouseEnter={() => setHover(f.name)}
                      onMouseLeave={() => setHover("")}
                      onFocus={() => setHover(f.name)}
                      onBlur={() => setHover("")}
                      onKeyDown={(e) => {
                        if (["Enter", " "].includes(e.key)) {
                          e.preventDefault();
                          choose(f);
                        }
                      }}
                    >
                      <title>
                        {f.name} · {fmt(count)}명
                      </title>
                    </path>
                  );
                })}
              </svg>
              <div className="region-map-hover" aria-live="polite">
                {hover
                  ? `${hover} · ${fmt(counts.get(hover) || 0)}명`
                  : leaf
                    ? `${leaf.name} · ${fmt(counts.get(leaf.name) || 0)}명`
                    : `${scope?.name || "전국"} · ${fmt(displayedTotal)}명`}
              </div>
              <div className="region-map-legend">
                <span>0명</span>
                <i />
                <span>{fmt(max)}명</span>
                <small>로그 색상 척도 · 환자 수</small>
              </div>
            </>
          )}
          <p className="small region-map-source">
            경계: 국가공간정보포털 ·{" "}
            <a
              href="https://github.com/KnellBalm/kr-admin-geojson"
              target="_blank"
              rel="noreferrer"
            >
              GeoJSON 가공 출처
            </a>{" "}
            (2023 기준). 지역 인구 대비 비율이 아닙니다.
          </p>
        </div>
        <section className="region-map-details">
          <h4>{leaf ? leaf.name : scope?.name || "전국"} · 상세 통계</h4>
          <p className="small">
            막대를 눌러도 해당 지역으로 이동합니다.{" "}
            {leaf
              ? "비율은 같은 시·군·구 내 비교입니다."
              : "비율은 현재 지도 범위 내 비교입니다."}
          </p>
          <RegionBars
            rows={mapRows}
            onSelect={(name) => {
              const f = features.find((f) => f.name === name);
              if (f) choose(f);
            }}
          />
          {!!data && unresolvedBoundary > 0 && (
            <details>
              <summary>경계 매칭 필요 {fmt(unresolvedBoundary)}명</summary>
              <p className="small">
                행정동만 기재되었거나 지도 기준 이후 변경된 지역입니다. 상위
                지역 합계에는 포함하며 법정동 지도에 임의 배정하지 않습니다.
              </p>
              <RegionBars
                rows={visible.filter(
                  (r) =>
                    !features.some(
                      (f) =>
                        r.name === f.name || r.name.startsWith(f.name + " "),
                    ),
                )}
              />
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
