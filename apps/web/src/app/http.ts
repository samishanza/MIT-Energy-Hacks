import { ApiErrorSchema, type CaptureMetadata } from "@eqore/contract";

export class ApiRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface SendWording {
  unreachable: string;
  // Used when a failed response isn't one of the contract's errors.
  unknownCode: string;
  serverName: string;
}

export async function send<T>(
  schema: { parse(data: unknown): T },
  path: string,
  init: RequestInit | undefined,
  wording: SendWording,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiRequestError("network", wording.unreachable);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(body);
    if (error.success) throw new ApiRequestError(error.data.code, error.data.message);
    throw new ApiRequestError(wording.unknownCode, `The ${wording.serverName} returned ${response.status}.`);
  }
  return schema.parse(body);
}

export function uploadForm(file: File, metadata: CaptureMetadata): FormData {
  const form = new FormData();
  form.append("file", file);
  for (const [name, value] of Object.entries(metadata)) form.append(name, String(value));
  return form;
}
