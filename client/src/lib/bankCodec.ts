/* Gzip for the question bank.

   The bank with the insurance past exams is about 10MB of JSON. That
   is over the 4.5MB a Vercel Function accepts and over what
   localStorage holds, but it compresses to about 1.6MB. So it is
   gzipped before it is published, and before a manager's unpublished
   edits are kept in this browser. */

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export function gzipJson(value: unknown): Promise<Uint8Array> {
  return pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream("gzip"));
}

export async function gunzipJson<T = unknown>(bytes: Uint8Array): Promise<T> {
  const plain = await pipe(bytes, new DecompressionStream("gzip"));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
