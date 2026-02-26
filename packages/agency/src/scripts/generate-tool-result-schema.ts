#!/usr/bin/env tsx
/**
 * Generates JSON Schema from TerseToolResultSchema for external consumers.
 * Output: src/schemas/generated/tool-result.schema.json
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TerseToolResultSchema } from '../schemas/tool-result.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../schemas/generated');
mkdirSync(outDir, { recursive: true });

const jsonSchema = zodToJsonSchema(TerseToolResultSchema, {
  name: 'TerseToolResult',
  $refStrategy: 'none',
});

const outPath = resolve(outDir, 'tool-result.schema.json');
writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + '\n');
console.log(`Generated ${outPath}`);
