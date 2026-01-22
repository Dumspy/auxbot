import {
  ChatInputCommandInteraction,
  Interaction,
  SlashCommandBuilder,
} from "discord.js";

export interface AuxInteraction {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const interactions: AuxInteraction[] = [];
export function registerInteraction(interaction: AuxInteraction) {
  interactions.push(interaction);
}

export function getInteractions(): AuxInteraction[] {
  return interactions;
}

export function getInteraction(name: string): AuxInteraction | undefined {
  return interactions.find((interaction) => interaction.data.name === name);
}

export async function executeCommandHandler(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) {
    console.log("Received a non-chat input command interaction, ignoring");
    return;
  }

  const command = getInteraction(interaction.commandName);
  if (!command) {
    return Promise.reject("Command not found");
  }

  try {
    return await command.execute(interaction);
  } catch (error) {
    console.error("Error executing command:", error);
    return await Promise.reject(new Error("Failed to execute command"));
  }
}
