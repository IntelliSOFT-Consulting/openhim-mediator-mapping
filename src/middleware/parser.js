'use strict'

const xml2js = require('xml2js')
const KoaBodyParser = require('@viweei/koa-body-parser')

const logger = require('../logger')
const {ALLOWED_CONTENT_TYPES} = require('../constants')
const config = require('../config').getConfig()

const xmlBuilder = new xml2js.Builder()

const parseOutgoingBody = (ctx, outputFormat) => {
  if (outputFormat === 'XML') {
    try {
      logger.info(`Parsing outgoing body in ${outputFormat} format`)
      ctx.body = xmlBuilder.buildObject(ctx.body)
      ctx.set('Content-Type', 'application/xml')
    } catch (error) {
      throw new Error(`Parsing outgoing body failed: ${error.message}`)
    }
  }
}

const parseIncomingBody = async (ctx, inputFormat, next) => {
  // parse incoming body
  // KoaBodyParser executed the next() callback to allow the other middleware to continue before coming back here
  if (ALLOWED_CONTENT_TYPES.includes(inputFormat)) {
    // check content-type matches inputForm specified
    if (!ctx.get('Content-Type').includes(inputFormat.toLowerCase())) {
      throw new Error(
        `Supplied input format does not match incoming content-type: Expected ${inputFormat.toLowerCase()} format, but received ${
          ctx.get('Content-Type').split('/')[1]
        }`
      )
    }

    const options = {
      limit: config.parser.limit,
      xmlOptions: {
        trim: config.parser.xmlOptions.trim == 'true',
        explicitRoot: config.parser.xmlOptions.explicitRoot == 'true',
        explicitArray: config.parser.xmlOptions.explicitArray == 'true'
      }
    }

    try {
      logger.info(`Parsing incoming body into JSON format for processing`)
      await KoaBodyParser(options)(ctx, next)
    } catch (error) {
      throw new Error(`Parsing incoming body failed: ${error.message}`)
    }
  } else {
    throw new Error(`transformation method "${inputFormat}" not yet supported`)
  }
}

exports.parseBodyMiddleware = metaData => async (ctx, next) => {
  const incomingContentType = ctx
    .get('Content-Type')
    .split('/')[1]
    .toUpperCase()
  const outputContentType = metaData.transformation.output.toUpperCase()
  try {
    // parse incoming body
    await parseIncomingBody(ctx, incomingContentType, next)

    // wait for middleware to bubble up before running the below method

    // parse outgoing body
    parseOutgoingBody(ctx, outputContentType)
  } catch (error) {
    ctx.status = 400
    if (outputContentType === 'XML') {
      ctx.body = xmlBuilder.buildObject({error: error.message})
    } else {
      ctx.body = {error: error.message}
    }
    ctx.set('Content-Type', 'application/' + outputContentType.toLowerCase())
    return logger.error(error.message)
  }
}