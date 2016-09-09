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
                           'Array',
                           'Object',
                           'boolean', 'Boolean')


export class ValidationError extends ExtendableError {
    constructor(reason, message) {
        super(message)
        this.reason = reason
    }
}


export class Field {
    constructor(serializer, description='', extraValidator=null) {
        this.description = description
        this._serializer = serializer
        this._extraValidator = extraValidator
    }

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

    validate(input) {
        this._serializer(input)
        if (this._extraValidator !== null) {
            this._extraValidator(input)
        }

    }

    serialize(input) {
        return this._serializer(input)
    }
}


export class BoundField {
    static create(key, ...args) {
        return new BoundField(key, new Field(...args))
    }

    static forValue(key, ...args) {
        return new BoundField(key, Field.forValue(...args))
    }

    static forTypes(key, ...args) {
        return new BoundField(key, Field.forTypes(...args))
    }

    constructor(key, field) {
        this.key = key
        this.field = field
    }

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


export class _MessageSerializer {
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
        this.fields = Map(fields.map(f => [f.key, f]))
        this.allowAdditionalFields = allowAdditionalFields
    }

    serialize(message) {
        for (const [key, field] of this.fields.entries()) {
            message[key] = field.serialize(message[key])
        }
    }

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


function _ActionSerializers(start, success, failure) {
    return {start, success, failure}
}


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
          _serializers = new _ActionSerializers(
              new _MessageSerializer(_start),
              new _MessageSerializer(_success),
              new _MessageSerializer(_failure, true)),
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
