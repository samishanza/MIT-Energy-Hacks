// The customer document portal's calls, all behind the link's token.
export type PortalDocument = { kind: string; label: string; hint: string; status: "needed" | "received" | "confirmed" | "optional" };
export type PortalState = {
  address: string;
  expiresAt: string;
  uploadsLeft: number;
  documents: PortalDocument[];
  uploads: { kind: string; fileName: string; receivedAt: string; state: string }[];
};

export class PortalError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type PortalApi = {
  read: (token: string) => Promise<PortalState>;
  upload: (token: string, kind: string, file: File) => Promise<{ received: boolean; state: string }>;
};

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new PortalError(body?.code ?? "unreachable", body?.message ?? "Something went wrong. Please try again.");
  return body as T;
}

export const httpPortalApi: PortalApi = {
  read: (token) => fetch(`/portal/${encodeURIComponent(token)}`, { headers: { accept: "application/json" } }).then((r) => parse<PortalState>(r)),
  upload: (token, kind, file) => {
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    return fetch(`/portal/${encodeURIComponent(token)}/upload`, { method: "POST", body: form }).then((r) => parse(r));
  },
};
