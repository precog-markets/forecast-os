// Shared ForecastOS runtime errors and error serialization helpers.
export class PrecogApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PrecogApiError";
    this.code = details.code;
    this.status = details.status;
    this.endpoint = details.endpoint;
    this.body = details.body;
    this.signature_diagnostic = details.signature_diagnostic;
  }
}

export function serializeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code,
    status: error?.status,
    endpoint: error?.endpoint,
    body: error?.body,
  };
}

export function fail(message) {
  throw new Error(message);
}
