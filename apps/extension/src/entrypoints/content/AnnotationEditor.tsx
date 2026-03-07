/** @jsxImportSource preact */
import { Copy, Download, MousePointer2, MoveRight, PaintBucket, Square, Type, X } from "lucide-preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

// --- Data model ---

type AnnotationTool = "select" | "arrow" | "text" | "rect";

type Annotation = {
  tool: AnnotationTool;
  color: string;
  filled: boolean;
  start: { x: number; y: number };
  end: { x: number; y: number };
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

const hitTestRect = (start: Point, end: Point, p: Point, tolerance: number): boolean => {
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
      return hitTestRect(a.start, a.end, point, tolerance);
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
  ctx.lineTo(end.x - headLength * Math.cos(angle - headAngle), end.y - headLength * Math.sin(angle - headAngle));
  ctx.lineTo(end.x - headLength * Math.cos(angle + headAngle), end.y - headLength * Math.sin(angle + headAngle));
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
    // Dashed rect around text
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

// --- Component ---

export const AnnotationEditor = ({
  dataUrl,
  cropRect,
  onClose,
}: {
  dataUrl: string;
  cropRect: DOMRect;
  onClose: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const [activeTool, setActiveTool] = useState<AnnotationTool>("arrow");
  const activeToolRef = useRef<AnnotationTool>("arrow");
  activeToolRef.current = activeTool;
  const [activeColor, setActiveColor] = useState(COLORS[0]);
  const activeColorRef = useRef(COLORS[0]);
  activeColorRef.current = activeColor;
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeAnnotationRef = useRef<Annotation | null>(null);
  const dragRef = useRef<{ type: "move"; origin: Point } | { type: "resizeStart" | "resizeEnd"; origin: Point } | null>(null);
  const [editingText, setEditingText] = useState<{ pos: Point; value: string } | null>(null);
  const editingTextRef = useRef<{ pos: Point; value: string } | null>(null);
  editingTextRef.current = editingText;
  const [rectFilled, setRectFilled] = useState(false);
  const rectFilledRef = useRef(false);
  rectFilledRef.current = rectFilled;

  // Canvas display size (fit to viewport with padding for actions bar)
  const ACTION_H = 48;
  const PAD_X = 32;
  const PAD_Y = 16;
  const maxW = window.innerWidth - PAD_X * 2;
  const maxH = window.innerHeight - ACTION_H - PAD_Y * 2;
  const scale = Math.min(1, maxW / cropRect.width, maxH / cropRect.height);
  const displayW = Math.round(cropRect.width * scale);
  const displayH = Math.round(cropRect.height * scale);

  useEffect(() => {
    loadImage(dataUrl).then((img) => {
      imageRef.current = img;
      setReady(true);
    });
  }, [dataUrl]);

  const redraw = useCallback((extraAnnotation?: Annotation | null, highlightIndex?: number | null) => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const dpr = window.devicePixelRatio;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // Base image
    ctx.drawImage(
      img,
      cropRect.left * dpr,
      cropRect.top * dpr,
      cropRect.width * dpr,
      cropRect.height * dpr,
      0,
      0,
      displayW,
      displayH,
    );

    // Committed annotations
    for (const a of annotations) {
      drawAnnotation(ctx, a);
    }

    // Active (in-progress) annotation
    if (extraAnnotation) {
      drawAnnotation(ctx, extraAnnotation);
    }

    // Selection handles
    const si = highlightIndex ?? selectedIndex;
    if (si !== null && si !== undefined && annotations[si]) {
      drawSelectionHandles(ctx, annotations[si]);
    }
  }, [annotations, cropRect, displayW, displayH, selectedIndex]);

  // Redraw when image loads or annotations/selection change
  useEffect(() => {
    if (ready) redraw();
  }, [ready, annotations, selectedIndex, redraw]);

  // Mouse interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;

    const controller = new AbortController();
    const { signal } = controller;

    const handleMouseDown = (e: MouseEvent) => {
      const pos = toCanvasPos(e, canvas);
      const tool = activeToolRef.current;
      const color = activeColorRef.current;

      if (tool === "select") {
        // Check resize handles on selected annotation first
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

        // Hit test in reverse order (topmost first)
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

      // Drawing tools
      setSelectedIndex(null);

      if (tool === "text") {
        if (editingTextRef.current) {
          // Let blur commit the current text (don't preventDefault so focus moves)
          return;
        }
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
      // Move or resize selected annotation
      if (dragRef.current && selectedIndex !== null) {
        const pos = toCanvasPos(e, canvas);
        const dx = pos.x - dragRef.current.origin.x;
        const dy = pos.y - dragRef.current.origin.y;
        dragRef.current.origin = pos;

        setAnnotations((prev) =>
          prev.map((a, i) => {
            if (i !== selectedIndex) return a;
            if (dragRef.current!.type === "resizeStart") {
              return { ...a, start: { x: a.start.x + dx, y: a.start.y + dy } };
            }
            if (dragRef.current!.type === "resizeEnd") {
              return { ...a, end: { x: a.end.x + dx, y: a.end.y + dy } };
            }
            return {
              ...a,
              start: { x: a.start.x + dx, y: a.start.y + dy },
              end: { x: a.end.x + dx, y: a.end.y + dy },
            };
          }),
        );
        return;
      }

      // Drawing
      if (!activeAnnotationRef.current) return;
      activeAnnotationRef.current.end = toCanvasPos(e, canvas);
      redraw(activeAnnotationRef.current);
    };

    const handleMouseUp = () => {
      // End drag
      if (dragRef.current) {
        dragRef.current = null;
        return;
      }

      // End drawing
      const active = activeAnnotationRef.current;
      if (!active) return;
      activeAnnotationRef.current = null;

      const dx = active.end.x - active.start.x;
      const dy = active.end.y - active.start.y;
      if (Math.hypot(dx, dy) > 3) {
        setAnnotations((prev) => [...prev, active]);
        // Switch to select mode after placing annotation
        setActiveTool("select");
        setSelectedIndex(annotations.length); // select the newly added one
      } else {
        redraw();
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown, { signal });
    document.addEventListener("mousemove", handleMouseMove, { signal });
    document.addEventListener("mouseup", handleMouseUp, { signal });

    return () => controller.abort();
  }, [ready, annotations, selectedIndex, redraw]);

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

  const cancelText = () => {
    setEditingText(null);
  };

  // Keyboard: Escape to close (or cancel text), Delete to remove selected
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle global keys while editing text
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

  // Color change updates selected annotation
  const handleColorChange = (color: string) => {
    setActiveColor(color);
    if (selectedIndex !== null) {
      setAnnotations((prev) =>
        prev.map((a, i) => (i === selectedIndex ? { ...a, color } : a)),
      );
    }
  };

  // --- Export ---

  const exportBlob = async () => {
    const img = imageRef.current;
    if (!img) return null;

    const dpr = window.devicePixelRatio;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = cropRect.width * dpr;
    exportCanvas.height = cropRect.height * dpr;
    const ctx = exportCanvas.getContext("2d")!;

    ctx.drawImage(
      img,
      cropRect.left * dpr,
      cropRect.top * dpr,
      cropRect.width * dpr,
      cropRect.height * dpr,
      0,
      0,
      exportCanvas.width,
      exportCanvas.height,
    );

    const sx = exportCanvas.width / displayW;
    const sy = exportCanvas.height / displayH;
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

  const TOOLS: { tool: AnnotationTool; icon: preact.ComponentChild }[] = [
    { tool: "select", icon: <MousePointer2 size={14} /> },
    { tool: "arrow", icon: <MoveRight size={14} /> },
    { tool: "text", icon: <Type size={14} /> },
    { tool: "rect", icon: <Square size={14} /> },
  ];

  return (
    <div class="fixed inset-0 z-[2147483646] flex flex-col items-center justify-center bg-black/40 pointer-events-auto font-sans">
      {/* Canvas + toolbar overlay */}
      <div class="relative flex-1 flex items-center justify-center w-full">
        <div class="relative" style={{ width: `${displayW}px`, height: `${displayH}px` }}>
          {ready ? (
            <canvas
              ref={canvasRef}
              class={`rounded-lg shadow-2xl ${activeTool === "select" ? "cursor-default" : "cursor-crosshair"}`}
              style={{ width: `${displayW}px`, height: `${displayH}px` }}
            />
          ) : (
            <div
              class="rounded-lg bg-gray-800 animate-pulse"
              style={{ width: `${displayW}px`, height: `${displayH}px` }}
            />
          )}

          {/* Text input overlay */}
          {editingText && (
            <input
              type="text"
              class="absolute border-none outline-none bg-transparent p-0 m-0"
              style={{
                left: `${editingText.pos.x}px`,
                top: `${editingText.pos.y}px`,
                font: "500 16px system-ui, sans-serif",
                color: activeColor,
                width: `${TEXT_BOX_W}px`,
                caretColor: activeColor,
              }}
              value={editingText.value}
              onInput={(e) => setEditingText({ ...editingText, value: (e.target as HTMLInputElement).value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitText();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  cancelText();
                }
              }}
              onBlur={() => commitText()}
              ref={(el) => el?.focus()}
            />
          )}
        </div>

        {/* Toolbar — bottom-left of canvas */}
        {ready && (
          <div
            class="absolute flex items-center gap-2 rounded-lg bg-gray-900/80 px-2 py-1.5 backdrop-blur-sm"
            style={{
              bottom: `${(window.innerHeight - displayH) / 2 - ACTION_H - 8}px`,
              left: `${(window.innerWidth - displayW) / 2}px`,
            }}
          >
            {/* Tool buttons */}
            {TOOLS.map(({ tool, icon }) => (
              <button
                key={tool}
                type="button"
                class={`flex items-center justify-center w-7 h-7 rounded cursor-pointer border-none ${activeTool === tool ? "bg-white/90 text-gray-900" : "bg-transparent text-white/70 hover:text-white hover:bg-white/10"}`}
                onClick={() => setActiveTool(tool)}
              >
                {icon}
              </button>
            ))}

            {/* Fill toggle (rect tool or selected rect) */}
            {(activeTool === "rect" || (selectedIndex !== null && annotations[selectedIndex]?.tool === "rect")) && (() => {
              const selectedRect = selectedIndex !== null ? annotations[selectedIndex] : null;
              const isFilled = selectedRect?.tool === "rect" ? selectedRect.filled : rectFilled;
              const toggle = () => {
                if (selectedRect?.tool === "rect") {
                  setAnnotations((prev) =>
                    prev.map((a, i) => (i === selectedIndex ? { ...a, filled: !a.filled } : a)),
                  );
                } else {
                  setRectFilled((v) => !v);
                }
              };
              return (
                <>
                  <div class="w-px h-4 bg-white/20" />
                  <button
                    type="button"
                    class={`flex items-center justify-center w-7 h-7 rounded cursor-pointer border-none ${isFilled ? "bg-white/20 text-white" : "bg-transparent text-white/70 hover:text-white hover:bg-white/10"}`}
                    onClick={toggle}
                  >
                    <PaintBucket size={14} />
                  </button>
                </>
              );
            })()}

            {/* Separator */}
            <div class="w-px h-4 bg-white/20" />

            {/* Color buttons */}
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                class="w-5 h-5 rounded-full cursor-pointer border-none p-0"
                style={{
                  backgroundColor: color,
                  boxShadow: activeColor === color ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4px ${color}` : color === "#FFFFFF" ? "inset 0 0 0 1px rgba(0,0,0,0.2)" : "none",
                }}
                onClick={() => handleColorChange(color)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div class="flex items-center gap-2 pb-4">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md cursor-pointer text-xs text-gray-300 bg-transparent border-none hover:bg-white/10"
          onClick={onClose}
        >
          <X size={14} />
          Cancel
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md cursor-pointer text-xs text-white bg-white/20 border-none hover:bg-white/30"
          onClick={handleCopy}
        >
          <Copy size={14} />
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md cursor-pointer text-xs text-white bg-white/20 border-none hover:bg-white/30"
          onClick={handleSave}
        >
          <Download size={14} />
          Save
        </button>
      </div>
    </div>
  );
};
