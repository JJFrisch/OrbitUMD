import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return cachedClient;
}

export async function getAuthenticatedUserId(): Promise<string> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  const user = sessionData.session?.user;
  if (!user) {
    throw new Error("Please sign in to save and load schedules.");
  }

  // Ensure FK-backed user tables (e.g. user_schedules.user_id) always have a profile row.
  const { error: profileError } = await supabase
    .from("user_profiles")
    .upsert({
      id: user.id,
      email: user.email ?? null,
    }, { onConflict: "id" });

  if (profileError) {
    throw profileError;
  }

  return user.id;
}
