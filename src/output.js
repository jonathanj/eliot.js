import ExtendableError from 'es6-error'

import {writeTraceback, TRACEBACK_MESSAGE} from './traceback'
import {Message,
        EXCEPTION_FIELD,
        MESSAGE_TYPE_FIELD,
        REASON_FIELD} from './message'


export class _DestinationsSendError extends ExtendableError {
    constructor(errors) {
        super()
        this.errors = errors
    }

    toString() {
        return `${this.name}: ${this.errors.length} errors:
${this.errors.map(x => x.toString()).join('\n')}`
    }
}


/**
 * Manage a list of destinations for message dictionaries.
 *
 * The global instance of this object is where `Logger` instances will
 * send written messages.
 */
export class Destinations {
    constructor() {
        this._destinations = []
        this._globalFields = {}
    }

    addGlobalFields(fields) {
        Object.assign(this._globalFields, fields)
    }

    send(message) {
        message = Object.assign(message, this._globalFields)
        const errors = []
        for (const dest of this._destinations) {
            try {
                dest(message)
            } catch (e) {
                errors.push(e)
            }
        }
        if (errors.length > 0) {
            throw new _DestinationsSendError(errors)
        }
    }

    /**
     * Add a new message destination.
     *
     * A destination should never ever throw an exception. Seriously. A
     * destination should not mutate the message it is given.
     *
     * @param {function} destination Function that takes a message dictionary.
     * @return {function} Function that removes `destination`.
     */
    add(destination) {
        this._destinations.push(destination)
        return () => this.remove(destination)
    }

    remove(destination) {
        const index = this._destinations.indexOf(destination)
        if (index === -1) {
            throw new Error('Unknown destination')
        }
        this._destinations.splice(index, 1)
    }
}


export const _destinations = new Destinations()


/**
 * Add a new message destination.
 *
 * @see {@link Destinations#add}
 */
export function addDestination(...args) {
    return _destinations.add(...args)
}


/**
 * Write out messages to the globally configured destination(s).
 */
export class Logger {
    constructor(destinations=_destinations) {
        this._destinations = _destinations
    }

    write(dict, serializer=null) {
        dict = Object.assign({}, dict)
        try {
            if (serializer !== null) {
                serializer.serialize(dict)
            }
        } catch (e) {
            writeTraceback(e, this)
            const msg = new Message({
                [MESSAGE_TYPE_FIELD]: 'eliot_js:serialization_failure',
                message: JSON.stringify(dict)})
            msg.write(this)
            return
        }

        try {
            this._destinations.send(dict)
        } catch (e) {
            if (e instanceof _DestinationsSendError) {
                for (const ee of e.errors) {
                    try {
                        const msg = new Message({
                            [MESSAGE_TYPE_FIELD]: 'eliot_js:destination_failure',
                            [REASON_FIELD]: ee.toString(),
                            [EXCEPTION_FIELD]: ee.name,
                            'message': JSON.stringify(dict)})
                        this._destinations.send(msg._freeze())
                    } catch (e) {
                        // Raising an exception to the caller will break
                        // business logic, better to not do that even if it
                        // means logging is broken.
                        // XXX: maybe turn this off in production or something?
                        if (console.error !== undefined) {
                            console.error('Exception in exception handler', e)
                        }
                    }
                }
            } else {
                throw e
            }
        }
    }
}

export const _DEFAULT_LOGGER = new Logger()


export class MemoryLogger {
    constructor() {
        this.reset()
    }

    flushTracebacks(errorType) {
        const result = [],
              remaining = []
        for (const message of this.tracebackMessages) {
            if (message[REASON_FIELD] instanceof errorType) {
                result.push(message)
            } else {
                remaining.push(message)
            }
        }
        this.tracebackMessages = remaining
        return result
    }

    write(dict, serializer=null) {
        this.messages.push(dict)
        this.serializers.push(serializer)
        if (serializer === TRACEBACK_MESSAGE._serializer) {
            this.tracebackMessages.push(dict)
        }
    }

    validate() {
        const n = Math.min(this.messages.length, this.serializers.length)
        for (let i = 0; i < n; ++i) {
            const dict = Object.assign({}, this.messages[i]),
                  serializer = this.serializers[i]
            if (serializer !== null && serializer !== undefined) {
                serializer.validate(dict)
                serializer.serialize(dict)
            }
        }
    }

    serialize() {
        const n = Math.min(this.messages.length, this.serializers.length),
              result = []
        for (let i = 0; i < n; ++i) {
            const dict = Object.assign({}, this.messages[i]),
                  serializer = this.serializers[i]
            serializer.serialize(dict)
            result.push(dict)
        }
        return result
    }

    reset() {
        this.messages = []
        this.serializers = []
        this.tracebackMessages = []
    }
}
