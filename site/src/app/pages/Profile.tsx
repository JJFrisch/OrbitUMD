import { useEffect, useState } from "react";
import { UserCircle2, Mail, Save } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function Profile() {
  const supabase = getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const { user } = authData;
        if (!user) throw new Error("Please sign in to view your profile.");

        const { data: row, error: profileError } = await supabase
          .from("user_profiles")
          .select("display_name, email, university_uid")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!active) return;

        setDisplayName(String(row?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""));
        setEmail(String(row?.email ?? user.email ?? ""));
        setUid(String(row?.university_uid ?? ""));
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Unable to load profile.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [supabase]);

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Please sign in to save your profile.");

      const { error } = await supabase
        .from("user_profiles")
        .upsert({
          id: authData.user.id,
          display_name: displayName.trim() || null,
          email: email.trim() || authData.user.email || null,
          university_uid: uid.trim() || null,
        }, { onConflict: "id" });

      if (error) throw error;
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Update your account details for OrbitUMD.</p>
      </div>

      <Card className="p-6 space-y-5">
        {loading ? <p className="text-sm text-muted-foreground">Loading profile...</p> : null}

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <UserCircle2 className="w-4 h-4" />
            Display Name
          </label>
          <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your preferred name" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email
          </label>
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@umd.edu" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">University UID</label>
          <Input value={uid} onChange={(event) => setUid(event.target.value)} placeholder="UID" />
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        <div className="flex justify-end">
          <Button onClick={() => void saveProfile()} disabled={loading || saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </Card>
    </div>
  );
}