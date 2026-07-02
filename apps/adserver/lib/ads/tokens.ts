import crypto from "node:crypto";

export type AdTokenPayload = {
  kind: "impression" | "click";
  requestId: string;
  bookingId: string;
  creativeId: string;
  placementId: string;
  siteId: string;
  issuedAt: number;
  expiresAt: number;
  targetUrlHash?: string;
};

function getSecret() {
  const secret = process.env.ADS_TOKEN_SECRET;
  if (!secret) {
    throw new Error("ADS_TOKEN_SECRET is required");
  }
  return secret;
}

function signBody(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function signAdToken(payload: AdTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signBody(body, getSecret());
  return `${body}.${signature}`;
}

export function verifyAdToken(token: string, expectedKind: AdTokenPayload["kind"]) {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    throw new Error("Invalid token");
  }

  const expected = signBody(body, getSecret());
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdTokenPayload;
  const now = Date.now();
  if (payload.kind !== expectedKind) {
    throw new Error("Invalid token kind");
  }
  if (payload.expiresAt < now) {
    throw new Error("Expired token");
  }

  return payload;
}

export function makeTokenPayload(
  kind: AdTokenPayload["kind"],
  input: Omit<AdTokenPayload, "kind" | "issuedAt" | "expiresAt">,
  lifetimeMs = 30 * 60 * 1000,
) {
  const issuedAt = Date.now();
  return {
    ...input,
    kind,
    issuedAt,
    expiresAt: issuedAt + lifetimeMs,
  };
}
