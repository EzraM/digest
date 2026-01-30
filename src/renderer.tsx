/**
 * This file will automatically be loaded by Vite and run in the "renderer" context.
 * Keep this entrypoint focused on bootstrapping the React application.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "./index.css";

import "@mantine/core/styles.css";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

import { router } from "./router";
import { RendererApp } from "./RendererApp";

// Set up the inner component for TanStack Router
// RouterProvider renders the matched route component
// We wrap RendererApp at the root route level
router.options.defaultComponent = RendererApp;

const root = createRoot(document.getElementById("root")!);
root.render(<RouterProvider router={router} />);
