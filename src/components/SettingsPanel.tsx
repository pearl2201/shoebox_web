import { useEffect, useRef, useState } from 'react';
import {
  addPreset,
  exportPresetsFile,
  importPresetsFile,
  loadPresets,
  removePreset,
  type Preset,
} from '../lib/presets';
import type { FieldDef, Settings, ToolDef } from '../tools/types';

interface SettingsPanelProps {
  tool: ToolDef;
  settings: Settings;
  onChange: (settings: Settings) => void;
  onReset: () => void;
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case 'boolean':
      return (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          aria-label={field.label}
          className={`switch ${value ? 'on' : ''}`}
          onClick={() => onChange(!value)}
        >
          <span className="knob" />
        </button>
      );

    case 'number':
      return (
        <input
          className="input num"
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          value={typeof value === 'number' ? value : ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? (field.min ?? 0) : Number(event.target.value))
          }
        />
      );

    case 'select':
      return (
        <select
          className="input"
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );

    case 'textarea':
      return (
        <textarea
          className="input mono"
          rows={3}
          value={String(value ?? '')}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    default:
      return (
        <input
          className="input"
          type="text"
          value={String(value ?? '')}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

export function SettingsPanel({ tool, settings, onChange, onReset }: SettingsPanelProps) {
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets(tool.id));
  const [selected, setSelected] = useState('');
  const [presetName, setPresetName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPresets(loadPresets(tool.id));
    setSelected('');
    setPresetName('');
    setMessage(null);
  }, [tool.id]);

  function update(key: string, value: unknown) {
    onChange({ ...settings, [key]: value });
  }

  function handleSavePreset() {
    const trimmed = presetName.trim();
    if (!trimmed) return;

    const next = addPreset(tool.id, { name: trimmed, settings: { ...settings } });
    setPresets(next);
    setSelected(trimmed);
    setPresetName('');
    setMessage(`Preset “${trimmed}” saved in this browser.`);
  }

  function handleLoadPreset(name: string) {
    setSelected(name);
    if (!name) return;
    const preset = presets.find((item) => item.name === name);
    if (preset) {
      onChange({ ...tool.defaults, ...preset.settings });
      setMessage(`Loaded “${name}”.`);
    }
  }

  function handleDeletePreset() {
    if (!selected) return;
    const next = removePreset(tool.id, selected);
    setPresets(next);
    setMessage(`Deleted “${selected}”.`);
    setSelected('');
  }

  async function handleImport(file: File) {
    try {
      const next = await importPresetsFile(tool.id, file);
      setPresets(next);
      setMessage(`Imported ${file.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  return (
    <aside className="panel settings" aria-label="Tool settings">
      <div className="panel-head">
        <h3>Settings</h3>
        <button type="button" className="link" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="fields">
        {tool.fields.map((field) => (
          <div
            className={`field ${field.type === 'boolean' ? 'inline' : ''} ${
              field.type === 'text' || field.type === 'textarea' || field.type === 'select'
                ? 'wide'
                : ''
            }`}
            key={field.key}
          >
            <div className="field-text">
              <span className="field-label">{field.label}</span>
              {field.help && <span className="field-help">{field.help}</span>}
            </div>
            <FieldControl
              field={field}
              value={settings[field.key]}
              onChange={(value) => update(field.key, value)}
            />
          </div>
        ))}
      </div>

      <div className="panel-head spaced">
        <h3>Presets</h3>
        <span className="muted">local only</span>
      </div>

      <div className="preset-row">
        <select
          className="input"
          value={selected}
          onChange={(event) => handleLoadPreset(event.target.value)}
        >
          <option value="">Load a preset…</option>
          {presets.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>

      <div className="preset-row">
        <input
          className="input"
          type="text"
          placeholder="New preset name"
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSavePreset();
          }}
        />
        <button
          type="button"
          className="btn subtle"
          onClick={handleSavePreset}
          disabled={presetName.trim().length === 0}
        >
          Save
        </button>
      </div>

      <div className="preset-actions">
        <button
          type="button"
          className="link"
          onClick={() => exportPresetsFile(tool.id, tool.label)}
          disabled={presets.length === 0}
        >
          Export JSON
        </button>
        <button type="button" className="link" onClick={() => importRef.current?.click()}>
          Import JSON
        </button>
        {selected && (
          <button type="button" className="link danger" onClick={handleDeletePreset}>
            Delete “{selected}”
          </button>
        )}
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImport(file);
            event.target.value = '';
          }}
        />
      </div>

      {message && <p className="preset-message">{message}</p>}

      <p className="settings-note">
        Settings are remembered in this browser per tool. Export them as JSON to use them on another
        machine.
      </p>
    </aside>
  );
}
