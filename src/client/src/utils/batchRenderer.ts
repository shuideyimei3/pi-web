/**
 * BatchRenderer — aligns DOM updates with browser refresh rate (60fps).
 *
 * Problem: streaming text events arrive at unpredictable intervals.
 * If we update DOM immediately on every event, we get:
 *   - layout thrashing from interleaved reads/writes
 *   - dropped frames when events arrive faster than 16.6ms
 *   - inconsistent visual cadence (text appears in bursts)
 *
 * Solution: queue all updates and flush them inside a single
 * requestAnimationFrame callback. This guarantees:
 *   - at most one layout + paint per frame
 *   - updates are coalesced when events arrive faster than 60fps
 *   - smooth, consistent output cadence
 */

export interface BatchRendererOptions {
  /** Target frame rate (default: 60 = ~16.6ms per frame) */
  targetFps?: number;
  /** Maximum time to hold updates before flushing (default: 33ms) */
  maxLatencyMs?: number;
}

interface QueuedUpdate {
  id: string;
  callback: () => void;
}

export class BatchRenderer {
  private queue = new Map<string, QueuedUpdate>();
  private rafId: number | undefined;
  private flushTimer: number | undefined;
  private readonly targetFps: number;
  private readonly maxLatencyMs: number;
  private isRunning = false;

  constructor(options: BatchRendererOptions = {}) {
    this.targetFps = options.targetFps ?? 60;
    this.maxLatencyMs = options.maxLatencyMs ?? 33;
  }

  /**
   * Schedule a callback to run on the next animation frame.
   * Multiple calls with the same id will be deduplicated (last one wins).
   */
  schedule(id: string, callback: () => void): void {
    this.queue.set(id, { id, callback });
    this.ensureScheduled();
  }

  /**
   * Schedule a one-time flush (no deduplication).
   */
  scheduleOnce(callback: () => void): void {
    const id = `__once_${String(Date.now())}_${String(Math.random())}`;
    this.schedule(id, callback);
  }

  /**
   * Immediately flush all pending updates (synchronous).
   * Use sparingly — prefer the automatic rAF flush.
   */
  flushNow(): void {
    this.cancelScheduled();
    this.executeQueue();
  }

  /**
   * Dispose and cancel any pending updates.
   */
  dispose(): void {
    this.cancelScheduled();
    this.queue.clear();
    this.isRunning = false;
  }

  private ensureScheduled(): void {
    if (this.rafId !== undefined) return;
    this.isRunning = true;

    // Schedule the rAF flush
    this.rafId = requestAnimationFrame(() => {
      this.rafId = undefined;
      this.executeQueue();
    });

    // Also schedule a max-latency timer as safety net
    // (in case the tab is backgrounded and rAF is throttled)
    this.flushTimer = window.setTimeout(() => {
      if (this.rafId !== undefined) {
        cancelAnimationFrame(this.rafId);
        this.rafId = undefined;
      }
      this.executeQueue();
    }, this.maxLatencyMs);
  }

  private cancelScheduled(): void {
    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
    if (this.flushTimer !== undefined) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private executeQueue(): void {
    if (this.queue.size === 0) return;

    // Capture current queue and clear it atomically
    const currentQueue = new Map(this.queue);
    this.queue.clear();

    // Execute all callbacks
    for (const update of currentQueue.values()) {
      try {
        update.callback();
      } catch (error) {
        console.error("BatchRenderer callback failed:", error);
      }
    }

    this.isRunning = false;
  }
}

/**
 * Global singleton for chat streaming updates.
 * All streaming nodes share one batch renderer to minimize layout thrashing.
 */
export const chatBatchRenderer = new BatchRenderer({ targetFps: 60, maxLatencyMs: 33 });
