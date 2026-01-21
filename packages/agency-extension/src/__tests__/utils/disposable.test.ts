import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import {
  DisposableManager,
  DisposableStore,
  TrackableDisposable,
  toDisposable,
  emptyDisposable,
  combineDisposables,
  registerDisposable,
} from '../../utils/disposable';

describe('DisposableManager', () => {
  it('should add disposables', () => {
    const manager = new DisposableManager();
    const disposable1 = { dispose: vi.fn() };
    const disposable2 = { dispose: vi.fn() };

    manager.add(disposable1);
    manager.add(disposable2);

    expect(manager.count).toBe(2);
  });

  it('should dispose all managed disposables', () => {
    const manager = new DisposableManager();
    const disposable1 = { dispose: vi.fn() };
    const disposable2 = { dispose: vi.fn() };

    manager.add(disposable1);
    manager.add(disposable2);
    manager.dispose();

    expect(disposable1.dispose).toHaveBeenCalled();
    expect(disposable2.dispose).toHaveBeenCalled();
  });

  it('should dispose in reverse order (LIFO)', () => {
    const manager = new DisposableManager();
    const order: number[] = [];

    manager.add({ dispose: () => order.push(1) });
    manager.add({ dispose: () => order.push(2) });
    manager.add({ dispose: () => order.push(3) });

    manager.dispose();

    expect(order).toEqual([3, 2, 1]);
  });

  it('should return the added disposable for chaining', () => {
    const manager = new DisposableManager();
    const disposable = { dispose: vi.fn() };

    const result = manager.add(disposable);

    expect(result).toBe(disposable);
  });

  it('should remove a specific disposable', () => {
    const manager = new DisposableManager();
    const disposable1 = { dispose: vi.fn() };
    const disposable2 = { dispose: vi.fn() };

    manager.add(disposable1);
    manager.add(disposable2);

    const removed = manager.remove(disposable1);

    expect(removed).toBe(true);
    expect(manager.count).toBe(1);

    manager.dispose();
    expect(disposable1.dispose).not.toHaveBeenCalled();
    expect(disposable2.dispose).toHaveBeenCalled();
  });

  it('should return false when removing non-existent disposable', () => {
    const manager = new DisposableManager();
    const disposable = { dispose: vi.fn() };

    const removed = manager.remove(disposable);

    expect(removed).toBe(false);
  });

  it('should be safe to dispose multiple times', () => {
    const manager = new DisposableManager();
    const disposable = { dispose: vi.fn() };

    manager.add(disposable);
    manager.dispose();
    manager.dispose();

    expect(disposable.dispose).toHaveBeenCalledTimes(1);
  });

  it('should immediately dispose items added after disposal', () => {
    const manager = new DisposableManager();
    manager.dispose();

    const disposable = { dispose: vi.fn() };
    manager.add(disposable);

    expect(disposable.dispose).toHaveBeenCalled();
  });

  it('should track disposed state', () => {
    const manager = new DisposableManager();

    expect(manager.disposed).toBe(false);

    manager.dispose();

    expect(manager.disposed).toBe(true);
  });

  it('should continue disposing other items if one throws', () => {
    const manager = new DisposableManager();
    const disposable1 = { dispose: vi.fn() };
    const errorDisposable = {
      dispose: () => {
        throw new Error('Test error');
      },
    };
    const disposable2 = { dispose: vi.fn() };

    manager.add(disposable1);
    manager.add(errorDisposable);
    manager.add(disposable2);

    // Should not throw
    expect(() => manager.dispose()).not.toThrow();

    expect(disposable1.dispose).toHaveBeenCalled();
    expect(disposable2.dispose).toHaveBeenCalled();
  });
});

describe('toDisposable', () => {
  it('should create a disposable from a function', () => {
    const cleanup = vi.fn();
    const disposable = toDisposable(cleanup);

    expect(cleanup).not.toHaveBeenCalled();

    disposable.dispose();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('emptyDisposable', () => {
  it('should create a no-op disposable', () => {
    const disposable = emptyDisposable();

    expect(() => disposable.dispose()).not.toThrow();
  });
});

describe('combineDisposables', () => {
  it('should dispose all combined disposables', () => {
    const disposable1 = { dispose: vi.fn() };
    const disposable2 = { dispose: vi.fn() };

    const combined = combineDisposables(disposable1, disposable2);
    combined.dispose();

    expect(disposable1.dispose).toHaveBeenCalled();
    expect(disposable2.dispose).toHaveBeenCalled();
  });

  it('should continue disposing if one throws', () => {
    const disposable1 = { dispose: vi.fn() };
    const errorDisposable = {
      dispose: () => {
        throw new Error('Test');
      },
    };
    const disposable2 = { dispose: vi.fn() };

    const combined = combineDisposables(disposable1, errorDisposable, disposable2);

    expect(() => combined.dispose()).not.toThrow();
    expect(disposable1.dispose).toHaveBeenCalled();
    expect(disposable2.dispose).toHaveBeenCalled();
  });
});

describe('TrackableDisposable', () => {
  it('should track disposed state', () => {
    const trackable = new TrackableDisposable();

    expect(trackable.isDisposed).toBe(false);

    trackable.dispose();

    expect(trackable.isDisposed).toBe(true);
  });

  it('should call cleanup callback on dispose', () => {
    const cleanup = vi.fn();
    const trackable = new TrackableDisposable(cleanup);

    trackable.dispose();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('should only call cleanup once', () => {
    const cleanup = vi.fn();
    const trackable = new TrackableDisposable(cleanup);

    trackable.dispose();
    trackable.dispose();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('DisposableStore', () => {
  it('should add and dispose items', () => {
    const store = new DisposableStore();
    const disposable = { dispose: vi.fn() };

    store.add(disposable);
    store.dispose();

    expect(disposable.dispose).toHaveBeenCalled();
  });

  it('should clear items without disposing the store', () => {
    const store = new DisposableStore();
    const disposable1 = { dispose: vi.fn() };
    const disposable2 = { dispose: vi.fn() };

    store.add(disposable1);
    store.clear();

    expect(disposable1.dispose).toHaveBeenCalled();
    expect(store.isDisposed).toBe(false);

    // Should be able to add new items after clear
    store.add(disposable2);
    store.dispose();

    expect(disposable2.dispose).toHaveBeenCalled();
  });

  it('should track disposed state', () => {
    const store = new DisposableStore();

    expect(store.isDisposed).toBe(false);

    store.dispose();

    expect(store.isDisposed).toBe(true);
  });
});

describe('registerDisposable', () => {
  it('should add disposable to context subscriptions', () => {
    const subscriptions: vscode.Disposable[] = [];
    const mockContext = {
      subscriptions,
    } as unknown as vscode.ExtensionContext;

    const disposable = { dispose: vi.fn() };

    const result = registerDisposable(mockContext, disposable);

    expect(result).toBe(disposable);
    expect(subscriptions).toContain(disposable);
  });
});
