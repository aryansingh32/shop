import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSessionFn } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  // Before rendering, check if user has a valid session
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (session) {
      throw redirect({ to: "/dashboard" });
    } else {
      throw redirect({ to: "/login" });
    }
  },
  component: () => null,
});
