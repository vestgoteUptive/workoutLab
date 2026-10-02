import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@workoutlab/design-tokens/tokens.css";
import "./main.css";
import { App } from "./app/App.js";
import { registerServiceWorker } from "./lib/pwa/register.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container missing in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// T-0429: register the service worker from the bundle; a failed registration is caught.
registerServiceWorker();
