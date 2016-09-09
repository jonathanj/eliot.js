import {assert} from 'chai'

import {withAction} from '../src/action'
import {addDestination, MemoryLogger} from '../src/output'
import {BoundField,
        Field,
        fields,
        ValidationError,
        _MessageSerializer,
        MessageType,
        ActionType} from '../src/validation'


const greaterThanTen = x => {
    if (x <= 10) {
        throw new ValidationError(x, 'too small')
    }
}


/** @test {Field} */
describe('Field', function() {
    describe('.forTypes', function() {
        /** @test {Field.forTypes} */
        it('validates correct types', function() {
            const field = Field.forTypes(['string', 'number'], 'A foo')
            field.validate(123)
            field.validate('hello')
        })

        /** @test {Field.forTypes} */
        it('validates null', function() {
            const field = Field.forTypes(['null'], 'Nothing')
            field.validate(null)
        })

        /** @test {Field.forTypes} */
        it('validates array', function() {
            const field = Field.forTypes(['Array'], 'Exes')
            field.validate(['a'])
        })

        /** @test {Field.forTypes} */
        it('validates object', function() {
            const field = Field.forTypes(['Object'], 'Exes')
            field.validate({'a': 42})
        })

        /** @test {Field.forTypes} */
        it('throws for wrong types', function() {
            const field = Field.forTypes(['number'], 'Integer')
            assert.throws(
                () => field.validate('hello'), ValidationError)
            assert.throws(
                () => field.validate(null), ValidationError)
        })

        /** @test {Field.forTypes} */
        it('does not throw if the extra validator does not', function() {
            const field = Field.forTypes(['number'], 'Integer', greaterThanTen)
            field.validate(11)
        })

        /** @test {Field.forTypes} */
        it('throws if the extra validator does', function() {
            const field = Field.forTypes(['number'], 'Integer', greaterThanTen)
            assert.throws(() => field.validate(10), Error)
        })

        /** @test {Field.forTypes} */
        it('only allows support JSON types', function () {
            assert.throws(
                () => Field.forTypes('key', ['Nope'], 'Oops'),
                TypeError)
        })
    })

    describe('field', function() {
        it('may have a description', function() {
            const field = new Field(x => x, 'A key')
            assert.strictEqual(field.description, 'A key')
        })

        it('has a default description', function() {
            const field = new Field(x => x)
            assert.strictEqual(field.description, '')
        })

        it('calls the serializer', function() {
            const result = [],
                  field = new Field(x => result.push(x))
            field.serialize(123)
            assert.deepEqual(result, [123])
        })

        it('serializes the result', function() {
            const field = new Field(x => 456),
                  result = field.serialize(null)
            assert.strictEqual(result, 456)
        })

        it('validate tries to serialize', function() {
            const field = new Field(x => {
                throw new Error('Nope')
            })
            assert.throws(
                () => field.validate(123), Error)
        })

        it('does not call the extra validator if it does not exist', function () {
            const field = new Field(x => x)
            field.validate(123)
        })

        it('validate does not throw if the extra validator does not', function() {
            const field = new Field(x => x, 'Integer', greaterThanTen)
            field.validate(11)
        })

        it('validate throws if the extra validator does', function() {
            const field = new Field(x => x, 'Integer', greaterThanTen)
            assert.throws(() => field.validate(10), Error)
        })
    })

    describe('.forValue', function() {
        /** @test {Field.forValue} */
        it('creates a Field with a description', function() {
            const field = Field.forValue(null, 'description')
            assert.strictEqual(field.description, 'description')
        })

        /** @test {Field.forValue} */
        it('validates the value it was constructed with', function() {
            const field = Field.forValue(1234, 'description')
            field.validate(1234)
        })

        /** @test {Field.forValue} */
        it('throws when validated with a different value', function() {
            const field = Field.forValue(1234, 'description')
            assert.throws(() => field.validate(5678), ValidationError)
        })

        /** @test {Field.forValue} */
        it('serialize the value it was constructed with', function() {
            const field = Field.forValue(1234, 'description')
            assert.strictEqual(field.serialize(null), 1234)
        })
    })
})


/** @test {BoundField} */
describe('BoundField', function() {
    it('has a key and a field', function() {
        const field = new Field(x => x, 'description'),
              bound = new BoundField('key', field)
        assert.strictEqual(bound.key, 'key')
        assert.strictEqual(bound.field, field)
    })

    describe('#validate', function() {
        /** @test {BoundField#validate} */
        it('wraps validation errors to include the field key', function() {   
            const field = new Field(x => x, 'Integer', greaterThanTen),
                  bound = new BoundField('int', field)
            assert.throws(
                () => bound.validate(10),
                ValidationError,
                /^ValidationError: int: too small/)
        })
    })
})


describe('fields', function() {
    /** @test {fields} */
    it('creates BoundField instances with the given keys', function() {
        const l = fields({key: 'number', status: 'string'})
        assert.instanceOf(l[0], BoundField)
        assert.strictEqual(l[0].key, 'key')
        assert.instanceOf(l[1], BoundField)
        assert.strictEqual(l[1].key, 'status')
    })

    /** @test {fields} */
    it('accepts Field instances as values', function() {
        const field = fields({key: Field.forValue('abc')})[0]
        assert.throws(
            () => field.validate('not abc'))
    })

    /** @test {fields} */
    it('accepts BoundField instances as values and creates rekeyed copies', function() {
        const field = fields({key: BoundField.forValue('not_key', 'abc')})[0]
        assert.strictEqual(field.key, 'key')
        assert.throws(
            () => field.validate('not abc'))
    })

    /** @test {fields} */
    it('creates type-validated fields', function() {
        const field = fields({key: 'number'})[0]
        assert.throws(
            () => field.validate('abc'),
            ValidationError)
    })

    /** @test {fields} */
    it('creates fields with no special serialization', function() {
        const field = fields({key: 'number'})[0]
        assert.strictEqual(field.serialize('abc'), 'abc')
    })
})


describe('_MessageSerializer', function() {
    it('throws if constructed with more than one object per field name', function() {
        const e = assert.throws(
            () => new _MessageSerializer(
                [BoundField.create('akey', x => x, ''),
                 BoundField.create('akey', x => x, ''),
                 BoundField.create('message_type', x => x, '')]),
            Error)
        assert.include(e.message, 'Duplicate')
    })

    it('throws if constructed with both `message_type` and `action_type`', function() {
        const e = assert.throws(
            () => new _MessageSerializer(
                [BoundField.create('message_type', x => x, ''),
                 BoundField.create('action_type', x => x, '')]))
        assert.include(e.message, 'either')
        assert.include(e.message, 'not both')
    })

    it('throws if constructed without either `message_type` or `action_type`', function() {
        const e = assert.throws(() => new _MessageSerializer([]))
        assert.include(e.message, 'must have either')
    })

    it('throws if constructed with `task_level`', function() {
        const e = assert.throws(
            () => new _MessageSerializer(
                [BoundField.create('message_type', x => x, ''),
                 BoundField.create('task_level', x => x, '')]))
        assert.include(e.message, 'task_level is reserved')
    })

    it('throws if constructed with `task_uuid`', function() {
        const e = assert.throws(
            () => new _MessageSerializer(
                [BoundField.create('message_type', x => x, ''),
                 BoundField.create('task_uuid', x => x, '')]))
        assert.include(e.message, 'task_uuid is reserved')
    })

    it('throws if constructed with `timestamp`', function() {
        const e = assert.throws(
            () => new _MessageSerializer(
                [BoundField.create('message_type', x => x, ''),
                 BoundField.create('timestamp', x => x, '')]))
        assert.include(e.message, 'timestamp is reserved')
    })

    it('throws if constructed with any `_`-prefixed field', function() {
        const e = assert.throws(
            () => new _MessageSerializer(
                [BoundField.create('message_type', x => x, ''),
                 BoundField.create('_key', x => x, '')]))
        assert.include(e.message, 'must not start with "_"')
    })

    it('throws if not constructed with BoundField instances', function() {
        const field = BoundField.create('a_key', x => x),
              arg = new Field(x => x),
              e = assert.throws(
                  () => new _MessageSerializer([field, arg]))
        assert.include(e.message, 'Expected a BoundField')
    })

    describe('#serialize', function() {
        it('serializes all values in a dictionary using the defined fields', function() {
            const serializer = new _MessageSerializer(
                [BoundField.forValue('message_type', 'mymessage', 'The type'),
                 BoundField.create('length', x => x.length, 'The length of a thing')]),
                  message = {message_type: 'mymessage',
                             length: 'thething'}
            serializer.serialize(message)
            assert.deepEqual(
                message,
                {message_type: 'mymessage',
                 length: 8})
        })

        it('leaves unknown fields unchanged', function() {
            const serializer = new _MessageSerializer(
                [BoundField.forValue('message_type', 'mymessage', 'The type'),
                 BoundField.create('length', x => x.length, 'The length of a thing')]),
                  message = {message_type: 'mymessage',
                             length: 'thething',
                             extra: 123}
            serializer.serialize(message)
            assert.deepEqual(
                message,
                {message_type: 'mymessage',
                 length: 8,
                 extra: 123})
        })
    })
})


describe('MessageType', function() {
    const messageType = () => MessageType(
        'myapp:mysystem',
        [BoundField.forTypes('key', ['number'], ''),
         BoundField.forTypes('value', ['number'], '')],
        'A message type')

    describe('#validate', function() {
        it('throws if the dictionary has no `message_type`', function() {
            const mtype = messageType(),
                  e = assert.throws(
                      () => mtype._serializer.validate({key: 1, value: 2}))
            assert.include(e.message, 'message_type is missing')
        })

        it('throws if the dictionary has the wrong `message_type`', function() {
            const mtype = messageType(),
                  e = assert.throws(
                      () => mtype._serializer.validate(
                          {key: 1,
                           value: 2,
                           message_type: 'wrong'}))
            assert.include(e.message, 'Field must be myapp:mysystem')
        })

        it('throws if the dictionary has an unknown field', function() {
            const mtype = messageType(),
                  e = assert.throws(
                      () => mtype._serializer.validate(
                          {key: 1,
                           value: 2,
                           message_type: 'myapp:mysystem',
                           extra: 'hello'}))
            assert.include(e.message, 'Unexpected field: extra')
        })

        it('throws if one of the fields fails validation', function() {
            const mtype = messageType(),
                  e = assert.throws(
                      () => mtype._serializer.validate(
                          {key: 1,
                           value: null,
                           message_type: 'myapp:mysystem'}))
            assert.include(e.message, 'to be one of: number')
        })

        it('does not throw if the dictionary has any standard fields', function() {
            const mtype = messageType()
            mtype._serializer.validate(
                {key: 1,
                 value: 2,
                 message_type: 'myapp:mysystem',
                 task_level: '/',
                 task_uuid: '123',
                 timestamp: 'xxx'})
        })
    })

    describe('calling it', function() {
        it('creates a new Message with the inherited serializer', function() {
            const mtype = messageType(),
                  msg = mtype()
            assert.strictEqual(mtype._serializer, msg._serializer)
        })

        it('creates a new Message with the given fields', function() {
            const mtype = messageType(),
                  msg = mtype({key: 2, value: 3})
            assert.deepEqual(
                msg._fields,
                {message_type: mtype.messageType,
                 key: 2,
                 value: 3})
        })
    })

    it('stores the description', function() {
        assert.strictEqual(messageType().description, 'A message type')
    })

    it('description is optional', function() {
        const mtype = MessageType('name', [])
        assert.strictEqual(mtype.description, '')
    })
})


describe('ActionType', function() {
    const actionType = () => ActionType(
        'myapp:mysystem:myaction',
        [BoundField.forTypes('key', ['number'], '')],
        [BoundField.forTypes('value', ['number'], '')],
        'An action type')

    function commonActionTypeTests(validMessage, serializer) {
        describe('#validate', function() {
            it('throws if the dictionary has no `action_type`', function() {
                const atype = actionType(),
                      msg = validMessage()
                delete msg['action_type']
                const e = assert.throws(
                    () => serializer(atype).validate(msg))
                assert.include(e.message, 'action_type is missing')
            })

            it('throws if the dictionary has the wrong `action_type`', function() {
                const atype = actionType(),
                      msg = validMessage()
                msg['action_type'] = 'xxx'
                const e = assert.throws(
                    () => serializer(atype).validate(msg))
                assert.include(e.message, 'must be myapp:mysystem:myaction')
            })

            it('throws if the dictionary is missing a field', function() {
                const atype = actionType(),
                      msg = validMessage()
                let removed = null
                for (const key in msg) {
                    if (key !== 'action_type') {
                        delete msg[key]
                        removed = key
                        break
                    }
                }
                const e = assert.throws(
                    () => serializer(atype).validate(msg))
                assert.include(e.message, `${removed} is missing`)
            })

            it('throws if one of the fields fails validation', function() {
                const atype = actionType(),
                      msg = validMessage()
                let removed = null
                for (const key in msg) {
                    if (key !== 'action_type') {
                        msg[key] = new Object()
                        removed = key
                        break
                    }
                }
                const e = assert.throws(
                    () => serializer(atype).validate(msg))
                assert.include(e.message, `${removed}: `)
            })

            it('does not throw if the dictionary includes standard fields', function() {
                const atype = actionType(),
                      msg = Object.assign(validMessage(), {task_level: '/',
                                                           task_uuid: '123',
                                                           timestamp: 'xxx'})
                serializer(atype).validate(msg)
            })
        })
    }

    describe('start message', function() {
        const validMessage = function() {
            return {action_type: 'myapp:mysystem:myaction',
                    action_status: 'started',
                    key: 1}
        }
        const serializer = function(actionType) {
            return actionType._serializers.start
        }

        commonActionTypeTests(validMessage, serializer)

        it('throws if the dictionary has an extra field', function() {
            const atype = actionType(),
                  msg = validMessage()
            msg['extra'] = 'nope'
            const e = assert.throws(
                () => serializer(atype).validate(msg))
            assert.include(e.message, 'Unexpected field: extra')
        })
    })

    describe('success message', function() {
        const validMessage = function() {
            return {action_type: 'myapp:mysystem:myaction',
                    action_status: 'succeeded',
                    value: 2}
        }
        const serializer = function(actionType) {
            return actionType._serializers.success
        }

        commonActionTypeTests(validMessage, serializer)

        it('throws if the dictionary has an extra field', function() {
            const atype = actionType(),
                  msg = validMessage()
            msg['extra'] = 'nope'
            const e = assert.throws(
                () => serializer(atype).validate(msg))
            assert.include(e.message, 'Unexpected field: extra')
        })
    })

    describe('failure message', function() {
        const validMessage = function() {
            return {action_type: 'myapp:mysystem:myaction',
                    action_status: 'failed',
                    exception: 'Error',
                    reason: 'because'}
        }
        const serializer = function(actionType) {
            return actionType._serializers.failure
        }

        commonActionTypeTests(validMessage, serializer)

        it('does not throw if the dictionary has an extra field', function() {
            const atype = actionType(),
                  msg = validMessage()
            msg['extra'] = 'nope'
            serializer(atype).validate(msg)
        })
    })

    it('validates child actions using the child validator', function() {
        const logger = new MemoryLogger(),
              A = ActionType(
                  'myapp:foo', [BoundField.forTypes('a', ['number'], '')], [], ''),
              B = ActionType(
                  'myapp:bar', [BoundField.forTypes('b', ['number'], '')], [], '')

        withAction(A({a: 1}, logger), () => {
            withAction(B({b: 2}, logger), () => {})
        })
        logger.validate()
    })


    it('stores the description', function() {
        assert.strictEqual(actionType().description, 'An action type')
    })

    it('description is optional', function() {
        const atype = ActionType('name', [], [])
        assert.strictEqual(atype.description, '')
    })

    describe('end-to-end', function() {
        const ACTION = ActionType(
            'myapp:myaction',
            [BoundField.forTypes('key', ['number'], 'The key')],
            [BoundField.forTypes('result', ['string'], 'The result')],
            'An action for testing')

        it('logs the correct start message', function() {
            const logger = new MemoryLogger()
            withAction(ACTION({key: 123}, logger), action => {
                action.addSuccessFields({result: 'foo'})
            })
            assert.strictEqual(logger.messages[0].key, 123)
        })

        it('can log to the default logger', function() {
            const messages = [],
                  remove = addDestination(x => messages.push(x))
            withAction(ACTION({key: 123}), action => {
                action.addSuccessFields({result: 'foo'})
            })
            assert.strictEqual(messages[0].key, 123)
            remove()
        })

        it('incorrect start messages will throw', function() {
            const logger = new MemoryLogger()
            withAction(ACTION({key: 'nope'}, logger), action => {
                action.addSuccessFields({result: 'foo'})
            })
            assert.throws(() => logger.validate(), ValidationError)
        })

        it('correct success message is logged', function() {
            const logger = new MemoryLogger()
            withAction(ACTION({key: 123}, logger), action => {
                action.addSuccessFields({result: 'foo'})
            })
            assert.strictEqual(logger.messages[1].result, 'foo')
        })

        it('incorrect success message throws', function() {
            const logger = new MemoryLogger()
            withAction(ACTION({key: 123}, logger), action => {
                action.addSuccessFields({result: 999})
            })
            assert.throws(() => logger.validate(), ValidationError)
        })

        it('correct failure message is logged', function() {
            const logger = new MemoryLogger()
            assert.throws(
                () => {
                    withAction(ACTION({key: 123}, logger), action => {
                        throw new TypeError('Nope')
                    })
                },
                TypeError)
            assert.strictEqual(logger.messages[1].reason, 'TypeError: Nope')
        })
    })
})
