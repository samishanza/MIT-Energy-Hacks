import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { httpApi } from "./api";
import { App } from "./App";
import { createMockApi } from "./mockApi";
import "./ui/tokens.css";

const api = import.meta.env.MODE === "mock" ? createMockApi() : httpApi;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
