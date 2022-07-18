import { ContextMenuCommandBuilder } from "@discordjs/builders";
import { ApplicationCommandType } from "discord-api-types/v10";
import * as messages from "../lib/starboard/messages";
import { Permissions } from "discord.js";
import { Counter } from "prom-client";
import { CommandArgs } from "../typedefs";
import getLogger, { getInteractionMeta } from "../lib/core/logging";
import { getError } from "../lib/core/node/error";

const log = getLogger("unignore");

const unignoreCounter = new Counter({
	name: "unignore_command_total",
	help: "Total number of unignore commands ran",
});

export const command = new ContextMenuCommandBuilder()
	.setType(ApplicationCommandType.Message)
	.setName("Unignore")
	.setDefaultMemberPermissions(Permissions.FLAGS.MANAGE_GUILD)
	.setDMPermission(false);

export default async ({ bot }: CommandArgs) => {
	bot.onContextMenuCommand(command, async (interaction) => {
		if (!interaction.isMessageContextMenu()) {
			log.warn("Handled a non-message context menu interaction");
			await interaction.reply({
				content: "Sorry, an unknown error occurred.",
				ephemeral: true,
			});
			return;
		}

		if (!interaction.inCachedGuild()) {
			log.warn("Handled an interaction in a non-cached guild");
			await interaction.reply({
				content: "Please add the bot before running this command",
				ephemeral: true,
			});
			return;
		}

		unignoreCounter.inc();
		log.info("Unignoring message", getInteractionMeta(interaction));

		if (interaction.guild?.id == null) {
			log.warn("Unable to find Guild");
			await interaction.reply({
				content: "I wasn't about to find a guild for this command!",
				ephemeral: true,
			});
			return;
		}

		await interaction.deferReply({ ephemeral: true });
		const message = await messages.fetchInteractionMessage(interaction);

		if (message == null) {
			log.warn("Unable to find message");
			await interaction.editReply({
				content: "I wasn't about to find the target message!",
			});
			return;
		}

		const messageId = BigInt(interaction.targetMessage.id);

		try {
			await bot.database.blockedMessage.delete({
				where: {
					messageId,
				},
			});
		} catch (err: unknown) {
			const error = getError(err);
			log.error(error.message, { error });

			await interaction.editReply({
				content: "It doesn't look like that message is blocked!",
			});
			return;
		}

		await interaction.editReply({
			content:
				"The message has been unignored, and is now eligible for the starboard.",
		});

		const reaction = message.reactions.cache.find(
			(reaction) => reaction.emoji.id === process.env.IGNORE_EMOJI_ID
		);

		if (reaction != null && bot.user != null) {
			await reaction.users.remove(bot.user);
		}
	});
};