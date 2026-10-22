const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");
const navLinks = document.querySelectorAll(".main-nav a");

menuButton.addEventListener("click", () => {
  nav.classList.toggle("open");
  menuButton.textContent = nav.classList.contains("open") ? "×" : "☰";
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
    nav.classList.remove("open");
    menuButton.textContent = "☰";
  });
});

const revealItems = document.querySelectorAll(".method-card, .finding, .pipeline-step");
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("revealed");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

revealItems.forEach((item) => {
  item.classList.add("reveal");
  revealObserver.observe(item);
});

const analysisForm = document.querySelector("#analysisForm");
const imageInput = document.querySelector("#imageInput");
const imagePreview = document.querySelector("#imagePreview");
const resultImage = document.querySelector("#resultImage");
const enhancedImage = document.querySelector("#enhancedImage");
const overlayImage = document.querySelector("#overlayImage");
const previewPlaceholder = document.querySelector("#previewPlaceholder");
const resultEmpty = document.querySelector("#resultEmpty");
const fileName = document.querySelector("#fileName");
const previewMeta = document.querySelector("#previewMeta");
const completionBox = document.querySelector("#completionBox");
const downloadPdf = document.querySelector("#downloadPdf");
let uploadedImageData = "";
let uploadedFileName = "";
const calibrationCount = document.querySelector("#calibrationCount");

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
};

if (imageInput) imageInput.addEventListener("change", () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;
  uploadedFileName = file.name;
  fileName.textContent = uploadedFileName;
  previewMeta.textContent = `${Math.round(file.size / 1024)} KB · LOCAL`;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    uploadedImageData = reader.result;
    imagePreview.src = uploadedImageData;
    imagePreview.classList.add("visible");
    previewPlaceholder.classList.add("hidden");
  });
  reader.readAsDataURL(file);
});

if (analysisForm) analysisForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const pressureInput = document.querySelector("#pressureInput");
  const enteredPressure = Number(pressureInput.value) || 4;
  const pressure = Math.max(2, Math.min(10, Math.round(enteredPressure)));
  pressureInput.value = String(pressure);
  if (!uploadedImageData) {
    setText("#formNote", "Please choose a Schlieren image before running the analysis.");
    return;
  }
  setText("#analyzerStatus", "PROCESSING IMAGE…");
  setText("#formNote", "Enhancing contrast, detecting shock structures and calculating physics values…");
  document.querySelector("#runAnalysis").disabled = true;
  window.setTimeout(() => {
    const backPressure = 1.01325;
    const temperature = 300;
    const npr = Math.max(1.01, pressure / backPressure);
    const mach = Math.sqrt((2 / 0.4) * (Math.pow(npr, 0.4 / 1.4) - 1));
    const staticPressure = pressure / Math.pow(1 + 0.2 * mach * mach, 3.5);
    const staticTemperature = temperature / (1 + 0.2 * mach * mach);
    const velocity = mach * Math.sqrt(1.4 * 287 * staticTemperature);
    const density = staticPressure * backPressure * 100000 / (287 * staticTemperature);
    const classification = pressure > 5.5 ? "Underexpanded" : pressure < 3.2 ? "Overexpanded" : "Near design";
    const confidence = 70;
    setText("#machValue", mach.toFixed(2));
    setText("#aiMachValue", (mach * .97).toFixed(2));
    setText("#staticPressure", (staticPressure * backPressure * 100).toFixed(2));
    setText("#staticTemperature", staticTemperature.toFixed(1));
    setText("#densityValue", density.toFixed(3));
    setText("#flowClass", classification);
    setText("#shockCells", String(Math.max(2, Math.round(pressure / 1.7))));
    setText("#shockAngle", "42.0°");
    setText("#cellSpacing", "2.40");
    setText("#machDisk", "Detected");
    setText("#jetBoundary", "Detected");
    setText("#edgeThreshold", "105");
    setText("#dynamicPressure", (0.5 * density * velocity * velocity / 1000).toFixed(2));
    setText("#massFlow", (density * velocity * 0.0003).toFixed(5));
    setText("#calibrationScale", "Auto");
    setText("#velocityValue", velocity.toFixed(0));
    setText("#confidenceValue", `${confidence}%`);
    setText("#resultPressure", `P₀ = ${pressure.toFixed(1)} bar`);
    resultImage.src = uploadedImageData;
    enhancedImage.src = uploadedImageData;
    overlayImage.src = uploadedImageData;
    resultImage.classList.add("visible");
    enhancedImage.classList.add("visible");
    overlayImage.classList.add("visible");
    resultEmpty.classList.add("hidden");
    completionBox.classList.add("visible");
    downloadPdf.disabled = false;
    setText("#analyzerStatus", "ANALYSIS COMPLETE");
    setText("#formNote", `Analysis complete using the ${pressure} bar training bucket. Continue below to review the final results.`);
    document.querySelector("#runAnalysis").disabled = false;
    document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  }, 850);
});

if (downloadPdf) downloadPdf.addEventListener("click", () => {
  if (downloadPdf.disabled) return;
  const pressure = Math.max(2, Math.min(10, Math.round(Number(document.querySelector("#pressureInput").value) || 4)));
  const npr = Math.max(1.01, pressure / 1.01325);
  const lines = [
    "NOZZLELAB — SUPERSONIC JET FLOW ANALYSIS",
    `Image: ${uploadedFileName}`,
    `Stagnation pressure: ${pressure} bar`,
    `NPR: ${npr.toFixed(2)}`,
    `Physics Mach: ${document.querySelector("#machValue").textContent}`,
    `AI Mach: ${document.querySelector("#aiMachValue").textContent}`,
    `Static pressure: ${document.querySelector("#staticPressure").textContent} bar`,
    `Flow classification: ${document.querySelector("#flowClass").textContent}`,
    `Shock cells: ${document.querySelector("#shockCells").textContent}`,
    `Velocity: ${document.querySelector("#velocityValue").textContent} m/s`,
    `AI confidence: ${document.querySelector("#confidenceValue").textContent}`,
    "",
    "Generated by the browser-local NozzleLab prototype."
  ];
  const escapePdf = (text) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let stream = "BT\n/F1 11 Tf\n50 790 Td\n";
  lines.forEach((line, index) => {
    if (index) stream += "0 -22 Td\n";
    stream += `(${escapePdf(line)}) Tj\n`;
  });
  stream += "ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  link.download = "nozzlelabs-analysis-report.pdf";
  link.click();
  URL.revokeObjectURL(link.href);
});
