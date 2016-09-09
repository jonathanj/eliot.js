import {assert} from 'chai'

import {Action, TaskLevel, startAction, withAction} from '../src/action'
import {Message} from '../src/message'
import {addDestination, MemoryLogger} from '../src/output'
import {assertContainsFields} from '../src/testing'


describe('Message', function() {
    describe('.create', function() {
        /** @test {Message.create} */
        it('creates a new Message', function() {
            const msg = Message.create({key: 'value',
                                        another: 2})
            assert.deepEqual(
                msg.contents(),
                {key: 'value',
                 another: 2})
        })

        /** @test {Message.create} */
        it('accepts a serializer', function() {
            const serializer = new Object(),
                  msg = Message.create({x: 1}, serializer)
            assert.strictEqual(msg._serializer, serializer)
        })
    })

    describe('#contents', function() {
        /** @test {Message#contents} */
        it('copies the message contents', function() {
            const msg = Message.create({key: 'value'})
            delete msg.contents()['key']
            assert.deepEqual(
                msg.contents(),
                {key: 'value'})
        })
    })

    describe('#bind', function() {
        /** @test {Message#bind} */
        it('returns a new Message with the given fields', function() {
            const msg = Message.create({key: 'value', another: 2}),
                  another = msg.bind({another: 3, more: 4})
            assert.instanceOf(another, Message)
            assert.deepEqual(
                another.contents(),
                {key: 'value',
                 another: 3,
                 more: 4})
        })

        /** @test {Message#bind} */
        it('does not mutate the instance', function() {
            const msg = Message.create({key: 4})
            msg.bind({key: 6})
            assert.deepEqual(
                msg.contents(),
                {key: 4})
        })

        /** @test {Message#bind} */
        it('includes the serializer passed to the parent', function() {
            const serializer = new Object(),
                  msg = new Message({}, serializer),
                  msg2 = msg.bind({x: 1})
            assert.strictEqual(msg2._serializer, serializer)
        })
    })

    describe('#write', function() {
        /** @test {Message#write} */
        it("calls the logger's write method", function() {
            const logger = new MemoryLogger(),
                  msg = Message.create({key: 4})
            msg.write(logger)
            assert.strictEqual(logger.messages.length, 1)
            assert.strictEqual(logger.messages[0].key, 4)
        })

        /** @test {Message#write} */
        it('writes to the default logger if none is given', function() {
            const messages = [],
                  remove = addDestination(x => messages.push(x))
            after(function() { remove() })
            Message.create({key: 1234}).write()
            assert.strictEqual(messages[0].key, 1234)
        })

        /** @test {Message#write} */
        it('creates a new object on each call', function() {
            const msg = Message.create({key: 4}),
                  logger = new class {
                      constructor() {
                          this.called = []
                      }
                      write(dict, serializer) {
                          this.called.push(dict)
                      }
                  }
            msg.write(logger)
            logger.called[0].key = 5
            msg.write(logger)
            assert.strictEqual(logger.called[1].key, 4)
        })

        /** @test {Message#write} */
        it('adds a timestamp field', function() {
            const logger = new MemoryLogger(),
                  msg = Message.create({key: 4}),
                  timestamp = 1472718640478
            msg._time = () => timestamp
            msg.write(logger)
            assert.strictEqual(logger.messages[0].timestamp, timestamp)
        })

        /** @test {Message#write} */
        it('adds the identification fields from an action', function() {
            const logger = new MemoryLogger(),
                  action = new Action(
                      logger, 'uniq', new TaskLevel([]), 'sys:thename'),
                  msg = Message.create({key: 2})
            msg.write(logger, action)
            assertContainsFields(
                logger.messages[0],
                {task_uuid: 'uniq',
                 task_level: [1],
                 key: 2})
        })

        /** @test {Message#write} */
        it('adds the identification fields from the current action if no explicit action is given', function() {
            const logger = new MemoryLogger(),
                  action = new Action(
                      logger, 'uniq', new TaskLevel([]), 'sys:thename'),
                  msg = Message.create({key: 2})
            withAction(action, () => {
                msg.write(logger)
            })
            assertContainsFields(
                logger.messages[0],
                {task_uuid: 'uniq',
                 task_level: [1],
                 key: 2})
        })

        /** @test {Message#write} */
        it('generates a new task uuid if there is no action, explicit or implicit', function() {
            const logger = new MemoryLogger()
            Message.create({key: 2}).write(logger)
            Message.create({key: 3}).write(logger)

            const [msg1, msg2] = logger.messages
            assert.notDeepEqual(msg1.task_uuid, msg2.task_uuid)
            assert.deepEqual(msg1.task_level, [1])
            assert.deepEqual(msg2.task_level, [1])
        })

        /** @test {Message#write} */
        it('each message written has an incrementing task level', function() {
            const logger = new MemoryLogger(),
                  msg = Message.create({key: 2})
            withAction(startAction(logger, 'sys:thename'), () => {
                msg.write(logger)
                msg.write(logger)
                msg.write(logger)
                msg.write(logger)
            })
            assert.deepEqual(logger.messages[0].task_level, [1])
            assert.deepEqual(logger.messages[1].task_level, [2])
            assert.deepEqual(logger.messages[2].task_level, [3])
            assert.deepEqual(logger.messages[3].task_level, [4])
            assert.deepEqual(logger.messages[4].task_level, [5])
            assert.deepEqual(logger.messages[5].task_level, [6])
        })

        /** @test {Message#write} */
        it('passes a serializer to the logger', function() {
            const serializer = new Object(),
                  msg = new Message({}, serializer),
                  logger = new class {
                      constructor() {
                          this.called = []
                      }
                      write(dict, serializer) {
                          this.called.push(serializer)
                      }
                  }
            msg.write(logger)
            assert.strictEqual(logger.called[0], serializer)
        })
    })

    describe('#log', function() {
        /** @test {Message#log} */
        it('calls the logger #write method with a superset of the message contents', function() {
            const messages = [],
                  remove = addDestination(x => messages.push(x))
            after(function() { remove() })
            Message.log({key: 123})
            assert.strictEqual(messages[0].key, 123)
        })
    })
})
