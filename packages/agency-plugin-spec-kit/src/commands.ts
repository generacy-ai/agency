import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Absolute path to the commands/ directory within the installed package.
 */
export const commandsDir = join(__dirname, '..', 'commands');

/**
 * Copies all command .md files from the package's commands/ directory
 * to the target directory.
 *
 * @param targetDir - Destination directory. Defaults to ~/.claude/commands/agency-spec-kit/
 * @returns Array of filenames that were copied
 */
export async function installCommands(targetDir?: string): Promise<string[]> {
  const dest = targetDir ?? join(homedir(), '.claude', 'commands', 'agency-spec-kit');
  await mkdir(dest, { recursive: true });
  const files = (await readdir(commandsDir)).filter(f => f.endsWith('.md'));
  await Promise.all(files.map(f => copyFile(join(commandsDir, f), join(dest, f))));
  return files;
}
