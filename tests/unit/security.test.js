const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeInput } = require("../../src/middlewares/security");

describe("Security Middleware Tests", () => {
  it("should strip HTML and script tags from request body", () => {
    const req = {
      body: {
        name: "Normal Name",
        malicious: "<script>alert('xss')</script>Hello",
        html: "<b>Bold</b> and <i>Italic</i>",
      },
      query: {},
    };
    const res = {};
    let nextCalled = false;

    sanitizeInput(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.body.name, "Normal Name");
    assert.strictEqual(req.body.malicious, "Hello");
    assert.strictEqual(req.body.html, "Bold and Italic");
  });

  it("should strip HTML tags from request query parameters", () => {
    const req = {
      body: {},
      query: {
        q: "<img src=x onerror=alert(1)>Search Query",
      },
    };
    const res = {};
    let nextCalled = false;

    sanitizeInput(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.query.q, "Search Query");
  });
});
