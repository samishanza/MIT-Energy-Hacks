import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../ui/tokens.css";
import "./portal.css";
import { httpPortalApi } from "./portalApi";
import { PortalPage } from "./PortalPage";

// A link looks like /portal/<token>.
const token = new URLSearchParams(location.search).get("token") ?? decodeURIComponent(location.pathname.split("/").filter(Boolean).at(-1) ?? "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PortalPage token={token} api={httpPortalApi} />
  </StrictMode>,
);
