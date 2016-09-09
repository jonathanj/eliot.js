import {assert} from 'chai'

import * as _context from '../src/context'
import {_ExecutionContext} from '../src/context'


describe('_ExecutionContext', function() {
    describe('#current', function() {
        /** @test {_ExecutionContext#current} */
        it('returns null if no action has been pushed', function() {
            const ctx = new _ExecutionContext()
            assert.strictEqual(ctx.current(), null)
        })

        /** @test {_ExecutionContext#current} */
        it('returns the action passed to push, assuming no pops', function() {
            const ctx = new _ExecutionContext(),
                  a = new Object()
            ctx.push(a)
            assert.strictEqual(ctx.current(), a)
        })

        /** @test {_ExecutionContext#current} */
        it('returns the action passed to the last push call, assuming no pops', function() {
            const ctx = new _ExecutionContext(),
                  a = new Object(),
                  b = new Object()
            ctx.push(a)
            ctx.push(b)
            assert.strictEqual(ctx.current(), b)
        })

        /** @test {_ExecutionContext#current} */
        it('returns the same result after multiple calls', function() {
            const ctx = new _ExecutionContext(),
                  a = new Object()
            ctx.push(a)
            ctx.current()
            assert.strictEqual(ctx.current(), a)
        })
    })

    describe('#pop', function() {
        /** @test {_ExecutionContext#pop} */
        it('cancels a push', function() {
            const ctx = new _ExecutionContext(),
                  a = new Object()
            ctx.push(a)
            ctx.pop()
            assert.strictEqual(ctx.current(), null)
        })

        /** @test {_ExecutionContext#pop} */
        it('cancels the last push, returning the context to its previous state', function() {
            const ctx = new _ExecutionContext(),
                  a = new Object(),
                  b = new Object()
            ctx.push(a)
            ctx.push(b)
            ctx.pop()
            assert.strictEqual(ctx.current(), a)
        })
    })

    it('has a global instance', function() {
        assert.instanceOf(_context._context, _ExecutionContext)
    })
})
