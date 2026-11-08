const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const {
  getShortcuts,
  setShortcut,
  deleteShortcut,
  clearShortcuts,
} = require('../../utils/storage');

const SHORTCUT_COMMANDS = [
  'slowmode',
  'lock',
  'unlock',
  'hide',
  'unhide',
  'ban',
  'kick',
  'mute',
  'unmute',
  'warn',
  'clear',
  'rank',
  'profile',
  'top',
];

function reply(i, content, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ content, ephemeral });
  return i.reply({ content, ephemeral });
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('shortcuts')
      .setDescription('إدارة اختصارات أوامر البوت')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(s => s
        .setName('set')
        .setDescription('تحديد اختصار')
        .addStringOption(o => o
          .setName('command')
          .setDescription('الأمر')
          .setRequired(true)
          .setAutocomplete(true))
        .addStringOption(o => o
          .setName('shortcut')
          .setDescription('الاختصار')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(20)))
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('حذف اختصار')
        .addStringOption(o => o
          .setName('shortcut')
          .setDescription('الاختصار المراد حذفه')
          .setRequired(true)))
      .addSubcommand(s => s
        .setName('list')
        .setDescription('عرض اختصارات السيرفر'))
      .addSubcommand(s => s
        .setName('clear')
        .setDescription('حذف جميع اختصارات السيرفر')),

    async autocomplete(i) {
      const focused = i.options.getFocused().toLowerCase();
      const commands = SHORTCUT_COMMANDS
        .filter(name => i.client.commands.has(name))
        .filter(name => name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(name => ({ name, value: name }));
      await i.respond(commands);
    },

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return reply(i, 'تحتاج صلاحية Administrator.', true);
      }

      const sub = i.options.getSubcommand();
      const guildId = i.guild.id;

      if (sub === 'set') {
        const command = i.options.getString('command').toLowerCase();
        const shortcut = i.options.getString('shortcut').trim();
        if (!SHORTCUT_COMMANDS.includes(command)) {
          return reply(i, `لا يمكن إنشاء اختصار للأمر /${command}. الاختصارات مخصصة فقط للأوامر الوظيفية المسموحة.`, true);
        }
        if (!i.client.commands.has(command)) {
          return reply(i, `الأمر /${command} غير موجود في البوت، لذلك لم يتم إنشاء الاختصار.`, true);
        }
        if (!shortcut || /\s/.test(shortcut)) {
          return reply(i, 'الاختصار يجب أن يكون كلمة أو رمزاً واحداً بدون مسافات.', true);
        }

        const existing = getShortcuts(guildId);
        const conflict = Object.entries(existing).find(([alias, cmd]) => alias === shortcut && cmd !== command);
        if (conflict) {
          return reply(i, `الاختصار ${shortcut} مستخدم حالياً للأمر /${conflict[1]}.`, true);
        }

        setShortcut(guildId, shortcut, command);
        return reply(i, `تم تحديد الاختصار ${shortcut} للأمر /${command}.`);
      }

      if (sub === 'remove') {
        const shortcut = i.options.getString('shortcut').trim();
        const existing = getShortcuts(guildId);
        if (!existing[shortcut]) return reply(i, `لا يوجد اختصار باسم ${shortcut}.`, true);
        deleteShortcut(guildId, shortcut);
        return reply(i, `تم حذف الاختصار ${shortcut}.`);
      }

      if (sub === 'clear') {
        clearShortcuts(guildId);
        return reply(i, 'تم حذف جميع اختصارات السيرفر.');
      }

      const shortcuts = getShortcuts(guildId);
      const entries = Object.entries(shortcuts);
      return reply(i, entries.length
        ? entries.map(([alias, cmd]) => `${alias} → /${cmd}`).join('\n')
        : 'لا توجد اختصارات محددة حالياً.');
    },
  },
];
