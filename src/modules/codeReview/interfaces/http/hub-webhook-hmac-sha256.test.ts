import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidBitbucketWebhookSignature, isValidGitHubWebhookSignature } from "./hub-webhook-hmac-sha256.js";

function signBody(secret: string, body: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("hub-webhook-hmac-sha256", () => {
  it("accepts valid GitHub-style signature", () => {
    const secret = "webhook-secret";
    const body = '{"action":"opened"}';
    const payload = Buffer.from(body, "utf8");
    const signature = signBody(secret, body);
    expect(isValidGitHubWebhookSignature({ signature, payload, secret })).toBe(true);
  });

  it("rejects GitHub webhook without secret", () => {
    const payload = Buffer.from("{}", "utf8");
    expect(isValidGitHubWebhookSignature({ signature: "sha256=abc", payload, secret: undefined })).toBe(false);
  });

  it("accepts Bitbucket signature on x-hub-signature-256", () => {
    const secret = "bb-secret";
    const body = "{}";
    const payload = Buffer.from(body, "utf8");
    const sig = signBody(secret, body);
    expect(
      isValidBitbucketWebhookSignature({
        signature256: sig,
        signature: undefined,
        payload,
        secret
      })
    ).toBe(true);
  });
});
