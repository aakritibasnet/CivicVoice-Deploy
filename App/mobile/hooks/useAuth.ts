import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/session";
import { getMe, logout, User } from "@/lib/auth";
import { debugWarn } from "@/lib/debug";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      const res = await getMe();
      setUser(res.user);
    } catch (err: any) {
      debugWarn("useAuth refresh failed", err?.message);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const avatarUrl = user?.profile_image_url || null;

  return { user, avatarUrl, loading, refresh, signOut };
}
