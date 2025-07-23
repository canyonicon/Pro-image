// عند النقر على أي زر show-btn
document.querySelectorAll(".show-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-id");
    const div = document.getElementById("div-" + id);

    // إخفاء جميع الديفات الأخرى
    document.querySelectorAll("[id^='div-']").forEach((otherDiv) => {
      if (otherDiv !== div) {
        otherDiv.style.display = "none";
      }
    });

    // إزالة كلاس xoox من جميع الأزرار الأخرى
    document.querySelectorAll(".show-btn").forEach((otherBtn) => {
      if (otherBtn !== btn) {
        otherBtn.classList.remove("xoox");
      }
    });

    if (div.style.display === "block") {
      // إذا كان ظاهرًا، نخفيه
      div.style.display = "none";
      btn.classList.remove("xoox");
    } else {
      // إذا كان مخفيًا، نظهره
      div.style.display = "block";
      btn.classList.add("xoox");
    }
  });
});

// عند النقر على أي زر close-btn
document.querySelectorAll(".close-btn").forEach((closeBtn) => {
  closeBtn.addEventListener("click", () => {
    const div = closeBtn.parentElement;
    div.style.display = "none";

    // إزالة الكلاس xoox من الزر المرتبط بنفس الـ div
    const divId = div.id.split("-")[1];
    const relatedBtn = document.querySelector(`.show-btn[data-id="${divId}"]`);
    if (relatedBtn) {
      relatedBtn.classList.remove("xoox");
    }
  });
});






document.addEventListener("DOMContentLoaded", async () => {
  const checkbox = document.getElementById("toggleVex");

  // عند تحميل الصفحة: تحقق من القيمة المخزنة في localStorage
  window.addEventListener("DOMContentLoaded", () => {
    const isVexEnabled = localStorage.getItem("vexEnabled") === "true";
    checkbox.checked = isVexEnabled;
    document.body.id = isVexEnabled ? "vex" : "";
  });

  // عند النقر على الـ checkbox: أضف أو أزل id وحدث localStorage
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      document.body.id = "vex";
      localStorage.setItem("vexEnabled", "true");
    } else {
      document.body.removeAttribute("id");
      localStorage.setItem("vexEnabled", "false");
    }
  });
});


document.addEventListener("DOMContentLoaded", () => {
  const checkbox = document.getElementById("zoom-toggle");

  const applyZoom = (enabled) => {
    const imageItems = document.querySelectorAll(".images-container");
    imageItems.forEach((item) => {
      item.classList.toggle("zoom-x", enabled);
    });
  };

  const isChecked = localStorage.getItem("zoomEnabled") === "true";
  checkbox.checked = isChecked;
  applyZoom(isChecked);

  checkbox.addEventListener("change", function () {
    localStorage.setItem("zoomEnabled", this.checked);
    applyZoom(this.checked);
  });
});




document.addEventListener("DOMContentLoaded", () => {
const checkbox = document.getElementById("theme-toggle");
const body = document.body;

// استرجاع الوضع من localStorage
if (localStorage.getItem("theme") === "dark") {
  body.classList.add("dark-mode");
  checkbox.checked = true;
}

checkbox.addEventListener("change", () => {
  if (checkbox.checked) {
    body.classList.add("dark-mode");
    localStorage.setItem("theme", "dark");
  } else {
    body.classList.remove("dark-mode");
    localStorage.setItem("theme", "light");
  }
});
});

