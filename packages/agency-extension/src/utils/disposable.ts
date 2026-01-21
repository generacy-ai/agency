import type * as vscode from 'vscode';

/**
 * A manager for VS Code disposables that ensures proper cleanup.
 * Implements the Disposable interface for easy integration with VS Code's lifecycle.
 */
export class DisposableManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private isDisposed = false;

  /**
   * Add a disposable to be managed.
   * Returns the disposable for chaining.
   */
  add<T extends vscode.Disposable>(disposable: T): T {
    if (this.isDisposed) {
      // If already disposed, immediately dispose the new item
      disposable.dispose();
      return disposable;
    }
    this.disposables.push(disposable);
    return disposable;
  }

  /**
   * Add multiple disposables at once.
   */
  addAll(...disposables: vscode.Disposable[]): void {
    for (const disposable of disposables) {
      this.add(disposable);
    }
  }

  /**
   * Remove a specific disposable without disposing it.
   * Returns true if the disposable was found and removed.
   */
  remove(disposable: vscode.Disposable): boolean {
    const index = this.disposables.indexOf(disposable);
    if (index !== -1) {
      this.disposables.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get the count of managed disposables.
   */
  get count(): number {
    return this.disposables.length;
  }

  /**
   * Check if the manager has been disposed.
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Dispose all managed disposables.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // Dispose in reverse order (LIFO)
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      try {
        disposable?.dispose();
      } catch (error) {
        // Log but don't throw - ensure all disposables get a chance to clean up
        console.error('Error disposing resource:', error);
      }
    }
  }
}

/**
 * Create a disposable from a cleanup function.
 */
export function toDisposable(fn: () => void): vscode.Disposable {
  return { dispose: fn };
}

/**
 * Create a disposable that does nothing.
 * Useful as a placeholder or null object pattern.
 */
export function emptyDisposable(): vscode.Disposable {
  return { dispose: () => {} };
}

/**
 * Combine multiple disposables into one.
 * Disposing the combined disposable will dispose all inner disposables.
 */
export function combineDisposables(...disposables: vscode.Disposable[]): vscode.Disposable {
  return {
    dispose: () => {
      for (const disposable of disposables) {
        try {
          disposable.dispose();
        } catch (error) {
          console.error('Error disposing resource:', error);
        }
      }
    },
  };
}

/**
 * A disposable that tracks whether it has been disposed.
 */
export class TrackableDisposable implements vscode.Disposable {
  private _isDisposed = false;
  private readonly onDisposeCallback?: () => void;

  constructor(onDispose?: () => void) {
    this.onDisposeCallback = onDispose;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this.onDisposeCallback?.();
  }
}

/**
 * A disposable store that can be used to collect disposables
 * and then dispose them all at once or clear them.
 */
export class DisposableStore implements vscode.Disposable {
  private readonly manager = new DisposableManager();
  private _isDisposed = false;

  /**
   * Add a disposable to the store.
   */
  add<T extends vscode.Disposable>(disposable: T): T {
    return this.manager.add(disposable);
  }

  /**
   * Clear all disposables without marking the store as disposed.
   * This allows the store to be reused.
   */
  clear(): void {
    // Dispose all current items
    const temp = new DisposableManager();
    temp.addAll(...(this.manager as any).disposables);
    temp.dispose();
    // Reset the manager's internal array
    (this.manager as any).disposables = [];
    (this.manager as any).isDisposed = false;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this.manager.dispose();
  }
}

/**
 * Register a disposable with an extension context.
 * This is a convenience function for the common pattern of
 * creating a disposable and immediately registering it.
 */
export function registerDisposable<T extends vscode.Disposable>(
  context: vscode.ExtensionContext,
  disposable: T
): T {
  context.subscriptions.push(disposable);
  return disposable;
}
