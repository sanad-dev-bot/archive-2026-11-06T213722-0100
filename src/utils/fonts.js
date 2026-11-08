const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');

const FILES = {
  'Sanad Latin Bold': 'Poppins-Bold.ttf',
  'Sanad Latin Medium': 'Poppins-Medium.ttf',
  'Sanad Arabic Bold': 'Tajawal-ExtraBold.ttf',
  'Sanad Arabic Medium': 'Tajawal-Medium.ttf',
};

for (const [family, file] of Object.entries(FILES)) {
  try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), 'assets', 'fonts', file), family);
  } catch (err) {
    console.error('[FONT ERROR] ' + file + ':', err.message);
  }
}

// Each list covers both scripts, so mixed names render without missing glyphs
const FONT = {
  bold: '"Sanad Latin Bold", "Sanad Arabic Bold"',
  medium: '"Sanad Latin Medium", "Sanad Arabic Medium"',
};

module.exports = { FONT };
