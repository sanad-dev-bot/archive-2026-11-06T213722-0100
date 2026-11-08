require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const cmds = [];
const dirs = ['src/commands', 'src/commands/systems'];

for (const dir of dirs) {
  const fullDir = path.join(__dirname, dir);
  fs.readdirSync(fullDir)
    .filter(f => f.endsWith('.js') && !fs.statSync(path.join(fullDir, f)).isDirectory())
    .forEach(file => {
      try {
        require(path.join(fullDir, file)).forEach(cmd => cmds.push(cmd.data.toJSON()));
      } catch (e) {
        console.error("Error loading " + file + ": " + e.message);
      }
    });
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("Deploying " + cmds.length + " commands...");

    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: cmds }
      );
      console.log("SUCCESS: Deployed " + cmds.length + " commands to guild (instant!)");
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: cmds }
      );
      console.log("SUCCESS: Deployed " + cmds.length + " commands globally");
    }
  } catch (err) {
    console.error("Deploy failed:", err.message);
  }
})();
