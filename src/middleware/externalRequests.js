'use strict'

const axios = require('axios')
const {DateTime} = require('luxon')

const logger = require('../logger')

const {createOrchestration} = require('../orchestrations')
const {extractValueFromObject} = require('../util')

const validateRequestStatusCode = allowedStatuses => {
  const stringStatuses = allowedStatuses.map(status => {
    return String(status)
  })
  return status => {
    if (stringStatuses.includes(String(status))) {
      return true
    } else {
      for (let wildCardStatus of stringStatuses) {
        const validRange = wildCardStatus.match(/.+?(?=xx)/g)
        if (validRange && String(status).substring(0, 1) == validRange[0]) {
          return true
        }
      }
    }
    return false
  }
}

const performRequests = (requests, ctx) => {
  if (ctx && !ctx.orchestrations) {
    ctx.orchestrations = []
  }

  return requests.map(requestDetails => {
    const reqTimestamp = DateTime.utc().toISO()
    let responseTimestamp, orchestrationError, response

    // capture the lookup request start time
    ctx.state.allData.timestamps.lookupRequests[requestDetails.id] = {
      requestStart: reqTimestamp
    }

    // No body is sent out for now
    const body = null

    const requestParameters = addRequestQueryParameters(
      ctx,
      requestDetails.config
    )

    return axios(prepareRequestConfig(requestDetails, null, requestParameters))
      .then(res => {
        response = res
        response.body = res.data
        responseTimestamp = DateTime.utc().toISO()

        // capture the lookup request end time
        ctx.state.allData.timestamps.lookupRequests[
          requestDetails.id
        ].requestEnd = responseTimestamp
        ctx.state.allData.timestamps.lookupRequests[
          requestDetails.id
        ].requestDuration = DateTime.fromISO(responseTimestamp)
          .diff(
            DateTime.fromISO(
              ctx.state.allData.timestamps.lookupRequests[requestDetails.id]
                .requestStart
            )
          )
          .toObject()

        // Assign any data received from the response to the assigned id in the context
        return {[requestDetails.id]: res.data}
      })
      .catch(error => {
        orchestrationError = error
        logger.error(
          `Failed Request Config ${JSON.stringify(error.config, null, 2)}`
        )

        if (error.response) {
          ctx.statusCode = error.response.status
          throw new Error(
            `Incorrect status code ${error.response.status}. ${error.response.data.message}`
          )
        } else if (error.request) {
          throw new Error(
            `No response from lookup '${requestDetails.id}'. ${error.message}`
          )
        } else {
          ctx.statusCode = 500
          // Something happened in setting up the request that triggered an Error
          throw new Error(`Unhandled Error: ${error.message}`)
        }
      })
      .finally(() => {
        // For now these orchestrations are recorded when there are no failures
        if (
          ctx.request.header &&
          ctx.request.header['x-openhim-transactionid']
        ) {
          const orchestration = createOrchestration(
            requestDetails,
            body,
            response,
            reqTimestamp,
            responseTimestamp,
            requestDetails.id,
            orchestrationError,
            requestParameters
          )

          ctx.orchestrations.push(orchestration)
        }
      })
  })
}

const prepareLookupRequests = ctx => {
  const requests = Object.assign({}, ctx.state.metaData.requests)
  if (requests.lookup && requests.lookup.length > 0) {
    const responseData = performRequests(requests.lookup, ctx)

    return Promise.all(responseData)
      .then(data => {
        logger.info(
          `${ctx.state.metaData.name} (${ctx.state.uuid}): Successfully performed request/s`
        )
        // set the lookup payload as useable data point
        ctx.state.allData.lookupRequests = Object.assign({}, ...data)
      })
      .catch(error => {
        throw new Error(`Rejected Promise: ${error}`)
      })
  }
  logger.debug(
    `${ctx.state.metaData.name} (${ctx.state.uuid}): No request/s to make`
  )
}

const prepareRequestConfig = (
  requestDetails,
  requestBody,
  requestQueryParams
) => {
  const body = {}

  if (requestBody) {
    body.data = requestBody
  }

  if (requestQueryParams) {
    body.params = requestQueryParams
  }

  const requestOptions = Object.assign({}, requestDetails.config, body)
  // This step is separated out as in future the URL contained within the config
  // can be manipulated to add URL parameters taken from the body of an incoming request
  if (
    requestDetails.allowedStatuses &&
    requestDetails.allowedStatuses.length > 0
  ) {
    requestOptions.validateStatus = validateRequestStatusCode(
      requestDetails.allowedStatuses
    )
  }
  return requestOptions
}

// For now only json data is processed
const prepareResponseRequests = async ctx => {
  const requests = ctx.state.metaData.requests

  // Send request downstream only when mapping has been successful
  if (ctx && ctx.status === 200) {
    if (
      requests &&
      Array.isArray(requests.response) &&
      requests.response.length
    ) {
      //Create orchestrations
      if (!ctx.orchestrations) {
        ctx.orchestrations = []
      }

      /*
        Set the response request to be the primary
        if there is only one response request
      */
      if (requests.response.length === 1) {
        requests.response[0].primary = true
      }

      // Empty the koa response body. It contains the mapped data that is to be sent out
      const body = ctx.body
      ctx.body = {}

      const promises = requests.response.map(request => {
        if (
          request &&
          request.config &&
          request.config.url &&
          request.config.method &&
          request.id
        ) {
          const params = addRequestQueryParameters(ctx, request.config)

          const axiosConfig = prepareRequestConfig(request, body, params)

          return sendMappedObject(ctx, axiosConfig, request, body, params)
        }
      })

      await Promise.all(promises)
        .then(() => {
          logger.info(
            `${ctx.state.metaData.name} (${ctx.state.uuid}): Mapped object successfully orchestrated`
          )
        })
        .catch(error => {
          logger.error(
            `${ctx.state.metaData.name} (${ctx.state.uuid}): Mapped object orchestration failure: ${error.message}`
          )
        })
    }
  }
}

/*
  Function that handles request errors.
  It also sets the status code and flags which are used to determine the status Text for the response.
  The function also sets the koa response
*/
const handleRequestError = (ctx, request, requestError) => {
  let response, error

  if (!ctx.routerResponseStatuses) {
    ctx.routerResponseStatuses = []
  }

  if (requestError.response) {
    response = requestError.response

    // Axios response has the data property not the body
    response.body = response.data

    if (response.status >= 500) {
      if (request.primary) {
        setKoaResponseBodyFromPrimary(ctx, response.data)

        ctx.routerResponseStatuses.push('primaryReqFailError')
        ctx.status = response.status
      } else {
        ctx.routerResponseStatuses.push('secondaryFailError')

        setKoaResponseBody(ctx, request, response.data)
      }
    } else {
      if (request.primary) {
        setKoaResponseBodyFromPrimary(ctx, response.data)

        ctx.routerResponseStatuses.push('primaryCompleted')
        ctx.status = response.status
      } else {
        ctx.routerResponseStatuses.push('secondaryCompleted')

        setKoaResponseBody(ctx, request, response.data)
      }
    }
  } else {
    if (request.primary) {
      setKoaResponseBodyFromPrimary(ctx, requestError.message)

      ctx.routerResponseStatuses.push('primaryReqFailError')
      ctx.status = 500
    } else {
      ctx.routerResponseStatuses.push('secondaryFailError')

      setKoaResponseBody(ctx, request, requestError.message)
    }
    error = {message: requestError.message}
  }

  return {response, error}
}

// Sets the koa response body from the primary request's response body
const setKoaResponseBodyFromPrimary = (ctx, body) => {
  ctx.hasPrimaryRequest = true
  ctx.body = {}
  ctx.body = body
}

// Sets the koa response body if there is no primary request
const setKoaResponseBody = (ctx, request, body) => {
  if (!ctx.hasPrimaryRequest) {
    ctx.body[request.id] = body
  }
}

const sendMappedObject = (
  ctx,
  axiosConfig,
  request,
  body,
  requestParameters
) => {
  const reqTimestamp = DateTime.utc().toISO()
  let response, orchestrationError, responseTimestamp

  // capture the lookup request start time
  ctx.state.allData.timestamps.lookupRequests[request.id] = {
    requestStart: reqTimestamp
  }

  return axios(axiosConfig)
    .then(resp => {
      response = resp
      response.body = resp.data
      responseTimestamp = DateTime.utc().toISO()

      // capture the lookup request end time
      ctx.state.allData.timestamps.lookupRequests[
        request.id
      ].requestEnd = responseTimestamp
      ctx.state.allData.timestamps.lookupRequests[
        request.id
      ].requestDuration = DateTime.fromISO(responseTimestamp)
        .diff(
          DateTime.fromISO(
            ctx.state.allData.timestamps.lookupRequests[request.id].requestStart
          )
        )
        .toObject()

      if (request.primary) {
        setKoaResponseBodyFromPrimary(ctx, response.body)

        ctx.status = response.status
      } else {
        setKoaResponseBody(ctx, request, response.body)
      }
    })
    .catch(error => {
      responseTimestamp = DateTime.utc().toISO()

      const result = handleRequestError(ctx, request, error)
      response = result.response
      orchestrationError = result.error
    })
    .finally(() => {
      if (ctx.request.header && ctx.request.header['x-openhim-transactionid']) {
        const orchestration = createOrchestration(
          request,
          body,
          response,
          reqTimestamp,
          responseTimestamp,
          request.id,
          orchestrationError,
          requestParameters
        )

        ctx.orchestrations.push(orchestration)
      }
    })
}

const addRequestQueryParameters = (ctx, request) => {
  const requestQueryParams = {}

  if (request.params) {
    Object.keys(request.params).forEach(param => {
      let parameterValue
      const queryParam = request.params[`${param}`]
      const fullPath = queryParam.path

      // remove first index as this defines the type of param to extract
      const extractType = fullPath.split('.')[0]

      // remove the extractType property from path
      const path = fullPath.replace(`${extractType}.`, '')

      switch (extractType) {
        case 'payload':
          parameterValue = extractValueFromObject(ctx.request.body, path)
          break
        case 'query':
          parameterValue = extractValueFromObject(ctx.request.query, path)
          break
        case 'state':
          parameterValue = extractValueFromObject(ctx.state.allData.state, path)
          break
        case 'lookupRequests':
          parameterValue = extractValueFromObject(
            ctx.state.allData.lookupRequests,
            path
          )
          break
        case 'responseBody':
          parameterValue = extractValueFromObject(
            ctx.state.allData.responseBody,
            path
          )
          break
        default:
          ctx.statusCode = 500
          throw new Error(
            `Unsupported Query Parameter Extract Type: ${extractType}`
          )
      }

      if (parameterValue) {
        const prefix = request.params[`${param}`].prefix
          ? request.params[`${param}`].prefix
          : ''
        const postfix = request.params[`${param}`].postfix
          ? request.params[`${param}`].postfix
          : ''
        requestQueryParams[`${param}`] = `${prefix}${parameterValue}${postfix}`
      }
    })
  }

  return requestQueryParams
}

exports.requestsMiddleware = () => async (ctx, next) => {
  await prepareLookupRequests(ctx)
  await next()
  await prepareResponseRequests(ctx)
}
