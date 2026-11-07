import {
  ApiErrorSchema,
  CaptureRequestSchema,
  CaptureResultSchema,
  routes,
  type CaptureMetadata,
  type CaptureRequest,
  type CaptureResult,
} from "@eqore/contract";

export class CaptureApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface CaptureApi {
  read(token: string): Promise<CaptureRequest>;
  submit(token: string, file: File, metadata: CaptureMetadata): Promise<CaptureResult>;
}

const tokenPath = (path: string, token: string) => path.replace(":token", encodeURIComponent(token));

async function send<T>(schema: { parse(data: unknown): T }, path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new CaptureApiError("network", "No connection.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(body);
    throw error.success
      ? new CaptureApiError(error.data.code, error.data.message)
      : new CaptureApiError("network", `The server returned ${response.status}.`);
  }
  return schema.parse(body);
}

export const httpCaptureApi: CaptureApi = {
  // The page and this request share a path, so ask for JSON explicitly.
  read: (token) =>
    send(CaptureRequestSchema, tokenPath(routes.readCaptureRequest.path, token), {
      headers: { Accept: "application/json" },
    }),
  submit: (token, file, metadata) => {
    const form = new FormData();
    form.append("file", file);
    for (const [name, value] of Object.entries(metadata)) form.append(name, String(value));
    return send(CaptureResultSchema, tokenPath(routes.submitCapture.path, token), { method: "POST", body: form });
  },
};
