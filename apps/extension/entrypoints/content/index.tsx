/** @jsxImportSource preact */
import { Copy, Download, RefreshCw } from "lucide-preact";
import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import "./style.css";

// --- Pure helpers ---

const buildOverlayPath = (rect: DOMRect | null, r = 6) => {
  const { innerWidth: vw, innerHeight: vh } = window;
  const outer = `M0,0 H${vw} V${vh} H0 Z`;
  if (!rect) return outer;

  const { top, left, width, height } = rect;
  const right = left + width;
  const bottom = top + height;

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

const cropToBlob = async (rect: DOMRect, dataUrl: string) => {
  const dpr = window.devicePixelRatio;
  const img = new Image();
  img.src = dataUrl;
  await new Promise((r) => {
    img.onload = r;
  });

  const canvas = document.createElement("canvas");
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const c = canvas.getContext("2d")!;
  c.drawImage(
    img,
    rect.left * dpr,
    rect.top * dpr,
    rect.width * dpr,
    rect.height * dpr,
    0,
    0,
    rect.width * dpr,
    rect.height * dpr,
  );

  return new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
};

const MENU_GAP = 8;
const menuLeft = (anchor: DOMRect, menuWidth = 144) =>
  anchor.right + MENU_GAP + menuWidth > window.innerWidth
    ? anchor.left - menuWidth - MENU_GAP
    : anchor.right + MENU_GAP;

const PAD = 6;
const toPaddedRect = (r: DOMRect) =>
  new DOMRect(r.x - PAD, r.y - PAD, r.width + PAD * 2, r.height + PAD * 2);

// --- Preact components ---

const MenuButton = ({
  icon,
  label,
  onClick,
}: {
  icon: preact.ComponentChild;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    class="flex items-center gap-2 w-full px-3 py-2 border-none rounded-md cursor-pointer text-xs text-gray-900 bg-transparent hover:bg-gray-100"
    onClick={onClick}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const App = ({ onClose }: { onClose: () => void }) => {
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const currentTargetRef = useRef<Element | null>(null);
  const capturedOriginalRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    document.documentElement.style.cursor = "crosshair";
    return () => {
      document.documentElement.style.cursor = "";
    };
  }, []);

  const startListening = () => {
    const controller = new AbortController();
    const { signal } = controller;

    let dragging = false;
    let dragStart: { x: number; y: number } | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    const capture = (rect: DOMRect) => {
      capturedOriginalRectRef.current = rect;
      playCaptureSound();
      controller.abort();
      browser.runtime.sendMessage({ type: "capture" }).then((response) => {
        if (response.error) {
          capturedOriginalRectRef.current = null;
          return;
        }
        setCapturedDataUrl(response.dataUrl);
      });
    };

    const toDragRect = (x: number, y: number) =>
      new DOMRect(
        Math.min(dragStart!.x, x),
        Math.min(dragStart!.y, y),
        Math.abs(x - dragStart!.x),
        Math.abs(y - dragStart!.y),
      );

    document.addEventListener(
      "mousemove",
      (e: MouseEvent) => {
        if (dragging && dragStart) {
          setHighlightRect(toDragRect(e.clientX, e.clientY));
          return;
        }
        if (dragStart) return;
        const target = document
          .elementsFromPoint(e.clientX, e.clientY)
          .find((el) => el.localName !== "cptr-overlay");
        if (!target || target === currentTargetRef.current) return;
        currentTargetRef.current = target;
        setHighlightRect(toPaddedRect(target.getBoundingClientRect()));
      },
      { capture: true, signal },
    );

    document.addEventListener(
      "mousedown",
      (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragStart = { x: e.clientX, y: e.clientY };
        holdTimer = setTimeout(() => {
          dragging = true;
          setIsDragging(true);
        }, 200);
      },
      { capture: true, signal },
    );

    document.addEventListener(
      "mouseup",
      (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        if (dragging && dragStart) {
          const rect = toDragRect(e.clientX, e.clientY);
          if (rect.width > 5 && rect.height > 5) {
            capture(rect);
          }
          dragging = false;
          dragStart = null;
          setIsDragging(false);
          return;
        }
        dragStart = null;
        if (!currentTargetRef.current) return;
        capture(currentTargetRef.current.getBoundingClientRect());
      },
      { capture: true, signal },
    );

    return controller;
  };

  useEffect(() => {
    const controller = startListening();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [onClose]);

  const handleCopy = async () => {
    if (!capturedOriginalRectRef.current || !capturedDataUrl) return;

    const blob = await cropToBlob(capturedOriginalRectRef.current, capturedDataUrl);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    if (!capturedOriginalRectRef.current || !capturedDataUrl) return;

    const blob = await cropToBlob(capturedOriginalRectRef.current, capturedDataUrl);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cptr-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
    setCopied(false);
    setIsDragging(false);
    currentTargetRef.current = null;
    capturedOriginalRectRef.current = null;
    startListening();
  };

  return (
    <div class="fixed inset-0 z-[2147483646] pointer-events-none">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions -- overlay backdrop, keyboard handled via document keydown */}
      <svg
        width="100%"
        height="100%"
        class={`fixed inset-0 pointer-events-auto opacity-100 transition-opacity duration-150 ease-out ${capturedDataUrl ? "cursor-default" : ""}`}
        onClick={capturedDataUrl ? onClose : undefined}
      >
        <path
          class={`fill-black/30 ${isDragging ? "" : "transition-[d] duration-100 ease-out"}`}
          fill-rule="evenodd"
          style={{ d: `path("${buildOverlayPath(highlightRect)}")` }}
        />
      </svg>

      {highlightRect && (
        <div
          class={`fixed pointer-events-none rounded-md shadow-lg overflow-hidden ${isDragging ? "" : "transition-all duration-100 ease-out"}`}
          style={{
            top: `${highlightRect.top}px`,
            left: `${highlightRect.left}px`,
            width: `${highlightRect.width}px`,
            height: `${highlightRect.height}px`,
          }}
        >
          {capturedDataUrl && capturedOriginalRectRef.current && (
            <img
              src={capturedDataUrl}
              alt=""
              class="block max-w-none"
              style={{
                width: `${window.innerWidth}px`,
                height: `${window.innerHeight}px`,
                marginTop: `${-highlightRect.top}px`,
                marginLeft: `${-highlightRect.left}px`,
              }}
            />
          )}
        </div>
      )}

      {capturedDataUrl && highlightRect && (
        <div
          class="fixed pointer-events-auto bg-white rounded-lg p-1 min-w-36 font-sans text-xs shadow-2xl"
          style={{
            top: `${Math.max(0, highlightRect.top)}px`,
            left: `${menuLeft(highlightRect)}px`,
          }}
        >
          <MenuButton
            icon={<Copy size={16} />}
            label={copied ? "Copied!" : "Copy"}
            onClick={handleCopy}
          />
          <MenuButton icon={<Download size={16} />} label="Save" onClick={handleSave} />
          <MenuButton icon={<RefreshCw size={16} />} label="Retake" onClick={handleRetake} />
        </div>
      )}
    </div>
  );
};

// --- Content Script entrypoint ---

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "cptr-overlay",
      position: "inline",
      anchor: "body",
      onMount: (container) => {
        render(<App onClose={() => ui.remove()} />, container);
        return container;
      },
      onRemove: (container) => {
        if (container) render(null, container);
      },
    });

    browser.runtime.onMessage.addListener((message) => {
      if (message.type !== "toggle-capture") return;
      if (ui.mounted) {
        ui.remove();
      } else {
        ui.mount();
      }
    });

    ctx.onInvalidated(() => {
      if (ui.mounted) ui.remove();
    });
  },
});
