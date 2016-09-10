import uuid from 'uuid'

import {currentAction} from './context'

export const MESSAGE_TYPE_FIELD = 'message_type'
export const TASK_UUID_FIELD = 'task_uuid'
export const TASK_LEVEL_FIELD = 'task_level'
export const TIMESTAMP_FIELD = 'timestamp'
export const EXCEPTION_FIELD = 'exception'
export const REASON_FIELD = 'reason'
export const TRACEBACK_FIELD = 'traceback'


/**
 * Message dictionary as provided to the various logging facilities.
 *
 * @typedef {object<string,*>} MessageDictionary
 */


/**
 * A log message.
 *
 * Messages are basically dictionaries mapping "fields" to "values". Field names
 * should not start with `_`, as those are reserved for system use.
 */
export class Message {
    /**
     * Create a new message.
     *
     * @param {MessageDictionary} fields Message fields.
     * @param {?_MessageSerializer} _serializer Message serializer.
     * @return {Message} New message.
     */
    static create(fields={}, _serializer=null) {
        return new Message(fields, _serializer)
    }

    /**
     * Write a new message to the default logger.
     *
     * @param {MessageDictionary} fields Message fields.
     */
    static log(fields={}) {
        Message.create(fields).write()
    }

    constructor(fields, serializer=null) {
        this._fields = Object.assign({}, fields)
        this._serializer = serializer
        this._time = Message._time
    }

    /**
     * Bind this message's contents and additional fields to a new message.
     *
     * @param {MessageDictionary} fields Message fields.
     * @return {Message} New message with bound fields.
     */
    bind(fields) {
        return new Message(
            Object.assign({}, this._fields, fields), this._serializer)
    }

    /**
     * Return a copy of the message contents.
     *
     * @return {MessageDictionary} Message contents.
     */
    contents() {
        return Object.assign({}, this._fields)
    }

    /**
     * Return the current time.
     *
     * @return {number} Timestamp in seconds.
     */
    _timestamp() {
        return this._time()
    }

    /**
     * Freeze this message for logging, registering it with `action`.
     *
     * @param {?Action} [action] Optional action which is the context of this
     * message, if `null` the current action will be used.
     * @return {MessageDictionary} Message dictionary with `timestamp`,
     * `task_uuid` and `task_level` fields added.
     */
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

    /**
     * Write the message to a logger.
     *
     * @param {?Logger} [logger] Optional logger to write to.
     * @param {?Action} [action] Optional action which is the context of this
     * message, if `null` the current action will be used.
     */
    write(logger=null, action=null) {
        if (logger === null) {
            const {_DEFAULT_LOGGER} = require('./output')
            logger = _DEFAULT_LOGGER
        }
        logger.write(this._freeze(action), this._serializer)
    }
}

Message._time = () => (new Date()).getTime() / 1000
