import {assert} from 'chai'
import {MemoryLogger,
        Logger,
        Destinations,
        _DestinationsSendError} from '../src/output'
import {BoundField,
        _MessageSerializer,
        ValidationError} from '../src/validation'
import {writeTraceback} from '../src/traceback'
import {assertContainsFields} from '../src/testing'


const badDestination = () => {
    let first = true,
        result = []
    return [
        result,
        x => {
            if (first) {
                first = false
                throw new Error('Nope')
            }
            result.push(x)
        }]
}


/** @test {MemoryLogger} */
describe('MemoryLogger', function() {
    it('writes are stored in an array', function() {
        const logger = new MemoryLogger()
        logger.write({a: 'b'})
        logger.write({c: 1})
        assert.deepEqual(
            logger.messages,
            [{a: 'b'}, {c: 1}])
        logger.validate()
    })

    describe('#validate', function() {
        /** @test {MemoryLogger#validate} */
        it("calls the serializer's validate function", function() {
            const logger = new MemoryLogger(),
                  message = {message_type: 'mymessage', X: 1},
                  validator = new class {
                      constructor() {
                          this.called = []
                      }
                      validate(message) {
                          this.called.push(message)
                      }
                      serialize(value) {
                          return value
                      }
                  }
            logger.write(message, validator)
            assert.deepEqual(validator.called, [])
            logger.validate()
            assert.deepEqual(validator.called, [message])
        })

        /** @test {MemoryLogger#validate} */
        it('will allow exceptions from the serializer through', function() {
            const serializer = new _MessageSerializer(
                [BoundField.forValue('message_type', 'mymessage', 'The type')]),
                  logger = new MemoryLogger()
            logger.write({message_type: 'wrongtype'}, serializer)
            assert.throws(() => logger.validate(), ValidationError)
        })
    })

    describe('#serialize', function() {
        /** @test {MemoryLogger#serialize} */
        it('returns serialized log messages', function() {
            const serializer = new _MessageSerializer(
                [BoundField.forValue('message_type', 'mymessage', 'The type'),
                 BoundField.create('length', x => x.length, 'The length')]),
                  messages = [{message_type: 'mymessage', length: 'abc'},
                              {message_type: 'mymessage', length: 'abcd'}],
                  logger = new MemoryLogger()
            for (const message of messages) {
                logger.write(message, serializer)
            }
            assert.deepEqual(
                logger.serialize(),
                [{message_type: 'mymessage', length: 3},
                {message_type: 'mymessage', length: 4}])
        })

        /** @test {MemoryLogger#serialize} */
        it('does not mutate the originals', function() {
            const serializer = new _MessageSerializer(
                [BoundField.forValue('message_type', 'mymessage', 'The type'),
                 BoundField.create('length', x => x.length, 'The length')]),
                  message = {message_type: 'mymessage', length: 'abc'},
                  logger = new MemoryLogger()
            logger.write(message, serializer)
            logger.serialize()
            assert.deepEqual(logger.messages[0].length, 'abc')
        })
    })

    it('tracebacks are logged in `tracebackMessages`', function() {
        const logger = new MemoryLogger(),
              error = new Error('Nope')
        writeTraceback(error, logger)
        assert.strictEqual(logger.tracebackMessages[0].reason, error)
    })

    describe('#flushTracebacks', function() {
        /** @test {MemoryLogger#flushTracebacks} */
        it('clears logged tracebacks', function() {
            const logger = new MemoryLogger(),
                  error = new Error('Nope')
            writeTraceback(error, logger)
            logger.flushTracebacks(Error)
            assert.deepEqual(logger.tracebackMessages, [])
        })

        /** @test {MemoryLogger#flushTracebacks} */
        it('returns traceback messages', function() {
            const logger = new MemoryLogger(),
                  errors = [new Error('Nope'),
                            new TypeError('Nah-ah')]
            logger.write({x: 1})
            for (const error of errors) {
                writeTraceback(error, logger)
            }
            logger.write({x: 1})
            let flushed = logger.flushTracebacks(Error)
            assert.strictEqual(flushed.length, 2)
            assert.deepEqual(flushed[0], logger.messages[1])
            assert.deepEqual(flushed[1], logger.messages[2])
        })

        /** @test {MemoryLogger#flushTracebacks} */
        it('only flushes error of the specified type', function() {
            const logger = new MemoryLogger(),
                  error = new Error('Nope')
            writeTraceback(error, logger)
            logger.flushTracebacks(TypeError)
            assert.strictEqual(logger.tracebackMessages[0].reason, error)
        })

        /** @test {MemoryLogger#flushTracebacks} */
        it('only returns tracebacks of the specified type', function() {
            const logger = new MemoryLogger(),
                  error = new Error('Nope')
            writeTraceback(error, logger)
            assert.deepEqual(logger.flushTracebacks(TypeError), [])
        })
    })

    describe('#reset', function() {
        /** @test {MemoryLogger#reset} */
        it('resets logged messages and tracebacks', function() {
            const logger = new MemoryLogger()
            logger.write({key: 'value'}, null)
            logger.reset()
            assert.deepEqual(logger.messages, [])
            assert.deepEqual(logger.serializers, [])
            assert.deepEqual(logger.tracebackMessages, [])
        })
    })
})


/** @test {Destinations} */
describe('Destinations', function() {
    it('send calls to all destinations', function() {
        const destinations = new Destinations(),
              message = {'hello': 'world'},
              dest = [],
              dest2 = []
        destinations.add(Array.prototype.push.bind(dest))
        destinations.add(Array.prototype.push.bind(dest2))
        destinations.send(message)
        assert.deepEqual(dest, [message])
        assert.deepEqual(dest2, [message])
    })

    it('resilient destination message delivery', function() {
        const destinations = new Destinations(),
              message = {'hello': 'world'},
              dest = [],
              [_, dest2] = badDestination(),
              dest3 = []
        destinations.add(Array.prototype.push.bind(dest))
        destinations.add(dest2)
        destinations.add(Array.prototype.push.bind(dest3))
        assert.throws(
            () => destinations.send({'hello': 'world'}),
            _DestinationsSendError)
        assert.deepEqual(dest, [message])
        assert.deepEqual(dest3, [message])
    })

    it('receive messages even if they have thrown before', function() {
        const destinations = new Destinations(),
              message = {'hello': 'world'},
              [result, dest] = badDestination()
        destinations.add(dest)
        assert.throws(
            () => destinations.send({'hello': 123}),
            _DestinationsSendError)
        destinations.send(message)
        assert.deepEqual(result, [message])
    })

    it('remove destination', function() {
        const destinations = new Destinations(),
              message = {'hello': 'world'},
              dest = [],
              remove = destinations.add(Array.prototype.push.bind(dest))
        remove()
        destinations.send(message)
        assert.deepEqual(dest, [])
    })

    it('removing a nonexistent destination fails', function() {
        const destinations = new Destinations()
        assert.throws(
            () => destinations.remove(x => x),
            Error)
    })

    it('global fields apply to all messages', function() {
        const destinations = new Destinations(),
              dest = []
        destinations.add(Array.prototype.push.bind(dest))
        destinations.addGlobalFields({x: 123, y: 'hello'})
        destinations.send({z: 456})
        assert.deepEqual(dest, [{x: 123, y: 'hello', z: 456}])
    })


    it('global fields are cumulative', function() {
        const destinations = new Destinations(),
              dest = []
        destinations.add(Array.prototype.push.bind(dest))
        destinations.addGlobalFields({x: 123, y: 'hello'})
        destinations.addGlobalFields({x: 456})
        destinations.send({z: 789})
        assert.deepEqual(dest, [{x: 456, y: 'hello', z: 789}])
    })
})


/** @test {Logger} */
describe('Logger', function() {
    const makeLogger = () => {
        const logger = new Logger(),
              _destinations = new Destinations(),
              written = []
        _destinations.add(x => written.push(x))
        logger._destinations = _destinations
        return [logger, written]
    }

    it('write sends the dictionary to the Destinations', function() {
        const [logger, written] = makeLogger(),
              d = {hello: 1}
        logger.write(d)
        assert.deepEqual(written, [d])
    })

    it('messages are serialized before being sent to the destination', function () {
        const [logger, written] = makeLogger(),
              serializer = new _MessageSerializer(
                  [BoundField.forValue('message_type', 'mymessage', 'The type'),
                   BoundField.create('length', x => x.length, 'The length')])
        logger.write({message_type: 'some message',
                      length: 'thething'},
                     serializer)
        assert.deepEqual(
            written,
            [{message_type: 'mymessage',
              length: 8}])
    })

    it('original message unmodified after writing', function() {
        const [logger, written] = makeLogger(),
              serializer = new _MessageSerializer(
                  [BoundField.forValue('message_type', 'mymessage', 'The type'),
                   BoundField.create('length', x => x.length, 'The length')]),
              d = {message_type: 'some message',
                   length: 'thething'},
              original = Object.assign({}, d)
        logger.write(d, serializer)
        assert.deepEqual(d, original)
    })

    it('serializer failures are logged', function() {
        const [logger, written] = makeLogger(),
              raiser = () => { throw new Error('Nope') },
              serializer = new _MessageSerializer(
                  [BoundField.forValue('message_type', 'mymessage', 'The type'),
                   BoundField.create('fail', raiser, 'Serialization fail')]),
              message = {message_type: 'some message',
                         fail: 'yesplz'}
        logger.write(message, serializer)
        assert.strictEqual(written.length, 2)
        assertContainsFields(
            written[0],
            {exception: 'Error',
             message_type: 'eliot_js:traceback'})
        assert.deepEqual(
            written[1].message,
            JSON.stringify({message_type: 'mymessage',
                            fail: 'yesplz'}))
    })

    it('log destination errors', function() {
        const logger = new Logger(),
              _destinations = new Destinations(),
              [written, dest] = badDestination(),
              message = {hello: 123}
        _destinations.add(dest)
        logger._destinations = _destinations
        logger.write(message)
        assertContainsFields(
            written[0],
            {message_type: 'eliot_js:destination_failure',
             message: JSON.stringify(message),
             reason: 'Error: Nope',
             exception: 'Error'})
    })

    it('log errors for each destinations', function() {
        const logger = new Logger(),
              _destinations = new Destinations(),
              message = {hello: 123},
              written = []
        _destinations.add(badDestination()[1])
        _destinations.add(() => undefined.foo)
        _destinations.add(Array.prototype.push.bind(written))
        logger._destinations = _destinations

        logger.write(message)
        assert.strictEqual(written.length, 3)
        assert.deepEqual(written[0], message)
        assertContainsFields(
            written[1],
            {message_type: 'eliot_js:destination_failure',
             exception: 'Error',
             message: JSON.stringify(message),
             reason: 'Error: Nope'})
        assertContainsFields(
            written[2],
             {message_type: 'eliot_js:destination_failure',
              exception: 'TypeError',
              message: JSON.stringify(message),
              reason: 'TypeError: Cannot read property \'foo\' of undefined'})
    })

    it('drops exception handler exceptions', function() {
        const logger = new Logger(),
              _destinations = new Destinations()
        _destinations.add(() => { throw new Error('Broken') })
        logger._destinations = _destinations
        // No exception is raised since we drop exceptions in the exception
        // handler to avoid breaking business code.
        logger.write({hello: 123})
    })
})
