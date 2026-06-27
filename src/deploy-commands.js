import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const deployToGuild = process.argv.includes("--guild");

if (!token || !clientId) {
  console.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in your environment.");
  process.exit(1);
}

if (deployToGuild && !guildId) {
  console.error("DISCORD_GUILD_ID is required when using --guild.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);
const route = deployToGuild && guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

console.log(
  `Deploying ${commands.length} slash commands ${deployToGuild ? "to the test server" : "globally"}...`
);

await rest.put(route, { body: commands });

if (!deployToGuild && guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
  console.log("Removed the old test-server command registration.");
}

console.log("Slash commands deployed.");
