/**
 * Obtain a global attribute from either the browser or Node environments.
 *
 * @param {string} attr Attribute name.
 * @return {*} Attribute value.
 * @throws {Error} If the environment cannot be determined.
 */
function _global(attr) {
    if (typeof window !== 'undefined') {
        return window[attr]
    } else if (typeof global !== 'undefined') {
        return global[attr]
    }
    throw new Error('Unknown environment')
}


/**
 * Obtain a reasonable console destination function.
 *
 * @param {object} _console Something that looks like a `Console` object.
 * @return {function} Console destination function, this may potentially be a
 * no-op if no suitable method can be found on `_console`.
 */
function _consoleDestination(_console) {
    const noop = (...args) => null
    if (_console !== undefined) {
        return _console.info || _console.log || noop
    }
    return noop
}


/**
 * A logging destination that uses the `Console` API.
 *
 * @param {object} [_console] Something that looks like a `Console` object.
 * @return {function} Logging destination, suitable for use with {@link
 * addDestination}.
 */
export function toConsole(_console=_global('console')) {
    const destination = _consoleDestination(_console)
    return msg => destination(msg)
}
