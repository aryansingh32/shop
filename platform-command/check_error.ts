import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://arnnnanfigwevyuevasf.supabase.co";
const supabaseKey = "sb_publishable_hjmmk6Fb8cUVFPYYY1e7_w_aaf5qZx9";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('shops')
    .select('business_name, provisioning_status, provisioning_error')
    .order('created_at', { ascending: false })
    .limit(3);
  
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}

check();
