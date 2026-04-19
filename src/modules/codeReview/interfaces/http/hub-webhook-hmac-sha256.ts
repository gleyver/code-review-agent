import crypto from "node:crypto";

/**
 * Verifica cabecalho no formato `sha256=<hex>` (GitHub `x-hub-signature-256`, Bitbucket `x-hub-signature` / `x-hub-signature-256`).
 * Sem segredo ou sem assinatura devolve false (nao aceitar webhook).
 */
export function verifyHubSha256Signature(input: {
  readonly signatureHeaderValue: string | undefined;
  readonly payload: Buffer;
  readonly secret: string | undefined;
}): boolean {
  const secret = input.secret?.trim();
  if (!secret) {
    return false;
  }

  const received = input.signatureHeaderValue?.trim();
  if (!received) {
    return false;
  }

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(input.payload).digest("hex")}`;

  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
}

export function isValidGitHubWebhookSignature(input: {
  readonly signature: string | undefined;
  readonly payload: Buffer;
  readonly secret: string | undefined;
}): boolean {
  return verifyHubSha256Signature({
    signatureHeaderValue: input.signature,
    payload: input.payload,
    secret: input.secret
  });
}

export function isValidBitbucketWebhookSignature(input: {
  readonly signature256: string | undefined;
  readonly signature: string | undefined;
  readonly payload: Buffer;
  readonly secret: string | undefined;
}): boolean {
  const header = input.signature256?.trim() || input.signature?.trim();
  return verifyHubSha256Signature({
    signatureHeaderValue: header,
    payload: input.payload,
    secret: input.secret
  });
}
