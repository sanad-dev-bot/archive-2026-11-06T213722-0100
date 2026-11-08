const { EmbedBuilder } = require('discord.js');
const { addTextXP, addVoiceXP, getGuildConfig, getXP } = require('../utils/storage');
const { XP_PER_LEVEL } = require('../utils/rankCard');
const { rewardLevel } = require('../utils/levelRoles');


const textCooldowns = new Map();

const levelOf = xp => Math.floor((Number(xp) || 0) / XP_PER_LEVEL) + 1;

// Grants the XP, then announces if it crossed into a new level
async function grantXP(guild, userId, field, grant) {
  const before = levelOf(getXP(guild.id, userId)[field]);
  grant();
  await rewardLevel(guild, userId).catch(err => console.error('[LEVEL ROLES]', err.message));
  const after = levelOf(getXP(guild.id, userId)[field]);
  if (after <= before) return;

  const roomId = getGuildConfig(guild.id).levelup_room;
  const room = roomId ? await guild.channels.fetch(roomId).catch(() => null) : null;
  if (!room) return;
  const text = field === 'textXp' ? '💬 <@' + userId + '> وصل للفل الكتابي ' + after + '!' : '🎙️ <@' + userId + '> وصل للفل الصوتي ' + after + '!';
  await room.send({ embeds: [new EmbedBuilder().setDescription(text).setColor(0x5EF2D6)] }).catch(() => {});
}

// Perks depend on XP, so sitting alone, deafened or in AFK must not earn it
function earnsVoiceXP(channel, member) {
  if (member.user.bot || channel.id === channel.guild.afkChannelId) return false;
  if (member.voice?.deaf) return false;
  return channel.members.filter(m => !m.user.bot).size >= 2;
}

function startVoiceXpLoop(client) {
  if (client.__voiceXpLoopStarted) return;
  client.__voiceXpLoopStarted = true;

  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.filter(c => c.isVoiceBased()).values()) {
        for (const member of channel.members.values()) {
          if (!earnsVoiceXP(channel, member)) continue;
          grantXP(guild, member.id, 'voiceXp', () => addVoiceXP(guild.id, member.id, 5))
            .catch(err => console.error('[XP VOICE ERROR]', err));
        }
      }
    }
  }, 60_000);
}

module.exports = [
  {
    name: 'messageCreate',
    async execute(client, message) {
      if (!message.guild || message.author.bot) return;

      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const last = textCooldowns.get(key) || 0;
      if (now - last < 60_000) return;

      textCooldowns.set(key, now);
      await grantXP(message.guild, message.author.id, 'textXp', () => addTextXP(message.guild.id, message.author.id, 10))
        .catch(err => console.error('[XP TEXT ERROR]', err));
    },
  },

  {
    name: 'clientReady',
    once: true,
    async execute(client) {
      startVoiceXpLoop(client);
    },
  },
];

module.exports.earnsVoiceXP = earnsVoiceXP;
