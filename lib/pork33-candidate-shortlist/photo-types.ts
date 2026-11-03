import type { CandidatePhotoCategory } from "../candidate-photo/category";
import type { CandidatePhotoMetadataV1, CandidatePhotoProfileV1 } from "../candidate-photo/types";

export const PORK33_CANDIDATE_PHOTO_STATE_SCHEMA_VERSION =
  "frameone.pork33-candidate-photo-state.v1" as const;

export interface Pork33CandidatePhotoStateV1 {
  readonly schemaVersion: typeof PORK33_CANDIDATE_PHOTO_STATE_SCHEMA_VERSION;
  readonly snapshotId: string;
  readonly parentSnapshotId: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly profiles: readonly CandidatePhotoProfileV1[];
  readonly photos: readonly CandidatePhotoMetadataV1[];
}

export type Pork33CandidatePhotoCommand =
  | {
      readonly type: "REGISTER_PHOTO";
      readonly actor: string;
      readonly candidateStoreId: string;
      readonly assetRef: string;
    }
  | {
      readonly type: "UPDATE_PHOTO";
      readonly actor: string;
      readonly candidateStoreId: string;
      readonly photoId: string;
      readonly patch: {
        readonly category?: CandidatePhotoCategory;
        readonly fieldMemoRaw?: string | null;
        readonly includeInBriefing?: boolean | null;
        readonly includeInReport?: boolean | null;
      };
    }
  | {
      readonly type: "SET_PRIMARY";
      readonly actor: string;
      readonly candidateStoreId: string;
      readonly photoId: string | null;
    }
  | {
      readonly type: "MOVE_PHOTO";
      readonly actor: string;
      readonly candidateStoreId: string;
      readonly photoId: string;
      readonly direction: "UP" | "DOWN";
    }
  | {
      readonly type: "TOMBSTONE_PHOTO";
      readonly actor: string;
      readonly candidateStoreId: string;
      readonly photoId: string;
    };
