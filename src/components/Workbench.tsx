import { useRef, useState } from 'react';
import type { ToolDef, ToolResult } from '../tools/types';
import { Icon } from './Icon';

export type JobStatus = 'idle' | 'running' | 'done' | 'error';

export interface Job {
  status: JobStatus;
  message: string;
}

interface WorkbenchProps {
  tool: ToolDef;
  files: File[];
  job: Job;
  result: ToolResult | null;
  saveMessage: string | null;
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onRun: () => void;
  onSave: () => void;
  onCopyText: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Workbench({
  tool,
  files,
  job,
  result,
  saveMessage,
  onFiles,
  onRemove,
  onClear,
  onRun,
  onSave,
  onCopyText,
}: WorkbenchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = job.status === 'running';

  return (
    <section className="workbench panel">
      <div className="tool-head">
        <div className="tool-title">
          <span className="tool-icon">
            <Icon name={tool.icon} size={22} />
          </span>
          <div>
            <h2>{tool.label}</h2>
            <p>{tool.summary}</p>
          </div>
        </div>
        <span className="privacy-badge">100% local</span>
      </div>

      <div
        className={`dropzone ${dragging ? 'is-drag' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = Array.from(event.dataTransfer.files);
          if (dropped.length > 0) onFiles(dropped);
        }}
      >
        <Icon name="drop" size={30} />
        <strong>
          {tool.accepts === 'images' ? 'Drop images here' : 'Drop files here'}
        </strong>
        <span>or click to browse — nothing leaves your machine</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={tool.accepts === 'images' ? 'image/*' : undefined}
          onChange={(event) => {
            const chosen = Array.from(event.target.files ?? []);
            if (chosen.length > 0) onFiles(chosen);
            event.target.value = '';
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="file-chips">
          <div className="chips-head">
            <span>
              {files.length} file{files.length === 1 ? '' : 's'} ready
            </span>
            <button type="button" className="link" onClick={onClear}>
              Clear
            </button>
          </div>
          <ul>
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                <Icon name="image" size={14} />
                <span className="chip-name">{file.name}</span>
                <span className="chip-size">{formatSize(file.size)}</span>
                <button
                  type="button"
                  className="chip-remove"
                  onClick={() => onRemove(index)}
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn primary"
          onClick={onRun}
          disabled={files.length === 0 || busy}
        >
          {busy ? <span className="spinner" /> : <Icon name="play" size={15} />}
          {busy ? 'Working…' : `Run ${tool.label}`}
        </button>

        {result && result.files.length > 0 && (
          <button type="button" className="btn ghost" onClick={onSave}>
            <Icon name="download" size={16} />
            {result.files.length === 1 ? 'Save file' : `Save ${result.files.length} files`}
          </button>
        )}

        {result?.text && (
          <button type="button" className="btn ghost" onClick={onCopyText}>
            <Icon name="copy" size={16} />
            Copy text
          </button>
        )}
      </div>

      {job.status !== 'idle' && (
        <div className={`status ${job.status}`}>
          {busy && <span className="spinner" />}
          <span>{job.message}</span>
        </div>
      )}

      {saveMessage && <div className="notice">{saveMessage}</div>}

      {result?.preview && (
        <figure className="preview">
          <div className="preview-frame">
            <img src={result.preview.url} alt="Result preview" />
          </div>
          <figcaption>
            {result.preview.width} × {result.preview.height} px
            {result.summary ? ` · ${result.summary}` : ''}
          </figcaption>
        </figure>
      )}

      {result?.notes && result.notes.length > 0 && (
        <ul className="notes">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {result?.text && (
        <div className="text-output">
          <div className="text-output-head">
            <span>{result.textLabel ?? 'Output'}</span>
            <span className="muted">{result.text.length.toLocaleString()} chars</span>
          </div>
          <pre>{result.text.length > 6000 ? `${result.text.slice(0, 6000)}\n…` : result.text}</pre>
        </div>
      )}

      {result && result.files.length > 0 && (
        <ul className="output-files">
          {result.files.map((file) => (
            <li key={file.name}>
              <span className="file-dot" />
              <span className="chip-name">{file.name}</span>
              <span className="chip-size">{formatSize(file.blob.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
