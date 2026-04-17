import { describe, it, expect, vi } from "vitest";
import { isRetriable, withRetry } from "./retry";

describe("isRetriable", () => {
  it("returns false for non-Error values", () => {
    expect(isRetriable(null)).toBe(false);
    expect(isRetriable(undefined)).toBe(false);
    expect(isRetriable("string error")).toBe(false);
    expect(isRetriable(42)).toBe(false);
    expect(isRetriable({ message: "rate limit" })).toBe(false);
  });

  it("matches rate limit patterns", () => {
    expect(isRetriable(new Error("Rate limit exceeded"))).toBe(true);
    expect(isRetriable(new Error("429 Too Many Requests"))).toBe(true);
    expect(isRetriable(new Error("too many requests"))).toBe(true);
  });

  it("matches timeout patterns", () => {
    expect(isRetriable(new Error("Request timeout"))).toBe(true);
    expect(isRetriable(new Error("Connection timed out"))).toBe(true);
    expect(isRetriable(new Error("ETIMEDOUT: connect failed"))).toBe(true);
  });

  it("matches network patterns", () => {
    expect(isRetriable(new Error("network error"))).toBe(true);
    expect(isRetriable(new Error("ECONNRESET"))).toBe(true);
    expect(isRetriable(new Error("ENOTFOUND api.linear.app"))).toBe(true);
    expect(isRetriable(new Error("socket hang up"))).toBe(true);
    expect(isRetriable(new Error("fetch failed"))).toBe(true);
  });

  it("matches 5xx server errors", () => {
    expect(isRetriable(new Error("500 Internal Server Error"))).toBe(true);
    expect(isRetriable(new Error("502 Bad Gateway"))).toBe(true);
    expect(isRetriable(new Error("503 Service Unavailable"))).toBe(true);
    expect(isRetriable(new Error("504 Gateway Timeout"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isRetriable(new Error("RATE LIMIT"))).toBe(true);
    expect(isRetriable(new Error("Network Error"))).toBe(true);
  });

  it("returns false for non-retriable errors", () => {
    expect(isRetriable(new Error("Invalid API key"))).toBe(false);
    expect(isRetriable(new Error("400 Bad Request"))).toBe(false);
    expect(isRetriable(new Error("401 Unauthorized"))).toBe(false);
    expect(isRetriable(new Error("404 Not Found"))).toBe(false);
    expect(isRetriable(new Error("Label name conflict"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retriable error and eventually succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { initialDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on non-retriable error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));
    await expect(withRetry(fn, { initialDelayMs: 1 })).rejects.toThrow("Invalid API key");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after max attempts on retriable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("500 Server Error"));
    await expect(withRetry(fn, { initialDelayMs: 1, maxAttempts: 3 })).rejects.toThrow(
      "500 Server Error",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses custom maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(withRetry(fn, { initialDelayMs: 1, maxAttempts: 5 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(5);
  });
});
