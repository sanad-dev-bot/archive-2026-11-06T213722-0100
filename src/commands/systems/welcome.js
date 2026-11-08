const { SlashCommandBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const { em } = require('../../utils/embed');
const { getGuildConfig, setGuildConfig, deleteGuildConfigKey } = require('../../utils/storage');

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

/** Formats a welcome message, replacing variables */
function formatWelcome(template, member) {
  return template
    .replace('{member}', `<@${member.id}>`)
    .replace('{server}', member.guild.name)
    .replace('{count}',  String(member.guild.memberCount))
    .replace('{name}',   member.displayName);
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('setwelcome').setDescription('Set the welcome channel and message')
      .addChannelOption(o => o.setName('channel').setDescription('Welcome channel').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Message — use {member} {server} {count} {name}')),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('❌', 'Need **Administrator**.', Colors.Red));
      const ch  = i.options.getChannel('channel');
      const msg = i.options.getString('message') || 'Welcome {member} to **{server}**! You are member #{count}.';
      setGuildConfig(i.guild.id, 'welcome_channel', ch.id);
      setGuildConfig(i.guild.id, 'welcome_msg', msg);
      reply(i, em('✅ Welcome System', `Channel: <#${ch.id}>\n\n**Preview:**\n${msg}\n\n**Variables:** \`{member}\` \`{server}\` \`{count}\` \`{name}\``, Colors.Green));
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('setwelcomemsg').setDescription('Update the welcome message only')
      .addStringOption(o => o.setName('message').setDescription('New welcome message').setRequired(true)),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('❌', 'Need **Administrator**.', Colors.Red));
      setGuildConfig(i.guild.id, 'welcome_msg', i.options.getString('message'));
      reply(i, em('✅ Welcome Message Updated', `Preview:\n${i.options.getString('message')}`, Colors.Green));
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('testwelcome').setDescription('Send a test welcome message'),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('❌', 'Need **Administrator**.', Colors.Red));
      const cfg = getGuildConfig(i.guild.id);
      if (!cfg.welcome_channel) return reply(i, em('❌', 'Welcome not configured. Use `/setwelcome` first.', Colors.Red));
      const ch  = i.guild.channels.cache.get(cfg.welcome_channel);
      const msg = formatWelcome(cfg.welcome_msg || 'Welcome {member}!', i.member);
      await ch.send({ embeds: [em('👋 Welcome! (Test)', msg, Colors.Green, { thumb: i.member.user.displayAvatarURL() })] });
      reply(i, em('✅', `Test sent to <#${ch.id}>.`, Colors.Green), true);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('disablewelcome').setDescription('Disable the welcome system'),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('❌', 'Need **Administrator**.', Colors.Red));
      deleteGuildConfigKey(i.guild.id, 'welcome_channel');
      reply(i, em('🔴 Welcome Disabled', 'Welcome system has been disabled.', Colors.Red));
    },
  },
];

module.exports.formatWelcome = formatWelcome;
