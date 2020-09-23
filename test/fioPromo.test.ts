import { expect } from 'chai'
import { describe, it } from 'mocha'

import { checkDomain, getRewards, sendRewards } from '../src/bin/fioPromo/fioLookup'

const testAddress: Array<[string,boolean]> = [
  ['FIO5MctVjvoTiEFPyJYNnPerAXHWRUhDe2ZNEDCj43ngU4W5jZXzA', false],
  ['FIO8TPpos3a8TVp9k4KaByrTw5sh2N1QuS4ro4gc4ooBczEPvTNNU', false]
]

const fixtures = {
  getRewards: {
    data: [
      {
        status: 'complete',
        orderId:
          'a8b6d763d35d3b753fb987493adef15c3d5d47b77b7e98e0fb2aefacff7ddc81',
        depositTxid:
          'a8b6d763d35d3b753fb987493adef15c3d5d47b77b7e98e0fb2aefacff7ddc81',
        depositAddress: 'qp3xryh97c7wnqyz0k5csc38fuwa2m3acszwvurnuf',
        depositCurrency: 'BCH',
        depositAmount: 0.13699,
        payoutTxid:
          '7fa2600f4b14a7e7b093e4ec3d65a9409681de6b48a26b5559e89b31b9eead58',
        payoutAddress: 'FIO8bToxvXGj1kK2W5yQoTxvhbrHRRtXu8EHokoaeB9mb9NFrAXu9',
        payoutCurrency: 'FIO',
        payoutAmount: 124.40797699,
        timestamp: 1598908235.759,
        isoDate: '2020-08-31T21:10:35.759Z',
        usdValue: undefined,
        rawTx: {
          status: 'finished',
          payinHash:
            'a8b6d763d35d3b753fb987493adef15c3d5d47b77b7e98e0fb2aefacff7ddc81',
          payoutHash:
            '7fa2600f4b14a7e7b093e4ec3d65a9409681de6b48a26b5559e89b31b9eead58',
          payinAddress: 'qp3xryh97c7wnqyz0k5csc38fuwa2m3acszwvurnuf',
          payoutAddress: 'FIO8bToxvXGj1kK2W5yQoTxvhbrHRRtXu8EHokoaeB9mb9NFrAXu9',
          fromCurrency: 'bch',
          toCurrency: 'fio',
          amountSend: 0.13699,
          amountReceive: 124.40797699,
          refundAddress: '1Q2ELFFGHSRTBsu5iyy7SsPHzxTn3EF91s',
          id: '448d034310d690',
          updatedAt: '2020-08-31T21:10:35.759Z'
        }
      }
    ],
    expected: {
      "FIO8bToxvXGj1kK2W5yQoTxvhbrHRRtXu8EHokoaeB9mb9NFrAXu9": 40,/*
      "FIO8gcjB4tTfTHvjWjc1RQwLGpxk8vCzbxZujhiPvURx527xVrEkS": 40,
      "FIO6oPCnk7SNSnAAXFM1nS1qv8kNsBXnaHLXDfMBjEh6r2U3kQ5PY": 40,
      "FIO7vXvbZnkAodCj8Huw4dhFiu4VkPaTexpvLcxJVQmU2CtfzkAoD": 40 // Personal test address*/
    }
  },
  sendRewards: {
    data: [
      {
        'FIO7vXvbZnkAodCj8Huw4dhFiu4VkPaTexpvLcxJVQmU2CtfzkAoD': 40
      }
    ],
    expected: {

    }
  }
}



describe('Checking if address has Edge domain', function () {
  for (const fixture of testAddress) {
    it(`Check FIO public address: ${fixture[0]}`, async function () {
      const result = await checkDomain(fixture[0], 'fiotestnet')
      expect(result).equals(fixture[1])
    })
  }
})

describe('Checking rewards function', function () {
    it(`Check reward for single transaction`, function () {
      expect(getRewards(fixtures.getRewards.data)).to.deep.
        equals(fixtures.getRewards.expected)
    })
})

describe('Checking spend transaction', function () {
  it('Sending from test wallet to same test wallet', async function () {
    const result = await sendRewards(fixtures.sendRewards.data[0])
    expect(result).equals(fixtures.sendRewards.expected)
  })
})
