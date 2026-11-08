(function () {
  var BOT_API = 'https://sanad.apps.bot-hosting.cloud';
  var EN = {
    skip: 'Skip to content', brand: 'Sanad', nav_features: 'Features', nav_levels: 'Levels', nav_commands: 'Commands',
    join: 'Join the server', see_commands: 'See commands', status_wait: 'Checking the bot...',
    hero_title_1: 'Always', hero_title_2: 'got your back',
    hero_lead: 'Sanad is the Tank Starz bot. It runs tickets, verification, protection and levels, so the server stays organized and members stay happy.',
    fact_commands: 'commands', fact_tickets: 'ticket types', fact_roles: 'level roles', fact_langs: 'languages',
    welcome_eyebrow: 'Welcome', welcome_title: 'Every new member gets a proper welcome',
    welcome_text: 'After verification, Sanad creates a welcome card with the member’s name, avatar and number, then points them to the rules, chat and tickets with one tap.',
    welcome_alt: 'Sample Sanad welcome card',
    verify_eyebrow: 'Safe entry', verify_title: 'Three steps to verify. Bots stay out.',
    verify_1: 'Press Verify and answer a simple question', verify_2: 'Link a Roblox account through Bloxlink', verify_3: 'Get your role and every channel opens',
    verify_alt: 'Sanad verification banner',
    features_eyebrow: 'Features', features_title: 'Everything the server needs in one bot',
    f_tickets: 'Support tickets', f_tickets_t: 'Members pick a request type and add details. Staff claim it, close it, and the transcript is saved.',
    f_protect: 'Protection', f_protect_t: 'Guards against spam, links, mass mentions and mass deletions, with Anti-Raid ready when it is needed.',
    f_mod: 'Moderation', f_mod_t: 'Warnings, mutes, bans and full logs, plus status roles that update on their own.',
    f_suggest: 'Suggestions', f_suggest_t: 'Ideas are posted with a number and votes, and popular ones reach the admins.',
    f_give: 'Giveaways', f_give_t: 'Enter with one button. Giveaways are saved, so a restart does not lose them.',
    f_lang: 'Arabic and English', f_lang_t: 'Admins switch the bot language with one command, and language channels keep their own language.',
    levels_eyebrow: 'Levels', levels_title: 'Stay active and earn real perks',
    levels_text: 'Every message and minute in voice earns XP, and your role unlocks new perks automatically.',
    t5: 'Images in chat', t10: 'External stickers and voice messages', t20: 'Soundboard', t30: 'Polls and threads', t50: 'Private threads', t100: 'Priority speaker in voice',
    rank_alt: 'Sample Sanad rank card',
    commands_eyebrow: 'Commands', commands_title: 'Every Sanad command in one place',
    search_label: 'Search commands', search_ph: 'Search commands...', commands_loading: 'Loading commands...',
    nav_apply: 'Apply', apply_eyebrow: 'Staff team', apply_title: 'Want to join the staff team?',
    apply_text: 'Applications are open. Apply inside the server in two minutes, and the answer will reach you in your DMs.',
    apply_button: 'Apply now',
    cta_title: 'The server is waiting', cta_text: 'Join Tank Starz, verify in a minute, and start playing with everyone.',
    foot: 'Sanad is a private bot for the Tank Starz server and is not available for other servers.'
  };
  var UI = {
    ar: { all: 'الكل', empty: 'مفيش أوامر بالاسم ده.', failed: 'ماقدرناش نحمل الأوامر دلوقتي.', online: 'البوت شغال دلوقتي', offline: 'البوت مش متاح دلوقتي', ms: ' مللي ثانية' },
    en: { all: 'All', empty: 'No commands match that search.', failed: 'Commands could not be loaded right now.', online: 'Sanad is online', offline: 'Sanad is offline', ms: ' ms' }
  };
  var TITLE = { ar: document.title, en: 'Sanad | The Tank Starz bot' };
  var root = document.documentElement;
  var langButton = document.getElementById('lang');
  var statusBox = document.getElementById('status');
  var statusText = document.getElementById('status-text');
  var search = document.getElementById('search');
  var chips = document.getElementById('chips');
  var list = document.getElementById('list');
  var state = { lang: 'ar', category: 'all', categories: null, status: null };

  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'));
  nodes.forEach(function (node) { node.dataset.ar = node.textContent; });

  function remembered() {
    try { return localStorage.getItem('sanad-lang'); } catch (err) { return null; }
  }
  function remember(lang) {
    try { localStorage.setItem('sanad-lang', lang); } catch (err) { /* private mode */ }
  }

  function setLanguage(lang) {
    state.lang = lang;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = TITLE[lang];
    langButton.textContent = lang === 'ar' ? 'English' : 'العربية';
    langButton.lang = lang === 'ar' ? 'en' : 'ar';
    nodes.forEach(function (node) {
      node.textContent = lang === 'en' ? EN[node.dataset.i18n] : node.dataset.ar;
    });
    document.querySelectorAll('[data-src-ar]').forEach(function (img) {
      img.src = img.getAttribute('data-src-' + lang);
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(function (img) {
      img.alt = EN[img.dataset.i18nAlt];
    });
    search.placeholder = lang === 'en' ? EN.search_ph : 'دور على أمر...';
    renderStatus();
    renderCommands();
  }

  function getJSON(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    });
  }

  function renderStatus() {
    var data = state.status;
    if (!data) return;
    var ui = UI[state.lang];
    statusBox.classList.toggle('on', data.online);
    statusText.textContent = data.online ? ui.online + (data.ping > 0 ? ' • ' + data.ping + ui.ms : '') : ui.offline;
  }

  function loadStatus() {
    getJSON(BOT_API + '/api/status').then(function (data) {
      state.status = data;
      renderStatus();
      document.getElementById('apply').hidden = !data.applications;
      document.getElementById('nav-apply').hidden = !data.applications;
      if (data.applyUrl) document.getElementById('apply-link').href = data.applyUrl;
    }).catch(function () {
      state.status = { online: false };
      renderStatus();
    });
  }

  function chip(id, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(state.category === id));
    button.addEventListener('click', function () {
      state.category = id;
      renderCommands();
    });
    return button;
  }

  function renderCommands() {
    if (!state.categories) return;
    var ui = UI[state.lang];
    var query = search.value.trim().toLowerCase();
    chips.textContent = '';
    chips.appendChild(chip('all', ui.all));
    state.categories.forEach(function (category) { chips.appendChild(chip(category.id, category.label[state.lang])); });

    list.textContent = '';
    state.categories.forEach(function (category) {
      if (state.category !== 'all' && state.category !== category.id) return;
      var commands = category.commands.filter(function (command) {
        var text = (command.name + ' ' + command.desc.ar + ' ' + command.desc.en).toLowerCase();
        return !query || text.indexOf(query) !== -1;
      });
      if (!commands.length) return;
      var block = document.createElement('div');
      var heading = document.createElement('h3');
      heading.textContent = category.label[state.lang];
      var rows = document.createElement('div');
      rows.className = 'rows';
      commands.forEach(function (command) {
        var row = document.createElement('div');
        row.className = 'row';
        var name = document.createElement('code');
        name.textContent = command.name;
        var desc = document.createElement('span');
        desc.textContent = command.desc[state.lang];
        row.appendChild(name);
        row.appendChild(desc);
        rows.appendChild(row);
      });
      block.appendChild(heading);
      block.appendChild(rows);
      list.appendChild(block);
    });
    if (!list.children.length) {
      var empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = ui.empty;
      list.appendChild(empty);
    }
  }

  langButton.addEventListener('click', function () {
    var next = state.lang === 'ar' ? 'en' : 'ar';
    remember(next);
    setLanguage(next);
  });
  search.addEventListener('input', renderCommands);

  function showCommands(data) {
    state.categories = data.categories;
    document.getElementById('count-commands').textContent = data.categories.reduce(function (total, category) {
      return total + category.commands.length;
    }, 0);
    renderCommands();
  }

  // The bundled list keeps the page complete while the bot is offline
  getJSON('commands.json').then(showCommands).catch(function () {
    list.textContent = UI[state.lang].failed;
  }).then(function () {
    return getJSON(BOT_API + '/api/commands').then(showCommands);
  }).catch(function () { /* bot offline: keep the bundled list */ });

  if (remembered() === 'en') setLanguage('en');
  loadStatus();
  setInterval(function () {
    if (!document.hidden) loadStatus();
  }, 120000);
})();
