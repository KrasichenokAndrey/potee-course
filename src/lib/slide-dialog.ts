const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function setupSlideDialog(
  viewer: HTMLElement,
  active: () => number,
  show: (index: number) => void,
  slides: HTMLElement[]
) {
  const query = <T extends HTMLElement>(selector: string) => viewer.querySelector<T>(selector)!;
  const dialog = query<HTMLDialogElement>("[data-slide-dialog]");
  const fullscreenRoot = query<HTMLDivElement>(".slide-dialog__layout");
  const viewport = query<HTMLDivElement>("[data-slide-viewport]");
  const image = query<HTMLImageElement>("[data-modal-image]");
  const canvas = query<HTMLDivElement>("[data-slide-canvas]");
  const content = query<HTMLDivElement>("[data-modal-content]");
  const closeButton = query<HTMLButtonElement>("[data-slide-close]");
  const prev = query<HTMLButtonElement>("[data-modal-prev]");
  const next = query<HTMLButtonElement>("[data-modal-next]");
  const zoomIn = query<HTMLButtonElement>("[data-zoom-in]");
  const zoomOut = query<HTMLButtonElement>("[data-zoom-out]");
  const zoomReset = query<HTMLButtonElement>("[data-zoom-reset]");
  const counter = query<HTMLSpanElement>("[data-modal-counter]");
  const zoomLabel = query<HTMLSpanElement>("[data-zoom-label]");
  const zoomControls = query<HTMLDivElement>("[data-zoom-controls]");
  let zoom = 1;
  let opener: HTMLElement | null = null;
  let bodyOverflow = "";
  let hadFullscreen = false;
  let renderedWidth = 0;
  let renderedHeight = 0;
  const pointers = new Map<number, { x: number; y: number }>();

  function imageSize() {
    const naturalWidth = Number(image.getAttribute("width")) || image.naturalWidth || 1600;
    const naturalHeight = Number(image.getAttribute("height")) || image.naturalHeight || 900;
    const fit = Math.min(Math.max(1, viewport.clientWidth - 24) / naturalWidth,
      Math.max(1, viewport.clientHeight - 24) / naturalHeight);
    return { width: naturalWidth * fit * zoom, height: naturalHeight * fit * zoom };
  }

  function resizeImage(anchorX = viewport.clientWidth / 2, anchorY = viewport.clientHeight / 2) {
    if (!dialog.open || image.hidden) return;
    // Preserve the image point under the cursor/fingers while zooming.
    const relativeX = renderedWidth ? (viewport.scrollLeft + anchorX - Math.max(0, (viewport.clientWidth - renderedWidth) / 2)) / renderedWidth : 0.5;
    const relativeY = renderedHeight ? (viewport.scrollTop + anchorY - Math.max(0, (viewport.clientHeight - renderedHeight) / 2)) / renderedHeight : 0.5;
    const size = imageSize();
    renderedWidth = size.width;
    renderedHeight = size.height;
    image.style.width = `${size.width}px`;
    image.style.height = `${size.height}px`;
    canvas.style.width = `${Math.max(viewport.clientWidth, size.width)}px`;
    canvas.style.height = `${Math.max(viewport.clientHeight, size.height)}px`;
    viewport.scrollLeft = relativeX * size.width + Math.max(0, (viewport.clientWidth - size.width) / 2) - anchorX;
    viewport.scrollTop = relativeY * size.height + Math.max(0, (viewport.clientHeight - size.height) / 2) - anchorY;
    viewport.dataset.zoomed = String(zoom > 1);
  }

  function setZoom(value: number, x?: number, y?: number) {
    if (image.hidden) return;
    zoom = clamp(value, 1, 4);
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    zoomIn.setAttribute("aria-disabled", String(zoom >= 4));
    zoomOut.setAttribute("aria-disabled", String(zoom <= 1));
    resizeImage(x, y);
  }

  function sync() {
    if (!dialog.open) return;
    pointers.clear();
    delete viewport.dataset.dragging;
    const slide = slides[active()];
    const sourceImage = slide.querySelector("img");
    counter.textContent = `${active() + 1} / ${slides.length}`;
    prev.setAttribute("aria-disabled", String(active() === 0));
    next.setAttribute("aria-disabled", String(active() === slides.length - 1));
    image.hidden = !sourceImage;
    content.hidden = Boolean(sourceImage);
    zoomControls.hidden = !sourceImage;
    canvas.style.width = "";
    canvas.style.height = "";
    content.replaceChildren();
    viewport.scrollTop = viewport.scrollLeft = 0;
    renderedWidth = renderedHeight = 0;
    if (sourceImage) {
      image.alt = sourceImage.alt;
      image.setAttribute("width", sourceImage.getAttribute("width") || "1600");
      image.setAttribute("height", sourceImage.getAttribute("height") || "900");
      image.src = sourceImage.src;
      setZoom(1);
    } else {
      image.removeAttribute("src");
      const clone = slide.cloneNode(true) as HTMLElement;
      clone.removeAttribute("hidden");
      clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      content.append(...Array.from(clone.childNodes));
    }
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  dialog.addEventListener("close", async () => {
    pointers.clear();
    document.body.style.overflow = bodyOverflow;
    if (document.fullscreenElement === fullscreenRoot) await document.exitFullscreen().catch(() => {});
    const target = opener?.isConnected && opener.getClientRects().length ? opener : query<HTMLButtonElement>("[data-slide-open]");
    target.focus({ preventScroll: true });
  });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement === fullscreenRoot) {
      hadFullscreen = true;
      resizeImage();
    } else if (hadFullscreen) {
      hadFullscreen = false;
      close();
    }
  });
  closeButton.addEventListener("click", close);
  prev.addEventListener("click", () => show(active() - 1));
  next.addEventListener("click", () => show(active() + 1));
  zoomIn.addEventListener("click", () => setZoom(zoom + 0.25));
  zoomOut.addEventListener("click", () => setZoom(zoom - 0.25));
  zoomReset.addEventListener("click", () => setZoom(1));
  image.addEventListener("load", () => resizeImage());
  new ResizeObserver(() => resizeImage()).observe(viewport);

  viewport.addEventListener("pointerdown", (event) => {
    if (image.hidden || event.button !== 0) return;
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.dataset.dragging = String(zoom > 1);
    viewport.focus({ preventScroll: true });
    event.preventDefault();
  });
  viewport.addEventListener("pointermove", (event) => {
    const old = pointers.get(event.pointerId);
    if (!old) return;
    const before = [...pointers.values()];
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.values()];
    if (after.length === 2) {
      const distance = (points: typeof after) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const previousDistance = distance(before);
      const rect = viewport.getBoundingClientRect();
      if (previousDistance > 0) setZoom(zoom * distance(after) / previousDistance,
        (after[0].x + after[1].x) / 2 - rect.left, (after[0].y + after[1].y) / 2 - rect.top);
    } else if (after.length === 1 && zoom > 1) {
      viewport.scrollLeft -= event.clientX - old.x;
      viewport.scrollTop -= event.clientY - old.y;
    }
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    viewport.addEventListener(name, (event) => {
      pointers.delete((event as PointerEvent).pointerId);
      if (!pointers.size) delete viewport.dataset.dragging;
    });
  }
  viewport.addEventListener("dblclick", (event) => {
    if (image.hidden) return;
    const rect = viewport.getBoundingClientRect();
    setZoom(zoom > 1 ? 1 : 2, event.clientX - rect.left, event.clientY - rect.top);
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement).closest("details")) return;
    const pan: Record<string, [number, number]> = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] };
    if (event.target === viewport && zoom > 1 && pan[event.key]) {
      event.preventDefault();
      viewport.scrollBy(...pan[event.key]);
      return;
    }
    const actions: Record<string, () => void> = {
      ArrowLeft: () => show(active() - 1), ArrowRight: () => show(active() + 1),
      PageUp: () => show(active() - 1), PageDown: () => show(active() + 1),
      Home: () => show(0), End: () => show(slides.length - 1),
      "+": () => setZoom(zoom + 0.25), "=": () => setZoom(zoom + 0.25),
      "-": () => setZoom(zoom - 0.25), "0": () => setZoom(1)
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  });

  return {
    sync,
    open(trigger: HTMLElement) {
      if (dialog.open) return;
      opener = trigger;
      hadFullscreen = false;
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog.showModal();
      sync();
      closeButton.focus({ preventScroll: true });
      // A full-window modal remains available if native fullscreen is unsupported or denied.
      if (document.fullscreenEnabled && fullscreenRoot.requestFullscreen) {
        void fullscreenRoot.requestFullscreen().catch(() => {});
      }
    }
  };
}
