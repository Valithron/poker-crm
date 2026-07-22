import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { MoneyEventPage, MoneyShortcut, PlayerMoneyPage } from "./Money";
import { OperationsApp, OperationsShortcut } from "./Operations";
import "./styles.css";
import "./editing.css";
import "./money.css";
import "./operations.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root was not found");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/money/events/:id" element={<MoneyEventPage />} />
        <Route path="/money/players/:id" element={<PlayerMoneyPage />} />
        <Route path="/ops/*" element={<OperationsApp />} />
        <Route
          path="*"
          element={
            <>
              <App />
              <MoneyShortcut />
              <OperationsShortcut />
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
