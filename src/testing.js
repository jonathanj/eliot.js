import assert from 'assert'
import {List} from 'immutable'

import {ACTION_STATUS_FIELD,
        ACTION_TYPE_FIELD,
        STARTED_STATUS,
        FAILED_STATUS,
        SUCCEEDED_STATUS} from './action'
import {TASK_UUID_FIELD,
        TASK_LEVEL_FIELD,
        MESSAGE_TYPE_FIELD} from './message'
import * as _output from './output'
import {MemoryLogger} from './output'


const COMPLETED_STATUSES = [FAILED_STATUS, SUCCEEDED_STATUS]


/**
 * Assert that a message dictionary contains a subset of fields.
 *
 * @param {MessageDictionary} message Message to be checked.
 * @param {MessageDictionary} fields Subset of fields that are expected to match.
 */
export function assertContainsFields(message, fields) {
    const subset = {}
    for (const key of Object.keys(message)) {
        if (fields[key] !== undefined) {
            subset[key] = message[key]
        }
    }
    assert.deepEqual(subset, fields)
}


/**
 * An action whose start and finish messages have been logged.
 */
export class LoggedAction {
    /**
     * Create a `LoggedAction` from a task UUID, task level and an array of
     * message dictionaries.
     *
     * @param {string} uuid Task UUID.
     * @param {string} level Task level of the start message.
     * @param {MessageDictionary[]} messages Message dictionaries.
     * @throws {Error} If either the start or end message could not be found.
     * @return {LoggedAction} Logged action constructed from the start and
     * finish messages for the specific action.
     */
    static fromMessages(uuid, level, messages) {
        let startMessage = null,
            endMessage = null,
            children = [],
            levelPrefix = List(level).slice(0, -1),
            directChild = lvl => (lvl.size === levelPrefix.size + 2 &&
                                  lvl.slice(0, -2).equals(levelPrefix) &&
                                  lvl.last() === 1)
        for (const message of messages) {
            if (message[TASK_UUID_FIELD] !== uuid) {
                continue
            }
            const messageLevel = List(message[TASK_LEVEL_FIELD])
            if (messageLevel.slice(0, -1).equals(levelPrefix)) {
                const status = message[ACTION_STATUS_FIELD]
                if (status === STARTED_STATUS) {
                    startMessage = message
                } else if (COMPLETED_STATUSES.indexOf(status) !== -1) {
                    endMessage = message
                } else {
                    children.push(new LoggedMessage(message))
                }
            } else if (directChild(messageLevel)) {
                children.push(
                    LoggedAction.fromMessages(uuid, messageLevel, messages))
            }
        }

        if (startMessage === null || endMessage === null) {
            throw new Error([uuid, level])
        }
        return new LoggedAction(startMessage, endMessage, children)
    }

    /**
     * Find all `LoggedAction`s of the specified type.
     *
     * @param {MessageDictionary[]} messages Message dictionaries.
     * @param {string} actionType Action type name.
     * @return {LoggedAction[]} Array of logged actions for the specified type.
     */
    static ofType(messages, actionType) {
        const result = []
        for (const message of messages) {
            if (message[ACTION_TYPE_FIELD] === actionType.actionType &&
                message[ACTION_STATUS_FIELD] === STARTED_STATUS) {
                result.push(LoggedAction.fromMessages(
                    message[TASK_UUID_FIELD],
                    message[TASK_LEVEL_FIELD],
                    messages))
            }
        }
        return result
    }

    constructor(startMessage, endMessage, children) {
        /**
         * Start message contents.
         * @type {MessageDictionary}
         */
        this.startMessage = startMessage
        /**
         * End message contents.
         * @type {MessageDictionary}
         */
        this.endMessage = endMessage
        /**
         * Direct children.
         * @type {LoggedMessage[]}
         */
        this.children = children
    }

    // XXX: Maybe we can make this a generator?
    /**
     * Find all descendant `LoggedAction` or `LoggedMessage` of this logged
     * action.
     *
     * @return {LoggedAction[]|LoggedMessage[]} All descendent logged actions
     * or messages.
     */
    descendants() {
        const result = []
        for (const child of this.children) {
            result.push(child)
            if (child instanceof LoggedAction) {
                for (const descendant of child.descendants()) {
                    result.push(descendant)
                }
            }
        }
        return result
    }

    /**
     * Did this action succeed?
     *
     * @return {boolean} Did this action succeed?
     */
    succeeded() {
        return this.endMessage[ACTION_STATUS_FIELD] === SUCCEEDED_STATUS
    }
}


/**
 * A message that has been logged.
 */
export class LoggedMessage {
    /**
     * Find all `LoggedMessage`s of a type.
     *
     * @param {MessageDictionary[]} messages Array of messages.
     * @param {string} messageType Message type name.
     * @return {LoggedMessage[]} Logged messages for the specified type.
     */
    static ofType(messages, messageType) {
        const result = []
        for (const message of messages) {
            if (message[MESSAGE_TYPE_FIELD] === messageType.messageType) {
                result.push(new LoggedMessage(message))
            }
        }
        return result
    }

    constructor(message) {
        /**
         * Message contents.
         * @type {MessageDictionary}
         */
        this.message = message
    }
}


/**
 * Decorator for test methods to add logging and validation.
 *
 * The decorated function gets a `logger` argument before any other arguments.
 * All messages logged to the logger will be validated at the end of the test.
 * Any unflushed logged tracebacks will cause the test to fail.
 *
 * @example
 * describe('foo', function() {
 *   it('logs something', captureLogging(this)(function (logger) {
 *     foo()
 *     assertHasAction(logger, LOG_FOO, {
 *       succeeded: true,
 *       startFields: {bar: 'some value'},
 *       endFields: {quux: 'some other value'}})
 *   }))
 * })
 *
 * @param {*} self `this` from the test framework, this is preserved when
 * calling the decorated function so any test framework features are still
 * available.
 * @param {function(logger: MemoryLogger, ...args: *)} [assertion] Function to be
 * called at the end of the test to make assertions about the logged messages.
 * @param {...*} assertionArgs Additional arguments to pass to `assertion`.
 * @return {function} Wrapper function to be invoked with the user's test
 * function.
 */
export function captureLogging(self, assertion=null, ...assertionArgs) {
    return function(f) {
        return function(...args) {
            const logger = new MemoryLogger(),
                  oldLogger = _output._DEFAULT_LOGGER
            try {
                _output._DEFAULT_LOGGER = logger
                return f.call(self, logger, ...args)
            } finally {
                _output._DEFAULT_LOGGER = oldLogger
                logger.validate()
                if (assertion !== null) {
                    assertion.call(self, logger, ...assertionArgs)
                }
                if (logger.tracebackMessages.length > 0) {
                    assert.fail(
                        logger.tracebackMessages, [], 'Unflushed tracebacks')
                }
            }
        }
    }
}


/**
 * Assert that a logger has a message of a specific type and that the first
 * message has matching fields.
 *
 * @param {Logger|MemoryLogger} logger Logger to check for messages.
 * @param {MessageType} messageType Message type to find.
 * @param {MessageDictionary} [fields={}] Fields that must match a subset of
 * those found in the first matching message.
 * @return {LoggedMessage} The first matching logged message.
 */
export function assertHasMessage(logger, messageType, fields={}) {
    const messages = LoggedMessage.ofType(logger.messages, messageType)
    assert.ok(
        messages.length > 0, `No messages of type ${messageType.messageType}`)
    const loggedMessage = messages[0]
    assertContainsFields(loggedMessage.message, fields)
    return loggedMessage
}


/**
 * Assert that a logger has an action of a specific type and that the first
 * action has matching start and end fields.
 *
 * @param {Logger|MemoryLogger} logger Logger to check for actions.
 * @param {ActionType} actionType Action type to find.
 * @param {object<string,*>} opt Assertion options
 * @param {boolean} [opt.succeeded=true] Expected success status of the action.
 * @param {MessageDictionary} [opt.startFields={}] Fields that must match a
 * subset of those found in the start message of the first matching action.
 * @param {MessageDictionary} [opt.endFields={}] Fields that must match a subset
 * of those found in the end message of the first matching action.
 * @return {LoggedAction} The first matching logged message.
 */
export function assertHasAction(logger, actionType, {succeeded=true,
                                                     startFields={},
                                                     endFields={}}) {
    const actions = LoggedAction.ofType(logger.messages, actionType)
    assert.ok(
        actions.length > 0, `No actions of type ${actionType.actionType}`)
    const loggedAction = actions[0]
    assert.strictEqual(loggedAction.succeeded(), succeeded)
    assertContainsFields(loggedAction.startMessage, startFields)
    assertContainsFields(loggedAction.endMessage, endFields)
    return loggedAction
}
