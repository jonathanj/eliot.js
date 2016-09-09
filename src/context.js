/**
 * Stack-based context, storing the current `Action`.
 */
export class _ExecutionContext {
    constructor() {
        this._stack = []
    }

    /**
     * Push an action to the front of the stack.
     *
     * @param {Action} action Action that will be used for log messages and as
     * the parent of newly creation actions.
     */
    push(action) {
        this._stack.push(action)
    }

    /**
     * Pop the front action from the stack.
     */
    pop() {
        this._stack.pop()
    }

    /**
     * Get the current front action.
     *
     * @return {Action|null} Current front action, or `null` if there is none.
     */
    current() {
        if (this._stack.length === 0) {
            return null
        }
        return this._stack[this._stack.length - 1]
    }
}


/** Global `_ExecutionContext`. */
export const _context = new _ExecutionContext()


/**
 * Global current front `Action`.
 * @return {Action|null} Current front action.
 */
export function currentAction() {
    return _context.current()
}
