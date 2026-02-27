export default defineContentScript({
  matches: ["<all_urls>"],
  main(ctx) {
    let active = false;
    let menuVisible = false;
    let hostEl: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let svgEl: SVGSVGElement | null = null;
    let pathEl: SVGPathElement | null = null;
    let highlightEl: HTMLDivElement | null = null;
    let menuEl: HTMLDivElement | null = null;
    let copyBtnLabelEl: HTMLSpanElement | null = null;
    let currentTarget: Element | null = null;
    let capturedRect: DOMRect | null = null;
    let capturedOriginalRect: DOMRect | null = null;
    let capturedDataUrl: string | null = null;

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

    const createMenu = () => {
      if (!shadow) return null!;

      const menu = document.createElement("div");
      menu.style.cssText =
        "position: fixed; pointer-events: auto; background: white; border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16); padding: 4px; min-width: 140px; display: none; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px;";

      const copyBtn = document.createElement("button");
      const label = document.createElement("span");
      label.style.marginLeft = "8px";
      label.textContent = "Copy";
      copyBtnLabelEl = label;

      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("width", "16");
      icon.setAttribute("height", "16");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "2");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.innerHTML = `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`;

      copyBtn.appendChild(icon);
      copyBtn.appendChild(label);
      copyBtn.style.cssText =
        "display: flex; align-items: center; width: 100%; padding: 8px 12px; border: none; background: none; border-radius: 6px; cursor: pointer; font-size: 13px; color: #1a1a1a;";
      copyBtn.addEventListener("mouseenter", () => {
        copyBtn.style.background = "#f5f5f5";
      });
      copyBtn.addEventListener("mouseleave", () => {
        copyBtn.style.background = "none";
      });
      copyBtn.addEventListener("click", handleCopy);

      menu.appendChild(copyBtn);
      shadow.appendChild(menu);
      return menu;
    };

    const showMenu = (rect: DOMRect) => {
      if (!menuEl) menuEl = createMenu();
      if (!menuEl) return;

      const menuWidth = 140;
      const menuGap = 8;
      let left = rect.right + menuGap;
      let top = rect.top;

      // 右に収まらない場合は左に表示
      if (left + menuWidth > window.innerWidth) {
        left = rect.left - menuWidth - menuGap;
      }
      // 上に収まらない場合は下にずらす
      if (top < 0) top = 0;

      menuEl.style.top = `${top}px`;
      menuEl.style.left = `${left}px`;
      menuEl.style.display = "block";
      menuVisible = true;
    };

    const playCaptureSound = () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
      osc.onended = () => ctx.close();
    };

    const handleCopy = async () => {
      if (!capturedOriginalRect || !capturedDataUrl) return;

      const rect = capturedOriginalRect;
      const dpr = window.devicePixelRatio;
      const img = new Image();
      img.src = capturedDataUrl;
      await new Promise((r) => { img.onload = r; });

      const canvas = document.createElement("canvas");
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const c = canvas.getContext("2d")!;
      c.drawImage(img, rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr, 0, 0, rect.width * dpr, rect.height * dpr);

      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);

      if (copyBtnLabelEl) {
        copyBtnLabelEl.textContent = "Copied!";
        setTimeout(() => {
          if (copyBtnLabelEl) copyBtnLabelEl.textContent = "Copy";
        }, 1500);
      }
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
      if (menuVisible) return;
      const target = getElementAtPoint(e.clientX, e.clientY);
      if (!target || target === currentTarget) return;
      currentTarget = target;
      updateHighlight(target);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") deactivate();
    };

    const captureAndShowMenu = async (target: Element) => {
      if (!hostEl) return;

      const r = target.getBoundingClientRect();
      capturedOriginalRect = r;
      capturedRect = new DOMRect(
        r.x - pad,
        r.y - pad,
        r.width + pad * 2,
        r.height + pad * 2,
      );

      // くり抜き内は元のページが見えているのでそのままキャプチャ
      playCaptureSound();
      const response = await browser.runtime.sendMessage({ type: "capture" });

      if (response.error) return;
      capturedDataUrl = response.dataUrl;

      document.removeEventListener("mousemove", onMouseMove, true);
      showMenu(capturedRect);
    };

    const onClick = (e: MouseEvent) => {
      // Shadow DOM内（メニュー）のクリックはそのまま通す
      if (e.target === hostEl) return;

      e.preventDefault();
      e.stopPropagation();

      if (menuVisible) {
        deactivate();
        return;
      }

      if (!currentTarget) return;
      captureAndShowMenu(currentTarget);
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
      menuVisible = false;
      capturedRect = null;
      capturedOriginalRect = null;
      capturedDataUrl = null;
      if (menuEl) menuEl.style.display = "none";
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
