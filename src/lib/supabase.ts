
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Falta configurar la URL o la clave publicable de Supabase en .env.local',
  )
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
)
