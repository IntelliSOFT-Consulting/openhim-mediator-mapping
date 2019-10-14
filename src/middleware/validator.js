'use strict'

const Ajv = require('ajv')
const logger = require('../logger')
const config = require('../config')

const configurations = config.getConfig()

const performValidation = (ctx, schema) => {
  if (!schema) {
    throw new Error(`No validation rules supplied`)
  }

  if (!ctx || !ctx.request || !ctx.request.body) {
    throw new Error(`Invalid request body`)
  }

  const ajv = new Ajv({
    nullable: configurations.nullable
  })
  const valid = ajv.validate(schema, ctx.request.body)

  if (!valid) {
    throw new Error(`Validation failed: ${ajv.errorsText()}`)
  }
}

exports.validateInput = schema => async (ctx, next) => {
  try {
    const schema = createValidationSchema(validationMap)
    performValidation(ctx, schema)
    logger.info('Successfully validated user input')
  } catch (error) {
    ctx.status = 400
    ctx.type = 'json'
    ctx.body = JSON.stringify({ error: error.message })
    return logger.error(error.message)
  }

  await next()
}

if (process.env.NODE_ENV == 'test') {
  exports.performValidation = performValidation
}
