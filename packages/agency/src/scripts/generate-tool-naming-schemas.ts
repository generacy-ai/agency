#!/usr/bin/env tsx
/**
 * Generates JSON Schema files from tool naming Zod schemas.
 * Output: src/schemas/generated/tool-name.schema.json
 *         src/schemas/generated/tool-definition.schema.json
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolNameSchema } from '../tools/naming/tool-name.js';
import { ToolDefinitionSchema } from '../tools/naming/tool-definition.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../schemas/generated');
mkdirSync(outDir, { recursive: true });

const toolNameJsonSchema = zodToJsonSchema(ToolNameSchema, {
  name: 'ToolName',
  $refStrategy: 'none',
});

const toolDefJsonSchema = zodToJsonSchema(ToolDefinitionSchema, {
  name: 'ToolDefinition',
  $refStrategy: 'none',
});

const nameOutPath = resolve(outDir, 'tool-name.schema.json');
writeFileSync(nameOutPath, JSON.stringify(toolNameJsonSchema, null, 2) + '\n');
console.log(`Generated ${nameOutPath}`);

const defOutPath = resolve(outDir, 'tool-definition.schema.json');
writeFileSync(defOutPath, JSON.stringify(toolDefJsonSchema, null, 2) + '\n');
console.log(`Generated ${defOutPath}`);
