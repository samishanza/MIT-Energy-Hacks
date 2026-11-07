import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { routes } from "@eqore/contract";
import { MAX_FILE_BYTES, fileTooLarge, readCaptureRequest, submitCapture, type CaptureDeps } from "./capture.ts";
import { respondToFailures } from "./routes.ts";

const STATIC_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

// The only thing a tunnel may reach: token-checked capture routes and the built phone page.
export function createCaptureApp(deps: CaptureDeps, pageDir?: string): Hono {
  const app = new Hono();
  respondToFailures(app);

  app.get(routes.readCaptureRequest.path, (c) => {
    const wantsPage = !(c.req.header("accept") ?? "").includes("application/json");
    if (wantsPage) {
      const page = pageDir ? join(pageDir, "capture.html") : null;
      return page && existsSync(page) ? c.html(readFileSync(page, "utf8")) : c.text("Not found", 404);
    }
    return c.json(readCaptureRequest(deps, c.req.param("token")!));
  });

  app.post(
    routes.submitCapture.path,
    bodyLimit({
      // Room for the file and its form fields. The file's own limit is checked in capture intake.
      maxSize: MAX_FILE_BYTES + 64 * 1024,
      onError: () => {
        throw fileTooLarge();
      },
    }),
    async (c) => c.json(await submitCapture(deps, c.req.param("token")!, await c.req.parseBody())),
  );

  // The page's built scripts and styles. Names are matched strictly, so no path can leave the folder.
  app.get("/assets/:name{[A-Za-z0-9._-]+}", (c) => {
    const name = c.req.param("name");
    const type = STATIC_TYPES[extname(name)];
    const file = pageDir ? join(pageDir, "assets", name) : null;
    if (!type || !file || !existsSync(file)) return c.text("Not found", 404);
    return c.body(readFileSync(file), 200, { "content-type": type });
  });

  return app;
}
