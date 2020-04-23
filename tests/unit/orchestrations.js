'use strict'

const tap = require('tap')

const {createOrchestration, setStatusText} = require('../../src/orchestrations')

tap.test('createOrchestrations()', {autoend: true}, t => {
  t.test("should fail when request's timestamp is falsy", t => {
    t.plan(1)

    const request = {
      config: {
        url: 'http://localhost',
        method: 'PUT'
      },
      id: '1232'
    }
    const reqTimestamp = null
    const name = 'Test'

    try {
      createOrchestration(request, null, null, reqTimestamp, null, name)
    } catch (error) {
      t.equals(
        error.message,
        'Orchestration creation failed: required parameter not supplied - reqTimestamp | orchestrationName'
      )
    }
  })

  t.test('should fail when orchestration name is not supplied', t => {
    t.plan(1)

    const request = {
      config: {
        url: 'http://localhost',
        method: 'PUT'
      },
      id: null
    }
    const reqTimestamp = Date.now()
    const name = null

    try {
      createOrchestration(request, null, null, reqTimestamp, null, null, name)
    } catch (error) {
      t.equals(
        error.message,
        'Orchestration creation failed: required parameter not supplied - reqTimestamp | orchestrationName'
      )
    }
  })

  t.test('should create orchestration', t => {
    const headers = {'Content-Type': 'application/json'}
    const request = {
      config: {
        url: 'http://localhost:8000/patient/?name=brainman',
        method: 'PUT'
      },
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
    const requestParams = {
      id: '1233'
    }

    const expectedOrch = {
      request: {
        host: 'localhost',
        port: 8000,
        path: '/patient/',
        timestamp: reqTimestamp,
        method: 'PUT',
        queryString: 'name=brainman&id=1233',
        headers,
        body: JSON.stringify(requestBody)
      },
      response: {
        timestamp: responseTimestamp,
        status: 200,
        headers: headers,
        body: JSON.stringify({
          name: 'brainman',
          surname: 'raze'
        })
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
      null,
      requestParams
    )

    t.deepEqual(expectedOrch, orchestration)
    t.end()
  })

  t.test('setStatusText()', {autoend: true}, t => {
    t.test('should set the status to Failed', t => {
      const ctx = {
        routerResponseStatuses: ['primaryReqFailError']
      }

      setStatusText(ctx)

      t.equals(ctx.statusText, 'Failed')
      t.end()
    })

    t.test('should set the status to Completed with error(s)', t => {
      const ctx = {
        routerResponseStatuses: ['secondaryFailError']
      }

      setStatusText(ctx)

      t.equals(ctx.statusText, 'Completed with error(s)')
      t.end()
    })

    t.test('should set the status to Completed (from primaryCompleted)', t => {
      const ctx = {
        routerResponseStatuses: ['primaryCompleted']
      }

      setStatusText(ctx)

      t.equals(ctx.statusText, 'Completed')
      t.end()
    })

    t.test(
      'should set the status to Completed (from secondaryCompleted)',
      t => {
        const ctx = {
          routerResponseStatuses: ['secondaryCompleted']
        }

        setStatusText(ctx)

        t.equals(ctx.statusText, 'Completed')
        t.end()
      }
    )

    t.test('should set the status to Successful', t => {
      const ctx = {}

      setStatusText(ctx)

      t.equals(ctx.statusText, 'Successful')
      t.end()
    })
  })
})
