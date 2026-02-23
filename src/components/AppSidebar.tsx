import { Home, Settings, Users, Puzzle, ChevronDown, Check } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
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
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { title: "Snippets", url: "/snippets", icon: Home },
  { title: "Settings", url: "/settings", icon: Settings },
];

const settingsItems = [
  { title: "Team", url: "/settings/team", icon: Users },
  { title: "Extension", url: "/settings/extension", icon: Puzzle },
];

export function AppSidebar() {
  const { workspace, workspaces, setActiveWorkspaceId } = useWorkspace();
  const { user, signOut } = useAuth();

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "??";

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="SnipDM" className="w-7 h-7 rounded-md object-contain flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">SnipDM</p>
            {workspace && (
              <p className="text-xs text-muted-foreground truncate">{workspace.name}</p>
            )}
          </div>
          {workspaces.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {workspaces.map((ws) => (
                  <DropdownMenuItem
                    key={ws.id}
                    className="flex items-center justify-between"
                    onSelect={() => setActiveWorkspaceId(ws.id)}
                  >
                    <span className="truncate">{ws.name}</span>
                    {workspace?.id === ws.id && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="px-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <Avatar className="w-7 h-7 flex-shrink-0">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
            onClick={signOut}
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
