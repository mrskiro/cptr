/** @jsxImportSource preact */
import {
  Copy,
  Download,
  MousePointer2,
  MoveUpRight,
  PaintBucket,
  RefreshCw,
  Square,
  Type,
} from "lucide-preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { playCaptureSound } from "../../sound";

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

const COLORS = ["#FF3B30", "#000000", "#FFFFFF", "#007AFF"];

export const App = ({ onClose }: { onClose: () => void }) => {
  const [highlightNodeRect, setHighlightNodeRect] = useState<DOMRect | null>(null);

  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  // oxlint-disable-next-line custom-rules/no-use-effect -- document keydown listener for Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // oxlint-disable-next-line custom-rules/no-use-ref -- DOM reference for SVG export
  const svgRef = useRef<SVGSVGElement>(null);

  const exportBlob = async () => {
    if (!highlightNodeRect || !loadedImage) return null;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = loadedImage.naturalWidth;
    exportCanvas.height = loadedImage.naturalHeight;
    const ctx = exportCanvas.getContext("2d")!;

    ctx.drawImage(loadedImage, 0, 0);

    if (svgRef.current && svgRef.current.childNodes.length > 0) {
      const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
      for (const el of svgClone.querySelectorAll(
        "[stroke='transparent'], [stroke='#007AFF'], [fill='#FFFFFF'][r='4']",
      )) {
        el.remove();
      }
      svgClone.setAttribute("width", String(loadedImage.naturalWidth));
      svgClone.setAttribute("height", String(loadedImage.naturalHeight));
      svgClone.setAttribute(
        "viewBox",
        `0 0 ${highlightNodeRect.width} ${highlightNodeRect.height}`,
      );

      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const svgImage = new Image();
      await new Promise<void>((resolve) => {
        svgImage.onload = () => {
          ctx.drawImage(svgImage, 0, 0);
          resolve();
        };
        svgImage.src = url;
      });
      URL.revokeObjectURL(url);
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

  const handleRetake = () => {
    setLoadedImage(null);
  };

  const handleCapture = useCallback((rect: DOMRect) => {
    setHighlightNodeRect(rect);
    browser.runtime.sendMessage({ type: "capture" }).then((response) => {
      if (response.error) return;
      const fullImg = new Image();
      fullImg.onload = () => {
        const dpr = window.devicePixelRatio;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        canvas
          .getContext("2d")!
          .drawImage(
            fullImg,
            Math.round(rect.left * dpr),
            Math.round(rect.top * dpr),
            canvas.width,
            canvas.height,
            0,
            0,
            canvas.width,
            canvas.height,
          );
        const cropped = new Image();
        cropped.onload = () => setLoadedImage(cropped);
        cropped.src = canvas.toDataURL("image/png");
      };
      fullImg.src = response.dataUrl;
    });
  }, []);

  return (
    <>
      {!loadedImage && <CursorManager />}

      {!loadedImage && (
        <CaptureEventListener
          onMousemoveRect={setHighlightNodeRect}
          onDrag={setIsDragging}
          onMousedownRect={handleCapture}
        />
      )}

      <div class="fixed inset-0 z-[2147483646] pointer-events-none">
        <svg
          role="region"
          aria-label="Screen overlay"
          width="100%"
          height="100%"
          class={`fixed inset-0 pointer-events-none opacity-100 transition-opacity duration-150 ease-out ${loadedImage ? "cursor-default" : ""}`}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions */}
          <path
            class={`fill-black/30 ${isDragging ? "" : "transition-[d] duration-100 ease-out"}`}
            fill-rule="evenodd"
            // oxlint-disable-next-line react/forbid-dom-props
            style={{
              d: `path("${buildOverlayPath(highlightNodeRect, { width: window.innerWidth, height: window.innerHeight })}")`,
              pointerEvents: loadedImage ? "none" : "auto",
            }}
            onClick={loadedImage ? undefined : onClose}
          />
        </svg>

        {highlightNodeRect && loadedImage && (
          <>
            <div
              class={`fixed rounded-md shadow-lg pointer-events-auto ${isDragging ? "" : "transition-all duration-100 ease-out"}`}
              // oxlint-disable-next-line react/forbid-dom-props
              style={{
                top: `${highlightNodeRect.top}px`,
                left: `${highlightNodeRect.left}px`,
                width: `${highlightNodeRect.width}px`,
                height: `${highlightNodeRect.height}px`,
              }}
            >
              <CanvasRenderer rect={highlightNodeRect} image={loadedImage} svgRef={svgRef} />
            </div>

            <div
              class="fixed pointer-events-auto bg-white rounded-lg p-1 min-w-36 font-sans text-xs shadow-2xl"
              // oxlint-disable-next-line react/forbid-dom-props
              style={{
                top: `${Math.max(0, highlightNodeRect.top)}px`,
                left: `${menuLeft(highlightNodeRect, window.innerWidth)}px`,
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
          </>
        )}
      </div>
    </>
  );
};

const CursorManager = () => {
  // oxlint-disable-next-line custom-rules/no-use-effect -- sync cursor style with component lifecycle
  useEffect(() => {
    document.documentElement.style.cursor = "crosshair";
    return () => {
      document.documentElement.style.cursor = "";
    };
  }, []);

  return null;
};

const CaptureEventListener = ({
  onMousedownRect,
  onMousemoveRect,
  onDrag,
}: {
  onMousedownRect: (rect: DOMRect) => void;
  onMousemoveRect: (rect: DOMRect) => void;
  onDrag: (dragging: boolean) => void;
}) => {
  // oxlint-disable-next-line custom-rules/no-use-ref -- DOM reference for mousemove deduplication
  const currentTargetRef = useRef<Element | null>(null);

  // oxlint-disable-next-line custom-rules/no-use-effect -- document event listeners for capture area selection
  useEffect(() => {
    const abortController = new AbortController();
    let dragging = false;
    let dragStart: { x: number; y: number } | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

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
          onMousemoveRect(toDragRect(e.clientX, e.clientY));
          return;
        }
        if (dragStart) return;
        const target = document
          .elementsFromPoint(e.clientX, e.clientY)
          .find((el) => el.localName !== "cptr-overlay");
        if (!target || target === currentTargetRef.current) return;
        currentTargetRef.current = target;
        onMousemoveRect(toPaddedRect(target.getBoundingClientRect()));
      },
      { capture: true, signal: abortController.signal },
    );

    document.addEventListener(
      "mousedown",
      (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragStart = { x: e.clientX, y: e.clientY };
        holdTimer = setTimeout(() => {
          dragging = true;
          onDrag(true);
        }, 200);
      },
      { capture: true, signal: abortController.signal },
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
            playCaptureSound();
            abortController.abort();
            onMousedownRect(rect);
          }
          dragging = false;
          dragStart = null;
          onDrag(false);
          return;
        }
        dragStart = null;
        if (!currentTargetRef.current) return;
        playCaptureSound();
        abortController.abort();
        onMousedownRect(currentTargetRef.current.getBoundingClientRect());
      },
      { capture: true, signal: abortController.signal },
    );

    return () => {
      abortController.abort();
    };
  }, [onMousedownRect, onMousemoveRect, onDrag]);
  return null;
};

type AnnotationMode = "select" | "arrow" | "text" | "rect";

type Point = { x: number; y: number };

type Annotation =
  | { kind: "arrow"; color: string; start: Point; end: Point }
  | { kind: "text"; color: string; start: Point; end: Point; text: string }
  | { kind: "rect"; color: string; filled: boolean; start: Point; end: Point };

const ANNOTATION_TOOLS: { mode: AnnotationMode; icon: preact.ComponentChild }[] = [
  { mode: "select", icon: <MousePointer2 size={14} /> },
  { mode: "arrow", icon: <MoveUpRight size={14} /> },
  { mode: "text", icon: <Type size={14} /> },
  { mode: "rect", icon: <Square size={14} /> },
];

const TEXT_BOX_W = 200;
const TEXT_BOX_H = 24;

export const hitTestAnnotation = (a: Annotation, point: Point, tolerance = 8): boolean => {
  switch (a.kind) {
    case "arrow": {
      const { start, end } = a;
      const len = Math.hypot(end.x - start.x, end.y - start.y);
      if (len === 0) return Math.hypot(point.x - start.x, point.y - start.y) <= tolerance;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) /
            (len * len),
        ),
      );
      const proj = { x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) };
      return Math.hypot(point.x - proj.x, point.y - proj.y) <= tolerance;
    }
    case "text":
      return (
        point.x >= a.start.x &&
        point.x <= a.start.x + TEXT_BOX_W &&
        point.y >= a.start.y &&
        point.y <= a.start.y + TEXT_BOX_H
      );
    case "rect": {
      const minX = Math.min(a.start.x, a.end.x);
      const maxX = Math.max(a.start.x, a.end.x);
      const minY = Math.min(a.start.y, a.end.y);
      const maxY = Math.max(a.start.y, a.end.y);
      if (a.filled) return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
      return (
        point.x >= minX - tolerance &&
        point.x <= maxX + tolerance &&
        point.y >= minY - tolerance &&
        point.y <= maxY + tolerance &&
        !(
          point.x >= minX + tolerance &&
          point.x <= maxX - tolerance &&
          point.y >= minY + tolerance &&
          point.y <= maxY - tolerance
        )
      );
    }
  }
};

const CanvasRenderer = ({
  rect,
  image,
  svgRef,
}: {
  rect: DOMRect;
  image: HTMLImageElement;
  svgRef: preact.RefObject<SVGSVGElement>;
}) => {
  // oxlint-disable-next-line custom-rules/no-use-ref -- DOM reference for focus management and pointer capture
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedMode, setSelectedMode] = useState<AnnotationMode>("arrow");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [drawingAnnotation, setDrawingAnnotation] = useState<Annotation | null>(null);

  const [editingText, setEditingText] = useState<{ pos: Point; value: string } | null>(null);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [drag, setDrag] = useState<{
    type: "move" | "resizeStart" | "resizeEnd";
    index: number;
    startPos: Point;
    snapshot: Annotation;
  } | null>(null);

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      if (undoStack.length === 0) return;
      setRedoStack((prev) => [...prev, annotations]);
      setAnnotations(undoStack[undoStack.length - 1]);
      setUndoStack((prev) => prev.slice(0, -1));
      setSelectedIndex(null);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      if (redoStack.length === 0) return;
      setUndoStack((prev) => [...prev, annotations]);
      setAnnotations(redoStack[redoStack.length - 1]);
      setRedoStack((prev) => prev.slice(0, -1));
      setSelectedIndex(null);
      return;
    }
    if ((e.key === "Backspace" || e.key === "Delete") && selectedIndex !== null) {
      pushUndo();
      setAnnotations((prev) => prev.filter((_, i) => i !== selectedIndex));
      setSelectedIndex(null);
    }
  };

  // oxlint-disable-next-line custom-rules/no-use-effect -- document-level mousemove/mouseup for drag operations
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const r = container.getBoundingClientRect();
      const pos = { x: e.clientX - r.left, y: e.clientY - r.top };

      if (drag) {
        const { type, index, startPos, snapshot } = drag;
        const dx = pos.x - startPos.x;
        const dy = pos.y - startPos.y;
        setAnnotations((prev) =>
          prev.map((a, i) => {
            if (i !== index) return a;
            if (type === "resizeStart")
              return { ...a, start: { x: snapshot.start.x + dx, y: snapshot.start.y + dy } };
            if (type === "resizeEnd")
              return { ...a, end: { x: snapshot.end.x + dx, y: snapshot.end.y + dy } };
            return {
              ...a,
              start: { x: snapshot.start.x + dx, y: snapshot.start.y + dy },
              end: { x: snapshot.end.x + dx, y: snapshot.end.y + dy },
            };
          }),
        );
        return;
      }

      setDrawingAnnotation((prev) => (prev ? { ...prev, end: pos } : null));
    };

    const handleMouseUp = () => {
      if (drag) {
        setDrag(null);
        return;
      }
      setDrawingAnnotation((drawing) => {
        if (
          drawing &&
          Math.hypot(drawing.end.x - drawing.start.x, drawing.end.y - drawing.start.y) > 3
        ) {
          setAnnotations((prev) => {
            setUndoStack((u) => [...u, prev]);
            setRedoStack([]);
            setSelectedIndex(prev.length);
            return [...prev, drawing];
          });
          setSelectedMode("select");
        }
        return null;
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [drag, drawingAnnotation]);

  const handleMouseDown = (e: MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const r = container.getBoundingClientRect();
    const posX = e.clientX - r.left;
    const posY = e.clientY - r.top;

    switch (selectedMode) {
      case "arrow":
        setDrawingAnnotation({
          kind: "arrow",
          color: selectedColor,
          start: { x: posX, y: posY },
          end: { x: posX, y: posY },
        });
        break;
      case "rect":
        setDrawingAnnotation({
          kind: "rect",
          color: selectedColor,
          filled: false,
          start: { x: posX, y: posY },
          end: { x: posX, y: posY },
        });
        break;
      case "text": {
        if (editingText) return;
        e.preventDefault();
        setEditingText({ pos: { x: posX, y: posY }, value: "" });
        break;
      }
      case "select": {
        const pos = { x: posX, y: posY };
        // Check resize handles first
        if (selectedAnnotation && selectedAnnotation.kind !== "text") {
          for (const handle of ["start", "end"] as const) {
            const hp = selectedAnnotation[handle];
            if (Math.hypot(pos.x - hp.x, pos.y - hp.y) <= 8) {
              pushUndo();
              setDrag({
                type: handle === "start" ? "resizeStart" : "resizeEnd",
                index: selectedIndex!,
                startPos: pos,
                snapshot: selectedAnnotation,
              });
              return;
            }
          }
        }
        // Check annotation hit
        const hitIndex = [...annotations].reverse().findIndex((a) => hitTestAnnotation(a, pos));
        if (hitIndex >= 0) {
          const index = annotations.length - 1 - hitIndex;
          setSelectedIndex(index);
          pushUndo();
          setDrag({ type: "move", index, startPos: pos, snapshot: annotations[index] });
          return;
        }
        setSelectedIndex(null);
        return;
      }
      default:
        break;
    }

    setSelectedIndex(null);
  };

  const pushUndo = () => {
    setUndoStack((prev) => [...prev, annotations]);
    setRedoStack([]);
  };

  const handleChangeColor = (color: string) => {
    setSelectedColor(color);
    if (selectedIndex !== null) {
      pushUndo();
      setAnnotations((prev) => prev.map((a, i) => (i === selectedIndex ? { ...a, color } : a)));
    }
  };

  const handleToggleFill = () => {
    pushUndo();
    setAnnotations((prev) =>
      prev.map((a, i) =>
        i === selectedIndex && a.kind === "rect" ? { ...a, filled: !a.filled } : a,
      ),
    );
  };

  const commitText = (value: string, pos: Point) => {
    if (value.trim()) {
      setUndoStack((prev) => [...prev, annotations]);
      setRedoStack([]);
      setSelectedIndex(annotations.length);
      setAnnotations((prev) => [
        ...prev,
        { kind: "text" as const, color: selectedColor, start: pos, end: pos, text: value },
      ]);
      setSelectedMode("select");
    }
    setEditingText(null);
  };

  const selectedAnnotation = selectedIndex !== null ? annotations[selectedIndex] : null;

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- wrapper div for focus management and pointer capture
    <div
      ref={(el: HTMLDivElement | null) => {
        containerRef.current = el;
        if (el && !editingText && !el.contains(document.activeElement)) el.focus();
      }}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      class="relative rounded-md shadow-lg pointer-events-auto outline-none select-none"
      // oxlint-disable-next-line react/forbid-dom-props
      style={{
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    >
      <div
        role="img"
        aria-label="Annotation editor"
        class="overflow-hidden rounded-md"
        // oxlint-disable-next-line react/forbid-dom-props
        style={{
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        }}
        onMouseDown={handleMouseDown}
      >
        <img
          src={image.src}
          alt=""
          draggable={false}
          class="block pointer-events-none"
          // oxlint-disable-next-line react/forbid-dom-props
          style={{
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
        />
        <svg
          ref={svgRef}
          class="absolute inset-0 pointer-events-none"
          width={rect.width}
          height={rect.height}
        >
          {annotations.map((a, i) => (
            <g key={i}>
              <SvgAnnotation annotation={a} />
            </g>
          ))}
          {drawingAnnotation && <SvgAnnotation annotation={drawingAnnotation} />}

          {selectedAnnotation && selectedAnnotation.kind === "text" && (
            <rect
              x={selectedAnnotation.start.x - 2}
              y={selectedAnnotation.start.y - 2}
              width={TEXT_BOX_W + 4}
              height={TEXT_BOX_H + 4}
              fill="none"
              stroke="#007AFF"
              stroke-width={1}
              stroke-dasharray="4 4"
            />
          )}
          {selectedAnnotation && selectedAnnotation.kind !== "text" && (
            <>
              {(["start", "end"] as const).map((handle) => (
                <circle
                  key={handle}
                  cx={selectedAnnotation[handle].x}
                  cy={selectedAnnotation[handle].y}
                  r={4}
                  fill="#FFFFFF"
                  stroke="#007AFF"
                  stroke-width={1.5}
                  class="cursor-grab"
                />
              ))}
            </>
          )}
        </svg>
      </div>

      <div class="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-gray-900/80 px-1.5 py-1 backdrop-blur-sm pointer-events-auto font-sans">
        {ANNOTATION_TOOLS.map(({ mode, icon }) => (
          <button
            key={mode}
            type="button"
            aria-label={mode}
            aria-pressed={selectedMode === mode}
            class={`flex items-center justify-center w-7 h-7 rounded cursor-pointer border-none ${selectedMode === mode ? "bg-white/90 text-gray-900" : "bg-transparent text-white/70 hover:text-white hover:bg-white/10"}`}
            onClick={() => setSelectedMode(mode)}
          >
            {icon}
          </button>
        ))}
      </div>

      {selectedAnnotation && (
        <AnnotationMenu
          annotation={selectedAnnotation}
          onChangeColor={handleChangeColor}
          onToggleFill={handleToggleFill}
        />
      )}

      {editingText && (
        <input
          type="text"
          class="absolute border-none outline-none bg-transparent p-0 m-0 pointer-events-auto"
          // oxlint-disable-next-line react/forbid-dom-props
          style={{
            left: `${editingText.pos.x}px`,
            top: `${editingText.pos.y}px`,
            font: "500 16px system-ui, sans-serif",
            color: selectedColor,
            width: `${TEXT_BOX_W}px`,
            caretColor: selectedColor,
          }}
          value={editingText.value}
          onInput={(e) =>
            setEditingText({
              ...editingText,
              value: (e.target as HTMLInputElement).value,
            })
          }
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditingText(null);
            }
          }}
          onBlur={() => commitText(editingText.value, editingText.pos)}
          ref={(el) => el?.focus()}
        />
      )}
    </div>
  );
};

const TEXT_FONT_SIZE = 16;

const SvgAnnotation = ({ annotation }: { annotation: Annotation }) => {
  switch (annotation.kind) {
    case "arrow": {
      const angle = Math.atan2(
        annotation.end.y - annotation.start.y,
        annotation.end.x - annotation.start.x,
      );
      const hl = 12;
      const ha = Math.PI / 6;
      return (
        <>
          {/* transparent hit area */}
          <line
            x1={annotation.start.x}
            y1={annotation.start.y}
            x2={annotation.end.x}
            y2={annotation.end.y}
            stroke="transparent"
            stroke-width={12}
          />
          <line
            x1={annotation.start.x}
            y1={annotation.start.y}
            x2={annotation.end.x}
            y2={annotation.end.y}
            stroke={annotation.color}
            stroke-width={2}
          />
          <polygon
            points={`${annotation.end.x},${annotation.end.y} ${annotation.end.x - hl * Math.cos(angle - ha)},${annotation.end.y - hl * Math.sin(angle - ha)} ${annotation.end.x - hl * Math.cos(angle + ha)},${annotation.end.y - hl * Math.sin(angle + ha)}`}
            fill={annotation.color}
          />
        </>
      );
    }
    case "text":
      return (
        <text
          x={annotation.start.x}
          y={annotation.start.y + TEXT_FONT_SIZE}
          fill={annotation.color}
          font-weight="500"
          font-size={TEXT_FONT_SIZE}
          font-family="system-ui, sans-serif"
        >
          {annotation.text}
        </text>
      );
    case "rect": {
      const x = Math.min(annotation.start.x, annotation.end.x);
      const y = Math.min(annotation.start.y, annotation.end.y);
      const w = Math.abs(annotation.end.x - annotation.start.x);
      const h = Math.abs(annotation.end.y - annotation.start.y);
      return (
        <>
          {/* transparent hit area for unfilled rect edges */}
          {!annotation.filled && (
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill="none"
              stroke="transparent"
              stroke-width={12}
            />
          )}
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={annotation.filled ? annotation.color : "none"}
            stroke={annotation.filled ? "none" : annotation.color}
            stroke-width={annotation.filled ? 0 : 2}
          />
        </>
      );
    }
  }
};

const AnnotationMenu = ({
  annotation,
  onChangeColor,
  onToggleFill,
}: {
  annotation: Annotation;
  onChangeColor: (color: string) => void;
  onToggleFill: () => void;
}) => {
  const top =
    annotation.kind === "text"
      ? annotation.start.y
      : Math.min(annotation.start.y, annotation.end.y);

  const centerX =
    annotation.kind === "text"
      ? annotation.start.x + TEXT_BOX_W / 2
      : (Math.min(annotation.start.x, annotation.end.x) +
          Math.max(annotation.start.x, annotation.end.x)) /
        2;

  return (
    <div
      class="absolute -translate-x-1/2 flex items-center gap-1.5 rounded-lg bg-gray-900/80 px-2 py-1.5 backdrop-blur-sm pointer-events-auto font-sans"
      // oxlint-disable-next-line react/forbid-dom-props
      style={{
        top: `${top - 40}px`,
        left: `${centerX}px`,
      }}
    >
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          aria-pressed={annotation.color === color}
          class="w-5 h-5 rounded-full cursor-pointer border-none p-0"
          // oxlint-disable-next-line react/forbid-dom-props
          style={{
            backgroundColor: color,
            boxShadow:
              annotation.color === color
                ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4px ${color === "#FFFFFF" ? "#999" : color}`
                : color === "#FFFFFF"
                  ? "inset 0 0 0 1px rgba(255,255,255,0.4)"
                  : "none",
          }}
          onClick={() => onChangeColor(color)}
        />
      ))}
      {annotation.kind === "rect" && (
        <>
          <div class="w-px h-4 bg-white/20" />
          <button
            type="button"
            aria-label="Toggle fill"
            aria-pressed={annotation.filled}
            class={`flex items-center justify-center w-6 h-6 rounded cursor-pointer border-none ${annotation.filled ? "bg-white/20 text-white" : "bg-transparent text-white/70 hover:text-white hover:bg-white/10"}`}
            onClick={onToggleFill}
          >
            <PaintBucket size={12} />
          </button>
        </>
      )}
    </div>
  );
};
