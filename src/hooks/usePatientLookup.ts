import { useEffect, useState } from "react";
import type { Patient } from "../core/model";
import { api } from "../lib/api";
/** Search the complete encrypted directory, including imported patients outside the workspace. */
export function usePatientLookup(query: string) {
  const [result, setResult] = useState<{ query: string; patients: Patient[] }>({
    query: "",
    patients: [],
  });
  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api("/patients/search?search=" + encodeURIComponent(query), {
        signal: controller.signal,
      })
        .then((r) =>
          setResult({
            query,
            patients: r.rows.map((x: { p: Patient }) => x.p),
          }),
        )
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return result.query === query ? result.patients : [];
}
