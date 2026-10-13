import { useState } from "react";
import { usePatientLookup } from "../hooks/usePatientLookup";
import type { Patient } from "../core/model";
export function QuickPatientLink({
  link,
}: {
  link: (patient: Patient) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Patient>();
  const found = usePatientLookup(query).filter(
    (p) => !p.registrationPending && !p.mergedInto && !p.archived,
  );
  return (
    <div>
      <label>
        기존 환자 검색
        <input
          aria-label="기존 환자 검색"
          value={query}
          placeholder="이름 또는 전화번호"
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(undefined);
          }}
        />
      </label>
      <div className="quick-existing-results">
        {found.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={selected?.id === p.id}
            onClick={() => setSelected(p)}
          >
            {selected?.id === p.id ? "✓ " : ""}
            {p.name} · {p.dob} · {p.phone}
          </button>
        ))}
      </div>
      <p>
        이름·생년월일·연락처로 동일인인지 확인하세요. 상담 사진과 견적, 수납
        기록이 선택한 환자에 연결됩니다.
      </p>
      <button
        className="primary"
        disabled={!selected}
        onClick={() => selected && link(selected)}
      >
        선택한 환자에 연결
      </button>
    </div>
  );
}
