import React from "react";
import { createRoot } from "react-dom/client";
import { WebUpdateNotice } from "./components/WebUpdateNotice";
import { App } from "./App";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <WebUpdateNotice />
  </React.StrictMode>,
);
