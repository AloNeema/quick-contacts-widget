import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_SYNC_DELAY_MS, AUTO_SYNC_INTERVAL_MS, createAutoSyncScheduler, singleFlight } from "./autoSync";

describe("automatic contact sync", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it("syncs after startup and every thirty minutes", async () => {
    const microsoft = vi.fn(async () => {});
    const salesforce = vi.fn(async () => {});
    const scheduler = createAutoSyncScheduler([microsoft, salesforce], vi.fn());
    scheduler.start();
    expect(microsoft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DELAY_MS);
    expect(microsoft).toHaveBeenCalledTimes(1);
    expect(salesforce).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS - AUTO_SYNC_DELAY_MS);
    expect(microsoft).toHaveBeenCalledTimes(2);
    expect(salesforce).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("coalesces wake and sign-in requests while allowing the network to reconnect", async () => {
    const work = vi.fn(async () => {});
    const scheduler = createAutoSyncScheduler([work], vi.fn());
    scheduler.start();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DELAY_MS);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(1_000);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DELAY_MS - 1);
    expect(work).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(work).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("does not overlap slow scheduled runs or build a backlog", async () => {
    let finish!: () => void;
    const work = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const scheduler = createAutoSyncScheduler([work], vi.fn());
    scheduler.start();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DELAY_MS);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS * 2);
    expect(work).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS);
    expect(work).toHaveBeenCalledTimes(2);
    finish();
    scheduler.stop();
  });

  it("runs once more when a sign-in request lands during a run", async () => {
    let finish!: () => void;
    const work = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const scheduler = createAutoSyncScheduler([work], vi.fn());
    scheduler.start();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DELAY_MS);
    expect(work).toHaveBeenCalledTimes(1);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DELAY_MS);
    expect(work).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(work).toHaveBeenCalledTimes(2);
    finish();
    scheduler.stop();
  });

  it("continues with Salesforce after a Microsoft failure and retries next time", async () => {
    const failed = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const other = vi.fn(async () => {});
    const onError = vi.fn();
    const scheduler = createAutoSyncScheduler([failed, other], onError);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DELAY_MS);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS);
    expect(failed).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("stops delayed and periodic refreshes when the app quits", async () => {
    const work = vi.fn(async () => {});
    const scheduler = createAutoSyncScheduler([work], vi.fn());
    scheduler.start();
    scheduler.stop();
    scheduler.request();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS * 2);
    expect(work).not.toHaveBeenCalled();
  });

  it("does not start the next provider after stopping an active run", async () => {
    let finish!: () => void;
    const first = () => new Promise<void>(resolve => { finish = resolve; });
    const second = vi.fn(async () => {});
    const scheduler = createAutoSyncScheduler([first, second], vi.fn());
    scheduler.start();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DELAY_MS);
    scheduler.stop();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(second).not.toHaveBeenCalled();
  });

  it("starting twice does not register duplicate schedules", async () => {
    const work = vi.fn(async () => {});
    const scheduler = createAutoSyncScheduler([work], vi.fn());
    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS);
    expect(work).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});

describe("manual and automatic sync coordination", () => {
  it("shares an ongoing sync and allows a later fresh sync", async () => {
    let finish!: (value: number) => void;
    const work = vi.fn(() => new Promise<number>(resolve => { finish = resolve; }));
    const sync = singleFlight(work);
    const manual = sync();
    const scheduled = sync();
    expect(scheduled).toBe(manual);
    await Promise.resolve();
    expect(work).toHaveBeenCalledTimes(1);
    finish(7);
    await expect(manual).resolves.toBe(7);
    const next = sync();
    await Promise.resolve();
    expect(work).toHaveBeenCalledTimes(2);
    finish(8);
    await expect(next).resolves.toBe(8);
  });

  it("releases the in-flight guard after a failure", async () => {
    const work = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("recovered");
    const sync = singleFlight(work);
    await expect(sync()).rejects.toThrow("offline");
    await expect(sync()).resolves.toBe("recovered");
    expect(work).toHaveBeenCalledTimes(2);
  });
});
