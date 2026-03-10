import { Search, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { getSupabaseClient } from "@/lib/supabase/client";

interface AuthUserSummary {
  email: string;
  displayName: string;
}

export default function TopBar() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();
  const [user, setUser] = useState<AuthUserSummary | null>(null);

  useEffect(() => {
    let active = true;

    const toSummary = (rawUser: any): AuthUserSummary => ({
      email: rawUser.email ?? "",
      displayName:
        rawUser.user_metadata?.full_name
        ?? rawUser.user_metadata?.name
        ?? rawUser.email
        ?? "OrbitUMD User",
    });

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setUser(data.session?.user ? toSummary(data.session.user) : null);
    };

    void load();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toSummary(session.user) : null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase.auth]);

  const userLabel = useMemo(() => {
    if (!user) {
      return {
        name: "Not signed in",
        email: "",
      };
    }

    return {
      name: user.displayName,
      email: user.email,
    };
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/sign-in", { replace: true });
  };

  return (
    <header className="h-16 border-b border-border bg-card flex items-center px-6 gap-6">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search courses, requirements..."
            className="pl-10 bg-input-background border-border"
          />
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <User className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm">{userLabel.name}</span>
              <span className="text-xs text-muted-foreground">{userLabel.email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem onClick={() => void handleSignOut()}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}