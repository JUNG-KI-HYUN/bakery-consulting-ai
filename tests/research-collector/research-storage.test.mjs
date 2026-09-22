import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  RESEARCH_STORAGE_KEY,
  StorageApiUnavailableError,
  getChromeStorageLocal,
  loadCollectorState,
  removeCollectorState,
  saveCollectorState,
  updateCollectorState,
} from "../../tools/frameone-research-collector/src/research-storage.js";

function fakeStorageArea() {
  const values = new Map();
  return {
    async get(key) {
      return values.has(key) ? { [key]: structuredClone(values.get(key)) } : {};
    },
    async set(entries) {
      for (const [key, value] of Object.entries(entries)) values.set(key, structuredClone(value));
    },
    async remove(key) {
      values.delete(key);
    },
    values,
  };
}

test("popup 종료 후 재오픈을 가정해 local queue와 검수·중복·서버 상태를 복원한다", async () => {
  const storage = fakeStorageArea();
  const state = {
    queueEntries: [{
      record: {
        recordId: "fixture-storage-1",
        quality: { verificationStatus: "CONFIRMED", duplicateStatus: "POSSIBLE_DUPLICATE" },
      },
      collection: { fields: { address: { value: "fixture" } } },
      repository: { status: "SAVED", repositoryRecordId: "fixture-storage-1" },
    }],
    activeRecordId: "fixture-storage-1",
    duplicateDecisions: [["fixture-storage-1|fixture-storage-2", "SAME_LISTING"]],
  };

  await saveCollectorState(storage, state);
  const reopened = await loadCollectorState(storage);

  assert.equal(storage.values.has(RESEARCH_STORAGE_KEY), true);
  assert.equal(reopened.queueEntries[0].record.quality.verificationStatus, "CONFIRMED");
  assert.equal(reopened.queueEntries[0].record.quality.duplicateStatus, "POSSIBLE_DUPLICATE");
  assert.equal(reopened.queueEntries[0].repository.status, "SAVED");
  assert.deepEqual(reopened.duplicateDecisions, state.duplicateDecisions);
  assert.equal(reopened.activeRecordId, "fixture-storage-1");
});

test("알 수 없는 storage schema는 실제 자료로 가장하지 않고 빈 조사함으로 닫힌다", async () => {
  const storage = fakeStorageArea();
  storage.values.set(RESEARCH_STORAGE_KEY, { schemaVersion: "unknown", queueEntries: [{ record: { recordId: "unsafe" } }] });
  const reopened = await loadCollectorState(storage);
  assert.deepEqual(reopened.queueEntries, []);
  assert.equal(reopened.activeRecordId, null);
});

test("Chrome storage API available/unavailable을 raw TypeError 없이 구분한다", () => {
  const storage = fakeStorageArea();
  assert.equal(getChromeStorageLocal({ storage: { local: storage } }), storage);
  assert.throws(
    () => getChromeStorageLocal({}),
    (error) => error instanceof StorageApiUnavailableError && error.code === "STORAGE_API_UNAVAILABLE",
  );
  assert.throws(() => getChromeStorageLocal(undefined), /STORAGE_API_UNAVAILABLE/);
});

test("실제 MV3 manifest가 storage 권한과 popup module을 유지한다", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../../tools/frameone-research-collector/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.3.2");
  assert.ok(manifest.permissions.includes("storage"));
  assert.equal(manifest.action.default_popup, "popup.html");
  const popup = fs.readFileSync(new URL("../../tools/frameone-research-collector/popup.js", import.meta.url), "utf8");
  assert.doesNotMatch(popup, /chrome\.storage\.local/);
  assert.match(popup, /getChromeStorageLocal\(\)/);
  assert.match(popup, /로컬 조사함 저장 실패/);
  assert.match(popup, /quality\.verificationStatus !== VERIFICATION_STATUS\.CONFIRMED \|\| isSaved/);
});

test("storage update와 remove는 현재 queue를 갱신하고 명시적으로 제거한다", async () => {
  const storage = fakeStorageArea();
  await saveCollectorState(storage, { queueEntries: [], activeRecordId: null, duplicateDecisions: [] });
  await updateCollectorState(storage, (current) => ({
    ...current,
    activeRecordId: "fixture-updated",
  }));
  assert.equal((await loadCollectorState(storage)).activeRecordId, "fixture-updated");
  await removeCollectorState(storage);
  assert.deepEqual((await loadCollectorState(storage)).queueEntries, []);
  assert.equal(storage.values.has(RESEARCH_STORAGE_KEY), false);
});
