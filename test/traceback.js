import ErrorStackParser from 'error-stack-parser'

import {writeTraceback} from '../src/traceback'
import {assertContainsFields, captureLogging} from '../src/testing'


describe('writeTraceback', function() {
    /** @test {writeTrackback} */
    it('writes the current traceback to the log',
       captureLogging(this)(function(logger) {
           let caughtException = null,
               traceback = null
           try {
               throw new Error('Nope')
           } catch (e) {
               traceback = ErrorStackParser.parse(e).map(
                   f => f.toString()).join('\n'),
               writeTraceback(e, logger)
               caughtException = e
           }
           assertContainsFields(
               logger.messages[0],
               {message_type: 'eliot_js:traceback',
                exception: 'Error',
                reason: caughtException,
                traceback: traceback})
           logger.flushTracebacks(Error)
       }))

    /** @test {writeTrackback} */
    it('writes to the default log', function() {
        captureLogging(this)(function(logger) {
            try {
                throw new Error('Nope')
            } catch (e) {
                writeTraceback(e)
            }
            assertContainsFields(
                logger.messages[0],
                {message_type: 'eliot_js:traceback'})
            logger.flushTracebacks(Error)
        })
    })
})
