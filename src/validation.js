import {Set, Map} from 'immutable'
import typeName from 'type-name'
import ExtendableError from 'es6-error'
import {Message,
        TASK_LEVEL_FIELD,
        TASK_UUID_FIELD,
        TIMESTAMP_FIELD,
        REASON_FIELD,
        TRACEBACK_FIELD,
        EXCEPTION_FIELD,
        MESSAGE_TYPE_FIELD} from './message'
import {startAction,
        startTask,
        ACTION_TYPE_FIELD,
        ACTION_STATUS_FIELD,
        STARTED_STATUS,
        SUCCEEDED_STATUS,
        FAILED_STATUS} from './action'


const RESERVED_FIELDS = [TASK_LEVEL_FIELD, TASK_UUID_FIELD, TIMESTAMP_FIELD],
      _JSON_TYPES = Set.of('null',
                           'number', 'Number',
                           'string', 'String',
                           'array', 'Array',
                           'object', 'Object',
                           'boolean', 'Boolean')


/**
 * A field value failed validation.
 */
export class ValidationError extends ExtendableError {
    constructor(reason, message) {
        super(message)
        this.reason = reason
    }
}


/**
 * An unnamed field that can accept rich types and serialize them to the logging
 * system's basic types.
 *
 * An optional extra validation function can be used to validate inputs when
 * unit testing.
 */
export class Field {
    /**
     * Create a `Field`.
     *
     * @param {function(input: *): *} serializer Function that takes a single
     * rich input and returns a serialized value that can be written out as
     * JSON. It may also throw {@link ValidationError} to indicate bad input.
     * @param {string} [description] Description of what this field contains.
     * @param {function(value: *)} [extraValidator] Optional function that takes
     * a field value and raises {@link ValidationError} if the value is
     * incorrect for that field.
     */
    constructor(serializer, description='', extraValidator=null) {
        /**
         * Description of what this field contains.
         * @type {string}
         */
        this.description = description
        this._serializer = serializer
        this._extraValidator = extraValidator
    }

    /**
     * Factory that creates a `Field` that can have only a single value.
     *
     * @param {*} value Allowed value for the field.
     * @param {string} description Description of what this field contains.
     * @return {Field} The field.
     */
    static forValue(value, description) {
        return new Field(
            () => value,
            description,
            input => {
                if (input !== value) {
                    throw new ValidationError(
                        input, `Field must be ${value}`)
                }
            })
    }

    /**
     * Factory that creates a `Field` that must be an instance of one of the
     * specified basic types.
     *
     * @param {string[]} types Array of allowed type names. Supported values
     * are: `null`, `number`, `string, `array`, `object`, `boolean`.
     * @param {string} description Description of what this field contains.
     * @param {function(value: *)} [extraValidator] Optional function that takes
     * a field value and raises {@link ValidationError} if the value is
     * incorrect for that field.
     * @return {Field} The field.
     */
    static forTypes(types, description, extraValidator=null) {
        let fixedTypes = []
        for (const t of types) {
            if (!_JSON_TYPES.has(t)) {
                throw new TypeError(`${t} is not JSON-encodable`)
            }
            fixedTypes.push(t)
        }
        fixedTypes = Set(fixedTypes)
        return new Field(
            x => x,
            description,
            input => {
                if (!fixedTypes.has(typeName(input))) {
                    throw new ValidationError(
                        input,
                        `Field requires type to be one of: ${types}`)
                } else if (extraValidator !== null) {
                    extraValidator(input)
                }
            })
    }

    /**
     * Validate an input against this field definition.
     *
     * @param {*} input Input value supposedly serializable by this field.
     * @throws {ValidationError} If the input is not serializable or fails to be
     * validated by the extra validator.
     */
    validate(input) {
        this._serializer(input)
        if (this._extraValidator !== null) {
            this._extraValidator(input)
        }

    }

    /**
     * Convert an input to a value that can be logged.
     *
     * @param {*} input Input value serializable by this field.
     * @return {*} Serialized value.
     */
    serialize(input) {
        return this._serializer(input)
    }
}


/**
 * A named field that can accept rich types and serialize them to the logging
 * system's basic types.
 *
 * An optional extra validation function can be used to validate inputs when
 * unit testing.
 */
export class BoundField {
    /**
     * Factory that creates a {@link Field} and binds it to a key.
     *
     * @param {string} key Name of the field, the key which refers to it.
     * @param {...*} args Arguments for `Field` constructor.
     * @return {Field} The field.
     * @see {@link Field}
     */
    static create(key, ...args) {
        return new BoundField(key, new Field(...args))
    }

    /**
     * Factory that creates a `BoundField` that can have only a single value.
     *
     * @param {string} key Name of the field, the key which refers to it.
     * @param {...*} args Arguments for {@link Field.forValue}.
     * @return {Field} The field.
     * @see {@link Field.forValue}
     */
    static forValue(key, ...args) {
        return new BoundField(key, Field.forValue(...args))
    }

    /**
     * Factory that creates a `BoundField` that must be an instance of one of
     * the specified basic types.
     *
     * @param {string} key Name of the field, the key which refers to it.
     * @param {...*} args Arguments for {@link Field.forTypes}.
     * @return {Field} The field.
     */
    static forTypes(key, ...args) {
        return new BoundField(key, Field.forTypes(...args))
    }

    /**
     * Create a `BoundField`.
     *
     * @param {string} key Name of the field, the key which refers to it.
     * @param {Field} field Field to bind to a name.
     */
    constructor(key, field) {
        /**
         * Name of the field, the key which refers to it.
         * @type {string}
         */
        this.key = key
        /**
         * Field being bound.
         * @type {Field}
         */
        this.field = field
    }

    /**
     * Validate an input against this field definition.
     *
     * @param {*} input Input value supposedly serializable by this field.
     * @throws {ValidationError} If the input is not serializable or fails to be
     * validated by the extra validator.
     */
    validate(input) {
        try {
            this.field.validate(input)
        } catch (e) {
            if (e instanceof ValidationError) {
                throw new ValidationError(e.reason, `${this.key}: ${e.message}`)
            } else {
                throw e
            }
        }
    }

    /**
     * Convert an input to a value that can be logged.
     *
     * @param {*} input Input value serializable by this field.
     * @return {*} Serialized value.
     */
    serialize(input) {
        return this.field.serialize(input)
    }
}


const REASON = BoundField.forTypes(
    REASON_FIELD, ['string', 'String'], 'The reason for an event.')
const TRACEBACK = BoundField.forTypes(
    TRACEBACK_FIELD, ['string', 'String'], 'The traceback for an exception.')
const EXCEPTION = BoundField.forTypes(
    EXCEPTION_FIELD, ['string', 'String'], 'The name of an exception.')


/**
 * A serializer and validator for messages.
 */
export class _MessageSerializer {
    /**
     * Create a `_MessageSerializer`.
     *
     * @param {object<string,BoundField>} fields Mapping of field names to
     * `BoundField` instances.
     * @param {boolean} allowAdditionalFields Allow additional fields, thus
     * preventing a validation failure?
     */
    constructor(fields, allowAdditionalFields=false) {
        const keys = []
        for (let field of fields) {
            if (!(field instanceof BoundField)) {
                throw new TypeError(
                    `Expected a BoundField instance but got ${field.toString()}`)
            } else if (/^_/.test(field.key)) {
                throw new Error([field, 'Field names must not start with "_"'])
            }
            keys.push(field.key)
        }
        if (Set(keys).size !== keys.length) {
            throw new Error([Set(keys).toString(), 'Duplicate field name'])
        }
        if (keys.indexOf(ACTION_TYPE_FIELD) !== -1) {
            if (keys.indexOf(MESSAGE_TYPE_FIELD) !== -1) {
                throw new Error('Messages must have either "action_type" or ' +
                                '"message_type" not both')
            }
        } else if (keys.indexOf(MESSAGE_TYPE_FIELD) === -1) {
            throw new Error('Messages must have either "action_type" or ' +
                            '"message_type"')
        }
        for (const reserved of RESERVED_FIELDS) {
            if (keys.indexOf(reserved) !== -1) {
                throw new Error(
                    `The field name ${reserved} is reserved for use by the ` +
                    `logging framework`)
            }
        }
        /**
         * Mapping of field names to `BoundField` instances.
         * @type {object<string,BoundField>}
         */
        this.fields = Map(fields.map(f => [f.key, f]))
        /**
         * Allow additional fields, thus preventing a validation failure?
         * @type {boolean}
         */
        this.allowAdditionalFields = allowAdditionalFields
    }

    /**
     * Serialize a message in-place, converting inputs to outputs.
     *
     * @param {MessageDictionary} message Message dictionary.
     */
    serialize(message) {
        for (const [key, field] of this.fields.entries()) {
            message[key] = field.serialize(message[key])
        }
    }

    /**
     * Validate a message dictionary.
     *
     * @param {MessageDictionary} message Message dictionary.
     * @throws {ValidationError} If the message has the wrong fields or one of
     * the fields fail validation.
     */
    validate(message) {
        for (const [key, field] of this.fields.entries()) {
            const value = message[key]
            if (value === undefined) {
                throw new ValidationError(key, `Field ${key} is missing`)
            }
            field.validate(value)
        }
        if (!this.allowAdditionalFields) {
            const fieldSet = Set(this.fields.keys()).union(RESERVED_FIELDS)
            for (const key of Object.keys(message)) {
                if (!fieldSet.has(key)) {
                    throw new ValidationError(key, `Unexpected field: ${key}`)
                }
            }
        }
    }
}


/**
 * A specific type of a non-action message.
 *
 * @example
 * // Schema definition.
 * const KEY = BoundField.create('key', ['number'], 'Lookup key for things'),
 *       STATUS = BoundField.create('status', ['number'], 'Status of things'),
 *       LOG_STATUS = MessageType('myapp:mysys:status', [KEY, STATUS],
 *                                'The status of something was set.')
 * function setStatus(key, status) {
 *   doTheActualSetting(key, status)
 *   LOG_STATUS({key, status}).write()
 * }
 *
 * @param {string} messageType Name of the type.
 * @param {BoundField[]} fields Array of fields which can appear in this message
 * type.
 * @param {string} [description] Optional description of this message type.
 * @return {function(fields: MessageDictionary): Message} Message factory for
 * this type.
 * @property {string} messageType Name of the type.
 * @property {string} description Description of this message type.
 */
export function MessageType(messageType, fields, description='') {
    const _serializer = new _MessageSerializer(
        fields.concat([
            BoundField.forValue(
                MESSAGE_TYPE_FIELD, messageType, 'The message type.')])),
          call = (fields={}) => {
              fields[MESSAGE_TYPE_FIELD] = messageType
              return new Message(fields, _serializer)
          }
    call.messageType = messageType
    call.description = description
    call._serializer = _serializer
    return call
}


/**
 * Collection of serializers for the various action states.
 *
 * @typedef {object} _ActionSerializers
 * @property {_MessageSerializer} start Serializer for action start messages.
 * @property {_MessageSerializer} success Serializer for action success
 * messages.
 * @property {_MessageSerializer} failure Serializer for action failure
 * messages.
 */


/**
 * {@link ActionType} result.
 *
 * @typedef {function(fields: MessageDictionary, logger: ?Logger): Action}
 * ActionTypeCallable
 */


/**
 * A specific type of action.
 *
 * @example
 * // Schema definition.
 * const KEY = BoundField.create('key', ['number'], 'Lookup key for things'),
 *       RESULT = BoundField.create('result', ['string'], 'Result of lookups'),
 *       LOG_DOSOMETHING = ActionType(
 *         'myapp:mysys:dosomething',
 *         [KEY],
 *         [RESULT],
 *         'Do something with a key, resulting in a value.')
 * function doSomething(key) {
 *   withAction(LOG_DOSOMETHING({key}), action => {
 *     const result = doTheThing(key)
 *     action.addSuccessFields({result})
 *     return result
 *   })
 * }
 *
 * @param {string} actionType Name of the type.
 * @param {BoundField[]} startFields Array of fields which can appear in the
 * action's start message.
 * @param {BoundField[]} successFields Array of fields which can appear in the
 * action's success message.
 * @param {string} [description] Optional description of this message type.
 * @return {ActionTypeCallable} Action factory for this type.
 * @property {string} actionType Name of the type.
 * @property {string} description Description of this message type.
 * @property {ActionTypeCallable} asTask Start a new action of this type as a
 * task, i.e. a top-level action.
 */
export function ActionType(actionType, startFields, successFields,
                           description='') {
    const actionTypeField = BoundField.forValue(
              ACTION_TYPE_FIELD, actionType, 'The action type'),
          makeActionStatusField = value => BoundField.forValue(
              ACTION_STATUS_FIELD, value, 'The action status'),
          _start = startFields.concat(
              actionTypeField,
              makeActionStatusField(STARTED_STATUS)),
          _success = successFields.concat(
              actionTypeField,
              makeActionStatusField(SUCCEEDED_STATUS)),
          _failure = [actionTypeField,
                      makeActionStatusField(FAILED_STATUS),
                      REASON,
                      EXCEPTION],
          _serializers = {start: new _MessageSerializer(_start),
                          success: new _MessageSerializer(_success),
                          failure: new _MessageSerializer(_failure, true)},
          call = (fields={}, logger=null) => {
              return startAction(logger, actionType, fields, _serializers)
          }

    call.actionType = actionType
    call.description = description
    call._serializers = _serializers
    call.asTask = (fields={}, logger=null) => {
        return startTask(logger, actionType, _serializers, fields)
    }
    return call
}


/**
 * Factory for {@link MessageType} and {@link ActionType} field definitions.
 *
 * @param {object<string,BoundField|Field|string>} fields Mapping of field
 * names to existing `BoundField`s, `Field`s or JSON-serializable type names.
 * @return {Array<BoundField>} Field definitions.
 */
export function fields(fields) {
    const result = []
    for (const key of Object.keys(fields).sort()) {
        let field,
            value = fields[key]
        if (value instanceof BoundField) {
            field = value.field
        } else if (value instanceof Field) {
            field = value
        } else {
            field = Field.forTypes([value], '')
        }
        result.push(new BoundField(key, field))
    }
    return result
}
