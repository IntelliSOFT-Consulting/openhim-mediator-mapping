'use strict'

const axios = require('axios')

const logger = require('../logger')

function performRequests(requests) {
  console.log('Should not get in')
  return requests.map(requestDetails => {
    return axios(prepareRequestConfig(requestDetails))
      .then(res => {
        // Assign any data received from the response to the assigned id in the context
        return {[requestDetails.id]: res.data}
      })
      .catch(error => {
        logger.error(
          `Failed Request Config ${JSON.stringify(error.config, null, 2)}`
        )
        if (error.response) {
          throw new Error(
            `Incorrect status code ${error.response.status}. ${error.response.data.message}`
          )
        } else if (error.request) {
          throw new Error(
            `No response from lookup '${requestDetails.id}'. ${error.request}`
          )
        } else {
          // Something happened in setting up the request that triggered an Error
          throw new Error(`Unhandled Error: ${error.message}`)
        }
      })
  })
}

function prepareLookupRequests(ctx) {
  const requests = Object.assign({}, ctx.state.metaData.requests)
  if (requests && requests.lookup && requests.lookup.length > 0) {
    const responseData = this.performRequests(requests.lookup)

    return Promise.all(responseData)
      .then(data => {
        logger.info(
          `${ctx.state.metaData.name} (${ctx.state.uuid}): Successfully performed request/s`
        )
        ctx.lookupRequests = Object.assign({}, ...data)
      })
      .catch(err => {
        throw new Error(`Rejected Promise: ${err}`)
      })
  } else {
    logger.debug(
      `${ctx.state.metaData.name} (${ctx.state.uuid}): No request/s to make`
    )
  }
}

const prepareRequestConfig = requestDetails => {
  const requestOptions = Object.assign({}, requestDetails.config)
  // This step is separated out as in future the URL contained within the config
  // can be manipulated to add URL parameters taken from the body of an incoming request
  return requestOptions
}

exports.requestsMiddleware = () => async (ctx, next) => {
  await this.prepareLookupRequests(ctx)
  await next()
}

if (process.env.NODE_ENV == 'test') {
  exports.prepareRequestConfig = prepareRequestConfig
  exports.prepareLookupRequests = prepareLookupRequests
  exports.performRequests = performRequests
}
