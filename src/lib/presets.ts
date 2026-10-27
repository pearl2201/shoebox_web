import type { Settings } from '../tools/types';

export interface Preset {
  name: string;
  settings: Settings;
}

const SETTINGS_PREFIX = 'shoebox.settings.';
const PRESETS_PREFIX = 'shoebox.presets.';

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); settings stay in memory.
  }
}

export function loadSettings(toolId: string, defaults: Settings): Settings {
  const stored = readJson<Settings>(SETTINGS_PREFIX + toolId);
  return stored ? { ...defaults, ...stored } : { ...defaults };
}

export function saveSettings(toolId: string, settings: Settings): void {
  writeJson(SETTINGS_PREFIX + toolId, settings);
}

export function resetSettings(toolId: string): void {
  try {
    window.localStorage.removeItem(SETTINGS_PREFIX + toolId);
  } catch {
    // ignore
  }
}

export function loadPresets(toolId: string): Preset[] {
  return readJson<Preset[]>(PRESETS_PREFIX + toolId) ?? [];
}

export function storePresets(toolId: string, presets: Preset[]): void {
  writeJson(PRESETS_PREFIX + toolId, presets);
}

export function addPreset(toolId: string, preset: Preset): Preset[] {
  const presets = loadPresets(toolId).filter((item) => item.name !== preset.name);
  const next = [...presets, preset];
  storePresets(toolId, next);
  return next;
}

export function removePreset(toolId: string, name: string): Preset[] {
  const next = loadPresets(toolId).filter((item) => item.name !== name);
  storePresets(toolId, next);
  return next;
}

export function exportPresetsFile(toolId: string, toolLabel: string): void {
  const payload = {
    tool: toolId,
    label: toolLabel,
    exportedAt: new Date().toISOString(),
    presets: loadPresets(toolId),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${toolId}-presets.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function importPresetsFile(toolId: string, file: File): Promise<Preset[]> {
  const text = await file.text();
  const parsed = JSON.parse(text) as unknown;

  const candidates = Array.isArray(parsed)
    ? parsed
    : (parsed as { presets?: unknown })?.presets;

  if (!Array.isArray(candidates)) throw new Error('This file does not contain presets.');

  const imported: Preset[] = [];
  for (const entry of candidates) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Preset).name === 'string' &&
      (entry as Preset).settings &&
      typeof (entry as Preset).settings === 'object'
    ) {
      imported.push({ name: (entry as Preset).name, settings: (entry as Preset).settings });
    }
  }

  if (imported.length === 0) throw new Error('No valid presets were found in that file.');

  let current = loadPresets(toolId);
  for (const preset of imported) {
    current = [...current.filter((item) => item.name !== preset.name), preset];
  }
  storePresets(toolId, current);
  return current;
}
