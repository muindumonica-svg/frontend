import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "@/lib/query";
import { getRouter } from "./router";
import "./styles.css";

const router = getRouter(queryClient);

// The built app is installable; dev keeps HMR to itself and registers nothing.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // A failed registration must never block sign-in or the till.
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
