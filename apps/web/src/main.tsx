import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@workoutlab/design-tokens/tokens.css";
import "./main.css";
import { App } from "./app/App.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container missing in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
