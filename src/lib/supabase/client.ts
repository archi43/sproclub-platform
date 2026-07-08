"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/** Supabase client for Client Components (browser). */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
