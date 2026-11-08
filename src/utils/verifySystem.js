const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { buildWelcomeCard } = require('./banner');
const { langFor } = require('./i18n');
const { isStripped } = require('./incidentSystem');
const { em } = require('./embed');
const { lookupRoblox } = require('./robloxLink');
const { getAutoLineConfig, getGuildConfig, getLogChannel } = require('./storage');

const challenges = new Map();
const CHALLENGE_MS = 5 * 60_000;
// Members who solved the question keep that pass while they link Roblox
const passed = new Map();
const PASS_MS = 30 * 60_000;
const WELCOME_LINKS = { rules: '1562922531231633469', chat: '1562922538302967922', tickets: '1562922536155480068' };
const BLOXLINK_VERIFY_URL = 'https://blox.link/verify';

function arabicToLatin(text) {
  return text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).trim();
}

async function sendWelcome(member) {
  const cfg = getGuildConfig(member.guild.id);
  const ch = cfg.welcome_channel ? member.guild.channels.cache.get(cfg.welcome_channel) : null;
  if (!ch) return;
  const humans = member.guild.members.cache.filter(m => !m.user.bot).size;
  const custom = cfg.welcome_msg && cfg.welcome_msg
    .replace('{member}', '<@' + member.id + '>')
    .replace('{server}', member.guild.name)
    .replace('{count}', String(humans))
    .replace('{name}', member.displayName);
  const text = custom || [
    'أهلاً بيك <@' + member.id + '>، نورت **' + member.guild.name + '** 🎉',
    'مبسوطين إنك معانا. ابدأ من الزراير تحت، ولو احتجت حاجة الإدارة موجودة.',
  ].join('\n');
  const roomLink = (label, emoji, roomId) => new ButtonBuilder()
    .setStyle(ButtonStyle.Link).setLabel(label).setEmoji(emoji)
    .setURL('https://discord.com/channels/' + member.guild.id + '/' + roomId);
  try {
    const card = await buildWelcomeCard(member, humans, langFor(member.guild.id, ch.id));
    await ch.send({
      content: '<@' + member.id + '>',
      embeds: [new EmbedBuilder()
        .setDescription(text)
        .setColor(0x5EF2D6)
        .setImage('attachment://welcome.png')],
      files: [card],
      components: [new ActionRowBuilder().addComponents(
        roomLink('القوانين', '📜', WELCOME_LINKS.rules),
        roomLink('الشات', '💬', WELCOME_LINKS.chat),
        roomLink('التذاكر', '🎫', WELCOME_LINKS.tickets),
      )],
    });
    const line = getAutoLineConfig(member.guild.id).image;
    if (line) await ch.send({ files: [{ attachment: line, name: 'autoline.png' }] });
  } catch (err) {
    console.error('[WELCOME ERROR]', err.message);
  }
}

function linkPrompt() {
  return {
    content: '🔗 خطوة أخيرة: اربط حساب Roblox من الزرار، وبعدها استخدم أمر **/verify** بتاع Bloxlink في الروم ده، واضغط **فحص تاني**.',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('اربط Roblox').setURL(BLOXLINK_VERIFY_URL),
      new ButtonBuilder().setCustomId('verify_recheck').setLabel('فحص تاني').setEmoji('🔄').setStyle(ButtonStyle.Primary),
    )],
  };
}

async function completeVerification(i, cfg) {
  const roblox = await lookupRoblox(i.guild.id, i.user.id);
  if (roblox.state === 'disabled') {
    // Without an API key, the Verified role Bloxlink gives is the proof of a linked account
    const member = await i.guild.members.fetch({ user: i.user.id, force: true });
    roblox.state = member.roles.cache.has(cfg.verified_role) ? 'linked' : 'unlinked';
  }
  if (roblox.state === 'error') return i.editReply({ content: '⚠️ مش قادر أوصل لـ Bloxlink دلوقتي، جرب كمان شوية.', components: [] });
  if (roblox.state === 'unlinked') {
    passed.set(i.user.id, Date.now() + PASS_MS);
    return i.editReply(linkPrompt());
  }

  passed.delete(i.user.id);
  const grant = [cfg.auto_role].filter(id => id && i.guild.roles.cache.has(id));
  await i.member.roles.add(grant, 'Verification passed');
  await i.member.roles.remove(cfg.verify_role, 'Verification passed');
  await i.editReply({ content: '✅ تم التحقق! نوّرت السيرفر.', components: [] });
  await sendWelcome(i.member);

  const log = await getLogChannel(i.guild);
  const detail = roblox.robloxId ? ' — Roblox ID: ' + roblox.robloxId : '';
  await log?.send({ embeds: [em('✅ تحقق عضو', '<@' + i.user.id + '> عدى التحقق' + detail, Colors.Green)] }).catch(() => {});
}

async function recheck(i, cfg) {
  if (!i.member.roles.cache.has(cfg.verify_role)) return i.reply({ content: '✅ إنت متحقق بالفعل.', ephemeral: true });
  if (!((passed.get(i.user.id) || 0) > Date.now())) return i.reply({ content: '⏰ الوقت خلص، اضغط تحقق من الأول.', ephemeral: true });
  await i.deferReply({ ephemeral: true });
  return completeVerification(i, cfg);
}

async function start(i, cfg) {
  if (!i.member.roles.cache.has(cfg.verify_role)) return i.reply({ content: '✅ إنت متحقق بالفعل.', ephemeral: true });
  if ((passed.get(i.user.id) || 0) > Date.now()) return recheck(i, cfg);
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 1 + Math.floor(Math.random() * 9);
  challenges.set(i.user.id, { answer: String(a + b), expires: Date.now() + CHALLENGE_MS });
  return i.showModal(new ModalBuilder().setCustomId('verify_modal').setTitle('التحقق').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('answer').setLabel('ناتج ' + a + ' + ' + b + ' كام؟')
      .setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(true)),
  ));
}

async function finish(i, cfg) {
  const challenge = challenges.get(i.user.id);
  challenges.delete(i.user.id);
  if (!challenge || challenge.expires < Date.now()) return i.reply({ content: '⏰ السؤال انتهى، اضغط تحقق تاني.', ephemeral: true });
  if (arabicToLatin(i.fields.getTextInputValue('answer')) !== challenge.answer) {
    return i.reply({ content: '❌ الإجابة غلط، اضغط تحقق وجرب تاني.', ephemeral: true });
  }

  await i.deferReply({ ephemeral: true });
  return completeVerification(i, cfg);
}

async function handleVerifyInteraction(i) {
  if (!i.inCachedGuild()) return false;
  const button = i.isButton() && i.customId === 'verify_start';
  const again = i.isButton() && i.customId === 'verify_recheck';
  const modal = i.isModalSubmit() && i.customId === 'verify_modal';
  if (!button && !again && !modal) return false;

  const cfg = getGuildConfig(i.guild.id);
  if (isStripped(i.guild.id, i.user.id)) {
    await i.reply({ content: '🚫 رتبك متوقفة لحد ما مراجعة الحماية تخلص.', ephemeral: true });
    return true;
  }
  try {
    if (!cfg.verify_role) await i.reply({ content: 'نظام التحقق مش متظبط.', ephemeral: true });
    else if (button) await start(i, cfg);
    else if (again) await recheck(i, cfg);
    else await finish(i, cfg);
  } catch (err) {
    console.error('[VERIFY ERROR]', err);
    const payload = { content: '❌ التحقق ماكملش، بلّغ الإدارة.', ephemeral: true };
    await (i.deferred || i.replied ? i.followUp(payload) : i.reply(payload)).catch(() => {});
  }
  return true;
}

module.exports = { handleVerifyInteraction, sendWelcome };
