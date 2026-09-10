/* eslint-disable @typescript-eslint/no-require-imports -- Node CLI reuses the Repository's TypeScript market-data implementation. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const originalLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  module._compile(output, filename);
};

const {
  runSeoulSpatialIngestion,
} = require("../../../../lib/market-data/ingestion/seoul-spatial-ingestion.ts");

function readArgument(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function positiveInteger(value, name, fallback) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name}은(는) 양의 정수여야 합니다.`);
  }
  return parsed;
}

function parseCliOptions() {
  const dataset = readArgument("--dataset");
  if (!["pedestrian", "crosswalk", "all"].includes(dataset)) {
    throw new Error("--dataset=pedestrian|crosswalk|all 중 하나가 필요합니다.");
  }
  const full = process.argv.includes("--full");
  const maxPagesValue = readArgument("--max-pages");
  if (full === (maxPagesValue !== null)) {
    throw new Error("실행 안전을 위해 --full 또는 --max-pages 중 정확히 하나가 필요합니다.");
  }
  const resume = readArgument("--resume");
  if (dataset === "all" && resume !== null) {
    throw new Error("--resume은 단일 dataset에서만 사용할 수 있습니다.");
  }
  return {
    datasets: dataset === "all" ? ["pedestrian", "crosswalk"] : [dataset],
    full,
    maxPages: positiveInteger(maxPagesValue, "--max-pages", undefined),
    pageSize: positiveInteger(readArgument("--page-size"), "--page-size", 1_000),
    timeoutMs: positiveInteger(readArgument("--timeout-ms"), "--timeout-ms", 30_000),
    resume,
  };
}

function safeError(error) {
  let message = error instanceof Error ? error.message : "Spatial ingestion failed";
  message = message.replace(/https?:\/\/\S+/gi, "[redacted-url]");
  const apiKey = process.env.SEOUL_OPEN_DATA_API_KEY?.trim();
  if (apiKey) message = message.replaceAll(apiKey, "[redacted-key]");
  return message;
}

async function main() {
  const options = parseCliOptions();
  const ingestRoot = __dirname;
  const results = [];
  for (const dataset of options.datasets) {
    const result = await runSeoulSpatialIngestion({
      dataset,
      ingestRoot,
      pageSize: options.pageSize,
      maxPages: options.maxPages,
      full: options.full,
      resumeSnapshotId: options.resume ?? undefined,
      timeoutMs: options.timeoutMs,
    });
    results.push({
      dataset,
      snapshot_id: result.manifest.snapshot_id,
      status: result.manifest.status,
      limited_run: result.manifest.limited_run,
      fetched_page_count: result.manifest.fetched_page_count,
      fetched_row_count: result.manifest.fetched_row_count,
      stored_count: result.manifest.stored_count,
      manifest: path.relative(process.cwd(), result.manifestPath).replaceAll("\\", "/"),
      current_pointer_updated: result.currentPointerUpdated,
    });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`SEOUL_SPATIAL_INGESTION_FAILED: ${safeError(error)}\n`);
    process.exitCode = 1;
  }).finally(() => {
    if (originalLoader) require.extensions[".ts"] = originalLoader;
    else delete require.extensions[".ts"];
  });
}

module.exports = { parseCliOptions };
