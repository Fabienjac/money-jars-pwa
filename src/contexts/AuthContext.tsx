import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface SubscriptionStatus {
  plan: "trial" | "active" | "expired" | "cancelled";
  trialEndsAt: Date | null;
  isActive: boolean; // trial non expiré OU abonnement actif
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  subscription: SubscriptionStatus | null;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

  async function fetchSubscription(userId: string) {
    const { data } = await supabase
      .from("subscriptions")
      .select("plan, trial_ends_at, current_period_end")
      .eq("user_id", userId)
      .maybeSingle();

    // Si aucune ligne n'existe (trigger raté ou premier login), on en crée une
    if (!data) {
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: created } = await supabase
        .from("subscriptions")
        .upsert(
          { user_id: userId, plan: "trial", trial_ends_at: trialEnd },
          { onConflict: "user_id" }
        )
        .select("plan, trial_ends_at, current_period_end")
        .maybeSingle();

      if (created) {
        setSubscription({ plan: "trial", trialEndsAt: new Date(trialEnd), isActive: true });
      } else {
        setSubscription({ plan: "trial", trialEndsAt: new Date(trialEnd), isActive: true });
      }
      return;
    }

    const trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
    const periodEnd = data.current_period_end ? new Date(data.current_period_end) : null;
    const now = new Date();

    const isTrialActive = data.plan === "trial" && trialEndsAt !== null && trialEndsAt > now;
    const isSubActive = data.plan === "active" && periodEnd !== null && periodEnd > now;

    setSubscription({
      plan: data.plan,
      trialEndsAt,
      isActive: isTrialActive || isSubActive,
    });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchSubscription(session.user.id);
      setLoading(false);
    });

    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchSubscription(session.user.id);
        } else {
          setSubscription(null);
        }
      }
    );

    return () => authListener.unsubscribe();
  }, []);

  async function signInWithEmail(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUpWithEmail(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function refreshSubscription() {
    if (user) await fetchSubscription(user.id);
  }

  return (
    <AuthContext.Provider value={{
      user, session, loading, subscription,
      signInWithEmail, signUpWithEmail, signInWithGoogle, signOut,
      refreshSubscription,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
