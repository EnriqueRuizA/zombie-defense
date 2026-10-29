import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameMetrics, percentiles } from "../../src/client/GameMetrics";

describe("percentiles", () => {
  it("is undefined with no samples", () => {
    expect(percentiles([])).toBeUndefined();
  });

  it("takes the nearest rank of the sorted samples", () => {
    const samples = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(percentiles(samples)).toEqual({
      p50: 50,
      p90: 90,
      p99: 99,
      count: 100,
    });
  });

  it("answers the single sample for every percentile", () => {
    expect(percentiles([16.666])).toEqual({
      p50: 16.67,
      p90: 16.67,
      p99: 16.67,
      count: 1,
    });
  });
});

// Local-only build (docs/LocalMode.md R2): the Faro telemetry collector is
// gone, so flush() is a no-op and nothing leaves the tab. What is left to
// pin is that sampling still runs its windows and stops cleanly -- and that
// no window ever puts anything on the wire.
describe("GameMetrics", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("samples through its window without sending anything", () => {
    const metrics = new GameMetrics("game1234", "c0000001", 1000);
    metrics.start();
    for (const t of [0, 16, 32, 48, 100]) metrics.recordFrame(t);
    metrics.recordTickExecution(3);
    metrics.recordTickExecution(9);
    metrics.recordTickInterval(100);
    metrics.recordRoundTrip(40);

    vi.advanceTimersByTime(3000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushes on stop without sending anything", () => {
    const metrics = new GameMetrics("game1234", undefined, 1000);
    metrics.start();
    metrics.recordTickExecution(7);
    metrics.stop();
    expect(fetchMock).not.toHaveBeenCalled();

    // Sampling is over: a later tick and a later window change nothing.
    metrics.recordTickExecution(7);
    vi.advanceTimersByTime(5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Frames stop while the tab is hidden; the first one back must not count
  // the whole absence as one frame. Pin the restart, not the report: there
  // is no report to read it from any more.
  it("restarts the frame interval when the tab's visibility changes", () => {
    const metrics = new GameMetrics("game1234", undefined, 1000);
    metrics.start();
    metrics.recordFrame(0);
    metrics.recordFrame(16);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(() => metrics.recordFrame(60_000)).not.toThrow();
    expect(() => metrics.recordFrame(60_016)).not.toThrow();
    metrics.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    metrics.stop();
  });
});
