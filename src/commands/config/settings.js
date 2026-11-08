const { SlashCommandBuilder, Colors, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { em } = require('../../utils/embed');
const { getGuildConfig, setGuildConfig, deleteGuildConfigKey } = require('../../utils/storage');
const { isTrusted } = require('../../utils/trust');
const { unlockServer } = require('../../utils/lockdown');

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

module.exports = [

  // ── AUTO ROLE ─────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('setautorole').setDescription('رتبة تُعطى تلقائياً لكل عضو جديد')
      .addRoleOption(o => o.setName('role').setDescription('الرتبة').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      const role = i.options.getRole('role');
      if (role.comparePositionTo(i.guild.members.me.roles.highest) >= 0)
        return reply(i, em('❌', 'الرتبة أعلى من رتبتي.', Colors.Red), true);
      setGuildConfig(i.guild.id, 'auto_role', role.id);
      reply(i, em('✅ تم التفعيل', `سيحصل الأعضاء الجدد على <@&${role.id}> تلقائياً.`, Colors.Green));
    },
  },
  {
    data: new SlashCommandBuilder().setName('disableautorole').setDescription('إلغاء نظام الرتبة التلقائية'),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      deleteGuildConfigKey(i.guild.id, 'auto_role');
      reply(i, em('🔴 تم الإلغاء', 'تم إيقاف نظام الرتبة التلقائية.', Colors.Orange));
    },
  },

  // ── LOGGING ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('setlog').setDescription('تحديد قناة اللوق')
      .addChannelOption(o => o.setName('channel').setDescription('قناة اللوق').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      const ch = i.options.getChannel('channel');
      setGuildConfig(i.guild.id, 'log_channel', ch.id);
      reply(i, new EmbedBuilder()
        .setColor(0x57f287).setTitle('✅ تم تفعيل اللوق').setDescription(`سيتم إرسال السجلات إلى <#${ch.id}>`)
        .addFields({ name: '📋 ما يُسجَّل', value: [
          '• انضمام/مغادرة الأعضاء مع عمر الحساب',
          '• حذف/تعديل الرسائل',
          '• حظر/رفع حظر مع من نفّذه',
          '• إضافة/إزالة رتب مع من نفّذها',
          '• إنشاء/حذف/تعديل القنوات',
          '• إنشاء/حذف/تعديل الرتب',
          '• حالة القنوات الصوتية',
          '• إضافة/حذف الإيموجيات والستيكرات',
          '• الدعوات — الإسكات (Timeout)',
        ].join('\n'), inline: false })
        .setTimestamp()
      );
    },
  },
  {
    data: new SlashCommandBuilder().setName('disablelog').setDescription('إيقاف نظام اللوق'),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      deleteGuildConfigKey(i.guild.id, 'log_channel');
      reply(i, em('🔴 تم الإيقاف', 'نظام اللوق موقوف.', Colors.Orange));
    },
  },

  // ── PROTECTION: Anti-Raid ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('setantiraid').setDescription('تفعيل نظام الحماية من المداهمة')
      .addBooleanOption(o => o.setName('enabled').setDescription('تفعيل أو إيقاف').setRequired(true))
      .addIntegerOption(o => o.setName('threshold').setDescription('عدد الانضمامات التي تُشغّل الحماية (افتراضي: 8)').setMinValue(3).setMaxValue(50))
      .addIntegerOption(o => o.setName('window').setDescription('النافذة الزمنية بالثواني (افتراضي: 10)').setMinValue(3).setMaxValue(60)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      const enabled   = i.options.getBoolean('enabled');
      const threshold = i.options.getInteger('threshold') || 8;
      const window    = i.options.getInteger('window')    || 10;
      setGuildConfig(i.guild.id, 'prot_antiraid',           enabled);
      setGuildConfig(i.guild.id, 'prot_antiraid_threshold', threshold);
      setGuildConfig(i.guild.id, 'prot_antiraid_window',    window);
      reply(i, em(
        enabled ? '🛡️ Anti-Raid مُفعَّل' : '🔴 Anti-Raid مُوقَف',
        enabled ? `سيتم قفل السيرفر إذا انضم **${threshold}** عضو خلال **${window}** ثانية.` : 'تم إيقاف Anti-Raid.',
        enabled ? Colors.Green : Colors.Orange
      ));
    },
  },
  {
    data: new SlashCommandBuilder().setName('protunlock').setDescription('فتح كل الرومات بعد قفل الحماية (للأونر والكو أونر)'),
    async execute(i) {
      if (!isTrusted(i.member))
        return reply(i, em('🚫', 'الأمر ده للأونر والكو أونر بس.', Colors.Red), true);
      await i.deferReply();
      const count = await unlockServer(i.guild, i.user.tag);
      i.editReply({ embeds: [em('🔓 تم الفتح', `اتفتح **${count}** روم ورجع زي ما كان.\n**بواسطة:** <@${i.user.id}>`, Colors.Green)] });
    },
  },

  // ── PROTECTION: Anti-Spam ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('setantispam').setDescription('تفعيل نظام الحماية من سبام الرسائل')
      .addBooleanOption(o => o.setName('enabled').setDescription('تفعيل أو إيقاف').setRequired(true))
      .addIntegerOption(o => o.setName('limit').setDescription('عدد الرسائل (افتراضي: 6)').setMinValue(3).setMaxValue(20))
      .addIntegerOption(o => o.setName('window').setDescription('النافذة الزمنية بالثواني (افتراضي: 5)').setMinValue(2).setMaxValue(30)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      const enabled = i.options.getBoolean('enabled');
      const limit   = i.options.getInteger('limit')  || 6;
      const window  = i.options.getInteger('window') || 5;
      setGuildConfig(i.guild.id, 'prot_antispam',        enabled);
      setGuildConfig(i.guild.id, 'prot_antispam_limit',  limit);
      setGuildConfig(i.guild.id, 'prot_antispam_window', window);
      reply(i, em(
        enabled ? '🛡️ Anti-Spam مُفعَّل' : '🔴 Anti-Spam مُوقَف',
        enabled ? `سيتم إسكات العضو إذا أرسل **${limit}** رسائل خلال **${window}** ثواني.` : 'تم إيقاف Anti-Spam.',
        enabled ? Colors.Green : Colors.Orange
      ));
    },
  },

  // ── PROTECTION: Anti-Mention ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('setantimentions').setDescription('تفعيل الحماية من الذكر المفرط')
      .addBooleanOption(o => o.setName('enabled').setDescription('تفعيل أو إيقاف').setRequired(true))
      .addIntegerOption(o => o.setName('limit').setDescription('الحد الأقصى للذكريات بالرسالة (افتراضي: 5)').setMinValue(2).setMaxValue(20)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      const enabled = i.options.getBoolean('enabled');
      const limit   = i.options.getInteger('limit') || 5;
      setGuildConfig(i.guild.id, 'prot_antimentions',       enabled);
      setGuildConfig(i.guild.id, 'prot_antimentions_limit', limit);
      reply(i, em(
        enabled ? '🛡️ Anti-Mentions مُفعَّل' : '🔴 Anti-Mentions مُوقَف',
        enabled ? `سيتم إسكات العضو إذا ذكر **${limit}** أعضاء أو أكثر في رسالة واحدة.` : 'تم إيقاف Anti-Mentions.',
        enabled ? Colors.Green : Colors.Orange
      ));
    },
  },

  // ── PROTECTION: Anti-Link ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('setantilink').setDescription('تفعيل الحماية من الروابط')
      .addBooleanOption(o => o.setName('enabled').setDescription('تفعيل أو إيقاف').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      const enabled = i.options.getBoolean('enabled');
      setGuildConfig(i.guild.id, 'prot_antilink', enabled);
      reply(i, em(
        enabled ? '🛡️ Anti-Link مُفعَّل' : '🔴 Anti-Link مُوقَف',
        enabled ? 'سيتم حذف أي رسالة تحتوي على رابط.' : 'تم إيقاف Anti-Link.',
        enabled ? Colors.Green : Colors.Orange
      ));
    },
  },

  // ── PROTECTION STATUS ────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('protstatus').setDescription('عرض حالة أنظمة الحماية'),
    async execute(i) {
      const cfg = getGuildConfig(i.guild.id);
      const on  = '✅ مُفعَّل';
      const off = '❌ مُوقَف';
      reply(i, new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🛡️ حالة أنظمة الحماية')
        .addFields(
          { name: '🚨 Anti-Raid',      value: cfg.prot_antiraid      ? `${on} — ${cfg.prot_antiraid_threshold || 8} انضمام / ${cfg.prot_antiraid_window || 10}s` : off, inline: false },
          { name: '🔁 Anti-Spam',      value: cfg.prot_antispam      ? `${on} — ${cfg.prot_antispam_limit || 6} رسائل / ${cfg.prot_antispam_window || 5}s`        : off, inline: false },
          { name: '📢 Anti-Mentions',  value: cfg.prot_antimentions  ? `${on} — حد ${cfg.prot_antimentions_limit || 5} ذكر/رسالة`                                 : off, inline: false },
          { name: '🔗 Anti-Link',      value: cfg.prot_antilink      ? on : off, inline: false },
        )
        .setFooter({ text: i.guild.name })
        .setTimestamp()
      );
    },
  },
];
