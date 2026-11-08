const { langFor } = require('../../utils/i18n');
const {
  SlashCommandBuilder, Colors, PermissionFlagsBits, EmbedBuilder,
} = require('discord.js');
const { em }                               = require('../../utils/embed');
const { loadJSON, saveJSON, getLogChannel } = require('../../utils/storage');
const path = require('path');
const fs   = require('fs');

// ── Files ─────────────────────────────────────────────────────────────────
// One report per server, so another server's admins never see this server's member list
const reportFile = guildId => path.join(process.cwd(), 'data', 'bc_report-' + guildId + '.json');
const running = new Set();

// ── Speed state ───────────────────────────────────────────────────────────
// Each server keeps its own speed; never faster than one DM a second
const speeds = new Map();
const setSpeed = (guildId, ms) => { speeds.set(guildId, Math.max(1000, ms)); };
const getSpeed = guildId => speeds.get(guildId) || 1000;
const sleep    = ms  => new Promise(r => setTimeout(r, ms));

// ── Colors ────────────────────────────────────────────────────────────────
const C = {
  success: 0x57f287,
  error:   0xed4245,
  info:    0x5865f2,
  warn:    0xfee75c,
};

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

// ── Core DM broadcast runner ──────────────────────────────────────────────
async function runBroadcast(members, text, guild, statusMsg, trackMsg, type) {
  // One broadcast per server at a time, or two runs would DM everyone twice
  if (running.has(guild.id)) {
    await statusMsg.edit('⚠️ في برودكاست شغال بالفعل في السيرفر ده. استنى لما يخلص.').catch(() => {});
    return { sent: 0, failed: 0, totalTime: '0' };
  }
  running.add(guild.id);
  const list      = [...members.values()];
  const total     = list.length;
  const startTime = Date.now();

  const report = {
    type,
    startedAt:   new Date().toISOString(),
    speed:       `${getSpeed(guild.id)}ms`,
    total,
    sent:        [],
    failed:      [],
    sentCount:   0,
    failedCount: 0,
    message:     text,
  };

  let sent = 0, failed = 0;
  const deliveredLines = [];
  const sentTo         = new Set();

  // Delivered tracking message
  const trackUpdate = async () => {
    const lines = deliveredLines.slice(-20);
    await trackMsg.edit({
      embeds: [new EmbedBuilder()
        .setTitle(`📬 وصلت لهم الرسالة (${sent})`)
        .setDescription(lines.length ? lines.join('\n') : '⏳ جاري الإرسال...')
        .setColor(C.info)
        .setFooter({ text: `${Math.max(0, total - sent - failed)} متبقي` })
      ],
    }).catch(() => {});
  };

  for (let idx = 0; idx < list.length; idx++) {
    const member      = list[idx];
    const memberStart = Date.now();

    if (sentTo.has(member.id)) continue;

    const fullMsg = `${text}\n<@${member.id}>`;

    try {
      const dm = await member.createDM();
      await dm.send(fullMsg);

      const elapsed = Date.now() - memberStart;
      sent++;
      sentTo.add(member.id);
      deliveredLines.push(`✅ **${member.user.username}** — ${(elapsed/1000).toFixed(2)}s`);
      report.sent.push({
        username:     member.user.username,
        id:           member.id,
        timeTakenMs:  elapsed,
        timeTakenSec: (elapsed/1000).toFixed(2) + 's',
      });
    } catch {
      failed++;
      report.failed.push({ username: member.user.username, id: member.id });
    }

    // Update status every 5 members
    if ((idx + 1) % 5 === 0 || idx === list.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      await statusMsg.edit(
        `📢 جاري الإرسال...\n✅ **${sent}** تم | ❌ **${failed}** فشل | ⏳ **${total - idx - 1}** متبقي | 🕐 **${elapsed}s**`
      ).catch(() => {});
    }

    // Update delivered list every 10
    if ((idx + 1) % 10 === 0 || idx === list.length - 1) {
      await trackUpdate();
    }

    // Faster than one DM a second gets Sanad flagged for spam by Discord
    await sleep(getSpeed(guild.id));
  }

  const totalTime     = ((Date.now() - startTime) / 1000).toFixed(2);
  report.finishedAt   = new Date().toISOString();
  report.totalTimeSec = totalTime + 's';
  report.sentCount    = sent;
  report.failedCount  = failed;

  running.delete(guild.id);
  fs.mkdirSync(path.dirname(reportFile(guild.id)), { recursive: true });
  fs.writeFileSync(reportFile(guild.id), JSON.stringify(report, null, 2), 'utf-8');

  return { sent, failed, totalTime };
}

// ─────────────────────────────────────────────────────────────────────────
module.exports = [

  // ── /bc (برودكاست لجميع الأعضاء بالخاص) ─────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('bc').setDescription('برودكاست بالخاص لجميع أعضاء السيرفر')
      .addStringOption(o => o.setName('message').setDescription('الرسالة').setRequired(true)),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'You need **Administrator** permission.', Colors.Red), true);

      const text = i.options.getString('message');
      await i.deferReply({ ephemeral: true });

      const allMembers = await i.guild.members.fetch();
      const members    = allMembers.filter(m => !m.user.bot);

      const statusMsg = await i.channel.send(
        `📢 جاري الإرسال لـ **${members.size}** عضو...\n⚡ السرعة: **${getSpeed(i.guild.id)}ms**`
      );
      const trackMsg = await i.channel.send({
        embeds: [new EmbedBuilder()
          .setTitle('📬 وصلت لهم الرسالة (0)')
          .setDescription('⏳ جاري الإرسال...')
          .setColor(C.info)
        ],
      });

      const { sent, failed, totalTime } = await runBroadcast(
        members, text, i.guild, statusMsg, trackMsg, 'عام'
      );

      await statusMsg.edit({
        content: null,
        embeds: [new EmbedBuilder()
          .setTitle('📢 انتهى البرودكاست ✅')
          .addFields(
            { name: '✅ وصلت',        value: String(sent),      inline: true },
            { name: '❌ ما وصلت',     value: String(failed),    inline: true },
            { name: '⏱️ الوقت الكلي', value: `${totalTime}s`,   inline: true },
            { name: '⚡ السرعة',      value: `${getSpeed(i.guild.id)}ms`, inline: true },
            { name: '📊 التقرير',     value: 'اكتب `/bcreport`', inline: false },
          )
          .setColor(C.success)
          .setTimestamp()
        ],
      }).catch(() => {});

      // Log
      const logCh = await getLogChannel(i.guild);
      if (logCh) await logCh.send({ embeds: [new EmbedBuilder()
        .setTitle('📢 Broadcast Sent (All)')
        .addFields(
          { name: 'By',      value: `<@${i.user.id}>`, inline: true },
          { name: 'Sent',    value: `${sent}`,          inline: true },
          { name: 'Failed',  value: `${failed}`,        inline: true },
          { name: 'Time',    value: `${totalTime}s`,    inline: true },
        ).setColor(C.info)
      ]}).catch(() => {});

      await i.editReply({ embeds: [em('✅ اكتمل البرودكاست', `وصلت لـ **${sent}** عضو خلال **${totalTime}s**.`, Colors.Green)] });
    },
  },

  // ── /obc (برودكاست للأونلاين فقط بالخاص) ────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('obc').setDescription('برودكاست بالخاص للأعضاء الأونلاين فقط')
      .addStringOption(o => o.setName('message').setDescription('الرسالة').setRequired(true)),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'You need **Administrator** permission.', Colors.Red), true);

      const text = i.options.getString('message');
      await i.deferReply({ ephemeral: true });

      const allMembers = await i.guild.members.fetch();
      const members    = allMembers.filter(m =>
        !m.user.bot && m.presence?.status !== 'offline' && m.presence?.status != null
      );

      if (!members.size)
        return i.editReply({ embeds: [em('❌', 'لا يوجد أعضاء أونلاين حالياً.', Colors.Red)] });

      const statusMsg = await i.channel.send(
        `📡 الأونلاين: **${members.size}** عضو...\n⚡ السرعة: **${getSpeed(i.guild.id)}ms**`
      );
      const trackMsg = await i.channel.send({
        embeds: [new EmbedBuilder()
          .setTitle('📬 وصلت لهم الرسالة (0)')
          .setDescription('⏳ جاري الإرسال...')
          .setColor(C.info)
        ],
      });

      const { sent, failed, totalTime } = await runBroadcast(
        members, text, i.guild, statusMsg, trackMsg, 'أونلاين'
      );

      await statusMsg.edit({
        content: null,
        embeds: [new EmbedBuilder()
          .setTitle('📡 انتهى برودكاست الأونلاين ✅')
          .addFields(
            { name: '✅ وصلت',        value: String(sent),      inline: true },
            { name: '❌ ما وصلت',     value: String(failed),    inline: true },
            { name: '⏱️ الوقت الكلي', value: `${totalTime}s`,   inline: true },
            { name: '⚡ السرعة',      value: `${getSpeed(i.guild.id)}ms`, inline: true },
            { name: '📊 التقرير',     value: 'اكتب `/bcreport`', inline: false },
          )
          .setColor(C.success)
          .setTimestamp()
        ],
      }).catch(() => {});

      // Log
      const logCh = await getLogChannel(i.guild);
      if (logCh) await logCh.send({ embeds: [new EmbedBuilder()
        .setTitle('📡 Broadcast Sent (Online)')
        .addFields(
          { name: 'By',     value: `<@${i.user.id}>`, inline: true },
          { name: 'Sent',   value: `${sent}`,          inline: true },
          { name: 'Failed', value: `${failed}`,        inline: true },
          { name: 'Time',   value: `${totalTime}s`,    inline: true },
        ).setColor(C.info)
      ]}).catch(() => {});

      await i.editReply({ embeds: [em('✅ اكتمل', `وصلت لـ **${sent}** عضو أونلاين خلال **${totalTime}s**.`, Colors.Green)] });
    },
  },

  // ── /bcspeed ─────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('bcspeed').setDescription('ضبط سرعة البرودكاست')
      .addIntegerOption(o => o.setName('ms').setDescription('التأخير بالـ ms بين كل عضو').setMinValue(100)),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'You need **Administrator** permission.', Colors.Red), true);

      const ms = i.options.getInteger('ms');
      if (!ms) {
        return reply(i, new EmbedBuilder()
          .setTitle('⚡ سرعة البرودكاست')
          .setDescription(`السرعة الحالية: **${getSpeed(i.guild.id)}ms**`)
          .addFields(
            { name: '⚡ سريع جداً',        value: '`/bcspeed 100`\n⚠️ خطر Rate Limit!', inline: true },
            { name: '🚀 سريع',             value: '`/bcspeed 300`',                     inline: true },
            { name: '✅ متوازن (افتراضي)', value: '`/bcspeed 500`',                     inline: true },
            { name: '🐢 بطيء آمن',         value: '`/bcspeed 1000`',                    inline: true },
            { name: '🔒 آمن جداً',         value: '`/bcspeed 2000`',                    inline: true },
          )
          .setFooter({ text: 'كلما قلّ الرقم = أسرع | الحد الأدنى 100ms' })
          .setColor(C.info));
      }

      setSpeed(i.guild.id, ms);
      const label =
        ms < 300  ? '⚡ سريع جداً' :
        ms < 600  ? '🚀 سريع'      :
        ms < 1200 ? '✅ متوازن'    : '🐢 بطيء آمن';

      reply(i, new EmbedBuilder()
        .setTitle('✅ تم تغيير السرعة')
        .setDescription(`**${ms}ms** — ${label}`)
        .setColor(C.success));
    },
  },

  // ── /bcreport ────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('bcreport').setDescription('عرض تقرير آخر برودكاست'),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'You need **Administrator** permission.', Colors.Red), true);

      if (!fs.existsSync(reportFile(i.guild.id)))
        return reply(i, new EmbedBuilder()
          .setTitle('📊 التقرير')
          .setDescription('لا يوجد تقرير! أرسل برودكاست أولاً.')
          .setColor(C.error));

      const rep   = JSON.parse(fs.readFileSync(reportFile(i.guild.id), 'utf-8'));
      const times = rep.sent.map(s => s.timeTakenMs);
      const avg   = times.length ? (times.reduce((a,b)=>a+b,0)/times.length/1000).toFixed(2) : '0';
      const min   = times.length ? (Math.min(...times)/1000).toFixed(2) : '0';
      const max   = times.length ? (Math.max(...times)/1000).toFixed(2) : '0';

      const e = new EmbedBuilder()
        .setTitle('📊 تقرير البرودكاست')
        .setColor(C.info)
        .addFields(
          { name: '📢 النوع',       value: rep.type,                                      inline: true  },
          { name: '📅 وقت البدء',   value: new Date(rep.startedAt).toLocaleString(langFor(i.guildId, i.channelId) === 'en' ? 'en-GB' : 'ar'),  inline: true  },
          { name: '⏱️ الوقت الكلي', value: rep.totalTimeSec,                              inline: true  },
          { name: '✅ وصلت',        value: String(rep.sentCount),                         inline: true  },
          { name: '❌ فشلت',        value: String(rep.failedCount),                       inline: true  },
          { name: '👥 الإجمالي',    value: String(rep.total),                             inline: true  },
          { name: '⚡ السرعة',      value: rep.speed,                                     inline: true  },
          { name: '⏰ متوسط/رسالة', value: `${avg}s`,                                    inline: true  },
          { name: '🏃 أسرع',        value: `${min}s`,                                    inline: true  },
          { name: '🐢 أبطأ',        value: `${max}s`,                                    inline: true  },
          { name: '💬 الرسالة',     value: `\`\`\`${rep.message.slice(0, 200)}\`\`\``,  inline: false },
        )
        .setTimestamp();

      if (rep.sent.length) {
        const list = rep.sent.slice(0, 10)
          .map((s, idx) => `\`${idx+1}.\` **${s.username}** — ⏱️ ${s.timeTakenSec}`)
          .join('\n');
        e.addFields({ name: `✅ أول من وصلتهم (${rep.sent.length})`, value: list, inline: false });
      }
      if (rep.failed.length) {
        const list = rep.failed.slice(0, 5)
          .map((f, idx) => `\`${idx+1}.\` **${f.username}**`)
          .join('\n');
        e.addFields({ name: `❌ فاشلون (${rep.failed.length})`, value: list, inline: false });
      }

      await i.reply({ embeds: [e] });
      await i.followUp({
        content: '📄 الملف الكامل:',
        files: [{ attachment: reportFile(i.guild.id), name: 'bc_report.json' }],
      });
    },
  },
];
