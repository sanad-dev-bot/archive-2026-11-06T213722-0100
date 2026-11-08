require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, Collection, PermissionFlagsBits, REST, Routes,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

const client = new Client({
  // The bot is an Administrator, so user text must never be able to ping @everyone or a role through it.
  // Messages that must ping a role (tickets, incidents, suggestions, applications) list it explicitly.
  allowedMentions: { parse: ['users'] },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember, Partials.Reaction, Partials.User,
  ],
});
// Every system (protection, XP, shortcuts, logging...) listens to messages on its own, by design
client.setMaxListeners(40);

const i18n = require('./src/utils/i18n');
i18n.install(client);

// ── Load Commands (recursive) ─────────────────────────────────────────────
client.commands = new Collection();
const cmdJSON   = [];

function loadCommandsFromDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommandsFromDir(fullPath);
    } else if (entry.name.endsWith('.js') && entry.name !== 'help.js') {
      try {
        const cmds = require(fullPath);
        if (!Array.isArray(cmds)) continue;
        cmds.forEach(cmd => {
          if (!cmd?.data?.name) return;
          client.commands.set(cmd.data.name, cmd);
          cmdJSON.push(cmd.data.toJSON());
        });
      } catch (err) {
        console.error('[CMD ERROR] Failed to load ' + entry.name + ':', err.message);
      }
    }
  }
}

loadCommandsFromDir(path.join(__dirname, 'src', 'commands'));

// Load help last (needs all commands loaded)
try {
  const helpCmds = require(path.join(__dirname, 'src', 'commands', 'help.js'));
  helpCmds.forEach(cmd => {
    if (!cmd?.data?.name) return;
    client.commands.set(cmd.data.name, cmd);
    cmdJSON.push(cmd.data.toJSON());
  });
} catch (err) {
  console.error('[CMD ERROR] Failed to load help.js:', err.message);
}

console.log('[INFO] Loaded ' + client.commands.size + ' commands');

// Staff tools stay out of the slash menu for regular members; each command still checks its own permission
const STAFF_COMMANDS = new Set([
  'slowmode', 'lock', 'unlock', 'hide', 'unhide', 'createchannel', 'createvc', 'deletechannel', 'createcategory',
  'renamechannel', 'settopic', 'cmdrole', 'ban', 'unban', 'kick', 'mute', 'unmute', 'banlist', 'role', 'protection',
  'setautorole', 'disableautorole', 'setlog', 'disablelog', 'setantiraid', 'protunlock', 'setantispam', 'setantimentions',
  'setantilink', 'protstatus', 'setvoice', 'nick', 'resetnick', 'vmove', 'vkick', 'vmuteall', 'vunmuteall', 'clear',
  'clearuser', 'warn', 'modlog', 'bc', 'obc', 'bcspeed', 'bcreport', 'gstart', 'gend', 'greroll', 'gpause', 'gresume',
  'gedit', 'setticketrole', 'setticketlog', 'setticketcategory', 'ticketpanel', 'ticketoption', 'ticketstats',
  'setwelcome', 'setwelcomemsg', 'testwelcome', 'disablewelcome', 'securityscan',
]);
for (const command of cmdJSON) {
  if (STAFF_COMMANDS.has(command.name) && !command.default_member_permissions) {
    command.default_member_permissions = PermissionFlagsBits.ManageMessages.toString();
  }
}

// ── Auto Deploy ────────────────────────────────────────────────────────────
async function deployCommands(language) {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    // Global commands work on every server the bot joins
    const lang = language || i18n.langFor(i18n.primaryGuildId());
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: i18n.localizeCommands(cmdJSON, lang) });
    console.log('[DEPLOY] ' + cmdJSON.length + ' commands deployed globally');

    // Guild copies would show each command twice next to the global ones
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] });
    }
  } catch (err) {
    console.error('[DEPLOY ERROR]', err.message);
  }
}
client.deployCommands = deployCommands;

// ── Load Events ────────────────────────────────────────────────────────────
const eventsDir = path.join(__dirname, 'src', 'events');
fs.readdirSync(eventsDir)
  .filter(f => f.endsWith('.js') && f !== 'ticketHelper.js')
  .forEach(file => {
    try {
      const exported = require(path.join(eventsDir, file));
      const events   = Array.isArray(exported) ? exported : [exported];
      events.forEach(event => {
        if (event.once) client.once(event.name, (...args) => event.execute(client, ...args));
        else            client.on(event.name,   (...args) => event.execute(client, ...args));
      });
    } catch (err) {
      console.error('[EVENT ERROR] Failed to load ' + file + ':', err.message);
    }
  });

client.on('error', err => console.error('[CLIENT ERROR]', err));
process.on('unhandledRejection', err => console.error('[UNHANDLED]', err));
process.on('uncaughtException', err => console.error('[UNCAUGHT]', err));

(async () => {
  await deployCommands();
  await client.login(process.env.TOKEN);
})();
