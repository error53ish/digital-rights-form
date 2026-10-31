/** A minimal pointer-based drawing pad that exports a trimmed, transparent PNG. */
export class SignaturePad {
  private readonly ctx: CanvasRenderingContext2D;
  private drawing = false;
  private hasInk = false;
  private last: { x: number; y: number } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.drawing = true;
      this.last = this.point(e);
      this.dot(this.last);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drawing || !this.last) return;
      const p = this.point(e);
      this.ctx.beginPath();
      this.ctx.moveTo(this.last.x, this.last.y);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
      this.last = p;
    });
    const stop = () => {
      this.drawing = false;
      this.last = null;
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  get isEmpty() {
    return !this.hasInk;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasInk = false;
  }

  /** Exports the signature cropped to the drawn area. */
  async toPng(): Promise<Uint8Array> {
    const { width, height } = this.canvas;
    const pixels = this.ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const pad = 4;
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, maxX - minX + pad * 2);
    crop.height = Math.max(1, maxY - minY + pad * 2);
    crop.getContext('2d')!.drawImage(this.canvas, minX - pad, minY - pad, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const blob = await new Promise<Blob | null>((resolve) => crop.toBlob(resolve, 'image/png'));
    return new Uint8Array(await blob!.arrayBuffer());
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.hasInk = false; // resizing clears the canvas
    this.ctx.scale(ratio, ratio);
    this.ctx.lineWidth = 2.2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#1b1b24';
    this.ctx.fillStyle = '#1b1b24';
  }

  private point(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private dot(p: { x: number; y: number }) {
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, this.ctx.lineWidth / 2, 0, Math.PI * 2);
    this.ctx.fill();
    this.hasInk = true;
  }
}
