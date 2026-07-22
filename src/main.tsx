import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { MoneyEventPage, MoneyShortcut, PlayerMoneyPage } from "./Money";
import "./styles.css";
import "./editing.css";
import "./money.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root was not found");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/money/events/:id" element={<MoneyEventPage />} />
        <Route path="/money/players/:id" element={<PlayerMoneyPage />} />
        <Route
          path="*"
          element={
            <>
              <App />
              <MoneyShortcut />
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
