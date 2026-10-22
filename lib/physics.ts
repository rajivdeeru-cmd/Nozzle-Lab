const GAMMA = 1.4;

export function areaRatioToMach(areaRatio: number, gamma = GAMMA): number {
  if (areaRatio < 1) throw new Error("Area ratio must be at least 1.");
  let low = 1;
  let high = 8;
  for (let i = 0; i < 80; i += 1) {
    const mach = (low + high) / 2;
    const ratio = (1 / mach) * Math.pow((2 / (gamma + 1)) * (1 + ((gamma - 1) / 2) * mach ** 2), (gamma + 1) / (2 * (gamma - 1)));
    if (ratio > areaRatio) low = mach; else high = mach;
  }
  return (low + high) / 2;
}

export function estimateMachFromNpr(npr: number, gamma = GAMMA): number {
  if (npr <= 1) throw new Error("NPR must be greater than 1.");
  return Math.sqrt((2 / (gamma - 1)) * (npr ** ((gamma - 1) / gamma) - 1));
}

export function shockCellSpacing(mach: number, mmPerPx: number): number {
  if (mach <= 1 || mmPerPx <= 0) throw new Error("Supersonic Mach and positive calibration are required.");
  return 1.3 * Math.sqrt(mach ** 2 - 1) * 20 * mmPerPx;
}

export function classifyFlow(npr: number, idealExitPressureRatio: number): "underexpanded" | "overexpanded" | "perfectly expanded" {
  if (Math.abs(npr - idealExitPressureRatio) < 0.08) return "perfectly expanded";
  return npr > idealExitPressureRatio ? "underexpanded" : "overexpanded";
}

export function prandtlShockAngle(mach: number): number {
  if (mach <= 1) throw new Error("Mach number must be supersonic.");
  return Math.asin(1 / mach) * 180 / Math.PI;
}

export function isentropicPressureRatio(mach: number, gamma = GAMMA): number {
  if (mach < 0) throw new Error("Mach number cannot be negative.");
  return (1 + ((gamma - 1) / 2) * mach ** 2) ** (gamma / (gamma - 1));
}

export function isentropicTemperatureRatio(mach: number, gamma = GAMMA): number {
  if (mach < 0) throw new Error("Mach number cannot be negative.");
  return 1 + ((gamma - 1) / 2) * mach ** 2;
}

export function normalShockPressureRatio(mach: number, gamma = GAMMA): number {
  if (mach <= 1) throw new Error("Normal shock requires a supersonic upstream Mach number.");
  return 1 + (2 * gamma / (gamma + 1)) * (mach ** 2 - 1);
}

export function staticFlowProperties(mach: number, stagnationPressureBar: number, stagnationTemperatureK: number, gasConstant = 287, gamma = GAMMA) {
  if (mach <= 0 || stagnationPressureBar <= 0 || stagnationTemperatureK <= 0) throw new Error("Mach, pressure and temperature must be positive.");
  const staticPressurePa = (stagnationPressureBar * 100000) / isentropicPressureRatio(mach, gamma);
  const staticTemperatureK = stagnationTemperatureK / isentropicTemperatureRatio(mach, gamma);
  const densityKgM3 = staticPressurePa / (gasConstant * staticTemperatureK);
  const speedOfSoundMs = Math.sqrt(gamma * gasConstant * staticTemperatureK);
  const velocityMs = mach * speedOfSoundMs;
  const dynamicPressurePa = 0.5 * densityKgM3 * velocityMs ** 2;
  return { staticPressurePa, staticTemperatureK, densityKgM3, speedOfSoundMs, velocityMs, dynamicPressurePa };
}

export function estimateExitMassFlow(mach: number, exitDiameterMm: number, stagnationPressureBar: number, stagnationTemperatureK: number, gasConstant = 287, gamma = GAMMA): number {
  if (exitDiameterMm <= 0) throw new Error("Exit diameter must be positive.");
  const properties = staticFlowProperties(mach, stagnationPressureBar, stagnationTemperatureK, gasConstant, gamma);
  const areaM2 = Math.PI * (exitDiameterMm / 2000) ** 2;
  return properties.densityKgM3 * properties.velocityMs * areaM2;
}
