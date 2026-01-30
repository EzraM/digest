import {
  createRouter,
  createHashHistory,
  createRootRoute,
  createRoute,
} from "@tanstack/react-router";

// Root route - renders the default component (RendererApp)
const rootRoute = createRootRoute();

// Index route - matches "/" (empty hash)
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
});

// Doc route: /doc/$docId?focus=$focusBlockId
const docRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/doc/$docId",
});

// Block route: /block/$blockId?doc=$docId
const blockRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/block/$blockId",
});

// URL route: /url/$url?doc=$docId
// The $url param will be URL-encoded in the path
const urlRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/url/$url",
});

// Build the route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  docRoute,
  blockRoute,
  urlRoute,
]);

// Create the router instance with hash-based history for Electron
export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
  // Enable scroll restoration for custom containers via useElementScrollRestoration
  scrollRestoration: true,
});

// Type registration for type-safe hooks
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Export route references
export { docRoute, blockRoute, urlRoute, indexRoute };
