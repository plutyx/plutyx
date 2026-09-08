import React from "react";
import { createRoot } from "react-dom/client";
import { DeliveryFlowPortal } from "./delivery-flow-v72";
import "./delivery-flow-v72.css";

const ROOT_ID = "c360-delivery-flow-v72-root";
function mount(){
  if(new URLSearchParams(window.location.search).get("delivery") !== "1") return;
  if(document.getElementById(ROOT_ID)) return;
  const host=document.createElement("div");
  host.id=ROOT_ID;
  host.setAttribute("data-delivery-flow-v72-root","true");
  host.style.display="contents";
  document.body.appendChild(host);
  createRoot(host).render(<React.StrictMode><DeliveryFlowPortal/></React.StrictMode>);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
