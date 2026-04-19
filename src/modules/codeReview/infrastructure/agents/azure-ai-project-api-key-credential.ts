import type { AccessToken, GetTokenOptions, TokenCredential } from "@azure/core-auth";

/**
 * Credencial estatica para Azure AI Projects / Foundry quando se usa a API key do recurso
 * (evita DefaultAzureCredential em desenvolvimento local).
 */
export class AzureAiProjectApiKeyCredential implements TokenCredential {
  public constructor(private readonly apiKey: string) {}

  public async getToken(_scopes: string | string[], _options?: GetTokenOptions): Promise<AccessToken> {
    return {
      token: this.apiKey,
      expiresOnTimestamp: Date.now() + 24 * 60 * 60 * 1000
    };
  }
}
