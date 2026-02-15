import { createClient } from '@supabase/supabase-js'

const fallbackSupabaseUrl = 'https://rrwkafhcgefvtlvsayou.supabase.co'
const fallbackSupabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyd2thZmhjZ2VmdnRsdnNheW91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTM5NjksImV4cCI6MjA4NjY4OTk2OX0.FT_EMz8HakuRXZi4NdY5_VGTHLUuspselPcLijaNzPM'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackSupabaseAnonKey

export const missingSupabaseKeys = [
  !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
  !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
].filter(Boolean) as string[]

export const hasSupabaseConfig = missingSupabaseKeys.length === 0

export const supabase = hasSupabaseConfig ? createClient(supabaseUrl!, supabaseAnonKey!) : null
