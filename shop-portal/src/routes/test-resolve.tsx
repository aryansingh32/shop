import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { resolveShopFromRequest } from "@/lib/subdomain";
import { supabasePortal, lastFetchLog } from "@/lib/supabase.server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/config";

const testResolveFn = createServerFn({ method: "GET" }).handler(async () => {
  const shopCtx = await resolveShopFromRequest();
  
  const { data: rawShops, error: rawError } = await supabasePortal.from("shops").select("*");

  return {
    url: SUPABASE_URL,
    urlLen: SUPABASE_URL?.length,
    urlJson: JSON.stringify(SUPABASE_URL),
    keyLen: SUPABASE_SERVICE_ROLE_KEY?.length,
    keyJson: JSON.stringify(SUPABASE_SERVICE_ROLE_KEY),
    lastFetchLog,
    shopCtx,
    rawError: rawError ? { message: rawError.message, code: rawError.code } : null,
    rawShopsCount: rawShops?.length ?? 0,
    rawShops: rawShops?.map(s => ({ id: s.id, name: s.business_name, sub: s.subdomain, db: s.odoo_db_name, status: s.provisioning_status }))
  };
});

export const Route = createFileRoute("/test-resolve")({
  loader: async () => await testResolveFn(),
  component: () => {
    const data = Route.useLoaderData();
    return <pre id="result">{JSON.stringify(data, null, 2)}</pre>;
  },
});
