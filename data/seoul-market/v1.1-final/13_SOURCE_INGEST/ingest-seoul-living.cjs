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
  runSeoulLivingIngestion,
} = require("../../../../lib/market-data/ingestion/seoul-living-ingestion.ts");

function readArgument(name, argv = process.argv) {
  const prefix = `${name}=`;
  const inline = argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function positiveInteger(value, name, fallback) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name}은(는) 양의 정수여야 합니다.`);
  }
  return parsed;
}

function parseCliOptions(argv = process.argv) {
  const full = argv.includes("--full");
  const maxPagesValue = readArgument("--max-pages", argv);
  if (full === (maxPagesValue !== null)) {
    throw new Error("실행 안전을 위해 --full 또는 --max-pages 중 정확히 하나가 필요합니다.");
  }
  return {
    full,
    maxPages: positiveInteger(maxPagesValue, "--max-pages", undefined),
    pageSize: positiveInteger(
      readArgument("--page-size", argv),
      "--page-size",
      1_000,
    ),
    timeoutMs: positiveInteger(
      readArgument("--timeout-ms", argv),
      "--timeout-ms",
      30_000,
    ),
    maxAttempts: positiveInteger(
      readArgument("--max-attempts", argv),
      "--max-attempts",
      3,
    ),
    resume: readArgument("--resume", argv),
  };
}

function safeError(error) {
  let message =
    error instanceof Error ? error.message : "Living population ingestion failed";
  message = message.replace(/https?:\/\/\S+/gi, "[redacted-url]");
  const apiKey = process.env.SEOUL_OPEN_DATA_API_KEY?.trim();
  if (apiKey) message = message.replaceAll(apiKey, "[redacted-key]");
  return message;
}

async function main() {
  const options = parseCliOptions();
  const result = await runSeoulLivingIngestion({
    ingestRoot: __dirname,
    pageSize: options.pageSize,
    maxPages: options.maxPages,
    full: options.full,
    resumeSnapshotId: options.resume ?? undefined,
    timeoutMs: options.timeoutMs,
    maxAttempts: options.maxAttempts,
    dependencies: {
      onProgress: (progress) => {
        if (
          progress.completedPages === 1 ||
          progress.completedPages % 10 === 0 ||
          progress.completedPages === progress.expectedPages
        ) {
          process.stderr.write(
            `LIVING_INGEST_PROGRESS ${progress.completedPages}/${progress.expectedPages} pages ${progress.fetchedRows}/${progress.totalRows} rows snapshot=${progress.snapshotId}\n`,
          );
        }
      },
    },
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        snapshot_id: result.manifest.snapshot_id,
        status: result.manifest.status,
        source_reference_date: result.manifest.source_reference_date,
        fetched_rows: result.manifest.fetched_rows,
        normalized_rows: result.manifest.normalized_rows,
        quarantine_rows: result.manifest.quarantine_rows,
        page_count: result.manifest.page_count,
        unique_cell_count: result.manifest.unique_cell_count,
        duration_ms: result.manifest.duration_ms,
        disk_size_bytes: result.manifest.disk_size_bytes,
        manifest: path
          .relative(process.cwd(), result.manifestPath)
          .replaceAll("\\", "/"),
        current_pointer_updated: result.currentPointerUpdated,
      },
      null,
      2,
    )}\n`,
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      process.stderr.write(`SEOUL_LIVING_INGESTION_FAILED: ${safeError(error)}\n`);
      process.exitCode = 1;
    })
    .finally(() => {
      if (originalLoader) require.extensions[".ts"] = originalLoader;
      else delete require.extensions[".ts"];
    });
}

module.exports = { parseCliOptions };
