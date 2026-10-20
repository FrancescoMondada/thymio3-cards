// The picture under the mat is too big for localStorage: it is kept in IndexedDB, as a Blob with its size.
// Every call survives a browser that refuses to store (private window): the picture is then only kept
// until the page is closed.
import { MAX_SIDE_PX, fitWithin } from './worldmap.js';
import { scanSquares } from './picturecolor.js';

const DB = 'thymio3-cards';
const STORE = 'kv';
const KEY = 'map';

const open = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function run(mode, use) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = use(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const saveImage = (image) => run('readwrite', (s) => s.put(image, KEY)).then(() => true, () => false);
export const loadImage = () => run('readonly', (s) => s.get(KEY)).then((r) => (r && r.blob ? r : null), () => null);
export const clearImage = () => run('readwrite', (s) => s.delete(KEY)).then(() => true, () => false);

// The colour of each square of the picture, as the virtual robot's colour sensor reads it (picturecolor.js).
export async function scanPicture(url, cols, rows, side = 24) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('not-an-image'));
    i.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = cols * side;
  canvas.height = rows * side;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return scanSquares(g.getImageData(0, 0, canvas.width, canvas.height), cols, rows);
}

// A file the child's adult chose -> { blob, w, h }, no side over MAX_SIDE_PX. Rejects when it is not a picture.
export async function prepareImage(file, max = MAX_SIDE_PX) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('not-an-image'));
      i.src = url;
    });
    const w = img.naturalWidth || 1, h = img.naturalHeight || 1;
    const fit = fitWithin(w, h, max);
    if (!fit.scaled) return { blob: file, w, h };
    const canvas = document.createElement('canvas');
    canvas.width = fit.width;
    canvas.height = fit.height;
    canvas.getContext('2d').drawImage(img, 0, 0, fit.width, fit.height);
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
    return { blob: blob || file, w: fit.width, h: fit.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
