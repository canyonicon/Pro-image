// تأثير الموجة للأزرار
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".Wave-cloud").forEach((btn) => {
    let ripple = null;

    const create = (e) => {
      if (ripple) return;

      const r = btn.getBoundingClientRect();
      const s = Math.max(r.width, r.height) * 0.5;

      // دعم إحداثيات اللمس
      let clientX = e.clientX,
        clientY = e.clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }

      // تعديل هنا لجعل الموجة تبدأ من 80% من الارتفاع
      const startFromTopPercentage = 0.8; // 80%
      ripple = Object.assign(document.createElement("span"), {
        className: "ripple",
        style: `width:${s}px;height:${s}px;left:${
          clientX - r.left - s / 2
        }px;top:${(clientY - r.top - s / 2) * startFromTopPercentage}px`,
      });

      btn.appendChild(ripple);
      requestAnimationFrame(() => ripple.classList.add("expand"));
    };

    const release = () => {
      if (!ripple) return;
      const current = ripple;
      ripple = null;
      setTimeout(() => {
        current.classList.add("fade-out");
        current.addEventListener(
          "transitionend",
          () => {
            if (current.parentNode) current.remove();
          },
          { once: true }
        );
      }, 400);
    };

    ["mousedown", "touchstart"].forEach((e) => btn.addEventListener(e, create));
    ["mouseup", "touchend", "mouseleave", "touchcancel"].forEach((e) =>
      btn.addEventListener(e, release)
    );
  });
});
