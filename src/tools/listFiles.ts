import { sanitizeFileName } from '../lib/names';
import { bool, str } from './settings';
import type { Settings, ToolDef } from './types';

const FORMATS = [
  { value: 'lines', label: 'One file name per line' },
  { value: 'json', label: 'JSON array' },
  { value: 'as3', label: 'AS3 array' },
  { value: 'custom', label: 'Custom template' },
];

export const listFiles: ToolDef = {
  id: 'list-files',
  label: 'List Files',
  group: 'Utilities',
  icon: 'list',
  summary: 'Turn dropped files into a sorted list for manifests, loaders or code constants.',
  accepts: 'any',
  fields: [
    { key: 'format', label: 'Format', type: 'select', options: FORMATS },
    {
      key: 'custom',
      label: 'Template',
      type: 'textarea',
      help: 'Used by the custom format. @name = file name, @index = 1-based position.',
      placeholder: '  "@name",',
    },
    { key: 'sort', label: 'Sort alphabetically', type: 'boolean' },
    {
      key: 'writeFile',
      label: 'Also save a text file',
      type: 'boolean',
    },
    { key: 'fileName', label: 'Text file name', type: 'text', placeholder: 'files.txt' },
  ],
  defaults: {
    format: 'lines',
    custom: '"@name",',
    sort: true,
    writeFile: false,
    fileName: 'files.txt',
  },

  async run(files, settings: Settings) {
    if (files.length === 0) throw new Error('Drop files or a folder to list.');

    const format = str(settings, 'format', 'lines');
    const custom = str(settings, 'custom', '"@name",');
    const sort = bool(settings, 'sort', true);
    const writeFile = bool(settings, 'writeFile', false);
    const fileName = sanitizeFileName(str(settings, 'fileName', 'files.txt'), 'files.txt');

    let names = files.map((file) => file.name);
    if (sort) names = [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    let text: string;
    switch (format) {
      case 'json':
        text = JSON.stringify(names, null, 2);
        break;
      case 'as3':
        text = `var files:Array = [\n${names.map((name) => `\t"${name}"`).join(',\n')}\n];\n`;
        break;
      case 'custom':
        text = names
          .map((name, index) =>
            custom.replaceAll('@name', name).replaceAll('@index', String(index + 1)),
          )
          .join('\n');
        break;
      default:
        text = names.join('\n');
    }

    return {
      files: writeFile
        ? [{ name: fileName, blob: new Blob([text], { type: 'text/plain' }) }]
        : [],
      text,
      textLabel: 'File list',
      autoCopyText: true,
      summary: `${names.length} file${names.length === 1 ? '' : 's'} listed`,
    };
  },
};
