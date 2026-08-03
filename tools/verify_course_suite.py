#!/usr/bin/env python3
"""Ad-hoc structural verification for marathon-info course-suite."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    "course-suite/viewer/index.html",
    "course-suite/viewer/viewer.css",
    "course-suite/viewer/viewer.js",
    "course-suite/maker/index.html",
    "course-suite/maker/maker.css",
    "course-suite/maker/maker.js",
    "course-suite/shared/config.js",
    "course-suite/shared/gpx-utils.js",
    "course-suite/shared/course-model.js",
    "course-suite/shared/poi-icons.js",
    "course-suite/shared/poi-schema.js",
    "course-suite/shared/map-adapters/kakao-map.js",
    "course-suite/shared/map-adapters/leaflet-map.js",
    "course-suite/docs/operations-guide.md",
    "course-suite/docs/firebase-setup-guide.md",
    "course-suite/docs/firebase-rules.md",
    "course-suite/shared/firebase-config.example.js",
    "course-suite/shared/firebase-config.public.js",
    "course-suite/shared/firebase.js",
    "course-suite/shared/course-repository.js",
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
        "course-suite/shared/poi-schema.js": ["export const POI_VISIBILITY", "export const POI_STATUS", "export function normalizePoi", "export function groupPoisByType", "export function sortPoisForFieldWork"],
        "course-suite/shared/map-adapters/kakao-map.js": ["export class KakaoMapAdapter", "drawCourse", "setCurrentLocation"],
        "course-suite/shared/map-adapters/leaflet-map.js": ["export class LeafletMapAdapter", "drawCourse", "setCurrentLocation"],
    }
    for rel, tokens in checks.items():
        text = read(rel)
        for token in tokens:
            assert_contains(text, token, rel)


def test_viewer_has_maintainable_poi_filters_and_field_cards():
    html = read("course-suite/viewer/index.html")
    js = read("course-suite/viewer/viewer.js")
    css = read("course-suite/viewer/viewer.css")
    assert_contains(html, "poiFilters", "viewer/index.html")
    assert_contains(html, "poiList", "viewer/index.html")
    assert_contains(js, "renderPoiFilters", "viewer/viewer.js")
    assert_contains(js, "sortPoisForFieldWork", "viewer/viewer.js")
    assert_contains(js, "renderPoiList", "viewer/viewer.js")
    assert_contains(css, ".poi-list", "viewer/viewer.css")
    assert_contains(css, ".poi-card", "viewer/viewer.css")


def test_firebase_setup_docs_and_safe_config_template():
    guide = read("course-suite/docs/firebase-setup-guide.md")
    rules = read("course-suite/docs/firebase-rules.md")
    config = read("course-suite/shared/firebase-config.example.js")
    public_config = read("course-suite/shared/firebase-config.public.js")
    firebase = read("course-suite/shared/firebase.js")
    repository = read("course-suite/shared/course-repository.js")
    viewer = read("course-suite/viewer/viewer.js")
    for token in ["Firestore", "Cloud Storage", "Authentication", "courseMaps", "gpxVersions", "Firestore-first"]:
        assert_contains(guide, token, "firebase-setup-guide.md")
    for token in ["allow read", "allow write", "isAdmin", "gpxXml", "pois", "a66452411@gmail.com"]:
        assert_contains(rules, token, "firebase-rules.md")
    assert_contains(config, "firebaseConfig", "firebase-config.example.js")
    assert_contains(config, "TODO_REPLACE", "firebase-config.example.js")
    assert_contains(public_config, "marathon-info-course-suite", "firebase-config.public.js")
    assert_contains(public_config, "a66452411@gmail.com", "firebase-config.public.js")
    assert_contains(public_config, "storageMode: 'firestore'", "firebase-config.public.js")
    assert_contains(firebase, "initializeApp", "firebase.js")
    assert_contains(firebase, "getFirestore", "firebase.js")
    assert_contains(repository, "loadFirebaseCourseBundle", "course-repository.js")
    assert_contains(repository, "saveGpxVersionFromXml", "course-repository.js")
    assert_contains(repository, "gpxXml", "course-repository.js")
    assert_contains(repository, "fallback", "course-repository.js")
    assert_contains(viewer, "loadFirebaseCourseBundle", "viewer.js")
    assert_contains(viewer, "applyCourseBundle", "viewer.js")
    assert "github" + "_pat_" not in config
    assert "gh" + "p_" not in config


def test_course_maker_uploads_gpx_to_firestore():
    html = read("course-suite/maker/index.html")
    js = read("course-suite/maker/maker.js")
    css = read("course-suite/maker/maker.css")
    assert_contains(html, "gpxFileInput", "maker/index.html")
    assert_contains(html, "loginButton", "maker/index.html")
    assert_contains(js, "signInWithGoogle", "maker/maker.js")
    assert_contains(js, "saveGpxVersionFromXml", "maker/maker.js")
    assert_contains(js, "parseGpx", "maker/maker.js")
    assert_contains(js, "summarizeTrack", "maker/maker.js")
    assert_contains(js, "FileReader", "maker/maker.js")
    assert_contains(css, ".maker-shell", "maker/maker.css")


def test_course_maker_edits_pois_and_downloads_map_image():
    html = read("course-suite/maker/index.html")
    js = read("course-suite/maker/maker.js")
    css = read("course-suite/maker/maker.css")
    repository = read("course-suite/shared/course-repository.js")
    for token in ["makerMap", "poiForm", "poiTypeInput", "downloadMapImageButton", "html2canvas"]:
        assert_contains(html, token, "maker/index.html")
    for token in ["initPoiEditorMap", "handleMapClick", "savePoi", "deletePoi", "downloadMapImage", "html2canvas"]:
        assert_contains(js, token, "maker/maker.js")
    for token in ["savePoi", "deletePoi", "loadCoursePois"]:
        assert_contains(repository, token, "course-repository.js")
    assert_contains(css, ".maker-map", "maker/maker.css")
    assert_contains(css, ".poi-editor-grid", "maker/maker.css")


def test_course_maker_has_file_browser_for_gpx_versions():
    html = read("course-suite/maker/index.html")
    js = read("course-suite/maker/maker.js")
    css = read("course-suite/maker/maker.css")
    repository = read("course-suite/shared/course-repository.js")
    for token in ["fileExplorerPanel", "gpxVersionTree", "refreshGpxListButton", "activeGpxSummary"]:
        assert_contains(html, token, "maker/index.html")
    for token in ["loadGpxVersions", "loadGpxVersion", "deleteGpxVersion", "setActiveGpxVersion"]:
        assert_contains(repository, token, "course-repository.js")
    for token in ["refreshGpxVersionBrowser", "renderGpxVersionTree", "handleGpxVersionLoad", "handleGpxVersionDelete", "handleGpxVersionActivate"]:
        assert_contains(js, token, "maker/maker.js")
    assert_contains(css, ".maker-workbench", "maker/maker.css")
    assert_contains(css, ".file-explorer-panel", "maker/maker.css")


def test_course_maker_uses_kakao_primary_and_leaflet_optional():
    html = read("course-suite/maker/index.html")
    js = read("course-suite/maker/maker.js")
    css = read("course-suite/maker/maker.css")
    for token in ["mapApiKakaoButton", "mapApiLeafletButton", "kakaoMakerMap", "leafletMakerMap", "layerControlPanel"]:
        assert_contains(html, token, "maker/index.html")
    for token in ["kakao.maps.Map", "activeMapApi = 'kakao'", "switchMapApi", "setKakaoBaseMapType", "toggleKakaoOverlay", "TRAFFIC", "BICYCLE", "TERRAIN"]:
        assert_contains(js, token, "maker/maker.js")
    assert "data-kakao-map-type=\"skyview\"" not in html
    assert_contains(css, ".layer-control-panel", "maker/maker.css")
    assert_contains(css, ".maker-map-pane.active", "maker/maker.css")


def test_maker_draws_gpx_course_after_file_load():
    js = read("course-suite/maker/maker.js")
    for token in ["selectedTrackPoints", "renderGpxCourse", "kakaoCoursePolyline", "leafletCoursePolyline", "fitGpxBounds"]:
        assert_contains(js, token, "maker/maker.js")


def test_kakao_pois_are_separated_from_course_overlays():
    text = read("course-suite/shared/map-adapters/kakao-map.js")
    assert_contains(text, "this.courseOverlays", "kakao-map.js")
    assert_contains(text, "this.poiOverlays", "kakao-map.js")
    assert_contains(text, "clearPois()", "kakao-map.js")
    assert_contains(text, "kakao.maps.CustomOverlay", "kakao-map.js")
    assert_contains(text, "getPoiType", "kakao-map.js")


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
