const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const SERVER_NAME = 'Tank Starz';
const SERVER_INVITE = 'https://discord.gg/BMrh56BgcS';
const WEBSITE = 'https://sanad.apps.bot-hosting.cloud';

function dmNotice() {
  return {
    embeds: [new EmbedBuilder()
      .setTitle('🤖 سند بوت خاص')
      .setDescription('البوت ده ملك سيرفر **' + SERVER_NAME + '** بس، وأوامره مش شغالة في الخاص.\nادخل السيرفر واستخدمه من جوه.')
      .setColor(0x5EF2D6)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('ادخل السيرفر').setURL(SERVER_INVITE),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('الموقع').setURL(WEBSITE),
    )],
  };
}

module.exports = { dmNotice };
