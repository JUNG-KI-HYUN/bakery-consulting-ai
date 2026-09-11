/* eslint-disable @typescript-eslint/no-require-imports -- Node CLI reuses the Repository's TypeScript publication gate. */
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
  evaluateSeoulLivingPublication,
  publishSeoulLivingCurrent,
} = require("../../../../lib/market-data/ingestion/seoul-living-publication.ts");

function readArgument(name, argv = process.argv) {
  const prefix = `${name}=`;
  const inline = argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function parseCliOptions(argv = process.argv) {
  const manifest = readArgument("--manifest", argv);
  if (!manifest) throw new Error("--manifest <path> is required");
  return {
    publish: argv.includes("--publish"),
    manifest,
    reconciliation:
      readArgument("--reconciliation", argv) ??
      path.join(__dirname, "../12_VALIDATION/LIVING_GRID_RECONCILIATION_V1.json"),
    verification:
      readArgument("--verification", argv) ??
      path.join(__dirname, "../12_VALIDATION/OFFICIAL_LIVING_GRID_SOURCE_VERIFICATION_V1.json"),
  };
}

async function main() {
  const cli = parseCliOptions();
  const repositoryRoot = path.resolve(__dirname, "../../../..");
  const options = {
    repositoryRoot,
    ingestRoot: __dirname,
    manifestPath: path.resolve(cli.manifest),
    reconciliationPath: path.resolve(cli.reconciliation),
    officialGeometryVerificationPath: path.resolve(cli.verification),
  };
  const result = cli.publish
    ? await publishSeoulLivingCurrent(options)
    : await evaluateSeoulLivingPublication(options);
  process.stdout.write(
    `${JSON.stringify(
      {
        decision: result.artifact.decision,
        source_id: result.artifact.source_id,
        snapshot_id: result.artifact.snapshot_id,
        reference_ymd: result.artifact.reference_ymd,
        failed_gates: result.artifact.gate_checks
          .filter((gate) => !gate.passed)
          .map((gate) => gate.id),
        published: cli.publish && result.artifact.decision === "ELIGIBLE",
        current: path.relative(process.cwd(), result.currentPath).replaceAll("\\", "/"),
        publication_decision: path
          .relative(process.cwd(), result.decisionPath)
          .replaceAll("\\", "/"),
      },
      null,
      2,
    )}\n`,
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      process.stderr.write(
        `SEOUL_LIVING_PUBLICATION_FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    })
    .finally(() => {
      if (originalLoader) require.extensions[".ts"] = originalLoader;
      else delete require.extensions[".ts"];
    });
}

module.exports = { parseCliOptions };
