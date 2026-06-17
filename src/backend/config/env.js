function require(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key, fallback = undefined) {
  return process.env[key] || fallback;
}

export const env = {
  // app
  port:        parseInt(optional('PORT', '3001'), 10),
  nodeEnv:     optional('NODE_ENV', 'production'),
  logLevel:    optional('LOG_LEVEL', 'info'),

  // discord
  discord: {
    clientId:      require('DISCORD_CLIENT_ID'),
    clientSecret:  require('DISCORD_CLIENT_SECRET'),
    botToken:      require('DISCORD_BOT_TOKEN'),
    guildId:       require('DISCORD_GUILD_ID'),
    redirectUri:   require('DISCORD_REDIRECT_URI'),
    roles: {
      admin: require('DISCORD_ROLE_ADMIN'),
      mod:   require('DISCORD_ROLE_MOD'),
    },
    channels: {
      modLog:       require('DISCORD_MOD_LOG_CHANNEL'),
      levelUp:      require('DISCORD_LEVELUP_CHANNEL'),
      intro:        require('DISCORD_INTRO_CHANNEL'),
      ventApproval: require('DISCORD_VENT_APPROVAL_CHANNEL'),
      ventPosts:    require('DISCORD_VENT_POSTS_CHANNEL'),
    },
  },

  // arcane level parsing
  arcane: {
    levelUpRegex: new RegExp(optional('ARCANE_LEVELUP_REGEX', 'Congrats .+, you have (\\d+) YUU Points!')),
  },

  // ranks
  ranks: {
    staff:     require('RANK_STAFF_ROLE_ID'),
    luminary:  require('RANK_LUMINARY_ROLE_ID'),
    prestige:  require('RANK_PRESTIGE_ROLE_ID'),
    vice:      require('RANK_VICE_ROLE_ID'),
    senator:   require('RANK_SENATOR_ROLE_ID'),
    dignitary: require('RANK_DIGNITARY_ROLE_ID'),
    attache:   require('RANK_ATTACHE_ROLE_ID'),
    citizen:   require('RANK_CITIZEN_ROLE_ID'),
  },

  // levelled thresholds
  // Staff, Luminary, Prestige are manual and have no thresholds
  rankThresholds: {
    citizen:   { min: parseInt(optional('RANK_CITIZEN_MIN',   '1'),  10), max: parseInt(optional('RANK_CITIZEN_MAX',   '10'),  10) },
    attache:   { min: parseInt(optional('RANK_ATTACHE_MIN',  '11'), 10), max: parseInt(optional('RANK_ATTACHE_MAX',  '20'), 10) },
    dignitary: { min: parseInt(optional('RANK_DIGNITARY_MIN','21'), 10), max: parseInt(optional('RANK_DIGNITARY_MAX','30'), 10) },
    senator:   { min: parseInt(optional('RANK_SENATOR_MIN',  '31'), 10), max: parseInt(optional('RANK_SENATOR_MAX',  '40'), 10) },
    vice:      { min: parseInt(optional('RANK_VICE_MIN',     '41'), 10) },
  },

  // google sheets
  sheets: {
    saKeyPath:   require('GOOGLE_SA_KEY_PATH'),
    warningsId:  require('SHEETS_WARNINGS_ID'),
    membersId:   require('SHEETS_MEMBERS_ID'),
    warningsUrl: `https://docs.google.com/spreadsheets/d/${require('SHEETS_WARNINGS_ID')}`,
    membersUrl:  `https://docs.google.com/spreadsheets/d/${require('SHEETS_MEMBERS_ID')}`,
  },

  // crafty
  crafty: {
    apiUrl:   require('CRAFTY_API_URL'),
    apiKey:   require('CRAFTY_API_KEY'),
    serverId: require('CRAFTY_SERVER_ID'),
  },

  // mediawiki
  wiki: {
    apiUrl:      require('WIKI_API_URL'),
    botUsername: require('WIKI_BOT_USERNAME'),
    botPassword: require('WIKI_BOT_PASSWORD'),
  },

  // auth
  auth: {
    jwtSecret:    require('JWT_SECRET'),
    jwtExpiry:    optional('JWT_EXPIRY', '8h'),
    cookieDomain: optional('COOKIE_DOMAIN', '.852r.org'),
  },
};

export default env;