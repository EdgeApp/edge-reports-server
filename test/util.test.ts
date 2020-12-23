import { expect } from 'chai'
import { describe, it } from 'mocha'

import { createQuarterBuckets } from '../src/util'

const date = new Date(Date.now())

// add case with 1, 2, 3, 4 month bucket
const fixtures = {
  createQuarterBuckets: {
    'Check empty month buckets': {
      test: {
        result: {
          hour: [],
          day: [],
          month: [],
          numAllTxs: 0
        },
        app: 'shsrth',
        pluginId: 'erthe',
        start: date.getTime() - 100000,
        end: date.getTime()
      },
      expected: [
        {
          start: 0,
          usdValue: 0,
          numTxs: 0,
          isoDate: date.toISOString(),
          currencyCodes: {},
          currencyPairs: {}
        }
      ]
    }
  }
}
const { createQuarterBuckets: quarterFixtures } = fixtures
describe.skip('createQuarterBuckets', function() {
  for (const fixture in quarterFixtures) {
    const { test, expected } = quarterFixtures[fixture]
    it(`${fixture}`, function() {
      const result = createQuarterBuckets(test)
      expect(result).to.deep.equal(expected)
    })
  }
})
