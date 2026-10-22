export type TrainingManifestRecord = {
  file: string;
  filename: string;
  sourceGroup: string;
  pressureBar: number | null;
  areaRatio: number | null;
  split: string;
};

export type SeedReference = {
  npr: number;
  mach: number;
  features: [number, number, number];
  source: string;
  pressureBar: number;
  sourcePressureBar: number;
  areaRatio: number | null;
};

export type PressureTrainingSummary = {
  pressureBar: number;
  sampleCount: number;
  sourceGroups: string[];
  meanMach: number;
  sourcePressureMin: number;
  sourcePressureMax: number;
};

export type TrainingFeatureScale = {
  shockAngleDeg: number;
  cellCount: number;
  jetWidthRatio: number;
};

export const TRAINING_PRESSURE_BARS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type TrainingPressureBar = (typeof TRAINING_PRESSURE_BARS)[number];

export function nearestTrainingPressureBar(pressureBar: number): TrainingPressureBar {
  const rounded = Math.round(pressureBar);
  return Math.max(2, Math.min(10, rounded)) as TrainingPressureBar;
}

export type PressureTrainingModel = {
  references: SeedReference[];
  pressureSummaries: PressureTrainingSummary[];
  featureScale: TrainingFeatureScale;
  method: "metadata-seeded-normalized-knn";
  totalSamples: number;
  pressureCount: number;
};

export function buildTrainingModel(records: readonly TrainingManifestRecord[], backPressureBar = 1.01325): PressureTrainingModel {
  const references = records
    .filter((record) => record.pressureBar && record.pressureBar > 0)
    .map((record) => {
      const sourcePressureBar = record.pressureBar as number;
      const pressureBar = nearestTrainingPressureBar(sourcePressureBar);
      const npr = Math.max(1.01, pressureBar / backPressureBar);
      const mach = Math.sqrt((2 / 0.4) * (npr ** (0.4 / 1.4) - 1));
      const areaRatio = record.areaRatio ?? 1;
      const shockAngle = Math.asin(1 / Math.max(1.001, mach)) * 180 / Math.PI;
      return {
        npr,
        mach,
        pressureBar,
        sourcePressureBar,
        areaRatio: record.areaRatio,
        features: [shockAngle, Math.max(1, Math.round(areaRatio * 2)), Math.min(1, areaRatio / 7)] as [number, number, number],
        source: record.filename
      };
    });
  const featureScale: TrainingFeatureScale = {
    shockAngleDeg: 45,
    cellCount: 10,
    jetWidthRatio: 0.5
  };
  const grouped = new Map<number, { count: number; sources: Set<string>; mach: number[]; sourcePressures: number[] }>();
  references.forEach((reference) => {
    const current = grouped.get(reference.pressureBar) ?? { count: 0, sources: new Set<string>(), mach: [], sourcePressures: [] };
    current.count += 1;
    current.sources.add(reference.source);
    current.mach.push(reference.mach);
    current.sourcePressures.push(reference.sourcePressureBar);
    grouped.set(reference.pressureBar, current);
  });
  const pressureSummaries = TRAINING_PRESSURE_BARS.map((pressureBar) => {
    const value = grouped.get(pressureBar);
    const mach = value?.mach ?? [];
    const sourcePressures = value?.sourcePressures ?? [];
    return {
      pressureBar,
      sampleCount: value?.count ?? 0,
      sourceGroups: value ? [...value.sources] : [],
      meanMach: mach.length ? mach.reduce((sum, current) => sum + current, 0) / mach.length : 0,
      sourcePressureMin: sourcePressures.length ? Math.min(...sourcePressures) : 0,
      sourcePressureMax: sourcePressures.length ? Math.max(...sourcePressures) : 0
    };
  });
  return {
    references,
    pressureSummaries,
    featureScale,
    method: "metadata-seeded-normalized-knn",
    totalSamples: references.length,
    pressureCount: pressureSummaries.length
  };
}

export function buildSeedReferences(records: readonly TrainingManifestRecord[], backPressureBar = 1.01325): SeedReference[] {
  return buildTrainingModel(records, backPressureBar).references;
}

export function summarizeReferences(references: readonly Pick<SeedReference, "pressureBar" | "source" | "mach" | "sourcePressureBar">[]): PressureTrainingSummary[] {
  const grouped = new Map<number, { count: number; sources: Set<string>; mach: number[]; sourcePressures: number[] }>();
  references.forEach((reference) => {
    const current = grouped.get(reference.pressureBar) ?? { count: 0, sources: new Set<string>(), mach: [], sourcePressures: [] };
    current.count += 1; current.mach.push(reference.mach); current.sourcePressures.push(reference.sourcePressureBar);
    current.sources.add(reference.source);
    grouped.set(reference.pressureBar, current);
  });
  return TRAINING_PRESSURE_BARS.map((pressureBar) => {
    const value = grouped.get(pressureBar);
    const mach = value?.mach ?? [];
    const sourcePressures = value?.sourcePressures ?? [];
    return {
      pressureBar,
      sampleCount: value?.count ?? 0,
      sourceGroups: value ? [...value.sources] : [],
      meanMach: mach.length ? mach.reduce((sum, current) => sum + current, 0) / mach.length : 0,
      sourcePressureMin: sourcePressures.length ? Math.min(...sourcePressures) : 0,
      sourcePressureMax: sourcePressures.length ? Math.max(...sourcePressures) : 0
    };
  });
}
