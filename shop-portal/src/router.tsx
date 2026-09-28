import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// A minimal, brand-neutral full-page spinner shown whenever a route
// transition takes any noticeable time and the target route doesn't define
// its own pendingComponent. Without this, TanStack Router's default is to
// keep the *previous* screen's content on screen — indistinguishable from a
// UI that's frozen or broken — until the new route resolves or errors.
// pendingMs: 0 makes it show immediately rather than waiting ~500ms.
function DefaultPending() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background, #f7f7f5)",
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "3px solid var(--color-border, #e5e5e0)",
          borderTopColor: "var(--color-primary, #1a6b8a)",
          animation: "kirana-spin 0.7s linear infinite",
        }}
      />
      <style>{"@keyframes kirana-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: DefaultPending,
    defaultPendingMs: 300,
    defaultPendingMinMs: 200,
  });
  return router;
};
