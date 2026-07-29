#!/usr/bin/env python3
"""Ad-hoc structural verification for marathon-info course-suite."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    "course-suite/viewer/index.html",
    "course-suite/viewer/viewer.css",
    "course-suite/viewer/viewer.js",
    "course-suite/shared/config.js",
    "course-suite/shared/gpx-utils.js",
    "course-suite/shared/course-model.js",
    "course-suite/shared/poi-icons.js",
    "course-suite/shared/map-adapters/kakao-map.js",
    "course-suite/shared/map-adapters/leaflet-map.js",
    "course-suite/docs/operations-guide.md",
]


def read(rel: str) -> str:
    path = ROOT / rel
    assert path.exists(), f"missing required file: {rel}"
    return path.read_text(encoding="utf-8")


def assert_contains(text: str, token: str, rel: str) -> None:
    assert token in text, f"{rel} missing token: {token}"


def test_course_suite_structure():
    for rel in REQUIRED_FILES:
        assert (ROOT / rel).exists(), f"missing required file: {rel}"


def test_viewer_is_event_agnostic_and_kakao_default():
    html = read("course-suite/viewer/index.html")
    js = read("course-suite/viewer/viewer.js")
    config = read("course-suite/shared/config.js")
    assert_contains(html, "course-suite", "viewer/index.html")
    assert_contains(js, "URLSearchParams", "viewer/viewer.js")
    assert_contains(js, "event=gcrun", "viewer/viewer.js")
    assert_contains(js, "switchMapApi(eventConfig.defaultMapApi || 'kakao')", "viewer/viewer.js")
    assert_contains(config, "gcrun", "shared/config.js")
    assert_contains(config, "../../gcrun/files/과천마라톤.gpx", "shared/config.js")
    assert_contains(config, "defaultMapApi: 'kakao'", "shared/config.js")


def test_shared_modules_export_expected_api():
    checks = {
        "course-suite/shared/gpx-utils.js": ["export function parseGpx", "export function getDistanceKm", "export function findPointAtDistance"],
        "course-suite/shared/course-model.js": ["export function buildCourseDisplay", "FINISH_BRANCH_DIST", "TURN_HALF_DIST"],
        "course-suite/shared/poi-icons.js": ["export const POI_TYPES", "water", "cone", "sign"],
        "course-suite/shared/map-adapters/kakao-map.js": ["export class KakaoMapAdapter", "drawCourse", "setCurrentLocation"],
        "course-suite/shared/map-adapters/leaflet-map.js": ["export class LeafletMapAdapter", "drawCourse", "setCurrentLocation"],
    }
    for rel, tokens in checks.items():
        text = read(rel)
        for token in tokens:
            assert_contains(text, token, rel)


def test_kakao_pois_are_separated_from_course_overlays():
    text = read("course-suite/shared/map-adapters/kakao-map.js")
    assert_contains(text, "this.courseOverlays", "kakao-map.js")
    assert_contains(text, "this.poiOverlays", "kakao-map.js")
    assert_contains(text, "clearPois()", "kakao-map.js")


def test_no_secret_tokens_in_course_suite():
    secret_patterns = ["github" + "_pat_", "g" + "hp_"]
    for path in (ROOT / "course-suite").rglob("*"):
        if path.is_file():
            text = path.read_text(encoding="utf-8", errors="ignore")
            assert not any(pattern in text for pattern in secret_patterns), f"secret-like token found in {path}"


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"PASS {name}")
    print("course-suite verification passed")
