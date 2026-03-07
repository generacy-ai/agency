#!/usr/bin/env node
import { installCommands } from './commands.js';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'install-commands') {
  const targetIdx = args.indexOf('--target');
  const targetDir = targetIdx !== -1 ? args[targetIdx + 1] : undefined;

  try {
    const files = await installCommands(targetDir);
    console.log(`Copied ${files.length} command files:`);
    for (const file of files) {
      console.log(`  - ${file}`);
    }
  } catch (err) {
    console.error('Failed to install commands:', (err as Error).message);
    process.exit(1);
  }
} else {
  console.error('Usage: agency-spec-kit install-commands [--target <dir>]');
  process.exit(1);
}
