'use strict'

const tap = require('tap')
const {createOrchestration} = require('../../src/orchestrations')

tap.test('createOrchestrations()', {autoend: true}, t => {
  t.test("should fail when request's timestamp is falsy", t => {
    t.plan(1)

    const request = {
      url: 'http://localhost',
      method: 'PUT',
      id: '1232'
    }
    const reqTimestamp = null
    const name = 'Test'

    try {
      createOrchestration(request, null, null, reqTimestamp, null, name)
    } catch (error) {
      t.equals(
        error.message,
        'Orchestration creation failed: required parameter not supplied'
      )
    }
  })

  t.test('should fail when orchestration name is not supplied', t => {
    t.plan(1)

    const request = {
      url: 'http://localhost',
      method: 'PUT',
      id: null
    }
    const reqTimestamp = Date.now()
    const name = null

    try {
      createOrchestration(request, null, null, reqTimestamp, null, null, name)
    } catch (error) {
      t.equals(
        error.message,
        'Orchestration creation failed: required parameter not supplied'
      )
    }
  })

  t.test('should create orchestration', t => {
    const headers = {'Content-Type': 'application/json'}
    const request = {
      url: 'http://localhost:8000/patient/?name=brainman',
      method: 'PUT',
      id: 'Patient',
      headers
    }
    const reqTimestamp = Date.now()

    const requestBody = {surname: 'raze'}
    const response = {
      body: {
        name: 'brainman',
        surname: 'raze'
      },
      status: 200,
      headers
    }
    const responseTimestamp = Date.now()
    const name = 'Test'

    const expectedOrch = {
      request: {
        host: 'localhost',
        port: '8000',
        path: '/patient/',
        timestamp: reqTimestamp,
        method: 'PUT',
        queryString: 'name=brainman',
        headers,
        body: requestBody
      },
      response: {
        timestamp: responseTimestamp,
        status: 200,
        headers: headers,
        body: {
          name: 'brainman',
          surname: 'raze'
        }
      },
      name
    }

    const orchestration = createOrchestration(
      request,
      requestBody,
      response,
      reqTimestamp,
      responseTimestamp,
      name,
      null
    )

    t.deepEqual(expectedOrch, orchestration)
    t.end()
  })
})
