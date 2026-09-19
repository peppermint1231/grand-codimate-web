export interface AppRelease {
  version: string;
  versionCode: number;
  url: string;
  sha256: string;
  notes: string;
}

// Only these public fields are exposed; administrator/account metadata stays private.
export function parseRelease(value: unknown): AppRelease | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.version !== "string" ||
    !r.version.trim() ||
    typeof r.versionCode !== "number" ||
    !Number.isSafeInteger(r.versionCode) ||
    r.versionCode < 1 ||
    r.versionCode > 2100000000 ||
    typeof r.notes !== "string" ||
    typeof r.url !== "string" ||
    typeof r.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(r.sha256)
  )
    return null;
  try {
    const u = new URL(r.url);
    if (u.protocol !== "https:" || u.username || u.password) return null;
  } catch {
    return null;
  }
  return {
    version: r.version,
    versionCode: r.versionCode,
    url: r.url,
    sha256: r.sha256,
    notes: r.notes,
  };
}

export function latestRelease(...values: unknown[]): AppRelease | null {
  return (
    values
      .map(parseRelease)
      .filter((r): r is AppRelease => r !== null)
      .sort((a, b) => b.versionCode - a.versionCode)[0] || null
  );
}

export function newerRelease(
  value: unknown,
  installedCode: number,
): AppRelease | null {
  const r = parseRelease(value);
  if (!Number.isSafeInteger(installedCode) || installedCode < 1)
    throw new Error("설치된 앱 버전을 확인하지 못했습니다.");
  return r && r.versionCode > installedCode ? r : null;
}
