const test = require("node:test");
const assert = require("node:assert");
const app = require("../server/app");

async function withServer(fn) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("GET /api/health returns ok", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { status: "ok" });
  });
});

test("POST /api/meds rejects a missing medication name", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/meds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dog_name: "Buddy" }),
    });
    assert.strictEqual(res.status, 400);
  });
});

test("POST /api/meds/1/logs rejects an invalid status", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/meds/1/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "banana" }),
    });
    assert.strictEqual(res.status, 400);
  });
});
