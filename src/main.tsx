import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { PublicRsvpPage } from "./Rsvp";
import { UnifiedApp } from "./UnifiedApp";
import "./styles.css";
import "./editing.css";
import "./money.css";
import "./operations.css";
import "./unified.css";
import "./rsvp.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root was not found");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/rsvp/:token" element={<PublicRsvpPage />} />
        <Route path="*" element={<UnifiedApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
