import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function saveMessage(role, content) {
  const { error } = await supabase
    .from("messages")
    .insert([{ role, content }]);

  if (error) console.error("Supabase save error:", error);
}

export async function loadMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("Supabase load error:", error);
    return [];
  }

  return data;
}
