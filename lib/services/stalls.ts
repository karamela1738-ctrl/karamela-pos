import { supabase } from "@/lib/supabase/client";

export async function getMainStall() {
  const { data, error } = await supabase
    .from("stalls")
    .select("id")
    .limit(1)
    .single();

  if (error) throw new Error(error.message);

  return data;
}