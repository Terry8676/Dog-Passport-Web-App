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

function postJson(base, path, body) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET /api/health returns ok", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { status: "ok" });
  });
});

test("GET /api/dogs requires login", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/dogs`);
    assert.strictEqual(res.status, 401);
  });
});

test("POST /api/dogs requires login", async () => {
  await withServer(async (base) => {
    const res = await postJson(base, "/api/dogs", { name: "Buddy" });
    assert.strictEqual(res.status, 401);
  });
});

test("POST /api/meds/1/logs requires login", async () => {
  await withServer(async (base) => {
    const res = await postJson(base, "/api/meds/1/logs", { status: "given" });
    assert.strictEqual(res.status, 401);
  });
});

test("POST /api/invites/redeem requires login", async () => {
  await withServer(async (base) => {
    const res = await postJson(base, "/api/invites/redeem", { code: "ABC" });
    assert.strictEqual(res.status, 401);
  });
});

test("signup rejects an invalid email", async () => {
  await withServer(async (base) => {
    const res = await postJson(base, "/api/auth/signup", { email: "nope", password: "longenough1" });
    assert.strictEqual(res.status, 400);
  });
});

test("signup rejects a short password", async () => {
  await withServer(async (base) => {
    const res = await postJson(base, "/api/auth/signup", { email: "a@b.com", password: "short" });
    assert.strictEqual(res.status, 400);
  });
});
