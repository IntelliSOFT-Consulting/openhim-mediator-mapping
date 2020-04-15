'use strict'

const cors = require('@koa/cors')
const koa = require('koa')
const koaRouter = require('koa-router')
const route = require('koa-route')
const websockify = require('koa-websocket')

const config = require('./config').getConfig()
const db = require('./db')
const logger = require('./logger')
const openhim = require('./openhim')

const {createAPIRoutes} = require('./endpointRoutes')
const {createMiddlewareRoute} = require('./routes')
const {createWsStates} = require('./wsRoutes')

const app = websockify(new koa())
const router = new koaRouter()

createAPIRoutes(router)
createMiddlewareRoute(router)

app.use(cors());

app.use(router.routes()).use(router.allowedMethods())

app.ws.use(createWsStates(route))

if (!module.parent) {
  db.open(config.mongoUrl)

  app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}...`)

    if (config.openhim.register) {
      openhim.mediatorSetup()
    }
  })
}

if (process.env.NODE_ENV === 'test') {
  module.exports = app
}
