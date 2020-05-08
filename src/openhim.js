'use strict'

const fs = require('fs')
const path = require('path')

const logger = require('./logger')
const config = require('./config')

const mediatorUtils = require('openhim-mediator-utils')

let mediatorConfigJson, readError

try {
  const mediatorConfigFile = fs.readFileSync(
    path.resolve(__dirname, '..', 'mediatorConfig.json')
  )
  mediatorConfigJson = JSON.parse(mediatorConfigFile)
} catch (err) {
  readError = err.message
  logger.error(`Mediator config file could not be retrieved: ${err.message}`)
}

const configOptions = config.getConfig()
const openhimConfig = Object.assign(
  {urn: mediatorConfigJson.urn},
  configOptions.openhim
)

const mediatorSetup = () => {
  mediatorUtils.registerMediator(openhimConfig, mediatorConfigJson, error => {
    if (error) {
      logger.error(`Failed to register mediator. Caused by: ${error.message}`)
      throw error
    }

    logger.info('Successfully registered mediator!')

    const emitter = mediatorUtils.activateHeartbeat(openhimConfig)

    emitter.on('error', openhimError => {
      logger.error('Heartbeat failed: ', openhimError)
    })
  })
}

exports.constructOpenhimResponse = (ctx, responseTimestamp) => {
  const response = ctx.response
  const orchestrations = ctx.orchestrations
  const statusText = ctx.statusText
  const respObject = {}

  if (response) {
    if (response.headers) {
      respObject.headers = response.headers
    }
    if (response.status) {
      respObject.status = response.status
    }
    if (response.body) {
      respObject.body =
        typeof response.body === 'string'
          ? response.body
          : JSON.stringify(response.body)
    }
    if (response.timestamp) {
      respObject.timestamp = response.timestamp
    } else if (responseTimestamp) {
      respObject.timestamp = responseTimestamp
    }
  }

  if (readError) {
    mediatorConfigJson = {
      urn: 'undefined'
    }
  }

  const body = {
    'x-mediator-urn': mediatorConfigJson.urn,
    status: statusText,
    response: respObject,
    orchestrations: orchestrations
  }

  ctx.body = JSON.stringify(body)
}

exports.mediatorSetup = mediatorSetup
