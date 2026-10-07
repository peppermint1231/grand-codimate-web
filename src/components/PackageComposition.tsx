export function PackageComposition({ text }: { text: string }) {
  const [schedule, totals] = text.split(/\n+구성별 포함 회차\n/);
  return (
    <div className="pd-schedule">
      <ol>
        {schedule.split("\n").map((line, i) => {
          const m = line.match(/^(\d+(?:주차|회차))\s+(.+)$/);
          return (
            <li key={i}>
              <strong>{m?.[1] || `${i + 1}회차`}</strong>
              <span>{m?.[2] || line}</span>
            </li>
          );
        })}
      </ol>
      {totals && (
        <details>
          <summary>구성 합계 확인</summary>
          <p>{totals}</p>
        </details>
      )}
      <small>
        선택한 옵션에 포함된 구성입니다. 실제 내원 간격은 상담에서 안내합니다.
      </small>
    </div>
  );
}
