import { ani2Sheet } from './ani2Sheet';
import { extractTiles } from './extractTiles';
import { listFiles } from './listFiles';
import { packSprites } from './packSprites';
import { sliceSprites } from './sliceSprites';
import { spriteHull } from './spriteHull';
import type { ToolDef } from './types';

export const tools: ToolDef[] = [
  packSprites,
  sliceSprites,
  ani2Sheet,
  extractTiles,
  spriteHull,
  listFiles,
];

export const toolGroups = Array.from(new Set(tools.map((tool) => tool.group)));

export function toolById(id: string): ToolDef {
  const tool = tools.find((candidate) => candidate.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}
