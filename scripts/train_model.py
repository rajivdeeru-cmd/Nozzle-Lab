import json
import math
from pathlib import Path

import cv2
import numpy as np
from sklearn.neighbors import KNeighborsRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import LeaveOneOut, cross_val_predict
from sklearn.metrics import mean_absolute_error, mean_squared_error

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "public" / "training-manifest.json"
OUTPUT_PATH = ROOT / "public" / "trained-model.json"
BACK_PRESSURE_BAR = 1.01325


def bucket(pressure: float) -> int:
    return max(2, min(10, math.floor(pressure + 0.5)))


def extract_features(path: Path):
    # cv2.imread can fail on Windows paths containing non-ASCII filenames.
    image_bytes = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(image_bytes, cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError(f"Unable to read {path}")
    image = cv2.resize(image, (640, 256), interpolation=cv2.INTER_AREA)
    denoised = cv2.bilateralFilter(image, 7, 45, 45)
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(denoised)
    edges = cv2.Canny(enhanced, 0, 0, apertureSize=3, L2gradient=True)
    edge_density = float(np.count_nonzero(edges)) / edges.size
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=35,
                            minLineLength=30, maxLineGap=12)
    angles = []
    if lines is not None:
        for x1, y1, x2, y2 in lines.reshape(-1, 4):
            length = math.hypot(x2 - x1, y2 - y1)
            if length >= 30:
                angle = abs(math.degrees(math.atan2(y2 - y1, x2 - x1)))
                angle = min(angle, 180 - angle)
                if 8 <= angle <= 82:
                    angles.append((angle, length))
    shock_angle = float(np.average([a for a, _ in angles], weights=[w for _, w in angles])) if angles else 45.0
    row_profile = edges.mean(axis=0)
    smooth = cv2.GaussianBlur(row_profile.reshape(1, -1), (1, 0), 0).ravel()
    peaks = int(np.count_nonzero((smooth[1:-1] > smooth[:-2]) & (smooth[1:-1] >= smooth[2:]) & (smooth[1:-1] > smooth.mean() * 1.15)))
    vertical_gradient = float(np.mean(np.abs(np.diff(enhanced.astype(np.float32), axis=0)))) / 255
    jet_width_ratio = float(np.percentile(np.count_nonzero(edges, axis=1), 75)) / edges.shape[1]
    mach_disk = bool(vertical_gradient > 0.075 and edge_density > 0.012)
    return [edge_density, shock_angle / 90, min(peaks, 20) / 20, jet_width_ratio, vertical_gradient, float(mach_disk)]


def mach_from_pressure(pressure_bar: float) -> float:
    npr = max(1.01, pressure_bar / BACK_PRESSURE_BAR)
    return math.sqrt((2 / 0.4) * (npr ** (0.4 / 1.4) - 1))


def main():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8-sig"))
    records = []
    for item in manifest:
        relative = item["file"].replace("/", "\\")
        path = ROOT / "public" / relative
        if not path.exists():
            continue
        pressure = float(item["pressureBar"])
        records.append({
            "source": item["filename"],
            "file": item["file"],
            "pressureBar": bucket(pressure),
            "sourcePressureBar": pressure,
            "mach": mach_from_pressure(bucket(pressure)),
            "features": extract_features(path),
        })
    if len(records) < 3:
        raise RuntimeError("At least three readable training images are required.")
    x = np.array([record["features"] for record in records], dtype=np.float32)
    y = np.array([record["mach"] for record in records], dtype=np.float32)
    model = Pipeline([
        ("scale", StandardScaler()),
        ("knn", KNeighborsRegressor(n_neighbors=min(3, len(records)), weights="distance")),
    ])
    model.fit(x, y)
    predictions = cross_val_predict(model, x, y, cv=LeaveOneOut())
    mae = float(mean_absolute_error(y, predictions))
    rmse = float(math.sqrt(mean_squared_error(y, predictions)))
    output = {
        "modelType": "pixel-feature-knn",
        "version": 1,
        "trainedAt": "2026-10-17",
        "featureNames": ["edgeDensity", "shockAngleNorm", "cellPeakCountNorm", "jetWidthRatio", "verticalGradient", "machDiskFlag"],
        "records": records,
        "validation": {
            "strategy": "leave-one-image-out",
            "pixelTrainedRecords": len(records),
            "metadataOnlyRecords": len(manifest) - len(records),
            "maeMach": mae,
            "rmseMach": rmse,
            "warning": "Small prototype dataset; validation is descriptive, not publication-grade."
        }
    }
    OUTPUT_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output["validation"], indent=2))


if __name__ == "__main__":
    main()
