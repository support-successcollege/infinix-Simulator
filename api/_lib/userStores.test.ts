import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory Blob store whose CDN caches every URL forever, the way the
// public store behaved: a second fetch of a URL returns the first copy.
const storage = new Map<string, string>();
const cdn = new Map<string, string>();
const urlOf = (pathname: string) => `https://store.example/${pathname}`;

vi.mock("@vercel/blob", () => {
  class BlobNotFoundError extends Error {}
  class BlobPreconditionFailedError extends Error {}
  return {
    BlobNotFoundError,
    BlobPreconditionFailedError,
    async put(pathname: string, body: string, opts: { allowOverwrite?: boolean }) {
      if (storage.has(pathname) && !opts.allowOverwrite) throw new Error("This blob already exists");
      storage.set(pathname, body);
      return { url: urlOf(pathname), pathname };
    },
    async copy(from: string, to: string, opts: { allowOverwrite?: boolean }) {
      if (!storage.has(from)) throw new BlobNotFoundError("not found");
      if (storage.has(to) && !opts.allowOverwrite) throw new Error("This blob already exists");
      storage.set(to, storage.get(from)!);
      return { url: urlOf(to), pathname: to };
    },
    async list({ prefix }: { prefix: string }) {
      const blobs = [...storage.keys()].filter(p => p.startsWith(prefix)).map(p => ({ pathname: p, url: urlOf(p) }));
      return { blobs, hasMore: false };
    },
    async del(urls: string[]) {
      for (const url of urls) storage.delete(url.replace("https://store.example/", ""));
    },
  };
});

beforeEach(() => {
  storage.clear();
  cdn.clear();
  vi.stubGlobal("fetch", async (url: string) => {
    if (!cdn.has(url)) {
      const body = storage.get(url.replace("https://store.example/", ""));
      if (body === undefined) return new Response("", { status: 404 });
      cdn.set(url, body);
    }
    return new Response(cdn.get(url)!, { status: 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const { versionedDoc, versionPath } = await import("./userStores");
const { ConflictError } = await import("./userAuth");

describe("versioned blob documents", () => {
  it("reads every write back, though the CDN never forgets a URL", async () => {
    const doc = versionedDoc("auth/users-x");
    expect(await doc.read()).toEqual({ text: null, version: 0 });
    for (let i = 1; i <= 6; i++) {
      const { version } = await doc.read();
      await doc.write(`state ${i}`, version);
      expect(await doc.read()).toEqual({ text: `state ${i}`, version: i });
    }
  });

  it("lets only one of two writers from the same version win", async () => {
    const doc = versionedDoc("auth/users-x");
    await doc.write("base", 0);
    await doc.write("first", 1);
    await expect(doc.write("second", 1)).rejects.toBeInstanceOf(ConflictError);
    expect((await doc.read()).text).toBe("first");
  });

  it("keeps the last three versions", async () => {
    const doc = versionedDoc("auth/users-x");
    for (let i = 0; i < 6; i++) await doc.write(`s${i}`, i);
    expect([...storage.keys()].sort()).toEqual([4, 5, 6].map(n => versionPath("auth/users-x", n)));
  });

  it("adopts the document written before versions, with its current bytes", async () => {
    storage.set("auth/users-x.json", "legacy, current");
    cdn.set(urlOf("auth/users-x.json"), "legacy, stale copy");
    const doc = versionedDoc("auth/users-x", "auth/users-x.json");
    expect(await doc.read()).toEqual({ text: "legacy, current", version: 1 });
    await doc.write("next", 1);
    expect(await doc.read()).toEqual({ text: "next", version: 2 });
    expect(storage.get("auth/users-x.json")).toBe("legacy, current");
  });
});
