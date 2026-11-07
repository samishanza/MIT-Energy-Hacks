import {
  CaptureRequestSchema,
  CaptureResultSchema,
  routes,
  type CaptureMetadata,
  type CaptureRequest,
  type CaptureResult,
} from "@eqore/contract";
import { ApiRequestError, send, uploadForm, type SendWording } from "../app/http";

export { ApiRequestError as CaptureApiError };

export interface CaptureApi {
  read(token: string): Promise<CaptureRequest>;
  submit(token: string, file: File, metadata: CaptureMetadata): Promise<CaptureResult>;
}

const WORDING: SendWording = { unreachable: "No connection.", unknownCode: "network", serverName: "server" };

const tokenPath = (path: string, token: string) => path.replace(":token", encodeURIComponent(token));

export const httpCaptureApi: CaptureApi = {
  // The page and this request share a path, so ask for JSON explicitly.
  read: (token) =>
    send(
      CaptureRequestSchema,
      tokenPath(routes.readCaptureRequest.path, token),
      { headers: { Accept: "application/json" } },
      WORDING,
    ),
  submit: (token, file, metadata) =>
    send(
      CaptureResultSchema,
      tokenPath(routes.submitCapture.path, token),
      { method: "POST", body: uploadForm(file, metadata) },
      WORDING,
    ),
};
