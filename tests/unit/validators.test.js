const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { validationResult } = require("express-validator");
const { registerValidator, loginValidator } = require("../../src/validators/auth.validator");
const { createEventValidator, eventIdValidator, updateRateLimitValidator } = require("../../src/validators/events.validator");

async function runValidators(validators, req) {
  for (const validator of validators) {
    await validator.run(req);
  }
  return validationResult(req);
}

describe("Express Validators Tests", () => {
  describe("registerValidator", () => {
    it("should accept valid registration data", async () => {
      const req = {
        body: {
          name: "Thomas Dupont",
          email: "thomas@example.com",
          password: "Password123",
        },
      };
      const result = await runValidators(registerValidator, req);
      assert.strictEqual(result.isEmpty(), true);
    });

    it("should reject invalid email and weak password", async () => {
      const req = {
        body: {
          name: "T",
          email: "invalid-email",
          password: "weak",
        },
      };
      const result = await runValidators(registerValidator, req);
      assert.strictEqual(result.isEmpty(), false);
      const errors = result.array().map((e) => e.path || e.param);
      assert.ok(errors.includes("name"));
      assert.ok(errors.includes("email"));
      assert.ok(errors.includes("password"));
    });
  });

  describe("loginValidator", () => {
    it("should accept valid login data", async () => {
      const req = {
        body: {
          email: "dj@musiclive.com",
          password: "SomePassword1",
        },
      };
      const result = await runValidators(loginValidator, req);
      assert.strictEqual(result.isEmpty(), true);
    });

    it("should reject empty credentials", async () => {
      const req = { body: { email: "", password: "" } };
      const result = await runValidators(loginValidator, req);
      assert.strictEqual(result.isEmpty(), false);
    });
  });

  describe("createEventValidator", () => {
    it("should accept valid event name", async () => {
      const req = { body: { name: "Soirée Anniversaire 30 ans" } };
      const result = await runValidators(createEventValidator, req);
      assert.strictEqual(result.isEmpty(), true);
    });

    it("should reject too short event name", async () => {
      const req = { body: { name: "ab" } };
      const result = await runValidators(createEventValidator, req);
      assert.strictEqual(result.isEmpty(), false);
    });
  });

  describe("eventIdValidator", () => {
    it("should accept valid UUIDv4 eventId", async () => {
      const req = { params: { eventId: "c28b49e2-88f5-46b0-bfb9-c1e55026a792" } };
      const result = await runValidators(eventIdValidator, req);
      assert.strictEqual(result.isEmpty(), true);
    });

    it("should reject non-UUID eventId", async () => {
      const req = { params: { eventId: "not-a-uuid-123" } };
      const result = await runValidators(eventIdValidator, req);
      assert.strictEqual(result.isEmpty(), false);
    });
  });

  describe("updateRateLimitValidator", () => {
    it("should accept valid max (1-50) and window (1-120)", async () => {
      const req = {
        params: { eventId: "c28b49e2-88f5-46b0-bfb9-c1e55026a792" },
        body: { max: 5, window: 30 },
      };
      const result = await runValidators(updateRateLimitValidator, req);
      assert.strictEqual(result.isEmpty(), true);
    });

    it("should reject out-of-range rate limit values", async () => {
      const req = {
        params: { eventId: "c28b49e2-88f5-46b0-bfb9-c1e55026a792" },
        body: { max: 999, window: 0 },
      };
      const result = await runValidators(updateRateLimitValidator, req);
      assert.strictEqual(result.isEmpty(), false);
    });
  });
});
