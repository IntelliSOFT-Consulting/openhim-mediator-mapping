'use strict'

const tap = require('tap')
const ObjectId = require('mongoose').Types.ObjectId
const {DateTime} = require('luxon')

const db = require('../../src/db')

const {
  createEndpointState,
  readLatestEndpointStateById
} = require('../../src/db/services/states')
const StateModel = require('../../src/db/models/states')

db.open('mongodb://localhost:27017/unitTest')

tap.test('States DB Services', {autoend: true}, t => {
  t.beforeEach(async () => {
    await StateModel.deleteMany({})
    console.debug('Deleted all State resources in DB')
  })

  t.tearDown(async () => {
    await db.close()
    console.debug('Closed all connections to DB')
  })

  t.test('createEndpointState', {autoend: true}, async t => {
    t.test(
      'should fail to create State when validation fails - no endpointReference supplied',
      {autoend: true},
      async t => {
        t.plan(1)
        const stateObject = {
          _endpointReference: null,
          system: {
            timestamps: {
              endpointStart: DateTime.utc().toISO(),
              endpointEnd: DateTime.utc()
                .plus(50)
                .toISO(), // add 50 milliseconds
              endpointDuration: {
                milliseconds: 50
              }
            }
          }
        }
        await createEndpointState(stateObject)
          .then(data => {
            t.fail(`Should not reach here. ${data}`)
          })
          .catch(error => {
            t.equals(
              error.message,
              'state validation failed: _endpointReference: Path `_endpointReference` is required.'
            )
          })
      }
    )

    t.test(
      'should fail to create State when validation fails - default state system properties not supplied/invalid',
      {autoend: true},
      async t => {
        t.plan(1)
        const stateObject = {
          _endpointReference: new ObjectId('507f1f77bcf86cd799439011'),
          system: {
            timestamps: {
              endpointStart: 'Not a valid timestamp',
              endpointEnd: null,
              endpointDuration: {
                milliseconds: '50' // string not allowed
              }
            }
          }
        }
        await createEndpointState(stateObject)
          .then(data => {
            t.fail(`Should not reach here. ${data}`)
          })
          .catch(error => {
            t.equals(
              error.message,
              'state validation failed: system.timestamps.endpointStart: Path `system.timestamps.endpointStart` is invalid (Not a valid timestamp)., system.timestamps.endpointEnd: Path `system.timestamps.endpointEnd` is required.'
            )
          })
      }
    )

    t.test('should create State', {autoend: true}, async t => {
      t.plan(4)
      const endpointStart = DateTime.utc().toISO()
      const endpointEnd = DateTime.utc()
        .plus(50)
        .toISO()
      const endpointDurationMs = 50
      const stateObject = {
        _endpointReference: new ObjectId('507f1f77bcf86cd799439011'),
        system: {
          timestamps: {
            endpointStart,
            endpointEnd,
            endpointDuration: {
              milliseconds: endpointDurationMs
            }
          }
        }
      }
      await createEndpointState(stateObject)
        .then(data => {
          console.log(data.system.timestamps.endpointEnd)
          console.log(endpointEnd)
          t.deepEquals(
            data._endpointReference,
            new ObjectId('507f1f77bcf86cd799439011')
          )
          t.equals(data.system.timestamps.endpointStart, endpointStart)
          t.equals(data.system.timestamps.endpointEnd, endpointEnd)
          t.equals(
            data.system.timestamps.endpointDuration.milliseconds,
            endpointDurationMs
          )
        })
        .catch(error => {
          console.log(error)
          t.fail(`Should not reach here. ${error.message}`)
        })
    })
  })

  t.test('readLatestEndpointStateById', {autoend: true}, async t => {
    t.test(
      'should fail to read endpoint State when endpointId isnt an ObjectID',
      {autoend: true},
      async t => {
        t.plan(1)

        await readLatestEndpointStateById('InvalidObjectId')
          .then(data => {
            t.fail(`Should not reach here. ${data}`)
          })
          .catch(error => {
            t.equals(
              error.message,
              'Cast to ObjectId failed for value "InvalidObjectId" at path "_endpointReference" for model "state"'
            )
          })
      }
    )

    t.test(
      'should read last captured state for the supplied endpointId',
      {autoend: true},
      async t => {
        t.plan(8)

        const endpointId = new ObjectId('507f1f77bcf86cd799439011')

        await readLatestEndpointStateById(endpointId)
          .then(data => {
            t.notOk(data) // does not exist
          })
          .catch(error => {
            t.fail(`Should not reach here. ${error.message}`)
          })

        const endpointStart1 = DateTime.utc()
          .minus({minutes: 30})
          .toISO()
        const endpointEnd1 = DateTime.utc()
          .minus({minutes: 29, milliseconds: 500})
          .toISO()
        const endpointDurationMs1 = 500
        const stateObject1 = {
          _endpointReference: endpointId,
          system: {
            timestamps: {
              endpointStart: endpointStart1,
              endpointEnd: endpointEnd1,
              endpointDuration: {
                milliseconds: endpointDurationMs1
              }
            }
          }
        }
        // latest createdAt timestamp so this is the last captured state
        const endpointStart2 = DateTime.utc().toISO()
        const endpointEnd2 = DateTime.utc()
          .plus(50)
          .toISO()
        const endpointDurationMs2 = 50
        const stateObject2 = {
          _endpointReference: endpointId,
          system: {
            timestamps: {
              endpointStart: endpointStart2,
              endpointEnd: endpointEnd2,
              endpointDuration: {
                milliseconds: endpointDurationMs2
              }
            }
          }
        }

        //create first state record
        await createEndpointState(stateObject1)
          .then(data => {
            t.ok(data.id)
          })
          .catch(error => {
            t.fail(`Should not reach here. ${error.message}`)
          })
        // create latest state record
        await createEndpointState(stateObject2)
          .then(data => {
            t.ok(data.id)
          })
          .catch(error => {
            t.fail(`Should not reach here. ${error.message}`)
          })

        await readLatestEndpointStateById(endpointId)
          .then(data => {
            t.ok(data._id)
            t.deepEquals(data._endpointReference, endpointId)
            t.equals(data.system.timestamps.endpointStart, endpointStart2)
            t.equals(data.system.timestamps.endpointEnd, endpointEnd2)
            t.equals(
              data.system.timestamps.endpointDuration.milliseconds,
              endpointDurationMs2
            )
          })
          .catch(error => {
            t.fail(`Should not reach here. ${error.message}`)
          })
      }
    )
  })
})
