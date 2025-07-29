document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("images-container");
  const downloadBtn = document.getElementById("download-btn");
  const searchInput = document.getElementById("searchInput");
  const selectAllBtn = document.getElementById("select-all");
  const deselectAllBtn = document.getElementById("deselect-all");
  const includeTxtCheckbox = document.getElementById("include-links-txt");
  const filterDuplicatesCheckbox = document.getElementById("filter-duplicates");
  const clearCacheBtn = document.getElementById("clear-cache-btn");
  const saveOnReloadCheckbox = document.getElementById("save-on-reload");

  // تحميل مكتبة jsPDF بشكل غير متزامن
  const loadJSPDF = async () => {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("jspdf.umd.min.js");
      script.onload = () => resolve(window.jspdf);
      document.head.appendChild(script);
    });
  };

  const jsPDFPromise = loadJSPDF();

  // تحميل الإعدادات المحفوظة
  filterDuplicatesCheckbox.checked = false; // تم تغيير هذا السطر ليكون false دائماً
  saveOnReloadCheckbox.checked =
    localStorage.getItem("saveImagesEnabled") !== "false";

  let allImages = [];
  let pendingImages = [];
  const imageHashes = new Map();

  // Custom Confirm Dialog Function
async function customConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";

    const dialog = document.createElement("div");
    dialog.className = "confirm-dialog";

    dialog.innerHTML = `
      <div class="confirm-message">${message}</div>
      <div class="confirm-buttons">
        <button id="confirmOk">موافق</button>
        <button id="confirmCancel">إلغاء</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.style.opacity = "1";
      dialog.style.transform = "translateY(0)";
    }, 10);

    // دالة للإغلاق
    let isDialogOpen = true;

    const closeDialog = (result) => {
      if (!isDialogOpen) return;
      isDialogOpen = false;

      overlay.style.opacity = "0";
      dialog.style.transform = "translateY(-20px)";

      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 300);
    };

    // النقر على زر الموافق
    document.getElementById("confirmOk").addEventListener("click", () => {
      closeDialog(true);
    });

    // النقر على زر الإلغاء
    document.getElementById("confirmCancel").addEventListener("click", () => {
      closeDialog(false);
    });

    // النقر خارج مربع الحوار للإغلاق
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeDialog(false);
      }
    });

    // إضافة event listener للزر Escape
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeDialog(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // تنظيف event listener عند الإغلاق
    const cleanup = () => {
      document.removeEventListener("keydown", handleKeyDown);
    };

    // إضافة event listener لتنظيف الـ listeners عند الإغلاق
    overlay.addEventListener(
      "transitionend",
      () => {
        if (!isDialogOpen) {
          cleanup();
        }
      },
      { once: true }
    );
  });
}

  // Progress Bar Functions
  function createProgressBar() {
    const progressBar = document.createElement("div");
    progressBar.id = "netnet-progress-bar";
    progressBar.style = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 300px;
      background: #f5f5f5;
      border-radius: 4px;
      padding: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 10000;
      display: none;
    `;

    progressBar.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
        <span id="netnet-progress-status">جاري التحضير...</span>
        <span id="netnet-progress-percent">0%</span>
      </div>
      <div style="height: 10px; background: #e0e0e0; border-radius: 5px; overflow: hidden;">
        <div id="netnet-progress-bar-inner" style="height: 100%; width: 0%; background: #3498db; transition: width 0.3s;"></div>
      </div>
      <button id="netnet-cancel-download" style="margin-top: 10px;">Cancel</button>
    `;

    document.body.appendChild(progressBar);
    return progressBar;
  }

  function updateProgressBar(progress, current, total, message = "") {
    const progressBar = document.getElementById("netnet-progress-bar");
    const innerBar = document.getElementById("netnet-progress-bar-inner");
    const status = document.getElementById("netnet-progress-status");
    const percent = document.getElementById("netnet-progress-percent");

    if (progressBar && innerBar && status && percent) {
      const percentage = Math.round(progress * 100);
      innerBar.style.width = `${percentage}%`;
      percent.textContent = `${percentage}%`;
      status.textContent = message || `جاري تنزيل ${current} من ${total}`;
    }
  }

  function showProgressBar() {
    const progressBar =
      document.getElementById("netnet-progress-bar") || createProgressBar();
    progressBar.style.display = "block";
    return progressBar;
  }

  function hideProgressBar() {
    const progressBar = document.getElementById("netnet-progress-bar");
    if (progressBar) {
      progressBar.style.display = "none";
    }
  }

  // Image Processing Functions
  // دالة لتحويل الصورة إلى تدرج الرمادي
  function toGrayscale(pixels) {
    const grayscale = new Uint8Array(pixels.length / 4);
    for (let i = 0; i < pixels.length; i += 4) {
      // تحويل RGB إلى تدرج الرمادي باستخدام الصيغة القياسية
      grayscale[i / 4] =
        0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    }
    return grayscale;
  }

  // دالة لتطبيق تحويل الجيب المنفصل (DCT)
  function applyDCT(data, width, height) {
    const result = new Float64Array(width * height);
    const cosTable = new Float64Array(width * height);
    for (let u = 0; u < width; u++) {
      for (let v = 0; v < height; v++) {
        cosTable[u * height + v] = Math.cos(
          ((2 * u + 1) * v * Math.PI) / (2 * height)
        );
      }
    }

    for (let u = 0; u < width; u++) {
      for (let v = 0; v < height; v++) {
        let sum = 0;
        for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) {
            sum +=
              data[x * height + y] *
              cosTable[x * height + v] *
              cosTable[y * width + u];
          }
        }
        const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
        const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
        result[u * height + v] = (sum * cu * cv) / 4;
      }
    }
    return result;
  }

  // دالة لحساب مسافة هامينغ بين هاشين
  function hammingDistance(hash1, hash2) {
    if (hash1.length !== hash2.length) return Infinity;
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    return distance;
  }

  // دالة لتحديد إذا كانت الصورتان متشابهتين
  function isSimilarImage(hash1, hash2, threshold = 5) {
    return hammingDistance(hash1, hash2) <= threshold;
  }

  // دالة لتوليد Perceptual Hash
  function getPerceptualHash(imgElement) {
    // إنشاء قماش بحجم 32x32
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgElement, 0, 0, 32, 32);

    // استخراج بيانات البكسل
    const imageData = ctx.getImageData(0, 0, 32, 32).data;
    const grayscale = toGrayscale(imageData);

    // تطبيق DCT
    const dct = applyDCT(grayscale, 32, 32);

    // استخراج الجزء 8x8 من DCT
    const dctSize = 8;
    let sum = 0;
    const dctBlock = new Float64Array(dctSize * dctSize);
    for (let u = 0; u < dctSize; u++) {
      for (let v = 0; v < dctSize; v++) {
        dctBlock[u * dctSize + v] = dct[u * 32 + v];
        sum += dctBlock[u * dctSize + v];
      }
    }

    // حساب المتوسط
    const mean = sum / (dctSize * dctSize);

    // إنشاء الهاش (64 بت)
    let hash = "";
    for (let i = 0; i < dctBlock.length; i++) {
      hash += dctBlock[i] > mean ? "1" : "0";
    }

    return hash;
  }

  async function getActualImageType(blob) {
    try {
      const buffer = await blob.slice(0, 8).arrayBuffer();
      const view = new DataView(buffer);

      if (view.getUint32(0) === 0x89504e47) return "png";
      if (view.getUint16(0) === 0xffd8) return "jpg";
      if (view.getUint32(0) === 0x47494638) return "gif";
      if (view.getUint32(0) === 0x52494646 && view.getUint32(4) === 0x57454250)
        return "webp";
      if (view.getUint16(0) === 0x424d) return "bmp";
      if (view.getUint32(0) === 0x49492a00) return "tiff";
      if (view.getUint32(0) === 0x4d4d002a) return "tiff";

      const text = await blob.slice(0, 100).text();
      if (text.trim().startsWith("<svg") || text.includes("<svg")) return "svg";
      if (view.getUint16(0) === 0x0000 && view.getUint16(2) === 0x0001)
        return "ico";
    } catch (error) {
      console.error("Error detecting image type:", error);
    }
    return null;
  }

  function getOriginalExtension(url) {
    const validExts = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "bmp",
      "svg",
      "ico",
      "tiff",
    ];
    const urlWithoutParams = url.split("?")[0].split("#")[0];
    const matches = urlWithoutParams.match(/\.([a-z0-9]+)$/i);

    if (matches && matches[1]) {
      const ext = matches[1].toLowerCase();
      if (validExts.includes(ext)) return ext;
      return ext;
    }
    return null;
  }

  async function downloadImage(imgElement, retryCount = 0) {
    const maxRetries = 2;
    const src = imgElement.src;

    // Handle SVG files differently
    if (
      src.toLowerCase().endsWith(".svg") ||
      src.includes("data:image/svg+xml")
    ) {
      try {
        const response = await fetch(src);
        const svgText = await response.text();
        return {
          blob: new Blob([svgText], { type: "image/svg+xml" }),
          type: "fetch",
          src,
        };
      } catch (error) {
        console.error("SVG download error:", error);
        if (retryCount < maxRetries) {
          console.log(
            `Retrying SVG download (${retryCount + 1}/${maxRetries})...`
          );
          return downloadImage(imgElement, retryCount + 1);
        }
        throw error;
      }
    }

    try {
      if (imgElement.complete && imgElement.naturalWidth > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = imgElement.naturalWidth;
        canvas.height = imgElement.naturalHeight;
        const ctx = canvas.getContext("2d");

        try {
          ctx.drawImage(imgElement, 0, 0);
          return await new Promise((resolve) => {
            canvas.toBlob((blob) => {
              if (blob) {
                resolve({ blob, type: "canvas", src });
              } else {
                throw new Error("Failed to convert image to blob");
              }
            }, "image/png");
          });
        } catch (canvasError) {
          console.log("Canvas method failed, trying FETCH:", canvasError);
        }
      }

      try {
        const response = await fetch(src, {
          mode: "cors",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });

        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);

        const blob = await response.blob();
        return { blob, type: "fetch", src };
      } catch (fetchError) {
        console.log("FETCH with CORS failed:", fetchError);

        if (retryCount < maxRetries) {
          console.log(`Retrying (${retryCount + 1}/${maxRetries})...`);
          return downloadImage(imgElement, retryCount + 1);
        } else {
          throw new Error("Failed to download image after multiple attempts");
        }
      }
    } catch (error) {
      console.error("Image download error:", error);
      throw error;
    }
  }

  function getSafeFileName(src, blobType) {
    try {
      const urlObj = new URL(src);
      const pathParts = urlObj.pathname.split("/");
      let fileName = pathParts.pop() || "image";

      // Handle SVG files specifically
      if (src.toLowerCase().endsWith(".svg")) {
        if (!fileName.toLowerCase().endsWith(".svg")) {
          fileName = fileName.split(".")[0] + ".svg";
        }
        return fileName.replace(/[^a-z0-9\-_.]/gi, "_").toLowerCase();
      }

      const originalExt = src.split(".").pop().toLowerCase().split(/[?#]/)[0];
      const validExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];

      if (validExts.includes(originalExt)) {
        if (!fileName.includes(".")) {
          fileName += `.${originalExt}`;
        } else {
          const parts = fileName.split(".");
          const ext = parts.pop();
          fileName = parts.join(".").replace(/[^a-z0-9\-_]/gi, "_") + "." + ext;
        }
      } else {
        const blobExt = blobType.split("/")[1] || "png";
        fileName = fileName.replace(/[^a-z0-9\-_]/gi, "_") + "." + blobExt;
      }

      return fileName.toLowerCase();
    } catch (e) {
      return `image_${Date.now()}.png`;
    }
  }

  function showNotification(type, title, message, details) {
    const notification = document.createElement("div");
    notification.className = `custom-notification ${type}`;
    notification.style = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      border-left: 4px solid ${type === "success" ? "#2ecc71" : "#e74c3c"};
      box-shadow: 0 3px 10px rgba(0,0,0,0.1);
      border-radius: 4px;
      padding: 15px;
      max-width: 300px;
      z-index: 10000;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 10px;">
        <svg width="24" height="24" viewBox="0 0 24 24" style="flex-shrink: 0;">
          <path fill="${type === "success" ? "#2ecc71" : "#e74c3c"}" 
                d="${
                  type === "success"
                    ? "M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"
                    : "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"
                }"/>
        </svg>
        <div>
          <div style="font-weight: bold; margin-bottom: 5px; color: ${
            type === "success" ? "#2ecc71" : "#e74c3c"
          }">
            ${title}
          </div>
          <div style="margin-bottom: 3px; font-size: 14px;">${message}</div>
          <div style="font-size: 12px; color: #7f8c8d;">${details}</div>
        </div>
      </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.transform = "translateX(0)";
    }, 10);

    setTimeout(() => {
      notification.style.transform = "translateX(100%)";
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 4000);
  }

  function openImagePreview(imageUrl) {
    const overlay = document.createElement("div");
    overlay.style = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      opacity: 0;
      transition: background 0.3s ease, opacity 0.3s ease;
    `;

    const innerDiv = document.createElement("div");
    innerDiv.style = `
      background: transparent;
      padding: 10px;
      border-radius: 8px;
      max-width: 90%;
      max-height: 90%;
      display: flex;
      flex-direction: column;
      align-items: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    const img = document.createElement("img");
    img.src = imageUrl;
    img.style = `
      max-width: 100%;
      max-height: 80vh;
      transition: transform 0.2s ease;
      user-select: none;
      cursor: grab;
      transform: scale(1);
    `;

    let scale = 1;
    img.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY || e.wheelDelta;
      scale += delta > 0 ? -0.1 : 0.1;
      scale = Math.min(Math.max(scale, 0.1), 2.5);
      img.style.transform = `scale(${scale})`;
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.style.opacity = "0";
        overlay.style.background = "rgba(0,0,0,0)";
        innerDiv.style.opacity = "0";
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        }, 300);
      }
    });

    innerDiv.appendChild(img);
    overlay.appendChild(innerDiv);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.background = "rgba(0, 0, 0, 0.58)";
      overlay.style.opacity = "1";
      innerDiv.style.opacity = "1";
    });
  }

  // Function to update image count display
  function updateImageCount() {
    const totalImages = container.querySelectorAll(".image-item").length;
    const selectedImages = container.querySelectorAll(
      ".image-item input[type=checkbox]:checked"
    ).length;
    document.getElementById(
      "image-count"
    ).textContent = `${selectedImages} صورة محددة من ${totalImages} صورة`;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  async function fetchImagesFromPage() {
    // إذا كان حفظ الصور معطلاً، لا تحفظ الصور
    if (!saveOnReloadCheckbox.checked) {
      localStorage.removeItem("downloadedImages");
    }

    return chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        function addNetNetBadgeToImages() {
          const styleId = "netnet-badge-style";
          if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
            .netnet-badge {
                position: absolute;
                top: 5px;
                right: 5px;
                user-select: none;
                background-color: rgba(48, 131, 255, 1);
                color: rgb(255 255 255);
                box-shadow: 0px 2px 5px rgba(0,0,0,0.17);
                padding: 0;
                width: 25px;
                height: 25px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 21px;
                font-size: 13px;
                line-height: 1;
                font-weight: bold;
                z-index: 2147483647;
                pointer-events: none;
            }
            .netnet-image-wrapper {
                position: relative;
                display: inline-block;
                line-height: 0;
                vertical-align: middle;
            }
            .netnet-image-wrapper img {
                display: block;
                max-width: 100%;
                height: auto;
            }
            [data-netnet-wrapper="true"] {
                contain: layout;
            }
        `;
            document.head.appendChild(style);
          }

          // معالجة الصور العادية
          document
            .querySelectorAll("img:not([data-ignore-netnet])")
            .forEach((img) => {
              // استبعاد أيقونات favicon
              const isFavicon =
                (img.width <= 16 && img.height <= 16) ||
                img.src.includes("favicon.ico") ||
                (img.parentNode &&
                  img.parentNode.tagName === "LINK" &&
                  img.parentNode.getAttribute("rel") &&
                  img.parentNode.getAttribute("rel").includes("icon"));

              if (
                !isFavicon &&
                !img.closest(".netnet-image-wrapper") &&
                img.offsetWidth > 0 &&
                img.offsetHeight > 0 &&
                window.getComputedStyle(img).display !== "none"
              ) {
                try {
                  const wrapper = document.createElement("div");
                  wrapper.className = "netnet-image-wrapper";
                  wrapper.dataset.netnetWrapper = "true";
                  wrapper.style.display = "inline-block";

                  // نسخ جميع أنماط الصورة الأصلية إلى الـ wrapper
                  const imgStyles = window.getComputedStyle(img);
                  ["margin", "padding", "border", "float"].forEach((prop) => {
                    wrapper.style[prop] = imgStyles[prop];
                  });

                  const badge = document.createElement("div");
                  badge.className = "netnet-badge";
                  badge.textContent = "✔";

                  // إزالة الهوامش والحدود من الصورة الأصلية
                  img.style.margin = "0";
                  img.style.padding = "0";
                  img.style.border = "none";
                  img.style.float = "none";

                  const parent = img.parentNode;
                  if (parent) {
                    parent.insertBefore(wrapper, img);
                    wrapper.appendChild(img);
                    wrapper.appendChild(badge);

                    // الحفاظ على أحداث وأصناف الصورة الأصلية
                    wrapper.className += " " + img.className;
                    wrapper.id = img.id + "-netnet-wrapper";
                  }
                } catch (e) {
                  console.error("Error adding badge to image:", e);
                }
              }
            });

          // معالجة صور الخلفية
          document.querySelectorAll("*").forEach((el) => {
            if (el.closest(".netnet-image-wrapper")) return;

            const bgImage = window.getComputedStyle(el).backgroundImage;
            if (bgImage && bgImage !== "none") {
              const urlMatch = bgImage.match(/url\(["']?(.*?)["']?\)/);
              if (urlMatch && urlMatch[1]) {
                let src = urlMatch[1].replace(/^["']|["']$/g, "");

                // استبعاد أيقونات favicon في الخلفيات
                const isFavicon =
                  src.includes("favicon.ico") ||
                  src.toLowerCase().includes("favicon");

                if (src.startsWith("http") && !isFavicon) {
                  const wrapper = document.createElement("div");
                  wrapper.className = "netnet-image-wrapper";
                  wrapper.dataset.netnetWrapper = "true";
                  wrapper.style.display = "inline-block";
                  wrapper.style.position = "relative";

                  const badge = document.createElement("div");
                  badge.className = "netnet-badge";
                  badge.textContent = "BG";

                  const fakeImg = document.createElement("img");
                  fakeImg.src = src;
                  fakeImg.style.display = "none";
                  fakeImg.setAttribute("data-ignore-netnet", "true");

                  document.body.appendChild(wrapper);
                  wrapper.appendChild(fakeImg);
                  wrapper.appendChild(badge);

                  // وضع الـ wrapper بالقرب من العنصر الأصلي
                  el.parentNode.insertBefore(wrapper, el.nextSibling);
                }
              }
            }
          });
        }

        function removeNetNetBadges() {
          document
            .querySelectorAll('[data-netnet-wrapper="true"]')
            .forEach((wrapper) => {
              const img = wrapper.querySelector(
                'img:not([style*="display: none"])'
              );
              if (img && wrapper.parentNode) {
                wrapper.parentNode.insertBefore(img, wrapper);
              }
              if (wrapper.parentNode) {
                wrapper.parentNode.removeChild(wrapper);
              }
            });

          const style = document.getElementById("netnet-badge-style");
          if (style && style.parentNode) {
            style.parentNode.removeChild(style);
          }
        }

        window.netnetRemoveBadges = removeNetNetBadges;
        addNetNetBadgeToImages();

        const results = [];
        const imgs = Array.from(document.images);
        imgs.forEach((img) => {
          let src = img.currentSrc || img.src || "";

          if ((!src || src.trim() === "") && img.hasAttribute("data-src")) {
            src = img.getAttribute("data-src");
          }
          if (
            (!src || src.trim() === "") &&
            img.hasAttribute("data-lazy-src")
          ) {
            src = img.getAttribute("data-lazy-src");
          }
          if (
            (!src || src.trim() === "") &&
            img.hasAttribute("data-original")
          ) {
            src = img.getAttribute("data-original");
          }

          // استبعاد أيقونات favicon
          const isFavicon =
            (img.width <= 16 && img.height <= 16) ||
            src.includes("favicon.ico") ||
            src.toLowerCase().includes("favicon") ||
            (img.parentNode &&
              img.parentNode.tagName === "LINK" &&
              img.parentNode.getAttribute("rel") &&
              img.parentNode.getAttribute("rel").includes("icon"));

          if (src && src.startsWith("http") && !isFavicon) {
            const title = (img.title || img.alt || "").trim();
            const fallbackName = src.split("/").pop().split("?")[0];
            results.push({ src, title: title || fallbackName });
          }
        });

        const elements = Array.from(document.querySelectorAll("*"));
        elements.forEach((el) => {
          const style = window.getComputedStyle(el);
          const bgImage = style.backgroundImage;

          if (bgImage && bgImage !== "none") {
            const urlMatch = bgImage.match(/url\(["']?(.*?)["']?\)/);
            if (urlMatch && urlMatch[1]) {
              let src = urlMatch[1];
              src = src.replace(/^["']|["']$/g, "");

              // استبعاد أيقونات favicon في الخلفيات
              const isFavicon =
                src.includes("favicon.ico") ||
                src.toLowerCase().includes("favicon");

              if (src.startsWith("http") && !isFavicon) {
                const title = (
                  el.title ||
                  el.getAttribute("aria-label") ||
                  ""
                ).trim();
                const fallbackName = src.split("/").pop().split("?")[0];
                results.push({
                  src,
                  title: title || fallbackName,
                  isBackground: true,
                });
              }
            }
          }
        });

        return results;
      },
    });
  }

  async function removeBadgesFromPage() {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (window.netnetRemoveBadges) {
            window.netnetRemoveBadges();
          }
        },
      });
    } catch (error) {
      console.error("Error removing badges:", error);
    }
  }

  window.addEventListener("beforeunload", () => {
    removeBadgesFromPage().catch(console.error);
  });

  function showImages(images) {
    images.forEach(({ src, title, isBackground }, index) => {
      if (document.querySelector(`input[data-url="${src}"]`)) {
        return;
      }

      const globalIndex = allImages.length + index;

      const div = document.createElement("div");
      div.className = "image-item";

      if (isBackground) {
        div.classList.add("background-image");
      }

      div.innerHTML = `
        <div id="zood"></div>
          <input type="checkbox" checked
            data-url="${src}"
            data-title="${title}"
            data-hash="" />
          <div class="image-controls">
            <button class="download-single-btn" title="تنزيل هذه الصورة">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z" />
              </svg>
            </button>
            <button class="preview-btn" title="عرض الصورة">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z" />
              </svg>
            </button>
          </div>
          <div id="saaas23">
            <img src="${src}" title="${title}" />
            <div id="saaas" data-src="${src}">
              <a href="${src}" target="_blank" style="color: #3498db; text-decoration: none; word-break: break-all;">
                ${src}
              </a>
              ${isBackground ? "(خلفية)" : ""}
            </div>
          </div>
      `;
      container.appendChild(div);

      const img = div.querySelector("img");
      img.crossOrigin = "anonymous";

      const downloadBtn = div.querySelector(".download-single-btn");
      downloadBtn.addEventListener("click", async (e) => {
        e.stopPropagation();

        const originalBtnHTML = downloadBtn.innerHTML;
        downloadBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" class="spinner">
            <path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" />
          </svg>
        `;
        downloadBtn.style.pointerEvents = "none";

        try {
          // إضافة رسالة تأكيد للتنزيل الفردي لكل الصور
          const confirmed = await customConfirm("هل تريد تنزيل هذه الصورة؟");
          if (!confirmed) {
            showNotification(
              "info",
              "تم الإلغاء",
              "لم يتم تنزيل الصورة",
              "تم إلغاء عملية التنزيل بواسطة المستخدم"
            );
            return;
          }

          const { blob, type } = await downloadImage(img);
          const fileSize = (blob.size / 1024).toFixed(2);
          const fileName = getSafeFileName(src, blob.type);

          // إظهار رسالة تأكيد إضافية لملفات SVG
          if (fileName.toLowerCase().endsWith(".svg")) {
            const svgConfirmed = await customConfirm(
              "هذه صورة SVG. هل تريد تنزيلها كملف SVG؟"
            );
            if (!svgConfirmed) {
              showNotification(
                "info",
                "تم الإلغاء",
                "لم يتم تنزيل ملف SVG",
                "تم إلغاء عملية التنزيل بواسطة المستخدم"
              );
              return;
            }
          }

          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();

          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);

          showNotification(
            "success",
            "تم التنزيل بنجاح",
            `${fileName} (${fileSize} KB)`,
            `تم التنزيل باستخدام: ${
              type === "canvas" ? "عنصر الصورة مباشرة" : "رابط الصورة"
            }`
          );
        } catch (error) {
          showNotification(
            "error",
            "فشل في التنزيل",
            error.message,
            "الرجاء المحاولة مرة أخرى"
          );
        } finally {
          downloadBtn.innerHTML = originalBtnHTML;
          downloadBtn.style.pointerEvents = "";
        }
      });

      // دالة لتطبيق/إزالة التكبير بناءً على حالة الـ checkbox
      function toggleZoom(checkbox) {
        const div = checkbox.closest(".image-item");
        if (checkbox.checked) {
          div.classList.add("zoom1");
        } else {
          div.classList.remove("zoom1");
        }
      }

      // حدث النقر على عنصر الصورة
      div.addEventListener("click", (e) => {
        // تجنب التنفيذ عند النقر على عناصر التحكم أو الـ checkbox نفسه
        if (
          e.target.tagName === "INPUT" ||
          e.target.closest(".image-controls")
        ) {
          return;
        }

        const checkbox = div.querySelector("input[type=checkbox]");
        checkbox.checked = !checkbox.checked;
        toggleZoom(checkbox);
        updateImageCount();
      });

      // حدث التغيير على الـ checkbox
      const checkbox = div.querySelector("input[type=checkbox]");
      checkbox.addEventListener("change", function () {
        toggleZoom(this);
        updateImageCount();
      });

      // التهيئة الأولية
      if (checkbox.checked) {
        div.classList.add("zoom1");
      }

      img.onload = () => {
        const hash = getPerceptualHash(img);
        const filterEnabled = filterDuplicatesCheckbox?.checked ?? false;

        let isDuplicate = false;
        if (filterEnabled) {
          for (let [existingHash, images] of imageHashes) {
            if (isSimilarImage(hash, existingHash)) {
              isDuplicate = true;
              images.push({
                id: `img-${globalIndex}`,
                src,
                title,
                element: div,
              });
              imageHashes.set(existingHash, images);
              break;
            }
          }
        }

        if (!isDuplicate) {
          imageHashes.set(hash, [
            { id: `img-${globalIndex}`, src, title, element: div },
          ]);
        }

        div.querySelector("input[type=checkbox]").dataset.hash = hash;

        if (filterEnabled && isDuplicate) {
          div.style.display = "none";
          div.querySelector("input[type=checkbox]").checked = false;
          div.classList.remove("zoom1");
        }
        updateImageCount();
      };

      img.onerror = () => {
        console.warn("Failed to load image:", src);
      };

      const previewBtn = div.querySelector(".preview-btn");
      previewBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openImagePreview(src);
      });
    });

    updateImageCount();
  }

  async function observeNewImages() {
    setInterval(async () => {
      const injectionRes = await fetchImagesFromPage();
      const newImgs = injectionRes[0].result || [];

      const existingSrcs = new Set(
        allImages.map((i) => i.src).concat(pendingImages.map((i) => i.src))
      );
      const uniqueNew = newImgs.filter((img) => !existingSrcs.has(img.src));

      if (uniqueNew.length > 0) {
        pendingImages = pendingImages.concat(uniqueNew);
        allImages = allImages.concat(pendingImages);
        showImages(pendingImages);
        pendingImages = [];

        // حفظ الصور الجديدة في localStorage إذا كان الخيار مفعلاً
        if (saveOnReloadCheckbox.checked) {
          localStorage.setItem("downloadedImages", JSON.stringify(allImages));
        }
      }
    }, 1500);
  }

  // تحميل الصور المحفوظة عند بدء التشغيل إذا كان الخيار مفعلاً
  const savedImages = saveOnReloadCheckbox.checked
    ? localStorage.getItem("downloadedImages")
    : null;
  if (savedImages) {
    allImages = JSON.parse(savedImages);
    showImages(allImages);
  }

  const injectionResults = await fetchImagesFromPage();
  if (!injectionResults || injectionResults.length === 0) {
    if (allImages.length === 0) {
      container.innerHTML =
        '<p class="xxshadow">لا توجد صور أو فشل تحميل الصور.</p>';
      document.getElementById("image-count").textContent =
        "0 صورة محددة من 0 صورة";
      setTimeout(() => {
        const xxshadowElement = document.querySelector(".xxshadow");
        if (xxshadowElement) {
          xxshadowElement.style.display = "none";
        }
      }, 500);
    }
    return;
  }

  // دمج الصور الجديدة مع المحفوظة
  const newImages = injectionResults[0].result || [];
  const existingSrcs = new Set(allImages.map((img) => img.src));
  const uniqueNew = newImages.filter((img) => !existingSrcs.has(img.src));

  if (uniqueNew.length > 0) {
    allImages = allImages.concat(uniqueNew);
    showImages(uniqueNew);
    if (saveOnReloadCheckbox.checked) {
      localStorage.setItem("downloadedImages", JSON.stringify(allImages));
    }
  }

  observeNewImages();

  // حدث النقر على زر إزالة الصور المحفوظة
  clearCacheBtn.addEventListener("click", async () => {
    const confirmed = await customConfirm(
      "هل أنت متأكد أنك تريد حذف جميع الصور المحفوظة؟ سيتم جلبها من جديد عند الحاجة."
    );

    if (confirmed) {
      // حذف البيانات المحفوظة
      localStorage.removeItem("downloadedImages");

      // إفراغ القائمة الحالية
      container.innerHTML = '<p class="xxshadow">Retrieving images...</p>';
      setTimeout(() => {
        const xxshadowElement = document.querySelector(".xxshadow");
        if (xxshadowElement) {
          xxshadowElement.style.display = "none";
        }
      }, 500);
      allImages = [];
      pendingImages = [];
      imageHashes.clear();

      // إعادة جلب الصور من الصفحة
      try {
        const injectionResults = await fetchImagesFromPage();
        allImages = injectionResults[0].result || [];

        if (allImages.length === 0) {
          container.innerHTML = '<p class="xxshadow">لا توجد صور!</p>';
        } else {
          showImages(allImages);
          if (saveOnReloadCheckbox.checked) {
            localStorage.setItem("downloadedImages", JSON.stringify(allImages));
          }
        }
      } catch (error) {
        console.error("Error fetching images:", error);
        container.innerHTML = '<p class="xxshadow">حدث خطأ أثناء جلب الصور</p>';
        setTimeout(() => {
          const xxshadowElement = document.querySelector(".xxshadow");
          if (xxshadowElement) {
            xxshadowElement.style.display = "none";
          }
        }, 500);
      }

      // إظهار إشعار بالنجاح
      showNotification(
        "success",
        "تم التحديث",
        "تمت إزالة الصور المحفوظة",
        "تم جلب الصور الجديدة بنجاح"
      );
    }
  });

  // حدث تغيير حالة حفظ الصور بعد التحديث
  saveOnReloadCheckbox.addEventListener("change", function () {
    localStorage.setItem("saveImagesEnabled", this.checked);
    if (!this.checked) {
      localStorage.removeItem("downloadedImages");
    } else if (allImages.length > 0) {
      localStorage.setItem("downloadedImages", JSON.stringify(allImages));
    }
  });

  // حدث تغيير حالة تصفية المكررات
  filterDuplicatesCheckbox.addEventListener("change", function () {
    const filterEnabled = this.checked;

    // إعادة حساب الصور الفريدة عند تفعيل/تعطيل التصفية
    const allCheckboxes = document.querySelectorAll(
      ".image-item input[type=checkbox]"
    );

    if (filterEnabled) {
      const uniqueHashes = new Set();

      allCheckboxes.forEach((checkbox) => {
        const hash = checkbox.dataset.hash;
        const imageItem = checkbox.closest(".image-item");

        if (!hash) {
          // إذا لم يكن هناك هاش، نعرض الصورة ونختارها
          imageItem.style.display = "";
          checkbox.checked = true;
          imageItem.classList.add("zoom1");
          return;
        }

        let isUnique = true;
        for (let existingHash of uniqueHashes) {
          if (isSimilarImage(hash, existingHash)) {
            isUnique = false;
            break;
          }
        }

        if (isUnique) {
          uniqueHashes.add(hash);
          imageItem.style.display = "";
          checkbox.checked = true;
          imageItem.classList.add("zoom1");
        } else {
          imageItem.style.display = "none";
          checkbox.checked = false;
          imageItem.classList.remove("zoom1");
        }
      });
    } else {
      // إذا كانت التصفية معطلة، نعرض جميع الصور ونختارها
      allCheckboxes.forEach((checkbox) => {
        const imageItem = checkbox.closest(".image-item");
        imageItem.style.display = "";
        checkbox.checked = true;
        imageItem.classList.add("zoom1");
      });
    }

    updateImageCount();
  });

  // زر تنزيل PDF
  document
    .getElementById("download-pdf-btn")
    .addEventListener("click", async function () {
      const checkboxes = document.querySelectorAll(
        "input[type=checkbox]:checked"
      );

      if (checkboxes.length === 0) {
        alert("الرجاء تحديد الصور أولاً");
        return;
      }

      // حساب عدد الصور الفريدة إذا كان خيار تصفية المكررات مفعلاً
      let totalImages = checkboxes.length;
      if (filterDuplicatesCheckbox.checked) {
        const uniqueHashes = new Set();
        totalImages = Array.from(checkboxes).filter((cb) => {
          const hash = cb.dataset.hash;
          if (!hash) return false;
          let isUnique = true;
          for (let existingHash of uniqueHashes) {
            if (isSimilarImage(hash, existingHash)) {
              isUnique = false;
              break;
            }
          }
          if (isUnique) uniqueHashes.add(hash);
          return isUnique && cb.closest(".image-item").style.display !== "none";
        }).length;
      }

      const confirmed = await customConfirm(
        `هل تريد تنزيل ${totalImages} صورة في ملف PDF؟`
      );

      if (!confirmed) return;

      const progressBar = showProgressBar();
      const cancelBtn = document.getElementById("netnet-cancel-download");
      let cancelled = false;

      cancelBtn.onclick = () => {
        cancelled = true;
        hideProgressBar();
        showNotification(
          "error",
          "تم الإلغاء",
          "تم إلغاء عملية إنشاء PDF",
          `تم معالجة ${processedCount} من ${totalImages} صور`
        );
      };

      const { jsPDF } = await jsPDFPromise;
      const doc = new jsPDF();
      let processedCount = 0;
      const failedDownloads = [];

      const processImage = async (checkbox, index) => {
        if (cancelled) return;

        const imageItem = checkbox.closest(".image-item");
        const imgElement = imageItem.querySelector("img");
        const src = imgElement.src;

        try {
          updateProgressBar(
            (index / totalImages) * 0.9,
            index + 1,
            totalImages,
            `جاري معالجة الصورة ${index + 1} من ${totalImages}`
          );

          const { blob } = await downloadImage(imgElement);
          const imgUrl = URL.createObjectURL(blob);

          await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const pageWidth = doc.internal.pageSize.getWidth();
              const pageHeight = doc.internal.pageSize.getHeight();
              const ratio =
                Math.min(pageWidth / img.width, pageHeight / img.height) * 0.9;
              const width = img.width * ratio;
              const height = img.height * ratio;

              if (index > 0) doc.addPage();
              doc.addImage(
                imgUrl,
                "JPEG",
                (pageWidth - width) / 2,
                (pageHeight - height) / 2,
                width,
                height
              );
              URL.revokeObjectURL(imgUrl);
              processedCount++;
              resolve();
            };
            img.onerror = () => {
              failedDownloads.push(src);
              resolve();
            };
            img.src = imgUrl;
          });
        } catch (err) {
          failedDownloads.push(src);
        }
      };

      // تصفية الصور المكررة إذا كان الخيار مفعلاً
      let imagesToProcess = Array.from(checkboxes);
      if (filterDuplicatesCheckbox.checked) {
        const uniqueHashes = new Set();
        imagesToProcess = Array.from(checkboxes).filter((cb) => {
          const hash = cb.dataset.hash;
          if (!hash) return false;
          let isUnique = true;
          for (let existingHash of uniqueHashes) {
            if (isSimilarImage(hash, existingHash)) {
              isUnique = false;
              break;
            }
          }
          if (isUnique) uniqueHashes.add(hash);
          return isUnique && cb.closest(".image-item").style.display !== "none";
        });
      }

      for (let i = 0; i < imagesToProcess.length; i++) {
        if (cancelled) break;
        await processImage(imagesToProcess[i], i);
      }

      if (cancelled) return;

      updateProgressBar(
        0.95,
        totalImages,
        totalImages,
        "جاري إنشاء ملف PDF..."
      );

      doc.save(`images_${new Date().getTime()}.pdf`);
      hideProgressBar();

      showNotification(
        "success",
        "تم الإنشاء بنجاح",
        `تم إنشاء ملف PDF يحتوي على ${processedCount} صورة`,
        failedDownloads.length > 0
          ? `${failedDownloads.length} صور فشل تضمينها`
          : "تم تضمين جميع الصور بنجاح"
      );
    });

  downloadBtn.addEventListener("click", async () => {
    const checkboxes = document.querySelectorAll(
      "input[type=checkbox]:checked"
    );
    if (checkboxes.length === 0) {
      alert("الرجاء تحديد الصور أولاً");
      return;
    }

    // حساب عدد الصور الفريدة إذا كان خيار تصفية المكررات مفعلاً
    let totalImages = checkboxes.length;
    if (filterDuplicatesCheckbox.checked) {
      const uniqueHashes = new Set();
      totalImages = Array.from(checkboxes).filter((cb) => {
        const hash = cb.dataset.hash;
        if (!hash) return false;
        let isUnique = true;
        for (let existingHash of uniqueHashes) {
          if (isSimilarImage(hash, existingHash)) {
            isUnique = false;
            break;
          }
        }
        if (isUnique) uniqueHashes.add(hash);
        return isUnique && cb.closest(".image-item").style.display !== "none";
      }).length;
    }

    const confirmed = await customConfirm(
      `هل تريد تنزيل ${totalImages} صورة؟\n` +
        `قد يستغرق هذا بعض الوقت حسب عدد الصور`
    );

    if (!confirmed) return;

    const progressBar = showProgressBar();
    const cancelBtn = document.getElementById("netnet-cancel-download");
    let cancelled = false;

    cancelBtn.onclick = () => {
      cancelled = true;
      hideProgressBar();
      showNotification(
        "error",
        "تم الإلغاء",
        "تم إلغاء عملية التنزيل",
        `تم تنزيل ${downloadedCount} من ${totalImages} صور`
      );
    };

    const zip = new JSZip();
    let downloadedCount = 0;
    const txtLines = [];
    const failedDownloads = [];
    const addedFiles = new Set();

    if (includeTxtCheckbox.checked) {
      txtLines.push("=== روابط الصور التي تم تنزيلها ===");
      txtLines.push(`تم تنزيل ${totalImages} صور من ${window.location.href}`);
      txtLines.push("===========================");
      txtLines.push("");
    }

    const processImage = async (checkbox, index) => {
      if (cancelled) return;

      const imageItem = checkbox.closest(".image-item");
      const imgElement = imageItem.querySelector("img");
      const src = imgElement.src;
      const title = (checkbox.dataset.title || "").trim();

      try {
        updateProgressBar(
          (index / totalImages) * 0.9,
          index + 1,
          totalImages,
          `جاري تنزيل الصورة ${index + 1} من ${totalImages}`
        );

        const { blob, type } = await downloadImage(imgElement);
        const actualType = (await getActualImageType(blob)) || "png";
        const ext = actualType === "jpg" ? "jpeg" : actualType;
        const fileName = `${index + 1}.${ext}`;

        if (!addedFiles.has(fileName)) {
          zip.file(fileName, blob);
          addedFiles.add(fileName);
          if (includeTxtCheckbox.checked) {
            txtLines.push(`${fileName}: ${src}`);
          }
          downloadedCount++;
        }

        updateProgressBar(
          ((index + 1) / totalImages) * 0.9,
          index + 1,
          totalImages
        );
      } catch (err) {
        console.error("Error downloading image:", src, err);
        failedDownloads.push(src);
        if (includeTxtCheckbox.checked) {
          txtLines.push(`[FAILED]: ${src}`);
        }
      }
    };

    // تصفية الصور المكررة إذا كان الخيار مفعلاً
    let imagesToProcess = Array.from(checkboxes);
    if (filterDuplicatesCheckbox.checked) {
      const uniqueHashes = new Set();
      imagesToProcess = Array.from(checkboxes).filter((cb) => {
        const hash = cb.dataset.hash;
        if (!hash) return false;
        let isUnique = true;
        for (let existingHash of uniqueHashes) {
          if (isSimilarImage(hash, existingHash)) {
            isUnique = false;
            break;
          }
        }
        if (isUnique) uniqueHashes.add(hash);
        return isUnique && cb.closest(".image-item").style.display !== "none";
      });
    }

    const batchSize = 5;
    for (let i = 0; i < imagesToProcess.length; i += batchSize) {
      if (cancelled) break;

      const batch = imagesToProcess.slice(i, i + batchSize);
      await Promise.all(batch.map((cb, idx) => processImage(cb, i + idx)));
    }

    if (cancelled) return;

    if (includeTxtCheckbox.checked) {
      if (failedDownloads.length > 0) {
        txtLines.push("\n=== الصور التي فشل تنزيلها ===");
        txtLines.push(...failedDownloads);
      }
      zip.file("image_links.txt", txtLines.join("\n"));
    }

    // التحقق من عدد الملفات المضافة
    if (downloadedCount !== totalImages) {
      hideProgressBar();
      showNotification(
        "error",
        "خطأ في التنزيل",
        `تم تنزيل ${downloadedCount} صورة فقط من ${totalImages} صورة محددة`,
        `فشل تنزيل ${
          totalImages - downloadedCount
        } صورة. الرجاء المحاولة مرة أخرى.`
      );
      return;
    }

    updateProgressBar(0.95, totalImages, totalImages, "جاري إنشاء ملف ZIP...");
    const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
      updateProgressBar(
        0.95 + (metadata.percent / 100) * 0.05,
        totalImages,
        totalImages
      );
    });

    updateProgressBar(1, totalImages, totalImages, "جاري التنزيل...");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = `downloaded_images_${new Date().getTime()}.zip`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      hideProgressBar();

      showNotification(
        "success",
        "تم التنزيل بنجاح",
        `تم تنزيل ${downloadedCount} من ${totalImages} صور`,
        failedDownloads.length > 0
          ? `${failedDownloads.length} صور فشل تنزيلها`
          : "تم تنزيل جميع الصور بنجاح"
      );
    }, 100);
  });

  selectAllBtn.addEventListener("click", () => {
    document
      .querySelectorAll(".image-item input[type=checkbox]")
      .forEach((cb) => {
        if (
          !filterDuplicatesCheckbox.checked ||
          cb.closest(".image-item").style.display !== "none"
        ) {
          cb.checked = true;
          cb.closest(".image-item").classList.add("zoom1");
        }
      });
    updateImageCount();
  });

  deselectAllBtn.addEventListener("click", () => {
    document
      .querySelectorAll(".image-item input[type=checkbox]")
      .forEach((cb) => {
        cb.checked = false;
        cb.closest(".image-item").classList.remove("zoom1");
      });
    updateImageCount();
  });

  searchInput.addEventListener("input", () => {
    const term = searchInput.value.toLowerCase();
    document.querySelectorAll(".image-item").forEach((item) => {
      const title = (
        item.querySelector("input[type=checkbox]").dataset.title || ""
      ).toLowerCase();
      item.style.display = title.includes(term) ? "" : "none";
    });
    updateImageCount();
  });

  let scrollInterval = null;
  let scrollSpeed = 100;

  const scrollUpBtn = document.getElementById("scroll-up");
  const scrollDownBtn = document.getElementById("scroll-down");
  const scrollSpeedSelect = document.getElementById("scroll-speed");

  // تحميل سرعة التمرير المحفوظة
  const savedScrollSpeed = localStorage.getItem("scrollSpeed");
  if (savedScrollSpeed) {
    scrollSpeedSelect.value = savedScrollSpeed;
    scrollSpeed = parseInt(savedScrollSpeed);
  }

  scrollSpeedSelect.addEventListener("change", function () {
    scrollSpeed = parseInt(this.value);
    // حفظ قيمة السرعة في localStorage
    localStorage.setItem("scrollSpeed", this.value);
  });

  function startScroll(direction) {
    stopScroll();

    const activeBtn = direction === "up" ? scrollUpBtn : scrollDownBtn;
    const otherBtn = direction === "up" ? scrollDownBtn : scrollUpBtn;

    if (activeBtn.classList.contains("zoom")) {
      activeBtn.classList.remove("zoom");
      stopScroll();
      return;
    } else {
      activeBtn.classList.add("zoom");
      otherBtn.classList.remove("zoom");
    }

    scrollInterval = setInterval(() => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (dir, speed) => {
          window.scrollBy(0, dir === "up" ? -speed : speed);
        },
        args: [direction, scrollSpeed],
      });
    }, 100);
  }

  function stopScroll() {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }

  scrollUpBtn.addEventListener("click", () => startScroll("up"));
  scrollDownBtn.addEventListener("click", () => startScroll("down"));

  document.addEventListener("click", (e) => {
    if (!scrollUpBtn.contains(e.target) && !scrollDownBtn.contains(e.target)) {
      stopScroll();
      scrollUpBtn.classList.remove("zoom");
      scrollDownBtn.classList.remove("zoom");
    }
  });
});
