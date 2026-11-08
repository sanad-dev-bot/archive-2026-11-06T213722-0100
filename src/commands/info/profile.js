const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getXP, getRankPosition } = require('../../utils/storage');
const { createProfileCard } = require('../../utils/profileCard');
const { langFor } = require('../../utils/i18n');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('profile')
      .setDescription('عرض بروفايل العضو وإحصائيات XP')
      .addUserOption(o => o
        .setName('member')
        .setDescription('العضو (افتراضي: أنت)')),

    async execute(i) {
      const target = i.options.getMember('member') || i.member;
      if (!target) return i.reply({ content: '❌ لم أجد العضو.', ephemeral: true });

      const xp = getXP(i.guild.id, target.id);
      const position = getRankPosition(i.guild.id, target.id);
      const buffer = await createProfileCard({ member: target, xp, position, lang: langFor(i.guildId, i.channelId) });
      const attachment = new AttachmentBuilder(buffer, { name: 'profile.png' });
      return i.reply({ files: [attachment] });
    },
  },
];
