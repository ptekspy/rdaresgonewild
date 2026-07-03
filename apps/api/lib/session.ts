import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createUploadToken() {
  return randomBytes(32).toString("base64url");
}

export function hashUploadToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyUploadToken(token: string, expectedHash: string) {
  const actual = Buffer.from(hashUploadToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
