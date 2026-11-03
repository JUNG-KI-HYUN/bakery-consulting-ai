from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

try:
    from PIL import Image
    from pypdf import PdfReader
except ImportError as error:
    raise SystemExit(
        "Existing runtime capability is required: pypdf and Pillow must already be installed. "
        "No package was installed by this extractor."
    ) from error


SOURCE_NAME = re.compile(r"^(P33-\d{3})_(.+)\.pdf$", re.IGNORECASE)
LOT_TOKEN = re.compile(r"^\d+(?:-\d+)?$")
LOCALITY_TOKEN = re.compile(r".+(?:동|리|읍|면)$")
JPEG_FILTER = "/DCTDecode"
EXPECTED_SHARED = frozenset({("P33-005", 4), ("P33-006", 2)})


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalized_key(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).lower()


def repository_address_key(address: str) -> str:
    tokens = address.split()
    for index, token in enumerate(tokens[:-1]):
        if LOCALITY_TOKEN.fullmatch(token) and LOT_TOKEN.fullmatch(tokens[index + 1]):
            return f"{token}{tokens[index + 1]}"
    raise ValueError(f"Repository address has no locality/lot pair: {address}")


def image_objects(page: Any) -> list[Any]:
    resources_ref = page.get("/Resources")
    if resources_ref is None:
        return []
    resources = resources_ref.get_object()
    xobjects_ref = resources.get("/XObject")
    if xobjects_ref is None:
        return []
    xobjects = xobjects_ref.get_object()
    return [ref.get_object() for ref in xobjects.values() if ref.get_object().get("/Subtype") == "/Image"]


def direct_jpeg_bytes(image_object: Any) -> bytes:
    filter_value = image_object.get("/Filter")
    filters = [str(item) for item in filter_value] if isinstance(filter_value, list) else [str(filter_value)]
    if filters != [JPEG_FILTER]:
        raise ValueError(f"Embedded image is not a direct JPEG stream: filters={filters}")
    encoded = bytes(image_object._data)
    if image_object.get_data() != encoded:
        raise ValueError("DCT stream decoding changed the embedded JPEG binary")
    if not encoded.startswith(b"\xff\xd8\xff"):
        raise ValueError("Embedded DCT stream does not have a JPEG signature")
    return encoded


def load_candidates(candidate_source: Path) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    package = json.loads(candidate_source.read_text(encoding="utf-8"))
    candidates = package.get("candidates")
    if not isinstance(candidates, list) or len(candidates) != 27:
        raise ValueError("Candidate source must contain exactly 27 candidates")
    by_code: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        code = candidate["identity"]["displayCode"]
        if code in by_code:
            raise ValueError(f"Duplicate repository Candidate ID: {code}")
        by_code[code] = candidate
    return by_code, candidates


def relative_path(path: Path, repo_root: Path) -> str:
    return path.resolve().relative_to(repo_root.resolve()).as_posix()


def extract(
    repo_root: Path,
    source_dir: Path,
    output_dir: Path,
    candidate_source: Path,
) -> dict[str, Any]:
    if output_dir.exists():
        raise FileExistsError(f"Output directory already exists: {output_dir}")
    if not source_dir.is_dir():
        raise FileNotFoundError(f"Source directory does not exist: {source_dir}")

    by_code, candidates = load_candidates(candidate_source)
    source_pdfs = sorted(source_dir.glob("*.pdf"), key=lambda path: path.name)
    seen_codes: set[str] = set()
    candidate_results: list[dict[str, Any]] = []
    photo_hashes: dict[str, list[dict[str, Any]]] = defaultdict(list)
    stage = Path(tempfile.mkdtemp(prefix=".pork33-candidate-photos-extracted-", dir=output_dir.parent))

    try:
        for source_pdf in source_pdfs:
            match = SOURCE_NAME.fullmatch(source_pdf.name)
            if not match:
                raise ValueError(f"Invalid source PDF filename: {source_pdf.name}")
            candidate_code, source_address = match.groups()
            candidate_code = candidate_code.upper()
            if candidate_code in seen_codes:
                raise ValueError(f"Duplicate source PDF Candidate ID: {candidate_code}")
            candidate = by_code.get(candidate_code)
            if candidate is None:
                raise ValueError(f"Source PDF Candidate does not exist in repository: {candidate_code}")
            seen_codes.add(candidate_code)

            normalized = candidate["normalized"]
            repository_address = normalized["addressFull"]
            address_match = normalized_key(source_address) in normalized_key(repository_address)
            output_address = source_address if address_match else repository_address_key(repository_address)
            candidate_dir = stage / candidate_code
            candidate_dir.mkdir()

            reader = PdfReader(source_pdf, strict=True)
            if reader.is_encrypted:
                raise ValueError(f"Encrypted source PDF is not supported: {source_pdf.name}")
            photos: list[dict[str, Any]] = []
            for page_number, page in enumerate(reader.pages, 1):
                objects = image_objects(page)
                if len(objects) != 1:
                    raise ValueError(
                        f"Each PDF page must contain exactly one embedded image: "
                        f"{source_pdf.name} page {page_number} has {len(objects)}"
                    )
                data = direct_jpeg_bytes(objects[0])
                with Image.open(BytesIO(data)) as image:
                    image.verify()
                with Image.open(BytesIO(data)) as image:
                    width, height = image.size
                    image_format = image.format
                if image_format != "JPEG":
                    raise ValueError(f"Extracted stream is not JPEG: {source_pdf.name} page {page_number}")
                sequence = page_number
                output_filename = f"{candidate_code}_{output_address}_{sequence:02d}.jpg"
                output_file = candidate_dir / output_filename
                output_file.write_bytes(data)
                photo = {
                    "sequence": sequence,
                    "sourcePageNumber": page_number,
                    "outputFilename": output_filename,
                    "outputPath": relative_path(output_dir / candidate_code / output_filename, repo_root),
                    "width": width,
                    "height": height,
                    "fileSizeBytes": len(data),
                    "mimeType": "image/jpeg",
                    "sha256": sha256(data),
                    "sharedPhotoStatus": "NONE",
                }
                photos.append(photo)
                photo_hashes[photo["sha256"]].append({
                    "candidateId": candidate_code,
                    "sourcePageNumber": page_number,
                    "photo": photo,
                })

            candidate_results.append({
                "candidateId": candidate_code,
                "candidateStoreId": candidate["identity"]["candidateStoreId"],
                "sourcePdf": relative_path(source_pdf, repo_root),
                "sourcePdfSha256": sha256(source_pdf.read_bytes()),
                "sourceAddress": source_address,
                "repositoryAddress": repository_address,
                "addressMatch": address_match,
                "sourceFilenameAddressMismatch": not address_match,
                "addressProvenance": normalized.get("addressProvenance"),
                "photoCount": len(photos),
                "photos": photos,
            })

        for entries in photo_hashes.values():
            candidate_ids = {entry["candidateId"] for entry in entries}
            if len(candidate_ids) < 2:
                continue
            references = frozenset((entry["candidateId"], entry["sourcePageNumber"]) for entry in entries)
            status = "EXPECTED_SHARED_PHOTO" if references == EXPECTED_SHARED else "CROSS_CANDIDATE_DUPLICATE_REVIEW_REQUIRED"
            for entry in entries:
                entry["photo"]["sharedPhotoStatus"] = status

        without_photos = [
            {
                "candidateId": candidate["identity"]["displayCode"],
                "candidateStoreId": candidate["identity"]["candidateStoreId"],
                "status": "NO_SOURCE_PHOTO",
            }
            for candidate in candidates
            if candidate["identity"]["displayCode"] not in seen_codes
        ]
        manifest = {
            "schemaVersion": "frameone.pork33-candidate-photo-extraction.v1",
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "extractionMethod": "DIRECT_PDF_DCT_STREAM",
            "recompressed": False,
            "sourcePdfCount": len(source_pdfs),
            "candidateWithPhotosCount": len(candidate_results),
            "candidateWithoutPhotos": without_photos,
            "totalPhotoCount": sum(item["photoCount"] for item in candidate_results),
            "candidates": candidate_results,
        }
        (stage / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        stage.replace(output_dir)
        return manifest
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Extract original PORK33 Candidate JPEG streams from source PDFs")
    parser.add_argument("--repo-root", type=Path, default=repo_root)
    parser.add_argument("--source-dir", type=Path, default=repo_root / "data" / "pork33-candidate-photos-source")
    parser.add_argument("--output-dir", type=Path, default=repo_root / "data" / "pork33-candidate-photos-extracted")
    parser.add_argument(
        "--candidate-source",
        type=Path,
        default=repo_root / "data" / "pork33-candidate-shortlist" / "pork33-field-source-2026-10.v1.json",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = extract(
        args.repo_root.resolve(),
        args.source_dir.resolve(),
        args.output_dir.resolve(),
        args.candidate_source.resolve(),
    )
    print(json.dumps({
        "sourcePdfCount": manifest["sourcePdfCount"],
        "candidateWithPhotosCount": manifest["candidateWithPhotosCount"],
        "candidateWithoutPhotos": [item["candidateId"] for item in manifest["candidateWithoutPhotos"]],
        "totalPhotoCount": manifest["totalPhotoCount"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
