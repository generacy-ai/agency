import type * as vscode from 'vscode';
import type { ModeTreeItem } from '../providers/ModeTreeProvider';
import { ModeService } from '../services';
import { createScopedLogger } from '../utils';

const log = createScopedLogger('mode-commands');

/**
 * Switch to a different mode.
 *
 * @param vscodeModule The VS Code module
 * @param item Optional tree item (if invoked from tree view)
 */
export async function switchMode(
  vscodeModule: typeof vscode,
  item?: ModeTreeItem
): Promise<void> {
  const modeService = ModeService.getInstance();

  try {
    let modeId: string | undefined;

    if (item) {
      // Called from tree view context menu
      modeId = item.modeId;
    } else {
      // Called from command palette - show quick pick
      const modes = modeService.getModes();
      const currentMode = modeService.getCurrentMode();

      const quickPickItems = modes.map((mode) => ({
        label: mode.name,
        description: mode.id,
        detail: mode.id === currentMode?.config.id ? '✓ Currently active' : undefined,
        modeId: mode.id,
      }));

      const selected = await vscodeModule.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a mode to switch to',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (!selected) {
        return; // User cancelled
      }

      modeId = selected.modeId;
    }

    // Confirm switch
    const currentMode = modeService.getCurrentMode();
    if (currentMode?.config.id === modeId) {
      vscodeModule.window.showInformationMessage(`Already in mode: ${currentMode.config.name}`);
      return;
    }

    // Perform switch
    const result = await modeService.setCurrentMode({
      modeId,
      persist: true,
    });

    if (result.success) {
      const addedCount = result.addedTools.length;
      const removedCount = result.removedTools.length;

      let message = `Switched to mode: ${result.newModeId}`;
      if (addedCount > 0 || removedCount > 0) {
        message += ` (${addedCount} tools added, ${removedCount} tools removed)`;
      }

      vscodeModule.window.showInformationMessage(message);
      log.info(message);
    } else {
      vscodeModule.window.showErrorMessage(`Failed to switch mode: ${result.error}`);
      log.error('Mode switch failed', result.error);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscodeModule.window.showErrorMessage(`Error switching mode: ${message}`);
    log.error('Error in switchMode command', error);
  }
}

/**
 * View tools available in a mode.
 *
 * @param vscodeModule The VS Code module
 * @param modeId Mode ID (if called from tree view) or undefined (show picker)
 */
export async function viewModeTools(
  vscodeModule: typeof vscode,
  modeId?: string
): Promise<void> {
  const modeService = ModeService.getInstance();

  try {
    // If no modeId, show quick pick
    if (!modeId) {
      const modes = modeService.getModes();
      const quickPickItems = modes.map((mode) => ({
        label: mode.name,
        description: mode.id,
        modeId: mode.id,
      }));

      const selected = await vscodeModule.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a mode to view its tools',
        matchOnDescription: true,
      });

      if (!selected) {
        return; // User cancelled
      }

      modeId = selected.modeId;
    }

    // Get mode tree to find the mode with full context
    const tree = modeService.buildModeTree();
    const findMode = (modes: typeof tree): typeof tree[0] | undefined => {
      for (const mode of modes) {
        if (mode.config.id === modeId) {
          return mode;
        }
        const found = findMode(mode.children);
        if (found) {
          return found;
        }
      }
      return undefined;
    };

    const modeInfo = findMode(tree);
    if (!modeInfo) {
      vscodeModule.window.showErrorMessage(`Mode not found: ${modeId}`);
      return;
    }

    // Build tool list with categorization
    const inheritedTools = new Set(modeInfo.parent?.effectiveTools ?? []);
    const addedTools = modeInfo.config.includedTools.filter(t => !inheritedTools.has(t));
    const excludedTools = modeInfo.config.excludedTools;

    // Create quick pick items
    const items: vscode.QuickPickItem[] = [];

    // Header
    items.push({
      label: `Mode: ${modeInfo.config.name}`,
      kind: vscodeModule.QuickPickItemKind.Separator,
    });

    if (modeInfo.config.description) {
      items.push({
        label: modeInfo.config.description,
        kind: vscodeModule.QuickPickItemKind.Separator,
      });
    }

    // Added tools section
    if (addedTools.length > 0) {
      items.push({
        label: `Added Tools (${addedTools.length})`,
        kind: vscodeModule.QuickPickItemKind.Separator,
      });
      for (const tool of addedTools.sort()) {
        items.push({
          label: `  + ${tool}`,
          description: 'Added in this mode',
        });
      }
    }

    // Inherited tools section
    if (modeInfo.parent && inheritedTools.size > 0) {
      items.push({
        label: `Inherited Tools (${inheritedTools.size})`,
        kind: vscodeModule.QuickPickItemKind.Separator,
      });
      for (const tool of Array.from(inheritedTools).sort()) {
        items.push({
          label: `  ${tool}`,
          description: `Inherited from ${modeInfo.parent.config.name}`,
        });
      }
    }

    // Excluded tools section
    if (excludedTools.length > 0) {
      items.push({
        label: `Excluded Tools (${excludedTools.length})`,
        kind: vscodeModule.QuickPickItemKind.Separator,
      });
      for (const tool of excludedTools.sort()) {
        items.push({
          label: `  - ${tool}`,
          description: 'Excluded in this mode',
        });
      }
    }

    // Total
    items.push({
      label: `Total: ${modeInfo.effectiveTools.length} tools available`,
      kind: vscodeModule.QuickPickItemKind.Separator,
    });

    // Show quick pick (read-only)
    await vscodeModule.window.showQuickPick(items, {
      placeHolder: `Tools in mode: ${modeInfo.config.name}`,
      matchOnDescription: true,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscodeModule.window.showErrorMessage(`Error viewing mode tools: ${message}`);
    log.error('Error in viewModeTools command', error);
  }
}

/**
 * Refresh the mode tree view.
 */
export function refreshModes(): void {
  log.debug('Refresh modes command invoked');
  // The tree provider listens to ModeService events and refreshes automatically
  // This command is here for manual refresh if needed
}

/**
 * Initialize mode commands with required context.
 * Should be called during extension activation.
 */
export function initializeModeCommands(): void {
  log.debug('Mode commands initialized');
}

/**
 * Register mode commands with VS Code.
 *
 * @param vscodeModule The VS Code module
 * @returns Array of disposables for cleanup
 */
export function registerModeCommands(vscodeModule: typeof vscode): vscode.Disposable[] {
  return [
    vscodeModule.commands.registerCommand('agency.switchMode', (item?: ModeTreeItem) =>
      switchMode(vscodeModule, item)
    ),
    vscodeModule.commands.registerCommand('agency.viewModeTools', (modeId?: string) =>
      viewModeTools(vscodeModule, modeId)
    ),
    vscodeModule.commands.registerCommand('agency.refreshModes', () =>
      refreshModes()
    ),
  ];
}
