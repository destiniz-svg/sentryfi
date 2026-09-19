import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { watchForUpdates } from "./lib/updates.js";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// After the app is on screen, not before it. The point of the service worker
// is that the app opens on a site with no signal; nothing about it should
// stand between a person and the first paint.
watchForUpdates();
