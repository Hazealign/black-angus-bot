import { CommandDefinition } from '../../core/CommandFactory'
import { ICommand, CommandType } from '../../core/ICommand'
import { Message } from 'discord.js'
import { BOT_CONFIG } from '../../configs/IConfigurations'
import { EmoticonService } from '../../services/EmoticonService'

@CommandDefinition()
export class EmoticonEquivalents implements ICommand {
  type: CommandType = CommandType.FEATURE_COMMANDS
  prefix: string = '!'

  async action (context: Message) {
    const { content, channel } = context
    if (content.indexOf('동의어') === -1 || !BOT_CONFIG.EMOTICON_ENABLED) {
      return
    }

    const [_, name] = content.split(' ')
    const result = await EmoticonService.getInstance().getEquivalents(name)
    await channel.send(result)
  }
}