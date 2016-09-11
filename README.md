# eliot.js

An [Eliot](https://github.com/ClusterHQ/eliot) port for Javascript.

Eliot is a logging system that outputs causal chains of actions happening within
and across application boundaries: a logical trace of a system's operation.


## Installation

```shell
$ npm install eliot
```

## Usage

```es6
const {withAction, ActionType, fields, addDestination} = require('eliot'),
      messages = [],
      removeDestination = addDestination(x => messages.push(x))

const LOG_DOSOMETHING = ActionType(
  'app:system:dosomething',
  fields({key: 'number'}),
  fields({result: 'string'}),
  'Do something with a key, resulting in a value')
  
function doSomething(key) {
  withAction(LOG_DOSOMETHING({key}), action => {
    const result = doTheThing(key)
    action.addSuccessFields({result})
    return result
  })
}

removeDestination()
```

Which would result in `messages` being populated with:

```json
[ { "key": 999,
    "action_status": "started",
    "task_uuid": "eabe6f5a-f677-439d-aea7-659e2dab6efc",
    "action_type": "app:system:dosomething",
    "timestamp": 1473622530.867,
    "task_level": [ 1 ] },
  { "result": 42,
    "action_status": "succeeded",
    "task_uuid": "eabe6f5a-f677-439d-aea7-659e2dab6efc",
    "action_type": "app:system:dosomething",
    "timestamp": 1473622530.867,
    "task_level": [ 2 ] } ]
```
