import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const jsPDFConstructor = window.jspdf?.jsPDF;

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 100;
const MAX_CANVAS_PIXELS = 16_000_000;

const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const chooseBtn = $("chooseBtn");
const dropzone = $("dropzone");
const filePanel = $("filePanel");
const fileName = $("fileName");
const fileSize = $("fileSize");
const removeBtn = $("removeBtn");
const quality = $("quality");
const compressBtn = $("compressBtn");
const statusPanel = $("statusPanel");
const statusText = $("statusText");
const statusPercent = $("statusPercent");
const progressBar = $("progressBar");
const resultPanel = $("resultPanel");
const resultText = $("resultText");
const downloadBtn = $("downloadBtn");
const errorPanel = $("errorPanel");

let selectedFile = null;
let objectUrl = null;
let isProcessing = false;

/* ---------- Upload ---------- */

chooseBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!isProcessing) fileInput.click();
});

dropzone.addEventListener("click", (event) => {
  if (isProcessing) return;
  if (event.target.closest("button")) return;
  fileInput.click();
});

dropzone.addEventListener("keydown", (event) => {
  if (isProcessing) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

["dragenter", "dragover"].forEach((type) => {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isProcessing) dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((type) => {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (type === "drop" && !isProcessing) {
      const file = event.dataTransfer?.files?.[0];
      if (file) setFile(file);
    }

    dropzone.classList.remove("dragover");
  });
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) setFile(file);
});

removeBtn.addEventListener("click", () => {
  if (!isProcessing) reset();
});

/* ---------- File handling ---------- */

function setFile(file) {
  clearError();
  hideResult();

  if (!isPdf(file)) {
    showError("Please select a valid PDF file.");
    clearFileInput();
    return;
  }

  if (file.size === 0) {
    showError("The selected file is empty.");
    clearFileInput();
    return;
  }

  if (file.size > MAX_BYTES) {
    showError("This version accepts PDF files up to 25 MB.");
    clearFileInput();
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileName.title = file.name;
  fileSize.textContent = formatBytes(file.size);

  filePanel.classList.remove("hidden");
  statusPanel.classList.add("hidden");
  compressBtn.disabled = false;
  removeBtn.disabled = false;
}

function reset() {
  selectedFile = null;
  clearFileInput();
  filePanel.classList.add("hidden");
  statusPanel.classList.add("hidden");
  hideResult();
  clearError();
  setProgress(0, "Preparing…");
  compressBtn.disabled = false;
  removeBtn.disabled = false;
  releaseObjectUrl();
}

function clearFileInput() {
  fileInput.value = "";
}

function isPdf(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/* ---------- Compression ---------- */

async function compress() {
  if (isProcessing) return;

  if (!selectedFile) {
    showError("Choose a PDF first.");
    return;
  }

  if (typeof jsPDFConstructor !== "function") {
    showError("The PDF engine could not be loaded. Check your internet connection and try again.");
    return;
  }

  isProcessing = true;
  compressBtn.disabled = true;
  removeBtn.disabled = true;
  clearError();
  hideResult();

  setProgress(2, "Reading PDF…");

  try {
    const buffer = await selectedFile.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: true
    }).promise;

    if (!pdf.numPages) {
      throw new Error("The PDF contains no pages.");
    }

    if (pdf.numPages > MAX_PAGES) {
      throw new Error(`This version supports up to ${MAX_PAGES} pages per PDF.`);
    }

    const settings = getSettings(quality.value);
    let output = null;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const pageStart = 5 + Math.round(((pageNumber - 1) / pdf.numPages) * 80);
      setProgress(pageStart, `Processing page ${pageNumber} of ${pdf.numPages}…`);

      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });

      const scale = getSafeScale(page, settings.scale);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const context = canvas.getContext("2d", {
        alpha: false,
        willReadFrequently: false
      });

      if (!context) {
        throw new Error("Your browser could not create a canvas for this PDF page.");
      }

      context.save();
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();

      await page.render({
        canvasContext: context,
        viewport
      }).promise;

      let imageData;

      try {
        imageData = canvas.toDataURL("image/jpeg", settings.quality);
      } catch {
        throw new Error("This PDF page is too large for your phone's browser memory.");
      }

      if (!output) {
        output = new jsPDFConstructor({
          unit: "pt",
          format: [baseViewport.width, baseViewport.height],
          orientation: baseViewport.width >= baseViewport.height ? "landscape" : "portrait",
          compress: true,
          putOnlyUsedFonts: true
        });
      } else {
        output.addPage(
          [baseViewport.width, baseViewport.height],
          baseViewport.width >= baseViewport.height ? "landscape" : "portrait"
        );
      }

      output.addImage(
        imageData,
        "JPEG",
        0,
        0,
        baseViewport.width,
        baseViewport.height,
        undefined,
        "FAST"
      );

      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();

      // Let mobile browsers breathe between large pages.
      if (pageNumber % 3 === 0) {
        await nextFrame();
      }
    }

    if (!output) {
      throw new Error("Unable to create the compressed PDF.");
    }

    setProgress(93, "Creating downloadable PDF…");

    const blob = output.output("blob");

    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error("The generated PDF is empty.");
    }

    const oldSize = selectedFile.size;
    const newSize = blob.size;
    const reduction = ((oldSize - newSize) / oldSize) * 100;

    releaseObjectUrl();
    objectUrl = URL.createObjectURL(blob);

    downloadBtn.href = objectUrl;
    downloadBtn.download = safeFilename(selectedFile.name);

    setProgress(100, "Compression complete");
    showResult(oldSize, newSize, reduction);

  } catch (error) {
    console.error("PDFShrink compression error:", error);

    statusPanel.classList.add("hidden");

    const message = getUserFriendlyError(error);
    showError(message);

  } finally {
    isProcessing = false;
    compressBtn.disabled = !selectedFile;
    removeBtn.disabled = false;
  }
}

/* ---------- Compression presets ---------- */

function getSettings(level) {
  switch (level) {
    case "strong":
      return { scale: 1.10, quality: 0.52 };

    case "maximum":
      return { scale: 0.85, quality: 0.36 };

    case "recommended":
    default:
      return { scale: 1.35, quality: 0.68 };
  }
}

function getSafeScale(page, requestedScale) {
  const viewport = page.getViewport({ scale: requestedScale });
  const pixels = viewport.width * viewport.height;

  if (pixels <= MAX_CANVAS_PIXELS) return requestedScale;

  const safeScale = requestedScale * Math.sqrt(MAX_CANVAS_PIXELS / pixels);
  return Math.max(0.45, safeScale);
}

/* ---------- UI ---------- */

function setProgress(percent, message) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));

  statusPanel.classList.remove("hidden");
  statusText.textContent = message;
  statusPercent.textContent = `${value}%`;
  progressBar.style.width = `${value}%`;

  const track = progressBar.parentElement;
  if (track) track.setAttribute("aria-valuenow", String(value));
}

function showResult(oldSize, newSize, reduction) {
  resultPanel.classList.remove("hidden");

  if (reduction > 0.05) {
    resultText.textContent =
      `${formatBytes(oldSize)} → ${formatBytes(newSize)} • ${reduction.toFixed(1)}% smaller`;
  } else if (reduction >= -0.05) {
    resultText.textContent =
      `${formatBytes(oldSize)} → ${formatBytes(newSize)} • About the same size`;
  } else {
    resultText.textContent =
      `${formatBytes(oldSize)} → ${formatBytes(newSize)} • This PDF became larger`;
  }
}

function hideResult() {
  resultPanel.classList.add("hidden");
  resultText.textContent = "";
  downloadBtn.removeAttribute("href");
}

function showError(message) {
  errorPanel.textContent = message;
  errorPanel.classList.remove("hidden");
}

function clearError() {
  errorPanel.textContent = "";
  errorPanel.classList.add("hidden");
}

/* ---------- Helpers ---------- */

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value = bytes / Math.pow(1024, index);
  const decimals = index === 0 ? 0 : value >= 100 ? 0 : 2;

  return `${value.toFixed(decimals)} ${units[index]}`;
}

function safeFilename(name) {
  const base = name
    .replace(/\.pdf$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return `${base || "document"}-compressed.pdf`;
}

function releaseObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function getUserFriendlyError(error) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("password") || message.includes("encrypted")) {
    return "This PDF is password-protected or encrypted. Please unlock it first and try again.";
  }

  if (message.includes("invalid") || message.includes("corrupt") || message.includes("malformed")) {
    return "This PDF appears to be damaged or invalid. Try opening it in a PDF reader first.";
  }

  if (message.includes("memory") || message.includes("canvas")) {
    return "This PDF is too demanding for your phone's browser memory. Try a smaller PDF or use a lower-resolution document.";
  }

  if (message.includes("up to 100 pages")) {
    return message;
  }

  return "Compression failed. The PDF may be encrypted, damaged, unusually complex, or unsupported by this browser-only version.";
}

window.addEventListener("beforeunload", releaseObjectUrl);


// Mobile-safe PDF file picker fallback
document.addEventListener("DOMContentLoaded", () => {
  const input = document.querySelector('input[type="file"]');
  if (!input) return;

  input.addEventListener("change", () => {
    if (input.files && input.files.length) {
      input.dispatchEvent(new CustomEvent("pdf-file-selected", {
        detail: { file: input.files[0] }
      }));
    }
  });
});
