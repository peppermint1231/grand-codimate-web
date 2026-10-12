import { OperationProgressDialog } from "./components/OperationProgressDialog";
import { Discovery } from "./components/Discovery";
import React from "react";
import { createRoot } from "react-dom/client";
import { WebUpdateNotice } from "./components/WebUpdateNotice";
import { AndroidUpdateNotice } from "./components/AndroidUpdateNotice";
import { native } from "./lib/native";
import { trainingMode } from "./training/environment";
import "./style.css";
if (trainingMode) {
  void import("./training/bootstrap").then((m) => m.bootstrapPractice());
} else
  void import("./App").then(({ App }) =>
    createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        {location.pathname === "/discover" ? <Discovery /> : <App />}
        {native ? <AndroidUpdateNotice /> : <WebUpdateNotice />}
        <OperationProgressDialog />
      </React.StrictMode>,
    ),
  );
