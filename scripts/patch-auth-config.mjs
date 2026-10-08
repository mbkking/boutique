import fs from 'node:fs';
let s = fs.readFileSync('supabase/config.toml', 'utf8');
if (!s.includes('enable_confirmations = false')) {
  s = s.replace('enable_confirmations = true', 'enable_confirmations = false');
}
if (!s.includes('[auth.external.google]')) {
  s += '\n[auth.external.google]\nenabled = false\nclient_id = ""\nsecret = ""\nurl = ""\nskip_nonce_check = false\nemail_optional = true\n';
}
fs.writeFileSync('supabase/config.toml', s);
console.log(s.includes('enable_confirmations = false'), s.includes('[auth.external.google]'));
