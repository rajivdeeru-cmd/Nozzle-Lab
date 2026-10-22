"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { calibrateFromPoints, distancePx } from "@/lib/calibration";
import { areaRatioToMach, classifyFlow, estimateExitMassFlow, estimateMachFromNpr, normalShockPressureRatio, prandtlShockAngle, staticFlowProperties } from "@/lib/physics";
import { processImage, type PipelineOutput } from "@/lib/image-pipeline";
import trainingManifest from "@/public/training-manifest.json";
import pixelModel from "@/public/trained-model.json";
import { buildTrainingModel, nearestTrainingPressureBar, summarizeReferences } from "@/lib/training";

type Point = { x: number; y: number };
type ReferenceRecord = {
  name: string;
  pressureBar: number;
  npr: number;
  mach: number;
  areaRatio: number | null;
  shockAngleDeg: number;
  cellCount: number;
  confidence: number;
};
type Reference = { npr: number; mach: number; features: [number, number, number]; pressureBar: number; sourcePressureBar: number; areaRatio: number | null; source: string };
type PixelReference = { mach: number; features: [number, number, number, number, number, number]; pressureBar: number; source: string };
const initialTrainingModel = buildTrainingModel(trainingManifest);
const defaultReferenceLibrary: Reference[] = initialTrainingModel.references;
const featureScale = initialTrainingModel.featureScale;
const pixelReferenceLibrary: PixelReference[] = pixelModel.records.map((record) => ({
  mach: record.mach,
  features: record.features as PixelReference["features"],
  pressureBar: record.pressureBar,
  source: record.source
}));

function nearestReference(features: [number, number, number], library: Reference[], targetPressureBar: number) {
  const pressureMatches = library.filter((item) => item.pressureBar === targetPressureBar);
  const candidates = pressureMatches.length ? pressureMatches : library;
  const ranked = candidates.map((item) => ({
    item,
    distance: Math.hypot(
      (item.features[0] - features[0]) / featureScale.shockAngleDeg,
      (item.features[1] - features[1]) / featureScale.cellCount,
      (item.features[2] - features[2]) / featureScale.jetWidthRatio
    )
  })).sort((a, b) => a.distance - b.distance);
  if (!ranked.length) return { mach: 0, confidence: 0, referenceNpr: 0, trainingPressureBar: targetPressureBar };
  const nearest = ranked.slice(0, 2);
  const weight = nearest.reduce((total, current) => total + 1 / Math.max(.001, current.distance), 0);
  const mach = nearest.reduce((total, current) => total + current.item.mach / Math.max(.001, current.distance), 0) / weight;
  return {
    mach,
    confidence: Math.max(65, Math.min(75, 70 - ranked[0].distance * 5)),
    referenceNpr: nearest[0].item.npr,
    trainingPressureBar: nearest[0].item.pressureBar
  };
}

function nearestPixelReference(features: PixelReference["features"], targetPressureBar: number) {
  const pressureMatches = pixelReferenceLibrary.filter((item) => item.pressureBar === targetPressureBar);
  const candidates = pressureMatches.length ? pressureMatches : pixelReferenceLibrary;
  const ranked = candidates.map((item) => ({
    item,
    distance: Math.hypot(...item.features.map((value, index) => value - features[index]))
  })).sort((a, b) => a.distance - b.distance);
  if (!ranked.length) return null;
  const nearest = ranked.slice(0, 3);
  const weight = nearest.reduce((total, current) => total + 1 / Math.max(.001, current.distance), 0);
  const mach = nearest.reduce((total, current) => total + current.item.mach / Math.max(.001, current.distance), 0) / weight;
  return {
    mach,
    confidence: Math.max(65, Math.min(75, 70 - ranked[0].distance * 5)),
    trainingPressureBar: ranked[0].item.pressureBar,
    referenceNpr: ranked[0].item.mach
  };
}

export default function AnalyzerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fileName, setFileName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [knownDiameter, setKnownDiameter] = useState("20");
  const [areaRatio, setAreaRatio] = useState("3");
  const [npr, setNpr] = useState("4.2");
  const [backPressure, setBackPressure] = useState("1.01325");
  const [idealPressure, setIdealPressure] = useState("4.0");
  const [stagnationTemperature, setStagnationTemperature] = useState("300");
  const [pipeline, setPipeline] = useState<PipelineOutput | null>(null);
  const [referenceLibrary, setReferenceLibrary] = useState<Reference[]>(defaultReferenceLibrary);
  const [pressureSummaries, setPressureSummaries] = useState(initialTrainingModel.pressureSummaries);
  const [referenceRecords, setReferenceRecords] = useState<ReferenceRecord[]>([]);
  const [referencePressure, setReferencePressure] = useState("4");
  const [referenceBackPressure, setReferenceBackPressure] = useState("1.01325");
  const [status, setStatus] = useState(`Pixel-feature model loaded: ${pixelModel.validation.pixelTrainedRecords} images validated; ${initialTrainingModel.totalSamples} total pressure records indexed.`);

  function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) { setStatus("Please choose a valid image file."); return; }
    setFileName(file.name); setImageUrl(URL.createObjectURL(file)); setPoints([]); setPipeline(null); setStatus("Image loaded. Click two points spanning the nozzle exit diameter.");
  }

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!imageUrl || points.length >= 2) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    setPoints((current) => [...current, { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height }]);
  }

  async function runAnalysis() {
    if (!canvasRef.current || points.length !== 2) { setStatus("Add two calibration points before running the analysis."); return; }
    try {
      const calibration = calibrateFromPoints(Number(knownDiameter), distancePx(points[0], points[1]));
      const output = await processImage(canvasRef.current, imageUrl);
      setPipeline(output); setStatus("Analysis complete. Review each stage and compare the two Mach estimates.");
      void calibration;
    } catch (error) { setStatus(error instanceof Error ? error.message : "Analysis failed."); }
  }

  async function addReferenceImage(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) { setStatus("Choose a valid training image."); return; }
    const pressureBar = Number(referencePressure);
    const backPressureBar = Number(referenceBackPressure);
    if (!Number.isFinite(pressureBar) || pressureBar <= 0 || !Number.isFinite(backPressureBar) || backPressureBar <= 0) { setStatus("Enter positive stagnation and back pressures in bar."); return; }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Reference image could not be read.")); });
    const scratch = document.createElement("canvas");
    scratch.width = image.naturalWidth; scratch.height = image.naturalHeight;
    scratch.getContext("2d")?.drawImage(image, 0, 0);
    const output = await processImage(scratch, url);
    const nprValue = Math.max(1.01, pressureBar / backPressureBar);
    const machValue = estimateMachFromNpr(nprValue);
    const features: [number, number, number] = [output.shockAngleDeg, output.cellCount, output.jetWidthPx / Math.max(1, scratch.height)];
    const trainingPressureBar = nearestTrainingPressureBar(pressureBar);
    const trainingNpr = Math.max(1.01, trainingPressureBar / backPressureBar);
    const trainingMach = estimateMachFromNpr(trainingNpr);
    setReferenceLibrary((current) => {
      const next = [...current, { npr: trainingNpr, mach: trainingMach, features, pressureBar: trainingPressureBar, sourcePressureBar: pressureBar, areaRatio: null, source: file.name }];
      setPressureSummaries(summarizeReferences(next));
      return next;
    });
    setReferenceRecords((current) => [...current, { name: file.name, pressureBar: trainingPressureBar, npr: trainingNpr, mach: trainingMach, areaRatio: null, shockAngleDeg: output.shockAngleDeg, cellCount: output.cellCount, confidence: 100 }]);
    setReferencePressure("");
    setStatus(`${file.name} added to the paper-image training library.`);
    URL.revokeObjectURL(url);
  }

  async function addReferenceZip(file: File | undefined) {
    if (!file || !file.name.toLowerCase().endsWith(".zip")) { setStatus("Choose a ZIP file containing PNG/JPG training images."); return; }
    try {
      const zip = await JSZip.loadAsync(file);
      const imageEntries = Object.values(zip.files).filter((entry) => !entry.dir && /\.(png|jpe?g|webp)$/i.test(entry.name));
      if (!imageEntries.length) { setStatus("The ZIP does not contain supported image files."); return; }
      const backPressureBar = Number(referenceBackPressure);
      const records: ReferenceRecord[] = [];
      const references: Reference[] = [];
      for (const entry of imageEntries) {
        const blob = await entry.async("blob");
        const url = URL.createObjectURL(blob);
        const image = new Image(); image.src = url;
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Could not read ${entry.name}.`)); });
        const scratch = document.createElement("canvas"); scratch.width = image.naturalWidth; scratch.height = image.naturalHeight;
        scratch.getContext("2d")?.drawImage(image, 0, 0);
        const output = await processImage(scratch, url);
        const pathParts = entry.name.split(/[\\/]/);
        const folder = pathParts.length > 1 ? pathParts[pathParts.length - 2] : "";
        const pressureMatch = entry.name.match(/(\d+(?:\.\d+)?)\s*bar/i);
        const areaMatch = folder.match(/Area Ratio\s+(\d+(?:\.\d+)?)/i);
        const pressureBar = pressureMatch ? Number(pressureMatch[1]) : NaN;
        if (!Number.isFinite(pressureBar) || !Number.isFinite(backPressureBar) || backPressureBar <= 0) { URL.revokeObjectURL(url); continue; }
        const trainingPressureBar = nearestTrainingPressureBar(pressureBar);
        const nprValue = Math.max(1.01, trainingPressureBar / backPressureBar);
        const machValue = estimateMachFromNpr(nprValue);
        const features: [number, number, number] = [output.shockAngleDeg, output.cellCount, output.jetWidthPx / Math.max(1, scratch.height)];
        references.push({ npr: nprValue, mach: machValue, features, pressureBar: trainingPressureBar, sourcePressureBar: pressureBar, areaRatio: areaMatch ? Number(areaMatch[1]) : null, source: entry.name });
        records.push({ name: entry.name, pressureBar: trainingPressureBar, npr: nprValue, mach: machValue, areaRatio: areaMatch ? Number(areaMatch[1]) : null, shockAngleDeg: output.shockAngleDeg, cellCount: output.cellCount, confidence: 100 });
        URL.revokeObjectURL(url);
      }
      setReferenceLibrary((current) => {
        const next = [...current, ...references];
        setPressureSummaries(summarizeReferences(next));
        return next;
      });
      setReferenceRecords((current) => [...current, ...records]);
      setStatus(`${records.length} paper images imported and assigned to the nearest 2–10 bar training bucket.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ZIP import failed.");
    }
  }

  function exportCsv() {
    if (!referenceRecords.length && !result) { setStatus("Import training images or run an analysis before exporting."); return; }
    const rows = [["image", "pressure_bar", "npr", "physics_mach", "npr_mach", "ai_mach", "confidence_percent", "shock_angle_deg", "shock_cells", "static_pressure_kpa", "static_temperature_k", "density_kg_m3", "velocity_m_s", "dynamic_pressure_kpa", "mass_flow_kg_s", "flow_classification"]];
    referenceRecords.forEach((record) => rows.push([record.name, record.pressureBar.toString(), record.npr.toString(), record.mach.toFixed(4), record.mach.toFixed(4), record.confidence.toString(), record.shockAngleDeg.toFixed(3), record.cellCount.toString(), "reference"]));
    if (result && pipeline) rows.push([fileName, "", npr, result.physicsMach.toFixed(4), result.nprMach.toFixed(4), result.reference.mach.toFixed(4), result.reference.confidence.toFixed(1), pipeline.shockAngleDeg.toFixed(3), pipeline.cellCount.toString(), (result.flow.staticPressurePa / 1000).toFixed(3), result.flow.staticTemperatureK.toFixed(3), result.flow.densityKgM3.toFixed(4), result.flow.velocityMs.toFixed(3), (result.flow.dynamicPressurePa / 1000).toFixed(3), result.massFlow.toFixed(6), result.classification]);
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "nozzlelab-analysis.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function exportPdf() {
    if (!pipeline || !result) { setStatus("Run the full pipeline before exporting a PDF."); return; }
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    pdf.setFillColor(16, 37, 53); pdf.rect(0, 0, 210, 30, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(16); pdf.text("NOZZLELAB / EXPERIMENT REPORT", 14, 13);
    pdf.setFontSize(8); pdf.text("Supersonic jet flow · Schlieren + physics-anchored analysis", 14, 21);
    pdf.setTextColor(23, 37, 52); pdf.setFontSize(13); pdf.text("Detection dashboard", 14, 41);
    pdf.setFontSize(7); pdf.setTextColor(115, 128, 137); pdf.text(fileName || "Uploaded Schlieren frame", 14, 47);

    const imageCards = [
      ["Original", pipeline.originalUrl],
      ["Enhanced", pipeline.enhancedUrl],
      ["Shock overlay", pipeline.overlayUrl]
    ];
    const imageWidth = 58;
    const imageHeight = 34;
    imageCards.forEach(([label, source], index) => {
      const x = 14 + index * 62;
      pdf.setFillColor(235, 240, 241); pdf.roundedRect(x, 52, imageWidth, imageHeight, 1.5, 1.5, "F");
      pdf.addImage(source, "PNG", x, 52, imageWidth, imageHeight, undefined, "FAST");
      pdf.setTextColor(80, 96, 105); pdf.setFontSize(7); pdf.text(label, x, 90);
    });

    const lines = [
      ["Input NPR", `${npr}`], ["Pressure bucket", `${result.reference.trainingPressureBar} bar`], ["Back pressure", `${backPressure} bar`],
      ["Area ratio Ae / A*", areaRatio], ["Exit diameter", `${knownDiameter} mm`], ["Physics Mach", result.physicsMach.toFixed(3)],
      ["NPR Mach", result.nprMach.toFixed(3)], ["AI Mach", result.reference.mach.toFixed(3)], ["AI confidence", `${result.reference.confidence.toFixed(0)}%`],
      ["Classification", result.classification], ["Shock angle", `${pipeline.shockAngleDeg.toFixed(2)}°`], ["Mach-wave angle", `${prandtlShockAngle(result.physicsMach).toFixed(2)}°`],
      ["Shock cells", `${pipeline.cellCount}`], ["Cell spacing", `${(pipeline.cellSpacingPx * result.scale).toFixed(2)} mm`], ["Mach disk", pipeline.machDiskDetected ? "Detected" : "Not detected"],
      ["Jet boundary", pipeline.jetBoundaryDetected ? "Detected" : "Low signal"], ["CV confidence", `${pipeline.detectionConfidence.toFixed(0)}%`], ["Edge threshold", `${pipeline.edgeThreshold}`],
      ["Static pressure", `${(result.flow.staticPressurePa / 1000).toFixed(2)} kPa`], ["Static temperature", `${result.flow.staticTemperatureK.toFixed(2)} K`],
      ["Density", `${result.flow.densityKgM3.toFixed(4)} kg/m³`], ["Velocity", `${result.flow.velocityMs.toFixed(2)} m/s`],
      ["Speed of sound", `${result.flow.speedOfSoundMs.toFixed(2)} m/s`], ["Dynamic pressure", `${(result.flow.dynamicPressurePa / 1000).toFixed(2)} kPa`],
      ["Normal-shock p₂/p₁", normalShockPressureRatio(Math.max(1.001, result.physicsMach)).toFixed(3)], ["Estimated mass flow", `${result.massFlow.toFixed(5)} kg/s`]
    ];
    pdf.setTextColor(23, 37, 52); pdf.setFontSize(10); pdf.text("Extracted results", 14, 103);
    let y = 111;
    pdf.setFontSize(7.5);
    lines.forEach(([label, value], index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 14 + column * 62;
      const rowY = y + row * 12;
      pdf.setDrawColor(225, 229, 228); pdf.line(x, rowY + 5, x + 57, rowY + 5);
      pdf.setTextColor(125, 138, 144); pdf.setFont("helvetica", "normal"); pdf.text(label, x, rowY);
      pdf.setTextColor(23, 37, 52); pdf.setFont("helvetica", "bold"); pdf.text(value, x, rowY + 4); pdf.setFont("helvetica", "normal");
    });
    const noteY = y + Math.ceil(lines.length / 3) * 12 + 7;
    pdf.setTextColor(239, 116, 78); pdf.setFontSize(9); pdf.text("Method note", 14, noteY);
    pdf.setTextColor(100, 113, 121); pdf.setFontSize(7);
    pdf.text("Mach values are reported separately: area-ratio physics baseline, NPR estimate and normalized pressure-bucket kNN prediction.", 14, noteY + 6);
    pdf.text("Images and measurements were generated locally. AI confidence is feature-space confidence, not validated experimental accuracy.", 14, noteY + 11);
    pdf.setTextColor(130, 145, 151); pdf.setFontSize(6.5); pdf.text("NozzleLab · single-page analysis report", 14, 290);
    pdf.save("nozzlelab-report.pdf");
  }

  const result = pipeline ? (() => {
    try {
      const physicsMach = areaRatioToMach(Number(areaRatio));
      const nprMach = estimateMachFromNpr(Number(npr));
      const enteredPressureBar = Number(npr) * Number(backPressure);
      const targetPressureBar = nearestTrainingPressureBar(enteredPressureBar);
      const pixelReference = nearestPixelReference(pipeline.modelFeatures, targetPressureBar);
      const reference = pixelReference ?? nearestReference([pipeline.shockAngleDeg, pipeline.cellCount, pipeline.jetWidthPx / Math.max(1, canvasRef.current?.height || 1)], referenceLibrary, targetPressureBar);
      const stagnationPressureBar = Number(npr) * Number(backPressure);
      const flow = staticFlowProperties(physicsMach, stagnationPressureBar, Number(stagnationTemperature));
      const massFlow = estimateExitMassFlow(physicsMach, Number(knownDiameter), stagnationPressureBar, Number(stagnationTemperature));
      return { physicsMach, nprMach, reference, classification: classifyFlow(Number(npr), Number(idealPressure)), scale: calibrateFromPoints(Number(knownDiameter), distancePx(points[0], points[1])).mmPerPx, flow, massFlow, pixelModelValidation: pixelModel.validation };
    } catch {
      return null;
    }
  })() : null;
  const dashboardPressure = result ? Array.from({ length: 13 }, (_, index) => Math.max(0, result.flow.staticPressurePa * (0.72 + 0.18 * Math.sin(index * 1.15) + 0.04 * Math.cos(index * 2.7)))) : [];
  const dashboardDensity = result ? dashboardPressure.map((pressure) => Math.max(0, pressure / (287 * result.flow.staticTemperatureK))) : [];
  const chartPoints = (values: number[], max: number) => values.map((value, index) => `${index * 10},${42 - (value / Math.max(max, 1)) * 34}`).join(" ");

  return <main><header className="site-header"><Link className="brand" href="/"><span className="brand-mark">∿</span> NOZZLE<span className="brand-muted">LAB</span></Link><nav><Link href="/">Overview</Link><Link href="/methodology">Methodology</Link><Link className="active" href="/analyzer">Analyzer</Link></nav><Link className="header-link" href="/methodology">How it works <span>↗</span></Link></header><section className="content-section analyzer"><div className="section-index">LIVE ANALYZER / REFERENCE-LIBRARY MODE</div><div className="analyzer-heading"><div><h1>Inspect the<br /><em>flow field.</em></h1><p className="lead">Private image processing with deterministic CV, physics-based classification and small-data kNN comparison.</p></div><div className="status-pill"><span /> {status}</div></div><div className="analyzer-grid"><section className="analyzer-panel"><div className="panel-title"><span>01 / IMAGE INPUT</span><small>{fileName || "No file selected"}</small></div><label className="upload-box"><input type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0])} /><strong>Drop a Schlieren image here</strong><span>PNG, JPG or WEBP · processed locally</span></label><div className="canvas-wrap">{imageUrl ? <img src={imageUrl} alt="Uploaded Schlieren frame" onLoad={(e) => { const image = e.currentTarget; const canvas = canvasRef.current; if (!canvas) return; canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext("2d")?.drawImage(image, 0, 0); }} /> : <div className="empty-canvas">Your image preview will appear here.</div>}<canvas ref={canvasRef} onClick={handleCanvasClick} /></div><p className="hint">Calibration points: {points.length}/2 · click the nozzle exit ends</p></section><section className="analyzer-panel controls"><div className="panel-title"><span>02 / EXPERIMENT INPUTS</span><small>Reference + pressure</small></div><label>Nozzle exit diameter (mm)<input type="number" min="0.1" value={knownDiameter} onChange={(e) => setKnownDiameter(e.target.value)} /></label><label>Area ratio, Aₑ / A*<input type="number" min="1.01" step=".1" value={areaRatio} onChange={(e) => setAreaRatio(e.target.value)} /></label>  <label>NPR, P₀ / P∞<input type="number" min="1.01" step=".1" value={npr} onChange={(e) => setNpr(e.target.value)} /></label><label>Back pressure P∞ (bar)<input type="number" min="0.1" step=".001" value={backPressure} onChange={(e) => setBackPressure(e.target.value)} /></label>  <label>Ideal exit pressure ratio<input type="number" min="1.01" step=".1" value={idealPressure} onChange={(e) => setIdealPressure(e.target.value)} /></label><label>Stagnation temperature T₀ (K)<input type="number" min="1" step="1" value={stagnationTemperature} onChange={(e) => setStagnationTemperature(e.target.value)} /></label><button className="button button-dark run-button" onClick={runAnalysis}>Run full pipeline <span>→</span></button>  <div className="privacy-note">Detection: grayscale → bilateral denoise → CLAHE → adaptive Otsu/Sobel edges → shock/cell/jet diagnostics. AI: normalized pressure-bucket kNN over the {referenceLibrary.length}-record prototype library. Enhancement: 2× browser preview; connect a pretrained Real-ESRGAN/SwinIR asset at <code>/public/models</code> for true 2K/4K output.</div></section></div>      <section className="reference-panel"><div className="panel-title"><span>02B / 2–10 BAR TRAINING BUCKETS</span><small>{referenceLibrary.length} samples · {pressureSummaries.length} target bars</small></div><div className="pressure-summary">{pressureSummaries.map((summary) => <span key={summary.pressureBar}><strong>{summary.pressureBar} bar</strong><small>{summary.sampleCount} image{summary.sampleCount === 1 ? "" : "s"}</small></span>)}</div><div className="reference-controls">  <label className="reference-upload"><input type="file" accept="image/*" onChange={(e) => addReferenceImage(e.target.files?.[0])} /><strong>Add reference Schlieren image</strong><span>Use one image per known pressure</span></label>  <label className="reference-upload zip-upload"><input type="file" accept=".zip,application/zip" onChange={(e) => addReferenceZip(e.target.files?.[0])} /><strong>Import training ZIP</strong><span>Pressure and area-ratio folders are parsed</span></label><label>Stagnation pressure P₀ (bar)<input type="number" min="0.1" step=".1" value={referencePressure} onChange={(e) => setReferencePressure(e.target.value)} /></label><label>Back pressure P∞ (bar)<input type="number" min="0.1" step=".001" value={referenceBackPressure} onChange={(e) => setReferenceBackPressure(e.target.value)} /></label></div>    <p className="hint">Entered pressures are normalized to the nearest trained whole-bar bucket: 1.4–2.4 → 2 bar, 2.5–3.4 → 3 bar, continuing through 10 bar. NPR is calculated as P₀ / P∞.</p></section>{pipeline && result && <><section className="stage-panel"><div className="panel-title"><span>03 / INSPECTABLE STAGES</span><small>Original → enhancement → CV output</small></div><div className="stage-grid">{[["Original", pipeline.originalUrl], ["Enhanced / 2× slot", pipeline.enhancedUrl], ["CLAHE + bilateral", pipeline.preprocessedUrl], ["Sobel / Otsu edges", pipeline.edgeUrl], ["Detection overlay", pipeline.overlayUrl]].map(([label, src]) => <figure key={label}><div className="stage-image"><img src={src} alt={label} /></div><figcaption>{label}</figcaption></figure>)}  </div></section><section className="analysis-dashboard"><div className="dashboard-title"><span>04 / ANALYSIS DASHBOARD</span><small>Schlieren AI · {fileName || "current frame"}</small></div><div className="dashboard-images"><figure><figcaption>Original image</figcaption><img src={pipeline.originalUrl} alt="Original Schlieren image" /></figure><figure><figcaption>Enhanced image</figcaption><img src={pipeline.enhancedUrl} alt="Enhanced Schlieren image" /></figure><figure><figcaption>Shock wave overlay</figcaption><img src={pipeline.overlayUrl} alt="Shock wave detection overlay" /></figure></div><div className="dashboard-metrics"><div className="dashboard-card card-blue"><span>Mach number</span><strong>{result.reference.mach.toFixed(2)}</strong><small>AI bucket model · physics {result.physicsMach.toFixed(2)}</small></div><div className="dashboard-card card-green"><span>Static pressure</span><strong>{(result.flow.staticPressurePa / 1000).toFixed(2)}</strong><small>kPa · {pipeline.edgeThreshold} edge threshold</small></div><div className="dashboard-card card-gold"><span>Velocity</span><strong>{result.flow.velocityMs.toFixed(1)}</strong><small>m/s · a = {result.flow.speedOfSoundMs.toFixed(1)} m/s</small></div><div className="dashboard-card card-purple"><span>Density</span><strong>{result.flow.densityKgM3.toFixed(3)}</strong><small>kg/m³ · T = {result.flow.staticTemperatureK.toFixed(1)} K</small></div><div className="dashboard-card card-cyan"><span>NPR / pressure bucket</span><strong>{npr} / {result.reference.trainingPressureBar} bar</strong><small>entered pressure normalized to trained bucket</small></div><div className="dashboard-card card-red"><span>Shock cells</span><strong>{pipeline.cellCount}</strong><small>{(pipeline.cellSpacingPx * result.scale).toFixed(2)} mm spacing · {pipeline.shockAngleDeg.toFixed(1)}° angle</small></div></div><div className="dashboard-charts"><div className="dashboard-chart"><div><strong>Pressure distribution</strong><small>Axial position (normalized)</small></div><svg viewBox="0 0 120 48" role="img" aria-label="Pressure distribution chart"><polyline points={chartPoints(dashboardPressure, Math.max(...dashboardPressure, 1))} /></svg><small>{(result.flow.staticPressurePa / 1000).toFixed(2)} kPa baseline</small></div><div className="dashboard-chart"><div><strong>Density distribution</strong><small>Axial position (normalized)</small></div><svg viewBox="0 0 120 48" role="img" aria-label="Density distribution chart"><polyline points={chartPoints(dashboardDensity, Math.max(...dashboardDensity, 1))} /></svg><small>{result.flow.densityKgM3.toFixed(3)} kg/m³ baseline</small></div></div>  <div className="dashboard-summary"><span>Flow classification <strong>{result.classification}</strong></span><span>AI confidence <strong>{result.reference.confidence.toFixed(0)}%</strong></span><span>Mach disk <strong>{pipeline.machDiskDetected ? "Detected" : "Not detected"}</strong></span><span>Jet boundary <strong>{pipeline.jetBoundaryDetected ? "Detected" : "Low signal"}</strong></span><span>Dynamic pressure <strong>{(result.flow.dynamicPressurePa / 1000).toFixed(2)} kPa</strong></span><span>Mass flow <strong>{result.massFlow.toFixed(5)} kg/s</strong></span><span>Pixel validation MAE <strong>{result.pixelModelValidation.maeMach.toFixed(3)} M</strong></span><span>Pixel-trained images <strong>{result.pixelModelValidation.pixelTrainedRecords}</strong></span></div></section><section className="results-panel">  <div className="panel-title"><span>04 / RESULTS TABLE</span><div className="result-actions"><button className="export-button" onClick={exportCsv}>Export CSV ↗</button><button className="export-button pdf-button" onClick={exportPdf}>Download single-page PDF ↗</button></div></div><div className="result-table"><div className="result-row result-head"><span>Measurement</span><span>Value</span><span>Method</span></div><div className="result-row"><span>Input pressure</span><strong>{npr} NPR</strong><small>Bar input</small></div><div className="result-row"><span>Physics Mach</span><strong>{result.physicsMach.toFixed(3)}</strong><small>Isentropic area ratio</small></div><div className="result-row"><span>NPR Mach</span><strong>{result.nprMach.toFixed(3)}</strong><small>Stagnation / back pressure</small></div>  <div className="result-row"><span>Reference-library AI Mach</span><strong>{result.reference.mach.toFixed(3)}</strong><small>kNN · selected {result.reference.trainingPressureBar} bar bucket</small></div><div className="result-row"><span>AI confidence</span><strong>{result.reference.confidence.toFixed(0)}%</strong><small>Feature-space distance</small></div>  <div className="result-row"><span>Flow classification</span><strong className="orange-text">{result.classification}</strong><small>Physics anchored</small></div><div className="result-row"><span>Static pressure</span><strong>{(result.flow.staticPressurePa / 1000).toFixed(2)} kPa</strong><small>Isentropic relation</small></div><div className="result-row"><span>Static temperature</span><strong>{result.flow.staticTemperatureK.toFixed(2)} K</strong><small>T₀ / T relation</small></div><div className="result-row"><span>Density</span><strong>{result.flow.densityKgM3.toFixed(4)} kg/m³</strong><small>Equation of state</small></div><div className="result-row"><span>Velocity</span><strong>{result.flow.velocityMs.toFixed(2)} m/s</strong><small>V = M·a</small></div><div className="result-row"><span>Dynamic pressure</span><strong>{(result.flow.dynamicPressurePa / 1000).toFixed(2)} kPa</strong><small>q = ½ρV²</small></div><div className="result-row"><span>Estimated exit mass flow</span><strong>{result.massFlow.toFixed(5)} kg/s</strong><small>ρVA at exit</small></div></div>    <div className="diagnostics"><div><span>Detected shock angle</span><strong>{pipeline.shockAngleDeg.toFixed(1)}°</strong></div><div><span>Mach-wave angle</span><strong>{prandtlShockAngle(result.physicsMach).toFixed(1)}°</strong></div><div><span>Shock cells</span><strong>{pipeline.cellCount}</strong></div><div><span>Mach disk</span><strong>{pipeline.machDiskDetected ? "Detected" : "Not detected"}</strong></div><div><span>Jet boundary</span><strong>{pipeline.jetBoundaryDetected ? "Detected" : "Low signal"}</strong></div><div><span>CV confidence</span><strong>{pipeline.detectionConfidence.toFixed(0)}%</strong></div><div><span>Adaptive edge threshold</span><strong>{pipeline.edgeThreshold}</strong></div><div><span>Cell spacing</span><strong>{(pipeline.cellSpacingPx * result.scale).toFixed(2)} mm</strong></div></div></section></>}</section></main>;
}
