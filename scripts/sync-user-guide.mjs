import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
import vm from "node:vm";
const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const hash = (v) =>
  crypto.createHash("sha256").update(v).digest("hex").slice(0, 20);
const lessons = JSON.parse(read("src/data/userGuideLessons.json"));
const coverage = JSON.parse(read("scripts/user-guide-coverage.json"));
const version = JSON.parse(read("package.json")).version;
const lockPath = "scripts/user-guide.lock.json",
  updatePath = "src/data/userGuideUpdates.json";
const old = fs.existsSync(path.join(root, lockPath))
  ? JSON.parse(read(lockPath))
  : {};
const commands = new Map();
const ast = ts.createSourceFile(
  "domain.ts",
  read("src/core/domain.ts"),
  ts.ScriptTarget.Latest,
  true,
);
function visit(node) {
  if (
    ts.isCaseClause(node) &&
    ts.isStringLiteral(node.expression) &&
    node.expression.text.includes(".")
  )
    commands.set(node.expression.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const coveredFiles = new Set(),
  coveredCommands = new Set();
const extract = (ref) => {
  const [file, name] = ref.split("#");
  coveredFiles.add(file);
  const source = read(file);
  if (!name) return source;
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const fn = parsed.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
  );
  if (!fn) throw Error("사용법 연결 함수 없음: " + ref);
  return fn.getText(parsed);
};
// Stable practice IDs are the completion contract; text/source hashes only mark unread updates.
const compiled = ts.transpileModule(read("src/core/guideTraining.ts"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const exported = {};
vm.runInNewContext(compiled, { exports: exported });
const learningLegacy = JSON.parse(
  read("src/data/userGuideLearningLegacy.json"),
);
const recipes = exported.practiceRecipes;
const next = {},
  updates = {},
  errors = [];
for (const lesson of lessons) {
  const spec = coverage[lesson.id];
  if (!spec) throw Error("사용법 기능 연결 없음: " + lesson.id);
  const pieces = spec.sources.map(extract);
  for (const name of spec.commands) {
    if (!commands.has(name)) throw Error("사용법 연결 명령 없음: " + name);
    coveredCommands.add(name);
    pieces.push(commands.get(name));
  }
  const sourceHash = hash(pieces.join("\n")),
    revision = hash(JSON.stringify(lesson) + sourceHash);
  const changed =
    !old[lesson.id] ||
    old[lesson.id].revision !== revision ||
    old[lesson.id].sourceHash !== sourceHash;
  if (changed) errors.push(lesson.id);
  next[lesson.id] = {
    revision,
    sourceHash,
    updatedIn: changed ? version : old[lesson.id].updatedIn,
  };
  const learningVersion = lesson.learningVersion || 1;
  const recipe = recipes.find((r) => r.id === lesson.id);
  if (
    !recipe ||
    new Set(recipe.steps.map((s) => s.id)).size !== recipe.steps.length
  )
    throw Error(
      "실습 단계 ID는 과정 안에서 고유하고 영구적이어야 합니다: " + lesson.id,
    );
  const compatibleRevisions =
    learningVersion === (old[lesson.id]?.learningVersion || 1)
      ? [
          ...new Set([
            ...(learningVersion === 1 ? learningLegacy[lesson.id] || [] : []),
            ...(old[lesson.id]?.compatibleRevisions || []),
            ...(old[lesson.id]?.revision ? [old[lesson.id].revision] : []),
          ]),
        ].filter((r) => r !== revision)
      : [];
  Object.assign(next[lesson.id], { learningVersion, compatibleRevisions });
  updates[lesson.id] = {
    revision,
    updatedIn: next[lesson.id].updatedIn,
    learningVersion,
    compatibleRevisions,
    stepIds: recipe.steps.map((s) => s.id),
  };
}
const missingFiles = fs
  .readdirSync(path.join(root, "src/components"))
  .filter(
    (f) => f.endsWith(".tsx") && !coveredFiles.has("src/components/" + f),
  );
const missingCommands = [...commands.keys()].filter(
  (c) => !coveredCommands.has(c),
);
if (missingFiles.length || missingCommands.length)
  throw Error(
    "사용법에 연결되지 않은 새 기능: " +
      [...missingFiles, ...missingCommands].join(", "),
  );
if (process.argv.includes("--write") && process.argv.includes("--reviewed")) {
  // This is an explicit developer acknowledgement, never an unattended build step.
  // Update the lesson and its changeNote after reviewing behavior, then regenerate.
  fs.writeFileSync(
    path.join(root, lockPath),
    JSON.stringify(next, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(root, updatePath),
    JSON.stringify(updates, null, 2) + "\n",
  );
  console.log(`사용법 ${lessons.length}개 연결 · 검토 반영 ${errors.length}개`);
} else {
  if (errors.length)
    throw Error(
      "기능 또는 안내가 변경되었습니다. 해당 사용법·변경 설명을 검토하고 npm run guide:sync로 반영하세요: " +
        errors.join(", "),
    );
  if (read(updatePath) !== JSON.stringify(updates, null, 2) + "\n")
    throw Error("사용법 버전 정보 불일치: npm run guide:sync");
  console.log(
    `사용법 ${lessons.length}개 · 구성요소 ${coveredFiles.size}개 · 명령 ${commands.size}개 연결 확인`,
  );
}
