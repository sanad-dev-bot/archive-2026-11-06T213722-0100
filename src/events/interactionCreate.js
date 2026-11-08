const {
  Colors, PermissionFlagsBits, EmbedBuilder, ChannelType,
} = require('discord.js');
const { em }              = require('../utils/embed');
const { ticketPanels, activeGiveaways } = require('../utils/state');
const { getGuildConfig, checkCmdRole, getCmdRole } = require('../utils/storage');
const { dmNotice } = require('../utils/dmNotice');
const { handleTicketInteraction } = require('../utils/ticketSystem');
const { handleVerifyInteraction } = require('../utils/verifySystem');
const { handleApplyInteraction } = require('../utils/applicationSystem');
const { handleIncidentInteraction } = require('../utils/incidentSystem');
const { isTrusted } = require('../utils/trust');
const { isFrozen } = require('../utils/nukeGuard');
const { handleFix: handleSecurityFix } = require('../utils/securityScan');

// Sanad would hide who did these (Discord logs them as the bot), or they reach every member at once,
// so only the owner and co-owner run them
const OWNER_ONLY = new Set(['clear', 'clearuser', 'deletechannel', 'protunlock', 'bc', 'obc', 'bcspeed', 'bcreport', 'setautorole']);
const { buildEmbed, giveawayRow, endGiveaway } = require('./giveawayHelper');

module.exports = {
  name: 'interactionCreate',

  async execute(client, interaction) {

    // ── AUTOCOMPLETE ────────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.autocomplete) {
        try { await cmd.autocomplete(interaction); } catch {}
      }
      return;
    }

    // ── SLASH COMMANDS ──────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;

      // Commands need a guild the bot is in (not DMs or user-install contexts)
      if (!interaction.inCachedGuild()) {
        return interaction.reply({ ...dmNotice(), ephemeral: true });
      }

      // ── Check custom command role override ────────────────────────────────
      const roleCheck = checkCmdRole(interaction.guild.id, interaction.member, interaction.commandName);
      if (!roleCheck.allowed) {
        const errEmbed = new EmbedBuilder()
          .setTitle('🔐 غير مصرح')
          .setDescription([
            `لا يمكنك استخدام \`/${interaction.commandName}\`.`,
            '',
            `**الرتب المطلوبة:** ${roleCheck.reason}`,
          ].join('\n'))
          .setColor(0xed4245);
        return interaction.reply({ embeds: [errEmbed], ephemeral: true });
      }

      // Server settings can loosen Discord's default permission, so the bot enforces it too
      const required = cmd.data.default_member_permissions;
      if (required && !getCmdRole(interaction.guild.id, interaction.commandName)?.length
        && !interaction.member.permissions.has(BigInt(required))) {
        return interaction.reply({ content: '🚫 ماعندكش صلاحية تستخدم الأمر ده.', ephemeral: true });
      }

      // Through the bot these would hide who deleted, so only the owner and co-owner can run them
      const massDelete = OWNER_ONLY.has(interaction.commandName)
        || (interaction.commandName === 'role' && interaction.options.getSubcommand(false) === 'delete');
      if (massDelete && !isTrusted(interaction.member)) {
        return interaction.reply({ content: '🚫 الأمر ده للأونر والكو أونر بس عشان حماية السيرفر.', ephemeral: true });
      }

      // Someone the protection just caught gets nothing until the owner decides
      if (isFrozen(interaction.guild.id, interaction.user.id)) {
        return interaction.reply({ content: '🛡️ الحماية وقفت أوامرك لحد ما الأونر أو الكو أونر يراجع.', ephemeral: true });
      }

      try {
        await cmd.execute(interaction);
      } catch (err) {
        console.error(`[CMD ERROR] /${interaction.commandName}:`, err);
        const msg = err.message?.slice(0, 500) || 'Unknown error';
        const errEmbed = em('❌ Error', `\`\`\`${msg}\`\`\``, Colors.Red);
        if (interaction.replied || interaction.deferred)
          interaction.followUp({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
        else
          interaction.reply({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
      }
      return;
    }

    // ── TICKETS & VERIFICATION ─────────────────────────────────────────────
    if (await handleTicketInteraction(client, interaction)) return;
    if (await handleVerifyInteraction(interaction)) return;
    if (await handleApplyInteraction(interaction)) return;
    if (await handleIncidentInteraction(interaction)) return;
    if (await handleSecurityFix(interaction)) return;

    // ── BUTTON — GIVEAWAY ENTER ───────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('g_enter:')) {
      const msgId = interaction.customId.split(':')[1];
      const ga    = activeGiveaways.get(msgId);

      if (!ga) return interaction.reply({ content: '❌ هذا السحب لم يعد نشطاً.', ephemeral: true });
      if (ga.paused) return interaction.reply({ content: '⏸️ هذا السحب متوقف مؤقتاً. حاول لاحقاً.', ephemeral: true });

      // Check requirements
      if (ga.requiredRole && !interaction.member.roles.cache.has(ga.requiredRole))
        return interaction.reply({ content: `❌ تحتاج رتبة <@&${ga.requiredRole}> للمشاركة.`, ephemeral: true });

      if (ga.minAccountAge) {
        const ageMs = Date.now() - interaction.user.createdTimestamp;
        const ageDays = Math.floor(ageMs / 86400000);
        if (ageDays < ga.minAccountAge)
          return interaction.reply({ content: `❌ حسابك أقل من ${ga.minAccountAge} يوم. لا يمكنك المشاركة.`, ephemeral: true });
      }

      if (ga.maxEntries && ga.entries.length >= ga.maxEntries)
        return interaction.reply({ content: '❌ امتلأ السحب! لا يوجد أماكن متبقية.', ephemeral: true });

      const uid = interaction.user.id;
      if (ga.entries.includes(uid)) {
        ga.entries = ga.entries.filter(e => e !== uid);
        await interaction.reply({ content: '❌ تم سحب مشاركتك من السحب.', ephemeral: true });
      } else {
        ga.entries.push(uid);
        await interaction.reply({ content: '✅ تم تسجيلك في السحب! 🎉 حظاً موفقاً!', ephemeral: true });
      }

      // Update embed entry count
      try {
        const msg = await interaction.channel.messages.fetch(msgId);
        await msg.edit({ embeds: [buildEmbed(ga)] });
      } catch {}
      return;
    }


    // ── BUTTON — GIVEAWAY COUNT ───────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('g_count:')) {
      const msgId = interaction.customId.split(':')[1];
      const ga    = activeGiveaways.get(msgId);
      if (!ga) return interaction.reply({ content: 'السحب لم يعد نشطاً.', ephemeral: true });

      const inGiveaway = ga.entries.includes(interaction.user.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('👥 المشاركون في السحب')
          .setDescription([
            `**الجائزة:** ${ga.prize}`,
            `**عدد المشاركين:** ${ga.entries.length}${ga.maxEntries?`/${ga.maxEntries}`:''}`,
            `**حالتك:** ${inGiveaway ? '✅ مشارك' : '❌ غير مشارك'}`,
          ].join('\n'))
          .setColor(inGiveaway ? Colors.Green : Colors.Red)
        ],
        ephemeral: true,
      });
    }
  },
};
