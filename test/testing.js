import {assert} from 'chai'

import {startAction, withAction} from '../src/action'
import {Message} from '../src/message'
import {addDestination, MemoryLogger} from '../src/output'
import {LoggedAction,
        LoggedMessage,
        assertContainsFields,
        assertHasAction,
        assertHasMessage,
        captureLogging} from '../src/testing'
import {writeTraceback} from '../src/traceback'
import {ActionType,
        MessageType,
        BoundField,
        ValidationError} from '../src/validation'


/** @test {LoggedAction} */
describe('LoggedAction', function() {
    it('constructor stores messages', function() {
        const d1 = {x: 1},
              d2 = {y: 2},
              root = new LoggedAction(d1, d2, [])
        assert.deepEqual(root.startMessage, d1)
        assert.deepEqual(root.endMessage, d2)
    })

    const fromMessagesIndex = (messages, index) => {
        return LoggedAction.fromMessages(
            messages[index].task_uuid,
            messages[index].task_level,
            messages)
    }

    describe('.fromMessages', function() {
        /** @test {LoggedAction.fromMessages} */
        it('creates a LoggedAction', function() {
            const logger = new MemoryLogger()
            withAction(startAction(logger, 'test'), action => {})
            assert.strictEqual(
                fromMessagesIndex(logger.messages, 0) instanceof LoggedAction,
                true)
        })

        /** @test {LoggedAction.fromMessages} */
        it('finds the start and successul finish messages', function() {
            const logger = new MemoryLogger()
            Message.create({x: 1}).write(logger)
            withAction(startAction(logger, 'test'), action => {
                Message.create({x: 1}).write(logger)
            })
            const logged = fromMessagesIndex(logger.messages, 1)
            assert.deepEqual(logged.startMessage, logger.messages[1])
            assert.deepEqual(logged.endMessage, logger.messages[3])
        })

        /** @test {LoggedAction.fromMessages} */
        it('finds the start and successful finish messages even if there is an error', function() {
            const logger = new MemoryLogger()
            withAction(startAction(logger, 'test'), action => {
                try {
                    throw new Error('Nope')
                } catch (_) {
                    // Pass
                }
            })
            const logged = fromMessagesIndex(logger.messages, 0)
            assert.deepEqual(logged.startMessage, logger.messages[0])
            assert.deepEqual(logged.endMessage, logger.messages[1])
        })

        /** @test {LoggedAction.fromMessages} */
        it('throws if the start message is not found', function() {
            const logger = new MemoryLogger()
            withAction(startAction(logger, 'test'), action => {})
            assert.throws(
                () => fromMessagesIndex(logger.messages.slice(1), 0),
                Error)
        })

        /** @test {LoggedAction.fromMessages} */
        it('throws if the end message is not found', function() {
            const logger = new MemoryLogger()
            withAction(startAction(logger, 'test'), action => {})
            assert.throws(
                () => fromMessagesIndex(logger.messages.slice(0, 1), 0),
                Error)
        })

        /** @test {LoggedAction.fromMessages} */
        it('adds direct child messages', function() {
            const logger = new MemoryLogger
            // Index 0
            Message.create({x: 1}).write(logger)
            // Index 1: Start action
            withAction(startAction(logger, 'test'), action => {
                // Index 2
                Message.create({x: 2}).write(logger)
                // Index 3
                Message.create({x: 3}).write(logger)
            })  // Index 4: End action
            // Index 5
            Message.create({x: 4}).write(logger)
            const logged = fromMessagesIndex(logger.messages, 1)
            assert.deepEqual(
                logged.children,
                [new LoggedMessage(logger.messages[2]),
                 new LoggedMessage(logger.messages[3])])
        })

        /** @test {LoggedAction.fromMessages} */
        it('recursively adds direct child actions', function() {
            const logger = new MemoryLogger
            // Index 0: Start action
            withAction(startAction(logger, 'test'), action => {
                // Index 1: Nested start action
                withAction(startAction(logger, 'test'), action => {
                    // Index 2
                    Message.create({x: 2}).write(logger)
                })
            })  // Index 3: End action
            const logged = fromMessagesIndex(logger.messages, 0)
            assert.deepEqual(
                logged.children[0],
                fromMessagesIndex(logger.messages, 1))
        })
    })

    describe('.ofType', function() {
        /** @test {LoggedAction.ofType} */
        it('returns an Array of logged actions for an action type', function() {
            const ACTION = ActionType('myaction', [], [], 'An action'),
                  logger = new MemoryLogger()
            // Index 0: Start action
            withAction(startAction(logger, 'test'), action => {
                // Index 1: Nested start action
                withAction(ACTION({}, logger), action => {
                    // Index 2
                    Message.create({x: 2}).write(logger)
                })  // Index 3: End action
            })  // Index 4: End action
            // Index 5
            withAction(ACTION({}, logger), action => {
            })  // Index 6: End action
            const logged = LoggedAction.ofType(logger.messages, ACTION)
            assert.deepEqual(
                logged,
                [fromMessagesIndex(logger.messages, 1),
                 fromMessagesIndex(logger.messages, 5)])
        })

        /** @test {LoggedAction.ofType} */
        it('returns an empty array when the action type is not found', function() {
            const ACTION = ActionType('myaction', [], [], 'An action'),
                  logger = new MemoryLogger()
            assert.deepEqual(
                LoggedAction.ofType(logger.messages, ACTION),
                [])
        })
    })

    describe('#descendants', function() {
        /** @test {LoggedAction#descendants} */
        it('returns all descendants of a LoggedAction', function() {
            const ACTION = ActionType('myaction', [], [], 'An action'),
                logger = new MemoryLogger()
            // Index 0: Start action
            withAction(ACTION({}, logger), action => {
                // Index 1: Nested start action
                withAction(startAction(logger, 'test'), action => {
                    // Index 2
                    Message.create({x: 2}).write(logger)
                })  // Index 3: End action
                // Index 4
                Message.create({x: 2}).write(logger)
            })  // Index 5: End action
            const loggedAction = LoggedAction.ofType(logger.messages, ACTION)[0]
            assert.deepEqual(
                loggedAction.descendants(),
                [fromMessagesIndex(logger.messages, 1),
                new LoggedMessage(logger.messages[2]),
                new LoggedMessage(logger.messages[4])])
        })
    })

    describe('#succeeded', function() {
        /** @test {LoggedAction#succeeded} */
        it('did', function() {
            const logger = new MemoryLogger()
            withAction(startAction(logger, 'test'), action => {})
            assert.strictEqual(
                fromMessagesIndex(logger.messages, 0).succeeded(),
                true)
        })

        /** @test {LoggedAction#succeeded} */
        it('did not', function() {
            const logger = new MemoryLogger()
            try {
                withAction(startAction(logger, 'test'), action => {
                    throw new Error('Nope')
                })
            } catch (_) {
                // Pass
            }
            assert.strictEqual(
                fromMessagesIndex(logger.messages, 0).succeeded(),
                false)
        })
    })
})


/** @test {LoggedMessage} */
describe('LoggedMessage', function() {
    it('constructor stores messages', function() {
        const message = {x: 1},
              logged = new LoggedMessage(message)
        assert.deepEqual(logged.message, message)
    })

    describe('.ofType', function() {
        /** @test {LoggedMessage.ofType} */
        it('returns an array of logged messages for a message type', function() {
            const MESSAGE = MessageType('mymessage', [], 'A message!'),
                  logger = new MemoryLogger()
            // Index 0
            MESSAGE().write(logger)
            // Index 1
            Message.create({x: 2}).write(logger)
            // Index 2
            MESSAGE().write(logger)
            const logged = LoggedMessage.ofType(logger.messages, MESSAGE)
            assert.deepEqual(
                logged,
                [new LoggedMessage(logger.messages[0]),
                 new LoggedMessage(logger.messages[2])])
        })

        /** @test {LoggedMessage.ofType} */
        it('returns an empty array when no message types are found', function() {
            const MESSAGE = MessageType('mymessage', [], 'A message!'),
                  logger = new MemoryLogger()
            assert.deepEqual(
                LoggedMessage.ofType(logger.messages, MESSAGE),
                [])
        })
    })
})


describe('assertContainsFields', function() {
    /** @test {assertContainsFields} */
    it('equal objects contain one another', function() {
        const message = {a: 1},
              expected = Object.assign({}, message)
        assertContainsFields(message, expected)
    })

    /** @test {assertContainsFields} */
    it('subsets do not contain supersets', function() {
        const message = {a: 1, c: 3},
              expected = {a: 1, b: 2, c: 3}
        assert.throws(
            () => assertContainsFields(message, expected))
    })

    /** @test {assertContainsFields} */
    it('different values are not equal', function() {
        const message = {a: 1, c: 3},
              expected = {a: 1, c: 2}
        assert.throws(
            () => assertContainsFields(message, expected))
    })
})


/** @test {captureLogging} */
describe('captureLogging', function() {
    describe('calls decorated function', function() {
        it('with a MemoryLogger, correct this and args', function() {
            let called = [],
                innerThis = null
            captureLogging(this)(function(...args) {
                called.push(args)
                innerThis = this
            })(1, 2, 3)
            assert.strictEqual(innerThis, this)
            assert.strictEqual(called.length, 1)
            const call = called[0]
            assert.instanceOf(call.shift(), MemoryLogger)
            assert.deepEqual(call, [1, 2, 3])
        })

        it('with a new MemoryLogger every time', function() {
            const called = [],
                  f = captureLogging(this)(function(logger) {
                      called.push(logger)
                  })
            f()
            f()
            assert.strictEqual(called.length, 2)
            assert.notStrictEqual(called[0], called[1])
        })
    })

    it('returns the result of the decorated function', function() {
        assert.strictEqual(
            captureLogging(this)(function(logger, a) {
                return a * a
            })(4),
            16)
    })

    it('passes exceptions from the decorated function through', function() {
        let error = new Error('Nope'),
            raised = null
        try {
            captureLogging(this)(function() {
                throw error
            })()
        } catch (e) {
            raised = e
        }
        assert.strictEqual(raised, error)
    })

    it('runs MemoryLogger#validate after the test', function() {
        let testLogger = null
        const MESSAGE = MessageType('mymessage', [], 'A message'),
              f = captureLogging(this)(function(logger) {
                  testLogger = logger
                  logger.write({message_type: 'wrongmessage'},
                               MESSAGE._serializer)
              })
        assert.throws(f, ValidationError)
        assert.deepEqual(testLogger.messages[0], {message_type: 'wrongmessage'})
    })

    it('fails the test if there are unflushed tracebacks', function() {
        const f = captureLogging(this)(function(logger) {
            try {
                throw new Error('Nope')
            } catch (e) {
                writeTraceback(e, logger)
            }
        })
        const e = assert.throws(f, assert.AssertionError)
        assert.strictEqual(e.message, 'Unflushed tracebacks')
    })

    describe('assertion', function() {
        it('is called with this and logger', function() {
            let testLogger = null
            const called = [],
                  assertLogging = function(logger) {
                      called.push([this, logger])
                  },
                  f = captureLogging(this, assertLogging)(function(logger) {
                      testLogger = logger
                  })
            f()
            assert.deepEqual(called, [[this, testLogger]])
        })

        it('is passed extra arguments', function() {
            const called = [],
                  assertLogging = function(logger, ...args) {
                      called.push(args)
                  },
                  f = captureLogging(this, assertLogging, 1, 2, 3)(function() {})
            f()
            assert.deepEqual(called, [[1, 2, 3]])
        })

        it('is called after the test', function() {
            const called = [],
                  assertLogging = function() {
                      called.push(2)
                  },
                  f = captureLogging(this, assertLogging)(function() {
                      called.push(1)
                  })
            f()
            assert.deepEqual(called, [1, 2])
        })

        it('is called before checking for unflushed tracebacks', function() {
            let flushed = false
            const assertLogging = function(logger) {
                logger.flushTracebacks(TypeError)
                flushed = true
            }
            const f = captureLogging(this, assertLogging)(function(logger) {
                try {
                    throw new TypeError('Nope')
                } catch (e) {
                    writeTraceback(e, logger)
                }
            })
            f()
            assert.strictEqual(flushed, true)
        })
    })

    it('captures messages that do not specify a logger', function() {
        let testLogger = null
        const f = captureLogging(this)(function(logger) {
            Message.log({a: 123})
            testLogger = logger
        })
        f()
        assert.strictEqual(testLogger.messages[0].a, 123)
    })

    it('replaces the original default logger after the test', function() {
        const f = captureLogging(this)(function() {}),
              messages = []
        f()
        const remove = addDestination(x => messages.push(x))
        Message.log({a: 123})
        remove()
        assert.strictEqual(messages[0].a, 123)
    })

    it('replaces the original default logger even if the test throws', function() {
        const messages = [],
              f = captureLogging(this)(function() {
                  throw new Error('Nope')
              })
        try {
            f()
        } catch (e) {
            // Pass
        }
        const remove = addDestination(x => messages.push(x))
        Message.log({a: 123})
        remove()
        assert.strictEqual(messages[0].a, 123)
    })
})


/** @test {assertHasMessage} */
describe('assertHasMessage', function() {
    const MESSAGE1 = MessageType('message1',
                                 [BoundField.forTypes('x', ['number'], 'A number')],
                                 'A message for testing.'),
          MESSAGE2 = MessageType('message2', [], 'A message for testing')

    it('fails if no messages of a type have been logged', function() {
        const logger = new MemoryLogger()
        MESSAGE1({x: 123}).write(logger)
        assert.throws(
            () => assertHasMessage(logger, MESSAGE2),
            assert.AssertionError)
    })

    it('returns the first logged message of a type', function() {
        const logger = new MemoryLogger()
        MESSAGE1({x: 123}).write(logger)
        assert.deepEqual(
            assertHasMessage(logger, MESSAGE1),
            LoggedMessage.ofType(logger.messages, MESSAGE1)[0])
    })

    it('fails if the found message does not contain a subset of fields', function() {
        const logger = new MemoryLogger()
        MESSAGE1({x: 123}).write(logger)
        assert.throws(
            () => assertHasMessage(logger, MESSAGE1, {x: 24}),
            assert.AssertionError)
    })

    it('returns the first logged message if it does contain a subset of fields', function() {
        const logger = new MemoryLogger()
        MESSAGE1({x: 123}).write(logger)
        assert.deepEqual(
            assertHasMessage(logger, MESSAGE1, {x: 123}),
            LoggedMessage.ofType(logger.messages, MESSAGE1)[0])
    })
})


/** @test {assertHasAction} */
describe('assertHasAction', function() {
    const ACTION1 = ActionType('action1',
                               [BoundField.forTypes('x', ['number'], 'A number')],
                               [BoundField.forTypes('result', ['number'], 'A number')],
                               'An action for testing'),
          ACTION2 = ActionType('action2', [], [], 'An action for testing')

    it('fails if no actions of a type have been logged', function() {
        const logger = new MemoryLogger()
        withAction(ACTION1({x: 123}, logger), function() {})
        assert.throws(
            () => assertHasAction(logger, ACTION2, true),
            assert.AssertionError)
    })

    it('fails if the success status does not match', function() {
        const logger = new MemoryLogger()
        withAction(ACTION1({x: 123}, logger), function() {})
        try {
            withAction(ACTION2({}, logger), function() {
                throw new Error('Nope')
            })
        } catch (e) {
            // Pass
        }
        assert.throws(
            () => assertHasAction(logger, ACTION1, {succeeded: false}),
            assert.AssertionError)
        assert.throws(
            () => assertHasAction(logger, ACTION2, {succeeded: true}),
            assert.AssertionError)
    })

    it('returns the first logged action of a type', function() {
        const logger = new MemoryLogger()
        withAction(ACTION1({x: 123}, logger), function() {})
        assert.deepEqual(
            assertHasAction(logger, ACTION1, {succeeded: true}),
            LoggedAction.ofType(logger.messages, ACTION1)[0])
    })

    it('fails if the found action does not contain a subset of the start fields', function() {
        const logger = new MemoryLogger()
        withAction(ACTION1({x: 123}, logger), function() {})
        assert.throws(
            () => assertHasAction(logger, ACTION1, {succeeded: true,
                                                    startFields: {x: 24}}))
    })

    it('fails if the found action does not contain a subset of the end fields', function() {
        const logger = new MemoryLogger()
        withAction(ACTION1({x: 123}, logger), function(action) {
            action.addSuccessFields({result: 5})
        })
        assert.throws(
            () => assertHasAction(logger, ACTION1, {succeeded: true,
                                                    endFields: {result: 24}}))
    })

    it('returns the first logged action if it does contain a subset of start and end fields', function() {
        const logger = new MemoryLogger()
        withAction(ACTION1({x: 123}, logger), function(action) {
            action.addSuccessFields({result: 5})
        })
        assert.deepEqual(
            assertHasAction(logger, ACTION1, {succeeded: true,
                                              startFields: {x: 123},
                                              endFields: {result: 5}}),
            LoggedAction.ofType(logger.messages, ACTION1)[0])
    })
})
