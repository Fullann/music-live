const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("High Concurrency Batching Logic Tests", () => {
  it("should consolidate multiple votes for the same request to the latest values", () => {
    const buffer = new Map(); // Map<requestId, { upvotes, downvotes }>
    
    // Simuler 5 votes rapides sur la même chanson requestId = 10
    const updates = [
      { id: 10, up: 1, down: 0 },
      { id: 10, up: 2, down: 0 },
      { id: 10, up: 2, down: 1 },
      { id: 10, up: 3, down: 1 },
      { id: 10, up: 4, down: 1 },
    ];

    updates.forEach((u) => {
      buffer.set(u.id, { upvotes: u.up, downvotes: u.down });
    });

    assert.strictEqual(buffer.size, 1);
    assert.deepStrictEqual(buffer.get(10), { upvotes: 4, downvotes: 1 });
  });

  it("should consolidate distinct requests into a single batch list", () => {
    const buffer = new Map();
    buffer.set(101, { upvotes: 12, downvotes: 1 });
    buffer.set(102, { upvotes: 8, downvotes: 0 });
    buffer.set(103, { upvotes: 3, downvotes: 4 });

    const batchList = [];
    for (const [requestId, counts] of buffer.entries()) {
      batchList.push({
        requestId,
        upvotes: counts.upvotes,
        downvotes: counts.downvotes,
      });
    }

    assert.strictEqual(batchList.length, 3);
    assert.deepStrictEqual(batchList[0], { requestId: 101, upvotes: 12, downvotes: 1 });
    assert.deepStrictEqual(batchList[1], { requestId: 102, upvotes: 8, downvotes: 0 });
    assert.deepStrictEqual(batchList[2], { requestId: 103, upvotes: 3, downvotes: 4 });
  });

  it("should aggregate live reaction burst counts", () => {
    const reactionsMap = new Map();
    const sendersSet = new Set();

    function addReaction(emoji, sender, count = 1) {
      const cur = reactionsMap.get(emoji) || 0;
      reactionsMap.set(emoji, cur + count);
      if (sender) sendersSet.add(sender);
    }

    addReaction("🔥", "Alice", 1);
    addReaction("🔥", "Bob", 3);
    addReaction("❤️", "Charlie", 2);
    addReaction("🔥", "David", 2);

    assert.strictEqual(reactionsMap.get("🔥"), 6);
    assert.strictEqual(reactionsMap.get("❤️"), 2);
    assert.strictEqual(sendersSet.size, 4);
  });
});
