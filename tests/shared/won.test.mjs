import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoader = loadModule.extensions[".ts"];

loadModule.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

const { formatWon, formatWonInput, parseWonInput } = loadModule(path.join(repositoryRoot, "lib/format/won.ts"));

test.after(() => {
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

test("KRW formatter keeps comma and won suffix in presentation only", () => {
  assert.equal(formatWon(100_000_000), "100,000,000원");
  assert.equal(formatWon(0), "0원");
  assert.equal(formatWon(undefined), "확인 필요");
  assert.equal(formatWonInput(100_000_000), "100,000,000");
  assert.equal(formatWonInput(0), "0");
});

test("KRW parser accepts comma and won suffix but keeps empty distinct from zero", () => {
  assert.equal(parseWonInput("100,000,000"), 100_000_000);
  assert.equal(parseWonInput("1,000,000원"), 1_000_000);
  assert.equal(parseWonInput(""), undefined);
  assert.equal(parseWonInput("0"), 0);
  assert.equal(parseWonInput("-1,000"), undefined);
  assert.equal(parseWonInput("1.5"), undefined);
});
