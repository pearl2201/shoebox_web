export type Settings = Record<string, unknown>;

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'text' | 'textarea' | 'select';
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  options?: SelectOption[];
}

export interface OutputFile {
  name: string;
  blob: Blob;
}

export interface ToolPreview {
  url: string;
  width: number;
  height: number;
}

export interface ToolResult {
  files: OutputFile[];
  text?: string;
  textLabel?: string;
  autoCopyText?: boolean;
  preview?: ToolPreview;
  summary?: string;
  notes?: string[];
}

export interface ToolContext {
  progress(message: string): void;
}

export interface ToolDef {
  id: string;
  label: string;
  group: string;
  icon: string;
  summary: string;
  accepts: 'images' | 'any';
  fields: FieldDef[];
  defaults: Settings;
  run(files: File[], settings: Settings, ctx: ToolContext): Promise<ToolResult>;
}
