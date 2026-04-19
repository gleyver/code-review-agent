import crypto from "node:crypto";

export function isValidGitHubSignature(input: {
  readonly signature: string | undefined;
  readonly payload: Buffer;
  readonly secret: string | undefined;
}): boolean {
  if (!input.secret) {
    return true;
  }

  if (!input.signature) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", input.secret)
    .update(input.payload)
    .digest("hex")}`;

  if (expected.length !== input.signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
}
