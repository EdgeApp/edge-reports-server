import { expect } from 'chai'
import { describe, it } from 'mocha'

import { getAnalytics } from '../src/apiAnalytics'
import {
  inputFour,
  inputOne,
  inputThree,
  inputTwo,
  outputFour,
  outputOne,
  outputThree,
  outputTwo
} from './testData.json'

describe('apiAnalytics function tests', function() {
  it('A Real Coinswitch Query for Month of July 2020', function() {
    expect(
      JSON.stringify(
        getAnalytics(inputOne, 1594023608, 1596055300, 'coinswitch', 'month')
      )
    ).equals(JSON.stringify(outputOne))
  })
  it('Create All 3 Buckets', function() {
    expect(
      JSON.stringify(
        getAnalytics(
          inputTwo,
          1300000000,
          1300070000,
          'dummy',
          'month|day|hour'
        )
      )
    ).equals(JSON.stringify(outputTwo))
  })
  it('Leap Year Test', function() {
    expect(
      JSON.stringify(
        getAnalytics(inputThree, 1708992000, 1709424000, 'dummy', 'day|hour')
      )
    ).equals(JSON.stringify(outputThree))
  })
  it('Year Rollover', function() {
    expect(
      JSON.stringify(
        getAnalytics(inputFour, 1672444800, 1706918400, 'dummy', 'month')
      )
    ).equals(JSON.stringify(outputFour))
  })
})
