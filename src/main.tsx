import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { UnifiedApp } from "./UnifiedApp";
import "./styles.css";
import "./editing.css";
import "./money.css";
import "./operations.css";
import "./unified.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root was not found");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <UnifiedApp />
    </BrowserRouter>
  </StrictMode>,
);
