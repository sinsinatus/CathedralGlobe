import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cscktezclygxmtslykty.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzY2t0ZXpjbHlneG10c2x5a3R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Mzk2MTMsImV4cCI6MjA5NDAxNTYxM30.mXkXLGFD-g9rtDeIx0iJK8AdPbpAH0vhy7YNXbvjQNg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);