const {
    Action,
    startAction,
    startTask,
    withAction
} = require('./lib/action')

const {
    currentAction
} = require('./lib/context')

const {
    Message
} = require('./lib/message')

const {
    addDestination,
    Logger,
    MemoryLogger
} = require('./lib/output')

const {
    writeTraceback
} = require('./lib/traceback')

const {
    ActionType,
    BoundField,
    Field,
    fields,
    ValidationError
} = require('./lib/validation')

const {
    assertContainsFields,
    assertHasAction,
    assertHasMessage,
    captureLogging,
    LoggedAction,
    LoggedMessage
} = require('./lib/testing')

const testing = {
    assertContainsFields,
    assertHasAction,
    assertHasMessage,
    captureLogging,
    LoggedAction,
    LoggedMessage
}

module.exports = {
    Action,
    startAction,
    startTask,
    withAction,

    currentAction,

    Message,

    addDestination,
    Logger,
    MemoryLogger,

    writeTraceback,

    ActionType,
    BoundField,
    Field,
    fields,
    ValidationError,

    testing
}
