/** @jsxImportSource preact */
import {
  Copy,
  Download,
  MousePointer2,
  MoveRight,
  PaintBucket,
  RefreshCw,
  Square,
  Type,
} from "lucide-preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { playCaptureSound } from "../../sound";

// --- Annotation model ---

type AnnotationTool = "select" | "arrow" | "text" | "rect";

type Annotation = {
  tool: AnnotationTool;
  color: string;
  filled: boolean;
  start: Point;
  end: Point;
  text?: string;
};

type Point = { x: number; y: number };

const COLORS = ["#FF3B30", "#000000", "#FFFFFF", "#007AFF"];

// --- Hit test ---

const distanceToLine = (a: Point, b: Point, p: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

const TEXT_BOX_W = 200;
const TEXT_BOX_H = 24;

const hitTestRectEdges = (start: Point, end: Point, p: Point, tolerance: number): boolean => {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const top = distanceToLine({ x: minX, y: minY }, { x: maxX, y: minY }, p);
  const bottom = distanceToLine({ x: minX, y: maxY }, { x: maxX, y: maxY }, p);
  const left = distanceToLine({ x: minX, y: minY }, { x: minX, y: maxY }, p);
  const right = distanceToLine({ x: maxX, y: minY }, { x: maxX, y: maxY }, p);
  return Math.min(top, bottom, left, right) < tolerance;
};

const hitTest = (a: Annotation, point: Point, tolerance = 6): boolean => {
  switch (a.tool) {
    case "arrow":
      return distanceToLine(a.start, a.end, point) < tolerance;
    case "text":
      return (
        point.x >= a.start.x &&
        point.x <= a.start.x + TEXT_BOX_W &&
        point.y >= a.start.y &&
        point.y <= a.start.y + TEXT_BOX_H
      );
    case "rect":
      if (a.filled) {
        const minX = Math.min(a.start.x, a.end.x);
        const maxX = Math.max(a.start.x, a.end.x);
        const minY = Math.min(a.start.y, a.end.y);
        const maxY = Math.max(a.start.y, a.end.y);
        return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
      }
      return hitTestRectEdges(a.start, a.end, point, tolerance);
    default:
      return false;
  }
};

// --- Drawing ---

const drawArrow = (ctx: CanvasRenderingContext2D, start: Point, end: Point, color: string) => {
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = 12;
  const headAngle = Math.PI / 6;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - headAngle),
    end.y - headLength * Math.sin(angle - headAngle),
  );
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + headAngle),
    end.y - headLength * Math.sin(angle + headAngle),
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
};

const TEXT_FONT_SIZE = 16;

const drawText = (ctx: CanvasRenderingContext2D, a: Annotation, fontSize = TEXT_FONT_SIZE) => {
  if (!a.text) return;
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = a.color;
  ctx.fillText(a.text, a.start.x, a.start.y + fontSize);
};

const drawRect = (ctx: CanvasRenderingContext2D, a: Annotation) => {
  const x = Math.min(a.start.x, a.end.x);
  const y = Math.min(a.start.y, a.end.y);
  const w = Math.abs(a.end.x - a.start.x);
  const h = Math.abs(a.end.y - a.start.y);
  if (a.filled) {
    ctx.fillStyle = a.color;
    ctx.fillRect(x, y, w, h);
  } else {
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
};

const drawAnnotation = (ctx: CanvasRenderingContext2D, a: Annotation) => {
  switch (a.tool) {
    case "arrow":
      drawArrow(ctx, a.start, a.end, a.color);
      break;
    case "text":
      drawText(ctx, a);
      break;
    case "rect":
      drawRect(ctx, a);
      break;
  }
};

const drawSelectionHandles = (ctx: CanvasRenderingContext2D, a: Annotation) => {
  if (a.tool === "text") {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#007AFF";
    ctx.lineWidth = 1;
    ctx.strokeRect(a.start.x - 2, a.start.y - 2, TEXT_BOX_W + 4, TEXT_BOX_H + 4);
    ctx.setLineDash([]);
    return;
  }
  for (const p of [a.start, a.end]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#007AFF";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
};

// --- Helpers ---

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });

const toCanvasPos = (e: MouseEvent, canvas: HTMLCanvasElement): Point => {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

// --- Overlay helpers ---

const buildOverlayPath = (
  rect: DOMRect | null,
  viewport: { width: number; height: number },
  r = 6,
) => {
  const outer = `M0,0 H${viewport.width} V${viewport.height} H0 Z`;
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

const MENU_GAP = 8;
const menuLeft = (anchor: DOMRect, viewportWidth: number, menuWidth = 160) =>
  anchor.right + MENU_GAP + menuWidth > viewportWidth
    ? anchor.left - menuWidth - MENU_GAP
    : anchor.right + MENU_GAP;

const PAD = 6;
const toPaddedRect = (r: DOMRect) =>
  new DOMRect(r.x - PAD, r.y - PAD, r.width + PAD * 2, r.height + PAD * 2);

// --- Component ---

const TOOLS: { tool: AnnotationTool; icon: preact.ComponentChild }[] = [
  { tool: "select", icon: <MousePointer2 size={14} /> },
  { tool: "arrow", icon: <MoveRight size={14} /> },
  { tool: "text", icon: <Type size={14} /> },
  { tool: "rect", icon: <Square size={14} /> },
];

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

export const App = ({ onClose }: { onClose: () => void }) => {
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const currentTargetRef = useRef<Element | null>(null);

  // Annotation state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [activeTool, setActiveTool] = useState<AnnotationTool>("arrow");
  const activeToolRef = useRef<AnnotationTool>("arrow");
  activeToolRef.current = activeTool;
  const [activeColor, setActiveColor] = useState(COLORS[0]);
  const activeColorRef = useRef(COLORS[0]);
  activeColorRef.current = activeColor;
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeAnnotationRef = useRef<Annotation | null>(null);
  const dragRef = useRef<
    { type: "move"; origin: Point } | { type: "resizeStart" | "resizeEnd"; origin: Point } | null
  >(null);
  const [editingText, setEditingText] = useState<{ pos: Point; value: string } | null>(null);
  const editingTextRef = useRef<{ pos: Point; value: string } | null>(null);
  editingTextRef.current = editingText;
  const [rectFilled, setRectFilled] = useState(false);
  const rectFilledRef = useRef(false);
  rectFilledRef.current = rectFilled;

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
      setHighlightRect(rect);
      playCaptureSound();
      controller.abort();
      document.documentElement.style.cursor = "";
      browser.runtime.sendMessage({ type: "capture" }).then((response) => {
        if (response.error) return;
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

  // Load image for canvas drawing
  useEffect(() => {
    if (!capturedDataUrl) return;
    loadImage(capturedDataUrl).then((img) => {
      imageRef.current = img;
      setImageReady(true);
    });
  }, [capturedDataUrl]);

  // --- Canvas drawing ---

  const redraw = useCallback(
    (extraAnnotation?: Annotation | null, highlightIdx?: number | null) => {
      const canvas = canvasRef.current;
      const img = imageRef.current;
      if (!canvas || !img || !highlightRect) return;

      const dpr = window.devicePixelRatio;
      const displayW = highlightRect.width;
      const displayH = highlightRect.height;
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);

      // Base image (crop from screenshot)
      ctx.drawImage(
        img,
        highlightRect.left * dpr,
        highlightRect.top * dpr,
        highlightRect.width * dpr,
        highlightRect.height * dpr,
        0,
        0,
        displayW,
        displayH,
      );

      for (const a of annotations) drawAnnotation(ctx, a);
      if (extraAnnotation) drawAnnotation(ctx, extraAnnotation);

      const si = highlightIdx ?? selectedIndex;
      if (si !== null && si !== undefined && annotations[si]) {
        drawSelectionHandles(ctx, annotations[si]);
      }
    },
    [annotations, highlightRect, selectedIndex],
  );

  useEffect(() => {
    if (imageReady) redraw();
  }, [imageReady, annotations, selectedIndex, redraw]);

  // --- Canvas mouse handlers ---

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageReady) return;

    const controller = new AbortController();
    const { signal } = controller;

    const handleMouseDown = (e: MouseEvent) => {
      const pos = toCanvasPos(e, canvas);
      const tool = activeToolRef.current;
      const color = activeColorRef.current;

      if (tool === "select") {
        if (selectedIndex !== null && annotations[selectedIndex]) {
          const sel = annotations[selectedIndex];
          if (Math.hypot(pos.x - sel.start.x, pos.y - sel.start.y) < 8) {
            dragRef.current = { type: "resizeStart", origin: pos };
            return;
          }
          if (Math.hypot(pos.x - sel.end.x, pos.y - sel.end.y) < 8) {
            dragRef.current = { type: "resizeEnd", origin: pos };
            return;
          }
        }
        for (let i = annotations.length - 1; i >= 0; i--) {
          if (hitTest(annotations[i], pos)) {
            setSelectedIndex(i);
            dragRef.current = { type: "move", origin: pos };
            return;
          }
        }
        setSelectedIndex(null);
        return;
      }

      setSelectedIndex(null);

      if (tool === "text") {
        if (editingTextRef.current) return;
        e.preventDefault();
        setEditingText({ pos, value: "" });
        return;
      }

      if (tool === "arrow" || tool === "rect") {
        activeAnnotationRef.current = {
          tool,
          color,
          filled: tool === "rect" && rectFilledRef.current,
          start: pos,
          end: pos,
        };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (dragRef.current && selectedIndex !== null) {
        const pos = toCanvasPos(e, canvas);
        const dx = pos.x - dragRef.current.origin.x;
        const dy = pos.y - dragRef.current.origin.y;
        dragRef.current.origin = pos;
        setAnnotations((prev) =>
          prev.map((a, i) => {
            if (i !== selectedIndex) return a;
            if (dragRef.current!.type === "resizeStart")
              return { ...a, start: { x: a.start.x + dx, y: a.start.y + dy } };
            if (dragRef.current!.type === "resizeEnd")
              return { ...a, end: { x: a.end.x + dx, y: a.end.y + dy } };
            return {
              ...a,
              start: { x: a.start.x + dx, y: a.start.y + dy },
              end: { x: a.end.x + dx, y: a.end.y + dy },
            };
          }),
        );
        return;
      }
      if (!activeAnnotationRef.current) return;
      activeAnnotationRef.current.end = toCanvasPos(e, canvas);
      redraw(activeAnnotationRef.current);
    };

    const handleMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        return;
      }
      const active = activeAnnotationRef.current;
      if (!active) return;
      activeAnnotationRef.current = null;
      if (Math.hypot(active.end.x - active.start.x, active.end.y - active.start.y) > 3) {
        setAnnotations((prev) => [...prev, active]);
        setActiveTool("select");
        setSelectedIndex(annotations.length);
      } else {
        redraw();
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown, { signal });
    document.addEventListener("mousemove", handleMouseMove, { signal });
    document.addEventListener("mouseup", handleMouseUp, { signal });
    return () => controller.abort();
  }, [imageReady, annotations, selectedIndex, redraw]);

  // --- Text editing ---

  const commitText = () => {
    if (!editingText) return;
    if (editingText.value.trim()) {
      setAnnotations((prev) => [
        ...prev,
        {
          tool: "text" as const,
          color: activeColor,
          filled: false,
          start: editingText.pos,
          end: editingText.pos,
          text: editingText.value,
        },
      ]);
      setActiveTool("select");
      setSelectedIndex(annotations.length);
    }
    setEditingText(null);
  };

  // --- Keyboard ---

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingText) return;
      if (e.key === "Escape") onClose();
      if ((e.key === "Backspace" || e.key === "Delete") && selectedIndex !== null) {
        setAnnotations((prev) => prev.filter((_, i) => i !== selectedIndex));
        setSelectedIndex(null);
      }
    };
    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [onClose, selectedIndex, editingText]);

  // --- Color change ---

  const handleColorChange = (color: string) => {
    setActiveColor(color);
    if (selectedIndex !== null) {
      setAnnotations((prev) => prev.map((a, i) => (i === selectedIndex ? { ...a, color } : a)));
    }
  };

  // --- Export ---

  const exportBlob = async () => {
    const img = imageRef.current;
    if (!img || !highlightRect) return null;

    const dpr = window.devicePixelRatio;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = highlightRect.width * dpr;
    exportCanvas.height = highlightRect.height * dpr;
    const ctx = exportCanvas.getContext("2d")!;

    ctx.drawImage(
      img,
      highlightRect.left * dpr,
      highlightRect.top * dpr,
      highlightRect.width * dpr,
      highlightRect.height * dpr,
      0,
      0,
      exportCanvas.width,
      exportCanvas.height,
    );

    const sx = exportCanvas.width / highlightRect.width;
    const sy = exportCanvas.height / highlightRect.height;
    for (const a of annotations) {
      const scaled = {
        ...a,
        start: { x: a.start.x * sx, y: a.start.y * sy },
        end: { x: a.end.x * sx, y: a.end.y * sy },
      };
      if (a.tool === "text") {
        drawText(ctx, scaled, TEXT_FONT_SIZE * sx);
      } else {
        drawAnnotation(ctx, scaled);
      }
    }

    return new Promise<Blob>((r) => exportCanvas.toBlob((b) => r(b!), "image/png"));
  };

  const handleCopy = async () => {
    // No annotations and no canvas yet — use simple crop
    if (annotations.length === 0 && !imageReady && capturedDataUrl && highlightRect) {
      const img = await loadImage(capturedDataUrl);
      const dpr = window.devicePixelRatio;
      const c = document.createElement("canvas");
      c.width = highlightRect.width * dpr;
      c.height = highlightRect.height * dpr;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(
        img,
        highlightRect.left * dpr,
        highlightRect.top * dpr,
        highlightRect.width * dpr,
        highlightRect.height * dpr,
        0,
        0,
        c.width,
        c.height,
      );
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return;
    }

    const blob = await exportBlob();
    if (!blob) return;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    const blob = await exportBlob();
    if (!blob) return;
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
    setAnnotations([]);
    setSelectedIndex(null);
    setActiveTool("arrow");
    setEditingText(null);
    imageRef.current = null;
    setImageReady(false);
    document.documentElement.style.cursor = "crosshair";
    startListening();
  };

  // --- Selected annotation bounding box (for contextual color picker) ---

  const selectedAnnotation = selectedIndex !== null ? annotations[selectedIndex] : null;
  const selectionBounds = (() => {
    if (!selectedAnnotation) return null;
    if (selectedAnnotation.tool === "text") {
      return {
        top: selectedAnnotation.start.y,
        centerX: selectedAnnotation.start.x + TEXT_BOX_W / 2,
      };
    }
    const minX = Math.min(selectedAnnotation.start.x, selectedAnnotation.end.x);
    const maxX = Math.max(selectedAnnotation.start.x, selectedAnnotation.end.x);
    const minY = Math.min(selectedAnnotation.start.y, selectedAnnotation.end.y);
    return { top: minY, centerX: (minX + maxX) / 2 };
  })();

  // --- Fill toggle (for selected rect annotation) ---

  const toggleFill = () => {
    if (selectedAnnotation?.tool === "rect" && selectedIndex !== null) {
      setAnnotations((prev) =>
        prev.map((a, i) => (i === selectedIndex ? { ...a, filled: !a.filled } : a)),
      );
    }
  };

  return (
    <div class="fixed inset-0 z-[2147483646] pointer-events-none">
      <svg
        width="100%"
        height="100%"
        class={`fixed inset-0 pointer-events-none opacity-100 transition-opacity duration-150 ease-out ${capturedDataUrl ? "cursor-default" : ""}`}
      >
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions -- click on dark overlay area only */}
        <path
          class={`fill-black/30 pointer-events-auto ${isDragging ? "" : "transition-[d] duration-100 ease-out"}`}
          fill-rule="evenodd"
          style={{
            d: `path("${buildOverlayPath(highlightRect, { width: window.innerWidth, height: window.innerHeight })}")`,
          }}
          onClick={capturedDataUrl ? onClose : undefined}
        />
      </svg>

      {/* Side menu — actions only (rendered before canvas so canvas is on top in DOM order) */}
      {capturedDataUrl && highlightRect && (
        <div
          class="fixed pointer-events-auto bg-white rounded-lg p-1 min-w-36 font-sans text-xs shadow-2xl"
          style={{
            top: `${Math.max(0, highlightRect.top)}px`,
            left: `${menuLeft(highlightRect, window.innerWidth)}px`,
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

      {/* Canvas / preview area */}
      {highlightRect && (
        <div
          class={`fixed rounded-md shadow-lg ${isDragging ? "" : "transition-all duration-100 ease-out"}`}
          style={{
            top: `${highlightRect.top}px`,
            left: `${highlightRect.left}px`,
            width: `${highlightRect.width}px`,
            height: `${highlightRect.height}px`,
          }}
        >
          {capturedDataUrl && imageReady ? (
            <>
              <canvas
                ref={canvasRef}
                class={`pointer-events-auto rounded-md shadow-lg ${activeTool === "select" ? "cursor-default" : "cursor-crosshair"}`}
                style={{
                  width: `${highlightRect.width}px`,
                  height: `${highlightRect.height}px`,
                }}
              />
              {editingText && (
                <input
                  type="text"
                  class="absolute border-none outline-none bg-transparent p-0 m-0 pointer-events-auto"
                  style={{
                    left: `${editingText.pos.x}px`,
                    top: `${editingText.pos.y}px`,
                    font: "500 16px system-ui, sans-serif",
                    color: activeColor,
                    width: `${TEXT_BOX_W}px`,
                    caretColor: activeColor,
                  }}
                  value={editingText.value}
                  onInput={(e) =>
                    setEditingText({
                      ...editingText,
                      value: (e.target as HTMLInputElement).value,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitText();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingText(null);
                    }
                  }}
                  onBlur={() => commitText()}
                  ref={(el) => el?.focus()}
                />
              )}

              {/* Toolbar — bottom-left of canvas */}
              <div class="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-gray-900/80 px-1.5 py-1 backdrop-blur-sm pointer-events-auto font-sans">
                {TOOLS.map(({ tool, icon }) => (
                  <button
                    key={tool}
                    type="button"
                    data-tool={tool}
                    class={`flex items-center justify-center w-7 h-7 rounded cursor-pointer border-none ${activeTool === tool ? "bg-white/90 text-gray-900" : "bg-transparent text-white/70 hover:text-white hover:bg-white/10"}`}
                    onClick={() => setActiveTool(tool)}
                  >
                    {icon}
                  </button>
                ))}
              </div>

              {/* Contextual popover — above selected annotation (colors + fill toggle) */}
              {selectedAnnotation && selectionBounds && (
                <div
                  class="absolute flex items-center gap-1.5 rounded-lg bg-gray-900/80 px-2 py-1.5 backdrop-blur-sm pointer-events-auto font-sans"
                  style={{
                    top: `${selectionBounds.top - 40}px`,
                    left: `${selectionBounds.centerX}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      class="w-5 h-5 rounded-full cursor-pointer border-none p-0"
                      style={{
                        backgroundColor: color,
                        boxShadow:
                          selectedAnnotation.color === color
                            ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4px ${color === "#FFFFFF" ? "#999" : color}`
                            : color === "#FFFFFF"
                              ? "inset 0 0 0 1px rgba(255,255,255,0.4)"
                              : "none",
                      }}
                      onClick={() => handleColorChange(color)}
                    />
                  ))}
                  {selectedAnnotation.tool === "rect" && (
                    <>
                      <div class="w-px h-4 bg-white/20" />
                      <button
                        type="button"
                        class={`flex items-center justify-center w-6 h-6 rounded cursor-pointer border-none ${selectedAnnotation.filled ? "bg-white/20 text-white" : "bg-transparent text-white/70 hover:text-white hover:bg-white/10"}`}
                        onClick={toggleFill}
                      >
                        <PaintBucket size={12} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            capturedDataUrl && (
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
            )
          )}
        </div>
      )}
    </div>
  );
};
