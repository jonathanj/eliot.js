import uuid from 'uuid'

import {currentAction} from './context'

export const MESSAGE_TYPE_FIELD = 'message_type'
export const TASK_UUID_FIELD = 'task_uuid'
export const TASK_LEVEL_FIELD = 'task_level'
export const TIMESTAMP_FIELD = 'timestamp'
export const EXCEPTION_FIELD = 'exception'
export const REASON_FIELD = 'reason'
export const TRACEBACK_FIELD = 'traceback'


export class Message {
    static create(fields={}, _serializer=null) {
        return new Message(fields, _serializer)
    }

    static log(fields={}) {
        return Message.create(fields).write()
    }

    constructor(fields, serializer=null) {
        this._fields = Object.assign({}, fields)
        this._serializer = serializer
        this._time = Message._time
    }

    bind(fields) {
        return new Message(
            Object.assign({}, this._fields, fields), this._serializer)
    }

    contents() {
        return Object.assign({}, this._fields)
    }

    _timestamp() {
        return this._time()
    }

    _freeze(action=null) {
        if (action === null) {
            action = currentAction()
        }
        const [task_uuid, task_level] = (
            action === null
                ? [uuid.v4(), [1]]
                : [action._identification[TASK_UUID_FIELD],
                   action._nextTaskLevel().level])
        return Object.assign(
            {},
            this._fields,
            {[TIMESTAMP_FIELD]: this._timestamp(),
             [TASK_UUID_FIELD]: task_uuid,
             [TASK_LEVEL_FIELD]: task_level})
    }

    write(logger=null, action=null) {
        if (logger === null) {
            const {_DEFAULT_LOGGER} = require('./output')
            logger = _DEFAULT_LOGGER
        }
        logger.write(this._freeze(action), this._serializer)
    }
}

Message._time = () => (new Date()).getTime() / 1000
