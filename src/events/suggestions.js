const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getGuildConfig, loadJSON, saveJSON } = require('../utils/storage');

const FILE = path.join(process.cwd(), 'data', 'suggestions.json');
const BRAND_COLOR = 0x5EF2D6;
const MIN_LENGTH = 15;
const MAX_LENGTH = 1000;
const NOTICE_MS = 12_000;
const UP = '👍';
const DOWN = '👎';

// Scales with the server: 2 votes today, 10 in a server of 100
const votesNeeded = guild => Math.max(2, Math.ceil(guild.memberCount * 0.1));

async function reject(message, text) {
  const notice = await message.channel.send({
    content: '<@' + message.author.id + '> ' + text,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), NOTICE_MS);
}

async function postSuggestion(message, text) {
  const data = loadJSON(FILE);
  const store = data[message.guild.id] || { count: 0, items: {} };
  const number = store.count + 1;

  const post = await message.channel.send({ embeds: [new EmbedBuilder()
    .setAuthor({ name: message.member?.displayName || message.author.username, iconURL: message.author.displayAvatarURL() })
    .setTitle('💡 اقتراح #' + number)
    .setDescription(text)
    .setColor(BRAND_COLOR)
    .setFooter({ text: 'صوّت بـ 👍 أو 👎' })
    .setTimestamp()] });

  store.count = number;
  store.items[post.id] = { author: message.author.id, number, notified: false };
  data[message.guild.id] = store;
  saveJSON(FILE, data);

  await post.react(UP);
  await post.react(DOWN);
}

async function handleMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId) return;
  if (message.channel.id !== getGuildConfig(message.guild.id).suggest_room) return;

  await message.delete().catch(() => {});
  const text = message.content.trim();

  if (/https?:\/\/|discord\.gg\//i.test(text)) return reject(message, '🚫 الروابط ممنوعة في الاقتراحات.');
  if (text.length < MIN_LENGTH) return reject(message, '✏️ اكتب اقتراحك بتفاصيل أكتر، أقل حاجة ' + MIN_LENGTH + ' حرف.');
  if (text.length > MAX_LENGTH) {
    // The member wrote a lot, so hand the text back instead of losing it
    await message.author.send({ content: text.slice(0, 2000) }).catch(() => {});
    return reject(message, '📏 الاقتراح أطول من ' + MAX_LENGTH + ' حرف. اختصره وابعته تاني.');
  }
  return postSuggestion(message, text);
}

async function notifyStaff(message, item, up, down, cfg) {
  const channel = await message.guild.channels.fetch(cfg.suggest_review_channel).catch(() => null);
  if (!channel) return;
  const roles = cfg.suggest_ping_roles || [];
  await channel.send({
    content: roles.map(id => '<@&' + id + '>').join(' ') || undefined,
    allowedMentions: { roles },
    embeds: [new EmbedBuilder()
      .setTitle('🔥 اقتراح #' + item.number + ' عليه تفاعل كبير')
      .setDescription(message.embeds[0]?.description || '')
      .addFields(
        { name: '👤 صاحب الاقتراح', value: '<@' + item.author + '>', inline: true },
        { name: '📊 التصويت', value: UP + ' ' + up + '   ' + DOWN + ' ' + down, inline: true },
      )
      .setColor(0xFFD166)
      .setTimestamp()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('افتح الاقتراح').setURL(message.url),
    )],
  });
}

async function handleReaction(reaction, user) {
  if (user.bot) return;
  const partial = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
  const guild = partial?.message.guild;
  if (!guild) return;
  const cfg = getGuildConfig(guild.id);
  if (partial.message.channelId !== cfg.suggest_room) return;

  const data = loadJSON(FILE);
  const item = data[guild.id]?.items?.[partial.message.id];
  if (!item || ![UP, DOWN].includes(partial.emoji.name)) return;

  if (user.id === item.author) {
    await partial.users.remove(user.id).catch(() => {});
    return;
  }
  if (item.notified) return;

  const message = await partial.message.channel.messages.fetch({ message: partial.message.id, force: true });
  const count = emoji => Math.max(0, (message.reactions.cache.get(emoji)?.count || 1) - 1);
  const up = count(UP);
  const down = count(DOWN);
  if (up - down < votesNeeded(guild)) return;

  item.notified = true;
  saveJSON(FILE, data);
  await notifyStaff(message, item, up, down, cfg);
}

module.exports = [
  {
    name: 'messageCreate',
    async execute(client, message) {
      await handleMessage(message).catch(err => console.error('[SUGGESTIONS]', err.message));
    },
  },
  {
    name: 'messageReactionAdd',
    async execute(client, reaction, user) {
      await handleReaction(reaction, user).catch(err => console.error('[SUGGESTIONS]', err.message));
    },
  },
];
