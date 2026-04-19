/** Erro quando credenciais ou PAT necessarios para o SCM nao estao configurados no servidor. */
export class ServiceNotConfiguredError extends Error {
  public readonly code = "SERVICE_NOT_CONFIGURED" as const;

  public constructor(message: string) {
    super(message);
    this.name = "ServiceNotConfiguredError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
