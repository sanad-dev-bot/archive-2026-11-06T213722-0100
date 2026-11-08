const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');

const CATEGORIES = [
  { id: 'moderation', label: 'الإشراف', emoji: '🌐', description: 'الحظر والطرد والإسكات', commands: [
    ['/ban', 'حظر عضو من السيرفر نهائياً'], ['/unban', 'فك حظر عضو عن طريق الـ ID'], ['/kick', 'طرد عضو من السيرفر'], ['/mute', 'إسكات عضو لمدة محددة'], ['/unmute', 'فك إسكات عضو'], ['/banlist', 'عرض قائمة المحظورين'],
  ]},
  { id: 'warnings', label: 'التحذيرات', emoji: '🚫', description: 'التحذيرات وسجل المشرفين', commands: [
    ['/warn', 'إدارة التحذيرات'], ['/modlog', 'عرض وإدارة سجل الإجراءات'],
  ]},
  { id: 'messages', label: 'الرسائل', emoji: '📝', description: 'حذف وإدارة الرسائل', commands: [
    ['/clear', 'حذف رسائل بفلاتر متعددة'], ['/clearuser', 'حذف رسائل عضو معين'],
  ]},
  { id: 'channels', label: 'الرومات', emoji: '📁', description: 'إدارة الرومات والأقسام', commands: [
    ['/lock', 'قفل قناة'], ['/unlock', 'فتح قناة مقفولة'], ['/hide', 'إخفاء قناة'], ['/unhide', 'إظهار قناة مخفية'], ['/slowmode', 'تفعيل السلو مود'], ['/createchannel', 'إنشاء قناة نصية'], ['/createvc', 'إنشاء قناة صوتية'], ['/deletechannel', 'حذف قناة'], ['/createcategory', 'إنشاء قسم'], ['/renamechannel', 'تغيير اسم قناة'], ['/settopic', 'تغيير وصف القناة'],
  ]},
  { id: 'roles', label: 'الرتب', emoji: '🎭', description: 'إدارة الرتب والأدوار', commands: [
    ['/role', 'إدارة الرتب والأعضاء'],
  ]},
  { id: 'voice', label: 'الصوت', emoji: '🔊', description: 'إدارة القنوات الصوتية', commands: [
    ['/vmove', 'نقل عضو لقناة صوتية'], ['/vkick', 'فصل عضو من الصوت'], ['/vmuteall', 'إسكات الجميع'], ['/vunmuteall', 'فك إسكات الجميع'],
  ]},
  ...(process.env.MUSIC_ENABLED !== '1' ? [] : [{ id: 'music', label: 'الموسيقى', emoji: '🎵', description: 'تشغيل أغاني من يوتيوب في الروم الصوتي', commands: [
    ['/play', 'شغّل أغنية (اسم أو لينك يوتيوب)'], ['/music skip', 'تخطي الأغنية'], ['/music stop', 'وقف وامسح القايمة'], ['/music pause', 'إيقاف مؤقت'], ['/music resume', 'كمّل'], ['/music queue', 'قايمة الأغاني'], ['/music nowplaying', 'اللي شغال دلوقتي'], ['/music volume', 'الصوت'], ['/music loop', 'تكرار'], ['/music shuffle', 'لخبطة القايمة'], ['/music remove', 'شيل أغنية من القايمة'], ['/music leave', 'اخرج من الروم'],
  ]}]),
  { id: 'info', label: 'المعلومات', emoji: '📊', description: 'معلومات السيرفر والأعضاء', commands: [
    ['/serverinfo', 'معلومات السيرفر'], ['/userinfo', 'معلومات عضو'], ['/avatar', 'عرض صورة عضو'], ['/banner', 'عرض بانر عضو'], ['/servericon', 'صورة السيرفر'], ['/serverbanner', 'بانر السيرفر'], ['/membercount', 'إحصائيات الأعضاء'], ['/invite', 'إنشاء دعوة'], ['/invites', 'عرض دعوات عضو'], ['/ping', 'سرعة استجابة البوت'], ['/uptime', 'مدة تشغيل البوت'], ['/nick', 'تغيير لقب عضو'], ['/resetnick', 'إعادة اللقب الأصلي'],
  ]},
  { id: 'xp', label: 'XP', emoji: '⭐', description: 'مستويات الكتابي والصوتي', commands: [
    ['/rank', 'عرض مستوى الكتابي والصوتي'], ['/profile', 'عرض بروفايل العضو وإحصائياته'], ['/top', 'عرض أفضل 5 كتابي وصوتي'],
  ]},
  { id: 'autoreply', label: 'الرد التلقائي', emoji: '↩️', description: 'إضافة وإدارة الردود التلقائية', commands: [
    ['/addautoreply', 'إضافة رد تلقائي'], ['/removeautoreply', 'حذف رد تلقائي'], ['/autoreplies', 'عرض جميع الردود التلقائية'],
  ]},
  { id: 'autoline', label: 'خط تلقائي', emoji: '〰️', description: 'إرسال خط تلقائياً في رومات محددة', commands: [
    ['/setautoline', 'تحديد صورة الخط'], ['/setautolinechannel', 'تفعيل الخط في روم'], ['/removeautolinechannel', 'إزالة الخط من روم'],
  ]},
  { id: 'tickets', label: 'التكتات', emoji: '🎫', description: 'نظام تذاكر الدعم الفني', commands: [
    ['/ticketpanel', 'إرسال بانل التذاكر'], ['/ticketoption', 'إدارة خيارات التذاكر'], ['/ticketmember', 'إضافة أو إزالة عضو'], ['/setticketrole', 'تحديد رتبة الدعم'], ['/setticketcategory', 'تحديد قسم التذاكر'], ['/setticketlog', 'تحديد سجل التذاكر'], ['/renameticket', 'تغيير اسم التذكرة'], ['/closeticket', 'إغلاق التذكرة'], ['/ticketstats', 'إحصائيات التذاكر'],
  ]},
  { id: 'giveaway', label: 'القيف اوي', emoji: '🎉', description: 'نظام السحوبات التفاعلي', commands: [
    ['/gstart', 'بدء سحب'], ['/gend', 'إنهاء سحب'], ['/greroll', 'إعادة السحب'], ['/gpause', 'إيقاف السحب'], ['/gresume', 'استئناف السحب'], ['/gedit', 'تعديل سحب'], ['/glist', 'عرض السحوبات'], ['/ginfo', 'تفاصيل السحب'],
  ]},
  { id: 'broadcast', label: 'البرودكاست', emoji: '📡', description: 'إرسال رسائل جماعية بالخاص', commands: [
    ['/bc', 'برودكاست للخاص'], ['/obc', 'برودكاست للأونلاين'], ['/bcspeed', 'ضبط سرعة الإرسال'], ['/bcreport', 'تقرير آخر برودكاست'],
  ]},
  { id: 'protection', label: 'الحماية', emoji: '🛡️', description: 'أنظمة الحماية التلقائية', commands: [
    ['/setantispam', 'حماية من السبام'], ['/setantimentions', 'حماية من الذكر المفرط'], ['/setantilink', 'حماية من الروابط'], ['/setantiraid', 'حماية من الريد'], ['/protection', 'إدارة الحماية'], ['/protstatus', 'حالة الحماية'], ['/protunlock', 'فتح القنوات بعد الحماية'], ['/securityscan', 'فحص أمان السيرفر وتصليحه'],
  ]},
  { id: 'config', label: 'الإعدادات', emoji: '⚙️', description: 'إعدادات البوت للسيرفر', commands: [
    ['/setlog', 'تحديد قناة اللوق'], ['/disablelog', 'تعطيل اللوق'], ['/setwelcome', 'تفعيل الترحيب'], ['/setwelcomemsg', 'تغيير رسالة الترحيب'], ['/testwelcome', 'اختبار الترحيب'], ['/disablewelcome', 'تعطيل الترحيب'], ['/setautorole', 'تحديد الرتبة التلقائية'], ['/disableautorole', 'تعطيل الرتبة التلقائية'], ['/setvoice', 'تثبيت البوت في روم صوتي'],
  ]},
  { id: 'cmdrole', label: 'صلاحيات الأوامر', emoji: '🔐', description: 'تخصيص رتبة لكل أمر', commands: [
    ['/cmdrole', 'إدارة صلاحيات الأوامر'],
  ]},
  { id: 'system', label: 'النظام', emoji: '🧩', description: 'اللغة والتقديم ورسايل الرومات', commands: [
    ['/language', 'تغيير لغة البوت'], ['/applications', 'فتح أو قفل التقديم على الإدارة'], ['/roomguides', 'نشر أو تحديث رسايل الرومات'], ['/verifypanel', 'إرسال رسالة التحقق'], ['/shortcuts', 'إدارة اختصارات الأوامر'], ['/help', 'عرض قائمة الأوامر'],
  ]},
];

const totalCommands = () => CATEGORIES.reduce((n, c) => n + c.commands.length, 0);

function divider() {
  return new SeparatorBuilder();
}

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function buildHome(guild, withMenu = true) {
  const container = new ContainerBuilder().setAccentColor(0x5865f2);
  container
    .addTextDisplayComponents(text('# 📋 مركز المساعدة'))
    .addTextDisplayComponents(text(`اختر القسم من القائمة لعرض الأوامر الخاصة به.\n**${totalCommands()}** أمر • **${CATEGORIES.length}** قسم`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(CATEGORIES.map(c => `**${c.emoji} ${c.label}** — ${c.description}`).join('\n')))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`**البوت:** سند\n**السيرفر:** ${guild.name}`));
  if (withMenu) container.addActionRowComponents(row => row.addComponents(buildMenu()));
  return container;
}

function buildCategory(cat, guild) {
  const lines = cat.commands.map(([name, desc]) => `**${name}** — ${desc}`).join('\n');
  const container = new ContainerBuilder().setAccentColor(cat.color || 0x5865f2);
  container
    .addTextDisplayComponents(text(`# ${cat.emoji} ${cat.label}`))
    .addTextDisplayComponents(text(cat.description))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(lines))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`**${cat.commands.length}** أوامر • ${guild.name}`));
  container.addActionRowComponents(row => row.addComponents(buildMenu()));
  return container;
}

function buildMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId('help_menu')
    .setPlaceholder('اختر قسم من القائمة...')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('الرئيسية').setDescription('الصفحة الرئيسية').setEmoji('🏠').setValue('home'),
      ...CATEGORIES.map(c => new StringSelectMenuOptionBuilder().setLabel(c.label).setDescription(c.description).setEmoji(c.emoji).setValue(c.id)),
    );
}

module.exports = [{
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('عرض قائمة الأوامر'),

  async execute(i) {
    await i.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [buildHome(i.guild)],
    });

    // Collected on this reply only: a channel-wide collector also grabbed the menus of other /help
    // messages, so two collectors answered one click and Discord returned "Unknown interaction"
    const reply = await i.fetchReply();
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 180_000,
      filter: s => s.user.id === i.user.id && s.customId === 'help_menu',
    });

    collector.on('collect', async sel => {
      const val = sel.values[0];
      const cat = CATEGORIES.find(c => c.id === val);
      await sel.update({
        flags: MessageFlags.IsComponentsV2,
        components: [val === 'home' ? buildHome(i.guild) : buildCategory(cat, i.guild)],
      });
    });

    collector.on('end', () => {
      // Remove the expired menu so an old interaction cannot be used later.
      // A Components V2 message cannot be empty, so the home page stays without its menu
      i.editReply({ flags: MessageFlags.IsComponentsV2, components: [buildHome(i.guild, false)] }).catch(() => {});
    });
  },
}];

module.exports.CATEGORIES = CATEGORIES;
