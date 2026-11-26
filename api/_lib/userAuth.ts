/* ============================================================
   User accounts, held on the server

   Until now every account lived in one browser's localStorage, so a
   user created on one computer did not exist on any other. This
   module is the server side of the replacement: one user list for
   the whole site, read and written only by the API.

   Storage
     One encrypted JSON document (AES-256-GCM) in Vercel Blob. The
     Blob store this project already has is a public store, so the
     document is encrypted with a key derived from AUTH_SECRET and
     sits at a pathname derived from it too: a leaked URL yields
     ciphertext, and the URL cannot be guessed in the first place.
     Writes use the blob's ETag (ifMatch), so two managers editing
     at once retry instead of overwriting each other.

   Passwords
     scrypt, a fresh salt per password, compared in constant time.

   Sessions
     A signed token (HMAC-SHA256) holding the user id, role, expiry
     and a password version. Changing a password bumps the version,
     which signs out every other device holding the old token.

   Seed accounts (from the server's environment, never the bundle)
     VITE_ADMIN_EMAIL / VITE_ADMIN_PASSWORD   support admin, must change
                                              the password on first use
     MANAGER_EMAIL / MANAGER_PASSWORD         a manager for the college
   A seed becomes a stored account the first time it signs in, and from
   then on the stored account wins. There is no shared student login:
   every student has an account of their own.

   Everything here is pure apart from the injected store, so the same
   code serves the Vercel function, the Vite dev server and the tests.
   ============================================================ */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

export type Role = "manager" | "trainee";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  salt: string;
  hash: string;
  createdAt: string;
  mustChangePassword: boolean;
  /** Bumped on every password change; tokens carry it. */
  passwordVersion: number;
  /**
   * The topics this user may practise, by name. Absent means every
   * topic (managers, and accounts made before topics were assigned).
   */
  arenas?: string[];
  /** "lms": the account was made by a sign-in from the learning system. */
  source?: "lms";
  /** The user's id in the learning system. */
  lmsUserId?: string;
}

export interface UserDoc {
  version: 1;
  users: StoredUser[];
  /** Launch tokens already used, kept until they expire, so a link works once. */
  usedLaunches?: { jti: string; exp: number }[];
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  mustChangePassword: boolean;
  arenas?: string[];
  source?: "lms";
}

export interface StoreAdapter {
  read(): Promise<{ doc: UserDoc; etag: string | null }>;
  /** Throws ConflictError when the stored document changed since `etag`. */
  write(doc: UserDoc, etag: string | null): Promise<void>;
}

export class ConflictError extends Error {
  constructor() {
    super("conflict");
    this.name = "ConflictError";
  }
}

export interface AuthEnv {
  AUTH_SECRET?: string;
  VITE_ADMIN_EMAIL?: string;
  VITE_ADMIN_PASSWORD?: string;
  MANAGER_EMAIL?: string;
  MANAGER_PASSWORD?: string;
  /** Shared with the learning system, which signs sign-in links with it. */
  LMS_SSO_SECRET?: string;
}

export interface AuthRequest {
  method: string;
  action: string;
  /** Target user id, for update and delete. */
  id?: string;
  body: unknown;
  /** The raw Authorization header. */
  authorization?: string;
}

export interface AuthResponse {
  status: number;
  body: unknown;
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY_DOC: UserDoc = { version: 1, users: [] };
const GENERIC_LOGIN_ERROR = "מייל או סיסמה שגויים";

// ── Crypto ─────────────────────────────────────────────────────

function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt);
  return { salt, hash: key.toString("hex") };
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const key = await scrypt(password, salt);
  const expected = Buffer.from(hash, "hex");
  return expected.length === key.length && timingSafeEqual(key, expected);
}

function sameString(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

function deriveKey(secret: string, label: string): Buffer {
  return createHmac("sha256", secret).update(label).digest();
}

/** Where the document lives: unguessable without the secret. */
export function storePathname(secret: string): string {
  return `auth/users-${deriveKey(secret, "pathname").toString("hex").slice(0, 32)}.json`;
}

export function encryptDoc(doc: UserDoc, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, "encryption"), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(doc), "utf8"), cipher.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}

export function decryptDoc(text: string, secret: string): UserDoc {
  const box = JSON.parse(text) as { iv: string; tag: string; data: string };
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret, "encryption"),
    Buffer.from(box.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]);
  const doc = JSON.parse(plain.toString("utf8")) as UserDoc;
  return {
    version: 1,
    users: Array.isArray(doc.users) ? doc.users : [],
    ...(Array.isArray(doc.usedLaunches) ? { usedLaunches: doc.usedLaunches } : {}),
  };
}

interface TokenPayload {
  sub: string;
  role: Role;
  pv: number;
  exp: number;
}

export function signToken(payload: TokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", deriveKey(secret, "token")).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readToken(token: string, secret: string, now = Date.now()): TokenPayload | null {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", deriveKey(secret, "token")).update(body).digest("base64url");
  if (!sameString(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.sub || typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Sign-in from the learning system ──────────────────────────
//
// The learning system signs a short-lived claim about the student it
// sends over: who they are and which courses they hold. The shared
// secret is the whole trust: no secret, no sign-in. A claim is good
// for a few minutes and only once, so a copied link is worth little.

export interface LaunchClaims {
  v: 1;
  /** The learning system's host, for the record. */
  iss: string;
  /** The student's id there. */
  sub: string;
  email: string;
  name: string;
  /** Titles of the courses they hold; each opens the topic of that name. */
  courses: string[];
  /** Staff of the college: every topic. */
  staff?: boolean;
  iat: number;
  exp: number;
  jti: string;
}

const LAUNCH_MAX_AGE_MS = 5 * 60 * 1000;

/** Sign a launch claim. The learning system does exactly this. */
export function signLaunchToken(claims: LaunchClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readLaunchToken(token: string, secret: string, now = Date.now()): LaunchClaims | null {
  if (!secret) return null;
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!sameString(sig, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LaunchClaims;
    if (c.v !== 1 || !c.sub || !c.jti || !isEmail(normalizeEmail(c.email))) return null;
    if (typeof c.exp !== "number" || typeof c.iat !== "number") return null;
    if (c.exp < now || c.exp - c.iat > LAUNCH_MAX_AGE_MS || c.iat > now + 60_000) return null;
    if (!Array.isArray(c.courses)) return null;
    return { ...c, courses: c.courses.map(x => String(x)).filter(Boolean) };
  } catch {
    return null;
  }
}

// ── Validation ─────────────────────────────────────────────────

function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}
function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
const toRole = (role: unknown): Role => (role === "manager" ? "manager" : "trainee");

/** A topic list from a request: an array of names, or null for "every topic". */
function toArenas(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(value.map(v => String(v).trim()).filter(Boolean))).slice(0, 50);
}

export function passwordWeakness(password: string): string | null {
  if (password.length < 8) return "הסיסמה חייבת להכיל לפחות 8 תווים";
  if (!/[A-Za-z]/.test(password)) return "הסיסמה חייבת להכיל לפחות אות אחת";
  if (!/[0-9]/.test(password)) return "הסיסמה חייבת להכיל לפחות ספרה אחת";
  return null;
}

// ── Seeds ──────────────────────────────────────────────────────

interface Seed {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  mustChangePassword: boolean;
}

export function seedsFromEnv(env: AuthEnv): Seed[] {
  const seeds: Seed[] = [];
  const add = (seed: Omit<Seed, "email" | "password"> & { email?: string; password?: string }) => {
    const email = normalizeEmail(seed.email);
    const password = String(seed.password || "");
    if (!email || !password) return;
    if (seeds.some(s => s.email === email)) return;
    seeds.push({ ...seed, email, password });
  };
  add({
    id: "u-admin",
    name: "Support Admin",
    email: env.VITE_ADMIN_EMAIL,
    password: env.VITE_ADMIN_PASSWORD,
    role: "manager",
    mustChangePassword: true,
  });
  add({
    id: "u-manager",
    name: "מנהל INFINIX",
    email: env.MANAGER_EMAIL,
    password: env.MANAGER_PASSWORD,
    role: "manager",
    mustChangePassword: false,
  });
  return seeds;
}

function toPublic(u: StoredUser): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    mustChangePassword: !!u.mustChangePassword,
    ...(Array.isArray(u.arenas) ? { arenas: u.arenas } : {}),
    ...(u.source ? { source: u.source } : {}),
  };
}

// ── Service ────────────────────────────────────────────────────

const ok = (body: unknown, status = 200): AuthResponse => ({ status, body });
const fail = (status: number, error: string): AuthResponse => ({ status, body: { error } });

export function createAuthService(store: StoreAdapter, env: AuthEnv, now: () => number = Date.now) {
  const secret = String(env.AUTH_SECRET || "");

  /** Read, change, write; retried when another write got there first. */
  async function mutate<T>(change: (doc: UserDoc) => T): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { doc, etag } = await store.read();
      const copy: UserDoc = JSON.parse(JSON.stringify(doc));
      const result = change(copy);
      try {
        await store.write(copy, etag);
        return result;
      } catch (err) {
        if (err instanceof ConflictError) continue;
        throw err;
      }
    }
    throw new Error("עדכון המשתמשים נכשל, נסה שוב");
  }

  function issue(user: { id: string; role: Role; passwordVersion?: number }): string {
    return signToken(
      { sub: user.id, role: user.role, pv: user.passwordVersion || 0, exp: now() + TOKEN_TTL_MS },
      secret
    );
  }

  /** The signed-in user behind a request, or null. */
  async function whoIs(
    authorization?: string
  ): Promise<{ stored: StoredUser; user: PublicUser } | null> {
    const raw = String(authorization || "");
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
    const payload = readToken(token, secret, now());
    if (!payload) return null;

    const { doc } = await store.read();
    const stored = doc.users.find(u => u.id === payload.sub);
    if (!stored || (stored.passwordVersion || 0) !== payload.pv) return null;
    return { stored, user: toPublic(stored) };
  }

  async function login(body: unknown): Promise<AuthResponse> {
    const input = (body || {}) as { email?: unknown; password?: unknown };
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    if (!email || !password) return fail(400, "נא להזין מייל וסיסמה");

    const { doc } = await store.read();
    const stored = doc.users.find(u => u.email === email);
    if (stored) {
      if (!(await verifyPassword(password, stored.salt, stored.hash))) {
        return fail(401, GENERIC_LOGIN_ERROR);
      }
      return ok({ token: issue(stored), user: toPublic(stored) });
    }

    const seed = seedsFromEnv(env).find(s => s.email === email);
    if (!seed || !sameString(seed.password, password)) {
      // Hash anyway, so an unknown email takes as long to reject.
      await hashPassword(password);
      return fail(401, GENERIC_LOGIN_ERROR);
    }

    // First sign-in of an admin or manager seed: it becomes a stored account.
    const { salt, hash } = await hashPassword(password);
    const created = await mutate(d => {
      const existing = d.users.find(u => u.email === email);
      if (existing) return existing;
      const user: StoredUser = {
        id: d.users.some(u => u.id === seed.id) ? `u-${randomUUID()}` : seed.id,
        name: seed.name,
        email,
        role: seed.role,
        salt,
        hash,
        createdAt: new Date(now()).toISOString(),
        mustChangePassword: seed.mustChangePassword,
        passwordVersion: 0,
      };
      d.users.push(user);
      return user;
    });
    return ok({ token: issue(created), user: toPublic(created) });
  }

  async function changeOwnPassword(req: AuthRequest): Promise<AuthResponse> {
    const who = await whoIs(req.authorization);
    if (!who) return fail(401, "יש להתחבר מחדש");

    const input = (req.body || {}) as { currentPassword?: unknown; newPassword?: unknown };
    const current = String(input.currentPassword || "");
    const next = String(input.newPassword || "");
    const stored = who.stored;
    if (!(await verifyPassword(current, stored.salt, stored.hash))) {
      return fail(400, "הסיסמה הנוכחית שגויה");
    }
    const weakness = passwordWeakness(next);
    if (weakness) return fail(400, weakness);
    if (current === next) return fail(400, "הסיסמה החדשה זהה לנוכחית");

    const { salt, hash } = await hashPassword(next);
    const updated = await mutate(d => {
      const u = d.users.find(x => x.id === stored.id);
      if (!u) return null;
      u.salt = salt;
      u.hash = hash;
      u.mustChangePassword = false;
      u.passwordVersion = (u.passwordVersion || 0) + 1;
      return u;
    });
    if (!updated) return fail(404, "המשתמש לא נמצא");
    return ok({ token: issue(updated), user: toPublic(updated) });
  }

  async function requireManager(req: AuthRequest) {
    const who = await whoIs(req.authorization);
    if (!who) return { error: fail(401, "יש להתחבר מחדש") };
    if (who.user.role !== "manager") return { error: fail(403, "פעולה זו זמינה למנהלים בלבד") };
    return { who };
  }

  async function listUsers(): Promise<PublicUser[]> {
    const { doc } = await store.read();
    return doc.users.map(toPublic).sort((a, b) => a.name.localeCompare(b.name, "he"));
  }

  async function createUser(body: unknown): Promise<AuthResponse> {
    const input = (body || {}) as { name?: unknown; email?: unknown; password?: unknown; role?: unknown; arenas?: unknown };
    const arenas = toArenas(input.arenas);
    const name = String(input.name || "").trim();
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    if (!name || !email || !password) return fail(400, "יש למלא שם, מייל וסיסמה");
    if (!isEmail(email)) return fail(400, "כתובת המייל אינה תקינה");
    const weakness = passwordWeakness(password);
    if (weakness) return fail(400, weakness);

    const { salt, hash } = await hashPassword(password);
    const created = await mutate(d => {
      if (d.users.some(u => u.email === email)) return null;
      const user: StoredUser = {
        id: `u-${randomUUID()}`,
        name,
        email,
        role: toRole(input.role),
        salt,
        hash,
        createdAt: new Date(now()).toISOString(),
        mustChangePassword: false,
        passwordVersion: 0,
        ...(arenas ? { arenas } : {}),
      };
      d.users.push(user);
      return user;
    });
    if (!created) return fail(409, "קיים כבר משתמש עם המייל הזה");
    return ok({ user: toPublic(created) }, 201);
  }

  async function updateUser(id: string, body: unknown): Promise<AuthResponse> {
    const input = (body || {}) as { role?: unknown; name?: unknown; password?: unknown; arenas?: unknown };
    const arenas = toArenas(input.arenas);
    const password = input.password === undefined ? null : String(input.password);
    if (password !== null) {
      const weakness = passwordWeakness(password);
      if (weakness) return fail(400, weakness);
    }
    const credential = password !== null ? await hashPassword(password) : null;

    const outcome = await mutate<AuthResponse>(d => {
      const u = d.users.find(x => x.id === id);
      if (!u) return fail(404, "המשתמש לא נמצא");
      if (input.role !== undefined) {
        const role = toRole(input.role);
        if (u.role === "manager" && role !== "manager" && d.users.filter(x => x.role === "manager").length <= 1) {
          return fail(400, "חייב להישאר לפחות משתמש הנהלה אחד");
        }
        u.role = role;
      }
      if (input.name !== undefined) {
        const name = String(input.name).trim();
        if (name) u.name = name;
      }
      if (arenas === null) delete u.arenas;
      else if (arenas) u.arenas = arenas;
      if (credential) {
        u.salt = credential.salt;
        u.hash = credential.hash;
        u.mustChangePassword = false;
        u.passwordVersion = (u.passwordVersion || 0) + 1;
      }
      return ok({ user: toPublic(u) });
    });
    return outcome;
  }

  /** Sign in a student the learning system sends over, making the account the first time. */
  async function launch(body: unknown): Promise<AuthResponse> {
    const launchSecret = String(env.LMS_SSO_SECRET || "");
    if (!launchSecret) return fail(503, "הכניסה ממערכת הלימוד לא מוגדרת בשרת");
    const input = (body || {}) as { token?: unknown; probe?: unknown };
    const claims = readLaunchToken(String(input.token || ""), launchSecret, now());
    if (!claims) return fail(401, "קישור הכניסה ממערכת הלימוד לא תקין או שפג תוקפו. חזרו למערכת הלימוד ולחצו שוב.");
    // "Test connection" in the learning system: the signature checks out.
    if (input.probe) return ok({ ok: true });

    const email = normalizeEmail(claims.email);
    const outcome = await mutate<StoredUser | "replayed">(d => {
      const t = now();
      d.usedLaunches = (d.usedLaunches || []).filter(x => x.exp > t);
      if (d.usedLaunches.some(x => x.jti === claims.jti)) return "replayed";
      d.usedLaunches.push({ jti: claims.jti, exp: claims.exp });

      let u = d.users.find(x => x.email === email);
      if (!u) {
        u = {
          id: `u-${randomUUID()}`,
          name: String(claims.name || "").trim() || email,
          email,
          role: "trainee",
          salt: "",
          hash: "",
          createdAt: new Date(t).toISOString(),
          mustChangePassword: false,
          passwordVersion: 0,
        };
        d.users.push(u);
      }
      u.source = "lms";
      u.lmsUserId = claims.sub;
      if (claims.name && !u.name) u.name = claims.name;
      // The learning system is the record of what a student holds: each
      // sign-in replaces the list. Managers and staff keep every topic.
      if (u.role === "trainee") {
        if (claims.staff) delete u.arenas;
        else u.arenas = Array.from(new Set(claims.courses));
      }
      return u;
    });
    if (outcome === "replayed") return fail(401, "קישור הכניסה כבר נוצל. חזרו למערכת הלימוד ולחצו שוב.");
    return ok({ token: issue(outcome), user: toPublic(outcome) });
  }

  async function deleteUser(id: string, selfId: string): Promise<AuthResponse> {
    if (id === selfId) return fail(400, "לא ניתן למחוק את המשתמש שמחובר כרגע");
    return mutate<AuthResponse>(d => {
      const target = d.users.find(u => u.id === id);
      if (!target) return fail(404, "המשתמש לא נמצא");
      if (target.role === "manager" && d.users.filter(u => u.role === "manager").length <= 1) {
        return fail(400, "לא ניתן למחוק את משתמש ההנהלה האחרון");
      }
      d.users = d.users.filter(u => u.id !== id);
      return ok({ ok: true });
    });
  }

  async function handle(req: AuthRequest): Promise<AuthResponse> {
    if (!secret) return fail(503, "AUTH_SECRET לא מוגדר בשרת");
    const method = req.method.toUpperCase();

    switch (req.action) {
      case "login":
        if (method !== "POST") return fail(405, "method not allowed");
        return login(req.body);

      case "me": {
        const who = await whoIs(req.authorization);
        if (!who) return fail(401, "יש להתחבר מחדש");
        return ok({ user: who.user });
      }

      case "password":
        if (method !== "POST") return fail(405, "method not allowed");
        return changeOwnPassword(req);

      case "sso":
        if (method !== "POST") return fail(405, "method not allowed");
        return launch(req.body);

      case "users": {
        const gate = await requireManager(req);
        if (gate.error) return gate.error;
        if (method === "GET") return ok({ users: await listUsers() });
        if (method === "POST") return createUser(req.body);
        if (!req.id) return fail(400, "חסר מזהה משתמש");
        if (method === "PATCH") return updateUser(req.id, req.body);
        if (method === "DELETE") return deleteUser(req.id, gate.who!.user.id);
        return fail(405, "method not allowed");
      }

      default:
        return fail(404, "unknown action");
    }
  }

  /** True when the request carries a valid session of a manager. */
  async function isManager(authorization?: string): Promise<boolean> {
    if (!secret) return false;
    const who = await whoIs(authorization);
    return who?.user.role === "manager";
  }

  /** The signed-in user behind a request, for the other endpoints. */
  async function currentUser(authorization?: string): Promise<PublicUser | null> {
    if (!secret) return null;
    return (await whoIs(authorization))?.user ?? null;
  }

  return { handle, isManager, currentUser };
}

// ── Stores ─────────────────────────────────────────────────────

/** In-memory store, for tests. */
export function memoryStore(initial: UserDoc = EMPTY_DOC): StoreAdapter & { doc: UserDoc } {
  let version = 0;
  const box = {
    doc: JSON.parse(JSON.stringify(initial)) as UserDoc,
    async read() {
      return { doc: JSON.parse(JSON.stringify(box.doc)) as UserDoc, etag: version ? String(version) : null };
    },
    async write(doc: UserDoc, etag: string | null) {
      if ((etag || null) !== (version ? String(version) : null)) throw new ConflictError();
      box.doc = JSON.parse(JSON.stringify(doc));
      version++;
    },
  };
  return box;
}

export { EMPTY_DOC };
