import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { App } from "./App";
import { MoneyEventPage, MoneyShortcut, PlayerMoneyPage } from "./Money";
import { OperationsApp, OperationsShortcut } from "./Operations";
import "./styles.css";
import "./editing.css";
import "./money.css";
import "./operations.css";

function RootRouter() {
  const location = useLocation();

  if (location.pathname === "/ops" || location.pathname.startsWith("/ops/")) {
    return <OperationsApp />;
  }

  return (
    <Routes>
      <Route path="/money/events/:id" element={<MoneyEventPage />} />
      <Route path="/money/players/:id" element={<PlayerMoneyPage />} />
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
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Application root was not found");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <RootRouter />
    </BrowserRouter>
  </StrictMode>,
);
