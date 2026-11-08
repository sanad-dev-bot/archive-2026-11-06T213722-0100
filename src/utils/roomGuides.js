const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageType,
} = require('discord.js');
const { buildBanner } = require('./banner');
const { getGuildConfig, setGuildConfig } = require('./storage');
const { langFor } = require('./i18n');

const BRAND_COLOR = 0x5EF2D6;
const TICKETS = '<#1562922536155480068>';
const LINE = '━━━━━━━━━━━━━━━━━━━━';
const WEBSITE = 'https://sanad.apps.bot-hosting.cloud';

const RULES_TEXT = [
  'أهلاً بيك في **Tank Starz** 🎮',
  'مجتمع للجيمرز وكل اللي بيدور على صحاب جداد. اقرا القوانين كويس عشان المكان يفضل حلو للكل.',
  '', LINE, '',
  '**01 ・ احترم الكل**',
  'ممنوع التنمر أو الإهانة أو العنصرية أو الهجوم الشخصي.',
  '',
  '**02 ・ ممنوع السبام**',
  'ممنوع تكرار الرسايل أو المنشن الكتير أو الإيموجي الزيادة.',
  '',
  '**03 ・ ممنوع الإعلانات**',
  'أي إعلان أو دعوة لسيرفر تاني لازم إذن من الإدارة.',
  '',
  '**04 ・ ممنوع النصب والروابط المشبوهة**',
  'النصب وسرقة الحسابات والروابط الضارة ممنوعين تمامًا.',
  '',
  '**05 ・ احترم الخصوصية**',
  'ماتنشرش بيانات أو رسايل أو صور حد من غير إذنه.',
  '',
  '**06 ・ استخدم كل روم في مكانه**',
  'الكلام في الشات، والأوامر في <#1562922541163483166>.',
  '',
  '**07 ・ احترم فريق الإدارة**',
  'نفّذ تعليمات الإدارة، ولو معترض افتح تذكرة بأدب.',
  '',
  '**08 ・ ممنوع إساءة استخدام البوتات**',
  'ماتستخدمش الأوامر في السبام أو مضايقة الأعضاء.',
  '',
  '**09 ・ التزم بقوانين ديسكورد**',
  'لازم تلتزم بشروط استخدام ديسكورد وإرشادات المجتمع.',
  '',
  '**10 ・ ممنوع التهرب من العقوبات**',
  'ممنوع تدخل بحساب تاني عشان تهرب من عقوبة.',
  '',
  '**11 ・ التزم بلغة الروم**',
  'في رومات اللغات اكتب بلغة الروم بس، والاقتراحات مكانها روم الاقتراحات.',
  '', LINE, '',
  '**⚖️ نظام العقوبات**',
  '🟡 تحذير للمخالفات البسيطة',
  '🟠 ميوت للتكرار أو الإزعاج',
  '🔴 طرد أو حظر للمخالفات الكبيرة',
  '',
  '**🎫 محتاج مساعدة؟** افتح تذكرة من ' + TICKETS + '.',
  '',
  'وجودك في السيرفر معناه إنك موافق على القوانين دي.',
].join('\n');

const GUIDES = [
  { id: '1562922531231633469', title: '📜 قوانين السيرفر', text: RULES_TEXT, banner: 'rules', replaces: '1562967476793516093' },
  { id: '1562922527058038807', title: '📌 الإعلانات', text: 'هنا هتلاقي أهم أخبار وقرارات السيرفر من الإدارة.\nالروم للقراءة بس.' },
  { id: '1562922533018279996', title: '📕 الأخبار', text: 'آخر أخبار السيرفر والجيمز والتحديثات الجديدة.\nالروم للقراءة بس.' },
  { id: '1562922534788407367', title: '🎉 السحوبات', text: 'هنا بتنزل السحوبات والجوايز.\nاضغط زرار المشاركة في السحب، ولو كسبت افتح تذكرة **استلام جايزة** من ' + TICKETS + '.' },
  { id: '1562922530019221524', title: '🆙 المستويات', text: 'كل ما تتفاعل في الشات والفويس بتكسب XP وتعلى في المستوى.\n\n**/rank** مستواك\n**/top** ترتيب الأعضاء\n\n**🏅 رتب المستويات**\n🌱 **Level 5:** تبعت صور في الشات\n⚡ **Level 10:** ستيكرات خارجية ورسايل صوتية\n🔥 **Level 20:** الساوند بورد\n💎 **Level 30:** الاستطلاعات والثريدات\n🏆 **Level 50:** الثريدات الخاصة\n🌟 **Level 100:** أولوية الكلام في الفويس\nكل رتبة فيها مميزات اللي قبلها، والمستوى بيتحسب من مجموع XP الكتابي والصوتي.', replaces: '1562969807454994534' },
  { id: '1562922538302967922', title: '💬 الشات العام', text: 'الروم الأساسي للكلام مع الأعضاء.\nخليك محترم، وماتعملش سبام، والروابط ممنوعة.', pin: true },
  { id: '1562922539741872148', title: '📷 أوف توبيك', text: 'أي كلام أو صور بره موضوع الشات الأساسي.\nالقوانين برضه سارية هنا.', pin: true },
  { id: '1562922541163483166', title: '🤖 أوامر البوتات', text: 'استخدم أوامر البوتات هنا عشان الشات يفضل نضيف.\n\n**/help** كل الأوامر\n**/rank** مستواك\n**/top** ترتيب الأعضاء\n**/profile** بروفايلك', pin: true },
  { id: '1562922542677762119', title: '💡 الاقتراحات', text: 'عندك فكرة للسيرفر؟ اكتبها هنا مباشرة، وسند هينزلها كاقتراح مرتب والأعضاء يصوتوا عليها بـ 👍 و👎.\n\n**الحدود:**\n• من 15 لـ 1000 حرف في الاقتراح\n• اقتراح واحد كل 5 دقايق\n• من غير روابط أو صور\n• ماتقدرش تصوت على اقتراحك\n\nالاقتراحات اللي تجيب تفاعل كبير بتوصل للأونر والإدارة.', pin: true },
  { id: '1562922544082718882', title: '🤝 الشراكات', text: 'هنا بتنزل شراكات السيرفر.\nعايز شراكة؟ افتح تذكرة من ' + TICKETS + ' واختار **شراكة**.' },
  { id: '1562922561661308991', title: '🛡️ دليل الإدارة', text: 'أهلاً بيك في فريق الإدارة، ودي أهم القواعد:\n\n• راجع التذاكر أول بأول ورد بأدب\n• ابدأ بالتحذير قبل أي عقوبة أكبر\n• حذف رسايل أو رومات كتير مرة واحدة بيشيل كل رتبك تلقائي\n• أوامر المسح والحذف للأونر والكو أونر بس\n• أي مشكلة كبيرة بلّغ بيها الأونر هنا', pin: true },
  { id: '1562922557311549572', title: '🎶 الموسيقى', text: 'روم أوامر بوتات الموسيقى.\nادخل روم Music الصوتي وشغّل اللي تحبه.', pin: true },
];

const ABOUT_TEXT = [
  '**سند** هو البوت الرسمي لسيرفر **Tank Starz**، ومعاك دايمًا في كل حاجة.',
  '',
  '**بيعمل إيه؟**',
  '🎫 تذاكر دعم للتواصل مع الإدارة',
  '✅ تحقق وربط حساب Roblox عن طريق Bloxlink',
  '🛡️ حماية من السبام والروابط',
  '🏅 مستويات ورتب بمميزات حقيقية',
  '🎉 سحوبات واقتراحات بتصويت',
  '🌐 عربي وإنجليزي',
  '',
  '**ابدأ من هنا**',
  '**/help** كل الأوامر',
  '**/rank** مستواك',
  '**/profile** بروفايلك',
  '',
  'كل التفاصيل والأوامر موجودة في الموقع.',
].join('\n');

const APPLY_TEXT = [
  'عايز تبقى من فريق الإدارة؟ قدّم من الزرار تحت وجاوب بصراحة.',
  '',
  '**قبل ما تقدّم**',
  '• لازم تكون ملتزم بقوانين السيرفر',
  '• تقديم واحد بس في نفس الوقت',
  '• لو اترفضت تقدر تقدم تاني بعد 7 أيام',
  '• الرد بيوصلك في الخاص، فخلي الخاص مفتوح',
].join('\n');

const linkButton = (label, emoji, url) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setEmoji(emoji).setURL(url);

// These rooms are created per server, so their ids live in the config
function configuredGuides(guild) {
  const cfg = getGuildConfig(guild.id);
  const guides = [];
  if (cfg.about_room) {
    guides.push({
      id: cfg.about_room, title: '🤖 عن سند', text: ABOUT_TEXT, banner: 'about', pin: true,
      components: [new ActionRowBuilder().addComponents(
        linkButton('الموقع', '🌐', WEBSITE),
        linkButton('كل الأوامر', '📖', WEBSITE + '/#commands'),
      )],
    });
  }
  if (cfg.apply_room) {
    guides.push({
      id: cfg.apply_room, title: '📝 التقديم على الإدارة', text: APPLY_TEXT, banner: 'apply', pin: true,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('apply_start').setLabel('قدّم دلوقتي').setEmoji('📝').setStyle(ButtonStyle.Success),
      )],
    });
  }
  return [...guides, ...languageGuides(cfg)];
}

function languageGuides(cfg) {
  const rooms = cfg.language_rooms;
  if (!rooms) return [];
  const rules = 'قوانين السيرفر سارية هنا. أي رسالة بلغة تانية هتتمسح، ولو اتكررت هتاخد رتبة Warned.';
  return [
    { id: rooms.ar, title: '🇪🇬 الشات العربي', text: 'الروم ده للكلام بالعربي.\n' + rules, pin: true },
    { id: rooms.en, title: '🇬🇧 الشات الإنجليزي', text: 'الروم ده للكلام بالإنجليزي، والبوت هنا بيرد إنجليزي على طول.\n' + rules, pin: true },
  ];
}

async function removePinNotice(channel) {
  const recent = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const notice = recent?.find(m => m.type === MessageType.ChannelPinnedMessage);
  await notice?.delete().catch(() => {});
}

async function postGuide(guild, guide, known) {
  const channel = await guild.channels.fetch(guide.id);
  const embed = new EmbedBuilder().setTitle(guide.title).setDescription(guide.text).setColor(BRAND_COLOR)
    .setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined });
  const payload = { embeds: [embed], components: guide.components || [] };
  if (guide.banner) {
    embed.setImage('attachment://banner.png');
    payload.files = [await buildBanner(guide.banner, langFor(guild.id, channel.id))];
  }

  const existing = known[guide.id] ? await channel.messages.fetch(known[guide.id]).catch(() => null) : null;
  if (existing) {
    await existing.edit({ ...payload, attachments: [] });
    return existing.id;
  }

  const msg = await channel.send(payload);
  if (guide.pin) {
    await msg.pin();
    await removePinNotice(channel);
  }
  return msg.id;
}

// Safe to run again: messages already posted are edited in place
async function postGuides(guild) {
  const known = getGuildConfig(guild.id).room_guides || {};
  const results = {};
  for (const guide of [...GUIDES, ...configuredGuides(guild)]) {
    try {
      known[guide.id] = await postGuide(guild, guide, known);
      results[guide.title] = 'ok';
    } catch (err) {
      results[guide.title] = err.message;
    }
    await new Promise(r => setTimeout(r, 800));
  }
  setGuildConfig(guild.id, 'room_guides', known);
  return results;
}

module.exports = { GUIDES, postGuides, removePinNotice };
