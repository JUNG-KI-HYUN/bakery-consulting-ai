import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const EXTRACTION_SCRIPT = `
import io
import sys
import pdfplumber

data = sys.stdin.buffer.read()
with pdfplumber.open(io.BytesIO(data)) as pdf:
    sys.stdout.write("\\f".join((page.extract_text(layout=True) or "") for page in pdf.pages))
`;

function pythonRuntime() {
  const configured = process.env.PDF_TEXT_PYTHON?.trim();
  if (configured) return { command: configured, pythonPath: process.env.PDF_TEXT_PYTHONPATH?.trim() };

  const userProfile = process.env.USERPROFILE?.trim();
  if (userProfile) {
    const dependencyRoot = path.join(
      userProfile,
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
    );
    const command = path.join(dependencyRoot, "python", "python.exe");
    if (existsSync(command)) {
      return { command, pythonPath: path.join(dependencyRoot, "python") };
    }
  }

  return { command: "python", pythonPath: process.env.PYTHONPATH };
}
export async function extractPdfPageText(buffer: Buffer) {
  const runtime = pythonRuntime();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(runtime.command, ["-c", EXTRACTION_SCRIPT], {
      env: {
        ...process.env,
        ...(runtime.pythonPath ? { PYTHONPATH: runtime.pythonPath } : {}),
        PYTHONIOENCODING: "utf-8",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("PDF_TEXT_EXTRACTION_TIMEOUT"));
    }, 30_000);

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 32 * 1024 * 1024) {
        child.kill();
        reject(new Error("PDF_TEXT_OUTPUT_TOO_LARGE"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("PDF_TEXT_EXTRACTOR_UNAVAILABLE"));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`PDF_TEXT_EXTRACTION_FAILED:${Buffer.concat(stderr).toString("utf8").trim() || "UNKNOWN"}`));
        return;
      }
      const text = Buffer.concat(stdout).toString("utf8");
      if (!text.replace(/\s/g, "")) {
        reject(new Error("PDF_TEXT_LAYER_EMPTY"));
        return;
      }
      resolve(text);
    });
    child.stdin.end(buffer);
  });
}
