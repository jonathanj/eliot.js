import {assert} from 'chai'

import {toConsole} from '../src/destinations'
import {Message} from '../src/message'
import {addDestination} from '../src/output'
import {assertContainsFields} from '../src/testing'


describe('toConsole', function() {
    /** @test {toConsole} */
    it('performs a noop if no suitable method is found', function() {
        const messages = [],
              remove = addDestination(toConsole({}))
        Message.create({x: 123}).write()
        remove()
        assert.deepEqual(messages, [])
    })

    /** @test {toConsole} */
    it('falls back to `console.log`', function() {
        const messages = [],
              console = {log: x => messages.push(x)},
              remove = addDestination(toConsole(console))
        Message.create({x: 123}).write()
        remove()
        assertContainsFields(
            messages[0],
            {x: 123})
    })

    /** @test {toConsole} */
    it('logs to `console.info`', function() {
        const messages = [],
              console = {info: x => messages.push(x)},
              remove = addDestination(toConsole(console))
        Message.create({x: 123}).write()
        remove()
        assertContainsFields(
            messages[0],
            {x: 123})
    })
})
