import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { SettingsPanel } from './components/SettingsPanel';
import { ToolRail } from './components/ToolRail';
import { Workbench, type Job } from './components/Workbench';
import { copyText } from './lib/clipboard';
import {
  chooseOutputDirectory,
  getOutputDirectoryName,
  saveOutputs,
  supportsDirectoryPicker,
} from './lib/output';
import { loadSettings, resetSettings, saveSettings } from './lib/presets';
import { toolById, tools } from './tools/registry';
import type { Settings, ToolResult } from './tools/types';

export default function App() {
  const [activeId, setActiveId] = useState(tools[0].id);
  const [settingsByTool, setSettingsByTool] = useState<Record<string, Settings>>(() => {
    const initial: Record<string, Settings> = {};
    for (const tool of tools) initial[tool.id] = loadSettings(tool.id, tool.defaults);
    return initial;
  });
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<Job>({ status: 'idle', message: '' });
  const [result, setResult] = useState<ToolResult | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const tool = toolById(activeId);
  const settings = settingsByTool[activeId] ?? tool.defaults;
  const canPickFolder = supportsDirectoryPicker();

  useEffect(() => {
    void getOutputDirectoryName().then(setFolderName);
  }, []);

  useEffect(() => {
    saveSettings(activeId, settings);
  }, [activeId, settings]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const index = Number(event.key);
      if (Number.isInteger(index) && index >= 1 && index <= tools.length) {
        selectTool(tools[index - 1].id);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function clearPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function selectTool(id: string) {
    setActiveId(id);
    setFiles([]);
    setResult(null);
    setSaveMessage(null);
    setJob({ status: 'idle', message: '' });
    clearPreview();
  }

  function addFiles(incoming: File[]) {
    setFiles((previous) => {
      const merged = [...previous];
      for (const file of incoming) {
        const exists = merged.some(
          (candidate) =>
            candidate.name === file.name &&
            candidate.size === file.size &&
            candidate.lastModified === file.lastModified,
        );
        if (!exists) merged.push(file);
      }
      return merged;
    });
    setSaveMessage(null);
  }

  function removeFile(index: number) {
    setFiles((previous) => previous.filter((_, position) => position !== index));
  }

  function clearFiles() {
    setFiles([]);
    setResult(null);
    setSaveMessage(null);
    setJob({ status: 'idle', message: '' });
    clearPreview();
  }

  function updateSettings(next: Settings) {
    setSettingsByTool((previous) => ({ ...previous, [activeId]: next }));
  }

  function resetActiveSettings() {
    resetSettings(activeId);
    setSettingsByTool((previous) => ({ ...previous, [activeId]: { ...tool.defaults } }));
    setSaveMessage('Settings reset to defaults.');
  }

  async function run() {
    if (files.length === 0 || job.status === 'running') return;

    clearPreview();
    setResult(null);
    setSaveMessage(null);
    setJob({ status: 'running', message: 'Starting…' });

    try {
      const output = await tool.run(files, settings, {
        progress: (message) => setJob({ status: 'running', message }),
      });

      previewUrlRef.current = output.preview?.url ?? null;
      setResult(output);

      if (output.text && output.autoCopyText) {
        const copied = await copyText(output.text);
        if (copied) setSaveMessage('Result copied to the clipboard.');
      }

      setJob({
        status: 'done',
        message: output.preview ? 'Done.' : (output.summary ?? 'Done.'),
      });
    } catch (error) {
      setJob({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function saveResults() {
    if (!result || result.files.length === 0) return;

    try {
      const zipName = result.files.length === 1 ? result.files[0].name : `${tool.id}-results.zip`;
      const outcome = await saveOutputs(result.files, zipName);

      if (outcome.mode === 'folder') {
        setFolderName(outcome.folderName ?? folderName);
        setSaveMessage(`Saved ${result.files.length} file(s) to “${outcome.folderName}”.`);
      } else {
        setSaveMessage(
          result.files.length === 1
            ? 'Downloaded the result file.'
            : 'Downloaded a ZIP with all results.',
        );
      }
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Could not save the results.');
    }
  }

  async function copyResultText() {
    if (!result?.text) return;
    const copied = await copyText(result.text);
    setSaveMessage(copied ? 'Copied to the clipboard.' : 'Clipboard access was blocked.');
  }

  async function chooseFolder() {
    if (!canPickFolder) {
      setSaveMessage('This browser cannot pick folders — results download as a ZIP instead.');
      return;
    }

    try {
      const name = await chooseOutputDirectory();
      if (name) {
        setFolderName(name);
        setSaveMessage(`Output folder set to “${name}”.`);
      }
    } catch {
      // The user dismissed the picker.
    }
  }

  return (
    <div className="app">
      <Header folderName={folderName} canPickFolder={canPickFolder} onChooseFolder={chooseFolder} />

      <div className="layout">
        <ToolRail activeId={activeId} onSelect={selectTool} />

        <Workbench
          tool={tool}
          files={files}
          job={job}
          result={result}
          saveMessage={saveMessage}
          onFiles={addFiles}
          onRemove={removeFile}
          onClear={clearFiles}
          onRun={run}
          onSave={saveResults}
          onCopyText={copyResultText}
        />

        <SettingsPanel
          key={tool.id}
          tool={tool}
          settings={settings}
          onChange={updateSettings}
          onReset={resetActiveSettings}
        />
      </div>
    </div>
  );
}
