// "use client";
// import { createBrowserClient } from "@supabase/ssr";
// export const createClient = () =>
//   createBrowserClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
//   );
// lib/supabase/client.ts
import { createClient as createClientSupabase } from "@supabase/supabase-js";

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase URL or key is missing!");
  }

  return createClientSupabase(url, key);
};
