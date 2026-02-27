export default defineContentScript({
  matches: ["<all_urls>"],
  main(ctx) {
    let active = false;
    let hostEl: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let svgEl: SVGSVGElement | null = null;
    let pathEl: SVGPathElement | null = null;
    let highlightEl: HTMLDivElement | null = null;
    let currentTarget: Element | null = null;

    const createHost = () => {
      const host = document.createElement("div");
      host.style.cssText = "position: fixed; inset: 0; z-index: 2147483646; pointer-events: none;";
      const root = host.attachShadow({ mode: "closed" });
      document.documentElement.appendChild(host);
      return { host, root };
    };

    const createOverlaySvg = () => {
      if (!shadow) return { svg: null!, path: null! };

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.style.cssText =
        "position: fixed; inset: 0; transition: opacity 150ms ease-out;";

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "rgba(0, 0, 0, 0.3)");
      path.setAttribute("fill-rule", "evenodd");
      path.style.d = `path("${buildOverlayPath(null)}")`;
      path.style.transition = "d 100ms ease-out";

      svg.appendChild(path);
      shadow.appendChild(svg);
      return { svg, path };
    };

    const createHighlight = () => {
      if (!shadow) return null!;

      const el = document.createElement("div");
      el.style.cssText =
        "position: fixed; pointer-events: none; border-radius: 6px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12); transition: top 100ms ease-out, left 100ms ease-out, width 100ms ease-out, height 100ms ease-out;";
      shadow.appendChild(el);
      return el;
    };

    const buildOverlayPath = (rect: DOMRect | null, r = 6) => {
      const { innerWidth: vw, innerHeight: vh } = window;
      const outer = `M0,0 H${vw} V${vh} H0 Z`;
      if (!rect) return outer;

      const { top, left, width, height } = rect;
      const right = left + width;
      const bottom = top + height;

      // 外側（画面全体）+ 内側（くり抜き、角丸付き、反時計回り）
      return [
        outer,
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

    const pad = 6;

    const updateHighlight = (target: Element) => {
      if (!highlightEl) highlightEl = createHighlight();
      if (!pathEl) return;

      const r = target.getBoundingClientRect();
      const padded = new DOMRect(
        r.x - pad,
        r.y - pad,
        r.width + pad * 2,
        r.height + pad * 2,
      );
      pathEl.style.d = `path("${buildOverlayPath(padded)}")`;

      highlightEl.style.top = `${padded.top}px`;
      highlightEl.style.left = `${padded.left}px`;
      highlightEl.style.width = `${padded.width}px`;
      highlightEl.style.height = `${padded.height}px`;
      highlightEl.style.display = "block";
    };

    const hideHighlight = () => {
      if (highlightEl) highlightEl.style.display = "none";
      if (pathEl) {
        pathEl.style.d = `path("${buildOverlayPath(null)}")`;
      }
      currentTarget = null;
    };

    const getElementAtPoint = (x: number, y: number) =>
      document
        .elementsFromPoint(x, y)
        .find((el) => el !== hostEl) ?? null;

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
      if (!hostEl) {
        const { host, root } = createHost();
        hostEl = host;
        shadow = root;
        const overlay = createOverlaySvg();
        svgEl = overlay.svg;
        pathEl = overlay.path;
      }
      if (svgEl) svgEl.style.opacity = "1";
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
      hostEl?.remove();
    });
  },
});
