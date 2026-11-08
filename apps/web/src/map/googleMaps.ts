// Loads Google's Maps JavaScript API once, with the key the local API serves (restricted to
// this app), for the 3D view and the interactive Street View. Libraries load on demand.

type Ctor = new (...args: unknown[]) => unknown;
export type GoogleNs = { maps: { importLibrary: (name: string) => Promise<Record<string, Ctor & Record<string, unknown>>> } & Record<string, unknown> };

let loading: Promise<GoogleNs> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

/** Called when Google refuses the key for an API, which it reports instead of failing the script. */
export function onGoogleAuthFailure(listener: () => void): () => void {
  authListeners.add(listener);
  if (authFailed) listener();
  return () => authListeners.delete(listener);
}

export async function loadGoogle(): Promise<GoogleNs> {
  const w = window as unknown as { google?: GoogleNs };
  if (w.google?.maps?.importLibrary) return w.google;
  loading ??= (async () => {
    const config = (await (await fetch("/api/maps-config")).json()) as { key: string | null };
    if (!config.key) throw new Error("No Google Maps key is configured.");
    return new Promise<GoogleNs>((resolve, reject) => {
      (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
        authFailed = true;
        authListeners.forEach((listener) => listener());
      };
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.key!)}&v=beta&libraries=maps3d`;
      script.async = true;
      script.onload = () => (w.google ? resolve(w.google) : reject(new Error("Google Maps didn't load.")));
      script.onerror = () => reject(new Error("Google Maps couldn't be reached."));
      document.head.appendChild(script);
    });
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
