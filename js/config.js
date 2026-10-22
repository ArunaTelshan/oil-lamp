// Lake of Lights — settings
// Fill in SUPABASE_URL and SUPABASE_ANON_KEY from:
// Supabase dashboard → Project Settings → API (or "Connect").
// The anon key is meant to be public; the database rules protect the data.

export const CONFIG = {
  SUPABASE_URL: 'https://tlkybfjmzcgqdlgohlwh.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_ocEjwsH3tEPa7ci-AfWGGA_Jp9ioK9Q',

  TOTAL_LAMPS: 140,
  FINALE_WORD: 'WELCOME',

  // Full link to the guest page (used for the QR code on the big screen).
  // Leave empty to use the folder the screen page is served from.
  GUEST_URL: '',

  // How often the big screen checks for new lamps (milliseconds).
  POLL_MS: 1000,

  // Seed for the lamp layout. Changing it rearranges every lamp spot.
  LAYOUT_SEED: 1105,

  // Nicknames that are refused (the database has the same list).
  BLOCKED: [
    'FUCK','FUK','FCK','SHIT','CUNT','DICK','COCK','PISS','TWAT','SLUT',
    'FAG','FAGS','CUM','CUMS','TITS','TIT','ANUS','ARSE','ASS','BOOB',
    'PORN','SEX','SEXY','RAPE','NAZI','KKK','NIGG','NIGA','HOE','HOES',
    'WANK','JIZZ','BICH','BTCH','PUSY','WTF','STFU',
    'BITCH','WHORE','PUSSY','DILDO','PENIS','VAGINA','RAPIST','SLUTS','BOOBS',
    'DICKS','COCKS','TWATS','WANKER','BASTRD','ASSHOL','NIGGA','NIGGER','HITLER',
  ],
  // Refused anywhere inside a nickname.
  BLOCKED_PARTS: ['FUCK', 'CUNT', 'NIGG'],

  NICK_MAX: 6,
};

export function isConfigured() {
  return CONFIG.SUPABASE_URL.startsWith('https://') &&
    !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT') &&
    !CONFIG.SUPABASE_ANON_KEY.includes('YOUR-ANON-KEY');
}
