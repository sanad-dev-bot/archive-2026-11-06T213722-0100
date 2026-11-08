const { SlashCommandBuilder, Colors, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { em }                                    = require('../../utils/embed');
const { getGuildConfig, setGuildConfig, deleteGuildConfigKey } = require('../../utils/storage');

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

function noPerms(i) {
  return reply(i, em('🚫', 'You need **Administrator** permission.', Colors.Red), true);
}

function statusEmoji(enabled) { return enabled ? '🟢 مفعّل' : '🔴 معطّل'; }

// The protection events read the prot_* keys (the same ones /setanti* write), so this command uses them too
const KEYS = {
  antispam: 'prot_antispam', antispam_limit: 'prot_antispam_limit', antispam_interval: 'prot_antispam_window',
  antimention: 'prot_antimentions', antimention_limit: 'prot_antimentions_limit',
  antilink: 'prot_antilink',
  antiraid: 'prot_antiraid', antiraid_limit: 'prot_antiraid_threshold', antiraid_interval: 'prot_antiraid_window',
};
function readProt(cfg) {
  const p = {};
  for (const [short, key] of Object.entries(KEYS)) p[short] = cfg[key];
  return p;
}
function saveProt(gid, p) {
  for (const [short, key] of Object.entries(KEYS)) {
    if (p[short] === undefined) deleteGuildConfigKey(gid, key);
    else setGuildConfig(gid, key, p[short]);
  }
  deleteGuildConfigKey(gid, 'protection');
}

async function trust(i, sub) {
  if (i.user.id !== i.guild.ownerId) return reply(i, em('🚫', 'الإعداد ده لأونر السيرفر بس.', Colors.Red), true);
  const gid = i.guild.id;
  const cfg = getGuildConfig(gid);
  const users = cfg.owner_users || [];
  const bots = cfg.trusted_bots || [];
  if (sub === 'coowner_add' || sub === 'coowner_remove') {
    const user = i.options.getUser('member', true);
    if (user.bot) return reply(i, em('❌', 'البوت مايبقاش كو أونر. استخدم bot_add.', Colors.Red), true);
    const next = sub === 'coowner_add' ? [...new Set([...users, user.id])] : users.filter(id => id !== user.id);
    setGuildConfig(gid, 'owner_users', next);
    return reply(i, em('✅', (sub === 'coowner_add' ? 'بقى كو أونر: ' : 'مابقاش كو أونر: ') + '<@' + user.id + '>', Colors.Green), true);
  }
  if (sub === 'bot_add' || sub === 'bot_remove') {
    const bot = i.options.getUser('bot', true);
    if (!bot.bot) return reply(i, em('❌', 'ده مش بوت.', Colors.Red), true);
    const next = sub === 'bot_add' ? [...new Set([...bots, bot.id])] : bots.filter(id => id !== bot.id);
    setGuildConfig(gid, 'trusted_bots', next);
    return reply(i, em('✅', (sub === 'bot_add' ? 'بقى موثوق: ' : 'مابقاش موثوق: ') + '<@' + bot.id + '>', Colors.Green), true);
  }
  return reply(i, em('🛡️ الثقة', [
    '**الأونر:** <@' + i.guild.ownerId + '>',
    '**أي حد رتبته فوق سند** بيتحسب كو أونر تلقائي.',
    '**كو أونر:** ' + (users.map(id => '<@' + id + '>').join(' ') || 'مفيش'),
    '**بوتات موثوقة:** ' + (bots.map(id => '<@' + id + '>').join(' ') || 'مفيش'),
  ].join('\n'), Colors.Blurple), true);
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('protection').setDescription('نظام الحماية للسيرفر')

      // ── antispam ──────────────────────────────────────────────────────────
      .addSubcommandGroup(g => g
        .setName('antispam').setDescription('حماية من رسائل السبام')
        .addSubcommand(s => s.setName('enable').setDescription('تفعيل Anti-Spam')
          .addIntegerOption(o => o.setName('messages').setDescription('عدد الرسائل قبل الإجراء (افتراضي: 5)').setMinValue(3).setMaxValue(20))
          .addIntegerOption(o => o.setName('seconds').setDescription('خلال كم ثانية (افتراضي: 4)').setMinValue(2).setMaxValue(30)))
        .addSubcommand(s => s.setName('disable').setDescription('تعطيل Anti-Spam')))

      // ── antimention ───────────────────────────────────────────────────────
      .addSubcommandGroup(g => g
        .setName('antimention').setDescription('حماية من الذكر الجماعي')
        .addSubcommand(s => s.setName('enable').setDescription('تفعيل Anti-Mention')
          .addIntegerOption(o => o.setName('limit').setDescription('عدد المنشنات المسموحة (افتراضي: 5)').setMinValue(2).setMaxValue(20)))
        .addSubcommand(s => s.setName('disable').setDescription('تعطيل Anti-Mention')))

      // ── antilink ──────────────────────────────────────────────────────────
      .addSubcommandGroup(g => g
        .setName('antilink').setDescription('حماية من نشر الروابط')
        .addSubcommand(s => s.setName('enable').setDescription('تفعيل Anti-Link'))
        .addSubcommand(s => s.setName('disable').setDescription('تعطيل Anti-Link')))

      // ── antiraid ──────────────────────────────────────────────────────────
      .addSubcommandGroup(g => g
        .setName('antiraid').setDescription('حماية من الريد (انضمام جماعي مفاجئ)')
        .addSubcommand(s => s.setName('enable').setDescription('تفعيل Anti-Raid')
          .addIntegerOption(o => o.setName('joins').setDescription('عدد الانضمامات قبل الإجراء (افتراضي: 5)').setMinValue(3).setMaxValue(20))
          .addIntegerOption(o => o.setName('seconds').setDescription('خلال كم ثانية (افتراضي: 10)').setMinValue(3).setMaxValue(60)))
        .addSubcommand(s => s.setName('disable').setDescription('تعطيل Anti-Raid')))

      // ── trust (server owner only) ─────────────────────────────────────────
      .addSubcommandGroup(g => g
        .setName('trust').setDescription('مين الكو أونر والبوتات الموثوقة (للأونر بس)')
        .addSubcommand(s => s.setName('coowner_add').setDescription('كو أونر: معفي من الحماية ويقرر في روم المراجعة')
          .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)))
        .addSubcommand(s => s.setName('coowner_remove').setDescription('شيل حد من الكو أونر')
          .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)))
        .addSubcommand(s => s.setName('bot_add').setDescription('بوت موثوق: حركاته من غير ما حد يشغّله متتحسبش عليه')
          .addUserOption(o => o.setName('bot').setDescription('البوت').setRequired(true)))
        .addSubcommand(s => s.setName('bot_remove').setDescription('شيل بوت من الموثوقين')
          .addUserOption(o => o.setName('bot').setDescription('البوت').setRequired(true)))
        .addSubcommand(s => s.setName('list').setDescription('عرض الكو أونر والبوتات الموثوقة')))

      // ── status ────────────────────────────────────────────────────────────
      .addSubcommand(s => s.setName('status').setDescription('عرض حالة جميع أنظمة الحماية')),

    async execute(i) {
      const group = i.options.getSubcommandGroup(false);
      const sub   = i.options.getSubcommand();
      const gid   = i.guild.id;
      if (group === 'trust') return trust(i, sub);
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) return noPerms(i);

      const cfg   = getGuildConfig(gid);
      cfg.protection = readProt(cfg);

      // ── status ─────────────────────────────────────────────────────────
      if (!group && sub === 'status') {
        const p = cfg.protection;
        return reply(i, new EmbedBuilder()
          .setTitle('🛡️ حالة أنظمة الحماية')
          .setColor(0x5865f2)
          .addFields(
            {
              name:  '🚫 Anti-Spam',
              value: `${statusEmoji(p.antispam)}\n${p.antispam ? `الحد: **${p.antispam_limit||5}** رسائل / **${p.antispam_interval||4}** ثانية` : ''}`,
              inline: true,
            },
            {
              name:  '📢 Anti-Mention',
              value: `${statusEmoji(p.antimention)}\n${p.antimention ? `الحد: **${p.antimention_limit||5}** منشن` : ''}`,
              inline: true,
            },
            {
              name:  '🔗 Anti-Link',
              value: statusEmoji(p.antilink),
              inline: true,
            },
            {
              name:  '🚨 Anti-Raid',
              value: `${statusEmoji(p.antiraid)}\n${p.antiraid ? `الحد: **${p.antiraid_limit||5}** انضمام / **${p.antiraid_interval||10}** ثانية` : ''}`,
              inline: true,
            },
          )
          .setFooter({ text: 'الأعضاء الذين لديهم صلاحية Manage Messages محصّنون من Anti-Spam/Mention/Link' })
          .setTimestamp());
      }

      // ── antispam ───────────────────────────────────────────────────────
      if (group === 'antispam') {
        if (sub === 'enable') {
          cfg.protection.antispam          = true;
          cfg.protection.antispam_limit    = i.options.getInteger('messages') || 5;
          cfg.protection.antispam_interval = i.options.getInteger('seconds')  || 4;
          saveProt(gid, cfg.protection);
          return reply(i, new EmbedBuilder()
            .setTitle('✅ Anti-Spam مفعّل')
            .setDescription(`الإجراء عند **${cfg.protection.antispam_limit}** رسائل خلال **${cfg.protection.antispam_interval}** ثانية.\nالعقوبة: حذف الرسائل + إسكات **5 دقائق**.`)
            .setColor(Colors.Green));
        } else {
          cfg.protection.antispam = false;
          saveProt(gid, cfg.protection);
          return reply(i, em('🔴 Anti-Spam معطّل', 'تم تعطيل حماية السبام.', Colors.Red));
        }
      }

      // ── antimention ────────────────────────────────────────────────────
      if (group === 'antimention') {
        if (sub === 'enable') {
          cfg.protection.antimention       = true;
          cfg.protection.antimention_limit = i.options.getInteger('limit') || 5;
          saveProt(gid, cfg.protection);
          return reply(i, new EmbedBuilder()
            .setTitle('✅ Anti-Mention مفعّل')
            .setDescription(`الإجراء عند ذكر **${cfg.protection.antimention_limit}** أو أكثر دفعة واحدة.\nالعقوبة: حذف الرسالة + إسكات **10 دقائق**.`)
            .setColor(Colors.Green));
        } else {
          cfg.protection.antimention = false;
          saveProt(gid, cfg.protection);
          return reply(i, em('🔴 Anti-Mention معطّل', 'تم تعطيل حماية المنشنات.', Colors.Red));
        }
      }

      // ── antilink ───────────────────────────────────────────────────────
      if (group === 'antilink') {
        if (sub === 'enable') {
          cfg.protection.antilink = true;
          saveProt(gid, cfg.protection);
          return reply(i, new EmbedBuilder()
            .setTitle('✅ Anti-Link مفعّل')
            .setDescription('أي رابط يُنشر من غير المشرفين سيُحذف تلقائياً.')
            .setColor(Colors.Green));
        } else {
          cfg.protection.antilink = false;
          saveProt(gid, cfg.protection);
          return reply(i, em('🔴 Anti-Link معطّل', 'تم تعطيل حماية الروابط.', Colors.Red));
        }
      }

      // ── antiraid ───────────────────────────────────────────────────────
      if (group === 'antiraid') {
        if (sub === 'enable') {
          cfg.protection.antiraid          = true;
          cfg.protection.antiraid_limit    = i.options.getInteger('joins')   || 5;
          cfg.protection.antiraid_interval = i.options.getInteger('seconds') || 10;
          saveProt(gid, cfg.protection);
          return reply(i, new EmbedBuilder()
            .setTitle('✅ Anti-Raid مفعّل')
            .setDescription(`الإجراء عند **${cfg.protection.antiraid_limit}** انضمام خلال **${cfg.protection.antiraid_interval}** ثانية.\nالإجراء: قفل كل الرومات + رسالة للأونر + إشعار في اللوق. افتحها بـ \`/protunlock\`.`)
            .setColor(Colors.Green));
        } else {
          cfg.protection.antiraid = false;
          saveProt(gid, cfg.protection);
          // Reset verification if it was raised
          // The server's own verification level is left as the owner set it
          return reply(i, em('🔴 Anti-Raid معطّل', 'تم تعطيل حماية الريد وتم إعادة مستوى التحقق.', Colors.Red));
        }
      }
    },
  },
];
