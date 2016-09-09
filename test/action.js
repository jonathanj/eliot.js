import {assert} from 'chai'

import {Action,
        TaskLevel,
        startAction,
        startTask,
        withAction} from '../src/action'
import {currentAction} from '../src/context'
import {addDestination, MemoryLogger} from '../src/output'
import {assertContainsFields} from '../src/testing'
import {ActionType, BoundField} from '../src/validation'


/** @test {TaskLevel} */
describe('TaskLevel', function() {
    describe('.fromString', function() {
        /** @test {TaskLevel.fromString} */
        it('should convert components to numbers', function() {
            assert.deepEqual(
                TaskLevel.fromString('1/2/3'),
                new TaskLevel([1, 2, 3]))
        })

        /** @test {TaskLevel.fromString} */
        it('should skip empty components', function() {
            assert.deepEqual(
                TaskLevel.fromString('//1/2/3//'),
                new TaskLevel([1, 2, 3]))
        })
    })

    describe('#toString', function() {
        /** @test {TaskLevel#toString} */
        it('should serialize the task level', function() {
            assert.strictEqual(
                (new TaskLevel([1, 2, 3])).toString(),
                '/1/2/3')
        })
    })

    describe('#nextSibling', function() {
        /** @test {TaskLevel#nextSibling} */
        it('should return the next sibling at the same level', function() {
            assert.deepEqual(
                (new TaskLevel([1])).nextSibling(),
                new TaskLevel([2]))
            assert.deepEqual(
                (new TaskLevel([1, 2, 3])).nextSibling(),
                new TaskLevel([1, 2, 4]))
        })
    })

    describe('#child', function() {
        /** @test {TaskLevel#child} */
        it('should return a child of the task level', function() {
            assert.deepEqual(
                (new TaskLevel([1])).child(),
                new TaskLevel([1, 1]))
            assert.deepEqual(
                (new TaskLevel([1, 2, 3])).child(),
                new TaskLevel([1, 2, 3, 1]))
        })
    })

    describe('#parent', function() {
        /** @test {TaskLevel#parent} */
        it('should return a parent of the task level', function() {
            assert.deepEqual(
                (new TaskLevel([1, 2, 3]).parent()),
                new TaskLevel([1, 2]))
        })

        /** @test {TaskLevel#parent} */
        it('should return null if there is no parent', function() {
            assert.strictEqual(
                (new TaskLevel([]).parent()),
                null)
        })
    })

    describe('#isSiblingOf', function() {
        /** @test {TaskLevel#isSiblingOf} */
        it('should return true if two task levels are siblings', function() {
            assert.strictEqual(
                (new TaskLevel([1, 2])).isSiblingOf(
                    new TaskLevel([1, 3])),
                true)
        })
    })
})


/** @test {Action} */
describe('Action', function() {
    class SerializerTrackingLogger {
        constructor() {
            this.serializers = []
        }

        write(message, serializer) {
            this.serializers.push(serializer)
        }
    }

    describe('#start', function() {
        /** @test {Action#start} */
        it('logs a started status message', function() {
            const logger = new MemoryLogger(),
                  action = new Action(
                      logger, 'unique', new TaskLevel([]), 'sys:thename')
            action._start({key: 'value'})
            assertContainsFields(
                logger.messages[0],
                {task_uuid: 'unique',
                 task_level: [1],
                 action_type: 'sys:thename',
                 action_status: 'started',
                 key: 'value'})
        })

        /** @test {Action#start} */
        it('creates a message with the appropriate serializer', function() {
            const serializers = ActionType(
                'sys:thename',
                [BoundField.create('key', x => x, '')],
                [], '')._serializers,
                  logger = new SerializerTrackingLogger(),
                  action = new Action(
                      logger, 'unique', new TaskLevel([]), 'sys:thename', serializers)
            action._start({key: 'value'})
            assert.strictEqual(logger.serializers[0], serializers.start)
        })
    })

    describe('#child', function() {
        /** @test {Action#child} */
        it('returns a new Action with the given parameters and a task_uuid from the parent', function() {
            const logger = new MemoryLogger(),
                  action = new Action(
                      logger, 'unique', new TaskLevel([]), 'sys:thename'),
                  logger2 = new MemoryLogger(),
                  child = action.child(logger2, 'newsystem:newname')
            assert.strictEqual(child._logger, logger2)
            assert.deepEqual(
                child._identification,
                {task_uuid: 'unique',
                 action_type: 'newsystem:newname'})
            assert.deepEqual(child._taskLevel, new TaskLevel([1]))
        })

        it('increments the level for subsequent children', function() {
            const logger = new MemoryLogger(),
                  action = new Action(
                      logger, 'unique', new TaskLevel([]), 'sys:thename'),
                  child1 = action.child(logger, 'newsystem:newname'),
                  child2 = action.child(logger, 'newsystem:newname'),
                  child1_1 = child1.child(logger, 'newsystem:other')
            assert.deepEqual(child1._taskLevel, new TaskLevel([1]))
            assert.deepEqual(child2._taskLevel, new TaskLevel([2]))
            assert.deepEqual(child1_1._taskLevel, new TaskLevel([1, 1]))
        })

        it('can create children with new serializers', function() {
            const logger = new MemoryLogger(),
                  serializers = new Object(),
                  action = new Action(
                      logger, 'unique', new TaskLevel([]), 'sys:thename',
                      serializers),
                  childSerializers = new Object(),
                  child = action.child(
                      logger, 'newsystem:newname', childSerializers)
            assert.strictEqual(child._serializers, childSerializers)
        })
    })

    describe('#run', function() {
        /** @test {Action#run} */
        it('runs a function with arguments and returns its result', function() {
            const action = new Action(null, '', new TaskLevel([]), ''),
                  f = (...args) => args,
                  result = action.run(f, 1, 2)
            assert.deepEqual(result, [1, 2])
        })

        /** @test {Action#run} */
        it('unsets the action if the function throws', function() {
            const action = new Action(null, '', new TaskLevel([]), '')
            assert.throws(
                () => { throw new Error('Nope') })
            assert.strictEqual(currentAction(), null)
        })
    })

    describe('#finish', function() {
        /** @test {Action#finish} */
        it('logs a success status when no error occurs', function() {
            const logger = new MemoryLogger(),
                  action = new Action(
                      logger, 'unique', new TaskLevel([]), 'sys:thename')
            action.finish()
            assertContainsFields(
                logger.messages[0],
                {task_uuid: 'unique',
                 task_level: [1],
                 action_type: 'sys:thename',
                 action_status: 'succeeded'})
        })

        /** @test {Action#finish} */
        it('passes the success serializer to the message, on success', function() {
            const serializers = ActionType(
                'sys:thename',
                [],
                [BoundField.create('key', x => x, '')], '')._serializers,
                  logger = new SerializerTrackingLogger(),
                  action = new Action(
                      logger, 'unique', new TaskLevel([]), 'sys:thename',
                      serializers)
            action.finish()
            assert.strictEqual(logger.serializers[0], serializers.success)
        })

        /** @test {Action#finish} */
        it('passes the failure serializer to the message, on failure', function() {
            const serializers = ActionType(
                'sys:thename',
                [],
                [BoundField.create('key', x => x, '')], '')._serializers,
                  logger = new SerializerTrackingLogger(),
                  action = new Action(
                      logger, 'unique', new TaskLevel([]), 'sys:thename',
                      serializers)
            action.finish(new Error('Nope'))
            assert.strictEqual(logger.serializers[0], serializers.failure)
        })

        /** @test {Action#finish} */
        it('logs a message without the start fields', function() {
            const logger = new MemoryLogger(),
                  action = new Action(
                      logger, 'unique', new TaskLevel([]), 'sys:thename')
            action._start({key: 'value'})
            action.finish()
            assert.strictEqual(logger.messages[1].key, undefined)
        })

        /** @test {Action#finish} */
        it('subsequent calls have no effect', function() {
            const logger = new MemoryLogger(),
                  action = new Action(
                      logger, 'uuid', new TaskLevel([]), 'sys:me')
            withAction(action, act => {
                act.finish()
                act.finish(new Error('Nope'))
                act.finish()
            })
            assert.strictEqual(logger.messages.length, 1)
        })
    })

    /** @test {Action#_nextTaskLevel} */
    it('_nextTaskLevel increments a counter', function() {
        const action = new Action(
            new MemoryLogger(), 'uuid', new TaskLevel([1]), 'sys:me')
        assert.deepEqual(action._nextTaskLevel(), new TaskLevel([1, 1]))
        assert.deepEqual(action._nextTaskLevel(), new TaskLevel([1, 2]))
        assert.deepEqual(action._nextTaskLevel(), new TaskLevel([1, 3]))
        assert.deepEqual(action._nextTaskLevel(), new TaskLevel([1, 4]))
        assert.deepEqual(action._nextTaskLevel(), new TaskLevel([1, 5]))
    })

    describe('#serializeTaskId', function() {
        /** @test {Action#serializeTaskId} */
        it('result is composed of the task UUID and incremented task level', function() {
            const action = new Action(
                null, 'uniq', new TaskLevel([1, 2]), 'mytype')
            assert.deepEqual(action._nextTaskLevel(), new TaskLevel([1, 2, 1]))
            assert.strictEqual(action.serializeTaskId(), 'uniq@/1/2/2')
            assert.deepEqual(action._nextTaskLevel(), new TaskLevel([1, 2, 3]))
        })
    })

    describe('.continueTask', function() {
        /** @test {Action.continueTask} */
        it('returns an Action whose task level and uuid are derived from the serialized task id', function() {
            const originalAction = new Action(
                null, 'uniq', new TaskLevel([3, 4]), 'mytype'),
                  taskId = originalAction.serializeTaskId(),
                  newAction = Action.continueTask(taskId, new MemoryLogger())
            assert.instanceOf(newAction, Action)
            assert.deepEqual(
                newAction._identification,
                {task_uuid: 'uniq',
                 action_type: 'eliot_js:remote_task'})
            assert.deepEqual(newAction._taskLevel, new TaskLevel([3, 4, 1]))
        })

        /** @test {Action.continueTask} */
        it('starts the Action it creates', function() {
            const originalAction = new Action(
                null, 'uniq', new TaskLevel([3, 4]), 'mytype'),
                  taskId = originalAction.serializeTaskId(),
                  logger = new MemoryLogger()
            Action.continueTask(taskId, logger)
            assertContainsFields(
                logger.messages[0],
                {task_uuid: 'uniq',
                 task_level: [3, 4, 1, 1],
                 action_type: 'eliot_js:remote_task',
                 action_status: 'started'})
        })

        /** @test {Action.continueTask} */
        it('can be called without a logger', function() {
            const messages = [],
                  originalAction = new Action(
                null, 'uniq', new TaskLevel([3, 4]), 'mytype'),
                  taskId = originalAction.serializeTaskId(),
                  remove = addDestination(x => messages.push(x))
            after(function() { remove() })
            Action.continueTask(taskId)
            assertContainsFields(
                messages[0],
                {task_uuid: 'uniq',
                 task_level: [3, 4, 1, 1],
                 action_type: 'eliot_js:remote_task',
                 action_status: 'started'})
        })
    })
})


describe('startTask', function() {
    /** @test {startTask} */
    it('creates a new top-level Action', function() {
        const logger = new MemoryLogger(),
              action = startTask(logger, 'sys:do')
        assert.instanceOf(action, Action)
        assert.deepEqual(action._taskLevel, new TaskLevel([]))
    })

    /** @test {startTask} */
    it('serializers are attached to the resulting Action', function() {
        const logger = new MemoryLogger(),
              serializers = new Object(),
              action = startTask(logger, 'sys:do', {}, serializers)
        assert.strictEqual(action._serializers, serializers)
    })

    /** @test {startTask} */
    it('creates an Action with its own `task_uuid`', function() {
        const logger = new MemoryLogger(),
              action = startTask(logger, 'sys:do'),
              action2 = startTask(logger, 'sys:do')
        assert.notStrictEqual(action._identification.task_uuid,
                              action2._identification.task_uuid)
    })

    /** @test {startTask} */
    it('logs a start message', function() {
        const logger = new MemoryLogger(),
              action = startTask(logger, 'sys:do', {key: 'value'})
        assertContainsFields(
            logger.messages[0],
            {task_uuid: action._identification.task_uuid,
             task_level: [1],
             action_type: 'sys:do',
             action_status: 'started',
             key: 'value'})
    })

    /** @test {startTask} */
    it('log to the default logger when no logger is given', function() {
        const messages = [],
              remove = addDestination(value => messages.push(value))
        after(function() { remove() })
        const action = startTask(null, 'sys:do', {key: 'value'})
        assertContainsFields(
            messages[0],
            {task_uuid: action._identification.task_uuid,
             task_level: [1],
             action_type: 'sys:do',
             action_status: 'started',
             key: 'value'})
    })

})


describe('startAction', function() {
    /** @test {startAction} */
    it('serializers are attached to the resulting Action', function() {
        const logger = new MemoryLogger(),
              serializers = new Object(),
              action = startAction(logger, 'sys:do', {}, serializers)
        assert.strictEqual(action._serializers, serializers)
    })

    /** @test {startAction} */
    it('creates a top-level acton when there is no current action', function() {
        const logger = new MemoryLogger(),
              action = startAction(logger, 'sys:do')
        assert.instanceOf(action, Action)
        assert.deepEqual(action._taskLevel, new TaskLevel([]))
    })

    /** @test {startAction} */
    it('logs a start message when there is no current action', function() {
        const logger = new MemoryLogger(),
              action = startAction(logger, 'sys:do', {key: 'value'})
        assertContainsFields(
            logger.messages[0],
            {task_uuid: action._identification.task_uuid,
             task_level: [1],
             action_type: 'sys:do',
             action_status: 'started',
             key: 'value'})
    })

    /** @test {startAction} */
    it('uses the current action as the parent', function() {
        const logger = new MemoryLogger(),
              parent = new Action(
                  logger, 'uuid', new TaskLevel([2]), 'other:thing')
        withAction(parent, () => {
            const action = startAction(logger, 'sys:do')
            assert.instanceOf(action, Action)
            assert.strictEqual(action._identification.task_uuid, 'uuid')
            assert.deepEqual(action._taskLevel, new TaskLevel([2, 1]))
        })
    })

    /** @test {startAction} */
    it('logs a start message when there is a parent action', function() {
        const logger = new MemoryLogger(),
              parent = new Action(
                  logger, 'uuid', new TaskLevel([]), 'other:thing')
        withAction(parent, () => {
            startAction(logger, 'sys:do', {key: 'value'})
            assertContainsFields(
                logger.messages[0],
                {task_uuid: 'uuid',
                 task_level: [1, 1],
                 action_type: 'sys:do',
                 action_status: 'started',
                 key: 'value'})
        })
    })

    /** @test {startAction} */
    it('log to the default logger when no logger is given', function() {
        const messages = [],
              remove = addDestination(value => messages.push(value))
        after(function() { remove() })
        const action = startAction(null, 'sys:do', {key: 'value'})
        assertContainsFields(
            messages[0],
            {task_uuid: action._identification.task_uuid,
             task_level: [1],
             action_type: 'sys:do',
             action_status: 'started',
             key: 'value'})
    })
})


describe('withAction', function() {
    /** @test {withAction} */
    it('sets the action as the current action', function() {
        withAction(
            new Action(new MemoryLogger(), '', new TaskLevel([]), ''),
            action => {
                assert.strictEqual(currentAction(), action)
            })
    })

    /** @test {withAction} */
    it('unsets the action on success', function() {
        withAction(
            new Action(new MemoryLogger(), '', new TaskLevel([]), ''),
            action => {})
        assert.strictEqual(currentAction(), null)
    })

    /** @test {withAction} */
    it('unsets the action when an error occurs', function() {
        try {
            withAction(
                new Action(new MemoryLogger(), '', new TaskLevel([]), ''),
                action => { throw new Error('Nope') })
        } catch (_) {
            // Pass
        }
        assert.strictEqual(currentAction(), null)
    })

    /** @test {withAction} */
    it('logs an action finish message on success', function() {
        const logger = new MemoryLogger(),
              action = new Action(logger, 'uuid', new TaskLevel([1]), 'sys:me')
        withAction(action, () => {})
        assert.strictEqual(logger.messages.length, 1)
        assertContainsFields(
            logger.messages[0],
            {task_uuid: 'uuid',
             task_level: [1, 1],
             action_type: 'sys:me',
             action_status: 'succeeded'})
    })

    /** @test {withAction} */
    it('logs an action finish message when the function throws', function() {
        const logger = new MemoryLogger(),
              action = new Action(logger, 'uuid', new TaskLevel([1]), 'sys:me')
        assert.throws(
            () => withAction(action, () => { throw new Error('Nope')}))
        assertContainsFields(
            logger.messages[0],
            {task_uuid: 'uuid',
             task_level: [1, 1],
             action_type: 'sys:me',
             action_status: 'failed',
             reason: 'Error: Nope',
             exception: 'Error'})
    })

    /** @test {withAction} */
    it('adds addSuccessFields on success', function() {
        const logger = new MemoryLogger(),
              action = new Action(logger, 'uuid', new TaskLevel([1]), 'sys:me')
        withAction(action, action => {
            action.addSuccessFields({x: 1, y: 2})
            action.addSuccessFields({z: 3})
        })
        assertContainsFields(
            logger.messages[0],
            {x: 1,
             y: 2,
             z: 3})
    })
})
