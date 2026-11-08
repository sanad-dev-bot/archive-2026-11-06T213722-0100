const path = require('path');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getGuildConfig, getLogChannel, getWarns, addWarn, addModlog, loadJSON, saveJSON,
} = require('../utils/storage');
const { breaksRoomLanguage } = require('../utils/roomLanguage');

const FILE = path.join(process.cwd(), 'data', 'languagestrikes.json');
const STRIKE_DAYS = 7;
const NOTICE_MS = 20_000;
const NOTICE_COOLDOWN_MS = 10_000;
const REASON = 'مخالفة لغة الروم بعد تحذير كتابي';
const lastNotice = new Map();

const NOTICES = {
  en: {
    first: 'This channel is English only. Your message was deleted. Next time you will get the Warned role.\nالروم ده للإنجليزي بس. رسالتك اتمسحت، والمرة الجاية هتاخد رتبة Warned.',
    repeat: 'You were already warned: this channel is English only. You now have the Warned role.\nاتحذرت قبل كده إن الروم ده للإنجليزي بس، فأخدت رتبة Warned.',
  },
  ar: {
    first: 'الروم ده للعربي بس. رسالتك اتمسحت، والمرة الجاية هتاخد رتبة Warned.\nThis channel is Arabic only. Your message was deleted. Next time you will get the Warned role.',
    repeat: 'اتحذرت قبل كده إن الروم ده للعربي بس، فأخدت رتبة Warned.\nYou were already warned: this channel is Arabic only. You now have the Warned role.',
  },
};

function roomLanguage(cfg, channelId) {
  const { language_rooms: rooms } = cfg;
  if (rooms?.en === channelId) return 'en';
  if (rooms?.ar === channelId) return 'ar';
  return null;
}

// Returns true when this member already had a strike inside the window
function recordStrike(guildId, userId) {
  const data = loadJSON(FILE);
  const strikes = data[guildId] || {};
  const last = strikes[userId];
  strikes[userId] = Date.now();
  data[guildId] = strikes;
  saveJSON(FILE, data);
  return Boolean(last) && Date.now() - last < STRIKE_DAYS * 86_400_000;
}

async function giveWarning(message, member, cfg) {
  const { guild, client } = message;
  // One warning entry only: stacking them would reach the 5-warning ban through /warn
  if (!getWarns(guild.id, member.id).some(w => w.reason === REASON)) {
    const entry = { reason: REASON, mod: client.user.tag, modId: client.user.id, time: new Date().toISOString() };
    addWarn(guild.id, member.id, entry);
    addModlog(guild.id, member.id, { action: 'warn', ...entry });
  }
  if (cfg.warn_role) await member.roles.add(cfg.warn_role, REASON).catch(() => {});

  const log = await getLogChannel(guild);
  await log?.send({ embeds: [new EmbedBuilder()
    .setTitle('⚠️ مخالفة لغة الروم')
    .setDescription('<@' + member.id + '> كرر الكلام بلغة غلط في <#' + message.channel.id + '> وأخد رتبة Warned.')
    .setColor(0xfee75c).setTimestamp()] }).catch(() => {});
}

async function sendNotice(message, member, text) {
  const key = message.guild.id + ':' + member.id;
  if (Date.now() - (lastNotice.get(key) || 0) < NOTICE_COOLDOWN_MS) return;
  lastNotice.set(key, Date.now());
  const notice = await message.channel.send({
    content: '<@' + member.id + '> ' + text,
    allowedMentions: { users: [member.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), NOTICE_MS);
}

async function checkMessage(message) {
  if (!message.guild || message.author?.bot || message.webhookId) return;
  const cfg = getGuildConfig(message.guild.id);
  const lang = roomLanguage(cfg, message.channel.id);
  if (!lang || !breaksRoomLanguage(message.content, lang)) return;

  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member || member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const deleted = await message.delete().then(() => true).catch(() => false);
  if (!deleted) return;

  const repeated = recordStrike(message.guild.id, member.id);
  if (repeated) await giveWarning(message, member, cfg);
  await sendNotice(message, member, NOTICES[lang][repeated ? 'repeat' : 'first']);
}

module.exports = [
  {
    name: 'messageCreate',
    async execute(client, message) {
      await checkMessage(message).catch(err => console.error('[LANGUAGE GUARD]', err.message));
    },
  },
  {
    // Editing a clean message must not get around the rule
    name: 'messageUpdate',
    async execute(client, oldMessage, newMessage) {
      const message = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
      if (message) await checkMessage(message).catch(err => console.error('[LANGUAGE GUARD]', err.message));
    },
  },
];
