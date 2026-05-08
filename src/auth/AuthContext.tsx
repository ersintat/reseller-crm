import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

export interface AuthProfile {
  id: string;
  name: string | null;
  email: string | null;
  status: string;
  created_at: string;
}

type AppRole = 'admin' | 'employee';

interface AuthContextValue {
  authEnabled: boolean;
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  roles: AppRole[];
  isAdmin: boolean;
  isEmployee: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadProfileAndRoles(userId: string) {
  if (!supabase) return { profile: null, roles: [] as AppRole[] };

  const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] = await Promise.all([
    supabase.from('profiles').select('id,name,email,status,created_at').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ]);

  if (profileError) console.warn('Failed to load profile.', profileError);
  if (roleError) console.warn('Failed to load roles.', roleError);

  return {
    profile: (profile as AuthProfile | null) ?? null,
    roles: ((roleRows ?? []).map((row) => row.role).filter(Boolean) as AppRole[]) ?? [],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    const applySession = async (nextSession: Session | null) => {
      setSession(nextSession);
      if (!nextSession?.user) {
        setProfile(null);
        setRoles([]);
        setLoading(false);
        return;
      }

      const next = await loadProfileAndRoles(nextSession.user.id);
      if (!active) return;
      setProfile(next.profile);
      setRoles(next.roles);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authEnabled: isSupabaseConfigured,
      session,
      user: session?.user ?? null,
      profile,
      roles,
      isAdmin: roles.includes('admin'),
      isEmployee: roles.includes('employee'),
      loading,
      signIn: async (email: string, password: string) => {
        if (!supabase) return;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async (email: string, password: string, name?: string) => {
        if (!supabase) return;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
            },
          },
        });
        if (error) throw error;
      },
      signOut: async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [loading, profile, roles, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
