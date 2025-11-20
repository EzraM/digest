/**
 * This file will automatically be loaded by Vite and run in the "renderer" context.
 * Keep this entrypoint focused on bootstrapping the React application.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import "@mantine/core/styles.css";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

import { RendererApp } from "./RendererApp";

const root = createRoot(document.getElementById("root"));
root.render(<RendererApp />);
