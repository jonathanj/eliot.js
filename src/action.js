import uuid from 'uuid'

import {_context, currentAction} from './context'
import {Message,
        TASK_UUID_FIELD,
        EXCEPTION_FIELD,
        REASON_FIELD} from './message'


export const ACTION_STATUS_FIELD = 'action_status'
export const ACTION_TYPE_FIELD = 'action_type'

export const STARTED_STATUS = 'started'
export const SUCCEEDED_STATUS = 'succeeded'
export const FAILED_STATUS = 'failed'

export const VALID_STATUSES = (STARTED_STATUS, SUCCEEDED_STATUS, FAILED_STATUS)


/**
 * The location of a message within the tree of actions of a task.
 */
export class TaskLevel {
    /**
     * @param {number[]} level Task levels.
     */
    constructor(level) {
        /**
         * Each item indicates a child relationship and the value indicates
         * message count. For example `[2, 3]` is the third message within an
         * action which is the second item in the task.
         * @type {number[]}
         */
        this.level = level
    }

    /**
     * Convert a serialized string to a `TaskLevel`.
     *
     * @param {string} s Output of `TaskLevel.toString`.
     * @return {TaskLevel} Parsed task level.
     */
    static fromString(s) {
        return new TaskLevel(s
                             .split('/')
                             .filter(x => !!x)
                             .map(x => parseInt(x, 10)))
    }

    /**
     * Convert to a string.
     *
     * @return {string} String representation of the task level.
     */
    toString() {
        return '/' + this.level.join('/')
    }

    /**
     * Return the next task level that is at the same level as this task but one
     * later.
     *
     * @return {TaskLevel} Next sibling task level.
     */
    nextSibling() {
        const level = Array.from(this.level)
        level.push(level.pop() + 1)
        return new TaskLevel(level)
    }

    /**
     * Return a child of this task level.
     *
     * @return {TaskLevel} New child task level.
     */
    child() {
        const level = Array.from(this.level)
        level.push(1)
        return new TaskLevel(level)
    }

    /**
     * Parent of this task level.
     *
     * @return {?TaskLevel} Parent of this task level or `null` if there
     * isn't one.
     */
    parent() {
        return (this.level.length > 0
                ? new TaskLevel(this.level.slice(0, this.level.length - 1))
                : null)
    }

    /**
     * Is this task a sibling of `taskLevel`?
     *
     * @param {TaskLevel} taskLevel Task level to compare against.
     * @return {boolean} Is this a sibling?
     */
    isSiblingOf(taskLevel) {
        return this.parent().toString() === taskLevel.parent().toString()
    }
}


/**
 * Part of a nested hierarchy of ongoing actions.
 *
 * An action has a start and an end; a message is logged for each.
 */
export class Action {
    /**
     * @param {Logger} logger Logger to write messages to.
     * @param {string} taskUuid UUID of the top-level task.
     * @param {TaskLevel} taskLevel Action's task level.
     * @param {string} actionType Type of action.
     * @param {?_ActionSerializers} [serializers] Action serializers.
     */
    constructor(logger, taskUuid, taskLevel, actionType, serializers=null) {
        /**
         * Fields to be included in the successful finish message.
         * @type {Object.<string,BoundField>}
         */
        this._successFields = {}
        this._logger = logger
        this._taskLevel = taskLevel
        this._lastChild = null
        /**
         * Fields identifying this action.
         * @type {Object.<string,BoundField>}
         */
        this._identification = {[TASK_UUID_FIELD]: taskUuid,
                                [ACTION_TYPE_FIELD]: actionType}
        this._serializers = serializers
        /**
         * Has this action finished?
         * @type {boolean}
         */
        this._finished = false
    }

    /**
     * Start a new action which is part of a serialized task.
     *
     * @param {string} taskId Serialized task identifier, the output of
     * `Action.serializeTaskId`.
     * @param {Logger} [logger] Logger to write messages to, or `null` to
     * use the default one.
     * @return {Action} Started action.
     */
    static continueTask(taskId, logger=null) {
        const [uuid, level] = taskId.split('@'),
              action = new Action(logger,
                                  uuid,
                                  TaskLevel.fromString(level),
                                  'eliot_js:remote_task')
        action._start({})
        return action
    }

    /**
     * Create a unique identifier for the current location within the task.
     *
     * @return {string} Identifier of the current location within the task.
     */
    serializeTaskId() {
        const uuid = this._identification[TASK_UUID_FIELD],
              level = this._nextTaskLevel().toString()
        return `${uuid}@${level}`
    }

    /**
     * Next task level for messages within this action.
     *
     * Called whenever a message is logged within the context of an action.
     *
     * @return {TaskLevel} Next task level.
     */
    _nextTaskLevel() {
        return this._lastChild = (this._lastChild === null
                                  ? this._taskLevel.child()
                                  : this._lastChild.nextSibling())
    }

    /**
     * Log the start message.
     *
     * The action identification fields and any additional fields will be
     * logged.
     *
     * @param {MessageDictionary} fields Fields being logged.
     */
    _start(fields) {
        fields[ACTION_STATUS_FIELD] = STARTED_STATUS
        Object.assign(fields, this._identification)
        const serializer = (this._serializers === null
                            ? null
                            : this._serializers.start),
              msg = new Message(fields, serializer)
        msg.write(this._logger, this)
    }

    /**
     * Log the finish message.
     *
     * The action's identification fields, additional fields and status and
     * additional fields will be logged. In the event of an exception, details
     * of the exception will be logged.
     *
     * @param {Error} [error] Error the action finished with.
     */
    finish(error=null) {
        if (this._finished) {
            return
        }
        this._finished = true
        let fields, serializer = null
        if (error === null) {
            fields = this._successFields
            fields[ACTION_STATUS_FIELD] = SUCCEEDED_STATUS
            if (this._serializers !== null) {
                serializer = this._serializers.success
            }
        } else {
            fields = {} // XXX: Get fields for exception?
            fields[EXCEPTION_FIELD] = error.name
            fields[REASON_FIELD] = error.toString()
            fields[ACTION_STATUS_FIELD] = FAILED_STATUS
            if (this._serializers !== null) {
                serializer = this._serializers.failure
            }
        }
        Object.assign(fields, this._identification)
        const msg = new Message(fields, serializer)
        msg.write(this._logger, this)
    }

    /**
     * Create a child action.
     *
     * @param {Logger} logger Logger to write messages to.
     * @param {string} actionType Type of the child action.
     * @param {?_ActionSerializers} [serializers] Action serializers.
     * @return {Action} Child action.
     */
    child(logger, actionType, serializers=null) {
        return new Action(
            logger,
            this._identification[TASK_UUID_FIELD],
            this._nextTaskLevel(),
            actionType,
            serializers)
    }

    /**
     * Run the given function with this action as its execution context.
     *
     * @param {function} f Function called within the context of this action.
     * @param {...*} args Additional arguments to pass to `f`.
     * @return {*} Result of calling `f`.
     */
    run(f, ...args) {
        _context.push(this)
        try {
            return f(...args)
        } finally {
            _context.pop()
        }
    }

    /**
     * Add fields to be included in the result message when the action finishes
     * successfully.
     *
     * @param {object.<string,*>} fields Additional fields to add to the
     * result message.
     */
    addSuccessFields(fields) {
        Object.assign(this._successFields, fields)
    }
}


/**
 * Create a child {@link Action}, figuring out the parent action from the execution
 * context and log the start message.
 *
 * For best results combine with {@link withAction}.
 *
 * @param {?Logger} [logger] Logger to write messages to.
 * @param {string} [actionType] Type of action.
 * @param {object.<string,*>} [fields] Additional fields to add to the start
 * message.
 * @param {?_ActionSerializers} [_serializers] Action serializers.
 * @return {Action} New action.
 */
export function startAction(logger=null, actionType='', fields={},
                            _serializers=null) {
    const parent = currentAction()
    if (parent === null) {
        return startTask(logger, actionType, fields, _serializers)
    }
    const action = parent.child(logger, actionType, _serializers)
    action._start(fields)
    return action
}


/**
 * Like `startAction` but creates a new top-level `Action`.
 *
 * @param {?Logger} logger Logger to write messages to.
 * @param {string} actionType Type of action.
 * @param {MessageDictionary} fields Additional fields to add to the start
 * message.
 * @param {?_ActionSerializers} _serializers Action serializers.
 * @return {Action} New action.
 */
export function startTask(logger=null, actionType='', fields={},
                          _serializers=null) {
    const action = new Action(
        logger, uuid.v4(), new TaskLevel([]), actionType, _serializers)
    action._start(fields)
    return action
}


/**
 * Run a function within the context of an action.
 *
 * Nesting uses of `withAction` is encouraged to promote more meaningful log
 * structure. The action will be started before running the function and
 * finished after it completes.
 *
 * @example
 * withAction(SOME_ACTION({f1: x, f2: y}), action => {
 *   // Run some code within the context of the action.
 * })
 *
 * @param {Action} action Action to use.
 * @param {function(action: Action): *} f Function called with a single `Action`
 * argument.
 * @param {...*} args Additional arguments to pass to `f`.
 * @return {*} Result of `f`.
 */
export function withAction(action, f, ...args) {
    try {
        const result = action.run(() => f(action, ...args))
        action.finish()
        return result
    } catch (e) {
        action.finish(e)
        throw e
    }
}
