import { inspect } from "node:util";

function formatUnknownCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  if (cause === null) {
    return "null";
  }

  if (cause === undefined) {
    return "undefined";
  }

  if (typeof cause === "object") {
    try {
      return JSON.stringify(cause);
    } catch {
      return inspect(cause, { depth: 4 });
    }
  }

  if (typeof cause === "string") {
    return cause;
  }

  if (typeof cause === "number" || typeof cause === "boolean" || typeof cause === "bigint") {
    return String(cause);
  }

  if (typeof cause === "symbol") {
    return cause.toString();
  }

  if (typeof cause === "function") {
    return `[function ${cause.name || "anonymous"}]`;
  }

  return inspect(cause, { depth: 4 });
}

export function toLoggableErrorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const fields: Record<string, unknown> = {
      errMessage: error.message,
      errName: error.name
    };

    if (error.stack) {
      fields.errStack = error.stack;
    }

    if (error.cause !== undefined) {
      fields.errCause = formatUnknownCause(error.cause);
    }

    return fields;
  }

  if (error === null) {
    return { errValue: "null" };
  }

  if (error === undefined) {
    return { errValue: "undefined" };
  }

  if (typeof error === "object") {
    try {
      return { errValue: JSON.stringify(error) };
    } catch {
      return { errValue: inspect(error, { depth: 6 }) };
    }
  }

  if (typeof error === "string") {
    return { errValue: error };
  }

  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") {
    return { errValue: String(error) };
  }

  if (typeof error === "symbol") {
    return { errValue: error.toString() };
  }

  if (typeof error === "function") {
    return { errValue: `[function ${error.name || "anonymous"}]` };
  }

  return { errValue: inspect(error, { depth: 6 }) };
}
