#!/usr/bin/env python
"""Fast local HTML notice capture helper.

Usage examples from repo root:
  python tools/capture_notice.py gcrun/morepop.html --name "과천마라톤 추가접수 공지"
  python tools/capture_notice.py osanmarathon/nogo.html --name "오산마라톤 미개최 공지"
  python tools/capture_notice.py gcrun/notice.html --a4 --name "과천마라톤 오픈 공지"
  python tools/capture_notice.py gcrun/morepop.html --out gcrun/morepop_capture.png

Default output rule:
  captureimg/YYMMDD_주요내용.png
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

from PIL import Image

CHROME_CANDIDATES = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]

WINDOWS_FORBIDDEN = r'<>:"/\\|?*'


def find_browser() -> Path:
    for p in CHROME_CANDIDATES:
        if p.exists():
            return p
    raise SystemExit("Chrome/Edge executable not found.")


def file_url(path: Path) -> str:
    return path.resolve().as_uri()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def today_code() -> str:
    return datetime.now().strftime("%y%m%d")


def clean_filename_part(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    for ch in WINDOWS_FORBIDDEN:
        text = text.replace(ch, " ")
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text or "캡처"


def html_title(html: Path) -> str | None:
    try:
        text = html.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    match = re.search(r"<title[^>]*>(.*?)</title>", text, flags=re.I | re.S)
    if not match:
        return None
    title = re.sub(r"<[^>]+>", "", match.group(1))
    return clean_filename_part(title)


def default_label(html: Path) -> str:
    return html_title(html) or clean_filename_part(f"{html.parent.name} {html.stem}")


def default_out(html: Path, name: str | None = None) -> Path:
    label = clean_filename_part(name) if name else default_label(html)
    return repo_root() / "captureimg" / f"{today_code()}_{label}.png"


def background_color(img: Image.Image) -> tuple[int, int, int]:
    rgb = img.convert("RGB")
    w, h = rgb.size
    samples = [
        rgb.getpixel((0, 0)),
        rgb.getpixel((w - 1, 0)),
        rgb.getpixel((0, h - 1)),
        rgb.getpixel((w - 1, h - 1)),
    ]
    return max(set(samples), key=samples.count)


def crop_uniform_background(src: Path, dst: Path, tolerance: int = 5) -> tuple[int, int]:
    img = Image.open(src).convert("RGB")
    bg = background_color(img)
    pix = img.load()
    w, h = img.size
    br, bg_g, bb = bg

    ys: list[int] = []
    xs: list[int] = []
    for y in range(h):
        for x in range(w):
            r, g, b = pix[x, y]
            if abs(r - br) > tolerance or abs(g - bg_g) > tolerance or abs(b - bb) > tolerance:
                ys.append(y)
                break
    for x in range(w):
        for y in range(h):
            r, g, b = pix[x, y]
            if abs(r - br) > tolerance or abs(g - bg_g) > tolerance or abs(b - bb) > tolerance:
                xs.append(x)
                break

    if not xs or not ys:
        img.save(dst)
        return img.size

    cropped = img.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    cropped.save(dst)
    return cropped.size


def capture_one(browser: Path, html: Path, out: Path, width: int, height: int, crop: bool) -> None:
    html = html.resolve()
    out = out.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    tmp = Path(tempfile.gettempdir()) / f"hermes_capture_{os.getpid()}_{html.stem}.png" if crop else out
    cmd = [
        str(browser),
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        f"--window-size={width},{height}",
        f"--screenshot={tmp}",
        file_url(html),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    if crop:
        size = crop_uniform_background(tmp, out)
        try:
            tmp.unlink()
        except OSError:
            pass
    else:
        size = Image.open(out).size

    print(f"OK {html} -> {out} size={size} bytes={out.stat().st_size}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Fast screenshot capture for local HTML notice files.")
    parser.add_argument("html", nargs="+", type=Path, help="HTML file(s) to capture")
    parser.add_argument("--name", help="주요내용 filename label; valid only with one HTML file")
    parser.add_argument("--out", type=Path, help="Output PNG path; only valid with one HTML file")
    parser.add_argument("--width", type=int, default=900)
    parser.add_argument("--height", type=int, default=1131)
    parser.add_argument("--a4", action="store_true", help="Use exact A4 capture size 800x1131 and no auto-crop")
    parser.add_argument("--no-crop", action="store_true", help="Keep full browser viewport")
    args = parser.parse_args()

    if (args.out or args.name) and len(args.html) != 1:
        parser.error("--out/--name can only be used with one HTML file")

    width, height = (800, 1131) if args.a4 else (args.width, args.height)
    crop = not args.no_crop and not args.a4
    browser = find_browser()

    for html in args.html:
        if not html.exists():
            raise SystemExit(f"HTML not found: {html}")
        out = args.out if args.out else default_out(html, args.name)
        capture_one(browser, html, out, width, height, crop)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
