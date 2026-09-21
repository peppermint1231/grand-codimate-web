import { Discovery } from "./components/Discovery";
import React from "react";
import { createRoot } from "react-dom/client";
import { WebUpdateNotice } from "./components/WebUpdateNotice";
import { AndroidUpdateNotice } from "./components/AndroidUpdateNotice";
import { native } from "./lib/native";
import { App } from "./App";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {location.pathname === "/discover" ? <Discovery /> : <App />}
    {native ? <AndroidUpdateNotice /> : <WebUpdateNotice />}
  </React.StrictMode>,
);
