import { expect, it } from "vitest";
import releases from "../src/data/releaseHistory.json";
import { version } from "../package.json";
it("keeps release notes current, unique and newest first when shipping a version", () => {
  expect(releases[0].version).toBe(version);
  expect(new Set(releases.map(r => r.version)).size).toBe(releases.length);
  const compare = (a:string,b:string) => a.localeCompare(b,undefined,{numeric:true});
  expect(releases.map(r => r.version)).toEqual(releases.map(r => r.version).sort((a,b)=>compare(b,a)));
  for (const release of releases) {
    expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(release.changes.length).toBeGreaterThan(0);
    expect(release.changes.every(c=>c.trim().length>0)).toBe(true);
  }
});
