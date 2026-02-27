export default defineContentScript({
  matches: ["<all_urls>"],
  main(ctx) {
    let active = false;
    let svgEl: SVGSVGElement | null = null;
    let pathEl: SVGPathElement | null = null;
    let highlightEl: HTMLDivElement | null = null;
    let currentTarget: Element | null = null;

    const createOverlaySvg = () => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.style.cssText = [
        "position: fixed",
        "inset: 0",
        "z-index: 2147483646",
        "pointer-events: none",
        "transition: opacity 150ms ease-out",
      ].join(";");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "rgba(0, 0, 0, 0.3)");
      path.setAttribute("fill-rule", "evenodd");
      path.setAttribute("d", `M0,0 H${window.innerWidth} V${window.innerHeight} H0 Z`);

      svg.appendChild(path);
      document.documentElement.appendChild(svg);
      return { svg, path };
    };

    const createHighlight = () => {
      const el = document.createElement("div");
      el.style.cssText = [
        "position: fixed",
        "pointer-events: none",
        "z-index: 2147483647",
        "border: 2px solid rgba(59, 130, 246, 0.6)",
        "border-radius: 4px",
        "transition: all 80ms ease-out",
      ].join(";");
      document.documentElement.appendChild(el);
      return el;
    };

    const buildOverlayPath = (rect: DOMRect, r = 4) => {
      const { innerWidth: vw, innerHeight: vh } = window;
      const { top, left, width, height } = rect;
      const right = left + width;
      const bottom = top + height;

      // 外側（画面全体）+ 内側（くり抜き、角丸付き、反時計回り）
      return [
        `M0,0 H${vw} V${vh} H0 Z`,
        `M${left + r},${top}`,
        `H${right - r}`,
        `a${r},${r} 0 0 1 ${r},${r}`,
        `V${bottom - r}`,
        `a${r},${r} 0 0 1 -${r},${r}`,
        `H${left + r}`,
        `a${r},${r} 0 0 1 -${r},-${r}`,
        `V${top + r}`,
        `a${r},${r} 0 0 1 ${r},-${r}`,
        "Z",
      ].join(" ");
    };

    const updateHighlight = (target: Element) => {
      if (!highlightEl) highlightEl = createHighlight();
      if (!pathEl) return;

      const rect = target.getBoundingClientRect();
      pathEl.setAttribute("d", buildOverlayPath(rect));

      highlightEl.style.top = `${rect.top}px`;
      highlightEl.style.left = `${rect.left}px`;
      highlightEl.style.width = `${rect.width}px`;
      highlightEl.style.height = `${rect.height}px`;
      highlightEl.style.display = "block";
    };

    const hideHighlight = () => {
      if (highlightEl) highlightEl.style.display = "none";
      if (pathEl) {
        const { innerWidth: vw, innerHeight: vh } = window;
        pathEl.setAttribute("d", `M0,0 H${vw} V${vh} H0 Z`);
      }
      currentTarget = null;
    };

    const getElementAtPoint = (x: number, y: number) => {
      if (svgEl) svgEl.style.display = "none";
      if (highlightEl) highlightEl.style.display = "none";
      const el = document.elementFromPoint(x, y);
      if (svgEl) svgEl.style.display = "";
      if (highlightEl) highlightEl.style.display = "";
      return el;
    };

    const onMouseMove = (e: MouseEvent) => {
      const target = getElementAtPoint(e.clientX, e.clientY);
      if (!target || target === currentTarget) return;
      currentTarget = target;
      updateHighlight(target);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") deactivate();
    };

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // キャプチャは次のステップで実装
    };

    const activate = () => {
      active = true;
      if (!svgEl) {
        const overlay = createOverlaySvg();
        svgEl = overlay.svg;
        pathEl = overlay.path;
      }
      svgEl.style.opacity = "1";
      document.documentElement.style.cursor = "crosshair";
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("click", onClick, true);
    };

    const deactivate = () => {
      active = false;
      if (svgEl) svgEl.style.opacity = "0";
      document.documentElement.style.cursor = "";
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("click", onClick, true);
      hideHighlight();
    };

    browser.runtime.onMessage.addListener((message) => {
      if (message.type !== "toggle-capture") return;
      if (active) deactivate();
      else activate();
    });

    ctx.onInvalidated(() => {
      if (active) deactivate();
      svgEl?.remove();
      highlightEl?.remove();
    });
  },
});
