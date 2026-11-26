import { describe, expect, it } from "vitest";
import {
  createAuthService,
  decryptDoc,
  encryptDoc,
  memoryStore,
  readToken,
  signLaunchToken,
  signToken,
  type AuthEnv,
  type LaunchClaims,
} from "./userAuth";
import { createHistoryService, memoryHistoryStore } from "./history";

const SECRET = "test-secret-for-unit-tests";
const ENV: AuthEnv = {
  AUTH_SECRET: SECRET,
  VITE_ADMIN_EMAIL: "admin@example.test",
  VITE_ADMIN_PASSWORD: "admin-seed-1",
  MANAGER_EMAIL: "boss@example.test",
  MANAGER_PASSWORD: "boss-seed-1",
  LMS_SSO_SECRET: "lms-shared-secret",
};

function launch(over: Partial<LaunchClaims> = {}, secret = "lms-shared-secret") {
  const now = Date.now();
  const claims: LaunchClaims = {
    v: 1,
    iss: "learn.infinix.test",
    sub: "lms-1",
    email: "Noa@Example.test",
    name: "נועה",
    courses: ["כלכלה", "מקצועית א׳"],
    iat: now,
    exp: now + 120_000,
    jti: `j-${Math.random()}`,
    ...over,
  };
  return signLaunchToken(claims, secret);
}

function setup(env: AuthEnv = ENV) {
  const store = memoryStore();
  const service = createAuthService(store, env);
  const call = (method: string, action: string, body?: unknown, token?: string, id?: string) =>
    service.handle({ method, action, body, id, authorization: token ? `Bearer ${token}` : undefined });
  const login = async (email: string, password: string) => {
    const out = await call("POST", "login", { email, password });
    return { out, token: (out.body as { token?: string }).token || "" };
  };
  return { store, call, login, service };
}

describe("crypto helpers", () => {
  it("round-trips the document and refuses another key", () => {
    const doc = { version: 1 as const, users: [] };
    const text = encryptDoc(doc, SECRET);
    expect(text).not.toContain("users");
    expect(decryptDoc(text, SECRET)).toEqual(doc);
    expect(() => decryptDoc(text, "other-secret")).toThrow();
  });

  it("rejects tampered or expired tokens", () => {
    const token = signToken({ sub: "u1", role: "trainee", pv: 0, exp: Date.now() + 1000 }, SECRET);
    expect(readToken(token, SECRET)?.sub).toBe("u1");
    expect(readToken(token, "other")).toBeNull();
    const forged = signToken({ sub: "u1", role: "manager", pv: 0, exp: Date.now() + 1000 }, "other");
    expect(readToken(forged, SECRET)).toBeNull();
    expect(readToken(token, SECRET, Date.now() + 5000)).toBeNull();
  });
});

describe("auth service", () => {
  it("refuses to run without a secret", async () => {
    const { call } = setup({ ...ENV, AUTH_SECRET: "" });
    expect((await call("POST", "login", {})).status).toBe(503);
  });

  it("turns the manager seed into a stored account on first sign-in", async () => {
    const { login, store } = setup();
    const { out, token } = await login("Boss@Example.test", "boss-seed-1");
    expect(out.status).toBe(200);
    expect(token).toBeTruthy();
    expect(store.doc.users.map(u => u.email)).toEqual(["boss@example.test"]);
    expect(store.doc.users[0].role).toBe("manager");
    expect(JSON.stringify(store.doc)).not.toContain("boss-seed-1");
  });

  it("rejects a wrong password with the same message as an unknown email", async () => {
    const { login } = setup();
    const wrong = await login("boss@example.test", "nope-1234");
    const unknown = await login("ghost@example.test", "nope-1234");
    expect(wrong.out.status).toBe(401);
    expect(unknown.out.body).toEqual(wrong.out.body);
  });

  it("has no shared student login, even if the old variables are still set", async () => {
    const legacy = { ...ENV, VITE_STUDENT_EMAIL: "student@example.test", VITE_STUDENT_PASSWORD: "student-seed-1" } as AuthEnv;
    const { login, call } = setup(legacy);
    expect((await login("student@example.test", "student-seed-1")).out.status).toBe(401);
    const old = signToken({ sub: "u-trainee", role: "trainee", pv: 0, exp: Date.now() + 60_000 }, SECRET);
    expect((await call("GET", "me", undefined, old)).status).toBe(401);
  });

  it("lets a manager create a user who can then sign in", async () => {
    const { login, call } = setup();
    const { token } = await login("boss@example.test", "boss-seed-1");
    const created = await call("POST", "users", { name: "דנה", email: "dana@example.test", password: "dana-pass-1", role: "trainee" }, token);
    expect(created.status).toBe(201);
    const dup = await call("POST", "users", { name: "דנה", email: "DANA@example.test", password: "dana-pass-1" }, token);
    expect(dup.status).toBe(409);
    expect((await login("dana@example.test", "dana-pass-1")).out.status).toBe(200);
    const list = await call("GET", "users", undefined, token);
    const emails = (list.body as { users: { email: string }[] }).users.map(u => u.email);
    expect([...emails].sort()).toEqual(["boss@example.test", "dana@example.test"]);
  });

  it("keeps user management away from trainees and strangers", async () => {
    const { login, call } = setup();
    const boss = await login("boss@example.test", "boss-seed-1");
    await call("POST", "users", { name: "דנה", email: "dana@example.test", password: "dana-pass-1", role: "trainee" }, boss.token);
    const { token } = await login("dana@example.test", "dana-pass-1");
    expect((await call("GET", "users", undefined, token)).status).toBe(403);
    expect((await call("GET", "users")).status).toBe(401);
    expect((await call("GET", "users", undefined, "garbage.token")).status).toBe(401);
  });

  it("signs out other devices when the password changes", async () => {
    const { login, call } = setup();
    const first = await login("boss@example.test", "boss-seed-1");
    const changed = await call("POST", "password", { currentPassword: "boss-seed-1", newPassword: "boss-new-22" }, first.token);
    expect(changed.status).toBe(200);
    expect((await call("GET", "me", undefined, first.token)).status).toBe(401);
    const fresh = (changed.body as { token: string }).token;
    expect((await call("GET", "me", undefined, fresh)).status).toBe(200);
    expect((await login("boss@example.test", "boss-seed-1")).out.status).toBe(401);
    expect((await login("boss@example.test", "boss-new-22")).out.status).toBe(200);
  });

  it("asks the support admin seed to change its password", async () => {
    const { login } = setup();
    const { out } = await login("admin@example.test", "admin-seed-1");
    expect((out.body as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(true);
  });

  it("never removes or demotes the last manager, nor deletes yourself", async () => {
    const { login, call, store } = setup({ ...ENV, VITE_ADMIN_PASSWORD: "" });
    const { token } = await login("boss@example.test", "boss-seed-1");
    const selfId = store.doc.users[0].id;
    expect((await call("PATCH", "users", { role: "trainee" }, token, selfId)).status).toBe(400);
    expect((await call("DELETE", "users", undefined, token, selfId)).status).toBe(400);

    await call("POST", "users", { name: "רון", email: "ron@example.test", password: "ron-pass-11", role: "trainee" }, token);
    const ron = store.doc.users.find(u => u.email === "ron@example.test")!;
    expect((await call("PATCH", "users", { role: "manager" }, token, ron.id)).status).toBe(200);
    expect((await call("DELETE", "users", undefined, token, ron.id)).status).toBe(200);
    expect(store.doc.users.map(u => u.email)).toEqual(["boss@example.test"]);
  });

  it("lets a manager reset someone's password", async () => {
    const { login, call, store } = setup();
    const { token } = await login("boss@example.test", "boss-seed-1");
    await call("POST", "users", { name: "רון", email: "ron@example.test", password: "ron-pass-11" }, token);
    const ron = store.doc.users.find(u => u.email === "ron@example.test")!;
    expect((await call("PATCH", "users", { password: "short" }, token, ron.id)).status).toBe(400);
    expect((await call("PATCH", "users", { password: "ron-pass-22" }, token, ron.id)).status).toBe(200);
    expect((await login("ron@example.test", "ron-pass-22")).out.status).toBe(200);
  });

  it("signs in a student from the learning system with the topics of their courses", async () => {
    const { call, store } = setup();
    const out = await call("POST", "sso", { token: launch() });
    expect(out.status).toBe(200);
    const body = out.body as { token: string; user: { email: string; arenas: string[]; source: string; role: string } };
    expect(body.user).toMatchObject({ email: "noa@example.test", role: "trainee", source: "lms", arenas: ["כלכלה", "מקצועית א׳"] });
    expect((await call("GET", "me", undefined, body.token)).status).toBe(200);
    expect(store.doc.users[0].hash).toBe("");
    // No password was ever set, so none signs in.
    expect((await call("POST", "login", { email: "noa@example.test", password: "" })).status).toBe(400);
    expect((await call("POST", "login", { email: "noa@example.test", password: "anything-1" })).status).toBe(401);
  });

  it("replaces the topics on every sign-in and keeps the same account", async () => {
    const { call, store } = setup();
    await call("POST", "sso", { token: launch() });
    await call("POST", "sso", { token: launch({ courses: ["ביטוח רכוש"] }) });
    expect(store.doc.users).toHaveLength(1);
    expect(store.doc.users[0].arenas).toEqual(["ביטוח רכוש"]);
    await call("POST", "sso", { token: launch({ staff: true }) });
    expect(store.doc.users[0].arenas).toBeUndefined();
  });

  it("refuses a forged, expired or reused launch, and needs the secret", async () => {
    const { call } = setup();
    expect((await call("POST", "sso", { token: launch({}, "wrong-secret") })).status).toBe(401);
    expect((await call("POST", "sso", { token: launch({ iat: Date.now() - 600_000, exp: Date.now() - 1 }) })).status).toBe(401);
    expect((await call("POST", "sso", { token: launch({ exp: Date.now() + 3_600_000 }) })).status).toBe(401);
    const once = launch();
    expect((await call("POST", "sso", { token: once })).status).toBe(200);
    expect((await call("POST", "sso", { token: once })).status).toBe(401);
    const off = setup({ ...ENV, LMS_SSO_SECRET: "" });
    expect((await off.call("POST", "sso", { token: launch() })).status).toBe(503);
  });

  it("answers a probe without making an account", async () => {
    const { call, store } = setup();
    expect((await call("POST", "sso", { token: launch(), probe: true })).status).toBe(200);
    expect(store.doc.users).toHaveLength(0);
  });

  it("leaves a manager arriving from the learning system with every topic", async () => {
    const { call, login, store } = setup();
    await login("boss@example.test", "boss-seed-1");
    await call("POST", "sso", { token: launch({ email: "boss@example.test" }) });
    const boss = store.doc.users.find(u => u.email === "boss@example.test")!;
    expect(boss.role).toBe("manager");
    expect(boss.arenas).toBeUndefined();
  });

  it("lets a manager set and clear a user's topics", async () => {
    const { call, login, store } = setup();
    const { token } = await login("boss@example.test", "boss-seed-1");
    await call("POST", "users", { name: "רון", email: "ron@example.test", password: "ron-pass-11", arenas: ["כלכלה"] }, token);
    const ron = store.doc.users.find(u => u.email === "ron@example.test")!;
    expect(ron.arenas).toEqual(["כלכלה"]);
    await call("PATCH", "users", { arenas: ["חשבונאות", "חשבונאות"] }, token, ron.id);
    expect(store.doc.users.find(u => u.id === ron.id)!.arenas).toEqual(["חשבונאות"]);
    await call("PATCH", "users", { arenas: null }, token, ron.id);
    expect(store.doc.users.find(u => u.id === ron.id)!.arenas).toBeUndefined();
  });
});

describe("history service", () => {
  it("keeps each user's sessions apart, newest first, replacing by id", async () => {
    const { call, service } = setup();
    const a = ((await call("POST", "sso", { token: launch() })).body as { token: string }).token;
    const b = ((await call("POST", "sso", { token: launch({ email: "dan@example.test", sub: "lms-2" }) })).body as { token: string }).token;
    const history = createHistoryService(memoryHistoryStore(), service.currentUser);
    const session = (id: string, score: number) => ({
      id,
      arenaName: "כלכלה",
      mode: "full",
      questionIds: ["q1", "q2"],
      answers: [{ questionId: "q1", selectedIndex: 2, isCorrect: true, timeSpent: 12 }],
      startTime: "2026-11-26T10:00:00.000Z",
      endTime: "2026-11-26T10:05:00.000Z",
      score,
    });
    const post = (token: string, body: unknown) => history.handle({ method: "POST", body, authorization: `Bearer ${token}` });
    const get = async (token: string) =>
      ((await history.handle({ method: "GET", authorization: `Bearer ${token}` })).body as { sessions: { id: string; score: number }[] }).sessions;

    expect((await post(a, { session: session("s1", 50) })).status).toBe(200);
    expect((await post(a, { session: session("s2", 80) })).status).toBe(200);
    expect((await post(a, { session: session("s1", 90) })).status).toBe(200);
    expect((await get(a)).map(s => [s.id, s.score])).toEqual([["s1", 90], ["s2", 80]]);
    expect(await get(b)).toEqual([]);
    expect((await post(a, { session: { id: "" } })).status).toBe(400);
    expect((await history.handle({ method: "GET" })).status).toBe(401);
  });
});
