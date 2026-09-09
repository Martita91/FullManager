import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface SessionState {
  session: Session | null;
  /** True until the first answer arrives — distinct from "signed out". */
  loading: boolean;
}

/**
 * The signed-in session, kept in sync with Supabase's own auth events.
 *
 * `loading` matters: treating "not loaded yet" as "signed out" bounces a
 * signed-in user to the login screen on every hard refresh.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ session: data.session, loading: false });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ session, loading: false });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}
