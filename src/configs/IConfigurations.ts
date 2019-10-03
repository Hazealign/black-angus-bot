import path from 'path'

export interface IConfigurations {
  DEBUG_HISTORY_TO_CHANNEL: boolean         // true
  DEBUG_ERROR_TO_CHANNEL: boolean           // true
  DEBUG_HISTORY_OR_ERROR_CHANNEL: string    // "log_channel"
  DISCORD_TOKEN: string
}

export const BOT_CONFIG: IConfigurations = require(
  path.join(process.cwd(), process.env.CONFIG_FILE as string)
)
