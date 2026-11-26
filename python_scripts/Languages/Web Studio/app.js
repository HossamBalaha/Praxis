// tags: javascript, web, formatting
// app.js — the LandingPage script. Deliberately messy: collapsed
// braces, jammed spacing, inconsistent quotes. Right-click ▸
// Auto-format JavaScript (in view OR edit mode) snaps it back.
//
// Node-safe: the DOM work is guarded, so pressing Run works even
// outside a browser (it prints the same counters the page shows).

const state = {clicks: 0, startedAt: Date.now(), countersAnimated: false};

function fmtDuration(ms) {
  return (ms / 1000).toFixed(1) + "s"
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3)
}

function animateCounter(el, target, ms) {
  const start = performance.now();

  function tick(now) {
    const t = Math.min(1, (now - start) / ms), value = Math.round(easeOut(t) * target);
    el.textContent = String(value)
    if (t < 1) {
      requestAnimationFrame(tick)
    }
  }

  requestAnimationFrame(tick)
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const cta = document.querySelector(".cta");
    if (cta) {
      cta.addEventListener("click", () => {
        state.clicks++;
        console.log("cta clicks:", state.clicks)
      })
    }
    const form = document.querySelector(".contact-form");
    if (form) {
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        alert("Noted — synthesized demo form.")
      })
    }
    document.querySelectorAll("[data-count]").forEach((el) => {
      const target = Number(el.dataset.count || "0");
      animateCounter(el, target, 900)
    });
    console.log("app.js ready — page interactive for", fmtDuration(Date.now() - state.startedAt))
  });
} else {
  console.log("app.js loaded under Node — the DOM features need the");
  console.log("browser preview (open LandingPage.html in Preview mode).");
  console.log("uptime:", fmtDuration(Date.now() - state.startedAt));
}
