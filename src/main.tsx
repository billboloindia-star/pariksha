import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { configureStorage } from "../shared/storage";
import { configureApi } from "../shared/api";
import { webStorage } from "./webStorage";

configureStorage(webStorage);
configureApi(import.meta.env.VITE_API_URL as string | undefined);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
