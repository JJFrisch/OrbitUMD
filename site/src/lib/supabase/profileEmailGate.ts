import type { SupabaseClient } from "@supabase/supabase-js";

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export interface ProfileEmailSnapshot {
  hasProfileRow: boolean;
  hasProfileEmail: boolean;
  profileEmail: string | null;
}

export async function getProfileEmailSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileEmailSnapshot> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.id) {
    return {
      hasProfileRow: false,
      hasProfileEmail: false,
      profileEmail: null,
    };
  }

  const email = normalize(data.email);
  return {
    hasProfileRow: true,
    hasProfileEmail: email.length > 0,
    profileEmail: email.length > 0 ? email : null,
  };
}

export async function userNeedsOnboardingByEmail(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const snapshot = await getProfileEmailSnapshot(supabase, userId);
  return !snapshot.hasProfileEmail;
}
