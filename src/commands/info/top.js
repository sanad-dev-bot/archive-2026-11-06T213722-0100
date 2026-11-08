const { SlashCommandBuilder, ComponentType, MessageFlags } = require('discord.js');
const { buildTopComponents, buildTopRows, isTopTypeId, isTopPeriodId } = require('../../utils/top');

module.exports = [{
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('عرض أفضل 5 كتابي وصوتي'),

  async execute(i) {
    let type = 'all';
    let period = 'all';
    const suffix = `:${i.user.id}`;

    await i.reply({
      flags: MessageFlags.IsComponentsV2,
      components: await buildTopComponents(i.guild, i.user, type, period, suffix),
    });

    const collector = i.channel.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 180_000,
      filter: s => s.user.id === i.user.id && (isTopTypeId(s.customId) || isTopPeriodId(s.customId)) && s.customId.endsWith(suffix),
    });

    collector.on('collect', async s => {
      if (isTopTypeId(s.customId)) type = s.values[0];
      if (isTopPeriodId(s.customId)) period = s.values[0];
      await s.update({
        flags: MessageFlags.IsComponentsV2,
        components: await buildTopComponents(i.guild, i.user, type, period, suffix),
      });
    });

    collector.on('end', async () => {
      const disabledRows = buildTopRows(type, period, suffix).map(row => {
        row.components.forEach(menu => menu.setDisabled(true));
        return row;
      });
      try {
        const container = (await buildTopComponents(i.guild, i.user, type, period, suffix))[0];
        container.components = container.components || [];
        // Leave the final controls disabled after timeout by rebuilding them.
        const children = container.components;
        const lastTwo = children.slice(-2);
        for (const child of lastTwo) {
          if (child?.components) child.components.forEach(menu => menu.setDisabled?.(true));
        }
        await i.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
      } catch {}
    });
  },
}];
