const { SlashCommandBuilder, Colors, PermissionFlagsBits, ChannelType } = require('discord.js');
const { em } = require('../../utils/embed');
const { isTrusted } = require('../../utils/trust');
const { getGuildConfig, setGuildConfig } = require('../../utils/storage');
const { reserve } = require('../../utils/nukeGuard');

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}
function noPerms(i, perm) {
  return reply(i, em('🚫 Missing Permission', `You need the **${perm}** permission.`, Colors.Red), true);
}
const P = PermissionFlagsBits;

module.exports = [

  // ── /slowmode ─────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('slowmode').setDescription('Set slowmode delay in a channel (0 to disable)')
      .addIntegerOption(o => o.setName('seconds').setDescription('Delay in seconds (0–21600)').setRequired(true).setMinValue(0).setMaxValue(21600))
      .addChannelOption(o => o.setName('channel').setDescription('Channel (default: current)')),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const ch   = i.options.getChannel('channel') || i.channel;
      const secs = i.options.getInteger('seconds');
      if (ch.type !== ChannelType.GuildText) return reply(i, em('❌', 'Slowmode only works on text channels.', Colors.Red), true);
      await ch.setRateLimitPerUser(secs);
      reply(i, em(
        secs > 0 ? '🐌 Slowmode Enabled' : '🐌 Slowmode Disabled',
        secs > 0
          ? `<#${ch.id}> slowmode set to **${secs}s** between messages.\n**By:** <@${i.user.id}>`
          : `Slowmode has been disabled in <#${ch.id}>.\n**By:** <@${i.user.id}>`,
        secs > 0 ? Colors.Blue : Colors.Green
      ));
    },
  },

  // ── /lock ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('lock').setDescription('Lock a channel — prevent members from sending messages')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to lock (default: current)'))
      .addStringOption(o => o.setName('reason').setDescription('Reason')),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const ch     = i.options.getChannel('channel') || i.channel;
      const reason = i.options.getString('reason') || 'No reason provided';
      await ch.permissionOverwrites.edit(i.guild.id, { SendMessages: false }, { reason });
      reply(i, em('🔒 Channel Locked', [
        `**Channel:** <#${ch.id}>`,
        `**Reason:** ${reason}`,
        `**By:** <@${i.user.id}>`,
      ].join('\n'), Colors.Red));
    },
  },

  // ── /unlock ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('unlock').setDescription('Unlock a channel — allow members to send messages again')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to unlock (default: current)'))
      .addStringOption(o => o.setName('reason').setDescription('Reason')),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const ch     = i.options.getChannel('channel') || i.channel;
      const reason = i.options.getString('reason') || 'No reason provided';
      await ch.permissionOverwrites.edit(i.guild.id, { SendMessages: null }, { reason });
      reply(i, em('🔓 Channel Unlocked', [
        `**Channel:** <#${ch.id}>`,
        `**Reason:** ${reason}`,
        `**By:** <@${i.user.id}>`,
      ].join('\n'), Colors.Green));
    },
  },

  // ── /hide ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('hide').setDescription('Hide a channel from all regular members')
      .addChannelOption(o => o.setName('channel').setDescription('Channel (default: current)')),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const ch = i.options.getChannel('channel') || i.channel;
      await ch.permissionOverwrites.edit(i.guild.id, { ViewChannel: false });
      reply(i, em('👁️ Channel Hidden', `<#${ch.id}> is now hidden from regular members.\n**By:** <@${i.user.id}>`, Colors.DarkGrey));
    },
  },

  // ── /unhide ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('unhide').setDescription('Unhide a channel — make it visible again')
      .addChannelOption(o => o.setName('channel').setDescription('Channel (default: current)')),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const ch = i.options.getChannel('channel') || i.channel;
      await ch.permissionOverwrites.edit(i.guild.id, { ViewChannel: null });
      reply(i, em('👁️ Channel Visible', `<#${ch.id}> is now visible to all members.\n**By:** <@${i.user.id}>`, Colors.Green));
    },
  },

  // ── /createchannel ────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('createchannel').setDescription('Create a new text channel')
      .addStringOption(o => o.setName('name').setDescription('Channel name').setRequired(true))
      .addChannelOption(o => o.setName('category').setDescription('Category to place it in')),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const name = i.options.getString('name').toLowerCase().replace(/\s+/g, '-');
      const cat  = i.options.getChannel('category');
      const ch   = await i.guild.channels.create({
        name, type: ChannelType.GuildText,
        parent: cat?.id || null,
      });
      reply(i, em('✅ Channel Created', `<#${ch.id}> has been created.\n**By:** <@${i.user.id}>`, Colors.Green));
    },
  },

  // ── /createvc ─────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('createvc').setDescription('Create a new voice channel')
      .addStringOption(o => o.setName('name').setDescription('Channel name').setRequired(true))
      .addChannelOption(o => o.setName('category').setDescription('Category to place it in'))
      .addIntegerOption(o => o.setName('limit').setDescription('User limit (0 = unlimited)').setMinValue(0).setMaxValue(99)),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const name  = i.options.getString('name');
      const cat   = i.options.getChannel('category');
      const limit = i.options.getInteger('limit') ?? 0;
      const ch    = await i.guild.channels.create({
        name, type: ChannelType.GuildVoice,
        parent: cat?.id || null,
        userLimit: limit,
      });
      reply(i, em('✅ Voice Channel Created', [
        `**Channel:** ${ch.name}`,
        `**User Limit:** ${limit > 0 ? limit : 'Unlimited'}`,
        `**By:** <@${i.user.id}>`,
      ].join('\n'), Colors.Green));
    },
  },

  // ── /deletechannel ────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('deletechannel').setDescription('Permanently delete a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to delete (default: current)'))
      .addStringOption(o => o.setName('reason').setDescription('Reason')),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const ch     = i.options.getChannel('channel') || i.channel;
      const reason = i.options.getString('reason') || 'No reason provided';
      const name   = ch.name;
      const isDiff = ch.id !== i.channel.id;
      await ch.delete(reason);
      if (isDiff) reply(i, em('🗑️ Channel Deleted', `**#${name}** has been deleted.\n**Reason:** ${reason}\n**By:** <@${i.user.id}>`, Colors.Red));
    },
  },

  // ── /createcategory ───────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('createcategory').setDescription('Create a new category')
      .addStringOption(o => o.setName('name').setDescription('Category name').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const cat = await i.guild.channels.create({ name: i.options.getString('name'), type: ChannelType.GuildCategory });
      reply(i, em('✅ Category Created', `**${cat.name}** has been created.\n**By:** <@${i.user.id}>`, Colors.Green));
    },
  },

  // ── /renamechannel ────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('renamechannel').setDescription('Rename a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to rename').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('New name').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const ch     = i.options.getChannel('channel');
      const newName = i.options.getString('name');
      const oldName = ch.name;
      await ch.setName(newName);
      reply(i, em('✅ Channel Renamed', `**#${oldName}** → **#${newName}**\n**By:** <@${i.user.id}>`, Colors.Green));
    },
  },

  // ── /settopic ─────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('settopic').setDescription('Set the topic of a text channel')
      .addStringOption(o => o.setName('topic').setDescription('New topic (leave empty to clear)'))
      .addChannelOption(o => o.setName('channel').setDescription('Channel (default: current)')),
    async execute(i) {
      if (!i.member.permissions.has(P.ManageChannels)) return noPerms(i, 'Manage Channels');
      const ch    = i.options.getChannel('channel') || i.channel;
      const topic = i.options.getString('topic') || null;
      await ch.setTopic(topic);
      reply(i, em('✅ Topic Updated', [
        `**Channel:** <#${ch.id}>`,
        `**Topic:** ${topic || '*Cleared*'}`,
        `**By:** <@${i.user.id}>`,
      ].join('\n'), Colors.Green));
    },
  },
];

// ── Guard for every room command ────────────────────────────────────────────
// The actor must be able to see and manage the TARGET room themselves (and manage its permissions for
// lock/hide), exactly like Discord would require. /unhide only reopens rooms /hide closed, unless the
// owner or co-owner runs it, so private staff, ticket and incident rooms cannot be exposed through Sanad.
const OVERWRITE_CMDS = new Set(['lock', 'unlock', 'hide', 'unhide']);
const RULE_FOR = {
  lock: 'overwrites', unlock: 'overwrites', hide: 'overwrites', unhide: 'overwrites',
  createchannel: 'channelCreate', createvc: 'channelCreate', createcategory: 'channelCreate',
};

for (const cmd of module.exports) {
  const run = cmd.execute;
  const name = cmd.data.name;
  cmd.execute = async i => {
    const ch = i.options.getChannel('channel') || i.channel;
    const perms = ch?.permissionsFor?.(i.member);
    const need = [P.ViewChannel, P.ManageChannels, ...(OVERWRITE_CMDS.has(name) ? [P.ManageRoles] : [])];
    if (ch && !isTrusted(i.member) && !perms?.has(need)) {
      return reply(i, em('🚫', 'لازم تكون شايف الروم ده وعندك صلاحية إدارته (و Manage Permissions للقفل والإخفاء).', Colors.Red), true);
    }
    const hidden = getGuildConfig(i.guild.id).hidden_channels || [];
    if (name === 'unhide' && ch && !hidden.includes(ch.id) && !isTrusted(i.member)) {
      return reply(i, em('🚫', 'الروم ده مخفي من الأول، الأونر والكو أونر بس يقدروا يظهروه.', Colors.Red), true);
    }
    // Done through Sanad, these would count for nobody in the audit log
    if (RULE_FOR[name] && !reserve(i.guild, i.member, RULE_FOR[name])) {
      return reply(i, em('🛡️', 'وصلت لحد الحماية. الأمر اترفض والموضوع اتبعت للأونر والكو أونر.', Colors.Red), true);
    }
    try {
      await run(i);
    } catch (err) {
      if (err?.code === 50013) {
        return reply(i, em('❌', 'سند ماعندوش صلاحية كفاية في الروم ده (محتاج Manage Channels و Manage Permissions).', Colors.Red), true);
      }
      throw err;
    }
    if (name === 'hide' && ch && !hidden.includes(ch.id)) setGuildConfig(i.guild.id, 'hidden_channels', [...hidden, ch.id]);
    if (name === 'unhide' && ch && hidden.includes(ch.id)) setGuildConfig(i.guild.id, 'hidden_channels', hidden.filter(id => id !== ch.id));
    return null;
  };
}
