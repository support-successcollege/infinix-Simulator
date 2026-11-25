import { describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { fromBase64, gunzipJson, gzipJson, toBase64 } from "./bankCodec";

describe("bankCodec", () => {
  const bank = {
    categories: {
      "ביטוח רכוש": { questions: Array.from({ length: 2000 }, (_, i) => ({ id: `q${i}`, question: "מה נכון לגבי השתתפות עצמית?" })) },
    },
  };

  it("round-trips a bank through gzip and base64", async () => {
    const packed = await gzipJson(bank);
    expect(packed.length).toBeLessThan(JSON.stringify(bank).length / 5);
    expect(await gunzipJson(fromBase64(toBase64(packed)))).toEqual(bank);
  });

  it("writes standard gzip that the server can read", async () => {
    const packed = await gzipJson(bank);
    expect(JSON.parse(gunzipSync(Buffer.from(packed)).toString("utf8"))).toEqual(bank);
  });
});
