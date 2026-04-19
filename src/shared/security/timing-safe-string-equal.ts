import crypto from "node:crypto";

/**
 * Compara duas strings sem vazar comprimento por tempo (digest SHA256 fixo antes de timingSafeEqual).
 */
export function timingSafeStringEqual(expected: string, received: string | undefined): boolean {
  if (received === undefined) {
    return false;
  }

  const digestExpected = crypto.createHash("sha256").update(expected, "utf8").digest();
  const digestReceived = crypto.createHash("sha256").update(received, "utf8").digest();

  return crypto.timingSafeEqual(digestExpected, digestReceived);
}
