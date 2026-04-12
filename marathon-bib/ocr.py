import cv2
import easyocr
import os
import numpy as np
from Levenshtein import distance as levenshtein_distance

# -----------------------------
# 0) 한글 경로 대응 imread
# -----------------------------
def imread_unicode(path):
    with open(path, "rb") as f:
        data = f.read()
    img_array = np.frombuffer(data, np.uint8)
    return cv2.imdecode(img_array, cv2.IMREAD_COLOR)

# -----------------------------
# 1) 배번호 유효 범위 설정 (여기만 수정하면 됨)
# -----------------------------
bib_ranges = [
    (1, 5000),
    # (10000, 60000)
]

# 자동으로 등록번호 생성
registered_numbers = []
for low, high in bib_ranges:
    registered_numbers.extend([str(i) for i in range(low, high + 1)])

print(f"[INFO] 등록번호 {len(registered_numbers)}개 자동 생성됨")

# -----------------------------
# 2) 범위 체크 함수
# -----------------------------
def is_valid_bib(num_str):
    if not num_str.isdigit():
        return False
    num = int(num_str)
    for low, high in bib_ranges:
        if low <= num <= high:
            return True
    return False

# -----------------------------
# 3) OCR 후보 파일 불러오기 (선택)
# -----------------------------
def load_ocr_candidate_file(path="ocr_candidates.txt"):
    if not os.path.exists(path):
        print("[INFO] OCR 후보 파일 없음 → OCR 결과에서 후보 추출")
        return None

    candidates = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.isdigit() and is_valid_bib(line):
                candidates.append(line)

    if candidates:
        print(f"[INFO] OCR 후보 파일에서 {len(candidates)}개 로드됨")
        return candidates
    else:
        print("[INFO] OCR 후보 파일이 비어 있음 → OCR 결과 사용")
        return None

external_ocr_candidates = load_ocr_candidate_file()

# -----------------------------
# 4) 보정 알고리즘
# -----------------------------
def score_candidate(ocr_text, candidate):
    score = levenshtein_distance(ocr_text, candidate) * 10
    for o, c in zip(ocr_text, candidate):
        if o == c:
            score -= 3
        else:
            score += 1
    return score

def find_best_match(ocr_text, candidates):
    best = None
    best_score = 9999
    for c in candidates:
        s = score_candidate(ocr_text, c)
        if s < best_score:
            best_score = s
            best = c
    return best

# -----------------------------
# 5) OCR 엔진 준비
# -----------------------------
reader = easyocr.Reader(['en'])

# -----------------------------
# 6) crop 이미지 저장 폴더 생성
# -----------------------------
crop_output_dir = "crop_output"
os.makedirs(crop_output_dir, exist_ok=True)

# -----------------------------
# 7) bib 폴더 + 모든 하위 폴더 순회
# -----------------------------
bib_root = "bib"
crop_index = 0

for root, dirs, files in os.walk(bib_root):
    for filename in files:
        if not filename.lower().endswith((".jpg", ".jpeg", ".png")):
            continue

        image_path = os.path.join(root, filename)
        image = imread_unicode(image_path)

        if image is None:
            print(f"[ERROR] 이미지 로드 실패: {image_path}")
            continue

        print(f"\n=== 파일 처리: {image_path} ===")

        # -----------------------------
        # 8) 이미지 리사이즈
        # -----------------------------
        h, w = image.shape[:2]
        max_dim = max(h, w)
        if max_dim > 1200:
            scale = 1200 / max_dim
            image = cv2.resize(image, (int(w * scale), int(h * scale)))

        # -----------------------------
        # 9) 중앙부 crop
        # -----------------------------
        h, w = image.shape[:2]
        crop = image[int(h*0.25):int(h*0.85), int(w*0.15):int(w*0.85)]

        # -----------------------------
        # 10) OCR 실행
        # -----------------------------
        results = reader.readtext(crop)

        # -----------------------------
        # 11) OCR 후보 결정
        # -----------------------------
        if external_ocr_candidates:
            ocr_candidates = external_ocr_candidates
            print("OCR 후보(파일):", ocr_candidates)
        else:
            ocr_candidates = []
            for bbox, text, conf in results:
                cleaned = "".join([c for c in text if c.isdigit()])
                if len(cleaned) >= 3 and is_valid_bib(cleaned):
                    ocr_candidates.append(cleaned)

            print("OCR 후보(자동 추출):", ocr_candidates)

        # -----------------------------
        # 12) 최종 번호 보정
        # -----------------------------
        best_overall = None
        best_score = 9999

        for ocr_text in ocr_candidates:
            match = find_best_match(ocr_text, registered_numbers)

            if match is None:
                continue

            score = score_candidate(ocr_text, match)

            if score < best_score:
                best_score = score
                best_overall = match

        # -----------------------------
        # 13) crop 파일 저장 (파일명 = 인식된 번호)
        # -----------------------------
        if best_overall:
            crop_filename = f"{best_overall}_{crop_index:05d}.jpg"
        else:
            crop_filename = f"unknown_{crop_index:05d}.jpg"

        crop_path = os.path.join(crop_output_dir, crop_filename)
        cv2.imwrite(crop_path, crop)
        crop_index += 1

        print("최종 보정된 번호:", best_overall)
        print("저장된 crop 파일:", crop_filename)
