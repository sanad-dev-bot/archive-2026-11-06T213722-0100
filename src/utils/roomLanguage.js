const ARABIC_LETTER = /[ء-يٮ-ۓۺ-ۿ]/g;
const NOISE = /https?:\/\/\S+|<a?:\w+:\d+>|<[@#][!&]?\d+>|:\w+:/g;

// Names and short words like "gg" or "Roblox" are normal in Arabic chat, so one Latin word is allowed
function breaksRoomLanguage(content, lang) {
  const text = String(content || '').replace(NOISE, ' ');
  const arabic = (text.match(ARABIC_LETTER) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (lang === 'en') return arabic >= 2 && arabic > latin;
  const latinWords = (text.match(/[A-Za-z]{2,}/g) || []).length;
  return latinWords >= 2 && latin > arabic;
}

module.exports = { breaksRoomLanguage };
