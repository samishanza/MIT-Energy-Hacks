import { CaptureLinkSchema, CaptureRequestSchema, CaptureResultSchema } from "@eqore/contract";
import captureSample from "@eqore/contract/samples/capture.sample.json";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../ui/tokens.css";
import { httpCaptureApi, type CaptureApi } from "./captureApi";
import { CapturePage } from "./CapturePage";

// A synthetic stand-in for walking this page before the capture listener exists.
const mockCaptureApi: CaptureApi = {
  read: async () => {
    CaptureLinkSchema.parse(captureSample.link);
    return CaptureRequestSchema.parse(captureSample.request);
  },
  submit: async () => CaptureResultSchema.parse(captureSample.result),
};

// A link looks like /capture/<token>. The query form is for the local mock page.
const token =
  new URLSearchParams(location.search).get("token") ??
  decodeURIComponent(location.pathname.split("/").filter(Boolean).at(-1) ?? "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CapturePage token={token} api={import.meta.env.MODE === "mock" ? mockCaptureApi : httpCaptureApi} />
  </StrictMode>,
);
