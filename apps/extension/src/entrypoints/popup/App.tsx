/** @jsxImportSource preact */
import { Copy, Download, Share } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";

import { playCaptureSound } from "../../sound";

const SCALE = 0.75;
const PAD_RATIO = 0.06;
const RADIUS = 6;
const SHADOW_BLUR = 40;
const SHADOW_OFFSET_Y = 10;

const renderPortrait = (img: HTMLImageElement, bg: string): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");

  const imgW = Math.round(img.naturalWidth * SCALE);
  const imgH = Math.round(img.naturalHeight * SCALE);
  const padX = Math.round(img.naturalWidth * PAD_RATIO) + (img.naturalWidth - imgW) / 2;
  const padY = Math.round(img.naturalHeight * PAD_RATIO) + (img.naturalHeight - imgH) / 2;

  canvas.width = imgW + padX * 2;
  canvas.height = imgH + padY * 2;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer frame (bg + white mix, behind screenshot)
  ctx.beginPath();
  ctx.roundRect(padX - 8, padY - 8, imgW + 16, imgH + 16, RADIUS + 6);
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.fill();

  // Drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
  ctx.shadowBlur = SHADOW_BLUR;
  ctx.shadowOffsetY = SHADOW_OFFSET_Y;
  ctx.beginPath();
  ctx.roundRect(padX, padY, imgW, imgH, RADIUS);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Screenshot with rounded corners
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(padX, padY, imgW, imgH, RADIUS);
  ctx.clip();
  ctx.drawImage(img, padX, padY, imgW, imgH);
  ctx.restore();

  // Inner border (on screenshot)
  ctx.beginPath();
  ctx.roundRect(padX, padY, imgW, imgH, RADIUS);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas;
};

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));

// Start capture at module load (before render) for fastest response
const capturePromise = browser.tabs.captureVisibleTab({ format: "png" });

const STORAGE_KEY = "portrait-hue";

export const App = () => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [sliderValue, setSliderValue] = useState(270);
  const bg = sliderValue === 0 ? "#ffffff" : `hsl(${sliderValue}, 70%, 75%)`;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    browser.storage.local.get(STORAGE_KEY).then((r) => {
      if (r[STORAGE_KEY] != null) setSliderValue(Number(r[STORAGE_KEY]));
    });
  }, []);

  useEffect(() => {
    capturePromise
      .then((dataUrl) => {
        const image = new Image();
        image.onload = () => {
          setImg(image);
          playCaptureSound();
        };
        image.src = dataUrl;
      })
      .catch((e) => console.error("capture failed:", e));
  }, []);

  const previewUrl = img ? renderPortrait(img, bg).toDataURL() : null;

  const handleCopy = async () => {
    const blob = await toBlob(renderPortrait(img!, bg));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    const blob = await toBlob(renderPortrait(img!, bg));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cptr-portrait-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    const blob = await toBlob(renderPortrait(img!, bg));
    const file = new File([blob], "cptr-portrait.png", { type: "image/png" });
    await navigator.share({ files: [file] });
  };

  return (
    <div class="flex flex-col gap-3 p-4 w-80">
      <div class="rounded-lg overflow-hidden">
        {previewUrl ? (
          <img src={previewUrl} alt="Screenshot preview" class="block w-full" />
        ) : (
          <div class="aspect-video bg-gray-200 animate-pulse" />
        )}
      </div>

      <input
        type="range"
        min={0}
        max={360}
        value={sliderValue}
        onInput={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          setSliderValue(v);
          browser.storage.local.set({ [STORAGE_KEY]: v });
        }}
        class="hue-slider h-3.5 w-full cursor-pointer rounded-full border border-black/12"
      />

      <div class="flex items-center">
        <button
          type="button"
          class="flex flex-1 items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-xs text-gray-900 bg-transparent hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!img}
          onClick={handleCopy}
        >
          <Copy size={16} />
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 px-2 py-2 rounded-md cursor-pointer text-xs text-gray-900 bg-transparent hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!img}
          onClick={handleSave}
        >
          <Download size={16} />
          Save
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 px-2 py-2 rounded-md cursor-pointer text-xs text-gray-900 bg-transparent hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!img}
          onClick={handleShare}
        >
          <Share size={16} />
          Share
        </button>
      </div>
    </div>
  );
};
