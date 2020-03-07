import { DocumentType } from '@typegoose/typegoose'
import crypto from 'crypto'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Message, PartialMessage } from 'discord.js'
import fs from 'fs'
import got from 'got'
import _ from 'lodash'
import path from 'path'
import { URL } from 'url'
import util from 'util'
import { BOT_CONFIG } from '../configs/IConfigurations'
import { Emoticon, EmoticonActionType, EmoticonLogModel, EmoticonModel, EmoticonNameModel } from '../models/Emoticon'
import { tryCatch } from '../utils/tryCatch'
import { LoggingQueue } from './LoggingQueue'

const writeFile = util.promisify(fs.writeFile)
const mkdir = util.promisify(fs.mkdir)
const stat = util.promisify(fs.stat)

export default class EmoticonService {
  public static async initialize () {
    const [err, result] = await tryCatch(stat(BOT_CONFIG.EMOTICON_FILE_PATH))
    if (err) {
      await mkdir(BOT_CONFIG.EMOTICON_FILE_PATH)
      return
    }

    if (result && !result.isDirectory()) {
      throw new Error('Emoticon Path must be folder or empty.')
    }
  }

  private static getFileName (file: Buffer) {
    return crypto
      .createHash('sha1')
      .update(file)
      .digest('hex')
  }

  private static async downloadFile (rawUrl: string) {
    const url = new URL(rawUrl)
    const body = await got.get(rawUrl, {
      retry: 3
    }).buffer()

    const paths = url.pathname.split('/')
    const extension = (() => {
      const extname = path.extname(paths[paths.length - 1])
      const preservedExts = ['.jpg', '.png', '.gif']
      return preservedExts.indexOf(extname) === -1 ? '.jpg' : extname
    })()

    const fileName = path.join(
      BOT_CONFIG.EMOTICON_FILE_PATH,
      `${this.getFileName(body)}${extension}`
    )

    // create file if not exists. ;)
    const [err] = await tryCatch(stat(fileName))
    if (err) {
      await writeFile(fileName, body)
    }

    return fileName
  }

  private static insertLog (type: EmoticonActionType, context: Message | PartialMessage, emoticon: DocumentType<Emoticon>) {
    return EmoticonLogModel.create({
      type,
      context: `[${format(new Date(), 'yyyy. MM. dd. a hh:mm:ss', {
        locale: ko
      })}] <${context.author?.username}#${context.author?.discriminator}> ${
        context.content
      }`,
      emoticon
    })
  }

  public static async upload (context: Message | PartialMessage, name: string, rawUrl: string) {
    const prev = await EmoticonModel.findOne({ name, removed: false }).exec()
    if (prev) return -1

    const path = await this.downloadFile(rawUrl)
    const [err, emoticon] = await tryCatch(EmoticonModel.create({
      name, path
    }))

    if (err) {
      LoggingQueue.errorSubject.next({ error: err, time: new Date(), context })
      return 0
    }

    await EmoticonNameModel.create({ name })
    await this.insertLog(EmoticonActionType.CREATE, context, emoticon!)
    return 1
  }

  public static async duplicate (context: Message | PartialMessage, name: string, target: string) {
    const targetEmoticon = await EmoticonModel.findOne({ name: target, removed: false }).exec()
    if (!targetEmoticon) return -2

    const prev = await EmoticonModel.findOne({ name, removed: false }).exec()
    if (prev) return -1

    const [err, duplicated] = await tryCatch(EmoticonModel.create({
      name, path: targetEmoticon.path, equivalents: [ targetEmoticon.name ]
    }))

    if (err) {
      LoggingQueue.errorSubject.next({ error: err, time: new Date(), context })
      return 0
    }

    const equivalents = await EmoticonModel.find({
      name: { $in: [...targetEmoticon.equivalents, target] }
    }).exec()

    await Promise.all(equivalents.map(async emoticon => {
      emoticon.equivalents.push(name)
      emoticon.updatedAt = new Date()
      await emoticon.save()
      await this.insertLog(EmoticonActionType.UPDATE, context, emoticon)
    }))

    await EmoticonNameModel.create({ name })
    await this.insertLog(EmoticonActionType.CREATE, context, duplicated!)
    return 1
  }

  public static async update (context: Message | PartialMessage, name: string, newUrl: string) {
    const prev = await EmoticonModel.findOne({ name, removed: false }).exec()
    if (!prev) return undefined

    const list = [...prev.equivalents, prev.name]
    const newPath = await this.downloadFile(newUrl)
    const emoticons = await EmoticonModel.find({
      removed: false,
      name: { $in: list }
    }).exec()

    // update self and equivalent emoticon's path
    await Promise.all(emoticons.map(async emoticon => {
      emoticon.path = newPath
      emoticon.updatedAt = new Date()
      await emoticon.save()
      await this.insertLog(EmoticonActionType.UPDATE, context, emoticon)
    }))

    return emoticons
  }

  public static async delete (context: Message | PartialMessage, name: string) {
    const prev = await EmoticonModel.findOne({ name, removed: false }).exec()
    if (!prev) return false

    prev.removed = true
    prev.updatedAt = new Date()
    await prev.save()

    // remove name index too.
    await EmoticonNameModel.remove({ name }).exec()

    // remove equivalents too.
    const equivalents = await EmoticonModel.find({
      equivalents: { $in: prev.equivalents },
      removed: false
    }).exec()

    await Promise.all(equivalents.map(async emoticon => {
      emoticon.equivalents = emoticon.equivalents.filter(str => str !== name)
      emoticon.updatedAt = new Date()
      await this.insertLog(EmoticonActionType.UPDATE, context, emoticon)
      await emoticon.save()
    }))

    await this.insertLog(EmoticonActionType.DELETE, context, prev)
    return true
  }

  public static async fetch (context: Message | PartialMessage, name: string) {
    const match = await EmoticonModel.findOne({ name, removed: false }).exec()
    if (match) {
      await this.insertLog(EmoticonActionType.READ, context, match)
      return match.path
    }

    return undefined
  }

  public static async search (context: Message | PartialMessage, name: string) {
    const searched = _.uniq((await EmoticonModel.find({
      name: new RegExp(name),
      removed: false
    }).exec())).sort()

    await Promise.all(searched.map(search => {
      return this.insertLog(EmoticonActionType.SEARCH, context, search)
    }))

    return searched
  }

  public static async getEquivalents (name: string) {
    const emoticon = await EmoticonModel.findOne({ name, removed: false }).exec()
    return (!emoticon) ? undefined : emoticon.equivalents
  }

  public static async getEmoticonLists () {
    const result = await EmoticonNameModel.find({}).exec()
    return _.uniq(result.map(r => r.name))
  }
}
