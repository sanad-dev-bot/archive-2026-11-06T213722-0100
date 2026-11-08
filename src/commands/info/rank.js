const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getXP, getRankPosition } = require('../../utils/storage');
const { createRankCard } = require('../../utils/rankCard');
const { langFor } = require('../../utils/i18n');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('rank')
      .setDescription('عرض مستوى الكتابي والصوتي')
      .addUserOption(o => o
        .setName('member')
        .setDescription('العضو (افتراضي: أنت)')),

    async execute(i) {
      const target = i.options.getMember('member') || i.member;
      if (!target) return i.reply({ content: '❌ لم أجد العضو.', ephemeral: true });

      const xp = getXP(i.guild.id, target.id);
      const position = getRankPosition(i.guild.id, target.id);
      const buffer = await createRankCard({
        member: target,
        textXp: xp.textXp || 0,
        voiceXp: xp.voiceXp || 0,
        position,
        lang: langFor(i.guildId, i.channelId),
      });

      const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });
      return i.reply({ files: [attachment] });
    },
  },
];
