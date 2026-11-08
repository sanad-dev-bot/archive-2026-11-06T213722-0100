const path = require('path');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, PermissionFlagsBits,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { getGuildConfig, loadJSON, saveJSON, setGuildConfig } = require('./storage');

const FILE = path.join(process.cwd(), 'data', 'applications.json');
const RETRY_DAYS = 7;
const QUESTIONS = [
  { id: 'hours', label: 'بتتواجد في السيرفر كام ساعة في اليوم؟', style: TextInputStyle.Short, max: 100 },
  { id: 'experience', label: 'خبرتك في إدارة السيرفرات', style: TextInputStyle.Paragraph, max: 600 },
  { id: 'why', label: 'ليه عايز تبقى من الإدارة؟', style: TextInputStyle.Paragraph, max: 600 },
  { id: 'scenario', label: 'لو عضو عمل سبام، هتتصرف إزاي؟', style: TextInputStyle.Paragraph, max: 600 },
];

function getRecord(guildId, userId) {
  return loadJSON(FILE)[guildId]?.[userId] || null;
}

function saveRecord(guildId, userId, record) {
  const data = loadJSON(FILE);
  data[guildId] = { ...data[guildId], [userId]: record };
  saveJSON(FILE, data);
}

function blockedReason(record) {
  if (!record) return null;
  if (record.status === 'pending') return '⏳ عندك تقديم لسه قيد المراجعة.';
  if (record.status === 'accepted') return '✅ تقديمك اتقبل قبل كده.';
  const retryAt = record.at + RETRY_DAYS * 86_400_000;
  return Date.now() < retryAt ? '🚫 تقدر تقدم تاني <t:' + Math.floor(retryAt / 1000) + ':R>.' : null;
}

const isAdmin = i => i.member.permissions.has(PermissionFlagsBits.Administrator);

// Admins can try the form before the opening; members only once applications are open
function refusal(i, cfg) {
  if (!cfg.apply_review_channel) return '❌ نظام التقديم مش متظبط.';
  if (!cfg.applications_open && !isAdmin(i)) return '🔒 التقديم مقفول دلوقتي.';
  return blockedReason(getRecord(i.guild.id, i.user.id));
}

async function showForm(i, cfg) {
  const reason = refusal(i, cfg);
  if (reason) return i.reply({ content: reason, ephemeral: true });

  const modal = new ModalBuilder().setCustomId('apply_modal').setTitle('📝 التقديم على الإدارة');
  modal.addComponents(...QUESTIONS.map(q => new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(q.id).setLabel(q.label).setStyle(q.style)
      .setMinLength(q.style === TextInputStyle.Paragraph ? 10 : 1).setMaxLength(q.max).setRequired(true),
  )));
  return i.showModal(modal);
}

async function submitForm(i, cfg) {
  await i.deferReply({ ephemeral: true });
  const reason = refusal(i, cfg);
  if (reason) return i.editReply({ content: reason });

  const channel = await i.guild.channels.fetch(cfg.apply_review_channel).catch(() => null);
  if (!channel) return i.editReply({ content: '❌ التقديم ماتبعتش، بلّغ الإدارة.' });

  const roles = cfg.apply_ping_roles || [];
  await channel.send({
    content: roles.map(id => '<@&' + id + '>').join(' ') || undefined,
    allowedMentions: { roles },
    embeds: [new EmbedBuilder()
      .setTitle('📝 تقديم جديد على الإدارة')
      .setDescription('**العضو:** <@' + i.user.id + '>\n**انضم للسيرفر:** <t:' + Math.floor(i.member.joinedTimestamp / 1000) + ':R>')
      .addFields(QUESTIONS.map(q => ({ name: q.label, value: i.fields.getTextInputValue(q.id) })))
      .setColor(0x5EF2D6)
      .setTimestamp()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('apply_accept:' + i.user.id).setLabel('قبول').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('apply_reject:' + i.user.id).setLabel('رفض').setEmoji('❌').setStyle(ButtonStyle.Danger),
    )],
  });
  saveRecord(i.guild.id, i.user.id, { status: 'pending', at: Date.now() });
  return i.editReply({ content: '✅ تقديمك وصل للإدارة، والرد هيوصلك في الخاص.' });
}

async function decide(i, cfg) {
  if (!isAdmin(i)) return i.reply({ content: '🚫 تحتاج صلاحية **Administrator**.', ephemeral: true });

  const [action, userId] = i.customId.replace('apply_', '').split(':');
  const accepted = action === 'accept';
  const record = getRecord(i.guild.id, userId);
  if (record?.status !== 'pending') return i.reply({ content: 'ℹ️ التقديم ده اتحسم قبل كده.', ephemeral: true });

  saveRecord(i.guild.id, userId, { status: accepted ? 'accepted' : 'rejected', at: Date.now(), by: i.user.id });
  const verdict = accepted ? '✅ اتقبل بواسطة <@' + i.user.id + '>' : '❌ اترفض بواسطة <@' + i.user.id + '>';
  await i.update({
    embeds: [EmbedBuilder.from(i.message.embeds[0])
      .addFields({ name: 'القرار', value: verdict })
      .setColor(accepted ? 0x57F287 : 0xED4245)],
    components: [],
  });

  const warnings = [];
  if (accepted) {
    const member = await i.guild.members.fetch(userId).catch(() => null);
    const granted = member && cfg.apply_accept_role
      && await member.roles.add(cfg.apply_accept_role, 'Staff application accepted').then(() => true).catch(() => false);
    if (!granted) warnings.push('⚠️ الرتبة ماتدتش تلقائي، إديهاله بإيدك.');
  }

  const text = accepted
    ? '✅ تقديمك في **' + i.guild.name + '** اتقبل، وأخدت رتبة Helper! أهلاً بيك في الفريق.'
    : '❌ تقديمك في **' + i.guild.name + '** ماتقبلش المرة دي. تقدر تقدم تاني بعد ' + RETRY_DAYS + ' أيام.';
  const user = await i.client.users.fetch(userId).catch(() => null);
  const sent = user && await user.send({ content: text }).then(() => true).catch(() => false);
  if (!sent) warnings.push('⚠️ القرار اتسجل، بس ماقدرتش أبعتله في الخاص.');
  if (warnings.length) await i.followUp({ content: warnings.join('\n'), ephemeral: true });
  return null;
}

async function handleApplyInteraction(i) {
  if (!i.inCachedGuild()) return false;
  const id = i.customId || '';
  const start = i.isButton() && id === 'apply_start';
  const submit = i.isModalSubmit() && id === 'apply_modal';
  const decision = i.isButton() && /^apply_(accept|reject):\d+$/.test(id);
  if (!start && !submit && !decision) return false;

  const cfg = getGuildConfig(i.guild.id);
  try {
    if (start) await showForm(i, cfg);
    else if (submit) await submitForm(i, cfg);
    else await decide(i, cfg);
  } catch (err) {
    console.error('[APPLICATION ERROR]', err);
    const payload = { content: '❌ حصلت مشكلة في التقديم، جرب تاني.', ephemeral: true };
    if (i.replied || i.deferred) await i.followUp(payload).catch(() => {});
    else await i.reply(payload).catch(() => {});
  }
  return true;
}

async function setApplicationsOpen(guild, open) {
  const cfg = getGuildConfig(guild.id);
  const room = await guild.channels.fetch(cfg.apply_room);
  await room.permissionOverwrites.edit(guild.id, { ViewChannel: open }, { reason: 'Applications ' + (open ? 'opened' : 'closed') });
  setGuildConfig(guild.id, 'applications_open', open);
}

module.exports = { handleApplyInteraction, setApplicationsOpen };
