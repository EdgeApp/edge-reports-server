import { assert, expect } from 'chai'
import { describe, it } from 'mocha'

import {
  createQuarterBuckets,
  movingAveDataSort,
  sevenDayDataMerge
} from '../lib/util'
import { fixtures } from './utilFixtures.js'

// add case with 1, 2, 3, 4 month bucket

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

describe('movingAveDataSort', () => {
  for (const testCase of fixtures.movingAveDataSort) {
    it(testCase.testDescription, () => {
      // Arrange
      const inputData = testCase.inputData
      const expectedType = testCase.outputType
      const expectedOutput = testCase.expectedOutput
      // Act
      const actualResult = movingAveDataSort(inputData)
      // Assert
      assert.typeOf(actualResult, expectedType)
      assert.deepEqual(actualResult, expectedOutput)
    })
  }
})

describe('sevenDayDataMerge', () => {
  for (const testCase of fixtures.sevenDayDataMerge) {
    it(testCase.testDescription, () => {
      // Arrange
      const inputData = testCase.inputData
      const expectedType = testCase.outputType
      const expectedOutput = testCase.expectedOutput
      // Act
      const actualResult = sevenDayDataMerge(inputData)
      // Assert
      assert.typeOf(actualResult, expectedType)
      assert.deepEqual(actualResult, expectedOutput)
    })
  }
})
