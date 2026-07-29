import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Store,
  Package,
  Puzzle,
  ScrollText,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const primary = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Shops", url: "/shops", icon: Store },
  { title: "Plans", url: "/plans", icon: Package },
  { title: "Apps", url: "/apps", icon: Puzzle },
];

const platform = [
  { title: "Audit Log", url: "/audit", icon: ScrollText },
  { title: "Team", url: "/team", icon: Users },
];

export function AppSidebar({
  admin,
}: {
  admin: { name: string; email: string; role: string } | null;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="grid size-7 place-items-center rounded-md bg-primary">
            <span className="text-[11px] font-bold text-primary-foreground">KO</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">Kshetra Ops</span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Control Panel
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primary.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Internal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platform.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className={cn("flex items-center gap-2 px-2 py-1.5", collapsed && "justify-center")}>
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground">
            {admin?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          {!collapsed && admin && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-xs font-medium">{admin.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {admin.role.replace("_", " ")}
              </span>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
