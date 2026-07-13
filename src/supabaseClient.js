import { createClient } from '@supabase/supabase-js';

// URL 칸에는 https:// 로 시작하는 주소가 들어가야 합니다.
const SUPABASE_URL = "https://jndfylyebvhnvcguctqy.supabase.co";

// KEY 칸에는 sb_publishable... 로 시작하는 열쇠가 들어가야 합니다.
const SUPABASE_ANON_KEY = "sb_publishable_AZuRMJc-xUlcCoGfRDPMKw__sQPojGj";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);