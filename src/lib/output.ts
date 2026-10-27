import { zipSync } from 'fflate';
import type { OutputFile } from '../tools/types';

interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}

export interface DirHandleLike {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

const DB_NAME = 'shoebox-web';
const STORE = 'kv';
const DIR_KEY = 'output-directory';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function supportsDirectoryPicker(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export async function chooseOutputDirectory(): Promise<string | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (options?: { mode?: string }) => Promise<DirHandleLike>;
    }
  ).showDirectoryPicker;

  if (!picker) return null;

  const handle = await picker({ mode: 'readwrite' });
  await idbSet(DIR_KEY, handle);
  return handle.name;
}

export async function getOutputDirectoryName(): Promise<string | null> {
  try {
    const handle = await idbGet<DirHandleLike>(DIR_KEY);
    return handle?.name ?? null;
  } catch {
    return null;
  }
}

export async function clearOutputDirectory(): Promise<void> {
  await idbSet(DIR_KEY, undefined);
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function saveToDirectory(
  handle: DirHandleLike,
  files: OutputFile[],
): Promise<boolean> {
  if (handle.queryPermission) {
    let permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && handle.requestPermission) {
      permission = await handle.requestPermission({ mode: 'readwrite' });
    }
    if (permission !== 'granted') return false;
  }

  for (const file of files) {
    const fileHandle = await handle.getFileHandle(file.name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file.blob);
    await writable.close();
  }

  return true;
}

export interface SaveResult {
  mode: 'folder' | 'zip';
  folderName?: string;
}

/**
 * Saves results into the previously chosen folder, or downloads a ZIP when no
 * folder handle exists / permission was denied.
 */
export async function saveOutputs(files: OutputFile[], zipName: string): Promise<SaveResult> {
  if (files.length === 0) throw new Error('There are no files to save.');

  const handle = await idbGet<DirHandleLike>(DIR_KEY).catch(() => undefined);
  if (handle && supportsDirectoryPicker()) {
    try {
      const saved = await saveToDirectory(handle, files);
      if (saved) return { mode: 'folder', folderName: handle.name };
    } catch {
      // Fall through to the ZIP download.
    }
  }

  if (files.length === 1) {
    download(files[0].blob, files[0].name);
    return { mode: 'zip' };
  }

  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.name] = new Uint8Array(await file.blob.arrayBuffer());
  }
  const zipped = zipSync(entries, { level: 0 });
  download(new Blob([zipped as BlobPart], { type: 'application/zip' }), zipName);
  return { mode: 'zip' };
}
