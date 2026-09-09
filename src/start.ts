import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startInstance = createStart(() => ({
  // Applied to every server function in the app. Without this, each RPC would
  // have to remember to send its own auth token.
  functionMiddleware: [attachSupabaseAuth],
}));
