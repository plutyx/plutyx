import React from "react";
import { createRoot } from "react-dom/client";
import { ProductCompositionPortal } from "./product-composition-v71";
import "./product-composition-v71.css";

const ROOT_ID = "c360-product-composition-v71-root";

function mount() {
  if (document.getElementById(ROOT_ID)) return;
  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.setAttribute("data-product-composition-v71-root", "true");
  host.style.display = "contents";
  document.body.appendChild(host);
  createRoot(host).render(
    <React.StrictMode>
      <ProductCompositionPortal />
    </React.StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
