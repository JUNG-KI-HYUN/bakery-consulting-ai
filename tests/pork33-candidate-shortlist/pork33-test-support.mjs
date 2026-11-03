import fs from "node:fs";
import path from "node:path";

export const PRIVATE_INTEGRATION_SKIP_REASON =
  "SKIP: PORK33 private integration source not provisioned";

export function privateTestOptions(available, reason = PRIVATE_INTEGRATION_SKIP_REASON) {
  return available ? {} : { skip: reason };
}

export function loadLatestPork33RuntimeState(root) {
  const runtimeDir = path.join(root, "data/pork33-candidate-shortlist/runtime");
  if (!fs.existsSync(runtimeDir)) return null;
  const latest = fs.readdirSync(runtimeDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .at(-1);
  return latest
    ? JSON.parse(fs.readFileSync(path.join(runtimeDir, latest), "utf8"))
    : null;
}

export function resolvePork33TestState(root, seedResolution, stateModule) {
  if (process.env.PORK33_DATA_MODE === "SANITIZED_FIXTURE") {
    return stateModule.createPork33InitialState(undefined, seedResolution.seed);
  }
  return loadLatestPork33RuntimeState(root)
    ?? stateModule.createPork33InitialState(undefined, seedResolution.seed);
}

export function loadPrivatePork33AssetMetadata(root) {
  const mapRoot = path.join(root, "data/pork33-candidate-map-source");
  const photoManifestPath = path.join(root, "data/pork33-candidate-photos-extracted/manifest.json");
  if (!fs.existsSync(mapRoot) || !fs.existsSync(photoManifestPath)) return null;

  const mapFiles = fs.readdirSync(mapRoot).filter((name) => /^P33-\d{3}_.+\.png$/iu.test(name));
  const photoManifest = JSON.parse(fs.readFileSync(photoManifestPath, "utf8"));
  if (mapFiles.length !== 27 || photoManifest.candidates?.length !== 24) return null;

  return {
    mapsByCandidateId: Object.fromEntries(mapFiles.map((name) => {
      const candidateId = name.match(/^P33-\d{3}/u)?.[0];
      return [candidateId, { assetRef: `MAP:${candidateId}`, sourceFileName: name }];
    })),
    photosByCandidateId: Object.fromEntries(photoManifest.candidates.map((candidate) => [
      candidate.candidateId,
      candidate.photos.map((photo) => ({
        assetRef: `PHOTO:${candidate.candidateId}:${photo.sequence}`,
        sequence: photo.sequence,
        width: photo.width,
        height: photo.height,
      })),
    ])),
  };
}

export function createMetadataOnlyPork33Assets(state, options = {}) {
  const mapCount = options.mapCount ?? 0;
  const photoCount = options.photoCount ?? 0;
  return {
    mapsByCandidateId: Object.fromEntries(state.candidates.slice(0, mapCount).map((candidate) => {
      const candidateId = candidate.identity.displayCode;
      return [candidateId, {
        assetRef: `SANITIZED_FIXTURE_MAP_METADATA:${candidateId}`,
        sourceFileName: `SANITIZED_FIXTURE_${candidateId}.png`,
      }];
    })),
    photosByCandidateId: Object.fromEntries(state.candidates.slice(0, photoCount).map((candidate) => {
      const candidateId = candidate.identity.displayCode;
      return [candidateId, [{
        assetRef: `SANITIZED_FIXTURE_PHOTO_METADATA:${candidateId}:1`,
        sequence: 1,
        width: 1,
        height: 1,
      }]];
    })),
  };
}

export function createSanitizedSbizSnapshotMap(state, overrides = () => ({})) {
  return Object.fromEntries(state.candidates.map((candidate, index) => {
    const candidateId = candidate.identity.displayCode;
    return [candidateId, {
      schemaVersion: "frameone.pork33-sbiz365-candidate-snapshot.v1",
      candidateId,
      sourceFileName: `SANITIZED_FIXTURE_${candidateId}.pdf`,
      addressVerification: candidateId === "P33-022" ? "USER_CONFIRMED_OVERRIDE" : "REVIEW_REQUIRED",
      analysisRadiusMeters: 500,
      radiusSource: "USER_PROVIDED",
      analysisDate: null,
      peakFloatingTime: null,
      peakGenderAge: null,
      meatShopCount: null,
      householdCount: null,
      residentialPopulation: null,
      extractionStatus: "SANITIZED_FIXTURE",
      ...overrides(candidate, index),
    }];
  }));
}
