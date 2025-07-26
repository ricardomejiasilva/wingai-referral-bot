require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Enhanced logging function
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  console.log(logMessage);
  if (data) {
    console.log('Data:', JSON.stringify(data, null, 2));
  }
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ]
});

let invitesCache = new Map();

client.once('ready', async () => {
  log('info', `Logged in as ${client.user.tag}`);
  
  try {
    log('debug', 'Fetching guild information', { guildId: process.env.GUILD_ID });
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    log('debug', 'Guild fetched successfully', { 
      guildName: guild.name, 
      memberCount: guild.memberCount 
    });

    log('debug', 'Fetching initial invites');
    const invites = await guild.invites.fetch();
    log('debug', 'Initial invites fetched', { 
      inviteCount: invites.size,
      inviteCodes: [...invites.keys()]
    });

    invitesCache = new Map(invites.map(invite => [invite.code, invite.uses]));
    log('debug', 'Invites cache initialized', {
      cacheSize: invitesCache.size,
      cacheEntries: Object.fromEntries(invitesCache)
    });
  } catch (error) {
    log('error', 'Error during bot initialization', { error: error.message, stack: error.stack });
  }
});

client.on('guildMemberAdd', async (member) => {
  log('info', 'New member joined', {
    userId: member.user.id,
    username: member.user.username,
    tag: member.user.tag,
    guildId: member.guild.id
  });

  try {
    log('debug', 'Fetching current invites to find which was used');
    const newInvites = await member.guild.invites.fetch();
    log('debug', 'Current invites fetched', { 
      currentInviteCount: newInvites.size 
    });

    // Log invite comparison process
    log('debug', 'Comparing invite usage', {
      cachedInvites: Object.fromEntries(invitesCache),
      currentInvites: Object.fromEntries(newInvites.map(i => [i.code, i.uses]))
    });

    const usedInvite = [...newInvites.values()].find(i => {
      const cachedUses = invitesCache.get(i.code) || 0;
      const currentUses = i.uses || 0;
      log('debug', `Checking invite ${i.code}`, {
        code: i.code,
        cachedUses,
        currentUses,
        wasUsed: cachedUses < currentUses
      });
      return cachedUses < currentUses;
    });

    // Update cache
    invitesCache = new Map(newInvites.map(invite => [invite.code, invite.uses]));
    log('debug', 'Invites cache updated', {
      newCacheSize: invitesCache.size
    });

    if (usedInvite) {
      log('info', 'Used invite found', {
        inviteCode: usedInvite.code,
        inviterId: usedInvite.inviter?.id,
        inviterUsername: usedInvite.inviter?.username,
        uses: usedInvite.uses
      });

      const payload = {
        discordUsername: member.user.username,
        inviteCode: usedInvite.code,
        invitedBy: usedInvite.inviter?.username,
      };

      log('debug', 'Sending referral data to API', {
        apiUrl: process.env.REFERRAL_API,
        payload
      });

      const response = await fetch(process.env.REFERRAL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const responseData = await response.json().catch(() => 'No JSON response');
        log('info', 'API call successful', {
          status: response.status,
          statusText: response.statusText,
          responseData
        });
        log('info', `🎯 ${member.user.username} joined using ${usedInvite.code} from ${usedInvite.inviter?.username}`);
      } else {
        const errorText = await response.text().catch(() => 'No error text');
        log('error', 'API call failed', {
          status: response.status,
          statusText: response.statusText,
          errorText
        });
      }
    } else {
      log('warn', 'No used invite found for new member', {
        userId: member.user.id,
        username: member.user.username,
        possibleReasons: [
          'Member joined via discovery',
          'Invite tracking failed',
          'Bot was offline when invite was created',
          'Direct server join'
        ]
      });
    }
  } catch (error) {
    log('error', 'Error processing new member', {
      userId: member.user.id,
      username: member.user.username,
      error: error.message,
      stack: error.stack
    });
  }
});

// Add error event listener
client.on('error', (error) => {
  log('error', 'Discord client error', { error: error.message, stack: error.stack });
});

// Add warning event listener
client.on('warn', (warning) => {
  log('warn', 'Discord client warning', { warning });
});

log('info', 'Starting Discord bot...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
  log('error', 'Failed to login to Discord', { error: error.message, stack: error.stack });
});
