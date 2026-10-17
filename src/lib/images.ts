"use client";

import { useEffect, useState } from "react";
import { createStore, del, get, set, type UseStore } from "idb-keyval";
import { nanoid } from "nanoid";

let imgStore: UseStore | undefined;
const store = () => (imgStore ??= createStore("netmap-images", "images"));

const urlCache = new Map<string, string>();

/**
 * Image references:
 * - "idb:<key>"  stored in this browser only (new, or offline); sync.ts uploads it and swaps the
 *                reference for "file:<id>"
 * - "file:<id>"  on the server, served by /api/files/<id>
 * - data: / http(s): URLs as they are
 */
const fileUrl = (src: string) => (src.startsWith("file:") ? `/api/files/${src.slice(5)}` : src);

/** The blob behind an "idb:" reference, for uploading. */
export async function localImageBlob(src: string): Promise<Blob | undefined> {
  return src.startsWith("idb:") ? get<Blob>(src.slice(4), store()) : undefined;
}

/** Stores an image blob in IndexedDB and returns an "idb:<key>" reference. */
export async function saveImage(blob: Blob): Promise<string> {
  const key = nanoid(12);
  await set(key, blob, store());
  return `idb:${key}`;
}

export async function deleteImage(src: string) {
  if (!src.startsWith("idb:")) return;
  const key = src.slice(4);
  await del(key, store());
  const url = urlCache.get(key);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(key);
}

async function resolve(src: string): Promise<string | undefined> {
  if (!src.startsWith("idb:")) return fileUrl(src);
  const key = src.slice(4);
  const cached = urlCache.get(key);
  if (cached) return cached;
  const blob = await get<Blob>(key, store());
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/** Resolves an image reference (data:, http:, idb:) to a displayable URL. */
export function useImageSrc(src?: string): string | undefined {
  const [resolved, setResolved] = useState<{ src?: string; url?: string }>({});
  useEffect(() => {
    if (!src) return;
    let alive = true;
    resolve(src).then((url) => alive && setResolved({ src, url }));
    return () => {
      alive = false;
    };
  }, [src]);
  if (!src) return undefined;
  if (!src.startsWith("idb:")) return fileUrl(src);
  return resolved.src === src ? resolved.url : urlCache.get(src.slice(4));
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error("toBlob failed"))), type, quality),
  );
}

/** An image file scaled down to maxDim, as a JPEG. */
export async function shrinkImage(file: Blob, maxDim = 1600, quality = 0.85): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * ratio);
    const height = Math.round(img.naturalHeight * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { blob: await canvasToBlob(canvas, "image/jpeg", quality), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Downscales an image file to maxDim and stores it. */
export async function storeImageFile(file: File, maxDim = 1600): Promise<{ src: string; width: number; height: number }> {
  const { blob, width, height } = await shrinkImage(file, maxDim);
  return { src: await saveImage(blob), width, height };
}

/** Renders one page of a PDF to an image and stores it. */
export async function storePdfPage(
  file: File,
  pageNo?: number,
): Promise<{ src: string; width: number; height: number; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(Math.min(Math.max(pageNo ?? 1, 1), doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, 2800 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const blob = await canvasToBlob(canvas, "image/png");
  return {
    src: await saveImage(blob),
    width: canvas.width,
    height: canvas.height,
    pages: doc.numPages,
  };
}

export async function pdfPageCount(file: File): Promise<number> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  return doc.numPages;
}
