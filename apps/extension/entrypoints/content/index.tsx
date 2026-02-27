/** @jsxImportSource preact */
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
    rect.height * dpr
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

const CopyIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const SaveIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

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

  const currentTargetRef = useRef<Element | null>(null);
  const capturedOriginalRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    document.documentElement.style.cursor = "crosshair";
    return () => {
      document.documentElement.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    document.addEventListener(
      "mousemove",
      (e: MouseEvent) => {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        if (!target || target === currentTargetRef.current) return;
        currentTargetRef.current = target;
        setHighlightRect(toPaddedRect(target.getBoundingClientRect()));
      },
      { capture: true, signal }
    );

    document.addEventListener(
      "click",
      (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentTargetRef.current) return;
        const r = currentTargetRef.current.getBoundingClientRect();
        capturedOriginalRectRef.current = r;

        playCaptureSound();
        browser.runtime.sendMessage({ type: "capture" }).then((response) => {
          if (response.error) return;
          controller.abort();
          setCapturedDataUrl(response.dataUrl);
        });
      },
      { capture: true, signal }
    );

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

    const blob = await cropToBlob(
      capturedOriginalRectRef.current,
      capturedDataUrl
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    if (!capturedOriginalRectRef.current || !capturedDataUrl) return;

    const blob = await cropToBlob(
      capturedOriginalRectRef.current,
      capturedDataUrl
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cptr-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);

  };

  return (
    <div class="fixed inset-0 z-[2147483646] pointer-events-none">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions -- overlay backdrop, keyboard handled via document keydown */}
      <svg
        width="100%"
        height="100%"
        class={`fixed inset-0 opacity-100 transition-opacity duration-150 ease-out ${capturedDataUrl ? "pointer-events-auto cursor-default" : ""}`}
        onClick={capturedDataUrl ? onClose : undefined}
      >
        <path
          class="fill-black/30 transition-[d] duration-100 ease-out"
          fill-rule="evenodd"
          style={{ d: `path("${buildOverlayPath(highlightRect)}")` }}
        />
      </svg>

      {highlightRect && (
        <div
          class="fixed pointer-events-none rounded-md shadow-lg transition-all duration-100 ease-out overflow-hidden"
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
                marginTop: `${-capturedOriginalRectRef.current.top + PAD}px`,
                marginLeft: `${-capturedOriginalRectRef.current.left + PAD}px`,
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
            icon={<CopyIcon />}
            label={copied ? "Copied!" : "Copy"}
            onClick={handleCopy}
          />
          <MenuButton
            icon={<SaveIcon />}
            label="Save"
            onClick={handleSave}
          />
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
        render(
          <App onClose={() => ui.remove()} />,
          container
        );
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
