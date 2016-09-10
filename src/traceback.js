import ErrorStackParser from 'error-stack-parser'
import {BoundField, MessageType} from './validation'
import {EXCEPTION_FIELD, REASON_FIELD, TRACEBACK_FIELD} from './message'


export const TRACEBACK_MESSAGE = MessageType(
    'eliot_js:traceback',
    [BoundField.create(REASON_FIELD, e => e.toString(), 'The exception value.'),
     BoundField.create(TRACEBACK_FIELD, x => x, 'The traceback.'),
     BoundField.create(EXCEPTION_FIELD, x => x, 'The exception type name.')],
    'An unexpected exception indicating a bug.')
// The fields here are actually subset of what you might get in practice, due to
// exception extraction, so we hackily modify the serializer:
TRACEBACK_MESSAGE._serializer.allowAdditionalFields = true


function writeTracebackMessage(logger, error) {
    let msg = TRACEBACK_MESSAGE({
        reason: error,
        traceback: ErrorStackParser.parse(error).map(
            f => f.toString()).join('\n'),
        exception: error.name})
    // XXX: Registering custom exception info extractor is not supported yet.
    //msg = msg.bind(XXX)
    msg.write(logger)
}


/**
 * Write a traceback to the log.
 *
 * @param {Error} error Error whose traceback will be loged.
 * @param {?ILogger} [logger] Optional logger to write to, if not provided the
 * default logger will be used.
 */
export function writeTraceback(error, logger=null) {
    writeTracebackMessage(logger, error)
}
