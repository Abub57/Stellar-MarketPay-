"use strict";

jest.mock("../utils/wsEventQueue", () => ({ cleanupOldEvents: jest.fn() }));
jest.mock("../utils/logger", () => ({
  createServiceLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));

const { cleanupOldEvents } = require("../utils/wsEventQueue");
const { startWsEventCleanup } = require("./wsEventCleanupService");

describe("WebSocket event cleanup service", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("cleans up on startup and schedules another cleanup every 24 hours", async () => {
    cleanupOldEvents.mockResolvedValue(undefined);
    let scheduledCleanup;
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockImplementation((callback, delay) => {
      scheduledCleanup = callback;
      expect(delay).toBe(24 * 60 * 60 * 1000);
      return { unref: jest.fn() };
    });

    startWsEventCleanup();
    await Promise.resolve();
    expect(cleanupOldEvents).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    scheduledCleanup();
    await Promise.resolve();
    expect(cleanupOldEvents).toHaveBeenCalledTimes(2);
  });
});
