import { ArgumentParser, BasePresentedCommand, Presenter } from '../../core/BasePresentedCommand'
import { CommandDefinition } from '../../core/CommandFactory'
import { presentGetWeather } from '../../presenters/Weather'
import { weatherLocationParser } from '../../parsers/Weather'

@CommandDefinition()
export class AirQuality extends BasePresentedCommand {
  commands: string[] = ['날씨', '기온', '습도', '기압', '강수', 'weather', 'aws']
  argsParser: ArgumentParser = weatherLocationParser
  presenter: Presenter = presentGetWeather
}
