import { mkdir, copyFile, readFile, writeFile, cp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const root = "artifacts/repositories";
for (const file of new Set(files)) {
  if (file.startsWith("android/") || file === ".github/workflows/android.yml")
    continue;
  const dest = root + "/grand-codimate-web/" + file;
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(file, dest);
}
for (const file of files.filter((f) => f.startsWith("android/"))) {
  const dest = root + "/grand-codimate-android/" + file;
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(file, dest);
}
await mkdir(root + "/grand-codimate-android/.github/workflows", {
  recursive: true,
});
let yaml = await readFile(".github/workflows/android.yml", "utf8");
yaml = yaml.replace(
  "      - uses: actions/setup-node@v4",
  `      - name: Read pinned shared commit\n        id: shared\n        run: |\n          ref=$(cat shared-revision.txt)\n          [[ "$ref" =~ ^[a-f0-9]{40}$ ]]\n          echo "ref=$ref" >> "$GITHUB_OUTPUT"\n      - uses: actions/checkout@v4\n        with:\n          repository: peppermint1231/grand-codimate-web\n          ref: \${{ steps.shared.outputs.ref }}\n          path: shared\n      - run: cp -a android shared/android\n      - uses: actions/setup-node@v4`,
);
yaml = yaml.replace(
  "          cache: npm",
  "          cache: npm\n          cache-dependency-path: shared/package-lock.json",
);
yaml = yaml.replace(
  "  apk:\n    runs-on: ubuntu-latest",
  "  apk:\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        working-directory: shared",
);
yaml = yaml
  .replace(
    "        id: shared\n        run:",
    "        id: shared\n        working-directory: .\n        run:",
  )
  .replace(
    "      - run: cp -a android shared/android",
    "      - run: cp -a android shared/android\n        working-directory: .",
  );
yaml = yaml
  .replace(
    "            android/app/build/outputs/apk/release/*.apk",
    "            shared/android/app/build/outputs/apk/release/*.apk",
  )
  .replace("            apk-sha256.txt", "            shared/apk-sha256.txt")
  .replace("            build.log", "            shared/build.log");
await writeFile(
  root + "/grand-codimate-android/.github/workflows/android.yml",
  yaml,
);
await writeFile(
  root + "/grand-codimate-android/shared-revision.txt",
  "SET_WEB_COMMIT_SHA_AFTER_PUBLISHING\n",
);
await writeFile(
  root + "/grand-codimate-android/README.md",
  "# 코디메이트 Android\n\n웹 저장소 게시 후 shared-revision.txt에 검증된 40자리 커밋 SHA를 입력합니다. GitHub APK workflow는 해당 버전의 공통 코드를 가져옵니다. 서명 키와 설정은 웹 저장소 docs/OPERATIONS.md를 따릅니다.\n",
);
console.log(
  "Two repository staging folders prepared; no remote push performed.",
);
