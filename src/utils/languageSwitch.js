const { buildSelectMenu } = require('../events/ticketHelper');
const { ticketPanels } = require('./state');
const { TICKET_OPTIONS, ticketPanelMessage, verifyPanelMessage } = require('./serverKit');
const { postGuides } = require('./roomGuides');
const { textFor, langFor } = require('./i18n');

const TICKET_ROOM = '1562922536155480068';
const VERIFY_ROOM = '1567939777729142804';

async function findPanel(guild, roomId, matches) {
  const channel = await guild.channels.fetch(roomId).catch(() => null);
  if (!channel) return null;
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  return recent?.find(m => m.author.id === guild.client.user.id
    && m.components.some(row => row.components.some(c => matches(c.customId || '')))) || null;
}

async function refreshPanels(guild) {
  const failed = [];
  const lang = roomId => langFor(guild.id, roomId);

  try {
    const panel = await findPanel(guild, TICKET_ROOM, id => id.startsWith('ticket_open:'));
    if (panel) {
      const options = TICKET_OPTIONS.map(o => ({ ...o }));
      await panel.edit({
        ...(await ticketPanelMessage(guild, lang(TICKET_ROOM))),
        attachments: [],
        components: [buildSelectMenu(panel.id, options)],
      });
      ticketPanels.set(panel.id, options);
    }
  } catch (err) { failed.push('tickets: ' + err.message); }

  try {
    const panel = await findPanel(guild, VERIFY_ROOM, id => id === 'verify_start');
    if (panel) await panel.edit({ ...(await verifyPanelMessage(guild, lang(VERIFY_ROOM))), attachments: [] });
  } catch (err) { failed.push('verify: ' + err.message); }

  return failed;
}

async function applyLanguage(guild, language) {
  const { client } = guild;
  const failed = await refreshPanels(guild);

  const guides = await postGuides(guild);
  for (const [title, result] of Object.entries(guides)) if (result !== 'ok') failed.push(title + ': ' + result);

  await client.deployCommands(language).catch(err => failed.push('commands: ' + err.message));
  client.user.setActivity(textFor(language, 'دايمًا في ضهرك'), { type: 4 });
  return failed;
}

module.exports = { applyLanguage, refreshPanels };
