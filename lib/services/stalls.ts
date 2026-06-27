import { supabase } from "@/lib/supabase/client";
import { getStoredStaffSession } from "@/lib/services/auth";

export async function getMainStall() {
  const session = getStoredStaffSession();

  if (!session?.session_token) {
    throw new Error("Staff session has expired. Please sign in again.");
  }

  const { data, error } = await supabase.rpc("get_staff_stall", {
    p_session_token: session.session_token,
  });

  if (error) throw new Error(error.message);

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Could not find stall");
  }

  const stallId = "id" in data ? data.id : null;

  if (typeof stallId !== "string" || !stallId.trim()) {
    throw new Error("Could not find stall");
  }

  return { id: stallId };
}
