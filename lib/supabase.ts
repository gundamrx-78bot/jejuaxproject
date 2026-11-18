"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 브라우저용 Supabase 클라이언트. URL과 공개용(anon/publishable) 키만 쓴다.
// 공개용 키는 원래 브라우저에 노출되는 값이고, 실제 보호는 DB의 RLS(본인 기록만)가 맡는다.
// 값이 없으면 null 을 돌려주고, 화면은 회원 기능을 숨긴 채 그대로 동작한다.
// NEXT_PUBLIC_ 값은 빌드할 때 코드에 박히므로 process.env.이름 을 그대로 써야 한다.
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const KEY_ = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!URL_ || !KEY_) return null;
  if (!client) client = createClient(URL_, KEY_, { auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } });
  return client;
}
