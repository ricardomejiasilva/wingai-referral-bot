require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ]
});

let invitesCache = new Map();

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const invites = await guild.invites.fetch();

  invitesCache = new Map(invites.map(invite => [invite.code, invite.uses]));
});

client.on('guildMemberAdd', async (member) => {
  const newInvites = await member.guild.invites.fetch();
  const usedInvite = [...newInvites.values()].find(i => invitesCache.get(i.code) < i.uses);

  invitesCache = new Map(newInvites.map(invite => [invite.code, invite.uses]));

  if (usedInvite) {
    await fetch(process.env.REFERRAL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discordUserId: member.user.id,
        discordUsername: member.user.username,
        inviteCode: usedInvite.code,
        invitedBy: usedInvite.inviter.id,
      }),
    });

    console.log(`🎯 ${member.user.username} joined using ${usedInvite.code} from ${usedInvite.inviter.username}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
