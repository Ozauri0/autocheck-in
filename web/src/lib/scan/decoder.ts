// BarcodeDetector nativo si lee QR; si no (iOS, Firefox, Linux), ZXing.

export type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const MAX_SIDE = 1024;

export async function createDecoder(): Promise<Decoder> {
  const Native = (window as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  const formats = await Native?.getSupportedFormats().catch((): string[] => []);
  if (Native && formats?.includes("qr_code")) {
    const detector = new Native({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }

  const { BrowserQRCodeReader } = await import("@zxing/browser");
  const reader = new BrowserQRCodeReader();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    if (!context || !canvas.width || !canvas.height) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      return reader.decodeFromCanvas(canvas).getText();
    } catch {
      return null; // Sin QR en este cuadro.
    }
  };
}
