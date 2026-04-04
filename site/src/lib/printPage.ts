/**
 * OrbitUMD branded print helper.
 * Injects a header with the Orbit logo and a footer with timestamp,
 * calls window.print(), then cleans up the injected elements.
 */

const ORBIT_LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="14" fill="#C62828"/>
  <ellipse cx="50" cy="50" rx="44" ry="18" transform="rotate(-30 50 50)" stroke="#C62828" stroke-width="2" fill="none" stroke-opacity="0.5"/>
  <circle cx="80" cy="28" r="5" fill="#FFA000"/>
</svg>`;

export function printPage(subtitle?: string) {
  // Build header
  const header = document.createElement("div");
  header.className = "orbit-print-header";
  header.innerHTML = `
    ${ORBIT_LOGO_SVG}
    <div class="orbit-print-header-text">
      <div class="orbit-print-header-title"><span>Orbit</span>UMD</div>
      <div class="orbit-print-header-sub">${subtitle ?? ""}${subtitle ? " · " : ""}Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
    </div>
  `;

  // Build footer
  const footer = document.createElement("div");
  footer.className = "orbit-print-footer";
  footer.textContent = `OrbitUMD · ${window.location.href} · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  // Find the best insertion point
  const main = document.querySelector(".orbit-shell main") ?? document.querySelector("main") ?? document.body;
  const firstChild = main.firstChild;

  main.insertBefore(header, firstChild);
  main.appendChild(footer);

  // Small delay to let the DOM settle for paint
  requestAnimationFrame(() => {
    window.print();

    // Cleanup after print dialog closes
    const cleanup = () => {
      header.remove();
      footer.remove();
    };

    // Most browsers fire afterprint; fallback with timeout
    window.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(cleanup, 2000);
  });
}
